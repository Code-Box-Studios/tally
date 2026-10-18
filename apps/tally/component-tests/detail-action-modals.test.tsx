import React from "react";
import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
import { DetailScreen } from "../src/features/obligations/detail-screen";
import type { Row } from "../src/core/domain/records";

const mockExecute = jest.fn(async (..._args: unknown[]) => ({
  status: "synced",
}));
const mockInvoke = jest.fn();
const mockRepo = { check: () => {}, invoke: mockInvoke, owner: "owner" };
let mockObligation: Row;
let mockInstances: Row[];
let mockPayments: Row[];

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "loan" }),
  router: { push: jest.fn() },
}));
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({
    profile: { userId: "owner", timezone: "Asia/Manila" },
    execute: mockExecute,
    repo: mockRepo,
    pending: [],
  }),
}));
jest.mock("../src/shared/queries", () => ({
  useRecords: (collection: string) => ({
    data: {
      rows:
        collection === "obligations"
          ? [mockObligation]
          : collection === "obligationInstances"
            ? mockInstances
            : collection === "payments"
              ? mockPayments
              : [],
    },
    isPending: false,
    error: null,
  }),
}));
jest.mock("../src/features/attachments/attachments-panel", () => ({
  AttachmentsPanel: () => null,
}));

beforeEach(() => {
  mockExecute.mockReset().mockResolvedValue({ status: "synced" });
  mockInvoke
    .mockReset()
    .mockRejectedValue(new Error("Connect to verify payments."));
  mockObligation = {
    id: "loan",
    data: {
      title: "Personal loan",
      description: "Tuition for October",
      type: "owedByMe",
      section: "iOwe",
      direction: "owedByMe",
      lifecycle: "active",
      financialStatus: "partial",
      currency: "PHP",
      originalAmountMinor: 100000,
      remainingMinor: 80000,
      totalPaidMinor: 20000,
      singleInstanceId: "october",
      revision: 4,
    },
  };
  mockInstances = [
    {
      id: "october",
      data: {
        obligationId: "loan",
        periodLabel: "October 2026",
        dueDate: "2026-10-31",
        currency: "PHP",
        amountMinor: 100000,
        remainingMinor: 80000,
        totalPaidMinor: 20000,
        deductionStatus: "expected",
        financialStatus: "partial",
        revision: 7,
      },
    },
  ];
  mockPayments = [
    {
      id: "payment",
      data: {
        obligationId: "loan",
        obligationInstanceId: "october",
        entryType: "payment",
        paymentDate: "2026-10-01",
        createdAt: "2026-10-01T00:00:00Z",
        currency: "PHP",
        amountMinor: 20000,
        paymentMethod: "cash",
        provenance: "manual",
        notes: "Paid at branch",
      },
    },
  ];
});

function dialogFor(title: string) {
  const dialog = screen
    .getAllByLabelText(title)
    .find((candidate) =>
      within(candidate).queryByRole("button", { name: "Close dialog" }),
    );
  if (!dialog) throw new Error(`No open dialog named ${title}.`);
  return within(dialog);
}

it.each([
  { trigger: "Record payment", title: "Record payment" },
  { trigger: "Mark as paid", title: "Record payment" },
  { trigger: "Correct payment", title: "Correct payment" },
  { trigger: "Cancel obligation", title: "Cancel obligation" },
  { trigger: "Payoff simulator", title: "Payoff simulator" },
  { trigger: "Confirm deduction", title: "Confirm deduction", recurring: true },
  { trigger: "Set period amount", title: "Set period amount", recurring: true },
  { trigger: "Edit period", title: "Edit billing period", recurring: true },
  { trigger: "Skip period", title: "Skip billing period", recurring: true },
  {
    trigger: "Deduction failed",
    title: "Report failed deduction",
    recurring: true,
  },
  { trigger: "Pause schedule", title: "Pause schedule", recurring: true },
  {
    trigger: "Resume schedule",
    title: "Resume schedule",
    recurring: true,
    paused: true,
  },
  { trigger: "End schedule", title: "End schedule", recurring: true },
  {
    trigger: "Paid-in-full confirmation",
    title: "Paid-in-full confirmation",
    settled: true,
  },
])(
  "$trigger opens over the same obligation context and dismisses without saving",
  async ({ trigger, title, recurring, paused, settled }) => {
    if (recurring) mockObligation.data.section = "monthlyDues";
    if (paused) mockObligation.data.lifecycle = "paused";
    if (settled) {
      mockObligation.data.financialStatus = "paid";
      mockObligation.data.remainingMinor = 0;
    }
    await render(<DetailScreen />);
    const original = screen.getByText("Original");
    const period = screen.getByText("October 2026");
    const payment = screen.getByText("Paid at branch");
    await fireEvent.press(screen.getByRole("button", { name: trigger }));

    const dialog = dialogFor(title);
    expect(screen.getByText("Original", { includeHiddenElements: true })).toBe(
      original,
    );
    expect(
      screen.getByText("October 2026", { includeHiddenElements: true }),
    ).toBe(period);
    expect(
      screen.getByText("Paid at branch", { includeHiddenElements: true }),
    ).toBe(payment);
    await fireEvent.press(dialog.getByRole("button", { name: "Close dialog" }));

    expect(screen.queryByRole("button", { name: "Close dialog" })).toBeNull();
    expect(screen.getByText("Original")).toBe(original);
    expect(screen.getByRole("button", { name: trigger })).toBeTruthy();
    expect(mockExecute).not.toHaveBeenCalled();
  },
);

it("saves a partial payment from its dialog and returns to the same schedule", async () => {
  await render(<DetailScreen />);
  const period = screen.getByText("October 2026");
  await fireEvent.press(screen.getByRole("button", { name: "Mark as paid" }));
  const dialog = dialogFor("Record payment");
  await fireEvent.changeText(dialog.getByLabelText("Payment amount"), "125.50");
  await fireEvent.press(dialog.getByRole("button", { name: "Record payment" }));

  expect(mockExecute).toHaveBeenCalledWith("recordPayment", {
    obligationId: "loan",
    obligationInstanceId: "october",
    currency: "PHP",
    amountMinor: 12550,
    paymentDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    paymentSourceId: null,
    paymentMethod: "cash",
    notes: "",
  });
  expect(screen.queryByRole("button", { name: "Close dialog" })).toBeNull();
  expect(screen.getByText("October 2026")).toBe(period);
});

it("keeps failed payment details in the dialog so the user can retry", async () => {
  mockExecute.mockRejectedValueOnce(
    new Error("The balance changed. Refresh and try again."),
  );
  await render(<DetailScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Mark as paid" }));
  const dialog = dialogFor("Record payment");
  await fireEvent.changeText(dialog.getByLabelText("Payment amount"), "125.50");
  await fireEvent.press(dialog.getByRole("button", { name: "Record payment" }));

  expect(
    await dialog.findByText("The balance changed. Refresh and try again."),
  ).toBeTruthy();
  expect(dialog.getByLabelText("Payment amount").props.value).toBe("125.50");
  expect(
    screen.getByText("Original", { includeHiddenElements: true }),
  ).toBeTruthy();
  await fireEvent.press(dialog.getByRole("button", { name: "Record payment" }));
  expect(mockExecute).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("button", { name: "Close dialog" })).toBeNull();
});

it("keeps overpayment validation in the dialog before sending a command", async () => {
  await render(<DetailScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Mark as paid" }));
  const dialog = dialogFor("Record payment");
  await fireEvent.changeText(dialog.getByLabelText("Payment amount"), "800.01");
  await fireEvent.press(dialog.getByRole("button", { name: "Record payment" }));

  expect(
    await dialog.findByText("This payment exceeds the remaining balance."),
  ).toBeTruthy();
  expect(dialog.getByRole("button", { name: "Close dialog" })).toBeTruthy();
  expect(mockExecute).not.toHaveBeenCalled();
});

it("saves a period change with its own revision and closes the dialog", async () => {
  mockObligation.data.section = "monthlyDues";
  await render(<DetailScreen />);
  await fireEvent.press(
    screen.getByRole("button", { name: "Set period amount" }),
  );
  const dialog = dialogFor("Set period amount");
  await fireEvent.changeText(
    dialog.getByLabelText("This period’s amount"),
    "1200.25",
  );
  await fireEvent.changeText(
    dialog.getByLabelText("Reason"),
    "Updated utility bill",
  );
  await fireEvent.press(dialog.getByRole("button", { name: "Save period" }));

  expect(mockExecute).toHaveBeenCalledWith("setRecurringAmount", {
    obligationId: "loan",
    instanceId: "october",
    expectedRevision: 7,
    reason: "Updated utility bill",
    amountMinor: 120025,
  });
  expect(screen.queryByRole("button", { name: "Close dialog" })).toBeNull();
  expect(
    screen.getByRole("button", { name: "Set period amount" }),
  ).toBeTruthy();
});

it("validates cancellation before saving with the obligation revision", async () => {
  await render(<DetailScreen />);
  await fireEvent.press(
    screen.getByRole("button", { name: "Cancel obligation" }),
  );
  const dialog = dialogFor("Cancel obligation");
  await fireEvent.press(dialog.getByRole("button", { name: "Save change" }));
  expect(
    await dialog.findByText("Explain why this obligation is cancelled."),
  ).toBeTruthy();
  expect(mockExecute).not.toHaveBeenCalled();
  await fireEvent.changeText(
    dialog.getByLabelText("Cancellation reason"),
    "Duplicate loan",
  );
  await fireEvent.press(dialog.getByRole("button", { name: "Save change" }));

  expect(mockExecute).toHaveBeenCalledWith("cancelObligation", {
    obligationId: "loan",
    expectedRevision: 4,
    reason: "Duplicate loan",
  });
  expect(screen.queryByRole("button", { name: "Close dialog" })).toBeNull();
  expect(screen.getByText("Original")).toBeTruthy();
});

it("keeps the full obligation editor as an in-page workflow", async () => {
  await render(<DetailScreen />);
  await fireEvent.press(
    screen.getByRole("button", { name: "Edit obligation" }),
  );
  expect(screen.queryByRole("button", { name: "Close dialog" })).toBeNull();
  expect(screen.queryByText("Original")).toBeNull();
  await fireEvent.press(
    screen.getByRole("button", { name: "Back to obligation" }),
  );
  expect(screen.getByText("Original")).toBeTruthy();
  expect(mockExecute).not.toHaveBeenCalled();
});
