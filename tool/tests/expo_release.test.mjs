import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { runInNewContext } from "node:vm";

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

test("an active worker keeps navigation and scripts on its cached release while an update waits", async () => {
  const directory = mkdtempSync(join(tmpdir(), "tally-expo-worker-"));
  const origin = "https://tally.example";
  const cachedReleases = new Map();
  const fetched = [];
  let cacheOpens = 0;
  try {
    writeFileSync(join(directory, "favicon.ico"), "Tally icon");
    function build(version) {
      writeFileSync(
        join(directory, "index.html"),
        `<html><head><link rel="icon" href="/favicon.ico"/></head><body><script src="/app-${version}.js"></script></body></html>`,
      );
      writeFileSync(join(directory, `app-${version}.js`), `release ${version}`);
      const result = spawnSync(process.execPath, [prepare, directory], {
        encoding: "utf8",
      });
      assert.equal(result.status, 0, result.stderr);
      const handlers = new Map();
      runInNewContext(
        readFileSync(join(directory, "service-worker.js"), "utf8"),
        {
          URL,
          self: {
            location: { origin },
            addEventListener: (name, handler) => handlers.set(name, handler),
          },
          caches: {
            async open(name) {
              cacheOpens++;
              if (!cachedReleases.has(name)) cachedReleases.set(name, new Map());
              const entries = cachedReleases.get(name);
              return {
                async addAll(paths) {
                  for (const path of paths)
                    entries.set(
                      path,
                      new Response(readFileSync(join(directory, path.slice(1)))),
                    );
                },
                async match(path) {
                  return entries.get(path)?.clone();
                },
              };
            },
          },
          async fetch(request) {
            fetched.push(request.url);
            return new Response(readFileSync(join(directory, "index.html")));
          },
        },
      );
      return handlers;
    }
    async function install(worker) {
      let installed;
      worker.get("install")({ waitUntil: (promise) => (installed = promise) });
      await installed;
    }
    function request(worker, path, mode = "cors", method = "GET") {
      let response;
      worker.get("fetch")({
        request: { url: new URL(path, origin).href, mode, method },
        respondWith: (promise) => (response = promise),
      });
      return response;
    }

    const active = build("v1");
    const firstHtml = readFileSync(join(directory, "index.html"), "utf8");
    await install(active);
    const waiting = build("v2");
    const nextHtml = readFileSync(join(directory, "index.html"), "utf8");
    await install(waiting);
    assert.equal(cachedReleases.size, 2);

    const navigation = await request(active, "/settings/sync", "navigate");
    assert.equal(await navigation.text(), firstHtml);
    const script = await request(active, "/app-v1.js");
    assert.equal(await script.text(), "release v1");
    assert.deepEqual(fetched, []);

    const beforePrivateRequests = cacheOpens;
    assert.equal(request(active, "/rest/v1/tally_payments"), undefined);
    assert.equal(
      request(active, "https://backend.example/storage/v1/object/private/file"),
      undefined,
    );
    assert.equal(request(active, "/app-v1.js", "cors", "POST"), undefined);
    assert.equal(request(active, "/app-v2.js"), undefined);
    assert.equal(cacheOpens, beforePrivateRequests);
    assert.deepEqual(fetched, []);

    // A missing shell can still recover online without storing private routes.
    const firstCache = cachedReleases.values().next().value;
    firstCache.delete("/index.html");
    const fallback = await request(active, "/settings/sync", "navigate");
    assert.equal(await fallback.text(), nextHtml);
    assert.deepEqual(fetched, [`${origin}/settings/sync`]);
    assert.equal(firstCache.has("/settings/sync"), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
