import React, { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, TextInput, View } from "react-native";
import { useTheme } from "./theme";
import { Icon } from "./icons";
import { Txt } from "./ui";

export type SelectOption = { value: string; label: string };
export function SelectField({
  label,
  value,
  options,
  onChange,
  searchable = false,
  placeholder = "Choose an option",
}: {
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  searchable?: boolean;
  placeholder?: string;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState("");
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(
    () =>
      options.filter((option) =>
        option.label
          .replaceAll("_", " ")
          .toLowerCase()
          .includes(search.trim().replaceAll("_", " ").toLowerCase()),
      ),
    [options, search],
  );
  function close() {
    setOpen(false);
    setSearch("");
  }
  return (
    <View style={{ gap: 6 }}>
      <Txt muted>{label}</Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? (value || placeholder)}`}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          minHeight: 48,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.surface,
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 11,
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <Txt style={{ flex: 1 }}>
          {selected?.label ?? (value || placeholder)}
        </Txt>
        <View style={{ transform: [{ rotate: "90deg" }] }}>
          <Icon name="chevron" size={14} color={theme.muted} />
        </View>
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={close}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
            backgroundColor: "#00000066",
          }}
        >
          <Pressable
            accessibilityLabel={`Close ${label} picker`}
            accessibilityRole="button"
            onPress={close}
            style={{ position: "absolute", inset: 0 }}
          />
          <View
            accessibilityViewIsModal
            style={{
              width: "100%",
              maxWidth: 480,
              maxHeight: "85%",
              borderRadius: 20,
              padding: 20,
              backgroundColor: theme.surface,
              borderWidth: 1,
              borderColor: theme.border,
              gap: 16,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <Txt big style={{ fontSize: 21, fontWeight: "700" }}>
                {label}
              </Txt>
              <Pressable
                accessibilityLabel="Close picker"
                accessibilityRole="button"
                onPress={close}
                style={{
                  width: 44,
                  height: 44,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="close" color={theme.muted} />
              </Pressable>
            </View>
            {searchable && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  backgroundColor: theme.background,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                }}
              >
                <Icon name="search" color={theme.muted} size={18} />
                <TextInput
                  accessibilityLabel={`Search ${label.toLowerCase()}`}
                  placeholder={`Search ${label.toLowerCase()}…`}
                  placeholderTextColor={theme.muted}
                  value={search}
                  onChangeText={setSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: 48,
                    fontSize: 16,
                    color: theme.ink,
                    fontFamily: "DM Sans",
                  }}
                />
              </View>
            )}
            <FlatList
              style={{ flexGrow: 0, maxHeight: 360 }}
              data={filtered}
              keyExtractor={(item) => item.value}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Txt muted style={{ paddingVertical: 20 }}>
                  No matching options. Try another search.
                </Txt>
              }
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityLabel={item.label}
                  accessibilityState={{ checked: value === item.value }}
                  aria-checked={value === item.value}
                  onPress={() => {
                    onChange(item.value);
                    close();
                  }}
                  style={({ pressed }) => ({
                    minHeight: 48,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    padding: 12,
                    borderRadius: 10,
                    backgroundColor:
                      value === item.value
                        ? theme.tint
                        : pressed
                          ? theme.background
                          : "transparent",
                  })}
                >
                  <Txt
                    style={{
                      flex: 1,
                      color: value === item.value ? theme.primary : theme.ink,
                    }}
                  >
                    {item.label}
                  </Txt>
                  {value === item.value && (
                    <Icon name="check" color={theme.primary} size={17} />
                  )}
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
