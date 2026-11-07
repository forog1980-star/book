import {
  BookCopyRecord,
  BookMartyrLinkRecord,
  CustomMartyrRecord,
  FieldAuditRecord,
  INITIAL_BOOK_COPIES,
  INITIAL_BOOK_MARTYR_LINKS,
  PendingReviewItem,
} from '../../data/markazAsnadData';
import {
  buildResolvedEnvelopeFromConflict,
  canonicalizeRecordData,
} from './conflictResolver';
import { computeDeterministicHash, generateCryptoRandomToken } from './pairingService';
import {
  hasPackageBeenApplied,
  loadBaselineChangeMap,
  loadRecordMetaMap,
  loadSoftDeletedArchive,
  markRecordSoftDeleted,
  recordAppliedPackageId,
  restoreSoftDeletedRecord,
  saveBaselineChangeMap,
  saveRecordMetaMap,
} from './syncStorage';
import {
  DeviceSyncRole,
  OperationalSyncDataset,
  RecordSyncMeta,
  SUPPORTED_SYNC_PROTOCOL_VERSION,
  SyncCollectionName,
  SyncConflictItem,
  SyncDiffItem,
  SyncPreviewReport,
  SyncRecordEnvelope,
  SyncTransferPackage,
} from './types';

const DEFAULT_INITIAL_COPY_IDS = new Set(INITIAL_BOOK_COPIES.map((c) => c.copyId));
const DEFAULT_INITIAL_LINK_IDS = new Set(INITIAL_BOOK_MARTYR_LINKS.map((l) => l.id));

const VALID_COLLECTIONS = new Set<SyncCollectionName>([
  'auditRecords',
  'bookCopies',
  'customMartyrs',
  'links',
  'pendingReviews',
]);

export function getCompositeKey(collection: SyncCollectionName, recordId: string): string {
  return `${collection}:${recordId}`;
}

function buildOrUpdateMeta(
  collection: SyncCollectionName,
  recordId: string,
  data: unknown,
  existingMetaMap: Record<string, RecordSyncMeta>,
  localDeviceId: string,
  localRole: DeviceSyncRole
): RecordSyncMeta {
  const compKey = getCompositeKey(collection, recordId);
  const canonical = canonicalizeRecordData(data);
  const currentChangeId = computeDeterministicHash(`${collection}:${recordId}:${canonical}`);
  const prevMeta = existingMetaMap[compKey];

  const recordAny = (data || {}) as Record<string, unknown>;
  const explicitTs = Number(recordAny._updatedAt || 0);
  const now = Date.now();

  if (!prevMeta) {
    return {
      recordId,
      collection,
      createdAtMs: explicitTs > 1 ? explicitTs : now,
      updatedAtMs: explicitTs > 1 ? explicitTs : now,
      revision: 1,
      changeId: currentChangeId,
      lastModifiedByDevice: localDeviceId,
      lastModifiedRole: localRole,
      softDeleted: false,
    };
  }

  if (prevMeta.changeId !== currentChangeId || prevMeta.softDeleted) {
    return {
      ...prevMeta,
      updatedAtMs: explicitTs > prevMeta.updatedAtMs ? explicitTs : now,
      revision: (prevMeta.revision || 1) + 1,
      changeId: currentChangeId,
      lastModifiedByDevice: localDeviceId,
      lastModifiedRole: localRole,
      softDeleted: false,
      deletedAtMs: undefined,
    };
  }

  return prevMeta;
}

/**
 * استخراج تمام رکوردهای عملیاتی دستگاه همراه با شناسه‌های پایدار و متادیتای استاندارد (SHA-256)
 */
export function extractLocalEnvelopesMap(
  dataset: OperationalSyncDataset,
  localDeviceId: string,
  localRole: DeviceSyncRole,
  selectedCollections: SyncCollectionName[] = [
    'auditRecords',
    'bookCopies',
    'customMartyrs',
    'links',
    'pendingReviews',
  ]
): Map<string, SyncRecordEnvelope> {
  const metaMap = loadRecordMetaMap();
  const updatedMetaMap: Record<string, RecordSyncMeta> = { ...metaMap };
  const result = new Map<string, SyncRecordEnvelope>();
  const colSet = new Set(selectedCollections);

  // ۱. اطلاعات و مکان کتاب‌ها در قفسه (شامل همان ۱۸ رکورد گوشی یا هر ثبت دیگر)
  if (colSet.has('auditRecords')) {
    for (const [key, rec] of Object.entries(dataset.auditRecords || {})) {
      if (!rec) continue;
      const recordId = rec.key || key;
      const meta = buildOrUpdateMeta(
        'auditRecords',
        recordId,
        rec,
        updatedMetaMap,
        localDeviceId,
        localRole
      );
      const compKey = getCompositeKey('auditRecords', recordId);
      updatedMetaMap[compKey] = meta;
      result.set(compKey, {
        meta,
        titleSummary: `${rec.title || 'کتاب بدون عنوان'} (${rec.location || 'بدون کد قفسه'})`,
        data: rec,
      });
    }
  }

  // ۲. نسخه‌های فیزیکی کتاب (فقط نسخه‌های ثبت‌شده جدید یا تغییریافته نسبت به پیش‌فرض اولیه)
  if (colSet.has('bookCopies')) {
    for (const cp of dataset.bookCopies || []) {
      if (!cp || !cp.copyId) continue;
      const isInitialUnchanged =
        DEFAULT_INITIAL_COPY_IDS.has(cp.copyId) &&
        (!cp.locationHistory || cp.locationHistory.length <= 1);
      if (isInitialUnchanged) continue;

      const meta = buildOrUpdateMeta(
        'bookCopies',
        cp.copyId,
        cp,
        updatedMetaMap,
        localDeviceId,
        localRole
      );
      const compKey = getCompositeKey('bookCopies', cp.copyId);
      updatedMetaMap[compKey] = meta;
      result.set(compKey, {
        meta,
        titleSummary: `نسخه ${cp.copyId} — ${cp.bookTitle || cp.bookId} (${cp.location})`,
        data: cp,
      });
    }
  }

  // ۳. پرونده‌های شهدای ثبت‌شده دستی
  if (colSet.has('customMartyrs')) {
    for (const m of dataset.customMartyrs || []) {
      if (!m || !m.martyrId) continue;
      const meta = buildOrUpdateMeta(
        'customMartyrs',
        m.martyrId,
        m,
        updatedMetaMap,
        localDeviceId,
        localRole
      );
      const compKey = getCompositeKey('customMartyrs', m.martyrId);
      updatedMetaMap[compKey] = meta;
      result.set(compKey, {
        meta,
        titleSummary: `شهید ${m.fullName} (قطعه ${m.gravePiece || '—'})`,
        data: m,
      });
    }
  }

  // ۴. ارتباط‌های پژوهشی کتاب و شهید (فقط موارد ثبت‌شده یا ویرایش‌شده توسط کاربر)
  if (colSet.has('links')) {
    for (const lnk of dataset.links || []) {
      if (!lnk || !lnk.id) continue;
      const isStaticSorehMehr =
        lnk.id.startsWith('SM-LINK-') && lnk.reviewStatus === 'پیشنهادی';
      const isStaticDefault =
        DEFAULT_INITIAL_LINK_IDS.has(lnk.id) && lnk.reviewStatus === 'تأییدشده';
      if (isStaticSorehMehr || isStaticDefault) continue;

      const meta = buildOrUpdateMeta(
        'links',
        lnk.id,
        lnk,
        updatedMetaMap,
        localDeviceId,
        localRole
      );
      const compKey = getCompositeKey('links', lnk.id);
      updatedMetaMap[compKey] = meta;
      result.set(compKey, {
        meta,
        titleSummary: `پیوند «${lnk.bookTitleRaw}» ↔ شهید ${lnk.martyrNameRaw}`,
        data: lnk,
      });
    }
  }

  // ۵. صف بررسی و تأیید کارشناسی
  if (colSet.has('pendingReviews')) {
    for (const pv of dataset.pendingReviews || []) {
      if (!pv || !pv.trackingId) continue;
      const meta = buildOrUpdateMeta(
        'pendingReviews',
        pv.trackingId,
        pv,
        updatedMetaMap,
        localDeviceId,
        localRole
      );
      const compKey = getCompositeKey('pendingReviews', pv.trackingId);
      updatedMetaMap[compKey] = meta;
      result.set(compKey, {
        meta,
        titleSummary: `صف بررسی: «${pv.bookTitle}» ↔ ${pv.nameOrPhrase}`,
        data: pv,
      });
    }
  }

  // ۶. افزودن رکوردهای حذف‌شده نرم (Soft-Deleted) تا دستگاه مقابل از حذف نرم مطلع شود
  const softArchive = loadSoftDeletedArchive();
  for (const [compKey, env] of Object.entries(softArchive)) {
    if (colSet.has(env.meta.collection) && !result.has(compKey)) {
      result.set(compKey, env);
    }
  }

  saveRecordMetaMap(updatedMetaMap);
  return result;
}

/**
 * ساخت بسته انتقالی استاندارد (SyncTransferPackage) با شناسه تصادفی رمزنگاری‌شده و چک‌سام SHA-256
 */
export function createSyncTransferPackage(params: {
  dataset: OperationalSyncDataset;
  localDeviceId: string;
  localRole: DeviceSyncRole;
  selectedCollections?: SyncCollectionName[];
  onlyRecordKeys?: string[];
}): SyncTransferPackage {
  const cols = params.selectedCollections || [
    'auditRecords',
    'bookCopies',
    'customMartyrs',
    'links',
    'pendingReviews',
  ];

  const envMap = extractLocalEnvelopesMap(
    params.dataset,
    params.localDeviceId,
    params.localRole,
    cols
  );

  let envelopes = Array.from(envMap.values());
  if (params.onlyRecordKeys && params.onlyRecordKeys.length > 0) {
    const allowedSet = new Set(params.onlyRecordKeys);
    envelopes = envelopes.filter(
      (e) =>
        allowedSet.has(e.meta.recordId) ||
        allowedSet.has(`${e.meta.collection}:${e.meta.recordId}`)
    );
  }

  const now = Date.now();
  const randSuffix = generateCryptoRandomToken(6);
  const packageId = `PKG_${now}_${randSuffix}`;

  const bodyDigest = computeDeterministicHash(
    envelopes.map((e) => `${e.meta.collection}:${e.meta.recordId}:${e.meta.changeId}`).join('|')
  );

  return {
    packageId,
    protocolVersion: SUPPORTED_SYNC_PROTOCOL_VERSION,
    senderDeviceId: params.localDeviceId,
    senderRole: params.localRole,
    createdAtMs: now,
    selectedCollections: cols,
    recordCount: envelopes.length,
    payloadChecksum: bodyDigest,
    envelopes,
  };
}

/**
 * تحلیل بسته دریافتی و دسته‌بندی تغییرات همراه با تشخیص Replay بسته تکراری
 */
export function analyzeIncomingPackage(
  pkg: SyncTransferPackage,
  localDataset: OperationalSyncDataset,
  localDeviceId: string,
  localRole: DeviceSyncRole
): SyncPreviewReport {
  if ((pkg.protocolVersion ?? 1) !== SUPPORTED_SYNC_PROTOCOL_VERSION) {
    throw new Error(
      `نسخه پروتکل بسته دریافتی (${pkg.protocolVersion}) با نسخه این دستگاه (${SUPPORTED_SYNC_PROTOCOL_VERSION}) سازگار نیست.`
    );
  }

  const isReplayPackage = hasPackageBeenApplied(pkg.packageId);

  const localMap = extractLocalEnvelopesMap(
    localDataset,
    localDeviceId,
    localRole,
    pkg.selectedCollections
  );
  const baselineMap = loadBaselineChangeMap();

  const newItems: SyncDiffItem[] = [];
  const modifiedItems: SyncDiffItem[] = [];
  const softDeleteItems: SyncDiffItem[] = [];
  const unchangedItems: SyncDiffItem[] = [];
  const conflicts: SyncConflictItem[] = [];

  for (const incomingEnv of pkg.envelopes) {
    const { collection, recordId } = incomingEnv.meta;
    const compKey = getCompositeKey(collection, recordId);
    const localEnv = localMap.get(compKey);
    const baselineChangeId = baselineMap[compKey];

    // ۱. اگر رکورد در دستگاه گیرنده وجود ندارد (یا قبلاً حذف نرم شده است)
    if (!localEnv || localEnv.meta.softDeleted) {
      if (incomingEnv.meta.softDeleted) {
        unchangedItems.push({
          collection,
          recordId,
          titleSummary: incomingEnv.titleSummary,
          changeType: 'unchanged',
          incomingEnvelope: incomingEnv,
          localEnvelope: localEnv,
        });
      } else {
        newItems.push({
          collection,
          recordId,
          titleSummary: incomingEnv.titleSummary,
          changeType: 'new',
          incomingEnvelope: incomingEnv,
        });
      }
      continue;
    }

    // ۲. اگر رکورد دریافتی و رکورد محلی دقیقاً یکسان هستند (تضمین Idempotency)
    if (
      localEnv.meta.changeId === incomingEnv.meta.changeId &&
      Boolean(localEnv.meta.softDeleted) === Boolean(incomingEnv.meta.softDeleted)
    ) {
      unchangedItems.push({
        collection,
        recordId,
        titleSummary: incomingEnv.titleSummary,
        changeType: 'unchanged',
        incomingEnvelope: incomingEnv,
        localEnvelope: localEnv,
      });
      continue;
    }

    // ۳. اگر رکورد دریافتی درخواست حذف نرم (Soft-Delete) دارد
    if (incomingEnv.meta.softDeleted) {
      if (baselineChangeId && localEnv.meta.changeId === baselineChangeId) {
        softDeleteItems.push({
          collection,
          recordId,
          titleSummary: incomingEnv.titleSummary,
          changeType: 'soft-delete',
          incomingEnvelope: incomingEnv,
          localEnvelope: localEnv,
        });
      } else {
        const phoneEnv = localRole === 'phone-primary' ? localEnv : incomingEnv;
        const pcEnv = localRole === 'pc-companion' ? localEnv : incomingEnv;
        conflicts.push({
          conflictId: `CONF_${compKey}`,
          collection,
          recordId,
          titleSummary: incomingEnv.titleSummary,
          phoneEnvelope: phoneEnv,
          pcEnvelope: pcEnv,
        });
      }
      continue;
    }

    // ۴. هر دو دستگاه نسخه فعالی از این رکورد دارند اما محتوایشان متفاوت است
    if (baselineChangeId && localEnv.meta.changeId === baselineChangeId) {
      modifiedItems.push({
        collection,
        recordId,
        titleSummary: incomingEnv.titleSummary,
        changeType: 'modified',
        incomingEnvelope: incomingEnv,
        localEnvelope: localEnv,
      });
    } else {
      const phoneEnv = localRole === 'phone-primary' ? localEnv : incomingEnv;
      const pcEnv = localRole === 'pc-companion' ? localEnv : incomingEnv;
      conflicts.push({
        conflictId: `CONF_${compKey}`,
        collection,
        recordId,
        titleSummary: incomingEnv.titleSummary || localEnv.titleSummary,
        phoneEnvelope: phoneEnv,
        pcEnvelope: pcEnv,
      });
    }
  }

  return {
    packageId: pkg.packageId,
    protocolVersion: pkg.protocolVersion || SUPPORTED_SYNC_PROTOCOL_VERSION,
    senderRole: pkg.senderRole,
    receiverRole: localRole,
    analyzedAtMs: Date.now(),
    isReplayPackage,
    newItems,
    modifiedItems,
    softDeleteItems,
    unchangedItems,
    conflicts,
  };
}

/**
 * اعمال تغییرات تأییدشده توسط کاربر روی داده‌های محلی دستگاه
 * (با رعایت کامل عدم حذف فیزیکی خودکار، حفظ کامل سایر رکوردها، و ثبت خط مبنای همگام‌سازی)
 */
export function applyApprovedSyncReport(
  report: SyncPreviewReport,
  currentDataset: OperationalSyncDataset,
  localDeviceId: string,
  localRole: DeviceSyncRole
): {
  nextDataset: OperationalSyncDataset;
  appliedNewCount: number;
  appliedModifiedCount: number;
  appliedSoftDeleteCount: number;
  resolvedConflictCount: number;
} {
  const nextAudit: Record<string, FieldAuditRecord> = { ...(currentDataset.auditRecords || {}) };
  const nextCopiesMap = new Map<string, BookCopyRecord>(
    (currentDataset.bookCopies || []).map((c) => [c.copyId, c])
  );
  const nextMartyrsMap = new Map<string, CustomMartyrRecord>(
    (currentDataset.customMartyrs || []).map((m) => [m.martyrId, m])
  );
  const nextLinksMap = new Map<string, BookMartyrLinkRecord>(
    (currentDataset.links || []).map((l) => [l.id, l])
  );
  const nextPendingMap = new Map<string, PendingReviewItem>(
    (currentDataset.pendingReviews || []).map((p) => [p.trackingId, p])
  );

  const metaMap = loadRecordMetaMap();
  const baselineMap = loadBaselineChangeMap();

  const applySingleEnvelope = (env: SyncRecordEnvelope) => {
    const { collection, recordId } = env.meta;
    const compKey = getCompositeKey(collection, recordId);

    metaMap[compKey] = {
      ...env.meta,
      softDeleted: false,
      deletedAtMs: undefined,
    };
    baselineMap[compKey] = env.meta.changeId;

    if (collection === 'auditRecords') {
      const rec = env.data as FieldAuditRecord;
      nextAudit[recordId] = { ...rec, key: recordId };
    } else if (collection === 'bookCopies') {
      const cp = env.data as BookCopyRecord;
      nextCopiesMap.set(recordId, { ...cp, copyId: recordId });
    } else if (collection === 'customMartyrs') {
      const m = env.data as CustomMartyrRecord;
      nextMartyrsMap.set(recordId, { ...m, martyrId: recordId });
    } else if (collection === 'links') {
      const l = env.data as BookMartyrLinkRecord;
      nextLinksMap.set(recordId, { ...l, id: recordId });
    } else if (collection === 'pendingReviews') {
      const pv = env.data as PendingReviewItem;
      nextPendingMap.set(recordId, { ...pv, trackingId: recordId });
    }
  };

  // ۱. اعمال رکوردهای جدید
  for (const item of report.newItems) {
    applySingleEnvelope(item.incomingEnvelope);
  }

  // ۲. اعمال رکوردهای ویرایش‌شده بدون تعارض
  for (const item of report.modifiedItems) {
    applySingleEnvelope(item.incomingEnvelope);
  }

  // ۳. اعمال رکوردهای بدون تغییر در خط مبنا
  for (const item of report.unchangedItems) {
    const compKey = getCompositeKey(item.collection, item.recordId);
    baselineMap[compKey] = item.incomingEnvelope.meta.changeId;
  }

  // ۴. اعمال حذف نرم (انتقال به بایگانی قابل بازیابی، بدون حذف فیزیکی غیرقابل بازگشت)
  for (const item of report.softDeleteItems) {
    if (item.localEnvelope) {
      markRecordSoftDeleted(item.localEnvelope);
    }
    const compKey = getCompositeKey(item.collection, item.recordId);
    baselineMap[compKey] = item.incomingEnvelope.meta.changeId;
    if (metaMap[compKey]) {
      metaMap[compKey] = {
        ...metaMap[compKey],
        softDeleted: true,
        deletedAtMs: Date.now(),
      };
    }

    if (item.collection === 'auditRecords') {
      delete nextAudit[item.recordId];
    } else if (item.collection === 'bookCopies') {
      nextCopiesMap.delete(item.recordId);
    } else if (item.collection === 'customMartyrs') {
      nextMartyrsMap.delete(item.recordId);
    } else if (item.collection === 'links') {
      nextLinksMap.delete(item.recordId);
    } else if (item.collection === 'pendingReviews') {
      nextPendingMap.delete(item.recordId);
    }
  }

  // ۵. اعمال تعارض‌های تعیین‌تکلیف‌شده توسط کاربر
  for (const conflict of report.conflicts) {
    const resolvedEnv = buildResolvedEnvelopeFromConflict(conflict, localDeviceId, localRole);
    applySingleEnvelope(resolvedEnv);
  }

  saveRecordMetaMap(metaMap);
  saveBaselineChangeMap(baselineMap);
  recordAppliedPackageId(report.packageId);

  return {
    nextDataset: {
      auditRecords: nextAudit,
      bookCopies: Array.from(nextCopiesMap.values()),
      customMartyrs: Array.from(nextMartyrsMap.values()),
      links: Array.from(nextLinksMap.values()),
      pendingReviews: Array.from(nextPendingMap.values()),
    },
    appliedNewCount: report.newItems.length,
    appliedModifiedCount: report.modifiedItems.length,
    appliedSoftDeleteCount: report.softDeleteItems.length,
    resolvedConflictCount: report.conflicts.length,
  };
}

/**
 * بازیابی ایمن و مرحله‌ای (با بازگردانی خودکار در صورت بروز خطا) رکورد حذف‌شده نرم برای هر ۵ مجموعه عملیاتی:
 * پشتیبانی یکسان از auditRecords, bookCopies, customMartyrs, links, pendingReviews،
 * حفظ شناسه رکورد، درج در مجموعه اصلی پیش از حذف از آرشیو، و بازگردانی (Rollback) به آرشیو در صورت خطای ذخیره‌سازی متادیتا.
 * (توجه معماری: از آنجا که ذخیره‌سازی در چند کلید مجزای localStorage و حافظه React انجام می‌شود، این عملیات مرحله‌ای با بازگردانی است و تراکنش ACID پایگاه داده نیست.)
 */
export function restoreRecordIntoDataset(
  compKey: string,
  currentDataset: OperationalSyncDataset,
  localDeviceId: string,
  localRole: DeviceSyncRole
): {
  restored: boolean;
  restoredEnvelope: SyncRecordEnvelope | null;
  nextDataset: OperationalSyncDataset;
  alreadyExistedInActive: boolean;
} {
  const archive = loadSoftDeletedArchive();
  const archivedEnv = archive[compKey];

  if (
    !archivedEnv ||
    !archivedEnv.meta ||
    !archivedEnv.meta.recordId ||
    !VALID_COLLECTIONS.has(archivedEnv.meta.collection) ||
    !archivedEnv.data ||
    typeof archivedEnv.data !== 'object'
  ) {
    return {
      restored: false,
      restoredEnvelope: null,
      nextDataset: currentDataset,
      alreadyExistedInActive: false,
    };
  }

  const { collection, recordId } = archivedEnv.meta;
  let alreadyExistedInActive = false;

  const nextAudit: Record<string, FieldAuditRecord> = { ...(currentDataset.auditRecords || {}) };
  const nextCopiesMap = new Map<string, BookCopyRecord>(
    (currentDataset.bookCopies || []).map((c) => [c.copyId, c])
  );
  const nextMartyrsMap = new Map<string, CustomMartyrRecord>(
    (currentDataset.customMartyrs || []).map((m) => [m.martyrId, m])
  );
  const nextLinksMap = new Map<string, BookMartyrLinkRecord>(
    (currentDataset.links || []).map((l) => [l.id, l])
  );
  const nextPendingMap = new Map<string, PendingReviewItem>(
    (currentDataset.pendingReviews || []).map((p) => [p.trackingId, p])
  );

  if (collection === 'auditRecords') {
    alreadyExistedInActive = Boolean(nextAudit[recordId]);
    const rec = archivedEnv.data as FieldAuditRecord;
    nextAudit[recordId] = { ...rec, key: recordId };
  } else if (collection === 'bookCopies') {
    alreadyExistedInActive = nextCopiesMap.has(recordId);
    const cp = archivedEnv.data as BookCopyRecord;
    nextCopiesMap.set(recordId, { ...cp, copyId: recordId });
  } else if (collection === 'customMartyrs') {
    alreadyExistedInActive = nextMartyrsMap.has(recordId);
    const m = archivedEnv.data as CustomMartyrRecord;
    nextMartyrsMap.set(recordId, { ...m, martyrId: recordId });
  } else if (collection === 'links') {
    alreadyExistedInActive = nextLinksMap.has(recordId);
    const l = archivedEnv.data as BookMartyrLinkRecord;
    nextLinksMap.set(recordId, { ...l, id: recordId });
  } else if (collection === 'pendingReviews') {
    alreadyExistedInActive = nextPendingMap.has(recordId);
    const pv = archivedEnv.data as PendingReviewItem;
    nextPendingMap.set(recordId, { ...pv, trackingId: recordId });
  }

  const nextDataset: OperationalSyncDataset = {
    auditRecords: nextAudit,
    bookCopies: Array.from(nextCopiesMap.values()),
    customMartyrs: Array.from(nextMartyrsMap.values()),
    links: Array.from(nextLinksMap.values()),
    pendingReviews: Array.from(nextPendingMap.values()),
  };

  // تنها پس از ساخت موفق Dataset جدید، رکورد از بایگانی حذف نرم خارج می‌شود
  const popped = restoreSoftDeletedRecord(compKey);
  if (!popped) {
    return {
      restored: false,
      restoredEnvelope: null,
      nextDataset: currentDataset,
      alreadyExistedInActive,
    };
  }

  try {
    const canonical = canonicalizeRecordData(popped.data);
    const freshChangeId = computeDeterministicHash(`${collection}:${recordId}:${canonical}`);
    const now = Date.now();

    const updatedEnvelope: SyncRecordEnvelope = {
      ...popped,
      meta: {
        ...popped.meta,
        recordId,
        collection,
        softDeleted: false,
        deletedAtMs: undefined,
        updatedAtMs: now,
        revision: (popped.meta.revision || 1) + 1,
        changeId: freshChangeId,
        lastModifiedByDevice: localDeviceId,
        lastModifiedRole: localRole,
      },
    };

    const metaMap = loadRecordMetaMap();
    metaMap[compKey] = updatedEnvelope.meta;
    saveRecordMetaMap(metaMap);

    return {
      restored: true,
      restoredEnvelope: updatedEnvelope,
      nextDataset,
      alreadyExistedInActive,
    };
  } catch {
    // بازگردانی (Rollback) نسخه آرشیوی در صورت بروز خطای غیرمنتظره هنگام به‌روزرسانی متادیتا
    markRecordSoftDeleted(archivedEnv);
    return {
      restored: false,
      restoredEnvelope: null,
      nextDataset: currentDataset,
      alreadyExistedInActive,
    };
  }
}

/**
 * ثبت خط مبنای ارسال پس از تحویل موفق بسته به دستگاه مقابل
 */
export function markPackageSentInBaseline(pkg: SyncTransferPackage): void {
  const baselineMap = loadBaselineChangeMap();
  for (const env of pkg.envelopes) {
    const compKey = getCompositeKey(env.meta.collection, env.meta.recordId);
    baselineMap[compKey] = env.meta.changeId;
  }
  saveBaselineChangeMap(baselineMap);
}
