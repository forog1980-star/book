const CACHE_PREFIX = 'markaz-asnad-library-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v9`;
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
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        await cache.addAll(APP_SHELL);
        if (!self.registration.active) {
          await self.skipWaiting();
        }
      } catch (error) {
        await caches.delete(CACHE_NAME).catch(() => {});
        throw error;
      }
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.searchParams.get('_manual_github_sync') === '1') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (activeCache) => {
        const cached = await activeCache.match('./index.html', { ignoreSearch: true });
        if (cached) return cached;
        const response = await fetch(request);
        if (response && response.ok) {
          await activeCache.put('./index.html', response.clone());
        }
        return response;
      })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (activeCache) => {
      const cached = await activeCache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      const response = await fetch(request);
      if (response && response.ok) {
        await activeCache.put(request, response.clone());
      }
      return response;
    })
  );
});
