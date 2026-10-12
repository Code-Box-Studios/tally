import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { DateField } from "../src/shared/date-field";

jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({ profile: { timezone: "Asia/Manila" } }),
}));

function Host({
  initial = "2028-02-29",
  precision = "day",
  optional = false,
}: {
  initial?: string;
  precision?: "day" | "month";
  optional?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <DateField
      label="Date"
      value={value}
      onChange={setValue}
      today="2026-10-11"
      precision={precision}
      optional={optional}
    />
  );
}

it("cancels month navigation without changing the selected date", async () => {
  await render(<Host />);
  await fireEvent.press(
    screen.getByRole("button", { name: "Date: Feb 29, 2028" }),
  );
  expect(
    screen.getByRole("button", { name: "Feb 29, 2028" }).props
      .accessibilityState.selected,
  ).toBe(true);
  await fireEvent.press(screen.getByRole("button", { name: "Next month" }));
  expect(screen.getByRole("button", { name: "Mar 31, 2028" })).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  expect(
    screen.getByRole("button", { name: "Date: Feb 29, 2028" }),
  ).toBeTruthy();
  await fireEvent.press(
    screen.getByRole("button", { name: "Date: Feb 29, 2028" }),
  );
  expect(screen.getByRole("button", { name: "Feb 29, 2028" })).toBeTruthy();
});

it("limits calendar navigation to supported dates", async () => {
  await render(<Host initial="1900-01-01" />);
  await fireEvent.press(
    screen.getByRole("button", { name: "Date: Jan 1, 1900" }),
  );
  expect(
    screen.getByRole("button", { name: "Previous month" }).props
      .accessibilityState.disabled,
  ).toBe(true);
  await fireEvent.press(screen.getByRole("button", { name: "Choose year" }));
  expect(
    screen.getByRole("button", { name: "Previous years" }).props
      .accessibilityState.disabled,
  ).toBe(true);
});

it("keeps the final supported year inside the calendar", async () => {
  await render(<Host initial="2199-12-31" />);
  await fireEvent.press(
    screen.getByRole("button", { name: "Date: Dec 31, 2199" }),
  );
  expect(
    screen.getByRole("button", { name: "Next month" }).props.accessibilityState
      .disabled,
  ).toBe(true);
  await fireEvent.press(screen.getByRole("button", { name: "Choose year" }));
  expect(
    screen.getByRole("button", { name: "Next years" }).props.accessibilityState
      .disabled,
  ).toBe(true);
  expect(screen.queryByRole("button", { name: "2200" })).toBeNull();
});

it("uses the profile's civil date for Today", async () => {
  await render(<Host initial="" />);
  await fireEvent.press(
    screen.getByRole("button", { name: "Date: Choose a date" }),
  );
  expect(screen.queryByRole("button", { name: "Clear date" })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Today" }));
  expect(
    screen.getByRole("button", { name: "Date: Oct 11, 2026" }),
  ).toBeTruthy();
});

it("selects a month without requiring a day", async () => {
  await render(<Host initial="2026-12" precision="month" />);
  await fireEvent.press(
    screen.getByRole("button", { name: "Date: December 2026" }),
  );
  await fireEvent.press(screen.getByRole("button", { name: "Next year" }));
  await fireEvent.press(screen.getByRole("button", { name: "January" }));
  expect(
    screen.getByRole("button", { name: "Date: January 2027" }),
  ).toBeTruthy();
});
