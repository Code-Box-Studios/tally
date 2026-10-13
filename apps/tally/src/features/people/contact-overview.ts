import { amount, text, type Row } from "../../core/domain/records";
import { currency, minor } from "../../core/domain/money";
import { addStatementTotals } from "../statements/statement-money";

function savedContact(row: Row, fallback: unknown) {
  return Object.hasOwn(row.data, "contactId") ? row.data.contactId : fallback;
}

export function contactOverview(
  contactId: string,
  obligations: Row[],
  instances: Row[],
  payments: Row[] = [],
) {
  const parents = new Map(obligations.map((row) => [row.id, row]));
  const periods = new Map(instances.map((row) => [row.id, row]));
  const ownedPeriods = new Map<string, Row[]>();
  for (const row of instances) {
    const parent = parents.get(text(row.data, "obligationId"));
    if (parent && savedContact(row, parent.data.contactId) === contactId) {
      const group = ownedPeriods.get(parent.id) ?? [];
      group.push(row);
      ownedPeriods.set(parent.id, group);
    }
  }
  const history = payments
    .filter((row) => {
      const parent = parents.get(text(row.data, "obligationId"));
      if (!parent) {
        if (row.data.contactId === contactId)
          throw new Error(
            "A payment's obligation is unavailable. Refresh these records.",
          );
        return false;
      }
      if (parent.data.section !== "monthlyDues")
        return parent.data.contactId === contactId;
      const period = periods.get(text(row.data, "obligationInstanceId"));
      const periodContact = period
        ? savedContact(period, parent.data.contactId)
        : parent.data.contactId;
      const paymentContact = savedContact(row, periodContact);
      if (
        period &&
        (periodContact === contactId || paymentContact === contactId) &&
        (period.data.obligationId !== parent.id ||
          paymentContact !== periodContact)
      )
        throw new Error(
          "A payment's contact differs from its billing period. Refresh these records.",
        );
      return paymentContact === contactId;
    })
    .sort((a, b) =>
      text(b.data, "recordedAt", text(b.data, "createdAt")).localeCompare(
        text(a.data, "recordedAt", text(a.data, "createdAt")),
      ),
    );
  const historicalIds = new Set(
    history.map((row) => text(row.data, "obligationId")),
  );
  const positions: Record<
    string,
    { owe: number; owed: number; unknownAmounts: number }
  > = {};
  const accounts = obligations
    .filter(
      (row) =>
        row.data.contactId === contactId ||
        (row.data.section === "monthlyDues" &&
          (ownedPeriods.has(row.id) || historicalIds.has(row.id))),
    )
    .map((row) => {
      const recurring = row.data.section === "monthlyDues";
      if (
        !["iOwe", "owedToMe", "monthlyDues"].includes(text(row.data, "section"))
      )
        throw new Error("This obligation's direction could not be verified.");
      const code = currency(row.data.currency);
      const excluded =
        row.data.archived === true || row.data.lifecycle === "cancelled";
      let remainingMinor = 0,
        unknownAmounts = 0;
      if (recurring) {
        for (const period of ownedPeriods.get(row.id) ?? []) {
          if (currency(period.data.currency) !== code)
            throw new Error(
              "Billing period currency differs from its obligation.",
            );
          const remaining = amount(period.data, "remainingMinor");
          const original = amount(period.data, "amountMinor");
          const paid = minor(amount(period.data, "totalPaidMinor"), true);
          if (
            original === null
              ? remaining !== null || paid !== 0
              : remaining === null ||
                addStatementTotals(paid, minor(remaining, true)) !==
                  minor(original, true)
          )
            throw new Error("This billing period’s balance needs recovery.");
          if (
            !excluded &&
            ["cancelled", "skipped"].includes(
              text(period.data, "financialStatus"),
            )
          )
            continue;
          if (remaining === null) {
            unknownAmounts += 1;
          } else
            remainingMinor = addStatementTotals(
              remainingMinor,
              minor(remaining, true),
            );
        }
      } else remainingMinor = minor(amount(row.data, "remainingMinor"), true);
      const position =
        positions[code] ??
        (positions[code] = { owe: 0, owed: 0, unknownAmounts: 0 });
      if (!excluded) {
        const direction = row.data.section === "owedToMe" ? "owed" : "owe";
        position[direction] = addStatementTotals(
          position[direction],
          remainingMinor,
        );
        position.unknownAmounts += unknownAmounts;
      }
      return { row, remainingMinor, unknownAmounts, excluded };
    });
  return { positions, accounts, history };
}
