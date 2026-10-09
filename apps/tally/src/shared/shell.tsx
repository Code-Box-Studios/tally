import React, { type PropsWithChildren } from "react";
import { View, Pressable, useWindowDimensions, Text } from "react-native";
import { router, usePathname, type Href } from "expo-router";
import { useTheme } from "./theme";
import { Txt, Button } from "./ui";
import { useSession } from "../features/auth/session-provider";
const destinations = [
  ["/", "Home", "⌂"],
  ["/obligations", "Obligations", "≡"],
  ["/people", "People", "♧"],
  ["/calendar", "Calendar", "▦"],
  ["/activity", "Activity", "↗"],
  ["/settings", "Settings", "⚙"],
] as const;
export function Shell({ children }: PropsWithChildren) {
  const { width } = useWindowDimensions(),
    wide = width >= 800,
    t = useTheme(),
    path = usePathname(),
    { profile, cached, pending } = useSession();
  const navigation = (
    <>
      {destinations.map(([url, title, icon]) => {
        const selected = url === "/" ? path === "/" : path.startsWith(url);
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={title}
            accessibilityState={{ selected }}
            key={url}
            onPress={() => router.push(url as Href)}
            style={{
              backgroundColor: selected ? t.tint : "transparent",
              paddingVertical: wide ? 14 : 8,
              paddingHorizontal: wide ? 16 : 2,
              borderRadius: 10,
              flexDirection: wide ? "row" : "column",
              gap: wide ? 12 : 2,
              alignItems: "center",
              flex: wide ? undefined : 1,
            }}
          >
            <Text
              style={{ fontSize: 20, color: selected ? t.primary : t.muted }}
            >
              {icon}
            </Text>
            <Txt
              style={{
                fontSize: wide ? 14 : 10,
                color: selected ? t.primary : t.muted,
              }}
            >
              {title}
            </Txt>
          </Pressable>
        );
      })}
    </>
  );
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.background,
        flexDirection: wide ? "row" : "column",
      }}
    >
      {wide && (
        <View
          style={{
            width: width >= 1100 ? 230 : 190,
            padding: 22,
            gap: 25,
            backgroundColor: t.surface,
            borderRightWidth: 1,
            borderRightColor: t.border,
          }}
        >
          <Txt big style={{ fontSize: 32, fontWeight: "700" }}>
            tally.
          </Txt>
          <Button title="+ Add" onPress={() => router.push("/add" as Href)} />
          <View style={{ gap: 6 }}>{navigation}</View>
          <View style={{ flex: 1 }} />
          <Txt muted>Know what’s due.</Txt>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View
          style={{
            paddingHorizontal: 24,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: t.border,
            backgroundColor: t.surface,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Txt muted>{wide ? "Your workspace" : "tally."}</Txt>
          <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reminders"
              onPress={() => router.push("/reminders" as Href)}
            >
              <Txt>Reminders</Txt>
            </Pressable>
            <Txt>{profile?.defaultCurrency}</Txt>
            {!wide && (
              <Button
                title="+ Add"
                onPress={() => router.push("/add" as Href)}
              />
            )}
          </View>
        </View>
        {(cached ||
          pending.some((p) => !["synced", "discarded"].includes(p.status))) && (
          <View
            style={{
              paddingVertical: 8,
              paddingHorizontal: 24,
              backgroundColor: t.tint,
            }}
          >
            <Txt style={{ fontSize: 12 }}>
              {cached
                ? "Cached view · reconnect to confirm current records. "
                : ""}
              {pending.filter(
                (p) => !["synced", "discarded"].includes(p.status),
              ).length || ""}
              {pending.some((p) => !["synced", "discarded"].includes(p.status))
                ? " saved actions waiting or needing review."
                : ""}
            </Txt>
          </View>
        )}
        {children}
      </View>
      {!wide && (
        <View
          style={{
            flexDirection: "row",
            backgroundColor: t.surface,
            borderTopWidth: 1,
            borderTopColor: t.border,
            paddingBottom: 10,
            paddingTop: 6,
          }}
        >
          {navigation}
        </View>
      )}
    </View>
  );
}
