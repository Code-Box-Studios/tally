import {createHash} from 'node:crypto';
import {existsSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function prepareWebOffline(directory) {
  const root = resolve(directory);
  for (const file of ['index.html','main.dart.js','flutter_bootstrap.js','tally-shell-sw.js','drift_worker.js','sqlite3.wasm']) {
    if(!existsSync(join(root,file))) throw Error(`Incomplete web build: ${file}`);
  }
  const excluded = new Set(['flutter_service_worker.js','firebase-messaging-sw.js','tally-messaging-config.js','tally-shell-manifest.js','tally-shell-sw.js']);
  const assets = [];
  function walk(folder, prefix='') {
    for(const item of readdirSync(folder,{withFileTypes:true})) {
      const name = prefix+item.name;
      if(item.isDirectory()) walk(join(folder,item.name),name+'/');
      else if(item.isFile() && !excluded.has(name) && !name.endsWith('.map') && !name.includes('service_worker') && !name.includes('skwasm') && !name.includes('wimp') && !name.includes('webparagraph')) assets.push(name);
    }
  }
  walk(root); assets.sort();
  // Public SDK modules use the SDK version pinned by the official FlutterFire packages.
  const sdk = ['app','auth','firestore','functions','storage','app-check','messaging'].map(name=>`https://www.gstatic.com/firebasejs/12.19.0/firebase-${name}.js`);
  const indexPath = join(root,'index.html');
  const cleanIndex = readFileSync(indexPath,'utf8').replace(/[ \t]*<meta name="tally-shell-version" content="[a-f0-9]{64}">\r?\n?/g,'');
  const hash = createHash('sha256').update(readFileSync(join(root,'tally-shell-sw.js')));
  for(const asset of assets) hash.update(asset).update(asset==='index.html' ? cleanIndex : readFileSync(join(root,asset)));
  hash.update(JSON.stringify(sdk)); const version = hash.digest('hex');
  writeFileSync(indexPath,cleanIndex.replace('</head>',`  <meta name="tally-shell-version" content="${version}">\n</head>`));
  writeFileSync(join(root,'tally-shell-manifest.js'),`self.__TALLY_SHELL_MANIFEST = ${JSON.stringify({version,assets,sdk})};\n`);
  return {version,assets,sdk};
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(!process.argv[2]) throw Error('Pass a completed web build directory.');
  const manifest=prepareWebOffline(process.argv[2]);
  console.log(`Prepared public offline app shell: ${manifest.assets.length} static assets.`);
}
