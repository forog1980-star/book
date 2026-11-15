import type { AuditLogEntry, ExtractedContentItem } from '../../../data/markazAsnadData';
import { computeFinalizedRegistryStats } from '../export/finalizedReportsRegistryStore';
import {
  ACTIVITY_DOMAIN_LABELS,
  classifyAuditLogDomain,
  classifyPendingReviewStatus,
  compactPersian,
  isDraftLabelOrStatus,
  normalizePersian,
  normalizeVersionedOutputIdentity,
  parseAuditLogComparableDate,
  stripMartyrHonorifics,
} from '../normalization';
import type {
  ActivityDomainKey,
  ActivityLogAnalyticsSummary,
  DashboardDrilldownKey,
  DashboardSummaryResult,
  ExecutiveDashboardInputs,
  ExecutiveExportHistoryRecord,
  FinalizedManagementReportsSummary,
  FinalizedReportRegistryRecord,
  FinalizedResearchOutputsSummary,
  UnifiedSearchDomainScope,
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
    totalAllRecordsIncludingRejectedCount: extractedItems.length,
    totalReviewedResearchCount: expertApproved + baseResearchReviewed,
    finalIndependentOutputsCount,
    rawFinalizedRecordsCount,
    duplicateVersionsCollapsedCount,
    nonFinalOrDraftExtractedCount,
    draftsAndIncompleteCount: rawOrDraft + needsReview,
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
 * محاسبه گزارش‌های مدیریتی نهایی و مستقل:
 * - وقتی دفتر کل مستقل محلی (`finalizedRegistry` ذخیره شده در `book_executive_finalized_reports_v1`)
 *   در اختیار باشد، منبع رسمی شمارش گزارش‌های مستقل و نسخه‌ها همان دفتر کل پایدار است.
 * - در غیر این صورت (سازگاری معکوس)، از تجمیع `exportHistory` با حذف پیش‌نویس/ناموفق استفاده می‌شود.
 */
export function selectFinalizedManagementReportsSummary(
  exportHistory: ExecutiveExportHistoryRecord[] = [],
  finalizedRegistry?: FinalizedReportRegistryRecord[]
): FinalizedManagementReportsSummary {
  if (finalizedRegistry !== undefined) {
    const regStats = computeFinalizedRegistryStats(finalizedRegistry, 'management_report');
    const finalizedRecords = finalizedRegistry.filter(
      (r) => r.category === 'management_report' && r.lifecycleStatus === 'final'
    );
    const duplicateVersionsCollapsedCount = finalizedRecords.reduce(
      (acc, r) => acc + Math.max(0, Math.max(1, r.currentVersion || 1, r.versions.length) - 1),
      0
    );
    const failedExportsCount = exportHistory.filter((rec) => rec.status !== 'success').length;

    return {
      finalIndependentReportsCount: regStats.finalizedIndependentCount,
      rawSuccessfulIssuancesCount: exportHistory.filter((rec) => rec.status === 'success').length,
      duplicateVersionsCollapsedCount,
      draftOrFailedExcludedCount: regStats.draftsExcludedCount + failedExportsCount,
      usesDedicatedLocalRegistry: true,
      registryFinalizedCount: regStats.finalizedIndependentCount,
      registryDraftsCount: regStats.draftsExcludedCount,
      registryTotalVersionsCount: regStats.totalVersionsCount,
      byFileType: regStats.byFileType,
      latestIssuedAtDisplay: regStats.latestFinalizedAtDisplay,
    };
  }

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
    usesDedicatedLocalRegistry: false,
    registryFinalizedCount: 0,
    registryDraftsCount: 0,
    registryTotalVersionsCount: 0,
    byFileType: {
      excel: excelUniqueCount,
      json: jsonUniqueCount,
    },
    latestIssuedAtDisplay,
  };
}

export interface AuditLogFilterOptions {
  domain?: 'all' | ActivityDomainKey;
  actionType?: 'all' | string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * فیلتر خالص و قطعی تاریخچه فعالیت بر اساس حوزه، نوع فعالیت و بازه زمانی (پشتیبانی از جلالی و میلادی).
 */
export function filterAuditLogEntriesPure(
  auditLogs: AuditLogEntry[] = [],
  options: AuditLogFilterOptions = {}
): AuditLogEntry[] {
  const fromNorm = options.dateFrom ? parseAuditLogComparableDate(options.dateFrom) : null;
  const toNorm = options.dateTo ? parseAuditLogComparableDate(options.dateTo) : null;

  return auditLogs.filter((entry) => {
    if (options.domain && options.domain !== 'all') {
      const dom = classifyAuditLogDomain(entry).domain;
      if (dom !== options.domain) return false;
    }
    if (options.actionType && options.actionType !== 'all') {
      const act = (entry.actionType || 'سایر فعالیت‌ها').trim();
      if (act !== options.actionType) return false;
    }
    if (fromNorm || toNorm) {
      const entryDate = parseAuditLogComparableDate(entry.timestamp);
      if (!entryDate) return false;
      if (fromNorm && entryDate < fromNorm) return false;
      if (toNorm && entryDate > toNorm) return false;
    }
    return true;
  });
}

export function selectActivityLogSummary(
  auditLogs: AuditLogEntry[] = []
): ActivityLogAnalyticsSummary {
  const countsMap = new Map<string, number>();
  const domainCounts: Record<ActivityDomainKey, number> = {
    library: 0,
    martyrs_relations: 0,
    work_outputs: 0,
    other: 0,
  };
  let latestTimestamp: string | null = null;

  for (const entry of auditLogs) {
    if (!latestTimestamp && entry.timestamp) {
      latestTimestamp = entry.timestamp;
    }
    const label = (entry.actionType || 'سایر فعالیت‌ها').trim();
    countsMap.set(label, (countsMap.get(label) || 0) + 1);
    const { domain } = classifyAuditLogDomain(entry);
    domainCounts[domain] += 1;
  }

  const byActionType = Array.from(countsMap.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fa'))
    .map(([actionType, count]) => ({ actionType, count }));

  const domainOrder: ActivityDomainKey[] = [
    'library',
    'martyrs_relations',
    'work_outputs',
    'other',
  ];
  const byDomain = domainOrder.map((domain) => ({
    domain,
    label: ACTIVITY_DOMAIN_LABELS[domain],
    count: domainCounts[domain],
  }));

  return {
    totalEntriesCount: auditLogs.length,
    byActionType,
    byDomain,
    latestTimestamp,
  };
}

export function selectWorkAndOutputsDetailedAnalytics(
  inputs: ExecutiveDashboardInputs,
  summary: DashboardSummaryResult,
  exportHistory: ExecutiveExportHistoryRecord[] = [],
  finalizedRegistry?: FinalizedReportRegistryRecord[]
): WorkAndOutputsDetailedAnalytics {
  const pv = summary.reviewQueue.pendingReviews;
  const reviewQueueStatusBreakdown = Object.entries(pv.statusCounts || {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fa'))
    .map(([status, count]) => ({
      status,
      count,
      isCompleted: classifyPendingReviewStatus(status) === 'resolved',
    }));

  const closedOrRejectedCount = (inputs.pendingReviews || []).filter((item) => {
    const comp = compactPersian(item.trackingStatus);
    return (
      classifyPendingReviewStatus(item.trackingStatus) === 'resolved' ||
      comp.includes('بسته') ||
      comp.includes('رد')
    );
  }).length;

  return {
    reviewQueueTotalCount: pv.totalCount,
    reviewQueueCompletedCount: pv.resolvedCount,
    reviewQueueRemainingCount: pv.openCount + pv.otherStatusCount,
    reviewQueueNeedsSourceCount: pv.needsSourceCount,
    reviewQueueOpenPlainCount: pv.openPlainCount,
    reviewQueueClosedOrRejectedWithReasonCount: closedOrRejectedCount,
    reviewQueueCompletionPercent:
      summary.reviewQueue.independentWorkTopics.totalTopicsCount > 0
        ? Math.round(
            (summary.reviewQueue.independentWorkTopics.completedTopicsCount /
              summary.reviewQueue.independentWorkTopics.totalTopicsCount) *
              100
          )
        : 0,
    reviewQueueStatusBreakdown,
    independentWorkTopics: summary.reviewQueue.independentWorkTopics,
    activityLog: selectActivityLogSummary(inputs.auditLogs || []),
    researchOutputs: selectFinalizedResearchOutputsSummary(inputs.extractedItems || []),
    managementReports: selectFinalizedManagementReportsSummary(exportHistory, finalizedRegistry),
  };
}

export interface StatisticalQueryAnswer {
  id: string;
  question: string;
  targetSection: 'library' | 'martyrs' | 'work';
  targetSectionLabel: 'کتابخانه' | 'شهدا ـ احراز هویت و ارتباطات' | 'وضعیت کار و خروجی‌ها';
  countNumber: number | null;
  countDisplay: string;
  countingUnit: string;
  countingBasis: string;
  headlineMetric: string;
  explanation: string;
  drilldownKey: DashboardDrilldownKey;
}

export function buildStatisticalQueryAnswers(
  summary: DashboardSummaryResult,
  workAnalytics: WorkAndOutputsDetailedAnalytics
): StatisticalQueryAnswer[] {
  const libDet = summary.library.detailedBreakdown;
  const martyrsDet = summary.martyrs.detailedMartyrMetrics;
  const rels = summary.relations;
  const topics = workAnalytics.independentWorkTopics;
  const dom = topics.domainBreakdown;

  return [
    // بخش ۱: کتابخانه
    {
      id: 'q_library_status',
      question: 'چند کتاب طبق معیار سخت‌گیرانه واقعاً تکمیل‌شده‌اند و چند کتاب در حال بررسی یا شروع‌نشده‌اند؟',
      targetSection: 'library',
      targetSectionLabel: 'کتابخانه',
      countNumber: libDet.completedCount,
      countDisplay: String(libDet.completedCount),
      countingUnit: 'کتاب (بر پایه شناسه کتاب / ردیف کاتالوگ)',
      countingBasis:
        'تکمیل‌شده فقط زمانی محسوب می‌شود که اطلاعات کتاب، وضعیت فیزیکی، تعیین‌تکلیف ارتباط با شهید و بستن همه تیکت‌های باز انجام شده باشد.',
      headlineMetric: `${libDet.completedCount} کتاب تکمیل‌شده از ${libDet.totalTrackedBooksCount} کتاب پایش‌شده (${libDet.inProgressCount} در حال بررسی · ${libDet.notStartedCount} شروع‌نشده)`,
      explanation: `تعداد کتاب‌های صرفاً کارشده یا ثبت‌شده در قفسه (${libDet.workedOrRegisteredCount} کتاب) تا پیش از تعیین‌تکلیف ارتباط با شهید و بسته‌شدن تیکت‌ها تکمیل‌شده حساب نمی‌شوند.`,
      drilldownKey: libDet.completedCount > 0 ? 'library_completed' : 'library_in_progress',
    },
    {
      id: 'q_library_no_martyr_distinction',
      question: 'تفاوت کتاب‌های «فاقد ارتباط ثبت‌شده» با «بررسی‌شده و فاقد ارتباط با شهید» چیست؟',
      targetSection: 'library',
      targetSectionLabel: 'کتابخانه',
      countNumber: libDet.lacksRegisteredMartyrLinkCount,
      countDisplay: String(libDet.lacksRegisteredMartyrLinkCount),
      countingUnit: 'کتاب',
      countingBasis:
        'تفکیک صریح بین کتاب‌هایی که هنوز هیچ پیوند شهیدی ندارند با کتاب‌هایی که بررسی‌شده و یادداشت یا تأیید قطعی عدم ارتباط دارند.',
      headlineMetric: `${libDet.lacksRegisteredMartyrLinkCount} کتاب فاقد ارتباط ثبت‌شده در برابر ${libDet.reviewedWithoutMartyrLinkCount} کتاب بررسی‌شده و فاقد ارتباط با شهید`,
      explanation: `در مجموع ${libDet.hasRegisteredMartyrLinkCount} کتاب دارای ارتباط ثبت‌شده با شهید هستند و ${libDet.openDuplicateTitleTicketsCount} کتاب تیکت باز تکرار عنوان دارند.`,
      drilldownKey: 'library_without_martyr_link',
    },

    // بخش ۲: شهدا ـ احراز هویت و ارتباطات
    {
      id: 'q_martyrs_and_relations',
      question: 'چند شهید مرتبط احراز هویت شده‌اند و وضعیت تهران/غیرتهرانی چگونه است؟',
      targetSection: 'martyrs',
      targetSectionLabel: 'شهدا ـ احراز هویت و ارتباطات',
      countNumber: martyrsDet.confirmedIdentityCount,
      countDisplay: String(martyrsDet.confirmedIdentityCount),
      countingUnit: 'شناسه شهید (شخص یکتای مرتبط بدون ادغام هم‌نام‌ها)',
      countingBasis:
        'افراز بدون هم‌پوشانی بین شهدای دارای مزار/شناسه یکتای قطعی و شهدای نیازمند رفع ابهام مزار یا هم‌نامی.',
      headlineMetric: `${martyrsDet.confirmedIdentityCount} احرازشده و ${martyrsDet.needsIdentityVerificationCount} نیازمند بررسی هویت (از ${martyrsDet.linkedMartyrsCount} شهید مرتبط)`,
      explanation: `از ${martyrsDet.linkedMartyrsCount} شهید مرتبط، ${martyrsDet.tehranLinkedCount} شهید تهرانی، ${martyrsDet.nonTehranLinkedCount} شهید غیرتهرانی و ${martyrsDet.unknownTehranLinkedCount} شهید بدون تعیین وضعیت مزار هستند (${martyrsDet.homonymSuspectsCount} مورد مشکوک به هم‌نامی).`,
      drilldownKey: 'martyrs_confirmed',
    },
    {
      id: 'q_relations_source_vs_expert',
      question: 'چه تعداد ارتباط کتاب و شهید «قطعی طبق برچسب منبع» و چه تعداد «تأیید کارشناسی صریح» دارند؟',
      targetSection: 'martyrs',
      targetSectionLabel: 'شهدا ـ احراز هویت و ارتباطات',
      countNumber: rels.sourceAndExpertBreakdown.explicitExpertConfirmedDistinctCount,
      countDisplay: String(rels.sourceAndExpertBreakdown.explicitExpertConfirmedDistinctCount),
      countingUnit: 'زوج متمایز کتاب و شهید',
      countingBasis:
        'تفکیک اکید میان برچسب «قطعی» یا پژوهش اولیه در فایل مبنا با تأیید صریح کارشناس روی رابطه.',
      headlineMetric: `${rels.sourceAndExpertBreakdown.explicitExpertConfirmedDistinctCount} تأیید کارشناسی صریح · ${rels.sourceAndExpertBreakdown.definiteBySourceLabelDistinctCount} قطعی طبق برچسب منبع (${rels.sourceAndExpertBreakdown.needsReviewDistinctCount} نیازمند بررسی)`,
      explanation: `از مجموع ${rels.totalRawLinkRows} ردیف ارتباط (${rels.sourceAndExpertBreakdown.totalActiveDistinctPairsCount} زوج فعال متمایز)، ${rels.sourceAndExpertBreakdown.probableDistinctCount} مورد احتمالی و ${rels.rejectedArchiveSuggestionsCount} مورد ردشده است.`,
      drilldownKey:
        rels.sourceAndExpertBreakdown.explicitExpertConfirmedDistinctCount > 0
          ? 'relations_confirmed'
          : 'relations_definite_source',
    },

    // بخش ۳: وضعیت کار و خروجی‌ها
    {
      id: 'q_work_domain_split',
      question: 'موضوعات کاری صف پیگیری چگونه بین کتابخانه، شهدا و ارتباطات تفکیک شده‌اند؟',
      targetSection: 'work',
      targetSectionLabel: 'وضعیت کار و خروجی‌ها',
      countNumber: topics.totalTopicsCount,
      countDisplay: String(topics.totalTopicsCount),
      countingUnit: 'موضوع کاری مستقل (تفکیک موضوعات مرکب با «؛»)',
      countingBasis:
        'محاسبه پیشرفت بر پایه تک‌تک موضوعات مستقل صف پیگیری (به‌جای ترکیب با رخدادهای تاریخچه).',
      headlineMetric: `${topics.totalTopicsCount} موضوع مستقل (${topics.completedTopicsCount} انجام‌شده · ${topics.remainingTopicsCount} باقیمانده): کتابخانه ${dom.library.pvTopicsTotal} · شهدا ${dom.martyrs.pvTopicsTotal} · ارتباطات ${dom.relations.pvTopicsTotal}`,
      explanation: `در ${topics.compoundRecordsCount} پرونده از مجموع ${workAnalytics.reviewQueueTotalCount} ردیف صف، بیش از یک موضوع مستقل وجود دارد. ${workAnalytics.reviewQueueNeedsSourceCount} ردیف در وضعیت نیازمند منبع قرار دارند.`,
      drilldownKey: 'work_remaining',
    },
    {
      id: 'q_research_vs_final_outputs',
      question: 'چند خروجی پژوهشی و گزارش مدیریتی نهایی مستقل (بدون احتساب پیش‌نویس و نسخه‌های تکراری) وجود دارد؟',
      targetSection: 'work',
      targetSectionLabel: 'وضعیت کار و خروجی‌ها',
      countNumber: workAnalytics.managementReports.finalIndependentReportsCount,
      countDisplay: String(workAnalytics.managementReports.finalIndependentReportsCount),
      countingUnit: 'خروجی / گزارش مستقل پایدار (reportId یکتا)',
      countingBasis:
        'شمارش گزارش‌های مدیریتی فقط بر پایه گزارش‌های نهایی در دفتر کل محلی (book_executive_finalized_reports_v1)؛ پیش‌نویس‌ها و نسخه‌های مجدد یک گزارش شمرده نمی‌شوند.',
      headlineMetric: `${workAnalytics.managementReports.finalIndependentReportsCount} گزارش مدیریتی نهایی · ${workAnalytics.researchOutputs.finalIndependentOutputsCount} خروجی پژوهشی نهایی مستقل`,
      explanation: `از ${workAnalytics.researchOutputs.totalExtractedNonRejectedCount} مطلب استخراج‌شده غیرردشده، ${workAnalytics.researchOutputs.draftsAndIncompleteCount} مورد پیش‌نویس/ناتمام هستند. همچنین ${workAnalytics.managementReports.registryDraftsCount} گزارش مدیریتی در وضعیت پیش‌نویس است.`,
      drilldownKey: 'management_reports',
    },
    {
      id: 'q_activity_log_independence',
      question: 'چه تعداد فعالیت در تاریخچه ثبت شده و چرا تأثیری بر درصد صف پیگیری ندارد؟',
      targetSection: 'work',
      targetSectionLabel: 'وضعیت کار و خروجی‌ها',
      countNumber: workAnalytics.activityLog.totalEntriesCount,
      countDisplay: String(workAnalytics.activityLog.totalEntriesCount),
      countingUnit: 'رویداد ثبت‌شده در تاریخچه فعالیت',
      countingBasis:
        'شمارش مستقیم رخدادهای auditLog مستقل از جدول صف پیگیری (PV).',
      headlineMetric: `${workAnalytics.activityLog.totalEntriesCount} فعالیت ثبت‌شده در تاریخچه (مستقل از ${topics.completedTopicsCount} موضوع انجام‌شده صف)`,
      explanation:
        'ثبت رخداد در تاریخچه فعالیت (قفسه، یادداشت یا ویرایش) به‌صورت خودکار هیچ تیکتی در صف پیگیری را نمی‌بندد و درصد پیشرفت صف پیگیری فقط از وضعیت موارد PV محاسبه می‌شود.',
      drilldownKey: 'activity_logs',
    },
  ];
}

export type CustomStatisticalQuestionResult =
  | { status: 'answered'; answer: StatisticalQueryAnswer }
  | { status: 'unclear'; message: string };

/**
 * پاسخ‌گویی قطعی و غیرحدسی به پرسش آماری تایپ‌شده کاربر.
 * در صورت مبهم‌بودن پرسش یا نبود کلیدواژه روشن، هرگز حدس نمی‌زند و درخواست شفاف‌سازی می‌کند.
 */
export function answerCustomStatisticalQuestion(
  questionText: string,
  summary: DashboardSummaryResult,
  workAnalytics: WorkAndOutputsDetailedAnalytics
): CustomStatisticalQuestionResult {
  const norm = normalizePersian(questionText);
  const tokens = norm.split(' ').filter((t) => t.length >= 2);
  if (!norm || tokens.length < 2) {
    return {
      status: 'unclear',
      message:
        'پرسش آماری واردشده کافی یا شفاف نیست؛ لطفاً با ذکر محور (کتاب، شهید، ارتباط، صف پیگیری، فعالیت، پژوهش یا گزارش مدیریتی) دقیق‌تر بپرسید یا از پرسش‌های آماده زیر استفاده کنید.',
    };
  }

  const answers = buildStatisticalQueryAnswers(summary, workAnalytics);
  const findById = (id: string) => answers.find((a) => a.id === id);

  const hasBook = norm.includes('کتاب') || norm.includes('تکمیل') || norm.includes('قفسه');
  const hasMartyr =
    norm.includes('شهید') ||
    norm.includes('شهدا') ||
    norm.includes('هویت') ||
    norm.includes('تهران') ||
    norm.includes('همنام');
  const hasRelation = norm.includes('ارتباط') || norm.includes('قطعی') || norm.includes('کارشناسی');
  const hasWork = norm.includes('صف') || norm.includes('پیگیری') || norm.includes('تیکت') || norm.includes('کار');
  const hasActivity = norm.includes('فعالیت') || norm.includes('تاریخچه') || norm.includes('لاگ');
  const hasOutput = norm.includes('پژوهش') || norm.includes('خروجی') || norm.includes('گزارش');

  const matchedAreas = [hasBook, hasMartyr, hasRelation, hasWork, hasActivity, hasOutput].filter(Boolean).length;
  if (matchedAreas === 0) {
    return {
      status: 'unclear',
      message:
        'موضوع پرسش با شاخص‌های رسمی مرکز اسناد تطبیق داده نشد. برای پرهیز از عدد حدسی، لطفاً یکی از پرسش‌های آماده را انتخاب کنید یا عبارت روشن‌تری بنویسید.',
    };
  }

  if (hasActivity) return { status: 'answered', answer: findById('q_activity_log_independence')! };
  if (hasOutput) return { status: 'answered', answer: findById('q_research_vs_final_outputs')! };
  if (hasWork && !hasBook) return { status: 'answered', answer: findById('q_work_domain_split')! };
  if (hasRelation) return { status: 'answered', answer: findById('q_relations_source_vs_expert')! };
  if (hasMartyr) return { status: 'answered', answer: findById('q_martyrs_and_relations')! };
  if (norm.includes('فاقد') || norm.includes('بدون ارتباط')) {
    return { status: 'answered', answer: findById('q_library_no_martyr_distinction')! };
  }
  return { status: 'answered', answer: findById('q_library_status')! };
}

export interface UnifiedSearchPreview {
  query: string;
  scope: UnifiedSearchDomainScope;
  isQueryUnclear: boolean;
  unclearMessage: string;
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
  exportHistory: ExecutiveExportHistoryRecord[] = [],
  scope: UnifiedSearchDomainScope = 'all',
  finalizedRegistry: FinalizedReportRegistryRecord[] = []
): UnifiedSearchPreview {
  const trimmed = (query || '').trim();
  const nq = normalizePersian(trimmed);

  if (!trimmed || !nq || nq.length < 2) {
    const isTooShortOrSymbolic = Boolean(trimmed) && (!nq || nq.length < 2);
    return {
      query,
      scope,
      isQueryUnclear: isTooShortOrSymbolic,
      unclearMessage: isTooShortOrSymbolic
        ? 'عبارت جستجو کوتاه یا مبهم است؛ حداقل ۲ حرف یا رقم معنادار وارد کنید تا نتیجه حدسی نمایش داده نشود.'
        : '',
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

  const booksMatchesCount =
    scope === 'all' || scope === 'books'
      ? projection.books.filter((b) =>
          normalizePersian(
            `${b.tempBookId} ${b.title} ${b.publisher} ${b.author} ${b.locationDisplay} ${b.managerialStatusLabel} ${b.openTicketIds.join(' ')}`
          ).includes(nq)
        ).length
      : 0;

  const martyrsMatchesCount =
    scope === 'all' || scope === 'martyrs'
      ? projection.martyrs.filter((m) =>
          normalizePersian(
            `${m.displayCode} ${m.fullName} ${m.fatherName} ${m.graveAddress} ${m.identityStatusLabel}`
          ).includes(nq)
        ).length
      : 0;

  const relationsMatchesCount =
    scope === 'all' || scope === 'relations'
      ? projection.relations.filter((r) =>
          normalizePersian(
            `${r.linkId} ${r.tempBookId} ${r.bookTitle} ${r.martyrName} ${r.certaintyLabel} ${r.reviewStatus}`
          ).includes(nq)
        ).length
      : 0;

  const workMatchesCount =
    scope === 'all' || scope === 'work'
      ? (inputs.pendingReviews || []).filter((pv) =>
          normalizePersian(
            `${pv.trackingId} ${pv.mainSheet} ${pv.mainRecordId} ${pv.bookTitle} ${pv.nameOrPhrase} ${pv.issueSubject} ${pv.trackingStatus}`
          ).includes(nq)
        ).length
      : 0;

  const activityMatchesCount =
    scope === 'all' || scope === 'activity'
      ? (inputs.auditLogs || []).filter((log) =>
          normalizePersian(
            `${log.id} ${log.actionType} ${log.targetId} ${log.actorName} ${log.summary}`
          ).includes(nq)
        ).length
      : 0;

  const researchMatchesCount =
    scope === 'all' || scope === 'research'
      ? (inputs.extractedItems || []).filter((ex) =>
          normalizePersian(
            `${ex.id} ${ex.tempBookId} ${ex.bookTitleRaw} ${ex.martyrNameRaw} ${ex.passageTitle} ${ex.reviewStatus}`
          ).includes(nq)
        ).length
      : 0;

  const reportMatchesCount =
    scope === 'all' || scope === 'reports'
      ? finalizedRegistry.length > 0
        ? finalizedRegistry.filter((rep) =>
            normalizePersian(
              `${rep.reportId} ${rep.title} ${rep.appliedFiltersSummary} ${rep.lifecycleStatus} ${rep.versions
                .map((v) => v.fileName)
                .join(' ')}`
            ).includes(nq)
          ).length
        : exportHistory.filter((rep) =>
            normalizePersian(
              `${rep.exportId} ${rep.fileName} ${rep.fileType} ${rep.appliedFiltersSummary}`
            ).includes(nq)
          ).length
      : 0;

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
    scope,
    isQueryUnclear: false,
    unclearMessage: '',
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
