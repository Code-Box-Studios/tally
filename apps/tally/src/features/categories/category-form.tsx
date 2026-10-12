import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { text, type Row } from "../../core/domain/records";
import { useSession } from "../auth/session-provider";
import { Icon } from "../../shared/icons";
import { useTheme } from "../../shared/theme";
import { Button, Choices, Field, Form, Txt } from "../../shared/ui";
import { categoryIcon, categoryIcons } from "./category-icons";

export function CategoryForm({
  existing,
  onDone,
}: {
  existing?: Row;
  onDone: (row?: Row) => void;
}) {
  const { execute } = useSession();
  const theme = useTheme();
  const [name, setName] = useState(existing ? text(existing.data, "name") : "");
  const [icon, setIcon] = useState(categoryIcon(existing));
  const [active, setActive] = useState(
    existing?.data.active === false ? "no" : "yes",
  );
  const [queued, setQueued] = useState(false);
  if (queued)
    return (
      <View style={{ gap: 12 }}>
        <Txt>Category saved for sync. It will appear after syncing.</Txt>
        <Button title="Close" onPress={() => onDone()} />
      </View>
    );
  return (
    <Form
      saveLabel={existing ? "Save changes" : "Add category"}
      onCancel={() => onDone()}
      onSave={async () => {
        if (!name.trim()) throw new Error("Enter a category name.");
        const values = {
          name: name.trim(),
          active: active === "yes",
          iconKey: icon,
        };
        const result = await execute("saveCatalog", {
          kind: "category",
          id: existing?.id ?? null,
          expectedRevision: existing ? Number(existing.data.revision) : null,
          values,
        });
        if (result.status !== "synced") {
          setQueued(true);
          return;
        }
        const id =
          typeof result.result?.id === "string"
            ? result.result.id
            : existing?.id;
        onDone(
          id
            ? {
                id,
                data: {
                  ...existing?.data,
                  ...values,
                  revision:
                    result.result?.revision ?? existing?.data.revision ?? 1,
                },
              }
            : undefined,
        );
      }}
    >
      <Field
        label="Category name"
        value={name}
        onChangeText={setName}
        maxLength={80}
      />
      <View style={{ gap: 8 }}>
        <Txt muted>Choose an icon</Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {categoryIcons.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="radio"
              accessibilityLabel={`${item.label} icon`}
              accessibilityState={{ checked: icon === item.key }}
              aria-checked={icon === item.key}
              onPress={() => setIcon(item.key)}
              style={({ pressed }) => ({
                minWidth: 88,
                minHeight: 68,
                flexBasis: 88,
                flexGrow: 1,
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                padding: 8,
                borderWidth: 1,
                borderRadius: 10,
                borderColor: icon === item.key ? theme.primary : theme.border,
                backgroundColor:
                  icon === item.key
                    ? theme.tint
                    : pressed
                      ? theme.background
                      : theme.surface,
              })}
            >
              <Icon
                name={item.key}
                color={icon === item.key ? theme.primary : theme.muted}
                size={22}
              />
              <Txt style={{ fontSize: 12 }}>{item.label}</Txt>
            </Pressable>
          ))}
        </View>
      </View>
      <Choices
        label="Available for new obligations"
        value={active}
        options={[
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ]}
        onChange={setActive}
      />
    </Form>
  );
}
