import React from "react";
import { useLocalSearchParams } from "expo-router";
import { Page, Heading, Loading, Failure } from "../../shared/ui";
import { useRecords } from "../../shared/queries";
import { ObligationForm } from "../../features/obligations/obligation-form";
export default function Add() {
  const { contactId } = useLocalSearchParams<{
    contactId?: string | string[];
  }>();
  const contacts = useRecords("contacts");
  const selected =
    typeof contactId === "string"
      ? (contacts.data?.rows.find(
          (row) => row.id === contactId && row.data.archived !== true,
        )?.id ?? "")
      : "";
  return (
    <Page maxWidth={1000}>
      <Heading
        title="A little detail. A lot of clarity."
        subtitle="Add an obligation. Tally will help you keep track of what comes next."
      />
      {contactId && contacts.isPending ? (
        <Loading />
      ) : contactId && contacts.error ? (
        <Failure error={contacts.error} retry={() => void contacts.refetch()} />
      ) : (
        <ObligationForm key={selected} initialContactId={selected} />
      )}
    </Page>
  );
}
