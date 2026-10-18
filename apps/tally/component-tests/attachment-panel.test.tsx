import React from "react";
import {
  fireEvent,
  act,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native";
import { AttachmentsPanel } from "../src/features/attachments/attachments-panel";
const mockCommand = jest.fn();
const mockRepo = { command: mockCommand };
const mockAdd = jest.fn();
const mockRefetch = jest.fn();
const attachmentRows = Array.from({ length: 10 }, (_, i) => ({
  id: `file-${i}`,
  data: {
    userId: "owner",
    targetType: "obligation",
    targetId: "loan",
    filename: `receipt-${i}.pdf`,
    state: i === 9 ? "awaitingUpload" : "ready",
    revision: 1,
  },
}));
let mockRows = attachmentRows;
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({ repo: mockRepo }),
}));
jest.mock("../src/shared/queries", () => ({
  useRecords: () => ({ data: { rows: mockRows }, refetch: mockRefetch }),
}));
jest.mock("../src/features/attachments/attachment-service", () => ({
  addAttachment: (...args: unknown[]) => mockAdd(...args),
  downloadAttachment: jest.fn(),
}));
jest.mock("expo-crypto", () => ({ randomUUID: () => "remove-command" }));
beforeEach(() => {
  mockRows = attachmentRows;
  mockAdd.mockReset();
  mockRefetch.mockReset();
  mockCommand.mockReset().mockResolvedValue({});
});

it.each(["Cancel", "Close dialog", "Dismiss dialog"])(
  "keeps the selected file when removal is dismissed with %s",
  async (dismiss) => {
    await render(<AttachmentsPanel targetType="obligation" targetId="loan" />);
    await fireEvent.press(
      screen.getAllByRole("button", { name: "Remove file" })[5],
    );
    expect(mockCommand).not.toHaveBeenCalled();
    const dialog = within(screen.getByLabelText("Remove attachment"));
    expect(dialog.getByText("receipt-5.pdf")).toBeTruthy();
    await fireEvent.press(
      dialog.getByRole("button", {
        name: dismiss,
        includeHiddenElements: true,
      }),
    );
    expect(screen.queryByRole("button", { name: "Close dialog" })).toBeNull();
    expect(mockCommand).not.toHaveBeenCalled();
    expect(screen.getByText("receipt-5.pdf")).toBeTruthy();
  },
);

it("removes only the confirmed file and prevents repeated confirmation while saving", async () => {
  let finish!: () => void;
  mockCommand.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await render(<AttachmentsPanel targetType="obligation" targetId="loan" />);
  await fireEvent.press(
    screen.getAllByRole("button", { name: "Remove file" })[5],
  );
  const dialog = within(screen.getByLabelText("Remove attachment"));
  await fireEvent.press(dialog.getByRole("button", { name: "Remove file" }));
  expect(mockCommand).toHaveBeenCalledTimes(1);
  expect(mockCommand).toHaveBeenCalledWith(
    "removeAttachment",
    { attachmentId: "file-5", expectedRevision: 1 },
    "remove-command",
  );
  expect(dialog.getByRole("button", { name: "Removing…" })).toBeDisabled();
  await fireEvent.press(dialog.getByRole("button", { name: "Removing…" }));
  await fireEvent.press(dialog.getByRole("button", { name: "Close dialog" }));
  expect(screen.getByRole("button", { name: "Close dialog" })).toBeTruthy();
  expect(mockCommand).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish();
  });
  await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("button", { name: "Close dialog" })).toBeNull();
});

it("keeps a failed removal visible and retries with the refreshed file revision", async () => {
  mockCommand.mockRejectedValueOnce(new Error("File removal failed"));
  mockRefetch.mockImplementationOnce(async () => {
    mockRows = mockRows.map((row) =>
      row.id === "file-5"
        ? { ...row, data: { ...row.data, revision: 3 } }
        : row,
    );
  });
  await render(<AttachmentsPanel targetType="obligation" targetId="loan" />);
  await fireEvent.press(
    screen.getAllByRole("button", { name: "Remove file" })[5],
  );
  const dialog = within(screen.getByLabelText("Remove attachment"));
  await fireEvent.press(dialog.getByRole("button", { name: "Remove file" }));
  expect(await dialog.findByText("File removal failed")).toBeTruthy();
  expect(dialog.getByText("receipt-5.pdf")).toBeTruthy();
  expect(
    dialog.getByRole("button", { name: "Remove file" }),
  ).not.toBeDisabled();
  await fireEvent.press(dialog.getByRole("button", { name: "Remove file" }));
  await waitFor(() => expect(mockCommand).toHaveBeenCalledTimes(2));
  expect(mockCommand).toHaveBeenLastCalledWith(
    "removeAttachment",
    { attachmentId: "file-5", expectedRevision: 3 },
    "remove-command",
  );
  expect(screen.queryByRole("button", { name: "Close dialog" })).toBeNull();
});

it("blocks removal if refresh reports the selected file is no longer available", async () => {
  mockCommand.mockRejectedValueOnce(new Error("File removal failed"));
  mockRefetch.mockImplementationOnce(async () => {
    mockRows = mockRows.filter((row) => row.id !== "file-5");
  });
  await render(<AttachmentsPanel targetType="obligation" targetId="loan" />);
  await fireEvent.press(
    screen.getAllByRole("button", { name: "Remove file" })[5],
  );
  const dialog = within(screen.getByLabelText("Remove attachment"));
  await fireEvent.press(dialog.getByRole("button", { name: "Remove file" }));
  expect(await dialog.findByText("File removal failed")).toBeTruthy();
  expect(dialog.getByRole("button", { name: "Remove file" })).toBeDisabled();
  expect(dialog.getByText("This file is no longer available.")).toBeTruthy();
  await fireEvent.press(dialog.getByRole("button", { name: "Remove file" }));
  expect(mockCommand).toHaveBeenCalledTimes(1);
  await fireEvent.press(dialog.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("button", { name: "Close dialog" })).toBeNull();
});

it("allows retrying the tenth file while adding an eleventh remains disabled", async () => {
  await render(<AttachmentsPanel targetType="obligation" targetId="loan" />);
  expect(screen.getByRole("button", { name: "Add attachment" })).toBeDisabled();
  await fireEvent.press(screen.getByRole("button", { name: "Retry upload" }));
  await waitFor(() =>
    expect(mockAdd).toHaveBeenCalledWith(
      mockRepo,
      "obligation",
      "loan",
      mockRows[9],
    ),
  );
});

it("refreshes reservations after an interrupted transfer so retry remains discoverable", async () => {
  mockAdd.mockRejectedValue(new Error("Connection interrupted"));
  await render(<AttachmentsPanel targetType="obligation" targetId="loan" />);
  await fireEvent.press(screen.getByRole("button", { name: "Retry upload" }));
  await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
  expect(
    screen.getByRole("button", { name: "Retry upload" }),
  ).not.toBeDisabled();
});
