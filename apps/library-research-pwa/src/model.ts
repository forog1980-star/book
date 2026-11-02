export type ReviewStatus = 'draft' | 'needs_review' | 'verified' | 'rejected' | 'conflict';
export type LinkStatus = 'proposed' | 'in_review' | 'confirmed' | 'rejected' | 'conflict';
export type CopyObservation = 'observed' | 'not_found' | 'on_loan' | 'unknown';
export type AccessLevel = 'internal' | 'restricted' | 'public_candidate';

export interface SourceRef {
  fileName: string;
  sheetName: string;
  rowNumber?: number;
  columnRef?: string;
  sha256?: string;
}

export interface LocationAddress {
  shelf: 'SH-01' | 'SH-02' | 'SH-03' | 'SH-04';
  tier: 'T01' | 'T02' | 'T03' | 'T04' | 'T05' | 'T06';
  code: string;
}

export interface BookRecord {
  id: string;
  titleRaw: string;
  titleDisplay: string;
  authorsRaw: string;
  publisherRaw: string;
  publicationYearRaw: string;
  editionRaw: string;
  isbnRaw: string;
  categoryCode: string;
  keywords: string[];
  descriptionRaw: string;
  sourceEvidenceRaw: string;
  source?: SourceRef;
  reviewStatus: ReviewStatus;
  accessLevel: AccessLevel;
  publicationStatus: 'blocked' | 'candidate' | 'approved';
  createdAt: string;
  updatedAt: string;
}

export interface BookCopy {
  id: string;
  bookId: string;
  observation: CopyObservation;
  location?: LocationAddress;
  physicalCondition: 'unknown' | 'good' | 'needs_repair' | 'damaged';
  observedAt?: string;
  observedBy: string;
  note: string;
  reviewStatus: ReviewStatus;
  movementHistory: Array<{ at: string; from?: string; to?: string; note?: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface MartyrRecord {
  id: string;
  fullNameRaw: string;
  firstNameRaw: string;
  lastNameRaw: string;
  alternateNamesRaw: string[];
  sectionRaw: string;
  graveRowRaw: string;
  graveNumberRaw: string;
  identityEvidenceRaw: string;
  source?: SourceRef;
  identityReviewStatus: ReviewStatus;
  identityReviewNote?: string;
  identityReviewedAt?: string;
  identityReviewedBy?: string;
  accessLevel: AccessLevel;
  createdAt: string;
  updatedAt: string;
}

export interface BookMartyrLink {
  id: string;
  bookId: string;
  martyrId: string;
  relationshipType: string;
  evidenceReferenceRaw: string;
  description: string;
  source?: SourceRef;
  reviewStatus: LinkStatus;
  reviewNote: string;
  reviewedAt?: string;
  reviewedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExtractedItem {
  id: string;
  bookId: string;
  martyrId?: string;
  title: string;
  contentType: string;
  pageReferenceRaw: string;
  researchSummary: string;
  researcherNote: string;
  keywords: string[];
  source?: SourceRef;
  reviewStatus: ReviewStatus;
  reviewNote?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  accessLevel: AccessLevel;
  publicationStatus: 'blocked' | 'candidate' | 'approved';
  createdAt: string;
  updatedAt: string;
}

export interface ImportBatch {
  id: string;
  fileName: string;
  fileSize: number;
  sourceSha256: string;
  expectedSha256?: string;
  sourceStatus: 'verified_reference' | 'unverified_source';
  sheetName: string;
  sheetState: string;
  headerRowNumber: number;
  headers: string[];
  fieldMapping: Record<string, number | null>;
  rowCount: number;
  emptyRowCount: number;
  formulaCount: number;
  status: 'staged_for_review';
  importedAt: string;
}

export interface RawSourceRow {
  id: string;
  batchId: string;
  rowNumber: number;
  values: string[];
  formulas: Record<string, string>;
}

export interface AuditEvent {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actor: string;
  occurredAt: string;
  summary: string;
}

export interface AppSnapshot {
  schemaVersion: 1;
  appId: 'markaz-asnad-library-research-pwa';
  exportedAt: string;
  stores: {
    books: BookRecord[];
    copies: BookCopy[];
    martyrs: MartyrRecord[];
    links: BookMartyrLink[];
    excerpts: ExtractedItem[];
    imports: ImportBatch[];
    sourceRows: RawSourceRow[];
    audit: AuditEvent[];
  };
}
