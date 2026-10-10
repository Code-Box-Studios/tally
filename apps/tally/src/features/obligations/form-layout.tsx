import React, { type PropsWithChildren } from "react";
import { Pressable, View } from "react-native";
import { Card, Txt } from "../../shared/ui";
import { Icon, type IconName } from "../../shared/icons";
import { useTheme } from "../../shared/theme";

export function FormSection({
  title,
  subtitle,
  icon,
  children,
}: PropsWithChildren<{ title: string; subtitle: string; icon: IconName }>) {
  const theme = useTheme();
  return (
    <Card style={{ padding: 24, borderRadius: 18, gap: 20 }}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <View
          style={{
            backgroundColor: theme.tint,
            width: 38,
            height: 38,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} color={theme.primary} size={18} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt style={{ fontSize: 17, fontWeight: "700" }}>{title}</Txt>
          <Txt muted style={{ fontSize: 12 }}>
            {subtitle}
          </Txt>
        </View>
      </View>
      {children}
    </Card>
  );
}
export function FormGrid({
  children,
  columns,
}: PropsWithChildren<{ columns: boolean }>) {
  return (
    <View style={{ flexDirection: columns ? "row" : "column", gap: 16 }}>
      {React.Children.map(
        children,
        (child) =>
          child && <View style={{ flex: 1, minWidth: 0 }}>{child}</View>,
      )}
    </View>
  );
}
const types: {
  value: string;
  title: string;
  description: string;
  icon: IconName;
  tone: "green" | "blue" | "amber";
}[] = [
  {
    value: "borrowed",
    title: "I borrowed money",
    description: "Keep track of what you owe.",
    icon: "arrowUp",
    tone: "green",
  },
  {
    value: "lent",
    title: "I lent money",
    description: "Remember what’s owed to you.",
    icon: "arrowDown",
    tone: "blue",
  },
  {
    value: "installment",
    title: "Add installments",
    description: "One amount, smaller payments.",
    icon: "calendar",
    tone: "amber",
  },
  {
    value: "recurring",
    title: "Add monthly due",
    description: "Bills and recurring payments.",
    icon: "bolt",
    tone: "green",
  },
];
export function ObligationTypePicker({
  value,
  onChange,
  columns,
}: {
  value: string;
  onChange: (value: string) => void;
  columns: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <Txt style={{ fontSize: 13, fontWeight: "600" }}>
        What would you like to add?
      </Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {types.map((item) => (
          <Pressable
            key={item.value}
            accessibilityRole="radio"
            accessibilityLabel={item.title}
            accessibilityState={{ checked: value === item.value }}
            aria-checked={value === item.value}
            onPress={() => onChange(item.value)}
            style={({ pressed }) => ({
              width: columns ? "23%" : "47%",
              flexGrow: 1,
              borderWidth: 1,
              borderColor: value === item.value ? theme.primary : theme.border,
              borderRadius: 15,
              backgroundColor:
                value === item.value ? theme.tint : theme.surface,
              padding: 16,
              gap: 12,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 11,
                  backgroundColor: theme[`${item.tone}Bg`],
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={item.icon} color={theme[item.tone]} size={18} />
              </View>
              <View
                style={{
                  width: 17,
                  height: 17,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor:
                    value === item.value ? theme.primary : theme.border,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor:
                    value === item.value ? theme.primary : "transparent",
                }}
              >
                {value === item.value && (
                  <Icon name="check" size={11} color={theme.background} />
                )}
              </View>
            </View>
            <View style={{ gap: 4 }}>
              <Txt style={{ fontSize: 13, fontWeight: "700" }}>
                {item.title}
              </Txt>
              <Txt muted style={{ fontSize: 11, lineHeight: 17 }}>
                {item.description}
              </Txt>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
