import assert from 'node:assert/strict';
import {
  analyzeShelfCapacities,
  parsePositiveCopiesCount,
  parseShelfAndLevelFromLocation
} from './shelfCapacityAnalyzer';
import type { BookCopyRecord, FieldAuditRecord, ReferenceCatalogRow } from '../data/markazAsnadData';

function makeCatalogRow(id: string, loc = '', copies = ''): ReferenceCatalogRow {
  return {
    rowKey: `فهرست کتاب‌ها::${id}`,
    rowIndex: 2,
    tempBookId: id,
    titleRaw: `کتاب ${id}`,
    publisherRaw: 'سوره مهر',
    descriptionRaw: '',
    categoryRaw: 'R',
    authorRaw: '',
    isbnRaw: '',
    fipaRaw: '',
    registrationNoRaw: '',
    locationRaw: loc,
    countedCopiesRaw: copies,
    reviewStatusRaw: 'بررسی‌نشده',
    noteRaw: '',
    backupSourceSheet: 'سوره مهر',
    backupSourceRow: '2',
    allValues: []
  };
}

// 1. Location & Persian digit parsing
assert.deepEqual(parseShelfAndLevelFromLocation('SH-02-T04'), { shelf: 'SH-02', level: 'T04' });
assert.deepEqual(parseShelfAndLevelFromLocation('قفسه ۳ - طبقه ۲'), { shelf: 'SH-03', level: 'T02' });
assert.equal(parsePositiveCopiesCount('۱۲'), 12);
assert.equal(parsePositiveCopiesCount('', 1), 1);

// 2. Exact 80% boundary check (80.0% is NOT alerted; 80.3% IS alerted)
const atExactly80 = analyzeShelfCapacities({
  catalogRows: [makeCatalogRow('BK-0001')],
  auditRecords: {
    'فهرست کتاب‌ها::BK-0001': {
      key: 'فهرست کتاب‌ها::BK-0001',
      source: 'catalog',
      sheet: 'فهرست کتاب‌ها',
      tempBookId: 'BK-0001',
      title: 'کتاب نمونه',
      author: '',
      publisher: 'سوره مهر',
      year: '',
      category: 'R',
      shelf: 'SH-01',
      level: 'T01',
      location: 'SH-01-T01',
      physical: 'verified',
      countedCopies: '240',
      notes: '',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }
  },
  capacities: { 'SH-01': 300, 'SH-02': 300, 'SH-03': 300, 'SH-04': 300 }
});

assert.equal(atExactly80.shelves[0].fillPercent, 80);
assert.equal(atExactly80.shelves[0].isOverWarningThreshold, false);
assert.equal(atExactly80.alertedShelves.length, 0);

const over80 = analyzeShelfCapacities({
  catalogRows: [makeCatalogRow('BK-0001')],
  auditRecords: {
    'فهرست کتاب‌ها::BK-0001': {
      key: 'فهرست کتاب‌ها::BK-0001',
      source: 'catalog',
      sheet: 'فهرست کتاب‌ها',
      tempBookId: 'BK-0001',
      title: 'کتاب نمونه',
      author: '',
      publisher: 'سوره مهر',
      year: '',
      category: 'R',
      shelf: 'SH-01',
      level: 'T01',
      location: 'SH-01-T01',
      physical: 'verified',
      countedCopies: '241',
      notes: '',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }
  },
  capacities: { 'SH-01': 300, 'SH-02': 300, 'SH-03': 300, 'SH-04': 300 }
});

assert.equal(over80.shelves[0].fillPercent, 80.3);
assert.equal(over80.shelves[0].isOverWarningThreshold, true);
assert.equal(over80.alertedShelves.length, 1);
assert.equal(over80.alertedShelves[0].shelf, 'SH-01');

// 3. No double counting between auditRecords and bookCopies, and excludes missing/not_found/loaned
const auditRec: FieldAuditRecord = {
  key: 'OUT-1',
  source: 'outside-list',
  sheet: 'ثبت کتاب خارج از فهرست',
  tempBookId: 'TMP-OUT-001',
  copyId: 'CP-000010',
  title: 'کتاب خارج از فهرست',
  author: '',
  publisher: '',
  year: '',
  category: 'R',
  shelf: 'SH-02',
  level: 'T03',
  location: 'SH-02-T03',
  physical: 'review',
  copyStatus: 'pending_review',
  countedCopies: '1',
  notes: '',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

const copies: BookCopyRecord[] = [
  {
    copyId: 'CP-000010',
    bookId: 'TMP-OUT-001',
    bookTitle: 'کتاب خارج از فهرست',
    copyStatus: 'pending_review',
    shelf: 'SH-02',
    level: 'T03',
    location: 'SH-02-T03',
    observedDate: '۱۴۰۵/۰۸/۰۴',
    physicalCondition: 'healthy',
    loanOrMoveStatus: 'در قفسه مرکز اسناد',
    expertNote: '',
    lastReviewedAt: '۱۴۰۵/۰۸/۰۴',
    locationHistory: []
  },
  {
    copyId: 'CP-000011',
    bookId: 'BK-0099',
    bookTitle: 'امانتی',
    copyStatus: 'loaned',
    shelf: 'SH-02',
    level: 'T03',
    location: 'SH-02-T03',
    observedDate: '۱۴۰۵/۰۸/۰۴',
    physicalCondition: 'healthy',
    loanOrMoveStatus: 'امانت به پژوهشگر',
    expertNote: '',
    lastReviewedAt: '۱۴۰۵/۰۸/۰۴',
    locationHistory: []
  }
];

const dedupCheck = analyzeShelfCapacities({
  catalogRows: [makeCatalogRow('BK-0002', 'SH-03-T02', '۴۵')], // Persian digits: 45/50 = 90% on SH-03-T02
  auditRecords: { 'OUT-1': auditRec },
  bookCopies: copies,
  capacities: { 'SH-01': 300, 'SH-02': 300, 'SH-03': 300, 'SH-04': 300 }
});

assert.equal(dedupCheck.shelves[1].occupiedVolumesCount, 1); // TMP-OUT-001 counted once, loaned CP-000011 excluded
assert.equal(dedupCheck.shelves[2].occupiedVolumesCount, 45);
assert.equal(dedupCheck.shelves[2].isOverWarningThreshold, false); // 45/300 = 15% overall
assert.equal(dedupCheck.alertedLevels.length, 1);
assert.equal(dedupCheck.alertedLevels[0].locationCode, 'SH-03-T02');
assert.equal(dedupCheck.alertedLevels[0].fillPercent, 90);

console.log('SHELF_CAPACITY_ANALYZER_TESTS_PASSED');
