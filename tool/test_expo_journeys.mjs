import { spawn } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// Use a disposable browser profile, never the user's existing browser session.
const binary = process.env.TALLY_CHROME_BIN;
if (!binary)
  throw new Error("Set TALLY_CHROME_BIN to an installed Chromium executable.");
await access(binary, constants.X_OK);
const port = Number(process.env.TALLY_QA_BROWSER_PORT ?? 9239);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535)
  throw new Error("Choose an available local browser port from 1024 to 65535.");
const endpoint = `http://127.0.0.1:${port}`;
async function reachable(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
}
async function ready(url, child) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (child.exitCode !== null)
      throw new Error("A browser-test service exited during startup.");
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("A browser-test service did not become ready.");
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}
async function run(script, env) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${script} failed (${code}).`)),
    );
  });
}
if (await reachable(`${endpoint}/json/version`))
  throw new Error(
    "The browser test port is already in use; choose a different TALLY_QA_BROWSER_PORT.",
  );
let server;
try {
  if (process.env.TALLY_QA_EXISTING_SERVER !== "1") {
    if (await reachable("http://127.0.0.1:7385/"))
      throw new Error(
        "Port 7385 is in use. Set TALLY_QA_EXISTING_SERVER=1 only for your local test export.",
      );
    server = spawn("python3", ["tool/serve_expo_local.py"], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    await ready("http://127.0.0.1:7385/", server);
  }
  for (const viewport of ["1440x1000", "390x844x1,mobile,touch"]) {
    const profile = await mkdtemp(join(tmpdir(), "tally-browser-check-"));
    const browser = spawn(
      binary,
      [
        "--headless=new",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--no-first-run",
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profile}`,
        "about:blank",
      ],
      { stdio: "ignore" },
    );
    try {
      await ready(`${endpoint}/json/version`, browser);
      console.log(`Checking Tally browser journey at ${viewport}`);
      await run("tool/test_expo_browser.mjs", {
        ...process.env,
        TALLY_QA_BROWSER: endpoint,
        TALLY_QA_VIEWPORT: viewport,
        TALLY_QA_SESSION: `tally-ci-${randomUUID()}`,
      });
      if (viewport === "1440x1000")
        await run("tool/test_expo_auth_appearance.mjs", {
          ...process.env,
          TALLY_UI_BROWSER_URL: endpoint,
          TALLY_UI_BROWSER_SESSION: `tally-appearance-${randomUUID()}`,
        });
    } finally {
      await stop(browser);
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
} finally {
  await stop(server);
}
