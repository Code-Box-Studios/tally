import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { runtimeConfig } from "../config";
import { createOwnedSessionStorage } from "./owned-session-storage";
import { sessionStorageAdapter } from "../storage";
let ownedStorage: ReturnType<typeof createOwnedSessionStorage> | null = null;
let singleton: ReturnType<typeof createClient> | null = null;
export function backend() {
  if (!singleton) {
    const config = runtimeConfig();
    const storageKey = "tally-auth-" + config.url.replace(/[^A-Za-z0-9]/g, "_");
    ownedStorage = createOwnedSessionStorage(storageKey, sessionStorageAdapter);
    singleton = createClient(config.url, config.key, {
      auth: {
        storage: ownedStorage.storage,
        storageKey,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === "web",
        flowType: "pkce",
      },
    });
  }
  return singleton;
}

export function signOutOwnedSession(owner: string, scope: "local" | "global") {
  const auth = backend().auth;
  return ownedStorage!.signOutOwner(auth, owner, scope);
}
export function signOutDeletedOwner(owner: string) {
  return signOutOwnedSession(owner, "local");
}
