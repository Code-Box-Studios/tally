import { copyFile, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
const directory = resolve(process.argv[2] ?? "apps/tally/dist");
// A new URL bypasses browsers' separate favicon caches when branding changes.
const favicon = await readFile(join(directory, "favicon.ico"));
const faviconName = `favicon-${createHash("sha256").update(favicon).digest("hex").slice(0, 16)}.ico`;
await copyFile(join(directory, "favicon.ico"), join(directory, faviconName));
let html = await readFile(join(directory, "index.html"), "utf8");
// Apple fetches Home Screen icons separately from the page and favicon.
// Keep the standard root fallback and give updated icons a fresh URL.
const appleIcon = await readFile(join(directory, "apple-touch-icon.png")).catch(
  (error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  },
);
if (appleIcon) {
  const appleIconName = `apple-touch-icon-${createHash("sha256").update(appleIcon).digest("hex").slice(0, 16)}.png`;
  await writeFile(join(directory, appleIconName), appleIcon);
  html = html.replace(
    /href="\/(?:icons\/)?apple-touch-icon(?:-[a-f0-9]+)?\.png"/,
    `href="/${appleIconName}"`,
  );
}
await writeFile(
  join(directory, "index.html"),
  html.replace(
    /href="\/favicon(?:-[a-f0-9]+)?\.ico"/,
    `href="/${faviconName}"`,
  ),
);
async function walk(root, prefix = "") {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((e) => !e.name.endsWith(".map"))
      .map((e) =>
        e.isDirectory()
          ? walk(join(root, e.name), prefix + e.name + "/")
          : [prefix + e.name],
      ),
  );
  return nested.flat();
}
const paths = (await walk(directory)).filter(
  (p) =>
    !["service-worker.js", "_headers", "_redirects"].includes(p) &&
    !p.endsWith(".hbc") &&
    !p.includes("/ios/") &&
    !p.includes("/android/"),
);
const release = createHash("sha256")
  .update(await readFile(join(directory, "index.html")))
  .digest("hex")
  .slice(0, 16);
const assets = paths.map((p) => "/" + p);
// Keep the controlled page's shell paired with this worker's cached assets
// while a newer release waits for existing tabs to close.
const script = `const CACHE='tally-expo-${release}';const ASSETS=${JSON.stringify(assets)};const ALLOWED=new Set(ASSETS);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('tally-expo-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;if(ALLOWED.has(url.pathname)){event.respondWith(caches.open(CACHE).then(async cache=>await cache.match(url.pathname)||fetch(event.request)));return;}if(event.request.mode==='navigate')event.respondWith(caches.open(CACHE).then(async cache=>await cache.match('/index.html')||fetch(event.request)));});
`;
await writeFile(join(directory, "service-worker.js"), script);
await writeFile(join(directory, "_redirects"), "/* /index.html 200\n");
await writeFile(
  join(directory, "_headers"),
  `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-Frame-Options: DENY
/service-worker.js
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
`,
);
console.log("Prepared Expo SPA routes and static-only offline app shell.");
