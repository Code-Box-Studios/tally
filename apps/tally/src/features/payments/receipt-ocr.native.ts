import { File, Paths } from "expo-file-system";
import type { DocumentPickerAsset } from "expo-document-picker";
import {
  abortable,
  pickReceiptImage,
  type ReceiptScanOptions,
} from "./receipt-image";

function releaseImage(asset: DocumentPickerAsset) {
  // Only remove the copy created by our picker, never the user's source image.
  if (!asset.uri.startsWith(Paths.cache.uri)) return;
  try {
    const file = new File(asset.uri);
    if (file.exists) file.delete();
  } catch {
    /* Cache cleanup must not replace the OCR result. */
  }
}

export async function scanReceiptImage(
  options: ReceiptScanOptions,
): Promise<string | null> {
  let extractor: typeof import("expo-text-extractor");
  try {
    extractor = await import("expo-text-extractor");
  } catch {
    throw new Error(
      "Receipt scanning needs an updated Tally app build. You can enter payment details manually.",
    );
  }
  if (!extractor.isSupported)
    throw new Error(
      "Receipt scanning is unavailable on this device. Enter payment details manually.",
    );
  const asset = await pickReceiptImage(options, releaseImage);
  if (!asset) return null;
  try {
    options.onProgress?.("Reading text on this device…");
    const lines = await abortable(
      extractor.extractTextFromImage(asset.uri),
      options.signal,
    );
    return lines.join("\n");
  } finally {
    releaseImage(asset);
  }
}
