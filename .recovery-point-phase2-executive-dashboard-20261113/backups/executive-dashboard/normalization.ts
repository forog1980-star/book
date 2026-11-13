import type {
  BookMartyrLinkRecord,
  PendingReviewItem,
  ReferenceCatalogRow,
} from '../../data/markazAsnadData';
import type { GolzarRawMartyrInput, MartyrTaxonomicType } from './types';

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
