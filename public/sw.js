// Service Worker سامانه اصلی مرکز اسناد (/book/)
// پوسته برنامه و داده‌های مرجع در زمان نصب ذخیره می‌شوند تا اجرای روزمره به GitHub وابسته نباشد.
const CACHE_PREFIX = 'markaz-asnad-main-book-';
const LEGACY_CACHE_PREFIX = 'markaz-asnad-pwa-';
const CACHE_NAME = CACHE_PREFIX + 'v14';

const REQUIRED_APP_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './apple-touch-icon.png',
  './pwa-192x192.png',
  './pwa-512x512.png',
  './data/library_books.json',
  './data/golzar_martyrs.xlsx',
  './data/sooreh_mehr_book_martyr_research.json',
];

async function collectAppShellAssets() {
  const indexUrl = new URL('./index.html', self.registration.scope);
  const response = await fetch(indexUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Cannot fetch application entry point: ' + response.status);
  }

  const html = await response.text();
  const bundleAssets = new Set();

  // Vite emits hashed JavaScript/CSS names. Read them from the built HTML
  // instead of hard-coding hashes that change on every production build.
  for (const match of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const assetUrl = new URL(match[1], indexUrl);
      if (assetUrl.origin !== self.location.origin) continue;
      if (!assetUrl.pathname.includes('/assets/')) continue;
      if (!/\.(?:js|css)$/i.test(assetUrl.pathname)) continue;
      bundleAssets.add(assetUrl.href);
    } catch {
      // Ignore malformed or unsupported optional references.
    }
  }

  if (bundleAssets.size === 0) {
    throw new Error('No local production JavaScript/CSS bundles were found in index.html');
  }

  return [
    ...REQUIRED_APP_ASSETS.map((asset) => new URL(asset, self.registration.scope).href),
    ...bundleAssets,
  ];
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const appShellAssets = [...new Set(await collectAppShellAssets())];

    // Do not activate a new worker unless the complete core shell is cached.
    // The previous working version remains available if installation fails.
    await cache.addAll(appShellAssets);
    await self.skipWaiting();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) =>
          (key.startsWith(CACHE_PREFIX) || key.startsWith(LEGACY_CACHE_PREFIX)) &&
          key !== CACHE_NAME
        )
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  // Requests belonging to the independently deployed research PWA are not intercepted.
  if (requestUrl.pathname.includes('/library-research/')) return;

  // Development and explicit live-version checks remain network-only.
  if (
    requestUrl.pathname.startsWith('/src/') ||
    requestUrl.pathname.startsWith('/node_modules/') ||
    requestUrl.pathname.startsWith('/@') ||
    requestUrl.search.includes('t=') ||
    requestUrl.search.includes('_check=') ||
    requestUrl.search.includes('_sw_t=')
  ) {
    return;
  }

  const isNavigation =
    request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html');

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    if (isNavigation) {
      const indexUrl = new URL('./index.html', self.registration.scope);
      const freshHtmlUrl = new URL('./index.html', self.registration.scope);
      freshHtmlUrl.searchParams.set('_sw_t', String(Date.now()));

      try {
        const networkResponse = await fetch(freshHtmlUrl, {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (networkResponse && networkResponse.status === 200) {
          await cache.put(indexUrl, networkResponse.clone());
          if (request.url !== indexUrl.href) {
            await cache.put(request, networkResponse.clone());
          }
        }
        return networkResponse;
      } catch {
        return (await cache.match(request)) ||
          (await cache.match(indexUrl)) ||
          Response.error();
      }
    }

    if (requestUrl.pathname.includes('/data/')) {
      const cached = await cache.match(request);
      if (cached) return cached;

      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
          await cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch {
        return Response.error();
      }
    }

    // Network-first for same-origin scripts, styles and runtime assets;
    // use only the active application's cache as the offline fallback.
    try {
      const networkResponse = await fetch(request, { cache: 'no-cache' });
      if (networkResponse && networkResponse.status === 200) {
        await cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    } catch {
      return (await cache.match(request)) || Response.error();
    }
  })());
});
