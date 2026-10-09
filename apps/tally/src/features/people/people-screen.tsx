import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { router, type Href } from "expo-router";
import { useRecords } from "../../shared/queries";
import { recordTitle, text, amount, type Row } from "../../core/domain/records";
import { formatMoney } from "../../core/domain/money";
import {
  Page,
  Heading,
  Card,
  Txt,
  Button,
  Field,
  Row as FlexRow,
  Loading,
  Failure,
  Empty,
} from "../../shared/ui";
import { CatalogForm } from "./catalog-form";
export function contactPositions(contact: string, obligations: Row[]) {
  const values: Record<string, { owe: number; owed: number }> = {};
  for (const r of obligations) {
    if (
      r.data.contactId !== contact ||
      r.data.lifecycle === "cancelled" ||
      r.data.section === "monthlyDues"
    )
      continue;
    const code = text(r.data, "currency"),
      v = values[code] ?? (values[code] = { owe: 0, owed: 0 });
    if (r.data.section === "iOwe")
      v.owe += amount(r.data, "remainingMinor") ?? 0;
    else v.owed += amount(r.data, "remainingMinor") ?? 0;
  }
  return values;
}
export function PeopleScreen() {
  const contacts = useRecords("contacts"),
    obligations = useRecords("obligations"),
    [add, setAdd] = useState(false),
    [search, setSearch] = useState("");
  const rows =
    contacts.data?.rows.filter((r) =>
      [
        recordTitle(r),
        text(r.data, "email"),
        text(r.data, "phone"),
        text(r.data, "notes"),
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  return (
    <Page>
      <Heading
        title="People & organizations"
        subtitle="A clear picture of each relationship."
        action={<Button title="Add contact" onPress={() => setAdd(!add)} />}
      />
      <View style={{ gap: 16 }}>
        {add && (
          <Card>
            <CatalogForm kind="contact" onDone={() => setAdd(false)} />
          </Card>
        )}
        <Field label="Search people" value={search} onChangeText={setSearch} />
        {contacts.isPending ? (
          <Loading />
        ) : contacts.error ? (
          <Failure error={contacts.error} />
        ) : (
          rows.map((r) => (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              accessibilityLabel={recordTitle(r)}
              onPress={() => router.push(`/people/${r.id}` as Href)}
            >
              <Card>
                <FlexRow>
                  <View style={{ flex: 1 }}>
                    <Txt style={{ fontSize: 19 }}>{recordTitle(r)}</Txt>
                    <Txt muted>
                      {r.data.kind === "organization"
                        ? "Organization"
                        : "Person"}
                      {r.data.archived ? " · Archived" : ""}
                    </Txt>
                  </View>
                  {Object.entries(
                    contactPositions(r.id, obligations.data?.rows ?? []),
                  ).map(([code, v]) => (
                    <View key={code}>
                      <Txt>
                        {v.owed >= v.owe ? "Owes you " : "You owe "}
                        {formatMoney(Math.abs(v.owed - v.owe), code)}
                      </Txt>
                      <Txt muted>Informational net position</Txt>
                    </View>
                  ))}
                </FlexRow>
              </Card>
            </Pressable>
          ))
        )}
        {!contacts.isPending && !rows.length && (
          <Empty
            title="Your people, remembered"
            description="Add a person or organization to connect loans, bills, and payment history."
          />
        )}
      </View>
    </Page>
  );
}
