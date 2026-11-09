import {
  getLocalKeyTimestamp,
  hydrateOperationalKey,
  OPERATIONAL_STORAGE_KEYS,
  saveOperationalData,
  saveOperationalDataBatchAtomic,
} from '../../utils/indexedDbStorage';
import { detectDefaultDeviceRole, generateCryptoRandomToken } from './pairingService';
import {
  DeviceSyncRole,
  RecordSyncMeta,
  SyncRecordEnvelope,
  TransferHistoryEntry,
} from './types';

const DEVICE_ID_KEY = 'book_p2p_device_id_v1';
const DEVICE_ROLE_KEY = 'book_p2p_device_role_v1';
export const RECORD_META_MAP_KEY = OPERATIONAL_STORAGE_KEYS.syncRecordMeta;
export const BASELINE_CHANGE_MAP_KEY = OPERATIONAL_STORAGE_KEYS.syncBaselineHashes;
const SOFT_DELETED_ARCHIVE_KEY = 'book_p2p_soft_deleted_archive_v1';
export const APPLIED_PACKAGES_KEY = OPERATIONAL_STORAGE_KEYS.syncAppliedPackages;
const TRANSFER_HISTORY_KEY = 'book_p2p_transfer_history_v1';

export interface SyncMetadataSnapshot {
  recordMetaMap: Record<string, RecordSyncMeta>;
  baselineChangeMap: Record<string, string>;
  appliedPackageIds: string[];
}

export interface SyncMetadataCommitResult {
  ok: boolean;
  idbSaved: boolean;
  localSaved: boolean;
  updatedAt?: number;
  error?: string;
}

// کش هماهنگ‌شده صرفاً برای مقادیری که به‌صورت پایدار در IndexedDB ذخیره یا از آن بازیابی شده‌اند
// (هرگز به عنوان جایگزین حافظه موقت در صورت شکست ذخیره‌سازی پایدار استفاده نمی‌شود)
let hydratedRecordMetaCache: Record<string, RecordSyncMeta> | null = null;
let hydratedRecordMetaUpdatedAt = 0;

let hydratedBaselineCache: Record<string, string> | null = null;
let hydratedBaselineUpdatedAt = 0;

let hydratedAppliedPackagesCache: string[] | null = null;
let hydratedAppliedPackagesUpdatedAt = 0;

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

function readLocalRecordMetaMap(): Record<string, RecordSyncMeta> | null {
  try {
    const raw = localStorage.getItem(RECORD_META_MAP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, RecordSyncMeta>;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function readLocalBaselineChangeMap(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(BASELINE_CHANGE_MAP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function readLocalAppliedPackageIds(): string[] | null {
  try {
    const raw = localStorage.getItem(APPLIED_PACKAGES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as string[];
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * بازیابی پایدار متادیتای همگام‌سازی (RECORD_META_MAP_KEY، BASELINE_CHANGE_MAP_KEY، APPLIED_PACKAGES_KEY)
 * از IndexedDB و localStorage هنگام راه‌اندازی مجدد برنامه و پیش از اجرای analyzeIncomingPackage و hasPackageBeenApplied
 */
export async function hydrateSyncMetadataFromStorage(): Promise<SyncMetadataSnapshot> {
  const localMetaFallback = readLocalRecordMetaMap() || {};
  const localBaselineFallback = readLocalBaselineChangeMap() || {};
  const localAppliedFallback = readLocalAppliedPackageIds() || [];

  const [hydMeta, hydBaseline, hydApplied] = await Promise.all([
    hydrateOperationalKey<Record<string, RecordSyncMeta>>(RECORD_META_MAP_KEY, localMetaFallback),
    hydrateOperationalKey<Record<string, string>>(BASELINE_CHANGE_MAP_KEY, localBaselineFallback),
    hydrateOperationalKey<string[]>(APPLIED_PACKAGES_KEY, localAppliedFallback),
  ]);

  const recordMetaMap =
    hydMeta.value && typeof hydMeta.value === 'object' && !Array.isArray(hydMeta.value)
      ? { ...hydMeta.value }
      : {};
  const baselineChangeMap =
    hydBaseline.value && typeof hydBaseline.value === 'object' && !Array.isArray(hydBaseline.value)
      ? { ...hydBaseline.value }
      : {};
  const appliedPackageIds = Array.isArray(hydApplied.value) ? [...hydApplied.value] : [];

  if (hydMeta.source !== 'fallback' || Object.keys(recordMetaMap).length > 0) {
    hydratedRecordMetaCache = recordMetaMap;
    hydratedRecordMetaUpdatedAt = Math.max(hydMeta.updatedAt, getLocalKeyTimestamp(RECORD_META_MAP_KEY));
  }
  if (hydBaseline.source !== 'fallback' || Object.keys(baselineChangeMap).length > 0) {
    hydratedBaselineCache = baselineChangeMap;
    hydratedBaselineUpdatedAt = Math.max(
      hydBaseline.updatedAt,
      getLocalKeyTimestamp(BASELINE_CHANGE_MAP_KEY)
    );
  }
  if (hydApplied.source !== 'fallback' || appliedPackageIds.length > 0) {
    hydratedAppliedPackagesCache = appliedPackageIds;
    hydratedAppliedPackagesUpdatedAt = Math.max(
      hydApplied.updatedAt,
      getLocalKeyTimestamp(APPLIED_PACKAGES_KEY)
    );
  }

  return {
    recordMetaMap: { ...recordMetaMap },
    baselineChangeMap: { ...baselineChangeMap },
    appliedPackageIds: [...appliedPackageIds],
  };
}

/**
 * به‌روزرسانی کش متادیتای بازیابی‌شده صرفاً پس از تأیید ذخیره پایدار در تراکنش IndexedDB
 */
export function applyCommittedSyncMetadataToCache(
  snapshot: SyncMetadataSnapshot,
  updatedAt: number
): void {
  hydratedRecordMetaCache = { ...snapshot.recordMetaMap };
  hydratedRecordMetaUpdatedAt = updatedAt;

  hydratedBaselineCache = { ...snapshot.baselineChangeMap };
  hydratedBaselineUpdatedAt = updatedAt;

  hydratedAppliedPackagesCache = [...snapshot.appliedPackageIds];
  hydratedAppliedPackagesUpdatedAt = updatedAt;
}

export function loadRecordMetaMap(): Record<string, RecordSyncMeta> {
  const localTs = getLocalKeyTimestamp(RECORD_META_MAP_KEY);
  const localParsed = readLocalRecordMetaMap();

  if (
    hydratedRecordMetaCache !== null &&
    (localParsed === null || hydratedRecordMetaUpdatedAt >= localTs)
  ) {
    return { ...hydratedRecordMetaCache };
  }
  if (localParsed !== null) {
    return { ...localParsed };
  }
  return {};
}

export function saveRecordMetaMap(map: Record<string, RecordSyncMeta>): boolean {
  const prevCache = hydratedRecordMetaCache ? { ...hydratedRecordMetaCache } : null;
  const prevTs = hydratedRecordMetaUpdatedAt;
  const now = Date.now();
  hydratedRecordMetaCache = { ...map };
  hydratedRecordMetaUpdatedAt = Math.max(prevTs, now);

  void saveOperationalData(RECORD_META_MAP_KEY, map, now).then((res) => {
    if (res.idbSaved || res.localSaved) {
      hydratedRecordMetaCache = { ...map };
      hydratedRecordMetaUpdatedAt = res.updatedAt;
    } else {
      hydratedRecordMetaCache = prevCache;
      hydratedRecordMetaUpdatedAt = prevTs;
    }
  });
  return true;
}

/**
 * ذخیره آخرین changeId همگام‌شده هر رکورد تا بتوانیم تشخیص دهیم آیا یک رکورد
 * فقط در یک دستگاه تغییر کرده یا در هر دو دستگاه تغییر کرده است (تشخیص دقیق تعارض)
 */
export function loadBaselineChangeMap(): Record<string, string> {
  const localTs = getLocalKeyTimestamp(BASELINE_CHANGE_MAP_KEY);
  const localParsed = readLocalBaselineChangeMap();

  if (
    hydratedBaselineCache !== null &&
    (localParsed === null || hydratedBaselineUpdatedAt >= localTs)
  ) {
    return { ...hydratedBaselineCache };
  }
  if (localParsed !== null) {
    return { ...localParsed };
  }
  return {};
}

export function saveBaselineChangeMap(map: Record<string, string>): boolean {
  const prevCache = hydratedBaselineCache ? { ...hydratedBaselineCache } : null;
  const prevTs = hydratedBaselineUpdatedAt;
  const now = Date.now();
  hydratedBaselineCache = { ...map };
  hydratedBaselineUpdatedAt = Math.max(prevTs, now);

  void saveOperationalData(BASELINE_CHANGE_MAP_KEY, map, now).then((res) => {
    if (res.idbSaved || res.localSaved) {
      hydratedBaselineCache = { ...map };
      hydratedBaselineUpdatedAt = res.updatedAt;
    } else {
      hydratedBaselineCache = prevCache;
      hydratedBaselineUpdatedAt = prevTs;
    }
  });
  return true;
}

/**
 * پاک‌سازی کش درون‌حافظه‌ای جهت شبیه‌سازی Refresh یا بستن و بازکردن کامل مرورگر در تست‌ها
 */
export function resetSyncMetadataFallbackForTesting(): void {
  hydratedRecordMetaCache = null;
  hydratedRecordMetaUpdatedAt = 0;
  hydratedBaselineCache = null;
  hydratedBaselineUpdatedAt = 0;
  hydratedAppliedPackagesCache = null;
  hydratedAppliedPackagesUpdatedAt = 0;
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
  const localTs = getLocalKeyTimestamp(APPLIED_PACKAGES_KEY);
  const localParsed = readLocalAppliedPackageIds();

  if (
    hydratedAppliedPackagesCache !== null &&
    (localParsed === null || hydratedAppliedPackagesUpdatedAt >= localTs)
  ) {
    return [...hydratedAppliedPackagesCache];
  }
  if (localParsed !== null) {
    return [...localParsed];
  }
  return [];
}

export function hasPackageBeenApplied(packageId: string): boolean {
  if (!packageId) return false;
  return loadAppliedPackageIds().includes(packageId);
}

export async function hasPackageBeenAppliedAsync(packageId: string): Promise<boolean> {
  if (!packageId) return false;
  await hydrateSyncMetadataFromStorage();
  return loadAppliedPackageIds().includes(packageId);
}

export function recordAppliedPackageId(packageId: string): boolean {
  const list = loadAppliedPackageIds();
  const next = !list.includes(packageId) ? [packageId, ...list].slice(0, 200) : list;
  const prevCache = hydratedAppliedPackagesCache ? [...hydratedAppliedPackagesCache] : null;
  const prevTs = hydratedAppliedPackagesUpdatedAt;
  const now = Date.now();
  hydratedAppliedPackagesCache = [...next];
  hydratedAppliedPackagesUpdatedAt = Math.max(prevTs, now);

  void saveOperationalData(APPLIED_PACKAGES_KEY, next, now).then((res) => {
    if (res.idbSaved || res.localSaved) {
      hydratedAppliedPackagesCache = [...next];
      hydratedAppliedPackagesUpdatedAt = res.updatedAt;
    } else {
      hydratedAppliedPackagesCache = prevCache;
      hydratedAppliedPackagesUpdatedAt = prevTs;
    }
  });
  return true;
}

/**
 * ثبت پایدار و اتمیک متادیتای همگام‌سازی (RECORD_META_MAP_KEY، BASELINE_CHANGE_MAP_KEY، APPLIED_PACKAGES_KEY)
 * در IndexedDB (و localStorage در صورت وجود فضا) بدون هیچ‌گونه وابستگی به حافظه موقت (inMemoryFallback):
 * - هر سه کلید متادیتا در یک تراکنش اتمیک IndexedDB ذخیره می‌شوند.
 * - اگر ذخیره پایدار در IndexedDB شکست بخورد، تغییرات localStorage نیز به وضعیت قبلی بازگردانده شده و ok: false برمی‌گردد.
 * - اگر localStorage پر باشد ولی ذخیره اتمیک در IndexedDB موفق شود، داده در IndexedDB پایدار است و پس از Refresh یا بستن و بازکردن مرورگر بازیابی می‌شود.
 */
export async function commitSyncMetadataAtomically(params: {
  recordMetaMap: Record<string, RecordSyncMeta>;
  baselineChangeMap: Record<string, string>;
  packageId: string;
  explicitTimestamp?: number;
}): Promise<SyncMetadataCommitResult> {
  await hydrateSyncMetadataFromStorage();

  let prevMetaRaw: string | null = null;
  let prevBaselineRaw: string | null = null;
  let prevAppliedRaw: string | null = null;
  let prevStorageMetaRaw: string | null = null;

  try {
    prevMetaRaw = localStorage.getItem(RECORD_META_MAP_KEY);
    prevBaselineRaw = localStorage.getItem(BASELINE_CHANGE_MAP_KEY);
    prevAppliedRaw = localStorage.getItem(APPLIED_PACKAGES_KEY);
    prevStorageMetaRaw = localStorage.getItem('book_storage_meta_v1');
  } catch {
    // ignore
  }

  const rollbackLocalMetadata = () => {
    try {
      if (prevMetaRaw === null) localStorage.removeItem(RECORD_META_MAP_KEY);
      else localStorage.setItem(RECORD_META_MAP_KEY, prevMetaRaw);

      if (prevBaselineRaw === null) localStorage.removeItem(BASELINE_CHANGE_MAP_KEY);
      else localStorage.setItem(BASELINE_CHANGE_MAP_KEY, prevBaselineRaw);

      if (prevAppliedRaw === null) localStorage.removeItem(APPLIED_PACKAGES_KEY);
      else localStorage.setItem(APPLIED_PACKAGES_KEY, prevAppliedRaw);

      if (prevStorageMetaRaw === null) localStorage.removeItem('book_storage_meta_v1');
      else localStorage.setItem('book_storage_meta_v1', prevStorageMetaRaw);
    } catch {
      // ignore rollback error
    }
  };

  const currentApplied = loadAppliedPackageIds();
  const nextApplied =
    params.packageId && !currentApplied.includes(params.packageId)
      ? [params.packageId, ...currentApplied].slice(0, 200)
      : currentApplied;

  const batchRes = await saveOperationalDataBatchAtomic(
    [
      { key: RECORD_META_MAP_KEY, value: params.recordMetaMap },
      { key: BASELINE_CHANGE_MAP_KEY, value: params.baselineChangeMap },
      { key: APPLIED_PACKAGES_KEY, value: nextApplied },
    ],
    params.explicitTimestamp
  );

  if (!batchRes.ok || !batchRes.idbSaved) {
    rollbackLocalMetadata();
    return {
      ok: false,
      idbSaved: false,
      localSaved: false,
      updatedAt: batchRes.updatedAt,
      error:
        batchRes.error ||
        'ذخیره پایدار متادیتای همگام‌سازی در IndexedDB با خطا مواجه شد؛ هیچ تغییری ثبت نگردید.',
    };
  }

  applyCommittedSyncMetadataToCache(
    {
      recordMetaMap: params.recordMetaMap,
      baselineChangeMap: params.baselineChangeMap,
      appliedPackageIds: nextApplied,
    },
    batchRes.updatedAt
  );

  return {
    ok: true,
    idbSaved: true,
    localSaved: batchRes.localSaved,
    updatedAt: batchRes.updatedAt,
  };
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
