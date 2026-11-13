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
  /** هم‌پوشانی صریح بین remainingForReviewCount و eligibleForReviewCount (کتاب‌هایی که هم بررسی‌نشده‌اند و هم در صف واجد شرایط قرار دارند) */
  overlapRemainingAndEligibleCount: number;
  /** کتاب‌هایی که وضعیت کتابشان بررسی‌شده است اما پیوند یا پیگیری شهید باز دارند */
  reviewedBooksWithOpenRelationQueueCount: number;
}

export interface LibraryAnalyticsResult {
  /** تعداد ردیف‌های خام ثبت‌شده در شیت «فهرست کتاب‌ها» */
  catalogRowsCount: number;
  /** تعداد شناسه‌های مستقل کتاب در کاتالوگ (BK-xxxx) */
  distinctCatalogBookIdsCount: number;
  /** کتاب‌های ثبت‌شده خارج از فهرست اولیه ۹۸۰ کتاب */
  outsideCatalogBooksCount: number;
  /** مجموع کتاب‌های مستقل تحت پایش (کاتالوگ + خارج از فهرست بدون تکرار کلید) */
  totalTrackedBooksCount: number;
  /** تعداد عناوین یکتای دقیق در کاتالوگ */
  exactUniqueCatalogTitlesCount: number;
  /** تعداد عناوین یکتای نرمال‌شده در کاتالوگ */
  normalizedUniqueCatalogTitlesCount: number;
  /** گروه‌های دارای عنوان تکراری یا هم‌نام بدون ادغام خودکار */
  similarTitleGroups: SimilarTitleGroup[];
  /** تعداد نسخه‌های فیزیکی ثبت‌شده رسمی دارای شناسه مستقل (CP-xxxxxx) */
  registeredPhysicalCopiesCount: number;
  /** تعداد نسخه‌های فیزیکی متعلق به کاتالوگ اولیه vs کل */
  physicalCopiesStatusBreakdown: {
    verifiedPresent: number;
    pendingReview: number;
    loaned: number;
    missing: number;
    outOfCollection: number;
  };
  /** مجموع شمارش عددی خام فیلد countedCopies (در صورت ثبت، صرفاً عدد شمارشی قفسه و متمایز از شناسنامه CP) */
  reportedCountedCopiesSum: number;
  /** تعداد ردیف‌هایی که عدد شمارش فیزیکی برایشان ثبت شده است */
  booksWithCountedCopiesNumberCount: number;
  /** وضعیت بررسی کتاب‌ها با تفکیک دقیق بدون شمارش تکراری */
  reviewBreakdown: BookReviewStatusBreakdown;
  /** توزیع وضعیت میدانی auditRecords */
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

export interface MartyrAnalyticsResult {
  /** آمار پایگاه رسمی گلزار (در صورت ورودی داده گلزار؛ شیت نمونه ۱۹۶ شهید هرگز در این آمار مخلوط نمی‌شود) */
  officialBank: {
    hasOfficialBankLoaded: boolean;
    totalRows: number;
    golzarMainSheetRows: number;
    outsideGolzarSheetRows: number;
    /** ردیف‌های با نوع «martyr» (شهید نام‌دار) */
    namedMartyrRowsCount: number;
    /** ردیف‌های با نوع «unknown_martyr» (شهید گمنام / یادبود گمنام) */
    unknownMartyrRowsCount: number;
    /** ردیف‌های با نوع «non_martyr» (اموات / غیرشهید ثبت‌شده در فایل خام) */
    nonMartyrRowsCount: number;
    /** تعداد پروفایل‌های تفکیک‌شده بر پایه کلید هویت غیرهم‌نام (نام + پدر + نشانی مزار) */
    disambiguatedNamedProfilesCount: number;
    /** تعداد نام‌های کامل یکتای نرمال‌شده در ردیف‌های شهید نام‌دار */
    distinctNormalizedFullNamesCount: number;
    /** گروه‌های هم‌نام در بانک شهدا که بدون نام پدر/مزار نباید ادغام شوند */
    homonymGroupsCount: number;
    /** جمع فراوانی ردیف‌های داخل گروه‌های هم‌نام */
    homonymRowsCount: number;
  };
  /** پرونده‌های دستی شهید ثبت‌شده در سامانه (MR-xxxxxx) */
  customMartyrs: {
    totalCount: number;
    verifiedCount: number;
    needsReviewCount: number;
    unreviewedCount: number;
    rejectedCount: number;
  };
  /** تحلیل شهدای دارای ارتباط با کتاب‌ها (با تفکیک شفاف میان نامِ پیوندخورده و شخصِ احرازشده) */
  linkedMartyrsSummary: {
    /** تعداد نام‌های متمایز نرمال‌شده دارای ارتباط غیرردشده در شیت ارتباط و پرونده‌های کتاب (بدون ادعای یکتا بودن قطعی اشخاص هم‌نام) */
    distinctNormalizedLinkedNamesCount: number;
    /** تعداد شهدای یکتای احرازشده (دارای شناسه قطعی شهید یا مزار مشخص یا تطبیق یکتای غیرهم‌نام با بانک رسمی) */
    confirmedUniqueLinkedMartyrsCount: number;
    /** تعداد نام‌های پیوندخورده که به دلیل هم‌نامی در بانک یا نبود مزار/شناسه قطعی در وضعیت نیازمند احراز هستند */
    ambiguousOrUnverifiedLinkedNamesCount: number;
    /** تعداد ردیف‌های پیوند مبهم/گروهی/ستاره (*) که هیچ شخص مشخصی نیستند */
    placeholderOrGroupLinkRowsCount: number;
    /** نمونه یا فهرست نام‌های دارای تعارض هم‌نامی با بانک رسمی */
    homonymAmbiguityNames: string[];
  };
}

export type RelationCertaintyBucket =
  | 'confirmedByExpert'
  | 'probable'
  | 'needsReview'
  | 'rejected'
  | 'undetermined';

export type RelationKindValue =
  | 'کتاب اختصاصی شهید'
  | 'دارای بخش یا اشاره به شهید'
  | 'نامشخص';

export interface RelationAnalyticsResult {
  /** تعداد کل رکوردهای خام شیت ارتباط + پیوندهای افزوده‌شده کاربر/پژوهش */
  totalRawLinkRows: number;
  /** تعداد جفت‌های متمایز (کلید کتاب + نام نرمال‌شده هدف) برای پیشگیری از شمارش مضاعف پیوند تکراری یکسان */
  distinctBookTargetPairsCount: number;
  /** تعداد رکوردهای خام تکراری برای یک جفت کتاب-شهید یکسان */
  duplicatePairRowsCount: number;
  /** تفکیک قطعی سطح اطمینان و اعتبارسنجی روی تمام رکوردهای ارتباط (مجموع دقیق = totalRawLinkRows) */
  certaintyByRawRows: Record<RelationCertaintyBucket, number>;
  /** تفکیک سطح اطمینان روی جفت‌های یکتای کتاب-هدف (پس از رفع تکرار یکسان) */
  certaintyByDistinctPairs: Record<RelationCertaintyBucket, number>;
  /** تعداد موارد ردشده مستقل در آرشیو پیشنهادهای هوشمند (rejectedSuggestionsArchive) و جدول پیشنهادها */
  rejectedArchiveSuggestionsCount: number;
  /** تعداد شهدای حذف/مستثنی‌شده توسط کارشناس در auditRecords.excludedMartyrs */
  excludedAuditMartyrCount: number;
  /** تفکیک نوع ارتباط کتاب و شهید بدون حدس‌زدن از صفحه خالی یا نام شیت تک‌شهید */
  relationKindBreakdown: Record<RelationKindValue, number>;
  /** تعداد کتاب‌های منحصربه‌فردی که دارای پیوند غیرردشده با نام مشخص یا عبارت گروهی هستند */
  booksWithLinksBreakdown: {
    /** کل کتاب‌های یکتای دارای حداقل یک ارتباط غیرردشده (با نام مشخص یا گروهی) */
    totalBooksWithActiveLinks: number;
    /** کتاب‌های یکتای دارای حداقل یک نام شهید مشخص غیرردشده */
    booksWithNamedMartyrLinks: number;
    /** کتاب‌های تک‌شهیدی (دقیقاً یک نام شهید مشخص و بدون گروه چندشهیدی) */
    booksWithSingleNamedMartyr: number;
    /** کتاب‌های چندشهیدی (بیش از یک نام شهید مشخص یا عضو گروه چندشهیدی) */
    booksWithMultiMartyrLinks: number;
    /** کتاب‌هایی که فقط ارتباط گروهی/ستاره/نیازمند تفکیک دارند */
    booksWithOnlyGroupOrPlaceholderLinks: number;
    /** کتاب‌های دارای حداقل یک ارتباط تأییدشده توسط کارشناس */
    booksWithExpertConfirmedLink: number;
  };
}

export interface ReviewQueueResult {
  /** جدول پیگیری «موارد نیازمند بررسی» (PV-xxxx) */
  pendingReviews: {
    totalCount: number;
    openCount: number;
    resolvedCount: number;
    otherStatusCount: number;
    openByMainSheet: Record<string, number>;
    openByIssueType: Record<string, number>;
  };
  /** گروه‌های کتاب‌های چندشهیدی استخراج‌شده از شیت «چند شهید» (مانند G001..G016) */
  multiMartyrGroups: {
    totalGroupsCount: number;
    totalMemberRowsCount: number;
    groupKeys: string[];
  };
  /** صف بررسی پیوندهای کتاب-شهید */
  linkReviewBacklogCount: number;
  /** صف بررسی کتاب‌ها */
  bookReviewBacklogCount: number;
  /** صف پیشنهادهای جست‌وجوی هوشمند */
  smartSuggestionsQueue: {
    totalCount: number;
    pendingExpertQueueCount: number;
    conflictCount: number;
    approvedCount: number;
    rejectedCount: number;
  };
  /** صف مطالب استخراج‌شده */
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
  periodKey: string; // e.g. "1405-08" or "ISO-2026-11"
  calendarType: 'jalali' | 'gregorian';
  totalValidEvents: number;
  bySource: Partial<Record<TemporalSourceAudit['sourceKey'], number>>;
}

export interface TemporalAuditResult {
  /** داده‌های تاریخی ذاتاً بدون مهر زمان (کاتالوگ اولیه، پیوندهای اکسل پایه، پیگیری‌های پایه، بانک گلزار) */
  structurallyDatelessSources: {
    catalogRowsCount: number;
    linksCount: number;
    pendingReviewsCount: number;
    golzarRecordsCount: number;
    totalDatelessRecordsCount: number;
  };
  /** ممیزی منابع دارای فیلد تاریخ */
  timestampedSources: TemporalSourceAudit[];
  totalTimestampEvaluatedRecords: number;
  totalValidTimestampRecords: number;
  totalMissingTimestampRecords: number;
  totalInvalidTimestampRecords: number;
  /** توزیع زمانی منحصراً روی رکوردهای دارای مهر زمان معتبر */
  monthlyActivity: TemporalMonthlyBucket[];
  /** آیا داده‌های تاریخی بدون مهر زمان از محاسبه عملکرد دوره‌ای کنار گذاشته شده‌اند؟ (همواره true) */
  datelessLegacyExcludedFromPeriodicMetrics: true;
}

export interface DashboardSummaryResult {
  /** ۱) کارت اول داشبورد آینده: مرتبط با شهدا */
  martyrRelatedKpi: {
    title: 'مرتبط با شهدا';
    /** تعداد کتاب‌های منحصربه‌فرد مرتبط با حداقل یک شهید مشخص (غیرردشده و غیرستاره) */
    relatedBooksWithNamedMartyrsCount: number;
    /** تعداد کل کتاب‌های دارای هرگونه پیوند فعال (شامل کتاب‌های فقط دارای عبارت گروهی) */
    relatedBooksIncludingGroupLinksCount: number;
    /** تعداد کتاب‌های دارای حداقل یک پیوند تأییدشده توسط کارشناس */
    expertConfirmedRelatedBooksCount: number;
    /** تعداد نام‌های متمایز نرمال‌شده دارای ارتباط ثبت‌شده (بدون ادعای یکتا بودن قطعی اشخاص هم‌نام) */
    distinctLinkedMartyrNamesCount: number;
    /** تعداد شهدای یکتای احرازشده در پیوندها */
    confirmedUniqueLinkedMartyrsCount: number;
    /** تعداد کل ردیف‌های ارتباط فعال غیرردشده */
    activeRelationRowsCount: number;
    /** خلاصه پایگاه رسمی گلزار در صورت بارگذاری */
    officialBankNamedMartyrsCount: number;
  };
  /** ۲) کارت دوم داشبورد آینده: کل کتاب‌ها */
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
  /** ۳) کارت سوم داشبورد آینده: وضعیت بررسی کتاب‌ها */
  bookReviewStatusKpi: {
    title: 'وضعیت بررسی کتاب‌ها';
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
