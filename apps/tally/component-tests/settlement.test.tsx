import type { Data, Row } from "../src/core/domain/records";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SettlementPanel } from "../src/features/statements/settlement-panel";
const mockInvoke = jest.fn();
const mockCheck = jest.fn();
const mockExport = jest.fn();
let mockPending: { status: string }[] = [];
const mockRepo = { invoke: mockInvoke, check: mockCheck, owner: "jess" };
jest.mock("../src/features/auth/session-provider", () => ({
  useSession: () => ({ repo: mockRepo, pending: mockPending }),
}));
jest.mock("../src/shared/pdf-export", () => ({
  exportHtmlPdf: (...args: unknown[]) => mockExport(...args),
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
const row = (id: string, data: Data): Row => ({
  id,
  data: { userId: "jess", schemaVersion: 1, ...data },
});
const fixture = () => ({
  obligation: row("loan", {
    title: "Tuition loan",
    contactId: "alice",
    type: "owedToMe",
    section: "owedToMe",
    direction: "owedToMe",
    lifecycle: "active",
    financialStatus: "paid",
    currency: "PHP",
    originalAmountMinor: 10000,
    totalPaidMinor: 10000,
    remainingMinor: 0,
  }),
  contact: row("alice", { name: "Alice" }),
  instances: [],
  evidence: [],
  payments: [
    row("p1", {
      obligationId: "loan",
      currency: "PHP",
      direction: "owedToMe",
      amountMinor: 10000,
      provenance: "manual",
      entryType: "payment",
      paymentDate: "2026-10-01",
    }),
  ],
  issuedBy: "Jess",
  timezone: "Asia/Manila",
  generatedAt: "2026-10-15T12:00:00Z",
});
beforeEach(() => {
  mockPending = [];
  mockInvoke.mockReset().mockResolvedValue(fixture());
  mockCheck.mockReset();
  mockExport.mockReset().mockImplementation(async (_title, prepare, check) => {
    check();
    const html = await prepare();
    check();
    return html;
  });
});
it("previews a settled loan and rechecks online before every PDF export", async () => {
  await render(<SettlementPanel obligationId="loan" onDone={() => {}} />);
  expect(await screen.findByText("Alice")).toBeTruthy();
  expect(screen.getByText("Oct 1, 2026")).toBeTruthy();
  expect(mockInvoke).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole("button", { name: "Export PDF" }));
  expect(mockInvoke).toHaveBeenCalledTimes(2);
  expect(mockExport).toHaveBeenCalledTimes(1);
  expect(await mockExport.mock.results[0].value).toContain(
    "Paid-in-full confirmation",
  );
});
it("rejects a balance changed after preview instead of exporting the old snapshot", async () => {
  await render(<SettlementPanel obligationId="loan" onDone={() => {}} />);
  await screen.findByText("Alice");
  const changed = fixture();
  changed.obligation.data.remainingMinor = 500;
  mockInvoke.mockResolvedValue(changed);
  await fireEvent.press(screen.getByRole("button", { name: "Export PDF" }));
  expect(await screen.findByText(/Only a fully paid loan/)).toBeTruthy();
  expect(screen.queryByText("Alice")).toBeNull();
});
it("blocks pending changes and allows retry after synchronization", async () => {
  mockPending = [{ status: "review" }];
  const view = await render(
    <SettlementPanel obligationId="loan" onDone={() => {}} />,
  );
  expect(await screen.findByText(/Sync or discard/)).toBeTruthy();
  expect(mockInvoke).not.toHaveBeenCalled();
  mockPending = [];
  await view.rerender(
    <SettlementPanel obligationId="loan" onDone={() => {}} />,
  );
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Alice")).toBeTruthy();
});
it("shows an offline error without presenting a cached paid confirmation", async () => {
  mockInvoke.mockRejectedValue(
    new Error("Connection unavailable. Try again online."),
  );
  await render(<SettlementPanel obligationId="loan" onDone={() => {}} />);
  expect(await screen.findByText(/Connection unavailable/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Export PDF" })).toBeNull();
});

it("does not publish a PDF after closing the panel during its fresh-record check", async () => {
  const published = jest.fn();
  mockExport.mockImplementation(async (_title, prepare, check) => {
    const html = await prepare();
    check();
    published(html);
  });
  const view = await render(
    <SettlementPanel obligationId="loan" onDone={() => {}} />,
  );
  await screen.findByText("Alice");
  let resolve!: (value: ReturnType<typeof fixture>) => void;
  mockInvoke.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await fireEvent.press(screen.getByRole("button", { name: "Export PDF" }));
  await view.unmount();
  await act(async () => {
    resolve(fixture());
  });
  expect(published).not.toHaveBeenCalled();
});
