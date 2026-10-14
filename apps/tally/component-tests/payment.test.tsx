import React from "react";
import { render, fireEvent, screen } from "@testing-library/react-native";
import { PaymentForm } from "../src/features/payments/payment-form";
const mockExecute = jest.fn(async () => ({ status: "synced" }));
const mockReceiptScan = jest.fn();
jest.mock("../src/features/payments/receipt-ocr", () => ({
  scanReceiptImage: (options: unknown) => mockReceiptScan(options),
}));
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

it("records the calendar-selected payment date without shifting the civil day", async () => {
  await render(<PaymentForm obligation={obligation} onDone={() => {}} />);
  await fireEvent.changeText(screen.getByLabelText("Payment amount"), "2000");
  await fireEvent.press(screen.getByRole("button", { name: /^Payment date:/ }));
  await fireEvent.press(screen.getByRole("button", { name: "Choose year" }));
  await fireEvent.press(screen.getByRole("button", { name: "2028" }));
  await fireEvent.press(screen.getByRole("button", { name: "February" }));
  await fireEvent.press(screen.getByRole("button", { name: "Feb 29, 2028" }));
  await fireEvent.press(screen.getByRole("button", { name: "Record payment" }));
  expect(mockExecute).toHaveBeenCalledWith(
    "recordPayment",
    expect.objectContaining({ paymentDate: "2028-02-29" }),
  );
});

it("reviews a receipt before saving and preserves its reference with existing notes", async () => {
  mockReceiptScan.mockResolvedValue(
    "Amount paid PHP 200.00\n2026-10-14\nReference No. 00012345",
  );
  await render(<PaymentForm obligation={obligation} onDone={() => {}} />);
  await fireEvent.changeText(
    screen.getByLabelText("Payment notes"),
    "October payment",
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Scan receipt or screenshot" }),
  );
  await screen.findByDisplayValue("200.00");
  await fireEvent.press(screen.getByRole("button", { name: "Record payment" }));
  expect(mockExecute).not.toHaveBeenCalled();
  await fireEvent.press(
    screen.getByRole("button", { name: "Use reviewed details" }),
  );
  expect(screen.getByLabelText("Payment amount").props.value).toBe("200.00");
  expect(screen.getByLabelText("Payment reference").props.value).toBe(
    "00012345",
  );
  expect(mockExecute).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Record payment" }));
  expect(mockExecute).toHaveBeenCalledWith(
    "recordPayment",
    expect.objectContaining({
      amountMinor: 20000,
      paymentDate: "2026-10-14",
      notes: "October payment\nReference: 00012345",
    }),
  );
});

it("restores manual payment saving after cancelling a scan", async () => {
  mockReceiptScan.mockImplementation(() => new Promise(() => {}));
  await render(<PaymentForm obligation={obligation} onDone={() => {}} />);
  await fireEvent.press(
    screen.getByRole("button", { name: "Scan receipt or screenshot" }),
  );
  await fireEvent.press(screen.getByRole("button", { name: "Record payment" }));
  expect(mockExecute).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Cancel scan" }));
  await fireEvent.press(screen.getByRole("button", { name: "Record payment" }));
  expect(mockExecute).toHaveBeenCalledTimes(1);
});
