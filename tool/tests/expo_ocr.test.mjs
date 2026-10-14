import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runInNewContext } from "node:vm";

test("OCR downloads stay out of the initial offline app shell", async () => {
  const directory = mkdtempSync(join(tmpdir(), "tally-ocr-shell-"));
  try {
    writeFileSync(join(directory, "index.html"), '<link rel="icon" href="/favicon.ico"><script src="/app.js"></script>');
    writeFileSync(join(directory, "favicon.ico"), "icon");
    writeFileSync(join(directory, "app.js"), "app");
    mkdirSync(join(directory, "ocr", "v7"), { recursive: true });
    writeFileSync(join(directory, "ocr", "v7", "worker.min.js"), "large OCR asset");
    const result = spawnSync(process.execPath, ["tool/prepare_expo_web.mjs", directory], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const handlers = new Map();
    let requested = [];
    runInNewContext(readFileSync(join(directory, "service-worker.js"), "utf8"), {
      self: { addEventListener: (name, handler) => handlers.set(name, handler) },
      caches: { open: async () => ({ addAll: async (paths) => { requested = [...paths]; } }) },
    });
    let installed;
    handlers.get("install")({ waitUntil: (promise) => { installed = promise; } });
    await installed;
    assert(requested.includes("/app.js"));
    assert(!requested.some((path) => path.startsWith("/ocr/")));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
