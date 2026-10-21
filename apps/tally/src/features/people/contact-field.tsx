import React, { useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import { recordTitle, type Row } from "../../core/domain/records";
import { SelectField } from "../../shared/select-field";
import { Button, Txt } from "../../shared/ui";
import { useTheme } from "../../shared/theme";
import { CatalogForm } from "./catalog-form";

export function ContactField({
  rows,
  value,
  onChange,
  label = "Person / organization",
}: {
  rows: Row[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  const theme = useTheme();
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<Row[]>([]);
  const [message, setMessage] = useState("");
  const available = [
    ...rows,
    ...created.filter((row) => !rows.some((saved) => saved.id === row.id)),
  ];
  return (
    <>
      <SelectField
        label={label}
        value={value}
        searchable
        onChange={onChange}
        options={[
          { value: "", label: "No person selected" },
          ...available
            .filter((row) => row.data.archived !== true || row.id === value)
            .map((row) => ({ value: row.id, label: recordTitle(row) })),
        ]}
        footer={(close) => (
          <Button
            title="Add contact"
            onPress={() => {
              close();
              setMessage("");
              setAdding(true);
            }}
          />
        )}
      />
      {!!message && <Txt muted>{message}</Txt>}
      <Modal
        visible={adding}
        transparent
        animationType="none"
        onRequestClose={() => setAdding(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#00000066",
            padding: 16,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            accessibilityViewIsModal
            style={{
              width: "100%",
              maxWidth: 560,
              maxHeight: "90%",
              borderRadius: 20,
              backgroundColor: theme.surface,
              padding: 20,
              gap: 16,
            }}
          >
            <Txt big style={{ fontSize: 22 }}>
              New contact
            </Txt>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={{ flexShrink: 1 }}
            >
              {adding && (
                <CatalogForm
                  kind="contact"
                  onDone={() => setAdding(false)}
                  onSaved={(row) => {
                    if (row) {
                      setCreated((current) => [...current, row]);
                      onChange(row.id);
                    } else
                      setMessage(
                        "Contact saved for sync. Select it after syncing; your obligation draft is still here.",
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
