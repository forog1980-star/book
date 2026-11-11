import * as XLSX from 'xlsx';
import {
  BookMartyrLinkRecord,
  CustomMartyrRecord,
  FieldAuditRecord,
  ReferenceCatalogRow,
  WorkbookGolzarMartyr,
  normalizePersianText
} from '../data/markazAsnadData';

export interface LightweightGolzarMartyr {
  id: string;
  fullName: string;
  normalizedFullName: string;
  compactFullName: string;
  firstName: string;
  lastName: string;
  fatherName: string;
  gravePiece: string;
  graveRow: string;
  graveNumber: string;
  martyrdomOperation: string;
  source: 'golzar' | 'outside';
}

let cachedGolzarMartyrs: LightweightGolzarMartyr[] | null = null;
let cachedGolzarByNormName = new Map<string, LightweightGolzarMartyr>();
let cachedGolzarByCompactName = new Map<string, LightweightGolzarMartyr>();
let cachedTotalRecordsCount = 28368;
let golzarCacheEpoch = 0;
let loadingPromise: Promise<LightweightGolzarMartyr[]> | null = null;
const golzarLoadListeners = new Set<() => void>();

// کش‌های O(1) برای جلوگیری از تکرار پردازش‌های متنی در رندرها
let evaluationCache = new Map<string, MartyrTehranEvaluation>();
let bookExtractCache = new Map<string, LightweightGolzarMartyr[]>();
let lastEnrichedLinksCache: {
  catalogRowsRef: ReferenceCatalogRow[];
  auditRecordsRef: Record<string, FieldAuditRecord>;
  linksRef: BookMartyrLinkRecord[];
  epoch: number;
  result: BookMartyrLinkRecord[];
} | null = null;

// کش دائمی یک‌بار مصرف (One-Time Persistent Index) در حافظه مرورگر برای حذف کامل معطلی در بارگذاری‌های بعدی
const TEHRAN_DETERMINED_INDEX_STORAGE_KEY = 'book_tehran_determined_index_v2';

interface PersistedTehranDeterminedIndex {
  version: 2;
  catalogCount: number;
  knownMartyrs: LightweightGolzarMartyr[];
  autoBookLinks: BookMartyrLinkRecord[];
}

let persistedAutoBookLinks: BookMartyrLinkRecord[] | null = null;

function loadPersistedTehranIndexSync(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(TEHRAN_DETERMINED_INDEX_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as PersistedTehranDeterminedIndex;
    if (parsed && parsed.version === 2 && Array.isArray(parsed.knownMartyrs)) {
      for (const item of parsed.knownMartyrs) {
        if (!item?.fullName) continue;
        const strippedNorm = stripTitlesForTehranIndex(item.fullName);
        const norm = item.normalizedFullName || normalizePersianText(item.fullName.replace(/^شهید\s+/, ''));
        const compact = item.compactFullName || compactNameForTehranIndex(item.fullName);
        if (strippedNorm && !cachedGolzarByNormName.has(strippedNorm)) {
          cachedGolzarByNormName.set(strippedNorm, item);
        }
        if (norm && !cachedGolzarByNormName.has(norm)) {
          cachedGolzarByNormName.set(norm, item);
        }
        if (compact && !cachedGolzarByCompactName.has(compact)) {
          cachedGolzarByCompactName.set(compact, item);
        }
      }
      if (Array.isArray(parsed.autoBookLinks) && parsed.autoBookLinks.length > 0) {
        persistedAutoBookLinks = parsed.autoBookLinks;
      }
      golzarCacheEpoch += 1;
    }
  } catch {
    // ignore storage errors
  }
}

function savePersistedTehranIndexSync(
  catalogCount: number,
  knownMartyrsMap: Map<string, LightweightGolzarMartyr>,
  autoBookLinks: BookMartyrLinkRecord[]
): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: PersistedTehranDeterminedIndex = {
      version: 2,
      catalogCount,
      knownMartyrs: Array.from(knownMartyrsMap.values()),
      autoBookLinks
    };
    persistedAutoBookLinks = autoBookLinks;
    window.localStorage.setItem(TEHRAN_DETERMINED_INDEX_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota errors
  }
}

export function subscribeToGolzarMartyrsLoaded(listener: () => void): () => void {
  golzarLoadListeners.add(listener);
  if (cachedGolzarMartyrs && cachedGolzarMartyrs.length > 0) {
    listener();
  }
  return () => {
    golzarLoadListeners.delete(listener);
  };
}

function cleanCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).replace(/\?/g, '').trim();
}

export function stripTitlesForTehranIndex(raw: unknown): string {
  const norm = normalizePersianText(raw);
  if (!norm) return '';
  return norm
    .replace(
      /^(شهید|سردار|حاج|دکتر|مهندس|امام|آیت الله|ایت الله|حجت الاسلام|سرلشکر|سپهبد|امیر|جاویدالاثر|جاوید الاثر|مدافع حرم|پاسدار|بسیجی|طلبه|آقا|اقا|شیخ)\s+/g,
      ''
    )
    .replace(
      /^(شهید|سردار|حاج|دکتر|مهندس|سرلشکر|سپهبد|امیر|جاویدالاثر|جاوید الاثر|مدافع حرم|آقا|اقا)\s+/g,
      ''
    )
    .replace(/الله/g, 'اله')
    .replace(/ئ/g, 'ی')
    .trim();
}

export function compactNameForTehranIndex(raw: unknown): string {
  const stripped = stripTitlesForTehranIndex(raw);
  if (!stripped) return '';
  return stripped.replace(/[^\p{L}\p{N}]/gu, '').trim();
}

/**
 * حذف عبارت‌های مربوط به نام ناشر (به‌ویژه «انتشارات ابراهیم هادی» / «نشر ابراهیم هادی») و یادداشت‌های سیستمی خودکار
 * از متن توضیحات کتاب تا هرگز نام انتشارات با نام شهید یا عنوان کتاب اشتباه گرفته نشود.
 */
export function stripPublisherAndAutoNotesForMartyrMatch(
  rawText: unknown,
  publisherRaw?: unknown
): string {
  if (!rawText) return '';
  let text = String(rawText)
    // حذف یادداشت‌های خودکار قبلی که باعث حلقه تکرار نیازمند بررسی می‌شدند
    .replace(/\|?\s*⚠️\s*نیازمند بررسی:?\s*تشابه نام با[^|]*/g, ' ')
    .replace(/⚠️\s*نیازمند بررسی[^|]*/g, ' ')
    .replace(/تشابه نام با شهید[^|]*/g, ' ');

  let norm = normalizePersianText(text);
  if (!norm) return '';

  // حذف صریح عبارات ناشر/انتشارات ابراهیم هادی که هم‌نام با شهید ابراهیم هادی است
  norm = norm
    .replace(
      /(?:انتشارات|نشر|موسسه|مؤسسه|گروه فرهنگی|مرکز نشر|چاپ)\s+(?:شهید\s+)?ابراهیم\s+هادی/g,
      ' '
    )
    .replace(/ناشر\s*:?\s*(?:انتشارات\s+|نشر\s+)?(?:شهید\s+)?ابراهیم\s+هادی/g, ' ');

  // اگر نام ناشر کتاب صراحتاً مشخص است، عبارت «انتشارات <نام ناشر>» یا «نشر <نام ناشر>» را از متن توضیحات پاک کن
  const pubClean = normalizePersianText(publisherRaw || '')
    .replace(/^(?:انتشارات|نشر|موسسه|مؤسسه|گروه فرهنگی)\s+/g, '')
    .trim();
  if (pubClean && pubClean.length >= 3) {
    const escapedPub = pubClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    norm = norm.replace(
      new RegExp(`(?:انتشارات|نشر|ناشر|گروه فرهنگی|موسسه)\\s*:?\\s*(?:شهید\\s+)?${escapedPub}`, 'g'),
      ' '
    );
  }

  return norm.replace(/\s+/g, ' ').trim();
}

// بارگذاری هم‌زمان نمایه ذخیره‌شده در بدو اجرای ماژول (بدون هیچ معطلی)
loadPersistedTehranIndexSync();

/**
 * تشخیص صریح ثبت «غیر تهرانی» (غ تهرانی) در قطعه مزار، نام یا توضیحات
 * طبق دستور اکید کاربر: شهدایی که در شیت‌ها «غ تهرانی» یا «غیر تهرانی» ثبت شده‌اند هرگز نباید نشان «تهرانی» بگیرند،
 * و اگر هم‌نام با یکی از ۲۸٬۳۶۸ شهید تهران باشند باید به «نیازمند بررسی کارشناس» بروند.
 */
export function isExplicitlyNonTehranRecord(params: {
  gravePiece?: string;
  martyrName?: string;
  sourceDesc?: string;
  reviewerNote?: string;
  reviewStatus?: string;
}): boolean {
  const pieceNorm = normalizePersianText(params.gravePiece || '');
  if (
    pieceNorm === 'غ تهرانی' ||
    pieceNorm.includes('غ تهرانی') ||
    pieceNorm.includes('غیر تهرانی') ||
    pieceNorm.includes('غیرتهرانی') ||
    pieceNorm.includes('شهرستان')
  ) {
    return true;
  }

  const combinedText = normalizePersianText(
    `${params.martyrName || ''} ${params.sourceDesc || ''} ${params.reviewerNote || ''}`
  );
  if (
    combinedText.includes('غ تهرانی') ||
    combinedText.includes('غیر تهرانی') ||
    combinedText.includes('غیرتهرانی') ||
    combinedText.includes('شهدای غیر تهرانی') ||
    combinedText.includes('شهید غیر تهرانی') ||
    combinedText.includes('استان خراسان') ||
    combinedText.includes('استان همدان') ||
    combinedText.includes('استان کرمانشاه') ||
    combinedText.includes('استان اصفهان') ||
    combinedText.includes('استان فارس') ||
    combinedText.includes('استان خوزستان') ||
    combinedText.includes('استان مازندران') ||
    combinedText.includes('استان گیلان') ||
    combinedText.includes('گلزار شهدای قم') ||
    combinedText.includes('گلزار شهدای مشهد') ||
    combinedText.includes('گلزار شهدای اصفهان') ||
    combinedText.includes('گلزار شهدای شیراز') ||
    combinedText.includes('گلزار شهدای تبریز') ||
    combinedText.includes('گلزار شهدای همدان') ||
    combinedText.includes('گلزار شهدای کرمانشاه')
  ) {
    return true;
  }

  return false;
}

const TEHRAN_GOLZAR_KNOWN_PIECES = new Set([
  '17',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '25 مکرر',
  'قطعه 25 مکرر',
  '26',
  '27',
  '28',
  '29',
  '30',
  '31',
  '32',
  '33',
  '34',
  '35',
  '36',
  '37',
  '39',
  '40',
  '44',
  '45',
  '50',
  '53',
  '55',
  '231',
  '72تن',
  '72 تن',
  'یادمان شهدای 72تن',
  'یادمان شهدای 72 تن',
  'خارج از قطعات',
  'قطعات عمومی'
]);

/**
 * بررسی اینکه آیا قطعه مزار متعلق به گلزار شهدای بهشت زهرا (س) تهران (قطعات شهدا یا خارج از قطعات در بهشت زهرا) است یا خیر
 */
export function isTehranGolzarPiece(gravePieceRaw?: string): boolean {
  if (!gravePieceRaw) return false;
  const norm = normalizePersianText(gravePieceRaw)
    .replace(/^قطعه\s+/, '')
    .trim();
  if (!norm || norm === '—' || norm === '-' || norm === '*' || norm === 'نامشخص') {
    return false;
  }
  if (isExplicitlyNonTehranRecord({ gravePiece: gravePieceRaw })) {
    return false;
  }
  if (TEHRAN_GOLZAR_KNOWN_PIECES.has(norm) || TEHRAN_GOLZAR_KNOWN_PIECES.has(normalizePersianText(gravePieceRaw))) {
    return true;
  }
  // قطعات عددی بهشت زهرا (س) تهران (داخل قطعات شهدا و خارج از قطعات تا ۳۲۵)
  if (/^\d{1,3}$/.test(norm)) {
    const num = parseInt(norm, 10);
    if (num >= 1 && num <= 325) {
      return true;
    }
  }
  return false;
}

// نام‌های بسیار کوتاه یا عمومی تک‌کلمه‌ای که به تنهایی نباید تطبیق کاذب ایجاد کنند
const GENERIC_SINGLE_WORDS = new Set([
  'علی',
  'محمد',
  'حسین',
  'حسن',
  'مهدی',
  'رضا',
  'احمد',
  'محسن',
  'عباس',
  'اکبر',
  'اصغر',
  'جعفر',
  'صادق',
  'باقر',
  'موسی',
  'ابراهیم',
  'اسماعیل',
  'یوسف',
  'داود',
  'داوود',
  'سعید',
  'حمید',
  'مجید',
  'وحید',
  'امیر',
  'مجتبی',
  'مصطفی',
  'مرتضی',
  'سید',
  'شهید',
  'امام',
  'حاج',
  'کربلا',
  'تهران',
  'ایران',
  'اسلام',
  'انقلاب',
  'دفاع',
  'مقدس',
  'جنگ',
  'خاطرات',
  'کتاب',
  'نامه',
  'پرواز',
  'آسمان'
]);

export function isDistinctMartyrFullName(normalizedName: string): boolean {
  const clean = normalizedName.replace(/^شهید\s+/, '').trim();
  if (clean.length < 6) return false;
  const tokens = clean.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return false;
  // حداقل یکی از بخش‌ها (معمولاً نام خانوادگی) نباید صرفاً پیشوند سید/حاج یا نام کوچک عام باشد
  const nonPrefixTokens = tokens.filter((t) => t !== 'سید' && t !== 'حاج' && t !== 'شیخ' && t !== 'امیر');
  if (nonPrefixTokens.length < 2) return false;
  const lastToken = nonPrefixTokens[nonPrefixTokens.length - 1];
  if (lastToken.length < 3) return false;
  // اگر هر دو کلمه جزو نام‌های کوچک تک‌کلمه‌ای بسیار عام باشند (مثل «محمد علی» یا «علی حسن»)، بدون نام خانوادگی مشخص تطبیق خودکار سراسری نزنیم
  const allGeneric = nonPrefixTokens.every((t) => GENERIC_SINGLE_WORDS.has(t));
  if (allGeneric) return false;
  return true;
}

export async function loadCachedGolzarMartyrs(): Promise<LightweightGolzarMartyr[]> {
  if (cachedGolzarMartyrs) return cachedGolzarMartyrs;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const res = await fetch('./data/golzar_martyrs.xlsx');
      if (!res.ok) return [];
      const buf = await res.arrayBuffer();
      // تنفس کوتاه نخ اصلی مرورگر پیش از پارس فایل اکسل ۲۸ هزار نفری
      await new Promise((r) => setTimeout(r, 0));
      const wb = XLSX.read(buf, { type: 'array', cellDates: false });

      const golzarRows = wb.Sheets['golzar_martyrs']
        ? XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['golzar_martyrs'], { defval: '' })
        : [];
      const outsideRows = wb.Sheets['outside_golzar_martyrs']
        ? XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['outside_golzar_martyrs'], { defval: '' })
        : [];

      // تنفس کوتاه نخ اصلی مرورگر پیش از ساخت جدول هش ۲۸٬۳۶۸ شهید
      await new Promise((r) => setTimeout(r, 0));

      cachedTotalRecordsCount = golzarRows.length + outsideRows.length || 28368;
      const list: LightweightGolzarMartyr[] = [];
      const byNorm = new Map<string, LightweightGolzarMartyr>();
      const byCompact = new Map<string, LightweightGolzarMartyr>();

      golzarRows.forEach((r, idx) => {
        const fn = cleanCell(r['نام']);
        const ln = cleanCell(r['نام خانوادگی']);
        const fullName = `${fn} ${ln}`.trim();
        if (!fullName || fullName.includes('گمنام')) return;
        const norm = normalizePersianText(fullName.replace(/^شهید\s+/, ''));
        if (!norm) return;
        const strippedNorm = stripTitlesForTehranIndex(fullName);
        const compact = compactNameForTehranIndex(fullName);
        const item: LightweightGolzarMartyr = {
          id: `G-${idx + 2}`,
          fullName,
          normalizedFullName: norm,
          compactFullName: compact,
          firstName: fn,
          lastName: ln,
          fatherName: cleanCell(r['نام پدر']),
          gravePiece: cleanCell(r['قطعه مزار']),
          graveRow: cleanCell(r['ردیف مزار']),
          graveNumber: cleanCell(r['شماره مزار']),
          martyrdomOperation: cleanCell(r['عملیات']),
          source: 'golzar'
        };
        list.push(item);
        if (strippedNorm && !byNorm.has(strippedNorm)) byNorm.set(strippedNorm, item);
        if (norm && !byNorm.has(norm)) byNorm.set(norm, item);
        if (compact && !byCompact.has(compact)) byCompact.set(compact, item);
      });

      outsideRows.forEach((r, idx) => {
        const fn = cleanCell(r['نام']);
        const ln = cleanCell(r['نام خانوادگی']);
        const fullName = `${fn} ${ln}`.trim();
        if (!fullName || fullName.includes('گمنام')) return;
        const norm = normalizePersianText(fullName.replace(/^شهید\s+/, ''));
        if (!norm) return;
        const strippedNorm = stripTitlesForTehranIndex(fullName);
        const compact = compactNameForTehranIndex(fullName);
        const item: LightweightGolzarMartyr = {
          id: `O-${idx + 2}`,
          fullName,
          normalizedFullName: norm,
          compactFullName: compact,
          firstName: fn,
          lastName: ln,
          fatherName: cleanCell(r['نام پدر']),
          gravePiece: cleanCell(r['قطعه مزار']),
          graveRow: cleanCell(r['ردیف مزار']),
          graveNumber: cleanCell(r['شماره مزار']),
          martyrdomOperation: '',
          source: 'outside'
        };
        list.push(item);
        if (strippedNorm && !byNorm.has(strippedNorm)) byNorm.set(strippedNorm, item);
        if (norm && !byNorm.has(norm)) byNorm.set(norm, item);
        if (compact && !byCompact.has(compact)) byCompact.set(compact, item);
      });

      cachedGolzarMartyrs = list;
      cachedGolzarByNormName = byNorm;
      cachedGolzarByCompactName = byCompact;
      golzarCacheEpoch += 1;
      evaluationCache.clear();
      bookExtractCache.clear();
      lastEnrichedLinksCache = null;

      golzarLoadListeners.forEach((cb) => {
        try {
          cb();
        } catch {
          // ignore listener error
        }
      });
      return list;
    } catch {
      return [];
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

export function getCachedGolzarMartyrsSync(): LightweightGolzarMartyr[] {
  return cachedGolzarMartyrs || [];
}

export function getGolzarTotalRecordsCount(): number {
  return cachedTotalRecordsCount;
}

export function findMartyrRecordIn28k(
  martyrName: string,
  golzarMartyrs?: LightweightGolzarMartyr[]
): LightweightGolzarMartyr | null {
  if (!martyrName || martyrName === '*') return null;
  const stripped = stripTitlesForTehranIndex(martyrName);
  if (!stripped || stripped.length < 4) return null;
  const compact = compactNameForTehranIndex(martyrName);

  // جست‌وجوی O(1) در جدول هش ۲۸٬۳۶۸ شهید گلزار تهران (بدون پیمایش خطی آرایه در صورت عدم تطابق!)
  if (cachedGolzarByNormName.size > 0 && (!golzarMartyrs || golzarMartyrs === cachedGolzarMartyrs)) {
    const byN = cachedGolzarByNormName.get(stripped);
    if (byN) return byN;
    if (compact) {
      const byC = cachedGolzarByCompactName.get(compact);
      if (byC) return byC;
    }
    return null;
  }

  if (cachedGolzarByNormName.size > 0) {
    const byN = cachedGolzarByNormName.get(stripped);
    if (byN) return byN;
    if (compact) {
      const byC = cachedGolzarByCompactName.get(compact);
      if (byC) return byC;
    }
  }

  const list = golzarMartyrs || [];
  if (list.length === 0) return null;
  const exact = list.find(
    (gm) => gm.normalizedFullName === stripped || gm.compactFullName === compact
  );
  return exact || null;
}

export function findMartyrGraveIn28k(
  martyrName: string,
  golzarMartyrs: LightweightGolzarMartyr[]
): { gravePiece: string; graveRow: string; graveNumber: string } | null {
  const found = findMartyrRecordIn28k(martyrName, golzarMartyrs);
  if (found) {
    return {
      gravePiece: found.gravePiece,
      graveRow: found.graveRow,
      graveNumber: found.graveNumber
    };
  }
  return null;
}

export interface MartyrTehranEvaluation {
  /** آیا شهید قطعی/منطبق با شهدای تهرانی (گلزار شهدای تهران) است و باید نشان قرمزرنگ «تهرانی» بگیرد؟ */
  isTehran: boolean;
  /** آیا به صورت صریح «غ تهرانی» یا غیرتهرانی ثبت شده است؟ */
  isNonTehran: boolean;
  /** آیا با وجود ثبت به عنوان «غ تهرانی»، هم‌نام با یکی از شهدای ۲۸٬۳۶۸ نفری تهران است و باید به «نیازمند بررسی کارشناس» برود؟ */
  hasHomonymIn28kNeedsReview: boolean;
  matchedGolzarRecord: LightweightGolzarMartyr | null;
}

/**
 * ارزیابی دقیق وضعیت «تهرانی» بودن یک شهید بر اساس:
 * ۱. استثنای صریح شهدای غیرتهرانی («غ تهرانی» هرگز نشان تهرانی نمی‌گیرد و در صورت تشابه اسمی با ۲۸ هزار شهید به نیازمند بررسی می‌رود)
 * ۲. داشتن آدرس مزار در قطعات گلزار شهدای تهران (از خارج از قطعات تا قطعات ۲۱، ۲۴، ۲۶، ۲۷، ۲۸، ۲۹، ۴۰، ۵۰، ۵۳ و ...)
 * ۳. تطابق نام با بانک ۲۸٬۳۶۸ شهید گلزار شهدای تهران
 */
export function evaluateMartyrTehranStatus(
  params: {
    martyrName?: string;
    gravePiece?: string;
    graveRow?: string;
    graveNumber?: string;
    sourceDesc?: string;
    reviewerNote?: string;
    reviewStatus?: string;
    isGroupPhrase?: boolean;
  },
  golzarMartyrs?: LightweightGolzarMartyr[]
): MartyrTehranEvaluation {
  const nameRaw = (params.martyrName || '').trim();
  const useCache = !golzarMartyrs || golzarMartyrs === cachedGolzarMartyrs;
  const cacheKey = useCache
    ? `${golzarCacheEpoch}|${nameRaw}|${params.gravePiece || ''}|${params.sourceDesc || ''}|${params.reviewerNote || ''}|${params.isGroupPhrase ? 1 : 0}`
    : '';

  if (useCache && cacheKey) {
    const cached = evaluationCache.get(cacheKey);
    if (cached) return cached;
  }

  if (!nameRaw || nameRaw === '*' || params.isGroupPhrase) {
    const res: MartyrTehranEvaluation = {
      isTehran: false,
      isNonTehran: isExplicitlyNonTehranRecord(params),
      hasHomonymIn28kNeedsReview: false,
      matchedGolzarRecord: null
    };
    if (useCache && cacheKey) evaluationCache.set(cacheKey, res);
    return res;
  }

  const nonTehran = isExplicitlyNonTehranRecord(params);
  const matchedIn28k = findMartyrRecordIn28k(nameRaw, golzarMartyrs);

  if (nonTehran) {
    const res: MartyrTehranEvaluation = {
      isTehran: false,
      isNonTehran: true,
      hasHomonymIn28kNeedsReview: Boolean(matchedIn28k),
      matchedGolzarRecord: matchedIn28k
    };
    if (useCache && cacheKey) evaluationCache.set(cacheKey, res);
    return res;
  }

  const hasTehranPiece = isTehranGolzarPiece(params.gravePiece);
  if (hasTehranPiece || matchedIn28k) {
    const res: MartyrTehranEvaluation = {
      isTehran: true,
      isNonTehran: false,
      hasHomonymIn28kNeedsReview: false,
      matchedGolzarRecord: matchedIn28k
    };
    if (useCache && cacheKey) evaluationCache.set(cacheKey, res);
    return res;
  }

  const res: MartyrTehranEvaluation = {
    isTehran: false,
    isNonTehran: false,
    hasHomonymIn28kNeedsReview: false,
    matchedGolzarRecord: null
  };
  if (useCache && cacheKey) evaluationCache.set(cacheKey, res);
  return res;
}


/**
 * تجمیع تمام کتاب‌های موجود در سامانه (۹۸۰ کتاب مرجع + کتاب‌های جدید خارج از فهرست ثبت‌شده در کتابخانه)
 * توجه: یادداشت‌های سیستمی (notes) یا نام ناشر هرگز وارد descriptionRaw نمی‌شوند تا با نام شهید اشتباه گرفته نشوند.
 */
export function getAllUnifiedBooks(
  catalogRows: ReferenceCatalogRow[],
  auditRecords: Record<string, FieldAuditRecord> = {}
): ReferenceCatalogRow[] {
  const map = new Map<string, ReferenceCatalogRow>();
  for (const row of catalogRows) {
    const audit = auditRecords[row.rowKey];
    if (audit) {
      map.set(row.tempBookId || row.rowKey, {
        ...row,
        titleRaw: audit.title || row.titleRaw,
        publisherRaw: audit.publisher || row.publisherRaw,
        authorRaw: audit.author || row.authorRaw,
        descriptionRaw: [row.descriptionRaw, audit.descriptionRaw]
          .filter(Boolean)
          .join(' | '),
        locationRaw: audit.location || row.locationRaw
      });
    } else {
      map.set(row.tempBookId || row.rowKey, row);
    }
  }

  // افزودن کتاب‌های خارج از فهرست (Outside-List) که در بخش کتابخانه ثبت شده‌اند
  Object.values(auditRecords).forEach((rec) => {
    if (rec.source === 'outside-list') {
      const bookId = rec.tempBookId || rec.key;
      if (!map.has(bookId)) {
        map.set(bookId, {
          rowKey: rec.key,
          rowIndex: 0,
          tempBookId: bookId,
          titleRaw: rec.title,
          publisherRaw: rec.publisher || '—',
          descriptionRaw: rec.descriptionRaw || '',
          categoryRaw: rec.category || 'R',
          authorRaw: rec.author || '',
          isbnRaw: '',
          fipaRaw: '',
          registrationNoRaw: rec.copyId || '',
          locationRaw: rec.location || '',
          countedCopiesRaw: rec.countedCopies || '1',
          reviewStatusRaw: rec.needsReview ? 'نیازمند بررسی' : 'ثبت خارج از فهرست',
          noteRaw: (rec.notes || '').replace(/\|?\s*⚠️\s*نیازمند بررسی:?\s*تشابه نام با[^|]*/g, '').trim(),
          backupSourceSheet: 'ثبت خارج از فهرست',
          backupSourceRow: bookId,
          allValues: []
        });
      }
    }
  });

  return Array.from(map.values());
}

export interface BookMartyrAutoMatch {
  martyrName: string;
  martyrId?: string;
  gravePiece?: string;
  graveRow?: string;
  graveNumber?: string;
  book: ReferenceCatalogRow;
  matchType: 'تطبیق دقیق' | 'تطبیق احتمالی';
  evidenceText: string;
}

/**
 * هنگامی که یک کتاب جدید اضافه یا ویرایش می‌شود، فقط عنوان کتاب و توضیحات کتاب (بدون نام ناشر و بدون یادداشت‌های سیستمی)
 * با اسامی شهدا مقابله می‌شود تا نام ناشر (مانند «انتشارات ابراهیم هادی») هرگز با نام شهید اشتباه گرفته نشود.
 */
export function matchSingleBookAgainstMartyrs(
  book: {
    tempBookId: string;
    title: string;
    description?: string;
    notes?: string;
    author?: string;
    publisher?: string;
    category?: string;
    location?: string;
  },
  golzarMartyrs: LightweightGolzarMartyr[],
  customMartyrs: CustomMartyrRecord[] = [],
  workbookMartyrs: WorkbookGolzarMartyr[] = []
): BookMartyrAutoMatch[] {
  const normTitle = stripPublisherAndAutoNotesForMartyrMatch(book.title || '', book.publisher);
  const normDesc = stripPublisherAndAutoNotesForMartyrMatch(book.description || '', book.publisher);
  const fullBookHaystack = ` ${normTitle} ${normDesc} `;
  if (!fullBookHaystack.trim()) return [];

  const bookRow: ReferenceCatalogRow = {
    rowKey: book.tempBookId,
    rowIndex: 0,
    tempBookId: book.tempBookId,
    titleRaw: book.title,
    publisherRaw: book.publisher || '—',
    descriptionRaw: book.description || '',
    categoryRaw: book.category || 'R',
    authorRaw: book.author || '',
    isbnRaw: '',
    fipaRaw: '',
    registrationNoRaw: '',
    locationRaw: book.location || '',
    countedCopiesRaw: '1',
    reviewStatusRaw: 'نیازمند بررسی',
    noteRaw: book.notes || '',
    backupSourceSheet: 'کتابخانه',
    backupSourceRow: book.tempBookId,
    allValues: []
  };

  const resultsMap = new Map<string, BookMartyrAutoMatch>();

  // ۱. بررسی پرونده‌های ثبتی (customMartyrs)
  for (const cm of customMartyrs) {
    const clean = normalizePersianText(cm.fullName.replace(/^شهید\s+/, ''));
    if (!clean || clean.length < 4) continue;
    if (fullBookHaystack.includes(` ${clean} `) || ` ${normTitle} `.includes(` ${clean} `)) {
      const inTitle = ` ${normTitle} `.includes(` ${clean} `);
      resultsMap.set(clean, {
        martyrName: cm.fullName.startsWith('شهید') ? cm.fullName : `شهید ${cm.fullName}`,
        martyrId: cm.martyrId,
        gravePiece: cm.gravePiece,
        graveRow: cm.graveRow,
        graveNumber: cm.graveNumber,
        book: bookRow,
        matchType: inTitle ? 'تطبیق دقیق' : 'تطبیق احتمالی',
        evidenceText: inTitle
          ? `[نیازمند بررسی — مقابله خودکار] درج نام شهید «${cm.fullName}» در عنوان کتاب «${book.title}» (${book.tempBookId}).`
          : `[نیازمند بررسی — مقابله خودکار] تشابه نام شهید «${cm.fullName}» در توضیحات کتاب «${book.title}» (${book.tempBookId}).`
      });
    }
  }

  // ۲. بررسی شهدای کارپوشه اکسل (workbookMartyrs)
  for (const wm of workbookMartyrs) {
    const clean = normalizePersianText(wm.fullNameSearch.replace(/^شهید\s+/, ''));
    if (!clean || clean.length < 5 || resultsMap.has(clean)) continue;
    if (fullBookHaystack.includes(` ${clean} `) || ` ${normTitle} `.includes(` ${clean} `)) {
      const inTitle = ` ${normTitle} `.includes(` ${clean} `);
      resultsMap.set(clean, {
        martyrName: wm.fullNameSearch.startsWith('شهید') ? wm.fullNameSearch : `شهید ${wm.fullNameSearch}`,
        martyrId: wm.tempPersonId,
        gravePiece: wm.piece,
        graveRow: wm.graveRow,
        graveNumber: wm.graveNumber,
        book: bookRow,
        matchType: inTitle ? 'تطبیق دقیق' : 'تطبیق احتمالی',
        evidenceText: inTitle
          ? `[نیازمند بررسی — مقابله خودکار] درج نام شهید «${wm.fullNameSearch}» در عنوان کتاب «${book.title}» (${book.tempBookId}).`
          : `[نیازمند بررسی — مقابله خودکار] تشابه نام شهید «${wm.fullNameSearch}» در توضیحات کتاب «${book.title}» (${book.tempBookId}).`
      });
    }
  }

  // ۳. بررسی بانک ۲۸٬۳۶۸ نفری گلزار شهدا
  const bookTokens = new Set(fullBookHaystack.split(/\s+/).filter(Boolean));
  for (const gm of golzarMartyrs) {
    if (resultsMap.size >= 15) break; // جلوگیری از ازدحام بیش از حد برای یک کتاب
    const clean = gm.normalizedFullName;
    if (!isDistinctMartyrFullName(clean) || resultsMap.has(clean)) continue;

    // فیلتر سریع توکنی قبل از includes
    const parts = clean.split(/\s+/);
    const lastPart = parts[parts.length - 1];
    if (!bookTokens.has(lastPart) || !bookTokens.has(parts[0])) continue;

    if (fullBookHaystack.includes(` ${clean} `)) {
      const inTitle = ` ${normTitle} `.includes(` ${clean} `);
      resultsMap.set(clean, {
        martyrName: `شهید ${gm.fullName}`,
        martyrId: gm.id,
        gravePiece: gm.gravePiece,
        graveRow: gm.graveRow,
        graveNumber: gm.graveNumber,
        book: bookRow,
        matchType: inTitle ? 'تطبیق دقیق' : 'تطبیق احتمالی',
        evidenceText: `${inTitle ? '[تطبیق دقیق — نیازمند بررسی]' : '[تطبیق احتمالی — نیازمند بررسی]'} هم‌خوانی خودکار نام «شهید ${gm.fullName}» (قطعه ${gm.gravePiece || '—'}، ردیف ${gm.graveRow || '—'}، شماره ${gm.graveNumber || '—'}) با کتاب «${book.title}» (${book.tempBookId}).`
      });
    }
  }

  return Array.from(resultsMap.values());
}

/**
 * مقابله دسته‌ای پرسرعت بین بانک ۲۸٬۳۶۸ شهید گلزار (یا قطعه انتخابی) و تمام کتاب‌های موجود در کتابخانه
 * فقط بر اساس عنوان کتاب، توضیحات کتاب و نام شهید (بدون دخالت نام ناشر مانند انتشارات ابراهیم هادی)
 */
export function runFastCrossMatchBooksAnd28kMartyrs(
  allBooks: ReferenceCatalogRow[],
  golzarMartyrs: LightweightGolzarMartyr[],
  customMartyrs: CustomMartyrRecord[],
  validResearchLinks: BookMartyrLinkRecord[],
  pieceFilter = ''
): BookMartyrAutoMatch[] {
  const results: BookMartyrAutoMatch[] = [];
  const seenPairs = new Set<string>();

  // ساخت نمایه توکنی از کتاب‌ها فقط بر اساس عنوان کتاب و توضیحات کتاب (بدون نام ناشر و بدون یادداشت سیستمی)
  const preparedBooks = allBooks.map((b) => {
    const normTitle = stripPublisherAndAutoNotesForMartyrMatch(b.titleRaw, b.publisherRaw);
    const normDesc = stripPublisherAndAutoNotesForMartyrMatch(b.descriptionRaw, b.publisherRaw);
    const paddedHaystack = ` ${normTitle} ${normDesc} `;
    const tokens = new Set(paddedHaystack.split(/\s+/).filter((t) => t.length >= 2));
    return {
      book: b,
      normTitle: ` ${normTitle} `,
      paddedHaystack,
      tokens
    };
  });

  // نگاشت هر توکن به فهرست اندیس کتاب‌ها
  const tokenToBookIndices = new Map<string, number[]>();
  preparedBooks.forEach((pb, idx) => {
    pb.tokens.forEach((tk) => {
      let arr = tokenToBookIndices.get(tk);
      if (!arr) {
        arr = [];
        tokenToBookIndices.set(tk, arr);
      }
      arr.push(idx);
    });
  });

  // ۱. ابتدا پرونده‌های ثبتی در صفحه شهدا (customMartyrs)
  for (const cm of customMartyrs) {
    if (pieceFilter && cm.gravePiece !== pieceFilter) continue;
    const clean = normalizePersianText(cm.fullName.replace(/^شهید\s+/, ''));
    if (!clean || clean.length < 4) continue;
    for (const pb of preparedBooks) {
      if (pb.paddedHaystack.includes(` ${clean} `)) {
        const pairKey = `${clean}::${pb.book.tempBookId}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        const inTitle = pb.normTitle.includes(` ${clean} `);
        results.push({
          martyrName: cm.fullName.startsWith('شهید') ? cm.fullName : `شهید ${cm.fullName}`,
          martyrId: cm.martyrId,
          gravePiece: cm.gravePiece,
          graveRow: cm.graveRow,
          graveNumber: cm.graveNumber,
          book: pb.book,
          matchType: inTitle ? 'تطبیق دقیق' : 'تطبیق احتمالی',
          evidenceText: `${inTitle ? '[تطبیق دقیق — نیازمند بررسی]' : '[تطبیق احتمالی — نیازمند بررسی]'} تطابق نام «${cm.fullName}» با کتاب «${pb.book.titleRaw}» (${pb.book.tempBookId}).`
        });
      }
    }
  }

  // ۲. بررسی کل بانک ۲۸٬۳۶۸ نفری گلزار شهدا با استفاده از نمایه توکنی
  for (const gm of golzarMartyrs) {
    if (pieceFilter) {
      if (pieceFilter === 'outside' && gm.source !== 'outside') continue;
      if (pieceFilter !== 'outside' && gm.gravePiece !== pieceFilter) continue;
    }
    const clean = gm.normalizedFullName;
    if (!isDistinctMartyrFullName(clean)) continue;
    const parts = clean.split(/\s+/);
    const lastToken = parts[parts.length - 1];
    const candidateBookIndices = tokenToBookIndices.get(lastToken);
    if (!candidateBookIndices || candidateBookIndices.length === 0) continue;

    for (const bIdx of candidateBookIndices) {
      const pb = preparedBooks[bIdx];
      if (!pb.tokens.has(parts[0])) continue;
      if (pb.paddedHaystack.includes(` ${clean} `)) {
        const pairKey = `${clean}::${pb.book.tempBookId}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        const inTitle = pb.normTitle.includes(` ${clean} `);
        results.push({
          martyrName: `شهید ${gm.fullName}`,
          martyrId: gm.id,
          gravePiece: gm.gravePiece,
          graveRow: gm.graveRow,
          graveNumber: gm.graveNumber,
          book: pb.book,
          matchType: inTitle ? 'تطبیق دقیق' : 'تطبیق احتمالی',
          evidenceText: `${inTitle ? '[تطبیق دقیق — نیازمند بررسی]' : '[تطبیق احتمالی — نیازمند بررسی]'} تطابق خودکار نام «شهید ${gm.fullName}» (قطعه ${gm.gravePiece || '—'}، ردیف ${gm.graveRow || '—'}، شماره ${gm.graveNumber || '—'}) با کتاب «${pb.book.titleRaw}» (${pb.book.tempBookId}).`
        });
      }
    }
  }

  // ۳. همچنین بررسی ردیف‌های پژوهش سوره مهر و قطعات شهدا که در کاتالوگ کتاب دارند
  for (const lnk of validResearchLinks) {
    if (pieceFilter && lnk.gravePieceRaw !== pieceFilter) continue;
    const clean = normalizePersianText(lnk.martyrNameRaw.replace(/^شهید\s+/, ''));
    if (!clean || clean.length < 4) continue;
    const matchedBook = allBooks.find(
      (b) =>
        (lnk.tempBookId && b.tempBookId === lnk.tempBookId) ||
        normalizePersianText(b.titleRaw) === normalizePersianText(lnk.bookTitleRaw)
    );
    if (matchedBook) {
      const pairKey = `${clean}::${matchedBook.tempBookId}`;
      if (!seenPairs.has(pairKey)) {
        seenPairs.add(pairKey);
        results.push({
          martyrName: lnk.martyrNameRaw.startsWith('شهید') ? lnk.martyrNameRaw : `شهید ${lnk.martyrNameRaw}`,
          gravePiece: lnk.gravePieceRaw,
          graveRow: lnk.graveRowRaw,
          graveNumber: lnk.graveNumberRaw,
          book: matchedBook,
          matchType: 'تطبیق دقیق',
          evidenceText: `[تطبیق دقیق] ثبت ارتباط در پژوهش مرجع (${lnk.sourceSheet || 'پژوهش سوره مهر'} — صفحه ${lnk.pageReferenceRaw || '—'}) برای کتاب «${matchedBook.titleRaw}» (${matchedBook.tempBookId}).`
        });
      }
    }
  }

  return results;
}

/**
 * استخراج سریع اسامی شهدای تهرانی (منطبق با بانک ۲۸٬۳۶۸ شهید گلزار تهران) فقط از عنوان کتاب و توضیحات کتاب
 * (بدون دخالت نام ناشر و بدون یادداشت‌های سیستمی)
 */
export function extractTehranMartyrsFromBookText(
  book: {
    tempBookId?: string;
    titleRaw: string;
    descriptionRaw?: string;
    publisherRaw?: string;
    noteRaw?: string;
  },
  golzarMartyrs?: LightweightGolzarMartyr[]
): LightweightGolzarMartyr[] {
  const useCache = !golzarMartyrs || golzarMartyrs === cachedGolzarMartyrs;
  const cacheKey = useCache
    ? `${golzarCacheEpoch}|${book.tempBookId || ''}|${book.titleRaw || ''}|${book.descriptionRaw || ''}`
    : '';

  if (useCache && cacheKey) {
    const cached = bookExtractCache.get(cacheKey);
    if (cached) return cached;
  }

  const cleanedTitle = stripPublisherAndAutoNotesForMartyrMatch(book.titleRaw || '', book.publisherRaw);
  const cleanedDesc = stripPublisherAndAutoNotesForMartyrMatch(book.descriptionRaw || '', book.publisherRaw);
  const combinedRaw = `${cleanedTitle} | ${cleanedDesc}`;
  if (
    isExplicitlyNonTehranRecord({
      sourceDesc: combinedRaw
    })
  ) {
    if (useCache && cacheKey) bookExtractCache.set(cacheKey, []);
    return [];
  }

  const foundMap = new Map<string, LightweightGolzarMartyr>();
  const normText = normalizePersianText(combinedRaw);
  if (!normText) {
    if (useCache && cacheKey) bookExtractCache.set(cacheKey, []);
    return [];
  }

  // ۱. بررسی کل عنوان کتاب (اگر عنوان کتاب مستقیماً نام یک شهید تهرانی باشد)
  const cleanTitle = stripTitlesForTehranIndex(
    cleanedTitle
      .replace(/^(زندگینامه|زندگی نامه|خاطرات|داستان زندگی|روایت زندگی|بر بال ملائک|نیمه پنهان ماه|یادگاران)\s+/g, '')
      .replace(/\s*\([^)]*\)\s*/g, ' ')
  );
  if (isDistinctMartyrFullName(cleanTitle)) {
    const titleMatch = findMartyrRecordIn28k(cleanTitle, golzarMartyrs);
    if (titleMatch) {
      foundMap.set(titleMatch.compactFullName || compactNameForTehranIndex(titleMatch.fullName), titleMatch);
    }
  }

  // ۲. استخراج عبارات پس از «شهید» در عنوان و توضیحات کتاب
  const shahidRegex =
    /شهید\s+(?:سردار\s+|سرلشکر\s+|سپهبد\s+|امیر\s+|حاج\s+|دکتر\s+|مهندس\s+|سید\s+|جاویدالاثر\s+|مدافع\s+حرم\s+)*([آ-ی]+(?:\s+[آ-ی]+){1,3})/g;

  let match: RegExpExecArray | null;
  while ((match = shahidRegex.exec(normText)) !== null) {
    const rawCandidate = match[0].replace(/^شهید\s+/, '').trim();
    const words = rawCandidate.split(/\s+/).filter(Boolean);
    // امتحان طول‌های ۴، ۳ و ۲ کلمه‌ای از ابتدای عبارت پس از «شهید»
    for (const len of [4, 3, 2]) {
      if (words.length < len) continue;
      const sub = words.slice(0, len).join(' ');
      const stripped = stripTitlesForTehranIndex(sub);
      if (!isDistinctMartyrFullName(stripped)) continue;
      const gm = findMartyrRecordIn28k(stripped, golzarMartyrs);
      if (gm) {
        foundMap.set(gm.compactFullName || compactNameForTehranIndex(gm.fullName), gm);
        break;
      }
    }
  }

  const result = Array.from(foundMap.values());
  if (useCache && cacheKey) {
    bookExtractCache.set(cacheKey, result);
  }
  return result;
}

/**
 * نمایه‌سازی سراسری و غنی‌سازی پیوندهای کتاب و شهید با بانک ۲۸٬۳۶۸ شهید گلزار شهدای تهران (با کش دائمی یک‌بار مصرف):
 * ۱. اعمال قانون استثنای شهدای غیرتهرانی («غ تهرانی»): اگر رکوردی «غ تهرانی» باشد اما نامش در ۲۸٬۳۶۸ شهید تهران هم باشد،
 *    نشان تهرانی نمی‌گیرد و به وضعیت «نیازمند بررسی کارشناس» منتقل می‌شود.
 * ۲. تکمیل خودکار قطعه، ردیف و شماره مزار برای شهدای تهرانی که در شیت‌ها بدون قطعه ثبت شده‌اند اما در بانک ۲۸ هزار شهید هستند.
 * ۳. اسکن ۹۸۰ کتاب کاتالوگ و ذخیره دائمی نتیجه در حافظه محلی تا فقط یک‌بار محاسبه شود و در دفعات بعد بدون هیچ مکثی آماده باشد.
 */
export function enrichLinksAndCatalogBooksWith28kTehranIndex(params: {
  catalogRows: ReferenceCatalogRow[];
  auditRecords: Record<string, FieldAuditRecord>;
  links: BookMartyrLinkRecord[];
  golzarMartyrs?: LightweightGolzarMartyr[];
}): BookMartyrLinkRecord[] {
  const { catalogRows, auditRecords, links, golzarMartyrs } = params;

  // اگر ورودی از قبل همان خروجی کش‌شده است یا مراجع یکسان هستند، بلافاصله برگردان
  if (!golzarMartyrs && lastEnrichedLinksCache) {
    if (
      lastEnrichedLinksCache.epoch === golzarCacheEpoch &&
      lastEnrichedLinksCache.catalogRowsRef === catalogRows &&
      lastEnrichedLinksCache.auditRecordsRef === auditRecords &&
      (lastEnrichedLinksCache.linksRef === links || lastEnrichedLinksCache.result === links)
    ) {
      return lastEnrichedLinksCache.result;
    }
  }

  const seenBookMartyrPairs = new Set<string>();
  const matchedKnownMartyrsForPersist = new Map<string, LightweightGolzarMartyr>();

  const catalogByCompactTitle = new Map<string, ReferenceCatalogRow>();
  for (const row of catalogRows) {
    const ct = compactNameForTehranIndex(row.titleRaw);
    if (ct && !catalogByCompactTitle.has(ct)) {
      catalogByCompactTitle.set(ct, row);
    }
  }

  // گام ۱: بررسی و غنی‌سازی پیوندهای موجود
  const updatedLinks: BookMartyrLinkRecord[] = links.map((lnk) => {
    const evalRes = evaluateMartyrTehranStatus(
      {
        martyrName: lnk.martyrNameRaw,
        gravePiece: lnk.gravePieceRaw,
        graveRow: lnk.graveRowRaw,
        graveNumber: lnk.graveNumberRaw,
        sourceDesc: lnk.sourceDescriptionRaw,
        reviewerNote: lnk.reviewerNote,
        reviewStatus: lnk.reviewStatus,
        isGroupPhrase: lnk.isGroupPhrase
      },
      golzarMartyrs
    );

    if (evalRes.matchedGolzarRecord) {
      matchedKnownMartyrsForPersist.set(evalRes.matchedGolzarRecord.id, evalRes.matchedGolzarRecord);
    }

    const resolvedBookId =
      lnk.tempBookId ||
      catalogByCompactTitle.get(compactNameForTehranIndex(lnk.bookTitleRaw))?.tempBookId ||
      '';
    const mCompact = compactNameForTehranIndex(lnk.martyrNameRaw);
    if (resolvedBookId && mCompact) {
      seenBookMartyrPairs.add(`${resolvedBookId}::${mCompact}`);
    }
    const titleCompact = compactNameForTehranIndex(lnk.bookTitleRaw);
    if (titleCompact && mCompact) {
      seenBookMartyrPairs.add(`${titleCompact}::${mCompact}`);
    }

    // اگر کارشناس قبلاً این پیوند را تأیید نهایی کرده است، هرگز دوباره به نیازمند بررسی برنگردد
    const isAlreadyExpertApproved =
      lnk.reviewStatus === 'تأییدشده کارشناسی' ||
      lnk.reviewStatus === 'قطعی' ||
      lnk.reviewStatus === 'تأیید';

    // قانون استثنای شهدای غیرتهرانی هم‌نام با شهدای تهران -> انتقال به نیازمند بررسی کارشناس
    if (evalRes.hasHomonymIn28kNeedsReview && evalRes.matchedGolzarRecord && !isAlreadyExpertApproved) {
      const gm = evalRes.matchedGolzarRecord;
      const homonymNote = `در منبع به عنوان «${lnk.gravePieceRaw || 'غیر تهرانی'}» ثبت شده اما هم‌نام با شهید تهرانی «${gm.fullName}» (قطعه ${gm.gravePiece || '—'}، ردیف ${gm.graveRow || '—'}، شماره ${gm.graveNumber || '—'}) در بانک ۲۸٬۳۶۸ شهید گلزار تهران است؛ نیازمند بررسی کارشناس.`;
      const nextNote = lnk.reviewerNote?.includes('هم‌نام با شهید تهرانی')
        ? lnk.reviewerNote
        : lnk.reviewerNote
        ? `${lnk.reviewerNote} | ${homonymNote}`
        : homonymNote;

      return {
        ...lnk,
        tempBookId: resolvedBookId || lnk.tempBookId,
        reviewStatus: 'نیازمند بررسی کارشناسی (تشابه اسمی با شهدای تهران — ثبت‌شده به عنوان غیرتهرانی)',
        reviewerNote: nextNote
      };
    }

    // اگر شهید تهرانی است و در بانک ۲۸ هزار شهید مزار دارد ولی در شیت قطعه مزار خالی بوده، تکمیل شود
    if (evalRes.isTehran && !evalRes.isNonTehran && evalRes.matchedGolzarRecord) {
      const gm = evalRes.matchedGolzarRecord;
      return {
        ...lnk,
        tempBookId: resolvedBookId || lnk.tempBookId,
        gravePieceRaw: lnk.gravePieceRaw || gm.gravePiece || '',
        graveRowRaw: lnk.graveRowRaw || gm.graveRow || '',
        graveNumberRaw: lnk.graveNumberRaw || gm.graveNumber || ''
      };
    }

    return resolvedBookId && !lnk.tempBookId ? { ...lnk, tempBookId: resolvedBookId } : lnk;
  });

  // گام ۲: افزودن پیوندهای شهدای تهرانی استخراج‌شده از کتاب‌ها (با اولویت کش یک‌بار مصرف برای حذف کامل معطلی)
  const full28kReady =
    (cachedGolzarMartyrs && cachedGolzarMartyrs.length > 0) ||
    (golzarMartyrs && golzarMartyrs.length > 0);

  if (!full28kReady && persistedAutoBookLinks && persistedAutoBookLinks.length > 0) {
    // استفاده فوری از نمایه ذخیره‌شده بدون هیچ انتظار برای بارگذاری فایل اکسل ۲۸ هزار نفری
    for (const autoLnk of persistedAutoBookLinks) {
      const mCompact = compactNameForTehranIndex(autoLnk.martyrNameRaw);
      const bKey1 = `${autoLnk.tempBookId}::${mCompact}`;
      const bKey2 = `${compactNameForTehranIndex(autoLnk.bookTitleRaw)}::${mCompact}`;
      if (seenBookMartyrPairs.has(bKey1) || seenBookMartyrPairs.has(bKey2)) {
        continue;
      }
      seenBookMartyrPairs.add(bKey1);
      seenBookMartyrPairs.add(bKey2);
      updatedLinks.push(autoLnk);
    }
  } else if (full28kReady || cachedGolzarByNormName.size > 0) {
    const allUnifiedBooks = getAllUnifiedBooks(catalogRows, auditRecords);
    const newlyGeneratedAutoLinks: BookMartyrLinkRecord[] = [];

    for (const book of allUnifiedBooks) {
      const matchedTehranMartyrs = extractTehranMartyrsFromBookText(book, golzarMartyrs);
      for (const gm of matchedTehranMartyrs) {
        matchedKnownMartyrsForPersist.set(gm.id, gm);
        const mCompact = gm.compactFullName || compactNameForTehranIndex(gm.fullName);
        const bKey1 = `${book.tempBookId}::${mCompact}`;
        const bKey2 = `${compactNameForTehranIndex(book.titleRaw)}::${mCompact}`;
        if (seenBookMartyrPairs.has(bKey1) || seenBookMartyrPairs.has(bKey2)) {
          continue;
        }
        seenBookMartyrPairs.add(bKey1);
        seenBookMartyrPairs.add(bKey2);

        const autoLnk: BookMartyrLinkRecord = {
          id: `RL-28K-${book.tempBookId}-${gm.id}`,
          groupStartRow: String(book.rowIndex || ''),
          publisherRaw: book.publisherRaw || '—',
          bookTitleRaw: book.titleRaw,
          alternativeTitle: '',
          sourceDescriptionRaw: book.descriptionRaw || '',
          martyrNameRaw: gm.fullName,
          rawNameInSource: `شهید ${gm.fullName}`,
          isGroupPhrase: false,
          gravePieceRaw: gm.gravePiece || (gm.source === 'outside' ? 'خارج از قطعات' : ''),
          graveRowRaw: gm.graveRow || '',
          graveNumberRaw: gm.graveNumber || '',
          pageReferenceRaw: 'کل کتاب / معرفی در شناسنامه کتاب',
          sourceFile: 'نمایه خودکار ۲۸٬۳۶۸ شهید گلزار تهران',
          sourceSheet: 'تطبیق با گلزار شهدای تهران',
          sourceExcelRow: String(book.backupSourceRow || book.rowIndex || ''),
          tempBookId: book.tempBookId,
          reviewStatus: 'بررسی‌شده در پژوهش اصلی',
          reviewerNote: `تطبیق خودکار نام «شهید ${gm.fullName}» در مشخصات کتاب (${book.tempBookId}) با بانک ۲۸٬۳۶۸ شهید گلزار شهدای تهران (قطعه ${gm.gravePiece || 'خارج از قطعات'}، ردیف ${gm.graveRow || '—'}، شماره ${gm.graveNumber || '—'}).`
        };

        newlyGeneratedAutoLinks.push(autoLnk);
        updatedLinks.push(autoLnk);
      }
    }

    // ذخیره دائمی نمایه یک‌بار مصرف به محض آماده شدن کاتالوگ کامل (۹۸۰ کتاب) و بانک ۲۸ هزار شهید
    if (full28kReady && catalogRows.length >= 900 && !persistedAutoBookLinks) {
      savePersistedTehranIndexSync(
        catalogRows.length,
        matchedKnownMartyrsForPersist,
        newlyGeneratedAutoLinks
      );
    }
  }

  if (!golzarMartyrs) {
    lastEnrichedLinksCache = {
      catalogRowsRef: catalogRows,
      auditRecordsRef: auditRecords,
      linksRef: links,
      epoch: golzarCacheEpoch,
      result: updatedLinks
    };
  }

  return updatedLinks;
}

