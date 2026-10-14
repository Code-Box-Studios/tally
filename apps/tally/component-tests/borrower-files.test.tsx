import { addProofFile } from "../src/features/borrowers/proof-files";
import type { TallyRepository } from "../src/core/backend/repository";
const mockRemove = jest.fn();
const mockPicked = jest.fn();
jest.mock("expo-document-picker", () => ({
  getDocumentAsync: () => mockPicked(),
}));
jest.mock("expo-file-system", () => ({
  File: class {
    exists = true;
    delete() {
      mockRemove();
    }
  },
}));
jest.mock("../src/features/attachments/files", () => ({ saveFile: jest.fn() }));
it("cleans the selected native cache file when account changes while picker was open", async () => {
  let checks = 0;
  const repo = {
    check: () => {
      if (++checks > 1) throw new Error("Your sign-in changed.");
    },
  } as unknown as TallyRepository;
  mockPicked.mockResolvedValue({
    canceled: false,
    assets: [
      {
        uri: "file:///cache/proof.png",
        name: "proof.png",
        size: 100,
        mimeType: "image/png",
      },
    ],
  });
  await expect(addProofFile(repo, "owner", "share", "proof")).rejects.toThrow(
    "Your sign-in changed.",
  );
  expect(mockRemove).toHaveBeenCalledTimes(1);
});
