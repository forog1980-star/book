// Service Worker اختصاصی سامانه اصلی مرکز اسناد (مسیر /book/)
// معماری ۱۰۰٪ آفلاین‌پایه (Strictly Cache-First):
// در حالت عادی هیچ ارتباطی با گیت‌هاب و اینترنت برقرار نمی‌شود و تمام فایل‌های برنامه، فونت‌ها و بانک‌های اطلاعاتی مستقیماً از حافظه داخلی دستگاه اجرا می‌شوند.
// تنها در زمان فشردن کلید «همگام‌سازی دستی با گیت‌هاب» (_manual_github_sync=1) فایل‌های جدید از گیت‌هاب دریافت و جایگزین کش می‌شوند.

const CACHE_NAME = 'markaz-asnad-main-book-v14';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './golzar-logo.png',
  './icon.svg',
  './apple-touch-icon.png',
  './pwa-192x192.png',
  './pwa-512x512.png',
  './fonts/Vazirmatn-variable.woff2',
  './data/library_books.json',
  './data/golzar_martyrs.xlsx',
  './data/sooreh_mehr_book_martyr_research.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // ۱. ذخیره فایل‌های پایه و بانک‌های اطلاعاتی
      for (const asset of PRECACHE_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn('SW Precache item warning:', asset, err);
        }
      }

      // ۲. شناسایی و پیش‌ذخیره خودکار باندل‌های JS و CSS از روی index.html
      try {
        const indexResp = await cache.match('./index.html') || await fetch('./index.html');
        if (indexResp && indexResp.ok) {
          const htmlText = await indexResp.clone().text();
          const bundleMatches = [
            ...Array.from(htmlText.matchAll(/src=["']([^"']*\/assets\/[^"']+\.js)["']/g)),
            ...Array.from(htmlText.matchAll(/href=["']([^"']*\/assets\/[^"']+\.css)["']/g))
          ];
          for (const match of bundleMatches) {
            if (match[1]) {
              try {
                await cache.add(match[1]);
              } catch {
                // ignore individual bundle error
              }
            }
          }
        }
      } catch {
        // ignore if offline during install
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
          keys.map((key) => {
            if (
              (key.startsWith('markaz-asnad-main-book-') || key.startsWith('markaz-asnad-pwa-')) &&
              key !== CACHE_NAME
            ) {
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

  // عدم مداخله در درخواست‌های خارج از دامنه
  if (reqUrl.origin !== self.location.origin) {
    return;
  }

  // عدم مداخله در زیربرنامه مستقل /library-research/
  if (reqUrl.pathname.includes('/library-research/')) {
    return;
  }

  // عدم مداخله در محیط توسعه Vite
  if (
    reqUrl.pathname.startsWith('/src/') ||
    reqUrl.pathname.startsWith('/node_modules/') ||
    reqUrl.pathname.startsWith('/@')
  ) {
    return;
  }

  // اگر کاربر صراحتاً دکمه «همگام‌سازی و بروزرسانی از گیت‌هاب» را زده است، مستقیم از شبکه دریافت شود
  if (reqUrl.searchParams.get('_manual_github_sync') === '1') {
    return;
  }

  const isHtmlNavigation =
    event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') || '').includes('text/html');

  // ۱. برای باز شدن صفحه اصلی (HTML): اولویت ۱۰۰٪ با حافظه آفلاین (بدون منتظر ماندن برای گیت‌هاب)
  if (isHtmlNavigation) {
    event.respondWith(
      caches
        .match('./index.html')
        .then((cachedHtml) => {
          if (cachedHtml) {
            return cachedHtml;
          }
          return caches.match(event.request);
        })
        .then((matched) => {
          if (matched) {
            return matched;
          }
          // فقط در اولین بار نصب که هنوز کش خالی است از شبکه می‌گیرد و در کش قفل می‌کند
          return fetch(event.request).then((networkResp) => {
            if (networkResp && networkResp.status === 200) {
              const copy = networkResp.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put('./index.html', copy).catch(() => {});
              });
            }
            return networkResp;
          });
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // ۲. برای تمام فایل‌های برنامه (JS، CSS، فونت‌ها، تصاویر و فایل‌های داده /data/):
  // اولویت ۱۰۰٪ با حافظه داخلی دستگاه (Strictly Cache-First) بدون ارسال درخواست به اینترنت و گیت‌هاب
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResp) => {
      if (cachedResp) {
        return cachedResp;
      }
      return fetch(event.request).then((netResp) => {
        if (netResp && netResp.status === 200) {
          const copy = netResp.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, copy).catch(() => {});
          });
        }
        return netResp;
      });
    })
  );
});
