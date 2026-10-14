import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ReceiptScanReview } from "../src/features/payments/receipt-scan-review";

const mockScan = jest.fn();
jest.mock("../src/features/payments/receipt-ocr", () => ({
  scanReceiptImage: (options: unknown) => mockScan(options),
}));
jest.mock("../src/shared/theme", () => ({
  useTheme: () => ({
    surface: "#fff",
    ink: "#111",
    muted: "#555",
    border: "#ddd",
    primary: "#365",
    background: "#fff",
  }),
}));
beforeEach(() => mockScan.mockReset());

it("requires review and applies the edited fields only after an explicit action", async () => {
  mockScan.mockResolvedValue(
    "Amount paid PHP 250.00\n2026-10-14\nReference No. 001234",
  );
  const apply = jest.fn();
  await render(
    <ReceiptScanReview ownerKey="alice" currency="PHP" onApply={apply} />,
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Scan receipt or screenshot" }),
  );
  expect(await screen.findByDisplayValue("250.00")).toBeTruthy();
  expect(apply).not.toHaveBeenCalled();
  await fireEvent.changeText(
    screen.getByLabelText("Scanned amount (PHP)"),
    "240.00",
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Use reviewed details" }),
  );
  expect(apply).toHaveBeenCalledWith({
    amount: "240.00",
    paymentDate: "2026-10-14",
    reference: "001234",
  });
});

it("shows ambiguity and permits choosing a date without inventing an amount", async () => {
  mockScan.mockResolvedValue("Date 03/04/2026");
  const apply = jest.fn();
  await render(
    <ReceiptScanReview ownerKey="alice" currency="PHP" onApply={apply} />,
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Scan receipt or screenshot" }),
  );
  await screen.findByText(/Several dates found/);
  await fireEvent.press(
    screen.getByRole("button", { name: "Use date 2026-04-03" }),
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Use reviewed details" }),
  );
  expect(apply).toHaveBeenCalledWith({ paymentDate: "2026-04-03" });
});

it("cancels an in-flight scan and ignores its late result", async () => {
  let finish!: (text: string) => void;
  mockScan.mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  const apply = jest.fn();
  await render(
    <ReceiptScanReview ownerKey="alice" currency="PHP" onApply={apply} />,
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Scan receipt or screenshot" }),
  );
  const signal = mockScan.mock.calls[0][0].signal as AbortSignal;
  await fireEvent.press(screen.getByRole("button", { name: "Cancel scan" }));
  expect(signal.aborted).toBe(true);
  await act(() => finish("Total PHP 999.00"));
  expect(screen.queryByDisplayValue("999.00")).toBeNull();
  expect(apply).not.toHaveBeenCalled();
});

it("clears private review data and rejects late OCR after an owner change", async () => {
  let finish!: (text: string) => void;
  mockScan.mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  const apply = jest.fn();
  const view = await render(
    <ReceiptScanReview ownerKey="alice" currency="PHP" onApply={apply} />,
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Scan receipt or screenshot" }),
  );
  await view.rerender(
    <ReceiptScanReview ownerKey="bob" currency="PHP" onApply={apply} />,
  );
  await act(() => finish("Total PHP 999.00\nReference 001234"));
  expect(screen.queryByDisplayValue("999.00")).toBeNull();
  expect(screen.queryByDisplayValue("001234")).toBeNull();
  expect(apply).not.toHaveBeenCalled();
});

it("rejects invalid edited dates and preserves manual entry after OCR failure", async () => {
  mockScan
    .mockResolvedValueOnce("Total PHP 20.00")
    .mockRejectedValueOnce(new Error("Image could not be read."));
  const apply = jest.fn();
  await render(
    <ReceiptScanReview ownerKey="alice" currency="PHP" onApply={apply} />,
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Scan receipt or screenshot" }),
  );
  await screen.findByDisplayValue("20.00");
  await fireEvent.changeText(
    screen.getByLabelText("Scanned date (YYYY-MM-DD)"),
    "2026-02-30",
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Use reviewed details" }),
  );
  expect(apply).not.toHaveBeenCalled();
  expect(await screen.findByText("Enter a valid calendar date.")).toBeTruthy();
  await fireEvent.press(
    screen.getByRole("button", { name: "Scan receipt or screenshot" }),
  );
  expect(await screen.findByText("Image could not be read.")).toBeTruthy();
  expect(apply).not.toHaveBeenCalled();
});
