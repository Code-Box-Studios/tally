import { afterEach, expect, it, vi } from "vitest";
import { buildStatement } from "../src/features/statements/statement";
import { exportStatementPdf } from "../src/features/statements/export-pdf.web";
const statement = buildStatement({
  contact: { id: "alice", data: { name: "Alice" } },
  obligations: [],
  instances: [],
  payments: [],
  cached: false,
  issuedBy: "Jess",
  timezone: "Asia/Manila",
  generatedAt: "2026-10-11T12:00:00Z",
});
afterEach(() => vi.unstubAllGlobals());
it("prints only the generated statement and releases its opener reference", async () => {
  let html = "",
    printed = "";
  const popup = {
    opener: {},
    document: {
      open() {},
      write(value: string) {
        html = value;
      },
      close() {},
    },
    focus() {},
    print() {
      printed = html;
    },
    close() {},
  };
  vi.stubGlobal("window", { open: () => popup });
  await exportStatementPdf(statement, () => {});
  expect(printed).toContain("Statement of account");
  expect(printed).toContain("Alice");
  expect(popup.opener).toBeNull();
});
it("reports a blocked print window without silently claiming an export", async () => {
  vi.stubGlobal("window", { open: () => null });
  await expect(exportStatementPdf(statement, () => {})).rejects.toThrow(
    /pop-ups/i,
  );
});
it("does not open a private statement after the owner session changes", async () => {
  const open = vi.fn();
  vi.stubGlobal("window", { open });
  await expect(
    exportStatementPdf(statement, () => {
      throw new Error("Your sign-in changed.");
    }),
  ).rejects.toThrow("Your sign-in changed.");
  expect(open).not.toHaveBeenCalled();
});
