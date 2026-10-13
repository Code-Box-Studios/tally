import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { AttachmentsPanel } from "../src/features/attachments/attachments-panel";
const mockRepo = {};
const mockAdd = jest.fn();
const mockRefetch = jest.fn();
const mockRows = Array.from({ length: 10 }, (_, i) => ({
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
beforeEach(() => {
  mockAdd.mockReset();
  mockRefetch.mockReset();
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
