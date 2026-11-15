import {
  BookCopyRecord,
  BookMartyrLinkRecord,
  CustomMartyrRecord,
  ExtractedContentItem,
  FieldAuditRecord,
  MultiMartyrGroupAudit,
  PendingReviewItem,
  ReferenceCatalogRow,
  WorkbookGolzarMartyr,
} from '../../data/markazAsnadData';
import { UnifiedBookDossier } from '../../data/soorehMehrResearch';

export type ExcelReportDirection = 'book_to_martyr' | 'martyr_to_book';

export type ExcelFieldCategoryKey =
  | 'book_core'
  | 'physical_location'
  | 'martyr_identity'
  | 'grave_info'
  | 'book_martyr_link'
  | 'related_subjects'
  | 'book_pages_sections'
  | 'extracted_passages'
  | 'source_validation';

export type ExcelSheetKey =
  | 'main_books'
  | 'book_martyr_relations'
  | 'subjects_and_pages'
  | 'extracted_passages'
  | 'related_martyrs';

export type BookMainSubjectCode = 'R' | 'P' | 'H' | 'A' | 'K' | 'M';

export type ExcelPresetId =
  | 'books_by_subject_category'
  | 'book_title_author'
  | 'book_title_author_publisher'
  | 'book_with_martyr_name'
  | 'book_with_martyr_and_grave'
  | 'book_with_martyr_subject_page'
  | 'book_with_extracted_text'
  | 'full_comprehensive';

export interface ExcelMainSubjectCategoryMeta {
  code: BookMainSubjectCode;
  label: string;
  shortTitle: string;
  description: string;
}

export interface ExcelFieldDefinition {
  id: string;
  label: string;
  category: ExcelFieldCategoryKey;
  description?: string;
  width?: number;
  isLongText?: boolean;
  defaultSelected?: boolean;
}

export interface ExcelFieldCategoryMeta {
  key: ExcelFieldCategoryKey;
  title: string;
  description: string;
}

export interface ExcelSheetDefinition {
  key: ExcelSheetKey;
  title: string;
  sheetTabName: string;
  description: string;
  defaultSelected: boolean;
}

export interface ExcelPresetDefinition {
  id: ExcelPresetId;
  label: string;
  description: string;
  selectedFields: string[];
  selectedSheets: ExcelSheetKey[];
}

export interface StandardizedMartyrEntry {
  martyrId: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  fatherName?: string;
  birthDate?: string;
  martyrdomDate?: string;
  operationOrLocation?: string;
  gravePiece: string;
  graveRow: string;
  graveNumber: string;
  graveAddressDisplay: string;
  graveStatus: string;
  sourceLabel: string;
  isTehranMartyr?: boolean;
  tehranStatusLabel?: string;
}

export type ExcelExportMode =
  | 'books_list'
  | 'martyr_links'
  | 'shelf_records'
  | 'martyr_search'
  | 'depository_comprehensive';

export type ExtendedExcelPresetId =
  | ExcelPresetId
  | 'complete_report'
  | 'books_with_martyrs'
  | 'martyr_dossier';

export interface RawGolzarMartyrSearchRecord {
  id: string;
  source?: 'golzar' | 'outside';
  first_name?: string;
  last_name?: string;
  memorial_name?: string;
  father_name?: string;
  birth_date?: { display?: string; year?: string; month_name?: string; day?: string };
  death_date?: { display?: string; year?: string; month_name?: string; day?: string };
  martyrdom_operation?: string;
  martyrdom_location?: string;
  grave_piece?: string;
  grave_row?: string;
  grave_number?: string;
}

export interface ExcelExportDatasetContext {
  reportTitle: string;
  fileNamePrefix: string;
  direction?: ExcelReportDirection;
  mode?: ExcelExportMode;
  presetId?: ExtendedExcelPresetId;
  dossiers?: UnifiedBookDossier[];
  shelfRecords?: FieldAuditRecord[];
  martyrRecords?: RawGolzarMartyrSearchRecord[];
  catalogRows?: ReferenceCatalogRow[];
  auditRecords?: Record<string, FieldAuditRecord>;
  bookCopies?: BookCopyRecord[];
  links?: BookMartyrLinkRecord[];
  extractedItems?: ExtractedContentItem[];
  customMartyrs?: CustomMartyrRecord[];
  workbookMartyrs?: WorkbookGolzarMartyr[];
  explicitMartyrsList?: StandardizedMartyrEntry[];
  pendingReviews?: PendingReviewItem[];
  multiMartyrGroups?: MultiMartyrGroupAudit[];
}

export type ExcelExportSourcePayload = ExcelExportDatasetContext;

export interface ExcelExportUserSelection {
  reportTitle: string;
  fileNamePrefix: string;
  direction?: ExcelReportDirection | null;
  selectedFields: Set<string>;
  selectedSheets: Set<ExcelSheetKey>;
  selectedSubjectCategories?: Set<BookMainSubjectCode>;
  onlyTehranMartyrs?: boolean;
}



