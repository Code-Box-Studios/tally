import React, { useState } from "react";
import { ContactField } from "../people/contact-field";
import { Pressable, View } from "react-native";
import { router, type Href } from "expo-router";
import { useSession } from "../auth/session-provider";
import { useRecords } from "../../shared/queries";
import {
  text,
  amount,
  object,
  label,
  type Row,
  type Data,
} from "../../core/domain/records";
import {
  currencies,
  parseMoney,
  moneyInput,
  formatMoney,
} from "../../core/domain/money";
import { civilDate, displayDate, todayInZone } from "../../core/domain/date";
import { Choices, Field, Form, Button, Txt } from "../../shared/ui";
import { SelectField } from "../../shared/select-field";
import { DateField } from "../../shared/date-field";
import { useTheme } from "../../shared/theme";
import { Icon } from "../../shared/icons";
import { FormGrid, FormSection, ObligationTypePicker } from "./form-layout";
import { CategoryField } from "../categories/category-field";
import { PaymentSourceField } from "../payment-sources/payment-source-field";
import {
  calculateInterest,
  calculateCustomInterest,
  generateInstallments,
  installmentDates,
  parseInterestRate,
  splitInstallmentAmounts,
  type InstallmentFrequency,
  type SimpleInterest,
  type CustomInterest,
} from "./lending-calculations";
import { InterestCalculator } from "./interest-calculator";
import {
  customInterestOptions,
  hasComputedInterest,
  readInterestSettings,
} from "./interest-settings";
export function ObligationForm({
  existing,
  instances = [],
  initialContactId = "",
}: {
  existing?: Row;
  instances?: Row[];
  initialContactId?: string;
}) {
  const { profile, execute } = useSession(),
    contacts = useRecords("contacts"),
    categories = useRecords("categories"),
    d = existing?.data ?? {},
    rule = d.recurrence ? object(d.recurrence) : {},
    savedInterest = d.interestInfo ? object(d.interestInfo) : null;
  const today = todayInZone(profile!.timezone),
    initialType =
      d.section === "monthlyDues"
        ? "recurring"
        : d.type === "installment"
          ? "installment"
          : d.section === "owedToMe"
            ? "lent"
            : "borrowed";
  const [direction, setDirection] = useState(
      text(d, "section") === "owedToMe" ? "owedToMe" : "owedByMe",
    ),
    [kind, setKind] = useState(initialType),
    [title, setTitle] = useState(text(d, "title")),
    [description, setDescription] = useState(text(d, "description")),
    [notes, setNotes] = useState(text(d, "notes")),
    [code, setCode] = useState(text(d, "currency", profile!.defaultCurrency)),
    [money, setMoney] = useState(
      moneyInput(
        hasComputedInterest(savedInterest)
          ? amount(savedInterest ?? {}, "principalMinor")
          : amount(
              d,
              d.section === "monthlyDues"
                ? "defaultAmountMinor"
                : "originalAmountMinor",
            ),
        text(d, "currency", profile!.defaultCurrency),
      ),
    ),
    [date, setDate] = useState(
      text(d, "originationDate", text(rule, "startDate", today)),
    ),
    [due, setDue] = useState(text(d, "nextDueDate", text(d, "dueDate"))),
    [contact, setContact] = useState(text(d, "contactId", initialContactId)),
    [category, setCategory] = useState(
      text(d, "categoryId", "default-personal-loan"),
    ),
    [source, setSource] = useState(text(d, "paymentSourceId")),
    [amountKind, setAmountKind] = useState(text(d, "amountKind", "fixed")),
    [mode, setMode] = useState(text(d, "paymentMode", "manual")),
    [frequency, setFrequency] = useState(text(rule, "frequency", "monthly")),
    [interval, setInterval] = useState(String(rule.interval ?? 1)),
    [unit, setUnit] = useState(text(rule, "unit", "months")),
    [time, setTime] = useState(text(rule, "localDeductionTime", "09:00")),
    [end, setEnd] = useState(text(rule, "endDate")),
    [monthEnd, setMonthEnd] = useState(rule.monthEnd === true ? "yes" : "no"),
    [offsets, setOffsets] = useState(
      (
        (d.reminderPolicy
          ? object(d.reminderPolicy).offsetDays
          : [3, 0]) as number[]
      ).join(","),
    ),
    [remind, setRemind] = useState(
      d.reminderPolicy && object(d.reminderPolicy).enabled === false
        ? "no"
        : "yes",
    ),
    [interestSettings, setInterestSettings] = useState(() =>
      readInterestSettings(
        savedInterest,
        text(d, "currency", profile!.defaultCurrency),
      ),
    );
  const [interestEnabled, setInterestEnabled] = useState(
    hasComputedInterest(savedInterest),
  );
  const [interestTermsChanged, setInterestTermsChanged] = useState(false);
  const interestLocked =
    d.hasPaymentHistory === true ||
    Number(d.totalPaidMinor) > 0 ||
    instances.some(
      (row) =>
        row.data.hasPaymentHistory === true ||
        Number(row.data.totalPaidMinor) > 0,
    );
  const [count, setCount] = useState(String(instances.length || 6));
  const [firstDue, setFirstDue] = useState(
    instances.length
      ? text(instances[0].data, "dueDate")
      : installmentDates(2, today, "monthly")[1],
  );
  const [installmentFrequency, setInstallmentFrequency] =
    useState<InstallmentFrequency>("monthly");
  const [customize, setCustomize] = useState(
    Boolean(existing && instances.length),
  );
  const [schedule, setSchedule] = useState<
    { dueDate: string; amount: string }[]
  >(
    instances.length
      ? instances.map((r) => ({
          dueDate: text(r.data, "dueDate"),
          amount: moneyInput(amount(r.data, "amountMinor"), code),
        }))
      : [],
  );
  const theme = useTheme();
  const [layoutWidth, setLayoutWidth] = useState(0);
  const [showDetails, setShowDetails] = useState(Boolean(description || notes));
  const isRecurring = kind === "recurring",
    isInstallment = kind === "installment";
  let calculated: SimpleInterest | CustomInterest | null = null;
  let calculatorError = "";
  let scheduleError = "";
  let totalMinor: number | null = null;
  let effectiveDue = due || null;
  let displayedSchedule = schedule;
  try {
    if (isInstallment) {
      const dates = customize
        ? schedule.map((s) => civilDate(s.dueDate))
        : installmentDates(Number(count), firstDue, installmentFrequency);
      effectiveDue = dates[dates.length - 1] || null;
      if (dates[0] < civilDate(date))
        throw new Error(
          "First due date must follow the borrowed or lent date.",
        );
    }
    if (!isRecurring && money.trim()) {
      const principal = parseMoney(money, code);
      calculated = interestEnabled
        ? savedInterest?.calculationVersion === 1 && !interestTermsChanged
          ? calculateInterest(
              principal,
              parseInterestRate(interestSettings.rate),
              savedInterest.basis as SimpleInterest["basis"],
              date,
              effectiveDue,
            )
          : calculateCustomInterest(
              principal,
              customInterestOptions(interestSettings, date, effectiveDue, code),
            )
        : null;
      totalMinor = calculated?.totalMinor ?? principal;
    }
  } catch (error) {
    calculatorError = (error as Error).message;
  }
  if (isInstallment && !customize) {
    try {
      displayedSchedule =
        totalMinor === null
          ? []
          : generateInstallments(
              totalMinor,
              Number(count),
              firstDue,
              installmentFrequency,
            ).map((s) => ({
              dueDate: s.dueDate,
              amount: moneyInput(s.amountMinor, code),
            }));
    } catch (error) {
      scheduleError = (error as Error).message;
      displayedSchedule = [];
    }
  }
  const obligationTitle = title.trim() || "Untitled";
  async function save() {
    const start = civilDate(date),
      reminderPolicy = {
        enabled: remind === "yes",
        offsetDays: offsets.split(",").map((v) => Number(v.trim())),
        localTime: time,
      };
    let payload: Data;
    let command: string;
    if (isRecurring) {
      const standard: Record<string, [string, number]> = {
        weekly: ["weeks", 1],
        biweekly: ["weeks", 2],
        monthly: ["months", 1],
        quarterly: ["months", 3],
        yearly: ["years", 1],
      };
      const [recurrenceUnit, recurrenceInterval] = standard[frequency] ?? [
          unit,
          Number(interval),
        ],
        calendar = ["months", "years"].includes(recurrenceUnit);
      payload = {
        title: obligationTitle,
        description,
        notes,
        contactId: contact || null,
        categoryId: category,
        currency: code,
        amountKind,
        defaultAmountMinor: money.trim() ? parseMoney(money, code) : null,
        paymentMode: mode,
        paymentSourceId: source || null,
        recurrence: {
          frequency,
          unit: recurrenceUnit,
          interval: recurrenceInterval,
          anchorDate: text(rule, "anchorDate", start),
          startDate: start,
          endDate: end ? civilDate(end) : null,
          preferredDay: calendar
            ? Number(text(rule, "anchorDate", start).slice(8, 10))
            : null,
          monthEnd: calendar && monthEnd === "yes",
          timezone: profile!.timezone,
          localDeductionTime: time,
          ruleVersion: Number(rule.ruleVersion ?? 1),
        },
        reminderPolicy,
      };
      command = existing ? "editRecurring" : "createRecurring";
    } else {
      if (calculatorError || scheduleError)
        throw new Error(calculatorError || scheduleError);
      const principal = parseMoney(money, code),
        total = calculated?.totalMinor ?? principal,
        installments = isInstallment
          ? displayedSchedule.map((item) => ({
              amountMinor: parseMoney(item.amount, code),
              dueDate: civilDate(item.dueDate),
            }))
          : null;
      if (
        installments &&
        installments.reduce((sum, i) => sum + i.amountMinor, 0) !== total
      )
        throw new Error("Installments must add up to the original amount.");
      if (
        installments &&
        (installments.length < 2 || installments.length > 120)
      )
        throw new Error("Choose between 2 and 120 installments.");
      if (
        existing &&
        d.hasPaymentHistory === true &&
        total !== d.originalAmountMinor
      )
        throw new Error(
          "Paid history keeps its original total. Interest changes cannot alter recorded payments.",
        );
      const dueDate = installments
        ? installments[installments.length - 1].dueDate
        : due
          ? civilDate(due)
          : null;
      if (dueDate && dueDate < start)
        throw new Error("Due date must follow the borrowed or lent date.");
      payload = {
        title: obligationTitle,
        description,
        notes,
        direction:
          kind === "lent" || (isInstallment && direction === "owedToMe")
            ? "owedToMe"
            : "owedByMe",
        currency: code,
        amountMinor: total,
        originationDate: start,
        dueDate,
        contactId: contact || null,
        categoryId: category,
        paymentSourceId: source || null,
        interestInfo: calculated
          ? {
              ...calculated,
              agreementNotes: interestSettings.agreementNotes,
            }
          : savedInterest && !hasComputedInterest(savedInterest)
            ? savedInterest
            : null,
        ...(installments ? { installments } : {}),
      };
      command = existing
        ? isInstallment
          ? "editInstallment"
          : "editObligation"
        : isInstallment
          ? "createInstallment"
          : "createObligation";
    }
    if (existing)
      payload = {
        ...payload,
        obligationId: existing.id,
        expectedRevision: Number(d.revision),
      };
    const result = await execute(command, payload);
    router.replace(
      (result.status === "synced" && result.result?.obligationId
        ? `/obligations/${result.result.obligationId}`
        : "/settings/sync") as Href,
    );
  }
  const columns = layoutWidth >= 580;
  const sidebar = layoutWidth >= 960 && !existing;
  let previewAmount = "Add an amount";
  if (money.trim()) {
    try {
      previewAmount = formatMoney(totalMinor ?? parseMoney(money, code), code);
    } catch {
      previewAmount = "Check your amount";
    }
  }
  const typeLabel = isRecurring
    ? "Monthly due"
    : kind === "lent" || (isInstallment && direction === "owedToMe")
      ? "Owed to you"
      : "You owe";
  return (
    <View
      onLayout={(event) => setLayoutWidth(event.nativeEvent.layout.width)}
      style={{ gap: 24 }}
    >
      {!existing && (
        <ObligationTypePicker
          value={kind}
          onChange={setKind}
          columns={layoutWidth >= 900}
        />
      )}
      <View
        style={{
          flexDirection: sidebar ? "row" : "column",
          gap: 20,
          alignItems: "flex-start",
        }}
      >
        <View
          style={{
            flex: sidebar ? 1 : undefined,
            width: sidebar ? undefined : "100%",
            minWidth: 0,
          }}
        >
          <Form
            maxWidth={sidebar ? "100%" : 680}
            saveLabel={existing ? "Save changes" : "Add obligation"}
            onSave={save}
            onCancel={() => router.back()}
          >
            <FormSection
              title="The essentials"
              subtitle="A few details to keep things clear."
              icon="obligations"
            >
              <Field
                label="Name (optional)"
                placeholder={
                  isRecurring
                    ? "Internet, rent, subscription…"
                    : kind === "lent"
                      ? "Loan to Alex, shared payment…"
                      : "Personal loan, borrowed money…"
                }
                value={title}
                onChangeText={setTitle}
                maxLength={120}
                style={{ fontSize: 16 }}
              />
              <FormGrid columns={columns}>
                <Field
                  label={
                    isRecurring
                      ? "Default amount"
                      : interestEnabled
                        ? "Principal amount"
                        : "Original amount"
                  }
                  value={money}
                  onChangeText={setMoney}
                  money
                  keyboardType="decimal-pad"
                  placeholder={
                    isRecurring && amountKind === "variable"
                      ? "Optional estimate"
                      : code === "JPY"
                        ? "0"
                        : "0.00"
                  }
                  style={{ fontSize: 20, fontWeight: "600", minHeight: 50 }}
                />
                <SelectField
                  label="Currency"
                  value={code}
                  options={currencies.map((value) => ({ value, label: value }))}
                  onChange={setCode}
                />
              </FormGrid>
              {isRecurring && (
                <Choices
                  label="Bill amount"
                  value={amountKind}
                  options={[
                    { value: "fixed", label: "Same amount each time" },
                    { value: "variable", label: "Changes each period" },
                  ]}
                  onChange={setAmountKind}
                />
              )}
              <FormGrid columns={columns}>
                <ContactField
                  value={contact}
                  rows={contacts.data?.rows ?? []}
                  onChange={setContact}
                />
                <CategoryField
                  rows={categories.data?.rows ?? []}
                  value={category}
                  onChange={setCategory}
                />
              </FormGrid>
              <FormGrid columns={columns}>
                <DateField
                  label={
                    isRecurring
                      ? "Start date"
                      : kind === "lent" ||
                          (isInstallment && direction === "owedToMe")
                        ? "Date lent"
                        : "Date borrowed"
                  }
                  value={date}
                  onChange={setDate}
                  today={today}
                />
                {!isRecurring && !isInstallment && (
                  <DateField
                    label="Due date (optional)"
                    value={due}
                    onChange={setDue}
                    optional
                    today={today}
                    placeholder="No due date yet"
                  />
                )}
              </FormGrid>
              {!isRecurring && (
                <PaymentSourceField
                  label="Payment source"
                  value={source}
                  onChange={setSource}
                />
              )}
            </FormSection>
            {isInstallment && (
              <FormSection
                title="Installment schedule"
                subtitle="Set the total, number of payments and first due date. We split the total exactly."
                icon="calendar"
              >
                {!existing && (
                  <Choices
                    label="Installments for"
                    value={direction}
                    options={[
                      { value: "owedByMe", label: "I owe" },
                      { value: "owedToMe", label: "Owed to me" },
                    ]}
                    onChange={setDirection}
                  />
                )}
                {!customize && (
                  <>
                    <FormGrid columns={columns}>
                      <Field
                        label="Number of installments"
                        value={count}
                        onChangeText={setCount}
                        keyboardType="number-pad"
                        editable={!existing}
                      />
                      <SelectField
                        label="Payment frequency"
                        value={installmentFrequency}
                        options={[
                          { value: "monthly", label: "Monthly" },
                          { value: "weekly", label: "Weekly" },
                          { value: "biweekly", label: "Every two weeks" },
                        ]}
                        onChange={(value) =>
                          setInstallmentFrequency(value as InstallmentFrequency)
                        }
                      />
                    </FormGrid>
                    <DateField
                      label="First due date"
                      value={firstDue}
                      onChange={setFirstDue}
                      today={today}
                    />
                    <Txt muted>
                      {installmentFrequency === "monthly"
                        ? "Monthly dates keep the first due day; short months use their last available day."
                        : "Payments follow the chosen number of days."}{" "}
                      The final payment absorbs any rounding remainder.
                    </Txt>
                    {!!(calculatorError || scheduleError) && (
                      <Txt>{calculatorError || scheduleError}</Txt>
                    )}
                    {displayedSchedule.map((item, i) => (
                      <View
                        key={i}
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 10,
                          justifyContent: "space-between",
                        }}
                      >
                        <Txt>
                          Payment {i + 1} · {displayDate(item.dueDate)}
                        </Txt>
                        <Txt>
                          {formatMoney(parseMoney(item.amount, code), code)}
                        </Txt>
                      </View>
                    ))}
                    <Button
                      secondary
                      title="Customize installments"
                      disabled={!displayedSchedule.length}
                      onPress={() => {
                        setSchedule(displayedSchedule);
                        setCustomize(true);
                      }}
                    />
                  </>
                )}
                {customize &&
                  schedule.map((item, i) => (
                    <View
                      key={i}
                      style={{
                        padding: 16,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: theme.border,
                        backgroundColor: theme.surface2,
                        gap: 12,
                      }}
                    >
                      <Txt style={{ fontSize: 13, fontWeight: "600" }}>
                        Payment {i + 1}
                      </Txt>
                      <FormGrid columns={columns}>
                        <DateField
                          label={`Installment ${i + 1} due date`}
                          value={item.dueDate}
                          onChange={(v) =>
                            setSchedule((s) =>
                              s.map((x, n) =>
                                n === i ? { ...x, dueDate: v } : x,
                              ),
                            )
                          }
                          today={today}
                        />
                        <Field
                          label={`Installment ${i + 1} amount`}
                          value={item.amount}
                          money
                          keyboardType="decimal-pad"
                          onChangeText={(v) =>
                            setSchedule((s) =>
                              s.map((x, n) =>
                                n === i ? { ...x, amount: v } : x,
                              ),
                            )
                          }
                          style={{ fontSize: 16 }}
                        />
                      </FormGrid>
                      {!existing && schedule.length > 2 && (
                        <Button
                          secondary
                          title={`Remove installment ${i + 1}`}
                          onPress={() =>
                            setSchedule((s) => s.filter((_, n) => n !== i))
                          }
                        />
                      )}
                    </View>
                  ))}
                {customize && (
                  <Button
                    secondary
                    disabled={!!existing || schedule.length >= 120}
                    title="Add installment"
                    onPress={() =>
                      setSchedule((s) => [...s, { dueDate: today, amount: "" }])
                    }
                  />
                )}
                {customize && (
                  <Button
                    secondary
                    title="Redistribute total evenly"
                    disabled={
                      totalMinor === null ||
                      totalMinor < schedule.length ||
                      schedule.length < 2 ||
                      schedule.length > 120
                    }
                    onPress={() => {
                      if (totalMinor === null) return;
                      const amounts = splitInstallmentAmounts(
                        totalMinor,
                        schedule.length,
                      );
                      setSchedule((items) =>
                        items.map((item, index) => ({
                          ...item,
                          amount: moneyInput(amounts[index], code),
                        })),
                      );
                    }}
                  />
                )}
                {customize && !existing && (
                  <Button
                    secondary
                    title="Use generated schedule"
                    onPress={() => {
                      setCount(String(schedule.length));
                      setFirstDue(schedule[0].dueDate);
                      setCustomize(false);
                    }}
                  />
                )}
              </FormSection>
            )}
            {!isRecurring && (
              <InterestCalculator
                enabled={interestEnabled}
                onEnabled={() => {
                  setInterestEnabled((value) => !value);
                  setInterestTermsChanged(true);
                }}
                settings={interestSettings}
                onChange={(value, changed = true) => {
                  setInterestSettings(value);
                  if (changed) setInterestTermsChanged(true);
                }}
                columns={columns}
                code={code}
                date={date}
                due={effectiveDue}
                onDueChange={setDue}
                installment={isInstallment}
                calculated={calculated}
                error={calculatorError}
                locked={interestLocked}
                legacy={Boolean(
                  savedInterest && !hasComputedInterest(savedInterest),
                )}
              />
            )}
            {isRecurring && (
              <>
                <FormSection
                  title="Your payment rhythm"
                  subtitle="Tell Tally when this bill comes around."
                  icon="calendar"
                >
                  <SelectField
                    label="Frequency"
                    value={frequency}
                    options={[
                      "weekly",
                      "biweekly",
                      "monthly",
                      "quarterly",
                      "yearly",
                      "custom",
                    ].map((value) => ({ value, label: label(value) }))}
                    onChange={setFrequency}
                  />
                  {frequency === "custom" && (
                    <FormGrid columns={columns}>
                      <Field
                        label="Every (1–365)"
                        value={interval}
                        keyboardType="number-pad"
                        onChangeText={setInterval}
                        style={{ fontSize: 16 }}
                      />
                      <SelectField
                        label="Recurrence unit"
                        value={unit}
                        options={["days", "weeks", "months", "years"].map(
                          (value) => ({ value, label: label(value) }),
                        )}
                        onChange={setUnit}
                      />
                    </FormGrid>
                  )}
                  <Choices
                    label="Due day"
                    value={monthEnd}
                    options={[
                      { value: "no", label: "Keep the start day" },
                      { value: "yes", label: "Last day of the month" },
                    ]}
                    onChange={setMonthEnd}
                  />
                  <DateField
                    label="End date (optional)"
                    placeholder="No end date"
                    value={end}
                    onChange={setEnd}
                    optional
                    today={today}
                  />
                  <Txt muted style={{ fontSize: 12 }}>
                    {existing
                      ? "Default amount and schedule changes apply only to periods generated after this save. Already generated periods, including future-dated bills, keep their saved amounts and dates. Use Set period amount or Edit period under Billing periods to change an existing bill."
                      : "Each period has its own bill. Changes to the default amount and schedule apply only to periods generated after the change."}
                  </Txt>
                </FormSection>
                <FormSection
                  title="Payments & reminders"
                  subtitle="Know what happens automatically."
                  icon="bell"
                >
                  <SelectField
                    label="Payment behavior"
                    value={mode}
                    options={[
                      "manual",
                      "automatic",
                      "automaticConfirmation",
                    ].map((value) => ({ value, label: label(value) }))}
                    onChange={setMode}
                  />
                  <PaymentSourceField
                    label="Payment source"
                    value={source}
                    onChange={setSource}
                  />
                  {mode !== "manual" && (
                    <Txt muted style={{ fontSize: 12 }}>
                      {mode === "automatic"
                        ? "Tally records the expected deduction. You can report a failed payment."
                        : "Tally asks you to confirm that the deduction happened."}{" "}
                      No bank connection is required.
                    </Txt>
                  )}
                  <Field
                    label="Deduction / reminder time (HH:MM)"
                    value={time}
                    onChangeText={setTime}
                    style={{ fontSize: 16 }}
                  />
                  <Choices
                    label="Reminders"
                    value={remind}
                    options={[
                      { value: "yes", label: "Keep me reminded" },
                      { value: "no", label: "No reminders" },
                    ]}
                    onChange={setRemind}
                  />
                  {remind === "yes" && (
                    <>
                      <Field
                        label="Days before due (comma separated)"
                        value={offsets}
                        onChangeText={setOffsets}
                        style={{ fontSize: 16 }}
                      />
                      <Txt muted style={{ fontSize: 12 }}>
                        For example: 7, 3, 0 reminds you a week before, three
                        days before, and on the due date.
                      </Txt>
                    </>
                  )}
                </FormSection>
              </>
            )}
            <View
              style={{
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 16,
                backgroundColor: theme.surface,
                overflow: "hidden",
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Additional details"
                accessibilityState={{ expanded: showDetails }}
                onPress={() => setShowDetails((value) => !value)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  padding: 20,
                  minHeight: 62,
                }}
              >
                <Icon name="info" color={theme.muted} size={19} />
                <View style={{ flex: 1 }}>
                  <Txt style={{ fontWeight: "600" }}>Additional details</Txt>
                  <Txt muted style={{ fontSize: 12 }}>
                    {isRecurring
                      ? "Description and notes · optional"
                      : "Description and notes · optional"}
                  </Txt>
                </View>
                <View
                  style={{
                    transform: [{ rotate: showDetails ? "270deg" : "90deg" }],
                  }}
                >
                  <Icon name="chevron" color={theme.muted} size={16} />
                </View>
              </Pressable>
              {showDetails && (
                <View style={{ padding: 20, paddingTop: 0, gap: 16 }}>
                  <Field
                    label="Description"
                    value={description}
                    onChangeText={setDescription}
                    maxLength={1000}
                    placeholder="What is this obligation for?"
                    style={{ fontSize: 16 }}
                  />
                  <Field
                    label="Notes"
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                    maxLength={4000}
                    placeholder="Anything you want to remember…"
                    style={{
                      fontSize: 16,
                      minHeight: 96,
                      textAlignVertical: "top",
                    }}
                  />
                </View>
              )}
            </View>
            <Txt muted style={{ fontSize: 12 }}>
              You can record full or partial payments after adding this
              obligation.
            </Txt>
          </Form>
        </View>
        {sidebar && (
          <View style={{ width: 250, gap: 18 }}>
            <View
              style={{
                padding: 24,
                backgroundColor: kind === "lent" ? theme.blueBg : theme.greenBg,
                borderRadius: 18,
                gap: 18,
              }}
            >
              <Txt
                style={{
                  color: theme.primary,
                  fontSize: 11,
                  letterSpacing: 1.2,
                  fontWeight: "700",
                }}
              >
                AT A GLANCE
              </Txt>
              <View style={{ gap: 6 }}>
                <Txt style={{ fontWeight: "600" }}>{typeLabel}</Txt>
                <Txt big style={{ fontSize: 27, fontWeight: "700" }}>
                  {previewAmount}
                </Txt>
                <Txt muted style={{ fontSize: 12 }}>
                  {code} · {isRecurring ? label(frequency) : "One obligation"}
                </Txt>
              </View>
              <View style={{ height: 1, backgroundColor: theme.border }} />
              <Txt style={{ fontWeight: "600" }}>{obligationTitle}</Txt>
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Icon name="people" size={16} color={theme.muted} />
                  <Txt muted style={{ flex: 1, fontSize: 12 }}>
                    {text(
                      contacts.data?.rows.find((row) => row.id === contact)
                        ?.data ?? {},
                      "displayName",
                      contact ? "Contact selected" : "No person selected",
                    )}
                  </Txt>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Icon name="calendar" size={16} color={theme.muted} />
                  <Txt muted style={{ flex: 1, fontSize: 12 }}>
                    {isRecurring
                      ? `Starts ${date}`
                      : effectiveDue
                        ? `Due ${effectiveDue}`
                        : "No due date set"}
                  </Txt>
                </View>
              </View>
            </View>
            <View style={{ padding: 16, flexDirection: "row", gap: 10 }}>
              <Icon name="shield" color={theme.muted} size={18} />
              <Txt muted style={{ flex: 1, fontSize: 12 }}>
                Your records stay private. Every payment keeps its own history.
              </Txt>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
