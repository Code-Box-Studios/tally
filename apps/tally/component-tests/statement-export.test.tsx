import { buildStatement } from "../src/features/statements/statement";
import { exportStatementPdf } from "../src/features/statements/export-pdf.native";
const mockPrint = jest.fn();
const mockShare = jest.fn();
const mockAvailable = jest.fn();
const mockDelete = jest.fn();
jest.mock("expo-print", () => ({
  printToFileAsync: (...args: unknown[]) => mockPrint(...args),
}));
jest.mock("expo-sharing", () => ({
  isAvailableAsync: () => mockAvailable(),
  shareAsync: (...args: unknown[]) => mockShare(...args),
}));
jest.mock("expo-file-system", () => ({
  File: class {
    exists = true;
    delete() {
      mockDelete();
    }
  },
}));
const statement = buildStatement({
  contact: { id: "alice", data: { name: "Alice" } },
  obligations: [],
  instances: [],
  payments: [],
  cached: false,
  issuedBy: "Jess",
  timezone: "Asia/Manila",
  generatedAt: "2026-10-11T12:00:00Z",
});
beforeEach(() => {
  mockPrint.mockReset();
  mockShare.mockReset();
  mockAvailable.mockReset();
  mockDelete.mockReset();
  mockAvailable.mockResolvedValue(true);
  mockPrint.mockResolvedValue({
    uri: "file:///private/statement.pdf",
    numberOfPages: 1,
  });
  mockShare.mockResolvedValue(undefined);
});
it("exports a PDF and removes the temporary private file after the share sheet closes", async () => {
  await exportStatementPdf(statement, () => {});
  expect(mockPrint).toHaveBeenCalledWith(
    expect.objectContaining({
      html: expect.stringContaining("Statement of account"),
    }),
  );
  expect(mockShare).toHaveBeenCalledWith(
    "file:///private/statement.pdf",
    expect.objectContaining({ mimeType: "application/pdf" }),
  );
  expect(mockDelete).toHaveBeenCalledTimes(1);
});
it("removes the generated PDF even if sharing fails", async () => {
  mockShare.mockRejectedValue(new Error("Share cancelled"));
  await expect(exportStatementPdf(statement, () => {})).rejects.toThrow(
    "Share cancelled",
  );
  expect(mockDelete).toHaveBeenCalledTimes(1);
});
it("blocks a late share after sign-in changes and removes the generated PDF", async () => {
  let active = true;
  mockPrint.mockImplementation(async () => {
    active = false;
    return { uri: "file:///private/statement.pdf", numberOfPages: 1 };
  });
  await expect(
    exportStatementPdf(statement, () => {
      if (!active) throw new Error("Your sign-in changed.");
    }),
  ).rejects.toThrow("Your sign-in changed.");
  expect(mockShare).not.toHaveBeenCalled();
  expect(mockDelete).toHaveBeenCalledTimes(1);
});
