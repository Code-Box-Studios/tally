// Expo Router 57 uses query-string 7's CommonJS decoder import. The security
// patched decoder is ESM; normalize its default export for Metro and Node 22.
const fs = require('node:fs');
const path = require('node:path');
const file = require.resolve('query-string', {paths: [path.resolve(__dirname, '..')]});
const metadata = JSON.parse(fs.readFileSync(path.join(path.dirname(file), 'package.json'), 'utf8'));
if (metadata.version !== '7.1.3') throw new Error('Review the decoder compatibility bridge after upgrading query-string.');
const original = "const decodeComponent = require('decode-uri-component');";
const patched = "const decodeModule = require('decode-uri-component');\nconst decodeComponent = decodeModule.default || decodeModule;";
const source = fs.readFileSync(file, 'utf8');
if (source.includes(original)) fs.writeFileSync(file, source.replace(original, patched));
else if (!source.includes(patched)) throw new Error('Unexpected query-string source; compatibility bridge was not applied.');
