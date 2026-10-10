import React, { useState, type PropsWithChildren } from "react";
import {
  View,
  Pressable,
  useWindowDimensions,
  Text,
  Modal,
} from "react-native";
import { router, usePathname, type Href } from "expo-router";
import { useTheme } from "./theme";
import { Txt, Button } from "./ui";
import { Brand } from "./brand";
import { Icon, type IconName } from "./icons";
import { AppearanceControl } from "./appearance-control";
import { useSession } from "../features/auth/session-provider";
const destinations = [
  ["/home", "Home", "home"],
  ["/obligations", "Obligations", "obligations"],
  ["/people", "People", "people"],
  ["/calendar", "Calendar", "calendar"],
  ["/activity", "Activity", "activity"],
  ["/settings", "Settings", "settings"],
] as const;
export function Shell({ children }: PropsWithChildren) {
  const { width } = useWindowDimensions(),
    wide = width >= 800,
    theme = useTheme(),
    path = usePathname();
  const { profile, session, cached, pending } = useSession();
  const [more, setMore] = useState(false);
  const name = String(
    session?.user.user_metadata?.full_name ||
      session?.user.user_metadata?.name ||
      "Your workspace",
  );
  const initials =
    name === "Your workspace"
      ? "T"
      : name
          .split(/\s+/)
          .slice(0, 2)
          .map((word) => word[0])
          .join("")
          .toUpperCase();
  const selectedTitle =
    destinations.find(([url]) =>
      url === "/home" ? path === "/home" : path.startsWith(url),
    )?.[1] ?? (path === "/add" ? "Add obligation" : "Your workspace");
  const waiting = pending.filter(
    (item) => !["synced", "discarded"].includes(item.status),
  ).length;
  function navigate(url: string) {
    setMore(false);
    router.push(url as Href);
  }
  function navItem(url: string, title: string, icon: IconName, mobile = false) {
    const selected = url === "/home" ? path === "/home" : path.startsWith(url);
    return (
      <Pressable
        key={url}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ selected }}
        onPress={() => navigate(url)}
        style={({ pressed }) => ({
          flex: mobile ? 1 : undefined,
          flexDirection: mobile ? "column" : "row",
          alignItems: "center",
          gap: mobile ? 3 : 13,
          minHeight: 46,
          paddingHorizontal: mobile ? 2 : 13,
          paddingVertical: mobile ? 6 : 11,
          borderRadius: 9,
          backgroundColor: !mobile && selected ? theme.tint : "transparent",
          opacity: pressed ? 0.7 : 1,
        })}
      >
        {!mobile && selected && (
          <View
            style={{
              position: "absolute",
              left: 0,
              height: 18,
              width: 3,
              borderRadius: 3,
              backgroundColor: theme.primary,
            }}
          />
        )}
        <View
          style={
            mobile
              ? {
                  paddingHorizontal: 14,
                  paddingVertical: 3,
                  borderRadius: 20,
                  backgroundColor: selected ? theme.tint : "transparent",
                }
              : undefined
          }
        >
          <Icon
            name={icon}
            size={mobile ? 19 : 20}
            color={selected ? theme.primary : theme.muted}
          />
        </View>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: "DM Sans",
            fontSize: mobile ? 10 : 13,
            fontWeight: selected ? "600" : "400",
            color: selected ? theme.primary : theme.muted,
          }}
        >
          {title}
        </Text>
      </Pressable>
    );
  }
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.background,
        flexDirection: wide ? "row" : "column",
      }}
    >
      {wide && (
        <View
          style={{
            width: width >= 1100 ? 230 : 190,
            paddingHorizontal: 22,
            paddingTop: 36,
            paddingBottom: 20,
            backgroundColor: theme.surface,
            borderRightWidth: 1,
            borderRightColor: theme.border,
          }}
        >
          <View style={{ paddingLeft: 8 }}>
            <Brand size={34} />
            <Txt
              muted
              style={{ fontSize: 11, marginTop: 10, marginBottom: 30 }}
            >
              Know what’s due.
            </Txt>
          </View>
          <Txt
            muted
            style={{
              fontSize: 9,
              letterSpacing: 1.5,
              fontWeight: "600",
              marginTop: 10,
              marginLeft: 12,
              marginBottom: 12,
            }}
          >
            YOUR SPACE
          </Txt>
          <View style={{ gap: 6 }}>
            {destinations.map(([url, title, icon]) =>
              navItem(url, title, icon),
            )}
          </View>
          <View style={{ flex: 1, minHeight: 24 }} />
          <View
            style={{
              flexDirection: "row",
              gap: 10,
              padding: 8,
              marginBottom: 26,
            }}
          >
            <Icon name="shield" color={theme.primary} size={18} />
            <View style={{ flex: 1 }}>
              <Txt muted style={{ fontSize: 11 }}>
                Your money, your space.
              </Txt>
              <Txt muted style={{ fontSize: 10 }}>
                Private by default.
              </Txt>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Workspace settings"
            onPress={() => navigate("/settings")}
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.border,
              paddingTop: 18,
              flexDirection: "row",
              gap: 11,
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 35,
                height: 35,
                borderRadius: 20,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.tint,
              }}
            >
              <Txt
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: theme.primary,
                }}
              >
                {initials}
              </Txt>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{
                  color: theme.ink,
                  fontFamily: "DM Sans",
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {name}
              </Text>
              <Txt muted style={{ fontSize: 10 }}>
                Personal workspace
              </Txt>
            </View>
            <Icon name="chevron" color={theme.muted} size={14} />
          </Pressable>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View
          style={{
            height: wide ? 82 : 68,
            paddingHorizontal: wide ? 40 : 20,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          {wide ? (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 14 }}
            >
              <Txt muted style={{ fontSize: 11 }}>
                Your space
              </Txt>
              <Txt muted style={{ fontSize: 11 }}>
                /
              </Txt>
              <Txt muted style={{ fontSize: 11 }}>
                {selectedTitle}
              </Txt>
            </View>
          ) : (
            <Brand size={28} mark={false} />
          )}
          <View
            style={{
              flexDirection: "row",
              gap: wide ? 19 : 12,
              alignItems: "center",
            }}
          >
            {width >= 1100 && (
              <Txt muted style={{ fontSize: 11 }}>
                {new Intl.DateTimeFormat("en", {
                  dateStyle: "full",
                  timeZone: profile?.timezone,
                }).format(new Date())}
              </Txt>
            )}
            <View
              style={{
                flexDirection: "row",
                gap: 7,
                alignItems: "center",
                paddingVertical: 7,
                paddingHorizontal: 10,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 8,
                backgroundColor: theme.surface,
              }}
            >
              <Txt
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: theme.primary,
                }}
              >
                {
                  new Intl.NumberFormat("en-PH", {
                    style: "currency",
                    currency: profile?.defaultCurrency ?? "PHP",
                    currencyDisplay: "narrowSymbol",
                  })
                    .formatToParts(0)
                    .find((part) => part.type === "currency")?.value
                }
              </Txt>
              <Txt style={{ fontSize: 11, fontWeight: "600" }}>
                {profile?.defaultCurrency}
              </Txt>
            </View>
            <AppearanceControl />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reminders"
              onPress={() => navigate("/reminders")}
              style={{
                width: 38,
                height: 38,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 20,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.surface,
              }}
            >
              <Icon name="bell" color={theme.ink} size={18} />
            </Pressable>
          </View>
        </View>
        {(cached || waiting > 0) && (
          <View
            style={{
              paddingVertical: 8,
              paddingHorizontal: 24,
              backgroundColor: theme.tint,
            }}
          >
            <Txt style={{ fontSize: 12 }}>
              {cached
                ? "Cached view · reconnect to confirm current records. "
                : ""}
              {waiting > 0
                ? `${waiting} saved actions waiting or needing review.`
                : ""}
            </Txt>
          </View>
        )}
        {children}
      </View>
      {path !== "/add" && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add obligation"
          onPress={() => navigate("/add")}
          style={{
            position: "absolute",
            right: wide ? 32 : 20,
            bottom: wide ? 28 : 86,
            minWidth: wide ? 176 : 50,
            height: wide ? 54 : 50,
            paddingHorizontal: wide ? 20 : 0,
            borderRadius: wide ? 28 : 17,
            flexDirection: "row",
            gap: 9,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.primary,
            borderWidth: 1,
            borderColor: theme.border,
            boxShadow: "0 6px 20px #00000024",
          }}
        >
          <Icon name="plus" color={theme.background} size={25} />
          {wide && (
            <Text
              style={{
                fontFamily: "DM Sans",
                fontWeight: "600",
                color: theme.background,
              }}
            >
              Add obligation
            </Text>
          )}
        </Pressable>
      )}
      {!wide && (
        <>
          <View
            style={{
              flexDirection: "row",
              backgroundColor: theme.surface,
              borderTopWidth: 1,
              borderTopColor: theme.border,
              paddingBottom: 10,
              paddingTop: 6,
            }}
          >
            {destinations
              .slice(0, 4)
              .map(([url, title, icon]) => navItem(url, title, icon, true))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="More"
              accessibilityState={{
                selected:
                  path.startsWith("/activity") || path.startsWith("/settings"),
                expanded: more,
              }}
              onPress={() => setMore(true)}
              style={{
                flex: 1,
                alignItems: "center",
                gap: 3,
                paddingVertical: 9,
              }}
            >
              <Icon
                name="more"
                color={
                  path.startsWith("/activity") || path.startsWith("/settings")
                    ? theme.primary
                    : theme.muted
                }
                size={20}
              />
              <Txt muted style={{ fontSize: 10 }}>
                More
              </Txt>
            </Pressable>
          </View>
          <Modal
            visible={more}
            transparent
            animationType="none"
            onRequestClose={() => setMore(false)}
          >
            <View
              style={{
                flex: 1,
                justifyContent: "flex-end",
                backgroundColor: "#00000066",
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close navigation"
                onPress={() => setMore(false)}
                style={{ flex: 1 }}
              />
              <View
                accessibilityViewIsModal
                style={{
                  backgroundColor: theme.surface,
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  padding: 24,
                  gap: 10,
                }}
              >
                <Txt big style={{ fontSize: 22 }}>
                  Your space
                </Txt>
                {destinations
                  .slice(4)
                  .map(([url, title, icon]) => navItem(url, title, icon))}
                <Button
                  title="Close"
                  secondary
                  onPress={() => setMore(false)}
                />
              </View>
            </View>
          </Modal>
        </>
      )}
    </View>
  );
}
