import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Search,
  Link2,
  Plus,
  Download,
  ClipboardCheck,
  AlertCircle,
  Users,
  FileText,
  CheckCircle2,
  XCircle,
  ExternalLink,
  BookOpen,
  ArrowRight,
  Check,
  X,
  HelpCircle,
  Sparkles,
  FileSpreadsheet,
  FileJson,
  Layers,
  Eye,
  EyeOff,
  SlidersHorizontal,
  Pencil,
  Trash2,
  MapPin,
  ShieldCheck,
  UserCheck,
  BookOpenCheck
} from 'lucide-react';
import { DepositoryAndExportHub } from './DepositoryAndExportHub';
import { BookLiveSearchPicker, buildLinkableBookOptions } from './BookLiveSearchPicker';
import { ModalWindow } from './ModalWindow';
import { registerInnerBackStep } from '../utils/navigationHistory';
import {
  loadGolzartehDataset,
  resolveComprehensiveMartyrProfile
} from '../modules/golzarteh-profile';
import {
  BookCopyRecord,
  BookMartyrLinkRecord,
  CustomMartyrRecord,
  ExtractedContentItem,
  ExtractedContentType,
  ExtractedReviewStatus,
  FieldAuditRecord,
  LEVELS,
  LevelCode,
  MultiMartyrGroupAudit,
  PendingReviewItem,
  ReferenceCatalogRow,
  SHELVES,
  ShelfCode,
  WorkbookGolzarMartyr,
  matchesPersianSearch,
  normalizePersianText,
  toPersianDigits
} from '../data/markazAsnadData';
import { generateUniqueExtractedId, generateUniqueLinkId } from '../utils/idGenerator';
import { requestActionConfirmation } from '../utils/confirmDialogService';
import { TehranMartyrBadge } from './TehranMartyrBadge';
import { evaluateMartyrTehranStatus } from '../utils/martyrsCrossMatchEngine';

interface ResearchAndLinksTabProps {
  catalogRows: ReferenceCatalogRow[];
  auditRecords?: Record<string, FieldAuditRecord>;
  bookCopies?: BookCopyRecord[];
  customMartyrs?: CustomMartyrRecord[];
  links: BookMartyrLinkRecord[];
  pendingReviews: PendingReviewItem[];
  workbookMartyrs?: WorkbookGolzarMartyr[];
  multiMartyrGroups: MultiMartyrGroupAudit[];
  extractedItems: ExtractedContentItem[];
  onSaveAuditRecord?: (record: FieldAuditRecord) => void;
  onUpdateCustomMartyr?: (updated: CustomMartyrRecord) => void;
  onAddLink: (newLink: BookMartyrLinkRecord) => void;
  onUpdateLink?: (updatedLnk: BookMartyrLinkRecord, oldMartyrName?: string) => void;
  onDeleteLink?: (linkId: string, bookId?: string, martyrName?: string) => void;
  onUpdateLinkStatus: (linkId: string, status: string, note: string) => void;
  onUpdatePendingReviewStatus: (trackingId: string, newStatus: string) => void;
  onUpdateGroupAudit: (updatedGroup: MultiMartyrGroupAudit) => void;
  onAddExtractedItem: (item: ExtractedContentItem) => void;
  onUpdateExtractedItemStatus: (
    id: string,
    status: ExtractedReviewStatus,
    reviewerName: string,
    researcherNote: string
  ) => void;
  onJumpToSmartSearch?: (martyrName: string) => void;
  onNotify: (msg: string, type?: 'success' | 'warning') => void;
}

export const ResearchAndLinksTab: React.FC<ResearchAndLinksTabProps> = ({
  catalogRows,
  auditRecords = {},
  bookCopies = [],
  customMartyrs = [],
  links,
  pendingReviews,
  workbookMartyrs = [],
  multiMartyrGroups,
  extractedItems,
  onSaveAuditRecord,
  onUpdateCustomMartyr,
  onAddLink,
  onUpdateLink,
  onDeleteLink,
  onUpdateLinkStatus,
  onUpdatePendingReviewStatus,
  onUpdateGroupAudit,
  onAddExtractedItem,
  onUpdateExtractedItemStatus,
  onJumpToSmartSearch,
  onNotify
}) => {
  // ۳ تب اصلی شفاف و غیرتکراری (مرحله دوم خلوت‌سازی پژوهش)
  const [subView, setSubView] = useState<'workspace' | 'extracted' | 'publish_gateway'>('workspace');
  const [showReviewQueuesPanel, setShowReviewQueuesPanel] = useState<boolean>(false);
  const [reviewQueueTab, setReviewQueueTab] = useState<'pending567' | 'groups16'>('pending567');

  // ثبت زیربخش‌های پژوهش در پشته بازگشت تا کلید Back ابتدا پنل بازبینی یا تب فرعی را ببندد
  useEffect(() => {
    if (showReviewQueuesPanel) {
      return registerInnerBackStep('research-review-queues', () => {
        setShowReviewQueuesPanel(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
    if (subView !== 'workspace') {
      return registerInnerBackStep('research-subview', () => {
        setSubView('workspace');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }, [subView, showReviewQueuesPanel]);

  // صفحه‌بندی و جست‌وجوی ایزوله برای هر بخش (جلوگیری از تداخل جست‌وجو بین تب‌ها)
  const [extractedSearchQuery, setExtractedSearchQuery] = useState('');
  const [extractedViewMode, setExtractedViewMode] = useState<'cards' | 'table'>('cards');
  const [extractedPage, setExtractedPage] = useState<number>(1);
  const [extractedPageSize, setExtractedPageSize] = useState<number | 'all'>(20);

  const [publishScope, setPublishScope] = useState<'all_valid' | 'expert_only'>('all_valid');
  const [publishPreviewTab, setPublishPreviewTab] = useState<'martyr_cards' | 'extracted_passages'>('martyr_cards');
  const [publishSearchQuery, setPublishSearchQuery] = useState('');
  const [publishPage, setPublishPage] = useState<number>(1);
  const [publishPageSize, setPublishPageSize] = useState<number | 'all'>(20);

  const [pendingSearchQuery, setPendingSearchQuery] = useState('');
  const [pendingPage, setPendingPage] = useState<number>(1);
  const [pendingPageSize, setPendingPageSize] = useState<number | 'all'>(20);

  const [externalIdPrefix, setExternalIdPrefix] = useState('GOLZAR-TEH-');
  const [contentTypeFilter, setContentTypeFilter] = useState<string>('all');

  // Add New Link Form State
  const [showAddLink, setShowAddLink] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState('');
  const [linkBookSearchQuery, setLinkBookSearchQuery] = useState('');
  const [martyrName, setMartyrName] = useState('');
  const [isGroupPhrase, setIsGroupPhrase] = useState(false);
  const [gravePiece, setGravePiece] = useState('');
  const [graveRow, setGraveRow] = useState('');
  const [graveNumber, setGraveNumber] = useState('');
  const [pageRefRaw, setPageRefRaw] = useState('');
  const [sourceDesc, setSourceDesc] = useState('');
  const [reviewerNote, setReviewerNote] = useState('');

  // Add New Extracted Content Item Form State (extracted_items)
  const [showAddExtracted, setShowAddExtracted] = useState(false);
  const [exBookId, setExBookId] = useState(catalogRows[0]?.tempBookId || 'BK-0014');
  const [exBookSearchQuery, setExBookSearchQuery] = useState('');

  const linkableBooks = useMemo(
    () => buildLinkableBookOptions(catalogRows, auditRecords, bookCopies),
    [catalogRows, auditRecords, bookCopies]
  );
  const [exMartyrName, setExMartyrName] = useState('');
  const [exGravePiece, setExGravePiece] = useState('');
  const [exPageRefRaw, setExPageRefRaw] = useState('');
  const [exPageStart, setExPageStart] = useState('');
  const [exPageEnd, setExPageEnd] = useState('');
  const [exContentType, setExContentType] = useState<ExtractedContentType>('خاطره');
  const [exPassageTitle, setExPassageTitle] = useState('');
  const [exExtractedText, setExExtractedText] = useState('');
  const [exShortQuote, setExShortQuote] = useState('');
  const [exKeywordsText, setExKeywordsText] = useState('');
  const [exResearcherNote, setExResearcherNote] = useState('');
  const [exRecordedBy, setExRecordedBy] = useState('پژوهشگر مرکز اسناد');
  const [exSourceFile, setExSourceFile] = useState('ثبت مستقیم از کتاب فیزیکی');
  const [exSourceSheet, setExSourceSheet] = useState('-');
  const [exSourceRow, setExSourceRow] = useState('-');

  // Selected Group in G001..G016 for human review
  const [editingGroupCode, setEditingGroupCode] = useState<string | null>(null);

  // Sub-filter for Pending Reviews 567
  const [pendingStatusFilter, setPendingStatusFilter] = useState<'open' | 'reviewed' | 'needs_source' | 'all'>('open');
  const [activeReviewPv, setActiveReviewPv] = useState<PendingReviewItem | null>(null);
  const [pvMartyrName, setPvMartyrName] = useState('');
  const [pvPageRef, setPvPageRef] = useState('');
  const [pvGravePiece, setPvGravePiece] = useState('');
  const [pvGraveRow, setPvGraveRow] = useState('');
  const [pvGraveNumber, setPvGraveNumber] = useState('');
  const [pvTargetStatus, setPvTargetStatus] = useState<string>('approved_to_links');
  const [pvReviewerNote, setPvReviewerNote] = useState('');

  // Sub-filter for 16 Groups
  const [groupsStatusFilter, setGroupsStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  const [extractedStatusFilter, setExtractedStatusFilter] = useState<string>('all');
  const [rejectingExtractedId, setRejectingExtractedId] = useState<string | null>(null);
  const [extractedRejectReason, setExtractedRejectReason] = useState<string>('');
  const [expandedPassageIds, setExpandedPassageIds] = useState<Record<string, boolean>>({});

  // ===================== PHASE 3: IN-PLACE BOOK / MARTYR / LINK EDITORS =====================
  const [inspectingBookTarget, setInspectingBookTarget] = useState<{
    bookId: string;
    fallbackTitle: string;
  } | null>(null);
  const [bookFormTitle, setBookFormTitle] = useState('');
  const [bookFormAuthor, setBookFormAuthor] = useState('');
  const [bookFormPublisher, setBookFormPublisher] = useState('');
  const [bookFormYear, setBookFormYear] = useState('');
  const [bookFormCategory, setBookFormCategory] = useState('');
  const [bookFormShelf, setBookFormShelf] = useState<ShelfCode>('SH-01');
  const [bookFormLevel, setBookFormLevel] = useState<LevelCode>('T01');
  const [bookFormStatus, setBookFormStatus] = useState<'verified' | 'review' | 'not_found'>('verified');
  const [bookFormExpertApproved, setBookFormExpertApproved] = useState(false);
  const [bookFormNotes, setBookFormNotes] = useState('');

  const [inspectingMartyrName, setInspectingMartyrName] = useState<string | null>(null);
  const [editingCustomMartyrId, setEditingCustomMartyrId] = useState<string | null>(null);
  const [cmFullName, setCmFullName] = useState('');
  const [cmPiece, setCmPiece] = useState('');
  const [cmRow, setCmRow] = useState('');
  const [cmNumber, setCmNumber] = useState('');
  const [cmNotes, setCmNotes] = useState('');

  const [editingLinkRecord, setEditingLinkRecord] = useState<BookMartyrLinkRecord | null>(null);
  const [editLinkMartyrName, setEditLinkMartyrName] = useState('');
  const [editLinkPiece, setEditLinkPiece] = useState('');
  const [editLinkRow, setEditLinkRow] = useState('');
  const [editLinkNumber, setEditLinkNumber] = useState('');
  const [editLinkPageRef, setEditLinkPageRef] = useState('');
  const [editLinkSourceDesc, setEditLinkSourceDesc] = useState('');
  const [editLinkReviewStatus, setEditLinkReviewStatus] = useState('');
  const [editLinkNote, setEditLinkNote] = useState('');
  const [editLinkIsGroup, setEditLinkIsGroup] = useState(false);

  // نگاشت سریع کتاب‌ها و وضعیت زنده از auditRecords برای حل تضمینی نام و ناشر در کل پژوهش
  const liveBookLookup = useMemo(() => {
    const catalogById = new Map<string, ReferenceCatalogRow>();
    catalogRows.forEach((r) => {
      if (r.tempBookId) catalogById.set(r.tempBookId, r);
    });
    const auditById = new Map<string, FieldAuditRecord>();
    Object.values(auditRecords).forEach((rec) => {
      if (rec.tempBookId) auditById.set(rec.tempBookId, rec);
    });
    const copiesById = new Map<string, BookCopyRecord[]>();
    bookCopies.forEach((cp) => {
      if (!cp.bookId) return;
      const arr = copiesById.get(cp.bookId) || [];
      arr.push(cp);
      copiesById.set(cp.bookId, arr);
    });
    return { catalogById, auditById, copiesById };
  }, [catalogRows, auditRecords, bookCopies]);

  const resolveLiveBookMeta = (bookId?: string, fallbackTitle?: string, fallbackPublisher?: string) => {
    const id = (bookId || '').trim();
    const cat = id ? liveBookLookup.catalogById.get(id) : undefined;
    const aud = (id ? liveBookLookup.auditById.get(id) : undefined) || (cat ? auditRecords[cat.rowKey] : undefined);
    const title = aud?.title?.trim() || fallbackTitle?.trim() || cat?.titleRaw || '—';
    const publisher = aud?.publisher?.trim() || fallbackPublisher?.trim() || cat?.publisherRaw || '—';
    const author = aud?.author?.trim() || cat?.authorRaw || '';
    const location =
      aud?.location?.trim() ||
      (aud?.shelf ? `${aud.shelf}-${aud.level || 'T01'}` : '') ||
      cat?.locationRaw ||
      '—';
    return { title, publisher, author, location, cat, aud };
  };

  const handleOpenBookInspector = (bookId: string, fallbackTitle: string) => {
    const { cat, aud } = resolveLiveBookMeta(bookId, fallbackTitle);
    const firstCopy = liveBookLookup.copiesById.get(bookId)?.[0];
    const locParts = (cat?.locationRaw || '').split('-');
    const initialShelf = (aud?.shelf || firstCopy?.shelf || (locParts[0] as ShelfCode) || 'SH-01') as ShelfCode;
    const initialLevel = (aud?.level || firstCopy?.level || (locParts[1] as LevelCode) || 'T01') as LevelCode;
    setInspectingBookTarget({ bookId, fallbackTitle });
    setBookFormTitle(aud?.title || cat?.titleRaw || fallbackTitle || '');
    setBookFormAuthor(aud?.author || cat?.authorRaw || '');
    setBookFormPublisher(aud?.publisher || cat?.publisherRaw || '');
    setBookFormYear(aud?.year || '');
    setBookFormCategory(aud?.category || cat?.categoryRaw || '');
    setBookFormShelf(SHELVES.some((s) => s.code === initialShelf) ? initialShelf : 'SH-01');
    setBookFormLevel(LEVELS.some((l) => l.code === initialLevel) ? initialLevel : 'T01');
    setBookFormStatus(aud?.physical || 'verified');
    setBookFormExpertApproved(Boolean(aud?.expertApproved));
    setBookFormNotes(aud?.notes || cat?.noteRaw || '');
  };

  const handleSaveBookInspector = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectingBookTarget) return;
    if (!onSaveAuditRecord) {
      onNotify('امکان ویرایش مستقیم کتاب در این نما فعال نیست.', 'warning');
      return;
    }
    const { bookId } = inspectingBookTarget;
    const { cat, aud } = resolveLiveBookMeta(bookId, bookFormTitle);
    const recordKey = aud?.key || cat?.rowKey || `outside::${bookId}`;
    const updatedLocation = `${bookFormShelf}-${bookFormLevel}`;
    const updatedRecord: FieldAuditRecord = {
      ...(aud || {}),
      key: recordKey,
      source: aud?.source || (cat ? 'catalog' : 'outside-list'),
      sheet: aud?.sheet || 'فهرست کتاب‌ها',
      tempBookId: bookId,
      title: bookFormTitle.trim() || inspectingBookTarget.fallbackTitle,
      author: bookFormAuthor.trim(),
      publisher: bookFormPublisher.trim(),
      year: bookFormYear.trim(),
      descriptionRaw: aud?.descriptionRaw || cat?.descriptionRaw || '',
      category: bookFormCategory.trim(),
      shelf: bookFormShelf,
      level: bookFormLevel,
      location: updatedLocation,
      physical: bookFormStatus,
      countedCopies: aud?.countedCopies || cat?.countedCopiesRaw || '1',
      expertApproved: bookFormExpertApproved,
      relatedMartyrs: aud?.relatedMartyrs,
      excludedMartyrs: aud?.excludedMartyrs,
      needsReview: bookFormStatus === 'review',
      notes: bookFormNotes.trim(),
      updatedAt: new Date().toISOString()
    };
    onSaveAuditRecord(updatedRecord);
    setInspectingBookTarget(null);
    onNotify(`شناسنامه کتاب «${updatedRecord.title}» ذخیره و در تمام بخش‌های سامانه همگام‌سازی شد.`);
  };

  const handleOpenMartyrInspector = (name: string) => {
    setInspectingMartyrName(name);
    const norm = normalizePersianText(name.replace(/^(شهیدان|شهید)\s+/g, ''));
    const matchedCustom = customMartyrs.find(
      (cm) => normalizePersianText(cm.fullName.replace(/^(شهیدان|شهید)\s+/g, '')) === norm
    );
    if (matchedCustom) {
      setEditingCustomMartyrId(matchedCustom.martyrId);
      setCmFullName(matchedCustom.fullName);
      setCmPiece(matchedCustom.gravePiece || '');
      setCmRow(matchedCustom.graveRow || '');
      setCmNumber(matchedCustom.graveNumber || '');
      setCmNotes(matchedCustom.description || '');
    } else {
      setEditingCustomMartyrId(null);
    }
  };

  const handleSaveCustomMartyrInspector = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomMartyrId || !onUpdateCustomMartyr) return;
    const existing = customMartyrs.find((cm) => cm.martyrId === editingCustomMartyrId);
    if (!existing) return;
    const parts = cmFullName.trim().split(/\s+/);
    const nextFirst = parts[0] || existing.firstName;
    const nextLast = parts.slice(1).join(' ') || existing.lastName;
    const updated: CustomMartyrRecord = {
      ...existing,
      firstName: nextFirst,
      lastName: nextLast,
      fullName: cmFullName.trim() || existing.fullName,
      gravePiece: cmPiece.trim(),
      graveRow: cmRow.trim(),
      graveNumber: cmNumber.trim(),
      graveDisplayAddress: [
        cmPiece.trim() ? `قطعه ${cmPiece.trim()}` : '',
        cmRow.trim() ? `ردیف ${cmRow.trim()}` : '',
        cmNumber.trim() ? `شماره ${cmNumber.trim()}` : ''
      ]
        .filter(Boolean)
        .join(' · ') || existing.graveDisplayAddress,
      description: cmNotes.trim()
    };
    onUpdateCustomMartyr(updated);
    setInspectingMartyrName(updated.fullName);
    onNotify(`پرونده شهید «${updated.fullName}» ویرایش و در کل بخش‌های نرم‌افزار همگام‌سازی شد.`);
  };

  const handleOpenLinkEditor = (linkId: string) => {
    const lnk = links.find((l) => l.id === linkId);
    if (!lnk) return;
    setEditingLinkRecord(lnk);
    setEditLinkMartyrName(lnk.martyrNameRaw);
    setEditLinkPiece(lnk.gravePieceRaw || '');
    setEditLinkRow(lnk.graveRowRaw || '');
    setEditLinkNumber(lnk.graveNumberRaw || '');
    setEditLinkPageRef(lnk.pageReferenceRaw || '');
    setEditLinkSourceDesc(lnk.sourceDescriptionRaw || '');
    setEditLinkReviewStatus(lnk.reviewStatus || 'تأییدشده کارشناسی');
    setEditLinkNote(lnk.reviewerNote || '');
    setEditLinkIsGroup(Boolean(lnk.isGroupPhrase));
  };

  const handleSaveLinkEditor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLinkRecord) return;
    const oldMartyrName = editingLinkRecord.martyrNameRaw;
    const meta = resolveLiveBookMeta(editingLinkRecord.tempBookId, editingLinkRecord.bookTitleRaw, editingLinkRecord.publisherRaw);
    const updated: BookMartyrLinkRecord = {
      ...editingLinkRecord,
      bookTitleRaw: meta.title,
      publisherRaw: meta.publisher,
      martyrNameRaw: editLinkMartyrName.trim() || oldMartyrName,
      gravePieceRaw: editLinkPiece.trim(),
      graveRowRaw: editLinkRow.trim(),
      graveNumberRaw: editLinkNumber.trim(),
      pageReferenceRaw: editLinkPageRef.trim() || 'ثبت‌نشده',
      sourceDescriptionRaw: editLinkSourceDesc.trim(),
      reviewStatus: editLinkReviewStatus,
      reviewerNote: editLinkNote.trim(),
      isGroupPhrase: editLinkIsGroup
    };
    if (onUpdateLink) {
      onUpdateLink(updated, oldMartyrName);
    } else {
      onUpdateLinkStatus(updated.id, updated.reviewStatus, updated.reviewerNote);
    }
    setEditingLinkRecord(null);
    onNotify(`پیوند ${updated.id} ویرایش و در کل نرم‌افزار همگام‌سازی شد.`);
  };

  const handleConfirmDeleteLink = (linkId: string) => {
    const lnk = links.find((l) => l.id === linkId);
    if (!lnk) return;
    const meta = resolveLiveBookMeta(lnk.tempBookId, lnk.bookTitleRaw, lnk.publisherRaw);
    requestActionConfirmation({
      title: 'حذف پیوند کتاب و شهید',
      message: `آیا از حذف پیوند میان کتاب «${meta.title}» و شهید «${lnk.martyrNameRaw}» اطمینان دارید؟`,
      details: `شناسه پیوند: ${lnk.id} · این تغییر در بخش کتابخانه، شهدا و جست‌وجوی هوشمند هم اعمال می‌شود.`,
      confirmLabel: 'بله، حذف شود',
      variant: 'delete',
      onConfirm: () => {
        if (onDeleteLink) {
          onDeleteLink(lnk.id, lnk.tempBookId, lnk.martyrNameRaw);
        } else {
          onUpdateLinkStatus(lnk.id, 'ردشده با دلیل', 'حذف کارشناسی از میز پژوهش');
        }
        onNotify(`پیوند ${lnk.id} حذف و با مخزن کتاب‌ها همگام‌سازی شد.`);
      }
    });
  };

  // خروجی سریع اکسل قطعات شهدا (یک شهید و چند شهید با عنوان‌های زنده)
  const handleExportGhatatExcel = () => {
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(
      links
        .filter((l) => l.sourceSheet === 'یک شهید')
        .map((l, idx) => {
          const meta = resolveLiveBookMeta(l.tempBookId, l.bookTitleRaw, l.publisherRaw);
          return {
            'ردیف': idx + 1,
            'انتشارات': meta.publisher,
            'عنوان کتاب': meta.title,
            'عنوان دیگر': l.alternativeTitle || '',
            'توضیحات': l.sourceDescriptionRaw,
            'نام و نام خانوادگی شهید': l.martyrNameRaw,
            'قطعه': l.gravePieceRaw,
            'ردیف مزار': l.graveRowRaw,
            'شماره': l.graveNumberRaw,
            'شناسه کتاب در مخزن': l.tempBookId
          };
        })
    );
    const ws2 = XLSX.utils.json_to_sheet(
      links
        .filter((l) => l.sourceSheet === 'چند شهید')
        .map((l, idx) => {
          const meta = resolveLiveBookMeta(l.tempBookId, l.bookTitleRaw, l.publisherRaw);
          return {
            'ردیف': idx + 1,
            'انتشارات': meta.publisher,
            'عنوان کتاب': meta.title,
            'توضیحات': l.sourceDescriptionRaw,
            'نام و نام خانوادگی شهید': l.martyrNameRaw,
            'قطعه': l.gravePieceRaw,
            'ردیف مزار': l.graveRowRaw,
            'شماره': l.graveNumberRaw,
            'شناسه کتاب در مخزن': l.tempBookId
          };
        })
    );
    XLSX.utils.book_append_sheet(wb, ws1, 'یک شهید');
    XLSX.utils.book_append_sheet(wb, ws2, 'چند شهید');
    XLSX.writeFile(wb, `قطعات-شهدا-${new Date().toISOString().slice(0, 10)}.xlsx`);
    onNotify('فایل اکسل «قطعات شهدا» (شیت یک شهید و شیت چند شهید) دانلود شد.');
  };


  // Open PV Review Form
  const handleOpenPvReview = (pv: PendingReviewItem) => {
    setActiveReviewPv(pv);
    setPvMartyrName(pv.nameOrPhrase && pv.nameOrPhrase !== '*' ? pv.nameOrPhrase : '');
    // Lookup if matching link exists
    const matchingLink = links.find(
      (l) => l.id === pv.mainRecordId || (l.bookTitleRaw === pv.bookTitle && l.martyrNameRaw === pv.nameOrPhrase)
    );
    setPvPageRef(matchingLink?.pageReferenceRaw || '');
    setPvGravePiece(matchingLink?.gravePieceRaw || '');
    setPvGraveRow(matchingLink?.graveRowRaw || '');
    setPvGraveNumber(matchingLink?.graveNumberRaw || '');
    setPvTargetStatus('approved_to_links');
    setPvReviewerNote(matchingLink?.reviewerNote || '');
  };

  // Save PV Review
  const handleSavePvReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReviewPv) return;

    let targetStatusName = 'بررسی‌شده';
    if (pvTargetStatus === 'needs_source') targetStatusName = 'نیازمند منبع';
    if (pvTargetStatus === 'rejected') targetStatusName = 'ردشده با دلیل';

    const pvItem = activeReviewPv;
    requestActionConfirmation({
      title: 'تأیید نهایی تعیین تکلیف مورد نیازمند بررسی',
      message: `آیا از ثبت وضعیت «${pvTargetStatus === 'approved_to_links' ? 'تأیید و انتقال به پیوندهای معتبر' : targetStatusName}» برای مورد ${pvItem.trackingId} (کتاب «${pvItem.bookTitle}») اطمینان دارید؟`,
      details: `نام/عبارت: ${pvMartyrName.trim() || pvItem.nameOrPhrase} · موضوع بررسی: ${pvItem.issueSubject}`,
      confirmLabel: 'بله، ثبت نهایی شود',
      variant: pvTargetStatus === 'rejected' ? 'delete' : 'approve',
      onConfirm: () => {
        onUpdatePendingReviewStatus(pvItem.trackingId, targetStatusName);

        // If approved, create or update matching link in links
        if (pvTargetStatus === 'approved_to_links') {
          const existing = links.find(
            (l) => l.id === pvItem.mainRecordId || (l.bookTitleRaw === pvItem.bookTitle && l.martyrNameRaw === pvItem.nameOrPhrase)
          );
          if (existing) {
            onUpdateLinkStatus(
              existing.id,
              'تأییدشده کارشناسی',
              pvReviewerNote.trim() || 'تکمیل و رفع اشکال از کاربرگ نیازمند بررسی'
            );
          } else {
            const bookObj = catalogRows.find(
              (b) => b.titleRaw === pvItem.bookTitle || b.tempBookId === pvItem.mainRecordId
            );
            onAddLink({
              id: `RL-${String(links.length + 1).padStart(4, '0')}`,
              tempBookId: bookObj?.tempBookId || '',
              bookTitleRaw: pvItem.bookTitle,
              publisherRaw: pvItem.publisher,
              martyrNameRaw: pvMartyrName.trim() || pvItem.nameOrPhrase,
              isGroupPhrase: false,
              gravePieceRaw: pvGravePiece.trim(),
              graveRowRaw: pvGraveRow.trim(),
              graveNumberRaw: pvGraveNumber.trim(),
              pageReferenceRaw: pvPageRef.trim() || 'استخراج‌شده توسط کارشناس',
              sourceDescriptionRaw: `رفع اشکال از ردیف ${pvItem.trackingId} (${pvItem.issueSubject})`,
              sourceFile: 'کاربرگ موارد نیازمند بررسی',
              sourceSheet: pvItem.mainSheet,
              sourceExcelRow: pvItem.mainRecordId,
              reviewStatus: 'تأییدشده کارشناسی',
              reviewerNote: pvReviewerNote.trim() || 'تکمیل و تأیید در سامانه'
            });
          }
          onNotify(
            `مورد ${pvItem.trackingId} با موفقیت بررسی و ثبت شد و به پیوندهای معتبر منتقل گردید.`
          );
        } else {
          onNotify(`وضعیت مورد ${pvItem.trackingId} به «${targetStatusName}» به‌روزرسانی شد.`);
        }

        setActiveReviewPv(null);
      }
    });
  };

  // Filtered Extracted Content Items (با جست‌وجوی ایزوله و حل زنده نام کتاب/ناشر)
  const filteredExtractedItems = useMemo(() => {
    const hasQ = Boolean(normalizePersianText(extractedSearchQuery));
    return extractedItems.filter((item) => {
      if (contentTypeFilter !== 'all' && item.contentType !== contentTypeFilter) {
        return false;
      }
      if (extractedStatusFilter !== 'all') {
        if (extractedStatusFilter === 'تأییدشده کارشناسی' && item.reviewStatus !== 'تأییدشده کارشناسی') return false;
        if (extractedStatusFilter === 'بررسی‌شده در پژوهش اصلی' && item.reviewStatus !== 'بررسی‌شده در پژوهش اصلی') return false;
        if (extractedStatusFilter === 'نیازمند بررسی' && item.reviewStatus !== 'نیازمند بررسی') return false;
        if (extractedStatusFilter === 'ردشده با دلیل' && !item.reviewStatus.includes('رد')) return false;
      }
      if (!hasQ) return true;
      const meta = resolveLiveBookMeta(item.tempBookId, item.bookTitleRaw, item.publisherRaw);
      return matchesPersianSearch(
        `${item.id} ${item.tempBookId} ${meta.title} ${meta.publisher} ${item.martyrNameRaw} ${item.gravePieceRaw} ${item.pageReferenceRaw} ${item.contentType} ${item.passageTitle} ${item.extractedText} ${item.researcherNote}`,
        extractedSearchQuery
      );
    });
  }, [extractedItems, extractedSearchQuery, contentTypeFilter, extractedStatusFilter, auditRecords, liveBookLookup]);

  // Filtered 567 Pending Reviews (با جست‌وجوی ایزوله)
  const filteredPendingReviews = useMemo(() => {
    const hasQ = Boolean(normalizePersianText(pendingSearchQuery));
    return pendingReviews.filter((pv) => {
      if (pendingStatusFilter === 'open' && pv.trackingStatus !== 'باز') return false;
      if (pendingStatusFilter === 'reviewed' && pv.trackingStatus !== 'بررسی‌شده') return false;
      if (pendingStatusFilter === 'needs_source' && pv.trackingStatus !== 'نیازمند منبع') return false;

      if (!hasQ) return true;
      return matchesPersianSearch(
        `${pv.trackingId} ${pv.mainSheet} ${pv.mainRecordId} ${pv.nameOrPhrase} ${pv.bookTitle} ${pv.publisher} ${pv.issueSubject}`,
        pendingSearchQuery
      );
    });
  }, [pendingReviews, pendingSearchQuery, pendingStatusFilter]);

  // Filtered 16 Multi-Martyr Groups
  const filteredMultiMartyrGroups = useMemo(() => {
    return multiMartyrGroups.filter((grp) => {
      if (
        groupsStatusFilter === 'pending' &&
        grp.decisionStatus !== 'در انتظار بازبینی کارشناس' &&
        grp.decisionStatus !== 'در انتظار بازبینی انسانی'
      )
        return false;
      if (groupsStatusFilter === 'approved' && grp.decisionStatus !== 'تأیید') return false;
      if (
        groupsStatusFilter === 'rejected' &&
        grp.decisionStatus !== 'رد' &&
        grp.decisionStatus !== 'نیازمند پیگیری'
      )
        return false;
      return true;
    });
  }, [multiMartyrGroups, groupsStatusFilter]);


  const handleCreateLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBookId) {
      onNotify('لطفاً ابتدا کتاب مرجع را از طریق جست‌وجوی زنده انتخاب کنید.', 'warning');
      return;
    }
    if (!martyrName.trim()) {
      onNotify('نام شهید یا عبارت مرتبط ثبت‌شده در منبع را وارد کنید.', 'warning');
      return;
    }

    const bookObj =
      linkableBooks.find((b) => b.tempBookId === selectedBookId) ||
      catalogRows.find((b) => b.tempBookId === selectedBookId);
    requestActionConfirmation({
      title: 'تأیید نهایی ثبت ارتباط پژوهشی کتاب و شهید',
      message: `آیا از ثبت ارتباط پژوهشی میان کتاب «${bookObj?.titleRaw || selectedBookId}» و شهید «${martyrName.trim()}» اطمینان دارید؟`,
      details: `صفحه/ارجاع: ${pageRefRaw.trim() || 'ثبت‌نشده'} · قطعه مزار: ${gravePiece.trim() || '—'}`,
      confirmLabel: 'بله، ارتباط پژوهشی ثبت شود',
      variant: 'save',
      onConfirm: () => {
        const newRecord: BookMartyrLinkRecord = {
          id: generateUniqueLinkId(links),
          tempBookId: selectedBookId,
          bookTitleRaw: bookObj?.titleRaw || selectedBookId,
          publisherRaw: bookObj?.publisherRaw || '',
          martyrNameRaw: martyrName.trim(),
          isGroupPhrase,
          gravePieceRaw: gravePiece.trim(),
          graveRowRaw: graveRow.trim(),
          graveNumberRaw: graveNumber.trim(),
          pageReferenceRaw: pageRefRaw.trim() || 'ثبت‌نشده',
          sourceDescriptionRaw: sourceDesc.trim() || 'ثبت کارشناسی در سامانه مرکز اسناد',
          sourceFile: 'ثبت مستقیم کارشناس',
          sourceSheet: 'ارتباط کتاب و شهید',
          sourceExcelRow: '-',
          reviewStatus: 'تأییدشده کارشناسی',
          reviewerNote: reviewerNote.trim()
        };

        onAddLink(newRecord);
        setMartyrName('');
        setPageRefRaw('');
        setSourceDesc('');
        setReviewerNote('');
        setShowAddLink(false);
        onNotify(`ارتباط پژوهشی میان «${newRecord.bookTitleRaw}» و «${newRecord.martyrNameRaw}» ثبت شد.`);
      }
    });
  };

  // Pre-fill Extracted Item Form from a BookMartyrLinkRecord
  const handleStartExtractFromLink = (lnk: BookMartyrLinkRecord) => {
    setExBookId(lnk.tempBookId || catalogRows[0]?.tempBookId || 'BK-0001');
    setExMartyrName(lnk.martyrNameRaw === '*' ? '' : lnk.martyrNameRaw);
    setExGravePiece(lnk.gravePieceRaw || '');
    setExPageRefRaw(lnk.pageReferenceRaw || '');
    setExSourceFile(lnk.sourceFile || 'قطعات شهدا.xlsx');
    setExSourceSheet(lnk.sourceSheet || 'یک شهید');
    setExSourceRow(lnk.sourceExcelRow || '-');
    setExPassageTitle(`مطلب مرتبط با ${lnk.martyrNameRaw} در کتاب «${lnk.bookTitleRaw}»`);
    setShowAddExtracted(true);
    setSubView('extracted');
  };

  const handleCreateExtractedItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!exBookId) {
      onNotify('لطفاً ابتدا کتاب مرجع را از طریق جست‌وجوی زنده انتخاب کنید.', 'warning');
      return;
    }
    if (!exMartyrName.trim() || !exPassageTitle.trim() || !exExtractedText.trim()) {
      onNotify('نام شهید، عنوان مطلب و متن/خلاصه پژوهشی استخراج‌شده الزامی است.', 'warning');
      return;
    }

    const bookObj =
      linkableBooks.find((b) => b.tempBookId === exBookId) ||
      catalogRows.find((b) => b.tempBookId === exBookId);
    requestActionConfirmation({
      title: 'تأیید نهایی ثبت مطلب و صفحه استخراج‌شده',
      message: `آیا از ثبت مطلب «${exPassageTitle.trim()}» برای شهید «${exMartyrName.trim()}» از کتاب «${bookObj?.titleRaw || exBookId}» اطمینان دارید؟`,
      details: `نوع مطلب: ${exContentType} · شماره صفحه: ${exPageRefRaw.trim() || 'ثبت‌نشده'}`,
      confirmLabel: 'بله، مطلب ذخیره شود',
      variant: 'save',
      onConfirm: () => {
        const newItem: ExtractedContentItem = {
          id: generateUniqueExtractedId(extractedItems),
          tempBookId: exBookId,
          bookTitleRaw: bookObj?.titleRaw || exBookId,
          publisherRaw: bookObj?.publisherRaw || '',
          martyrNameRaw: exMartyrName.trim(),
          gravePieceRaw: exGravePiece.trim(),
          pageReferenceRaw: exPageRefRaw.trim() || 'ثبت‌نشده',
          pageStartNormalized: exPageStart.trim() || undefined,
          pageEndNormalized: exPageEnd.trim() || undefined,
          contentType: exContentType,
          passageTitle: exPassageTitle.trim(),
          extractedText: exExtractedText.trim(),
          shortVerifiedQuote: exShortQuote.trim() || undefined,
          keywords: exKeywordsText
            .split(/[،,]/)
            .map((s) => s.trim())
            .filter(Boolean),
          researcherNote: exResearcherNote.trim(),
          reviewStatus: 'تأییدشده کارشناسی',
          recordedBy: exRecordedBy.trim() || 'پژوهشگر مرکز اسناد',
          reviewedBy: 'کارشناس مسئول',
          sourceFile: exSourceFile,
          sourceSheet: exSourceSheet,
          sourceRow: exSourceRow,
          updatedAt: new Intl.DateTimeFormat('fa-IR').format(new Date())
        };

        onAddExtractedItem(newItem);
        setExPassageTitle('');
        setExExtractedText('');
        setExShortQuote('');
        setExKeywordsText('');
        setExResearcherNote('');
        setExPageRefRaw('');
        setExPageStart('');
        setExPageEnd('');
        setShowAddExtracted(false);
        onNotify(`مطلب استخراج‌شده (${newItem.id}) برای «${newItem.martyrNameRaw}» با حفظ ارجاع صفحه خام ثبت شد.`);
      }
    });
  };

  // Export Extracted Content Items Excel (.xlsx) با عنوان و ناشر زنده از مخزن
  const exportExtractedExcel = () => {
    const rows = filteredExtractedItems.map((it, idx) => {
      const meta = resolveLiveBookMeta(it.tempBookId, it.bookTitleRaw, it.publisherRaw);
      return {
        'ردیف': idx + 1,
        'شناسه مطلب': it.id,
        'شناسه کتاب (مخزن)': it.tempBookId,
        'عنوان کتاب': meta.title,
        'ناشر': meta.publisher !== '—' ? meta.publisher : '',
        'نام شهید / عبارت مرتبط': it.martyrNameRaw,
        'قطعه مزار': it.gravePieceRaw || '',
        'نوع مطلب': it.contentType,
        'عنوان بخش / فصل': it.passageTitle,
        'ارجاع صفحه در کتاب': it.pageReferenceRaw,
        'صفحه شروع': it.pageStartNormalized || '',
        'صفحه پایان': it.pageEndNormalized || '',
        'متن یا استناد پژوهشی استخراج‌شده': it.extractedText,
        'نقل‌قول کوتاه مستند': it.shortVerifiedQuote || '',
        'یادداشت پژوهشگر': it.researcherNote || '',
        'وضعیت بازبینی': it.reviewStatus,
        'ثبت‌کننده': it.recordedBy || '',
        'بازبین': it.reviewedBy || '',
        'تاریخ': it.updatedAt || ''
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'مطالب استخراج‌شده');
    XLSX.writeFile(wb, `مطالب-استخراج‌شده-و-ارجاعات-صفحه-${new Date().toISOString().slice(0, 10)}.xlsx`);
    onNotify(`فایل اکسل مطالب استخراج‌شده شامل ${toPersianDigits(rows.length)} رکورد دانلود شد.`);
  };

  // Export Extracted Content Items CSV
  const exportExtractedCsv = () => {
    const hdrs = [
      'شناسه مطلب (item_id)',
      'شناسه کتاب (book_id)',
      'عنوان کتاب',
      'ناشر',
      'نام شهید / عبارت مرتبط',
      'قطعه مزار',
      'ارجاع صفحه خام (page_reference_raw)',
      'صفحه شروع',
      'صفحه پایان',
      'نوع مطلب (content_type)',
      'عنوان بخش / فصل',
      'متن یا خلاصه پژوهشی استخراج‌شده',
      'یادداشت پژوهشگر',
      'وضعیت بازبینی',
      'ثبت‌کننده',
      'بازبین',
      'فایل منبع',
      'شیت منبع',
      'ردیف منبع',
      'تاریخ ثبت'
    ];
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      hdrs.map(cell).join(','),
      ...filteredExtractedItems.map((it) => {
        const meta = resolveLiveBookMeta(it.tempBookId, it.bookTitleRaw, it.publisherRaw);
        return [
          it.id,
          it.tempBookId,
          meta.title,
          meta.publisher !== '—' ? meta.publisher : '',
          it.martyrNameRaw,
          it.gravePieceRaw,
          it.pageReferenceRaw,
          it.pageStartNormalized || '',
          it.pageEndNormalized || '',
          it.contentType,
          it.passageTitle,
          it.extractedText,
          it.researcherNote,
          it.reviewStatus,
          it.recordedBy,
          it.reviewedBy,
          it.sourceFile,
          it.sourceSheet,
          it.sourceRow,
          it.updatedAt
        ]
          .map(cell)
          .join(',');
      })
    ];

    const blob = new Blob(['\uFEFF', lines.join('\r\n')], {
      type: 'text/csv;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'فهرست-مطالب-استخراج‌شده-کتابخانه.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    onNotify('فایل CSV مطالب استخراج‌شده و ارجاعات صفحه دانلود شد.');
  };

  // Export Pending Reviews Excel (.xlsx) for Management Reports
  const exportPendingReviewsExcel = () => {
    const rows = filteredPendingReviews.map((pv, idx) => ({
      'ردیف': idx + 1,
      'کد پیگیری': pv.trackingId,
      'شیت منبع': pv.mainSheet,
      'ردیف در اکسل منبع': pv.mainRecordId,
      'نام شهید یا عبارت': pv.nameOrPhrase,
      'عنوان کتاب': pv.bookTitle,
      'ناشر': pv.publisher || '',
      'موضوع ایراد / ابهام': pv.issueSubject,
      'اقدام پیشنهادی بازبین': pv.suggestedAction,
      'وضعیت پیگیری': pv.trackingStatus
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'موارد نیازمند بررسی');
    XLSX.writeFile(wb, `گزارش-مدیریتی-موارد-بلاتکلیف-${new Date().toISOString().slice(0, 10)}.xlsx`);
    onNotify(`گزارش اکسل موارد نیازمند بررسی شامل ${toPersianDigits(rows.length)} مورد دانلود شد.`);
  };

  // Export Pending Reviews CSV
  const exportPendingReviewsCsv = () => {
    const hdrs = [
      'کد پیگیری',
      'شیت منبع',
      'ردیف منبع',
      'نام شهید/عبارت',
      'عنوان کتاب',
      'ناشر',
      'موضوع ایراد',
      'اقدام پیشنهادی',
      'وضعیت پیگیری'
    ];
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      hdrs.map(cell).join(','),
      ...filteredPendingReviews.map((pv) =>
        [
          pv.trackingId,
          pv.mainSheet,
          pv.mainRecordId,
          pv.nameOrPhrase,
          pv.bookTitle,
          pv.publisher,
          pv.issueSubject,
          pv.suggestedAction,
          pv.trackingStatus
        ]
          .map(cell)
          .join(',')
      )
    ];
    const blob = new Blob(['\uFEFF', lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `گزارش-موارد-بلاتکلیف-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    onNotify('فایل CSV موارد نیازمند بررسی دانلود شد.');
  };


  // Export G001..G016 Human Review Excel (.xlsx)
  const exportGroupsExcel = () => {
    const rows = filteredMultiMartyrGroups.map((g, idx) => ({
      'ردیف': idx + 1,
      'شناسه موقت گروه': g.groupCode,
      'ردیف آغاز در Excel': g.startExcelRow,
      'مقدار ردیف منبع A': g.sourceRowA,
      'عنوان ثبت‌شده': g.registeredTitle,
      'ناشر ثبت‌شده': g.registeredPublisher,
      'تعداد ردیف شهید': g.martyrRowsCount,
      'ردیف‌های دارای مکان ناقص': g.incompleteGraveRows,
      'پرچم کنترل اولیه': g.initialFlag,
      'مرز گروه تأیید شد؟': g.boundaryApproved,
      'همه شهدا مرتبط‌اند؟': g.allMartyrsLinked,
      'وضعیت تصمیم بازبین': g.decisionStatus,
      'نام بازبین': g.reviewerName,
      'تاریخ بازبینی': g.reviewDate,
      'یادداشت بازبین': g.reviewNote
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '۱۶ گروه چندشهیدی');
    XLSX.writeFile(wb, `کاربرگ-۱۶-گروه-چندشهیدی-${new Date().toISOString().slice(0, 10)}.xlsx`);
    onNotify(`فایل اکسل ۱۶ گروه چندشهیدی شامل ${toPersianDigits(rows.length)} گروه دانلود شد.`);
  };

  // Export G001..G016 Human Review CSV
  const exportGroupsCsv = () => {
    const headers = [
      'شناسه موقت گروه',
      'ردیف آغاز در Excel',
      'مقدار ردیف منبع A',
      'عنوان ثبت‌شده',
      'ناشر ثبت‌شده',
      'تعداد ردیف شهید',
      'ردیف‌های دارای مکان ناقص',
      'مورد بازبینی اولیه',
      'مرز گروه تأیید می‌شود؟',
      'همه شهدا به همین کتاب مرتبط‌اند؟',
      'وضعیت تصمیم',
      'نام بازبین',
      'تاریخ بازبینی',
      'یادداشت بازبین'
    ];
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      headers.map(cell).join(','),
      ...filteredMultiMartyrGroups.map((g) =>
        [
          g.groupCode,
          g.startExcelRow,
          g.sourceRowA,
          g.registeredTitle,
          g.registeredPublisher,
          g.martyrRowsCount,
          g.incompleteGraveRows,
          g.initialFlag,
          g.boundaryApproved,
          g.allMartyrsLinked,
          g.decisionStatus,
          g.reviewerName,
          g.reviewDate,
          g.reviewNote
        ]
          .map(cell)
          .join(',')
      )
    ];

    const blob = new Blob(['\uFEFF', lines.join('\r\n')], {
      type: 'text/csv;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'کاربرگ-بازبینی-کارشناس-۱۶-گروه-چند-شهید.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    onNotify('فایل CSV کاربرگ بازبینی کارشناس ۱۶ گروه چندشهیدی دانلود شد.');
  };

  // Quick Action: Bulk approve & archive 16 groups (Directive #11: accurate link & group status synchronization)
  const handleBulkApproveAndArchive16Groups = () => {
    requestActionConfirmation({
      title: 'تأیید نهایی یکپارچه ۱۶ گروه چندشهیدی و بایگانی برگه',
      message: 'آیا از تأیید یکجای هر ۱۶ گروه کتاب‌های چندشهیدی (G001 تا G016) و همگام‌سازی پیوندهای مرتبط با وضعیت «تأییدشده کارشناسی» اطمینان دارید؟',
      confirmLabel: 'بله، هر ۱۶ گروه تأیید نهایی شود',
      variant: 'approve',
      onConfirm: () => {
        const groupTitlesNorm = new Set(
          multiMartyrGroups.map((g) => normalizePersianText(g.registeredTitle)).filter(Boolean)
        );
        multiMartyrGroups.forEach((grp) => {
          onUpdateGroupAudit({
            ...grp,
            boundaryApproved: 'بله',
            allMartyrsLinked: 'بله',
            decisionStatus: 'تأیید',
            reviewerName: grp.reviewerName || 'تأیید یکپارچه کارشناس',
            reviewDate: new Intl.DateTimeFormat('fa-IR').format(new Date()),
            reviewNote: grp.reviewNote || 'تأیید خوشه‌ای ۱۶ گروه چندشهیدی و همگام‌سازی پیوندهای مرتبط'
          });
        });

        // همگام‌سازی وضعیت پیوندهای مرتبط با این ۱۶ کتاب چندشهیدی به «تأییدشده کارشناسی»
        let updatedLinksCount = 0;
        links.forEach((lnk) => {
          const normBook = normalizePersianText(lnk.bookTitleRaw);
          if (normBook && groupTitlesNorm.has(normBook) && lnk.reviewStatus !== 'تأییدشده کارشناسی') {
            updatedLinksCount += 1;
            onUpdateLinkStatus(
              lnk.id,
              'تأییدشده کارشناسی',
              lnk.reviewerNote || 'تأییدشده در بازبینی خوشه‌ای ۱۶ گروه چندشهیدی'
            );
          }
        });

        setShowReviewQueuesPanel(false);
        onNotify(
          `وضعیت هر ۱۶ گروه چندشهیدی (G001 تا G016) به «تأیید» تغییر یافت${
            updatedLinksCount > 0
              ? ` و ${toPersianDigits(updatedLinksCount)} پیوند مرتبط نیز در دپوی اسناد «تأییدشده کارشناسی» شد`
              : ''
          }.`
        );
      }
    });
  };

  const openPendingCount = pendingReviews.filter((p) => p.trackingStatus === 'باز').length;
  const openGroupsCount = multiMartyrGroups.filter((g) => g.decisionStatus.includes('انتظار')).length;

  return (
    <div className="space-y-5">
      {/* نوار ۳ تب اصلی خلوت‌سازی‌شده پژوهش */}
      <div className="bg-white border border-[#E2D2BE] rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#EFE4D6] pb-2.5">
          <h2 className="text-base sm:text-lg font-bold text-[#332218]">
            پژوهش و پیوند کتاب‌ها با شهدای گلزار تهران
          </h2>
          <span className="text-xs text-[#6E5846]">
            انتخاب شهید یا کتاب در جداول زیر، پرونده ویرایش درجا را بدون تغییر صفحه باز می‌کند.
          </span>
        </div>

        {/* ۳ تب یک‌دست، تمام‌عرض و تراز در موبایل و دسکتاپ */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-1.5 bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl text-xs">
          <button
            type="button"
            onClick={() => {
              setSubView('workspace');
            }}
            className={`min-h-[44px] px-3 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-2 cursor-pointer text-center ${
              subView === 'workspace'
                ? 'bg-[#2B547E] text-white shadow-2xs'
                : 'bg-[#EDF4FB] text-[#1E3A5F] border border-[#C2D8EC] hover:bg-[#E1EEF9]'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>میز کار پیوند کتاب و شهید</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSubView('extracted');
              setExtractedPage(1);
            }}
            className={`min-h-[44px] px-3 py-2 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer text-center ${
              subView === 'extracted'
                ? 'bg-[#6B3E26] text-white shadow-2xs'
                : 'text-[#332218] hover:bg-[#EFE4D6] bg-white border border-[#E2D2BE]'
            }`}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>مطالب و صفحات استخراج‌شده ({toPersianDigits(extractedItems.length)})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSubView('publish_gateway');
              setPublishPage(1);
            }}
            className={`min-h-[44px] px-3 py-2 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer text-center ${
              subView === 'publish_gateway'
                ? 'bg-[#2E6F40] text-white shadow-2xs'
                : 'text-[#2E6F40] hover:bg-[#EAF4EC] bg-white border border-[#C6DFCD]'
            }`}
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>درگاه انتشار و خروجی سایت</span>
          </button>
        </div>
      </div>

      {/* SubView 1: میز کار یکپارچه پیوند کتاب و شهید (شامل صف بازبینی کشویی، انبار جامع و اکسل قطعات) */}
      {subView === 'workspace' && (
        <div className="space-y-4">
          {showReviewQueuesPanel && (
            <div className="bg-white border-2 border-[#6B3E26] rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EFE4D6] pb-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm sm:text-base font-bold text-[#332218] flex items-center gap-2">
                    <ClipboardCheck className="w-4 h-4 text-[#6B3E26] shrink-0" />
                    <span>صف بازبینی کارشناس: موارد نیازمند تکمیل و گروه‌های چندشهیدی</span>
                  </h3>
                  <p className="text-[11px] text-[#6E5846]">
                    بدون نیاز به تب جداگانه؛ تعیین تکلیف ردیف‌های نیازمند بررسی ({toPersianDigits(openPendingCount)} باز) و ۱۶ گروه چندشهیدی ({toPersianDigits(openGroupsCount)} در انتظار)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReviewQueuesPanel(false)}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#FAF5EE] hover:bg-[#F3E9DC] border border-[#D8C7B2] text-[#332218] text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer self-start sm:self-auto"
                >
                  <X className="w-4 h-4" />
                  <span>بستن پنل بازبینی</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1 bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => setReviewQueueTab('pending567')}
                  className={`min-h-[40px] px-3 py-2 rounded-lg font-bold transition-colors cursor-pointer text-center ${
                    reviewQueueTab === 'pending567'
                      ? 'bg-[#8C5208] text-white shadow-2xs'
                      : 'text-[#5C4033] hover:bg-[#EFE4D6]'
                  }`}
                >
                  صف موارد نیازمند بررسی ({toPersianDigits(openPendingCount)} باز از {toPersianDigits(pendingReviews.length)})
                </button>
                <button
                  type="button"
                  onClick={() => setReviewQueueTab('groups16')}
                  className={`min-h-[40px] px-3 py-2 rounded-lg font-bold transition-colors cursor-pointer text-center ${
                    reviewQueueTab === 'groups16'
                      ? 'bg-[#1F4E79] text-white shadow-2xs'
                      : 'text-[#5C4033] hover:bg-[#EFE4D6]'
                  }`}
                >
                  کاربرگ ۱۶ گروه چندشهیدی G001..G016 ({toPersianDigits(openGroupsCount)} در انتظار)
                </button>
              </div>

              {reviewQueueTab === 'pending567' && (() => {
                const pvTotalCount = filteredPendingReviews.length;
                const pvTotalPages =
                  pendingPageSize === 'all' ? 1 : Math.max(1, Math.ceil(pvTotalCount / pendingPageSize));
                const pvSafePage = Math.min(pendingPage, pvTotalPages);
                const pvStartIdx = pendingPageSize === 'all' ? 0 : (pvSafePage - 1) * pendingPageSize;
                const visiblePendingRows =
                  pendingPageSize === 'all'
                    ? filteredPendingReviews
                    : filteredPendingReviews.slice(pvStartIdx, pvStartIdx + pendingPageSize);

                return (
                  <div className="space-y-4">
                    <div className="bg-[#fff8ea] border border-[#f5dfad] rounded-2xl p-3.5 text-xs space-y-1">
                      <div className="font-bold text-[#8c5208] flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>میز تخصصی رفع اشکال و تکمیل موارد نیازمند بررسی ({toPersianDigits(pendingReviews.length)} سطر):</span>
                      </div>
                      <p className="text-slate-700 leading-relaxed">
                        با زدن دکمه <strong>«بررسی و تکمیل اطلاعات»</strong>، اطلاعات مستند را وارد کنید تا مورد به وضعیت «بررسی‌شده» منتقل شده و در صورت تأیید مستقیماً به پیوندهای معتبر کتاب و شهید اضافه شود.
                      </p>
                    </div>

                    <div className="bg-[#FAF5EE]/60 border border-[#E2D2BE] rounded-2xl p-3.5 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="relative flex-1">
                          <Search className="w-4 h-4 text-[#6E5846] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="search"
                            value={pendingSearchQuery}
                            onChange={(e) => {
                              setPendingSearchQuery(e.target.value);
                              setPendingPage(1);
                            }}
                            placeholder="جست‌وجو در موارد نیازمند بررسی (کد PV، عنوان کتاب، نام شهید، موضوع)..."
                            className="w-full min-h-[42px] pr-10 pl-3 py-2 text-xs bg-white border border-[#D8C7B2] rounded-xl focus:outline-none focus:border-[#6B3E26]"
                          />
                        </div>
                        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 w-full sm:w-auto shrink-0">
                          <button
                            type="button"
                            data-testid="pending-reviews-excel-export-btn"
                            onClick={exportPendingReviewsExcel}
                            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#2E6F40] hover:bg-[#235632] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <FileSpreadsheet className="w-4 h-4 shrink-0" />
                            <span>خروجی Excel</span>
                          </button>

                          <button
                            type="button"
                            onClick={exportPendingReviewsCsv}
                            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white border border-[#D8C7B2] hover:bg-[#F3E9DC] text-[#332218] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5 shrink-0" />
                            <span>خروجی CSV</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 pt-2 border-t border-[#E2D2BE] text-xs">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 flex-1">
                          {(
                            [
                              {
                                key: 'open',
                                label: `در انتظار بررسی (${toPersianDigits(
                                  pendingReviews.filter((p) => p.trackingStatus === 'باز').length
                                )})`
                              },
                              {
                                key: 'reviewed',
                                label: `بررسی‌شده (${toPersianDigits(
                                  pendingReviews.filter((p) => p.trackingStatus === 'بررسی‌شده').length
                                )})`
                              },
                              {
                                key: 'needs_source',
                                label: `نیازمند منبع (${toPersianDigits(
                                  pendingReviews.filter((p) => p.trackingStatus === 'نیازمند منبع').length
                                )})`
                              },
                              {
                                key: 'all',
                                label: `همه (${toPersianDigits(pendingReviews.length)})`
                              }
                            ] as const
                          ).map((tab) => (
                            <button
                              key={tab.key}
                              type="button"
                              onClick={() => {
                                setPendingStatusFilter(tab.key);
                                setPendingPage(1);
                              }}
                              className={`min-h-[36px] px-2.5 py-1.5 rounded-xl font-bold transition-colors flex items-center justify-center text-center cursor-pointer ${
                                pendingStatusFilter === tab.key
                                  ? 'bg-[#1F4E79] text-white'
                                  : 'bg-white border border-[#D8C7B2] text-[#332218] hover:bg-[#F3E9DC]'
                              }`}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] text-[#6E5846]">تعداد در صفحه:</span>
                          <select
                            value={String(pendingPageSize)}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPendingPageSize(val === 'all' ? 'all' : Number(val));
                              setPendingPage(1);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-white border border-[#D8C7B2] text-[#332218] font-bold text-xs cursor-pointer"
                          >
                            <option value="20">۲۰ مورد</option>
                            <option value="50">۵۰ مورد</option>
                            <option value="100">۱۰۰ مورد</option>
                            <option value="200">۲۰۰ مورد</option>
                            <option value="all">نمایش همه ({toPersianDigits(pvTotalCount)})</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {activeReviewPv && (
                      <ModalWindow
                        onClose={() => setActiveReviewPv(null)}
                        title={`بررسی، رفع اشکال و تکمیل اطلاعات (${activeReviewPv.trackingId})`}
                        maxWidthClass="max-w-2xl"
                      >
                        <div className="bg-[#F6EFE6] border border-[#E2D2BE] rounded-xl p-3 flex items-center justify-between mb-3">
                          <div className="space-y-0.5">
                            <h3 className="text-xs sm:text-sm font-bold text-[#332218] flex items-center gap-2">
                              <span>بررسی، رفع اشکال و تکمیل اطلاعات</span>
                              <span className="font-mono bg-white border border-[#E2D2BE] px-2 py-0.5 rounded text-xs text-[#6B3E26]" dir="ltr">
                                {activeReviewPv.trackingId}
                              </span>
                            </h3>
                            <p className="text-[11px] text-[#78604E]">
                              شیت مبدأ: {activeReviewPv.mainSheet} · رکورد مرجع: {activeReviewPv.mainRecordId}
                            </p>
                          </div>
                        </div>

                        <form onSubmit={handleSavePvReview} className="space-y-4 text-xs">
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5">
                            <div className="text-slate-800 font-bold text-sm">
                              کتاب: {activeReviewPv.bookTitle}{' '}
                              <span className="text-xs font-normal text-slate-500">
                                ({activeReviewPv.publisher})
                              </span>
                            </div>
                            {activeReviewPv.nameOrPhrase && (
                              <div className="text-slate-700">
                                عبارت ثبت‌شده در منبع: <strong className="text-[#1f4e79]">{activeReviewPv.nameOrPhrase}</strong>
                              </div>
                            )}
                            <div className="text-amber-900 font-semibold pt-1 border-t border-slate-200">
                              موضوع اشکال: {activeReviewPv.issueSubject}
                            </div>
                            <div className="text-slate-600">
                              اقدام پیشنهادی کارشناس ارشد: {activeReviewPv.suggestedAction}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <label className="block font-bold text-slate-800 mb-1">
                                نام شهید مستند و اصلاح‌شده *
                              </label>
                              <input
                                type="text"
                                required
                                value={pvMartyrName}
                                onChange={(e) => setPvMartyrName(e.target.value)}
                                placeholder="نام و نام خانوادگی شهید..."
                                className="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900"
                              />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block font-bold text-slate-800 mb-1">
                                  شماره صفحه در کتاب (ارجاع صفحه) *
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={pvPageRef}
                                  onChange={(e) => setPvPageRef(e.target.value)}
                                  placeholder="مثال: صص ۱۴-۱۸ یا ص ۴۲"
                                  className="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-300 rounded-xl tabular-nums"
                                />
                              </div>

                              <div>
                                <label className="block font-bold text-slate-800 mb-1">
                                  تصمیم نهایی کارشناس *
                                </label>
                                <select
                                  value={pvTargetStatus}
                                  onChange={(e) => setPvTargetStatus(e.target.value)}
                                  className="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-[#1f4e79]"
                                >
                                  <option value="approved_to_links">
                                    تکمیل و تأیید شد (انتقال به پیوندهای معتبر کتاب و شهید)
                                  </option>
                                  <option value="reviewed_no_change">بررسی شد - بدون نیاز به تغییر</option>
                                  <option value="needs_source">نیازمند منبع تکمیلی / استخراج مجدد</option>
                                  <option value="rejected">رد پیوند (فاقد ارتباط معتبر)</option>
                                </select>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="block font-medium text-slate-700 mb-1">قطعه مزار</label>
                                <input
                                  type="text"
                                  value={pvGravePiece}
                                  onChange={(e) => setPvGravePiece(e.target.value)}
                                  placeholder="26"
                                  className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl tabular-nums"
                                />
                              </div>
                              <div>
                                <label className="block font-medium text-slate-700 mb-1">ردیف مزار</label>
                                <input
                                  type="text"
                                  value={pvGraveRow}
                                  onChange={(e) => setPvGraveRow(e.target.value)}
                                  placeholder="12"
                                  className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl tabular-nums"
                                />
                              </div>
                              <div>
                                <label className="block font-medium text-slate-700 mb-1">شماره قبر</label>
                                <input
                                  type="text"
                                  value={pvGraveNumber}
                                  onChange={(e) => setPvGraveNumber(e.target.value)}
                                  placeholder="5"
                                  className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl tabular-nums"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block font-medium text-slate-700 mb-1">
                                یادداشت و دلیل تصمیم کارشناسی:
                              </label>
                              <input
                                type="text"
                                value={pvReviewerNote}
                                onChange={(e) => setPvReviewerNote(e.target.value)}
                                placeholder="توضیح درباره صحت منبع، تطبیق با گلزار یا مستندات صفحه..."
                                className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl"
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                            <button
                              type="button"
                              onClick={() => setActiveReviewPv(null)}
                              className="min-h-[42px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer"
                            >
                              انصراف
                            </button>
                            <button
                              type="submit"
                              className="min-h-[42px] px-5 py-2 bg-[#2E6F40] hover:bg-[#235632] text-white rounded-xl font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                            >
                              <Check className="w-4 h-4" />
                              <span>ثبت نهایی و ذخیره در پرونده</span>
                            </button>
                          </div>
                        </form>
                      </ModalWindow>
                    )}

                    <div className="space-y-2.5">
                      {pvTotalCount === 0 ? (
                        <div className="bg-[#FAF5EE] border border-[#E2D2BE] rounded-2xl p-6 text-center text-[#5C4033] space-y-1.5 text-xs">
                          <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto" />
                          <p className="font-bold text-[#332218]">هیچ موردی با فیلتر انتخابی یافت نشد.</p>
                        </div>
                      ) : (
                        visiblePendingRows.map((pv) => (
                          <div
                            key={pv.trackingId}
                            className="bg-white border border-[#E2D2BE] rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:border-[#C5AD91] transition-colors"
                          >
                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 text-[#6E5846]">
                                <span className="font-mono font-bold text-[#1F4E79]" dir="ltr">
                                  {pv.trackingId}
                                </span>
                                <span>·</span>
                                <span>شیت: {pv.mainSheet}</span>
                                <span>·</span>
                                <span className="font-mono font-semibold text-[#332218]" dir="ltr">
                                  {pv.mainRecordId}
                                </span>
                                <span
                                  className={`mr-auto px-2 py-0.5 rounded-md font-bold text-[11px] ${
                                    pv.trackingStatus === 'بررسی‌شده'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : pv.trackingStatus === 'نیازمند منبع'
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-amber-100 text-amber-900'
                                  }`}
                                >
                                  وضعیت: {pv.trackingStatus}
                                </span>
                              </div>

                              <div className="text-sm font-bold text-[#332218] break-words">
                                <span>{pv.bookTitle}</span>{' '}
                                <span className="font-normal text-[#6E5846]">({pv.publisher})</span>
                                {pv.nameOrPhrase && pv.nameOrPhrase !== '*' && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenMartyrInspector(pv.nameOrPhrase)}
                                    className="text-[#1F4E79] hover:underline mr-2 font-bold cursor-pointer"
                                  >
                                    — {pv.nameOrPhrase}
                                  </button>
                                )}
                              </div>

                              <div className="text-amber-900 font-medium">موضوع بررسی: {pv.issueSubject}</div>
                              <div className="text-[#5C4033]">اقدام پیشنهادی: {pv.suggestedAction}</div>
                            </div>

                            <div className="shrink-0 flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenPvReview(pv)}
                                className="min-h-[38px] px-3 py-1.5 bg-[#1F4E79] hover:bg-[#163A5B] text-white rounded-xl font-bold inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                <span>بررسی و تکمیل ✍️</span>
                              </button>

                              <select
                                value={pv.trackingStatus}
                                onChange={(e) => {
                                  const nextStatus = e.target.value;
                                  requestActionConfirmation({
                                    title: 'تأیید تغییر وضعیت مورد نیازمند بررسی',
                                    message: `آیا از تغییر وضعیت مورد ${pv.trackingId} (کتاب «${pv.bookTitle}») به «${nextStatus}» اطمینان دارید؟`,
                                    confirmLabel: 'بله، وضعیت تغییر کند',
                                    variant: 'approve',
                                    onConfirm: () => {
                                      onUpdatePendingReviewStatus(pv.trackingId, nextStatus);
                                      onNotify(`وضعیت مورد ${pv.trackingId} به «${nextStatus}» تغییر یافت.`);
                                    }
                                  });
                                }}
                                className={`min-h-[38px] px-2.5 py-1.5 rounded-xl border font-bold text-xs ${
                                  pv.trackingStatus === 'بررسی‌شده'
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                    : 'bg-amber-50 border-amber-300 text-amber-900'
                                }`}
                              >
                                <option value="باز">باز</option>
                                <option value="بررسی‌شده">بررسی‌شده</option>
                                <option value="نیازمند منبع">نیازمند منبع</option>
                              </select>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {pvTotalCount > 0 && (
                      <div className="p-3 bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="text-[#5C4033]">
                          {pendingPageSize === 'all' ? (
                            <span>نمایش یکجای تمام {toPersianDigits(pvTotalCount)} مورد</span>
                          ) : (
                            <span>
                              صفحه <strong>{toPersianDigits(pvSafePage)}</strong> از{' '}
                              <strong>{toPersianDigits(pvTotalPages)}</strong> (مورد {toPersianDigits(pvStartIdx + 1)} تا{' '}
                              {toPersianDigits(Math.min(pvTotalCount, pvStartIdx + (pendingPageSize as number)))} از{' '}
                              {toPersianDigits(pvTotalCount)})
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {pendingPageSize !== 'all' && pvTotalPages > 1 && (
                            <>
                              <button
                                type="button"
                                disabled={pvSafePage <= 1}
                                onClick={() => setPendingPage((p) => Math.max(1, p - 1))}
                                className="px-3 py-1 rounded-lg bg-white border border-[#D8C7B2] text-[#332218] font-bold disabled:opacity-40 cursor-pointer"
                              >
                                → صفحه قبل
                              </button>
                              <button
                                type="button"
                                disabled={pvSafePage >= pvTotalPages}
                                onClick={() => setPendingPage((p) => Math.min(pvTotalPages, p + 1))}
                                className="px-3 py-1 rounded-lg bg-[#1F4E79] text-white font-bold disabled:opacity-40 cursor-pointer"
                              >
                                صفحه بعد ←
                              </button>
                            </>
                          )}
                          {pendingPageSize !== 'all' ? (
                            <button
                              type="button"
                              onClick={() => {
                                setPendingPageSize('all');
                                setPendingPage(1);
                              }}
                              className="px-3 py-1 rounded-lg bg-white border border-[#6B3E26] text-[#6B3E26] font-bold cursor-pointer"
                            >
                              نمایش همه ({toPersianDigits(pvTotalCount)})
                            </button>
                          ) : (
                            pvTotalCount > 20 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPendingPageSize(20);
                                  setPendingPage(1);
                                }}
                                className="px-3 py-1 rounded-lg bg-white border border-[#D8C7B2] text-[#5C4033] font-bold cursor-pointer"
                              >
                                صفحه‌بندی (۲۰تایی)
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {reviewQueueTab === 'groups16' && (
                <div className="space-y-4">
                  <div className="bg-[#fff9f0] border border-[#f5dfad] rounded-2xl p-3.5 text-xs space-y-1">
                    <div className="font-bold text-[#8c5208] flex items-center gap-1.5">
                      <ClipboardCheck className="w-4 h-4 shrink-0" />
                      <span>کاربرگ بازبینی ۱۶ گروه کتاب‌های چندشهیدی (شیت ۳ اکسل مرجع):</span>
                    </div>
                    <p className="text-slate-700 leading-relaxed">
                      در این بخش مشخص می‌شود آیا تمام شهدای گروه به همین کتاب متعلق‌اند و مرز گروه در اکسل دقیق تفکیک شده است یا خیر.
                    </p>
                  </div>

                  <div className="bg-[#FAF5EE]/60 border border-[#E2D2BE] rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-[#6E5846] font-medium ml-1">فیلتر بازبینی:</span>
                      {(
                        [
                          { key: 'all', label: `همه (${toPersianDigits(multiMartyrGroups.length)})` },
                          {
                            key: 'pending',
                            label: `در انتظار (${toPersianDigits(
                              multiMartyrGroups.filter((g) => g.decisionStatus.includes('انتظار')).length
                            )})`
                          },
                          {
                            key: 'approved',
                            label: `تأییدشده (${toPersianDigits(
                              multiMartyrGroups.filter((g) => g.decisionStatus === 'تأیید').length
                            )})`
                          },
                          {
                            key: 'rejected',
                            label: `پیگیری / رد (${toPersianDigits(
                              multiMartyrGroups.filter((g) => g.decisionStatus === 'رد' || g.decisionStatus === 'نیازمند پیگیری').length
                            )})`
                          }
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setGroupsStatusFilter(tab.key)}
                          className={`px-3 py-1.5 rounded-xl font-bold transition-colors cursor-pointer ${
                            groupsStatusFilter === tab.key
                              ? 'bg-[#1F4E79] text-white'
                              : 'bg-white border border-[#D8C7B2] text-[#332218] hover:bg-[#F3E9DC]'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 w-full sm:w-auto shrink-0">
                      <button
                        type="button"
                        onClick={handleBulkApproveAndArchive16Groups}
                        className="col-span-2 sm:col-span-1 min-h-[38px] px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>تأیید یکپارچه ۱۶ گروه</span>
                      </button>

                      <button
                        type="button"
                        onClick={exportGroupsExcel}
                        className="min-h-[38px] px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-bold rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>اکسل ۱۶ گروه</span>
                      </button>

                      <button
                        type="button"
                        onClick={exportGroupsCsv}
                        className="min-h-[38px] px-3 py-1.5 bg-white border border-[#D8C7B2] hover:bg-[#F3E9DC] text-[#332218] text-xs font-semibold rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-4 h-4 shrink-0" />
                        <span>CSV</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {filteredMultiMartyrGroups.map((grp) => {
                      const isEditing = editingGroupCode === grp.groupCode;
                      return (
                        <div
                          key={grp.groupCode}
                          className="bg-white border border-[#E2D2BE] rounded-2xl p-4 space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <span
                                className="font-mono font-bold text-sm px-2.5 py-1 rounded-lg bg-[#edf4fa] text-[#1f4e79]"
                                dir="ltr"
                              >
                                {grp.groupCode}
                              </span>
                              <div>
                                <h4 className="font-bold text-sm sm:text-base text-[#332218]">
                                  {grp.registeredTitle}
                                </h4>
                                <p className="text-xs text-[#6E5846]">
                                  ناشر: {grp.registeredPublisher} · ردیف آغاز در Excel:{' '}
                                  {toPersianDigits(grp.startExcelRow)} · تعداد ردیف شهید:{' '}
                                  <strong>{toPersianDigits(grp.martyrRowsCount)}</strong>
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span
                                className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                                  grp.decisionStatus === 'تأیید'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : grp.decisionStatus === 'رد'
                                    ? 'bg-red-100 text-red-800'
                                    : grp.decisionStatus === 'نیازمند پیگیری'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {grp.decisionStatus}
                              </span>
                              <button
                                type="button"
                                onClick={() => setEditingGroupCode(isEditing ? null : grp.groupCode)}
                                className="min-h-[38px] px-3.5 py-1.5 text-xs font-bold border border-[#1f4e79] text-[#1f4e79] rounded-xl hover:bg-blue-50 cursor-pointer"
                              >
                                {isEditing ? 'بستن فرم بازبینی' : 'ثبت نظر بازبین ✍️'}
                              </button>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-xs text-[#5C4033] pt-1">
                            <span>
                              ردیف‌های دارای مکان ناقص:{' '}
                              <strong className={grp.incompleteGraveRows !== 'ندارد' ? 'text-amber-800' : 'text-[#332218]'}>
                                {toPersianDigits(grp.incompleteGraveRows)}
                              </strong>
                            </span>
                            <span>·</span>
                            <span>پرچم کنترل اولیه: {grp.initialFlag}</span>
                            {grp.reviewerName && (
                              <>
                                <span>·</span>
                                <span className="text-[#1f4e79] font-medium">
                                  بازبین: {grp.reviewerName} ({grp.reviewDate})
                                </span>
                              </>
                            )}
                          </div>

                          {isEditing && (
                            <div className="pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs bg-slate-50 p-4 rounded-xl">
                              <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                  مرز گروه تأیید می‌شود؟
                                </label>
                                <select
                                  value={grp.boundaryApproved}
                                  onChange={(e) =>
                                    onUpdateGroupAudit({
                                      ...grp,
                                      boundaryApproved: e.target.value as MultiMartyrGroupAudit['boundaryApproved']
                                    })
                                  }
                                  className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl"
                                >
                                  <option value="نامشخص">نامشخص</option>
                                  <option value="بله">بله</option>
                                  <option value="خیر">خیر</option>
                                </select>
                              </div>

                              <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                  همه شهدا به همین کتاب مرتبط‌اند؟
                                </label>
                                <select
                                  value={grp.allMartyrsLinked}
                                  onChange={(e) =>
                                    onUpdateGroupAudit({
                                      ...grp,
                                      allMartyrsLinked: e.target.value as MultiMartyrGroupAudit['allMartyrsLinked']
                                    })
                                  }
                                  className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl"
                                >
                                  <option value="نامشخص">نامشخص</option>
                                  <option value="بله">بله</option>
                                  <option value="خیر">خیر</option>
                                </select>
                              </div>

                              <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                  وضعیت تصمیم بازبین:
                                </label>
                                <select
                                  value={grp.decisionStatus}
                                  onChange={(e) =>
                                    onUpdateGroupAudit({
                                      ...grp,
                                      decisionStatus: e.target.value as MultiMartyrGroupAudit['decisionStatus'],
                                      reviewDate: new Intl.DateTimeFormat('fa-IR').format(new Date())
                                    })
                                  }
                                  className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl font-bold text-[#1f4e79]"
                                >
                                  <option value="در انتظار بازبینی کارشناس">در انتظار بازبینی کارشناس</option>
                                  <option value="تأیید">تأیید</option>
                                  <option value="نیازمند پیگیری">نیازمند پیگیری</option>
                                  <option value="رد">رد</option>
                                </select>
                              </div>

                              <div>
                                <label className="block font-semibold text-slate-700 mb-1">نام بازبین:</label>
                                <input
                                  type="text"
                                  value={grp.reviewerName}
                                  onChange={(e) =>
                                    onUpdateGroupAudit({
                                      ...grp,
                                      reviewerName: e.target.value,
                                      reviewDate: new Intl.DateTimeFormat('fa-IR').format(new Date())
                                    })
                                  }
                                  placeholder="نام کارشناس"
                                  className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl"
                                />
                              </div>

                              <div className="sm:col-span-2 lg:col-span-4">
                                <label className="block font-semibold text-slate-700 mb-1">
                                  دلیل تصمیم / یادداشت استنادی ردیف‌های منبع:
                                </label>
                                <input
                                  type="text"
                                  value={grp.reviewNote}
                                  onChange={(e) =>
                                    onUpdateGroupAudit({
                                      ...grp,
                                      reviewNote: e.target.value
                                    })
                                  }
                                  placeholder="توضیح درباره مرز گروه، شکست خط عنوان یا وضعیت مزار ناقص..."
                                  className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl"
                                />
                              </div>

                              <div className="sm:col-span-2 lg:col-span-4 flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                                <button
                                  type="button"
                                  onClick={() => setEditingGroupCode(null)}
                                  className="min-h-[38px] px-3.5 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-medium"
                                >
                                  بستن
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    requestActionConfirmation({
                                      title: 'تأیید نهایی تصمیم بازبین برای گروه چندشهیدی',
                                      message: `آیا از ثبت و ذخیره نهایی تصمیم «${grp.decisionStatus}» برای گروه ${grp.groupCode} («${grp.registeredTitle}») اطمینان دارید؟`,
                                      confirmLabel: 'بله، تصمیم ثبت نهایی شود',
                                      variant: grp.decisionStatus === 'رد' ? 'delete' : 'approve',
                                      onConfirm: () => {
                                        setEditingGroupCode(null);
                                        onNotify(`تصمیم کارشناس برای گروه ${grp.groupCode} با موفقیت در سامانه ثبت شد.`);
                                      }
                                    });
                                  }}
                                  className="min-h-[38px] px-5 py-1.5 bg-[#1f4e79] hover:bg-[#163a5b] text-white rounded-xl font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                                >
                                  <Check className="w-4 h-4" />
                                  <span>ثبت و ذخیره نهایی تصمیم بازبین</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <DepositoryAndExportHub
            catalogRows={catalogRows}
            auditRecords={auditRecords}
            bookCopies={bookCopies}
            links={links}
            pendingReviews={pendingReviews}
            workbookMartyrs={workbookMartyrs}
            extractedItems={extractedItems}
            pendingReviewsOpenCount={openPendingCount}
            openGroupsCount={openGroupsCount}
            onOpenAddLink={() => setShowAddLink(true)}
            onOpenReviewQueues={(target) => {
              if (target) setReviewQueueTab(target);
              setShowReviewQueuesPanel((prev) => !prev);
            }}
            onExportGhatatExcel={handleExportGhatatExcel}
            onExtractPassageFromLink={(linkId) => {
              const lnk = links.find((l) => l.id === linkId);
              if (lnk) handleStartExtractFromLink(lnk);
            }}
            onQuickEditLink={handleOpenLinkEditor}
            onQuickDeleteLink={handleConfirmDeleteLink}
            onQuickUpdateLinkStatus={(linkId, nextStatus) => {
              const lnk = links.find((l) => l.id === linkId);
              if (!lnk) return;
              const meta = resolveLiveBookMeta(lnk.tempBookId, lnk.bookTitleRaw, lnk.publisherRaw);
              requestActionConfirmation({
                title: 'تأیید نهایی پیوند کتاب و شهید',
                message: `آیا از ثبت وضعیت «${nextStatus}» برای پیوند ${lnk.id} («${lnk.martyrNameRaw}» — کتاب «${meta.title}») اطمینان دارید؟`,
                confirmLabel: 'بله، تأیید شود',
                variant: 'approve',
                onConfirm: () => {
                  onUpdateLinkStatus(lnk.id, nextStatus, lnk.reviewerNote || 'تأیید کارشناسی در میز پژوهش');
                  onNotify(`پیوند ${lnk.id} به وضعیت «${nextStatus}» به‌روزرسانی شد.`);
                }
              });
            }}
            onInspectBook={handleOpenBookInspector}
            onInspectMartyr={(martyrName) => handleOpenMartyrInspector(martyrName)}
            onNotify={onNotify}
            onJumpToSmartSearch={onJumpToSmartSearch}
          />
        </div>
      )}

      {/* مودال ثبت پیوند جدید کتاب و شهید (بدون نیاز به تب تکراری) */}
      {showAddLink && (
        <ModalWindow
          onClose={() => setShowAddLink(false)}
          title="ثبت ارتباط پژوهشی جدید کتاب و شهید"
          maxWidthClass="max-w-3xl"
        >
          <form onSubmit={handleCreateLink} className="space-y-4 text-xs">
            <div>
              <BookLiveSearchPicker
                books={linkableBooks}
                selectedBookId={selectedBookId}
                onSelectBook={setSelectedBookId}
                query={linkBookSearchQuery}
                onQueryChange={setLinkBookSearchQuery}
                label="کتاب مرجع (جست‌وجوی زنده نام کتاب یا شماره قفسه) *"
                placeholder="نام کتاب، شماره قفسه (SH-01 / قفسه ۱) یا کد BK..."
                inputTestId="research-link-book-search-input"
                listTestId="research-link-book-options-list"
                bannerTestId="research-link-book-banner"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-[#332218] mb-1">
                  نام شهید یا عبارت مرتبط (عین منبع) *
                </label>
                <input
                  type="text"
                  required
                  value={martyrName}
                  onChange={(e) => setMartyrName(e.target.value)}
                  placeholder="مثال: احمد بیابانی"
                  className="w-full min-h-[42px] px-3 py-2 bg-white border border-[#D8C7B2] rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-[#332218] mb-1">
                  ارجاع صفحه خام (مثال: ۱۷۳تا۱۸۴ یا ص ۴۵)
                </label>
                <input
                  type="text"
                  value={pageRefRaw}
                  onChange={(e) => setPageRefRaw(e.target.value)}
                  placeholder="مثال: ص 45 تا 52"
                  className="w-full min-h-[42px] px-3 py-2 bg-white border border-[#D8C7B2] rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              <div>
                <label className="block font-medium text-[#5C4033] mb-1">قطعه مزار خام</label>
                <input
                  type="text"
                  value={gravePiece}
                  onChange={(e) => setGravePiece(e.target.value)}
                  placeholder="24"
                  className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#D8C7B2] rounded-xl tabular-nums"
                />
              </div>
              <div>
                <label className="block font-medium text-[#5C4033] mb-1">ردیف مزار خام</label>
                <input
                  type="text"
                  value={graveRow}
                  onChange={(e) => setGraveRow(e.target.value)}
                  placeholder="77"
                  className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#D8C7B2] rounded-xl tabular-nums"
                />
              </div>
              <div>
                <label className="block font-medium text-[#5C4033] mb-1">شماره مزار خام</label>
                <input
                  type="text"
                  value={graveNumber}
                  onChange={(e) => setGraveNumber(e.target.value)}
                  placeholder="52"
                  className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#D8C7B2] rounded-xl tabular-nums"
                />
              </div>
              <div className="col-span-3 sm:col-span-1 flex items-end">
                <label className="inline-flex items-center gap-2 min-h-[40px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isGroupPhrase}
                    onChange={(e) => setIsGroupPhrase(e.target.checked)}
                    className="w-4 h-4 accent-[#6B3E26]"
                  />
                  <span className="text-[#332218] font-medium">عبارت گروهی است</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-[#5C4033] mb-1">شرح ارتباط / توضیح منبع</label>
                <input
                  type="text"
                  value={sourceDesc}
                  onChange={(e) => setSourceDesc(e.target.value)}
                  placeholder="توضیح ثبت‌شده در شیت یا نوع مطلب..."
                  className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#D8C7B2] rounded-xl"
                />
              </div>
              <div>
                <label className="block font-medium text-[#5C4033] mb-1">یادداشت کارشناس بازبین</label>
                <input
                  type="text"
                  value={reviewerNote}
                  onChange={(e) => setReviewerNote(e.target.value)}
                  placeholder="یادداشت تصمیم یا ابهام..."
                  className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#D8C7B2] rounded-xl"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#EFE4D6]">
              <button
                type="button"
                onClick={() => setShowAddLink(false)}
                className="min-h-[42px] px-4 py-2 bg-[#FAF5EE] border border-[#D8C7B2] text-[#332218] font-bold rounded-xl cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="min-h-[42px] px-5 py-2 bg-[#1F4E79] hover:bg-[#163A5B] text-white font-bold rounded-xl cursor-pointer"
              >
                ذخیره ارتباط در سامانه
              </button>
            </div>
          </form>
        </ModalWindow>
      )}

      {/* SubView 1.5: Extracted Content & Page Passages (ثبت، مدیریت و مرور کامل مطالب و صفحات استخراج‌شده) */}
      {subView === 'extracted' && (() => {
        const totalExtractedCount = filteredExtractedItems.length;
        const exTotalPages =
          extractedPageSize === 'all' ? 1 : Math.max(1, Math.ceil(totalExtractedCount / extractedPageSize));
        const exSafePage = Math.min(extractedPage, exTotalPages);
        const exStartIdx = extractedPageSize === 'all' ? 0 : (exSafePage - 1) * extractedPageSize;
        const visibleExtractedRows =
          extractedPageSize === 'all'
            ? filteredExtractedItems
            : filteredExtractedItems.slice(exStartIdx, exStartIdx + extractedPageSize);

        const uniqueExtractedMartyrs = new Set(extractedItems.map((i) => i.martyrNameRaw)).size;
        const uniqueExtractedBooks = new Set(extractedItems.map((i) => i.tempBookId || i.bookTitleRaw)).size;

        return (
          <div className="space-y-4">
            {/* خلاصه کاربردی و نوار ابزار بخش مطالب و صفحات استخراج‌شده */}
            <div className="bg-white border border-[#E2D2BE] rounded-2xl p-4 space-y-3.5 shadow-2xs">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[#EFE4D6] pb-3">
                <div className="space-y-1">
                  <h3 className="text-sm sm:text-base font-bold text-[#332218] flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#6B3E26]" />
                    <span>
                      بانک مطالب و صفحات استخراج‌شده از کتاب‌ها ({toPersianDigits(extractedItems.length)} مورد)
                    </span>
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-[#6E5846]">
                    <span>
                      شهدای دارای ارجاع صفحه: <strong className="text-[#332218]">{toPersianDigits(uniqueExtractedMartyrs)} شهید</strong>
                    </span>
                    <span>·</span>
                    <span>
                      کتاب‌های دارای ارجاع صفحه: <strong className="text-[#332218]">{toPersianDigits(uniqueExtractedBooks)} کتاب</strong>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:flex lg:flex-wrap items-center gap-1.5 sm:gap-2 w-full lg:w-auto shrink-0">
                  <button
                    type="button"
                    onClick={exportExtractedExcel}
                    className="col-span-2 lg:col-span-1 min-h-[38px] px-3.5 py-1.5 bg-[#2E6F40] hover:bg-[#235632] text-white rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 shrink-0" />
                    <span>دانلود اکسل مطالب و صفحات</span>
                  </button>

                  <button
                    type="button"
                    onClick={exportExtractedCsv}
                    className="min-h-[38px] px-2.5 sm:px-3 py-1.5 bg-[#FAF5EE] hover:bg-[#F3E9DC] text-[#332218] border border-[#D8C7B2] rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-[#6B3E26] shrink-0" />
                    <span>خروجی CSV</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowAddExtracted((prev) => !prev)}
                    className="min-h-[38px] px-2.5 sm:px-3.5 py-1.5 bg-[#6B3E26] hover:bg-[#56311E] text-white rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4 shrink-0" />
                    <span>{showAddExtracted ? 'بستن فرم ثبت' : 'ثبت مطلب جدید'}</span>
                  </button>
                </div>
              </div>

              {/* کادر جست‌وجو + فیلتر نوع مطلب + سوییچ نمایش کارتی/جدولی */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
                <div className="md:col-span-6 relative">
                  <Search className="w-4 h-4 text-[#6E5846] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={extractedSearchQuery}
                    onChange={(e) => {
                      setExtractedSearchQuery(e.target.value);
                      setExtractedPage(1);
                    }}
                    placeholder="جست‌وجو در نام شهید، عنوان کتاب، متن مطلب، شماره صفحه یا کد EX-0001..."
                    className="w-full min-h-[42px] pr-10 pl-3 py-2 text-xs sm:text-sm bg-[#FAF5EE] border border-[#D8C7B2] rounded-xl focus:bg-white focus:outline-none focus:border-[#6B3E26]"
                  />
                </div>

                <div className="md:col-span-3">
                  <select
                    value={contentTypeFilter}
                    onChange={(e) => {
                      setContentTypeFilter(e.target.value);
                      setExtractedPage(1);
                    }}
                    className="w-full min-h-[42px] px-3 py-2 bg-white border border-[#D8C7B2] rounded-xl text-xs font-bold text-[#332218]"
                  >
                    <option value="all">همه انواع مطلب ({toPersianDigits(extractedItems.length)})</option>
                    <option value="زندگی‌نامه">زندگی‌نامه</option>
                    <option value="خاطره">خاطره</option>
                    <option value="وصیت‌نامه">وصیت‌نامه</option>
                    <option value="سند و دست‌نوشته">سند و دست‌نوشته</option>
                    <option value="تحلیل و پژوهش">تحلیل و پژوهش</option>
                    <option value="اشاره کوتاه به شهید">اشاره کوتاه به شهید</option>
                    <option value="سایر">سایر</option>
                  </select>
                </div>

                <div className="md:col-span-3 flex items-center justify-end gap-1.5">
                  <div className="inline-flex p-1 bg-[#FAF5EE] border border-[#D8C7B2] rounded-xl text-xs font-bold w-full">
                    <button
                      type="button"
                      onClick={() => setExtractedViewMode('cards')}
                      className={`flex-1 py-1.5 px-2.5 rounded-lg transition-colors cursor-pointer ${
                        extractedViewMode === 'cards'
                          ? 'bg-[#6B3E26] text-white'
                          : 'text-[#5C4033] hover:text-[#332218]'
                      }`}
                    >
                      نمایش کارتی
                    </button>
                    <button
                      type="button"
                      onClick={() => setExtractedViewMode('table')}
                      className={`flex-1 py-1.5 px-2.5 rounded-lg transition-colors cursor-pointer ${
                        extractedViewMode === 'table'
                          ? 'bg-[#6B3E26] text-white'
                          : 'text-[#5C4033] hover:text-[#332218]'
                      }`}
                    >
                      نمایش جدولی
                    </button>
                  </div>
                </div>
              </div>

              {/* نوار فیلتر وضعیت بازبینی مطالب + دکمه تأیید یکجای مطالب برای انتشار سایت */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pt-2 text-xs border-t border-[#EFE4D6]">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 flex-1">
                  {(
                    [
                      { key: 'all', label: `همه مطالب (${toPersianDigits(extractedItems.length)})` },
                      {
                        key: 'بررسی‌شده در پژوهش اصلی',
                        label: `پژوهش اصلی (${toPersianDigits(
                          extractedItems.filter((i) => i.reviewStatus === 'بررسی‌شده در پژوهش اصلی').length
                        )})`
                      },
                      {
                        key: 'تأییدشده کارشناسی',
                        label: `تأییدشده کارشناسی (${toPersianDigits(
                          extractedItems.filter((i) => i.reviewStatus === 'تأییدشده کارشناسی').length
                        )})`
                      },
                      {
                        key: 'نیازمند بررسی',
                        label: `نیازمند بررسی (${toPersianDigits(
                          extractedItems.filter((i) => i.reviewStatus === 'نیازمند بررسی').length
                        )})`
                      },
                      {
                        key: 'ردشده با دلیل',
                        label: `ردشده (${toPersianDigits(
                          extractedItems.filter((i) => i.reviewStatus.includes('رد')).length
                        )})`
                      }
                    ] as const
                  ).map((tab, idx) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => {
                        setExtractedStatusFilter(tab.key);
                        setExtractedPage(1);
                      }}
                      className={`min-h-[36px] px-2.5 py-1.5 rounded-xl font-bold transition-colors flex items-center justify-center text-center cursor-pointer ${
                        idx === 0 ? 'col-span-2 sm:col-span-1' : ''
                      } ${
                        extractedStatusFilter === tab.key
                          ? 'bg-[#6B3E26] text-white'
                          : 'bg-[#FAF5EE] border border-[#E2D2BE] text-[#332218] hover:bg-[#F3E9DC]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#6E5846]">تعداد در صفحه:</span>
                  <select
                    value={String(extractedPageSize)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setExtractedPageSize(val === 'all' ? 'all' : Number(val));
                      setExtractedPage(1);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white border border-[#D8C7B2] text-[#332218] font-bold text-xs cursor-pointer"
                  >
                    <option value="20">۲۰ مورد</option>
                    <option value="50">۵۰ مورد</option>
                    <option value="100">۱۰۰ مورد</option>
                    <option value="200">۲۰۰ مورد</option>
                    <option value="all">نمایش همه ({toPersianDigits(totalExtractedCount)})</option>
                  </select>
                </div>
              </div>
            </div>

            {showAddExtracted && (
              <form
                onSubmit={handleCreateExtractedItem}
                className="bg-white border-2 border-[#6B3E26] rounded-2xl p-4 sm:p-5 space-y-4 text-xs"
              >
                <div className="flex items-center justify-between border-b border-[#EFE4D6] pb-2.5">
                  <h3 className="text-sm font-bold text-[#332218]">
                    ثبت مطلب و صفحه استخراج‌شده جدید از کتاب
                  </h3>
                  <span className="text-[11px] text-[#6E5846]">
                    عبارت خام صفحه (مانند 173تا184) عیناً حفظ می‌شود
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <BookLiveSearchPicker
                      books={linkableBooks}
                      selectedBookId={exBookId}
                      onSelectBook={setExBookId}
                      query={exBookSearchQuery}
                      onQueryChange={setExBookSearchQuery}
                      label="کتاب مرجع (جست‌وجوی زنده بر اساس نام کتاب یا شماره قفسه) *"
                      placeholder="نام کتاب، شماره قفسه (SH-01 / قفسه ۱) یا کد BK..."
                      inputTestId="extracted-book-search-input"
                      listTestId="extracted-book-options-list"
                      bannerTestId="extracted-book-banner"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-[#332218] mb-1">
                      نوع مطلب *
                    </label>
                    <select
                      value={exContentType}
                      onChange={(e) => setExContentType(e.target.value as ExtractedContentType)}
                      className="w-full min-h-[42px] px-3 py-2 bg-white border border-[#D8C7B2] rounded-xl font-bold text-[#332218]"
                    >
                      <option value="زندگی‌نامه">زندگی‌نامه</option>
                      <option value="خاطره">خاطره</option>
                      <option value="وصیت‌نامه">وصیت‌نامه</option>
                      <option value="نامه">نامه</option>
                      <option value="روایت عملیات">روایت عملیات</option>
                      <option value="سند تاریخی">سند تاریخی</option>
                      <option value="سند و دست‌نوشته">سند و دست‌نوشته</option>
                      <option value="مصاحبه">مصاحبه</option>
                      <option value="معرفی شخصیت">معرفی شخصیت</option>
                      <option value="اطلاعات خانواده">اطلاعات خانواده</option>
                      <option value="اشاره کوتاه به شهید">اشاره کوتاه به شهید</option>
                      <option value="تحلیل و پژوهش">تحلیل و پژوهش</option>
                      <option value="سایر">سایر</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-[#332218] mb-1">
                      نام شهید مرتبط *
                    </label>
                    <input
                      type="text"
                      required
                      value={exMartyrName}
                      onChange={(e) => setExMartyrName(e.target.value)}
                      placeholder="مثال: احمد بیابانی یا محمد ابراهیم همت"
                      className="w-full min-h-[42px] px-3 py-2 bg-white border border-[#D8C7B2] rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-[#332218] mb-1">
                      قطعه مزار (در صورت وجود)
                    </label>
                    <input
                      type="text"
                      value={exGravePiece}
                      onChange={(e) => setExGravePiece(e.target.value)}
                      placeholder="مثال: 26"
                      className="w-full min-h-[42px] px-3 py-2 bg-white border border-[#D8C7B2] rounded-xl tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-[#332218] mb-1">
                      شماره صفحه در کتاب *
                    </label>
                    <input
                      type="text"
                      required
                      value={exPageRefRaw}
                      onChange={(e) => setExPageRefRaw(e.target.value)}
                      placeholder="مثال: 173تا184 یا ص 42"
                      className="w-full min-h-[42px] px-3 py-2 bg-white border border-[#D8C7B2] rounded-xl tabular-nums"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-[#332218] mb-1">
                      عنوان بخش / سرفصل مطلب *
                    </label>
                    <input
                      type="text"
                      required
                      value={exPassageTitle}
                      onChange={(e) => setExPassageTitle(e.target.value)}
                      placeholder="مثال: روایت همرزمان از عملیات خیبر و آخرین وداع"
                      className="w-full min-h-[42px] px-3 py-2 bg-white border border-[#D8C7B2] rounded-xl"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-medium text-[#5C4033] mb-1">صفحه شروع</label>
                      <input
                        type="text"
                        value={exPageStart}
                        onChange={(e) => setExPageStart(e.target.value)}
                        placeholder="173"
                        className="w-full min-h-[42px] px-2.5 py-2 bg-white border border-[#D8C7B2] rounded-xl tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-[#5C4033] mb-1">صفحه پایان</label>
                      <input
                        type="text"
                        value={exPageEnd}
                        onChange={(e) => setExPageEnd(e.target.value)}
                        placeholder="184"
                        className="w-full min-h-[42px] px-2.5 py-2 bg-white border border-[#D8C7B2] rounded-xl tabular-nums"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-[#332218] mb-1">
                    متن گزیده یا خلاصه پژوهشی مطلب استخراج‌شده *
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={exExtractedText}
                    onChange={(e) => setExExtractedText(e.target.value)}
                    placeholder="متن دقیق یا خلاصه پژوهشی مستند به صفحات کتاب را وارد کنید..."
                    className="w-full p-3 bg-white border border-[#D8C7B2] rounded-xl text-[#332218]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-[#5C4033] mb-1">
                      نقل‌قول کوتاه مستند (اختیاری)
                    </label>
                    <input
                      type="text"
                      value={exShortQuote}
                      onChange={(e) => setExShortQuote(e.target.value)}
                      placeholder="جمله کوتاه مستند با ذکر صفحه..."
                      className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#D8C7B2] rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-[#5C4033] mb-1">
                      کلیدواژه‌ها (جداشده با ویرگول)
                    </label>
                    <input
                      type="text"
                      value={exKeywordsText}
                      onChange={(e) => setExKeywordsText(e.target.value)}
                      placeholder="مثال: لشکر ۲۷، عملیات خیبر، وصیت‌نامه"
                      className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#D8C7B2] rounded-xl"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddExtracted(false)}
                    className="min-h-[42px] px-4 py-2 bg-[#FAF5EE] border border-[#D8C7B2] text-[#332218] rounded-xl font-semibold cursor-pointer"
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    className="min-h-[42px] px-5 py-2 bg-[#2E6F40] hover:bg-[#235632] text-white rounded-xl font-bold cursor-pointer"
                  >
                    ذخیره مطلب استخراج‌شده
                  </button>
                </div>
              </form>
            )}

            {/* نمایش جدولی فشرده برای مرور سریع ۳۰۹ مطلب و صفحه */}
            {extractedViewMode === 'table' ? (
              <div className="bg-white border border-[#E2D2BE] rounded-2xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-right border-collapse">
                    <thead>
                      <tr className="bg-[#F6EFE6] text-[#332218] border-b border-[#E2D2BE] font-bold">
                        <th className="py-2.5 px-3 w-12 text-center">ردیف</th>
                        <th className="py-2.5 px-3 min-w-[130px]">نام شهید</th>
                        <th className="py-2.5 px-3 min-w-[80px]">قطعه</th>
                        <th className="py-2.5 px-3 min-w-[160px]">عنوان کتاب</th>
                        <th className="py-2.5 px-3 min-w-[90px]">شماره صفحه</th>
                        <th className="py-2.5 px-3 min-w-[100px]">نوع مطلب</th>
                        <th className="py-2.5 px-3 min-w-[260px]">عنوان و خلاصه مطلب</th>
                        <th className="py-2.5 px-3 min-w-[130px] text-center">عملیات کارشناس</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFE4D6]">
                      {visibleExtractedRows.map((item, idx) => {
                        const meta = resolveLiveBookMeta(item.tempBookId, item.bookTitleRaw, item.publisherRaw);
                        return (
                        <tr key={item.id} className="hover:bg-[#FAF5EE]">
                          <td className="py-2.5 px-3 text-center font-mono text-[#78604E]">
                            {toPersianDigits(exStartIdx + idx + 1)}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-[#332218]">
                            <span className="inline-flex items-center gap-1.5 flex-wrap">
                              <button
                                type="button"
                                onClick={() => handleOpenMartyrInspector(item.martyrNameRaw)}
                                className="font-bold text-[#1F4E79] hover:underline cursor-pointer text-right"
                                title="مشاهده پرونده و کتاب‌های این شهید"
                              >
                                {item.martyrNameRaw}
                              </button>
                              {evaluateMartyrTehranStatus({
                                martyrName: item.martyrNameRaw,
                                gravePiece: item.gravePieceRaw,
                                sourceDesc: item.researcherNote
                              }).isTehran && <TehranMartyrBadge size="xs" />}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 tabular-nums text-[#5C4033]">
                            {toPersianDigits(item.gravePieceRaw || '—')}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-[#6B3E26]">
                            <span className="inline-flex items-center gap-1.5 flex-wrap">
                              <button
                                type="button"
                                onClick={() => handleOpenBookInspector(item.tempBookId, meta.title)}
                                className="font-bold text-[#6B3E26] hover:underline cursor-pointer text-right"
                                title="مشاهده و ویرایش درجا کتاب"
                              >
                                {meta.title}
                              </button>
                              <span className="font-mono text-[10.5px] text-[#78604E] font-normal" dir="ltr">
                                ({item.tempBookId})
                              </span>
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-bold text-[#332218] tabular-nums max-w-[140px] break-words [overflow-wrap:anywhere]">
                            {toPersianDigits(item.pageReferenceRaw)}
                          </td>
                          <td className="py-2.5 px-3 text-[#5C4033]">{item.contentType}</td>
                          <td className="py-2.5 px-3 text-[#332218] leading-relaxed max-w-[320px] break-words [overflow-wrap:anywhere]">
                            <div className="font-bold break-words">{item.passageTitle}</div>
                            <div className="text-[11px] text-[#5C4033] line-clamp-2 break-words">{item.extractedText}</div>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {item.reviewStatus !== 'تأییدشده کارشناسی' ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    requestActionConfirmation({
                                      title: 'تأیید نهایی مطلب استخراج‌شده',
                                      message: `آیا از تأیید کارشناسی مطلب ${item.id} («${item.passageTitle}» — شهید «${item.martyrNameRaw}») اطمینان دارید؟`,
                                      confirmLabel: 'بله، تأیید شود',
                                      variant: 'approve',
                                      onConfirm: () => {
                                        onUpdateExtractedItemStatus(
                                          item.id,
                                          'تأییدشده کارشناسی',
                                          'کارشناس بازبین',
                                          item.researcherNote
                                        );
                                        onNotify(`مطلب ${item.id} تأیید شد.`);
                                      }
                                    });
                                  }}
                                  className="px-2 py-1 rounded-lg bg-[#2E6F40] hover:bg-[#235632] text-white font-bold text-[11px] cursor-pointer"
                                >
                                  ✓ تأیید
                                </button>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-[#EDF6F0] text-[#1E4D2B] border border-[#A8D5B5] text-[10.5px] font-bold">
                                  تأییدشده
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* نمایش کارتی مشروح مطالب استخراج‌شده */
              <div className="space-y-3">
                {visibleExtractedRows.map((item, idx) => {
                  const cardBookMeta = resolveLiveBookMeta(item.tempBookId, item.bookTitleRaw, item.publisherRaw);
                  return (
                  <div
                    key={item.id}
                    className="bg-white border border-[#E2D2BE] rounded-2xl p-4 sm:p-5 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-[#EFE4D6] pb-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-[#6B3E26]">
                          #{toPersianDigits(exStartIdx + idx + 1)}
                        </span>
                        <span className="font-mono font-bold text-[#332218]" dir="ltr">
                          {item.id}
                        </span>
                        <span className="text-[#78604E]">·</span>
                        <span className="font-mono font-semibold text-[#5C4033]" dir="ltr">
                          {item.tempBookId}
                        </span>
                        <span className="text-[#78604E]">·</span>
                        <span className="font-bold text-[#6B3E26] bg-[#FAF5EE] px-2 py-0.5 rounded border border-[#E2D2BE]">
                          {item.contentType}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {item.reviewStatus !== 'تأییدشده کارشناسی' && (
                          <button
                            type="button"
                            onClick={() => {
                              requestActionConfirmation({
                                title: 'تأیید نهایی کارشناسی مطلب استخراج‌شده',
                                message: `آیا از تأیید کارشناسی مطلب ${item.id} («${item.passageTitle}» — شهید «${item.martyrNameRaw}») اطمینان دارید؟`,
                                confirmLabel: 'بله، تأیید کارشناسی شود',
                                variant: 'approve',
                                onConfirm: () => {
                                  onUpdateExtractedItemStatus(
                                    item.id,
                                    'تأییدشده کارشناسی',
                                    'کارشناس بازبین',
                                    item.researcherNote
                                  );
                                  onNotify(`مطلب ${item.id} با موفقیت تأیید شد و آماده انتشار گردید.`);
                                }
                              });
                            }}
                            className="min-h-[30px] px-2.5 py-1 bg-[#2E6F40] hover:bg-[#235632] text-white rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>تأیید کارشناسی</span>
                          </button>
                        )}

                        {!item.reviewStatus.includes('رد') && (
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingExtractedId(item.id);
                              setExtractedRejectReason('');
                            }}
                            className="min-h-[30px] px-2.5 py-1 bg-[#A63A3A] hover:bg-[#8A2E2E] text-white rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>رد با ذکر دلیل</span>
                          </button>
                        )}

                        <select
                          value={item.reviewStatus}
                          onChange={(e) => {
                            const nextStatus = e.target.value as ExtractedReviewStatus;
                            requestActionConfirmation({
                              title: 'تأیید تغییر وضعیت مطلب استخراج‌شده',
                              message: `آیا از تغییر وضعیت مطلب ${item.id} («${item.passageTitle}») به «${nextStatus}» اطمینان دارید؟`,
                              confirmLabel: 'بله، وضعیت تغییر کند',
                              variant: nextStatus.includes('رد') ? 'delete' : 'approve',
                              onConfirm: () => {
                                onUpdateExtractedItemStatus(
                                  item.id,
                                  nextStatus,
                                  item.reviewedBy || 'بازبین مرکز اسناد',
                                  item.researcherNote
                                );
                                onNotify(`وضعیت مطلب ${item.id} به «${nextStatus}» تغییر یافت.`);
                              }
                            });
                          }}
                          className={`px-2.5 py-1 rounded-lg border text-xs font-bold ${
                            item.reviewStatus === 'تأییدشده کارشناسی' || item.reviewStatus === 'بررسی‌شده در پژوهش اصلی'
                              ? 'bg-[#EDF6F0] border-[#A8D5B5] text-[#1E4D2B]'
                              : item.reviewStatus.includes('رد')
                              ? 'bg-[#FDF0F0] border-[#E6B8B8] text-[#A63A3A]'
                              : 'bg-[#FAF5EE] border-[#D8C7B2] text-[#5C4033]'
                          }`}
                        >
                          <option value="بررسی‌شده در پژوهش اصلی">بررسی‌شده در پژوهش اصلی</option>
                          <option value="تأییدشده کارشناسی">تأییدشده کارشناسی</option>
                          <option value="نیازمند بررسی">نیازمند بررسی</option>
                          <option value="خام (ثبت اولیه)">خام (ثبت اولیه)</option>
                          <option value="ردشده با دلیل">ردشده با دلیل</option>
                        </select>
                      </div>
                    </div>

                    {rejectingExtractedId === item.id && (
                      <div className="bg-[#FDF0F0] border border-[#E6B8B8] rounded-xl p-3 text-xs space-y-2">
                        <div className="font-bold text-[#A63A3A] flex items-center gap-1.5">
                          <AlertCircle className="w-4 h-4" />
                          <span>ثبت دلیل رد برای مطلب {item.id}:</span>
                        </div>
                        <input
                          type="text"
                          value={extractedRejectReason}
                          onChange={(e) => setExtractedRejectReason(e.target.value)}
                          placeholder="علت رد (مثلاً: عدم تطبیق صفحه با متن یا تشابه اسمی)..."
                          className="w-full min-h-[38px] px-3 py-1.5 bg-white border border-[#E6B8B8] rounded-lg text-[#332218]"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setRejectingExtractedId(null)}
                            className="px-3 py-1 text-[#5C4033] hover:text-[#332218]"
                          >
                            انصراف
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!extractedRejectReason.trim()) {
                                onNotify('لطفاً دلیل رد را بنویسید.', 'warning');
                                return;
                              }
                              const reason = extractedRejectReason.trim();
                              requestActionConfirmation({
                                title: 'تأیید نهایی رد مطلب استخراج‌شده',
                                message: `آیا از رد کردن مطلب ${item.id} («${item.passageTitle}») با ذکر دلیل اطمینان دارید؟`,
                                details: `دلیل رد: ${reason}`,
                                confirmLabel: 'بله، مطلب رد شود',
                                variant: 'delete',
                                onConfirm: () => {
                                  onUpdateExtractedItemStatus(
                                    item.id,
                                    'ردشده با دلیل',
                                    'کارشناس بازبین',
                                    `دلیل رد: ${reason}`
                                  );
                                  setRejectingExtractedId(null);
                                  onNotify(`مطلب ${item.id} با ثبت دلیل رد شد.`);
                                }
                              });
                            }}
                            className="px-3 py-1 bg-[#A63A3A] hover:bg-[#8A2E2E] text-white font-bold rounded-lg cursor-pointer"
                          >
                            ثبت قطعی رد مطلب
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start min-w-0 max-w-full">
                      <div className="md:col-span-9 space-y-1.5 min-w-0 max-w-full overflow-hidden">
                        <div className="text-xs text-[#5C4033] break-words [overflow-wrap:anywhere] flex items-center gap-1.5 flex-wrap">
                          <span>
                            کتاب:{' '}
                            <button
                              type="button"
                              onClick={() => handleOpenBookInspector(item.tempBookId, cardBookMeta.title)}
                              className="font-bold text-[#1F4E79] hover:underline cursor-pointer"
                            >
                              {cardBookMeta.title}
                            </button>
                          </span>
                          {cardBookMeta.publisher !== '—' && <span>· ناشر: {cardBookMeta.publisher}</span>}
                          <span>· شهید:</span>
                          <button
                            type="button"
                            onClick={() => handleOpenMartyrInspector(item.martyrNameRaw)}
                            className="font-bold text-[#6B3E26] hover:underline cursor-pointer"
                          >
                            {item.martyrNameRaw}
                          </button>
                          {evaluateMartyrTehranStatus({
                            martyrName: item.martyrNameRaw,
                            gravePiece: item.gravePieceRaw,
                            sourceDesc: item.researcherNote
                          }).isTehran && <TehranMartyrBadge size="xs" />}
                          {item.gravePieceRaw && (
                            <span>(قطعه {toPersianDigits(item.gravePieceRaw)})</span>
                          )}
                        </div>

                        <h4 className="text-sm sm:text-base font-bold text-[#332218] break-words [overflow-wrap:anywhere]">
                          {item.passageTitle}
                        </h4>

                        <div className="text-xs sm:text-sm text-[#332218] leading-relaxed bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl p-3 min-w-0 max-w-full overflow-hidden">
                          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                            {item.extractedText.length > 220 && !expandedPassageIds[item.id]
                              ? `${item.extractedText.slice(0, 220)}...`
                              : item.extractedText}
                          </p>
                          {item.extractedText.length > 220 && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedPassageIds((prev) => ({
                                  ...prev,
                                  [item.id]: !prev[item.id]
                                }))
                              }
                              className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#6B3E26] hover:text-[#332218] bg-white px-2.5 py-1 rounded-lg border border-[#D8C7B2] cursor-pointer"
                            >
                              {expandedPassageIds[item.id] ? 'بستن متن کامل ▲' : 'مشاهده ادامه مطلب ▼'}
                            </button>
                          )}
                        </div>

                        {item.researcherNote && (
                          <div
                            className={`text-xs p-2 rounded-lg break-words [overflow-wrap:anywhere] ${
                              item.reviewStatus.includes('رد')
                                ? 'bg-[#FDF0F0] text-[#A63A3A] border border-[#E6B8B8]'
                                : 'text-[#6B3E26]'
                            }`}
                          >
                            <strong>{item.reviewStatus.includes('رد') ? 'علت رد کارشناسی: ' : 'یادداشت کارشناسی: '}</strong>
                            {item.researcherNote}
                          </div>
                        )}
                      </div>

                      <div className="md:col-span-3 bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl p-3 text-xs space-y-1.5 min-w-0 max-w-full overflow-hidden">
                        <div className="min-w-0 max-w-full">
                          <span className="text-[#6E5846] block">شماره صفحه در کتاب:</span>
                          <strong className="text-xs sm:text-sm font-bold text-[#332218] tabular-nums block mt-0.5 break-words [overflow-wrap:anywhere] leading-relaxed">
                            {toPersianDigits(item.pageReferenceRaw)}
                          </strong>
                        </div>
                        {(item.pageStartNormalized || item.pageEndNormalized) && (
                          <div className="text-[11px] text-[#5C4033] tabular-nums border-t border-[#E2D2BE] pt-1 break-words [overflow-wrap:anywhere]">
                            بازه صفحه: از {toPersianDigits(item.pageStartNormalized || '—')} تا{' '}
                            {toPersianDigits(item.pageEndNormalized || '—')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}

            {/* نوار صفحه‌بندی کامل برای مطالب استخراج‌شده */}
            {totalExtractedCount > 0 && (
              <div className="p-3.5 bg-white border border-[#E2D2BE] rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="text-[#5C4033] font-medium">
                  {extractedPageSize === 'all' ? (
                    <span>
                      نمایش یکجای تمام <strong className="text-[#332218]">{toPersianDigits(totalExtractedCount)}</strong> مطلب استخراج‌شده
                    </span>
                  ) : (
                    <span>
                      صفحه <strong className="text-[#332218]">{toPersianDigits(exSafePage)}</strong> از{' '}
                      <strong className="text-[#332218]">{toPersianDigits(exTotalPages)}</strong> (مورد{' '}
                      {toPersianDigits(exStartIdx + 1)} تا{' '}
                      {toPersianDigits(Math.min(totalExtractedCount, exStartIdx + (extractedPageSize as number)))} از مجموع{' '}
                      {toPersianDigits(totalExtractedCount)} مطلب)
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {extractedPageSize !== 'all' && exTotalPages > 1 && (
                    <>
                      <button
                        type="button"
                        disabled={exSafePage <= 1}
                        onClick={() => setExtractedPage((p) => Math.max(1, p - 1))}
                        className="px-3 py-1.5 rounded-lg bg-[#FAF5EE] border border-[#D8C7B2] text-[#332218] font-bold disabled:opacity-40 hover:bg-[#F3E9DC] cursor-pointer"
                      >
                        → صفحه قبل
                      </button>

                      {Array.from({ length: exTotalPages }, (_, i) => i + 1).map((pageNum) => (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => setExtractedPage(pageNum)}
                          className={`min-w-[34px] px-2.5 py-1.5 rounded-lg border font-bold tabular-nums cursor-pointer ${
                            exSafePage === pageNum
                              ? 'bg-[#6B3E26] text-white border-[#6B3E26]'
                              : 'bg-white text-[#332218] border-[#D8C7B2] hover:bg-[#F3E9DC]'
                          }`}
                        >
                          {toPersianDigits(pageNum)}
                        </button>
                      ))}

                      <button
                        type="button"
                        disabled={exSafePage >= exTotalPages}
                        onClick={() => setExtractedPage((p) => Math.min(exTotalPages, p + 1))}
                        className="px-3 py-1.5 rounded-lg bg-[#6B3E26] text-white font-bold disabled:opacity-40 hover:bg-[#56311E] cursor-pointer"
                      >
                        صفحه بعد (ادامه مطالب) ←
                      </button>
                    </>
                  )}

                  {extractedPageSize !== 'all' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setExtractedPageSize('all');
                        setExtractedPage(1);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white border border-[#6B3E26] text-[#6B3E26] font-bold hover:bg-[#F3E9DC] cursor-pointer"
                    >
                      نمایش یکجای همه ({toPersianDigits(totalExtractedCount)} مورد)
                    </button>
                  ) : (
                    totalExtractedCount > 20 && (
                      <button
                        type="button"
                        onClick={() => {
                          setExtractedPageSize(20);
                          setExtractedPage(1);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#FAF5EE] border border-[#D8C7B2] text-[#5C4033] font-bold hover:bg-[#F3E9DC] cursor-pointer"
                      >
                        بازگشت به نمایش صفحه‌بندی (۲۰تایی)
                      </button>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })()}



      {/* SubView 3: مرکز جامع خروجی انتشار سایت گلزار شهدا (golzarteh.ir) */}
      {subView === 'publish_gateway' && (() => {
        const hasPubQ = Boolean(normalizePersianText(publishSearchQuery));

        // رکوردهای معتبر قابل انتشار در سایت (همه پیوندهای دارای نام شهید و مطالب غیر ردشده با عنوان زنده کتاب)
        const publishableLinks = links.filter((l) => {
          if (!l.martyrNameRaw || l.martyrNameRaw === '*' || l.reviewStatus.includes('رد')) return false;
          if (publishScope === 'expert_only' && !l.reviewStatus.includes('تأیید')) return false;
          return true;
        });

        const publishableExtracts = extractedItems.filter((it) => {
          if (it.reviewStatus.includes('رد')) return false;
          if (publishScope === 'expert_only' && it.reviewStatus !== 'تأییدشده کارشناسی') return false;
          return true;
        });

        const martyrPublishProfilesMap = new Map<
          string,
          {
            martyrName: string;
            gravePiece: string;
            graveRow: string;
            graveNumber: string;
            books: {
              bookId: string;
              bookTitle: string;
              publisher: string;
              pageReference: string;
              description: string;
            }[];
            passages: ExtractedContentItem[];
          }
        >();

        publishableLinks.forEach((l) => {
          const normKey = normalizePersianText(l.martyrNameRaw);
          const meta = resolveLiveBookMeta(l.tempBookId, l.bookTitleRaw, l.publisherRaw);
          let prof = martyrPublishProfilesMap.get(normKey);
          if (!prof) {
            prof = {
              martyrName: l.martyrNameRaw,
              gravePiece: l.gravePieceRaw || '—',
              graveRow: l.graveRowRaw || '—',
              graveNumber: l.graveNumberRaw || '—',
              books: [],
              passages: []
            };
            martyrPublishProfilesMap.set(normKey, prof);
          }
          if (prof.gravePiece === '—' && l.gravePieceRaw) prof.gravePiece = l.gravePieceRaw;
          if (prof.graveRow === '—' && l.graveRowRaw) prof.graveRow = l.graveRowRaw;
          if (prof.graveNumber === '—' && l.graveNumberRaw) prof.graveNumber = l.graveNumberRaw;

          prof.books.push({
            bookId: l.tempBookId || '',
            bookTitle: meta.title,
            publisher: meta.publisher,
            pageReference: l.pageReferenceRaw || 'ثبت در منبع',
            description: l.sourceDescriptionRaw || ''
          });
        });

        publishableExtracts.forEach((ex) => {
          const normKey = normalizePersianText(ex.martyrNameRaw);
          let prof = martyrPublishProfilesMap.get(normKey);
          if (!prof) {
            prof = {
              martyrName: ex.martyrNameRaw,
              gravePiece: ex.gravePieceRaw || '—',
              graveRow: '—',
              graveNumber: '—',
              books: [],
              passages: []
            };
            martyrPublishProfilesMap.set(normKey, prof);
          }
          prof.passages.push(ex);
        });

        const allMartyrPublishProfiles = Array.from(martyrPublishProfilesMap.values()).filter((p) => {
          if (!hasPubQ) return true;
          return matchesPersianSearch(
            `${p.martyrName} ${p.gravePiece} ${p.books.map((b) => `${b.bookTitle} ${b.publisher} ${b.pageReference}`).join(' ')} ${p.passages.map((ex) => `${ex.passageTitle} ${ex.extractedText}`).join(' ')}`,
            publishSearchQuery
          );
        });

        const filteredPublishableExtracts = publishableExtracts.filter((it) => {
          if (!hasPubQ) return true;
          const meta = resolveLiveBookMeta(it.tempBookId, it.bookTitleRaw, it.publisherRaw);
          return matchesPersianSearch(
            `${it.martyrNameRaw} ${meta.title} ${meta.publisher} ${it.passageTitle} ${it.extractedText} ${it.pageReferenceRaw} ${it.contentType}`,
            publishSearchQuery
          );
        });

        const activeTotalCount =
          publishPreviewTab === 'martyr_cards'
            ? allMartyrPublishProfiles.length
            : filteredPublishableExtracts.length;
        const pubTotalPages =
          publishPageSize === 'all' ? 1 : Math.max(1, Math.ceil(activeTotalCount / publishPageSize));
        const pubSafePage = Math.min(publishPage, pubTotalPages);
        const pubStartIdx = publishPageSize === 'all' ? 0 : (pubSafePage - 1) * publishPageSize;

        const visibleMartyrProfiles =
          publishPageSize === 'all'
            ? allMartyrPublishProfiles
            : allMartyrPublishProfiles.slice(pubStartIdx, pubStartIdx + publishPageSize);

        const visiblePublishExtracts =
          publishPageSize === 'all'
            ? filteredPublishableExtracts
            : filteredPublishableExtracts.slice(pubStartIdx, pubStartIdx + publishPageSize);

        // ۱. خروجی اکسل ویژه انتشار سایت (۳ شیت آماده بارگذاری در سایت گلزار)
        const handleExportWebsiteExcel = () => {
          const wb = XLSX.utils.book_new();

          const sheetMartyrProfiles = allMartyrPublishProfiles.map((p, idx) => ({
            'ردیف': idx + 1,
            'کد انتشار سایت': `${externalIdPrefix}SH-${String(idx + 1).padStart(4, '0')}`,
            'نام و نام خانوادگی شهید': p.martyrName,
            'قطعه مزار': p.gravePiece,
            'ردیف مزار': p.graveRow,
            'شماره مزار': p.graveNumber,
            'تعداد کتاب‌های مرتبط': p.books.length,
            'فهرست کتاب‌ها و صفحات': p.books
              .map((b) => `کتاب «${b.bookTitle}» (${b.publisher})${b.pageReference && b.pageReference !== '-' ? ` - صفحه ${b.pageReference}` : ''}`)
              .join(' | '),
            'تعداد مطالب و صفحات استخراج‌شده': p.passages.length,
            'متن کامل مطالب استخراج‌شده جهت درج در سایت': p.passages
              .map((ex) => {
                const exMeta = resolveLiveBookMeta(ex.tempBookId, ex.bookTitleRaw, ex.publisherRaw);
                return `[${ex.contentType} - کتاب ${exMeta.title}، ص ${ex.pageReferenceRaw}]: ${ex.passageTitle} — ${ex.extractedText}`;
              })
              .join('\n\n')
          }));

          const sheetExtractedPassages = filteredPublishableExtracts.map((it, idx) => {
            const itMeta = resolveLiveBookMeta(it.tempBookId, it.bookTitleRaw, it.publisherRaw);
            return {
              'ردیف': idx + 1,
              'کد مطلب در سایت': `${externalIdPrefix}PUB-${String(idx + 1).padStart(4, '0')}`,
              'نام شهید': it.martyrNameRaw,
              'قطعه مزار': it.gravePieceRaw || '—',
              'کد کتاب': it.tempBookId,
              'عنوان کتاب': itMeta.title,
              'ناشر': itMeta.publisher,
              'شماره صفحه در کتاب': it.pageReferenceRaw,
              'نوع مطلب': it.contentType,
              'عنوان مطلب': it.passageTitle,
              'متن آماده انتشار در سایت': it.extractedText
            };
          });

          const sheetBookLinks = publishableLinks.map((l, idx) => {
            const lMeta = resolveLiveBookMeta(l.tempBookId, l.bookTitleRaw, l.publisherRaw);
            return {
              'ردیف': idx + 1,
              'نام شهید': l.martyrNameRaw,
              'قطعه': l.gravePieceRaw || '—',
              'ردیف مزار': l.graveRowRaw || '—',
              'شماره مزار': l.graveNumberRaw || '—',
              'کد کتاب': l.tempBookId,
              'عنوان کتاب': lMeta.title,
              'ناشر': lMeta.publisher,
              'شماره صفحه': l.pageReferenceRaw || '—',
              'توضیحات کتاب': l.sourceDescriptionRaw || '—'
            };
          });

          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetMartyrProfiles), 'پرونده شهدای سایت');
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetExtractedPassages), 'مطالب و صفحات استخراج‌شده');
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetBookLinks), 'پیوندهای کتاب و شهید');

          const fileName = `بسته-انتشار-سایت-گلزار-${new Date().toISOString().slice(0, 10)}.xlsx`;
          XLSX.writeFile(wb, fileName);
          onNotify(`فایل اکسل ۳ شیت ویژه انتشار در سایت («${fileName}») دانلود شد.`);
        };

        // ۲. خروجی JSON استاندارد وب‌سایت (مجهز به شناسه رسمی و تطبیق چندشاخصی golzarteh.ir)
        const handleExportWebsiteJson = async () => {
          await loadGolzartehDataset();
          const payload = {
            schema_version: 'golzarteh-publish-package-v2.0',
            target_website: 'https://golzarteh.ir',
            generated_at: new Date().toISOString(),
            external_id_prefix: externalIdPrefix,
            martyrs_with_books_count: allMartyrPublishProfiles.length,
            total_book_martyr_links_count: publishableLinks.length,
            total_extracted_passages_count: filteredPublishableExtracts.length,
            martyr_profiles: allMartyrPublishProfiles.map((p, idx) => {
              const resolved = resolveComprehensiveMartyrProfile({
                localKey: `pub:${idx + 1}`,
                fullName: p.martyrName,
                gravePiece: p.gravePiece !== '—' ? p.gravePiece : '',
                graveRow: p.graveRow !== '—' ? p.graveRow : '',
                graveNumber: p.graveNumber !== '—' ? p.graveNumber : '',
                extractedItems,
                bookLinks: links
              });
              return {
                public_martyr_code: `${externalIdPrefix}SH-${String(idx + 1).padStart(4, '0')}`,
                golzarteh_id: resolved.golzartehMatch?.gid || null,
                golzar_info_code: resolved.golzartehMatch?.golzarInfoCode || null,
                unique_code: resolved.golzartehMatch?.uniqueCode || null,
                golzarteh_url: resolved.golzartehUrl || null,
                match_score: resolved.golzartehMatch?.matchScore || 0,
                match_basis: resolved.golzartehMatch?.matchBasis || null,
                tomb_mismatch: resolved.tombMismatch,
                martyr_name: p.martyrName,
                father_name: resolved.fatherName || null,
                grave_address: {
                  piece: p.gravePiece,
                  row: p.graveRow,
                  number: p.graveNumber
                },
                official_golzarteh_grave: resolved.officialGrave,
                biography: resolved.biography || null,
                will_text: resolved.willText || null,
                gallery_photos: resolved.photos,
                linked_books: p.books,
                extracted_passages: p.passages.map((it) => {
                  const exMeta = resolveLiveBookMeta(it.tempBookId, it.bookTitleRaw, it.publisherRaw);
                  return {
                    passage_id: it.id,
                    book_title: exMeta.title,
                    page_reference: it.pageReferenceRaw,
                    content_type: it.contentType,
                    title: it.passageTitle,
                    text: it.extractedText
                  };
                })
              };
            })
          };
          const blob = new Blob([JSON.stringify(payload, null, 2)], {
            type: 'application/json;charset=utf-8'
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `golzarteh-website-package-${new Date().toISOString().slice(0, 10)}.json`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1500);
          onNotify('بسته استاندارد JSON ویژه بارگذاری در وب‌سایت golzarteh.ir دانلود شد.');
        };

        // ۳. کپی متن آماده درج در سایت برای یک شهید
        const handleCopyMartyrProfileForWebsite = (p: (typeof allMartyrPublishProfiles)[0]) => {
          const lines: string[] = [
            `🌷 شهید ${p.martyrName}`,
            `📍 نشانی مزار: قطعه ${p.gravePiece}${p.graveRow !== '—' ? `، ردیف ${p.graveRow}` : ''}${p.graveNumber !== '—' ? `، شماره ${p.graveNumber}` : ''}`,
            ''
          ];
          if (p.books.length > 0) {
            lines.push('📚 کتاب‌های مرتبط در مرکز اسناد گلزار شهدا:');
            p.books.forEach((b, i) => {
              lines.push(
                `${i + 1}. کتاب «${b.bookTitle}» — ناشر: ${b.publisher}${
                  b.pageReference && b.pageReference !== '-' ? ` (صفحه: ${b.pageReference})` : ''
                }${b.description && b.description !== '-' ? ` — ${b.description}` : ''}`
              );
            });
            lines.push('');
          }
          if (p.passages.length > 0) {
            lines.push('📖 گزیده مطالب و صفحات استخراج‌شده:');
            p.passages.forEach((ex, i) => {
              const exMeta = resolveLiveBookMeta(ex.tempBookId, ex.bookTitleRaw, ex.publisherRaw);
              lines.push(
                `${i + 1}. [${ex.contentType} — کتاب «${exMeta.title}»، ص ${ex.pageReferenceRaw}] ${ex.passageTitle}:`
              );
              lines.push(ex.extractedText);
              lines.push('');
            });
          }
          navigator.clipboard?.writeText(lines.join('\n'));
          onNotify(`متن کامل کتاب‌ها و صفحات «شهید ${p.martyrName}» برای درج در سایت کپی شد.`);
        };

        return (
          <div className="space-y-4">
            {/* هدر و دکمه‌های دریافت خروجی انتشار سایت */}
            <div className="bg-white border border-[#E2D2BE] rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xs">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#EFE4D6] pb-4">
                <div className="space-y-1">
                  <h3 className="text-base sm:text-lg font-bold text-[#332218]">
                    مرکز خروجی انتشار سایت گلزار شهدای تهران (golzarteh.ir)
                  </h3>
                  <p className="text-xs text-[#6E5846]">
                    بسته‌بندی یکپارچه اسامی شهدا، کتاب‌های مرتبط، شماره صفحات و ۳۰۹ مطلب استخراج‌شده جهت بارگذاری مستقیم در وب‌سایت
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap items-center gap-2 w-full lg:w-auto shrink-0">
                  <button
                    type="button"
                    onClick={handleExportWebsiteExcel}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#2E6F40] hover:bg-[#235632] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 shrink-0" />
                    <span>دانلود اکسل ویژه سایت</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportWebsiteJson}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#FAF5EE] hover:bg-[#F3E9DC] text-[#332218] border border-[#D8C7B2] text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <FileJson className="w-4 h-4 text-[#6B3E26] shrink-0" />
                    <span>بسته JSON وب‌سایت</span>
                  </button>
                </div>
              </div>

              {/* ۲ کارت خلاصه وضعیت خروجی سایت + تنظیمات */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl p-3.5 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-[#5C4033]">پرونده شهدای آماده انتشار در سایت</div>
                    <div className="text-[11px] text-[#78604E] mt-0.5">
                      شامل کتاب‌های مرتبط، نشانی مزار و ارجاع صفحات
                    </div>
                  </div>
                  <div className="text-xl font-bold text-[#332218] tabular-nums">
                    {toPersianDigits(allMartyrPublishProfiles.length)} شهید
                  </div>
                </div>

                <div className="bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl p-3.5 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-[#5C4033]">مطالب و صفحات استخراج‌شده آماده انتشار</div>
                    <div className="text-[11px] text-[#78604E] mt-0.5">
                      خاطره، وصیت‌نامه، زندگی‌نامه و شماره صفحه دقیق
                    </div>
                  </div>
                  <div className="text-xl font-bold text-[#6B3E26] tabular-nums">
                    {toPersianDigits(filteredPublishableExtracts.length)} مطلب
                  </div>
                </div>

                <div className="bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl p-3 flex flex-col justify-between gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#332218]">دامنه خروجی سایت:</span>
                    <select
                      value={publishScope}
                      onChange={(e) => {
                        setPublishScope(e.target.value as 'all_valid' | 'expert_only');
                        setPublishPage(1);
                      }}
                      className="px-2.5 py-1 bg-white border border-[#D8C7B2] rounded-lg font-bold text-[#332218] text-xs"
                    >
                      <option value="all_valid">همه پیوندها و مطالب معتبر سامانه (کامل)</option>
                      <option value="expert_only">فقط موارد دارای مهر «تأییدشده کارشناسی»</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[#6E5846]">پیشوند کد سایت:</span>
                    <input
                      type="text"
                      value={externalIdPrefix}
                      onChange={(e) => setExternalIdPrefix(e.target.value)}
                      className="w-36 px-2 py-1 bg-white border border-[#D8C7B2] rounded-lg font-mono text-xs"
                      dir="ltr"
                    />
                  </div>
                </div>
              </div>

              {/* نوار سوییچ پیش‌نمایش و جست‌وجو */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 border-t border-[#EFE4D6]">
                <div className="grid grid-cols-1 sm:grid-cols-2 p-1 bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl text-xs font-bold gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPublishPreviewTab('martyr_cards');
                      setPublishPage(1);
                    }}
                    className={`px-3 py-2 rounded-lg transition-colors cursor-pointer text-center ${
                      publishPreviewTab === 'martyr_cards'
                        ? 'bg-[#6B3E26] text-white'
                        : 'text-[#5C4033] hover:text-[#332218]'
                    }`}
                  >
                    ۱. پرونده انتشار هر شهید در سایت ({toPersianDigits(allMartyrPublishProfiles.length)} شهید)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPublishPreviewTab('extracted_passages');
                      setPublishPage(1);
                    }}
                    className={`px-3 py-2 rounded-lg transition-colors cursor-pointer text-center ${
                      publishPreviewTab === 'extracted_passages'
                        ? 'bg-[#6B3E26] text-white'
                        : 'text-[#5C4033] hover:text-[#332218]'
                    }`}
                  >
                    ۲. فهرست مطالب و صفحات استخراج‌شده ({toPersianDigits(filteredPublishableExtracts.length)} مطلب)
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row flex-1 max-w-md items-stretch sm:items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-[#6E5846] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      value={publishSearchQuery}
                      onChange={(e) => {
                        setPublishSearchQuery(e.target.value);
                        setPublishPage(1);
                      }}
                      placeholder="جست‌وجوی نام شهید، کتاب یا متن..."
                      className="w-full min-h-[38px] pr-9 pl-3 py-1.5 text-xs bg-[#FAF5EE] border border-[#D8C7B2] rounded-xl focus:bg-white focus:outline-none focus:border-[#6B3E26]"
                    />
                  </div>

                  <select
                    value={String(publishPageSize)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPublishPageSize(val === 'all' ? 'all' : Number(val));
                      setPublishPage(1);
                    }}
                    className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-white border border-[#D8C7B2] text-[#332218] font-bold text-xs cursor-pointer"
                  >
                    <option value="20">۲۰ مورد در صفحه</option>
                    <option value="50">۵۰ مورد در صفحه</option>
                    <option value="100">۱۰۰ مورد در صفحه</option>
                    <option value="200">۲۰۰ مورد در صفحه</option>
                    <option value="all">نمایش یکجای همه ({toPersianDigits(activeTotalCount)})</option>
                  </select>
                </div>
              </div>
            </div>

            {/* بخش ۱ پیش‌نمایش: کارت‌های آماده انتشار هر شهید در سایت */}
            {publishPreviewTab === 'martyr_cards' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {visibleMartyrProfiles.map((p, idx) => (
                  <div
                    key={p.martyrName + idx}
                    className="bg-white border border-[#E2D2BE] rounded-2xl p-4 flex flex-col justify-between gap-3 text-xs shadow-2xs"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2 border-b border-[#EFE4D6] pb-2">
                        <div>
                          <span className="font-mono text-[10.5px] text-[#78604E] block" dir="ltr">
                            {externalIdPrefix}SH-{String(pubStartIdx + idx + 1).padStart(4, '0')}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenMartyrInspector(p.martyrName)}
                            className="text-sm sm:text-base font-bold text-[#1F4E79] hover:underline mt-0.5 text-right cursor-pointer"
                          >
                            شهید {p.martyrName}
                          </button>
                        </div>
                        <span className="px-2.5 py-1 rounded-lg bg-[#FAF5EE] border border-[#E2D2BE] text-[#5C4033] font-bold tabular-nums">
                          قطعه {toPersianDigits(p.gravePiece)}
                          {p.graveRow !== '—' && ` · ر.${toPersianDigits(p.graveRow)}`}
                          {p.graveNumber !== '—' && ` · ش.${toPersianDigits(p.graveNumber)}`}
                        </span>
                      </div>

                      {/* کتاب‌های مرتبط با این شهید */}
                      <div className="space-y-1">
                        <div className="font-bold text-[#6B3E26]">
                          کتاب‌های مرتبط ({toPersianDigits(p.books.length)} عنوان):
                        </div>
                        <div className="space-y-1">
                          {p.books.map((b, bIdx) => (
                            <div
                              key={bIdx}
                              className="bg-[#FAF5EE] border border-[#E2D2BE] rounded-lg px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-1"
                            >
                              <button
                                type="button"
                                onClick={() => handleOpenBookInspector(b.bookId, b.bookTitle)}
                                className="font-bold text-[#332218] hover:text-[#1F4E79] hover:underline text-right cursor-pointer"
                              >
                                «{b.bookTitle}» <span className="font-normal text-[#6E5846]">({b.publisher})</span>
                              </button>
                              <span className="font-mono font-bold text-[#6B3E26] tabular-nums">
                                صفحه: {toPersianDigits(b.pageReference)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* مطالب و صفحات استخراج‌شده مرتبط با این شهید */}
                      {p.passages.length > 0 && (
                        <div className="space-y-1 pt-1">
                          <div className="font-bold text-[#2E6F40]">
                            گزیده مطالب و صفحات استخراج‌شده ({toPersianDigits(p.passages.length)} مورد):
                          </div>
                          {p.passages.map((ex) => (
                            <div
                              key={ex.id}
                              className="bg-[#EDF6F0] border border-[#C6DFCD] rounded-lg p-2.5 space-y-1 text-[#1E4D2B]"
                            >
                              <div className="flex items-center justify-between gap-2 font-bold">
                                <span>
                                  [{ex.contentType}] {ex.passageTitle}
                                </span>
                                <span className="tabular-nums">ص {toPersianDigits(ex.pageReferenceRaw)}</span>
                              </div>
                              <p className="text-[11.5px] leading-relaxed text-[#332218]">{ex.extractedText}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end pt-2 border-t border-[#EFE4D6]">
                      <button
                        type="button"
                        onClick={() => handleCopyMartyrProfileForWebsite(p)}
                        className="px-3 py-1.5 rounded-lg bg-[#6B3E26] hover:bg-[#56311E] text-white font-bold text-xs cursor-pointer"
                      >
                        کپی شناسنامه کامل شهید برای درج در سایت
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* بخش ۲ پیش‌نمایش: جدول کامل ۳۰۹ مطلب و صفحه استخراج‌شده آماده انتشار در سایت */
              <div className="bg-white border border-[#E2D2BE] rounded-2xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-right border-collapse">
                    <thead>
                      <tr className="bg-[#F6EFE6] text-[#332218] border-b border-[#E2D2BE] font-bold">
                        <th className="py-2.5 px-3 w-12 text-center">ردیف</th>
                        <th className="py-2.5 px-3 min-w-[110px]">کد انتشار</th>
                        <th className="py-2.5 px-3 min-w-[130px]">نام شهید</th>
                        <th className="py-2.5 px-3 min-w-[70px]">قطعه</th>
                        <th className="py-2.5 px-3 min-w-[150px]">کتاب مرجع</th>
                        <th className="py-2.5 px-3 min-w-[85px]">شماره صفحه</th>
                        <th className="py-2.5 px-3 min-w-[95px]">نوع مطلب</th>
                        <th className="py-2.5 px-3 min-w-[280px]">عنوان و متن آماده انتشار در سایت</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFE4D6]">
                      {visiblePublishExtracts.map((it, idx) => {
                        const itMeta = resolveLiveBookMeta(it.tempBookId, it.bookTitleRaw, it.publisherRaw);
                        return (
                        <tr key={it.id} className="hover:bg-[#FAF5EE]">
                          <td className="py-2.5 px-3 text-center font-mono text-[#78604E]">
                            {toPersianDigits(pubStartIdx + idx + 1)}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-[#2E6F40]" dir="ltr">
                            {externalIdPrefix}PUB-{String(pubStartIdx + idx + 1).padStart(4, '0')}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-[#332218]">
                            <button
                              type="button"
                              onClick={() => handleOpenMartyrInspector(it.martyrNameRaw)}
                              className="font-bold text-[#1F4E79] hover:underline text-right cursor-pointer"
                            >
                              {it.martyrNameRaw}
                            </button>
                          </td>
                          <td className="py-2.5 px-3 tabular-nums text-[#5C4033]">
                            {toPersianDigits(it.gravePieceRaw || '—')}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-[#6B3E26]">
                            <button
                              type="button"
                              onClick={() => handleOpenBookInspector(it.tempBookId, itMeta.title)}
                              className="font-bold text-[#6B3E26] hover:underline text-right cursor-pointer"
                            >
                              {itMeta.title}
                            </button>
                          </td>
                          <td className="py-2.5 px-3 font-bold text-[#332218] tabular-nums">
                            {toPersianDigits(it.pageReferenceRaw)}
                          </td>
                          <td className="py-2.5 px-3 text-[#5C4033]">{it.contentType}</td>
                          <td className="py-2.5 px-3 text-[#332218] leading-relaxed">
                            <div className="font-bold">{it.passageTitle}</div>
                            <div className="text-[11px] text-[#5C4033] mt-0.5">{it.extractedText}</div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* نوار صفحه‌بندی کامل خروجی انتشار سایت */}
            {activeTotalCount > 0 && (
              <div className="p-3.5 bg-white border border-[#E2D2BE] rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="text-[#5C4033] font-medium">
                  {publishPageSize === 'all' ? (
                    <span>
                      نمایش یکجای تمام <strong className="text-[#332218]">{toPersianDigits(activeTotalCount)}</strong> مورد
                    </span>
                  ) : (
                    <span>
                      صفحه <strong className="text-[#332218]">{toPersianDigits(pubSafePage)}</strong> از{' '}
                      <strong className="text-[#332218]">{toPersianDigits(pubTotalPages)}</strong> (ردیف{' '}
                      {toPersianDigits(pubStartIdx + 1)} تا{' '}
                      {toPersianDigits(Math.min(activeTotalCount, pubStartIdx + (publishPageSize as number)))} از مجموع{' '}
                      {toPersianDigits(activeTotalCount)} مورد)
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {publishPageSize !== 'all' && pubTotalPages > 1 && (
                    <>
                      <button
                        type="button"
                        disabled={pubSafePage <= 1}
                        onClick={() => setPublishPage((p) => Math.max(1, p - 1))}
                        className="px-3 py-1.5 rounded-lg bg-[#FAF5EE] border border-[#D8C7B2] text-[#332218] font-bold disabled:opacity-40 hover:bg-[#F3E9DC] cursor-pointer"
                      >
                        → صفحه قبل
                      </button>

                      {Array.from({ length: pubTotalPages }, (_, i) => i + 1).map((pageNum) => (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => setPublishPage(pageNum)}
                          className={`min-w-[34px] px-2.5 py-1.5 rounded-lg border font-bold tabular-nums cursor-pointer ${
                            pubSafePage === pageNum
                              ? 'bg-[#6B3E26] text-white border-[#6B3E26]'
                              : 'bg-white text-[#332218] border-[#D8C7B2] hover:bg-[#F3E9DC]'
                          }`}
                        >
                          {toPersianDigits(pageNum)}
                        </button>
                      ))}

                      <button
                        type="button"
                        disabled={pubSafePage >= pubTotalPages}
                        onClick={() => setPublishPage((p) => Math.min(pubTotalPages, p + 1))}
                        className="px-3 py-1.5 rounded-lg bg-[#6B3E26] text-white font-bold disabled:opacity-40 hover:bg-[#56311E] cursor-pointer"
                      >
                        صفحه بعد (ادامه اسامی) ←
                      </button>
                    </>
                  )}

                  {publishPageSize !== 'all' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPublishPageSize('all');
                        setPublishPage(1);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white border border-[#6B3E26] text-[#6B3E26] font-bold hover:bg-[#F3E9DC] cursor-pointer"
                    >
                      نمایش یکجای همه ({toPersianDigits(activeTotalCount)} مورد)
                    </button>
                  ) : (
                    activeTotalCount > 20 && (
                      <button
                        type="button"
                        onClick={() => {
                          setPublishPageSize(20);
                          setPublishPage(1);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#FAF5EE] border border-[#D8C7B2] text-[#5C4033] font-bold hover:bg-[#F3E9DC] cursor-pointer"
                      >
                        بازگشت به نمایش صفحه‌بندی (۲۰تایی)
                      </button>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ===================== PHASE 3 MODAL 1: IN-PLACE BOOK INSPECTOR & QUICK EDIT ===================== */}
      {inspectingBookTarget && (() => {
        const meta = resolveLiveBookMeta(inspectingBookTarget.bookId, inspectingBookTarget.fallbackTitle);
        const bookLinks = links.filter(
          (l) =>
            (inspectingBookTarget.bookId && l.tempBookId === inspectingBookTarget.bookId) ||
            normalizePersianText(l.bookTitleRaw) === normalizePersianText(meta.title)
        );
        return (
          <ModalWindow
            onClose={() => setInspectingBookTarget(null)}
            title={`پرونده و ویرایش درجا کتاب (${inspectingBookTarget.bookId || '—'})`}
            maxWidthClass="max-w-2xl"
          >
            <div className="space-y-4 text-xs">
              <div className="bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="font-bold text-sm text-[#332218] flex items-center gap-1.5">
                    <BookOpenCheck className="w-4 h-4 text-[#6B3E26]" />
                    <span>{meta.title}</span>
                  </div>
                  <div className="text-[11px] text-[#6E5846]">
                    ناشر فعلی: {meta.publisher} · محل قفسه فعلی: {meta.location}
                  </div>
                </div>
                {inspectingBookTarget.bookId && (
                  <span className="font-mono font-bold px-2.5 py-1 rounded-lg bg-white border border-[#D8C7B2] text-[#1F4E79]" dir="ltr">
                    {inspectingBookTarget.bookId}
                  </span>
                )}
              </div>

              <form onSubmit={handleSaveBookInspector} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-[#332218] mb-1">عنوان کتاب *</label>
                    <input
                      type="text"
                      required
                      value={bookFormTitle}
                      onChange={(e) => setBookFormTitle(e.target.value)}
                      className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#D8C7B2] rounded-xl font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-[#332218] mb-1">ناشر</label>
                    <input
                      type="text"
                      value={bookFormPublisher}
                      onChange={(e) => setBookFormPublisher(e.target.value)}
                      className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#D8C7B2] rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-[#5C4033] mb-1">نویسنده / گردآورنده</label>
                    <input
                      type="text"
                      value={bookFormAuthor}
                      onChange={(e) => setBookFormAuthor(e.target.value)}
                      className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#D8C7B2] rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-[#5C4033] mb-1">سال نشر</label>
                    <input
                      type="text"
                      value={bookFormYear}
                      onChange={(e) => setBookFormYear(e.target.value)}
                      className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#D8C7B2] rounded-xl tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-[#5C4033] mb-1">دسته موضوعی</label>
                    <input
                      type="text"
                      value={bookFormCategory}
                      onChange={(e) => setBookFormCategory(e.target.value)}
                      className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#D8C7B2] rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-[#5C4033] mb-1">قفسه</label>
                    <select
                      value={bookFormShelf}
                      onChange={(e) => setBookFormShelf(e.target.value as ShelfCode)}
                      className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-[#D8C7B2] rounded-xl font-bold"
                    >
                      {SHELVES.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.code}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-[#5C4033] mb-1">طبقه</label>
                    <select
                      value={bookFormLevel}
                      onChange={(e) => setBookFormLevel(e.target.value as LevelCode)}
                      className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-[#D8C7B2] rounded-xl font-bold"
                    >
                      {LEVELS.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.code}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block font-medium text-[#5C4033] mb-1">وضعیت فیزیکی</label>
                    <select
                      value={bookFormStatus}
                      onChange={(e) => setBookFormStatus(e.target.value as 'verified' | 'review' | 'not_found')}
                      className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-[#D8C7B2] rounded-xl font-bold"
                    >
                      <option value="verified">موجود و تأییدشده</option>
                      <option value="review">نیازمند بررسی</option>
                      <option value="not_found">پیدا نشد</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-[#5C4033] mb-1">یادداشت کتابخانه</label>
                  <textarea
                    rows={2}
                    value={bookFormNotes}
                    onChange={(e) => setBookFormNotes(e.target.value)}
                    className="w-full p-2.5 bg-white border border-[#D8C7B2] rounded-xl"
                  />
                </div>

                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bookFormExpertApproved}
                    onChange={(e) => setBookFormExpertApproved(e.target.checked)}
                    className="w-4 h-4 accent-[#2E6F40]"
                  />
                  <span className="font-bold text-[#1E4D2B]">مهر تأیید کارشناسی کتابخانه</span>
                </label>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[#EFE4D6]">
                  <button
                    type="button"
                    onClick={() => setInspectingBookTarget(null)}
                    className="min-h-[40px] px-4 py-1.5 bg-[#FAF5EE] border border-[#D8C7B2] text-[#332218] font-bold rounded-xl cursor-pointer"
                  >
                    بستن
                  </button>
                  {onSaveAuditRecord && (
                    <button
                      type="submit"
                      className="min-h-[40px] px-5 py-1.5 bg-[#2E6F40] hover:bg-[#235632] text-white font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>ذخیره و همگام‌سازی کتاب</span>
                    </button>
                  )}
                </div>
              </form>

              {bookLinks.length > 0 && (
                <div className="pt-3 border-t border-[#EFE4D6] space-y-2">
                  <div className="font-bold text-[#332218]">
                    شهدای متصل به این کتاب ({toPersianDigits(bookLinks.length)} پیوند):
                  </div>
                  <div className="max-h-44 overflow-y-auto space-y-1.5">
                    {bookLinks.map((lnk) => (
                      <div
                        key={lnk.id}
                        className="flex flex-wrap items-center justify-between gap-2 bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl px-3 py-2"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setInspectingBookTarget(null);
                            handleOpenMartyrInspector(lnk.martyrNameRaw);
                          }}
                          className="font-bold text-[#1F4E79] hover:underline cursor-pointer"
                        >
                          {lnk.martyrNameRaw}
                        </button>
                        <div className="flex items-center gap-2 text-[11px] text-[#5C4033]">
                          <span>ص: {toPersianDigits(lnk.pageReferenceRaw || '—')}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setInspectingBookTarget(null);
                              handleOpenLinkEditor(lnk.id);
                            }}
                            className="px-2 py-0.5 rounded-lg bg-white border border-[#D8C7B2] text-[#332218] font-bold hover:bg-[#EFE4D6] cursor-pointer"
                          >
                            ویرایش پیوند
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ModalWindow>
        );
      })()}

      {/* ===================== PHASE 3 MODAL 2: IN-PLACE MARTYR INSPECTOR & CUSTOM EDIT ===================== */}
      {inspectingMartyrName && (() => {
        const cleanM = inspectingMartyrName.replace(/^(شهیدان|شهید)\s+/g, '').trim();
        const normM = normalizePersianText(cleanM);
        const martyrLinks = links.filter((l) => {
          const ln = normalizePersianText(l.martyrNameRaw.replace(/^(شهیدان|شهید)\s+/g, ''));
          return ln && (ln === normM || ln.includes(normM) || normM.includes(ln));
        });
        const martyrExtracts = extractedItems.filter((ex) => {
          const en = normalizePersianText(ex.martyrNameRaw.replace(/^(شهیدان|شهید)\s+/g, ''));
          return en && (en === normM || en.includes(normM) || normM.includes(en));
        });
        const golzarMatch = workbookMartyrs.find(
          (w) => normalizePersianText(w.fullNameSearch) === normM
        );
        const firstLnk = martyrLinks[0];
        const graveText =
          (golzarMatch
            ? `قطعه ${toPersianDigits(golzarMatch.piece || '—')} · ردیف ${toPersianDigits(golzarMatch.graveRow || '—')} · شماره ${toPersianDigits(golzarMatch.graveNumber || '—')}`
            : firstLnk && (firstLnk.gravePieceRaw || firstLnk.graveRowRaw || firstLnk.graveNumberRaw)
            ? `قطعه ${toPersianDigits(firstLnk.gravePieceRaw || '—')} · ردیف ${toPersianDigits(firstLnk.graveRowRaw || '—')} · شماره ${toPersianDigits(firstLnk.graveNumberRaw || '—')}`
            : 'درج‌نشده');

        return (
          <ModalWindow
            onClose={() => setInspectingMartyrName(null)}
            title={`پرونده درجا شهید: ${inspectingMartyrName}`}
            maxWidthClass="max-w-2xl"
          >
            <div className="space-y-4 text-xs">
              <div className="bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1">
                  <div className="font-bold text-sm text-[#332218] flex items-center gap-1.5 flex-wrap">
                    <UserCheck className="w-4 h-4 text-[#1F4E79]" />
                    <span>{inspectingMartyrName}</span>
                    {evaluateMartyrTehranStatus({
                      martyrName: inspectingMartyrName,
                      gravePiece: golzarMatch?.piece || firstLnk?.gravePieceRaw || ''
                    }).isTehran && <TehranMartyrBadge size="xs" />}
                  </div>
                  <div className="text-[11px] text-[#5C4033] flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#8C3B2B]" />
                    <span>نشانی مزار: {graveText}</span>
                  </div>
                </div>

                {onJumpToSmartSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = inspectingMartyrName;
                      setInspectingMartyrName(null);
                      onJumpToSmartSearch(target);
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#1F4E79] hover:bg-[#163A5B] text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>جست‌وجوی هوشمند کتاب‌ها</span>
                  </button>
                )}
              </div>

              {editingCustomMartyrId && onUpdateCustomMartyr && (
                <form
                  onSubmit={handleSaveCustomMartyrInspector}
                  className="bg-[#F0F7F4] border border-[#C2DFCE] rounded-xl p-3.5 space-y-2.5"
                >
                  <div className="font-bold text-[#1E4D2B] flex items-center gap-1.5">
                    <Pencil className="w-3.5 h-3.5" />
                    <span>ویرایش مستقیم پرونده شهید مستقل ({editingCustomMartyrId})</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-[#332218] mb-0.5">نام کامل *</label>
                      <input
                        type="text"
                        required
                        value={cmFullName}
                        onChange={(e) => setCmFullName(e.target.value)}
                        className="w-full min-h-[36px] px-2.5 py-1 bg-white border border-[#C2DFCE] rounded-lg font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#5C4033] mb-0.5">قطعه</label>
                      <input
                        type="text"
                        value={cmPiece}
                        onChange={(e) => setCmPiece(e.target.value)}
                        className="w-full min-h-[36px] px-2.5 py-1 bg-white border border-[#C2DFCE] rounded-lg tabular-nums"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="block text-[11px] font-medium text-[#5C4033] mb-0.5">ردیف</label>
                        <input
                          type="text"
                          value={cmRow}
                          onChange={(e) => setCmRow(e.target.value)}
                          className="w-full min-h-[36px] px-2 py-1 bg-white border border-[#C2DFCE] rounded-lg tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-[#5C4033] mb-0.5">شماره</label>
                        <input
                          type="text"
                          value={cmNumber}
                          onChange={(e) => setCmNumber(e.target.value)}
                          className="w-full min-h-[36px] px-2 py-1 bg-white border border-[#C2DFCE] rounded-lg tabular-nums"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
                    <div className="flex-1">
                      <label className="block text-[11px] font-medium text-[#5C4033] mb-0.5">توضیحات</label>
                      <input
                        type="text"
                        value={cmNotes}
                        onChange={(e) => setCmNotes(e.target.value)}
                        className="w-full min-h-[36px] px-2.5 py-1 bg-white border border-[#C2DFCE] rounded-lg"
                      />
                    </div>
                    <button
                      type="submit"
                      className="min-h-[36px] px-4 py-1.5 bg-[#2E6F40] hover:bg-[#235632] text-white font-bold rounded-lg cursor-pointer shrink-0"
                    >
                      ذخیره و همگام‌سازی شهید
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-2">
                <div className="font-bold text-[#332218]">
                  کتاب‌ها و پیوندهای این شهید ({toPersianDigits(martyrLinks.length)} مورد):
                </div>
                {martyrLinks.length === 0 ? (
                  <p className="text-[#6E5846] bg-[#FAF5EE] rounded-xl p-3">پیوندی ثبت نشده است.</p>
                ) : (
                  <div className="max-h-52 overflow-y-auto space-y-1.5">
                    {martyrLinks.map((lnk) => {
                      const bMeta = resolveLiveBookMeta(lnk.tempBookId, lnk.bookTitleRaw, lnk.publisherRaw);
                      return (
                        <div
                          key={lnk.id}
                          className="bg-white border border-[#E2D2BE] rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2"
                        >
                          <div className="space-y-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                setInspectingMartyrName(null);
                                handleOpenBookInspector(lnk.tempBookId, bMeta.title);
                              }}
                              className="font-bold text-[#6B3E26] hover:underline text-right cursor-pointer"
                            >
                              کتاب «{bMeta.title}» ({bMeta.publisher})
                            </button>
                            <div className="text-[11px] text-[#5C4033]">
                              صفحه: {toPersianDigits(lnk.pageReferenceRaw || '—')} · وضعیت: {lnk.reviewStatus}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setInspectingMartyrName(null);
                                handleOpenLinkEditor(lnk.id);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-[#FAF5EE] border border-[#D8C7B2] text-[#332218] font-bold hover:bg-[#EFE4D6] cursor-pointer"
                            >
                              ویرایش پیوند
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setInspectingMartyrName(null);
                                handleStartExtractFromLink(lnk);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-[#EDF6F0] border border-[#C6DFCD] text-[#1E4D2B] font-bold hover:bg-[#DDF0E3] cursor-pointer"
                            >
                              + ثبت مطلب
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {martyrExtracts.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-[#EFE4D6]">
                  <div className="font-bold text-[#2E6F40]">
                    مطالب استخراج‌شده ({toPersianDigits(martyrExtracts.length)} مورد):
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1.5">
                    {martyrExtracts.map((ex) => {
                      const exMeta = resolveLiveBookMeta(ex.tempBookId, ex.bookTitleRaw, ex.publisherRaw);
                      return (
                        <div key={ex.id} className="bg-[#EDF6F0] border border-[#C6DFCD] rounded-xl p-2.5">
                          <div className="font-bold text-[#1E4D2B]">
                            [{ex.contentType}] {ex.passageTitle} — کتاب «{exMeta.title}» (ص {toPersianDigits(ex.pageReferenceRaw)})
                          </div>
                          <p className="text-[11px] text-[#332218] mt-1 line-clamp-2">{ex.extractedText}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2 border-t border-[#EFE4D6]">
                <button
                  type="button"
                  onClick={() => setInspectingMartyrName(null)}
                  className="min-h-[38px] px-4 py-1.5 bg-[#FAF5EE] border border-[#D8C7B2] text-[#332218] font-bold rounded-xl cursor-pointer"
                >
                  بستن
                </button>
              </div>
            </div>
          </ModalWindow>
        );
      })()}

      {/* ===================== PHASE 3 MODAL 3: IN-PLACE LINK QUICK EDITOR ===================== */}
      {editingLinkRecord && (() => {
        const meta = resolveLiveBookMeta(
          editingLinkRecord.tempBookId,
          editingLinkRecord.bookTitleRaw,
          editingLinkRecord.publisherRaw
        );
        return (
          <ModalWindow
            onClose={() => setEditingLinkRecord(null)}
            title={`ویرایش درجا پیوند کتاب و شهید (${editingLinkRecord.id})`}
            maxWidthClass="max-w-xl"
          >
            <form onSubmit={handleSaveLinkEditor} className="space-y-3.5 text-xs">
              <div className="bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl p-3 space-y-0.5">
                <div className="font-bold text-[#6B3E26] text-sm">کتاب «{meta.title}»</div>
                <div className="text-[11px] text-[#6E5846]">
                  ناشر: {meta.publisher} · شناسه کتاب: {editingLinkRecord.tempBookId || '—'}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#332218] mb-1">نام شهید / عبارت مرتبط *</label>
                  <input
                    type="text"
                    required
                    value={editLinkMartyrName}
                    onChange={(e) => setEditLinkMartyrName(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#D8C7B2] rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#332218] mb-1">شماره صفحه در کتاب</label>
                  <input
                    type="text"
                    value={editLinkPageRef}
                    onChange={(e) => setEditLinkPageRef(e.target.value)}
                    placeholder="مثال: ص ۴۵ تا ۵۲"
                    className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#D8C7B2] rounded-xl tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-medium text-[#5C4033] mb-1">قطعه</label>
                  <input
                    type="text"
                    value={editLinkPiece}
                    onChange={(e) => setEditLinkPiece(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 py-1 bg-white border border-[#D8C7B2] rounded-xl tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#5C4033] mb-1">ردیف</label>
                  <input
                    type="text"
                    value={editLinkRow}
                    onChange={(e) => setEditLinkRow(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 py-1 bg-white border border-[#D8C7B2] rounded-xl tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#5C4033] mb-1">شماره قبر</label>
                  <input
                    type="text"
                    value={editLinkNumber}
                    onChange={(e) => setEditLinkNumber(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 py-1 bg-white border border-[#D8C7B2] rounded-xl tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#5C4033] mb-1">توضیح ارتباط / شرح منبع</label>
                <input
                  type="text"
                  value={editLinkSourceDesc}
                  onChange={(e) => setEditLinkSourceDesc(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#D8C7B2] rounded-xl"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block font-bold text-[#332218] mb-1">وضعیت بازبینی کارشناس</label>
                  <select
                    value={editLinkReviewStatus}
                    onChange={(e) => setEditLinkReviewStatus(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#D8C7B2] rounded-xl font-bold"
                  >
                    <option value="تأییدشده کارشناسی">تأییدشده کارشناسی</option>
                    <option value="نیازمند بررسی">نیازمند بررسی</option>
                    <option value="نیازمند تکمیل مزار">نیازمند تکمیل مزار</option>
                    <option value="نیازمند تطبیق کتاب">نیازمند تطبیق کتاب</option>
                    <option value="ردشده با دلیل">ردشده با دلیل</option>
                  </select>
                </div>

                <label className="inline-flex items-center gap-2 pt-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editLinkIsGroup}
                    onChange={(e) => setEditLinkIsGroup(e.target.checked)}
                    className="w-4 h-4 accent-[#6B3E26]"
                  />
                  <span className="font-medium text-[#332218]">عبارت گروهی چندشهیدی است</span>
                </label>
              </div>

              <div>
                <label className="block font-medium text-[#5C4033] mb-1">یادداشت کارشناس</label>
                <input
                  type="text"
                  value={editLinkNote}
                  onChange={(e) => setEditLinkNote(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#D8C7B2] rounded-xl"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#EFE4D6]">
                <button
                  type="button"
                  onClick={() => {
                    const id = editingLinkRecord.id;
                    setEditingLinkRecord(null);
                    handleConfirmDeleteLink(id);
                  }}
                  className="min-h-[40px] px-3.5 py-1.5 bg-[#FDF0F0] hover:bg-[#FADADA] text-[#A63A3A] border border-[#E6B8B8] font-bold rounded-xl inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>حذف پیوند</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingLinkRecord(null)}
                    className="min-h-[40px] px-4 py-1.5 bg-[#FAF5EE] border border-[#D8C7B2] text-[#332218] font-bold rounded-xl cursor-pointer"
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    className="min-h-[40px] px-5 py-1.5 bg-[#1F4E79] hover:bg-[#163A5B] text-white font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>ذخیره و همگام‌سازی</span>
                  </button>
                </div>
              </div>
            </form>
          </ModalWindow>
        );
      })()}
    </div>
  );
};
