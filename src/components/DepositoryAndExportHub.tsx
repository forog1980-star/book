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
  BookMartyrLinkRecord,
  ExtractedContentItem,
  PendingReviewItem,
  ReferenceCatalogRow,
  WorkbookGolzarMartyr,
  normalizePersianText,
  toPersianDigits
} from '../data/markazAsnadData';

interface DepositoryAndExportHubProps {
  catalogRows: ReferenceCatalogRow[];
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
  links,
  pendingReviews,
  workbookMartyrs = [],
  extractedItems,
  onNotify,
  onJumpToSmartSearch
}) => {
  const [activeView, setActiveView] = useState<'martyr_centric' | 'book_centric'>('martyr_centric');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified_only' | 'with_pages_only'>('all');
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

  // 1. Consolidated Martyr-centric rows (All resolved / determined links)
  const allMartyrRows = useMemo<ResolvedMartyrExportItem[]>(() => {
    const rows: ResolvedMartyrExportItem[] = [];

    // From verified / active links
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
        pageReference: l.pageReferenceRaw && l.pageReferenceRaw !== '-' ? l.pageReferenceRaw : 'ثبت کارشناسی',
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
        martyrs: { name: string; piece: string; page: string }[];
        verifiedCount: number;
      }
    >();

    allMartyrRows.forEach((m) => {
      const entry = bookToMartyrs.get(m.bookId) || { martyrs: [], verifiedCount: 0 };
      entry.martyrs.push({
        name: m.martyrName,
        piece: m.gravePiece,
        page: m.pageReference
      });
      if (m.reviewStatus.includes('تأیید')) {
        entry.verifiedCount += 1;
      }
      bookToMartyrs.set(m.bookId, entry);
    });

    const rows: ResolvedBookExportItem[] = [];

    bookToMartyrs.forEach((data, bookId) => {
      const bObj = catalogMap.get(bookId);
      const title = bObj?.titleRaw || (allMartyrRows.find((m) => m.bookId === bookId)?.bookTitle ?? bookId);
      const author = bObj?.authorRaw || '—';
      const publisher = bObj?.publisherRaw || '—';
      const year = bObj?.yearRaw || '—';
      const category = bObj?.categoryRaw || 'ادبیات پایداری و دفاع مقدس';
      const shelf = bObj?.shelf || 'SH-نامشخص';
      const floor = bObj?.floor || 'T-نامشخص';
      const locationCode = shelf && floor ? `${shelf}-${floor}` : 'ثبت در مخزن';

      const martyrsListSummary = data.martyrs
        .slice(0, 15)
        .map((m) => `${m.name} (ق.${m.piece}${m.page && m.page !== 'ثبت کارشناسی' ? ` - ${m.page}` : ''})`)
        .join('؛ ');

      const pageReferencesSummary = Array.from(
        new Set(data.martyrs.map((m) => m.page).filter((p) => p && p !== 'ثبت کارشناسی'))
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
            : `دارای ${toPersianDigits(data.verifiedCount)} شهید تأییدشده از ${toPersianDigits(
                data.martyrs.length
              )}`,
        extractedPassagesCount: relatedPassages.length
      });
    });

    // Sort by number of linked martyrs descending
    rows.sort((a, b) => b.linkedMartyrsCount - a.linkedMartyrsCount);

    return rows;
  }, [allMartyrRows, catalogMap, extractedItems]);

  // Filtered views based on search & filter
  const filteredMartyrRows = useMemo(() => {
    const q = normalizePersianText(searchQuery);
    return allMartyrRows.filter((r) => {
      if (statusFilter === 'verified_only' && !r.reviewStatus.includes('تأیید')) return false;
      if (statusFilter === 'with_pages_only' && (r.pageReference === 'ثبت کارشناسی' || !r.pageReference))
        return false;

      if (!q) return true;
      const hay = normalizePersianText(
        `${r.id} ${r.martyrName} ${r.bookTitle} ${r.bookId} ${r.publisher} ${r.gravePiece} ${r.relationSubject} ${r.pageReference}`
      );
      return q.split(' ').every((w) => hay.includes(w));
    });
  }, [allMartyrRows, searchQuery, statusFilter]);

  const filteredBookRows = useMemo(() => {
    const q = normalizePersianText(searchQuery);
    return allBookRows.filter((b) => {
      if (statusFilter === 'verified_only' && !b.reviewStatus.includes('تکمیل و تأییدشده')) return false;

      if (!q) return true;
      const hay = normalizePersianText(
        `${b.bookId} ${b.bookTitle} ${b.author} ${b.publisher} ${b.category} ${b.locationCode} ${b.martyrsListSummary}`
      );
      return q.split(' ').every((w) => hay.includes(w));
    });
  }, [allBookRows, searchQuery, statusFilter]);

  // Overall Statistics
  const stats = useMemo(() => {
    const uniqueMartyrNames = new Set(allMartyrRows.map((r) => r.martyrName)).size;
    const verifiedLinksCount = allMartyrRows.filter((r) => r.reviewStatus.includes('تأیید')).length;
    const booksWithLinksCount = allBookRows.length;
    const approvedExtractsCount = extractedItems.filter((e) => e.reviewStatus === 'تأییدشده کارشناسی').length;
    const pendingReviewsCount = pendingReviews.filter((p) => p.trackingStatus === 'باز').length;

    return {
      uniqueMartyrs: uniqueMartyrNames,
      verifiedLinks: verifiedLinksCount,
      totalLinks: allMartyrRows.length,
      booksWithLinks: booksWithLinksCount,
      approvedExtracts: approvedExtractsCount,
      pendingReviews: pendingReviewsCount
    };
  }, [allMartyrRows, allBookRows, extractedItems, pendingReviews]);

  // ================= EXPORT ENGINES =================

  // 1. Export Comprehensive Multi-Sheet Excel (.xlsx)
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
      { 'شاخص': 'کل شهدای تعیین‌تکلیف‌شده در سامانه', 'مقدار': stats.uniqueMartyrs },
      { 'شاخص': 'کل پیوندهای دوسویه ثبت‌شده', 'مقدار': stats.totalLinks },
      { 'شاخص': 'پیوندهای تأییدشده قطعی کارشناسی', 'مقدار': stats.verifiedLinks },
      { 'شاخص': 'کتاب‌های مخزن دارای پیوند شهید', 'مقدار': stats.booksWithLinks },
      { 'شاخص': 'مطالب و استنادات استخراج‌شده تأییدشده', 'مقدار': stats.approvedExtracts },
      { 'شاخص': 'موارد نیازمند پیگیری و بلاتکلیف', 'مقدار': stats.pendingReviews },
      { 'شاخص': 'تاریخ تولید گزارش', 'مقدار': new Intl.DateTimeFormat('fa-IR').format(new Date()) }
    ];

    const wb = XLSX.utils.book_new();

    const wsMartyrs = XLSX.utils.json_to_sheet(martyrData);
    const wsBooks = XLSX.utils.json_to_sheet(bookData);
    const wsExtracts = XLSX.utils.json_to_sheet(extractData);
    const wsStats = XLSX.utils.json_to_sheet(statsData);

    XLSX.utils.book_append_sheet(wb, wsMartyrs, 'شهدای تعیین‌تکلیف‌شده و کتب');
    XLSX.utils.book_append_sheet(wb, wsBooks, 'کتاب‌های متصل و شهدا');
    XLSX.utils.book_append_sheet(wb, wsExtracts, 'مطالب و استنادات استخراج‌شده');
    XLSX.utils.book_append_sheet(wb, wsStats, 'خلاصه آماری دپوی اسناد');

    const fileName = `دپوی-جامع-اسناد-و-پیوندها-${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    onNotify(`بسته اکسل ۴ شیت جامع «${fileName}» با موفقیت دانلود شد.`);
  };

  // 2. Export Martyr-Centric Excel
  const handleExportMartyrExcel = () => {
    const list = exportScope === 'filtered' ? filteredMartyrRows : allMartyrRows;
    const rows = list.map((m, idx) => ({
      'ردیف': idx + 1,
      'شناسه پیوند': m.id,
      'نام و نام خانوادگی شهید': m.martyrName,
      'قطعه مزار': m.gravePiece,
      'ردیف': m.graveRow,
      'شماره مزار': m.graveNumber,
      'شناسه کتاب': m.bookId,
      'عنوان کتاب': m.bookTitle,
      'ناشر / پدیدآورنده': m.publisher,
      'موضوع ارتباط شهید با اثر': m.relationSubject,
      'ارجاع صفحه در اثر': m.pageReference,
      'وضعیت بررسی': m.reviewStatus,
      'یادداشت کارشناس': m.reviewerNote
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'خروجی بر پایه شهدا');
    XLSX.writeFile(wb, `خروجی-پیوندها-بر-پایه-نام-شهید-${new Date().toISOString().slice(0, 10)}.xlsx`);
    onNotify(`فایل اکسل بر پایه نام شهدا شامل ${toPersianDigits(rows.length)} رکورد دانلود شد.`);
  };

  // 3. Export Book-Centric Excel
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

  // 4. Export JSON
  const handleExportJson = () => {
    const payload = {
      generator: 'مرکز اسناد موزه شهدای تهران - سامانه دپوی اسناد',
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

  // 5. Export CSV
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
      {/* Depository Header Banner */}
      <div className="bg-gradient-to-r from-[#173a5a] via-[#1f4e79] to-[#253247] text-white rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/10 text-emerald-300 text-xs font-semibold backdrop-blur-sm">
              <Sparkles className="w-3.5 h-3.5" />
              <span>مرکز دپو و انبار جامع پیوندهای تعیین‌تکلیف‌شده</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight">
              خروجی دوسویه اسناد: ارتباط کتاب به شهید و شهید به کتاب
            </h2>
            <p className="text-xs sm:text-sm text-slate-200 max-w-3xl leading-relaxed">
              تمامی کتاب‌ها و شهدایی که در میز کارشناسی، جست‌وجوی هوشمند، شیت‌های مرجع یا بازبینی‌های میدانی
              تعیین‌تکلیف شده‌اند در این مخزن دپو می‌شوند و امکان استخراج گزارش‌های اکسل (.xlsx)، CSV و JSON برای
              مدیریت، پژوهشگران و پایگاه اطلاع‌رسانی فراهم است.
            </p>
          </div>

          {/* Master Export Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportComprehensiveExcel}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-md transition-all active:scale-95"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>دانلود بسته اکسل جامع (۴ شیت .xlsx)</span>
            </button>

            <button
              type="button"
              onClick={handleExportJson}
              className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs flex items-center gap-1.5 backdrop-blur-sm transition-all"
            >
              <FileJson className="w-4 h-4 text-amber-300" />
              <span>خروجی JSON</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs flex items-center gap-1.5 backdrop-blur-sm transition-all"
            >
              <Download className="w-4 h-4 text-cyan-300" />
              <span>خروجی CSV</span>
            </button>
          </div>
        </div>

        {/* 4 Consolidated Stats Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 text-xs border-t border-white/10">
          <div className="bg-white/10 rounded-xl p-2.5 backdrop-blur-sm">
            <div className="text-slate-300 text-[11px]">شهدای تعیین‌تکلیف‌شده</div>
            <div className="text-lg font-bold tabular-nums text-white mt-0.5">
              {toPersianDigits(stats.uniqueMartyrs)} شهید
            </div>
            <div className="text-[10px] text-emerald-300">متصل به اسناد کتابخانه</div>
          </div>

          <div className="bg-white/10 rounded-xl p-2.5 backdrop-blur-sm">
            <div className="text-slate-300 text-[11px]">کتاب‌های متصل به شهدا</div>
            <div className="text-lg font-bold tabular-nums text-white mt-0.5">
              {toPersianDigits(stats.booksWithLinks)} عنوان کتاب
            </div>
            <div className="text-[10px] text-cyan-300">از ۹۸۰ کتاب مخزن</div>
          </div>

          <div className="bg-white/10 rounded-xl p-2.5 backdrop-blur-sm">
            <div className="text-slate-300 text-[11px]">پیوندهای قطعی تأییدشده</div>
            <div className="text-lg font-bold tabular-nums text-white mt-0.5">
              {toPersianDigits(stats.verifiedLinks)} از {toPersianDigits(stats.totalLinks)}
            </div>
            <div className="text-[10px] text-emerald-300">ارتباط دوسویه ثبت‌شده</div>
          </div>

          <div className="bg-white/10 rounded-xl p-2.5 backdrop-blur-sm">
            <div className="text-slate-300 text-[11px]">مطالب استخراج‌شده مصوب</div>
            <div className="text-lg font-bold tabular-nums text-white mt-0.5">
              {toPersianDigits(stats.approvedExtracts)} قطعه استناد
            </div>
            <div className="text-[10px] text-amber-300">دارای شماره صفحه دقیق</div>
          </div>
        </div>
      </div>

      {/* Main Control & Perspective Switcher Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* 2-Way View Switcher Tabs */}
          <div className="inline-flex p-1 bg-slate-100 rounded-xl text-xs font-bold shrink-0">
            <button
              type="button"
              onClick={() => setActiveView('martyr_centric')}
              className={`min-h-[40px] px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                activeView === 'martyr_centric'
                  ? 'bg-[#1f4e79] text-white shadow-sm'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>خروجی بر پایه نام شهید (محوریت شهید)</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 tabular-nums">
                {toPersianDigits(filteredMartyrRows.length)}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('book_centric')}
              className={`min-h-[40px] px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                activeView === 'book_centric'
                  ? 'bg-[#1f4e79] text-white shadow-sm'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>خروجی بر پایه کتاب‌ها (محوریت کتاب)</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 tabular-nums">
                {toPersianDigits(filteredBookRows.length)}
              </span>
            </button>
          </div>

          {/* Quick Perspective-Specific Export Button */}
          <div className="flex flex-wrap items-center gap-2">
            {activeView === 'martyr_centric' ? (
              <button
                type="button"
                onClick={handleExportMartyrExcel}
                className="min-h-[40px] px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold text-xs flex items-center gap-1.5 transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>دانلود اکسل بر پایه نام شهدا (.xlsx)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleExportBookExcel}
                className="min-h-[40px] px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold text-xs flex items-center gap-1.5 transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>دانلود اکسل بر پایه کتاب‌ها (.xlsx)</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-1 text-xs">
          <div className="sm:col-span-6 relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeView === 'martyr_centric'
                  ? 'جست‌وجوی نام شهید، قطعه مزار، عنوان کتاب، ناشر یا موضوع...'
                  : 'جست‌وجوی عنوان کتاب، نویسنده، ناشر، رده موضوعی یا قفسه...'
              }
              className="w-full min-h-[40px] pr-10 pl-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-[#1f4e79]"
            />
          </div>

          <div className="sm:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full min-h-[40px] px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-700 font-medium"
            >
              <option value="all">همه رکوردهای دپو</option>
              <option value="verified_only">فقط تأییدشده‌های کارشناسی</option>
              {activeView === 'martyr_centric' && (
                <option value="with_pages_only">فقط دارای شماره صفحه دقیق</option>
              )}
            </select>
          </div>

          <div className="sm:col-span-3">
            <select
              value={exportScope}
              onChange={(e) => setExportScope(e.target.value as any)}
              className="w-full min-h-[40px] px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-700 font-medium"
            >
              <option value="filtered">حوزه خروجی: نتایج فیلترشده جاری</option>
              <option value="all">حوزه خروجی: تمام رکوردهای موجود</option>
            </select>
          </div>
        </div>
      </div>

      {/* Live Data Depository Table Preview */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="font-bold text-slate-800 flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#1f4e79]" />
            <span>
              پیش‌نمایش داده‌های دپوشده (
              {activeView === 'martyr_centric'
                ? `${toPersianDigits(filteredMartyrRows.length)} رکورد شهید–کتاب`
                : `${toPersianDigits(filteredBookRows.length)} عنوان کتاب متصل`}
              )
            </span>
          </div>
          <div className="text-[11px] text-slate-500">
            برای گزارش‌دهی به مدیران می‌توانید مستقیماً از دکمه‌های بالای صفحه خروجی اکسل تهیه کنید.
          </div>
        </div>

        {/* View 1: Martyr-Centric Table */}
        {activeView === 'martyr_centric' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold">
                  <th className="py-2.5 px-3 w-12 text-center">ردیف</th>
                  <th className="py-2.5 px-3 min-w-[140px]">نام و نام خانوادگی شهید</th>
                  <th className="py-2.5 px-3 min-w-[90px]">مزار گلزار</th>
                  <th className="py-2.5 px-3 min-w-[180px]">عنوان کتاب مرتبط</th>
                  <th className="py-2.5 px-3 min-w-[100px]">کد مخزن</th>
                  <th className="py-2.5 px-3 min-w-[130px]">ناشر / پدیدآورنده</th>
                  <th className="py-2.5 px-3 min-w-[150px]">موضوع ارتباط با شهید</th>
                  <th className="py-2.5 px-3 min-w-[100px]">ارجاع صفحه</th>
                  <th className="py-2.5 px-3 min-w-[110px]">وضعیت کارشناسی</th>
                  <th className="py-2.5 px-3 min-w-[80px] text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMartyrRows.slice(0, 50).map((row, idx) => (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-3 text-center text-slate-400 font-mono">
                      {toPersianDigits(idx + 1)}
                    </td>
                    <td className="py-2 px-3 font-bold text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <span>{row.martyrName}</span>
                        {row.hasExtractedPassage && (
                          <span
                            className="px-1.5 py-0.2 rounded text-[10px] bg-amber-100 text-amber-800 font-normal"
                            title="دارای متن استخراج‌شده در شیت مطالب"
                          >
                            مطلب
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-slate-600">
                      قطعه {toPersianDigits(row.gravePiece)}
                      {row.graveRow !== '—' && `، ر.${toPersianDigits(row.graveRow)}`}
                      {row.graveNumber !== '—' && `، ش.${toPersianDigits(row.graveNumber)}`}
                    </td>
                    <td className="py-2 px-3 font-semibold text-[#1f4e79]">{row.bookTitle}</td>
                    <td className="py-2 px-3 font-mono text-slate-600" dir="ltr">
                      {row.bookId}
                    </td>
                    <td className="py-2 px-3 text-slate-600">{row.publisher}</td>
                    <td className="py-2 px-3 text-slate-700 leading-snug">{row.relationSubject}</td>
                    <td className="py-2 px-3 text-slate-800 font-mono text-[11px] tabular-nums">
                      {toPersianDigits(row.pageReference)}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                          row.reviewStatus.includes('تأیید')
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {row.reviewStatus}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      {onJumpToSmartSearch && (
                        <button
                          type="button"
                          onClick={() => onJumpToSmartSearch(row.martyrName)}
                          title="بررسی و جست‌وجوی عمیق شهید در برگه ۴"
                          className="p-1 rounded-lg text-slate-400 hover:text-[#1f4e79] hover:bg-slate-100 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredMartyrRows.length === 0 && (
              <div className="p-8 text-center text-slate-500 text-xs">
                موردی با مشخصات جست‌وجوشده در دپوی شهدا یافت نشد.
              </div>
            )}

            {filteredMartyrRows.length > 50 && (
              <div className="p-3 text-center bg-slate-50 border-t border-slate-200 text-xs text-slate-500">
                نمایش ۵۰ رکورد نخست از میان {toPersianDigits(filteredMartyrRows.length)} رکورد دپو شده. برای
                دسترسی به تمامی رکوردها از دکمه‌های «دانلود اکسل» در بالای جدول استفاده فرمایید.
              </div>
            )}
          </div>
        ) : (
          /* View 2: Book-Centric Table */
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold">
                  <th className="py-2.5 px-3 w-12 text-center">ردیف</th>
                  <th className="py-2.5 px-3 min-w-[80px]">کد مخزن</th>
                  <th className="py-2.5 px-3 min-w-[200px]">عنوان کتاب</th>
                  <th className="py-2.5 px-3 min-w-[120px]">نویسنده / ناشر</th>
                  <th className="py-2.5 px-3 min-w-[110px]">موقعیت مخزن</th>
                  <th className="py-2.5 px-3 min-w-[100px] text-center">تعداد شهدا</th>
                  <th className="py-2.5 px-3 min-w-[260px]">شهدای مرتبط و ارجاع صفحه</th>
                  <th className="py-2.5 px-3 min-w-[120px]">وضعیت کارشناسی</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBookRows.slice(0, 50).map((row, idx) => (
                  <tr key={row.bookId} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-3 text-center text-slate-400 font-mono">
                      {toPersianDigits(idx + 1)}
                    </td>
                    <td className="py-2 px-3 font-mono font-bold text-[#1f4e79]" dir="ltr">
                      {row.bookId}
                    </td>
                    <td className="py-2 px-3 font-bold text-slate-900">{row.bookTitle}</td>
                    <td className="py-2 px-3 text-slate-600">
                      <div>{row.author}</div>
                      <div className="text-[10px] text-slate-400">{row.publisher}</div>
                    </td>
                    <td className="py-2 px-3 text-slate-700 font-mono text-[11px]">
                      {row.locationCode}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className="inline-block px-2 py-0.5 rounded-full bg-[#1f4e79]/10 text-[#1f4e79] font-bold">
                        {toPersianDigits(row.linkedMartyrsCount)} شهید
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-700 leading-relaxed">
                      {row.martyrsListSummary}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                          row.reviewStatus.includes('کامل')
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {row.reviewStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredBookRows.length === 0 && (
              <div className="p-8 text-center text-slate-500 text-xs">
                کتابی با مشخصات جست‌وجوشده در دپوی کتب یافت نشد.
              </div>
            )}

            {filteredBookRows.length > 50 && (
              <div className="p-3 text-center bg-slate-50 border-t border-slate-200 text-xs text-slate-500">
                نمایش ۵۰ عنوان نخست از میان {toPersianDigits(filteredBookRows.length)} عنوان دپوشده. برای دریافت
                فهرست کامل، دکمه «دانلود اکسل بر پایه کتاب‌ها» را بفشارید.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
