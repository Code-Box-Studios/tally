import React from "react";
import { Redirect } from "expo-router";
import { useSession } from "./session-provider";
import { AuthScreen } from "./auth-screen";
import { Loading, Page } from "../../shared/ui";

export function AuthRoute({
  mode = "Sign in",
}: {
  mode?: "Sign in" | "Create account" | "Reset password";
}) {
  const { ready, session, recovery } = useSession();
  if (recovery) return <Redirect href="/reset-password" />;
  if (!ready)
    return (
      <Page centered>
        <Loading fullScreen />
      </Page>
    );
  if (session) return <Redirect href="/home" />;
  return <AuthScreen initialMode={mode} />;
}
