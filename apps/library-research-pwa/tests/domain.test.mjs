import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, EXPECTED_REFERENCE_SHA256, categoryLabel, findExactTitleDuplicates, makeLocation, locationFitsCategory, normalizePersian, statusLabel, validateBookInput } from '../dist/domain.js';

test('Persian normalization preserves original strings', () => {
  const raw = 'ي ك — کتابِ شهید';
  assert.equal(normalizePersian(raw), 'ی ک — کتاب شهید');
  assert.equal(raw, 'ي ك — کتابِ شهید');
});

test('shelf and tier validation is strict', () => {
  assert.deepEqual(makeLocation('SH-01', 'T01'), { shelf: 'SH-01', tier: 'T01', code: 'SH-01-T01' });
  assert.throws(() => makeLocation('SH-05', 'T01'));
  assert.throws(() => makeLocation('SH-01', 'T07'));
});

test('shelf map respects six approved categories', () => {
  assert.equal(locationFitsCategory('R', 'SH-02', 'T06'), true);
  assert.equal(locationFitsCategory('H', 'SH-03', 'T01'), true);
  assert.equal(locationFitsCategory('A', 'SH-03', 'T02'), true);
  assert.equal(locationFitsCategory('P', 'SH-03', 'T04'), true);
  assert.equal(locationFitsCategory('M', 'SH-03', 'T06'), true);
  assert.equal(locationFitsCategory('K', 'SH-04', 'T01'), true);
  assert.equal(locationFitsCategory('K', 'SH-04', 'T02'), false);
});

test('book input requires a title and an allowed category', () => {
  assert.equal(validateBookInput({ title: '', categoryCode: 'R' }).length, 1);
  assert.equal(validateBookInput({ title: 'عنوان آزمایشی', categoryCode: 'X' }).length, 1);
  assert.deepEqual(validateBookInput({ title: 'عنوان آزمایشی', categoryCode: 'U' }), []);
  assert.equal(CATEGORIES.length, 6);
});

test('similar titles are suggestions, never automatic merges', () => {
  const rows = [{ id: 'BK-1', titleRaw: 'دفاع مقدس', publisherRaw: 'ناشر یک' }, { id: 'BK-2', titleRaw: 'کتاب دیگر', publisherRaw: 'ناشر دو' }];
  assert.deepEqual(findExactTitleDuplicates(rows, 'دِفاع مقدّس').map((item) => item.id), ['BK-1']);
  assert.equal(rows.length, 2);
});

test('reference hash shape and review labels are explicit', () => {
  assert.equal(EXPECTED_REFERENCE_SHA256.length, 64);
  assert.equal(statusLabel('needs_review'), 'نیازمند بررسی');
  assert.equal(categoryLabel('U'), 'نامشخص');
});

test('CSV keeps books without copies and expands multi-copy books', async () => {
  const { buildInventoryCsv } = await import('../dist/backup.js');
  const now = new Date().toISOString();
  const books = [
    { id: 'BK-1', titleRaw: 'کتاب بدون نسخه', titleDisplay: 'کتاب بدون نسخه', authorsRaw: '', publisherRaw: 'ناشر', publicationYearRaw: '', categoryCode: 'R', reviewStatus: 'needs_review' },
    { id: 'BK-2', titleRaw: 'کتاب دارای دو نسخه', titleDisplay: 'کتاب دارای دو نسخه', authorsRaw: '', publisherRaw: 'ناشر', publicationYearRaw: '', categoryCode: 'A', reviewStatus: 'needs_review' },
  ];
  const copies = [
    { id: 'CP-1', bookId: 'BK-2', observation: 'observed', physicalCondition: 'unknown', observedAt: now, note: '' },
    { id: 'CP-2', bookId: 'BK-2', observation: 'on_loan', physicalCondition: 'unknown', note: '' },
  ];
  const csv = buildInventoryCsv(books, copies);
  assert.equal((csv.match(/\r\n/g) || []).length, 3);
  assert.match(csv, /BK-1/);
  assert.match(csv, /BK-2/);
  assert.match(csv, /CP-1/);
  assert.match(csv, /CP-2/);
});

test('backup rejects duplicate IDs and orphan copies', async () => {
  const { validateSnapshot } = await import('../dist/db.js');
  const empty = { appId: 'markaz-asnad-library-research-pwa', schemaVersion: 1, exportedAt: new Date().toISOString(), stores: { books: [], copies: [], martyrs: [], links: [], excerpts: [], imports: [], sourceRows: [], audit: [] } };
  assert.equal(validateSnapshot(empty), true);
  const duplicate = structuredClone(empty);
  duplicate.stores.books.push({ id: 'BK-1' }, { id: 'BK-1' });
  assert.equal(validateSnapshot(duplicate), false);
  const orphan = structuredClone(empty);
  orphan.stores.copies.push({ id: 'CP-1', bookId: 'BK-MISSING' });
  assert.equal(validateSnapshot(orphan), false);
});
