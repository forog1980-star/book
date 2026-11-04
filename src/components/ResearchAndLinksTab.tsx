import React, { useState, useMemo } from 'react';
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
  SlidersHorizontal
} from 'lucide-react';
import { DepositoryAndExportHub } from './DepositoryAndExportHub';
import {
  BookCopyRecord,
  BookMartyrLinkRecord,
  ExtractedContentItem,
  ExtractedContentType,
  ExtractedReviewStatus,
  FieldAuditRecord,
  MultiMartyrGroupAudit,
  PendingReviewItem,
  ReferenceCatalogRow,
  WorkbookGolzarMartyr,
  normalizePersianText,
  toPersianDigits
} from '../data/markazAsnadData';
import { SOOREH_MEHR_RESEARCH_STATS } from '../data/soorehMehrResearch';
import { generateUniqueExtractedId, generateUniqueLinkId } from '../utils/idGenerator';

interface ResearchAndLinksTabProps {
  catalogRows: ReferenceCatalogRow[];
  auditRecords?: Record<string, FieldAuditRecord>;
  bookCopies?: BookCopyRecord[];
  links: BookMartyrLinkRecord[];
  pendingReviews: PendingReviewItem[];
  workbookMartyrs?: WorkbookGolzarMartyr[];
  multiMartyrGroups: MultiMartyrGroupAudit[];
  extractedItems: ExtractedContentItem[];
  onAddLink: (newLink: BookMartyrLinkRecord) => void;
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
  links,
  pendingReviews,
  workbookMartyrs = [],
  multiMartyrGroups,
  extractedItems,
  onAddLink,
  onUpdateLinkStatus,
  onUpdatePendingReviewStatus,
  onUpdateGroupAudit,
  onAddExtractedItem,
  onUpdateExtractedItemStatus,
  onJumpToSmartSearch,
  onNotify
}) => {
  const [subView, setSubView] = useState<
    'links' | 'extracted' | 'pending567' | 'groups16' | 'publish_gateway' | 'depository'
  >('depository');
  const [deskMode, setDeskMode] = useState<'streamlined' | 'detailed'>('streamlined');
  const [hideArchivedGroups, setHideArchivedGroups] = useState<boolean>(() => {
    try {
      return localStorage.getItem('book_hide_archived_groups') === 'true';
    } catch {
      return false;
    }
  });
  const [externalIdPrefix, setExternalIdPrefix] = useState('GOLZAR-TEH-');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('named_only');
  const [contentTypeFilter, setContentTypeFilter] = useState<string>('all');
  const [visibleLimit, setVisibleLimit] = useState<number>(60);

  // Add New Link Form State
  const [showAddLink, setShowAddLink] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState(catalogRows[0]?.tempBookId || 'BK-0001');
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

  // Sub-filter & Reject Modal for Extracted Items
  const [extractedStatusFilter, setExtractedStatusFilter] = useState<string>('all');
  const [rejectingExtractedId, setRejectingExtractedId] = useState<string | null>(null);
  const [extractedRejectReason, setExtractedRejectReason] = useState<string>('');


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

    onUpdatePendingReviewStatus(activeReviewPv.trackingId, targetStatusName);

    // If approved, create or update matching link in links
    if (pvTargetStatus === 'approved_to_links') {
      const existing = links.find(
        (l) => l.id === activeReviewPv.mainRecordId || (l.bookTitleRaw === activeReviewPv.bookTitle && l.martyrNameRaw === activeReviewPv.nameOrPhrase)
      );
      if (existing) {
        onUpdateLinkStatus(
          existing.id,
          'تأییدشده کارشناسی',
          pvReviewerNote.trim() || 'تکمیل و رفع اشکال از کاربرگ نیازمند بررسی'
        );
      } else {
        const bookObj = catalogRows.find(
          (b) => b.titleRaw === activeReviewPv.bookTitle || b.tempBookId === activeReviewPv.mainRecordId
        );
        onAddLink({
          id: `RL-${String(links.length + 1).padStart(4, '0')}`,
          tempBookId: bookObj?.tempBookId || '',
          bookTitleRaw: activeReviewPv.bookTitle,
          publisherRaw: activeReviewPv.publisher,
          martyrNameRaw: pvMartyrName.trim() || activeReviewPv.nameOrPhrase,
          isGroupPhrase: false,
          gravePieceRaw: pvGravePiece.trim(),
          graveRowRaw: pvGraveRow.trim(),
          graveNumberRaw: pvGraveNumber.trim(),
          pageReferenceRaw: pvPageRef.trim() || 'استخراج‌شده توسط کارشناس',
          sourceDescriptionRaw: `رفع اشکال از ردیف ${activeReviewPv.trackingId} (${activeReviewPv.issueSubject})`,
          sourceFile: 'کاربرگ موارد نیازمند بررسی',
          sourceSheet: activeReviewPv.mainSheet,
          sourceExcelRow: activeReviewPv.mainRecordId,
          reviewStatus: 'تأییدشده کارشناسی',
          reviewerNote: pvReviewerNote.trim() || 'تکمیل و تأیید در سامانه'
        });
      }
      onNotify(
        `مورد ${activeReviewPv.trackingId} با موفقیت بررسی و ثبت شد و به پیوندهای معتبر منتقل گردید.`
      );
    } else {
      onNotify(`وضعیت مورد ${activeReviewPv.trackingId} به «${targetStatusName}» به‌روزرسانی شد.`);
    }

    setActiveReviewPv(null);
  };

  // Filtered 836 Links
  const allFilteredLinks = useMemo(() => {
    const q = normalizePersianText(searchQuery);
    return links.filter((lnk) => {
      if (statusFilter === 'named_only') {
        if (!lnk.martyrNameRaw || lnk.martyrNameRaw === '*') return false;
      } else if (statusFilter !== 'all' && lnk.reviewStatus !== statusFilter) {
        return false;
      }

      if (!q) return true;
      const hay = normalizePersianText(
        `${lnk.id} ${lnk.tempBookId} ${lnk.bookTitleRaw} ${lnk.alternativeTitle || ''} ${
          lnk.publisherRaw
        } ${lnk.martyrNameRaw} ${lnk.gravePieceRaw} ${lnk.pageReferenceRaw} ${
          lnk.sourceDescriptionRaw
        }`
      );
      return q.split(' ').every((w) => hay.includes(w));
    });
  }, [links, searchQuery, statusFilter]);

  // Filtered Extracted Content Items
  const filteredExtractedItems = useMemo(() => {
    const q = normalizePersianText(searchQuery);
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
      if (!q) return true;
      const hay = normalizePersianText(
        `${item.id} ${item.tempBookId} ${item.bookTitleRaw} ${item.publisherRaw} ${item.martyrNameRaw} ${item.gravePieceRaw} ${item.pageReferenceRaw} ${item.contentType} ${item.passageTitle} ${item.extractedText} ${item.researcherNote}`
      );
      return q.split(' ').every((w) => hay.includes(w));
    });
  }, [extractedItems, searchQuery, contentTypeFilter, extractedStatusFilter]);

  // Filtered 567 Pending Reviews
  const filteredPendingReviews = useMemo(() => {
    const q = normalizePersianText(searchQuery);
    return pendingReviews.filter((pv) => {
      if (pendingStatusFilter === 'open' && pv.trackingStatus !== 'باز') return false;
      if (pendingStatusFilter === 'reviewed' && pv.trackingStatus !== 'بررسی‌شده') return false;
      if (pendingStatusFilter === 'needs_source' && pv.trackingStatus !== 'نیازمند منبع') return false;

      if (!q) return true;
      const hay = normalizePersianText(
        `${pv.trackingId} ${pv.mainSheet} ${pv.mainRecordId} ${pv.nameOrPhrase} ${pv.bookTitle} ${pv.publisher} ${pv.issueSubject}`
      );
      return q.split(' ').every((w) => hay.includes(w));
    });
  }, [pendingReviews, searchQuery, pendingStatusFilter]);

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
    if (!martyrName.trim()) {
      onNotify('نام شهید یا عبارت مرتبط ثبت‌شده در منبع را وارد کنید.', 'warning');
      return;
    }

    const bookObj = catalogRows.find((b) => b.tempBookId === selectedBookId);
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
    if (!exMartyrName.trim() || !exPassageTitle.trim() || !exExtractedText.trim()) {
      onNotify('نام شهید، عنوان مطلب و متن/خلاصه پژوهشی استخراج‌شده الزامی است.', 'warning');
      return;
    }

    const bookObj = catalogRows.find((b) => b.tempBookId === exBookId);
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
  };

  // Export Links Excel (.xlsx)
  const exportLinksExcel = () => {
    const rows = allFilteredLinks.map((l, idx) => ({
      'ردیف': idx + 1,
      'شناسه پیوند': l.id,
      'شناسه کتاب (مخزن)': l.tempBookId || '',
      'عنوان کتاب': l.bookTitleRaw,
      'عنوان دیگر': l.alternativeTitle || '',
      'ناشر': l.publisherRaw || '',
      'نام شهید / عبارت ثبت‌شده': l.martyrNameRaw,
      'قطعه مزار': l.gravePieceRaw || '',
      'ردیف مزار': l.graveRowRaw || '',
      'شماره مزار': l.graveNumberRaw || '',
      'ارجاع صفحه در اثر': l.pageReferenceRaw || '',
      'شرح و موضوع ارتباط': l.sourceDescriptionRaw || '',
      'منبع اطلاعات': `${l.sourceFile} / ${l.sourceSheet} (ردیف ${l.sourceExcelRow})`,
      'وضعیت بررسی کارشناسی': l.reviewStatus,
      'یادداشت کارشناس': l.reviewerNote || ''
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'پیوندهای کتاب و شهید');
    XLSX.writeFile(wb, `پیوندهای-کتاب-و-شهید-${new Date().toISOString().slice(0, 10)}.xlsx`);
    onNotify(`فایل اکسل پیوندهای کتاب و شهید شامل ${toPersianDigits(rows.length)} رکورد دانلود شد.`);
  };

  // Export Links CSV
  const exportLinksCsv = () => {
    const hdrs = [
      'شناسه پیوند',
      'شناسه کتاب',
      'عنوان کتاب',
      'ناشر',
      'نام شهید',
      'قطعه مزار',
      'ردیف',
      'شماره مزار',
      'ارجاع صفحه',
      'موضوع ارتباط',
      'فایل منبع',
      'شیت منبع',
      'وضعیت بررسی',
      'یادداشت کارشناس'
    ];
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      hdrs.map(cell).join(','),
      ...allFilteredLinks.map((l) =>
        [
          l.id,
          l.tempBookId,
          l.bookTitleRaw,
          l.publisherRaw,
          l.martyrNameRaw,
          l.gravePieceRaw,
          l.graveRowRaw,
          l.graveNumberRaw,
          l.pageReferenceRaw,
          l.sourceDescriptionRaw,
          l.sourceFile,
          l.sourceSheet,
          l.reviewStatus,
          l.reviewerNote
        ]
          .map(cell)
          .join(',')
      )
    ];
    const blob = new Blob(['\uFEFF', lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `پیوندهای-کتاب-و-شهید-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    onNotify('فایل CSV پیوندها دانلود شد.');
  };

  // Export Links JSON
  const exportLinksJson = () => {
    const blob = new Blob([JSON.stringify(allFilteredLinks, null, 2)], {
      type: 'application/json;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `پیوندهای-کتاب-و-شهید-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    onNotify('فایل JSON پیوندها دانلود شد.');
  };

  // Export Extracted Content Items Excel (.xlsx)
  const exportExtractedExcel = () => {
    const rows = filteredExtractedItems.map((it, idx) => ({
      'ردیف': idx + 1,
      'شناسه مطلب': it.id,
      'شناسه کتاب (مخزن)': it.tempBookId,
      'عنوان کتاب': it.bookTitleRaw,
      'ناشر': it.publisherRaw || '',
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
    }));
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
      ...filteredExtractedItems.map((it) =>
        [
          it.id,
          it.tempBookId,
          it.bookTitleRaw,
          it.publisherRaw,
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
          .join(',')
      )
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

    setHideArchivedGroups(true);
    try {
      localStorage.setItem('book_hide_archived_groups', 'true');
    } catch {
      // ignore
    }
    setSubView('depository');
    onNotify(
      `وضعیت هر ۱۶ گروه چندشهیدی (G001 تا G016) به «تأیید» تغییر یافت${
        updatedLinksCount > 0
          ? ` و ${toPersianDigits(updatedLinksCount)} پیوند مرتبط نیز در دپوی اسناد «تأییدشده کارشناسی» شد`
          : ''
      }. برگه ۱۶ گروه در حالت بایگانی قرار گرفت.`
    );
  };

  return (
    <div className="space-y-5">
      {/* Sub-navigation Switcher for all Specialist Modules */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex flex-wrap items-center gap-1.5">
              <span>میز تخصصی کارشناسان مرکز اسناد</span>
              <span className="text-xs font-normal text-slate-500">
                (سامانه جامع پیوند کتاب و شهید، ارزیابی شیت‌ها و دپوی اسناد)
              </span>
            </h2>
          </div>

          {/* Mode Toggle: Streamlined / Detailed Desk */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDeskMode((prev) => (prev === 'streamlined' ? 'detailed' : 'streamlined'))}
              className="px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#1f4e79]" />
              <span>
                {deskMode === 'streamlined'
                  ? 'نمای ساده و خلوت (پیش‌فرض)'
                  : 'نمای کامل همه شیت‌ها'}
              </span>
            </button>

            {hideArchivedGroups && (
              <button
                type="button"
                onClick={() => {
                  setHideArchivedGroups(false);
                  try {
                    localStorage.removeItem('book_hide_archived_groups');
                  } catch {
                    // ignore
                  }
                  onNotify('شیت ۱۶ گروه چندشهیدی از حالت بایگانی خارج شد.');
                }}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                title="نمایش مجدد ۱۶ گروه چندشهیدی"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>بازیابی ۱۶ گروه</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Buttons Grid */}
        <div className="flex flex-wrap gap-2 p-1 bg-slate-100 rounded-xl text-xs">
          {/* 1. MASTER DEPOSITORY & 2-WAY EXPORT (Prominent Hub) */}
          <button
            type="button"
            onClick={() => {
              setSubView('depository');
            }}
            className={`min-h-[44px] px-4 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 flex-1 min-w-[180px] ${
              subView === 'depository'
                ? 'bg-gradient-to-r from-[#173a5a] to-[#1f4e79] text-white shadow-sm ring-2 ring-emerald-500/50'
                : 'bg-emerald-50 text-[#1a6348] border border-emerald-300 hover:bg-emerald-100 font-extrabold'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>مرکز دپو و خروجی نهایی (دوسویه)</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-600 text-white font-mono">
              اکسل/JSON
            </span>
          </button>

          {/* 2. Core Links */}
          <button
            type="button"
            onClick={() => {
              setSubView('links');
              setVisibleLimit(60);
            }}
            className={`min-h-[44px] px-3.5 py-2 rounded-lg font-bold transition-colors flex items-center justify-center gap-1.5 flex-1 min-w-[140px] ${
              subView === 'links'
                ? 'bg-[#1f4e79] text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900 bg-white/60'
            }`}
          >
            <Link2 className="w-4 h-4 shrink-0" />
            <span>ارتباط کتاب و شهید ({toPersianDigits(links.length)})</span>
          </button>

          {/* 3. Pending Reviews (567) */}
          <button
            type="button"
            onClick={() => {
              setSubView('pending567');
              setVisibleLimit(60);
            }}
            className={`min-h-[42px] px-3.5 py-2 rounded-lg font-bold transition-colors flex items-center justify-center gap-1.5 flex-1 min-w-[140px] ${
              subView === 'pending567'
                ? 'bg-[#1f4e79] text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900 bg-white/60'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
            <span>نیازمند بررسی ({toPersianDigits(pendingReviews.length)})</span>
          </button>

          {/* 4. Extracted Items */}
          <button
            type="button"
            onClick={() => {
              setSubView('extracted');
              setVisibleLimit(60);
            }}
            className={`min-h-[42px] px-3.5 py-2 rounded-lg font-bold transition-colors flex items-center justify-center gap-1.5 flex-1 min-w-[140px] ${
              subView === 'extracted'
                ? 'bg-[#1f4e79] text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900 bg-white/60'
            }`}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>مطالب استخراج‌شده ({toPersianDigits(extractedItems.length)})</span>
          </button>


          {((deskMode === 'detailed' && !hideArchivedGroups) || subView === 'groups16') && (
            <button
              type="button"
              onClick={() => setSubView('groups16')}
              className={`min-h-[42px] px-3.5 py-2 rounded-lg font-bold transition-colors flex items-center justify-center gap-1.5 flex-1 min-w-[130px] ${
                subView === 'groups16'
                  ? 'bg-[#1f4e79] text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900 bg-white/60'
              }`}
            >
              <ClipboardCheck className="w-4 h-4 shrink-0" />
              <span>۱۶ گروه چندشهیدی</span>
            </button>
          )}

          {/* Publishing Gateway */}
          <button
            type="button"
            onClick={() => setSubView('publish_gateway')}
            className={`min-h-[42px] px-3.5 py-2 rounded-lg font-bold transition-colors flex items-center justify-center gap-1.5 flex-1 min-w-[150px] ${
              subView === 'publish_gateway'
                ? 'bg-[#2E7D5B] text-white shadow-xs'
                : 'text-[#2E7D5B] hover:bg-emerald-50 bg-emerald-50/50'
            }`}
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>دروازه انتشار رسمی</span>
          </button>
        </div>
      </div>

      {subView === 'links' && (
        <div className="space-y-4">
          {/* Search & Filter Bar + Export Toolbar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setVisibleLimit(60);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onNotify(
                        `فیلتر اعمال شد: ${toPersianDigits(allFilteredLinks.length)} رکورد ارتباط منطبق یافت شد.`
                      );
                    }
                  }}
                  placeholder="جست‌وجوی نام شهید، عنوان کتاب، عنوان دیگر، قطعه یا کد RL-0015 (با کلید Enter)..."
                  className="w-full min-h-[44px] pr-10 pl-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-[#1f4e79]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setVisibleLimit(60);
                  }}
                  className="min-h-[44px] px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl text-slate-800 font-medium"
                >
                  <option value="named_only">رکوردهای دارای نام/عبارت ثبت‌شده (حذف خالی و *)</option>
                  <option value="all">همه رکوردهای شیت ({toPersianDigits(links.length)} مورد)</option>
                  <option value="بررسی‌شده در پژوهش اصلی">بررسی‌شده در پژوهش اصلی (پژوهش سوره مهر)</option>
                  <option value="بررسی‌نشده">بررسی‌نشده</option>
                  <option value="نیازمند تکمیل">نیازمند تکمیل</option>
                  <option value="نیازمند تفکیک نام‌ها">نیازمند تفکیک نام‌ها (عبارت گروهی)</option>
                  <option value="نیازمند تکمیل مزار">نیازمند تکمیل مزار</option>
                  <option value="نیازمند بررسی مزار">نیازمند بررسی مزار (اختلاف مزار)</option>
                  <option value="نیازمند تطبیق کتاب">نیازمند تطبیق کتاب</option>
                  <option value="تأییدشده کارشناسی">تأییدشده کارشناسی</option>
                </select>

                <button
                  type="button"
                  onClick={() => setShowAddLink((prev) => !prev)}
                  className="min-h-[44px] px-4 py-2 bg-[#1f4e79] hover:bg-[#163a5b] text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>ثبت پیوند جدید</span>
                </button>
              </div>
            </div>

            {/* Links Export Buttons Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
              <div className="text-slate-600 font-medium">
                تعداد رکوردهای منطبق: <strong className="text-slate-900 tabular-nums">{toPersianDigits(allFilteredLinks.length)}</strong> پیوند
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={exportLinksExcel}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>خروجی اکسل پیوندها (.xlsx)</span>
                </button>

                <button
                  type="button"
                  onClick={exportLinksCsv}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>خروجی CSV</span>
                </button>

                <button
                  type="button"
                  onClick={exportLinksJson}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <FileJson className="w-3.5 h-3.5 text-amber-600" />
                  <span>خروجی JSON</span>
                </button>
              </div>
            </div>

            {/* خلاصه آمار بازیابی فایل پژوهشی سوره مهر (۸ شاخص دقیق مأموریت) */}
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 text-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-emerald-950">
                  آمار رسمی بازیابی فایل «{SOOREH_MEHR_RESEARCH_STATS.sourceFileName}» (شیت {SOOREH_MEHR_RESEARCH_STATS.sourceSheetName}):
                </span>
                <span className="text-[11px] font-semibold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-200">
                  آرشیو منبع: /public/data/sooreh_mehr_book_martyr_research.json
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-[11px]">
                <div className="bg-white border border-emerald-200 rounded-lg p-2">
                  <div className="text-slate-500">۱. ردیف‌های شیت</div>
                  <div className="font-extrabold text-slate-900 mt-0.5 tabular-nums">
                    {toPersianDigits(SOOREH_MEHR_RESEARCH_STATS.totalRowsWithHeader)} سطر ({toPersianDigits(SOOREH_MEHR_RESEARCH_STATS.totalResearchRows)} داده)
                  </div>
                </div>
                <div className="bg-white border border-emerald-200 rounded-lg p-2">
                  <div className="text-slate-500">۲. کتاب‌های یکتا</div>
                  <div className="font-extrabold text-slate-900 mt-0.5 tabular-nums">
                    {toPersianDigits(SOOREH_MEHR_RESEARCH_STATS.uniqueBooksByRowId)} کتاب ({toPersianDigits(SOOREH_MEHR_RESEARCH_STATS.booksWithMartyrOrPhrase)} دارای ارتباط)
                  </div>
                </div>
                <div className="bg-white border border-emerald-200 rounded-lg p-2">
                  <div className="text-slate-500">۳. شهدای یکتا</div>
                  <div className="font-extrabold text-slate-900 mt-0.5 tabular-nums">
                    {toPersianDigits(SOOREH_MEHR_RESEARCH_STATS.uniqueNamedMartyrsCount)} شهید نام‌برده
                  </div>
                </div>
                <div className="bg-white border border-emerald-200 rounded-lg p-2">
                  <div className="text-slate-500">۴. کل ارتباطات فایل</div>
                  <div className="font-extrabold text-emerald-800 mt-0.5 tabular-nums">
                    {toPersianDigits(SOOREH_MEHR_RESEARCH_STATS.totalBookMartyrRelations)} ارتباط ({toPersianDigits(SOOREH_MEHR_RESEARCH_STATS.namedMartyrRelationsCount)} فردی + {toPersianDigits(SOOREH_MEHR_RESEARCH_STATS.groupPhraseRelationsCount)} گروهی)
                  </div>
                </div>
                <div className="bg-white border border-emerald-200 rounded-lg p-2">
                  <div className="text-slate-500">۵. منطبق با مخزن</div>
                  <div className="font-extrabold text-emerald-800 mt-0.5 tabular-nums">
                    {toPersianDigits(SOOREH_MEHR_RESEARCH_STATS.catalogMatchedBooksCount)} از {toPersianDigits(SOOREH_MEHR_RESEARCH_STATS.uniqueBooksByRowId)} کتاب (۱۰۰٪)
                  </div>
                </div>
                <div className="bg-white border border-emerald-200 rounded-lg p-2">
                  <div className="text-slate-500">۶. خارج از مخزن</div>
                  <div className="font-extrabold text-slate-900 mt-0.5 tabular-nums">
                    {toPersianDigits(SOOREH_MEHR_RESEARCH_STATS.catalogUnmatchedBooksCount)} در سوره مهر ({toPersianDigits(SOOREH_MEHR_RESEARCH_STATS.strictlyUnmatchedBeforeNormalizationBooksCount)} حل‌شده با نرمال‌سازی)
                  </div>
                </div>
                <div className="bg-white border border-emerald-200 rounded-lg p-2">
                  <div className="text-slate-500">۷. قطعی / احتمالی / بررسی</div>
                  <div className="font-extrabold text-slate-900 mt-0.5 tabular-nums">
                    {toPersianDigits(SOOREH_MEHR_RESEARCH_STATS.definiteRelationsCount)} / {toPersianDigits(SOOREH_MEHR_RESEARCH_STATS.probableRelationsCount)} / {toPersianDigits(SOOREH_MEHR_RESEARCH_STATS.needsExpertReviewRelationsCount)}
                  </div>
                </div>
                <div className="bg-white border border-emerald-200 rounded-lg p-2">
                  <div className="text-slate-500">۸. تکراری واقعی / ظاهری</div>
                  <div className="font-extrabold text-slate-900 mt-0.5 tabular-nums">
                    {toPersianDigits(SOOREH_MEHR_RESEARCH_STATS.trueDuplicateRelationsCount)} تکراری / {toPersianDigits(SOOREH_MEHR_RESEARCH_STATS.multiMartyrApparentRepeatRowsCount)} سطر چندشهیدی
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Add New Book-Martyr Link Form */}
          {showAddLink && (
            <form
              onSubmit={handleCreateLink}
              className="bg-white border-2 border-[#1f4e79] rounded-2xl p-4 sm:p-5 space-y-4 text-xs"
            >
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="font-bold text-sm text-slate-900">
                  ثبت ارتباط پژوهشی کتاب و شهید (همراه با ارجاع خام صفحه و منشأ)
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAddLink(false)}
                  className="text-slate-500 hover:text-slate-900"
                >
                  بستن
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">کتاب مرجع (BK) *</label>
                  <select
                    value={selectedBookId}
                    onChange={(e) => setSelectedBookId(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-300 rounded-xl"
                  >
                    {catalogRows.map((b) => (
                      <option key={b.rowKey} value={b.tempBookId}>
                        {b.tempBookId} — {b.titleRaw} ({b.publisherRaw})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    نام شهید یا عبارت مرتبط (عین منبع) *
                  </label>
                  <input
                    type="text"
                    required
                    value={martyrName}
                    onChange={(e) => setMartyrName(e.target.value)}
                    placeholder="مثال: احمد بیابانی"
                    className="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    ارجاع صفحه خام (عین منبع، مثلاً 173تا184)
                  </label>
                  <input
                    type="text"
                    value={pageRefRaw}
                    onChange={(e) => setPageRefRaw(e.target.value)}
                    placeholder="مثال: ص 45 تا 52"
                    className="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-medium text-slate-600 mb-1">قطعه مزار خام</label>
                  <input
                    type="text"
                    value={gravePiece}
                    onChange={(e) => setGravePiece(e.target.value)}
                    placeholder="24"
                    className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-600 mb-1">ردیف مزار خام</label>
                  <input
                    type="text"
                    value={graveRow}
                    onChange={(e) => setGraveRow(e.target.value)}
                    placeholder="77"
                    className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-600 mb-1">شماره مزار خام</label>
                  <input
                    type="text"
                    value={graveNumber}
                    onChange={(e) => setGraveNumber(e.target.value)}
                    placeholder="52"
                    className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl tabular-nums"
                  />
                </div>
                <div className="col-span-3 sm:col-span-1 flex items-end">
                  <label className="inline-flex items-center gap-2 min-h-[40px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isGroupPhrase}
                      onChange={(e) => setIsGroupPhrase(e.target.checked)}
                      className="w-4 h-4 accent-[#1f4e79]"
                    />
                    <span className="text-slate-700 font-medium">عبارت گروهی است</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-600 mb-1">شرح ارتباط / توضیح منبع</label>
                  <input
                    type="text"
                    value={sourceDesc}
                    onChange={(e) => setSourceDesc(e.target.value)}
                    placeholder="توضیح ثبت‌شده در شیت یا نوع مطلب..."
                    className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-600 mb-1">یادداشت کارشناس بازبین</label>
                  <input
                    type="text"
                    value={reviewerNote}
                    onChange={(e) => setReviewerNote(e.target.value)}
                    placeholder="یادداشت تصمیم یا ابهام..."
                    className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="submit"
                  className="min-h-[42px] px-5 py-2 bg-[#1f4e79] text-white font-bold rounded-xl"
                >
                  ذخیره ارتباط در فهرست کاری
                </button>
              </div>
            </form>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 px-1 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <div>
              نمایش <strong className="text-slate-900">{toPersianDigits(Math.min(visibleLimit, allFilteredLinks.length))}</strong> از{' '}
              <strong className="text-slate-900">{toPersianDigits(allFilteredLinks.length)}</strong> رکورد فیلترشده{' '}
              <span className="text-slate-500">
                (از مجموع کل {toPersianDigits(links.length)} سطر شیت ارتباط کتاب و شهید)
              </span>
            </div>
            {statusFilter === 'named_only' && (
              <span className="text-[11px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                فیلتر پیش‌فرض: رکوردهای دارای نام مشخص ({toPersianDigits(allFilteredLinks.length)} مورد)
              </span>
            )}
          </div>

          {/* Links Cards List */}
          <div className="space-y-3">
            {allFilteredLinks.slice(0, visibleLimit).map((lnk) => (
              <div
                key={lnk.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-[#1f4e79]" dir="ltr">
                      {lnk.id}
                    </span>
                    {lnk.tempBookId && (
                      <>
                        <span className="text-slate-400">·</span>
                        <span className="font-mono font-semibold text-slate-700" dir="ltr">
                          {lnk.tempBookId}
                        </span>
                      </>
                    )}
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-600">
                      منشأ: {lnk.sourceFile} / شیت «{lnk.sourceSheet}» / ردیف {toPersianDigits(lnk.sourceExcelRow)}
                    </span>
                    {lnk.groupStartRow && lnk.groupStartRow !== lnk.sourceExcelRow && (
                      <>
                        <span className="text-slate-400">·</span>
                        <span className="text-amber-800 font-medium">
                          آغاز گروه: ردیف {toPersianDigits(lnk.groupStartRow)}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Review Status Selector & Quick Extract Button */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleStartExtractFromLink(lnk)}
                      className="px-2.5 py-1 rounded-lg bg-[#edf4fa] hover:bg-[#dceaf7] text-[#1f4e79] font-semibold text-xs inline-flex items-center gap-1 transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>＋ ثبت مطلب استخراج‌شده</span>
                    </button>

                    <span className="text-slate-500">وضعیت:</span>
                    <select
                      value={lnk.reviewStatus}
                      onChange={(e) =>
                        onUpdateLinkStatus(lnk.id, e.target.value, lnk.reviewerNote)
                      }
                      className={`px-2.5 py-1 rounded-lg border text-xs font-bold ${
                        lnk.reviewStatus === 'تأییدشده کارشناسی' || lnk.reviewStatus === 'بررسی‌شده در پژوهش اصلی'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          : lnk.reviewStatus.includes('نیازمند')
                          ? 'bg-amber-50 border-amber-300 text-amber-800'
                          : 'bg-slate-50 border-slate-300 text-slate-700'
                      }`}
                    >
                      <option value="بررسی‌شده در پژوهش اصلی">بررسی‌شده در پژوهش اصلی</option>
                      <option value="پیشنهادشده توسط سامانه">پیشنهادشده توسط سامانه</option>
                      <option value="بررسی‌نشده">بررسی‌نشده</option>
                      <option value="نیازمند بررسی">نیازمند بررسی</option>
                      <option value="نیازمند تکمیل">نیازمند تکمیل</option>
                      <option value="نیازمند تفکیک نام‌ها">نیازمند تفکیک نام‌ها</option>
                      <option value="نیازمند تکمیل مزار">نیازمند تکمیل مزار</option>
                      <option value="نیازمند بررسی مزار">نیازمند بررسی مزار</option>
                      <option value="نیازمند تطبیق کتاب">نیازمند تطبیق کتاب</option>
                      <option value="تأییدشده کارشناسی">تأییدشده کارشناسی</option>
                      <option value="ردشده با دلیل">ردشده با دلیل</option>
                      <option value="دارای تعارض اطلاعاتی">دارای تعارض اطلاعاتی</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                  <div className="md:col-span-5">
                    <div className="text-xs text-slate-500">عنوان کتاب در منبع:</div>
                    <div className="text-base font-bold text-slate-900 mt-0.5">
                      {lnk.bookTitleRaw}
                      {lnk.alternativeTitle && (
                        <span className="text-xs font-normal text-[#1f4e79] mr-2">
                          (عنوان دیگر ثبت‌شده: «{lnk.alternativeTitle}»)
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">ناشر: {lnk.publisherRaw || '—'}</div>
                  </div>

                  <div className="md:col-span-4">
                    <div className="text-xs text-slate-500">
                      {lnk.isGroupPhrase ? 'عبارت گروهی ثبت‌شده:' : 'نام شهید یا عبارت ثبت‌شده:'}
                    </div>
                    <div className="text-base font-bold text-[#1f4e79] mt-0.5">
                      {lnk.martyrNameRaw || (lnk.rawNameInSource === '*' ? '* (علامت منبع)' : '(خالی در منبع)')}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5 tabular-nums">
                      مزار: قطعه {toPersianDigits(lnk.gravePieceRaw || 'خالی')} · ردیف{' '}
                      {toPersianDigits(lnk.graveRowRaw || 'خالی')} · شماره{' '}
                      {toPersianDigits(lnk.graveNumberRaw || 'خالی')}
                    </div>
                  </div>

                  <div className="md:col-span-3 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
                    <span className="text-slate-500 block">صفحه یا ارجاع خام:</span>
                    <strong className="text-slate-900 font-bold mt-0.5 block">
                      {toPersianDigits(lnk.pageReferenceRaw || '—')}
                    </strong>
                  </div>
                </div>

                {(lnk.sourceDescriptionRaw || lnk.reviewerNote) && (
                  <div className="text-xs text-slate-600 bg-slate-50/70 rounded-xl p-3 space-y-1">
                    {lnk.sourceDescriptionRaw && (
                      <div>
                        <strong className="text-slate-800">توضیحات کتاب در منبع: </strong>
                        {lnk.sourceDescriptionRaw}
                      </div>
                    )}
                    {lnk.reviewerNote && (
                      <div className="text-[#1f4e79]">
                        <strong>یادداشت بررسی: </strong>
                        {lnk.reviewerNote}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {allFilteredLinks.length > visibleLimit && (
              <button
                type="button"
                onClick={() => setVisibleLimit((prev) => prev + 100)}
                className="w-full min-h-[44px] py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-bold rounded-xl"
              >
                نمایش ۱۰۰ رکورد بعدی (از مجموع {toPersianDigits(allFilteredLinks.length)} رکورد)
              </button>
            )}
          </div>
        </div>
      )}

      {/* SubView 1.5: Extracted Content & Page Passages (ثبت و جست‌وجوی مطالب استخراج‌شده — extracted_items) */}
      {subView === 'extracted' && (
        <div className="space-y-4">
          {/* راهنمای مفهومی مطالب استخراج‌شده */}
          <div className="bg-[#f0f7ff] border border-[#bcd7f5] rounded-2xl p-4 text-xs space-y-1.5">
            <div className="font-bold text-[#1f4e79] flex items-center gap-1.5 text-sm">
              <FileText className="w-4 h-4 shrink-0" />
              <span>مفهوم و کارکرد شیت «مطالب استخراج‌شده» (پژوهش عمقی و ارجاع صفحه):</span>
            </div>
            <p className="text-slate-700 leading-relaxed">
              این بخش شامل گزیده‌های پژوهشی، خاطرات کوتاه، فرازهای وصیت‌نامه و زندگی‌نامه‌های مستند با ذکر شماره صفحات کتاب‌ها است (مانند کتاب <em>چند قدم تا وصال</em>، صفحه ۱۱۲).
              رکوردهای تأییدشده در این بخش پس از بررسی کارشناس، مستقیماً وارد بسته انتشار وب‌سایت رسمی گلزار (golzarteh.ir) می‌شوند.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="جست‌وجو در مطالب استخراج‌شده (نام شهید، عنوان کتاب، متن خاطره/وصیت‌نامه، شماره صفحه یا EX-0001)..."
                  className="w-full min-h-[44px] pr-10 pl-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-[#1f4e79]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={contentTypeFilter}
                  onChange={(e) => setContentTypeFilter(e.target.value)}
                  className="min-h-[42px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800"
                >
                  <option value="all">همه انواع مطلب ({toPersianDigits(extractedItems.length)})</option>
                  <option value="زندگی‌نامه">زندگی‌نامه</option>
                  <option value="خاطره">خاطره</option>
                  <option value="وصیت‌نامه">وصیت‌نامه</option>
                  <option value="سند و دست‌نوشته">سند و دست‌نوشته</option>
                  <option value="تحلیل و پژوهش">تحلیل و پژوهش</option>
                  <option value="اشاره کوتاه / فهرست">اشاره کوتاه / فهرست</option>
                  <option value="سایر">سایر</option>
                </select>

                <button
                  type="button"
                  onClick={exportExtractedExcel}
                  className="min-h-[42px] px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>خروجی اکسل مطالب (.xlsx)</span>
                </button>

                <button
                  type="button"
                  onClick={exportExtractedCsv}
                  className="min-h-[42px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>خروجی CSV</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAddExtracted((prev) => !prev)}
                  className="min-h-[42px] px-4 py-2 bg-[#1f4e79] hover:bg-[#163a5b] text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>{showAddExtracted ? 'بستن فرم ثبت مطلب' : 'ثبت مطلب استخراج‌شده جدید'}</span>
                </button>
              </div>
            </div>

            {/* نوار فیلتر وضعیت بازبینی مطالب */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs border-t border-slate-100">
              <span className="text-slate-500 font-medium ml-1">فیلتر وضعیت بازبینی:</span>
              {(
                [
                  { key: 'all', label: `همه مطالب (${toPersianDigits(extractedItems.length)})` },
                  {
                    key: 'بررسی‌شده در پژوهش اصلی',
                    label: `بررسی‌شده در پژوهش اصلی (${toPersianDigits(
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
                    label: `ردشده با دلیل (${toPersianDigits(
                      extractedItems.filter((i) => i.reviewStatus.includes('رد')).length
                    )})`
                  }
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setExtractedStatusFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-colors ${
                    extractedStatusFilter === tab.key
                      ? 'bg-[#1f4e79] text-white shadow-xs'
                      : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {showAddExtracted && (
            <form
              onSubmit={handleCreateExtractedItem}
              className="bg-white border-2 border-[#1f4e79] rounded-2xl p-4 sm:p-5 space-y-4 text-xs"
            >
              <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                <h3 className="text-sm font-bold text-slate-900">
                  ثبت مطلب استخراج‌شده از کتاب و ارجاع صفحه (جدول extracted_items در طرح اجرایی)
                </h3>
                <span className="text-[11px] text-slate-500">
                  قاعده D-08: عبارت خام صفحه (مانند 173تا184) بدون تغییر حفظ می‌شود
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">
                    کتاب مرجع (از میان ۹۸۰ کتاب فهرست) *
                  </label>
                  <select
                    value={exBookId}
                    onChange={(e) => setExBookId(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-300 rounded-xl"
                  >
                    {catalogRows.slice(0, 350).map((b) => (
                      <option key={b.tempBookId} value={b.tempBookId}>
                        {b.tempBookId} — {b.titleRaw} ({b.publisherRaw || 'بدون ناشر'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    نوع مطلب (content_type) *
                  </label>
                  <select
                    value={exContentType}
                    onChange={(e) => setExContentType(e.target.value as ExtractedContentType)}
                    className="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900"
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
                  <label className="block font-bold text-slate-700 mb-1">
                    نام شهید یا عبارت گروهی مرتبط *
                  </label>
                  <input
                    type="text"
                    required
                    value={exMartyrName}
                    onChange={(e) => setExMartyrName(e.target.value)}
                    placeholder="مثال: احمد بیابانی یا محمد ابراهیم همت"
                    className="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    قطعه مزار (در صورت وجود)
                  </label>
                  <input
                    type="text"
                    value={exGravePiece}
                    onChange={(e) => setExGravePiece(e.target.value)}
                    placeholder="مثال: 26 یا غ تهرانی"
                    className="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-300 rounded-xl tabular-nums"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    ارجاع صفحه خام (page_reference_raw) *
                  </label>
                  <input
                    type="text"
                    required
                    value={exPageRefRaw}
                    onChange={(e) => setExPageRefRaw(e.target.value)}
                    placeholder="مثال: 173تا184 یا ص 42"
                    className="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-300 rounded-xl tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">
                    عنوان بخش / سرفصل مطلب استخراج‌شده *
                  </label>
                  <input
                    type="text"
                    required
                    value={exPassageTitle}
                    onChange={(e) => setExPassageTitle(e.target.value)}
                    placeholder="مثال: روایت همرزمان از عملیات خیبر و آخرین وداع"
                    className="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-300 rounded-xl"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">صفحه شروع (عدد)</label>
                    <input
                      type="text"
                      value={exPageStart}
                      onChange={(e) => setExPageStart(e.target.value)}
                      placeholder="173"
                      className="w-full min-h-[42px] px-2.5 py-2 bg-white border border-slate-300 rounded-xl tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">صفحه پایان (عدد)</label>
                    <input
                      type="text"
                      value={exPageEnd}
                      onChange={(e) => setExPageEnd(e.target.value)}
                      placeholder="184"
                      className="w-full min-h-[42px] px-2.5 py-2 bg-white border border-slate-300 rounded-xl tabular-nums"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  متن گزیده یا خلاصه پژوهشی مطلب استخراج‌شده *
                </label>
                <textarea
                  rows={3}
                  required
                  value={exExtractedText}
                  onChange={(e) => setExExtractedText(e.target.value)}
                  placeholder="متن دقیق یا خلاصه پژوهشی مستند به صفحات کتاب را وارد کنید..."
                  className="w-full p-3 bg-white border border-slate-300 rounded-xl text-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-600 mb-1">
                    نقل‌قول کوتاه مستند (در صورت مجاز بودن طبق حق نشر)
                  </label>
                  <input
                    type="text"
                    value={exShortQuote}
                    onChange={(e) => setExShortQuote(e.target.value)}
                    placeholder="جمله کوتاه مستند با ذکر صفحه (بدون کپی متن کامل کتاب)..."
                    className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-600 mb-1">
                    کلیدواژه‌ها (جداشده با ویرگول)
                  </label>
                  <input
                    type="text"
                    value={exKeywordsText}
                    onChange={(e) => setExKeywordsText(e.target.value)}
                    placeholder="مثال: لشکر ۲۷، عملیات خیبر، وصیت‌نامه"
                    className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-600 mb-1">
                    یادداشت کارشناسی / استنادی خصوصی (در بسته سایت منتشر نمی‌شود)
                  </label>
                  <input
                    type="text"
                    value={exResearcherNote}
                    onChange={(e) => setExResearcherNote(e.target.value)}
                    placeholder="توضیح درباره تطبیق مزار یا وضعیت نسخه..."
                    className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-600 mb-1">
                    نام پژوهشگر ثبت‌کننده
                  </label>
                  <input
                    type="text"
                    value={exRecordedBy}
                    onChange={(e) => setExRecordedBy(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddExtracted(false)}
                  className="min-h-[42px] px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-semibold"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="min-h-[42px] px-5 py-2 bg-[#1f4e79] hover:bg-[#163a5b] text-white rounded-xl font-bold"
                >
                  ذخیره مطلب استخراج‌شده
                </button>
              </div>
            </form>
          )}

          {/* Extracted Content Items List */}
          <div className="space-y-3">
            {filteredExtractedItems.slice(0, visibleLimit).map((item) => (
              <div
                key={item.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-slate-100 pb-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-[#1f4e79]" dir="ltr">
                      {item.id}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-mono font-semibold text-slate-700" dir="ltr">
                      {item.tempBookId}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-bold text-slate-800">{item.contentType}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500">
                      منشأ: {item.sourceFile} / شیت «{item.sourceSheet}» / ردیف {toPersianDigits(item.sourceRow)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* دکمه‌های اقدام سریع کارشناسی */}
                    {item.reviewStatus !== 'تأییدشده کارشناسی' && (
                      <button
                        type="button"
                        onClick={() => {
                          onUpdateExtractedItemStatus(
                            item.id,
                            'تأییدشده کارشناسی',
                            'کارشناس بازبین',
                            item.researcherNote
                          );
                          onNotify(`مطلب ${item.id} با موفقیت تأیید شد و آماده انتشار گردید.`);
                        }}
                        className="min-h-[30px] px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
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
                        className="min-h-[30px] px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>رد با ذکر دلیل</span>
                      </button>
                    )}

                    <select
                      value={item.reviewStatus}
                      onChange={(e) =>
                        onUpdateExtractedItemStatus(
                          item.id,
                          e.target.value as ExtractedReviewStatus,
                          item.reviewedBy || 'بازبین مرکز اسناد',
                          item.researcherNote
                        )
                      }
                      className={`px-2.5 py-1 rounded-lg border text-xs font-bold ${
                        item.reviewStatus === 'تأییدشده کارشناسی' || item.reviewStatus === 'بررسی‌شده در پژوهش اصلی'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          : item.reviewStatus === 'نیازمند بررسی'
                          ? 'bg-amber-50 border-amber-300 text-amber-800'
                          : item.reviewStatus.includes('رد')
                          ? 'bg-red-50 border-red-300 text-red-800'
                          : 'bg-slate-50 border-slate-300 text-slate-700'
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

                {/* فرم بازشونده ثبت دلیل رد */}
                {rejectingExtractedId === item.id && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs space-y-2">
                    <div className="font-bold text-red-900 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-red-600" />
                      <span>ثبت دلیل رد برای مطلب {item.id}:</span>
                    </div>
                    <input
                      type="text"
                      value={extractedRejectReason}
                      onChange={(e) => setExtractedRejectReason(e.target.value)}
                      placeholder="علت رد (مثلاً: عدم تطبیق صفحه با متن، تشابه اسمی اشتباه، نقض حق نشر)..."
                      className="w-full min-h-[38px] px-3 py-1.5 bg-white border border-red-300 rounded-lg text-slate-900"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setRejectingExtractedId(null)}
                        className="px-3 py-1 text-slate-600 hover:text-slate-900"
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
                          onUpdateExtractedItemStatus(
                            item.id,
                            'ردشده با دلیل',
                            'کارشناس بازبین',
                            `دلیل رد: ${extractedRejectReason.trim()}`
                          );
                          setRejectingExtractedId(null);
                          onNotify(`مطلب ${item.id} با ثبت دلیل رد شد.`);
                        }}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg"
                      >
                        ثبت قطعی رد مطلب
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                  <div className="md:col-span-9 space-y-1.5">
                    <div className="text-xs text-slate-600">
                      کتاب: <strong className="text-slate-900">{item.bookTitleRaw}</strong>
                      {item.publisherRaw && ` · ناشر: ${item.publisherRaw}`}
                      {' · '}
                      شهید / موضوع: <strong className="text-[#1f4e79]">{item.martyrNameRaw}</strong>
                      {item.gravePieceRaw && ` (قطعه ${toPersianDigits(item.gravePieceRaw)})`}
                    </div>

                    <h4 className="text-sm sm:text-base font-bold text-slate-900">
                      {item.passageTitle}
                    </h4>

                    <p className="text-xs sm:text-sm text-slate-700 leading-relaxed bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                      {item.extractedText}
                    </p>

                    {item.researcherNote && (
                      <div
                        className={`text-xs p-2 rounded-lg ${
                          item.reviewStatus.includes('رد')
                            ? 'bg-red-50 text-red-800 border border-red-200'
                            : 'text-[#1f4e79]'
                        }`}
                      >
                        <strong>{item.reviewStatus.includes('رد') ? 'علت رد کارشناسی: ' : 'یادداشت کارشناسی: '}</strong>
                        {item.researcherNote}
                      </div>
                    )}
                  </div>

                  <div className="md:col-span-3 bg-[#edf4fa] border border-[#c9dced] rounded-xl p-3 text-xs space-y-1.5">
                    <div>
                      <span className="text-slate-600 block">ارجاع صفحه خام (منبع):</span>
                      <strong className="text-sm font-bold text-[#162b3b] tabular-nums block mt-0.5">
                        {toPersianDigits(item.pageReferenceRaw)}
                      </strong>
                    </div>
                    {(item.pageStartNormalized || item.pageEndNormalized) && (
                      <div className="text-[11px] text-slate-600 tabular-nums border-t border-[#c9dced] pt-1">
                        بازه صفحه نرمال‌شده: از {toPersianDigits(item.pageStartNormalized || '—')} تا{' '}
                        {toPersianDigits(item.pageEndNormalized || '—')}
                      </div>
                    )}
                    <div className="text-[11px] text-slate-500 border-t border-[#c9dced] pt-1">
                      ثبت‌کننده: {item.recordedBy} · تاریخ: {item.updatedAt}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {filteredExtractedItems.length > visibleLimit && (
              <button
                type="button"
                onClick={() => setVisibleLimit((prev) => prev + 100)}
                className="w-full min-h-[44px] py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-bold rounded-xl"
              >
                نمایش ۱۰۰ مطلب بعدی (از مجموع {toPersianDigits(filteredExtractedItems.length)} مطلب استخراج‌شده)
              </button>
            )}
          </div>
        </div>
      )}

      {/* SubView 2: Sheet 4 — 567 Pending Review Items (موارد نیازمند بررسی PV-0001..PV-0567) */}
      {subView === 'pending567' && (
        <div className="space-y-4">
          {/* راهنمای فرآیند بررسی و تکمیل */}
          <div className="bg-[#fff8ea] border border-[#f5dfad] rounded-2xl p-4 text-xs space-y-1.5">
            <div className="font-bold text-[#8c5208] flex items-center gap-1.5 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>میز تخصصی رفع اشکال و تکمیل موارد نیازمند بررسی (۵۶۷ سطر شیت ۴):</span>
            </div>
            <p className="text-slate-700 leading-relaxed">
              این موارد در ورود اولیه اطلاعات دارای نواقصی مانند عدم ثبت صفحه، نامشخص بودن قطعه مزار یا عبارات چندشهیدی بوده‌اند. با زدن دکمه <strong>«بررسی، تکمیل و ثبت اطلاعات»</strong>، اطلاعات مستند را وارد نموده و با ذخیره، این مورد به وضعیت «بررسی‌شده» منتقل شده و در صورت تأیید، مستقیماً به بخش پیوندهای معتبر «ارتباط کتاب و شهید» اضافه می‌شود.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setVisibleLimit(60);
                  }}
                  placeholder="جست‌وجو در ۵۶۷ مورد نیازمند بررسی (کد PV-0001، عنوان کتاب، نام شهید، موضوع بررسی)..."
                  className="w-full min-h-[44px] pr-10 pl-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-[#1f4e79]"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={exportPendingReviewsExcel}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>گزارش اکسل موارد بلاتکلیف (.xlsx)</span>
                </button>

                <button
                  type="button"
                  onClick={exportPendingReviewsCsv}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>خروجی CSV</span>
                </button>
              </div>
            </div>

            {/* نوار فیلتر وضعیت پیگیری */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs border-t border-slate-100">
              <span className="text-slate-500 font-medium ml-1">فیلتر وضعیت:</span>
              {(
                [
                  {
                    key: 'open',
                    label: `در انتظار بررسی (باز) (${toPersianDigits(
                      pendingReviews.filter((p) => p.trackingStatus === 'باز').length
                    )})`
                  },
                  {
                    key: 'reviewed',
                    label: `تکمیل و بررسی‌شده (${toPersianDigits(
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
                    label: `همه موارد (${toPersianDigits(pendingReviews.length)})`
                  }
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setPendingStatusFilter(tab.key);
                    setVisibleLimit(60);
                  }}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-colors ${
                    pendingStatusFilter === tab.key
                      ? 'bg-[#1f4e79] text-white shadow-xs'
                      : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* فرم مودال بررسی و تکمیل اطلاعات رکورد انتخابی */}
          {activeReviewPv && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
              <div className="bg-white rounded-2xl shadow-2xl border-2 border-[#1f4e79] w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden text-xs my-auto animate-in fade-in duration-200">
                <div className="bg-[#1f4e79] text-white p-4 flex items-center justify-between shrink-0">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <span>بررسی، رفع اشکال و تکمیل اطلاعات</span>
                      <span className="font-mono bg-white/20 px-2 py-0.5 rounded text-xs" dir="ltr">
                        {activeReviewPv.trackingId}
                      </span>
                    </h3>
                    <p className="text-[11px] text-blue-100">
                      شیت مبدأ: {activeReviewPv.mainSheet} · رکورد مرجع: {activeReviewPv.mainRecordId}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveReviewPv(null)}
                    className="p-1 hover:bg-white/20 rounded-lg text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSavePvReview} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
                  {/* اطلاعات شناسنامه‌ای منبع */}
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

                  {/* فیلدهای تکمیل اطلاعات */}
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
                          placeholder="مثال: 26"
                          className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">ردیف مزار</label>
                        <input
                          type="text"
                          value={pvGraveRow}
                          onChange={(e) => setPvGraveRow(e.target.value)}
                          placeholder="مثال: 12"
                          className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">شماره قبر</label>
                        <input
                          type="text"
                          value={pvGraveNumber}
                          onChange={(e) => setPvGraveNumber(e.target.value)}
                          placeholder="مثال: 5"
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
                      className="min-h-[42px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                    >
                      انصراف
                    </button>
                    <button
                      type="submit"
                      className="min-h-[42px] px-5 py-2 bg-[#1f4e79] hover:bg-[#163a5b] text-white rounded-xl font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>ثبت نهایی و ذخیره در پرونده</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* لیست رکوردهای ۵۶۷ مورد */}
          <div className="space-y-2.5">
            {filteredPendingReviews.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <p className="font-bold text-slate-800">هیچ موردی با فیلتر انتخابی یافت نشد.</p>
                <p className="text-xs">
                  {pendingStatusFilter === 'open'
                    ? 'همه موارد در این بخش بررسی و تکمیل شده‌اند یا با فیلتر دیگری در دسترس‌اند.'
                    : 'برای مشاهده سایر رکوردها، فیلتر وضعیت را تغییر دهید.'}
                </p>
              </div>
            ) : (
              filteredPendingReviews.slice(0, visibleLimit).map((pv) => (
                <div
                  key={pv.trackingId}
                  className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs hover:border-slate-300 transition-colors"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-slate-500">
                      <span className="font-mono font-bold text-[#1f4e79]" dir="ltr">
                        {pv.trackingId}
                      </span>
                      <span>·</span>
                      <span>شیت اصلی: {pv.mainSheet}</span>
                      <span>·</span>
                      <span className="font-mono font-semibold text-slate-700" dir="ltr">
                        رکورد: {pv.mainRecordId}
                      </span>
                      <span className="mr-auto">
                        <span
                          className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                            pv.trackingStatus === 'بررسی‌شده'
                              ? 'bg-emerald-100 text-emerald-800'
                              : pv.trackingStatus === 'نیازمند منبع'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          وضعیت: {pv.trackingStatus}
                        </span>
                      </span>
                    </div>

                    <div className="text-sm font-bold text-slate-900">
                      {pv.bookTitle} <span className="font-normal text-slate-600">({pv.publisher})</span>
                      {pv.nameOrPhrase && (
                        <span className="text-[#1f4e79] mr-2">— {pv.nameOrPhrase}</span>
                      )}
                    </div>

                    <div className="text-amber-900 font-medium">
                      موضوع بررسی: {pv.issueSubject}
                    </div>
                    <div className="text-slate-600">
                      اقدام پیشنهادی: {pv.suggestedAction}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenPvReview(pv)}
                      className="min-h-[40px] px-3.5 py-1.5 bg-[#1f4e79] hover:bg-[#163a5b] text-white rounded-xl font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <span>بررسی و تکمیل اطلاعات ✍️</span>
                    </button>

                    <select
                      value={pv.trackingStatus}
                      onChange={(e) => {
                        onUpdatePendingReviewStatus(pv.trackingId, e.target.value);
                        onNotify(`وضعیت مورد ${pv.trackingId} به «${e.target.value}» تغییر یافت.`);
                      }}
                      className={`min-h-[40px] px-3 py-1.5 rounded-xl border font-bold text-xs ${
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

            {filteredPendingReviews.length > visibleLimit && (
              <button
                type="button"
                onClick={() => setVisibleLimit((prev) => prev + 100)}
                className="w-full min-h-[44px] py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-bold rounded-xl"
              >
                نمایش ۱۰۰ مورد بعدی (از مجموع {toPersianDigits(filteredPendingReviews.length)} مورد)
              </button>
            )}
          </div>
        </div>
      )}


      {/* SubView 4: 16 Multi-Martyr Groups Human Review Sheet (G001..G016) */}
      {subView === 'groups16' && (
        <div className="space-y-4">
          {/* راهنمای مفهومی ۱۶ گروه چندشهیدی */}
          <div className="bg-[#fff9f0] border border-[#f5dfad] rounded-2xl p-4 text-xs space-y-1.5">
            <div className="font-bold text-[#8c5208] flex items-center gap-1.5 text-sm">
              <ClipboardCheck className="w-4 h-4 shrink-0" />
              <span>مفهوم و کارکرد ۱۶ گروه چندشهیدی (شیت ۳ اکسل مرجع):</span>
            </div>
            <p className="text-slate-700 leading-relaxed">
              در شیت «چند شهید» اکسل اولیه، <strong>۱۶ عنوان کتاب شاخص</strong> (مانند <em>مدافعان حرم</em>، <em>یادگاران</em>، <em>دیدار در فکه</em>) قرار دارند که هر کدام به‌جای یک شهید، اسامی چندین شهید را به‌صورت پیاپی در بر گرفته‌اند (مجموعاً ۱۹۸ ردیف داده شهید).
              کارشناس در این بخش مشخص می‌کند: آیا تمام شهدای این گروه واقعاً متعلق به همین کتاب هستند؟ آیا مرز شروع و پایان کتاب در اکسل درست تفکیک شده؟ با ثبت تصمیم نهایی، این رکورد به وضعیت تأیید یا پیگیری در سامانه به‌روزرسانی می‌شود.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* نوار فیلتر ۱۶ گروه */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-medium ml-1">فیلتر بازبینی گروه‌ها:</span>
              {(
                [
                  { key: 'all', label: `همه (۱۶ گروه)` },
                  {
                    key: 'pending',
                    label: `در انتظار بازبینی (${toPersianDigits(
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
                    label: `نیازمند پیگیری / رد (${toPersianDigits(
                      multiMartyrGroups.filter((g) => g.decisionStatus === 'رد' || g.decisionStatus === 'نیازمند پیگیری').length
                    )})`
                  }
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setGroupsStatusFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-colors ${
                    groupsStatusFilter === tab.key
                      ? 'bg-[#1f4e79] text-white shadow-xs'
                      : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleBulkApproveAndArchive16Groups}
                className="min-h-[42px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-sm transition-all"
                title="تأیید همه ۱۶ گروه و انتقال به پیوندها و پنهان‌سازی این پنجره"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>تأیید یکپارچه ۱۶ گروه و بایگانی این برگه</span>
              </button>

              <button
                type="button"
                onClick={exportGroupsExcel}
                className="min-h-[42px] px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>خروجی اکسل ۱۶ گروه (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={exportGroupsCsv}
                className="min-h-[42px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>خروجی CSV</span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {filteredMultiMartyrGroups.map((grp) => {
              const isEditing = editingGroupCode === grp.groupCode;
              return (
                <div
                  key={grp.groupCode}
                  className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 hover:border-slate-300 transition-colors"
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
                        <h4 className="font-bold text-sm sm:text-base text-slate-900">
                          {grp.registeredTitle}
                        </h4>
                        <p className="text-xs text-slate-500">
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
                        onClick={() =>
                          setEditingGroupCode(isEditing ? null : grp.groupCode)
                        }
                        className="min-h-[38px] px-3.5 py-1.5 text-xs font-bold border border-[#1f4e79] text-[#1f4e79] rounded-xl hover:bg-blue-50 cursor-pointer"
                      >
                        {isEditing ? 'بستن فرم بازبینی' : 'ثبت نظر بازبین ✍️'}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 pt-1">
                    <span>
                      ردیف‌های دارای مکان ناقص:{' '}
                      <strong
                        className={
                          grp.incompleteGraveRows !== 'ندارد'
                            ? 'text-amber-800'
                            : 'text-slate-800'
                        }
                      >
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
                        <label className="block font-semibold text-slate-700 mb-1">
                          نام بازبین:
                        </label>
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
                            setEditingGroupCode(null);
                            onNotify(`تصمیم کارشناس برای گروه ${grp.groupCode} با موفقیت در سامانه ثبت شد.`);
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

      {/* SubView 5: Website Publication Gateway for https://golzarteh.ir (Section 15) */}
      {subView === 'publish_gateway' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-[#253247]">
                  دروازه انتشار کنترل‌شده برای وب‌سایت رسمی گلزار شهدای تهران (golzarteh.ir)
                </h3>
                <p className="text-xs text-[#697586] mt-1">
                  فقط اطلاعاتی که بررسی، تأیید کارشناسی و مجاز شناخته شده‌اند وارد بسته انتشار می‌شوند؛ یادداشت‌های خصوصی پژوهشگران و رکوردهای تأییدنشده به‌طور خودکار فیلتر می‌شوند.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const approvedExtracts = extractedItems.filter(
                    (it) => it.reviewStatus === 'تأییدشده کارشناسی'
                  );
                  const approvedLinks = links.filter((l) => l.reviewStatus.includes('تأیید'));
                  const payload = {
                    schema_version: 'golzarteh-publish-package-v1.0',
                    target_website: 'https://golzarteh.ir',
                    generated_at: new Date().toISOString(),
                    security_policy:
                      'NO_DIRECT_LIVE_MUTATION_WITHOUT_ADMIN_TOKEN — PRIVATE_NOTES_STRIPPED',
                    external_id_prefix: externalIdPrefix,
                    approved_book_martyr_links_count: approvedLinks.length,
                    approved_extracted_passages_count: approvedExtracts.length,
                    publishable_passages: approvedExtracts.map((it, idx) => ({
                      public_record_id: `${externalIdPrefix}PUB-${String(idx + 1).padStart(4, '0')}`,
                      martyr_name: it.martyrNameRaw,
                      grave_piece: it.gravePieceRaw,
                      book_id: it.tempBookId,
                      book_title: it.bookTitleRaw,
                      publisher: it.publisherRaw,
                      content_type: it.contentType,
                      passage_title: it.passageTitle,
                      research_summary: it.extractedText,
                      short_verified_quote: it.shortVerifiedQuote || null,
                      page_reference: it.pageReferenceRaw,
                      approved_by: it.reviewedBy || 'کارشناس مسئول مرکز اسناد'
                    })),
                    publishable_book_links: approvedLinks.map((l) => ({
                      link_id: l.id,
                      martyr_name: l.martyrNameRaw,
                      grave_address: {
                        piece: l.gravePieceRaw,
                        row: l.graveRowRaw,
                        number: l.graveNumberRaw
                      },
                      book_id: l.tempBookId,
                      book_title: l.bookTitleRaw,
                      publisher: l.publisherRaw,
                      page_reference: l.pageReferenceRaw
                    }))
                  };
                  const blob = new Blob([JSON.stringify(payload, null, 2)], {
                    type: 'application/json;charset=utf-8'
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `golzarteh-approved-publish-package-${new Date()
                    .toISOString()
                    .slice(0, 10)}.json`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  setTimeout(() => URL.revokeObjectURL(url), 1500);
                  onNotify(
                    'بسته اطلاعاتی تأییدشده و مجاز (بدون یادداشت‌های خصوصی) برای وب‌سایت golzarteh.ir آماده و دانلود شد.'
                  );
                }}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#2E7D5B] hover:bg-[#246348] text-white text-xs font-bold flex items-center gap-2 shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>دریافت بسته انتشار JSON تأییدشده</span>
              </button>
            </div>

            {/* 6-Step Exchange Pipeline Visualization */}
            <div className="bg-[#F5F7FA] border border-slate-200 rounded-xl p-3.5">
              <div className="text-xs font-bold text-[#1F4E79] mb-2">
                معماری تبادل اطلاعات مرکز اسناد با وب‌سایت رسمی گلزار تهران:
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-xs">
                {[
                  '۱. مرکز اسناد',
                  '۲. ثبت و تکمیل اطلاعات',
                  '۳. بررسی و تأیید کارشناسی',
                  '۴. دروازه انتشار',
                  '۵. بسته قابل انتشار',
                  '۶. وب‌سایت golzarteh.ir'
                ].map((step, idx) => (
                  <div
                    key={idx}
                    className="bg-white border border-slate-200 rounded-lg py-2 px-2 font-bold text-[#253247]"
                  >
                    {step}
                  </div>
                ))}
              </div>
            </div>

            {/* External Martyr ID Configuration & Filtering Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="bg-[#F5F7FA] border border-slate-200 rounded-xl p-3 space-y-1.5">
                <label className="block font-bold text-[#253247]">
                  پیشوند شناسه تبادل با سامانه سایت گلزار:
                </label>
                <input
                  type="text"
                  value={externalIdPrefix}
                  onChange={(e) => setExternalIdPrefix(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-mono"
                  dir="ltr"
                />
                <p className="text-[11px] text-[#697586]">
                  قابل تنظیم پس از هماهنگی با مسئول فنی سایت golzarteh.ir
                </p>
              </div>

              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 space-y-1">
                <div className="font-bold text-[#2E7D5B]">رکوردهای مجاز آماده در بسته انتشار:</div>
                <div className="text-sm font-bold text-[#253247] tabular-nums">
                  {toPersianDigits(
                    extractedItems.filter((i) => i.reviewStatus === 'تأییدشده کارشناسی').length
                  )}{' '}
                  خلاصه پژوهشی تأییدشده ·{' '}
                  {toPersianDigits(links.filter((l) => l.reviewStatus.includes('تأیید')).length)}{' '}
                  ارتباط کتاب–شهید تأییدشده
                </div>
                <div className="text-[11px] text-[#697586]">
                  فیلدهای یادداشت داخلی (`researcherNote`) و رکوردهای خام به‌طور کامل حذف شده‌اند.
                </div>
              </div>

              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 space-y-1">
                <div className="font-bold text-[#C58A2B]">رکوردهای متوقف‌شده پشت دروازه انتشار:</div>
                <div className="text-sm font-bold text-[#253247] tabular-nums">
                  {toPersianDigits(
                    extractedItems.filter((i) => i.reviewStatus !== 'تأییدشده کارشناسی').length
                  )}{' '}
                  مطلب نیازمند بررسی ·{' '}
                  {toPersianDigits(links.filter((l) => !l.reviewStatus.includes('تأیید')).length)}{' '}
                  ارتباط تأییدنشده
                </div>
                <div className="text-[11px] text-[#697586]">
                  هیچ داده تأییدنشده‌ای اجازه عبور از دروازه انتشار را ندارد.
                </div>
              </div>
            </div>

            {/* Live Preview of Approved Publishable Content */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-[#253247]">
                پیش‌نمایش محتوای تأییدشده و مجاز برای انتشار در وب‌سایت گلزار تهران:
              </div>
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden bg-white text-xs">
                {extractedItems
                  .filter((it) => it.reviewStatus === 'تأییدشده کارشناسی')
                  .map((it, idx) => (
                    <div key={it.id} className="p-3.5 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[#697586]">
                        <span className="font-mono font-bold text-[#2E7D5B]" dir="ltr">
                          {externalIdPrefix}PUB-{String(idx + 1).padStart(4, '0')}
                        </span>
                        <span>
                          شهید: <strong className="text-[#253247]">{it.martyrNameRaw}</strong> (قطعه{' '}
                          {toPersianDigits(it.gravePieceRaw || '—')})
                        </span>
                        <span>
                          کتاب: <strong className="text-[#253247]">{it.bookTitleRaw}</strong> · صفحه:{' '}
                          {toPersianDigits(it.pageReferenceRaw)}
                        </span>
                      </div>
                      <div className="font-bold text-[#253247]">
                        [{it.contentType}] {it.passageTitle}
                      </div>
                      <p className="text-[#253247] leading-relaxed">{it.extractedText}</p>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SubView: Master Depository and 2-Way Final Export Hub */}
      {subView === 'depository' && (
        <DepositoryAndExportHub
          catalogRows={catalogRows}
          auditRecords={auditRecords}
          bookCopies={bookCopies}
          links={links}
          pendingReviews={pendingReviews}
          workbookMartyrs={workbookMartyrs}
          extractedItems={extractedItems}
          onNotify={onNotify}
          onJumpToSmartSearch={onJumpToSmartSearch}
        />
      )}
    </div>
  );
};
