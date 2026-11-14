import type {
  DashboardSummaryResult,
  ExecutiveDashboardInputs,
  ExecutiveExportHistoryRecord,
  ThreeCardOverviewResult,
} from '../types';
import { selectExecutiveDashboardSummary } from './dashboardSummarySelector';
import {
  selectFinalizedManagementReportsSummary,
  selectFinalizedResearchOutputsSummary,
} from './detailedStatisticsSelector';

function computeComplementaryPercentages(
  completedPart: number,
  total: number
): { primaryPercent: number; remainingPercent: number } {
  if (total <= 0) {
    return { primaryPercent: 0, remainingPercent: 0 };
  }
  const safeCompleted = Math.max(0, Math.min(total, completedPart));
  const primaryPercent = Math.round((safeCompleted / total) * 100);
  const remainingPercent = Math.max(0, 100 - primaryPercent);
  return { primaryPercent, remainingPercent };
}

/**
 * سلکتور خالص نمای سه‌کادره داشبورد مدیریتی (کتابخانه / شهدا / وضعیت کار و خروجی‌ها)
 * - منبع واحد حقیقت از DashboardSummaryResult و سابقه واقعی گزارش‌ها (بدون عدد ثابت)
 */
export function selectThreeCardOverviewFromSummary(
  summary: DashboardSummaryResult,
  exportHistoryOrCount: number | ExecutiveExportHistoryRecord[] = 0,
  extractedItems?: ExecutiveDashboardInputs['extractedItems']
): ThreeCardOverviewResult {
  // ۱. کارت کتابخانه: افراز بدون هم‌پوشانی گزینه ج روی کل کتاب‌های تحت پایش
  const bookPart = summary.library.reviewBreakdown.managerialStatusPartition;
  const totalTrackedBooksCount = bookPart.totalTrackedBooksCount;
  const completedBooksCount = bookPart.completedWithoutOpenTicketCount;
  const openDuplicateTicketCount = bookPart.openBookTicketCount;
  const unreviewedBooksCount = bookPart.unreviewedCount;
  const remainingForReviewCount = openDuplicateTicketCount + unreviewedBooksCount;
  const bookPct = computeComplementaryPercentages(
    completedBooksCount,
    totalTrackedBooksCount
  );

  // ۲. کارت شهدا: احراز هویت شخص یکتا روی شهدای مرتبط + قطعیت ارتباطات
  const linkedSummary = summary.martyrs.linkedMartyrsSummary;
  const totalLinkedMartyrsCount = linkedSummary.distinctNormalizedLinkedNamesCount;
  const confirmedIdentityCount = linkedSummary.confirmedUniqueLinkedMartyrsCount;
  const needsVerificationCount = linkedSummary.ambiguousOrUnverifiedLinkedNamesCount;
  const identityPct = computeComplementaryPercentages(
    confirmedIdentityCount,
    totalLinkedMartyrsCount
  );

  // ۳. کارت وضعیت کار و خروجی‌ها: صف یکدست پیگیری + مطالب پژوهشی + گزارش‌های مدیریتی واقعی
  const pv = summary.reviewQueue.pendingReviews;
  const reviewQueueTotalCount = pv.totalCount;
  const reviewQueueCompletedCount = pv.resolvedCount;
  const reviewQueueRemainingCount = pv.openCount + pv.otherStatusCount;
  const workPct = computeComplementaryPercentages(
    reviewQueueCompletedCount,
    reviewQueueTotalCount
  );

  const completedByType =
    reviewQueueCompletedCount > 0
      ? Object.entries(pv.resolvedByMainSheet || {})
          .filter(([, count]) => count > 0)
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fa'))
          .map(([label, count]) => ({ label, count }))
      : [];

  const exQueue = summary.reviewQueue.extractedItemsQueue;
  const researchSummary = extractedItems
    ? selectFinalizedResearchOutputsSummary(extractedItems)
    : null;
  const activeExtractedOutputsCount = researchSummary
    ? researchSummary.totalExtractedNonRejectedCount
    : Math.max(0, exQueue.totalCount - exQueue.rejectedCount);
  const finalIndependentResearchOutputsCount = researchSummary
    ? researchSummary.finalIndependentOutputsCount
    : exQueue.expertApprovedCount;

  const numericExportFallback =
    typeof exportHistoryOrCount === 'number' ? Math.max(0, exportHistoryOrCount) : 0;
  const reportSummary = Array.isArray(exportHistoryOrCount)
    ? selectFinalizedManagementReportsSummary(exportHistoryOrCount)
    : null;
  const exportHistoryCount = reportSummary
    ? reportSummary.finalIndependentReportsCount
    : numericExportFallback;
  const rawExportHistoryCount = reportSummary
    ? reportSummary.rawSuccessfulIssuancesCount
    : numericExportFallback;

  return {
    libraryCard: {
      totalTrackedBooksCount,
      completedCount: completedBooksCount,
      openDuplicateTicketCount,
      unreviewedCount: unreviewedBooksCount,
      remainingForReviewCount,
      completedPercent: bookPct.primaryPercent,
      remainingPercent: bookPct.remainingPercent,
    },
    martyrsCard: {
      totalLinkedMartyrsCount,
      confirmedIdentityCount,
      needsVerificationCount,
      confirmedIdentityPercent: identityPct.primaryPercent,
      needsVerificationPercent: identityPct.remainingPercent,
      relatedBooksCount: summary.relations.booksWithLinksBreakdown.totalBooksWithActiveLinks,
      expertConfirmedRelationsCount:
        summary.relations.certaintyByDistinctPairs.confirmedByExpert,
      needsReviewRelationsCount:
        summary.relations.certaintyByDistinctPairs.needsReview,
    },
    workAndOutputsCard: {
      reviewQueueTotalCount,
      reviewQueueCompletedCount,
      reviewQueueRemainingCount,
      reviewQueueNeedsSourceCount: pv.needsSourceCount,
      reviewQueueCompletionPercent: workPct.primaryPercent,
      reviewQueueRemainingPercent: workPct.remainingPercent,
      completedByType,
      activeExtractedOutputsCount,
      expertApprovedOutputsCount: exQueue.expertApprovedCount,
      finalIndependentResearchOutputsCount,
      pendingExtractedReviewCount: exQueue.needsReviewCount,
      exportHistoryCount,
      rawExportHistoryCount,
    },
  };
}

export function selectThreeCardOverview(
  inputs: ExecutiveDashboardInputs,
  exportHistoryOrCount: number | ExecutiveExportHistoryRecord[] = 0
): ThreeCardOverviewResult {
  return selectThreeCardOverviewFromSummary(
    selectExecutiveDashboardSummary(inputs),
    exportHistoryOrCount,
    inputs.extractedItems
  );
}

