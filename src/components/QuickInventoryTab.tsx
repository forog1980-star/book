import React, { useState, useMemo, useEffect } from 'react';
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
  ArrowDown,
  Trash2,
  ShieldCheck,
  AlertTriangle
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
import { generateUniqueCopyId, generateUniqueOutsideBookId } from '../utils/idGenerator';
import {
  registerInnerBackStep,
  getLibraryTabNavSnapshot,
  saveLibraryTabNavSnapshot
} from '../utils/navigationHistory';
import { requestActionConfirmation } from '../utils/confirmDialogService';

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
  initialSearchQuery?: string;
  onClearInitialSearchQuery?: () => void;
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
  onDeleteAuditRecord?: (key: string) => void;
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
  initialSearchQuery,
  onClearInitialSearchQuery,
  onWorkbookLoaded,
  onSwitchSheet,
  onUpdateColumnMap,
  onSaveAuditRecord,
  onDeleteAuditRecord,
  onNotify
}) => {
  const initialLibSnap = useMemo(() => getLibraryTabNavSnapshot(), []);

  // Search & Advanced Column Filter State (با بازیابی پایدار از حافظه ناوبری)
  const [searchQuery, setSearchQuery] = useState(initialLibSnap.searchQuery || '');
  const [authorQuery, setAuthorQuery] = useState(initialLibSnap.authorQuery || '');
  const [authorStatusFilter, setAuthorStatusFilter] = useState<'all' | 'has_author' | 'missing_author'>(
    initialLibSnap.authorStatusFilter || 'all'
  );
  const [publisherQuery, setPublisherQuery] = useState(initialLibSnap.publisherQuery || '');
  const [publisherFilter, setPublisherFilter] = useState<string>(
    initialLibSnap.publisherFilter && initialLibSnap.publisherFilter !== 'همه ناشران'
      ? initialLibSnap.publisherFilter
      : 'all'
  );
  const [categoryFilter, setCategoryFilter] = useState<string>(
    initialLibSnap.categoryFilter && initialLibSnap.categoryFilter !== 'همه دسته‌ها'
      ? initialLibSnap.categoryFilter
      : 'all'
  );
  const [shelfFilter, setShelfFilter] = useState<string>(
    initialLibSnap.shelfFilter && initialLibSnap.shelfFilter !== 'همه قفسه‌ها'
      ? initialLibSnap.shelfFilter
      : 'all'
  );
  // به صورت پیش‌فرض فیلتر ستونی بسته باشد تا صفحه در بدو ورود خلوت باشد
  const [showAdvancedColumnFilters, setShowAdvancedColumnFilters] = useState<boolean>(false);
  const [auditFilter, setAuditFilter] = useState<
    | 'all'
    | 'unaudited'
    | 'audited'
    | 'not_found_in_round'
    | 'incomplete_or_review'
    | 'outside_excel'
    | 'expected_acquisition'
  >(
    initialLibSnap.auditFilter && initialLibSnap.auditFilter !== 'همه وضعیت‌ها'
      ? (initialLibSnap.auditFilter as
          | 'all'
          | 'unaudited'
          | 'audited'
          | 'not_found_in_round'
          | 'incomplete_or_review'
          | 'outside_excel'
          | 'expected_acquisition')
      : 'all'
  );
  const [visibleLimit, setVisibleLimit] = useState<number>(initialLibSnap.visibleLimit || 12);
  const [showExcelLoaderSection, setShowExcelLoaderSection] = useState<boolean>(false);
  const [showColumnMapper, setShowColumnMapper] = useState(false);
  // فهرست کتاب‌ها در بخش ۲: در بدو ورود به صفحه بسته باشد و وقتی کاربر باز کرد، حین عملیات ثبت بسته نشود تا خودش ببندد
  const [showBooksListDrawer, setShowBooksListDrawer] = useState<boolean>(false);
  const [showSection3Drawer, setShowSection3Drawer] = useState<boolean>(false);
  const [section3Mode, setSection3Mode] = useState<'selected' | 'new'>('selected');
  const [showOptionalBiblioFields, setShowOptionalBiblioFields] = useState<boolean>(false);

  const [movingCopyId, setMovingCopyId] = useState<string | null>(null);
  const [moveTargetShelf, setMoveTargetShelf] = useState<ShelfCode>('SH-01');
  const [moveTargetLevel, setMoveTargetLevel] = useState<LevelCode>('T02');
  const [moveReason, setMoveReason] = useState('بازچینی قفسه مرکز اسناد');

  // Selected Catalog Row
  const [selectedRow, setSelectedRow] = useState<ReferenceCatalogRow | null>(null);

  // Batch Shelf Lock Mode (قفل قفسه و طبقه برای ثبت سریع پیاپی در یک طبقه)
  const [isShelfLocked, setIsShelfLocked] = useState(false);

  // Form Fields for Physical Audit (Section 3 & Quick Inline Drawer)
  const [categoryValue, setCategoryValue] = useState<string>('');
  const [shelfValue, setShelfValue] = useState<ShelfCode | ''>('');
  const [levelValue, setLevelValue] = useState<LevelCode | ''>('');
  const [physicalStatus, setPhysicalStatus] = useState<'verified' | 'review' | 'not_found'>('verified');
  // قابلیت انتخاب هم‌زمان «نیازمند بررسی» با «موجود و تأییدشده» (و غیرفعال شدن هر دو با انتخاب «پیدا نشد»)
  const [needsReviewFlag, setNeedsReviewFlag] = useState<boolean>(false);
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

  // Outside-List / New Book Entry State (ادغام‌شده در کشوی واحد بخش ۳)
  const [outsideTitle, setOutsideTitle] = useState('');
  const [outsideAuthor, setOutsideAuthor] = useState('');
  const [outsidePublisher, setOutsidePublisher] = useState('');
  const [outsideYear, setOutsideYear] = useState('');
  const [outsideCategory, setOutsideCategory] = useState<string>(SUBJECT_CATEGORIES[0].label);
  const [outsideShelf, setOutsideShelf] = useState<ShelfCode>('SH-01');
  const [outsideLevel, setOutsideLevel] = useState<LevelCode>('T01');
  const [outsideNotes, setOutsideNotes] = useState('');
  const [lastOutsideSavedBanner, setLastOutsideSavedBanner] = useState<{
    title: string;
    tempBookId: string;
    copyId: string;
    location: string;
  } | null>(null);
  const [lastTouchedRowKey, setLastTouchedRowKey] = useState<string>(
    initialLibSnap.lastTouchedRowKey || ''
  );

  // همگام‌سازی خودکار وضعیت برگه کتابخانه در مخزن ناوبری برای حفظ فیلتر، جست‌وجو و ردیف انتخاب‌شده
  useEffect(() => {
    saveLibraryTabNavSnapshot({
      searchQuery,
      authorQuery,
      authorStatusFilter,
      publisherQuery,
      publisherFilter,
      categoryFilter,
      shelfFilter,
      auditFilter,
      visibleLimit,
      selectedRowKey: selectedRow?.rowKey || null,
      lastTouchedRowKey
    });
  }, [
    searchQuery,
    authorQuery,
    authorStatusFilter,
    publisherQuery,
    publisherFilter,
    categoryFilter,
    shelfFilter,
    auditFilter,
    visibleLimit,
    selectedRow,
    lastTouchedRowKey
  ]);

  // دریافت عبارت جست‌وجوی ارسالی از صفحه خانه
  useEffect(() => {
    if (initialSearchQuery !== undefined && initialSearchQuery !== '') {
      setSearchQuery(initialSearchQuery);
      setAuditFilter('all');
      setVisibleLimit(20);
      if (onClearInitialSearchQuery) {
        onClearInitialSearchQuery();
      }
    }
  }, [initialSearchQuery, onClearInitialSearchQuery]);

  // ثبت کشوی باز کتاب در پشته بازگشت (Back) بدون بستن فهرست کتاب‌ها حین کار
  useEffect(() => {
    if (!showSection3Drawer && !selectedRow) return;
    return registerInnerBackStep('quick-inventory-drawer', () => {
      if (showSection3Drawer) {
        setShowSection3Drawer(false);
      } else if (selectedRow) {
        const keyToKeep = selectedRow.rowKey;
        setLastTouchedRowKey(keyToKeep);
        setSelectedRow(null);
        setTimeout(() => {
          const elem = document.getElementById(`book-item-${keyToKeep}`);
          elem?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 40);
      }
    });
  }, [showSection3Drawer, selectedRow]);

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

  // Handle Excel (.xlsx/.xls/.csv) or JSON file selection
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
  const handleSelectRow = (row: ReferenceCatalogRow, openSection3 = false) => {
    setSelectedRow(row);
    setSection3Mode('selected');
    if (openSection3) {
      setShowSection3Drawer(true);
    }
    const existing = auditRecords[row.rowKey];
    const autoCopyId = `CP-${String(Math.max(1, row.rowIndex - 1)).padStart(6, '0')}`;

    if (existing) {
      setCategoryValue(existing.category);
      setShelfValue(existing.shelf);
      setLevelValue(existing.level);
      setPhysicalStatus(existing.physical);
      setNeedsReviewFlag(
        Boolean(
          existing.needsReview ||
            existing.physical === 'review' ||
            existing.copyStatus === 'pending_review'
        )
      );
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
      if (!isShelfLocked) {
        const matchedCat = SUBJECT_CATEGORIES.find(
          (c) => c.code === row.categoryRaw || c.label === row.categoryRaw
        );
        setCategoryValue(matchedCat ? matchedCat.label : '');
        setShelfValue('');
        setLevelValue('');
      }
      setPhysicalStatus('verified');
      setNeedsReviewFlag(false);
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

  // Smart Category Selection
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

  // Smart Shelf & Level Selection
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

  // Convert outside-list records into catalog format (sorted newest first!)
  const outsideCatalogRows: ReferenceCatalogRow[] = useMemo(() => {
    return Object.values(auditRecords)
      .filter((r) => r.source === 'outside-list')
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .map((r, i) => ({
        rowKey: r.key,
        rowIndex: 10000 + i,
        tempBookId: r.tempBookId || `OUT-${i + 1}`,
        titleRaw: r.title,
        publisherRaw: r.publisher || '',
        descriptionRaw: r.notes || '',
        categoryRaw: r.category || '',
        authorRaw: r.author || '',
        isbnRaw: r.isbn || '',
        fipaRaw: r.fipa || '',
        registrationNoRaw: r.registrationNo || '',
        locationRaw: r.location || '',
        countedCopiesRaw: r.countedCopies || '1',
        reviewStatusRaw:
          r.physical === 'verified' && r.copyStatus === 'verified_present'
            ? 'تأییدشده کارشناس (خارج از فهرست اولیه ۹۸۰ کتاب)'
            : 'ثبت‌شده — در انتظار تأیید کارشناس (خارج از فهرست اولیه ۹۸۰ کتاب)',
        noteRaw: r.notes || '',
        backupSourceSheet: 'کتاب‌های خارج از فهرست',
        backupSourceRow: String(i + 1),
        allValues: [r.tempBookId, r.title, r.publisher, r.notes, r.category, r.author]
      }));
  }, [auditRecords]);

  // Unique Publishers with counts across all books
  const uniquePublishers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of [...outsideCatalogRows, ...catalogRows]) {
      const pub = (r.publisherRaw || 'نامشخص').trim();
      counts.set(pub, (counts.get(pub) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [catalogRows, outsideCatalogRows]);

  // بهینه‌سازی سرعت جست‌وجو: پیش‌فرآوری و ایندکس کردن یک‌باره پیوندهای شهدا (بجای حلقه 980*836 در هر کلید کیبورد)
  const linksIndex = useMemo(() => {
    const byBookId = new Map<string, BookMartyrLinkRecord[]>();
    const byNormTitle = new Map<string, BookMartyrLinkRecord[]>();

    for (const lnk of bookMartyrLinks) {
      if (!lnk.martyrNameRaw || lnk.martyrNameRaw === '*') continue;
      if (lnk.tempBookId) {
        const list = byBookId.get(lnk.tempBookId) || [];
        list.push(lnk);
        byBookId.set(lnk.tempBookId, list);
      }
      const t1 = normalizePersianText(lnk.bookTitleRaw);
      if (t1) {
        const list = byNormTitle.get(t1) || [];
        list.push(lnk);
        byNormTitle.set(t1, list);
      }
      const t2 = normalizePersianText(lnk.alternativeTitle || '');
      if (t2 && t2 !== t1) {
        const list = byNormTitle.get(t2) || [];
        list.push(lnk);
        byNormTitle.set(t2, list);
      }
    }
    return { byBookId, byNormTitle };
  }, [bookMartyrLinks]);

  const getLinksForBookRow = React.useCallback(
    (row: ReferenceCatalogRow): BookMartyrLinkRecord[] => {
      const resultMap = new Map<string, BookMartyrLinkRecord>();
      if (row.tempBookId) {
        const idMatches = linksIndex.byBookId.get(row.tempBookId);
        if (idMatches) {
          for (const m of idMatches) resultMap.set(m.id, m);
        }
      }
      const normTitle = normalizePersianText(row.titleRaw);
      if (normTitle) {
        const titleMatches = linksIndex.byNormTitle.get(normTitle);
        if (titleMatches) {
          for (const m of titleMatches) resultMap.set(m.id, m);
        }
      }
      return Array.from(resultMap.values());
    },
    [linksIndex]
  );

  // Linked martyrs for the currently selected book
  const selectedBookMartyrLinks = useMemo(() => {
    if (!selectedRow) return [];
    return getLinksForBookRow(selectedRow);
  }, [selectedRow, getLinksForBookRow]);

  // Category counts across the catalog + outside books
  const categoryCounts = useMemo(() => {
    const allPool = [...outsideCatalogRows, ...catalogRows];
    const map: Record<string, number> = { all: allPool.length };
    for (const cat of SUBJECT_CATEGORIES) {
      map[cat.code] = 0;
    }
    for (const r of allPool) {
      const savedRec = auditRecords[r.rowKey];
      const effectiveCat = savedRec
        ? savedRec.category.split(' ')[0]
        : r.categoryRaw?.trim().split(' ')[0] || 'UNSET';
      map[effectiveCat] = (map[effectiveCat] || 0) + 1;
    }
    return map;
  }, [catalogRows, outsideCatalogRows, auditRecords]);

  // Source rows pool depending on auditFilter (حالا در حالت all کتاب‌های ثبت‌شده جدید هم در صدر لیست هستند!)
  const sourceRowsPool = useMemo(() => {
    if (auditFilter === 'outside_excel') {
      return outsideCatalogRows;
    }
    return [...outsideCatalogRows, ...catalogRows];
  }, [catalogRows, outsideCatalogRows, auditFilter]);

  // پیش‌محاسبه متن جست‌وجوی نرمال‌شده برای هر ردیف تا تایپ در کادر جست‌وجو ۱۰۰٪ آنی و بدون لگ باشد
  const precomputedSearchMap = useMemo(() => {
    const map = new Map<
      string,
      {
        haystack: string;
        pubNorm: string;
        authNorm: string;
        effectivePublisher: string;
        effectiveAuthor: string;
        effectiveCat: string;
        effectiveLoc: string;
      }
    >();

    for (const r of sourceRowsPool) {
      const savedRec = auditRecords[r.rowKey];
      const effectivePublisher = (savedRec?.publisher || r.publisherRaw || 'نامشخص').trim();
      const effectiveAuthor = (savedRec?.author || r.authorRaw || '').trim();
      const authorAndDesc = `${effectiveAuthor} ${r.descriptionRaw || ''}`.trim();
      const effectiveCat = savedRec
        ? savedRec.category.split(' ')[0]
        : r.categoryRaw?.trim().split(' ')[0] || 'UNSET';
      const effectiveLoc = savedRec?.location || r.locationRaw || '';

      const rowLinks = getLinksForBookRow(r);
      const linkedMartyrsText =
        rowLinks.length > 0
          ? rowLinks
              .map(
                (l) =>
                  `${l.martyrNameRaw} ${l.sourceDescriptionRaw || ''} ${l.pageReferenceRaw || ''} ${l.alternativeTitle || ''}`
              )
              .join(' ')
          : '';

      const haystack = normalizePersianText(
        `${r.tempBookId} ${r.titleRaw} ${effectivePublisher} ${r.descriptionRaw} ${effectiveAuthor} ${linkedMartyrsText}`
      );

      map.set(r.rowKey, {
        haystack,
        pubNorm: normalizePersianText(effectivePublisher),
        authNorm: normalizePersianText(authorAndDesc),
        effectivePublisher,
        effectiveAuthor,
        effectiveCat,
        effectiveLoc
      });
    }
    return map;
  }, [sourceRowsPool, auditRecords, getLinksForBookRow]);

  // Filtered Catalog Rows (فوق‌سریع و بدون هیچ مکثی هنگام تایپ)
  const allMatchingRows = useMemo(() => {
    const q = normalizePersianText(searchQuery);
    const qWords = q ? q.split(' ').filter(Boolean) : [];
    const authQ = normalizePersianText(authorQuery);
    const authWords = authQ ? authQ.split(' ').filter(Boolean) : [];
    const pubQ = normalizePersianText(publisherQuery);
    const pubWords = pubQ ? pubQ.split(' ').filter(Boolean) : [];

    return sourceRowsPool.filter((r) => {
      const savedRec = auditRecords[r.rowKey];
      const isOutside = r.backupSourceSheet === 'کتاب‌های خارج از فهرست' || savedRec?.source === 'outside-list';
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
        const isMarkedReview =
          savedRec?.physical === 'review' ||
          savedRec?.needsReview === true ||
          savedRec?.copyStatus === 'pending_review' ||
          r.reviewStatusRaw?.includes('بررسی') ||
          r.reviewStatusRaw?.includes('انتظار تأیید');
        if (!isMissingFields && !isMarkedReview) return false;
      }
      if (auditFilter === 'outside_excel' && !isOutside) {
        return false;
      }
      if (auditFilter === 'expected_acquisition') return false;

      const meta = precomputedSearchMap.get(r.rowKey);
      if (!meta) return false;

      // 1. Publisher Filter
      if (publisherFilter !== 'all' && meta.effectivePublisher !== publisherFilter) {
        return false;
      }
      if (pubWords.length > 0 && !pubWords.every((w) => meta.pubNorm.includes(w))) {
        return false;
      }

      // 2. Author Filter
      if (authorStatusFilter === 'has_author' && !meta.effectiveAuthor) return false;
      if (authorStatusFilter === 'missing_author' && Boolean(meta.effectiveAuthor)) return false;
      if (authWords.length > 0 && !authWords.every((w) => meta.authNorm.includes(w))) {
        return false;
      }

      // 3. Subject Category Filter
      if (categoryFilter !== 'all' && meta.effectiveCat !== categoryFilter) {
        return false;
      }

      // 4. Shelf Filter
      if (shelfFilter !== 'all' && !meta.effectiveLoc.startsWith(shelfFilter)) {
        return false;
      }

      // 5. General / Title / ID / Linked Martyr Query
      if (qWords.length === 0) return true;
      return qWords.every((word) => meta.haystack.includes(word));
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
    auditRecords,
    precomputedSearchMap
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
    setShowSection3Drawer(false);
    setVisibleLimit(12);
    onNotify('تمامی فیلترها، کادرهای جست‌وجو و انتخاب قبلی پاک و رفرش شدند.');
  };

  const filteredRows = useMemo(
    () => allMatchingRows.slice(0, visibleLimit),
    [allMatchingRows, visibleLimit]
  );

  const handleExecuteSearch = () => {
    setShowBooksListDrawer(true);
    if (filteredRows.length > 0) {
      handleSelectRow(filteredRows[0], false);
      onNotify(
        `🔎 ${toPersianDigits(allMatchingRows.length)} کتاب یافت شد؛ «${filteredRows[0].titleRaw}» انتخاب شد.`
      );
    } else if (searchQuery.trim()) {
      setSelectedRow(null);
      onNotify(
        `کتابی با عبارت «${searchQuery.trim()}» در فهرست پیدا نشد. می‌توانید در بخش ۳ آن را به عنوان کتاب جدید ثبت کنید.`,
        'warning'
      );
    } else {
      onNotify('لطفاً نام کتاب، نویسنده یا ناشر را برای جست‌وجو وارد کنید.', 'warning');
    }
  };

  // تأیید کارشناسی کتاب خارج از فهرست اولیه (با پرسش دوم تأیید نهایی)
  const handleApproveOutsideRecord = (recordKey: string) => {
    const existing = auditRecords[recordKey];
    if (!existing) return;
    requestActionConfirmation({
      variant: 'confirm',
      title: 'پرسش دوم: تأیید نهایی کارشناسی کتاب جدید',
      message: `آیا از تأیید نهایی کارشناسی کتاب «${existing.title}» (${existing.tempBookId}) اطمینان دارید؟`,
      details: [
        `عنوان کتاب: ${existing.title}`,
        `شناسه: ${existing.tempBookId} · نسخه: ${existing.copyId || '—'}`,
        `محل نگهداری: ${existing.location || '—'} · دسته: ${existing.category || '—'}`
      ],
      confirmLabel: 'بله، تأیید نهایی کارشناس ثبت شود',
      onConfirm: () => {
        const updated: FieldAuditRecord = {
          ...existing,
          physical: 'verified',
          needsReview: false,
          copyStatus: 'verified_present',
          notes: existing.notes.replace(/در انتظار تأیید کارشناس/g, 'تأییدشده توسط کارشناس'),
          updatedAt: new Date().toISOString()
        };
        onSaveAuditRecord(updated);
        onNotify(`✅ کتاب «${existing.title}» (${existing.tempBookId}) توسط کارشناس تأیید نهایی شد.`);
      }
    });
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
      })
        .format(new Date())
        .replace(/\//g, '-');
    } catch {
      dateStr = new Date().toISOString().slice(0, 10);
    }

    let reportTitle = 'گزارش-موجودی-کتابخانه';
    if (auditFilter === 'audited') reportTitle = 'کتاب‌های-تأییدشده-قفسه';
    else if (auditFilter === 'outside_excel') reportTitle = 'کتاب‌های-خارج-از-فهرست-اکسل';
    else if (auditFilter === 'incomplete_or_review') reportTitle = 'کتاب‌های-دارای-اطلاعات-ناقص';
    else if (auditFilter === 'unaudited') reportTitle = 'کتاب‌های-بررسی‌نشده-قفسه';
    else if (auditFilter === 'not_found_in_round') reportTitle = 'کتاب‌های-پیدانشده-در-نوبت-بررسی';
    else if (searchQuery.trim())
      reportTitle = `جست‌وجوی-${searchQuery.trim().slice(0, 15).replace(/\s+/g, '_')}`;

    const excelRows = allMatchingRows.map((r, idx) => {
      const rec = auditRecords[r.rowKey];
      const linkedMartyrs = getLinksForBookRow(r)
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
          rec?.source === 'outside-list'
            ? rec.physical === 'verified' && rec.copyStatus === 'verified_present' && !rec.needsReview
              ? 'خارج از فهرست اولیه — تأییدشده کارشناس'
              : 'خارج از فهرست اولیه — در انتظار تأیید کارشناس'
            : rec?.physical === 'verified'
            ? rec.needsReview || rec.copyStatus === 'pending_review'
              ? 'تأییدشده در قفسه (همراه با نیازمند بررسی)'
              : 'تأییدشده در قفسه'
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

    // شیت دوم: ریز ارتباط‌های کتاب و شهید برای تمام کتاب‌های دارای یک یا چند شهید در فیلتر جاری
    const relationRows: Record<string, string | number>[] = [];
    let relIdx = 1;
    for (const r of allMatchingRows) {
      const rec = auditRecords[r.rowKey];
      const bookLinks = getLinksForBookRow(r);
      for (const lnk of bookLinks) {
        relationRows.push({
          'ردیف': relIdx++,
          'شناسه کتاب': r.tempBookId,
          'عنوان کتاب': rec?.title || r.titleRaw,
          'ناشر': rec?.publisher || r.publisherRaw || '—',
          'نام شهید مرتبط': lnk.martyrNameRaw || '—',
          'قطعه مزار': lnk.gravePieceRaw || '—',
          'ردیف مزار': lnk.graveRowRaw || '—',
          'شماره مزار': lnk.graveNumberRaw || '—',
          'صفحه / ارجاع در کتاب': lnk.pageReferenceRaw || '—',
          'توضیحات ارتباط': lnk.sourceDescriptionRaw || '—',
          'وضعیت بررسی ارتباط': lnk.reviewStatus || '—',
          'محل نگهداری کتاب': rec?.location || r.locationRaw || '—'
        });
      }
    }
    if (relationRows.length > 0) {
      const wsRel = XLSX.utils.json_to_sheet(relationRows);
      XLSX.utils.book_append_sheet(wb, wsRel, 'ریز ارتباط کتاب و شهید');
    }

    const fileName = `${reportTitle}-${dateStr}.xlsx`;
    XLSX.writeFile(wb, fileName);
    onNotify(
      `فایل اکسل «${fileName}» شامل ${toPersianDigits(excelRows.length)} کتاب با تاریخ روز (${dateStr}) دانلود شد.`
    );
  };

  // Core Save Catalog Book Record (ثبت سریع قفسه بدون پنجره تأیید دومرحله‌ای و با حفظ محل کتاب در لیست)
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
        'برای کتابی که وضعیت آن «موجود و تأییدشده» است، انتخاب قفسه (SH-01..04) و طبقه (T01..06) الزامی است.',
        'warning'
      );
      return false;
    }

    const locationCode = shelfValue && levelValue ? `${shelfValue}-${levelValue}` : '';
    const autoCopyId =
      copyIdValue.trim() || `CP-${String(Math.max(1, targetRow.rowIndex - 1)).padStart(6, '0')}`;
    const existingRec = auditRecords[targetRow.rowKey];
    const isOutside =
      existingRec?.source === 'outside-list' ||
      targetRow.backupSourceSheet === 'کتاب‌های خارج از فهرست';

    const effectiveNeedsReview =
      physicalStatus === 'not_found'
        ? false
        : Boolean(needsReviewFlag || physicalStatus === 'review');

    const record: FieldAuditRecord = {
      key: targetRow.rowKey,
      source: isOutside ? 'outside-list' : 'catalog',
      sheet: isOutside ? existingRec?.sheet || 'خارج از فهرست مرجع' : currentSheetName,
      tempBookId: targetRow.tempBookId,
      copyId: autoCopyId,
      title: existingRec?.title || targetRow.titleRaw,
      author: authorOverride.trim() || targetRow.authorRaw,
      publisher: publisherOverride.trim() || targetRow.publisherRaw,
      year: yearOverride.trim() || existingRec?.year || '',
      isbn: isbnOverride.trim() || targetRow.isbnRaw,
      fipa: fipaOverride.trim() || targetRow.fipaRaw,
      registrationNo: regNoOverride.trim() || targetRow.registrationNoRaw,
      descriptionRaw: existingRec?.descriptionRaw || targetRow.descriptionRaw,
      category: categoryValue,
      shelf: shelfValue,
      level: levelValue,
      location: locationCode,
      physical: physicalStatus,
      needsReview: effectiveNeedsReview,
      copyStatus:
        physicalStatus === 'not_found'
          ? 'missing'
          : effectiveNeedsReview
          ? 'pending_review'
          : 'verified_present',
      physicalCondition,
      countedCopies: countedCopies.trim() || '1',
      notes: notesValue.trim(),
      backupSourceSheet: targetRow.backupSourceSheet,
      backupSourceRow: targetRow.backupSourceRow,
      updatedAt: new Date().toISOString()
    };

    onSaveAuditRecord(record);
    setLastTouchedRowKey(targetRow.rowKey);

    if (advanceToNextRow) {
      onNotify(
        `✅ کتاب «${targetRow.titleRaw}» (${autoCopyId}) ثبت شد و کتاب بعدی باز شد.`
      );
      handleSelectRow(advanceToNextRow);
      setTimeout(() => {
        const nextElem = document.getElementById(`book-item-${advanceToNextRow.rowKey}`);
        if (nextElem) {
          nextElem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 70);
    } else {
      onNotify(
        `✅ تغییرات کتاب «${targetRow.titleRaw}» (${autoCopyId}) در محل ${locationCode || 'بدون محل'} ذخیره شد.`
      );
      // حفظ همان کتاب در حالت انتخاب‌شده و حفظ کامل جست‌وجو، فیلتر و اسکرول
      setTimeout(() => {
        const currentElem = document.getElementById(`book-item-${targetRow.rowKey}`);
        if (currentElem) {
          currentElem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);
    }
    return true;
  };

  // Save Catalog Book Audit (from Section 3 form submit)
  const handleSaveCatalogBook = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRow) {
      onNotify('ابتدا یک کتاب را از فهرست انتخاب کنید یا گزینه «ثبت کتاب جدید» را بزنید.', 'warning');
      return;
    }
    handleSaveCatalogBookRecord(selectedRow);
  };

  // Save Outside-List Book (در همان کشوی واحد بخش ۳)
  const handleSaveOutsideBook = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = outsideTitle.trim();
    if (!cleanTitle) {
      onNotify('لطفاً عنوان دقیق روی جلد کتاب را وارد کنید.', 'warning');
      return;
    }

    const chosenCat = outsideCategory || categoryValue || SUBJECT_CATEGORIES[0].label;
    const chosenShelf = (outsideShelf || shelfValue || 'SH-01') as ShelfCode;
    const chosenLevel = (outsideLevel || levelValue || 'T01') as LevelCode;
    const locationCode = `${chosenShelf}-${chosenLevel}`;

    requestActionConfirmation({
      variant: 'confirm',
      title: 'پرسش دوم: تأیید نهایی ثبت کتاب جدید (خارج از فهرست)',
      message: `آیا از ثبت نهایی کتاب جدید «${cleanTitle}» در محل ${locationCode} اطمینان دارید؟`,
      details: [
        `عنوان کتاب: ${cleanTitle}`,
        `نویسنده: ${outsideAuthor.trim() || 'ثبت‌نشده'} · ناشر: ${outsidePublisher.trim() || 'ثبت‌نشده'}`,
        `گروه موضوعی: ${chosenCat}`,
        `محل قفسه و طبقه: ${locationCode}`
      ],
      confirmLabel: 'بله، کتاب جدید ثبت شود',
      onConfirm: () => {
        const randomSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
        const recordKey = `OUT-${Date.now()}-${randomSuffix}`;
        const existingBookIds = Object.values(auditRecords).map((r) => r.tempBookId);
        const tempId = generateUniqueOutsideBookId(existingBookIds);
        const { copyId: generatedOutCopyId } = generateUniqueCopyId(bookCopies, tempId);
        const nowIso = new Date().toISOString();
        const nowFa = new Intl.DateTimeFormat('fa-IR').format(new Date());

        const record: FieldAuditRecord = {
          key: recordKey,
          source: 'outside-list',
          sheet: 'ثبت کتاب خارج از فهرست',
          tempBookId: tempId,
          copyId: generatedOutCopyId,
          title: cleanTitle,
          author: outsideAuthor.trim(),
          publisher: outsidePublisher.trim(),
          year: outsideYear.trim(),
          category: chosenCat,
          shelf: chosenShelf,
          level: chosenLevel,
          location: locationCode,
          physical: 'review',
          needsReview: true,
          copyStatus: 'pending_review',
          physicalCondition: 'healthy',
          countedCopies: '1',
          notes: outsideNotes.trim()
            ? `${outsideNotes.trim()} | خارج از فهرست اولیه ۹۸۰ کتاب — در انتظار تأیید کارشناس`
            : 'خارج از فهرست اولیه ۹۸۰ کتاب — در انتظار تأیید کارشناس',
          updatedAt: nowIso
        };

        onSaveAuditRecord(record);

        if (onAddBookCopy) {
          onAddBookCopy({
            copyId: generatedOutCopyId,
            bookId: tempId,
            bookTitle: cleanTitle,
            copyStatus: 'pending_review',
            shelf: chosenShelf,
            level: chosenLevel,
            location: locationCode,
            observedDate: nowFa,
            physicalCondition: 'healthy',
            loanOrMoveStatus: 'در قفسه مرکز اسناد',
            expertNote: 'ثبت کتاب خارج از فهرست اولیه (در انتظار تأیید کارشناس)',
            lastReviewedAt: nowFa,
            locationHistory: []
          });
        }

        setLastOutsideSavedBanner({
          title: cleanTitle,
          tempBookId: tempId,
          copyId: generatedOutCopyId,
          location: locationCode
        });

        setOutsideTitle('');
        setOutsideAuthor('');
        setOutsidePublisher('');
        setOutsideYear('');
        setOutsideNotes('');

        onNotify(
          `✅ کتاب جدید «${cleanTitle}» با شناسه موقت ${tempId} و نسخه ${generatedOutCopyId} در محل ${locationCode} ثبت شد (در انتظار تأیید کارشناس).`
        );
      }
    });
  };

  const totalCatalogCount = catalogRows.length;
  const totalSavedCount = Object.keys(auditRecords).length;
  const verifiedCount = Object.values(auditRecords).filter((r) => r.physical === 'verified').length;
  const outsideCount = outsideCatalogRows.length;

  return (
    <div className="space-y-4">
      {/* نوار خلاصه آمار بالای کتابخانه (بدون دکمه تکراری ثبت کتاب جدید) */}
      <div className="bg-white border border-[#E2D2BE] rounded-2xl p-3.5 shadow-2xs">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl px-3 py-2 text-center">
            <span className="text-[10.5px] text-[#6E5846] block">فهرست اولیه اکسل</span>
            <strong className="text-base sm:text-lg font-bold text-[#332218] tabular-nums">
              {toPersianDigits(totalCatalogCount)} کتاب
            </strong>
          </div>
          <div className="bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl px-3 py-2 text-center">
            <span className="text-[10.5px] text-[#6E5846] block">کل ثبت‌های میدانی</span>
            <strong className="text-base sm:text-lg font-bold text-[#332218] tabular-nums">
              {toPersianDigits(totalSavedCount)} مورد
            </strong>
          </div>
          <div className="bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl px-3 py-2 text-center">
            <span className="text-[10.5px] text-[#6E5846] block">تأییدشده در قفسه</span>
            <strong className="text-base sm:text-lg font-bold text-[#332218] tabular-nums">
              {toPersianDigits(verifiedCount)} جلد
            </strong>
          </div>
          <button
            type="button"
            onClick={() => {
              setAuditFilter(auditFilter === 'outside_excel' ? 'all' : 'outside_excel');
              setSelectedRow(null);
            }}
            className={`rounded-xl px-3 py-2 text-center border transition-colors cursor-pointer ${
              auditFilter === 'outside_excel'
                ? 'bg-[#6B3E26] text-white border-[#6B3E26]'
                : 'bg-[#FAF5EE] border-[#E2D2BE] hover:bg-[#F3E9DC]'
            }`}
            title="کلیک برای فیلتر کتاب‌های ثبت‌شده خارج از فهرست اولیه"
          >
            <span
              className={`text-[10.5px] block ${
                auditFilter === 'outside_excel' ? 'text-[#F5EFE6]' : 'text-[#6E5846]'
              }`}
            >
              ثبت جدید (خارج از فهرست)
            </span>
            <strong
              className={`text-base sm:text-lg font-bold tabular-nums ${
                auditFilter === 'outside_excel' ? 'text-white' : 'text-[#332218]'
              }`}
            >
              {toPersianDigits(outsideCount)} مورد
            </strong>
          </button>
        </div>
      </div>

      {/* بنر تأیید ثبت کتاب جدید در صورت ثبت موفق */}
      {lastOutsideSavedBanner && (
        <div className="bg-[#EDF6F0] border-2 border-[#A8D5B5] rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#1E4D2B] shadow-xs">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-[#2E6F40] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-sm text-[#1E4D2B]">
                ✅ کتاب جدید «{lastOutsideSavedBanner.title}» با موفقیت ثبت شد و به ابتدای لیست کتاب‌ها اضافه گردید!
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#1E4D2B]">
                <span className="font-mono bg-white px-2 py-0.5 rounded border border-[#A8D5B5]">
                  شناسه موقت: {lastOutsideSavedBanner.tempBookId}
                </span>
                <span className="font-mono bg-white px-2 py-0.5 rounded border border-[#A8D5B5]">
                  نسخه: {lastOutsideSavedBanner.copyId}
                </span>
                <span className="font-mono bg-white px-2 py-0.5 rounded border border-[#A8D5B5]">
                  محل: {lastOutsideSavedBanner.location}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSearchQuery(lastOutsideSavedBanner.title);
                setAuditFilter('all');
                setShowBooksListDrawer(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-[#6B3E26] text-white font-bold text-xs cursor-pointer"
            >
              نمایش در لیست جست‌وجو
            </button>
            <button
              type="button"
              onClick={() => setLastOutsideSavedBanner(null)}
              className="px-2.5 py-1.5 rounded-lg bg-white border border-[#D8C7B2] text-[#332218] text-xs cursor-pointer"
            >
              بستن پیام
            </button>
          </div>
        </div>
      )}

      {/* بخش ۱ (کشویی و جمع‌وجور): فقط عنوان سرفصل */}
      <section className="bg-white border border-[#E2D2BE] rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowExcelLoaderSection((prev) => !prev)}
          className="w-full px-4 py-3 flex items-center justify-between gap-2 text-right hover:bg-[#FAF5EE] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[#6B3E26] shrink-0" />
            <h2 className="text-xs sm:text-sm font-bold text-[#332218]">
              ۱. فهرست مرجع اکسل
            </h2>
          </div>
          <span className="text-xs font-semibold text-[#6B3E26] inline-flex items-center gap-1 shrink-0">
            <span>{showExcelLoaderSection ? 'بستن کشو' : 'باز کردن کشو'}</span>
            {showExcelLoaderSection ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </span>
        </button>

        {showExcelLoaderSection && (
          <div className="p-4 pt-2 border-t border-slate-100 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#edf4fa] text-[#162b3b] rounded-xl p-3 text-xs">
              <div>
                <span className="font-semibold">فایل فعال: </span>
                <span>{loadedFileName}</span>
                <span className="mx-1.5">·</span>
                <span>شیت: «{currentSheetName}»</span>
              </div>
              <button
                type="button"
                onClick={() => setShowColumnMapper((prev) => !prev)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>{showColumnMapper ? 'بستن تنظیم ستون‌ها' : 'تنظیم شیت و ستون‌ها'}</span>
              </button>
            </div>

            <label className="w-full min-h-[44px] px-4 py-2 bg-[#1f4e79] hover:bg-[#173b5c] text-white font-semibold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors">
              <Upload className="w-4 h-4 shrink-0" />
              <span>انتخاب و بارگذاری فایل اکسل جدید (.xlsx)</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

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
                      className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-slate-900"
                    >
                      {sheetNames.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">ستون عنوان کتاب *</label>
                    <select
                      value={columnMap.titleCol}
                      onChange={(e) =>
                        onUpdateColumnMap({ ...columnMap, titleCol: Number(e.target.value) })
                      }
                      className="w-full min-h-[38px] px-2 py-1 bg-white border border-slate-300 rounded-xl"
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
                      className="w-full min-h-[38px] px-2 py-1 bg-white border border-slate-300 rounded-xl"
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
                      className="w-full min-h-[38px] px-2 py-1 bg-white border border-slate-300 rounded-xl"
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
                      className="w-full min-h-[38px] px-2 py-1 bg-white border border-slate-300 rounded-xl"
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
          </div>
        )}
      </section>

      {/* بخش ۲: جست‌وجو و فیلتر پیشرفته کتاب‌ها */}
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
            {(activeFiltersCount > 0 || selectedRow) && (
              <button
                type="button"
                onClick={handleResetAllFilters}
                className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-[#B94A48] border border-rose-200 text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>پاک‌سازی فیلتر و انتخاب</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAdvancedColumnFilters((prev) => !prev)}
              className="px-2.5 py-1 rounded-lg bg-[#EAF1F7] hover:bg-blue-100 text-[#1F4E79] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>{showAdvancedColumnFilters ? 'بستن فیلتر ستونی ▴' : 'فیلتر ستونی (ناشر/نویسنده/قفسه) ▾'}</span>
            </button>
          </div>
        </div>

        {/* Primary Search Input */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  const nextVal = e.target.value;
                  setSearchQuery(nextVal);
                  setVisibleLimit(12);
                  if (selectedRow) {
                    setSelectedRow(null);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleExecuteSearch();
                  }
                }}
                placeholder="جست‌وجوی آنی عنوان کتاب، نویسنده، ناشر، نام شهید یا شناسه موقت..."
                autoComplete="off"
                className="w-full min-h-[46px] pr-10 pl-8 py-2.5 text-xs sm:text-sm bg-[#F5F7FA] border border-slate-300 rounded-xl text-[#253247] focus:bg-white focus:outline-none focus:border-[#1F4E79]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedRow(null);
                    setVisibleLimit(12);
                  }}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                  title="پاک کردن متن جست‌وجو و رفرش"
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
              title="پاک‌سازی کامل تمام کادرها و رفرش بخش ۳"
              className="min-h-[46px] px-2.5 sm:px-3 bg-white hover:bg-slate-100 text-[#755C48] border border-[#E6D5C1] font-bold text-xs rounded-xl inline-flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">رفرش</span>
            </button>
          </div>

          {(searchQuery.trim() || authorQuery.trim() || publisherQuery.trim() || auditFilter !== 'all') && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] px-3 py-1.5 bg-[#FAF2E8] border border-[#E6D5C1] rounded-lg text-[#755C48]">
              <span>
                🔎 نتیجه فیلتر فعلی: <strong className="text-[#8C3B2B]">{toPersianDigits(allMatchingRows.length)}</strong> کتاب
                {searchQuery.trim() ? ` برای عبارت «${searchQuery.trim()}»` : ''}
              </span>
              <button
                type="button"
                onClick={handleResetAllFilters}
                className="text-[#8C3B2B] font-bold hover:underline cursor-pointer"
              >
                پاک کردن فیلتر و نمایش همه
              </button>
            </div>
          )}
        </div>

        {/* Advanced Column Filters Panel */}
        {showAdvancedColumnFilters && (
          <div className="p-3.5 rounded-xl bg-[#F5F7FA] border border-slate-200/90 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#1F4E79]">
                فیلتر دقیق بر اساس دسته‌بندی موضوعی، ناشر، نویسنده و قفسه:
              </span>
              <button
                type="button"
                onClick={() => setShowAdvancedColumnFilters(false)}
                className="text-[11px] text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                بستن ✕
              </button>
            </div>

            {/* Subject Category Chips */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setCategoryFilter('all');
                  setVisibleLimit(12);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                  categoryFilter === 'all'
                    ? 'bg-[#1F4E79] text-white border-[#1F4E79]'
                    : 'bg-white text-[#253247] border-slate-200 hover:bg-slate-100'
                }`}
              >
                همه دسته‌ها ({toPersianDigits(categoryCounts.all || 0)})
              </button>
              {SUBJECT_CATEGORIES.map((cat) => (
                <button
                  key={cat.code}
                  type="button"
                  onClick={() => {
                    setCategoryFilter(cat.code === categoryFilter ? 'all' : cat.code);
                    setVisibleLimit(12);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                    categoryFilter === cat.code
                      ? 'bg-[#1F4E79] text-white border-[#1F4E79]'
                      : 'bg-white text-[#253247] border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {cat.code === 'UNSET' ? 'بدون دسته' : `${cat.code} (${cat.fullTitle})`}{' '}
                  <span className="opacity-80 tabular-nums">
                    ({toPersianDigits(categoryCounts[cat.code] || 0)})
                  </span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-[#253247] mb-1">
                  ستون ناشر:
                </label>
                <select
                  value={publisherFilter}
                  onChange={(e) => {
                    setPublisherFilter(e.target.value);
                    setSelectedRow(null);
                    setVisibleLimit(12);
                  }}
                  className="w-full min-h-[38px] px-2.5 py-1 bg-white border border-slate-300 rounded-xl text-xs text-[#253247]"
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
                  جست‌وجوی متنی در ناشر:
                </label>
                <input
                  type="search"
                  value={publisherQuery}
                  onChange={(e) => {
                    setPublisherQuery(e.target.value);
                    setSelectedRow(null);
                    setVisibleLimit(12);
                  }}
                  placeholder="مثلاً: سوره مهر، ابراهیم هادی، شاهد..."
                  className="w-full min-h-[38px] px-2.5 py-1 bg-white border border-slate-300 rounded-xl text-xs text-[#253247]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-[#253247] mb-1">
                  نویسنده / گردآورنده / راوی:
                </label>
                <input
                  type="search"
                  value={authorQuery}
                  onChange={(e) => {
                    setAuthorQuery(e.target.value);
                    setSelectedRow(null);
                    setVisibleLimit(12);
                  }}
                  placeholder="نام نویسنده یا راوی..."
                  className="w-full min-h-[38px] px-2.5 py-1 bg-white border border-slate-300 rounded-xl text-xs text-[#253247]"
                />
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-[11px] font-semibold text-[#253247] mb-1">
                    وضعیت نویسنده:
                  </label>
                  <select
                    value={authorStatusFilter}
                    onChange={(e) => {
                      setAuthorStatusFilter(
                        e.target.value as 'all' | 'has_author' | 'missing_author'
                      );
                      setSelectedRow(null);
                      setVisibleLimit(12);
                    }}
                    className="w-full min-h-[38px] px-2 py-1 bg-white border border-slate-300 rounded-xl text-[11px] text-[#253247]"
                  >
                    <option value="all">همه</option>
                    <option value="has_author">دارای نویسنده</option>
                    <option value="missing_author">بدون نویسنده</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#253247] mb-1">
                    فیلتر قفسه:
                  </label>
                  <select
                    value={shelfFilter}
                    onChange={(e) => {
                      setShelfFilter(e.target.value);
                      setSelectedRow(null);
                      setVisibleLimit(12);
                    }}
                    className="w-full min-h-[38px] px-2 py-1 bg-white border border-slate-300 rounded-xl text-[11px] text-[#253247]"
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

        {/* ردیف فیلتر وضعیت موجودی و دکمه خروجی اکسل */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
          <select
            value={auditFilter}
            onChange={(e) => {
              setAuditFilter(e.target.value as typeof auditFilter);
              setSelectedRow(null);
              setVisibleLimit(12);
            }}
            className="flex-1 min-h-[40px] px-3 py-1.5 bg-[#EAF1F7]/60 border border-[#1F4E79]/30 rounded-xl text-xs font-bold text-[#1F4E79] cursor-pointer"
          >
            <option value="all">
              ۱. همه کتاب‌ها ({toPersianDigits(totalCatalogCount + outsideCount)} مورد)
            </option>
            <option value="outside_excel">
              ۲. فقط کتاب‌های ثبت‌شده جدید / خارج از فهرست اولیه ({toPersianDigits(outsideCount)} مورد)
            </option>
            <option value="audited">
              ۳. مشاهده و تأییدشده در قفسه ({toPersianDigits(verifiedCount)} مورد)
            </option>
            <option value="unaudited">
              ۴. موجود در فهرست اما هنوز بررسی‌نشده در قفسه
            </option>
            <option value="not_found_in_round">
              ۵. موجود در فهرست اما پیدا نشده در نوبت بررسی فعلی
            </option>
            <option value="incomplete_or_review">
              ۶. نیازمند بررسی یا تأیید کارشناس / دارای اطلاعات ناقص
            </option>
          </select>

          <button
            type="button"
            data-testid="quick-inventory-excel-export-btn"
            onClick={handleExportCurrentFilterExcel}
            className="min-h-[40px] px-3.5 py-1.5 bg-[#2E6F40] hover:bg-[#235732] text-white text-xs font-bold rounded-xl inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer shrink-0"
            title="دریافت فایل اکسل از فهرست فعلی به تاریخ امروز"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>خروجی Excel ({toPersianDigits(allMatchingRows.length)})</span>
          </button>
        </div>

        {/* کشوی فهرست کتاب‌ها (بسته در بدو ورود به صفحه؛ پس از باز شدن، حین کار باز می‌ماند تا خود کاربر ببندد) */}
        <div className="border border-[#E2D2BE] rounded-xl overflow-hidden bg-[#FAF5EE]/60">
          <button
            type="button"
            onClick={() => setShowBooksListDrawer((prev) => !prev)}
            className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-right hover:bg-[#F3E9DC]/70 transition-colors cursor-pointer"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs sm:text-sm font-bold text-[#332218]">
                فهرست کتاب‌ها ({toPersianDigits(allMatchingRows.length)} مورد)
              </span>
              {selectedRow && (
                <span className="px-2 py-0.5 rounded-md bg-[#1f4e79] text-white text-[11px] font-bold">
                  انتخاب‌شده: {selectedRow.titleRaw}
                </span>
              )}
            </div>
            <span className="text-xs font-bold text-[#6B3E26] inline-flex items-center gap-1 shrink-0">
              <span>{showBooksListDrawer ? 'بستن فهرست کتاب‌ها' : 'مشاهده و باز کردن فهرست کتاب‌ها'}</span>
              {showBooksListDrawer ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </span>
          </button>

          {showBooksListDrawer && (
            <div className="p-2.5 border-t border-[#E2D2BE] bg-white space-y-2 max-h-[520px] overflow-y-auto">
              {filteredRows.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="font-bold">کتابی با این مشخصات در فهرست پیدا نشد.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (searchQuery.trim()) {
                        setOutsideTitle(searchQuery.trim());
                      }
                      setSection3Mode('new');
                      setShowSection3Drawer(true);
                      setTimeout(() => {
                        const el = document.getElementById('section-3-physical-audit');
                        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }, 60);
                    }}
                    className="min-h-[40px] px-3.5 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>ثبت به عنوان کتاب جدید در بخش ۳</span>
                  </button>
                </div>
              ) : (
                <>
                  {filteredRows.map((row, idx) => {
                    const savedRec = auditRecords[row.rowKey];
                    const isOutsideBook =
                      savedRec?.source === 'outside-list' ||
                      row.backupSourceSheet === 'کتاب‌های خارج از فهرست';
                    const isOutsideApproved =
                      isOutsideBook &&
                      savedRec?.physical === 'verified' &&
                      savedRec?.copyStatus === 'verified_present' &&
                      !savedRec?.needsReview;
                    const isChosen = selectedRow?.rowKey === row.rowKey;
                    const isLastTouched = !isChosen && lastTouchedRowKey === row.rowKey;
                    const nextRow = filteredRows[idx + 1];

                    return (
                      <div
                        id={`book-item-${row.rowKey}`}
                        key={row.rowKey}
                        className={`w-full rounded-2xl border transition-all text-right overflow-hidden ${
                          isChosen
                            ? 'border-2 border-[#1f4e79] bg-white shadow-md ring-2 ring-[#1f4e79]/15'
                            : isLastTouched
                            ? 'border-2 border-[#2E6F40] bg-emerald-50/50 shadow-sm ring-2 ring-[#2E6F40]/20'
                            : isOutsideBook
                            ? isOutsideApproved
                              ? 'border-emerald-300 bg-emerald-50/40 hover:bg-emerald-50/70'
                              : 'border-amber-300 bg-amber-50/40 hover:bg-amber-50/70'
                            : savedRec
                            ? 'border-emerald-300 bg-emerald-50/30 hover:bg-emerald-50/60'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        {/* Clickable Card Header */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setLastTouchedRowKey(row.rowKey);
                            if (isChosen) {
                              setSelectedRow(null);
                            } else {
                              handleSelectRow(row, false);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              if (isChosen) setSelectedRow(null);
                              else handleSelectRow(row, false);
                            }
                          }}
                          className="p-3 sm:p-3.5 cursor-pointer select-none transition-colors"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] mb-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className="font-mono tabular-nums font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200"
                                dir="ltr"
                              >
                                {row.tempBookId}
                              </span>
                              {isOutsideBook ? (
                                <span className="px-2 py-0.5 rounded-md bg-[#8C3B2B]/10 text-[#8C3B2B] border border-[#8C3B2B]/25 font-bold text-[10.5px]">
                                  ثبت جدید (خارج از فهرست)
                                </span>
                              ) : (
                                <span className="text-slate-500 font-medium">
                                  ردیف {toPersianDigits(row.rowIndex)}
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              {isOutsideBook ? (
                                isOutsideApproved ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300">
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    <span>
                                      تأییدشده کارشناس · {savedRec?.location || row.locationRaw || 'بدون محل'}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                                    <span>
                                      در انتظار تأیید کارشناس ({savedRec?.location || row.locationRaw || 'بدون محل'})
                                    </span>
                                  </span>
                                )
                              ) : savedRec ? (
                                savedRec.physical === 'verified' ? (
                                  <div className="flex flex-wrap items-center gap-1">
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>
                                        ثبت‌شده در {savedRec.location || 'بدون محل'} ({savedRec.category?.split(' ')[0] || '—'})
                                      </span>
                                    </span>
                                    {(savedRec.needsReview || savedRec.copyStatus === 'pending_review') && (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300">
                                        <AlertCircle className="w-3.5 h-3.5" />
                                        <span>نیازمند بررسی</span>
                                      </span>
                                    )}
                                  </div>
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

                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="font-bold text-sm sm:text-base text-slate-900 leading-snug">
                                {row.titleRaw || '(بدون عنوان)'}
                              </div>
                              <div className="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                {(savedRec?.author || row.authorRaw) && (
                                  <span className="font-medium text-slate-700">
                                    نویسنده: <span className="text-slate-900 font-bold">{savedRec?.author || row.authorRaw}</span>
                                  </span>
                                )}
                                {(savedRec?.publisher || row.publisherRaw) && (
                                  <span>
                                    ناشر: <span className="text-slate-800 font-medium">{savedRec?.publisher || row.publisherRaw}</span>
                                  </span>
                                )}
                                {savedRec?.year && (
                                  <span>
                                    سال چاپ: <span className="text-slate-800 font-medium">{savedRec.year}</span>
                                  </span>
                                )}
                                {savedRec?.notes && (
                                  <span className="text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                    توضیحات: {savedRec.notes}
                                  </span>
                                )}
                              </div>
                            </div>

                            {isOutsideBook && (
                              <div
                                className="flex items-center gap-1.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {!isOutsideApproved && (
                                  <button
                                    type="button"
                                    onClick={() => handleApproveOutsideRecord(row.rowKey)}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] cursor-pointer"
                                  >
                                    ✓ تأیید کارشناس
                                  </button>
                                )}
                                {onDeleteAuditRecord && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onDeleteAuditRecord(row.rowKey);
                                    }}
                                    className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-100 border border-rose-200 bg-white cursor-pointer"
                                    title="حذف این کتاب ثبت‌شده"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {/* نمایش شهدای مرتبط با این کتاب */}
                          {(() => {
                            const rowLinks = getLinksForBookRow(row);
                            if (rowLinks.length === 0) return null;
                            return (
                              <div className="mt-2 pt-2 border-t border-amber-200/70 bg-amber-50/60 rounded-xl px-2.5 py-1.5 space-y-1">
                                <div className="flex items-center justify-between text-[11px] font-bold text-[#8C3B2B]">
                                  <span>
                                    شهدای مرتبط ثبت‌شده در پژوهش ({toPersianDigits(rowLinks.length)} مورد):
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {rowLinks.slice(0, 6).map((lnk) => (
                                    <span
                                      key={lnk.id}
                                      className="text-[11px] text-slate-800 bg-white px-2 py-0.5 rounded-md border border-amber-200/80"
                                    >
                                      <strong>{lnk.martyrNameRaw}</strong>
                                      {lnk.pageReferenceRaw ? ` (ص ${toPersianDigits(lnk.pageReferenceRaw)})` : ''}
                                    </span>
                                  ))}
                                  {rowLinks.length > 6 && (
                                    <span className="text-[11px] text-slate-500 px-1">
                                      + {toPersianDigits(rowLinks.length - 6)} مورد دیگر
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })()}

                          {!isChosen && (
                            <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-[#1f4e79]">
                              <span className="flex items-center gap-1 font-semibold">
                                <SlidersHorizontal className="w-3.5 h-3.5" />
                                <span>کلیک برای باز شدن کشوی ثبت سریع قفسه و طبقه</span>
                              </span>
                              <span className="text-slate-400 text-[10.5px] flex items-center gap-0.5">
                                <span>باز کردن کشو</span>
                                <ChevronDown className="w-3.5 h-3.5" />
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Inline Quick Inventory Accordion */}
                        {isChosen && (
                          <div className="border-t-2 border-[#1f4e79]/30 bg-blue-50/40 p-3.5 sm:p-4 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-blue-200/70">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-xs sm:text-sm font-bold text-[#1f4e79]">
                                  کشوی ثبت سریع در قفسه — {row.titleRaw} ({row.tempBookId})
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSection3Mode('selected');
                                    setShowSection3Drawer(true);
                                    setTimeout(() => {
                                      const el = document.getElementById('section-3-physical-audit');
                                      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    }, 60);
                                  }}
                                  className="text-[11px] font-bold text-[#1f4e79] bg-white px-2.5 py-1 rounded-lg border border-blue-200 hover:bg-blue-50 cursor-pointer"
                                >
                                  جزئیات کامل در بخش ۳ ↓
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSelectedRow(null)}
                                  className="text-xs text-slate-600 hover:text-slate-900 px-2 py-1 rounded-lg bg-white border border-slate-200 flex items-center gap-1 cursor-pointer"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                  <span>بستن کشو</span>
                                </button>
                              </div>
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
                                      className={`p-2 rounded-xl text-right border transition-all text-xs flex flex-col justify-between min-h-[48px] cursor-pointer ${
                                        isCatActive
                                          ? 'bg-[#1f4e79] text-white border-[#1f4e79] shadow-sm font-bold'
                                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
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
                            <div className="space-y-2 bg-white p-3 rounded-xl border border-slate-200">
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
                                    className={`px-2 py-1 rounded-md text-[11px] border flex items-center gap-1 cursor-pointer ${
                                      isShelfLocked
                                        ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
                                        : 'bg-slate-100 text-slate-600 border-slate-200'
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

                              <div className="grid grid-cols-4 gap-1.5">
                                {SHELVES.map((sh) => {
                                  const isShActive = shelfValue === sh.code;
                                  return (
                                    <button
                                      key={sh.code}
                                      type="button"
                                      onClick={() => setShelfValue(sh.code)}
                                      className={`py-2 px-1 rounded-xl text-center text-xs font-bold border transition-all cursor-pointer ${
                                        isShActive
                                          ? 'bg-[#1f4e79] text-white border-[#1f4e79]'
                                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                      }`}
                                    >
                                      <div>{sh.code}</div>
                                    </button>
                                  );
                                })}
                              </div>

                              <div className="grid grid-cols-6 gap-1">
                                {LEVELS.map((lv) => {
                                  const isLvActive = levelValue === lv.code;
                                  return (
                                    <button
                                      key={lv.code}
                                      type="button"
                                      onClick={() => setLevelValue(lv.code)}
                                      className={`py-1.5 px-0.5 rounded-lg text-center text-xs font-bold border transition-all cursor-pointer ${
                                        isLvActive
                                          ? 'bg-teal-700 text-white border-teal-700'
                                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                      }`}
                                    >
                                      <div>{lv.code}</div>
                                      <div className="text-[9px] opacity-80 font-normal">
                                        ط {toPersianDigits(lv.number)}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* توضیحات لازم زیر بخش ۲ (برای ثبت امانت یا یادداشت فوری پای قفسه) */}
                            <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                              <label className="block text-xs font-bold text-slate-800">
                                توضیحات لازم (در صورت امانت یا یادداشت قفسه):
                              </label>
                              <input
                                type="text"
                                value={notesValue}
                                onChange={(e) => setNotesValue(e.target.value)}
                                placeholder="مثلاً: به امانت داده شده / نیازمند بررسی جلد یا صفحه..."
                                className="w-full min-h-[38px] px-3 py-1.5 bg-[#F5F7FA] focus:bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-[#1f4e79]"
                              />
                            </div>

                            {/* 3. Physical Presence Status (با قابلیت انتخاب هم‌زمان «نیازمند بررسی» با «موجود و تأییدشده») */}
                            <div className="grid grid-cols-3 gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  if (physicalStatus === 'verified' && needsReviewFlag) {
                                    // اگر هر دو فعال بودند و کاربر روی موجود کلیک کرد، فقط نیازمند بررسی باقی بماند
                                    setPhysicalStatus('review');
                                  } else {
                                    setPhysicalStatus('verified');
                                  }
                                }}
                                className={`py-2 px-1 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                                  physicalStatus === 'verified'
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-white text-slate-700 border-slate-200'
                                }`}
                              >
                                ✓ موجود و تأییدشده
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (physicalStatus === 'not_found') {
                                    setPhysicalStatus('review');
                                    setNeedsReviewFlag(true);
                                  } else if (physicalStatus === 'verified') {
                                    setNeedsReviewFlag((prev) => !prev);
                                  } else {
                                    // در حالت review تنها بود: با کلیک مجدد برگردد به موجود و تأییدشده بدون تیک بررسی
                                    setPhysicalStatus('verified');
                                    setNeedsReviewFlag(false);
                                  }
                                }}
                                className={`py-2 px-1 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                                  physicalStatus !== 'not_found' &&
                                  (needsReviewFlag || physicalStatus === 'review')
                                    ? 'bg-amber-600 text-white border-amber-600'
                                    : 'bg-white text-slate-700 border-slate-200'
                                }`}
                              >
                                ⚠️ نیازمند بررسی
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setPhysicalStatus('not_found');
                                  setNeedsReviewFlag(false);
                                }}
                                className={`py-2 px-1 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                                  physicalStatus === 'not_found'
                                    ? 'bg-rose-600 text-white border-rose-600'
                                    : 'bg-white text-slate-700 border-slate-200'
                                }`}
                              >
                                ✕ پیدا نشد
                              </button>
                            </div>

                            {/* 4. Action Buttons */}
                            <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleSaveCatalogBookRecord(row, nextRow)}
                                className="flex-1 min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
                              >
                                <span>ذخیره سریع و رفتن به کتاب بعدی</span>
                                <ArrowDown className="w-4 h-4" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleSaveCatalogBookRecord(row)}
                                className="min-h-[44px] px-4 py-2 bg-[#1f4e79] hover:bg-[#163a5c] text-white rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                <span>ذخیره همین کتاب ✓</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setSelectedRow(null)}
                                className="min-h-[44px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium text-xs cursor-pointer"
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
                      onClick={() => setVisibleLimit((prev) => prev + 25)}
                      className="w-full min-h-[42px] py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                    >
                      نمایش کتاب‌های بیشتر ({toPersianDigits(allMatchingRows.length - visibleLimit)} مورد باقی‌مانده)
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* بخش ۳ (کشویی واحد و ادغام‌شده): ثبت فیزیکی کامل کتاب (هم کتاب انتخابی فهرست و هم ثبت کتاب جدید) */}
      <section
        id="section-3-physical-audit"
        className="bg-white border border-slate-200 rounded-2xl overflow-hidden"
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => setShowSection3Drawer((prev) => !prev)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setShowSection3Drawer((prev) => !prev);
            }
          }}
          className="w-full px-4 py-3.5 flex flex-wrap items-center justify-between gap-2 text-right hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <div className="flex flex-wrap items-center gap-2">
            <BookCheck className="w-5 h-5 text-[#1f4e79]" />
            <h2 className="text-sm sm:text-base font-bold text-slate-900">
              ۳. ثبت فیزیکی کامل کتاب
            </h2>
            {selectedRow && section3Mode === 'selected' ? (
              <span className="px-2.5 py-0.5 rounded-lg bg-[#edf4fa] text-[#1f4e79] border border-[#b8d0e8] text-xs font-bold">
                کتاب فعال: «{selectedRow.titleRaw}» ({selectedRow.tempBookId})
              </span>
            ) : section3Mode === 'new' ? (
              <span className="px-2.5 py-0.5 rounded-lg bg-[#FAF3EA] text-[#8C3B2B] border border-[#E6D5C1] text-xs font-bold">
                حالت: ثبت کتاب جدید
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {selectedRow && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedRow(null);
                }}
                className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold cursor-pointer"
              >
                پاک کردن انتخاب ✕
              </button>
            )}
            <span className="text-xs font-bold text-[#1f4e79] inline-flex items-center gap-1">
              <span>{showSection3Drawer ? 'بستن کشو' : 'باز کردن کشو'}</span>
              {showSection3Drawer ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </span>
          </div>
        </div>

        {showSection3Drawer && (
          <div className="p-4 sm:p-5 pt-3 border-t border-slate-200 space-y-4">
            {/* نوار سوییچ یکپارچه بین کتاب انتخابی از فهرست و ثبت کتاب جدید */}
            <div className="grid grid-cols-2 gap-2 bg-[#F5F7FA] p-1.5 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setSection3Mode('selected')}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                  section3Mode === 'selected'
                    ? 'bg-[#1f4e79] text-white shadow-2xs'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                <BookCheck className="w-4 h-4 shrink-0" />
                <span>ثبت / تکمیل کتاب انتخابی فهرست</span>
              </button>
              <button
                type="button"
                onClick={() => setSection3Mode('new')}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                  section3Mode === 'new'
                    ? 'bg-[#8C3B2B] text-white shadow-2xs'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                <PlusCircle className="w-4 h-4 shrink-0" />
                <span>＋ ثبت کتاب جدید (خارج از فهرست)</span>
              </button>
            </div>

            {section3Mode === 'new' ? (
              /* فرم ثبت کتاب جدید (ادغام‌شده در بخش ۳) */
              <form onSubmit={handleSaveOutsideBook} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      عنوان دقیق روی جلد کتاب *
                    </label>
                    <input
                      type="text"
                      required
                      value={outsideTitle}
                      onChange={(e) => setOutsideTitle(e.target.value)}
                      placeholder="عنوان کامل روی جلد کتاب را وارد کنید..."
                      className="w-full min-h-[42px] px-3 py-2 bg-[#F5F7FA] focus:bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-[#8C3B2B]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      نویسنده / پدیدآورنده
                    </label>
                    <input
                      type="text"
                      value={outsideAuthor}
                      onChange={(e) => setOutsideAuthor(e.target.value)}
                      placeholder="نام نویسنده..."
                      className="w-full min-h-[40px] px-3 py-1.5 bg-[#F5F7FA] focus:bg-white border border-slate-300 rounded-xl text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        ناشر
                      </label>
                      <input
                        type="text"
                        value={outsidePublisher}
                        onChange={(e) => setOutsidePublisher(e.target.value)}
                        placeholder="نام ناشر..."
                        className="w-full min-h-[40px] px-2.5 py-1.5 bg-[#F5F7FA] focus:bg-white border border-slate-300 rounded-xl text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        سال چاپ
                      </label>
                      <input
                        type="text"
                        value={outsideYear}
                        onChange={(e) => setOutsideYear(e.target.value)}
                        placeholder="مثلاً ۱۳۹۰"
                        className="w-full min-h-[40px] px-2.5 py-1.5 bg-[#F5F7FA] focus:bg-white border border-slate-300 rounded-xl text-xs tabular-nums"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      دسته موضوعی کتاب *
                    </label>
                    <select
                      value={outsideCategory}
                      onChange={(e) => setOutsideCategory(e.target.value)}
                      className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800"
                    >
                      {SUBJECT_CATEGORIES.map((c) => (
                        <option key={c.code} value={c.label}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        قفسه (SH-01..04) *
                      </label>
                      <select
                        value={outsideShelf}
                        onChange={(e) => setOutsideShelf(e.target.value as ShelfCode)}
                        className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold font-mono text-slate-800"
                      >
                        {SHELVES.map((s) => (
                          <option key={s.code} value={s.code}>
                            {s.code}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        طبقه (T01..06) *
                      </label>
                      <select
                        value={outsideLevel}
                        onChange={(e) => setOutsideLevel(e.target.value as LevelCode)}
                        className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold font-mono text-slate-800"
                      >
                        {LEVELS.map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.code} (طبقه {toPersianDigits(l.number)})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      توضیحات لازم (اختیاری):
                    </label>
                    <input
                      type="text"
                      value={outsideNotes}
                      onChange={(e) => setOutsideNotes(e.target.value)}
                      placeholder="توضیح تکمیلی در صورت نیاز..."
                      className="w-full min-h-[40px] px-3 py-1.5 bg-[#F5F7FA] focus:bg-white border border-slate-300 rounded-xl text-xs"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
                  <button
                    type="submit"
                    className="flex-1 min-h-[44px] px-5 py-2 bg-[#8C3B2B] hover:bg-[#702D20] text-white font-bold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>
                      ثبت کتاب جدید در {outsideShelf}-{outsideLevel}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOutsideTitle('');
                      setOutsideAuthor('');
                      setOutsidePublisher('');
                      setOutsideYear('');
                      setOutsideNotes('');
                      setShowSection3Drawer(false);
                    }}
                    className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    انصراف و بستن کشو
                  </button>
                </div>
              </form>
            ) : (
              /* فرم ثبت / ویرایش کامل کتاب انتخابی از فهرست */
              <>
                <div
                  className={`rounded-xl p-3.5 border ${
                    selectedRow
                      ? 'bg-[#edf4fa] border-[#b8d0e8] text-[#162b3b]'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  {selectedRow ? (
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-mono font-bold text-[#1f4e79]" dir="ltr">
                          {selectedRow.tempBookId} · {copyIdValue || `CP-${String(Math.max(1, selectedRow.rowIndex - 1)).padStart(6, '0')}`}
                        </span>
                        <div className="flex items-center gap-2">
                          <span>
                            منبع: {selectedRow.backupSourceSheet} · ردیف {toPersianDigits(selectedRow.backupSourceRow)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedRow(null)}
                            className="px-2 py-0.5 rounded bg-white text-rose-700 border border-rose-200 text-[11px] font-bold cursor-pointer"
                          >
                            تغییر / بستن کتاب
                          </button>
                        </div>
                      </div>
                      <div className="text-base font-bold text-slate-900">{selectedRow.titleRaw}</div>
                      <div className="text-xs text-slate-700">
                        {[
                          selectedRow.publisherRaw && `ناشر: ${selectedRow.publisherRaw}`,
                          selectedRow.authorRaw && `نویسنده: ${selectedRow.authorRaw}`,
                          selectedRow.descriptionRaw && `توضیحات: ${selectedRow.descriptionRaw}`
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'اطلاعات تکمیلی در شیت خالی است'}
                      </div>

                      {/* Independent Physical Copies (CP-xxxxxx) Management */}
                      {(() => {
                        const copiesForThisBook = bookCopies.filter(
                          (c) => c.bookId === selectedRow.tempBookId
                        );
                        return (
                          <div className="pt-2.5 mt-2 border-t border-[#c9dced] text-xs space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-bold text-[#253247]">
                                نسخه‌های فیزیکی مستقل این کتاب ({toPersianDigits(copiesForThisBook.length)} جلد با کد CP):
                              </span>
                              {onAddBookCopy && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const { copyId: newCid, copyNumber } = generateUniqueCopyId(
                                      bookCopies,
                                      selectedRow.tempBookId
                                    );
                                    const sh = (shelfValue || 'SH-01') as ShelfCode;
                                    const lv = (levelValue || 'T01') as LevelCode;
                                    requestActionConfirmation({
                                      variant: 'confirm',
                                      title: 'پرسش دوم: تأیید ثبت نسخه فیزیکی جدید (CP)',
                                      message: `آیا از ثبت نسخه فیزیکی مستقل جدید (${newCid}) برای کتاب «${selectedRow.titleRaw}» در محل ${sh}-${lv} اطمینان دارید؟`,
                                      details: [
                                        `عنوان کتاب: ${selectedRow.titleRaw}`,
                                        `کد نسخه جدید: ${newCid} (نسخه شماره ${toPersianDigits(copyNumber)})`,
                                        `محل قفسه و طبقه: ${sh}-${lv}`
                                      ],
                                      confirmLabel: 'بله، نسخه فیزیکی ثبت شود',
                                      onConfirm: () => {
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
                                          physicalCondition: physicalCondition || 'healthy',
                                          loanOrMoveStatus: 'در قفسه مرکز اسناد',
                                          expertNote: `نسخه فیزیکی مستقل شماره ${toPersianDigits(
                                            copyNumber
                                          )} برای کتاب ${selectedRow.tempBookId}`,
                                          lastReviewedAt: nowFa,
                                          locationHistory: []
                                        });
                                        onNotify(
                                          `✅ نسخه فیزیکی مستقل ${newCid} برای کتاب «${selectedRow.titleRaw}» در محل ${sh}-${lv} ثبت شد.`
                                        );
                                      }
                                    });
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-[#2E7D5B] hover:bg-[#236247] text-white font-bold text-[11px] cursor-pointer"
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
                                        className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[#1F4E79] font-semibold text-[11px] cursor-pointer"
                                      >
                                        انتقال قفسه/طبقه این نسخه
                                      </button>
                                    </div>

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
                                          placeholder="علت جابه‌جایی..."
                                          className="px-2 py-1 border border-slate-300 rounded text-xs flex-1"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            requestActionConfirmation({
                                              variant: 'confirm',
                                              title: 'پرسش دوم: تأیید انتقال محل نسخه فیزیکی',
                                              message: `آیا از انتقال نسخه ${cp.copyId} از محل ${cp.location} به محل جدید ${moveTargetShelf}-${moveTargetLevel} اطمینان دارید؟`,
                                              details: [
                                                `کد نسخه: ${cp.copyId}`,
                                                `محل قبلی: ${cp.location} ← محل جدید: ${moveTargetShelf}-${moveTargetLevel}`,
                                                `علت جابه‌جایی: ${moveReason || 'جابه‌جایی قفسه'}`
                                              ],
                                              confirmLabel: 'بله، انتقال ثبت شود',
                                              onConfirm: () => {
                                                onMoveBookCopy(
                                                  cp.copyId,
                                                  moveTargetShelf,
                                                  moveTargetLevel,
                                                  moveReason
                                                );
                                                setMovingCopyId(null);
                                              }
                                            });
                                          }}
                                          className="px-3 py-1 rounded bg-[#1F4E79] text-white font-bold text-xs cursor-pointer"
                                        >
                                          ثبت انتقال
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
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span>
                        یک کتاب را از فهرست بالا انتخاب کنید، یا برای ثبت کتاب جدید از دکمه روبه‌رو استفاده نمایید.
                      </span>
                      <button
                        type="button"
                        onClick={() => setSection3Mode('new')}
                        className="px-3 py-1.5 rounded-lg bg-[#8C3B2B] text-white font-bold text-xs cursor-pointer"
                      >
                        ＋ ثبت کتاب جدید (خارج از فهرست)
                      </button>
                    </div>
                  )}
                </div>

                <form onSubmit={handleSaveCatalogBook} className="space-y-4">
                  {/* Step A: 6 Subject Categories */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-2">
                      الف) انتخاب گروه موضوعی:
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {SUBJECT_CATEGORIES.map((cat) => {
                        const isSelected = categoryValue === cat.label;
                        return (
                          <button
                            key={cat.code}
                            type="button"
                            onClick={() => handleCategoryTap(cat.label, cat.code)}
                            className={`min-h-[42px] px-3 py-2 rounded-xl text-center border text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
                              isSelected
                                ? 'bg-[#1f4e79] text-white border-[#1f4e79]'
                                : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <span>{cat.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Step B: Shelf & Level Selectors */}
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
                              className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-bold font-mono transition-colors cursor-pointer ${
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
                              className={`min-h-[40px] px-2 py-1.5 rounded-xl border text-xs font-bold transition-colors flex flex-col items-center justify-center cursor-pointer ${
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
                  </div>

                  {/* Step C: Physical Observation Status (با امکان انتخاب هم‌زمان نیازمند بررسی با موجود و تأییدشده) */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-800">
                      د) وضعیت مشاهده فیزیکی (امکان انتخاب هم‌زمان «نیازمند بررسی» با «موجود و تأییدشده»):
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (physicalStatus === 'verified' && needsReviewFlag) {
                            setPhysicalStatus('review');
                          } else {
                            setPhysicalStatus('verified');
                          }
                        }}
                        className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                          physicalStatus === 'verified'
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-slate-700 border-slate-300'
                        }`}
                      >
                        ✓ موجود و تأییدشده
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (physicalStatus === 'not_found') {
                            setPhysicalStatus('review');
                            setNeedsReviewFlag(true);
                          } else if (physicalStatus === 'verified') {
                            setNeedsReviewFlag((prev) => !prev);
                          } else {
                            setPhysicalStatus('verified');
                            setNeedsReviewFlag(false);
                          }
                        }}
                        className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                          physicalStatus !== 'not_found' &&
                          (needsReviewFlag || physicalStatus === 'review')
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-slate-700 border-slate-300'
                        }`}
                      >
                        ⚠️ نیازمند بررسی
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPhysicalStatus('not_found');
                          setNeedsReviewFlag(false);
                        }}
                        className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                          physicalStatus === 'not_found'
                            ? 'bg-rose-600 text-white border-rose-600'
                            : 'bg-white text-slate-700 border-slate-300'
                        }`}
                      >
                        ✕ پیدا نشد
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1">
                        وضعیت سلامت جلد (CP):
                      </label>
                      <select
                        value={physicalCondition}
                        onChange={(e) =>
                          setPhysicalCondition(e.target.value as PhysicalConditionCode)
                        }
                        className="w-full min-h-[42px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900"
                      >
                        <option value="healthy">سالم</option>
                        <option value="needs_repair">نیازمند ترمیم صحافی</option>
                        <option value="damaged">آسیب‌دیده</option>
                        <option value="unchecked">بررسی‌نشده</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1">
                        تعداد نسخه مشاهده‌شده:
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={99}
                        value={countedCopies}
                        onChange={(e) => setCountedCopies(e.target.value)}
                        className="w-full min-h-[42px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-center tabular-nums"
                      />
                    </div>
                  </div>

                  {/* فیلدهای تکمیلی کتاب‌شناختی (نویسنده، ناشر، سال چاپ، شابک، فیپا و یادداشت) */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowOptionalBiblioFields((p) => !p)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-semibold text-slate-700 cursor-pointer"
                    >
                      <span>فیلدهای تکمیلی (نویسنده، ناشر، سال چاپ، شابک، فیپا و توضیحات)</span>
                      {showOptionalBiblioFields ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                    {showOptionalBiblioFields && (
                      <div className="p-3.5 space-y-3 bg-white">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              نویسنده / گردآورنده:
                            </label>
                            <input
                              type="text"
                              value={authorOverride}
                              onChange={(e) => setAuthorOverride(e.target.value)}
                              placeholder="اختیاری"
                              className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              ناشر:
                            </label>
                            <input
                              type="text"
                              value={publisherOverride}
                              onChange={(e) => setPublisherOverride(e.target.value)}
                              placeholder="اختیاری"
                              className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs"
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
                              className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs tabular-nums"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              شابک (ISBN):
                            </label>
                            <input
                              type="text"
                              value={isbnOverride}
                              onChange={(e) => setIsbnOverride(e.target.value)}
                              dir="ltr"
                              className="w-full min-h-[38px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-mono"
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
                              dir="ltr"
                              className="w-full min-h-[38px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              شماره ثبت / شناسه نسخه:
                            </label>
                            <input
                              type="text"
                              value={regNoOverride}
                              onChange={(e) => setRegNoOverride(e.target.value)}
                              placeholder={copyIdValue || 'CP-000001'}
                              dir="ltr"
                              className="w-full min-h-[38px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-mono"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            توضیحات لازم:
                          </label>
                          <textarea
                            rows={2}
                            value={notesValue}
                            onChange={(e) => setNotesValue(e.target.value)}
                            placeholder="یادداشت کوتاه میدانی..."
                            className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Primary Save Action Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                    <button
                      type="submit"
                      className="sm:col-span-2 min-h-[46px] px-5 py-2.5 bg-[#1f4e79] hover:bg-[#163a5b] text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>ذخیره ثبت در حافظه دستگاه</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRow(null);
                        setShowSection3Drawer(false);
                        setNotesValue('');
                      }}
                      className="min-h-[46px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>انصراف و بستن کشو</span>
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
