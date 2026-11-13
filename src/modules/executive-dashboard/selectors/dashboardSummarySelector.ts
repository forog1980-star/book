import type { DashboardSummaryResult, ExecutiveDashboardInputs } from '../types';
import { selectLibraryAnalytics } from './libraryAnalyticsSelector';
import { selectMartyrAnalytics } from './martyrAnalyticsSelector';
import { selectRelationAnalytics } from './relationAnalyticsSelector';
import { selectReviewQueue } from './reviewQueueSelector';
import { selectTemporalAudit } from './temporalAuditSelector';

/**
 * تجمیع‌کننده نهایی داشبورد مدیریتی (فاز ۱ — خالص و مستقل از رابط کاربری):
 * محاسبه تمام شاخص‌ها، ۳ کارت کلیدی آینده صفحه خانه و جداول تفکیکی بدون هیچ عدد ثابت.
 */
export function selectExecutiveDashboardSummary(
  inputs: ExecutiveDashboardInputs
): DashboardSummaryResult {
  const library = selectLibraryAnalytics(inputs);
  const martyrs = selectMartyrAnalytics(inputs);
  const relations = selectRelationAnalytics(inputs);
  const reviewQueue = selectReviewQueue(inputs);
  const temporalAudit = selectTemporalAudit(inputs);

  const activeRelationRowsCount =
    relations.totalRawLinkRows - relations.certaintyByRawRows.rejected;

  const rb = library.reviewBreakdown;

  return {
    martyrRelatedKpi: {
      title: 'مرتبط با شهدا',
      relatedBooksWithNamedMartyrsCount:
        relations.booksWithLinksBreakdown.booksWithNamedMartyrLinks,
      relatedBooksIncludingGroupLinksCount:
        relations.booksWithLinksBreakdown.totalBooksWithActiveLinks,
      expertConfirmedRelatedBooksCount:
        relations.booksWithLinksBreakdown.booksWithExpertConfirmedLink,
      distinctLinkedMartyrNamesCount:
        martyrs.linkedMartyrsSummary.distinctNormalizedLinkedNamesCount,
      confirmedUniqueLinkedMartyrsCount:
        martyrs.linkedMartyrsSummary.confirmedUniqueLinkedMartyrsCount,
      activeRelationRowsCount,
      officialBankNamedMartyrsCount: martyrs.officialBank.namedMartyrRowsCount,
    },
    totalBooksKpi: {
      title: 'کل کتاب‌ها',
      subtitle: 'از کل کتابهای ثبتشده در کتابخانه',
      catalogBooksCount: library.catalogRowsCount,
      outsideCatalogBooksCount: library.outsideCatalogBooksCount,
      totalTrackedBooksCount: library.totalTrackedBooksCount,
      registeredPhysicalCopiesCount: library.registeredPhysicalCopiesCount,
      exactUniqueTitlesCount: library.exactUniqueCatalogTitlesCount,
      similarTitleGroupsCount: library.similarTitleGroups.length,
    },
    bookReviewStatusKpi: {
      title: 'وضعیت بررسی کتاب‌ها',
      reviewedCount: rb.reviewedCount,
      reviewedWithoutMartyrLinkCount: rb.reviewedWithoutMartyrLinkCount,
      remainingForReviewCount: rb.remainingForReviewCount,
      eligibleForReviewCount: rb.eligibleForReviewCount,
      overlapRemainingAndEligibleCount: rb.overlapRemainingAndEligibleCount,
      reconciliationNote: `بررسی‌شده (${rb.reviewedCount}) + باقی‌مانده (${rb.remainingForReviewCount}) = کل کتاب‌ها (${rb.totalTrackedBooksCount})؛ هم‌پوشانی باقی‌مانده با واجد شرایط بررسی = ${rb.overlapRemainingAndEligibleCount} و کتاب‌های بررسی‌شده دارای پیگیری باز = ${rb.reviewedBooksWithOpenRelationQueueCount}.`,
    },
    library,
    martyrs,
    relations,
    reviewQueue,
    temporalAudit,
  };
}
