import { expect, it } from "vitest";
import { safeFileName } from "../src/features/attachments/safe-file-name";
it("keeps native exports inside the temporary cache directory", () => {
  expect(safeFileName("../../private/database.db")).toBe("database.db");
  expect(safeFileName("..\\private\\receipt.pdf")).toBe("receipt.pdf");
});
it("removes control characters and bounds private export names", () => {
  expect(safeFileName("receipt\u0000.pdf")).toBe("receipt_.pdf");
  expect(safeFileName("x".repeat(500)).length).toBe(120);
  expect(safeFileName("..")).toBe("attachment");
});
