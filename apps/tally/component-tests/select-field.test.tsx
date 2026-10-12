import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SelectField } from "../src/shared/select-field";
import { Button, Txt } from "../src/shared/ui";

jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({ profile: { timezone: "Asia/Manila" } }),
}));

function Host() {
  const [value, setValue] = useState("rent");
  const [adding, setAdding] = useState(false);
  return (
    <>
      <SelectField
        label="Category"
        value={value}
        options={[
          { value: "rent", label: "Rent", icon: "home", searchText: "Housing" },
          {
            value: "custom",
            label: "Custom",
            leading: <Txt>Custom badge</Txt>,
          },
        ]}
        onChange={setValue}
        searchable
        footer={<Button title="Add category" onPress={() => setAdding(true)} />}
      />
      {adding ? <Txt>Adding category</Txt> : null}
    </>
  );
}

it("clears the picker search so a user can choose another category", async () => {
  await render(<Host />);
  await fireEvent.press(screen.getByRole("button", { name: "Category: Rent" }));
  await fireEvent.changeText(
    screen.getByLabelText("Search category"),
    "housing",
  );
  expect(screen.getByRole("radio", { name: "Rent" })).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("Search category"), "rent");
  expect(screen.queryByRole("radio", { name: "Custom" })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Clear search" }));
  await fireEvent.press(screen.getByRole("radio", { name: "Custom" }));
  expect(screen.getByRole("button", { name: "Category: Custom" })).toBeTruthy();
  expect(screen.getByText("Custom badge")).toBeTruthy();
});

it("makes the category creation action available from the picker", async () => {
  await render(<Host />);
  await fireEvent.press(screen.getByRole("button", { name: "Category: Rent" }));
  await fireEvent.press(screen.getByRole("button", { name: "Add category" }));
  expect(screen.getByText("Adding category")).toBeTruthy();
});
