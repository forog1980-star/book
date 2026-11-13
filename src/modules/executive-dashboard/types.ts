import type {
  AuditLogEntry,
  BookCopyRecord,
  BookMartyrLinkRecord,
  CustomMartyrRecord,
  ExtractedContentItem,
  FieldAuditRecord,
  PendingReviewItem,
  ReferenceCatalogRow,
  SmartSearchSuggestion,
} from '../../data/markazAsnadData';

export interface RejectedSuggestionInput {
  id?: string;
  martyrId?: string;
  martyrName?: string;
  bookTitle?: string;
  matchedCatalogBookId?: string;
  rejectedAt?: string;
  reason?: string;
  reviewerNote?: string;
  reviewStatus?: string;
}

export interface GolzarRawMartyrInput {
  id?: string;
  source?: 'golzar' | 'outside' | 'golzar_martyrs' | 'outside_golzar_martyrs';
  sourceRow?: number;
  firstName?: string;
  lastName?: string;
  fatherName?: string;
  gravePiece?: string;
  graveRow?: string;
  graveNumber?: string;
  birthYear?: string;
  deathYear?: string;
  operation?: string;
  martyrdomCategory?: string;
  martyrdomLocation?: string;
  description?: string;
}

export interface ExecutiveDashboardInputs {
  catalogRows: ReferenceCatalogRow[];
  auditRecords?: Record<string, FieldAuditRecord>;
  bookCopies?: BookCopyRecord[];
  links?: BookMartyrLinkRecord[];
  pendingReviews?: PendingReviewItem[];
  extractedItems?: ExtractedContentItem[];
  smartSuggestions?: SmartSearchSuggestion[];
  rejectedSuggestionsArchive?: RejectedSuggestionInput[];
  customMartyrs?: CustomMartyrRecord[];
  golzarRecords?: GolzarRawMartyrInput[];
  golzarIndexVersion?: number;
  auditLogs?: AuditLogEntry[];
}

export interface SimilarTitleGroup {
  normalizedTitle: string;
  exactTitles: string[];
  rowCount: number;
  bookIds: string[];
  publishers: string[];
  disambiguationNote: string;
}

export interface BookManagerialStatusPartition {
  /** ۱) تکمیل‌شده بدون تیکت باز (گزینه ج: ۰ در داده پایه) */
  completedWithoutOpenTicketCount: number;
  /** ۲) دارای تیکت باز تکرار عنوان / بازبینی کتاب (شامل PV-0558..PV-0567 = ۱۰ در داده پایه) */
  openBookTicketCount: number;
  /** ۳) بررسی‌نشده (۹۷۰ در داده پایه) */
  unreviewedCount: number;
  /** جمع دقیق بدون هم‌پوشانی = totalTrackedBooksCount (۹۸۰ در داده پایه) */
  totalTrackedBooksCount: number;
  /** شناسه‌های تیکت باز کتاب در صف PV */
  openBookTicketIds: string[];
}

export interface BookReviewStatusBreakdown {
  /** کل کتاب‌های تحت پایش (کاتالوگ + کتاب‌های ثبت‌شده خارج از فهرست اولیه) */
  totalTrackedBooksCount: number;
  /** بررسی‌شده و دارای حداقل یک ارتباط غیرردشده با شهید */
  reviewedWithMartyrLinkCount: number;
  /** «بررسی‌شده؛ بدون ارتباط با شهید» — بررسی کامل انجام شده و شهید مرتبطی ثبت نشده است */
  reviewedWithoutMartyrLinkCount: number;
  /** جمع کتاب‌های بررسی‌شده (جمع دقیق دو وضعیت بالا) */
  reviewedCount: number;
  /** در حال بررسی یا دارای پرچم نیازمند بررسی میدانی */
  inFieldReviewCount: number;
  /** دست‌نخورده / بررسی‌نشده */
  untouchedUnreviewedCount: number;
  /** باقی‌مانده برای بررسی = کل منهای بررسی‌شده (افراز بدون هم‌پوشانی با reviewedCount) */
  remainingForReviewCount: number;
  /** واجد شرایط بررسی کارشناسی (شامل باقی‌مانده‌های کتاب + کتاب‌های دارای پیوند/پرونده باز نیازمند بررسی) */
  eligibleForReviewCount: number;
  /** هم‌پوشانی صریح بین remainingForReviewCount و eligibleForReviewCount */
  overlapRemainingAndEligibleCount: number;
  /** کتاب‌هایی که وضعیت خامشان بررسی‌شده بوده اما تیکت/پیگیری باز دارند */
  reviewedBooksWithOpenRelationQueueCount: number;
  /** افراز مصوب کارفرما (گزینه ج) در لایه مدیریتی بدون تغییر وضعیت اصلی داده‌ها */
  managerialStatusPartition: BookManagerialStatusPartition;
}

export interface LibraryAnalyticsResult {
  catalogRowsCount: number;
  distinctCatalogBookIdsCount: number;
  outsideCatalogBooksCount: number;
  totalTrackedBooksCount: number;
  exactUniqueCatalogTitlesCount: number;
  normalizedUniqueCatalogTitlesCount: number;
  similarTitleGroups: SimilarTitleGroup[];
  registeredPhysicalCopiesCount: number;
  physicalCopiesStatusBreakdown: {
    verifiedPresent: number;
    pendingReview: number;
    loaned: number;
    missing: number;
    outOfCollection: number;
  };
  reportedCountedCopiesSum: number;
  booksWithCountedCopiesNumberCount: number;
  reviewBreakdown: BookReviewStatusBreakdown;
  fieldAuditSummary: {
    totalAuditRecords: number;
    verified: number;
    review: number;
    notFound: number;
    expertApproved: number;
  };
}

export type MartyrTaxonomicType = 'martyr' | 'unknown_martyr' | 'non_martyr';

export interface HomonymAmbiguityGroup {
  normalizedFullName: string;
  occurrenceCountInBank: number;
  distinctFatherNames: string[];
  distinctGraveAddresses: string[];
}

export interface MartyrDiscrepancyWarning {
  normalizedName: string;
  displayName: string;
  kind:
    | 'grave_coordinate_mismatch'
    | 'mixed_confirmed_and_ambiguous'
    | 'homonym_conflict'
    | 'custom_martyr_ambiguous';
  message: string;
  gravesObserved: string[];
  affectedLinkIds: string[];
  affectedBookIds: string[];
}

export interface CustomMartyrBankCandidate {
  golzarId: string;
  fullName: string;
  fatherName: string;
  graveAddress: string;
  source: 'golzar' | 'outside';
}

export interface CustomMartyrBankMatch {
  customMartyrId: string;
  customFullName: string;
  matchCertainty: 'definite' | 'candidate_suggestion' | 'unmatched';
  matchedGolzarId?: string;
  matchEvidence: string;
  candidateGolzarMatches: CustomMartyrBankCandidate[];
}

export interface MartyrAnalyticsResult {
  officialBank: {
    hasOfficialBankLoaded: boolean;
    totalRows: number;
    golzarMainSheetRows: number;
    outsideGolzarSheetRows: number;
    namedMartyrRowsCount: number;
    unknownMartyrRowsCount: number;
    nonMartyrRowsCount: number;
    disambiguatedNamedProfilesCount: number;
    distinctNormalizedFullNamesCount: number;
    homonymGroupsCount: number;
    homonymRowsCount: number;
  };
  customMartyrs: {
    totalCount: number;
    verifiedCount: number;
    needsReviewCount: number;
    unreviewedCount: number;
    rejectedCount: number;
    definiteBankMatchesCount: number;
    candidateSuggestionsCount: number;
    matches: CustomMartyrBankMatch[];
  };
  linkedMartyrsSummary: {
    /** تعداد نام‌های متمایز مرتبط (۳۹۵ در داده پایه) */
    distinctNormalizedLinkedNamesCount: number;
    /** هویت‌های یکتای احرازشده بر پایه شخص یکتا (۳۳۲ در داده پایه — بدون تکرار مختصات مزار) */
    confirmedUniqueLinkedMartyrsCount: number;
    /** نام‌های نیازمند احراز هویت (۶۳ در داده پایه — مجموع دقیق با احرازشده = ۳۹۵) */
    ambiguousOrUnverifiedLinkedNamesCount: number;
    /** ردیف‌های گروهی یا * بدون نام شهید مشخص (۲۹۶ در داده پایه) */
    placeholderOrGroupLinkRowsCount: number;
    homonymAmbiguityNames: string[];
    /** هشدارهای کارشناسی اختلاف مختصات یا هم‌نامی (مانند صیاد شیرازی و علی خرمدل) بدون حذف خودکار داده */
    discrepancyWarnings: MartyrDiscrepancyWarning[];
  };
}

export type RelationCertaintyBucket =
  | 'confirmedByExpert'
  | 'probable'
  | 'needsReview'
  | 'rejected'
  | 'undetermined';

export const RELATION_CERTAINTY_DISPLAY_LABELS: Record<RelationCertaintyBucket, string> = {
  confirmedByExpert: 'تأییدشده کارشناسی',
  probable: 'دارای مشخصات مزار، اما بررسی‌نشده کارشناسی',
  needsReview: 'نیازمند بررسی',
  rejected: 'ردشده با دلیل',
  undetermined: 'بررسی‌نشده بدون مشخصات مزار',
};

export type RelationKindValue =
  | 'کتاب اختصاصی شهید'
  | 'دارای بخش یا اشاره به شهید'
  | 'نامشخص';

export interface RelationAnalyticsResult {
  totalRawLinkRows: number;
  distinctBookTargetPairsCount: number;
  duplicatePairRowsCount: number;
  certaintyByRawRows: Record<RelationCertaintyBucket, number>;
  certaintyByDistinctPairs: Record<RelationCertaintyBucket, number>;
  rejectedArchiveSuggestionsCount: number;
  excludedAuditMartyrCount: number;
  relationKindBreakdown: Record<RelationKindValue, number>;
  booksWithLinksBreakdown: {
    totalBooksWithActiveLinks: number;
    booksWithNamedMartyrLinks: number;
    booksWithSingleNamedMartyr: number;
    booksWithMultiMartyrLinks: number;
    booksWithOnlyGroupOrPlaceholderLinks: number;
    booksWithExpertConfirmedLink: number;
  };
}

export interface ReviewQueueResult {
  pendingReviews: {
    totalCount: number;
    openCount: number;
    resolvedCount: number;
    otherStatusCount: number;
    openByMainSheet: Record<string, number>;
    openByIssueType: Record<string, number>;
  };
  multiMartyrGroups: {
    totalGroupsCount: number;
    totalMemberRowsCount: number;
    groupKeys: string[];
  };
  linkReviewBacklogCount: number;
  bookReviewBacklogCount: number;
  smartSuggestionsQueue: {
    totalCount: number;
    pendingExpertQueueCount: number;
    conflictCount: number;
    approvedCount: number;
    rejectedCount: number;
  };
  extractedItemsQueue: {
    totalCount: number;
    expertApprovedCount: number;
    baseResearchReviewedCount: number;
    needsReviewCount: number;
    rawInitialCount: number;
    rejectedCount: number;
  };
}

export interface TemporalSourceAudit {
  sourceKey:
    | 'auditRecords'
    | 'bookCopies_observedDate'
    | 'bookCopies_lastReviewedAt'
    | 'bookCopyLocationHistory'
    | 'customMartyrs'
    | 'extractedItems'
    | 'smartSuggestions_retrievedAt'
    | 'smartSuggestions_reviewedAt'
    | 'rejectedSuggestions'
    | 'auditLogs';
  label: string;
  totalRecordsCount: number;
  validTimestampCount: number;
  missingTimestampCount: number;
  invalidTimestampCount: number;
}

export interface TemporalMonthlyBucket {
  periodKey: string;
  calendarType: 'jalali' | 'gregorian';
  totalValidEvents: number;
  bySource: Partial<Record<TemporalSourceAudit['sourceKey'], number>>;
}

export interface TemporalAuditResult {
  structurallyDatelessSources: {
    catalogRowsCount: number;
    linksCount: number;
    pendingReviewsCount: number;
    golzarRecordsCount: number;
    totalDatelessRecordsCount: number;
  };
  timestampedSources: TemporalSourceAudit[];
  totalTimestampEvaluatedRecords: number;
  totalValidTimestampRecords: number;
  totalMissingTimestampRecords: number;
  totalInvalidTimestampRecords: number;
  monthlyActivity: TemporalMonthlyBucket[];
  datelessLegacyExcludedFromPeriodicMetrics: true;
}

export interface DashboardSummaryResult {
  martyrRelatedKpi: {
    title: 'مرتبط با شهدا';
    relatedBooksWithNamedMartyrsCount: number;
    relatedBooksGroupOnlyCount: number;
    relatedBooksIncludingGroupLinksCount: number;
    expertConfirmedRelatedBooksCount: number;
    distinctLinkedMartyrNamesCount: number;
    confirmedUniqueLinkedMartyrsCount: number;
    ambiguousOrUnverifiedLinkedNamesCount: number;
    expertConfirmedRelationsCount: number;
    activeRelationRowsCount: number;
    officialBankNamedMartyrsCount: number;
  };
  totalBooksKpi: {
    title: 'کل کتاب‌ها';
    subtitle: 'از کل کتابهای ثبتشده در کتابخانه';
    catalogBooksCount: number;
    outsideCatalogBooksCount: number;
    totalTrackedBooksCount: number;
    registeredPhysicalCopiesCount: number;
    exactUniqueTitlesCount: number;
    similarTitleGroupsCount: number;
  };
  bookReviewStatusKpi: {
    title: 'وضعیت بررسی کتاب‌ها';
    completedWithoutOpenTicketCount: number;
    openBookTicketCount: number;
    unreviewedCount: number;
    totalTrackedBooksCount: number;
    reviewedCount: number;
    reviewedWithoutMartyrLinkCount: number;
    remainingForReviewCount: number;
    eligibleForReviewCount: number;
    overlapRemainingAndEligibleCount: number;
    reconciliationNote: string;
  };
  library: LibraryAnalyticsResult;
  martyrs: MartyrAnalyticsResult;
  relations: RelationAnalyticsResult;
  reviewQueue: ReviewQueueResult;
  temporalAudit: TemporalAuditResult;
}

// ============================================================================
// فاز دوم: موجودیت‌ها، پرونده‌های خلاصه، خروجی مدیریتی و تاریخچه
// ============================================================================

export type ManagerialBookStatusCode =
  | 'completed_without_ticket'
  | 'open_duplicate_ticket'
  | 'unreviewed';

export type TehranValidityStatus = 'tehran' | 'non_tehran' | 'unknown';

export interface DashboardBookLinkedRelationRef {
  linkId: string;
  martyrKey: string;
  martyrDisplayCode: string;
  martyrName: string;
  isPlaceholderOrGroup: boolean;
  graveAddress: string;
  tehranStatus: TehranValidityStatus;
  pageReferenceRaw: string;
  sourceDescriptionRaw: string;
  certaintyBucket: RelationCertaintyBucket;
  certaintyLabel: string;
  reviewStatus: string;
  reviewerNote: string;
  sourceFile: string;
  sourceSheet: string;
  sourceExcelRow: string;
}

export interface DashboardBookListItem {
  bookKey: string;
  tempBookId: string;
  source: 'catalog' | 'outside-list';
  title: string;
  publisher: string;
  author: string;
  locationDisplay: string;
  shelf: string;
  level: string;
  subjectCategory: string;
  description: string;
  notes: string;
  /** شابک و فیپا در داده و خروجی JSON/Excel مدیریتی حفظ می‌شوند اما در نمای خلاصه پنهان هستند */
  isbn: string;
  fipa: string;
  registrationNo: string;
  countedCopiesRaw: string;
  physicalCopiesCount: number;
  physicalStatusRaw: string;
  managerialStatus: ManagerialBookStatusCode;
  managerialStatusLabel: string;
  openTicketIds: string[];
  openTicketSubjects: string[];
  hasNamedMartyrLink: boolean;
  hasGroupOrPlaceholderOnly: boolean;
  hasActiveLink: boolean;
  hasExpertConfirmedLink: boolean;
  relations: DashboardBookLinkedRelationRef[];
  extractedPassages: ExtractedContentItem[];
}

export interface DashboardMartyrLinkedBookRef {
  linkId: string;
  bookKey: string;
  tempBookId: string;
  bookTitle: string;
  publisher: string;
  pageReferenceRaw: string;
  sourceDescriptionRaw: string;
  certaintyBucket: RelationCertaintyBucket;
  certaintyLabel: string;
  reviewStatus: string;
  reviewerNote: string;
}

export interface DashboardMartyrListItem {
  martyrKey: string;
  displayCode: string;
  customMartyrId?: string;
  golzarId?: string;
  fullName: string;
  normalizedName: string;
  fatherName: string;
  gravePiece: string;
  graveRow: string;
  graveNumber: string;
  graveAddress: string;
  tehranStatus: TehranValidityStatus;
  tehranEvidenceNote: string;
  identityStatus: 'confirmed' | 'needs_verification';
  identityStatusLabel: string;
  homonymCountInBank: number;
  hasExpertConfirmedRelation: boolean;
  linkedBooksCount: number;
  linkedBooks: DashboardMartyrLinkedBookRef[];
  discrepancyWarnings: MartyrDiscrepancyWarning[];
  customMatchCandidates: CustomMartyrBankCandidate[];
}

export interface DashboardRelationListItem {
  linkId: string;
  bookKey: string;
  tempBookId: string;
  bookTitle: string;
  publisher: string;
  martyrKey: string;
  martyrDisplayCode: string;
  martyrName: string;
  graveAddress: string;
  tehranStatus: TehranValidityStatus;
  pageReferenceRaw: string;
  sourceDescriptionRaw: string;
  reviewerNote: string;
  certaintyBucket: RelationCertaintyBucket;
  certaintyLabel: string;
  reviewStatus: string;
  isPlaceholderOrGroup: boolean;
  sourceFile: string;
  sourceSheet: string;
  sourceExcelRow: string;
  extractedTexts: string[];
}

export interface ExecutiveDashboardExportV1 {
  schema_id: 'ExecutiveDashboardExportV1';
  schema_version: '1.0.0';
  exportedAt: string;
  exportedAtFa: string;
  appliedFilterNote: string;
  kpisSnapshot: DashboardSummaryResult;
  books: Array<{
    bookKey: string;
    tempBookId: string;
    source: 'catalog' | 'outside-list';
    title: string;
    publisher: string;
    author: string;
    locationDisplay: string;
    subjectCategory: string;
    description: string;
    notes: string;
    isbn: string;
    fipa: string;
    registrationNo: string;
    managerialStatus: ManagerialBookStatusCode;
    managerialStatusLabel: string;
    openTicketIds: string[];
    linkedMartyrKeys: string[];
    linkedLinkIds: string[];
  }>;
  martyrs: Array<{
    martyrKey: string;
    displayCode: string;
    customMartyrId?: string;
    golzarId?: string;
    fullName: string;
    normalizedName: string;
    fatherName: string;
    gravePiece: string;
    graveRow: string;
    graveNumber: string;
    graveAddress: string;
    tehranStatus: TehranValidityStatus;
    identityStatus: 'confirmed' | 'needs_verification';
    homonymCountInBank: number;
    linkedBookKeys: string[];
    discrepancyWarnings: MartyrDiscrepancyWarning[];
  }>;
  relations: DashboardRelationListItem[];
  extractedItems: ExtractedContentItem[];
  pendingReviews: PendingReviewItem[];
}

export interface ExecutiveExportHistoryRecord {
  exportId: string;
  fileName: string;
  fileType: 'excel' | 'json';
  exportScope: 'dashboard_management' | 'filtered_books' | 'filtered_martyrs';
  timestampIso: string;
  timestampDisplay: string;
  recordCount: number;
  appliedFiltersSummary: string;
  status: 'success' | 'failed';
  errorMessage?: string;
}
