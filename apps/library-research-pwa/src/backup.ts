import type { AppSnapshot, BookRecord, BookCopy } from './model.js';
import { createSnapshot, mergeSnapshot, validateSnapshot } from './db.js';
import { categoryLabel, statusLabel } from './domain.js';

export function downloadFile(fileName: string, content: string, mimeType: string): void {
  const blob = new Blob(['\uFEFF', content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

export async function downloadFullBackup(): Promise<void> {
  const snapshot = await createSnapshot();
  downloadFile(`پشتیبان-کامل-مرکز-اسناد-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(snapshot, null, 2), 'application/json;charset=utf-8');
}

export function validateBackupText(text: string): AppSnapshot {
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { throw new Error('فایل انتخاب‌شده JSON معتبر نیست.'); }
  if (!validateSnapshot(parsed)) throw new Error('ساختار پشتیبان با نسخه فعلی نرم‌افزار سازگار نیست. داده‌ای تغییر نکرد.');
  return parsed;
}

export async function mergeBackupText(text: string): Promise<{ added: number; conflicts: number }> {
  const snapshot = validateBackupText(text);
  return mergeSnapshot(snapshot);
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildInventoryCsv(books: BookRecord[], copies: BookCopy[]): string {
  const headers = ['شناسه داخلی کتاب', 'عنوان خام', 'عنوان نمایشی', 'پدیدآورنده خام', 'ناشر خام', 'سال چاپ خام', 'گروه', 'منبع مشخصات کتاب', 'وضعیت بررسی کتاب', 'شناسه نسخه فیزیکی', 'وضعیت مشاهده', 'قفسه', 'طبقه', 'کد محل', 'وضعیت ظاهری', 'تاریخ مشاهده', 'یادداشت نسخه'];
  const lines = [headers.map(csvCell).join(',')];
  const copiesByBook = new Map<string, BookCopy[]>();
  for (const copy of copies) {
    const group = copiesByBook.get(copy.bookId) ?? [];
    group.push(copy);
    copiesByBook.set(copy.bookId, group);
  }
  for (const book of books) {
    const bookCopies = copiesByBook.get(book.id) ?? [];
    if (!bookCopies.length) {
      lines.push([book.id, book.titleRaw, book.titleDisplay, book.authorsRaw, book.publisherRaw, book.publicationYearRaw, categoryLabel(book.categoryCode), book.sourceEvidenceRaw, statusLabel(book.reviewStatus), '', '', '', '', '', '', '', ''].map(csvCell).join(','));
      continue;
    }
    for (const copy of bookCopies) {
      lines.push([
        book.id, book.titleRaw, book.titleDisplay, book.authorsRaw, book.publisherRaw,
        book.publicationYearRaw, categoryLabel(book.categoryCode), book.sourceEvidenceRaw, statusLabel(book.reviewStatus),
        copy.id, copy.observation, copy.location?.shelf ?? '', copy.location?.tier ?? '', copy.location?.code ?? '',
        copy.physicalCondition, copy.observedAt ?? '', copy.note,
      ].map(csvCell).join(','));
    }
  }
  return lines.join('\r\n');
}

export async function downloadInventoryCsv(): Promise<void> {
  const snapshot = await createSnapshot();
  downloadFile(`گزارش-کتاب‌ها-و-نسخه‌های-فیزیکی-${new Date().toISOString().slice(0, 10)}.csv`, buildInventoryCsv(snapshot.stores.books, snapshot.stores.copies), 'text/csv;charset=utf-8');
}
