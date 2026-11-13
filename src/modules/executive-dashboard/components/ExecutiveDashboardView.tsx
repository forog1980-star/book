import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toPersianDigits } from '../../../data/markazAsnadData';
import {
  appendExportHistoryRecordPure,
  deleteExportHistoryRecordPure,
  loadExecutiveExportHistory,
  saveExecutiveExportHistory,
} from '../export/exportHistoryStore';
import { exportExecutiveManagementExcel } from '../export/managementExcelAdapter';
import { downloadExecutiveDashboardJsonV1 } from '../export/managementJsonExport';
import { buildExecutiveEntityProjection } from '../selectors/entityDossiersSelector';
import { selectThreeCardOverviewFromSummary } from '../selectors/executiveThreeCardOverviewSelector';
import {
  RELATION_CERTAINTY_DISPLAY_LABELS,
  type DashboardBookListItem,
  type DashboardMartyrListItem,
  type ExecutiveDashboardInputs,
  type ExecutiveDashboardReadiness,
  type ExecutiveDashboardSubView,
  type ExecutiveExportHistoryRecord,
  type RelationCertaintyBucket,
} from '../types';
import { BookSummaryDossierModal } from './BookSummaryDossierModal';
import { ExecutiveDetailedReportsView } from './ExecutiveDetailedReportsView';
import { ExecutiveOverviewCards } from './ExecutiveOverviewCards';
import { MartyrSummaryDossierModal } from './MartyrSummaryDossierModal';

export type ExecutiveDashboardSection =
  | 'overview'
  | 'books'
  | 'martyrs'
  | 'relations'
  | 'warnings'
  | 'exports';

export type DashboardBookFilterKey =
  | 'all'
  | 'completed_without_ticket'
  | 'open_duplicate_ticket'
  | 'unreviewed'
  | 'has_named_martyr'
  | 'group_only'
  | 'has_any_link'
  | 'no_link';

export type DashboardMartyrFilterKey =
  | 'all'
  | 'confirmed'
  | 'needs_verification'
  | 'has_warning'
  | 'custom_martyrs';

export type DashboardDossierStackEntry = {
  type: 'book' | 'martyr';
  key: string;
};

export interface ExecutiveDashboardViewState {
  subView: ExecutiveDashboardSubView;
  activeSection: ExecutiveDashboardSection;
  bookSearch: string;
  bookFilter: DashboardBookFilterKey;
  martyrSearch: string;
  martyrFilter: DashboardMartyrFilterKey;
  relationSearch: string;
  relationCertaintyFilter: 'all' | RelationCertaintyBucket;
  dossierStack: DashboardDossierStackEntry[];
  scrollTop: number;
}

export const DEFAULT_EXECUTIVE_DASHBOARD_STATE: ExecutiveDashboardViewState = {
  subView: 'overview',
  activeSection: 'overview',
  bookSearch: '',
  bookFilter: 'all',
  martyrSearch: '',
  martyrFilter: 'all',
  relationSearch: '',
  relationCertaintyFilter: 'all',
  dossierStack: [],
  scrollTop: 0,
};

interface ExecutiveDashboardViewProps {
  inputs: ExecutiveDashboardInputs;
  viewState: ExecutiveDashboardViewState;
  readiness?: ExecutiveDashboardReadiness;
  onUpdateViewState: (
    updater:
      | Partial<ExecutiveDashboardViewState>
      | ((prev: ExecutiveDashboardViewState) => ExecutiveDashboardViewState)
  ) => void;
  onOpenOriginalBookRecord: (book: DashboardBookListItem) => void;
  onOpenOriginalMartyrRecord: (martyr: DashboardMartyrListItem) => void;
  onRequestLoadGolzarBank?: () => void;
  onNotify: (msg: string, type?: 'success' | 'warning') => void;
}

function createExportHistoryId(): string {
  return `EXP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatNowDisplayFa(): string {
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

export const ExecutiveDashboardView: React.FC<ExecutiveDashboardViewProps> = ({
  inputs,
  viewState,
  readiness,
  onUpdateViewState,
  onOpenOriginalBookRecord,
  onOpenOriginalMartyrRecord,
  onRequestLoadGolzarBank,
  onNotify,
}) => {
  const projection = useMemo(() => buildExecutiveEntityProjection(inputs), [inputs]);
  const { summary, books, martyrs, relations } = projection;
  const isGolzarLoaded = summary.martyrs.officialBank.hasOfficialBankLoaded;

  const [exportHistory, setExportHistory] = useState<ExecutiveExportHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const effectiveReadiness: ExecutiveDashboardReadiness = useMemo(
    () =>
      readiness ?? {
        isStorageHydrated: true,
        workbookLoadState: 'loaded',
        workbookLoadError: null,
        golzarLoadState: isGolzarLoaded ? 'loaded' : 'loading',
        hasCachedOperationalData: false,
        onRetryLoadGolzar: onRequestLoadGolzarBank,
      },
    [readiness, isGolzarLoaded, onRequestLoadGolzarBank]
  );

  const threeCardOverview = useMemo(
    () => selectThreeCardOverviewFromSummary(summary, exportHistory.length),
    [summary, exportHistory.length]
  );

  // فراخوانی فوری بارگذاری بانک گلزار در صورت هنوز بارگذاری‌نشدن
  useEffect(() => {
    if (!isGolzarLoaded && onRequestLoadGolzarBank) {
      onRequestLoadGolzarBank();
    }
  }, [isGolzarLoaded, onRequestLoadGolzarBank]);

  // بازیابی سوابق خروجی مدیریتی از book_executive_export_history_v1
  useEffect(() => {
    let mounted = true;
    loadExecutiveExportHistory()
      .then((list) => {
        if (mounted) {
          setExportHistory(list);
          setHistoryLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setHistoryLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // بازیابی اسکرول هنگام بازگشت از پرونده اصلی کتاب یا شهید
  useEffect(() => {
    if (viewState.scrollTop > 0 && typeof window !== 'undefined') {
      const targetY = viewState.scrollTop;
      const timer = window.setTimeout(() => {
        window.scrollTo({ top: targetY, behavior: 'auto' });
      }, 40);
      return () => window.clearTimeout(timer);
    }
  }, []);

  const bookMap = useMemo(() => new Map(books.map((b) => [b.bookKey, b])), [books]);
  const martyrMap = useMemo(() => new Map(martyrs.map((m) => [m.martyrKey, m])), [martyrs]);

  const pushDossier = useCallback(
    (entry: DashboardDossierStackEntry) => {
      onUpdateViewState((prev) => ({
        ...prev,
        dossierStack: [...prev.dossierStack, entry],
      }));
    },
    [onUpdateViewState]
  );

  const popDossier = useCallback(() => {
    onUpdateViewState((prev) => ({
      ...prev,
      dossierStack: prev.dossierStack.slice(0, -1),
    }));
  }, [onUpdateViewState]);

  const captureScrollAndOpenOriginalBook = useCallback(
    (book: DashboardBookListItem) => {
      const scrollY = typeof window !== 'undefined' ? window.scrollY || 0 : 0;
      onUpdateViewState((prev) => ({ ...prev, scrollTop: scrollY }));
      onOpenOriginalBookRecord(book);
    },
    [onUpdateViewState, onOpenOriginalBookRecord]
  );

  const captureScrollAndOpenOriginalMartyr = useCallback(
    (martyr: DashboardMartyrListItem) => {
      const scrollY = typeof window !== 'undefined' ? window.scrollY || 0 : 0;
      onUpdateViewState((prev) => ({ ...prev, scrollTop: scrollY }));
      onOpenOriginalMartyrRecord(martyr);
    },
    [onUpdateViewState, onOpenOriginalMartyrRecord]
  );

  const getAppliedFilterSummaryText = useCallback((): string => {
    const parts: string[] = [];
    if (viewState.bookFilter !== 'all') parts.push(`فیلتر کتاب: ${viewState.bookFilter}`);
    if (viewState.martyrFilter !== 'all') parts.push(`فیلتر شهید: ${viewState.martyrFilter}`);
    if (viewState.relationCertaintyFilter !== 'all') {
      parts.push(
        `فیلتر قطعیت: ${RELATION_CERTAINTY_DISPLAY_LABELS[viewState.relationCertaintyFilter]}`
      );
    }
    if (viewState.bookSearch.trim()) parts.push(`جست‌وجوی کتاب: «${viewState.bookSearch.trim()}»`);
    return parts.length > 0 ? parts.join(' · ') : 'کل بانک اطلاعات پایه و عملیاتی داشبورد';
  }, [
    viewState.bookFilter,
    viewState.martyrFilter,
    viewState.relationCertaintyFilter,
    viewState.bookSearch,
  ]);

  const recordExportHistoryEntry = useCallback(
    async (entry: ExecutiveExportHistoryRecord) => {
      const nextList = appendExportHistoryRecordPure(exportHistory, entry);
      setExportHistory(nextList);
      await saveExecutiveExportHistory(nextList);
    },
    [exportHistory]
  );

  const handleExportExcel = useCallback(async () => {
    if (isExportingExcel) return;
    setIsExportingExcel(true);
    try {
      const res = exportExecutiveManagementExcel(inputs, {
        appliedFilterLabel: getAppliedFilterSummaryText(),
      });
      const rec: ExecutiveExportHistoryRecord = {
        exportId: createExportHistoryId(),
        fileName: res.fileName || 'گزارش_مدیریتی_داشبورد.xlsx',
        fileType: 'excel',
        exportScope: 'dashboard_management',
        timestampIso: new Date().toISOString(),
        timestampDisplay: formatNowDisplayFa(),
        recordCount: res.totalRowsExported,
        appliedFiltersSummary: getAppliedFilterSummaryText(),
        status: res.ok ? 'success' : 'failed',
        errorMessage: res.error,
      };
      await recordExportHistoryEntry(rec);
      if (res.ok) {
        onNotify(
          `فایل اکسل مدیریتی (${toPersianDigits(res.sheetsCount)} شیت استاندارد) تولید و در سابقه ثبت شد.`
        );
      } else {
        onNotify(`تولید خروجی اکسل با خطا مواجه شد: ${res.error || 'خطای نامشخص'}`, 'warning');
      }
    } finally {
      setIsExportingExcel(false);
    }
  }, [isExportingExcel, inputs, getAppliedFilterSummaryText, recordExportHistoryEntry, onNotify]);

  const handleExportJson = useCallback(async () => {
    const res = downloadExecutiveDashboardJsonV1(inputs, {
      appliedFilterNote: getAppliedFilterSummaryText(),
      projection,
    });
    const rec: ExecutiveExportHistoryRecord = {
      exportId: createExportHistoryId(),
      fileName: res.fileName,
      fileType: 'json',
      exportScope: 'dashboard_management',
      timestampIso: new Date().toISOString(),
      timestampDisplay: formatNowDisplayFa(),
      recordCount: res.recordCount,
      appliedFiltersSummary: getAppliedFilterSummaryText(),
      status: res.ok ? 'success' : 'failed',
      errorMessage: res.error,
    };
    await recordExportHistoryEntry(rec);
    if (res.ok) {
      onNotify('فایل JSON مدیریتی (ExecutiveDashboardExportV1) دانلود و در سابقه ثبت شد.');
    } else {
      onNotify(`خروجی JSON با خطا مواجه شد: ${res.error || 'خطای نامشخص'}`, 'warning');
    }
  }, [inputs, getAppliedFilterSummaryText, projection, recordExportHistoryEntry, onNotify]);

  const handleDeleteHistoryItem = useCallback(
    async (exportId: string) => {
      const nextList = deleteExportHistoryRecordPure(exportHistory, exportId);
      setExportHistory(nextList);
      await saveExecutiveExportHistory(nextList);
      onNotify('رکورد سابقه خروجی از تاریخچه داشبورد حذف شد.');
    },
    [exportHistory, onNotify]
  );

  const openDetailedReports = useCallback(() => {
    onUpdateViewState({ subView: 'detailed_reports', scrollTop: 0 });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [onUpdateViewState]);

  const backToOverview = useCallback(() => {
    onUpdateViewState({ subView: 'overview', dossierStack: [], scrollTop: 0 });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [onUpdateViewState]);

  const topDossier = viewState.dossierStack[viewState.dossierStack.length - 1] || null;
  const activeBookDossier =
    topDossier?.type === 'book' ? bookMap.get(topDossier.key) : undefined;
  const activeMartyrDossier =
    topDossier?.type === 'martyr' ? martyrMap.get(topDossier.key) : undefined;

  return (
    <div data-testid="executive-dashboard-view">
      {viewState.subView === 'overview' ? (
        <ExecutiveOverviewCards
          overview={threeCardOverview}
          readiness={effectiveReadiness}
          onOpenDetailedReports={openDetailedReports}
        />
      ) : (
        <ExecutiveDetailedReportsView
          summary={summary}
          books={books}
          martyrs={martyrs}
          relations={relations}
          bookMap={bookMap}
          martyrMap={martyrMap}
          viewState={viewState}
          exportHistory={exportHistory}
          historyLoading={historyLoading}
          isExportingExcel={isExportingExcel}
          onUpdateViewState={onUpdateViewState}
          onBackToOverview={backToOverview}
          onExportExcel={handleExportExcel}
          onExportJson={handleExportJson}
          onDeleteHistoryItem={handleDeleteHistoryItem}
          onPushDossier={pushDossier}
          onRequestLoadGolzarBank={effectiveReadiness.onRetryLoadGolzar || onRequestLoadGolzarBank}
        />
      )}

      {/* Two-way Summary Dossier Modals */}
      {activeBookDossier && (
        <BookSummaryDossierModal
          book={activeBookDossier}
          canStepBackInStack={viewState.dossierStack.length > 1}
          onStepBackOrClose={popDossier}
          onSelectMartyr={(mKey) => pushDossier({ type: 'martyr', key: mKey })}
          onOpenOriginalBookRecord={captureScrollAndOpenOriginalBook}
        />
      )}

      {activeMartyrDossier && (
        <MartyrSummaryDossierModal
          martyr={activeMartyrDossier}
          canStepBackInStack={viewState.dossierStack.length > 1}
          onStepBackOrClose={popDossier}
          onSelectBook={(bKey) => pushDossier({ type: 'book', key: bKey })}
          onOpenOriginalMartyrRecord={captureScrollAndOpenOriginalMartyr}
        />
      )}
    </div>
  );
};
