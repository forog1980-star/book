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
import * as XLSXStyleNamespace from 'xlsx-js-style';
import {
  RELATION_CERTAINTY_DISPLAY_LABELS,
  buildExecutiveDashboardExportV1,
  buildExecutiveEntityProjection,
  exportExecutiveManagementExcel,
  extractLibraryWorkbookInputsFromJson,
  normalizeGolzarRawRows,
  selectThreeCardOverview,
} from '../index';

const XLSX =
  (XLSXNamespace as unknown as { default?: typeof XLSXNamespace }).default ?? XLSXNamespace;
const XLSXStyle =
  (XLSXStyleNamespace as unknown as { default?: typeof XLSXStyleNamespace }).default ??
  XLSXStyleNamespace;

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

const inputs = {
  catalogRows,
  links,
  pendingReviews,
  golzarRecords,
};

const projection = buildExecutiveEntityProjection(inputs);
const summary = projection.summary;

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

// ۲. بررسی افراز مصوب کارفرما (گزینه ج): ۰ تکمیل / ۱۰ تیکت باز PV-0558..PV-0567 / ۹۷۰ بررسی‌نشده = ۹۸۰
const rb = summary.library.reviewBreakdown;
const part = rb.managerialStatusPartition;
assert.equal(part.completedWithoutOpenTicketCount, 0);
assert.equal(part.openBookTicketCount, 10);
assert.equal(part.unreviewedCount, 970);
assert.equal(
  part.completedWithoutOpenTicketCount + part.openBookTicketCount + part.unreviewedCount,
  980
);
assert.equal(part.totalTrackedBooksCount, 980);
assert.ok(part.openBookTicketIds.includes('PV-0558'));
assert.ok(part.openBookTicketIds.includes('PV-0567'));

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

// ۳-ب. بررسی شمارش شخص یکتای شهید مرتبط (۳۳۲ احرازشده + ۶۳ نیازمند احراز = ۳۹۵، صفر هم‌پوشانی) + هشدار تایپوی مختصات مزار
assert.equal(summary.martyrs.linkedMartyrsSummary.distinctNormalizedLinkedNamesCount, 395);
assert.equal(summary.martyrs.linkedMartyrsSummary.confirmedUniqueLinkedMartyrsCount, 332);
assert.equal(summary.martyrs.linkedMartyrsSummary.ambiguousOrUnverifiedLinkedNamesCount, 63);
assert.equal(
  summary.martyrs.linkedMartyrsSummary.confirmedUniqueLinkedMartyrsCount +
    summary.martyrs.linkedMartyrsSummary.ambiguousOrUnverifiedLinkedNamesCount,
  395
);
assert.equal(
  summary.martyrs.linkedMartyrsSummary.discrepancyWarnings.some(
    (w) => w.kind === 'grave_coordinate_mismatch' && w.displayName.includes('صیاد شیرازی')
  ),
  true
);
assert.equal(
  summary.martyrs.linkedMartyrsSummary.discrepancyWarnings.some(
    (w) => w.kind === 'grave_coordinate_mismatch' && w.displayName.includes('خرم دل')
  ),
  true
);

// ۴. بررسی تمامیت ۸۳۶ ارتباط کتاب-شهید، ۱۹۴ + ۲۷۶ = ۴۷۰ کتاب دارای ارتباط، ۲۷۹ دارای مزار بررسی‌نشده، ۵۶۷ مورد بررسی و ۱۶ گروه چندشهیدی
assert.equal(summary.relations.totalRawLinkRows, 836);
const rawCertaintySum = Object.values(summary.relations.certaintyByRawRows).reduce(
  (a, b) => a + b,
  0
);
assert.equal(rawCertaintySum, 836);
assert.equal(summary.relations.certaintyByRawRows.confirmedByExpert, 0);
assert.equal(summary.relations.certaintyByRawRows.probable, 279);
assert.equal(
  RELATION_CERTAINTY_DISPLAY_LABELS.probable,
  'دارای مشخصات مزار، اما بررسی‌نشده کارشناسی'
);
assert.equal(summary.relations.booksWithLinksBreakdown.booksWithNamedMartyrLinks, 194);
assert.equal(summary.relations.booksWithLinksBreakdown.booksWithOnlyGroupOrPlaceholderLinks, 276);
assert.equal(summary.relations.booksWithLinksBreakdown.totalBooksWithActiveLinks, 470);
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

// ۷. بررسی پروجکشن موجودیت‌های فاز دوم و خروجی JSON مدیریتی (ExecutiveDashboardExportV1)
assert.equal(projection.books.length, 980);
assert.equal(projection.martyrs.length, 395);
assert.equal(projection.relations.length, 836);

const jsonExport = buildExecutiveDashboardExportV1(inputs, { projection });
assert.equal(jsonExport.schema_id, 'ExecutiveDashboardExportV1');
assert.equal(jsonExport.schema_version, '1.0.0');
assert.equal(jsonExport.books.length, 980);
assert.equal(jsonExport.martyrs.length, 395);
assert.equal(jsonExport.relations.length, 836);

// ۸. بررسی تولید واقعی اکسل مدیریتی ۵ شیته و بازخوانی ساختار و فرمت آن (با پاک‌سازی فایل موقت)
const tempPrefix = `__tmp_exec_dash_test_${Date.now()}`;
const excelRes = exportExecutiveManagementExcel(inputs, { fileNamePrefix: tempPrefix });
assert.equal(excelRes.ok, true);
assert.equal(excelRes.sheetsCount, 5);
assert.ok(excelRes.totalRowsExported > 0);

const generatedExcelPath = path.resolve(ROOT, excelRes.fileName);
try {
  assert.equal(fs.existsSync(generatedExcelPath), true);
  const rawBuffer = fs.readFileSync(generatedExcelPath);
  const wbVerify = XLSXStyle.read(rawBuffer, { type: 'buffer', cellStyles: true });
  assert.deepEqual(wbVerify.SheetNames, [
    '۱-فهرست اصلی کتاب‌ها',
    '۲-ارتباط کتاب و شهید',
    '۳-موضوعات و صفحات مرتبط',
    '۴-متن‌های استخراج‌شده',
    '۵-اطلاعات شهدای مرتبط',
  ]);

  const cfb = XLSX.CFB.read(rawBuffer, { type: 'buffer' });
  const stylesXmlEntry = XLSX.CFB.find(cfb, '/xl/styles.xml');
  assert.ok(stylesXmlEntry, 'xl/styles.xml missing');
  const stylesXml = Buffer.from(stylesXmlEntry.content).toString('utf8');
  assert.ok(stylesXml.includes('Vazirmatn'), 'Vazirmatn font missing in xl/styles.xml');

  for (let i = 1; i <= 5; i += 1) {
    const entry = XLSX.CFB.find(cfb, `/xl/worksheets/sheet${i}.xml`);
    assert.ok(entry, `xl/worksheets/sheet${i}.xml missing`);
    const xml = Buffer.from(entry.content).toString('utf8');
    assert.ok(xml.includes('rightToLeft="1"'), `RTL view missing on sheet${i}`);
    assert.ok(xml.includes('<autoFilter ref="A3:'), `AutoFilter missing on sheet${i}`);
    assert.ok(xml.includes('<pageMargins'), `pageMargins missing on sheet${i}`);
  }

  // بررسی حفظ شناسه‌ها و فیلدهای کتابشناختی در برگه اول و برگه روابط
  const sheet1 = wbVerify.Sheets[wbVerify.SheetNames[0]];
  const sheet1Csv = XLSX.utils.sheet_to_csv(sheet1);
  assert.match(sheet1Csv, /BK-\d{4}/);
  assert.match(sheet1Csv, /RL-\d{4}/);
  assert.ok(sheet1Csv.includes('شابک'));
  assert.ok(sheet1Csv.includes('فیپا'));
  assert.ok(sheet1Csv.includes('شماره صفحات'));
} finally {
  if (fs.existsSync(generatedExcelPath)) {
    fs.unlinkSync(generatedExcelPath);
  }
}

// ۹. بررسی انطباق نمای سه‌کادره با داده‌های واقعی بدون هیچ عدد Hardcode‌شده
const threeCard = selectThreeCardOverview(inputs, 0);
assert.equal(threeCard.libraryCard.totalTrackedBooksCount, 980);
assert.equal(threeCard.libraryCard.completedCount, 0);
assert.equal(threeCard.libraryCard.openDuplicateTicketCount, 10);
assert.equal(threeCard.libraryCard.unreviewedCount, 970);
assert.equal(threeCard.libraryCard.remainingForReviewCount, 980);
assert.equal(threeCard.libraryCard.completedPercent, 0);
assert.equal(threeCard.libraryCard.remainingPercent, 100);

assert.equal(threeCard.martyrsCard.totalLinkedMartyrsCount, 395);
assert.equal(threeCard.martyrsCard.confirmedIdentityCount, 332);
assert.equal(threeCard.martyrsCard.needsVerificationCount, 63);
assert.equal(threeCard.martyrsCard.confirmedIdentityPercent, 84);
assert.equal(threeCard.martyrsCard.needsVerificationPercent, 16);
assert.equal(threeCard.martyrsCard.relatedBooksCount, 470);
assert.equal(threeCard.martyrsCard.expertConfirmedRelationsCount, 0);
assert.equal(threeCard.martyrsCard.needsReviewRelationsCount, 557);

assert.equal(threeCard.workAndOutputsCard.reviewQueueTotalCount, 567);
assert.equal(threeCard.workAndOutputsCard.reviewQueueCompletedCount, 0);
assert.equal(threeCard.workAndOutputsCard.reviewQueueRemainingCount, 567);
assert.equal(threeCard.workAndOutputsCard.reviewQueueCompletionPercent, 0);
assert.equal(threeCard.workAndOutputsCard.reviewQueueRemainingPercent, 100);

console.log('=== REAL DATA RECONCILIATION REPORT (THREE-CARD OVERVIEW) ===');
console.log(
  JSON.stringify(
    {
      threeCardOverview: threeCard,
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
        discrepancyWarningsCount:
          summary.martyrs.linkedMartyrsSummary.discrepancyWarnings.length,
      },
      relationsSummary: {
        totalRawLinkRows: summary.relations.totalRawLinkRows,
        distinctBookTargetPairsCount: summary.relations.distinctBookTargetPairsCount,
        duplicatePairRowsCount: summary.relations.duplicatePairRowsCount,
        certaintyByRawRows: summary.relations.certaintyByRawRows,
        relationKindBreakdown: summary.relations.relationKindBreakdown,
        booksWithLinksBreakdown: summary.relations.booksWithLinksBreakdown,
      },
      excelVerification: {
        sheetsCount: excelRes.sheetsCount,
        totalRowsExported: excelRes.totalRowsExported,
      },
    },
    null,
    2
  )
);
console.log('REAL_DATA_RECONCILIATION_PASSED');
