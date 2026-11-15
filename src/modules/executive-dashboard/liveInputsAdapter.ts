import type {
  AuditLogEntry,
  BookCopyRecord,
  BookMartyrLinkRecord,
  CustomMartyrRecord,
  ExtractedContentItem,
  FieldAuditRecord,
  PendingReviewItem,
  ReferenceCatalogRow,
  SmartSearchSuggestion,
} from '../../data/markazAsnadData';
import type { LightweightGolzarMartyr } from '../../utils/martyrsCrossMatchEngine';
import type {
  ExecutiveDashboardInputs,
  GolzarRawMartyrInput,
  RejectedSuggestionInput,
} from './types';

/**
 * تبدیل آرایه سبک بانک ۲۸٬۳۶۸ شهید (LightweightGolzarMartyr) به فرمت استاندارد موتور آماری داشبورد.
 */
export function mapLightweightGolzarToRawInputs(
  golzarList: LightweightGolzarMartyr[] | null | undefined
): GolzarRawMartyrInput[] {
  if (!Array.isArray(golzarList) || golzarList.length === 0) {
    return [];
  }
  return golzarList.map((g, idx) => ({
    id: g.id || `golzar_live_${idx + 1}`,
    source: g.source === 'outside' ? 'outside_golzar_martyrs' : 'golzar_martyrs',
    sourceRow: idx + 2,
    firstName: g.firstName || '',
    lastName: g.lastName || '',
    fatherName: g.fatherName || '',
    gravePiece: g.gravePiece || '',
    graveRow: g.graveRow || '',
    graveNumber: g.graveNumber || '',
    operation: g.martyrdomOperation || '',
  }));
}

export interface LiveAppDashboardStateSource {
  catalogRows: ReferenceCatalogRow[];
  auditRecords: Record<string, FieldAuditRecord>;
  bookCopies: BookCopyRecord[];
  /** پیوندهای خام عملیاتی (هرگز indexedLinks تولیدشده خودکار RL-28K ارسال نشود تا آمار رسمی دقیق بماند) */
  links: BookMartyrLinkRecord[];
  pendingReviews: PendingReviewItem[];
  extractedItems: ExtractedContentItem[];
  smartSuggestions: SmartSearchSuggestion[];
  rejectedSuggestionsArchive: Array<
    RejectedSuggestionInput & { bookId?: string; martyrName?: string }
  >;
  customMartyrs: CustomMartyrRecord[];
  golzarList?: LightweightGolzarMartyr[];
  golzarRecords?: GolzarRawMartyrInput[];
  golzarIndexVersion?: number;
  auditLogs?: AuditLogEntry[];
}

/**
 * بسته‌بندی خالص State زنده برنامه برای تغذیه موتور تحلیلی و پرونده‌های خلاصه داشبورد
 * بدون نیاز به هیچ منبع موازی یا کپی تکراری.
 */
export function buildExecutiveDashboardInputs(
  source: LiveAppDashboardStateSource
): ExecutiveDashboardInputs {
  const normalizedRejected: RejectedSuggestionInput[] = (
    source.rejectedSuggestionsArchive || []
  ).map((r) => ({
    id: r.id,
    martyrId: r.martyrId,
    martyrName: r.martyrName,
    bookTitle: r.bookTitle,
    matchedCatalogBookId: r.matchedCatalogBookId || r.bookId,
    rejectedAt: r.rejectedAt,
    reason: r.reason,
    reviewerNote: r.reviewerNote,
    reviewStatus: r.reviewStatus,
  }));

  const golzarRecords =
    source.golzarRecords && source.golzarRecords.length > 0
      ? source.golzarRecords
      : mapLightweightGolzarToRawInputs(source.golzarList);

  return {
    catalogRows: source.catalogRows || [],
    auditRecords: source.auditRecords || {},
    bookCopies: source.bookCopies || [],
    links: source.links || [],
    pendingReviews: source.pendingReviews || [],
    extractedItems: source.extractedItems || [],
    smartSuggestions: source.smartSuggestions || [],
    rejectedSuggestionsArchive: normalizedRejected,
    customMartyrs: source.customMartyrs || [],
    golzarRecords,
    golzarIndexVersion: source.golzarIndexVersion || 0,
    auditLogs: source.auditLogs || [],
  };
}
