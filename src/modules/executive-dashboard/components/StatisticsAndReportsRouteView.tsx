import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  HelpCircle,
  Search,
  Users,
  X,
} from 'lucide-react';
import { toPersianDigits } from '../../../data/markazAsnadData';
import { loadExecutiveExportHistory } from '../export/exportHistoryStore';
import { normalizePersian } from '../normalization';
import {
  buildStatisticalQueryAnswers,
  computeUnifiedStatisticsSearch,
  selectWorkAndOutputsDetailedAnalytics,
} from '../selectors/detailedStatisticsSelector';
import { buildExecutiveEntityProjection } from '../selectors/entityDossiersSelector';
import {
  RELATION_CERTAINTY_DISPLAY_LABELS,
  type DashboardDrilldownKey,
  type ExecutiveDashboardInputs,
  type ExecutiveExportHistoryRecord,
  type RelationCertaintyBucket,
} from '../types';

interface StatisticsAndReportsRouteViewProps {
  inputs?: ExecutiveDashboardInputs | null;
  exportHistory?: ExecutiveExportHistoryRecord[];
  onBackToDashboard: () => void;
  onSelectDrilldown?: (key: DashboardDrilldownKey) => void;
  onRequestLoadGolzarBank?: () => void;
}

const EMPTY_INPUTS: ExecutiveDashboardInputs = {
  catalogRows: [],
  links: [],
  pendingReviews: [],
  extractedItems: [],
  auditLogs: [],
};

const CERTAINTY_ORDER: RelationCertaintyBucket[] = [
  'confirmedByExpert',
  'probable',
  'needsReview',
  'undetermined',
  'rejected',
];

/**
 * مسیر مستقل «آمار و گزارش‌های تفصیلی»
 * ساختار سه‌بخشی دقیقاً متناظر با سه کارت اصلی داشبورد:
 * ۱. کتابخانه
 * ۲. شهدا ـ احراز هویت و ارتباطات
 * ۳. وضعیت کار و خروجی‌ها (با هر ۸ شاخص مستقل)
 * به‌همراه ابزارهای مشترک جستجوی یکپارچه و پرسش‌های آماری در بالا
 */
export const StatisticsAndReportsRouteView: React.FC<
  StatisticsAndReportsRouteViewProps
> = ({
  inputs,
  exportHistory: externalExportHistory,
  onBackToDashboard,
  onSelectDrilldown,
  onRequestLoadGolzarBank,
}) => {
  const effectiveInputs = inputs ?? EMPTY_INPUTS;
  const [loadedExportHistory, setLoadedExportHistory] = useState<
    ExecutiveExportHistoryRecord[]
  >([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedQueryId, setSelectedQueryId] = useState<string>('q_library_status');

  useEffect(() => {
    if (externalExportHistory) return;
    let mounted = true;
    loadExecutiveExportHistory()
      .then((records) => {
        if (mounted) setLoadedExportHistory(records);
      })
      .catch(() => {
        if (mounted) setLoadedExportHistory([]);
      });
    return () => {
      mounted = false;
    };
  }, [externalExportHistory]);

  const effectiveExportHistory = externalExportHistory ?? loadedExportHistory;

  const projection = useMemo(
    () => buildExecutiveEntityProjection(effectiveInputs),
    [effectiveInputs]
  );
  const summary = projection.summary;

  const workAnalytics = useMemo(
    () =>
      selectWorkAndOutputsDetailedAnalytics(
        effectiveInputs,
        summary,
        effectiveExportHistory
      ),
    [effectiveInputs, summary, effectiveExportHistory]
  );

  const statisticalQueries = useMemo(
    () => buildStatisticalQueryAnswers(summary, workAnalytics),
    [summary, workAnalytics]
  );

  const selectedQuery =
    statisticalQueries.find((q) => q.id === selectedQueryId) ||
    statisticalQueries[0] ||
    null;

  const searchPreview = useMemo(
    () =>
      computeUnifiedStatisticsSearch(
        searchQuery,
        effectiveInputs,
        projection,
        effectiveExportHistory
      ),
    [searchQuery, effectiveInputs, projection, effectiveExportHistory]
  );

  const matchingTopRecords = useMemo(() => {
    const nq = normalizePersian(searchQuery);
    if (!nq) return { books: [], martyrs: [], work: [] };

    const books = projection.books
      .filter((b) =>
        normalizePersian(
          `${b.tempBookId} ${b.title} ${b.publisher} ${b.author} ${b.locationDisplay} ${b.openTicketIds.join(' ')}`
        ).includes(nq)
      )
      .slice(0, 4);

    const martyrs = projection.martyrs
      .filter((m) =>
        normalizePersian(
          `${m.displayCode} ${m.fullName} ${m.fatherName} ${m.graveAddress} ${m.identityStatusLabel}`
        ).includes(nq)
      )
      .slice(0, 4);

    const work = (effectiveInputs.pendingReviews || [])
      .filter((pv) =>
        normalizePersian(
          `${pv.trackingId} ${pv.mainSheet} ${pv.mainRecordId} ${pv.bookTitle} ${pv.nameOrPhrase} ${pv.issueSubject} ${pv.trackingStatus}`
        ).includes(nq)
      )
      .slice(0, 4);

    return { books, martyrs, work };
  }, [searchQuery, projection.books, projection.martyrs, effectiveInputs.pendingReviews]);

  const scrollToSection = (sectionId: 'library' | 'martyrs' | 'work') => {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(`stats-section-${sectionId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const lib = summary.library;
  const part = lib.reviewBreakdown.managerialStatusPartition;
  const martyrs = summary.martyrs;
  const rels = summary.relations;
  const dom = workAnalytics.independentWorkTopics.domainBreakdown;

  const pct = (partCount: number, totalCount: number): number =>
    totalCount > 0 ? Math.round((partCount / totalCount) * 100) : 0;

  const booksCompletedPct = pct(
    part.completedWithoutOpenTicketCount,
    part.totalTrackedBooksCount
  );
  const booksOpenTicketPct = pct(
    part.openBookTicketCount,
    part.totalTrackedBooksCount
  );
  const confirmedIdentityPct = pct(
    martyrs.linkedMartyrsSummary.confirmedUniqueLinkedMartyrsCount,
    martyrs.linkedMartyrsSummary.distinctNormalizedLinkedNamesCount
  );
  const pvCompletedPct = pct(
    workAnalytics.reviewQueueCompletedCount,
    workAnalytics.reviewQueueTotalCount
  );

  const hasDataLoaded =
    lib.totalTrackedBooksCount > 0 ||
    rels.totalRawLinkRows > 0 ||
    workAnalytics.reviewQueueTotalCount > 0;

  return (
    <div
      data-testid="executive-statistics-route-view"
      className="max-w-6xl mx-auto px-3 sm:px-6 pt-3 pb-14 space-y-6 text-[#332218]"
    >
      {/* سرصفحه مسیر مستقل آمار و گزارش‌ها */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#E5D7C6] pb-4">
        <div className="space-y-1">
          <div className="text-xs text-[#78604E]">
            مرکز اسناد و کتابخانه · نمای تفصیلی سه‌بخشی متصل به داده‌های زنده
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#332218]">
            آمار و گزارش‌های تفصیلی
          </h2>
        </div>

        <button
          type="button"
          data-testid="back-to-dashboard-btn"
          onClick={onBackToDashboard}
          className="w-full sm:w-auto min-h-[46px] px-5 py-2.5 rounded-xl bg-[#6B3E26] hover:bg-[#56311E] text-white text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors shrink-0"
        >
          <ArrowRight className="w-4 h-4 shrink-0" />
          <span>بازگشت به داشبورد</span>
        </button>
      </header>

      {!hasDataLoaded && (
        <div
          data-testid="statistics-empty-state"
          className="bg-white border border-[#E5D7C6] rounded-2xl p-6 text-center text-sm text-[#78604E]"
        >
          اطلاعات پایه سامانه هنوز بارگذاری نشده است؛ به محض دریافت داده‌های زنده، ارقام سه‌بخشی محاسبه می‌شوند.
        </div>
      )}

      {/* ابزارهای مشترک دسترسی به سه بخش (نه کارت یا بخش چهارم) */}
      <div
        data-testid="statistics-shared-tools"
        aria-label="ابزارهای مشترک دسترسی به آمار سه بخش"
        className="bg-[#FAF5EE] border border-[#E5D7C6] rounded-2xl p-4 sm:p-5 space-y-4"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-xs font-bold text-[#6B3E26]">
              ابزارهای مشترک دسترسی به سه بخش اصلی
            </div>
            <p className="text-xs text-[#78604E]">
              جستجوی یکپارچه و پرسش‌های آماری زنده برای پیمایش سریع میان «کتابخانه»، «شهدا و ارتباطات» و «وضعیت کار و خروجی‌ها»
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => scrollToSection('library')}
              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white border border-[#E5D7C6] hover:border-[#6B3E26] text-[#332218] font-medium cursor-pointer transition-colors"
            >
              ۱. کتابخانه
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('martyrs')}
              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white border border-[#E5D7C6] hover:border-[#6B3E26] text-[#332218] font-medium cursor-pointer transition-colors"
            >
              ۲. شهدا و ارتباطات
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('work')}
              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white border border-[#E5D7C6] hover:border-[#6B3E26] text-[#332218] font-medium cursor-pointer transition-colors"
            >
              ۳. وضعیت کار و خروجی‌ها
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* جستجوی یکپارچه */}
          <div className="lg:col-span-5 bg-white border border-[#E5D7C6] rounded-xl p-3.5 space-y-3">
            <label
              htmlFor="statistics-unified-search-input"
              className="flex items-center gap-1.5 text-xs font-bold text-[#332218]"
            >
              <Search className="w-4 h-4 text-[#6B3E26]" />
              <span>جستجوی یکپارچه در کل داده‌های مرکز اسناد</span>
            </label>
            <div className="relative">
              <input
                id="statistics-unified-search-input"
                data-testid="statistics-unified-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="نام کتاب، شناسه BK / PV / RL، نام شهید یا موضوع..."
                className="w-full min-h-[42px] pr-3 pl-9 py-2 rounded-lg border border-[#D8C5B0] bg-[#FFFDFA] text-xs sm:text-sm text-[#332218] placeholder:text-[#9C826B] focus:outline-none focus:ring-2 focus:ring-[#6B3E26]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="پاک کردن جستجو"
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-[#78604E] hover:text-[#332218] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {searchQuery.trim() ? (
              <div
                data-testid="statistics-search-results"
                className="space-y-2.5 text-xs tabular-nums"
              >
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => scrollToSection('library')}
                    className="px-2.5 py-1 rounded-md bg-[#FAF5EE] border border-[#E5D7C6] text-[#332218] cursor-pointer hover:border-[#6B3E26]"
                  >
                    کتابخانه: <strong>{toPersianDigits(searchPreview.booksMatchesCount)}</strong>
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection('martyrs')}
                    className="px-2.5 py-1 rounded-md bg-[#FAF5EE] border border-[#E5D7C6] text-[#332218] cursor-pointer hover:border-[#6B3E26]"
                  >
                    شهدا:{' '}
                    <strong>{toPersianDigits(searchPreview.martyrsMatchesCount)}</strong> ·
                    ارتباطات:{' '}
                    <strong>{toPersianDigits(searchPreview.relationsMatchesCount)}</strong>
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection('work')}
                    className="px-2.5 py-1 rounded-md bg-[#FAF5EE] border border-[#E5D7C6] text-[#332218] cursor-pointer hover:border-[#6B3E26]"
                  >
                    صف/فعالیت/خروجی:{' '}
                    <strong>
                      {toPersianDigits(
                        searchPreview.workMatchesCount +
                          searchPreview.activityMatchesCount +
                          searchPreview.researchMatchesCount +
                          searchPreview.reportMatchesCount
                      )}
                    </strong>
                  </button>
                </div>

                {searchPreview.totalMatchesCount === 0 ? (
                  <p className="text-[#78604E]">
                    موردی مطابق عبارت جستجو در سوابق زنده یافت نشد.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto border-t border-[#F0E6D8] pt-2">
                    {matchingTopRecords.books.map((b) => (
                      <div
                        key={b.bookKey}
                        className="flex items-center justify-between gap-2 text-[11px] text-[#5C4636]"
                      >
                        <span className="truncate">
                          [کتاب] {b.tempBookId} · {b.title}
                        </span>
                        <span className="shrink-0 text-[#78604E]">
                          {b.managerialStatusLabel}
                        </span>
                      </div>
                    ))}
                    {matchingTopRecords.martyrs.map((m) => (
                      <div
                        key={m.martyrKey}
                        className="flex items-center justify-between gap-2 text-[11px] text-[#5C4636]"
                      >
                        <span className="truncate">
                          [شهید] {m.displayCode} · {m.fullName}
                        </span>
                        <span className="shrink-0 text-[#78604E]">
                          {m.identityStatusLabel}
                        </span>
                      </div>
                    ))}
                    {matchingTopRecords.work.map((pv) => (
                      <div
                        key={pv.trackingId}
                        className="flex items-center justify-between gap-2 text-[11px] text-[#5C4636]"
                      >
                        <span className="truncate">
                          [صف] {pv.trackingId} · {pv.issueSubject || pv.bookTitle}
                        </span>
                        <span className="shrink-0 text-[#78604E]">{pv.trackingStatus}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-[#78604E] tabular-nums">
                مجموع کل رکوردهای قابل جستجو در سه بخش:{' '}
                {toPersianDigits(
                  lib.totalTrackedBooksCount +
                    martyrs.linkedMartyrsSummary.distinctNormalizedLinkedNamesCount +
                    rels.totalRawLinkRows +
                    workAnalytics.reviewQueueTotalCount +
                    workAnalytics.activityLog.totalEntriesCount +
                    workAnalytics.researchOutputs.totalExtractedNonRejectedCount
                )}{' '}
                رکورد زنده
              </p>
            )}
          </div>

          {/* پرسش‌های آماری زنده */}
          <div
            data-testid="statistics-statistical-queries"
            className="lg:col-span-7 bg-white border border-[#E5D7C6] rounded-xl p-3.5 space-y-3"
          >
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#332218]">
              <HelpCircle className="w-4 h-4 text-[#6B3E26]" />
              <span>پرسش‌های آماری زنده (محاسبه مستقیم از سلکتورهای رسمی)</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {statisticalQueries.map((q) => {
                const isSelected = selectedQuery?.id === q.id;
                return (
                  <button
                    key={q.id}
                    type="button"
                    data-testid={`stat-query-btn-${q.id}`}
                    onClick={() => setSelectedQueryId(q.id)}
                    className={`text-right px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#6B3E26] border-[#6B3E26] text-white font-bold'
                        : 'bg-[#FAF5EE] border-[#E5D7C6] text-[#5C4636] hover:border-[#6B3E26]'
                    }`}
                  >
                    {q.question}
                  </button>
                );
              })}
            </div>

            {selectedQuery && (
              <div
                data-testid="stat-query-answer-box"
                className="rounded-lg bg-[#FFFDFA] border border-[#EFE4D6] p-3 space-y-1.5 tabular-nums"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-[#6B3E26]">
                    بخش متناظر: {selectedQuery.targetSectionLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => scrollToSection(selectedQuery.targetSection)}
                    className="text-[11px] font-bold text-[#6B3E26] hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>رفتن به بخش مربوط</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="text-xs sm:text-sm font-bold text-[#332218]">
                  {selectedQuery.headlineMetric}
                </div>
                <p className="text-xs text-[#5C4636] leading-relaxed">
                  {selectedQuery.explanation}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* بخش ۱ از ۳: کتابخانه                                                  */}
      {/* ===================================================================== */}
      <section
        id="stats-section-library"
        data-testid="statistics-section-library"
        aria-labelledby="stats-section-library-title"
        className="bg-white border border-[#E5D7C6] rounded-2xl p-5 sm:p-6 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EFE4D6] pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#FAF5EE] border border-[#E5D7C6] text-[#6B3E26] flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] text-[#78604E]">بخش ۱ متناظر با کارت اول داشبورد</div>
              <h3 id="stats-section-library-title" className="text-base sm:text-lg font-bold">
                کتابخانه
              </h3>
            </div>
          </div>

          {onSelectDrilldown && (
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => onSelectDrilldown('library_all')}
                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#E5D7C6] hover:bg-[#FAF5EE] text-[#332218] font-medium cursor-pointer"
              >
                فهرست کامل کتاب‌ها
              </button>
              <button
                type="button"
                onClick={() => onSelectDrilldown('library_remaining')}
                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#E5D7C6] hover:bg-[#FAF5EE] text-[#332218] font-medium cursor-pointer"
              >
                باقیمانده برای بررسی
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
          <div className="rounded-xl bg-[#FAF5EE] border border-[#EFE4D6] p-3.5 space-y-1">
            <div className="text-xs text-[#78604E]">کل کتاب‌های تحت پایش</div>
            <div className="text-2xl font-bold text-[#332218]">
              {toPersianDigits(lib.totalTrackedBooksCount)}
            </div>
            <div className="text-[11px] text-[#5C4636]">
              کاتالوگ: {toPersianDigits(lib.catalogRowsCount)} · خارج از فهرست:{' '}
              {toPersianDigits(lib.outsideCatalogBooksCount)}
            </div>
          </div>

          <div className="rounded-xl bg-[#FAF5EE] border border-[#EFE4D6] p-3.5 space-y-1">
            <div className="text-xs text-[#78604E]">عناوین یکتا و هم‌نامی</div>
            <div className="text-2xl font-bold text-[#332218]">
              {toPersianDigits(lib.exactUniqueCatalogTitlesCount)}
            </div>
            <div className="text-[11px] text-[#5C4636]">
              {toPersianDigits(lib.similarTitleGroups.length)} گروه عنوان هم‌نام (بدون ادغام خودکار)
            </div>
          </div>

          <div className="rounded-xl bg-[#FAF5EE] border border-[#EFE4D6] p-3.5 space-y-1">
            <div className="text-xs text-[#78604E]">نسخه‌های فیزیکی ثبت‌شده (CP)</div>
            <div className="text-2xl font-bold text-[#332218]">
              {toPersianDigits(lib.registeredPhysicalCopiesCount)}
            </div>
            <div className="text-[11px] text-[#5C4636]">
              مجموع نسخه‌های شمارش‌شده ثبت‌شده: {toPersianDigits(lib.reportedCountedCopiesSum)}
            </div>
          </div>

          <div className="rounded-xl bg-[#FAF5EE] border border-[#EFE4D6] p-3.5 space-y-1">
            <div className="text-xs text-[#78604E]">پایش میدانی و ثبت قفسه</div>
            <div className="text-2xl font-bold text-[#332218]">
              {toPersianDigits(lib.fieldAuditSummary.totalAuditRecords)}
            </div>
            <div className="text-[11px] text-[#5C4636]">
              تأیید فیزیکی: {toPersianDigits(lib.fieldAuditSummary.verified)} · نیازمند بررسی:{' '}
              {toPersianDigits(lib.fieldAuditSummary.review)}
            </div>
          </div>
        </div>

        {/* تفکیک بدون هم‌پوشانی وضعیت بررسی کتاب‌ها (گزینه ج) */}
        <div className="rounded-xl border border-[#EFE4D6] p-4 space-y-3 tabular-nums">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs sm:text-sm font-bold text-[#332218]">
              تفکیک بدون هم‌پوشانی وضعیت بررسی کتاب‌ها
            </div>
            <div className="text-xs text-[#78604E]">
              مجموع: {toPersianDigits(part.totalTrackedBooksCount)} کتاب
            </div>
          </div>

          <div className="w-full h-3 rounded-full bg-[#EFE4D6] overflow-hidden flex">
            {booksCompletedPct > 0 && (
              <div
                style={{ width: `${booksCompletedPct}%` }}
                className="bg-[#2E6F40] h-full"
                title={`تکمیل‌شده بدون تیکت باز: ${toPersianDigits(part.completedWithoutOpenTicketCount)}`}
              />
            )}
            {booksOpenTicketPct > 0 && (
              <div
                style={{ width: `${booksOpenTicketPct}%` }}
                className="bg-[#C87A3B] h-full"
                title={`دارای تیکت باز تکرار عنوان: ${toPersianDigits(part.openBookTicketCount)}`}
              />
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="flex items-center justify-between rounded-lg bg-[#FFFDFA] border border-[#EFE4D6] px-3 py-2">
              <span className="flex items-center gap-2 text-[#5C4636]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#2E6F40]" />
                <span>تکمیل‌شده بدون تیکت باز</span>
              </span>
              <strong className="text-[#332218]">
                {toPersianDigits(part.completedWithoutOpenTicketCount)}
              </strong>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-[#FFFDFA] border border-[#EFE4D6] px-3 py-2">
              <span className="flex items-center gap-2 text-[#5C4636]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#C87A3B]" />
                <span>دارای تیکت باز تکرار عنوان</span>
              </span>
              <strong className="text-[#332218]">
                {toPersianDigits(part.openBookTicketCount)}
              </strong>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-[#FFFDFA] border border-[#EFE4D6] px-3 py-2">
              <span className="flex items-center gap-2 text-[#5C4636]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#C9B49B]" />
                <span>بررسی‌نشده</span>
              </span>
              <strong className="text-[#332218]">
                {toPersianDigits(part.unreviewedCount)}
              </strong>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* بخش ۲ از ۳: شهدا ـ احراز هویت و ارتباطات (شامل تفکیک ارتباطات)       */}
      {/* ===================================================================== */}
      <section
        id="stats-section-martyrs"
        data-testid="statistics-section-martyrs"
        aria-labelledby="stats-section-martyrs-title"
        className="bg-white border border-[#E5D7C6] rounded-2xl p-5 sm:p-6 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EFE4D6] pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#FAF5EE] border border-[#E5D7C6] text-[#6B3E26] flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] text-[#78604E]">بخش ۲ متناظر با کارت دوم داشبورد</div>
              <h3 id="stats-section-martyrs-title" className="text-base sm:text-lg font-bold">
                شهدا ـ احراز هویت و ارتباطات
              </h3>
            </div>
          </div>

          {onSelectDrilldown && (
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => onSelectDrilldown('martyrs_confirmed')}
                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#E5D7C6] hover:bg-[#FAF5EE] text-[#332218] font-medium cursor-pointer"
              >
                شهدای احرازشده
              </button>
              <button
                type="button"
                onClick={() => onSelectDrilldown('martyrs_needs_verification')}
                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#E5D7C6] hover:bg-[#FAF5EE] text-[#332218] font-medium cursor-pointer"
              >
                نیازمند بررسی هویت
              </button>
              <button
                type="button"
                onClick={() => onSelectDrilldown('relations_needs_review')}
                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#E5D7C6] hover:bg-[#FAF5EE] text-[#332218] font-medium cursor-pointer"
              >
                ارتباطات در انتظار بررسی
              </button>
            </div>
          )}
        </div>

        {!martyrs.officialBank.hasOfficialBankLoaded && onRequestLoadGolzarBank && (
          <div className="rounded-xl bg-[#FAF5EE] border border-[#E5D7C6] p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-[#5C4636]">
              بانک رسمی گلزار شهدا هنوز برای تطبیق دقیق هویت بارگذاری نشده است.
            </span>
            <button
              type="button"
              onClick={onRequestLoadGolzarBank}
              className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-[#6B3E26] text-white font-bold cursor-pointer"
            >
              بارگذاری بانک گلزار شهدا
            </button>
          </div>
        )}

        {/* زیربخش ۲-الف: احراز هویت شهدای مرتبط و بانک رسمی */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 tabular-nums">
          <div className="rounded-xl border border-[#EFE4D6] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-[#332218]">
                احراز هویت شهدای مرتبط با کتاب‌ها
              </h4>
              <span className="text-xs font-bold text-[#2E6F40]">
                {toPersianDigits(confirmedIdentityPct)}٪ احرازشده
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-[#FAF5EE] p-2.5">
                <div className="text-lg font-bold text-[#332218]">
                  {toPersianDigits(martyrs.linkedMartyrsSummary.distinctNormalizedLinkedNamesCount)}
                </div>
                <div className="text-[11px] text-[#78604E]">نام متمایز مرتبط</div>
              </div>
              <div className="rounded-lg bg-[#F1F8F3] p-2.5">
                <div className="text-lg font-bold text-[#2E6F40]">
                  {toPersianDigits(martyrs.linkedMartyrsSummary.confirmedUniqueLinkedMartyrsCount)}
                </div>
                <div className="text-[11px] text-[#2E6F40]">هویت احرازشده</div>
              </div>
              <div className="rounded-lg bg-[#FDF5ED] p-2.5">
                <div className="text-lg font-bold text-[#9C541C]">
                  {toPersianDigits(
                    martyrs.linkedMartyrsSummary.ambiguousOrUnverifiedLinkedNamesCount
                  )}
                </div>
                <div className="text-[11px] text-[#9C541C]">نیازمند احراز</div>
              </div>
            </div>

            <div className="divide-y divide-[#F0E6D8] text-xs">
              <div className="py-1.5 flex items-center justify-between">
                <span className="text-[#5C4636]">هشدارهای اختلاف مختصات مزار / نام</span>
                <strong className="text-[#332218]">
                  {toPersianDigits(martyrs.linkedMartyrsSummary.discrepancyWarnings.length)} مورد
                </strong>
              </div>
              <div className="py-1.5 flex items-center justify-between">
                <span className="text-[#5C4636]">شهدای ثبت‌شده دستی (MR)</span>
                <strong className="text-[#332218]">
                  {toPersianDigits(martyrs.customMartyrs.totalCount)} پرونده (
                  {toPersianDigits(martyrs.customMartyrs.definiteBankMatchesCount)} تطبیق قطعی)
                </strong>
              </div>
              <div className="py-1.5 flex items-center justify-between">
                <span className="text-[#5C4636]">بانک مرجع گلزار (شهید نام‌دار / کل ردیف‌ها)</span>
                <strong className="text-[#332218]">
                  {toPersianDigits(martyrs.officialBank.namedMartyrRowsCount)} /{' '}
                  {toPersianDigits(martyrs.officialBank.totalRows)}
                </strong>
              </div>
            </div>
          </div>

          {/* زیربخش ۲-ب: آمار کامل ارتباطات کتاب و شهید (داخل بخش دوم، نه کارت چهارم) */}
          <div
            data-testid="statistics-relations-subblock"
            className="rounded-xl border border-[#EFE4D6] p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-[#332218]">
                تفکیک و قطعیت ارتباطات کتاب و شهید
              </h4>
              <span className="text-xs text-[#78604E]">
                {toPersianDigits(rels.totalRawLinkRows)} ردیف ارتباط
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-[#FAF5EE] p-2.5">
                <div className="text-lg font-bold text-[#332218]">
                  {toPersianDigits(rels.booksWithLinksBreakdown.totalBooksWithActiveLinks)}
                </div>
                <div className="text-[11px] text-[#78604E]">کتاب دارای ارتباط</div>
              </div>
              <div className="rounded-lg bg-[#FAF5EE] p-2.5">
                <div className="text-lg font-bold text-[#332218]">
                  {toPersianDigits(rels.booksWithLinksBreakdown.booksWithNamedMartyrLinks)}
                </div>
                <div className="text-[11px] text-[#78604E]">دارای شهید نام‌دار</div>
              </div>
              <div className="rounded-lg bg-[#FAF5EE] p-2.5">
                <div className="text-lg font-bold text-[#332218]">
                  {toPersianDigits(rels.distinctBookTargetPairsCount)}
                </div>
                <div className="text-[11px] text-[#78604E]">زوج متمایز کتاب-شهید</div>
              </div>
            </div>

            <div className="divide-y divide-[#F0E6D8] text-xs">
              {CERTAINTY_ORDER.map((bucket) => (
                <div key={bucket} className="py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[#5C4636]">
                    {RELATION_CERTAINTY_DISPLAY_LABELS[bucket]}
                  </span>
                  <strong className="text-[#332218] shrink-0">
                    {toPersianDigits(rels.certaintyByDistinctPairs[bucket])} زوج (
                    {toPersianDigits(rels.certaintyByRawRows[bucket])} ردیف)
                  </strong>
                </div>
              ))}
              <div className="py-1.5 flex items-center justify-between gap-2">
                <span className="text-[#5C4636]">
                  کتاب‌های دارای ارتباط گروهی/ستاره ({toPersianDigits(summary.reviewQueue.multiMartyrGroups.totalGroupsCount)} گروه چندشهیدی)
                </span>
                <strong className="text-[#332218] shrink-0">
                  {toPersianDigits(
                    rels.booksWithLinksBreakdown.booksWithOnlyGroupOrPlaceholderLinks
                  )}{' '}
                  کتاب
                </strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* بخش ۳ از ۳: وضعیت کار و خروجی‌ها (پوشش کامل ۸ شاخص مستقل مصوب)       */}
      {/* ===================================================================== */}
      <section
        id="stats-section-work"
        data-testid="statistics-section-work"
        aria-labelledby="stats-section-work-title"
        className="bg-white border border-[#E5D7C6] rounded-2xl p-5 sm:p-6 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EFE4D6] pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#FAF5EE] border border-[#E5D7C6] text-[#6B3E26] flex items-center justify-center shrink-0">
              <ClipboardList className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] text-[#78604E]">
                بخش ۳ متناظر با کارت سوم داشبورد · پوشش ۸ شاخص مستقل
              </div>
              <h3 id="stats-section-work-title" className="text-base sm:text-lg font-bold">
                وضعیت کار و خروجی‌ها
              </h3>
            </div>
          </div>

          {onSelectDrilldown && (
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => onSelectDrilldown('work_remaining')}
                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#E5D7C6] hover:bg-[#FAF5EE] text-[#332218] font-medium cursor-pointer"
              >
                صف باقیمانده
              </button>
              <button
                type="button"
                onClick={() => onSelectDrilldown('research_outputs')}
                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#E5D7C6] hover:bg-[#FAF5EE] text-[#332218] font-medium cursor-pointer"
              >
                مطالب پژوهشی
              </button>
              <button
                type="button"
                onClick={() => onSelectDrilldown('management_reports')}
                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#E5D7C6] hover:bg-[#FAF5EE] text-[#332218] font-medium cursor-pointer"
              >
                گزارش‌های مدیریتی
              </button>
            </div>
          )}
        </div>

        {/* شاخص‌های ۱، ۲ و ۳ (صف پیگیری) + شاخص ۵ (تاریخچه فعالیت مستقل از صف) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
          <div
            data-testid="stat-work-pv-total"
            className="rounded-xl bg-[#FAF5EE] border border-[#EFE4D6] p-3.5 space-y-1"
          >
            <div className="text-xs text-[#78604E]">۱. کل موارد صف پیگیری</div>
            <div className="text-2xl font-bold text-[#332218]">
              {toPersianDigits(workAnalytics.reviewQueueTotalCount)}
            </div>
            <div className="text-[11px] text-[#5C4636]">
              معادل {toPersianDigits(workAnalytics.independentWorkTopics.totalTopicsCount)} موضوع
              کاری مستقل
            </div>
          </div>

          <div
            data-testid="stat-work-pv-completed"
            className="rounded-xl bg-[#F1F8F3] border border-[#CDE4D2] p-3.5 space-y-1"
          >
            <div className="text-xs text-[#2E6F40]">۲. موارد انجام‌شده از صف پیگیری</div>
            <div className="text-2xl font-bold text-[#2E6F40]">
              {toPersianDigits(workAnalytics.reviewQueueCompletedCount)}
            </div>
            <div className="text-[11px] text-[#2E6F40]">
              {toPersianDigits(pvCompletedPct)}٪ پیشرفت تکمیل صف
            </div>
          </div>

          <div
            data-testid="stat-work-pv-remaining"
            className="rounded-xl bg-[#FAF5EE] border border-[#EFE4D6] p-3.5 space-y-1"
          >
            <div className="text-xs text-[#78604E]">۳. موارد باقیمانده</div>
            <div className="text-2xl font-bold text-[#332218]">
              {toPersianDigits(workAnalytics.reviewQueueRemainingCount)}
            </div>
            <div className="text-[11px] text-[#5C4636]">
              باز: {toPersianDigits(workAnalytics.reviewQueueOpenPlainCount)} · نیازمند منبع:{' '}
              {toPersianDigits(workAnalytics.reviewQueueNeedsSourceCount)}
            </div>
          </div>

          <div
            data-testid="stat-work-activity-log"
            className="rounded-xl bg-[#FAF5EE] border border-[#EFE4D6] p-3.5 space-y-1"
          >
            <div className="text-xs text-[#78604E]">۵. فعالیت‌های تاریخچه (مستقل از صف)</div>
            <div className="text-2xl font-bold text-[#332218]">
              {toPersianDigits(workAnalytics.activityLog.totalEntriesCount)}
            </div>
            <div className="text-[11px] text-[#5C4636]">
              ثبت مستقل در تاریخچه فعالیت سامانه
            </div>
          </div>
        </div>

        {/* شاخص ۴: تفکیک موارد کاری بین کتابخانه، شهدا و ارتباطات */}
        <div
          data-testid="stat-work-domain-breakdown"
          className="rounded-xl border border-[#EFE4D6] p-4 space-y-3 tabular-nums"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-[#332218]">
                ۴. تفکیک موضوعات کاری مستقل بین کتابخانه، شهدا و ارتباطات
              </h4>
              <p className="text-[11px] text-[#78604E] mt-0.5">
                هر مسئله مستقل (حتی موارد چندموضوعی جداشده با «؛» در {toPersianDigits(workAnalytics.independentWorkTopics.compoundRecordsCount)} پرونده صف) یک کار مستقل شمرده می‌شود.
              </p>
            </div>
            <span className="text-xs font-bold text-[#6B3E26]">
              جمع موضوعات صف: {toPersianDigits(workAnalytics.independentWorkTopics.totalTopicsCount)}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[dom.library, dom.martyrs, dom.relations].map((item) => (
              <div
                key={item.domain}
                data-testid={`stat-domain-${item.domain}`}
                className="rounded-xl bg-[#FFFDFA] border border-[#EFE4D6] p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between border-b border-[#F2E9DE] pb-2">
                  <span className="text-sm font-bold text-[#332218]">{item.label}</span>
                  <span className="text-xs font-bold text-[#6B3E26]">
                    {toPersianDigits(item.totalActionableRemainingCount)} کار باز
                  </span>
                </div>
                <div className="space-y-1 text-xs text-[#5C4636]">
                  <div className="flex items-center justify-between">
                    <span>موضوعات صف پیگیری (کل / انجام‌شده)</span>
                    <strong>
                      {toPersianDigits(item.pvTopicsTotal)} /{' '}
                      {toPersianDigits(item.pvTopicsCompleted)}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>باقیمانده در صف پیگیری</span>
                    <strong>{toPersianDigits(item.pvTopicsRemaining)}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>باقیمانده رکوردهای اصلی خارج از صف</span>
                    <strong>{toPersianDigits(item.additionalOpenBacklogCount)}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {workAnalytics.reviewQueueStatusBreakdown.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-[#5C4636]">
              <span className="font-bold text-[#332218]">توزیع وضعیت صف پیگیری:</span>
              {workAnalytics.reviewQueueStatusBreakdown.map((st) => (
                <span
                  key={st.status}
                  className="px-2 py-0.5 rounded-md bg-[#FAF5EE] border border-[#E5D7C6]"
                >
                  {st.status}: <strong>{toPersianDigits(st.count)}</strong>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* شاخص‌های ۶، ۷ و ۸: مطالب استخراج‌شده vs خروجی‌های پژوهشی نهایی مستقل vs گزارش‌های مدیریتی نهایی مستقل */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 tabular-nums">
          {/* شاخص ۶ */}
          <div
            data-testid="stat-work-extracted-research"
            className="rounded-xl border border-[#EFE4D6] p-4 space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs sm:text-sm font-bold text-[#332218]">
                ۶. مطالب و موارد پژوهشی استخراج‌شده
              </h4>
              <span className="text-lg font-bold text-[#332218]">
                {toPersianDigits(
                  workAnalytics.researchOutputs.totalExtractedNonRejectedCount
                )}
              </span>
            </div>
            <div className="divide-y divide-[#F0E6D8] text-xs text-[#5C4636]">
              <div className="py-1.5 flex items-center justify-between">
                <span>تأییدشده کارشناسی / نهایی</span>
                <strong>
                  {toPersianDigits(workAnalytics.researchOutputs.breakdownByStatus.expertApproved)}
                </strong>
              </div>
              <div className="py-1.5 flex items-center justify-between">
                <span>بررسی‌شده در پژوهش اصلی</span>
                <strong>
                  {toPersianDigits(
                    workAnalytics.researchOutputs.breakdownByStatus.baseResearchReviewed
                  )}
                </strong>
              </div>
              <div className="py-1.5 flex items-center justify-between">
                <span>نیازمند بررسی</span>
                <strong>
                  {toPersianDigits(workAnalytics.researchOutputs.breakdownByStatus.needsReview)}
                </strong>
              </div>
              <div className="py-1.5 flex items-center justify-between">
                <span>پیش‌نویس یا خام اولیه</span>
                <strong>
                  {toPersianDigits(workAnalytics.researchOutputs.breakdownByStatus.rawOrDraft)}
                </strong>
              </div>
            </div>
          </div>

          {/* شاخص ۷ */}
          <div
            data-testid="stat-work-final-research"
            className="rounded-xl border border-[#EFE4D6] p-4 space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs sm:text-sm font-bold text-[#332218]">
                ۷. خروجی‌های پژوهشی نهایی و مستقل
              </h4>
              <span className="text-lg font-bold text-[#2E6F40]">
                {toPersianDigits(
                  workAnalytics.researchOutputs.finalIndependentOutputsCount
                )}
              </span>
            </div>
            <p className="text-[11px] text-[#78604E] leading-relaxed">
              پیش‌نویس‌ها و پژوهش‌های اولیه خروجی نهایی محسوب نمی‌شوند و نسخه‌های متعدد یک محصول پژوهشی فقط یک خروجی مستقل شمرده می‌شوند.
            </p>
            <div className="divide-y divide-[#F0E6D8] text-xs text-[#5C4636]">
              <div className="py-1.5 flex items-center justify-between">
                <span>موارد غیرنهایی / پیش‌نویس تفکیک‌شده</span>
                <strong>
                  {toPersianDigits(
                    workAnalytics.researchOutputs.nonFinalOrDraftExtractedCount
                  )}
                </strong>
              </div>
              <div className="py-1.5 flex items-center justify-between">
                <span>نسخه‌های تکراری تجمیع‌شده</span>
                <strong>
                  {toPersianDigits(
                    workAnalytics.researchOutputs.duplicateVersionsCollapsedCount
                  )}
                </strong>
              </div>
            </div>
          </div>

          {/* شاخص ۸ */}
          <div
            data-testid="stat-work-final-reports"
            className="rounded-xl border border-[#EFE4D6] p-4 space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs sm:text-sm font-bold text-[#332218]">
                ۸. گزارش‌های مدیریتی نهایی و مستقل
              </h4>
              <span className="text-lg font-bold text-[#6B3E26]">
                {toPersianDigits(
                  workAnalytics.managementReports.finalIndependentReportsCount
                )}
              </span>
            </div>
            <p className="text-[11px] text-[#78604E] leading-relaxed">
              محاسبه‌شده از سابقه واقعی صدور گزارش در دستگاه (گزارش‌های ناموفق/پیش‌نویس حذف و نسخه‌های تکراری یک گزارش تجمیع شده‌اند).
            </p>
            <div className="divide-y divide-[#F0E6D8] text-xs text-[#5C4636]">
              <div className="py-1.5 flex items-center justify-between">
                <span>گزارش اکسل / ساختاریافته مستقل</span>
                <strong>
                  {toPersianDigits(workAnalytics.managementReports.byFileType.excel)} اکسل ·{' '}
                  {toPersianDigits(workAnalytics.managementReports.byFileType.json)} بسته داده
                </strong>
              </div>
              <div className="py-1.5 flex items-center justify-between">
                <span>کل صدورهای موفق ثبت‌شده / نسخه‌های تجمیع‌شده</span>
                <strong>
                  {toPersianDigits(
                    workAnalytics.managementReports.rawSuccessfulIssuancesCount
                  )}{' '}
                  /{' '}
                  {toPersianDigits(
                    workAnalytics.managementReports.duplicateVersionsCollapsedCount
                  )}
                </strong>
              </div>
              {workAnalytics.managementReports.latestIssuedAtDisplay && (
                <div className="py-1.5 flex items-center justify-between">
                  <span>آخرین تاریخ صدور معتبر</span>
                  <strong>{workAnalytics.managementReports.latestIssuedAtDisplay}</strong>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* تفکیک انواع رویداد تاریخچه فعالیت (اگر فعالیتی ثبت شده باشد) */}
        {workAnalytics.activityLog.byActionType.length > 0 && (
          <div className="rounded-xl bg-[#FAF5EE] border border-[#EFE4D6] p-3.5 space-y-2 text-xs tabular-nums">
            <div className="flex items-center gap-1.5 font-bold text-[#332218]">
              <CheckCircle2 className="w-4 h-4 text-[#2E6F40]" />
              <span>تفکیک فعالیت‌های ثبت‌شده در تاریخچه ({toPersianDigits(workAnalytics.activityLog.totalEntriesCount)} رویداد)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {workAnalytics.activityLog.byActionType.map((entry) => (
                <span
                  key={entry.actionType}
                  className="px-2.5 py-1 rounded-lg bg-white border border-[#E5D7C6] text-[#5C4636]"
                >
                  {entry.actionType}: <strong>{toPersianDigits(entry.count)}</strong>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
