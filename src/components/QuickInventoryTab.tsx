import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Search,
  Upload,
  CheckCircle2,
  AlertCircle,
  Lock,
  Unlock,
  PlusCircle,
  SlidersHorizontal,
  BookCheck,
  RotateCcw,
  FileSpreadsheet,
  X,
  ChevronDown,
  ChevronUp,
  ArrowDown
} from 'lucide-react';
import {
  BookCopyRecord,
  BookMartyrLinkRecord,
  FieldAuditRecord,
  LEVELS,
  LevelCode,
  PhysicalConditionCode,
  ReferenceCatalogRow,
  SHELVES,
  ShelfCode,
  SUBJECT_CATEGORIES,
  getAllocatedCategoryForSlot,
  normalizePersianText,
  toPersianDigits
} from '../data/markazAsnadData';

interface QuickInventoryTabProps {
  catalogRows: ReferenceCatalogRow[];
  bookMartyrLinks?: BookMartyrLinkRecord[];
  bookCopies?: BookCopyRecord[];
  onAddBookCopy?: (newCopy: BookCopyRecord) => void;
  onMoveBookCopy?: (copyId: string, newShelf: ShelfCode, newLevel: LevelCode, reason: string) => void;
  sheetNames: string[];
  currentSheetName: string;
  headers: string[];
  columnMap: {
    tempIdCol: number;
    titleCol: number;
    publisherCol: number;
    descriptionCol: number;
    categoryCol: number;
    authorCol: number;
    yearCol: number;
  };
  auditRecords: Record<string, FieldAuditRecord>;
  loadedFileName: string;
  onWorkbookLoaded: (
    fileName: string,
    sheetNames: string[],
    selectedSheet: string,
    headers: string[],
    rows: ReferenceCatalogRow[],
    inferredMap: {
      tempIdCol: number;
      titleCol: number;
      publisherCol: number;
      descriptionCol: number;
      categoryCol: number;
      authorCol: number;
      yearCol: number;
    }
  ) => void;
  onSwitchSheet: (sheetName: string) => void;
  onUpdateColumnMap: (newMap: {
    tempIdCol: number;
    titleCol: number;
    publisherCol: number;
    descriptionCol: number;
    categoryCol: number;
    authorCol: number;
    yearCol: number;
  }) => void;
  onSaveAuditRecord: (record: FieldAuditRecord) => void;
  onNotify: (message: string, type?: 'success' | 'warning') => void;
}

export const QuickInventoryTab: React.FC<QuickInventoryTabProps> = ({
  catalogRows,
  bookMartyrLinks = [],
  bookCopies = [],
  onAddBookCopy,
  onMoveBookCopy,
  sheetNames,
  currentSheetName,
  headers,
  columnMap,
  auditRecords,
  loadedFileName,
  onWorkbookLoaded,
  onSwitchSheet,
  onUpdateColumnMap,
  onSaveAuditRecord,
  onNotify
}) => {
  // Search & Advanced Column Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [authorQuery, setAuthorQuery] = useState('');
  const [authorStatusFilter, setAuthorStatusFilter] = useState<'all' | 'has_author' | 'missing_author'>('all');
  const [publisherQuery, setPublisherQuery] = useState('');
  const [publisherFilter, setPublisherFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [shelfFilter, setShelfFilter] = useState<string>('all');
  const [showAdvancedColumnFilters, setShowAdvancedColumnFilters] = useState<boolean>(true);
  const [auditFilter, setAuditFilter] = useState<
    | 'all'
    | 'unaudited'
    | 'audited'
    | 'not_found_in_round'
    | 'incomplete_or_review'
    | 'outside_excel'
    | 'expected_acquisition'
  >('all');
  const [visibleLimit, setVisibleLimit] = useState<number>(50);
  const [showColumnMapper, setShowColumnMapper] = useState(false);
  const [movingCopyId, setMovingCopyId] = useState<string | null>(null);
  const [moveTargetShelf, setMoveTargetShelf] = useState<ShelfCode>('SH-01');
  const [moveTargetLevel, setMoveTargetLevel] = useState<LevelCode>('T02');
  const [moveReason, setMoveReason] = useState('بازچینی قفسه مرکز اسناد');

  // Selected Catalog Row
  const [selectedRow, setSelectedRow] = useState<ReferenceCatalogRow | null>(null);

  // Batch Shelf Lock Mode (قفل قفسه و طبقه برای ثبت سریع پیاپی در یک طبقه)
  const [isShelfLocked, setIsShelfLocked] = useState(false);

  // Form Fields for Physical Audit
  const [categoryValue, setCategoryValue] = useState<string>('');
  const [shelfValue, setShelfValue] = useState<ShelfCode | ''>('');
  const [levelValue, setLevelValue] = useState<LevelCode | ''>('');
  const [physicalStatus, setPhysicalStatus] = useState<'verified' | 'review' | 'not_found'>('verified');
  const [physicalCondition, setPhysicalCondition] = useState<PhysicalConditionCode>('healthy');
  const [copyIdValue, setCopyIdValue] = useState<string>('');
  const [countedCopies, setCountedCopies] = useState<string>('1');
  const [authorOverride, setAuthorOverride] = useState<string>('');
  const [publisherOverride, setPublisherOverride] = useState<string>('');
  const [yearOverride, setYearOverride] = useState<string>('');
  const [isbnOverride, setIsbnOverride] = useState<string>('');
  const [fipaOverride, setFipaOverride] = useState<string>('');
  const [regNoOverride, setRegNoOverride] = useState<string>('');
  const [notesValue, setNotesValue] = useState<string>('');

  // Outside-List Book Entry State (کتابی که در اکسل پیدا نشد)
  const [showOutsideForm, setShowOutsideForm] = useState(false);
  const [outsideTitle, setOutsideTitle] = useState('');
  const [outsideAuthor, setOutsideAuthor] = useState('');
  const [outsidePublisher, setOutsidePublisher] = useState('');
  const [outsideYear, setOutsideYear] = useState('');

  // Helper to infer columns from headers of «فهرست کاری کتابخانه - نسخه 0.1 (1).xlsx»
  const inferColumnsFromHeaders = (hdrs: string[]) => {
    const findIdx = (patterns: RegExp[], fallback = -1) => {
      const idx = hdrs.findIndex((h) => patterns.some((p) => p.test(h)));
      return idx >= 0 ? idx : fallback;
    };
    return {
      tempIdCol: findIdx([/شناسه موقت/, /شناسه کتاب/, /^کد$/], 0),
      titleCol: findIdx([/عنوان کتاب/, /عنوان/, /نام کتاب/, /^کتاب$/], 1),
      publisherCol: findIdx([/ناشر/, /انتشارات/], 2),
      descriptionCol: findIdx([/توضیحات ثبت/, /توضیحات/], 3),
      categoryCol: findIdx([/^دسته$/, /گروه موضوعی/, /موضوع/], 4),
      authorCol: findIdx([/نویسنده/, /گردآورنده/, /مولف/, /مؤلف/], 5),
      yearCol: findIdx([/سال چاپ/, /سال انتشار/, /^سال$/], -1)
    };
  };

  const parseSheetMatrixToRows = (
    sheetName: string,
    matrix: unknown[][],
    map: {
      tempIdCol: number;
      titleCol: number;
      publisherCol: number;
      descriptionCol: number;
      categoryCol: number;
      authorCol: number;
      yearCol: number;
    }
  ): ReferenceCatalogRow[] => {
    if (matrix.length <= 1) return [];
    const hdrs = (matrix[0] || []).map((h, i) => String(h || `ستون ${i + 1}`).trim());
    const resultRows: ReferenceCatalogRow[] = [];

    for (let i = 1; i < matrix.length; i++) {
      const rawRow = matrix[i] || [];
      const values = hdrs.map((_, colIdx) =>
        rawRow[colIdx] !== null && rawRow[colIdx] !== undefined ? String(rawRow[colIdx]).trim() : ''
      );
      if (!values.some((v) => v !== '')) continue;

      const excelRowNumber = i + 1;
      const getVal = (colIdx: number) => (colIdx >= 0 && colIdx < values.length ? values[colIdx] : '');

      resultRows.push({
        rowKey: `${sheetName}::ROW-${excelRowNumber}`,
        rowIndex: excelRowNumber,
        tempBookId: getVal(map.tempIdCol) || `ROW-${excelRowNumber}`,
        titleRaw: getVal(map.titleCol),
        publisherRaw: getVal(map.publisherCol),
        descriptionRaw: getVal(map.descriptionCol),
        categoryRaw: getVal(map.categoryCol),
        authorRaw: getVal(map.authorCol),
        isbnRaw: values[6] || '',
        fipaRaw: values[7] || '',
        registrationNoRaw: values[8] || '',
        locationRaw: values[9] || '',
        countedCopiesRaw: values[10] || '',
        reviewStatusRaw: values[11] || 'بررسی‌نشده',
        noteRaw: values[12] || '',
        backupSourceSheet: values[13] || sheetName,
        backupSourceRow: values[14] || String(excelRowNumber),
        allValues: values
      });
    }
    return resultRows;
  };

  // Handle Excel (.xlsx/.xls/.csv) or JSON (فهرست-کاری-کتابخانه-نسخه-0.1.json) file selection
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.name.toLowerCase().endsWith('.json')) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (parsed?.format === 'markaz-asnad-library-workbook-json' && Array.isArray(parsed.sheets)) {
          const sNames = parsed.sheets.map((s: { name: string }) => s.name);
          const targetSheet =
            parsed.sheets.find((s: { name: string }) =>
              /فهرست کتاب|عنوان.*کتاب|کتاب‌ها/.test(s.name)
            ) || parsed.sheets[0];

          const matrix: unknown[][] = targetSheet.rows || [];
          const hdrs = (matrix[0] || []).map((h: unknown, i: number) =>
            String(h || `ستون ${i + 1}`).trim()
          );
          const inferred = inferColumnsFromHeaders(hdrs);
          const rows = parseSheetMatrixToRows(targetSheet.name, matrix, inferred);

          onWorkbookLoaded(file.name, sNames, targetSheet.name, hdrs, rows, inferred);
          onNotify(
            `فایل JSON مرجع «${file.name}» خوانده شد — شیت «${targetSheet.name}» با ${toPersianDigits(
              rows.length
            )} رکورد کتاب آماده جست‌وجو است.`
          );
          return;
        }
      }

      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sNames = wb.SheetNames;
      const likelySheet =
        sNames.find((n) => /فهرست کتاب|عنوان.*کتاب|کتاب‌ها/.test(n)) || sNames[0];

      const ws = wb.Sheets[likelySheet];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        defval: '',
        raw: false
      });

      if (!matrix.length) {
        onNotify('شیت انتخاب‌شده خالی است.', 'warning');
        return;
      }

      const hdrs = (matrix[0] || []).map((h, i) => String(h || `ستون ${i + 1}`).trim());
      const inferred = inferColumnsFromHeaders(hdrs);
      const rows = parseSheetMatrixToRows(likelySheet, matrix, inferred);

      (window as unknown as { __MARKAZ_WORKBOOK__?: XLSX.WorkBook }).__MARKAZ_WORKBOOK__ = wb;

      onWorkbookLoaded(file.name, sNames, likelySheet, hdrs, rows, inferred);
      onNotify(
        `فایل «${file.name}» در مرورگر بارگذاری شد — شیت «${likelySheet}» (${toPersianDigits(
          rows.length
        )} ردیف). فایل مرجع دست‌نخورده باقی می‌ماند.`
      );
    } catch (err) {
      onNotify(
        `خطا در خواندن فایل: ${err instanceof Error ? err.message : 'ساختار نامعتبر'}`,
        'warning'
      );
    } finally {
      e.target.value = '';
    }
  };

  // Select a row from search results
  const handleSelectRow = (row: ReferenceCatalogRow) => {
    setSelectedRow(row);
    const existing = auditRecords[row.rowKey];
    const autoCopyId = `CP-${String(row.rowIndex - 1).padStart(6, '0')}`;

    if (existing) {
      setCategoryValue(existing.category);
      setShelfValue(existing.shelf);
      setLevelValue(existing.level);
      setPhysicalStatus(existing.physical);
      setPhysicalCondition(existing.physicalCondition || 'healthy');
      setCopyIdValue(existing.copyId || autoCopyId);
      setCountedCopies(existing.countedCopies || '1');
      setAuthorOverride(existing.author || row.authorRaw || '');
      setPublisherOverride(existing.publisher || row.publisherRaw || '');
      setYearOverride(existing.year || '');
      setIsbnOverride(existing.isbn || row.isbnRaw || '');
      setFipaOverride(existing.fipa || row.fipaRaw || '');
      setRegNoOverride(existing.registrationNo || row.registrationNoRaw || '');
      setNotesValue(existing.notes || '');
    } else {
      // If Shelf Lock Mode is NOT active, populate from row or reset
      if (!isShelfLocked) {
        const matchedCat = SUBJECT_CATEGORIES.find((c) => c.code === row.categoryRaw);
        setCategoryValue(matchedCat ? matchedCat.label : '');
        setShelfValue('');
        setLevelValue('');
      }
      setPhysicalStatus('verified');
      setPhysicalCondition('healthy');
      setCopyIdValue(autoCopyId);
      setCountedCopies(row.countedCopiesRaw || '1');
      setAuthorOverride(row.authorRaw || '');
      setPublisherOverride(row.publisherRaw || '');
      setYearOverride('');
      setIsbnOverride(row.isbnRaw || '');
      setFipaOverride(row.fipaRaw || '');
      setRegNoOverride(row.registrationNoRaw || '');
      setNotesValue(row.noteRaw || '');
    }
  };

  // Smart Category Selection: Suggests approved shelf/level if not yet chosen
  const handleCategoryTap = (catLabel: string, catCode: string) => {
    setCategoryValue(catLabel);
    if (!isShelfLocked) {
      const meta = SUBJECT_CATEGORIES.find((c) => c.code === catCode);
      if (meta && meta.defaultShelf) {
        if (!shelfValue) setShelfValue(meta.defaultShelf);
        if (!levelValue && meta.defaultLevels.length === 1) {
          setLevelValue(meta.defaultLevels[0]);
        }
      }
    }
  };

  // Smart Shelf & Level Selection: Suggests category if empty
  const handleSlotTap = (shelf: ShelfCode, level: LevelCode) => {
    setShelfValue(shelf);
    setLevelValue(level);
    if (!categoryValue) {
      const alloc = getAllocatedCategoryForSlot(shelf, level);
      if (alloc.categoryCode !== 'FREE' && alloc.categoryCode !== 'UNSET') {
        const found = SUBJECT_CATEGORIES.find((c) => c.code === alloc.categoryCode);
        if (found) setCategoryValue(found.label);
      }
    }
  };

  // Unique Publishers with counts across the 980 books
  const uniquePublishers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of catalogRows) {
      const pub = (r.publisherRaw || 'نامشخص').trim();
      counts.set(pub, (counts.get(pub) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [catalogRows]);

  // Linked martyrs for the currently selected book
  const selectedBookMartyrLinks = useMemo(() => {
    if (!selectedRow) return [];
    const normTitle = normalizePersianText(selectedRow.titleRaw);
    return bookMartyrLinks.filter(
      (lnk) =>
        lnk.tempBookId === selectedRow.tempBookId ||
        (normTitle && normalizePersianText(lnk.bookTitleRaw) === normTitle)
    );
  }, [selectedRow, bookMartyrLinks]);

  // Category counts across the catalog + saved records
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = { all: catalogRows.length };
    for (const cat of SUBJECT_CATEGORIES) {
      map[cat.code] = 0;
    }
    for (const r of catalogRows) {
      const savedRec = auditRecords[r.rowKey];
      const effectiveCat = savedRec
        ? savedRec.category.split(' ')[0]
        : r.categoryRaw?.trim() || 'UNSET';
      map[effectiveCat] = (map[effectiveCat] || 0) + 1;
    }
    return map;
  }, [catalogRows, auditRecords]);

  // Convert outside-list records into catalog format so they can be filtered, selected and exported
  const outsideCatalogRows: ReferenceCatalogRow[] = useMemo(() => {
    return Object.values(auditRecords)
      .filter((r) => r.source === 'outside-list')
      .map((r, i) => ({
        rowKey: r.key,
        rowIndex: 10000 + i,
        tempBookId: r.tempBookId || `OUT-${i + 1}`,
        titleRaw: r.title,
        publisherRaw: r.publisher || '',
        descriptionRaw: r.notes || '',
        categoryRaw: r.category || '',
        authorRaw: r.author || '',
        isbnRaw: '',
        fipaRaw: '',
        registrationNoRaw: '',
        locationRaw: r.location || '',
        countedCopiesRaw: r.countedCopies || '1',
        reviewStatusRaw: 'مشاهده‌شده در قفسه (خارج از فهرست)',
        noteRaw: r.notes || '',
        backupSourceSheet: 'کتاب‌های خارج از فهرست',
        backupSourceRow: String(i + 1),
        allValues: [r.tempBookId, r.title, r.publisher, r.notes, r.category, r.author]
      }));
  }, [auditRecords]);

  // Source rows pool depending on auditFilter
  const sourceRowsPool = useMemo(() => {
    if (auditFilter === 'outside_excel') {
      return outsideCatalogRows;
    }
    return catalogRows;
  }, [catalogRows, outsideCatalogRows, auditFilter]);

  // Filtered Catalog Rows (All matches + sliced for fast mobile rendering)
  const allMatchingRows = useMemo(() => {
    const q = normalizePersianText(searchQuery);
    const authQ = normalizePersianText(authorQuery);
    const pubQ = normalizePersianText(publisherQuery);

    return sourceRowsPool.filter((r) => {
      const savedRec = auditRecords[r.rowKey];
      const isAudited = Boolean(savedRec);
      if (auditFilter === 'audited' && (!isAudited || savedRec?.physical !== 'verified')) return false;
      if (auditFilter === 'unaudited' && isAudited) return false;
      if (auditFilter === 'not_found_in_round' && savedRec?.physical !== 'not_found') return false;
      if (auditFilter === 'incomplete_or_review') {
        const isMissingFields =
          !r.authorRaw?.trim() ||
          !r.publisherRaw?.trim() ||
          !r.categoryRaw?.trim() ||
          r.categoryRaw === 'UNSET';
        const isMarkedReview = savedRec?.physical === 'review' || r.reviewStatusRaw?.includes('بررسی');
        if (!isMissingFields && !isMarkedReview) return false;
      }
      if (auditFilter === 'outside_excel') {
        // Already loaded from outsideCatalogRows!
      }
      if (auditFilter === 'expected_acquisition') return false;

      // 1. Publisher Filter (Dropdown + Text)
      const effectivePublisher = (savedRec?.publisher || r.publisherRaw || 'نامشخص').trim();
      if (publisherFilter !== 'all' && effectivePublisher !== publisherFilter) {
        return false;
      }
      if (pubQ) {
        const pubNorm = normalizePersianText(effectivePublisher);
        if (!pubQ.split(' ').every((w) => pubNorm.includes(w))) return false;
      }

      // 2. Author / Compiler Filter (Text + Status)
      const effectiveAuthor = (savedRec?.author || r.authorRaw || '').trim();
      const authorAndDesc = `${effectiveAuthor} ${r.descriptionRaw || ''}`.trim();
      if (authorStatusFilter === 'has_author' && !effectiveAuthor) return false;
      if (authorStatusFilter === 'missing_author' && Boolean(effectiveAuthor)) return false;
      if (authQ) {
        const authNorm = normalizePersianText(authorAndDesc);
        if (!authQ.split(' ').every((w) => authNorm.includes(w))) return false;
      }

      // 3. Subject Category Filter
      if (categoryFilter !== 'all') {
        const effectiveCat = savedRec
          ? savedRec.category.split(' ')[0]
          : r.categoryRaw?.trim() || 'UNSET';
        if (effectiveCat !== categoryFilter) return false;
      }

      // 4. Shelf Filter
      if (shelfFilter !== 'all') {
        const effectiveLoc = savedRec?.location || r.locationRaw || '';
        if (!effectiveLoc.startsWith(shelfFilter)) return false;
      }

      // 5. General / Title / ID Query
      if (!q) return true;
      const haystack = normalizePersianText(
        `${r.tempBookId} ${r.titleRaw} ${effectivePublisher} ${r.descriptionRaw} ${effectiveAuthor}`
      );
      return q.split(' ').every((word) => haystack.includes(word));
    });
  }, [
    sourceRowsPool,
    searchQuery,
    authorQuery,
    authorStatusFilter,
    publisherQuery,
    publisherFilter,
    categoryFilter,
    shelfFilter,
    auditFilter,
    auditRecords
  ]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim()) count++;
    if (authorQuery.trim()) count++;
    if (authorStatusFilter !== 'all') count++;
    if (publisherQuery.trim()) count++;
    if (publisherFilter !== 'all') count++;
    if (categoryFilter !== 'all') count++;
    if (shelfFilter !== 'all') count++;
    if (auditFilter !== 'all') count++;
    return count;
  }, [
    searchQuery,
    authorQuery,
    authorStatusFilter,
    publisherQuery,
    publisherFilter,
    categoryFilter,
    shelfFilter,
    auditFilter
  ]);

  const handleResetAllFilters = () => {
    setSearchQuery('');
    setAuthorQuery('');
    setAuthorStatusFilter('all');
    setPublisherQuery('');
    setPublisherFilter('all');
    setCategoryFilter('all');
    setShelfFilter('all');
    setAuditFilter('all');
    setSelectedRow(null);
    setVisibleLimit(50);
    onNotify('تمامی فیلترها و کادرهای جست‌وجو پاک شدند؛ فرم برای جست‌وجوی جدید آماده است.');
  };

  const handleExecuteSearch = () => {
    if (filteredRows.length > 0) {
      handleSelectRow(filteredRows[0]);
      onNotify(`${toPersianDigits(allMatchingRows.length)} کتاب یافت شد؛ «${filteredRows[0].titleRaw}» انتخاب شد.`);
    } else if (searchQuery.trim()) {
      setOutsideTitle(searchQuery.trim());
      setShowOutsideForm(true);
      onNotify('کتابی در فهرست مرجع پیدا نشد؛ فرم ثبت خارج از فهرست باز شد.', 'warning');
    } else {
      onNotify('لطفاً نام کتاب یا نویسنده را برای جست‌وجو وارد کنید.', 'warning');
    }
  };

  // Export current filter results to Excel with current Shamsi date
  const handleExportCurrentFilterExcel = () => {
    if (allMatchingRows.length === 0) {
      onNotify('هیچ کتابی در فهرست فیلترشده جاری برای خروجی اکسل وجود ندارد.', 'warning');
      return;
    }

    let dateStr = '';
    try {
      dateStr = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date()).replace(/\//g, '-');
    } catch {
      dateStr = new Date().toISOString().slice(0, 10);
    }

    let reportTitle = 'گزارش-موجودی-کتابخانه';
    if (auditFilter === 'audited') reportTitle = 'کتاب‌های-تأییدشده-قفسه';
    else if (auditFilter === 'outside_excel') reportTitle = 'کتاب‌های-خارج-از-فهرست-اکسل';
    else if (auditFilter === 'incomplete_or_review') reportTitle = 'کتاب‌های-دارای-اطلاعات-ناقص';
    else if (auditFilter === 'unaudited') reportTitle = 'کتاب‌های-بررسی‌نشده-قفسه';
    else if (auditFilter === 'not_found_in_round') reportTitle = 'کتاب‌های-پیدانشده-در-نوبت-بررسی';
    else if (searchQuery.trim()) reportTitle = `جست‌وجوی-${searchQuery.trim().slice(0, 15).replace(/\s+/g, '_')}`;

    const excelRows = allMatchingRows.map((r, idx) => {
      const rec = auditRecords[r.rowKey];
      const normTitle = normalizePersianText(r.titleRaw);
      const linkedMartyrs = bookMartyrLinks
        .filter(
          (lnk) =>
            lnk.tempBookId === r.tempBookId ||
            (normTitle && normalizePersianText(lnk.bookTitleRaw) === normTitle)
        )
        .map((l) => l.martyrNameRaw)
        .filter(Boolean)
        .join(' · ');

      return {
        'ردیف': idx + 1,
        'شناسه موقت کتاب': r.tempBookId,
        'عنوان کتاب': r.titleRaw,
        'نویسنده / گردآورنده': rec?.author || r.authorRaw || '',
        'ناشر': rec?.publisher || r.publisherRaw || '',
        'سال چاپ': rec?.year || '',
        'گروه موضوعی': rec?.category || r.categoryRaw || '',
        'قفسه و طبقه (SH-xx-Txx)': rec?.location || r.locationRaw || '',
        'وضعیت مشاهده در قفسه':
          rec?.physical === 'verified'
            ? 'تأییدشده در قفسه'
            : rec?.physical === 'review'
            ? 'نیازمند بررسی'
            : rec?.physical === 'not_found'
            ? 'پیدا نشده'
            : 'بررسی‌نشده',
        'تعداد نسخه موجود': rec?.countedCopies || r.countedCopiesRaw || '1',
        'شهدای مرتبط': linkedMartyrs || '—',
        'یادداشت و توضیحات': rec?.notes || r.noteRaw || r.descriptionRaw || '',
        'منبع رکورد': r.backupSourceSheet || currentSheetName,
        'تاریخ استخراج': dateStr
      };
    });

    const ws = XLSX.utils.json_to_sheet(excelRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, reportTitle.slice(0, 31));
    const fileName = `${reportTitle}-${dateStr}.xlsx`;
    XLSX.writeFile(wb, fileName);
    onNotify(
      `فایل اکسل «${fileName}» شامل ${toPersianDigits(excelRows.length)} کتاب با تاریخ روز (${dateStr}) دانلود شد.`
    );
  };

  const filteredRows = useMemo(
    () => allMatchingRows.slice(0, visibleLimit),
    [allMatchingRows, visibleLimit]
  );

  // Core Save Catalog Book Record (reusable for both inline quick drawer and Section 3 form)
  const handleSaveCatalogBookRecord = (
    targetRow: ReferenceCatalogRow,
    advanceToNextRow?: ReferenceCatalogRow
  ): boolean => {
    if (!categoryValue) {
      onNotify(
        'گروه موضوعی (R/A/H/P/K/M) را انتخاب کنید؛ اگر نامشخص است «نیازمند تعیین موضوع» را بزنید.',
        'warning'
      );
      return false;
    }
    if (physicalStatus === 'verified' && (!shelfValue || !levelValue)) {
      onNotify(
        'برای کتابی که وضعیت آن «دیده شد و ثبت شد» است، انتخاب قفسه (SH-01..04) و طبقه (T01..06) الزامی است.',
        'warning'
      );
      return false;
    }

    const locationCode = shelfValue && levelValue ? `${shelfValue}-${levelValue}` : '';
    const autoCopyId = copyIdValue.trim() || `CP-${String(targetRow.rowIndex - 1).padStart(6, '0')}`;

    const record: FieldAuditRecord = {
      key: targetRow.rowKey,
      source: 'catalog',
      sheet: currentSheetName,
      tempBookId: targetRow.tempBookId,
      copyId: autoCopyId,
      title: targetRow.titleRaw,
      author: authorOverride.trim() || targetRow.authorRaw,
      publisher: publisherOverride.trim() || targetRow.publisherRaw,
      year: yearOverride.trim(),
      isbn: isbnOverride.trim() || targetRow.isbnRaw,
      fipa: fipaOverride.trim() || targetRow.fipaRaw,
      registrationNo: regNoOverride.trim() || targetRow.registrationNoRaw,
      descriptionRaw: targetRow.descriptionRaw,
      category: categoryValue,
      shelf: shelfValue,
      level: levelValue,
      location: locationCode,
      physical: physicalStatus,
      copyStatus:
        physicalStatus === 'verified'
          ? 'verified_present'
          : physicalStatus === 'review'
          ? 'pending_review'
          : 'missing',
      physicalCondition,
      countedCopies: countedCopies.trim() || '1',
      notes: notesValue.trim(),
      backupSourceSheet: targetRow.backupSourceSheet,
      backupSourceRow: targetRow.backupSourceRow,
      updatedAt: new Date().toISOString()
    };

    onSaveAuditRecord(record);

    if (advanceToNextRow) {
      onNotify(
        `✓ کتاب «${targetRow.titleRaw}» (${autoCopyId}) با موفقیت ثبت شد. کتاب بعدی آماده شد.`
      );
      // Immediately open next book
      handleSelectRow(advanceToNextRow);
      // Smoothly bring next book into view
      setTimeout(() => {
        const nextElem = document.getElementById(`book-item-${advanceToNextRow.rowKey}`);
        if (nextElem) {
          nextElem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 70);
    } else {
      onNotify(
        `ثبت ذخیره شد: «${targetRow.titleRaw}» (${autoCopyId}) در محل ${locationCode || 'بدون محل'} (${categoryValue})`
      );
      setSelectedRow(null);
      setNotesValue('');
      setAuthorOverride('');
      setPublisherOverride('');
      setYearOverride('');
      setIsbnOverride('');
      setFipaOverride('');
      setRegNoOverride('');
      setCopyIdValue('');
      setCountedCopies('1');
      if (!isShelfLocked) {
        setCategoryValue('');
        setShelfValue('');
        setLevelValue('');
      }
    }
    return true;
  };

  // Save Catalog Book Audit (from Section 3 form submit)
  const handleSaveCatalogBook = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRow) {
      onNotify('ابتدا یک کتاب را از فهرست بالا انتخاب کنید.', 'warning');
      return;
    }
    handleSaveCatalogBookRecord(selectedRow);
  };

  // Save Outside-List Book (کتابی که در قفسه دیده شده ولی در اکسل مرجع نیست)
  const handleSaveOutsideBook = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = outsideTitle.trim();
    if (!cleanTitle) {
      onNotify('عنوان روی جلد کتاب را وارد کنید.', 'warning');
      return;
    }
    if (!categoryValue) {
      onNotify('گروه موضوعی را در بخش شماره ۳ انتخاب کنید.', 'warning');
      return;
    }
    if (!shelfValue || !levelValue) {
      onNotify('برای کتاب مشاهده‌شده در قفسه، قفسه و طبقه واقعی را انتخاب کنید.', 'warning');
      return;
    }

    const randomSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const recordKey = `OUT-${Date.now()}-${randomSuffix}`;
    const outsideIdx =
      Object.values(auditRecords).filter((r) => r.source === 'outside-list').length + 1;
    const tempId = `TMP-OUT-${outsideIdx}`;
    const locationCode = `${shelfValue}-${levelValue}`;

    const record: FieldAuditRecord = {
      key: recordKey,
      source: 'outside-list',
      sheet: currentSheetName || 'خارج از فهرست مرجع',
      tempBookId: tempId,
      copyId: `CP-OUT-${String(outsideIdx).padStart(4, '0')}`,
      title: cleanTitle,
      author: outsideAuthor.trim(),
      publisher: outsidePublisher.trim(),
      year: outsideYear.trim(),
      category: categoryValue,
      shelf: shelfValue,
      level: levelValue,
      location: locationCode,
      physical: 'verified',
      copyStatus: 'out_of_collection',
      physicalCondition,
      countedCopies: countedCopies.trim() || '1',
      notes: notesValue.trim()
        ? `${notesValue.trim()} | وضعیت: نیازمند تطبیق با Excel`
        : 'وضعیت: نیازمند تطبیق با Excel مرجع',
      updatedAt: new Date().toISOString()
    };

    onSaveAuditRecord(record);
    setOutsideTitle('');
    setOutsideAuthor('');
    setOutsidePublisher('');
    setOutsideYear('');
    onNotify(
      `کتاب خارج از فهرست «${cleanTitle}» با شناسه موقت ${tempId} در محل ${locationCode} ثبت شد.`
    );
  };

  const totalCatalogCount = catalogRows.length;
  const totalSavedCount = Object.keys(auditRecords).length;
  const verifiedCount = Object.values(auditRecords).filter((r) => r.physical === 'verified').length;
  const outsideCount = Object.values(auditRecords).filter((r) => r.source === 'outside-list').length;

  return (
    <div className="space-y-4">
      {/* Top 4-Metric Mobile Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 text-center">
          <span className="text-[11px] text-slate-500 block">ردیف‌های شیت مرجع</span>
          <strong className="text-xl font-bold text-slate-900 tabular-nums mt-0.5 block">
            {toPersianDigits(totalCatalogCount)}
          </strong>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 text-center">
          <span className="text-[11px] text-slate-500 block">کل ثبت‌های میدانی</span>
          <strong className="text-xl font-bold text-[#1f4e79] tabular-nums mt-0.5 block">
            {toPersianDigits(totalSavedCount)}
          </strong>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 text-center">
          <span className="text-[11px] text-slate-500 block">کتاب‌های دیده‌شده</span>
          <strong className="text-xl font-bold text-emerald-700 tabular-nums mt-0.5 block">
            {toPersianDigits(verifiedCount)}
          </strong>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 text-center">
          <span className="text-[11px] text-slate-500 block">ثبت خارج از فهرست</span>
          <strong className="text-xl font-bold text-amber-700 tabular-nums mt-0.5 block">
            {toPersianDigits(outsideCount)}
          </strong>
        </div>
      </div>

      {/* Main Responsive 2-Column Layout on Desktop, Stacked on Android Mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Right Column (RTL): 1. File Loader & 2. Fast Search List (5 cols on lg) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Card 1: Excel Reference Loader */}
          <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-[#1f4e79] shrink-0" />
                <h2 className="text-sm font-bold text-slate-900">
                  ۱. فهرست مرجع اکسل
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowColumnMapper((prev) => !prev)}
                className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>تنظیم شیت و ستون‌ها</span>
              </button>
            </div>

            <div className="bg-[#edf4fa] text-[#162b3b] rounded-xl p-3 text-xs leading-relaxed">
              <span className="font-semibold">فایل فعال: </span>
              <span>{loadedFileName}</span>
              <span className="mx-1.5">·</span>
              <span>شیت: «{currentSheetName}»</span>
              <p className="text-[11px] text-slate-600 mt-1">
                پردازش کاملاً در مرورگر همین گوشی انجام می‌شود و فایل مرجع اصلی بدون تغییر باقی می‌ماند.
              </p>
            </div>

            <div className="bg-[#FAF2E8] border border-[#E6D5C1] text-[#755C48] rounded-xl p-3 text-[11px] leading-relaxed space-y-1">
              <div className="font-bold text-[#8C3B2B] flex items-center gap-1.5">
                <span>💡 راهنمای افزایش کتب و بارگذاری فایل‌های جدید:</span>
              </div>
              <p>
                اگر در آینده کتاب‌های جدیدی (مانند بسته حدود ۴۰۰ کتاب خریداری‌شده) اضافه شود، می‌توانید فایل اکسل آن را از دکمه زیر انتخاب و بارگذاری کنید.
              </p>
              <p>
                دکمه «تنظیم شیت و ستون‌ها» برای این است که در فایل‌های اکسل مختلف، مشخص کنید کدام ستون مربوط به عنوان، نویسنده، ناشر یا شناسه است تا سامانه هوشمندانه اطلاعات را تطبیق دهد.
              </p>
            </div>

            <label className="w-full min-h-[46px] px-4 py-2.5 bg-[#1f4e79] hover:bg-[#173b5c] text-white font-semibold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs">
              <Upload className="w-4 h-4 shrink-0" />
              <span>انتخاب و بارگذاری فایل اکسل جدید (.xlsx)</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            {/* Collapsible Sheet & Column Mapping Panel */}
            {showColumnMapper && (
              <div className="pt-3 border-t border-slate-200 space-y-3 text-xs">
                {sheetNames.length > 0 && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      شیت مورد استفاده:
                    </label>
                    <select
                      value={currentSheetName}
                      onChange={(e) => onSwitchSheet(e.target.value)}
                      className="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900"
                    >
                      {sheetNames.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">ستون عنوان کتاب *</label>
                    <select
                      value={columnMap.titleCol}
                      onChange={(e) =>
                        onUpdateColumnMap({ ...columnMap, titleCol: Number(e.target.value) })
                      }
                      className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl"
                    >
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `ستون ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">ستون شناسه موقت</label>
                    <select
                      value={columnMap.tempIdCol}
                      onChange={(e) =>
                        onUpdateColumnMap({ ...columnMap, tempIdCol: Number(e.target.value) })
                      }
                      className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl"
                    >
                      <option value={-1}>ندارد</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `ستون ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">ستون ناشر</label>
                    <select
                      value={columnMap.publisherCol}
                      onChange={(e) =>
                        onUpdateColumnMap({ ...columnMap, publisherCol: Number(e.target.value) })
                      }
                      className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl"
                    >
                      <option value={-1}>ثبت نشده</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `ستون ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">ستون نویسنده</label>
                    <select
                      value={columnMap.authorCol}
                      onChange={(e) =>
                        onUpdateColumnMap({ ...columnMap, authorCol: Number(e.target.value) })
                      }
                      className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl"
                    >
                      <option value={-1}>ثبت نشده</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `ستون ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Card 2: Advanced Search & Column Filtering (ناشر، نویسنده، دسته‌بندی موضوعی) */}
          <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#253247]">
                  ۲. جست‌وجو و فیلتر پیشرفته کتاب‌ها
                </h2>
                {activeFiltersCount > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-[#1F4E79] text-white text-[10px] font-bold">
                    {toPersianDigits(activeFiltersCount)} فیلتر فعال
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activeFiltersCount > 0 && (
                  <button
                    type="button"
                    onClick={handleResetAllFilters}
                    className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-[#B94A48] border border-rose-200 text-[11px] font-bold inline-flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>پاک‌سازی فیلترها</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowAdvancedColumnFilters((prev) => !prev)}
                  className="px-2.5 py-1 rounded-lg bg-[#EAF1F7] text-[#1F4E79] text-[11px] font-bold inline-flex items-center gap-1"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>{showAdvancedColumnFilters ? 'بستن فیلتر ستونی' : 'فیلتر ستونی'}</span>
                </button>
              </div>
            </div>

            {/* Primary Search Input with Clear, Search, and Reset buttons */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setVisibleLimit(50);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleExecuteSearch();
                      }
                    }}
                    placeholder="عنوان کتاب، نویسنده، ناشر یا شناسه موقت..."
                    autoComplete="off"
                    className="w-full min-h-[46px] pr-10 pl-8 py-2.5 text-xs sm:text-sm bg-[#F5F7FA] border border-slate-300 rounded-xl text-[#253247] focus:bg-white focus:outline-none focus:border-[#1F4E79]"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setVisibleLimit(50);
                      }}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                      title="پاک کردن متن جست‌وجو"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleExecuteSearch}
                  className="min-h-[46px] px-3.5 sm:px-4 bg-[#8C3B2B] hover:bg-[#702D20] text-white font-bold text-xs sm:text-sm rounded-xl inline-flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer"
                >
                  <Search className="w-4 h-4" />
                  <span>جست‌وجو</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetAllFilters}
                  title="پاک‌سازی کامل تمام کادرها و جست‌وجوی جدید"
                  className="min-h-[46px] px-2.5 sm:px-3 bg-white hover:bg-slate-100 text-[#755C48] border border-[#E6D5C1] font-bold text-xs rounded-xl inline-flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">جست‌وجوی جدید</span>
                </button>
              </div>

              {/* Informative search status banner */}
              {(searchQuery.trim() || authorQuery.trim() || publisherQuery.trim()) && (
                <div className="flex items-center justify-between text-[11px] px-2.5 py-1.5 bg-[#FAF2E8] border border-[#E6D5C1] rounded-lg text-[#755C48]">
                  <span>
                    🔎 نتایج جست‌وجو: <strong className="text-[#8C3B2B]">{toPersianDigits(allMatchingRows.length)}</strong> کتاب یافت شد
                  </span>
                  <button
                    type="button"
                    onClick={handleResetAllFilters}
                    className="text-[#8C3B2B] font-bold hover:underline cursor-pointer"
                  >
                    پاک کردن همه کادرها
                  </button>
                </div>
              )}
            </div>

            {/* Quick Subject Category Filter Chips (دسته‌بندی موضوعی شش‌گانه) */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-[#697586]">
                فیلتر سریع بر اساس ستون «دسته‌بندی موضوعی»:
              </label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter('all');
                    setVisibleLimit(50);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                    categoryFilter === 'all'
                      ? 'bg-[#1F4E79] text-white border-[#1F4E79]'
                      : 'bg-[#F5F7FA] text-[#253247] border-slate-200 hover:bg-slate-200/70'
                  }`}
                >
                  همه ({toPersianDigits(categoryCounts.all || 0)})
                </button>
                {SUBJECT_CATEGORIES.map((cat) => (
                  <button
                    key={cat.code}
                    type="button"
                    onClick={() => {
                      setCategoryFilter(cat.code === categoryFilter ? 'all' : cat.code);
                      setVisibleLimit(50);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                      categoryFilter === cat.code
                        ? 'bg-[#1F4E79] text-white border-[#1F4E79]'
                        : 'bg-[#F5F7FA] text-[#253247] border-slate-200 hover:bg-slate-200/70'
                    }`}
                  >
                    {cat.code === 'UNSET' ? 'بدون دسته' : `${cat.code} (${cat.fullTitle})`}{' '}
                    <span className="opacity-80 tabular-nums">
                      ({toPersianDigits(categoryCounts[cat.code] || 0)})
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced Column Filters Panel (ناشر، نویسنده، قفسه) */}
            {showAdvancedColumnFilters && (
              <div className="p-3 rounded-xl bg-[#F5F7FA] border border-slate-200/90 space-y-3">
                <div className="text-[11px] font-bold text-[#1F4E79] flex items-center justify-between">
                  <span>فیلتر دقیق بر اساس ستون‌های «ناشر»، «نویسنده/گردآورنده» و «قفسه»:</span>
                  <span className="text-[#697586] tabular-nums">
                    نتیجه: {toPersianDigits(allMatchingRows.length)} کتاب
                  </span>
                </div>

                {/* Column 1: Publisher (Dropdown + Search Input) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#253247] mb-1">
                      ستون ناشر (انتخاب از لیست ناشران):
                    </label>
                    <select
                      value={publisherFilter}
                      onChange={(e) => {
                        setPublisherFilter(e.target.value);
                        setVisibleLimit(50);
                      }}
                      className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-[#253247]"
                    >
                      <option value="all">
                        همه ناشران ({toPersianDigits(uniquePublishers.length)} ناشر)
                      </option>
                      {uniquePublishers.map(([pub, count]) => (
                        <option key={pub} value={pub}>
                          {pub} ({toPersianDigits(count)} کتاب)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#253247] mb-1">
                      جست‌وجوی متنی در ستون ناشر:
                    </label>
                    <div className="relative">
                      <input
                        type="search"
                        value={publisherQuery}
                        onChange={(e) => {
                          setPublisherQuery(e.target.value);
                          setVisibleLimit(50);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleExecuteSearch();
                          }
                        }}
                        placeholder="مثلاً: سوره مهر، ابراهیم هادی، شاهد..."
                        className="w-full min-h-[40px] pr-2.5 pl-7 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-[#253247] focus:outline-none focus:border-[#1F4E79]"
                      />
                      {publisherQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setPublisherQuery('');
                            setVisibleLimit(50);
                          }}
                          className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                          title="پاک کردن ناشر"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Column 2: Author / Compiler (Search Input + Presence Filter) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#253247] mb-1">
                      ستون نویسنده / گردآورنده / راوی:
                    </label>
                    <div className="relative">
                      <input
                        type="search"
                        value={authorQuery}
                        onChange={(e) => {
                          setAuthorQuery(e.target.value);
                          setVisibleLimit(50);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleExecuteSearch();
                          }
                        }}
                        placeholder="نام نویسنده، گردآورنده یا راوی..."
                        className="w-full min-h-[40px] pr-2.5 pl-7 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-[#253247] focus:outline-none focus:border-[#1F4E79]"
                      />
                      {authorQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setAuthorQuery('');
                            setVisibleLimit(50);
                          }}
                          className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                          title="پاک کردن نویسنده"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#253247] mb-1">
                      وضعیت ثبت نویسنده و قفسه:
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <select
                        value={authorStatusFilter}
                        onChange={(e) => {
                          setAuthorStatusFilter(
                            e.target.value as 'all' | 'has_author' | 'missing_author'
                          );
                          setVisibleLimit(50);
                        }}
                        className="w-full min-h-[40px] px-2 py-1.5 bg-white border border-slate-300 rounded-xl text-[11px] text-[#253247]"
                      >
                        <option value="all">همه (نویسنده)</option>
                        <option value="has_author">دارای نام نویسنده</option>
                        <option value="missing_author">بدون نام نویسنده</option>
                      </select>

                      <select
                        value={shelfFilter}
                        onChange={(e) => {
                          setShelfFilter(e.target.value);
                          setVisibleLimit(50);
                        }}
                        className="w-full min-h-[40px] px-2 py-1.5 bg-white border border-slate-300 rounded-xl text-[11px] text-[#253247]"
                      >
                        <option value="all">همه قفسه‌ها</option>
                        {SHELVES.map((s) => (
                          <option key={s.code} value={s.code}>
                            {s.code}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 6 Separated Status Filter (Section 5: تفکیک ۶ وضعیت بدون ادغام) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-bold text-[#697586]">
                  فیلتر تفکیکی ۶ وضعیت موجودی کتابخانه:
                </label>
                <span className="text-[11px] text-[#1F4E79] font-bold tabular-nums">
                  نمایش {toPersianDigits(filteredRows.length)} از {toPersianDigits(allMatchingRows.length)} کتاب
                </span>
              </div>
              <select
                value={auditFilter}
                onChange={(e) => {
                  setAuditFilter(e.target.value as typeof auditFilter);
                  setVisibleLimit(50);
                }}
                className="w-full min-h-[40px] px-3 py-1.5 bg-[#EAF1F7]/60 border border-[#1F4E79]/30 rounded-xl text-xs font-bold text-[#1F4E79] cursor-pointer"
              >
                <option value="all">
                  ۱. کلیه آثار فهرست مرجع Excel ({toPersianDigits(catalogRows.length)} اثر)
                </option>
                <option value="audited">
                  ۲. مشاهده و تأییدشده در قفسه ({toPersianDigits(verifiedCount)} مورد)
                </option>
                <option value="unaudited">
                  ۳. موجود در فهرست اما هنوز بررسی‌نشده در قفسه
                </option>
                <option value="not_found_in_round">
                  ۴. موجود در فهرست اما پیدا نشده در نوبت بررسی فعلی
                </option>
                <option value="incomplete_or_review">
                  ۵. دارای اطلاعات ناقص (بدون نویسنده/ناشر/نیازمند تطبیق)
                </option>
                <option value="outside_excel">
                  ۶. مشاهده‌شده در قفسه اما خارج از فهرست Excel ({toPersianDigits(outsideCount)} مورد)
                </option>
                <option value="expected_acquisition">
                  ۷. فهرست انتظار ورود (فایل تجمیعی کامل — تحویل‌نشده به قفسه)
                </option>
              </select>

              {/* Instant Excel Export Button for current status filter with today's date */}
              <button
                type="button"
                onClick={handleExportCurrentFilterExcel}
                className="w-full min-h-[44px] px-3.5 py-2 bg-[#9E5A24] hover:bg-[#83491C] text-white text-xs font-bold rounded-xl inline-flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                title="دریافت فایل اکسل کامل این فهرست به تاریخ امروز"
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
                <span>دریافت خروجی Excel از این فهرست (با تاریخ روز)</span>
              </button>
            </div>

            {/* Results List */}
            <div className="space-y-2 max-h-[420px] overflow-y-auto pl-1">
              {filteredRows.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 space-y-2">
                  <p>عنوانی در فهرست مرجع پیدا نشد.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setOutsideTitle(searchQuery);
                      setShowOutsideForm(true);
                    }}
                    className="w-full min-h-[42px] px-3 py-2 bg-amber-700 text-white rounded-xl font-semibold flex items-center justify-center gap-1.5"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>ثبت «{searchQuery || 'کتاب جدید'}» به‌عنوان کتاب خارج از فهرست</span>
                  </button>
                </div>
              ) : (
                <>
                  {filteredRows.map((row, idx) => {
                    const savedRec = auditRecords[row.rowKey];
                    const isChosen = selectedRow?.rowKey === row.rowKey;
                    const nextRow = filteredRows[idx + 1];

                    return (
                      <div
                        id={`book-item-${row.rowKey}`}
                        key={row.rowKey}
                        className={`w-full rounded-2xl border transition-all text-right overflow-hidden ${
                          isChosen
                            ? 'border-2 border-[#1f4e79] bg-white shadow-lg ring-4 ring-[#1f4e79]/10'
                            : savedRec
                            ? 'border-emerald-300 bg-emerald-50/40 hover:bg-emerald-50/70'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        {/* Clickable Card Header */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            if (isChosen) {
                              setSelectedRow(null);
                            } else {
                              handleSelectRow(row);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              if (isChosen) setSelectedRow(null);
                              else handleSelectRow(row);
                            }
                          }}
                          className="p-3.5 sm:p-4 cursor-pointer select-none transition-colors"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="font-mono tabular-nums font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200"
                                dir="ltr"
                              >
                                {row.tempBookId}
                              </span>
                              <span className="text-slate-400">·</span>
                              <span className="text-slate-500 font-medium">
                                ردیف {toPersianDigits(row.rowIndex)}
                              </span>
                            </div>

                            <div>
                              {savedRec ? (
                                savedRec.physical === 'verified' ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>
                                      ثبت‌شده در {savedRec.location || 'بدون محل'} ({savedRec.category?.split(' ')[0] || '—'})
                                    </span>
                                  </span>
                                ) : savedRec.physical === 'review' ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    <span>نیازمند بررسی {savedRec.location ? `(${savedRec.location})` : ''}</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-md border border-rose-300">
                                    <X className="w-3.5 h-3.5" />
                                    <span>پیدا نشد در قفسه</span>
                                  </span>
                                )
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                                  <span>بررسی‌نشده در قفسه</span>
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="font-bold text-sm sm:text-base text-slate-900 leading-snug">
                            {row.titleRaw || '(بدون عنوان)'}
                          </div>

                          <div className="text-xs text-slate-600 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                            {row.authorRaw && (
                              <span className="font-medium text-slate-700">
                                نویسنده: <span className="text-slate-900 font-bold">{row.authorRaw}</span>
                              </span>
                            )}
                            {row.publisherRaw && (
                              <span>
                                ناشر: <span className="text-slate-800 font-medium">{row.publisherRaw}</span>
                              </span>
                            )}
                            {row.descriptionRaw && (
                              <span className="text-slate-500 line-clamp-1">
                                {row.descriptionRaw}
                              </span>
                            )}
                          </div>

                          {!isChosen && (
                            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-[#1f4e79]">
                              <span className="flex items-center gap-1 font-semibold">
                                <SlidersHorizontal className="w-3.5 h-3.5" />
                                <span>کلیک برای ثبت سریع قفسه، طبقه و موضوع</span>
                              </span>
                              <span className="text-slate-400 text-[10.5px] flex items-center gap-0.5">
                                <span>باز کردن فرم</span>
                                <ChevronDown className="w-3.5 h-3.5" />
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Inline Quick Inventory Accordion */}
                        {isChosen && (
                          <div className="border-t-2 border-[#1f4e79]/30 bg-blue-50/40 p-3.5 sm:p-4.5 space-y-3.5">
                            {/* Drawer Subheader */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-blue-200/70">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-xs sm:text-sm font-bold text-[#1f4e79]">
                                  ثبت سریع در قفسه — {row.tempBookId}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setSelectedRow(null)}
                                className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-white flex items-center gap-1 transition-colors"
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                                <span>بستن پنل</span>
                              </button>
                            </div>

                            {/* 1. Subject Category Pills */}
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <label className="font-bold text-slate-900">
                                  ۱. گروه موضوعی (شش گروه کتابخانه):
                                </label>
                                <span className="text-[11px] text-[#1f4e79] font-bold">
                                  {categoryValue || 'انتخاب نشده'}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                {SUBJECT_CATEGORIES.map((cat) => {
                                  const isCatActive = categoryValue === cat.label;
                                  return (
                                    <button
                                      key={cat.code}
                                      type="button"
                                      onClick={() => handleCategoryTap(cat.label, cat.code)}
                                      className={`p-2 rounded-xl text-right border transition-all text-xs flex flex-col justify-between min-h-[52px] ${
                                        isCatActive
                                          ? 'bg-[#1f4e79] text-white border-[#1f4e79] shadow-sm font-bold ring-2 ring-[#1f4e79]/30'
                                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between w-full">
                                        <span className="font-mono font-bold text-[11px]">{cat.code}</span>
                                        {isCatActive && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />}
                                      </div>
                                      <div className="truncate text-[11px] mt-0.5">
                                        {cat.fullTitle || cat.label}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* 2. Shelf & Level Selector */}
                            <div className="space-y-2 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <label className="text-xs font-bold text-slate-900">
                                  ۲. جانمایی در قفسه و طبقه:
                                </label>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold font-mono bg-blue-100 text-blue-900 px-2 py-0.5 rounded-md border border-blue-200">
                                    محل: {shelfValue && levelValue ? `${shelfValue}-${levelValue}` : 'نامشخص'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setIsShelfLocked((p) => !p)}
                                    title="قفل این قفسه و طبقه برای کتاب‌های بعدی"
                                    className={`px-2 py-1 rounded-md text-[11px] border flex items-center gap-1 transition-colors ${
                                      isShelfLocked
                                        ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
                                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                                    }`}
                                  >
                                    {isShelfLocked ? (
                                      <Lock className="w-3 h-3 text-amber-700" />
                                    ) : (
                                      <Unlock className="w-3 h-3 text-slate-400" />
                                    )}
                                    <span>{isShelfLocked ? 'قفل محل فعال' : 'قفل این طبقه'}</span>
                                  </button>
                                </div>
                              </div>

                              {/* Shelf Buttons SH-01 to SH-04 */}
                              <div className="grid grid-cols-4 gap-1.5">
                                {SHELVES.map((sh) => {
                                  const isShActive = shelfValue === sh.code;
                                  return (
                                    <button
                                      key={sh.code}
                                      type="button"
                                      onClick={() => setShelfValue(sh.code)}
                                      className={`py-2 px-1 rounded-xl text-center text-xs font-bold border transition-all ${
                                        isShActive
                                          ? 'bg-[#1f4e79] text-white border-[#1f4e79] shadow-sm'
                                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                      }`}
                                    >
                                      <div>{sh.code}</div>
                                      <div className="text-[9.5px] opacity-80 font-normal">
                                        {sh.code === 'SH-01'
                                          ? 'قفسه ۱'
                                          : sh.code === 'SH-02'
                                          ? 'قفسه ۲'
                                          : sh.code === 'SH-03'
                                          ? 'قفسه ۳'
                                          : 'قفسه ۴'}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Level Buttons T01 to T06 */}
                              <div className="grid grid-cols-6 gap-1">
                                {LEVELS.map((lv) => {
                                  const isLvActive = levelValue === lv.code;
                                  return (
                                    <button
                                      key={lv.code}
                                      type="button"
                                      onClick={() => setLevelValue(lv.code)}
                                      className={`py-2 px-0.5 rounded-lg text-center text-xs font-bold border transition-all ${
                                        isLvActive
                                          ? 'bg-teal-700 text-white border-teal-700 shadow-sm'
                                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                      }`}
                                    >
                                      <div>{lv.code}</div>
                                      <div className="text-[9px] opacity-80 font-normal">
                                        طبقه {toPersianDigits(lv.number)}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* 3. Physical Presence Status */}
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-slate-900 block">
                                ۳. وضعیت مشاهده فیزیکی نسخه در قفسه:
                              </label>
                              <div className="grid grid-cols-3 gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setPhysicalStatus('verified')}
                                  className={`py-2.5 px-1 rounded-xl text-xs font-bold border transition-all text-center ${
                                    physicalStatus === 'verified'
                                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                  }`}
                                >
                                  ✓ موجود و تأییدشده
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPhysicalStatus('review')}
                                  className={`py-2.5 px-1 rounded-xl text-xs font-bold border transition-all text-center ${
                                    physicalStatus === 'review'
                                      ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                  }`}
                                >
                                  ⚠️ نیازمند بررسی
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPhysicalStatus('not_found')}
                                  className={`py-2.5 px-1 rounded-xl text-xs font-bold border transition-all text-center ${
                                    physicalStatus === 'not_found'
                                      ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                  }`}
                                >
                                  ✕ پیدا نشد
                                </button>
                              </div>
                            </div>

                            {/* 4. Optional Overrides (Author, Publisher, Notes) */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-blue-200/50 text-xs">
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  نویسنده / پدیدآور (در صورت مغایرت یا تکمیل):
                                </label>
                                <input
                                  type="text"
                                  value={authorOverride}
                                  onChange={(e) => setAuthorOverride(e.target.value)}
                                  placeholder={row.authorRaw || 'نام نویسنده...'}
                                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#1f4e79]"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  ناشر (در صورت نیاز به تکمیل):
                                </label>
                                <input
                                  type="text"
                                  value={publisherOverride}
                                  onChange={(e) => setPublisherOverride(e.target.value)}
                                  placeholder={row.publisherRaw || 'نام ناشر...'}
                                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#1f4e79]"
                                />
                              </div>
                              <div className="sm:col-span-2">
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  یادداشت مختصر ثبت‌کننده:
                                </label>
                                <input
                                  type="text"
                                  value={notesValue}
                                  onChange={(e) => setNotesValue(e.target.value)}
                                  placeholder="توضیح وضعیت فیزیکی جلد، عطف، یا شماره ردیف قفسه..."
                                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#1f4e79]"
                                />
                              </div>
                            </div>

                            {/* 5. Mobile-Ready Action Buttons */}
                            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                              {/* Hero Action: Save and Advance */}
                              <button
                                type="button"
                                onClick={() => handleSaveCatalogBookRecord(row, nextRow)}
                                className="flex-1 min-h-[48px] px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-emerald-700/20 transition-all"
                              >
                                <span>ذخیره سریع و رفتن به کتاب بعدی</span>
                                <ArrowDown className="w-4 h-4" />
                              </button>

                              {/* Secondary: Save This Book Only */}
                              <button
                                type="button"
                                onClick={() => handleSaveCatalogBookRecord(row)}
                                className="min-h-[44px] px-4 py-2 bg-[#1f4e79] hover:bg-[#163a5c] text-white rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                <span>ذخیره همین کتاب ✓</span>
                              </button>

                              {/* Close Drawer */}
                              <button
                                type="button"
                                onClick={() => setSelectedRow(null)}
                                className="min-h-[44px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium text-xs flex items-center justify-center gap-1 transition-colors"
                              >
                                <span>بستن ✕</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {allMatchingRows.length > visibleLimit && (
                    <button
                      type="button"
                      onClick={() => setVisibleLimit((prev) => prev + 50)}
                      className="w-full min-h-[42px] py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
                    >
                      نمایش ۵۰ کتاب بعدی ({toPersianDigits(allMatchingRows.length - visibleLimit)} مورد باقی‌مانده)
                    </button>
                  )}
                </>
              )}
            </div>
          </section>
        </div>

        {/* Left Column (RTL): 3. Quick Physical Registration Form & 4. Outside-List Entry (7 cols on lg) */}
        <div className="lg:col-span-7 space-y-4">
          <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <BookCheck className="w-5 h-5 text-[#1f4e79]" />
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  ۳. ثبت فیزیکی کتاب (موضوع، نسخه فیزیکی CP و محل قفسه)
                </h2>
              </div>

              {/* Batch Shelf Lock Toggle */}
              <button
                type="button"
                onClick={() => setIsShelfLocked((prev) => !prev)}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors ${
                  isShelfLocked
                    ? 'bg-amber-50 border-amber-400 text-amber-900'
                    : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {isShelfLocked ? (
                  <>
                    <Lock className="w-3.5 h-3.5 text-amber-700" />
                    <span>قفل روی {shelfValue && levelValue ? `${shelfValue}-${levelValue}` : 'طبقه فعلی'} فعال است</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-3.5 h-3.5" />
                    <span>قفل قفسه/طبقه برای ثبت پیاپی</span>
                  </>
                )}
              </button>
            </div>

            {/* Selected Book Banner */}
            <div
              className={`rounded-xl p-3.5 border ${
                selectedRow
                  ? 'bg-[#edf4fa] border-[#b8d0e8] text-[#162b3b]'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              {selectedRow ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-[#1f4e79]" dir="ltr">
                      {selectedRow.tempBookId} · {copyIdValue || `CP-${String(selectedRow.rowIndex - 1).padStart(6, '0')}`}
                    </span>
                    <span>
                      شیت منبع: {selectedRow.backupSourceSheet} · ردیف {toPersianDigits(selectedRow.backupSourceRow)}
                    </span>
                  </div>
                  <div className="text-base font-bold text-slate-900">{selectedRow.titleRaw}</div>
                  <div className="text-xs text-slate-700">
                    {[
                      selectedRow.publisherRaw && `ناشر: ${selectedRow.publisherRaw}`,
                      selectedRow.descriptionRaw && `توضیحات خام: ${selectedRow.descriptionRaw}`
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'اطلاعات تکمیلی در شیت خالی است'}
                  </div>

                  {selectedBookMartyrLinks.length > 0 && (
                    <div className="pt-2 mt-2 border-t border-[#c9dced] text-xs space-y-1">
                      <div className="font-bold text-[#1f4e79]">
                        شهدای مرتبط ثبت‌شده در کارپوشه برای این کتاب ({toPersianDigits(selectedBookMartyrLinks.length)} مورد):
                      </div>
                      <div className="max-h-24 overflow-y-auto space-y-1 text-[11px] text-slate-800">
                        {selectedBookMartyrLinks.slice(0, 8).map((lnk) => (
                          <div key={lnk.id} className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-slate-500" dir="ltr">
                              {lnk.id}
                            </span>
                            <span>·</span>
                            <span className="font-semibold">{lnk.martyrNameRaw}</span>
                            {lnk.gravePieceRaw && <span>· قطعه {toPersianDigits(lnk.gravePieceRaw)}</span>}
                            {lnk.pageReferenceRaw && <span>· صفحه: {toPersianDigits(lnk.pageReferenceRaw)}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Independent Physical Copies (CP-xxxxxx) Management & Shelf Move History (Section 7.2) */}
                  {(() => {
                    const copiesForThisBook = bookCopies.filter(
                      (c) => c.bookId === selectedRow.tempBookId
                    );
                    return (
                      <div className="pt-2.5 mt-2 border-t border-[#c9dced] text-xs space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-[#253247]">
                            نسخه‌های فیزیکی مستقل این کتاب ({toPersianDigits(copiesForThisBook.length)} جلد ثبت‌شده با کد CP):
                          </span>
                          {onAddBookCopy && (
                            <button
                              type="button"
                              onClick={() => {
                                const nextNum = bookCopies.length + 1;
                                const newCid = `CP-${String(nextNum).padStart(6, '0')}`;
                                const sh = (shelfValue || 'SH-01') as ShelfCode;
                                const lv = (levelValue || 'T01') as LevelCode;
                                const nowFa = new Intl.DateTimeFormat('fa-IR').format(new Date());
                                onAddBookCopy({
                                  copyId: newCid,
                                  bookId: selectedRow.tempBookId,
                                  bookTitle: selectedRow.titleRaw,
                                  copyStatus: 'verified_present',
                                  shelf: sh,
                                  level: lv,
                                  location: `${sh}-${lv}`,
                                  observedDate: nowFa,
                                  physicalCondition: 'healthy',
                                  loanOrMoveStatus: 'در قفسه مرکز اسناد',
                                  expertNote: `ثبت نسخه فیزیکی جدید برای کتاب ${selectedRow.tempBookId}`,
                                  lastReviewedAt: nowFa,
                                  locationHistory: []
                                });
                              }}
                              className="px-2.5 py-1 rounded-lg bg-[#2E7D5B] hover:bg-[#236247] text-white font-bold text-[11px]"
                            >
                              ＋ ثبت نسخه فیزیکی جدید (CP) از همین کتاب
                            </button>
                          )}
                        </div>

                        {copiesForThisBook.length > 0 && (
                          <div className="space-y-1.5">
                            {copiesForThisBook.map((cp) => (
                              <div
                                key={cp.copyId}
                                className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-1.5"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <span className="font-mono font-bold text-[#1F4E79]" dir="ltr">
                                      {cp.copyId}
                                    </span>
                                    <span className="mx-1.5">·</span>
                                    <strong className="text-[#253247]">محل فعلی: {cp.location}</strong>
                                    <span className="mx-1.5">·</span>
                                    <span className="text-[#2E7D5B]">{cp.loanOrMoveStatus}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setMovingCopyId(movingCopyId === cp.copyId ? null : cp.copyId)
                                    }
                                    className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[#1F4E79] font-semibold text-[11px]"
                                  >
                                    انتقال قفسه/طبقه این نسخه
                                  </button>
                                </div>

                                {cp.locationHistory.length > 0 && (
                                  <div className="text-[11px] text-[#697586]">
                                    سابقه جابه‌جایی:{' '}
                                    {cp.locationHistory
                                      .map(
                                        (h) => `${h.fromLocation} ← ${h.toLocation} (${h.movedAt})`
                                      )
                                      .join(' | ')}
                                  </div>
                                )}

                                {movingCopyId === cp.copyId && onMoveBookCopy && (
                                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
                                    <select
                                      value={moveTargetShelf}
                                      onChange={(e) =>
                                        setMoveTargetShelf(e.target.value as ShelfCode)
                                      }
                                      className="px-2 py-1 border border-slate-300 rounded text-xs"
                                    >
                                      {SHELVES.map((s) => (
                                        <option key={s.code} value={s.code}>
                                          {s.code}
                                        </option>
                                      ))}
                                    </select>
                                    <select
                                      value={moveTargetLevel}
                                      onChange={(e) =>
                                        setMoveTargetLevel(e.target.value as LevelCode)
                                      }
                                      className="px-2 py-1 border border-slate-300 rounded text-xs"
                                    >
                                      {LEVELS.map((l) => (
                                        <option key={l.code} value={l.code}>
                                          {l.code}
                                        </option>
                                      ))}
                                    </select>
                                    <input
                                      type="text"
                                      value={moveReason}
                                      onChange={(e) => setMoveReason(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          onMoveBookCopy(
                                            cp.copyId,
                                            moveTargetShelf,
                                            moveTargetLevel,
                                            moveReason
                                          );
                                          setMovingCopyId(null);
                                        }
                                      }}
                                      placeholder="علت جابه‌جایی (Enter برای ثبت)..."
                                      className="px-2 py-1 border border-slate-300 rounded text-xs flex-1"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        onMoveBookCopy(
                                          cp.copyId,
                                          moveTargetShelf,
                                          moveTargetLevel,
                                          moveReason
                                        );
                                        setMovingCopyId(null);
                                      }}
                                      className="px-3 py-1 rounded bg-[#1F4E79] text-white font-bold text-xs"
                                    >
                                      ثبت انتقال (ثابت‌ماندن {cp.bookId})
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <p className="text-xs sm:text-sm">
                  یک کتاب را از فهرست جست‌وجو لمس کنید (یا اگر در فهرست نیست، از بخش ۴ پایین صفحه ثبت کنید).
                </p>
              )}
            </div>

            <form onSubmit={handleSaveCatalogBook} className="space-y-4">
              {/* Step A: 6 Subject Categories (Clean & Balanced Grid) + Centered UNSET */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-2">
                  الف) انتخاب گروه موضوعی (شش‌گانه مصوب):
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {SUBJECT_CATEGORIES.filter((c) => c.code !== 'UNSET').map((cat) => {
                    const isSelected = categoryValue === cat.label;
                    return (
                      <button
                        key={cat.code}
                        type="button"
                        onClick={() => handleCategoryTap(cat.label, cat.code)}
                        className={`min-h-[46px] px-3 py-2.5 rounded-xl text-center border text-xs font-bold transition-all flex items-center justify-center ${
                          isSelected
                            ? 'bg-[#1f4e79] text-white border-[#1f4e79] shadow-xs'
                            : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <span>{cat.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* دکمه نیازمند تعیین موضوع — کاملاً وسط‌چین‌شده زیر شش گروه برای توازن هندسی */}
                {(() => {
                  const unsetCat = SUBJECT_CATEGORIES.find((c) => c.code === 'UNSET');
                  if (!unsetCat) return null;
                  const isSelected = categoryValue === unsetCat.label;
                  return (
                    <div className="mt-2.5 flex justify-center">
                      <button
                        type="button"
                        onClick={() => handleCategoryTap(unsetCat.label, unsetCat.code)}
                        className={`w-full sm:w-2/3 md:w-1/2 min-h-[44px] px-4 py-2.5 rounded-xl text-center border text-xs font-bold transition-all flex items-center justify-center ${
                          isSelected
                            ? 'bg-amber-700 text-white border-amber-700 shadow-xs'
                            : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100 hover:border-amber-300'
                        }`}
                      >
                        <span>{unsetCat.label}</span>
                      </button>
                    </div>
                  );
                })()}
              </div>

              {/* Step B: Shelf (SH-01..SH-04) & Level (T01..T06) Touch Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-2">
                    ب) قفسه عملیاتی (SH-01 تا SH-04):
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {SHELVES.map((sh) => {
                      const active = shelfValue === sh.code;
                      return (
                        <button
                          key={sh.code}
                          type="button"
                          onClick={() => {
                            setShelfValue(sh.code);
                            if (levelValue) handleSlotTap(sh.code, levelValue);
                          }}
                          className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-bold font-mono transition-colors ${
                            active
                              ? 'bg-[#1f4e79] text-white border-[#1f4e79]'
                              : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                          }`}
                          dir="ltr"
                        >
                          {sh.code}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-2">
                    ج) طبقه از بالا به پایین (T01 تا T06):
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {LEVELS.map((lv) => {
                      const active = levelValue === lv.code;
                      return (
                        <button
                          key={lv.code}
                          type="button"
                          onClick={() => {
                            setLevelValue(lv.code);
                            if (shelfValue) handleSlotTap(shelfValue, lv.code);
                          }}
                          className={`min-h-[44px] px-2 py-2 rounded-xl border text-xs font-bold transition-colors flex flex-col items-center justify-center ${
                            active
                              ? 'bg-[#1f4e79] text-white border-[#1f4e79]'
                              : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          <span>طبقه {toPersianDigits(lv.number)}</span>
                          <span className="text-[10px] font-mono opacity-80" dir="ltr">
                            {lv.code}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Live Location Code Display */}
                <div className="sm:col-span-2 flex items-center justify-between bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs">
                  <span className="text-slate-600">کد کامل محل فیزیکی:</span>
                  {shelfValue && levelValue ? (
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-[#1f4e79]" dir="ltr">
                        {shelfValue}-{levelValue}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        (جانمایی مصوب: {getAllocatedCategoryForSlot(shelfValue, levelValue).title})
                      </span>
                    </div>
                  ) : (
                    <span className="text-amber-700 font-medium">قفسه و طبقه را انتخاب کنید</span>
                  )}
                </div>
              </div>

              {/* Step C: Physical Observation Status, Condition & Counted Copies */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    د) وضعیت مشاهده فیزیکی:
                  </label>
                  <select
                    value={physicalStatus}
                    onChange={(e) =>
                      setPhysicalStatus(e.target.value as 'verified' | 'review' | 'not_found')
                    }
                    className="w-full min-h-[44px] px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900"
                  >
                    <option value="verified">دیده شد و ثبت شد (موجود)</option>
                    <option value="review">نیازمند بررسی مشخصات / مغایرت</option>
                    <option value="not_found">در این نوبت در قفسه پیدا نشد</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    وضعیت سلامت جلد (CP):
                  </label>
                  <select
                    value={physicalCondition}
                    onChange={(e) =>
                      setPhysicalCondition(e.target.value as PhysicalConditionCode)
                    }
                    className="w-full min-h-[44px] px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900"
                  >
                    <option value="healthy">سالم</option>
                    <option value="needs_repair">نیازمند ترمیم صحافی</option>
                    <option value="damaged">آسیب‌دیده</option>
                    <option value="unchecked">بررسی‌نشده</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    تعداد نسخه مشاهده‌شده:
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={countedCopies}
                    onChange={(e) => setCountedCopies(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-center tabular-nums"
                  />
                </div>
              </div>

              {/* Optional Bibliographic Completion & Copy Identifiers */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    نویسنده / گردآورنده (روی جلد):
                  </label>
                  <input
                    type="text"
                    value={authorOverride}
                    onChange={(e) => setAuthorOverride(e.target.value)}
                    placeholder="اختیاری"
                    className="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    ناشر (تصحیح یا تکمیل):
                  </label>
                  <input
                    type="text"
                    value={publisherOverride}
                    onChange={(e) => setPublisherOverride(e.target.value)}
                    placeholder="اختیاری"
                    className="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    سال چاپ:
                  </label>
                  <input
                    type="text"
                    value={yearOverride}
                    onChange={(e) => setYearOverride(e.target.value)}
                    placeholder="اختیاری"
                    className="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    شابک (ISBN - در صورت مشاهده):
                  </label>
                  <input
                    type="text"
                    value={isbnOverride}
                    onChange={(e) => setIsbnOverride(e.target.value)}
                    placeholder="بدون حدس؛ فقط از روی کتاب"
                    dir="ltr"
                    className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    شماره فیپا:
                  </label>
                  <input
                    type="text"
                    value={fipaOverride}
                    onChange={(e) => setFipaOverride(e.target.value)}
                    placeholder="اختیاری"
                    dir="ltr"
                    className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    شماره ثبت کتابخانه / شناسه نسخه:
                  </label>
                  <input
                    type="text"
                    value={regNoOverride}
                    onChange={(e) => setRegNoOverride(e.target.value)}
                    placeholder={copyIdValue || 'CP-000001'}
                    dir="ltr"
                    className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  توضیحات کوتاه ثبت‌کننده (با زدن کلید Enter ثبت ذخیره می‌شود):
                </label>
                <textarea
                  rows={2}
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSaveCatalogBook(e as unknown as React.FormEvent);
                    }
                  }}
                  placeholder="یادداشت کوتاه میدانی (Enter برای ذخیره سریع، Shift+Enter برای خط جدید)..."
                  className="w-full p-3 bg-white border border-slate-300 rounded-xl text-xs text-slate-900"
                />
              </div>

              {/* Primary Save Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <button
                  type="submit"
                  className="sm:col-span-2 min-h-[48px] px-5 py-3 bg-[#1f4e79] hover:bg-[#163a5b] text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-colors shadow-xs"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>ذخیره ثبت در حافظه دستگاه</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRow(null);
                    setNotesValue('');
                    setSearchQuery('');
                    if (!isShelfLocked) {
                      setCategoryValue('');
                      setShelfValue('');
                      setLevelValue('');
                    }
                  }}
                  className="min-h-[48px] px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>کتاب بعدی / پاک‌کردن</span>
                </button>
              </div>
            </form>
          </section>

          {/* Card 4: Outside-List Book Registration (کتابی که در اکسل پیدا نشد) */}
          <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  ۴. ثبت کتابی که در اکسل مرجع پیدا نشد (خارج از فهرست)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  اگر کتاب را واقعاً در قفسه دیده‌اید اما در فهرست رکوردی ندارد، اینجا ثبت کنید؛ رکورد با وضعیت «نیازمند تطبیق با Excel» جداگانه ذخیره می‌شود.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowOutsideForm((prev) => !prev)}
                className="min-h-[38px] px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl whitespace-nowrap shrink-0"
              >
                {showOutsideForm ? 'بستن فرم' : '＋ ثبت خارج از فهرست'}
              </button>
            </div>

            {showOutsideForm && (
              <form onSubmit={handleSaveOutsideBook} className="pt-3 border-t border-slate-200 space-y-3">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                  <span>
                    پیش از زدن دکمه ثبت، مطمئن شوید در بخش ۳ بالا، <strong>گروه موضوعی</strong>، <strong>قفسه (SH-01..04)</strong> و <strong>طبقه (T01..06)</strong> کتاب را انتخاب کرده‌اید.
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      عنوان دقیق روی جلد کتاب *
                    </label>
                    <input
                      type="text"
                      required
                      value={outsideTitle}
                      onChange={(e) => setOutsideTitle(e.target.value)}
                      placeholder="عنوان کامل روی جلد کتاب را وارد کنید..."
                      className="w-full min-h-[44px] px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      نویسنده / پدیدآورنده (اختیاری)
                    </label>
                    <input
                      type="text"
                      value={outsideAuthor}
                      onChange={(e) => setOutsideAuthor(e.target.value)}
                      placeholder="نام نویسنده"
                      className="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        ناشر (اختیاری)
                      </label>
                      <input
                        type="text"
                        value={outsidePublisher}
                        onChange={(e) => setOutsidePublisher(e.target.value)}
                        placeholder="نام ناشر"
                        className="w-full min-h-[42px] px-2.5 py-2 bg-white border border-slate-300 rounded-xl text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        سال چاپ
                      </label>
                      <input
                        type="text"
                        value={outsideYear}
                        onChange={(e) => setOutsideYear(e.target.value)}
                        placeholder="۱۴۰۲"
                        className="w-full min-h-[42px] px-2.5 py-2 bg-white border border-slate-300 rounded-xl text-xs tabular-nums"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full min-h-[46px] px-4 py-2.5 bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>ثبت کتاب خارج از فهرست (با شناسه موقت TMP-OUT)</span>
                </button>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
