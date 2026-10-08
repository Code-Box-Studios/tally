import {execFileSync} from 'node:child_process';
import {readFileSync, rmSync, statSync,writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateWebEnvironment} from './web_environment.mjs';
import {generateMessagingConfig} from './messaging_config.mjs';
import {prepareWebOffline} from './prepare_web_offline.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const environment = process.env.TALLY_BUILD_ENVIRONMENT || 'production';
const configPath = process.env.TALLY_WEB_CONFIG;
if (!configPath) throw new Error('Set TALLY_WEB_CONFIG to the public environment JSON before building.');
if (process.versions.node.split('.')[0] !== '22') throw new Error('Tally builds require Node 22.');
const definesFile = resolve(configPath);
const config = JSON.parse(readFileSync(definesFile, 'utf8'));
validateWebEnvironment(config, environment);
const source = join(root, `build/web-${environment}`);
execFileSync(process.execPath, [join(root, 'tool/build_outbox_assets.mjs'), '--check'], {cwd:root, stdio:'inherit'});
execFileSync('flutter', ['pub', 'get', '--enforce-lockfile'], {cwd:root, stdio:'inherit'});
rmSync(source, {recursive:true, force:true});
execFileSync('flutter', ['build', 'web', '--release', '--target', environment === 'production' ? 'lib/main_prod.dart' : 'lib/main_staging.dart', '--dart-define-from-file', definesFile, '--no-web-resources-cdn', '--output', source], {cwd:root, stdio:'inherit'});
writeFileSync(join(source,'tally-messaging-config.js'),generateMessagingConfig(config,environment));
prepareWebOffline(source);
for (const asset of ['index.html','main.dart.js','flutter_bootstrap.js','tally-shell-sw.js','tally-shell-manifest.js','assets/FontManifest.json','assets/assets/fonts/DMSans.ttf','assets/assets/fonts/Manrope.ttf','canvaskit/canvaskit.wasm','drift_worker.js','sqlite3.wasm','outbox-assets.json','outbox-third-party-notices.txt']) {
  const file = statSync(join(source, asset));
  if (!file.isFile() || !file.size) throw new Error(`Incomplete web build: ${asset}`);
}
console.log(`Tally ${environment} web build prepared for ${config.TALLY_PROJECT_ID}.`);
