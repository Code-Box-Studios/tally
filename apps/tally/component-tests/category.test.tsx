import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { CategoryField } from "../src/features/categories/category-field";
import { CategoryForm } from "../src/features/categories/category-form";
import type { Row } from "../src/core/domain/records";

const mockExecute = jest.fn(
  async (): Promise<{
    status: string;
    result: { id: string; revision: number } | null;
  }> => ({ status: "synced", result: { id: "custom", revision: 1 } }),
);
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({
    profile: { timezone: "Asia/Manila" },
    execute: mockExecute,
  }),
}));
beforeEach(() => mockExecute.mockClear());

function Host() {
  const [value, setValue] = useState("default-rent");
  return (
    <CategoryField
      rows={[
        {
          id: "default-rent",
          data: { name: "Rent", isDefault: true, active: true, revision: 1 },
        },
      ]}
      value={value}
      onChange={setValue}
    />
  );
}

it("creates a custom category from the picker and selects its returned id", async () => {
  await render(<Host />);
  await fireEvent.press(screen.getByRole("button", { name: "Category: Rent" }));
  await fireEvent.press(screen.getByRole("button", { name: "Add category" }));
  await fireEvent.changeText(screen.getByLabelText("Category name"), "Travel");
  await fireEvent.press(screen.getByRole("radio", { name: "Travel icon" }));
  await fireEvent.press(screen.getByRole("button", { name: "Add category" }));
  expect(mockExecute).toHaveBeenCalledWith("saveCatalog", {
    kind: "category",
    id: null,
    expectedRevision: null,
    values: { name: "Travel", active: true, iconKey: "plane" },
  });
  expect(screen.getByRole("button", { name: "Category: Travel" })).toBeTruthy();
});

it("edits the icon and availability using the current category revision", async () => {
  const category: Row = {
    id: "custom",
    data: { name: "Custom", iconKey: "plane", active: true, revision: 3 },
  };
  await render(<CategoryForm existing={category} onDone={() => {}} />);
  expect(
    screen.getByRole("radio", { name: "Travel icon" }).props.accessibilityState
      .checked,
  ).toBe(true);
  await fireEvent.press(screen.getByRole("radio", { name: "Gift icon" }));
  await fireEvent.press(screen.getByRole("radio", { name: "No" }));
  await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  expect(mockExecute).toHaveBeenCalledWith("saveCatalog", {
    kind: "category",
    id: "custom",
    expectedRevision: 3,
    values: { name: "Custom", active: false, iconKey: "gift" },
  });
});

it("keeps the selected archived category available while excluding other archived choices", async () => {
  await render(
    <CategoryField
      rows={[
        { id: "selected", data: { name: "Old category", active: false } },
        { id: "hidden", data: { name: "Other archived", active: false } },
        { id: "active", data: { name: "Active", active: true } },
      ]}
      value="selected"
      onChange={() => {}}
    />,
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Category: Old category" }),
  );
  expect(screen.getByRole("radio", { name: "Old category" })).toBeTruthy();
  expect(screen.getByRole("radio", { name: "Active" })).toBeTruthy();
  expect(screen.queryByRole("radio", { name: "Other archived" })).toBeNull();
});

it("shows queued feedback instead of selecting an invented category id offline", async () => {
  mockExecute.mockResolvedValueOnce({ status: "pending", result: null });
  await render(<Host />);
  await fireEvent.press(screen.getByRole("button", { name: "Category: Rent" }));
  await fireEvent.press(screen.getByRole("button", { name: "Add category" }));
  await fireEvent.changeText(
    screen.getByLabelText("Category name"),
    "Offline category",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Add category" }));
  expect(
    screen.getByText("Category saved for sync. It will appear after syncing."),
  ).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByRole("button", { name: "Category: Rent" })).toBeTruthy();
});
