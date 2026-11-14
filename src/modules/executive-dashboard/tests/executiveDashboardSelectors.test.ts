/**
 * مجموعه آزمون‌های واحد ماژول مستقل داشبورد مدیریتی (فاز ۱)
 * فرمان اجرا: npx tsx src/modules/executive-dashboard/tests/executiveDashboardSelectors.test.ts
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type {
  BookCopyRecord,
  BookMartyrLinkRecord,
  CustomMartyrRecord,
  FieldAuditRecord,
  PendingReviewItem,
  ReferenceCatalogRow,
} from '../../../data/markazAsnadData';
import {
  RELATION_CERTAINTY_DISPLAY_LABELS,
  EXECUTIVE_EXPORT_HISTORY_KEY,
  EXECUTIVE_FINALIZED_REPORTS_KEY,
  MAX_EXECUTIVE_EXPORT_HISTORY,
  appendExportHistoryRecordPure,
  deleteExportHistoryRecordPure,
  filterExportHistoryRecordsPure,
  upsertRegistryReportPure,
  registerNewReportVersionPure,
  finalizeRegistryReportPure,
  deleteRegistryReportPure,
  computeFinalizedRegistryStats,
  loadFinalizedReportsRegistry,
  saveFinalizedReportsRegistry,
  buildExecutiveEntityProjection,
  buildExecutiveDashboardExportV1,
  buildStatisticalQueryAnswers,
  answerCustomStatisticalQuestion,
  classifyPendingReviewStatus,
  computeUnifiedStatisticsSearch,
  filterAuditLogEntriesPure,
  mapLightweightGolzarToRawInputs,
  pickHigherPriorityPendingStatus,
  selectActivityLogSummary,
  selectExecutiveDashboardSummary,
  selectFinalizedManagementReportsSummary,
  selectFinalizedResearchOutputsSummary,
  selectLibraryAnalytics,
  selectMartyrAnalytics,
  selectRelationAnalytics,
  selectReviewQueue,
  selectTemporalAudit,
  selectThreeCardOverview,
  selectThreeCardOverviewFromSummary,
  selectWorkAndOutputsDetailedAnalytics,
  selectDrilldownData,
  DRILLDOWN_META_MAP,
  type DashboardDrilldownKey,
  type ExecutiveExportHistoryRecord,
  type FinalizedReportRegistryRecord,
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

async function asyncTest(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
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

test('09 - افراز گزینه ج (تکمیل‌شده بدون تیکت باز / دارای تیکت باز تکرار عنوان / بررسی‌نشده) بدون تغییر داده خام', () => {
  const catalogRows: ReferenceCatalogRow[] = [
    makeCatalogRow({ rowIndex: 2, tempBookId: 'BK-0001', titleRaw: 'کتاب تکمیل واقعی', reviewStatusRaw: 'بررسی شد' }),
    makeCatalogRow({ rowIndex: 3, tempBookId: 'BK-0002', titleRaw: 'کتاب دارای تیکت باز', reviewStatusRaw: 'بررسی شد' }),
    makeCatalogRow({ rowIndex: 4, tempBookId: 'BK-0003', titleRaw: 'کتاب بررسی‌نشده', reviewStatusRaw: 'بررسی‌نشده' }),
  ];
  const pendingReviews: PendingReviewItem[] = [
    {
      trackingId: 'PV-0558',
      mainSheet: 'فهرست کتاب‌ها',
      mainRecordId: 'BK-0002',
      nameOrPhrase: 'کتاب دارای تیکت باز',
      bookTitle: 'کتاب دارای تیکت باز',
      publisher: 'سوره مهر',
      issueSubject: 'تکرار عنوان',
      suggestedAction: 'تعیین جلد',
      trackingStatus: 'باز',
    },
  ];

  const rawStatusBefore = catalogRows.map((r) => r.reviewStatusRaw);
  const lib = selectLibraryAnalytics({ catalogRows, pendingReviews });
  const part = lib.reviewBreakdown.managerialStatusPartition;

  assert.equal(part.completedWithoutOpenTicketCount, 1);
  assert.equal(part.openBookTicketCount, 1);
  assert.equal(part.unreviewedCount, 1);
  assert.equal(
    part.completedWithoutOpenTicketCount + part.openBookTicketCount + part.unreviewedCount,
    part.totalTrackedBooksCount
  );
  assert.deepEqual(part.openBookTicketIds, ['PV-0558']);
  assert.deepEqual(catalogRows.map((r) => r.reviewStatusRaw), rawStatusBefore);
});

test('10 - شمارش شخص یکتا (جلوگیری از بیش‌شماری تایپوی مختصات مزار) + ثبت هشدار اختلاف بدون حذف مختصات', () => {
  const golzarRecords = [
    {
      id: 'GLZ-1',
      firstName: 'علی',
      lastName: 'صیاد شیرازی',
      fatherName: 'زیاد',
      gravePiece: '29',
      graveRow: '3',
      graveNumber: '8',
      source: 'golzar' as const,
    },
  ];
  const links: BookMartyrLinkRecord[] = [
    makeLink({
      id: 'RL-100',
      tempBookId: 'BK-0010',
      bookTitleRaw: 'کتاب اول',
      martyrNameRaw: 'شهید علی صیاد شیرازی',
      gravePieceRaw: '29',
      graveRowRaw: '3',
      graveNumberRaw: '8',
    }),
    makeLink({
      id: 'RL-101',
      tempBookId: 'BK-0011',
      bookTitleRaw: 'کتاب دوم',
      martyrNameRaw: 'شهید علی صیاد شیرازی',
      gravePieceRaw: '29',
      graveRowRaw: '30',
      graveNumberRaw: '8',
    }),
  ];

  const martyrs = selectMartyrAnalytics({ catalogRows: [], golzarRecords, links });
  assert.equal(martyrs.linkedMartyrsSummary.distinctNormalizedLinkedNamesCount, 1);
  assert.equal(martyrs.linkedMartyrsSummary.confirmedUniqueLinkedMartyrsCount, 1);
  assert.equal(martyrs.linkedMartyrsSummary.ambiguousOrUnverifiedLinkedNamesCount, 0);
  assert.equal(
    martyrs.linkedMartyrsSummary.confirmedUniqueLinkedMartyrsCount +
      martyrs.linkedMartyrsSummary.ambiguousOrUnverifiedLinkedNamesCount,
    martyrs.linkedMartyrsSummary.distinctNormalizedLinkedNamesCount
  );
  assert.equal(martyrs.linkedMartyrsSummary.discrepancyWarnings.length, 1);
  assert.equal(martyrs.linkedMartyrsSummary.discrepancyWarnings[0].kind, 'grave_coordinate_mismatch');
  assert.equal(martyrs.linkedMartyrsSummary.discrepancyWarnings[0].gravesObserved.length, 2);
});

test('11 - تطبیق کنترل‌شده شهدای دستی (MR) با بانک گلزار و پرهیز از ادغام هم‌نام‌ها', () => {
  const golzarRecords = [
    {
      id: 'GLZ-10',
      firstName: 'محسن',
      lastName: 'وزوایی',
      fatherName: 'غلامحسین',
      gravePiece: '26',
      graveRow: '4',
      graveNumber: '15',
      source: 'golzar' as const,
    },
    {
      id: 'GLZ-11',
      firstName: 'محمد',
      lastName: 'حسینی',
      fatherName: 'علی',
      gravePiece: '24',
      graveRow: '10',
      graveNumber: '1',
      source: 'golzar' as const,
    },
    {
      id: 'GLZ-12',
      firstName: 'محمد',
      lastName: 'حسینی',
      fatherName: 'رضا',
      gravePiece: '26',
      graveRow: '5',
      graveNumber: '12',
      source: 'golzar' as const,
    },
  ];

  const customMartyrs: CustomMartyrRecord[] = [
    {
      martyrId: 'MR-000001',
      firstName: 'محسن',
      lastName: 'وزوایی',
      fullName: 'محسن وزوایی',
      alternativeNames: [],
      externalSystemId: '',
      identityVerificationStatus: 'تأییدشده',
      informationSource: 'پژوهش مرکز اسناد',
      description: 'فرمانده گردان',
      gravePiece: '26',
      graveRow: '4',
      graveNumber: '15',
      graveDisplayAddress: 'قطعه ۲۶، ردیف ۴، شماره ۱۵',
      graveSource: 'بانک گلزار',
      graveVerificationStatus: 'تأییدشده میدانی/سند',
      createdAt: '۱۴۰۵/۰۸/۱۰',
    },
    {
      martyrId: 'MR-000002',
      firstName: 'محمد',
      lastName: 'حسینی',
      fullName: 'محمد حسینی',
      alternativeNames: [],
      externalSystemId: '',
      identityVerificationStatus: 'نیازمند بررسی',
      informationSource: 'پژوهش مرکز اسناد',
      description: '',
      gravePiece: '',
      graveRow: '',
      graveNumber: '',
      graveDisplayAddress: '',
      graveSource: '',
      graveVerificationStatus: 'نیازمند تطبیق مزار',
      createdAt: '۱۴۰۵/۰۸/۱۱',
    },
  ];

  const martyrs = selectMartyrAnalytics({ catalogRows: [], golzarRecords, customMartyrs });
  assert.equal(martyrs.customMartyrs.totalCount, 2);
  assert.equal(martyrs.customMartyrs.definiteBankMatchesCount, 1);
  assert.equal(martyrs.customMartyrs.candidateSuggestionsCount, 1);
  const homonymMatch = martyrs.customMartyrs.matches.find((m) => m.customMartyrId === 'MR-000002');
  assert.equal(homonymMatch?.matchCertainty, 'candidate_suggestion');
  assert.equal(homonymMatch?.candidateGolzarMatches.length, 2);
});

test('12 - واکنش زنده شاخص‌ها و برچسب مصوب «دارای مشخصات مزار، اما بررسی‌نشده کارشناسی»', () => {
  assert.equal(
    RELATION_CERTAINTY_DISPLAY_LABELS.probable,
    'دارای مشخصات مزار، اما بررسی‌نشده کارشناسی'
  );

  const catalogRows = [makeCatalogRow({ rowIndex: 2, tempBookId: 'BK-0050', titleRaw: 'کتاب تست زنده' })];
  const golzarRecords = [
    {
      id: 'GLZ-50',
      firstName: 'ابراهیم',
      lastName: 'هادی',
      fatherName: 'نصرالله',
      gravePiece: '26',
      graveRow: '1',
      graveNumber: '1',
      source: 'golzar' as const,
    },
  ];
  const baseLinks: BookMartyrLinkRecord[] = [
    makeLink({
      id: 'RL-500',
      tempBookId: 'BK-0050',
      bookTitleRaw: 'کتاب تست زنده',
      martyrNameRaw: 'شهید ابراهیم هادی',
      gravePieceRaw: '26',
      graveRowRaw: '1',
      graveNumberRaw: '1',
      reviewStatus: 'بررسی‌نشده',
    }),
  ];

  const before = buildExecutiveEntityProjection({ catalogRows, links: baseLinks, golzarRecords });
  assert.equal(before.summary.martyrRelatedKpi.expertConfirmedRelationsCount, 0);
  assert.equal(before.relations[0].certaintyBucket, 'probable');
  assert.equal(before.relations[0].certaintyLabel, 'دارای مشخصات مزار، اما بررسی‌نشده کارشناسی');

  const updatedLinks: BookMartyrLinkRecord[] = [
    { ...baseLinks[0], reviewStatus: 'تأییدشده کارشناسی' },
  ];
  const after = buildExecutiveEntityProjection({ catalogRows, links: updatedLinks, golzarRecords });
  assert.equal(after.summary.martyrRelatedKpi.expertConfirmedRelationsCount, 1);
  assert.equal(after.relations[0].certaintyBucket, 'confirmedByExpert');
});

test('13 - پرونده خلاصه موجودیت‌ها: حفظ شابک/فیپا در داده و JSON ولی عدم نمایش در UI + ساختار ExecutiveDashboardExportV1', () => {
  const catalogRows = [
    makeCatalogRow({
      rowIndex: 2,
      tempBookId: 'BK-0077',
      titleRaw: 'کتاب نمونه',
      isbnRaw: '978-964-00-0000-1',
      fipaRaw: 'ف-۱۲۳۴۵',
      registrationNoRaw: 'REG-77',
    }),
  ];
  const links = [
    makeLink({
      id: 'RL-77',
      tempBookId: 'BK-0077',
      bookTitleRaw: 'کتاب نمونه',
      martyrNameRaw: 'شهید ابراهیم همت',
      gravePieceRaw: '27',
      graveRowRaw: '10',
      graveNumberRaw: '1',
      pageReferenceRaw: '۱۲ تا ۱۸',
      sourceDescriptionRaw: 'خاطره عملیات خیبر',
    }),
  ];

  const projection = buildExecutiveEntityProjection({ catalogRows, links });
  assert.equal(projection.books[0].isbn, '978-964-00-0000-1');
  assert.equal(projection.books[0].fipa, 'ف-۱۲۳۴۵');
  assert.equal(projection.books[0].relations[0].pageReferenceRaw, '۱۲ تا ۱۸');
  assert.equal(projection.books[0].relations[0].tehranStatus, 'tehran');

  const exportPkg = buildExecutiveDashboardExportV1({ catalogRows, links }, { projection });
  assert.equal(exportPkg.schema_id, 'ExecutiveDashboardExportV1');
  assert.equal(exportPkg.schema_version, '1.0.0');
  assert.equal(exportPkg.books[0].isbn, '978-964-00-0000-1');
  assert.equal(exportPkg.books[0].fipa, 'ف-۱۲۳۴۵');

  const modalSource = fs.readFileSync(
    path.join(process.cwd(), 'src/modules/executive-dashboard/components/BookSummaryDossierModal.tsx'),
    'utf8'
  );
  assert.equal(modalSource.includes('book.isbn'), false);
  assert.equal(modalSource.includes('book.fipa'), false);
});

test('14 - سابقه خروجی‌ها: کلید اختصاصی، سقف ۲۰۰ رکورد، فیلتر و حذف ایزوله', () => {
  assert.equal(EXECUTIVE_EXPORT_HISTORY_KEY, 'book_executive_export_history_v1');
  assert.equal(MAX_EXECUTIVE_EXPORT_HISTORY, 200);

  let records: ExecutiveExportHistoryRecord[] = [];
  for (let i = 1; i <= 205; i += 1) {
    records = appendExportHistoryRecordPure(records, {
      exportId: `EXP-${i}`,
      fileName: i % 2 === 0 ? `report-${i}.xlsx` : `report-${i}.json`,
      fileType: i % 2 === 0 ? 'excel' : 'json',
      exportScope: 'dashboard_management',
      timestampIso: `2026-11-13T00:00:${String(i % 60).padStart(2, '0')}Z`,
      timestampDisplay: '۱۴۰۵/۰۸/۲۲',
      recordCount: i,
      appliedFiltersSummary: 'همه',
      status: 'success',
    });
  }
  assert.equal(records.length, 200);
  assert.equal(records[0].exportId, 'EXP-205');

  const onlyExcel = filterExportHistoryRecordsPure(records, { fileType: 'excel' });
  assert.ok(onlyExcel.every((r) => r.fileType === 'excel'));

  const deleted = deleteExportHistoryRecordPure(records, 'EXP-205');
  assert.equal(deleted.length, 199);
  assert.equal(deleted.some((r) => r.exportId === 'EXP-205'), false);
});

test('15 - آداپتور تبدیل بانک سبک‌وزن گلزار بدون تغییر داده مرجع', () => {
  const mapped = mapLightweightGolzarToRawInputs([
    {
      id: 'GLZ-LIGHT-1',
      fullName: 'حسن باقری',
      normalizedFullName: 'حسن باقری',
      compactFullName: 'حسنباقری',
      firstName: 'حسن',
      lastName: 'باقری',
      fatherName: 'فتح‌الله',
      gravePiece: '24',
      graveRow: '8',
      graveNumber: '12',
      martyrdomOperation: 'والفجر',
      source: 'golzar',
    },
  ]);
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].id, 'GLZ-LIGHT-1');
  assert.equal(mapped[0].gravePiece, '24');
  assert.equal(mapped[0].operation, 'والفجر');
});

test('16 - سلکتور نمای سه‌کادره: ایمنی تقسیم بر صفر، جمع ۱۰۰٪ مکمل و واکنش‌پذیری زنده بدون بارگذاری مجدد', () => {
  // حالت خالی: هیچ خطای تقسیم بر صفر (NaN) وجود ندارد
  const emptyOverview = selectThreeCardOverview({ catalogRows: [] }, 0);
  assert.equal(emptyOverview.libraryCard.totalTrackedBooksCount, 0);
  assert.equal(emptyOverview.libraryCard.completedPercent, 0);
  assert.equal(emptyOverview.libraryCard.remainingPercent, 0);
  assert.equal(emptyOverview.martyrsCard.confirmedIdentityPercent, 0);
  assert.equal(emptyOverview.workAndOutputsCard.reviewQueueCompletionPercent, 0);
  assert.deepEqual(emptyOverview.workAndOutputsCard.completedByType, []);

  // داده زنده اولیه (فقط در حافظه موقت تست)
  const catalogRows: ReferenceCatalogRow[] = [
    makeCatalogRow({ rowIndex: 2, tempBookId: 'BK-0001', titleRaw: 'کتاب یک', reviewStatusRaw: 'بررسی شد' }),
    makeCatalogRow({ rowIndex: 3, tempBookId: 'BK-0002', titleRaw: 'کتاب دو', reviewStatusRaw: 'بررسی‌نشده' }),
    makeCatalogRow({ rowIndex: 4, tempBookId: 'BK-0003', titleRaw: 'کتاب سه', reviewStatusRaw: 'بررسی‌نشده' }),
    makeCatalogRow({ rowIndex: 5, tempBookId: 'BK-0004', titleRaw: 'کتاب چهار', reviewStatusRaw: 'بررسی‌نشده' }),
  ];
  const golzarRecords = [
    {
      id: 'G-1',
      firstName: 'محسن',
      lastName: 'وزوایی',
      fatherName: 'غلامحسین',
      gravePiece: '26',
      graveRow: '4',
      graveNumber: '15',
      source: 'golzar' as const,
    },
  ];
  const initialLinks: BookMartyrLinkRecord[] = [
    makeLink({
      id: 'RL-1',
      tempBookId: 'BK-0001',
      bookTitleRaw: 'کتاب یک',
      martyrNameRaw: 'شهید محسن وزوایی',
      gravePieceRaw: '26',
      graveRowRaw: '4',
      graveNumberRaw: '15',
      reviewStatus: 'نیازمند بررسی',
    }),
  ];
  const initialPending: PendingReviewItem[] = [
    {
      trackingId: 'PV-0001',
      mainSheet: 'ارتباط کتاب و شهید',
      mainRecordId: 'RL-1',
      nameOrPhrase: 'شهید محسن وزوایی',
      bookTitle: 'کتاب یک',
      publisher: 'سوره مهر',
      issueSubject: 'تطبیق',
      suggestedAction: 'تأیید',
      trackingStatus: 'باز',
    },
    {
      trackingId: 'PV-0558',
      mainSheet: 'فهرست کتاب‌ها',
      mainRecordId: 'BK-0002',
      nameOrPhrase: 'کتاب دو',
      bookTitle: 'کتاب دو',
      publisher: 'سوره مهر',
      issueSubject: 'تکرار عنوان',
      suggestedAction: 'تعیین جلد',
      trackingStatus: 'باز',
    },
  ];

  const before = selectThreeCardOverview(
    {
      catalogRows,
      golzarRecords,
      links: initialLinks,
      pendingReviews: initialPending,
    },
    1
  );

  assert.equal(before.libraryCard.totalTrackedBooksCount, 4);
  assert.equal(before.libraryCard.completedCount, 0);
  assert.equal(before.libraryCard.inProgressCount, 2);
  assert.equal(before.libraryCard.notStartedCount, 2);
  assert.equal(before.libraryCard.openDuplicateTicketCount, 1);
  assert.equal(before.libraryCard.remainingForReviewCount, 4);
  assert.equal(before.libraryCard.completedPercent + before.libraryCard.remainingPercent, 100);
  assert.equal(before.libraryCard.completedPercent, 0);
  assert.equal(before.martyrsCard.totalLinkedMartyrsCount, 1);
  assert.equal(before.martyrsCard.confirmedIdentityCount, 1);
  assert.equal(before.martyrsCard.expertConfirmedRelationsCount, 0);
  assert.equal(before.martyrsCard.needsReviewRelationsCount, 1);
  assert.equal(before.workAndOutputsCard.reviewQueueCompletedCount, 0);
  assert.equal(before.workAndOutputsCard.reviewQueueRemainingCount, 2);
  assert.deepEqual(before.workAndOutputsCard.completedByType, []);
  assert.equal(before.workAndOutputsCard.exportHistoryCount, 1);

  // تغییر زنده بدون reload: تأیید قفسه + ارتباط شهید، بستن دو تیکت PV، ثبت یک خروجی جدید
  const afterAuditRecords: Record<string, FieldAuditRecord> = {
    'فهرست کتاب‌ها::ROW-2': {
      key: 'فهرست کتاب‌ها::ROW-2',
      source: 'catalog',
      sheet: 'فهرست کتاب‌ها',
      tempBookId: 'BK-0001',
      title: 'کتاب یک',
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
      relatedMartyrs: ['شهید محسن وزوایی'],
      expertApproved: true,
      updatedAt: '2026-11-14T08:00:00Z',
    },
    'فهرست کتاب‌ها::ROW-3': {
      key: 'فهرست کتاب‌ها::ROW-3',
      source: 'catalog',
      sheet: 'فهرست کتاب‌ها',
      tempBookId: 'BK-0002',
      title: 'کتاب دو',
      author: '',
      publisher: 'سوره مهر',
      year: '',
      category: 'R',
      shelf: 'SH-01',
      level: 'T01',
      location: 'SH-01-T01',
      physical: 'verified',
      countedCopies: '1',
      notes: 'ارتباطی یافت نشد',
      relatedMartyrs: [],
      updatedAt: '2026-11-14T08:00:00Z',
    },
  };
  const after = selectThreeCardOverview(
    {
      catalogRows: [
        ...catalogRows.slice(0, 1),
        { ...catalogRows[1], reviewStatusRaw: 'بررسی شد' },
        ...catalogRows.slice(2),
      ],
      auditRecords: afterAuditRecords,
      golzarRecords,
      links: [{ ...initialLinks[0], reviewStatus: 'تأییدشده کارشناسی' }],
      pendingReviews: initialPending.map((p) => ({ ...p, trackingStatus: 'بررسی‌شده' })),
      extractedItems: [
        {
          id: 'EX-TEST-1',
          tempBookId: 'BK-0001',
          bookTitleRaw: 'کتاب یک',
          publisherRaw: 'سوره مهر',
          martyrNameRaw: 'شهید محسن وزوایی',
          gravePieceRaw: '26',
          pageReferenceRaw: '10',
          contentType: 'خاطره',
          passageTitle: 'نبرد پل کرخه',
          extractedText: 'متن پژوهش',
          researcherNote: '',
          reviewStatus: 'تأییدشده کارشناسی',
          recordedBy: 'پژوهشگر',
          reviewedBy: 'کارشناس',
          sourceFile: 'تست',
          sourceSheet: 'تست',
          sourceRow: '2',
          updatedAt: '۱۴۰۵/۰۸/۲۰',
        },
      ],
    },
    2
  );

  assert.equal(after.libraryCard.completedCount, 2);
  assert.equal(after.libraryCard.openDuplicateTicketCount, 0);
  assert.equal(after.libraryCard.completedPercent, 50);
  assert.equal(after.libraryCard.remainingPercent, 50);
  assert.equal(after.martyrsCard.expertConfirmedRelationsCount, 1);
  assert.equal(after.martyrsCard.needsReviewRelationsCount, 0);
  assert.equal(after.workAndOutputsCard.reviewQueueCompletedCount, 2);
  assert.equal(after.workAndOutputsCard.reviewQueueCompletionPercent, 100);
  assert.equal(after.workAndOutputsCard.reviewQueueRemainingPercent, 0);
  assert.equal(after.workAndOutputsCard.completedByType.length, 2);
  assert.equal(after.workAndOutputsCard.activeExtractedOutputsCount, 1);
  assert.equal(after.workAndOutputsCard.exportHistoryCount, 2);
});

test('17 - پاک‌سازی کامل صفحه سه‌کادره: نبود اقلام فنی یا اعداد فرضی نمونه و وجود وضعیت «اطلاعات موجود نیست»', () => {
  const overviewSource = fs.readFileSync(
    path.join(process.cwd(), 'src/modules/executive-dashboard/components/ExecutiveOverviewCards.tsx'),
    'utf8'
  );
  const dashboardSource = fs.readFileSync(
    path.join(process.cwd(), 'src/modules/executive-dashboard/components/ExecutiveDashboardView.tsx'),
    'utf8'
  );

  const bannedTokens = [
    '۲۸٬۳۶۸',
    '28368',
    '23751',
    '3506',
    '1111',
    'اموات',
    'گمنام',
    '836',
    '۸۳۶',
    'PV-0',
    'بازگشت به خانه',
    'اکسل مدیریتی (۵ شیت)',
    'خروجی JSON مدیریتی',
    // اعداد نمونه فرضی در صورت‌جلسه‌ها (نباید به‌عنوان عدد ثابت در UI باشند)
    '993',
    '۹۹۳',
    '445',
    '۴۴۵',
    '548',
    '۵۴۸',
    '420',
    '۴۲۰',
    '355',
    '۳۵۵',
    '567',
    '۵۶۷',
    '561',
    '۵۶۱',
    '309',
    '۳۰۹',
  ];
  for (const token of bannedTokens) {
    assert.equal(overviewSource.includes(token), false, `Forbidden token found in overview: ${token}`);
  }

  assert.equal(overviewSource.includes('data-testid="open-detailed-reports-btn"'), true);
  assert.equal(overviewSource.includes('آمار و گزارش‌های تفصیلی'), true);
  assert.equal(overviewSource.includes('اطلاعات موجود نیست'), true);
  assert.equal(overviewSource.includes('تفکیک کارهای انجام‌شده'), true);

  // قطع کامل صفحه واسط قدیمی از ExecutiveDashboardView
  assert.equal(dashboardSource.includes('ExecutiveDetailedReportsView'), false);
  assert.equal(dashboardSource.includes('BookSummaryDossierModal'), false);
  assert.equal(dashboardSource.includes('MartyrSummaryDossierModal'), false);
  assert.equal(dashboardSource.includes("subView: 'overview'"), true);
});

test('18 - مسیر مستقل آمار و گزارش‌ها، حذف دکمه دایره‌ای تیره ناوبری و یکپارچگی کلید سه‌کادره روشن', () => {
  const indexSource = fs.readFileSync(
    path.join(process.cwd(), 'src/modules/executive-dashboard/index.ts'),
    'utf8'
  );
  const statsRouteSource = fs.readFileSync(
    path.join(process.cwd(), 'src/modules/executive-dashboard/components/StatisticsAndReportsRouteView.tsx'),
    'utf8'
  );
  const appSource = fs.readFileSync(
    path.join(process.cwd(), 'src/App.tsx'),
    'utf8'
  );

  // عدم اکسپورت فعال نمای قدیمی فاز ۲ از ماژول
  assert.equal(indexSource.includes('ExecutiveDetailedReportsView'), false);
  assert.equal(indexSource.includes('StatisticsAndReportsRouteView'), true);

  // پوسته سه‌بخشی مسیر آمار و گزارش‌ها بدون کارت چهارم «ارتباطات» یا اعداد جعلی
  assert.equal(statsRouteSource.includes('data-testid="executive-statistics-route-view"'), true);
  assert.equal(statsRouteSource.includes('data-testid="back-to-dashboard-btn"'), true);
  assert.equal(statsRouteSource.includes('بازگشت به داشبورد'), true);
  assert.equal(statsRouteSource.includes('data-testid="statistics-shared-tools"'), true);
  assert.equal(statsRouteSource.includes('data-testid="statistics-unified-search"'), true);
  assert.equal(statsRouteSource.includes('data-testid="statistics-statistical-queries"'), true);
  assert.equal(statsRouteSource.includes('data-testid="statistics-section-library"'), true);
  assert.equal(statsRouteSource.includes('data-testid="statistics-section-martyrs"'), true);
  assert.equal(statsRouteSource.includes('data-testid="statistics-section-work"'), true);
  assert.equal(statsRouteSource.includes('statistics-section-relations'), false);
  assert.equal(statsRouteSource.includes('ExecutiveDetailedReportsView'), false);
  assert.equal(statsRouteSource.includes('خروجی JSON مدیریتی'), false);

  // مسیریابی مستقل و طراحی دایره بزرگ‌تر بیرون‌زده طلایی/قهوه‌ای روشن با آیکون کتابخانه در نوار پایین
  assert.equal(appSource.includes("'executive_statistics'"), true);
  assert.equal(appSource.includes('<StatisticsAndReportsRouteView'), true);
  assert.equal(appSource.includes('ExecutiveDashboardNavIcon'), true);
  assert.equal(appSource.includes('<Library'), true);
  assert.equal(appSource.includes('dashboard_nav_emblem'), false);
  assert.equal(appSource.includes('w-[58px] h-[58px]'), true);
  assert.equal(appSource.includes('-mt-7'), true);
  assert.equal(appSource.includes('#D4A63B'), true);
  assert.equal(appSource.includes('#EAD2B5'), true);
  assert.equal(appSource.includes('grid-cols-6'), true);
});

test('19 - مسیرهای تعاملی ۱۱گانه داشبورد، تطابق ۱ به ۱ با اعداد کارت‌ها، تفکیک مفاهیم و بازکردن پرونده واقعی', () => {
  const catalogRows: ReferenceCatalogRow[] = [
    makeCatalogRow({ rowIndex: 2, tempBookId: 'BK-0001', titleRaw: 'کتاب یکم', reviewStatusRaw: 'بررسی شد' }),
    makeCatalogRow({ rowIndex: 3, tempBookId: 'BK-0002', titleRaw: 'کتاب دوم', reviewStatusRaw: 'بررسی‌نشده' }),
    makeCatalogRow({ rowIndex: 4, tempBookId: 'BK-0003', titleRaw: 'کتاب سوم', reviewStatusRaw: 'بررسی‌نشده' }),
  ];
  const golzarRecords = [
    {
      id: 'GLZ-101',
      firstName: 'محسن',
      lastName: 'وزوایی',
      fatherName: 'غلامحسین',
      gravePiece: '26',
      graveRow: '4',
      graveNumber: '15',
      source: 'golzar' as const,
    },
    {
      id: 'GLZ-102',
      firstName: 'محمد',
      lastName: 'حسینی',
      fatherName: 'علی',
      gravePiece: '24',
      graveRow: '10',
      graveNumber: '1',
      source: 'golzar' as const,
    },
    {
      id: 'GLZ-103',
      firstName: 'محمد',
      lastName: 'حسینی',
      fatherName: 'رضا',
      gravePiece: '26',
      graveRow: '5',
      graveNumber: '12',
      source: 'golzar' as const,
    },
  ];
  const links: BookMartyrLinkRecord[] = [
    // ارتباط ۱: شهید احرازشده، اما رابطه هنوز در انتظار بررسی است
    makeLink({
      id: 'RL-101',
      tempBookId: 'BK-0001',
      bookTitleRaw: 'کتاب یکم',
      martyrNameRaw: 'شهید محسن وزوایی',
      gravePieceRaw: '26',
      graveRowRaw: '4',
      graveNumberRaw: '15',
      reviewStatus: 'نیازمند بررسی',
    }),
    // ارتباط ۲: شهید هم‌نام نیازمند احراز، با تأیید صریح کارشناسی رابطه
    makeLink({
      id: 'RL-102',
      tempBookId: 'BK-0002',
      bookTitleRaw: 'کتاب دوم',
      martyrNameRaw: 'شهید محمد حسینی',
      reviewStatus: 'تأییدشده کارشناسی',
    }),
  ];
  const pendingReviews: PendingReviewItem[] = [
    {
      trackingId: 'PV-0558',
      mainSheet: 'فهرست کتاب‌ها',
      mainRecordId: 'BK-0002',
      nameOrPhrase: 'کتاب دوم',
      bookTitle: 'کتاب دوم',
      publisher: 'سوره مهر',
      issueSubject: 'تکرار عنوان',
      suggestedAction: 'تعیین جلد',
      trackingStatus: 'باز',
    },
    {
      trackingId: 'PV-0559',
      mainSheet: 'ارتباط کتاب و شهید',
      mainRecordId: 'RL-101',
      nameOrPhrase: 'شهید محسن وزوایی',
      bookTitle: 'کتاب یکم',
      publisher: 'سوره مهر',
      issueSubject: 'تأیید نهایی رابطه',
      suggestedAction: 'بررسی صفحه',
      trackingStatus: 'بررسی‌شده',
    },
  ];
  const auditLogs = [
    {
      id: 'LOG-1',
      timestamp: '۱۴۰۵/۰۸/۲۰ - ۱۰:۳۰',
      actorName: 'کارشناس کتابخانه',
      actorRole: 'reviewer' as const,
      actionType: 'تغییر وضعیت پیگیری' as const,
      targetId: 'PV-0559',
      summary: 'بررسی مورد PV-0559 تکمیل شد',
    },
  ];
  const extractedItems = [
    {
      id: 'EX-0001',
      tempBookId: 'BK-0001',
      bookTitleRaw: 'کتاب یکم',
      publisherRaw: 'سوره مهر',
      martyrNameRaw: 'شهید محسن وزوایی',
      gravePieceRaw: '26',
      pageReferenceRaw: '۱۴',
      contentType: 'خاطره' as const,
      passageTitle: 'عملیات بیت‌المقدس',
      extractedText: 'متن خاطره ثبت‌شده',
      researcherNote: '',
      reviewStatus: 'تأییدشده کارشناسی' as const,
      recordedBy: 'پژوهشگر',
      reviewedBy: 'کارشناس',
      sourceFile: 'فایل مرجع',
      sourceSheet: 'Sheet2',
      sourceRow: '2',
      updatedAt: '۱۴۰۵/۰۸/۲۰',
    },
  ];
  const exportHistory: ExecutiveExportHistoryRecord[] = [
    {
      exportId: 'EXP-1',
      fileName: 'management_report.xlsx',
      fileType: 'excel',
      exportScope: 'dashboard_management',
      timestampIso: '2026-11-13T10:00:00Z',
      timestampDisplay: '۱۴۰۵/۰۸/۲۲',
      recordCount: 3,
      appliedFiltersSummary: 'همه',
      status: 'success',
    },
  ];

  const inputs = {
    catalogRows,
    golzarRecords,
    links,
    pendingReviews,
    auditLogs,
    extractedItems,
  };
  const projection = buildExecutiveEntityProjection(inputs);
  const overview = selectThreeCardOverviewFromSummary(projection.summary, exportHistory.length);

  // انطباق کامل ۱ به ۱ بین ارقام سه‌کادره و فهرست ۱۱گانه
  assert.equal(
    selectDrilldownData('library_all', inputs, projection, exportHistory).items.length,
    overview.libraryCard.totalTrackedBooksCount
  );
  assert.equal(
    selectDrilldownData('library_completed', inputs, projection, exportHistory).items.length,
    overview.libraryCard.completedCount
  );
  assert.equal(
    selectDrilldownData('library_remaining', inputs, projection, exportHistory).items.length,
    overview.libraryCard.remainingForReviewCount
  );
  assert.equal(
    selectDrilldownData('martyrs_confirmed', inputs, projection, exportHistory).items.length,
    overview.martyrsCard.confirmedIdentityCount
  );
  assert.equal(
    selectDrilldownData('martyrs_needs_verification', inputs, projection, exportHistory).items.length,
    overview.martyrsCard.needsVerificationCount
  );
  assert.equal(
    selectDrilldownData('relations_confirmed', inputs, projection, exportHistory).items.length,
    overview.martyrsCard.expertConfirmedRelationsCount
  );
  assert.equal(
    selectDrilldownData('relations_needs_review', inputs, projection, exportHistory).items.length,
    overview.martyrsCard.needsReviewRelationsCount
  );
  assert.equal(
    selectDrilldownData('work_completed', inputs, projection, exportHistory).items.length,
    overview.workAndOutputsCard.reviewQueueCompletedCount
  );
  assert.equal(
    selectDrilldownData('work_remaining', inputs, projection, exportHistory).items.length,
    overview.workAndOutputsCard.reviewQueueRemainingCount
  );
  assert.equal(
    selectDrilldownData('research_outputs', inputs, projection, exportHistory).items.length,
    overview.workAndOutputsCard.activeExtractedOutputsCount
  );
  assert.equal(
    selectDrilldownData('management_reports', inputs, projection, exportHistory).items.length,
    overview.workAndOutputsCard.exportHistoryCount
  );

  // عدم خلط هویت شهید با تأیید کارشناسی ارتباط: محسن وزوایی در martyrs_confirmed است ولی رابطه‌اش در relations_needs_review
  const martyrsConf = selectDrilldownData('martyrs_confirmed', inputs, projection, exportHistory);
  assert.equal(martyrsConf.kind, 'martyrs');
  assert.equal(martyrsConf.items[0].fullName, 'محسن وزوایی');
  const relNeedsRev = selectDrilldownData('relations_needs_review', inputs, projection, exportHistory);
  assert.equal(relNeedsRev.kind, 'relations');
  assert.equal(relNeedsRev.items[0].relation.linkId, 'RL-101');
  assert.equal(relNeedsRev.items[0].bookItem?.tempBookId, 'BK-0001');
  assert.equal(relNeedsRev.items[0].martyrItem?.golzarId, 'GLZ-101');

  // تطبیق auditLog + پرونده کتاب و شهید برای صف کار و خروجی پژوهشی
  const workDone = selectDrilldownData('work_completed', inputs, projection, exportHistory);
  assert.equal(workDone.kind, 'work');
  assert.equal(workDone.items.length, 1);
  assert.equal(workDone.items[0].relatedAuditLog?.id, 'LOG-1');
  assert.equal(workDone.items[0].bookItem?.tempBookId, 'BK-0001');
  assert.equal(workDone.items[0].martyrItem?.golzarId, 'GLZ-101');

  const research = selectDrilldownData('research_outputs', inputs, projection, exportHistory);
  assert.equal(research.kind, 'research_outputs');
  assert.equal(research.items.length, 1);
  assert.equal(research.items[0].bookItem?.tempBookId, 'BK-0001');
  assert.equal(research.items[0].martyrItem?.golzarId, 'GLZ-101');

  // حالت خالی صادقانه بدون جعل داده
  const emptyInputs = { catalogRows: [], links: [], pendingReviews: [], extractedItems: [] };
  const emptyProj = buildExecutiveEntityProjection(emptyInputs);
  for (const k of Object.keys(DRILLDOWN_META_MAP) as DashboardDrilldownKey[]) {
    const res = selectDrilldownData(k, emptyInputs, emptyProj, []);
    assert.equal(res.items.length, 0);
    assert.ok(res.emptyReason.trim().length > 0, `Empty reason missing for ${k}`);
  }

  // بررسی پیاده‌سازی دقیق محرک‌ها در UI، نبود نمای قدیمی و وجود مسیر بازگشت با حفظ فیلتر/اسکرول
  const overviewSource = fs.readFileSync(
    path.join(process.cwd(), 'src/modules/executive-dashboard/components/ExecutiveOverviewCards.tsx'),
    'utf8'
  );
  const drilldownViewSource = fs.readFileSync(
    path.join(process.cwd(), 'src/modules/executive-dashboard/components/DashboardDrilldownListView.tsx'),
    'utf8'
  );
  const dashboardSource = fs.readFileSync(
    path.join(process.cwd(), 'src/modules/executive-dashboard/components/ExecutiveDashboardView.tsx'),
    'utf8'
  );
  const appSource = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');

  const expectedTriggers: DashboardDrilldownKey[] = [
    'library_all',
    'library_completed',
    'library_remaining',
    'martyrs_confirmed',
    'martyrs_needs_verification',
    'relations_confirmed',
    'relations_needs_review',
    'work_completed',
    'work_remaining',
    'research_outputs',
    'management_reports',
  ];
  for (const k of expectedTriggers) {
    assert.equal(
      overviewSource.includes(`drilldown-trigger-${k}`),
      true,
      `Missing trigger in ExecutiveOverviewCards for ${k}`
    );
  }
  assert.equal(drilldownViewSource.includes('اطلاعات جزئیات در دسترس نیست'), true);
  assert.equal(dashboardSource.includes('DashboardDrilldownListView'), true);
  assert.equal(dashboardSource.includes('ExecutiveDetailedReportsView'), false);
  assert.equal(appSource.includes('onOpenOriginalBookRecord'), true);
  assert.equal(appSource.includes('onOpenOriginalMartyrRecord'), true);
  assert.equal(appSource.includes("returnTarget: 'executive_dashboard'"), true);
});

test('20 - آشتی وضعیت‌های صف پیگیری: تفکیک «نیازمند منبع» از «تکمیل‌شده» و پذیرش وضعیت‌های انجام‌شده', () => {
  assert.equal(classifyPendingReviewStatus('باز'), 'open');
  assert.equal(classifyPendingReviewStatus('نیازمند منبع'), 'needs_source');
  assert.equal(classifyPendingReviewStatus('بررسی‌شده'), 'resolved');
  assert.equal(classifyPendingReviewStatus('تأییدشده کارشناسی'), 'resolved');
  assert.equal(classifyPendingReviewStatus('تکمیل‌شده'), 'resolved');
  assert.equal(classifyPendingReviewStatus('انجام‌شده'), 'resolved');
  assert.equal(classifyPendingReviewStatus('حل‌شده'), 'resolved');

  // جلوگیری از بازنویسی وضعیت پیشرفته‌تر با «نیازمند منبع» هنگام همگام‌سازی
  assert.equal(pickHigherPriorityPendingStatus('بررسی‌شده', 'نیازمند منبع'), 'بررسی‌شده');
  assert.equal(pickHigherPriorityPendingStatus('باز', 'نیازمند منبع'), 'نیازمند منبع');
  assert.equal(pickHigherPriorityPendingStatus('نیازمند منبع', 'تکمیل‌شده'), 'تکمیل‌شده');

  const pendingReviews: PendingReviewItem[] = [
    {
      trackingId: 'PV-1',
      mainSheet: 'فهرست کتاب‌ها',
      mainRecordId: 'BK-0001',
      nameOrPhrase: 'کتاب ۱',
      bookTitle: 'کتاب ۱',
      publisher: 'سوره مهر',
      issueSubject: 'تکرار عنوان',
      suggestedAction: 'تعیین جلد',
      trackingStatus: 'نیازمند منبع',
    },
    {
      trackingId: 'PV-2',
      mainSheet: 'ارتباط کتاب و شهید',
      mainRecordId: 'RL-0001',
      nameOrPhrase: 'شهید ۱',
      bookTitle: 'کتاب ۱',
      publisher: 'سوره مهر',
      issueSubject: 'تطبیق نام',
      suggestedAction: 'بررسی',
      trackingStatus: 'تکمیل‌شده',
    },
    {
      trackingId: 'PV-3',
      mainSheet: 'ارتباط کتاب و شهید',
      mainRecordId: 'RL-0002',
      nameOrPhrase: 'شهید ۲',
      bookTitle: 'کتاب ۲',
      publisher: 'سوره مهر',
      issueSubject: 'تأیید رابطه',
      suggestedAction: 'بررسی',
      trackingStatus: 'تأییدشده کارشناسی',
    },
  ];

  const rq = selectReviewQueue({ catalogRows: [], pendingReviews });
  assert.equal(rq.pendingReviews.totalCount, 3);
  assert.equal(rq.pendingReviews.resolvedCount, 2);
  assert.equal(rq.pendingReviews.openCount, 1);
  assert.equal(rq.pendingReviews.needsSourceCount, 1);
  assert.equal(rq.pendingReviews.openPlainCount, 0);
});

test('21 - تفکیک موضوعات چندبخشی (جداشده با «؛») بین کتابخانه، شهدا و ارتباطات + استقلال تاریخچه فعالیت', () => {
  const pendingReviews: PendingReviewItem[] = [
    {
      trackingId: 'PV-MULTI-1',
      mainSheet: 'ارتباط کتاب و شهید',
      mainRecordId: 'RL-0100',
      nameOrPhrase: 'شهید الف',
      bookTitle: 'کتاب مشترک',
      publisher: 'سوره مهر',
      issueSubject: 'نیازمند تأیید ارتباط کتاب و شهید؛ تشابه نام شهید با گلزار؛ تکرار عنوان کتاب',
      suggestedAction: 'بررسی سه‌گانه',
      trackingStatus: 'باز',
    },
  ];

  const auditLogs = [
    {
      id: 'LOG-10',
      timestamp: '۱۴۰۵/۰۸/۲۵ - ۱۱:۰۰',
      actorName: 'کتابدار',
      actorRole: 'reviewer' as const,
      actionType: 'ثبت موجودی فیزیکی' as const,
      targetId: 'BK-0010',
      summary: 'ثبت مکان قفسه جدید',
    },
    {
      id: 'LOG-11',
      timestamp: '۱۴۰۵/۰۸/۲۵ - ۱۱:۱۰',
      actorName: 'پژوهشگر',
      actorRole: 'reviewer' as const,
      actionType: 'ثبت مطلب استخراج‌شده' as const,
      targetId: 'RL-0100',
      summary: 'یادداشت پژوهشی ثبت شد بدون بستن تیکت PV',
    },
  ];

  const rq = selectReviewQueue({ catalogRows: [], pendingReviews, auditLogs });
  assert.equal(rq.pendingReviews.totalCount, 1);
  assert.equal(rq.pendingReviews.resolvedCount, 0);
  assert.equal(rq.independentWorkTopics.compoundRecordsCount, 1);
  assert.equal(rq.independentWorkTopics.totalTopicsCount, 3);
  assert.equal(rq.independentWorkTopics.domainBreakdown.relations.pvTopicsRemaining, 1);
  assert.equal(rq.independentWorkTopics.domainBreakdown.martyrs.pvTopicsRemaining, 1);
  assert.equal(rq.independentWorkTopics.domainBreakdown.library.pvTopicsRemaining, 1);

  const act = selectActivityLogSummary(auditLogs);
  assert.equal(act.totalEntriesCount, 2);
  assert.equal(act.byActionType.length, 2);
});

test('22 - تمایز مطالب استخراج‌شده، خروجی‌های پژوهشی نهایی مستقل، گزارش‌های مدیریتی مستقل و جستجوی یکپارچه', () => {
  const extractedItems = [
    {
      id: 'EX-1',
      tempBookId: 'BK-0001',
      bookTitleRaw: 'کتاب الف',
      publisherRaw: 'سوره مهر',
      martyrNameRaw: 'شهید ابراهیم همت',
      gravePieceRaw: '27',
      pageReferenceRaw: '12',
      contentType: 'خاطره' as const,
      passageTitle: 'فتح خیبر - نسخه ۱',
      extractedText: 'متن نسخه اول',
      researcherNote: '',
      reviewStatus: 'تأییدشده کارشناسی' as const,
      recordedBy: 'پژوهشگر',
      reviewedBy: 'کارشناس',
      sourceFile: 'فایل',
      sourceSheet: 'Sheet2',
      sourceRow: '2',
      updatedAt: '۱۴۰۵/۰۸/۲۱',
    },
    {
      id: 'EX-2',
      tempBookId: 'BK-0001',
      bookTitleRaw: 'کتاب الف',
      publisherRaw: 'سوره مهر',
      martyrNameRaw: 'شهید ابراهیم همت',
      gravePieceRaw: '27',
      pageReferenceRaw: '12',
      contentType: 'خاطره' as const,
      passageTitle: 'فتح خیبر v2',
      extractedText: 'متن نسخه ویرایش‌شده دوم',
      researcherNote: '',
      reviewStatus: 'تأییدشده کارشناسی' as const,
      recordedBy: 'پژوهشگر',
      reviewedBy: 'کارشناس',
      sourceFile: 'فایل',
      sourceSheet: 'Sheet2',
      sourceRow: '2',
      updatedAt: '۱۴۰۵/۰۸/۲۲',
    },
    {
      id: 'EX-3',
      tempBookId: 'BK-0001',
      bookTitleRaw: 'کتاب الف',
      publisherRaw: 'سوره مهر',
      martyrNameRaw: 'شهید ابراهیم همت',
      gravePieceRaw: '27',
      pageReferenceRaw: '15',
      contentType: 'زندگی‌نامه' as const,
      passageTitle: 'پیش‌نویس زندگینامه',
      extractedText: 'متن آزمایشی پیش‌نویس',
      researcherNote: '',
      reviewStatus: 'تأییدشده کارشناسی' as const,
      recordedBy: 'پژوهشگر',
      reviewedBy: 'کارشناس',
      sourceFile: 'فایل',
      sourceSheet: 'Sheet2',
      sourceRow: '3',
      updatedAt: '۱۴۰۵/۰۸/۲۲',
    },
    {
      id: 'EX-4',
      tempBookId: 'BK-0002',
      bookTitleRaw: 'کتاب ب',
      publisherRaw: 'سوره مهر',
      martyrNameRaw: 'شهید باکری',
      gravePieceRaw: '',
      pageReferenceRaw: '20',
      contentType: 'تحلیل و پژوهش' as const,
      passageTitle: 'یادداشت اولیه',
      extractedText: 'متن نیاز به بررسی',
      researcherNote: '',
      reviewStatus: 'بررسی‌شده در پژوهش اصلی' as const,
      recordedBy: 'پژوهشگر',
      reviewedBy: '',
      sourceFile: 'فایل',
      sourceSheet: 'Sheet2',
      sourceRow: '4',
      updatedAt: '۱۴۰۵/۰۸/۲۲',
    },
  ];

  const researchSummary = selectFinalizedResearchOutputsSummary(extractedItems);
  assert.equal(researchSummary.totalExtractedNonRejectedCount, 4);
  assert.equal(researchSummary.rawFinalizedRecordsCount, 2); // EX-3 پیش‌نویس کنار گذاشته شد
  assert.equal(researchSummary.finalIndependentOutputsCount, 1); // EX-1 و EX-2 یک خروجی مستقل
  assert.equal(researchSummary.duplicateVersionsCollapsedCount, 1);

  const exportHistory: ExecutiveExportHistoryRecord[] = [
    {
      exportId: 'E-1',
      fileName: 'executive-dashboard-1405-08-20-v1.xlsx',
      fileType: 'excel',
      exportScope: 'dashboard_management',
      timestampIso: '2026-11-11T08:00:00Z',
      timestampDisplay: '۱۴۰۵/۰۸/۲۰',
      recordCount: 980,
      appliedFiltersSummary: 'همه',
      status: 'success',
    },
    {
      exportId: 'E-2',
      fileName: 'executive-dashboard-1405-08-21-v2.xlsx',
      fileType: 'excel',
      exportScope: 'dashboard_management',
      timestampIso: '2026-11-12T08:00:00Z',
      timestampDisplay: '۱۴۰۵/۰۸/۲۱',
      recordCount: 980,
      appliedFiltersSummary: 'همه',
      status: 'success',
    },
    {
      exportId: 'E-3',
      fileName: 'executive-dashboard-draft.xlsx',
      fileType: 'excel',
      exportScope: 'dashboard_management',
      timestampIso: '2026-11-12T09:00:00Z',
      timestampDisplay: '۱۴۰۵/۰۸/۲۱',
      recordCount: 980,
      appliedFiltersSummary: 'پیش‌نویس',
      status: 'success',
    },
    {
      exportId: 'E-4',
      fileName: 'executive-dashboard-failed.json',
      fileType: 'json',
      exportScope: 'dashboard_management',
      timestampIso: '2026-11-12T10:00:00Z',
      timestampDisplay: '۱۴۰۵/۰۸/۲۱',
      recordCount: 0,
      appliedFiltersSummary: 'همه',
      status: 'failed',
      errorMessage: 'خطا',
    },
  ];

  const repSummary = selectFinalizedManagementReportsSummary(exportHistory);
  assert.equal(repSummary.rawSuccessfulIssuancesCount, 2); // E-3 پیش‌نویس و E-4 ناموفق حذف شدند
  assert.equal(repSummary.finalIndependentReportsCount, 1); // E-1 و E-2 یک گزارش اکسل مستقل
  assert.equal(repSummary.duplicateVersionsCollapsedCount, 1);
  assert.equal(repSummary.draftOrFailedExcludedCount, 2);

  const inputs = {
    catalogRows: [makeCatalogRow({ rowIndex: 2, tempBookId: 'BK-0001', titleRaw: 'کتاب الف' })],
    extractedItems,
    pendingReviews: [],
    auditLogs: [],
  };
  const proj = buildExecutiveEntityProjection(inputs);
  const workDetailed = selectWorkAndOutputsDetailedAnalytics(inputs, proj.summary, exportHistory);
  const queries = buildStatisticalQueryAnswers(proj.summary, workDetailed);
  assert.equal(queries.length, 7);
  assert.ok(queries.some((q) => q.targetSection === 'work'));

  const searchRes = computeUnifiedStatisticsSearch('کتاب الف', inputs, proj, exportHistory);
  assert.equal(searchRes.booksMatchesCount, 1);
  assert.equal(searchRes.researchMatchesCount, 3);
  assert.ok(searchRes.totalMatchesCount >= 4);
});

test('23 - قانون سخت‌گیرانه تکمیل کتاب (Donut 1) و تمایز «فاقد ارتباط ثبت‌شده» از «بررسی‌شده و فاقد ارتباط با شهید»', () => {
  const catalogRows: ReferenceCatalogRow[] = [
    makeCatalogRow({ rowIndex: 2, tempBookId: 'BK-A', titleRaw: 'کتاب کارشده بدون تکمیل', reviewStatusRaw: 'بررسی شد' }),
    makeCatalogRow({ rowIndex: 3, tempBookId: 'BK-B', titleRaw: 'کتاب تکمیل واقعی با شهید', reviewStatusRaw: 'بررسی شد' }),
    makeCatalogRow({ rowIndex: 4, tempBookId: 'BK-C', titleRaw: 'کتاب بررسی‌شده بدون شهید', reviewStatusRaw: 'بررسی شد' }),
    makeCatalogRow({ rowIndex: 5, tempBookId: 'BK-D', titleRaw: 'کتاب شروع‌نشده', reviewStatusRaw: 'بررسی‌نشده' }),
  ];

  const auditRecords: Record<string, FieldAuditRecord> = {
    // BK-A قفسه تأییدشده دارد اما رابطه‌اش تأیید کارشناسی نیست و کارشده محسوب می‌شود، نه تکمیل‌شده
    'فهرست کتاب‌ها::ROW-2': {
      key: 'فهرست کتاب‌ها::ROW-2',
      source: 'catalog',
      sheet: 'فهرست کتاب‌ها',
      tempBookId: 'BK-A',
      title: 'کتاب کارشده بدون تکمیل',
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
      relatedMartyrs: ['شهید الف'],
      updatedAt: '2026-11-14T08:00:00Z',
    },
    // BK-B قفسه تأییدشده + رابطه تأییدشده کارشناسی دارد => تکمیل واقعی
    'فهرست کتاب‌ها::ROW-3': {
      key: 'فهرست کتاب‌ها::ROW-3',
      source: 'catalog',
      sheet: 'فهرست کتاب‌ها',
      tempBookId: 'BK-B',
      title: 'کتاب تکمیل واقعی با شهید',
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
      relatedMartyrs: ['شهید ب'],
      expertApproved: true,
      updatedAt: '2026-11-14T08:00:00Z',
    },
    // BK-C قفسه تأییدشده + یادداشت صریح نبود ارتباط با شهید => بررسی‌شده و فاقد ارتباط با شهید + تکمیل واقعی
    'فهرست کتاب‌ها::ROW-4': {
      key: 'فهرست کتاب‌ها::ROW-4',
      source: 'catalog',
      sheet: 'فهرست کتاب‌ها',
      tempBookId: 'BK-C',
      title: 'کتاب بررسی‌شده بدون شهید',
      author: '',
      publisher: 'سوره مهر',
      year: '',
      category: 'R',
      shelf: 'SH-01',
      level: 'T01',
      location: 'SH-01-T01',
      physical: 'verified',
      countedCopies: '1',
      notes: 'ارتباطی یافت نشد',
      relatedMartyrs: [],
      updatedAt: '2026-11-14T08:00:00Z',
    },
  };

  const links: BookMartyrLinkRecord[] = [
    makeLink({
      id: 'RL-A',
      tempBookId: 'BK-A',
      bookTitleRaw: 'کتاب کارشده بدون تکمیل',
      martyrNameRaw: 'شهید الف',
      gravePieceRaw: '26',
      graveRowRaw: '1',
      graveNumberRaw: '1',
      reviewStatus: 'نیازمند بررسی',
    }),
    makeLink({
      id: 'RL-B',
      tempBookId: 'BK-B',
      bookTitleRaw: 'کتاب تکمیل واقعی با شهید',
      martyrNameRaw: 'شهید ب',
      gravePieceRaw: '26',
      graveRowRaw: '2',
      graveNumberRaw: '2',
      reviewStatus: 'تأییدشده کارشناسی',
    }),
  ];

  const lib = selectLibraryAnalytics({ catalogRows, auditRecords, links });
  const det = lib.detailedBreakdown;
  assert.equal(det.totalTrackedBooksCount, 4);
  assert.equal(det.completedCount, 2); // BK-B and BK-C
  assert.equal(det.inProgressCount, 1); // BK-A
  assert.equal(det.notStartedCount, 1); // BK-D
  assert.equal(det.workedOrRegisteredCount, 3); // BK-A, BK-B, BK-C
  assert.equal(det.unworkedCount, 1); // BK-D
  assert.equal(det.hasRegisteredMartyrLinkCount, 2); // BK-A, BK-B
  assert.equal(det.lacksRegisteredMartyrLinkCount, 2); // BK-C, BK-D
  assert.equal(det.reviewedWithoutMartyrLinkCount, 1); // فقط BK-C (نه BK-D شروع‌نشده!)

  // تطابق ۱ به ۱ دریل‌داون‌های ۱۲گانه کتابخانه
  const inputs = { catalogRows, auditRecords, links };
  const proj = buildExecutiveEntityProjection(inputs);
  assert.equal(selectDrilldownData('library_completed', inputs, proj).items.length, 2);
  assert.equal(selectDrilldownData('library_in_progress', inputs, proj).items.length, 1);
  assert.equal(selectDrilldownData('library_not_started', inputs, proj).items.length, 1);
  assert.equal(selectDrilldownData('library_worked', inputs, proj).items.length, 3);
  assert.equal(selectDrilldownData('library_unworked', inputs, proj).items.length, 1);
  assert.equal(selectDrilldownData('library_without_martyr_link', inputs, proj).items.length, 2);
  assert.equal(selectDrilldownData('library_reviewed_no_martyr', inputs, proj).items.length, 1);
});

test('24 - تفکیک اکید «قطعی طبق برچسب منبع» از «تأیید کارشناسی صریح» + ایمنی وضعیت بارگذاری‌نشده بانک گلزار', () => {
  const catalogRows: ReferenceCatalogRow[] = [
    makeCatalogRow({ rowIndex: 2, tempBookId: 'BK-01', titleRaw: 'کتاب ۱' }),
    makeCatalogRow({ rowIndex: 3, tempBookId: 'BK-02', titleRaw: 'کتاب ۲' }),
  ];
  const links: BookMartyrLinkRecord[] = [
    makeLink({
      id: 'RL-SRC',
      tempBookId: 'BK-01',
      bookTitleRaw: 'کتاب ۱',
      martyrNameRaw: 'شهید احمد متوسلیان',
      gravePieceRaw: '24',
      graveRowRaw: '3',
      graveNumberRaw: '12',
      reviewStatus: 'قطعی', // فقط برچسب منبع است نه کارشناسی صریح!
    }),
    makeLink({
      id: 'RL-EXP',
      tempBookId: 'BK-02',
      bookTitleRaw: 'کتاب ۲',
      martyrNameRaw: 'شهید ابراهیم همت',
      gravePieceRaw: '27',
      graveRowRaw: '10',
      graveNumberRaw: '1',
      reviewStatus: 'تأییدشده کارشناسی',
    }),
  ];

  // بدون بانک گلزار، ارقام بانک به‌جای ۰ باید null باشند
  const noBankInputs = { catalogRows, links, golzarRecords: [] };
  const noBankMartyrs = selectMartyrAnalytics(noBankInputs);
  assert.equal(noBankMartyrs.detailedMartyrMetrics.officialBankLoaded, false);
  assert.equal(noBankMartyrs.detailedMartyrMetrics.officialAndCustomUniqueIdsCount, null);
  assert.equal(noBankMartyrs.detailedMartyrMetrics.unlinkedBankAndCustomCount, null);

  const rels = selectRelationAnalytics(noBankInputs);
  assert.equal(rels.sourceAndExpertBreakdown.definiteBySourceLabelDistinctCount, 1);
  assert.equal(rels.sourceAndExpertBreakdown.explicitExpertConfirmedDistinctCount, 1);
  assert.equal(rels.sourceAndExpertBreakdown.probableDistinctCount, 0);

  const proj = buildExecutiveEntityProjection(noBankInputs);
  assert.equal(selectDrilldownData('relations_definite_source', noBankInputs, proj).items.length, 1);
  assert.equal(selectDrilldownData('relations_confirmed', noBankInputs, proj).items.length, 1);
});

test('25 - دونات ۳ بر پایه موضوعات مستقل، استقلال تاریخچه فعالیت از بستن PV و فیلتر حوزه/نوع/تاریخ فعالیت‌ها', () => {
  const pendingReviews: PendingReviewItem[] = [
    {
      trackingId: 'PV-10',
      mainSheet: 'ارتباط کتاب و شهید',
      mainRecordId: 'RL-10',
      nameOrPhrase: 'شهید الف',
      bookTitle: 'کتاب تست',
      publisher: 'سوره مهر',
      issueSubject: 'تأیید ارتباط؛ تطبیق نام شهید',
      suggestedAction: 'بررسی',
      trackingStatus: 'باز',
    },
    {
      trackingId: 'PV-11',
      mainSheet: 'فهرست کتاب‌ها',
      mainRecordId: 'BK-11',
      nameOrPhrase: 'کتاب تست ۲',
      bookTitle: 'کتاب تست ۲',
      publisher: 'سوره مهر',
      issueSubject: 'تکرار عنوان',
      suggestedAction: 'بررسی',
      trackingStatus: 'بررسی‌شده',
    },
  ];
  const auditLogs = [
    {
      id: 'ACT-1',
      timestamp: '۱۴۰۵/۰۸/۰۵ - ۰۹:۰۰',
      actorName: 'کتابدار',
      actorRole: 'reviewer' as const,
      actionType: 'ثبت موجودی فیزیکی' as const,
      targetId: 'BK-10',
      summary: 'ثبت قفسه در انبار',
    },
    {
      id: 'ACT-2',
      timestamp: '۱۴۰۵/۰۸/۲۰ - ۱۴:۰۰',
      actorName: 'پژوهشگر',
      actorRole: 'reviewer' as const,
      actionType: 'ثبت یا ویرایش ارتباط کتاب و شهید' as const,
      targetId: 'RL-10',
      summary: 'یادداشت روی ارتباط بدون بستن PV-10',
    },
  ];

  // ۳ موضوع مستقل: ۲ موضوع باز روی PV-10، ۱ موضوع تکمیل‌شده روی PV-11 => ۳۳٪
  const overview = selectThreeCardOverview({ catalogRows: [], pendingReviews, auditLogs }, []);
  assert.equal(overview.workAndOutputsCard.independentTopicsTotalCount, 3);
  assert.equal(overview.workAndOutputsCard.independentTopicsCompletedCount, 1);
  assert.equal(overview.workAndOutputsCard.independentTopicsRemainingCount, 2);
  assert.equal(overview.workAndOutputsCard.reviewQueueCompletionPercent, 33);
  assert.equal(overview.workAndOutputsCard.reviewQueueRemainingPercent, 67);

  // افزودن رخداد جدید به auditLogs درصد PV را تغییر نمی‌دهد
  const withExtraLog = selectThreeCardOverview(
    {
      catalogRows: [],
      pendingReviews,
      auditLogs: [
        ...auditLogs,
        {
          id: 'ACT-3',
          timestamp: '۱۴۰۵/۰۸/۲۵ - ۱۶:۰۰',
          actorName: 'مدیر',
          actorRole: 'admin' as const,
          actionType: 'ثبت موجودی فیزیکی' as const,
          targetId: 'BK-11',
          summary: 'بازبینی قفسه',
        },
      ],
    },
    []
  );
  assert.equal(withExtraLog.workAndOutputsCard.reviewQueueCompletionPercent, 33);

  // فیلتر بر اساس حوزه، نوع فعالیت و بازه زمانی شمسی
  const byLibDomain = filterAuditLogEntriesPure(auditLogs, { domain: 'library' });
  assert.equal(byLibDomain.length, 1);
  assert.equal(byLibDomain[0].id, 'ACT-1');

  const byAction = filterAuditLogEntriesPure(auditLogs, {
    actionType: 'ثبت یا ویرایش ارتباط کتاب و شهید',
  });
  assert.equal(byAction.length, 1);
  assert.equal(byAction[0].id, 'ACT-2');

  const byDateRange = filterAuditLogEntriesPure(auditLogs, {
    dateFrom: '۱۴۰۵/۰۸/۱۰',
    dateTo: '۱۴۰۵/۰۸/۲۵',
  });
  assert.equal(byDateRange.length, 1);
  assert.equal(byDateRange[0].id, 'ACT-2');
});

await asyncTest('26 - دفتر کل محلی گزارش‌های مدیریتی نهایی (پیش‌نویس/نهایی/نسخه v2+ بدون تکرار شمارش و ذخیره بازیابی‌شونده)', async () => {
  assert.equal(EXECUTIVE_FINALIZED_REPORTS_KEY, 'book_executive_finalized_reports_v1');

  let reg: FinalizedReportRegistryRecord[] = [];
  // ۱. ایجاد پیش‌نویس => ۰ گزارش نهایی، ۱ پیش‌نویس کنارگذشته‌شده
  const draftRes = upsertRegistryReportPure(reg, {
    category: 'management_report',
    title: 'پیش‌نویس آبان‌ماه',
    lifecycleStatus: 'draft',
    timestampIso: '2026-11-10T10:00:00Z',
    timestampDisplay: '۱۴۰۵/۰۸/۱۹',
  });
  reg = draftRes.records;
  assert.equal(computeFinalizedRegistryStats(reg).finalizedIndependentCount, 0);
  assert.equal(computeFinalizedRegistryStats(reg).draftsExcludedCount, 1);

  // ۲. نهایی‌سازی پیش‌نویس => ۱ گزارش نهایی، ۰ پیش‌نویس
  const finRes = finalizeRegistryReportPure(reg, draftRes.savedRecord.reportId);
  reg = finRes.records;
  assert.equal(computeFinalizedRegistryStats(reg).finalizedIndependentCount, 1);
  assert.equal(computeFinalizedRegistryStats(reg).draftsExcludedCount, 0);

  // ۳. افزودن نسخه دوم (v2) روی همان reportId => تعداد مستقل همچنان ۱ می‌ماند اما تعداد نسخه‌ها ۲ است
  const v2Res = registerNewReportVersionPure(reg, {
    reportId: draftRes.savedRecord.reportId,
    fileName: 'report-v2.xlsx',
    fileType: 'excel',
    recordCount: 980,
    timestampIso: '2026-11-11T10:00:00Z',
    timestampDisplay: '۱۴۰۵/۰۸/۲۰',
  });
  reg = v2Res.records;
  const regStats = computeFinalizedRegistryStats(reg);
  assert.equal(regStats.finalizedIndependentCount, 1);
  assert.equal(regStats.totalVersionsCount, 2);

  // تست اتصال به summary گزارش‌های مدیریتی
  const repSummary = selectFinalizedManagementReportsSummary([], reg);
  assert.equal(repSummary.usesDedicatedLocalRegistry, true);
  assert.equal(repSummary.finalIndependentReportsCount, 1);
  assert.equal(repSummary.duplicateVersionsCollapsedCount, 1);

  // تست حذف و ذخیره محلی ایمن
  reg = deleteRegistryReportPure(reg, draftRes.savedRecord.reportId);
  assert.equal(reg.length, 0);
  const saveAttempt = await saveFinalizedReportsRegistry(reg);
  assert.equal(typeof saveAttempt.ok, 'boolean');
  const loaded = await loadFinalizedReportsRegistry();
  assert.ok(Array.isArray(loaded));
});

test('27 - جستجوی ۸حوزه‌ای غیرحدسی و پرسش آماری سفارشی با ساختار عدد/واحد/مبنا و رد عبارت مبهم', () => {
  const inputs = {
    catalogRows: [makeCatalogRow({ rowIndex: 2, tempBookId: 'BK-0099', titleRaw: 'سفرنامه فکه' })],
    links: [],
    pendingReviews: [],
    extractedItems: [],
    auditLogs: [],
  };
  const proj = buildExecutiveEntityProjection(inputs);
  const workDetailed = selectWorkAndOutputsDetailedAnalytics(inputs, proj.summary, [], []);

  // جستجوی تک‌کاراکتری/مبهم نباید حدس بزند
  const unclearSearch = computeUnifiedStatisticsSearch('؟', inputs, proj, [], 'all', []);
  assert.equal(unclearSearch.isQueryUnclear, true);
  assert.equal(unclearSearch.totalMatchesCount, 0);

  // جستجو با فیلتر دامنه
  const scopedBooks = computeUnifiedStatisticsSearch('فکه', inputs, proj, [], 'books', []);
  assert.equal(scopedBooks.isQueryUnclear, false);
  assert.equal(scopedBooks.booksMatchesCount, 1);
  assert.equal(scopedBooks.martyrsMatchesCount, 0);

  // پرسش آماری سفارشی مبهم نباید عدد حدسی برگرداند
  const unclearQ = answerCustomStatisticalQuestion('چندتا؟', proj.summary, workDetailed);
  assert.equal(unclearQ.status, 'unclear');

  // پرسش آماری روشن روی کتاب‌ها
  const validQ = answerCustomStatisticalQuestion(
    'چند کتاب تکمیل‌شده داریم؟',
    proj.summary,
    workDetailed
  );
  assert.equal(validQ.status, 'answered');
  if (validQ.status === 'answered') {
    assert.ok(validQ.answer.countingUnit.length > 0);
    assert.ok(validQ.answer.countingBasis.length > 0);
    assert.ok(validQ.answer.drilldownKey.startsWith('library_'));
  }
});

test('28 - یکپارچگی سورس UI برای نمودارهای دوناتی زنده، پوشش همه بخش‌های تفصیلی و اشتراک readiness بین داشبورد و آمار', () => {
  const overviewSource = fs.readFileSync(
    path.join(process.cwd(), 'src/modules/executive-dashboard/components/ExecutiveOverviewCards.tsx'),
    'utf8'
  );
  const statsRouteSource = fs.readFileSync(
    path.join(process.cwd(), 'src/modules/executive-dashboard/components/StatisticsAndReportsRouteView.tsx'),
    'utf8'
  );
  const appSource = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');

  assert.equal(overviewSource.includes('OverviewDonutChart'), true);
  assert.equal(statsRouteSource.includes('OverviewDonutChart'), true);
  assert.equal(statsRouteSource.includes('statistics-loading-state'), true);
  assert.equal(statsRouteSource.includes('statistics-error-state'), true);
  assert.equal(statsRouteSource.includes('statistics-relations-subblock'), true);
  assert.equal(statsRouteSource.includes('activity-filter-domain'), true);
  assert.equal(statsRouteSource.includes('activity-filter-action'), true);
  assert.equal(statsRouteSource.includes('activity-filter-from'), true);
  assert.equal(statsRouteSource.includes('book_executive_finalized_reports_v1'), true);
  assert.equal(statsRouteSource.includes('custom-statistical-question-input'), true);

  // اشتراک readiness واحد در App.tsx
  assert.equal(appSource.includes('const executiveReadiness: ExecutiveDashboardReadiness'), true);
  assert.equal(appSource.includes('onBackToStatisticsRoute='), true);
  assert.equal(appSource.includes("drilldownReturnRoute: 'executive_statistics'"), true);
});

console.log(`\nALL_UNIT_TESTS_PASSED (${passed} tests)`);
