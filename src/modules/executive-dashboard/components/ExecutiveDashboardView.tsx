import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { registerInnerBackStep } from '../../../utils/navigationHistory';
import { loadExecutiveExportHistory } from '../export/exportHistoryStore';
import { exportExecutiveManagementExcel } from '../export/managementExcelAdapter';
import { downloadExecutiveDashboardJsonV1 } from '../export/managementJsonExport';
import { selectDrilldownData } from '../selectors/drilldownListsSelector';
import { buildExecutiveEntityProjection } from '../selectors/entityDossiersSelector';
import { selectThreeCardOverviewFromSummary } from '../selectors/executiveThreeCardOverviewSelector';
import type {
  DashboardBookListItem,
  DashboardDrilldownKey,
  DashboardMartyrListItem,
  ExecutiveDashboardInputs,
  ExecutiveDashboardReadiness,
  ExecutiveDashboardSubView,
  ExecutiveExportHistoryRecord,
  RelationCertaintyBucket,
} from '../types';
import { DashboardDrilldownListView } from './DashboardDrilldownListView';
import { ExecutiveOverviewCards } from './ExecutiveOverviewCards';

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
  activeDrilldown: DashboardDrilldownKey | null;
  drilldownSearch: string;
  drilldownSubFilter: string;
  drilldownScrollTop: number;
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
  activeDrilldown: null,
  drilldownSearch: '',
  drilldownSubFilter: 'all',
  drilldownScrollTop: 0,
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
  onOpenDetailedReports: () => void;
  onOpenOriginalBookRecord: (
    book: DashboardBookListItem,
    sourceDrilldown: DashboardDrilldownKey
  ) => void;
  onOpenOriginalMartyrRecord: (
    martyr: DashboardMartyrListItem,
    sourceDrilldown: DashboardDrilldownKey
  ) => void;
  onNotify?: (msg: string, type?: 'success' | 'warning') => void;
  onRequestLoadGolzarBank?: () => void;
}

/**
 * نمای اصلی داشبورد مدیریتی مرکز اسناد
 * - ورود مستقیم و بدون صفحه واسط به نمای سه‌کادره (کتابخانه / شهدا / وضعیت کار و خروجی‌ها)
 * - مسیرهای تعاملی ورود به فهرست زنده هر شاخص و بازکردن پرونده واقعی کتاب/شهید با بازگشت دوطرفه
 * - اتصال دکمه «آمار و گزارش‌های تفصیلی» به مسیر مستقل StatisticsAndReportsRouteView
 */
export const ExecutiveDashboardView: React.FC<ExecutiveDashboardViewProps> = ({
  inputs,
  viewState,
  readiness,
  onUpdateViewState,
  onOpenDetailedReports,
  onOpenOriginalBookRecord,
  onOpenOriginalMartyrRecord,
  onNotify,
  onRequestLoadGolzarBank,
}) => {
  const projection = useMemo(() => buildExecutiveEntityProjection(inputs), [inputs]);
  const summary = projection.summary;
  const isGolzarLoaded = summary.martyrs.officialBank.hasOfficialBankLoaded;

  const [exportHistory, setExportHistory] = useState<ExecutiveExportHistoryRecord[]>([]);

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
    () => selectThreeCardOverviewFromSummary(summary, exportHistory, inputs.extractedItems),
    [summary, exportHistory, inputs.extractedItems]
  );

  const drilldownSelection = useMemo(
    () =>
      viewState.activeDrilldown
        ? selectDrilldownData(viewState.activeDrilldown, inputs, projection, exportHistory)
        : null,
    [viewState.activeDrilldown, inputs, projection, exportHistory]
  );

  useEffect(() => {
    if (!isGolzarLoaded && onRequestLoadGolzarBank) {
      onRequestLoadGolzarBank();
    }
  }, [isGolzarLoaded, onRequestLoadGolzarBank]);

  useEffect(() => {
    let mounted = true;
    loadExecutiveExportHistory()
      .then((list) => {
        if (mounted) {
          setExportHistory(list);
        }
      })
      .catch(() => {
        if (mounted) setExportHistory([]);
      });
    return () => {
      mounted = false;
    };
  }, [viewState.activeDrilldown]);

  const handleBackFromDrilldown = useCallback(() => {
    onUpdateViewState({
      activeDrilldown: null,
      drilldownSearch: '',
      drilldownSubFilter: 'all',
      drilldownScrollTop: 0,
    });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [onUpdateViewState]);

  useEffect(() => {
    if (!viewState.activeDrilldown) return;
    return registerInnerBackStep('executive-dashboard-drilldown', handleBackFromDrilldown);
  }, [viewState.activeDrilldown, handleBackFromDrilldown]);

  useEffect(() => {
    if (!viewState.activeDrilldown && viewState.scrollTop > 0 && typeof window !== 'undefined') {
      const targetY = viewState.scrollTop;
      const timer = window.setTimeout(() => {
        window.scrollTo({ top: targetY, behavior: 'auto' });
      }, 40);
      return () => window.clearTimeout(timer);
    }
  }, [viewState.activeDrilldown, viewState.scrollTop]);

  const handleSelectDrilldown = (key: DashboardDrilldownKey) => {
    const overviewScroll =
      typeof window !== 'undefined'
        ? window.scrollY || document.documentElement.scrollTop || 0
        : 0;
    onUpdateViewState({
      activeDrilldown: key,
      drilldownSearch: '',
      drilldownSubFilter: 'all',
      drilldownScrollTop: 0,
      scrollTop: overviewScroll,
    });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleOpenBook = (book: DashboardBookListItem) => {
    if (!viewState.activeDrilldown) return;
    const currentScroll =
      typeof window !== 'undefined'
        ? window.scrollY || document.documentElement.scrollTop || 0
        : 0;
    onUpdateViewState({ drilldownScrollTop: currentScroll });
    onOpenOriginalBookRecord(book, viewState.activeDrilldown);
  };

  const handleOpenMartyr = (martyr: DashboardMartyrListItem) => {
    if (!viewState.activeDrilldown) return;
    const currentScroll =
      typeof window !== 'undefined'
        ? window.scrollY || document.documentElement.scrollTop || 0
        : 0;
    onUpdateViewState({ drilldownScrollTop: currentScroll });
    onOpenOriginalMartyrRecord(martyr, viewState.activeDrilldown);
  };

  const handleRegenerateReport = (record: ExecutiveExportHistoryRecord) => {
    if (record.fileType === 'excel') {
      const res = exportExecutiveManagementExcel(inputs);
      if (res.ok) {
        onNotify?.(`فایل اکسل مدیریتی (${res.fileName}) مجدداً تولید و دریافت شد.`, 'success');
      } else {
        onNotify?.(res.error || 'تولید مجدد فایل اکسل با خطا مواجه شد.', 'warning');
      }
      return;
    }
    const res = downloadExecutiveDashboardJsonV1(inputs, { projection });
    if (res.ok) {
      onNotify?.(`فایل JSON مدیریتی (${res.fileName}) مجدداً تولید و دریافت شد.`, 'success');
    } else {
      onNotify?.(res.error || 'تولید مجدد فایل JSON با خطا مواجه شد.', 'warning');
    }
  };

  return (
    <div data-testid="executive-dashboard-view">
      {drilldownSelection ? (
        <DashboardDrilldownListView
          selection={drilldownSelection}
          searchQuery={viewState.drilldownSearch}
          subFilter={viewState.drilldownSubFilter}
          initialScrollTop={viewState.drilldownScrollTop}
          onChangeSearch={(q) => onUpdateViewState({ drilldownSearch: q, drilldownScrollTop: 0 })}
          onChangeSubFilter={(f) =>
            onUpdateViewState({ drilldownSubFilter: f, drilldownScrollTop: 0 })
          }
          onBackToDashboard={handleBackFromDrilldown}
          onOpenOriginalBook={handleOpenBook}
          onOpenOriginalMartyr={handleOpenMartyr}
          onRegenerateReport={handleRegenerateReport}
        />
      ) : (
        <ExecutiveOverviewCards
          overview={threeCardOverview}
          readiness={effectiveReadiness}
          onOpenDetailedReports={onOpenDetailedReports}
          onSelectDrilldown={handleSelectDrilldown}
        />
      )}
    </div>
  );
};
