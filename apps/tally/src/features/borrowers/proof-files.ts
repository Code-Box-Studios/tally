import * as Picker from "expo-document-picker";
import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import { Platform } from "react-native";
import type { TallyRepository } from "../../core/backend/repository";
import { type Data, text } from "../../core/domain/records";
import { saveFile } from "../attachments/files";

const maxBytes = 10 * 1024 * 1024;
const types = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
function encode(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192)
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(binary);
}
export async function addProofFile(
  repo: TallyRepository,
  ownerId: string,
  shareId: string,
  submissionId: string,
) {
  repo.check();
  const picked = await Picker.getDocumentAsync({
    type: types,
    multiple: false,
    base64: false,
    copyToCacheDirectory: true,
  });
  if (picked.canceled) return;
  const asset = picked.assets[0];
  let file: File | null = null,
    bytes: Uint8Array | null = null;
  try {
    if (Platform.OS !== "web") file = new File(asset.uri);
    repo.check();
    if (
      !asset.size ||
      asset.size > maxBytes ||
      !asset.mimeType ||
      !types.includes(asset.mimeType)
    )
      throw new Error("Choose a JPEG, PNG, WebP or PDF up to 10 MiB.");
    bytes =
      Platform.OS === "web" && asset.file
        ? new Uint8Array(await asset.file.arrayBuffer())
        : await file!.bytes();
    repo.check();
    if (bytes.length !== asset.size)
      throw new Error("The file changed. Choose it again.");
    const checksum = [
      ...new Uint8Array(
        await Crypto.digest(
          Crypto.CryptoDigestAlgorithm.SHA256,
          bytes.slice().buffer,
        ),
      ),
    ]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const key = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      JSON.stringify([
        ownerId,
        shareId,
        submissionId,
        asset.name,
        asset.mimeType,
        checksum,
      ]),
    );
    const scope = { ownerId, shareId, submissionId };
    const reservation = await repo.invoke("borrowerReserveAttachment", {
      ...scope,
      commandId: `reserve-${key}`,
      payload: {
        filename: asset.name,
        contentType: asset.mimeType,
        sizeBytes: bytes.length,
        sha256: checksum,
      },
    });
    repo.check();
    if (
      typeof reservation.attachmentId !== "string" ||
      !Number.isSafeInteger(reservation.revision)
    )
      throw new Error(
        "File reservation needs verification. Choose the same file to retry.",
      );
    await repo.invoke("borrowerUploadAttachment", {
      ...scope,
      commandId: `upload-${key}`,
      payload: {
        attachmentId: reservation.attachmentId,
        expectedRevision: reservation.revision,
        contentBase64: encode(bytes),
      },
    });
    repo.check();
  } finally {
    bytes?.fill(0);
    if (file?.exists) file.delete();
    if (Platform.OS === "web" && asset.uri.startsWith("blob:"))
      URL.revokeObjectURL(asset.uri);
  }
}

export async function downloadProofFile(
  repo: TallyRepository,
  ownerId: string,
  shareId: string,
  submissionId: string,
  file: Data,
) {
  const response = await repo.invoke("borrowerDownloadAttachment", {
    ownerId,
    shareId,
    submissionId,
    commandId: Crypto.randomUUID(),
    payload: { attachmentId: text(file, "attachmentId") },
  });
  repo.check();
  if (
    response.attachmentId !== file.attachmentId ||
    typeof response.contentBase64 !== "string" ||
    response.contentBase64.length > Math.ceil(maxBytes / 3) * 4
  )
    throw new Error("Private file could not be verified.");
  const bytes = Uint8Array.from(atob(response.contentBase64), (character) =>
    character.charCodeAt(0),
  );
  try {
    if (
      bytes.length !== file.sizeBytes ||
      !types.includes(text(file, "contentType"))
    )
      throw new Error("Private file could not be verified.");
    await saveFile(
      bytes,
      text(file, "filename"),
      text(file, "contentType"),
      () => repo.check(),
    );
  } finally {
    bytes.fill(0);
  }
}
