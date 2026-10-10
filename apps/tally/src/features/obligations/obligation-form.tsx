import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { router, type Href } from "expo-router";
import { useSession } from "../auth/session-provider";
import { useRecords } from "../../shared/queries";
import {
  text,
  amount,
  object,
  recordTitle,
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
import { civilDate, todayInZone } from "../../core/domain/date";
import { Choices, Field, Form, Button, Txt } from "../../shared/ui";
import { SelectField } from "../../shared/select-field";
import { useTheme } from "../../shared/theme";
import { Icon } from "../../shared/icons";
import { FormGrid, FormSection, ObligationTypePicker } from "./form-layout";
export function ObligationForm({
  existing,
  instances = [],
}: {
  existing?: Row;
  instances?: Row[];
}) {
  const { profile, execute } = useSession(),
    contacts = useRecords("contacts"),
    categories = useRecords("categories"),
    sources = useRecords("paymentSources"),
    d = existing?.data ?? {},
    rule = d.recurrence ? object(d.recurrence) : {};
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
        amount(
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
    [contact, setContact] = useState(text(d, "contactId")),
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
    [interest, setInterest] = useState(
      d.interestInfo
        ? String(Number(object(d.interestInfo).rateBasisPoints) / 100)
        : "",
    ),
    [basis, setBasis] = useState(
      d.interestInfo
        ? text(object(d.interestInfo), "basis", "annual")
        : "annual",
    );
  const [schedule, setSchedule] = useState<
    { dueDate: string; amount: string }[]
  >(
    instances.length
      ? instances.map((r) => ({
          dueDate: text(r.data, "dueDate"),
          amount: moneyInput(amount(r.data, "amountMinor"), code),
        }))
      : [
          { dueDate: today, amount: "" },
          { dueDate: today, amount: "" },
        ],
  );
  const theme = useTheme();
  const [layoutWidth, setLayoutWidth] = useState(0);
  const [showDetails, setShowDetails] = useState(
    Boolean(description || notes || interest),
  );
  const isRecurring = kind === "recurring",
    isInstallment = kind === "installment";
  async function save() {
    if (!title.trim()) throw new Error("Give this obligation a name.");
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
        title: title.trim(),
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
      const total = parseMoney(money, code),
        installments = isInstallment
          ? schedule.map((item) => ({
              amountMinor: parseMoney(item.amount, code),
              dueDate: civilDate(item.dueDate),
            }))
          : null;
      if (
        installments &&
        installments.reduce((sum, i) => sum + i.amountMinor, 0) !== total
      )
        throw new Error("Installments must add up to the original amount.");
      const dueDate = installments
        ? installments[installments.length - 1].dueDate
        : due
          ? civilDate(due)
          : null;
      if (dueDate && dueDate < start)
        throw new Error("Due date must follow the borrowed or lent date.");
      payload = {
        title: title.trim(),
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
        interestInfo: interest
          ? {
              rateBasisPoints: parseMoney(interest, "PHP"),
              basis,
              agreementNotes: "",
            }
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
  const contactOptions = [
    { value: "", label: "No person selected" },
    ...(contacts.data?.rows
      .filter((r) => r.data.archived !== true)
      .map((r) => ({ value: r.id, label: recordTitle(r) })) ?? []),
  ];
  const categoryOptions =
    categories.data?.rows
      .filter((r) => r.data.active !== false)
      .map((r) => ({ value: r.id, label: recordTitle(r) })) ?? [];
  const sourceOptions = [
    { value: "", label: "Choose later" },
    ...(sources.data?.rows
      .filter((r) => r.data.active !== false)
      .map((r) => ({ value: r.id, label: recordTitle(r) })) ?? []),
  ];
  let previewAmount = "Add an amount";
  if (money.trim()) {
    try {
      previewAmount = formatMoney(parseMoney(money, code), code);
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
          gap: 24,
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
                label="Name"
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
                  label={isRecurring ? "Default amount" : "Original amount"}
                  value={money}
                  onChangeText={setMoney}
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
                <SelectField
                  label="Person / organization"
                  value={contact}
                  options={contactOptions}
                  onChange={setContact}
                  searchable
                />
                <SelectField
                  label="Category"
                  value={category}
                  options={
                    categoryOptions.length
                      ? categoryOptions
                      : [
                          {
                            value: "default-personal-loan",
                            label: "Personal Loan",
                          },
                        ]
                  }
                  onChange={setCategory}
                  searchable
                />
              </FormGrid>
              <FormGrid columns={columns}>
                <Field
                  label={
                    isRecurring
                      ? "Start date (YYYY-MM-DD)"
                      : kind === "lent"
                        ? "Date lent (YYYY-MM-DD)"
                        : "Date borrowed (YYYY-MM-DD)"
                  }
                  value={date}
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                  style={{ fontSize: 16 }}
                />
                {!isRecurring && !isInstallment && (
                  <Field
                    label="Due date (optional, YYYY-MM-DD)"
                    value={due}
                    onChangeText={setDue}
                    placeholder="No due date yet"
                    style={{ fontSize: 16 }}
                  />
                )}
              </FormGrid>
              {!isRecurring && (
                <SelectField
                  label="Payment source"
                  value={source}
                  options={sourceOptions}
                  onChange={setSource}
                  searchable
                />
              )}
            </FormSection>
            {isInstallment && (
              <FormSection
                title="Installment schedule"
                subtitle="Each payment keeps its own history."
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
                {schedule.map((item, i) => (
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
                      <Field
                        label={`Installment ${i + 1} due date`}
                        value={item.dueDate}
                        onChangeText={(v) =>
                          setSchedule((s) =>
                            s.map((x, n) =>
                              n === i ? { ...x, dueDate: v } : x,
                            ),
                          )
                        }
                        style={{ fontSize: 16 }}
                      />
                      <Field
                        label={`Installment ${i + 1} amount`}
                        value={item.amount}
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
                    {schedule.length > 2 && (
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
                <Button
                  secondary
                  disabled={schedule.length >= 120}
                  title="Add installment"
                  onPress={() =>
                    setSchedule((s) => [...s, { dueDate: today, amount: "" }])
                  }
                />
              </FormSection>
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
                  <Field
                    label="End date (optional)"
                    placeholder="YYYY-MM-DD"
                    value={end}
                    onChangeText={setEnd}
                    style={{ fontSize: 16 }}
                  />
                  <Txt muted style={{ fontSize: 12 }}>
                    Each period has its own bill. Changes to the amount apply to
                    future periods.
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
                  <SelectField
                    label="Payment source"
                    value={source}
                    options={sourceOptions}
                    onChange={setSource}
                    searchable
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
                      : "Description, interest and notes · optional"}
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
                  {!isRecurring && (
                    <FormGrid columns={columns}>
                      <Field
                        label="Interest rate % (optional, informational)"
                        value={interest}
                        onChangeText={setInterest}
                        keyboardType="decimal-pad"
                        style={{ fontSize: 16 }}
                      />
                      <Field
                        label="Interest basis"
                        value={basis}
                        onChangeText={setBasis}
                        style={{ fontSize: 16 }}
                      />
                    </FormGrid>
                  )}
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
              <Txt style={{ fontWeight: "600" }}>
                {title.trim() || "Your new obligation"}
              </Txt>
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Icon name="people" size={16} color={theme.muted} />
                  <Txt muted style={{ flex: 1, fontSize: 12 }}>
                    {
                      contactOptions.find((option) => option.value === contact)
                        ?.label
                    }
                  </Txt>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Icon name="calendar" size={16} color={theme.muted} />
                  <Txt muted style={{ flex: 1, fontSize: 12 }}>
                    {isRecurring
                      ? `Starts ${date}`
                      : due
                        ? `Due ${due}`
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
