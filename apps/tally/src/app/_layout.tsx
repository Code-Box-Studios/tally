import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { View, Text } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { runtimeConfig } from "../core/config";
import { SessionProvider } from "../features/auth/session-provider";
import { ThemeProvider } from "../shared/theme";
export default function RootLayout() {
  useEffect(() => {
    if (
      !__DEV__ &&
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator
    )
      void navigator.serviceWorker
        .register("/service-worker.js")
        .catch(() => {});
  }, []);
  const [loaded, fontError] = useFonts({
    "DM Sans": require("../../assets/fonts/DMSans.ttf"),
    Manrope: require("../../assets/fonts/Manrope.ttf"),
  });
  let error: string | null = null;
  try {
    runtimeConfig();
  } catch (e) {
    error = (e as Error).message;
  }
  if (error)
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          padding: 32,
          backgroundColor: "#f6f7f4",
        }}
      >
        <Text style={{ fontSize: 32, color: "#26332d" }}>Tally</Text>
        <Text style={{ marginTop: 16 }}>{error}</Text>
      </View>
    );
  if (!loaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <ThemeProvider>
          <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false }} />
          </SafeAreaView>
        </ThemeProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
