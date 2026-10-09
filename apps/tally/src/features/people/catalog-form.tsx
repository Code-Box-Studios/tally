import React, { useState } from "react";
import { useSession } from "../auth/session-provider";
import { text, label, type Row, type Data } from "../../core/domain/records";
import { Field, Choices, Form, Txt } from "../../shared/ui";
export function CatalogForm({
  kind,
  existing,
  onDone,
}: {
  kind: "contact" | "source" | "category";
  existing?: Row;
  onDone: () => void;
}) {
  const { execute } = useSession(),
    d = existing?.data ?? {},
    [name, setName] = useState(
      text(d, kind === "contact" ? "displayName" : "name"),
    ),
    [type, setType] = useState(
      text(d, "kind", text(d, "type", kind === "contact" ? "person" : "cash")),
    ),
    [email, setEmail] = useState(text(d, "email")),
    [phone, setPhone] = useState(text(d, "phone")),
    [address, setAddress] = useState(text(d, "address")),
    [organization, setOrganization] = useState(text(d, "organizationType")),
    [notes, setNotes] = useState(text(d, "notes")),
    [nickname, setNickname] = useState(text(d, "nickname")),
    [lastFour, setLastFour] = useState(text(d, "lastFour")),
    [active, setActive] = useState(
      d.archived === true || d.active === false ? "no" : "yes",
    );
  return (
    <Form
      saveLabel={
        existing
          ? "Save changes"
          : kind === "contact"
            ? "Add contact"
            : kind === "source"
              ? "Add payment source"
              : "Add category"
      }
      onCancel={onDone}
      onSave={async () => {
        if (!name.trim()) throw new Error("Enter a name.");
        const values: Data =
          kind === "contact"
            ? {
                kind: type,
                displayName: name.trim(),
                organizationType:
                  type === "organization" ? organization || null : null,
                email: email || null,
                phone: phone || null,
                address: address || null,
                notes,
                archived: active === "no",
              }
            : kind === "source"
              ? {
                  name: name.trim(),
                  type,
                  nickname: nickname || null,
                  lastFour: lastFour || null,
                  notes,
                  active: active === "yes",
                }
              : { name: name.trim(), active: active === "yes" };
        await execute("saveCatalog", {
          kind,
          id: existing?.id ?? null,
          expectedRevision: existing ? Number(d.revision) : null,
          values,
        });
        onDone();
      }}
    >
      <Field label="Name" value={name} onChangeText={setName} maxLength={120} />
      {kind === "contact" && (
        <>
          <Choices
            label="Contact type"
            value={type}
            options={[
              { value: "person", label: "Person" },
              { value: "organization", label: "Organization" },
            ]}
            onChange={setType}
          />
          {type === "organization" && (
            <Field
              label="Organization type"
              placeholder="Bank, school, provider…"
              value={organization}
              onChangeText={setOrganization}
            />
          )}
          <Field
            label="Email (optional)"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Field
            label="Phone (optional)"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <Field
            label="Address (optional)"
            value={address}
            onChangeText={setAddress}
          />
        </>
      )}
      {kind === "source" && (
        <>
          <Choices
            label="Source type"
            value={type}
            options={[
              "cash",
              "bankAccount",
              "debitCard",
              "creditCard",
              "eWallet",
              "payroll",
              "other",
            ].map((v) => ({ value: v, label: label(v) }))}
            onChange={setType}
          />
          <Field
            label="Nickname (optional)"
            value={nickname}
            onChangeText={setNickname}
          />
          <Field
            label="Last four digits (optional)"
            value={lastFour}
            onChangeText={setLastFour}
            keyboardType="number-pad"
            maxLength={4}
          />
          <Txt muted>
            Labels only. Never enter card numbers, CVV, PINs, or banking
            passwords.
          </Txt>
        </>
      )}
      {kind !== "category" && (
        <Field
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={4000}
        />
      )}
      <Choices
        label="Available for new obligations"
        value={active}
        options={[
          { value: "yes", label: "Active" },
          { value: "no", label: "Archived" },
        ]}
        onChange={setActive}
      />
    </Form>
  );
}
