import {
  AuditLogEntry,
  BookCopyRecord,
  BookMartyrLinkRecord,
  CustomMartyrRecord,
  ExtractedContentItem,
  FieldAuditRecord,
  MultiMartyrGroupAudit,
  PendingReviewItem,
  ReferenceCatalogRow,
  SmartSearchSuggestion,
} from '../../data/markazAsnadData';
import {
  buildSorehMehrExtractedItems,
  buildUnifiedBookDossiers,
  enrichLinksWithSorehMehrResearch,
} from '../../data/soorehMehrResearch';
import {
  calculateCollectionCounts,
  computeDatasetsChecksum,
  FullOperationalState,
  RejectedSuggestionRecord,
} from '../../utils/backupService';
import {
  BatchStorageSaveEntry,
  hydrateOperationalKey,
  idbGetEnvelope,
  idbSetItemWithStatus,
  isIndexedDbAvailable,
  OPERATIONAL_STORAGE_KEYS,
  saveOperationalDataBatchAtomic,
} from '../../utils/indexedDbStorage';
import {
  canonicalizeRecordData,
  mergeComplementaryFields,
} from '../device-sync/conflictResolver';
import {
  computeDeterministicHash,
  generateCryptoRandomToken,
} from '../device-sync/pairingService';
import {
  APPLIED_PACKAGES_KEY,
  applyCommittedSyncMetadataToCache,
  BASELINE_CHANGE_MAP_KEY,
  getOrCreateLocalDeviceId,
  getSavedDeviceRole,
  hydrateSyncMetadataFromStorage,
  loadAppliedPackageIds,
  loadBaselineChangeMap,
  loadRecordMetaMap,
  loadSoftDeletedArchive,
  RECORD_META_MAP_KEY,
  saveSoftDeletedArchive,
} from '../device-sync/syncStorage';
import { RecordSyncMeta, SyncRecordEnvelope } from '../device-sync/types';
import {
  CollectionComparisonSummary,
  ConflictDecisionOption,
  CopyMoveHistoryExportItem,
  DeterminationStatusSummary,
  ExportExecutionResult,
  FieldDifferenceDetail,
  FullLibrarySystemDataPayload,
  FullLibrarySystemExportEnvelope,
  IdSequenceSnapshot,
  InvalidRecordDetail,
  JSON_TRANSFER_APP_VERSION,
  JSON_TRANSFER_FORMAT_ID,
  JSON_TRANSFER_SCHEMA_VERSION,
  MergeCollectionKey,
  PreMergeRecoveryPoint,
  RecordChangePreviewItem,
  RecordConflictDetail,
  SafeMergeExecutionResult,
  ShelfLocationSummaryItem,
  StorageVerificationCheck,
  SystemJsonInspectionReport,
} from './types';

const PRE_MERGE_RECOVERY_STORAGE_KEY = 'book_json_merge_recovery_point_v1';
const ID_SEQUENCE_STORAGE_KEY = 'book_id_sequences_v1';

const COLLECTION_PERSIAN_LABELS: Record<MergeCollectionKey, string> = {
  auditRecords: 'ثبت‌های کتاب‌ها، وضعیت تعیین‌تکلیف و قفسه‌ها',
  bookCopies: 'نسخه‌های فیزیکی و تاریخچه جابه‌جایی قفسه (CP)',
  links: 'ارتباط‌های کتاب و شهید',
  multiMartyrGroups: 'وضعیت ۱۶ گروه چندشهیدی',
  extractedItems: 'مطالب تفکیک‌شده و ارتباط‌های چندشهیدی',
  customMartyrs: 'پرونده‌های شهدای ثبت‌شده دستی',
  pendingReviews: 'صف موارد نیازمند بررسی کارشناسی',
  smartSuggestions: 'پیشنهادهای جست‌وجوی هوشمند',
  rejectedSuggestionsArchive: 'بایگانی پیشنهادهای ردشده',
  auditLog: 'تاریخچه عملیات سامانه',
};

const FIELD_PERSIAN_LABELS: Record<string, string> = {
  title: 'عنوان کتاب',
  author: 'نویسنده / گردآورنده',
  publisher: 'ناشر',
  year: 'سال چاپ',
  edition: 'نوبت چاپ',
  isbn: 'شابک (ISBN)',
  fipa: 'فیپا',
  registrationNo: 'شماره ثبت',
  category: 'موضوع / دسته',
  shelf: 'قفسه',
  level: 'طبقه',
  location: 'کد محل نگهداری',
  physical: 'وضعیت بررسی فیزیکی',
  copyStatus: 'وضعیت نسخه',
  physicalCondition: 'سلامت فیزیکی',
  countedCopies: 'تعداد نسخه',
  notes: 'یادداشت کارشناس',
  descriptionRaw: 'توضیحات شناسنامه‌ای',
  martyrNameRaw: 'نام شهید',
  bookTitleRaw: 'عنوان کتاب',
  alternativeTitle: 'عنوان جایگزین',
  pageReferenceRaw: 'شماره صفحه / ارجاع',
  gravePieceRaw: 'قطعه مزار',
  graveRowRaw: 'ردیف مزار',
  graveNumberRaw: 'شماره مزار',
  reviewStatus: 'وضعیت تعیین‌تکلیف / بررسی',
  reviewerNote: 'یادداشت بازبین',
  trackingStatus: 'وضعیت پیگیری',
  decisionStatus: 'وضعیت تصمیم گروه چندشهیدی',
  extractedText: 'متن گزیده استخراج‌شده',
  passageTitle: 'عنوان مطلب',
  loanOrMoveStatus: 'وضعیت امانت یا جابه‌جایی',
  expertNote: 'یادداشت نسخه فیزیکی',
  fullName: 'نام کامل شهید',
  identityVerificationStatus: 'وضعیت احراز هویت',
  graveVerificationStatus: 'وضعیت مزار',
};

const IGNORED_DIFF_KEYS = new Set([
  'updatedAt',
  '_updatedAt',
  'updatedAtMs',
  'lastReviewedAt',
  'observedDate',
  'createdAt',
  'timestamp',
]);

const FORBIDDEN_SECRET_KEY_PATTERNS = [
  /api[_-]?key/i,
  /auth[_-]?token/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /secret/i,
  /password/i,
  /firebase/i,
  /supabase/i,
  /private[_-]?key/i,
];

/**
 * پالایش امنیتی برای اطمینان از اینکه هیچ کلید دسترسی، توکن یا داده ابری وارد فایل JSON نمی‌شود
 */
export function sanitizeExportObject<T>(input: T): T {
  if (input === null || input === undefined || typeof input !== 'object') {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeExportObject(item)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (FORBIDDEN_SECRET_KEY_PATTERNS.some((pat) => pat.test(k))) {
      continue;
    }
    out[k] = sanitizeExportObject(v);
  }
  return out as T;
}

function readLocalIdSequences(): IdSequenceSnapshot {
  const fallback: IdSequenceSnapshot = {
    LOG: 1000,
    RL: 1000,
    SS: 1000,
    MR: 1000,
    EX: 1000,
    CP: 1000,
    TMP_OUT: 1,
  };
  try {
    const raw = localStorage.getItem(ID_SEQUENCE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          LOG: Number(parsed.LOG) || fallback.LOG,
          RL: Number(parsed.RL) || fallback.RL,
          SS: Number(parsed.SS) || fallback.SS,
          MR: Number(parsed.MR) || fallback.MR,
          EX: Number(parsed.EX) || fallback.EX,
          CP: Number(parsed.CP) || fallback.CP,
          TMP_OUT: Number(parsed.TMP_OUT) || fallback.TMP_OUT,
        };
      }
    }
  } catch {
    // ignore
  }
  return fallback;
}

function formatJalaliDateTimeForDisplay(date: Date): string {
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export function buildExportFileName(date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '00';
    const y = getPart('year');
    const m = getPart('month');
    const d = getPart('day');
    const hh = getPart('hour');
    const mm = getPart('minute');
    const ss = getPart('second');
    return `book-library-full-system-${y}-${m}-${d}_${hh}-${mm}-${ss}.json`;
  } catch {
    const iso = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `book-library-full-system-${iso}.json`;
  }
}

/**
 * محاسبه هش قطعی برای بخش data جهت بررسی صحت و کامل بودن فایل (Integrity)
 */
export function computeSystemDataIntegrityHash(data: Partial<FullLibrarySystemDataPayload>): string {
  const coreForHash = {
    auditRecords: data.auditRecords || {},
    bookCopies: data.bookCopies || [],
    customMartyrs: data.customMartyrs || [],
    links: data.links || [],
    multiMartyrGroups: data.multiMartyrGroups || [],
    extractedItems: data.extractedItems || [],
    pendingReviews: data.pendingReviews || [],
    smartSuggestions: data.smartSuggestions || [],
    rejectedSuggestionsArchive: data.rejectedSuggestionsArchive || [],
    auditLog: data.auditLog || [],
    userSettings: data.userSettings || { activeRole: 'registrar' },
  };
  return computeDeterministicHash(JSON.stringify(coreForHash));
}

/**
 * بررسی و تطبیق تعداد رکوردهای استخراج‌شده با اطلاعات واقعی Storage (IndexedDB + localStorage)
 */
export async function verifyExportAgainstRealStorage(
  state: FullOperationalState
): Promise<StorageVerificationCheck> {
  const checkedAtIso = new Date().toISOString();
  const idbAvail = isIndexedDbAvailable();
  let localAvail = false;
  try {
    localAvail = typeof localStorage !== 'undefined' && localStorage !== null;
  } catch {
    localAvail = false;
  }

  const extractedCounts: Record<string, number> = {
    auditRecords: Object.keys(state.auditRecords || {}).length,
    bookCopies: (state.bookCopies || []).length,
    customMartyrs: (state.customMartyrs || []).length,
    links: (state.links || []).length,
    multiMartyrGroups: (state.multiMartyrGroups || []).length,
    extractedItems: (state.extractedItems || []).length,
    pendingReviews: (state.pendingReviews || []).length,
    smartSuggestions: (state.smartSuggestions || []).length,
    rejectedSuggestionsArchive: (state.rejectedSuggestionsArchive || []).length,
    auditLog: (state.auditLog || []).length,
  };

  const storageActualCounts: Record<string, number> = {};
  const mismatches: string[] = [];

  const keyPairs: Array<{ name: keyof typeof extractedCounts; storageKey: string; fallback: unknown }> = [
    { name: 'auditRecords', storageKey: OPERATIONAL_STORAGE_KEYS.auditRecords, fallback: state.auditRecords },
    { name: 'bookCopies', storageKey: OPERATIONAL_STORAGE_KEYS.bookCopies, fallback: state.bookCopies },
    { name: 'customMartyrs', storageKey: OPERATIONAL_STORAGE_KEYS.customMartyrs, fallback: state.customMartyrs },
    { name: 'links', storageKey: OPERATIONAL_STORAGE_KEYS.links, fallback: state.links },
    { name: 'multiMartyrGroups', storageKey: OPERATIONAL_STORAGE_KEYS.multiMartyrGroups, fallback: state.multiMartyrGroups },
    { name: 'extractedItems', storageKey: OPERATIONAL_STORAGE_KEYS.extractedItems, fallback: state.extractedItems },
    { name: 'pendingReviews', storageKey: OPERATIONAL_STORAGE_KEYS.pendingReviews, fallback: state.pendingReviews },
    { name: 'smartSuggestions', storageKey: OPERATIONAL_STORAGE_KEYS.smartSuggestions, fallback: state.smartSuggestions },
    { name: 'rejectedSuggestionsArchive', storageKey: OPERATIONAL_STORAGE_KEYS.rejectedSuggestions, fallback: state.rejectedSuggestionsArchive },
    { name: 'auditLog', storageKey: OPERATIONAL_STORAGE_KEYS.auditLog, fallback: state.auditLog },
  ];

  for (const item of keyPairs) {
    try {
      const hydrated = await hydrateOperationalKey(item.storageKey, item.fallback);
      const val = hydrated.value;
      const count = Array.isArray(val)
        ? val.length
        : val && typeof val === 'object'
        ? Object.keys(val as object).length
        : 0;
      storageActualCounts[item.name] = count;

      // توجه: در links و extractedItems ممکن است غنی‌سازی سوره مهر در حافظه فعال انجام شده باشد که رکوردهای بیشتری نسبت به خام دارد
      if (item.name !== 'links' && item.name !== 'extractedItems') {
        if (extractedCounts[item.name] < count) {
          mismatches.push(
            `مجموعه ${item.name}: استخراج‌شده (${extractedCounts[item.name]}) کمتر از Storage (${count})`
          );
        }
      }
    } catch {
      storageActualCounts[item.name] = extractedCounts[item.name];
    }
  }

  return {
    verified: mismatches.length === 0,
    checkedAtIso,
    indexedDbAvailable: idbAvail,
    localStorageAvailable: localAvail,
    extractedCounts,
    storageActualCounts,
    mismatches,
  };
}

/**
 * استخراج کامل تمام منابع اطلاعاتی واقعی سیستم (IndexedDB + localStorage + State)
 * و تولید فایل JSON نسخه‌دار و معتبر بدون تغییر در داده اصلی
 */
export async function buildFullSystemJsonExport(
  activeState: FullOperationalState,
  catalogRows: ReferenceCatalogRow[] = []
): Promise<ExportExecutionResult> {
  try {
    // ۱. بازیابی آخرین وضعیت از IndexedDB و localStorage برای اطمینان از عدم جا ماندن هیچ داده‌ای
    const [
      hydAudit,
      hydCopies,
      hydMartyrs,
      hydSmart,
      hydGroups,
      hydExtracted,
      hydLinks,
      hydPending,
      hydLog,
      hydRejected,
      syncMetaSnapshot,
    ] = await Promise.all([
      hydrateOperationalKey<Record<string, FieldAuditRecord>>(
        OPERATIONAL_STORAGE_KEYS.auditRecords,
        activeState.auditRecords
      ),
      hydrateOperationalKey<BookCopyRecord[]>(
        OPERATIONAL_STORAGE_KEYS.bookCopies,
        activeState.bookCopies
      ),
      hydrateOperationalKey<CustomMartyrRecord[]>(
        OPERATIONAL_STORAGE_KEYS.customMartyrs,
        activeState.customMartyrs
      ),
      hydrateOperationalKey<SmartSearchSuggestion[]>(
        OPERATIONAL_STORAGE_KEYS.smartSuggestions,
        activeState.smartSuggestions
      ),
      hydrateOperationalKey<MultiMartyrGroupAudit[]>(
        OPERATIONAL_STORAGE_KEYS.multiMartyrGroups,
        activeState.multiMartyrGroups
      ),
      hydrateOperationalKey<ExtractedContentItem[]>(
        OPERATIONAL_STORAGE_KEYS.extractedItems,
        activeState.extractedItems
      ),
      hydrateOperationalKey<BookMartyrLinkRecord[]>(
        OPERATIONAL_STORAGE_KEYS.links,
        activeState.links
      ),
      hydrateOperationalKey<PendingReviewItem[]>(
        OPERATIONAL_STORAGE_KEYS.pendingReviews,
        activeState.pendingReviews
      ),
      hydrateOperationalKey<AuditLogEntry[]>(
        OPERATIONAL_STORAGE_KEYS.auditLog,
        activeState.auditLog
      ),
      hydrateOperationalKey<RejectedSuggestionRecord[]>(
        OPERATIONAL_STORAGE_KEYS.rejectedSuggestions,
        activeState.rejectedSuggestionsArchive
      ),
      hydrateSyncMetadataFromStorage(),
    ]);

    // ترکیب امن بدون تغییر داده اصلی (کلون عمیق)
    const auditRecords: Record<string, FieldAuditRecord> = JSON.parse(
      JSON.stringify({
        ...(hydAudit.value || {}),
        ...(activeState.auditRecords || {}),
      })
    );

    const mergeUniqueById = <T>(a: T[], b: T[], getId: (item: T) => string): T[] => {
      const map = new Map<string, T>();
      for (const item of a || []) {
        if (!item) continue;
        const id = getId(item);
        if (id) map.set(id, item);
      }
      for (const item of b || []) {
        if (!item) continue;
        const id = getId(item);
        if (id) map.set(id, item);
      }
      return JSON.parse(JSON.stringify(Array.from(map.values())));
    };

    const bookCopies = mergeUniqueById(
      hydCopies.value || [],
      activeState.bookCopies || [],
      (c) => c.copyId
    );
    const customMartyrs = mergeUniqueById(
      hydMartyrs.value || [],
      activeState.customMartyrs || [],
      (m) => m.martyrId
    );
    const links = mergeUniqueById(
      hydLinks.value || [],
      activeState.links || [],
      (l) => l.id
    );
    const multiMartyrGroups = mergeUniqueById(
      hydGroups.value || [],
      activeState.multiMartyrGroups || [],
      (g) => g.groupCode
    );
    const extractedItems = mergeUniqueById(
      hydExtracted.value || [],
      activeState.extractedItems || [],
      (e) => e.id
    );
    const pendingReviews = mergeUniqueById(
      hydPending.value || [],
      activeState.pendingReviews || [],
      (p) => p.trackingId
    );
    const smartSuggestions = mergeUniqueById(
      hydSmart.value || [],
      activeState.smartSuggestions || [],
      (s) => s.id
    );
    const rejectedSuggestionsArchive = mergeUniqueById(
      hydRejected.value || [],
      activeState.rejectedSuggestionsArchive || [],
      (r) => r.id || `${r.martyrName}::${r.bookTitle}`
    );
    const auditLog = mergeUniqueById(
      hydLog.value || [],
      activeState.auditLog || [],
      (l) => l.id
    );

    const completeOperationalState: FullOperationalState = {
      auditRecords,
      bookCopies,
      customMartyrs,
      smartSuggestions,
      links,
      pendingReviews,
      multiMartyrGroups,
      extractedItems,
      auditLog,
      userSettings: activeState.userSettings || { activeRole: 'registrar' },
      rejectedSuggestionsArchive,
    };

    // ۲. ساخت نماهای تحلیلی و پرونده کامل کتاب‌ها (شامل ۱۴ دسته اطلاعاتی بخش سوم)
    const booksDossiers = buildUnifiedBookDossiers({
      catalogRows,
      auditRecords,
      bookCopies,
      links,
      extractedItems,
    });

    const newRegistrations = Object.values(auditRecords).filter(
      (r) => r && r.source === 'outside-list'
    );

    const shelfLocations: ShelfLocationSummaryItem[] = Object.values(auditRecords)
      .filter((r) => r && (r.location || r.shelf))
      .map((r) => ({
        recordKey: r.key,
        bookId: r.tempBookId,
        copyId: r.copyId,
        title: r.title,
        shelf: r.shelf || '',
        level: r.level || '',
        locationCode: r.location || '',
        countedCopies: r.countedCopies || '1',
        physicalStatus: r.physical,
      }));

    const locationHistory: CopyMoveHistoryExportItem[] = bookCopies.flatMap((cp) =>
      (cp.locationHistory || []).map((h) => ({
        copyId: cp.copyId,
        bookId: cp.bookId,
        bookTitle: cp.bookTitle,
        fromLocation: h.fromLocation,
        toLocation: h.toLocation,
        movedAt: h.movedAt,
        movedBy: h.movedBy,
        reason: h.reason,
      }))
    );

    const authorsSet = new Set<string>();
    const publishersSet = new Set<string>();
    const categoriesSet = new Set<string>();
    for (const d of booksDossiers) {
      if (d.author && d.author !== 'ثبت‌نشده' && d.author !== '—') authorsSet.add(d.author);
      if (d.publisher && d.publisher !== 'ثبت‌نشده' && d.publisher !== '—') {
        publishersSet.add(d.publisher);
      }
      if (d.category && d.category !== '—') categoriesSet.add(d.category);
    }

    const determinationSummary: DeterminationStatusSummary = {
      totalUniqueBooks: booksDossiers.length,
      definiteMartyrLinksCount: links.filter(
        (l) => l.reviewStatus === 'قطعی' || l.reviewStatus === 'تأییدشده'
      ).length,
      probableMartyrLinksCount: links.filter((l) => l.reviewStatus === 'احتمالی').length,
      needsReviewMartyrLinksCount: links.filter(
        (l) =>
          l.reviewStatus === 'نیازمند بررسی' ||
          l.reviewStatus === 'بررسی‌نشده' ||
          l.reviewStatus.includes('تفکیک')
      ).length,
      generalOrUnlinkedBooksCount: booksDossiers.filter((d) => d.martyrRelations.length === 0)
        .length,
      verifiedInShelfCount: Object.values(auditRecords).filter((r) => r.physical === 'verified')
        .length,
      needsShelfReviewCount: Object.values(auditRecords).filter((r) => r.physical === 'review')
        .length,
      notFoundInShelfCount: Object.values(auditRecords).filter((r) => r.physical === 'not_found')
        .length,
      newOutsideRegistrationsCount: newRegistrations.length,
    };

    const softDeletedArchive = loadSoftDeletedArchive();
    const idSequences = readLocalIdSequences();

    const dataPayload: FullLibrarySystemDataPayload = sanitizeExportObject({
      auditRecords,
      links,
      multiMartyrGroups,
      extractedItems,
      customMartyrs,
      bookCopies,
      pendingReviews,
      smartSuggestions,
      rejectedSuggestionsArchive,
      userSettings: completeOperationalState.userSettings,
      idSequences,
      auditLog,
      syncRecordMeta: syncMetaSnapshot.recordMetaMap || loadRecordMetaMap(),
      syncBaselineHashes: syncMetaSnapshot.baselineChangeMap || loadBaselineChangeMap(),
      syncAppliedPackages: syncMetaSnapshot.appliedPackageIds || loadAppliedPackageIds(),
      softDeletedArchive,
      derivedSnapshots: {
        booksDossiersCount: booksDossiers.length,
        booksDossiers,
        newRegistrations,
        determinationSummary,
        shelfLocations,
        locationHistory,
        authorsList: Array.from(authorsSet),
        publishersList: Array.from(publishersSet),
        categoriesList: Array.from(categoriesSet),
      },
    });

    // ۳. اعتبارسنجی در برابر Storage واقعی
    const storageVerification = await verifyExportAgainstRealStorage(completeOperationalState);
    const baseCounts = calculateCollectionCounts(completeOperationalState);
    const payloadHash = computeSystemDataIntegrityHash(dataPayload);
    const fnv1aChecksum = computeDatasetsChecksum(completeOperationalState);

    const now = new Date();
    const exportId = `EXP_${now.getTime()}_${generateCryptoRandomToken(4)}`;
    const deviceId = getOrCreateLocalDeviceId();
    const deviceRole = getSavedDeviceRole();

    const multiMartyrLinksCount =
      links.filter((l) => l.isGroupPhrase || (l.sourceSheet || '').includes('چند شهید')).length +
      extractedItems.length;

    const envelope: FullLibrarySystemExportEnvelope = {
      format: JSON_TRANSFER_FORMAT_ID,
      schemaVersion: JSON_TRANSFER_SCHEMA_VERSION,
      version: 3,
      backupType: 'FULL_SYSTEM_BACKUP',
      appTitle: 'سامانه کتابخانه و پژوهش مرکز اسناد گلزار شهدا',
      appVersion: JSON_TRANSFER_APP_VERSION,
      exportId,
      deviceId,
      deviceRole,
      exportedAt: now.toISOString(),
      exportedAtJalali: formatJalaliDateTimeForDisplay(now),
      exportedTimestamp: now.getTime(),
      data: dataPayload,
      integrity: {
        algorithm: 'SHA256-DETERMINISTIC+FNV1A',
        payloadHash,
        fnv1aChecksum,
        collectionCounts: {
          ...baseCounts,
          newRegistrations: newRegistrations.length,
          multiMartyrLinks: multiMartyrLinksCount,
          locationHistoryEntries: locationHistory.length,
          softDeletedTombstones: Object.keys(softDeletedArchive).length,
          syncMetaEntries: Object.keys(dataPayload.syncRecordMeta || {}).length,
        },
        storageVerification,
      },
      // حفظ سازگاری کامل با نسخه ۳ پشتیبان
      checksum: fnv1aChecksum,
      counts: baseCounts,
      datasets: completeOperationalState,
      records: Object.values(auditRecords),
    };

    const jsonString = JSON.stringify(envelope, null, 2);

    // ۴. بازخوانی و اعتبارسنجی JSON تولیدشده پیش از تحویل به کاربر
    const reparsed = JSON.parse(jsonString) as FullLibrarySystemExportEnvelope;
    if (
      !reparsed ||
      reparsed.format !== JSON_TRANSFER_FORMAT_ID ||
      reparsed.integrity?.payloadHash !== payloadHash
    ) {
      throw new Error('اعتبارسنجی نهایی فایل JSON تولیدشده با خطا مواجه شد.');
    }

    const fileName = buildExportFileName(now);
    const byteSize = new Blob([jsonString], { type: 'application/json;charset=utf-8' }).size;

    return {
      ok: true,
      fileName,
      jsonString,
      byteSize,
      envelope,
      storageVerification,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      fileName: '',
      jsonString: '',
      byteSize: 0,
      envelope: null as unknown as FullLibrarySystemExportEnvelope,
      storageVerification: {
        verified: false,
        checkedAtIso: new Date().toISOString(),
        indexedDbAvailable: false,
        localStorageAvailable: false,
        extractedCounts: {},
        storageActualCounts: {},
        mismatches: ['خطا در تولید خروجی'],
      },
    };
  }
}

/**
 * دانلود مستقیم فایل JSON روی دستگاه (رایانه یا موبایل)
 */
export function triggerJsonFileDownload(jsonString: string, fileName: string): boolean {
  try {
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    return true;
  } catch {
    return false;
  }
}

/**
 * اشتراک‌گذاری مستقیم فایل JSON در اندروید / موبایل در صورت پشتیبانی مرورگر از Web Share API
 */
export async function shareJsonFileIfSupported(
  jsonString: string,
  fileName: string
): Promise<{ shared: boolean; reason?: string }> {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
      return { shared: false, reason: 'مرورگر فعلی از قابلیت اشتراک‌گذاری مستقیم فایل پشتیبانی نمی‌کند.' };
    }
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    const file = new File([blob], fileName, { type: 'application/json' });
    if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
      return { shared: false, reason: 'اشتراک‌گذاری مستقیم فایل در این مرورگر فعال نیست؛ از دانلود مستقیم استفاده شد.' };
    }
    await navigator.share({
      title: 'نسخه کامل اطلاعات کتابخانه (JSON)',
      text: `فایل پشتیبان و انتقال کامل اطلاعات کتابخانه (${fileName})`,
      files: [file],
    });
    return { shared: true };
  } catch (err) {
    return {
      shared: false,
      reason: err instanceof Error ? err.message : 'لغو یا عدم پشتیبانی اشتراک‌گذاری',
    };
  }
}

function isMeaningfulVal(val: unknown): boolean {
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
      t !== 'ثبت‌نشده'
    );
  }
  if (Array.isArray(val)) return val.length > 0;
  return true;
}

function normalizeForCompare(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    return JSON.stringify(val);
  }
  return String(val)
    .trim()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200B-\u200D\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ');
}

function extractDifferingFields(
  destRec: unknown,
  incRec: unknown
): {
  hasRealConflict: boolean;
  hasComplementaryAddition: boolean;
  complementaryMerged: unknown;
  differingFields: FieldDifferenceDetail[];
} {
  if (
    !destRec ||
    typeof destRec !== 'object' ||
    !incRec ||
    typeof incRec !== 'object'
  ) {
    const same = normalizeForCompare(destRec) === normalizeForCompare(incRec);
    return {
      hasRealConflict: !same,
      hasComplementaryAddition: false,
      complementaryMerged: destRec,
      differingFields: same
        ? []
        : [
            {
              fieldKey: 'value',
              fieldLabel: 'مقدار رکورد',
              destinationValue: String(destRec ?? '—'),
              incomingValue: String(incRec ?? '—'),
            },
          ],
    };
  }

  const destObj = destRec as Record<string, unknown>;
  const incObj = incRec as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(destObj), ...Object.keys(incObj)]);
  const merged: Record<string, unknown> = { ...destObj };
  const differingFields: FieldDifferenceDetail[] = [];
  let hasComplementaryAddition = false;

  for (const k of allKeys) {
    if (IGNORED_DIFF_KEYS.has(k)) continue;
    const dVal = destObj[k];
    const iVal = incObj[k];
    const dHas = isMeaningfulVal(dVal);
    const iHas = isMeaningfulVal(iVal);

    if (!dHas && iHas) {
      merged[k] = iVal;
      hasComplementaryAddition = true;
    } else if (dHas && iHas) {
      // برای آرایه locationHistory در نسخه‌های فیزیکی، تاریخچه‌های هر دو دستگاه را بدون تعارض ترکیب کن
      if (k === 'locationHistory' && Array.isArray(dVal) && Array.isArray(iVal)) {
        const seen = new Set(dVal.map((x) => JSON.stringify(x)));
        const combined = [...dVal];
        for (const item of iVal) {
          const s = JSON.stringify(item);
          if (!seen.has(s)) {
            seen.add(s);
            combined.push(item);
            hasComplementaryAddition = true;
          }
        }
        merged[k] = combined;
        continue;
      }

      const normD = normalizeForCompare(dVal);
      const normI = normalizeForCompare(iVal);
      if (normD !== normI) {
        differingFields.push({
          fieldKey: k,
          fieldLabel: FIELD_PERSIAN_LABELS[k] || k,
          destinationValue: typeof dVal === 'object' ? JSON.stringify(dVal) : String(dVal),
          incomingValue: typeof iVal === 'object' ? JSON.stringify(iVal) : String(iVal),
        });
      }
    }
  }

  return {
    hasRealConflict: differingFields.length > 0,
    hasComplementaryAddition,
    complementaryMerged: merged,
    differingFields,
  };
}

function buildRecordSummaryTitle(collection: MergeCollectionKey, rec: Record<string, unknown>): string {
  switch (collection) {
    case 'auditRecords':
      return `${rec.title || 'کتاب بدون عنوان'} (${rec.tempBookId || rec.key || '—'}${
        rec.location ? ` · ${rec.location}` : ''
      })`;
    case 'bookCopies':
      return `نسخه ${rec.copyId || '—'} — ${rec.bookTitle || rec.bookId || ''} (${
        rec.location || 'بدون محل'
      })`;
    case 'links':
      return `کتاب «${rec.bookTitleRaw || '—'}» ↔ شهید «${rec.martyrNameRaw || '—'}» (${
        rec.reviewStatus || '—'
      })`;
    case 'multiMartyrGroups':
      return `گروه چندشهیدی ${rec.groupCode || '—'}: ${rec.registeredTitle || ''}`;
    case 'extractedItems':
      return `مطلب تفکیک‌شده: ${rec.passageTitle || rec.contentType || ''} — شهید ${
        rec.martyrNameRaw || '—'
      } (ص ${rec.pageReferenceRaw || '—'})`;
    case 'customMartyrs':
      return `شهید ${rec.fullName || '—'} (${rec.martyrId || '—'} · قطعه ${rec.gravePiece || '—'})`;
    case 'pendingReviews':
      return `بررسی ${rec.trackingId || '—'}: «${rec.bookTitle || ''}» — ${rec.nameOrPhrase || ''}`;
    case 'smartSuggestions':
      return `پیشنهاد هوشمند: «${rec.bookTitle || ''}» برای شهید ${rec.martyrName || ''}`;
    case 'rejectedSuggestionsArchive':
      return `ردشده: «${rec.bookTitle || ''}» — شهید ${rec.martyrName || ''}`;
    case 'auditLog':
      return `لاگ ${rec.id || '—'}: ${rec.actionType || ''} (${rec.targetId || ''})`;
    default:
      return String(rec.id || rec.key || 'رکورد');
  }
}

/**
 * مراحل اول و دوم (بخش چهارم): اعتبارسنجی کامل فایل JSON و مقایسه دقیق اطلاعات با دستگاه مقصد
 * بدون اعمال هیچ تغییری در اطلاعات مقصد
 */
export function inspectAndCompareSystemJson(
  rawJsonText: string,
  fileName: string,
  fileSizeBytes: number,
  destinationState: FullOperationalState,
  catalogRows: ReferenceCatalogRow[] = []
): SystemJsonInspectionReport {
  const createErrorReport = (reason: string, detectedVersion = 0): SystemJsonInspectionReport => ({
    valid: false,
    errorReason: reason,
    warnings: [],
    fileName,
    fileSizeBytes,
    detectedFormat: 'نامعتبر',
    detectedSchemaVersion: detectedVersion,
    appVersion: 'نامشخص',
    exportId: '—',
    sourceDeviceId: '—',
    sourceDeviceRole: '—',
    exportedAt: 'نامشخص',
    exportedAtJalali: 'نامشخص',
    integrityValid: false,
    summaryMetrics: {
      booksCount: 0,
      bookMartyrLinksCount: 0,
      multiMartyrRelationsCount: 0,
      newRegistrationsCount: 0,
      identifiedChangesCount: 0,
      existingUnchangedOrDuplicateCount: 0,
      potentialConflictsCount: 0,
      invalidOrUntransferableCount: 0,
      totalIncomingOperationalRecords: 0,
      totalDestinationOperationalRecords: 0,
    },
    collectionComparisons: [],
    newRecords: [],
    modifiedRecords: [],
    softDeletedRecords: [],
    conflicts: [],
    invalidRecords: [],
  });

  if (!rawJsonText || !rawJsonText.trim()) {
    return createErrorReport('فایل انتخاب‌شده خالی است.');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawJsonText);
  } catch {
    return createErrorReport(
      'ساختار فایل JSON خراب یا نامعتبر است. لطفاً یک فایل پشتیبان سالم JSON انتخاب نمایید.'
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return createErrorReport('محتوای فایل انتخاب‌شده یک شیء معتبر JSON متعلق به کتابخانه نیست.');
  }

  // بررسی نسخه ساختار داده (رد نسخه‌های آینده ناسازگار یا فرمت‌های بیگانه)
  const rawSchemaVersion = Number(parsed.schemaVersion ?? parsed.version ?? 0);
  if (rawSchemaVersion > JSON_TRANSFER_SCHEMA_VERSION) {
    return createErrorReport(
      `نسخه ساختار داده فایل ورودی (نسخه ${rawSchemaVersion}) جدیدتر از نسخه پشتیبانی‌شده این نرم‌افزار (حداکثر نسخه ${JSON_TRANSFER_SCHEMA_VERSION}) است و برای جلوگیری از آسیب به اطلاعات وارد نمی‌شود.`,
      rawSchemaVersion
    );
  }

  if (
    parsed.format &&
    typeof parsed.format === 'string' &&
    parsed.format !== JSON_TRANSFER_FORMAT_ID &&
    parsed.format !== 'markaz-asnad-library-workbook-json'
  ) {
    return createErrorReport(
      `فرمت فایل انتخاب‌شده (${parsed.format}) متعلق به سیستم پشتیبان کتابخانه نیست.`,
      rawSchemaVersion
    );
  }

  if (parsed.format === 'markaz-asnad-library-workbook-json') {
    return createErrorReport(
      'این فایل، کارپوشه خام اکسل اولیه است؛ نه فایل پشتیبان/انتقال سیستم. لطفاً فایلی را که با دکمه «دریافت خروجی کامل JSON» تهیه شده است انتخاب کنید.',
      rawSchemaVersion
    );
  }

  // استخراج منبع داده از ساختار نسخه ۴ (`data`)، نسخه ۳ (`datasets`) یا نسخه ۲ قدیمی (`records`)
  let rawSource: Record<string, unknown> | null = null;
  let detectedSchemaVersion = rawSchemaVersion || 3;
  let detectedFormat =
    typeof parsed.format === 'string' ? parsed.format : 'FULL_SYSTEM_BACKUP';
  const warnings: string[] = [];

  if (parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)) {
    rawSource = parsed.data as Record<string, unknown>;
    detectedSchemaVersion = rawSchemaVersion || 4;
  } else if (parsed.datasets && typeof parsed.datasets === 'object' && !Array.isArray(parsed.datasets)) {
    rawSource = parsed.datasets as Record<string, unknown>;
    detectedSchemaVersion = rawSchemaVersion || 3;
  } else if (parsed.records && (Array.isArray(parsed.records) || typeof parsed.records === 'object')) {
    rawSource = { auditRecords: parsed.records };
    detectedSchemaVersion = 2;
    detectedFormat = 'LEGACY_V2_RECORDS';
    warnings.push('این فایل متعلق به نسخه ۲ قدیمی است و فقط شامل ثبت‌های قفسه (records) می‌باشد.');
  }

  if (!rawSource) {
    return createErrorReport(
      'ساختار فایل با نرم‌افزار کتابخانه سازگار نیست (بخش data یا datasets در فایل یافت نشد).',
      rawSchemaVersion
    );
  }

  // بررسی صحت اطلاعات Integrity / Checksum
  let integrityValid = true;
  let expectedHash: string | undefined;
  let computedHash: string | undefined;

  if (parsed.integrity && typeof parsed.integrity === 'object') {
    const intObj = parsed.integrity as Record<string, unknown>;
    if (typeof intObj.payloadHash === 'string') {
      expectedHash = intObj.payloadHash;
      computedHash = computeSystemDataIntegrityHash(rawSource as Partial<FullLibrarySystemDataPayload>);
      integrityValid = expectedHash === computedHash;
    }
  } else if (typeof parsed.checksum === 'string') {
    expectedHash = parsed.checksum;
    computedHash = computeDatasetsChecksum(rawSource as Partial<FullOperationalState>);
    integrityValid = expectedHash === computedHash;
  }

  if (!integrityValid) {
    return createErrorReport(
      `اطلاعات کنترلی صحت فایل (Integrity Checksum) همخوانی ندارد (مورد انتظار: ${expectedHash}، محاسبه‌شده: ${computedHash}). احتمال دستکاری یا ناقص بودن فایل وجود دارد و ورود آن متوقف شد.`,
      detectedSchemaVersion
    );
  }

  const invalidRecords: InvalidRecordDetail[] = [];

  // ۱. اعتبارسنجی و نرمال‌سازی auditRecords
  const incomingAuditRecords: Record<string, FieldAuditRecord> = {};
  const rawAudit = rawSource.auditRecords;
  if (rawAudit !== undefined && rawAudit !== null) {
    if (Array.isArray(rawAudit)) {
      rawAudit.forEach((item, idx) => {
        if (!item || typeof item !== 'object') {
          invalidRecords.push({
            collection: 'auditRecords',
            indexOrKey: String(idx),
            reason: 'رکورد کتاب یک شیء معتبر نیست.',
          });
          return;
        }
        const rec = item as FieldAuditRecord;
        const key = (rec.key || rec.tempBookId || '').trim();
        const title = (rec.title || '').trim();
        if (!key || !title) {
          invalidRecords.push({
            collection: 'auditRecords',
            indexOrKey: key || `ردیف ${idx + 1}`,
            reason: 'شناسه کتاب (key/tempBookId) یا عنوان کتاب خالی است.',
          });
          return;
        }
        incomingAuditRecords[key] = { ...rec, key, tempBookId: rec.tempBookId || key };
      });
    } else if (typeof rawAudit === 'object') {
      for (const [k, item] of Object.entries(rawAudit as Record<string, unknown>)) {
        if (!item || typeof item !== 'object') {
          invalidRecords.push({
            collection: 'auditRecords',
            indexOrKey: k,
            reason: 'رکورد کتاب یک شیء معتبر نیست.',
          });
          continue;
        }
        const rec = item as FieldAuditRecord;
        const key = (rec.key || k || rec.tempBookId || '').trim();
        const title = (rec.title || '').trim();
        if (!key || !title) {
          invalidRecords.push({
            collection: 'auditRecords',
            indexOrKey: k,
            reason: 'شناسه یا عنوان کتاب در رکورد قفسه وجود ندارد.',
          });
          continue;
        }
        incomingAuditRecords[key] = { ...rec, key, tempBookId: rec.tempBookId || key };
      }
    } else {
      return createErrorReport('فرمت بخش ثبت‌های کتاب (auditRecords) در فایل ورودی نامعتبر است.');
    }
  }

  // تابع کمکی اعتبارسنجی آرایه‌ها
  const validateArrayCollection = <T>(
    collectionName: string,
    rawArr: unknown,
    isValidItem: (item: Record<string, unknown>) => { ok: boolean; id?: string; reason?: string }
  ): T[] => {
    if (rawArr === undefined || rawArr === null) return [];
    if (!Array.isArray(rawArr)) {
      invalidRecords.push({
        collection: collectionName,
        indexOrKey: 'ROOT',
        reason: `مجموعه ${collectionName} یک آرایه معتبر نیست.`,
      });
      return [];
    }
    const validList: T[] = [];
    rawArr.forEach((rawItem, idx) => {
      if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
        invalidRecords.push({
          collection: collectionName,
          indexOrKey: `ردیف ${idx + 1}`,
          reason: 'ساختار رکورد نامعتبر است.',
        });
        return;
      }
      const check = isValidItem(rawItem as Record<string, unknown>);
      if (!check.ok) {
        invalidRecords.push({
          collection: collectionName,
          indexOrKey: check.id || `ردیف ${idx + 1}`,
          reason: check.reason || 'فیلدهای الزامی رکورد ناقص است.',
        });
        return;
      }
      validList.push(rawItem as T);
    });
    return validList;
  };

  const incomingBookCopies = validateArrayCollection<BookCopyRecord>(
    'bookCopies',
    rawSource.bookCopies,
    (it) => {
      const copyId = String(it.copyId || '').trim();
      if (!copyId) return { ok: false, reason: 'شناسه نسخه فیزیکی (copyId) وجود ندارد.' };
      return { ok: true, id: copyId };
    }
  );

  const incomingLinks = validateArrayCollection<BookMartyrLinkRecord>(
    'links',
    rawSource.links,
    (it) => {
      const id = String(it.id || '').trim();
      const martyr = String(it.martyrNameRaw || '').trim();
      const book = String(it.bookTitleRaw || it.tempBookId || '').trim();
      if (!id || (!martyr && !book)) {
        return {
          ok: false,
          id,
          reason: 'شناسه ارتباط کتاب و شهید (id) یا نام شهید/کتاب خالی است.',
        };
      }
      return { ok: true, id };
    }
  );

  const incomingMultiMartyrGroups = validateArrayCollection<MultiMartyrGroupAudit>(
    'multiMartyrGroups',
    rawSource.multiMartyrGroups,
    (it) => {
      const code = String(it.groupCode || '').trim();
      if (!code) return { ok: false, reason: 'کد گروه چندشهیدی (groupCode) خالی است.' };
      return { ok: true, id: code };
    }
  );

  const incomingExtractedItems = validateArrayCollection<ExtractedContentItem>(
    'extractedItems',
    rawSource.extractedItems,
    (it) => {
      const id = String(it.id || '').trim();
      if (!id) return { ok: false, reason: 'شناسه مطلب تفکیک‌شده (id) خالی است.' };
      return { ok: true, id };
    }
  );

  const incomingCustomMartyrs = validateArrayCollection<CustomMartyrRecord>(
    'customMartyrs',
    rawSource.customMartyrs,
    (it) => {
      const id = String(it.martyrId || '').trim();
      const name = String(it.fullName || '').trim();
      if (!id || !name) {
        return { ok: false, id, reason: 'شناسه شهید (martyrId) یا نام کامل شهید خالی است.' };
      }
      return { ok: true, id };
    }
  );

  const incomingPendingReviews = validateArrayCollection<PendingReviewItem>(
    'pendingReviews',
    rawSource.pendingReviews,
    (it) => {
      const id = String(it.trackingId || '').trim();
      if (!id) return { ok: false, reason: 'شناسه پیگیری (trackingId) در صف بررسی خالی است.' };
      return { ok: true, id };
    }
  );

  const incomingSmartSuggestions = validateArrayCollection<SmartSearchSuggestion>(
    'smartSuggestions',
    rawSource.smartSuggestions,
    (it) => {
      const id = String(it.id || '').trim();
      if (!id) return { ok: false, reason: 'شناسه پیشنهاد هوشمند (id) خالی است.' };
      return { ok: true, id };
    }
  );

  const incomingRejectedArchive = validateArrayCollection<RejectedSuggestionRecord>(
    'rejectedSuggestionsArchive',
    rawSource.rejectedSuggestionsArchive,
    (it) => {
      const id = String(it.id || `${it.martyrName || ''}::${it.bookTitle || ''}`).trim();
      if (!id || id === '::') return { ok: false, reason: 'شناسه مورد ردشده نامعتبر است.' };
      return { ok: true, id };
    }
  );

  const incomingAuditLog = validateArrayCollection<AuditLogEntry>(
    'auditLog',
    rawSource.auditLog,
    (it) => {
      const id = String(it.id || '').trim();
      if (!id) return { ok: false, reason: 'شناسه لاگ (id) خالی است.' };
      return { ok: true, id };
    }
  );

  // استخراج متادیتای خط مبنا برای مقایسه سه‌طرفه بدون وابستگی صرف به ساعت دستگاه‌ها
  const localBaselineMap = loadBaselineChangeMap();
  const incomingBaselineMap =
    rawSource.syncBaselineHashes && typeof rawSource.syncBaselineHashes === 'object'
      ? (rawSource.syncBaselineHashes as Record<string, string>)
      : {};
  const incomingSoftDeletedArchive =
    rawSource.softDeletedArchive && typeof rawSource.softDeletedArchive === 'object'
      ? (rawSource.softDeletedArchive as Record<string, SyncRecordEnvelope>)
      : {};

  const newRecords: RecordChangePreviewItem[] = [];
  const modifiedRecords: RecordChangePreviewItem[] = [];
  const softDeletedRecords: RecordChangePreviewItem[] = [];
  const conflicts: RecordConflictDetail[] = [];
  const collectionComparisons: CollectionComparisonSummary[] = [];

  // تابع مقایسه هر مجموعه با رعایت کامل قواعد ۱ تا ۱۱ بخش چهارم
  const compareCollectionRecords = <T extends Record<string, unknown>>(
    colKey: MergeCollectionKey,
    destItems: T[],
    incItems: T[],
    getId: (item: T) => string,
    getSecondaryKey?: (item: T) => string
  ) => {
    const label = COLLECTION_PERSIAN_LABELS[colKey];
    const destById = new Map<string, T>();
    const destBySecondary = new Map<string, { id: string; item: T }>();

    for (const dItem of destItems) {
      if (!dItem) continue;
      const id = getId(dItem);
      if (id) {
        destById.set(id, dItem);
        if (getSecondaryKey) {
          const sec = getSecondaryKey(dItem);
          if (sec) destBySecondary.set(sec, { id, item: dItem });
        }
      }
    }

    let newCount = 0;
    let existingUnchangedCount = 0;
    let modifiedComplementaryCount = 0;
    let conflictCount = 0;
    const seenIncomingIds = new Set<string>();

    for (const incItem of incItems) {
      if (!incItem) continue;
      const rawId = getId(incItem);
      if (!rawId) continue;

      // جلوگیری از پردازش تکراری در خود فایل ورودی
      if (seenIncomingIds.has(rawId)) {
        existingUnchangedCount++;
        continue;
      }
      seenIncomingIds.add(rawId);

      let matchedId = rawId;
      let destItem = destById.get(rawId);

      if (!destItem && getSecondaryKey) {
        const sec = getSecondaryKey(incItem);
        if (sec && destBySecondary.has(sec)) {
          const found = destBySecondary.get(sec)!;
          matchedId = found.id;
          destItem = found.item;
        }
      }

      const titleSummary = buildRecordSummaryTitle(colKey, incItem);

      // ۱. رکورد جدید (در دستگاه مقصد وجود ندارد)
      if (!destItem) {
        newCount++;
        newRecords.push({
          collection: colKey,
          collectionLabel: label,
          recordId: rawId,
          titleSummary,
          changeKind: 'new',
          incomingRecord: incItem,
        });
        continue;
      }

      // ۲. بررسی یکسان بودن محتوای کانونیکال دو رکورد
      const destCanonical = canonicalizeRecordData(destItem);
      const incCanonical = canonicalizeRecordData(incItem);
      if (destCanonical === incCanonical) {
        existingUnchangedCount++;
        continue;
      }

      // ۳. بررسی خط مبنا (Baseline Hash) برای تشخیص اینکه آیا فقط یک دستگاه رکورد را تغییر داده است
      const compKey = `${colKey}:${matchedId}`;
      const destHash = computeDeterministicHash(`${colKey}:${matchedId}:${destCanonical}`);
      const incHash = computeDeterministicHash(`${colKey}:${matchedId}:${incCanonical}`);
      const sharedBaseline = localBaselineMap[compKey] || incomingBaselineMap[compKey];

      // اگر نسخه ورودی همان خط مبنای قبلی است و دستگاه مقصد تغییر جدیدتری دارد -> حفظ نسخه مقصد بدون تعارض
      if (sharedBaseline && incHash === sharedBaseline && destHash !== sharedBaseline) {
        existingUnchangedCount++;
        continue;
      }

      // اگر نسخه مقصد همان خط مبنای قبلی است و فقط دستگاه فرستنده آن را تغییر داده است -> تغییر غیرمتعارض (تکمیل امن)
      if (sharedBaseline && destHash === sharedBaseline && incHash !== sharedBaseline) {
        const mergedFromBaseline = mergeComplementaryFields(incItem, destItem);
        modifiedComplementaryCount++;
        modifiedRecords.push({
          collection: colKey,
          collectionLabel: label,
          recordId: matchedId,
          titleSummary,
          changeKind: 'modified-complementary',
          incomingRecord: incItem,
          destinationRecord: destItem,
          mergedRecord: mergedFromBaseline,
        });
        continue;
      }

      // ۴. مقایسه فیلد به فیلد (بدون تکیه صرف بر زمان آخرین ویرایش!)
      const diffCheck = extractDifferingFields(destItem, incItem);

      if (!diffCheck.hasRealConflict) {
        if (diffCheck.hasComplementaryAddition) {
          modifiedComplementaryCount++;
          modifiedRecords.push({
            collection: colKey,
            collectionLabel: label,
            recordId: matchedId,
            titleSummary,
            changeKind: 'modified-complementary',
            incomingRecord: incItem,
            destinationRecord: destItem,
            mergedRecord: diffCheck.complementaryMerged,
          });
        } else {
          existingUnchangedCount++;
        }
        continue;
      }

      // ۵. برای تاریخچه عملیات (auditLog) تعارض معنا ندارد و هر دو لاگ حفظ می‌شوند
      if (colKey === 'auditLog') {
        existingUnchangedCount++;
        continue;
      }

      // ۶. تعارض واقعی در دو دستگاه: نمایش کامل تفاوت‌ها به کاربر با پیش‌فرض محافظه‌کارانه «حفظ نسخه مقصد + تکمیل فیلدهای خالی»
      conflictCount++;
      conflicts.push({
        conflictId: `CONF_${colKey}_${matchedId}`,
        collection: colKey,
        collectionLabel: label,
        recordId: matchedId,
        titleSummary,
        destinationRecord: destItem,
        incomingRecord: incItem,
        complementaryMergedRecord: mergeComplementaryFields(destItem, incItem),
        differingFields: diffCheck.differingFields,
        selectedDecision: 'merge-complementary',
      });
    }

    const colInvalidCount = invalidRecords.filter((r) => r.collection === colKey).length;
    collectionComparisons.push({
      key: colKey,
      label,
      destinationCount: destItems.length,
      incomingCount: incItems.length,
      newCount,
      existingUnchangedCount,
      modifiedComplementaryCount,
      conflictCount,
      invalidCount: colInvalidCount,
    });
  };

  // اجرای مقایسه روی تمام ۱۰ مجموعه عملیاتی رکوردها
  compareCollectionRecords(
    'auditRecords',
    Object.values(destinationState.auditRecords || {}) as unknown as Record<string, unknown>[],
    Object.values(incomingAuditRecords) as unknown as Record<string, unknown>[],
    (r) => String(r.key || r.tempBookId || ''),
    (r) => {
      const tId = String(r.tempBookId || '').trim();
      return tId && !tId.startsWith('ROW-') ? `TEMP_ID::${tId}` : '';
    }
  );

  compareCollectionRecords(
    'bookCopies',
    (destinationState.bookCopies || []) as unknown as Record<string, unknown>[],
    incomingBookCopies as unknown as Record<string, unknown>[],
    (c) => String(c.copyId || '')
  );

  compareCollectionRecords(
    'links',
    (destinationState.links || []) as unknown as Record<string, unknown>[],
    incomingLinks as unknown as Record<string, unknown>[],
    (l) => String(l.id || '')
  );

  compareCollectionRecords(
    'multiMartyrGroups',
    (destinationState.multiMartyrGroups || []) as unknown as Record<string, unknown>[],
    incomingMultiMartyrGroups as unknown as Record<string, unknown>[],
    (g) => String(g.groupCode || '')
  );

  compareCollectionRecords(
    'extractedItems',
    (destinationState.extractedItems || []) as unknown as Record<string, unknown>[],
    incomingExtractedItems as unknown as Record<string, unknown>[],
    (e) => String(e.id || '')
  );

  compareCollectionRecords(
    'customMartyrs',
    (destinationState.customMartyrs || []) as unknown as Record<string, unknown>[],
    incomingCustomMartyrs as unknown as Record<string, unknown>[],
    (m) => String(m.martyrId || '')
  );

  compareCollectionRecords(
    'pendingReviews',
    (destinationState.pendingReviews || []) as unknown as Record<string, unknown>[],
    incomingPendingReviews as unknown as Record<string, unknown>[],
    (p) => String(p.trackingId || '')
  );

  compareCollectionRecords(
    'smartSuggestions',
    (destinationState.smartSuggestions || []) as unknown as Record<string, unknown>[],
    incomingSmartSuggestions as unknown as Record<string, unknown>[],
    (s) => String(s.id || '')
  );

  compareCollectionRecords(
    'rejectedSuggestionsArchive',
    (destinationState.rejectedSuggestionsArchive || []) as unknown as Record<string, unknown>[],
    incomingRejectedArchive as unknown as Record<string, unknown>[],
    (r) => String(r.id || `${r.martyrName || ''}::${r.bookTitle || ''}`)
  );

  compareCollectionRecords(
    'auditLog',
    (destinationState.auditLog || []) as unknown as Record<string, unknown>[],
    incomingAuditLog as unknown as Record<string, unknown>[],
    (l) => String(l.id || '')
  );

  // بررسی Tombstone / حذف نرم در فایل ورودی (بدون حذف خودکار!)
  for (const [compKey, env] of Object.entries(incomingSoftDeletedArchive)) {
    if (!env || !env.meta?.softDeleted) continue;
    const col = env.meta.collection as MergeCollectionKey;
    const recId = env.meta.recordId;
    softDeletedRecords.push({
      collection: col,
      collectionLabel: COLLECTION_PERSIAN_LABELS[col] || col,
      recordId: recId || compKey,
      titleSummary: env.titleSummary || `${col}:${recId}`,
      changeKind: 'soft-deleted',
      incomingRecord: env.data,
    });
  }

  // محاسبه شاخص‌های کلیدی مرحله اول و دوم (بخش چهارم)
  const incomingDossiers = buildUnifiedBookDossiers({
    catalogRows,
    auditRecords: incomingAuditRecords,
    bookCopies: incomingBookCopies,
    links: incomingLinks,
    extractedItems: incomingExtractedItems,
  });

  const incomingNewRegistrationsCount = Object.values(incomingAuditRecords).filter(
    (r) => r.source === 'outside-list'
  ).length;

  const multiMartyrRelationsCount =
    incomingLinks.filter(
      (l) => l.isGroupPhrase || (l.sourceSheet || '').includes('چند شهید')
    ).length +
    incomingMultiMartyrGroups.length +
    incomingExtractedItems.length;

  const totalIncomingOperationalRecords = collectionComparisons.reduce(
    (acc, c) => acc + c.incomingCount,
    0
  );
  const totalDestinationOperationalRecords = collectionComparisons.reduce(
    (acc, c) => acc + c.destinationCount,
    0
  );
  const existingUnchangedOrDuplicateCount = collectionComparisons.reduce(
    (acc, c) => acc + c.existingUnchangedCount,
    0
  );

  const normalizedPayload: Partial<FullLibrarySystemDataPayload> = {
    auditRecords: incomingAuditRecords,
    bookCopies: incomingBookCopies,
    customMartyrs: incomingCustomMartyrs,
    links: incomingLinks,
    multiMartyrGroups: incomingMultiMartyrGroups,
    extractedItems: incomingExtractedItems,
    pendingReviews: incomingPendingReviews,
    smartSuggestions: incomingSmartSuggestions,
    rejectedSuggestionsArchive: incomingRejectedArchive,
    auditLog: incomingAuditLog,
    userSettings:
      rawSource.userSettings && typeof rawSource.userSettings === 'object'
        ? (rawSource.userSettings as FullOperationalState['userSettings'])
        : destinationState.userSettings,
    idSequences:
      rawSource.idSequences && typeof rawSource.idSequences === 'object'
        ? (rawSource.idSequences as IdSequenceSnapshot)
        : readLocalIdSequences(),
    syncRecordMeta:
      rawSource.syncRecordMeta && typeof rawSource.syncRecordMeta === 'object'
        ? (rawSource.syncRecordMeta as Record<string, RecordSyncMeta>)
        : {},
    syncBaselineHashes: incomingBaselineMap,
    softDeletedArchive: incomingSoftDeletedArchive,
  };

  return {
    valid: true,
    warnings,
    fileName,
    fileSizeBytes,
    detectedFormat,
    detectedSchemaVersion,
    appVersion: typeof parsed.appVersion === 'string' ? parsed.appVersion : '3.x',
    exportId: typeof parsed.exportId === 'string' ? parsed.exportId : 'BACKUP_V3',
    sourceDeviceId: typeof parsed.deviceId === 'string' ? parsed.deviceId : 'دستگاه مبدأ',
    sourceDeviceRole:
      parsed.deviceRole === 'phone-primary'
        ? 'گوشی اندرویدی (مرجع اصلی)'
        : parsed.deviceRole === 'pc-companion'
        ? 'رایانه کمکی'
        : 'نامشخص',
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : 'نامشخص',
    exportedAtJalali:
      typeof parsed.exportedAtJalali === 'string'
        ? parsed.exportedAtJalali
        : typeof parsed.exportedAt === 'string' && !Number.isNaN(Date.parse(parsed.exportedAt))
        ? formatJalaliDateTimeForDisplay(new Date(parsed.exportedAt))
        : 'نامشخص',
    integrityValid,
    expectedHash,
    computedHash,
    summaryMetrics: {
      booksCount: Math.max(
        Object.keys(incomingAuditRecords).length,
        incomingDossiers.length
      ),
      bookMartyrLinksCount: incomingLinks.length,
      multiMartyrRelationsCount,
      newRegistrationsCount: incomingNewRegistrationsCount,
      identifiedChangesCount: newRecords.length + modifiedRecords.length,
      existingUnchangedOrDuplicateCount,
      potentialConflictsCount: conflicts.length,
      invalidOrUntransferableCount: invalidRecords.length,
      totalIncomingOperationalRecords,
      totalDestinationOperationalRecords,
    },
    collectionComparisons,
    newRecords,
    modifiedRecords,
    softDeletedRecords,
    conflicts,
    invalidRecords,
    normalizedPayload,
  };
}

/**
 * تهیه و اعتبارسنجی Recovery Point از اطلاعات فعلی دستگاه مقصد پیش از اجرای ادغام (بند ۱۲ مرحله سوم)
 */
export async function createPreMergeRecoveryPoint(
  currentState: FullOperationalState
): Promise<{ ok: boolean; recoveryPoint?: PreMergeRecoveryPoint; error?: string }> {
  try {
    const now = new Date();
    const stateClone: FullOperationalState = JSON.parse(JSON.stringify(currentState));
    const counts = calculateCollectionCounts(stateClone);
    const checksum = computeDatasetsChecksum(stateClone);
    const syncMeta = await hydrateSyncMetadataFromStorage();

    const recoveryPoint: PreMergeRecoveryPoint = {
      recoveryId: `RP_PRE_MERGE_${now.getTime()}`,
      createdAtIso: now.toISOString(),
      createdAtJalali: formatJalaliDateTimeForDisplay(now),
      timestampMs: now.getTime(),
      checksum,
      recordCounts: counts,
      stateSnapshot: stateClone,
      syncMetaSnapshot: {
        recordMetaMap: syncMeta.recordMetaMap,
        baselineChangeMap: syncMeta.baselineChangeMap,
        appliedPackageIds: syncMeta.appliedPackageIds,
        softDeletedArchive: loadSoftDeletedArchive(),
        idSequences: readLocalIdSequences(),
      },
    };

    const serialized = JSON.stringify(recoveryPoint);
    if (!serialized || serialized.length < 20) {
      return { ok: false, error: 'ایجاد تصویر پشتیبان پیش از ادغام ناموفق بود.' };
    }

    let localOk = false;
    try {
      localStorage.setItem(PRE_MERGE_RECOVERY_STORAGE_KEY, serialized);
      localOk = true;
    } catch {
      // ممکن است localStorage پر باشد؛ در IndexedDB ذخیره می‌شود
    }

    const idbRes = await idbSetItemWithStatus(
      PRE_MERGE_RECOVERY_STORAGE_KEY,
      recoveryPoint,
      now.getTime()
    );

    if (!idbRes.ok && !localOk) {
      return {
        ok: false,
        error: 'ذخیره Recovery Point پیش از ادغام در IndexedDB و localStorage با خطا مواجه شد.',
      };
    }

    return { ok: true, recoveryPoint };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function getLatestPreMergeRecoveryPoint(): Promise<PreMergeRecoveryPoint | null> {
  try {
    const idbEnv = await idbGetEnvelope<PreMergeRecoveryPoint>(PRE_MERGE_RECOVERY_STORAGE_KEY);
    if (idbEnv.data && idbEnv.data.recoveryId) {
      return idbEnv.data;
    }
  } catch {
    // ignore
  }
  try {
    const raw = localStorage.getItem(PRE_MERGE_RECOVERY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PreMergeRecoveryPoint;
      if (parsed && parsed.recoveryId) return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * بازگردانی کامل اطلاعات مقصد از Recovery Point در صورت بروز خطا یا درخواست کاربر
 */
export async function restoreFromPreMergeRecoveryPoint(
  recoveryPoint: PreMergeRecoveryPoint
): Promise<{ ok: boolean; restoredState: FullOperationalState; error?: string }> {
  const s = recoveryPoint.stateSnapshot;
  const entries: BatchStorageSaveEntry[] = [
    { key: OPERATIONAL_STORAGE_KEYS.auditRecords, value: s.auditRecords },
    { key: OPERATIONAL_STORAGE_KEYS.bookCopies, value: s.bookCopies },
    { key: OPERATIONAL_STORAGE_KEYS.customMartyrs, value: s.customMartyrs },
    { key: OPERATIONAL_STORAGE_KEYS.smartSuggestions, value: s.smartSuggestions },
    { key: OPERATIONAL_STORAGE_KEYS.links, value: s.links },
    { key: OPERATIONAL_STORAGE_KEYS.pendingReviews, value: s.pendingReviews },
    { key: OPERATIONAL_STORAGE_KEYS.multiMartyrGroups, value: s.multiMartyrGroups },
    { key: OPERATIONAL_STORAGE_KEYS.extractedItems, value: s.extractedItems },
    { key: OPERATIONAL_STORAGE_KEYS.auditLog, value: s.auditLog },
    { key: OPERATIONAL_STORAGE_KEYS.rejectedSuggestions, value: s.rejectedSuggestionsArchive },
    { key: RECORD_META_MAP_KEY, value: recoveryPoint.syncMetaSnapshot.recordMetaMap },
    { key: BASELINE_CHANGE_MAP_KEY, value: recoveryPoint.syncMetaSnapshot.baselineChangeMap },
    { key: APPLIED_PACKAGES_KEY, value: recoveryPoint.syncMetaSnapshot.appliedPackageIds },
  ];

  const batchRes = await saveOperationalDataBatchAtomic(entries);
  if (!batchRes.ok) {
    return {
      ok: false,
      restoredState: s,
      error: batchRes.error || 'خطا در بازگردانی تراکنشی از Recovery Point',
    };
  }

  try {
    saveSoftDeletedArchive(recoveryPoint.syncMetaSnapshot.softDeletedArchive || {});
    localStorage.setItem(
      ID_SEQUENCE_STORAGE_KEY,
      JSON.stringify(recoveryPoint.syncMetaSnapshot.idSequences)
    );
    if (s.userSettings?.activeRole) {
      localStorage.setItem(OPERATIONAL_STORAGE_KEYS.userRole, s.userSettings.activeRole);
    }
  } catch {
    // ignore
  }

  applyCommittedSyncMetadataToCache(
    {
      recordMetaMap: recoveryPoint.syncMetaSnapshot.recordMetaMap,
      baselineChangeMap: recoveryPoint.syncMetaSnapshot.baselineChangeMap,
      appliedPackageIds: recoveryPoint.syncMetaSnapshot.appliedPackageIds,
    },
    batchRes.updatedAt
  );

  return { ok: true, restoredState: s };
}

/**
 * مرحله سوم (بخش چهارم): اجرای ادغام امن، محافظه‌کارانه و تراکنشی
 * - هرگز اطلاعات دستگاه مقصد را پاک یا جایگزین کل نمی‌کند
 * - پیش از اجرا Recovery Point تهیه و بررسی می‌کند
 * - تصمیم کاربر برای تک‌تک تعارض‌ها را اعمال می‌کند
 * - در یک تراکنش اتمیک IndexedDB ذخیره می‌کند و در صورت بروز هرگونه خطا به Recovery Point بازمی‌گرداند
 */
export async function executeSafeJsonMerge(
  inspection: SystemJsonInspectionReport,
  currentState: FullOperationalState,
  conflictDecisions: Record<string, ConflictDecisionOption>
): Promise<SafeMergeExecutionResult> {
  if (!inspection.valid || !inspection.normalizedPayload) {
    return {
      ok: false,
      error: inspection.errorReason || 'فایل ورودی معتبر نیست و امکان ادغام وجود ندارد.',
      recoveryPointId: '',
      appliedNewCount: 0,
      appliedModifiedCount: 0,
      resolvedConflictsCount: 0,
      keptDestinationConflictsCount: 0,
      acceptedIncomingConflictsCount: 0,
      unchangedCount: 0,
      skippedInvalidCount: inspection.invalidRecords.length,
      mergedState: currentState,
      summaryMessage: 'عملیات ادغام متوقف شد.',
    };
  }

  // ۱. تهیه و اعتبارسنجی Recovery Point پیش از هرگونه تغییر
  const rpRes = await createPreMergeRecoveryPoint(currentState);
  if (!rpRes.ok || !rpRes.recoveryPoint) {
    return {
      ok: false,
      error:
        rpRes.error ||
        'به دلیل عدم موفقیت در تهیه نقطه بازیابی (Recovery Point)، عملیات ادغام برای حفاظت از داده‌های فعلی متوقف شد.',
      recoveryPointId: '',
      appliedNewCount: 0,
      appliedModifiedCount: 0,
      resolvedConflictsCount: 0,
      keptDestinationConflictsCount: 0,
      acceptedIncomingConflictsCount: 0,
      unchangedCount: 0,
      skippedInvalidCount: inspection.invalidRecords.length,
      mergedState: currentState,
      summaryMessage: 'ادغام انجام نشد (اطلاعات فعلی بدون تغییر محفوظ است).',
    };
  }

  const recoveryPoint = rpRes.recoveryPoint;

  try {
    // ۲. ساخت نقشه‌های کاری از روی اطلاعات فعلی دستگاه مقصد (هیچ رکوردی از مقصد حذف نمی‌شود!)
    const nextAuditRecords: Record<string, FieldAuditRecord> = JSON.parse(
      JSON.stringify(currentState.auditRecords || {})
    );

    const buildMap = <T>(arr: T[], getId: (item: T) => string): Map<string, T> => {
      const m = new Map<string, T>();
      for (const item of arr || []) {
        if (!item) continue;
        const id = getId(item);
        if (id) m.set(id, JSON.parse(JSON.stringify(item)));
      }
      return m;
    };

    const nextCopiesMap = buildMap(currentState.bookCopies || [], (c) => c.copyId);
    const nextLinksMap = buildMap(currentState.links || [], (l) => l.id);
    const nextGroupsMap = buildMap(
      currentState.multiMartyrGroups || [],
      (g) => g.groupCode
    );
    const nextExtractedMap = buildMap(currentState.extractedItems || [], (e) => e.id);
    const nextMartyrsMap = buildMap(currentState.customMartyrs || [], (m) => m.martyrId);
    const nextPendingMap = buildMap(currentState.pendingReviews || [], (p) => p.trackingId);
    const nextSmartMap = buildMap(currentState.smartSuggestions || [], (s) => s.id);
    const nextRejectedMap = buildMap(
      currentState.rejectedSuggestionsArchive || [],
      (r) => r.id || `${r.martyrName}::${r.bookTitle}`
    );
    const nextLogMap = buildMap(currentState.auditLog || [], (l) => l.id);

    const nextBaselineMap: Record<string, string> = {
      ...loadBaselineChangeMap(),
      ...(inspection.normalizedPayload.syncBaselineHashes || {}),
    };

    const putIntoTargetCollection = (
      col: MergeCollectionKey,
      recordId: string,
      recordData: unknown
    ) => {
      const cloned = JSON.parse(JSON.stringify(recordData));
      const canonical = canonicalizeRecordData(cloned);
      nextBaselineMap[`${col}:${recordId}`] = computeDeterministicHash(
        `${col}:${recordId}:${canonical}`
      );

      switch (col) {
        case 'auditRecords':
          nextAuditRecords[recordId] = { ...(cloned as FieldAuditRecord), key: recordId };
          break;
        case 'bookCopies':
          nextCopiesMap.set(recordId, { ...(cloned as BookCopyRecord), copyId: recordId });
          break;
        case 'links':
          nextLinksMap.set(recordId, { ...(cloned as BookMartyrLinkRecord), id: recordId });
          break;
        case 'multiMartyrGroups':
          nextGroupsMap.set(recordId, {
            ...(cloned as MultiMartyrGroupAudit),
            groupCode: recordId,
          });
          break;
        case 'extractedItems':
          nextExtractedMap.set(recordId, {
            ...(cloned as ExtractedContentItem),
            id: recordId,
          });
          break;
        case 'customMartyrs':
          nextMartyrsMap.set(recordId, {
            ...(cloned as CustomMartyrRecord),
            martyrId: recordId,
          });
          break;
        case 'pendingReviews':
          nextPendingMap.set(recordId, {
            ...(cloned as PendingReviewItem),
            trackingId: recordId,
          });
          break;
        case 'smartSuggestions':
          nextSmartMap.set(recordId, {
            ...(cloned as SmartSearchSuggestion),
            id: recordId,
          });
          break;
        case 'rejectedSuggestionsArchive':
          nextRejectedMap.set(recordId, cloned as RejectedSuggestionRecord);
          break;
        case 'auditLog':
          nextLogMap.set(recordId, { ...(cloned as AuditLogEntry), id: recordId });
          break;
      }
    };

    // ۳. افزودن تمام رکوردهای جدید با حفظ دقیق شناسه اصلی
    let appliedNewCount = 0;
    for (const item of inspection.newRecords) {
      putIntoTargetCollection(item.collection, item.recordId, item.incomingRecord);
      appliedNewCount++;
    }

    // ۴. اعمال رکوردهای تکمیل‌شده غیرمتعارض (فیلدهای خالی تکمیل‌شده یا تغییر از خط مبنای مشترک)
    let appliedModifiedCount = 0;
    for (const item of inspection.modifiedRecords) {
      const toSave = item.mergedRecord ?? item.incomingRecord;
      putIntoTargetCollection(item.collection, item.recordId, toSave);
      appliedModifiedCount++;
    }

    // ۵. اعمال تصمیم صریح کاربر روی تک‌تک رکوردهای دارای تعارض
    let resolvedConflictsCount = 0;
    let keptDestinationConflictsCount = 0;
    let acceptedIncomingConflictsCount = 0;

    for (const conf of inspection.conflicts) {
      const decision: ConflictDecisionOption =
        conflictDecisions[conf.conflictId] || conf.selectedDecision || 'merge-complementary';

      if (decision === 'keep-destination') {
        putIntoTargetCollection(conf.collection, conf.recordId, conf.destinationRecord);
        keptDestinationConflictsCount++;
      } else if (decision === 'accept-incoming') {
        // پذیرش نسخه ورودی همراه با حفظ فیلدهایی که در نسخه ورودی خالی بوده ولی در مقصد پر هستند
        const incomingWithFallback = mergeComplementaryFields(
          conf.incomingRecord,
          conf.destinationRecord
        );
        putIntoTargetCollection(conf.collection, conf.recordId, incomingWithFallback);
        acceptedIncomingConflictsCount++;
      } else {
        // merge-complementary: حفظ اولویت مقادیر دستگاه مقصد + تکمیل فیلدهای خالی از نسخه ورودی
        putIntoTargetCollection(conf.collection, conf.recordId, conf.complementaryMergedRecord);
        keptDestinationConflictsCount++;
      }
      resolvedConflictsCount++;
    }

    // ۶. غنی‌سازی و حفظ یکپارچگی ارتباط‌های کتاب و شهید و موارد چندشهیدی
    const mergedLinks = enrichLinksWithSorehMehrResearch(Array.from(nextLinksMap.values()));
    const mergedExtracted = buildSorehMehrExtractedItems(
      mergedLinks,
      Array.from(nextExtractedMap.values())
    );

    const mergedState: FullOperationalState = {
      auditRecords: nextAuditRecords,
      bookCopies: Array.from(nextCopiesMap.values()),
      customMartyrs: Array.from(nextMartyrsMap.values()),
      smartSuggestions: Array.from(nextSmartMap.values()),
      links: mergedLinks,
      pendingReviews: Array.from(nextPendingMap.values()),
      multiMartyrGroups: Array.from(nextGroupsMap.values()),
      extractedItems: mergedExtracted,
      auditLog: Array.from(nextLogMap.values()),
      userSettings: currentState.userSettings ||
        inspection.normalizedPayload.userSettings || { activeRole: 'registrar' },
      rejectedSuggestionsArchive: Array.from(nextRejectedMap.values()),
    };

    const mergedRecordMeta: Record<string, RecordSyncMeta> = {
      ...loadRecordMetaMap(),
      ...(inspection.normalizedPayload.syncRecordMeta || {}),
    };
    const appliedPackages = loadAppliedPackageIds();
    const nextAppliedPackages =
      inspection.exportId && !appliedPackages.includes(inspection.exportId)
        ? [inspection.exportId, ...appliedPackages].slice(0, 200)
        : appliedPackages;

    // ۷. ذخیره اتمیک تمام مجموعه‌ها در یک تراکنش واحد IndexedDB + localStorage
    const atomicEntries: BatchStorageSaveEntry[] = [
      { key: OPERATIONAL_STORAGE_KEYS.auditRecords, value: mergedState.auditRecords },
      { key: OPERATIONAL_STORAGE_KEYS.bookCopies, value: mergedState.bookCopies },
      { key: OPERATIONAL_STORAGE_KEYS.customMartyrs, value: mergedState.customMartyrs },
      { key: OPERATIONAL_STORAGE_KEYS.smartSuggestions, value: mergedState.smartSuggestions },
      { key: OPERATIONAL_STORAGE_KEYS.links, value: mergedState.links },
      { key: OPERATIONAL_STORAGE_KEYS.pendingReviews, value: mergedState.pendingReviews },
      { key: OPERATIONAL_STORAGE_KEYS.multiMartyrGroups, value: mergedState.multiMartyrGroups },
      { key: OPERATIONAL_STORAGE_KEYS.extractedItems, value: mergedState.extractedItems },
      { key: OPERATIONAL_STORAGE_KEYS.auditLog, value: mergedState.auditLog },
      {
        key: OPERATIONAL_STORAGE_KEYS.rejectedSuggestions,
        value: mergedState.rejectedSuggestionsArchive,
      },
      { key: RECORD_META_MAP_KEY, value: mergedRecordMeta },
      { key: BASELINE_CHANGE_MAP_KEY, value: nextBaselineMap },
      { key: APPLIED_PACKAGES_KEY, value: nextAppliedPackages },
    ];

    const batchRes = await saveOperationalDataBatchAtomic(atomicEntries);
    if (!batchRes.ok) {
      throw new Error(
        batchRes.error || 'تراکنش اتمیک ذخیره‌سازی در هنگام ادغام با خطا مواجه شد.'
      );
    }

    // ۸. به‌روزرسانی شمارنده‌های شناسه یکتا (حداکثر شمارنده بین دو دستگاه تا هرگز شناسه تکراری صادر نشود)
    const curSeq = readLocalIdSequences();
    const incSeq = inspection.normalizedPayload.idSequences || curSeq;
    const mergedSeq: IdSequenceSnapshot = {
      LOG: Math.max(curSeq.LOG, incSeq.LOG || 1000),
      RL: Math.max(curSeq.RL, incSeq.RL || 1000),
      SS: Math.max(curSeq.SS, incSeq.SS || 1000),
      MR: Math.max(curSeq.MR, incSeq.MR || 1000),
      EX: Math.max(curSeq.EX, incSeq.EX || 1000),
      CP: Math.max(curSeq.CP, incSeq.CP || 1000),
      TMP_OUT: Math.max(curSeq.TMP_OUT, incSeq.TMP_OUT || 1),
    };
    try {
      localStorage.setItem(ID_SEQUENCE_STORAGE_KEY, JSON.stringify(mergedSeq));
    } catch {
      // ignore
    }

    applyCommittedSyncMetadataToCache(
      {
        recordMetaMap: mergedRecordMeta,
        baselineChangeMap: nextBaselineMap,
        appliedPackageIds: nextAppliedPackages,
      },
      batchRes.updatedAt
    );

    const summaryMessage = `ادغام امن فایل JSON با موفقیت انجام شد: ${appliedNewCount.toLocaleString(
      'fa-IR'
    )} رکورد جدید اضافه شد، ${appliedModifiedCount.toLocaleString(
      'fa-IR'
    )} رکورد تکمیل شد و ${resolvedConflictsCount.toLocaleString(
      'fa-IR'
    )} تعارض مطابق انتخاب شما مدیریت گردید (کد پشتیبان پیش از ادغام: ${recoveryPoint.recoveryId}).`;

    return {
      ok: true,
      recoveryPointId: recoveryPoint.recoveryId,
      appliedNewCount,
      appliedModifiedCount,
      resolvedConflictsCount,
      keptDestinationConflictsCount,
      acceptedIncomingConflictsCount,
      unchangedCount: inspection.summaryMetrics.existingUnchangedOrDuplicateCount,
      skippedInvalidCount: inspection.invalidRecords.length,
      mergedState,
      summaryMessage,
    };
  } catch (err) {
    // بازگردانی خودکار (Automatic Transactional Rollback) از Recovery Point در صورت هرگونه خطا
    await restoreFromPreMergeRecoveryPoint(recoveryPoint);
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      recoveryPointId: recoveryPoint.recoveryId,
      appliedNewCount: 0,
      appliedModifiedCount: 0,
      resolvedConflictsCount: 0,
      keptDestinationConflictsCount: 0,
      acceptedIncomingConflictsCount: 0,
      unchangedCount: 0,
      skippedInvalidCount: inspection.invalidRecords.length,
      mergedState: recoveryPoint.stateSnapshot,
      summaryMessage:
        'خطا در حین ادغام؛ تمام اطلاعات دستگاه به صورت خودکار و کامل از روی Recovery Point به وضعیت اولیه بازگردانده شدند.',
    };
  }
}
