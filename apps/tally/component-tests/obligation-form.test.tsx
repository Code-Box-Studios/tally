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

it("chooses and clears an optional due date without inventing a deadline", async () => {
  await render(<ObligationForm />);
  await fireEvent.changeText(screen.getByLabelText("Name"), "No deadline loan");
  await fireEvent.changeText(screen.getByLabelText("Original amount"), "5000");
  await fireEvent.press(
    screen.getByRole("button", { name: /^Due date \(optional\):/ }),
  );
  await fireEvent.press(screen.getByRole("button", { name: "Choose year" }));
  await fireEvent.press(screen.getByRole("button", { name: "2028" }));
  await fireEvent.press(screen.getByRole("button", { name: "February" }));
  await fireEvent.press(screen.getByRole("button", { name: "Feb 29, 2028" }));
  await fireEvent.press(
    screen.getByRole("button", {
      name: /^Due date \(optional\): Feb 29, 2028$/,
    }),
  );
  await fireEvent.press(screen.getByRole("button", { name: "Clear date" }));
  await fireEvent.press(screen.getByRole("button", { name: "Add obligation" }));
  expect(mockExecute).toHaveBeenCalledWith(
    "createObligation",
    expect.objectContaining({ dueDate: null }),
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
    screen.getByLabelText("Number of installments"),
    "2",
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Customize installments" }),
  );
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

it("shows principal, interest and total due and saves the total as the payable balance", async () => {
  await render(<ObligationForm />);
  await fireEvent.press(screen.getByRole("radio", { name: "I lent money" }));
  await fireEvent.changeText(screen.getByLabelText("Name"), "Loan to Alex");
  await fireEvent.changeText(screen.getByLabelText("Original amount"), "1000");
  await fireEvent.press(screen.getByRole("button", { name: "Add interest" }));
  await fireEvent.changeText(screen.getByLabelText("Interest rate (%)"), "5");
  expect(screen.getAllByText("₱1,000.00").length).toBeGreaterThan(0);
  expect(screen.getByText("₱50.00")).toBeTruthy();
  expect(screen.getAllByText("₱1,050.00").length).toBeGreaterThan(0);
  await fireEvent.press(screen.getByRole("button", { name: "Add obligation" }));
  expect(mockExecute).toHaveBeenCalledWith(
    "createObligation",
    expect.objectContaining({
      amountMinor: 105000,
      interestInfo: expect.objectContaining({
        calculationVersion: 1,
        principalMinor: 100000,
        interestMinor: 5000,
        totalMinor: 105000,
        basis: "oneTime",
      }),
    }),
  );
});

it("requires a due date before saving monthly interest", async () => {
  await render(<ObligationForm />);
  await fireEvent.changeText(screen.getByLabelText("Name"), "Monthly loan");
  await fireEvent.changeText(screen.getByLabelText("Original amount"), "1000");
  await fireEvent.press(screen.getByRole("button", { name: "Add interest" }));
  await fireEvent.changeText(screen.getByLabelText("Interest rate (%)"), "3");
  await fireEvent.press(
    screen.getByRole("button", { name: /^Interest basis:/ }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: /Monthly.*30/ }));
  await fireEvent.press(screen.getByRole("button", { name: "Add obligation" }));
  expect(
    (
      await screen.findAllByText(
        "Choose a due date to calculate monthly or annual interest.",
      )
    ).length,
  ).toBeGreaterThan(0);
  expect(mockExecute).not.toHaveBeenCalled();
});

it("generates an exact installment schedule without entering each amount or opening customization", async () => {
  await render(<ObligationForm />);
  await fireEvent.press(
    screen.getByRole("radio", { name: "Add installments" }),
  );
  await fireEvent.changeText(screen.getByLabelText("Name"), "Three payments");
  await fireEvent.changeText(screen.getByLabelText("Original amount"), "100");
  await fireEvent.changeText(
    screen.getByLabelText("Number of installments"),
    "3",
  );
  expect(screen.queryByLabelText("Installment 1 amount")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Add obligation" }));
  expect(mockExecute).toHaveBeenCalledWith(
    "createInstallment",
    expect.objectContaining({
      amountMinor: 10000,
      installments: [
        expect.objectContaining({ amountMinor: 3333 }),
        expect.objectContaining({ amountMinor: 3333 }),
        expect.objectContaining({ amountMinor: 3334 }),
      ],
    }),
  );
});

it("preserves legacy informational interest when editing without calculator opt-in", async () => {
  const interestInfo = {
    rateBasisPoints: 500,
    basis: "annual",
    agreementNotes: "Old agreement",
  };
  await render(
    <ObligationForm
      existing={{
        id: "legacy",
        data: {
          title: "Legacy loan",
          section: "owedToMe",
          currency: "PHP",
          type: "owedToMe",
          originalAmountMinor: 100000,
          originationDate: "2026-10-01",
          dueDate: "2026-10-31",
          revision: 1,
          interestInfo,
        },
      }}
    />,
  );
  expect(
    screen.getByText(/Existing interest terms remain informational/),
  ).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  expect(mockExecute).toHaveBeenCalledWith(
    "editObligation",
    expect.objectContaining({ amountMinor: 100000, interestInfo }),
  );
});
