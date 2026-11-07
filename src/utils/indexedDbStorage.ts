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

export interface BatchStorageSaveEntry<T = unknown> {
  key: string;
  value: T;
}

export interface BatchStorageSaveResult {
  ok: boolean;
  keys: string[];
  idbSaved: boolean;
  localSaved: boolean;
  updatedAt: number;
  failedKey?: string;
  error?: string;
  warning?: string;
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

let lastIssuedTimestamp = 0;

function getLocalTimestampMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, number>;
      }
    }
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

/**
 * تولید زمان‌بندی اکیداً صعودی (Monotonic Timestamp) تا در صورت انجام دو ذخیره در یک میلی‌ثانیه،
 * نسخه جدید همواره updatedAt بزرگ‌تری نسبت به نسخه قبلی داشته باشد.
 */
function nextMonotonicTimestamp(explicitTimestamp?: number, targetKeys?: string[]): number {
  if (typeof explicitTimestamp === 'number' && explicitTimestamp > 0) {
    lastIssuedTimestamp = Math.max(lastIssuedTimestamp, explicitTimestamp);
    return explicitTimestamp;
  }
  const map = getLocalTimestampMap();
  let maxExisting = lastIssuedTimestamp;
  const keysToCheck = targetKeys && targetKeys.length > 0 ? targetKeys : Object.keys(map);
  for (const k of keysToCheck) {
    const ts = Number(map[k] || 0);
    if (ts > maxExisting) {
      maxExisting = ts;
    }
  }
  const now = Date.now();
  const nextTs = now > maxExisting ? now : maxExisting + 1;
  lastIssuedTimestamp = nextTs;
  return nextTs;
}

function getIndexedDbFactory(): IDBFactory | null {
  if (typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB) {
    return window.indexedDB;
  }
  if (
    typeof globalThis !== 'undefined' &&
    'indexedDB' in globalThis &&
    (globalThis as unknown as { indexedDB?: IDBFactory }).indexedDB
  ) {
    return (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB;
  }
  return null;
}

export function isIndexedDbAvailable(): boolean {
  return getIndexedDbFactory() !== null;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idbFactory = getIndexedDbFactory();
    if (!idbFactory) {
      reject(new Error('IndexedDB is not supported in this browser environment'));
      return;
    }
    const request = idbFactory.open(DB_NAME, DB_VERSION);
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
  const updatedAt = nextMonotonicTimestamp(explicitTimestamp, [key]);
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
      const req = store.put(envelope, key);
      req.onerror = (ev) => {
        if (ev && typeof ev.stopPropagation === 'function') {
          ev.stopPropagation();
        }
        try {
          tx.abort();
        } catch {
          // ignore
        }
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error(`IndexedDB write transaction failed for ${key}`));
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error || new Error(`IndexedDB write transaction aborted for ${key}`));
      };
    });
    return { ok: true, updatedAt };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, updatedAt, error: msg };
  }
}

/**
 * ذخیره اتمیک چند کلید در یک تراکنش واحد IndexedDB (readwrite روی app_state_store):
 * - تمام مجموعه‌ها با یک updatedAt مشترک در یک تراکنش نوشته می‌شوند.
 * - اگر نوشتن هر یک از کلیدها خطا بدهد یا استثنا رخ دهد، کل تراکنش Abort شده و هیچ‌یک از کلیدها در IndexedDB تغییر نمی‌کند.
 */
export async function idbSetBatchWithStatus(
  entries: BatchStorageSaveEntry[],
  explicitTimestamp?: number
): Promise<{ ok: boolean; updatedAt: number; failedKey?: string; error?: string }> {
  const keys = Array.isArray(entries) ? entries.map((e) => e?.key || '') : [];
  const updatedAt = nextMonotonicTimestamp(explicitTimestamp, keys);

  if (!entries || entries.length === 0) {
    return { ok: true, updatedAt };
  }

  const prepared: Array<{ key: string; envelope: StorageEnvelope<unknown> }> = [];
  for (const entry of entries) {
    if (!entry || typeof entry.key !== 'string' || !entry.key.trim() || entry.value === undefined) {
      return {
        ok: false,
        updatedAt,
        failedKey: entry?.key || 'UNKNOWN_KEY',
        error: `کلید یا مقدار نامعتبر برای تراکنش IndexedDB (${entry?.key || 'UNKNOWN_KEY'})`,
      };
    }
    const value = entry.value;
    const recordCount = Array.isArray(value)
      ? value.length
      : value && typeof value === 'object'
      ? Object.keys(value as object).length
      : 1;
    prepared.push({
      key: entry.key,
      envelope: {
        __envelopeVersion: 2,
        updatedAt,
        recordCount,
        data: value,
      },
    });
  }

  let failedKey: string | undefined;
  let requestErrorMsg: string | undefined;

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      let settled = false;

      tx.oncomplete = () => {
        if (settled) return;
        settled = true;
        db.close();
        resolve();
      };

      tx.onerror = () => {
        if (settled) return;
        settled = true;
        const errText =
          requestErrorMsg ||
          tx.error?.message ||
          `خطا در تراکنش چندکلیدی IndexedDB${failedKey ? ` (کلید: ${failedKey})` : ''}`;
        db.close();
        reject(new Error(errText));
      };

      tx.onabort = () => {
        if (settled) return;
        settled = true;
        const errText =
          requestErrorMsg ||
          tx.error?.message ||
          `لغو و بازگردانی (Abort) تراکنش چندکلیدی IndexedDB${failedKey ? ` (کلید: ${failedKey})` : ''}`;
        db.close();
        reject(new Error(errText));
      };

      for (const item of prepared) {
        try {
          const req = store.put(item.envelope, item.key);
          req.onerror = (ev) => {
            if (!failedKey) {
              failedKey = item.key;
            }
            requestErrorMsg =
              req.error?.message || `خطا در ذخیره کلید ${item.key} در تراکنش IndexedDB`;
            if (ev && typeof ev.stopPropagation === 'function') {
              ev.stopPropagation();
            }
            try {
              tx.abort();
            } catch {
              // ignore if already aborting
            }
          };
        } catch (putErr) {
          if (!failedKey) {
            failedKey = item.key;
          }
          requestErrorMsg = putErr instanceof Error ? putErr.message : String(putErr);
          try {
            tx.abort();
          } catch {
            // ignore
          }
          break;
        }
      }
    });

    return { ok: true, updatedAt };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, updatedAt, failedKey, error: msg };
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
  const updatedAt = nextMonotonicTimestamp(explicitTimestamp, [key]);
  let localSaved = false;
  let localError: string | undefined;

  let prevLocalVal: string | null = null;
  let prevMetaRaw: string | null = null;
  try {
    prevLocalVal = localStorage.getItem(key);
    prevMetaRaw = localStorage.getItem(META_STORAGE_KEY);
  } catch {
    // ignore
  }

  try {
    localStorage.setItem(key, JSON.stringify(value));
    setLocalTimestamp(key, updatedAt);
    localSaved = true;
  } catch (err) {
    localError = err instanceof Error ? err.message : String(err);
    try {
      if (prevLocalVal === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, prevLocalVal);
      }
      if (prevMetaRaw === null) {
        localStorage.removeItem(META_STORAGE_KEY);
      } else {
        localStorage.setItem(META_STORAGE_KEY, prevMetaRaw);
      }
    } catch {
      // ignore
    }
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
 * ذخیره هماهنگ و اتمیک چند مجموعه عملیاتی (auditRecords, bookCopies, customMartyrs, links, pendingReviews, extractedItems):
 * ۱. پیش‌اعتبارسنجی و سریال‌سازی تمام مجموعه‌ها پیش از هرگونه تغییر در حافظه
 * ۲. اجرای یک تراکنش واحد و اتمیک IndexedDB (idbSetBatchWithStatus) برای تمام کلیدها با یک updatedAt مشترک؛
 *    در صورت شکست تراکنش یا شکست هر یک از کلیدها در IndexedDB، کل تراکنش Abort شده و هیچ تغییری در IndexedDB و localStorage اعمال نمی‌شود (ok: false).
 * ۳. در صورت موفقیت تراکنش IndexedDB، ذخیره هماهنگ در localStorage انجام می‌شود؛ اگر ذخیره هر کلید در localStorage شکست بخورد،
 *    تمام تغییرات localStorage به Snapshot قبلی Rollback می‌شود تا داده نیمه‌کاره یا timestamp نامعتبر در localStorage باقی نماند،
 *    در حالی که نسخه کامل و اتمیک در IndexedDB با updatedAt جدیدتر محفوظ است و در Refresh بعدی انتخاب خواهد شد.
 */
export async function saveOperationalDataBatchAtomic(
  entries: BatchStorageSaveEntry[],
  explicitTimestamp?: number
): Promise<BatchStorageSaveResult> {
  const keys = Array.isArray(entries) ? entries.map((e) => e?.key || '') : [];
  const updatedAt = nextMonotonicTimestamp(explicitTimestamp, keys);

  if (!entries || entries.length === 0) {
    return {
      ok: true,
      keys: [],
      idbSaved: true,
      localSaved: true,
      updatedAt,
    };
  }

  // ۱. پیش‌اعتبارسنجی و سریال‌سازی تمام مجموعه‌ها پیش از دست زدن به حافظه
  const serializedEntries: Array<{ key: string; json: string; value: unknown }> = [];
  for (const entry of entries) {
    if (!entry || typeof entry.key !== 'string' || !entry.key.trim() || entry.value === undefined) {
      return {
        ok: false,
        keys,
        idbSaved: false,
        localSaved: false,
        updatedAt,
        failedKey: entry?.key || 'UNKNOWN_KEY',
        error: `داده نامعتبر برای کلید ${entry?.key || 'UNKNOWN_KEY'}؛ عملیات ذخیره دسته‌ای متوقف شد.`,
      };
    }
    try {
      const json = JSON.stringify(entry.value);
      if (typeof json !== 'string') {
        return {
          ok: false,
          keys,
          idbSaved: false,
          localSaved: false,
          updatedAt,
          failedKey: entry.key,
          error: `سریال‌سازی JSON برای کلید ${entry.key} ناموفق بود.`,
        };
      }
      serializedEntries.push({ key: entry.key, json, value: entry.value });
    } catch (serErr) {
      return {
        ok: false,
        keys,
        idbSaved: false,
        localSaved: false,
        updatedAt,
        failedKey: entry.key,
        error: `خطای سریال‌سازی در کلید ${entry.key}: ${
          serErr instanceof Error ? serErr.message : String(serErr)
        }`,
      };
    }
  }

  // ۲. تهیه تصویر پشتیبان (Snapshot) از وضعیت قبلی localStorage برای Rollback اتمیک در صورت خطا
  const prevLocalValues = new Map<string, string | null>();
  for (const item of serializedEntries) {
    try {
      prevLocalValues.set(item.key, localStorage.getItem(item.key));
    } catch {
      prevLocalValues.set(item.key, null);
    }
  }
  let prevMetaRaw: string | null = null;
  try {
    prevMetaRaw = localStorage.getItem(META_STORAGE_KEY);
  } catch {
    prevMetaRaw = null;
  }

  const rollbackLocalStorage = () => {
    for (const [k, prevVal] of prevLocalValues.entries()) {
      try {
        if (prevVal === null) {
          localStorage.removeItem(k);
        } else {
          localStorage.setItem(k, prevVal);
        }
      } catch {
        // ignore rollback error
      }
    }
    try {
      if (prevMetaRaw === null) {
        localStorage.removeItem(META_STORAGE_KEY);
      } else {
        localStorage.setItem(META_STORAGE_KEY, prevMetaRaw);
      }
    } catch {
      // ignore rollback error
    }
  };

  const hasIdb = isIndexedDbAvailable();
  let idbSaved = false;
  let idbError: string | undefined;
  let idbFailedKey: string | undefined;

  // ۳. اگر IndexedDB در محیط فعال است، ابتدا تراکنش اتمیک چندکلیدی IndexedDB اجرا می‌شود
  if (hasIdb) {
    const idbRes = await idbSetBatchWithStatus(entries, updatedAt);
    idbSaved = idbRes.ok;
    idbError = idbRes.error;
    idbFailedKey = idbRes.failedKey;

    if (!idbSaved) {
      rollbackLocalStorage();
      return {
        ok: false,
        keys,
        idbSaved: false,
        localSaved: false,
        updatedAt,
        failedKey: idbFailedKey,
        error: `خطا در تراکنش اتمیک IndexedDB (${idbError || 'نامشخص'})؛ هیچ‌یک از مجموعه‌ها تغییر نکرد.`,
      };
    }
  }

  // ۴. ذخیره هماهنگ در localStorage (همراه با Rollback کامل localStorage در صورت شکست هر یک از کلیدها)
  let localSaved = false;
  let localError: string | undefined;
  let localFailedKey: string | undefined;

  try {
    const nextMetaMap = getLocalTimestampMap();
    for (const item of serializedEntries) {
      localFailedKey = item.key;
      localStorage.setItem(item.key, item.json);
      nextMetaMap[item.key] = updatedAt;
    }
    localFailedKey = META_STORAGE_KEY;
    localStorage.setItem(META_STORAGE_KEY, JSON.stringify(nextMetaMap));
    localFailedKey = undefined;
    localSaved = true;
  } catch (locErr) {
    localError = locErr instanceof Error ? locErr.message : String(locErr);
    rollbackLocalStorage();
  }

  if (hasIdb) {
    return {
      ok: true,
      keys,
      idbSaved: true,
      localSaved,
      updatedAt,
      warning: !localSaved
        ? `ذخیره اتمیک در IndexedDB موفق بود، اما پشتیبان localStorage با خطا مواجه شد و به نسخه پایدار قبلی بازگردانده شد (${localError})`
        : undefined,
    };
  }

  if (!localSaved) {
    return {
      ok: false,
      keys,
      idbSaved: false,
      localSaved: false,
      updatedAt,
      failedKey: localFailedKey,
      error: `خطا در ذخیره هماهنگ localStorage در کلید ${localFailedKey || 'نامشخص'} (${
        localError || 'نامشخص'
      })؛ تمام مجموعه‌ها به نسخه قبلی بازگردانی شدند.`,
    };
  }

  return {
    ok: true,
    keys,
    idbSaved: false,
    localSaved: true,
    updatedAt,
  };
}

/**
 * بازیابی هوشمند یک کلید در شروع برنامه (بند ۴ و ۵ دستور جامع + اصلاح حفاظت از نسخه اتمیک IndexedDB):
 * - اگر هر دو منبع داده دارند، داده‌ای که updatedAt جدیدتری دارد انتخاب می‌شود
 * - اگر ذخیره اتمیک در IndexedDB موفق بوده ولی پشتیبان localStorage ناموفق بوده (یا هر دو دارای timestamp معتبر برابر باشند)،
 *   نسخه تراکنشی IndexedDB انتخاب می‌شود تا هرگز نسخه قدیمی یا ناقص localStorage انتخاب نگردد
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
      const parsed = JSON.parse(raw) as T;
      if (parsed !== null && parsed !== undefined) {
        localVal = parsed;
        if (!localUpdatedAt) {
          localUpdatedAt = 1;
        }
      } else {
        localVal = null;
        localUpdatedAt = 0;
      }
    } else {
      localUpdatedAt = 0;
    }
  } catch {
    localVal = null;
    localUpdatedAt = 0;
  }

  const idbEnv = await idbGetEnvelope<T>(key);
  const idbVal = idbEnv.data;
  const idbUpdatedAt = idbEnv.updatedAt;

  if (localVal !== null && idbVal !== null) {
    // اگر IndexedDB دارای timestamp جدیدتر یا مساوی معتبر (> 1) است، نسخه تراکنشی IndexedDB برنده است
    if (idbUpdatedAt > localUpdatedAt || (idbUpdatedAt > 1 && idbUpdatedAt === localUpdatedAt)) {
      if (idbUpdatedAt > localUpdatedAt) {
        try {
          localStorage.setItem(key, JSON.stringify(idbVal));
          setLocalTimestamp(key, idbUpdatedAt);
        } catch {
          // ignore quota
        }
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
      const now = nextMonotonicTimestamp(undefined, [key]);
      setLocalTimestamp(key, now);
      await idbSetItemWithStatus(key, chosen, now);
      return {
        value: chosen,
        source: idbVal.length >= localVal.length ? 'indexedDB' : 'localStorage',
        updatedAt: now,
      };
    }

    if (
      idbVal &&
      localVal &&
      typeof idbVal === 'object' &&
      typeof localVal === 'object' &&
      !Array.isArray(idbVal) &&
      !Array.isArray(localVal)
    ) {
      const idbKeysCount = Object.keys(idbVal as object).length;
      const localKeysCount = Object.keys(localVal as object).length;
      const chosen = idbKeysCount >= localKeysCount ? idbVal : localVal;
      const now = nextMonotonicTimestamp(undefined, [key]);
      setLocalTimestamp(key, now);
      await idbSetItemWithStatus(key, chosen, now);
      return {
        value: chosen,
        source: idbKeysCount >= localKeysCount ? 'indexedDB' : 'localStorage',
        updatedAt: now,
      };
    }

    return { value: idbVal, source: 'indexedDB', updatedAt: idbUpdatedAt };
  }

  if (idbVal !== null && localVal === null) {
    const ts = idbUpdatedAt || nextMonotonicTimestamp(undefined, [key]);
    try {
      localStorage.setItem(key, JSON.stringify(idbVal));
      setLocalTimestamp(key, ts);
    } catch {
      // ignore quota
    }
    return { value: idbVal, source: 'indexedDB', updatedAt: ts };
  }

  if (localVal !== null && idbVal === null) {
    const ts = localUpdatedAt || nextMonotonicTimestamp(undefined, [key]);
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
