import { safeFileName } from "./safe-file-name";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Crypto from "expo-crypto";
export async function saveFile(
  bytes: Uint8Array,
  filename: string,
  mime: string,
) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("File sharing is unavailable on this device.");
  const file = new File(
    Paths.cache,
    Crypto.randomUUID() + "-" + safeFileName(filename),
  );
  try {
    file.create();
    file.write(bytes);
    await Sharing.shareAsync(file.uri, {
      mimeType: mime,
      dialogTitle: "Save private Tally attachment",
    });
  } finally {
    if (file.exists) file.delete();
  }
}
