import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { useLocalSearchParams, router, type Href } from "expo-router";
import { useRecords } from "../../shared/queries";
import { text, amount, recordTitle, label } from "../../core/domain/records";
import { formatStatementMoney as formatMoney } from "../statements/statement-money";
import { displayDate } from "../../core/domain/date";
import { contactOverview } from "./contact-overview";
import { CatalogForm } from "./catalog-form";
import { ActionModal } from "../../shared/action-modal";
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
    instances = useRecords("obligationInstances"),
    payments = useRecords("payments"),
    [edit, setEdit] = useState(false);
  const queries = [contacts, obligations, instances, payments];
  if (queries.some((query) => query.isPending))
    return (
      <Page>
        <Loading />
      </Page>
    );
  const error = queries.find((query) => query.error)?.error;
  const retry = () => void Promise.all(queries.map((query) => query.refetch()));
  if (error)
    return (
      <Page>
        <Failure error={error} retry={retry} />
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
  let overview: ReturnType<typeof contactOverview>;
  try {
    overview = contactOverview(
      id,
      obligations.data!.rows,
      instances.data!.rows,
      payments.data!.rows,
    );
  } catch (cause) {
    return (
      <Page>
        <Failure error={cause} retry={retry} />
      </Page>
    );
  }
  return (
    <Page>
      <Heading
        title={recordTitle(person)}
        subtitle={text(person.data, "email") || text(person.data, "phone")}
        action={
          <Row>
            <Button
              title="Add obligation"
              onPress={() =>
                router.push({
                  pathname: "/add",
                  params: { contactId: id },
                } as Href)
              }
            />
            <Button
              secondary
              title="Edit contact"
              onPress={() => setEdit(true)}
            />
            <Button
              title="Generate statement"
              onPress={() =>
                router.push({
                  pathname: "/statement",
                  params: { contactId: id },
                } as Href)
              }
            />
          </Row>
        }
      />
      <View style={{ gap: 18 }}>
        {edit && (
          <ActionModal title="Edit contact" onClose={() => setEdit(false)}>
            <CatalogForm
              key={person.id}
              kind="contact"
              existing={person}
              onDone={() => setEdit(false)}
            />
          </ActionModal>
        )}
        <Txt>{text(person.data, "notes")}</Txt>
        {queries.some((query) => query.data?.cached) && (
          <Txt muted>Cached balances · reconnect to confirm.</Txt>
        )}
        {Object.entries(overview.positions).map(([code, v]) => (
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
            {!!v.unknownAmounts && (
              <Txt muted>
                {v.unknownAmounts} bill{" "}
                {v.unknownAmounts === 1 ? "amount" : "amounts"} needed · totals
                include known amounts only.
              </Txt>
            )}
          </Card>
        ))}
        <Heading title="Obligations" />
        {overview.accounts.map(
          ({ row: r, remainingMinor, unknownAmounts, excluded }) => (
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
                  {excluded ? " · Excluded from balances" : ""}
                </Txt>
                <Txt>
                  {formatMoney(remainingMinor, text(r.data, "currency"))}
                </Txt>
                {!!unknownAmounts && (
                  <Txt muted>
                    {unknownAmounts} bill{" "}
                    {unknownAmounts === 1 ? "amount" : "amounts"} needed
                  </Txt>
                )}
              </Card>
            </Pressable>
          ),
        )}
        <Heading title="Payment history" />
        {!overview.history.length && <Txt muted>No payments recorded yet.</Txt>}
        {overview.history.map((r) => (
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
