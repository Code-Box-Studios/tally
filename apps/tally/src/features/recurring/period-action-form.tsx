import React, { useState } from "react";
import { useRecords } from "../../shared/queries";
import { useSession } from "../auth/session-provider";
import { parseMoney, moneyInput } from "../../core/domain/money";
import { civilDate } from "../../core/domain/date";
import { text, amount, type Row, type Data } from "../../core/domain/records";
import { Choices, Field, Form, Txt } from "../../shared/ui";
export function PeriodActionForm({
  obligation,
  instance,
  action,
  onDone,
}: {
  obligation: Row;
  instance: Row;
  action: "amount" | "edit" | "skip" | "failed";
  onDone: () => void;
}) {
  const { execute } = useSession(),
    sources = useRecords("paymentSources"),
    [source, setSource] = useState(text(instance.data, "paymentSourceId")),
    [money, setMoney] = useState(
      moneyInput(
        amount(instance.data, "amountMinor"),
        text(instance.data, "currency"),
      ),
    ),
    [due, setDue] = useState(text(instance.data, "dueDate")),
    [reason, setReason] = useState(""),
    [notes, setNotes] = useState(text(instance.data, "notes"));
  return (
    <Form
      saveLabel={
        action === "failed" ? "Record failed deduction" : "Save period"
      }
      onCancel={onDone}
      onSave={async () => {
        if (!reason.trim())
          throw new Error("Explain this change so the history stays clear.");
        const identity: Data = {
          obligationId: obligation.id,
          instanceId: instance.id,
          expectedRevision: Number(instance.data.revision),
          reason,
        };
        const command =
          action === "amount"
            ? "setRecurringAmount"
            : action === "edit"
              ? "editRecurringInstance"
              : action === "skip"
                ? "skipRecurringInstance"
                : "reportDeductionFailure";
        const payload =
          action === "amount"
            ? {
                ...identity,
                amountMinor: parseMoney(money, text(instance.data, "currency")),
              }
            : action === "edit"
              ? {
                  ...identity,
                  dueDate: civilDate(due),
                  paymentSourceId: source || null,
                  notes,
                }
              : identity;
        await execute(command, payload);
        onDone();
      }}
    >
      <Txt>
        Change this period without rewriting other periods or payment history.
      </Txt>
      {action === "amount" && (
        <Field
          label="This period’s amount"
          value={money}
          onChangeText={setMoney}
          keyboardType="decimal-pad"
        />
      )}
      {action === "edit" && (
        <>
          <Field
            label="This period’s due date"
            value={due}
            onChangeText={setDue}
          />
          <Choices
            label="Payment source"
            value={source}
            options={[
              { value: "", label: "None" },
              ...(sources.data?.rows
                .filter((r) => r.data.active !== false)
                .map((r) => ({ value: r.id, label: text(r.data, "name") })) ??
                []),
            ]}
            onChange={setSource}
          />
          <Field label="Period notes" value={notes} onChangeText={setNotes} />
        </>
      )}
      <Field label="Reason" value={reason} onChangeText={setReason} multiline />
    </Form>
  );
}
