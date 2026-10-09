import React from "react";
import { View, Pressable } from "react-native";
import { router, type Href } from "expo-router";
import { useRecords } from "../../shared/queries";
import { useSession } from "../auth/session-provider";
import { summaries } from "./calculations";
import { todayInZone, addDays, displayDate } from "../../core/domain/date";
import { formatMoney } from "../../core/domain/money";
import {
  text,
  amount,
  recordTitle,
  label,
  type Row,
} from "../../core/domain/records";
import {
  Card,
  Heading,
  Page,
  Txt,
  Row as FlexRow,
  Pill,
  Empty,
  Button,
  Loading,
  Failure,
  styles,
} from "../../shared/ui";
export function DueRow({ row, obligations }: { row: Row; obligations: Row[] }) {
  const parent = obligations.find((p) => p.id === row.data.obligationId);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={parent ? recordTitle(parent) : "Obligation"}
      onPress={() =>
        router.push(`/obligations/${row.data.obligationId}` as Href)
      }
    >
      <Card style={{ padding: 16 }}>
        <FlexRow>
          <View style={{ flex: 1, minWidth: 140 }}>
            <Txt style={{ fontWeight: "600" }}>
              {parent
                ? recordTitle(parent)
                : text(row.data, "title", "Upcoming payment")}
            </Txt>
            <Txt muted>
              {displayDate(text(row.data, "dueDate") || null)} ·{" "}
              {label(text(row.data, "section"))}
            </Txt>
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <Txt>
              {formatMoney(
                amount(row.data, "remainingMinor"),
                text(row.data, "currency"),
              )}
            </Txt>
            <Pill danger={text(row.data, "financialStatus") === "overdue"}>
              {label(
                text(row.data, "deductionStatus") ||
                  text(row.data, "financialStatus", "Pending"),
              )}
            </Pill>
          </View>
        </FlexRow>
      </Card>
    </Pressable>
  );
}
export function DashboardScreen() {
  const { profile } = useSession(),
    parents = useRecords("obligations"),
    periods = useRecords("obligationInstances"),
    payments = useRecords("payments"),
    activity = useRecords("activities");
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
    totals = summaries(
      parents.data!.rows,
      periods.data!.rows,
      payments.data!.rows,
      today,
    ),
    due = periods
      .data!.rows.filter(
        (r) =>
          r.data.closed !== true &&
          text(r.data, "dueDate") &&
          text(r.data, "dueDate") <= addDays(today, 7),
      )
      .sort((a, b) =>
        text(a.data, "dueDate").localeCompare(text(b.data, "dueDate")),
      ),
    automatic = periods
      .data!.rows.filter(
        (r) =>
          r.data.closed !== true &&
          r.data.paymentMode !== "manual" &&
          text(r.data, "dueDate") >= today,
      )
      .sort((a, b) =>
        text(a.data, "dueDate").localeCompare(text(b.data, "dueDate")),
      );
  return (
    <Page>
      <Heading
        title="A little clarity, every day."
        subtitle="Here’s where things stand."
        action={
          <Button
            title="+ Add obligation"
            onPress={() => router.push("/add" as Href)}
          />
        }
      />
      {(parents.data?.cached || periods.data?.cached) && (
        <Txt muted>Cached balances · reconnect to confirm.</Txt>
      )}
      {!parents.data!.rows.length ? (
        <Empty
          title="A fresh start."
          description="Add money you’ve borrowed, lent, or a monthly due you want Tally to remember."
          action={
            <Button
              title="Add my first obligation"
              onPress={() => router.push("/add" as Href)}
            />
          }
        />
      ) : (
        Object.entries(totals).map(([code, t]) => (
          <View key={code} style={{ gap: 18, marginBottom: 24 }}>
            <Txt muted>{code} · currencies stay separate</Txt>
            <View style={styles.columns}>
              {[
                ["You Owe", t.owe],
                ["Owed to You", t.owed],
                ["Net Position", t.net],
                ["Overdue", t.overdue],
              ].map(([name, value]) => (
                <Card key={name} style={styles.grow}>
                  <Txt muted>{name}</Txt>
                  <Txt big>{formatMoney(Number(value), code)}</Txt>
                </Card>
              ))}
            </View>
            <View style={styles.columns}>
              {[
                ["Due this month", t.dueMonth],
                ["Paid this month", t.paidMonth],
                ["Remaining this month", t.remainingMonth],
                ["Due today", t.dueToday],
                ["Due soon", t.dueSoon],
              ].map(([name, value]) => (
                <Card key={name} style={styles.grow}>
                  <Txt muted>{name}</Txt>
                  <Txt style={{ fontSize: 21 }}>
                    {formatMoney(Number(value), code)}
                  </Txt>
                </Card>
              ))}
            </View>
          </View>
        ))
      )}
      <View style={styles.columns}>
        <View style={{ ...styles.grow, gap: 12 }}>
          <Heading
            title="Next up"
            subtitle="Overdue, today, and the next seven days."
          />
          {due.length ? (
            due
              .slice(0, 12)
              .map((r) => (
                <DueRow key={r.id} row={r} obligations={parents.data!.rows} />
              ))
          ) : (
            <Empty
              title="Room to breathe."
              description="No outstanding payments due in the next seven days."
            />
          )}
        </View>
        <View style={{ ...styles.grow, gap: 12 }}>
          <Heading
            title="Automatic deductions"
            subtitle="Expected payments, clearly tracked."
          />
          {automatic.length ? (
            automatic
              .slice(0, 8)
              .map((r) => (
                <DueRow key={r.id} row={r} obligations={parents.data!.rows} />
              ))
          ) : (
            <Empty
              title="No auto deductions yet"
              description="Choose automatic tracking when adding a recurring bill."
            />
          )}
          <Heading title="Recent activity" />
          {activity.data?.rows
            .slice()
            .sort((a, b) =>
              text(b.data, "createdAt").localeCompare(
                text(a.data, "createdAt"),
              ),
            )
            .slice(0, 5)
            .map((r) => (
              <Card key={r.id}>
                <Txt>{label(text(r.data, "kind", text(r.data, "type")))}</Txt>
                <Txt muted>{text(r.data, "title")}</Txt>
              </Card>
            ))}
        </View>
      </View>
    </Page>
  );
}
