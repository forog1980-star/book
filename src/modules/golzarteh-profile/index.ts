export type {
  GolzartehMatchBasis,
  GolzartehPhotoCategory,
  GolzartehPhotoItem,
  GolzartehIndexRecord,
  GolzartehEnrichedDetail,
  MartyrLocalProfileOverride,
  GolzartehCompactIndexFile,
  GolzartehProfilesBundleFile,
  ResolvedMartyrComprehensiveProfile
} from './types';

export {
  normalizeGolzartehPersian,
  normalizeGolzartehPersonName,
  compactNameKey,
  normalizeGraveToken,
  areTombCoordsSame,
  scoreGolzartehCandidateMatch,
  matchGolzartehEntryByNameAndFather
} from './matcher';

export {
  GOLZARTEH_MODULE_CONFIG,
  GOLZARTEH_OVERRIDES_STORAGE_KEY,
  getGolzartehDatasetState,
  loadGolzartehDataset,
  subscribeGolzartehDataset,
  buildGolzartehFileUrl,
  buildGolzartehOfficialPageUrl,
  loadAllMartyrProfileOverrides,
  saveMartyrProfileOverride,
  getMatchBasisLabelFa,
  resolveComprehensiveMartyrProfile,
  buildBidirectionalGolzartehSyncPackage
} from './loader';

export type { GolzartehDatasetRuntimeState, ResolveMartyrInput } from './loader';

export {
  GOLZARTEH_BG_SYNC_QUEUE_KEY,
  GOLZARTEH_SYNC_TAG,
  GOLZARTEH_SYNC_ENDPOINT_STORAGE_KEY,
  computeProfileFingerprint,
  determineChangePriority,
  loadSyncQueue,
  saveSyncQueue,
  subscribeBackgroundSync,
  mergeMartyrChangeWithoutCorruption,
  enqueueMartyrProfileChange,
  getBackgroundSyncSummary,
  flushGolzartehBackgroundSync,
  initGolzartehBackgroundSyncScheduler
} from './backgroundSync';

export type {
  SyncPriority,
  SyncItemStatus,
  MartyrProfileSyncBaseSnapshot,
  MartyrProfileSyncQueueItem,
  SafeMergeResult,
  BackgroundSyncSummary
} from './backgroundSync';

export { GolzartehComprehensiveProfilePanel } from './GolzartehProfileView';
export type { GolzartehProfileBrowseNav } from './GolzartehProfileView';
