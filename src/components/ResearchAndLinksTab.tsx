import React, { useState, useMemo } from 'react';
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
  Sparkles
} from 'lucide-react';
import {
  BookMartyrLinkRecord,
  ExtractedContentItem,
  ExtractedContentType,
  ExtractedReviewStatus,
  MultiMartyrGroupAudit,
  PendingReviewItem,
  ReferenceCatalogRow,
  WorkbookGolzarMartyr,
  normalizePersianText,
  toPersianDigits
} from '../data/markazAsnadData';

interface ResearchAndLinksTabProps {
  catalogRows: ReferenceCatalogRow[];
  links: BookMartyrLinkRecord[];
  pendingReviews: PendingReviewItem[];
  workbookMartyrs: WorkbookGolzarMartyr[];
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
  links,
  pendingReviews,
  workbookMartyrs,
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
    'links' | 'extracted' | 'pending567' | 'shohada196' | 'groups16' | 'publish_gateway'
  >('links');
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

  // Sub-filter & Cross-reference Matcher for 196 Golzar Martyrs
  const [golzarFilter, setGolzarFilter] = useState<'all' | 'with_matched_book' | 'linked' | 'without_book'>('all');
  const [rejectedGolzarBookMatches, setRejectedGolzarBookMatches] = useState<Record<string, string[]>>(() => {
    try {
      const raw = localStorage.getItem('book_golzar_rejected_matches');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const saveGolzarRejection = (martyrId: string, bookId: string) => {
    setRejectedGolzarBookMatches((prev) => {
      const next = { ...prev, [martyrId]: [...(prev[martyrId] || []), bookId] };
      try {
        localStorage.setItem('book_golzar_rejected_matches', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    onNotify(`انطباق کتاب ${bookId} برای این شهید رد شد.`);
  };

  // Cross-reference calculation: Match 196 Golzar martyrs against 980 Reference Books
  const golzarMartyrBookMatches = useMemo(() => {
    const map = new Map<
      string,
      Array<{
        book: ReferenceCatalogRow;
        matchType: 'exact_title' | 'title_contains' | 'desc_contains' | 'existing_link';
        linkId?: string;
      }>
    >();

    const linksByMartyr = new Map<string, BookMartyrLinkRecord[]>();
    links.forEach((l) => {
      const n = normalizePersianText(l.martyrNameRaw || '');
      if (n && n !== '*') {
        const arr = linksByMartyr.get(n) || [];
        arr.push(l);
        linksByMartyr.set(n, arr);
      }
    });

    workbookMartyrs.forEach((sh) => {
      const rawName = sh.fullNameSearch || `${sh.firstNameRaw} ${sh.lastNameRaw}`.trim();
      const norm = normalizePersianText(rawName.replace(/^شهید\s+/, ''));
      if (!norm) {
        map.set(sh.tempPersonId, []);
        return;
      }

      const matches: Array<{
        book: ReferenceCatalogRow;
        matchType: 'exact_title' | 'title_contains' | 'desc_contains' | 'existing_link';
        linkId?: string;
      }> = [];
      const seenBookIds = new Set<string>();

      // 1. Existing links in Sheet 2
      const existing = linksByMartyr.get(norm) || [];
      existing.forEach((l) => {
        const b = catalogRows.find(
          (cr) => cr.tempBookId === l.tempBookId || cr.titleRaw === l.bookTitleRaw
        );
        if (b && !seenBookIds.has(b.tempBookId)) {
          seenBookIds.add(b.tempBookId);
          matches.push({ book: b, matchType: 'existing_link', linkId: l.id });
        }
      });

      // 2. Search in 980 catalogRows
      const tokens = norm.split(' ').filter((t) => t.length > 2);
      catalogRows.forEach((b) => {
        if (seenBookIds.has(b.tempBookId)) return;
        const bTitle = normalizePersianText(b.titleRaw || '');
        const bDesc = normalizePersianText(b.descriptionRaw || '');

        if (bTitle.includes(norm)) {
          seenBookIds.add(b.tempBookId);
          matches.push({ book: b, matchType: 'title_contains' });
        } else if (tokens.length >= 2 && tokens.every((t) => bTitle.includes(t))) {
          seenBookIds.add(b.tempBookId);
          matches.push({ book: b, matchType: 'title_contains' });
        } else if (bDesc.includes(norm)) {
          seenBookIds.add(b.tempBookId);
          matches.push({ book: b, matchType: 'desc_contains' });
        }
      });

      map.set(sh.tempPersonId, matches);
    });

    return map;
  }, [workbookMartyrs, catalogRows, links]);

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

  // Filtered 196 Workbook Martyrs
  const filteredWorkbookMartyrs = useMemo(() => {
    const q = normalizePersianText(searchQuery);
    return workbookMartyrs.filter((sh) => {
      const allMatches = golzarMartyrBookMatches.get(sh.tempPersonId) || [];
      const rejectedList = rejectedGolzarBookMatches[sh.tempPersonId] || [];
      const validMatches = allMatches.filter((m) => !rejectedList.includes(m.book.tempBookId));
      const isLinked = validMatches.some((m) => m.matchType === 'existing_link');

      if (golzarFilter === 'with_matched_book' && validMatches.length === 0) return false;
      if (golzarFilter === 'linked' && !isLinked) return false;
      if (golzarFilter === 'without_book' && validMatches.length > 0) return false;

      if (!q) return true;
      const hay = normalizePersianText(
        `${sh.tempPersonId} ${sh.fullNameSearch} ${sh.piece} ${sh.graveRow} ${sh.graveNumber}`
      );
      return q.split(' ').every((w) => hay.includes(w));
    });
  }, [workbookMartyrs, searchQuery, golzarFilter, golzarMartyrBookMatches, rejectedGolzarBookMatches]);

  const handleCreateLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!martyrName.trim()) {
      onNotify('نام شهید یا عبارت مرتبط ثبت‌شده در منبع را وارد کنید.', 'warning');
      return;
    }

    const bookObj = catalogRows.find((b) => b.tempBookId === selectedBookId);
    const newRecord: BookMartyrLinkRecord = {
      id: `RL-${String(links.length + 1).padStart(4, '0')}`,
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
      id: `EX-${String(extractedItems.length + 1).padStart(4, '0')}`,
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
      ...extractedItems.map((it) =>
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
      ...multiMartyrGroups.map((g) =>
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

  return (
    <div className="space-y-5">
      {/* Sub-navigation Switcher for all 5 Specialist Modules */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex flex-wrap items-center gap-1.5">
              <span>میز تخصصی کارشناسان مرکز اسناد</span>
              <span className="text-xs font-normal text-slate-500">
                (تمام شیت‌های فایل کاری نسخه ۰٫۱ + مطالب استخراج‌شده)
              </span>
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 p-1 bg-slate-100 rounded-xl text-xs">
          <button
            type="button"
            onClick={() => {
              setSubView('links');
              setVisibleLimit(60);
            }}
            className={`min-h-[42px] px-3 py-2 rounded-lg font-bold transition-colors flex items-center justify-center gap-1.5 ${
              subView === 'links'
                ? 'bg-[#1f4e79] text-white'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            <Link2 className="w-4 h-4 shrink-0" />
            <span>ارتباط کتاب و شهید ({toPersianDigits(links.length)} پیوند)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSubView('extracted');
              setVisibleLimit(60);
            }}
            className={`min-h-[42px] px-3 py-2 rounded-lg font-bold transition-colors flex items-center justify-center gap-1.5 ${
              subView === 'extracted'
                ? 'bg-[#1f4e79] text-white'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>مطالب استخراج‌شده ({toPersianDigits(extractedItems.length)})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSubView('pending567');
              setVisibleLimit(60);
            }}
            className={`min-h-[42px] px-3 py-2 rounded-lg font-bold transition-colors flex items-center justify-center gap-1.5 ${
              subView === 'pending567'
                ? 'bg-[#1f4e79] text-white'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>نیازمند بررسی ({toPersianDigits(pendingReviews.length)})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSubView('shohada196');
              setVisibleLimit(60);
            }}
            className={`min-h-[42px] px-3 py-2 rounded-lg font-bold transition-colors flex items-center justify-center gap-1.5 ${
              subView === 'shohada196'
                ? 'bg-[#1f4e79] text-white'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span>شهدای گلزار ({toPersianDigits(workbookMartyrs.length)})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubView('groups16')}
            className={`min-h-[42px] px-3 py-2 rounded-lg font-bold transition-colors flex items-center justify-center gap-1.5 ${
              subView === 'groups16'
                ? 'bg-[#1f4e79] text-white'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            <ClipboardCheck className="w-4 h-4 shrink-0" />
            <span>۱۶ گروه چندشهیدی</span>
          </button>

          <button
            type="button"
            onClick={() => setSubView('publish_gateway')}
            className={`min-h-[42px] px-3 py-2 rounded-lg font-bold transition-colors flex items-center justify-center gap-1.5 ${
              subView === 'publish_gateway'
                ? 'bg-[#2E7D5B] text-white'
                : 'text-[#2E7D5B] hover:bg-emerald-50'
            }`}
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>دروازه انتشار سایت گلزار</span>
          </button>
        </div>
      </div>

      {subView === 'links' && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
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
                        lnk.reviewStatus === 'تأییدشده کارشناسی'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          : lnk.reviewStatus.includes('نیازمند')
                          ? 'bg-amber-50 border-amber-300 text-amber-800'
                          : 'bg-slate-50 border-slate-300 text-slate-700'
                      }`}
                    >
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
                  onClick={exportExtractedCsv}
                  className="min-h-[42px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>خروجی CSV مطالب</span>
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
            {filteredExtractedItems.map((item) => (
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
                        item.reviewStatus === 'تأییدشده کارشناسی'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          : item.reviewStatus === 'نیازمند بررسی'
                          ? 'bg-amber-50 border-amber-300 text-amber-800'
                          : item.reviewStatus.includes('رد')
                          ? 'bg-red-50 border-red-300 text-red-800'
                          : 'bg-slate-50 border-slate-300 text-slate-700'
                      }`}
                    >
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
              <div className="text-xs font-bold text-[#1f4e79] shrink-0">
                تعداد موارد منطبق با فیلتر: {toPersianDigits(filteredPendingReviews.length)} مورد
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

      {/* SubView 3: Sheet 5 — 196 Workbook Golzar Martyrs (شهدای گلزار SH-0001..SH-0196) */}
      {subView === 'shohada196' && (
        <div className="space-y-4">
          {/* راهنمای تطبیق شهدای گلزار با مخزن کتابخانه */}
          <div className="bg-[#f0fbf7] border border-[#b2e5d4] rounded-2xl p-4 text-xs space-y-1.5">
            <div className="font-bold text-[#1a6348] flex items-center gap-1.5 text-sm">
              <Users className="w-4 h-4 shrink-0" />
              <span>میز تطبیق شهدای گلزار (۱۹۶ سطر شیت ۵) با ۹۸۰ عنوان کتاب مرجع:</span>
            </div>
            <p className="text-slate-700 leading-relaxed">
              سامانه به‌صورت خودکار اسامی شهدای گلزار را با عناوین و متون ۹۸۰ کتاب مرجع کتابخانه بررسی می‌کند. در صورت کشف انطباق، کتاب به شما پیشنهاد می‌شود تا بتوانید با یک کلیک پیوند آن را تأیید، رد، یا برای بررسی عمیق‌تر به برگه «جست‌وجوی هوشمند» انتقال دهید.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="جست‌وجو در ۱۹۶ رکورد شیت «شهدای گلزار» (نام شهید، قطعه، ردیف، شماره یا SH-0001)..."
                  className="w-full min-h-[44px] pr-10 pl-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-[#1f4e79]"
                />
              </div>
              <div className="text-xs font-bold text-[#1f4e79] shrink-0">
                نمایش {toPersianDigits(filteredWorkbookMartyrs.length)} رکورد آدرس مزار
              </div>
            </div>

            {/* فیلترهای وضعیت تطبیق کتاب برای شهدای گلزار */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs border-t border-slate-100">
              <span className="text-slate-500 font-medium ml-1">فیلتر تطبیق با مخزن:</span>
              {(
                [
                  { key: 'all', label: `همه (${toPersianDigits(workbookMartyrs.length)} شهید)` },
                  {
                    key: 'with_matched_book',
                    label: `دارای کتاب منطبق در ۹۸۰ عنوان (${toPersianDigits(
                      workbookMartyrs.filter((sh) => {
                        const m = (golzarMartyrBookMatches.get(sh.tempPersonId) || []).filter(
                          (x) => !(rejectedGolzarBookMatches[sh.tempPersonId] || []).includes(x.book.tempBookId)
                        );
                        return m.length > 0;
                      }).length
                    )})`
                  },
                  {
                    key: 'linked',
                    label: `تأییدشده و متصل به کتابخانه (${toPersianDigits(
                      workbookMartyrs.filter((sh) => {
                        const m = (golzarMartyrBookMatches.get(sh.tempPersonId) || []).filter(
                          (x) => !(rejectedGolzarBookMatches[sh.tempPersonId] || []).includes(x.book.tempBookId)
                        );
                        return m.some((x) => x.matchType === 'existing_link');
                      }).length
                    )})`
                  },
                  {
                    key: 'without_book',
                    label: `فاقد کتاب منطبق در مخزن (${toPersianDigits(
                      workbookMartyrs.filter((sh) => {
                        const m = (golzarMartyrBookMatches.get(sh.tempPersonId) || []).filter(
                          (x) => !(rejectedGolzarBookMatches[sh.tempPersonId] || []).includes(x.book.tempBookId)
                        );
                        return m.length === 0;
                      }).length
                    )})`
                  }
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setGolzarFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-colors ${
                    golzarFilter === tab.key
                      ? 'bg-[#1f4e79] text-white shadow-xs'
                      : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredWorkbookMartyrs.map((sh) => {
              const allMatches = golzarMartyrBookMatches.get(sh.tempPersonId) || [];
              const rejectedList = rejectedGolzarBookMatches[sh.tempPersonId] || [];
              const validMatches = allMatches.filter((m) => !rejectedList.includes(m.book.tempBookId));
              const isLinked = validMatches.some((m) => m.matchType === 'existing_link');

              return (
                <div
                  key={sh.tempPersonId}
                  className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3 text-xs hover:border-slate-300 transition-colors flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-slate-500 border-b border-slate-100 pb-2">
                      <span className="font-mono font-bold text-[#1f4e79]" dir="ltr">
                        {sh.tempPersonId}
                      </span>
                      <span>
                        ردیف {toPersianDigits(sh.sourceRow)} شیت «{sh.sourceSheet}»
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <h4 className="text-base font-bold text-slate-900">{sh.fullNameSearch}</h4>
                      {isLinked && (
                        <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>متصل به کتابخانه</span>
                        </span>
                      )}
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-semibold text-slate-800 tabular-nums">
                      قطعه: {toPersianDigits(sh.piece || '—')} · ردیف: {toPersianDigits(sh.graveRow || '—')} · شماره:{' '}
                      {toPersianDigits(sh.graveNumber || '—')}
                      {sh.graveStatus && <span className="text-slate-500 text-[11px] mr-2">({sh.graveStatus})</span>}
                    </div>

                    {/* بخش تطبیق با ۹۸۰ کتاب مرجع */}
                    {validMatches.length > 0 ? (
                      <div className="bg-[#f0f7ff] border border-[#c6def8] rounded-xl p-3 space-y-2">
                        <div className="font-bold text-[#1f4e79] flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>کتاب‌های منطبق در ۹۸۰ عنوان مخزن ({toPersianDigits(validMatches.length)} مورد):</span>
                          </span>
                        </div>

                        <div className="space-y-2">
                          {validMatches.map((match) => (
                            <div
                              key={match.book.tempBookId}
                              className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-1.5"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="font-bold text-slate-900 text-xs">
                                    {match.book.titleRaw}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    کد: <span className="font-mono" dir="ltr">{match.book.tempBookId}</span>
                                    {match.book.publisherRaw && ` · ناشر: ${match.book.publisherRaw}`}
                                  </div>
                                </div>
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                    match.matchType === 'existing_link'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : match.matchType === 'title_contains'
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  {match.matchType === 'existing_link'
                                    ? 'پیوند تأییدشده'
                                    : match.matchType === 'title_contains'
                                    ? 'انطباق در عنوان'
                                    : 'انطباق در شرح'}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center justify-end gap-1.5 pt-1 border-t border-slate-100">
                                {match.matchType !== 'existing_link' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onAddLink({
                                        id: `RL-${String(links.length + 1).padStart(4, '0')}`,
                                        tempBookId: match.book.tempBookId,
                                        bookTitleRaw: match.book.titleRaw,
                                        publisherRaw: match.book.publisherRaw,
                                        martyrNameRaw: sh.fullNameSearch,
                                        isGroupPhrase: false,
                                        gravePieceRaw: sh.piece,
                                        graveRowRaw: sh.graveRow,
                                        graveNumberRaw: sh.graveNumber,
                                        pageReferenceRaw: 'استخراج‌شده از شیت شهدای گلزار',
                                        sourceDescriptionRaw: `تطبیق کارشناسی شهید گلزار (${sh.tempPersonId}) با کتاب ${match.book.tempBookId}`,
                                        sourceFile: sh.sourceFile || 'فهرست کاری کتابخانه',
                                        sourceSheet: sh.sourceSheet || 'شهدای گلزار',
                                        sourceExcelRow: sh.sourceRow || '-',
                                        reviewStatus: 'تأییدشده کارشناسی',
                                        reviewerNote: 'تأیید پیوند شهید گلزار با مخزن کتابخانه'
                                      });
                                      onNotify(
                                        `پیوند شهید «${sh.fullNameSearch}» با کتاب «${match.book.titleRaw}» با موفقیت تأیید و ثبت شد.`
                                      );
                                    }}
                                    className="min-h-[28px] px-2.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>تأیید پیوند با کتاب</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => saveGolzarRejection(sh.tempPersonId, match.book.tempBookId)}
                                  className="min-h-[28px] px-2 py-0.5 bg-slate-100 hover:bg-red-50 hover:text-red-700 text-slate-600 rounded-md text-[11px] font-medium transition-colors"
                                  title="رد این عنوان کتاب برای این شهید"
                                >
                                  رد انطباق
                                </button>

                                {onJumpToSmartSearch && (
                                  <button
                                    type="button"
                                    onClick={() => onJumpToSmartSearch(sh.fullNameSearch)}
                                    className="min-h-[28px] px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-[#1f4e79] rounded-md text-[11px] font-bold inline-flex items-center gap-1"
                                    title="جست‌وجوی پیشرفته مشخصات این کتاب در برگه ۴"
                                  >
                                    <Sparkles className="w-3 h-3" />
                                    <span>بررسی در برگه ۴</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <span className="text-slate-500 text-[11px]">
                          فاقد عنوان منطبق در ۹۸۰ کتاب مخزن (نیازمند استخراج منبع جدید)
                        </span>
                        {onJumpToSmartSearch && (
                          <button
                            type="button"
                            onClick={() => onJumpToSmartSearch(sh.fullNameSearch)}
                            className="min-h-[30px] px-2.5 py-1 bg-white hover:bg-slate-100 text-[#1f4e79] border border-[#c9dced] rounded-lg text-[11px] font-bold inline-flex items-center gap-1 shrink-0"
                          >
                            <Search className="w-3 h-3" />
                            <span>جست‌وجو در برگه ۴</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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

            <button
              type="button"
              onClick={exportGroupsCsv}
              className="min-h-[42px] px-4 py-2 bg-[#1f4e79] hover:bg-[#163a5b] text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>خروجی CSV کاربرگ بازبینی ۱۶ گروه</span>
            </button>
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
    </div>
  );
};
