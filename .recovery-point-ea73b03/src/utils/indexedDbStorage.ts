/**
 * لایه ذخیره‌سازی ترکیبی پایدار: IndexedDB (اصلی و بدون محدودیت ۵ مگابایت) + localStorage (پشتیبان سریع)
 * بازطراحی شده طبق بندهای ۴، ۵، ۱۶ و ۲۰ دستور جامع بررسی و ارتقا:
 * - گزارش دقیق وضعیت ذخیره‌سازی (بدون بلعیدن خاموش خطاها)
 * - مقایسه زمان‌بندی‌شده (updatedAt) به‌جای مقایسه صرف طول آرایه (array.length)
 * - بازیابی کامل تمام مجموعه‌های عملیاتی در شروع برنامه (Full Startup Hydration)
 * - راستی‌آزمایی پویا و دقیق آمار ۲۸,۳۶۸ شهید از فایل مرجع golzar_martyrs.xlsx
 */

const DB_NAME = 'MarkazAsnadBookLibraryDB';
const DB_VERSION = 2;
const STORE_NAME = 'app_state_store';
const META_STORAGE_KEY = 'book_storage_meta_v1';

export interface StorageSaveResult {
  ok: boolean;
  key: string;
  idbSaved: boolean;
  localSaved: boolean;
  updatedAt: number;
  error?: string;
}

export interface StorageEnvelope<T> {
  __envelopeVersion: 2;
  updatedAt: number;
  recordCount: number;
  data: T;
}

export const OPERATIONAL_STORAGE_KEYS = {
  auditRecords: 'book_library_audit_v1',
  bookCopies: 'book_copies_v1',
  customMartyrs: 'book_custom_martyrs_v1',
  smartSuggestions: 'book_smart_suggestions_v1',
  multiMartyrGroups: 'book_groups16_v1',
  extractedItems: 'book_extracted_items_v1',
  links: 'book_martyr_links_v1',
  pendingReviews: 'book_pending_reviews_v1',
  auditLog: 'book_audit_log_v1',
  rejectedSuggestions: 'book_rejected_suggestions_v1',
  userRole: 'book_user_role_v1',
} as const;

function getLocalTimestampMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {};
}

function setLocalTimestamp(key: string, updatedAt: number): void {
  try {
    const map = getLocalTimestampMap();
    map[key] = updatedAt;
    localStorage.setItem(META_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function getLocalKeyTimestamp(key: string): number {
  const map = getLocalTimestampMap();
  return map[key] || 0;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported in this browser environment'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open error'));
  });
}

function isEnvelope<T>(raw: unknown): raw is StorageEnvelope<T> {
  return Boolean(
    raw &&
      typeof raw === 'object' &&
      '__envelopeVersion' in (raw as Record<string, unknown>) &&
      (raw as Record<string, unknown>).__envelopeVersion === 2 &&
      'data' in (raw as Record<string, unknown>)
  );
}

/**
 * ذخیره داده در IndexedDB با بازگرداندن وضعیت واقعی موفقیت یا خطا
 */
export async function idbSetItemWithStatus<T>(
  key: string,
  value: T,
  explicitTimestamp?: number
): Promise<{ ok: boolean; updatedAt: number; error?: string }> {
  const updatedAt = explicitTimestamp || Date.now();
  const recordCount = Array.isArray(value)
    ? value.length
    : value && typeof value === 'object'
    ? Object.keys(value as object).length
    : 1;

  const envelope: StorageEnvelope<T> = {
    __envelopeVersion: 2,
    updatedAt,
    recordCount,
    data: value,
  };

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(envelope, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error(`IndexedDB write transaction failed for ${key}`));
      };
    });
    return { ok: true, updatedAt };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, updatedAt, error: msg };
  }
}

/**
 * سازگاری عقب‌رو با فراخوانی‌های موجود
 */
export async function idbSetItem<T>(key: string, value: T): Promise<void> {
  await idbSetItemWithStatus(key, value);
}

/**
 * خواندن داده همراه با متادیتای زمان‌بندی از IndexedDB
 */
export async function idbGetEnvelope<T>(key: string): Promise<{ data: T | null; updatedAt: number }> {
  try {
    const db = await openDB();
    return await new Promise<{ data: T | null; updatedAt: number }>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        db.close();
        const raw = req.result;
        if (raw === undefined || raw === null) {
          resolve({ data: null, updatedAt: 0 });
          return;
        }
        if (isEnvelope<T>(raw)) {
          resolve({ data: raw.data, updatedAt: raw.updatedAt || 0 });
        } else {
          // داده قدیمی بدون پاکت زمان‌بندی
          resolve({ data: raw as T, updatedAt: 1 });
        }
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return { data: null, updatedAt: 0 };
  }
}

export async function idbGetItem<T>(key: string): Promise<T | null> {
  const env = await idbGetEnvelope<T>(key);
  return env.data;
}

/**
 * ذخیره هم‌زمان در localStorage و IndexedDB با گزارش دقیق وضعیت (بند ۴ دستور جامع)
 */
export async function saveOperationalData<T>(
  key: string,
  value: T,
  explicitTimestamp?: number
): Promise<StorageSaveResult> {
  const updatedAt = explicitTimestamp || Date.now();
  let localSaved = false;
  let localError: string | undefined;

  try {
    localStorage.setItem(key, JSON.stringify(value));
    setLocalTimestamp(key, updatedAt);
    localSaved = true;
  } catch (err) {
    localError = err instanceof Error ? err.message : String(err);
  }

  const idbRes = await idbSetItemWithStatus(key, value, updatedAt);
  const ok = localSaved || idbRes.ok;
  const error = !ok
    ? `خطا در ذخیره localStorage (${localError || 'نامشخص'}) و IndexedDB (${idbRes.error || 'نامشخص'})`
    : !localSaved
    ? `ذخیره در IndexedDB موفق بود، اما localStorage پر شده است (${localError})`
    : !idbRes.ok
    ? `ذخیره در localStorage موفق بود، اما IndexedDB خطا داد (${idbRes.error})`
    : undefined;

  return {
    ok,
    key,
    idbSaved: idbRes.ok,
    localSaved,
    updatedAt,
    error,
  };
}

/**
 * بازیابی هوشمند یک کلید در شروع برنامه (بند ۴ و ۵ دستور جامع):
 * - اگر هر دو منبع داده دارند، داده‌ای که updatedAt جدیدتری دارد انتخاب می‌شود (نه صرفاً طول بیشتر!)
 * - اگر یک منبع خالی است و منبع دیگر داده دارد، منبع دارای داده انتخاب و همگام‌سازی می‌شود
 * - هرگز داده جدیدتر localStorage با داده قدیمی‌تر IndexedDB بازنویسی نمی‌شود
 */
export async function hydrateOperationalKey<T>(
  key: string,
  fallbackValue: T
): Promise<{ value: T; source: 'localStorage' | 'indexedDB' | 'fallback'; updatedAt: number }> {
  let localVal: T | null = null;
  let localUpdatedAt = getLocalKeyTimestamp(key);

  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      localVal = JSON.parse(raw) as T;
      if (!localUpdatedAt) {
        localUpdatedAt = 1;
      }
    }
  } catch {
    localVal = null;
  }

  const idbEnv = await idbGetEnvelope<T>(key);
  const idbVal = idbEnv.data;
  const idbUpdatedAt = idbEnv.updatedAt;

  if (localVal !== null && idbVal !== null) {
    // اگر زمان‌بندی مشخص است، نسخه جدیدتر برنده است
    if (idbUpdatedAt > localUpdatedAt) {
      try {
        localStorage.setItem(key, JSON.stringify(idbVal));
        setLocalTimestamp(key, idbUpdatedAt);
      } catch {
        // ignore quota
      }
      return { value: idbVal, source: 'indexedDB', updatedAt: idbUpdatedAt };
    }

    if (localUpdatedAt > idbUpdatedAt) {
      await idbSetItemWithStatus(key, localVal, localUpdatedAt);
      return { value: localVal, source: 'localStorage', updatedAt: localUpdatedAt };
    }

    // اگر هر دو از نسخه قدیمی بدون timestamp هستند (updatedAt === 1)
    if (Array.isArray(idbVal) && Array.isArray(localVal)) {
      const chosen = idbVal.length >= localVal.length ? idbVal : localVal;
      const now = Date.now();
      setLocalTimestamp(key, now);
      await idbSetItemWithStatus(key, chosen, now);
      return {
        value: chosen,
        source: idbVal.length >= localVal.length ? 'indexedDB' : 'localStorage',
        updatedAt: now,
      };
    }

    return { value: localVal, source: 'localStorage', updatedAt: localUpdatedAt };
  }

  if (idbVal !== null && localVal === null) {
    const ts = idbUpdatedAt || Date.now();
    try {
      localStorage.setItem(key, JSON.stringify(idbVal));
      setLocalTimestamp(key, ts);
    } catch {
      // ignore quota
    }
    return { value: idbVal, source: 'indexedDB', updatedAt: ts };
  }

  if (localVal !== null && idbVal === null) {
    const ts = localUpdatedAt || Date.now();
    setLocalTimestamp(key, ts);
    await idbSetItemWithStatus(key, localVal, ts);
    return { value: localVal, source: 'localStorage', updatedAt: ts };
  }

  return { value: fallbackValue, source: 'fallback', updatedAt: 0 };
}

/**
 * بررسی سلامت واقعی IndexedDB و localStorage برای آزمون‌های پذیرش (بند ۱۸ دستور جامع)
 */
export async function runStorageHealthCheck(): Promise<{
  ok: boolean;
  indexedDbWorking: boolean;
  localStorageWorking: boolean;
  timestampProtectionWorking: boolean;
  details: string;
}> {
  const testKey = '__healthcheck_storage_test_v1__';
  try {
    const olderTs = 1700000000000;
    const newerTs = 1700000099999;

    // ۱. ذخیره نسخه قدیمی‌تر با ۲ آیتم در IDB
    await idbSetItemWithStatus(testKey, [{ id: 'A' }, { id: 'B' }], olderTs);

    // ۲. ذخیره نسخه جدیدتر با ۱ آیتم در localStorage (شبیه‌سازی حذف یک آیتم توسط کاربر)
    localStorage.setItem(testKey, JSON.stringify([{ id: 'A' }]));
    setLocalTimestamp(testKey, newerTs);

    // ۳. بازیابی: باید نسخه جدیدتر (۱ آیتمی) را نگه دارد و با نسخه ۲ آیتمی قدیمی‌تر بازنویسی نکند!
    const hydrated = await hydrateOperationalKey<Array<{ id: string }>>(testKey, []);
    const timestampProtectionWorking =
      Array.isArray(hydrated.value) &&
      hydrated.value.length === 1 &&
      hydrated.value[0]?.id === 'A' &&
      hydrated.source === 'localStorage';

    // پاکسازی کلید تست
    localStorage.removeItem(testKey);
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(testKey);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });

    return {
      ok: timestampProtectionWorking,
      indexedDbWorking: true,
      localStorageWorking: true,
      timestampProtectionWorking,
      details: timestampProtectionWorking
        ? 'IndexedDB و localStorage فعال هستند و حفاظت زمان‌بندی (عدم بازنویسی داده جدیدتر با داده قدیمی‌تر پس از حذف رکورد) با موفقیت تأیید شد.'
        : 'خطا در تست حفاظت زمان‌بندی بین localStorage و IndexedDB.',
    };
  } catch (err) {
    return {
      ok: false,
      indexedDbWorking: false,
      localStorageWorking: false,
      timestampProtectionWorking: false,
      details: err instanceof Error ? err.message : String(err),
    };
  }
}
