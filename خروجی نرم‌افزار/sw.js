// Service Worker اختصاصی سامانه اصلی مرکز اسناد (مسیر /book/)
// نسخه کش ایزوله و اتمیک: markaz-asnad-main-book-v15

const CACHE_PREFIX = 'markaz-asnad-main-book-';
const LEGACY_CACHE_PREFIX = 'markaz-asnad-pwa-';
const CACHE_NAME = `${CACHE_PREFIX}v15`;

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

function normalizeRelativeAssetUrl(rawUrl) {
  if (!rawUrl) return null;
  const trimmed = String(rawUrl).trim();
  if (!trimmed || /^https?:|^data:|^blob:/i.test(trimmed)) return null;
  const withoutQuery = trimmed.split('?')[0].split('#')[0];
  if (withoutQuery.startsWith('./')) return withoutQuery;
  if (withoutQuery.startsWith('/')) return `.${withoutQuery}`;
  return `./${withoutQuery}`;
}

function collectAppShellAssets(htmlText, cssTexts = []) {
  const discovered = new Set(PRECACHE_ASSETS);

  const htmlMatches = [
    ...Array.from(htmlText.matchAll(/(?:src|href)=["']([^"']*\/assets\/[^"']+\.(?:m?js|css|woff2))["']/gi))
  ];

  for (const match of htmlMatches) {
    const normalized = normalizeRelativeAssetUrl(match[1]);
    if (normalized) {
      discovered.add(normalized);
    }
  }

  for (const cssText of cssTexts) {
    const cssFontMatches = Array.from(
      cssText.matchAll(/url\(\s*["']?([^"')]+Vazirmatn[^"')]+\.woff2)["']?\s*\)/gi)
    );
    for (const fm of cssFontMatches) {
      const rawFontPath = fm[1] || '';
      if (rawFontPath.startsWith('./') && !rawFontPath.startsWith('./assets/') && !rawFontPath.startsWith('./fonts/')) {
        discovered.add(`./assets/${rawFontPath.slice(2)}`);
      } else {
        const normalized = normalizeRelativeAssetUrl(rawFontPath);
        if (normalized) discovered.add(normalized);
      }
    }
  }

  return Array.from(discovered);
}

async function installAppShellAtomically() {
  const cache = await caches.open(CACHE_NAME);
  try {
    const htmlResp = await fetch('./index.html', {
      cache: 'no-cache',
      credentials: 'same-origin'
    });
    if (!htmlResp || !htmlResp.ok) {
      throw new Error(`Failed to fetch index.html (${htmlResp ? htmlResp.status : 'network error'})`);
    }
    const htmlText = await htmlResp.clone().text();
    if (!htmlText || !htmlText.includes('id="root"')) {
      throw new Error('Fetched index.html is empty or invalid');
    }

    const initialAssets = collectAppShellAssets(htmlText, []);
    const cssUrls = initialAssets.filter((item) => item.endsWith('.css'));
    const cssTexts = [];

    for (const cssUrl of cssUrls) {
      const cssResp = await fetch(cssUrl, {
        cache: 'no-cache',
        credentials: 'same-origin'
      });
      if (!cssResp || !cssResp.ok) {
        throw new Error(`Failed to fetch required CSS bundle: ${cssUrl}`);
      }
      cssTexts.push(await cssResp.text());
    }

    const appShellAssets = collectAppShellAssets(htmlText, cssTexts);
    await cache.addAll(appShellAssets);

    // راستی‌آزمایی وجود تمام منابع ضروری در کش نسخه جدید پیش از اجازه تکمیل نصب
    for (const asset of appShellAssets) {
      const verifyMatch = await cache.match(asset, { ignoreSearch: true });
      if (!verifyMatch || !verifyMatch.ok) {
        throw new Error(`Verification failed for precached asset: ${asset}`);
      }
    }

    // فقط در اولین نصب که هیچ کنترل‌کننده فعالی وجود ندارد، بلافاصله آماده فعال‌سازی شود
    if (!self.registration.active) {
      await self.skipWaiting();
    }
  } catch (error) {
    // در صورت شکست دریافت حتی یک فایل ضروری، فقط کش ناقص همین نسخه جدید حذف می‌شود و کش نسخه قبلی دست‌نخورده می‌ماند
    await caches.delete(CACHE_NAME).catch(() => {});
    throw error;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(installAppShellAtomically());
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
              (key.startsWith(CACHE_PREFIX) || key.startsWith(LEGACY_CACHE_PREFIX)) &&
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

  // حفظ استقلال کامل زیربرنامه پژوهش (/library-research/)
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

  // درخواست‌های بررسی و دریافت نسخه جدید که توسط کلید بروزرسانی دستی ارسال می‌شوند مستقیم از شبکه عبور کنند
  if (reqUrl.searchParams.get('_manual_github_sync') === '1') {
    return;
  }

  const isHtmlNavigation =
    event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') || '').includes('text/html');

  // ۱. پاسخ‌دهی به درخواست صفحه اصلی (HTML) منحصراً از کش اختصاصی نسخه فعال (CACHE_NAME)
  if (isHtmlNavigation) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (activeCache) => {
        const cachedHtml =
          (await activeCache.match('./index.html', { ignoreSearch: true })) ||
          (await activeCache.match(event.request, { ignoreSearch: true }));
        if (cachedHtml) {
          return cachedHtml;
        }

        const networkResp = await fetch(event.request);
        if (networkResp && networkResp.status === 200) {
          await activeCache.put('./index.html', networkResp.clone()).catch(() => {});
        }
        return networkResp;
      })
    );
    return;
  }

  // ۲. پاسخ‌دهی به فایل‌های برنامه (JS، CSS، فونت، تصاویر و داده‌های مرجع /data/)
  // منحصراً از کش اختصاصی نسخه فعال (CACHE_NAME) بدون جست‌وجوی سراسری در کش‌های قدیمی
  event.respondWith(
    caches.open(CACHE_NAME).then(async (activeCache) => {
      const cachedResp = await activeCache.match(event.request, { ignoreSearch: true });
      if (cachedResp) {
        return cachedResp;
      }

      const netResp = await fetch(event.request);
      if (netResp && netResp.status === 200) {
        await activeCache.put(event.request, netResp.clone()).catch(() => {});
      }
      return netResp;
    })
  );
});
