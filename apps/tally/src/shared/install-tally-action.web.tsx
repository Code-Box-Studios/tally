import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { getInstallInstructions } from "./browser-install";
import { useBrowserInstall } from "./use-browser-install";
import { useTheme } from "./theme";
import { Button, Txt } from "./ui";
import { Icon } from "./icons";

export function InstallTallyAction() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const browser = useBrowserInstall();
  const [open, setOpen] = useState(false);
  const [device, setDevice] = useState<"apple" | "android" | "computer">(
    "apple",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!browser || browser.installed) return null;

  const instructions = getInstallInstructions(
    device === "computer"
      ? "other"
      : device === "android"
        ? "android"
        : browser.platform === "ipad"
          ? "ipad"
          : "iphone",
  );
  function showInstructions() {
    setDevice(
      browser?.platform === "other"
        ? "computer"
        : browser?.platform === "android"
          ? "android"
          : "apple",
    );
    setMessage("");
    setOpen(true);
  }
  async function install() {
    if (!browser || busy) return;
    setBusy(true);
    const outcome = await browser.prompt();
    setBusy(false);
    if (outcome === "accepted") setOpen(false);
    else setMessage("You can still add Tally from your browser’s menu.");
  }

  return (
    <>
      <View
        style={{
          alignItems: "center",
          paddingHorizontal: 20,
          paddingVertical: 9,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Install Tally now"
          accessibilityState={{ expanded: open }}
          aria-expanded={open}
          onPress={showInstructions}
          style={({ pressed }) => ({
            minHeight: 44,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingHorizontal: 16,
            paddingVertical: 6,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.tint,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <Icon name="arrowDown" size={16} color={theme.primary} />
          <Txt
            style={{ color: theme.primary, fontSize: 12, fontWeight: "600" }}
          >
            Install Tally now
          </Txt>
        </Pressable>
      </View>
      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={() => setOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#00000066",
            alignItems: "center",
            justifyContent: width < 600 ? "flex-end" : "center",
            padding: width < 600 ? 12 : 24,
          }}
        >
          <Pressable
            accessible={false}
            aria-hidden
            tabIndex={-1}
            onPress={() => setOpen(false)}
            style={{ position: "absolute", inset: 0 }}
          />
          <View
            accessibilityViewIsModal
            accessibilityLabel="Install Tally"
            style={{
              width: "100%",
              maxWidth: 480,
              maxHeight: "90%",
              backgroundColor: theme.surface,
              borderColor: theme.border,
              borderWidth: 1,
              borderRadius: 24,
              padding: 24,
              gap: 18,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Txt big style={{ fontSize: 23 }}>
                Install Tally
              </Txt>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={() => setOpen(false)}
                style={{
                  width: 36,
                  height: 36,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 18,
                  backgroundColor: theme.tint,
                }}
              >
                <Icon name="close" color={theme.ink} size={18} />
              </Pressable>
            </View>
            <Txt muted>Keep Tally on your device for quick access.</Txt>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Your device"
              style={{ flexDirection: "row", gap: 8 }}
            >
              {(
                [
                  ["apple", "iPhone / iPad"],
                  ["android", "Android"],
                  ["computer", "Computer"],
                ] as const
              ).map(([value, label]) => (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityLabel={label}
                  accessibilityState={{ checked: device === value }}
                  aria-checked={device === value}
                  onPress={() => setDevice(value)}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    justifyContent: "center",
                    alignItems: "center",
                    padding: 8,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor:
                      device === value ? theme.primary : theme.border,
                    backgroundColor:
                      device === value ? theme.tint : theme.surface,
                  }}
                >
                  <Txt
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: device === value ? theme.primary : theme.muted,
                    }}
                  >
                    {label}
                  </Txt>
                </Pressable>
              ))}
            </View>
            <ScrollView
              style={{ flexShrink: 1 }}
              contentContainerStyle={{ gap: 14 }}
            >
              <Txt style={{ fontWeight: "600" }}>{instructions.title}</Txt>
              {instructions.steps.map((step, index) => (
                <View
                  key={step}
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 25,
                      height: 25,
                      borderRadius: 13,
                      backgroundColor: theme.tint,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Txt
                      style={{
                        fontSize: 12,
                        color: theme.primary,
                        fontWeight: "600",
                      }}
                    >
                      {index + 1}
                    </Txt>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt>{step}</Txt>
                  </View>
                </View>
              ))}
              <Txt muted style={{ fontSize: 12, lineHeight: 19 }}>
                {instructions.note}
              </Txt>
              {message ? <Txt muted>{message}</Txt> : null}
              {browser.canPrompt && (
                <Button
                  title="Install on this device"
                  disabled={busy}
                  onPress={() => {
                    void install();
                  }}
                />
              )}
            </ScrollView>
            <Button title="Done" secondary onPress={() => setOpen(false)} />
          </View>
        </View>
      </Modal>
    </>
  );
}
