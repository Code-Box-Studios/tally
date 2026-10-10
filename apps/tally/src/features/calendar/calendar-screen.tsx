import React, { useState } from "react";
import { View, Pressable, useWindowDimensions } from "react-native";
import { useRecords } from "../../shared/queries";
import { useSession } from "../auth/session-provider";
import { text, recordTitle, amount, label } from "../../core/domain/records";
import { todayInZone } from "../../core/domain/date";
import { currencies, parseMoney } from "../../core/domain/money";
import { DueRow } from "../dashboard/dashboard-screen";
import { useTheme } from "../../shared/theme";
import {
  Page,
  Heading,
  Card,
  Choices,
  Field,
  Button,
  Txt,
  Loading,
  Failure,
  Empty,
} from "../../shared/ui";
export function CalendarScreen() {
  const { profile } = useSession(),
    instances = useRecords("obligationInstances"),
    obligations = useRecords("obligations"),
    contacts = useRecords("contacts"),
    categories = useRecords("categories"),
    [month, setMonth] = useState(todayInZone(profile!.timezone).slice(0, 7)),
    [day, setDay] = useState(""),
    [section, setSection] = useState("all"),
    [status, setStatus] = useState("all"),
    [mode, setMode] = useState("all"),
    [currency, setCurrency] = useState("all"),
    [contact, setContact] = useState("all"),
    [category, setCategory] = useState("all"),
    [search, setSearch] = useState(""),
    [showFilters, setShowFilters] = useState(false),
    [minimum, setMinimum] = useState(""),
    [maximum, setMaximum] = useState("");
  const t = useTheme();
  const compact = useWindowDimensions().width < 600;
  let filterError: string | null = null;
  let min = 0,
    max = Infinity;
  try {
    if (minimum && currency !== "all") min = parseMoney(minimum, currency);
    if (maximum && currency !== "all") max = parseMoney(maximum, currency);
  } catch {
    filterError = "Enter a valid amount in the selected currency.";
  }
  if (min > max) filterError = "Minimum amount must not exceed maximum.";
  const rows =
    instances.data?.rows
      .filter((r) => {
        const due = text(r.data, "dueDate"),
          parent = obligations.data?.rows.find(
            (o) => o.id === r.data.obligationId,
          );
        return (
          !filterError &&
          due.startsWith(month) &&
          (!day || due === day) &&
          (section === "all" || r.data.section === section) &&
          (status === "all" ||
            (status === "pending"
              ? r.data.closed !== true
              : r.data.financialStatus === status)) &&
          (mode === "all" || r.data.paymentMode === mode) &&
          (currency === "all" || r.data.currency === currency) &&
          (contact === "all" || r.data.contactId === contact) &&
          (category === "all" || r.data.categoryId === category) &&
          (amount(r.data, "amountMinor") ?? 0) >= min &&
          (amount(r.data, "amountMinor") ?? 0) <= max &&
          [
            parent && recordTitle(parent),
            parent && text(parent.data, "notes"),
            text(r.data, "notes"),
          ]
            .join(" ")
            .toLowerCase()
            .includes(search.toLowerCase())
        );
      })
      .sort((a, b) =>
        text(a.data, "dueDate").localeCompare(text(b.data, "dueDate")),
      ) ?? [];
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month),
    first = validMonth ? new Date(month + "-01T12:00:00Z") : null,
    days = first
      ? new Date(
          first.getUTCFullYear(),
          first.getUTCMonth() + 1,
          0,
        ).getUTCDate()
      : 0,
    offset = first ? first.getUTCDay() : 0;
  function shift(by: number) {
    if (!first) return;
    const next = new Date(first);
    next.setUTCMonth(next.getUTCMonth() + by);
    setMonth(next.toISOString().slice(0, 7));
    setDay("");
  }
  return (
    <Page>
      <Heading
        title="Your financial calendar"
        subtitle="Know what needs paying next."
      />
      <View style={{ gap: 18 }}>
        {filterError && <Failure error={new Error(filterError)} />}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "flex-end",
          }}
        >
          {compact && (
            <View style={{ width: "100%" }}>
              <Field
                label="Month (YYYY-MM)"
                value={month}
                onChangeText={(v) => {
                  setMonth(v);
                  setDay("");
                }}
              />
            </View>
          )}
          <Button secondary title="Previous month" onPress={() => shift(-1)} />
          {!compact && (
            <Field
              label="Month (YYYY-MM)"
              value={month}
              onChangeText={(v) => {
                setMonth(v);
                setDay("");
              }}
            />
          )}
          <Button secondary title="Next month" onPress={() => shift(1)} />
        </View>
        <Card>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((name) => (
              <View key={name} style={{ width: "14.285%", padding: 6 }}>
                <Txt muted style={{ fontSize: 12 }}>
                  {name}
                </Txt>
              </View>
            ))}
            {Array.from({ length: offset + days }, (_, i) => {
              const n = i - offset + 1,
                date = n > 0 ? month + "-" + String(n).padStart(2, "0") : "";
              const count =
                instances.data?.rows.filter((r) => r.data.dueDate === date)
                  .length ?? 0;
              return (
                <Pressable
                  key={i}
                  accessibilityRole="button"
                  accessibilityLabel={
                    date ? `${date}, ${count} payments` : "Empty day"
                  }
                  disabled={!date}
                  onPress={() => setDay(day === date ? "" : date)}
                  style={{
                    width: "14.285%",
                    padding: 8,
                    minHeight: 66,
                    borderWidth: 1,
                    borderColor: t.border,
                    backgroundColor: day === date ? t.tint : t.surface,
                  }}
                >
                  <Txt style={{ fontSize: 15 }}>{n > 0 ? n : ""}</Txt>
                  {count > 0 && (
                    <Txt muted style={{ fontSize: 10 }}>
                      {count} due
                    </Txt>
                  )}
                </Pressable>
              );
            })}
          </View>
        </Card>
        <Choices
          label="Obligation type"
          value={section}
          options={["all", "iOwe", "owedToMe", "monthlyDues"].map((v) => ({
            value: v,
            label: label(v),
          }))}
          onChange={setSection}
        />
        <Field
          label="Search calendar"
          value={search}
          onChangeText={setSearch}
        />
        <Button
          secondary
          title={showFilters ? "Hide filters" : "More filters"}
          onPress={() => setShowFilters(!showFilters)}
        />
        {showFilters && (
          <Card>
            <Choices
              label="Status"
              value={status}
              options={[
                "all",
                "paid",
                "pending",
                "partiallyPaid",
                "overdue",
                "upcoming",
                "skipped",
                "cancelled",
              ].map((v) => ({ value: v, label: label(v) }))}
              onChange={setStatus}
            />
            <Choices
              label="Payment behavior"
              value={mode}
              options={[
                "all",
                "manual",
                "automatic",
                "automaticConfirmation",
              ].map((v) => ({ value: v, label: label(v) }))}
              onChange={setMode}
            />
            <Choices
              label="Currency"
              value={currency}
              options={["all", ...currencies]}
              onChange={setCurrency}
            />
            <Choices
              label="Contact"
              value={contact}
              options={[
                { value: "all", label: "Everyone" },
                ...(contacts.data?.rows.map((r) => ({
                  value: r.id,
                  label: recordTitle(r),
                })) ?? []),
              ]}
              onChange={setContact}
            />
            <Choices
              label="Category"
              value={category}
              options={[
                { value: "all", label: "All categories" },
                ...(categories.data?.rows.map((r) => ({
                  value: r.id,
                  label: recordTitle(r),
                })) ?? []),
              ]}
              onChange={setCategory}
            />
            {currency !== "all" && (
              <>
                <Field
                  label="Minimum amount (optional)"
                  value={minimum}
                  onChangeText={setMinimum}
                />
                <Field
                  label="Maximum amount (optional)"
                  value={maximum}
                  onChangeText={setMaximum}
                />
              </>
            )}
          </Card>
        )}
        {day && (
          <Button
            secondary
            title="Show whole month"
            onPress={() => setDay("")}
          />
        )}
        <Txt muted>
          {rows.length} payments{instances.data?.cached ? " · Cached view" : ""}
        </Txt>
        {instances.isPending ? (
          <Loading />
        ) : instances.error ? (
          <Failure error={instances.error} />
        ) : rows.length ? (
          rows.map((r) => (
            <DueRow
              key={r.id}
              row={r}
              obligations={obligations.data?.rows ?? []}
            />
          ))
        ) : (
          <Empty
            title="A clear calendar"
            description="No payments match this period and these filters."
          />
        )}
      </View>
    </Page>
  );
}
