// Al publicar: subir CACHE y el ?v= de index.html y de esta lista a la vez.
const CACHE = 'grupo-tesela-v5';
const SHELL = ['./', './index.html', './styles.css?v=5', './app.js?v=5', './config.js?v=5', './manifest.json', './vendor/d3.v7.min.js', './vendor/supabase.min.js', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Supabase va directo a la red
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const fetching = fetch(e.request).then((res) => { if (res && res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone())); return res; }).catch(() => hit);
      return hit || fetching;
    })
  );
});
