import {
  BookCopyRecord,
  BookMartyrLinkRecord,
  CustomMartyrRecord,
  FieldAuditRecord,
  PendingReviewItem,
} from '../../data/markazAsnadData';

export type DeviceSyncRole = 'phone-primary' | 'pc-companion';

export type ConnectionUiStatus =
  | 'ready'
  | 'pairing'
  | 'connecting'
  | 'connected'
  | 'transferring'
  | 'transfer-success'
  | 'connection-error'
  | 'disconnected';

export const CONNECTION_STATUS_LABELS: Record<ConnectionUiStatus, string> = {
  ready: 'آماده اتصال',
  pairing: 'در حال جفت‌سازی',
  connecting: 'در حال برقراری ارتباط',
  connected: 'متصل',
  transferring: 'در حال انتقال',
  'transfer-success': 'انتقال موفق',
  'connection-error': 'خطای اتصال',
  disconnected: 'اتصال قطع شد',
};

export type SyncCollectionName =
  | 'auditRecords'
  | 'bookCopies'
  | 'customMartyrs'
  | 'links'
  | 'pendingReviews';

export const SYNC_COLLECTION_LABELS: Record<SyncCollectionName, string> = {
  auditRecords: 'اطلاعات و مکان کتاب‌ها در قفسه',
  bookCopies: 'نسخه‌های فیزیکی کتاب (CP)',
  customMartyrs: 'پرونده‌های شهدای ثبت‌شده',
  links: 'ارتباط‌های پژوهشی کتاب و شهید',
  pendingReviews: 'صف بررسی و تأیید کارشناسی',
};

export interface RecordSyncMeta {
  recordId: string;
  collection: SyncCollectionName;
  createdAtMs: number;
  updatedAtMs: number;
  revision: number;
  changeId: string;
  lastModifiedByDevice: string;
  lastModifiedRole: DeviceSyncRole;
  softDeleted?: boolean;
  deletedAtMs?: number;
}

export interface SyncRecordEnvelope<T = unknown> {
  meta: RecordSyncMeta;
  titleSummary: string;
  data: T;
}

export interface SyncTransferPackage {
  packageId: string;
  protocolVersion: 1;
  senderDeviceId: string;
  senderRole: DeviceSyncRole;
  createdAtMs: number;
  selectedCollections: SyncCollectionName[];
  recordCount: number;
  payloadChecksum: string;
  envelopes: SyncRecordEnvelope[];
}

export type ConflictResolutionChoice = 'keep-phone' | 'accept-pc' | 'manual-edit';

export interface SyncConflictItem {
  conflictId: string;
  collection: SyncCollectionName;
  recordId: string;
  titleSummary: string;
  phoneEnvelope: SyncRecordEnvelope;
  pcEnvelope: SyncRecordEnvelope;
  selectedChoice?: ConflictResolutionChoice;
  manualEditedData?: unknown;
}

export interface SyncDiffItem {
  collection: SyncCollectionName;
  recordId: string;
  titleSummary: string;
  changeType: 'new' | 'modified' | 'soft-delete' | 'unchanged';
  incomingEnvelope: SyncRecordEnvelope;
  localEnvelope?: SyncRecordEnvelope;
}

export interface SyncPreviewReport {
  packageId: string;
  senderRole: DeviceSyncRole;
  receiverRole: DeviceSyncRole;
  analyzedAtMs: number;
  newItems: SyncDiffItem[];
  modifiedItems: SyncDiffItem[];
  softDeleteItems: SyncDiffItem[];
  unchangedItems: SyncDiffItem[];
  conflicts: SyncConflictItem[];
}

export interface TransferHistoryEntry {
  packageId: string;
  direction: 'sent' | 'received';
  peerRole: DeviceSyncRole;
  timestampMs: number;
  status: 'in-progress' | 'completed' | 'failed-interrupted' | 'rejected-by-user';
  recordsCount: number;
  appliedNew: number;
  appliedModified: number;
  resolvedConflicts: number;
  errorDetails?: string;
}

export interface OperationalSyncDataset {
  auditRecords: Record<string, FieldAuditRecord>;
  bookCopies: BookCopyRecord[];
  customMartyrs: CustomMartyrRecord[];
  links: BookMartyrLinkRecord[];
  pendingReviews: PendingReviewItem[];
}
