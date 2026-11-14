import { hydrateOperationalKey, saveOperationalData } from '../../../utils/indexedDbStorage';
import { normalizePersian } from '../normalization';
import type {
  FinalizedOutputLifecycleStatus,
  FinalizedReportCategory,
  FinalizedReportRegistryRecord,
  FinalizedReportVersionEntry,
} from '../types';

export const EXECUTIVE_FINALIZED_REPORTS_KEY = 'book_executive_finalized_reports_v1';
export const MAX_FINALIZED_REPORTS_REGISTRY = 500;

function nowIsoSafe(explicitIso?: string): string {
  return explicitIso || new Date().toISOString();
}

function nowPersianDisplaySafe(explicitDisplay?: string): string {
  if (explicitDisplay) return explicitDisplay;
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

export interface UpsertRegistryReportInput {
  reportId?: string;
  category?: FinalizedReportCategory;
  title: string;
  lifecycleStatus?: FinalizedOutputLifecycleStatus;
  scope?: FinalizedReportRegistryRecord['scope'];
  appliedFiltersSummary?: string;
  notes?: string;
  timestampIso?: string;
  timestampDisplay?: string;
  initialVersion?: Omit<FinalizedReportVersionEntry, 'versionNumber'>;
}

export interface AppendReportVersionInput {
  reportId: string;
  fileName: string;
  fileType: 'excel' | 'json';
  recordCount: number;
  relatedExportId?: string;
  timestampIso?: string;
  timestampDisplay?: string;
}

function generateNextReportId(existing: FinalizedReportRegistryRecord[]): string {
  const existingSet = new Set(existing.map((r) => r.reportId));
  let counter = existing.length + 1;
  while (existingSet.has(`REP-${String(counter).padStart(4, '0')}`)) {
    counter += 1;
  }
  return `REP-${String(counter).padStart(4, '0')}`;
}

/**
 * ایجاد پیش‌نویس یا ثبت گزارش/خروجی مستقل جدید (یا افزودن نسخه جدید روی همان شناسه پایدار).
 * تضمین می‌کند که بازتولید یا ویرایش نسخه جدید روی یک شناسه واحد، شمارش خروجی‌های مستقل را افزایش نمی‌دهد.
 */
export function upsertRegistryReportPure(
  existing: FinalizedReportRegistryRecord[],
  input: UpsertRegistryReportInput
): { records: FinalizedReportRegistryRecord[]; savedRecord: FinalizedReportRegistryRecord } {
  const tsIso = nowIsoSafe(input.timestampIso);
  const tsDisplay = nowPersianDisplaySafe(input.timestampDisplay);
  const targetId = input.reportId?.trim();
  const matchedIdx = targetId ? existing.findIndex((r) => r.reportId === targetId) : -1;

  if (matchedIdx >= 0) {
    const current = existing[matchedIdx];
    const nextVersionNumber = Math.max(current.currentVersion, current.versions.length) + 1;
    const nextVersions = input.initialVersion
      ? [
          {
            ...input.initialVersion,
            versionNumber: nextVersionNumber,
          },
          ...current.versions,
        ]
      : current.versions;

    const nextLifecycle = input.lifecycleStatus ?? current.lifecycleStatus;
    const updated: FinalizedReportRegistryRecord = {
      ...current,
      title: input.title.trim() || current.title,
      lifecycleStatus: nextLifecycle,
      appliedFiltersSummary: input.appliedFiltersSummary ?? current.appliedFiltersSummary,
      notes: input.notes ?? current.notes,
      currentVersion: input.initialVersion ? nextVersionNumber : current.currentVersion,
      finalizedAtIso:
        nextLifecycle === 'final' ? current.finalizedAtIso || tsIso : undefined,
      finalizedAtDisplay:
        nextLifecycle === 'final' ? current.finalizedAtDisplay || tsDisplay : undefined,
      updatedAtIso: tsIso,
      updatedAtDisplay: tsDisplay,
      versions: nextVersions,
    };

    const next = [...existing];
    next[matchedIdx] = updated;
    return { records: next.slice(0, MAX_FINALIZED_REPORTS_REGISTRY), savedRecord: updated };
  }

  const reportId = targetId || generateNextReportId(existing);
  const lifecycleStatus: FinalizedOutputLifecycleStatus = input.lifecycleStatus || 'draft';
  const versions: FinalizedReportVersionEntry[] = input.initialVersion
    ? [{ ...input.initialVersion, versionNumber: 1 }]
    : [];

  const created: FinalizedReportRegistryRecord = {
    reportId,
    category: input.category || 'management_report',
    title: input.title.trim() || 'گزارش مدیریتی مرکز اسناد',
    lifecycleStatus,
    scope: input.scope || 'dashboard_management',
    appliedFiltersSummary: input.appliedFiltersSummary || 'کل داده‌های زنده سامانه',
    currentVersion: Math.max(1, versions.length),
    createdAtIso: tsIso,
    createdAtDisplay: tsDisplay,
    finalizedAtIso: lifecycleStatus === 'final' ? tsIso : undefined,
    finalizedAtDisplay: lifecycleStatus === 'final' ? tsDisplay : undefined,
    updatedAtIso: tsIso,
    updatedAtDisplay: tsDisplay,
    notes: input.notes,
    versions,
  };

  return {
    records: [created, ...existing].slice(0, MAX_FINALIZED_REPORTS_REGISTRY),
    savedRecord: created,
  };
}

/**
 * ثبت نسخه جدید / دریافت مجدد فایل روی همان شناسه گزارش مستقل (بدون ایجاد رکورد مستقل جدید).
 */
export function registerNewReportVersionPure(
  existing: FinalizedReportRegistryRecord[],
  input: AppendReportVersionInput
): { records: FinalizedReportRegistryRecord[]; updatedRecord: FinalizedReportRegistryRecord | null } {
  const idx = existing.findIndex((r) => r.reportId === input.reportId);
  if (idx < 0) {
    return { records: existing, updatedRecord: null };
  }
  const current = existing[idx];
  const tsIso = nowIsoSafe(input.timestampIso);
  const tsDisplay = nowPersianDisplaySafe(input.timestampDisplay);
  const nextVersionNumber = Math.max(current.currentVersion, current.versions.length) + 1;

  const entry: FinalizedReportVersionEntry = {
    versionNumber: nextVersionNumber,
    exportedAtIso: tsIso,
    exportedAtDisplay: tsDisplay,
    fileName: input.fileName,
    fileType: input.fileType,
    recordCount: input.recordCount,
    relatedExportId: input.relatedExportId,
  };

  const updated: FinalizedReportRegistryRecord = {
    ...current,
    currentVersion: nextVersionNumber,
    updatedAtIso: tsIso,
    updatedAtDisplay: tsDisplay,
    versions: [entry, ...current.versions],
  };

  const next = [...existing];
  next[idx] = updated;
  return { records: next, updatedRecord: updated };
}

/**
 * تبدیل صریح یک گزارش پیش‌نویس به «نهایی و مستقل».
 */
export function finalizeRegistryReportPure(
  existing: FinalizedReportRegistryRecord[],
  reportId: string,
  timestampIso?: string,
  timestampDisplay?: string
): { records: FinalizedReportRegistryRecord[]; finalizedRecord: FinalizedReportRegistryRecord | null } {
  const idx = existing.findIndex((r) => r.reportId === reportId);
  if (idx < 0) {
    return { records: existing, finalizedRecord: null };
  }
  const current = existing[idx];
  const tsIso = nowIsoSafe(timestampIso);
  const tsDisplay = nowPersianDisplaySafe(timestampDisplay);
  const updated: FinalizedReportRegistryRecord = {
    ...current,
    lifecycleStatus: 'final',
    finalizedAtIso: current.finalizedAtIso || tsIso,
    finalizedAtDisplay: current.finalizedAtDisplay || tsDisplay,
    updatedAtIso: tsIso,
    updatedAtDisplay: tsDisplay,
  };

  const next = [...existing];
  next[idx] = updated;
  return { records: next, finalizedRecord: updated };
}

export function deleteRegistryReportPure(
  existing: FinalizedReportRegistryRecord[],
  reportId: string
): FinalizedReportRegistryRecord[] {
  return existing.filter((r) => r.reportId !== reportId);
}

export function filterRegistryReportsPure(
  records: FinalizedReportRegistryRecord[],
  options: {
    query?: string;
    category?: 'all' | FinalizedReportCategory;
    lifecycleStatus?: 'all' | FinalizedOutputLifecycleStatus;
  } = {}
): FinalizedReportRegistryRecord[] {
  const nq = normalizePersian(options.query || '');
  return records.filter((rec) => {
    if (options.category && options.category !== 'all' && rec.category !== options.category) {
      return false;
    }
    if (
      options.lifecycleStatus &&
      options.lifecycleStatus !== 'all' &&
      rec.lifecycleStatus !== options.lifecycleStatus
    ) {
      return false;
    }
    if (!nq) return true;
    const hay = normalizePersian(
      `${rec.reportId} ${rec.title} ${rec.appliedFiltersSummary} ${rec.notes || ''} ${rec.versions
        .map((v) => v.fileName)
        .join(' ')}`
    );
    return hay.includes(nq);
  });
}

export function computeFinalizedRegistryStats(
  records: FinalizedReportRegistryRecord[],
  category: FinalizedReportCategory = 'management_report'
): {
  finalizedIndependentCount: number;
  draftsExcludedCount: number;
  totalVersionsCount: number;
  byFileType: { excel: number; json: number };
  latestFinalizedAtDisplay: string | null;
} {
  const matching = records.filter((r) => r.category === category);
  let finalizedIndependentCount = 0;
  let draftsExcludedCount = 0;
  let totalVersionsCount = 0;
  let excel = 0;
  let json = 0;
  let latestFinalizedAtDisplay: string | null = null;

  for (const rec of matching) {
    totalVersionsCount += Math.max(1, rec.currentVersion || 1, rec.versions.length);
    if (rec.lifecycleStatus !== 'final') {
      draftsExcludedCount += 1;
      continue;
    }
    finalizedIndependentCount += 1;
    if (!latestFinalizedAtDisplay) {
      latestFinalizedAtDisplay = rec.finalizedAtDisplay || rec.updatedAtDisplay || null;
    }
    const latestFileType = rec.versions[0]?.fileType;
    if (latestFileType === 'excel') excel += 1;
    else if (latestFileType === 'json') json += 1;
  }

  return {
    finalizedIndependentCount,
    draftsExcludedCount,
    totalVersionsCount,
    byFileType: { excel, json },
    latestFinalizedAtDisplay,
  };
}

export async function loadFinalizedReportsRegistry(): Promise<FinalizedReportRegistryRecord[]> {
  try {
    const data = await hydrateOperationalKey<FinalizedReportRegistryRecord[]>(
      EXECUTIVE_FINALIZED_REPORTS_KEY,
      []
    );
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function saveFinalizedReportsRegistry(
  records: FinalizedReportRegistryRecord[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await saveOperationalData(
      EXECUTIVE_FINALIZED_REPORTS_KEY,
      records.slice(0, MAX_FINALIZED_REPORTS_REGISTRY)
    );
    return { ok: res.ok, error: res.error };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
