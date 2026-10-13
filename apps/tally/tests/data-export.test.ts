import { describe, expect, it } from "vitest";
import {
  collectExport,
  exportCollections,
  paymentsCsv,
  type RecordExport,
} from "../src/features/settings/data-export";
import type { Profile, Row } from "../src/core/domain/records";
import type { TallyRepository } from "../src/core/backend/repository";

const profile = {
  userId: "owner",
  defaultCurrency: "PHP",
  timezone: "Asia/Manila",
} as Profile;
function repo(overrides: Partial<TallyRepository> = {}) {
  return {
    owner: "owner",
    check: () => {},
    records: async () => ({ rows: [], cached: false }),
    ...overrides,
  } as unknown as TallyRepository;
}
describe("record exports", () => {
  it("loads every exposed financial collection and preserves their owner", async () => {
    const result = await collectExport(repo(), profile);
    expect(Object.keys(result.records)).toEqual(exportCollections);
    expect(result.profile.userId).toBe("owner");
    expect(result.format).toBe("tally-records");
  });
  it("refuses partial offline data rather than presenting it as a complete export", async () => {
    await expect(
      collectExport(
        repo({ records: async () => ({ rows: [], cached: true }) }),
        profile,
      ),
    ).rejects.toThrow("Reconnect");
  });
  it("rejects another owner's data", async () => {
    await expect(
      collectExport(
        repo({
          records: async () => ({
            rows: [{ id: "x", data: { userId: "other", schemaVersion: 1 } }],
            cached: false,
          }),
        }),
        profile,
      ),
    ).rejects.toThrow("owner");
    await expect(
      collectExport(repo({ owner: "other" }), profile),
    ).rejects.toThrow("sign-in changed");
  });
  it("stops when the active account changes while collections are loading", async () => {
    let active = true;
    await expect(
      collectExport(
        repo({
          check: () => {
            if (!active) throw new Error("Account changed");
          },
          records: async () => {
            active = false;
            return { rows: [], cached: false };
          },
        }),
        profile,
      ),
    ).rejects.toThrow("Account changed");
  });
});
it("uses a legacy payment's period contact and keeps JPY amounts in whole yen", () => {
  const exported: RecordExport = {
    format: "tally-records",
    version: 1,
    generatedAt: "2026-10-14T00:00:00Z",
    profile,
    records: {
      contacts: [
        { id: "old", data: { displayName: "Old owner" } },
        { id: "new", data: { displayName: "New owner" } },
      ],
      obligations: [{ id: "bill", data: { contactId: "new" } }],
      obligationInstances: [
        { id: "period", data: { contactId: "old", obligationId: "bill" } },
      ],
      payments: [
        {
          id: "payment",
          data: {
            obligationId: "bill",
            obligationInstanceId: "period",
            currency: "JPY",
            amountMinor: 1500,
            entryType: "payment",
          },
        },
      ],
    },
  };
  const csv = paymentsCsv(exported);
  expect(csv).toContain('"Old owner"');
  expect(csv).not.toContain('"New owner"');
  expect(csv).toContain('"JPY","1500","1500","1500"');
});
it("exports immutable payment and reversal entries with historical contact ownership and safe CSV text", () => {
  const exported: RecordExport = {
    format: "tally-records",
    version: 1,
    generatedAt: "2026-10-14T00:00:00Z",
    profile,
    records: {
      contacts: [
        { id: "old", data: { displayName: "Alex, Jr." } },
        { id: "new", data: { displayName: "New person" } },
      ],
      obligations: [
        { id: "loan", data: { title: '=HYPERLINK("bad")', contactId: "new" } },
      ],
      payments: [
        {
          id: "payment",
          data: {
            paymentDate: "2026-10-13",
            entryType: "payment",
            obligationId: "loan",
            contactId: "old",
            currency: "PHP",
            amountMinor: 12345,
            notes: "\t=1+1",
          },
        },
        {
          id: "reversal",
          data: {
            entryType: "reversal",
            obligationId: "loan",
            contactId: null,
            currency: "PHP",
            amountMinor: 12345,
            reversesPaymentId: "payment",
          },
        },
      ] as Row[],
    },
  };
  const csv = paymentsCsv(exported);
  expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
  expect(csv).toContain('"\'\t=1+1"');
  expect(csv).toContain('"Alex, Jr."');
  expect(csv).not.toContain("New person");
  expect(csv).toContain('"12345"');
  expect(csv).toContain('"123.45","-123.45","12345"');
  expect(csv).toContain('"reversal"');
  expect(csv.split("\r\n")).toHaveLength(4);
});
