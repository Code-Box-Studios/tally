import React, { useState, type PropsWithChildren } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { useTheme } from "./theme";
export function Txt({
  children,
  muted,
  big,
  style,
}: {
  children: React.ReactNode;
  muted?: boolean;
  big?: boolean;
  style?: object;
}) {
  const t = useTheme();
  return (
    <Text
      style={[
        {
          color: muted ? t.muted : t.ink,
          fontFamily: big ? "Manrope" : "DM Sans",
          fontSize: big ? 26 : 14,
          lineHeight: big ? 36 : 22,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Card({
  children,
  style,
}: PropsWithChildren<{ style?: ViewStyle }>) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          borderWidth: 1,
          borderRadius: 14,
          padding: 20,
          gap: 12,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Button({
  title,
  onPress,
  secondary = false,
  danger = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 46,
        paddingVertical: 12,
        paddingHorizontal: 18,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: danger ? t.danger : secondary ? t.border : t.primary,
        backgroundColor: secondary
          ? "transparent"
          : danger
            ? t.danger
            : t.primary,
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        alignItems: "center",
        justifyContent: "center",
      })}
    >
      <Text
        style={{
          color: secondary ? (danger ? t.danger : t.ink) : t.background,
          fontFamily: "DM Sans",
          fontWeight: "600",
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Txt muted>{label}</Txt>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={t.muted}
        style={[
          {
            minHeight: 46,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: t.border,
            backgroundColor: t.surface,
            color: t.ink,
            fontFamily: "DM Sans",
            fontSize: 14,
          },
          props.style,
        ]}
      />
    </View>
  );
}
export function Choices({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (string | { value: string; label: string })[];
  onChange: (value: string) => void;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Txt muted>{label}</Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((option) => {
          const v = typeof option === "string" ? option : option.value,
            title = typeof option === "string" ? option : option.label;
          return (
            <Pressable
              key={v}
              accessibilityRole="radio"
              accessibilityState={{ checked: value === v }}
              aria-checked={value === v}
              accessibilityLabel={title}
              onPress={() => onChange(v)}
              style={{
                paddingVertical: 9,
                paddingHorizontal: 13,
                borderRadius: 9,
                borderWidth: 1,
                borderColor: value === v ? t.primary : t.border,
                backgroundColor: value === v ? t.tint : t.surface,
              }}
            >
              <Txt>{title}</Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
export function Pill({
  children,
  danger,
}: {
  children: React.ReactNode;
  danger?: boolean;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        alignSelf: "flex-start",
        paddingVertical: 3,
        paddingHorizontal: 10,
        borderRadius: 20,
        backgroundColor: danger ? t.warm : t.tint,
      }}
    >
      <Txt style={{ fontSize: 12, color: danger ? t.danger : t.primary }}>
        {children}
      </Txt>
    </View>
  );
}
export function Heading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        marginBottom: 24,
      }}
    >
      <View>
        <Txt big>{title}</Txt>
        {subtitle && <Txt muted>{subtitle}</Txt>}
      </View>
      {action}
    </View>
  );
}
export function Row({ children }: PropsWithChildren) {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "center",
      }}
    >
      {children}
    </View>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <Txt big style={{ fontSize: 20 }}>
        {title}
      </Txt>
      <Txt muted>{description}</Txt>
      {action}
    </Card>
  );
}
export function Loading() {
  return (
    <View style={{ padding: 36, alignItems: "center" }}>
      <ActivityIndicator />
      <Txt muted>Loading your workspace…</Txt>
    </View>
  );
}
export function Failure({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <Card>
      <Txt>
        {error instanceof Error
          ? error.message
          : "Tally could not load this section."}
      </Txt>
      {retry && <Button title="Try again" onPress={retry} />}
    </Card>
  );
}
export function Form({
  children,
  onSave,
  saveLabel = "Save",
  onCancel,
  fullWidth = false,
}: PropsWithChildren<{
  onSave: () => Promise<void>;
  saveLabel?: string;
  onCancel?: () => void;
  fullWidth?: boolean;
}>) {
  const [busy, setBusy] = useState(false),
    [blocked, setBlocked] = useState(false),
    [error, setError] = useState("");
  return (
    <View testID="tally-form" style={{ gap: 16, maxWidth: 680 }}>
      {children}
      {!!error && <Failure error={new Error(error)} />}
      <View
        style={[
          { gap: 12 },
          !fullWidth && {
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
          },
        ]}
      >
        <Button
          disabled={busy || blocked}
          title={busy ? "Saving…" : saveLabel}
          onPress={() => {
            setBusy(true);
            setError("");
            void onSave()
              .catch((e) => {
                setError((e as Error).message);
                if ((e as Error & { actionSaved?: boolean }).actionSaved)
                  setBlocked(true);
              })
              .finally(() => setBusy(false));
          }}
        />
        {onCancel && <Button secondary title="Cancel" onPress={onCancel} />}
      </View>
    </View>
  );
}
export function Page({
  children,
  centered = false,
}: PropsWithChildren<{ centered?: boolean }>) {
  const theme = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        padding: 24,
        gap: 18,
        paddingBottom: centered ? 32 : 56,
        ...(centered ? { flexGrow: 1, justifyContent: "center" } : {}),
      }}
    >
      <View style={{ width: "100%", maxWidth: 1200, alignSelf: "center" }}>
        {children}
      </View>
    </ScrollView>
  );
}
export const styles = StyleSheet.create({
  stack: { gap: 16 },
  columns: { flexDirection: "row", flexWrap: "wrap", gap: 18 },
  grow: { flex: 1, minWidth: 250 },
});
