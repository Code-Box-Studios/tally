import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const prepare = fileURLToPath(
  new URL("../prepare_expo_web.mjs", import.meta.url),
);
test("an icon update gets a fresh browser URL and offline release", () => {
  const directory = mkdtempSync(join(tmpdir(), "tally-expo-release-"));
  try {
    const exportHtml =
      '<html><head><link rel="icon" href="/favicon.ico"/></head><body><script src="/app.js"></script></body></html>';
    writeFileSync(join(directory, "index.html"), exportHtml);
    writeFileSync(join(directory, "app.js"), "public application shell");
    writeFileSync(join(directory, "favicon.ico"), "old icon");
    function build() {
      const result = spawnSync(process.execPath, [prepare, directory], {
        encoding: "utf8",
      });
      assert.equal(result.status, 0, result.stderr);
      const html = readFileSync(join(directory, "index.html"), "utf8");
      const icon = html.match(/rel="icon" href="(.*?)"/)[1];
      const worker = readFileSync(join(directory, "service-worker.js"), "utf8");
      assert.notEqual(icon, "/favicon.ico");
      assert(
        worker.includes(icon),
        "The branded icon must remain available offline.",
      );
      return { icon, worker };
    }
    const first = build();
    assert.deepEqual(
      build(),
      first,
      "Repeated preparation must retain the same release.",
    );
    writeFileSync(join(directory, "index.html"), exportHtml);
    writeFileSync(join(directory, "favicon.ico"), "Tally icon");
    const updated = build();
    assert.notEqual(updated.icon, first.icon);
    assert.notEqual(
      updated.worker.match(/const CACHE='([^']+)'/)[1],
      first.worker.match(/const CACHE='([^']+)'/)[1],
    );
    assert.equal(
      readFileSync(join(directory, updated.icon.slice(1)), "utf8"),
      "Tally icon",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
