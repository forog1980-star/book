import type {
  AuditLogEntry,
  BookMartyrLinkRecord,
  PendingReviewItem,
  ReferenceCatalogRow,
} from '../../data/markazAsnadData';
import type { ActivityDomainKey, GolzarRawMartyrInput, MartyrTaxonomicType } from './types';

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function toEnglishDigits(input: unknown): string {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
}

/**
 * نرمال‌سازی خالص متن فارسی مطابق قواعد پروژه بدون وابستگی به DOM یا حافظه مرورگر.
 */
export function normalizePersian(input: unknown): string {
  if (input === null || input === undefined) return '';
  return toEnglishDigits(input)
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ')
    .replace(/[يىئ]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/[ؤ]/g, 'و')
    .replace(/[إأآ]/g, 'ا')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function compactPersian(input: unknown): string {
  return normalizePersian(input).replace(/\s+/g, '');
}

const HONORIFIC_TOKENS = new Set([
  'شهید',
  'شهیده',
  'شهیدان',
  'سردار',
  'امیر',
  'حاج',
  'حاجی',
  'حاجیه',
  'دکتر',
  'مهندس',
  'استاد',
  'سرهنگ',
  'سرلشکر',
  'تیمسار',
  'سپهبد',
  'امیرسرلشکر',
  'خلبان',
  'حجت',
  'الاسلام',
  'آیت',
  'الله',
  'اله',
  'دانشجو',
  'دانش',
  'آموز',
  'بسیجی',
  'پاسدار',
  'جانباز',
]);

/**
 * پاک‌سازی القاب رایج برای یکسان‌سازی نام شهید در مقایسه نام‌ها (نه برای ادغام هم‌نام‌ها).
 */
export function stripMartyrHonorifics(input: unknown): string {
  const norm = normalizePersian(input);
  if (!norm) return '';
  const tokens = norm.split(' ').filter(Boolean);
  const filtered = tokens.filter((tok, idx) => {
    if (idx === 0 && (tok === 'سید' || tok === 'سیده')) return true;
    return !HONORIFIC_TOKENS.has(tok);
  });
  return (filtered.length > 0 ? filtered : tokens).join(' ').trim();
}

/**
 * تشخیص ردیف‌های مبهم، علامت «*» یا عبارت‌های گروهی چندنفره که نام یک شخص واحد نیستند.
 */
export function isPlaceholderOrGroupMartyrPhrase(
  rawName: unknown,
  isGroupFlag?: boolean
): boolean {
  if (isGroupFlag) return true;
  const raw = String(rawName ?? '').trim();
  if (!raw || raw === '*' || /^[\*\-ـ_.\s?؟]+$/.test(raw)) return true;

  const norm = normalizePersian(raw);
  if (!norm) return true;

  if (
    /^(و\s+)?(چند|چندین|تعدادی|تنی چند|سایر|همه|گروهی|جمعی|شهدای)\b/.test(norm) ||
    /(اشاره به چند|چند شهید|چندین شهید|تعدادی از شهدا|جمعی از شهدا|شهدای گمنام|شهدای 72 تن|شهدای هفتاد و دو تن|غیر تهرانی)/.test(
      norm
    )
  ) {
    return true;
  }

  return false;
}

/**
 * طبقه‌بندی دقیق ردیف‌های بانک گلزار (مطابق منطق رسمی تب بانک جامع شهدا).
 */
export function classifyGolzarRowType(
  firstName: unknown,
  lastName: unknown
): MartyrTaxonomicType {
  const first = normalizePersian(firstName);
  const last = normalizePersian(lastName);
  const full = `${first} ${last}`.replace(/\s+/g, ' ').trim();

  if (/شهید\s*گمنام/.test(full)) return 'unknown_martyr';
  if (/^اموات$/.test(first) || /^اموات$/.test(full)) return 'non_martyr';
  return 'martyr';
}

export function cleanOptionalField(input: unknown): string {
  const txt = toEnglishDigits(input).replace(/\s+/g, ' ').trim();
  if (!txt || txt === '?' || txt === '؟' || txt === '-' || txt === '—' || txt === 'null') {
    return '';
  }
  return txt;
}

/**
 * کلید هویتی یکتا در کتابخانه بدون ادغام خودکار عناوین هم‌نام.
 */
export function resolveCatalogRowKey(row: ReferenceCatalogRow): string {
  const key = String(row.rowKey || '').trim();
  if (key) return key;
  const id = String(row.tempBookId || '').trim();
  if (id) return `BK::${id}`;
  return `ROW::${row.rowIndex}::${compactPersian(row.titleRaw)}`;
}

export interface ParsedTimestampResult {
  valid: boolean;
  calendarType: 'jalali' | 'gregorian' | null;
  periodKey: string; // "YYYY-MM" for Jalali or "ISO-YYYY-MM" for Gregorian
  reason: 'ok' | 'empty' | 'placeholder' | 'out_of_range' | 'unparseable';
}

/**
 * اعتبارسنجی دقیق مهر زمان (پشتیبانی از ISO میلادی و تاریخ‌های جلالی با ارقام فارسی/انگلیسی).
 * ردیف‌های دارای علامت خط تیره، متن غیرتاریخی یا ماه/روز نامعتبر را به عنوان نامعتبر گزارش می‌کند.
 */
export function parseStrictTimestamp(raw: unknown): ParsedTimestampResult {
  const text = toEnglishDigits(raw).trim();
  if (!text) {
    return { valid: false, calendarType: null, periodKey: '', reason: 'empty' };
  }
  if (/^[\-—_.\s?؟/\\]+$/.test(text) || text === 'ثبت‌نشده' || text === 'نامشخص') {
    return { valid: false, calendarType: null, periodKey: '', reason: 'placeholder' };
  }

  // 1) فرمت ISO یا میلادی استاندارد (سال 1990 تا 2100)
  const isoMatch = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?.*)?$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (year >= 1990 && year <= 2100) {
      if (month < 1 || month > 12 || day < 1 || day > 31) {
        return { valid: false, calendarType: null, periodKey: '', reason: 'out_of_range' };
      }
      const d = new Date(Date.UTC(year, month - 1, day));
      if (
        Number.isNaN(d.getTime()) ||
        d.getUTCFullYear() !== year ||
        d.getUTCMonth() !== month - 1 ||
        d.getUTCDate() !== day
      ) {
        return { valid: false, calendarType: null, periodKey: '', reason: 'out_of_range' };
      }
      return {
        valid: true,
        calendarType: 'gregorian',
        periodKey: `ISO-${year}-${String(month).padStart(2, '0')}`,
        reason: 'ok',
      };
    }

    // 2) تاریخ جلالی با فرمت YYYY/MM/DD (سال 1350 تا 1450)
    if (year >= 1350 && year <= 1450) {
      if (month < 1 || month > 12 || day < 1 || day > 31) {
        return { valid: false, calendarType: null, periodKey: '', reason: 'out_of_range' };
      }
      if (month >= 7 && day === 31) {
        return { valid: false, calendarType: null, periodKey: '', reason: 'out_of_range' };
      }
      if (month === 12 && day > 30) {
        return { valid: false, calendarType: null, periodKey: '', reason: 'out_of_range' };
      }
      return {
        valid: true,
        calendarType: 'jalali',
        periodKey: `${year}-${String(month).padStart(2, '0')}`,
        reason: 'ok',
      };
    }

    return { valid: false, calendarType: null, periodKey: '', reason: 'out_of_range' };
  }

  return { valid: false, calendarType: null, periodKey: '', reason: 'unparseable' };
}

/**
 * مبدل خالص برای استخراج شیت‌های ساختار یافته از فایل واقعی public/data/library_books.json
 * (بدون انجام هیچ fetch یا دسترسی به شبکه؛ فقط تبدیل JSON ازپیش‌بارگذاری‌شده).
 */
export function extractLibraryWorkbookInputsFromJson(rawJson: unknown): {
  catalogRows: ReferenceCatalogRow[];
  links: BookMartyrLinkRecord[];
  pendingReviews: PendingReviewItem[];
} {
  const root = Array.isArray(rawJson) ? rawJson[0] : rawJson;
  const sheets: Array<{ name?: string; rows?: unknown[][] }> = Array.isArray(
    (root as { sheets?: unknown[] } | null)?.sheets
  )
    ? ((root as { sheets: Array<{ name?: string; rows?: unknown[][] }> }).sheets)
    : [];

  const catalogSheet = sheets.find((s) => s.name === 'فهرست کتاب‌ها');
  const linkSheet = sheets.find((s) => s.name === 'ارتباط کتاب و شهید');
  const pendingSheet = sheets.find((s) => s.name === 'موارد نیازمند بررسی');

  const cell = (row: unknown[], idx: number): string =>
    row && row[idx] !== null && row[idx] !== undefined ? String(row[idx]).trim() : '';

  const catalogRows: ReferenceCatalogRow[] = (catalogSheet?.rows || [])
    .slice(1)
    .filter((r) => Array.isArray(r) && (cell(r, 0) || cell(r, 1)))
    .map((r, idx) => ({
      rowKey: `فهرست کتاب‌ها::ROW-${idx + 2}`,
      rowIndex: idx + 2,
      tempBookId: cell(r, 0),
      titleRaw: cell(r, 1),
      publisherRaw: cell(r, 2),
      descriptionRaw: cell(r, 3),
      categoryRaw: cell(r, 4),
      authorRaw: cell(r, 5),
      isbnRaw: cell(r, 6),
      fipaRaw: cell(r, 7),
      registrationNoRaw: cell(r, 8),
      locationRaw: cell(r, 9),
      countedCopiesRaw: cell(r, 10),
      reviewStatusRaw: cell(r, 11) || 'بررسی‌نشده',
      noteRaw: cell(r, 12),
      backupSourceSheet: cell(r, 13),
      backupSourceRow: cell(r, 14),
      allValues: r.map((v) => (v === null || v === undefined ? '' : String(v))),
    }));

  const links: BookMartyrLinkRecord[] = (linkSheet?.rows || [])
    .slice(1)
    .filter((r) => Array.isArray(r) && (cell(r, 0) || cell(r, 2)))
    .map((r) => {
      const martyrName = cell(r, 1);
      const reviewStatus = cell(r, 10) || 'بررسی‌نشده';
      const rawInSource = cell(r, 16);
      const isGroupPhrase =
        !martyrName ||
        martyrName === '*' ||
        rawInSource === '*' ||
        normalizePersian(reviewStatus).includes('تفکیک نام') ||
        isPlaceholderOrGroupMartyrPhrase(martyrName, false);
      return {
        id: cell(r, 0),
        martyrNameRaw: martyrName,
        bookTitleRaw: cell(r, 2),
        alternativeTitle: cell(r, 3),
        publisherRaw: cell(r, 4),
        sourceDescriptionRaw: cell(r, 5),
        pageReferenceRaw: cell(r, 6),
        gravePieceRaw: cell(r, 7),
        graveRowRaw: cell(r, 8),
        graveNumberRaw: cell(r, 9),
        reviewStatus,
        reviewerNote: cell(r, 11),
        tempBookId: cell(r, 12),
        sourceFile: cell(r, 13),
        sourceSheet: cell(r, 14),
        sourceExcelRow: cell(r, 15),
        rawNameInSource: rawInSource,
        groupStartRow: cell(r, 17),
        isGroupPhrase,
      };
    });

  const pendingReviews: PendingReviewItem[] = (pendingSheet?.rows || [])
    .slice(1)
    .filter((r) => Array.isArray(r) && cell(r, 0))
    .map((r) => ({
      trackingId: cell(r, 0),
      mainSheet: cell(r, 1),
      mainRecordId: cell(r, 2),
      nameOrPhrase: cell(r, 3),
      bookTitle: cell(r, 4),
      publisher: cell(r, 5),
      issueSubject: cell(r, 6),
      suggestedAction: cell(r, 7),
      trackingStatus: (cell(r, 8) as PendingReviewItem['trackingStatus']) || 'باز',
    }));

  return { catalogRows, links, pendingReviews };
}

/**
 * نرمال‌ساز خالص ردیف‌های خام اکسل golzar_martyrs.xlsx برای مصرف در selector آمار شهدا.
 */
export function normalizeGolzarRawRows(
  rows: Array<Record<string, unknown>>,
  source: 'golzar_martyrs' | 'outside_golzar_martyrs'
): GolzarRawMartyrInput[] {
  const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
  return rows.map((row, idx) => ({
    id: `${source}::${idx + 2}`,
    source,
    sourceRow: idx + 2,
    firstName: s(row['نام'] ?? row.firstName ?? row.first_name),
    lastName: s(row['نام خانوادگی'] ?? row.lastName ?? row.last_name),
    fatherName: s(row['نام پدر'] ?? row.fatherName ?? row.father_name),
    gravePiece: s(row['قطعه مزار'] ?? row.gravePiece ?? row.grave_piece),
    graveRow: s(row['ردیف مزار'] ?? row.graveRow ?? row.grave_row),
    graveNumber: s(row['شماره مزار'] ?? row.graveNumber ?? row.grave_number),
    birthYear: s(row['سال ولادت'] ?? row['سال تولد'] ?? row.birthYear),
    deathYear: s(row['سال شهادت'] ?? row.deathYear),
    operation: s(row['عملیات'] ?? row.operation),
    martyrdomCategory: s(row['دسته بندی شهادت'] ?? row.martyrdomCategory),
    martyrdomLocation: s(row['منطقه شهادت'] ?? row['محل شهادت'] ?? row.martyrdomLocation),
    description: s(row['توضیحات'] ?? row.description),
  }));
}

export type PendingReviewStatusKind = 'open' | 'needs_source' | 'resolved' | 'other';

export function classifyPendingReviewStatus(status: unknown): PendingReviewStatusKind {
  const comp = compactPersian(status || 'باز');
  if (
    !comp ||
    comp === 'باز' ||
    comp === 'درحالپیگیری' ||
    comp === 'درانتظار' ||
    comp === 'درانتظاربررسی'
  ) {
    return 'open';
  }
  if (comp === 'نیازمندمنبع' || comp === 'نیازمندتکمیلمنبع') {
    return 'needs_source';
  }
  if (
    comp === 'بررسیشده' ||
    comp === 'بسته' ||
    comp === 'بستهشده' ||
    comp === 'ردشدهبادلیل' ||
    comp === 'ردشده' ||
    comp === 'تاییدشده' ||
    comp === 'تاییدشدهکارشناسی' ||
    comp === 'تکمیلشده' ||
    comp === 'انجامشده' ||
    comp === 'حلشده' ||
    comp === 'رفعشده' ||
    comp === 'مختومه'
  ) {
    return 'resolved';
  }
  return 'other';
}

export function pickHigherPriorityPendingStatus(
  primary: string | undefined,
  secondary: string | undefined
): string {
  const rank = (val: string | undefined): number => {
    const kind = classifyPendingReviewStatus(val);
    if (kind === 'resolved') return 4;
    if (kind === 'other') return 3;
    if (kind === 'needs_source') return 2;
    return 1;
  };
  const p = (primary || '').trim();
  const s = (secondary || '').trim();
  if (!p) return s || 'باز';
  if (!s) return p;
  return rank(s) > rank(p) ? s : p;
}

/**
 * تفکیک موضوعات مستقل موجود در یک پرونده پیگیری (مثلاً جداشده با «؛» یا «;»)
 * به‌طوری که هر موضوع مستقل در یک پرونده به‌عنوان یک مورد کاری مستقل شمارش شود.
 */
export function splitCompoundIssueSubjects(issueSubject: unknown): string[] {
  const raw = String(issueSubject ?? '').trim();
  if (!raw) return ['پیگیری کارشناسی'];
  const parts = raw
    .split(/[؛;\n]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [raw];
}

export type WorkTopicDomainKey = 'library' | 'martyrs' | 'relations';

/**
 * دسته‌بندی یک موضوع کاری مستقل بین سه حوزه مصوب: کتابخانه، شهدا، یا ارتباطات.
 */
export function classifyWorkTopicDomain(
  mainSheet: unknown,
  issueTopic: unknown,
  mainRecordId?: unknown
): WorkTopicDomainKey {
  const topicNorm = normalizePersian(issueTopic);
  const sheetNorm = normalizePersian(mainSheet);
  const recId = String(mainRecordId ?? '').trim();

  // ۱. موضوعات مزار، احراز هویت شهید و تطبیق با بانک گلزار -> حوزه شهدا
  if (
    topicNorm.includes('مزار') ||
    topicNorm.includes('گلزار') ||
    topicNorm.includes('هویت') ||
    topicNorm.includes('همنامی شهید') ||
    sheetNorm.includes('گلزار') ||
    sheetNorm.includes('شهدا') ||
    /^(MR|SH|GLZ)-/i.test(recId)
  ) {
    return 'martyrs';
  }

  // ۲. موضوعات ردیف‌های شیت کتاب‌ها، تکرار عنوان/ناشر، شابک، قفسه و نسخه -> حوزه کتابخانه
  if (
    sheetNorm === 'فهرست کتاب ها' ||
    sheetNorm.includes('کتابخانه') ||
    /^BK-/i.test(recId) ||
    topicNorm.includes('تکرار احتمالی عنوان') ||
    topicNorm.includes('تکرار عنوان') ||
    topicNorm.includes('تکرار کتاب') ||
    topicNorm.includes('قفسه') ||
    topicNorm.includes('نسخه فیزیکی')
  ) {
    return 'library';
  }

  // ۳. موضوعات ارتباط کتاب و شهید، علامت *، عبارت گروهی و تطبیق کتاب-شهید -> حوزه ارتباطات
  return 'relations';
}

export function isDraftLabelOrStatus(textOrStatus: unknown): boolean {
  const norm = normalizePersian(textOrStatus);
  return (
    norm.includes('پیشنویس') ||
    norm.includes('پیش نویس') ||
    norm.includes('draft') ||
    norm.includes('موقت') ||
    norm.includes('ازمایشی')
  );
}

/**
 * نرمال‌سازی عنوان/نام فایل خروجی با حذف برچسب نسخه/ویرایش/تاریخ تا نسخه‌های متعدد یک گزارش یا محصول پژوهشی یک خروجی مستقل محسوب شوند.
 */
export function normalizeVersionedOutputIdentity(input: unknown): string {
  const raw = toEnglishDigits(input)
    .replace(/\.(xlsx|xls|json|csv|pdf|docx)$/i, '')
    .replace(/([_\-\s]+)(v|ver|version|rev|copy|نسخه|ویرایش|بازنگری|مجدد)[_\-\s]*\d*/gi, ' ')
    .replace(/\(\s*(نسخه|ویرایش|بازنگری|کپی|copy|v)?\s*\d*\s*\)/gi, ' ')
    .replace(/\d{4}[-_]\d{2}[-_]\d{2}(?:[T\-_]\d{2}[-_:]\d{2}(?:[-_:]\d{2})?)?/g, ' ')
    .replace(/\d{6,}/g, ' ');
  return normalizePersian(raw);
}

/**
 * تشخیص تایید صریح «ارتباطی یافت نشد» یا «فاقد ارتباط با شهید» در یادداشت‌های کارشناسی کتاب
 */
export function isNoMartyrFoundConfirmationText(input: unknown): boolean {
  const norm = normalizePersian(input);
  if (!norm) return false;
  return (
    norm.includes('ارتباطی یافت نشد') ||
    norm.includes('شهیدی یافت نشد') ||
    norm.includes('فاقد ارتباط با شهید') ||
    norm.includes('بدون ارتباط با شهید') ||
    norm.includes('فاقد شهید مرتبط') ||
    norm.includes('شهیدی ندارد')
  );
}

export const ACTIVITY_DOMAIN_LABELS: Record<ActivityDomainKey, string> = {
  library: 'کتابخانه',
  martyrs_relations: 'شهدا و ارتباطات',
  work_outputs: 'صف و خروجی‌ها',
  other: 'سایر / پشتیبان',
};

export function classifyAuditLogDomain(entry: Pick<AuditLogEntry, 'actionType' | 'targetId' | 'summary'>): {
  domain: ActivityDomainKey;
  label: string;
} {
  const act = normalizePersian(entry.actionType);
  const tid = String(entry.targetId || '').trim().toUpperCase();
  const sum = normalizePersian(entry.summary);

  let domain: ActivityDomainKey = 'other';

  if (
    act.includes('ارتباط') ||
    act.includes('شهید') ||
    /^(RL|MR|GLZ|SS)-/.test(tid)
  ) {
    domain = 'martyrs_relations';
  } else if (
    act.includes('موجودی') ||
    act.includes('کتاب') ||
    act.includes('قفسه') ||
    /^(BK|CP|OUT)-/.test(tid)
  ) {
    domain = 'library';
  } else if (
    act.includes('پیگیری') ||
    act.includes('استخراج') ||
    act.includes('خروجی') ||
    act.includes('گزارش') ||
    /^(PV|EX|REP|EXP)-/.test(tid) ||
    sum.includes('گزارش مدیریتی')
  ) {
    domain = 'work_outputs';
  }

  return { domain, label: ACTIVITY_DOMAIN_LABELS[domain] };
}

function jalaliToGregorianYmd(jyRaw: number, jm: number, jd: number): string {
  let jy = jyRaw - 979;
  let jmZero = jm - 1;
  let jdZero = jd - 1;

  let jDayNo =
    365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4);
  for (let i = 0; i < jmZero; ++i) {
    jDayNo += i < 6 ? 31 : 30;
  }
  jDayNo += jdZero;

  let gDayNo = jDayNo + 79;
  let gy = 1600 + 400 * Math.floor(gDayNo / 146097);
  gDayNo %= 146097;

  let leap = true;
  if (gDayNo >= 36525) {
    gDayNo -= 1;
    gy += 100 * Math.floor(gDayNo / 36524);
    gDayNo %= 36524;
    if (gDayNo >= 365) {
      gDayNo += 1;
    } else {
      leap = false;
    }
  }

  gy += 4 * Math.floor(gDayNo / 1461);
  gDayNo %= 1461;

  if (gDayNo >= 366) {
    leap = false;
    gDayNo -= 1;
    gy += Math.floor(gDayNo / 365);
    gDayNo %= 365;
  }

  const gDaysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (; gm < 12 && gDayNo >= gDaysInMonth[gm]; gm += 1) {
    gDayNo -= gDaysInMonth[gm];
  }
  const gd = gDayNo + 1;

  return `${gy}-${String(gm + 1).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}

/**
 * تبدیل تاریخ جلالی یا میلادی ثبت‌شده در تاریخچه فعالیت به فرمت قابل مقایسه YYYY-MM-DD میلادی
 */
export function parseAuditLogComparableDate(timestampRaw: unknown): string | null {
  const txt = toEnglishDigits(timestampRaw).trim();
  if (!txt) return null;
  const match = txt.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  if (year >= 1350 && year <= 1450) {
    return jalaliToGregorianYmd(year, month, day);
  }
  if (year >= 1990 && year <= 2100) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}
