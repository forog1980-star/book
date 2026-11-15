// Service Worker اختصاصی سامانه اصلی مرکز اسناد (مسیر /book/)
// نسخه کش ایزوله و اتمیک: markaz-asnad-main-book-v15

const CACHE_PREFIX = 'markaz-asnad-main-book-';
const LEGACY_CACHE_PREFIX = 'markaz-asnad-pwa-';
const CACHE_NAME = `${CACHE_PREFIX}v15`;

// کش کنترلی و پایدار اختصاصی جهت ذخیره قفل عملیات و پیوند هویت تب‌ها در برابر Restart شدن Worker
const CONTROL_CACHE_NAME = 'markaz-asnad-sw-control-v1';
const LOCK_STORAGE_KEY = 'https://markaz-asnad.internal/__sw_operation_lock.json';
const ACTIVE_VERSION_STORAGE_KEY = 'https://markaz-asnad.internal/__sw_active_version.json';

// پیوند هویت هر تب (clientId) به نسخه اختصاصی آن جهت تضمین ایزولاسیون کامل در حالت Multi-Tab
const tabAffinityMap = new Map();

// صف ترتیبی اجرای پیام‌های قفل در Worker جهت رفع محدودیت عدم اتمیک بودن CacheStorage
let lockMutexQueue = Promise.resolve();
function withLockMutex(fn) {
  const next = lockMutexQueue.then(fn, fn);
  lockMutexQueue = next.then(
    () => {},
    () => {}
  );
  return next;
}

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

async function getPersistedLock() {
  try {
    const cache = await caches.open(CONTROL_CACHE_NAME);
    const resp = await cache.match(LOCK_STORAGE_KEY);
    if (!resp || !resp.ok) return null;
    const data = await resp.json();
    if (!data || typeof data !== 'object') return null;
    if (Date.now() > data.expiresAt) {
      await cache.delete(LOCK_STORAGE_KEY).catch(() => {});
      if (data.candidateCacheName) {
        await caches.delete(data.candidateCacheName).catch(() => {});
      }
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

async function savePersistedLock(lockData) {
  try {
    const cache = await caches.open(CONTROL_CACHE_NAME);
    await cache.put(
      new Request(LOCK_STORAGE_KEY),
      new Response(JSON.stringify(lockData), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      })
    );
  } catch {}
}

async function clearPersistedLock() {
  try {
    const cache = await caches.open(CONTROL_CACHE_NAME);
    await cache.delete(LOCK_STORAGE_KEY).catch(() => {});
  } catch {}
}

async function getActiveWorkingCacheName() {
  try {
    const cache = await caches.open(CONTROL_CACHE_NAME);
    const resp = await cache.match(ACTIVE_VERSION_STORAGE_KEY);
    if (resp && resp.ok) {
      const data = await resp.json();
      if (data && data.activeCacheName) {
        return data.activeCacheName;
      }
    }
  } catch {}
  return CACHE_NAME;
}

async function setActiveWorkingCacheName(newName) {
  try {
    const cache = await caches.open(CONTROL_CACHE_NAME);
    await cache.put(
      new Request(ACTIVE_VERSION_STORAGE_KEY),
      new Response(JSON.stringify({ activeCacheName: newName, updatedAt: Date.now() }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      })
    );
  } catch {}
}

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
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  // پروتکل مدیریت انحصاری قفل و لایف‌سایکل کش چندتبی
  if (data.type === 'BEGIN_UPDATE_OPERATION') {
    event.waitUntil(
      withLockMutex(async () => {
        const port = event.ports && event.ports[0];
        try {
          const currentLock = await getPersistedLock();
          if (currentLock && currentLock.operationId !== data.operationId) {
            if (port) {
              port.postMessage({
                ok: false,
                error: 'UPDATE_IN_PROGRESS',
                holderTabId: currentLock.holderTabId,
                remainingMs: Math.max(0, currentLock.expiresAt - Date.now())
              });
            }
            return;
          }

          const currentActive = await getActiveWorkingCacheName();
          if (data.expectedActiveCacheName && data.expectedActiveCacheName !== currentActive) {
            if (port) {
              port.postMessage({
                ok: false,
                error: 'VERSION_MISMATCH',
                currentActive
              });
            }
            return;
          }

          const leaseMs = Number(data.leaseDurationMs) || 25000;
          const candidateCacheName = `${CACHE_PREFIX}candidate-${data.operationId}`;
          const newLock = {
            operationId: data.operationId,
            holderTabId: data.tabId || 'unknown-client',
            candidateCacheName,
            expectedActiveCacheName: currentActive,
            epoch: (currentLock ? currentLock.epoch + 1 : 1),
            acquiredAt: Date.now(),
            expiresAt: Date.now() + leaseMs,
            leaseDurationMs: leaseMs
          };

          await savePersistedLock(newLock);

          if (port) {
            port.postMessage({
              ok: true,
              operationId: data.operationId,
              candidateCacheName
            });
          }
        } catch (err) {
          if (port) port.postMessage({ ok: false, error: String(err) });
        }
      })
    );
    return;
  }

  if (data.type === 'RENEW_UPDATE_LEASE') {
    event.waitUntil(
      withLockMutex(async () => {
        const port = event.ports && event.ports[0];
        try {
          const currentLock = await getPersistedLock();
          if (!currentLock || currentLock.operationId !== data.operationId) {
            if (port) port.postMessage({ ok: false, error: 'LOCK_NOT_FOUND' });
            return;
          }
          const addMs = Number(data.additionalMs) || 20000;
          currentLock.expiresAt = Date.now() + addMs;
          currentLock.epoch += 1;
          await savePersistedLock(currentLock);
          if (port) port.postMessage({ ok: true, expiresAt: currentLock.expiresAt });
        } catch (err) {
          if (port) port.postMessage({ ok: false, error: String(err) });
        }
      })
    );
    return;
  }

  if (data.type === 'RELEASE_UPDATE_OPERATION') {
    event.waitUntil(
      withLockMutex(async () => {
        const port = event.ports && event.ports[0];
        try {
          const currentLock = await getPersistedLock();
          if (currentLock && currentLock.operationId === data.operationId) {
            await clearPersistedLock();
            if (data.cleanupCandidate && currentLock.candidateCacheName) {
              await caches.delete(currentLock.candidateCacheName).catch(() => {});
            }
          }
          if (port) port.postMessage({ ok: true });
        } catch (err) {
          if (port) port.postMessage({ ok: false, error: String(err) });
        }
      })
    );
    return;
  }

  if (data.type === 'COMMIT_ACTIVE_CACHE') {
    event.waitUntil(
      withLockMutex(async () => {
        const port = event.ports && event.ports[0];
        try {
          const newCache = data.newCacheName || CACHE_NAME;
          await setActiveWorkingCacheName(newCache);
          await clearPersistedLock();
          if (port) port.postMessage({ ok: true, activeCacheName: newCache });
        } catch (err) {
          if (port) port.postMessage({ ok: false, error: String(err) });
        }
      })
    );
    return;
  }

  if (data.type === 'ROLLBACK_ACTIVE_CACHE') {
    event.waitUntil(
      withLockMutex(async () => {
        const port = event.ports && event.ports[0];
        try {
          const rollbackCache = data.rollbackCacheName || CACHE_NAME;
          await setActiveWorkingCacheName(rollbackCache);
          await clearPersistedLock();
          if (port) port.postMessage({ ok: true, activeCacheName: rollbackCache });
        } catch (err) {
          if (port) port.postMessage({ ok: false, error: String(err) });
        }
      })
    );
    return;
  }

  if (data.type === 'GET_SW_STATUS') {
    event.waitUntil(
      (async () => {
        const port = event.ports && event.ports[0];
        try {
          const activeWorking = await getActiveWorkingCacheName();
          const lock = await getPersistedLock();
          if (port) {
            port.postMessage({
              ok: true,
              activeCacheName: activeWorking,
              lockActive: Boolean(lock),
              lockHolder: lock ? lock.holderTabId : null
            });
          }
        } catch (err) {
          if (port) port.postMessage({ ok: false, error: String(err) });
        }
      })()
    );
    return;
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const activeWorking = await getActiveWorkingCacheName();
      const allKeys = await caches.keys();
      const activeClients = await self.clients.matchAll({ type: 'window' });

      // پین کردن کش‌های در حال استفاده توسط تب‌های فعال
      const inUseCaches = new Set();
      inUseCaches.add(activeWorking);
      inUseCaches.add(CACHE_NAME);
      inUseCaches.add(CONTROL_CACHE_NAME);

      for (const client of activeClients) {
        const bound = tabAffinityMap.get(client.id);
        if (bound) inUseCaches.add(bound);
      }

      // حذف ایمن فقط کش‌های غیرفعال و بدون کلاینت متصل
      await Promise.all(
        allKeys.map((key) => {
          if (
            (key.startsWith(CACHE_PREFIX) || key.startsWith(LEGACY_CACHE_PREFIX)) &&
            !inUseCaches.has(key)
          ) {
            return caches.delete(key);
          }
          return Promise.resolve(false);
        })
      );

      await self.clients.claim();
    })()
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

  // تفکیک شناسه کلاینت: در درخواست‌های Navigation مقدار resultingClientId معتبر است
  const clientId = event.resultingClientId || event.clientId;

  const isHtmlNavigation =
    event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') || '').includes('text/html');

  // ۱. پاسخ‌دهی به درخواست صفحه اصلی (HTML) با رعایت پیوند نسخه هر تب
  if (isHtmlNavigation) {
    event.respondWith(
      (async () => {
        const currentActive = await getActiveWorkingCacheName();
        // اتصال هویت این تب جدید یا بارگذاری‌شده به نسخه فعال جاری
        if (clientId) {
          tabAffinityMap.set(clientId, currentActive);
        }
        const activeCache = await caches.open(currentActive);
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
      })()
    );
    return;
  }

  // ۲. پاسخ‌دهی به فایل‌های برنامه (JS، CSS، فونت، تصاویر و داده‌های مرجع /data/)
  // منحصراً از کش نسخه اختصاصی و پیوندخورده به تب درخواست‌دهنده (Multi-Tab Version Pinning)
  event.respondWith(
    (async () => {
      const currentActive = await getActiveWorkingCacheName();
      const boundCacheName = (clientId && tabAffinityMap.get(clientId)) || currentActive;
      const targetCache = await caches.open(boundCacheName);
      const cachedResp = await targetCache.match(event.request, { ignoreSearch: true });
      if (cachedResp) {
        return cachedResp;
      }

      const netResp = await fetch(event.request);
      if (netResp && netResp.status === 200) {
        await targetCache.put(event.request, netResp.clone()).catch(() => {});
      }
      return netResp;
    })()
  );
});
