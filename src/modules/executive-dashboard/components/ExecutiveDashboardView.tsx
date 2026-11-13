import React, { useEffect, useMemo, useState } from 'react';
import { loadExecutiveExportHistory } from '../export/exportHistoryStore';
import { selectExecutiveDashboardSummary } from '../selectors/dashboardSummarySelector';
import { selectThreeCardOverviewFromSummary } from '../selectors/executiveThreeCardOverviewSelector';
import type {
  ExecutiveDashboardInputs,
  ExecutiveDashboardReadiness,
  ExecutiveDashboardSubView,
  RelationCertaintyBucket,
} from '../types';
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
  onOpenDetailedReports: () => void;
  onRequestLoadGolzarBank?: () => void;
}

/**
 * نمای اصلی داشبورد مدیریتی مرکز اسناد
 * - ورود مستقیم و بدون صفحه واسط به نمای سه‌کادره (کتابخانه / شهدا / وضعیت کار و خروجی‌ها)
 * - اتصال دکمه «آمار و گزارش‌های تفصیلی» به مسیر مستقل StatisticsAndReportsRouteView
 */
export const ExecutiveDashboardView: React.FC<ExecutiveDashboardViewProps> = ({
  inputs,
  viewState,
  readiness,
  onOpenDetailedReports,
  onRequestLoadGolzarBank,
}) => {
  const summary = useMemo(() => selectExecutiveDashboardSummary(inputs), [inputs]);
  const isGolzarLoaded = summary.martyrs.officialBank.hasOfficialBankLoaded;

  const [exportHistoryCount, setExportHistoryCount] = useState<number>(0);

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
    () => selectThreeCardOverviewFromSummary(summary, exportHistoryCount),
    [summary, exportHistoryCount]
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
          setExportHistoryCount(list.length);
        }
      })
      .catch(() => {
        if (mounted) setExportHistoryCount(0);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (viewState.scrollTop > 0 && typeof window !== 'undefined') {
      const targetY = viewState.scrollTop;
      const timer = window.setTimeout(() => {
        window.scrollTo({ top: targetY, behavior: 'auto' });
      }, 40);
      return () => window.clearTimeout(timer);
    }
  }, []);

  return (
    <div data-testid="executive-dashboard-view">
      <ExecutiveOverviewCards
        overview={threeCardOverview}
        readiness={effectiveReadiness}
        onOpenDetailedReports={onOpenDetailedReports}
      />
    </div>
  );
};
