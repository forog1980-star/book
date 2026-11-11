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
let cachedTotalRecordsCount = 28368;
let loadingPromise: Promise<LightweightGolzarMartyr[]> | null = null;

function cleanCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).replace(/\?/g, '').trim();
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
      const wb = XLSX.read(buf, { type: 'array', cellDates: false });

      const golzarRows = wb.Sheets['golzar_martyrs']
        ? XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['golzar_martyrs'], { defval: '' })
        : [];
      const outsideRows = wb.Sheets['outside_golzar_martyrs']
        ? XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['outside_golzar_martyrs'], { defval: '' })
        : [];

      cachedTotalRecordsCount = golzarRows.length + outsideRows.length || 28368;
      const list: LightweightGolzarMartyr[] = [];

      golzarRows.forEach((r, idx) => {
        const fn = cleanCell(r['نام']);
        const ln = cleanCell(r['نام خانوادگی']);
        const fullName = `${fn} ${ln}`.trim();
        if (!fullName || fullName.includes('گمنام')) return;
        const norm = normalizePersianText(fullName.replace(/^شهید\s+/, ''));
        if (!norm) return;
        list.push({
          id: `G-${idx + 2}`,
          fullName,
          normalizedFullName: norm,
          firstName: fn,
          lastName: ln,
          fatherName: cleanCell(r['نام پدر']),
          gravePiece: cleanCell(r['قطعه مزار']),
          graveRow: cleanCell(r['ردیف مزار']),
          graveNumber: cleanCell(r['شماره مزار']),
          martyrdomOperation: cleanCell(r['عملیات']),
          source: 'golzar'
        });
      });

      outsideRows.forEach((r, idx) => {
        const fn = cleanCell(r['نام']);
        const ln = cleanCell(r['نام خانوادگی']);
        const fullName = `${fn} ${ln}`.trim();
        if (!fullName || fullName.includes('گمنام')) return;
        const norm = normalizePersianText(fullName.replace(/^شهید\s+/, ''));
        if (!norm) return;
        list.push({
          id: `O-${idx + 2}`,
          fullName,
          normalizedFullName: norm,
          firstName: fn,
          lastName: ln,
          fatherName: cleanCell(r['نام پدر']),
          gravePiece: cleanCell(r['قطعه مزار']),
          graveRow: cleanCell(r['ردیف مزار']),
          graveNumber: cleanCell(r['شماره مزار']),
          martyrdomOperation: '',
          source: 'outside'
        });
      });

      cachedGolzarMartyrs = list;
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

export function findMartyrGraveIn28k(
  martyrName: string,
  golzarMartyrs: LightweightGolzarMartyr[]
): { gravePiece: string; graveRow: string; graveNumber: string } | null {
  const norm = normalizePersianText((martyrName || '').replace(/^شهید\s+/, ''));
  if (!norm) return null;
  const exact = golzarMartyrs.find((gm) => gm.normalizedFullName === norm);
  if (exact) {
    return {
      gravePiece: exact.gravePiece,
      graveRow: exact.graveRow,
      graveNumber: exact.graveNumber
    };
  }
  return null;
}

/**
 * تجمیع تمام کتاب‌های موجود در سامانه (۹۸۰ کتاب مرجع + کتاب‌های جدید خارج از فهرست ثبت‌شده در کتابخانه)
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
        descriptionRaw: [row.descriptionRaw, audit.descriptionRaw, audit.notes]
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
          descriptionRaw: [rec.descriptionRaw, rec.notes].filter(Boolean).join(' | '),
          categoryRaw: rec.category || 'R',
          authorRaw: rec.author || '',
          isbnRaw: '',
          fipaRaw: '',
          registrationNoRaw: rec.copyId || '',
          locationRaw: rec.location || '',
          countedCopiesRaw: rec.countedCopies || '1',
          reviewStatusRaw: rec.needsReview ? 'نیازمند بررسی' : 'ثبت خارج از فهرست',
          noteRaw: rec.notes || '',
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
 * هنگامی که یک کتاب جدید اضافه یا ویرایش می‌شود، با تمام اسامی شهدا (۲۸٬۳۶۸ شهید گلزار + پرونده‌های ثبتی + کارپوشه) مقابله می‌کند
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
  const normTitle = normalizePersianText(book.title || '');
  const normDesc = normalizePersianText(`${book.description || ''} ${book.notes || ''}`);
  const normAuthor = normalizePersianText(book.author || '');
  const fullBookHaystack = ` ${normTitle} ${normDesc} ${normAuthor} `;
  if (!fullBookHaystack.trim()) return [];

  const bookRow: ReferenceCatalogRow = {
    rowKey: book.tempBookId,
    rowIndex: 0,
    tempBookId: book.tempBookId,
    titleRaw: book.title,
    publisherRaw: book.publisher || '—',
    descriptionRaw: [book.description, book.notes].filter(Boolean).join(' | '),
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
    if (fullBookHaystack.includes(` ${clean} `) || normTitle.includes(clean)) {
      const inTitle = normTitle.includes(clean);
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
          : `[نیازمند بررسی — مقابله خودکار] تشابه نام شهید «${cm.fullName}» در توضیحات/مشخصات کتاب «${book.title}» (${book.tempBookId}).`
      });
    }
  }

  // ۲. بررسی شهدای کارپوشه اکسل (workbookMartyrs)
  for (const wm of workbookMartyrs) {
    const clean = normalizePersianText(wm.fullNameSearch.replace(/^شهید\s+/, ''));
    if (!clean || clean.length < 5 || resultsMap.has(clean)) continue;
    if (fullBookHaystack.includes(` ${clean} `) || normTitle.includes(clean)) {
      const inTitle = normTitle.includes(clean);
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
          : `[نیازمند بررسی — مقابله خودکار] تشابه نام شهید «${wm.fullNameSearch}» در توضیحات/مشخصات کتاب «${book.title}» (${book.tempBookId}).`
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

  // ساخت نمایه توکنی از کتاب‌ها برای جست‌وجوی آنی در چند میلی‌ثانیه
  const preparedBooks = allBooks.map((b) => {
    const normTitle = normalizePersianText(b.titleRaw);
    const normDesc = normalizePersianText(`${b.descriptionRaw} ${b.noteRaw}`);
    const normAuthor = normalizePersianText(b.authorRaw);
    const paddedHaystack = ` ${normTitle} ${normDesc} ${normAuthor} `;
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
