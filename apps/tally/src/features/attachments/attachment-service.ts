import * as Picker from "expo-document-picker";
import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import { Platform } from "react-native";
import type { TallyRepository } from "../../core/backend/repository";
import { object, text, type Row } from "../../core/domain/records";
import { privateStore } from "../../core/storage";
import { saveFile } from "./files";
const mimes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const limit = 10 * 1024 * 1024;
function base64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
function decode(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
async function sha(bytes: Uint8Array) {
  return [
    ...new Uint8Array(
      await Crypto.digest(
        Crypto.CryptoDigestAlgorithm.SHA256,
        new Uint8Array(bytes).buffer,
      ),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function addAttachment(
  repo: TallyRepository,
  type: "obligation" | "instance" | "payment",
  targetId: string,
) {
  repo.check();
  const picked = await Picker.getDocumentAsync({
    type: mimes,
    multiple: false,
    copyToCacheDirectory: false,
  });
  repo.check();
  if (picked.canceled) return;
  const asset = picked.assets[0];
  if (
    !asset.size ||
    asset.size > limit ||
    !asset.mimeType ||
    !mimes.includes(asset.mimeType)
  )
    throw new Error("Choose a JPEG, PNG, WebP or PDF up to 10 MiB.");
  const bytes =
    Platform.OS === "web" && asset.file
      ? new Uint8Array(await asset.file.arrayBuffer())
      : await new File(asset.uri).bytes();
  repo.check();
  if (bytes.length !== asset.size || bytes.length > limit)
    throw new Error("File size changed. Choose the file again.");
  try {
    const checksum = await sha(bytes);
    const transferKey =
      repo.prefix +
      "upload:" +
      (await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        JSON.stringify([
          type,
          targetId,
          asset.name,
          asset.mimeType,
          bytes.length,
          checksum,
        ]),
      ));
    const raw = await privateStore.get(transferKey),
      transfer = raw
        ? object(JSON.parse(raw))
        : {
            reserveId: Crypto.randomUUID(),
            uploadId: Crypto.randomUUID(),
            attachmentId: null,
            revision: null,
          };
    repo.check();
    await privateStore.set(transferKey, JSON.stringify(transfer));
    repo.check();
    if (!transfer.attachmentId) {
      const reserved = await repo.command(
        "reserveAttachment",
        {
          targetType: type,
          targetId,
          filename: asset.name,
          contentType: asset.mimeType,
          sizeBytes: bytes.length,
          sha256: checksum,
        },
        String(transfer.reserveId),
      );
      repo.check();
      if (
        typeof reserved.attachmentId !== "string" ||
        !Number.isSafeInteger(reserved.revision) ||
        Number(reserved.revision) < 1
      )
        throw new Error(
          "File reservation could not be verified. Reselect the same file to retry.",
        );
      transfer.attachmentId = reserved.attachmentId;
      transfer.revision = reserved.revision;
      await privateStore.set(transferKey, JSON.stringify(transfer));
      repo.check();
    }
    const uploaded = await repo.command(
      "uploadAttachment",
      {
        attachmentId: transfer.attachmentId,
        expectedRevision: transfer.revision,
        contentBase64: base64(bytes),
      },
      String(transfer.uploadId),
    );
    repo.check();
    if (uploaded.attachmentId !== transfer.attachmentId)
      throw new Error(
        "File upload could not be verified. Reselect the same file to retry.",
      );
    await privateStore.remove(transferKey);
  } finally {
    bytes.fill(0);
  }
  repo.check();
}
export async function downloadAttachment(repo: TallyRepository, row: Row) {
  repo.check();
  if (row.data.userId !== repo.owner || row.data.state !== "ready")
    throw new Error("Choose an owned, ready file.");
  const response = await repo.command(
    "downloadAttachment",
    { attachmentId: row.id },
    Crypto.randomUUID(),
  );
  repo.check();
  if (
    response.attachmentId !== row.id ||
    typeof response.contentBase64 !== "string" ||
    response.contentBase64.length > Math.ceil(limit / 3) * 4
  )
    throw new Error("Private file could not be verified.");
  const bytes = decode(response.contentBase64);
  try {
    if (
      bytes.length !== row.data.sizeBytes ||
      (await sha(bytes)) !== row.data.sha256
    )
      throw new Error("Private file checksum does not match.");
    repo.check();
    await saveFile(
      bytes,
      text(row.data, "filename"),
      text(row.data, "contentType"),
    );
  } finally {
    bytes.fill(0);
  }
}
