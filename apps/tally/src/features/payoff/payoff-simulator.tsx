import React, { useState } from "react";
import { View } from "react-native";
import { displayDate } from "../../core/domain/date";
import { currency, formatMoney, parseMoney } from "../../core/domain/money";
import { text, type Row } from "../../core/domain/records";
import { DateField } from "../../shared/date-field";
import { Button, Card, Field, Txt } from "../../shared/ui";
import { projectPayoff, type PayoffProjection } from "./payoff-projection";

export function PayoffSimulator({
  obligation,
  instances,
  today,
  onDone,
}: {
  obligation: Row;
  instances: Row[];
  today: string;
  onDone?: () => void;
}) {
  const code = text(obligation.data, "currency");
  const startDate = text(obligation.data, "originationDate");
  const firstAllowedDate = startDate > today ? startDate : today;
  const [extra, setExtra] = useState("0");
  const [firstExtraDate, setFirstExtraDate] = useState(firstAllowedDate);
  const [monthly, setMonthly] = useState("");
  const [firstPaymentDate, setFirstPaymentDate] = useState(firstAllowedDate);
  let eligibility: PayoffProjection | undefined;
  let projection: PayoffProjection | undefined;
  let error = "";
  try {
    eligibility = projectPayoff(obligation, instances, {
      today,
      extraMonthlyMinor: 0,
      firstExtraDate: firstAllowedDate,
    });
    if (
      eligibility.status === "ready" ||
      eligibility.status === "needsMonthlyPayment"
    ) {
      const zero = currency(code) === "JPY" ? /^0+$/ : /^0+(?:\.0{1,2})?$/;
      const extraMonthlyMinor = zero.test(extra.trim())
        ? 0
        : parseMoney(extra, code);
      projection = projectPayoff(obligation, instances, {
        today,
        extraMonthlyMinor,
        firstExtraDate,
        ...(eligibility.status === "needsMonthlyPayment" && monthly.trim()
          ? { monthlyPaymentMinor: parseMoney(monthly, code), firstPaymentDate }
          : {}),
      });
    } else {
      projection = eligibility;
    }
  } catch (cause) {
    error =
      cause instanceof Error
        ? cause.message
        : "The payoff estimate is unavailable.";
  }
  const showInputs =
    eligibility?.status === "ready" ||
    eligibility?.status === "needsMonthlyPayment";
  const result = projection?.status === "ready" ? projection : null;
  const finalPayment = result?.accelerated.payments.at(-1);
  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 6 }}>
        <Txt style={{ fontSize: 22, fontWeight: "700" }}>Payoff simulator</Txt>
        <Txt muted>
          Try extra monthly payments using your current balance and saved
          payment dates. This estimate does not change your records.
        </Txt>
      </View>
      {showInputs && (
        <>
          {eligibility?.status === "needsMonthlyPayment" && (
            <>
              <Txt muted>{eligibility.message}</Txt>
              <Field
                label={`Planned monthly payment (${code})`}
                value={monthly}
                onChangeText={setMonthly}
                money
                keyboardType="decimal-pad"
                placeholder="Enter a monthly amount"
              />
              <DateField
                label="First planned payment"
                value={firstPaymentDate}
                onChange={setFirstPaymentDate}
                today={today}
              />
            </>
          )}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
            <View style={{ flex: 1, minWidth: 180 }}>
              <Field
                label={`Extra monthly payment (${code})`}
                value={extra}
                onChangeText={setExtra}
                money
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flex: 1, minWidth: 180 }}>
              <DateField
                label="First extra payment"
                value={firstExtraDate}
                onChange={setFirstExtraDate}
                today={today}
              />
            </View>
          </View>
        </>
      )}
      {!!error && (
        <View accessibilityRole="alert">
          <Txt>{error}</Txt>
        </View>
      )}
      {projection &&
        projection.status !== "ready" &&
        projection.status !== "needsMonthlyPayment" && (
          <Txt>{projection.message}</Txt>
        )}
      {result && (
        <View accessibilityLiveRegion="polite" style={{ gap: 14 }}>
          <Txt style={{ fontWeight: "600" }}>
            Remaining balance: {formatMoney(result.remainingMinor, code)}
          </Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <Card style={{ flex: 1, minWidth: 200 }}>
              <Txt muted>
                {result.usesHypotheticalPayments
                  ? "Your monthly plan"
                  : "Saved payment schedule"}
              </Txt>
              <Txt style={{ fontSize: 22, fontWeight: "700" }}>
                {displayDate(result.baseline.payoffDate)}
              </Txt>
            </Card>
            <Card style={{ flex: 1, minWidth: 200 }}>
              <Txt muted>With extra monthly payments</Txt>
              <Txt style={{ fontSize: 22, fontWeight: "700" }}>
                {displayDate(result.accelerated.payoffDate)}
              </Txt>
            </Card>
          </View>
          <Txt style={{ fontSize: 18, fontWeight: "700" }}>
            {result.daysEarlier > 0
              ? `${result.daysEarlier} ${result.daysEarlier === 1 ? "day" : "days"} earlier`
              : "Same payoff date"}
          </Txt>
          {finalPayment && (
            <Txt muted>
              Final payment:{" "}
              {formatMoney(
                finalPayment.scheduledMinor + finalPayment.extraMinor,
                code,
              )}
              . Total to repay: {formatMoney(result.remainingMinor, code)} in
              both plans.
            </Txt>
          )}
          {result.interestKind === "fixed" ? (
            <Txt muted>
              Fixed interest is already included in your recorded balance.
              Paying early does not reduce that charge. Interest savings:{" "}
              {formatMoney(0, code)}.
            </Txt>
          ) : result.interestKind === "informational" ? (
            <Txt muted>
              Saved interest terms are informational. This estimate uses your
              recorded balance; interest savings cannot be determined.
            </Txt>
          ) : (
            <Txt muted>
              No additional interest is included in this estimate.
            </Txt>
          )}
          <Txt muted>
            {result.usesHypotheticalPayments
              ? "This is a hypothetical monthly plan, not a saved payment agreement. "
              : "Assumes you keep making the scheduled payment amounts, even after paying extra. "}
            Extra payments repeat on the chosen day each month, or the last day
            of shorter months. The final payment is capped at the remaining
            balance.
          </Txt>
          {result.overdueMinor > 0 && (
            <Txt muted>
              Assumes the overdue {formatMoney(result.overdueMinor, code)} is
              paid today.
            </Txt>
          )}
        </View>
      )}
      {onDone && <Button title="Done" secondary onPress={onDone} />}
    </View>
  );
}
