import * as Picker from "expo-document-picker";

export interface ReceiptScanOptions {
  signal: AbortSignal;
  onProgress?: (message: string) => void;
}
export function scanCancelled() {
  return new Error("Receipt scan cancelled.");
}

/** Stop waiting immediately, while still releasing resources produced after cancellation. */
export function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  releaseLate?: (value: T) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(scanCancelled());
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    promise.then(
      (value) => {
        signal.removeEventListener("abort", cancel);
        if (signal.aborted) {
          releaseLate?.(value);
          reject(scanCancelled());
        } else resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", cancel);
        reject(error);
      },
    );
  });
}

export async function pickReceiptImage(
  options: ReceiptScanOptions,
  release: (asset: Picker.DocumentPickerAsset) => void,
) {
  if (options.signal.aborted) throw scanCancelled();
  options.onProgress?.("Choose a receipt image.");
  // Keep this call before any await so browsers retain the button's user activation.
  const picking = Picker.getDocumentAsync({
    type: ["image/jpeg", "image/png", "image/webp"],
    multiple: false,
    base64: false,
    copyToCacheDirectory: true,
  });
  const picked = await abortable(picking, options.signal, (result) => {
    if (!result.canceled) result.assets.forEach(release);
  });
  if (picked.canceled) return null;
  const asset = picked.assets[0];
  try {
    const size = asset.file?.size ?? asset.size;
    if (
      !size ||
      size > 10 * 1024 * 1024 ||
      !["image/jpeg", "image/png", "image/webp"].includes(
        asset.mimeType || asset.file?.type || "",
      )
    )
      throw new Error("Choose a JPEG, PNG or WebP image up to 10 MiB.");
    return asset;
  } catch (error) {
    release(asset);
    throw error;
  }
}
