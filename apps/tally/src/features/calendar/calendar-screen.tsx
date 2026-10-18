import React, { useRef, useState } from "react";
import { View, Pressable, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useRecords } from "../../shared/queries";
import { useSession } from "../auth/session-provider";
import {
  text,
  recordTitle,
  amount,
  label,
  type Row,
} from "../../core/domain/records";
import { displayDate, todayInZone } from "../../core/domain/date";
import { DateField } from "../../shared/date-field";
import { SearchField } from "../../shared/search-field";
import { ActionModal } from "../../shared/action-modal";
import { SelectField } from "../../shared/select-field";
import { Icon } from "../../shared/icons";
import { currencies, parseMoney, formatMoney } from "../../core/domain/money";
import { useTheme } from "../../shared/theme";
import {
  Page,
  Heading,
  Card,
  Field,
  Button,
  Txt,
  Loading,
  Failure,
} from "../../shared/ui";

import {
  overviewFilters,
  outstandingPeriod,
  periodDestination,
} from "../obligations/obligation-navigation";
const sections = [
  { value: "all", label: "All" },
  { value: "payable", label: "All you owe" },
  { value: "iOwe", label: "I owe" },
  { value: "owedToMe", label: "Owed to me" },
  { value: "monthlyDues", label: "Monthly bills" },
];
const options = (values: readonly string[]) =>
  values.map((value) => ({ value, label: label(value) }));

export function CalendarScreen() {
  const params = useLocalSearchParams();
  const initial = overviewFilters(params);
  return (
    <CalendarView
      key={`${initial.section}:${initial.status}:${initial.currency}`}
      initial={initial}
    />
  );
}
function CalendarView({
  initial,
}: {
  initial: ReturnType<typeof overviewFilters>;
}) {
  const { profile } = useSession();
  const instances = useRecords("obligationInstances"),
    obligations = useRecords("obligations"),
    contacts = useRecords("contacts"),
    categories = useRecords("categories");
  const today = todayInZone(profile!.timezone),
    viewport = useWindowDimensions();
  const compact = viewport.width < 700;
  const [month, setMonth] = useState(today.slice(0, 7)),
    [day, setDay] = useState("");
  const [view, setView] = useState<"Calendar" | "Agenda">("Calendar"),
    [contentWidth, setContentWidth] = useState(0);
  const [section, setSection] = useState(initial.section),
    [status, setStatus] = useState(initial.status),
    [mode, setMode] = useState("all"),
    [currency, setCurrency] = useState(initial.currency),
    [contact, setContact] = useState("all"),
    [category, setCategory] = useState("all"),
    [search, setSearch] = useState(""),
    [showFilters, setShowFilters] = useState(false),
    [minimum, setMinimum] = useState(""),
    [maximum, setMaximum] = useState("");
  const currentFilters = {
    section,
    status,
    mode,
    currency,
    contact,
    category,
    search,
    day,
    minimum,
    maximum,
  };
  const savedFilters = useRef(currentFilters);
  function openFilters() {
    savedFilters.current = currentFilters;
    setShowFilters(true);
  }
  function cancelFilters() {
    const saved = savedFilters.current;
    setSection(saved.section);
    setStatus(saved.status);
    setMode(saved.mode);
    setCurrency(saved.currency);
    setContact(saved.contact);
    setCategory(saved.category);
    setSearch(saved.search);
    setDay(saved.day);
    setMinimum(saved.minimum);
    setMaximum(saved.maximum);
    setShowFilters(false);
  }
  const t = useTheme(),
    activeView = view;
  const split = (contentWidth || viewport.width - (compact ? 32 : 288)) >= 1000;
  const colors: Record<string, string> = {
    iOwe: t.green,
    owedToMe: t.blue,
    monthlyDues: t.amber,
  };
  const parentById = new Map(obligations.data?.rows.map((r) => [r.id, r]));
  const contactById = new Map(contacts.data?.rows.map((r) => [r.id, r]));
  const categoryById = new Map(categories.data?.rows.map((r) => [r.id, r]));
  let filterError: string | null = null,
    min = 0,
    max = Infinity;
  try {
    if (minimum && currency !== "all") min = parseMoney(minimum, currency);
    if (maximum && currency !== "all") max = parseMoney(maximum, currency);
  } catch {
    filterError = "Enter a valid amount in the selected currency.";
  }
  if (min > max) filterError = "Minimum amount must not exceed maximum.";
  const monthRows = (instances.data?.rows ?? [])
    .filter((r) => {
      const parent = parentById.get(text(r.data, "obligationId")),
        person = contactById.get(text(r.data, "contactId")),
        cat = categoryById.get(text(r.data, "categoryId"));
      return (
        !filterError &&
        text(r.data, "dueDate").startsWith(month + "-") &&
        (section === "all" ||
          (section === "payable"
            ? r.data.section !== "owedToMe"
            : r.data.section === section)) &&
        (status === "all" ||
          (status === "outstanding"
            ? outstandingPeriod(r) &&
              parent?.data.archived !== true &&
              parent?.data.lifecycle !== "cancelled"
            : status === "pending"
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
          person && recordTitle(person),
          cat && recordTitle(cat),
          parent && text(parent.data, "notes"),
          text(r.data, "notes"),
        ]
          .join(" ")
          .toLowerCase()
          .includes(search.trim().toLowerCase())
      );
    })
    .sort(
      (a, b) =>
        text(a.data, "dueDate").localeCompare(text(b.data, "dueDate")) ||
        a.id.localeCompare(b.id),
    );
  const byDate = new Map<string, Row[]>();
  for (const row of monthRows) {
    const due = text(row.data, "dueDate");
    const scheduled = byDate.get(due);
    if (scheduled) scheduled.push(row);
    else byDate.set(due, [row]);
  }
  const rows = day ? (byDate.get(day) ?? []) : monthRows;
  const groups = day ? [[day, rows] as const] : [...byDate.entries()];
  const first = new Date(month + "-01T12:00:00Z"),
    offset = first.getUTCDay();
  const days = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const filterCount =
    [status, mode, currency, contact, category].filter((v) => v !== "all")
      .length +
    Number(!!minimum) +
    Number(!!maximum);
  const loading = [instances, obligations, contacts, categories].some(
    (q) => q.isPending,
  );
  const error = [instances, obligations, contacts, categories].find(
    (q) => q.error,
  )?.error;
  const cached = [instances, obligations, contacts, categories].some(
    (q) => q.data?.cached,
  );
  function shift(by: number) {
    const next = new Date(first);
    next.setUTCMonth(next.getUTCMonth() + by);
    setMonth(next.toISOString().slice(0, 7));
    setDay("");
  }
  function reset() {
    setStatus("all");
    setMode("all");
    setCurrency("all");
    setContact("all");
    setCategory("all");
    setMinimum("");
    setMaximum("");
    setSearch("");
    setSection("all");
    setDay("");
  }
  function chips(
    values: { value: string; label: string }[],
    selected: string,
    onChange: (v: string) => void,
  ) {
    return (
      <View
        style={{
          flexDirection: "row",
          flexWrap: compact ? "nowrap" : "wrap",
          gap: 6,
        }}
      >
        {values.map((item) => (
          <Pressable
            key={item.value}
            accessibilityRole="radio"
            accessibilityLabel={item.label}
            accessibilityState={{ checked: selected === item.value }}
            aria-checked={selected === item.value}
            onPress={() => onChange(item.value)}
            style={{
              minHeight: 44,
              flex: compact ? 1 : undefined,
              minWidth: 0,
              paddingHorizontal: compact ? 4 : 14,
              paddingVertical: 6,
              justifyContent: "center",
              borderRadius: 10,
              borderWidth: 1,
              borderColor: selected === item.value ? t.primary : t.border,
              backgroundColor: selected === item.value ? t.tint : t.surface,
            }}
          >
            <Txt
              style={{
                fontSize: compact ? 12 : 14,
                textAlign: "center",
                fontWeight: selected === item.value ? "700" : "500",
              }}
            >
              {item.label}
            </Txt>
          </Pressable>
        ))}
      </View>
    );
  }
  const todayButton = (
    <Button
      secondary
      title="Today"
      onPress={() => {
        setMonth(today.slice(0, 7));
        setDay(today);
      }}
    />
  );
  return (
    <Page padding={compact ? 16 : 24} maxWidth={1280}>
      <Heading
        title="Calendar"
        subtitle={
          compact ? undefined : "See what’s due. Tap a date to see its details."
        }
        action={compact ? todayButton : undefined}
      />
      <View
        onLayout={(event) => setContentWidth(event.nativeEvent.layout.width)}
        style={{ gap: compact ? 10 : 18 }}
      >
        <View
          style={{
            flexDirection: compact ? "column" : "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: compact ? 4 : 8,
              maxWidth: 520,
              flexGrow: 1,
              flexBasis: compact ? undefined : 360,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              disabled={month === "1900-01"}
              onPress={() => shift(-1)}
              style={{
                width: 44,
                height: 48,
                alignItems: "center",
                justifyContent: "center",
                opacity: month === "1900-01" ? 0.4 : 1,
              }}
            >
              <View style={{ transform: [{ rotate: "180deg" }] }}>
                <Icon name="chevron" color={t.ink} />
              </View>
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <DateField
                label="Month"
                hideLabel
                value={month}
                precision="month"
                today={today}
                onChange={(v) => {
                  setMonth(v);
                  setDay("");
                }}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              disabled={month === "2199-12"}
              onPress={() => shift(1)}
              style={{
                width: 44,
                height: 48,
                alignItems: "center",
                justifyContent: "center",
                opacity: month === "2199-12" ? 0.4 : 1,
              }}
            >
              <Icon name="chevron" color={t.ink} />
            </Pressable>
          </View>
          {!compact && (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
              }}
            >
              {chips(
                [
                  { value: "Calendar", label: "Calendar" },
                  { value: "Agenda", label: "Agenda" },
                ],
                activeView,
                (v) => setView(v as "Calendar" | "Agenda"),
              )}
              {todayButton}
            </View>
          )}
        </View>
        {chips(sections, section, setSection)}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: compact ? 8 : 12,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <SearchField
              label="Search calendar"
              hideLabel={compact}
              value={search}
              onChangeText={setSearch}
              placeholder={
                compact ? "Search calendar…" : "Search people, bills or notes…"
              }
            />
          </View>
          {compact ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Filters${filterCount ? ` (${filterCount})` : ""}`}
                accessibilityState={{ expanded: showFilters }}
                onPress={openFilters}
                style={{
                  minHeight: 48,
                  paddingHorizontal: 10,
                  borderWidth: 1,
                  borderColor:
                    showFilters || filterCount ? t.primary : t.border,
                  borderRadius: 10,
                  backgroundColor:
                    showFilters || filterCount ? t.tint : t.surface,
                  justifyContent: "center",
                }}
              >
                <Txt style={{ fontSize: 12, fontWeight: "600" }}>
                  Filters{filterCount ? ` (${filterCount})` : ""}
                </Txt>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  activeView === "Calendar" ? "Show agenda" : "Show calendar"
                }
                onPress={() =>
                  setView(activeView === "Calendar" ? "Agenda" : "Calendar")
                }
                style={{
                  width: 48,
                  minHeight: 48,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: t.border,
                  borderRadius: 10,
                  backgroundColor: t.surface,
                }}
              >
                <Icon
                  name={activeView === "Calendar" ? "obligations" : "calendar"}
                  color={t.ink}
                />
              </Pressable>
            </>
          ) : (
            <Button
              secondary
              title={`Filters${filterCount ? ` (${filterCount})` : ""}`}
              onPress={openFilters}
            />
          )}
          {!compact && (filterCount > 0 || !!search || section !== "all") && (
            <Button secondary title="Reset filters" onPress={reset} />
          )}
        </View>
        {!showFilters && !!filterError && (
          <Failure error={new Error(filterError)} />
        )}
        {showFilters && (
          <ActionModal
            title="Filter calendar"
            maxWidth={720}
            onClose={cancelFilters}
          >
            <View style={{ gap: 20 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
                {[
                  {
                    label: "Status",
                    value: status,
                    onChange: setStatus,
                    options: options([
                      "all",
                      "paid",
                      "pending",
                      "partiallyPaid",
                      "outstanding",
                      "overdue",
                      "upcoming",
                      "skipped",
                      "cancelled",
                    ]),
                  },
                  {
                    label: "Payment behavior",
                    value: mode,
                    onChange: setMode,
                    options: options([
                      "all",
                      "manual",
                      "automatic",
                      "automaticConfirmation",
                    ]),
                  },
                  {
                    label: "Currency",
                    value: currency,
                    onChange: (v: string) => {
                      setCurrency(v);
                      setMinimum("");
                      setMaximum("");
                    },
                    options: options(["all", ...currencies]),
                  },
                  {
                    label: "Contact",
                    value: contact,
                    onChange: setContact,
                    options: [
                      { value: "all", label: "Everyone" },
                      ...(contacts.data?.rows.map((r) => ({
                        value: r.id,
                        label: recordTitle(r),
                      })) ?? []),
                    ],
                  },
                  {
                    label: "Category",
                    value: category,
                    onChange: setCategory,
                    options: [
                      { value: "all", label: "All categories" },
                      ...(categories.data?.rows.map((r) => ({
                        value: r.id,
                        label: recordTitle(r),
                      })) ?? []),
                    ],
                  },
                ].map((field) => (
                  <View
                    key={field.label}
                    style={{ width: compact ? "100%" : "48%" }}
                  >
                    <SelectField {...field} />
                  </View>
                ))}
                {currency !== "all" && (
                  <>
                    <View style={{ width: compact ? "100%" : "48%" }}>
                      <Field
                        label="Minimum amount (optional)"
                        money
                        keyboardType="decimal-pad"
                        value={minimum}
                        onChangeText={setMinimum}
                      />
                    </View>
                    <View style={{ width: compact ? "100%" : "48%" }}>
                      <Field
                        label="Maximum amount (optional)"
                        money
                        keyboardType="decimal-pad"
                        value={maximum}
                        onChangeText={setMaximum}
                      />
                    </View>
                  </>
                )}
              </View>
              {!!filterError && <Failure error={new Error(filterError)} />}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                <Button
                  title="Apply filters"
                  disabled={!!filterError}
                  onPress={() => setShowFilters(false)}
                />
                <Button secondary title="Cancel" onPress={cancelFilters} />
                <Button
                  secondary
                  title="Reset filters"
                  onPress={reset}
                  disabled={!filterCount && !search && section === "all"}
                />
              </View>
            </View>
          </ActionModal>
        )}
        {loading ? (
          <Loading />
        ) : error ? (
          <Failure error={error} />
        ) : (
          <View
            style={{
              flexDirection:
                split && activeView === "Calendar" ? "row" : "column",
              alignItems: "stretch",
              gap: 20,
            }}
          >
            {activeView === "Calendar" && (
              <View style={{ flex: split ? 1.8 : undefined, minWidth: 0 }}>
                <Card
                  style={{ padding: compact ? 8 : 16, gap: compact ? 8 : 14 }}
                >
                  <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                      (name) => (
                        <View
                          key={name}
                          style={{
                            width: "14.285714%",
                            alignItems: "center",
                            paddingVertical: 8,
                          }}
                        >
                          <Txt muted style={{ fontSize: 12 }}>
                            {name}
                          </Txt>
                        </View>
                      ),
                    )}
                    {Array.from(
                      { length: Math.ceil((offset + days) / 7) * 7 },
                      (_, i) => {
                        const n = i - offset + 1;
                        if (n < 1 || n > days)
                          return (
                            <View
                              key={i}
                              style={{
                                width: "14.285714%",
                                minHeight: compact ? 62 : 100,
                                backgroundColor: t.surface2,
                              }}
                            />
                          );
                        const date = `${month}-${String(n).padStart(2, "0")}`,
                          items = byDate.get(date) ?? [],
                          selected = day === date;
                        return (
                          <Pressable
                            key={i}
                            accessibilityRole="button"
                            accessibilityLabel={`${displayDate(date)}, ${items.length} due ${items.length === 1 ? "date" : "dates"}`}
                            accessibilityState={{ selected }}
                            onPress={() => setDay(selected ? "" : date)}
                            style={{
                              width: "14.285714%",
                              minHeight: compact ? 62 : 100,
                              padding: compact ? 4 : 7,
                              borderWidth: 1,
                              borderColor: selected ? t.primary : t.border,
                              backgroundColor: selected ? t.tint : t.surface,
                              gap: 3,
                            }}
                          >
                            <View
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 14,
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor:
                                  date === today ? t.primary : "transparent",
                              }}
                            >
                              <Txt
                                style={{
                                  fontSize: 15,
                                  fontWeight:
                                    date === today || selected ? "700" : "500",
                                  color: date === today ? t.background : t.ink,
                                }}
                              >
                                {n}
                              </Txt>
                            </View>
                            {items.length > 0 && (
                              <View
                                style={{
                                  flexDirection: "row",
                                  flexWrap: "wrap",
                                  gap: 3,
                                  paddingHorizontal: 3,
                                }}
                              >
                                {[
                                  ...new Set(
                                    items.map((r) => text(r.data, "section")),
                                  ),
                                ].map((value) => (
                                  <View
                                    key={value}
                                    style={{
                                      width: 6,
                                      height: 6,
                                      borderRadius: 3,
                                      backgroundColor:
                                        colors[value] ?? t.primary,
                                    }}
                                  />
                                ))}
                              </View>
                            )}
                            {!compact && items.length > 0 && (
                              <Txt
                                muted
                                style={{ fontSize: 12, lineHeight: 17 }}
                              >
                                {items.length} due
                              </Txt>
                            )}
                          </Pressable>
                        );
                      },
                    )}
                  </View>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}
                  >
                    {sections.slice(1).map((item) => (
                      <View
                        key={item.value}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <View
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: 4,
                            backgroundColor: colors[item.value],
                          }}
                        />
                        <Txt muted style={{ fontSize: 12 }}>
                          {item.label}
                        </Txt>
                      </View>
                    ))}
                  </View>
                </Card>
              </View>
            )}
            <View
              style={{
                flex: split && activeView === "Calendar" ? 1 : undefined,
                minWidth: 0,
                gap: 12,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <View>
                  <Txt style={{ fontSize: 18, fontWeight: "700" }}>
                    {day ? displayDate(day) : "This month"}
                  </Txt>
                  <Txt muted>
                    {rows.length} due {rows.length === 1 ? "date" : "dates"}
                    {cached ? " · Cached view" : ""}
                  </Txt>
                </View>
                {!!day && (
                  <Button
                    secondary
                    title="Show whole month"
                    onPress={() => setDay("")}
                  />
                )}
              </View>
              {rows.length === 0 ? (
                <Card>
                  <Icon name="calendar" color={t.muted} size={28} />
                  <Txt style={{ fontSize: 18, fontWeight: "600" }}>
                    Nothing due {day ? "on this date" : "this month"}
                  </Txt>
                  <Txt muted>
                    {search || filterCount || section !== "all"
                      ? "Try another search or reset your filters."
                      : "Your scheduled obligations will appear here."}
                  </Txt>
                  {(!!search || filterCount > 0 || section !== "all") && (
                    <Button secondary title="Clear filters" onPress={reset} />
                  )}
                </Card>
              ) : (
                groups.map(([date, items]) => (
                  <View key={date} style={{ gap: 8 }}>
                    {!day && (
                      <Txt
                        muted
                        style={{
                          fontSize: 14,
                          fontWeight: "600",
                          paddingTop: 4,
                        }}
                      >
                        {displayDate(date)}
                      </Txt>
                    )}
                    {items.map((row) => {
                      const parent = parentById.get(
                          text(row.data, "obligationId"),
                        ),
                        title = parent ? recordTitle(parent) : "Obligation",
                        person = contactById.get(text(row.data, "contactId"));
                      return (
                        <Pressable
                          key={row.id}
                          accessibilityRole="button"
                          accessibilityLabel={`${title}, ${formatMoney(amount(row.data, "remainingMinor"), text(row.data, "currency"))}, ${label(text(row.data, "financialStatus"))}`}
                          onPress={() => router.push(periodDestination(row))}
                          style={({ pressed }) => ({
                            borderWidth: 1,
                            borderColor: t.border,
                            borderRadius: 12,
                            padding: 16,
                            gap: 10,
                            backgroundColor: t.surface,
                            opacity: pressed ? 0.8 : 1,
                          })}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              gap: 10,
                              alignItems: "flex-start",
                            }}
                          >
                            <View
                              style={{
                                width: 4,
                                alignSelf: "stretch",
                                borderRadius: 2,
                                backgroundColor:
                                  colors[text(row.data, "section")] ??
                                  t.primary,
                              }}
                            />
                            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                              <Txt style={{ fontSize: 16, fontWeight: "600" }}>
                                {title}
                              </Txt>
                              <Txt muted style={{ fontSize: 13 }}>
                                {[
                                  person && recordTitle(person),
                                  label(text(row.data, "section")),
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </Txt>
                            </View>
                            <Icon name="chevron" color={t.muted} size={16} />
                          </View>
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              gap: 8,
                              flexWrap: "wrap",
                              paddingLeft: 14,
                            }}
                          >
                            <Txt style={{ fontSize: 16, fontWeight: "700" }}>
                              {formatMoney(
                                amount(row.data, "remainingMinor"),
                                text(row.data, "currency"),
                              )}
                            </Txt>
                            <Txt muted style={{ fontSize: 13 }}>
                              {label(text(row.data, "financialStatus"))}
                            </Txt>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ))
              )}
            </View>
          </View>
        )}
      </View>
    </Page>
  );
}
