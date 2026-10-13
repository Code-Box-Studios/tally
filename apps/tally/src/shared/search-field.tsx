import React, { useRef, useState } from "react";
import {
  Platform,
  Pressable,
  TextInput,
  View,
  type TextStyle,
} from "react-native";
import { Icon } from "./icons";
import { useTheme } from "./theme";
import { Txt } from "./ui";

// React Native omits CSS "none" from its outline type; web requires it to remove the inner focus ring.
const webInputStyle = { outlineStyle: "none" } satisfies React.CSSProperties;

export function SearchField({
  label,
  value,
  onChangeText,
  placeholder = "Search…",
  hideLabel = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  hideLabel?: boolean;
}) {
  const t = useTheme();
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {!hideLabel && <Txt muted>{label}</Txt>}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: 48,
          paddingLeft: 14,
          paddingRight: value.length ? 0 : 14,
          gap: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: focused ? t.primary : t.border,
          backgroundColor: t.surface,
        }}
      >
        <Icon name="search" color={t.muted} />
        <TextInput
          ref={input}
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={t.muted}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="search"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            {
              flex: 1,
              minWidth: 0,
              minHeight: 48,
              paddingVertical: 12,
              color: t.ink,
              fontFamily: "DM Sans",
              fontSize: 16,
            },
            Platform.OS === "web"
              ? (webInputStyle as unknown as TextStyle)
              : undefined,
          ]}
        />
        {value.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => {
              onChangeText("");
              input.current?.focus();
            }}
            style={({ pressed }) => ({
              width: 48,
              minHeight: 48,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 10,
              backgroundColor: pressed ? t.tint : "transparent",
            })}
          >
            <Icon name="close" color={t.muted} size={18} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
