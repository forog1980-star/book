import { normalizePersian } from '../normalization';
import type { ExecutiveDashboardInputs, ReviewQueueResult } from '../types';

/**
 * تحلیل‌گر مستقل صف‌های بررسی کارشناسی:
 * - پیگیری «موارد نیازمند بررسی» (PV-xxxx)
 * - تفکیک ۱۶ گروه کتاب‌های چندشهیدی (G001..G016 / ردیف آغاز گروه در شیت «چند شهید»)
 * - صف بررسی کتاب‌ها، پیوندها، پیشنهادهای هوشمند و مطالب استخراج‌شده
 */
export function selectReviewQueue(
  inputs: ExecutiveDashboardInputs
): ReviewQueueResult {
  const pendingReviews = inputs.pendingReviews || [];
  const links = inputs.links || [];
  const smartSuggestions = inputs.smartSuggestions || [];
  const extractedItems = inputs.extractedItems || [];

  let openCount = 0;
  let resolvedCount = 0;
  let otherStatusCount = 0;
  const openByMainSheet: Record<string, number> = {};
  const resolvedByMainSheet: Record<string, number> = {};
  const openByIssueType: Record<string, number> = {};

  let pvBookBacklog = 0;
  let pvLinkBacklog = 0;

  for (const pv of pendingReviews) {
    const st = normalizePersian(pv.trackingStatus || 'باز');
    if (st === 'باز' || st === 'در حال پیگیری' || st === 'نیازمند منبع' || st === '') {
      openCount += 1;
      const sheetName = (pv.mainSheet || 'نامشخص').trim();
      openByMainSheet[sheetName] = (openByMainSheet[sheetName] || 0) + 1;
      const issue = (pv.issueSubject || 'سایر').trim();
      openByIssueType[issue] = (openByIssueType[issue] || 0) + 1;

      if (sheetName.includes('فهرست کتاب')) pvBookBacklog += 1;
      else pvLinkBacklog += 1;
    } else if (st === 'بررسی شده' || st === 'بررسی‌شده' || st === 'بسته' || st === 'ردشده با دلیل') {
      resolvedCount += 1;
      const sheetName = (pv.mainSheet || 'نامشخص').trim();
      resolvedByMainSheet[sheetName] = (resolvedByMainSheet[sheetName] || 0) + 1;
    } else {
      otherStatusCount += 1;
    }
  }

  // استخراج گروه‌های چندشهیدی (از groupCode یا groupStartRow در شیت «چند شهید»)
  const groupKeysSet = new Set<string>();
  let multiMartyrMemberRowsCount = 0;
  let linksNeedingReviewCount = 0;

  for (const lnk of links) {
    const isMultiSheet = normalizePersian(lnk.sourceSheet) === 'چند شهید';
    if (isMultiSheet) {
      multiMartyrMemberRowsCount += 1;
      const gKey =
        (lnk.groupCode || '').trim() ||
        (lnk.groupStartRow ? `START_ROW_${lnk.groupStartRow.trim()}` : '') ||
        (lnk.bookTitleRaw ? `TITLE_${normalizePersian(lnk.bookTitleRaw)}` : '');
      if (gKey) groupKeysSet.add(gKey);
    }

    const lst = normalizePersian(lnk.reviewStatus);
    if (
      lst.includes('نیازمند') ||
      lst.includes('تکمیل') ||
      lst.includes('تفکیک') ||
      lst.includes('در صف') ||
      lst.includes('تعارض')
    ) {
      linksNeedingReviewCount += 1;
    }
  }

  let pendingExpertQueueCount = 0;
  let conflictCount = 0;
  let approvedCount = 0;
  let rejectedCount = 0;
  for (const ss of smartSuggestions) {
    const sst = normalizePersian(ss.reviewStatus);
    if (sst.includes('در صف')) pendingExpertQueueCount += 1;
    else if (sst.includes('تعارض')) conflictCount += 1;
    else if (sst.includes('تایید')) approvedCount += 1;
    else if (sst.includes('رد')) rejectedCount += 1;
  }

  let exApproved = 0;
  let exResearch = 0;
  let exNeedsReview = 0;
  let exRaw = 0;
  let exRejected = 0;
  for (const ex of extractedItems) {
    const est = normalizePersian(ex.reviewStatus);
    if (est === 'تاییدشده کارشناسی') exApproved += 1;
    else if (est === 'بررسی شده در پژوهش اصلی' || est === 'بررسی‌شده در پژوهش اصلی') {
      exResearch += 1;
    } else if (est.includes('نیازمند')) exNeedsReview += 1;
    else if (est.includes('رد')) exRejected += 1;
    else exRaw += 1;
  }

  return {
    pendingReviews: {
      totalCount: pendingReviews.length,
      openCount,
      resolvedCount,
      otherStatusCount,
      openByMainSheet,
      resolvedByMainSheet,
      openByIssueType,
    },
    multiMartyrGroups: {
      totalGroupsCount: groupKeysSet.size,
      totalMemberRowsCount: multiMartyrMemberRowsCount,
      groupKeys: Array.from(groupKeysSet).sort(),
    },
    linkReviewBacklogCount: Math.max(linksNeedingReviewCount, pvLinkBacklog),
    bookReviewBacklogCount: pvBookBacklog,
    smartSuggestionsQueue: {
      totalCount: smartSuggestions.length,
      pendingExpertQueueCount,
      conflictCount,
      approvedCount,
      rejectedCount,
    },
    extractedItemsQueue: {
      totalCount: extractedItems.length,
      expertApprovedCount: exApproved,
      baseResearchReviewedCount: exResearch,
      needsReviewCount: exNeedsReview,
      rawInitialCount: exRaw,
      rejectedCount: exRejected,
    },
  };
}
