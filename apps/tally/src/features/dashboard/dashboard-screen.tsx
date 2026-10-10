import React from "react";
import { View, Pressable, useWindowDimensions } from "react-native";
import { router, type Href } from "expo-router";
import { useRecords } from "../../shared/queries";
import { useSession } from "../auth/session-provider";
import { summaries, type CurrencySummary } from "./calculations";
import { todayInZone, addDays, displayDate } from "../../core/domain/date";
import { formatMoney } from "../../core/domain/money";
import {
  text,
  amount,
  recordTitle,
  label,
  type Row,
} from "../../core/domain/records";
import { Page, Txt, Pill, Button, Loading, Failure } from "../../shared/ui";
import { Icon } from "../../shared/icons";
import { useTheme } from "../../shared/theme";
import { MetricCard, MonthFocus, Panel, QuietEmpty } from "./dashboard-widgets";

export function DueRow({ row, obligations }: { row: Row; obligations: Row[] }) {
  const theme = useTheme(),
    parent = obligations.find((item) => item.id === row.data.obligationId);
  const incoming = row.data.section === "owedToMe",
    recurring = row.data.section === "monthlyDues";
  const tone = incoming ? "blue" : recurring ? "amber" : "green";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={parent ? recordTitle(parent) : "Obligation"}
      onPress={() =>
        router.push(`/obligations/${row.data.obligationId}` as Href)
      }
      style={({ pressed }) => ({
        flexDirection: "row",
        gap: 12,
        alignItems: "center",
        paddingHorizontal: 22,
        paddingVertical: 15,
        borderTopWidth: 1,
        borderTopColor: theme.border,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <View
        style={{
          width: 37,
          height: 37,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme[`${tone}Bg`],
        }}
      >
        <Icon
          name={incoming ? "people" : recurring ? "calendar" : "obligations"}
          color={theme[tone]}
          size={19}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt style={{ fontSize: 12, fontWeight: "600" }}>
          {parent
            ? recordTitle(parent)
            : text(row.data, "title", "Upcoming payment")}
        </Txt>
        <Txt muted style={{ fontSize: 11 }}>
          {displayDate(text(row.data, "dueDate") || null)} ·{" "}
          {label(text(row.data, "section"))}
        </Txt>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4, maxWidth: "46%" }}>
        <Txt style={{ fontSize: 13, fontWeight: "700" }}>
          {formatMoney(
            amount(row.data, "remainingMinor"),
            text(row.data, "currency"),
          )}
        </Txt>
        <Pill
          danger={
            text(row.data, "financialStatus") === "overdue" ||
            row.data.deductionStatus === "failed"
          }
        >
          {label(
            text(row.data, "deductionStatus") ||
              text(row.data, "financialStatus", "pending"),
          )}
        </Pill>
      </View>
    </Pressable>
  );
}
const zero: CurrencySummary = {
  owe: 0,
  owed: 0,
  net: 0,
  dueMonth: 0,
  paidMonth: 0,
  remainingMonth: 0,
  overdue: 0,
  dueToday: 0,
  dueSoon: 0,
};
export function DashboardScreen() {
  const { profile, session } = useSession(),
    parents = useRecords("obligations"),
    periods = useRecords("obligationInstances"),
    payments = useRecords("payments"),
    activity = useRecords("activities");
  const theme = useTheme(),
    { width } = useWindowDimensions(),
    columns = width >= 1100,
    threeMetrics = width >= 980;
  if (parents.isPending || periods.isPending || payments.isPending)
    return (
      <Page>
        <Loading />
      </Page>
    );
  const error = parents.error || periods.error || payments.error;
  if (error)
    return (
      <Page>
        <Failure
          error={error}
          retry={() =>
            void Promise.all([
              parents.refetch(),
              periods.refetch(),
              payments.refetch(),
            ])
          }
        />
      </Page>
    );
  const today = todayInZone(profile!.timezone),
    obligations = parents.data!.rows;
  const totals: Record<string, CurrencySummary> = summaries(
    obligations,
    periods.data!.rows,
    payments.data!.rows,
    today,
  );
  if (!Object.keys(totals).length) totals[profile!.defaultCurrency] = zero;
  const outstanding = periods
    .data!.rows.filter(
      (row) =>
        row.data.closed !== true &&
        !["cancelled", "skipped"].includes(text(row.data, "financialStatus")) &&
        (amount(row.data, "remainingMinor") ?? 0) > 0,
    )
    .sort((a, b) =>
      text(a.data, "dueDate").localeCompare(text(b.data, "dueDate")),
    );
  const due = outstanding.filter(
    (row) =>
      row.data.section !== "owedToMe" &&
      text(row.data, "dueDate") &&
      text(row.data, "dueDate") <= addDays(today, 7),
  );
  const overdue = due.filter((row) => text(row.data, "dueDate") < today);
  const dueToday = due.filter((row) => text(row.data, "dueDate") === today);
  const soon = due.filter((row) => text(row.data, "dueDate") > today);
  const incoming = outstanding.filter((row) => row.data.section === "owedToMe");
  const automatic = outstanding.filter(
    (row) =>
      row.data.section !== "owedToMe" &&
      row.data.paymentMode !== "manual" &&
      text(row.data, "dueDate") >= today,
  );
  const ownerName =
    session?.user.user_metadata?.full_name || session?.user.user_metadata?.name;
  const greeting =
    typeof ownerName === "string" && ownerName.trim()
      ? `HELLO, ${ownerName.trim().split(/\s+/)[0].toUpperCase()}`
      : "YOUR PERSONAL WORKSPACE";
  const month = new Intl.DateTimeFormat("en", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${today}T12:00:00Z`));
  function rows(items: Row[], limit = 5) {
    return items
      .slice(0, limit)
      .map((row) => (
        <DueRow key={row.id} row={row} obligations={obligations} />
      ));
  }
  function activeNote(code: string, section: "iOwe" | "owedToMe") {
    const ids = new Set(
      obligations
        .filter(
          (row) =>
            row.data.currency === code &&
            row.data.section === section &&
            (amount(row.data, "remainingMinor") ?? 0) > 0 &&
            row.data.archived !== true &&
            row.data.lifecycle !== "cancelled",
        )
        .map((row) => row.id),
    );
    if (section === "iOwe")
      for (const row of outstanding)
        if (row.data.section === "monthlyDues" && row.data.currency === code)
          ids.add(text(row.data, "obligationId"));
    return `${ids.size} active ${ids.size === 1 ? "obligation" : "obligations"}`;
  }
  return (
    <Page maxWidth={1440} padding={width >= 1000 ? 40 : 20}>
      <View style={{ gap: 24 }}>
        <View style={{ gap: 6 }}>
          <Txt muted style={{ fontSize: 11, fontWeight: "500" }}>
            {greeting}
          </Txt>
          <Txt
            big
            style={{
              fontSize: width < 480 ? 27 : 30,
              lineHeight: 40,
              fontWeight: "800",
              letterSpacing: -1.1,
            }}
          >
            Your money, at a glance.
          </Txt>
          <Txt muted style={{ fontSize: 12 }}>
            A little clarity for the things you need to remember.
          </Txt>
        </View>
        {(parents.data?.cached || periods.data?.cached) && (
          <Txt muted>Cached balances · reconnect to confirm.</Txt>
        )}
        {Object.entries(totals).map(([code, total]) => (
          <View key={code} style={{ gap: 20 }}>
            {Object.keys(totals).length > 1 && (
              <Txt muted style={{ fontSize: 11 }}>
                {code} · currencies stay separate
              </Txt>
            )}
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: threeMetrics ? 17 : 10,
              }}
            >
              <MetricCard
                title="You owe"
                value={total.owe}
                code={code}
                tone="green"
                icon="arrowDown"
                href="/obligations"
                note={activeNote(code, "iOwe")}
                style={{
                  flex: 1,
                  flexBasis: threeMetrics ? 0 : "45%",
                  padding: threeMetrics ? 23 : 16,
                }}
              />
              <MetricCard
                title="Owed to you"
                value={total.owed}
                code={code}
                tone="blue"
                icon="arrowUp"
                href="/obligations"
                note={activeNote(code, "owedToMe")}
                style={{
                  flex: 1,
                  flexBasis: threeMetrics ? 0 : "45%",
                  padding: threeMetrics ? 23 : 16,
                }}
              />
              <MetricCard
                title="Remaining this month"
                value={total.remainingMonth}
                code={code}
                tone="amber"
                icon="calendar"
                href="/calendar"
                note={`of ${formatMoney(total.dueMonth, code)} scheduled`}
                style={{
                  flex: threeMetrics ? 1 : undefined,
                  flexBasis: threeMetrics ? 0 : "100%",
                  padding: threeMetrics ? 23 : 16,
                }}
              />
            </View>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 7,
              }}
            >
              <Icon name="info" size={14} color={theme.muted} />
              <Txt muted style={{ fontSize: 11 }}>
                Net position{" "}
                <Txt style={{ fontSize: 11, fontWeight: "600" }}>
                  {formatMoney(total.net, code)}
                </Txt>
              </Txt>
              {width >= 700 && (
                <Txt muted style={{ fontSize: 11 }}>
                  · Based on remaining obligations. Currencies stay separate.
                </Txt>
              )}
            </View>
          </View>
        ))}
        <View
          style={{
            flexDirection: columns ? "row" : "column",
            gap: 21,
            alignItems: "flex-start",
          }}
        >
          <View
            style={{
              flex: columns ? 1.65 : undefined,
              width: columns ? undefined : "100%",
              minWidth: 0,
              gap: 21,
            }}
          >
            <Panel
              title="What needs your attention"
              count={due.length}
              link="See calendar"
              href="/calendar"
            >
              {overdue.length > 0 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Review overdue obligations"
                  onPress={() =>
                    router.push(
                      `/obligations/${overdue[0].data.obligationId}` as Href,
                    )
                  }
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    padding: 13,
                    marginHorizontal: 21,
                    marginBottom: 12,
                    backgroundColor: theme.redBg,
                    borderRadius: 9,
                  }}
                >
                  <Icon name="warning" color={theme.danger} size={19} />
                  <View style={{ flex: 1 }}>
                    <Txt
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: theme.danger,
                      }}
                    >
                      {overdue.length} overdue{" "}
                      {overdue.length === 1 ? "payment" : "payments"}
                    </Txt>
                    <Txt muted style={{ fontSize: 11 }}>
                      Open to review what’s still outstanding.
                    </Txt>
                  </View>
                  <Icon name="arrow" color={theme.danger} size={14} />
                </Pressable>
              )}
              {dueToday.length > 0 && (
                <>
                  <Txt
                    muted
                    style={{
                      paddingHorizontal: 22,
                      paddingVertical: 9,
                      fontSize: 10,
                      letterSpacing: 0.9,
                    }}
                  >
                    DUE TODAY
                  </Txt>
                  {rows(dueToday)}
                </>
              )}
              {soon.length > 0 && (
                <>
                  <Txt
                    muted
                    style={{
                      paddingHorizontal: 22,
                      paddingVertical: 9,
                      fontSize: 10,
                      letterSpacing: 0.9,
                    }}
                  >
                    COMING UP SOON
                  </Txt>
                  {rows(soon)}
                </>
              )}
              {!due.length && (
                <QuietEmpty
                  title="A little breathing room."
                  description="No outstanding payments due in the next seven days."
                />
              )}
              {overdue.length > 0 &&
                !dueToday.length &&
                !soon.length &&
                rows(overdue, 3)}
              <View
                style={{
                  flexDirection: "row",
                  gap: 7,
                  alignItems: "center",
                  paddingVertical: 14,
                  marginHorizontal: 22,
                  borderTopWidth: 1,
                  borderTopColor: theme.border,
                }}
              >
                <Icon name="clock" color={theme.muted} size={13} />
                <Txt muted style={{ flex: 1, fontSize: 10 }}>
                  A heads-up now means fewer surprises later.
                </Txt>
              </View>
            </Panel>
            <Panel
              title="Expected from others"
              link="View obligations"
              href="/obligations"
            >
              {incoming.length ? (
                rows(incoming, 4)
              ) : (
                <QuietEmpty
                  title="No money owed to you yet."
                  description="Record money you’ve lent to keep repayments clear."
                  icon="people"
                />
              )}
            </Panel>
            <Panel
              title="Recent activity"
              link="View activity"
              href="/activity"
            >
              {activity.error ? (
                <View style={{ padding: 20 }}>
                  <Failure
                    error={activity.error}
                    retry={() => void activity.refetch()}
                  />
                </View>
              ) : activity.isPending ? (
                <Txt muted style={{ padding: 22 }}>
                  Loading activity…
                </Txt>
              ) : activity.data?.rows.length ? (
                activity.data.rows
                  .slice()
                  .sort((a, b) =>
                    text(b.data, "createdAt").localeCompare(
                      text(a.data, "createdAt"),
                    ),
                  )
                  .slice(0, 4)
                  .map((row) => (
                    <View
                      key={row.id}
                      style={{
                        flexDirection: "row",
                        gap: 12,
                        paddingHorizontal: 22,
                        paddingVertical: 12,
                        alignItems: "center",
                      }}
                    >
                      <View
                        style={{
                          width: 29,
                          height: 29,
                          borderRadius: 16,
                          backgroundColor: theme.greenBg,
                          justifyContent: "center",
                          alignItems: "center",
                        }}
                      >
                        <Icon name="activity" color={theme.green} size={15} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Txt style={{ fontSize: 12 }}>
                          {label(
                            text(row.data, "kind", text(row.data, "type")),
                          )}
                        </Txt>
                        <Txt muted style={{ fontSize: 11 }}>
                          {text(row.data, "title")}
                        </Txt>
                      </View>
                    </View>
                  ))
              ) : (
                <QuietEmpty
                  title="Your story starts here."
                  description="Payments and updates will appear as you use Tally."
                  icon="activity"
                />
              )}
            </Panel>
          </View>
          <View
            style={{
              flex: columns ? 1 : undefined,
              width: columns ? undefined : "100%",
              minWidth: 0,
              gap: 21,
            }}
          >
            <MonthFocus totals={totals} month={month} />
            <Panel title="Upcoming auto deductions">
              {automatic.length ? (
                rows(automatic, 4)
              ) : (
                <QuietEmpty
                  title="Nothing automatic coming up."
                  description="Add a recurring bill with automatic tracking to see it here."
                  icon="bolt"
                />
              )}
              <View
                style={{
                  flexDirection: "row",
                  gap: 7,
                  borderTopWidth: 1,
                  borderTopColor: theme.border,
                  marginHorizontal: 22,
                  paddingVertical: 16,
                }}
              >
                <Icon name="info" color={theme.muted} size={14} />
                <Txt muted style={{ fontSize: 11, flex: 1 }}>
                  Tally tracks expected deductions. Your bank or provider makes
                  the actual payment.
                </Txt>
              </View>
            </Panel>
            <Panel title="One less thing on your mind.">
              <View
                style={{ paddingHorizontal: 22, paddingBottom: 21, gap: 16 }}
              >
                <Txt muted style={{ fontSize: 12 }}>
                  Rent, a loan from a friend, that monthly subscription. Give it
                  a place here.
                </Txt>
                <Button
                  title={
                    obligations.length
                      ? "+ Add something to remember"
                      : "Add my first obligation"
                  }
                  secondary
                  onPress={() => router.push("/add" as Href)}
                />
              </View>
            </Panel>
          </View>
        </View>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
            gap: 8,
            paddingTop: 4,
          }}
        >
          <Txt muted style={{ fontSize: 10 }}>
            Tally · A little less to remember.
          </Txt>
          <Txt muted style={{ fontSize: 10 }}>
            Each currency shown separately.
          </Txt>
        </View>
      </View>
    </Page>
  );
}
