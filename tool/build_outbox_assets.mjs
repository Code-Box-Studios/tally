import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, renameSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(root, 'web/outbox-assets.json'), 'utf8'));
const lock = readFileSync(resolve(root, 'pubspec.lock'), 'utf8');
for (const name of ['drift', 'sqlite3']) {
  const version = new RegExp(`^  ${name}:\\n[\\s\\S]*?\\n    version: "([^"]+)"`, 'm').exec(lock)?.[1];
  if (version !== manifest[name]) throw Error(`Outbox ${name} package and asset version differ.`);
}
if (manifest.release !== 'drift-2.35.1' || manifest.assets.length !== 2 ||
    !['--check', '--fetch'].includes(process.argv[2] ?? '--check')) throw Error('Use the reviewed outbox asset manifest.');
for (const asset of manifest.assets) {
  if (!['web/drift_worker.js', 'web/sqlite3.wasm'].includes(asset.file) ||
      asset.url !== `https://github.com/simolus3/drift/releases/download/${manifest.release}/${asset.file.slice(4)}` ||
      !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.bytes)) throw Error('Invalid outbox asset provenance.');
  const target = resolve(root, asset.file);
  const data = process.argv[2] === '--fetch'
    ? Buffer.from(await (await fetch(asset.url)).arrayBuffer()) : readFileSync(target);
  if (data.length !== asset.bytes || createHash('sha256').update(data).digest('hex') !== asset.sha256) throw Error(`Outbox asset integrity failed: ${asset.file}`);
  if (process.argv[2] === '--fetch') {
    writeFileSync(`${target}.download`, data);
    renameSync(`${target}.download`, target);
  }
}
console.log('Pinned outbox worker and SQLite WASM integrity verified.');
