import { addAttachment } from "../src/features/attachments/attachment-service";
import type { TallyRepository } from "../src/core/backend/repository";
import type { Row } from "../src/core/domain/records";

let mockName = "receipt.pdf";
let mockCancelled = false;
const mockBytes = new Uint8Array([1, 2, 3]);
jest.mock("expo-document-picker", () => ({
  getDocumentAsync: async () => ({
    canceled: mockCancelled,
    assets: [
      { name: mockName, mimeType: "application/pdf", size: 3, uri: "fixture" },
    ],
  }),
}));
jest.mock("expo-file-system", () => ({
  File: class {
    async bytes() {
      return mockBytes.slice();
    }
  },
}));
jest.mock("expo-crypto", () => ({
  randomUUID: () => "new-command",
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digest: async () => new Uint8Array(32).buffer,
  digestStringAsync: async () => "file-key",
}));
jest.mock("../src/features/attachments/files", () => ({
  saveFile: async () => {},
}));

const waiting: Row = {
  id: "reserved-file",
  data: {
    userId: "owner",
    targetType: "obligation",
    targetId: "loan",
    filename: "receipt.pdf",
    state: "awaitingUpload",
    revision: 1,
    declaredContentType: "application/pdf",
    declaredSizeBytes: 3,
    declaredSha256: "0".repeat(64),
  },
};
function repository(intent: Record<string, unknown> | null = null) {
  let saved = intent ? JSON.stringify(intent) : null;
  const command = jest.fn(async (name: string) => {
    if (name !== "uploadAttachment")
      throw new Error("Retry must not reserve another slot");
    return { attachmentId: waiting.id };
  });
  return {
    owner: "owner",
    prefix: "owner:",
    check: jest.fn(),
    command,
    transferIntent: jest.fn(async (_key: string, value?: string | null) => {
      if (value !== undefined) saved = value;
      return saved;
    }),
  };
}
beforeEach(() => {
  mockName = "receipt.pdf";
  mockCancelled = false;
});

it("resumes the reserved file without consuming another attachment slot", async () => {
  const repo = repository({
    reserveId: "original-reserve",
    uploadId: "original-upload",
    attachmentId: waiting.id,
    revision: 1,
  });
  await addAttachment(
    repo as unknown as TallyRepository,
    "obligation",
    "loan",
    waiting,
  );
  expect(repo.command).toHaveBeenCalledTimes(1);
  expect(repo.command).toHaveBeenCalledWith(
    "uploadAttachment",
    expect.objectContaining({ attachmentId: waiting.id, expectedRevision: 1 }),
    "original-upload",
  );
});

it("recovers an awaiting reservation even when the local transfer intent was lost", async () => {
  const repo = repository();
  await addAttachment(
    repo as unknown as TallyRepository,
    "obligation",
    "loan",
    waiting,
  );
  expect(repo.command).toHaveBeenCalledWith(
    "uploadAttachment",
    expect.objectContaining({ attachmentId: waiting.id, expectedRevision: 1 }),
    "new-command",
  );
});

it("recovers a processing upload using its saved server command identity", async () => {
  const repo = repository();
  const processing = {
    ...waiting,
    data: {
      ...waiting.data,
      state: "processing",
      revision: 2,
      uploadCommandId: "original-upload",
      uploadRevision: 1,
      uploadSha256: "0".repeat(64),
    },
  };
  await addAttachment(
    repo as unknown as TallyRepository,
    "obligation",
    "loan",
    processing,
  );
  expect(repo.command).toHaveBeenCalledWith(
    "uploadAttachment",
    expect.objectContaining({ attachmentId: waiting.id, expectedRevision: 1 }),
    "original-upload",
  );
});

it("rejects a different file without reserving or uploading anything", async () => {
  mockName = "different.pdf";
  const repo = repository();
  await expect(
    addAttachment(
      repo as unknown as TallyRepository,
      "obligation",
      "loan",
      waiting,
    ),
  ).rejects.toThrow("Choose the same file");
  expect(repo.command).not.toHaveBeenCalled();
});

it("rejects another owner's reservation before selecting a file", async () => {
  const repo = repository();
  await expect(
    addAttachment(repo as unknown as TallyRepository, "obligation", "loan", {
      ...waiting,
      data: { ...waiting.data, userId: "someone-else" },
    }),
  ).rejects.toThrow("owned");
  expect(repo.command).not.toHaveBeenCalled();
});

it("does nothing when the retry picker is cancelled", async () => {
  mockCancelled = true;
  const repo = repository();
  await addAttachment(
    repo as unknown as TallyRepository,
    "obligation",
    "loan",
    waiting,
  );
  expect(repo.command).not.toHaveBeenCalled();
});
