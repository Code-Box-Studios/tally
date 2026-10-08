'use strict';
importScripts('tally-shell-manifest.js');
const manifest = self.__TALLY_SHELL_MANIFEST;
if (!manifest || !/^[a-f0-9]{64}$/.test(manifest.version)) throw Error('A compiled public-assets manifest is required.');
const scope = self.registration.scope;
const prefix = 'tally-public-shell-' + encodeURIComponent(new URL(scope).pathname) + '-';
const cacheName = prefix + manifest.version;
const staticUrls = new Set(manifest.assets.map(path => new URL(path, scope).href));
const sdkUrls = new Set(manifest.sdk.map(path => path));
const indexUrl = new URL('index.html', scope).href;
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll([...staticUrls, ...sdkUrls]);
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(prefix) && name !== cacheName) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const navigation = request.mode === 'navigate' && url.origin === new URL(scope).origin && request.url.startsWith(scope);
  if (!navigation && !staticUrls.has(request.url) && !sdkUrls.has(request.url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    if (navigation) {
      try { return await fetch(request); }
      catch (_) { const cached = await cache.match(indexUrl); if (cached) return cached; throw Error('App shell unavailable.'); }
    }
    const cached = await cache.match(request.url);
    return cached ?? fetch(request);
  })());
});
