import React from "react";
import { Redirect } from "expo-router";
import { useSession } from "../auth/session-provider";

// Native apps open their workspace or authentication. The marketing page is web-only.
export function LandingScreen() {
  const { ready, session } = useSession();
  return <Redirect href={ready && session ? "/home" : "/sign-in"} />;
}
