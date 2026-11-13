/**
 * آزمون آشتی‌دادن داده‌های واقعی مخزن با موتور آماری داشبورد مدیریتی
 * داده‌های ورودی مستقیم از فایل‌های واقعی مخزن خوانده می‌شوند و هیچ عددی در کد Hardcode نشده است:
 * - public/data/library_books.json
 * - public/data/golzar_martyrs.xlsx
 * - public/data/sooreh_mehr_book_martyr_research.json
 *
 * فرمان اجرا: npx tsx src/modules/executive-dashboard/tests/realDataReconciliation.test.ts
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSXNamespace from 'xlsx';
import {
  extractLibraryWorkbookInputsFromJson,
  normalizeGolzarRawRows,
  selectExecutiveDashboardSummary,
} from '../index';

const XLSX =
  (XLSXNamespace as unknown as { default?: typeof XLSXNamespace }).default ?? XLSXNamespace;

const ROOT = process.cwd();
const LIBRARY_JSON_PATH = path.join(ROOT, 'public/data/library_books.json');
const GOLZAR_XLSX_PATH = path.join(ROOT, 'public/data/golzar_martyrs.xlsx');
const SOOREH_JSON_PATH = path.join(ROOT, 'public/data/sooreh_mehr_book_martyr_research.json');

const libraryRawJson = JSON.parse(fs.readFileSync(LIBRARY_JSON_PATH, 'utf8'));
const { catalogRows, links, pendingReviews } = extractLibraryWorkbookInputsFromJson(libraryRawJson);

const golzarWb = XLSX.read(fs.readFileSync(GOLZAR_XLSX_PATH), { type: 'buffer' });
const mainGolzarRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
  golzarWb.Sheets['golzar_martyrs'],
  { defval: '' }
);
const outsideGolzarRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
  golzarWb.Sheets['outside_golzar_martyrs'],
  { defval: '' }
);
const golzarRecords = [
  ...normalizeGolzarRawRows(mainGolzarRows, 'golzar_martyrs'),
  ...normalizeGolzarRawRows(outsideGolzarRows, 'outside_golzar_martyrs'),
];

const soorehJson = JSON.parse(fs.readFileSync(SOOREH_JSON_PATH, 'utf8'));
const soorehSheet0 = soorehJson?.Sheets?.[0];

const summary = selectExecutiveDashboardSummary({
  catalogRows,
  links,
  pendingReviews,
  golzarRecords,
});

// ۱. بررسی انطباق کاتالوگ واقعی ۹۸۰ ردیف و ۹۶۸ عنوان یکتا و گروه‌های هم‌نام
assert.equal(summary.library.catalogRowsCount, 980);
assert.equal(summary.library.distinctCatalogBookIdsCount, 980);
assert.equal(summary.library.exactUniqueCatalogTitlesCount, 968);
assert.equal(summary.library.normalizedUniqueCatalogTitlesCount, 968);
assert.equal(summary.library.similarTitleGroups.length, 10);

// اثبات ریاضی اختلاف ۹۸۰ ردیف و ۹۶۸ عنوان یکتا:
const duplicateExtraRows = summary.library.similarTitleGroups.reduce(
  (sum, grp) => sum + (grp.rowCount - 1),
  0
);
assert.equal(duplicateExtraRows, 12);
assert.equal(
  summary.library.catalogRowsCount - duplicateExtraRows,
  summary.library.exactUniqueCatalogTitlesCount
);

// ۲. بررسی افراز بدون تکرار وضعیت بررسی کتاب‌ها روی داده خام واقعی
const rb = summary.library.reviewBreakdown;
assert.equal(rb.reviewedCount + rb.remainingForReviewCount, rb.totalTrackedBooksCount);
assert.equal(rb.reviewedWithoutMartyrLinkCount + rb.reviewedWithMartyrLinkCount, rb.reviewedCount);
assert.equal(rb.reviewedCount, 10);
assert.equal(rb.remainingForReviewCount, 970);

// ۳. بررسی پایگاه رسمی ۲۸٬۳۶۸ شهید گلزار به تفکیک دقیق شهید / گمنام / اموات
assert.equal(summary.martyrs.officialBank.totalRows, 28368);
assert.equal(summary.martyrs.officialBank.golzarMainSheetRows, 27999);
assert.equal(summary.martyrs.officialBank.outsideGolzarSheetRows, 369);
assert.equal(
  summary.martyrs.officialBank.namedMartyrRowsCount +
    summary.martyrs.officialBank.unknownMartyrRowsCount +
    summary.martyrs.officialBank.nonMartyrRowsCount,
  28368
);
assert.equal(summary.martyrs.officialBank.namedMartyrRowsCount, 23751);
assert.equal(summary.martyrs.officialBank.unknownMartyrRowsCount, 3506);
assert.equal(summary.martyrs.officialBank.nonMartyrRowsCount, 1111);

// ۴. بررسی تمامیت ۸۳۶ ارتباط کتاب-شهید و ۵۶۷ مورد بررسی و ۱۶ گروه چندشهیدی
assert.equal(summary.relations.totalRawLinkRows, 836);
const rawCertaintySum = Object.values(summary.relations.certaintyByRawRows).reduce(
  (a, b) => a + b,
  0
);
assert.equal(rawCertaintySum, 836);
assert.equal(summary.relations.certaintyByRawRows.confirmedByExpert, 0);
assert.equal(summary.relations.relationKindBreakdown['نامشخص'], 836);
assert.equal(summary.martyrs.linkedMartyrsSummary.placeholderOrGroupLinkRowsCount, 296);

assert.equal(summary.reviewQueue.pendingReviews.totalCount, 567);
assert.equal(summary.reviewQueue.pendingReviews.openCount, 567);
assert.equal(summary.reviewQueue.multiMartyrGroups.totalGroupsCount, 16);

// ۵. بررسی عدم انتساب داده‌های تاریخی بی‌تاریخ به دوره‌های زمانی
assert.equal(summary.temporalAudit.datelessLegacyExcludedFromPeriodicMetrics, true);
assert.equal(summary.temporalAudit.monthlyActivity.length, 0);
assert.equal(
  summary.temporalAudit.structurallyDatelessSources.totalDatelessRecordsCount,
  980 + 836 + 567 + 28368
);

// ۶. بررسی سازگاری فایل سوره مهر با آرشیو واقعی
assert.equal(soorehSheet0?.SheetName, 'Sheet2');
assert.equal(soorehSheet0?.Data?.length, 602);

console.log('=== REAL DATA RECONCILIATION REPORT ===');
console.log(
  JSON.stringify(
    {
      kpiCards: {
        martyrRelatedKpi: summary.martyrRelatedKpi,
        totalBooksKpi: summary.totalBooksKpi,
        bookReviewStatusKpi: summary.bookReviewStatusKpi,
      },
      officialMartyrsBank: summary.martyrs.officialBank,
      linkedMartyrsSummary: {
        distinctNormalizedLinkedNamesCount:
          summary.martyrs.linkedMartyrsSummary.distinctNormalizedLinkedNamesCount,
        confirmedUniqueLinkedMartyrsCount:
          summary.martyrs.linkedMartyrsSummary.confirmedUniqueLinkedMartyrsCount,
        ambiguousOrUnverifiedLinkedNamesCount:
          summary.martyrs.linkedMartyrsSummary.ambiguousOrUnverifiedLinkedNamesCount,
        placeholderOrGroupLinkRowsCount:
          summary.martyrs.linkedMartyrsSummary.placeholderOrGroupLinkRowsCount,
        homonymAmbiguityNamesCount:
          summary.martyrs.linkedMartyrsSummary.homonymAmbiguityNames.length,
      },
      relationsSummary: {
        totalRawLinkRows: summary.relations.totalRawLinkRows,
        distinctBookTargetPairsCount: summary.relations.distinctBookTargetPairsCount,
        duplicatePairRowsCount: summary.relations.duplicatePairRowsCount,
        certaintyByRawRows: summary.relations.certaintyByRawRows,
        relationKindBreakdown: summary.relations.relationKindBreakdown,
        booksWithLinksBreakdown: summary.relations.booksWithLinksBreakdown,
      },
      reviewQueueSummary: {
        pendingReviewsTotal: summary.reviewQueue.pendingReviews.totalCount,
        pendingReviewsOpen: summary.reviewQueue.pendingReviews.openCount,
        openByMainSheet: summary.reviewQueue.pendingReviews.openByMainSheet,
        multiMartyrGroupsCount: summary.reviewQueue.multiMartyrGroups.totalGroupsCount,
        multiMartyrMemberRowsCount: summary.reviewQueue.multiMartyrGroups.totalMemberRowsCount,
      },
      temporalAuditSummary: {
        datelessSources: summary.temporalAudit.structurallyDatelessSources,
        monthlyActivityCount: summary.temporalAudit.monthlyActivity.length,
      },
    },
    null,
    2
  )
);
console.log('REAL_DATA_RECONCILIATION_PASSED');
