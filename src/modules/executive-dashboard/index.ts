export * from './types';
export * from './normalization';
export {
  selectLibraryAnalytics,
  evaluateBookCompletionAndActivityFlags,
  type EvaluatedBookStatusFlags,
} from './selectors/libraryAnalyticsSelector';
export {
  selectMartyrAnalytics,
  evaluateStrictTehranStatus,
} from './selectors/martyrAnalyticsSelector';
export {
  selectRelationAnalytics,
  classifySingleLinkCertainty,
  classifySingleLinkSourceAndExpertBucket,
  type RelationSourceOrExpertKey,
} from './selectors/relationAnalyticsSelector';
export { selectReviewQueue } from './selectors/reviewQueueSelector';
export { selectTemporalAudit } from './selectors/temporalAuditSelector';
export { selectExecutiveDashboardSummary } from './selectors/dashboardSummarySelector';
export {
  selectThreeCardOverview,
  selectThreeCardOverviewFromSummary,
} from './selectors/executiveThreeCardOverviewSelector';
export {
  buildExecutiveEntityProjection,
  selectDashboardBooksList,
  selectDashboardMartyrsList,
  selectDashboardRelationsList,
} from './selectors/entityDossiersSelector';
export {
  mapLightweightGolzarToRawInputs,
  buildExecutiveDashboardInputs,
} from './liveInputsAdapter';
export {
  buildManagementExcelPayload,
  exportExecutiveManagementExcel,
} from './export/managementExcelAdapter';
export {
  buildExecutiveDashboardExportV1,
  downloadExecutiveDashboardJsonV1,
} from './export/managementJsonExport';
export {
  EXECUTIVE_EXPORT_HISTORY_KEY,
  MAX_EXECUTIVE_EXPORT_HISTORY,
  appendExportHistoryRecordPure,
  deleteExportHistoryRecordPure,
  filterExportHistoryRecordsPure,
  loadExecutiveExportHistory,
  saveExecutiveExportHistory,
} from './export/exportHistoryStore';
export {
  EXECUTIVE_FINALIZED_REPORTS_KEY,
  upsertRegistryReportPure,
  registerNewReportVersionPure,
  finalizeRegistryReportPure,
  deleteRegistryReportPure,
  filterRegistryReportsPure,
  computeFinalizedRegistryStats,
  loadFinalizedReportsRegistry,
  saveFinalizedReportsRegistry,
  type UpsertRegistryReportInput,
  type AppendReportVersionInput,
} from './export/finalizedReportsRegistryStore';
export {
  selectDrilldownData,
  DRILLDOWN_META_MAP,
  type DrilldownSelectionResult,
  type DrilldownRelationRow,
  type DrilldownWorkRow,
  type DrilldownResearchOutputRow,
  type DrilldownActivityLogRow,
  type DrilldownBankMartyrRow,
} from './selectors/drilldownListsSelector';
export {
  selectFinalizedResearchOutputsSummary,
  selectFinalizedManagementReportsSummary,
  selectActivityLogSummary,
  selectWorkAndOutputsDetailedAnalytics,
  filterAuditLogEntriesPure,
  buildStatisticalQueryAnswers,
  answerCustomStatisticalQuestion,
  computeUnifiedStatisticsSearch,
  type AuditLogFilterOptions,
  type StatisticalQueryAnswer,
  type CustomStatisticalQuestionResult,
  type UnifiedSearchPreview,
} from './selectors/detailedStatisticsSelector';
export {
  ExecutiveDashboardView,
  DEFAULT_EXECUTIVE_DASHBOARD_STATE,
  type ExecutiveDashboardViewState,
  type ExecutiveDashboardSection,
  type DashboardBookFilterKey,
  type DashboardMartyrFilterKey,
  type DashboardDossierStackEntry,
} from './components/ExecutiveDashboardView';
export { OverviewDonutChart, type DonutChartSegment } from './components/OverviewDonutChart';
export { ExecutiveOverviewCards } from './components/ExecutiveOverviewCards';
export { DashboardDrilldownListView } from './components/DashboardDrilldownListView';
export { StatisticsAndReportsRouteView } from './components/StatisticsAndReportsRouteView';
