import React, { useState } from "react";
import { View } from "react-native";
import { router, type Href } from "expo-router";
import { useSession } from "../auth/session-provider";
import { useRecords } from "../../shared/queries";
import { text, label, amount } from "../../core/domain/records";
import { formatMoney } from "../../core/domain/money";
import {
  Page,
  Heading,
  Card,
  Button,
  Txt,
  Loading,
  Failure,
  Empty,
  Row,
} from "../../shared/ui";
export function RemindersScreen() {
  const query = useRecords("reminders"),
    { execute } = useSession(),
    [error, setError] = useState<unknown>(null);
  return (
    <Page>
      <Heading title="Reminders" subtitle="A gentle nudge for what’s due." />
      <View style={{ gap: 14 }}>
        {!!error && <Failure error={error} />}
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <Failure error={query.error} />
        ) : (
          query
            .data!.rows.filter(
              (r) => r.data.visible === true && r.data.status !== "cancelled",
            )
            .sort((a, b) =>
              text(b.data, "scheduledAt").localeCompare(
                text(a.data, "scheduledAt"),
              ),
            )
            .map((r) => (
              <Card key={r.id}>
                <Txt style={{ fontWeight: "600" }}>
                  {label(text(r.data, "kind"))}
                </Txt>
                <Txt>{text(r.data, "title", "Payment reminder")}</Txt>
                {r.data.currency && (
                  <Txt>
                    {formatMoney(
                      amount(r.data, "amountMinor"),
                      text(r.data, "currency"),
                    )}
                  </Txt>
                )}
                <Txt muted>
                  {text(r.data, "scheduledAt")
                    ? new Date(text(r.data, "scheduledAt")).toLocaleString()
                    : ""}
                </Txt>
                <Row>
                  {r.data.obligationId && (
                    <Button
                      secondary
                      title="Open obligation"
                      onPress={() =>
                        router.push(
                          `/obligations/${r.data.obligationId}` as Href,
                        )
                      }
                    />
                  )}
                  <Button
                    secondary
                    disabled={r.data.readAt != null}
                    title={r.data.readAt != null ? "Read" : "Mark as read"}
                    onPress={() =>
                      void execute("markReminderRead", {
                        reminderId: r.id,
                        expectedRevision: Number(r.data.revision),
                      })
                        .then(() => query.refetch())
                        .catch(setError)
                    }
                  />
                </Row>
              </Card>
            ))
        )}
        {query.data &&
          !query.data.rows.some((r) => r.data.visible === true) && (
            <Empty
              title="Nothing needs a nudge yet"
              description="Tally generates reminders from your saved due dates, even while the app is closed."
            />
          )}
      </View>
    </Page>
  );
}
