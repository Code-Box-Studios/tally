import React, { useEffect, useState } from "react";
import {
  Animated,
  Easing,
  View,
  Platform,
  Pressable,
  useWindowDimensions,
} from "react-native";
import * as Linking from "expo-linking";
import { backend } from "../../core/backend/client";
import { useSession } from "./session-provider";
import { Button, Card, Field, Form, Page, Txt } from "../../shared/ui";
import { useTheme } from "../../shared/theme";
import { Brand } from "../../shared/brand";
import { AppearanceControl } from "../../shared/appearance-control";
import { useReducedMotion } from "../../shared/motion";
import { AuthShowcase } from "./auth-showcase";
export function AuthScreen({
  initialMode = "Sign in",
}: {
  initialMode?: "Sign in" | "Create account" | "Reset password";
}) {
  const [mode, setMode] = useState(initialMode),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [message, setMessage] = useState("");
  const { google } = useSession();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const reduced = useReducedMotion();
  const [entrance] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduced) {
      entrance.setValue(1);
      return;
    }
    entrance.setValue(0);
    const animation = Animated.timing(entrance, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [entrance, reduced]);
  const resetting = mode === "Reset password";
  function changeMode(next: "Sign in" | "Create account" | "Reset password") {
    setMode(next);
    setMessage("");
    setPassword("");
  }
  async function save() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      throw new Error("Enter a valid email.");
    const client = backend();
    if (mode === "Reset password") {
      const redirect =
        Platform.OS === "web"
          ? window.location.origin + "/reset-password"
          : Linking.createURL("reset-password");
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirect,
      });
      if (error) throw error;
      setMessage("Check your email for a password reset link.");
      return;
    }
    if (password.length < 8) throw new Error("Use at least eight characters.");
    const response =
      mode === "Create account"
        ? await client.auth.signUp({
            email: email.trim(),
            password,
            options: {
              emailRedirectTo:
                Platform.OS === "web"
                  ? window.location.origin + "/auth-callback"
                  : Linking.createURL("auth-callback"),
            },
          })
        : await client.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
    if (response.error) throw response.error;
    if (!response.data.session)
      setMessage("Check your email to confirm your account, then sign in.");
    setPassword("");
  }
  return (
    <Page centered>
      <View
        style={{
          maxWidth: 1120,
          width: "100%",
          alignSelf: "center",
          gap: wide ? 44 : 26,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
          }}
        >
          <View style={{ gap: 6 }}>
            <Brand size={wide ? 34 : 29} />
            <Txt muted style={{ fontSize: 12 }}>
              Know what’s due.
            </Txt>
          </View>
          <AppearanceControl />
        </View>
        <View
          style={{
            flexDirection: wide ? "row" : "column",
            gap: wide ? 64 : 20,
            alignItems: wide ? "center" : "stretch",
          }}
        >
          {wide && <AuthShowcase />}
          <Animated.View
            style={{
              width: wide ? 440 : "100%",
              maxWidth: 460,
              alignSelf: "center",
              opacity: entrance,
              transform: [
                {
                  translateY: entrance.interpolate({
                    inputRange: [0, 1],
                    outputRange: [18, 0],
                  }),
                },
              ],
            }}
          >
            <Card
              style={{
                padding: width < 480 ? 22 : 32,
                borderRadius: 24,
                gap: 22,
                boxShadow: "0 16px 50px #00000008",
              }}
            >
              <View style={{ gap: 8 }}>
                <Txt
                  big
                  style={{
                    fontSize: 24,
                    lineHeight: 32,
                    fontWeight: "700",
                    letterSpacing: -0.6,
                  }}
                >
                  {resetting
                    ? "Let’s get you back in."
                    : mode === "Create account"
                      ? "Your fresh start."
                      : "Welcome to your space."}
                </Txt>
                <Txt muted>
                  {resetting
                    ? "We’ll email you a link to get back into your account."
                    : mode === "Create account"
                      ? "A little clarity starts with an account."
                      : "Sign in for a clearer view of what’s due."}
                </Txt>
              </View>
              {!resetting && (
                <View
                  accessibilityLabel="Account access"
                  style={{
                    flexDirection: "row",
                    padding: 4,
                    borderRadius: 12,
                    backgroundColor: theme.background,
                  }}
                >
                  {(["Sign in", "Create account"] as const).map((option) => (
                    <Pressable
                      key={option}
                      accessibilityRole="radio"
                      accessibilityLabel={option}
                      accessibilityState={{ checked: mode === option }}
                      aria-checked={mode === option}
                      onPress={() => changeMode(option)}
                      style={({ pressed }) => ({
                        flex: 1,
                        minHeight: 44,
                        justifyContent: "center",
                        alignItems: "center",
                        borderRadius: 9,
                        borderWidth: 1,
                        borderColor:
                          mode === option ? theme.border : "transparent",
                        backgroundColor:
                          mode === option ? theme.surface : "transparent",
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Txt
                        style={{
                          fontWeight: "600",
                          color: mode === option ? theme.primary : theme.muted,
                        }}
                      >
                        {option}
                      </Txt>
                    </Pressable>
                  ))}
                </View>
              )}
              <Form
                key={mode}
                fullWidth
                saveLabel={resetting ? "Send reset link" : mode}
                onSave={save}
              >
                <Field
                  label="Email"
                  nativeID="tally-auth-email"
                  placeholder="you@example.com"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  style={{
                    minHeight: 52,
                    fontSize: 16,
                    paddingHorizontal: 14,
                    backgroundColor: theme.background,
                  }}
                />
                {!resetting && (
                  <Field
                    label="Password"
                    nativeID="tally-auth-password"
                    placeholder={
                      mode === "Create account"
                        ? "At least 8 characters"
                        : "Enter your password"
                    }
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoComplete={
                      mode === "Sign in" ? "current-password" : "new-password"
                    }
                    style={{
                      minHeight: 52,
                      fontSize: 16,
                      paddingHorizontal: 14,
                      backgroundColor: theme.background,
                    }}
                  />
                )}
                {mode === "Sign in" && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Reset password"
                    onPress={() => changeMode("Reset password")}
                    style={{
                      alignSelf: "flex-end",
                      minHeight: 44,
                      justifyContent: "center",
                    }}
                  >
                    <Txt style={{ color: theme.primary, fontWeight: "600" }}>
                      Forgot password?
                    </Txt>
                  </Pressable>
                )}
              </Form>
              {!!message && <Txt>{message}</Txt>}
              {resetting ? (
                <Button
                  secondary
                  title="Back to sign in"
                  onPress={() => changeMode("Sign in")}
                />
              ) : (
                <View style={{ gap: 16 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        height: 1,
                        backgroundColor: theme.border,
                      }}
                    />
                    <Txt muted>or</Txt>
                    <View
                      style={{
                        flex: 1,
                        height: 1,
                        backgroundColor: theme.border,
                      }}
                    />
                  </View>
                  <Button
                    secondary
                    title="Continue with Google"
                    onPress={() =>
                      void google().catch((e) =>
                        setMessage((e as Error).message),
                      )
                    }
                  />
                </View>
              )}
            </Card>
          </Animated.View>
        </View>
        {!wide && (
          <Txt muted style={{ textAlign: "center", fontSize: 11 }}>
            Private by default. No bank credentials needed.
          </Txt>
        )}
      </View>
    </Page>
  );
}
