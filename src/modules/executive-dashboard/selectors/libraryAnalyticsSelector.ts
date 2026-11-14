import type {
  BookCopyRecord,
  BookMartyrLinkRecord,
  FieldAuditRecord,
  PendingReviewItem,
  ReferenceCatalogRow,
} from '../../../data/markazAsnadData';
import {
  classifyPendingReviewStatus,
  compactPersian,
  isNoMartyrFoundConfirmationText,
  isPlaceholderOrGroupMartyrPhrase,
  normalizePersian,
  resolveCatalogRowKey,
  stripMartyrHonorifics,
  toEnglishDigits,
} from '../normalization';
import type {
  ExecutiveDashboardInputs,
  LibraryAnalyticsResult,
  LibraryDetailedBreakdown,
  SimilarTitleGroup,
} from '../types';
import { classifySingleLinkCertainty } from './relationAnalyticsSelector';

export interface EvaluatedBookStatusFlags {
  hasAuditRecord: boolean;
  isCatalogMarkedReviewed: boolean;
  isWorkedOrRegistered: boolean;
  isShelfVerifiedPresent: boolean;
  isExpertApproved: boolean;
  hasRegisteredMartyrLink: boolean;
  martyrLinkReviewResolved: boolean;
  isStrictCompleted: boolean;
  lifecycleStage: 'completed' | 'in_progress' | 'not_started';
  hasOpenDirectBookTicket: boolean;
}

export function evaluateBookCompletionAndActivityFlags(params: {
  row?: ReferenceCatalogRow;
  audit?: FieldAuditRecord;
  registeredCopiesCount: number;
  verifiedPresentCopyExists: boolean;
  bookActiveLinks: BookMartyrLinkRecord[];
  activeAuditMartyrCount: number;
  hasOpenDirectBookTicket: boolean;
  hasOpenAnyPendingTicket: boolean;
  hasOpenLinkIssue: boolean;
}): EvaluatedBookStatusFlags {
  const {
    row,
    audit,
    registeredCopiesCount,
    verifiedPresentCopyExists,
    bookActiveLinks,
    activeAuditMartyrCount,
    hasOpenDirectBookTicket,
    hasOpenAnyPendingTicket,
    hasOpenLinkIssue,
  } = params;

  const hasAuditRecord = Boolean(audit);
  const isCatalogMarkedReviewed = row ? isCatalogRawStatusReviewed(row.reviewStatusRaw) : false;
  const isWorkedOrRegistered =
    hasAuditRecord || isCatalogMarkedReviewed || registeredCopiesCount > 0;
  const isShelfVerifiedPresent = audit
    ? audit.physical === 'verified' && audit.copyStatus !== 'pending_review'
    : verifiedPresentCopyExists;
  const isExpertApproved = Boolean(audit?.expertApproved);

  const hasRegisteredMartyrLink = bookActiveLinks.length > 0 || activeAuditMartyrCount > 0;

  let martyrLinkReviewResolved = false;
  if (hasRegisteredMartyrLink) {
    const allLinksExpertConfirmed =
      bookActiveLinks.length > 0
        ? bookActiveLinks.every(
            (lnk) => classifySingleLinkCertainty(lnk, audit) === 'confirmedByExpert'
          )
        : false;
    const onlyAuditMartyrsConfirmed =
      bookActiveLinks.length === 0 && activeAuditMartyrCount > 0 && isExpertApproved;
    martyrLinkReviewResolved =
      allLinksExpertConfirmed ||
      onlyAuditMartyrsConfirmed ||
      (isExpertApproved && !hasOpenLinkIssue && !hasOpenAnyPendingTicket);
  } else {
    martyrLinkReviewResolved =
      isExpertApproved ||
      isNoMartyrFoundConfirmationText(audit?.notes || row?.noteRaw) ||
      Boolean(audit?.excludedMartyrs && audit.excludedMartyrs.length > 0) ||
      (!hasAuditRecord && isCatalogMarkedReviewed);
  }

  const titlePresent = Boolean((audit?.title || row?.titleRaw || '').trim());
  const physicalAndInfoResolved = audit
    ? titlePresent &&
      !audit.needsReview &&
      audit.copyStatus !== 'pending_review' &&
      (audit.physical === 'verified' || audit.physical === 'not_found')
    : isCatalogMarkedReviewed;

  const hasAnyOpenTicketOrIssue =
    hasOpenDirectBookTicket || hasOpenAnyPendingTicket || hasOpenLinkIssue;

  const isStrictCompleted =
    physicalAndInfoResolved && martyrLinkReviewResolved && !hasAnyOpenTicketOrIssue;

  const isInFieldReview =
    !isStrictCompleted &&
    Boolean(audit && (audit.physical === 'review' || audit.needsReview === true));

  const lifecycleStage: 'completed' | 'in_progress' | 'not_started' = isStrictCompleted
    ? 'completed'
    : hasOpenDirectBookTicket || isInFieldReview || isWorkedOrRegistered
    ? 'in_progress'
    : 'not_started';

  return {
    hasAuditRecord,
    isCatalogMarkedReviewed,
    isWorkedOrRegistered,
    isShelfVerifiedPresent,
    isExpertApproved,
    hasRegisteredMartyrLink,
    martyrLinkReviewResolved,
    isStrictCompleted,
    lifecycleStage,
    hasOpenDirectBookTicket,
  };
}

function isCatalogRawStatusReviewed(rawStatus: string | undefined): boolean {
  const s = normalizePersian(rawStatus);
  return s === 'بررسی شد' || s === 'بررسی شده' || s === 'تاییدشده' || s === 'تایید شده';
}

function isRejectedLinkStatus(status: string | undefined): boolean {
  return normalizePersian(status).includes('رد');
}

function hasOpenLinkIssueStatus(status: string | undefined): boolean {
  const s = normalizePersian(status);
  if (!s) return false;
  if (s.includes('رد') || s.includes('تاییدشده کارشناسی')) return false;
  return (
    s.includes('نیازمند') ||
    s.includes('تکمیل') ||
    s.includes('تفکیک') ||
    s.includes('در صف') ||
    s.includes('تعارض')
  );
}

function isPendingTicketClosed(trackingStatus: string | undefined): boolean {
  return classifyPendingReviewStatus(trackingStatus) === 'resolved';
}

/**
 * تحلیل‌گر مستقل وضعیت کتاب‌ها، عناوین مشابه، نسخه‌های فیزیکی (CP) و افراز بدون هم‌پوشانی وضعیت بررسی (گزینه ج).
 */
export function selectLibraryAnalytics(
  inputs: ExecutiveDashboardInputs
): LibraryAnalyticsResult {
  const catalogRows: ReferenceCatalogRow[] = inputs.catalogRows || [];
  const auditRecords: Record<string, FieldAuditRecord> = inputs.auditRecords || {};
  const bookCopies: BookCopyRecord[] = inputs.bookCopies || [];
  const links: BookMartyrLinkRecord[] = inputs.links || [];
  const pendingReviews: PendingReviewItem[] = inputs.pendingReviews || [];

  const distinctBookIds = new Set<string>();
  const exactTitles = new Set<string>();
  const normTitles = new Set<string>();

  const titleGroupBuckets = new Map<
    string,
    {
      exactTitles: Set<string>;
      bookIds: Set<string>;
      publishers: Set<string>;
      rowCount: number;
    }
  >();

  let reportedCountedCopiesSum = 0;
  let booksWithCountedCopiesNumberCount = 0;

  const catalogByRowKey = new Map<string, ReferenceCatalogRow>();
  const catalogByTempBookId = new Map<string, ReferenceCatalogRow>();

  for (const row of catalogRows) {
    const rKey = resolveCatalogRowKey(row);
    catalogByRowKey.set(rKey, row);
    if (row.tempBookId) {
      distinctBookIds.add(row.tempBookId.trim());
      catalogByTempBookId.set(row.tempBookId.trim(), row);
    }

    const exactTitle = (row.titleRaw || '').trim();
    if (exactTitle) exactTitles.add(exactTitle);

    const normTitle = normalizePersian(row.titleRaw);
    if (normTitle) {
      normTitles.add(normTitle);
      const bucket = titleGroupBuckets.get(normTitle) || {
        exactTitles: new Set<string>(),
        bookIds: new Set<string>(),
        publishers: new Set<string>(),
        rowCount: 0,
      };
      bucket.rowCount += 1;
      if (exactTitle) bucket.exactTitles.add(exactTitle);
      if (row.tempBookId) bucket.bookIds.add(row.tempBookId.trim());
      if (row.publisherRaw?.trim()) bucket.publishers.add(row.publisherRaw.trim());
      titleGroupBuckets.set(normTitle, bucket);
    }

    const audit = auditRecords[rKey];
    const copiesRaw = audit?.countedCopies ?? row.countedCopiesRaw;
    const numericCopies = Number(toEnglishDigits(copiesRaw).trim());
    if (
      copiesRaw &&
      String(copiesRaw).trim() !== '' &&
      Number.isFinite(numericCopies) &&
      numericCopies >= 0
    ) {
      reportedCountedCopiesSum += numericCopies;
      booksWithCountedCopiesNumberCount += 1;
    }
  }

  const similarTitleGroups: SimilarTitleGroup[] = [];
  for (const [normTitle, bucket] of titleGroupBuckets.entries()) {
    if (bucket.rowCount > 1) {
      similarTitleGroups.push({
        normalizedTitle: normTitle,
        exactTitles: Array.from(bucket.exactTitles),
        rowCount: bucket.rowCount,
        bookIds: Array.from(bucket.bookIds),
        publishers: Array.from(bucket.publishers),
        disambiguationNote:
          'عناوین هم‌نام بدون ادغام خودکار با شناسه‌های مستقل BK نگهداری شده‌اند.',
      });
    }
  }

  // کتاب‌های خارج از فهرست اولیه (ثبت میدانی جدید)
  const outsideAuditKeys = new Set<string>();
  const auditByTempBookId = new Map<string, FieldAuditRecord>();
  let verifiedAuditCount = 0;
  let reviewAuditCount = 0;
  let notFoundAuditCount = 0;
  let expertApprovedAuditCount = 0;

  for (const [k, rec] of Object.entries(auditRecords)) {
    const key = rec.key || k;
    if (rec.tempBookId) {
      auditByTempBookId.set(rec.tempBookId.trim(), rec);
    }
    if (rec.physical === 'verified') verifiedAuditCount += 1;
    else if (rec.physical === 'review') reviewAuditCount += 1;
    else if (rec.physical === 'not_found') notFoundAuditCount += 1;
    if (rec.expertApproved) expertApprovedAuditCount += 1;

    if (rec.source === 'outside-list' && !catalogByRowKey.has(key)) {
      outsideAuditKeys.add(key);
      const copiesRaw = rec.countedCopies;
      const numericCopies = Number(toEnglishDigits(copiesRaw).trim());
      if (
        copiesRaw &&
        String(copiesRaw).trim() !== '' &&
        Number.isFinite(numericCopies) &&
        numericCopies >= 0
      ) {
        reportedCountedCopiesSum += numericCopies;
        booksWithCountedCopiesNumberCount += 1;
      }
    }
  }

  // نسخه‌های فیزیکی مستقل (CP-xxxxxx)
  const distinctCopyIds = new Set<string>();
  const physicalCopiesStatusBreakdown = {
    verifiedPresent: 0,
    pendingReview: 0,
    loaned: 0,
    missing: 0,
    outOfCollection: 0,
  };
  for (const cp of bookCopies) {
    const cid = (cp.copyId || '').trim();
    if (!cid || distinctCopyIds.has(cid)) continue;
    distinctCopyIds.add(cid);
    if (cp.copyStatus === 'verified_present') physicalCopiesStatusBreakdown.verifiedPresent += 1;
    else if (cp.copyStatus === 'pending_review') physicalCopiesStatusBreakdown.pendingReview += 1;
    else if (cp.copyStatus === 'loaned') physicalCopiesStatusBreakdown.loaned += 1;
    else if (cp.copyStatus === 'missing') physicalCopiesStatusBreakdown.missing += 1;
    else if (cp.copyStatus === 'out_of_collection') {
      physicalCopiesStatusBreakdown.outOfCollection += 1;
    }
  }

  // نگاشت نسخه‌های فیزیکی بر اساس bookId
  const copyStatsByBookId = new Map<string, { count: number; hasVerifiedPresent: boolean }>();
  for (const cp of bookCopies) {
    const bid = (cp.bookId || '').trim();
    if (!bid) continue;
    const prev = copyStatsByBookId.get(bid) || { count: 0, hasVerifiedPresent: false };
    prev.count += 1;
    if (cp.copyStatus === 'verified_present') prev.hasVerifiedPresent = true;
    copyStatsByBookId.set(bid, prev);
  }

  // نگاشت پیوندهای شهید و پیگیری‌های باز به هر کتاب
  const bookActiveMartyrsMap = new Map<string, Set<string>>();
  const bookActiveLinksMap = new Map<string, BookMartyrLinkRecord[]>();
  const bookHasAnyActiveLink = new Set<string>();
  const bookHasOpenLinkIssue = new Set<string>();

  for (const lnk of links) {
    if (isRejectedLinkStatus(lnk.reviewStatus)) continue;
    let bookKey = '';
    const bookId = (lnk.tempBookId || '').trim();
    if (bookId && catalogByTempBookId.has(bookId)) {
      bookKey = resolveCatalogRowKey(catalogByTempBookId.get(bookId)!);
    } else if (bookId && auditByTempBookId.has(bookId)) {
      const aud = auditByTempBookId.get(bookId)!;
      bookKey = aud.key || `BK::${bookId}`;
    } else {
      const compLinkTitle = compactPersian(lnk.bookTitleRaw);
      if (compLinkTitle) {
        const candidates = catalogRows.filter(
          (r) => compactPersian(r.titleRaw) === compLinkTitle
        );
        if (candidates.length === 1) {
          bookKey = resolveCatalogRowKey(candidates[0]);
        }
      }
    }

    if (!bookKey) continue;
    bookHasAnyActiveLink.add(bookKey);
    const activeList = bookActiveLinksMap.get(bookKey) || [];
    activeList.push(lnk);
    bookActiveLinksMap.set(bookKey, activeList);

    if (hasOpenLinkIssueStatus(lnk.reviewStatus)) {
      bookHasOpenLinkIssue.add(bookKey);
    }

    if (!isPlaceholderOrGroupMartyrPhrase(lnk.martyrNameRaw, lnk.isGroupPhrase)) {
      const normName = stripMartyrHonorifics(lnk.martyrNameRaw);
      if (normName) {
        const set = bookActiveMartyrsMap.get(bookKey) || new Set<string>();
        set.add(normName);
        bookActiveMartyrsMap.set(bookKey, set);
      }
    }
  }

  // تفکیک تیکت‌های باز کتاب (مانند PV-0558..PV-0567) از تیکت‌های باز شیت ارتباط
  const bookHasOpenDirectTicket = new Set<string>();
  const bookHasOpenAnyPendingItem = new Set<string>();
  const openBookTicketIds: string[] = [];

  const linkIdToBookKey = new Map<string, string>();
  for (const lnk of links) {
    const bid = (lnk.tempBookId || '').trim();
    if (lnk.id && bid && catalogByTempBookId.has(bid)) {
      linkIdToBookKey.set(lnk.id.trim(), resolveCatalogRowKey(catalogByTempBookId.get(bid)!));
    }
  }
  for (const pv of pendingReviews) {
    if (isPendingTicketClosed(pv.trackingStatus)) {
      continue;
    }
    const recId = (pv.mainRecordId || '').trim();
    const isBookSheetTicket =
      normalizePersian(pv.mainSheet) === 'فهرست کتاب ها' || /^BK-/i.test(recId);
    if (recId && catalogByTempBookId.has(recId)) {
      const bKey = resolveCatalogRowKey(catalogByTempBookId.get(recId)!);
      bookHasOpenAnyPendingItem.add(bKey);
      if (isBookSheetTicket) {
        bookHasOpenDirectTicket.add(bKey);
        if (pv.trackingId) openBookTicketIds.push(pv.trackingId);
      }
    } else if (recId && auditByTempBookId.has(recId)) {
      const bKey = auditByTempBookId.get(recId)!.key || `BK::${recId}`;
      bookHasOpenAnyPendingItem.add(bKey);
      if (isBookSheetTicket) {
        bookHasOpenDirectTicket.add(bKey);
        if (pv.trackingId) openBookTicketIds.push(pv.trackingId);
      }
    } else if (recId && linkIdToBookKey.has(recId)) {
      bookHasOpenAnyPendingItem.add(linkIdToBookKey.get(recId)!);
    }
  }

  const trackedKeys: Array<{ key: string; row?: ReferenceCatalogRow; audit?: FieldAuditRecord }> = [];
  for (const row of catalogRows) {
    const key = resolveCatalogRowKey(row);
    trackedKeys.push({ key, row, audit: auditRecords[key] });
  }
  for (const outKey of outsideAuditKeys) {
    trackedKeys.push({ key: outKey, audit: auditRecords[outKey] });
  }

  let reviewedWithMartyrLinkCount = 0;
  let reviewedWithoutMartyrLinkCount = 0;
  let inFieldReviewCount = 0;
  let untouchedUnreviewedCount = 0;
  let reviewedBooksWithOpenRelationQueueCount = 0;

  // سه برش مستقل مصوب کارفرما (گزینه ج) در لایه مدیریتی
  let managerialCompletedClean = 0;
  let managerialOpenBookTicket = 0;
  let managerialUnreviewed = 0;

  // ۱۲ شاخص تفصیلی کتابخانه بر اساس معیار اکید تکمیل
  let strictCompletedCount = 0;
  let strictInProgressCount = 0;
  let strictNotStartedCount = 0;
  let workedOrRegisteredCount = 0;
  let shelfVerifiedPresentCount = 0;
  let expertApprovedBooksCount = 0;
  let awaitingExpertApprovalCount = 0;
  let openDuplicateTitleTicketsCount = 0;
  let hasRegisteredMartyrLinkCount = 0;
  let lacksRegisteredMartyrLinkCount = 0;

  let strictReviewedWithoutMartyrLinkCount = 0;

  for (const item of trackedKeys) {
    const { key, row, audit } = item;
    const tid = (audit?.tempBookId || row?.tempBookId || '').trim();
    const copyStat = tid ? copyStatsByBookId.get(tid) : undefined;
    const bookLinks = bookActiveLinksMap.get(key) || [];

    const excludedSet = new Set(
      (audit?.excludedMartyrs || []).map((m) => stripMartyrHonorifics(m)).filter(Boolean)
    );
    const linkNames = new Set(bookActiveMartyrsMap.get(key) || []);
    for (const rm of audit?.relatedMartyrs || []) {
      if (!isPlaceholderOrGroupMartyrPhrase(rm, false)) {
        const clean = stripMartyrHonorifics(rm);
        if (clean) linkNames.add(clean);
      }
    }
    for (const ex of excludedSet) {
      linkNames.delete(ex);
    }

    const flags = evaluateBookCompletionAndActivityFlags({
      row,
      audit,
      registeredCopiesCount: copyStat?.count || 0,
      verifiedPresentCopyExists: Boolean(copyStat?.hasVerifiedPresent),
      bookActiveLinks: bookLinks,
      activeAuditMartyrCount: linkNames.size,
      hasOpenDirectBookTicket: bookHasOpenDirectTicket.has(key),
      hasOpenAnyPendingTicket: bookHasOpenAnyPendingItem.has(key),
      hasOpenLinkIssue: bookHasOpenLinkIssue.has(key),
    });

    const hasActiveLinkOnBook = flags.hasRegisteredMartyrLink;
    if (hasActiveLinkOnBook) hasRegisteredMartyrLinkCount += 1;
    else lacksRegisteredMartyrLinkCount += 1;

    if (flags.isWorkedOrRegistered) workedOrRegisteredCount += 1;
    if (flags.isShelfVerifiedPresent) shelfVerifiedPresentCount += 1;
    if (flags.isExpertApproved) expertApprovedBooksCount += 1;
    if (
      flags.isWorkedOrRegistered &&
      !flags.isExpertApproved &&
      audit?.physical !== 'not_found'
    ) {
      awaitingExpertApprovalCount += 1;
    }
    if (flags.hasOpenDirectBookTicket) openDuplicateTitleTicketsCount += 1;

    if (flags.isStrictCompleted) {
      strictCompletedCount += 1;
      if (!hasActiveLinkOnBook) {
        strictReviewedWithoutMartyrLinkCount += 1;
      }
    } else if (flags.lifecycleStage === 'in_progress') {
      strictInProgressCount += 1;
    } else {
      strictNotStartedCount += 1;
    }

    // افراز فاز اول برای ردیابی بررسی میدانی / کاتالوگ (حفظ هم‌پوشانی صریح در reviewBreakdown)
    const isNeedsFieldReview = Boolean(
      audit && (audit.physical === 'review' || audit.needsReview === true)
    );
    const isPhase1Reviewed =
      (Boolean(audit) && audit!.physical === 'verified' && !audit!.needsReview) ||
      (!audit && flags.isCatalogMarkedReviewed);
    if (isPhase1Reviewed) {
      if (hasActiveLinkOnBook) {
        reviewedWithMartyrLinkCount += 1;
      } else {
        reviewedWithoutMartyrLinkCount += 1;
      }
      if (bookHasOpenLinkIssue.has(key) || bookHasOpenAnyPendingItem.has(key)) {
        reviewedBooksWithOpenRelationQueueCount += 1;
      }
    } else if (isNeedsFieldReview) {
      inFieldReviewCount += 1;
    } else {
      untouchedUnreviewedCount += 1;
    }

    // افراز سه وضعیت مستقل بدون هم‌پوشانی (گزینه ج) در لایه مدیریتی:
    if (flags.hasOpenDirectBookTicket || isNeedsFieldReview) {
      managerialOpenBookTicket += 1;
    } else if (flags.isStrictCompleted) {
      managerialCompletedClean += 1;
    } else {
      managerialUnreviewed += 1;
    }
  }

  const totalTrackedBooksCount = trackedKeys.length;
  const reviewedCount = reviewedWithMartyrLinkCount + reviewedWithoutMartyrLinkCount;
  const remainingForReviewCount = inFieldReviewCount + untouchedUnreviewedCount;
  const eligibleForReviewCount =
    remainingForReviewCount + reviewedBooksWithOpenRelationQueueCount;

  const detailedBreakdown: LibraryDetailedBreakdown = {
    totalTrackedBooksCount,
    completedCount: strictCompletedCount,
    inProgressCount: strictInProgressCount,
    notStartedCount: strictNotStartedCount,
    workedOrRegisteredCount,
    unworkedCount: Math.max(0, totalTrackedBooksCount - workedOrRegisteredCount),
    shelfVerifiedPresentCount,
    expertApprovedCount: expertApprovedBooksCount,
    awaitingExpertApprovalCount,
    openDuplicateTitleTicketsCount,
    hasRegisteredMartyrLinkCount,
    lacksRegisteredMartyrLinkCount,
    reviewedWithoutMartyrLinkCount: strictReviewedWithoutMartyrLinkCount,
  };

  return {
    catalogRowsCount: catalogRows.length,
    distinctCatalogBookIdsCount: distinctBookIds.size,
    outsideCatalogBooksCount: outsideAuditKeys.size,
    totalTrackedBooksCount,
    exactUniqueCatalogTitlesCount: exactTitles.size,
    normalizedUniqueCatalogTitlesCount: normTitles.size,
    similarTitleGroups,
    registeredPhysicalCopiesCount: distinctCopyIds.size,
    physicalCopiesStatusBreakdown,
    reportedCountedCopiesSum,
    booksWithCountedCopiesNumberCount,
    reviewBreakdown: {
      totalTrackedBooksCount,
      reviewedWithMartyrLinkCount,
      reviewedWithoutMartyrLinkCount,
      reviewedCount,
      inFieldReviewCount,
      untouchedUnreviewedCount,
      remainingForReviewCount,
      eligibleForReviewCount,
      overlapRemainingAndEligibleCount: remainingForReviewCount,
      reviewedBooksWithOpenRelationQueueCount,
      managerialStatusPartition: {
        completedWithoutOpenTicketCount: managerialCompletedClean,
        openBookTicketCount: managerialOpenBookTicket,
        unreviewedCount: managerialUnreviewed,
        totalTrackedBooksCount,
        openBookTicketIds: Array.from(new Set(openBookTicketIds)).sort(),
      },
    },
    detailedBreakdown,
    fieldAuditSummary: {
      totalAuditRecords: Object.keys(auditRecords).length,
      verified: verifiedAuditCount,
      review: reviewAuditCount,
      notFound: notFoundAuditCount,
      expertApproved: expertApprovedAuditCount,
    },
  };
}
