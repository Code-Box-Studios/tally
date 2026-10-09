import React, { useState } from "react";
import { View } from "react-native";
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
import { currencies, parseMoney, moneyInput } from "../../core/domain/money";
import { civilDate, todayInZone } from "../../core/domain/date";
import { Choices, Field, Form, Button, Txt, Card } from "../../shared/ui";
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
  return (
    <Form
      saveLabel={existing ? "Save changes" : "Add obligation"}
      onSave={save}
      onCancel={() => router.back()}
    >
      {!existing && (
        <Choices
          label="What would you like to add?"
          value={kind}
          options={[
            { value: "borrowed", label: "I borrowed money" },
            { value: "lent", label: "I lent money" },
            { value: "installment", label: "Add installments" },
            {
              value: "recurring",
              label: "Add monthly due / recurring payment",
            },
          ]}
          onChange={setKind}
        />
      )}
      <Field
        label="Name"
        placeholder={
          isRecurring
            ? "Internet, rent, subscription…"
            : "Personal loan, borrowed money…"
        }
        value={title}
        onChangeText={setTitle}
        maxLength={120}
      />
      <Field
        label="Description"
        value={description}
        onChangeText={setDescription}
        maxLength={1000}
      />
      <Choices
        label="Person / organization"
        value={contact}
        options={[
          { value: "", label: "None" },
          ...(contacts.data?.rows
            .filter((r) => r.data.archived !== true)
            .map((r) => ({ value: r.id, label: recordTitle(r) })) ?? []),
        ]}
        onChange={setContact}
      />
      <Choices
        label="Currency"
        value={code}
        options={currencies}
        onChange={setCode}
      />
      {isRecurring && (
        <Choices
          label="Bill amount"
          value={amountKind}
          options={[
            { value: "fixed", label: "Fixed" },
            { value: "variable", label: "Variable" },
          ]}
          onChange={setAmountKind}
        />
      )}
      <Field
        label={isRecurring ? "Default amount" : "Original amount"}
        value={money}
        onChangeText={setMoney}
        keyboardType="decimal-pad"
        placeholder={amountKind === "variable" ? "Optional estimate" : "0.00"}
      />
      <Field
        label={
          isRecurring
            ? "Start date (YYYY-MM-DD)"
            : "Borrowed / lent date (YYYY-MM-DD)"
        }
        value={date}
        onChangeText={setDate}
      />
      {!isRecurring && !isInstallment && (
        <Field
          label="Due date (optional, YYYY-MM-DD)"
          value={due}
          onChangeText={setDue}
        />
      )}
      <Choices
        label="Category"
        value={category}
        options={
          categories.data?.rows
            .filter((r) => r.data.active !== false)
            .map((r) => ({ value: r.id, label: recordTitle(r) })) ?? [
            { value: "default-personal-loan", label: "Personal Loan" },
          ]
        }
        onChange={setCategory}
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
      {isInstallment && !existing && (
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
      {isInstallment && (
        <Card>
          <Txt>Installment schedule · each period keeps its own history</Txt>
          {schedule.map((item, i) => (
            <View key={i} style={{ gap: 8 }}>
              <Field
                label={`Installment ${i + 1} due date`}
                value={item.dueDate}
                onChangeText={(v) =>
                  setSchedule((s) =>
                    s.map((x, n) => (n === i ? { ...x, dueDate: v } : x)),
                  )
                }
              />
              <Field
                label={`Installment ${i + 1} amount`}
                value={item.amount}
                keyboardType="decimal-pad"
                onChangeText={(v) =>
                  setSchedule((s) =>
                    s.map((x, n) => (n === i ? { ...x, amount: v } : x)),
                  )
                }
              />
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
        </Card>
      )}
      {isRecurring && (
        <>
          <Choices
            label="Frequency"
            value={frequency}
            options={[
              "weekly",
              "biweekly",
              "monthly",
              "quarterly",
              "yearly",
              "custom",
            ].map((v) => ({ value: v, label: label(v) }))}
            onChange={setFrequency}
          />
          {frequency === "custom" && (
            <>
              <Field
                label="Every (1–365)"
                value={interval}
                keyboardType="number-pad"
                onChangeText={setInterval}
              />
              <Choices
                label="Recurrence unit"
                value={unit}
                options={["days", "weeks", "months", "years"]}
                onChange={setUnit}
              />
            </>
          )}
          <Choices
            label="Use last day of month"
            value={monthEnd}
            options={[
              { value: "no", label: "Keep due day" },
              { value: "yes", label: "Month end" },
            ]}
            onChange={setMonthEnd}
          />
          <Field
            label="End date (optional)"
            value={end}
            onChangeText={setEnd}
          />
          <Choices
            label="Payment behavior"
            value={mode}
            options={["manual", "automatic", "automaticConfirmation"].map(
              (v) => ({ value: v, label: label(v) }),
            )}
            onChange={setMode}
          />
          <Field
            label="Deduction / reminder time (HH:MM)"
            value={time}
            onChangeText={setTime}
          />
          <Choices
            label="Reminders"
            value={remind}
            options={[
              { value: "yes", label: "Enabled" },
              { value: "no", label: "Disabled" },
            ]}
            onChange={setRemind}
          />
          <Field
            label="Days before due (comma separated)"
            value={offsets}
            onChangeText={setOffsets}
          />
          <Txt muted>
            Changing the fee updates future generated periods. Historical
            periods keep their amounts.
          </Txt>
        </>
      )}
      {!isRecurring && (
        <>
          <Field
            label="Interest rate % (optional, informational)"
            value={interest}
            onChangeText={setInterest}
            keyboardType="decimal-pad"
          />
          <Field label="Interest basis" value={basis} onChangeText={setBasis} />
        </>
      )}
      <Field
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        multiline
        maxLength={4000}
      />
    </Form>
  );
}
