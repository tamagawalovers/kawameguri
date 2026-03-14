// 川めぐりマップ — Service Worker
// キャッシュ名（バージョンを上げると古いキャッシュが自動削除されます）
const CACHE_NAME = 'kawameguri-v1';

// オフラインでも動かしたい静的リソース
const STATIC_ASSETS = [
  '/kawameguri/',
  '/kawameguri/index.html',
  '/kawameguri/manifest.json',
  '/kawameguri/ogp.png',
  // Leaflet（CDN）
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  // フォント（Google Fonts は別途キャッシュ戦略）
  'https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@300;400;500;700&family=DM+Mono:wght@300;400&display=swap',
];

// ── インストール: 静的リソースをキャッシュ ────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // 失敗しても起動できるよう addAll ではなく個別に add
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(() => {}))
      );
    })
  );
  self.skipWaiting();
});

// ── アクティベート: 古いキャッシュを削除 ─────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── フェッチ: キャッシュ優先 → ネットワーク ──────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Overpass API・Wikipedia API はキャッシュしない（常にリアルタイム取得）
  const noCacheHosts = [
    'overpass-api.de',
    'ja.wikipedia.org',
    'tile.openstreetmap.org',
  ];
  if (noCacheHosts.some(h => url.hostname.includes(h))) {
    // ネットワーク優先（オフライン時はそのままエラー）
    return;
  }

  // 静的リソースはキャッシュ優先
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      // キャッシュになければネットワークから取得してキャッシュに追加
      return fetch(event.request).then(response => {
        // 正常レスポンスのみキャッシュ（エラーはキャッシュしない）
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }
        const cloned = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
        return response;
      }).catch(() => {
        // オフライン時にHTMLリクエストなら index.html を返す
        if (event.request.destination === 'document') {
          return caches.match('/kawameguri/index.html');
        }
      });
    })
  );
});
