import { execFileSync } from 'node:child_process';
import { rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = join(root, 'build/web-preview');

if (process.versions.node.split('.')[0] !== '22') {
  throw new Error('Tally deployment builds require Node 22.');
}

execFileSync('flutter', ['pub', 'get', '--enforce-lockfile'], {
  cwd: root,
  stdio: 'inherit',
});
// Rebuild the generated web directory; native build artifacts stay separate.
rmSync(source, { recursive: true, force: true });
execFileSync('flutter', [
  'build', 'web', '--release', '--target', 'lib/main_preview.dart',
  '--no-web-resources-cdn', '--output', source,
], { cwd: root, stdio: 'inherit' });

for (const asset of [
  'index.html',
  'main.dart.js',
  'flutter_bootstrap.js',
  'assets/FontManifest.json',
  'assets/assets/fonts/Roboto-Regular.ttf',
  'assets/assets/fonts/Roboto-Medium.ttf',
  'assets/assets/fonts/Roboto-Bold.ttf',
  'assets/assets/fonts/LICENSE.txt',
  'canvaskit/canvaskit.wasm',
]) {
  const file = statSync(join(source, asset));
  if (!file.isFile() || file.size === 0) {
    throw new Error(`Incomplete web build: ${asset}`);
  }
}

console.log('Web preview prepared in build/web-preview.');
