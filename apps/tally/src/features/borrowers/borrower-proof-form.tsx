import React, { useRef, useState } from "react";
import * as Crypto from "expo-crypto";
import { useSession } from "../auth/session-provider";
import { type Data, text, amount } from "../../core/domain/records";
import { parseMoney } from "../../core/domain/money";
import { civilDate, todayInZone } from "../../core/domain/date";
import { Field, Form, Txt } from "../../shared/ui";
import { DateField } from "../../shared/date-field";
import { ReceiptScanReview } from "../payments/receipt-scan-review";

export function BorrowerProofForm({
  ownerId,
  shareId,
  loan,
  timezone,
  onDone,
}: {
  ownerId: string;
  shareId: string;
  loan: Data;
  timezone: string;
  onDone: () => void;
}) {
  const { repo } = useSession();
  const [value, setValue] = useState(""),
    [date, setDate] = useState(todayInZone(timezone)),
    [reference, setReference] = useState(""),
    [message, setMessage] = useState("");
  const [locked, setLocked] = useState(false);
  const [scanActive, setScanActive] = useState(false);
  const intent = useRef<Data | null>(null);
  const code = text(loan, "currency");
  return (
    <Form
      disabled={scanActive}
      saveLabel={locked ? "Retry same draft" : "Review proof"}
      onCancel={onDone}
      onSave={async () => {
        if (!intent.current) {
          const paid = parseMoney(value, code),
            paymentDate = civilDate(date);
          if (paid > (amount(loan, "remainingMinor") ?? 0))
            throw new Error("This amount exceeds the current balance.");
          if (
            paymentDate < text(loan, "originationDate") ||
            paymentDate > todayInZone(timezone)
          )
            throw new Error(
              "Payment date must be between the loan date and today.",
            );
          intent.current = {
            ownerId,
            shareId,
            commandId: Crypto.randomUUID(),
            amountMinor: paid,
            paymentDate,
            reference: reference.trim(),
            message: message.trim(),
          };
          setLocked(true);
        }
        await repo!.invoke("borrowerDraft", intent.current);
        repo!.check();
        onDone();
      }}
    >
      <Txt big>Payment proof</Txt>
      <Txt muted>
        Enter what you paid. Next, attach a receipt and send it for the owner’s
        approval. Your balance changes only after approval.
      </Txt>
      {!locked && (
        <ReceiptScanReview
          currency={code}
          today={todayInZone(timezone)}
          onActiveChange={setScanActive}
          ownerKey={`${repo?.owner}:${ownerId}:${shareId}`}
          onApply={(draft) => {
            if (draft.amount) setValue(draft.amount);
            if (draft.paymentDate) setDate(draft.paymentDate);
            if (draft.reference) setReference(draft.reference);
          }}
        />
      )}
      <Field
        label="Amount paid"
        value={value}
        onChangeText={setValue}
        money
        keyboardType="decimal-pad"
        editable={!locked}
        placeholder="0.00"
      />
      {locked ? (
        <Txt>Payment date: {date}</Txt>
      ) : (
        <DateField
          label="Payment date"
          value={date}
          onChange={setDate}
          today={todayInZone(timezone)}
        />
      )}
      <Field
        label="Payment reference"
        value={reference}
        onChangeText={setReference}
        maxLength={200}
        editable={!locked}
        placeholder="Optional transfer or receipt number"
      />
      <Field
        label="Message to owner"
        value={message}
        onChangeText={setMessage}
        maxLength={1500}
        multiline
        editable={!locked}
        placeholder="Optional payment details"
      />
      {locked && (
        <Txt muted>
          The draft details are held for a safe retry. If the connection was
          interrupted, you can also close this form and refresh to find your
          saved draft.
        </Txt>
      )}
    </Form>
  );
}
