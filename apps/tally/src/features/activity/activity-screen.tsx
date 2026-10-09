import React from "react";
import { View, Pressable } from "react-native";
import { router, type Href } from "expo-router";
import { useRecords } from "../../shared/queries";
import { text, amount, label } from "../../core/domain/records";
import { formatMoney } from "../../core/domain/money";
import {
  Page,
  Heading,
  Card,
  Txt,
  Loading,
  Failure,
  Empty,
} from "../../shared/ui";
export function ActivityScreen() {
  const query = useRecords("activities");
  return (
    <Page>
      <Heading title="Activity" subtitle="A history you can follow." />
      <View style={{ gap: 14 }}>
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <Failure error={query.error} />
        ) : (
          query
            .data!.rows.slice()
            .sort((a, b) =>
              text(b.data, "createdAt").localeCompare(
                text(a.data, "createdAt"),
              ),
            )
            .map((r) => (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                onPress={() => {
                  if (r.data.obligationId)
                    router.push(`/obligations/${r.data.obligationId}` as Href);
                }}
              >
                <Card>
                  <Txt style={{ fontWeight: "600" }}>
                    {label(text(r.data, "kind", text(r.data, "type")))}
                  </Txt>
                  <Txt>{text(r.data, "title")}</Txt>
                  {r.data.currency && amount(r.data, "amountMinor") != null && (
                    <Txt>
                      {formatMoney(
                        amount(r.data, "amountMinor"),
                        text(r.data, "currency"),
                      )}
                    </Txt>
                  )}
                  <Txt muted>
                    {text(r.data, "createdAt")
                      ? new Date(text(r.data, "createdAt")).toLocaleString()
                      : ""}
                  </Txt>
                </Card>
              </Pressable>
            ))
        )}
        {query.data && !query.data.rows.length && (
          <Empty
            title="Your story starts here"
            description="New obligations, payments and reminders will appear as you use Tally."
          />
        )}
      </View>
    </Page>
  );
}
