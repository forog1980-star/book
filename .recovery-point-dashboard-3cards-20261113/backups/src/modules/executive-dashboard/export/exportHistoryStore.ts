import {
  hydrateOperationalKey,
  saveOperationalData,
} from '../../../utils/indexedDbStorage';
import type { ExecutiveExportHistoryRecord } from '../types';

export const EXECUTIVE_EXPORT_HISTORY_KEY = 'book_executive_export_history_v1';
export const MAX_EXECUTIVE_EXPORT_HISTORY = 200;

/**
 * عملیات خالص (قابل آزمون در Node و مرورگر) برای افزودن سابقه جدید با سقف ۲۰۰ رکورد بدون تغییر سایر کلیدهای سامانه.
 */
export function appendExportHistoryRecordPure(
  current: ExecutiveExportHistoryRecord[],
  record: ExecutiveExportHistoryRecord
): ExecutiveExportHistoryRecord[] {
  const filtered = current.filter((item) => item.exportId !== record.exportId);
  return [record, ...filtered].slice(0, MAX_EXECUTIVE_EXPORT_HISTORY);
}

/**
 * حذف تک‌رکورد سابقه خروجی به‌صورت خالص بدون هیچ اثری بر auditLog یا آمار کتاب/شهید.
 */
export function deleteExportHistoryRecordPure(
  current: ExecutiveExportHistoryRecord[],
  exportId: string
): ExecutiveExportHistoryRecord[] {
  return current.filter((item) => item.exportId !== exportId);
}

/**
 * فیلتر سوابق خروجی مدیریتی بر اساس نوع فایل و متن جست‌وجو.
 */
export function filterExportHistoryRecordsPure(
  records: ExecutiveExportHistoryRecord[],
  filter: {
    fileType?: 'all' | 'excel' | 'json';
    query?: string;
  }
): ExecutiveExportHistoryRecord[] {
  const typeFilter = filter.fileType || 'all';
  const q = (filter.query || '').trim().toLowerCase();
  return records.filter((rec) => {
    if (typeFilter !== 'all' && rec.fileType !== typeFilter) return false;
    if (!q) return true;
    return (
      rec.fileName.toLowerCase().includes(q) ||
      rec.appliedFiltersSummary.toLowerCase().includes(q) ||
      rec.timestampDisplay.toLowerCase().includes(q)
    );
  });
}

export async function loadExecutiveExportHistory(): Promise<ExecutiveExportHistoryRecord[]> {
  const res = await hydrateOperationalKey<ExecutiveExportHistoryRecord[]>(
    EXECUTIVE_EXPORT_HISTORY_KEY,
    []
  );
  return Array.isArray(res.value) ? res.value.slice(0, MAX_EXECUTIVE_EXPORT_HISTORY) : [];
}

export async function saveExecutiveExportHistory(
  records: ExecutiveExportHistoryRecord[]
): Promise<{ ok: boolean; savedCount: number; error?: string }> {
  const capped = records.slice(0, MAX_EXECUTIVE_EXPORT_HISTORY);
  const res = await saveOperationalData(EXECUTIVE_EXPORT_HISTORY_KEY, capped);
  return {
    ok: res.ok,
    savedCount: capped.length,
    error: res.error,
  };
}
