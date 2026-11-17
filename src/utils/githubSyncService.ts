export const OFFLINE_SW_CACHE_NAME = 'markaz-asnad-main-book-v18';
export const OFFLINE_SW_SCRIPT_URL = './sw.js?v=18';
export const OFFLINE_SW_VERSION_LABEL = 'v18';
export const LAST_GITHUB_SYNC_STORAGE_KEY = 'markaz_last_github_sync_fa';

export interface GitHubSyncResult {
  ok: boolean;
  status: 'updated' | 'up_to_date' | 'offline' | 'failed';
  shouldReload: boolean;
  message: string;
  updatedBundle?: string;
  syncedAtFa?: string;
}

/**
 * بررسی وضعیت اتصال اینترنت پیش از باز کردن لینک‌های جست‌وجوی اینترنتی بیرونی (گوگل، خانه کتاب، کتابخانه ملی و...)
 * اگر اینترنت قطع باشد، از باز شدن صفحه خطای مرورگر جلوگیری کرده و پیام هشدار واضح به کاربر نمایش می‌دهد.
 */
export function guardExternalInternetSearch(
  e: { preventDefault: () => void },
  portalName: string,
  onNotify?: (message: string, type?: 'success' | 'warning') => void,
  onAllowed?: () => void
): boolean {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (!isOnline) {
    e.preventDefault();
    if (onNotify) {
      onNotify(
        `⚠️ اتصال اینترنت برقرار نیست! برای جست‌وجوی آنلاین در «${portalName}» لطفاً ابتدا اینترنت دستگاه را روشن کنید. (جست‌وجوهای داخلی نرم‌افزار بدون اینترنت فعال هستند)`,
        'warning'
      );
    }
    return false;
  }

  if (onAllowed) {
    onAllowed();
  }
  return true;
}

export function formatExactShamsiDateTimeFa(date: Date = new Date()): string {
  const datePart = new Intl.DateTimeFormat('fa-IR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
  const timePart = new Intl.DateTimeFormat('fa-IR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
  return `${datePart} — ساعت ${timePart}`;
}

export function getLastGitHubSyncTimeFa(): string {
  try {
    const saved = localStorage.getItem(LAST_GITHUB_SYNC_STORAGE_KEY);
    if (saved && saved !== 'ثبت‌نشده') {
      return saved;
    }
    const initialStamp = formatExactShamsiDateTimeFa(new Date());
    localStorage.setItem(LAST_GITHUB_SYNC_STORAGE_KEY, initialStamp);
    return initialStamp;
  } catch {
    return formatExactShamsiDateTimeFa(new Date());
  }
}

function normalizeRelativeUrl(rawUrl: string): string | null {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed || /^https?:|^data:|^blob:/i.test(trimmed)) return null;
  const clean = trimmed.split('?')[0].split('#')[0];
  if (clean.startsWith('./')) return clean;
  if (clean.startsWith('/')) return `.${clean}`;
  return `./${clean}`;
}

function getCurrentlyLoadedBundles(): { jsBundle: string; cssBundle: string } {
  let jsBundle = '';
  let cssBundle = '';
  if (typeof document === 'undefined') return { jsBundle, cssBundle };

  const scripts = Array.from(document.querySelectorAll('script[type="module"][src]'));
  for (const s of scripts) {
    const src = s.getAttribute('src') || '';
    if (src.includes('/assets/')) {
      jsBundle = src.split('?')[0].split('/').pop() || '';
      break;
    }
  }

  const links = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'));
  for (const l of links) {
    const href = l.getAttribute('href') || '';
    if (href.includes('/assets/')) {
      cssBundle = href.split('?')[0].split('/').pop() || '';
      break;
    }
  }

  return { jsBundle, cssBundle };
}

export function getCurrentOfflineCoreInfo(): {
  cacheVersion: string;
  jsBundle: string;
  cssBundle: string;
} {
  const { jsBundle, cssBundle } = getCurrentlyLoadedBundles();
  return {
    cacheVersion: OFFLINE_SW_VERSION_LABEL,
    jsBundle: jsBundle || 'dev-live',
    cssBundle: cssBundle || 'dev-live'
  };
}

/**
 * بازخوانی قطعی برنامه پس از بروزرسانی روی موبایل و PWA با دور زدن bfcache/HTTP کش مرورگر
 */
export function forceCleanAppReload(): void {
  try {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('_sw_sync', String(Date.now()));
    window.location.replace(nextUrl.toString());
  } catch {
    window.location.reload();
  }
}

async function resolveAppBaseUrl(): Promise<string> {
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.scope) {
        return reg.scope.endsWith('/') ? reg.scope : `${reg.scope}/`;
      }
    }
  } catch {
    // fallback below
  }
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  if (url.pathname.endsWith('/index.html')) {
    url.pathname = url.pathname.slice(0, -'index.html'.length);
  } else if (!url.pathname.endsWith('/')) {
    url.pathname = `${url.pathname}/`;
  }
  return url.toString();
}

async function sendSwMessage<T = any>(
  worker: ServiceWorker | null | undefined,
  message: any,
  timeoutMs = 7000
): Promise<T | null> {
  if (!worker) return null;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => resolve(null), timeoutMs);
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timer);
      resolve(event.data);
    };
    try {
      worker.postMessage(message, [channel.port2]);
    } catch {
      window.clearTimeout(timer);
      resolve(null);
    }
  });
}

async function waitForInstallingWorker(worker: ServiceWorker, timeoutMs = 90000): Promise<boolean> {
  if (worker.state === 'installed' || worker.state === 'activated') {
    return true;
  }
  if (worker.state === 'redundant') {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    const timer = window.setTimeout(() => {
      worker.removeEventListener('statechange', onStateChange);
      resolve(false);
    }, timeoutMs);

    const onStateChange = () => {
      if (worker.state === 'installed' || worker.state === 'activated') {
        window.clearTimeout(timer);
        worker.removeEventListener('statechange', onStateChange);
        resolve(true);
      } else if (worker.state === 'redundant') {
        window.clearTimeout(timer);
        worker.removeEventListener('statechange', onStateChange);
        resolve(false);
      }
    };

    worker.addEventListener('statechange', onStateChange);
  });
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  workerFn: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await workerFn(items[idx]);
    }
  });
  await Promise.all(workers);
}

/**
 * اعتبارسنجی ساختاری و معنایی فایل‌های داده مرجع بدون وابستگی به هش هاردکد شده
 * با این سازوکار، تغییرات متداول کتب و اسناد نیازمند دستکاری دستی کدهای برنامه نیست
 */
function validateDataAssetSemantics(relUrl: string, bytes: ArrayBuffer): boolean {
  if (!bytes || bytes.byteLength === 0) return false;

  if (relUrl.endsWith('library_books.json')) {
    try {
      const text = new TextDecoder('utf-8').decode(bytes);
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        if (
          parsed.format === 'markaz-asnad-library-workbook-json' &&
          Array.isArray(parsed.sheets) &&
          parsed.sheets.length >= 3
        ) {
          return true;
        }
        if (Array.isArray(parsed.sheets) && parsed.sheets.length > 0) {
          return true;
        }
        if (Array.isArray(parsed.books) && parsed.books.length > 0) {
          return true;
        }
      }
      if (Array.isArray(parsed) && parsed.length > 0) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  if (relUrl.endsWith('golzar_martyrs.xlsx')) {
    if (bytes.byteLength < 500000) return false;
    const header = new Uint8Array(bytes.slice(0, 4));
    return header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04;
  }

  if (relUrl.endsWith('sooreh_mehr_book_martyr_research.json')) {
    try {
      const text = new TextDecoder('utf-8').decode(bytes);
      const parsed = JSON.parse(text);
      return Boolean(parsed && typeof parsed === 'object');
    } catch {
      return false;
    }
  }

  if (relUrl.endsWith('golzarteh_index.json')) {
    try {
      const text = new TextDecoder('utf-8').decode(bytes);
      const parsed = JSON.parse(text);
      return Boolean(parsed && typeof parsed === 'object' && Array.isArray(parsed.rows));
    } catch {
      return false;
    }
  }

  if (relUrl.endsWith('golzarteh_profiles.json')) {
    try {
      const text = new TextDecoder('utf-8').decode(bytes);
      const parsed = JSON.parse(text);
      return Boolean(parsed && typeof parsed === 'object' && parsed.profilesByGid && typeof parsed.profilesByGid === 'object');
    } catch {
      return false;
    }
  }

  if (relUrl.endsWith('.xlsx')) {
    if (bytes.byteLength < 10000) return false;
    const header = new Uint8Array(bytes.slice(0, 4));
    return header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04;
  }

  return true;
}

async function fetchAndVerifyPackageInMemory(
  appBaseUrl: string,
  signal: AbortSignal,
  onProgress?: (stepMessage: string) => void
): Promise<{
  htmlText: string;
  serverJsBundle: string;
  serverCssBundle: string;
  isViteDevMode: boolean;
  verifiedResponses: Map<string, { bytes: ArrayBuffer; contentType: string }>;
}> {
  const checkUrl = new URL('./index.html', appBaseUrl);
  checkUrl.searchParams.set('_manual_github_sync', '1');
  checkUrl.searchParams.set('_t', String(Date.now()));

  const htmlResponse = await fetch(checkUrl.toString(), {
    cache: 'no-store',
    credentials: 'same-origin',
    signal
  });

  if (!htmlResponse.ok) {
    throw new Error(`دریافت اطلاعات از سرور ناموفق بود (کد وضعیت: ${htmlResponse.status})`);
  }

  const htmlText = await htmlResponse.text();
  if (!htmlText || !htmlText.includes('id="root"')) {
    throw new Error('پاسخ دریافتی از سرور معتبر نیست');
  }

  const scriptMatches = Array.from(
    htmlText.matchAll(/src=["']([^"']*\/assets\/[^"']+\.m?js)["']/gi)
  );
  const preloadAndFontMatches = Array.from(
    htmlText.matchAll(/href=["']([^"']*\/assets\/[^"']+\.(?:m?js|woff2))["']/gi)
  );
  const styleMatches = Array.from(
    htmlText.matchAll(/href=["']([^"']*\/assets\/[^"']+\.css)["']/gi)
  );

  let serverJsBundle = '';
  let serverCssBundle = '';

  for (const m of scriptMatches) {
    const norm = normalizeRelativeUrl(m[1]);
    if (norm) serverJsBundle = norm.split('/').pop() || '';
  }
  for (const m of styleMatches) {
    const norm = normalizeRelativeUrl(m[1]);
    if (norm) serverCssBundle = norm.split('/').pop() || '';
  }

  const { jsBundle: currentJsBundle } = getCurrentlyLoadedBundles();
  const isViteDevMode = !currentJsBundle && !serverJsBundle && htmlText.includes('/src/main.tsx');
  if (isViteDevMode) {
    return {
      htmlText,
      serverJsBundle: 'dev-live',
      serverCssBundle: 'dev-live',
      isViteDevMode: true,
      verifiedResponses: new Map()
    };
  }

  if (currentJsBundle && (!serverJsBundle || !serverCssBundle)) {
    throw new Error('فایل‌های اجرایی نسخه جدید در پاسخ سرور یافت نشد');
  }

  const requiredShellUrls = new Set<string>([
    './manifest.webmanifest',
    './golzar-logo.png',
    './icon.svg',
    './apple-touch-icon.png',
    './pwa-192x192.png',
    './pwa-512x512.png',
    './fonts/Vazirmatn-variable.woff2',
    './data/library_books.json',
    './data/golzar_martyrs.xlsx',
    './data/sooreh_mehr_book_martyr_research.json',
    './data/golzarteh_index.json',
    './data/golzarteh_profiles.json'
  ]);

  for (const m of scriptMatches) {
    const norm = normalizeRelativeUrl(m[1]);
    if (norm) requiredShellUrls.add(norm);
  }
  for (const m of preloadAndFontMatches) {
    const norm = normalizeRelativeUrl(m[1]);
    if (norm) requiredShellUrls.add(norm);
  }
  for (const m of styleMatches) {
    const norm = normalizeRelativeUrl(m[1]);
    if (norm) requiredShellUrls.add(norm);
  }

  const verifiedResponses = new Map<string, { bytes: ArrayBuffer; contentType: string }>();
  const urlList = Array.from(requiredShellUrls);
  const totalFiles = urlList.length;
  let completedFiles = 0;

  // دانلود موازی در دسته‌های ۴تایی جهت جلوگیری از Timeout روی اینترنت گوشی
  await runWithConcurrency(urlList, 4, async (relUrl) => {
    const fetchUrl = new URL(relUrl, appBaseUrl);
    fetchUrl.searchParams.set('_manual_github_sync', '1');
    fetchUrl.searchParams.set('_t', String(Date.now()));

    const resp = await fetch(fetchUrl.toString(), {
      cache: 'no-store',
      credentials: 'same-origin',
      signal
    });

    if (!resp.ok) {
      throw new Error(`خطا در دریافت فایل ضروری ${relUrl} (وضعیت ${resp.status})`);
    }

    const bytes = await resp.arrayBuffer();
    if (!bytes || bytes.byteLength === 0) {
      throw new Error(`فایل ضروری ${relUrl} خالی است`);
    }

    if (!validateDataAssetSemantics(relUrl, bytes)) {
      throw new Error(`ساختار فایل داده ${relUrl} نامعتبر یا ناقص است`);
    }

    const contentType = resp.headers.get('Content-Type') || '';
    verifiedResponses.set(relUrl, { bytes, contentType });
    completedFiles++;
    const shortLabel = relUrl.split('/').pop() || relUrl;
    onProgress?.(`در حال دریافت نسخه جدید: ${shortLabel} (${completedFiles}/${totalFiles})...`);

    if (relUrl.endsWith('.css')) {
      const cssText = new TextDecoder('utf-8').decode(bytes);
      const fontMatches = Array.from(
        cssText.matchAll(/url\(\s*["']?([^"')]+Vazirmatn[^"')]+\.woff2)["']?\s*\)/gi)
      );
      for (const fm of fontMatches) {
        const rawFont = fm[1] || '';
        const fontRelUrl =
          rawFont.startsWith('./') && !rawFont.startsWith('./assets/') && !rawFont.startsWith('./fonts/')
            ? `./assets/${rawFont.slice(2)}`
            : normalizeRelativeUrl(rawFont);

        if (fontRelUrl && !verifiedResponses.has(fontRelUrl)) {
          const fUrl = new URL(fontRelUrl, appBaseUrl);
          fUrl.searchParams.set('_manual_github_sync', '1');
          fUrl.searchParams.set('_t', String(Date.now()));
          const fResp = await fetch(fUrl.toString(), {
            cache: 'no-store',
            credentials: 'same-origin',
            signal
          });
          if (!fResp.ok) {
            throw new Error(`خطا در دریافت فونت نسخه جدید (${fontRelUrl})`);
          }
          const fBytes = await fResp.arrayBuffer();
          if (!fBytes || fBytes.byteLength === 0) {
            throw new Error(`فایل فونت ${fontRelUrl} خالی است`);
          }
          verifiedResponses.set(fontRelUrl, {
            bytes: fBytes,
            contentType: fResp.headers.get('Content-Type') || 'font/woff2'
          });
        }
      }
    }
  });

  return {
    htmlText,
    serverJsBundle,
    serverCssBundle,
    isViteDevMode: false,
    verifiedResponses
  };
}

/**
 * به‌روزرسانی دستی، اتمیک و ایمن از گیت‌هاب با رعایت پروتکل قفل چندتبی و اعتبارسنجی پس از فینالایز:
 * ۱. رزرو قفل انحصاری عملیات (BEGIN_UPDATE_OPERATION) در Service Worker با شناسه یکتا و قابلیت تمدید Lease
 * ۲. دریافت موازی و اعتبارسنجی ۱۰۰٪ دارایی‌ها در کش کاندید موقت ایزوله (بدون دستکاری کش فعال فعلی)
 * ۳. انتقال اتمیک به کش نسخه جدید با مُهر تایید زمانی جهت جلوگیری از دانلود مجدد در Service Worker
 * ۴. همگام‌سازی قطعی کنترل‌کننده Service Worker و آزادسازی پیوند تب جهت بارگذاری فوری نسخه جدید
 */
export async function performManualGitHubSync(
  onProgress?: (stepMessage: string) => void
): Promise<GitHubSyncResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: false,
      status: 'offline',
      shouldReload: false,
      message:
        '⚠️ اینترنت دستگاه قطع است. برای بررسی و دریافت نسخه جدید از گیت‌هاب، ابتدا اینترنت را وصل کنید.'
    };
  }

  // افزایش مهلت به ۱۸۰ ثانیه برای سازگاری کامل با اینترنت موبایل
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 180000);
  const operationId = `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tabId = `tab_${Math.random().toString(36).slice(2, 10)}`;
  let stagingCacheName = `${OFFLINE_SW_CACHE_NAME}-staging-${Date.now()}`;
  let lockAcquired = false;
  let heartbeatTimer: number | null = null;
  let swTargetWorker: ServiceWorker | null = null;

  try {
    const appBaseUrl = await resolveAppBaseUrl();

    // مرحله ۰: رزرو قفل انحصاری عملیات در Service Worker پیش از شروع واکشی منابع
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      swTargetWorker = reg?.active || reg?.waiting || reg?.installing || navigator.serviceWorker.controller;
      if (swTargetWorker) {
        const lockRes = await sendSwMessage<{
          ok: boolean;
          error?: string;
          candidateCacheName?: string;
        }>(swTargetWorker, {
          type: 'BEGIN_UPDATE_OPERATION',
          operationId,
          tabId,
          expectedActiveCacheName: OFFLINE_SW_CACHE_NAME,
          leaseDurationMs: 60000
        });

        if (lockRes && !lockRes.ok && lockRes.error !== 'VERSION_MISMATCH') {
          window.clearTimeout(timeoutId);
          return {
            ok: false,
            status: 'failed',
            shouldReload: false,
            message:
              '⚠️ عملیات به‌روزرسانی دیگری در تبی دیگر در جریان است. لطفاً چند لحظه صبر کرده و دوباره تلاش کنید.'
          };
        }

        if (lockRes && lockRes.ok) {
          if (lockRes.candidateCacheName) {
            stagingCacheName = lockRes.candidateCacheName;
          }
          lockAcquired = true;

          heartbeatTimer = window.setInterval(() => {
            if (swTargetWorker && lockAcquired) {
              sendSwMessage(swTargetWorker, {
                type: 'RENEW_UPDATE_LEASE',
                operationId,
                additionalMs: 45000
              }).catch(() => {});
            }
          }, 10000);
        }
      }
    }

    onProgress?.('در حال بررسی آخرین نسخه در گیت‌هاب...');

    const {
      htmlText,
      serverJsBundle,
      serverCssBundle,
      isViteDevMode,
      verifiedResponses
    } = await fetchAndVerifyPackageInMemory(appBaseUrl, controller.signal, onProgress);

    const nowFa = formatExactShamsiDateTimeFa(new Date());

    if (isViteDevMode) {
      if (heartbeatTimer !== null) {
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      window.clearTimeout(timeoutId);

      if (swTargetWorker && lockAcquired) {
        await sendSwMessage(swTargetWorker, {
          type: 'RELEASE_UPDATE_OPERATION',
          operationId
        }).catch(() => {});
        lockAcquired = false;
      }

      try {
        localStorage.setItem(LAST_GITHUB_SYNC_STORAGE_KEY, nowFa);
      } catch {
        // ignore
      }

      return {
        ok: true,
        status: 'up_to_date',
        shouldReload: false,
        updatedBundle: 'dev-live',
        syncedAtFa: nowFa,
        message: '✅ نسخه فعلی نرم‌افزار به‌روز است و نیازی به بارگذاری مجدد نیست.'
      };
    }

    const indexAbsUrl = new URL('./index.html', appBaseUrl).toString();
    const rootAbsUrl = new URL('./', appBaseUrl).toString();
    const syncStamp = String(Date.now());

    // مرحله ۲: ذخیره در کش کاندید موقت و راستی‌آزمایی صحت ذخیره‌سازی (Read-back Verification)
    onProgress?.('در حال ثبت و اعتبارسنجی کش آفلاین...');
    if ('caches' in window) {
      const stagingCache = await window.caches.open(stagingCacheName);
      await stagingCache.put(
        new Request(indexAbsUrl),
        new Response(htmlText, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Markaz-Manual-Sync': syncStamp
          }
        })
      );

      for (const [relUrl, item] of verifiedResponses.entries()) {
        const cleanUrl = new URL(relUrl, appBaseUrl);
        cleanUrl.search = '';
        await stagingCache.put(
          new Request(cleanUrl.toString()),
          new Response(item.bytes.slice(0), {
            status: 200,
            headers: {
              ...(item.contentType ? { 'Content-Type': item.contentType } : {}),
              'X-Markaz-Manual-Sync': syncStamp
            }
          })
        );

        const readBack = await stagingCache.match(cleanUrl.toString());
        if (!readBack || !readBack.ok) {
          throw new Error(`خطای ذخیره‌سازی در کش موقت برای فایل: ${relUrl}`);
        }
      }

      // انتقال اتمیک فایل‌ها به کش نهایی (دارای مُهر X-Markaz-Manual-Sync برای جلوگیری از دانلود تکراری در SW)
      const targetCache = await window.caches.open(OFFLINE_SW_CACHE_NAME);
      await targetCache.put(
        new Request(indexAbsUrl),
        new Response(htmlText, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Markaz-Manual-Sync': syncStamp
          }
        })
      );
      await targetCache.put(
        new Request(rootAbsUrl),
        new Response(htmlText, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Markaz-Manual-Sync': syncStamp
          }
        })
      );

      for (const [relUrl, item] of verifiedResponses.entries()) {
        const cleanUrl = new URL(relUrl, appBaseUrl);
        cleanUrl.search = '';
        await targetCache.put(
          new Request(cleanUrl.toString()),
          new Response(item.bytes.slice(0), {
            status: 200,
            headers: {
              ...(item.contentType ? { 'Content-Type': item.contentType } : {}),
              'X-Markaz-Manual-Sync': syncStamp
            }
          })
        );
      }

      await window.caches.delete(stagingCacheName).catch(() => {});
    }

    // مرحله ۳: بررسی و به‌روزرسانی چرخه Service Worker
    if ('serviceWorker' in navigator) {
      const swUrl = new URL(OFFLINE_SW_SCRIPT_URL, appBaseUrl).toString();
      const reg = await navigator.serviceWorker.register(swUrl, {
        updateViaCache: 'none'
      });

      await reg.update();

      const trackedInstalling = reg.installing;
      if (trackedInstalling) {
        onProgress?.('در حال راه‌اندازی Service Worker نسخه جدید...');
        const installedOk = await waitForInstallingWorker(trackedInstalling, 90000);
        if (!installedOk) {
          throw new Error('نصب Service Worker نسخه جدید کامل نشد؛ نسخه قبلی حفظ گردید.');
        }
      }

      // رفع race condition در مرورگرهای موبایل بین statechange و reg.waiting
      const pendingWaiting =
        reg.waiting || (trackedInstalling && trackedInstalling.state === 'installed' ? trackedInstalling : null);

      if (pendingWaiting) {
        const controllerChangedPromise = new Promise<boolean>((resolve) => {
          let resolved = false;
          const onControllerChange = () => {
            if (resolved) return;
            resolved = true;
            navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
            resolve(true);
          };
          navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
          window.setTimeout(() => {
            if (!resolved) {
              resolved = true;
              navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
              resolve(true);
            }
          }, 6000);
        });

        pendingWaiting.postMessage({ type: 'SKIP_WAITING' });
        await controllerChangedPromise;
      }

      const refreshedReg = await navigator.serviceWorker.getRegistration();
      swTargetWorker =
        navigator.serviceWorker.controller ||
        refreshedReg?.active ||
        swTargetWorker;
    }

    // مرحله ۴: تأیید پس از FINALIZE از مسیر عادی Service Worker و رول‌بک در صورت شکست
    if (swTargetWorker) {
      await sendSwMessage(swTargetWorker, {
        type: 'COMMIT_ACTIVE_CACHE',
        operationId,
        newCacheName: OFFLINE_SW_CACHE_NAME
      });

      try {
        const testHtml = await fetch(indexAbsUrl, { cache: 'no-store' });
        if (!testHtml.ok) throw new Error('درخواست عادی index.html با خطا مواجه شد');
        const testHtmlText = await testHtml.text();
        if (!testHtmlText.includes('id="root"')) throw new Error('محتوای index.html ناقص است');

        if (serverJsBundle) {
          const testJsUrl = new URL(`./assets/${serverJsBundle}`, appBaseUrl).toString();
          const testJs = await fetch(testJsUrl, { cache: 'default' });
          if (!testJs.ok) throw new Error(`باندل JS اصلی در مسیر عادی در دسترس نیست: ${serverJsBundle}`);
        }
        if (serverCssBundle) {
          const testCssUrl = new URL(`./assets/${serverCssBundle}`, appBaseUrl).toString();
          const testCss = await fetch(testCssUrl, { cache: 'default' });
          if (!testCss.ok) throw new Error(`باندل CSS اصلی در مسیر عادی در دسترس نیست: ${serverCssBundle}`);
        }
      } catch (verifyErr) {
        await sendSwMessage(swTargetWorker, {
          type: 'ROLLBACK_ACTIVE_CACHE',
          operationId,
          rollbackCacheName: OFFLINE_SW_CACHE_NAME
        });
        throw new Error(`شکست در اعتبارسنجی پس از فعال‌سازی: ${String(verifyErr)}`);
      }

      await sendSwMessage(swTargetWorker, {
        type: 'RELEASE_UPDATE_OPERATION',
        operationId
      });
      lockAcquired = false;
    }

    if (heartbeatTimer !== null) {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    window.clearTimeout(timeoutId);

    try {
      localStorage.setItem(LAST_GITHUB_SYNC_STORAGE_KEY, nowFa);
    } catch {
      // ignore
    }

    return {
      ok: true,
      status: 'updated',
      shouldReload: true,
      updatedBundle: serverJsBundle,
      syncedAtFa: nowFa,
      message:
        `✅ نسخه جدید (${OFFLINE_SW_VERSION_LABEL}) با موفقیت دریافت و فعال شد. در حال بارگذاری مجدد...`
    };
  } catch (error: any) {
    if (heartbeatTimer !== null) {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    window.clearTimeout(timeoutId);

    if (swTargetWorker && lockAcquired) {
      await sendSwMessage(swTargetWorker, {
        type: 'RELEASE_UPDATE_OPERATION',
        operationId,
        cleanupCandidate: true
      }).catch(() => {});
    }

    if (typeof window !== 'undefined' && 'caches' in window) {
      await window.caches.delete(stagingCacheName).catch(() => {});
    }

    return {
      ok: false,
      status: 'failed',
      shouldReload: false,
      message: `⚠️ دریافت نسخه جدید با شکست مواجه شد: ${error?.message || 'خطای شبکه یا پایان مهلت اتصال'}. نسخه پایدار قبلی بدون تغییر حفظ شد.`
    };
  }
}

/**
 * تعمیر و بازسازی قطعی کش نرم‌افزار در گوشی‌های اندروید/آیفون قفل‌شده روی کش قدیمی
 * بدون دست زدن به اطلاعات ثبت‌شده کاربر در پایگاه داده محلی و حافظه دستگاه!
 * ابتدا کل بسته جدید را در حافظه دریافت و اعتبارسنجی می‌کند و فقط در صورت صحت ۱۰۰٪، کش‌های قدیمی پوسته برنامه را پاکسازی و جایگزین می‌نماید.
 */
export async function performHardAppShellRepair(
  onProgress?: (stepMessage: string) => void
): Promise<GitHubSyncResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: false,
      status: 'offline',
      shouldReload: false,
      message: '⚠️ اینترنت دستگاه قطع است. برای تعمیر کش نرم‌افزار، ابتدا اینترنت را وصل کنید.'
    };
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 180000);

  try {
    const appBaseUrl = await resolveAppBaseUrl();
    onProgress?.('در حال دریافت بسته کامل و سالم از سرور...');

    const {
      htmlText,
      serverJsBundle,
      isViteDevMode,
      verifiedResponses
    } = await fetchAndVerifyPackageInMemory(appBaseUrl, controller.signal, onProgress);

    const nowFa = formatExactShamsiDateTimeFa(new Date());

    if (!isViteDevMode && 'caches' in window) {
      onProgress?.('در حال پاک‌سازی کش‌های قدیمی پوسته برنامه (حفظ کامل اطلاعات)...');
      const allKeys = await window.caches.keys();
      await Promise.all(
        allKeys
          .filter(
            (key) =>
              key.startsWith('markaz-asnad-main-book-') ||
              key.startsWith('markaz-asnad-pwa-') ||
              key === 'markaz-asnad-sw-control-v1'
          )
          .map((key) => window.caches.delete(key).catch(() => false))
      );

      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
      }

      const indexAbsUrl = new URL('./index.html', appBaseUrl).toString();
      const rootAbsUrl = new URL('./', appBaseUrl).toString();
      const syncStamp = String(Date.now());

      const targetCache = await window.caches.open(OFFLINE_SW_CACHE_NAME);
      await targetCache.put(
        new Request(indexAbsUrl),
        new Response(htmlText, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Markaz-Manual-Sync': syncStamp
          }
        })
      );
      await targetCache.put(
        new Request(rootAbsUrl),
        new Response(htmlText, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Markaz-Manual-Sync': syncStamp
          }
        })
      );

      for (const [relUrl, item] of verifiedResponses.entries()) {
        const cleanUrl = new URL(relUrl, appBaseUrl);
        cleanUrl.search = '';
        await targetCache.put(
          new Request(cleanUrl.toString()),
          new Response(item.bytes.slice(0), {
            status: 200,
            headers: {
              ...(item.contentType ? { 'Content-Type': item.contentType } : {}),
              'X-Markaz-Manual-Sync': syncStamp
            }
          })
        );
      }

      if ('serviceWorker' in navigator) {
        const swUrl = new URL(OFFLINE_SW_SCRIPT_URL, appBaseUrl).toString();
        const freshReg = await navigator.serviceWorker.register(swUrl, {
          updateViaCache: 'none'
        });
        if (freshReg.installing) {
          await waitForInstallingWorker(freshReg.installing, 90000);
        }
      }
    }

    window.clearTimeout(timeoutId);
    try {
      localStorage.setItem(LAST_GITHUB_SYNC_STORAGE_KEY, nowFa);
    } catch {
      // ignore
    }

    return {
      ok: true,
      status: 'updated',
      shouldReload: true,
      updatedBundle: serverJsBundle,
      syncedAtFa: nowFa,
      message: `✅ کش برنامه روی نسخه ${OFFLINE_SW_VERSION_LABEL} با حفظ کامل اطلاعات بازسازی شد. در حال بارگذاری مجدد...`
    };
  } catch (error: any) {
    window.clearTimeout(timeoutId);
    return {
      ok: false,
      status: 'failed',
      shouldReload: false,
      message: `⚠️ بازسازی کش ناموفق بود: ${error?.message || 'خطای شبکه'}. اطلاعات و نسخه فعلی حفظ شدند.`
    };
  }
}
