import * as Picker from "expo-document-picker";
import { File } from "expo-file-system";
import { Platform } from "react-native";

export async function readCsvFile(): Promise<string | null> {
  const result = await Picker.getDocumentAsync({
    type: [
      "text/csv",
      "text/plain",
      "application/csv",
      "application/vnd.ms-excel",
    ],
    multiple: false,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const limit = 2 * 1024 * 1024;
  if (asset.size && asset.size > limit)
    throw new Error("Choose a CSV smaller than 2 MiB.");
  const bytes =
    Platform.OS === "web" && asset.file
      ? new Uint8Array(await asset.file.arrayBuffer())
      : await new File(asset.uri).bytes();
  if (bytes.length > limit) throw new Error("Choose a CSV smaller than 2 MiB.");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Export the spreadsheet as a UTF-8 CSV and try again.");
  }
}
