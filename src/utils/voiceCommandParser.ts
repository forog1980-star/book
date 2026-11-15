import { LevelCode, ShelfCode, SUBJECT_CATEGORIES, toEnglishDigits } from '../data/markazAsnadData';

export interface ParsedVoiceBookCommand {
  rawTranscript: string;
  title: string;
  author: string;
  publisher: string;
  year: string;
  edition: string;
  categoryLabel: string;
  categoryCode: string;
  shelf: ShelfCode | '';
  level: LevelCode | '';
  locationCode: string;
  uncertainFields: string[];
  extractedPairs: { field: string; value: string; confidence: 'قطعی' | 'نیازمند بازبینی' }[];
}

function parseSpokenNumber(text: string): number | null {
  const clean = toEnglishDigits(text).trim();
  const numMatch = clean.match(/\b(\d+)\b/);
  if (numMatch) {
    return parseInt(numMatch[1], 10);
  }
  if (/اول|یکم|یک|۱/.test(clean)) return 1;
  if (/دوم|دو|۲/.test(clean)) return 2;
  if (/سوم|سه|۳/.test(clean)) return 3;
  if (/چهارم|چهار|۴/.test(clean)) return 4;
  if (/پنجم|پنج|۵/.test(clean)) return 5;
  if (/ششم|شش|۶/.test(clean)) return 6;
  return null;
}

export function parsePersianVoiceBookCommand(transcript: string): ParsedVoiceBookCommand {
  const raw = String(transcript || '').trim();
  const normalized = raw
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[،؛]/g, '.')
    .replace(/\s+/g, ' ');

  // Extract segments by keywords
  const extractSegment = (startPatterns: string[]): string => {
    const allKeywords = [
      'عنوان کتاب',
      'نام کتاب',
      'عنوان',
      'نویسنده',
      'گردآورنده',
      'مولف',
      'مؤلف',
      'ناشر',
      'انتشارات',
      'سال چاپ',
      'سال انتشار',
      'سال',
      'نوبت چاپ',
      'چاپ',
      'گروه موضوعی',
      'گروه',
      'دسته',
      'موضوع',
      'محل نگهداری',
      'محل',
      'قفسه'
    ];
    const startRegexStr = `(?:${startPatterns.join('|')})\\s*[:\\-]?\\s*`;
    const stopRegexStr = `(?=(?:\\.|\\s+(?:${allKeywords.join('|')})\\s*[:\\-])|$)`;
    const regex = new RegExp(`${startRegexStr}(.+?)${stopRegexStr}`, 'i');
    const match = normalized.match(regex);
    return match ? match[1].replace(/\.+$/, '').trim() : '';
  };

  const title = extractSegment(['عنوان کتاب', 'نام کتاب', 'عنوان']);
  const author = extractSegment(['نویسنده', 'گردآورنده', 'مؤلف', 'مولف']);
  const publisher = extractSegment(['ناشر', 'انتشارات']);
  const yearRaw = extractSegment(['سال چاپ', 'سال انتشار', 'سال']);
  const edition = extractSegment(['نوبت چاپ', 'چاپ']);
  const groupRaw = extractSegment(['گروه موضوعی', 'گروه', 'دسته', 'موضوع']);
  const locationRaw = extractSegment(['محل نگهداری', 'محل']);

  const yearEng = toEnglishDigits(yearRaw).replace(/[^\d]/g, '');
  const year = yearEng.length === 4 || yearEng.length === 2 ? yearEng : yearRaw;

  // Map Group/Category
  let categoryCode = 'R';
  let categoryLabel = SUBJECT_CATEGORIES[0].label;
  let categoryCertain = false;

  if (groupRaw) {
    if (/روایت|خاطره|خاطرات|^r$/i.test(groupRaw)) {
      categoryCode = 'R';
      categorycertain: categoryCertain = true;
    } else if (/ادبیات|هنر|شعر|داستان|^a$/i.test(groupRaw)) {
      categoryCode = 'A';
      categoryCertain = true;
    } else if (/تاریخ|اسناد|سند|^h$/i.test(groupRaw)) {
      categoryCode = 'H';
      categoryCertain = true;
    } else if (/پژوهش|تحلیل|^p$/i.test(groupRaw)) {
      categoryCode = 'P';
      categoryCertain = true;
    } else if (/کودک|نوجوان|^k$/i.test(groupRaw)) {
      categoryCode = 'K';
      categoryCertain = true;
    } else if (/متفرقه|متنوع|^m$/i.test(groupRaw)) {
      categoryCode = 'M';
      categoryCertain = true;
    }
    const foundCat = SUBJECT_CATEGORIES.find((c) => c.code === categoryCode);
    if (foundCat) categoryLabel = foundCat.label;
  }

  // Parse Shelf & Level from either locationRaw or whole normalized string
  const locSearchTarget = locationRaw || normalized;
  let shelf: ShelfCode | '' = '';
  let level: LevelCode | '' = '';

  const shelfMatch = locSearchTarget.match(/قفسه\s*([۰-۹0-9]+|اول|دوم|سوم|چهارم|یک|دو|سه|چهار)/);
  if (shelfMatch) {
    const sNum = parseSpokenNumber(shelfMatch[1]);
    if (sNum && sNum >= 1 && sNum <= 4) {
      shelf = `SH-0${sNum}` as ShelfCode;
    }
  } else {
    const directSh = locSearchTarget.match(/SH-0([1-4])/i);
    if (directSh) shelf = `SH-0${directSh[1]}` as ShelfCode;
  }

  const levelMatch = locSearchTarget.match(/طبقه\s*([۰-۹0-9]+|اول|دوم|سوم|چهارم|پنجم|ششم|یک|دو|سه|چهار|پنج|شش)/);
  if (levelMatch) {
    const lNum = parseSpokenNumber(levelMatch[1]);
    if (lNum && lNum >= 1 && lNum <= 6) {
      level = `T0${lNum}` as LevelCode;
    }
  } else {
    const directLv = locSearchTarget.match(/T0([1-6])/i);
    if (directLv) level = `T0${directLv[1]}` as LevelCode;
  }

  const locationCode = shelf && level ? `${shelf}-${level}` : '';

  const uncertainFields: string[] = [];
  if (!title) uncertainFields.push('عنوان کتاب تشخیص داده نشد (الزامی)');
  if (!author) uncertainFields.push('نام نویسنده در فرمان صوتی مشخص نبود');
  if (!publisher) uncertainFields.push('نام ناشر در فرمان صوتی مشخص نبود');
  if (!categoryCertain) uncertainFields.push('گروه موضوعی به‌صورت پیش‌فرض روی R قرار گرفت (نیازمند بررسی)');
  if (!shelf || !level) uncertainFields.push('قفسه یا طبقه به‌طور کامل تشخیص داده نشد');

  const extractedPairs: ParsedVoiceBookCommand['extractedPairs'] = [
    { field: 'عنوان کتاب', value: title || '—', confidence: title ? 'قطعی' : 'نیازمند بازبینی' },
    { field: 'نویسنده', value: author || '—', confidence: author ? 'قطعی' : 'نیازمند بازبینی' },
    { field: 'ناشر', value: publisher || '—', confidence: publisher ? 'قطعی' : 'نیازمند بازبینی' },
    { field: 'سال چاپ', value: year || '—', confidence: year ? 'قطعی' : 'نیازمند بازبینی' },
    { field: 'نوبت چاپ', value: edition || '—', confidence: edition ? 'قطعی' : 'نیازمند بازبینی' },
    { field: 'گروه موضوعی', value: categoryLabel, confidence: categoryCertain ? 'قطعی' : 'نیازمند بازبینی' },
    {
      field: 'محل فیزیکی (قفسه و طبقه)',
      value: locationCode || 'انتخاب‌نشده',
      confidence: locationCode ? 'قطعی' : 'نیازمند بازبینی'
    }
  ];

  return {
    rawTranscript: raw,
    title,
    author,
    publisher,
    year,
    edition,
    categoryLabel,
    categoryCode,
    shelf,
    level,
    locationCode,
    uncertainFields,
    extractedPairs
  };
}
