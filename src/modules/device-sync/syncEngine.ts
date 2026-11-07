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
  OPERATIONAL_STORAGE_KEYS,
  saveOperationalData,
} from '../../utils/indexedDbStorage';
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
import { WireMessage } from './transferProtocol';
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

  // ۱. اطلاعات و مکان کتاب‌ها در قفسه
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

function normalizeMeaningfulIdentity(val: unknown): string {
  if (!isMeaningfulField(val)) return '';
  return normalizeDataKeyText(val);
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
 * بررسی وجود تضاد صریح در مشخصات هویتی دو کتاب (اصلاح سوم):
 * اگر هر یک از شناسه‌ها یا فیلدهای هویتی کتاب در هر دو رکورد پر بوده و متفاوت باشند،
 * این دو رکورد متعلق به دو کتاب متفاوت هستند و هرگز نباید یکی تشخیص داده شوند.
 */
export function hasExplicitAuditBookIdentityMismatch(
  incObj: Record<string, unknown>,
  locObj: Record<string, unknown>
): boolean {
  const incCopyId = normalizeMeaningfulIdentity(incObj.copyId);
  const locCopyId = normalizeMeaningfulIdentity(locObj.copyId);
  if (incCopyId && locCopyId && incCopyId !== locCopyId) return true;

  const incReg = normalizeMeaningfulIdentity(incObj.registrationNo);
  const locReg = normalizeMeaningfulIdentity(locObj.registrationNo);
  if (incReg && locReg && incReg !== locReg) return true;

  const incTempId = normalizeMeaningfulIdentity(incObj.tempBookId);
  const locTempId = normalizeMeaningfulIdentity(locObj.tempBookId);
  if (incTempId && locTempId && incTempId !== locTempId) return true;

  const incIsbn = normalizeMeaningfulIdentity(incObj.isbn).replace(/[^a-z0-9]/g, '');
  const locIsbn = normalizeMeaningfulIdentity(locObj.isbn).replace(/[^a-z0-9]/g, '');
  if (incIsbn.length >= 6 && locIsbn.length >= 6 && incIsbn !== locIsbn) return true;

  const incAuthor = normalizeMeaningfulIdentity(incObj.author);
  const locAuthor = normalizeMeaningfulIdentity(locObj.author);
  if (incAuthor && locAuthor && incAuthor !== locAuthor) return true;

  const incPub = normalizeMeaningfulIdentity(incObj.publisher);
  const locPub = normalizeMeaningfulIdentity(locObj.publisher);
  if (incPub && locPub && incPub !== locPub) return true;

  const incYear = normalizeMeaningfulIdentity(incObj.publicationYear);
  const locYear = normalizeMeaningfulIdentity(locObj.publicationYear);
  if (incYear && locYear && incYear !== locYear) return true;

  return false;
}

/**
 * قواعد اختصاصی تشخیص تطابق رکورد کتاب در قفسه (auditRecords) — اصلاح سوم:
 * - تطابق بر اساس شناسه‌های معتبر و یکتا (key/bookId, copyId, registrationNo, tempBookId, isbn+title) در صورت عدم تضاد هویتی.
 * - تطبیق عنوانی صرفاً زمانی مجاز است که اطلاعات هویتی کافی و غیرمبهم (نویسنده و/یا ناشر معتبر و یکسان در هر دو طرف) وجود داشته باشد.
 * - عنوان یکسان به‌تنهایی (وقتی نویسنده و ناشر خالی یا ناکافی هستند) هرگز مجوز تطابق و ادغام نیست.
 */
export function matchAuditBookRecord(
  incObj: Record<string, unknown>,
  locObj: Record<string, unknown>
): boolean {
  if (hasExplicitAuditBookIdentityMismatch(incObj, locObj)) {
    return false;
  }

  // ۱. تطابق بر اساس کلید درونی key یا bookId معتبر و یکسان
  const incKey = normalizeMeaningfulIdentity(incObj.key || incObj.bookId);
  const locKey = normalizeMeaningfulIdentity(locObj.key || locObj.bookId);
  if (incKey && locKey && incKey === locKey) {
    return true;
  }

  // ۲. تطابق بر اساس شناسه نسخه فیزیکی یکتا (copyId)
  const incCopyId = normalizeMeaningfulIdentity(incObj.copyId);
  const locCopyId = normalizeMeaningfulIdentity(locObj.copyId);
  if (incCopyId && locCopyId && incCopyId === locCopyId) {
    return true;
  }

  // ۳. تطابق بر اساس شماره ثبت معتبر کتابخانه (registrationNo)
  const incReg = normalizeMeaningfulIdentity(incObj.registrationNo);
  const locReg = normalizeMeaningfulIdentity(locObj.registrationNo);
  if (incReg.length >= 2 && locReg.length >= 2 && incReg === locReg) {
    return true;
  }

  // ۴. تطابق بر اساس شناسه کتاب (tempBookId مانند BK-0001)
  const incTempId = normalizeMeaningfulIdentity(incObj.tempBookId);
  const locTempId = normalizeMeaningfulIdentity(locObj.tempBookId);
  if (incTempId && locTempId && incTempId === locTempId) {
    return true;
  }

  // ۵. تطابق بر اساس شابک (ISBN) معتبر + عنوان هم‌نام
  const incIsbn = normalizeMeaningfulIdentity(incObj.isbn).replace(/[^a-z0-9]/g, '');
  const locIsbn = normalizeMeaningfulIdentity(locObj.isbn).replace(/[^a-z0-9]/g, '');
  const incTitle = normalizeMeaningfulIdentity(incObj.title);
  const locTitle = normalizeMeaningfulIdentity(locObj.title);
  if (incIsbn.length >= 6 && incIsbn === locIsbn && incTitle && incTitle === locTitle) {
    return true;
  }

  // ۶. تطابق عنوانی فقط با اطلاعات هویتی کافی و غیرمبهم:
  // عنوان یکسان به‌تنهایی مجوز ادغام نیست؛ باید نویسنده و ناشر در هر دو طرف همخوان باشند و حداقل یکی از آن‌ها غیرخالی باشد.
  const incAuthor = normalizeMeaningfulIdentity(incObj.author);
  const locAuthor = normalizeMeaningfulIdentity(locObj.author);
  const incPub = normalizeMeaningfulIdentity(incObj.publisher);
  const locPub = normalizeMeaningfulIdentity(locObj.publisher);

  if (
    incTitle &&
    incTitle === locTitle &&
    incAuthor === locAuthor &&
    incPub === locPub &&
    (incAuthor !== '' || incPub !== '')
  ) {
    return true;
  }

  return false;
}

/**
 * قواعد اختصاصی تشخیص تطابق نسخه فیزیکی کتاب (bookCopies)
 */
export function matchBookCopyRecord(
  incObj: Record<string, unknown>,
  locObj: Record<string, unknown>
): boolean {
  const incCopyId = normalizeMeaningfulIdentity(incObj.copyId);
  const locCopyId = normalizeMeaningfulIdentity(locObj.copyId);
  return Boolean(incCopyId && incCopyId === locCopyId);
}

/**
 * قواعد اختصاصی تشخیص تطابق پرونده شهید (customMartyrs)
 */
export function matchCustomMartyrRecord(
  incObj: Record<string, unknown>,
  locObj: Record<string, unknown>
): boolean {
  const incId = normalizeMeaningfulIdentity(incObj.martyrId);
  const locId = normalizeMeaningfulIdentity(locObj.martyrId);
  if (incId && locId && incId === locId) {
    return true;
  }

  const incExt = normalizeMeaningfulIdentity(incObj.externalSystemId);
  const locExt = normalizeMeaningfulIdentity(locObj.externalSystemId);
  if (incExt && locExt && incExt === locExt) {
    return true;
  }

  const incFather = normalizeMeaningfulIdentity(incObj.fatherName);
  const locFather = normalizeMeaningfulIdentity(locObj.fatherName);
  if (incFather && locFather && incFather !== locFather) {
    return false;
  }

  const incName = normalizeMeaningfulIdentity(incObj.fullName);
  const locName = normalizeMeaningfulIdentity(locObj.fullName);
  const incPiece = normalizeMeaningfulIdentity(incObj.gravePiece);
  const locPiece = normalizeMeaningfulIdentity(locObj.gravePiece);
  const incRow = normalizeMeaningfulIdentity(incObj.graveRow);
  const locRow = normalizeMeaningfulIdentity(locObj.graveRow);
  const incNum = normalizeMeaningfulIdentity(incObj.graveNumber);
  const locNum = normalizeMeaningfulIdentity(locObj.graveNumber);

  return Boolean(
    incName &&
      incName === locName &&
      incPiece === locPiece &&
      incRow === locRow &&
      incNum === locNum &&
      (incPiece !== '' || incNum !== '')
  );
}

/**
 * قواعد اختصاصی تشخیص تطابق پیوند پژوهشی کتاب و شهید (links)
 */
export function matchBookMartyrLinkRecord(
  incObj: Record<string, unknown>,
  locObj: Record<string, unknown>
): boolean {
  const incId = normalizeMeaningfulIdentity(incObj.id);
  const locId = normalizeMeaningfulIdentity(locObj.id);
  if (incId && locId && incId === locId) {
    return true;
  }

  const incBook = normalizeMeaningfulIdentity(incObj.bookId || incObj.bookTitleRaw);
  const locBook = normalizeMeaningfulIdentity(locObj.bookId || locObj.bookTitleRaw);
  const incMartyr = normalizeMeaningfulIdentity(incObj.martyrId || incObj.martyrNameRaw);
  const locMartyr = normalizeMeaningfulIdentity(locObj.martyrId || locObj.martyrNameRaw);
  const incPage = normalizeMeaningfulIdentity(incObj.pageReference);
  const locPage = normalizeMeaningfulIdentity(locObj.pageReference);

  return Boolean(
    incBook &&
      incMartyr &&
      incPage &&
      incBook === locBook &&
      incMartyr === locMartyr &&
      incPage === locPage
  );
}

/**
 * قواعد اختصاصی تشخیص تطابق مورد صف بررسی کارشناسی (pendingReviews)
 */
export function matchPendingReviewRecord(
  incObj: Record<string, unknown>,
  locObj: Record<string, unknown>
): boolean {
  const incId = normalizeMeaningfulIdentity(incObj.trackingId);
  const locId = normalizeMeaningfulIdentity(locObj.trackingId);
  if (incId && locId && incId === locId) {
    return true;
  }

  const incBook = normalizeMeaningfulIdentity(incObj.bookId || incObj.bookTitle);
  const locBook = normalizeMeaningfulIdentity(locObj.bookId || locObj.bookTitle);
  const incPhrase = normalizeMeaningfulIdentity(incObj.nameOrPhrase);
  const locPhrase = normalizeMeaningfulIdentity(locObj.nameOrPhrase);
  const incPage = normalizeMeaningfulIdentity(incObj.pageNumber);
  const locPage = normalizeMeaningfulIdentity(locObj.pageNumber);

  return Boolean(
    incBook &&
      incPhrase &&
      incPage &&
      incBook === locBook &&
      incPhrase === locPhrase &&
      incPage === locPage
  );
}

/**
 * شناسایی رکورد تکراری / متناظر در دستگاه مقصد بر اساس شناسه اصلی و قواعد تفکیک‌شده هر مجموعه
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
    if (
      collection === 'auditRecords' &&
      incomingEnv.data &&
      typeof incomingEnv.data === 'object' &&
      exactMatch.data &&
      typeof exactMatch.data === 'object' &&
      hasExplicitAuditBookIdentityMismatch(
        incomingEnv.data as Record<string, unknown>,
        exactMatch.data as Record<string, unknown>
      )
    ) {
      // اگر حتی با کلید مشابه، مشخصات هویتی کتاب (نویسنده/ناشر/شماره ثبت/شابک/نسخه) صریحاً متضاد باشد، ادغام خودکار انجام نمی‌شود
    } else {
      return { matchedCompKey: exactCompKey, localEnv: exactMatch };
    }
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
      if (matchAuditBookRecord(incObj, locObj)) {
        return { matchedCompKey: candCompKey, localEnv: candEnv };
      }
    } else if (collection === 'bookCopies') {
      if (matchBookCopyRecord(incObj, locObj)) {
        return { matchedCompKey: candCompKey, localEnv: candEnv };
      }
    } else if (collection === 'customMartyrs') {
      if (matchCustomMartyrRecord(incObj, locObj)) {
        return { matchedCompKey: candCompKey, localEnv: candEnv };
      }
    } else if (collection === 'links') {
      if (matchBookMartyrLinkRecord(incObj, locObj)) {
        return { matchedCompKey: candCompKey, localEnv: candEnv };
      }
    } else if (collection === 'pendingReviews') {
      if (matchPendingReviewRecord(incObj, locObj)) {
        return { matchedCompKey: candCompKey, localEnv: candEnv };
      }
    }
  }

  return null;
}

/**
 * تشخیص کتاب‌های هم‌عنوان با اطلاعات هویتی ناکافی / مبهم (اصلاح سوم):
 * اگر دو کتاب دارای کلید متفاوت و عنوان یکسان باشند، هیچ تضاد هویتی صریحی نداشته باشند،
 * اما به دلیل خالی یا ناقص بودن نویسنده/ناشر/شناسه نتوان با قطعیت تشخیص داد که یک کتاب هستند یا دو کتاب متفاوت،
 * رکورد جدید کورکورانه ادغام نمی‌شود؛ بلکه هر دو نسخه حفظ شده و مورد به عنوان تعارض / نیازمند بررسی ثبت می‌گردد.
 */
export function findAmbiguousSameTitleBookEnvelope(
  incomingEnv: SyncRecordEnvelope,
  localMap: Map<string, SyncRecordEnvelope>,
  claimedCompKeys: Set<string>
): { localCompKey: string; localEnv: SyncRecordEnvelope } | null {
  if (
    incomingEnv.meta.collection !== 'auditRecords' ||
    !incomingEnv.data ||
    typeof incomingEnv.data !== 'object'
  ) {
    return null;
  }

  const incObj = incomingEnv.data as Record<string, unknown>;
  const incTitle = normalizeMeaningfulIdentity(incObj.title);
  if (!incTitle) return null;

  for (const [candCompKey, candEnv] of localMap.entries()) {
    if (candEnv.meta.collection !== 'auditRecords' || claimedCompKeys.has(candCompKey)) {
      continue;
    }
    if (candEnv.meta.softDeleted || !candEnv.data || typeof candEnv.data !== 'object') {
      continue;
    }
    const locObj = candEnv.data as Record<string, unknown>;
    const locTitle = normalizeMeaningfulIdentity(locObj.title);
    if (!locTitle || incTitle !== locTitle) {
      continue;
    }

    // اگر مشخصات هویتی صریحاً متفاوت باشد (مثلاً نویسنده یا ناشر یا شماره ثبت متفاوت)، دو کتاب کاملاً مستقل هستند (نه مبهم)
    if (hasExplicitAuditBookIdentityMismatch(incObj, locObj)) {
      continue;
    }

    // اگر به اینجا رسیدیم یعنی عنوان یکسان است ولی اطلاعات هویتی (نویسنده/ناشر/شناسه) برای تطابق قطعی کافی نبوده است
    return { localCompKey: candCompKey, localEnv: candEnv };
  }

  return null;
}

/**
 * تحلیل بسته دریافتی و دسته‌بندی تغییرات همراه با:
 * ۱. تشخیص رکوردهای تکراری بر اساس شناسه معتبر و قواعد تفکیک‌شده هر مجموعه
 * ۲. جلوگیری از ادغام اشتباه کتاب‌های هم‌عنوان فاقد اطلاعات هویتی کافی
 * ۳. ادغام خودکار فیلدهای مکمل دو دستگاه بدون حذف اطلاعات
 * ۴. ثبت دقیق تعارض‌ها در صورت وجود دو مقدار متفاوت برای یک فیلد یا ابهام هویتی کتاب هم‌عنوان
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

    // بررسی حالت کتاب هم‌عنوان با اطلاعات هویتی ناکافی (اصلاح سوم):
    // بدون ادغام کورکورانه، هر دو نسخه با کلیدهای مستقل حفظ می‌شوند و مورد در تعارض‌ها / نیازمند بررسی ثبت می‌گردد.
    if (!match && collection === 'auditRecords' && !rawIncomingEnv.meta.softDeleted) {
      const ambiguousSameTitle = findAmbiguousSameTitleBookEnvelope(
        rawIncomingEnv,
        localMap,
        claimedLocalCompKeys
      );
      if (ambiguousSameTitle) {
        const distinctRecordId = rawIncomingEnv.meta.recordId;
        const distinctCompKey = getCompositeKey(collection, distinctRecordId);
        const phoneEnv =
          localRole === 'phone-primary' ? ambiguousSameTitle.localEnv : rawIncomingEnv;
        const pcEnv =
          localRole === 'pc-companion' ? ambiguousSameTitle.localEnv : rawIncomingEnv;

        conflicts.push({
          conflictId: `CONF_AMBIGUOUS_${distinctCompKey}`,
          collection,
          recordId: distinctRecordId,
          titleSummary: `${rawIncomingEnv.titleSummary} (کتاب هم‌عنوان با مشخصات هویتی ناکافی — نیازمند بررسی)`,
          phoneEnvelope: phoneEnv,
          pcEnvelope: pcEnv,
        });
        continue;
      }
    }

    // اگر رکورد متناظری بر اساس شناسه معتبر یا هویت غیرمبهم در مقصد پیدا شد، کلید مقصد حفظ می‌شود تا رکورد تکراری ایجاد نگردد
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
    // طبق اصل حفظ اطلاعات، هیچ رکورد فعالی صرفاً به دلیل همگام‌سازی حذف نمی‌شود
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
 * - در صورت فعال بودن deferMetadataCommit، ثبت متادیتا و خط مبنا در حافظه تا زمان تأیید ذخیره پایدار Dataset به تعویق می‌افتد (اصلاح دوم)
 */
export function applyApprovedSyncReport(
  report: SyncPreviewReport,
  currentDataset: OperationalSyncDataset,
  localDeviceId: string,
  localRole: DeviceSyncRole,
  options?: { allowSoftDeleteRemoval?: boolean; deferMetadataCommit?: boolean }
): {
  nextDataset: OperationalSyncDataset;
  appliedNewCount: number;
  appliedModifiedCount: number;
  appliedSoftDeleteCount: number;
  resolvedConflictCount: number;
  unresolvedConflictCount: number;
  unchangedCount: number;
  commitMetadata: () => { ok: boolean; error?: string };
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

  const applySingleEnvelope = (
    env: SyncRecordEnvelope,
    updateBaseline = true,
    overrideRecordId?: string
  ) => {
    const { collection } = env.meta;
    const recordId = overrideRecordId || env.meta.recordId;
    const compKey = getCompositeKey(collection, recordId);

    metaMap[compKey] = {
      ...env.meta,
      recordId,
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

  // ۴. طبق اصل حفظ اطلاعات، در همگام‌سازی خودکار هیچ رکوردی حذف نمی‌شود
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

  // ۵. در تعارض‌ها:
  // - اگر تعارض مربوط به کتاب هم‌عنوان مبهم (CONF_AMBIGUOUS_) و هنوز تعیین‌تکلیف‌نشده باشد،
  //   رکورد محلی در کلید خودش دست‌نخورده می‌ماند و رکورد دریافتی نیز در کلید مستقل خودش (conflict.recordId) حفظ می‌شود تا دو کتاب هم‌عنوان اشتباهاً یکی نشوند.
  // - در تعارض‌های معمولی، نسخه مرجع گوشی یا تصمیم صریح کاربر اعمال می‌شود.
  let resolvedConflicts = 0;
  let unresolvedConflicts = 0;
  for (const conflict of report.conflicts) {
    const isExplicitlyResolved = Boolean(conflict.selectedChoice);
    if (isExplicitlyResolved) {
      resolvedConflicts++;
      const resolvedEnv = buildResolvedEnvelopeFromConflict(conflict, localDeviceId, localRole);
      applySingleEnvelope(resolvedEnv, true, conflict.recordId);
    } else {
      unresolvedConflicts++;
      if (conflict.conflictId.startsWith('CONF_AMBIGUOUS_')) {
        const incomingSideEnv =
          localRole === 'phone-primary' ? conflict.pcEnvelope : conflict.phoneEnvelope;
        applySingleEnvelope(incomingSideEnv, false, conflict.recordId);
      } else {
        const resolvedEnv = buildResolvedEnvelopeFromConflict(conflict, localDeviceId, localRole);
        applySingleEnvelope(resolvedEnv, false, conflict.recordId);
      }
    }
  }

  const commitMetadata = (): { ok: boolean; error?: string } => {
    const savedMeta = saveRecordMetaMap(metaMap);
    const savedBaseline = saveBaselineChangeMap(baselineMap);
    const savedPkg = recordAppliedPackageId(report.packageId);
    if (!savedMeta || !savedBaseline || !savedPkg) {
      return {
        ok: false,
        error: 'ذخیره پایدار متادیتای همگام‌سازی یا خط مبنا در حافظه محلی با خطا مواجه شد.',
      };
    }
    return { ok: true };
  };

  if (!options?.deferMetadataCommit) {
    commitMetadata();
  }

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
    commitMetadata,
  };
}

/**
 * ذخیره پایدار ۵ مجموعه عملیاتی Dataset همگام‌سازی در حافظه محلی (localStorage + IndexedDB)
 * و بازگرداندن وضعیت واقعی موفقیت یا شکست ذخیره‌سازی (اصلاح دوم).
 */
export async function persistSyncedDatasetDurably(
  dataset: OperationalSyncDataset
): Promise<{ ok: boolean; error?: string }> {
  try {
    const results = await Promise.all([
      saveOperationalData(OPERATIONAL_STORAGE_KEYS.auditRecords, dataset.auditRecords),
      saveOperationalData(OPERATIONAL_STORAGE_KEYS.bookCopies, dataset.bookCopies),
      saveOperationalData(OPERATIONAL_STORAGE_KEYS.customMartyrs, dataset.customMartyrs),
      saveOperationalData(OPERATIONAL_STORAGE_KEYS.links, dataset.links),
      saveOperationalData(OPERATIONAL_STORAGE_KEYS.pendingReviews, dataset.pendingReviews),
    ]);
    const failed = results.find((r) => !r.ok);
    if (failed) {
      return {
        ok: false,
        error: failed.error || `خطا در ذخیره پایدار مجموعه ${failed.key}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * اجرای کامل و ترتیبی چرخه دریافت، تحلیل، اعمال در مقصد، ذخیره پایدار محلی و تولید TRANSFER_ACK (اصلاح دوم):
 * ۱. تحلیل و ادغام غیرمخرب بسته دریافتی
 * ۲. ساخت Dataset جدید در حافظه بدون ثبت زودهنگام Baseline مقصد
 * ۳. ذخیره پایدار در حافظه محلی مقصد (از طریق کالبک اپلیکیشن و/یا لایه ذخیره‌سازی پایدار)
 * ۴. ثبت متادیتای همگام‌سازی و شناسه بسته اعمال‌شده صرفاً در صورت موفقیت ذخیره پایدار
 * ۵. تولید TRANSFER_ACK با ok: true, applied: true فقط در صورت موفقیت کامل مراحل فوق؛
 *    در صورت شکست ذخیره محلی، تولید TRANSFER_ACK با ok: false, applied: false بدون تغییر Baseline.
 */
export async function executeDurableSyncPackageApplication(params: {
  pkg: SyncTransferPackage;
  currentDataset: OperationalSyncDataset;
  localDeviceId: string;
  localRole: DeviceSyncRole;
  onPersistDataset?: (
    nextDataset: OperationalSyncDataset,
    summaryMessage: string
  ) =>
    | Promise<boolean | { ok: boolean; error?: string } | void>
    | boolean
    | { ok: boolean; error?: string }
    | void;
  buildSummaryMessage?: (counts: {
    appliedNewCount: number;
    appliedModifiedCount: number;
    unchangedCount: number;
    conflictCount: number;
  }) => string;
}): Promise<
  | {
      ok: true;
      applied: true;
      report: SyncPreviewReport;
      nextDataset: OperationalSyncDataset;
      appliedNewCount: number;
      appliedModifiedCount: number;
      appliedSoftDeleteCount: number;
      resolvedConflictCount: number;
      unresolvedConflictCount: number;
      unchangedCount: number;
      summaryMessage: string;
      postCounts: { auditCount: number; totalCount: number };
      ackMessage: Extract<WireMessage, { type: 'TRANSFER_ACK' }>;
    }
  | {
      ok: false;
      applied: false;
      error: string;
      ackMessage: Extract<WireMessage, { type: 'TRANSFER_ACK' }>;
    }
> {
  try {
    const report = analyzeIncomingPackage(
      params.pkg,
      params.currentDataset,
      params.localDeviceId,
      params.localRole
    );

    const applied = applyApprovedSyncReport(
      report,
      params.currentDataset,
      params.localDeviceId,
      params.localRole,
      { deferMetadataCommit: true }
    );

    const summaryMessage = params.buildSummaryMessage
      ? params.buildSummaryMessage({
          appliedNewCount: applied.appliedNewCount,
          appliedModifiedCount: applied.appliedModifiedCount,
          unchangedCount: applied.unchangedCount,
          conflictCount: report.conflicts.length,
        })
      : `همگام‌سازی انجام شد: ${applied.appliedNewCount} جدید، ${applied.appliedModifiedCount} ویرایش، ${report.conflicts.length} تعارض.`;

    let handledByCustomPersist = false;
    if (params.onPersistDataset) {
      const customRes = await params.onPersistDataset(applied.nextDataset, summaryMessage);
      if (customRes === false) {
        const errText = 'ذخیره پایدار داده‌های همگام‌سازی در مقصد ناموفق بود.';
        return {
          ok: false,
          applied: false,
          error: errText,
          ackMessage: {
            type: 'TRANSFER_ACK',
            packageId: params.pkg.packageId,
            ok: false,
            applied: false,
            error: errText,
          },
        };
      }
      if (customRes && typeof customRes === 'object' && 'ok' in customRes) {
        if (customRes.ok !== true) {
          const errText =
            customRes.error || 'ذخیره پایدار داده‌های همگام‌سازی در مقصد با خطا مواجه شد.';
          return {
            ok: false,
            applied: false,
            error: errText,
            ackMessage: {
              type: 'TRANSFER_ACK',
              packageId: params.pkg.packageId,
              ok: false,
              applied: false,
              error: errText,
            },
          };
        }
        handledByCustomPersist = true;
      }
    }

    if (!handledByCustomPersist) {
      const storageRes = await persistSyncedDatasetDurably(applied.nextDataset);
      if (!storageRes.ok) {
        const errText =
          storageRes.error || 'خطا در ذخیره‌سازی پایدار محلی در دستگاه مقصد.';
        return {
          ok: false,
          applied: false,
          error: errText,
          ackMessage: {
            type: 'TRANSFER_ACK',
            packageId: params.pkg.packageId,
            ok: false,
            applied: false,
            error: errText,
          },
        };
      }
    }

    const metaCommitRes = applied.commitMetadata();
    if (!metaCommitRes.ok) {
      const errText =
        metaCommitRes.error || 'خطا در ثبت پایدار متادیتای همگام‌سازی در مقصد.';
      return {
        ok: false,
        applied: false,
        error: errText,
        ackMessage: {
          type: 'TRANSFER_ACK',
          packageId: params.pkg.packageId,
          ok: false,
          applied: false,
          error: errText,
        },
      };
    }

    const postAuditCount = Object.keys(applied.nextDataset.auditRecords || {}).length;
    const postTotalCount =
      postAuditCount +
      (applied.nextDataset.bookCopies?.length || 0) +
      (applied.nextDataset.customMartyrs?.length || 0) +
      (applied.nextDataset.links?.length || 0) +
      (applied.nextDataset.pendingReviews?.length || 0);

    return {
      ok: true,
      applied: true,
      report,
      nextDataset: applied.nextDataset,
      appliedNewCount: applied.appliedNewCount,
      appliedModifiedCount: applied.appliedModifiedCount,
      appliedSoftDeleteCount: applied.appliedSoftDeleteCount,
      resolvedConflictCount: applied.resolvedConflictCount,
      unresolvedConflictCount: applied.unresolvedConflictCount,
      unchangedCount: applied.unchangedCount,
      summaryMessage,
      postCounts: { auditCount: postAuditCount, totalCount: postTotalCount },
      ackMessage: {
        type: 'TRANSFER_ACK',
        packageId: params.pkg.packageId,
        ok: true,
        applied: true,
        appliedNewCount: applied.appliedNewCount,
        appliedModifiedCount: applied.appliedModifiedCount,
        unchangedCount: applied.unchangedCount,
        conflictCount: report.conflicts.length,
        receiverPostAuditCount: postAuditCount,
        receiverPostTotalCount: postTotalCount,
      },
    };
  } catch (err) {
    const errText = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      applied: false,
      error: errText,
      ackMessage: {
        type: 'TRANSFER_ACK',
        packageId: params.pkg.packageId,
        ok: false,
        applied: false,
        error: errText,
      },
    };
  }
}

/**
 * بازیابی ایمن و مرحله‌ای (با بازگردانی خودکار در صورت بروز خطا) رکورد حذف‌شده نرم برای هر ۵ مجموعه عملیاتی
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
 * بررسی سخت‌گیرانه اعتبار پیام TRANSFER_ACK برای مجوز به‌روزرسانی Baseline (اصلاح اول):
 * شرط پذیرش صریحاً ack.ok === true && ack.applied === true است.
 * پیام فاقد فیلد applied، دارای applied: false، یا دارای ok !== true رد می‌شود.
 */
export function isStrictValidTransferAck(
  ack: unknown
): ack is Extract<WireMessage, { type: 'TRANSFER_ACK' }> & { ok: true; applied: true } {
  if (!ack || typeof ack !== 'object') return false;
  const candidate = ack as Record<string, unknown>;
  return (
    (candidate.type === undefined || candidate.type === 'TRANSFER_ACK') &&
    typeof candidate.packageId === 'string' &&
    candidate.packageId.trim().length > 0 &&
    candidate.ok === true &&
    candidate.applied === true
  );
}

/**
 * به‌روزرسانی خط مبنا (Baseline) در دستگاه فرستنده **صرفاً پس از دریافت تأیید واقعی اعمال و ذخیره پایدار بسته
 * (TRANSFER_ACK با ack.ok === true && ack.applied === true) از دستگاه مقصد**.
 */
export function markPackageSentInBaseline(
  pkg: SyncTransferPackage,
  ack?: unknown
): boolean {
  if (ack !== undefined && !isStrictValidTransferAck(ack)) {
    return false;
  }
  const baselineMap = loadBaselineChangeMap();
  for (const env of pkg.envelopes) {
    const compKey = getCompositeKey(env.meta.collection, env.meta.recordId);
    baselineMap[compKey] = env.meta.changeId;
  }
  return saveBaselineChangeMap(baselineMap);
}

export const confirmPackageAppliedInBaseline = markPackageSentInBaseline;

