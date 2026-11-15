import type {
  DashboardSummaryResult,
  ExecutiveDashboardInputs,
  ExecutiveExportHistoryRecord,
  FinalizedReportRegistryRecord,
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
 * - منبع واحد حقیقت از DashboardSummaryResult و دفتر کل محلی گزارش‌ها (بدون عدد ثابت)
 * - درصد کتابخانه: معیار سخت‌گیرانه تکمیل کامل در برابر در حال بررسی/شروع‌نشده
 * - درصد شهدا: احراز هویت شخص یکتا روی شهدای مرتبط + تفکیک قطعی منبع از تأیید کارشناسی صریح
 * - درصد وضعیت کار: محاسبه‌شده بر پایه تک‌تک موضوعات کاری مستقل صف پیگیری (مستقل از لاگ و خروجی‌ها)
 */
export function selectThreeCardOverviewFromSummary(
  summary: DashboardSummaryResult,
  exportHistoryOrCount: number | ExecutiveExportHistoryRecord[] = 0,
  extractedItems?: ExecutiveDashboardInputs['extractedItems'],
  finalizedRegistry?: FinalizedReportRegistryRecord[]
): ThreeCardOverviewResult {
  // ۱. کارت کتابخانه: معیار سخت‌گیرانه تکمیل واقعی
  const libPart = summary.library.reviewBreakdown.managerialStatusPartition;
  const libDet = summary.library.detailedBreakdown;
  const totalTrackedBooksCount = libDet.totalTrackedBooksCount;
  const completedCount = libDet.completedCount;
  const inProgressCount = libDet.inProgressCount;
  const notStartedCount = libDet.notStartedCount;
  const remainingForReviewCount = inProgressCount + notStartedCount;
  const bookPct = computeComplementaryPercentages(completedCount, totalTrackedBooksCount);

  // ۲. کارت شهدا: احراز هویت شخص یکتا روی شهدای مرتبط + تفکیک منبع از تأیید کارشناسی
  const linkedSummary = summary.martyrs.linkedMartyrsSummary;
  const totalLinkedMartyrsCount = linkedSummary.distinctNormalizedLinkedNamesCount;
  const confirmedIdentityCount = linkedSummary.confirmedUniqueLinkedMartyrsCount;
  const needsVerificationCount = linkedSummary.ambiguousOrUnverifiedLinkedNamesCount;
  const identityPct = computeComplementaryPercentages(
    confirmedIdentityCount,
    totalLinkedMartyrsCount
  );
  const srcExp = summary.relations.sourceAndExpertBreakdown;

  // ۳. کارت وضعیت کار و خروجی‌ها: پیشرفت بر پایه موضوعات کاری مستقل صف پیگیری
  const pv = summary.reviewQueue.pendingReviews;
  const topics = summary.reviewQueue.independentWorkTopics;
  const workPct = computeComplementaryPercentages(
    topics.completedTopicsCount,
    topics.totalTopicsCount
  );

  const completedByType =
    pv.resolvedCount > 0
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
  const exportArr = Array.isArray(exportHistoryOrCount) ? exportHistoryOrCount : [];
  const reportSummary =
    Array.isArray(exportHistoryOrCount) || finalizedRegistry !== undefined
      ? selectFinalizedManagementReportsSummary(exportArr, finalizedRegistry)
      : null;

  const exportHistoryCount = reportSummary
    ? reportSummary.finalIndependentReportsCount
    : numericExportFallback;
  const rawExportHistoryCount = reportSummary
    ? reportSummary.rawSuccessfulIssuancesCount
    : numericExportFallback;
  const draftReportsExcludedCount = reportSummary
    ? reportSummary.draftOrFailedExcludedCount
    : 0;

  return {
    libraryCard: {
      totalTrackedBooksCount,
      completedCount,
      inProgressCount,
      notStartedCount,
      workedOrRegisteredCount: libDet.workedOrRegisteredCount,
      openDuplicateTicketCount: libPart.openBookTicketCount,
      unreviewedCount: libPart.unreviewedCount,
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
      totalActiveDistinctRelationsCount: srcExp.totalActiveDistinctPairsCount,
      definiteSourceRelationsCount: srcExp.definiteBySourceLabelDistinctCount,
      probableRelationsCount: srcExp.probableDistinctCount,
      expertConfirmedRelationsCount: srcExp.explicitExpertConfirmedDistinctCount,
      needsReviewRelationsCount: srcExp.needsReviewDistinctCount,
    },
    workAndOutputsCard: {
      reviewQueueTotalCount: pv.totalCount,
      reviewQueueCompletedCount: pv.resolvedCount,
      reviewQueueRemainingCount: pv.openCount + pv.otherStatusCount,
      reviewQueueNeedsSourceCount: pv.needsSourceCount,
      independentTopicsTotalCount: topics.totalTopicsCount,
      independentTopicsCompletedCount: topics.completedTopicsCount,
      independentTopicsRemainingCount: topics.remainingTopicsCount,
      reviewQueueCompletionPercent: workPct.primaryPercent,
      reviewQueueRemainingPercent: workPct.remainingPercent,
      completedByType,
      activeExtractedOutputsCount,
      expertApprovedOutputsCount: exQueue.expertApprovedCount,
      finalIndependentResearchOutputsCount,
      pendingExtractedReviewCount: exQueue.needsReviewCount,
      exportHistoryCount,
      rawExportHistoryCount,
      draftReportsExcludedCount,
    },
  };
}

export function selectThreeCardOverview(
  inputs: ExecutiveDashboardInputs,
  exportHistoryOrCount: number | ExecutiveExportHistoryRecord[] = 0,
  finalizedRegistry?: FinalizedReportRegistryRecord[]
): ThreeCardOverviewResult {
  return selectThreeCardOverviewFromSummary(
    selectExecutiveDashboardSummary(inputs),
    exportHistoryOrCount,
    inputs.extractedItems,
    finalizedRegistry
  );
}
