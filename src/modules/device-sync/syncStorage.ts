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
    if (raw) return JSON.parse(raw) || {};
  } catch {
    // ignore
  }
  return {};
}

export function saveRecordMetaMap(map: Record<string, RecordSyncMeta>): boolean {
  try {
    localStorage.setItem(RECORD_META_MAP_KEY, JSON.stringify(map));
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
    if (raw) return JSON.parse(raw) || {};
  } catch {
    // ignore
  }
  return {};
}

export function saveBaselineChangeMap(map: Record<string, string>): boolean {
  try {
    localStorage.setItem(BASELINE_CHANGE_MAP_KEY, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
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
    if (raw) return JSON.parse(raw) || [];
  } catch {
    // ignore
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
    }
    return true;
  } catch {
    return false;
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
