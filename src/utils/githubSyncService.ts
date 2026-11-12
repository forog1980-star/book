export const OFFLINE_SW_CACHE_NAME = 'markaz-asnad-main-book-v14';
export const LAST_GITHUB_SYNC_STORAGE_KEY = 'markaz_last_github_sync_fa';

export interface GitHubSyncResult {
  ok: boolean;
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
        `⚠️ اتصال اینترنت برقرار نیست! برای جست‌وجوی آنلاین در «${portalName}» لطفاً ابتدا اینترنت دستگاه را روشن کنید. (جست‌وجوهای داخلی نرم‌افزار کاملاً آفلاین فعال هستند)`,
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

export function getLastGitHubSyncTimeFa(): string {
  try {
    return localStorage.getItem(LAST_GITHUB_SYNC_STORAGE_KEY) || 'ثبت‌نشده (اجرای آفلاین اولیه)';
  } catch {
    return 'ثبت‌نشده';
  }
}

/**
 * اتصال دستی، موقت و تک‌لحظه‌ای به گیت‌هاب فقط با کلیک مستقیم کاربر جهت دریافت آخرین تغییرات کد و داده‌های پایه
 * بلافاصله پس از دریافت فایل‌ها و بروزرسانی کش آفلاین، ارتباط بسته شده و برنامه در حالت ۱۰۰٪ آفلاین قرار می‌گیرد.
 */
export async function performManualGitHubSync(
  onProgress?: (stepMessage: string) => void
): Promise<GitHubSyncResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: false,
      message:
        '⚠️ اینترنت دستگاه وصل نیست! برای همگام‌سازی و دریافت آخرین بروزرسانی از گیت‌هاب، لطفاً ابتدا اینترنت (و در صورت نیاز فیلترشکن) را روشن کرده و دوباره دکمه همگام‌سازی را بزنید.'
    };
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 14000);

  try {
    onProgress?.('در حال برقراری ارتباط موقت با مخزن گیت‌هاب...');

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
        message: `⚠️ سرور گیت‌هاب پاسخ نداد (کد وضعیت: ${htmlResponse.status}). برنامه همچنان در حالت آفلاین کامل به کار خود ادامه می‌دهد.`
      };
    }

    const htmlText = await htmlResponse.text();

    // استخراج مسیر فایل‌های JS و CSS نسخه جدید از داخل index.html دریافتی
    const assetUrls: string[] = [
      './manifest.webmanifest',
      './golzar-logo.png',
      './icon.svg',
      './apple-touch-icon.png',
      './fonts/Vazirmatn-variable.woff2',
      './data/library_books.json'
    ];

    const scriptMatches = Array.from(
      htmlText.matchAll(/src=["']([^"']*\/assets\/[^"']+\.js)["']/g)
    );
    const styleMatches = Array.from(
      htmlText.matchAll(/href=["']([^"']*\/assets\/[^"']+\.css)["']/g)
    );

    let detectedBundleName = '';
    for (const m of scriptMatches) {
      if (m[1]) {
        assetUrls.push(m[1]);
        detectedBundleName = m[1].split('/').pop() || '';
      }
    }
    for (const m of styleMatches) {
      if (m[1]) {
        assetUrls.push(m[1]);
      }
    }

    onProgress?.('در حال دریافت فایل‌های بروزرسانی و ذخیره در حافظه آفلاین دستگاه...');

    if ('caches' in window) {
      const cache = await window.caches.open(OFFLINE_SW_CACHE_NAME);

      // ذخیره نسخه جدید index.html در کش آفلاین
      await cache.put(
        new Request('./index.html'),
        new Response(htmlText, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
      );
      await cache.put(
        new Request('./'),
        new Response(htmlText, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
      );

      for (const rawUrl of assetUrls) {
        try {
          const assetFetchUrl = new URL(rawUrl, window.location.href);
          assetFetchUrl.searchParams.set('_manual_github_sync', '1');
          assetFetchUrl.searchParams.set('_t', String(Date.now()));
          const resp = await fetch(assetFetchUrl.toString(), {
            cache: 'no-store',
            credentials: 'same-origin',
            signal: controller.signal
          });
          if (resp.ok) {
            const cleanUrl = new URL(rawUrl, window.location.href);
            cleanUrl.search = '';
            await cache.put(new Request(cleanUrl.toString()), resp.clone());
          }
        } catch {
          // ادامه برای سایر فایل‌ها
        }
      }
    }

    // بروزرسانی دستی سرویس‌ورکر فقط در همین لحظه
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        }
      } catch {
        // ignore
      }
    }

    window.clearTimeout(timeoutId);

    const nowFa = new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date());

    try {
      localStorage.setItem(LAST_GITHUB_SYNC_STORAGE_KEY, nowFa);
    } catch {
      // ignore
    }

    return {
      ok: true,
      updatedBundle: detectedBundleName,
      syncedAtFa: nowFa,
      message:
        '✅ همگام‌سازی و دریافت آخرین تغییرات از گیت‌هاب با موفقیت انجام شد و در حافظه دائمی دستگاه ذخیره گردید. ارتباط با گیت‌هاب مجدداً قطع شد.'
    };
  } catch {
    window.clearTimeout(timeoutId);
    return {
      ok: false,
      message:
        '⚠️ امکان اتصال به گیت‌هاب وجود ندارد (اینترنت قطع است یا دسترسی به گیت‌هاب نیازمند روشن کردن فیلترشکن است). نرم‌افزار بدون هیچ مشکلی در حالت آفلاین کامل به کار خود ادامه می‌دهد.'
    };
  }
}
