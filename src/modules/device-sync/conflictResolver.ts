import { computeDeterministicHash } from './pairingService';
import {
  ConflictResolutionChoice,
  DeviceSyncRole,
  SyncConflictItem,
  SyncRecordEnvelope,
} from './types';

export function areAllConflictsResolved(conflicts: SyncConflictItem[]): boolean {
  return conflicts.every((c) => Boolean(c.selectedChoice));
}

export function applyConflictChoiceToItem(
  conflict: SyncConflictItem,
  choice: ConflictResolutionChoice,
  manualData?: unknown
): SyncConflictItem {
  return {
    ...conflict,
    selectedChoice: choice,
    manualEditedData: choice === 'manual-edit' ? manualData ?? conflict.phoneEnvelope.data : undefined,
  };
}

function isMeaningfulValue(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    return (
      trimmed !== '' &&
      trimmed !== '—' &&
      trimmed !== '-' &&
      trimmed !== 'UNSET' &&
      trimmed !== 'unchecked'
    );
  }
  if (Array.isArray(val)) return val.length > 0;
  return true;
}

/**
 * تکمیل غیرمخرب فیلدهای خالی رکورد پایه از رکورد مکمل
 * (هیچ فیلد دارای مقدار در رکورد پایه بازنویسی یا حذف نمی‌شود؛ فقط فیلدهای خالی تکمیل می‌گردند)
 */
export function mergeComplementaryFields<T = unknown>(primaryData: T, secondaryData: T): T {
  if (
    !primaryData ||
    typeof primaryData !== 'object' ||
    !secondaryData ||
    typeof secondaryData !== 'object'
  ) {
    return primaryData;
  }
  const primaryObj = primaryData as Record<string, unknown>;
  const secondaryObj = secondaryData as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...primaryObj };

  for (const [k, secVal] of Object.entries(secondaryObj)) {
    if (k === 'key' || k === '_updatedAt') continue;
    const priVal = primaryObj[k];
    if (!isMeaningfulValue(priVal) && isMeaningfulValue(secVal)) {
      merged[k] = secVal;
    }
  }
  return merged as T;
}

/**
 * استخراج نسخه نهایی رکورد پس از تصمیم کاربر یا ادغام اولیه تعارض:
 * - keep-phone: حفظ نسخه مرجع گوشی (همراه با تکمیل فیلدهای خالی از نسخه لپ‌تاپ تا هیچ داده‌ای از بین نرود)
 * - accept-pc: پذیرش نسخه لپ‌تاپ (همراه با تکمیل فیلدهای خالی از نسخه گوشی)
 * - manual-edit: اعمال نسخه اصلاح‌شده دستی توسط کاربر
 */
export function buildResolvedEnvelopeFromConflict(
  conflict: SyncConflictItem,
  localDeviceId: string,
  localRole: DeviceSyncRole
): SyncRecordEnvelope {
  const choice = conflict.selectedChoice || 'keep-phone';

  let chosenData: unknown;

  if (choice === 'keep-phone') {
    chosenData = mergeComplementaryFields(
      conflict.phoneEnvelope.data,
      conflict.pcEnvelope.data
    );
  } else if (choice === 'accept-pc') {
    chosenData = mergeComplementaryFields(
      conflict.pcEnvelope.data,
      conflict.phoneEnvelope.data
    );
  } else {
    chosenData = conflict.manualEditedData ?? conflict.phoneEnvelope.data;
  }

  const maxRev = Math.max(
    conflict.phoneEnvelope.meta.revision || 1,
    conflict.pcEnvelope.meta.revision || 1
  );

  const canonicalDataJson = canonicalizeRecordData(chosenData);
  const newChangeId = computeDeterministicHash(
    `${conflict.collection}:${conflict.recordId}:${canonicalDataJson}`
  );

  return {
    meta: {
      recordId: conflict.recordId,
      collection: conflict.collection,
      createdAtMs: Math.min(
        conflict.phoneEnvelope.meta.createdAtMs || Date.now(),
        conflict.pcEnvelope.meta.createdAtMs || Date.now()
      ),
      updatedAtMs: Date.now(),
      revision: maxRev + 1,
      changeId: newChangeId,
      lastModifiedByDevice: localDeviceId,
      lastModifiedRole: localRole,
      softDeleted: false,
    },
    titleSummary: conflict.titleSummary,
    data: chosenData,
  };
}

export function canonicalizeRecordData(data: unknown): string {
  if (!data || typeof data !== 'object') {
    return JSON.stringify(data);
  }
  const clone = { ...(data as Record<string, unknown>) };
  // حذف فیلدهای موقت زمان‌بندی داخلی تا مقایسه محتوایی کاملاً قطعی و تکرارپذیر (Idempotent) باشد
  delete clone._updatedAt;
  delete clone.updatedAt;
  delete clone.updatedAtMs;
  const sortedKeys = Object.keys(clone).sort();
  const ordered: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    ordered[k] = clone[k];
  }
  return JSON.stringify(ordered);
}
