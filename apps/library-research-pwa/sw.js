const CACHE_PREFIX = 'markaz-asnad-library-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v8`;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './scripts/loader.js',
  './styles.css.gz',
  './theme.css',
  './fonts/Vazirmatn-variable.woff2.b64',
  './dist/app.js.gz',
  './dist/db.js.gz',
  './dist/domain.js.gz',
  './dist/relations.js.gz',
  './dist/backup.js.gz',
  './dist/xlsx.js.gz',
  './public/icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.searchParams.get('_manual_github_sync') === '1') return;
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          }
          return response;
        });
      })
    );
    return;
  }
  event.respondWith(caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  })));
});
