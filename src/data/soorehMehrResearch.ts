import {
  BookCopyRecord,
  BookMartyrLinkRecord,
  ExtractedContentItem,
  ExtractedContentType,
  ExtractedReviewStatus,
  FieldAuditRecord,
  ReferenceCatalogRow,
  normalizePersianText
} from './markazAsnadData';
import {
  enrichLinksAndCatalogBooksWith28kTehranIndex,
  evaluateMartyrTehranStatus
} from '../utils/martyrsCrossMatchEngine';

/**
 * آمار مستند و قطعی استخراج‌شده از فایل واقعی «لیست کتابهای و شهدای مرتبط.xlsx» (منبع سوره مهر - شیت Sheet2)
 * آرشیو منبع در مخزن: /public/data/sooreh_mehr_book_martyr_research.json
 * و /public/assets/aistudio/_________________________________________07c5a7ec.json
 */
export const SOOREH_MEHR_RESEARCH_STATS = {
  sourceFileName: 'لیست کتابهای و شهدای مرتبط.xlsx',
  sourceSheetName: 'Sheet2',
  archiveJsonPath: '/data/sooreh_mehr_book_martyr_research.json',
  rawAssetPath: '/assets/aistudio/_________________________________________07c5a7ec.json',
  headers: [
    'ردیف',
    'انتشارات',
    'عنوان کتاب',
    'توضیحات',
    'نام و نام خانوادگی شهید',
    'قطعه',
    'ردیف',
    'شماره',
    'شماره صفحه'
  ],
  // ۱. تعداد کل ردیف‌های شیت
  totalRowsWithHeaderAndTrailing: 602,
  totalRowsWithHeader: 600,
  totalResearchRows: 599,

  // ۲. تعداد کتاب‌های یکتای حاضر در فایل
  uniqueBooksByRowId: 413, // BK-0001 تا BK-0413 (۴۱۳ عنوان سوره مهر در فهرست کتاب‌ها)
  uniqueBookTitlesRaw: 415, // ۴۱۵ رشته عنوان خام در ستون C (به دلیل تفکیک جلد ۱ و ۲ سیزده در هفت و Drag-Fill فرکانس ۱۱۶۱ تا ۱۱۶۳)
  booksWithMartyrOrPhrase: 197, // ۱۹۷ کتاب دارای نام شهید یا عبارت گروهی (۱۳۹ کتاب با نام شهید مشخص + ۵۸ کتاب فقط با عبارت گروهی)
  booksWithSpecificNamedMartyr: 139,
  booksWithOnlyGroupPhrase: 58,
  booksWithStarOrEmpty: 220, // ۲۲۰ ردیف کتاب با علامت * (۲۱۲ مورد) یا خالی (۸ مورد) بدون استخراج نام شهید

  // ۳. تعداد شهدای یکتای حاضر در فایل
  uniqueNamedMartyrsCount: 236, // ۲۳۶ نام شهید یکتا در میان ۳۰۳ ارتباط فردی سوره مهر

  // ۴. تعداد کل ارتباط‌های کتاب–شهید
  totalBookMartyrRelations: 379, // کل ردیف‌های غیر * و غیرخالی (۳۰۳ شهید مشخص + ۷۶ عبارت گروهی)
  namedMartyrRelationsCount: 303, // ۳۰۳ ارتباط با نام شهید مشخص
  groupPhraseRelationsCount: 76, // ۷۶ ارتباط دارای عبارت گروهی/توضیحی (مانند «و چند شهید غیر تهرانی»)

  // ۵. تعداد کتاب‌های تطبیق‌یافته با کاتالوگ ۹۸۰ کتاب
  catalogMatchedBooksCount: 413, // هر ۴۱۳ کتاب سوره مهر با BK-0001 تا BK-0413 متناظر است
  catalogExactMatchedBooksCount: 405, // ۴۰۵ کتاب با تطابق دقیق عنوان
  catalogNormalizedOrCandidateBooksCount: 8, // ۸ کتاب (۱۸ ردیف) با تطابق نرمال‌شده/دو جلدی/Drag-Fill یا کاندید بررسی

  // ۶. تعداد کتاب‌های تطبیق‌نیافته با کاتالوگ
  catalogUnmatchedBooksCount: 0, // در فایل سوره مهر ۰ کتاب خارج از کاتالوگ ۴۱۳ کتاب سوره مهر است (شیت بر پایه همان ۴۱۳ ردیف ساخته شده است)
  strictlyUnmatchedBeforeNormalizationBooksCount: 8, // قبل از نرمال‌سازی فاصله/نیم‌فاصله، تفکیک جلد و رفع Drag-Fill اکسل

  // ۷. تعداد ارتباط‌های قطعی، احتمالی و نیازمند بررسی کارشناسی
  definiteRelationsCount: 190, // ۱۹۰ ارتباط فردی دارای تطابق قطعی کتاب + تطابق دقیق قطعه/ردیف/شماره در بانک ۲۸٬۳۶۸ شهید گلزار
  probableRelationsCount: 89, // ۳۴ ارتباط منطبق با نام و قطعه در گلزار + ۵۵ ارتباط شهدای غیرتهرانی/جاویدالاثر/۷۲تن دارای کتاب و شرح کامل
  needsExpertReviewRelationsCount: 100, // ۲۴ ارتباط فردی نیازمند بازبینی مزار/عنوان (مثل شاید/شهید پیش از اذان صبح) + ۷۶ عبارت گروهی نیازمند تفکیک نام

  // ۸. تعداد رکوردهای تکراری واقعی در برابر تکرارهای ظاهری ناشی از چندشهیدی بودن کتاب
  multiMartyrBooksCount: 42, // ۴۲ کتاب دارای بیش از یک ردیف شهید هستند
  multiMartyrApparentRepeatRowsCount: 184, // ۱۸۴ ردیف تکرار ظاهری عنوان کتاب در اکسل به دلیل معرفی چند شهید در یک کتاب
  trueDuplicateRelationsCount: 0 // ۰ رکورد تکراری واقعی (تنها زوج هم‌نام بدون شهید «نیمکت‌های سوخته» ردیف ۳۸۳ و ۳۸۴ دو جلد متفاوت BK-0383 و BK-0384 هستند)
};

/**
 * فهرست ۸ کتاب (۱۸ ردیف) در شیت سوره مهر که تفاوت نگارشی، دوجلدی یا Drag-Fill اکسل با کاتالوگ داشتند
 */
export const SOOREH_MEHR_NORMALIZED_BOOK_MAPPINGS: Record<
  string,
  {
    tempBookId: string;
    catalogTitle: string;
    alternativeTitle: string;
    matchType: 'exact_normalized' | 'volume_split' | 'excel_drag_fill' | 'duplicate_title_disambiguated' | 'candidate_review';
    note: string;
  }
> = {
  'RL-0155': {
    tempBookId: 'BK-0095',
    catalogTitle: 'تلگراف چی پنج ستاره',
    alternativeTitle: 'تلگرافچی پنج ستاره',
    matchType: 'exact_normalized',
    note: 'تطبیق با BK-0095 پس از یکسان‌سازی فاصله در «تلگراف چی / تلگرافچی».'
  },
  'RL-0330': {
    tempBookId: 'BK-0219',
    catalogTitle: 'سروده های بی تکرار',
    alternativeTitle: 'سرودهای بی تکرار',
    matchType: 'candidate_review',
    note: 'کاندید تطبیق با BK-0219 («سروده های بی تکرار» در کاتالوگ در برابر «سرودهای بی تکرار» در شیت پژوهش).'
  },
  'RL-0345': {
    tempBookId: 'BK-0230',
    catalogTitle: 'سیزده در هفت (جلد اول-جلد دوم)',
    alternativeTitle: 'سیزده در هفت (جلد اول)',
    matchType: 'volume_split',
    note: 'در کاتالوگ به صورت یک رکورد دوجلدی (BK-0230) ثبت شده و در شیت پژوهش به تفکیک جلد اول و دوم استخراج شده است.'
  },
  'RL-0346': {
    tempBookId: 'BK-0230',
    catalogTitle: 'سیزده در هفت (جلد اول-جلد دوم)',
    alternativeTitle: 'سیزده در هفت (جلد اول)',
    matchType: 'volume_split',
    note: 'جلد اول مجموعه BK-0230.'
  },
  'RL-0347': {
    tempBookId: 'BK-0230',
    catalogTitle: 'سیزده در هفت (جلد اول-جلد دوم)',
    alternativeTitle: 'سیزده در هفت (جلد اول)',
    matchType: 'volume_split',
    note: 'جلد اول مجموعه BK-0230.'
  },
  'RL-0348': {
    tempBookId: 'BK-0230',
    catalogTitle: 'سیزده در هفت (جلد اول-جلد دوم)',
    alternativeTitle: 'سیزده در هفت (جلد اول)',
    matchType: 'volume_split',
    note: 'جلد اول مجموعه BK-0230.'
  },
  'RL-0349': {
    tempBookId: 'BK-0230',
    catalogTitle: 'سیزده در هفت (جلد اول-جلد دوم)',
    alternativeTitle: 'سیزده در هفت (جلد اول)',
    matchType: 'volume_split',
    note: 'جلد اول مجموعه BK-0230 (عبارت گروهی).'
  },
  'RL-0350': {
    tempBookId: 'BK-0230',
    catalogTitle: 'سیزده در هفت (جلد اول-جلد دوم)',
    alternativeTitle: 'سیزده در هفت (جلد دوم)',
    matchType: 'volume_split',
    note: 'جلد دوم مجموعه BK-0230.'
  },
  'RL-0351': {
    tempBookId: 'BK-0230',
    catalogTitle: 'سیزده در هفت (جلد اول-جلد دوم)',
    alternativeTitle: 'سیزده در هفت (جلد دوم)',
    matchType: 'volume_split',
    note: 'جلد دوم مجموعه BK-0230 (عبارت گروهی).'
  },
  'RL-0356': {
    tempBookId: 'BK-0235',
    catalogTitle: 'شب خاطره',
    alternativeTitle: 'شب خاطره (دفتر سوم)',
    matchType: 'duplicate_title_disambiguated',
    note: 'ابهام‌زدایی از دو کتاب هم‌نام «شب خاطره» بر اساس توضیحات «دفتر سوم / ۱۴ خاطره از زبان رزمندگان لشکر ۲۷» (BK-0235).'
  },
  'RL-0357': {
    tempBookId: 'BK-0235',
    catalogTitle: 'شب خاطره',
    alternativeTitle: 'شب خاطره (دفتر سوم)',
    matchType: 'duplicate_title_disambiguated',
    note: 'ابهام‌زدایی بر اساس توضیحات «دفتر سوم» (BK-0235).'
  },
  'RL-0358': {
    tempBookId: 'BK-0236',
    catalogTitle: 'شب خاطره',
    alternativeTitle: 'شب خاطره (دفتر اول)',
    matchType: 'duplicate_title_disambiguated',
    note: 'ابهام‌زدایی بر اساس توضیحات «دفتر اول / ۱۵ خاطره از زبان رزمندگان گردان حنظله» (BK-0236).'
  },
  'RL-0369': {
    tempBookId: 'BK-0246',
    catalogTitle: 'شهید پیش از اذان صبح',
    alternativeTitle: 'شاید پیش از اذان صبح',
    matchType: 'candidate_review',
    note: 'در شیت سوره مهر «شاید پیش از اذان صبح» و در کاتالوگ «شهید پیش از اذان صبح» با توضیح یکسان «روایت‌هایی از زندگی شهید حاج قاسم سلیمانی» ثبت شده؛ بدون بازنویسی خودکار عنوان کاتالوگ در صف بررسی کارشناسی نگه داشته شد.'
  },
  'RL-0398': {
    tempBookId: 'BK-0265',
    catalogTitle: 'فرکانس 1160',
    alternativeTitle: 'فرکانس 1161 (Drag-Fill اکسل برای فرکانس 1160)',
    matchType: 'excel_drag_fill',
    note: 'ردیف ۳۹۹ اکسل با ردیف کتاب ۲۶۵ و توضیح «اینجا آبادان؛ صدای مقاومت و ایستادگی» ادامه کتاب «فرکانس 1160» (BK-0265) است که در اکسل با Drag-Fill به 1161 تغییر یافته بود.'
  },
  'RL-0399': {
    tempBookId: 'BK-0265',
    catalogTitle: 'فرکانس 1160',
    alternativeTitle: 'فرکانس 1162 (Drag-Fill اکسل برای فرکانس 1160)',
    matchType: 'excel_drag_fill',
    note: 'ردیف ۴۰۰ اکسل با ردیف کتاب ۲۶۵ ادامه کتاب «فرکانس 1160» (BK-0265) است.'
  },
  'RL-0400': {
    tempBookId: 'BK-0265',
    catalogTitle: 'فرکانس 1160',
    alternativeTitle: 'فرکانس 1163 (Drag-Fill اکسل برای فرکانس 1160)',
    matchType: 'excel_drag_fill',
    note: 'ردیف ۴۰۱ اکسل با ردیف کتاب ۲۶۵ ادامه کتاب «فرکانس 1160» (BK-0265) است.'
  },
  'RL-0525': {
    tempBookId: 'BK-0383',
    catalogTitle: 'نیمکت های سوخته',
    alternativeTitle: 'نیمکت های سوخته (جلد اول - میانه / زینبیه)',
    matchType: 'duplicate_title_disambiguated',
    note: 'تطبیق با BK-0383 بر اساس ردیف ۳۸۳ و توضیحات «جلد اول . میانه / زینبیه».'
  },
  'RL-0526': {
    tempBookId: 'BK-0384',
    catalogTitle: 'نیمکت های سوخته',
    alternativeTitle: 'نیمکت های سوخته (مدارس بروجرد، بهبهان، کرمانشاه و ایلام)',
    matchType: 'duplicate_title_disambiguated',
    note: 'تطبیق با BK-0384 بر اساس ردیف ۳۸۴ و توضیحات «مدارس بروجرد، بهبهان، کرمانشاه و ایلام».'
  }
};

/**
 * ۵ تطبیق نرمال‌شده در شیت «قطعات شهدا.xlsx» که تنها تفاوت فاصله یا پیشوند «نشر» داشتند
 */
const GOLZAR_SHEET_NORMALIZED_BOOK_MAPPINGS: Record<string, string> = {
  'RL-0607': 'BK-0536', // نوزده، صفر، چهار -> نوزده،صفر،چهار (بیست و هفت)
  'RL-0627': 'BK-0974', // تویی که نمیشناختمت -> تویی که نمی شناختمت (فاتحان)
  'RL-0630': 'BK-0733', // من اینجا نمی مانم (نشر یازهرا)
  'RL-0632': 'BK-0716', // چمران مظلوم بود (نشر یازهرا)
  'RL-0633': 'BK-0706' // با دست های خالی (نشر یازهرا)
};

/**
 * نرمال‌سازی فشرده نام شهید یا عنوان کتاب برای تطبیق مقاوم در برابر نیم‌فاصله، فاصله، ی/ئ و اله/الله
 */
export function compactPersianForMatch(input: unknown): string {
  const base = normalizePersianText(input);
  if (!base) return '';
  return base
    .replace(/الله/g, 'اله')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .trim();
}

/**
 * حذف القاب متداول از ابتدای نام شهید برای تطبیق دقیق نام فردی (مانند «شهید حاج جعفر جنگروی» <-> «محمد جعفر جنگروی»)
 */
export function stripMartyrTitles(name: unknown): string {
  const norm = normalizePersianText(name);
  if (!norm) return '';
  return norm
    .replace(/^(شهید|سردار|حاج|دکتر|مهندس|امام|آیت الله|ایت الله|حجت الاسلام|سرلشکر|سپهبد|امیر|جاویدالاثر|جاوید الاثر|آقا|اقا)\s+/g, '')
    .replace(/^(شهید|سردار|حاج|دکتر|مهندس)\s+/g, '')
    .replace(/الله/g, 'اله')
    .trim();
}

/**
 * غنی‌سازی و تکمیل پیوندهای بارگذاری‌شده از کارپوشه با اطلاعات تطبیق‌یافته «لیست کتابهای و شهدای مرتبط.xlsx»
 * - حفظ تفکیک میان «بررسی‌شده در پژوهش اصلی» و «تأییدشده کارشناسی»
 * - اتصال ردیف‌های دوجلدی و Drag-Fill به شناسه BK متناظر با حفظ عنوان خام در alternativeTitle
 */
export function enrichLinksWithSorehMehrResearch(
  rawLinks: BookMartyrLinkRecord[]
): BookMartyrLinkRecord[] {
  return rawLinks.map((lnk) => {
    const mapped = SOOREH_MEHR_NORMALIZED_BOOK_MAPPINGS[lnk.id];
    const golzarMappedId = GOLZAR_SHEET_NORMALIZED_BOOK_MAPPINGS[lnk.id];

    let tempBookId = lnk.tempBookId || mapped?.tempBookId || golzarMappedId || '';
    let bookTitleRaw = lnk.bookTitleRaw;
    let alternativeTitle = lnk.alternativeTitle || '';
    let reviewerNote = lnk.reviewerNote || '';
    let reviewStatus = lnk.reviewStatus || 'بررسی‌نشده';

    if (mapped) {
      if (!alternativeTitle && bookTitleRaw !== mapped.catalogTitle) {
        alternativeTitle = mapped.alternativeTitle;
      }
      if (mapped.matchType === 'excel_drag_fill') {
        bookTitleRaw = mapped.catalogTitle;
      }
      if (!reviewerNote.includes(mapped.note)) {
        reviewerNote = reviewerNote ? `${reviewerNote} | ${mapped.note}` : mapped.note;
      }
      if (mapped.matchType === 'candidate_review' && reviewStatus === 'بررسی‌نشده') {
        reviewStatus = 'نیازمند بررسی کارشناسی';
      }
    }

    // تفکیک وضعیت «بررسی‌شده در پژوهش اصلی» از «بررسی‌نشده» برای رکوردهای کامل پژوهشگر سوره مهر و قطعات شهدا
    const hasValidMartyr =
      Boolean(lnk.martyrNameRaw) &&
      lnk.martyrNameRaw !== '*' &&
      !lnk.isGroupPhrase;

    if (hasValidMartyr && reviewStatus === 'بررسی‌نشده') {
      reviewStatus = 'بررسی‌شده در پژوهش اصلی';
    }

    return {
      ...lnk,
      tempBookId,
      bookTitleRaw,
      alternativeTitle,
      reviewStatus,
      reviewerNote
    };
  });
}

/**
 * تشخیص نوع مطلب پژوهشی از روی توضیحات کتاب و ارجاع صفحه در فایل سوره مهر
 */
function inferExtractedContentType(desc: string, pageRef: string): ExtractedContentType {
  const combined = normalizePersianText(`${desc} ${pageRef}`);
  if (combined.includes('وصیت')) return 'وصیت‌نامه';
  if (combined.includes('نامه')) return 'نامه';
  if (combined.includes('مصاحبه') || combined.includes('گفتگو') || combined.includes('گفت و گو')) return 'مصاحبه';
  if (combined.includes('زندگی') || combined.includes('کل کتاب')) return 'زندگی‌نامه';
  if (combined.includes('عملیات') || combined.includes('لشکر') || combined.includes('گردان')) return 'روایت عملیات';
  if (combined.includes('سند') || combined.includes('روزشمار') || combined.includes('اطلس')) return 'سند تاریخی';
  if (combined.includes('پژوهش') || combined.includes('پدیدار')) return 'تحلیل و پژوهش';
  if (combined.includes('خاطره') || combined.includes('خاطرات')) return 'خاطره';
  return 'معرفی شخصیت';
}

/**
 * استخراج بازه صفحه شروع و پایان از عبارت خام شماره صفحه (با حفظ کامل pageReferenceRaw)
 */
function parsePageRangeRaw(pageRefRaw: string): { start?: string; end?: string } {
  if (!pageRefRaw) return {};
  const normalized = normalizePersianText(pageRefRaw);
  const rangeMatch = normalized.match(/^(\d+)\s*تا\s*(\d+)$/);
  if (rangeMatch) {
    return { start: rangeMatch[1], end: rangeMatch[2] };
  }
  const singleMatch = normalized.match(/^(\d+)$/);
  if (singleMatch) {
    return { start: singleMatch[1], end: singleMatch[1] };
  }
  const multiNums = normalized.match(/\d+/g);
  if (multiNums && multiNums.length >= 1) {
    return {
      start: multiNums[0],
      end: multiNums[multiNums.length - 1]
    };
  }
  return {};
}

/**
 * ساخت فهرست کامل «مطالب استخراج‌شده و ارجاعات صفحه» (extracted_items)
 * از تمامی ۳۰۳ ارتباط شهید مشخص در فایل «لیست کتابهای و شهدای مرتبط.xlsx» (منبع سوره مهر)
 * به همراه رکوردهای اولیه و رکوردهای ثبت‌شده توسط کاربر بدون ایجاد تکرار
 */
export function buildSorehMehrExtractedItems(
  enrichedLinks: BookMartyrLinkRecord[] = [],
  existingItems: ExtractedContentItem[] = []
): ExtractedContentItem[] {
  const byId = new Map<string, ExtractedContentItem>();
  for (const item of Array.isArray(existingItems) ? existingItems : []) {
    if (item?.id) byId.set(item.id, item);
  }

  let smCounter = 1;
  for (const lnk of enrichedLinks) {
    // فقط ردیف‌های دارای نام شهید مشخص (غیر از * و خالی) از فایل سوره مهر
    if (!lnk.martyrNameRaw || lnk.martyrNameRaw === '*') continue;
    if (!lnk.sourceFile?.includes('لیست کتابهای و شهدای مرتبط')) continue;
    if (lnk.isGroupPhrase) continue;

    const itemId = `EX-SM-${String(smCounter).padStart(4, '0')}`;
    smCounter++;

    if (byId.has(itemId)) continue;

    const { start, end } = parsePageRangeRaw(lnk.pageReferenceRaw);
    const contentType = inferExtractedContentType(
      lnk.sourceDescriptionRaw || '',
      lnk.pageReferenceRaw || ''
    );

    const graveParts = [
      lnk.gravePieceRaw ? `قطعه ${lnk.gravePieceRaw}` : '',
      lnk.graveRowRaw ? `ردیف ${lnk.graveRowRaw}` : '',
      lnk.graveNumberRaw ? `شماره ${lnk.graveNumberRaw}` : ''
    ].filter(Boolean);
    const graveSummary = graveParts.length > 0 ? graveParts.join('، ') : 'ثبت‌نشده در شیت سوره مهر';

    const pageSummary = lnk.pageReferenceRaw
      ? `ارجاع صفحه ثبت‌شده توسط پژوهشگر: «${lnk.pageReferenceRaw}»`
      : 'ارجاع صفحه در شیت منبع خالی است';

    const descSummary = lnk.sourceDescriptionRaw
      ? `توضیحات کتاب در پژوهش سوره مهر: «${lnk.sourceDescriptionRaw}».`
      : 'بدون توضیح فرعی در ستون توضیحات شیت سوره مهر.';

    const extractedStatus: ExtractedReviewStatus =
      lnk.reviewStatus === 'تأییدشده کارشناسی'
        ? 'تأییدشده کارشناسی'
        : lnk.reviewStatus.includes('نیازمند')
        ? 'نیازمند بررسی'
        : 'بررسی‌شده در پژوهش اصلی';

    byId.set(itemId, {
      id: itemId,
      tempBookId: lnk.tempBookId || '',
      bookTitleRaw: lnk.bookTitleRaw,
      publisherRaw: lnk.publisherRaw || 'سوره مهر',
      martyrNameRaw: lnk.martyrNameRaw,
      gravePieceRaw: lnk.gravePieceRaw || '',
      pageReferenceRaw: lnk.pageReferenceRaw || 'ثبت‌نشده در منبع',
      pageStartNormalized: start,
      pageEndNormalized: end,
      contentType,
      passageTitle: lnk.sourceDescriptionRaw
        ? `${lnk.sourceDescriptionRaw} — ارتباط با شهید ${lnk.martyrNameRaw}`
        : `مطلب پژوهشی مرتبط با شهید ${lnk.martyrNameRaw} در کتاب «${lnk.bookTitleRaw}»`,
      extractedText: `${descSummary} نام شهید مرتبط: «${lnk.martyrNameRaw}» (${graveSummary}). ${pageSummary}.`,
      keywords: [
        lnk.martyrNameRaw,
        lnk.bookTitleRaw,
        lnk.publisherRaw || 'سوره مهر',
        contentType
      ].filter(Boolean),
      researcherNote:
        lnk.reviewerNote ||
        `استخراج‌شده از ${lnk.sourceFile} (${lnk.sourceSheet}، ردیف ${lnk.sourceExcelRow}) — شناسه پیوند: ${lnk.id}`,
      reviewStatus: extractedStatus,
      recordedBy: 'پژوهشگر لیست کتاب‌ها و شهدای مرتبط (سوره مهر)',
      reviewedBy: extractedStatus === 'تأییدشده کارشناسی' ? 'کارشناس مرکز اسناد' : '',
      sourceFile: lnk.sourceFile || 'لیست کتابهای و شهدای مرتبط.xlsx',
      sourceSheet: lnk.sourceSheet || 'Sheet2',
      sourceRow: lnk.sourceExcelRow || '',
      updatedAt: '۱۴۰۵/۰۸/۱۳'
    });
  }

  return Array.from(byId.values());
}

/**
 * بررسی تطابق دوطرفه یک رکورد پیوند (BookMartyrLinkRecord) با یک پرونده شهید از بانک ۲۸٬۳۶۸ شهید گلزار
 * پشتیبانی از:
 * ۱. تطابق دقیق مختصات مزار (قطعه + ردیف + شماره) همراه با هم‌پوشانی نام یا نام خانوادگی (مانند «جعفر جنگروی» <-> «محمد جعفر جنگروی»)
 * ۲. تطابق نام کامل نرمال‌شده (با یکسان‌سازی ی/ئ و اله/الله، مانند «محسن وزوایی» <-> «محسن وزوائی»)
 * ۳. تطابق نام و نام خانوادگی همراه با قطعه مزار یکسان (وقتی ردیف مزار در یکی از دو منبع اختلاف جزئی دارد، مانند قطعه ۲۶ شماره ۵۱ یا قطعه ۲۴ شماره ۲۰/۲۵)
 */
export function doesLinkMatchMartyrRecord(
  link: BookMartyrLinkRecord,
  martyr: {
    first_name?: string;
    last_name?: string;
    fullName?: string;
    grave_piece?: string;
    grave_row?: string;
    grave_number?: string;
  }
): boolean {
  if (!link.martyrNameRaw || link.martyrNameRaw === '*' || link.isGroupPhrase) {
    return false;
  }

  const mFull = martyr.fullName || `${martyr.first_name || ''} ${martyr.last_name || ''}`.trim();
  const linkClean = stripMartyrTitles(link.martyrNameRaw);
  const martyrClean = stripMartyrTitles(mFull);
  const linkCompact = compactPersianForMatch(linkClean);
  const martyrCompact = compactPersianForMatch(martyrClean);
  const lastCompact = compactPersianForMatch(martyr.last_name || '');
  const firstCompact = compactPersianForMatch(martyr.first_name || '');

  if (!linkCompact || !martyrCompact) return false;

  const lp = normalizePersianText(link.gravePieceRaw);
  const lr = normalizePersianText(link.graveRowRaw);
  const ln = normalizePersianText(link.graveNumberRaw);

  const mp = normalizePersianText(martyr.grave_piece);
  const mr = normalizePersianText(martyr.grave_row);
  const mn = normalizePersianText(martyr.grave_number);

  const isNumericPiece = /^\d+$/.test(lp) && /^\d+$/.test(mp);

  // ۱. تطابق کامل نام نرمال‌شده
  if (linkCompact === martyrCompact) {
    // اگر هر دو قطعه عددی دارند، قطعه باید یکسان باشد تا تشابه اسمی بین قطعات مختلف قاطی نشود
    if (isNumericPiece && lp !== mp) return false;
    return true;
  }

  // ۲. تطابق مختصات دقیق مزار (قطعه + ردیف + شماره) + اشتراک نام خانوادگی یا نام
  if (isNumericPiece && lp === mp && lr && mr && lr === mr && ln && mn && ln === mn) {
    if (
      (lastCompact && linkCompact.includes(lastCompact)) ||
      (firstCompact && linkCompact.includes(firstCompact)) ||
      martyrCompact.includes(linkCompact) ||
      linkCompact.includes(martyrCompact)
    ) {
      return true;
    }
  }

  // ۳. تطابق قطعه + شماره مزار + نام خانوادگی و بخش نام (مثل محمد جعفر جنگروی در قطعه 26 شماره 51 یا سیدمحمد شکری در قطعه 26 شماره 21)
  if (
    isNumericPiece &&
    lp === mp &&
    ln &&
    mn &&
    ln === mn &&
    lastCompact.length >= 3 &&
    linkCompact.endsWith(lastCompact) &&
    (martyrCompact.includes(linkCompact) || linkCompact.includes(martyrCompact))
  ) {
    return true;
  }

  return false;
}

/**
 * بررسی تطابق یک رکورد پیوند با یک ردیف کاتالوگ کتاب (بر اساس شناسه BK یا عنوان نرمال‌شده)
 */
export function doesLinkMatchCatalogBook(
  link: BookMartyrLinkRecord,
  book: ReferenceCatalogRow
): boolean {
  if (!link.martyrNameRaw || link.martyrNameRaw === '*') return false;
  if (link.tempBookId && book.tempBookId && link.tempBookId === book.tempBookId) {
    return true;
  }
  const bTitleCompact = compactPersianForMatch(book.titleRaw);
  const lTitleCompact = compactPersianForMatch(link.bookTitleRaw);
  const lAltCompact = compactPersianForMatch(link.alternativeTitle || '');
  if (!bTitleCompact) return false;

  if (bTitleCompact === lTitleCompact || (lAltCompact && bTitleCompact === lAltCompact)) {
    const bPub = compactPersianForMatch(book.publisherRaw);
    const lPub = compactPersianForMatch(link.publisherRaw);
    if (!bPub || !lPub || bPub.includes(lPub) || lPub.includes(bPub)) {
      return true;
    }
  }
  return false;
}

export type MartyrRelationCertainty = 'قطعی' | 'احتمالی' | 'نیازمند بررسی';

export interface BookDossierMartyrRelation {
  linkId: string;
  martyrName: string;
  gravePiece: string;
  graveRow: string;
  graveNumber: string;
  pageReference: string;
  certainty: MartyrRelationCertainty;
  rawStatus: string;
  sourceDescriptionRaw: string;
  evidenceText: string;
  reviewerNote: string;
  sourceFile: string;
  sourceSheet: string;
  sourceSheetCategory: 'کتاب‌های مرتبط با یک شهید' | 'کتاب‌های مرتبط با چند شهید';
  sourceExcelRow: string;
  rawNameInSource: string;
  /** آیا این شهید قطعی/منطبق با شهدای تهرانی (گلزار شهدای تهران — ۲۸٬۳۶۸ شهید) است؟ */
  isTehranMartyr: boolean;
  /** آیا این ردیف صراحتاً به عنوان «غ تهرانی» (غیرتهرانی) ثبت شده است؟ */
  isNonTehranMartyr: boolean;
  /** آیا با وجود ثبت به عنوان غیرتهرانی، هم‌نام با یکی از ۲۸٬۳۶۸ شهید تهران است و نیازمند بررسی کارشناس است؟ */
  hasHomonymIn28kNeedsReview: boolean;
}

export interface UnifiedBookDossier {
  dossierId: string;
  bookId: string;
  rowKey: string;
  title: string;
  alternativeTitle: string;
  author: string;
  publisher: string;
  year: string;
  edition: string;
  isbn: string;
  fipa: string;
  registrationNo: string;
  category: string;
  description: string;
  originCategory: 'base-research' | 'catalog-determined' | 'new-registration';
  isNewRegistration: boolean;
  isDetermined: boolean;
  determinationStatusLabel: string;
  physicalStatus: 'verified' | 'review' | 'not_found' | 'unchecked';
  shelf: string;
  level: string;
  locationCode: string;
  countedCopies: string;
  checkedBy: string;
  updatedAt: string;
  notes: string;
  sheetCategory:
    | 'کتاب‌های مرتبط با یک شهید'
    | 'کتاب‌های مرتبط با چند شهید'
    | 'ثبت جدید'
    | 'فهرست کتابخانه';
  martyrRelations: BookDossierMartyrRelation[];
  /** آیا این کتاب به حداقل یک شهید تهرانی (گلزار شهدای تهران) اشاره دارد و باید نشان قرمزرنگ «تهرانی» بگیرد؟ */
  hasTehranMartyr: boolean;
  /** تعداد شهدای تهرانی مرتبط با این کتاب */
  tehranMartyrsCount: number;
  extractedPassages: ExtractedContentItem[];
  originalExcelData: {
    hasExcelRecord: boolean;
    sourceFile: string;
    sourceSheet: string;
    sourceRow: string;
    rawCells: Array<{ label: string; value: string }>;
    rawRelationRows: Array<{
      linkId: string;
      rowNumber: string;
      sheet: string;
      file: string;
      martyr: string;
      piece: string;
      row: string;
      number: string;
      page: string;
      desc: string;
      status: string;
    }>;
  };
}

const INCLUDED_GROUP_PHRASE_LINK_IDS = new Set([
  'RL-0160', // جاده های سربی
  'RL-0132', // پدیدار شناسی بسیجی شهید
  'RL-0343', // سید آسایشگاه 15
  'RL-0366', // شلیک به آسمان
  'RL-0006', // از جهنم سرد شین تا بهشت ارزنتاک
  'RL-0011', // اسماعیل نذر آفتاب
  'RL-0037', // اوستا علی
  'RL-0076', // بابا نظر
  'RL-0041', // آخرین شلیک
  'RL-0044', // آسمان مال من بود
  'RL-0047' // آن روز سه و نیم بعد از ظهر
]);

export function classifyMartyrLinkCertainty(link: BookMartyrLinkRecord): MartyrRelationCertainty {
  const st = (link.reviewStatus || '').trim();
  const tehranEval = evaluateMartyrTehranStatus({
    martyrName: link.martyrNameRaw,
    gravePiece: link.gravePieceRaw,
    graveRow: link.graveRowRaw,
    graveNumber: link.graveNumberRaw,
    sourceDesc: link.sourceDescriptionRaw,
    reviewerNote: link.reviewerNote,
    reviewStatus: link.reviewStatus,
    isGroupPhrase: link.isGroupPhrase
  });

  // قانون اکید کاربر: اگر شهید در شیت «غ تهرانی» (غیرتهرانی) ثبت شده اما هم‌نام با یکی از ۲۸٬۳۶۸ شهید تهران است،
  // باید به «نیازمند بررسی» برود تا کارشناس بررسی کند.
  if (tehranEval.hasHomonymIn28kNeedsReview && st !== 'تأییدشده کارشناسی') {
    return 'نیازمند بررسی';
  }

  if (st === 'قطعی') return 'قطعی';
  if (st === 'احتمالی') return 'احتمالی';
  if (st === 'نیازمند بررسی') return 'نیازمند بررسی';
  if (link.isGroupPhrase || st.includes('تفکیک نام') || st.includes('نیازمند بررسی')) {
    return 'نیازمند بررسی';
  }
  if (st.includes('تطبیق کتاب') || st.includes('احتمالی') || link.reviewerNote?.includes('کاندید')) {
    return 'احتمالی';
  }
  if (st.includes('تکمیل مزار') || st.includes('بررسی مزار')) {
    if (link.gravePieceRaw && !tehranEval.isNonTehran) {
      return 'احتمالی';
    }
    return 'نیازمند بررسی';
  }
  if (tehranEval.isNonTehran) {
    return 'احتمالی';
  }
  if (
    st === 'تأییدشده کارشناسی' ||
    st === 'تأیید' ||
    st === 'بررسی‌شده در پژوهش اصلی' ||
    tehranEval.isTehran ||
    (link.gravePieceRaw && link.graveRowRaw && link.graveNumberRaw)
  ) {
    return 'قطعی';
  }
  return 'نیازمند بررسی';
}

/**
 * ساخت فهرست یکتا و بدون تکرار پرونده کتاب‌ها (۱۹۸ عنوان پایه + تمامی کتاب‌های منطبق با ۲۸٬۳۶۸ شهید گلزار شهدای تهران
 * + کتاب‌های ثبت جدید یا تعیین‌تکلیف‌شده).
 * هر عنوان کتاب فقط یک رکورد دارد و تمامی شهدای مرتبط با آن در همان پرونده کتاب تجمیع می‌شوند.
 */
export function buildUnifiedBookDossiers(params: {
  catalogRows: ReferenceCatalogRow[];
  auditRecords: Record<string, FieldAuditRecord>;
  bookCopies: BookCopyRecord[];
  links: BookMartyrLinkRecord[];
  extractedItems: ExtractedContentItem[];
}): UnifiedBookDossier[] {
  const { catalogRows, auditRecords, bookCopies, links: rawInputLinks, extractedItems } = params;
  const links = enrichLinksAndCatalogBooksWith28kTehranIndex({
    catalogRows,
    auditRecords,
    links: rawInputLinks
  });

  const catalogById = new Map<string, ReferenceCatalogRow>();
  const catalogByRowKey = new Map<string, ReferenceCatalogRow>();
  const catalogByCompactTitle = new Map<string, ReferenceCatalogRow>();
  for (const row of catalogRows) {
    if (row.tempBookId) catalogById.set(row.tempBookId, row);
    if (row.rowKey) catalogByRowKey.set(row.rowKey, row);
    const ct = compactPersianForMatch(row.titleRaw);
    if (ct && !catalogByCompactTitle.has(ct)) {
      catalogByCompactTitle.set(ct, row);
    }
  }

  const auditByBookId = new Map<string, FieldAuditRecord>();
  const auditByCompactTitle = new Map<string, FieldAuditRecord>();
  for (const rec of Object.values(auditRecords)) {
    if (rec.tempBookId) auditByBookId.set(rec.tempBookId, rec);
    const ct = compactPersianForMatch(rec.title);
    if (ct) auditByCompactTitle.set(ct, rec);
  }

  const copiesByBookId = new Map<string, BookCopyRecord[]>();
  for (const cp of bookCopies) {
    if (!cp.bookId) continue;
    const arr = copiesByBookId.get(cp.bookId) || [];
    arr.push(cp);
    copiesByBookId.set(cp.bookId, arr);
  }

  const extractsByBookId = new Map<string, ExtractedContentItem[]>();
  const extractsByCompactTitle = new Map<string, ExtractedContentItem[]>();
  for (const ex of extractedItems) {
    if (ex.tempBookId) {
      const arr = extractsByBookId.get(ex.tempBookId) || [];
      arr.push(ex);
      extractsByBookId.set(ex.tempBookId, arr);
    }
    const ct = compactPersianForMatch(ex.bookTitleRaw);
    if (ct) {
      const arr = extractsByCompactTitle.get(ct) || [];
      arr.push(ex);
      extractsByCompactTitle.set(ct, arr);
    }
  }

  // گام ۱: تجمیع پیوندهای معتبر بر اساس عنوان یکتای کتاب (بدون ساخت رکورد تکراری برای کتاب‌های چندشهیدی)
  const bookGroups = new Map<
    string,
    {
      key: string;
      primaryBookId: string;
      title: string;
      alternativeTitle: string;
      publisher: string;
      description: string;
      links: BookMartyrLinkRecord[];
      catalogRow?: ReferenceCatalogRow;
      auditRecord?: FieldAuditRecord;
    }
  >();

  const getBookGroupKey = (
    tempBookId: string,
    title: string
  ): string => {
    // حفظ تفکیک زوج‌های دوجلدی مجاز که دو شناسه مستقل در کاتالوگ دارند
    if (
      tempBookId === 'BK-0383' ||
      tempBookId === 'BK-0384' ||
      tempBookId === 'BK-0235' ||
      tempBookId === 'BK-0236' ||
      tempBookId === 'BK-0404' ||
      tempBookId === 'BK-0405'
    ) {
      return tempBookId;
    }
    const ct = compactPersianForMatch(title);
    return ct || tempBookId;
  };

  for (const lnk of links) {
    if (!lnk.martyrNameRaw || lnk.martyrNameRaw === '*') continue;
    const isGhatatSheet = lnk.sourceSheet === 'یک شهید' || lnk.sourceSheet === 'چند شهید';
    const isUserAddedLink = !lnk.id.startsWith('RL-');
    if (
      !isGhatatSheet &&
      !isUserAddedLink &&
      lnk.isGroupPhrase &&
      !INCLUDED_GROUP_PHRASE_LINK_IDS.has(lnk.id)
    ) {
      continue;
    }

    const catRow =
      (lnk.tempBookId ? catalogById.get(lnk.tempBookId) : undefined) ||
      catalogByCompactTitle.get(compactPersianForMatch(lnk.bookTitleRaw));
    const audById = lnk.tempBookId ? auditByBookId.get(lnk.tempBookId) : undefined;
    const resolvedBookId = lnk.tempBookId || catRow?.tempBookId || audById?.tempBookId || '';
    const canonicalTitleForKey = catRow?.titleRaw || audById?.title || lnk.bookTitleRaw;
    const groupKey =
      audById?.source === 'outside-list'
        ? `NEW::${audById.key}`
        : getBookGroupKey(resolvedBookId, canonicalTitleForKey);

    if (!bookGroups.has(groupKey)) {
      const aud =
        audById ||
        (resolvedBookId ? auditByBookId.get(resolvedBookId) : undefined) ||
        (catRow ? auditRecords[catRow.rowKey] : undefined) ||
        auditByCompactTitle.get(compactPersianForMatch(canonicalTitleForKey));

      bookGroups.set(groupKey, {
        key: groupKey,
        primaryBookId: resolvedBookId || `BK-RES-${String(bookGroups.size + 1).padStart(4, '0')}`,
        title: aud?.title || canonicalTitleForKey,
        alternativeTitle: lnk.alternativeTitle || '',
        publisher: aud?.publisher || catRow?.publisherRaw || lnk.publisherRaw || '',
        description: aud?.descriptionRaw || catRow?.descriptionRaw || lnk.sourceDescriptionRaw || '',
        links: [],
        catalogRow: catRow,
        auditRecord: aud
      });
    }

    const grp = bookGroups.get(groupKey)!;
    if (!grp.alternativeTitle && lnk.alternativeTitle) {
      grp.alternativeTitle = lnk.alternativeTitle;
    }
    if (!grp.description && lnk.sourceDescriptionRaw) {
      grp.description = lnk.sourceDescriptionRaw;
    }
    grp.links.push(lnk);
  }

  // گام ۲: افزودن خودکار تمام کتاب‌های ثبت جدید (outside-list) یا کتاب‌های تعیین‌تکلیف‌شده در قفسه که هنوز در ۱۹۸ عنوان پایه نبوده‌اند
  for (const aud of Object.values(auditRecords)) {
    const catRow =
      (aud.tempBookId ? catalogById.get(aud.tempBookId) : undefined) ||
      catalogByRowKey.get(aud.key);
    const standardKey = getBookGroupKey(
      aud.tempBookId || catRow?.tempBookId || aud.key,
      catRow?.titleRaw || aud.title || ''
    );
    const groupKey =
      aud.source === 'outside-list'
        ? bookGroups.has(standardKey)
          ? standardKey
          : `NEW::${aud.key}`
        : standardKey;

    if (!bookGroups.has(groupKey)) {
      bookGroups.set(groupKey, {
        key: groupKey,
        primaryBookId: aud.tempBookId || catRow?.tempBookId || aud.key,
        title: aud.title || catRow?.titleRaw || 'بدون عنوان',
        alternativeTitle: '',
        publisher: aud.publisher || catRow?.publisherRaw || '',
        description: aud.descriptionRaw || catRow?.descriptionRaw || '',
        links: [],
        catalogRow: catRow,
        auditRecord: aud
      });
    } else {
      const existing = bookGroups.get(groupKey)!;
      existing.auditRecord = aud;
      if (aud.title) existing.title = aud.title;
      if (aud.publisher) existing.publisher = aud.publisher;
      if (aud.descriptionRaw) existing.description = aud.descriptionRaw;
    }
  }

  // گام ۳: ساخت پرونده کامل هر کتاب (UnifiedBookDossier)
  const dossiers: UnifiedBookDossier[] = [];
  let indexCounter = 1;

  for (const grp of bookGroups.values()) {
    const catRow = grp.catalogRow;
    const aud = grp.auditRecord;
    const copies = copiesByBookId.get(grp.primaryBookId) || [];
    const firstCopy = copies[0];

    const isExpertVerified = Boolean(aud?.expertApproved);
    const isNewRegistration = Boolean(aud?.source === 'outside-list' && !isExpertVerified);
    const isDetermined = Boolean(aud);

    const hasInitialBaseResearchLink = grp.links.some(
      (lnk) =>
        lnk.id.startsWith('RL-') &&
        !lnk.id.startsWith('RL-USR-') &&
        lnk.sourceFile !== 'ثبت کارشناس در پرونده کتاب'
    );

    const originCategory: UnifiedBookDossier['originCategory'] = isNewRegistration
      ? 'new-registration'
      : hasInitialBaseResearchLink
      ? 'base-research'
      : 'catalog-determined';

    const physicalStatus: UnifiedBookDossier['physicalStatus'] = aud
      ? isExpertVerified
        ? 'verified'
        : aud.physical
      : 'unchecked';

    let determinationStatusLabel = 'تعیین‌تکلیف‌نشده (فهرست اولیه)';
    if (aud) {
      if (isExpertVerified) {
        determinationStatusLabel =
          aud.source === 'outside-list'
            ? 'ثبت جدید — تأیید نهایی کارشناس (تعیین‌تکلیف‌شده)'
            : 'تعیین‌تکلیف‌شده — تأیید نهایی کارشناس';
      } else if (isNewRegistration) {
        determinationStatusLabel =
          aud.physical === 'verified' && aud.copyStatus === 'verified_present'
            ? 'ثبت جدید — تأییدشده در قفسه (در انتظار تأیید نهایی کارشناس)'
            : 'ثبت جدید — در انتظار تأیید کارشناس';
      } else if (aud.physical === 'verified') {
        determinationStatusLabel = 'تعیین‌تکلیف‌شده — موجود در قفسه';
      } else if (aud.physical === 'review') {
        determinationStatusLabel = 'تعیین‌تکلیف‌شده — نیازمند بررسی';
      } else {
        determinationStatusLabel = 'تعیین‌تکلیف‌شده — مشاهده‌نشده در قفسه';
      }
    }

    const isMultiMartyr =
      grp.links.length > 1 || grp.links.some((l) => l.sourceSheet === 'چند شهید' || l.isGroupPhrase);

    const sheetCategory: UnifiedBookDossier['sheetCategory'] = isNewRegistration
      ? 'ثبت جدید'
      : grp.links.length === 0
      ? 'فهرست کتابخانه'
      : isMultiMartyr
      ? 'کتاب‌های مرتبط با چند شهید'
      : 'کتاب‌های مرتبط با یک شهید';

    const martyrRelations: BookDossierMartyrRelation[] = grp.links.map((lnk) => {
      const tehranEval = evaluateMartyrTehranStatus({
        martyrName: lnk.martyrNameRaw,
        gravePiece: lnk.gravePieceRaw,
        graveRow: lnk.graveRowRaw,
        graveNumber: lnk.graveNumberRaw,
        sourceDesc: lnk.sourceDescriptionRaw,
        reviewerNote: lnk.reviewerNote,
        reviewStatus: lnk.reviewStatus,
        isGroupPhrase: lnk.isGroupPhrase
      });
      const rawCertainty = classifyMartyrLinkCertainty(lnk);
      const certainty: MartyrRelationCertainty =
        isExpertVerified && rawCertainty === 'نیازمند بررسی' ? 'قطعی' : rawCertainty;
      const relSheetCat: 'کتاب‌های مرتبط با یک شهید' | 'کتاب‌های مرتبط با چند شهید' =
        lnk.sourceSheet === 'چند شهید' || grp.links.length > 1 || lnk.isGroupPhrase
          ? 'کتاب‌های مرتبط با چند شهید'
          : 'کتاب‌های مرتبط با یک شهید';

      const evidenceParts: string[] = [];
      if (lnk.sourceDescriptionRaw) {
        evidenceParts.push(`موضوع/توضیح منبع: ${lnk.sourceDescriptionRaw}`);
      }
      if (lnk.pageReferenceRaw) {
        evidenceParts.push(`صفحه/ارجاع: ${lnk.pageReferenceRaw}`);
      }
      if (lnk.reviewerNote) {
        evidenceParts.push(`یادداشت بررسی: ${lnk.reviewerNote}`);
      }
      if (evidenceParts.length === 0) {
        evidenceParts.push('ثبت‌شده در شیت پژوهشی ارتباط کتاب و شهید');
      }

      return {
        linkId: lnk.id,
        martyrName: lnk.martyrNameRaw,
        gravePiece: lnk.gravePieceRaw || '—',
        graveRow: lnk.graveRowRaw || '—',
        graveNumber: lnk.graveNumberRaw || '—',
        pageReference: lnk.pageReferenceRaw || 'کل کتاب / ثبت‌نشده',
        certainty,
        rawStatus: lnk.reviewStatus || 'بررسی‌شده در پژوهش اصلی',
        sourceDescriptionRaw: lnk.sourceDescriptionRaw || '',
        evidenceText: evidenceParts.join(' | '),
        reviewerNote: lnk.reviewerNote || '',
        sourceFile: lnk.sourceFile || 'اکسل پژوهشی کتابخانه',
        sourceSheet: lnk.sourceSheet || relSheetCat,
        sourceSheetCategory: relSheetCat,
        sourceExcelRow: lnk.sourceExcelRow || '—',
        rawNameInSource: lnk.rawNameInSource || lnk.martyrNameRaw,
        isTehranMartyr: tehranEval.isTehran,
        isNonTehranMartyr: tehranEval.isNonTehran,
        hasHomonymIn28kNeedsReview: tehranEval.hasHomonymIn28kNeedsReview
      };
    });

    const tehranMartyrsCount = martyrRelations.filter((r) => r.isTehranMartyr).length;
    const hasTehranMartyr = tehranMartyrsCount > 0;

    const byIdExtracts = grp.primaryBookId ? extractsByBookId.get(grp.primaryBookId) || [] : [];
    const byTitleExtracts = extractsByCompactTitle.get(compactPersianForMatch(grp.title)) || [];
    const relatedExtracts =
      byIdExtracts.length === 0
        ? byTitleExtracts
        : byTitleExtracts.length === 0
        ? byIdExtracts
        : Array.from(new Set([...byIdExtracts, ...byTitleExtracts]));

    const rawCells: Array<{ label: string; value: string }> = [];
    if (catRow) {
      rawCells.push(
        { label: 'شناسه کتاب در اکسل', value: catRow.tempBookId || '—' },
        { label: 'عنوان ثبت‌شده در اکسل', value: catRow.titleRaw || '—' },
        { label: 'ناشر در اکسل', value: catRow.publisherRaw || '—' },
        { label: 'توضیحات ستون منبع', value: catRow.descriptionRaw || '—' },
        { label: 'دسته موضوعی خام', value: catRow.categoryRaw || '—' },
        { label: 'نویسنده/گردآورنده خام', value: catRow.authorRaw || '—' },
        { label: 'شابک / فیپا', value: [catRow.isbnRaw, catRow.fipaRaw].filter(Boolean).join(' / ') || '—' },
        { label: 'محل نگهداری در اکسل', value: catRow.locationRaw || '—' },
        { label: 'شیت منبع پشتیبان', value: catRow.backupSourceSheet || '—' },
        { label: 'شماره ردیف در شیت منبع', value: catRow.backupSourceRow || String(catRow.rowIndex) }
      );
    } else if (grp.links.length > 0) {
      const firstLnk = grp.links[0];
      rawCells.push(
        { label: 'عنوان کتاب در شیت پژوهشی', value: firstLnk.bookTitleRaw || '—' },
        { label: 'عنوان دیگر در شیت', value: firstLnk.alternativeTitle || '—' },
        { label: 'ناشر در شیت پژوهشی', value: firstLnk.publisherRaw || '—' },
        { label: 'توضیحات کتاب در منبع', value: firstLnk.sourceDescriptionRaw || '—' },
        { label: 'فایل اکسل منبع', value: firstLnk.sourceFile || '—' },
        { label: 'شیت اکسل منبع', value: firstLnk.sourceSheet || '—' },
        { label: 'ردیف شروع در اکسل', value: firstLnk.groupStartRow || firstLnk.sourceExcelRow || '—' }
      );
    }

    const rawRelationRows = grp.links.map((lnk) => ({
      linkId: lnk.id,
      rowNumber: lnk.sourceExcelRow || '—',
      sheet: lnk.sourceSheet || '—',
      file: lnk.sourceFile || '—',
      martyr: lnk.martyrNameRaw || '—',
      piece: lnk.gravePieceRaw || '—',
      row: lnk.graveRowRaw || '—',
      number: lnk.graveNumberRaw || '—',
      page: lnk.pageReferenceRaw || '—',
      desc: lnk.sourceDescriptionRaw || '—',
      status: lnk.reviewStatus || '—'
    }));

    dossiers.push({
      dossierId: `DOS-${String(indexCounter++).padStart(4, '0')}`,
      bookId: grp.primaryBookId,
      rowKey: aud?.key || catRow?.rowKey || `DOS::${grp.primaryBookId}`,
      title: aud?.title || grp.title,
      alternativeTitle: grp.alternativeTitle,
      author: aud?.author || catRow?.authorRaw || 'ثبت‌نشده',
      publisher: aud?.publisher || grp.publisher || 'ثبت‌نشده',
      year: aud?.year || '—',
      edition: aud?.edition || '—',
      isbn: aud?.isbn || catRow?.isbnRaw || '—',
      fipa: aud?.fipa || catRow?.fipaRaw || '—',
      registrationNo: aud?.registrationNo || catRow?.registrationNoRaw || '—',
      category: aud?.category || catRow?.categoryRaw || '—',
      description: aud?.descriptionRaw || grp.description || '—',
      originCategory,
      isNewRegistration,
      isDetermined,
      determinationStatusLabel,
      physicalStatus,
      shelf: aud?.shelf || firstCopy?.shelf || '',
      level: aud?.level || firstCopy?.level || '',
      locationCode: aud?.location || firstCopy?.location || catRow?.locationRaw || '',
      countedCopies: aud?.countedCopies || catRow?.countedCopiesRaw || '1',
      checkedBy: aud?.checkedBy || '',
      updatedAt: aud?.updatedAt || '',
      notes: aud?.notes || catRow?.noteRaw || '',
      sheetCategory,
      martyrRelations,
      hasTehranMartyr,
      tehranMartyrsCount,
      extractedPassages: relatedExtracts,
      originalExcelData: {
        hasExcelRecord: Boolean(catRow || grp.links.length > 0),
        sourceFile:
          grp.links[0]?.sourceFile ||
          (catRow ? 'فهرست کاری کتابخانه - نسخه 0.1 (1).xlsx' : 'ثبت مستقیم در نرم‌افزار'),
        sourceSheet:
          grp.links[0]?.sourceSheet ||
          catRow?.backupSourceSheet ||
          (isNewRegistration ? 'ثبت جدید در دستگاه' : 'فهرست کتاب‌ها'),
        sourceRow:
          grp.links[0]?.sourceExcelRow ||
          catRow?.backupSourceRow ||
          (catRow ? String(catRow.rowIndex) : '—'),
        rawCells,
        rawRelationRows
      }
    });
  }

  return dossiers;
}

