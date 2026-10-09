import React, { useState } from "react";
import { View, Platform } from "react-native";
import * as Linking from "expo-linking";
import { backend } from "../../core/backend/client";
import { useSession } from "./session-provider";
import { Button, Card, Choices, Field, Form, Page, Txt } from "../../shared/ui";
export function AuthScreen() {
  const [mode, setMode] = useState("Sign in"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [message, setMessage] = useState("");
  const { google } = useSession();
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
    <Page>
      <View
        style={{
          maxWidth: 450,
          width: "100%",
          alignSelf: "center",
          paddingTop: 50,
          gap: 24,
        }}
      >
        <View>
          <Txt big style={{ fontSize: 44, fontWeight: "700" }}>
            tally.
          </Txt>
          <Txt muted>Know what’s due.</Txt>
        </View>
        <Card>
          <Txt big style={{ fontSize: 23 }}>
            Your money, your space.
          </Txt>
          <Txt muted>
            Keep track of what you owe, what’s owed to you, and what comes next.
          </Txt>
          <Choices
            label="Get started"
            value={mode}
            options={["Sign in", "Create account", "Reset password"]}
            onChange={(v) => {
              setMode(v);
              setMessage("");
            }}
          />
          <Form saveLabel={mode} onSave={save}>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            {mode !== "Reset password" && (
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete={
                  mode === "Sign in" ? "current-password" : "new-password"
                }
              />
            )}
          </Form>
          {!!message && <Txt>{message}</Txt>}
          <Button
            secondary
            title="Continue with Google"
            onPress={() =>
              void google().catch((e) => setMessage((e as Error).message))
            }
          />
        </Card>
        <Txt muted>Private by default. No bank credentials needed.</Txt>
      </View>
    </Page>
  );
}
