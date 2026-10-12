/* Offline shell caching. Forecast and API data are ALWAYS network-first; stale data
   may only be shown with an explicit freshness warning in the UI. */
const CACHE='nordlysradar-shell-v1';
const SHELL=['./','./index.html','./styles.css','./app.js','./lib/astro.js','./lib/scoring.js','./lib/data.js','./lib/storage.js','./lib/map.js','./assets/icon-192.png','./assets/icon-512.png','./assets/aurora-icon.svg','./manifest.webmanifest'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin) return;
  const url=new URL(req.url);
  if(url.pathname.includes('/data/')) { event.respondWith(fetch(req).catch(()=>Response.error()));return; }
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{if(res.ok){const clone=res.clone();caches.open(CACHE).then(c=>c.put(req,clone));}return res;})));
});
