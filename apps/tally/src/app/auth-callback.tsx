import React, { useEffect, useState } from "react";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { Platform } from "react-native";
import { completeAuthLink } from "../features/auth/deep-link";
import { useSession } from "../features/auth/session-provider";
import { Page, Loading, Failure } from "../shared/ui";
export default function Callback() {
  const { session } = useSession(),
    [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    if (session) {
      router.replace("/");
      return;
    }
    if (Platform.OS === "web") return;
    void Linking.getInitialURL().then(async (value) => {
      if (!value) return;
      await completeAuthLink(value).catch(setError);
    });
  }, [session]);
  return <Page>{error ? <Failure error={error} /> : <Loading />}</Page>;
}
