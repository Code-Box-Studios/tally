import React, { useState } from "react";
import { useSession } from "../auth/session-provider";
import { useRecords } from "../../shared/queries";
import {
  text,
  amount,
  recordTitle,
  label,
  type Row,
  type Data,
} from "../../core/domain/records";
import { parseMoney, moneyInput } from "../../core/domain/money";
import { civilDate, todayInZone } from "../../core/domain/date";
import { Choices, Field, Form, Txt, Button } from "../../shared/ui";
export function PaymentForm({
  obligation,
  instance,
  confirm = false,
  onDone,
}: {
  obligation: Row;
  instance?: Row;
  confirm?: boolean;
  onDone: () => void;
}) {
  const { profile, execute } = useSession(),
    sources = useRecords("paymentSources"),
    payments = useRecords("payments"),
    remaining = amount(instance?.data ?? obligation.data, "remainingMinor"),
    code = text(obligation.data, "currency");
  const assumed =
    confirm && instance?.data.deductionStatus === "deducted"
      ? payments.data?.rows.find(
          (r) =>
            r.data.obligationInstanceId === instance.id &&
            r.data.provenance === "assumedAutomatic" &&
            !payments.data?.rows.some(
              (reverse) => reverse.data.reversesPaymentId === r.id,
            ),
        )
      : undefined;
  const initialAmount = assumed
    ? amount(assumed.data, "amountMinor")
    : remaining;
  const [value, setValue] = useState(moneyInput(initialAmount, code)),
    [date, setDate] = useState(
      assumed
        ? text(assumed.data, "paymentDate")
        : todayInZone(profile!.timezone),
    ),
    [source, setSource] = useState(
      text(
        assumed?.data ?? instance?.data ?? obligation.data,
        "paymentSourceId",
      ),
    ),
    [method, setMethod] = useState("cash"),
    [notes, setNotes] = useState("");
  return (
    <Form
      saveLabel={confirm ? "Confirm deduction" : "Record payment"}
      onCancel={onDone}
      onSave={async () => {
        const paid = parseMoney(value, code);
        if (remaining == null)
          throw new Error("Enter this billing period’s amount first.");
        if (paid > remaining && !confirm)
          throw new Error("This payment exceeds the remaining balance.");
        const terms: Data = {
          amountMinor: paid,
          paymentDate: civilDate(date),
          paymentSourceId: source || null,
          paymentMethod: method,
          notes,
        };
        const payload: Data = confirm
          ? {
              ...terms,
              obligationId: obligation.id,
              instanceId: instance!.id,
              expectedRevision: Number(instance!.data.revision),
            }
          : obligation.data.type === "installment" && !instance
            ? {
                ...terms,
                obligationId: obligation.id,
                currency: code,
                explicitAllocations: null,
              }
            : {
                ...terms,
                obligationId: obligation.id,
                obligationInstanceId:
                  instance?.id ?? text(obligation.data, "singleInstanceId"),
                currency: code,
              };
        await execute(
          confirm
            ? "confirmDeduction"
            : obligation.data.type === "installment" && !instance
              ? "recordInstallmentPayment"
              : "recordPayment",
          payload,
        );
        onDone();
      }}
    >
      <Txt>Full and partial payments keep separate, traceable records.</Txt>
      <Button
        secondary
        title="Use full remaining amount"
        onPress={() => setValue(moneyInput(initialAmount, code))}
      />
      <Field
        label="Payment amount"
        value={value}
        onChangeText={setValue}
        keyboardType="decimal-pad"
      />
      <Field
        label="Payment date (YYYY-MM-DD)"
        value={date}
        onChangeText={setDate}
      />
      <Choices
        label="Payment source"
        value={source}
        options={[
          { value: "", label: "None" },
          ...(sources.data?.rows
            .filter((r) => r.data.active !== false)
            .map((r) => ({ value: r.id, label: recordTitle(r) })) ?? []),
        ]}
        onChange={setSource}
      />
      <Choices
        label="Payment method"
        value={method}
        options={[
          "cash",
          "bankTransfer",
          "card",
          "eWallet",
          "payroll",
          "other",
        ].map((v) => ({ value: v, label: label(v) }))}
        onChange={setMethod}
      />
      <Field
        label="Payment notes"
        value={notes}
        onChangeText={setNotes}
        multiline
      />
    </Form>
  );
}
