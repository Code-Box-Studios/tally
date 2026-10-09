import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { router, type Href } from "expo-router";
import { useRecords } from "../../shared/queries";
import { recordTitle, text, amount, label } from "../../core/domain/records";
import { formatMoney, currencies, parseMoney } from "../../core/domain/money";
import { displayDate, civilDate } from "../../core/domain/date";
import {
  Heading,
  Page,
  Choices,
  Field,
  Card,
  Txt,
  Row,
  Pill,
  Button,
  Loading,
  Failure,
  Empty,
} from "../../shared/ui";
export function ObligationsScreen() {
  const query = useRecords("obligations"),
    contacts = useRecords("contacts"),
    categories = useRecords("categories"),
    sources = useRecords("paymentSources");
  const [section, setSection] = useState("iOwe"),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [currency, setCurrency] = useState("all"),
    [contact, setContact] = useState("all"),
    [category, setCategory] = useState("all"),
    [filters, setFilters] = useState(false),
    [mode, setMode] = useState("all"),
    [source, setSource] = useState("all"),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [minimum, setMinimum] = useState(""),
    [maximum, setMaximum] = useState("");
  let filterError: string | null = null,
    min = 0,
    max = Infinity;
  try {
    if (start) civilDate(start);
    if (end) civilDate(end);
    if (start && end && start > end)
      throw new Error("Start date must precede end date.");
    if (minimum || maximum) {
      if (currency === "all")
        throw new Error("Select one currency before filtering amounts.");
      if (minimum) min = parseMoney(minimum, currency);
      if (maximum) max = parseMoney(maximum, currency);
      if (min > max) throw new Error("Minimum amount must not exceed maximum.");
    }
  } catch (e) {
    filterError = (e as Error).message;
  }

  const rows =
    query.data?.rows.filter(
      (r) =>
        !filterError &&
        r.data.section === section &&
        (mode === "all" || r.data.paymentMode === mode) &&
        (source === "all" || r.data.paymentSourceId === source) &&
        (!start || text(r.data, "nextDueDate") >= start) &&
        (!end ||
          (!!text(r.data, "nextDueDate") &&
            text(r.data, "nextDueDate") <= end)) &&
        (amount(
          r.data,
          section === "monthlyDues" ? "defaultAmountMinor" : "remainingMinor",
        ) ?? 0) >= min &&
        (amount(
          r.data,
          section === "monthlyDues" ? "defaultAmountMinor" : "remainingMinor",
        ) ?? 0) <= max &&
        (status === "all" ||
          r.data.financialStatus === status ||
          r.data.lifecycle === status) &&
        (currency === "all" || r.data.currency === currency) &&
        (contact === "all" || r.data.contactId === contact) &&
        (category === "all" || r.data.categoryId === category) &&
        [
          recordTitle(r),
          text(r.data, "description"),
          text(r.data, "notes"),
          text(r.data, "contactName"),
          contacts.data?.rows.find((c) => c.id === r.data.contactId) &&
            recordTitle(
              contacts.data.rows.find((c) => c.id === r.data.contactId)!,
            ),
          categories.data?.rows.find((c) => c.id === r.data.categoryId) &&
            recordTitle(
              categories.data.rows.find((c) => c.id === r.data.categoryId)!,
            ),
        ]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) ?? [];
  return (
    <Page>
      <Heading
        title="Obligations"
        subtitle="A clear view of what’s outstanding."
        action={
          <Button title="+ Add" onPress={() => router.push("/add" as Href)} />
        }
      />
      <View style={{ gap: 18 }}>
        <Choices
          label="Show"
          value={section}
          options={[
            { value: "iOwe", label: "I Owe" },
            { value: "owedToMe", label: "Owed to Me" },
            { value: "monthlyDues", label: "Monthly Dues" },
          ]}
          onChange={setSection}
        />
        <Field
          label="Search obligations"
          placeholder="Person, bill, category or notes"
          value={search}
          onChangeText={setSearch}
        />
        <Button
          secondary
          title={filters ? "Hide filters" : "Filters"}
          onPress={() => setFilters(!filters)}
        />
        {filters && (
          <Card>
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
              label="Payment source"
              value={source}
              options={[
                { value: "all", label: "All sources" },
                ...(sources.data?.rows.map((r) => ({
                  value: r.id,
                  label: recordTitle(r),
                })) ?? []),
              ]}
              onChange={setSource}
            />
            <Field
              label="Due from (YYYY-MM-DD)"
              value={start}
              onChangeText={setStart}
            />
            <Field
              label="Due until (YYYY-MM-DD)"
              value={end}
              onChangeText={setEnd}
            />
            <Field
              label="Minimum remaining / bill amount"
              value={minimum}
              onChangeText={setMinimum}
              keyboardType="decimal-pad"
            />
            <Field
              label="Maximum remaining / bill amount"
              value={maximum}
              onChangeText={setMaximum}
              keyboardType="decimal-pad"
            />

            <Choices
              label="Status"
              value={status}
              options={[
                "all",
                "active",
                "partiallyPaid",
                "paid",
                "overdue",
                "cancelled",
                "paused",
                "ended",
              ].map((v) => ({ value: v, label: label(v) }))}
              onChange={setStatus}
            />
            <Choices
              label="Currency"
              value={currency}
              options={["all", ...currencies]}
              onChange={setCurrency}
            />
            <Choices
              label="Person / organization"
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
          </Card>
        )}
        {filterError && <Failure error={new Error(filterError)} />}
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <Failure error={query.error} retry={() => void query.refetch()} />
        ) : (
          <>
            <Txt muted>
              {rows.length} obligations
              {query.data?.cached ? " · Cached view" : ""}
            </Txt>
            {rows.map((r) => (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                accessibilityLabel={recordTitle(r)}
                onPress={() => router.push(`/obligations/${r.id}` as Href)}
              >
                <Card>
                  <Row>
                    <View style={{ flex: 1, minWidth: 140 }}>
                      <Txt style={{ fontSize: 17, fontWeight: "600" }}>
                        {recordTitle(r)}
                      </Txt>
                      <Txt muted>
                        {text(r.data, "contactName") ||
                          text(r.data, "description") ||
                          displayDate(text(r.data, "nextDueDate") || null)}
                      </Txt>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 6 }}>
                      <Txt style={{ fontSize: 20 }}>
                        {formatMoney(
                          amount(
                            r.data,
                            r.data.section === "monthlyDues"
                              ? "defaultAmountMinor"
                              : "remainingMinor",
                          ),
                          text(r.data, "currency"),
                        )}
                      </Txt>
                      <Pill danger={r.data.financialStatus === "overdue"}>
                        {label(
                          text(r.data, "lifecycle") === "active"
                            ? text(r.data, "financialStatus", "active")
                            : text(r.data, "lifecycle"),
                        )}
                      </Pill>
                      {r.data.section === "monthlyDues" && (
                        <Txt muted>{label(text(r.data, "paymentMode"))}</Txt>
                      )}
                    </View>
                  </Row>
                </Card>
              </Pressable>
            ))}
            {!rows.length && (
              <Empty
                title={
                  search
                    ? "Nothing matches yet"
                    : section === "owedToMe"
                      ? "Nothing owed to you yet"
                      : section === "monthlyDues"
                        ? "Your bills, all in one place"
                        : "Nothing owed yet"
                }
                description="Add an obligation, or adjust your search and filters."
                action={
                  <Button
                    title="Add obligation"
                    onPress={() => router.push("/add" as Href)}
                  />
                }
              />
            )}
          </>
        )}
      </View>
    </Page>
  );
}
