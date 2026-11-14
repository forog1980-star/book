import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Download,
  FilePlus2,
  FileText,
  History,
  Search,
  UserCheck,
  X,
} from 'lucide-react';
import { toPersianDigits } from '../../../data/markazAsnadData';
import { normalizePersian } from '../normalization';
import type {
  DrilldownActivityLogRow,
  DrilldownBankMartyrRow,
  DrilldownSelectionResult,
} from '../selectors/drilldownListsSelector';
import type {
  DashboardBookListItem,
  DashboardMartyrListItem,
  ExecutiveExportHistoryRecord,
  FinalizedReportRegistryRecord,
} from '../types';

interface DashboardDrilldownListViewProps {
  selection: DrilldownSelectionResult;
  searchQuery: string;
  subFilter: string;
  initialScrollTop: number;
  backLabel?: string;
  onChangeSearch: (q: string) => void;
  onChangeSubFilter: (filter: string) => void;
  onBackToDashboard: () => void;
  onOpenOriginalBook: (book: DashboardBookListItem) => void;
  onOpenOriginalMartyr: (martyr: DashboardMartyrListItem) => void;
  onRegenerateReport?: (record: ExecutiveExportHistoryRecord) => void;
  onFinalizeRegistryReport?: (reportId: string) => void;
  onExportNewVersionForReport?: (
    record: FinalizedReportRegistryRecord,
    fileType: 'excel' | 'json'
  ) => void;
}

const PAGE_STEP = 60;

export const DashboardDrilldownListView: React.FC<
  DashboardDrilldownListViewProps
> = ({
  selection,
  searchQuery,
  subFilter,
  initialScrollTop,
  backLabel = 'بازگشت به داشبورد',
  onChangeSearch,
  onChangeSubFilter,
  onBackToDashboard,
  onOpenOriginalBook,
  onOpenOriginalMartyr,
  onRegenerateReport,
  onFinalizeRegistryReport,
  onExportNewVersionForReport,
}) => {
  const [visibleLimit, setVisibleLimit] = useState<number>(PAGE_STEP);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);

  useEffect(() => {
    setVisibleLimit(PAGE_STEP);
    setExpandedReportId(null);
  }, [selection.meta.key, searchQuery, subFilter]);

  useEffect(() => {
    if (typeof window !== 'undefined' && initialScrollTop > 0) {
      const targetY = initialScrollTop;
      const timer = window.setTimeout(() => {
        window.scrollTo({ top: targetY, behavior: 'auto' });
      }, 45);
      return () => window.clearTimeout(timer);
    }
  }, [selection.meta.key, initialScrollTop]);

  const normQuery = useMemo(() => normalizePersian(searchQuery), [searchQuery]);

  const subFilterOptions = useMemo((): Array<{ id: string; label: string }> => {
    const key = selection.meta.key;
    if (key === 'library_remaining') {
      return [
        { id: 'all', label: 'همه باقی‌مانده‌ها' },
        { id: 'in_progress', label: 'در حال بررسی' },
        { id: 'not_started', label: 'شروع‌نشده' },
        { id: 'open_duplicate_ticket', label: 'دارای تیکت باز تکرار عنوان' },
      ];
    }
    if (key === 'work_remaining' || key === 'work_completed' || key === 'work_all') {
      return [
        { id: 'all', label: 'همه موارد' },
        { id: 'books_sheet', label: 'فهرست کتاب‌ها' },
        { id: 'links_sheet', label: 'ارتباط کتاب و شهید' },
      ];
    }
    if (key === 'activity_logs') {
      return [
        { id: 'all', label: 'همه حوزه‌ها' },
        { id: 'library', label: 'کتابخانه' },
        { id: 'martyrs_relations', label: 'شهدا و ارتباطات' },
        { id: 'work_outputs', label: 'صف و خروجی‌ها' },
        { id: 'other', label: 'سایر / پشتیبان' },
      ];
    }
    if (key === 'research_outputs') {
      return [
        { id: 'all', label: 'همه خروجی‌ها' },
        { id: 'expert', label: 'تأییدشده کارشناسی' },
        { id: 'needs_review', label: 'نیازمند بررسی' },
      ];
    }
    if (selection.kind === 'management_reports') {
      return [
        { id: 'all', label: 'همه فایل‌ها' },
        { id: 'excel', label: 'اکسل' },
        { id: 'json', label: 'JSON' },
      ];
    }
    return [];
  }, [selection.meta.key, selection.kind]);

  const filteredItems = useMemo(() => {
    if (selection.kind === 'books') {
      return selection.items.filter((b) => {
        if (selection.meta.key === 'library_remaining' && subFilter !== 'all') {
          if (subFilter === 'in_progress' && b.lifecycleStage !== 'in_progress') return false;
          if (subFilter === 'not_started' && b.lifecycleStage !== 'not_started') return false;
          if (
            subFilter === 'open_duplicate_ticket' &&
            b.managerialStatus !== 'open_duplicate_ticket'
          ) {
            return false;
          }
        }
        if (!normQuery) return true;
        const hay = normalizePersian(
          `${b.tempBookId} ${b.title} ${b.publisher} ${b.author} ${b.locationDisplay} ${b.openTicketIds.join(' ')}`
        );
        return hay.includes(normQuery);
      });
    }

    if (selection.kind === 'martyrs') {
      return selection.items.filter((m) => {
        if (!normQuery) return true;
        const hay = normalizePersian(
          `${m.displayCode} ${m.fullName} ${m.fatherName} ${m.graveAddress} ${m.linkedBooks
            .map((lb) => `${lb.bookTitle} ${lb.tempBookId}`)
            .join(' ')}`
        );
        return hay.includes(normQuery);
      });
    }

    if (selection.kind === 'bank_martyrs') {
      return selection.items.filter((m) => {
        if (!normQuery) return true;
        const hay = normalizePersian(
          `${m.id} ${m.fullName} ${m.fatherName} ${m.graveAddress} ${m.sourceLabel}`
        );
        return hay.includes(normQuery);
      });
    }

    if (selection.kind === 'relations') {
      return selection.items.filter(({ relation }) => {
        if (!normQuery) return true;
        const hay = normalizePersian(
          `${relation.linkId} ${relation.tempBookId} ${relation.bookTitle} ${relation.martyrName} ${relation.graveAddress} ${relation.reviewStatus} ${relation.sourceDescriptionRaw}`
        );
        return hay.includes(normQuery);
      });
    }

    if (selection.kind === 'work') {
      return selection.items.filter((row) => {
        if (subFilter === 'books_sheet' && row.item.mainSheet !== 'فهرست کتاب‌ها') {
          return false;
        }
        if (subFilter === 'links_sheet' && row.item.mainSheet !== 'ارتباط کتاب و شهید') {
          return false;
        }
        if (!normQuery) return true;
        const hay = normalizePersian(
          `${row.item.trackingId} ${row.item.mainRecordId} ${row.item.bookTitle} ${row.item.nameOrPhrase} ${row.item.issueSubject} ${row.item.suggestedAction} ${row.activityTypeLabel}`
        );
        return hay.includes(normQuery);
      });
    }

    if (selection.kind === 'activity_logs') {
      return selection.items.filter((row) => {
        if (subFilter !== 'all' && row.domain !== subFilter) return false;
        if (!normQuery) return true;
        const hay = normalizePersian(
          `${row.entry.id} ${row.entry.actionType} ${row.domainLabel} ${row.entry.targetId} ${row.entry.actorName} ${row.entry.summary} ${row.entry.timestamp}`
        );
        return hay.includes(normQuery);
      });
    }

    if (selection.kind === 'research_outputs') {
      return selection.items.filter(({ item }) => {
        const revNorm = normalizePersian(item.reviewStatus);
        if (subFilter === 'expert' && revNorm !== 'تاییدشده کارشناسی') return false;
        if (subFilter === 'needs_review' && !revNorm.includes('نیازمند')) return false;
        if (!normQuery) return true;
        const hay = normalizePersian(
          `${item.id} ${item.tempBookId} ${item.bookTitleRaw} ${item.martyrNameRaw} ${item.passageTitle} ${item.contentType} ${item.pageReferenceRaw} ${item.extractedText}`
        );
        return hay.includes(normQuery);
      });
    }

    if (selection.kind === 'finalized_reports') {
      return selection.items.filter((rep) => {
        if (!normQuery) return true;
        const hay = normalizePersian(
          `${rep.reportId} ${rep.title} ${rep.appliedFiltersSummary} ${rep.versions
            .map((v) => v.fileName)
            .join(' ')}`
        );
        return hay.includes(normQuery);
      });
    }

    return selection.items.filter((rec) => {
      if (subFilter !== 'all' && rec.fileType !== subFilter) return false;
      if (!normQuery) return true;
      const hay = normalizePersian(
        `${rec.exportId} ${rec.fileName} ${rec.appliedFiltersSummary} ${rec.timestampDisplay}`
      );
      return hay.includes(normQuery);
    });
  }, [selection, subFilter, normQuery]);

  const totalCount = selection.items.length;
  const filteredCount = filteredItems.length;
  const visibleSlice = filteredItems.slice(0, visibleLimit);

  return (
    <div
      data-testid="executive-drilldown-view"
      data-drilldown-key={selection.meta.key}
      className="max-w-6xl mx-auto px-3 sm:px-6 pt-3 pb-10 space-y-5 text-[#332218]"
    >
      {/* Header */}
      <header className="bg-white border border-[#E5D7C6] rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <div className="text-xs text-[#78604E]">
              داشبورد مدیریتی ← بخش {selection.meta.sourceCardLabel}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold text-[#332218]">
                {selection.meta.title}
              </h2>
              <span
                data-testid="drilldown-total-count"
                className="text-xs font-bold text-[#6B3E26] bg-[#FAF5EE] border border-[#E5D7C6] rounded-lg px-2.5 py-0.5 tabular-nums"
              >
                {toPersianDigits(totalCount)} مورد
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#5C4636] leading-relaxed">
              {selection.meta.subtitle}
            </p>
          </div>

          <button
            type="button"
            data-testid="drilldown-back-to-dashboard-btn"
            onClick={onBackToDashboard}
            className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl bg-[#6B3E26] hover:bg-[#56311E] text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors shrink-0"
          >
            <ArrowRight className="w-4 h-4 shrink-0" />
            <span>{backLabel}</span>
          </button>
        </div>

        <div className="text-[11px] text-[#78604E] border-t border-[#EFE4D6] pt-2.5">
          {selection.meta.dataSourceNote}
        </div>
      </header>

      {/* جست‌وجو و فیلترهای فرعی */}
      {totalCount > 0 && (
        <div className="bg-white border border-[#E5D7C6] rounded-2xl p-3.5 sm:p-4 space-y-3">
          <div className="relative">
            <Search
              className="w-4 h-4 text-[#78604E] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              data-testid="drilldown-search-input"
              value={searchQuery}
              onChange={(e) => onChangeSearch(e.target.value)}
              placeholder="جست‌وجو بر اساس شناسه، عنوان کتاب، نام شهید یا موضوع..."
              className="w-full min-h-[44px] pr-9 pl-9 py-2 rounded-xl bg-[#FAF5EE] border border-[#DFC9AE] text-xs sm:text-sm text-[#332218] placeholder:text-[#8F7762] focus:outline-none focus:ring-2 focus:ring-[#6B3E26]/30 focus:border-[#6B3E26]"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="پاک‌کردن جست‌وجو"
                onClick={() => onChangeSearch('')}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-[#78604E] hover:text-[#332218] hover:bg-[#EFE4D6] absolute left-1.5 top-1/2 -translate-y-1/2 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {subFilterOptions.length > 0 && (
            <div
              className="flex flex-wrap items-center gap-2"
              role="group"
              aria-label="فیلتر فرعی فهرست"
            >
              {subFilterOptions.map((opt) => {
                const active = subFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    data-testid={`drilldown-subfilter-${opt.id}`}
                    onClick={() => onChangeSubFilter(opt.id)}
                    className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#F3E4D2] border-[#6B3E26] text-[#6B3E26]'
                        : 'bg-[#FAF5EE] border-[#E5D7C6] text-[#5C4636] hover:bg-[#F3E4D2]/50'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}

          {(normQuery || subFilter !== 'all') && (
            <div className="text-xs text-[#78604E] tabular-nums">
              نتیجه فیلتر: {toPersianDigits(filteredCount)} از {toPersianDigits(totalCount)} مورد
            </div>
          )}
        </div>
      )}

      {/* حالت نبود داده */}
      {totalCount === 0 && (
        <div
          data-testid="drilldown-empty-unavailable"
          className="bg-white border border-[#E5D7C6] rounded-2xl p-6 sm:p-8 text-center space-y-2"
        >
          <div className="text-base font-bold text-[#332218]">
            اطلاعات جزئیات در دسترس نیست
          </div>
          <p className="text-xs sm:text-sm text-[#5C4636] leading-relaxed max-w-xl mx-auto">
            {selection.emptyReason}
          </p>
        </div>
      )}

      {/* حالت جست‌وجو بدون نتیجه */}
      {totalCount > 0 && filteredCount === 0 && (
        <div
          data-testid="drilldown-no-search-match"
          className="bg-white border border-[#E5D7C6] rounded-2xl p-6 text-center space-y-3"
        >
          <p className="text-sm font-bold text-[#332218]">
            موردی مطابق عبارت جست‌وجو یا فیلتر انتخاب‌شده یافت نشد.
          </p>
          <button
            type="button"
            onClick={() => {
              onChangeSearch('');
              onChangeSubFilter('all');
            }}
            className="min-h-[40px] px-4 py-1.5 rounded-xl bg-[#FAF5EE] border border-[#DFC9AE] text-xs font-bold text-[#6B3E26] hover:bg-[#F3E4D2] cursor-pointer"
          >
            پاک‌کردن جست‌وجو و فیلتر
          </button>
        </div>
      )}

      {/* فهرست ۱: کتاب‌ها */}
      {selection.kind === 'books' && filteredCount > 0 && (
        <div data-testid="drilldown-list-books" className="space-y-3">
          {(visibleSlice as DashboardBookListItem[]).map((book) => (
            <article
              key={book.bookKey}
              data-testid={`drilldown-book-item-${book.tempBookId}`}
              className="bg-white border border-[#E5D7C6] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="font-mono text-xs font-bold bg-[#FAF5EE] border border-[#E5D7C6] text-[#6B3E26] px-2 py-0.5 rounded-md"
                    dir="ltr"
                  >
                    {book.tempBookId}
                  </span>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                      book.isStrictCompleted
                        ? 'bg-[#EDF6F0] border-[#BBDCC6] text-[#2E6F40]'
                        : book.lifecycleStage === 'in_progress'
                        ? 'bg-[#FDF4E7] border-[#E9CA9F] text-[#8A4B16]'
                        : 'bg-[#FAF5EE] border-[#E5D7C6] text-[#5C4636]'
                    }`}
                  >
                    {book.isStrictCompleted
                      ? 'تکمیل‌شده کامل'
                      : book.lifecycleStage === 'in_progress'
                      ? 'در حال بررسی'
                      : 'شروع‌نشده'}
                  </span>
                  {book.openTicketIds.length > 0 && (
                    <span className="font-mono text-[11px] font-bold text-[#8A4B16]" dir="ltr">
                      {book.openTicketIds.join(', ')}
                    </span>
                  )}
                </div>

                <h3 className="text-sm sm:text-base font-bold text-[#332218] break-words">
                  {book.title}
                </h3>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#5C4636]">
                  {book.publisher && <span>ناشر: {book.publisher}</span>}
                  {book.author && <span>نویسنده/گردآورنده: {book.author}</span>}
                  {book.locationDisplay && <span>محل قفسه: {book.locationDisplay}</span>}
                  {book.relations.length > 0 && (
                    <span className="tabular-nums text-[#2E6F40] font-medium">
                      {toPersianDigits(book.relations.length)} ارتباط ثبت‌شده
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                data-testid={`open-book-dossier-${book.tempBookId}`}
                onClick={() => onOpenOriginalBook(book)}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl bg-[#6B3E26] hover:bg-[#56311E] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors shrink-0"
              >
                <BookOpen className="w-4 h-4 shrink-0" />
                <span>مشاهده پرونده کتاب</span>
              </button>
            </article>
          ))}
        </div>
      )}

      {/* فهرست ۲: شهدا */}
      {selection.kind === 'martyrs' && filteredCount > 0 && (
        <div data-testid="drilldown-list-martyrs" className="space-y-3">
          {(visibleSlice as DashboardMartyrListItem[]).map((martyr) => (
            <article
              key={martyr.martyrKey}
              data-testid={`drilldown-martyr-item-${martyr.displayCode}`}
              className="bg-white border border-[#E5D7C6] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="font-mono text-xs font-bold bg-[#FAF5EE] border border-[#E5D7C6] text-[#6B3E26] px-2 py-0.5 rounded-md"
                    dir="ltr"
                  >
                    {martyr.displayCode}
                  </span>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                      martyr.identityStatus === 'confirmed'
                        ? 'bg-[#EDF6F0] border-[#BBDCC6] text-[#2E6F40]'
                        : 'bg-[#FDF4E7] border-[#E9CA9F] text-[#8A4B16]'
                    }`}
                  >
                    {martyr.identityStatusLabel}
                  </span>
                  {martyr.hasExpertConfirmedRelation && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md border bg-[#EDF6F0] border-[#BBDCC6] text-[#2E6F40]">
                      دارای ارتباط تأییدشده کارشناسی
                    </span>
                  )}
                </div>

                <h3 className="text-sm sm:text-base font-bold text-[#332218]">
                  {martyr.fullName}
                </h3>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#5C4636]">
                  {martyr.fatherName && <span>فرزند: {martyr.fatherName}</span>}
                  <span>مزار: {martyr.graveAddress || 'فاقد مختصات دقیق مزار'}</span>
                  <span className="tabular-nums">
                    مرتبط با {toPersianDigits(martyr.linkedBooksCount)} کتاب
                  </span>
                </div>

                {martyr.homonymCountInBank > 1 && (
                  <p className="text-[11px] text-[#8A4B16]">
                    در بانک گلزار {toPersianDigits(martyr.homonymCountInBank)} رکورد هم‌نام وجود دارد؛ تفکیک قطعی در پرونده شهید انجام می‌شود.
                  </p>
                )}

                {martyr.linkedBooks.length > 0 && (
                  <div className="text-[11px] text-[#78604E] truncate">
                    کتاب‌ها:{' '}
                    {martyr.linkedBooks
                      .slice(0, 3)
                      .map((lb) => lb.bookTitle)
                      .join('، ')}
                    {martyr.linkedBooks.length > 3 ? ' ...' : ''}
                  </div>
                )}
              </div>

              <button
                type="button"
                data-testid={`open-martyr-dossier-${martyr.displayCode}`}
                onClick={() => onOpenOriginalMartyr(martyr)}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl bg-[#6B3E26] hover:bg-[#56311E] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors shrink-0"
              >
                <UserCheck className="w-4 h-4 shrink-0" />
                <span>مشاهده پرونده شهید</span>
              </button>
            </article>
          ))}
        </div>
      )}

      {/* فهرست ۲-ب: شناسه‌های بانک رسمی و دستی */}
      {selection.kind === 'bank_martyrs' && filteredCount > 0 && (
        <div data-testid="drilldown-list-bank-martyrs" className="space-y-3">
          {(visibleSlice as DrilldownBankMartyrRow[]).map((row) => (
            <article
              key={row.id}
              className="bg-white border border-[#E5D7C6] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="font-mono text-xs font-bold bg-[#FAF5EE] border border-[#E5D7C6] text-[#6B3E26] px-2 py-0.5 rounded-md"
                    dir="ltr"
                  >
                    {row.id}
                  </span>
                  <span className="text-[11px] text-[#5C4636]">{row.sourceLabel}</span>
                </div>
                <h3 className="text-sm sm:text-base font-bold text-[#332218]">
                  {row.fullName}
                </h3>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#5C4636]">
                  <span>فرزند: {row.fatherName}</span>
                  <span>مزار: {row.graveAddress}</span>
                </div>
              </div>
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-lg border shrink-0 ${
                  row.isLinkedToBook
                    ? 'bg-[#EDF6F0] border-[#BBDCC6] text-[#2E6F40]'
                    : 'bg-[#FAF5EE] border-[#E5D7C6] text-[#5C4636]'
                }`}
              >
                {row.isLinkedToBook ? 'دارای ارتباط با کتاب' : 'بدون ارتباط ثبت‌شده با کتاب'}
              </span>
            </article>
          ))}
        </div>
      )}

      {/* فهرست ۳: ارتباط‌های کتاب و شهید */}
      {selection.kind === 'relations' && filteredCount > 0 && (
        <div data-testid="drilldown-list-relations" className="space-y-3">
          {(visibleSlice as Extract<DrilldownSelectionResult, { kind: 'relations' }>['items']).map(
            ({ relation, bookItem, martyrItem }) => (
              <article
                key={`${relation.linkId}-${relation.bookKey}-${relation.martyrKey}`}
                data-testid={`drilldown-relation-item-${relation.linkId}`}
                className="bg-white border border-[#E5D7C6] rounded-2xl p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="font-mono text-xs font-bold bg-[#FAF5EE] border border-[#E5D7C6] text-[#6B3E26] px-2 py-0.5 rounded-md"
                      dir="ltr"
                    >
                      {relation.linkId}
                    </span>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                        relation.certaintyBucket === 'confirmedByExpert'
                          ? 'bg-[#EDF6F0] border-[#BBDCC6] text-[#2E6F40]'
                          : 'bg-[#FDF4E7] border-[#E9CA9F] text-[#8A4B16]'
                      }`}
                    >
                      {relation.certaintyLabel}
                    </span>
                    <span className="text-[11px] text-[#78604E]">
                      وضعیت ثبت: {relation.reviewStatus || 'نامشخص'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-[#FAF5EE] border border-[#EFE4D6] rounded-xl p-3">
                  <div className="space-y-1 min-w-0">
                    <div className="text-[11px] text-[#78604E]">کتاب مرتبط</div>
                    <div className="font-bold text-[#332218] text-sm break-words">
                      {relation.bookTitle}
                    </div>
                    <div className="text-[#5C4636]">
                      شناسه:{' '}
                      <span className="font-mono" dir="ltr">
                        {relation.tempBookId}
                      </span>
                      {relation.publisher ? ` · ${relation.publisher}` : ''}
                    </div>
                  </div>

                  <div className="space-y-1 min-w-0">
                    <div className="text-[11px] text-[#78604E]">شهید / عبارت مرتبط</div>
                    <div className="font-bold text-[#332218] text-sm break-words">
                      {relation.martyrName}
                    </div>
                    <div className="text-[#5C4636]">
                      {relation.graveAddress || 'فاقد مختصات مزار ثبت‌شده'}
                      {relation.pageReferenceRaw ? ` · صفحه: ${relation.pageReferenceRaw}` : ''}
                    </div>
                  </div>
                </div>

                {relation.sourceDescriptionRaw && (
                  <p className="text-xs text-[#5C4636] leading-relaxed line-clamp-2">
                    {relation.sourceDescriptionRaw}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {bookItem && (
                    <button
                      type="button"
                      data-testid={`relation-open-book-${relation.linkId}`}
                      onClick={() => onOpenOriginalBook(bookItem)}
                      className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#6B3E26] hover:bg-[#56311E] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <BookOpen className="w-4 h-4 shrink-0" />
                      <span>پرونده کتاب</span>
                    </button>
                  )}

                  {martyrItem && !relation.isPlaceholderOrGroup ? (
                    <button
                      type="button"
                      data-testid={`relation-open-martyr-${relation.linkId}`}
                      onClick={() => onOpenOriginalMartyr(martyrItem)}
                      className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#FAF5EE] hover:bg-[#F3E4D2] text-[#6B3E26] border border-[#DFC9AE] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <UserCheck className="w-4 h-4 shrink-0" />
                      <span>پرونده شهید</span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-[#78604E]">
                      عبارت گروهی / فاقد نام شهید منفرد برای ورود مستقیم به پرونده شهید
                    </span>
                  )}
                </div>
              </article>
            )
          )}
        </div>
      )}

      {/* فهرست ۴: صف پیگیری */}
      {selection.kind === 'work' && filteredCount > 0 && (
        <div data-testid="drilldown-list-work" className="space-y-3">
          {(visibleSlice as Extract<DrilldownSelectionResult, { kind: 'work' }>['items']).map(
            (row) => (
              <article
                key={row.item.trackingId}
                data-testid={`drilldown-work-item-${row.item.trackingId}`}
                className="bg-white border border-[#E5D7C6] rounded-2xl p-4 space-y-2.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="font-mono text-xs font-bold bg-[#FAF5EE] border border-[#E5D7C6] text-[#6B3E26] px-2 py-0.5 rounded-md"
                    dir="ltr"
                  >
                    {row.item.trackingId}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md border bg-[#FAF5EE] border-[#E5D7C6] text-[#5C4636]">
                    نوع فعالیت: {row.activityTypeLabel}
                  </span>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                      row.isCompleted
                        ? 'bg-[#EDF6F0] border-[#BBDCC6] text-[#2E6F40]'
                        : 'bg-[#FDF4E7] border-[#E9CA9F] text-[#8A4B16]'
                    }`}
                  >
                    وضعیت: {row.item.trackingStatus || 'باز'}
                  </span>
                </div>

                <div className="space-y-1 text-xs sm:text-sm">
                  <div className="font-bold text-[#332218]">
                    موضوع: {row.item.issueSubject || 'پیگیری'}
                  </div>
                  {row.item.bookTitle && (
                    <div className="text-[#5C4636]">
                      کتاب: <strong className="text-[#332218]">{row.item.bookTitle}</strong>
                      {row.item.publisher ? ` (${row.item.publisher})` : ''}
                    </div>
                  )}
                  {row.item.nameOrPhrase && (
                    <div className="text-[#5C4636]">
                      مورد / شهید: <strong className="text-[#332218]">{row.item.nameOrPhrase}</strong>
                    </div>
                  )}
                  {row.item.suggestedAction && (
                    <div className="text-xs text-[#78604E]">
                      اقدام پیشنهادی: {row.item.suggestedAction}
                    </div>
                  )}
                  {row.relatedAuditLog && (
                    <div className="text-xs text-[#5C4636] bg-[#FAF5EE] border border-[#EFE4D6] rounded-lg px-2.5 py-1.5">
                      ثبت سامانه ({row.relatedAuditLog.timestamp}): {row.relatedAuditLog.summary}
                    </div>
                  )}
                </div>

                {(row.bookItem || row.martyrItem) && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {row.bookItem && (
                      <button
                        type="button"
                        data-testid={`work-open-book-${row.item.trackingId}`}
                        onClick={() => onOpenOriginalBook(row.bookItem!)}
                        className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#6B3E26] hover:bg-[#56311E] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <BookOpen className="w-4 h-4 shrink-0" />
                        <span>پرونده کتاب</span>
                      </button>
                    )}
                    {row.martyrItem && (
                      <button
                        type="button"
                        data-testid={`work-open-martyr-${row.item.trackingId}`}
                        onClick={() => onOpenOriginalMartyr(row.martyrItem!)}
                        className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#FAF5EE] hover:bg-[#F3E4D2] text-[#6B3E26] border border-[#DFC9AE] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <UserCheck className="w-4 h-4 shrink-0" />
                        <span>پرونده شهید</span>
                      </button>
                    )}
                  </div>
                )}
              </article>
            )
          )}
        </div>
      )}

      {/* فهرست ۴-ب: تاریخچه فعالیت‌های سامانه */}
      {selection.kind === 'activity_logs' && filteredCount > 0 && (
        <div data-testid="drilldown-list-activity-logs" className="space-y-3">
          {(visibleSlice as DrilldownActivityLogRow[]).map(({ entry, domainLabel }) => (
            <article
              key={entry.id}
              data-testid={`drilldown-activity-item-${entry.id}`}
              className="bg-white border border-[#E5D7C6] rounded-2xl p-4 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold bg-[#FAF5EE] border border-[#E5D7C6] text-[#6B3E26] px-2 py-0.5 rounded-md">
                    {entry.id}
                  </span>
                  <span className="text-xs font-bold text-[#332218]">{entry.actionType}</span>
                  <span className="text-[11px] text-[#78604E]">حوزه: {domainLabel}</span>
                </div>
                <span className="text-xs text-[#78604E] tabular-nums">{entry.timestamp}</span>
              </div>
              <p className="text-xs sm:text-sm text-[#332218]">{entry.summary}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#78604E]">
                <span>شناسه هدف: {entry.targetId}</span>
                <span>ثبت‌کننده: {entry.actorName}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* فهرست ۵: خروجی‌های پژوهشی */}
      {selection.kind === 'research_outputs' && filteredCount > 0 && (
        <div data-testid="drilldown-list-research" className="space-y-3">
          {(
            visibleSlice as Extract<
              DrilldownSelectionResult,
              { kind: 'research_outputs' }
            >['items']
          ).map(({ item, bookItem, martyrItem }) => (
            <article
              key={item.id}
              data-testid={`drilldown-research-item-${item.id}`}
              className="bg-white border border-[#E5D7C6] rounded-2xl p-4 space-y-2.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="font-mono text-xs font-bold bg-[#FAF5EE] border border-[#E5D7C6] text-[#6B3E26] px-2 py-0.5 rounded-md"
                  dir="ltr"
                >
                  {item.id}
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md border bg-[#FAF5EE] border-[#E5D7C6] text-[#5C4636]">
                  {item.contentType}
                </span>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                    normalizePersian(item.reviewStatus) === 'تاییدشده کارشناسی'
                      ? 'bg-[#EDF6F0] border-[#BBDCC6] text-[#2E6F40]'
                      : 'bg-[#FDF4E7] border-[#E9CA9F] text-[#8A4B16]'
                  }`}
                >
                  {item.reviewStatus}
                </span>
              </div>

              <h3 className="text-sm sm:text-base font-bold text-[#332218]">
                {item.passageTitle || item.bookTitleRaw}
              </h3>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#5C4636]">
                <span>
                  کتاب: {item.bookTitleRaw}
                  {item.tempBookId ? ` (${item.tempBookId})` : ''}
                </span>
                {item.martyrNameRaw && <span>شهید: {item.martyrNameRaw}</span>}
                {item.pageReferenceRaw && <span>صفحه: {item.pageReferenceRaw}</span>}
                {item.updatedAt && <span>تاریخ ثبت: {item.updatedAt}</span>}
              </div>

              {item.extractedText && (
                <p className="text-xs sm:text-sm text-[#5C4636] leading-relaxed bg-[#FAF5EE] border border-[#EFE4D6] rounded-xl p-3">
                  {item.extractedText}
                </p>
              )}

              {(bookItem || martyrItem) && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {bookItem && (
                    <button
                      type="button"
                      data-testid={`research-open-book-${item.id}`}
                      onClick={() => onOpenOriginalBook(bookItem)}
                      className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#6B3E26] hover:bg-[#56311E] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <BookOpen className="w-4 h-4 shrink-0" />
                      <span>پرونده کتاب</span>
                    </button>
                  )}
                  {martyrItem && (
                    <button
                      type="button"
                      data-testid={`research-open-martyr-${item.id}`}
                      onClick={() => onOpenOriginalMartyr(martyrItem)}
                      className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#FAF5EE] hover:bg-[#F3E4D2] text-[#6B3E26] border border-[#DFC9AE] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <UserCheck className="w-4 h-4 shrink-0" />
                      <span>پرونده شهید</span>
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {/* فهرست ۶-الف: گزارش‌های مدیریتی از دفتر کل مستقل محلی */}
      {selection.kind === 'finalized_reports' && filteredCount > 0 && (
        <div data-testid="drilldown-list-finalized-reports" className="space-y-3">
          {(visibleSlice as FinalizedReportRegistryRecord[]).map((rep) => {
            const isExpanded = expandedReportId === rep.reportId;
            return (
              <article
                key={rep.reportId}
                data-testid={`drilldown-finalized-report-${rep.reportId}`}
                className="bg-white border border-[#E5D7C6] rounded-2xl p-4 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md border bg-[#FAF5EE] border-[#E5D7C6] text-[#6B3E26]">
                        {rep.reportId}
                      </span>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                          rep.lifecycleStatus === 'final'
                            ? 'bg-[#EDF6F0] border-[#BBDCC6] text-[#2E6F40]'
                            : 'bg-[#FDF4E7] border-[#E9CA9F] text-[#8A4B16]'
                        }`}
                      >
                        {rep.lifecycleStatus === 'final' ? 'نهایی و مستقل' : 'پیش‌نویس'}
                      </span>
                      <span className="text-xs text-[#78604E] tabular-nums">
                        نسخه {toPersianDigits(rep.currentVersion)} ·{' '}
                        {toPersianDigits(rep.versions.length)} فایل ثبت‌شده
                      </span>
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-[#332218]">
                      {rep.title}
                    </h3>
                    <div className="text-xs text-[#5C4636] tabular-nums">
                      دامنه: {rep.appliedFiltersSummary} · آخرین بروزرسانی: {rep.updatedAtDisplay}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedReportId(isExpanded ? null : rep.reportId)
                      }
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#FAF5EE] hover:bg-[#F3E4D2] text-[#6B3E26] border border-[#DFC9AE] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <History className="w-4 h-4 shrink-0" />
                      <span>{isExpanded ? 'بستن نسخه‌ها' : 'سوابق نسخه'}</span>
                    </button>

                    {rep.lifecycleStatus === 'draft' && onFinalizeRegistryReport && (
                      <button
                        type="button"
                        onClick={() => onFinalizeRegistryReport(rep.reportId)}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#2E6F40] hover:bg-[#235631] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>نهایی‌سازی گزارش</span>
                      </button>
                    )}

                    {onExportNewVersionForReport && (
                      <>
                        <button
                          type="button"
                          onClick={() => onExportNewVersionForReport(rep, 'excel')}
                          className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#6B3E26] hover:bg-[#56311E] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <FilePlus2 className="w-4 h-4 shrink-0" />
                          <span>نسخه جدید اکسل</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onExportNewVersionForReport(rep, 'json')}
                          className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#FAF5EE] hover:bg-[#F3E4D2] text-[#6B3E26] border border-[#DFC9AE] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Download className="w-4 h-4 shrink-0" />
                          <span>نسخه جدید JSON</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="bg-[#FAF5EE] border border-[#EFE4D6] rounded-xl p-3 text-xs text-[#5C4636] space-y-2 tabular-nums">
                    <div className="font-bold text-[#332218]">
                      نسخه‌های تولیدشده روی شناسه {rep.reportId} (بدون افزایش شمارش مستقل):
                    </div>
                    {rep.versions.length === 0 ? (
                      <div className="text-[#78604E]">هنوز فایلی برای این گزارش دانلود نشده است.</div>
                    ) : (
                      <div className="divide-y divide-[#E5D7C6]">
                        {rep.versions.map((ver) => (
                          <div
                            key={`${rep.reportId}-v${ver.versionNumber}`}
                            className="py-1.5 flex flex-wrap items-center justify-between gap-2"
                          >
                            <span>
                              نسخه {toPersianDigits(ver.versionNumber)} ({ver.fileType.toUpperCase()}) ·{' '}
                              <span className="font-mono">{ver.fileName}</span>
                            </span>
                            <span className="text-[#78604E]">
                              {toPersianDigits(ver.recordCount)} رکورد · {ver.exportedAtDisplay}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* فهرست ۶-ب: گزارش‌های مدیریتی صادرشده (سابقه دانلود فنی دستگاه) */}
      {selection.kind === 'management_reports' && filteredCount > 0 && (
        <div data-testid="drilldown-list-reports" className="space-y-3">
          {(visibleSlice as ExecutiveExportHistoryRecord[]).map((rec) => {
            const isExpanded = expandedReportId === rec.exportId;
            return (
              <article
                key={rec.exportId}
                data-testid={`drilldown-report-item-${rec.exportId}`}
                className="bg-white border border-[#E5D7C6] rounded-2xl p-4 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md border bg-[#FAF5EE] border-[#E5D7C6] text-[#6B3E26] uppercase">
                        {rec.fileType}
                      </span>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                          rec.status === 'success'
                            ? 'bg-[#EDF6F0] border-[#BBDCC6] text-[#2E6F40]'
                            : 'bg-[#FDF0F0] border-[#E2B4B4] text-[#8A2C2C]'
                        }`}
                      >
                        {rec.status === 'success' ? 'صادرشده موفق' : 'ناموفق'}
                      </span>
                      <span className="text-xs text-[#78604E] tabular-nums">
                        {rec.timestampDisplay}
                      </span>
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-[#332218] break-all">
                      {rec.fileName}
                    </h3>
                    <div className="text-xs text-[#5C4636] tabular-nums">
                      تعداد رکورد: {toPersianDigits(rec.recordCount)} · محدوده:{' '}
                      {rec.appliedFiltersSummary}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedReportId(isExpanded ? null : rec.exportId)
                      }
                      className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#FAF5EE] hover:bg-[#F3E4D2] text-[#6B3E26] border border-[#DFC9AE] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileText className="w-4 h-4 shrink-0" />
                      <span>{isExpanded ? 'بستن جزئیات' : 'مشاهده جزئیات'}</span>
                    </button>

                    {onRegenerateReport && rec.status === 'success' && (
                      <button
                        type="button"
                        onClick={() => onRegenerateReport(rec)}
                        className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#6B3E26] hover:bg-[#56311E] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-4 h-4 shrink-0" />
                        <span>تولید و دریافت مجدد فایل</span>
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="bg-[#FAF5EE] border border-[#EFE4D6] rounded-xl p-3 text-xs text-[#5C4636] space-y-1">
                    <div>
                      شناسه ثبت: <span className="font-mono">{rec.exportId}</span>
                    </div>
                    <div>
                      زمان ISO: <span className="font-mono">{rec.timestampIso}</span>
                    </div>
                    {rec.errorMessage && (
                      <div className="text-[#8A2C2C]">خطا: {rec.errorMessage}</div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* دکمه نمایش بیشتر */}
      {filteredCount > visibleLimit && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            data-testid="drilldown-load-more-btn"
            onClick={() => setVisibleLimit((prev) => prev + PAGE_STEP)}
            className="min-h-[44px] px-6 py-2 rounded-xl bg-white hover:bg-[#FAF5EE] border border-[#DFC9AE] text-xs sm:text-sm font-bold text-[#6B3E26] cursor-pointer transition-colors"
          >
            نمایش موارد بیشتر (باقی‌مانده:{' '}
            {toPersianDigits(filteredCount - visibleLimit)} مورد)
          </button>
        </div>
      )}
    </div>
  );
};
