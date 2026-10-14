import React from "react";
import { render, fireEvent, screen } from "@testing-library/react-native";
import { SharedScreen } from "../src/features/borrowers/shared-screen";
const mockInvoke = jest.fn();
let mockError: Error | null = null;
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({
    repo: { owner: "borrower", namespace: "test", invoke: mockInvoke },
    cached: false,
  }),
}));
jest.mock("../src/features/borrowers/proof-files", () => ({
  addProofFile: jest.fn(),
  downloadProofFile: jest.fn(),
}));
jest.mock("../src/features/borrowers/borrower-proof-form", () => ({
  BorrowerProofForm: () => null,
}));
jest.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    isPending: false,
    error: queryKey[2] === "sharedLoan" ? mockError : null,
    refetch: jest.fn(),
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
