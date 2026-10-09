import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { useLocalSearchParams, router, type Href } from "expo-router";
import { useRecords } from "../../shared/queries";
import { text, amount, recordTitle, label } from "../../core/domain/records";
import { formatMoney } from "../../core/domain/money";
import { displayDate } from "../../core/domain/date";
import { contactPositions } from "./people-screen";
import { CatalogForm } from "./catalog-form";
import {
  Page,
  Heading,
  Card,
  Txt,
  Button,
  Loading,
  Failure,
  Row,
  styles,
} from "../../shared/ui";
export function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    contacts = useRecords("contacts"),
    obligations = useRecords("obligations"),
    payments = useRecords("payments"),
    [edit, setEdit] = useState(false);
  if (contacts.isPending)
    return (
      <Page>
        <Loading />
      </Page>
    );
  const person = contacts.data?.rows.find((r) => r.id === id);
  if (!person)
    return (
      <Page>
        <Failure
          error={contacts.error ?? new Error("This contact is unavailable.")}
        />
      </Page>
    );
  const debts =
      obligations.data?.rows.filter((r) => r.data.contactId === id) ?? [],
    ids = new Set(debts.map((r) => r.id));
  return (
    <Page>
      <Heading
        title={recordTitle(person)}
        subtitle={text(person.data, "email") || text(person.data, "phone")}
        action={
          <Button
            secondary
            title="Edit contact"
            onPress={() => setEdit(!edit)}
          />
        }
      />
      <View style={{ gap: 18 }}>
        {edit && (
          <Card>
            <CatalogForm
              kind="contact"
              existing={person}
              onDone={() => setEdit(false)}
            />
          </Card>
        )}
        <Txt>{text(person.data, "notes")}</Txt>
        {Object.entries(contactPositions(id, debts)).map(([code, v]) => (
          <Card key={code}>
            <Txt>{code}</Txt>
            <Row>
              <View style={styles.grow}>
                <Txt muted>They owe you</Txt>
                <Txt big>{formatMoney(v.owed, code)}</Txt>
              </View>
              <View style={styles.grow}>
                <Txt muted>You owe them</Txt>
                <Txt big>{formatMoney(v.owe, code)}</Txt>
              </View>
            </Row>
            <Txt>
              {v.owed >= v.owe ? "They owe you " : "You owe them "}
              {formatMoney(Math.abs(v.owed - v.owe), code)} net.
            </Txt>
            <Txt muted>
              Informational only. Independent debts stay separate.
            </Txt>
          </Card>
        ))}
        <Heading title="Obligations" />
        {debts.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => router.push(`/obligations/${r.id}` as Href)}
            accessibilityRole="button"
          >
            <Card>
              <Txt style={{ fontSize: 17 }}>{recordTitle(r)}</Txt>
              <Txt muted>
                {label(text(r.data, "section"))} ·{" "}
                {label(text(r.data, "financialStatus"))}
              </Txt>
              <Txt>
                {formatMoney(
                  amount(r.data, "remainingMinor"),
                  text(r.data, "currency"),
                )}
              </Txt>
            </Card>
          </Pressable>
        ))}
        <Heading title="Payment history" />
        {payments.data?.rows
          .filter((r) => ids.has(text(r.data, "obligationId")))
          .map((r) => (
            <Card key={r.id}>
              <Txt>
                {displayDate(text(r.data, "paymentDate"))} ·{" "}
                {r.data.entryType === "reversal" ? "Reversed" : "Paid"}
              </Txt>
              <Txt>
                {formatMoney(
                  amount(r.data, "amountMinor"),
                  text(r.data, "currency"),
                )}
              </Txt>
            </Card>
          ))}
      </View>
    </Page>
  );
}
