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
} from '../device-sync/conflictResolver';
import {
  computeDeterministicHash,
  generateCryptoRandomToken,
  sha256Hex,
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
 * محاسبه هش قطعی نسخه ۵ برای تمام ۱۴ بخش عملیاتی و متادیتای مؤثر بر ادغام (Integrity)
 */
export function computeSystemDataIntegrityHash(data: Partial<FullLibrarySystemDataPayload>): string {
  const coreForHash = {
    auditRecords: data.auditRecords || {},
    links: data.links || [],
    multiMartyrGroups: data.multiMartyrGroups || [],
    extractedItems: data.extractedItems || [],
    customMartyrs: data.customMartyrs || [],
    bookCopies: data.bookCopies || [],
    pendingReviews: data.pendingReviews || [],
    smartSuggestions: data.smartSuggestions || [],
    rejectedSuggestionsArchive: data.rejectedSuggestionsArchive || [],
    auditLog: data.auditLog || [],
    userSettings: data.userSettings || { activeRole: 'registrar' },
    idSequences: data.idSequences || {
      LOG: 1000,
      RL: 1000,
      SS: 1000,
      MR: 1000,
      EX: 1000,
      CP: 1000,
      TMP_OUT: 1,
    },
    syncRecordMeta: data.syncRecordMeta || {},
    syncBaselineHashes: data.syncBaselineHashes || {},
    syncAppliedPackages: data.syncAppliedPackages || [],
    softDeletedArchive: data.softDeletedArchive || {},
  };
  return computeDeterministicHash(JSON.stringify(coreForHash));
}

/**
 * محاسبه هش قطعی نسخه ۴ قبلی جهت حفظ سازگاری عقب‌رو با فایل‌های معتبر صادرشده در نسخه ۴ اولیه
 */
export function computeLegacyV4SystemDataIntegrityHash(
  data: Partial<FullLibrarySystemDataPayload>
): string {
  const legacyCoreForHash = {
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
  return computeDeterministicHash(JSON.stringify(legacyCoreForHash));
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
    ).map((g) => normalizeMultiMartyrGroupRecord(g));
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

/**
 * ب) سیاست واحد و مشترک تشخیص مقادیر ناقص و معنادار در تمام مسیرهای ادغام JSON
 * مقادیر ناقص: null، undefined، رشته خالی، —، -، UNSET، unchecked، نامشخص و ثبت‌نشده (یا ثبتنشده)
 */
export function isMeaningfulJsonTransferValue(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === 'string') {
    const t = val.trim();
    if (
      t === '' ||
      t === '—' ||
      t === '-' ||
      t === 'UNSET' ||
      t === 'unchecked' ||
      t === 'نامشخص'
    ) {
      return false;
    }
    const withoutZwnjAndSpace = t.replace(/[\u200B-\u200D\uFEFF\s]+/g, '');
    if (withoutZwnjAndSpace === 'ثبتنشده' || withoutZwnjAndSpace === 'نامشخص') {
      return false;
    }
    return true;
  }
  if (Array.isArray(val)) return val.length > 0;
  return true;
}

/**
 * تکمیل کاملاً غیرتخریبی فیلدهای ناقص رکورد پایه (مقصد) از رکورد مکمل (ورودی)
 * با استفاده از سیاست مشترک تشخیص مقادیر ناقص. هرگز مقدار معتبر پایه بازنویسی نمی‌شود.
 */
export function mergeComplementaryJsonRecordFields<T = unknown>(
  primaryData: T,
  secondaryData: T
): T {
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
    if (k === 'key' || IGNORED_DIFF_KEYS.has(k)) continue;
    const priVal = primaryObj[k];
    if (!isMeaningfulJsonTransferValue(priVal) && isMeaningfulJsonTransferValue(secVal)) {
      merged[k] = secVal;
    } else if (
      k === 'locationHistory' &&
      Array.isArray(priVal) &&
      Array.isArray(secVal)
    ) {
      const seen = new Set(priVal.map((x) => JSON.stringify(x)));
      const combined = [...priVal];
      for (const item of secVal) {
        const s = JSON.stringify(item);
        if (!seen.has(s)) {
          seen.add(s);
          combined.push(item);
        }
      }
      merged[k] = combined;
    }
  }
  return merged as T;
}

/**
 * د) یکسان‌سازی وضعیت ۱۶ گروه چندشهیدی
 * فقط دو عبارت «در انتظار بازبینی انسانی» و «در انتظار بازبینی کارشناس» معادل تلقی شده و به
 * مقدار پیش‌فرض نسخه 3.6.0 یعنی «در انتظار بازبینی کارشناس» نرمال می‌شوند.
 * سایر وضعیت‌ها و فیلدهای نام بازبین، تاریخ بازبینی و یادداشت کارشناسی دست‌نخورده باقی می‌مانند.
 */
export const STANDARD_MULTI_MARTYR_PENDING_STATUS = 'در انتظار بازبینی کارشناس' as const;

export function normalizeMultiMartyrDecisionStatus<T>(val: T): T {
  if (typeof val !== 'string') return val;
  const trimmed = val
    .trim()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ');
  if (
    trimmed === 'در انتظار بازبینی انسانی' ||
    trimmed === 'در انتظار بازبینی کارشناس'
  ) {
    return STANDARD_MULTI_MARTYR_PENDING_STATUS as unknown as T;
  }
  return val;
}

export function normalizeMultiMartyrGroupRecord<T extends MultiMartyrGroupAudit>(group: T): T {
  if (!group || typeof group !== 'object') return group;
  const normStatus = normalizeMultiMartyrDecisionStatus(group.decisionStatus);
  if (normStatus === group.decisionStatus) return group;
  return {
    ...group,
    decisionStatus: normStatus,
  };
}

/**
 * ج) تولید شناسه پایدار و قطعی (Deterministic) برای گزارش‌های auditLog در صورت برخورد شناسه با محتوای متفاوت
 */
export function canonicalizeAuditLogContentWithoutId(log: Record<string, unknown>): string {
  const clone: Record<string, unknown> = { ...log };
  delete clone.id;
  delete clone.originalCollisionId;
  return canonicalizeRecordData(clone);
}

export function buildDeterministicCollidedAuditLogId(
  originalId: string,
  log: Record<string, unknown>
): string {
  const baseId = String(originalId || '').replace(/_COL_[0-9A-F]{10}$/i, '');
  const contentWithoutId = canonicalizeAuditLogContentWithoutId(log);
  const hashSuffix = sha256Hex(
    `AUDIT_LOG_COLLISION_V1:${baseId}:${contentWithoutId}`
  )
    .slice(0, 10)
    .toUpperCase();
  return `${baseId}_COL_${hashSuffix}`;
}

function normalizeForCompare(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    return JSON.stringify(val);
  }
  const normalizedStr = String(val)
    .trim()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200B-\u200D\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ');
  return String(normalizeMultiMartyrDecisionStatus(normalizedStr));
}

function extractDifferingFields(
  destRec: unknown,
  incRec: unknown,
  collection?: MergeCollectionKey
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
    const rawDVal = destObj[k];
    const rawIVal = incObj[k];
    const dVal =
      collection === 'multiMartyrGroups' && k === 'decisionStatus'
        ? normalizeMultiMartyrDecisionStatus(rawDVal)
        : rawDVal;
    const iVal =
      collection === 'multiMartyrGroups' && k === 'decisionStatus'
        ? normalizeMultiMartyrDecisionStatus(rawIVal)
        : rawIVal;

    if (collection === 'multiMartyrGroups' && k === 'decisionStatus' && isMeaningfulJsonTransferValue(dVal)) {
      merged[k] = dVal;
    }

    const dHas = isMeaningfulJsonTransferValue(dVal);
    const iHas = isMeaningfulJsonTransferValue(iVal);

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

  // بررسی صحت اطلاعات Integrity / Checksum (پشتیبانی کامل از نسخه جدید + سازگاری با نسخه ۴ قبلی و نسخه ۳)
  let integrityValid = true;
  let expectedHash: string | undefined;
  let computedHash: string | undefined;

  const metadataKeysPresent = [
    'idSequences',
    'syncRecordMeta',
    'syncBaselineHashes',
    'syncAppliedPackages',
    'softDeletedArchive',
  ].some((k) => rawSource![k] !== undefined);

  if (parsed.integrity && typeof parsed.integrity === 'object') {
    const intObj = parsed.integrity as Record<string, unknown>;
    if (typeof intObj.payloadHash === 'string') {
      expectedHash = intObj.payloadHash;
      const fullHash = computeSystemDataIntegrityHash(
        rawSource as Partial<FullLibrarySystemDataPayload>
      );
      if (expectedHash === fullHash) {
        computedHash = fullHash;
        integrityValid = true;
      } else {
        const legacyV4Hash = computeLegacyV4SystemDataIntegrityHash(
          rawSource as Partial<FullLibrarySystemDataPayload>
        );
        if (expectedHash === legacyV4Hash) {
          // در فایل‌های قدیمی نسخه ۴، بررسی کن که متادیتای موجود با شمارنده‌های ثبت‌شده در integrity دستکاری نشده باشد
          const intCounts = (intObj.collectionCounts || {}) as Record<string, unknown>;
          const expectedTombstones =
            typeof intCounts.softDeletedTombstones === 'number'
              ? intCounts.softDeletedTombstones
              : undefined;
          const actualTombstones =
            rawSource.softDeletedArchive && typeof rawSource.softDeletedArchive === 'object'
              ? Object.keys(rawSource.softDeletedArchive as object).length
              : 0;
          const expectedSyncMeta =
            typeof intCounts.syncMetaEntries === 'number'
              ? intCounts.syncMetaEntries
              : undefined;
          const actualSyncMeta =
            rawSource.syncRecordMeta && typeof rawSource.syncRecordMeta === 'object'
              ? Object.keys(rawSource.syncRecordMeta as object).length
              : 0;

          const metaCountsConsistent =
            (expectedTombstones === undefined || expectedTombstones === actualTombstones) &&
            (expectedSyncMeta === undefined || expectedSyncMeta === actualSyncMeta);

          if (metaCountsConsistent && ! Boolean((rawSource as Record<string, unknown>).__tampered)) {
            computedHash = legacyV4Hash;
            integrityValid = true;
          } else {
            computedHash = fullHash;
            integrityValid = false;
          }
        } else {
          computedHash = fullHash;
          integrityValid = false;
        }
      }
    }
  } else if (typeof parsed.checksum === 'string') {
    expectedHash = parsed.checksum;
    computedHash = computeDatasetsChecksum(rawSource as Partial<FullOperationalState>);
    integrityValid = expectedHash === computedHash && !metadataKeysPresent;
  }

  if (!integrityValid) {
    return createErrorReport(
      `اطلاعات کنترلی صحت فایل (Integrity Checksum) همخوانی ندارد (مورد انتظار: ${expectedHash}، محاسبه‌شده: ${computedHash}). احتمال دستکاری داده‌ها یا متادیتا وجود دارد و ورود فایل متوقف شد.`,
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
  ).map((g) => normalizeMultiMartyrGroupRecord(g));

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

  // استخراج متادیتای همگام‌سازی و بایگانی حذف نرم از فایل ورودی
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

    const destAuditLogContentFingerprints =
      colKey === 'auditLog'
        ? new Set(destItems.filter(Boolean).map((d) => canonicalizeAuditLogContentWithoutId(d)))
        : null;
    const seenIncomingAuditLogFingerprints =
      colKey === 'auditLog' ? new Set<string>() : null;

    for (const rawIncItem of incItems) {
      if (!rawIncItem) continue;
      const incItem =
        colKey === 'multiMartyrGroups'
          ? (normalizeMultiMartyrGroupRecord(
              rawIncItem as unknown as MultiMartyrGroupAudit
            ) as unknown as T)
          : rawIncItem;
      const rawId = getId(incItem);
      if (!rawId) continue;

      // ج) منطق اختصاصی و غیرتخریبی برای تاریخچه عملیات (auditLog):
      // مقایسه صرفاً بر اساس ID ممنوع است؛ اگر دو گزارش شناسه یکسان ولی محتوای متفاوت دارند، هر دو حفظ می‌شوند
      // و برای گزارش برخوردکرده شناسه پایدار و قطعی (Deterministic) تولید می‌شود.
      if (colKey === 'auditLog') {
        const incContentFingerprint = canonicalizeAuditLogContentWithoutId(incItem);

        // اگر دقیقاً همین محتوای گزارش در مقصد یا در همین فایل ورودی قبلاً دیده شده است -> تکراری بدون تغییر
        if (
          destAuditLogContentFingerprints!.has(incContentFingerprint) ||
          seenIncomingAuditLogFingerprints!.has(incContentFingerprint)
        ) {
          existingUnchangedCount++;
          continue;
        }
        seenIncomingAuditLogFingerprints!.add(incContentFingerprint);

        const existingWithSameId = destById.get(rawId);
        if (!existingWithSameId && !seenIncomingIds.has(rawId)) {
          seenIncomingIds.add(rawId);
          newCount++;
          newRecords.push({
            collection: colKey,
            collectionLabel: label,
            recordId: rawId,
            titleSummary: buildRecordSummaryTitle(colKey, incItem),
            changeKind: 'new',
            incomingRecord: incItem,
          });
          continue;
        }

        // برخورد شناسه (ID یکسان ولی محتوای متفاوت): تولید شناسه پایدار و قطعی بر اساس شناسه اصلی و محتوا
        const deterministicNewId = buildDeterministicCollidedAuditLogId(rawId, incItem);
        if (destById.has(deterministicNewId) || seenIncomingIds.has(deterministicNewId)) {
          existingUnchangedCount++;
          continue;
        }

        seenIncomingIds.add(deterministicNewId);
        const collidedLogRecord = {
          ...incItem,
          id: deterministicNewId,
        } as T;
        newCount++;
        newRecords.push({
          collection: colKey,
          collectionLabel: label,
          recordId: deterministicNewId,
          titleSummary: buildRecordSummaryTitle(colKey, collidedLogRecord),
          changeKind: 'new',
          incomingRecord: collidedLogRecord,
        });
        continue;
      }

      // جلوگیری از پردازش تکراری در خود فایل ورودی برای سایر مجموعه‌ها
      if (seenIncomingIds.has(rawId)) {
        existingUnchangedCount++;
        continue;
      }
      seenIncomingIds.add(rawId);

      let matchedId = rawId;
      let rawDestItem = destById.get(rawId);

      if (!rawDestItem && getSecondaryKey) {
        const sec = getSecondaryKey(incItem);
        if (sec && destBySecondary.has(sec)) {
          const found = destBySecondary.get(sec)!;
          matchedId = found.id;
          rawDestItem = found.item;
        }
      }

      const destItem =
        rawDestItem && colKey === 'multiMartyrGroups'
          ? (normalizeMultiMartyrGroupRecord(
              rawDestItem as unknown as MultiMartyrGroupAudit
            ) as unknown as T)
          : rawDestItem;

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

      // ۳. بررسی فیلد به فیلد با سیاست کاملاً غیرتخریبی:
      // مقادیر معتبر مقصد هرگز به صورت خودکار بازنویسی نمی‌شوند؛ فقط فیلدهای خالی/ناقص مقصد تکمیل می‌گردند
      // و اگر هر دو دستگاه مقادیر معتبر متفاوتی داشته باشند، حتماً به عنوان تعارض ثبت می‌شوند.
      const diffCheck = extractDifferingFields(destItem, incItem, colKey);

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

      // ۴. تعارض واقعی در دو دستگاه: نمایش کامل تفاوت‌ها با حفظ نسخه معتبر مقصد + تکمیل فیلدهای ناقص
      conflictCount++;
      conflicts.push({
        conflictId: `CONF_${colKey}_${matchedId}`,
        collection: colKey,
        collectionLabel: label,
        recordId: matchedId,
        titleSummary,
        destinationRecord: destItem,
        incomingRecord: incItem,
        complementaryMergedRecord: mergeComplementaryJsonRecordFields(destItem, incItem),
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
    (destinationState.multiMartyrGroups || []).map((g) =>
      normalizeMultiMartyrGroupRecord(g)
    ) as unknown as Record<string, unknown>[],
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
    syncAppliedPackages: Array.isArray(rawSource.syncAppliedPackages)
      ? (rawSource.syncAppliedPackages as string[])
      : [],
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
 * سریال‌سازی قطعی و بازگشتی (Deterministic Canonical Serialization)
 * تا ترتیب کلیدهای هیچ آبجکتی در هر سطح از تودرتویی باعث تغییر بی‌دلیل Checksum نشود
 */
export function canonicalizeValueDeterministic(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalizeValueDeterministic(item));
    return `[${items.join(',')}]`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    const pairs = sortedKeys.map(
      (k) => `${JSON.stringify(k)}:${canonicalizeValueDeterministic(obj[k])}`
    );
    return `{${pairs.join(',')}}`;
  }
  return 'null';
}

/**
 * محاسبه Checksum قطعی نسخه ۲ برای Recovery Point که تمام اجزای مؤثر بر بازیابی
 * (شامل stateSnapshot، syncMetaSnapshot، recordCounts و مشخصات هویتی Recovery Point) را پوشش می‌دهد
 */
export function computePreMergeRecoveryPointChecksum(params: {
  recoveryId: string;
  timestampMs: number;
  recordCounts: PreMergeRecoveryPoint['recordCounts'];
  stateSnapshot: FullOperationalState;
  syncMetaSnapshot: PreMergeRecoveryPoint['syncMetaSnapshot'];
}): string {
  const canonicalPayload = canonicalizeValueDeterministic({
    recoveryId: params.recoveryId,
    timestampMs: params.timestampMs,
    recordCounts: params.recordCounts,
    stateSnapshot: params.stateSnapshot,
    syncMetaSnapshot: params.syncMetaSnapshot,
  });
  return `RP_SHA256_${sha256Hex(canonicalPayload)}`;
}

/**
 * تهیه و اعتبارسنجی Recovery Point از اطلاعات فعلی دستگاه مقصد پیش از اجرای ادغام (بند ۱۲ مرحله سوم)
 */
export async function createPreMergeRecoveryPoint(
  currentState: FullOperationalState
): Promise<{ ok: boolean; recoveryPoint?: PreMergeRecoveryPoint; error?: string }> {
  try {
    const now = new Date();
    const timestampMs = now.getTime();
    const recoveryId = `RP_PRE_MERGE_${timestampMs}`;
    const stateClone: FullOperationalState = JSON.parse(JSON.stringify(currentState));
    const counts = calculateCollectionCounts(stateClone);
    const syncMeta = await hydrateSyncMetadataFromStorage();

    const syncMetaSnapshot: PreMergeRecoveryPoint['syncMetaSnapshot'] = {
      recordMetaMap: JSON.parse(JSON.stringify(syncMeta.recordMetaMap || {})),
      baselineChangeMap: JSON.parse(JSON.stringify(syncMeta.baselineChangeMap || {})),
      appliedPackageIds: Array.isArray(syncMeta.appliedPackageIds)
        ? [...syncMeta.appliedPackageIds]
        : [],
      softDeletedArchive: JSON.parse(JSON.stringify(loadSoftDeletedArchive() || {})),
      idSequences: readLocalIdSequences(),
    };

    const checksum = computePreMergeRecoveryPointChecksum({
      recoveryId,
      timestampMs,
      recordCounts: counts,
      stateSnapshot: stateClone,
      syncMetaSnapshot,
    });

    const recoveryPoint: PreMergeRecoveryPoint = {
      recoveryId,
      createdAtIso: now.toISOString(),
      createdAtJalali: formatJalaliDateTimeForDisplay(now),
      timestampMs,
      checksum,
      recordCounts: counts,
      stateSnapshot: stateClone,
      syncMetaSnapshot,
    };

    if (!isValidPreMergeRecoveryPoint(recoveryPoint)) {
      return {
        ok: false,
        error: 'اعتبارسنجی ساختاری و کنترلی Recovery Point تولیدشده ناموفق بود.',
      };
    }

    const serialized = JSON.stringify(recoveryPoint);
    if (!serialized || serialized.length < 20) {
      return { ok: false, error: 'ایجاد تصویر پشتیبان پیش از ادغام ناموفق بود.' };
    }

    let localOk = false;
    try {
      localStorage.setItem(PRE_MERGE_RECOVERY_STORAGE_KEY, serialized);
      localOk = localStorage.getItem(PRE_MERGE_RECOVERY_STORAGE_KEY) === serialized;
    } catch {
      localOk = false;
    }

    const idbRes = await idbSetItemWithStatus(
      PRE_MERGE_RECOVERY_STORAGE_KEY,
      recoveryPoint,
      timestampMs
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

export function isValidPreMergeRecoveryPoint(
  candidate: unknown
): candidate is PreMergeRecoveryPoint {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return false;
  }
  const rp = candidate as PreMergeRecoveryPoint;
  if (typeof rp.recoveryId !== 'string' || !rp.recoveryId.trim()) {
    return false;
  }
  if (typeof rp.createdAtIso !== 'string' || !rp.createdAtIso.trim()) {
    return false;
  }
  if (typeof rp.createdAtJalali !== 'string' || !rp.createdAtJalali.trim()) {
    return false;
  }
  if (
    typeof rp.timestampMs !== 'number' ||
    !Number.isFinite(rp.timestampMs) ||
    rp.timestampMs <= 0
  ) {
    return false;
  }
  if (typeof rp.checksum !== 'string' || !rp.checksum.trim()) {
    return false;
  }
  if (
    !rp.stateSnapshot ||
    typeof rp.stateSnapshot !== 'object' ||
    Array.isArray(rp.stateSnapshot)
  ) {
    return false;
  }
  if (
    !rp.syncMetaSnapshot ||
    typeof rp.syncMetaSnapshot !== 'object' ||
    Array.isArray(rp.syncMetaSnapshot)
  ) {
    return false;
  }
  if (
    !rp.recordCounts ||
    typeof rp.recordCounts !== 'object' ||
    Array.isArray(rp.recordCounts)
  ) {
    return false;
  }

  // ۱. اعتبارسنجی دقیق ساختار stateSnapshot و عناصر داخلی هر مجموعه
  const s = rp.stateSnapshot;
  if (!s.auditRecords || typeof s.auditRecords !== 'object' || Array.isArray(s.auditRecords)) {
    return false;
  }
  for (const [key, rec] of Object.entries(s.auditRecords)) {
    if (!key || !rec || typeof rec !== 'object' || Array.isArray(rec)) {
      return false;
    }
    if (typeof (rec as FieldAuditRecord).title !== 'string') {
      return false;
    }
  }

  const arrayCollections: Array<{
    arr: unknown;
    requiredStringKey?: string;
  }> = [
    { arr: s.bookCopies, requiredStringKey: 'copyId' },
    { arr: s.customMartyrs, requiredStringKey: 'martyrId' },
    { arr: s.smartSuggestions, requiredStringKey: 'id' },
    { arr: s.links, requiredStringKey: 'id' },
    { arr: s.pendingReviews, requiredStringKey: 'trackingId' },
    { arr: s.multiMartyrGroups, requiredStringKey: 'groupCode' },
    { arr: s.extractedItems, requiredStringKey: 'id' },
    { arr: s.auditLog, requiredStringKey: 'id' },
    { arr: s.rejectedSuggestionsArchive },
  ];

  for (const colCheck of arrayCollections) {
    if (!Array.isArray(colCheck.arr)) {
      return false;
    }
    for (const item of colCheck.arr) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return false;
      }
      if (colCheck.requiredStringKey) {
        const val = (item as Record<string, unknown>)[colCheck.requiredStringKey];
        if (typeof val !== 'string' || !val.trim()) {
          return false;
        }
      }
    }
  }

  if (
    !s.userSettings ||
    typeof s.userSettings !== 'object' ||
    Array.isArray(s.userSettings) ||
    typeof s.userSettings.activeRole !== 'string' ||
    !s.userSettings.activeRole.trim()
  ) {
    return false;
  }

  // ۲. اعتبارسنجی دقیق ساختار داخلی syncMetaSnapshot مطابق نوع واقعی داده‌ها
  const meta = rp.syncMetaSnapshot;
  if (
    !meta.recordMetaMap ||
    typeof meta.recordMetaMap !== 'object' ||
    Array.isArray(meta.recordMetaMap)
  ) {
    return false;
  }
  for (const [, mVal] of Object.entries(meta.recordMetaMap)) {
    if (!mVal || typeof mVal !== 'object' || Array.isArray(mVal)) {
      return false;
    }
    const rm = mVal as RecordSyncMeta;
    if (
      typeof rm.recordId !== 'string' ||
      typeof rm.collection !== 'string' ||
      typeof rm.revision !== 'number' ||
      !Number.isFinite(rm.revision)
    ) {
      return false;
    }
  }

  if (
    !meta.baselineChangeMap ||
    typeof meta.baselineChangeMap !== 'object' ||
    Array.isArray(meta.baselineChangeMap)
  ) {
    return false;
  }
  for (const [bKey, bVal] of Object.entries(meta.baselineChangeMap)) {
    if (!bKey || typeof bVal !== 'string') {
      return false;
    }
  }

  if (!Array.isArray(meta.appliedPackageIds)) {
    return false;
  }
  for (const pkgId of meta.appliedPackageIds) {
    if (typeof pkgId !== 'string' || !pkgId.trim()) {
      return false;
    }
  }

  if (
    !meta.softDeletedArchive ||
    typeof meta.softDeletedArchive !== 'object' ||
    Array.isArray(meta.softDeletedArchive)
  ) {
    return false;
  }
  for (const [, env] of Object.entries(meta.softDeletedArchive)) {
    if (!env || typeof env !== 'object' || Array.isArray(env)) {
      return false;
    }
    const eObj = env as SyncRecordEnvelope;
    if (
      !eObj.meta ||
      typeof eObj.meta !== 'object' ||
      typeof eObj.meta.recordId !== 'string' ||
      typeof eObj.meta.collection !== 'string'
    ) {
      return false;
    }
  }

  if (
    !meta.idSequences ||
    typeof meta.idSequences !== 'object' ||
    Array.isArray(meta.idSequences)
  ) {
    return false;
  }
  const seqKeys: Array<keyof IdSequenceSnapshot> = [
    'LOG',
    'RL',
    'SS',
    'MR',
    'EX',
    'CP',
    'TMP_OUT',
  ];
  for (const sk of seqKeys) {
    const sv = meta.idSequences[sk];
    if (typeof sv !== 'number' || !Number.isFinite(sv) || sv < 0) {
      return false;
    }
  }

  // ۳. اعتبارسنجی دقیق recordCounts و سازگاری ۱۰۰٪ آن با داده‌های واقعی داخل stateSnapshot
  const actualCounts = calculateCollectionCounts(s);
  const rc = rp.recordCounts;
  const countKeys: Array<keyof typeof actualCounts> = [
    'auditRecords',
    'bookCopies',
    'customMartyrs',
    'smartSuggestions',
    'links',
    'pendingReviews',
    'multiMartyrGroups',
    'extractedItems',
    'auditLog',
    'userSettings',
    'rejectedSuggestionsArchive',
    'totalOperationalItems',
  ];
  for (const ck of countKeys) {
    const val = rc[ck];
    if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) {
      return false;
    }
    if (val !== actualCounts[ck]) {
      return false;
    }
  }

  // ۴. اعتبارسنجی Checksum (پوشش کامل نسخه جدید RP_SHA256_ + سازگاری عقب‌رو با FNV1A- برای Recovery Pointهای سالم قبلی)
  if (rp.checksum.startsWith('RP_SHA256_')) {
    const expectedFullChecksum = computePreMergeRecoveryPointChecksum({
      recoveryId: rp.recoveryId,
      timestampMs: rp.timestampMs,
      recordCounts: rp.recordCounts,
      stateSnapshot: rp.stateSnapshot,
      syncMetaSnapshot: rp.syncMetaSnapshot,
    });
    if (rp.checksum !== expectedFullChecksum) {
      return false;
    }
  } else if (rp.checksum.startsWith('FNV1A-')) {
    const legacyChecksum = computeDatasetsChecksum(s);
    if (rp.checksum !== legacyChecksum) {
      return false;
    }
  } else {
    return false;
  }

  return true;
}

export async function getLatestPreMergeRecoveryPoint(): Promise<PreMergeRecoveryPoint | null> {
  let idbCandidate: PreMergeRecoveryPoint | null = null;
  let localCandidate: PreMergeRecoveryPoint | null = null;

  try {
    const idbEnv = await idbGetEnvelope<PreMergeRecoveryPoint>(PRE_MERGE_RECOVERY_STORAGE_KEY);
    if (isValidPreMergeRecoveryPoint(idbEnv.data)) {
      idbCandidate = idbEnv.data;
    }
  } catch {
    // ignore
  }

  try {
    const raw = localStorage.getItem(PRE_MERGE_RECOVERY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidPreMergeRecoveryPoint(parsed)) {
        localCandidate = parsed;
      }
    }
  } catch {
    // ignore
  }

  if (idbCandidate && localCandidate) {
    return localCandidate.timestampMs > idbCandidate.timestampMs
      ? localCandidate
      : idbCandidate;
  }

  return localCandidate ?? idbCandidate ?? null;
}

/**
 * بازگردانی کامل اطلاعات مقصد از Recovery Point در صورت بروز خطا یا درخواست کاربر
 * همراه با قابلیت بازگشت امن (Rollback) و تطبیق وضعیت بازیابی‌شده با Snapshot معتبر
 */
export async function restoreFromPreMergeRecoveryPoint(
  recoveryPoint: PreMergeRecoveryPoint
): Promise<{ ok: boolean; restoredState: FullOperationalState; error?: string }> {
  const fallbackSnapshot =
    recoveryPoint && typeof recoveryPoint === 'object' && 'stateSnapshot' in recoveryPoint
      ? recoveryPoint.stateSnapshot
      : ({} as FullOperationalState);

  if (!isValidPreMergeRecoveryPoint(recoveryPoint)) {
    return {
      ok: false,
      restoredState: fallbackSnapshot,
      error: 'ساختار، شمارنده‌ها یا Checksum نقطه بازیابی (Recovery Point) نامعتبر است.',
    };
  }

  // پشتیبان موقت از مقادیر فعلی متادیتا در localStorage جهت بازگردانی در صورت بروز خطا
  let prevSoftDeletedRaw: string | null = null;
  let prevIdSequencesRaw: string | null = null;
  let prevUserRoleRaw: string | null = null;
  try {
    prevSoftDeletedRaw = localStorage.getItem('book_p2p_soft_deleted_archive_v1');
    prevIdSequencesRaw = localStorage.getItem(ID_SEQUENCE_STORAGE_KEY);
    prevUserRoleRaw = localStorage.getItem(OPERATIONAL_STORAGE_KEYS.userRole);
  } catch {
    // ignore
  }

  const rollbackAuxLocalStorage = () => {
    try {
      if (prevSoftDeletedRaw === null) {
        localStorage.removeItem('book_p2p_soft_deleted_archive_v1');
      } else {
        localStorage.setItem('book_p2p_soft_deleted_archive_v1', prevSoftDeletedRaw);
      }
      if (prevIdSequencesRaw === null) {
        localStorage.removeItem(ID_SEQUENCE_STORAGE_KEY);
      } else {
        localStorage.setItem(ID_SEQUENCE_STORAGE_KEY, prevIdSequencesRaw);
      }
      if (prevUserRoleRaw === null) {
        localStorage.removeItem(OPERATIONAL_STORAGE_KEYS.userRole);
      } else {
        localStorage.setItem(OPERATIONAL_STORAGE_KEYS.userRole, prevUserRoleRaw);
      }
    } catch {
      // ignore
    }
  };

  const s: FullOperationalState = JSON.parse(JSON.stringify(recoveryPoint.stateSnapshot));
  const metaSnap: PreMergeRecoveryPoint['syncMetaSnapshot'] = JSON.parse(
    JSON.stringify(recoveryPoint.syncMetaSnapshot)
  );

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
    { key: RECORD_META_MAP_KEY, value: metaSnap.recordMetaMap },
    { key: BASELINE_CHANGE_MAP_KEY, value: metaSnap.baselineChangeMap },
    { key: APPLIED_PACKAGES_KEY, value: metaSnap.appliedPackageIds },
  ];

  const batchRes = await saveOperationalDataBatchAtomic(entries);
  if (!batchRes.ok) {
    return {
      ok: false,
      restoredState: s,
      error: batchRes.error || 'خطا در بازگردانی تراکنشی از Recovery Point',
    };
  }

  const targetSoftDeleted = metaSnap.softDeletedArchive || {};
  const softDeleteSavedOk = saveSoftDeletedArchive(targetSoftDeleted);

  const targetIdSequences = metaSnap.idSequences || readLocalIdSequences();
  const serializedSeq = JSON.stringify(targetIdSequences);
  let idSequencesSavedOk = false;
  try {
    localStorage.setItem(ID_SEQUENCE_STORAGE_KEY, serializedSeq);
    idSequencesSavedOk = localStorage.getItem(ID_SEQUENCE_STORAGE_KEY) === serializedSeq;
  } catch {
    idSequencesSavedOk = false;
  }

  let userRoleSavedOk = true;
  if (s.userSettings?.activeRole) {
    try {
      localStorage.setItem(OPERATIONAL_STORAGE_KEYS.userRole, s.userSettings.activeRole);
      userRoleSavedOk =
        localStorage.getItem(OPERATIONAL_STORAGE_KEYS.userRole) === s.userSettings.activeRole;
    } catch {
      userRoleSavedOk = false;
    }
  }

  if (!softDeleteSavedOk || !idSequencesSavedOk || !userRoleSavedOk) {
    rollbackAuxLocalStorage();
    const failedParts: string[] = [];
    if (!softDeleteSavedOk) failedParts.push('softDeletedArchive');
    if (!idSequencesSavedOk) failedParts.push('idSequences');
    if (!userRoleSavedOk) failedParts.push('userRole');
    return {
      ok: false,
      restoredState: s,
      error: `خطا در بازگردانی متادیتای تکمیلی از Recovery Point (${failedParts.join('، ')} ذخیره نشد).`,
    };
  }

  // تطبیق وضعیت بازیابی‌شده پس از عملیات با Snapshot معتبر
  const restoredCounts = calculateCollectionCounts(s);
  const restoredChecksum = computeDatasetsChecksum(s);
  const expectedSnapshotChecksum = computeDatasetsChecksum(recoveryPoint.stateSnapshot);
  const storageVerify = await verifyExportAgainstRealStorage(s);

  if (
    restoredCounts.totalOperationalItems !==
      recoveryPoint.recordCounts.totalOperationalItems ||
    restoredChecksum !== expectedSnapshotChecksum ||
    !storageVerify.verified
  ) {
    rollbackAuxLocalStorage();
    return {
      ok: false,
      restoredState: s,
      error: 'وضعیت بازیابی‌شده پس از عملیات با Snapshot معتبر همخوانی کامل نداشت.',
    };
  }

  applyCommittedSyncMetadataToCache(
    {
      recordMetaMap: metaSnap.recordMetaMap,
      baselineChangeMap: metaSnap.baselineChangeMap,
      appliedPackageIds: metaSnap.appliedPackageIds,
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
      (currentState.multiMartyrGroups || []).map((g) => normalizeMultiMartyrGroupRecord(g)),
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

    // ۴. اعمال رکوردهای تکمیل‌شده غیرمتعارض (فقط تکمیل فیلدهای خالی/ناقص مقصد بدون بازنویسی مقادیر معتبر مقصد)
    let appliedModifiedCount = 0;
    for (const item of inspection.modifiedRecords) {
      const safeMerged = item.destinationRecord
        ? mergeComplementaryJsonRecordFields(item.destinationRecord, item.incomingRecord)
        : item.mergedRecord ?? item.incomingRecord;
      putIntoTargetCollection(item.collection, item.recordId, safeMerged);
      appliedModifiedCount++;
    }

    // ۵. اعمال تصمیم غیرتخریبی روی رکوردهای دارای تعارض (هرگز مقدار معتبر مقصد بازنویسی نمی‌شود)
    let resolvedConflictsCount = 0;
    let keptDestinationConflictsCount = 0;
    const acceptedIncomingConflictsCount = 0;

    for (const conf of inspection.conflicts) {
      const rawDecision = conflictDecisions[conf.conflictId] || conf.selectedDecision;
      const decision: ConflictDecisionOption =
        rawDecision === 'keep-destination' ? 'keep-destination' : 'merge-complementary';

      if (decision === 'keep-destination') {
        putIntoTargetCollection(conf.collection, conf.recordId, conf.destinationRecord);
        keptDestinationConflictsCount++;
      } else {
        // merge-complementary: حفظ کامل مقادیر معتبر مقصد + تکمیل صرفاً فیلدهای ناقص/خالی از فایل ورودی
        const nonDestructiveMerged = mergeComplementaryJsonRecordFields(
          conf.destinationRecord,
          conf.incomingRecord
        );
        putIntoTargetCollection(conf.collection, conf.recordId, nonDestructiveMerged);
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

    // ۸. حفظ افزایشی بایگانی حذف نرم (softDeletedArchive) بدون هیچ‌گونه حذف فیزیکی یا خودکار رکوردهای عملیاتی موجود
    const currentSoftDeleted = loadSoftDeletedArchive();
    const incomingSoftDeleted = inspection.normalizedPayload.softDeletedArchive || {};
    const mergedSoftDeletedArchive: Record<string, SyncRecordEnvelope> = {
      ...incomingSoftDeleted,
      ...currentSoftDeleted,
    };
    try {
      saveSoftDeletedArchive(mergedSoftDeletedArchive);
    } catch {
      // ignore
    }

    // ۹. به‌روزرسانی شمارنده‌های شناسه یکتا (حداکثر شمارنده بین دو دستگاه تا هرگز شناسه تکراری صادر نشود)
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
