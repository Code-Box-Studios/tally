import React from "react";
import { Redirect, type Href } from "expo-router";
import { useSession } from "../features/auth/session-provider";
import { AuthScreen } from "../features/auth/auth-screen";
import { Page, Loading, Txt } from "../shared/ui";

export default function BorrowerInvitation() {
  const { ready, session, recovery } = useSession();
  if (!ready)
    return (
      <Page>
        <Loading />
      </Page>
    );
  if (recovery) return <Redirect href="/reset-password" />;
  if (session) return <Redirect href={"/shared" as Href} />;
  return (
    <>
      <Txt style={{ padding: 18, textAlign: "center" }}>
        A loan has been shared with you. Sign in or create an account using the
        invited email, then open Shared with me.
      </Txt>
      <AuthScreen initialMode="Sign in" />
    </>
  );
}
