// Service Worker اختصاصی سامانه اصلی مرکز اسناد (مسیر /book/)
// استراتژی Network-First واقعی برای موبایل و دسکتاپ جهت دریافت فوری آخرین تغییرات با اولین رفرش
const CACHE_PREFIX = 'markaz-asnad-main-book-';
const LEGACY_PREFIX = 'markaz-asnad-pwa-';
const CACHE_NAME = 'markaz-asnad-main-book-v11';

// عدم پیش‌کش کردن index.html در زمان نصب تا هرگز فایل HTML قدیمی در کش ذخیره نشود
const PRECACHE_ASSETS = [
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
            if (key !== CACHE_NAME) {
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

  // عدم مداخله در درخواست‌های بررسی نسخه زنده یا محیط توسعه Vite
  if (
    reqUrl.pathname.startsWith('/src/') ||
    reqUrl.pathname.startsWith('/node_modules/') ||
    reqUrl.pathname.startsWith('/@') ||
    reqUrl.search.includes('t=') ||
    reqUrl.search.includes('_check=') ||
    reqUrl.search.includes('_sw_t=')
  ) {
    return;
  }

  const isHtmlNavigation =
    event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') || '').includes('text/html');

  if (isHtmlNavigation) {
    // در مرورگرهای موبایل (iOS Safari / Chrome Android)، پاس دادن شیء Request با mode='navigate'
    // همراه با { cache: 'no-store' } خطای TypeError ایجاد می‌کرد و باعث بازگشت به کش قدیمی می‌شد!
    // بنابراین همیشه با رشته URL مستقل و پارامتر زمان روز، مستقیم از شبکه دریافت می‌کنیم.
    const freshHtmlUrl = new URL('./index.html', self.location.href);
    freshHtmlUrl.searchParams.set('_sw_t', String(Date.now()));

    event.respondWith(
      fetch(freshHtmlUrl.toString(), { cache: 'no-store', credentials: 'same-origin' })
        .then((networkResp) => {
          if (networkResp && networkResp.status === 200) {
            const copy = networkResp.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put('./index.html', copy).catch(() => {});
            });
          }
          return networkResp;
        })
        .catch(() =>
          caches.match('./index.html').then((res) => res || caches.match(event.request))
        )
    );
    return;
  }

  // برای فایل‌های JS و CSS و استاتیک، استفاده از رشته reqUrl.toString() برای جلوگیری از خطای RequestInit در موبایل
  event.respondWith(
    fetch(reqUrl.toString(), { cache: 'no-store', credentials: 'same-origin' })
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone).catch(() => {});
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});

