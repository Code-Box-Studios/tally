import React, { useRef, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import * as Crypto from "expo-crypto";
import { useSession } from "../features/auth/session-provider";
import { useAppearance, useTheme, type AppearanceMode } from "./theme";
import { Icon, type IconName } from "./icons";
import { Txt, Failure, Button } from "./ui";

const modes: { value: AppearanceMode; title: string; icon: IconName }[] = [
  { value: "light", title: "Light", icon: "sun" },
  { value: "dark", title: "Dark", icon: "moon" },
  { value: "system", title: "System", icon: "monitor" },
];
export function AppearanceControl({ inline = false }: { inline?: boolean }) {
  const theme = useTheme(),
    { mode, setMode, saveBusy, beginSave, finishSave } = useAppearance(),
    { profile, repo, setProfile } = useSession();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  const saving = useRef(false);
  async function choose(next: AppearanceMode) {
    if (saving.current || next === mode) return;
    setError(null);
    if (!profile) {
      setMode(next);
      return;
    }
    if (!repo) {
      setError(new Error("Reconnect to save your appearance preference."));
      return;
    }
    if (!beginSave()) return;
    saving.current = true;
    setBusy(true);
    try {
      setProfile(
        await repo.updateProfile(
          profile,
          {
            defaultCurrency: profile.defaultCurrency,
            timezone: profile.timezone,
            onboardingComplete: profile.onboardingComplete,
            themeMode: next,
          },
          Crypto.randomUUID(),
        ),
      );
    } catch (e) {
      setError(e);
    } finally {
      saving.current = false;
      setBusy(false);
      finishSave();
    }
  }
  const options = (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {modes.map((item) => (
          <Pressable
            key={item.value}
            disabled={busy || saveBusy}
            accessibilityRole="radio"
            accessibilityLabel={item.title}
            accessibilityState={{
              checked: mode === item.value,
              disabled: busy || saveBusy,
            }}
            aria-checked={mode === item.value}
            onPress={() => void choose(item.value)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 82,
              borderWidth: 1,
              borderColor: mode === item.value ? theme.primary : theme.border,
              backgroundColor: mode === item.value ? theme.tint : theme.surface,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              opacity: busy ? 0.6 : pressed ? 0.75 : 1,
            })}
          >
            <Icon
              name={item.icon}
              color={mode === item.value ? theme.primary : theme.muted}
            />
            <Txt style={{ fontSize: 13, fontWeight: "600" }}>{item.title}</Txt>
          </Pressable>
        ))}
      </View>
      <Txt muted style={{ fontSize: 12 }}>
        {busy
          ? "Saving appearance…"
          : mode === "system"
            ? "Matches your device’s appearance."
            : `Tally uses ${mode} mode.`}
      </Txt>
      {!!error && <Failure error={error} />}
    </View>
  );
  if (inline)
    return (
      <View style={{ gap: 12 }}>
        <Txt style={{ fontWeight: "600" }}>Appearance</Txt>
        {options}
      </View>
    );
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Change appearance"
        onPress={() => {
          setError(null);
          setOpen(true);
        }}
        style={({ pressed }) => ({
          width: 38,
          height: 38,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.surface,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <Icon
          name={theme.isDark ? "moon" : "sun"}
          color={theme.ink}
          size={18}
        />
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={() => setOpen(false)}
      >
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            backgroundColor: "#00000066",
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close appearance"
            onPress={() => setOpen(false)}
            style={{ position: "absolute", inset: 0 }}
          />
          <View
            accessibilityViewIsModal
            style={{
              width: "100%",
              maxWidth: 380,
              padding: 24,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.surface,
              gap: 20,
            }}
          >
            <Txt big style={{ fontSize: 23, fontWeight: "700" }}>
              Make it your space.
            </Txt>
            {options}
            <Button secondary title="Done" onPress={() => setOpen(false)} />
          </View>
        </View>
      </Modal>
    </>
  );
}
