import React, { useState, useMemo } from 'react';
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
  Sparkles,
  ShieldCheck,
  Building2,
  BookmarkCheck
} from 'lucide-react';
import {
  BookCopyRecord,
  BookMartyrLinkRecord,
  ExtractedContentItem,
  FieldAuditRecord,
  PendingReviewItem,
  ReferenceCatalogRow,
  WorkbookGolzarMartyr,
  normalizePersianText,
  toPersianDigits
} from '../data/markazAsnadData';

export type DepositoryStatusFilter =
  | 'verified_only'
  | 'researched_main'
  | 'pending_review'
  | 'rejected'
  | 'with_pages_only'
  | 'all';

interface DepositoryAndExportHubProps {
  catalogRows: ReferenceCatalogRow[];
  auditRecords?: Record<string, FieldAuditRecord>;
  bookCopies?: BookCopyRecord[];
  links: BookMartyrLinkRecord[];
  pendingReviews: PendingReviewItem[];
  workbookMartyrs?: WorkbookGolzarMartyr[];
  extractedItems: ExtractedContentItem[];
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
}

export const DepositoryAndExportHub: React.FC<DepositoryAndExportHubProps> = ({
  catalogRows,
  auditRecords = {},
  bookCopies = [],
  links,
  pendingReviews,
  workbookMartyrs = [],
  extractedItems,
  onNotify,
  onJumpToSmartSearch
}) => {
  const [activeView, setActiveView] = useState<'martyr_centric' | 'book_centric'>('martyr_centric');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<DepositoryStatusFilter>('all');
  const [sourceSheetFilter, setSourceSheetFilter] = useState<'all' | 'ghatat_one' | 'ghatat_multi' | 'sooreh'>('all');
  const [exportScope, setExportScope] = useState<'filtered' | 'all'>('filtered');

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

  // 1. Consolidated Martyr-centric rows (All resolved / determined links without * or empty)
  const allMartyrRows = useMemo<ResolvedMartyrExportItem[]>(() => {
    const rows: ResolvedMartyrExportItem[] = [];

    links.forEach((l) => {
      if (!l.martyrNameRaw || l.martyrNameRaw === '*' || l.martyrNameRaw.includes('نامشخص')) {
        return;
      }
      const bObj = catalogMap.get(l.tempBookId);
      const exKey = `${normalizePersianText(l.martyrNameRaw)}::${l.tempBookId}`;
      const matchedExtracts = extractedMap.get(exKey) || [];

      rows.push({
        id: l.id,
        martyrName: l.martyrNameRaw,
        gravePiece: l.gravePieceRaw || '—',
        graveRow: l.graveRowRaw || '—',
        graveNumber: l.graveNumberRaw || '—',
        bookId: l.tempBookId || 'BK-????',
        bookTitle: l.bookTitleRaw || bObj?.titleRaw || '—',
        publisher: l.publisherRaw || bObj?.publisherRaw || '—',
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
        extractedPassageCount: matchedExtracts.length
      });
    });

    return rows;
  }, [links, catalogMap, extractedMap]);

  // 2. Consolidated Book-centric rows (Books that have determined martyr links)
  const allBookRows = useMemo<ResolvedBookExportItem[]>(() => {
    const bookToMartyrs = new Map<
      string,
      {
        martyrs: { name: string; piece: string; page: string; sourceSheet: string }[];
        verifiedCount: number;
      }
    >();

    allMartyrRows.forEach((m) => {
      if (sourceSheetFilter === 'ghatat_one' && m.sourceSheet !== 'یک شهید') return;
      if (sourceSheetFilter === 'ghatat_multi' && m.sourceSheet !== 'چند شهید') return;
      if (sourceSheetFilter === 'sooreh' && (m.sourceSheet === 'یک شهید' || m.sourceSheet === 'چند شهید')) return;

      const entry = bookToMartyrs.get(m.bookId) || { martyrs: [], verifiedCount: 0 };
      entry.martyrs.push({
        name: m.martyrName,
        piece: m.gravePiece,
        page: m.pageReference,
        sourceSheet: m.sourceSheet
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
        .slice(0, 15)
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
        martyrsListSummary:
          data.martyrs.length > 15
            ? `${martyrsListSummary} و ${toPersianDigits(data.martyrs.length - 15)} شهید دیگر...`
            : martyrsListSummary,
        pageReferencesSummary,
        reviewStatus:
          data.verifiedCount === data.martyrs.length
            ? 'تکمیل و تأییدشده کامل'
            : data.verifiedCount > 0
            ? `دارای ${toPersianDigits(data.verifiedCount)} شهید تأییدشده از ${toPersianDigits(
                data.martyrs.length
              )}`
            : 'ثبت‌شده در منبع اکسل',
        extractedPassagesCount: relatedPassages.length
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
    const q = normalizePersianText(searchQuery);
    return allMartyrRows.filter((r) => {
      if (sourceSheetFilter === 'ghatat_one' && r.sourceSheet !== 'یک شهید') return false;
      if (sourceSheetFilter === 'ghatat_multi' && r.sourceSheet !== 'چند شهید') return false;
      if (sourceSheetFilter === 'sooreh' && (r.sourceSheet === 'یک شهید' || r.sourceSheet === 'چند شهید')) {
        return false;
      }

      const cat = classifyMartyrRowStatus(r);
      if (statusFilter === 'verified_only' && cat !== 'verified' && cat !== 'researched_main') {
        return false;
      }
      if (statusFilter === 'researched_main' && cat !== 'researched_main') return false;
      if (statusFilter === 'pending_review' && cat !== 'pending') return false;
      if (statusFilter === 'rejected' && cat !== 'rejected') return false;
      if (
        statusFilter === 'with_pages_only' &&
        (r.pageReference === 'ثبت در منبع' || r.pageReference === 'ثبت‌نشده' || !r.pageReference)
      ) {
        return false;
      }

      if (!q) return true;
      const hay = normalizePersianText(
        `${r.id} ${r.martyrName} ${r.bookTitle} ${r.bookId} ${r.publisher} ${r.gravePiece} ${r.relationSubject} ${r.pageReference} ${r.sourceSheet}`
      );
      return q.split(' ').every((w) => hay.includes(w));
    });
  }, [allMartyrRows, searchQuery, statusFilter, sourceSheetFilter]);

  const filteredBookRows = useMemo(() => {
    const q = normalizePersianText(searchQuery);
    return allBookRows.filter((b) => {
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

      if (!q) return true;
      const hay = normalizePersianText(
        `${b.bookId} ${b.bookTitle} ${b.author} ${b.publisher} ${b.category} ${b.locationCode} ${b.martyrsListSummary}`
      );
      return q.split(' ').every((w) => hay.includes(w));
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

  // ================= EXPORT ENGINES =================

  const handleExportComprehensiveExcel = () => {
    const martyrData = (exportScope === 'filtered' ? filteredMartyrRows : allMartyrRows).map((m, idx) => ({
      'ردیف': idx + 1,
      'شناسه پیوند': m.id,
      'نام و نام خانوادگی شهید': m.martyrName,
      'قطعه مزار': m.gravePiece,
      'ردیف مزار': m.graveRow,
      'شماره مزار': m.graveNumber,
      'شناسه کتاب (مخزن)': m.bookId,
      'عنوان کتاب': m.bookTitle,
      'ناشر / پدیدآورنده': m.publisher,
      'موضوع و نحوه ارتباط با شهید': m.relationSubject,
      'ارجاع صفحه در اثر': m.pageReference,
      'تعداد متون استخراج‌شده': m.extractedPassageCount,
      'وضعیت بررسی کارشناسی': m.reviewStatus,
      'یادداشت کارشناس اسناد': m.reviewerNote,
      'منبع اطلاعات': `${m.sourceFile} / ${m.sourceSheet}`
    }));

    const bookData = (exportScope === 'filtered' ? filteredBookRows : allBookRows).map((b, idx) => ({
      'ردیف': idx + 1,
      'کد کتاب (مخزن)': b.bookId,
      'عنوان کامل کتاب': b.bookTitle,
      'نویسنده / گردآورنده': b.author,
      'ناشر': b.publisher,
      'سال نشر': b.year,
      'رده موضوعی': b.category,
      'قفسه': b.shelf,
      'طبقه': b.floor,
      'کد موقعیت فیزیکی': b.locationCode,
      'تعداد شهدای مرتبط': b.linkedMartyrsCount,
      'فهرست شهدای مرتبط و صفحات': b.martyrsListSummary,
      'خلاصه ارجاعات صفحه': b.pageReferencesSummary,
      'تعداد متون و استنادات استخراج‌شده': b.extractedPassagesCount,
      'وضعیت نهایی بازبینی': b.reviewStatus
    }));

    const extractData = extractedItems.map((e, idx) => ({
      'ردیف': idx + 1,
      'شناسه مطلب': e.id,
      'کد کتاب': e.tempBookId,
      'عنوان اثر': e.bookTitleRaw,
      'نام شهید': e.martyrNameRaw,
      'قطعه مزار': e.gravePieceRaw || '—',
      'نوع مطلب': e.contentType,
      'عنوان بخش': e.passageTitle,
      'ارجاع صفحه': e.pageReferenceRaw,
      'متن و استناد پژوهشی': e.extractedText,
      'وضعیت بازبینی': e.reviewStatus,
      'کارشناس ثبت‌کننده': e.recordedBy || '—'
    }));

    const statsData = [
      { 'شاخص': 'کل شهدای دارای کتاب در سامانه', 'مقدار': stats.uniqueMartyrs },
      { 'شاخص': 'کل پیوندهای دارای نام شهید', 'مقدار': stats.totalLinks },
      { 'شاخص': 'شیت یک شهید (قطعات شهدا.xlsx)', 'مقدار': stats.ghatatOneCount },
      { 'شاخص': 'شیت چند شهید (قطعات شهدا.xlsx)', 'مقدار': stats.ghatatMultiCount },
      { 'شاخص': 'کتاب‌های مخزن دارای پیوند شهید', 'مقدار': stats.booksWithLinks },
      { 'شاخص': 'مطالب و استنادات استخراج‌شده', 'مقدار': stats.approvedExtracts },
      { 'شاخص': 'تاریخ تولید گزارش', 'مقدار': new Intl.DateTimeFormat('fa-IR').format(new Date()) }
    ];

    const wb = XLSX.utils.book_new();
    const wsMartyrs = XLSX.utils.json_to_sheet(martyrData);
    const wsBooks = XLSX.utils.json_to_sheet(bookData);
    const wsExtracts = XLSX.utils.json_to_sheet(extractData);
    const wsStats = XLSX.utils.json_to_sheet(statsData);

    XLSX.utils.book_append_sheet(wb, wsMartyrs, 'شهدای دارای کتاب');
    XLSX.utils.book_append_sheet(wb, wsBooks, 'کتاب‌های متصل به شهدا');
    XLSX.utils.book_append_sheet(wb, wsExtracts, 'مطالب استخراج‌شده');
    XLSX.utils.book_append_sheet(wb, wsStats, 'خلاصه آماری');

    const fileName = `دپوی-جامع-اسناد-و-پیوندها-${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    onNotify(`بسته اکسل ۴ شیت جامع «${fileName}» با موفقیت دانلود شد.`);
  };

  const handleExportMartyrExcel = () => {
    const list = exportScope === 'filtered' ? filteredMartyrRows : allMartyrRows;
    const rows = list.map((m, idx) => ({
      'ردیف': idx + 1,
      'شناسه پیوند': m.id,
      'نام و نام خانوادگی شهید': m.martyrName,
      'قطعه مزار': m.gravePiece,
      'ردیف مزار': m.graveRow,
      'شماره مزار': m.graveNumber,
      'شناسه کتاب': m.bookId,
      'عنوان کتاب': m.bookTitle,
      'ناشر / پدیدآورنده': m.publisher,
      'موضوع ارتباط شهید با اثر': m.relationSubject,
      'ارجاع صفحه در اثر': m.pageReference,
      'شیت منبع': m.sourceSheet,
      'وضعیت بررسی': m.reviewStatus,
      'یادداشت کارشناس': m.reviewerNote
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'خروجی بر پایه شهدا');
    XLSX.writeFile(wb, `خروجی-پیوندها-بر-پایه-نام-شهید-${new Date().toISOString().slice(0, 10)}.xlsx`);
    onNotify(`فایل اکسل بر پایه نام شهدا شامل ${toPersianDigits(rows.length)} رکورد دانلود شد.`);
  };

  const handleExportBookExcel = () => {
    const list = exportScope === 'filtered' ? filteredBookRows : allBookRows;
    const rows = list.map((b, idx) => ({
      'ردیف': idx + 1,
      'کد کتاب': b.bookId,
      'عنوان کتاب': b.bookTitle,
      'نویسنده': b.author,
      'ناشر': b.publisher,
      'سال نشر': b.year,
      'رده موضوعی': b.category,
      'موقعیت فیزیکی (قفسه و طبقه)': b.locationCode,
      'تعداد شهدای متصل': b.linkedMartyrsCount,
      'فهرست شهدای مرتبط و صفحات': b.martyrsListSummary,
      'ارجاعات صفحه': b.pageReferencesSummary,
      'وضعیت بررسی': b.reviewStatus
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'خروجی بر پایه کتاب‌ها');
    XLSX.writeFile(wb, `خروجی-پیوندها-بر-پایه-کتاب‌ها-${new Date().toISOString().slice(0, 10)}.xlsx`);
    onNotify(`فایل اکسل بر پایه کتاب‌ها شامل ${toPersianDigits(rows.length)} عنوان دانلود شد.`);
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
      {/* Depository Header Banner — آبی ملایم و روشن برای تفکیک ظریف از کل محدوده نخودی */}
      <div className="depository-soft-blue rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="text-xs font-bold text-[#2B547E]">
              مرکز دپو و انبار جامع پیوندهای کتاب و شهید (شامل «قطعات شهدا» و «سوره مهر»)
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-[#1E3A5F] tracking-tight">
              خروجی دوسویه اسناد: ارتباط شهید به کتاب و کتاب به شهید
            </h2>
            <p className="text-xs sm:text-sm text-[#365374] max-w-3xl leading-relaxed">
              هدف اصلی سامانه: مشخص کردن اینکه برای کدام‌یک از شهدای گلزار تهران در ۹۸۰ کتاب موجود (و شیت‌های «یک شهید» و «چند شهید» فایل قطعات شهدا) مطلب یا کتابی وجود دارد.
            </p>
          </div>

          {/* Master Export Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportComprehensiveExcel}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#2E6F40] hover:bg-[#235632] text-white font-bold text-xs flex items-center gap-2 shadow-2xs transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>دانلود اکسل جامع (۴ شیت .xlsx)</span>
            </button>

            <button
              type="button"
              onClick={handleExportJson}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white hover:bg-[#F5F9FD] text-[#1E3A5F] border border-[#B8D0E8] font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <FileJson className="w-4 h-4 text-[#2B547E]" />
              <span>خروجی JSON</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white hover:bg-[#F5F9FD] text-[#1E3A5F] border border-[#B8D0E8] font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4 text-[#2B547E]" />
              <span>خروجی CSV</span>
            </button>
          </div>
        </div>

        {/* 4 Consolidated Stats Cards inside Soft Light Blue Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 text-xs border-t border-[#C5D9ED]">
          <div className="bg-white/90 border border-[#C5D9ED] rounded-xl p-3">
            <div className="text-[#4A698C] text-[11px]">شهدای دارای کتاب مرتبط</div>
            <div className="text-lg font-bold tabular-nums text-[#1E3A5F] mt-0.5">
              {toPersianDigits(stats.uniqueMartyrs)} شهید
            </div>
            <div className="text-[10.5px] text-[#4A698C]">در مجموع {toPersianDigits(stats.totalLinks)} پیوند ثبت‌شده</div>
          </div>

          <div className="bg-white/90 border border-[#C5D9ED] rounded-xl p-3">
            <div className="text-[#4A698C] text-[11px]">شیت «یک شهید» (قطعات شهدا)</div>
            <div className="text-lg font-bold tabular-nums text-[#1E3A5F] mt-0.5">
              {toPersianDigits(stats.ghatatOneCount)} مورد
            </div>
            <div className="text-[10.5px] text-[#4A698C]">هر کتاب ویژه یک شهید</div>
          </div>

          <div className="bg-white/90 border border-[#C5D9ED] rounded-xl p-3">
            <div className="text-[#4A698C] text-[11px]">شیت «چند شهید» (قطعات شهدا)</div>
            <div className="text-lg font-bold tabular-nums text-[#1E3A5F] mt-0.5">
              {toPersianDigits(stats.ghatatMultiCount)} مورد
            </div>
            <div className="text-[10.5px] text-[#4A698C]">یک کتاب مرتبط با چند شهید</div>
          </div>

          <div className="bg-white/90 border border-[#C5D9ED] rounded-xl p-3">
            <div className="text-[#4A698C] text-[11px]">کتاب‌های متصل به شهدا</div>
            <div className="text-lg font-bold tabular-nums text-[#1E3A5F] mt-0.5">
              {toPersianDigits(stats.booksWithLinks)} عنوان کتاب
            </div>
            <div className="text-[10.5px] text-[#4A698C]">از فهرست ۹۸۰ کتاب مرجع</div>
          </div>
        </div>
      </div>

      {/* Main Control & Perspective Switcher Bar */}
      <div className="bg-white border border-[#E2D2BE] rounded-2xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* 2-Way View Switcher Tabs */}
          <div className="inline-flex p-1 bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl text-xs font-bold shrink-0">
            <button
              type="button"
              onClick={() => setActiveView('martyr_centric')}
              className={`min-h-[40px] px-4 py-2 rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${
                activeView === 'martyr_centric'
                  ? 'bg-[#6B3E26] text-white shadow-2xs'
                  : 'text-[#5C4033] hover:text-[#332218]'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>بر پایه نام شهید (شهید ← کتاب)</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-black/15 tabular-nums">
                {toPersianDigits(filteredMartyrRows.length)}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('book_centric')}
              className={`min-h-[40px] px-4 py-2 rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${
                activeView === 'book_centric'
                  ? 'bg-[#6B3E26] text-white shadow-2xs'
                  : 'text-[#5C4033] hover:text-[#332218]'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>بر پایه عنوان کتاب (کتاب ← شهدا)</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-black/15 tabular-nums">
                {toPersianDigits(filteredBookRows.length)}
              </span>
            </button>
          </div>

          {/* Quick Filter Buttons for قطعات شهدا sheets */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setSourceSheetFilter('all')}
              className={`px-3 py-1.5 rounded-lg border font-bold transition-colors cursor-pointer ${
                sourceSheetFilter === 'all'
                  ? 'bg-[#6B3E26] text-white border-[#6B3E26]'
                  : 'bg-[#FAF5EE] text-[#5C4033] border-[#E2D2BE] hover:bg-[#F3E9DC]'
              }`}
            >
              همه پیوندها ({toPersianDigits(allMartyrRows.length)})
            </button>
            <button
              type="button"
              onClick={() => setSourceSheetFilter('ghatat_one')}
              className={`px-3 py-1.5 rounded-lg border font-bold transition-colors cursor-pointer ${
                sourceSheetFilter === 'ghatat_one'
                  ? 'bg-[#6B3E26] text-white border-[#6B3E26]'
                  : 'bg-[#FAF5EE] text-[#5C4033] border-[#E2D2BE] hover:bg-[#F3E9DC]'
              }`}
            >
              قطعات شهدا: یک شهید ({toPersianDigits(stats.ghatatOneCount)})
            </button>
            <button
              type="button"
              onClick={() => setSourceSheetFilter('ghatat_multi')}
              className={`px-3 py-1.5 rounded-lg border font-bold transition-colors cursor-pointer ${
                sourceSheetFilter === 'ghatat_multi'
                  ? 'bg-[#6B3E26] text-white border-[#6B3E26]'
                  : 'bg-[#FAF5EE] text-[#5C4033] border-[#E2D2BE] hover:bg-[#F3E9DC]'
              }`}
            >
              قطعات شهدا: چند شهید ({toPersianDigits(stats.ghatatMultiCount)})
            </button>
            <button
              type="button"
              onClick={() => setSourceSheetFilter('sooreh')}
              className={`px-3 py-1.5 rounded-lg border font-bold transition-colors cursor-pointer ${
                sourceSheetFilter === 'sooreh'
                  ? 'bg-[#6B3E26] text-white border-[#6B3E26]'
                  : 'bg-[#FAF5EE] text-[#5C4033] border-[#E2D2BE] hover:bg-[#F3E9DC]'
              }`}
            >
              پژوهش سوره مهر ({toPersianDigits(allMartyrRows.length - stats.ghatatOneCount - stats.ghatatMultiCount)})
            </button>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-1 text-xs">
          <div className="sm:col-span-6 relative">
            <Search className="w-4 h-4 text-[#78604E] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeView === 'martyr_centric'
                  ? 'جست‌وجوی نام شهید، قطعه مزار، عنوان کتاب (مثلاً آخرین نامه، با مرام) یا ناشر...'
                  : 'جست‌وجوی عنوان کتاب، نویسنده، ناشر یا اسامی شهدا...'
              }
              className="w-full min-h-[40px] pr-10 pl-3 py-2 bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl focus:bg-white focus:outline-none focus:border-[#6B3E26]"
            />
          </div>

          <div className="sm:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as DepositoryStatusFilter)}
              className="w-full min-h-[40px] px-3 py-2 bg-white border border-[#E2D2BE] rounded-xl text-[#332218] font-medium"
            >
              <option value="all">
                همه پیوندهای دارای نام شهید ({toPersianDigits(stats.totalLinks)})
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

          <div className="sm:col-span-3 flex items-center gap-2">
            {activeView === 'martyr_centric' ? (
              <button
                type="button"
                onClick={handleExportMartyrExcel}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[#2E6F40] hover:bg-[#235632] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>اکسل بر پایه نام شهید</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleExportBookExcel}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[#2E6F40] hover:bg-[#235632] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>اکسل بر پایه کتاب‌ها</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Live Data Depository Table Preview */}
      <div className="bg-white border border-[#E2D2BE] rounded-2xl overflow-hidden shadow-2xs">
        <div className="p-3.5 bg-[#FAF5EE] border-b border-[#E2D2BE] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="font-bold text-[#332218] flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#6B3E26]" />
            <span>
              فهرست ارتباطات کتاب و شهید (
              {activeView === 'martyr_centric'
                ? `${toPersianDigits(filteredMartyrRows.length)} رکورد شهید–کتاب`
                : `${toPersianDigits(filteredBookRows.length)} عنوان کتاب متصل به شهدا`}
              )
            </span>
          </div>
          <div className="text-[11px] text-[#78604E]">
            شامل شیت‌های «یک شهید» و «چند شهید» از اکسل قطعات شهدا و پژوهش سوره مهر
          </div>
        </div>

        {/* View 1: Martyr-Centric Table */}
        {activeView === 'martyr_centric' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right border-collapse">
              <thead>
                <tr className="bg-[#F6EFE6] text-[#332218] border-b border-[#E2D2BE] font-bold">
                  <th className="py-2.5 px-3 w-12 text-center">ردیف</th>
                  <th className="py-2.5 px-3 min-w-[140px]">نام و نام خانوادگی شهید</th>
                  <th className="py-2.5 px-3 min-w-[100px]">قطعه / ردیف / شماره</th>
                  <th className="py-2.5 px-3 min-w-[180px]">عنوان کتاب مرتبط</th>
                  <th className="py-2.5 px-3 min-w-[120px]">انتشارات</th>
                  <th className="py-2.5 px-3 min-w-[160px]">توضیحات کتاب در منبع</th>
                  <th className="py-2.5 px-3 min-w-[90px]">ارجاع صفحه</th>
                  <th className="py-2.5 px-3 min-w-[110px]">شیت منبع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFE4D6]">
                {filteredMartyrRows.slice(0, 60).map((row, idx) => (
                  <tr key={row.id} className="hover:bg-[#FAF5EE] transition-colors">
                    <td className="py-2.5 px-3 text-center text-[#78604E] font-mono">
                      {toPersianDigits(idx + 1)}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-[#332218]">
                      {row.martyrName}
                    </td>
                    <td className="py-2.5 px-3 text-[#5C4033] tabular-nums">
                      قطعه {toPersianDigits(row.gravePiece)}
                      {row.graveRow !== '—' && ` · ر.${toPersianDigits(row.graveRow)}`}
                      {row.graveNumber !== '—' && ` · ش.${toPersianDigits(row.graveNumber)}`}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-[#6B3E26]">
                      {row.bookTitle}{' '}
                      <span className="font-mono text-[10.5px] text-[#78604E] font-normal" dir="ltr">
                        ({row.bookId})
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[#5C4033]">{row.publisher}</td>
                    <td className="py-2.5 px-3 text-[#332218] leading-snug">{row.relationSubject}</td>
                    <td className="py-2.5 px-3 text-[#332218] font-mono text-[11px] tabular-nums">
                      {toPersianDigits(row.pageReference)}
                    </td>
                    <td className="py-2.5 px-3 text-[#78604E] text-[11px]">
                      {row.sourceSheet === 'یک شهید'
                        ? 'قطعات شهدا (یک شهید)'
                        : row.sourceSheet === 'چند شهید'
                        ? 'قطعات شهدا (چند شهید)'
                        : 'سوره مهر'}
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

            {filteredMartyrRows.length > 60 && (
              <div className="p-3 text-center bg-[#FAF5EE] border-t border-[#E2D2BE] text-xs text-[#78604E]">
                نمایش ۶۰ رکورد نخست از میان {toPersianDigits(filteredMartyrRows.length)} رکورد. برای
                مشاهده یکجای همه رکوردها دکمه «اکسل بر پایه نام شهید» را بزنید.
              </div>
            )}
          </div>
        ) : (
          /* View 2: Book-Centric Table */
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right border-collapse">
              <thead>
                <tr className="bg-[#F6EFE6] text-[#332218] border-b border-[#E2D2BE] font-bold">
                  <th className="py-2.5 px-3 w-12 text-center">ردیف</th>
                  <th className="py-2.5 px-3 min-w-[80px]">کد مخزن</th>
                  <th className="py-2.5 px-3 min-w-[200px]">عنوان کتاب</th>
                  <th className="py-2.5 px-3 min-w-[120px]">نویسنده / ناشر</th>
                  <th className="py-2.5 px-3 min-w-[110px]">موقعیت قفسه</th>
                  <th className="py-2.5 px-3 min-w-[100px] text-center">تعداد شهدا</th>
                  <th className="py-2.5 px-3 min-w-[280px]">شهدای مرتبط (نام، قطعه و صفحه)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFE4D6]">
                {filteredBookRows.slice(0, 60).map((row, idx) => (
                  <tr key={row.bookId} className="hover:bg-[#FAF5EE] transition-colors">
                    <td className="py-2.5 px-3 text-center text-[#78604E] font-mono">
                      {toPersianDigits(idx + 1)}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-[#6B3E26]" dir="ltr">
                      {row.bookId}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-[#332218]">{row.bookTitle}</td>
                    <td className="py-2.5 px-3 text-[#5C4033]">
                      <div>{row.author}</div>
                      <div className="text-[10.5px] text-[#78604E]">{row.publisher}</div>
                    </td>
                    <td className="py-2.5 px-3 text-[#5C4033] font-mono text-[11px]">
                      {row.locationCode}
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold text-[#6B3E26] tabular-nums">
                      {toPersianDigits(row.linkedMartyrsCount)} شهید
                    </td>
                    <td className="py-2.5 px-3 text-[#332218] leading-relaxed">
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

            {filteredBookRows.length > 60 && (
              <div className="p-3 text-center bg-[#FAF5EE] border-t border-[#E2D2BE] text-xs text-[#78604E]">
                نمایش ۶۰ عنوان نخست از میان {toPersianDigits(filteredBookRows.length)} عنوان کتاب.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
