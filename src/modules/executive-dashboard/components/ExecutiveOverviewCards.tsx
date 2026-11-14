import React from 'react';
import { BarChart3, ChevronLeft, RefreshCw } from 'lucide-react';
import { toPersianDigits } from '../../../data/markazAsnadData';
import type {
  DashboardDrilldownKey,
  ExecutiveDashboardReadiness,
  ThreeCardOverviewResult,
} from '../types';
import { OverviewDonutChart } from './OverviewDonutChart';

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
    martyrsCard.totalActiveDistinctRelationsCount > 0 ||
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
      {/* عنوان آرام صفحه سه‌کادره */}
      <header className="space-y-1 pt-1">
        <div className="text-xs text-[#78604E]">مرکز اسناد و کتابخانه</div>
        <h2 className="text-xl sm:text-2xl font-bold text-[#332218]">
          داشبورد مدیریتی مرکز اسناد
        </h2>
      </header>

      {/* وضعیت بارگذاری اولیه (بدون نمایش عدد ۰ جعلی) */}
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
                  <div className="w-[92px] h-[92px] rounded-full border-8 border-[#EFE4D6] shrink-0" />
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

      {/* وضعیت خطای بارگذاری مخزن پایه */}
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
                توجه: داده‌های ثبت‌شده قبلی در حافظه محلی دستگاه محفوظ است، اما نمای زنده نیازمند بارگذاری کامل داده‌های پایه است.
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

      {/* نمای قطعی سه‌کادره: ۱. کتابخانه ۲. شهدا ۳. وضعیت کار و خروجی‌ها */}
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
                  <span className="text-xs text-[#78604E]">وضعیت تکمیل کتاب‌ها</span>
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
                      size={96}
                      strokeWidth={10}
                      totalCount={libraryCard.totalTrackedBooksCount}
                      centerPercent={libraryCard.completedPercent}
                      centerLabel="تکمیل‌شده"
                      centerSubValue={`${toPersianDigits(libraryCard.completedCount)} از ${toPersianDigits(
                        libraryCard.totalTrackedBooksCount
                      )}`}
                      ariaLabel={`پیشرفت تکمیل کتاب‌ها ${toPersianDigits(libraryCard.completedPercent)} درصد`}
                      segments={[
                        {
                          id: 'lib_completed',
                          label: 'تکمیل‌شده کامل',
                          count: libraryCard.completedCount,
                          percent: libraryCard.completedPercent,
                          color: '#2E6F40',
                          testId: 'library_completed',
                          onClick: () => triggerDrilldown('library_completed'),
                        },
                        {
                          id: 'lib_in_progress',
                          label: 'در حال بررسی',
                          count: libraryCard.inProgressCount,
                          percent:
                            libraryCard.totalTrackedBooksCount > 0
                              ? Math.round(
                                  (libraryCard.inProgressCount /
                                    libraryCard.totalTrackedBooksCount) *
                                    100
                                )
                              : 0,
                          color: '#C87A3B',
                          testId: 'library_in_progress',
                          onClick: () => triggerDrilldown('library_in_progress'),
                        },
                        {
                          id: 'lib_not_started',
                          label: 'شروع‌نشده',
                          count: libraryCard.notStartedCount,
                          percent:
                            libraryCard.totalTrackedBooksCount > 0
                              ? Math.max(
                                  0,
                                  100 -
                                    libraryCard.completedPercent -
                                    Math.round(
                                      (libraryCard.inProgressCount /
                                        libraryCard.totalTrackedBooksCount) *
                                        100
                                    )
                                )
                              : 0,
                          color: '#C9B49B',
                          testId: 'library_not_started',
                          onClick: () => triggerDrilldown('library_not_started'),
                        },
                      ]}
                    />
                  </div>
                )}
              </div>

              {!isLibraryEmpty && (
                <div className="space-y-2">
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
                          تکمیل‌شده کامل
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
                          در حال بررسی / شروع‌نشده
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

                    <button
                      type="button"
                      data-testid="drilldown-trigger-library_worked"
                      onClick={() => triggerDrilldown('library_worked')}
                      className="w-full py-2 px-1.5 -mx-1.5 rounded-lg flex items-center justify-between gap-2 text-right hover:bg-[#FAF5EE] transition-colors cursor-pointer group"
                    >
                      <span className="text-xs text-[#78604E] truncate group-hover:text-[#332218]">
                        دارای ثبت قفسه یا بررسی اولیه
                      </span>
                      <span className="text-xs font-bold text-[#5C4636] shrink-0 inline-flex items-center gap-1">
                        <span>{toPersianDigits(libraryCard.workedOrRegisteredCount)} کتاب</span>
                        <ChevronLeft
                          className="w-3.5 h-3.5 text-[#9C826B] group-hover:text-[#6B3E26] shrink-0"
                          aria-hidden="true"
                        />
                      </span>
                    </button>
                  </div>

                  {libraryCard.openDuplicateTicketCount > 0 && (
                    <button
                      type="button"
                      onClick={() => triggerDrilldown('library_open_duplicate_ticket')}
                      className="w-full text-right text-xs text-[#8A4B16] hover:underline pt-0.5 cursor-pointer"
                    >
                      شامل {toPersianDigits(libraryCard.openDuplicateTicketCount)} کتاب دارای
                      تیکت باز تکرار عنوان
                    </button>
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
                      <div className="w-[92px] h-[92px] rounded-full border-8 border-[#EFE4D6] shrink-0" />
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
                    <button
                      type="button"
                      data-testid="drilldown-trigger-martyrs_linked_all"
                      onClick={() => triggerDrilldown('martyrs_linked_all')}
                      className="min-w-0 flex-1 text-right space-y-1 rounded-xl p-1.5 -m-1.5 hover:bg-[#FAF5EE] active:bg-[#F3E4D2]/70 transition-colors cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3E26]"
                    >
                      <div className="text-3xl font-bold text-[#332218] tabular-nums leading-tight group-hover:text-[#6B3E26] transition-colors">
                        {toPersianDigits(martyrsCard.totalLinkedMartyrsCount)}
                      </div>
                      <div className="text-xs sm:text-sm text-[#5C4636] inline-flex items-center gap-1">
                        <span>شهید مرتبط با کتاب‌ها</span>
                        <ChevronLeft
                          className="w-3.5 h-3.5 text-[#9C826B] group-hover:text-[#6B3E26] shrink-0"
                          aria-hidden="true"
                        />
                      </div>
                      <div className="text-xs text-[#78604E] tabular-nums">
                        در {toPersianDigits(martyrsCard.relatedBooksCount)} کتاب ·{' '}
                        {toPersianDigits(martyrsCard.totalActiveDistinctRelationsCount)} زوج ارتباط
                      </div>
                    </button>

                    <OverviewDonutChart
                      size={96}
                      strokeWidth={10}
                      totalCount={martyrsCard.totalLinkedMartyrsCount}
                      centerPercent={martyrsCard.confirmedIdentityPercent}
                      centerLabel="احرازشده"
                      centerSubValue={`${toPersianDigits(
                        martyrsCard.confirmedIdentityCount
                      )} از ${toPersianDigits(martyrsCard.totalLinkedMartyrsCount)}`}
                      ariaLabel={`احراز هویت شهدا ${toPersianDigits(martyrsCard.confirmedIdentityPercent)} درصد`}
                      segments={[
                        {
                          id: 'martyrs_confirmed',
                          label: 'هویت احرازشده',
                          count: martyrsCard.confirmedIdentityCount,
                          percent: martyrsCard.confirmedIdentityPercent,
                          color: '#2E6F40',
                          testId: 'martyrs_confirmed',
                          onClick: () => triggerDrilldown('martyrs_confirmed'),
                        },
                        {
                          id: 'martyrs_needs_verification',
                          label: 'نیازمند بررسی هویت',
                          count: martyrsCard.needsVerificationCount,
                          percent: martyrsCard.needsVerificationPercent,
                          color: '#C87A3B',
                          testId: 'martyrs_needs_verification',
                          onClick: () => triggerDrilldown('martyrs_needs_verification'),
                        },
                      ]}
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
                        تأیید کارشناسی صریح ارتباط
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
                      data-testid="drilldown-trigger-relations_definite_source"
                      onClick={() => triggerDrilldown('relations_definite_source')}
                      className="w-full py-2 px-1.5 -mx-1.5 rounded-lg flex items-center justify-between gap-2 text-right hover:bg-[#FAF5EE] active:bg-[#F3E4D2]/70 transition-colors cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3E26]"
                    >
                      <span className="text-[#5C4636] truncate group-hover:text-[#332218]">
                        قطعی طبق برچسب منبع
                      </span>
                      <span className="font-bold text-[#6B3E26] shrink-0 inline-flex items-center gap-1">
                        <span>
                          {toPersianDigits(martyrsCard.definiteSourceRelationsCount)} مورد
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
                        {toPersianDigits(workAndOutputsCard.independentTopicsTotalCount)}
                      </div>
                      <div className="text-xs sm:text-sm text-[#5C4636] inline-flex items-center gap-1">
                        <span>موضوع کاری صف پیگیری</span>
                        <ChevronLeft
                          className="w-3.5 h-3.5 text-[#9C826B] group-hover:text-[#6B3E26] shrink-0"
                          aria-hidden="true"
                        />
                      </div>
                      <div className="text-xs text-[#78604E] tabular-nums">
                        در {toPersianDigits(workAndOutputsCard.reviewQueueTotalCount)} پرونده صف
                      </div>
                    </button>

                    <OverviewDonutChart
                      size={96}
                      strokeWidth={10}
                      totalCount={workAndOutputsCard.independentTopicsTotalCount}
                      centerPercent={workAndOutputsCard.reviewQueueCompletionPercent}
                      centerLabel="انجام‌شده"
                      centerSubValue={`${toPersianDigits(
                        workAndOutputsCard.independentTopicsCompletedCount
                      )} از ${toPersianDigits(workAndOutputsCard.independentTopicsTotalCount)}`}
                      ariaLabel={`پیشرفت موضوعات صف پیگیری ${toPersianDigits(
                        workAndOutputsCard.reviewQueueCompletionPercent
                      )} درصد`}
                      segments={[
                        {
                          id: 'work_completed',
                          label: 'موضوعات انجام‌شده',
                          count: workAndOutputsCard.independentTopicsCompletedCount,
                          percent: workAndOutputsCard.reviewQueueCompletionPercent,
                          color: '#2E6F40',
                          testId: 'work_completed',
                          onClick: () => triggerDrilldown('work_completed'),
                        },
                        {
                          id: 'work_remaining',
                          label: 'موضوعات باقیمانده',
                          count: workAndOutputsCard.independentTopicsRemainingCount,
                          percent: workAndOutputsCard.reviewQueueRemainingPercent,
                          color: '#C9B49B',
                          testId: 'work_remaining',
                          onClick: () => triggerDrilldown('work_remaining'),
                        },
                      ]}
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
                      <span className="min-w-0">
                        <span className="block truncate group-hover:text-[#332218]">
                          باقیمانده در صف پیگیری
                        </span>
                        {workAndOutputsCard.reviewQueueNeedsSourceCount > 0 && (
                          <span className="block text-[11px] text-[#78604E] truncate">
                            شامل {toPersianDigits(workAndOutputsCard.reviewQueueNeedsSourceCount)}{' '}
                            مورد نیازمند منبع
                          </span>
                        )}
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
                    <span className="min-w-0">
                      <span className="block text-[#5C4636] truncate group-hover:text-[#332218]">
                        مطالب پژوهشی استخراج‌شده
                      </span>
                      {workAndOutputsCard.activeExtractedOutputsCount > 0 && (
                        <span className="block text-[11px] text-[#78604E] truncate">
                          خروجی پژوهشی نهایی و مستقل:{' '}
                          {toPersianDigits(
                            workAndOutputsCard.finalIndependentResearchOutputsCount
                          )}{' '}
                          مورد
                        </span>
                      )}
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
                    <span className="min-w-0">
                      <span className="block text-[#5C4636] truncate group-hover:text-[#332218]">
                        گزارش‌های مدیریتی نهایی و مستقل
                      </span>
                      {workAndOutputsCard.draftReportsExcludedCount > 0 && (
                        <span className="block text-[11px] text-[#78604E] truncate">
                          {toPersianDigits(workAndOutputsCard.draftReportsExcludedCount)} پیش‌نویس یا
                          نسخه ناموفق جدا شده
                        </span>
                      )}
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
