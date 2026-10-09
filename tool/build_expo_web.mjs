import { spawnSync } from "node:child_process";
const local = process.argv.includes("--local");
const url = process.env.EXPO_PUBLIC_SUPABASE_URL,
  key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key)
  throw new Error(
    "Configure the dedicated Tally public backend environment before exporting.",
  );
const parsed = new URL(url);
if (
  parsed.username ||
  parsed.password ||
  parsed.pathname !== "/" ||
  parsed.search ||
  parsed.hash
)
  throw new Error("Use an origin-only Supabase URL.");
if (local) {
  if (url !== "http://127.0.0.1:56321")
    throw new Error("Local export requires the isolated Tally backend.");
} else if (
  !/^https:\/\/[a-z]{20}\.supabase\.co$/.test(url) ||
  !key.startsWith("sb_publishable_") ||
  process.env.EXPO_PUBLIC_TALLY_ENVIRONMENT === "local"
)
  throw new Error(
    "Production requires a hosted Tally Supabase project and public key.",
  );
const exported = spawnSync("npx", ["expo", "export", "--platform", "web"], {
  cwd: "apps/tally",
  stdio: "inherit",
  env: {
    ...process.env,
    EXPO_PUBLIC_TALLY_ENVIRONMENT: local ? "local" : "production",
  },
});
if (exported.status !== 0) process.exit(exported.status ?? 1);
const prepared = spawnSync(process.execPath, ["tool/prepare_expo_web.mjs"], {
  stdio: "inherit",
});
process.exit(prepared.status ?? 1);
