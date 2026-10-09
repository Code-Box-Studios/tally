import React from "react";
import { render, fireEvent, screen } from "@testing-library/react-native";
import { PaymentForm } from "../src/features/payments/payment-form";
const mockExecute = jest.fn(async () => ({ status: "synced" }));
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({
    profile: { timezone: "Asia/Manila" },
    execute: mockExecute,
  }),
}));
jest.mock("../src/shared/queries", () => ({
  useRecords: () => ({ data: { rows: [] } }),
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
const obligation = {
  id: "o1",
  data: {
    currency: "PHP",
    remainingMinor: 700000,
    singleInstanceId: "i1",
    type: "loan",
  },
};
beforeEach(() => mockExecute.mockClear());
it("rejects an overpayment before dispatching a financial command", async () => {
  await render(<PaymentForm obligation={obligation} onDone={() => {}} />);
  await fireEvent.changeText(screen.getByLabelText("Payment amount"), "7500");
  await fireEvent.press(screen.getByRole("button", { name: "Record payment" }));
  expect(
    await screen.findByText("This payment exceeds the remaining balance."),
  ).toBeTruthy();
  expect(mockExecute).not.toHaveBeenCalled();
});
it("records a partial payment with integer money and the exact instance identity", async () => {
  await render(<PaymentForm obligation={obligation} onDone={() => {}} />);
  await fireEvent.changeText(screen.getByLabelText("Payment amount"), "2000");
  await fireEvent.press(screen.getByRole("button", { name: "Record payment" }));
  expect(mockExecute).toHaveBeenCalledWith(
    "recordPayment",
    expect.objectContaining({
      amountMinor: 200000,
      obligationId: "o1",
      obligationInstanceId: "i1",
      currency: "PHP",
    }),
  );
});
