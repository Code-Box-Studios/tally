import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { CatalogForm } from "../src/features/people/catalog-form";
import { PaymentSourceField } from "../src/features/payment-sources/payment-source-field";

const mockExecute = jest.fn(async () => ({
  status: "synced",
  result: { id: "created-source", revision: 1 },
}));
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({ execute: mockExecute }),
}));
jest.mock("expo-router", () => ({ router: { push() {} } }));
jest.mock("../src/shared/queries", () => ({
  useRecords: () => ({
    data: {
      rows: [
        {
          id: "bpi-savings",
          data: {
            name: "BPI",
            nickname: "Savings",
            type: "bankAccount",
            lastFour: "1234",
            active: true,
            providerId: "bpi",
            iconKey: "bank",
          },
        },
        {
          id: "archived",
          data: { name: "GCash", type: "eWallet", active: false },
        },
      ],
    },
  }),
}));
jest.mock("../src/shared/theme", () => ({
  useTheme: () => ({
    background: "#fff",
    surface: "#fff",
    border: "#ddd",
    ink: "#111",
    primary: "#365",
    tint: "#eef",
    muted: "#555",
  }),
}));

beforeEach(() => mockExecute.mockClear());

it("finds a renamed bank through its previous name", async () => {
  await render(<CatalogForm kind="source" onDone={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: /Provider:/ }));
  await fireEvent.changeText(
    screen.getByLabelText("Search provider"),
    "seabank",
  );
  await fireEvent.press(screen.getByRole("radio", { name: "MariBank" }));
  expect(screen.getByLabelText("Name").props.value).toBe("MariBank");
});

it("adds a searched Philippine wallet through the existing catalog command", async () => {
  await render(<CatalogForm kind="source" onDone={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: /Provider:/ }));
  await fireEvent.changeText(screen.getByLabelText("Search provider"), "gcash");
  await fireEvent.press(screen.getByRole("radio", { name: "GCash" }));
  expect(screen.getByLabelText("Name").props.value).toBe("GCash");
  expect(
    screen.getByRole("button", { name: "Source type: E-wallet" }),
  ).toBeTruthy();
  await fireEvent.press(
    screen.getByRole("button", { name: "Add payment source" }),
  );
  expect(mockExecute).toHaveBeenCalledWith("saveCatalog", {
    kind: "source",
    id: null,
    expectedRevision: null,
    values: {
      name: "GCash",
      type: "eWallet",
      providerId: "gcash",
      iconKey: "wallet",
      nickname: null,
      lastFour: null,
      notes: "",
      active: true,
    },
  });
});

it("keeps the chosen provider when naming an account and persists a custom icon", async () => {
  await render(<CatalogForm kind="source" onDone={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: /Provider:/ }));
  await fireEvent.changeText(screen.getByLabelText("Search provider"), "bpi");
  await fireEvent.press(screen.getByRole("radio", { name: "BPI" }));
  await fireEvent.changeText(
    screen.getByLabelText("Name"),
    "My salary account",
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Add payment source" }),
  );
  expect(mockExecute).toHaveBeenCalledWith(
    "saveCatalog",
    expect.objectContaining({
      values: expect.objectContaining({
        name: "My salary account",
        providerId: "bpi",
        iconKey: "bank",
      }),
    }),
  );
});

it("lets a custom source choose and save its icon", async () => {
  await render(<CatalogForm kind="source" onDone={() => {}} />);
  await fireEvent.changeText(screen.getByLabelText("Name"), "Travel fund");
  await fireEvent.press(screen.getByRole("button", { name: /Source icon:/ }));
  await fireEvent.press(screen.getByRole("radio", { name: "Wallet" }));
  await fireEvent.press(
    screen.getByRole("button", { name: "Add payment source" }),
  );
  expect(mockExecute).toHaveBeenCalledWith(
    "saveCatalog",
    expect.objectContaining({
      values: expect.objectContaining({
        name: "Travel fund",
        providerId: null,
        iconKey: "wallet",
      }),
    }),
  );
});

it("keeps cards distinct from bank accounts when choosing a bank provider", async () => {
  await render(<CatalogForm kind="source" onDone={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: /Source type:/ }));
  await fireEvent.press(screen.getByRole("radio", { name: "Credit card" }));
  await fireEvent.press(screen.getByRole("button", { name: /Provider:/ }));
  await fireEvent.changeText(screen.getByLabelText("Search provider"), "bpi");
  await fireEvent.press(screen.getByRole("radio", { name: "BPI" }));
  expect(
    screen.getByRole("button", { name: "Source type: Credit card" }),
  ).toBeTruthy();
});

it("retains custom source details and revision when editing", async () => {
  await render(
    <CatalogForm
      kind="source"
      existing={{
        id: "custom",
        data: {
          name: "Family cash jar",
          type: "cash",
          nickname: "Household",
          revision: 4,
        },
      }}
      onDone={() => {}}
    />,
  );
  expect(screen.getByLabelText("Name").props.value).toBe("Family cash jar");
  await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  expect(mockExecute).toHaveBeenCalledWith(
    "saveCatalog",
    expect.objectContaining({
      id: "custom",
      expectedRevision: 4,
      values: expect.objectContaining({
        name: "Family cash jar",
        type: "cash",
        nickname: "Household",
      }),
    }),
  );
});

it("selects existing source identities and hides archived choices", async () => {
  const change = jest.fn();
  await render(<PaymentSourceField value="" onChange={change} />);
  await fireEvent.press(
    screen.getByRole("button", { name: "Payment source: None" }),
  );
  expect(screen.queryByRole("radio", { name: /GCash/ })).toBeNull();
  await fireEvent.press(
    screen.getByRole("radio", { name: /BPI.*Savings.*1234/ }),
  );
  expect(change).toHaveBeenCalledWith("bpi-savings");
});

it("adds a provider inline and selects its confirmed source ID", async () => {
  const change = jest.fn();
  await render(<PaymentSourceField value="" onChange={change} />);
  await fireEvent.press(
    screen.getByRole("button", { name: "Payment source: None" }),
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Add payment source" }),
  );
  await fireEvent.press(screen.getByRole("button", { name: /Provider:/ }));
  await fireEvent.changeText(screen.getByLabelText("Search provider"), "gcash");
  await fireEvent.press(screen.getByRole("radio", { name: "GCash" }));
  await fireEvent.press(
    screen.getByRole("button", { name: "Add payment source" }),
  );
  expect(change).toHaveBeenCalledWith("created-source");
});

it("waits for syncing before offering an offline source as a selectable record", async () => {
  mockExecute.mockResolvedValueOnce({
    status: "pending",
    result: null,
  } as never);
  const change = jest.fn();
  await render(<PaymentSourceField value="" onChange={change} />);
  await fireEvent.press(
    screen.getByRole("button", { name: "Payment source: None" }),
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Add payment source" }),
  );
  await fireEvent.changeText(screen.getByLabelText("Name"), "Travel fund");
  await fireEvent.press(
    screen.getByRole("button", { name: "Add payment source" }),
  );
  expect(change).not.toHaveBeenCalled();
  expect(
    screen.getByText(
      "Saved on this device. Your source will appear after syncing.",
    ),
  ).toBeTruthy();
});
