import React, { useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import { router, type Href } from "expo-router";
import { recordTitle, type Row } from "../../core/domain/records";
import { SelectField } from "../../shared/select-field";
import { useTheme } from "../../shared/theme";
import { Button, Txt } from "../../shared/ui";
import { CategoryForm } from "./category-form";
import { categoryIcon } from "./category-icons";

export function CategoryField({
  rows,
  value,
  onChange,
}: {
  rows: Row[];
  value: string;
  onChange: (value: string) => void;
}) {
  const theme = useTheme();
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<Row[]>([]);
  const options = [
    ...rows,
    ...created.filter(
      (row) => !rows.some((existing) => existing.id === row.id),
    ),
  ]
    .filter((row) => row.data.active !== false || row.id === value)
    .map((row) => ({
      value: row.id,
      label: recordTitle(row),
      icon: categoryIcon(row),
    }));
  return (
    <>
      <SelectField
        label="Category"
        value={value}
        options={
          options.length
            ? options
            : [
                {
                  value: "default-personal-loan",
                  label: "Personal Loan",
                  icon: "wallet",
                },
              ]
        }
        onChange={onChange}
        searchable
        footer={(close) => (
          <View style={{ gap: 8 }}>
            <Button
              title="Add category"
              onPress={() => {
                close();
                setAdding(true);
              }}
            />
            <Button
              secondary
              title="Manage categories"
              onPress={() => {
                close();
                  router.push("/settings?tab=categories" as Href);
              }}
            />
          </View>
        )}
      />
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
              Add category
            </Txt>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 4 }}
            >
              <CategoryForm
                onDone={(row) => {
                  if (row) {
                    setCreated((current) => [...current, row]);
                    onChange(row.id);
                  }
                  setAdding(false);
                }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
