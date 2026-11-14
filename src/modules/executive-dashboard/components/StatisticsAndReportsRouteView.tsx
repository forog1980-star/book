import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Download,
  FilePlus2,
  Filter,
  HelpCircle,
  History,
  RefreshCw,
  Search,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { toPersianDigits } from '../../../data/markazAsnadData';
import {
  appendExportHistoryRecordPure,
  loadExecutiveExportHistory,
  saveExecutiveExportHistory,
} from '../export/exportHistoryStore';
import {
  loadFinalizedReportsRegistry,
  registerNewReportVersionPure,
  saveFinalizedReportsRegistry,
  upsertRegistryReportPure,
  finalizeRegistryReportPure,
} from '../export/finalizedReportsRegistryStore';
import { exportExecutiveManagementExcel } from '../export/managementExcelAdapter';
import { downloadExecutiveDashboardJsonV1 } from '../export/managementJsonExport';
import { ACTIVITY_DOMAIN_LABELS, normalizePersian } from '../normalization';
import {
  answerCustomStatisticalQuestion,
  buildStatisticalQueryAnswers,
  computeUnifiedStatisticsSearch,
  filterAuditLogEntriesPure,
  selectWorkAndOutputsDetailedAnalytics,
  type CustomStatisticalQuestionResult,
  type StatisticalQueryAnswer,
} from '../selectors/detailedStatisticsSelector';
import { buildExecutiveEntityProjection } from '../selectors/entityDossiersSelector';
import { selectThreeCardOverviewFromSummary } from '../selectors/executiveThreeCardOverviewSelector';
import type {
  ActivityDomainKey,
  DashboardDrilldownKey,
  ExecutiveDashboardInputs,
  ExecutiveDashboardReadiness,
  ExecutiveExportHistoryRecord,
  FinalizedReportRegistryRecord,
  UnifiedSearchDomainScope,
} from '../types';
import { OverviewDonutChart } from './OverviewDonutChart';

interface StatisticsAndReportsRouteViewProps {
  inputs?: ExecutiveDashboardInputs | null;
  readiness?: ExecutiveDashboardReadiness;
  exportHistory?: ExecutiveExportHistoryRecord[];
  finalizedRegistry?: FinalizedReportRegistryRecord[];
  onBackToDashboard: () => void;
  onSelectDrilldown?: (key: DashboardDrilldownKey) => void;
  onRequestLoadGolzarBank?: () => void;
  onNotify?: (msg: string, type?: 'success' | 'warning') => void;
}

const EMPTY_INPUTS: ExecutiveDashboardInputs = {
  catalogRows: [],
  links: [],
  pendingReviews: [],
  extractedItems: [],
  auditLogs: [],
};

const SEARCH_SCOPE_OPTIONS: Array<{ id: UnifiedSearchDomainScope; label: string }> = [
  { id: 'all', label: 'همه حوزه‌ها' },
  { id: 'books', label: 'کتاب‌ها' },
  { id: 'martyrs', label: 'شهدا' },
  { id: 'relations', label: 'ارتباطات' },
  { id: 'work', label: 'صف پیگیری' },
  { id: 'activity', label: 'فعالیت‌ها' },
  { id: 'research', label: 'خروجی‌های پژوهشی' },
  { id: 'reports', label: 'گزارش‌های مدیریتی' },
];

function nowPersianDateTimeLabel(): string {
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString();
  }
}

/**
 * مسیر مستقل «آمار و گزارش‌های تفصیلی»
 * ساختار سه‌بخشی قطعی متناظر با سه کارت داشبورد:
 * ۱. کتابخانه (با نمودار دوناتی زنده + ۱۲ سنجه تعاملی)
 * ۲. شهدا ـ احراز هویت و ارتباطات (با نمودار دوناتی زنده + ۱۱ سنجه شهید + ۶ سنجه زوج ارتباط)
 * ۳. وضعیت کار و خروجی‌ها (با نمودار دوناتی زنده + صف، فیلتر تاریخچه فعالیت، پژوهش و دفتر کل گزارش‌های نهایی)
 * به‌همراه ابزارهای مشترک جستجوی ۸حوزه‌ای و پرسش‌های آماری زنده در بالای صفحه
 */
export const StatisticsAndReportsRouteView: React.FC<
  StatisticsAndReportsRouteViewProps
> = ({
  inputs,
  readiness,
  exportHistory: externalExportHistory,
  finalizedRegistry: externalFinalizedRegistry,
  onBackToDashboard,
  onSelectDrilldown,
  onRequestLoadGolzarBank,
  onNotify,
}) => {
  const effectiveInputs = inputs ?? EMPTY_INPUTS;
  const [loadedExportHistory, setLoadedExportHistory] = useState<
    ExecutiveExportHistoryRecord[]
  >([]);
  const [loadedFinalizedRegistry, setLoadedFinalizedRegistry] = useState<
    FinalizedReportRegistryRecord[]
  >([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<UnifiedSearchDomainScope>('all');
  const [selectedQueryId, setSelectedQueryId] = useState<string>('q_library_status');
  const [customQuestionInput, setCustomQuestionInput] = useState('');
  const [customQuestionResult, setCustomQuestionResult] =
    useState<CustomStatisticalQuestionResult | null>(null);

  // فیلترهای تعاملی بخش فعالیت‌های ثبت‌شده
  const [activityDomainFilter, setActivityDomainFilter] = useState<'all' | ActivityDomainKey>(
    'all'
  );
  const [activityActionFilter, setActivityActionFilter] = useState<string>('all');
  const [activityDateFrom, setActivityDateFrom] = useState('');
  const [activityDateTo, setActivityDateTo] = useState('');

  // وضعیت مدیریت گزارش‌های نهایی محلی
  const [newReportTitle, setNewReportTitle] = useState('');
  const [reportActionBusy, setReportActionBusy] = useState(false);
  const [reportPersistError, setReportPersistError] = useState<string | null>(null);

  useEffect(() => {
    if (externalExportHistory) return;
    let mounted = true;
    loadExecutiveExportHistory()
      .then((records) => {
        if (mounted) setLoadedExportHistory(records);
      })
      .catch(() => {
        if (mounted) setLoadedExportHistory([]);
      });
    return () => {
      mounted = false;
    };
  }, [externalExportHistory]);

  useEffect(() => {
    if (externalFinalizedRegistry) return;
    let mounted = true;
    loadFinalizedReportsRegistry()
      .then((records) => {
        if (mounted) setLoadedFinalizedRegistry(records);
      })
      .catch(() => {
        if (mounted) setLoadedFinalizedRegistry([]);
      });
    return () => {
      mounted = false;
    };
  }, [externalFinalizedRegistry]);

  const effectiveExportHistory = externalExportHistory ?? loadedExportHistory;
  const effectiveFinalizedRegistry = externalFinalizedRegistry ?? loadedFinalizedRegistry;

  const isInitialLoading = readiness
    ? !readiness.isStorageHydrated || readiness.workbookLoadState === 'loading'
    : false;
  const isWorkbookError = readiness ? readiness.workbookLoadState === 'error' : false;
  const isGolzarLoading = readiness
    ? readiness.golzarLoadState === 'loading' || readiness.golzarLoadState === 'idle'
    : false;
  const isGolzarError = readiness ? readiness.golzarLoadState === 'error' : false;

  const projection = useMemo(
    () => buildExecutiveEntityProjection(effectiveInputs),
    [effectiveInputs]
  );
  const summary = projection.summary;

  const overview = useMemo(
    () =>
      selectThreeCardOverviewFromSummary(
        summary,
        effectiveExportHistory,
        effectiveInputs.extractedItems,
        effectiveFinalizedRegistry
      ),
    [summary, effectiveExportHistory, effectiveInputs.extractedItems, effectiveFinalizedRegistry]
  );

  const workAnalytics = useMemo(
    () =>
      selectWorkAndOutputsDetailedAnalytics(
        effectiveInputs,
        summary,
        effectiveExportHistory,
        effectiveFinalizedRegistry
      ),
    [effectiveInputs, summary, effectiveExportHistory, effectiveFinalizedRegistry]
  );

  const statisticalQueries = useMemo(
    () => buildStatisticalQueryAnswers(summary, workAnalytics),
    [summary, workAnalytics]
  );

  const selectedPrebuiltQuery: StatisticalQueryAnswer | null =
    statisticalQueries.find((q) => q.id === selectedQueryId) ||
    statisticalQueries[0] ||
    null;

  const activeAnswer: StatisticalQueryAnswer | null =
    customQuestionResult && customQuestionResult.status === 'answered'
      ? customQuestionResult.answer
      : selectedPrebuiltQuery;

  const searchPreview = useMemo(
    () =>
      computeUnifiedStatisticsSearch(
        searchQuery,
        effectiveInputs,
        projection,
        effectiveExportHistory,
        searchScope,
        effectiveFinalizedRegistry
      ),
    [
      searchQuery,
      effectiveInputs,
      projection,
      effectiveExportHistory,
      searchScope,
      effectiveFinalizedRegistry,
    ]
  );

  const matchingTopRecords = useMemo(() => {
    const nq = normalizePersian(searchQuery);
    if (!nq || searchPreview.isQueryUnclear) {
      return {
        books: [] as typeof projection.books,
        martyrs: [] as typeof projection.martyrs,
        relations: [] as typeof projection.relations,
        work: [] as NonNullable<ExecutiveDashboardInputs['pendingReviews']>,
        activities: [] as NonNullable<ExecutiveDashboardInputs['auditLogs']>,
        research: [] as NonNullable<ExecutiveDashboardInputs['extractedItems']>,
        reports: [] as FinalizedReportRegistryRecord[],
      };
    }

    const books =
      searchScope === 'all' || searchScope === 'books'
        ? projection.books
            .filter((b) =>
              normalizePersian(
                `${b.tempBookId} ${b.title} ${b.publisher} ${b.author} ${b.locationDisplay} ${b.openTicketIds.join(' ')}`
              ).includes(nq)
            )
            .slice(0, 4)
        : [];

    const martyrs =
      searchScope === 'all' || searchScope === 'martyrs'
        ? projection.martyrs
            .filter((m) =>
              normalizePersian(
                `${m.displayCode} ${m.fullName} ${m.fatherName} ${m.graveAddress} ${m.identityStatusLabel}`
              ).includes(nq)
            )
            .slice(0, 4)
        : [];

    const relations =
      searchScope === 'all' || searchScope === 'relations'
        ? projection.relations
            .filter((r) =>
              normalizePersian(
                `${r.linkId} ${r.tempBookId} ${r.bookTitle} ${r.martyrName} ${r.certaintyLabel}`
              ).includes(nq)
            )
            .slice(0, 4)
        : [];

    const work =
      searchScope === 'all' || searchScope === 'work'
        ? (effectiveInputs.pendingReviews || [])
            .filter((pv) =>
              normalizePersian(
                `${pv.trackingId} ${pv.mainSheet} ${pv.mainRecordId} ${pv.bookTitle} ${pv.nameOrPhrase} ${pv.issueSubject} ${pv.trackingStatus}`
              ).includes(nq)
            )
            .slice(0, 4)
        : [];

    const activities =
      searchScope === 'all' || searchScope === 'activity'
        ? (effectiveInputs.auditLogs || [])
            .filter((log) =>
              normalizePersian(
                `${log.id} ${log.actionType} ${log.targetId} ${log.actorName} ${log.summary}`
              ).includes(nq)
            )
            .slice(0, 4)
        : [];

    const research =
      searchScope === 'all' || searchScope === 'research'
        ? (effectiveInputs.extractedItems || [])
            .filter((ex) =>
              normalizePersian(
                `${ex.id} ${ex.tempBookId} ${ex.bookTitleRaw} ${ex.martyrNameRaw} ${ex.passageTitle} ${ex.reviewStatus}`
              ).includes(nq)
            )
            .slice(0, 4)
        : [];

    const reports =
      searchScope === 'all' || searchScope === 'reports'
        ? effectiveFinalizedRegistry
            .filter((rep) =>
              normalizePersian(
                `${rep.reportId} ${rep.title} ${rep.appliedFiltersSummary} ${rep.versions
                  .map((v) => v.fileName)
                  .join(' ')}`
              ).includes(nq)
            )
            .slice(0, 4)
        : [];

    return { books, martyrs, relations, work, activities, research, reports };
  }, [
    searchQuery,
    searchPreview.isQueryUnclear,
    searchScope,
    projection.books,
    projection.martyrs,
    projection.relations,
    effectiveInputs.pendingReviews,
    effectiveInputs.auditLogs,
    effectiveInputs.extractedItems,
    effectiveFinalizedRegistry,
  ]);

  const filteredActivityLogs = useMemo(
    () =>
      filterAuditLogEntriesPure(effectiveInputs.auditLogs || [], {
        domain: activityDomainFilter,
        actionType: activityActionFilter,
        dateFrom: activityDateFrom,
        dateTo: activityDateTo,
      }),
    [
      effectiveInputs.auditLogs,
      activityDomainFilter,
      activityActionFilter,
      activityDateFrom,
      activityDateTo,
    ]
  );

  const scrollToSection = (sectionId: 'library' | 'martyrs' | 'work') => {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(`stats-section-${sectionId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const triggerDrilldown = (key: DashboardDrilldownKey) => {
    onSelectDrilldown?.(key);
  };

  const handleAskCustomQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    const res = answerCustomStatisticalQuestion(
      customQuestionInput,
      summary,
      workAnalytics
    );
    setCustomQuestionResult(res);
  };

  const handleCreateRegistryReport = async (
    mode: 'final_excel' | 'final_json' | 'draft'
  ) => {
    if (reportActionBusy) return;
    setReportActionBusy(true);
    setReportPersistError(null);
    try {
      const tsIso = new Date().toISOString();
      const tsDisplay = nowPersianDateTimeLabel();
      const cleanTitle =
        newReportTitle.trim() ||
        (mode === 'draft'
          ? `پیش‌نویس گزارش مدیریتی (${tsDisplay})`
          : `گزارش مدیریتی مرکز اسناد (${tsDisplay})`);

      if (mode === 'draft') {
        const { records, savedRecord } = upsertRegistryReportPure(
          effectiveFinalizedRegistry,
          {
            category: 'management_report',
            title: cleanTitle,
            lifecycleStatus: 'draft',
            scope: 'dashboard_management',
            appliedFiltersSummary: 'پیش‌نویس محلی — در انتظار نهایی‌سازی',
            timestampIso: tsIso,
            timestampDisplay: tsDisplay,
          }
        );
        const saveRes = await saveFinalizedReportsRegistry(records);
        if (!saveRes.ok) {
          const errMsg = saveRes.error
            ? `خطا در ذخیره پیش‌نویس گزارش (${savedRecord.reportId}) در حافظه پایدار: ${saveRes.error}`
            : `ذخیره پیش‌نویس گزارش (${savedRecord.reportId}) در حافظه پایدار ناموفق بود؛ رکورد در آمار ثبت نشد.`;
          setReportPersistError(errMsg);
          onNotify?.(errMsg, 'warning');
          return;
        }
        setLoadedFinalizedRegistry(records);
        setNewReportTitle('');
        setReportPersistError(null);
        onNotify?.(
          `پیش‌نویس گزارش (${savedRecord.reportId}) ذخیره شد و طبق قانون شمارش نهایی لحاظ نشد.`,
          'success'
        );
        return;
      }

      if (mode === 'final_excel') {
        const excelRes = exportExecutiveManagementExcel(effectiveInputs);
        if (!excelRes.ok) {
          const errMsg = excelRes.error || 'تولید فایل اکسل با خطا مواجه شد.';
          setReportPersistError(errMsg);
          onNotify?.(errMsg, 'warning');
          return;
        }
        const exportId = `EXP-${Date.now()}`;
        const nextHistory = appendExportHistoryRecordPure(effectiveExportHistory, {
          exportId,
          fileName: excelRes.fileName,
          fileType: 'excel',
          exportScope: 'dashboard_management',
          timestampIso: tsIso,
          timestampDisplay: tsDisplay,
          recordCount: excelRes.totalRowsExported,
          appliedFiltersSummary: 'کل داده‌های زنده سامانه',
          status: 'success',
        });
        const histRes = await saveExecutiveExportHistory(nextHistory);
        if (histRes.ok) {
          setLoadedExportHistory(nextHistory);
        }

        const { records, savedRecord } = upsertRegistryReportPure(
          effectiveFinalizedRegistry,
          {
            category: 'management_report',
            title: cleanTitle,
            lifecycleStatus: 'final',
            scope: 'dashboard_management',
            appliedFiltersSummary: 'کل داده‌های زنده سامانه',
            timestampIso: tsIso,
            timestampDisplay: tsDisplay,
            initialVersion: {
              exportedAtIso: tsIso,
              exportedAtDisplay: tsDisplay,
              fileName: excelRes.fileName,
              fileType: 'excel',
              recordCount: excelRes.totalRowsExported,
              relatedExportId: exportId,
            },
          }
        );
        const saveRes = await saveFinalizedReportsRegistry(records);
        if (!saveRes.ok) {
          const errMsg = saveRes.error
            ? `خطا در ذخیره گزارش اکسل نهایی (${savedRecord.reportId}) در دفتر کل محلی: ${saveRes.error}`
            : `ذخیره گزارش اکسل نهایی (${savedRecord.reportId}) در دفتر کل محلی ناموفق بود؛ وضعیت آمار تغییر نکرد.`;
          setReportPersistError(errMsg);
          onNotify?.(errMsg, 'warning');
          return;
        }
        setLoadedFinalizedRegistry(records);
        setNewReportTitle('');
        setReportPersistError(null);
        onNotify?.(
          `گزارش مدیریتی نهایی (${savedRecord.reportId}) صادر و در دفتر کل محلی ثبت شد.`,
          'success'
        );
        return;
      }

      const jsonRes = downloadExecutiveDashboardJsonV1(effectiveInputs, { projection });
      if (!jsonRes.ok) {
        const errMsg = jsonRes.error || 'تولید بسته داده JSON با خطا مواجه شد.';
        setReportPersistError(errMsg);
        onNotify?.(errMsg, 'warning');
        return;
      }
      const exportId = `EXP-${Date.now()}`;
      const nextHistory = appendExportHistoryRecordPure(effectiveExportHistory, {
        exportId,
        fileName: jsonRes.fileName,
        fileType: 'json',
        exportScope: 'dashboard_management',
        timestampIso: tsIso,
        timestampDisplay: tsDisplay,
        recordCount: projection.books.length,
        appliedFiltersSummary: 'کل داده‌های زنده سامانه',
        status: 'success',
      });
      const histRes = await saveExecutiveExportHistory(nextHistory);
      if (histRes.ok) {
        setLoadedExportHistory(nextHistory);
      }

      const { records, savedRecord } = upsertRegistryReportPure(
        effectiveFinalizedRegistry,
        {
          category: 'management_report',
          title: cleanTitle,
          lifecycleStatus: 'final',
          scope: 'dashboard_management',
          appliedFiltersSummary: 'کل داده‌های زنده سامانه',
          timestampIso: tsIso,
          timestampDisplay: tsDisplay,
          initialVersion: {
            exportedAtIso: tsIso,
            exportedAtDisplay: tsDisplay,
            fileName: jsonRes.fileName,
            fileType: 'json',
            recordCount: projection.books.length,
            relatedExportId: exportId,
          },
        }
      );
      const saveRes = await saveFinalizedReportsRegistry(records);
      if (!saveRes.ok) {
        const errMsg = saveRes.error
          ? `خطا در ذخیره بسته داده نهایی JSON (${savedRecord.reportId}) در دفتر کل محلی: ${saveRes.error}`
          : `ذخیره بسته داده نهایی JSON (${savedRecord.reportId}) در دفتر کل محلی ناموفق بود؛ وضعیت آمار تغییر نکرد.`;
        setReportPersistError(errMsg);
        onNotify?.(errMsg, 'warning');
        return;
      }
      setLoadedFinalizedRegistry(records);
      setNewReportTitle('');
      setReportPersistError(null);
      onNotify?.(
        `بسته داده ساختاریافته نهایی (${savedRecord.reportId}) صادر و در دفتر کل محلی ثبت شد.`,
        'success'
      );
    } finally {
      setReportActionBusy(false);
    }
  };

  const handleAppendNewVersionToLatestReport = async () => {
    const latestFinal = effectiveFinalizedRegistry.find(
      (r) => r.category === 'management_report' && r.lifecycleStatus === 'final'
    );
    if (!latestFinal || reportActionBusy) return;
    setReportActionBusy(true);
    setReportPersistError(null);
    try {
      const excelRes = exportExecutiveManagementExcel(effectiveInputs);
      if (!excelRes.ok) {
        const errMsg = excelRes.error || 'تولید نسخه جدید اکسل ناموفق بود.';
        setReportPersistError(errMsg);
        onNotify?.(errMsg, 'warning');
        return;
      }
      const tsIso = new Date().toISOString();
      const tsDisplay = nowPersianDateTimeLabel();
      const exportId = `EXP-${Date.now()}`;
      const nextHistory = appendExportHistoryRecordPure(effectiveExportHistory, {
        exportId,
        fileName: excelRes.fileName,
        fileType: 'excel',
        exportScope: 'dashboard_management',
        timestampIso: tsIso,
        timestampDisplay: tsDisplay,
        recordCount: excelRes.totalRowsExported,
        appliedFiltersSummary: `نسخه جدید برای ${latestFinal.reportId}`,
        status: 'success',
      });
      const histRes = await saveExecutiveExportHistory(nextHistory);
      if (histRes.ok) {
        setLoadedExportHistory(nextHistory);
      }

      const { records, updatedRecord } = registerNewReportVersionPure(
        effectiveFinalizedRegistry,
        {
          reportId: latestFinal.reportId,
          fileName: excelRes.fileName,
          fileType: 'excel',
          recordCount: excelRes.totalRowsExported,
          relatedExportId: exportId,
          timestampIso: tsIso,
          timestampDisplay: tsDisplay,
        }
      );
      if (!updatedRecord) {
        const errMsg = `گزارش مرجع (${latestFinal.reportId}) برای ثبت نسخه جدید یافت نشد.`;
        setReportPersistError(errMsg);
        onNotify?.(errMsg, 'warning');
        return;
      }
      const saveRes = await saveFinalizedReportsRegistry(records);
      if (!saveRes.ok) {
        const errMsg = saveRes.error
          ? `خطا در ذخیره نسخه جدید گزارش (${updatedRecord.reportId}) در دفتر کل محلی: ${saveRes.error}`
          : `ذخیره نسخه جدید گزارش (${updatedRecord.reportId}) در دفتر کل محلی ناموفق بود؛ نسخه در آمار ثبت نشد.`;
        setReportPersistError(errMsg);
        onNotify?.(errMsg, 'warning');
        return;
      }
      setLoadedFinalizedRegistry(records);
      setReportPersistError(null);
      onNotify?.(
        `نسخه ${toPersianDigits(updatedRecord.currentVersion)} برای گزارش ${updatedRecord.reportId} ثبت شد (تعداد گزارش‌های مستقل تغییر نکرد).`,
        'success'
      );
    } finally {
      setReportActionBusy(false);
    }
  };

  const handleFinalizeDraft = async (reportId: string) => {
    if (reportActionBusy) return;
    setReportActionBusy(true);
    setReportPersistError(null);
    try {
      const tsIso = new Date().toISOString();
      const tsDisplay = nowPersianDateTimeLabel();
      const { records, finalizedRecord } = finalizeRegistryReportPure(
        effectiveFinalizedRegistry,
        reportId,
        tsIso,
        tsDisplay
      );
      if (!finalizedRecord) {
        const errMsg = `پیش‌نویس گزارش (${reportId}) برای نهایی‌سازی یافت نشد.`;
        setReportPersistError(errMsg);
        onNotify?.(errMsg, 'warning');
        return;
      }
      const saveRes = await saveFinalizedReportsRegistry(records);
      if (!saveRes.ok) {
        const errMsg = saveRes.error
          ? `خطا در نهایی‌سازی گزارش (${finalizedRecord.reportId}) در حافظه پایدار: ${saveRes.error}`
          : `نهایی‌سازی گزارش (${finalizedRecord.reportId}) در حافظه پایدار ناموفق بود؛ وضعیت گزارش تغییر نکرد.`;
        setReportPersistError(errMsg);
        onNotify?.(errMsg, 'warning');
        return;
      }
      setLoadedFinalizedRegistry(records);
      setReportPersistError(null);
      onNotify?.(`گزارش ${finalizedRecord.reportId} به وضعیت نهایی و مستقل ارتقا یافت.`, 'success');
    } finally {
      setReportActionBusy(false);
    }
  };

  const lib = summary.library;
  const libDet = lib.detailedBreakdown;
  const part = lib.reviewBreakdown.managerialStatusPartition;
  const martyrs = summary.martyrs;
  const martyrsDet = martyrs.detailedMartyrMetrics;
  const rels = summary.relations;
  const relSplit = rels.sourceAndExpertBreakdown;
  const topics = workAnalytics.independentWorkTopics;
  const dom = topics.domainBreakdown;

  const pct = (partCount: number, totalCount: number): number =>
    totalCount > 0 ? Math.round((partCount / totalCount) * 100) : 0;

  const bookInProgressPct = pct(libDet.inProgressCount, libDet.totalTrackedBooksCount);
  const bookNotStartedPct = Math.max(
    0,
    100 - overview.libraryCard.completedPercent - bookInProgressPct
  );

  const hasDataLoaded =
    lib.totalTrackedBooksCount > 0 ||
    rels.totalRawLinkRows > 0 ||
    workAnalytics.reviewQueueTotalCount > 0;

  const recentDraftsAndReports = effectiveFinalizedRegistry
    .filter((r) => r.category === 'management_report')
    .slice(0, 5);

  const interactiveRowClass = (disabled?: boolean) =>
    `w-full py-2 px-2.5 flex items-center justify-between gap-2 text-right rounded-lg transition-colors ${
      disabled
        ? 'opacity-75 cursor-default'
        : 'hover:bg-[#FAF5EE] active:bg-[#F3E4D2]/70 cursor-pointer group'
    }`;

  return (
    <div
      data-testid="executive-statistics-route-view"
      className="max-w-6xl mx-auto px-3 sm:px-6 pt-3 pb-14 space-y-6 text-[#332218]"
    >
      {/* سرصفحه مسیر مستقل آمار و گزارش‌ها */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#E5D7C6] pb-4">
        <div className="space-y-1">
          <div className="text-xs text-[#78604E]">
            مرکز اسناد و کتابخانه · آمار زنده، نمودارهای تعاملی و گزارش‌های تفصیلی سه‌محوره
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#332218]">
            آمار و گزارش‌های تفصیلی
          </h2>
        </div>

        <button
          type="button"
          data-testid="back-to-dashboard-btn"
          onClick={onBackToDashboard}
          className="w-full sm:w-auto min-h-[46px] px-5 py-2.5 rounded-xl bg-[#6B3E26] hover:bg-[#56311E] text-white text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors shrink-0"
        >
          <ArrowRight className="w-4 h-4 shrink-0" />
          <span>بازگشت به داشبورد</span>
        </button>
      </header>

      {/* وضعیت بارگذاری اولیه بدون نمایش عدد ۰ جعلی */}
      {isInitialLoading && (
        <div
          data-testid="statistics-loading-state"
          aria-busy="true"
          className="space-y-4"
        >
          {[1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="bg-white border border-[#E5D7C6] rounded-2xl p-6 space-y-4 animate-pulse"
            >
              <div className="h-5 w-48 bg-[#EFE4D6] rounded" />
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="h-24 bg-[#FAF5EE] rounded-xl" />
                <div className="h-24 bg-[#FAF5EE] rounded-xl" />
                <div className="h-24 bg-[#FAF5EE] rounded-xl" />
                <div className="h-24 bg-[#FAF5EE] rounded-xl" />
              </div>
            </div>
          ))}
          <p className="text-xs text-center text-[#78604E]">
            در حال همگام‌سازی و دریافت آمار زنده سه‌محوره از مخزن محلی...
          </p>
        </div>
      )}

      {/* وضعیت خطا بدون نمایش عدد ۰ جعلی */}
      {!isInitialLoading && isWorkbookError && (
        <div
          data-testid="statistics-error-state"
          role="alert"
          className="bg-white border border-[#DFB9B9] rounded-2xl p-5 sm:p-6 space-y-4"
        >
          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-[#8A2C2C]">
              دریافت داده‌های زنده با خطا مواجه شد
            </h3>
            <p className="text-sm text-[#5C4636] leading-relaxed">
              {readiness?.workbookLoadError ||
                'امکان بارگذاری فهرست پایه کتابخانه فراهم نشد. برای جلوگیری از نمایش ارقام نادرست یا صفر جعلی، آمار تفصیلی پنهان شده‌اند.'}
            </p>
            {readiness?.hasCachedOperationalData && (
              <p className="text-xs text-[#78604E]">
                توجه: داده‌های عملیاتی ذخیره‌شده روی دستگاه محفوظ است و پس از دریافت فهرست پایه، آمار یکپارچه نمایش داده می‌شود.
              </p>
            )}
          </div>
          {readiness?.onRetryLoadWorkbook && (
            <button
              type="button"
              onClick={readiness.onRetryLoadWorkbook}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#6B3E26] hover:bg-[#56311E] text-white text-sm font-bold inline-flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>تلاش مجدد برای دریافت داده‌ها</span>
            </button>
          )}
        </div>
      )}

      {!isInitialLoading && !isWorkbookError && (
        <>
          {!hasDataLoaded && (
            <div
              data-testid="statistics-empty-state"
              className="bg-white border border-[#E5D7C6] rounded-2xl p-6 text-center text-sm text-[#78604E]"
            >
              اطلاعات پایه سامانه هنوز بارگذاری نشده است؛ به محض دریافت داده‌های زنده، ارقام سه‌بخشی محاسبه می‌شوند.
            </div>
          )}

          {/* ابزارهای مشترک دسترسی به سه بخش (نه کارت یا بخش چهارم) */}
          <div
            data-testid="statistics-shared-tools"
            aria-label="ابزارهای مشترک دسترسی به آمار سه بخش"
            className="bg-[#FAF5EE] border border-[#E5D7C6] rounded-2xl p-4 sm:p-5 space-y-4"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-[#6B3E26]">
                  ابزارهای مشترک دسترسی به سه بخش اصلی
                </div>
                <p className="text-xs text-[#78604E]">
                  جستجوی یکپارچه ۸حوزه‌ای و پرسش‌های آماری زنده روی داده‌های «کتابخانه»، «شهدا و ارتباطات» و «وضعیت کار و خروجی‌ها»
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => scrollToSection('library')}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-white border border-[#E5D7C6] hover:border-[#6B3E26] text-[#332218] font-medium cursor-pointer transition-colors"
                >
                  ۱. کتابخانه
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection('martyrs')}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-white border border-[#E5D7C6] hover:border-[#6B3E26] text-[#332218] font-medium cursor-pointer transition-colors"
                >
                  ۲. شهدا و ارتباطات
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection('work')}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-white border border-[#E5D7C6] hover:border-[#6B3E26] text-[#332218] font-medium cursor-pointer transition-colors"
                >
                  ۳. وضعیت کار و خروجی‌ها
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* جستجوی یکپارچه ۸حوزه‌ای */}
              <div className="lg:col-span-5 bg-white border border-[#E5D7C6] rounded-xl p-3.5 space-y-3">
                <label
                  htmlFor="statistics-unified-search-input"
                  className="flex items-center gap-1.5 text-xs font-bold text-[#332218]"
                >
                  <Search className="w-4 h-4 text-[#6B3E26]" />
                  <span>جستجوی یکپارچه در ۸ حوزه داده‌ای</span>
                </label>

                <div className="flex flex-wrap gap-1.5">
                  {SEARCH_SCOPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      data-testid={`search-scope-${opt.id}`}
                      onClick={() => setSearchScope(opt.id)}
                      className={`px-2 py-1 rounded-md text-[11px] border transition-colors cursor-pointer ${
                        searchScope === opt.id
                          ? 'bg-[#6B3E26] border-[#6B3E26] text-white font-bold'
                          : 'bg-[#FAF5EE] border-[#E5D7C6] text-[#5C4636] hover:border-[#6B3E26]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <input
                    id="statistics-unified-search-input"
                    data-testid="statistics-unified-search"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="نام کتاب، شناسه BK / PV / RL، نام شهید، فعالیت یا گزارش..."
                    className="w-full min-h-[42px] pr-3 pl-9 py-2 rounded-lg border border-[#D8C5B0] bg-[#FFFDFA] text-xs sm:text-sm text-[#332218] placeholder:text-[#9C826B] focus:outline-none focus:ring-2 focus:ring-[#6B3E26]"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="پاک کردن جستجو"
                      className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-[#78604E] hover:text-[#332218] cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {searchQuery.trim() ? (
                  searchPreview.isQueryUnclear ? (
                    <div
                      data-testid="statistics-search-unclear"
                      className="rounded-lg bg-[#FDF5ED] border border-[#E5C9A8] p-2.5 text-[11px] text-[#8C4A19]"
                    >
                      {searchPreview.unclearMessage}
                    </div>
                  ) : (
                    <div
                      data-testid="statistics-search-results"
                      className="space-y-2.5 text-xs tabular-nums"
                    >
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => triggerDrilldown('library_all')}
                          className="px-2 py-1 rounded-md bg-[#FAF5EE] border border-[#E5D7C6] text-[#332218] cursor-pointer hover:border-[#6B3E26]"
                        >
                          کتاب‌ها: <strong>{toPersianDigits(searchPreview.booksMatchesCount)}</strong>
                        </button>
                        <button
                          type="button"
                          onClick={() => triggerDrilldown('martyrs_linked_all')}
                          className="px-2 py-1 rounded-md bg-[#FAF5EE] border border-[#E5D7C6] text-[#332218] cursor-pointer hover:border-[#6B3E26]"
                        >
                          شهدا: <strong>{toPersianDigits(searchPreview.martyrsMatchesCount)}</strong>
                        </button>
                        <button
                          type="button"
                          onClick={() => triggerDrilldown('relations_active_all')}
                          className="px-2 py-1 rounded-md bg-[#FAF5EE] border border-[#E5D7C6] text-[#332218] cursor-pointer hover:border-[#6B3E26]"
                        >
                          ارتباطات: <strong>{toPersianDigits(searchPreview.relationsMatchesCount)}</strong>
                        </button>
                        <button
                          type="button"
                          onClick={() => triggerDrilldown('work_all')}
                          className="px-2 py-1 rounded-md bg-[#FAF5EE] border border-[#E5D7C6] text-[#332218] cursor-pointer hover:border-[#6B3E26]"
                        >
                          صف: <strong>{toPersianDigits(searchPreview.workMatchesCount)}</strong>
                        </button>
                        <button
                          type="button"
                          onClick={() => triggerDrilldown('activity_logs')}
                          className="px-2 py-1 rounded-md bg-[#FAF5EE] border border-[#E5D7C6] text-[#332218] cursor-pointer hover:border-[#6B3E26]"
                        >
                          فعالیت: <strong>{toPersianDigits(searchPreview.activityMatchesCount)}</strong>
                        </button>
                        <button
                          type="button"
                          onClick={() => triggerDrilldown('research_outputs')}
                          className="px-2 py-1 rounded-md bg-[#FAF5EE] border border-[#E5D7C6] text-[#332218] cursor-pointer hover:border-[#6B3E26]"
                        >
                          پژوهش: <strong>{toPersianDigits(searchPreview.researchMatchesCount)}</strong>
                        </button>
                        <button
                          type="button"
                          onClick={() => triggerDrilldown('management_reports')}
                          className="px-2 py-1 rounded-md bg-[#FAF5EE] border border-[#E5D7C6] text-[#332218] cursor-pointer hover:border-[#6B3E26]"
                        >
                          گزارش‌ها: <strong>{toPersianDigits(searchPreview.reportMatchesCount)}</strong>
                        </button>
                      </div>

                      {searchPreview.totalMatchesCount === 0 ? (
                        <p className="text-[#78604E]">
                          موردی مطابق عبارت جستجو در دامنه انتخاب‌شده یافت نشد.
                        </p>
                      ) : (
                        <div className="space-y-1 max-h-44 overflow-y-auto border-t border-[#F0E6D8] pt-2">
                          {matchingTopRecords.books.map((b) => (
                            <button
                              key={b.bookKey}
                              type="button"
                              onClick={() => triggerDrilldown('library_all')}
                              className="w-full flex items-center justify-between gap-2 text-[11px] text-[#5C4636] hover:bg-[#FAF5EE] px-1.5 py-1 rounded text-right cursor-pointer"
                            >
                              <span className="truncate">
                                [کتاب] {b.tempBookId} · {b.title}
                              </span>
                              <span className="shrink-0 text-[#78604E]">
                                {b.managerialStatusLabel}
                              </span>
                            </button>
                          ))}
                          {matchingTopRecords.martyrs.map((m) => (
                            <button
                              key={m.martyrKey}
                              type="button"
                              onClick={() => triggerDrilldown('martyrs_linked_all')}
                              className="w-full flex items-center justify-between gap-2 text-[11px] text-[#5C4636] hover:bg-[#FAF5EE] px-1.5 py-1 rounded text-right cursor-pointer"
                            >
                              <span className="truncate">
                                [شهید] {m.displayCode} · {m.fullName}
                              </span>
                              <span className="shrink-0 text-[#78604E]">
                                {m.identityStatusLabel}
                              </span>
                            </button>
                          ))}
                          {matchingTopRecords.relations.map((r) => (
                            <button
                              key={r.linkId}
                              type="button"
                              onClick={() => triggerDrilldown('relations_active_all')}
                              className="w-full flex items-center justify-between gap-2 text-[11px] text-[#5C4636] hover:bg-[#FAF5EE] px-1.5 py-1 rounded text-right cursor-pointer"
                            >
                              <span className="truncate">
                                [ارتباط] {r.linkId} · {r.bookTitle} ↔ {r.martyrName}
                              </span>
                              <span className="shrink-0 text-[#78604E]">{r.certaintyLabel}</span>
                            </button>
                          ))}
                          {matchingTopRecords.work.map((pv) => (
                            <button
                              key={pv.trackingId}
                              type="button"
                              onClick={() => triggerDrilldown('work_all')}
                              className="w-full flex items-center justify-between gap-2 text-[11px] text-[#5C4636] hover:bg-[#FAF5EE] px-1.5 py-1 rounded text-right cursor-pointer"
                            >
                              <span className="truncate">
                                [صف] {pv.trackingId} · {pv.issueSubject || pv.bookTitle}
                              </span>
                              <span className="shrink-0 text-[#78604E]">{pv.trackingStatus}</span>
                            </button>
                          ))}
                          {matchingTopRecords.activities.map((log) => (
                            <button
                              key={log.id}
                              type="button"
                              onClick={() => triggerDrilldown('activity_logs')}
                              className="w-full flex items-center justify-between gap-2 text-[11px] text-[#5C4636] hover:bg-[#FAF5EE] px-1.5 py-1 rounded text-right cursor-pointer"
                            >
                              <span className="truncate">
                                [فعالیت] {log.actionType} · {log.summary}
                              </span>
                              <span className="shrink-0 text-[#78604E]">{log.targetId}</span>
                            </button>
                          ))}
                          {matchingTopRecords.research.map((ex) => (
                            <button
                              key={ex.id}
                              type="button"
                              onClick={() => triggerDrilldown('research_outputs')}
                              className="w-full flex items-center justify-between gap-2 text-[11px] text-[#5C4636] hover:bg-[#FAF5EE] px-1.5 py-1 rounded text-right cursor-pointer"
                            >
                              <span className="truncate">
                                [پژوهش] {ex.passageTitle || ex.contentType} · {ex.bookTitleRaw}
                              </span>
                              <span className="shrink-0 text-[#78604E]">{ex.reviewStatus}</span>
                            </button>
                          ))}
                          {matchingTopRecords.reports.map((rep) => (
                            <button
                              key={rep.reportId}
                              type="button"
                              onClick={() =>
                                triggerDrilldown(
                                  rep.lifecycleStatus === 'final'
                                    ? 'management_reports'
                                    : 'management_reports_drafts'
                                )
                              }
                              className="w-full flex items-center justify-between gap-2 text-[11px] text-[#5C4636] hover:bg-[#FAF5EE] px-1.5 py-1 rounded text-right cursor-pointer"
                            >
                              <span className="truncate">
                                [گزارش] {rep.reportId} · {rep.title}
                              </span>
                              <span className="shrink-0 text-[#78604E]">
                                {rep.lifecycleStatus === 'final' ? 'نهایی' : 'پیش‌نویس'}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <p className="text-[11px] text-[#78604E] tabular-nums">
                    مجموع کل رکوردهای زنده قابل جستجو:{' '}
                    {toPersianDigits(
                      lib.totalTrackedBooksCount +
                        martyrs.linkedMartyrsSummary.distinctNormalizedLinkedNamesCount +
                        rels.totalRawLinkRows +
                        workAnalytics.reviewQueueTotalCount +
                        workAnalytics.activityLog.totalEntriesCount +
                        workAnalytics.researchOutputs.totalExtractedNonRejectedCount +
                        effectiveFinalizedRegistry.length
                    )}{' '}
                    رکورد
                  </p>
                )}
              </div>

              {/* پرسش‌های آماری زنده + پرسش سفارشی غیرحدسی */}
              <div
                data-testid="statistics-statistical-queries"
                className="lg:col-span-7 bg-white border border-[#E5D7C6] rounded-xl p-3.5 space-y-3"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#332218]">
                  <HelpCircle className="w-4 h-4 text-[#6B3E26]" />
                  <span>پرسش‌های آماری زنده (محاسبه مستقیم با عدد، واحد و مبنای شمارش)</span>
                </div>

                <form onSubmit={handleAskCustomQuestion} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    data-testid="custom-statistical-question-input"
                    value={customQuestionInput}
                    onChange={(e) => setCustomQuestionInput(e.target.value)}
                    placeholder="پرسش آماری خود را بنویسید (مثلاً: چند کتاب تکمیل‌شده داریم؟ یا چند ارتباط تأیید کارشناسی شده؟)"
                    className="flex-1 min-h-[40px] px-3 py-1.5 rounded-lg border border-[#D8C5B0] bg-[#FFFDFA] text-xs text-[#332218] placeholder:text-[#9C826B] focus:outline-none focus:ring-2 focus:ring-[#6B3E26]"
                  />
                  <button
                    type="submit"
                    data-testid="custom-statistical-question-submit"
                    className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-[#6B3E26] hover:bg-[#56311E] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>محاسبه پاسخ</span>
                  </button>
                </form>

                {customQuestionResult?.status === 'unclear' && (
                  <div
                    data-testid="custom-question-unclear-box"
                    className="rounded-lg bg-[#FDF5ED] border border-[#E5C9A8] p-2.5 text-xs text-[#8C4A19]"
                  >
                    {customQuestionResult.message}
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {statisticalQueries.map((q) => {
                    const isSelected =
                      !customQuestionResult && selectedPrebuiltQuery?.id === q.id;
                    return (
                      <button
                        key={q.id}
                        type="button"
                        data-testid={`stat-query-btn-${q.id}`}
                        onClick={() => {
                          setCustomQuestionResult(null);
                          setSelectedQueryId(q.id);
                        }}
                        className={`text-right px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs border transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#6B3E26] border-[#6B3E26] text-white font-bold'
                            : 'bg-[#FAF5EE] border-[#E5D7C6] text-[#5C4636] hover:border-[#6B3E26]'
                        }`}
                      >
                        {q.question}
                      </button>
                    );
                  })}
                </div>

                {activeAnswer && (
                  <div
                    data-testid="stat-query-answer-box"
                    className="rounded-lg bg-[#FFFDFA] border border-[#EFE4D6] p-3.5 space-y-2 tabular-nums"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-[#6B3E26]">
                        بخش متناظر: {activeAnswer.targetSectionLabel}
                      </span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => scrollToSection(activeAnswer.targetSection)}
                          className="text-[11px] text-[#78604E] hover:text-[#332218] hover:underline cursor-pointer"
                        >
                          رفتن به بخش
                        </button>
                        {onSelectDrilldown && (
                          <button
                            type="button"
                            data-testid="stat-query-open-drilldown-btn"
                            onClick={() => triggerDrilldown(activeAnswer.drilldownKey)}
                            className="min-h-[32px] px-2.5 py-1 rounded-md bg-[#6B3E26] hover:bg-[#56311E] text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <span>مشاهده فهرست</span>
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-lg bg-[#FAF5EE] border border-[#EFE4D6] p-2.5 text-xs">
                      <div>
                        <div className="text-[10px] text-[#78604E]">عدد شاخص</div>
                        <div className="text-base font-bold text-[#332218]">
                          {activeAnswer.countNumber !== null
                            ? toPersianDigits(activeAnswer.countDisplay)
                            : 'در دسترس نیست'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#78604E]">واحد شمارش</div>
                        <div className="font-semibold text-[#332218]">
                          {activeAnswer.countingUnit}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#78604E]">مبنای شمارش</div>
                        <div className="text-[11px] text-[#5C4636] leading-snug">
                          {activeAnswer.countingBasis}
                        </div>
                      </div>
                    </div>

                    <div className="text-xs sm:text-sm font-bold text-[#332218]">
                      {toPersianDigits(activeAnswer.headlineMetric)}
                    </div>
                    <p className="text-xs text-[#5C4636] leading-relaxed">
                      {toPersianDigits(activeAnswer.explanation)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* بخش ۱ از ۳: کتابخانه                                                  */}
          {/* ===================================================================== */}
          <section
            id="stats-section-library"
            data-testid="statistics-section-library"
            aria-labelledby="stats-section-library-title"
            className="bg-white border border-[#E5D7C6] rounded-2xl p-5 sm:p-6 space-y-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EFE4D6] pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#FAF5EE] border border-[#E5D7C6] text-[#6B3E26] flex items-center justify-center shrink-0">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[11px] text-[#78604E]">بخش ۱ متناظر با کارت اول داشبورد</div>
                  <h3 id="stats-section-library-title" className="text-base sm:text-lg font-bold">
                    کتابخانه
                  </h3>
                </div>
              </div>

              {onSelectDrilldown && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => triggerDrilldown('library_all')}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#E5D7C6] hover:bg-[#FAF5EE] text-[#332218] font-medium cursor-pointer"
                  >
                    فهرست کامل کتاب‌ها
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerDrilldown('library_remaining')}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#E5D7C6] hover:bg-[#FAF5EE] text-[#332218] font-medium cursor-pointer"
                  >
                    در حال بررسی و شروع‌نشده
                  </button>
                </div>
              )}
            </div>

            {/* نمودار دوناتی زنده کتابخانه در ابتدای بخش */}
            <div className="rounded-xl bg-[#FFFDFA] border border-[#EFE4D6] p-4">
              <OverviewDonutChart
                ariaLabel="نمودار دوناتی وضعیت تکمیل کتابخانه"
                size={112}
                strokeWidth={12}
                showLegend
                unitLabel="کتاب"
                totalCount={libDet.totalTrackedBooksCount}
                centerPercent={overview.libraryCard.completedPercent}
                centerLabel="تکمیل قطعی"
                centerSubValue={`${toPersianDigits(libDet.completedCount)}/${toPersianDigits(
                  libDet.totalTrackedBooksCount
                )}`}
                segments={[
                  {
                    id: 'lib_done',
                    label: 'تکمیل‌شده (پرونده و قفسه و ارتباط با شهید و بستن تیکت)',
                    count: libDet.completedCount,
                    percent: overview.libraryCard.completedPercent,
                    color: '#2E6F40',
                    testId: 'stats-library-completed',
                    onClick: onSelectDrilldown
                      ? () => triggerDrilldown('library_completed')
                      : undefined,
                  },
                  {
                    id: 'lib_progress',
                    label: 'در حال بررسی / دارای ثبت اولیه یا تیکت باز',
                    count: libDet.inProgressCount,
                    percent: bookInProgressPct,
                    color: '#C87A3B',
                    testId: 'stats-library-in-progress',
                    onClick: onSelectDrilldown
                      ? () => triggerDrilldown('library_in_progress')
                      : undefined,
                  },
                  {
                    id: 'lib_not_started',
                    label: 'شروع‌نشده (بدون ثبت قفسه، ممیزی یا تیکت)',
                    count: libDet.notStartedCount,
                    percent: bookNotStartedPct,
                    color: '#C9B49B',
                    testId: 'stats-library-not-started',
                    onClick: onSelectDrilldown
                      ? () => triggerDrilldown('library_not_started')
                      : undefined,
                  },
                ]}
              />
            </div>

            {/* ۱۲ سنجه تعاملی کتابخانه */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 tabular-nums">
              <div className="rounded-xl border border-[#EFE4D6] p-3.5 space-y-1 text-xs sm:text-sm">
                <div className="text-xs font-bold text-[#6B3E26] pb-1.5 border-b border-[#F2E9DE]">
                  وضعیت چرخه تکمیل و کار میدانی کتاب‌ها
                </div>
                <button
                  type="button"
                  data-testid="stat-metric-library-all"
                  onClick={() => triggerDrilldown('library_all')}
                  className={interactiveRowClass(!onSelectDrilldown)}
                >
                  <span className="text-[#5C4636] group-hover:text-[#332218]">کل کتاب‌های تحت پایش</span>
                  <strong className="inline-flex items-center gap-1">
                    {toPersianDigits(libDet.totalTrackedBooksCount)} کتاب
                    <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                  </strong>
                </button>
                <button
                  type="button"
                  data-testid="stat-metric-library-completed"
                  onClick={() => triggerDrilldown('library_completed')}
                  className={interactiveRowClass(!onSelectDrilldown)}
                >
                  <span className="text-[#2E6F40] font-medium">تکمیل‌شده (معیار سخت‌گیرانه)</span>
                  <strong className="text-[#2E6F40] inline-flex items-center gap-1">
                    {toPersianDigits(libDet.completedCount)} کتاب
                    <ChevronLeft className="w-3.5 h-3.5 text-[#2E6F40]" />
                  </strong>
                </button>
                <button
                  type="button"
                  data-testid="stat-metric-library-in-progress"
                  onClick={() => triggerDrilldown('library_in_progress')}
                  className={interactiveRowClass(!onSelectDrilldown)}
                >
                  <span className="text-[#5C4636] group-hover:text-[#332218]">در حال بررسی</span>
                  <strong className="inline-flex items-center gap-1">
                    {toPersianDigits(libDet.inProgressCount)} کتاب
                    <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                  </strong>
                </button>
                <button
                  type="button"
                  data-testid="stat-metric-library-not-started"
                  onClick={() => triggerDrilldown('library_not_started')}
                  className={interactiveRowClass(!onSelectDrilldown)}
                >
                  <span className="text-[#5C4636] group-hover:text-[#332218]">شروع‌نشده</span>
                  <strong className="inline-flex items-center gap-1">
                    {toPersianDigits(libDet.notStartedCount)} کتاب
                    <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                  </strong>
                </button>
                <button
                  type="button"
                  data-testid="stat-metric-library-worked"
                  onClick={() => triggerDrilldown('library_worked')}
                  className={interactiveRowClass(!onSelectDrilldown)}
                >
                  <span className="text-[#5C4636] group-hover:text-[#332218]">کارشده / دارای ثبت فعالیت</span>
                  <strong className="inline-flex items-center gap-1">
                    {toPersianDigits(libDet.workedOrRegisteredCount)} کتاب
                    <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                  </strong>
                </button>
                <button
                  type="button"
                  data-testid="stat-metric-library-unworked"
                  onClick={() => triggerDrilldown('library_unworked')}
                  className={interactiveRowClass(!onSelectDrilldown)}
                >
                  <span className="text-[#5C4636] group-hover:text-[#332218]">کارنشده (فاقد هرگونه ثبت)</span>
                  <strong className="inline-flex items-center gap-1">
                    {toPersianDigits(libDet.unworkedCount)} کتاب
                    <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                  </strong>
                </button>
              </div>

              <div className="rounded-xl border border-[#EFE4D6] p-3.5 space-y-1 text-xs sm:text-sm">
                <div className="text-xs font-bold text-[#6B3E26] pb-1.5 border-b border-[#F2E9DE]">
                  قفسه، تأیید کارشناسی، تیکت و وضعیت ارتباط با شهید
                </div>
                <button
                  type="button"
                  data-testid="stat-metric-library-shelf-verified"
                  onClick={() => triggerDrilldown('library_shelf_verified')}
                  className={interactiveRowClass(!onSelectDrilldown)}
                >
                  <span className="text-[#5C4636] group-hover:text-[#332218]">تأیید موجودی قفسه</span>
                  <strong className="inline-flex items-center gap-1">
                    {toPersianDigits(libDet.shelfVerifiedPresentCount)} کتاب
                    <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                  </strong>
                </button>
                <button
                  type="button"
                  data-testid="stat-metric-library-expert-approved"
                  onClick={() => triggerDrilldown('library_expert_approved')}
                  className={interactiveRowClass(!onSelectDrilldown)}
                >
                  <span className="text-[#5C4636] group-hover:text-[#332218]">تأییدشده کارشناسی</span>
                  <strong className="inline-flex items-center gap-1">
                    {toPersianDigits(libDet.expertApprovedCount)} کتاب
                    <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                  </strong>
                </button>
                <button
                  type="button"
                  data-testid="stat-metric-library-awaiting-expert"
                  onClick={() => triggerDrilldown('library_awaiting_expert')}
                  className={interactiveRowClass(!onSelectDrilldown)}
                >
                  <span className="text-[#5C4636] group-hover:text-[#332218]">در انتظار تأیید کارشناسی</span>
                  <strong className="inline-flex items-center gap-1">
                    {toPersianDigits(libDet.awaitingExpertApprovalCount)} کتاب
                    <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                  </strong>
                </button>
                <button
                  type="button"
                  data-testid="stat-metric-library-open-ticket"
                  onClick={() => triggerDrilldown('library_open_duplicate_ticket')}
                  className={interactiveRowClass(!onSelectDrilldown)}
                >
                  <span className="text-[#9C541C] font-medium">دارای تیکت باز تکرار عنوان</span>
                  <strong className="text-[#9C541C] inline-flex items-center gap-1">
                    {toPersianDigits(libDet.openDuplicateTitleTicketsCount)} کتاب
                    <ChevronLeft className="w-3.5 h-3.5 text-[#9C541C]" />
                  </strong>
                </button>
                <button
                  type="button"
                  data-testid="stat-metric-library-with-martyr"
                  onClick={() => triggerDrilldown('library_with_martyr_link')}
                  className={interactiveRowClass(!onSelectDrilldown)}
                >
                  <span className="text-[#5C4636] group-hover:text-[#332218]">دارای ارتباط ثبت‌شده با شهید</span>
                  <strong className="inline-flex items-center gap-1">
                    {toPersianDigits(libDet.hasRegisteredMartyrLinkCount)} کتاب
                    <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                  </strong>
                </button>
                <button
                  type="button"
                  data-testid="stat-metric-library-without-martyr"
                  onClick={() => triggerDrilldown('library_without_martyr_link')}
                  className={interactiveRowClass(!onSelectDrilldown)}
                >
                  <span className="text-[#5C4636] group-hover:text-[#332218]">فاقد ارتباط ثبت‌شده با شهید</span>
                  <strong className="inline-flex items-center gap-1">
                    {toPersianDigits(libDet.lacksRegisteredMartyrLinkCount)} کتاب
                    <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                  </strong>
                </button>
                <button
                  type="button"
                  data-testid="stat-metric-library-reviewed-no-martyr"
                  onClick={() => triggerDrilldown('library_reviewed_no_martyr')}
                  className={interactiveRowClass(!onSelectDrilldown)}
                >
                  <span className="text-[#5C4636] group-hover:text-[#332218]">بررسی‌شده و فاقد ارتباط با شهید</span>
                  <strong className="inline-flex items-center gap-1">
                    {toPersianDigits(libDet.reviewedWithoutMartyrLinkCount)} کتاب
                    <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                  </strong>
                </button>
              </div>
            </div>

            <div className="rounded-xl bg-[#FAF5EE] border border-[#EFE4D6] p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#5C4636] tabular-nums">
              <span>
                عناوین یکتای کاتالوگ: <strong>{toPersianDigits(lib.exactUniqueCatalogTitlesCount)}</strong> · گروه‌های تشابه عنوان:{' '}
                <strong>{toPersianDigits(lib.similarTitleGroups.length)}</strong> · نسخه‌های فیزیکی CP:{' '}
                <strong>{toPersianDigits(lib.registeredPhysicalCopiesCount)}</strong> · افراز مدیریتی بدون هم‌پوشانی (تکمیل بدون تیکت / تیکت باز / بررسی‌نشده):{' '}
                <strong>
                  {toPersianDigits(part.completedWithoutOpenTicketCount)} /{' '}
                  {toPersianDigits(part.openBookTicketCount)} /{' '}
                  {toPersianDigits(part.unreviewedCount)}
                </strong>
              </span>
              <span className="text-[11px] text-[#78604E]">
                «فاقد ارتباط ثبت‌شده» لزوماً به معنای «بررسی‌شده و فاقد ارتباط با شهید» نیست.
              </span>
            </div>
          </section>

          {/* ===================================================================== */}
          {/* بخش ۲ از ۳: شهدا ـ احراز هویت و ارتباطات                             */}
          {/* ===================================================================== */}
          <section
            id="stats-section-martyrs"
            data-testid="statistics-section-martyrs"
            aria-labelledby="stats-section-martyrs-title"
            className="bg-white border border-[#E5D7C6] rounded-2xl p-5 sm:p-6 space-y-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EFE4D6] pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#FAF5EE] border border-[#E5D7C6] text-[#6B3E26] flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[11px] text-[#78604E]">بخش ۲ متناظر با کارت دوم داشبورد</div>
                  <h3 id="stats-section-martyrs-title" className="text-base sm:text-lg font-bold">
                    شهدا ـ احراز هویت و ارتباطات
                  </h3>
                </div>
              </div>

              {onSelectDrilldown && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => triggerDrilldown('martyrs_confirmed')}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#E5D7C6] hover:bg-[#FAF5EE] text-[#332218] font-medium cursor-pointer"
                  >
                    شهدای احرازشده
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerDrilldown('martyrs_needs_verification')}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#E5D7C6] hover:bg-[#FAF5EE] text-[#332218] font-medium cursor-pointer"
                  >
                    نیازمند بررسی هویت
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerDrilldown('relations_needs_review')}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#E5D7C6] hover:bg-[#FAF5EE] text-[#332218] font-medium cursor-pointer"
                  >
                    ارتباطات در انتظار بررسی
                  </button>
                </div>
              )}
            </div>

            {/* نمودار دوناتی زنده احراز هویت شهدای مرتبط */}
            <div className="rounded-xl bg-[#FFFDFA] border border-[#EFE4D6] p-4">
              <OverviewDonutChart
                ariaLabel="نمودار دوناتی احراز هویت شهدای مرتبط"
                size={112}
                strokeWidth={12}
                showLegend
                unitLabel="شهید"
                totalCount={overview.martyrsCard.totalLinkedMartyrsCount}
                centerPercent={overview.martyrsCard.confirmedIdentityPercent}
                centerLabel="احراز هویت"
                centerSubValue={`${toPersianDigits(
                  overview.martyrsCard.confirmedIdentityCount
                )}/${toPersianDigits(overview.martyrsCard.totalLinkedMartyrsCount)}`}
                segments={[
                  {
                    id: 'martyrs_confirmed',
                    label: 'هویت احرازشده (شخص یکتای قطعی)',
                    count: overview.martyrsCard.confirmedIdentityCount,
                    percent: overview.martyrsCard.confirmedIdentityPercent,
                    color: '#2E6F40',
                    testId: 'stats-martyrs-confirmed',
                    onClick: onSelectDrilldown
                      ? () => triggerDrilldown('martyrs_confirmed')
                      : undefined,
                  },
                  {
                    id: 'martyrs_needs',
                    label: 'نیازمند بررسی هویت / رفع ابهام هم‌نامی',
                    count: overview.martyrsCard.needsVerificationCount,
                    percent: overview.martyrsCard.needsVerificationPercent,
                    color: '#C87A3B',
                    testId: 'stats-martyrs-needs-verification',
                    onClick: onSelectDrilldown
                      ? () => triggerDrilldown('martyrs_needs_verification')
                      : undefined,
                  },
                ]}
              />
            </div>

            {/* وضعیت صادقانه بانک گلزار شهدا */}
            {!martyrsDet.officialBankLoaded && (
              <div
                data-testid="statistics-golzar-status-banner"
                className="rounded-xl bg-[#FAF5EE] border border-[#E5D7C6] p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <span className="text-[#5C4636]">
                  {isGolzarError
                    ? 'بارگذاری بانک مرجع گلزار شهدا با خطا مواجه شده است؛ آمار بانک رسمی به‌جای صفر جعلی در وضعیت نامشخص نگه داشته شده است.'
                    : isGolzarLoading && readiness
                    ? 'بانک رسمی گلزار شهدا در حال بارگذاری است؛ ارقام کل بانک پس از تکمیل بارگذاری نمایش داده می‌شوند.'
                    : 'بانک رسمی گلزار شهدا هنوز برای محاسبه کل بانک و شهدای متصل‌نشده بارگذاری نشده است.'}
                </span>
                {(readiness?.onRetryLoadGolzar || onRequestLoadGolzarBank) && (
                  <button
                    type="button"
                    onClick={readiness?.onRetryLoadGolzar || onRequestLoadGolzarBank}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#6B3E26] text-white font-bold cursor-pointer"
                  >
                    {isGolzarError ? 'تلاش مجدد بانک گلزار' : 'بارگذاری بانک گلزار شهدا'}
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 tabular-nums">
              {/* زیربخش ۲-الف: ۱۱ سنجه تعاملی شهدا (واحد: شناسه شهید) */}
              <div className="rounded-xl border border-[#EFE4D6] p-4 space-y-1 text-xs sm:text-sm">
                <div className="flex items-center justify-between pb-2 border-b border-[#F2E9DE]">
                  <h4 className="text-sm font-bold text-[#332218]">
                    سنجه‌های ۱۱گانه شهدا
                  </h4>
                  <span className="text-[11px] text-[#78604E]">واحد: شناسه شهید</span>
                </div>

                <button
                  type="button"
                  data-testid="stat-metric-martyrs-official-unique"
                  onClick={() => triggerDrilldown('martyrs_official_unique_all')}
                  className={interactiveRowClass(!onSelectDrilldown)}
                >
                  <span className="text-[#5C4636] group-hover:text-[#332218]">
                    کل شهدای یکتای بانک رسمی و دستی
                  </span>
                  <strong className="inline-flex items-center gap-1">
                    {martyrsDet.officialAndCustomUniqueIdsCount !== null
                      ? `${toPersianDigits(martyrsDet.officialAndCustomUniqueIdsCount)} شناسه شهید`
                      : 'نیازمند بارگذاری بانک'}
                    <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                  </strong>
                </button>

                <button
                  type="button"
                  data-testid="stat-metric-martyrs-linked-all"
                  onClick={() => triggerDrilldown('martyrs_linked_all')}
                  className={interactiveRowClass(!onSelectDrilldown)}
                >
                  <span className="text-[#5C4636] group-hover:text-[#332218]">شهدای مرتبط با کتاب‌ها</span>
                  <strong className="inline-flex items-center gap-1">
                    {toPersianDigits(martyrsDet.linkedMartyrsCount)} شناسه شهید
                    <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                  </strong>
                </button>

                <button
                  type="button"
                  data-testid="stat-metric-martyrs-confirmed"
                  onClick={() => triggerDrilldown('martyrs_confirmed')}
                  className={interactiveRowClass(!onSelectDrilldown)}
                >
                  <span className="text-[#2E6F40] font-medium">هویت احرازشده</span>
                  <strong className="text-[#2E6F40] inline-flex items-center gap-1">
                    {toPersianDigits(martyrsDet.confirmedIdentityCount)} شناسه شهید
                    <ChevronLeft className="w-3.5 h-3.5 text-[#2E6F40]" />
                  </strong>
                </button>

                <button
                  type="button"
                  data-testid="stat-metric-martyrs-needs-verification"
                  onClick={() => triggerDrilldown('martyrs_needs_verification')}
                  className={interactiveRowClass(!onSelectDrilldown)}
                >
                  <span className="text-[#9C541C] font-medium">نیازمند بررسی هویت</span>
                  <strong className="text-[#9C541C] inline-flex items-center gap-1">
                    {toPersianDigits(martyrsDet.needsIdentityVerificationCount)} شناسه شهید
                    <ChevronLeft className="w-3.5 h-3.5 text-[#9C541C]" />
                  </strong>
                </button>

                <button
                  type="button"
                  data-testid="stat-metric-martyrs-unlinked-bank"
                  onClick={() => triggerDrilldown('martyrs_unlinked_bank')}
                  className={interactiveRowClass(!onSelectDrilldown)}
                >
                  <span className="text-[#5C4636] group-hover:text-[#332218]">
                    متصل‌نشده به کتاب (بانک و دستی)
                  </span>
                  <strong className="inline-flex items-center gap-1">
                    {martyrsDet.unlinkedBankAndCustomCount !== null
                      ? `${toPersianDigits(martyrsDet.unlinkedBankAndCustomCount)} شناسه شهید`
                      : `دستی: ${toPersianDigits(martyrsDet.unlinkedCustomOnlyCount)} (بانک بارگذاری نشده)`}
                    <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                  </strong>
                </button>

                <button
                  type="button"
                  data-testid="stat-metric-martyrs-tehran"
                  onClick={() => triggerDrilldown('martyrs_tehran')}
                  className={interactiveRowClass(!onSelectDrilldown)}
                >
                  <span className="text-[#5C4636] group-hover:text-[#332218]">تهرانی مرتبط</span>
                  <strong className="inline-flex items-center gap-1">
                    {toPersianDigits(martyrsDet.tehranLinkedCount)} شناسه شهید
                    <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                  </strong>
                </button>

                <button
                  type="button"
                  data-testid="stat-metric-martyrs-non-tehran"
                  onClick={() => triggerDrilldown('martyrs_non_tehran')}
                  className={interactiveRowClass(!onSelectDrilldown)}
                >
                  <span className="text-[#5C4636] group-hover:text-[#332218]">غیرتهرانی / یادبود مرتبط</span>
                  <strong className="inline-flex items-center gap-1">
                    {toPersianDigits(martyrsDet.nonTehranLinkedCount)} شناسه شهید
                    <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                  </strong>
                </button>

                <button
                  type="button"
                  data-testid="stat-metric-martyrs-unreviewed"
                  onClick={() => triggerDrilldown('martyrs_unreviewed')}
                  className={interactiveRowClass(!onSelectDrilldown)}
                >
                  <span className="text-[#5C4636] group-hover:text-[#332218]">بررسی‌نشده کارشناسی</span>
                  <strong className="inline-flex items-center gap-1">
                    {toPersianDigits(martyrsDet.unreviewedLinkedCount)} شناسه شهید
                    <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                  </strong>
                </button>

                <button
                  type="button"
                  data-testid="stat-metric-martyrs-homonym-suspects"
                  onClick={() => triggerDrilldown('martyrs_homonym_suspects')}
                  className={interactiveRowClass(!onSelectDrilldown)}
                >
                  <span className="text-[#5C4636] group-hover:text-[#332218]">هم‌نام مشکوک / اختلاف مزار</span>
                  <strong className="inline-flex items-center gap-1">
                    {toPersianDigits(martyrsDet.homonymSuspectsCount)} شناسه شهید
                    <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                  </strong>
                </button>

                <button
                  type="button"
                  data-testid="stat-metric-martyrs-single-book"
                  onClick={() => triggerDrilldown('martyrs_single_book')}
                  className={interactiveRowClass(!onSelectDrilldown)}
                >
                  <span className="text-[#5C4636] group-hover:text-[#332218]">دارای تک‌ارتباط کتاب</span>
                  <strong className="inline-flex items-center gap-1">
                    {toPersianDigits(martyrsDet.singleBookLinkedCount)} شناسه شهید
                    <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                  </strong>
                </button>

                <button
                  type="button"
                  data-testid="stat-metric-martyrs-multi-book"
                  onClick={() => triggerDrilldown('martyrs_multi_book')}
                  className={interactiveRowClass(!onSelectDrilldown)}
                >
                  <span className="text-[#5C4636] group-hover:text-[#332218]">دارای چند ارتباط کتاب</span>
                  <strong className="inline-flex items-center gap-1">
                    {toPersianDigits(martyrsDet.multiBookLinkedCount)} شناسه شهید
                    <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                  </strong>
                </button>
              </div>

              {/* زیربخش ۲-ب: آمار کامل ارتباطات کتاب و شهید (داخل بخش دوم، نه کارت چهارم) */}
              <div
                data-testid="statistics-relations-subblock"
                className="rounded-xl border border-[#EFE4D6] p-4 space-y-2 text-xs sm:text-sm"
              >
                <div className="flex items-center justify-between pb-2 border-b border-[#F2E9DE]">
                  <h4 className="text-sm font-bold text-[#332218]">
                    ارتباط کتاب و شهید
                  </h4>
                  <span className="text-[11px] text-[#78604E]">
                    واحد: زوج کتاب و شهید ({toPersianDigits(rels.totalRawLinkRows)} ردیف خام)
                  </span>
                </div>

                <div className="rounded-lg bg-[#FAF5EE] border border-[#EFE4D6] p-2.5 text-[11px] text-[#5C4636] leading-relaxed">
                  برچسب «قطعی» یا پژوهش اولیه در فایل منبع به‌صورت خودکار به «تأیید کارشناسی صریح» تبدیل نمی‌شود و این دو وضعیت کاملاً جداگانه گزارش می‌شوند.
                </div>

                <div className="space-y-1">
                  <button
                    type="button"
                    data-testid="stat-metric-relations-active-all"
                    onClick={() => triggerDrilldown('relations_active_all')}
                    className={interactiveRowClass(!onSelectDrilldown)}
                  >
                    <span className="text-[#5C4636] group-hover:text-[#332218]">کل ارتباطات فعال متمایز</span>
                    <strong className="inline-flex items-center gap-1">
                      {toPersianDigits(relSplit.totalActiveDistinctPairsCount)} زوج
                      <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                    </strong>
                  </button>

                  <button
                    type="button"
                    data-testid="stat-metric-relations-definite-source"
                    onClick={() => triggerDrilldown('relations_definite_source')}
                    className={interactiveRowClass(!onSelectDrilldown)}
                  >
                    <span className="text-[#5C4636] group-hover:text-[#332218]">
                      قطعی طبق برچسب منبع / مزار
                    </span>
                    <strong className="inline-flex items-center gap-1">
                      {toPersianDigits(relSplit.definiteBySourceLabelDistinctCount)} زوج (
                      {toPersianDigits(relSplit.definiteBySourceLabelRawCount)} ردیف)
                      <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                    </strong>
                  </button>

                  <button
                    type="button"
                    data-testid="stat-metric-relations-probable"
                    onClick={() => triggerDrilldown('relations_probable')}
                    className={interactiveRowClass(!onSelectDrilldown)}
                  >
                    <span className="text-[#5C4636] group-hover:text-[#332218]">احتمالی</span>
                    <strong className="inline-flex items-center gap-1">
                      {toPersianDigits(relSplit.probableDistinctCount)} زوج (
                      {toPersianDigits(relSplit.probableRawCount)} ردیف)
                      <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                    </strong>
                  </button>

                  <button
                    type="button"
                    data-testid="stat-metric-relations-confirmed"
                    onClick={() => triggerDrilldown('relations_confirmed')}
                    className={interactiveRowClass(!onSelectDrilldown)}
                  >
                    <span className="text-[#2E6F40] font-medium">تأیید کارشناسی صریح</span>
                    <strong className="text-[#2E6F40] inline-flex items-center gap-1">
                      {toPersianDigits(relSplit.explicitExpertConfirmedDistinctCount)} زوج (
                      {toPersianDigits(relSplit.explicitExpertConfirmedRawCount)} ردیف)
                      <ChevronLeft className="w-3.5 h-3.5 text-[#2E6F40]" />
                    </strong>
                  </button>

                  <button
                    type="button"
                    data-testid="stat-metric-relations-needs-review"
                    onClick={() => triggerDrilldown('relations_needs_review')}
                    className={interactiveRowClass(!onSelectDrilldown)}
                  >
                    <span className="text-[#9C541C] font-medium">نیازمند بررسی / گروهی</span>
                    <strong className="text-[#9C541C] inline-flex items-center gap-1">
                      {toPersianDigits(relSplit.needsReviewDistinctCount)} زوج (
                      {toPersianDigits(relSplit.needsReviewRawCount)} ردیف)
                      <ChevronLeft className="w-3.5 h-3.5 text-[#9C541C]" />
                    </strong>
                  </button>

                  <button
                    type="button"
                    data-testid="stat-metric-relations-rejected"
                    onClick={() => triggerDrilldown('relations_rejected_archive')}
                    className={interactiveRowClass(!onSelectDrilldown)}
                  >
                    <span className="text-[#5C4636] group-hover:text-[#332218]">ردشده و بایگانی‌شده</span>
                    <strong className="inline-flex items-center gap-1">
                      {toPersianDigits(
                        relSplit.rejectedArchiveDistinctCount +
                          rels.rejectedArchiveSuggestionsCount
                      )}{' '}
                      مورد
                      <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                    </strong>
                  </button>
                </div>

                <div className="pt-2 border-t border-[#F2E9DE] text-[11px] text-[#5C4636] space-y-1">
                  <div className="flex items-center justify-between">
                    <span>کتاب‌های دارای شهید نام‌دار</span>
                    <strong>{toPersianDigits(rels.booksWithLinksBreakdown.booksWithNamedMartyrLinks)} کتاب</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>
                      گروه‌های چندشهیدی ({toPersianDigits(summary.reviewQueue.multiMartyrGroups.totalGroupsCount)} گروه)
                    </span>
                    <strong>
                      {toPersianDigits(rels.booksWithLinksBreakdown.booksWithOnlyGroupOrPlaceholderLinks)} کتاب
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>هشدارهای اختلاف مختصات مزار / نام</span>
                    <strong>{toPersianDigits(martyrs.linkedMartyrsSummary.discrepancyWarnings.length)} مورد</strong>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ===================================================================== */}
          {/* بخش ۳ از ۳: وضعیت کار و خروجی‌ها                                      */}
          {/* ===================================================================== */}
          <section
            id="stats-section-work"
            data-testid="statistics-section-work"
            aria-labelledby="stats-section-work-title"
            className="bg-white border border-[#E5D7C6] rounded-2xl p-5 sm:p-6 space-y-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EFE4D6] pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#FAF5EE] border border-[#E5D7C6] text-[#6B3E26] flex items-center justify-center shrink-0">
                  <ClipboardList className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[11px] text-[#78604E]">
                    بخش ۳ متناظر با کارت سوم داشبورد · صف پیگیری، تاریخچه فعالیت، پژوهش و گزارش‌های مدیریتی
                  </div>
                  <h3 id="stats-section-work-title" className="text-base sm:text-lg font-bold">
                    وضعیت کار و خروجی‌ها
                  </h3>
                </div>
              </div>

              {onSelectDrilldown && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => triggerDrilldown('work_remaining')}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#E5D7C6] hover:bg-[#FAF5EE] text-[#332218] font-medium cursor-pointer"
                  >
                    صف باقیمانده
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerDrilldown('activity_logs')}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#E5D7C6] hover:bg-[#FAF5EE] text-[#332218] font-medium cursor-pointer"
                  >
                    تاریخچه فعالیت
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerDrilldown('research_outputs')}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#E5D7C6] hover:bg-[#FAF5EE] text-[#332218] font-medium cursor-pointer"
                  >
                    خروجی‌های پژوهشی
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerDrilldown('management_reports')}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#E5D7C6] hover:bg-[#FAF5EE] text-[#332218] font-medium cursor-pointer"
                  >
                    گزارش‌های مدیریتی
                  </button>
                </div>
              )}
            </div>

            {/* نمودار دوناتی زنده پیشرفت موضوعات کاری مستقل در ابتدای بخش سوم */}
            <div className="rounded-xl bg-[#FFFDFA] border border-[#EFE4D6] p-4">
              <OverviewDonutChart
                ariaLabel="نمودار دوناتی پیشرفت موضوعات کاری مستقل صف پیگیری"
                size={112}
                strokeWidth={12}
                showLegend
                unitLabel="موضوع"
                totalCount={overview.workAndOutputsCard.independentTopicsTotalCount}
                centerPercent={overview.workAndOutputsCard.reviewQueueCompletionPercent}
                centerLabel="پیشرفت موضوعات"
                centerSubValue={`${toPersianDigits(
                  overview.workAndOutputsCard.independentTopicsCompletedCount
                )}/${toPersianDigits(overview.workAndOutputsCard.independentTopicsTotalCount)}`}
                segments={[
                  {
                    id: 'work_done',
                    label: 'موضوعات انجام‌شده در صف پیگیری',
                    count: overview.workAndOutputsCard.independentTopicsCompletedCount,
                    percent: overview.workAndOutputsCard.reviewQueueCompletionPercent,
                    color: '#2E6F40',
                    testId: 'stats-work-completed',
                    onClick: onSelectDrilldown
                      ? () => triggerDrilldown('work_completed')
                      : undefined,
                  },
                  {
                    id: 'work_rem',
                    label: 'موضوعات باقیمانده (شامل در جریان و نیازمند منبع)',
                    count: overview.workAndOutputsCard.independentTopicsRemainingCount,
                    percent: overview.workAndOutputsCard.reviewQueueRemainingPercent,
                    color: '#C87A3B',
                    testId: 'stats-work-remaining',
                    onClick: onSelectDrilldown
                      ? () => triggerDrilldown('work_remaining')
                      : undefined,
                  },
                ]}
              />
            </div>

            {/* ۳-۱: صف پیگیری (PV) + تفکیک ۳ حوزه موضوعات مستقل */}
            <div className="space-y-3 tabular-nums">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
                <button
                  type="button"
                  data-testid="stat-work-pv-total"
                  onClick={() => triggerDrilldown('work_all')}
                  className="text-right rounded-xl bg-[#FAF5EE] border border-[#EFE4D6] hover:border-[#6B3E26] p-3 space-y-1 cursor-pointer transition-colors"
                >
                  <div className="text-[11px] text-[#78604E]">کل پرونده‌های صف</div>
                  <div className="text-xl font-bold text-[#332218]">
                    {toPersianDigits(workAnalytics.reviewQueueTotalCount)}
                  </div>
                  <div className="text-[10px] text-[#5C4636]">
                    {toPersianDigits(topics.totalTopicsCount)} موضوع مستقل
                  </div>
                </button>

                <button
                  type="button"
                  data-testid="stat-work-pv-completed"
                  onClick={() => triggerDrilldown('work_completed')}
                  className="text-right rounded-xl bg-[#F1F8F3] border border-[#CDE4D2] hover:border-[#2E6F40] p-3 space-y-1 cursor-pointer transition-colors"
                >
                  <div className="text-[11px] text-[#2E6F40]">انجام‌شده</div>
                  <div className="text-xl font-bold text-[#2E6F40]">
                    {toPersianDigits(workAnalytics.reviewQueueCompletedCount)}
                  </div>
                  <div className="text-[10px] text-[#2E6F40]">
                    {toPersianDigits(topics.completedTopicsCount)} موضوع
                  </div>
                </button>

                <button
                  type="button"
                  data-testid="stat-work-pv-remaining"
                  onClick={() => triggerDrilldown('work_remaining')}
                  className="text-right rounded-xl bg-[#FAF5EE] border border-[#EFE4D6] hover:border-[#6B3E26] p-3 space-y-1 cursor-pointer transition-colors"
                >
                  <div className="text-[11px] text-[#78604E]">باقیمانده</div>
                  <div className="text-xl font-bold text-[#332218]">
                    {toPersianDigits(workAnalytics.reviewQueueRemainingCount)}
                  </div>
                  <div className="text-[10px] text-[#5C4636]">
                    {toPersianDigits(topics.remainingTopicsCount)} موضوع
                  </div>
                </button>

                <button
                  type="button"
                  data-testid="stat-work-pv-in-progress"
                  onClick={() => triggerDrilldown('work_in_progress')}
                  className="text-right rounded-xl bg-[#FAF5EE] border border-[#EFE4D6] hover:border-[#6B3E26] p-3 space-y-1 cursor-pointer transition-colors"
                >
                  <div className="text-[11px] text-[#78604E]">باز / در جریان</div>
                  <div className="text-xl font-bold text-[#332218]">
                    {toPersianDigits(workAnalytics.reviewQueueOpenPlainCount)}
                  </div>
                  <div className="text-[10px] text-[#5C4636]">نیازمند بررسی</div>
                </button>

                <button
                  type="button"
                  data-testid="stat-work-pv-needs-source"
                  onClick={() => triggerDrilldown('work_needs_source')}
                  className="text-right rounded-xl bg-[#FDF5ED] border border-[#E5C9A8] hover:border-[#9C541C] p-3 space-y-1 cursor-pointer transition-colors"
                >
                  <div className="text-[11px] text-[#9C541C]">نیازمند منبع</div>
                  <div className="text-xl font-bold text-[#9C541C]">
                    {toPersianDigits(workAnalytics.reviewQueueNeedsSourceCount)}
                  </div>
                  <div className="text-[10px] text-[#9C541C]">جزو باقیمانده صف</div>
                </button>

                <button
                  type="button"
                  data-testid="stat-work-pv-closed"
                  onClick={() => triggerDrilldown('work_closed_rejected')}
                  className="text-right rounded-xl bg-[#FAF5EE] border border-[#EFE4D6] hover:border-[#6B3E26] p-3 space-y-1 cursor-pointer transition-colors"
                >
                  <div className="text-[11px] text-[#78604E]">بسته / رد با دلیل</div>
                  <div className="text-xl font-bold text-[#332218]">
                    {toPersianDigits(workAnalytics.reviewQueueClosedOrRejectedWithReasonCount)}
                  </div>
                  <div className="text-[10px] text-[#5C4636]">تعیین‌تکلیف‌شده</div>
                </button>
              </div>

              {/* تفکیک موضوعات کاری مستقل بین کتابخانه، شهدا و ارتباطات */}
              <div
                data-testid="stat-work-domain-breakdown"
                className="rounded-xl border border-[#EFE4D6] p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-[#332218]">
                      تفکیک موضوعات کاری مستقل بین کتابخانه، شهدا و ارتباطات
                    </h4>
                    <p className="text-[11px] text-[#78604E] mt-0.5">
                      موضوعات مرکب جداشده با «؛» در {toPersianDigits(topics.compoundRecordsCount)} پرونده صف به‌صورت مستقل شمرده شده‌اند تا هیچ کاری پنهان نماند.
                    </p>
                  </div>
                  <span className="text-xs font-bold text-[#6B3E26]">
                    جمع موضوعات صف: {toPersianDigits(topics.totalTopicsCount)}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {(
                    [
                      { item: dom.library, drillKey: 'work_domain_library' as const },
                      { item: dom.martyrs, drillKey: 'work_domain_martyrs' as const },
                      { item: dom.relations, drillKey: 'work_domain_relations' as const },
                    ] as const
                  ).map(({ item, drillKey }) => (
                    <button
                      key={item.domain}
                      type="button"
                      data-testid={`stat-domain-${item.domain}`}
                      onClick={() => triggerDrilldown(drillKey)}
                      className="text-right rounded-xl bg-[#FFFDFA] border border-[#EFE4D6] hover:border-[#6B3E26] p-3.5 space-y-2 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between border-b border-[#F2E9DE] pb-2">
                        <span className="text-sm font-bold text-[#332218]">{item.label}</span>
                        <span className="text-xs font-bold text-[#6B3E26] inline-flex items-center gap-1">
                          {toPersianDigits(item.totalActionableRemainingCount)} کار باز
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </span>
                      </div>
                      <div className="space-y-1 text-xs text-[#5C4636]">
                        <div className="flex items-center justify-between">
                          <span>موضوعات صف (کل / انجام‌شده)</span>
                          <strong>
                            {toPersianDigits(item.pvTopicsTotal)} /{' '}
                            {toPersianDigits(item.pvTopicsCompleted)}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>باقیمانده در صف پیگیری</span>
                          <strong>{toPersianDigits(item.pvTopicsRemaining)}</strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>باقیمانده رکوردهای اصلی خارج از صف</span>
                          <strong>{toPersianDigits(item.additionalOpenBacklogCount)}</strong>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ۳-۲: فعالیت‌های ثبت‌شده (با فیلترهای تعاملی حوزه، نوع فعالیت و بازه زمانی) */}
            <div
              data-testid="stat-work-activity-log"
              className="rounded-xl border border-[#EFE4D6] p-4 space-y-3 tabular-nums"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#F2E9DE] pb-2.5">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-[#6B3E26]" />
                  <div>
                    <h4 className="text-sm font-bold text-[#332218]">
                      فعالیت‌های ثبت‌شده در تاریخچه ({toPersianDigits(workAnalytics.activityLog.totalEntriesCount)} رویداد)
                    </h4>
                    <p className="text-[11px] text-[#78604E]">
                      مستقل از صف پیگیری؛ ثبت قفسه یا یادداشت تیکت‌های PV را خودکار نمی‌بندد و درصد صف را تغییر نمی‌دهد.
                    </p>
                  </div>
                </div>

                {onSelectDrilldown && (
                  <button
                    type="button"
                    onClick={() => triggerDrilldown('activity_logs')}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#FAF5EE] border border-[#E5D7C6] hover:border-[#6B3E26] text-xs font-bold text-[#332218] inline-flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <span>فهرست کامل تاریخچه فعالیت</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* تفکیک حوزه‌ای */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {workAnalytics.activityLog.byDomain.map((d) => (
                  <button
                    key={d.domain}
                    type="button"
                    onClick={() =>
                      setActivityDomainFilter((prev) =>
                        prev === d.domain ? 'all' : d.domain
                      )
                    }
                    className={`rounded-lg border px-3 py-2 flex items-center justify-between cursor-pointer transition-colors ${
                      activityDomainFilter === d.domain
                        ? 'bg-[#6B3E26] border-[#6B3E26] text-white'
                        : 'bg-[#FAF5EE] border-[#EFE4D6] text-[#5C4636] hover:border-[#6B3E26]'
                    }`}
                  >
                    <span>{d.label}</span>
                    <strong>{toPersianDigits(d.count)}</strong>
                  </button>
                ))}
              </div>

              {/* فیلترهای حوزه، نوع فعالیت و بازه زمانی */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs items-end bg-[#FFFDFA] border border-[#EFE4D6] rounded-lg p-3">
                <div>
                  <label
                    htmlFor="activity-filter-domain-select"
                    className="block text-[11px] text-[#78604E] mb-1"
                  >
                    فیلتر حوزه
                  </label>
                  <select
                    id="activity-filter-domain-select"
                    data-testid="activity-filter-domain"
                    value={activityDomainFilter}
                    onChange={(e) =>
                      setActivityDomainFilter(e.target.value as 'all' | ActivityDomainKey)
                    }
                    className="w-full min-h-[38px] px-2.5 rounded-lg border border-[#D8C5B0] bg-white text-[#332218]"
                  >
                    <option value="all">همه حوزه‌ها</option>
                    <option value="library">{ACTIVITY_DOMAIN_LABELS.library}</option>
                    <option value="martyrs_relations">
                      {ACTIVITY_DOMAIN_LABELS.martyrs_relations}
                    </option>
                    <option value="work_outputs">{ACTIVITY_DOMAIN_LABELS.work_outputs}</option>
                    <option value="other">{ACTIVITY_DOMAIN_LABELS.other}</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="activity-filter-action-select"
                    className="block text-[11px] text-[#78604E] mb-1"
                  >
                    نوع فعالیت
                  </label>
                  <select
                    id="activity-filter-action-select"
                    data-testid="activity-filter-action"
                    value={activityActionFilter}
                    onChange={(e) => setActivityActionFilter(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 rounded-lg border border-[#D8C5B0] bg-white text-[#332218]"
                  >
                    <option value="all">همه انواع فعالیت</option>
                    {workAnalytics.activityLog.byActionType.map((entry) => (
                      <option key={entry.actionType} value={entry.actionType}>
                        {entry.actionType} ({toPersianDigits(entry.count)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="activity-filter-from-input"
                    className="block text-[11px] text-[#78604E] mb-1"
                  >
                    از تاریخ (شمسی/میلادی)
                  </label>
                  <input
                    id="activity-filter-from-input"
                    data-testid="activity-filter-from"
                    type="text"
                    value={activityDateFrom}
                    onChange={(e) => setActivityDateFrom(e.target.value)}
                    placeholder="مثلاً ۱۴۰۵/۰۸/۰۱"
                    className="w-full min-h-[38px] px-2.5 rounded-lg border border-[#D8C5B0] bg-white text-[#332218]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="activity-filter-to-input"
                    className="block text-[11px] text-[#78604E] mb-1"
                  >
                    تا تاریخ (شمسی/میلادی)
                  </label>
                  <input
                    id="activity-filter-to-input"
                    data-testid="activity-filter-to"
                    type="text"
                    value={activityDateTo}
                    onChange={(e) => setActivityDateTo(e.target.value)}
                    placeholder="مثلاً ۱۴۰۵/۰۸/۳۰"
                    className="w-full min-h-[38px] px-2.5 rounded-lg border border-[#D8C5B0] bg-white text-[#332218]"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] text-[#5C4636]">
                    نتیجه فیلتر:{' '}
                    <strong data-testid="activity-filtered-count">
                      {toPersianDigits(filteredActivityLogs.length)}
                    </strong>{' '}
                    مورد
                  </div>
                  {(activityDomainFilter !== 'all' ||
                    activityActionFilter !== 'all' ||
                    activityDateFrom ||
                    activityDateTo) && (
                    <button
                      type="button"
                      onClick={() => {
                        setActivityDomainFilter('all');
                        setActivityActionFilter('all');
                        setActivityDateFrom('');
                        setActivityDateTo('');
                      }}
                      className="min-h-[34px] px-2.5 rounded-lg border border-[#E5D7C6] bg-white hover:bg-[#FAF5EE] text-[#6B3E26] font-medium inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Filter className="w-3 h-3" />
                      <span>بازنشانی</span>
                    </button>
                  )}
                </div>
              </div>

              {filteredActivityLogs.length > 0 ? (
                <div className="divide-y divide-[#F0E6D8] text-xs">
                  {filteredActivityLogs.slice(0, 5).map((log) => (
                    <div
                      key={log.id}
                      className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#2E6F40] shrink-0" />
                        <span className="font-bold text-[#332218] shrink-0">
                          {log.actionType}
                        </span>
                        <span className="text-[#5C4636] truncate">{log.summary}</span>
                      </div>
                      <span className="text-[11px] text-[#78604E] shrink-0">
                        {log.actorName} · {toPersianDigits(log.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#78604E]">
                  {workAnalytics.activityLog.totalEntriesCount === 0
                    ? 'هنوز هیچ رخدادی در تاریخچه فعالیت ثبت نشده است.'
                    : 'با فیلترهای انتخاب‌شده فعالیتی یافت نشد.'}
                </p>
              )}
            </div>

            {/* ۳-۳ و ۳-۴: خروجی‌های پژوهشی (۶ سنجه) و گزارش‌های مدیریتی (دفتر کل محلی مستقل) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 tabular-nums">
              {/* خروجی‌های پژوهشی */}
              <div
                data-testid="stat-work-final-research"
                className="rounded-xl border border-[#EFE4D6] p-4 space-y-2"
              >
                <div className="flex items-center justify-between border-b border-[#F2E9DE] pb-2">
                  <h4 className="text-sm font-bold text-[#332218]">
                    خروجی‌های پژوهشی (۶ سنجه تفکیک‌شده)
                  </h4>
                  <span className="text-base font-bold text-[#2E6F40]">
                    {toPersianDigits(workAnalytics.researchOutputs.finalIndependentOutputsCount)} نهایی مستقل
                  </span>
                </div>

                <div className="space-y-1 text-xs sm:text-sm">
                  <button
                    type="button"
                    data-testid="stat-metric-research-all"
                    onClick={() => triggerDrilldown('research_outputs')}
                    className={interactiveRowClass(!onSelectDrilldown)}
                  >
                    <span className="text-[#5C4636]">مطالب استخراج‌شده غیرردشده</span>
                    <strong className="inline-flex items-center gap-1">
                      {toPersianDigits(workAnalytics.researchOutputs.totalExtractedNonRejectedCount)} مورد
                      <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                    </strong>
                  </button>
                  <button
                    type="button"
                    data-testid="stat-metric-research-reviewed"
                    onClick={() => triggerDrilldown('research_reviewed')}
                    className={interactiveRowClass(!onSelectDrilldown)}
                  >
                    <span className="text-[#5C4636]">بررسی‌شده پژوهشی (اصلی + کارشناسی)</span>
                    <strong className="inline-flex items-center gap-1">
                      {toPersianDigits(workAnalytics.researchOutputs.totalReviewedResearchCount)} مورد
                      <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                    </strong>
                  </button>
                  <button
                    type="button"
                    data-testid="stat-metric-research-expert-approved"
                    onClick={() => triggerDrilldown('research_expert_approved')}
                    className={interactiveRowClass(!onSelectDrilldown)}
                  >
                    <span className="text-[#2E6F40] font-medium">تأییدشده کارشناسی / نهایی (خام)</span>
                    <strong className="text-[#2E6F40] inline-flex items-center gap-1">
                      {toPersianDigits(workAnalytics.researchOutputs.breakdownByStatus.expertApproved)} مورد
                      <ChevronLeft className="w-3.5 h-3.5 text-[#2E6F40]" />
                    </strong>
                  </button>
                  <button
                    type="button"
                    data-testid="stat-metric-research-final-independent"
                    onClick={() => triggerDrilldown('research_final_independent')}
                    className={interactiveRowClass(!onSelectDrilldown)}
                  >
                    <span className="text-[#2E6F40] font-bold">خروجی پژوهشی نهایی و مستقل (پس از تجمیع نسخه‌ها)</span>
                    <strong className="text-[#2E6F40] inline-flex items-center gap-1">
                      {toPersianDigits(workAnalytics.researchOutputs.finalIndependentOutputsCount)} خروجی
                      <ChevronLeft className="w-3.5 h-3.5 text-[#2E6F40]" />
                    </strong>
                  </button>
                  <button
                    type="button"
                    data-testid="stat-metric-research-drafts"
                    onClick={() => triggerDrilldown('research_drafts_incomplete')}
                    className={interactiveRowClass(!onSelectDrilldown)}
                  >
                    <span className="text-[#9C541C]">پیش‌نویس‌ها و موارد نیازمند تکمیل</span>
                    <strong className="text-[#9C541C] inline-flex items-center gap-1">
                      {toPersianDigits(workAnalytics.researchOutputs.draftsAndIncompleteCount)} مورد
                      <ChevronLeft className="w-3.5 h-3.5 text-[#9C541C]" />
                    </strong>
                  </button>
                  <button
                    type="button"
                    data-testid="stat-metric-research-rejected"
                    onClick={() => triggerDrilldown('research_rejected')}
                    className={interactiveRowClass(!onSelectDrilldown)}
                  >
                    <span className="text-[#5C4636]">مطالب ردشده</span>
                    <strong className="inline-flex items-center gap-1">
                      {toPersianDigits(workAnalytics.researchOutputs.breakdownByStatus.rejected)} مورد
                      <ChevronLeft className="w-3.5 h-3.5 text-[#9C826B]" />
                    </strong>
                  </button>
                </div>

                <div className="pt-2 border-t border-[#F2E9DE] text-[11px] text-[#78604E]">
                  نسخه‌های تکراری تجمیع‌شده: {toPersianDigits(workAnalytics.researchOutputs.duplicateVersionsCollapsedCount)} نسخه · پیش‌نویس و موارد بررسی‌نشده در شمارش خروجی نهایی مستقل وارد نمی‌شوند.
                </div>
              </div>

              {/* گزارش‌های مدیریتی نهایی و مستقل */}
              <div
                data-testid="stat-work-final-reports"
                className="rounded-xl border border-[#EFE4D6] p-4 space-y-3"
              >
                <div className="flex items-center justify-between border-b border-[#F2E9DE] pb-2">
                  <div>
                    <h4 className="text-sm font-bold text-[#332218]">
                      گزارش‌های مدیریتی (دفتر کل محلی نهایی)
                    </h4>
                    <div className="text-[11px] text-[#78604E]">
                      منبع مستقل: book_executive_finalized_reports_v1
                    </div>
                  </div>
                  <span className="text-lg font-bold text-[#6B3E26]">
                    {toPersianDigits(workAnalytics.managementReports.finalIndependentReportsCount)} گزارش نهایی
                  </span>
                </div>

                <div className="space-y-1 text-xs sm:text-sm">
                  <button
                    type="button"
                    data-testid="stat-metric-reports-final"
                    onClick={() => triggerDrilldown('management_reports')}
                    className={interactiveRowClass(!onSelectDrilldown)}
                  >
                    <span className="text-[#332218] font-medium">گزارش‌های مدیریتی نهایی و مستقل</span>
                    <strong className="text-[#6B3E26] inline-flex items-center gap-1">
                      {toPersianDigits(workAnalytics.managementReports.finalIndependentReportsCount)} گزارش
                      <ChevronLeft className="w-3.5 h-3.5 text-[#6B3E26]" />
                    </strong>
                  </button>

                  <button
                    type="button"
                    data-testid="stat-metric-reports-drafts"
                    onClick={() => triggerDrilldown('management_reports_drafts')}
                    className={interactiveRowClass(!onSelectDrilldown)}
                  >
                    <span className="text-[#9C541C]">پیش‌نویس‌های کنارگذشته‌شده از آمار نهایی</span>
                    <strong className="text-[#9C541C] inline-flex items-center gap-1">
                      {toPersianDigits(workAnalytics.managementReports.registryDraftsCount)} پیش‌نویس
                      <ChevronLeft className="w-3.5 h-3.5 text-[#9C541C]" />
                    </strong>
                  </button>

                  <div className="py-1.5 px-2.5 flex items-center justify-between text-xs text-[#5C4636]">
                    <span>تفکیک فرمت گزارش‌های نهایی (اکسل / بسته داده)</span>
                    <strong>
                      {toPersianDigits(workAnalytics.managementReports.byFileType.excel)} اکسل ·{' '}
                      {toPersianDigits(workAnalytics.managementReports.byFileType.json)} بسته داده
                    </strong>
                  </div>

                  <div className="py-1.5 px-2.5 flex items-center justify-between text-xs text-[#5C4636]">
                    <span>نسخه‌های ثبت‌شده / دریافت‌های خام تاریخچه</span>
                    <strong>
                      {toPersianDigits(workAnalytics.managementReports.registryTotalVersionsCount)} نسخه ·{' '}
                      {toPersianDigits(workAnalytics.managementReports.rawSuccessfulIssuancesCount)} دریافت خام
                    </strong>
                  </div>
                </div>

                {/* ابزار ایجاد گزارش نهایی، پیش‌نویس یا نسخه جدید روی گزارش موجود */}
                <div className="rounded-lg bg-[#FAF5EE] border border-[#EFE4D6] p-3 space-y-2.5">
                  <input
                    type="text"
                    data-testid="new-report-title-input"
                    value={newReportTitle}
                    onChange={(e) => setNewReportTitle(e.target.value)}
                    placeholder="عنوان گزارش مدیریتی (اختیاری)..."
                    className="w-full min-h-[38px] px-2.5 py-1.5 rounded-lg border border-[#D8C5B0] bg-white text-xs text-[#332218]"
                  />
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <button
                      type="button"
                      disabled={reportActionBusy}
                      data-testid="create-final-excel-report-btn"
                      onClick={() => void handleCreateRegistryReport('final_excel')}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#6B3E26] hover:bg-[#56311E] text-white font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>ثبت و دریافت اکسل نهایی</span>
                    </button>
                    <button
                      type="button"
                      disabled={reportActionBusy}
                      data-testid="create-final-json-report-btn"
                      onClick={() => void handleCreateRegistryReport('final_json')}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#6B3E26] bg-white hover:bg-[#FAF5EE] text-[#6B3E26] font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>ثبت بسته داده نهایی (JSON)</span>
                    </button>
                    <button
                      type="button"
                      disabled={reportActionBusy}
                      data-testid="create-draft-report-btn"
                      onClick={() => void handleCreateRegistryReport('draft')}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#D8C5B0] bg-white hover:bg-[#FAF5EE] text-[#5C4636] font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      <FilePlus2 className="w-3.5 h-3.5" />
                      <span>ذخیره پیش‌نویس</span>
                    </button>
                    {effectiveFinalizedRegistry.some(
                      (r) =>
                        r.category === 'management_report' && r.lifecycleStatus === 'final'
                    ) && (
                      <button
                        type="button"
                        disabled={reportActionBusy}
                        data-testid="append-version-latest-report-btn"
                        onClick={() => void handleAppendNewVersionToLatestReport()}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#2E6F40] bg-[#F1F8F3] hover:bg-[#E4F2E8] text-[#2E6F40] font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>صدور نسخه جدید روی آخرین گزارش</span>
                      </button>
                    )}
                  </div>
                  {reportPersistError && (
                    <div
                      data-testid="report-persist-error"
                      role="alert"
                      className="rounded-lg border border-[#D49B9B] bg-[#FDF2F2] px-3 py-2 text-[11px] text-[#8F2424] flex items-start justify-between gap-2"
                    >
                      <span>{reportPersistError}</span>
                      <button
                        type="button"
                        onClick={() => setReportPersistError(null)}
                        className="shrink-0 text-[#8F2424] hover:text-[#5F1414] cursor-pointer"
                        aria-label="بستن خطای ذخیره‌سازی"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {recentDraftsAndReports.length > 0 && (
                  <div className="divide-y divide-[#F0E6D8] border-t border-[#F2E9DE] pt-2 text-xs">
                    {recentDraftsAndReports.map((rep) => (
                      <div
                        key={rep.reportId}
                        className="py-2 flex flex-wrap items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-[#332218] truncate">
                            {rep.title} ({rep.reportId})
                          </div>
                          <div className="text-[11px] text-[#78604E]">
                            {rep.lifecycleStatus === 'final' ? 'نهایی' : 'پیش‌نویس'} · نسخه{' '}
                            {toPersianDigits(rep.currentVersion)} · {rep.updatedAtDisplay}
                          </div>
                        </div>
                        {rep.lifecycleStatus === 'draft' && (
                          <button
                            type="button"
                            disabled={reportActionBusy}
                            onClick={() => void handleFinalizeDraft(rep.reportId)}
                            className="min-h-[32px] px-2.5 py-1 rounded-md bg-[#2E6F40] hover:bg-[#235731] text-white text-[11px] font-bold cursor-pointer disabled:opacity-60"
                          >
                            نهایی‌سازی
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
