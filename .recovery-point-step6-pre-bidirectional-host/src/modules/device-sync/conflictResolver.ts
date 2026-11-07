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

/**
 * استخراج نسخه نهایی رکورد پس از تصمیم صریح کاربر روی تعارض:
 * - keep-phone: حفظ کامل نسخه گوشی
 * - accept-pc: پذیرش نسخه کامپیوتر
 * - manual-edit: اعمال نسخه اصلاح‌شده دستی توسط کاربر
 */
export function buildResolvedEnvelopeFromConflict(
  conflict: SyncConflictItem,
  localDeviceId: string,
  localRole: DeviceSyncRole
): SyncRecordEnvelope {
  const choice = conflict.selectedChoice || 'keep-phone';

  let chosenData: unknown;
  let baseEnvelope: SyncRecordEnvelope;

  if (choice === 'keep-phone') {
    baseEnvelope = conflict.phoneEnvelope;
    chosenData = conflict.phoneEnvelope.data;
  } else if (choice === 'accept-pc') {
    baseEnvelope = conflict.pcEnvelope;
    chosenData = conflict.pcEnvelope.data;
  } else {
    baseEnvelope = conflict.phoneEnvelope;
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
  const sortedKeys = Object.keys(clone).sort();
  const ordered: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    ordered[k] = clone[k];
  }
  return JSON.stringify(ordered);
}
