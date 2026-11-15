import type { DashboardSummaryResult, ExecutiveDashboardInputs } from '../types';
import { selectLibraryAnalytics } from './libraryAnalyticsSelector';
import { selectMartyrAnalytics } from './martyrAnalyticsSelector';
import { selectRelationAnalytics } from './relationAnalyticsSelector';
import { selectReviewQueue } from './reviewQueueSelector';
import { selectTemporalAudit } from './temporalAuditSelector';

/**
 * تجمیع‌کننده نهایی داشبورد مدیریتی مرکز اسناد (فاز اول + دوم — خالص و واکنش‌گرا به State زنده):
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
  const part = rb.managerialStatusPartition;

  return {
    martyrRelatedKpi: {
      title: 'مرتبط با شهدا',
      relatedBooksWithNamedMartyrsCount:
        relations.booksWithLinksBreakdown.booksWithNamedMartyrLinks,
      relatedBooksGroupOnlyCount:
        relations.booksWithLinksBreakdown.booksWithOnlyGroupOrPlaceholderLinks,
      relatedBooksIncludingGroupLinksCount:
        relations.booksWithLinksBreakdown.totalBooksWithActiveLinks,
      expertConfirmedRelatedBooksCount:
        relations.booksWithLinksBreakdown.booksWithExpertConfirmedLink,
      distinctLinkedMartyrNamesCount:
        martyrs.linkedMartyrsSummary.distinctNormalizedLinkedNamesCount,
      confirmedUniqueLinkedMartyrsCount:
        martyrs.linkedMartyrsSummary.confirmedUniqueLinkedMartyrsCount,
      ambiguousOrUnverifiedLinkedNamesCount:
        martyrs.linkedMartyrsSummary.ambiguousOrUnverifiedLinkedNamesCount,
      expertConfirmedRelationsCount: relations.certaintyByRawRows.confirmedByExpert,
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
      completedWithoutOpenTicketCount: part.completedWithoutOpenTicketCount,
      openBookTicketCount: part.openBookTicketCount,
      unreviewedCount: part.unreviewedCount,
      totalTrackedBooksCount: part.totalTrackedBooksCount,
      reviewedCount: rb.reviewedCount,
      reviewedWithoutMartyrLinkCount: rb.reviewedWithoutMartyrLinkCount,
      remainingForReviewCount: rb.remainingForReviewCount,
      eligibleForReviewCount: rb.eligibleForReviewCount,
      overlapRemainingAndEligibleCount: rb.overlapRemainingAndEligibleCount,
      reconciliationNote: `افراز بدون هم‌پوشانی (گزینه ج): تکمیل‌شده بدون تیکت باز (${part.completedWithoutOpenTicketCount}) + دارای تیکت باز تکرار عنوان (${part.openBookTicketCount}) + بررسی‌نشده (${part.unreviewedCount}) = ${part.totalTrackedBooksCount} کتاب.`,
    },
    library,
    martyrs,
    relations,
    reviewQueue,
    temporalAudit,
  };
}
