/**
 * تولیدکننده یکتای شناسه‌ها (Directive #7 & #20)
 * جلوگیری از تکرار شناسه (LOG-, RL-, SS-, MR-, EX-, CP-, TMP-OUT-) حتی پس از حذف رکوردهای میانی
 * با ترکیب شمارنده افزایشی پایدار در localStorage و بررسی عدم برخورد با شناسه‌های موجود
 */

const SEQUENCE_STORAGE_KEY = 'book_id_sequences_v1';

interface SequenceState {
  LOG: number;
  RL: number;
  SS: number;
  MR: number;
  EX: number;
  CP: number;
  TMP_OUT: number;
}

const DEFAULT_SEQUENCES: SequenceState = {
  LOG: 1000,
  RL: 1000,
  SS: 1000,
  MR: 1000,
  EX: 1000,
  CP: 1000,
  TMP_OUT: 1,
};

function loadSequences(): SequenceState {
  try {
    const raw = localStorage.getItem(SEQUENCE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SEQUENCES, ...parsed };
    }
  } catch {
    // ignore parse error
  }
  return { ...DEFAULT_SEQUENCES };
}

function saveSequences(seq: SequenceState): void {
  try {
    localStorage.setItem(SEQUENCE_STORAGE_KEY, JSON.stringify(seq));
  } catch {
    // ignore quota error
  }
}

function extractMaxNumericSuffix(existingIds: string[], prefix: string): number {
  let maxNum = 0;
  for (const id of existingIds) {
    if (!id || !id.startsWith(prefix)) continue;
    const rest = id.slice(prefix.length);
    const match = rest.match(/^(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!Number.isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }
  return maxNum;
}

/**
 * تولید شناسه یکتای تاریخچه عملیات (LOG-XXXX)
 */
export function generateUniqueLogId(existingItems: Array<{ id?: string }> = []): string {
  const existingIds = existingItems.map(i => i.id || '').filter(Boolean);
  const existingSet = new Set(existingIds);
  const seq = loadSequences();
  const maxExisting = extractMaxNumericSuffix(existingIds, 'LOG-');
  let nextNum = Math.max(seq.LOG + 1, maxExisting + 1, existingItems.length + 1);
  let candidate = `LOG-${String(nextNum).padStart(4, '0')}`;
  while (existingSet.has(candidate)) {
    nextNum += 1;
    candidate = `LOG-${String(nextNum).padStart(4, '0')}`;
  }
  seq.LOG = nextNum;
  saveSequences(seq);
  return candidate;
}

/**
 * تولید شناسه یکتای ارتباط کتاب و شهید (RL-XXXX)
 */
export function generateUniqueLinkId(existingItems: Array<{ id?: string }> = [], batchOffset = 0): string {
  const existingIds = existingItems.map(i => i.id || '').filter(Boolean);
  const existingSet = new Set(existingIds);
  const seq = loadSequences();
  const maxExisting = extractMaxNumericSuffix(existingIds, 'RL-');
  let nextNum = Math.max(seq.RL + 1 + batchOffset, maxExisting + 1 + batchOffset, existingItems.length + 1 + batchOffset);
  let candidate = `RL-${String(nextNum).padStart(4, '0')}`;
  while (existingSet.has(candidate)) {
    nextNum += 1;
    candidate = `RL-${String(nextNum).padStart(4, '0')}`;
  }
  seq.RL = nextNum;
  saveSequences(seq);
  return candidate;
}

/**
 * تولید شناسه یکتای پیشنهاد هوشمند (SS-XXXX)
 */
export function generateUniqueSuggestionId(existingItems: Array<{ id?: string }> = [], batchOffset = 0): string {
  const existingIds = existingItems.map(i => i.id || '').filter(Boolean);
  const existingSet = new Set(existingIds);
  const seq = loadSequences();
  const maxExisting = extractMaxNumericSuffix(existingIds, 'SS-');
  let nextNum = Math.max(seq.SS + 1 + batchOffset, maxExisting + 1 + batchOffset, existingItems.length + 1 + batchOffset);
  let candidate = `SS-${String(nextNum).padStart(4, '0')}`;
  while (existingSet.has(candidate)) {
    nextNum += 1;
    candidate = `SS-${String(nextNum).padStart(4, '0')}`;
  }
  seq.SS = nextNum;
  saveSequences(seq);
  return candidate;
}

/**
 * تولید شناسه یکتای شهید اضافه شده توسط کاربر (MR-XXXX)
 */
export function generateUniqueMartyrId(existingItems: Array<{ id?: string }> = [], batchOffset = 0): string {
  const existingIds = existingItems.map(i => i.id || '').filter(Boolean);
  const existingSet = new Set(existingIds);
  const seq = loadSequences();
  const maxExisting = extractMaxNumericSuffix(existingIds, 'MR-');
  let nextNum = Math.max(seq.MR + 1 + batchOffset, maxExisting + 1 + batchOffset, existingItems.length + 1 + batchOffset);
  let candidate = `MR-${String(nextNum).padStart(4, '0')}`;
  while (existingSet.has(candidate)) {
    nextNum += 1;
    candidate = `MR-${String(nextNum).padStart(4, '0')}`;
  }
  seq.MR = nextNum;
  saveSequences(seq);
  return candidate;
}

/**
 * تولید شناسه یکتای رکورد تفکیک‌شده از ۱۶ گروه چندشهیدی (EX-XXXX)
 */
export function generateUniqueExtractedId(existingItems: Array<{ id?: string }> = [], batchOffset = 0): string {
  const existingIds = existingItems.map(i => i.id || '').filter(Boolean);
  const existingSet = new Set(existingIds);
  const seq = loadSequences();
  const maxExisting = extractMaxNumericSuffix(existingIds, 'EX-');
  let nextNum = Math.max(seq.EX + 1 + batchOffset, maxExisting + 1 + batchOffset, existingItems.length + 1 + batchOffset);
  let candidate = `EX-${String(nextNum).padStart(4, '0')}`;
  while (existingSet.has(candidate)) {
    nextNum += 1;
    candidate = `EX-${String(nextNum).padStart(4, '0')}`;
  }
  seq.EX = nextNum;
  saveSequences(seq);
  return candidate;
}

/**
 * تولید شناسه یکتای نسخه فیزیکی کتاب (CP-XXXX یا CP-BK-XXXX-NN)
 */
export function generateUniqueCopyId(
  existingCopies: Array<{ copyId?: string }> = [],
  bookId?: string
): { copyId: string; copyNumber: number } {
  const existingIds = existingCopies.map(c => c.copyId || '').filter(Boolean);
  const existingSet = new Set(existingIds);
  const seq = loadSequences();

  if (bookId) {
    const bookCopiesForThisBook = existingCopies.filter(
      c => c.copyId?.includes(bookId) || (c as { bookId?: string }).bookId === bookId
    );
    let maxCopyNumber = 0;
    for (const c of bookCopiesForThisBook) {
      const num = (c as { copyNumber?: number }).copyNumber || 0;
      if (num > maxCopyNumber) maxCopyNumber = num;
    }
    let nextCopyNum = Math.max(maxCopyNumber + 1, bookCopiesForThisBook.length + 1);
    const maxGlobal = extractMaxNumericSuffix(existingIds, 'CP-');
    let nextGlobal = Math.max(seq.CP + 1, maxGlobal + 1, existingCopies.length + 1);
    let candidate = `CP-${String(nextGlobal).padStart(4, '0')}`;
    while (existingSet.has(candidate)) {
      nextGlobal += 1;
      candidate = `CP-${String(nextGlobal).padStart(4, '0')}`;
    }
    seq.CP = nextGlobal;
    saveSequences(seq);
    return { copyId: candidate, copyNumber: nextCopyNum };
  }

  const maxGlobal = extractMaxNumericSuffix(existingIds, 'CP-');
  let nextGlobal = Math.max(seq.CP + 1, maxGlobal + 1, existingCopies.length + 1);
  let candidate = `CP-${String(nextGlobal).padStart(4, '0')}`;
  while (existingSet.has(candidate)) {
    nextGlobal += 1;
    candidate = `CP-${String(nextGlobal).padStart(4, '0')}`;
  }
  seq.CP = nextGlobal;
  saveSequences(seq);
  return { copyId: candidate, copyNumber: 1 };
}

/**
 * تولید شناسه یکتای کتاب خارج از لیست اولیه (TMP-OUT-XXX)
 */
export function generateUniqueOutsideBookId(existingBookIds: string[] = []): string {
  const existingSet = new Set(existingBookIds.filter(Boolean));
  const seq = loadSequences();
  const maxExisting = extractMaxNumericSuffix(existingBookIds, 'TMP-OUT-');
  let nextNum = Math.max(seq.TMP_OUT + 1, maxExisting + 1);
  let candidate = `TMP-OUT-${String(nextNum).padStart(3, '0')}`;
  while (existingSet.has(candidate)) {
    nextNum += 1;
    candidate = `TMP-OUT-${String(nextNum).padStart(3, '0')}`;
  }
  seq.TMP_OUT = nextNum;
  saveSequences(seq);
  return candidate;
}
