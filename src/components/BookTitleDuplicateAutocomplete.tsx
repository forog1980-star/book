import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, BookOpen, MapPin, X } from 'lucide-react';
import {
  BookCopyRecord,
  FieldAuditRecord,
  ReferenceCatalogRow,
  normalizePersianText,
  toPersianDigits
} from '../data/markazAsnadData';

export interface DuplicateCatalogSuggestion {
  key: string;
  tempBookId: string;
  titleRaw: string;
  publisherRaw: string;
  authorRaw: string;
  locationRaw: string;
  source: 'catalog' | 'outside-list';
  catalogRow?: ReferenceCatalogRow;
  isExactTitleMatch: boolean;
}

export function findMatchingCatalogBooksForTitle(
  titleInput: string,
  catalogRows: ReferenceCatalogRow[],
  auditRecords: Record<string, FieldAuditRecord> = {},
  bookCopies: BookCopyRecord[] = [],
  maxItems = 10
): DuplicateCatalogSuggestion[] {
  const q = normalizePersianText(titleInput);
  if (q.length < 2) return [];

  const qWords = q.split(/\s+/).filter(Boolean);
  const qCompact = q.replace(/\s+/g, '');

  const auditByBookId = new Map<string, FieldAuditRecord>();
  for (const rec of Object.values(auditRecords)) {
    if (rec?.tempBookId) {
      auditByBookId.set(rec.tempBookId, rec);
    }
  }

  const copyLocByBookId = new Map<string, string>();
  for (const cp of bookCopies) {
    if (cp?.bookId && cp.location && !copyLocByBookId.has(cp.bookId)) {
      copyLocByBookId.set(cp.bookId, cp.location);
    }
  }

  const candidates: { item: DuplicateCatalogSuggestion; score: number }[] = [];
  const seenIds = new Set<string>();

  const evaluateCandidate = (
    key: string,
    tempBookId: string,
    titleRaw: string,
    publisherRaw: string,
    authorRaw: string,
    locationRaw: string,
    source: 'catalog' | 'outside-list',
    catalogRow?: ReferenceCatalogRow
  ) => {
    const cleanTitle = titleRaw.trim();
    if (!cleanTitle) return;
    const normTitle = normalizePersianText(cleanTitle);
    const compactTitle = normTitle.replace(/\s+/g, '');

    const wordsMatch = qWords.length > 0 && qWords.every((w) => normTitle.includes(w));
    const compactMatch = qCompact.length >= 3 && compactTitle.includes(qCompact);
    if (!wordsMatch && !compactMatch) return;

    const isExact = normTitle === q || (qCompact.length >= 3 && compactTitle === qCompact);
    let score = source === 'catalog' ? 20 : 10;
    if (isExact) score += 150;
    else if (normTitle.startsWith(q)) score += 90;
    else if (normTitle.includes(q)) score += 55;
    else score += 25;

    candidates.push({
      item: {
        key,
        tempBookId,
        titleRaw: cleanTitle,
        publisherRaw: publisherRaw.trim(),
        authorRaw: authorRaw.trim(),
        locationRaw: locationRaw.trim(),
        source,
        catalogRow,
        isExactTitleMatch: isExact
      },
      score
    });
  };

  for (const row of catalogRows) {
    seenIds.add(row.tempBookId);
    const ov = auditRecords[row.rowKey] || auditByBookId.get(row.tempBookId);
    const loc =
      ov?.location ||
      (ov?.shelf && ov?.level ? `${ov.shelf}-${ov.level}` : ov?.shelf || '') ||
      copyLocByBookId.get(row.tempBookId) ||
      row.locationRaw ||
      '';
    evaluateCandidate(
      row.rowKey,
      row.tempBookId,
      ov?.title || row.titleRaw || '',
      ov?.publisher || row.publisherRaw || '',
      ov?.author || row.authorRaw || '',
      loc,
      'catalog',
      row
    );
  }

  for (const rec of Object.values(auditRecords)) {
    if (!rec?.tempBookId || seenIds.has(rec.tempBookId)) continue;
    seenIds.add(rec.tempBookId);
    const loc =
      rec.location ||
      (rec.shelf && rec.level ? `${rec.shelf}-${rec.level}` : rec.shelf || '') ||
      copyLocByBookId.get(rec.tempBookId) ||
      '';
    evaluateCandidate(
      rec.key,
      rec.tempBookId,
      rec.title || '',
      rec.publisher || '',
      rec.author || '',
      loc,
      rec.source === 'outside-list' ? 'outside-list' : 'catalog'
    );
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, maxItems).map((c) => c.item);
}

interface BookTitleDuplicateAutocompleteProps {
  titleQuery: string;
  catalogRows: ReferenceCatalogRow[];
  auditRecords?: Record<string, FieldAuditRecord>;
  bookCopies?: BookCopyRecord[];
  onSelectSuggestion?: (suggestion: DuplicateCatalogSuggestion) => void;
  actionLabel?: string;
  testIdPrefix?: string;
}

export const BookTitleDuplicateAutocomplete: React.FC<BookTitleDuplicateAutocompleteProps> = ({
  titleQuery,
  catalogRows,
  auditRecords = {},
  bookCopies = [],
  onSelectSuggestion,
  actionLabel = 'انتخاب کتاب موجود',
  testIdPrefix = 'title-autocomplete'
}) => {
  const [dismissedQuery, setDismissedQuery] = useState<string>('');

  const matches = useMemo(
    () => findMatchingCatalogBooksForTitle(titleQuery, catalogRows, auditRecords, bookCopies, 10),
    [titleQuery, catalogRows, auditRecords, bookCopies]
  );

  useEffect(() => {
    if (dismissedQuery && dismissedQuery !== titleQuery) {
      setDismissedQuery('');
    }
  }, [titleQuery, dismissedQuery]);

  if (matches.length === 0 || dismissedQuery === titleQuery) {
    return null;
  }

  const hasExactMatch = matches.some((m) => m.isExactTitleMatch);

  return (
    <div
      data-testid={`${testIdPrefix}-dropdown`}
      className={`mt-1.5 rounded-xl border overflow-hidden shadow-sm text-xs ${
        hasExactMatch
          ? 'bg-rose-50/70 border-rose-300'
          : 'bg-amber-50/70 border-amber-300'
      }`}
    >
      <div
        className={`px-3 py-2 flex items-center justify-between gap-2 border-b ${
          hasExactMatch
            ? 'bg-rose-100/80 border-rose-200 text-rose-900'
            : 'bg-amber-100/70 border-amber-200 text-amber-900'
        }`}
      >
        <div className="flex items-center gap-1.5 font-bold min-w-0">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="leading-snug">
            {hasExactMatch
              ? `هشدار کتاب تکراری: عنوان مشابه در کاتالوگ موجود است (${toPersianDigits(matches.length)} پیشنهاد)`
              : `پیشنهادهای مشابه در کاتالوگ مرجع (${toPersianDigits(matches.length)} مورد) — برای جلوگیری از تکرار بررسی کنید`}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setDismissedQuery(titleQuery)}
          aria-label="بستن پیشنهادهای مشابه"
          className="w-6 h-6 rounded-lg hover:bg-black/10 flex items-center justify-center shrink-0 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="max-h-52 overflow-y-auto divide-y divide-slate-200/80 bg-white">
        {matches.map((item) => (
          <div
            key={item.key}
            data-testid={`${testIdPrefix}-item-${item.tempBookId}`}
            className={`px-3 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
              item.isExactTitleMatch ? 'bg-rose-50/60' : 'hover:bg-[#FAF5EE]'
            }`}
          >
            <div className="min-w-0 space-y-0.5">
              <div className="font-bold text-slate-900 flex flex-wrap items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-[#6B3E26] shrink-0" />
                <span className="break-words">{item.titleRaw}</span>
                {item.isExactTitleMatch && (
                  <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold shrink-0">
                    تطابق دقیق
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-mono font-bold text-[#1f4e79]" dir="ltr">
                  {item.tempBookId}
                </span>
                <span>·</span>
                <span>{item.source === 'catalog' ? 'کاتالوگ مرجع' : 'ثبت جدید قبلی'}</span>
                {item.publisherRaw && (
                  <>
                    <span>·</span>
                    <span>ناشر: {item.publisherRaw}</span>
                  </>
                )}
                {item.authorRaw && (
                  <>
                    <span>·</span>
                    <span>{item.authorRaw}</span>
                  </>
                )}
                {item.locationRaw && (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-0.5 font-semibold text-[#6B3E26]">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span>قفسه {toPersianDigits(item.locationRaw)}</span>
                    </span>
                  </>
                )}
              </div>
            </div>

            {onSelectSuggestion && (
              <button
                type="button"
                onClick={() => onSelectSuggestion(item)}
                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#1f4e79] hover:bg-[#163a5b] text-white text-[11px] font-bold inline-flex items-center justify-center gap-1 shrink-0 cursor-pointer transition-colors"
              >
                <span>{actionLabel}</span>
                <ArrowLeft className="w-3 h-3 shrink-0" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
