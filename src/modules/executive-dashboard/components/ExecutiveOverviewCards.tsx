import React from 'react';
import { BarChart3, ChevronLeft, RefreshCw } from 'lucide-react';
import { toPersianDigits } from '../../../data/markazAsnadData';
import type {
  DashboardDrilldownKey,
  ExecutiveDashboardReadiness,
  ThreeCardOverviewResult,
} from '../types';

interface OverviewDonutProps {
  primaryPercent: number;
  primaryColor: string;
  trackColor?: string;
  centerValueText: string;
  centerLabel: string;
  ariaLabel: string;
}

const OverviewDonutChart: React.FC<OverviewDonutProps> = ({
  primaryPercent,
  primaryColor,
  trackColor = '#E8DCCE',
  centerValueText,
  centerLabel,
  ariaLabel,
}) => {
  const size = 88;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, primaryPercent));
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className="relative shrink-0 flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={ariaLabel}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90 block"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        {clamped > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={primaryColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        <span className="text-base font-bold text-[#332218] tabular-nums leading-none">
          {centerValueText}٪
        </span>
        <span className="text-[10px] text-[#78604E] mt-1 leading-none">
          {centerLabel}
        </span>
      </div>
    </div>
  );
};

interface ExecutiveOverviewCardsProps {
  overview: ThreeCardOverviewResult;
  readiness: ExecutiveDashboardReadiness;
  onOpenDetailedReports: () => void;
  onSelectDrilldown?: (key: DashboardDrilldownKey) => void;
}

export const ExecutiveOverviewCards: React.FC<ExecutiveOverviewCardsProps> = ({
  overview,
  readiness,
  onOpenDetailedReports,
  onSelectDrilldown,
}) => {
  const isInitialLoading =
    !readiness.isStorageHydrated || readiness.workbookLoadState === 'loading';
  const isWorkbookError = readiness.workbookLoadState === 'error';
  const isMartyrBankLoading =
    readiness.golzarLoadState === 'idle' || readiness.golzarLoadState === 'loading';
  const isMartyrBankError = readiness.golzarLoadState === 'error';

  const { libraryCard, martyrsCard, workAndOutputsCard } = overview;

  const isLibraryEmpty = libraryCard.totalTrackedBooksCount === 0;
  const hasRelationCounts =
    martyrsCard.expertConfirmedRelationsCount > 0 ||
    martyrsCard.needsReviewRelationsCount > 0;
  const isMartyrsEmpty =
    martyrsCard.totalLinkedMartyrsCount === 0 && !hasRelationCounts;
  const isWorkEmpty =
    workAndOutputsCard.reviewQueueTotalCount === 0 &&
    workAndOutputsCard.activeExtractedOutputsCount === 0 &&
    workAndOutputsCard.exportHistoryCount === 0;

  const triggerDrilldown = (key: DashboardDrilldownKey) => {
    onSelectDrilldown?.(key);
  };

  return (
    <div
      data-testid="executive-overview-screen"
      className="max-w-6xl mx-auto px-3 sm:px-6 pt-3 pb-10 space-y-6 text-[#332218]"
    >
      {/* Clean Calm Title Header — No Navigation/Export Clutter */}
      <header className="space-y-1 pt-1">
        <div className="text-xs text-[#78604E]">مرکز اسناد و کتابخانه</div>
        <h2 className="text-xl sm:text-2xl font-bold text-[#332218]">
          داشبورد مدیریتی مرکز اسناد
        </h2>
      </header>

      {/* Initial Loading State */}
      {isInitialLoading && (
        <div
          data-testid="executive-overview-loading"
          aria-busy="true"
          aria-label="در حال بارگذاری آمار زنده داشبورد"
          className="space-y-4"
        >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="bg-white border border-[#E5D7C6] rounded-2xl p-5 space-y-5 animate-pulse"
              >
                <div className="h-5 w-28 bg-[#EFE4D6] rounded" />
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="h-9 w-24 bg-[#EFE4D6] rounded" />
                    <div className="h-3.5 w-32 bg-[#F5ECE0] rounded" />
                  </div>
                  <div className="w-[88px] h-[88px] rounded-full border-8 border-[#EFE4D6] shrink-0" />
                </div>
                <div className="space-y-3 pt-2 border-t border-[#F2E9DE]">
                  <div className="h-4 w-full bg-[#F5ECE0] rounded" />
                  <div className="h-4 w-full bg-[#F5ECE0] rounded" />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-[#78604E] text-center">
            در حال دریافت و همگام‌سازی داده‌های زنده نرم‌افزار...
          </p>
        </div>
      )}

      {/* Workbook Fetch Failure — Never Present Sample Fallback Numbers as Live Data */}
      {!isInitialLoading && isWorkbookError && (
        <div
          data-testid="executive-overview-error"
          role="alert"
          className="bg-white border border-[#DFB9B9] rounded-2xl p-5 sm:p-6 space-y-4"
        >
          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-[#8A2C2C]">
              دریافت داده‌های زنده کتابخانه با خطا مواجه شد
            </h3>
            <p className="text-sm text-[#5C4636] leading-relaxed">
              {readiness.workbookLoadError ||
                'امکان بارگذاری اطلاعات پایه کتابخانه فراهم نشد. برای جلوگیری از نمایش آمار ناقص، ارقام خلاصه پنهان شده‌اند.'}
            </p>
            {readiness.hasCachedOperationalData && (
              <p className="text-xs text-[#78604E] leading-relaxed">
                توجه: داده‌های ثبت‌شده قبلی در حافظه محلی دستگاه محفوظ است، اما نمای زنده نیازمند اتصال یا بارگذاری کامل داده‌های پایه است.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {readiness.onRetryLoadWorkbook && (
              <button
                type="button"
                data-testid="retry-workbook-load-btn"
                onClick={readiness.onRetryLoadWorkbook}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#6B3E26] hover:bg-[#56311E] text-white text-sm font-bold inline-flex items-center gap-2 cursor-pointer transition-colors"
              >
                <RefreshCw className="w-4 h-4 shrink-0" />
                <span>تلاش مجدد برای دریافت اطلاعات</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Ready State: Strictly 3 Equal-Height Visual Cards + Interactive Drill-Down Triggers + 1 Action Button Below */}
      {!isInitialLoading && !isWorkbookError && (
        <>
          <div
            data-testid="executive-three-cards-grid"
            className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch"
          >
            {/* کارت ۱: کتابخانه */}
            <section
              data-testid="overview-card-library"
              aria-labelledby="overview-card-library-title"
              className="bg-white border border-[#E5D7C6] rounded-2xl p-5 flex flex-col justify-between gap-5 min-w-0"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[#EFE4D6] pb-3">
                  <h3
                    id="overview-card-library-title"
                    className="text-base font-bold text-[#332218]"
                  >
                    کتابخانه
                  </h3>
                  <span className="text-xs text-[#78604E]">وضعیت بررسی کتاب‌ها</span>
                </div>

                {isLibraryEmpty ? (
                  <div
                    data-testid="library-card-empty"
                    className="py-8 text-center text-sm text-[#78604E]"
                  >
                    اطلاعات موجود نیست
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      data-testid="drilldown-trigger-library_all"
                      onClick={() => triggerDrilldown('library_all')}
                      className="min-w-0 flex-1 text-right space-y-1 rounded-xl p-1.5 -m-1.5 hover:bg-[#FAF5EE] active:bg-[#F3E4D2]/70 transition-colors cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3E26]"
                      title="مشاهده فهرست کامل کتاب‌های تحت پایش"
                    >
                      <div className="text-3xl font-bold text-[#332218] tabular-nums leading-tight group-hover:text-[#6B3E26] transition-colors">
                        {toPersianDigits(libraryCard.totalTrackedBooksCount)}
                      </div>
                      <div className="text-xs sm:text-sm text-[#5C4636] inline-flex items-center gap-1">
                        <span>کتاب تحت پایش</span>
                        <ChevronLeft
                          className="w-3.5 h-3.5 text-[#9C826B] group-hover:text-[#6B3E26] transition-colors shrink-0"
                          aria-hidden="true"
                        />
                      </div>
                    </button>

                    <OverviewDonutChart
                      primaryPercent={libraryCard.completedPercent}
                      primaryColor="#2E6F40"
                      centerValueText={toPersianDigits(libraryCard.completedPercent)}
                      centerLabel="تکمیل‌شده"
                      ariaLabel={`پیشرفت بررسی کتاب‌ها ${toPersianDigits(libraryCard.completedPercent)} درصد`}
                    />
                  </div>
                )}
              </div>

              {!isLibraryEmpty && (
                <div className="space-y-2.5">
                  <div className="divide-y divide-[#EFE4D6] border-t border-[#EFE4D6] text-xs sm:text-sm tabular-nums">
                    <button
                      type="button"
                      data-testid="drilldown-trigger-library_completed"
                      onClick={() => triggerDrilldown('library_completed')}
                      className="w-full py-2.5 px-1.5 -mx-1.5 rounded-lg flex items-center justify-between gap-2 text-right hover:bg-[#FAF5EE] active:bg-[#F3E4D2]/70 transition-colors cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3E26]"
                    >
                      <span className="flex items-center gap-2 text-[#5C4636] min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full bg-[#2E6F40] shrink-0"
                          aria-hidden="true"
                        />
                        <span className="truncate group-hover:text-[#332218]">
                          بررسی‌شده و تکمیل‌شده
                        </span>
                      </span>
                      <span className="font-bold text-[#332218] shrink-0 inline-flex items-center gap-1">
                        <span>
                          {toPersianDigits(libraryCard.completedCount)} کتاب{' '}
                          <span className="font-normal text-[#78604E]">
                            ({toPersianDigits(libraryCard.completedPercent)}٪)
                          </span>
                        </span>
                        <ChevronLeft
                          className="w-3.5 h-3.5 text-[#9C826B] group-hover:text-[#6B3E26] shrink-0"
                          aria-hidden="true"
                        />
                      </span>
                    </button>

                    <button
                      type="button"
                      data-testid="drilldown-trigger-library_remaining"
                      onClick={() => triggerDrilldown('library_remaining')}
                      className="w-full py-2.5 px-1.5 -mx-1.5 rounded-lg flex items-center justify-between gap-2 text-right hover:bg-[#FAF5EE] active:bg-[#F3E4D2]/70 transition-colors cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3E26]"
                    >
                      <span className="flex items-center gap-2 text-[#5C4636] min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full bg-[#C9B49B] shrink-0"
                          aria-hidden="true"
                        />
                        <span className="truncate group-hover:text-[#332218]">
                          باقیمانده برای بررسی
                        </span>
                      </span>
                      <span className="font-bold text-[#332218] shrink-0 inline-flex items-center gap-1">
                        <span>
                          {toPersianDigits(libraryCard.remainingForReviewCount)} کتاب{' '}
                          <span className="font-normal text-[#78604E]">
                            ({toPersianDigits(libraryCard.remainingPercent)}٪)
                          </span>
                        </span>
                        <ChevronLeft
                          className="w-3.5 h-3.5 text-[#9C826B] group-hover:text-[#6B3E26] shrink-0"
                          aria-hidden="true"
                        />
                      </span>
                    </button>
                  </div>

                  {libraryCard.openDuplicateTicketCount > 0 && (
                    <p className="text-xs text-[#78604E] pt-1">
                      شامل {toPersianDigits(libraryCard.openDuplicateTicketCount)} کتاب دارای
                      پرونده باز تکرار عنوان
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* کارت ۲: شهدا */}
            <section
              data-testid="overview-card-martyrs"
              aria-labelledby="overview-card-martyrs-title"
              className="bg-white border border-[#E5D7C6] rounded-2xl p-5 flex flex-col justify-between gap-5 min-w-0"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[#EFE4D6] pb-3">
                  <h3
                    id="overview-card-martyrs-title"
                    className="text-base font-bold text-[#332218]"
                  >
                    شهدا
                  </h3>
                  <span className="text-xs text-[#78604E]">احراز هویت و ارتباطات</span>
                </div>

                {isMartyrBankLoading ? (
                  <div
                    data-testid="overview-card-martyrs-loading"
                    className="py-5 space-y-3 animate-pulse"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-2 flex-1">
                        <div className="h-8 w-20 bg-[#EFE4D6] rounded" />
                        <div className="h-3.5 w-32 bg-[#F5ECE0] rounded" />
                      </div>
                      <div className="w-[88px] h-[88px] rounded-full border-8 border-[#EFE4D6] shrink-0" />
                    </div>
                    <p className="text-xs text-[#78604E]">
                      در حال بررسی احراز هویت شهدای مرتبط...
                    </p>
                  </div>
                ) : isMartyrsEmpty ? (
                  <div
                    data-testid="martyrs-card-empty"
                    className="py-8 text-center text-sm text-[#78604E]"
                  >
                    اطلاعات موجود نیست
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="text-3xl font-bold text-[#332218] tabular-nums leading-tight">
                        {toPersianDigits(martyrsCard.totalLinkedMartyrsCount)}
                      </div>
                      <div className="text-xs sm:text-sm text-[#5C4636]">
                        شهید مرتبط با کتاب‌ها
                      </div>
                      <div className="text-xs text-[#78604E] tabular-nums">
                        شناسایی‌شده در {toPersianDigits(martyrsCard.relatedBooksCount)} کتاب
                      </div>
                    </div>

                    <OverviewDonutChart
                      primaryPercent={martyrsCard.confirmedIdentityPercent}
                      primaryColor="#2E6F40"
                      trackColor="#C87A3B"
                      centerValueText={toPersianDigits(
                        martyrsCard.confirmedIdentityPercent
                      )}
                      centerLabel="احرازشده"
                      ariaLabel={`احراز هویت شهدا ${toPersianDigits(martyrsCard.confirmedIdentityPercent)} درصد`}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {!isMartyrBankLoading && !isMartyrsEmpty && (
                  <div className="divide-y divide-[#EFE4D6] border-t border-[#EFE4D6] text-xs sm:text-sm tabular-nums">
                    <button
                      type="button"
                      data-testid="drilldown-trigger-martyrs_confirmed"
                      onClick={() => triggerDrilldown('martyrs_confirmed')}
                      className="w-full py-2 px-1.5 -mx-1.5 rounded-lg flex items-center justify-between gap-2 text-right hover:bg-[#FAF5EE] active:bg-[#F3E4D2]/70 transition-colors cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3E26]"
                    >
                      <span className="flex items-center gap-2 text-[#5C4636] min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full bg-[#2E6F40] shrink-0"
                          aria-hidden="true"
                        />
                        <span className="truncate group-hover:text-[#332218]">
                          هویت احرازشده
                        </span>
                      </span>
                      <span className="font-bold text-[#332218] shrink-0 inline-flex items-center gap-1">
                        <span>
                          {toPersianDigits(martyrsCard.confirmedIdentityCount)} شهید{' '}
                          <span className="font-normal text-[#78604E]">
                            ({toPersianDigits(martyrsCard.confirmedIdentityPercent)}٪)
                          </span>
                        </span>
                        <ChevronLeft
                          className="w-3.5 h-3.5 text-[#9C826B] group-hover:text-[#6B3E26] shrink-0"
                          aria-hidden="true"
                        />
                      </span>
                    </button>

                    <button
                      type="button"
                      data-testid="drilldown-trigger-martyrs_needs_verification"
                      onClick={() => triggerDrilldown('martyrs_needs_verification')}
                      className="w-full py-2 px-1.5 -mx-1.5 rounded-lg flex items-center justify-between gap-2 text-right hover:bg-[#FAF5EE] active:bg-[#F3E4D2]/70 transition-colors cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3E26]"
                    >
                      <span className="flex items-center gap-2 text-[#5C4636] min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full bg-[#C87A3B] shrink-0"
                          aria-hidden="true"
                        />
                        <span className="truncate group-hover:text-[#332218]">
                          نیازمند بررسی هویت
                        </span>
                      </span>
                      <span className="font-bold text-[#332218] shrink-0 inline-flex items-center gap-1">
                        <span>
                          {toPersianDigits(martyrsCard.needsVerificationCount)} مورد{' '}
                          <span className="font-normal text-[#78604E]">
                            ({toPersianDigits(martyrsCard.needsVerificationPercent)}٪)
                          </span>
                        </span>
                        <ChevronLeft
                          className="w-3.5 h-3.5 text-[#9C826B] group-hover:text-[#6B3E26] shrink-0"
                          aria-hidden="true"
                        />
                      </span>
                    </button>

                    <button
                      type="button"
                      data-testid="drilldown-trigger-relations_confirmed"
                      onClick={() => triggerDrilldown('relations_confirmed')}
                      className="w-full py-2 px-1.5 -mx-1.5 rounded-lg flex items-center justify-between gap-2 text-right hover:bg-[#FAF5EE] active:bg-[#F3E4D2]/70 transition-colors cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3E26]"
                    >
                      <span className="text-[#5C4636] truncate group-hover:text-[#332218]">
                        ارتباط تأییدشده کارشناسی
                      </span>
                      <span className="font-bold text-[#2E6F40] shrink-0 inline-flex items-center gap-1">
                        <span>
                          {toPersianDigits(martyrsCard.expertConfirmedRelationsCount)} مورد
                        </span>
                        <ChevronLeft
                          className="w-3.5 h-3.5 text-[#9C826B] group-hover:text-[#6B3E26] shrink-0"
                          aria-hidden="true"
                        />
                      </span>
                    </button>

                    <button
                      type="button"
                      data-testid="drilldown-trigger-relations_needs_review"
                      onClick={() => triggerDrilldown('relations_needs_review')}
                      className="w-full py-2 px-1.5 -mx-1.5 rounded-lg flex items-center justify-between gap-2 text-right hover:bg-[#FAF5EE] active:bg-[#F3E4D2]/70 transition-colors cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3E26]"
                    >
                      <span className="text-[#5C4636] truncate group-hover:text-[#332218]">
                        ارتباط در انتظار بررسی
                      </span>
                      <span className="font-bold text-[#332218] shrink-0 inline-flex items-center gap-1">
                        <span>
                          {toPersianDigits(martyrsCard.needsReviewRelationsCount)} مورد
                        </span>
                        <ChevronLeft
                          className="w-3.5 h-3.5 text-[#9C826B] group-hover:text-[#6B3E26] shrink-0"
                          aria-hidden="true"
                        />
                      </span>
                    </button>
                  </div>
                )}

                {isMartyrBankError && (
                  <div className="pt-1 flex items-center justify-between gap-2 text-xs text-[#8A4B16]">
                    <span>بارگذاری فهرست تطبیق هویت کامل نشد.</span>
                    {readiness.onRetryLoadGolzar && (
                      <button
                        type="button"
                        onClick={readiness.onRetryLoadGolzar}
                        className="font-bold underline hover:text-[#6B3E26] cursor-pointer shrink-0"
                      >
                        تلاش مجدد
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* کارت ۳: وضعیت کار و خروجی‌ها */}
            <section
              data-testid="overview-card-work"
              aria-labelledby="overview-card-work-title"
              className="bg-white border border-[#E5D7C6] rounded-2xl p-5 flex flex-col justify-between gap-5 min-w-0"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[#EFE4D6] pb-3">
                  <h3
                    id="overview-card-work-title"
                    className="text-base font-bold text-[#332218]"
                  >
                    وضعیت کار و خروجی‌ها
                  </h3>
                  <span className="text-xs text-[#78604E]">پیگیری و دستاوردها</span>
                </div>

                {isWorkEmpty ? (
                  <div
                    data-testid="work-card-empty"
                    className="py-8 text-center text-sm text-[#78604E]"
                  >
                    اطلاعات موجود نیست
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      data-testid="drilldown-trigger-work_queue_total"
                      onClick={() =>
                        triggerDrilldown(
                          workAndOutputsCard.reviewQueueRemainingCount > 0
                            ? 'work_remaining'
                            : 'work_completed'
                        )
                      }
                      className="min-w-0 flex-1 text-right space-y-1 rounded-xl p-1.5 -m-1.5 hover:bg-[#FAF5EE] active:bg-[#F3E4D2]/70 transition-colors cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3E26]"
                    >
                      <div className="text-3xl font-bold text-[#332218] tabular-nums leading-tight group-hover:text-[#6B3E26] transition-colors">
                        {toPersianDigits(workAndOutputsCard.reviewQueueTotalCount)}
                      </div>
                      <div className="text-xs sm:text-sm text-[#5C4636] inline-flex items-center gap-1">
                        <span>مورد در صف پیگیری</span>
                        <ChevronLeft
                          className="w-3.5 h-3.5 text-[#9C826B] group-hover:text-[#6B3E26] shrink-0"
                          aria-hidden="true"
                        />
                      </div>
                    </button>

                    <OverviewDonutChart
                      primaryPercent={workAndOutputsCard.reviewQueueCompletionPercent}
                      primaryColor="#2E6F40"
                      centerValueText={toPersianDigits(
                        workAndOutputsCard.reviewQueueCompletionPercent
                      )}
                      centerLabel="انجام‌شده"
                      ariaLabel={`پیشرفت صف پیگیری ${toPersianDigits(workAndOutputsCard.reviewQueueCompletionPercent)} درصد`}
                    />
                  </div>
                )}
              </div>

              {!isWorkEmpty && (
                <div className="divide-y divide-[#EFE4D6] border-t border-[#EFE4D6] text-xs sm:text-sm tabular-nums">
                  <button
                    type="button"
                    data-testid="drilldown-trigger-work_completed"
                    onClick={() => triggerDrilldown('work_completed')}
                    className="w-full py-2 px-1.5 -mx-1.5 rounded-lg flex items-center justify-between gap-2 text-right hover:bg-[#FAF5EE] active:bg-[#F3E4D2]/70 transition-colors cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3E26]"
                  >
                    <span className="flex items-center gap-2 text-[#5C4636] min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full bg-[#2E6F40] shrink-0"
                        aria-hidden="true"
                      />
                      <span className="truncate group-hover:text-[#332218]">
                        انجام‌شده در صف پیگیری
                      </span>
                    </span>
                    <span className="font-bold text-[#332218] shrink-0 inline-flex items-center gap-1">
                      <span>
                        {toPersianDigits(workAndOutputsCard.reviewQueueCompletedCount)} مورد{' '}
                        <span className="font-normal text-[#78604E]">
                          ({toPersianDigits(workAndOutputsCard.reviewQueueCompletionPercent)}٪)
                        </span>
                      </span>
                      <ChevronLeft
                        className="w-3.5 h-3.5 text-[#9C826B] group-hover:text-[#6B3E26] shrink-0"
                        aria-hidden="true"
                      />
                    </span>
                  </button>

                  {workAndOutputsCard.reviewQueueCompletedCount > 0 &&
                    workAndOutputsCard.completedByType.length > 0 && (
                      <div
                        data-testid="work-completed-by-type"
                        className="py-2 pr-4 space-y-1 text-xs text-[#78604E]"
                      >
                        <div className="font-medium text-[#5C4636]">
                          تفکیک کارهای انجام‌شده:
                        </div>
                        {workAndOutputsCard.completedByType.map((item) => (
                          <div
                            key={item.label}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="truncate">{item.label}</span>
                            <span className="font-bold text-[#332218] shrink-0">
                              {toPersianDigits(item.count)} مورد
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                  <button
                    type="button"
                    data-testid="drilldown-trigger-work_remaining"
                    onClick={() => triggerDrilldown('work_remaining')}
                    className="w-full py-2 px-1.5 -mx-1.5 rounded-lg flex items-center justify-between gap-2 text-right hover:bg-[#FAF5EE] active:bg-[#F3E4D2]/70 transition-colors cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3E26]"
                  >
                    <span className="flex items-center gap-2 text-[#5C4636] min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full bg-[#C9B49B] shrink-0"
                        aria-hidden="true"
                      />
                      <span className="truncate group-hover:text-[#332218]">
                        باقیمانده در صف پیگیری
                      </span>
                    </span>
                    <span className="font-bold text-[#332218] shrink-0 inline-flex items-center gap-1">
                      <span>
                        {toPersianDigits(workAndOutputsCard.reviewQueueRemainingCount)} مورد{' '}
                        <span className="font-normal text-[#78604E]">
                          ({toPersianDigits(workAndOutputsCard.reviewQueueRemainingPercent)}٪)
                        </span>
                      </span>
                      <ChevronLeft
                        className="w-3.5 h-3.5 text-[#9C826B] group-hover:text-[#6B3E26] shrink-0"
                        aria-hidden="true"
                      />
                    </span>
                  </button>

                  <button
                    type="button"
                    data-testid="drilldown-trigger-research_outputs"
                    onClick={() => triggerDrilldown('research_outputs')}
                    className="w-full py-2 px-1.5 -mx-1.5 rounded-lg flex items-center justify-between gap-2 text-right hover:bg-[#FAF5EE] active:bg-[#F3E4D2]/70 transition-colors cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3E26]"
                  >
                    <span className="text-[#5C4636] truncate group-hover:text-[#332218]">
                      خروجی‌های پژوهشی ثبت‌شده
                    </span>
                    <span className="font-bold text-[#332218] shrink-0 inline-flex items-center gap-1">
                      <span>
                        {toPersianDigits(workAndOutputsCard.activeExtractedOutputsCount)} مورد
                      </span>
                      <ChevronLeft
                        className="w-3.5 h-3.5 text-[#9C826B] group-hover:text-[#6B3E26] shrink-0"
                        aria-hidden="true"
                      />
                    </span>
                  </button>

                  <button
                    type="button"
                    data-testid="drilldown-trigger-management_reports"
                    onClick={() => triggerDrilldown('management_reports')}
                    className="w-full py-2 px-1.5 -mx-1.5 rounded-lg flex items-center justify-between gap-2 text-right hover:bg-[#FAF5EE] active:bg-[#F3E4D2]/70 transition-colors cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3E26]"
                  >
                    <span className="text-[#5C4636] truncate group-hover:text-[#332218]">
                      گزارش‌های مدیریتی صادرشده
                    </span>
                    <span className="font-bold text-[#332218] shrink-0 inline-flex items-center gap-1">
                      <span>
                        {toPersianDigits(workAndOutputsCard.exportHistoryCount)} گزارش
                      </span>
                      <ChevronLeft
                        className="w-3.5 h-3.5 text-[#9C826B] group-hover:text-[#6B3E26] shrink-0"
                        aria-hidden="true"
                      />
                    </span>
                  </button>
                </div>
              )}
            </section>
          </div>

          {/* کلید واحد پایین کادرها: آمار و گزارش‌های تفصیلی */}
          <div className="flex justify-center pt-1">
            <button
              type="button"
              data-testid="open-detailed-reports-btn"
              onClick={onOpenDetailedReports}
              className="w-full sm:w-auto min-h-[48px] px-7 py-3 rounded-xl bg-[#6B3E26] hover:bg-[#56311E] text-white text-sm sm:text-base font-bold inline-flex items-center justify-center gap-2.5 cursor-pointer transition-colors shadow-xs"
            >
              <BarChart3 className="w-5 h-5 shrink-0" />
              <span>آمار و گزارش‌های تفصیلی</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
