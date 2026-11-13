/**
 * مجموعه آزمون‌های واحد ماژول مستقل داشبورد مدیریتی (فاز ۱)
 * فرمان اجرا: npx tsx src/modules/executive-dashboard/tests/executiveDashboardSelectors.test.ts
 */

import assert from 'node:assert/strict';
import type {
  BookCopyRecord,
  BookMartyrLinkRecord,
  FieldAuditRecord,
  PendingReviewItem,
  ReferenceCatalogRow,
} from '../../../data/markazAsnadData';
import {
  selectExecutiveDashboardSummary,
  selectLibraryAnalytics,
  selectMartyrAnalytics,
  selectRelationAnalytics,
  selectReviewQueue,
  selectTemporalAudit,
} from '../index';

function makeCatalogRow(
  overrides: Partial<ReferenceCatalogRow> & { tempBookId: string; titleRaw: string }
): ReferenceCatalogRow {
  const rowIndex = overrides.rowIndex ?? 2;
  return {
    rowKey: `فهرست کتاب‌ها::ROW-${rowIndex}`,
    rowIndex,
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
    backupSourceRow: String(rowIndex),
    allValues: [],
    ...overrides,
  };
}

function makeLink(
  overrides: Partial<BookMartyrLinkRecord> & { id: string; martyrNameRaw: string }
): BookMartyrLinkRecord {
  return {
    tempBookId: '',
    bookTitleRaw: '',
    publisherRaw: '',
    isGroupPhrase: false,
    gravePieceRaw: '',
    graveRowRaw: '',
    graveNumberRaw: '',
    pageReferenceRaw: '',
    sourceDescriptionRaw: '',
    sourceFile: 'فایل مرجع',
    sourceSheet: 'Sheet2',
    sourceExcelRow: '2',
    reviewStatus: 'بررسی‌نشده',
    reviewerNote: '',
    ...overrides,
  };
}

let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (err) {
    console.error(`FAIL: ${name}`);
    throw err;
  }
}

// اطمینان از عدم وابستگی زمان اجرا به window یا localStorage
test('01 - اجرای خالص بدون وابستگی به window / localStorage / indexedDB', () => {
  assert.equal(typeof (globalThis as Record<string, unknown>).window, 'undefined');
  assert.equal(typeof (globalThis as Record<string, unknown>).localStorage, 'undefined');

  const summary = selectExecutiveDashboardSummary({ catalogRows: [] });
  assert.equal(summary.totalBooksKpi.catalogBooksCount, 0);
  assert.equal(summary.totalBooksKpi.subtitle, 'از کل کتابهای ثبتشده در کتابخانه');
  assert.equal(summary.bookReviewStatusKpi.reviewedCount, 0);
});

test('02 - تفکیک ردیف کاتالوگ، شناسه مستقل کتاب و عناوین مشابه بدون ادغام خودکار', () => {
  const catalogRows: ReferenceCatalogRow[] = [
    makeCatalogRow({ rowIndex: 2, tempBookId: 'BK-0235', titleRaw: 'شب خاطره', publisherRaw: 'سوره مهر' }),
    makeCatalogRow({ rowIndex: 3, tempBookId: 'BK-0236', titleRaw: 'شب خاطره', publisherRaw: 'سوره مهر' }),
    makeCatalogRow({ rowIndex: 4, tempBookId: 'BK-0092', titleRaw: 'ضربت متقابل' }),
    makeCatalogRow({ rowIndex: 5, tempBookId: 'BK-0093', titleRaw: 'ضربت متقابل(غ ر)' }),
  ];

  const auditRecords: Record<string, FieldAuditRecord> = {
    'OUT-1': {
      key: 'OUT-1',
      source: 'outside-list',
      sheet: 'ثبت جدید',
      tempBookId: 'TMP-OUT-001',
      title: 'کتاب خارج از فهرست',
      author: '',
      publisher: 'نشر شاهد',
      year: '',
      category: 'R',
      shelf: 'SH-01',
      level: 'T01',
      location: 'SH-01-T01',
      physical: 'verified',
      countedCopies: '2',
      notes: '',
      updatedAt: '۱۴۰۵/۰۸/۰۵',
    },
  };

  const lib = selectLibraryAnalytics({ catalogRows, auditRecords });
  assert.equal(lib.catalogRowsCount, 4);
  assert.equal(lib.distinctCatalogBookIdsCount, 4);
  assert.equal(lib.outsideCatalogBooksCount, 1);
  assert.equal(lib.totalTrackedBooksCount, 5);
  assert.equal(lib.exactUniqueCatalogTitlesCount, 3);
  assert.equal(lib.similarTitleGroups.length, 1);
  assert.deepEqual(lib.similarTitleGroups[0].bookIds, ['BK-0235', 'BK-0236']);
});

test('03 - تمایز تعداد نسخه‌های فیزیکی ثبت‌شده (CP) از تعداد کتاب‌ها و شمارش عددی قفسه', () => {
  const catalogRows: ReferenceCatalogRow[] = [
    makeCatalogRow({ rowIndex: 2, tempBookId: 'BK-0014', titleRaw: 'با مرام', countedCopiesRaw: '3' }),
    makeCatalogRow({ rowIndex: 3, tempBookId: 'BK-0015', titleRaw: 'کتاب بی‌نسخه' }),
  ];
  const bookCopies: BookCopyRecord[] = [
    {
      copyId: 'CP-000001',
      bookId: 'BK-0014',
      bookTitle: 'با مرام',
      copyStatus: 'verified_present',
      shelf: 'SH-01',
      level: 'T01',
      location: 'SH-01-T01',
      observedDate: '۱۴۰۵/۰۸/۰۳',
      physicalCondition: 'healthy',
      loanOrMoveStatus: 'در قفسه مرکز اسناد',
      expertNote: '',
      lastReviewedAt: '۱۴۰۵/۰۸/۰۴',
      locationHistory: [],
    },
    {
      copyId: 'CP-000002',
      bookId: 'BK-0014',
      bookTitle: 'با مرام',
      copyStatus: 'loaned',
      shelf: 'SH-01',
      level: 'T02',
      location: 'SH-01-T02',
      observedDate: '۱۴۰۵/۰۸/۰۴',
      physicalCondition: 'healthy',
      loanOrMoveStatus: 'امانت به پژوهشگر',
      expertNote: '',
      lastReviewedAt: '۱۴۰۵/۰۸/۰۴',
      locationHistory: [],
    },
  ];

  const lib = selectLibraryAnalytics({ catalogRows, bookCopies });
  assert.equal(lib.totalTrackedBooksCount, 2);
  assert.equal(lib.registeredPhysicalCopiesCount, 2);
  assert.equal(lib.physicalCopiesStatusBreakdown.verifiedPresent, 1);
  assert.equal(lib.physicalCopiesStatusBreakdown.loaned, 1);
  assert.equal(lib.reportedCountedCopiesSum, 3);
});

test('04 - بررسی وضعیت بررسی کتاب‌ها شامل «بررسی‌شده؛ بدون ارتباط با شهید» و هم‌پوشانی صف', () => {
  const catalogRows: ReferenceCatalogRow[] = [
    makeCatalogRow({ rowIndex: 2, tempBookId: 'BK-0001', titleRaw: 'کتاب با شهید', reviewStatusRaw: 'بررسی‌نشده' }),
    makeCatalogRow({ rowIndex: 3, tempBookId: 'BK-0002', titleRaw: 'کتاب بررسی‌شده بدون شهید', reviewStatusRaw: 'بررسی شد' }),
    makeCatalogRow({ rowIndex: 4, tempBookId: 'BK-0003', titleRaw: 'کتاب بررسی میدانی بی‌شهید', reviewStatusRaw: 'بررسی‌نشده' }),
    makeCatalogRow({ rowIndex: 5, tempBookId: 'BK-0004', titleRaw: 'کتاب در حال بررسی', reviewStatusRaw: 'بررسی‌نشده' }),
    makeCatalogRow({ rowIndex: 6, tempBookId: 'BK-0005', titleRaw: 'کتاب دست‌نخورده', reviewStatusRaw: 'بررسی‌نشده' }),
  ];

  const auditRecords: Record<string, FieldAuditRecord> = {
    'فهرست کتاب‌ها::ROW-2': {
      key: 'فهرست کتاب‌ها::ROW-2',
      source: 'catalog',
      sheet: 'فهرست کتاب‌ها',
      tempBookId: 'BK-0001',
      title: 'کتاب با شهید',
      author: '',
      publisher: 'سوره مهر',
      year: '',
      category: 'R',
      shelf: 'SH-01',
      level: 'T01',
      location: 'SH-01-T01',
      physical: 'verified',
      countedCopies: '1',
      notes: '',
      relatedMartyrs: ['شهید احمد متوسلیان'],
      expertApproved: true,
      updatedAt: '۱۴۰۵/۰۸/۰۱',
    },
    'فهرست کتاب‌ها::ROW-4': {
      key: 'فهرست کتاب‌ها::ROW-4',
      source: 'catalog',
      sheet: 'فهرست کتاب‌ها',
      tempBookId: 'BK-0003',
      title: 'کتاب بررسی میدانی بی‌شهید',
      author: '',
      publisher: 'سوره مهر',
      year: '',
      category: 'R',
      shelf: 'SH-01',
      level: 'T01',
      location: 'SH-01-T01',
      physical: 'verified',
      needsReview: false,
      countedCopies: '1',
      notes: '',
      relatedMartyrs: [],
      updatedAt: '۱۴۰۵/۰۸/۰۲',
    },
    'فهرست کتاب‌ها::ROW-5': {
      key: 'فهرست کتاب‌ها::ROW-5',
      source: 'catalog',
      sheet: 'فهرست کتاب‌ها',
      tempBookId: 'BK-0004',
      title: 'کتاب در حال بررسی',
      author: '',
      publisher: 'سوره مهر',
      year: '',
      category: 'R',
      shelf: 'SH-01',
      level: 'T01',
      location: 'SH-01-T01',
      physical: 'review',
      needsReview: true,
      countedCopies: '1',
      notes: '',
      updatedAt: '۱۴۰۵/۰۸/۰۳',
    },
  };

  // کتاب BK-0002 بررسی‌شده است اما یک مورد پیگیری باز در صف بررسی دارد
  const pendingReviews: PendingReviewItem[] = [
    {
      trackingId: 'PV-0001',
      mainSheet: 'فهرست کتاب‌ها',
      mainRecordId: 'BK-0002',
      nameOrPhrase: 'تطبیق عنوان',
      bookTitle: 'کتاب بررسی‌شده بدون شهید',
      publisher: 'سوره مهر',
      issueSubject: 'تطبیق هم‌نامی',
      suggestedAction: 'بررسی چاپ',
      trackingStatus: 'باز',
    },
  ];

  const lib = selectLibraryAnalytics({ catalogRows, auditRecords, pendingReviews });
  const rb = lib.reviewBreakdown;

  assert.equal(rb.totalTrackedBooksCount, 5);
  assert.equal(rb.reviewedWithMartyrLinkCount, 1); // BK-0001
  assert.equal(rb.reviewedWithoutMartyrLinkCount, 2); // BK-0002 + BK-0003
  assert.equal(rb.reviewedCount, 3);
  assert.equal(rb.inFieldReviewCount, 1); // BK-0004
  assert.equal(rb.untouchedUnreviewedCount, 1); // BK-0005
  assert.equal(rb.remainingForReviewCount, 2);
  assert.equal(rb.reviewedCount + rb.remainingForReviewCount, rb.totalTrackedBooksCount);
  assert.equal(rb.reviewedBooksWithOpenRelationQueueCount, 1); // BK-0002
  assert.equal(rb.overlapRemainingAndEligibleCount, 2);
  assert.equal(rb.eligibleForReviewCount, 3); // 2 باقی‌مانده + 1 کتاب بررسی‌شده دارای پیگیری باز
});

test('05 - تفکیک قطعی سطوح قطعیت رابطه، عدم تلقی استخراج از توضیحات به‌عنوان تأیید کارشناس، و حفظ نوع نامشخص', () => {
  const catalogRows: ReferenceCatalogRow[] = [
    makeCatalogRow({ rowIndex: 2, tempBookId: 'BK-0100', titleRaw: 'کتاب یکم' }),
    makeCatalogRow({ rowIndex: 3, tempBookId: 'BK-0101', titleRaw: 'کتاب دوم' }),
  ];

  const links: BookMartyrLinkRecord[] = [
    // ۱. تأییدشده توسط کارشناس (صریح)
    makeLink({
      id: 'RL-1',
      tempBookId: 'BK-0100',
      bookTitleRaw: 'کتاب یکم',
      martyrNameRaw: 'شهید احمد متوسلیان',
      sourceSheet: 'یک شهید',
      pageReferenceRaw: '',
      reviewStatus: 'تأییدشده کارشناسی',
    }),
    // ۲. تکرار تکراری دقیقاً برای همان کتاب و همان شهید
    makeLink({
      id: 'RL-2',
      tempBookId: 'BK-0100',
      bookTitleRaw: 'کتاب یکم',
      martyrNameRaw: 'احمد متوسلیان',
      sourceSheet: 'Sheet2',
      reviewStatus: 'احتمالی',
    }),
    // ۳. استخراج‌شده از توضیحات کتاب یا پژوهش اصلی -> باید «احتمالی» باشد نه تأیید کارشناس!
    makeLink({
      id: 'RL-3',
      tempBookId: 'BK-0101',
      bookTitleRaw: 'کتاب دوم',
      martyrNameRaw: 'شهید محسن وزوایی',
      sourceDescriptionRaw: 'برگرفته از توضیحات کتاب درباره شهید محسن وزوایی',
      sourceSheet: 'یک شهید',
      pageReferenceRaw: '',
      reviewStatus: 'بررسی‌شده در پژوهش اصلی',
    }),
    // ۴. نیازمند بررسی (عبارت گروهی / ستاره)
    makeLink({
      id: 'RL-4',
      tempBookId: 'BK-0101',
      bookTitleRaw: 'کتاب دوم',
      martyrNameRaw: '*',
      isGroupPhrase: true,
      reviewStatus: 'نیازمند تکمیل',
    }),
    // ۵. ردشده
    makeLink({
      id: 'RL-5',
      tempBookId: 'BK-0101',
      bookTitleRaw: 'کتاب دوم',
      martyrNameRaw: 'شهید تستی ردشده',
      reviewStatus: 'ردشده با دلیل',
    }),
    // ۶. فاقد تعیین تکلیف (بررسی‌نشده بدون هیچ شواهد مزار یا پژوهشی)
    makeLink({
      id: 'RL-6',
      tempBookId: 'BK-0101',
      bookTitleRaw: 'کتاب دوم',
      martyrNameRaw: 'شهید تعیین تکلیف نشده',
      reviewStatus: 'بررسی‌نشده',
    }),
  ];

  const rel = selectRelationAnalytics({ catalogRows, links });

  assert.equal(rel.totalRawLinkRows, 6);
  assert.equal(rel.distinctBookTargetPairsCount, 5); // RL-1 و RL-2 روی یک زوج ادغام شده است
  assert.equal(rel.duplicatePairRowsCount, 1);

  assert.equal(rel.certaintyByRawRows.confirmedByExpert, 1);
  assert.equal(rel.certaintyByRawRows.probable, 2); // RL-2 + RL-3 (بررسی‌شده در پژوهش اصلی)
  assert.equal(rel.certaintyByRawRows.needsReview, 1); // RL-4
  assert.equal(rel.certaintyByRawRows.rejected, 1); // RL-5
  assert.equal(rel.certaintyByRawRows.undetermined, 1); // RL-6

  // قطعاً هرگز نوع ارتباط از روی شیت «یک شهید» یا صفحه خالی حدس زده نمی‌شود
  assert.equal(rel.relationKindBreakdown['نامشخص'], 6);
  assert.equal(rel.relationKindBreakdown['کتاب اختصاصی شهید'], 0);
  assert.equal(rel.relationKindBreakdown['دارای بخش یا اشاره به شهید'], 0);

  // هر دو کتاب فعال هستند (RL-5 ردشده است ولی BK-0101 لینک غیرردشده دارد)
  assert.equal(rel.booksWithLinksBreakdown.totalBooksWithActiveLinks, 2);
  assert.equal(rel.booksWithLinksBreakdown.booksWithExpertConfirmedLink, 1);
});

test('06 - جداسازی شهید نام‌دار، گمنام و غیرشهید (اموات) + عدم ادغام هم‌نام‌ها + تمایز نام مرتبط از شهید احرازشده', () => {
  const golzarRecords = [
    // دو شهید هم‌نام «محمد حسینی» با نام پدر و مزار متفاوت -> نباید ادغام شوند
    { firstName: 'محمد', lastName: 'حسینی', fatherName: 'علی', gravePiece: '24', graveRow: '10', graveNumber: '1', source: 'golzar' as const },
    { firstName: 'محمد', lastName: 'حسینی', fatherName: 'رضا', gravePiece: '26', graveRow: '5', graveNumber: '12', source: 'golzar' as const },
    // شهید گمنام
    { firstName: 'شهید گمنام', lastName: '۳۶ ساله', fatherName: '', gravePiece: '44', graveRow: '1', graveNumber: '2', source: 'golzar' as const },
    // غیرشهید (اموات)
    { firstName: 'اموات', lastName: 'تست', fatherName: '', gravePiece: '1', graveRow: '1', graveNumber: '1', source: 'golzar' as const },
    // شهید غیرهم‌نام یکتا
    { firstName: 'محسن', lastName: 'وزوایی', fatherName: 'غلامحسین', gravePiece: '26', graveRow: '4', graveNumber: '15', source: 'golzar' as const },
  ];

  const links: BookMartyrLinkRecord[] = [
    // پیوند با «محمد حسینی» بدون مشخص کردن قطعه/ردیف/شماره -> نامش در نام‌های پیوندخورده هست ولی شخص قطعی احراز نشده (تعارض هم‌نامی)
    makeLink({
      id: 'RL-10',
      tempBookId: 'BK-0010',
      martyrNameRaw: 'شهید محمد حسینی',
      reviewStatus: 'نیازمند بررسی مزار',
    }),
    // پیوند با «محسن وزوایی» با مزار کامل
    makeLink({
      id: 'RL-11',
      tempBookId: 'BK-0011',
      martyrNameRaw: 'شهید محسن وزوایی',
      gravePieceRaw: '26',
      graveRowRaw: '4',
      graveNumberRaw: '15',
      reviewStatus: 'بررسی‌نشده',
    }),
    // ردیف ستاره که شخص نیست
    makeLink({
      id: 'RL-12',
      tempBookId: 'BK-0012',
      martyrNameRaw: '*',
      isGroupPhrase: true,
      reviewStatus: 'نیازمند تکمیل',
    }),
  ];

  const martyrs = selectMartyrAnalytics({ catalogRows: [], golzarRecords, links });

  assert.equal(martyrs.officialBank.totalRows, 5);
  assert.equal(martyrs.officialBank.namedMartyrRowsCount, 3);
  assert.equal(martyrs.officialBank.unknownMartyrRowsCount, 1);
  assert.equal(martyrs.officialBank.nonMartyrRowsCount, 1);
  assert.equal(martyrs.officialBank.distinctNormalizedFullNamesCount, 2); // محمد حسینی + محسن وزوایی
  assert.equal(martyrs.officialBank.disambiguatedNamedProfilesCount, 3); // هم‌نام‌ها جدا ماندند
  assert.equal(martyrs.officialBank.homonymGroupsCount, 1);
  assert.equal(martyrs.officialBank.homonymRowsCount, 2);

  assert.equal(martyrs.linkedMartyrsSummary.distinctNormalizedLinkedNamesCount, 2); // محمد حسینی + محسن وزوایی
  assert.equal(martyrs.linkedMartyrsSummary.confirmedUniqueLinkedMartyrsCount, 1); // فقط محسن وزوایی احراز شد
  assert.equal(martyrs.linkedMartyrsSummary.ambiguousOrUnverifiedLinkedNamesCount, 1);
  assert.deepEqual(martyrs.linkedMartyrsSummary.homonymAmbiguityNames, ['محمد حسینی']);
  assert.equal(martyrs.linkedMartyrsSummary.placeholderOrGroupLinkRowsCount, 1);
});

test('07 - ممیزی مهر زمان و جلوگیری از نسبت‌دادن داده‌های تاریخی فاقد تاریخ به عملکرد دوره‌ای', () => {
  const catalogRows: ReferenceCatalogRow[] = [
    makeCatalogRow({ rowIndex: 2, tempBookId: 'BK-0001', titleRaw: 'کتاب قدیمی ۱' }),
    makeCatalogRow({ rowIndex: 3, tempBookId: 'BK-0002', titleRaw: 'کتاب قدیمی ۲' }),
  ];

  const auditRecords: Record<string, FieldAuditRecord> = {
    A1: {
      key: 'A1',
      source: 'catalog',
      sheet: 'فهرست کتاب‌ها',
      tempBookId: 'BK-0001',
      title: 'کتاب قدیمی ۱',
      author: '',
      publisher: '',
      year: '',
      category: 'R',
      shelf: 'SH-01',
      level: 'T01',
      location: 'SH-01-T01',
      physical: 'verified',
      countedCopies: '1',
      notes: '',
      updatedAt: '۱۴۰۵/۰۸/۰۴', // معتبر جلالی با ارقام فارسی
    },
    A2: {
      key: 'A2',
      source: 'catalog',
      sheet: 'فهرست کتاب‌ها',
      tempBookId: 'BK-0002',
      title: 'کتاب قدیمی ۲',
      author: '',
      publisher: '',
      year: '',
      category: 'R',
      shelf: 'SH-01',
      level: 'T01',
      location: 'SH-01-T01',
      physical: 'verified',
      countedCopies: '1',
      notes: '',
      updatedAt: '2026-11-12T21:19:33Z', // معتبر ISO میلادی
    },
    A3: {
      key: 'A3',
      source: 'catalog',
      sheet: 'فهرست کتاب‌ها',
      tempBookId: 'BK-0003',
      title: 'کتاب تاریخ نامعتبر',
      author: '',
      publisher: '',
      year: '',
      category: 'R',
      shelf: 'SH-01',
      level: 'T01',
      location: 'SH-01-T01',
      physical: 'review',
      countedCopies: '1',
      notes: '',
      updatedAt: '۱۴۰۵/۱۳/۴۰', // ماه و روز نامعتبر
    },
  };

  const temporal = selectTemporalAudit({ catalogRows, auditRecords });
  assert.equal(temporal.datelessLegacyExcludedFromPeriodicMetrics, true);
  assert.equal(temporal.structurallyDatelessSources.catalogRowsCount, 2);
  assert.equal(temporal.totalValidTimestampRecords, 2);
  assert.equal(temporal.totalInvalidTimestampRecords, 1);
  assert.equal(temporal.monthlyActivity.length, 2);
  assert.equal(temporal.monthlyActivity[0].periodKey, '1405-08');
  assert.equal(temporal.monthlyActivity[1].periodKey, 'ISO-2026-11');
});

test('08 - شمارش ۱۶ گروه چندشهیدی و صف بررسی PV در selectReviewQueue', () => {
  const pendingReviews: PendingReviewItem[] = [
    {
      trackingId: 'PV-1',
      mainSheet: 'ارتباط کتاب و شهید',
      mainRecordId: 'RL-1',
      nameOrPhrase: '*',
      bookTitle: 'کتاب الف',
      publisher: 'سوره مهر',
      issueSubject: 'نیازمند نام شهید',
      suggestedAction: 'تکمیل',
      trackingStatus: 'باز',
    },
    {
      trackingId: 'PV-2',
      mainSheet: 'فهرست کتاب‌ها',
      mainRecordId: 'BK-0235',
      nameOrPhrase: 'شب خاطره',
      bookTitle: 'شب خاطره',
      publisher: 'سوره مهر',
      issueSubject: 'عنوان هم‌نام',
      suggestedAction: 'تعیین جلد',
      trackingStatus: 'بررسی‌شده',
    },
  ];
  const links: BookMartyrLinkRecord[] = [
    makeLink({ id: 'RL-10', martyrNameRaw: 'شهید ۱', sourceSheet: 'چند شهید', groupStartRow: '2' }),
    makeLink({ id: 'RL-11', martyrNameRaw: 'شهید ۲', sourceSheet: 'چند شهید', groupStartRow: '2' }),
    makeLink({ id: 'RL-12', martyrNameRaw: 'شهید ۳', sourceSheet: 'چند شهید', groupStartRow: '15' }),
  ];

  const rq = selectReviewQueue({ catalogRows: [], pendingReviews, links });
  assert.equal(rq.pendingReviews.totalCount, 2);
  assert.equal(rq.pendingReviews.openCount, 1);
  assert.equal(rq.pendingReviews.resolvedCount, 1);
  assert.equal(rq.multiMartyrGroups.totalGroupsCount, 2);
  assert.equal(rq.multiMartyrGroups.totalMemberRowsCount, 3);
});

console.log(`\nALL_UNIT_TESTS_PASSED (${passed} tests)`);
