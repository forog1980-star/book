import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  Link2,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { toPersianDigits } from '../../../data/markazAsnadData';
import { registerInnerBackStep } from '../../../utils/navigationHistory';
import { filterExportHistoryRecordsPure } from '../export/exportHistoryStore';
import {
  RELATION_CERTAINTY_DISPLAY_LABELS,
  type DashboardBookListItem,
  type DashboardMartyrListItem,
  type DashboardRelationListItem,
  type DashboardSummaryResult,
  type ExecutiveExportHistoryRecord,
  type RelationCertaintyBucket,
} from '../types';
import type {
  DashboardBookFilterKey,
  DashboardDossierStackEntry,
  DashboardMartyrFilterKey,
  ExecutiveDashboardSection,
  ExecutiveDashboardViewState,
} from './ExecutiveDashboardView';

interface ExecutiveDetailedReportsViewProps {
  summary: DashboardSummaryResult;
  books: DashboardBookListItem[];
  martyrs: DashboardMartyrListItem[];
  relations: DashboardRelationListItem[];
  bookMap: Map<string, DashboardBookListItem>;
  martyrMap: Map<string, DashboardMartyrListItem>;
  viewState: ExecutiveDashboardViewState;
  exportHistory: ExecutiveExportHistoryRecord[];
  historyLoading: boolean;
  isExportingExcel: boolean;
  onUpdateViewState: (
    updater:
      | Partial<ExecutiveDashboardViewState>
      | ((prev: ExecutiveDashboardViewState) => ExecutiveDashboardViewState)
  ) => void;
  onBackToOverview: () => void;
  onExportExcel: () => Promise<void>;
  onExportJson: () => Promise<void>;
  onDeleteHistoryItem: (exportId: string) => Promise<void>;
  onPushDossier: (entry: DashboardDossierStackEntry) => void;
  onRequestLoadGolzarBank?: () => void;
}

export const ExecutiveDetailedReportsView: React.FC<ExecutiveDetailedReportsViewProps> = ({
  summary,
  books,
  martyrs,
  relations,
  martyrMap,
  viewState,
  exportHistory,
  historyLoading,
  isExportingExcel,
  onUpdateViewState,
  onBackToOverview,
  onExportExcel,
  onExportJson,
  onDeleteHistoryItem,
  onPushDossier,
  onRequestLoadGolzarBank,
}) => {
  const isGolzarLoaded = summary.martyrs.officialBank.hasOfficialBankLoaded;

  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'excel' | 'json'>('all');
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [booksVisibleLimit, setBooksVisibleLimit] = useState(60);
  const [martyrsVisibleLimit, setMartyrsVisibleLimit] = useState(60);
  const [relationsVisibleLimit, setRelationsVisibleLimit] = useState(60);

  // ثبت مرحله بازگشت داخلی برای دکمه Back گوشی/مرورگر جهت بازگشت به نمای سه‌کادره داشبورد
  useEffect(() => {
    return registerInnerBackStep('executive-dashboard-detailed-reports', onBackToOverview);
  }, [onBackToOverview]);

  const filteredBooks = useMemo(() => {
    const q = viewState.bookSearch.trim().toLowerCase();
    return books.filter((b) => {
      if (
        viewState.bookFilter === 'completed_without_ticket' &&
        b.managerialStatus !== 'completed_without_ticket'
      ) {
        return false;
      }
      if (
        viewState.bookFilter === 'open_duplicate_ticket' &&
        b.managerialStatus !== 'open_duplicate_ticket'
      ) {
        return false;
      }
      if (viewState.bookFilter === 'unreviewed' && b.managerialStatus !== 'unreviewed') {
        return false;
      }
      if (viewState.bookFilter === 'has_named_martyr' && !b.hasNamedMartyrLink) {
        return false;
      }
      if (viewState.bookFilter === 'group_only' && !b.hasGroupOrPlaceholderOnly) {
        return false;
      }
      if (viewState.bookFilter === 'has_any_link' && !b.hasActiveLink) {
        return false;
      }
      if (viewState.bookFilter === 'no_link' && b.hasActiveLink) {
        return false;
      }
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        b.tempBookId.toLowerCase().includes(q) ||
        b.publisher.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.relations.some((r) => r.martyrName.toLowerCase().includes(q))
      );
    });
  }, [books, viewState.bookFilter, viewState.bookSearch]);

  const filteredMartyrs = useMemo(() => {
    const q = viewState.martyrSearch.trim().toLowerCase();
    return martyrs.filter((m) => {
      if (viewState.martyrFilter === 'confirmed' && m.identityStatus !== 'confirmed') {
        return false;
      }
      if (
        viewState.martyrFilter === 'needs_verification' &&
        m.identityStatus !== 'needs_verification'
      ) {
        return false;
      }
      if (viewState.martyrFilter === 'has_warning' && m.discrepancyWarnings.length === 0) {
        return false;
      }
      if (viewState.martyrFilter === 'custom_martyrs' && !m.customMartyrId) {
        return false;
      }
      if (!q) return true;
      return (
        m.fullName.toLowerCase().includes(q) ||
        m.displayCode.toLowerCase().includes(q) ||
        (m.graveAddress || '').toLowerCase().includes(q) ||
        m.linkedBooks.some((lb) => lb.bookTitle.toLowerCase().includes(q))
      );
    });
  }, [martyrs, viewState.martyrFilter, viewState.martyrSearch]);

  const filteredRelations = useMemo(() => {
    const q = viewState.relationSearch.trim().toLowerCase();
    return relations.filter((r) => {
      if (
        viewState.relationCertaintyFilter !== 'all' &&
        r.certaintyBucket !== viewState.relationCertaintyFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        r.bookTitle.toLowerCase().includes(q) ||
        r.martyrName.toLowerCase().includes(q) ||
        r.linkId.toLowerCase().includes(q) ||
        r.tempBookId.toLowerCase().includes(q) ||
        r.sourceDescriptionRaw.toLowerCase().includes(q)
      );
    });
  }, [relations, viewState.relationCertaintyFilter, viewState.relationSearch]);

  const filteredHistory = useMemo(
    () =>
      filterExportHistoryRecordsPure(exportHistory, {
        fileType: historyTypeFilter,
        query: historySearchQuery,
      }),
    [exportHistory, historyTypeFilter, historySearchQuery]
  );

  return (
    <div
      data-testid="executive-detailed-reports-view"
      className="max-w-7xl mx-auto px-3 sm:px-6 pt-3 pb-10 space-y-5 text-[#332218]"
    >
      {/* Detailed Sub-Page Header */}
      <div className="bg-white border border-[#E2D2BE] rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#78604E]">
            <span>داشبورد مدیریتی مرکز اسناد</span>
            <span aria-hidden="true">·</span>
            <span>گزارش‌های تفصیلی، فیلترها و خروجی‌ها</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-[#332218]">
            آمار و گزارش‌های تفصیلی
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="dashboard-export-excel-btn"
            onClick={() => void onExportExcel()}
            disabled={isExportingExcel}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#2E6F40] hover:bg-[#245932] disabled:opacity-60 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>{isExportingExcel ? 'در حال تولید اکسل...' : 'اکسل مدیریتی (۵ شیت)'}</span>
          </button>

          <button
            type="button"
            data-testid="dashboard-export-json-btn"
            onClick={() => void onExportJson()}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#FAF5EE] hover:bg-[#EFE4D6] text-[#332218] border border-[#E2D2BE] text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>خروجی JSON مدیریتی</span>
          </button>

          <button
            type="button"
            data-testid="detailed-back-to-overview-btn"
            onClick={onBackToOverview}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#6B3E26] hover:bg-[#56311E] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowRight className="w-4 h-4 shrink-0" />
            <span>بازگشت به داشبورد</span>
          </button>
        </div>
      </div>

      {/* Loading Notice for 28,368 Golzar Bank */}
      {!isGolzarLoaded && (
        <div
          data-testid="golzar-bank-loading-notice"
          className="bg-[#FFF9F2] border border-[#E2C29B] rounded-2xl p-3.5 text-xs sm:text-sm text-[#5C4636] flex flex-wrap items-center justify-between gap-2"
        >
          <span>
            در حال بارگذاری بانک رسمی ۲۸٬۳۶۸ شهید گلزار شهدای تهران برای تکمیل تطبیق هم‌نام‌ها و شهدای دستی...
          </span>
          {onRequestLoadGolzarBank && (
            <button
              type="button"
              onClick={onRequestLoadGolzarBank}
              className="min-h-[38px] px-3 py-1 rounded-xl bg-[#6B3E26] text-white text-xs font-bold cursor-pointer"
            >
              تلاش مجدد بارگذاری
            </button>
          )}
        </div>
      )}

      {/* Segmented Section Tabs */}
      <div
        role="tablist"
        aria-label="بخش‌های گزارش‌های تفصیلی"
        className="flex flex-wrap items-center gap-1.5 bg-[#EFE4D6]/60 p-1.5 rounded-2xl border border-[#E2D2BE]"
      >
        {(
          [
            { id: 'overview', label: 'مرور کلی و شاخص‌ها' },
            { id: 'books', label: `کتاب‌ها (${toPersianDigits(books.length)})` },
            { id: 'martyrs', label: `شهدا (${toPersianDigits(martyrs.length)})` },
            { id: 'relations', label: `روابط (${toPersianDigits(relations.length)})` },
            {
              id: 'warnings',
              label: `هشدارها و تطبیق (${toPersianDigits(
                summary.martyrs.linkedMartyrsSummary.discrepancyWarnings.length +
                  summary.martyrs.customMartyrs.totalCount
              )})`,
            },
            { id: 'exports', label: `خروجی‌ها و سابقه (${toPersianDigits(exportHistory.length)})` },
          ] as Array<{ id: ExecutiveDashboardSection; label: string }>
        ).map((tabItem) => {
          const isActive = viewState.activeSection === tabItem.id;
          return (
            <button
              key={tabItem.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onUpdateViewState({ activeSection: tabItem.id })}
              className={`min-h-[42px] px-3 sm:px-4 py-1.5 rounded-xl text-xs sm:text-sm font-bold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                isActive
                  ? 'bg-white text-[#6B3E26] border border-[#E2D2BE] shadow-2xs'
                  : 'text-[#5C4636] hover:bg-white/60'
              }`}
            >
              {tabItem.label}
            </button>
          );
        })}
      </div>

      {/* SECTION: OVERVIEW (DETAILED KPIs) */}
      {viewState.activeSection === 'overview' && (
        <div className="space-y-5">
          {/* 3 Primary KPI Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* KPI 1: مرتبط با شهدا */}
            <div className="bg-white border border-[#E2D2BE] rounded-2xl p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-[#EFE4D6] pb-2.5">
                <h3 className="text-base font-bold text-[#332218]">
                  {summary.martyrRelatedKpi.title}
                </h3>
                <span className="text-xs text-[#78604E]">کتاب‌ها و شهدا</span>
              </div>

              <div className="space-y-2.5">
                <div>
                  <div className="text-2xl sm:text-3xl font-bold text-[#6B3E26] tabular-nums">
                    {toPersianDigits(summary.martyrRelatedKpi.relatedBooksWithNamedMartyrsCount)}
                    <span className="text-xs font-semibold text-[#5C4636] mr-1.5">
                      کتاب با شهید نام‌دار
                    </span>
                  </div>
                  <div className="text-xs text-[#5C4636] mt-1 tabular-nums leading-relaxed">
                    زیرشاخص:{' '}
                    <strong>
                      {toPersianDigits(summary.martyrRelatedKpi.relatedBooksGroupOnlyCount)}
                    </strong>{' '}
                    گروهی / نیازمند تفکیک
                    <span className="mx-1.5">·</span>
                    مجموع تکمیلی:{' '}
                    <strong>
                      {toPersianDigits(
                        summary.martyrRelatedKpi.relatedBooksIncludingGroupLinksCount
                      )}
                    </strong>{' '}
                    کتاب دارای رکورد ارتباط
                  </div>
                </div>

                <div className="pt-2.5 border-t border-[#EFE4D6] grid grid-cols-3 gap-2 text-center">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateViewState({ activeSection: 'martyrs', martyrFilter: 'confirmed' })
                    }
                    className="p-2 rounded-xl bg-[#FAF5EE] hover:bg-[#EFE4D6] transition-colors cursor-pointer"
                  >
                    <div className="text-lg font-bold text-[#2E6F40] tabular-nums">
                      {toPersianDigits(summary.martyrRelatedKpi.confirmedUniqueLinkedMartyrsCount)}
                    </div>
                    <div className="text-[11px] text-[#5C4636]">هویت احرازشده</div>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateViewState({
                        activeSection: 'martyrs',
                        martyrFilter: 'needs_verification',
                      })
                    }
                    className="p-2 rounded-xl bg-[#FAF5EE] hover:bg-[#EFE4D6] transition-colors cursor-pointer"
                  >
                    <div className="text-lg font-bold text-[#8A4B16] tabular-nums">
                      {toPersianDigits(
                        summary.martyrRelatedKpi.ambiguousOrUnverifiedLinkedNamesCount
                      )}
                    </div>
                    <div className="text-[11px] text-[#5C4636]">نیازمند احراز</div>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateViewState({
                        activeSection: 'relations',
                        relationCertaintyFilter: 'confirmedByExpert',
                      })
                    }
                    className="p-2 rounded-xl bg-[#FAF5EE] hover:bg-[#EFE4D6] transition-colors cursor-pointer"
                  >
                    <div className="text-lg font-bold text-[#332218] tabular-nums">
                      {toPersianDigits(summary.martyrRelatedKpi.expertConfirmedRelationsCount)}
                    </div>
                    <div className="text-[11px] text-[#5C4636]">تأیید کارشناسی</div>
                  </button>
                </div>
              </div>
            </div>

            {/* KPI 2: کل کتاب‌ها */}
            <div className="bg-white border border-[#E2D2BE] rounded-2xl p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-[#EFE4D6] pb-2.5">
                <h3 className="text-base font-bold text-[#332218]">
                  {summary.totalBooksKpi.title}
                </h3>
                <span className="text-xs text-[#78604E]">پایش فهرست</span>
              </div>

              <div>
                <div className="text-2xl sm:text-3xl font-bold text-[#332218] tabular-nums">
                  {toPersianDigits(summary.totalBooksKpi.totalTrackedBooksCount)}
                  <span className="text-xs font-semibold text-[#5C4636] mr-1.5">
                    {summary.totalBooksKpi.subtitle}
                  </span>
                </div>
              </div>

              <div className="pt-2.5 border-t border-[#EFE4D6] space-y-1.5 text-xs text-[#5C4636] tabular-nums">
                <div className="flex justify-between">
                  <span>عناوین یکتای دقیق:</span>
                  <strong className="text-[#332218]">
                    {toPersianDigits(summary.totalBooksKpi.exactUniqueTitlesCount)} عنوان
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span>گروه‌های دارای عنوان مشابه:</span>
                  <strong className="text-[#332218]">
                    {toPersianDigits(summary.totalBooksKpi.similarTitleGroupsCount)} گروه
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span>کتاب‌های خارج از فهرست اولیه:</span>
                  <strong className="text-[#332218]">
                    {toPersianDigits(summary.totalBooksKpi.outsideCatalogBooksCount)} عنوان
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span>نسخه‌های فیزیکی ثبت‌شده (CP):</span>
                  <strong className="text-[#332218]">
                    {toPersianDigits(summary.totalBooksKpi.registeredPhysicalCopiesCount)} جلد
                  </strong>
                </div>
              </div>
            </div>

            {/* KPI 3: وضعیت بررسی کتاب‌ها (گزینه ج) */}
            <div className="bg-white border border-[#E2D2BE] rounded-2xl p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-[#EFE4D6] pb-2.5">
                <h3 className="text-base font-bold text-[#332218]">
                  {summary.bookReviewStatusKpi.title}
                </h3>
                <span className="text-xs text-[#78604E]">افراز قطعی (گزینه ج)</span>
              </div>

              <div className="space-y-1.5 text-xs sm:text-sm tabular-nums">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateViewState({
                      activeSection: 'books',
                      bookFilter: 'completed_without_ticket',
                    })
                  }
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[#FAF5EE] hover:bg-[#EFE4D6] text-right cursor-pointer transition-colors"
                >
                  <span>تکمیل‌شده بدون تیکت باز</span>
                  <strong className="text-[#2E6F40]">
                    {toPersianDigits(summary.bookReviewStatusKpi.completedWithoutOpenTicketCount)}
                  </strong>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onUpdateViewState({
                      activeSection: 'books',
                      bookFilter: 'open_duplicate_ticket',
                    })
                  }
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[#FFF9F2] hover:bg-[#EFE4D6] text-right cursor-pointer transition-colors"
                >
                  <span>دارای تیکت باز تکرار عنوان</span>
                  <strong className="text-[#8A4B16]">
                    {toPersianDigits(summary.bookReviewStatusKpi.openBookTicketCount)}
                  </strong>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onUpdateViewState({
                      activeSection: 'books',
                      bookFilter: 'unreviewed',
                    })
                  }
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[#FAF5EE] hover:bg-[#EFE4D6] text-right cursor-pointer transition-colors"
                >
                  <span>بررسی‌نشده</span>
                  <strong className="text-[#332218]">
                    {toPersianDigits(summary.bookReviewStatusKpi.unreviewedCount)}
                  </strong>
                </button>
              </div>

              <div className="pt-2 border-t border-[#EFE4D6] flex items-center justify-between text-xs text-[#5C4636] tabular-nums">
                <span>جمع کل بدون هم‌پوشانی:</span>
                <strong className="text-[#332218]">
                  {toPersianDigits(summary.bookReviewStatusKpi.totalTrackedBooksCount)} کتاب
                </strong>
              </div>
            </div>
          </div>

          {/* Relations Certainty Breakdown */}
          <div className="bg-white border border-[#E2D2BE] rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EFE4D6] pb-2.5">
              <h3 className="text-base font-bold text-[#332218]">
                وضعیت قطعیت و اعتبارسنجی پیوندهای کتاب و شهید (
                {toPersianDigits(summary.relations.totalRawLinkRows)} رکورد)
              </h3>
              <span className="text-xs text-[#78604E]">
                مبنای آمار کارشناسی: فقط پیوندهای تأییدشده توسط کارشناس
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              {(
                [
                  'confirmedByExpert',
                  'probable',
                  'needsReview',
                  'undetermined',
                  'rejected',
                ] as RelationCertaintyBucket[]
              ).map((bucketKey) => (
                <button
                  key={bucketKey}
                  type="button"
                  onClick={() =>
                    onUpdateViewState({
                      activeSection: 'relations',
                      relationCertaintyFilter: bucketKey,
                    })
                  }
                  className="p-3 rounded-xl bg-[#FAF5EE] hover:bg-[#EFE4D6] border border-[#E2D2BE] text-right space-y-1 cursor-pointer transition-colors"
                >
                  <div className="text-xl font-bold text-[#332218] tabular-nums">
                    {toPersianDigits(summary.relations.certaintyByRawRows[bucketKey])}
                  </div>
                  <div className="text-xs font-semibold text-[#5C4636] leading-snug">
                    {RELATION_CERTAINTY_DISPLAY_LABELS[bucketKey]}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Official Golzar Bank & Temporal Audit Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-[#E2D2BE] rounded-2xl p-4 sm:p-5 space-y-2.5">
              <h3 className="text-sm sm:text-base font-bold text-[#332218] border-b border-[#EFE4D6] pb-2">
                وضعیت بانک مرجع ۲۸٬۳۶۸ شهید گلزار تهران
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs text-[#5C4636] tabular-nums">
                <div>
                  کل ردیف‌های بانک:{' '}
                  <strong className="text-[#332218]">
                    {isGolzarLoaded
                      ? toPersianDigits(summary.martyrs.officialBank.totalRows)
                      : 'در حال بارگذاری...'}
                  </strong>
                </div>
                <div>
                  شهدای نام‌دار:{' '}
                  <strong className="text-[#332218]">
                    {isGolzarLoaded
                      ? toPersianDigits(summary.martyrs.officialBank.namedMartyrRowsCount)
                      : '—'}
                  </strong>
                </div>
                <div>
                  شهید گمنام:{' '}
                  <strong className="text-[#332218]">
                    {isGolzarLoaded
                      ? toPersianDigits(summary.martyrs.officialBank.unknownMartyrRowsCount)
                      : '—'}
                  </strong>
                </div>
                <div>
                  غیرشهید (اموات):{' '}
                  <strong className="text-[#332218]">
                    {isGolzarLoaded
                      ? toPersianDigits(summary.martyrs.officialBank.nonMartyrRowsCount)
                      : '—'}
                  </strong>
                </div>
              </div>
              <p className="text-xs text-[#78604E]">
                هم‌نام‌ها در بانک رسمی هرگز ادغام خودکار نمی‌شوند و تفکیک با نام پدر و مختصات مزار حفظ می‌گردد.
              </p>
            </div>

            <div className="bg-white border border-[#E2D2BE] rounded-2xl p-4 sm:p-5 space-y-2.5">
              <h3 className="text-sm sm:text-base font-bold text-[#332218] border-b border-[#EFE4D6] pb-2">
                ممیزی زمانی و عملکرد دوره‌ای
              </h3>
              <div className="text-xs text-[#5C4636] space-y-1.5 tabular-nums leading-relaxed">
                <div>
                  رکوردهای پایه بدون مهر زمان (کاتالوگ، پیوندها، صف PV، بانک گلزار):{' '}
                  <strong className="text-[#332218]">
                    {toPersianDigits(
                      summary.temporalAudit.structurallyDatelessSources.totalDatelessRecordsCount
                    )}
                  </strong>{' '}
                  رکورد (در عملکرد دوره‌ای شمارش نمی‌شوند).
                </div>
                <div>
                  رویدادهای ثبت‌شده دارای مهر زمان معتبر:{' '}
                  <strong className="text-[#2E6F40]">
                    {toPersianDigits(summary.temporalAudit.totalValidTimestampRecords)}
                  </strong>{' '}
                  مورد
                  {summary.temporalAudit.monthlyActivity.length > 0 && (
                    <span>
                      {' '}
                      (در {toPersianDigits(summary.temporalAudit.monthlyActivity.length)} ماه فعال)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION: BOOKS */}
      {viewState.activeSection === 'books' && (
        <div className="bg-white border border-[#E2D2BE] rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-[#78604E] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={viewState.bookSearch}
                onChange={(e) => {
                  setBooksVisibleLimit(60);
                  onUpdateViewState({ bookSearch: e.target.value });
                }}
                placeholder="جست‌وجوی عنوان، شناسه BK، ناشر یا نام شهید..."
                className="w-full min-h-[44px] pr-9 pl-3 py-2 rounded-xl border border-[#E2D2BE] bg-[#FAF5EE] text-sm text-[#332218] focus:outline-none focus:border-[#6B3E26]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { key: 'all', label: 'همه' },
                  { key: 'open_duplicate_ticket', label: 'تیکت باز تکرار (۱۰)' },
                  { key: 'unreviewed', label: 'بررسی‌نشده' },
                  { key: 'completed_without_ticket', label: 'تکمیل‌شده' },
                  { key: 'has_named_martyr', label: 'دارای شهید نام‌دار' },
                  { key: 'group_only', label: 'گروهی / تفکیک' },
                ] as Array<{ key: DashboardBookFilterKey; label: string }>
              ).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => {
                    setBooksVisibleLimit(60);
                    onUpdateViewState({ bookFilter: f.key });
                  }}
                  className={`min-h-[38px] px-3 py-1 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                    viewState.bookFilter === f.key
                      ? 'bg-[#6B3E26] text-white'
                      : 'bg-[#FAF5EE] hover:bg-[#EFE4D6] text-[#332218] border border-[#E2D2BE]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs text-[#78604E] tabular-nums">
            نمایش {toPersianDigits(Math.min(booksVisibleLimit, filteredBooks.length))} از{' '}
            {toPersianDigits(filteredBooks.length)} کتاب
          </div>

          {filteredBooks.length === 0 ? (
            <div className="p-6 text-center text-sm text-[#78604E] border border-[#EFE4D6] rounded-xl">
              هیچ کتابی با فیلتر یا عبارت جست‌وجوی فعلی یافت نشد.
            </div>
          ) : (
            <div className="divide-y divide-[#EFE4D6] border border-[#EFE4D6] rounded-2xl overflow-hidden">
              {filteredBooks.slice(0, booksVisibleLimit).map((book) => (
                <div
                  key={book.bookKey}
                  className="p-3.5 hover:bg-[#FAF5EE]/70 transition-colors flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#78604E]">
                      <span className="font-mono font-semibold text-[#6B3E26] tabular-nums" dir="ltr">
                        {book.tempBookId}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{book.managerialStatusLabel}</span>
                      {book.openTicketIds.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-[#8A4B16]" dir="ltr">
                            {book.openTicketIds.join('، ')}
                          </span>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onPushDossier({ type: 'book', key: book.bookKey })}
                      className="text-right font-bold text-sm sm:text-base text-[#332218] hover:text-[#6B3E26] hover:underline cursor-pointer block"
                    >
                      {book.title}
                    </button>

                    <div className="text-xs text-[#5C4636] tabular-nums">
                      ناشر: {book.publisher || 'ثبت‌نشده'}
                      <span className="mx-1.5">·</span>
                      شهدا/پیوندها: {toPersianDigits(book.relations.length)}
                      {book.locationDisplay && (
                        <>
                          <span className="mx-1.5">·</span>
                          محل: {book.locationDisplay}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onPushDossier({ type: 'book', key: book.bookKey })}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#FAF5EE] hover:bg-[#EFE4D6] text-[#6B3E26] border border-[#E2D2BE] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>پرونده خلاصه</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {filteredBooks.length > booksVisibleLimit && (
            <button
              type="button"
              onClick={() => setBooksVisibleLimit((n) => n + 80)}
              className="w-full min-h-[44px] py-2 rounded-xl bg-[#FAF5EE] hover:bg-[#EFE4D6] border border-[#E2D2BE] text-xs font-bold text-[#6B3E26] cursor-pointer"
            >
              نمایش بیشتر ({toPersianDigits(filteredBooks.length - booksVisibleLimit)} کتاب دیگر)
            </button>
          )}
        </div>
      )}

      {/* SECTION: MARTYRS */}
      {viewState.activeSection === 'martyrs' && (
        <div className="bg-white border border-[#E2D2BE] rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-[#78604E] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={viewState.martyrSearch}
                onChange={(e) => {
                  setMartyrsVisibleLimit(60);
                  onUpdateViewState({ martyrSearch: e.target.value });
                }}
                placeholder="جست‌وجوی نام شهید، کد MR/گلزار، مزار یا عنوان کتاب..."
                className="w-full min-h-[44px] pr-9 pl-3 py-2 rounded-xl border border-[#E2D2BE] bg-[#FAF5EE] text-sm text-[#332218] focus:outline-none focus:border-[#6B3E26]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { key: 'all', label: 'همه' },
                  { key: 'confirmed', label: 'احرازشده' },
                  { key: 'needs_verification', label: 'نیازمند احراز' },
                  { key: 'has_warning', label: 'دارای هشدار کارشناسی' },
                  { key: 'custom_martyrs', label: 'شهدای دستی (MR)' },
                ] as Array<{ key: DashboardMartyrFilterKey; label: string }>
              ).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => {
                    setMartyrsVisibleLimit(60);
                    onUpdateViewState({ martyrFilter: f.key });
                  }}
                  className={`min-h-[38px] px-3 py-1 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                    viewState.martyrFilter === f.key
                      ? 'bg-[#6B3E26] text-white'
                      : 'bg-[#FAF5EE] hover:bg-[#EFE4D6] text-[#332218] border border-[#E2D2BE]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs text-[#78604E] tabular-nums">
            نمایش {toPersianDigits(Math.min(martyrsVisibleLimit, filteredMartyrs.length))} از{' '}
            {toPersianDigits(filteredMartyrs.length)} شهید
          </div>

          {filteredMartyrs.length === 0 ? (
            <div className="p-6 text-center text-sm text-[#78604E] border border-[#EFE4D6] rounded-xl">
              هیچ شهیدی با این فیلتر یافت نشد.
            </div>
          ) : (
            <div className="divide-y divide-[#EFE4D6] border border-[#EFE4D6] rounded-2xl overflow-hidden">
              {filteredMartyrs.slice(0, martyrsVisibleLimit).map((m) => (
                <div
                  key={m.martyrKey}
                  className="p-3.5 hover:bg-[#FAF5EE]/70 transition-colors flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#78604E]">
                      <span className="font-mono font-semibold text-[#6B3E26] tabular-nums" dir="ltr">
                        {m.displayCode}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          m.identityStatus === 'confirmed'
                            ? 'font-semibold text-[#2E6F40]'
                            : 'font-semibold text-[#8A4B16]'
                        }
                      >
                        {m.identityStatusLabel}
                      </span>
                      {m.discrepancyWarnings.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#A63A3A] font-semibold">دارای هشدار کارشناسی</span>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onPushDossier({ type: 'martyr', key: m.martyrKey })}
                      className="text-right font-bold text-sm sm:text-base text-[#332218] hover:text-[#6B3E26] hover:underline cursor-pointer block"
                    >
                      {m.fullName}
                    </button>

                    <div className="text-xs text-[#5C4636] tabular-nums">
                      مزار: {m.graveAddress || 'ثبت‌نشده'}
                      <span className="mx-1.5">·</span>
                      کتاب‌های مرتبط: {toPersianDigits(m.linkedBooksCount)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onPushDossier({ type: 'martyr', key: m.martyrKey })}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#FAF5EE] hover:bg-[#EFE4D6] text-[#6B3E26] border border-[#E2D2BE] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>پرونده خلاصه</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {filteredMartyrs.length > martyrsVisibleLimit && (
            <button
              type="button"
              onClick={() => setMartyrsVisibleLimit((n) => n + 80)}
              className="w-full min-h-[44px] py-2 rounded-xl bg-[#FAF5EE] hover:bg-[#EFE4D6] border border-[#E2D2BE] text-xs font-bold text-[#6B3E26] cursor-pointer"
            >
              نمایش بیشتر ({toPersianDigits(filteredMartyrs.length - martyrsVisibleLimit)} شهید دیگر)
            </button>
          )}
        </div>
      )}

      {/* SECTION: RELATIONS */}
      {viewState.activeSection === 'relations' && (
        <div className="bg-white border border-[#E2D2BE] rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-[#78604E] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={viewState.relationSearch}
                onChange={(e) => {
                  setRelationsVisibleLimit(60);
                  onUpdateViewState({ relationSearch: e.target.value });
                }}
                placeholder="جست‌وجوی شناسه RL، عنوان کتاب، نام شهید یا موضوع صفحه..."
                className="w-full min-h-[44px] pr-9 pl-3 py-2 rounded-xl border border-[#E2D2BE] bg-[#FAF5EE] text-sm text-[#332218] focus:outline-none focus:border-[#6B3E26]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { key: 'all', label: 'همه' },
                  { key: 'confirmedByExpert', label: 'تأیید کارشناسی' },
                  { key: 'probable', label: 'دارای مزار (بررسی‌نشده)' },
                  { key: 'needsReview', label: 'نیازمند بررسی' },
                  { key: 'undetermined', label: 'بدون مزار' },
                  { key: 'rejected', label: 'ردشده' },
                ] as Array<{ key: 'all' | RelationCertaintyBucket; label: string }>
              ).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => {
                    setRelationsVisibleLimit(60);
                    onUpdateViewState({ relationCertaintyFilter: f.key });
                  }}
                  className={`min-h-[38px] px-3 py-1 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                    viewState.relationCertaintyFilter === f.key
                      ? 'bg-[#6B3E26] text-white'
                      : 'bg-[#FAF5EE] hover:bg-[#EFE4D6] text-[#332218] border border-[#E2D2BE]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs text-[#78604E] tabular-nums">
            نمایش {toPersianDigits(Math.min(relationsVisibleLimit, filteredRelations.length))} از{' '}
            {toPersianDigits(filteredRelations.length)} پیوند
          </div>

          <div className="divide-y divide-[#EFE4D6] border border-[#EFE4D6] rounded-2xl overflow-hidden">
            {filteredRelations.slice(0, relationsVisibleLimit).map((rel) => (
              <div key={rel.linkId} className="p-3.5 space-y-1.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold text-[#6B3E26] tabular-nums" dir="ltr">
                      {rel.linkId}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-[#332218]">{rel.certaintyLabel}</span>
                    {rel.pageReferenceRaw && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums text-[#5C4636]">
                          ص {toPersianDigits(rel.pageReferenceRaw)}
                        </span>
                      </>
                    )}
                  </div>
                  <span className="text-[#78604E] font-mono tabular-nums" dir="ltr">
                    {rel.tempBookId}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#332218]">
                  <button
                    type="button"
                    onClick={() => onPushDossier({ type: 'book', key: rel.bookKey })}
                    className="hover:text-[#6B3E26] hover:underline cursor-pointer text-right"
                  >
                    {rel.bookTitle}
                  </button>
                  <Link2 className="w-3.5 h-3.5 text-[#78604E] shrink-0" />
                  {!rel.isPlaceholderOrGroup && martyrMap.has(rel.martyrKey) ? (
                    <button
                      type="button"
                      onClick={() => onPushDossier({ type: 'martyr', key: rel.martyrKey })}
                      className="text-[#6B3E26] hover:underline cursor-pointer text-right"
                    >
                      {rel.martyrName}
                    </button>
                  ) : (
                    <span className="text-[#5C4636]">{rel.martyrName}</span>
                  )}
                </div>

                {(rel.sourceDescriptionRaw || rel.graveAddress) && (
                  <p className="text-[#5C4636]">
                    {[rel.graveAddress && `مزار: ${rel.graveAddress}`, rel.sourceDescriptionRaw]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </div>
            ))}
          </div>

          {filteredRelations.length > relationsVisibleLimit && (
            <button
              type="button"
              onClick={() => setRelationsVisibleLimit((n) => n + 80)}
              className="w-full min-h-[44px] py-2 rounded-xl bg-[#FAF5EE] hover:bg-[#EFE4D6] border border-[#E2D2BE] text-xs font-bold text-[#6B3E26] cursor-pointer"
            >
              نمایش بیشتر ({toPersianDigits(filteredRelations.length - relationsVisibleLimit)} پیوند دیگر)
            </button>
          )}
        </div>
      )}

      {/* SECTION: WARNINGS & CUSTOM MARTYRS MATCHING */}
      {viewState.activeSection === 'warnings' && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E2D2BE] rounded-2xl p-4 sm:p-5 space-y-3">
            <h3 className="text-base font-bold text-[#332218] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#8A4B16]" />
              <span>
                هشدارهای کارشناسی اختلاف مختصات و ابهام هویت (
                {toPersianDigits(summary.martyrs.linkedMartyrsSummary.discrepancyWarnings.length)} مورد)
              </span>
            </h3>
            <p className="text-xs text-[#78604E]">
              هیچ رکوردی به‌صورت خودکار حذف یا ادغام نشده است؛ صرفاً برای بررسی و تصمیم کارشناس فهرست شده‌اند.
            </p>

            {summary.martyrs.linkedMartyrsSummary.discrepancyWarnings.length === 0 ? (
              <div className="text-xs text-[#78604E] p-3 bg-[#FAF5EE] rounded-xl">
                هشدار اختلاف مختصات یا ابهام هویتی ثبت نشده است.
              </div>
            ) : (
              <div className="divide-y divide-[#EFE4D6] border border-[#EFE4D6] rounded-2xl">
                {summary.martyrs.linkedMartyrsSummary.discrepancyWarnings.map((w, idx) => (
                  <div key={`${w.normalizedName}-${idx}`} className="p-3.5 text-xs space-y-1">
                    <div className="font-bold text-[#332218] text-sm">{w.displayName}</div>
                    <p className="text-[#5C4636] leading-relaxed">{w.message}</p>
                    <div className="text-[#78604E] tabular-nums">
                      {w.affectedBookIds.length > 0 && `کتاب‌ها: ${w.affectedBookIds.join('، ')}`}
                      {w.affectedLinkIds.length > 0 && ` · پیوندها: ${w.affectedLinkIds.join('، ')}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-[#E2D2BE] rounded-2xl p-4 sm:p-5 space-y-3">
            <h3 className="text-base font-bold text-[#332218]">
              تطبیق کنترل‌شده پرونده‌های دستی (MR-xxxxxx) با بانک ۲۸٬۳۶۸ شهید (
              {toPersianDigits(summary.martyrs.customMartyrs.totalCount)} پرونده)
            </h3>
            {summary.martyrs.customMartyrs.matches.length === 0 ? (
              <div className="text-xs text-[#78604E] p-3 bg-[#FAF5EE] rounded-xl">
                هنوز پرونده دستی شهید (MR) ثبت نشده است.
              </div>
            ) : (
              <div className="divide-y divide-[#EFE4D6] border border-[#EFE4D6] rounded-2xl">
                {summary.martyrs.customMartyrs.matches.map((cm) => (
                  <div key={cm.customMartyrId} className="p-3.5 text-xs space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-[#332218] text-sm">
                        {cm.customFullName} ({cm.customMartyrId})
                      </span>
                      <span className="font-semibold text-[#6B3E26]">
                        {cm.matchCertainty === 'definite'
                          ? 'تطبیق قطعی'
                          : cm.matchCertainty === 'candidate_suggestion'
                          ? 'پیشنهاد کارشناسی (چند کاندیدا)'
                          : 'بدون تطبیق در بانک تهران'}
                      </span>
                    </div>
                    <p className="text-[#5C4636]">{cm.matchEvidence}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION: EXPORTS & EXPORT HISTORY */}
      {viewState.activeSection === 'exports' && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E2D2BE] rounded-2xl p-4 sm:p-5 space-y-3">
            <h3 className="text-base font-bold text-[#332218] flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#6B3E26]" />
              <span>خروجی‌های رسمی و مدیریتی داشبورد</span>
            </h3>
            <p className="text-xs sm:text-sm text-[#5C4636] leading-relaxed">
              خروجی اکسل ۵ شیت استاندارد (RTL با فونت Vazirmatn، AutoFilter، Freeze Header و حفظ شناسه‌های BK/RL/MR و شابک/فیپا) روی موتور مشترک و خروجی JSON با اسکیمای اختصاصی{' '}
              <span className="font-mono font-semibold" dir="ltr">
                ExecutiveDashboardExportV1
              </span>{' '}
              ارائه می‌شوند.
            </p>
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => void onExportExcel()}
                disabled={isExportingExcel}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#2E6F40] hover:bg-[#245932] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>دانلود اکسل مدیریتی ۵ شیت</span>
              </button>
              <button
                type="button"
                onClick={() => void onExportJson()}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#6B3E26] hover:bg-[#56311E] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>دانلود JSON مدیریتی (V1)</span>
              </button>
            </div>
          </div>

          <div className="bg-white border border-[#E2D2BE] rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold text-[#332218] flex items-center gap-2">
                <History className="w-4 h-4 text-[#6B3E26]" />
                <span>
                  سابقه گزارش‌ها و خروجی‌های گرفته‌شده ({toPersianDigits(exportHistory.length)} / ۲۰۰)
                </span>
              </h3>

              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'all', label: 'همه' },
                    { id: 'excel', label: 'اکسل' },
                    { id: 'json', label: 'JSON' },
                  ] as Array<{ id: 'all' | 'excel' | 'json'; label: string }>
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setHistoryTypeFilter(item.id)}
                    className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-semibold cursor-pointer ${
                      historyTypeFilter === item.id
                        ? 'bg-[#6B3E26] text-white'
                        : 'bg-[#FAF5EE] text-[#332218] border border-[#E2D2BE]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-[#78604E] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                placeholder="جست‌وجو در نام فایل یا فیلترهای ثبت‌شده..."
                className="w-full min-h-[42px] pr-9 pl-3 py-1.5 rounded-xl border border-[#E2D2BE] bg-[#FAF5EE] text-xs sm:text-sm text-[#332218] focus:outline-none focus:border-[#6B3E26]"
              />
            </div>

            {historyLoading ? (
              <div className="text-xs text-[#78604E] p-3">در حال بارگذاری تاریخچه خروجی‌ها...</div>
            ) : filteredHistory.length === 0 ? (
              <div className="text-xs text-[#78604E] p-4 bg-[#FAF5EE] rounded-xl text-center">
                هنوز سابقه خروجی مطابق فیلتر فعلی ثبت نشده است.
              </div>
            ) : (
              <div className="divide-y divide-[#EFE4D6] border border-[#EFE4D6] rounded-2xl overflow-hidden">
                {filteredHistory.map((h) => (
                  <div
                    key={h.exportId}
                    data-testid="export-history-row"
                    className="p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="font-bold text-[#332218] break-all">{h.fileName}</div>
                      <div className="text-[#5C4636] tabular-nums">
                        <span>{h.fileType === 'excel' ? 'اکسل ۵ شیت' : 'JSON مدیریتی'}</span>
                        <span className="mx-1.5">·</span>
                        <span>{h.timestampDisplay}</span>
                        <span className="mx-1.5">·</span>
                        <span>{toPersianDigits(h.recordCount)} ردیف</span>
                        <span className="mx-1.5">·</span>
                        <span>{h.status === 'success' ? 'موفق' : 'ناموفق'}</span>
                      </div>
                      <div className="text-[#78604E]">{h.appliedFiltersSummary}</div>
                    </div>

                    <button
                      type="button"
                      data-testid={`delete-export-history-${h.exportId}`}
                      onClick={() => void onDeleteHistoryItem(h.exportId)}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#FAF5EE] hover:bg-[#FBEAEA] text-[#A63A3A] border border-[#E2D2BE] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف از سابقه</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
