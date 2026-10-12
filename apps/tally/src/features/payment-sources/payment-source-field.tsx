import React, { useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import { recordTitle, text, type Row } from "../../core/domain/records";
import { useRecords } from "../../shared/queries";
import { SelectField } from "../../shared/select-field";
import { Button, Txt } from "../../shared/ui";
import { useTheme } from "../../shared/theme";
import { PaymentSourceIcon } from "./payment-source-icon";
import { PaymentSourceForm } from "./payment-source-form";

export function PaymentSourceField({
  value,
  onChange,
  label = "Payment source",
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  const theme = useTheme();
  const sources = useRecords("paymentSources");
  const [adding, setAdding] = useState(false);
  const [confirmed, setConfirmed] = useState<Row | null>(null);
  const [message, setMessage] = useState("");
  const rows = [...(sources.data?.rows ?? [])];
  if (confirmed && !rows.some((row) => row.id === confirmed.id))
    rows.push(confirmed);
  return (
    <>
      <SelectField
        label={label}
        value={value}
        searchable
        options={[
          { value: "", label: "None" },
          ...rows
            .filter(
              (source) => source.data.active !== false || source.id === value,
            )
            .map((source) => ({
              value: source.id,
              label: [
                recordTitle(source),
                text(source.data, "nickname"),
                text(source.data, "lastFour")
                  ? `••${text(source.data, "lastFour")}`
                  : "",
                source.data.active === false ? "Archived" : "",
              ]
                .filter(Boolean)
                .join(" · "),
              leading: (
                <PaymentSourceIcon
                  name={text(source.data, "name")}
                  type={text(source.data, "type")}
                  providerId={text(source.data, "providerId")}
                  iconKey={text(source.data, "iconKey")}
                />
              ),
            })),
        ]}
        onChange={onChange}
        footer={(close) => (
          <Button
            secondary
            title="Add payment source"
            onPress={() => {
              close();
              setMessage("");
              setAdding(true);
            }}
          />
        )}
      />
      {message ? <Txt muted>{message}</Txt> : null}
      <Modal
        visible={adding}
        transparent
        animationType="none"
        onRequestClose={() => setAdding(false)}
      >
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            backgroundColor: "#00000066",
          }}
        >
          <View
            accessibilityViewIsModal
            style={{
              width: "100%",
              maxWidth: 560,
              maxHeight: "90%",
              padding: 22,
              borderRadius: 20,
              backgroundColor: theme.surface,
              borderColor: theme.border,
              borderWidth: 1,
              gap: 16,
            }}
          >
            <Txt big style={{ fontSize: 22 }}>
              Add payment source
            </Txt>
            <ScrollView
              style={{ flexShrink: 1 }}
              keyboardShouldPersistTaps="handled"
            >
              {adding && (
                <PaymentSourceForm
                  onDone={() => setAdding(false)}
                  onSaved={(source) => {
                    if (source) {
                      setConfirmed(source);
                      onChange(source.id);
                    } else
                      setMessage(
                        "Saved on this device. Your source will appear after syncing.",
                      );
                  }}
                />
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
