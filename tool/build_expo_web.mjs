import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
const local = process.argv.includes("--local");
const directory = resolve(
  process.env.TALLY_EXPO_WEB_OUTPUT_DIRECTORY ?? "apps/tally/dist",
);
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
const exported = spawnSync(
  "npx",
  ["expo", "export", "--platform", "web", "--clear", "--output-dir", directory],
  {
    cwd: "apps/tally",
    stdio: "inherit",
    env: {
      ...process.env,
      EXPO_PUBLIC_TALLY_ENVIRONMENT: local ? "local" : "production",
    },
  },
);
if (exported.status !== 0) process.exit(exported.status ?? 1);
// Verify the referenced bundle, rather than a leftover file from another build.
const html = readFileSync(resolve(directory, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)];
const content = scripts
  .map(([, source]) => {
    if (!source.startsWith("/") || source.startsWith("//"))
      throw new Error("The exported app must use its own JavaScript bundles.");
    const path = resolve(directory, "." + source);
    if (!path.startsWith(directory + sep))
      throw new Error("Invalid exported bundle path.");
    return readFileSync(path, "utf8");
  })
  .join("\n");
if (!content.includes(url) || !content.includes(key))
  throw new Error(
    "Exported bundle does not match the configured Supabase backend. Refusing release.",
  );
const prepared = spawnSync(
  process.execPath,
  ["tool/prepare_expo_web.mjs", directory],
  {
    stdio: "inherit",
  },
);
process.exit(prepared.status ?? 1);
