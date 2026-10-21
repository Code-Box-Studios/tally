import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ObligationForm } from "../src/features/obligations/obligation-form";
import type { Row } from "../src/core/domain/records";

// The first Expo render lazily initializes native modules on cold CI workers.
jest.setTimeout(15_000);

const mockExecute = jest.fn(async (command: string) => ({
  status: "synced",
  result:
    command === "saveCatalog"
      ? { id: "alex" }
      : { obligationId: "new-obligation" },
}));
const mockReplace = jest.fn();
let mockContacts: Row[] = [];
let mockSources: Row[] = [];
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
  useRecords: (collection: string) => ({
    data: {
      rows:
        collection === "contacts"
          ? mockContacts
          : collection === "paymentSources"
            ? mockSources
            : [],
    },
    isPending: false,
  }),
}));
beforeEach(() => {
  mockExecute.mockClear();
  mockReplace.mockClear();
  mockContacts = [];
  mockSources = [];
});

it("assigns installments on my account to someone from People", async () => {
  mockContacts = [
    {
      id: "alex",
      data: { displayName: "Alex", kind: "person", archived: false },
    },
  ];
  mockSources = [
    { id: "card", data: { name: "BPI", type: "creditCard", active: true } },
  ];
  await render(<ObligationForm />);
  await fireEvent.press(
    screen.getByRole("radio", { name: "Add installments" }),
  );
  await fireEvent.press(
    screen.getByRole("radio", { name: "Someone else is repaying" }),
  );
  await fireEvent.changeText(screen.getByLabelText("Original amount"), "100");
  await fireEvent.press(
    screen.getByRole("button", { name: /^Person repaying you:/ }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "Alex" }));
  await fireEvent.press(
    screen.getByRole("button", { name: /^Card \/ lending account:/ }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "BPI" }));
  await fireEvent.press(screen.getByRole("button", { name: "Add obligation" }));
  expect(mockExecute).toHaveBeenCalledWith(
    "createInstallment",
    expect.objectContaining({
      direction: "owedByMe",
      contactId: null,
      paymentSourceId: null,
      amountMinor: 10000,
      repayment: { contactId: "alex", accountId: "card" },
    }),
  );
});

it("requires a person and account before saving assigned installments", async () => {
  await render(<ObligationForm />);
  await fireEvent.press(
    screen.getByRole("radio", { name: "Add installments" }),
  );
  await fireEvent.press(
    screen.getByRole("radio", { name: "Someone else is repaying" }),
  );
  await fireEvent.changeText(screen.getByLabelText("Original amount"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Add obligation" }));
  expect(
    await screen.findByText("Choose the person repaying you."),
  ).toBeTruthy();
  expect(mockExecute).not.toHaveBeenCalled();
});

it.each([
  ["I borrowed money", "createObligation", "Original amount", ""],
  ["I lent money", "createObligation", "Original amount", "   "],
  ["Add installments", "createInstallment", "Original amount", ""],
  ["Add monthly due", "createRecurring", "Default amount", "   "],
])(
  "saves %s without requiring a name",
  async (kind, command, amountLabel, name) => {
    await render(<ObligationForm />);
    await fireEvent.press(screen.getByRole("radio", { name: kind }));
    await fireEvent.changeText(screen.getByLabelText(/^Name/), name);
    await fireEvent.changeText(screen.getByLabelText(amountLabel), "5000");
    await fireEvent.press(
      screen.getByRole("button", { name: "Add obligation" }),
    );

    expect(mockExecute).toHaveBeenCalledWith(
      command,
      expect.objectContaining({
        title: "Untitled",
        [command === "createRecurring" ? "defaultAmountMinor" : "amountMinor"]:
          500000,
      }),
    );
    expect(mockReplace).toHaveBeenCalledWith("/obligations/new-obligation");
  },
);

it("allows clearing the name when editing an obligation", async () => {
  await render(
    <ObligationForm
      existing={{
        id: "loan",
        data: {
          title: "Old name",
          section: "iOwe",
          currency: "PHP",
          originalAmountMinor: 500000,
          originationDate: "2026-10-01",
          revision: 2,
        },
      }}
    />,
  );
  await fireEvent.changeText(screen.getByLabelText(/^Name/), "");
  await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));

  expect(mockExecute).toHaveBeenCalledWith(
    "editObligation",
    expect.objectContaining({
      obligationId: "loan",
      expectedRevision: 2,
      title: "Untitled",
      amountMinor: 500000,
    }),
  );
});

it("creates a contact inline without losing the obligation draft", async () => {
  await render(<ObligationForm />);
  await fireEvent.changeText(
    screen.getByLabelText("Name (optional)"),
    "Laptop loan",
  );
  await fireEvent.changeText(
    screen.getByLabelText("Original amount"),
    "2500.50",
  );
  await fireEvent.press(
    screen.getByRole("button", { name: /^Person \/ organization:/ }),
  );
  await fireEvent.press(screen.getByRole("button", { name: "Add contact" }));
  await fireEvent.changeText(screen.getByLabelText("Contact name"), "Alex");
  await fireEvent.press(screen.getByRole("button", { name: "Add contact" }));
  expect(screen.getByLabelText("Name (optional)").props.value).toBe(
    "Laptop loan",
  );
  expect(screen.getByLabelText("Original amount").props.value).toBe("2,500.50");
  expect(
    screen.getByRole("button", { name: "Person / organization: Alex" }),
  ).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Add obligation" }));
  expect(mockExecute).toHaveBeenCalledWith(
    "createObligation",
    expect.objectContaining({
      title: "Laptop loan",
      amountMinor: 250050,
      contactId: "alex",
    }),
  );
});

it("records a loan in the selected currency with the original amount", async () => {
  await render(<ObligationForm />);
  await fireEvent.changeText(
    screen.getByLabelText("Name (optional)"),
    "Laptop loan",
  );
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
  await fireEvent.changeText(
    screen.getByLabelText("Name (optional)"),
    "Loan to Alex",
  );
  await fireEvent.changeText(screen.getByLabelText("Original amount"), "5000");
  await fireEvent.press(screen.getByRole("button", { name: "Add obligation" }));
  expect(mockExecute).toHaveBeenCalledWith(
    "createObligation",
    expect.objectContaining({ direction: "owedToMe", amountMinor: 500000 }),
  );
});

it("chooses and clears an optional due date without inventing a deadline", async () => {
  await render(<ObligationForm />);
  await fireEvent.changeText(
    screen.getByLabelText("Name (optional)"),
    "No deadline loan",
  );
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
  await fireEvent.changeText(
    screen.getByLabelText("Name (optional)"),
    "Electricity",
  );
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
  await fireEvent.changeText(
    screen.getByLabelText("Name (optional)"),
    "Installment loan",
  );
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
  await fireEvent.changeText(
    screen.getByLabelText("Name (optional)"),
    "Loan to Alex",
  );
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
        calculationVersion: 2,
        principalMinor: 100000,
        interestMinor: 5000,
        totalMinor: 105000,
        charge: { kind: "percentage", rateBasisPoints: 500 },
        ratePeriod: { kind: "oneTime" },
      }),
    }),
  );
});

it("requires a due date before saving monthly interest", async () => {
  await render(<ObligationForm />);
  await fireEvent.changeText(
    screen.getByLabelText("Name (optional)"),
    "Monthly loan",
  );
  await fireEvent.changeText(screen.getByLabelText("Original amount"), "1000");
  await fireEvent.press(screen.getByRole("button", { name: "Add interest" }));
  await fireEvent.changeText(screen.getByLabelText("Interest rate (%)"), "3");
  await fireEvent.press(
    screen.getByRole("button", { name: /^Charge period:/ }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "Every 30 days" }));
  await fireEvent.press(screen.getByRole("button", { name: "Add obligation" }));
  expect(
    (await screen.findAllByText(/Choose a due date/)).length,
  ).toBeGreaterThan(0);
  expect(mockExecute).not.toHaveBeenCalled();
});

it("saves a fixed interest amount in the selected currency", async () => {
  await render(<ObligationForm />);
  await fireEvent.changeText(
    screen.getByLabelText("Name (optional)"),
    "Fixed loan charge",
  );
  await fireEvent.changeText(screen.getByLabelText("Original amount"), "1000");
  await fireEvent.press(screen.getByRole("button", { name: "Add interest" }));
  await fireEvent.press(screen.getByRole("radio", { name: "Fixed amount" }));
  await fireEvent.changeText(
    screen.getByLabelText("Interest amount (PHP)"),
    "50",
  );
  expect(screen.getAllByText("₱1,050.00").length).toBeGreaterThan(0);
  await fireEvent.press(screen.getByRole("button", { name: "Add obligation" }));
  expect(mockExecute).toHaveBeenCalledWith(
    "createObligation",
    expect.objectContaining({
      amountMinor: 105000,
      interestInfo: expect.objectContaining({
        calculationVersion: 2,
        charge: { kind: "fixedAmount", amountMinor: 5000 },
        ratePeriod: { kind: "oneTime" },
        method: { kind: "simple" },
      }),
    }),
  );
});

it("previews compound interest with a custom interval and rounding rule", async () => {
  await render(
    <ObligationForm
      existing={{
        id: "compound",
        data: {
          title: "Compound loan",
          section: "owedToMe",
          type: "owedToMe",
          currency: "PHP",
          originalAmountMinor: 100000,
          revision: 1,
          originationDate: "2026-10-01",
          dueDate: "2026-11-30",
        },
      }}
    />,
  );
  await fireEvent.press(screen.getByRole("button", { name: "Add interest" }));
  await fireEvent.changeText(screen.getByLabelText("Interest rate (%)"), "3");
  await fireEvent.press(
    screen.getByRole("button", { name: /^Charge period:/ }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "Every 30 days" }));
  await fireEvent.press(screen.getByRole("radio", { name: "Compound" }));
  expect(screen.getAllByText("₱1,060.90").length).toBeGreaterThan(0);
  await fireEvent.press(
    screen.getByRole("button", { name: "Advanced interest options" }),
  );
  await fireEvent.changeText(
    screen.getByLabelText("Compound every (days)"),
    "15",
  );
  await fireEvent.press(screen.getByRole("button", { name: /^Rounding:/ }));
  await fireEvent.press(screen.getByRole("radio", { name: "Round up" }));
  expect(screen.getAllByText("₱1,061.37").length).toBeGreaterThan(0);
  await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  expect(mockExecute).toHaveBeenCalledWith(
    "editObligation",
    expect.objectContaining({
      amountMinor: 106137,
      interestInfo: expect.objectContaining({
        calculationVersion: 2,
        charge: { kind: "percentage", rateBasisPoints: 300 },
        ratePeriod: { kind: "days", days: 30 },
        method: { kind: "compound", intervalDays: 15 },
        rounding: "up",
        dayCount: 60,
      }),
    }),
  );
});

it("keeps paid V1 interest terms unchanged when editing agreement notes", async () => {
  const interestInfo = {
    calculationVersion: 1,
    principalMinor: 100000,
    rateBasisPoints: 500,
    basis: "oneTime",
    originationDate: "2026-10-01",
    dueDate: "2026-10-31",
    dayCount: 30,
    interestMinor: 5000,
    totalMinor: 105000,
    agreementNotes: "Original agreement",
  };
  await render(
    <ObligationForm
      existing={{
        id: "paid",
        data: {
          title: "Paid loan",
          section: "owedToMe",
          type: "owedToMe",
          currency: "PHP",
          originalAmountMinor: 105000,
          originationDate: "2026-10-01",
          dueDate: "2026-10-31",
          hasPaymentHistory: true,
          revision: 2,
          interestInfo,
        },
      }}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Remove interest" }),
  ).toBeDisabled();
  await fireEvent.press(
    screen.getByRole("button", { name: "Advanced interest options" }),
  );
  await fireEvent.changeText(
    screen.getByLabelText("Interest agreement notes"),
    "Clarified agreement",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  expect(mockExecute).toHaveBeenCalledWith(
    "editObligation",
    expect.objectContaining({
      amountMinor: 105000,
      interestInfo: { ...interestInfo, agreementNotes: "Clarified agreement" },
    }),
  );
});

it("generates an exact installment schedule without entering each amount or opening customization", async () => {
  await render(<ObligationForm />);
  await fireEvent.press(
    screen.getByRole("radio", { name: "Add installments" }),
  );
  await fireEvent.changeText(
    screen.getByLabelText("Name (optional)"),
    "Three payments",
  );
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
