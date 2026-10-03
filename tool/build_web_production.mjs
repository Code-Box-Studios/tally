import {execFileSync} from 'node:child_process';
import {readFileSync, rmSync, statSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateWebEnvironment} from './web_environment.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const environment = process.env.TALLY_BUILD_ENVIRONMENT || 'production';
const configPath = process.env.TALLY_WEB_CONFIG;
if (!configPath) throw new Error('Set TALLY_WEB_CONFIG to the public environment JSON before building.');
if (process.versions.node.split('.')[0] !== '22') throw new Error('Tally builds require Node 22.');
const definesFile = resolve(configPath);
const config = JSON.parse(readFileSync(definesFile, 'utf8'));
validateWebEnvironment(config, environment);
const source = join(root, `build/web-${environment}`);
execFileSync('flutter', ['pub', 'get', '--enforce-lockfile'], {cwd:root, stdio:'inherit'});
rmSync(source, {recursive:true, force:true});
execFileSync('flutter', ['build', 'web', '--release', '--target', environment === 'production' ? 'lib/main_prod.dart' : 'lib/main_staging.dart', '--dart-define-from-file', definesFile, '--no-web-resources-cdn', '--output', source], {cwd:root, stdio:'inherit'});
for (const asset of ['index.html','main.dart.js','flutter_bootstrap.js','assets/FontManifest.json','assets/assets/fonts/DMSans.ttf','assets/assets/fonts/Manrope.ttf','canvaskit/canvaskit.wasm']) {
  const file = statSync(join(source, asset));
  if (!file.isFile() || !file.size) throw new Error(`Incomplete web build: ${asset}`);
}
console.log(`Tally ${environment} web build prepared for ${config.TALLY_PROJECT_ID}.`);
