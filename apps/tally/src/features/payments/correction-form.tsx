import React, { useState } from "react";
import { View } from "react-native";
import { useSession } from "../auth/session-provider";
import { text, amount, type Row } from "../../core/domain/records";
import { parseMoney, moneyInput, formatMoney } from "../../core/domain/money";
import { civilDate, displayDate, todayInZone } from "../../core/domain/date";
import { Card, Choices, Failure, Field, Form, Txt } from "../../shared/ui";
import { DateField } from "../../shared/date-field";
import { useRecords } from "../../shared/queries";
import { previewInstallmentCorrection } from "./correction-preview";
export function CorrectionForm({
  payment,
  obligation,
  onDone,
}: {
  payment: Row;
  obligation: Row;
  onDone: () => void;
}) {
  const { profile, execute, pending = [] } = useSession(),
    [mode, setMode] = useState("reverse"),
    [reason, setReason] = useState(""),
    [money, setMoney] = useState(
      moneyInput(
        amount(payment.data, "amountMinor"),
        text(payment.data, "currency"),
      ),
    ),
    [date, setDate] = useState(text(payment.data, "paymentDate"));
  const schedule = useRecords("obligationInstances");
  const installment = obligation.data.type === "installment";
  const code = text(payment.data, "currency");
  const pendingAction = pending.some(
    (action) =>
      !["synced", "discarded"].includes(action.status) &&
      (action.payload.obligationId === obligation.id ||
        action.payload.paymentId === payment.id),
  );
  let preview: ReturnType<typeof previewInstallmentCorrection> | null = null;
  let previewError: unknown = schedule.error;
  if (installment && schedule.data && !schedule.error) {
    try {
      preview = previewInstallmentCorrection(
        obligation,
        payment,
        schedule.data.rows,
        mode === "reverse" ? null : parseMoney(money, code),
      );
    } catch (error) {
      previewError = error;
    }
  }
  const blocked =
    pendingAction ||
    (installment &&
      (!preview ||
        schedule.isPending ||
        schedule.isFetching ||
        !!previewError));
  return (
    <Form
      saveLabel="Save correction"
      disabled={blocked}
      onCancel={onDone}
      onSave={async () => {
        if (blocked)
          throw new Error(
            "Review the current installment schedule before saving.",
          );
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
          <DateField
            label="Correct payment date"
            value={date}
            onChange={setDate}
            today={todayInZone(profile!.timezone)}
          />
        </>
      )}
      {pendingAction && (
        <Txt>
          A saved action for this obligation awaits confirmation. Sync or review
          it before correcting this payment.
        </Txt>
      )}
      {installment && schedule.isPending && (
        <Txt>Loading installment schedule…</Txt>
      )}
      {installment && !schedule.isPending && schedule.isFetching && (
        <Txt>Refreshing installment schedule…</Txt>
      )}
      {installment && !!previewError && (
        <Failure
          error={previewError}
          retry={schedule.error ? () => void schedule.refetch() : undefined}
        />
      )}
      {preview && (
        <Card>
          <Txt style={{ fontWeight: "600" }}>Allocation preview</Txt>
          <Txt>
            {preview.policy === "preserve"
              ? "The same amount keeps the original installment allocations, including a date-only correction."
              : preview.policy === "oldestFirst"
                ? "An amount change first reverses the original payment, then pays the oldest unpaid installment first. Previously paid later installments can reopen."
                : "Reversing this payment restores the balance of its original installments."}
          </Txt>
          <Txt>
            Obligation remaining before{" "}
            {formatMoney(preview.remainingBeforeMinor, code)} · after{" "}
            {formatMoney(preview.remainingAfterMinor, code)}
          </Txt>
          {preview.periods.map((period) => (
            <View key={period.id} style={{ gap: 4, paddingTop: 12 }}>
              <Txt style={{ fontWeight: "600" }}>{period.title}</Txt>
              <Txt muted>Due {displayDate(period.dueDate)}</Txt>
              <Txt>
                Paid before {formatMoney(period.paidBeforeMinor, code)} · after{" "}
                {formatMoney(period.paidAfterMinor, code)}
              </Txt>
              <Txt>
                Remaining before{" "}
                {formatMoney(period.remainingBeforeMinor, code)} · after{" "}
                {formatMoney(period.remainingAfterMinor, code)}
              </Txt>
            </View>
          ))}
          <Txt muted>
            {schedule.data?.cached ? "Cached schedule. " : ""}Based on the
            confirmed schedule. Saving verifies that the obligation has not
            changed.
          </Txt>
        </Card>
      )}
      <Field label="Reason" value={reason} onChangeText={setReason} multiline />
    </Form>
  );
}
