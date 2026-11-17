import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Download,
  FileSpreadsheet,
  FileJson,
  FileText,
  Search,
  Filter,
  Users,
  BookOpen,
  CheckCircle2,
  Clock,
  Layers,
  ArrowRight,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ShieldCheck,
  Building2,
  BookmarkCheck,
  Plus,
  Pencil,
  Trash2,
  AlertCircle
} from 'lucide-react';
import {
  BookCopyRecord,
  BookMartyrLinkRecord,
  ExtractedContentItem,
  FieldAuditRecord,
  PendingReviewItem,
  ReferenceCatalogRow,
  WorkbookGolzarMartyr,
  matchesPersianSearch,
  normalizePersianText,
  toPersianDigits
} from '../data/markazAsnadData';
import { openStandardExcelExportModal } from '../modules/excel-export';
import { TehranMartyrBadge } from './TehranMartyrBadge';
import { evaluateMartyrTehranStatus } from '../utils/martyrsCrossMatchEngine';

export type DepositoryStatusFilter =
  | 'verified_only'
  | 'researched_main'
  | 'pending_review'
  | 'rejected'
  | 'with_pages_only'
  | 'tehran_only'
  | 'all';

interface DepositoryAndExportHubProps {
  catalogRows: ReferenceCatalogRow[];
  auditRecords?: Record<string, FieldAuditRecord>;
  bookCopies?: BookCopyRecord[];
  links: BookMartyrLinkRecord[];
  pendingReviews: PendingReviewItem[];
  workbookMartyrs?: WorkbookGolzarMartyr[];
  extractedItems: ExtractedContentItem[];
  pendingReviewsOpenCount?: number;
  openGroupsCount?: number;
  onOpenAddLink?: () => void;
  onOpenReviewQueues?: (target?: 'pending567' | 'groups16') => void;
  onExportGhatatExcel?: () => void;
  onExtractPassageFromLink?: (linkId: string) => void;
  onQuickEditLink?: (linkId: string) => void;
  onQuickDeleteLink?: (linkId: string) => void;
  onQuickUpdateLinkStatus?: (linkId: string, nextStatus: string) => void;
  onInspectBook?: (bookId: string, fallbackTitle: string) => void;
  onInspectMartyr?: (martyrName: string, linkId?: string) => void;
  onNotify: (msg: string, type?: 'success' | 'warning') => void;
  onJumpToSmartSearch?: (martyrName: string) => void;
}

export interface ResolvedMartyrExportItem {
  id: string;
  martyrName: string;
  gravePiece: string;
  graveRow: string;
  graveNumber: string;
  bookId: string;
  bookTitle: string;
  publisher: string;
  relationSubject: string;
  pageReference: string;
  reviewStatus: string;
  reviewerNote: string;
  sourceFile: string;
  sourceSheet: string;
  hasExtractedPassage: boolean;
  extractedPassageCount: number;
  isTehranMartyr: boolean;
}

export interface ResolvedBookExportItem {
  bookId: string;
  bookTitle: string;
  author: string;
  publisher: string;
  year: string;
  category: string;
  shelf: string;
  floor: string;
  locationCode: string;
  linkedMartyrsCount: number;
  martyrsListSummary: string;
  pageReferencesSummary: string;
  reviewStatus: string;
  extractedPassagesCount: number;
  hasTehranMartyr: boolean;
}

export const DepositoryAndExportHub: React.FC<DepositoryAndExportHubProps> = ({
  catalogRows,
  auditRecords = {},
  bookCopies = [],
  links,
  pendingReviews,
  workbookMartyrs = [],
  extractedItems,
  pendingReviewsOpenCount = 0,
  openGroupsCount = 0,
  onOpenAddLink,
  onOpenReviewQueues,
  onExportGhatatExcel,
  onExtractPassageFromLink,
  onQuickEditLink,
  onQuickDeleteLink,
  onQuickUpdateLinkStatus,
  onInspectBook,
  onInspectMartyr,
  onNotify,
  onJumpToSmartSearch
}) => {
  const [activeView, setActiveView] = useState<'martyr_centric' | 'book_centric'>('martyr_centric');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<DepositoryStatusFilter>('all');
  const [sourceSheetFilter, setSourceSheetFilter] = useState<'all' | 'ghatat_one' | 'ghatat_multi'>('all');
  const [exportScope, setExportScope] = useState<'filtered' | 'all'>('filtered');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number | 'all'>(20);
  const [isLinksTableOpen, setIsLinksTableOpen] = useState<boolean>(false);

  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState<number>(960);
  const isSyncingScrollRef = useRef<boolean>(false);

  // شمارش پویا (داینامیک) کل کتاب‌های سامانه (فهرست اکسل + ثبت‌های جدید)
  const totalSystemBooksCount = useMemo(() => {
    const outsideCount = Object.values(auditRecords).filter((r) => r.source === 'outside-list').length;
    return catalogRows.length + outsideCount;
  }, [catalogRows.length, auditRecords]);

  // Map of books for fast lookup
  const catalogMap = useMemo(() => {
    const map = new Map<string, ReferenceCatalogRow>();
    catalogRows.forEach((r) => {
      if (r.tempBookId) {
        map.set(r.tempBookId, r);
      }
    });
    return map;
  }, [catalogRows]);

  // نگاشت واقعی اطلاعات ثبت‌شده قفسه و نسخه‌های فیزیکی به ازای هر شناسه کتاب
  const bookAuditAndCopyMap = useMemo(() => {
    const auditByBookId = new Map<string, FieldAuditRecord>();
    Object.values(auditRecords).forEach((rec) => {
      if (rec.tempBookId) {
        auditByBookId.set(rec.tempBookId, rec);
      }
    });
    const copiesByBookId = new Map<string, BookCopyRecord[]>();
    bookCopies.forEach((cp) => {
      if (cp.bookId) {
        const list = copiesByBookId.get(cp.bookId) || [];
        list.push(cp);
        copiesByBookId.set(cp.bookId, list);
      }
    });
    return { auditByBookId, copiesByBookId };
  }, [auditRecords, bookCopies]);

  // Map of extracted passages count per martyr name and bookId
  const extractedMap = useMemo(() => {
    const map = new Map<string, ExtractedContentItem[]>();
    extractedItems.forEach((it) => {
      const key = `${normalizePersianText(it.martyrNameRaw)}::${it.tempBookId}`;
      const list = map.get(key) || [];
      list.push(it);
      map.set(key, list);
    });
    return map;
  }, [extractedItems]);

  // 1. Consolidated Martyr-centric rows (All resolved / determined links without * or empty + live auditRecords title/publisher)
  const allMartyrRows = useMemo<ResolvedMartyrExportItem[]>(() => {
    const rows: ResolvedMartyrExportItem[] = [];

    links.forEach((l) => {
      if (!l.martyrNameRaw || l.martyrNameRaw === '*' || l.martyrNameRaw.includes('نامشخص')) {
        return;
      }
      const bObj = catalogMap.get(l.tempBookId);
      const auditRec =
        (l.tempBookId ? bookAuditAndCopyMap.auditByBookId.get(l.tempBookId) : undefined) ||
        (bObj ? auditRecords[bObj.rowKey] : undefined);
      const resolvedTitle = auditRec?.title?.trim() || l.bookTitleRaw || bObj?.titleRaw || '—';
      const resolvedPublisher = auditRec?.publisher?.trim() || l.publisherRaw || bObj?.publisherRaw || '—';

      const exKey = `${normalizePersianText(l.martyrNameRaw)}::${l.tempBookId}`;
      const matchedExtracts = extractedMap.get(exKey) || [];
      const tEval = evaluateMartyrTehranStatus({
        martyrName: l.martyrNameRaw,
        gravePiece: l.gravePieceRaw,
        graveRow: l.graveRowRaw,
        graveNumber: l.graveNumberRaw,
        sourceDesc: l.sourceDescriptionRaw,
        reviewerNote: l.reviewerNote
      });

      rows.push({
        id: l.id,
        martyrName: l.martyrNameRaw,
        gravePiece: l.gravePieceRaw || '—',
        graveRow: l.graveRowRaw || '—',
        graveNumber: l.graveNumberRaw || '—',
        bookId: l.tempBookId || 'BK-????',
        bookTitle: resolvedTitle,
        publisher: resolvedPublisher,
        relationSubject:
          l.sourceDescriptionRaw && l.sourceDescriptionRaw !== '-'
            ? l.sourceDescriptionRaw
            : 'شرح زندگینامه و یادکرد شهید در اثر',
        pageReference: l.pageReferenceRaw && l.pageReferenceRaw !== '-' ? l.pageReferenceRaw : 'ثبت در منبع',
        reviewStatus: l.reviewStatus || 'بررسی‌نشده',
        reviewerNote: l.reviewerNote || '',
        sourceFile: l.sourceFile || 'مرکز اسناد',
        sourceSheet: l.sourceSheet || 'ارتباط کتاب و شهید',
        hasExtractedPassage: matchedExtracts.length > 0,
        extractedPassageCount: matchedExtracts.length,
        isTehranMartyr: tEval.isTehran
      });
    });

    return rows;
  }, [links, catalogMap, bookAuditAndCopyMap, auditRecords, extractedMap]);

  // 2. Consolidated Book-centric rows (Books that have determined martyr links)
  const allBookRows = useMemo<ResolvedBookExportItem[]>(() => {
    const bookToMartyrs = new Map<
      string,
      {
        martyrs: { name: string; piece: string; page: string; sourceSheet: string; isTehran: boolean }[];
        verifiedCount: number;
      }
    >();

    allMartyrRows.forEach((m) => {
      if (sourceSheetFilter === 'ghatat_one' && m.sourceSheet !== 'یک شهید') return;
      if (sourceSheetFilter === 'ghatat_multi' && m.sourceSheet !== 'چند شهید') return;

      const entry = bookToMartyrs.get(m.bookId) || { martyrs: [], verifiedCount: 0 };
      entry.martyrs.push({
        name: m.martyrName,
        piece: m.gravePiece,
        page: m.pageReference,
        sourceSheet: m.sourceSheet,
        isTehran: m.isTehranMartyr
      });
      if (m.reviewStatus.includes('تأیید') || m.reviewStatus.includes('پژوهش اصلی')) {
        entry.verifiedCount += 1;
      }
      bookToMartyrs.set(m.bookId, entry);
    });

    const rows: ResolvedBookExportItem[] = [];

    bookToMartyrs.forEach((data, bookId) => {
      const bObj = catalogMap.get(bookId);
      const auditRec =
        bookAuditAndCopyMap.auditByBookId.get(bookId) ||
        (bObj ? auditRecords[bObj.rowKey] : undefined);
      const copies = bookAuditAndCopyMap.copiesByBookId.get(bookId) || [];
      const firstCopy = copies[0];

      const title =
        auditRec?.title ||
        bObj?.titleRaw ||
        (allMartyrRows.find((m) => m.bookId === bookId)?.bookTitle ?? bookId);
      const author = auditRec?.author || bObj?.authorRaw || 'ثبت نشده';
      const publisher = auditRec?.publisher || bObj?.publisherRaw || 'ثبت نشده';
      const year = auditRec?.year || 'ثبت نشده';
      const category = auditRec?.category || bObj?.categoryRaw || 'ثبت نشده';
      const shelf = auditRec?.shelf || firstCopy?.shelf || 'ثبت نشده';
      const floor = auditRec?.level || firstCopy?.level || 'ثبت نشده';
      const locationCode =
        auditRec?.location ||
        firstCopy?.location ||
        (bObj?.locationRaw && bObj.locationRaw.trim() ? bObj.locationRaw.trim() : 'ثبت نشده');

      const martyrsListSummary = data.martyrs
        .map((m) => `${m.name} (ق.${m.piece}${m.page && m.page !== 'ثبت در منبع' ? ` - ${m.page}` : ''})`)
        .join('؛ ');

      const pageReferencesSummary =
        Array.from(
          new Set(data.martyrs.map((m) => m.page).filter((p) => p && p !== 'ثبت در منبع'))
        ).join('، ') || 'ارجاع کلی اثر';

      const relatedPassages = extractedItems.filter((ex) => ex.tempBookId === bookId);

      rows.push({
        bookId,
        bookTitle: title,
        author,
        publisher,
        year,
        category,
        shelf,
        floor,
        locationCode,
        linkedMartyrsCount: data.martyrs.length,
        martyrsListSummary,
        pageReferencesSummary,
        reviewStatus:
          data.verifiedCount === data.martyrs.length
            ? 'تکمیل و تأییدشده کامل'
            : data.verifiedCount > 0
            ? `دارای ${toPersianDigits(data.verifiedCount)} شهید تأییدشده از ${toPersianDigits(
                data.martyrs.length
              )}`
            : 'ثبت‌شده در منبع اکسل',
        extractedPassagesCount: relatedPassages.length,
        hasTehranMartyr: data.martyrs.some((m) => m.isTehran)
      });
    });

    rows.sort((a, b) => b.linkedMartyrsCount - a.linkedMartyrsCount);
    return rows;
  }, [allMartyrRows, sourceSheetFilter, catalogMap, bookAuditAndCopyMap, auditRecords, extractedItems]);

  const classifyMartyrRowStatus = (
    r: ResolvedMartyrExportItem
  ): 'verified' | 'researched_main' | 'pending' | 'rejected' => {
    const st = r.reviewStatus || '';
    if (st.includes('رد')) return 'rejected';
    if (st === 'تأییدشده کارشناسی' || st === 'تأیید') return 'verified';
    if (
      st.includes('تأیید') ||
      r.sourceFile.includes('سوره مهر') ||
      r.sourceSheet.includes('پژوهش')
    ) {
      return 'researched_main';
    }
    return 'pending';
  };

  // Filtered views based on search, status & source sheet
  const filteredMartyrRows = useMemo(() => {
    const hasQ = Boolean(normalizePersianText(searchQuery));
    return allMartyrRows.filter((r) => {
      if (sourceSheetFilter === 'ghatat_one' && r.sourceSheet !== 'یک شهید') return false;
      if (sourceSheetFilter === 'ghatat_multi' && r.sourceSheet !== 'چند شهید') return false;

      const cat = classifyMartyrRowStatus(r);
      if (statusFilter === 'verified_only' && cat !== 'verified' && cat !== 'researched_main') {
        return false;
      }
      if (statusFilter === 'researched_main' && cat !== 'researched_main') return false;
      if (statusFilter === 'pending_review' && cat !== 'pending') return false;
      if (statusFilter === 'rejected' && cat !== 'rejected') return false;
      if (statusFilter === 'tehran_only' && !r.isTehranMartyr) return false;
      if (
        statusFilter === 'with_pages_only' &&
        (r.pageReference === 'ثبت در منبع' || r.pageReference === 'ثبت‌نشده' || !r.pageReference)
      ) {
        return false;
      }

      if (!hasQ) return true;
      return matchesPersianSearch(
        `${r.id} ${r.martyrName} ${r.bookTitle} ${r.bookId} ${r.publisher} ${r.gravePiece} ${r.relationSubject} ${r.pageReference} ${r.sourceSheet}`,
        searchQuery
      );
    });
  }, [allMartyrRows, searchQuery, statusFilter, sourceSheetFilter]);

  const filteredBookRows = useMemo(() => {
    const hasQ = Boolean(normalizePersianText(searchQuery));
    return allBookRows.filter((b) => {
      if (statusFilter === 'tehran_only' && !b.hasTehranMartyr) {
        return false;
      }
      if (
        statusFilter === 'verified_only' &&
        !b.reviewStatus.includes('تأییدشده')
      ) {
        return false;
      }
      if (
        statusFilter === 'pending_review' &&
        b.reviewStatus.includes('تکمیل و تأییدشده کامل')
      ) {
        return false;
      }

      if (!hasQ) return true;
      return matchesPersianSearch(
        `${b.bookId} ${b.bookTitle} ${b.author} ${b.publisher} ${b.category} ${b.locationCode} ${b.martyrsListSummary}`,
        searchQuery
      );
    });
  }, [allBookRows, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const uniqueMartyrNames = new Set(allMartyrRows.map((r) => r.martyrName)).size;
    let expertApprovedCount = 0;
    let mainResearchVerifiedCount = 0;
    let pendingCount = 0;
    let rejectedCount = 0;
    let ghatatOneCount = 0;
    let ghatatMultiCount = 0;

    allMartyrRows.forEach((r) => {
      if (r.sourceSheet === 'یک شهید') ghatatOneCount += 1;
      if (r.sourceSheet === 'چند شهید') ghatatMultiCount += 1;
      const c = classifyMartyrRowStatus(r);
      if (c === 'verified') expertApprovedCount += 1;
      else if (c === 'researched_main') mainResearchVerifiedCount += 1;
      else if (c === 'rejected') rejectedCount += 1;
      else pendingCount += 1;
    });

    const verifiedLinksCount = expertApprovedCount + mainResearchVerifiedCount;
    const booksWithLinksCount = allBookRows.length;
    const approvedExtractsCount = extractedItems.filter((e) => e.reviewStatus === 'تأییدشده کارشناسی').length;

    return {
      uniqueMartyrs: uniqueMartyrNames,
      verifiedLinks: verifiedLinksCount,
      expertApprovedCount,
      mainResearchVerifiedCount,
      pendingLinksCount: pendingCount,
      rejectedLinksCount: rejectedCount,
      totalLinks: allMartyrRows.length,
      ghatatOneCount,
      ghatatMultiCount,
      booksWithLinks: booksWithLinksCount,
      approvedExtracts: approvedExtractsCount
    };
  }, [allMartyrRows, allBookRows, extractedItems]);

  // محاسبه صفحه‌بندی برای نمایش کامل همه شهدا و همه کتاب‌ها بدون محدودیت ۶۰ موردی
  const totalActiveItems = activeView === 'martyr_centric' ? filteredMartyrRows.length : filteredBookRows.length;
  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(totalActiveItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const visibleMartyrRows = useMemo(() => {
    if (pageSize === 'all') return filteredMartyrRows;
    const start = (safePage - 1) * pageSize;
    return filteredMartyrRows.slice(start, start + pageSize);
  }, [filteredMartyrRows, pageSize, safePage]);

  const visibleBookRows = useMemo(() => {
    if (pageSize === 'all') return filteredBookRows;
    const start = (safePage - 1) * pageSize;
    return filteredBookRows.slice(start, start + pageSize);
  }, [filteredBookRows, pageSize, safePage]);

  const startRowNumber = pageSize === 'all' ? 1 : (safePage - 1) * pageSize + 1;

  useEffect(() => {
    const tableEl = tableScrollRef.current;
    if (!tableEl) return;
    const updateWidth = () => {
      setTableScrollWidth(tableEl.scrollWidth);
    };
    updateWidth();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateWidth) : null;
    observer?.observe(tableEl);
    const inner = tableEl.firstElementChild;
    if (inner && observer) observer.observe(inner);
    window.addEventListener('resize', updateWidth);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, [activeView, visibleMartyrRows.length, visibleBookRows.length, pageSize, isLinksTableOpen]);

  const handleSyncHorizontalScroll = (source: 'top' | 'table') => {
    if (isSyncingScrollRef.current) return;
    const topEl = topScrollRef.current;
    const tableEl = tableScrollRef.current;
    if (!topEl || !tableEl) return;
    isSyncingScrollRef.current = true;
    if (source === 'top') {
      tableEl.scrollLeft = topEl.scrollLeft;
    } else {
      topEl.scrollLeft = tableEl.scrollLeft;
    }
    requestAnimationFrame(() => {
      isSyncingScrollRef.current = false;
    });
  };

  // ================= EXPORT ENGINES =================

  const resolveActiveExportLinks = (): BookMartyrLinkRecord[] => {
    const activeRows = exportScope === 'filtered' ? filteredMartyrRows : allMartyrRows;
    const resolvedById = new Map(activeRows.map((r) => [r.id, r]));
    const matched = links
      .filter((l) => resolvedById.has(l.id))
      .map((l) => {
        const res = resolvedById.get(l.id);
        return res
          ? {
              ...l,
              bookTitleRaw: res.bookTitle,
              publisherRaw: res.publisher
            }
          : l;
      });
    return matched.length > 0 ? matched : links;
  };

  const handleExportComprehensiveExcel = () => {
    openStandardExcelExportModal({
      mode: 'depository_comprehensive',
      reportTitle:
        exportScope === 'filtered'
          ? 'گزارش دپوی جامع اسناد، کتاب‌ها و شهدای مرتبط (فیلتر فعال)'
          : 'گزارش دپوی جامع اسناد، کتاب‌ها و شهدای مرتبط (کل مخزن)',
      fileNamePrefix: 'دپوی_جامع_اسناد_کتاب_و_شهید',
      catalogRows,
      auditRecords,
      bookCopies,
      links: resolveActiveExportLinks(),
      extractedItems,
      workbookMartyrs,
      presetId: 'complete_report'
    });
  };

  const handleExportMartyrExcel = () => {
    openStandardExcelExportModal({
      mode: 'martyr_links',
      reportTitle: 'گزارش ارتباط کتاب‌ها بر پایه نام شهید و نشانی مزار',
      fileNamePrefix: 'خروجی_پیوندها_بر_پایه_نام_شهید',
      catalogRows,
      auditRecords,
      bookCopies,
      links: resolveActiveExportLinks(),
      extractedItems,
      workbookMartyrs,
      presetId: 'martyr_dossier'
    });
  };

  const handleExportBookExcel = () => {
    openStandardExcelExportModal({
      mode: 'martyr_links',
      reportTitle: 'گزارش کتاب‌های متصل به شهدا، صفحات و متون استخراج‌شده',
      fileNamePrefix: 'خروجی_پیوندها_بر_پایه_کتاب_ها',
      catalogRows,
      auditRecords,
      bookCopies,
      links: resolveActiveExportLinks(),
      extractedItems,
      workbookMartyrs,
      presetId: 'books_with_martyrs'
    });
  };

  const handleExportJson = () => {
    const payload = {
      generator: 'مرکز اسناد گلزار شهدای تهران - سامانه دپوی اسناد',
      generatedAt: new Date().toISOString(),
      scope: exportScope,
      statistics: stats,
      martyrsWithBooks: exportScope === 'filtered' ? filteredMartyrRows : allMartyrRows,
      booksWithMartyrs: exportScope === 'filtered' ? filteredBookRows : allBookRows
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `دپوی-اسناد-جیسون-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    onNotify('فایل JSON ساختاریافته دوسویه دانلود شد.');
  };

  const handleExportCsv = () => {
    const isMartyr = activeView === 'martyr_centric';
    let headers: string[] = [];
    let linesData: string[][] = [];

    if (isMartyr) {
      headers = [
        'شناسه پیوند',
        'نام شهید',
        'قطعه',
        'ردیف',
        'شماره مزار',
        'کد کتاب',
        'عنوان کتاب',
        'ناشر',
        'موضوع ارتباط',
        'ارجاع صفحه',
        'شیت منبع',
        'وضعیت بررسی'
      ];
      const list = exportScope === 'filtered' ? filteredMartyrRows : allMartyrRows;
      linesData = list.map((m) => [
        m.id,
        m.martyrName,
        m.gravePiece,
        m.graveRow,
        m.graveNumber,
        m.bookId,
        m.bookTitle,
        m.publisher,
        m.relationSubject,
        m.pageReference,
        m.sourceSheet,
        m.reviewStatus
      ]);
    } else {
      headers = [
        'کد کتاب',
        'عنوان کتاب',
        'نویسنده',
        'ناشر',
        'رده موضوعی',
        'قفسه و طبقه',
        'تعداد شهدا',
        'اسامی شهدا و صفحات',
        'وضعیت'
      ];
      const list = exportScope === 'filtered' ? filteredBookRows : allBookRows;
      linesData = list.map((b) => [
        b.bookId,
        b.bookTitle,
        b.author,
        b.publisher,
        b.category,
        b.locationCode,
        String(b.linkedMartyrsCount),
        b.martyrsListSummary,
        b.reviewStatus
      ]);
    }

    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [headers.map(cell).join(','), ...linesData.map((row) => row.map(cell).join(','))];

    const blob = new Blob(['\uFEFF', lines.join('\r\n')], {
      type: 'text/csv;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `خروجی-دپو-${isMartyr ? 'شهدا' : 'کتاب‌ها'}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    onNotify('فایل CSV با انکودینگ UTF-8 BOM دانلود شد.');
  };

  return (
    <div className="space-y-4">
      {/* Main Control & Perspective Switcher Bar */}
      <div className="bg-white border border-[#E2D2BE] rounded-2xl p-3.5 sm:p-4 space-y-3">
        <div className="grid grid-cols-1 2xl:grid-cols-12 items-stretch 2xl:items-center gap-3">
          {/* 2-Way View Switcher Tabs — چیدمان Grid با شکست خودکار ۲ تا ۳ خطی برای جلوگیری کامل از هم‌پوشانی در موبایل و دسکتاپ */}
          <div className="2xl:col-span-7 grid grid-cols-1 sm:grid-cols-2 p-1.5 bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl text-xs font-bold gap-2 w-full min-w-0">
            <button
              type="button"
              onClick={() => {
                setActiveView('martyr_centric');
                setCurrentPage(1);
              }}
              className={`min-h-[46px] px-3 py-2 rounded-lg transition-colors flex items-center justify-between gap-2.5 text-right whitespace-normal break-words min-w-0 cursor-pointer ${
                activeView === 'martyr_centric'
                  ? 'bg-[#6B3E26] text-white shadow-2xs'
                  : 'text-[#5C4033] hover:text-[#332218]'
              }`}
            >
              <span className="flex items-start sm:items-center gap-2 min-w-0 flex-1">
                <Users className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
                <span className="leading-relaxed break-words whitespace-normal">
                  بر پایه نام شهید (شهید ← کتاب)
                </span>
              </span>
              <span className="px-2 py-0.5 rounded-md text-[11px] bg-black/15 tabular-nums shrink-0">
                {toPersianDigits(filteredMartyrRows.length)}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveView('book_centric');
                setCurrentPage(1);
              }}
              className={`min-h-[46px] px-3 py-2 rounded-lg transition-colors flex items-center justify-between gap-2.5 text-right whitespace-normal break-words min-w-0 cursor-pointer ${
                activeView === 'book_centric'
                  ? 'bg-[#6B3E26] text-white shadow-2xs'
                  : 'text-[#5C4033] hover:text-[#332218]'
              }`}
            >
              <span className="flex items-start sm:items-center gap-2 min-w-0 flex-1">
                <BookOpen className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
                <span className="leading-relaxed break-words whitespace-normal">
                  بر پایه عنوان کتاب (کتاب ← شهدا)
                </span>
              </span>
              <span className="px-2 py-0.5 rounded-md text-[11px] bg-black/15 tabular-nums shrink-0">
                {toPersianDigits(filteredBookRows.length)}
              </span>
            </button>
          </div>

          {/* Quick Filter Buttons — چیدمان Grid واکنش‌گرا با قابلیت چندخطی بدون هم‌پوشانی */}
          <div className="2xl:col-span-5 grid grid-cols-1 md:grid-cols-3 items-stretch gap-2 text-xs w-full min-w-0">
            <button
              type="button"
              onClick={() => {
                setSourceSheetFilter('all');
                setCurrentPage(1);
              }}
              className={`min-h-[44px] px-3 py-2 rounded-xl border font-bold transition-colors flex items-center justify-between md:justify-center gap-2 text-right md:text-center whitespace-normal break-words min-w-0 cursor-pointer ${
                sourceSheetFilter === 'all'
                  ? 'bg-[#6B3E26] text-white border-[#6B3E26]'
                  : 'bg-[#FAF5EE] text-[#5C4033] border-[#E2D2BE] hover:bg-[#F3E9DC]'
              }`}
            >
              <span className="leading-relaxed break-words">همه پیوندها</span>
              <span className="tabular-nums underline decoration-current/50 shrink-0">
                ({toPersianDigits(allMartyrRows.length)})
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSourceSheetFilter('ghatat_one');
                setCurrentPage(1);
              }}
              className={`min-h-[44px] px-3 py-2 rounded-xl border font-bold transition-colors flex items-center justify-between md:justify-center gap-2 text-right md:text-center whitespace-normal break-words min-w-0 cursor-pointer ${
                sourceSheetFilter === 'ghatat_one'
                  ? 'bg-[#6B3E26] text-white border-[#6B3E26]'
                  : 'bg-[#FAF5EE] text-[#5C4033] border-[#E2D2BE] hover:bg-[#F3E9DC]'
              }`}
            >
              <span className="leading-relaxed break-words">قطعات شهدا: یک شهید</span>
              <span className="tabular-nums underline decoration-current/50 shrink-0">
                ({toPersianDigits(stats.ghatatOneCount)})
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSourceSheetFilter('ghatat_multi');
                setCurrentPage(1);
              }}
              className={`min-h-[44px] px-3 py-2 rounded-xl border font-bold transition-colors flex items-center justify-between md:justify-center gap-2 text-right md:text-center whitespace-normal break-words min-w-0 cursor-pointer ${
                sourceSheetFilter === 'ghatat_multi'
                  ? 'bg-[#6B3E26] text-white border-[#6B3E26]'
                  : 'bg-[#FAF5EE] text-[#5C4033] border-[#E2D2BE] hover:bg-[#F3E9DC]'
              }`}
            >
              <span className="leading-relaxed break-words">قطعات شهدا: چند شهید</span>
              <span className="tabular-nums underline decoration-current/50 shrink-0">
                ({toPersianDigits(stats.ghatatMultiCount)})
              </span>
            </button>
          </div>
        </div>

        {/* Filter and Search Bar — واکنش‌گرا و کاملاً تراز در موبایل، تبلت و دسکتاپ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 pt-1 text-xs">
          <div className="sm:col-span-2 lg:col-span-6 relative">
            <Search className="w-4 h-4 text-[#78604E] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => {
                const nextVal = e.target.value;
                setSearchQuery(nextVal);
                setCurrentPage(1);
                if (nextVal.trim() !== '') {
                  setIsLinksTableOpen(true);
                }
              }}
              placeholder={
                activeView === 'martyr_centric'
                  ? 'جست‌وجوی نام شهید، قطعه مزار، عنوان کتاب (مثلاً آخرین نامه، با مرام) یا ناشر...'
                  : 'جست‌وجوی عنوان کتاب، نویسنده، ناشر یا اسامی شهدا...'
              }
              className="w-full min-h-[44px] pr-10 pl-3 py-2 bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl focus:bg-white focus:outline-none focus:border-[#6B3E26]"
            />
          </div>

          <div className="lg:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as DepositoryStatusFilter);
                setCurrentPage(1);
              }}
              className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#E2D2BE] rounded-xl text-[#332218] font-medium"
            >
              <option value="all">
                همه پیوندهای دارای نام شهید ({toPersianDigits(stats.totalLinks)})
              </option>
              <option value="tehran_only">
                فقط شهدای تهرانی — گلزار شهدای تهران
              </option>
              <option value="verified_only">
                تأییدشده و بررسی‌شده ({toPersianDigits(stats.verifiedLinks)})
              </option>
              <option value="pending_review">
                ثبت اولیه اکسل ({toPersianDigits(stats.pendingLinksCount)})
              </option>
              {activeView === 'martyr_centric' && (
                <option value="with_pages_only">فقط دارای شماره صفحه دقیق</option>
              )}
            </select>
          </div>

          <div className="lg:col-span-3 flex items-center">
            {activeView === 'martyr_centric' ? (
              <button
                type="button"
                onClick={handleExportMartyrExcel}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[#2E6F40] hover:bg-[#235632] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
                <span>اکسل بر پایه نام شهید</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleExportBookExcel}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[#2E6F40] hover:bg-[#235632] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
                <span>اکسل بر پایه کتاب‌ها</span>
              </button>
            )}
          </div>
        </div>

        {/* نوار ابزار اقدام سریع میز کار پژوهش — چیدمان واکنش‌گرا و بدون سرریز افقی در موبایل */}
        {(onOpenAddLink || onOpenReviewQueues || onExportGhatatExcel) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-[#EFE4D6] text-xs">
            {onOpenAddLink && (
              <button
                type="button"
                onClick={onOpenAddLink}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-[#1F4E79] hover:bg-[#163A5B] text-white font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>ثبت پیوند جدید کتاب و شهید</span>
              </button>
            )}

            {onOpenReviewQueues && (
              <button
                type="button"
                onClick={() => onOpenReviewQueues('pending567')}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-[#FFF8EA] hover:bg-[#F6E9CE] text-[#6B3E26] border border-[#E2C896] font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-[#8C5208]" />
                <span>
                  صف بازبینی ({toPersianDigits(pendingReviewsOpenCount)} مورد + {toPersianDigits(openGroupsCount)} گروه)
                </span>
              </button>
            )}

            {onExportGhatatExcel && (
              <button
                type="button"
                onClick={onExportGhatatExcel}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-[#FAF5EE] hover:bg-[#F3E9DC] text-[#332218] border border-[#D8C7B2] font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-[#2E6F40] shrink-0" />
                <span>اکسل قطعات شهدا (یک/چند شهید)</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Live Data Depository Table Preview (کشویی و بسته در حالت پیش‌فرض) */}
      <div className="bg-white border border-[#E2D2BE] rounded-2xl overflow-x-clip shadow-2xs">
        <div
          className={`p-3.5 bg-[#FAF5EE] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs ${
            isLinksTableOpen ? 'border-b border-[#E2D2BE] rounded-t-2xl' : 'rounded-2xl'
          }`}
        >
          <button
            type="button"
            data-testid="depository-links-accordion-toggle"
            onClick={() => setIsLinksTableOpen((prev) => !prev)}
            className="font-bold text-[#332218] flex items-center justify-between sm:justify-start gap-2 text-right cursor-pointer hover:text-[#6B3E26] transition-colors flex-1 min-w-0"
          >
            <span className="flex items-center gap-2 min-w-0">
              <Layers className="w-4 h-4 text-[#6B3E26] shrink-0" />
              <span className="leading-relaxed">
                فهرست ارتباطات کتاب و شهید (
                {activeView === 'martyr_centric'
                  ? `نمایش ${toPersianDigits(visibleMartyrRows.length)} از ${toPersianDigits(filteredMartyrRows.length)} رکورد شهید–کتاب`
                  : `نمایش ${toPersianDigits(visibleBookRows.length)} از ${toPersianDigits(filteredBookRows.length)} عنوان کتاب متصل به شهدا`}
                )
              </span>
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-[#D8C7B2] text-[11px] font-bold text-[#6B3E26] shrink-0">
              <span>{isLinksTableOpen ? 'بستن فهرست' : 'مشاهده فهرست'}</span>
              {isLinksTableOpen ? (
                <ChevronUp className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              )}
            </span>
          </button>

          <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto shrink-0">
            <span className="text-[11px] text-[#78604E] shrink-0">تعداد نمایش در هر صفحه:</span>
            <select
              value={String(pageSize)}
              onChange={(e) => {
                const val = e.target.value;
                setPageSize(val === 'all' ? 'all' : Number(val));
                setCurrentPage(1);
                setIsLinksTableOpen(true);
              }}
              className="min-h-[38px] px-2.5 py-1 rounded-lg bg-white border border-[#D8C7B2] text-[#332218] font-bold text-xs cursor-pointer"
            >
              <option value="20">۲۰ ردیف در صفحه</option>
              <option value="50">۵۰ ردیف در صفحه</option>
              <option value="100">۱۰۰ ردیف در صفحه</option>
              <option value="200">۲۰۰ ردیف در صفحه</option>
              <option value="all">نمایش یکجای تمام ردیف‌ها ({toPersianDigits(totalActiveItems)})</option>
            </select>
          </div>
        </div>

        {isLinksTableOpen && (
          <>
            {/* نوار اسکرول افقی چسبان بالای جدول (هم‌زمان و دوطرفه با جدول) */}
            <div className="sticky top-0 z-30 bg-[#FAF5EE] border-b border-[#E2D2BE] px-3 py-1.5 flex items-center gap-2.5">
              <span className="text-[10.5px] font-bold text-[#6B3E26] whitespace-nowrap shrink-0">
                اسکرول افقی ستون‌ها:
              </span>
              <div
                ref={topScrollRef}
                onScroll={() => handleSyncHorizontalScroll('top')}
                dir="rtl"
                className="flex-1 min-w-0 h-4 overflow-x-auto overflow-y-hidden rounded-full bg-[#EFE4D6]/60 [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-track]:bg-[#EFE4D6] [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#8C6D53] [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-[#6B3E26]"
              >
                <div style={{ width: `${tableScrollWidth}px` }} className="h-[1px]" />
              </div>
            </div>

        {/* View 1: Martyr-Centric Table */}
        {activeView === 'martyr_centric' ? (
          <div
            ref={tableScrollRef}
            onScroll={() => handleSyncHorizontalScroll('table')}
            dir="rtl"
            className="overflow-auto max-h-[72vh]"
          >
            <table className="w-full text-xs text-right border-separate border-spacing-0">
              <thead className="sticky top-0 z-20">
                <tr className="bg-[#F6EFE6] text-[#332218] font-bold">
                  <th className="sticky right-0 z-30 bg-[#F6EFE6] py-2.5 px-1.5 sm:px-2 w-[44px] min-w-[44px] max-w-[44px] sm:w-[52px] sm:min-w-[52px] sm:max-w-[52px] text-center border-b border-l border-[#E2D2BE]">
                    ردیف
                  </th>
                  <th className="sticky right-[44px] sm:right-[52px] z-30 bg-[#F6EFE6] py-2.5 px-2.5 sm:px-3 min-w-[130px] max-w-[148px] sm:min-w-[160px] sm:max-w-[195px] border-b border-l border-[#D8C7B2] shadow-[-3px_0_6px_-3px_rgba(51,34,24,0.12)]">
                    نام و نام خانوادگی شهید
                  </th>
                  <th className="py-2.5 px-3 min-w-[110px] border-b border-[#E2D2BE] bg-[#F6EFE6]">
                    قطعه / ردیف / شماره
                  </th>
                  <th className="py-2.5 px-3 min-w-[180px] border-b border-[#E2D2BE] bg-[#F6EFE6]">
                    عنوان کتاب مرتبط
                  </th>
                  <th className="py-2.5 px-3 min-w-[120px] border-b border-[#E2D2BE] bg-[#F6EFE6]">
                    انتشارات
                  </th>
                  <th className="py-2.5 px-3 min-w-[170px] border-b border-[#E2D2BE] bg-[#F6EFE6]">
                    توضیحات کتاب در منبع
                  </th>
                  <th className="py-2.5 px-3 min-w-[95px] border-b border-[#E2D2BE] bg-[#F6EFE6]">
                    ارجاع صفحه
                  </th>
                  <th className="py-2.5 px-3 min-w-[120px] border-b border-[#E2D2BE] bg-[#F6EFE6]">
                    شیت منبع
                  </th>
                  <th className="py-2.5 px-3 min-w-[190px] border-b border-[#E2D2BE] bg-[#F6EFE6] text-center">
                    وضعیت و عملیات درجا
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleMartyrRows.map((row, idx) => (
                  <tr key={row.id} className="group hover:bg-[#FAF5EE] transition-colors">
                    <td className="sticky right-0 z-10 bg-white group-hover:bg-[#FAF5EE] py-2.5 px-1.5 sm:px-2 w-[44px] min-w-[44px] max-w-[44px] sm:w-[52px] sm:min-w-[52px] sm:max-w-[52px] text-center text-[#78604E] font-mono border-b border-l border-[#EFE4D6]">
                      {toPersianDigits(startRowNumber + idx)}
                    </td>
                    <td className="sticky right-[44px] sm:right-[52px] z-10 bg-white group-hover:bg-[#FAF5EE] py-2.5 px-2.5 sm:px-3 min-w-[130px] max-w-[148px] sm:min-w-[160px] sm:max-w-[195px] font-bold text-[#332218] border-b border-l border-[#E2D2BE] shadow-[-3px_0_6px_-3px_rgba(51,34,24,0.1)] whitespace-normal break-words leading-relaxed">
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        {onInspectMartyr ? (
                          <button
                            type="button"
                            onClick={() => onInspectMartyr(row.martyrName, row.id)}
                            className="text-right font-bold text-[#1F4E79] hover:text-[#6B3E26] hover:underline break-words cursor-pointer"
                            title="مشاهده و ویرایش پرونده شهید و پیوندها بدون خروج از صفحه"
                          >
                            {row.martyrName}
                          </button>
                        ) : (
                          <span className="break-words">{row.martyrName}</span>
                        )}
                        {row.isTehranMartyr && <TehranMartyrBadge size="xs" />}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[#5C4033] tabular-nums border-b border-[#EFE4D6] whitespace-normal break-words leading-relaxed">
                      قطعه {toPersianDigits(row.gravePiece)}
                      {row.graveRow !== '—' && ` · ر.${toPersianDigits(row.graveRow)}`}
                      {row.graveNumber !== '—' && ` · ش.${toPersianDigits(row.graveNumber)}`}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-[#6B3E26] border-b border-[#EFE4D6] whitespace-normal break-words leading-relaxed">
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        {onInspectBook ? (
                          <button
                            type="button"
                            onClick={() => onInspectBook(row.bookId, row.bookTitle)}
                            className="text-right font-bold text-[#6B3E26] hover:text-[#332218] hover:underline break-words cursor-pointer"
                            title="مشاهده و ویرایش اطلاعات کتاب و قفسه درجا"
                          >
                            {row.bookTitle}
                          </button>
                        ) : (
                          <span className="break-words">{row.bookTitle}</span>
                        )}
                        <span className="font-mono text-[10.5px] text-[#78604E] font-normal" dir="ltr">
                          ({row.bookId})
                        </span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[#5C4033] border-b border-[#EFE4D6] whitespace-normal break-words leading-relaxed">{row.publisher}</td>
                    <td className="py-2.5 px-3 text-[#332218] leading-relaxed border-b border-[#EFE4D6] whitespace-normal break-words">{row.relationSubject}</td>
                    <td className="py-2.5 px-3 text-[#332218] font-mono text-[11px] tabular-nums border-b border-[#EFE4D6]">
                      {toPersianDigits(row.pageReference)}
                    </td>
                    <td className="py-2.5 px-3 text-[#78604E] text-[11px] border-b border-[#EFE4D6]">
                      {row.sourceSheet === 'یک شهید'
                        ? 'قطعات شهدا (یک شهید)'
                        : row.sourceSheet === 'چند شهید'
                        ? 'قطعات شهدا (چند شهید)'
                        : 'سوره مهر'}
                    </td>
                    <td className="py-2.5 px-3 border-b border-[#EFE4D6]">
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        {onQuickUpdateLinkStatus && row.reviewStatus !== 'تأییدشده کارشناسی' && (
                          <button
                            type="button"
                            onClick={() => onQuickUpdateLinkStatus(row.id, 'تأییدشده کارشناسی')}
                            className="min-h-[30px] px-2 py-1 rounded-lg bg-[#2E6F40] hover:bg-[#235632] text-white text-[10.5px] font-bold cursor-pointer"
                            title="تأیید نهایی پیوند"
                          >
                            ✓ تأیید
                          </button>
                        )}
                        {onQuickEditLink && (
                          <button
                            type="button"
                            onClick={() => onQuickEditLink(row.id)}
                            className="min-h-[30px] px-2 py-1 rounded-lg bg-[#FAF5EE] hover:bg-[#EFE4D6] border border-[#D8C7B2] text-[#332218] text-[10.5px] font-bold inline-flex items-center gap-1 cursor-pointer"
                            title="ویرایش پیوند، مزار و شماره صفحه"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>ویرایش</span>
                          </button>
                        )}
                        {onExtractPassageFromLink && (
                          <button
                            type="button"
                            onClick={() => onExtractPassageFromLink(row.id)}
                            className="min-h-[30px] px-2 py-1 rounded-lg bg-[#EDF4FA] hover:bg-[#DCEAF7] text-[#1F4E79] text-[10.5px] font-bold inline-flex items-center gap-1 cursor-pointer"
                            title="ثبت مطلب یا خاطره صفحه‌ای"
                          >
                            <FileText className="w-3 h-3" />
                            <span>مطلب</span>
                          </button>
                        )}
                        {onQuickDeleteLink && (
                          <button
                            type="button"
                            onClick={() => onQuickDeleteLink(row.id)}
                            className="min-h-[30px] px-1.5 py-1 rounded-lg bg-[#FDF0F0] hover:bg-[#F9DADA] border border-[#E6B8B8] text-[#A63A3A] text-[10.5px] font-bold inline-flex items-center cursor-pointer"
                            title="حذف پیوند"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredMartyrRows.length === 0 && (
              <div className="p-8 text-center text-[#78604E] text-xs">
                موردی با مشخصات جست‌وجوشده یافت نشد.
              </div>
            )}
          </div>
        ) : (
          /* View 2: Book-Centric Table — ردیف و عنوان کتاب ثابت هنگام اسکرول افقی */
          <div
            ref={tableScrollRef}
            onScroll={() => handleSyncHorizontalScroll('table')}
            dir="rtl"
            className="overflow-auto max-h-[72vh]"
          >
            <table className="w-full text-xs text-right border-separate border-spacing-0">
              <thead className="sticky top-0 z-20">
                <tr className="bg-[#F6EFE6] text-[#332218] font-bold">
                  <th className="sticky right-0 z-30 bg-[#F6EFE6] py-2.5 px-1.5 sm:px-2 w-[44px] min-w-[44px] max-w-[44px] sm:w-[52px] sm:min-w-[52px] sm:max-w-[52px] text-center border-b border-l border-[#E2D2BE]">
                    ردیف
                  </th>
                  <th className="sticky right-[44px] sm:right-[52px] z-30 bg-[#F6EFE6] py-2.5 px-2.5 sm:px-3 min-w-[140px] max-w-[160px] sm:min-w-[175px] sm:max-w-[215px] border-b border-l border-[#D8C7B2] shadow-[-3px_0_6px_-3px_rgba(51,34,24,0.12)]">
                    عنوان کتاب
                  </th>
                  <th className="py-2.5 px-3 min-w-[85px] border-b border-[#E2D2BE] bg-[#F6EFE6]">
                    کد مخزن
                  </th>
                  <th className="py-2.5 px-3 min-w-[130px] border-b border-[#E2D2BE] bg-[#F6EFE6]">
                    نویسنده / ناشر
                  </th>
                  <th className="py-2.5 px-3 min-w-[110px] border-b border-[#E2D2BE] bg-[#F6EFE6]">
                    موقعیت قفسه
                  </th>
                  <th className="py-2.5 px-3 min-w-[95px] text-center border-b border-[#E2D2BE] bg-[#F6EFE6]">
                    تعداد شهدا
                  </th>
                  <th className="py-2.5 px-3 min-w-[280px] border-b border-[#E2D2BE] bg-[#F6EFE6]">
                    شهدای مرتبط (نام، قطعه و صفحه)
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleBookRows.map((row, idx) => (
                  <tr key={row.bookId} className="group hover:bg-[#FAF5EE] transition-colors">
                    <td className="sticky right-0 z-10 bg-white group-hover:bg-[#FAF5EE] py-2.5 px-1.5 sm:px-2 w-[44px] min-w-[44px] max-w-[44px] sm:w-[52px] sm:min-w-[52px] sm:max-w-[52px] text-center text-[#78604E] font-mono border-b border-l border-[#EFE4D6]">
                      {toPersianDigits(startRowNumber + idx)}
                    </td>
                    <td className="sticky right-[44px] sm:right-[52px] z-10 bg-white group-hover:bg-[#FAF5EE] py-2.5 px-2.5 sm:px-3 min-w-[140px] max-w-[160px] sm:min-w-[175px] sm:max-w-[215px] font-bold text-[#332218] border-b border-l border-[#E2D2BE] shadow-[-3px_0_6px_-3px_rgba(51,34,24,0.1)] whitespace-normal break-words leading-relaxed">
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        {onInspectBook ? (
                          <button
                            type="button"
                            onClick={() => onInspectBook(row.bookId, row.bookTitle)}
                            className="text-right font-bold text-[#6B3E26] hover:text-[#332218] hover:underline break-words cursor-pointer"
                            title="مشاهده و ویرایش شناسنامه کتاب و قفسه درجا"
                          >
                            {row.bookTitle}
                          </button>
                        ) : (
                          <span className="break-words">{row.bookTitle}</span>
                        )}
                        {row.hasTehranMartyr && <TehranMartyrBadge size="xs" />}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-[#6B3E26] border-b border-[#EFE4D6]" dir="ltr">
                      {row.bookId}
                    </td>
                    <td className="py-2.5 px-3 text-[#5C4033] border-b border-[#EFE4D6] whitespace-normal break-words leading-relaxed">
                      <div>{row.author}</div>
                      <div className="text-[10.5px] text-[#78604E]">{row.publisher}</div>
                    </td>
                    <td className="py-2.5 px-3 text-[#5C4033] font-mono text-[11px] border-b border-[#EFE4D6]">
                      {row.locationCode}
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold text-[#6B3E26] tabular-nums border-b border-[#EFE4D6]">
                      {toPersianDigits(row.linkedMartyrsCount)} شهید
                    </td>
                    <td className="py-2.5 px-3 text-[#332218] leading-relaxed border-b border-[#EFE4D6] whitespace-normal break-words">
                      {row.martyrsListSummary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredBookRows.length === 0 && (
              <div className="p-8 text-center text-[#78604E] text-xs">
                کتابی با مشخصات جست‌وجوشده یافت نشد.
              </div>
            )}
          </div>
        )}

        {/* نوار صفحه‌بندی ساده (فقط صفحه قبل، صفحه بعد و نمایش یکجای همه) */}
        {totalActiveItems > 0 && (
          <div className="p-3.5 bg-[#FAF5EE] border-t border-[#E2D2BE] flex flex-wrap items-center justify-between gap-3 text-xs rounded-b-2xl">
            <div className="text-[#5C4033] font-medium">
              {pageSize === 'all' ? (
                <span>
                  نمایش یکجای تمام <strong className="text-[#332218]">{toPersianDigits(totalActiveItems)}</strong> مورد
                </span>
              ) : (
                <span>
                  صفحه <strong className="text-[#332218]">{toPersianDigits(safePage)}</strong> از{' '}
                  <strong className="text-[#332218]">{toPersianDigits(totalPages)}</strong> (ردیف{' '}
                  {toPersianDigits(startRowNumber)} تا{' '}
                  {toPersianDigits(Math.min(totalActiveItems, startRowNumber + (pageSize as number) - 1))} از مجموع{' '}
                  {toPersianDigits(totalActiveItems)} مورد)
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {pageSize !== 'all' && totalPages > 1 && (
                <>
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-3.5 py-1.5 rounded-lg bg-white border border-[#D8C7B2] text-[#332218] font-bold disabled:opacity-40 hover:bg-[#F3E9DC] cursor-pointer"
                  >
                    → صفحه قبل
                  </button>

                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3.5 py-1.5 rounded-lg bg-[#6B3E26] text-white font-bold disabled:opacity-40 hover:bg-[#56311E] cursor-pointer"
                  >
                    صفحه بعد ←
                  </button>
                </>
              )}

              {pageSize !== 'all' ? (
                <button
                  type="button"
                  onClick={() => {
                    setPageSize('all');
                    setCurrentPage(1);
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-white border border-[#6B3E26] text-[#6B3E26] font-bold hover:bg-[#F3E9DC] cursor-pointer"
                >
                  نمایش یکجای همه ({toPersianDigits(totalActiveItems)} مورد)
                </button>
              ) : (
                totalActiveItems > 20 && (
                  <button
                    type="button"
                    onClick={() => {
                      setPageSize(20);
                      setCurrentPage(1);
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-white border border-[#D8C7B2] text-[#5C4033] font-bold hover:bg-[#F3E9DC] cursor-pointer"
                  >
                    بازگشت به نمایش صفحه‌بندی (۲۰تایی)
                  </button>
                )
              )}
            </div>
          </div>
        )}
          </>
        )}
      </div>

      {/* Depository Header Banner — منتقل‌شده به پایینِ پایین فهرست ارتباط کتاب و شهید با چیدمان دوخطی تراز و بدون اسکرول افقی */}
      <div className="depository-soft-blue rounded-2xl p-3.5 sm:p-4 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-xs font-bold text-[#2B547E]">
              انبار جامع پیوندهای کتاب و شهید
            </div>
            <h2 className="text-base sm:text-lg font-bold text-[#1E3A5F] tracking-tight">
              خروجی دوسویه اسناد: ارتباط شهید به کتاب و کتاب به شهید
            </h2>
          </div>

          {/* Master Export Action Buttons — دو ردیف تراز روی موبایل (اکسل جامع تمام‌عرض + دو دکمه JSON و CSV در ردیف زیرین بدون اسکرول افقی) */}
          <div className="grid grid-cols-2 lg:flex lg:flex-wrap items-center gap-2 w-full lg:w-auto shrink-0">
            <button
              type="button"
              onClick={handleExportComprehensiveExcel}
              className="col-span-2 lg:col-span-1 min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#2E6F40] hover:bg-[#235632] text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0" />
              <span>دانلود اکسل جامع</span>
            </button>

            <button
              type="button"
              onClick={handleExportJson}
              className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-white hover:bg-[#F5F9FD] text-[#1E3A5F] border border-[#B8D0E8] font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <FileJson className="w-4 h-4 text-[#2B547E] shrink-0" />
              <span>خروجی JSON</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-white hover:bg-[#F5F9FD] text-[#1E3A5F] border border-[#B8D0E8] font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4 text-[#2B547E] shrink-0" />
              <span>خروجی CSV</span>
            </button>
          </div>
        </div>

        {/* فقط ۲ کادر کلیدی درخواستی: شهدای دارای کتاب مرتبط و کتاب‌های متصل به شهدا */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 text-xs border-t border-[#C5D9ED]">
          <div className="bg-white/95 border border-[#C5D9ED] rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2">
            <div>
              <div className="text-[#4A698C] text-xs font-bold">شهدای دارای کتاب مرتبط</div>
              <div className="text-[11px] text-[#4A698C] mt-0.5">
                در مجموع {toPersianDigits(stats.totalLinks)} پیوند ثبت‌شده کتاب و شهید
              </div>
            </div>
            <div className="text-lg sm:text-xl font-bold tabular-nums text-[#1E3A5F] shrink-0">
              {toPersianDigits(stats.uniqueMartyrs)} شهید
            </div>
          </div>

          <div className="bg-white/95 border border-[#C5D9ED] rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2">
            <div>
              <div className="text-[#4A698C] text-xs font-bold">کتاب‌های متصل به شهدا</div>
              <div className="text-[11px] text-[#4A698C] mt-0.5">
                از مجموع {toPersianDigits(totalSystemBooksCount)} کتاب ثبت‌شده در سامانه
              </div>
            </div>
            <div className="text-lg sm:text-xl font-bold tabular-nums text-[#1E3A5F] shrink-0">
              {toPersianDigits(stats.booksWithLinks)} کتاب
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
