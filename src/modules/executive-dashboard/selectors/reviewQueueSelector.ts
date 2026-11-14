import {
  classifyPendingReviewStatus,
  classifyWorkTopicDomain,
  normalizePersian,
  splitCompoundIssueSubjects,
  type WorkTopicDomainKey,
} from '../normalization';
import type {
  DomainWorkBreakdownItem,
  ExecutiveDashboardInputs,
  ReviewQueueResult,
} from '../types';

/**
 * تحلیل‌گر مستقل صف‌های بررسی کارشناسی:
 * - پیگیری «موارد نیازمند بررسی» (PV-xxxx) با تفکیک وضعیت‌های باز، نیازمند منبع و انجام‌شده
 * - تفکیک هر موضوع مستقل (حتی در پرونده‌های چندموضوعی جداشده با «؛») بین کتابخانه، شهدا و ارتباطات
 * - تفکیک ۱۶ گروه کتاب‌های چندشهیدی و صف بررسی کتاب‌ها، پیوندها، پیشنهادهای هوشمند و مطالب استخراج‌شده
 */
export function selectReviewQueue(
  inputs: ExecutiveDashboardInputs
): ReviewQueueResult {
  const pendingReviews = inputs.pendingReviews || [];
  const auditRecords = inputs.auditRecords || {};
  const customMartyrs = inputs.customMartyrs || [];
  const links = inputs.links || [];
  const smartSuggestions = inputs.smartSuggestions || [];
  const extractedItems = inputs.extractedItems || [];

  let openCount = 0;
  let openPlainCount = 0;
  let needsSourceCount = 0;
  let resolvedCount = 0;
  let otherStatusCount = 0;
  const statusCounts: Record<string, number> = {};
  const openByMainSheet: Record<string, number> = {};
  const resolvedByMainSheet: Record<string, number> = {};
  const openByIssueType: Record<string, number> = {};

  let pvBookBacklog = 0;
  let pvLinkBacklog = 0;

  let totalTopicsCount = 0;
  let completedTopicsCount = 0;
  let remainingTopicsCount = 0;
  let compoundRecordsCount = 0;

  const domainCounters: Record<
    WorkTopicDomainKey,
    { total: number; completed: number; remaining: number }
  > = {
    library: { total: 0, completed: 0, remaining: 0 },
    martyrs: { total: 0, completed: 0, remaining: 0 },
    relations: { total: 0, completed: 0, remaining: 0 },
  };

  const openLibraryRecordIds = new Set<string>();
  const openRelationLinkIds = new Set<string>();

  for (const pv of pendingReviews) {
    const rawStatusLabel = (pv.trackingStatus || 'باز').trim() || 'باز';
    statusCounts[rawStatusLabel] = (statusCounts[rawStatusLabel] || 0) + 1;
    const statusKind = classifyPendingReviewStatus(rawStatusLabel);
    const sheetName = (pv.mainSheet || 'نامشخص').trim();
    const isCompleted = statusKind === 'resolved';

    if (statusKind === 'open' || statusKind === 'needs_source') {
      openCount += 1;
      if (statusKind === 'needs_source') {
        needsSourceCount += 1;
      } else {
        openPlainCount += 1;
      }
      openByMainSheet[sheetName] = (openByMainSheet[sheetName] || 0) + 1;
      const issue = (pv.issueSubject || 'سایر').trim();
      openByIssueType[issue] = (openByIssueType[issue] || 0) + 1;

      if (sheetName.includes('فهرست کتاب')) pvBookBacklog += 1;
      else pvLinkBacklog += 1;
    } else if (isCompleted) {
      resolvedCount += 1;
      resolvedByMainSheet[sheetName] = (resolvedByMainSheet[sheetName] || 0) + 1;
    } else {
      otherStatusCount += 1;
    }

    // تفکیک موضوعات مستقل موجود در پرونده (هر موضوع مستقل = ۱ مورد کاری)
    const topics = splitCompoundIssueSubjects(pv.issueSubject);
    if (topics.length > 1) {
      compoundRecordsCount += 1;
    }
    const recId = (pv.mainRecordId || '').trim();
    for (const topic of topics) {
      totalTopicsCount += 1;
      const domain = classifyWorkTopicDomain(pv.mainSheet, topic, recId);
      domainCounters[domain].total += 1;
      if (isCompleted) {
        completedTopicsCount += 1;
        domainCounters[domain].completed += 1;
      } else {
        remainingTopicsCount += 1;
        domainCounters[domain].remaining += 1;
        if (domain === 'library' && recId) {
          openLibraryRecordIds.add(recId);
        } else if (domain === 'relations' && recId) {
          openRelationLinkIds.add(recId);
        }
      }
    }
  }

  // محاسبه موارد کاری قابل اقدام خارج از صف PV در سه حوزه (بدون دوباره‌شماری تیکت‌های باز PV)
  let extraLibraryBacklog = 0;
  for (const aud of Object.values(auditRecords)) {
    const isReviewAudit = Boolean(aud && (aud.physical === 'review' || aud.needsReview === true));
    if (!isReviewAudit) continue;
    const tid = (aud.tempBookId || '').trim();
    if (!tid || !openLibraryRecordIds.has(tid)) {
      extraLibraryBacklog += 1;
    }
  }

  let extraMartyrsBacklog = 0;
  for (const cm of customMartyrs) {
    const st = normalizePersian(cm.identityVerificationStatus);
    if (st !== 'تاییدشده' && st !== 'ردشده') {
      extraMartyrsBacklog += 1;
    }
  }

  // استخراج گروه‌های چندشهیدی (از groupCode یا groupStartRow در شیت «چند شهید»)
  const groupKeysSet = new Set<string>();
  let multiMartyrMemberRowsCount = 0;
  let linksNeedingReviewCount = 0;
  let extraLinkQueueBacklog = 0;

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
    const needsLinkReview =
      lst.includes('نیازمند') ||
      lst.includes('تکمیل') ||
      lst.includes('تفکیک') ||
      lst.includes('در صف') ||
      lst.includes('تعارض');
    if (needsLinkReview) {
      linksNeedingReviewCount += 1;
      if (!lnk.id || !openRelationLinkIds.has(lnk.id.trim())) {
        extraLinkQueueBacklog += 1;
      }
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
    if (est === 'تاییدشده کارشناسی' || est === 'تایید شده کارشناسی') exApproved += 1;
    else if (est === 'بررسی شده در پژوهش اصلی' || est === 'بررسی‌شده در پژوهش اصلی') {
      exResearch += 1;
    } else if (est.includes('نیازمند')) exNeedsReview += 1;
    else if (est.includes('رد')) exRejected += 1;
    else exRaw += 1;
  }

  const buildDomainItem = (
    domain: WorkTopicDomainKey,
    label: DomainWorkBreakdownItem['label'],
    additionalOpenBacklogCount: number
  ): DomainWorkBreakdownItem => ({
    domain,
    label,
    pvTopicsTotal: domainCounters[domain].total,
    pvTopicsCompleted: domainCounters[domain].completed,
    pvTopicsRemaining: domainCounters[domain].remaining,
    additionalOpenBacklogCount,
    totalActionableRemainingCount: domainCounters[domain].remaining + additionalOpenBacklogCount,
  });

  return {
    pendingReviews: {
      totalCount: pendingReviews.length,
      openCount,
      openPlainCount,
      needsSourceCount,
      resolvedCount,
      otherStatusCount,
      statusCounts,
      openByMainSheet,
      resolvedByMainSheet,
      openByIssueType,
    },
    independentWorkTopics: {
      totalTopicsCount,
      completedTopicsCount,
      remainingTopicsCount,
      compoundRecordsCount,
      domainBreakdown: {
        library: buildDomainItem('library', 'کتابخانه', extraLibraryBacklog),
        martyrs: buildDomainItem('martyrs', 'شهدا', extraMartyrsBacklog),
        relations: buildDomainItem(
          'relations',
          'ارتباطات',
          extraLinkQueueBacklog + pendingExpertQueueCount + conflictCount
        ),
      },
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

