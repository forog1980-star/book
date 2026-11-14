import type {
  AuditLogEntry,
  ExtractedContentItem,
  FieldAuditRecord,
  PendingReviewItem,
} from '../../../data/markazAsnadData';
import {
  classifyAuditLogDomain,
  classifyPendingReviewStatus,
  classifyWorkTopicDomain,
  compactPersian,
  isDraftLabelOrStatus,
  isPlaceholderOrGroupMartyrPhrase,
  normalizePersian,
  normalizeVersionedOutputIdentity,
  splitCompoundIssueSubjects,
  stripMartyrHonorifics,
} from '../normalization';
import type {
  ActivityDomainKey,
  DashboardBookListItem,
  DashboardDrilldownKey,
  DashboardMartyrListItem,
  DashboardRelationListItem,
  DrilldownContextMeta,
  ExecutiveDashboardInputs,
  ExecutiveExportHistoryRecord,
  FinalizedReportRegistryRecord,
  GolzarRawMartyrInput,
  RelationCertaintyBucket,
} from '../types';
import type { ExecutiveEntityProjection } from './entityDossiersSelector';
import {
  classifySingleLinkSourceAndExpertBucket,
  type RelationSourceOrExpertKey,
} from './relationAnalyticsSelector';

const PRIORITY_ORDER: Record<RelationCertaintyBucket, number> = {
  confirmedByExpert: 5,
  probable: 4,
  needsReview: 3,
  undetermined: 2,
  rejected: 1,
};

const SOURCE_EXPERT_PRIORITY: Record<RelationSourceOrExpertKey, number> = {
  explicitExpertConfirmed: 6,
  definiteBySourceLabel: 5,
  probable: 4,
  needsReview: 3,
  undetermined: 2,
  rejected: 1,
};

export interface DrilldownRelationRow {
  relation: DashboardRelationListItem;
  sourceExpertBucket?: RelationSourceOrExpertKey;
  bookItem?: DashboardBookListItem;
  martyrItem?: DashboardMartyrListItem;
}

export interface DrilldownWorkRow {
  item: PendingReviewItem;
  isCompleted: boolean;
  activityTypeLabel: string;
  bookItem?: DashboardBookListItem;
  martyrItem?: DashboardMartyrListItem;
  relatedAuditLog?: AuditLogEntry;
}

export interface DrilldownResearchOutputRow {
  item: ExtractedContentItem;
  bookItem?: DashboardBookListItem;
  martyrItem?: DashboardMartyrListItem;
}

export interface DrilldownActivityLogRow {
  entry: AuditLogEntry;
  domain: ActivityDomainKey;
  domainLabel: string;
}

export interface DrilldownBankMartyrRow {
  id: string;
  fullName: string;
  fatherName: string;
  graveAddress: string;
  sourceLabel: string;
  isLinkedToBook: boolean;
}

export type DrilldownSelectionResult =
  | {
      kind: 'books';
      meta: DrilldownContextMeta;
      items: DashboardBookListItem[];
      emptyReason: string;
    }
  | {
      kind: 'martyrs';
      meta: DrilldownContextMeta;
      items: DashboardMartyrListItem[];
      emptyReason: string;
    }
  | {
      kind: 'bank_martyrs';
      meta: DrilldownContextMeta;
      items: DrilldownBankMartyrRow[];
      emptyReason: string;
    }
  | {
      kind: 'relations';
      meta: DrilldownContextMeta;
      items: DrilldownRelationRow[];
      emptyReason: string;
    }
  | {
      kind: 'work';
      meta: DrilldownContextMeta;
      items: DrilldownWorkRow[];
      emptyReason: string;
    }
  | {
      kind: 'activity_logs';
      meta: DrilldownContextMeta;
      items: DrilldownActivityLogRow[];
      emptyReason: string;
    }
  | {
      kind: 'research_outputs';
      meta: DrilldownContextMeta;
      items: DrilldownResearchOutputRow[];
      emptyReason: string;
    }
  | {
      kind: 'management_reports';
      meta: DrilldownContextMeta;
      items: ExecutiveExportHistoryRecord[];
      emptyReason: string;
    }
  | {
      kind: 'finalized_reports';
      meta: DrilldownContextMeta;
      items: FinalizedReportRegistryRecord[];
      emptyReason: string;
    };

export const DRILLDOWN_META_MAP: Record<DashboardDrilldownKey, DrilldownContextMeta> = {
  library_all: {
    key: 'library_all',
    title: 'کل کتاب‌های تحت پایش کتابخانه',
    sourceCardLabel: 'کتابخانه',
    subtitle: 'فهرست کامل کتاب‌های فهرست مرجع و کتاب‌های ثبت‌شده خارج از فهرست اولیه',
    dataSourceNote: 'منبع: catalogRows و رکوردهای خارج از فهرست در auditRecords',
  },
  library_completed: {
    key: 'library_completed',
    title: 'کتاب‌های تکمیل‌شده (معیار سخت‌گیرانه)',
    sourceCardLabel: 'کتابخانه',
    subtitle: 'کتاب‌هایی که اطلاعات، وضعیت فیزیکی، تعیین‌تکلیف ارتباط با شهید و بسته‌شدن تیکت‌های باز آن‌ها کامل شده است',
    dataSourceNote: 'منبع: معیار کامل تکمیل بدون تیکت باز کتاب یا ارتباط',
  },
  library_remaining: {
    key: 'library_remaining',
    title: 'کتاب‌های در حال بررسی و شروع‌نشده',
    sourceCardLabel: 'کتابخانه',
    subtitle: 'کتاب‌هایی که هنوز به تکمیل کامل نرسیده‌اند (شامل در حال بررسی و شروع‌نشده)',
    dataSourceNote: 'منبع: متمم دقیق کتاب‌های تکمیل‌شده روی کل مخزن تحت پایش',
  },
  library_in_progress: {
    key: 'library_in_progress',
    title: 'کتاب‌های در حال بررسی',
    sourceCardLabel: 'کتابخانه',
    subtitle: 'کتاب‌هایی که ثبت قفسه، کار میدانی، وضعیت پایه یا تیکت باز دارند اما هنوز تکمیل نهایی نشده‌اند',
    dataSourceNote: 'منبع: auditRecords، copyRecords، تیکت‌های باز کتاب و بررسی پایه کاتالوگ',
  },
  library_not_started: {
    key: 'library_not_started',
    title: 'کتاب‌های شروع‌نشده',
    sourceCardLabel: 'کتابخانه',
    subtitle: 'کتاب‌هایی که هنوز هیچ بررسی میدانی، نسخه فیزیکی یا تیکت بازی برای آن‌ها ثبت نشده است',
    dataSourceNote: 'منبع: ردیف‌های دست‌نخورده کاتالوگ بدون رکورد ممیزی یا نسخه فیزیکی',
  },
  library_worked: {
    key: 'library_worked',
    title: 'کتاب‌های کارشده / دارای ثبت فعالیت',
    sourceCardLabel: 'کتابخانه',
    subtitle: 'کتاب‌هایی که حداقل یک ثبت ممیزی، نسخه فیزیکی یا وضعیت بررسی پایه دارند (به‌تنهایی معادل تکمیل‌شده نیست)',
    dataSourceNote: 'منبع: auditRecords، bookCopies و وضعیت اولیه کاتالوگ',
  },
  library_unworked: {
    key: 'library_unworked',
    title: 'کتاب‌های کارنشده (فاقد هرگونه ثبت)',
    sourceCardLabel: 'کتابخانه',
    subtitle: 'کتاب‌هایی که هنوز هیچ اقدام میدانی یا ثبت قفسه برای آن‌ها انجام نشده است',
    dataSourceNote: 'منبع: ردیف‌های فاقد ممیزی و فاقد نسخه فیزیکی ثبت‌شده',
  },
  library_shelf_verified: {
    key: 'library_shelf_verified',
    title: 'کتاب‌های دارای تأیید موجودی قفسه',
    sourceCardLabel: 'کتابخانه',
    subtitle: 'کتاب‌هایی که موجودی فیزیکی آن‌ها در قفسه به‌صورت تأییدشده ثبت شده است',
    dataSourceNote: 'منبع: auditRecords.physical === verified یا bookCopies با وضعیت verified_present',
  },
  library_expert_approved: {
    key: 'library_expert_approved',
    title: 'کتاب‌های تأییدشده کارشناسی',
    sourceCardLabel: 'کتابخانه',
    subtitle: 'کتاب‌هایی که به تأیید صریح کارشناس کتابخانه رسیده‌اند',
    dataSourceNote: 'منبع: auditRecords.expertApproved === true',
  },
  library_awaiting_expert: {
    key: 'library_awaiting_expert',
    title: 'کتاب‌های در انتظار تأیید کارشناسی',
    sourceCardLabel: 'کتابخانه',
    subtitle: 'کتاب‌های دارای فعالیت یا ثبت اولیه که هنوز تأیید صریح کارشناس را دریافت نکرده‌اند',
    dataSourceNote: 'منبع: کتاب‌های کارشده بدون پرچم expertApproved',
  },
  library_open_duplicate_ticket: {
    key: 'library_open_duplicate_ticket',
    title: 'کتاب‌های دارای تیکت باز تکرار عنوان',
    sourceCardLabel: 'کتابخانه',
    subtitle: 'کتاب‌هایی که پرونده باز در صف پیگیری فهرست کتاب‌ها (مانند PV-0558 تا PV-0567) دارند',
    dataSourceNote: 'منبع: تیکت‌های باز شیت فهرست کتاب‌ها در pendingReviews',
  },
  library_with_martyr_link: {
    key: 'library_with_martyr_link',
    title: 'کتاب‌های دارای ارتباط ثبت‌شده با شهید',
    sourceCardLabel: 'کتابخانه',
    subtitle: 'کتاب‌هایی که حداقل یک ارتباط غیرردشده (شهید نام‌دار یا گروهی) برای آن‌ها ثبت شده است',
    dataSourceNote: 'منبع: جدول links و auditRecords.relatedMartyrs',
  },
  library_without_martyr_link: {
    key: 'library_without_martyr_link',
    title: 'کتاب‌های فاقد ارتباط ثبت‌شده با شهید',
    sourceCardLabel: 'کتابخانه',
    subtitle: 'کتاب‌هایی که در حال حاضر هیچ ارتباط ثبت‌شده‌ای با شهید ندارند (متفاوت از بررسی‌شده بدون ارتباط)',
    dataSourceNote: 'منبع: کتاب‌های بدون پیوند فعال در جدول ارتباط و ممیزی',
  },
  library_reviewed_no_martyr: {
    key: 'library_reviewed_no_martyr',
    title: 'کتاب‌های بررسی‌شده و فاقد ارتباط با شهید',
    sourceCardLabel: 'کتابخانه',
    subtitle: 'کتاب‌هایی که بررسی کامل آن‌ها انجام شده و نبود ارتباط با شهید در آن‌ها تعیین‌تکلیف شده است',
    dataSourceNote: 'منبع: کتاب‌های تکمیل‌شده با تعیین‌تکلیف صریح «ارتباطی یافت نشد» یا بدون پیوند',
  },
  martyrs_linked_all: {
    key: 'martyrs_linked_all',
    title: 'شهدای مرتبط با کتاب‌ها',
    sourceCardLabel: 'شهدا',
    subtitle: 'فهرست کامل شهدای نام‌دار مرتبط با کتاب‌های مرکز اسناد (بدون ادغام خودکار هم‌نام‌ها)',
    dataSourceNote: 'منبع: links غیرردشده و auditRecords.relatedMartyrs',
  },
  martyrs_confirmed: {
    key: 'martyrs_confirmed',
    title: 'شهدای دارای هویت احرازشده',
    sourceCardLabel: 'شهدا',
    subtitle: 'شهدای مرتبطی که هویت و مشخصات آن‌ها بدون تعارض هم‌نامی احراز شده است',
    dataSourceNote: 'منبع: پیوندهای شهدا تطبیق‌داده‌شده با بانک گلزار و پرونده‌های دستی',
  },
  martyrs_needs_verification: {
    key: 'martyrs_needs_verification',
    title: 'شهدای نیازمند بررسی هویت',
    sourceCardLabel: 'شهدا',
    subtitle: 'شهدای مرتبطی که فاقد مختصات قطعی مزار یا دارای هم‌نامی مشکوک هستند',
    dataSourceNote: 'منبع: پیوندهای فاقد احراز قطعی یا دارای هشدار هم‌نامی/اختلاف مزار',
  },
  martyrs_official_unique_all: {
    key: 'martyrs_official_unique_all',
    title: 'کل شناسه‌های یکتای شهید در بانک رسمی و دستی',
    sourceCardLabel: 'شهدا',
    subtitle: 'نمای فهرست رکوردهای شهید نام‌دار در بانک رسمی گلزار تهران و پرونده‌های دستی غیرتکراری',
    dataSourceNote: 'منبع: golzar_martyrs.xlsx (پس از کسر گمنام/اموات) و customMartyrs',
  },
  martyrs_unlinked_bank: {
    key: 'martyrs_unlinked_bank',
    title: 'شهدای بدون ارتباط با کتاب',
    sourceCardLabel: 'شهدا',
    subtitle: 'شهدای بانک رسمی/دستی که تاکنون در هیچ پیوندی به کتاب‌های کتابخانه متصل نشده‌اند',
    dataSourceNote: 'منبع: بانک گلزار شهدا و پرونده‌های دستی customMartyrs فاقد پیوند در links',
  },
  martyrs_tehran: {
    key: 'martyrs_tehran',
    title: 'شهدای مرتبط تهرانی (بهشت زهرا / تهران)',
    sourceCardLabel: 'شهدا',
    subtitle: 'شهدای مرتبط دارای مختصات قطعی قطعه/ردیف/شماره یا تطبیق یکتا در بانک گلزار تهران',
    dataSourceNote: 'منبع: ارزیابی سخت‌گیرانه وضعیت تهران روی مزار و بانک گلزار',
  },
  martyrs_non_tehran: {
    key: 'martyrs_non_tehran',
    title: 'شهدای مرتبط غیرتهرانی / یادبود',
    sourceCardLabel: 'شهدا',
    subtitle: 'شهدای مرتبطی که صراحتاً با برچسب غیرتهرانی، خارج از تهران یا یادبود ثبت شده‌اند',
    dataSourceNote: 'منبع: یادداشت مزار، customMartyrs.graveSource و outside_golzar_martyrs',
  },
  martyrs_unreviewed: {
    key: 'martyrs_unreviewed',
    title: 'شهدای بررسی‌نشده (فاقد تأیید کارشناسی هویت یا رابطه)',
    sourceCardLabel: 'شهدا',
    subtitle: 'شهدای مرتبطی که هنوز به تأیید کارشناسی هویت یا ارتباط با کتاب نرسیده‌اند',
    dataSourceNote: 'منبع: وضعیت کارشناسی رابطه و customMartyrs.identityVerificationStatus',
  },
  martyrs_homonym_suspects: {
    key: 'martyrs_homonym_suspects',
    title: 'شهدای هم‌نام مشکوک (نیازمند تفکیک بدون ادغام خودکار)',
    sourceCardLabel: 'شهدا',
    subtitle: 'شهدای مرتبطی که در بانک ۲۸٬۳۶۸ شهید بیش از یک همنام دارند یا مختصات مزار متفاوتی برای آن‌ها ثبت شده است',
    dataSourceNote: 'منبع: کنترل هم‌نامی نام+نام پدر و هشدارهای کارشناسی مزار',
  },
  martyrs_single_book: {
    key: 'martyrs_single_book',
    title: 'شهدای دارای تک‌ارتباط با کتاب',
    sourceCardLabel: 'شهدا',
    subtitle: 'شهدای مرتبطی که تاکنون فقط به یک کتاب یکتا در کتابخانه متصل شده‌اند',
    dataSourceNote: 'منبع: تجمیع کتاب‌های یکتا به ازای هر شهید مرتبط',
  },
  martyrs_multi_book: {
    key: 'martyrs_multi_book',
    title: 'شهدای دارای چند ارتباط با کتاب',
    sourceCardLabel: 'شهدا',
    subtitle: 'شهدای مرتبطی که نام آن‌ها در بیش از یک کتاب مجزا ثبت شده است',
    dataSourceNote: 'منبع: تجمیع کتاب‌های یکتا به ازای هر شهید مرتبط',
  },
  relations_active_all: {
    key: 'relations_active_all',
    title: 'کل ارتباط‌های فعال کتاب و شهید (زوج متمایز)',
    sourceCardLabel: 'شهدا',
    subtitle: 'همه زوج‌های فعال کتاب و شهید با حفظ تفکیک منبع، احتمالی، نیازمند بررسی و کارشناسی',
    dataSourceNote: 'منبع: جدول links غیرردشده پس از حذف تکرار زوج یکسان',
  },
  relations_definite_source: {
    key: 'relations_definite_source',
    title: 'ارتباط‌های قطعی طبق برچسب منبع (غیر از تأیید کارشناسی)',
    sourceCardLabel: 'شهدا',
    subtitle: 'روابطی که در فایل مبنا با برچسب قطعی/پژوهش اصلی یا مختصات کامل ثبت شده‌اند اما هنوز تأیید کارشناسی جدید ندارند',
    dataSourceNote: 'منبع: جدول links با وضعیت پژوهش اصلی / قطعی منبع',
  },
  relations_probable: {
    key: 'relations_probable',
    title: 'ارتباط‌های احتمالی کتاب و شهید',
    sourceCardLabel: 'شهدا',
    subtitle: 'روابطی که برچسب احتمالی یا کاندید دارند و نیازمند تثبیت نهایی هستند',
    dataSourceNote: 'منبع: جدول links با وضعیت احتمالی / تطبیق کتاب',
  },
  relations_confirmed: {
    key: 'relations_confirmed',
    title: 'ارتباط‌های دارای تأیید کارشناسی صریح',
    sourceCardLabel: 'شهدا',
    subtitle: 'روابط متمایزی که به‌طور صریح توسط کارشناس به وضعیت «تأییدشده کارشناسی» رسیده‌اند',
    dataSourceNote: 'منبع: رکوردهای links با وضعیت تأیید صریح کارشناسی (مجزا از برچسب منبع)',
  },
  relations_needs_review: {
    key: 'relations_needs_review',
    title: 'ارتباط‌های نیازمند بررسی / گروهی / در صف',
    sourceCardLabel: 'شهدا',
    subtitle: 'روابط متمایزی که دارای برچسب نیازمند بررسی، تکمیل اطلاعات یا تفکیک نام‌های گروهی هستند',
    dataSourceNote: 'منبع: جدول links در وضعیت نیازمند بررسی یا تفکیک گروهی',
  },
  relations_rejected_archive: {
    key: 'relations_rejected_archive',
    title: 'ارتباط‌ها و پیشنهادهای ردشده',
    sourceCardLabel: 'شهدا',
    subtitle: 'روابط و پیشنهادهای هوشمندی که با دلیل کارشناسی رد و بایگانی شده‌اند',
    dataSourceNote: 'منبع: links با وضعیت ردشده، smartSuggestions ردشده و rejectedSuggestionsArchive',
  },
  work_all: {
    key: 'work_all',
    title: 'کل موارد صف پیگیری (PV)',
    sourceCardLabel: 'وضعیت کار و خروجی‌ها',
    subtitle: 'فهرست کامل پرونده‌های ثبت‌شده در جدول «موارد نیازمند بررسی»',
    dataSourceNote: 'منبع: pendingReviews (شامل موضوعات ساده و چندموضوعی)',
  },
  work_completed: {
    key: 'work_completed',
    title: 'کارهای انجام‌شده در صف پیگیری',
    sourceCardLabel: 'وضعیت کار و خروجی‌ها',
    subtitle: 'موارد صف پیگیری (PV) که بررسی آن‌ها تکمیل، بسته یا با دلیل رد شده است',
    dataSourceNote: 'منبع: pendingReviews در وضعیت‌های بسته/بررسی‌شده',
  },
  work_remaining: {
    key: 'work_remaining',
    title: 'موارد باقیمانده در صف پیگیری',
    sourceCardLabel: 'وضعیت کار و خروجی‌ها',
    subtitle: 'موارد باز، در حال پیگیری یا نیازمند منبع در جدول «موارد نیازمند بررسی» (PV)',
    dataSourceNote: 'منبع: pendingReviews غیربسته',
  },
  work_in_progress: {
    key: 'work_in_progress',
    title: 'موارد باز / در حال پیگیری در صف',
    sourceCardLabel: 'وضعیت کار و خروجی‌ها',
    subtitle: 'مواردی از صف پیگیری که در وضعیت «باز» یا «در حال پیگیری» هستند (به‌جز نیازمند منبع)',
    dataSourceNote: 'منبع: pendingReviews با وضعیت open',
  },
  work_needs_source: {
    key: 'work_needs_source',
    title: 'موارد نیازمند منبع در صف پیگیری',
    sourceCardLabel: 'وضعیت کار و خروجی‌ها',
    subtitle: 'پرونده‌هایی که بررسی آن‌ها نیازمند دسترسی به متن کتاب، منبع جدید یا جلد چاپی است',
    dataSourceNote: 'منبع: pendingReviews با وضعیت نیازمند منبع',
  },
  work_closed_rejected: {
    key: 'work_closed_rejected',
    title: 'موارد بسته یا ردشده با دلیل در صف پیگیری',
    sourceCardLabel: 'وضعیت کار و خروجی‌ها',
    subtitle: 'پرونده‌های تعیین‌تکلیف‌شده صف پیگیری (بررسی‌شده، بسته یا ردشده با دلیل)',
    dataSourceNote: 'منبع: pendingReviews مختومه/بسته/ردشده',
  },
  work_domain_library: {
    key: 'work_domain_library',
    title: 'موارد صف پیگیری در حوزه کتابخانه',
    sourceCardLabel: 'وضعیت کار و خروجی‌ها',
    subtitle: 'پرونده‌های صف پیگیری مربوط به فهرست کتاب‌ها، تکرار عنوان، شابک یا قفسه',
    dataSourceNote: 'منبع: تفکیک حوزه‌ای موضوعات صف پیگیری (کتابخانه)',
  },
  work_domain_martyrs: {
    key: 'work_domain_martyrs',
    title: 'موارد صف پیگیری در حوزه شهدا',
    sourceCardLabel: 'وضعیت کار و خروجی‌ها',
    subtitle: 'پرونده‌های صف پیگیری دارای موضوع مزار، هویت یا هم‌نامی شهید',
    dataSourceNote: 'منبع: تفکیک حوزه‌ای موضوعات صف پیگیری (شهدا)',
  },
  work_domain_relations: {
    key: 'work_domain_relations',
    title: 'موارد صف پیگیری در حوزه ارتباطات',
    sourceCardLabel: 'وضعیت کار و خروجی‌ها',
    subtitle: 'پرونده‌های صف پیگیری مربوط به تطبیق ارتباط کتاب و شهید یا تفکیک عبارات گروهی',
    dataSourceNote: 'منبع: تفکیک حوزه‌ای موضوعات صف پیگیری (ارتباطات)',
  },
  activity_logs: {
    key: 'activity_logs',
    title: 'تاریخچه فعالیت‌های ثبت‌شده سامانه',
    sourceCardLabel: 'وضعیت کار و خروجی‌ها',
    subtitle: 'فهرست رخدادهای ثبت‌شده در تاریخچه فعالیت (مستقل از درصد پیشرفت صف پیگیری)',
    dataSourceNote: 'منبع: auditLog ذخیره‌شده در دستگاه',
  },
  research_outputs: {
    key: 'research_outputs',
    title: 'کل مطالب پژوهشی استخراج‌شده (غیرردشده)',
    sourceCardLabel: 'وضعیت کار و خروجی‌ها',
    subtitle: 'مطالب، خاطرات و ارجاعات صفحه استخراج‌شده از کتاب‌ها بدون موارد ردشده',
    dataSourceNote: 'منبع: extractedItems غیرردشده',
  },
  research_reviewed: {
    key: 'research_reviewed',
    title: 'موارد بررسی‌شده پژوهشی (اصلی + کارشناسی)',
    sourceCardLabel: 'وضعیت کار و خروجی‌ها',
    subtitle: 'مطالب پژوهشی که یا در پژوهش اصلی بررسی‌شده و یا به تأیید کارشناسی رسیده‌اند',
    dataSourceNote: 'منبع: extractedItems با وضعیت بررسی‌شده در پژوهش اصلی یا تأیید کارشناسی',
  },
  research_expert_approved: {
    key: 'research_expert_approved',
    title: 'خروجی‌های پژوهشی تأییدشده کارشناسی',
    sourceCardLabel: 'وضعیت کار و خروجی‌ها',
    subtitle: 'رکوردهای پژوهشی استخراج‌شده با تأیید صریح کارشناسی / نهایی',
    dataSourceNote: 'منبع: extractedItems تأییدشده کارشناسی (پیش از تجمیع نسخه‌ها)',
  },
  research_final_independent: {
    key: 'research_final_independent',
    title: 'خروجی‌های پژوهشی نهایی و مستقل',
    sourceCardLabel: 'وضعیت کار و خروجی‌ها',
    subtitle: 'محصولات پژوهشی نهایی پس از حذف پیش‌نویس‌ها و تجمیع نسخه‌های تکراری یک اثر',
    dataSourceNote: 'منبع: استخراج‌های تأییدشده کارشناسی با تجمیع عنوان نسخه',
  },
  research_drafts_incomplete: {
    key: 'research_drafts_incomplete',
    title: 'پیش‌نویس‌ها و موارد پژوهشی ناتمام / نیازمند بررسی',
    sourceCardLabel: 'وضعیت کار و خروجی‌ها',
    subtitle: 'مطالب پژوهشی خام، پیش‌نویس یا نیازمند بررسی که هنوز خروجی نهایی نشده‌اند',
    dataSourceNote: 'منبع: extractedItems در وضعیت پیش‌نویس/خام یا نیازمند بررسی',
  },
  research_rejected: {
    key: 'research_rejected',
    title: 'موارد پژوهشی ردشده',
    sourceCardLabel: 'وضعیت کار و خروجی‌ها',
    subtitle: 'مطالب استخراج‌شده‌ای که در بازبینی رد شده‌اند',
    dataSourceNote: 'منبع: extractedItems با وضعیت ردشده',
  },
  management_reports: {
    key: 'management_reports',
    title: 'گزارش‌های مدیریتی نهایی و مستقل',
    sourceCardLabel: 'وضعیت کار و خروجی‌ها',
    subtitle: 'گزارش‌های مستقل ثبت‌شده با وضعیت «نهایی» (بازتولید نسخه‌های مجدد روی یک reportId شمارش را افزایش نمی‌دهد)',
    dataSourceNote: 'منبع: دفتر کل محلی book_executive_finalized_reports_v1',
  },
  management_reports_drafts: {
    key: 'management_reports_drafts',
    title: 'پیش‌نویس گزارش‌های مدیریتی (حذف‌شده از شمارش نهایی)',
    sourceCardLabel: 'وضعیت کار و خروجی‌ها',
    subtitle: 'گزارش‌های مدیریتی در وضعیت پیش‌نویس که هنوز نهایی نشده‌اند',
    dataSourceNote: 'منبع: دفتر کل محلی book_executive_finalized_reports_v1',
  },
};

function isClosedTicketStatus(status: unknown): boolean {
  return classifyPendingReviewStatus(status) === 'resolved';
}

function buildDistinctRelationRows(
  inputs: ExecutiveDashboardInputs,
  projection: ExecutiveEntityProjection
): DrilldownRelationRow[] {
  const bookByKey = new Map(projection.books.map((b) => [b.bookKey, b]));
  const bookByTempId = new Map(projection.books.map((b) => [b.tempBookId, b]));
  const martyrByKey = new Map(projection.martyrs.map((m) => [m.martyrKey, m]));
  const rawLinksById = new Map((inputs.links || []).map((l) => [l.id, l]));
  const auditByBookId = new Map<string, FieldAuditRecord>();
  const auditByCompactTitle = new Map<string, FieldAuditRecord>();
  for (const aud of Object.values(inputs.auditRecords || {})) {
    if (aud.tempBookId) auditByBookId.set(aud.tempBookId.trim(), aud);
    const ct = compactPersian(aud.title);
    if (ct) auditByCompactTitle.set(ct, aud);
  }

  const distinctMap = new Map<
    string,
    { rel: DashboardRelationListItem; srcKey: RelationSourceOrExpertKey }
  >();

  for (const rel of projection.relations) {
    const rawLnk = rawLinksById.get(rel.linkId);
    const matchedAudit =
      (rel.tempBookId && rel.tempBookId !== '—'
        ? auditByBookId.get(rel.tempBookId.trim())
        : undefined) || auditByCompactTitle.get(compactPersian(rel.bookTitle));

    const srcKey: RelationSourceOrExpertKey = rawLnk
      ? classifySingleLinkSourceAndExpertBucket(rawLnk, matchedAudit)
      : rel.certaintyBucket === 'confirmedByExpert'
      ? 'explicitExpertConfirmed'
      : rel.certaintyBucket === 'probable'
      ? 'probable'
      : rel.certaintyBucket === 'rejected'
      ? 'rejected'
      : 'needsReview';

    const cleanBookPart =
      rel.tempBookId && rel.tempBookId !== '—'
        ? `ID::${rel.tempBookId}`
        : `TITLE::${compactPersian(rel.bookTitle)}::${compactPersian(rel.publisher)}`;
    const normMartyr = stripMartyrHonorifics(rel.martyrName);
    const targetPart =
      rel.isPlaceholderOrGroup || !normMartyr
        ? `GROUP_OR_PLACEHOLDER::${rel.linkId}`
        : `PERSON::${normMartyr}`;
    const pairKey = `${cleanBookPart}::${targetPart}`;

    const existing = distinctMap.get(pairKey);
    if (
      !existing ||
      PRIORITY_ORDER[rel.certaintyBucket] > PRIORITY_ORDER[existing.rel.certaintyBucket] ||
      SOURCE_EXPERT_PRIORITY[srcKey] > SOURCE_EXPERT_PRIORITY[existing.srcKey]
    ) {
      distinctMap.set(pairKey, {
        rel,
        srcKey:
          !existing || SOURCE_EXPERT_PRIORITY[srcKey] > SOURCE_EXPERT_PRIORITY[existing.srcKey]
            ? srcKey
            : existing.srcKey,
      });
    }
  }

  return Array.from(distinctMap.values()).map(({ rel, srcKey }) => {
    const bookItem =
      bookByKey.get(rel.bookKey) ||
      (rel.tempBookId && rel.tempBookId !== '—'
        ? bookByTempId.get(rel.tempBookId)
        : undefined);
    const martyrItem = !rel.isPlaceholderOrGroup
      ? martyrByKey.get(rel.martyrKey)
      : undefined;
    return { relation: rel, sourceExpertBucket: srcKey, bookItem, martyrItem };
  });
}

function isFinalizedResearchExtractedItem(item: ExtractedContentItem): boolean {
  if (
    isDraftLabelOrStatus(item.reviewStatus) ||
    isDraftLabelOrStatus(item.passageTitle) ||
    isDraftLabelOrStatus(item.researcherNote)
  ) {
    return false;
  }
  const st = compactPersian(item.reviewStatus);
  return (
    st === 'تاییدشدهکارشناسی' ||
    st === 'تاییدکارشناس' ||
    st === 'نهایی' ||
    st === 'تاییدنهایی' ||
    st === 'منتشرشده'
  );
}

/**
 * سلکتور یکپارچه و زنده تمام مسیرهای جزئیات داشبورد و صفحه آمار و گزارش‌های تفصیلی
 */
export function selectDrilldownData(
  key: DashboardDrilldownKey,
  inputs: ExecutiveDashboardInputs,
  projection: ExecutiveEntityProjection,
  exportHistory: ExecutiveExportHistoryRecord[] = [],
  finalizedRegistry?: FinalizedReportRegistryRecord[]
): DrilldownSelectionResult {
  const meta = DRILLDOWN_META_MAP[key];

  // ۱. مسیرهای بخش کتابخانه (۱۴ کلید منطبق ۱:۱ با DetailedBreakdown و کارت ۱)
  if (key.startsWith('library_')) {
    let items: DashboardBookListItem[] = projection.books;
    let emptyReason = 'اطلاعات جزئیات در دسترس نیست.';

    switch (key) {
      case 'library_all':
        items = projection.books;
        emptyReason = 'هیچ کتابی در مخزن بارگذاری نشده است.';
        break;
      case 'library_completed':
        items = projection.books.filter((b) => b.isStrictCompleted);
        emptyReason =
          'هنوز کتابی با تکمیل هم‌زمان مشخصات، وضعیت فیزیکی، تعیین‌تکلیف ارتباط با شهید و نبود تیکت باز ثبت نشده است.';
        break;
      case 'library_remaining':
        items = projection.books.filter((b) => !b.isStrictCompleted);
        emptyReason = 'همه کتاب‌های پایش‌شده به تکمیل نهایی رسیده‌اند.';
        break;
      case 'library_in_progress':
        items = projection.books.filter((b) => b.lifecycleStage === 'in_progress');
        emptyReason = 'کتابی در وضعیت در حال بررسی وجود ندارد.';
        break;
      case 'library_not_started':
        items = projection.books.filter((b) => b.lifecycleStage === 'not_started');
        emptyReason = 'همه کتاب‌ها دست‌کم یک مرحله بررسی یا ثبت دارند.';
        break;
      case 'library_worked':
        items = projection.books.filter((b) => b.isWorkedOrRegistered);
        emptyReason = 'هنوز هیچ کتابی ثبت ممیزی، قفسه یا بررسی اولیه ندارد.';
        break;
      case 'library_unworked':
        items = projection.books.filter((b) => !b.isWorkedOrRegistered);
        emptyReason = 'تمام کتاب‌های مخزن دست‌کم یک ثبت فعالیت دارند.';
        break;
      case 'library_shelf_verified':
        items = projection.books.filter((b) => b.isShelfVerifiedPresent);
        emptyReason = 'کتابی با وضعیت تأیید موجودی قفسه یافت نشد.';
        break;
      case 'library_expert_approved':
        items = projection.books.filter((b) => b.isExpertApproved);
        emptyReason = 'هنوز کتابی به تأیید صریح کارشناسی نرسیده است.';
        break;
      case 'library_awaiting_expert':
        items = projection.books.filter(
          (b) =>
            b.isWorkedOrRegistered &&
            !b.isExpertApproved &&
            b.physicalStatusRaw !== 'not_found'
        );
        emptyReason = 'کتابی در انتظار تأیید کارشناسی نیست.';
        break;
      case 'library_open_duplicate_ticket':
        items = projection.books.filter((b) => b.openTicketIds.length > 0);
        emptyReason = 'تیکت باز تکرار عنوان برای کتاب‌ها وجود ندارد.';
        break;
      case 'library_with_martyr_link':
        items = projection.books.filter((b) => b.hasActiveLink);
        emptyReason = 'کتابی با ارتباط ثبت‌شده با شهید یافت نشد.';
        break;
      case 'library_without_martyr_link':
        items = projection.books.filter((b) => !b.hasActiveLink);
        emptyReason = 'همه کتاب‌ها دارای ارتباط ثبت‌شده با شهید هستند.';
        break;
      case 'library_reviewed_no_martyr':
        items = projection.books.filter((b) => !b.hasActiveLink && b.isStrictCompleted);
        emptyReason = 'هنوز کتابی با تعیین‌تکلیف قطعی «بررسی‌شده و فاقد ارتباط با شهید» ثبت نشده است.';
        break;
    }

    return { kind: 'books', meta, items, emptyReason };
  }

  // ۲. مسیرهای بانک رسمی / شهدای بدون ارتباط (bank_martyrs)
  if (key === 'martyrs_official_unique_all' || key === 'martyrs_unlinked_bank') {
    const golzar = inputs.golzarRecords || [];
    const custom = inputs.customMartyrs || [];
    const linkedNormSet = new Set(
      projection.martyrs
        .filter((m) => m.linkedBooksCount > 0)
        .map((m) => m.normalizedName)
        .filter(Boolean)
    );
    const definiteBankIds = new Set(
      projection.summary.martyrs.customMartyrs.matches
        .filter((m) => m.matchCertainty === 'definite' && m.matchedGolzarId)
        .map((m) => m.matchedGolzarId!)
    );

    const rows: DrilldownBankMartyrRow[] = [];
    const seenKeys = new Set<string>();

    for (let i = 0; i < golzar.length; i += 1) {
      const g: GolzarRawMartyrInput = golzar[i];
      const fullName = `${g.firstName || ''} ${g.lastName || ''}`.trim();
      const normFull = stripMartyrHonorifics(fullName);
      if (!normFull || /شهید\s*گمنام/.test(normFull) || normFull === 'اموات') continue;
      const graveAddress = [g.gravePiece, g.graveRow, g.graveNumber]
        .map((x) => String(x || '').trim())
        .filter(Boolean)
        .join(' / ');
      const dedupKey = graveAddress
        ? `${normFull}::${normalizePersian(g.fatherName)}::${graveAddress}`
        : g.id || `ROW::${i}`;
      if (seenKeys.has(dedupKey)) continue;
      seenKeys.add(dedupKey);

      const isLinked =
        linkedNormSet.has(normFull) || Boolean(g.id && definiteBankIds.has(g.id));
      if (key === 'martyrs_unlinked_bank' && isLinked) continue;

      rows.push({
        id: g.id || `GLZ-${i + 1}`,
        fullName: fullName || 'بدون نام',
        fatherName: g.fatherName || '—',
        graveAddress: graveAddress || 'نامشخص',
        sourceLabel:
          g.source === 'outside' || g.source === 'outside_golzar_martyrs'
            ? 'فهرست خارج از گلزار'
            : 'بانک رسمی گلزار تهران',
        isLinkedToBook: isLinked,
      });
    }

    for (const cm of custom) {
      const cMatch = projection.summary.martyrs.customMartyrs.matches.find(
        (m) => m.customMartyrId === cm.martyrId
      );
      if (golzar.length > 0 && cMatch?.matchCertainty === 'definite') continue;
      const norm = stripMartyrHonorifics(cm.fullName);
      const isLinked = Boolean(norm && linkedNormSet.has(norm));
      if (key === 'martyrs_unlinked_bank' && isLinked) continue;
      const graveAddress = [cm.gravePiece, cm.graveRow, cm.graveNumber]
        .map((x) => String(x || '').trim())
        .filter(Boolean)
        .join(' / ');
      rows.push({
        id: cm.martyrId,
        fullName: cm.fullName,
        fatherName: '—',
        graveAddress: graveAddress || 'ثبت‌نشده',
        sourceLabel: 'پرونده دستی مرکز اسناد',
        isLinkedToBook: isLinked,
      });
    }

    return {
      kind: 'bank_martyrs',
      meta,
      items: rows,
      emptyReason:
        golzar.length === 0
          ? 'بانک رسمی ۲۸٬۳۶۸ شهید گلزار تهران هنوز بارگذاری نشده است؛ برای مشاهده فهرست کامل، بانک گلزار را بارگذاری کنید.'
          : 'موردی در این دسته یافت نشد.',
    };
  }

  // ۳. مسیرهای شهدای مرتبط (martyrs)
  if (key.startsWith('martyrs_')) {
    const linkedMartyrs = projection.martyrs.filter((m) => m.linkedBooksCount > 0);
    const verifiedCustomNorms = new Set(
      (inputs.customMartyrs || [])
        .filter((cm) => normalizePersian(cm.identityVerificationStatus) === 'تاییدشده')
        .map((cm) => stripMartyrHonorifics(cm.fullName))
        .filter(Boolean)
    );

    let items: DashboardMartyrListItem[] = linkedMartyrs;
    let emptyReason = 'موردی برای نمایش یافت نشد.';

    switch (key) {
      case 'martyrs_linked_all':
        items = linkedMartyrs;
        emptyReason = 'هنوز شهید مرتبطی با کتاب‌ها ثبت نشده است.';
        break;
      case 'martyrs_confirmed':
        items = linkedMartyrs.filter((m) => m.identityStatus === 'confirmed');
        emptyReason = 'شهید مرتبطی در وضعیت هویت احرازشده یافت نشد.';
        break;
      case 'martyrs_needs_verification':
        items = linkedMartyrs.filter((m) => m.identityStatus === 'needs_verification');
        emptyReason = 'همه شهدای مرتبط احراز هویت شده‌اند.';
        break;
      case 'martyrs_tehran':
        items = linkedMartyrs.filter((m) => m.tehranStatus === 'tehran');
        emptyReason = 'شهید مرتبطی با احراز قطعی تهران یافت نشد.';
        break;
      case 'martyrs_non_tehran':
        items = linkedMartyrs.filter((m) => m.tehranStatus === 'non_tehran');
        emptyReason = 'شهید مرتبطی با برچسب غیرتهرانی یا یادبود ثبت نشده است.';
        break;
      case 'martyrs_unreviewed':
        items = linkedMartyrs.filter(
          (m) =>
            !m.hasExpertConfirmedRelation &&
            !verifiedCustomNorms.has(m.normalizedName)
        );
        emptyReason = 'همه شهدای مرتبط دست‌کم یک تأیید کارشناسی دریافت کرده‌اند.';
        break;
      case 'martyrs_homonym_suspects':
        items = linkedMartyrs.filter(
          (m) =>
            m.homonymCountInBank > 1 ||
            m.discrepancyWarnings.some((w) => w.kind === 'grave_coordinate_mismatch')
        );
        emptyReason = 'شهید هم‌نام مشکوکی یافت نشد.';
        break;
      case 'martyrs_single_book':
        items = linkedMartyrs.filter(
          (m) => new Set(m.linkedBooks.map((lb) => lb.bookKey)).size <= 1
        );
        emptyReason = 'شهیدی با تک‌ارتباط کتاب یافت نشد.';
        break;
      case 'martyrs_multi_book':
        items = linkedMartyrs.filter(
          (m) => new Set(m.linkedBooks.map((lb) => lb.bookKey)).size > 1
        );
        emptyReason = 'شهیدی با چند ارتباط کتاب یافت نشد.';
        break;
    }

    return { kind: 'martyrs', meta, items, emptyReason };
  }

  // ۴. مسیرهای ارتباطات کتاب و شهید (relations)
  if (key.startsWith('relations_')) {
    const distinctRows = buildDistinctRelationRows(inputs, projection);
    let items: DrilldownRelationRow[] = [];
    let emptyReason = 'موردی در این دسته از ارتباطات یافت نشد.';

    switch (key) {
      case 'relations_active_all':
        items = distinctRows.filter((r) => r.relation.certaintyBucket !== 'rejected');
        emptyReason = 'هیچ ارتباط فعالی بین کتاب‌ها و شهدا ثبت نشده است.';
        break;
      case 'relations_definite_source':
        items = distinctRows.filter(
          (r) => r.sourceExpertBucket === 'definiteBySourceLabel'
        );
        emptyReason = 'ارتباط قطعی طبق برچسب منبع یافت نشد.';
        break;
      case 'relations_probable':
        items = distinctRows.filter((r) => r.sourceExpertBucket === 'probable');
        emptyReason = 'ارتباط احتمالی یافت نشد.';
        break;
      case 'relations_confirmed':
        items = distinctRows.filter(
          (r) => r.sourceExpertBucket === 'explicitExpertConfirmed'
        );
        emptyReason = 'هنوز هیچ ارتباط کتاب و شهیدی به تأیید صریح کارشناسی نرسیده است.';
        break;
      case 'relations_needs_review':
        items = distinctRows.filter((r) => r.sourceExpertBucket === 'needsReview');
        emptyReason = 'هیچ ارتباط نیازمند بررسی کارشناسی یافت نشد.';
        break;
      case 'relations_rejected_archive': {
        const rejectedDistinct = distinctRows.filter(
          (r) => r.relation.certaintyBucket === 'rejected'
        );
        const archivedItems: DrilldownRelationRow[] = (
          inputs.rejectedSuggestionsArchive || []
        ).map((rej, idx) => ({
          relation: {
            linkId: rej.id || `REJ-${idx + 1}`,
            bookKey: rej.matchedCatalogBookId || `REJ-BK-${idx + 1}`,
            tempBookId: rej.matchedCatalogBookId || '—',
            bookTitle: rej.bookTitle || 'پیشنهاد ردشده',
            publisher: '',
            martyrKey: rej.martyrId || `REJ-MR-${idx + 1}`,
            martyrDisplayCode: rej.martyrId || '—',
            martyrName: rej.martyrName || 'نامشخص',
            graveAddress: '',
            tehranStatus: 'unknown',
            pageReferenceRaw: '',
            sourceDescriptionRaw: rej.reason || rej.reviewerNote || 'ردشده در بازبینی کارشناسی',
            reviewerNote: rej.reviewerNote || '',
            certaintyBucket: 'rejected',
            certaintyLabel: 'ردشده با دلیل',
            reviewStatus: rej.reviewStatus || 'ردشده',
            isPlaceholderOrGroup: false,
            sourceFile: 'بایگانی پیشنهادهای ردشده',
            sourceSheet: '',
            sourceExcelRow: '',
            extractedTexts: [],
          },
        }));
        const rejectedSmart: DrilldownRelationRow[] = (inputs.smartSuggestions || [])
          .filter((s) => normalizePersian(s.reviewStatus).includes('رد'))
          .map((s) => ({
            relation: {
              linkId: s.id,
              bookKey: s.matchedCatalogBookId || s.id,
              tempBookId: s.matchedCatalogBookId || '—',
              bookTitle: s.bookTitle || 'پیشنهاد هوشمند ردشده',
              publisher: s.publisher || '',
              martyrKey: s.martyrId,
              martyrDisplayCode: s.martyrId,
              martyrName: s.martyrName,
              graveAddress: '',
              tehranStatus: 'unknown',
              pageReferenceRaw: '',
              sourceDescriptionRaw: s.matchEvidence || s.reviewerNote || 'پیشنهاد ردشده',
              reviewerNote: s.reviewerNote || '',
              certaintyBucket: 'rejected',
              certaintyLabel: 'ردشده با دلیل',
              reviewStatus: s.reviewStatus,
              isPlaceholderOrGroup: false,
              sourceFile: 'پیشنهادهای هوشمند',
              sourceSheet: '',
              sourceExcelRow: '',
              extractedTexts: [],
            },
          }));
        items = [...rejectedDistinct, ...archivedItems, ...rejectedSmart];
        emptyReason = 'هیچ ارتباط یا پیشنهاد ردشده‌ای ثبت نشده است.';
        break;
      }
    }

    return { kind: 'relations', meta, items, emptyReason };
  }

  // ساخت نقشه‌های تطبیق کتاب و شهید برای صف پیگیری و پژوهش
  const bookByKey = new Map(projection.books.map((b) => [b.bookKey, b]));
  const bookByTempId = new Map(projection.books.map((b) => [b.tempBookId, b]));
  const bookByCompactTitle = new Map<string, DashboardBookListItem>();
  for (const b of projection.books) {
    const ct = compactPersian(b.title);
    if (ct && !bookByCompactTitle.has(ct)) {
      bookByCompactTitle.set(ct, b);
    }
  }
  const martyrByKey = new Map(projection.martyrs.map((m) => [m.martyrKey, m]));
  const martyrByNormName = new Map<string, DashboardMartyrListItem>();
  for (const m of projection.martyrs) {
    if (m.normalizedName && !martyrByNormName.has(m.normalizedName)) {
      martyrByNormName.set(m.normalizedName, m);
    }
  }
  const relationByLinkId = new Map(projection.relations.map((r) => [r.linkId, r]));

  // ۵. مسیرهای صف پیگیری (work_*)
  if (key.startsWith('work_')) {
    const pendingReviews = inputs.pendingReviews || [];
    const auditLogs = inputs.auditLogs || [];
    const rows: DrilldownWorkRow[] = [];

    for (const pv of pendingReviews) {
      const statusKind = classifyPendingReviewStatus(pv.trackingStatus);
      const closed = isClosedTicketStatus(pv.trackingStatus);
      const topics = splitCompoundIssueSubjects(pv.issueSubject);
      const domains = topics.map((t) =>
        classifyWorkTopicDomain(pv.mainSheet, t, pv.mainRecordId)
      );

      let matchesFilter = true;
      switch (key) {
        case 'work_all':
          matchesFilter = true;
          break;
        case 'work_completed':
          matchesFilter = closed;
          break;
        case 'work_remaining':
          matchesFilter = !closed;
          break;
        case 'work_in_progress':
          matchesFilter = statusKind === 'open';
          break;
        case 'work_needs_source':
          matchesFilter = statusKind === 'needs_source';
          break;
        case 'work_closed_rejected': {
          const comp = compactPersian(pv.trackingStatus);
          matchesFilter = closed || comp.includes('بسته') || comp.includes('رد');
          break;
        }
        case 'work_domain_library':
          matchesFilter = domains.includes('library');
          break;
        case 'work_domain_martyrs':
          matchesFilter = domains.includes('martyrs');
          break;
        case 'work_domain_relations':
          matchesFilter = domains.includes('relations');
          break;
      }

      if (!matchesFilter) continue;

      const recId = (pv.mainRecordId || '').trim();
      const linkedRel = recId ? relationByLinkId.get(recId) : undefined;
      const bookItem =
        (recId ? bookByTempId.get(recId) : undefined) ||
        (linkedRel
          ? bookByKey.get(linkedRel.bookKey) || bookByTempId.get(linkedRel.tempBookId)
          : undefined) ||
        (pv.bookTitle ? bookByCompactTitle.get(compactPersian(pv.bookTitle)) : undefined);

      let martyrItem: DashboardMartyrListItem | undefined;
      if (linkedRel && !linkedRel.isPlaceholderOrGroup) {
        martyrItem = martyrByKey.get(linkedRel.martyrKey);
      } else if (
        pv.nameOrPhrase &&
        !isPlaceholderOrGroupMartyrPhrase(pv.nameOrPhrase, false)
      ) {
        const cleanName = stripMartyrHonorifics(pv.nameOrPhrase);
        if (cleanName) martyrItem = martyrByNormName.get(cleanName);
      }

      const relatedAuditLog = auditLogs.find((log) => {
        const tid = log.targetId || '';
        return (
          (pv.trackingId && tid.includes(pv.trackingId)) ||
          (recId && tid.includes(recId)) ||
          (bookItem?.tempBookId && tid.includes(bookItem.tempBookId))
        );
      });

      const activityTypeLabel =
        pv.mainSheet === 'فهرست کتاب‌ها'
          ? 'تعیین‌تکلیف پرونده کتاب'
          : pv.mainSheet === 'ارتباط کتاب و شهید'
          ? 'بررسی ارتباط کتاب و شهید'
          : pv.mainSheet || 'پیگیری کارشناسی';

      rows.push({
        item: pv,
        isCompleted: closed,
        activityTypeLabel,
        bookItem,
        martyrItem,
        relatedAuditLog,
      });
    }

    return {
      kind: 'work',
      meta,
      items: rows,
      emptyReason:
        key === 'work_completed' || key === 'work_closed_rejected'
          ? 'هنوز هیچ موردی در صف پیگیری به وضعیت «بررسی‌شده/بسته» نرسیده است.'
          : 'هیچ موردی در این فیلتر از صف پیگیری وجود ندارد.',
    };
  }

  // ۶. تاریخچه فعالیت‌ها (activity_logs)
  if (key === 'activity_logs') {
    const logs = (inputs.auditLogs || []).map((entry) => {
      const dom = classifyAuditLogDomain(entry);
      return {
        entry,
        domain: dom.domain,
        domainLabel: dom.label,
      };
    });
    return {
      kind: 'activity_logs',
      meta,
      items: logs,
      emptyReason: 'هنوز هیچ رخدادی در تاریخچه فعالیت این دستگاه ثبت نشده است.',
    };
  }

  // ۷. خروجی‌های پژوهشی (research_*)
  if (key.startsWith('research_')) {
    const allExtracted = inputs.extractedItems || [];
    let selectedItems: ExtractedContentItem[] = [];

    switch (key) {
      case 'research_outputs':
        selectedItems = allExtracted.filter(
          (ex) => !normalizePersian(ex.reviewStatus).includes('رد')
        );
        break;
      case 'research_reviewed':
        selectedItems = allExtracted.filter((ex) => {
          const comp = compactPersian(ex.reviewStatus);
          return (
            !comp.includes('رد') &&
            (isFinalizedResearchExtractedItem(ex) || comp === 'بررسیشدهدرپژوهشاصلی')
          );
        });
        break;
      case 'research_expert_approved':
        selectedItems = allExtracted.filter(
          (ex) =>
            !normalizePersian(ex.reviewStatus).includes('رد') &&
            isFinalizedResearchExtractedItem(ex)
        );
        break;
      case 'research_final_independent': {
        const seenKeys = new Set<string>();
        selectedItems = [];
        for (const item of allExtracted) {
          if (
            normalizePersian(item.reviewStatus).includes('رد') ||
            !isFinalizedResearchExtractedItem(item)
          ) {
            continue;
          }
          const bookPart = (item.tempBookId || '').trim() || compactPersian(item.bookTitleRaw);
          const martyrPart = stripMartyrHonorifics(item.martyrNameRaw) || 'GENERAL';
          const titlePart =
            normalizeVersionedOutputIdentity(item.passageTitle) ||
            normalizePersian(item.contentType) ||
            item.id;
          const uniqueKey = `${bookPart}::${martyrPart}::${titlePart}`;
          if (!seenKeys.has(uniqueKey)) {
            seenKeys.add(uniqueKey);
            selectedItems.push(item);
          }
        }
        break;
      }
      case 'research_drafts_incomplete':
        selectedItems = allExtracted.filter((ex) => {
          const comp = compactPersian(ex.reviewStatus);
          if (comp.includes('رد')) return false;
          if (isFinalizedResearchExtractedItem(ex)) return false;
          return comp !== 'بررسیشدهدرپژوهشاصلی';
        });
        break;
      case 'research_rejected':
        selectedItems = allExtracted.filter((ex) =>
          normalizePersian(ex.reviewStatus).includes('رد')
        );
        break;
    }

    const rows: DrilldownResearchOutputRow[] = selectedItems.map((ex) => {
      const tid = (ex.tempBookId || '').trim();
      const bookItem =
        (tid ? bookByTempId.get(tid) : undefined) ||
        (ex.bookTitleRaw
          ? bookByCompactTitle.get(compactPersian(ex.bookTitleRaw))
          : undefined);
      const isPlaceholder = isPlaceholderOrGroupMartyrPhrase(ex.martyrNameRaw, false);
      const normName = isPlaceholder ? '' : stripMartyrHonorifics(ex.martyrNameRaw);
      const martyrItem = normName ? martyrByNormName.get(normName) : undefined;
      return { item: ex, bookItem, martyrItem };
    });

    return {
      kind: 'research_outputs',
      meta,
      items: rows,
      emptyReason: 'در این دسته از مطالب پژوهشی موردی ثبت نشده است.',
    };
  }

  // ۸. گزارش‌های مدیریتی (دفتر کل محلی نهایی/پیش‌نویس یا تاریخچه سابقه صدور)
  if (finalizedRegistry !== undefined || key === 'management_reports_drafts') {
    const regList = finalizedRegistry || [];
    const wantStatus = key === 'management_reports_drafts' ? 'draft' : 'final';
    const items = regList.filter(
      (r) => r.category === 'management_report' && r.lifecycleStatus === wantStatus
    );
    return {
      kind: 'finalized_reports',
      meta,
      items,
      emptyReason:
        wantStatus === 'draft'
          ? 'هیچ پیش‌نویس گزارش مدیریتی در دفتر کل محلی دستگاه ثبت نشده است.'
          : 'هنوز گزارش مدیریتی نهایی‌شده‌ای در دفتر کل محلی دستگاه ثبت نشده است؛ از بخش «گزارش‌های مدیریتی» در صفحه آمار تفصیلی می‌توانید گزارش نهایی یا پیش‌نویس ایجاد کنید.',
    };
  }

  return {
    kind: 'management_reports',
    meta,
    items: exportHistory,
    emptyReason:
      'اطلاعات جزئیات در دسترس نیست (تاکنون گزارش مدیریتی در سابقه این دستگاه صادر یا ثبت نشده است).',
  };
}
