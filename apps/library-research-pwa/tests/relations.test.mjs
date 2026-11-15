import test from 'node:test';
import assert from 'node:assert/strict';
import { linksForBook, linksForMartyr } from '../dist/relations.js';

const relations = [
  { id: 'LNK-1', bookId: 'BK-1', martyrId: 'MT-1', reviewStatus: 'proposed' },
  { id: 'LNK-2', bookId: 'BK-1', martyrId: 'MT-2', reviewStatus: 'confirmed' },
  { id: 'LNK-3', bookId: 'BK-2', martyrId: 'MT-1', reviewStatus: 'rejected' },
];

test('book relation lookup supports one book linked to multiple martyrs', () => {
  assert.deepEqual(linksForBook(relations, 'BK-1').map((item) => item.id), ['LNK-1', 'LNK-2']);
});

test('martyr relation lookup supports multiple books linked to one martyr', () => {
  assert.deepEqual(linksForMartyr(relations, 'MT-1').map((item) => item.id), ['LNK-1', 'LNK-3']);
});

test('relation lookup keeps review states and returns empty for missing IDs', () => {
  assert.deepEqual(linksForBook(relations, 'MISSING'), []);
  assert.deepEqual(linksForMartyr(relations, ''), []);
  assert.equal(linksForBook(relations, 'BK-1')[0].reviewStatus, 'proposed');
  assert.equal(linksForBook(relations, 'BK-1')[1].reviewStatus, 'confirmed');
});
