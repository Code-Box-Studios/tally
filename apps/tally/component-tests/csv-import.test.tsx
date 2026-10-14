import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { createHash as mockCreateHash } from "node:crypto";
import { CommandQueue } from "../src/features/sync/data/command-queue";
import { MemoryStore } from "../src/features/sync/data/memory-store";
import { ImportScreen } from "../src/features/import/import-screen";

let mockQueue: CommandQueue;
let mockOwner = "owner";
const mockReadCsv = jest.fn();
jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: async (_algorithm: string, value: string) =>
    mockCreateHash("sha256").update(value).digest("hex"),
}));
jest.mock("../src/features/import/read-csv", () => ({
  readCsvFile: () => mockReadCsv(),
}));
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({
    repo: { owner: mockOwner, namespace: "test", check() {} },
    profile: { defaultCurrency: "PHP", timezone: "Asia/Manila" },
    pending: [],
    execute: (name: string, payload: Record<string, never>, id: string) =>
      mockQueue.enqueue(name, payload, id),
  }),
}));
jest.mock("../src/shared/queries", () => ({
  useRecords: (collection: string) => ({
    data: {
      rows:
        collection === "categories"
          ? [
              {
                id: "default-personal-loan",
                data: { name: "Personal loan", active: true },
              },
            ]
          : [],
      cached: false,
    },
    isPending: false,
    error: null,
  }),
}));
jest.mock("../src/shared/theme", () => ({
  useTheme: () => ({
    surface: "#fff",
    ink: "#111",
    muted: "#555",
    border: "#ddd",
    primary: "#365",
    background: "#fff",
    tint: "#eef",
  }),
}));
beforeEach(() => {
  mockOwner = "owner";
  mockReadCsv.mockReset();
  mockQueue = new CommandQueue(
    new MemoryStore(),
    "owner",
    "test",
    () => true,
    async () => ({}),
  );
});

it("clears the draft and ignores a picked file after switching accounts", async () => {
  let resolve!: (value: string) => void;
  mockReadCsv.mockImplementation(
    () =>
      new Promise<string>((done) => {
        resolve = done;
      }),
  );
  const view = await render(<ImportScreen />);
  await fireEvent.changeText(
    screen.getByLabelText("CSV text"),
    "Private old draft",
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Choose CSV file" }),
  );
  mockOwner = "new-owner";
  await view.rerender(<ImportScreen />);
  await act(async () => {
    resolve("Private old file");
  });
  expect(screen.getByLabelText("CSV text").props.value).toBe("");
  expect(await mockQueue.list()).toHaveLength(0);
});

it("previews without writing and imports only valid selected rows", async () => {
  await render(<ImportScreen />);
  await fireEvent.changeText(
    screen.getByLabelText("CSV text"),
    "Title,Amount,Date\nLoan,100.01,2026-01-01\nLoan,100.01,2026-01-01\nInvalid,5.001,2026-01-01\nSkip me,20,2026-01-01",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Match columns" }));
  await fireEvent.press(screen.getByRole("button", { name: "Preview import" }));
  await screen.findByText("Row 2 · Loan");
  expect(await mockQueue.list()).toHaveLength(0);
  expect(screen.getByText(/Duplicate in this CSV/)).toBeTruthy();
  await fireEvent.press(screen.getByRole("checkbox", { name: "Import row 5" }));
  await fireEvent.press(
    screen.getByRole("button", { name: "Import 1 selected row" }),
  );
  await screen.findByText(/Saved on this device/);
  const commands = await mockQueue.list();
  expect(commands).toHaveLength(1);
  expect(commands[0]).toMatchObject({
    name: "createObligation",
    payload: { amountMinor: 10001, title: "Loan" },
    status: "pending",
  });
  expect(commands[0].id).toMatch(/^import-v1-/);
});

it("blocks rows containing payment history rather than importing the original balance", async () => {
  await render(<ImportScreen />);
  await fireEvent.changeText(
    screen.getByLabelText("CSV text"),
    "Title,Amount,Date,Amount paid\nLoan,100,2026-01-01,40",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Match columns" }));
  await fireEvent.press(screen.getByRole("button", { name: "Preview import" }));
  await screen.findByText(/contains financial terms/);
  expect(
    screen.getByRole("button", { name: "Import 0 selected rows" }),
  ).toBeDisabled();
  expect(await mockQueue.list()).toHaveLength(0);
});
