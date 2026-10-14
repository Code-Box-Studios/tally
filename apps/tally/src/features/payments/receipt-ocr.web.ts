import type { DocumentPickerAsset } from "expo-document-picker";
import {
  abortable,
  pickReceiptImage,
  type ReceiptScanOptions,
} from "./receipt-image";

function releaseImage(asset: DocumentPickerAsset) {
  if (asset.uri.startsWith("blob:")) URL.revokeObjectURL(asset.uri);
}

export async function scanReceiptImage(
  options: ReceiptScanOptions,
): Promise<string | null> {
  const asset = await pickReceiptImage(options, releaseImage);
  if (!asset) return null;
  let worker:
    Awaited<ReturnType<typeof import("tesseract.js").createWorker>> | undefined;
  try {
    if (!asset.file)
      throw new Error(
        "This browser could not read the image. Choose the file again.",
      );
    options.onProgress?.(
      "Preparing text recognition. First scan needs a download.",
    );
    const { createWorker } = await abortable(
      import("tesseract.js"),
      options.signal,
    );
    worker = await abortable(
      createWorker("eng", 1, {
        workerPath: "/ocr/v7/worker.min.js",
        corePath: "/ocr/v7/core",
        langPath: "/ocr/v7/lang",
        workerBlobURL: false,
        logger: (progress) => {
          if (!options.signal.aborted)
            options.onProgress?.(
              progress.status === "recognizing text"
                ? `Reading text… ${Math.round(progress.progress * 100)}%`
                : "Preparing text recognition…",
            );
        },
      }),
      options.signal,
      (lateWorker) => {
        void lateWorker.terminate().catch(() => {});
      },
    );
    const result = await abortable(
      worker.recognize(asset.file),
      options.signal,
    );
    return result.data.text;
  } catch (error) {
    if (options.signal.aborted) throw error;
    throw new Error(
      "The image could not be read. Try a clearer screenshot and check your connection for the first scan.",
    );
  } finally {
    try {
      if (worker) await worker.terminate();
    } finally {
      releaseImage(asset);
    }
  }
}
