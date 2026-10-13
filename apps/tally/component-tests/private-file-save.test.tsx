import { saveFile } from "../src/features/attachments/files.native";
const mockCreate = jest.fn(),
  mockWrite = jest.fn(),
  mockDelete = jest.fn(),
  mockShare = jest.fn();
let mockAvailable: Promise<boolean>;
jest.mock("expo-sharing", () => ({
  isAvailableAsync: () => mockAvailable,
  shareAsync: (...args: unknown[]) => mockShare(...args),
}));
jest.mock("expo-crypto", () => ({ randomUUID: () => "id" }));
jest.mock("expo-file-system", () => ({
  Paths: { cache: "cache" },
  File: class {
    uri = "cache/file";
    exists = true;
    create = mockCreate;
    write = mockWrite;
    delete = mockDelete;
  },
}));
beforeEach(() => {
  for (const fn of [mockCreate, mockWrite, mockDelete, mockShare])
    fn.mockReset();
  mockAvailable = Promise.resolve(true);
});
it("does not write or share the previous account's file after a deferred capability check", async () => {
  let resolve!: (available: boolean) => void;
  mockAvailable = new Promise((done) => {
    resolve = done;
  });
  let active = true;
  const saving = saveFile(
    new Uint8Array([1, 2, 3]),
    "records.json",
    "application/json",
    () => {
      if (!active) throw new Error("Account changed");
    },
  );
  active = false;
  resolve(true);
  await expect(saving).rejects.toThrow("Account changed");
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockWrite).not.toHaveBeenCalled();
  expect(mockShare).not.toHaveBeenCalled();
});
it("removes the temporary private file even when the system share fails", async () => {
  mockShare.mockRejectedValue(new Error("Share cancelled"));
  await expect(
    saveFile(new Uint8Array([1]), "receipt.pdf", "application/pdf", () => {}),
  ).rejects.toThrow("Share cancelled");
  expect(mockDelete).toHaveBeenCalledTimes(1);
});
