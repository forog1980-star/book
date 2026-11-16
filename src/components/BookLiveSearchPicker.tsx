import React, { useMemo, useRef, useState } from 'react';
import { BookOpen, MapPin, Search, X } from 'lucide-react';
import {
  BookCopyRecord,
  FieldAuditRecord,
  ReferenceCatalogRow,
  normalizePersianText,
  toPersianDigits
} from '../data/markazAsnadData';

export interface LinkableBookOption {
  key: string;
  tempBookId: string;
  titleRaw: string;
  publisherRaw: string;
  authorRaw: string;
  locationRaw: string;
  registrationNoRaw: string;
  source: 'catalog' | 'outside-list';
  normalizedTitle: string;
  normalizedId: string;
  normalizedLocation: string;
  searchable: string;
}

function buildShelfAliases(locationText: string, shelf?: string, level?: string): string[] {
  const combined = `${locationText || ''} ${shelf || ''} ${level || ''}`;
  const norm = normalizePersianText(combined);
  if (!norm) return [];

  const tokens = new Set<string>([norm]);

  // Extract SH-01 / SH-1 / قفسه 1 / قفسه 01 patterns
  const shMatches = norm.matchAll(/(?:sh|قفسه)[-\s]*0?(\d+)/gi);
  for (const m of shMatches) {
    const num = String(Number(m[1]));
    const padded = num.padStart(2, '0');
    tokens.add(`sh-${padded}`);
    tokens.add(`sh-${num}`);
    tokens.add(`sh${padded}`);
    tokens.add(`sh${num}`);
    tokens.add(`قفسه ${num}`);
    tokens.add(`قفسه ${padded}`);
    tokens.add(`قفسه${num}`);
    tokens.add(`شماره قفسه ${num}`);
    tokens.add(padded);
    tokens.add(num);
  }

  // Extract T01 / T1 / طبقه 1 patterns
  const levelMatches = norm.matchAll(/(?:t|طبقه)[-\s]*0?(\d+)/gi);
  for (const m of levelMatches) {
    const num = String(Number(m[1]));
    const padded = num.padStart(2, '0');
    tokens.add(`t${padded}`);
    tokens.add(`t${num}`);
    tokens.add(`t-${padded}`);
    tokens.add(`طبقه ${num}`);
    tokens.add(`طبقه ${padded}`);
  }

  return Array.from(tokens);
}

export function buildLinkableBookOptions(
  catalogRows: ReferenceCatalogRow[],
  auditRecords: Record<string, FieldAuditRecord> = {},
  bookCopies: BookCopyRecord[] = []
): LinkableBookOption[] {
  const auditByBookId = new Map<string, FieldAuditRecord>();
  for (const rec of Object.values(auditRecords)) {
    if (rec?.tempBookId) {
      auditByBookId.set(rec.tempBookId, rec);
    }
  }

  const copyLocationsByBookId = new Map<string, { locations: string[]; shelves: string[]; levels: string[] }>();
  for (const cp of bookCopies) {
    if (!cp?.bookId) continue;
    const entry = copyLocationsByBookId.get(cp.bookId) || {
      locations: [],
      shelves: [],
      levels: []
    };
    if (cp.location && !entry.locations.includes(cp.location)) entry.locations.push(cp.location);
    if (cp.shelf && !entry.shelves.includes(cp.shelf)) entry.shelves.push(cp.shelf);
    if (cp.level && !entry.levels.includes(cp.level)) entry.levels.push(cp.level);
    copyLocationsByBookId.set(cp.bookId, entry);
  }

  const list: LinkableBookOption[] = [];
  const seenIds = new Set<string>();

  for (const row of catalogRows) {
    const ov = auditRecords[row.rowKey] || auditByBookId.get(row.tempBookId);
    const copyMeta = copyLocationsByBookId.get(row.tempBookId);

    const titleRaw = (ov?.title || row.titleRaw || '').trim();
    const publisherRaw = (ov?.publisher || row.publisherRaw || '').trim();
    const authorRaw = (ov?.author || row.authorRaw || '').trim();
    const shelfPart = ov?.shelf || copyMeta?.shelves[0] || '';
    const levelPart = ov?.level || copyMeta?.levels[0] || '';
    const derivedLoc =
      ov?.location ||
      (shelfPart && levelPart ? `${shelfPart}-${levelPart}` : shelfPart) ||
      copyMeta?.locations[0] ||
      row.locationRaw ||
      '';
    const locationRaw = derivedLoc.trim();
    const registrationNoRaw = (ov?.registrationNo || row.registrationNoRaw || '').trim();

    const allLocs = [locationRaw, row.locationRaw, ...(copyMeta?.locations || [])].filter(Boolean).join(' ');
    const shelfAliases = buildShelfAliases(
      allLocs,
      [ov?.shelf, ...(copyMeta?.shelves || [])].filter(Boolean).join(' '),
      [ov?.level, ...(copyMeta?.levels || [])].filter(Boolean).join(' ')
    );

    seenIds.add(row.tempBookId);
    list.push({
      key: row.rowKey,
      tempBookId: row.tempBookId,
      titleRaw,
      publisherRaw,
      authorRaw,
      locationRaw,
      registrationNoRaw,
      source: 'catalog',
      normalizedTitle: normalizePersianText(titleRaw),
      normalizedId: normalizePersianText(row.tempBookId),
      normalizedLocation: normalizePersianText(`${allLocs} ${shelfAliases.join(' ')}`),
      searchable: normalizePersianText(
        `${row.tempBookId} ${titleRaw} ${publisherRaw} ${authorRaw} ${registrationNoRaw} ${allLocs} ${shelfAliases.join(' ')}`
      )
    });
  }

  for (const rec of Object.values(auditRecords)) {
    if (!rec?.tempBookId || seenIds.has(rec.tempBookId)) continue;
    seenIds.add(rec.tempBookId);
    const copyMeta = copyLocationsByBookId.get(rec.tempBookId);
    const titleRaw = (rec.title || '').trim();
    const publisherRaw = (rec.publisher || '').trim();
    const authorRaw = (rec.author || '').trim();
    const shelfPart = rec.shelf || copyMeta?.shelves[0] || '';
    const levelPart = rec.level || copyMeta?.levels[0] || '';
    const locationRaw = (
      rec.location ||
      (shelfPart && levelPart ? `${shelfPart}-${levelPart}` : shelfPart) ||
      copyMeta?.locations[0] ||
      ''
    ).trim();
    const registrationNoRaw = (rec.registrationNo || '').trim();
    const allLocs = [locationRaw, ...(copyMeta?.locations || [])].filter(Boolean).join(' ');
    const shelfAliases = buildShelfAliases(
      allLocs,
      [rec.shelf, ...(copyMeta?.shelves || [])].filter(Boolean).join(' '),
      [rec.level, ...(copyMeta?.levels || [])].filter(Boolean).join(' ')
    );

    list.push({
      key: rec.key,
      tempBookId: rec.tempBookId,
      titleRaw: titleRaw || rec.tempBookId,
      publisherRaw,
      authorRaw,
      locationRaw,
      registrationNoRaw,
      source: rec.source === 'outside-list' ? 'outside-list' : 'catalog',
      normalizedTitle: normalizePersianText(titleRaw || rec.tempBookId),
      normalizedId: normalizePersianText(rec.tempBookId),
      normalizedLocation: normalizePersianText(`${allLocs} ${shelfAliases.join(' ')}`),
      searchable: normalizePersianText(
        `${rec.tempBookId} ${titleRaw} ${publisherRaw} ${authorRaw} ${registrationNoRaw} ${allLocs} ${shelfAliases.join(' ')}`
      )
    });
  }

  return list;
}

export function filterAndRankLinkableBooks(
  books: LinkableBookOption[],
  rawQuery: string
): LinkableBookOption[] {
  const q = normalizePersianText(rawQuery);
  if (!q) return books;
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length === 0) return books;

  const scored: { item: LinkableBookOption; score: number }[] = [];
  for (const item of books) {
    if (!words.every((w) => item.searchable.includes(w))) continue;
    let score = 10;
    if (item.normalizedTitle === q) score += 120;
    else if (item.normalizedTitle.startsWith(q)) score += 80;
    else if (item.normalizedTitle.includes(q)) score += 45;

    if (item.normalizedLocation && item.normalizedLocation.includes(q)) score += 60;
    if (item.normalizedId === q || item.normalizedId.includes(q)) score += 50;

    scored.push({ item, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}

interface BookLiveSearchPickerProps {
  books: LinkableBookOption[];
  selectedBookId: string;
  onSelectBook: (bookId: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
  label?: string;
  placeholder?: string;
  inputTestId?: string;
  listTestId?: string;
  bannerTestId?: string;
  maxResults?: number;
}

export const BookLiveSearchPicker: React.FC<BookLiveSearchPickerProps> = ({
  books,
  selectedBookId,
  onSelectBook,
  query,
  onQueryChange,
  label = 'جست‌وجوی زنده و انتخاب کتاب (نام کتاب یا شماره قفسه):',
  placeholder = 'بخشی از نام کتاب، شماره قفسه (مثل SH-01 یا قفسه ۱) یا کد BK را تایپ کنید...',
  inputTestId = 'link-book-search-input',
  listTestId = 'link-book-options-list',
  bannerTestId = 'selected-book-for-link-banner',
  maxResults = 60
}) => {
  const [showBrowseList, setShowBrowseList] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selectedBook = useMemo(
    () => books.find((b) => b.tempBookId === selectedBookId) || null,
    [books, selectedBookId]
  );

  const filteredBooks = useMemo(
    () => filterAndRankLinkableBooks(books, query),
    [books, query]
  );

  const trimmedQuery = query.trim();
  const shouldShowResults = trimmedQuery.length > 0 || showBrowseList;
  const visibleResults = filteredBooks.slice(0, maxResults);

  const handlePickBook = (book: LinkableBookOption) => {
    onSelectBook(book.tempBookId);
    onQueryChange('');
    setShowBrowseList(false);
  };

  const handleClearSelectionAndFocus = () => {
    onSelectBook('');
    onQueryChange('');
    setShowBrowseList(false);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <label className="block font-bold text-slate-700">{label}</label>
        <span className="text-[11px] text-slate-500 tabular-nums">
          {trimmedQuery
            ? `${toPersianDigits(filteredBooks.length)} نتیجه از ${toPersianDigits(books.length)} کتاب`
            : `جست‌وجوی زنده در ${toPersianDigits(books.length)} کتاب`}
        </span>
      </div>

      {selectedBook && (
        <div
          data-testid={bannerTestId}
          className="rounded-xl bg-[#EDF6F0] border border-[#96CFA8] px-3 py-2.5 text-[#1E4D2B] flex items-start justify-between gap-2.5"
        >
          <div className="min-w-0 space-y-0.5">
            <div className="font-bold break-words flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-[#2E6F40] shrink-0" />
              <span>{selectedBook.titleRaw}</span>
            </div>
            <div className="text-[11px] text-[#2E6F40] flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-mono font-bold" dir="ltr">
                {selectedBook.tempBookId}
              </span>
              <span>·</span>
              <span>قفسه: {selectedBook.locationRaw ? toPersianDigits(selectedBook.locationRaw) : 'ثبت‌نشده'}</span>
              {selectedBook.publisherRaw && (
                <>
                  <span>·</span>
                  <span>ناشر: {selectedBook.publisherRaw}</span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleClearSelectionAndFocus}
            className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#FAF5EE] border border-[#96CFA8] text-[#1E4D2B] text-[11px] font-bold shrink-0 cursor-pointer transition-colors"
          >
            تغییر کتاب
          </button>
        </div>
      )}

      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          data-testid={inputTestId}
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
            if (e.target.value.trim()) {
              setShowBrowseList(false);
            }
          }}
          placeholder={placeholder}
          className="w-full min-h-[42px] pr-9 pl-9 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#1f4e79]/25 focus:border-[#1f4e79]"
        />
        {query && (
          <button
            type="button"
            aria-label="پاک‌کردن جست‌وجوی کتاب"
            onClick={() => {
              onQueryChange('');
              inputRef.current?.focus();
            }}
            className="w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-100 flex items-center justify-center absolute left-1.5 top-1/2 -translate-y-1/2 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {!shouldShowResults ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
          <span>
            {selectedBook
              ? 'برای جایگزینی کتاب فعلی، نام کتاب یا شماره قفسه جدید را در کادر بالا تایپ کنید.'
              : 'با تایپ بخشی از نام کتاب، شماره قفسه (مثلاً SH-01 یا قفسه ۱) یا کد BK، کتاب‌ها به‌صورت آنی نمایش داده می‌شوند.'}
          </span>
          <button
            type="button"
            onClick={() => setShowBrowseList(true)}
            className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold shrink-0 cursor-pointer"
          >
            نمایش فهرست سریع
          </button>
        </div>
      ) : (
        <div
          data-testid={listTestId}
          className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white divide-y divide-slate-200/80 shadow-xs"
        >
          {visibleResults.length === 0 ? (
            <div className="p-4 text-center text-[11px] text-slate-500">
              کتابی با عبارت «{query}» یافت نشد. می‌توانید بخشی دیگر از عنوان، شماره قفسه (مثلاً SH-01) یا شناسه BK را امتحان کنید.
            </div>
          ) : (
            visibleResults.map((b) => {
              const isSelected = b.tempBookId === selectedBookId;
              return (
                <button
                  key={b.key}
                  type="button"
                  data-testid={`link-book-option-${b.tempBookId}`}
                  onClick={() => handlePickBook(b)}
                  className={`w-full text-right px-3 py-2.5 transition-colors flex items-start justify-between gap-2.5 cursor-pointer ${
                    isSelected
                      ? 'bg-[#EDF6F0] text-[#1E4D2B]'
                      : 'bg-white hover:bg-[#FAF5EE] text-slate-800'
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="font-bold text-xs break-words">{b.titleRaw}</div>
                    <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>{b.publisherRaw || 'ناشر ثبت‌نشده'}</span>
                      {b.authorRaw && (
                        <>
                          <span>·</span>
                          <span>{b.authorRaw}</span>
                        </>
                      )}
                      {b.locationRaw && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center gap-0.5 font-semibold text-[#6B3E26]">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span>قفسه {toPersianDigits(b.locationRaw)}</span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10.5px] font-mono shrink-0 ${
                      isSelected
                        ? 'bg-[#2E6F40] text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                    dir="ltr"
                  >
                    {b.tempBookId}
                  </span>
                </button>
              );
            })
          )}
          {showBrowseList && !trimmedQuery && (
            <div className="px-3 py-2 bg-slate-50 flex items-center justify-between text-[11px] text-slate-500">
              <span>برای یافتن دقیق‌تر، بخشی از نام کتاب یا شماره قفسه را تایپ کنید.</span>
              <button
                type="button"
                onClick={() => setShowBrowseList(false)}
                className="text-slate-700 font-bold hover:underline cursor-pointer"
              >
                بستن فهرست
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
