import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { runtimeConfig } from "../config";
import { sessionStorageAdapter } from "../storage";
let singleton: ReturnType<typeof createClient> | null = null;
export function backend() {
  if (!singleton) {
    const config = runtimeConfig();
    singleton = createClient(config.url, config.key, {
      auth: {
        storage: sessionStorageAdapter,
        storageKey: "tally-auth-" + config.url.replace(/[^A-Za-z0-9]/g, "_"),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === "web",
        flowType: "pkce",
      },
    });
  }
  return singleton;
}
