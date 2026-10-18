import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "../../shared/theme";
import { Button, Field, Txt } from "../../shared/ui";
import { SelectField } from "../../shared/select-field";
import { Icon } from "../../shared/icons";
import { formatMoney } from "../../core/domain/money";
import { displayDate } from "../../core/domain/date";
import { FormGrid } from "./form-layout";
import {
  interestSummary,
  loanTermDueDate,
  type InterestSettings,
} from "./interest-settings";
import type { CustomInterest, SimpleInterest } from "./lending-calculations";

const periods = [
  { value: "oneTime", label: "One-time charge" },
  { value: "1", label: "Every day" },
  { value: "7", label: "Every 7 days" },
  { value: "30", label: "Every 30 days" },
  { value: "360", label: "360-day year" },
  { value: "365", label: "365-day year" },
  { value: "custom", label: "Custom period" },
];
function OptionRow({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Txt muted>{label}</Txt>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: value === option.value, disabled }}
            aria-checked={value === option.value}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 44,
              padding: 10,
              borderWidth: 1,
              borderColor: value === option.value ? t.primary : t.border,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: value === option.value ? t.tint : t.surface,
              opacity: disabled ? 0.6 : 1,
            }}
          >
            <Txt
              style={{
                fontWeight: value === option.value ? "700" : "500",
                textAlign: "center",
              }}
            >
              {option.label}
            </Txt>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
export function InterestCalculator({
  enabled,
  onEnabled,
  settings,
  onChange,
  columns,
  code,
  date,
  due,
  onDueChange,
  installment,
  calculated,
  error,
  locked,
  legacy,
}: {
  enabled: boolean;
  onEnabled: () => void;
  settings: InterestSettings;
  onChange: (value: InterestSettings, termsChanged?: boolean) => void;
  columns: boolean;
  code: string;
  date: string;
  due: string | null;
  onDueChange: (value: string) => void;
  installment: boolean;
  calculated: SimpleInterest | CustomInterest | null;
  error: string;
  locked: boolean;
  legacy: boolean;
}) {
  const t = useTheme();
  const [advanced, setAdvanced] = useState(false),
    [showTerm, setShowTerm] = useState(false);
  const [termCount, setTermCount] = useState("3"),
    [termUnit, setTermUnit] = useState("months");
  const [termError, setTermError] = useState("");
  const change = (patch: Partial<InterestSettings>) =>
    onChange({ ...settings, ...patch });
  const periodDays =
    settings.period === "custom" ? settings.periodDays : settings.period;
  const timed = settings.period !== "oneTime";
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: 16,
        padding: columns ? 24 : 18,
        backgroundColor: t.surface,
        gap: 18,
      }}
    >
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <View
          style={{
            backgroundColor: t.tint,
            borderRadius: 12,
            width: 38,
            height: 38,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="info" color={t.primary} size={20} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt style={{ fontSize: 18, fontWeight: "700" }}>
            Interest calculator
          </Txt>
          <Txt muted style={{ fontSize: 12 }}>
            {enabled
              ? "Set the terms. See the total."
              : "Add an optional loan charge."}
          </Txt>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={enabled ? "Remove interest" : "Add interest"}
          accessibilityState={{ selected: enabled, disabled: locked }}
          aria-pressed={enabled}
          disabled={locked}
          onPress={onEnabled}
          style={{
            minHeight: 44,
            minWidth: 58,
            paddingHorizontal: 12,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: enabled ? t.tint : t.background,
            borderWidth: 1,
            borderColor: enabled ? t.primary : t.border,
            opacity: locked ? 0.6 : 1,
          }}
        >
          <Txt
            style={{ color: enabled ? t.primary : t.muted, fontWeight: "700" }}
          >
            {enabled ? "On" : "Add"}
          </Txt>
        </Pressable>
      </View>
      {legacy && !enabled && (
        <Txt muted>
          Existing interest terms remain informational and do not change the
          recorded balance.
        </Txt>
      )}
      {locked && (
        <Txt muted style={{ fontSize: 12 }}>
          {legacy && !enabled
            ? "Recorded payments keep their original balance and informational interest terms."
            : "Recorded payments keep their original interest terms. Agreement notes can still be edited."}
        </Txt>
      )}
      {enabled && (
        <>
          <OptionRow
            label="Charge type"
            value={settings.chargeKind}
            disabled={locked}
            options={[
              { value: "percentage", label: "Percentage" },
              { value: "fixedAmount", label: "Fixed amount" },
            ]}
            onChange={(value) =>
              change({
                chargeKind: value as InterestSettings["chargeKind"],
                method: value === "fixedAmount" ? "simple" : settings.method,
              })
            }
          />
          <FormGrid columns={columns}>
            {settings.chargeKind === "percentage" ? (
              <Field
                label="Interest rate (%)"
                value={settings.rate}
                onChangeText={(rate) => change({ rate })}
                keyboardType="decimal-pad"
                placeholder="e.g. 5.00"
                editable={!locked}
                style={{ fontSize: 16 }}
              />
            ) : (
              <Field
                label={"Interest amount (" + code + ")"}
                value={settings.fixedAmount}
                onChangeText={(fixedAmount) => change({ fixedAmount })}
                money
                keyboardType="decimal-pad"
                placeholder="0.00"
                editable={!locked}
                style={{ fontSize: 16 }}
              />
            )}
            <SelectField
              label="Charge period"
              value={settings.period}
              options={periods}
              disabled={locked}
              onChange={(period) =>
                change({
                  period,
                  method: period === "oneTime" ? "simple" : settings.method,
                  compoundDays:
                    period === "custom"
                      ? settings.periodDays
                      : period === "oneTime"
                        ? "30"
                        : period,
                })
              }
            />
          </FormGrid>
          {settings.period === "custom" && (
            <Field
              label="Charge every (days)"
              value={settings.periodDays}
              onChangeText={(periodDays) => change({ periodDays })}
              editable={!locked}
              keyboardType="number-pad"
              style={{ fontSize: 16 }}
            />
          )}
          {settings.chargeKind === "percentage" && timed && (
            <OptionRow
              label="Calculation method"
              value={settings.method}
              disabled={locked}
              options={[
                { value: "simple", label: "Simple" },
                { value: "compound", label: "Compound" },
              ]}
              onChange={(method) =>
                change({ method: method as InterestSettings["method"] })
              }
            />
          )}
          {timed && (
            <View style={{ gap: 8 }}>
              <Txt muted style={{ fontSize: 12 }}>
                {due
                  ? displayDate(date) +
                    " to " +
                    displayDate(due) +
                    (installment ? " · final installment" : "")
                  : "Choose a due date above, or set a loan length."}
              </Txt>
              {!installment && !locked && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Set loan length"
                  accessibilityState={{ expanded: showTerm }}
                  onPress={() => setShowTerm((value) => !value)}
                  style={{
                    minHeight: 44,
                    flexDirection: "row",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <Icon name="calendar" color={t.primary} size={17} />
                  <Txt style={{ color: t.primary, fontWeight: "600" }}>
                    Set loan length
                  </Txt>
                </Pressable>
              )}
              {showTerm && !installment && !locked && (
                <View style={{ gap: 12 }}>
                  <FormGrid columns={columns}>
                    <Field
                      label="Loan length"
                      value={termCount}
                      onChangeText={setTermCount}
                      keyboardType="number-pad"
                      style={{ fontSize: 16 }}
                    />
                    <SelectField
                      label="Loan length unit"
                      value={termUnit}
                      onChange={setTermUnit}
                      options={[
                        { value: "days", label: "Days" },
                        { value: "weeks", label: "Weeks" },
                        { value: "months", label: "Calendar months" },
                        { value: "years", label: "Calendar years" },
                      ]}
                    />
                  </FormGrid>
                  <Button
                    secondary
                    title="Apply loan length"
                    onPress={() => {
                      try {
                        onDueChange(loanTermDueDate(date, termCount, termUnit));
                        setTermError("");
                        setShowTerm(false);
                      } catch (failure) {
                        setTermError((failure as Error).message);
                      }
                    }}
                  />
                  {!!termError && (
                    <Txt style={{ color: t.danger }}>{termError}</Txt>
                  )}
                  <Txt muted style={{ fontSize: 12 }}>
                    Sets the due date from the borrowed or lent date. Short
                    months use their last day.
                  </Txt>
                </View>
              )}
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Advanced interest options"
            accessibilityState={{ expanded: advanced }}
            onPress={() => setAdvanced((value) => !value)}
            style={{
              minHeight: 44,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Txt style={{ color: t.primary, fontWeight: "600" }}>
              Advanced options
            </Txt>
            <View
              style={{ transform: [{ rotate: advanced ? "270deg" : "90deg" }] }}
            >
              <Icon name="chevron" size={16} color={t.muted} />
            </View>
          </Pressable>
          {advanced && (
            <View style={{ gap: 16 }}>
              {settings.method === "compound" && (
                <Field
                  label="Compound every (days)"
                  value={settings.compoundDays}
                  onChangeText={(compoundDays) => change({ compoundDays })}
                  keyboardType="number-pad"
                  editable={!locked}
                  style={{ fontSize: 16 }}
                />
              )}
              <SelectField
                label="Rounding"
                value={settings.rounding}
                disabled={locked}
                options={[
                  {
                    value: "halfUp",
                    label:
                      code === "PHP"
                        ? "Nearest centavo"
                        : code === "JPY"
                          ? "Nearest yen"
                          : "Nearest cent",
                  },
                  { value: "down", label: "Round down" },
                  { value: "up", label: "Round up" },
                ]}
                onChange={(rounding) =>
                  change({ rounding: rounding as InterestSettings["rounding"] })
                }
              />
              <Field
                label="Interest agreement notes"
                value={settings.agreementNotes}
                maxLength={1000}
                multiline
                onChangeText={(agreementNotes) =>
                  onChange({ ...settings, agreementNotes }, false)
                }
                placeholder="Agreed rate, repayment terms, or a reminder…"
                style={{
                  minHeight: 80,
                  fontSize: 16,
                  textAlignVertical: "top",
                }}
              />
            </View>
          )}
          {calculated && (
            <View
              style={{
                padding: 16,
                borderRadius: 12,
                backgroundColor: t.tint,
                gap: 8,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <Txt muted>Principal</Txt>
                <Txt>{formatMoney(calculated.principalMinor, code)}</Txt>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <Txt muted>Interest</Txt>
                <Txt>{formatMoney(calculated.interestMinor, code)}</Txt>
              </View>
              <View
                style={{
                  height: 1,
                  backgroundColor: t.border,
                  marginVertical: 4,
                }}
              />
              <Txt muted>Total due</Txt>
              <Txt big style={{ fontWeight: "700" }}>
                {formatMoney(calculated.totalMinor, code)}
              </Txt>
              <Txt muted style={{ fontSize: 12 }}>
                {interestSummary({ ...calculated }, code)}
              </Txt>
              {timed && (
                <Txt muted style={{ fontSize: 12 }}>
                  {calculated.dayCount} actual days · partial periods are
                  prorated.
                </Txt>
              )}
            </View>
          )}
          {!!error && <Txt style={{ color: t.danger }}>{error}</Txt>}
          {!calculated && !error && (
            <Txt muted>
              Enter the principal amount above to preview your loan.
            </Txt>
          )}
          <Txt muted style={{ fontSize: 12 }}>
            {settings.method === "compound" && timed
              ? "Interest is added to the balance every " +
                settings.compoundDays +
                " days. Any final partial cycle uses prorated simple interest."
              : settings.chargeKind === "percentage"
                ? "Simple interest uses the original principal."
                : "The fixed charge is applied once or prorated over the selected period."}
            {timed &&
              " A " + periodDays + "-day period uses actual elapsed days."}{" "}
            Interest is included once in the saved loan total.
          </Txt>
        </>
      )}
    </View>
  );
}
