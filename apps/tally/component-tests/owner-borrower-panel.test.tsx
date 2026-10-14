import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { OwnerBorrowerPanel } from "../src/features/borrowers/owner-borrower-panel";
import type { Data, Row } from "../src/core/domain/records";

const mockInvoke = jest.fn(),
  mockCommand = jest.fn(),
  mockDownload = jest.fn(),
  mockCheck = jest.fn();
const mockIntents = new Map<string, string>();
let mockOwner = "owner";
jest.mock("expo-crypto", () => ({ randomUUID: () => "test-uuid" }));
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({
    repo: {
      owner: mockOwner,
      namespace: "test",
      prefix: `test:${mockOwner}:`,
      check: mockCheck,
      invoke: mockInvoke,
      command: mockCommand,
      transferIntent: async (key: string, value?: string | null) => {
        if (value === undefined) return mockIntents.get(key) ?? null;
        if (value === null) mockIntents.delete(key);
        else mockIntents.set(key, value);
        return value;
      },
    },
  }),
}));
jest.mock("../src/shared/queries", () => ({
  useRecords: () => ({
    data: {
      rows: [{ id: "bank", data: { name: "Bank", active: true } }],
      cached: false,
    },
    isPending: false,
  }),
}));
jest.mock("../src/features/attachments/attachment-service", () => ({
  downloadAttachment: (...args: unknown[]) => mockDownload(...args),
}));
jest.mock("../src/shared/theme", () => ({
  useTheme: () => ({
    surface: "#fff",
    ink: "#111",
    muted: "#555",
    border: "#ddd",
    primary: "#365",
    background: "#fff",
    tint: "#eef",
  }),
}));
const loan: Row = {
  id: "loan",
  data: {
    userId: "owner",
    schemaVersion: 1,
    title: "Tuition",
    type: "owedToMe",
    direction: "owedToMe",
    lifecycle: "active",
    remainingMinor: 30000,
    currency: "PHP",
  },
};
const submission: Data = {
  submissionId: "proof",
  shareId: "share",
  obligationId: "loan",
  amountMinor: 10000,
  currency: "PHP",
  paymentDate: "2026-10-01",
  reference: "REF-123",
  message: "First payment",
  status: "pending",
  reason: "",
  paymentId: null,
};
const activeShare: Data = {
  shareId: "share",
  userId: "owner",
  obligationId: "loan",
  inviteEmail: "alice@example.com",
  status: "active",
  borrowerId: "alice",
};
let response: Data;
beforeEach(() => {
  mockOwner = "owner";
  mockIntents.clear();
  mockInvoke.mockReset();
  mockCommand.mockReset();
  mockDownload.mockReset();
  mockCheck.mockReset();
  response = { shares: [], submissions: [], attachments: [] };
  mockInvoke.mockImplementation(async () => response);
});
async function mount(obligation = loan, onDone?: () => void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const view = await render(
    <QueryClientProvider client={client}>
      <OwnerBorrowerPanel obligation={obligation} onDone={onDone} />
    </QueryClientProvider>,
  );
  return { ...view, client };
}

it("retains rejection and revocation after a loan currency edit without approving old-currency proof", async () => {
  response = {
    shares: [activeShare],
    submissions: [submission],
    attachments: [],
  };
  await mount({ ...loan, data: { ...loan.data, currency: "JPY" } });
  expect(await screen.findByText(/₱100.00 PHP/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Revoke access" })).toBeTruthy();
  await fireEvent.press(
    screen.getByRole("button", { name: "Review approval" }),
  );
  expect(
    screen.queryByRole("button", { name: "Approve and record payment" }),
  ).toBeNull();
  await fireEvent.changeText(
    screen.getByLabelText("Rejection reason"),
    "Loan currency changed; please resubmit.",
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Review rejection" }),
  );
  expect(screen.getByRole("button", { name: "Reject proof" })).toBeTruthy();
  expect(mockCommand).not.toHaveBeenCalled();
});

it("loads without writing and creates an email-bound invitation only after confirmation", async () => {
  const done = jest.fn();
  await mount(loan, done);
  await screen.findByLabelText("Borrower email");
  expect(mockCommand).not.toHaveBeenCalled();
  expect(screen.getByText(/verified email/)).toBeTruthy();
  await fireEvent.changeText(
    screen.getByLabelText("Borrower email"),
    " Alice@Example.com ",
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Review invitation" }),
  );
  expect(mockCommand).not.toHaveBeenCalled();
  mockCommand.mockImplementation(async () => {
    response = {
      ...response,
      shares: [{ ...activeShare, status: "invited", borrowerId: null }],
    };
    return { shareId: "share" };
  });
  await fireEvent.press(
    screen.getByRole("button", { name: "Create invitation" }),
  );
  await screen.findByText("Invited · alice@example.com");
  expect(mockCommand).toHaveBeenCalledWith(
    "createBorrowerShare",
    { obligationId: "loan", email: "alice@example.com" },
    "test-uuid",
  );
  expect(
    screen.getByText(/https:\/\/tally-code-box-studios.vercel.app\/borrower/),
  ).toBeTruthy();
  expect(done).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(done).toHaveBeenCalledTimes(1);
});

it("confirms revocation while retaining submitted proofs for review", async () => {
  response = {
    shares: [activeShare],
    submissions: [submission],
    attachments: [],
  };
  await mount();
  await screen.findByText("Active · alice@example.com");
  await fireEvent.press(screen.getByRole("button", { name: "Revoke access" }));
  expect(mockCommand).not.toHaveBeenCalled();
  expect(screen.getByText(/Received proofs remain available/)).toBeTruthy();
  mockCommand.mockImplementation(async () => {
    response = { ...response, shares: [{ ...activeShare, status: "revoked" }] };
    return { shareId: "share" };
  });
  await fireEvent.press(screen.getByRole("button", { name: "Confirm revoke" }));
  await screen.findByText("Revoked · alice@example.com");
  expect(screen.getByText("REF-123")).toBeTruthy();
});

it("requires an approval preview and keeps amount/date immutable", async () => {
  response = {
    shares: [activeShare],
    submissions: [submission],
    attachments: [],
  };
  await mount();
  await screen.findByText("REF-123");
  expect(screen.queryByLabelText("Payment amount")).toBeNull();
  await fireEvent.press(
    screen.getByRole("button", { name: "Review approval" }),
  );
  expect(mockCommand).not.toHaveBeenCalled();
  expect(screen.getByText(/reduces the balance/)).toBeTruthy();
  mockCommand.mockImplementation(async () => {
    response = {
      ...response,
      submissions: [
        { ...submission, status: "approved", paymentId: "payment" },
      ],
    };
    return { submissionId: "proof", paymentId: "payment" };
  });
  await fireEvent.press(
    screen.getByRole("button", { name: "Approve and record payment" }),
  );
  await screen.findByText("Approved");
  expect(mockCommand).toHaveBeenCalledWith(
    "reviewBorrowerSubmission",
    {
      submissionId: "proof",
      decision: "approve",
      reason: "",
      paymentMethod: "cash",
      paymentSourceId: null,
    },
    "review-proof",
  );
  expect(mockIntents.size).toBe(0);
});

it("restores an ambiguous review after remount and retries the identical payload after refreshing", async () => {
  response = { shares: [], submissions: [submission], attachments: [] };
  const first = await mount();
  await screen.findByText("REF-123");
  await fireEvent.press(
    screen.getByRole("button", { name: "Review approval" }),
  );
  mockCommand.mockRejectedValueOnce(
    Object.assign(new Error("Connection lost"), { code: "unavailable" }),
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Approve and record payment" }),
  );
  await screen.findByText(/Connection lost/);
  const original = mockCommand.mock.calls[0];
  await first.unmount();
  await mount();
  await screen.findByRole("button", { name: "Refresh and retry saved review" });
  expect(screen.queryByText("Payment method")).toBeNull();
  const reads = mockInvoke.mock.calls.length;
  mockCommand.mockImplementation(async () => {
    expect(mockInvoke.mock.calls.length).toBeGreaterThan(reads);
    response = {
      ...response,
      submissions: [
        { ...submission, status: "approved", paymentId: "payment" },
      ],
    };
    return { submissionId: "proof", paymentId: "payment" };
  });
  await fireEvent.press(
    screen.getByRole("button", { name: "Refresh and retry saved review" }),
  );
  await screen.findByText("Approved");
  expect(mockCommand.mock.calls[1]).toEqual(original);
});

it("requires a rejection reason and never invites for a payable", async () => {
  response = { shares: [], submissions: [submission], attachments: [] };
  await mount({
    ...loan,
    data: { ...loan.data, type: "owedByMe", direction: "owedByMe" },
  });
  await screen.findByText("REF-123");
  expect(screen.queryByLabelText("Borrower email")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Review rejection" }),
  ).toBeDisabled();
  await fireEvent.changeText(
    screen.getByLabelText("Rejection reason"),
    "Receipt does not match",
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Review rejection" }),
  );
  mockCommand.mockImplementation(async () => {
    response = {
      ...response,
      submissions: [
        { ...submission, status: "rejected", reason: "Receipt does not match" },
      ],
    };
    return { submissionId: "proof", paymentId: null };
  });
  await fireEvent.press(screen.getByRole("button", { name: "Reject proof" }));
  await screen.findByText("Rejected");
  expect(mockCommand.mock.calls[0][1]).toMatchObject({
    decision: "reject",
    reason: "Receipt does not match",
  });
});

it("refuses unrelated records and hides private data after an owner switch", async () => {
  response = {
    shares: [
      {
        ...activeShare,
        obligationId: "unrelated",
        inviteEmail: "private@example.com",
      },
    ],
    submissions: [],
    attachments: [],
  };
  const view = await mount();
  await screen.findByText(/could not be verified/);
  expect(screen.queryByText(/private@example.com/)).toBeNull();
  mockOwner = "different";
  await act(async () =>
    view.rerender(
      <QueryClientProvider client={view.client}>
        <OwnerBorrowerPanel obligation={loan} />
      </QueryClientProvider>,
    ),
  );
  expect(screen.queryByText(/alice@example.com/)).toBeNull();
  expect(mockCommand).not.toHaveBeenCalled();
});

it("downloads only a submitted private receipt and hides draft receipt metadata", async () => {
  const receipt = {
    attachmentId: "receipt",
    userId: "owner",
    obligationId: "loan",
    targetType: "borrowerSubmission",
    targetId: "proof",
    state: "ready",
    filename: "payment.png",
    sizeBytes: 5,
    sha256: "hash",
    contentType: "image/png",
  };
  response = {
    shares: [],
    submissions: [submission],
    attachments: [
      receipt,
      {
        ...receipt,
        attachmentId: "draft-receipt",
        targetId: "draft",
        filename: "private-draft.png",
      },
    ],
  };
  await mount();
  await screen.findByText("REF-123");
  expect(screen.queryByText(/private-draft/)).toBeNull();
  await fireEvent.press(
    screen.getByRole("button", { name: "Download payment.png" }),
  );
  expect(mockDownload).toHaveBeenCalledWith(
    expect.objectContaining({ owner: "owner" }),
    { id: "receipt", data: receipt },
  );
});

it("refreshes an already approved uncertain review without recording it again", async () => {
  mockIntents.set(
    "test:owner:upload:borrower-review:proof",
    JSON.stringify({
      submissionId: "proof",
      decision: "approve",
      reason: "",
      paymentMethod: "bankTransfer",
      paymentSourceId: "bank",
    }),
  );
  response = { shares: [], submissions: [submission], attachments: [] };
  await mount();
  await screen.findByRole("button", { name: "Refresh and retry saved review" });
  response = {
    ...response,
    submissions: [{ ...submission, status: "approved", paymentId: "payment" }],
  };
  await fireEvent.press(
    screen.getByRole("button", { name: "Refresh and retry saved review" }),
  );
  await screen.findByText("Approved");
  expect(mockCommand).not.toHaveBeenCalled();
  expect(mockIntents.size).toBe(0);
});

it("requires reviewing a different saved decision discovered in another tab", async () => {
  response = { shares: [], submissions: [submission], attachments: [] };
  await mount();
  await screen.findByText("REF-123");
  await fireEvent.press(
    screen.getByRole("button", { name: "Review approval" }),
  );
  mockIntents.set(
    "test:owner:upload:borrower-review:proof",
    JSON.stringify({
      submissionId: "proof",
      decision: "reject",
      reason: "Different saved decision",
      paymentMethod: "cash",
      paymentSourceId: null,
    }),
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Approve and record payment" }),
  );
  await screen.findByText(/Different saved decision/);
  expect(mockCommand).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Refresh and retry saved review" }),
  ).toBeTruthy();
});
