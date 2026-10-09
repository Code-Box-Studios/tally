import { addAttachment } from "../src/features/attachments/attachment-service";
import { TallyRepository } from "../src/core/backend/repository";
import type { SupabaseClient } from "@supabase/supabase-js";
const mockValues = new Map<string, string>();
let mockId = 0;
jest.mock("expo-document-picker", () => ({
  getDocumentAsync: async () => ({
    canceled: false,
    assets: [
      {
        name: "receipt.pdf",
        mimeType: "application/pdf",
        size: 3,
        uri: "fixture",
      },
    ],
  }),
}));
jest.mock("expo-file-system", () => ({
  File: class {
    async bytes() {
      return new Uint8Array([1, 2, 3]);
    }
  },
}));
jest.mock("expo-crypto", () => ({
  randomUUID: () => "id-" + ++mockId,
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digest: async () => new Uint8Array(32).buffer,
  digestStringAsync: async () => "file-key",
}));
jest.mock("../src/core/config", () => ({
  runtimeConfig: () => ({
    url: "http://127.0.0.1:56321",
    key: "fixture",
    namespace: "test",
  }),
}));
jest.mock("../src/core/storage", () => ({
  privateStore: {
    get: async (k: string) => mockValues.get(k) ?? null,
    set: async (k: string, v: string) => {
      mockValues.set(k, v);
    },
    remove: async (k: string) => {
      mockValues.delete(k);
    },
  },
}));
jest.mock("../src/features/attachments/files", () => ({
  saveFile: async () => {},
}));
it("keeps an untrusted upload's retry identity in memory without saving private transfer data", async () => {
  const { privateStore } = jest.requireMock("../src/core/storage");
  const ids: string[] = [];
  const original = global.fetch;
  global.fetch = (async (_url: unknown, options: { body: string }) => {
    const request = JSON.parse(options.body);
    ids.push(request.input.commandId);
    if (request.name === "reserveAttachment")
      return {
        ok: true,
        json: async () => ({
          result: { attachmentId: "attachment", revision: 1 },
        }),
      };
    throw new TypeError("Connection lost after upload commit");
  }) as typeof fetch;
  const client = {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: "owner" }, access_token: "fixture" } },
      }),
    },
  } as unknown as SupabaseClient;
  const repo = new TallyRepository(
    client,
    "owner",
    privateStore,
    async () => false,
    () => true,
    "test",
  );
  try {
    await expect(addAttachment(repo, "obligation", "loan")).rejects.toThrow();
    expect(mockValues.size).toBe(0);
    await expect(addAttachment(repo, "obligation", "loan")).rejects.toThrow();
    expect(ids).toEqual(["id-1", "id-2", "id-2"]);
  } finally {
    global.fetch = original;
  }
});
