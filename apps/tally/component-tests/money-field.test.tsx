import React, { useState } from "react";
import { Text } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Field } from "../src/shared/ui";

jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({ profile: { timezone: "Asia/Manila" } }),
}));

function Host({ initial = "", money = true }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <Field
        label="Amount"
        money={money}
        value={value}
        onChangeText={setValue}
      />
      <Text testID="raw-value">{value}</Text>
    </>
  );
}

it("groups a populated amount and keeps its raw model value", async () => {
  await render(<Host initial="1234567.80" />);
  expect(screen.getByLabelText("Amount").props.value).toBe("1,234,567.80");
  expect(screen.getByTestId("raw-value")).toHaveTextContent("1234567.80");
});

it("groups while typing, preserves partial decimals, and allows clearing", async () => {
  await render(<Host />);
  for (const [typed, displayed, raw] of [
    ["1", "1", "1"],
    ["10", "10", "10"],
    ["100", "100", "100"],
    ["1000", "1,000", "1000"],
    ["1,000.", "1,000.", "1000."],
    ["1,000.0", "1,000.0", "1000.0"],
    ["1,000.00", "1,000.00", "1000.00"],
    ["", "", ""],
  ]) {
    await fireEvent.changeText(screen.getByLabelText("Amount"), typed);
    expect(screen.getByLabelText("Amount").props.value).toBe(displayed);
    expect(screen.getByTestId("raw-value").props.children).toBe(raw);
  }
});

it("keeps the caret beside an inserted digit when regrouping the middle", async () => {
  await render(<Host initial="1234.50" />);
  await fireEvent(screen.getByLabelText("Amount"), "selectionChange", {
    nativeEvent: { selection: { start: 3, end: 3 } },
  });
  await fireEvent.changeText(screen.getByLabelText("Amount"), "1,2934.50");
  expect(screen.getByLabelText("Amount").props.value).toBe("12,934.50");
  expect(screen.getByLabelText("Amount").props.selection).toEqual({
    start: 4,
    end: 4,
  });
});

it("keeps a middle insertion among repeated digits at its selected position", async () => {
  await render(<Host initial="1111" />);
  await fireEvent(screen.getByLabelText("Amount"), "selectionChange", {
    nativeEvent: { selection: { start: 3, end: 3 } },
  });
  await fireEvent.changeText(screen.getByLabelText("Amount"), "1,1111");
  expect(screen.getByLabelText("Amount").props.value).toBe("11,111");
  expect(screen.getByLabelText("Amount").props.selection).toEqual({
    start: 4,
    end: 4,
  });
});

it.each([
  [2, "234.50", 0],
  [1, "134.50", 1],
])(
  "deletes the adjacent digit when a separator is removed at %s",
  async (caret, expected, nextCaret) => {
    await render(<Host initial="1234.50" />);
    await fireEvent(screen.getByLabelText("Amount"), "selectionChange", {
      nativeEvent: { selection: { start: caret, end: caret } },
    });
    await fireEvent.changeText(screen.getByLabelText("Amount"), "1234.50");
    expect(screen.getByLabelText("Amount").props.value).toBe(expected);
    expect(screen.getByLabelText("Amount").props.selection).toEqual({
      start: nextCaret,
      end: nextCaret,
    });
  },
);

it("retains invalid symbols so payment validation can reject them", async () => {
  await render(<Host />);
  await fireEvent.changeText(screen.getByLabelText("Amount"), "1,234e2");
  expect(screen.getByLabelText("Amount").props.value).toBe("1234e2");
  expect(screen.getByTestId("raw-value")).toHaveTextContent("1234e2");
});

it("leaves non-money fields unchanged", async () => {
  await render(<Host money={false} initial="1000" />);
  expect(screen.getByLabelText("Amount").props.value).toBe("1000");
  await fireEvent.changeText(screen.getByLabelText("Amount"), "1,000");
  expect(screen.getByTestId("raw-value")).toHaveTextContent("1,000");
});
