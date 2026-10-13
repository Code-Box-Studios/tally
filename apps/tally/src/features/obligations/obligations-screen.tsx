import React, { useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useRecords } from "../../shared/queries";
import {
  recordTitle,
  text,
  amount,
  label,
  type Row,
} from "../../core/domain/records";
import { formatMoney, currencies, parseMoney } from "../../core/domain/money";
import { displayDate, civilDate, todayInZone } from "../../core/domain/date";
import { DateField } from "../../shared/date-field";
import { SearchField } from "../../shared/search-field";
import { useTheme } from "../../shared/theme";
import { useSession } from "../auth/session-provider";
import {
  Heading,
  Page,
  Choices,
  Field,
  Card,
  Txt,
  Pill,
  Button,
  Loading,
  Failure,
  Empty,
} from "../../shared/ui";
import { overviewFilters, outstandingPeriod } from "./obligation-navigation";
export function ObligationsScreen() {
  const params = useLocalSearchParams();
  const initial = overviewFilters(params);
  return (
    <ObligationList
      key={`${initial.section}:${initial.status}:${initial.currency}`}
      initial={initial}
    />
  );
}
function ObligationList({
  initial,
}: {
  initial: ReturnType<typeof overviewFilters>;
}) {
  const { profile } = useSession();
  const theme = useTheme();
  const mobile = useWindowDimensions().width < 680;
  const query = useRecords("obligations"),
    periods = useRecords("obligationInstances"),
    contacts = useRecords("contacts"),
    categories = useRecords("categories"),
    sources = useRecords("paymentSources");
  const [section, setSection] = useState(initial.section),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(initial.status),
    [currency, setCurrency] = useState(initial.currency),
    [contact, setContact] = useState("all"),
    [category, setCategory] = useState("all"),
    [filters, setFilters] = useState(false),
    [mode, setMode] = useState("all"),
    [source, setSource] = useState("all"),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [minimum, setMinimum] = useState(""),
    [maximum, setMaximum] = useState("");
  const today = todayInZone(profile!.timezone);
  const needsPeriods = status === "overdue" || status === "outstanding";
  function matchesStatus(row: Row) {
    if (!needsPeriods)
      return (
        status === "all" ||
        row.data.financialStatus === status ||
        row.data.lifecycle === status
      );
    if (row.data.archived === true || row.data.lifecycle === "cancelled")
      return false;
    const open = (periods.data?.rows ?? []).filter(
      (period) =>
        period.data.obligationId === row.id && outstandingPeriod(period),
    );
    if (status === "outstanding")
      return row.data.section === "monthlyDues"
        ? open.length > 0
        : (amount(row.data, "remainingMinor") ?? 0) > 0;
    return (
      open.some(
        (period) =>
          !!text(period.data, "dueDate") &&
          text(period.data, "dueDate") < today,
      ) ||
      (row.data.section !== "monthlyDues" &&
        (amount(row.data, "remainingMinor") ?? 0) > 0 &&
        !!text(row.data, "nextDueDate") &&
        text(row.data, "nextDueDate") < today)
    );
  }
  const filterCount = [
    status !== "all",
    currency !== "all",
    contact !== "all",
    category !== "all",
    mode !== "all",
    source !== "all",
    !!start,
    !!end,
    !!minimum,
    !!maximum,
  ].filter(Boolean).length;
  function clearFilters() {
    setStatus("all");
    setCurrency("all");
    setContact("all");
    setCategory("all");
    setMode("all");
    setSource("all");
    setStart("");
    setEnd("");
    setMinimum("");
    setMaximum("");
  }
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
        (section === "all" ||
          (section === "payable"
            ? r.data.section !== "owedToMe"
            : r.data.section === section)) &&
        (mode === "all" || r.data.paymentMode === mode) &&
        (source === "all" || r.data.paymentSourceId === source) &&
        (!start || text(r.data, "nextDueDate") >= start) &&
        (!end ||
          (!!text(r.data, "nextDueDate") &&
            text(r.data, "nextDueDate") <= end)) &&
        (amount(
          r.data,
          r.data.section === "monthlyDues"
            ? "defaultAmountMinor"
            : "remainingMinor",
        ) ?? 0) >= min &&
        (amount(
          r.data,
          r.data.section === "monthlyDues"
            ? "defaultAmountMinor"
            : "remainingMinor",
        ) ?? 0) <= max &&
        matchesStatus(r) &&
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
    <Page padding={mobile ? 16 : 24}>
      <Heading
        title="Obligations"
        subtitle="A clear view of what’s outstanding."
        action={
          <Button
            title="Add obligation"
            onPress={() => router.push("/add" as Href)}
          />
        }
      />
      <View style={{ gap: 18 }}>
        <Choices
          label="Show"
          value={section}
          options={[
            { value: "all", label: "All" },
            { value: "payable", label: "All you owe" },
            { value: "iOwe", label: "I Owe" },
            { value: "owedToMe", label: "Owed to Me" },
            { value: "monthlyDues", label: "Monthly Dues" },
          ]}
          onChange={setSection}
        />
        <View
          style={{
            flexDirection: mobile ? "column" : "row",
            alignItems: mobile ? "stretch" : "flex-end",
            gap: 12,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <SearchField
              label="Search obligations"
              placeholder="Search person, bill, category or notes"
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <Button
            secondary
            title={
              filters
                ? "Hide filters"
                : filterCount
                  ? `Filters (${filterCount})`
                  : "Filters"
            }
            onPress={() => setFilters(!filters)}
          />
        </View>
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
            <DateField
              label="Due from"
              value={start}
              onChange={setStart}
              optional
              today={todayInZone(profile!.timezone)}
            />
            <DateField
              label="Due until"
              value={end}
              onChange={setEnd}
              optional
              today={todayInZone(profile!.timezone)}
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
                "outstanding",
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
            <Button
              secondary
              title="Clear filters"
              onPress={clearFilters}
              disabled={!filterCount}
            />
          </Card>
        )}
        {filterError ? <Failure error={new Error(filterError)} /> : null}
        {query.isPending || (needsPeriods && periods.isPending) ? (
          <Loading />
        ) : query.error || (needsPeriods && periods.error) ? (
          <Failure
            error={query.error || periods.error}
            retry={() => {
              void query.refetch();
              void periods.refetch();
            }}
          />
        ) : (
          <>
            <Txt muted>
              {rows.length} {rows.length === 1 ? "obligation" : "obligations"}
              {query.data?.cached ? " · Cached view" : ""}
            </Txt>
            {rows.map((r) => {
              const person = contacts.data?.rows.find(
                (c) => c.id === r.data.contactId,
              );
              const personName =
                text(r.data, "contactName") ||
                (person ? recordTitle(person) : "");
              const categoryRow = categories.data?.rows.find(
                (c) => c.id === r.data.categoryId,
              );
              const dueDate = text(r.data, "nextDueDate");
              const recurring = r.data.section === "monthlyDues";
              return (
                <Pressable
                  key={r.id}
                  accessibilityRole="button"
                  accessibilityLabel={recordTitle(r)}
                  onPress={() => router.push(`/obligations/${r.id}` as Href)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
                >
                  <Card style={{ padding: mobile ? 16 : 20 }}>
                    <View
                      style={{
                        flexDirection: mobile ? "column" : "row",
                        gap: 18,
                        alignItems: mobile ? "stretch" : "center",
                      }}
                    >
                      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                        <View
                          style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <View
                            style={{
                              backgroundColor: theme.tint,
                              borderRadius: 6,
                              paddingHorizontal: 8,
                              paddingVertical: 2,
                            }}
                          >
                            <Txt
                              style={{
                                color: theme.primary,
                                fontSize: 12,
                                fontWeight: "600",
                              }}
                            >
                              {label(text(r.data, "section"))}
                            </Txt>
                          </View>
                          {categoryRow ? (
                            <Txt muted>{recordTitle(categoryRow)}</Txt>
                          ) : null}
                        </View>
                        <Txt
                          style={{
                            fontSize: 20,
                            lineHeight: 28,
                            fontWeight: "600",
                          }}
                        >
                          {recordTitle(r)}
                        </Txt>
                        {personName || text(r.data, "description") ? (
                          <Txt muted>
                            {personName || text(r.data, "description")}
                          </Txt>
                        ) : null}
                        <Txt muted>
                          {dueDate
                            ? `Next due ${displayDate(dueDate)}`
                            : "No due date"}
                        </Txt>
                      </View>
                      <View
                        style={{
                          flexDirection: mobile ? "row" : "column",
                          justifyContent: "space-between",
                          alignItems: mobile ? "center" : "flex-end",
                          gap: 10,
                        }}
                      >
                        <View
                          style={{
                            alignItems: mobile ? "flex-start" : "flex-end",
                            gap: 2,
                          }}
                        >
                          <Txt muted>
                            {recurring ? "Bill amount" : "Remaining"}
                          </Txt>
                          <Txt
                            style={{
                              fontSize: 24,
                              lineHeight: 32,
                              fontWeight: "600",
                            }}
                          >
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
                        </View>
                        <View style={{ alignItems: "flex-end", gap: 6 }}>
                          <Pill danger={r.data.financialStatus === "overdue"}>
                            {label(
                              text(r.data, "lifecycle") === "active"
                                ? text(r.data, "financialStatus", "active")
                                : text(r.data, "lifecycle"),
                            )}
                          </Pill>
                          {r.data.section === "monthlyDues" && (
                            <Txt muted>
                              {label(text(r.data, "paymentMode"))}
                            </Txt>
                          )}
                        </View>
                      </View>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
            {!rows.length && (
              <Empty
                title={
                  search || filterCount
                    ? "Nothing matches yet"
                    : section === "all"
                      ? "Your obligations, all in one place"
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
