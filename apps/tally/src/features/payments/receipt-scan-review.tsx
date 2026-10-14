import React, { useEffect, useRef, useState } from "react";
import { Button, Card, Failure, Field, Txt } from "../../shared/ui";
import { civilDate } from "../../core/domain/date";
import { DateField } from "../../shared/date-field";
import { moneyInput, parseMoney } from "../../core/domain/money";
import {
  appendReceiptReference,
  parseReceiptText,
  type ReceiptDraft,
  type ReceiptScanResult,
} from "./receipt-parser";
import { scanReceiptImage } from "./receipt-ocr";
export type { ReceiptDraft } from "./receipt-parser";

interface ReceiptScanReviewProps {
  currency: string;
  today: string;
  ownerKey: string;
  onApply: (draft: ReceiptDraft) => void;
  onActiveChange?: (active: boolean) => void;
  disabled?: boolean;
}

export function ReceiptScanReview(props: ReceiptScanReviewProps) {
  return (
    <ReceiptScanReviewContent
      key={JSON.stringify([props.ownerKey, props.currency])}
      {...props}
    />
  );
}

function ReceiptScanReviewContent({
  currency,
  today,
  onApply,
  onActiveChange,
  disabled = false,
}: ReceiptScanReviewProps) {
  const [result, setResult] = useState<ReceiptScanResult | null>(null),
    [draft, setDraft] = useState<ReceiptDraft>({}),
    [progress, setProgress] = useState(""),
    [error, setError] = useState<unknown>(null);
  const active = useRef<AbortController | null>(null);
  const activeChange = useRef(onActiveChange);
  useEffect(() => {
    activeChange.current = onActiveChange;
  }, [onActiveChange]);
  useEffect(() => {
    return () => {
      active.current?.abort();
      active.current = null;
      activeChange.current?.(false);
    };
  }, []);

  async function scan() {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    onActiveChange?.(true);
    const current = () =>
      active.current === controller && !controller.signal.aborted;
    setResult(null);
    setDraft({});
    setError(null);
    setProgress("Choose a receipt image.");
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let reviewReady = false;
    try {
      const text = await scanReceiptImage({
        signal: controller.signal,
        onProgress: (message) => {
          if (!current()) return;
          setProgress(message);
          if (!timeout && message !== "Choose a receipt image.")
            timeout = setTimeout(() => {
              if (current()) {
                controller.abort();
                active.current = null;
                setProgress("");
                onActiveChange?.(false);
                setError(
                  new Error(
                    "Scanning took too long. Try a smaller, clearer image.",
                  ),
                );
              }
            }, 90000);
        },
      });
      if (!current() || text === null) return;
      const parsed = parseReceiptText(text, currency);
      setResult(parsed);
      setDraft(parsed.draft);
      reviewReady = true;
    } catch (cause) {
      if (current()) setError(cause);
    } finally {
      if (timeout) clearTimeout(timeout);
      if (current()) {
        active.current = null;
        setProgress("");
        if (!reviewReady) onActiveChange?.(false);
      }
    }
  }
  function apply() {
    if (disabled) return;
    try {
      const reviewed: ReceiptDraft = {};
      if (draft.amount?.trim())
        reviewed.amount = moneyInput(
          parseMoney(draft.amount, currency),
          currency,
        );
      if (draft.paymentDate?.trim())
        reviewed.paymentDate = civilDate(draft.paymentDate.trim());
      if (draft.reference?.trim()) {
        appendReceiptReference("", draft.reference);
        reviewed.reference = draft.reference.trim();
      }
      if (!Object.keys(reviewed).length)
        throw new Error("Enter at least one payment detail to use.");
      onApply(reviewed);
      setResult(null);
      setDraft({});
      setError(null);
      onActiveChange?.(false);
    } catch (cause) {
      setError(cause);
    }
  }
  return (
    <Card>
      <Txt>Receipt or payment screenshot</Txt>
      <Txt muted>
        Read an image on this device, then review the details before saving.
        JPEG, PNG or WebP, up to 10 MiB.
      </Txt>
      <Button
        secondary
        title="Scan receipt or screenshot"
        disabled={disabled || !!progress}
        onPress={() => {
          void scan();
        }}
      />
      {!!progress && (
        <>
          <Txt>{progress}</Txt>
          <Button
            secondary
            title="Cancel scan"
            onPress={() => {
              active.current?.abort();
              active.current = null;
              setProgress("");
              onActiveChange?.(false);
            }}
          />
        </>
      )}
      {error != null && <Failure error={error} />}
      {result && (
        <>
          <Txt>
            Review detected details. Blank fields keep your current values.
          </Txt>
          {result.warnings.map((warning) => (
            <Txt key={warning}>{warning}</Txt>
          ))}
          <Field
            label={`Scanned amount (${currency})`}
            value={draft.amount ?? ""}
            onChangeText={(amount) =>
              setDraft((current) => ({ ...current, amount }))
            }
            keyboardType="decimal-pad"
          />
          {result.candidates.amount.length > 1 &&
            result.candidates.amount.map((amount) => (
              <Button
                key={amount}
                secondary
                title={`Use amount ${amount}`}
                onPress={() => setDraft((current) => ({ ...current, amount }))}
              />
            ))}
          <DateField
            label="Scanned date"
            today={today}
            value={draft.paymentDate ?? ""}
            onChange={(paymentDate) =>
              setDraft((current) => ({ ...current, paymentDate }))
            }
            optional
            placeholder="Keep current payment date"
          />
          {result.candidates.paymentDate.length > 1 &&
            result.candidates.paymentDate.map((paymentDate) => (
              <Button
                key={paymentDate}
                secondary
                title={`Use date ${paymentDate}`}
                onPress={() =>
                  setDraft((current) => ({ ...current, paymentDate }))
                }
              />
            ))}
          <Field
            label="Scanned reference"
            value={draft.reference ?? ""}
            maxLength={100}
            onChangeText={(reference) =>
              setDraft((current) => ({ ...current, reference }))
            }
          />
          {result.candidates.reference.length > 1 &&
            result.candidates.reference.map((reference) => (
              <Button
                key={reference}
                secondary
                title={`Use reference ${reference}`}
                onPress={() =>
                  setDraft((current) => ({ ...current, reference }))
                }
              />
            ))}
          <Button
            title="Use reviewed details"
            disabled={disabled}
            onPress={apply}
          />
          <Button
            title="Discard scan"
            secondary
            onPress={() => {
              setResult(null);
              setDraft({});
              setError(null);
              onActiveChange?.(false);
            }}
          />
        </>
      )}
    </Card>
  );
}
