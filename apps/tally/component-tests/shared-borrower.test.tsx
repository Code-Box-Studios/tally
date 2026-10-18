import React from "react";
import {
  render,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native";
import { SharedScreen } from "../src/features/borrowers/shared-screen";
const mockInvoke = jest.fn();
const mockDetailRefetch = jest.fn();
let mockError: Error | null = null;
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({
    repo: {
      owner: "borrower",
      namespace: "test",
      invoke: mockInvoke,
      check: jest.fn(),
    },
    cached: false,
  }),
}));
jest.mock("../src/features/borrowers/proof-files", () => ({
  addProofFile: jest.fn(),
  downloadProofFile: jest.fn(),
}));
jest.mock("../src/features/payments/receipt-scan-review", () => ({
  ReceiptScanReview: () => null,
}));
jest.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    isPending: false,
    error: queryKey[2] === "sharedLoan" ? mockError : null,
    refetch: queryKey[2] === "sharedLoan" ? mockDetailRefetch : jest.fn(),
    data:
      queryKey[2] === "sharedWithMe"
        ? {
            shares: [
              {
                ownerId: "owner",
                shareId: "share",
                title: "Loan",
                status: "active",
              },
            ],
          }
        : {
            ownerId: "owner",
            shareId: "share",
            ownerName: "Lender",
            timezone: "Asia/Manila",
            loan: {
              title: "Loan",
              currency: "JPY",
              lifecycle: "active",
              originationDate: "2020-01-01",
              remainingMinor: 10000,
              totalPaidMinor: 0,
              originalAmountMinor: 10000,
              financialStatus: "pending",
              schedule: [],
              payments: [],
            },
            submissions: [
              {
                submissionId: "proof",
                shareId: "share",
                currency: "PHP",
                amountMinor: 10000,
                paymentDate: "2020-01-01",
                status: "pending",
                reference: "0001",
                message: "Historical proof",
              },
            ],
            attachments: [],
          },
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
  }),
}));
beforeEach(() => {
  mockError = null;
  mockInvoke.mockClear();
  mockInvoke.mockResolvedValue({ submissionId: "new-proof" });
  mockDetailRefetch.mockReset();
});

it.each(["Cancel", "Close dialog", "Dismiss dialog"])(
  "discards unsaved payment proof through %s and keeps the selected shared loan",
  async (dismiss) => {
    await render(<SharedScreen />);
    await fireEvent.press(
      screen.getByRole("button", { name: "View shared loan" }),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Submit payment proof" }),
    );
    const dialog = within(screen.getByLabelText("Submit payment proof"));
    await fireEvent.changeText(dialog.getByLabelText("Amount paid"), "25");
    expect(
      screen.getByText("Payment schedule", { includeHiddenElements: true }),
    ).toBeTruthy();
    await fireEvent.press(
      dialog.getByRole("button", {
        name: dismiss,
        includeHiddenElements: true,
      }),
    );
    expect(screen.queryByLabelText("Amount paid")).toBeNull();
    expect(screen.getByText("Payment schedule")).toBeTruthy();
    expect(mockInvoke).not.toHaveBeenCalled();
    await fireEvent.press(
      screen.getByRole("button", { name: "Submit payment proof" }),
    );
    expect(screen.getByLabelText("Amount paid").props.value).toBe("");
  },
);

it("saves payment proof from its modal with the selected loan scope and refreshes details", async () => {
  await render(<SharedScreen />);
  await fireEvent.press(
    screen.getByRole("button", { name: "View shared loan" }),
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Submit payment proof" }),
  );
  const dialog = within(screen.getByLabelText("Submit payment proof"));
  await fireEvent.changeText(dialog.getByLabelText("Amount paid"), "25");
  await fireEvent.changeText(
    dialog.getByLabelText("Payment reference"),
    "00025",
  );
  await fireEvent.press(dialog.getByRole("button", { name: "Review proof" }));
  expect(mockInvoke).toHaveBeenCalledTimes(1);
  expect(mockInvoke).toHaveBeenCalledWith(
    "borrowerDraft",
    expect.objectContaining({
      ownerId: "owner",
      shareId: "share",
      amountMinor: 25,
      reference: "00025",
    }),
  );
  await waitFor(() => expect(mockDetailRefetch).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("button", { name: "Close dialog" })).toBeNull();
  expect(screen.getByText("Payment schedule")).toBeTruthy();
});
it("formats historical proof in its own currency after the loan currency changes", async () => {
  await render(<SharedScreen />);
  await fireEvent.press(
    screen.getByRole("button", { name: "View shared loan" }),
  );
  expect(screen.getByText("₱100.00")).toBeTruthy();
  expect(mockInvoke).not.toHaveBeenCalled();
});
it("hides stale shared details when an access refresh fails", async () => {
  mockError = new Error("Shared access revoked.");
  await render(<SharedScreen />);
  await fireEvent.press(
    screen.getByRole("button", { name: "View shared loan" }),
  );
  expect(screen.getByText("Shared access revoked.")).toBeTruthy();
  expect(screen.queryByText("Historical proof")).toBeNull();
});
