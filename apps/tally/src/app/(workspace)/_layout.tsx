import React from "react";
import { Slot, Redirect } from "expo-router";
import { useSession } from "../../features/auth/session-provider";
import { AuthScreen } from "../../features/auth/auth-screen";
import { OnboardingScreen } from "../../features/auth/onboarding-screen";
import { NotificationSession } from "../../features/reminders/notification-session";
import { Shell } from "../../shared/shell";
import { Page, Loading, Failure, Button } from "../../shared/ui";
export default function Workspace() {
  const { session, profile, ready, error, recovery, refresh, signOut } =
    useSession();
  if (recovery) return <Redirect href="/reset-password" />;
  if (!ready)
    return (
      <Page centered>
        <Loading fullScreen />
      </Page>
    );
  if (!session) return <AuthScreen />;
  if (!profile)
    return (
      <Page>
        <Failure
          error={new Error(error ?? "Your account is loading.")}
          retry={() => void refresh()}
        />
        <Button
          secondary
          title="Sign out"
          onPress={() => void signOut().catch(() => {})}
        />
      </Page>
    );
  if (!profile.onboardingComplete) return <OnboardingScreen />;
  return (
    <Shell>
      <NotificationSession />
      <Slot />
    </Shell>
  );
}
