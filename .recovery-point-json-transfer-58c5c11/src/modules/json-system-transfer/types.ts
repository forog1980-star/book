import {
  AuditLogEntry,
  BookCopyLocationHistory,
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
import { UnifiedBookDossier } from '../../data/soorehMehrResearch';
import {
  CollectionCountSummary,
  FullOperationalState,
  RejectedSuggestionRecord,
  UserSettingsPayload,
} from '../../utils/backupService';
import { DeviceSyncRole, RecordSyncMeta, SyncRecordEnvelope } from '../device-sync/types';

export const JSON_TRANSFER_FORMAT_ID = 'golzar-book-library-full-system-json' as const;
export const JSON_TRANSFER_SCHEMA_VERSION = 4 as const;
export const JSON_TRANSFER_APP_VERSION = '3.6.0' as const;

export interface DeterminationStatusSummary {
  totalUniqueBooks: number;
  definiteMartyrLinksCount: number;
  probableMartyrLinksCount: number;
  needsReviewMartyrLinksCount: number;
  generalOrUnlinkedBooksCount: number;
  verifiedInShelfCount: number;
  needsShelfReviewCount: number;
  notFoundInShelfCount: number;
  newOutsideRegistrationsCount: number;
}

export interface ShelfLocationSummaryItem {
  recordKey: string;
  bookId: string;
  copyId?: string;
  title: string;
  shelf: string;
  level: string;
  locationCode: string;
  countedCopies: string;
  physicalStatus: string;
}

export interface CopyMoveHistoryExportItem extends BookCopyLocationHistory {
  copyId: string;
  bookId: string;
  bookTitle: string;
}

export interface IdSequenceSnapshot {
  LOG: number;
  RL: number;
  SS: number;
  MR: number;
  EX: number;
  CP: number;
  TMP_OUT: number;
}

export interface FullLibrarySystemDataPayload {
  // ۱ و ۲. اطلاعات کتاب‌ها، نویسنده، ناشر، موضوع و مشخصات شناسنامه‌ای و ثبت‌های سریع قفسه
  auditRecords: Record<string, FieldAuditRecord>;
  // ۳. تمام ارتباط‌های کتاب و شهید (قطعی، احتمالی، نیازمند بررسی، تأییدشده)
  links: BookMartyrLinkRecord[];
  // ۴. ارتباط‌های چندشهیدی (۱۶ گروه چندشهیدی + تمام رکوردهای تفکیک‌شده و گزیده‌ها)
  multiMartyrGroups: MultiMartyrGroupAudit[];
  extractedItems: ExtractedContentItem[];
  // ۵. شهدای ثبت‌شده دستی در دستگاه
  customMartyrs: CustomMartyrRecord[];
  // ۸ و ۹ و ۱۰. اطلاعات موجودی فیزیکی، قفسه/طبقه/جایگاه و تاریخچه تغییر محل نگهداری
  bookCopies: BookCopyRecord[];
  // ۱۲. موارد نیازمند بررسی کارشناسی و پیشنهادهای هوشمند
  pendingReviews: PendingReviewItem[];
  smartSuggestions: SmartSearchSuggestion[];
  rejectedSuggestionsArchive: RejectedSuggestionRecord[];
  // ۱۳. تنظیمات محلی ضروری و شمارنده‌های شناسه یکتا
  userSettings: UserSettingsPayload;
  idSequences: IdSequenceSnapshot;
  // ۱۴. تاریخچه عملیات، متادیتای همگام‌سازی و بایگانی حذف نرم (Tombstones)
  auditLog: AuditLogEntry[];
  syncRecordMeta: Record<string, RecordSyncMeta>;
  syncBaselineHashes: Record<string, string>;
  syncAppliedPackages: string[];
  softDeletedArchive: Record<string, SyncRecordEnvelope>;

  // نماهای تجمیعی و تحلیلی استخراج‌شده از کل منابع سیستم برای خوانایی و پوشش ۱۰۰٪
  derivedSnapshots: {
    booksDossiersCount: number;
    booksDossiers: UnifiedBookDossier[];
    newRegistrations: FieldAuditRecord[];
    determinationSummary: DeterminationStatusSummary;
    shelfLocations: ShelfLocationSummaryItem[];
    locationHistory: CopyMoveHistoryExportItem[];
    authorsList: string[];
    publishersList: string[];
    categoriesList: string[];
  };
}

export interface StorageVerificationCheck {
  verified: boolean;
  checkedAtIso: string;
  indexedDbAvailable: boolean;
  localStorageAvailable: boolean;
  extractedCounts: Record<string, number>;
  storageActualCounts: Record<string, number>;
  mismatches: string[];
}

export interface JsonTransferIntegrityBlock {
  algorithm: 'SHA256-DETERMINISTIC+FNV1A';
  payloadHash: string;
  fnv1aChecksum: string;
  collectionCounts: CollectionCountSummary & {
    newRegistrations: number;
    multiMartyrLinks: number;
    locationHistoryEntries: number;
    softDeletedTombstones: number;
    syncMetaEntries: number;
  };
  storageVerification: StorageVerificationCheck;
}

export interface FullLibrarySystemExportEnvelope {
  format: typeof JSON_TRANSFER_FORMAT_ID;
  schemaVersion: number;
  version: number;
  backupType: 'FULL_SYSTEM_BACKUP';
  appTitle: string;
  appVersion: string;
  exportId: string;
  deviceId: string;
  deviceRole: DeviceSyncRole;
  exportedAt: string;
  exportedAtJalali: string;
  exportedTimestamp: number;
  data: FullLibrarySystemDataPayload;
  integrity: JsonTransferIntegrityBlock;
  // فیلدهای سازگار با نسخه ۳ پشتیبان برای پشتیبانی دوطرفه در تمام بخش‌های نرم‌افزار
  checksum: string;
  counts: CollectionCountSummary;
  datasets: FullOperationalState;
  records: FieldAuditRecord[];
}

export type MergeCollectionKey =
  | 'auditRecords'
  | 'bookCopies'
  | 'customMartyrs'
  | 'links'
  | 'multiMartyrGroups'
  | 'extractedItems'
  | 'pendingReviews'
  | 'smartSuggestions'
  | 'rejectedSuggestionsArchive'
  | 'auditLog';

export type ConflictDecisionOption =
  | 'keep-destination'
  | 'accept-incoming'
  | 'merge-complementary';

export interface FieldDifferenceDetail {
  fieldKey: string;
  fieldLabel: string;
  destinationValue: string;
  incomingValue: string;
}

export interface RecordConflictDetail {
  conflictId: string;
  collection: MergeCollectionKey;
  collectionLabel: string;
  recordId: string;
  titleSummary: string;
  destinationRecord: unknown;
  incomingRecord: unknown;
  complementaryMergedRecord: unknown;
  differingFields: FieldDifferenceDetail[];
  selectedDecision: ConflictDecisionOption;
}

export interface RecordChangePreviewItem {
  collection: MergeCollectionKey;
  collectionLabel: string;
  recordId: string;
  titleSummary: string;
  changeKind: 'new' | 'modified-complementary' | 'soft-deleted';
  incomingRecord: unknown;
  destinationRecord?: unknown;
  mergedRecord?: unknown;
}

export interface InvalidRecordDetail {
  collection: string;
  indexOrKey: string;
  reason: string;
}

export interface CollectionComparisonSummary {
  key: MergeCollectionKey;
  label: string;
  destinationCount: number;
  incomingCount: number;
  newCount: number;
  existingUnchangedCount: number;
  modifiedComplementaryCount: number;
  conflictCount: number;
  invalidCount: number;
}

export interface SystemJsonInspectionReport {
  valid: boolean;
  errorReason?: string;
  warnings: string[];
  fileName: string;
  fileSizeBytes: number;
  detectedFormat: string;
  detectedSchemaVersion: number;
  appVersion: string;
  exportId: string;
  sourceDeviceId: string;
  sourceDeviceRole: string;
  exportedAt: string;
  exportedAtJalali: string;
  integrityValid: boolean;
  expectedHash?: string;
  computedHash?: string;

  // آمار مرحله اول و دوم (الزامات بخش چهارم)
  summaryMetrics: {
    booksCount: number;
    bookMartyrLinksCount: number;
    multiMartyrRelationsCount: number;
    newRegistrationsCount: number;
    identifiedChangesCount: number;
    existingUnchangedOrDuplicateCount: number;
    potentialConflictsCount: number;
    invalidOrUntransferableCount: number;
    totalIncomingOperationalRecords: number;
    totalDestinationOperationalRecords: number;
  };

  collectionComparisons: CollectionComparisonSummary[];
  newRecords: RecordChangePreviewItem[];
  modifiedRecords: RecordChangePreviewItem[];
  softDeletedRecords: RecordChangePreviewItem[];
  conflicts: RecordConflictDetail[];
  invalidRecords: InvalidRecordDetail[];

  normalizedPayload?: Partial<FullLibrarySystemDataPayload>;
}

export interface PreMergeRecoveryPoint {
  recoveryId: string;
  createdAtIso: string;
  createdAtJalali: string;
  timestampMs: number;
  checksum: string;
  recordCounts: CollectionCountSummary;
  stateSnapshot: FullOperationalState;
  syncMetaSnapshot: {
    recordMetaMap: Record<string, RecordSyncMeta>;
    baselineChangeMap: Record<string, string>;
    appliedPackageIds: string[];
    softDeletedArchive: Record<string, SyncRecordEnvelope>;
    idSequences: IdSequenceSnapshot;
  };
}

export interface SafeMergeExecutionResult {
  ok: boolean;
  error?: string;
  recoveryPointId: string;
  appliedNewCount: number;
  appliedModifiedCount: number;
  resolvedConflictsCount: number;
  keptDestinationConflictsCount: number;
  acceptedIncomingConflictsCount: number;
  unchangedCount: number;
  skippedInvalidCount: number;
  mergedState: FullOperationalState;
  summaryMessage: string;
}

export interface ExportExecutionResult {
  ok: boolean;
  error?: string;
  fileName: string;
  jsonString: string;
  byteSize: number;
  envelope: FullLibrarySystemExportEnvelope;
  storageVerification: StorageVerificationCheck;
}

export interface LibraryCatalogContext {
  catalogRows: ReferenceCatalogRow[];
}
