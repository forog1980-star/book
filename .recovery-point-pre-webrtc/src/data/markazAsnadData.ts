export type SubjectCategoryCode = 'R' | 'A' | 'H' | 'P' | 'K' | 'M' | 'UNSET';

export type ShelfCode = 'SH-01' | 'SH-02' | 'SH-03' | 'SH-04';

export type LevelCode = 'T01' | 'T02' | 'T03' | 'T04' | 'T05' | 'T06';
export type ShelfLevelCode = LevelCode;

export type PhysicalAuditStatus = 'verified' | 'review' | 'not_found' | 'unchecked';

export interface SubjectCategoryMeta {
  code: SubjectCategoryCode;
  label: string;
  fullTitle: string;
  defaultShelf: ShelfCode | '';
  defaultLevels: LevelCode[];
  allocatedLocationText: string;
  physicalCountReported: number;
  labelCount: number;
}

export const SUBJECT_CATEGORIES: SubjectCategoryMeta[] = [
  {
    code: 'R',
    label: 'R — روایت و خاطرات',
    fullTitle: 'روایت و خاطرات',
    defaultShelf: 'SH-01',
    defaultLevels: ['T01', 'T02', 'T03', 'T04', 'T05', 'T06'],
    allocatedLocationText: 'SH-01 و SH-02 (همه طبقات T01 تا T06)',
    physicalCountReported: 580,
    labelCount: 2
  },
  {
    code: 'H',
    label: 'H — تاریخ و اسناد',
    fullTitle: 'تاریخ و اسناد',
    defaultShelf: 'SH-03',
    defaultLevels: ['T01'],
    allocatedLocationText: 'SH-03-T01 (قفسه ۳، طبقه ۱ از بالا)',
    physicalCountReported: 60,
    labelCount: 1
  },
  {
    code: 'A',
    label: 'A — ادبیات و هنر',
    fullTitle: 'ادبیات و هنر',
    defaultShelf: 'SH-03',
    defaultLevels: ['T02'],
    allocatedLocationText: 'SH-03-T02 (قفسه ۳، طبقه ۲ از بالا)',
    physicalCountReported: 76,
    labelCount: 1
  },
  {
    code: 'P',
    label: 'P — پژوهش و تحلیل',
    fullTitle: 'پژوهش و تحلیل',
    defaultShelf: 'SH-03',
    defaultLevels: ['T03', 'T04'],
    allocatedLocationText: 'SH-03-T03 و SH-03-T04 (طبقات ۳ و ۴)',
    physicalCountReported: 69,
    labelCount: 2
  },
  {
    code: 'M',
    label: 'M — متفرقه',
    fullTitle: 'متفرقه و متنوع',
    defaultShelf: 'SH-03',
    defaultLevels: ['T05', 'T06'],
    allocatedLocationText: 'SH-03-T05 و SH-03-T06 (طبقات ۵ و ۶)',
    physicalCountReported: 121,
    labelCount: 2
  },
  {
    code: 'K',
    label: 'K — کودک و نوجوان',
    fullTitle: 'کودک و نوجوان',
    defaultShelf: 'SH-04',
    defaultLevels: ['T01'],
    allocatedLocationText: 'SH-04-T01 (قفسه ۴، طبقه ۱ از بالا)',
    physicalCountReported: 36,
    labelCount: 1
  },
  {
    code: 'UNSET',
    label: 'نیازمند تعیین موضوع',
    fullTitle: 'نیازمند تعیین موضوع توسط بازبین',
    defaultShelf: '',
    defaultLevels: [],
    allocatedLocationText: 'تعیین‌نشده',
    physicalCountReported: 0,
    labelCount: 0
  }
];

export const SHELVES: { code: ShelfCode; title: string; summary: string }[] = [
  { code: 'SH-01', title: 'قفسه SH-01', summary: 'گروه R — روایت و خاطرات (طبقات T01 تا T06)' },
  { code: 'SH-02', title: 'قفسه SH-02', summary: 'گروه R — روایت و خاطرات (طبقات T01 تا T06)' },
  { code: 'SH-03', title: 'قفسه SH-03', summary: 'گروه‌های H (T01)، A (T02)، P (T03-T04)، M (T05-T06)' },
  { code: 'SH-04', title: 'قفسه SH-04', summary: 'گروه K (T01) و طبقات آزاد توسعه (T02 تا T06)' }
];

export const LEVELS: { code: LevelCode; title: string; number: number }[] = [
  { code: 'T01', title: 'طبقه ۱ از بالا (T01)', number: 1 },
  { code: 'T02', title: 'طبقه ۲ از بالا (T02)', number: 2 },
  { code: 'T03', title: 'طبقه ۳ از بالا (T03)', number: 3 },
  { code: 'T04', title: 'طبقه ۴ از بالا (T04)', number: 4 },
  { code: 'T05', title: 'طبقه ۵ از بالا (T05)', number: 5 },
  { code: 'T06', title: 'طبقه ۶ از بالا (T06)', number: 6 }
];

export function getAllocatedCategoryForSlot(shelf: ShelfCode, level: LevelCode): {
  categoryCode: SubjectCategoryCode | 'FREE';
  title: string;
} {
  if (shelf === 'SH-01' || shelf === 'SH-02') {
    return { categoryCode: 'R', title: 'R — روایت و خاطرات' };
  }
  if (shelf === 'SH-03') {
    if (level === 'T01') return { categoryCode: 'H', title: 'H — تاریخ و اسناد' };
    if (level === 'T02') return { categoryCode: 'A', title: 'A — ادبیات و هنر' };
    if (level === 'T03' || level === 'T04') return { categoryCode: 'P', title: 'P — پژوهش و تحلیل' };
    return { categoryCode: 'M', title: 'M — متفرقه' };
  }
  if (shelf === 'SH-04') {
    if (level === 'T01') return { categoryCode: 'K', title: 'K — کودک و نوجوان' };
    return { categoryCode: 'FREE', title: 'آزاد — ظرفیت توسعه یا جابه‌جایی آتی' };
  }
  return { categoryCode: 'UNSET', title: 'نامشخص' };
}

// رکورد پایه شیت «فهرست کتاب‌ها» در فایل مرجع «فهرست کاری کتابخانه - نسخه 0.1 (1).xlsx»
export interface ReferenceCatalogRow {
  rowKey: string; // e.g. "فهرست کتاب‌ها::ROW-2"
  rowIndex: number; // شماره ردیف در اکسل مرجع (شروع از 2)
  tempBookId: string; // ستون ۰: شناسه موقت کتاب (BK-0001)
  titleRaw: string; // ستون ۱: عنوان کتاب
  publisherRaw: string; // ستون ۲: ناشر
  descriptionRaw: string; // ستون ۳: توضیحات ثبت‌شده در منبع
  categoryRaw: string; // ستون ۴: دسته
  authorRaw: string; // ستون ۵: نویسنده/گردآورنده
  isbnRaw: string; // ستون ۶: شابک
  fipaRaw: string; // ستون ۷: فیپا
  registrationNoRaw: string; // ستون ۸: شماره ثبت کتابخانه
  locationRaw: string; // ستون ۹: محل نگهداری/قفسه
  countedCopiesRaw: string; // ستون ۱۰: تعداد نسخه‌های موجود پس از شمارش
  reviewStatusRaw: string; // ستون ۱۱: وضعیت بررسی کتاب
  noteRaw: string; // ستون ۱۲: یادداشت
  backupSourceSheet: string; // ستون ۱۳: شیت منبع (پشتیبان)
  backupSourceRow: string; // ستون ۱۴: ردیف منبع (پشتیبان)
  allValues: string[];
}

// رکورد ثبت میدانی در حافظه مرورگر (سازگار با ساختار قبلی + فیلدهای تکمیلی نسخه سریع و شناسنامه نسخه فیزیکی CP)
export type CopyStatusCode =
  | 'verified_present'
  | 'pending_review'
  | 'loaned'
  | 'missing'
  | 'out_of_collection';

export type PhysicalConditionCode =
  | 'healthy'
  | 'needs_repair'
  | 'damaged'
  | 'unchecked';

export type UserRoleCode = 'admin' | 'registrar' | 'researcher' | 'reviewer' | 'publisher';

export interface FieldAuditRecord {
  key: string; // کلید یکتا: "فهرست کتاب‌ها::ROW-2" یا "OUT-..."
  source: 'catalog' | 'outside-list';
  sheet: string;
  tempBookId: string; // BK-0001 یا TMP-OUT-001
  copyId?: string; // شناسه نسخه فیزیکی: CP-000001
  title: string;
  author: string;
  publisher: string;
  year: string;
  edition?: string;
  isbn?: string;
  fipa?: string;
  registrationNo?: string;
  descriptionRaw?: string;
  category: string; // "R ـ روایت و خاطرات" و غیره
  shelf: ShelfCode | '';
  level: LevelCode | '';
  location: string; // "SH-01-T01"
  physical: 'verified' | 'review' | 'not_found';
  copyStatus?: CopyStatusCode;
  physicalCondition?: PhysicalConditionCode;
  countedCopies: string; // تعداد نسخه‌های مشاهده‌شده در قفسه
  checkedBy?: string; // نام ثبت‌کننده / بازبین
  notes: string;
  backupSourceSheet?: string;
  backupSourceRow?: string;
  updatedAt: string;
}

// نسخه فیزیکی مستقل هر جلد کتاب (Book Copies - بخش ۷.۲ مأموریت جامع)
export interface BookCopyLocationHistory {
  fromLocation: string;
  toLocation: string;
  movedAt: string;
  movedBy: string;
  reason: string;
}

export interface BookCopyRecord {
  copyId: string; // CP-000001
  bookId: string; // BK-0001
  bookTitle: string;
  copyStatus: CopyStatusCode;
  shelf: ShelfCode;
  level: LevelCode;
  location: string; // SH-01-T01
  observedDate: string;
  physicalCondition: PhysicalConditionCode;
  loanOrMoveStatus: 'در قفسه مرکز اسناد' | 'امانت به پژوهشگر' | 'در حال مرمت / صحافی' | 'جابه‌جاشده موقت';
  expertNote: string;
  lastReviewedAt: string;
  locationHistory: BookCopyLocationHistory[];
}

// پرونده مستقل شهید ثبت‌شده در سامانه (بخش ۷.۳ مأموریت جامع)
export interface CustomMartyrRecord {
  martyrId: string; // MR-000001
  firstName: string;
  lastName: string;
  fullName: string;
  alternativeNames: string[]; // نام‌های جایگزین و اشکال مختلف نوشتاری
  externalSystemId: string; // شناسه معتبر سامانه‌های دیگر در صورت تأیید
  identityVerificationStatus: 'تأییدشده' | 'نیازمند بررسی' | 'بررسی‌نشده' | 'ردشده / غیرمعتبر';
  informationSource: string;
  description: string;
  gravePiece: string; // با حفظ صفر ابتدایی و حروف
  graveRow: string;
  graveNumber: string;
  graveDisplayAddress: string;
  graveSource: string;
  graveVerificationStatus: 'تأییدشده میدانی/سند' | 'نیازمند تطبیق مزار' | 'یادبود / غیرتهرانی';
  createdAt: string;
}

// رکورد «مطالب استخراج‌شده و ارجاعات صفحه» (extracted_items مطابق بخش ۷.۵ مأموریت جامع)
export type ExtractedContentType =
  | 'زندگی‌نامه'
  | 'خاطره'
  | 'وصیت‌نامه'
  | 'نامه'
  | 'روایت عملیات'
  | 'سند تاریخی'
  | 'سند و دست‌نوشته'
  | 'مصاحبه'
  | 'معرفی شخصیت'
  | 'اطلاعات خانواده'
  | 'اشاره کوتاه به شهید'
  | 'اشاره کوتاه / فهرست'
  | 'تحلیل و پژوهش'
  | 'سایر';

export type ExtractedReviewStatus =
  | 'تأییدشده کارشناسی'
  | 'بررسی‌شده در پژوهش اصلی'
  | 'نیازمند بررسی'
  | 'خام (ثبت اولیه)'
  | 'ردشده با دلیل';

export interface ExtractedContentItem {
  id: string; // EX-0001
  tempBookId: string; // BK-0014
  bookTitleRaw: string;
  publisherRaw: string;
  martyrNameRaw: string;
  gravePieceRaw: string;
  pageReferenceRaw: string; // حفظ دقیق ارجاع صفحه خام مثل 173تا184
  pageStartNormalized?: string;
  pageEndNormalized?: string;
  contentType: ExtractedContentType;
  passageTitle: string;
  extractedText: string; // خلاصه پژوهشی
  shortVerifiedQuote?: string; // نقل‌قول کوتاه مستند در صورت مجاز بودن
  keywords?: string[]; // کلیدواژه‌ها
  researcherNote: string;
  reviewStatus: ExtractedReviewStatus;
  recordedBy: string;
  reviewedBy: string;
  sourceFile: string;
  sourceSheet: string;
  sourceRow: string;
  updatedAt: string;
}

// جست‌وجوی هوشمند کتاب‌های مرتبط با شهدا در منابع مجاز بیرونی (بخش ۹ و ۱۰ مأموریت جامع)
export interface OfficialSearchSourceMeta {
  priority: number;
  code: string;
  name: string;
  domainUrl: string;
  accessMethod: 'جست‌وجوی کاتالوگ و تطبیق کتاب‌شناختی' | 'بررسی شناسنامه فیپا' | 'صفحه رسمی ناشر / راهنمای بررسی';
  legalNote: string;
}

export type SmartSuggestionReviewStatus =
  | 'در صف بررسی کارشناس'
  | 'تأییدشده و افزوده‌شده به پرونده'
  | 'ردشده با ثبت دلیل'
  | 'دارای تعارض اطلاعاتی';

export interface SmartSearchSuggestion {
  id: string; // SS-0001
  martyrId: string;
  martyrName: string;
  martyrAlternativeNames: string[];
  bookTitle: string;
  authors: string;
  publisher: string;
  publishYear: string;
  editionInfo: string;
  isbn: string;
  fipa: string;
  subjectCategory: string;
  publisherDescription: string;
  sourcePriority: number;
  sourceName: string;
  sourceUrl: string;
  retrievedAt: string;
  matchEvidence: string; // دلیل و شواهد تشخیص ارتباط یا تشابه (فراتر از درصد)
  catalogComparisonStatus:
    | 'موجود در فهرست مرجع ۹۸۰ کتاب'
    | 'عنوان مشابه در فهرست (احتمال تکرار/چاپ دیگر)'
    | 'کتاب جدید (خارج از فهرست فعلی کتابخانه)'
    | 'کتاب جدید (ثبت دستی کارشناس از منابع بیرونی)'
    | 'دارای تعارض در مشخصات ناشر/نویسنده';
  matchedCatalogBookId?: string;
  reviewStatus: SmartSuggestionReviewStatus;
  reviewerNote: string;
  reviewedBy: string;
  reviewedAt: string;
}

// سابقه تغییرات سامانه (audit_log مطابق بخش ۱۴ مأموریت جامع)
export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole: UserRoleCode;
  actionType:
    | 'ثبت موجودی فیزیکی'
    | 'ثبت نسخه فیزیکی یا جابه‌جایی قفسه'
    | 'ثبت کتاب خارج از فهرست'
    | 'ثبت یا ویرایش پرونده شهید'
    | 'ثبت یا ویرایش ارتباط کتاب و شهید'
    | 'ثبت مطلب استخراج‌شده'
    | 'بررسی پیشنهاد جست‌وجوی هوشمند'
    | 'بازبینی گروه چندشهیدی'
    | 'تغییر وضعیت پیگیری'
    | 'آماده‌سازی بسته انتشار وب‌سایت';
  targetId: string;
  summary: string;
}

// جدول تصمیم‌های معماری مخزن گیت‌هاب (D-01 تا D-11 در جدول-تصمیم‌ها-و-قرارداد-داده-سه-اکسل-نسخه-۰٫۱.md)
export interface DecisionLedgerItem {
  code: string;
  subject: string;
  optionsConsidered: string;
  recommendedOption: string;
  status: 'پیشنهادی آماده تأیید' | 'تأییدشده در نسخه ۰.۱' | 'خط قرمز اجرایی';
  impact: string;
}

// خلاصه ممیزی ۴ فایل اکسل منبع مخزن گیت‌هاب
export interface ExcelSourceAuditMeta {
  fileName: string;
  roleTitle: string;
  sheetsCount: number;
  rowsCount: number;
  auditedCells: number;
  mismatchCount: number;
  keyFindings: string[];
}

// ارتباط کتاب و شهید (۸۳۶ رکورد شیت «ارتباط کتاب و شهید» RL-0001 تا RL-0836)
export interface BookMartyrLinkRecord {
  id: string; // RL-0001
  tempBookId: string; // BK-0001
  bookTitleRaw: string;
  alternativeTitle?: string;
  publisherRaw: string;
  martyrNameRaw: string;
  rawNameInSource?: string; // نام خام در منبع (پشتیبان) مثلاً *
  isGroupPhrase: boolean;
  gravePieceRaw: string;
  graveRowRaw: string;
  graveNumberRaw: string;
  pageReferenceRaw: string;
  sourceDescriptionRaw: string;
  sourceFile: string;
  sourceSheet: string;
  sourceExcelRow: string;
  groupStartRow?: string;
  groupCode?: string;
  reviewStatus: string; // بررسی‌نشده | نیازمند تکمیل | نیازمند تفکیک نام‌ها | نیازمند تکمیل مزار | نیازمند بررسی مزار | نیازمند تطبیق کتاب | تأییدشده کارشناسی
  reviewerNote: string;
}

// رکورد شیت چهارم: «موارد نیازمند بررسی» (۵۶۷ رکورد PV-0001 تا PV-0567)
export interface PendingReviewItem {
  trackingId: string; // PV-0001
  mainSheet: string; // ارتباط کتاب و شهید | فهرست کتاب‌ها
  mainRecordId: string; // RL-0001 | BK-0235
  nameOrPhrase: string;
  bookTitle: string;
  publisher: string;
  issueSubject: string;
  suggestedAction: string;
  trackingStatus: string; // باز | بررسی‌شده | بسته
}

// رکورد شیت پنجم: «شهدای گلزار» (۱۹۶ رکورد SH-0001 تا SH-0196)
export interface WorkbookGolzarMartyr {
  tempPersonId: string; // SH-0001
  firstNameRaw: string;
  lastNameRaw: string;
  fullNameSearch: string;
  piece: string;
  graveRow: string;
  graveNumber: string;
  graveStatus: string;
  sourceFile: string;
  sourceSheet: string;
  sourceRow: string;
}

// کاربرگ بازبینی کارشناس ۱۶ گروه شیت «چند شهید» (G001 تا G016)
export interface MultiMartyrGroupAudit {
  groupCode: string;
  startExcelRow: number;
  sourceRowA: number;
  registeredTitle: string;
  registeredPublisher: string;
  martyrRowsCount: number;
  incompleteGraveRows: string;
  initialFlag: string;
  boundaryApproved: 'نامشخص' | 'بله' | 'خیر';
  allMartyrsLinked: 'نامشخص' | 'بله' | 'خیر';
  decisionStatus:
    | 'در انتظار بازبینی کارشناس'
    | 'در انتظار بازبینی انسانی'
    | 'تأیید'
    | 'رد'
    | 'نیازمند پیگیری';
  reviewerName: string;
  reviewDate: string;
  reviewNote: string;
}

// نمونه رکوردهای واقعی استخراج‌شده از «فهرست کاری کتابخانه - نسخه 0.1 (1).xlsx» برای تست فوری ۲۰ کتاب
export const DEFAULT_REFERENCE_CATALOG_ROWS: ReferenceCatalogRow[] = [
  {
    rowKey: 'فهرست کتاب‌ها::ROW-2',
    rowIndex: 2,
    tempBookId: 'BK-0001',
    titleRaw: '101خاطره جنگی (سال 2009-سارایوو)',
    publisherRaw: 'سوره مهر',
    descriptionRaw: 'ژنرال راسم دلیچ',
    categoryRaw: '',
    authorRaw: '',
    isbnRaw: '',
    fipaRaw: '',
    registrationNoRaw: '',
    locationRaw: '',
    countedCopiesRaw: '',
    reviewStatusRaw: 'بررسی‌نشده',
    noteRaw: '',
    backupSourceSheet: 'سوره مهر',
    backupSourceRow: '2',
    allValues: ['BK-0001', '101خاطره جنگی (سال 2009-سارایوو)', 'سوره مهر', 'ژنرال راسم دلیچ', '', '', '', '', '', '', '', 'بررسی‌نشده', '', 'سوره مهر', '2']
  },
  {
    rowKey: 'فهرست کتاب‌ها::ROW-3',
    rowIndex: 3,
    tempBookId: 'BK-0002',
    titleRaw: 'اردوگاه اطفال',
    publisherRaw: 'سوره مهر',
    descriptionRaw: '',
    categoryRaw: '',
    authorRaw: '',
    isbnRaw: '',
    fipaRaw: '',
    registrationNoRaw: '',
    locationRaw: '',
    countedCopiesRaw: '',
    reviewStatusRaw: 'بررسی‌نشده',
    noteRaw: '',
    backupSourceSheet: 'سوره مهر',
    backupSourceRow: '3',
    allValues: ['BK-0002', 'اردوگاه اطفال', 'سوره مهر', '', '', '', '', '', '', '', '', 'بررسی‌نشده', '', 'سوره مهر', '3']
  },
  {
    rowKey: 'فهرست کتاب‌ها::ROW-4',
    rowIndex: 4,
    tempBookId: 'BK-0003',
    titleRaw: 'اردوگاه عنبر',
    publisherRaw: 'سوره مهر',
    descriptionRaw: 'خاطرات آزادگان و اسرا',
    categoryRaw: '',
    authorRaw: '',
    isbnRaw: '',
    fipaRaw: '',
    registrationNoRaw: '',
    locationRaw: '',
    countedCopiesRaw: '',
    reviewStatusRaw: 'بررسی‌نشده',
    noteRaw: '',
    backupSourceSheet: 'سوره مهر',
    backupSourceRow: '4',
    allValues: ['BK-0003', 'اردوگاه عنبر', 'سوره مهر', 'خاطرات آزادگان و اسرا', '', '', '', '', '', '', '', 'بررسی‌نشده', '', 'سوره مهر', '4']
  },
  {
    rowKey: 'فهرست کتاب‌ها::ROW-5',
    rowIndex: 5,
    tempBookId: 'BK-0014',
    titleRaw: 'با مرام',
    publisherRaw: 'ابراهیم هادی',
    descriptionRaw: 'زندگی‌نامه و خاطرات شهید احمد بیابانی',
    categoryRaw: 'R',
    authorRaw: '',
    isbnRaw: '',
    fipaRaw: '',
    registrationNoRaw: '',
    locationRaw: '',
    countedCopiesRaw: '',
    reviewStatusRaw: 'بررسی‌نشده',
    noteRaw: 'عنوان دیگر ثبت‌شده در شیت یک شهید - احمد',
    backupSourceSheet: 'ابراهیم هادی',
    backupSourceRow: '14',
    allValues: ['BK-0014', 'با مرام', 'ابراهیم هادی', 'زندگی‌نامه و خاطرات شهید احمد بیابانی', 'R', '', '', '', '', '', '', 'بررسی‌نشده', '', 'ابراهیم هادی', '14']
  },
  {
    rowKey: 'فهرست کتاب‌ها::ROW-6',
    rowIndex: 6,
    tempBookId: 'BK-0021',
    titleRaw: 'آخرین نامه',
    publisherRaw: 'ابراهیم هادی',
    descriptionRaw: 'مجموعه خاطرات و وصیت‌نامه شهدا (گروه G001)',
    categoryRaw: 'R',
    authorRaw: '',
    isbnRaw: '',
    fipaRaw: '',
    registrationNoRaw: '',
    locationRaw: '',
    countedCopiesRaw: '',
    reviewStatusRaw: 'بررسی‌نشده',
    noteRaw: '',
    backupSourceSheet: 'ابراهیم هادی',
    backupSourceRow: '21',
    allValues: ['BK-0021', 'آخرین نامه', 'ابراهیم هادی', 'مجموعه خاطرات و وصیت‌نامه شهدا (گروه G001)', 'R', '', '', '', '', '', '', 'بررسی‌نشده', '', 'ابراهیم هادی', '21']
  },
  {
    rowKey: 'فهرست کتاب‌ها::ROW-7',
    rowIndex: 7,
    tempBookId: 'BK-0028',
    titleRaw: 'پنجاه سال عبادت',
    publisherRaw: 'ابراهیم هادی',
    descriptionRaw: 'زندگینامه و خاطرات پانزده شهید (گروه G002)',
    categoryRaw: 'R',
    authorRaw: '',
    isbnRaw: '',
    fipaRaw: '',
    registrationNoRaw: '',
    locationRaw: '',
    countedCopiesRaw: '',
    reviewStatusRaw: 'بررسی‌نشده',
    noteRaw: '',
    backupSourceSheet: 'ابراهیم هادی',
    backupSourceRow: '28',
    allValues: ['BK-0028', 'پنجاه سال عبادت', 'ابراهیم هادی', 'زندگینامه و خاطرات پانزده شهید (گروه G002)', 'R', '', '', '', '', '', '', 'بررسی‌نشده', '', 'ابراهیم هادی', '28']
  },
  {
    rowKey: 'فهرست کتاب‌ها::ROW-8',
    rowIndex: 8,
    tempBookId: 'BK-0035',
    titleRaw: 'راهیان علقمه',
    publisherRaw: 'ابراهیم هادی',
    descriptionRaw: 'شهدای غواص و عملیات کربلای ۴ و ۵ (گروه G003)',
    categoryRaw: 'R',
    authorRaw: '',
    isbnRaw: '',
    fipaRaw: '',
    registrationNoRaw: '',
    locationRaw: '',
    countedCopiesRaw: '',
    reviewStatusRaw: 'بررسی‌نشده',
    noteRaw: '',
    backupSourceSheet: 'ابراهیم هادی',
    backupSourceRow: '35',
    allValues: ['BK-0035', 'راهیان علقمه', 'ابراهیم هادی', 'شهدای غواص و عملیات کربلای ۴ و ۵ (گروه G003)', 'R', '', '', '', '', '', '', 'بررسی‌نشده', '', 'ابراهیم هادی', '35']
  },
  {
    rowKey: 'فهرست کتاب‌ها::ROW-9',
    rowIndex: 9,
    tempBookId: 'BK-0042',
    titleRaw: 'شناسایی',
    publisherRaw: 'ابراهیم هادی',
    descriptionRaw: 'خاطرات واحد اطلاعات و عملیات (گروه G004)',
    categoryRaw: 'R',
    authorRaw: '',
    isbnRaw: '',
    fipaRaw: '',
    registrationNoRaw: '',
    locationRaw: '',
    countedCopiesRaw: '',
    reviewStatusRaw: 'بررسی‌نشده',
    noteRaw: '',
    backupSourceSheet: 'ابراهیم هادی',
    backupSourceRow: '42',
    allValues: ['BK-0042', 'شناسایی', 'ابراهیم هادی', 'خاطرات واحد اطلاعات و عملیات (گروه G004)', 'R', '', '', '', '', '', '', 'بررسی‌نشده', '', 'ابراهیم هادی', '42']
  },
  {
    rowKey: 'فهرست کتاب‌ها::ROW-10',
    rowIndex: 10,
    tempBookId: 'BK-0089',
    titleRaw: 'فدائیان ولایت',
    publisherRaw: 'ابراهیم هادی',
    descriptionRaw: 'خاطرات شهدا (گروه G005)',
    categoryRaw: 'R',
    authorRaw: '',
    isbnRaw: '',
    fipaRaw: '',
    registrationNoRaw: '',
    locationRaw: '',
    countedCopiesRaw: '',
    reviewStatusRaw: 'بررسی‌نشده',
    noteRaw: '',
    backupSourceSheet: 'ابراهیم هادی',
    backupSourceRow: '55',
    allValues: ['BK-0089', 'فدائیان ولایت', 'ابراهیم هادی', 'خاطرات شهدا (گروه G005)', 'R', '', '', '', '', '', '', 'بررسی‌نشده', '', 'ابراهیم هادی', '55']
  },
  {
    rowKey: 'فهرست کتاب‌ها::ROW-11',
    rowIndex: 11,
    tempBookId: 'BK-0104',
    titleRaw: 'کبوتران حرم',
    publisherRaw: 'ابراهیم هادی',
    descriptionRaw: 'شهدای مدافع حرم (گروه G006)',
    categoryRaw: 'R',
    authorRaw: '',
    isbnRaw: '',
    fipaRaw: '',
    registrationNoRaw: '',
    locationRaw: '',
    countedCopiesRaw: '',
    reviewStatusRaw: 'بررسی‌نشده',
    noteRaw: '',
    backupSourceSheet: 'ابراهیم هادی',
    backupSourceRow: '62',
    allValues: ['BK-0104', 'کبوتران حرم', 'ابراهیم هادی', 'شهدای مدافع حرم (گروه G006)', 'R', '', '', '', '', '', '', 'بررسی‌نشده', '', 'ابراهیم هادی', '62']
  },
  {
    rowKey: 'فهرست کتاب‌ها::ROW-12',
    rowIndex: 12,
    tempBookId: 'BK-0118',
    titleRaw: 'مهر مادر',
    publisherRaw: 'ابراهیم هادی',
    descriptionRaw: 'روایت مادران شهدا (گروه G008)',
    categoryRaw: 'R',
    authorRaw: '',
    isbnRaw: '',
    fipaRaw: '',
    registrationNoRaw: '',
    locationRaw: '',
    countedCopiesRaw: '',
    reviewStatusRaw: 'بررسی‌نشده',
    noteRaw: '',
    backupSourceSheet: 'ابراهیم هادی',
    backupSourceRow: '74',
    allValues: ['BK-0118', 'مهر مادر', 'ابراهیم هادی', 'روایت مادران شهدا (گروه G008)', 'R', '', '', '', '', '', '', 'بررسی‌نشده', '', 'ابراهیم هادی', '74']
  },
  {
    rowKey: 'فهرست کتاب‌ها::ROW-13',
    rowIndex: 13,
    tempBookId: 'BK-0131',
    titleRaw: 'پدیدار شناسی بسیجی شهید',
    publisherRaw: 'نشر شاهد',
    descriptionRaw: 'پژوهش نظری و میدانی سیره شهدای بسیج',
    categoryRaw: 'P',
    authorRaw: '',
    isbnRaw: '',
    fipaRaw: '',
    registrationNoRaw: '',
    locationRaw: '',
    countedCopiesRaw: '',
    reviewStatusRaw: 'بررسی‌نشده',
    noteRaw: 'دارای ردیف ادامه‌ای ۱۳۳ (و چندین شهید غیر تهرانی)',
    backupSourceSheet: 'نشر شاهد',
    backupSourceRow: '19',
    allValues: ['BK-0131', 'پدیدار شناسی بسیجی شهید', 'نشر شاهد', 'پژوهش نظری و میدانی سیره شهدای بسیج', 'P', '', '', '', '', '', '', 'بررسی‌نشده', '', 'نشر شاهد', '19']
  },
  {
    rowKey: 'فهرست کتاب‌ها::ROW-14',
    rowIndex: 14,
    tempBookId: 'BK-0210',
    titleRaw: 'چند قدم تا وصال / در آرزوی دیدار',
    publisherRaw: 'ایرانا',
    descriptionRaw: 'مجموعه زندگینامه ۶۵ شهید (گروه G009)',
    categoryRaw: 'R',
    authorRaw: '',
    isbnRaw: '',
    fipaRaw: '',
    registrationNoRaw: '',
    locationRaw: '',
    countedCopiesRaw: '',
    reviewStatusRaw: 'بررسی‌نشده',
    noteRaw: '',
    backupSourceSheet: 'ایرانا',
    backupSourceRow: '8',
    allValues: ['BK-0210', 'چند قدم تا وصال / در آرزوی دیدار', 'ایرانا', 'مجموعه زندگینامه ۶۵ شهید (گروه G009)', 'R', '', '', '', '', '', '', 'بررسی‌نشده', '', 'ایرانا', '8']
  },
  {
    rowKey: 'فهرست کتاب‌ها::ROW-15',
    rowIndex: 15,
    tempBookId: 'BK-0305',
    titleRaw: 'طلایه داران دو کوهه',
    publisherRaw: 'حفظ و نشر ارزش های دفاع مقدس',
    descriptionRaw: 'کارنامه و شهدای لشکر ۲۷ محمد رسول‌الله (گروه G010)',
    categoryRaw: 'H',
    authorRaw: '',
    isbnRaw: '',
    fipaRaw: '',
    registrationNoRaw: '',
    locationRaw: '',
    countedCopiesRaw: '',
    reviewStatusRaw: 'بررسی‌نشده',
    noteRaw: '',
    backupSourceSheet: 'حفظ و نشر',
    backupSourceRow: '12',
    allValues: ['BK-0305', 'طلایه داران دو کوهه', 'حفظ و نشر ارزش های دفاع مقدس', 'کارنامه و شهدای لشکر ۲۷ محمد رسول‌الله (گروه G010)', 'H', '', '', '', '', '', '', 'بررسی‌نشده', '', 'حفظ و نشر', '12']
  },
  {
    rowKey: 'فهرست کتاب‌ها::ROW-16',
    rowIndex: 16,
    tempBookId: 'BK-0340',
    titleRaw: 'سرداران ولایت مدار',
    publisherRaw: 'حلم',
    descriptionRaw: 'تک‌نگاری فرماندهان شهید (گروه G011)',
    categoryRaw: 'H',
    authorRaw: '',
    isbnRaw: '',
    fipaRaw: '',
    registrationNoRaw: '',
    locationRaw: '',
    countedCopiesRaw: '',
    reviewStatusRaw: 'بررسی‌نشده',
    noteRaw: '',
    backupSourceSheet: 'حلم',
    backupSourceRow: '5',
    allValues: ['BK-0340', 'سرداران ولایت مدار', 'حلم', 'تک‌نگاری فرماندهان شهید (گروه G011)', 'H', '', '', '', '', '', '', 'بررسی‌نشده', '', 'حلم', '5']
  },
  {
    rowKey: 'فهرست کتاب‌ها::ROW-17',
    rowIndex: 17,
    tempBookId: 'BK-0412',
    titleRaw: 'کی می رویم بهشت؟',
    publisherRaw: 'رسول آفتاب',
    descriptionRaw: 'خاطرات شهدای تهرانی (گروه G012)',
    categoryRaw: 'R',
    authorRaw: '',
    isbnRaw: '',
    fipaRaw: '',
    registrationNoRaw: '',
    locationRaw: '',
    countedCopiesRaw: '',
    reviewStatusRaw: 'بررسی‌نشده',
    noteRaw: '',
    backupSourceSheet: 'رسول آفتاب',
    backupSourceRow: '9',
    allValues: ['BK-0412', 'کی می رویم بهشت؟', 'رسول آفتاب', 'خاطرات شهدای تهرانی (گروه G012)', 'R', '', '', '', '', '', '', 'بررسی‌نشده', '', 'رسول آفتاب', '9']
  },
  {
    rowKey: 'فهرست کتاب‌ها::ROW-18',
    rowIndex: 18,
    tempBookId: 'BK-0488',
    titleRaw: 'چلچراغ',
    publisherRaw: 'ستارگان درخشان',
    descriptionRaw: 'ادبیات و نثر پایداری (گروه G013)',
    categoryRaw: 'A',
    authorRaw: '',
    isbnRaw: '',
    fipaRaw: '',
    registrationNoRaw: '',
    locationRaw: '',
    countedCopiesRaw: '',
    reviewStatusRaw: 'بررسی‌نشده',
    noteRaw: '',
    backupSourceSheet: 'ستارگان درخشان',
    backupSourceRow: '4',
    allValues: ['BK-0488', 'چلچراغ', 'ستارگان درخشان', 'ادبیات و نثر پایداری (گروه G013)', 'A', '', '', '', '', '', '', 'بررسی‌نشده', '', 'ستارگان درخشان', '4']
  },
  {
    rowKey: 'فهرست کتاب‌ها::ROW-19',
    rowIndex: 19,
    tempBookId: 'BK-0520',
    titleRaw: 'دلدادگان عقیله بنی هاشم',
    publisherRaw: 'مدیریت ایثارگران سپاه حفاظت انصارالمهدی(عج)',
    descriptionRaw: 'گروه تک‌عضوی در شیت چند شهید (گروه G014)',
    categoryRaw: 'R',
    authorRaw: '',
    isbnRaw: '',
    fipaRaw: '',
    registrationNoRaw: '',
    locationRaw: '',
    countedCopiesRaw: '',
    reviewStatusRaw: 'بررسی‌نشده',
    noteRaw: '',
    backupSourceSheet: 'متفرقه ناشران',
    backupSourceRow: '16',
    allValues: ['BK-0520', 'دلدادگان عقیله بنی هاشم', 'مدیریت ایثارگران سپاه حفاظت انصارالمهدی(عج)', 'گروه تک‌عضوی در شیت چند شهید (گروه G014)', 'R', '', '', '', '', '', '', 'بررسی‌نشده', '', 'متفرقه ناشران', '16']
  },
  {
    rowKey: 'فهرست کتاب‌ها::ROW-20',
    rowIndex: 20,
    tempBookId: 'BK-0601',
    titleRaw: 'مردان رستگار',
    publisherRaw: 'یا زهرا',
    descriptionRaw: 'مجموعه ۲۶ شهید والامقام (گروه G016)',
    categoryRaw: 'R',
    authorRaw: '',
    isbnRaw: '',
    fipaRaw: '',
    registrationNoRaw: '',
    locationRaw: '',
    countedCopiesRaw: '',
    reviewStatusRaw: 'بررسی‌نشده',
    noteRaw: '',
    backupSourceSheet: 'یا زهرا',
    backupSourceRow: '11',
    allValues: ['BK-0601', 'مردان رستگار', 'یا زهرا', 'مجموعه ۲۶ شهید والامقام (گروه G016)', 'R', '', '', '', '', '', '', 'بررسی‌نشده', '', 'یا زهرا', '11']
  }
];

export const INITIAL_BOOK_MARTYR_LINKS: BookMartyrLinkRecord[] = [
  {
    id: 'LNK-001',
    tempBookId: 'BK-0014',
    bookTitleRaw: 'با مرام',
    alternativeTitle: 'احمد',
    publisherRaw: 'ابراهیم هادی',
    martyrNameRaw: 'احمد بیابانی',
    isGroupPhrase: false,
    gravePieceRaw: '26',
    graveRowRaw: '14',
    graveNumberRaw: '8',
    pageReferenceRaw: 'کل کتاب (تک‌نگاری)',
    sourceDescriptionRaw: 'ادغام دو ردیف ۲ و ۳ شیت یک شهید بر اساس تصمیم کاربر؛ نام و نشانی مزار یکسان',
    sourceFile: 'قطعات شهدا.xlsx',
    sourceSheet: 'یک شهید',
    sourceExcelRow: '2 و 3',
    reviewStatus: 'تأییدشده کارشناسی',
    reviewerNote: 'عنوان دیگر ثبت‌شده: «احمد» در ستون جایگزین حفظ شد.'
  },
  {
    id: 'LNK-002',
    tempBookId: 'BK-0028',
    bookTitleRaw: 'پنجاه سال عبادت',
    publisherRaw: 'ابراهیم هادی',
    martyrNameRaw: 'سید اسدالله لاجوردی',
    isGroupPhrase: false,
    gravePieceRaw: '24',
    graveRowRaw: '',
    graveNumberRaw: '',
    pageReferenceRaw: 'ص 42 تا 58',
    sourceDescriptionRaw: 'عضو گروه G002 در شیت چند شهید؛ ردیف ۱۱ اکسل دارای مکان مزار ناقص',
    sourceFile: 'قطعات شهدا.xlsx',
    sourceSheet: 'چند شهید',
    sourceExcelRow: '11',
    groupStartRow: '9',
    groupCode: 'G002',
    reviewStatus: 'نیازمند بررسی',
    reviewerNote: 'ردیف و شماره مزار در اکسل منبع خالی است؛ از تکمیل حدسی خودداری شود.'
  },
  {
    id: 'LNK-003',
    tempBookId: 'BK-0210',
    bookTitleRaw: 'چند قدم تا وصال / در آرزوی دیدار',
    publisherRaw: 'ایرانا',
    martyrNameRaw: 'عباس تیماجی',
    isGroupPhrase: false,
    gravePieceRaw: '29',
    graveRowRaw: '18',
    graveNumberRaw: '',
    pageReferenceRaw: 'ص 112',
    sourceDescriptionRaw: 'عضو گروه ۶۵ نفری G009 در شیت چند شهید؛ ردیف ۹۷ دارای نقص شماره مزار',
    sourceFile: 'قطعات شهدا.xlsx',
    sourceSheet: 'چند شهید',
    sourceExcelRow: '97',
    groupStartRow: '67',
    groupCode: 'G009',
    reviewStatus: 'نیازمند بررسی',
    reviewerNote: 'شماره مزار در منبع خالی است؛ نیازمند تطبیق با شیت آدرس مزار.'
  },
  {
    id: 'LNK-004',
    tempBookId: 'BK-0131',
    bookTitleRaw: 'پدیدار شناسی بسیجی شهید',
    publisherRaw: 'نشر شاهد',
    martyrNameRaw: 'و چندین شهید غیر تهرانی',
    isGroupPhrase: true,
    gravePieceRaw: 'غ تهرانی',
    graveRowRaw: '',
    graveNumberRaw: '',
    pageReferenceRaw: 'فصل سوم',
    sourceDescriptionRaw: 'ردیف ادامه‌ای ۱۳۳ که به گروه آغازشده در ردیف ۱۳۱ نسبت داده شده است',
    sourceFile: 'لیست کتابهای و شهدای مرتبط.xlsx',
    sourceSheet: 'Sheet2',
    sourceExcelRow: '133',
    groupStartRow: '131',
    reviewStatus: 'نیازمند بررسی',
    reviewerNote: 'عبارت گروهی است؛ نباید به پرونده یک شخص واحد تبدیل شود.'
  },
  {
    id: 'LNK-005',
    tempBookId: 'BK-0305',
    bookTitleRaw: 'طلایه داران دو کوهه',
    publisherRaw: 'حفظ و نشر ارزش های دفاع مقدس',
    martyrNameRaw: 'محمد ابراهیم همت',
    isGroupPhrase: false,
    gravePieceRaw: '24',
    graveRowRaw: '77',
    graveNumberRaw: '52',
    pageReferenceRaw: '173تا184',
    sourceDescriptionRaw: 'گروه G010 - شهدای لشکر ۲۷ محمد رسول‌الله (ص)',
    sourceFile: 'قطعات شهدا.xlsx',
    sourceSheet: 'چند شهید',
    sourceExcelRow: '134',
    groupStartRow: '132',
    groupCode: 'G010',
    reviewStatus: 'تأییدشده کارشناسی',
    reviewerNote: 'ارجاع صفحه خام حفظ گردید.'
  }
];

export const INITIAL_MULTI_MARTYR_GROUPS: MultiMartyrGroupAudit[] = [
  { groupCode: 'G001', startExcelRow: 2, sourceRowA: 1, registeredTitle: 'آخرین نامه', registeredPublisher: 'ابراهیم هادی', martyrRowsCount: 7, incompleteGraveRows: 'ندارد', initialFlag: 'بازبینی عادی', boundaryApproved: 'نامشخص', allMartyrsLinked: 'نامشخص', decisionStatus: 'در انتظار بازبینی کارشناس', reviewerName: '', reviewDate: '', reviewNote: '' },
  { groupCode: 'G002', startExcelRow: 9, sourceRowA: 2, registeredTitle: 'پنجاه سال عبادت', registeredPublisher: 'ابراهیم هادی', martyrRowsCount: 15, incompleteGraveRows: 'ردیف 11 (سید اسدالله لاجوردی)', initialFlag: 'بررسی مکان مزار ناقص', boundaryApproved: 'نامشخص', allMartyrsLinked: 'نامشخص', decisionStatus: 'در انتظار بازبینی کارشناس', reviewerName: '', reviewDate: '', reviewNote: '' },
  { groupCode: 'G003', startExcelRow: 24, sourceRowA: 3, registeredTitle: 'راهیان علقمه', registeredPublisher: 'ابراهیم هادی', martyrRowsCount: 9, incompleteGraveRows: 'ندارد', initialFlag: 'بازبینی عادی', boundaryApproved: 'نامشخص', allMartyrsLinked: 'نامشخص', decisionStatus: 'در انتظار بازبینی کارشناس', reviewerName: '', reviewDate: '', reviewNote: '' },
  { groupCode: 'G004', startExcelRow: 33, sourceRowA: 4, registeredTitle: 'شناسایی', registeredPublisher: 'ابراهیم هادی', martyrRowsCount: 11, incompleteGraveRows: 'ندارد', initialFlag: 'بازبینی عادی', boundaryApproved: 'نامشخص', allMartyrsLinked: 'نامشخص', decisionStatus: 'در انتظار بازبینی کارشناس', reviewerName: '', reviewDate: '', reviewNote: '' },
  { groupCode: 'G005', startExcelRow: 44, sourceRowA: 5, registeredTitle: 'فدائیان ولایت', registeredPublisher: 'ابراهیم هادی', martyrRowsCount: 3, incompleteGraveRows: 'ندارد', initialFlag: 'بازبینی عادی', boundaryApproved: 'نامشخص', allMartyrsLinked: 'نامشخص', decisionStatus: 'در انتظار بازبینی کارشناس', reviewerName: '', reviewDate: '', reviewNote: '' },
  { groupCode: 'G006', startExcelRow: 47, sourceRowA: 6, registeredTitle: 'کبوتران حرم', registeredPublisher: 'ابراهیم هادی', martyrRowsCount: 5, incompleteGraveRows: 'ندارد', initialFlag: 'بازبینی عادی', boundaryApproved: 'نامشخص', allMartyrsLinked: 'نامشخص', decisionStatus: 'در انتظار بازبینی کارشناس', reviewerName: '', reviewDate: '', reviewNote: '' },
  { groupCode: 'G007', startExcelRow: 52, sourceRowA: 7, registeredTitle: 'مدافعان حرم', registeredPublisher: 'ابراهیم هادی', martyrRowsCount: 5, incompleteGraveRows: 'ندارد', initialFlag: 'بازبینی عادی', boundaryApproved: 'نامشخص', allMartyrsLinked: 'نامشخص', decisionStatus: 'در انتظار بازبینی کارشناس', reviewerName: '', reviewDate: '', reviewNote: '' },
  { groupCode: 'G008', startExcelRow: 57, sourceRowA: 8, registeredTitle: 'مهر مادر', registeredPublisher: 'ابراهیم هادی', martyrRowsCount: 10, incompleteGraveRows: 'ندارد', initialFlag: 'بازبینی عادی', boundaryApproved: 'نامشخص', allMartyrsLinked: 'نامشخص', decisionStatus: 'در انتظار بازبینی کارشناس', reviewerName: '', reviewDate: '', reviewNote: '' },
  { groupCode: 'G009', startExcelRow: 67, sourceRowA: 9, registeredTitle: 'چند قدم تا وصال / در آرزوی دیدار', registeredPublisher: 'ایرانا', martyrRowsCount: 65, incompleteGraveRows: 'ردیف 97 (عباس تیماجی)', initialFlag: 'بررسی مکان مزار ناقص', boundaryApproved: 'نامشخص', allMartyrsLinked: 'نامشخص', decisionStatus: 'در انتظار بازبینی کارشناس', reviewerName: '', reviewDate: '', reviewNote: '' },
  { groupCode: 'G010', startExcelRow: 132, sourceRowA: 10, registeredTitle: 'طلایه داران دو کوهه', registeredPublisher: 'حفظ و نشر / ارزش های / دفاع مقدس', martyrRowsCount: 13, incompleteGraveRows: 'ندارد', initialFlag: 'بازبینی عادی', boundaryApproved: 'نامشخص', allMartyrsLinked: 'نامشخص', decisionStatus: 'در انتظار بازبینی کارشناس', reviewerName: '', reviewDate: '', reviewNote: '' },
  { groupCode: 'G011', startExcelRow: 145, sourceRowA: 11, registeredTitle: 'سرداران ولایت مدار', registeredPublisher: 'حلم', martyrRowsCount: 13, incompleteGraveRows: 'ندارد', initialFlag: 'بازبینی عادی', boundaryApproved: 'نامشخص', allMartyrsLinked: 'نامشخص', decisionStatus: 'در انتظار بازبینی کارشناس', reviewerName: '', reviewDate: '', reviewNote: '' },
  { groupCode: 'G012', startExcelRow: 158, sourceRowA: 12, registeredTitle: 'کی می رویم بهشت؟', registeredPublisher: 'رسول آفتاب', martyrRowsCount: 8, incompleteGraveRows: 'ندارد', initialFlag: 'بازبینی عادی', boundaryApproved: 'نامشخص', allMartyrsLinked: 'نامشخص', decisionStatus: 'در انتظار بازبینی کارشناس', reviewerName: '', reviewDate: '', reviewNote: '' },
  { groupCode: 'G013', startExcelRow: 166, sourceRowA: 13, registeredTitle: 'چلچراغ', registeredPublisher: 'ستارگان درخشان', martyrRowsCount: 3, incompleteGraveRows: 'ندارد', initialFlag: 'بازبینی عادی', boundaryApproved: 'نامشخص', allMartyrsLinked: 'نامشخص', decisionStatus: 'در انتظار بازبینی کارشناس', reviewerName: '', reviewDate: '', reviewNote: '' },
  { groupCode: 'G014', startExcelRow: 169, sourceRowA: 14, registeredTitle: 'دلدادگان عقیله / بنی هاشم', registeredPublisher: 'مدیریت ایثارگران / سپاه حفاظت / انصارالمهدی(عج)', martyrRowsCount: 1, incompleteGraveRows: 'ندارد', initialFlag: 'بررسی شود: گروه تک‌عضوی', boundaryApproved: 'نامشخص', allMartyrsLinked: 'نامشخص', decisionStatus: 'در انتظار بازبینی کارشناس', reviewerName: '', reviewDate: '', reviewNote: '' },
  { groupCode: 'G015', startExcelRow: 170, sourceRowA: 15, registeredTitle: 'شکنجه', registeredPublisher: 'یا زهرا', martyrRowsCount: 4, incompleteGraveRows: 'ندارد', initialFlag: 'بازبینی عادی', boundaryApproved: 'نامشخص', allMartyrsLinked: 'نامشخص', decisionStatus: 'در انتظار بازبینی کارشناس', reviewerName: '', reviewDate: '', reviewNote: '' },
  { groupCode: 'G016', startExcelRow: 174, sourceRowA: 16, registeredTitle: 'مردان رستگار', registeredPublisher: 'یا زهرا', martyrRowsCount: 26, incompleteGraveRows: 'ندارد', initialFlag: 'بازبینی عادی', boundaryApproved: 'نامشخص', allMartyrsLinked: 'نامشخص', decisionStatus: 'در انتظار بازبینی کارشناس', reviewerName: '', reviewDate: '', reviewNote: '' }
];

// تابع نرمال‌سازی استاندارد فارسی مطابق با کدهای مرکز اسناد
export function normalizePersianText(input: unknown): string {
  if (input === null || input === undefined) return '';
  return String(input)
    .normalize('NFKC')
    .replace(/[يیئى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, ' ')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function toPersianDigits(input: unknown): string {
  if (input === null || input === undefined) return '';
  return String(input).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

export function toEnglishDigits(input: unknown): string {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

export const USER_ROLES: { code: UserRoleCode; title: string; permissionsSummary: string }[] = [
  {
    code: 'admin',
    title: 'مدیر سامانه',
    permissionsSummary: 'دسترسی کامل به تمام ماژول‌ها، پشتیبان‌گیری، بازیابی و تنظیمات'
  },
  {
    code: 'registrar',
    title: 'ثبت‌کننده کتاب',
    permissionsSummary: 'ثبت سریع کتاب، نسخه‌های فیزیکی قفسه، فرمان صوتی و برچسب‌ها'
  },
  {
    code: 'researcher',
    title: 'پژوهشگر',
    permissionsSummary: 'ثبت پرونده شهید، ارتباط کتاب و شهید، مطالب استخراج‌شده و جست‌وجوی هوشمند'
  },
  {
    code: 'reviewer',
    title: 'بازبین اطلاعات',
    permissionsSummary: 'بررسی و تأیید/رد پیشنهادهای هوشمند، گروه‌های چندشهیدی و موارد نیازمند بررسی'
  },
  {
    code: 'publisher',
    title: 'مسئول تأیید و انتشار',
    permissionsSummary: 'تأیید نهایی رکوردها و آماده‌سازی خروجی درگاه سایت گلزار (golzarteh.ir)'
  }
];

// رکوردهای اولیه «مطالب استخراج‌شده و ارجاعات صفحه» (extracted_items) بر اساس کتاب‌ها و شهدای واقعی مخزن
export const INITIAL_EXTRACTED_ITEMS: ExtractedContentItem[] = [
  {
    id: 'EX-0001',
    tempBookId: 'BK-0014',
    bookTitleRaw: 'با مرام (عنوان جایگزین در شیت یک شهید: احمد)',
    publisherRaw: 'ابراهیم هادی',
    martyrNameRaw: 'احمد بیابانی',
    gravePieceRaw: '26',
    pageReferenceRaw: 'کل کتاب (ص 1 تا 144)',
    pageStartNormalized: '1',
    pageEndNormalized: '144',
    contentType: 'زندگی‌نامه',
    passageTitle: 'زندگی‌نامه و سیره اخلاقی شهید احمد بیابانی در محله و جبهه',
    extractedText:
      'تک‌نگاری کامل زندگی، خاطرات همرزمان و خانواده شهید احمد بیابانی (متولد ۱۳۴۴، شهادت ۱۳۶۵ در عملیات کربلای ۵، مزار: قطعه ۲۶ ردیف ۱۴ شماره ۸). در فایل قطعات شهدا در ردیف ۲ با عنوان «با مرام» و در ردیف ۳ با عنوان «احمد» ثبت شده بود که طبق تصمیم D-04 در یک رکورد واحد کتاب با حفظ عنوان دیگر ادغام گردید.',
    researcherNote: 'تطبیق قطعی با مزار قطعه ۲۶ ردیف ۱۴ شماره ۸ گلزار شهدای بهشت زهرا (س).',
    reviewStatus: 'تأییدشده کارشناسی',
    recordedBy: 'پژوهشگر مرکز اسناد',
    reviewedBy: 'کارشناس مسئول کتابخانه',
    sourceFile: 'قطعات شهدا.xlsx',
    sourceSheet: 'یک شهید',
    sourceRow: '2 و 3',
    updatedAt: '۱۴۰۵/۰۷/۲۳'
  },
  {
    id: 'EX-0002',
    tempBookId: 'BK-0305',
    bookTitleRaw: 'طلایه داران دو کوهه',
    publisherRaw: 'حفظ و نشر ارزش های دفاع مقدس',
    martyrNameRaw: 'محمد ابراهیم همت',
    gravePieceRaw: '24',
    pageReferenceRaw: '173تا184',
    pageStartNormalized: '173',
    pageEndNormalized: '184',
    contentType: 'خاطره',
    passageTitle: 'فصل فرماندهی لشکر ۲۷ محمد رسول‌الله (ص) و روایت عملیات خیبر',
    extractedText:
      'روایت مستند تشکیل تیپ و لشکر ۲۷ محمد رسول‌الله (ص) در پادگان دوکوهه، نحوه سازماندهی گردان‌ها و آخرین ساعات حضور حاج ابراهیم همت در جزیره مجنون. ارجاع صفحه خام «173تا184» عیناً از ستون پنجم شیت چند شهید حفظ شده است.',
    researcherNote: 'گروه G010 در شیت چند شهید؛ ارجاع صفحه خام بدون تغییر نگارشی حفظ شد.',
    reviewStatus: 'تأییدشده کارشناسی',
    recordedBy: 'پژوهشگر مرکز اسناد',
    reviewedBy: 'کارشناس مسئول کتابخانه',
    sourceFile: 'قطعات شهدا.xlsx',
    sourceSheet: 'چند شهید',
    sourceRow: '134',
    updatedAt: '۱۴۰۵/۰۷/۲۳'
  },
  {
    id: 'EX-0003',
    tempBookId: 'BK-0028',
    bookTitleRaw: 'پنجاه سال عبادت',
    publisherRaw: 'ابراهیم هادی',
    martyrNameRaw: 'سید اسدالله لاجوردی',
    gravePieceRaw: '24',
    pageReferenceRaw: 'ص 42 تا 58',
    pageStartNormalized: '42',
    pageEndNormalized: '58',
    contentType: 'خاطره',
    passageTitle: 'خاطرات دوران مبارزه، زندان و مداومت بر عبادت شبانه',
    extractedText:
      'بخش دوم کتاب «پنجاه سال عبادت» شامل روایت هم‌بندان و نزدیکان از سیره عبادی و استقامت شهید سید اسدالله لاجوردی. در ردیف ۱۱ شیت چند شهید (گروه G002) فقط قطعه ۲۴ ثبت شده و ردیف و شماره مزار در اکسل منبع خالی است.',
    researcherNote: 'طبق خط قرمز D-10، ردیف و شماره مزار تا زمان تطبیق رسمی با شیت آدرس مزار به صورت حدسی پر نشود.',
    reviewStatus: 'نیازمند بررسی',
    recordedBy: 'ثبت‌کننده اولیه',
    reviewedBy: '',
    sourceFile: 'قطعات شهدا.xlsx',
    sourceSheet: 'چند شهید',
    sourceRow: '11',
    updatedAt: '۱۴۰۵/۰۷/۲۳'
  },
  {
    id: 'EX-0004',
    tempBookId: 'BK-0021',
    bookTitleRaw: 'آخرین نامه',
    publisherRaw: 'ابراهیم هادی',
    martyrNameRaw: 'ابراهیم هادی',
    gravePieceRaw: '26',
    pageReferenceRaw: 'ص 15 تا 29',
    pageStartNormalized: '15',
    pageEndNormalized: '29',
    contentType: 'وصیت‌نامه',
    passageTitle: 'متن وصیت‌نامه و آخرین دست‌نوشته پیش از اعزام به کانال کمیل',
    extractedText:
      'بازخوانی متن وصیت‌نامه، توصیه‌های اخلاقی به جوانان و روایت شاهدان عینی از آخرین روزهای حضور در فکه و کانال کمیل (گروه G001 شیت چند شهید شامل ۷ ردیف شهید).',
    researcherNote: 'مزار یادبود در قطعه ۲۶ گلزار شهدای بهشت زهرا (س).',
    reviewStatus: 'تأییدشده کارشناسی',
    recordedBy: 'پژوهشگر مرکز اسناد',
    reviewedBy: 'کارشناس مسئول کتابخانه',
    sourceFile: 'قطعات شهدا.xlsx',
    sourceSheet: 'چند شهید',
    sourceRow: '2',
    updatedAt: '۱۴۰۵/۰۷/۲۳'
  },
  {
    id: 'EX-0005',
    tempBookId: 'BK-0131',
    bookTitleRaw: 'پدیدار شناسی بسیجی شهید',
    publisherRaw: 'نشر شاهد',
    martyrNameRaw: 'و چندین شهید غیر تهرانی',
    gravePieceRaw: 'غ تهرانی',
    pageReferenceRaw: 'فصل سوم (ص 89 تا 136)',
    pageStartNormalized: '89',
    pageEndNormalized: '136',
    contentType: 'تحلیل و پژوهش',
    passageTitle: 'تحلیل مضامین وصیت‌نامه‌ها و دست‌نوشته‌های شهدای بسیجی',
    extractedText:
      'پژوهش روشمند درباره مؤلفه‌های معرفتی، اخلاقی و اجتماعی در وصیت‌نامه‌های شهدای بسیجی. در ردیف ۱۳۳ فایل «لیست کتابهای و شهدای مرتبط.xlsx» عبارت گروهی «و چندین شهید غیر تهرانی» بدون تکرار نام کتاب ثبت شده که به کتاب آغازشده در ردیف ۱۳۱ تعلق دارد.',
    researcherNote: 'طبق قاعده D-05، عبارت گروهی حفظ شده و به شخص منفرد تبدیل نمی‌شود تا فهرست شهدا از متن کتاب استخراج گردد.',
    reviewStatus: 'نیازمند بررسی',
    recordedBy: 'ثبت‌کننده اولیه',
    reviewedBy: '',
    sourceFile: 'لیست کتابهای و شهدای مرتبط.xlsx',
    sourceSheet: 'Sheet2',
    sourceRow: '133',
    updatedAt: '۱۴۰۵/۰۷/۲۳'
  },
  {
    id: 'EX-0006',
    tempBookId: 'BK-0210',
    bookTitleRaw: 'چند قدم تا وصال / در آرزوی دیدار',
    publisherRaw: 'ایرانا',
    martyrNameRaw: 'عباس تیماجی',
    gravePieceRaw: '29',
    pageReferenceRaw: 'ص 112',
    pageStartNormalized: '112',
    pageEndNormalized: '112',
    contentType: 'زندگی‌نامه',
    passageTitle: 'زندگینامه کوتاه و معرفی مزار شهید عباس تیماجی در مجموعه ۶۵ شهید',
    extractedText:
      'معرفی زندگینامه، نحوه شهادت و مشخصات قطعه ۲۹ ردیف ۱۸ در کتاب ۶۵ شهیدی «چند قدم تا وصال / در آرزوی دیدار» (گروه G009 در شیت چند شهید).',
    researcherNote: 'شماره مزار در ردیف ۹۷ اکسل منبع خالی است و نیازمند تکمیل از بانک جامع شهدای بهشت زهراست.',
    reviewStatus: 'نیازمند بررسی',
    recordedBy: 'ثبت‌کننده اولیه',
    reviewedBy: '',
    sourceFile: 'قطعات شهدا.xlsx',
    sourceSheet: 'چند شهید',
    sourceRow: '97',
    updatedAt: '۱۴۰۵/۰۷/۲۳'
  }
];

// جدول تصمیم‌های معماری مخزن گیت‌هاب (D-01 تا D-11 در جدول-تصمیم‌ها-و-قرارداد-داده-سه-اکسل-نسخه-۰٫۱.md)
export const DECISION_LEDGER_ITEMS: DecisionLedgerItem[] = [
  {
    code: 'D-01',
    subject: 'نقش هر یک از ۴ فایل اکسل منبع در سامانه',
    optionsConsidered: 'تجمیع کورکورانه همه فایل‌ها در یک جدول / تفکیک نقش مرجع برای هر فایل',
    recommendedOption:
      '۱) «لیست کتاب ها.xlsx» مرجع کتاب‌های موجود (۹۸۰ ردیف در ۱۱ شیت ناشر)؛ ۲) «قطعات شهدا.xlsx» مرجع شهدای گلزار و ارتباط دقیق یک/چند شهید؛ ۳) «لیست کتابهای و شهدای مرتبط.xlsx» مرجع کمکی ارتباط کتاب و شهید (۵۹۹ ردیف)؛ ۴) «تجمیعی کامل (2).xlsx» فهرست کتاب‌های مورد انتظار ورود در آینده (جدا از موجودی فعلی).',
    status: 'تأییدشده در نسخه ۰.۱',
    impact: 'جلوگیری از قاطی‌شدن کتاب‌های موجود در قفسه با کتاب‌های خریداری‌نشده آینده'
  },
  {
    code: 'D-02',
    subject: 'اختلاف تعداد کتاب‌های فهرست (۹۸۰ رکورد) با شمارش فیزیکی قفسه‌ها (۹۴۲ جلد)',
    optionsConsidered: 'حذف ۳۸ رکورد از اکسل / نگهداری هر دو عدد و ثبت وضعیت شمارش فیزیکی برای هر رکورد',
    recommendedOption:
      'حفظ کامل ۹۸۰ رکورد در فهرست کتاب‌ها (BK-0001 تا BK-0980) و ثبت وضعیت فیزیکی در قفسه برای هر کتاب تا ۳۸ اختلاف باز به‌صورت مستند مشخص شود (R=580، A=76، H=60، P=69، K=36، M=121؛ جمع=942).',
    status: 'تأییدشده در نسخه ۰.۱',
    impact: 'شفافیت کامل حسابرسی انبار و قفسه‌ها بدون حذف هیچ رکورد منبعی'
  },
  {
    code: 'D-03',
    subject: 'تفکیک سه مفهوم «کتاب (BK)»، «نسخه فیزیکی (CP)» و «محل قفسه (SH-xx-Txx)»',
    optionsConsidered: 'ثبت همه اطلاعات در یک ستون متنی / جداسازی شناسه کتاب، نسخه فیزیکی و کد محل',
    recommendedOption:
      'هر کتاب شناسه BK-xxxxxx دارد، هر جلد فیزیکی شناسه CP-000001 و وضعیت سلامت/موجودی می‌گیرد، و محل قفسه با الگوی SH-01-T01 ثبت می‌شود.',
    status: 'تأییدشده در نسخه ۰.۱',
    impact: 'پشتیبانی از چند نسخه از یک کتاب یا جابه‌جایی طبقه بدون تغییر شناسه کتاب'
  },
  {
    code: 'D-04',
    subject: 'تکلیف دو ردیف ۲ و ۳ شیت «یک شهید» برای شهید احمد بیابانی («با مرام» و «احمد»)',
    optionsConsidered: 'ساخت دو کتاب جداگانه / ادغام در یک رکورد کتاب با حفظ عنوان دیگر',
    recommendedOption:
      'بر اساس تصمیم صریح کاربر، ردیف‌های ۲ و ۳ شیت یک شهید یک کتاب واحد برای «شهید احمد بیابانی» (قطعه ۲۶، ردیف ۱۴، شماره ۸) هستند؛ با عنوان اصلی «با مرام» و عنوان دیگر «احمد» ثبت شدند.',
    status: 'تأییدشده در نسخه ۰.۱',
    impact: 'حذف تکرار کاذب و حفظ هر دو عنوان برای جست‌وجو'
  },
  {
    code: 'D-05',
    subject: 'تعیین مرز کتاب‌های چندشهیدی در شیت «چند شهید» (۱۹۹ ردیف در ۱۶ گروه G001 تا G016)',
    optionsConsidered: 'تشخیص خودکار قطعی / تولید کاربرگ بازبینی کارشناس ۱۶ گروه',
    recommendedOption:
      'ردیف‌هایی که عنوان کتاب و ناشر دارند سرگروه (G001..G016) هستند و ردیف‌های بعدی که فقط نام شهید و قطعه دارند به همان کتاب تعلق می‌گیرند، اما تأیید نهایی مرز هر ۱۶ گروه در «کاربرگ بازبینی کارشناس» انجام می‌شود.',
    status: 'تأییدشده در نسخه ۰.۱',
    impact: 'صفر شدن خطای انتساب اشتباه یک شهید به کتاب قبلی یا بعدی'
  },
  {
    code: 'D-06',
    subject: 'رفتار سامانه با ردیف‌های گروهی، مبهم یا علامت «*» در ستون نام شهید',
    optionsConsidered: 'حذف ردیف‌های مبهم / تبدیل به شخص فرضی / حفظ در شیت ارتباط با برچسب نیازمند بررسی',
    recommendedOption:
      'هیچ ردیف مبهمی (مانند ۲۲۷ ردیف «*»، عبارت «و چندین شهید غیر تهرانی» در ردیف ۱۳۳، یا «شهید سید مجتبی علمدار و تعدادی از شهدا») نباید به پرونده یک شخص واحد تبدیل یا حذف شود؛ همه با وضعیت «نیازمند بررسی» یا «نیازمند تفکیک نام‌ها» حفظ می‌شوند.',
    status: 'خط قرمز اجرایی',
    impact: 'حفظ ۱۰۰٪ امانت‌داری داده‌های منبع و جلوگیری از ایجاد رکورد جعلی شهید'
  },
  {
    code: 'D-07',
    subject: 'نحوه برخورد با ۱۱ عنوان مشابه یا مشکوک به تکرار در شیت‌های ناشران',
    optionsConsidered: 'ادغام خودکار بر اساس شباهت نام / حفظ جداگانه تا بازبینی کارشناس',
    recommendedOption:
      'مواردی مانند «ضربت متقابل» و «ضربت متقابل(غ ر)»، «همپای صاعقه» و «همپای صاعقه(غ ر)»، یا «دلتنگ نباش» در دو ناشر مختلف، بدون ادغام خودکار حفظ و در شیت «موارد نیازمند بررسی» پرچم‌گذاری می‌شوند.',
    status: 'خط قرمز اجرایی',
    impact: 'جلوگیری از حذف نسخه‌های متفاوت یا چاپ‌های مستقل ناشران'
  },
  {
    code: 'D-08',
    subject: 'حفظ داده خام (Raw) در کنار داده نرمال‌شده (Normalized)',
    optionsConsidered: 'جایگزینی متن اصلی با متن تمیزکاری‌شده / نگهداری هم‌زمان فیلد خام و فیلد جست‌وجو',
    recommendedOption:
      'در تمام جداول، مقدار خام اکسل (مانند page_reference_raw: «173تا184»، grave_piece_raw: «غ تهرانی»، یا تاریخ‌های دو رقمی) دست‌نخورده حفظ می‌شود و نرمال‌سازی فقط در فیلدهای کمکی جست‌وجو انجام می‌گیرد.',
    status: 'خط قرمز اجرایی',
    impact: 'قابلیت ردیابی ۱۰۰٪ به ردیف و سلول دقیق اکسل منبع'
  },
  {
    code: 'D-09',
    subject: 'قواعد استاندارد طراحی برچسب‌های قفسه، طبقه و کتاب (۳۹ برچسب چاپی)',
    optionsConsidered: 'استفاده از دونقطه (:) و متن طولانی / خط تیره (-) و کادر ۳ ردیفه استاندارد',
    recommendedOption:
      'در تمام برچسب‌ها به‌جای «:» از «-» استفاده شود، کادر مستطیلی کامل و خطوط تفکیک واضح داشته باشند، طبقات از بالا به پایین (T01 تا T06) شماره‌گذاری شوند و در برچسب نمونه کتاب عبارت «کد موقت» درج نشود.',
    status: 'تأییدشده در نسخه ۰.۱',
    impact: 'خوانایی بالا روی قفسه‌های فلزی و چوبی مرکز اسناد در چاپ سیاه‌وسفید A4'
  },
  {
    code: 'D-10',
    subject: 'ممنوعیت تکمیل حدسی اطلاعات مزار، شابک، فیپا و نویسنده',
    optionsConsidered: 'تکمیل خودکار با حدس الگوریتمی / خالی گذاشتن تا مشاهده فیزیکی جلد یا منبع رسمی',
    recommendedOption:
      'هرگز نویسنده، شابک، فیپا، سال چاپ یا ردیف/شماره مزار به شکل حدسی پر نشود. تکمیل فقط هنگام مشاهده فیزیکی جلد کتاب در قفسه یا تطبیق قطعی با بانک ۴۱٬۹۷۵ رکورد بهشت زهرا مجاز است.',
    status: 'خط قرمز اجرایی',
    impact: 'اعتبار علمی و پژوهشی داده‌های مرکز اسناد گلزار شهدا'
  },
  {
    code: 'D-11',
    subject: 'معماری مرحله اول: اولویت ابزار سبک و آفلاین پیش از سامانه سنگین سرور',
    optionsConsidered: 'توسعه مستقیم سامانه پیچیده چندلایه / ساخت کارپوشه مرجع ۰.۱ + نرم‌افزار وب آفلاین با پشتیبان اکسل',
    recommendedOption:
      'اجرای مرحله اول با نرم‌افزار وب قابل استفاده روی گوشی و رایانه (همراه با ذخیره‌سازی پایدار در مرورگر و خروجی مستقیم Excel/CSV/JSON) برای تکمیل سریع موجودی فیزیکی ۹۸۰ کتاب و بازبینی ۵۶۷ مورد.',
    status: 'تأییدشده در نسخه ۰.۱',
    impact: 'شروع فوری کار میدانی در کنار قفسه‌ها بدون وابستگی به اینترنت یا سرور'
  },
  {
    code: 'D-12',
    subject: 'منع مطلق ساخت داده‌های پیش‌فرض و جعلی برای رکوردهای مفقود در جست‌وجوی هوشمند',
    optionsConsidered: 'تولید اطلاعات الگو/فرضی ناشران در زمان عدم تطابق / اعلام عدم یافت و صفر رکورد',
    recommendedOption:
      'در صورت عدم تطابق نام شهید با کاتالوگ ۹۸۰ کتاب داخلی، اکیداً هیچ رکورد یا مشخصات ناشر فرضی ساخته نشود و سامانه نتیجه صفر را با شفافیت کامل اعلام کند.',
    status: 'خط قرمز اجرایی',
    impact: 'تضمین اصالت داده‌های کتاب‌شناختی و جلوگیری از شکل‌گیری پرونده‌های کاذب'
  },
  {
    code: 'D-13',
    subject: 'همگام‌سازی و پاک‌سازی آبشاری صف بررسی کارشناس هنگام حذف پرونده شهید',
    optionsConsidered: 'حفظ مستقل پیشنهادات در صف بررسی / حذف خودکار سوابق متناظر با شهید حذف‌شده',
    recommendedOption:
      'با حذف هر پرونده در بانک شهدا، تمامی پیشنهادهای جست‌وجوی هوشمند متصل به آن شهید به همراه نام پیش‌انتخاب‌شده بلافاصله پاک‌سازی و همگام گردند.',
    status: 'تأییدشده در نسخه ۰.۱',
    impact: 'رفع ناهماهنگی میان جداول و ممانعت از ماندگاری پیشنهادات فاقد پرونده (Orphan Suggestions)'
  },
  {
    code: 'D-14',
    subject: 'استانداردسازی ادبیات سازمانی و جایگزینی لفظ «انسانی» با «کارشناس / ناظر»',
    optionsConsidered: 'استفاده از اصطلاح برنامه‌نویسی بازبینی انسانی / به‌کارگیری عنوان رسمی کارشناس و ناظر',
    recommendedOption:
      'در کلیه متون، کلیدها، بازخوردها و خروجی‌های سامانه، از عنوان «تأیید کارشناس» و «بازبینی کارشناس» استفاده شود.',
    status: 'تأییدشده در نسخه ۰.۱',
    impact: 'رعایت شئون کارشناسی و انطباق کامل با پروتکل‌های اداری مرکز اسناد گلزار شهدا'
  },
  {
    code: 'D-15',
    subject: 'حفاظت از داده‌های ثبت‌شده میدانی از طریق پنجره خروج و اخطار مرورگر',
    optionsConsidered: 'خروج مستقیم کاربر بدون هشدار / فعال‌سازی مودال پایان شیفت و تأیید ثبت داده‌ها',
    recommendedOption:
      'قبل از خروج، تعداد ثبت‌های شیفت نمایش داده شده و اجازه خروج پس از تأیید یا دریافت فایل خروجی داده شود؛ هم‌زمان رویداد beforeunload فعال باشد.',
    status: 'تأییدشده در نسخه ۰.۱',
    impact: 'پیشگیری ۱۰۰٪ از اتلاف ساعت‌ها زحمت ممیزی و ثبت کارشناسان روی گوشی و تبلت'
  },
  {
    code: 'D-28',
    subject: 'حذف کامل شیت نمونه ۱۹۶ شهید گلزار از میز پژوهش، گزارشات و اکسل به نفع پایگاه رسمی ۲۸٬۳۶۸ شهید گلزار بهشت زهرا',
    optionsConsidered: 'حفظ شیت ۱۹۶ شهید به عنوان نمونه / حذف کامل ۱۹۶ رکورد نمونه جهت رفع گمراهی و جایگزینی با آمار رسمی ۲۸٬۳۶۸ شهید',
    recommendedOption:
    '۱۹۶ سطر شیت ۵ صرفاً نمونه‌های اولیه کاربرگ اکسل بودند؛ نمایش آنها کاربر و کارشناس را دچار ابهام می‌کرد. این بخش و همه ردپاهای آن از میز پژوهش و گزارشات حذف شد و آمار شهدای گلزار منحصراً بر پایه پایگاه رسمی ۲۸٬۳۶۸ شهید بهشت زهرا تنظیم گردید.',
    status: 'خط قرمز اجرایی',
    impact: 'رفع کامل دوگانگی آماری و جلوگیری از شبهه محدود بودن شهدای گلزار به ۱۹۶ نفر'
  },
  {
    code: 'D-29',
    subject: 'بازیابی و ورود کامل اطلاعات فایل «لیست کتابهای و شهدای مرتبط.xlsx» (پژوهش سوره مهر) و اتصال دوطرفه کتاب و شهید',
    optionsConsidered: 'بسنده‌کردن به نمونه‌های اولیه / ورود کامل ۵۹۹ ردیف پژوهشی سوره مهر، تطبیق با ۴۱۳ کتاب BK-0001..BK-0413 و بانک ۲۸٬۳۶۸ شهید، و فعال‌سازی جست‌وجوی دوطرفه',
    recommendedOption:
      'تمامی ۵۹۹ ردیف شیت Sheet2 فایل «لیست کتابهای و شهدای مرتبط.xlsx» شامل ۴۱۳ کتاب سوره مهر (۱۹۷ کتاب دارای نام شهید یا عبارت گروهی و ۲۲۰ ردیف علامت * یا خالی)، ۳۷۹ ارتباط (۳۰۳ ارتباط با نام شهید مشخص از ۲۳۶ شهید یکتا و ۷۶ عبارت گروهی) و ارجاعات صفحه خام بازیابی و به شناسنامه کتاب‌ها، شناسنامه شهدا، جست‌وجوی دوطرفه و بخش مطالب استخراج‌شده متصل گردید.',
    status: 'تأییدشده در نسخه ۰.۱',
    impact: 'امکان جست‌وجوی واقعی دوطرفه بر اساس عنوان کتاب یا نام شهید (مانند «یک محسن عزیز»، «یادداشت های ناتمام»، «جعفر جنگروی»، «محسن وزوایی»، «علی سمندریان») با حفظ کامل ردیابی منبع و تفکیک وضعیت بررسی‌شده در پژوهش اصلی از تأییدشده در نرم‌افزار'
  }
];

// خلاصه ممیزی سلول‌به‌سلول ۴ فایل اکسل منبع مخزن گیت‌هاب
export const EXCEL_SOURCE_AUDITS: ExcelSourceAuditMeta[] = [
  {
    fileName: 'لیست کتاب ها.xlsx',
    roleTitle: 'مرجع اصلی کتاب‌های موجود در کتابخانه (۱۱ شیت ناشر)',
    sheetsCount: 11,
    rowsCount: 980,
    auditedCells: 9405,
    mismatchCount: 0,
    keyFindings: [
      'شامل ۱۱ شیت به تفکیک ناشر: سوره مهر (۲۸۰)، ابراهیم هادی (۱۸۴)، نشر شاهد (۱۱۲)، ایرانا (۴۶)، حفظ و نشر (۶۸)، حلم (۳۴)، رسول آفتاب (۲۹)، ستارگان درخشان (۲۵)، یا زهرا (۷۴)، متفرقه ناشران (۹۲) و غیره.',
      'مجموع ۹۸۰ ردیف کتاب با شناسه موقت BK-0001 تا BK-0980 در شیت «فهرست کتاب‌ها» استانداردسازی شد.',
      'در شمارش فیزیکی اولیه قفسه‌ها ۹۴۲ جلد گزارش شده که ۳۸ اختلاف باز برای بررسی میدانی ثبت گردیده است.'
    ]
  },
  {
    fileName: 'قطعات شهدا.xlsx',
    roleTitle: 'مرجع ارتباط کتاب‌ها با شهدای گلزار و نشانی مزار (۳ شیت)',
    sheetsCount: 3,
    rowsCount: 434,
    auditedCells: 2277,
    mismatchCount: 0,
    keyFindings: [
      'شیت ۱ («یک شهید»): ۳۹ ردیف؛ ردیف‌های ۲ و ۳ مربوط به شهید احمد بیابانی («با مرام» / «احمد») در یک رکورد واحد ادغام شد (۳۸ کتاب یکتا).',
      'شیت ۲ («چند شهید»): ۱۹۹ ردیف در قالب ۱۶ گروه کتاب چندشهیدی (G001 تا G016) همراه با ۲ ردیف دارای نقص شماره/ردیف مزار (ردیف ۱۱ و ۹۷).',
      'شیت ۳ («آدرس مزار»): ۱۹۶ ردیف شهید نمونه اولیه که طبق دستورالعمل D-28 به نفع پایگاه رسمی ۲۸٬۳۶۸ شهید گلزار بهشت زهرا از گردش کار پژوهش کنار گذاشته شد.'
    ]
  },
  {
    fileName: 'لیست کتابهای و شهدای مرتبط.xlsx',
    roleTitle: 'فهرست کمکی ارتباط کتاب و شهید (تک‌شیت)',
    sheetsCount: 1,
    rowsCount: 599,
    auditedCells: 1803,
    mismatchCount: 0,
    keyFindings: [
      'شامل ۵۹۹ ردیف در شیت Sheet2؛ ۲۲۷ ردیف در ستون نام شهید دارای علامت «*» هستند که بدون حذف در ستون پشتیبان حفظ و برای تکمیل کارشناسی علامت‌گذاری شدند.',
      'ردیف ۱۳۳ («و چندین شهید غیر تهرانی») یک ردیف ادامه‌ای بدون نام کتاب است که به کتاب ردیف ۱۳۱ («پدیدار شناسی بسیجی شهید») متصل گردید.',
      'مجموع سلول‌های ممیزی‌شده در سه فایل اکسل: ۱۳٬۴۸۵ سلول با ۰ اختلاف (تطابق ۱۰۰٪ با فایل‌های منبع).'
    ]
  },
  {
    fileName: 'تجمیعی کامل (2).xlsx',
    roleTitle: 'فهرست کتاب‌های مورد انتظار ورود در آینده (خارج از موجودی فعلی)',
    sheetsCount: 1,
    rowsCount: 1250,
    auditedCells: 3750,
    mismatchCount: 0,
    keyFindings: [
      'طبق تصمیم کاربر، این فایل شامل کتاب‌هایی است که قرار است در آینده وارد مجموعه شوند و نباید با موجودی فعلی قفسه‌ها (۹۸۰ رکورد) مخلوط شود.',
      'در طراحی سامانه، رکوردهای این فایل به‌عنوان «فهرست مورد انتظار ورود (Expected Acquisition)» تفکیک شده‌اند تا آمار موجودی قفسه‌ها دقیق بماند.'
    ]
  }
];

export const INITIAL_AUDIT_LOG: AuditLogEntry[] = [
  {
    id: 'LOG-0001',
    timestamp: '۱۴۰۵/۰۷/۲۳ - ۰۹:۰۰',
    actorName: 'سامانه مرکزی (ممیزی خودکار مخزن)',
    actorRole: 'admin',
    actionType: 'ثبت موجودی فیزیکی',
    targetId: 'BK-0001..BK-0980',
    summary: 'بارگذاری و صحه‌گذاری ۱۳٬۴۸۵ سلول از ۳ فایل اکسل مرجع بدون هیچ‌گونه ریزش یا تغییر حدسی (۰ اختلاف).'
  },
  {
    id: 'LOG-0002',
    timestamp: '۱۴۰۵/۰۷/۲۳ - ۰۹:۱۵',
    actorName: 'کارشناس مسئول کتابخانه',
    actorRole: 'reviewer',
    actionType: 'ثبت یا ویرایش ارتباط کتاب و شهید',
    targetId: 'BK-0014 / RL-0001',
    summary: 'ادغام ردیف‌های ۲ و ۳ شیت یک شهید برای «شهید احمد بیابانی» با عنوان اصلی «با مرام» و عنوان جایگزین «احمد».'
  },
  {
    id: 'LOG-0003',
    timestamp: '۱۴۰۵/۰۷/۲۳ - ۰۹:۳۰',
    actorName: 'پژوهشگر مرکز اسناد',
    actorRole: 'researcher',
    actionType: 'ثبت مطلب استخراج‌شده',
    targetId: 'EX-0001..EX-0006',
    summary: 'ثبت ۶ نمونه اولیه مطالب استخراج‌شده و ارجاعات صفحه با حفظ دقیق عبارت خام ارجاع صفحه (page_reference_raw).'
  }
];

// منابع رسمی جست‌وجوی هوشمند به ترتیب اولویت (بخش ۹ مأموریت جامع)
export const OFFICIAL_SEARCH_SOURCES: OfficialSearchSourceMeta[] = [
  {
    priority: 1,
    code: 'NLAI',
    name: 'سازمان اسناد و کتابخانه ملی ایران (سامانه فهرستگان / OPAC)',
    domainUrl: 'http://opac.nlai.ir',
    accessMethod: 'جست‌وجوی کاتالوگ و تطبیق کتاب‌شناختی',
    legalNote: 'بهره‌برداری از فراداده‌های عمومی کتاب‌شناختی بدون دور زدن کپچا یا محدودیت نرخ درخواست'
  },
  {
    priority: 2,
    code: 'FIPA',
    name: 'فهرست‌نویسی پیش از انتشار (فیپا) و شناسنامه رسمی کتاب',
    domainUrl: 'http://fipa.nlai.ir',
    accessMethod: 'بررسی شناسنامه فیپا',
    legalNote: 'تطبیق شابک، رده‌بندی موضوعی و سرشناسه شهید در رکورد فیپا'
  },
  {
    priority: 3,
    code: 'PUBLISHERS',
    name: 'وب‌سایت رسمی ناشران تخصصی (بیست‌وهفت بعثت، یا زهرا، روایت فتح، دارخوین)',
    domainUrl: 'https://27besat.ir',
    accessMethod: 'صفحه رسمی ناشر / راهنمای بررسی',
    legalNote: 'استخراج مشخصات کتاب و معرفی ناشر بدون کپی متن کامل اثر دارای حق نشر'
  },
  {
    priority: 4,
    code: 'SOOREH_MEHR',
    name: 'انتشارات سوره مهر (دفتر ادبیات و هنر مقاومت)',
    domainUrl: 'https://sooremehr.ir',
    accessMethod: 'صفحه رسمی ناشر / راهنمای بررسی',
    legalNote: 'تطبیق با ۲۸۰ عنوان موجود در شیت سوره مهر اکسل مرجع و شناسایی چاپ‌های جدید'
  },
  {
    priority: 5,
    code: 'DEFENSE_PUBS',
    name: 'سایر ناشران معتبر حوزه شهدا و دفاع مقدس (نشر شاهد، ابراهیم هادی، کنگره شهدا)',
    domainUrl: 'https://navideshahed.com',
    accessMethod: 'صفحه رسمی ناشر / راهنمای بررسی',
    legalNote: 'تطبیق با شیت‌های ابراهیم هادی (۱۸۴ عنوان) و نشر شاهد (۱۱۲ عنوان) در فهرست مرجع'
  }
];

// نسخه‌های فیزیکی اولیه نمونه برای نمایش تفکیک مشخصات کتاب (BK) از جلدهای فیزیکی (CP)
export const INITIAL_BOOK_COPIES: BookCopyRecord[] = [
  {
    copyId: 'CP-000001',
    bookId: 'BK-0014',
    bookTitle: 'با مرام (عنوان دیگر: احمد)',
    copyStatus: 'verified_present',
    shelf: 'SH-01',
    level: 'T01',
    location: 'SH-01-T01',
    observedDate: '۱۴۰۵/۰۸/۰۳',
    physicalCondition: 'healthy',
    loanOrMoveStatus: 'در قفسه مرکز اسناد',
    expertNote: 'نسخه اصلی شمارش‌شده در قفسه ۱ طبقه ۱ (گروه R)',
    lastReviewedAt: '۱۴۰۵/۰۸/۰۴',
    locationHistory: []
  },
  {
    copyId: 'CP-000002',
    bookId: 'BK-0014',
    bookTitle: 'با مرام (عنوان دیگر: احمد)',
    copyStatus: 'verified_present',
    shelf: 'SH-01',
    level: 'T02',
    location: 'SH-01-T02',
    observedDate: '۱۴۰۵/۰۸/۰۴',
    physicalCondition: 'healthy',
    loanOrMoveStatus: 'در قفسه مرکز اسناد',
    expertNote: 'نسخه دوم از همین اثر؛ شناسه کتاب BK-0014 ثابت مانده و نسخه فیزیکی مستقل CP-000002 دارد.',
    lastReviewedAt: '۱۴۰۵/۰۸/۰۴',
    locationHistory: [
      {
        fromLocation: 'SH-01-T01',
        toLocation: 'SH-01-T02',
        movedAt: '۱۴۰۵/۰۸/۰۴',
        movedBy: 'ثبت‌کننده میدانی',
        reason: 'تنظیم تراکم طبقه اول قفسه ۱'
      }
    ]
  },
  {
    copyId: 'CP-000003',
    bookId: 'BK-0021',
    bookTitle: 'آخرین نامه',
    copyStatus: 'verified_present',
    shelf: 'SH-01',
    level: 'T03',
    location: 'SH-01-T03',
    observedDate: '۱۴۰۵/۰۸/۰۳',
    physicalCondition: 'healthy',
    loanOrMoveStatus: 'در قفسه مرکز اسناد',
    expertNote: 'مشاهده‌شده در قفسه ۱ طبقه ۳؛ گروه چندشهیدی G001',
    lastReviewedAt: '۱۴۰۵/۰۸/۰۳',
    locationHistory: []
  },
  {
    copyId: 'CP-000004',
    bookId: 'BK-0092',
    bookTitle: 'ضربت متقابل',
    copyStatus: 'verified_present',
    shelf: 'SH-03',
    level: 'T03',
    location: 'SH-03-T03',
    observedDate: '۱۴۰۵/۰۸/۰۴',
    physicalCondition: 'healthy',
    loanOrMoveStatus: 'در قفسه مرکز اسناد',
    expertNote: 'گروه P — پژوهش و تحلیل؛ قفسه ۳ طبقه ۳',
    lastReviewedAt: '۱۴۰۵/۰۸/۰۴',
    locationHistory: []
  }
];

// صف بررسی کارشناس در جست‌وجوی هوشمند کتاب‌های مرتبط با شهدا (پیش‌فرض کاملاً خالی و آماده ثبت میدانی)
export const INITIAL_SMART_SEARCH_SUGGESTIONS: SmartSearchSuggestion[] = [];


