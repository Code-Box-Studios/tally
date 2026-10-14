import React from "react";
import { render, fireEvent, screen } from "@testing-library/react-native";
import type { Row } from "../src/core/domain/records";
import { PayoffSimulator } from "../src/features/payoff/payoff-simulator";

jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({ profile: { timezone: "Asia/Manila" } }),
}));

const obligation: Row = {
  id: "loan",
  data: {
    title: "Personal loan",
    type: "loan",
    section: "owedByMe",
    lifecycle: "active",
    currency: "PHP",
    originationDate: "2026-01-01",
    dueDate: "2026-04-30",
    originalAmountMinor: 30000,
    totalPaidMinor: 0,
    remainingMinor: 30000,
    interestInfo: {
      calculationVersion: 2,
      principalMinor: 25000,
      interestMinor: 5000,
      totalMinor: 30000,
      method: { kind: "compound", intervalDays: 30 },
    },
  },
};

it("updates the payoff date when extra payments change while preserving fixed interest", async () => {
  await render(
    <PayoffSimulator
      obligation={obligation}
      instances={[]}
      today="2026-01-31"
    />,
  );
  expect(screen.getByText("Same payoff date")).toBeTruthy();
  await fireEvent.changeText(
    screen.getByLabelText("Extra monthly payment (PHP)"),
    "100",
  );
  expect(screen.getByText("Mar 31, 2026")).toBeTruthy();
  expect(screen.getByText("30 days earlier")).toBeTruthy();
  expect(screen.getByText(/Fixed interest is already included/)).toBeTruthy();
  expect(screen.getByText(/Interest savings: ₱0.00/)).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: /save|record payment/i }),
  ).toBeNull();
  expect(obligation.data.remainingMinor).toBe(30000);
});

it("labels monthly plans as hypothetical when no due date is saved", async () => {
  await render(
    <PayoffSimulator
      obligation={{
        ...obligation,
        data: { ...obligation.data, dueDate: null },
      }}
      instances={[]}
      today="2026-01-31"
    />,
  );
  expect(screen.getByText(/No due date is saved/)).toBeTruthy();
  await fireEvent.changeText(
    screen.getByLabelText("Planned monthly payment (PHP)"),
    "100",
  );
  expect(screen.getByText("Your monthly plan")).toBeTruthy();
  expect(screen.getAllByText("Mar 31, 2026")).toHaveLength(2);
  await fireEvent.changeText(
    screen.getByLabelText("Extra monthly payment (PHP)"),
    "50",
  );
  expect(screen.getByText("Feb 28, 2026")).toBeTruthy();
  expect(screen.getByText(/This is a hypothetical monthly plan/)).toBeTruthy();
});

it("replaces estimates with validation feedback for invalid extra payment amounts", async () => {
  await render(
    <PayoffSimulator
      obligation={obligation}
      instances={[]}
      today="2026-01-31"
    />,
  );
  await fireEvent.changeText(
    screen.getByLabelText("Extra monthly payment (PHP)"),
    "-1",
  );
  expect(screen.getByText(/decimal places/)).toBeTruthy();
  expect(screen.queryByText("Same payoff date")).toBeNull();
});

it("blocks estimates for an incomplete installment schedule", async () => {
  await render(
    <PayoffSimulator
      obligation={{
        ...obligation,
        data: {
          ...obligation.data,
          type: "installment",
          installmentInstanceIds: ["first", "last"],
        },
      }}
      instances={[]}
      today="2026-01-31"
    />,
  );
  expect(screen.getByText(/complete installment schedule/)).toBeTruthy();
  expect(screen.queryByLabelText("Extra monthly payment (PHP)")).toBeNull();
});

it("shows settled loans without a future projection", async () => {
  await render(
    <PayoffSimulator
      obligation={{
        ...obligation,
        data: { ...obligation.data, totalPaidMinor: 30000, remainingMinor: 0 },
      }}
      instances={[]}
      today="2026-01-31"
    />,
  );
  expect(screen.getByText(/already paid/)).toBeTruthy();
  expect(screen.queryByLabelText("Extra monthly payment (PHP)")).toBeNull();
});

it("accepts zero extra payments but rejects fractional JPY amounts", async () => {
  await render(
    <PayoffSimulator
      obligation={{
        ...obligation,
        data: { ...obligation.data, currency: "JPY" },
      }}
      instances={[]}
      today="2026-01-31"
    />,
  );
  expect(screen.getByText("Same payoff date")).toBeTruthy();
  await fireEvent.changeText(
    screen.getByLabelText("Extra monthly payment (JPY)"),
    "0.00",
  );
  expect(screen.getByText("JPY uses whole amounts.")).toBeTruthy();
});
