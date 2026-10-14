import { beforeEach, expect, it, vi } from "vitest";
import { scanReceiptImage } from "../src/features/payments/receipt-ocr.native";
const { pick, extract, removed } = vi.hoisted(() => ({
  pick: vi.fn(),
  extract: vi.fn(),
  removed: [] as string[],
}));
vi.mock("expo-document-picker", () => ({ getDocumentAsync: pick }));
vi.mock("expo-text-extractor", () => ({
  isSupported: true,
  extractTextFromImage: extract,
}));
vi.mock("expo-file-system", () => ({
  Paths: { cache: { uri: "file:///cache/" } },
  File: class {
    exists = true;
    constructor(readonly uri: string) {}
    delete() {
      removed.push(this.uri);
    }
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  removed.length = 0;
  pick.mockResolvedValue({
    canceled: false,
    assets: [
      {
        name: "receipt.png",
        uri: "file:///cache/picked.png",
        mimeType: "image/png",
        size: 100,
      },
    ],
  });
  extract.mockResolvedValue(["Total PHP 123.00", "Reference 001234"]);
});
it("reads the selected native image and deletes only its temporary copy", async () => {
  expect(await scanReceiptImage({ signal: new AbortController().signal })).toBe(
    "Total PHP 123.00\nReference 001234",
  );
  expect(extract).toHaveBeenCalledWith("file:///cache/picked.png");
  expect(removed).toEqual(["file:///cache/picked.png"]);
  pick.mockResolvedValue({
    canceled: false,
    assets: [
      {
        name: "receipt.png",
        uri: "file:///photos/original.png",
        mimeType: "image/png",
        size: 100,
      },
    ],
  });
  await scanReceiptImage({ signal: new AbortController().signal });
  expect(removed).toEqual(["file:///cache/picked.png"]);
});
it("cleans up rejected and unreadable files", async () => {
  extract.mockRejectedValue(new Error("Unreadable image"));
  await expect(
    scanReceiptImage({ signal: new AbortController().signal }),
  ).rejects.toThrow("Unreadable image");
  expect(removed).toEqual(["file:///cache/picked.png"]);
  pick.mockResolvedValue({
    canceled: false,
    assets: [
      {
        name: "huge.png",
        uri: "file:///cache/huge.png",
        mimeType: "image/png",
        size: 11 * 1024 * 1024,
      },
    ],
  });
  await expect(
    scanReceiptImage({ signal: new AbortController().signal }),
  ).rejects.toThrow(/10 MiB/);
  expect(removed).toEqual([
    "file:///cache/picked.png",
    "file:///cache/huge.png",
  ]);
});
