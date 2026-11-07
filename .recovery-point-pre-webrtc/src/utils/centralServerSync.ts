import {
  AuditLogEntry,
  BookCopyRecord,
  BookMartyrLinkRecord,
  CustomMartyrRecord,
  ExtractedContentItem,
  FieldAuditRecord,
  MultiMartyrGroupAudit,
  PendingReviewItem,
  SmartSearchSuggestion,
} from '../data/markazAsnadData';
import { RejectedSuggestionRecord } from './backupService';

const TOMBSTONES_STORAGE_KEY = 'book_deleted_tombstones_v1';

export interface CentralSyncState {
  updatedAt?: number;
  auditRecords: Record<string, FieldAuditRecord>;
  bookCopies: BookCopyRecord[];
  customMartyrs: CustomMartyrRecord[];
  smartSuggestions: SmartSearchSuggestion[];
  multiMartyrGroups: MultiMartyrGroupAudit[];
  extractedItems: ExtractedContentItem[];
  links: BookMartyrLinkRecord[];
  pendingReviews: PendingReviewItem[];
  auditLog: AuditLogEntry[];
  rejectedSuggestionsArchive: RejectedSuggestionRecord[];
  deletedTombstones?: Record<string, number>;
}

export function getDeletedTombstones(): Record<string, number> {
  try {
    const raw = localStorage.getItem(TOMBSTONES_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) || {};
    }
  } catch {
    // ignore
  }
  return {};
}

export function saveDeletedTombstones(map: Record<string, number>): void {
  try {
    localStorage.setItem(TOMBSTONES_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function recordDeletedTombstone(prefix: string, id: string): void {
  const map = getDeletedTombstones();
  const now = Date.now();
  map[`${prefix}:${id}`] = now;
  map[id] = now;
  saveDeletedTombstones(map);
}

export async function syncWithCentralServer(
  localState: CentralSyncState
): Promise<{
  ok: boolean;
  serverTime?: number;
  totalAuditRecords?: number;
  state?: CentralSyncState;
  error?: string;
}> {
  try {
    const tombstones = {
      ...getDeletedTombstones(),
      ...(localState.deletedTombstones || {}),
    };

    const response = await fetch('./api/central-sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...localState,
        deletedTombstones: tombstones,
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `HTTP ${response.status}`,
      };
    }

    const json = await response.json();
    if (json && json.ok && json.state) {
      if (json.state.deletedTombstones) {
        saveDeletedTombstones(json.state.deletedTombstones);
      }
      return {
        ok: true,
        serverTime: json.serverTime,
        totalAuditRecords: json.totalAuditRecords,
        state: json.state as CentralSyncState,
      };
    }

    return { ok: false, error: json?.error || 'پاسخ نامعتبر از سرور مرکزی' };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
