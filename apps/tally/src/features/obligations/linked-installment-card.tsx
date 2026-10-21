import React from "react";
import { View } from "react-native";
import { router, type Href } from "expo-router";
import { amount, object, text, type Row } from "../../core/domain/records";
import { formatMoney } from "../../core/domain/money";
import { Button, Card, Row as FlexRow, Txt, styles } from "../../shared/ui";

export function LinkedInstallmentCard({
  obligation,
  linked,
}: {
  obligation: Row;
  linked?: Row;
}) {
  const data = obligation.data;
  if (!text(data, "linkedObligationId")) return null;
  const account = data.installmentAccountSnapshot
    ? object(data.installmentAccountSnapshot)
    : {};
  const valid =
    linked &&
    linked.id === data.linkedObligationId &&
    linked.data.linkedObligationId === obligation.id &&
    linked.data.type === "installment" &&
    ((data.installmentRole === "provider" &&
      linked.data.installmentRole === "repayment") ||
      (data.installmentRole === "repayment" &&
        linked.data.installmentRole === "provider"));
  const provider =
    data.installmentRole === "provider"
      ? obligation
      : valid
        ? linked
        : undefined;
  const repayment =
    data.installmentRole === "repayment"
      ? obligation
      : valid
        ? linked
        : undefined;
  const person = repayment?.data.contactSnapshot
    ? object(repayment.data.contactSnapshot)
    : {};
  const personName = text(person, "displayName");
  return (
    <Card>
      <Txt big>Installment on your account</Txt>
      <Txt muted>
        {[
          text(account, "name", "Card / lending account"),
          text(account, "lastFour") ? `••${text(account, "lastFour")}` : "",
        ]
          .filter(Boolean)
          .join(" · ")}
      </Txt>
      <FlexRow>
        {[
          { label: "Your provider balance", row: provider },
          {
            label: personName ? `${personName} owes you` : "They owe you",
            row: repayment,
          },
        ].map(({ label, row }) => (
          <View key={label} style={styles.grow}>
            <Txt muted>{label}</Txt>
            <Txt big>
              {row
                ? formatMoney(
                    amount(row.data, "remainingMinor"),
                    text(row.data, "currency"),
                  )
                : "Unavailable"}
            </Txt>
            {row?.data.lifecycle === "cancelled" && <Txt muted>Cancelled</Txt>}
          </View>
        ))}
      </FlexRow>
      <Txt muted>
        Provider payments and repayments from this person are recorded
        separately. Each payment reduces only its own balance.
      </Txt>
      {valid ? (
        <Button
          secondary
          title={
            data.installmentRole === "provider"
              ? "View repayments"
              : "View provider installment"
          }
          onPress={() => router.push(`/obligations/${linked.id}` as Href)}
        />
      ) : (
        <Txt muted>
          Linked installment unavailable. Refresh to load its balance.
        </Txt>
      )}
    </Card>
  );
}
