import React, { useState, type PropsWithChildren } from "react";
import {
  View,
  Text,
  Pressable,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { router, type Href } from "expo-router";
import { Card, Txt } from "../../shared/ui";
import { Icon, type IconName } from "../../shared/icons";
import { useTheme } from "../../shared/theme";
import { formatMoney } from "../../core/domain/money";
import type { CurrencySummary } from "./calculations";

export function TextLink({ title, href }: { title: string; href: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => router.push(href as Href)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        minHeight: 32,
      }}
    >
      <Txt muted style={{ fontSize: 11 }}>
        {title}
      </Txt>
      <Icon name="arrow" size={13} color={theme.muted} />
    </Pressable>
  );
}
export function MetricCard({
  title,
  value,
  code,
  note,
  tone,
  icon,
  href,
  style,
}: {
  title: string;
  value: number;
  code: string;
  note: string;
  tone: "green" | "blue" | "amber";
  icon: IconName;
  href: string;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 980;
  const [cardWidth, setCardWidth] = useState(0);
  const money = formatMoney(value, code);
  const available = cardWidth - (compact ? 32 : 46);
  const fontSize = cardWidth
    ? Math.min(
        compact ? 26 : 32,
        (available + (money.length - 1) * 0.8) / (money.length * 0.62),
      )
    : compact
      ? 22
      : 32;
  return (
    <Pressable
      onLayout={(event) => setCardWidth(event.nativeEvent.layout.width)}
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${formatMoney(value, code)}. ${note}`}
      onPress={() => router.push(href as Href)}
      style={({ pressed }) => [
        {
          borderRadius: 15,
          backgroundColor: theme[`${tone}Bg`],
          padding: 23,
          minWidth: 0,
          gap: compact ? 10 : 16,
          opacity: pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      <View
        style={{
          flexDirection: "row",
          gap: 10,
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontFamily: "DM Sans",
            fontSize: 12,
            fontWeight: "600",
            color: theme[tone],
            flex: 1,
          }}
        >
          {title}
        </Text>
        <View
          style={{
            padding: compact ? 4 : 6,
            borderRadius: 8,
            backgroundColor: theme.isDark ? "#ffffff12" : "#ffffff66",
            borderWidth: 1,
            borderColor: theme.isDark ? "#ffffff18" : "#ffffffaa",
          }}
        >
          <Icon name={icon} color={theme[tone]} size={16} />
        </View>
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.55}
        style={{
          fontFamily: "Manrope",
          fontSize,
          lineHeight: compact ? 32 : 40,
          fontWeight: "800",
          letterSpacing: -0.8,
          color: theme.ink,
        }}
      >
        {money}
      </Text>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
        }}
      >
        <Txt muted style={{ fontSize: 11 }}>
          {note}
        </Txt>
        <Icon name="arrow" size={13} color={theme[tone]} />
      </View>
    </Pressable>
  );
}
export function Panel({
  title,
  count,
  link,
  href,
  children,
}: PropsWithChildren<{
  title: string;
  count?: number;
  link?: string;
  href?: string;
}>) {
  const theme = useTheme();
  return (
    <Card style={{ padding: 0, gap: 0, borderRadius: 14, overflow: "hidden" }}>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 22,
          paddingTop: 17,
          paddingBottom: 12,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
            flexShrink: 1,
          }}
        >
          <Txt
            style={{ fontSize: 14, fontWeight: "700", letterSpacing: -0.25 }}
          >
            {title}
          </Txt>
          {count !== undefined && (
            <View
              style={{
                backgroundColor: theme.surface2,
                paddingHorizontal: 6,
                borderRadius: 5,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Txt muted style={{ fontSize: 10 }}>
                {count}
              </Txt>
            </View>
          )}
        </View>
        {link && href && <TextLink title={link} href={href} />}
      </View>
      {children}
    </Card>
  );
}
export function QuietEmpty({
  title,
  description,
  icon = "check",
}: {
  title: string;
  description: string;
  icon?: IconName;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 22,
        paddingTop: 12,
        paddingBottom: 26,
        alignItems: "center",
        gap: 8,
      }}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 13,
          backgroundColor: theme.tint,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 3,
        }}
      >
        <Icon name={icon} size={20} color={theme.primary} />
      </View>
      <Txt style={{ fontSize: 15, fontWeight: "600", textAlign: "center" }}>
        {title}
      </Txt>
      <Txt muted style={{ fontSize: 12, textAlign: "center", maxWidth: 330 }}>
        {description}
      </Txt>
    </View>
  );
}
export function MonthFocus({
  totals,
  month,
}: {
  totals: Record<string, CurrencySummary>;
  month: string;
}) {
  const theme = useTheme();
  return (
    <Panel title={`${month}, in focus`}>
      {Object.entries(totals).map(([code, total]) => {
        const percent = total.dueMonth
          ? Math.round(
              Math.min(
                1,
                Math.max(
                  0,
                  (total.dueMonth - total.remainingMonth) / total.dueMonth,
                ),
              ) * 100,
            )
          : 0;
        return (
          <View
            key={code}
            style={{ paddingHorizontal: 22, paddingBottom: 21, gap: 13 }}
          >
            {Object.keys(totals).length > 1 && (
              <Txt muted style={{ fontSize: 11 }}>
                {code}
              </Txt>
            )}
            {[
              ["Scheduled this month", total.dueMonth],
              ["Paid this month", total.paidMonth],
              ["Still to take care of", total.remainingMonth],
            ].map(([name, value], index) => (
              <View
                key={name}
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 8,
                  justifyContent: "space-between",
                  alignItems: "center",
                  ...(index === 2
                    ? {
                        borderTopWidth: 1,
                        borderTopColor: theme.border,
                        paddingTop: 14,
                      }
                    : {}),
                }}
              >
                <Txt muted style={{ fontSize: 12 }}>
                  {name}
                </Txt>
                <Txt
                  style={{ fontSize: index === 2 ? 16 : 12, fontWeight: "700" }}
                >
                  {formatMoney(Number(value), code)}
                </Txt>
              </View>
            ))}
            <View style={{ gap: 7 }}>
              <View
                accessibilityRole="progressbar"
                accessibilityLabel={`${code} dues covered this month`}
                accessibilityValue={{ min: 0, max: 100, now: percent }}
                style={{
                  height: 6,
                  backgroundColor: theme.background,
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    width: `${percent}%`,
                    height: 6,
                    backgroundColor: theme.primary,
                    borderRadius: 4,
                  }}
                />
              </View>
              <Txt muted style={{ fontSize: 10 }}>
                {percent}% of this month’s dues covered
              </Txt>
            </View>
            <Txt muted style={{ fontSize: 11 }}>
              Remaining is based on payments applied to this month’s dues.
              Payments made this month can cover other periods.
            </Txt>
          </View>
        );
      })}
    </Panel>
  );
}
