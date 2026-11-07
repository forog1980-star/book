import { detectDefaultDeviceRole, generateCryptoRandomToken } from './pairingService';
import {
  DeviceSyncRole,
  RecordSyncMeta,
  SyncRecordEnvelope,
  TransferHistoryEntry,
} from './types';

const DEVICE_ID_KEY = 'book_p2p_device_id_v1';
const DEVICE_ROLE_KEY = 'book_p2p_device_role_v1';
const RECORD_META_MAP_KEY = 'book_p2p_record_meta_v1';
const BASELINE_CHANGE_MAP_KEY = 'book_p2p_baseline_hashes_v1';
const SOFT_DELETED_ARCHIVE_KEY = 'book_p2p_soft_deleted_archive_v1';
const APPLIED_PACKAGES_KEY = 'book_p2p_applied_packages_v1';
const TRANSFER_HISTORY_KEY = 'book_p2p_transfer_history_v1';

export function getOrCreateLocalDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const rand = generateCryptoRandomToken(8);
    const created = `DEV_${rand}_${Date.now().toString(36).toUpperCase()}`;
    localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    return 'DEV_LOCAL_FALLBACK';
  }
}

export function getSavedDeviceRole(): DeviceSyncRole {
  try {
    const raw = localStorage.getItem(DEVICE_ROLE_KEY);
    if (raw === 'phone-primary' || raw === 'pc-companion') {
      return raw;
    }
  } catch {
    // ignore
  }
  return detectDefaultDeviceRole();
}

export function saveDeviceRole(role: DeviceSyncRole): void {
  try {
    localStorage.setItem(DEVICE_ROLE_KEY, role);
  } catch {
    // ignore
  }
}

export function loadRecordMetaMap(): Record<string, RecordSyncMeta> {
  try {
    const raw = localStorage.getItem(RECORD_META_MAP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  if (inMemoryIdbFallbackActive && Object.keys(inMemoryRecordMetaFallback).length > 0) {
    return { ...inMemoryRecordMetaFallback };
  }
  return {};
}

export function saveRecordMetaMap(map: Record<string, RecordSyncMeta>): boolean {
  try {
    localStorage.setItem(RECORD_META_MAP_KEY, JSON.stringify(map));
    inMemoryRecordMetaFallback = { ...map };
    return true;
  } catch {
    return false;
  }
}

/**
 * ذخیره آخرین changeId همگام‌شده هر رکورد تا بتوانیم تشخیص دهیم آیا یک رکورد
 * فقط در یک دستگاه تغییر کرده یا در هر دو دستگاه تغییر کرده است (تشخیص دقیق تعارض)
 */
export function loadBaselineChangeMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(BASELINE_CHANGE_MAP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  if (inMemoryIdbFallbackActive && Object.keys(inMemoryBaselineFallback).length > 0) {
    return { ...inMemoryBaselineFallback };
  }
  return {};
}

export function saveBaselineChangeMap(map: Record<string, string>): boolean {
  try {
    localStorage.setItem(BASELINE_CHANGE_MAP_KEY, JSON.stringify(map));
    inMemoryBaselineFallback = { ...map };
    return true;
  } catch {
    return false;
  }
}

export function resetSyncMetadataFallbackForTesting(): void {
  inMemoryIdbFallbackActive = false;
  inMemoryRecordMetaFallback = {};
  inMemoryBaselineFallback = {};
  inMemoryAppliedPackagesFallback = [];
}

/**
 * بایگانی رکوردهای حذف‌شده نرم (Soft-Delete Archive) برای تضمین عدم حذف فیزیکی خودکار
 * و امکان بازیابی کامل در هر زمان
 */
export function loadSoftDeletedArchive(): Record<string, SyncRecordEnvelope> {
  try {
    const raw = localStorage.getItem(SOFT_DELETED_ARCHIVE_KEY);
    if (raw) return JSON.parse(raw) || {};
  } catch {
    // ignore
  }
  return {};
}

export function saveSoftDeletedArchive(archive: Record<string, SyncRecordEnvelope>): boolean {
  try {
    localStorage.setItem(SOFT_DELETED_ARCHIVE_KEY, JSON.stringify(archive));
    return true;
  } catch {
    return false;
  }
}

export function markRecordSoftDeleted(envelope: SyncRecordEnvelope): void {
  const archive = loadSoftDeletedArchive();
  const compositeKey = `${envelope.meta.collection}:${envelope.meta.recordId}`;
  archive[compositeKey] = {
    ...envelope,
    meta: {
      ...envelope.meta,
      softDeleted: true,
      deletedAtMs: Date.now(),
      updatedAtMs: Date.now(),
      revision: (envelope.meta.revision || 1) + 1,
    },
  };
  saveSoftDeletedArchive(archive);
}

export function restoreSoftDeletedRecord(compositeKey: string): SyncRecordEnvelope | null {
  const archive = loadSoftDeletedArchive();
  const found = archive[compositeKey];
  if (!found) return null;
  delete archive[compositeKey];
  saveSoftDeletedArchive(archive);
  return {
    ...found,
    meta: {
      ...found.meta,
      softDeleted: false,
      deletedAtMs: undefined,
      updatedAtMs: Date.now(),
    },
  };
}

export function loadAppliedPackageIds(): string[] {
  try {
    const raw = localStorage.getItem(APPLIED_PACKAGES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  if (inMemoryIdbFallbackActive && inMemoryAppliedPackagesFallback.length > 0) {
    return [...inMemoryAppliedPackagesFallback];
  }
  return [];
}

export function hasPackageBeenApplied(packageId: string): boolean {
  if (!packageId) return false;
  return loadAppliedPackageIds().includes(packageId);
}

export function recordAppliedPackageId(packageId: string): boolean {
  try {
    const list = loadAppliedPackageIds();
    if (!list.includes(packageId)) {
      const next = [packageId, ...list].slice(0, 200);
      localStorage.setItem(APPLIED_PACKAGES_KEY, JSON.stringify(next));
      inMemoryAppliedPackagesFallback = next;
    }
    return true;
  } catch {
    return false;
  }
}

let inMemoryIdbFallbackActive = false;
let inMemoryRecordMetaFallback: Record<string, RecordSyncMeta> = {};
let inMemoryBaselineFallback: Record<string, string> = {};
let inMemoryAppliedPackagesFallback: string[] = [];

/**
 * ثبت اتمیک متادیتای همگام‌سازی (recordMeta، baseline و appliedPackages) همراه با Rollback کامل در صورت خطا:
 * - اگر نوشتن هر یک از ۳ کلید در localStorage با خطا مواجه شود، تمام کلیدهای متادیتا در localStorage به نسخه قبلی بازگردانده می‌شوند.
 * - اگر ذخیره اتمیک Dataset در IndexedDB موفق بوده ولی localStorage پر شده باشد (allowInMemoryFallback: true)،
 *   وضعیت متادیتا در حافظه نشست حفظ می‌شود تا عملیات همگام‌سازی بدون خطای کاذب تکمیل گردد.
 */
export function commitSyncMetadataAtomically(params: {
  recordMetaMap: Record<string, RecordSyncMeta>;
  baselineChangeMap: Record<string, string>;
  packageId: string;
  allowInMemoryFallback?: boolean;
}): { ok: boolean; localSaved: boolean; error?: string } {
  let prevMetaRaw: string | null = null;
  let prevBaselineRaw: string | null = null;
  let prevAppliedRaw: string | null = null;

  try {
    prevMetaRaw = localStorage.getItem(RECORD_META_MAP_KEY);
    prevBaselineRaw = localStorage.getItem(BASELINE_CHANGE_MAP_KEY);
    prevAppliedRaw = localStorage.getItem(APPLIED_PACKAGES_KEY);
  } catch {
    // ignore
  }

  const currentApplied = loadAppliedPackageIds();
  const nextApplied =
    params.packageId && !currentApplied.includes(params.packageId)
      ? [params.packageId, ...currentApplied].slice(0, 200)
      : currentApplied;

  try {
    localStorage.setItem(RECORD_META_MAP_KEY, JSON.stringify(params.recordMetaMap));
    localStorage.setItem(BASELINE_CHANGE_MAP_KEY, JSON.stringify(params.baselineChangeMap));
    localStorage.setItem(APPLIED_PACKAGES_KEY, JSON.stringify(nextApplied));

    inMemoryIdbFallbackActive = false;
    inMemoryRecordMetaFallback = { ...params.recordMetaMap };
    inMemoryBaselineFallback = { ...params.baselineChangeMap };
    inMemoryAppliedPackagesFallback = [...nextApplied];
    return { ok: true, localSaved: true };
  } catch (err) {
    // بازگردانی کامل هر ۳ کلید در localStorage به وضعیت پیش از تراکنش
    try {
      if (prevMetaRaw === null) {
        localStorage.removeItem(RECORD_META_MAP_KEY);
      } else {
        localStorage.setItem(RECORD_META_MAP_KEY, prevMetaRaw);
      }
      if (prevBaselineRaw === null) {
        localStorage.removeItem(BASELINE_CHANGE_MAP_KEY);
      } else {
        localStorage.setItem(BASELINE_CHANGE_MAP_KEY, prevBaselineRaw);
      }
      if (prevAppliedRaw === null) {
        localStorage.removeItem(APPLIED_PACKAGES_KEY);
      } else {
        localStorage.setItem(APPLIED_PACKAGES_KEY, prevAppliedRaw);
      }
    } catch {
      // ignore rollback error
    }

    if (params.allowInMemoryFallback) {
      inMemoryIdbFallbackActive = true;
      inMemoryRecordMetaFallback = { ...params.recordMetaMap };
      inMemoryBaselineFallback = { ...params.baselineChangeMap };
      inMemoryAppliedPackagesFallback = [...nextApplied];
      return { ok: true, localSaved: false };
    }

    return {
      ok: false,
      localSaved: false,
      error:
        err instanceof Error
          ? `خطا در ذخیره متادیتای همگام‌سازی در حافظه محلی: ${err.message}`
          : 'ذخیره پایدار متادیتای همگام‌سازی یا خط مبنا در حافظه محلی با خطا مواجه شد.',
    };
  }
}

export function loadTransferHistory(): TransferHistoryEntry[] {
  try {
    const raw = localStorage.getItem(TRANSFER_HISTORY_KEY);
    if (raw) return JSON.parse(raw) || [];
  } catch {
    // ignore
  }
  return [];
}

export function appendTransferHistory(entry: TransferHistoryEntry): TransferHistoryEntry[] {
  const current = loadTransferHistory();
  const filtered = current.filter((item) => item.packageId !== entry.packageId);
  const next = [entry, ...filtered].slice(0, 100);
  try {
    localStorage.setItem(TRANSFER_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}
