const CACHE_NAME = 'jinsei-techo-v2';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './firebase-config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// stale-while-revalidate：起動速度を保ちつつ、裏側で常に最新版に更新する。
// これにより、今回のようにファイルを更新した後も「見た目は古いまま」になる問題が起きにくくなる。
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  if (!isSameOrigin || event.request.method !== 'GET') return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const networkFetch = fetch(event.request).then((res) => {
        if (res && res.ok) cache.put(event.request, res.clone());
        return res;
      }).catch(() => null);

      // キャッシュがあれば即座に返して起動を速く保ち、同時にネットワークから最新版を取得してキャッシュを更新する
      if (cached) {
        networkFetch;
        return cached;
      }
      const netRes = await networkFetch;
      return netRes || cached;
    })
  );
});
