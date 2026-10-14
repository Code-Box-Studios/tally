import React from "react";
import { render, fireEvent, screen } from "@testing-library/react-native";
import { BorrowerProofForm } from "../src/features/borrowers/borrower-proof-form";
const mockInvoke = jest.fn(async () => ({ submissionId: "proof" }));
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({
    repo: { owner: "borrower", check: jest.fn(), invoke: mockInvoke },
  }),
}));
jest.mock("../src/features/payments/receipt-scan-review", () => ({
  ReceiptScanReview: () => null,
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
const loan = {
  currency: "PHP",
  remainingMinor: 100000,
  originationDate: "2020-01-01",
};
beforeEach(() => mockInvoke.mockClear());
it("creates only an editable proof draft after validating amount, never a payment", async () => {
  const done = jest.fn();
  await render(
    <BorrowerProofForm
      ownerId="owner"
      shareId="share"
      loan={loan}
      timezone="Asia/Manila"
      onDone={done}
    />,
  );
  expect(mockInvoke).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText("Amount paid"), "250.50");
  await fireEvent.changeText(
    screen.getByLabelText("Payment reference"),
    "000123",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Review proof" }));
  expect(mockInvoke).toHaveBeenCalledWith(
    "borrowerDraft",
    expect.objectContaining({
      ownerId: "owner",
      shareId: "share",
      amountMinor: 25050,
      reference: "000123",
    }),
  );
  expect(mockInvoke).toHaveBeenCalledTimes(1);
  expect(done).toHaveBeenCalled();
});
it("rejects overpayment before creating a draft", async () => {
  await render(
    <BorrowerProofForm
      ownerId="owner"
      shareId="share"
      loan={loan}
      timezone="Asia/Manila"
      onDone={() => {}}
    />,
  );
  await fireEvent.changeText(screen.getByLabelText("Amount paid"), "1001");
  await fireEvent.press(screen.getByRole("button", { name: "Review proof" }));
  expect(
    await screen.findByText("This amount exceeds the current balance."),
  ).toBeTruthy();
  expect(mockInvoke).not.toHaveBeenCalled();
});
