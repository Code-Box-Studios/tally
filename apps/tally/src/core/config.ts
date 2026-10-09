export interface RuntimeConfig {
  url: string;
  key: string;
  namespace: string;
}
export function validateConfig(
  url: string | undefined,
  key: string | undefined,
  development: boolean,
): RuntimeConfig {
  if (!url || !key)
    throw new Error(
      "Tally needs its Supabase project URL and public key. Run npm run start:local for local testing.",
    );
  const parsed = new URL(url);
  const local =
    /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(
      parsed.hostname,
    );
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/" ||
    !(
      (parsed.protocol === "https:" &&
        /^[a-z]{20}\.supabase\.co$/.test(parsed.hostname)) ||
      (development && local && parsed.protocol === "http:")
    )
  )
    throw new Error("Use the dedicated Tally Supabase project URL.");
  if (
    key.startsWith("sb_secret_") ||
    (!key.startsWith("sb_publishable_") &&
      !(development && local && key.startsWith("eyJ")))
  )
    throw new Error("Only a public Supabase key may be used in the app.");
  return { url: parsed.origin, key, namespace: `expo-v1:${parsed.origin}` };
}
export function runtimeConfig() {
  return validateConfig(
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    __DEV__ || process.env.EXPO_PUBLIC_TALLY_ENVIRONMENT === "local",
  );
}
