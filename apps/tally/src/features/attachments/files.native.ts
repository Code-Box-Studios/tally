import { safeFileName } from "./safe-file-name";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Crypto from "expo-crypto";
export async function saveFile(
  bytes: Uint8Array,
  filename: string,
  mime: string,
  check: () => void,
) {
  check();
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("File sharing is unavailable on this device.");
  check();
  const file = new File(
    Paths.cache,
    Crypto.randomUUID() + "-" + safeFileName(filename),
  );
  try {
    check();
    file.create();
    file.write(bytes);
    check();
    await Sharing.shareAsync(file.uri, {
      mimeType: mime,
      dialogTitle: "Save Tally file",
    });
  } finally {
    if (file.exists) file.delete();
  }
}
