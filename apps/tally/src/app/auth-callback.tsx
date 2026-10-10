import React, { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { Platform, View } from "react-native";
import { completeAuthLink } from "../features/auth/deep-link";
import { useSession } from "../features/auth/session-provider";
import { Page, Loading, Card, Button, Txt } from "../shared/ui";
import { Brand } from "../shared/brand";
import { Icon } from "../shared/icons";
import { useTheme } from "../shared/theme";
export default function Callback() {
  const { session, error: sessionError } = useSession(),
    [error, setError] = useState<Error | null>(null);
  const params = useLocalSearchParams<{
    error?: string;
    error_code?: string;
    failed?: string;
  }>();
  const theme = useTheme();
  // Never render the provider's description: it can contain an OAuth code.
  const [providerFailure] = useState(() =>
    Boolean(
      params.error ||
      params.error_code ||
      params.failed === "1" ||
      (Platform.OS === "web" &&
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.hash.slice(1)).has("error")),
    ),
  );
  const failed = providerFailure || error || sessionError;
  useEffect(() => {
    if (providerFailure) {
      // Use the router so its navigation state cannot restore sensitive params.
      if (params.failed !== "1" || params.error || params.error_code)
        router.replace("/auth-callback?failed=1");
      return;
    }
    if (session) {
      router.replace("/");
      return;
    }
    let live = true;
    const timeout = setTimeout(() => {
      if (live) setError(new Error("Sign-in took longer than expected."));
    }, 15000);
    if (Platform.OS !== "web")
      void Linking.getInitialURL()
        .then(async (value) => {
          if (!value) return;
          await completeAuthLink(value);
        })
        .catch(() => {
          if (live)
            setError(new Error("The sign-in link could not be completed."));
        });
    return () => {
      live = false;
      clearTimeout(timeout);
    };
  }, [
    session,
    providerFailure,
    params.failed,
    params.error,
    params.error_code,
  ]);
  return (
    <Page centered>
      {failed ? (
        <View
          style={{ width: "100%", maxWidth: 460, alignSelf: "center", gap: 24 }}
        >
          <View style={{ alignItems: "center" }}>
            <Brand />
          </View>
          <Card style={{ padding: 28, borderRadius: 24, gap: 20 }}>
            <View
              accessible
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              style={{ gap: 12 }}
            >
              <Icon name="warning" color={theme.danger} size={28} />
              <Txt big style={{ fontSize: 24, fontWeight: "700" }}>
                We couldn’t finish signing you in.
              </Txt>
              <Txt muted>
                {providerFailure
                  ? "Google sign-in couldn’t be completed. Return to sign in and try again, or use your email and password."
                  : "Your sign-in link could not be completed. Return to sign in and start again."}
              </Txt>
            </View>
            <Button
              title="Back to sign in"
              onPress={() => router.replace("/")}
            />
          </Card>
        </View>
      ) : (
        <Loading fullScreen label="Opening your workspace" />
      )}
    </Page>
  );
}
