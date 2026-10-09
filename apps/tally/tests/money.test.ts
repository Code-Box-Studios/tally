import { describe, expect, it } from "vitest";
import {
  parseMoney,
  formatMoney,
  balances,
  splitCurrencies,
} from "../src/core/domain/money";
import { civilDate, todayInZone } from "../src/core/domain/date";

describe("exact financial calculations", () => {
  it("keeps minor units exact", () =>
    expect(parseMoney("1234.56", "PHP")).toBe(123456));
  it("respects zero-decimal JPY", () => {
    expect(parseMoney("500", "JPY")).toBe(500);
    expect(() => parseMoney("500.5", "JPY")).toThrow();
  });
  it.each(["NaN", "-1", "1e8", "0", "1.999", "10000000000000"])(
    "rejects invalid amount %s",
    (value) => expect(() => parseMoney(value, "PHP")).toThrow(),
  );
  it("rejects unsupported currencies", () =>
    expect(() => parseMoney("10", "XYZ")).toThrow());
  it("sums independent partial payments", () =>
    expect(balances(2000000, [500000, 250000, 400000])).toEqual({
      paid: 1150000,
      remaining: 850000,
    }));
  it("rejects overpayment", () =>
    expect(() => balances(200000, [250000])).toThrow());
  it("separates currencies", () =>
    expect(
      splitCurrencies([
        { currency: "PHP", amountMinor: 1000000 },
        { currency: "USD", amountMinor: 50000 },
      ]),
    ).toEqual({ PHP: 1000000, USD: 50000 }));
  it("formats currency explicitly", () =>
    expect(formatMoney(1000, "PHP")).toContain("10.00"));
});
describe("civil due dates", () => {
  it("rejects non-existent dates", () =>
    expect(() => civilDate("2026-02-30")).toThrow());
  it("accepts leap day without shifting timezone", () =>
    expect(civilDate("2028-02-29")).toBe("2028-02-29"));
  it("uses the chosen timezone", () =>
    expect(todayInZone("Asia/Manila", new Date("2026-10-08T18:00:00Z"))).toBe(
      "2026-10-09",
    ));
});
