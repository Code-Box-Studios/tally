import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { scanReceiptImage } from "../src/features/payments/receipt-ocr.web";
const { pick, createWorker, recognize, terminate } = vi.hoisted(() => ({
  pick: vi.fn(),
  createWorker: vi.fn(),
  recognize: vi.fn(),
  terminate: vi.fn(),
}));
vi.mock("expo-document-picker", () => ({ getDocumentAsync: pick }));
vi.mock("tesseract.js", () => ({ createWorker }));

beforeEach(() => {
  vi.clearAllMocks();
  const file = new File([new Uint8Array([137, 80, 78, 71])], "receipt.png", {
    type: "image/png",
  });
  pick.mockResolvedValue({
    canceled: false,
    assets: [
      {
        name: file.name,
        size: file.size,
        mimeType: file.type,
        file,
        uri: "blob:local-image",
      },
    ],
  });
  createWorker.mockResolvedValue({ recognize, terminate });
  recognize.mockResolvedValue({ data: { text: "Total PHP 123.00" } });
  terminate.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());
it("reads a local file with same-origin OCR assets and releases the worker", async () => {
  const text = await scanReceiptImage({ signal: new AbortController().signal });
  expect(text).toBe("Total PHP 123.00");
  expect(createWorker).toHaveBeenCalledWith(
    "eng",
    1,
    expect.objectContaining({
      workerPath: "/ocr/v7/worker.min.js",
      corePath: "/ocr/v7/core",
      langPath: "/ocr/v7/lang",
      workerBlobURL: false,
    }),
  );
  expect(recognize.mock.calls[0][0]).toBeInstanceOf(File);
  expect(terminate).toHaveBeenCalledTimes(1);
});
it("treats cancellation as no draft and rejects oversized or unsupported files before OCR", async () => {
  pick.mockResolvedValueOnce({ canceled: true, assets: null });
  expect(
    await scanReceiptImage({ signal: new AbortController().signal }),
  ).toBeNull();
  pick.mockResolvedValueOnce({
    canceled: false,
    assets: [
      {
        name: "huge.png",
        uri: "blob:huge",
        size: 11 * 1024 * 1024,
        mimeType: "image/png",
      },
    ],
  });
  await expect(
    scanReceiptImage({ signal: new AbortController().signal }),
  ).rejects.toThrow(/10 MiB/);
  pick.mockResolvedValueOnce({
    canceled: false,
    assets: [
      {
        name: "receipt.pdf",
        uri: "blob:pdf",
        size: 123,
        mimeType: "application/pdf",
      },
    ],
  });
  await expect(
    scanReceiptImage({ signal: new AbortController().signal }),
  ).rejects.toThrow(/PNG/);
  expect(createWorker).not.toHaveBeenCalled();
});
it("terminates OCR after a failure", async () => {
  recognize.mockRejectedValue(new Error("unreadable"));
  await expect(
    scanReceiptImage({ signal: new AbortController().signal }),
  ).rejects.toThrow(/read/i);
  expect(terminate).toHaveBeenCalledTimes(1);
});
it("releases the private blob URL even when worker cleanup fails", async () => {
  const revoke = vi.spyOn(URL, "revokeObjectURL");
  terminate.mockRejectedValueOnce(new Error("Worker cleanup failed"));
  await expect(
    scanReceiptImage({ signal: new AbortController().signal }),
  ).rejects.toThrow("Worker cleanup failed");
  expect(revoke).toHaveBeenCalledWith("blob:local-image");
});
it("cancels worker startup and disposes a worker that finishes loading late", async () => {
  let ready!: (value: unknown) => void;
  createWorker.mockImplementation(
    () =>
      new Promise((resolve) => {
        ready = resolve;
      }),
  );
  const controller = new AbortController();
  const scan = scanReceiptImage({ signal: controller.signal });
  const cancelled = expect(scan).rejects.toThrow(/cancel/i);
  await vi.waitFor(() => expect(createWorker).toHaveBeenCalledTimes(1));
  controller.abort();
  await cancelled;
  ready({ recognize, terminate });
  await vi.waitFor(() => expect(terminate).toHaveBeenCalledTimes(1));
  expect(recognize).not.toHaveBeenCalled();
});
