import type { CommandDatabase } from "../shared/database.ts";
import { HttpsError } from "../shared/errors.ts";
import { exactObject } from "../shared/callable.ts";
import { executeOwnerCommand } from "../shared/commands.ts";
import { statusForBalance } from "../shared/financial_status.ts";
import {
  identifier,
  localToday,
  revision,
  textValue,
} from "../shared/validation.ts";
import { foldFinancialLedger, invalidLedger } from "../payments/ledger.ts";
import { type FiniteInstance, finiteSummary } from "../payments/finite_debt.ts";

function validateRepair(input: unknown) {
  const raw = exactObject(input, [
    "obligationId",
    "expectedRevision",
    "reason",
  ]);
  return {
    obligationId: identifier(raw.obligationId),
    expectedRevision: revision(raw.expectedRevision),
    reason: textValue(raw.reason, 1000, true),
  };
}
function instanceIds(parent: Record<string, unknown>): string[] {
  if (
    !["owedByMe", "owedToMe", "installment"].includes(parent.type as string)
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Only a finite obligation can be repaired here.",
    );
  }
  const raw = parent.type === "installment"
    ? parent.installmentInstanceIds
    : [parent.singleInstanceId];
  if (
    !Array.isArray(raw) || raw.length < 1 || raw.length > 120 ||
    (parent.type === "installment" && raw.length < 2)
  ) return invalidLedger();
  const ids = raw.map(identifier);
  if (new Set(ids).size !== ids.length) return invalidLedger();
  return ids;
}
export async function repairFiniteDebt(
  uid: string,
  input: unknown,
  db: CommandDatabase,
) {
  return executeOwnerCommand(
    uid,
    input,
    "repairFiniteDebt",
    validateRepair,
    async (context, validated) => {
      const parent = await context.read("obligations", validated.obligationId),
        ids = instanceIds(parent);
      if (parent.revision !== validated.expectedRevision) {
        throw new HttpsError(
          "aborted",
          "Financial records changed. Refresh and try again.",
        );
      }
      const payments = (await db.scan(uid, "payments")).filter((entry) =>
        entry.obligationId === validated.obligationId
      );
      const instances = await Promise.all(
        ids.map((id) => context.read("obligationInstances", id)),
      );
      const folded = foldFinancialLedger(
        { obligations: [parent], instances, payments },
        uid,
        false,
      );
      const today = localToday(parent.timezone);
      const rebuilt = instances.map((instance): FiniteInstance => {
        const balance = folded.balances.get(identifier(instance.instanceId))!;
        if (
          !balance || balance.amountMinor === null ||
          balance.remainingMinor === null
        ) return invalidLedger();
        return {
          ...instance,
          ...balance,
          instanceId: instance.instanceId,
          dueDate: instance.dueDate,
          remainingMinor: balance.remainingMinor,
          closed: parent.lifecycle === "cancelled" ||
            balance.remainingMinor === 0,
          financialStatus: parent.lifecycle === "cancelled"
            ? "cancelled"
            : statusForBalance(
              balance.totalPaidMinor,
              balance.remainingMinor,
              instance.dueDate,
              today,
            ),
          hasPaymentHistory: folded.historyInstanceIds.has(instance.instanceId),
          revision: revision(instance.revision) + 1,
        };
      });
      const obligationRevision = revision(parent.revision) + 1;
      const summary = finiteSummary(rebuilt, parent.timezone);
      context.update("obligations", validated.obligationId, {
        ...summary,
        ...(parent.lifecycle === "cancelled"
          ? { financialStatus: "cancelled", nextDueDate: null }
          : {}),
        hasPaymentHistory: folded.historyParentIds.has(validated.obligationId),
        revision: obligationRevision,
      });
      for (const instance of rebuilt) {
        context.update("obligationInstances", instance.instanceId, {
          totalPaidMinor: instance.totalPaidMinor,
          remainingMinor: instance.remainingMinor,
          closed: instance.closed,
          financialStatus: instance.financialStatus,
          hasPaymentHistory: instance.hasPaymentHistory,
          revision: instance.revision,
        });
      }
      context.activity("aggregateRepaired", {
        obligationId: validated.obligationId,
        title: parent.title,
        currency: parent.currency,
        reason: validated.reason,
      });
      return {
        obligationId: validated.obligationId,
        obligationRevision,
        instanceRevisions: rebuilt.map((instance) => ({
          instanceId: instance.instanceId,
          instanceRevision: instance.revision as number,
        })),
      };
    },
    db,
  );
}
