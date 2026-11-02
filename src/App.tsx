/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Home,
  BookOpen,
  Users,
  Sparkles,
  FileSearch,
  DatabaseBackup,
  CheckCircle2,
  AlertTriangle,
  Download,
  UserCog,
  WifiOff,
  Smartphone,
  Grid,
  ArrowUp,
  RefreshCw,
  LogOut,
  ShieldCheck,
  FileSpreadsheet
} from 'lucide-react';
import {
  AuditLogEntry,
  BookCopyRecord,
  BookMartyrLinkRecord,
  CustomMartyrRecord,
  DEFAULT_REFERENCE_CATALOG_ROWS,
  ExtractedContentItem,
  ExtractedReviewStatus,
  FieldAuditRecord,
  INITIAL_AUDIT_LOG,
  INITIAL_BOOK_COPIES,
  INITIAL_BOOK_MARTYR_LINKS,
  INITIAL_EXTRACTED_ITEMS,
  INITIAL_MULTI_MARTYR_GROUPS,
  INITIAL_SMART_SEARCH_SUGGESTIONS,
  MultiMartyrGroupAudit,
  PendingReviewItem,
  ReferenceCatalogRow,
  ShelfCode,
  ShelfLevelCode,
  SmartSearchSuggestion,
  SUBJECT_CATEGORIES,
  USER_ROLES,
  UserRoleCode,
  WorkbookGolzarMartyr,
  getAllocatedCategoryForSlot,
  toPersianDigits
} from './data/markazAsnadData';
import { HomeDashboardTab } from './components/HomeDashboardTab';
import { QuickInventoryTab } from './components/QuickInventoryTab';
import { ShelfMapAndLabelsTab } from './components/ShelfMapAndLabelsTab';
import { AllMartyrsDatabaseTab } from './components/AllMartyrsDatabaseTab';
import { SmartBookSearchTab } from './components/SmartBookSearchTab';
import { ResearchAndLinksTab } from './components/ResearchAndLinksTab';
import { BackupAndExportTab } from './components/BackupAndExportTab';
import { PilotTestAndReportTab } from './components/PilotTestAndReportTab';
import { ComprehensiveDocViewer } from './components/ComprehensiveDocViewer';
import { useOnlineStatus, usePWAInstall } from './utils/usePWAInstall';
import { idbGetItem, idbSetItem } from './utils/indexedDbStorage';

// عنوان و شناسه اختصاصی پایگاه داده در حافظه گوشی و مرورگر: book
export const BOOK_STORAGE_NAMESPACE = 'book';
const AUDIT_STORAGE_KEY = 'book_library_audit_v1';
const LEGACY_AUDIT_KEY = 'shohada_markaz_asnad_library_audit_v1';

const COPIES_STORAGE_KEY = 'book_copies_v1';
const LEGACY_COPIES_KEY = 'shohada_markaz_asnad_book_copies_v1';

const CUSTOM_MARTYRS_STORAGE_KEY = 'book_custom_martyrs_v1';
const LEGACY_CUSTOM_MARTYRS_KEY = 'shohada_markaz_asnad_custom_martyrs_v1';

const SMART_SUGGESTIONS_STORAGE_KEY = 'book_smart_suggestions_v1';
const LEGACY_SMART_KEY = 'shohada_markaz_asnad_smart_suggestions_v1';
const GROUPS_STORAGE_KEY = 'book_groups16_v1';
const EXTRACTED_STORAGE_KEY = 'book_extracted_items_v1';
const AUDIT_LOG_STORAGE_KEY = 'book_audit_log_v1';
const USER_ROLE_STORAGE_KEY = 'book_user_role_v1';

const DEFAULT_HEADERS = [
  'شناسه موقت کتاب',
  'عنوان کتاب',
  'ناشر',
  'توضیحات ثبت‌شده در منبع',
  'دسته',
  'نویسنده/گردآورنده',
  'شابک',
  'فیپا',
  'شماره ثبت کتابخانه',
  'محل نگهداری/قفسه',
  'تعداد نسخه‌های موجود پس از شمارش',
  'وضعیت بررسی کتاب',
  'یادداشت',
  'شیت منبع (پشتیبان)',
  'ردیف منبع (پشتیبان)'
];

export type MainMenuTab = 'home' | 'library' | 'martyrs' | 'smart_search' | 'research' | 'management';

export default function App() {
  const [activeTab, setActiveTab] = useState<MainMenuTab>('home');
  const [librarySubView, setLibrarySubView] = useState<'catalog' | 'shelves'>('catalog');
  const [showPilotSubView, setShowPilotSubView] = useState(false);
  const [preselectedSmartMartyrName, setPreselectedSmartMartyrName] = useState<string>('');
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);
  const [showHeaderInstallModal, setShowHeaderInstallModal] = useState<boolean>(false);
  const [showComprehensiveDocModal, setShowComprehensiveDocModal] = useState<boolean>(false);

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY || document.documentElement.scrollTop || 0;
      setShowScrollTop(currentY > 400);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isOnline = useOnlineStatus();
  const { isInstallable, install: promptInstall } = usePWAInstall();

  // Reference Catalog State (All 5 Sheets from فهرست کاری کتابخانه - نسخه 0.1 (1).xlsx)
  const [loadedFileName, setLoadedFileName] = useState<string>(
    'فهرست کاری کتابخانه - نسخه 0.1 (1).xlsx'
  );
  const [sheetNames, setSheetNames] = useState<string[]>([
    'فهرست کتاب‌ها',
    'توضیحات  دسته',
    'ارتباط کتاب و شهید',
    'موارد نیازمند بررسی',
    'شهدای گلزار'
  ]);
  const [currentSheetName, setCurrentSheetName] = useState<string>('فهرست کتاب‌ها');
  const [headers, setHeaders] = useState<string[]>(DEFAULT_HEADERS);
  const [catalogRows, setCatalogRows] = useState<ReferenceCatalogRow[]>(
    DEFAULT_REFERENCE_CATALOG_ROWS
  );
  const [columnMap, setColumnMap] = useState({
    tempIdCol: 0,
    titleCol: 1,
    publisherCol: 2,
    descriptionCol: 3,
    categoryCol: 4,
    authorCol: 5,
    yearCol: -1
  });

  // Specialist Sheets State (836 Links, 567 Pending Reviews, 196 Workbook Martyrs)
  const [links, setLinks] = useState<BookMartyrLinkRecord[]>(INITIAL_BOOK_MARTYR_LINKS);
  const [pendingReviews, setPendingReviews] = useState<PendingReviewItem[]>([]);
  const [workbookMartyrs, setWorkbookMartyrs] = useState<WorkbookGolzarMartyr[]>([]);

  // Auto-load all 5 sheets of /data/library_books.json on startup
  useEffect(() => {
    async function loadFullWorkbookJson() {
      try {
        const res = await fetch('./data/library_books.json');
        if (!res.ok) return;
        const parsed = await res.json();
        if (parsed?.format === 'markaz-asnad-library-workbook-json' && Array.isArray(parsed.sheets)) {
          const sNames = parsed.sheets.map((s: { name: string }) => s.name);
          setLoadedFileName(parsed.source_file || 'فهرست کاری کتابخانه - نسخه 0.1 (1).xlsx');
          setSheetNames(sNames);

          // 1. Parse Sheet «فهرست کتاب‌ها» (980 rows)
          const bookSheet = parsed.sheets.find((s: { name: string }) =>
            s.name.includes('فهرست کتاب')
          );
          if (bookSheet && Array.isArray(bookSheet.rows) && bookSheet.rows.length > 1) {
            const matrix: unknown[][] = bookSheet.rows;
            const hdrs = (matrix[0] || []).map((h: unknown, i: number) =>
              String(h || `ستون ${i + 1}`).trim()
            );
            const bRows: ReferenceCatalogRow[] = [];
            for (let i = 1; i < matrix.length; i++) {
              const rawRow = matrix[i] || [];
              const values = hdrs.map((_, colIdx) =>
                rawRow[colIdx] !== null && rawRow[colIdx] !== undefined
                  ? String(rawRow[colIdx]).trim()
                  : ''
              );
              if (!values.some((v) => v !== '')) continue;
              const excelRowNumber = i + 1;
              bRows.push({
                rowKey: `${bookSheet.name}::ROW-${excelRowNumber}`,
                rowIndex: excelRowNumber,
                tempBookId: values[0] || `ROW-${excelRowNumber}`,
                titleRaw: values[1] || '',
                publisherRaw: values[2] || '',
                descriptionRaw: values[3] || '',
                categoryRaw: values[4] || '',
                authorRaw: values[5] || '',
                isbnRaw: values[6] || '',
                fipaRaw: values[7] || '',
                registrationNoRaw: values[8] || '',
                locationRaw: values[9] || '',
                countedCopiesRaw: values[10] || '',
                reviewStatusRaw: values[11] || 'بررسی‌نشده',
                noteRaw: values[12] || '',
                backupSourceSheet: values[13] || bookSheet.name,
                backupSourceRow: values[14] || String(excelRowNumber),
                allValues: values
              });
            }
            setCurrentSheetName(bookSheet.name);
            setHeaders(hdrs);
            setCatalogRows(bRows);
          }

          // 2. Parse Sheet «ارتباط کتاب و شهید» (836 rows)
          const linkSheet = parsed.sheets.find((s: { name: string }) =>
            s.name.includes('ارتباط کتاب و شهید')
          );
          if (linkSheet && Array.isArray(linkSheet.rows) && linkSheet.rows.length > 1) {
            const lRows: BookMartyrLinkRecord[] = [];
            for (let i = 1; i < linkSheet.rows.length; i++) {
              const r = (linkSheet.rows[i] || []).map((c: unknown) =>
                c !== null && c !== undefined ? String(c).trim() : ''
              );
              if (!r.some((v: string) => v !== '')) continue;
              const martyrOrPhrase = r[1] || '';
              const status = r[10] || 'بررسی‌نشده';
              lRows.push({
                id: r[0] || `RL-${String(i).padStart(4, '0')}`,
                martyrNameRaw: martyrOrPhrase,
                bookTitleRaw: r[2]?.startsWith('<openpyxl')
                  ? r[5] || 'از دزفول تا سرچشمه'
                  : r[2] || '',
                alternativeTitle: r[3] || '',
                publisherRaw: r[4] || '',
                sourceDescriptionRaw: r[5] || '',
                pageReferenceRaw: r[6] || '',
                gravePieceRaw: r[7] || '',
                graveRowRaw: r[8] || '',
                graveNumberRaw: r[9] || '',
                reviewStatus: status,
                reviewerNote: r[11] || '',
                tempBookId: r[12] || '',
                sourceFile: r[13] || '',
                sourceSheet: r[14] || '',
                sourceExcelRow: r[15] || String(i + 1),
                rawNameInSource: r[16] || '',
                groupStartRow: r[17] || '',
                isGroupPhrase: status.includes('تفکیک نام') || /چند شهید|اشاره به/.test(martyrOrPhrase)
              });
            }
            setLinks(lRows);
          }

          // 3. Parse Sheet «موارد نیازمند بررسی» (567 rows)
          const pvSheet = parsed.sheets.find((s: { name: string }) =>
            s.name.includes('موارد نیازمند بررسی')
          );
          if (pvSheet && Array.isArray(pvSheet.rows) && pvSheet.rows.length > 1) {
            const pRows: PendingReviewItem[] = [];
            for (let i = 1; i < pvSheet.rows.length; i++) {
              const r = (pvSheet.rows[i] || []).map((c: unknown) =>
                c !== null && c !== undefined ? String(c).trim() : ''
              );
              if (!r.some((v: string) => v !== '')) continue;
              pRows.push({
                trackingId: r[0] || `PV-${String(i).padStart(4, '0')}`,
                mainSheet: r[1] || '',
                mainRecordId: r[2] || '',
                nameOrPhrase: r[3] || '',
                bookTitle: r[4] || '',
                publisher: r[5] || '',
                issueSubject: r[6] || '',
                suggestedAction: r[7] || '',
                trackingStatus: r[8] || 'باز'
              });
            }
            setPendingReviews(pRows);
          }

          // 4. Parse Sheet «شهدای گلزار» (196 rows)
          const shSheet = parsed.sheets.find((s: { name: string }) =>
            s.name.includes('شهدای گلزار')
          );
          if (shSheet && Array.isArray(shSheet.rows) && shSheet.rows.length > 1) {
            const sRows: WorkbookGolzarMartyr[] = [];
            for (let i = 1; i < shSheet.rows.length; i++) {
              const r = (shSheet.rows[i] || []).map((c: unknown) =>
                c !== null && c !== undefined ? String(c).trim() : ''
              );
              if (!r.some((v: string) => v !== '')) continue;
              sRows.push({
                tempPersonId: r[0] || `SH-${String(i).padStart(4, '0')}`,
                firstNameRaw: r[1] || '',
                lastNameRaw: r[2] || '',
                fullNameSearch: r[3] || `${r[1] || ''} ${r[2] || ''}`.trim(),
                piece: r[4] || '',
                graveRow: r[5] || '',
                graveNumber: r[6] || '',
                graveStatus: r[7] || '',
                sourceFile: r[8] || '',
                sourceSheet: r[9] || '',
                sourceRow: r[10] || String(i + 1)
              });
            }
            setWorkbookMartyrs(sRows);
          }
        }
      } catch {
        // fallback
      }
    }
    loadFullWorkbookJson();
  }, []);

  // Persistent States (localStorage + IndexedDB Dual Persistence - پایگاه داده book)
  const [auditRecords, setAuditRecords] = useState<Record<string, FieldAuditRecord>>(() => {
    try {
      const raw = localStorage.getItem(AUDIT_STORAGE_KEY) || localStorage.getItem(LEGACY_AUDIT_KEY);
      return raw ? JSON.parse(raw) || {} : {};
    } catch {
      return {};
    }
  });

  const [bookCopies, setBookCopies] = useState<BookCopyRecord[]>(() => {
    try {
      const raw = localStorage.getItem(COPIES_STORAGE_KEY) || localStorage.getItem(LEGACY_COPIES_KEY);
      return raw ? JSON.parse(raw) : INITIAL_BOOK_COPIES;
    } catch {
      return INITIAL_BOOK_COPIES;
    }
  });

  const [customMartyrs, setCustomMartyrs] = useState<CustomMartyrRecord[]>(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_MARTYRS_STORAGE_KEY) || localStorage.getItem(LEGACY_CUSTOM_MARTYRS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [smartSuggestions, setSmartSuggestions] = useState<SmartSearchSuggestion[]>(() => {
    try {
      const raw = localStorage.getItem(SMART_SUGGESTIONS_STORAGE_KEY) || localStorage.getItem(LEGACY_SMART_KEY);
      return raw ? JSON.parse(raw) : INITIAL_SMART_SEARCH_SUGGESTIONS;
    } catch {
      return INITIAL_SMART_SEARCH_SUGGESTIONS;
    }
  });

  const [multiMartyrGroups, setMultiMartyrGroups] = useState<MultiMartyrGroupAudit[]>(() => {
    try {
      const raw = localStorage.getItem(GROUPS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : INITIAL_MULTI_MARTYR_GROUPS;
    } catch {
      return INITIAL_MULTI_MARTYR_GROUPS;
    }
  });

  const [extractedItems, setExtractedItems] = useState<ExtractedContentItem[]>(() => {
    try {
      const raw = localStorage.getItem(EXTRACTED_STORAGE_KEY);
      return raw ? JSON.parse(raw) : INITIAL_EXTRACTED_ITEMS;
    } catch {
      return INITIAL_EXTRACTED_ITEMS;
    }
  });

  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>(() => {
    try {
      const raw = localStorage.getItem(AUDIT_LOG_STORAGE_KEY);
      return raw ? JSON.parse(raw) : INITIAL_AUDIT_LOG;
    } catch {
      return INITIAL_AUDIT_LOG;
    }
  });

  // 5 User Roles (مدیر سامانه، ثبت‌کننده کتاب، پژوهشگر، بازبین اطلاعات، مسئول تأیید و انتشار)
  const [activeUserRole, setActiveUserRole] = useState<UserRoleCode>(() => {
    try {
      const raw = localStorage.getItem(USER_ROLE_STORAGE_KEY) as UserRoleCode | null;
      return USER_ROLES.some((r) => r.code === raw) ? (raw as UserRoleCode) : 'registrar';
    } catch {
      return 'registrar';
    }
  });

  // وضعیت‌های رهگیری نشست کاری و حفاظت قبل از خروج (پایگاه داده book)
  const [sessionEditsCount, setSessionEditsCount] = useState<number>(0);
  const [lastSavedTime, setLastSavedTime] = useState<string>('');
  const [showExitConfirmModal, setShowExitConfirmModal] = useState<boolean>(false);
  const [isShiftEnded, setIsShiftEnded] = useState<boolean>(false);

  // ممانعت از خروج ناخواسته مرورگر در صورت وجود تغییرات در نشست کاری
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (sessionEditsCount > 0) {
        e.preventDefault();
        e.returnValue = 'آیا از خروج از سامانه کتابخانه مطمئن هستید؟ اطلاعات در پایگاه book در حافظه گوشی ذخیره شده است.';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [sessionEditsCount]);

  // Hydrate from IndexedDB if localStorage was cleared
  useEffect(() => {
    async function hydrateFromIdb() {
      const idbAudit =
        (await idbGetItem<Record<string, FieldAuditRecord>>(AUDIT_STORAGE_KEY)) ||
        (await idbGetItem<Record<string, FieldAuditRecord>>(LEGACY_AUDIT_KEY));
      if (idbAudit && Object.keys(auditRecords).length === 0 && Object.keys(idbAudit).length > 0) {
        setAuditRecords(idbAudit);
      }
      const idbCopies =
        (await idbGetItem<BookCopyRecord[]>(COPIES_STORAGE_KEY)) ||
        (await idbGetItem<BookCopyRecord[]>(LEGACY_COPIES_KEY));
      if (idbCopies && idbCopies.length > bookCopies.length) {
        setBookCopies(idbCopies);
      }
      const idbMartyrs =
        (await idbGetItem<CustomMartyrRecord[]>(CUSTOM_MARTYRS_STORAGE_KEY)) ||
        (await idbGetItem<CustomMartyrRecord[]>(LEGACY_CUSTOM_MARTYRS_KEY));
      if (idbMartyrs && idbMartyrs.length > customMartyrs.length) {
        setCustomMartyrs(idbMartyrs);
      }
      const idbSmart =
        (await idbGetItem<SmartSearchSuggestion[]>(SMART_SUGGESTIONS_STORAGE_KEY)) ||
        (await idbGetItem<SmartSearchSuggestion[]>(LEGACY_SMART_KEY));
      if (idbSmart && idbSmart.length > smartSuggestions.length) {
        setSmartSuggestions(idbSmart);
      }
    }
    hydrateFromIdb();
  }, []);

  // Toast Notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' } | null>(
    null
  );

  const showNotify = (message: string, type: 'success' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  const getRoleDisplayName = (role: UserRoleCode) => {
    const found = USER_ROLES.find((r) => r.code === role);
    return found ? found.title : 'ثبت‌کننده کتاب';
  };

  const appendAuditLog = (
    actionType: AuditLogEntry['actionType'],
    targetId: string,
    summary: string
  ) => {
    const nowFa = new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date());

    setAuditLog((prev) => [
      {
        id: `LOG-${String(prev.length + 1).padStart(4, '0')}`,
        timestamp: nowFa,
        actorName: getRoleDisplayName(activeUserRole),
        actorRole: activeUserRole,
        actionType,
        targetId,
        summary
      },
      ...prev.slice(0, 199)
    ]);
  };

  // Sync to localStorage & IndexedDB
  useEffect(() => {
    try {
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(auditRecords));
      idbSetItem(AUDIT_STORAGE_KEY, auditRecords);
    } catch {
      showNotify('ذخیره در حافظه مرورگر با خطا مواجه شد؛ فوراً خروجی پشتیبان بگیرید.', 'warning');
    }
  }, [auditRecords]);

  useEffect(() => {
    try {
      localStorage.setItem(COPIES_STORAGE_KEY, JSON.stringify(bookCopies));
      idbSetItem(COPIES_STORAGE_KEY, bookCopies);
    } catch {
      // ignore
    }
  }, [bookCopies]);

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_MARTYRS_STORAGE_KEY, JSON.stringify(customMartyrs));
      idbSetItem(CUSTOM_MARTYRS_STORAGE_KEY, customMartyrs);
    } catch {
      // ignore
    }
  }, [customMartyrs]);

  useEffect(() => {
    try {
      localStorage.setItem(SMART_SUGGESTIONS_STORAGE_KEY, JSON.stringify(smartSuggestions));
      idbSetItem(SMART_SUGGESTIONS_STORAGE_KEY, smartSuggestions);
    } catch {
      // ignore
    }
  }, [smartSuggestions]);

  useEffect(() => {
    try {
      localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(multiMartyrGroups));
      idbSetItem(GROUPS_STORAGE_KEY, multiMartyrGroups);
    } catch {
      // ignore
    }
  }, [multiMartyrGroups]);

  useEffect(() => {
    try {
      localStorage.setItem(EXTRACTED_STORAGE_KEY, JSON.stringify(extractedItems));
      idbSetItem(EXTRACTED_STORAGE_KEY, extractedItems);
    } catch {
      // ignore
    }
  }, [extractedItems]);

  useEffect(() => {
    try {
      localStorage.setItem(AUDIT_LOG_STORAGE_KEY, JSON.stringify(auditLog));
      idbSetItem(AUDIT_LOG_STORAGE_KEY, auditLog);
    } catch {
      // ignore
    }
  }, [auditLog]);

  useEffect(() => {
    try {
      localStorage.setItem(USER_ROLE_STORAGE_KEY, activeUserRole);
    } catch {
      // ignore
    }
  }, [activeUserRole]);

  // Handlers for Workbook & Sheet Loading
  const handleWorkbookLoaded = (
    fileName: string,
    sNames: string[],
    selectedSheet: string,
    hdrs: string[],
    rows: ReferenceCatalogRow[],
    inferredMap: typeof columnMap
  ) => {
    setLoadedFileName(fileName);
    setSheetNames(sNames);
    setCurrentSheetName(selectedSheet);
    setHeaders(hdrs);
    setCatalogRows(rows);
    setColumnMap(inferredMap);
  };

  const handleSwitchSheet = (newSheetName: string) => {
    const wb = (window as unknown as { __MARKAZ_WORKBOOK__?: XLSX.WorkBook }).__MARKAZ_WORKBOOK__;
    if (!wb || !wb.Sheets[newSheetName]) {
      setCurrentSheetName(newSheetName);
      return;
    }
    const ws = wb.Sheets[newSheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: '',
      raw: false
    });
    if (!matrix.length) {
      showNotify(`شیت «${newSheetName}» خالی است.`, 'warning');
      return;
    }
    const hdrs = (matrix[0] || []).map((h, i) => String(h || `ستون ${i + 1}`).trim());
    const findIdx = (patterns: RegExp[], fallback = -1) => {
      const idx = hdrs.findIndex((h) => patterns.some((p) => p.test(h)));
      return idx >= 0 ? idx : fallback;
    };
    const inferred = {
      tempIdCol: findIdx([/شناسه موقت/, /شناسه کتاب/, /^کد$/], 0),
      titleCol: findIdx([/عنوان کتاب/, /عنوان/, /نام کتاب/, /^کتاب$/], 1),
      publisherCol: findIdx([/ناشر/, /انتشارات/], 2),
      descriptionCol: findIdx([/توضیحات ثبت/, /توضیحات/], 3),
      categoryCol: findIdx([/^دسته$/, /گروه موضوعی/, /موضوع/], 4),
      authorCol: findIdx([/نویسنده/, /گردآورنده/, /مولف/, /مؤلف/], 5),
      yearCol: findIdx([/سال چاپ/, /سال انتشار/, /^سال$/], -1)
    };

    const newRows: ReferenceCatalogRow[] = [];
    for (let i = 1; i < matrix.length; i++) {
      const rawRow = matrix[i] || [];
      const values = hdrs.map((_, colIdx) =>
        rawRow[colIdx] !== null && rawRow[colIdx] !== undefined ? String(rawRow[colIdx]).trim() : ''
      );
      if (!values.some((v) => v !== '')) continue;
      const excelRowNumber = i + 1;
      const getVal = (colIdx: number) => (colIdx >= 0 && colIdx < values.length ? values[colIdx] : '');

      newRows.push({
        rowKey: `${newSheetName}::ROW-${excelRowNumber}`,
        rowIndex: excelRowNumber,
        tempBookId: getVal(inferred.tempIdCol) || `ROW-${excelRowNumber}`,
        titleRaw: getVal(inferred.titleCol),
        publisherRaw: getVal(inferred.publisherCol),
        descriptionRaw: getVal(inferred.descriptionCol),
        categoryRaw: getVal(inferred.categoryCol),
        authorRaw: getVal(inferred.authorCol),
        isbnRaw: values[6] || '',
        fipaRaw: values[7] || '',
        registrationNoRaw: values[8] || '',
        locationRaw: values[9] || '',
        countedCopiesRaw: values[10] || '',
        reviewStatusRaw: values[11] || 'بررسی‌نشده',
        noteRaw: values[12] || '',
        backupSourceSheet: values[13] || newSheetName,
        backupSourceRow: values[14] || String(excelRowNumber),
        allValues: values
      });
    }

    setCurrentSheetName(newSheetName);
    setHeaders(hdrs);
    setColumnMap(inferred);
    setCatalogRows(newRows);
    showNotify(`شیت «${newSheetName}» بارگذاری شد (${toPersianDigits(newRows.length)} ردیف).`);
  };

  const handleUpdateColumnMap = (newMap: typeof columnMap) => {
    setColumnMap(newMap);
    setCatalogRows((prev) =>
      prev.map((row) => {
        const getVal = (colIdx: number) =>
          colIdx >= 0 && colIdx < row.allValues.length ? row.allValues[colIdx] : '';
        return {
          ...row,
          tempBookId: getVal(newMap.tempIdCol) || `ROW-${row.rowIndex}`,
          titleRaw: getVal(newMap.titleCol),
          publisherRaw: getVal(newMap.publisherCol),
          descriptionRaw: getVal(newMap.descriptionCol),
          categoryRaw: getVal(newMap.categoryCol),
          authorRaw: getVal(newMap.authorCol)
        };
      })
    );
    showNotify('نگاشت ستون‌ها به‌روزرسانی شد.');
  };

  const handleQuickExcelExport = () => {
    try {
      const wb = XLSX.utils.book_new();

      // شیت ۱: ثبت‌های میدانی قفسه (پایگاه book)
      const auditRows = Object.values(auditRecords).map((rec, i) => ({
        'ردیف': i + 1,
        'شناسه موقت کتاب': rec.tempBookId,
        'کد نسخه فیزیکی CP': rec.copyId || '-',
        'عنوان کتاب': rec.title,
        'گروه موضوعی': rec.category,
        'محل فیزیکی (قفسه-طبقه)': rec.location,
        'قفسه': rec.shelf,
        'طبقه': rec.level,
        'تعداد نسخه شمرده‌شده': rec.countedCopies,
        'وضعیت فیزیکی':
          rec.physical === 'verified'
            ? 'موجود و تأییدشده'
            : rec.physical === 'review'
            ? 'نیازمند بررسی'
            : 'پیدا نشد',
        'سلامت جلد': rec.physicalCondition || 'healthy',
        'کارشناس ثبت‌کننده': rec.checkedBy || 'کارشناس کتابخانه',
        'تاریخ ثبت': rec.updatedAt || '',
        'یادداشت میدانی': rec.notes || '',
        'پایگاه داده': 'book'
      }));
      const wsAudit = XLSX.utils.json_to_sheet(
        auditRows.length ? auditRows : [{ 'پیام': 'هنوز رکوردی ثبت نشده است' }]
      );
      XLSX.utils.book_append_sheet(wb, wsAudit, 'ثبت‌های میدانی پایگاه book');

      // شیت ۲: شناسنامه نسخه‌های فیزیکی CP
      const copyRows = bookCopies.map((cp, i) => ({
        'ردیف': i + 1,
        'کد نسخه مستقل CP': cp.copyId,
        'شناسه کتاب مرجع': cp.bookId,
        'عنوان کتاب': cp.bookTitle,
        'محل فعلی': cp.location,
        'قفسه': cp.shelf,
        'طبقه': cp.level,
        'وضعیت امانت یا جابه‌جایی': cp.loanOrMoveStatus,
        'سلامت فیزیکی': cp.physicalCondition,
        'تاریخ آخرین بررسی': cp.lastReviewedAt,
        'سوابق جابه‌جایی': cp.locationHistory
          .map((h) => `${h.fromLocation} به ${h.toLocation}`)
          .join(' | ')
      }));
      const wsCopies = XLSX.utils.json_to_sheet(
        copyRows.length ? copyRows : [{ 'پیام': 'نسخه‌ای ثبت نشده است' }]
      );
      XLSX.utils.book_append_sheet(wb, wsCopies, 'نسخه‌های فیزیکی CP');

      const nowFormatted = new Intl.DateTimeFormat('fa-IR-u-nu-latn')
        .format(new Date())
        .replace(/\//g, '-');
      const fileName = `پشتیبان-کتابخانه-پایگاه-book-${nowFormatted}.xlsx`;
      XLSX.writeFile(wb, fileName);
      showNotify(`فایل پشتیبان پایگاه book با نام «${fileName}» با موفقیت دانلود شد.`);
      return true;
    } catch {
      showNotify('خطا در صدور فایل اکسل.', 'warning');
      return false;
    }
  };

  const handleSaveAuditRecord = (record: FieldAuditRecord) => {
    const withActor: FieldAuditRecord = {
      ...record,
      checkedBy: getRoleDisplayName(activeUserRole)
    };
    setAuditRecords((prev) => ({
      ...prev,
      [record.key]: withActor
    }));
    setSessionEditsCount((prev) => prev + 1);
    const nowFaTime = new Intl.DateTimeFormat('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date());
    setLastSavedTime(nowFaTime);
    appendAuditLog(
      record.source === 'outside-list' ? 'ثبت کتاب خارج از فهرست' : 'ثبت موجودی فیزیکی',
      `${record.tempBookId}${record.copyId ? ` / ${record.copyId}` : ''}`,
      `ثبت «${record.title}» در محل ${record.location || 'بدون کد محل'} (${record.category}) در پایگاه book`
    );
  };

  const handleAddBookCopy = (newCopy: BookCopyRecord) => {
    setBookCopies((prev) => [...prev, newCopy]);
    setSessionEditsCount((prev) => prev + 1);
    const nowFaTime = new Intl.DateTimeFormat('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date());
    setLastSavedTime(nowFaTime);
    appendAuditLog(
      'ثبت نسخه فیزیکی یا جابه‌جایی قفسه',
      `${newCopy.bookId} / ${newCopy.copyId}`,
      `ایجاد نسخه فیزیکی جدید ${newCopy.copyId} در ${newCopy.location}`
    );
  };

  const handleMoveBookCopy = (
    copyId: string,
    toShelf: ShelfCode,
    toLevel: ShelfLevelCode,
    reason = 'جابه‌جایی قفسه'
  ) => {
    const nowFa = new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
    const nowFaTime = new Intl.DateTimeFormat('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date());

    setSessionEditsCount((prev) => prev + 1);
    setLastSavedTime(nowFaTime);

    setBookCopies((prev) =>
      prev.map((cp) => {
        if (cp.copyId !== copyId) return cp;
        const fromLoc = cp.location;
        const toLoc = `${toShelf}-${toLevel}`;
        return {
          ...cp,
          shelf: toShelf,
          level: toLevel,
          location: toLoc,
          lastReviewedAt: nowFa,
          locationHistory: [
            ...cp.locationHistory,
            {
              fromLocation: fromLoc,
              toLocation: toLoc,
              movedAt: nowFa,
              movedBy: getRoleDisplayName(activeUserRole),
              reason
            }
          ]
        };
      })
    );
    appendAuditLog(
      'ثبت نسخه فیزیکی یا جابه‌جایی قفسه',
      copyId,
      `انتقال قفسه نسخه ${copyId} به ${toShelf}-${toLevel} بدون تغییر شناسه کتاب`
    );
  };

  const handleMergeRecords = (newEntries: Record<string, FieldAuditRecord>) => {
    setAuditRecords((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(newEntries)) {
        if (!Object.prototype.hasOwnProperty.call(next, k)) {
          next[k] = v;
        }
      }
      return next;
    });
  };

  const handleMigrateLegacyRecords = (): number => {
    let migratedCount = 0;
    setAuditRecords((prev) => {
      const next: Record<string, FieldAuditRecord> = {};
      for (const [k, rec] of Object.entries(prev)) {
        const oldLoc = String(rec.location || '');
        const oldShelf = String(rec.shelf || '');
        if (oldLoc.startsWith('SHSF-') || oldShelf.startsWith('SHSF-')) {
          migratedCount++;
          const qMatch = oldLoc.match(/Q0?([1-6])/i) || oldShelf.match(/Q0?([1-6])/i);
          const levelNum = qMatch ? qMatch[1] : '1';
          const newShelf = 'SH-01';
          const newLevel = `T0${levelNum}` as FieldAuditRecord['level'];
          next[k] = {
            ...rec,
            shelf: newShelf,
            level: newLevel,
            location: `${newShelf}-${newLevel}`,
            notes: rec.notes
              ? `${rec.notes} (مهاجرت از کد قدیمی ${oldLoc || oldShelf})`
              : `مهاجرت از کد قدیمی ${oldLoc || oldShelf}`
          };
        } else {
          next[k] = rec;
        }
      }
      return next;
    });
    return migratedCount;
  };

  const handleDeleteSingleRecord = (key: string) => {
    setAuditRecords((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    showNotify('رکورد انتخابی از حافظه مرورگر حذف شد.');
  };

  const handleLoadSample20PilotRecords = () => {
    const sampleBatch: Record<string, FieldAuditRecord> = {};
    const levels: ShelfLevelCode[] = ['T01', 'T02', 'T03', 'T04', 'T05', 'T06'];

    catalogRows.slice(0, 20).forEach((row, idx) => {
      const catCode = (row.categoryRaw || 'R') as 'R' | 'H' | 'A' | 'P' | 'M' | 'K';
      const catMeta =
        SUBJECT_CATEGORIES.find((c) => c.code === catCode) || SUBJECT_CATEGORIES[0];

      let shelf: ShelfCode = 'SH-01';
      let level: ShelfLevelCode = levels[idx % 6];

      if (catCode === 'R') {
        shelf = idx % 2 === 0 ? 'SH-01' : 'SH-02';
        level = levels[idx % 6];
      } else if (catCode === 'H') {
        shelf = 'SH-03';
        level = 'T01';
      } else if (catCode === 'A') {
        shelf = 'SH-03';
        level = 'T02';
      } else if (catCode === 'P') {
        shelf = 'SH-03';
        level = idx % 2 === 0 ? 'T03' : 'T04';
      } else if (catCode === 'M') {
        shelf = 'SH-03';
        level = idx % 2 === 0 ? 'T05' : 'T06';
      } else if (catCode === 'K') {
        shelf = 'SH-04';
        level = 'T01';
      }

      const alloc = getAllocatedCategoryForSlot(shelf, level);
      sampleBatch[row.rowKey] = {
        key: row.rowKey,
        source: 'catalog',
        sheet: currentSheetName,
        tempBookId: row.tempBookId,
        copyId: `CP-${String(row.rowIndex - 1).padStart(6, '0')}`,
        title: row.titleRaw,
        author: row.authorRaw || '',
        publisher: row.publisherRaw,
        year: '',
        descriptionRaw: row.descriptionRaw,
        category: catMeta.label,
        shelf,
        level,
        location: `${shelf}-${level}`,
        physical: 'verified',
        copyStatus: 'verified_present',
        physicalCondition: 'healthy',
        countedCopies: '1',
        checkedBy: getRoleDisplayName(activeUserRole),
        notes: `ثبت آزمایشی پایلوت ۲۰ کتاب (${alloc.title})`,
        backupSourceSheet: row.backupSourceSheet,
        backupSourceRow: row.backupSourceRow,
        updatedAt: new Date().toISOString()
      };
    });

    handleMergeRecords(sampleBatch);
    appendAuditLog(
      'ثبت موجودی فیزیکی',
      'PILOT-20',
      'بارگذاری ۲۰ رکورد نمونه پایلوت کتابخانه منطبق با نقشه قفسه‌های SH-01 تا SH-04'
    );
    showNotify(
      '۲۰ رکورد آزمایشی پایلوت مطابق با نقشه قفسه‌ها (SH-01 تا SH-04) بدون بازنویسی ثبت‌های قبلی بارگذاری شد.'
    );
  };

  const totalSavedCount = Object.keys(auditRecords).length;

  const TAB_HEADER_INFO: Record<
    Exclude<MainMenuTab, 'home'>,
    { title: string; description: string }
  > = {
    library: {
      title: 'کتابخانه و مدیریت نسخه‌های قفسه',
      description:
        'جست‌وجو و فیلتر پیشرفته کتاب‌ها، ثبت موجودی فیزیکی قفسه‌ها (SH-01 تا SH-04)، جانمایی طبقات و چاپ برچسب کتاب‌ها'
    },
    martyrs: {
      title: 'پرونده شهدا و بانک جامع مزارات گلزار شهدای تهران',
      description: ''
    },
    smart_search: {
      title: 'جست‌وجوی هوشمند کتاب‌ها و منابع مرتبط با شهدا',
      description:
        'کاوش خودکار در فهرست کتابخانه، منابع بیرونی و پایلوت شهدا جهت کشف و پیشنهاد ارتباط‌های جدید به کارشناس'
    },
    research: {
      title: 'میز پژوهش، بررسی ارتباط کتاب و شهید و استخراج مطالب',
      description:
        'بازبینی ارتباط‌های ثبت‌شده، تعیین تکلیف موارد نیازمند بررسی، تفکیک گروه‌های چندشهیدی و ثبت مطالب مستخرج با شماره صفحه'
    },
    management: {
      title: 'پشتیبانی و گزارش‌ها',
      description:
        'دریافت و بازیابی امن فایل پشتیبان JSON، خروجی Excel/CSV، نصب برنامه روی گوشی اندروید و مشاهده گزارش‌های مدیریتی'
    }
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden flex flex-col bg-[#FDF8F2] text-[#332218] pb-20">
      {activeTab === 'home' ? (
        <>
          {/* هدر پهن صفحه خانه: آرم گلزار شهدای تهران در سمت راست + عنوان کامل سامانه با پهنای حداکثری */}
          <header className="sticky top-0 z-30 w-full max-w-full bg-[#8C3B2B] text-white px-2.5 sm:px-8 py-3 sm:py-4 shadow-xs border-b border-[#702D20]">
            <div className="max-w-6xl w-full mx-auto flex items-center gap-2.5 sm:gap-4">
              {/* آرم گلزار شهدای تهران در سمت راست هدر */}
              <div className="w-12 h-14 sm:w-16 sm:h-20 rounded-xl bg-[#FDF8F2] border-2 border-[#E6D5C1] shadow-xs flex items-center justify-center shrink-0 overflow-hidden p-1">
                <img
                  src="./golzar-logo.png"
                  alt="آرم گلزار شهدای تهران"
                  className="w-full h-full object-contain"
                />
              </div>

              {/* عنوان اصلی سامانه با پهنای کامل در موبایل و دسکتاپ */}
              <div className="w-full flex-1 min-w-0">
                <h1 className="w-full font-titr text-base sm:text-xl md:text-2xl font-bold tracking-normal text-[#FDF8F2] leading-relaxed break-words">
                  سامانه کتابخانه و پژوهش مرکز اسناد گلزار شهدا
                </h1>
              </div>
            </div>
          </header>

          {/* نوار ابزار در یک Flex Container تک‌خطی زیر هدر: پشتیبان | نقش کاربر | دریافت آخرین نسخه | آیکون نصب */}
          <div className="w-full max-w-full bg-white border-b border-[#E6D5C1] px-2 sm:px-6 py-2">
            <div className="max-w-6xl w-full mx-auto flex flex-nowrap items-center justify-between gap-1.5 sm:gap-2.5 text-xs overflow-x-auto no-scrollbar">
              {/* ۱. کلید پشتیبان */}
              <button
                type="button"
                onClick={() => {
                  setActiveTab('management');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                title="پشتیبان و گزارش‌ها"
                className="flex-1 min-h-[34px] px-2 sm:px-3 py-1 text-[10px] sm:text-xs font-bold rounded-lg bg-[#FDF8F2] text-[#8C3B2B] hover:bg-amber-100 border border-[#E6D5C1] transition-colors inline-flex items-center justify-center gap-1 min-w-0 whitespace-nowrap truncate cursor-pointer"
              >
                <DatabaseBackup className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate sm:hidden">پشتیبان ({toPersianDigits(totalSavedCount)})</span>
                <span className="truncate hidden sm:inline">
                  پشتیبان و گزارش‌ها ({toPersianDigits(totalSavedCount)})
                </span>
              </button>

              {/* ۲. کلید نقش کاربر (مدیر سامانه) */}
              <div className="flex-1 min-h-[34px] px-2 sm:px-3 py-1 bg-[#EAF1F7] border border-slate-200 rounded-lg inline-flex items-center justify-center gap-1 min-w-0 whitespace-nowrap">
                <UserCog className="w-3.5 h-3.5 text-[#1F4E79] shrink-0" />
                <span className="hidden md:inline text-[11px] text-[#697586] shrink-0">نقش کاربر:</span>
                <select
                  value={activeUserRole}
                  onChange={(e) => setActiveUserRole(e.target.value as UserRoleCode)}
                  aria-label="نقش کاربر"
                  className="bg-transparent font-bold text-[#253247] text-[10px] sm:text-xs focus:outline-none truncate max-w-full cursor-pointer"
                >
                  {USER_ROLES.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* ۳. کلید دریافت آخرین نسخه */}
              <button
                type="button"
                onClick={async () => {
                  try {
                    if ('serviceWorker' in navigator) {
                      const regs = await navigator.serviceWorker.getRegistrations();
                      for (const r of regs) {
                        await r.unregister();
                      }
                    }
                    if ('caches' in window) {
                      const keys = await caches.keys();
                      await Promise.all(keys.map((k) => caches.delete(k)));
                    }
                  } catch {
                    // ignore
                  }
                  const cleanUrl = window.location.origin + window.location.pathname + '?v=' + Date.now();
                  window.location.replace(cleanUrl);
                }}
                title="پاک‌سازی کش مرورگر گوشی و دریافت آخرین نسخه از گیت‌هاب"
                className="flex-1 min-h-[34px] px-2 sm:px-3 py-1 text-[10px] sm:text-xs font-bold bg-[#F5E6D3] text-[#8C3B2B] hover:bg-amber-200/70 border border-[#E6D5C1] rounded-lg transition-colors inline-flex items-center justify-center gap-1 min-w-0 whitespace-nowrap truncate cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">دریافت آخرین نسخه</span>
              </button>

              {/* ۴. آیکون کوچک نصب روی گوشی */}
              <button
                type="button"
                onClick={async () => {
                  if (isInstallable) {
                    await promptInstall();
                  } else {
                    setShowHeaderInstallModal(true);
                  }
                }}
                title="نصب برنامه روی گوشی اندروید"
                aria-label="نصب برنامه روی گوشی اندروید"
                className="min-h-[34px] w-9 sm:w-auto sm:px-2.5 py-1 text-[10px] sm:text-xs font-bold bg-[#2E7D5B] text-white hover:bg-[#236347] rounded-lg transition-colors inline-flex items-center justify-center gap-1 shrink-0 cursor-pointer"
              >
                <Smartphone className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">نصب</span>
              </button>

              {/* ۵. کلید پایان شیفت و خروج با تأیید */}
              <button
                type="button"
                onClick={() => setShowExitConfirmModal(true)}
                title="تأیید ذخیره‌سازی اطلاعات و خروج امن از سامانه"
                className="flex-1 min-h-[34px] px-2 sm:px-3 py-1 text-[10px] sm:text-xs font-bold bg-[#8C3B2B] text-white hover:bg-[#702D20] rounded-lg transition-colors inline-flex items-center justify-center gap-1 min-w-0 whitespace-nowrap truncate cursor-pointer shadow-xs"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">پایان شیفت / خروج</span>
                {sessionEditsCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-white text-[#8C3B2B] text-[9px] font-bold flex items-center justify-center shrink-0">
                    {toPersianDigits(sessionEditsCount)}
                  </span>
                )}
              </button>
            </div>
            {!isOnline && (
              <div className="max-w-6xl mx-auto pt-1.5 flex justify-end">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-100 text-amber-950 font-bold text-[10px] border border-amber-300">
                  <WifiOff className="w-3 h-3 shrink-0" />
                  <span>حالت آفلاین فعال است</span>
                </span>
              </div>
            )}
          </div>
        </>
      ) : (
        /* هدر تمیز و متناسب سایر برگ‌ها: بدون شلوغی و با یک دکمه خروج فوق‌العاده ظریف و شکیل */
        <header className="sticky top-0 z-30 w-full max-w-full bg-[#8C3B2B] text-white px-3 sm:px-8 py-2.5 sm:py-3.5 shadow-xs border-b border-[#702D20]">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="font-titr text-base sm:text-lg md:text-xl font-bold text-[#FDF8F2] leading-snug">
                {TAB_HEADER_INFO[activeTab].title}
              </h1>
              {TAB_HEADER_INFO[activeTab].description ? (
                <p className="text-[11px] sm:text-xs text-amber-100/90 leading-relaxed mt-0.5">
                  {TAB_HEADER_INFO[activeTab].description}
                </p>
              ) : null}
            </div>

            {/* کلید خروج فوق‌العاده ظریف و کوچک (فقط یک آیکون خروج مینیمال بدون برهم زدن هدر) */}
            <div className="flex items-center shrink-0">
              <button
                type="button"
                onClick={() => setShowExitConfirmModal(true)}
                className="min-h-[32px] px-2.5 py-1 text-xs font-medium bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/20 shadow-xs inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
                title="خروج با تأیید و ذخیره امن"
                aria-label="خروج با تأیید"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[10px] sm:text-xs font-bold">خروج</span>
                {sessionEditsCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-white text-[#8C3B2B] text-[9px] font-bold flex items-center justify-center shrink-0">
                    {toPersianDigits(sessionEditsCount)}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>
      )}

      {/* نوار وضعیت پایگاه داده book در حافظه محلی گوشی (فقط در صفحه اول نمایش داده می‌شود) */}
      {activeTab === 'home' && (
        <div className="w-full bg-[#FAF3EA] border-b border-[#E6D5C1] px-2.5 sm:px-6 py-1.5">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2 text-[11px] sm:text-xs text-[#5D4636]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 font-bold text-[#8C3B2B]">
                <span className="w-2 h-2 rounded-full bg-[#2E7D5B]" />
                عنوان پایگاه داده در گوشی: <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-[#E6D5C1]">book</strong>
              </span>
              <span className="text-[#8C7A6B]">|</span>
              <span>کل رکوردهای ثبت‌شده در دستگاه: <strong>{toPersianDigits(totalSavedCount)}</strong></span>
              {sessionEditsCount > 0 && (
                <>
                  <span className="text-[#8C7A6B]">|</span>
                  <span className="text-[#2E7D5B] font-bold">
                    {toPersianDigits(sessionEditsCount)} ثبت جدید در این نشست (ذخیره آنی در دستگاه)
                  </span>
                </>
              )}
              {lastSavedTime && (
                <span className="hidden md:inline text-slate-500">
                  (آخرین ثبت: {lastSavedTime})
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleQuickExcelExport}
                title="خروجی سریع اکسل از کلیه رکوردهای پایگاه book"
                className="text-[#1F4E79] hover:underline font-bold inline-flex items-center gap-1 text-[11px] cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>خروجی اکسل book</span>
              </button>
              <span className="text-[#8C7A6B]">·</span>
              <button
                type="button"
                onClick={() => setShowExitConfirmModal(true)}
                className="text-[#8C3B2B] hover:underline font-bold inline-flex items-center gap-1 text-[11px] cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>خروج با تأیید</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`w-full max-w-full px-3 sm:px-4 py-2.5 text-xs font-medium border-b ${
            toast.type === 'warning'
              ? 'bg-amber-100 border-amber-300 text-amber-950'
              : 'bg-[#2E7D5B] border-emerald-900 text-white'
          }`}
        >
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {toast.type === 'warning' ? (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              <span className="break-words">{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="opacity-80 hover:opacity-100 text-[11px] shrink-0"
            >
              بستن
            </button>
          </div>
        </div>
      )}

      {/* Main Content Container (Centered & Constrained on Mobile) */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-2.5 sm:px-6 py-3 sm:py-6 overflow-x-hidden">
        {isShiftEnded ? (
          <div className="min-h-[55vh] flex items-center justify-center p-3 sm:p-6">
            <div className="bg-white border-2 border-[#2E7D5B] rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-xl text-center space-y-5">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 text-[#2E7D5B] border border-emerald-200 flex items-center justify-center shadow-xs">
                <ShieldCheck className="w-9 h-9" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-slate-900">شیفت کاری با موفقیت پایان یافت</h2>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  کلیه اطلاعات شما در پایگاه داده اختصاصی <strong className="font-mono text-[#8C3B2B] bg-amber-50 px-2 py-0.5 rounded border border-[#E6D5C1]">book</strong> در حافظه این گوشی به طور پایدار و امن ثبت و محفوظ است.
                </p>
              </div>

              <div className="bg-[#FAF3EA] border border-[#E6D5C1] rounded-xl p-4 text-xs text-right space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">عنوان پایگاه داده در گوشی:</span>
                  <span className="font-mono font-bold text-[#8C3B2B] bg-white px-2 py-0.5 rounded border border-[#E6D5C1]">book</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">مجموع کتاب‌های ثبت‌شده در پایگاه:</span>
                  <span className="font-bold text-slate-900">{toPersianDigits(totalSavedCount)} جلد</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">وضعیت پایداری اطلاعات:</span>
                  <span className="font-bold text-[#2E7D5B]">ذخیره کامل در حافظه دستگاه ✅</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500">
                اکنون می‌توانید با خیال آسوده صفحه مرورگر را ببندید، یا در صورت تمایل شیفت جدیدی را آغاز نمایید.
              </p>

              <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={handleQuickExcelExport}
                  className="flex-1 min-h-[44px] px-4 py-2.5 bg-[#2E7D5B] hover:bg-[#236247] text-white font-bold text-xs rounded-xl inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 shrink-0" />
                  <span>دانلود فایل اکسل پشتیبان</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsShiftEnded(false);
                    setActiveTab('home');
                  }}
                  className="flex-1 min-h-[44px] px-4 py-2.5 bg-[#8C3B2B] hover:bg-[#702D20] text-white font-bold text-xs rounded-xl inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <span>شروع شیفت جدید و ورود</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* MENU 1: HOME (خانه) */}
        {activeTab === 'home' && (
          <HomeDashboardTab
            catalogRows={catalogRows}
            auditRecords={auditRecords}
            bookCopies={bookCopies}
            links={links}
            pendingReviews={pendingReviews}
            workbookMartyrs={workbookMartyrs}
            extractedItems={extractedItems}
            smartSuggestions={smartSuggestions}
            auditLog={auditLog}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onSaveVoiceOrQuickBook={(rec, newCopy) => {
              handleSaveAuditRecord(rec);
              if (newCopy) {
                handleAddBookCopy(newCopy);
              }
            }}
            onNotify={showNotify}
          />
        )}

        {/* MENU 2: LIBRARY (کتابخانه — فهرست کتاب‌ها، نسخه‌های فیزیکی، نقشه قفسه‌ها و برچسب‌ها) */}
        {activeTab === 'library' && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#253247] px-1">
                <BookOpen className="w-4 h-4 text-[#1F4E79] shrink-0" />
                <span>کتابخانه، نسخه‌های قفسه (SH-01..04) و برچسب:</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 bg-[#F5F7FA] p-1 rounded-xl text-xs w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setLibrarySubView('catalog')}
                  className={`flex-1 sm:flex-initial px-2.5 py-1.5 rounded-lg font-bold transition-colors text-center ${
                    librarySubView === 'catalog'
                      ? 'bg-[#1F4E79] text-white'
                      : 'text-[#253247] hover:bg-slate-200'
                  }`}
                >
                  جست‌وجو و ثبت کتاب
                </button>
                <button
                  type="button"
                  onClick={() => setLibrarySubView('shelves')}
                  className={`flex-1 sm:flex-initial px-2.5 py-1.5 rounded-lg font-bold transition-colors inline-flex items-center justify-center gap-1 ${
                    librarySubView === 'shelves'
                      ? 'bg-[#1F4E79] text-white'
                      : 'text-[#253247] hover:bg-slate-200'
                  }`}
                >
                  <Grid className="w-3.5 h-3.5 shrink-0" />
                  <span>نقشه قفسه و برچسب</span>
                </button>
              </div>
            </div>

            {librarySubView === 'catalog' ? (
              <QuickInventoryTab
                catalogRows={catalogRows}
                bookMartyrLinks={links}
                bookCopies={bookCopies}
                sheetNames={sheetNames}
                currentSheetName={currentSheetName}
                headers={headers}
                columnMap={columnMap}
                auditRecords={auditRecords}
                loadedFileName={loadedFileName}
                onWorkbookLoaded={handleWorkbookLoaded}
                onSwitchSheet={handleSwitchSheet}
                onUpdateColumnMap={handleUpdateColumnMap}
                onSaveAuditRecord={handleSaveAuditRecord}
                onAddBookCopy={handleAddBookCopy}
                onMoveBookCopy={handleMoveBookCopy}
                onNotify={showNotify}
              />
            ) : (
              <ShelfMapAndLabelsTab auditRecords={auditRecords} />
            )}
          </div>
        )}

        {/* MENU 3: MARTYRS (شهدا — پرونده شهید، بانک ۲۸٬۳۶۸ نفری، اتصال کتاب و پرش به جست‌وجوی هوشمند) */}
        {activeTab === 'martyrs' && (
          <AllMartyrsDatabaseTab
            catalogRows={catalogRows}
            links={links}
            extractedItems={extractedItems}
            customMartyrs={customMartyrs}
            onAddCustomMartyr={(newMartyr) => {
              setCustomMartyrs((prev) => [newMartyr, ...prev]);
              setSessionEditsCount((prev) => prev + 1);
              setLastSavedTime(
                new Intl.DateTimeFormat('fa-IR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                }).format(new Date())
              );
              appendAuditLog(
                'ثبت یا ویرایش پرونده شهید',
                newMartyr.martyrId,
                `ثبت پرونده شهید «${newMartyr.fullName}» در پایگاه book (قطعه: ${newMartyr.gravePiece || '—'}، ردیف: ${newMartyr.graveRow || '—'}، قبر: ${newMartyr.graveNumber || '—'})`
              );
            }}
            onUpdateCustomMartyr={(updated) => {
              setCustomMartyrs((prev) =>
                prev.map((cm) => (cm.martyrId === updated.martyrId ? updated : cm))
              );
              setSessionEditsCount((prev) => prev + 1);
              setLastSavedTime(
                new Intl.DateTimeFormat('fa-IR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                }).format(new Date())
              );
              appendAuditLog(
                'ثبت یا ویرایش پرونده شهید',
                updated.martyrId,
                `به‌روزرسانی و صحت‌سنجی پرونده شهید «${updated.fullName}» (وضعیت هویت: ${updated.identityVerificationStatus}، مزار: ${updated.graveVerificationStatus})`
              );
            }}
            onDeleteCustomMartyr={(martyrId) => {
              const target = customMartyrs.find((cm) => cm.martyrId === martyrId);
              setCustomMartyrs((prev) => prev.filter((cm) => cm.martyrId !== martyrId));
              setSessionEditsCount((prev) => prev + 1);
              setLastSavedTime(
                new Intl.DateTimeFormat('fa-IR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                }).format(new Date())
              );
              appendAuditLog(
                'ثبت یا ویرایش پرونده شهید',
                martyrId,
                `حذف پرونده شهید مستقل «${target?.fullName || martyrId}» از پایگاه داده این دستگاه`
              );
            }}
            onLinkMartyrToBook={(newLink) => {
              setLinks((prev) => [newLink, ...prev]);
              setSessionEditsCount((prev) => prev + 1);
              setLastSavedTime(
                new Intl.DateTimeFormat('fa-IR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                }).format(new Date())
              );
              appendAuditLog(
                'ثبت یا ویرایش ارتباط کتاب و شهید',
                `${newLink.id} / ${newLink.tempBookId}`,
                `اتصال شهید «${newLink.martyrNameRaw}» به کتاب «${newLink.bookTitleRaw}» در پایگاه book`
              );
            }}
            onNavigateToSmartSearch={(martyrName: string) => {
              setPreselectedSmartMartyrName(martyrName);
              setActiveTab('smart_search');
            }}
            onNotify={showNotify}
          />
        )}

        {/* MENU 4: SMART SEARCH (جست‌وجوی هوشمند کتاب‌های مرتبط با شهدا و پایلوت ۲۰ شهید) */}
        {activeTab === 'smart_search' && (
          <SmartBookSearchTab
            catalogRows={catalogRows}
            workbookMartyrs={workbookMartyrs}
            smartSuggestions={smartSuggestions}
            initialMartyrQuery={preselectedSmartMartyrName}
            onAddSuggestion={(newSug: SmartSearchSuggestion) => {
              setSmartSuggestions((prev) => [newSug, ...prev]);
              appendAuditLog(
                'بررسی پیشنهاد جست‌وجوی هوشمند',
                newSug.id,
                `افزودن پیشنهاد کتاب «${newSug.bookTitle}» برای «${newSug.martyrName}» به صف بررسی کارشناس`
              );
            }}
            onUpdateSuggestion={(updated: SmartSearchSuggestion) => {
              setSmartSuggestions((prev) =>
                prev.map((s) => (s.id === updated.id ? updated : s))
              );
              appendAuditLog(
                'بررسی پیشنهاد جست‌وجوی هوشمند',
                updated.id,
                `تغییر وضعیت پیشنهاد هوشمند «${updated.bookTitle}» برای «${updated.martyrName}» به «${updated.reviewStatus}»`
              );
            }}
            onApproveSuggestionToLinks={(sug: SmartSearchSuggestion, newLink: BookMartyrLinkRecord) => {
              setSmartSuggestions((prev) =>
                prev.map((s) => (s.id === sug.id ? sug : s))
              );
              setLinks((prev) => [newLink, ...prev]);
              appendAuditLog(
                'ثبت یا ویرایش ارتباط کتاب و شهید',
                newLink.id,
                `تأیید پیشنهاد هوشمند و ثبت ارتباط میان «${newLink.bookTitleRaw}» و «${newLink.martyrNameRaw}»`
              );
            }}
            onNotify={showNotify}
          />
        )}

        {/* MENU 5: RESEARCH & REVIEW (پژوهش و بررسی + درگاه انتشار سایت گلزار) */}
        {activeTab === 'research' && (
          <ResearchAndLinksTab
            catalogRows={catalogRows}
            links={links}
            pendingReviews={pendingReviews}
            workbookMartyrs={workbookMartyrs}
            multiMartyrGroups={multiMartyrGroups}
            extractedItems={extractedItems}
            onAddLink={(newLnk) => {
              setLinks((prev) => [newLnk, ...prev]);
              appendAuditLog(
                'ثبت یا ویرایش ارتباط کتاب و شهید',
                `${newLnk.id} / ${newLnk.tempBookId}`,
                `ثبت ارتباط پژوهشی جدید میان «${newLnk.bookTitleRaw}» و «${newLnk.martyrNameRaw}»`
              );
            }}
            onUpdateLinkStatus={(linkId, status, note) => {
              setLinks((prev) =>
                prev.map((l) =>
                  l.id === linkId ? { ...l, reviewStatus: status, reviewerNote: note } : l
                )
              );
              appendAuditLog(
                'ثبت یا ویرایش ارتباط کتاب و شهید',
                linkId,
                `تغییر وضعیت بررسی ارتباط ${linkId} به «${status}»`
              );
            }}
            onUpdatePendingReviewStatus={(trackingId, newStatus) => {
              setPendingReviews((prev) =>
                prev.map((pv) =>
                  pv.trackingId === trackingId ? { ...pv, trackingStatus: newStatus } : pv
                )
              );
              appendAuditLog(
                'تغییر وضعیت پیگیری',
                trackingId,
                `تغییر وضعیت پیگیری مورد ${trackingId} به «${newStatus}»`
              );
            }}
            onUpdateGroupAudit={(updatedGroup) => {
              setMultiMartyrGroups((prev) =>
                prev.map((g) => (g.groupCode === updatedGroup.groupCode ? updatedGroup : g))
              );
              appendAuditLog(
                'بازبینی گروه چندشهیدی',
                updatedGroup.groupCode,
                `بازبینی گروه ${updatedGroup.groupCode} (${updatedGroup.registeredTitle}) — وضعیت: ${updatedGroup.decisionStatus}`
              );
            }}
            onAddExtractedItem={(newItem) => {
              setExtractedItems((prev) => [newItem, ...prev]);
              appendAuditLog(
                'ثبت مطلب استخراج‌شده',
                `${newItem.id} / ${newItem.tempBookId}`,
                `ثبت مطلب استخراج‌شده (${newItem.contentType}) برای «${newItem.martyrNameRaw}» با ارجاع صفحه خام «${newItem.pageReferenceRaw}»`
              );
            }}
            onUpdateExtractedItemStatus={(
              id: string,
              status: ExtractedReviewStatus,
              reviewerName: string,
              researcherNote: string
            ) => {
              setExtractedItems((prev) =>
                prev.map((it) =>
                  it.id === id
                    ? { ...it, reviewStatus: status, reviewedBy: reviewerName, researcherNote }
                    : it
                )
              );
              appendAuditLog(
                'ثبت مطلب استخراج‌شده',
                id,
                `تغییر وضعیت بازبینی مطلب استخراج‌شده ${id} به «${status}»`
              );
            }}
            onNotify={showNotify}
          />
        )}

        {/* MANAGEMENT, BACKUP & 16 REPORTS */}
        {activeTab === 'management' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-2xl p-3">
              <span className="text-xs font-bold text-[#253247] px-1">
                پشتیبان JSON، خروجی Excel، نسخه آفلاین و گزارش‌های ۱۶گانه:
              </span>
              <div className="flex flex-wrap items-center gap-1.5 bg-[#F5F7FA] p-1 rounded-xl text-xs w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setShowPilotSubView(false)}
                  className={`flex-1 sm:flex-initial px-2.5 py-1.5 rounded-lg font-bold transition-colors text-center ${
                    !showPilotSubView ? 'bg-[#1F4E79] text-white' : 'text-[#253247]'
                  }`}
                >
                  پشتیبان و خروجی‌ها
                </button>
                <button
                  type="button"
                  onClick={() => setShowPilotSubView(true)}
                  className={`flex-1 sm:flex-initial px-2.5 py-1.5 rounded-lg font-bold transition-colors text-center ${
                    showPilotSubView ? 'bg-[#1F4E79] text-white' : 'text-[#253247]'
                  }`}
                >
                  گزارش‌های ۱۶گانه و آزمون‌ها
                </button>
              </div>
            </div>

            {!showPilotSubView ? (
              <BackupAndExportTab
                auditRecords={auditRecords}
                catalogRows={catalogRows}
                headers={headers}
                currentSheetName={currentSheetName}
                onMergeRecords={handleMergeRecords}
                onMigrateLegacyRecords={handleMigrateLegacyRecords}
                onDeleteSingleRecord={handleDeleteSingleRecord}
                onNotify={showNotify}
                onOpenComprehensiveDoc={() => setShowComprehensiveDocModal(true)}
              />
            ) : (
              <PilotTestAndReportTab
                catalogRows={catalogRows}
                auditRecords={auditRecords}
                bookCopies={bookCopies}
                links={links}
                extractedItems={extractedItems}
                pendingReviews={pendingReviews}
                smartSuggestions={smartSuggestions}
                multiMartyrGroups={multiMartyrGroups}
                auditLog={auditLog}
                loadedFileName={loadedFileName}
                currentSheetName={currentSheetName}
                onLoadSample20PilotRecords={handleLoadSample20PilotRecords}
                onNotify={showNotify}
              />
            )}

            <ComprehensiveDocViewer
              isOpen={showComprehensiveDocModal}
              onClose={() => setShowComprehensiveDocModal(false)}
              onNotify={showNotify}
            />
          </div>
        )}
          </>
        )}
      </main>

      {/* Quiet Footer for Desktop */}
      <footer className="hidden md:block max-w-6xl w-full mx-auto px-6 py-4 text-xs text-[#697586] border-t border-slate-200/80">
        <div className="flex items-center justify-between gap-4">
          <span>
            مرکز اسناد گلزار شهدای تهران · سامانه جامع کتابخانه، ثبت موجودی فیزیکی، جست‌وجوی هوشمند و پژوهش شهدا
          </span>
          <span className="tabular-nums">
            ۵ منوی اصلی · ذخیره‌سازی دوگانه IndexedDB + localStorage · پشتیبانی کامل آفلاین (PWA)
          </span>
        </div>
      </footer>

      {/* Floating Circular Scroll-to-Top Button (Appears after 400px scroll on all pages) */}
      {showScrollTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="بازگشت سریع به بالای صفحه"
          title="بازگشت سریع به بالای صفحه"
          className="fixed bottom-20 left-4 sm:left-6 z-50 w-12 h-12 rounded-full bg-[#8C3B2B] hover:bg-[#702D20] text-[#FDF8F2] shadow-lg border-2 border-[#FDF8F2] flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}

      {/* پنج برگه اصلی پایین صفحه همراه با آیکون‌هایشان (خانه، کتابخانه، شهدا، جست‌وجو، پژوهش) */}
      <nav
        aria-label="پنج منوی اصلی پایین صفحه"
        className="fixed bottom-0 inset-x-0 w-full max-w-full overflow-hidden z-40 bg-[#FDF8F2]/95 backdrop-blur-md border-t border-[#E6D5C1] shadow-sm"
      >
        <div className="max-w-6xl mx-auto grid grid-cols-5 items-center h-16 px-1 sm:px-4">
          <button
            type="button"
            onClick={() => {
              setActiveTab('home');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`min-w-0 min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors px-0.5 cursor-pointer ${
              activeTab === 'home' ? 'text-[#8C3B2B] font-bold bg-[#F5E6D3]' : 'text-[#755C48] hover:bg-[#F5E6D3]/50'
            }`}
          >
            <Home className="w-5 h-5 shrink-0" />
            <span className="text-[10px] sm:text-xs mt-1 truncate max-w-full">خانه</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('library');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`min-w-0 min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors px-0.5 cursor-pointer ${
              activeTab === 'library' ? 'text-[#8C3B2B] font-bold bg-[#F5E6D3]' : 'text-[#755C48] hover:bg-[#F5E6D3]/50'
            }`}
          >
            <BookOpen className="w-5 h-5 shrink-0" />
            <span className="text-[10px] sm:text-xs mt-1 truncate max-w-full">کتابخانه</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('martyrs');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`min-w-0 min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors px-0.5 cursor-pointer ${
              activeTab === 'martyrs' ? 'text-[#8C3B2B] font-bold bg-[#F5E6D3]' : 'text-[#755C48] hover:bg-[#F5E6D3]/50'
            }`}
          >
            <Users className="w-5 h-5 shrink-0" />
            <span className="text-[10px] sm:text-xs mt-1 truncate max-w-full">شهدا</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('smart_search');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`min-w-0 min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors px-0.5 cursor-pointer ${
              activeTab === 'smart_search'
                ? 'text-[#8C3B2B] font-bold bg-[#F5E6D3]'
                : 'text-[#755C48] hover:bg-[#F5E6D3]/50'
            }`}
          >
            <Sparkles className="w-5 h-5 shrink-0" />
            <span className="text-[10px] sm:text-xs mt-1 truncate max-w-full">جست‌وجو</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('research');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`min-w-0 min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors px-0.5 cursor-pointer ${
              activeTab === 'research' ? 'text-[#8C3B2B] font-bold bg-[#F5E6D3]' : 'text-[#755C48] hover:bg-[#F5E6D3]/50'
            }`}
          >
            <FileSearch className="w-5 h-5 shrink-0" />
            <span className="text-[10px] sm:text-xs mt-1 truncate max-w-full">پژوهش</span>
          </button>
        </div>
      </nav>

      {/* راهنمای نصب برنامه روی گوشی از طریق آیکون کوچک بالای صفحه خانه */}
      {showHeaderInstallModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-[#253247]">
                راهنمای نصب برنامه روی صفحه اصلی گوشی اندروید (PWA)
              </h3>
              <button
                type="button"
                onClick={() => setShowHeaderInstallModal(false)}
                className="px-2.5 py-1 text-xs bg-slate-100 rounded-lg"
              >
                بستن
              </button>
            </div>
            <div className="space-y-2.5 text-xs text-[#253247] leading-relaxed">
              <p className="font-bold text-[#1F4E79]">در گوشی‌های اندروید (مرورگر Chrome):</p>
              <ol className="list-decimal pr-5 space-y-1">
                <li>روی دکمه منوی سه نقطه (⋮) در بالای مرورگر کروم بزنید.</li>
                <li>گزینه <strong>«Install app»</strong> یا <strong>«افزودن به صفحه اصلی (Add to Home screen)»</strong> را انتخاب کنید.</li>
                <li>آیکون «مرکز اسناد» به صفحه اصلی گوشی اضافه می‌شود و به صورت تمام‌صفحه و آفلاین کار می‌کند.</li>
              </ol>
              <p className="font-bold text-[#1F4E79] pt-2">در آیفون و آیپد (مرورگر Safari):</p>
              <ol className="list-decimal pr-5 space-y-1">
                <li>دکمه <strong>Share</strong> در نوار پایین سافاری را بزنید.</li>
                <li>گزینه <strong>Add to Home Screen</strong> را انتخاب نمایید.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* پنجره هشدار و تأیید ذخیره‌سازی اطلاعات قبل از خروج (پایگاه book) */}
      {showExitConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-[#2E7D5B]" />
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  تأیید ذخیره‌سازی اطلاعات و پایان شیفت کاری
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowExitConfirmModal(false)}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* کارت گزارش وضعیت ذخیره در گوشی با عنوان book */}
            <div className="bg-[#FAF3EA] border border-[#E6D5C1] rounded-xl p-3.5 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#5D4636]">محل و عنوان ثبت در گوشی:</span>
                <span className="font-mono font-bold text-sm bg-white px-2 py-0.5 rounded border border-[#E6D5C1] text-[#8C3B2B]">
                  book
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#5D4636]">ثبت‌ها و تغییرات انجام‌شده در این نشست:</span>
                <span className="font-bold text-[#2E7D5B] text-sm">
                  {toPersianDigits(sessionEditsCount)} رکورد
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#5D4636]">مجموع کل کتاب‌های ثبت‌شده در پایگاه book:</span>
                <span className="font-bold text-slate-800">
                  {toPersianDigits(totalSavedCount)} جلد
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#5D4636]">آخرین زمان ذخیره در حافظه دستگاه:</span>
                <span className="text-slate-700 font-mono">
                  {lastSavedTime || 'لحظاتی پیش'}
                </span>
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-950 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#2E7D5B] shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                کلیه اطلاعات شما به صورت خودکار و پایدار در پایگاه <strong>book</strong> در حافظه مرورگر این گوشی ذخیره شده است. برای آسودگی خاطر کامل و پیشگیری از حذف احتمالی توسط مرورگر، پیشنهاد می‌شود پیش از خروج، یک نسخه فایل اکسل نیز دریافت نمایید.
              </p>
            </div>

            <p className="text-xs text-slate-700 font-semibold text-center">
              آیا مایلید از سامانه کتابخانه خارج شوید؟
            </p>

            {/* کلیدهای سه‌گانه تصمیم‌گیری */}
            <div className="space-y-2 pt-1">
              {/* گزینه ۱: دریافت اکسل و خروج */}
              <button
                type="button"
                onClick={() => {
                  handleQuickExcelExport();
                  setSessionEditsCount(0);
                  setShowExitConfirmModal(false);
                  setIsShiftEnded(true);
                }}
                className="w-full min-h-[46px] px-4 py-2.5 bg-[#2E7D5B] hover:bg-[#236247] text-white font-bold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
                <span>ذخیره قطعی + دریافت فوری فایل اکسل و خروج (توصیه‌شده)</span>
              </button>

              {/* گزینه ۲: خروج مستقیم با اطمینان از ذخیره در پایگاه book */}
              <button
                type="button"
                onClick={() => {
                  setSessionEditsCount(0);
                  setShowExitConfirmModal(false);
                  setIsShiftEnded(true);
                  showNotify('خروج با موفقیت ثبت شد. اطلاعات در پایگاه book در گوشی محفوظ است.');
                }}
                className="w-full min-h-[42px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 text-slate-500 shrink-0" />
                <span>تأیید خروج (اطلاعات در پایگاه book روی گوشی ذخیره است)</span>
              </button>

              {/* گزینه ۳: انصراف و بازگشت به کار */}
              <button
                type="button"
                onClick={() => setShowExitConfirmModal(false)}
                className="w-full min-h-[40px] px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-xs rounded-xl flex items-center justify-center transition-colors cursor-pointer"
              >
                انصراف و ادامه کار در برنامه
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
