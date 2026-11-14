import type { AuditLogEntry, ExtractedContentItem } from '../../../data/markazAsnadData';
import {
  classifyPendingReviewStatus,
  compactPersian,
  isDraftLabelOrStatus,
  normalizePersian,
  normalizeVersionedOutputIdentity,
  stripMartyrHonorifics,
} from '../normalization';
import type {
  ActivityLogAnalyticsSummary,
  DashboardSummaryResult,
  ExecutiveDashboardInputs,
  ExecutiveExportHistoryRecord,
  FinalizedManagementReportsSummary,
  FinalizedResearchOutputsSummary,
  WorkAndOutputsDetailedAnalytics,
} from '../types';
import type { ExecutiveEntityProjection } from './entityDossiersSelector';

function isFinalizedResearchItem(item: ExtractedContentItem): boolean {
  if (
    isDraftLabelOrStatus(item.reviewStatus) ||
    isDraftLabelOrStatus(item.passageTitle) ||
    isDraftLabelOrStatus(item.researcherNote)
  ) {
    return false;
  }
  const st = compactPersian(item.reviewStatus);
  return (
    st === 'تاییدشدهکارشناسی' ||
    st === 'تاییدکارشناس' ||
    st === 'نهایی' ||
    st === 'تاییدنهایی' ||
    st === 'منتشرشده'
  );
}

/**
 * تفکیک دقیق «مطالب و موارد پژوهشی استخراج‌شده» از «خروجی‌های پژوهشی نهایی و مستقل»:
 * - پیش‌نویس‌ها خروجی نهایی محسوب نمی‌شوند.
 * - نسخه‌های متعدد یک محصول پژوهشی، خروجی مستقل جدید محسوب نمی‌شوند.
 */
export function selectFinalizedResearchOutputsSummary(
  extractedItems: ExtractedContentItem[] = []
): FinalizedResearchOutputsSummary {
  let expertApproved = 0;
  let baseResearchReviewed = 0;
  let needsReview = 0;
  let rawOrDraft = 0;
  let rejected = 0;

  const finalizedKeys = new Set<string>();
  let rawFinalizedRecordsCount = 0;

  for (const item of extractedItems) {
    const comp = compactPersian(item.reviewStatus);
    if (comp.includes('رد')) {
      rejected += 1;
      continue;
    }

    if (isFinalizedResearchItem(item)) {
      expertApproved += 1;
      rawFinalizedRecordsCount += 1;
      const bookPart = (item.tempBookId || '').trim() || compactPersian(item.bookTitleRaw);
      const martyrPart = stripMartyrHonorifics(item.martyrNameRaw) || 'GENERAL';
      const titlePart =
        normalizeVersionedOutputIdentity(item.passageTitle) ||
        normalizePersian(item.contentType) ||
        item.id;
      finalizedKeys.add(`${bookPart}::${martyrPart}::${titlePart}`);
    } else if (comp === 'بررسیشدهدرپژوهشاصلی') {
      baseResearchReviewed += 1;
    } else if (comp.includes('نیازمند')) {
      needsReview += 1;
    } else {
      rawOrDraft += 1;
    }
  }

  const totalExtractedNonRejectedCount = Math.max(0, extractedItems.length - rejected);
  const finalIndependentOutputsCount = finalizedKeys.size;
  const duplicateVersionsCollapsedCount = Math.max(
    0,
    rawFinalizedRecordsCount - finalIndependentOutputsCount
  );
  const nonFinalOrDraftExtractedCount = Math.max(
    0,
    totalExtractedNonRejectedCount - rawFinalizedRecordsCount
  );

  return {
    totalExtractedNonRejectedCount,
    finalIndependentOutputsCount,
    rawFinalizedRecordsCount,
    duplicateVersionsCollapsedCount,
    nonFinalOrDraftExtractedCount,
    breakdownByStatus: {
      expertApproved,
      baseResearchReviewed,
      needsReview,
      rawOrDraft,
      rejected,
    },
  };
}

/**
 * محاسبه گزارش‌های مدیریتی نهایی و مستقل از سابقه واقعی صدور گزارش:
 * - گزارش‌های ناموفق و پیش‌نویس کنار گذاشته می‌شوند.
 * - نسخه‌های متعدد از یک گزارش مشابه (با تفاوت شماره نسخه یا تاریخ صدور) فقط یک گزارش مستقل محسوب می‌شوند.
 */
export function selectFinalizedManagementReportsSummary(
  exportHistory: ExecutiveExportHistoryRecord[] = []
): FinalizedManagementReportsSummary {
  const uniqueKeys = new Set<string>();
  let rawSuccessfulIssuancesCount = 0;
  let draftOrFailedExcludedCount = 0;
  let excelUniqueCount = 0;
  let jsonUniqueCount = 0;
  let latestIssuedAtDisplay: string | null = null;

  for (const rec of exportHistory) {
    const isDraft =
      isDraftLabelOrStatus(rec.fileName) || isDraftLabelOrStatus(rec.appliedFiltersSummary);
    if (rec.status !== 'success' || isDraft) {
      draftOrFailedExcludedCount += 1;
      continue;
    }

    rawSuccessfulIssuancesCount += 1;
    if (!latestIssuedAtDisplay && rec.timestampDisplay) {
      latestIssuedAtDisplay = rec.timestampDisplay;
    }

    const baseName = normalizeVersionedOutputIdentity(rec.fileName) || rec.exportScope;
    const filterSig = normalizePersian(rec.appliedFiltersSummary || 'همه');
    const canonicalKey = `${rec.exportScope}::${rec.fileType}::${baseName}::${filterSig}`;
    if (!uniqueKeys.has(canonicalKey)) {
      uniqueKeys.add(canonicalKey);
      if (rec.fileType === 'excel') excelUniqueCount += 1;
      else jsonUniqueCount += 1;
    }
  }

  const finalIndependentReportsCount = uniqueKeys.size;
  const duplicateVersionsCollapsedCount = Math.max(
    0,
    rawSuccessfulIssuancesCount - finalIndependentReportsCount
  );

  return {
    finalIndependentReportsCount,
    rawSuccessfulIssuancesCount,
    duplicateVersionsCollapsedCount,
    draftOrFailedExcludedCount,
    byFileType: {
      excel: excelUniqueCount,
      json: jsonUniqueCount,
    },
    latestIssuedAtDisplay,
  };
}

export function selectActivityLogSummary(
  auditLogs: AuditLogEntry[] = []
): ActivityLogAnalyticsSummary {
  const countsMap = new Map<string, number>();
  let latestTimestamp: string | null = null;

  for (const entry of auditLogs) {
    if (!latestTimestamp && entry.timestamp) {
      latestTimestamp = entry.timestamp;
    }
    const label = (entry.actionType || 'سایر فعالیت‌ها').trim();
    countsMap.set(label, (countsMap.get(label) || 0) + 1);
  }

  const byActionType = Array.from(countsMap.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fa'))
    .map(([actionType, count]) => ({ actionType, count }));

  return {
    totalEntriesCount: auditLogs.length,
    byActionType,
    latestTimestamp,
  };
}

export function selectWorkAndOutputsDetailedAnalytics(
  inputs: ExecutiveDashboardInputs,
  summary: DashboardSummaryResult,
  exportHistory: ExecutiveExportHistoryRecord[] = []
): WorkAndOutputsDetailedAnalytics {
  const pv = summary.reviewQueue.pendingReviews;
  const reviewQueueStatusBreakdown = Object.entries(pv.statusCounts || {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fa'))
    .map(([status, count]) => ({
      status,
      count,
      isCompleted: classifyPendingReviewStatus(status) === 'resolved',
    }));

  return {
    reviewQueueTotalCount: pv.totalCount,
    reviewQueueCompletedCount: pv.resolvedCount,
    reviewQueueRemainingCount: pv.openCount + pv.otherStatusCount,
    reviewQueueNeedsSourceCount: pv.needsSourceCount,
    reviewQueueOpenPlainCount: pv.openPlainCount,
    reviewQueueStatusBreakdown,
    independentWorkTopics: summary.reviewQueue.independentWorkTopics,
    activityLog: selectActivityLogSummary(inputs.auditLogs || []),
    researchOutputs: selectFinalizedResearchOutputsSummary(inputs.extractedItems || []),
    managementReports: selectFinalizedManagementReportsSummary(exportHistory),
  };
}

export interface StatisticalQueryAnswer {
  id: string;
  question: string;
  targetSection: 'library' | 'martyrs' | 'work';
  targetSectionLabel: 'کتابخانه' | 'شهدا ـ احراز هویت و ارتباطات' | 'وضعیت کار و خروجی‌ها';
  headlineMetric: string;
  explanation: string;
}

export function buildStatisticalQueryAnswers(
  summary: DashboardSummaryResult,
  workAnalytics: WorkAndOutputsDetailedAnalytics
): StatisticalQueryAnswer[] {
  const lib = summary.library.reviewBreakdown.managerialStatusPartition;
  const martyrs = summary.martyrs.linkedMartyrsSummary;
  const rels = summary.relations;
  const dom = workAnalytics.independentWorkTopics.domainBreakdown;

  return [
    {
      id: 'q_library_status',
      question: 'وضعیت بررسی کتاب‌های تحت پایش کتابخانه چگونه است؟',
      targetSection: 'library',
      targetSectionLabel: 'کتابخانه',
      headlineMetric: `${lib.totalTrackedBooksCount} کتاب تحت پایش (${lib.completedWithoutOpenTicketCount} تکمیل‌شده، ${lib.openBookTicketCount} دارای تیکت باز و ${lib.unreviewedCount} بررسی‌نشده)`,
      explanation: `از مجموع ${lib.totalTrackedBooksCount} کتاب پایش‌شده (${summary.library.catalogRowsCount} ردیف کاتالوگ و ${summary.library.outsideCatalogBooksCount} ثبت خارج از فهرست)، ${summary.library.similarTitleGroups.length} گروه عنوان هم‌نام بدون ادغام خودکار شناسایی شده است.`,
    },
    {
      id: 'q_martyrs_and_relations',
      question: 'چند شهید مرتبط احراز هویت شده‌اند و وضعیت قطعیت ارتباطات چیست؟',
      targetSection: 'martyrs',
      targetSectionLabel: 'شهدا ـ احراز هویت و ارتباطات',
      headlineMetric: `${martyrs.distinctNormalizedLinkedNamesCount} شهید مرتبط (${martyrs.confirmedUniqueLinkedMartyrsCount} احرازشده، ${martyrs.ambiguousOrUnverifiedLinkedNamesCount} نیازمند احراز) در ${rels.booksWithLinksBreakdown.totalBooksWithActiveLinks} کتاب`,
      explanation: `از ${rels.totalRawLinkRows} ردیف ارتباط (${rels.distinctBookTargetPairsCount} زوج متمایز کتاب-شهید)، ${rels.certaintyByDistinctPairs.confirmedByExpert} مورد تأیید کارشناسی، ${rels.certaintyByDistinctPairs.probable} مورد دارای مشخصات مزار بررسی‌نشده و ${rels.certaintyByDistinctPairs.needsReview} مورد نیازمند بررسی هستند.`,
    },
    {
      id: 'q_work_domain_split',
      question: 'موارد کاری صف پیگیری چگونه بین کتابخانه، شهدا و ارتباطات تفکیک شده‌اند؟',
      targetSection: 'work',
      targetSectionLabel: 'وضعیت کار و خروجی‌ها',
      headlineMetric: `${workAnalytics.reviewQueueTotalCount} ردیف صف (${workAnalytics.independentWorkTopics.totalTopicsCount} موضوع کاری مستقل): کتابخانه ${dom.library.totalActionableRemainingCount} · شهدا ${dom.martyrs.totalActionableRemainingCount} · ارتباطات ${dom.relations.totalActionableRemainingCount}`,
      explanation: `در ${workAnalytics.independentWorkTopics.compoundRecordsCount} پرونده صف، بیش از یک موضوع مستقل ثبت شده است. همچنین ${workAnalytics.reviewQueueCompletedCount} مورد انجام‌شده و ${workAnalytics.reviewQueueNeedsSourceCount} مورد در وضعیت «نیازمند منبع» (جزو باقیمانده‌ها) قرار دارند.`,
    },
    {
      id: 'q_research_vs_final_outputs',
      question: 'تفاوت مطالب استخراج‌شده پژوهشی با خروجی‌های نهایی و گزارش‌های مدیریتی چیست؟',
      targetSection: 'work',
      targetSectionLabel: 'وضعیت کار و خروجی‌ها',
      headlineMetric: `${workAnalytics.researchOutputs.totalExtractedNonRejectedCount} مطلب استخراج‌شده در برابر ${workAnalytics.researchOutputs.finalIndependentOutputsCount} خروجی پژوهشی نهایی مستقل و ${workAnalytics.managementReports.finalIndependentReportsCount} گزارش مدیریتی نهایی`,
      explanation: `مطالب پژوهش اولیه و پیش‌نویس‌ها (${workAnalytics.researchOutputs.nonFinalOrDraftExtractedCount} مورد) خروجی نهایی محسوب نمی‌شوند. همچنین ${workAnalytics.researchOutputs.duplicateVersionsCollapsedCount} نسخه تکراری پژوهشی و ${workAnalytics.managementReports.duplicateVersionsCollapsedCount} نسخه تکراری گزارش مدیریتی به‌عنوان خروجی مستقل جدید شمرده نشده‌اند.`,
    },
    {
      id: 'q_activity_log_independence',
      question: 'چه تعداد فعالیت در تاریخچه سامانه ثبت شده و رابطه‌اش با صف پیگیری چیست؟',
      targetSection: 'work',
      targetSectionLabel: 'وضعیت کار و خروجی‌ها',
      headlineMetric: `${workAnalytics.activityLog.totalEntriesCount} فعالیت ثبت‌شده در تاریخچه (مستقل از ${workAnalytics.reviewQueueCompletedCount} مورد انجام‌شده صف)`,
      explanation:
        'ثبت یک رویداد در تاریخچه فعالیت (مانند ثبت قفسه، ویرایش ارتباط یا افزودن یادداشت) لزوماً به معنای بسته‌شدن یک تیکت در صف پیگیری نیست و این دو شاخص جداگانه پایش می‌شوند.',
    },
  ];
}

export interface UnifiedSearchPreview {
  query: string;
  booksMatchesCount: number;
  martyrsMatchesCount: number;
  relationsMatchesCount: number;
  workMatchesCount: number;
  activityMatchesCount: number;
  researchMatchesCount: number;
  reportMatchesCount: number;
  totalMatchesCount: number;
}

export function computeUnifiedStatisticsSearch(
  query: string,
  inputs: ExecutiveDashboardInputs,
  projection: ExecutiveEntityProjection,
  exportHistory: ExecutiveExportHistoryRecord[] = []
): UnifiedSearchPreview {
  const nq = normalizePersian(query);
  if (!nq) {
    return {
      query,
      booksMatchesCount: 0,
      martyrsMatchesCount: 0,
      relationsMatchesCount: 0,
      workMatchesCount: 0,
      activityMatchesCount: 0,
      researchMatchesCount: 0,
      reportMatchesCount: 0,
      totalMatchesCount: 0,
    };
  }

  const booksMatchesCount = projection.books.filter((b) =>
    normalizePersian(
      `${b.tempBookId} ${b.title} ${b.publisher} ${b.author} ${b.locationDisplay} ${b.managerialStatusLabel} ${b.openTicketIds.join(' ')}`
    ).includes(nq)
  ).length;

  const martyrsMatchesCount = projection.martyrs.filter((m) =>
    normalizePersian(
      `${m.displayCode} ${m.fullName} ${m.fatherName} ${m.graveAddress} ${m.identityStatusLabel}`
    ).includes(nq)
  ).length;

  const relationsMatchesCount = projection.relations.filter((r) =>
    normalizePersian(
      `${r.linkId} ${r.tempBookId} ${r.bookTitle} ${r.martyrName} ${r.certaintyLabel} ${r.reviewStatus}`
    ).includes(nq)
  ).length;

  const workMatchesCount = (inputs.pendingReviews || []).filter((pv) =>
    normalizePersian(
      `${pv.trackingId} ${pv.mainSheet} ${pv.mainRecordId} ${pv.bookTitle} ${pv.nameOrPhrase} ${pv.issueSubject} ${pv.trackingStatus}`
    ).includes(nq)
  ).length;

  const activityMatchesCount = (inputs.auditLogs || []).filter((log) =>
    normalizePersian(
      `${log.id} ${log.actionType} ${log.targetId} ${log.actorName} ${log.summary}`
    ).includes(nq)
  ).length;

  const researchMatchesCount = (inputs.extractedItems || []).filter((ex) =>
    normalizePersian(
      `${ex.id} ${ex.tempBookId} ${ex.bookTitleRaw} ${ex.martyrNameRaw} ${ex.passageTitle} ${ex.reviewStatus}`
    ).includes(nq)
  ).length;

  const reportMatchesCount = exportHistory.filter((rep) =>
    normalizePersian(
      `${rep.exportId} ${rep.fileName} ${rep.fileType} ${rep.appliedFiltersSummary}`
    ).includes(nq)
  ).length;

  const totalMatchesCount =
    booksMatchesCount +
    martyrsMatchesCount +
    relationsMatchesCount +
    workMatchesCount +
    activityMatchesCount +
    researchMatchesCount +
    reportMatchesCount;

  return {
    query,
    booksMatchesCount,
    martyrsMatchesCount,
    relationsMatchesCount,
    workMatchesCount,
    activityMatchesCount,
    researchMatchesCount,
    reportMatchesCount,
    totalMatchesCount,
  };
}
