import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { router, type Href } from "expo-router";
import { useRecords } from "../../shared/queries";
import { recordTitle, text } from "../../core/domain/records";
import { formatStatementMoney as formatMoney } from "../statements/statement-money";
import { contactOverview } from "./contact-overview";
import { SearchField } from "../../shared/search-field";
import {
  Page,
  Heading,
  Card,
  Txt,
  Button,
  Row as FlexRow,
  Loading,
  Failure,
  Empty,
} from "../../shared/ui";
import { CatalogForm } from "./catalog-form";
export function PeopleScreen() {
  const contacts = useRecords("contacts"),
    obligations = useRecords("obligations"),
    instances = useRecords("obligationInstances"),
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
  const queries = [contacts, obligations, instances];
  const pending = queries.some((query) => query.isPending);
  let error = queries.find((query) => query.error)?.error;
  const positions = new Map<
    string,
    ReturnType<typeof contactOverview>["positions"]
  >();
  if (!pending && !error) {
    try {
      for (const row of rows)
        positions.set(
          row.id,
          contactOverview(row.id, obligations.data!.rows, instances.data!.rows)
            .positions,
        );
    } catch (cause) {
      error = cause as Error;
    }
  }
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
        <SearchField
          label="Search people"
          placeholder="Search name, email, phone or notes"
          value={search}
          onChangeText={setSearch}
        />
        {queries.some((query) => query.data?.cached) && (
          <Txt muted>Cached balances · reconnect to confirm.</Txt>
        )}
        {pending ? (
          <Loading />
        ) : error ? (
          <Failure
            error={error}
            retry={() =>
              void Promise.all(queries.map((query) => query.refetch()))
            }
          />
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
                  {Object.entries(positions.get(r.id) ?? {}).map(
                    ([code, v]) => (
                      <View key={code}>
                        <Txt>You owe {formatMoney(v.owe, code)}</Txt>
                        <Txt>Owes you {formatMoney(v.owed, code)}</Txt>
                        {!!v.unknownAmounts && (
                          <Txt muted>
                            {v.unknownAmounts} bill{" "}
                            {v.unknownAmounts === 1 ? "amount" : "amounts"}{" "}
                            needed · known amounts only
                          </Txt>
                        )}
                      </View>
                    ),
                  )}
                </FlexRow>
              </Card>
            </Pressable>
          ))
        )}
        {!pending && !error && !rows.length && (
          <Empty
            title="Your people, remembered"
            description="Add a person or organization to connect loans, bills, and payment history."
          />
        )}
      </View>
    </Page>
  );
}
