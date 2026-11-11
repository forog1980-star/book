// Service Worker اختصاصی سامانه اصلی مرکز اسناد (مسیر /book/)
// استراتژی Network-First برای دریافت فوری آخرین تغییرات با اولین رفرش (و استفاده از کش فقط در حالت آفلاین)
const CACHE_PREFIX = 'markaz-asnad-main-book-';
const LEGACY_PREFIX = 'markaz-asnad-pwa-';
const CACHE_NAME = 'markaz-asnad-main-book-v10';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './data/library_books.json',
  './data/golzar_martyrs.xlsx',
  './data/sooreh_mehr_book_martyr_research.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('SW Precache partial warning:', err);
      });
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
          keys.map((key) => {
            // پاک‌سازی کامل تمام کش‌های نسخه‌های قبلی برنامه اصلی
            const isOwnCache = key.startsWith(CACHE_PREFIX) || key.startsWith(LEGACY_PREFIX);
            if (isOwnCache && key !== CACHE_NAME) {
              return caches.delete(key);
            }
            return Promise.resolve(false);
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const reqUrl = new URL(event.request.url);

  // عدم مداخله در درخواست‌های زیربرنامه مستقل /library-research/
  if (reqUrl.pathname.includes('/library-research/')) {
    return;
  }

  // عدم کش کردن فایل‌های محیط توسعه (Vite Dev / HMR) تا تغییرات بلافاصله دیده شوند
  if (
    reqUrl.pathname.startsWith('/src/') ||
    reqUrl.pathname.startsWith('/node_modules/') ||
    reqUrl.pathname.startsWith('/@') ||
    reqUrl.search.includes('t=')
  ) {
    return;
  }

  const isHtmlNavigation =
    event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') || '').includes('text/html');

  if (isHtmlNavigation) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((networkResp) => {
          if (networkResp && networkResp.status === 200) {
            const copy = networkResp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResp;
        })
        .catch(() =>
          caches.match(event.request).then((res) => res || caches.match('./index.html'))
        )
    );
    return;
  }

  // استراتژی Network-First با no-store برای فایل‌های JS/CSS در موبایل و دسکتاپ
  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
