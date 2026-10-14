import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(app, "public", "ocr", "v7");
const tesseract = dirname(require.resolve("tesseract.js/package.json"));
const core = dirname(require.resolve("tesseract.js-core/package.json"));
const language = dirname(
  require.resolve("@tesseract.js-data/eng/package.json"),
);
for (const [directory, version] of [
  [tesseract, "7.0.0"],
  [core, "7.0.0"],
  [language, "1.0.0"],
]) {
  const metadata = JSON.parse(
    await readFile(join(directory, "package.json"), "utf8"),
  );
  if (metadata.version !== version)
    throw new Error(
      `Review OCR asset versions before updating ${metadata.name}.`,
    );
}
await mkdir(join(target, "core"), { recursive: true });
await mkdir(join(target, "lang"), { recursive: true });
await copyFile(
  join(tesseract, "dist", "worker.min.js"),
  join(target, "worker.min.js"),
);
// The .wasm.js distributions embed WASM and let Tesseract choose supported CPU features.
for (const name of [
  "tesseract-core",
  "tesseract-core-simd",
  "tesseract-core-relaxedsimd",
  "tesseract-core-lstm",
  "tesseract-core-simd-lstm",
  "tesseract-core-relaxedsimd-lstm",
]) {
  await copyFile(
    join(core, `${name}.wasm.js`),
    join(target, "core", `${name}.wasm.js`),
  );
}
await copyFile(
  join(language, "4.0.0_best_int", "eng.traineddata.gz"),
  join(target, "lang", "eng.traineddata.gz"),
);
await copyFile(
  join(tesseract, "LICENSE.md"),
  join(target, "TESSERACT-LICENSE.txt"),
);
await copyFile(join(core, "LICENSE"), join(target, "CORE-LICENSE.txt"));
await writeFile(
  join(target, "versions.json"),
  JSON.stringify({
    "tesseract.js": "7.0.0",
    "tesseract.js-core": "7.0.0",
    "@tesseract.js-data/eng": "1.0.0",
  }) + "\n",
);
console.log("Prepared local receipt OCR engine and English data.");
