export const OFFLINE_SW_CACHE_NAME = 'markaz-asnad-main-book-v15';
export const OFFLINE_SW_SCRIPT_URL = './sw.js?v=15';
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

async function waitForInstallingWorker(worker: ServiceWorker, timeoutMs = 15000): Promise<boolean> {
  if (worker.state === 'installed' || worker.state === 'activated') {
    return true;
  }
  if (worker.state === 'redundant') {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    const timer = window.setTimeout(() => {
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

/**
 * به‌روزرسانی دستی، اتمیک و ایمن از گیت‌هاب فقط با کلیک مستقیم کاربر:
 * ۱. هیچ فایل جدیدی را روی کش نسخه فعال قبلی بازنویسی نمی‌کند.
 * ۲. ابتدا تمام فایل‌های ضروری نسخه جدید را در حافظه دریافت و اعتبارسنجی (HTTP 200 + غیرخالی بودن) می‌کند.
 * ۳. اگر حتی یک فایل ضروری دریافت نشود، عملیات متوقف شده، کش ناقص پاک می‌شود و نسخه فعال قبلی دست‌نخورده باقی می‌ماند.
 * ۴. فعال‌سازی به چرخه واقعی نصب Service Worker (وضعیت installed و رویداد controllerchange) متصل است.
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

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 18000);
  const stagingCacheName = `${OFFLINE_SW_CACHE_NAME}-staging-${Date.now()}`;

  try {
    onProgress?.('در حال بررسی نسخه جدید در گیت‌هاب...');

    const checkUrl = new URL('./index.html', window.location.href);
    checkUrl.searchParams.set('_manual_github_sync', '1');
    checkUrl.searchParams.set('_t', String(Date.now()));

    const htmlResponse = await fetch(checkUrl.toString(), {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal
    });

    if (!htmlResponse.ok) {
      window.clearTimeout(timeoutId);
      return {
        ok: false,
        status: 'failed',
        shouldReload: false,
        message: `⚠️ دریافت اطلاعات از گیت‌هاب ناموفق بود (کد وضعیت: ${htmlResponse.status}). نسخه فعلی برنامه بدون تغییر حفظ شد.`
      };
    }

    const htmlText = await htmlResponse.text();
    if (!htmlText || !htmlText.includes('id="root"')) {
      window.clearTimeout(timeoutId);
      return {
        ok: false,
        status: 'failed',
        shouldReload: false,
        message: '⚠️ پاسخ دریافتی از سرور معتبر نیست. نسخه فعلی برنامه بدون تغییر حفظ شد.'
      };
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

    const requiredShellUrls = new Set<string>([
      './manifest.webmanifest',
      './golzar-logo.png',
      './icon.svg',
      './apple-touch-icon.png',
      './pwa-192x192.png',
      './pwa-512x512.png',
      './fonts/Vazirmatn-variable.woff2'
    ]);

    let serverJsBundle = '';
    let serverCssBundle = '';

    for (const m of scriptMatches) {
      const norm = normalizeRelativeUrl(m[1]);
      if (norm) {
        requiredShellUrls.add(norm);
        serverJsBundle = norm.split('/').pop() || '';
      }
    }

    for (const m of preloadAndFontMatches) {
      const norm = normalizeRelativeUrl(m[1]);
      if (norm) {
        requiredShellUrls.add(norm);
      }
    }

    for (const m of styleMatches) {
      const norm = normalizeRelativeUrl(m[1]);
      if (norm) {
        requiredShellUrls.add(norm);
        serverCssBundle = norm.split('/').pop() || '';
      }
    }

    // در محیط ساخت نهایی (Production)، وجود باندل JS و CSS در index.html الزامی است
    const { jsBundle: currentJsBundle, cssBundle: currentCssBundle } = getCurrentlyLoadedBundles();
    if (currentJsBundle && (!serverJsBundle || !serverCssBundle)) {
      window.clearTimeout(timeoutId);
      return {
        ok: false,
        status: 'failed',
        shouldReload: false,
        message: '⚠️ فایل‌های اجرایی نسخه جدید در پاسخ سرور یافت نشد. نسخه فعلی دست‌نخورده باقی ماند.'
      };
    }

    onProgress?.('در حال دریافت و اعتبارسنجی کامل فایل‌های نسخه جدید...');

    // مرحله ۱: دریافت و راستی‌آزمایی تمام فایل‌های ضروری در یک کش موقت مستقل (Staging)
    // اگر حتی یک فایل ضروری دریافت نشود یا خالی باشد، کل فرآیند لغو شده و کش فعال قبلی دست‌نخورده می‌ماند
    const verifiedResponses = new Map<string, { bytes: ArrayBuffer; contentType: string }>();

    for (const relUrl of Array.from(requiredShellUrls)) {
      const fetchUrl = new URL(relUrl, window.location.href);
      fetchUrl.searchParams.set('_manual_github_sync', '1');
      fetchUrl.searchParams.set('_t', String(Date.now()));

      const resp = await fetch(fetchUrl.toString(), {
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal
      });

      if (!resp.ok) {
        throw new Error(`خطا در دریافت فایل ضروری ${relUrl} (وضعیت ${resp.status})`);
      }

      const bytes = await resp.arrayBuffer();
      if (!bytes || bytes.byteLength === 0) {
        throw new Error(`فایل ضروری ${relUrl} خالی است`);
      }

      const contentType = resp.headers.get('Content-Type') || '';
      verifiedResponses.set(relUrl, { bytes, contentType });

      // اگر فایل CSS است، مسیر فونت هش‌دار داخل آن را نیز استخراج و راستی‌آزمایی کن
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
            const fUrl = new URL(fontRelUrl, window.location.href);
            fUrl.searchParams.set('_manual_github_sync', '1');
            fUrl.searchParams.set('_t', String(Date.now()));
            const fResp = await fetch(fUrl.toString(), {
              cache: 'no-store',
              credentials: 'same-origin',
              signal: controller.signal
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
    }

    // مرحله ۲: بررسی و به‌روزرسانی چرخه واقعی Service Worker
    let swUpdatedAndActivated = false;
    if ('serviceWorker' in navigator) {
      const reg =
        (await navigator.serviceWorker.getRegistration()) ||
        (await navigator.serviceWorker.register(OFFLINE_SW_SCRIPT_URL, { updateViaCache: 'none' }));

      await reg.update();

      if (reg.installing) {
        onProgress?.('در حال نصب و اعتبارسنجی Service Worker نسخه جدید...');
        const installedOk = await waitForInstallingWorker(reg.installing);
        if (!installedOk) {
          throw new Error('نصب Service Worker نسخه جدید کامل نشد؛ نسخه قبلی حفظ گردید.');
        }
      }

      if (reg.waiting) {
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
          }, 4000);
        });

        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        swUpdatedAndActivated = await controllerChangedPromise;
      }
    }

    // مرحله ۳: ذخیره اتمیک تمام فایل‌های تاییدشده در کش نسخه v15 پس از اطمینان از صحت ۱۰۰٪ همه فایل‌ها
    if ('caches' in window) {
      const stagingCache = await window.caches.open(stagingCacheName);
      await stagingCache.put(
        new Request('./index.html'),
        new Response(htmlText, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
      );
      for (const [relUrl, item] of verifiedResponses.entries()) {
        const cleanUrl = new URL(relUrl, window.location.href);
        cleanUrl.search = '';
        await stagingCache.put(
          new Request(cleanUrl.toString()),
          new Response(item.bytes.slice(0), {
            status: 200,
            headers: item.contentType ? { 'Content-Type': item.contentType } : undefined
          })
        );
      }

      const targetCache = await window.caches.open(OFFLINE_SW_CACHE_NAME);
      await targetCache.put(
        new Request('./index.html'),
        new Response(htmlText, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
      );
      await targetCache.put(
        new Request('./'),
        new Response(htmlText, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
      );
      for (const [relUrl, item] of verifiedResponses.entries()) {
        const cleanUrl = new URL(relUrl, window.location.href);
        cleanUrl.search = '';
        await targetCache.put(
          new Request(cleanUrl.toString()),
          new Response(item.bytes.slice(0), {
            status: 200,
            headers: item.contentType ? { 'Content-Type': item.contentType } : undefined
          })
        );
      }

      await window.caches.delete(stagingCacheName).catch(() => {});
    }

    window.clearTimeout(timeoutId);

    const nowFa = formatExactShamsiDateTimeFa(new Date());

    try {
      localStorage.setItem(LAST_GITHUB_SYNC_STORAGE_KEY, nowFa);
    } catch {
      // ignore
    }

    const bundleChanged =
      Boolean(currentJsBundle && serverJsBundle && currentJsBundle !== serverJsBundle) ||
      Boolean(currentCssBundle && serverCssBundle && currentCssBundle !== serverCssBundle);

    if (!bundleChanged && !swUpdatedAndActivated) {
      return {
        ok: true,
        status: 'up_to_date',
        shouldReload: false,
        updatedBundle: serverJsBundle || currentJsBundle,
        syncedAtFa: nowFa,
        message: '✅ نسخه فعلی نرم‌افزار به‌روز است و نیازی به بارگذاری مجدد نیست.'
      };
    }

    return {
      ok: true,
      status: 'updated',
      shouldReload: true,
      updatedBundle: serverJsBundle,
      syncedAtFa: nowFa,
      message:
        '✅ نسخه جدید با موفقیت دریافت، راستی‌آزمایی و فعال شد. در حال بارگذاری نسخه جدید...'
    };
  } catch {
    window.clearTimeout(timeoutId);
    if (typeof window !== 'undefined' && 'caches' in window) {
      await window.caches.delete(stagingCacheName).catch(() => {});
    }
    return {
      ok: false,
      status: 'failed',
      shouldReload: false,
      message:
        '⚠️ دریافت کامل نسخه جدید انجام نشد (اینترنت قطع شد یا گیت‌هاب در دسترس نیست). نسخه قبلی شما بدون هیچ تغییری حفظ شد و فعال است.'
    };
  }
}
