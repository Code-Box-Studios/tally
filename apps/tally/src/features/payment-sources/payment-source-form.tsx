import React, { useState } from "react";
import { useSession } from "../auth/session-provider";
import { text, label, type Row, type Data } from "../../core/domain/records";
import { Field, Choices, Form, Txt } from "../../shared/ui";
import { SelectField } from "../../shared/select-field";
import { paymentProviders, findPaymentProvider } from "./payment-providers";
import { PaymentSourceIcon } from "./payment-source-icon";

function sourceIcon(type: string) {
  return type === "bankAccount"
    ? "bank"
    : type === "eWallet"
      ? "wallet"
      : ["creditCard", "debitCard"].includes(type)
        ? "card"
        : type === "cash"
          ? "cash"
          : "other";
}

export function PaymentSourceForm({
  existing,
  onDone,
  onSaved,
}: {
  existing?: Row;
  onDone: () => void;
  onSaved?: (source: Row | null) => void;
}) {
  const { execute } = useSession();
  const data = existing?.data ?? {};
  const [name, setName] = useState(text(data, "name"));
  const [type, setType] = useState(text(data, "type", "cash"));
  const [provider, setProvider] = useState(
    text(data, "providerId") || findPaymentProvider(name, type)?.id || "custom",
  );
  const [iconKey, setIconKey] = useState(
    text(data, "iconKey") || sourceIcon(type),
  );
  const [nickname, setNickname] = useState(text(data, "nickname"));
  const [lastFour, setLastFour] = useState(text(data, "lastFour"));
  const [notes, setNotes] = useState(text(data, "notes"));
  const [active, setActive] = useState(data.active === false ? "no" : "yes");
  function chooseProvider(id: string) {
    setProvider(id);
    const preset = paymentProviders.find((item) => item.id === id);
    if (!preset) {
      setName("");
      return;
    }
    setName(preset.name);
    const nextType =
      preset.type === "bankAccount" &&
      ["debitCard", "creditCard"].includes(type)
        ? type
        : preset.type;
    setType(nextType);
    setIconKey(sourceIcon(nextType));
  }

  return (
    <Form
      saveLabel={existing ? "Save changes" : "Add payment source"}
      onCancel={onDone}
      onSave={async () => {
        if (!name.trim()) throw new Error("Enter a name.");
        if (lastFour && !/^\d{4}$/.test(lastFour))
          throw new Error("Enter exactly four digits.");
        const values: Data = {
          name: name.trim(),
          type,
          nickname: nickname.trim() || null,
          lastFour: lastFour || null,
          notes,
          active: active === "yes",
          providerId: provider === "custom" ? null : provider,
          iconKey,
        };
        const saved = await execute("saveCatalog", {
          kind: "source",
          id: existing?.id ?? null,
          expectedRevision: existing ? Number(data.revision) : null,
          values,
        });
        const id =
          saved?.status === "synced" && typeof saved.result?.id === "string"
            ? saved.result.id
            : null;
        onSaved?.(
          id
            ? { id, data: { ...values, revision: saved.result?.revision ?? 1 } }
            : null,
        );
        onDone();
      }}
    >
      <SelectField
        label="Provider"
        value={provider}
        searchable
        options={[
          {
            value: "custom",
            label: "Custom payment source",
            leading: <PaymentSourceIcon type={type} iconKey={iconKey} />,
          },
          ...paymentProviders.map((preset) => ({
            value: preset.id,
            label: preset.name,
            searchText: preset.aliases.join(" "),
            leading: (
              <PaymentSourceIcon
                name={preset.name}
                type={preset.type}
                providerId={preset.id}
              />
            ),
          })),
        ]}
        onChange={chooseProvider}
      />
      <Txt muted>
        Search Philippine banks, wallets and e-money issuers, or add your own
        source.
      </Txt>
      <Field label="Name" value={name} onChangeText={setName} maxLength={120} />
      <SelectField
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
        ].map((value) => ({
          value,
          label: label(value),
          leading: <PaymentSourceIcon type={value} />,
        }))}
        onChange={(next) => {
          setType(next);
          setIconKey(sourceIcon(next));
        }}
      />
      {provider === "custom" && (
        <SelectField
          label="Source icon"
          value={iconKey}
          options={["bank", "wallet", "card", "cash", "other"].map((value) => ({
            value,
            label: label(value),
            leading: <PaymentSourceIcon type={type} iconKey={value} />,
          }))}
          onChange={setIconKey}
        />
      )}
      <Field
        label="Nickname (optional)"
        placeholder="Savings, everyday spending…"
        value={nickname}
        onChangeText={setNickname}
        maxLength={120}
      />
      <Field
        label="Last four digits (optional)"
        value={lastFour}
        onChangeText={setLastFour}
        keyboardType="number-pad"
        maxLength={4}
      />
      <Txt muted>
        Labels only. Never enter card numbers, CVV, PINs, or banking passwords.
      </Txt>
      <Field
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        multiline
        maxLength={4000}
      />
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
