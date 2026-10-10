import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ObligationForm } from "../src/features/obligations/obligation-form";

const mockExecute = jest.fn(async () => ({
  status: "synced",
  result: { obligationId: "new-obligation" },
}));
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
    back: jest.fn(),
  },
}));
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({
    profile: { defaultCurrency: "PHP", timezone: "Asia/Manila" },
    execute: mockExecute,
  }),
}));
jest.mock("../src/shared/queries", () => ({
  useRecords: () => ({ data: { rows: [] }, isPending: false }),
}));
beforeEach(() => {
  mockExecute.mockClear();
  mockReplace.mockClear();
});

it("records a loan in the selected currency with the original amount", async () => {
  await render(<ObligationForm />);
  await fireEvent.changeText(screen.getByLabelText("Name"), "Laptop loan");
  await fireEvent.changeText(
    screen.getByLabelText("Original amount"),
    "2500.50",
  );
  await fireEvent.press(screen.getByRole("button", { name: /^Currency:/ }));
  await fireEvent.press(screen.getByRole("radio", { name: "USD" }));
  await fireEvent.press(screen.getByRole("button", { name: "Add obligation" }));
  expect(mockExecute).toHaveBeenCalledWith(
    "createObligation",
    expect.objectContaining({
      title: "Laptop loan",
      currency: "USD",
      direction: "owedByMe",
      amountMinor: 250050,
    }),
  );
  expect(mockReplace).toHaveBeenCalledWith("/obligations/new-obligation");
});

it("records money lent without changing its direction", async () => {
  await render(<ObligationForm />);
  await fireEvent.press(screen.getByRole("radio", { name: "I lent money" }));
  await fireEvent.changeText(screen.getByLabelText("Name"), "Loan to Alex");
  await fireEvent.changeText(screen.getByLabelText("Original amount"), "5000");
  await fireEvent.press(screen.getByRole("button", { name: "Add obligation" }));
  expect(mockExecute).toHaveBeenCalledWith(
    "createObligation",
    expect.objectContaining({ direction: "owedToMe", amountMinor: 500000 }),
  );
});

it("creates a variable bill with confirmation and no invented amount", async () => {
  await render(<ObligationForm />);
  await fireEvent.press(screen.getByRole("radio", { name: "Add monthly due" }));
  await fireEvent.changeText(screen.getByLabelText("Name"), "Electricity");
  await fireEvent.press(
    screen.getByRole("radio", { name: "Changes each period" }),
  );
  await fireEvent.press(
    screen.getByRole("button", { name: /^Payment behavior:/ }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: /confirm/i }));
  await fireEvent.press(screen.getByRole("button", { name: "Add obligation" }));
  expect(mockExecute).toHaveBeenCalledWith(
    "createRecurring",
    expect.objectContaining({
      amountKind: "variable",
      defaultAmountMinor: null,
      paymentMode: "automaticConfirmation",
      recurrence: expect.objectContaining({
        frequency: "monthly",
        timezone: "Asia/Manila",
      }),
    }),
  );
});

it("blocks an installment schedule that does not equal the original amount", async () => {
  await render(<ObligationForm />);
  await fireEvent.press(
    screen.getByRole("radio", { name: "Add installments" }),
  );
  await fireEvent.changeText(screen.getByLabelText("Name"), "Installment loan");
  await fireEvent.changeText(screen.getByLabelText("Original amount"), "20000");
  await fireEvent.changeText(
    screen.getByLabelText("Installment 1 amount"),
    "5000",
  );
  await fireEvent.changeText(
    screen.getByLabelText("Installment 2 amount"),
    "10000",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Add obligation" }));
  expect(
    await screen.findByText("Installments must add up to the original amount."),
  ).toBeTruthy();
  expect(mockExecute).not.toHaveBeenCalled();
  await fireEvent.changeText(
    screen.getByLabelText("Installment 1 amount"),
    "10000",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Add obligation" }));
  expect(mockExecute).toHaveBeenCalledWith(
    "createInstallment",
    expect.objectContaining({
      amountMinor: 2000000,
      installments: [
        expect.objectContaining({ amountMinor: 1000000 }),
        expect.objectContaining({ amountMinor: 1000000 }),
      ],
    }),
  );
});
