import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { DataExportCard } from "../src/features/settings/data-export-card";
const mockCollect = jest.fn();
const mockSave = jest.fn();
const mockCheck = jest.fn();
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({
    repo: { check: mockCheck },
    profile: { userId: "owner" },
    pending: [],
  }),
}));
jest.mock("../src/features/settings/data-export", () => ({
  collectExport: (...args: unknown[]) => mockCollect(...args),
  paymentsCsv: () => "payment-date,amount\r\n",
}));
jest.mock("../src/features/attachments/files", () => ({
  saveFile: (...args: unknown[]) => mockSave(...args),
}));
beforeEach(() => {
  mockCollect.mockReset();
  mockSave.mockReset();
  mockCheck.mockReset();
});
it("only downloads after every collection is verified", async () => {
  mockCollect.mockResolvedValue({
    generatedAt: "2026-10-14T00:00:00Z",
    records: {},
  });
  await render(<DataExportCard />);
  await fireEvent.press(
    screen.getByRole("button", { name: "Download payments (CSV)" }),
  );
  await waitFor(() =>
    expect(mockSave).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      "tally-payments-2026-10-14.csv",
      "text/csv",
      expect.any(Function),
    ),
  );
  expect(mockCheck).toHaveBeenCalled();
});
it("does not save a partial export when a collection fails", async () => {
  mockCollect.mockRejectedValue(new Error("Reconnect before exporting"));
  await render(<DataExportCard />);
  await fireEvent.press(
    screen.getByRole("button", { name: "Download all records (JSON)" }),
  );
  await waitFor(() =>
    expect(screen.getByText("Reconnect before exporting")).toBeTruthy(),
  );
  expect(mockSave).not.toHaveBeenCalled();
});
