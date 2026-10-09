import React, { useState } from "react";
import { useSession } from "../auth/session-provider";
import { text, amount, type Row } from "../../core/domain/records";
import { parseMoney, moneyInput } from "../../core/domain/money";
import { civilDate } from "../../core/domain/date";
import { Choices, Field, Form, Txt } from "../../shared/ui";
export function CorrectionForm({
  payment,
  obligation,
  onDone,
}: {
  payment: Row;
  obligation: Row;
  onDone: () => void;
}) {
  const { execute } = useSession(),
    [mode, setMode] = useState("reverse"),
    [reason, setReason] = useState(""),
    [money, setMoney] = useState(
      moneyInput(
        amount(payment.data, "amountMinor"),
        text(payment.data, "currency"),
      ),
    ),
    [date, setDate] = useState(text(payment.data, "paymentDate"));
  return (
    <Form
      saveLabel="Save correction"
      onCancel={onDone}
      onSave={async () => {
        if (!reason.trim()) throw new Error("Explain the correction.");
        await execute("correctPayment", {
          paymentId: payment.id,
          reason,
          expectedObligationRevision: Number(obligation.data.revision),
          replacement:
            mode === "reverse"
              ? null
              : {
                  amountMinor: parseMoney(
                    money,
                    text(payment.data, "currency"),
                  ),
                  paymentDate: civilDate(date),
                  paymentSourceId: payment.data.paymentSourceId ?? null,
                  paymentMethod: payment.data.paymentMethod ?? "other",
                  notes: text(payment.data, "notes"),
                },
        });
        onDone();
      }}
    >
      <Txt>
        The original payment stays in history. Tally adds a reversal and, if
        selected, a replacement.
      </Txt>
      <Choices
        label="Correction"
        value={mode}
        options={[
          { value: "reverse", label: "Reverse payment" },
          { value: "replace", label: "Reverse and replace" },
        ]}
        onChange={setMode}
      />
      {mode === "replace" && (
        <>
          <Field
            label="Correct amount"
            value={money}
            onChangeText={setMoney}
            keyboardType="decimal-pad"
          />
          <Field
            label="Correct payment date"
            value={date}
            onChangeText={setDate}
          />
        </>
      )}
      <Field label="Reason" value={reason} onChangeText={setReason} multiline />
    </Form>
  );
}
