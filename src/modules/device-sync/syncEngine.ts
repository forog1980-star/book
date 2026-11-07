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
  mergeComplementaryFields,
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

function normalizeDataKeyText(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .trim()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200B-\u200D\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function isMeaningfulField(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === 'string') {
    const t = val.trim();
    return (
      t !== '' &&
      t !== '—' &&
      t !== '-' &&
      t !== 'UNSET' &&
      t !== 'unchecked' &&
      t !== 'نامشخص' &&
      t !== 'بدون کد قفسه'
    );
  }
  if (Array.isArray(val)) return val.length > 0;
  return true;
}

const IGNORED_CONFLICT_COMPARE_KEYS = new Set([
  'key',
  'updatedAt',
  'updatedAtMs',
  '_updatedAt',
  'auditDate',
  'createdAt',
  'lastReviewedAt',
]);

/**
 * بررسی امکان ادغام خودکار فیلدهای مکمل دو رکورد:
 * اگر هیچ فیلد معناداری در دو رکورد دارای دو مقدار غیرخالی و متضاد نباشد،
 * فیلدهای خالی هر طرف با مقادیر پرشده طرف مقابل تکمیل می‌شوند (hasConflict = false).
 * اگر حتی یک فیلد معنادار در هر دو رکورد مقدار غیرخالی و متفاوت داشته باشد،
 * hasConflict = true برگردانده می‌شود تا تعارض ثبت گردد و هیچ نسخه‌ای بی‌صدا بازنویسی نشود.
 */
export function tryAutoMergeNonConflictingData<T = unknown>(
  localData: T,
  incomingData: T
): { hasConflict: boolean; mergedData: T; conflictingFields: string[] } {
  if (
    !localData ||
    typeof localData !== 'object' ||
    !incomingData ||
    typeof incomingData !== 'object'
  ) {
    return {
      hasConflict: localData !== incomingData,
      mergedData: localData,
      conflictingFields: localData !== incomingData ? ['value'] : [],
    };
  }

  const locObj = localData as Record<string, unknown>;
  const incObj = incomingData as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(locObj), ...Object.keys(incObj)]);
  const merged: Record<string, unknown> = { ...locObj };
  const conflictingFields: string[] = [];

  for (const k of allKeys) {
    if (IGNORED_CONFLICT_COMPARE_KEYS.has(k)) continue;
    const locVal = locObj[k];
    const incVal = incObj[k];
    const locHas = isMeaningfulField(locVal);
    const incHas = isMeaningfulField(incVal);

    if (!locHas && incHas) {
      merged[k] = incVal;
    } else if (locHas && !incHas) {
      merged[k] = locVal;
    } else if (locHas && incHas) {
      const normLoc =
        typeof locVal === 'object' ? JSON.stringify(locVal) : normalizeDataKeyText(locVal);
      const normInc =
        typeof incVal === 'object' ? JSON.stringify(incVal) : normalizeDataKeyText(incVal);
      if (normLoc !== normInc) {
        conflictingFields.push(k);
      }
    }
  }

  return {
    hasConflict: conflictingFields.length > 0,
    mergedData: merged as T,
    conflictingFields,
  };
}

/**
 * شناسایی رکورد تکراری / متناظر در دستگاه مقصد بر اساس شناسه اصلی و کلیدهای واقعی داده
 * (مانند tempBookId، copyId، شماره ثبت، شابک، یا ترکیب عنوان + نویسنده + ناشر)
 */
export function findMatchingLocalEnvelope(
  incomingEnv: SyncRecordEnvelope,
  localMap: Map<string, SyncRecordEnvelope>,
  claimedCompKeys: Set<string>
): { matchedCompKey: string; localEnv: SyncRecordEnvelope } | null {
  const { collection, recordId } = incomingEnv.meta;
  const exactCompKey = getCompositeKey(collection, recordId);
  const exactMatch = localMap.get(exactCompKey);
  if (exactMatch && !claimedCompKeys.has(exactCompKey)) {
    return { matchedCompKey: exactCompKey, localEnv: exactMatch };
  }

  if (!incomingEnv.data || typeof incomingEnv.data !== 'object') {
    return null;
  }
  const incObj = incomingEnv.data as Record<string, unknown>;

  for (const [candCompKey, candEnv] of localMap.entries()) {
    if (candEnv.meta.collection !== collection || claimedCompKeys.has(candCompKey)) {
      continue;
    }
    if (!candEnv.data || typeof candEnv.data !== 'object') continue;
    const locObj = candEnv.data as Record<string, unknown>;

    if (collection === 'auditRecords') {
      // ۱. تطابق بر اساس کلید درونی key یا bookId عددی/رشته‌ای
      const incKey = normalizeDataKeyText(incObj.key || incObj.bookId);
      const locKey = normalizeDataKeyText(locObj.key || locObj.bookId);
      if (incKey && locKey && incKey === locKey) {
        return { matchedCompKey: candCompKey, localEnv: candEnv };
      }

      // ۲. تطابق بر اساس شناسه نسخه فیزیکی (copyId) در صورتی که هر دو مشخص باشند
      const incCopyId = normalizeDataKeyText(incObj.copyId);
      const locCopyId = normalizeDataKeyText(locObj.copyId);
      if (incCopyId && locCopyId && incCopyId === locCopyId) {
        return { matchedCompKey: candCompKey, localEnv: candEnv };
      }

      // ۳. تطابق بر اساس شماره ثبت کتابخانه (registrationNo) غیرخالی
      const incReg = normalizeDataKeyText(incObj.registrationNo);
      const locReg = normalizeDataKeyText(locObj.registrationNo);
      if (incReg && incReg.length >= 2 && locReg && incReg === locReg) {
        return { matchedCompKey: candCompKey, localEnv: candEnv };
      }

      // ۴. تطابق بر اساس شناسه کتاب (tempBookId مانند BK-0001) وقتی copyId متضاد ندارند
      const incTempId = normalizeDataKeyText(incObj.tempBookId);
      const locTempId = normalizeDataKeyText(locObj.tempBookId);
      if (
        incTempId &&
        locTempId &&
        incTempId === locTempId &&
        (!incCopyId || !locCopyId || incCopyId === locCopyId)
      ) {
        return { matchedCompKey: candCompKey, localEnv: candEnv };
      }

      // ۵. تطابق بر اساس شابک (ISBN) معتبر + عنوان هم‌نام
      const incIsbn = normalizeDataKeyText(incObj.isbn).replace(/[^a-z0-9]/g, '');
      const locIsbn = normalizeDataKeyText(locObj.isbn).replace(/[^a-z0-9]/g, '');
      const incTitle = normalizeDataKeyText(incObj.title);
      const locTitle = normalizeDataKeyText(locObj.title);
      if (
        incIsbn.length >= 6 &&
        incIsbn === locIsbn &&
        incTitle &&
        incTitle === locTitle &&
        (!incCopyId || !locCopyId || incCopyId === locCopyId)
      ) {
        return { matchedCompKey: candCompKey, localEnv: candEnv };
      }

      // ۶. تطابق بر اساس کلید ترکیبی واقعی کتاب: (عنوان + نویسنده + ناشر) وقتی عنوان غیرخالی است و شناسه متضادی ندارند
      const incAuthor = normalizeDataKeyText(incObj.author);
      const locAuthor = normalizeDataKeyText(locObj.author);
      const incPub = normalizeDataKeyText(incObj.publisher);
      const locPub = normalizeDataKeyText(locObj.publisher);
      const hasConflictingIds =
        (incTempId && locTempId && incTempId !== locTempId) ||
        (incCopyId && locCopyId && incCopyId !== locCopyId) ||
        (incReg && locReg && incReg !== locReg);

      if (
        !hasConflictingIds &&
        incTitle &&
        incTitle === locTitle &&
        incAuthor === locAuthor &&
        incPub === locPub
      ) {
        return { matchedCompKey: candCompKey, localEnv: candEnv };
      }
    } else if (collection === 'bookCopies') {
      const incCopyId = normalizeDataKeyText(incObj.copyId);
      const locCopyId = normalizeDataKeyText(locObj.copyId);
      if (incCopyId && incCopyId === locCopyId) {
        return { matchedCompKey: candCompKey, localEnv: candEnv };
      }
    } else if (collection === 'customMartyrs') {
      const incExt = normalizeDataKeyText(incObj.externalSystemId);
      const locExt = normalizeDataKeyText(locObj.externalSystemId);
      if (incExt && incExt === locExt) {
        return { matchedCompKey: candCompKey, localEnv: candEnv };
      }
      const incName = normalizeDataKeyText(incObj.fullName);
      const locName = normalizeDataKeyText(locObj.fullName);
      const incPiece = normalizeDataKeyText(incObj.gravePiece);
      const locPiece = normalizeDataKeyText(locObj.gravePiece);
      const incRow = normalizeDataKeyText(incObj.graveRow);
      const locRow = normalizeDataKeyText(locObj.graveRow);
      const incNum = normalizeDataKeyText(incObj.graveNumber);
      const locNum = normalizeDataKeyText(locObj.graveNumber);
      if (
        incName &&
        incName === locName &&
        incPiece === locPiece &&
        incRow === locRow &&
        incNum === locNum &&
        (incPiece !== '' || incNum !== '')
      ) {
        return { matchedCompKey: candCompKey, localEnv: candEnv };
      }
    } else if (collection === 'links') {
      const incBook = normalizeDataKeyText(incObj.bookId || incObj.bookTitleRaw);
      const locBook = normalizeDataKeyText(locObj.bookId || locObj.bookTitleRaw);
      const incMartyr = normalizeDataKeyText(incObj.martyrId || incObj.martyrNameRaw);
      const locMartyr = normalizeDataKeyText(locObj.martyrId || locObj.martyrNameRaw);
      const incPage = normalizeDataKeyText(incObj.pageReference);
      const locPage = normalizeDataKeyText(locObj.pageReference);
      if (incBook && incMartyr && incBook === locBook && incMartyr === locMartyr && incPage === locPage) {
        return { matchedCompKey: candCompKey, localEnv: candEnv };
      }
    } else if (collection === 'pendingReviews') {
      const incBook = normalizeDataKeyText(incObj.bookId || incObj.bookTitle);
      const locBook = normalizeDataKeyText(locObj.bookId || locObj.bookTitle);
      const incPhrase = normalizeDataKeyText(incObj.nameOrPhrase);
      const locPhrase = normalizeDataKeyText(locObj.nameOrPhrase);
      const incPage = normalizeDataKeyText(incObj.pageNumber);
      const locPage = normalizeDataKeyText(locObj.pageNumber);
      if (incBook && incPhrase && incBook === locBook && incPhrase === locPhrase && incPage === locPage) {
        return { matchedCompKey: candCompKey, localEnv: candEnv };
      }
    }
  }

  return null;
}

/**
 * تحلیل بسته دریافتی و دسته‌بندی تغییرات همراه با:
 * ۱. تشخیص رکوردهای تکراری بر اساس شناسه و کلیدهای واقعی داده
 * ۲. ادغام خودکار فیلدهای مکمل دو دستگاه بدون حذف اطلاعات
 * ۳. ثبت دقیق تعارض‌ها در صورت وجود دو مقدار متفاوت برای یک فیلد
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
  const claimedLocalCompKeys = new Set<string>();

  for (const rawIncomingEnv of pkg.envelopes) {
    const { collection } = rawIncomingEnv.meta;
    const match = findMatchingLocalEnvelope(rawIncomingEnv, localMap, claimedLocalCompKeys);

    // اگر رکورد متناظری بر اساس کلید اصلی یا کلید واقعی داده در مقصد پیدا شد، کلید مقصد حفظ می‌شود تا رکورد تکراری ایجاد نگردد
    const effectiveRecordId = match ? match.localEnv.meta.recordId : rawIncomingEnv.meta.recordId;
    const compKey = getCompositeKey(collection, effectiveRecordId);
    if (match) {
      claimedLocalCompKeys.add(match.matchedCompKey);
    }

    const localEnv = match ? match.localEnv : undefined;
    const normalizedData =
      effectiveRecordId !== rawIncomingEnv.meta.recordId &&
      collection === 'auditRecords' &&
      rawIncomingEnv.data &&
      typeof rawIncomingEnv.data === 'object'
        ? { ...(rawIncomingEnv.data as Record<string, unknown>), key: effectiveRecordId }
        : rawIncomingEnv.data;
    const incomingCanonical = canonicalizeRecordData(normalizedData);
    const normalizedIncomingChangeId = computeDeterministicHash(
      `${collection}:${effectiveRecordId}:${incomingCanonical}`
    );
    const incomingEnv: SyncRecordEnvelope =
      effectiveRecordId === rawIncomingEnv.meta.recordId
        ? rawIncomingEnv
        : {
            ...rawIncomingEnv,
            meta: {
              ...rawIncomingEnv.meta,
              recordId: effectiveRecordId,
              changeId: normalizedIncomingChangeId,
            },
            data: normalizedData,
          };

    const baselineChangeId =
      baselineMap[compKey] ||
      baselineMap[getCompositeKey(collection, rawIncomingEnv.meta.recordId)];

    // ۱. اگر رکورد در دستگاه گیرنده وجود ندارد (یا قبلاً حذف نرم شده است)
    if (!localEnv || localEnv.meta.softDeleted) {
      if (incomingEnv.meta.softDeleted) {
        unchangedItems.push({
          collection,
          recordId: effectiveRecordId,
          titleSummary: incomingEnv.titleSummary,
          changeType: 'unchanged',
          incomingEnvelope: incomingEnv,
          localEnvelope: localEnv,
        });
      } else {
        newItems.push({
          collection,
          recordId: effectiveRecordId,
          titleSummary: incomingEnv.titleSummary,
          changeType: 'new',
          incomingEnvelope: incomingEnv,
        });
      }
      continue;
    }

    // ۲. اگر رکورد دریافتی و رکورد محلی از نظر محتوای کانونیکال یکسان هستند (تکراری / مشترک بدون تغییر)
    if (
      localEnv.meta.changeId === incomingEnv.meta.changeId &&
      Boolean(localEnv.meta.softDeleted) === Boolean(incomingEnv.meta.softDeleted)
    ) {
      unchangedItems.push({
        collection,
        recordId: effectiveRecordId,
        titleSummary: incomingEnv.titleSummary,
        changeType: 'unchanged',
        incomingEnvelope: incomingEnv,
        localEnvelope: localEnv,
      });
      continue;
    }

    // ۳. اگر رکورد دریافتی نشانگر حذف نرم دارد:
    // طبق اصل حفظ اطلاعات (بخش ۳ دستور)، هیچ رکورد فعالی صرفاً به دلیل همگام‌سازی حذف نمی‌شود
    if (incomingEnv.meta.softDeleted) {
      unchangedItems.push({
        collection,
        recordId: effectiveRecordId,
        titleSummary: localEnv.titleSummary || incomingEnv.titleSummary,
        changeType: 'unchanged',
        incomingEnvelope: localEnv,
        localEnvelope: localEnv,
      });
      continue;
    }

    // ۴. اگر دستگاه فرستنده همان نسخه خط مبنا (Baseline) را فرستاده و دستگاه گیرنده نسخه جدیدتری دارد:
    // نسخه جدیدتر محلی حفظ می‌شود و تعارض کاذب ثبت نمی‌گردد
    if (baselineChangeId && incomingEnv.meta.changeId === baselineChangeId) {
      unchangedItems.push({
        collection,
        recordId: effectiveRecordId,
        titleSummary: localEnv.titleSummary,
        changeType: 'unchanged',
        incomingEnvelope: localEnv,
        localEnvelope: localEnv,
      });
      continue;
    }

    // ۵. اگر دستگاه گیرنده نسبت به خط مبنا تغییر نکرده و فقط دستگاه فرستنده رکورد را ویرایش کرده است:
    if (baselineChangeId && localEnv.meta.changeId === baselineChangeId) {
      const mergedData = mergeComplementaryFields(incomingEnv.data, localEnv.data);
      const mergedCanonical = canonicalizeRecordData(mergedData);
      const mergedChangeId = computeDeterministicHash(
        `${collection}:${effectiveRecordId}:${mergedCanonical}`
      );
      const mergedEnvelope: SyncRecordEnvelope = {
        ...incomingEnv,
        meta: {
          ...incomingEnv.meta,
          recordId: effectiveRecordId,
          changeId: mergedChangeId,
        },
        data: mergedData,
      };
      modifiedItems.push({
        collection,
        recordId: effectiveRecordId,
        titleSummary: incomingEnv.titleSummary,
        changeType: 'modified',
        incomingEnvelope: mergedEnvelope,
        localEnvelope: localEnv,
      });
      continue;
    }

    // ۶. بررسی ادغام خودکار فیلدهای مکمل (وقتی یک طرف فقط فیلدهای خالی طرف دیگر را تکمیل کرده و تضادی وجود ندارد)
    const autoMergeCheck = tryAutoMergeNonConflictingData(localEnv.data, incomingEnv.data);
    if (!autoMergeCheck.hasConflict) {
      const mergedCanonical = canonicalizeRecordData(autoMergeCheck.mergedData);
      const mergedChangeId = computeDeterministicHash(
        `${collection}:${effectiveRecordId}:${mergedCanonical}`
      );
      if (mergedChangeId === localEnv.meta.changeId) {
        unchangedItems.push({
          collection,
          recordId: effectiveRecordId,
          titleSummary: localEnv.titleSummary,
          changeType: 'unchanged',
          incomingEnvelope: localEnv,
          localEnvelope: localEnv,
        });
      } else {
        const mergedEnv: SyncRecordEnvelope = {
          meta: {
            ...localEnv.meta,
            recordId: effectiveRecordId,
            updatedAtMs: Math.max(
              localEnv.meta.updatedAtMs || 0,
              incomingEnv.meta.updatedAtMs || 0,
              Date.now()
            ),
            revision:
              Math.max(localEnv.meta.revision || 1, incomingEnv.meta.revision || 1) + 1,
            changeId: mergedChangeId,
            lastModifiedByDevice: incomingEnv.meta.lastModifiedByDevice,
            lastModifiedRole: incomingEnv.meta.lastModifiedRole,
            softDeleted: false,
          },
          titleSummary: incomingEnv.titleSummary || localEnv.titleSummary,
          data: autoMergeCheck.mergedData,
        };
        modifiedItems.push({
          collection,
          recordId: effectiveRecordId,
          titleSummary: mergedEnv.titleSummary,
          changeType: 'modified',
          incomingEnvelope: mergedEnv,
          localEnvelope: localEnv,
        });
      }
      continue;
    }

    // ۷. وجود تفاوت واقعی در یک یا چند فیلد پرشده در هر دو دستگاه -> ثبت در تعارض‌ها بدون حذف هیچ‌یک از دو نسخه
    const phoneEnv = localRole === 'phone-primary' ? localEnv : incomingEnv;
    const pcEnv = localRole === 'pc-companion' ? localEnv : incomingEnv;
    conflicts.push({
      conflictId: `CONF_${compKey}`,
      collection,
      recordId: effectiveRecordId,
      titleSummary: incomingEnv.titleSummary || localEnv.titleSummary,
      phoneEnvelope: phoneEnv,
      pcEnvelope: pcEnv,
    });
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
 * اعمال تغییرات بسته دریافتی روی داده‌های محلی دستگاه مقصد:
 * - هیچ رکورد فعالی صرفاً به دلیل اتصال یا همگام‌سازی حذف نمی‌شود
 * - رکوردهای جدید اضافه می‌شوند، تغییرات غیرمتعارض ادغام می‌گردند، و در تعارض‌ها نسخه مرجع حفظ شده و وضعیت تعارض ثبت می‌شود
 * - خط مبنا (Baseline) در دستگاه مقصد پس از اعمال موفق به‌روزرسانی می‌شود
 */
export function applyApprovedSyncReport(
  report: SyncPreviewReport,
  currentDataset: OperationalSyncDataset,
  localDeviceId: string,
  localRole: DeviceSyncRole,
  options?: { allowSoftDeleteRemoval?: boolean }
): {
  nextDataset: OperationalSyncDataset;
  appliedNewCount: number;
  appliedModifiedCount: number;
  appliedSoftDeleteCount: number;
  resolvedConflictCount: number;
  unresolvedConflictCount: number;
  unchangedCount: number;
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

  const applySingleEnvelope = (env: SyncRecordEnvelope, updateBaseline = true) => {
    const { collection, recordId } = env.meta;
    const compKey = getCompositeKey(collection, recordId);

    metaMap[compKey] = {
      ...env.meta,
      softDeleted: false,
      deletedAtMs: undefined,
    };
    if (updateBaseline) {
      baselineMap[compKey] = env.meta.changeId;
    }

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
    applySingleEnvelope(item.incomingEnvelope, true);
  }

  // ۲. اعمال رکوردهای ویرایش‌شده / ادغام‌شده بدون تعارض
  for (const item of report.modifiedItems) {
    applySingleEnvelope(item.incomingEnvelope, true);
  }

  // ۳. ثبت رکوردهای مشترک / تکراری بدون تغییر در خط مبنا
  for (const item of report.unchangedItems) {
    const compKey = getCompositeKey(item.collection, item.recordId);
    baselineMap[compKey] = item.incomingEnvelope.meta.changeId;
  }

  // ۴. طبق اصل حفظ اطلاعات (بخش ۳ دستور)، در همگام‌سازی خودکار هیچ رکوردی حذف نمی‌شود
  let appliedSoftDeletes = 0;
  if (options?.allowSoftDeleteRemoval) {
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
      appliedSoftDeletes++;
    }
  }

  // ۵. در تعارض‌ها: نسخه مرجع (گوشی + فیلدهای تکمیلی) یا تصمیم صریح کاربر حفظ می‌شود.
  // اگر تعارض هنوز توسط کاربر تعیین‌تکلیف نشده باشد، خط مبنا قفل نمی‌شود تا وضعیت تعارض تا زمان تصمیم کاربر باقی بماند.
  let resolvedConflicts = 0;
  let unresolvedConflicts = 0;
  for (const conflict of report.conflicts) {
    const isExplicitlyResolved = Boolean(conflict.selectedChoice);
    if (isExplicitlyResolved) {
      resolvedConflicts++;
    } else {
      unresolvedConflicts++;
    }
    const resolvedEnv = buildResolvedEnvelopeFromConflict(conflict, localDeviceId, localRole);
    applySingleEnvelope(resolvedEnv, isExplicitlyResolved);
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
    appliedSoftDeleteCount: appliedSoftDeletes,
    resolvedConflictCount: resolvedConflicts,
    unresolvedConflictCount: unresolvedConflicts,
    unchangedCount: report.unchangedItems.length,
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
 * به‌روزرسانی خط مبنا (Baseline) در دستگاه فرستنده **صرفاً پس از دریافت تأیید واقعی اعمال بسته (TRANSFER_ACK با ok=true و applied=true) از دستگاه مقصد**.
 * توجه مهم (اصلاح بخش ۵ دستور اجرایی): این تابع هرگز نباید بلافاصله پس از ارسال شبکه (sendTransferPackage) صدا زده شود؛
 * زیرا ارسال شبکه به معنی دریافت کامل و اعمال موفق اطلاعات در مقصد نیست.
 */
export function markPackageSentInBaseline(pkg: SyncTransferPackage): void {
  const baselineMap = loadBaselineChangeMap();
  for (const env of pkg.envelopes) {
    const compKey = getCompositeKey(env.meta.collection, env.meta.recordId);
    baselineMap[compKey] = env.meta.changeId;
  }
  saveBaselineChangeMap(baselineMap);
}

export const confirmPackageAppliedInBaseline = markPackageSentInBaseline;
