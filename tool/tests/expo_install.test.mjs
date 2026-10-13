import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const publicDirectory = fileURLToPath(
  new URL("../../apps/tally/public/", import.meta.url),
);
const prepare = fileURLToPath(
  new URL("../prepare_expo_web.mjs", import.meta.url),
);

test("the installed Apple icon uses the Tally PNG with a fresh URL and a root fallback", () => {
  const directory = mkdtempSync(join(tmpdir(), "tally-expo-install-"));
  try {
    cpSync(publicDirectory, directory, { recursive: true });
    const originalHtml = readFileSync(join(directory, "index.html"), "utf8");
    writeFileSync(join(directory, "favicon.ico"), "Tally favicon");
    function build() {
      const result = spawnSync(process.execPath, [prepare, directory], {
        encoding: "utf8",
      });
      assert.equal(result.status, 0, result.stderr);
      const html = readFileSync(join(directory, "index.html"), "utf8");
      const link = html.match(/<link\b[^>]*rel="apple-touch-icon"[^>]*>/)[0];
      assert.match(link, /sizes="180x180"/);
      const iconUrl = link.match(/href="([^"]+)"/)[1];
      assert.match(iconUrl, /^\/apple-touch-icon-[a-f0-9]{16}\.png$/);
      const icon = readFileSync(join(directory, iconUrl.slice(1)));
      assert.equal(icon.readUInt32BE(16), 180);
      assert.equal(icon.readUInt32BE(20), 180);
      assert.deepEqual(
        icon,
        readFileSync(join(directory, "apple-touch-icon.png")),
      );
      assert(
        readFileSync(join(directory, "service-worker.js"), "utf8").includes(
          iconUrl,
        ),
      );
      return iconUrl;
    }
    const first = build();
    assert.deepEqual(
      readFileSync(join(directory, first.slice(1))),
      readFileSync(join(publicDirectory, "icons/apple-touch-icon.png")),
    );
    assert.equal(
      build(),
      first,
      "Repeated preparation must preserve the icon URL.",
    );
    const replacement = Buffer.from(
      readFileSync(join(directory, "apple-touch-icon.png")),
    );
    replacement[replacement.length - 1] ^= 1;
    writeFileSync(join(directory, "apple-touch-icon.png"), replacement);
    writeFileSync(join(directory, "index.html"), originalHtml);
    assert.notEqual(build(), first, "A changed icon must get a new URL.");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
