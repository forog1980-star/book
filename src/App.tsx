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
  FileSpreadsheet,
  ArrowRight,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Library
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
  normalizePersianText,
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
import { ModalWindow } from './components/ModalWindow';
import { GlobalConfirmModal } from './components/GlobalConfirmModal';
import { requestActionConfirmation } from './utils/confirmDialogService';
import {
  GlobalExcelExportConfigModal,
  openStandardExcelExportModal,
  buildEmergencyZeroToHundredTables,
  generateEmergencyZeroToHundredExcel
} from './modules/excel-export';
import {
  closeTopModalIfAny,
  popInnerBackStepIfAny,
  clearMartyrsCrossTabTarget,
  getMartyrsCrossTabTarget,
  setMartyrsCrossTabTarget
} from './utils/navigationHistory';
import { useOnlineStatus } from './utils/usePWAInstall';
import {
  hydrateOperationalKey,
  OPERATIONAL_STORAGE_KEYS,
  saveOperationalData,
  saveOperationalDataBatchAtomic
} from './utils/indexedDbStorage';
import {
   generateUniqueLinkId,
  generateUniqueLogId,
  generateUniqueMartyrId,
  generateUniqueSuggestionId
} from './utils/idGenerator';
import {
  createFullSystemBackupEnvelope,
  FullOperationalState,
  RejectedSuggestionRecord
} from './utils/backupService';
import {
  buildSorehMehrExtractedItems,
  enrichLinksWithSorehMehrResearch
} from './data/soorehMehrResearch';
import {
  enrichLinksAndCatalogBooksWith28kTehranIndex,
  extractExplicitMartyrsFromBookNotesAndList,
  getAllUnifiedBooks,
  getCachedGolzarMartyrsSync,
  loadCachedGolzarMartyrs,
  matchSingleBookAgainstMartyrs,
  stripPublisherAndAutoNotesForMartyrMatch,
  subscribeToGolzarMartyrsLoaded
} from './utils/martyrsCrossMatchEngine';
import {
  APPLIED_PACKAGES_KEY,
  applyCommittedSyncMetadataToCache,
  BASELINE_CHANGE_MAP_KEY,
  DeviceSyncPanel,
  hydrateSyncMetadataFromStorage,
  markRecordSoftDeleted,
  OperationalSyncDataset,
  RECORD_META_MAP_KEY,
  SyncMetadataSnapshot
} from './modules/device-sync';
import { getLastGitHubSyncTimeFa, performManualGitHubSync } from './utils/githubSyncService';
import {
  ExecutiveDashboardView,
  StatisticsAndReportsRouteView,
  DEFAULT_EXECUTIVE_DASHBOARD_STATE,
  DRILLDOWN_META_MAP,
  buildExecutiveDashboardInputs,
  classifyPendingReviewStatus,
  pickHigherPriorityPendingStatus,
  type DashboardBookListItem,
  type DashboardDrilldownKey,
  type DashboardMartyrListItem,
  type ExecutiveDashboardReadiness,
  type ExecutiveDashboardViewState
} from './modules/executive-dashboard';

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
const LINKS_STORAGE_KEY = 'book_martyr_links_v1';
const PENDING_REVIEWS_STORAGE_KEY = 'book_pending_reviews_v1';
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

export type MainMenuTab =
  | 'home'
  | 'library'
  | 'martyrs'
  | 'smart_search'
  | 'research'
  | 'management'
  | 'executive_dashboard'
  | 'executive_statistics';

const ExecutiveDashboardNavIcon: React.FC<{ active?: boolean }> = ({ active = false }) => {
  return (
    <Library
      className="w-6 h-6 sm:w-7 sm:h-7 shrink-0 transition-transform duration-200"
      strokeWidth={active ? 2.2 : 1.9}
      aria-hidden="true"
    />
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState<MainMenuTab>('home');
  const [librarySubView, setLibrarySubView] = useState<'catalog' | 'shelves'>('catalog');
  const [showPilotSubView, setShowPilotSubView] = useState(false);
  const [preselectedSmartMartyrName, setPreselectedSmartMartyrName] = useState<string>('');
  const [homeGlobalQuery, setHomeGlobalQuery] = useState<string>('');
  const [libraryInitialSearchQuery, setLibraryInitialSearchQuery] = useState<string>('');
  const [executiveDashboardState, setExecutiveDashboardState] =
    useState<ExecutiveDashboardViewState>(DEFAULT_EXECUTIVE_DASHBOARD_STATE);
  const [libraryDirectBookTarget, setLibraryDirectBookTarget] = useState<{
    rowKey?: string;
    tempBookId?: string;
    nonce: number;
  } | null>(null);
  const [libraryReturnToDashboardDossier, setLibraryReturnToDashboardDossier] =
    useState<boolean>(false);
  const [dashboardReturnLabel, setDashboardReturnLabel] = useState<string>('');
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);
  const [showComprehensiveDocModal, setShowComprehensiveDocModal] = useState<boolean>(false);
  const [isSyncingGitHub, setIsSyncingGitHub] = useState<boolean>(false);
  const [showControlMenu, setShowControlMenu] = useState<boolean>(false);
  const [lastGitHubSyncFa, setLastGitHubSyncFa] = useState<string>(() => getLastGitHubSyncTimeFa());

  // پشته تاریخچه مراحل برای بازگشت دو مرحله‌ای (اول بازگشت به مرحله قبل، سپس با دو بار کلیک خروج از برنامه)
  const navHistoryRef = React.useRef<
    Array<{
      tab: MainMenuTab;
      librarySubView: 'catalog' | 'shelves';
      showPilotSubView: boolean;
    }>
  >([]);
  const isPoppingHistoryRef = React.useRef<boolean>(false);
  const prevNavSnapRef = React.useRef<{
    tab: MainMenuTab;
    librarySubView: 'catalog' | 'shelves';
    showPilotSubView: boolean;
  }>({
    tab: 'home',
    librarySubView: 'catalog',
    showPilotSubView: false
  });
  const doubleBackExitArmedRef = React.useRef<boolean>(false);
  const doubleBackTimerRef = React.useRef<number | null>(null);
  const isAllowingExitRef = React.useRef<boolean>(false);

  // ثبت خودکار تغییرات تب و زیربخش در پشته بازگشت
  useEffect(() => {
    const prev = prevNavSnapRef.current;
    const changed =
      prev.tab !== activeTab ||
      prev.librarySubView !== librarySubView ||
      prev.showPilotSubView !== showPilotSubView;

    if (!changed) return;

    // هر زمان کاربر جابه‌جا شد، شمارنده دو بار کلیک خروج ریست شود
    doubleBackExitArmedRef.current = false;
    if (doubleBackTimerRef.current) {
      window.clearTimeout(doubleBackTimerRef.current);
      doubleBackTimerRef.current = null;
    }

    if (!isPoppingHistoryRef.current) {
      navHistoryRef.current.push({ ...prev });
      if (navHistoryRef.current.length > 30) {
        navHistoryRef.current.shift();
      }
    } else {
      isPoppingHistoryRef.current = false;
    }

    prevNavSnapRef.current = {
      tab: activeTab,
      librarySubView,
      showPilotSubView
    };
  }, [activeTab, librarySubView, showPilotSubView]);

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

  const [golzarIndexVersion, setGolzarIndexVersion] = useState<number>(0);
  const [golzarLoadState, setGolzarLoadState] = useState<'idle' | 'loading' | 'loaded' | 'error'>(
    () => (getCachedGolzarMartyrsSync().length > 0 ? 'loaded' : 'idle')
  );

  const requestLoadGolzarBank = React.useCallback(async () => {
    if (getCachedGolzarMartyrsSync().length > 0) {
      setGolzarLoadState('loaded');
      return;
    }
    setGolzarLoadState('loading');
    const list = await loadCachedGolzarMartyrs();
    if (list.length > 0 || getCachedGolzarMartyrsSync().length > 0) {
      setGolzarLoadState('loaded');
    } else {
      setGolzarLoadState('error');
    }
  }, []);

  // بارگذاری پس‌زمینه بانک شهدای گلزار و بارگذاری فوری هنگام ورود به داشبورد مدیریتی
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void requestLoadGolzarBank();
    }, 1200);
    const unsub = subscribeToGolzarMartyrsLoaded(() => {
      setGolzarIndexVersion((v) => v + 1);
      if (getCachedGolzarMartyrsSync().length > 0) {
        setGolzarLoadState('loaded');
      }
    });
    return () => {
      window.clearTimeout(timer);
      unsub();
    };
  }, [requestLoadGolzarBank]);

  useEffect(() => {
    if (
      (activeTab === 'executive_dashboard' || activeTab === 'executive_statistics') &&
      golzarLoadState === 'idle'
    ) {
      void requestLoadGolzarBank();
    }
  }, [activeTab, golzarLoadState, requestLoadGolzarBank]);

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
  const [links, setLinks] = useState<BookMartyrLinkRecord[]>(() => {
    try {
      const raw = localStorage.getItem(LINKS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : INITIAL_BOOK_MARTYR_LINKS;
    } catch {
      return INITIAL_BOOK_MARTYR_LINKS;
    }
  });
  const [pendingReviews, setPendingReviews] = useState<PendingReviewItem[]>(() => {
    try {
      const raw = localStorage.getItem(PENDING_REVIEWS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [workbookMartyrs, setWorkbookMartyrs] = useState<WorkbookGolzarMartyr[]>([]);

  const [workbookLoadState, setWorkbookLoadState] = useState<'loading' | 'loaded' | 'error'>(
    'loading'
  );
  const [workbookLoadError, setWorkbookLoadError] = useState<string | null>(null);

  // Auto-load all 5 sheets of /data/library_books.json on startup
  const loadFullWorkbookJson = React.useCallback(async () => {
    setWorkbookLoadState('loading');
    setWorkbookLoadError(null);
    try {
      const res = await fetch('./data/library_books.json');
      if (!res.ok) {
        setWorkbookLoadError(`خطا در دریافت داده‌های پایه کتابخانه (کد ${res.status}).`);
        setWorkbookLoadState('error');
        return;
      }
      const rawParsed = await res.json();
      const parsed = Array.isArray(rawParsed)
        ? rawParsed[0]?.sheets
          ? rawParsed[0]
          : rawParsed
        : rawParsed;
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
            const enrichedRows = enrichLinksWithSorehMehrResearch(lRows);
            setLinks((prev) => {
              let merged = mergeLinksPreservingApprovals(enrichedRows, prev);
              const localLinksRaw = localStorage.getItem(LINKS_STORAGE_KEY);
              if (localLinksRaw) {
                try {
                  const parsedLocal = JSON.parse(localLinksRaw);
                  if (Array.isArray(parsedLocal) && parsedLocal.length > 0) {
                    merged = mergeLinksPreservingApprovals(merged, parsedLocal);
                  }
                } catch {
                  // ignore
                }
              }
              return merged;
            });
            setExtractedItems((prev) => buildSorehMehrExtractedItems(enrichedRows, prev));
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
            setPendingReviews((prev) => {
              const baseMap = new Map<string, PendingReviewItem>();
              for (const item of pRows) baseMap.set(item.trackingId, item);
              const applyLocal = (list: PendingReviewItem[]) => {
                for (const loc of list) {
                  if (!loc?.trackingId) continue;
                  const existing = baseMap.get(loc.trackingId);
                  if (existing) {
                    baseMap.set(loc.trackingId, {
                      ...existing,
                      ...loc,
                      trackingStatus: pickHigherPriorityPendingStatus(
                        existing.trackingStatus,
                        loc.trackingStatus
                      )
                    });
                  } else {
                    baseMap.set(loc.trackingId, loc);
                  }
                }
              };
              if (Array.isArray(prev) && prev.length > 0) applyLocal(prev);
              const localPvRaw = localStorage.getItem(PENDING_REVIEWS_STORAGE_KEY);
              if (localPvRaw) {
                try {
                  const parsedLocal = JSON.parse(localPvRaw);
                  if (Array.isArray(parsedLocal) && parsedLocal.length > 0) {
                    applyLocal(parsedLocal);
                  }
                } catch {
                  // ignore
                }
              }
              return Array.from(baseMap.values());
            });
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
        setWorkbookLoadState('loaded');
      } else {
        setWorkbookLoadError('ساختار فایل داده‌های کتابخانه معتبر نیست.');
        setWorkbookLoadState('error');
      }
    } catch (err) {
      setWorkbookLoadError(
        err instanceof Error && err.message
          ? err.message
          : 'خطا در برقراری ارتباط برای دریافت داده‌های کتابخانه.'
      );
      setWorkbookLoadState('error');
    }
  }, []);

  useEffect(() => {
    void loadFullWorkbookJson();
  }, [loadFullWorkbookJson]);

  // توابع پاک‌سازی خودکار رکوردهای ذخیره‌شده از تداخل نام ناشر (مانند «انتشارات ابراهیم هادی») و حفظ قطعی تأیید کارشناس
  const sanitizeAuditRecordsMap = (
    rawMap: Record<string, FieldAuditRecord>
  ): Record<string, FieldAuditRecord> => {
    if (!rawMap || typeof rawMap !== 'object') return {};
    const cleaned: Record<string, FieldAuditRecord> = {};
    for (const [k, rec] of Object.entries(rawMap)) {
      if (!rec) continue;
      const cleanedNotes = (rec.notes || '')
        .replace(/\s*\|\s*⚠️\s*نیازمند بررسی:?\s*تشابه نام با[^|]*/g, '')
        .replace(/⚠️\s*نیازمند بررسی:?\s*تشابه نام با[^|]*/g, '')
        .trim();
      const hadAutoSimilarityNote = (rec.notes || '').includes('تشابه نام با');
      const isExpertVerified = rec.physical === 'verified' && rec.copyStatus !== 'pending_review';
      cleaned[k] = {
        ...rec,
        notes: cleanedNotes,
        needsReview: isExpertVerified ? false : hadAutoSimilarityNote ? false : Boolean(rec.needsReview)
      };
    }
    return cleaned;
  };

  const sanitizeSmartSuggestionsList = (
    list: SmartSearchSuggestion[]
  ): SmartSearchSuggestion[] => {
    if (!Array.isArray(list)) return [];
    return list.filter((s) => {
      if (!s || ['SS-0001', 'SS-0002', 'SS-0003', 'SS-0004', 'SS-0005', 'SS-0006', 'SS-0007'].includes(s.id)) {
        return false;
      }
      // اگر پیشنهاد در صف بررسی است اما نام شهید با نام ناشر یکی است (مثل ابراهیم هادی) و در عنوان یا توضیح واقعی کتاب نیامده، حذف شود
      if (s.reviewStatus === 'در صف بررسی کارشناس') {
        const mNorm = normalizePersianText((s.martyrName || '').replace(/^شهید\s+/, ''));
        const pubNorm = normalizePersianText(s.publisher || '');
        if (mNorm && pubNorm && pubNorm.includes(mNorm)) {
          const cleanBookText = stripPublisherAndAutoNotesForMartyrMatch(
            `${s.bookTitle || ''} ${s.publisherDescription || ''}`,
            s.publisher
          );
          if (!` ${cleanBookText} `.includes(` ${mNorm} `)) {
            return false;
          }
        }
      }
      return true;
    });
  };

  const isApprovedLinkStatus = (st?: string): boolean => {
    if (!st) return false;
    return (
      st === 'تأییدشده کارشناسی' ||
      st === 'قطعی' ||
      st === 'تأیید' ||
      st === 'بررسی‌شده در پژوهش اصلی'
    );
  };

  const mergeLinksPreservingApprovals = (
    baseLinks: BookMartyrLinkRecord[],
    incomingLinks: BookMartyrLinkRecord[]
  ): BookMartyrLinkRecord[] => {
    const byId = new Map<string, BookMartyrLinkRecord>();
    for (const item of baseLinks) {
      if (!item?.id || /^LNK-00[1-5]$/.test(item.id)) continue;
      byId.set(item.id, item);
    }
    for (const localItem of incomingLinks) {
      if (!localItem?.id || /^LNK-00[1-5]$/.test(localItem.id)) continue;
      const base = byId.get(localItem.id);
      if (base) {
        const keepApprovedStatus = isApprovedLinkStatus(localItem.reviewStatus)
          ? localItem.reviewStatus
          : isApprovedLinkStatus(base.reviewStatus) &&
            (localItem.reviewStatus === 'بررسی‌نشده' || localItem.reviewStatus?.includes('نیازمند'))
          ? base.reviewStatus
          : localItem.reviewStatus && localItem.reviewStatus !== 'بررسی‌نشده'
          ? localItem.reviewStatus
          : base.reviewStatus;

        byId.set(localItem.id, {
          ...base,
          ...localItem,
          tempBookId: base.tempBookId || localItem.tempBookId,
          alternativeTitle: base.alternativeTitle || localItem.alternativeTitle,
          reviewStatus: keepApprovedStatus,
          reviewerNote: localItem.reviewerNote || base.reviewerNote
        });
      } else {
        byId.set(localItem.id, localItem);
      }
    }
    return Array.from(byId.values());
  };

  // Persistent States (localStorage + IndexedDB Dual Persistence - پایگاه داده book)
  const [auditRecords, setAuditRecords] = useState<Record<string, FieldAuditRecord>>(() => {
    try {
      const raw = localStorage.getItem(AUDIT_STORAGE_KEY) || localStorage.getItem(LEGACY_AUDIT_KEY);
      return raw ? sanitizeAuditRecordsMap(JSON.parse(raw) || {}) : {};
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
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return sanitizeSmartSuggestionsList(parsed);
    } catch {
      return [];
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

  const [rejectedSuggestionsArchive, setRejectedSuggestionsArchive] = useState<
    RejectedSuggestionRecord[]
  >(() => {
    try {
      const raw = localStorage.getItem(OPERATIONAL_STORAGE_KEYS.rejectedSuggestions);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // 5 User Roles (مدیر سامانه، ثبت‌کننده کتاب، پژوهشگر، بازبین اطلاعات، مسئول تأیید و انتشار)
  // توجه: این نقش‌ها صرفاً جهت ثبت نام نقش در تاریخچه گردش کار است و احراز هویت امنیتی محسوب نمی‌شود.
  const [activeUserRole, setActiveUserRole] = useState<UserRoleCode>(() => {
    try {
      const raw = localStorage.getItem(USER_ROLE_STORAGE_KEY) as UserRoleCode | null;
      return USER_ROLES.some((r) => r.code === raw) ? (raw as UserRoleCode) : 'registrar';
    } catch {
      return 'registrar';
    }
  });

  // وضعیت‌های رهگیری نشست کاری، سلامت ذخیره‌ساز و حفاظت قبل از خروج (پایگاه داده book)
  const [sessionEditsCount, setSessionEditsCount] = useState<number>(0);
  const [lastSavedTime, setLastSavedTime] = useState<string>('');
  const [storageStatus, setStorageStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [storageErrorMsg, setStorageErrorMsg] = useState<string>('');
  const [isStorageHydrated, setIsStorageHydrated] = useState<boolean>(false);
  const [showDeviceSyncDrawer, setShowDeviceSyncDrawer] = useState<boolean>(false);
  const [showExitConfirmModal, setShowExitConfirmModal] = useState<boolean>(false);
  const isExitingRef = React.useRef<boolean>(false);

  const markSessionModification = () => {
    setSessionEditsCount((prev) => prev + 1);
    const nowFaTime = new Intl.DateTimeFormat('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date());
    setLastSavedTime(nowFaTime);
  };

  const handleCompleteExitFromApp = () => {
    isExitingRef.current = true;
    setSessionEditsCount(0);
    setShowExitConfirmModal(false);
    try {
      window.onbeforeunload = null;
      window.close();
    } catch {
      // ignore
    }
    setTimeout(() => {
      window.location.replace('about:blank');
    }, 60);
  };

  // ممانعت از خروج ناخواسته مرورگر فقط در صورت بسته شدن تصادفی تب
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isExitingRef.current) return;
      if (storageStatus === 'error') {
        e.preventDefault();
        e.returnValue =
          'خطا در ذخیره‌سازی محلی؛ لطفاً پیش از بستن کامل مرورگر بررسی نمایید.';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [storageStatus]);

  // بازیابی کامل و زمان‌بندی‌شده هر ۱۰ مجموعه داده عملیاتی از IndexedDB در شروع برنامه (بند ۴ و ۵ دستور جامع)
  useEffect(() => {
    let cancelled = false;
    async function hydrateAllFromIdb() {
      try {
        const [
          hydAudit,
          hydCopies,
          hydMartyrs,
          hydSmart,
          hydGroups,
          hydExtracted,
          hydLinks,
          hydPending,
          hydLog,
          hydRejected
        ] = await Promise.all([
          hydrateOperationalKey<Record<string, FieldAuditRecord>>(AUDIT_STORAGE_KEY, auditRecords),
          hydrateOperationalKey<BookCopyRecord[]>(COPIES_STORAGE_KEY, bookCopies),
          hydrateOperationalKey<CustomMartyrRecord[]>(CUSTOM_MARTYRS_STORAGE_KEY, customMartyrs),
          hydrateOperationalKey<SmartSearchSuggestion[]>(
            SMART_SUGGESTIONS_STORAGE_KEY,
            smartSuggestions
          ),
          hydrateOperationalKey<MultiMartyrGroupAudit[]>(GROUPS_STORAGE_KEY, multiMartyrGroups),
          hydrateOperationalKey<ExtractedContentItem[]>(EXTRACTED_STORAGE_KEY, extractedItems),
          hydrateOperationalKey<BookMartyrLinkRecord[]>(LINKS_STORAGE_KEY, links),
          hydrateOperationalKey<PendingReviewItem[]>(PENDING_REVIEWS_STORAGE_KEY, pendingReviews),
          hydrateOperationalKey<AuditLogEntry[]>(AUDIT_LOG_STORAGE_KEY, auditLog),
          hydrateOperationalKey<RejectedSuggestionRecord[]>(
            OPERATIONAL_STORAGE_KEYS.rejectedSuggestions,
            rejectedSuggestionsArchive
          ),
          hydrateSyncMetadataFromStorage()
        ]);

        if (cancelled) return;

        const resolvedAudit = sanitizeAuditRecordsMap(
          hydAudit.source === 'indexedDB' ? hydAudit.value : auditRecords
        );
        const resolvedCopies = hydCopies.source === 'indexedDB' ? hydCopies.value : bookCopies;
        const resolvedMartyrs = hydMartyrs.source === 'indexedDB' ? hydMartyrs.value : customMartyrs;
        const resolvedSmart = sanitizeSmartSuggestionsList(
          hydSmart.source === 'indexedDB' ? hydSmart.value : smartSuggestions
        );
        const resolvedGroups = hydGroups.source === 'indexedDB' ? hydGroups.value : multiMartyrGroups;
        const resolvedLinks = enrichLinksWithSorehMehrResearch(
          hydLinks.source === 'indexedDB' ? hydLinks.value : links
        );
        const resolvedExtracted = buildSorehMehrExtractedItems(
          resolvedLinks,
          hydExtracted.source === 'indexedDB' ? hydExtracted.value : extractedItems
        );
        const resolvedPending = hydPending.source === 'indexedDB' ? hydPending.value : pendingReviews;
        const resolvedLog = hydLog.source === 'indexedDB' ? hydLog.value : auditLog;
        const resolvedRejected =
          hydRejected.source === 'indexedDB' ? hydRejected.value : rejectedSuggestionsArchive;

        if (hydAudit.source === 'indexedDB') setAuditRecords(resolvedAudit);
        if (hydCopies.source === 'indexedDB') setBookCopies(resolvedCopies);
        if (hydMartyrs.source === 'indexedDB') setCustomMartyrs(resolvedMartyrs);
        if (hydSmart.source === 'indexedDB') setSmartSuggestions(resolvedSmart);
        if (hydGroups.source === 'indexedDB') setMultiMartyrGroups(resolvedGroups);
        if (hydExtracted.source === 'indexedDB') setExtractedItems(resolvedExtracted);
        if (hydLinks.source === 'indexedDB') {
          setLinks((prev) => mergeLinksPreservingApprovals(prev, resolvedLinks));
        }
        if (hydPending.source === 'indexedDB') {
          setPendingReviews((prev) => {
            if (!Array.isArray(prev) || prev.length === 0) return resolvedPending;
            const byId = new Map<string, PendingReviewItem>();
            for (const p of prev) byId.set(p.trackingId, p);
            for (const inc of resolvedPending) {
              const ex = byId.get(inc.trackingId);
              if (ex) {
                byId.set(inc.trackingId, {
                  ...ex,
                  ...inc,
                  trackingStatus: pickHigherPriorityPendingStatus(
                    ex.trackingStatus,
                    inc.trackingStatus
                  )
                });
              } else {
                byId.set(inc.trackingId, inc);
              }
            }
            return Array.from(byId.values());
          });
        }
        if (hydLog.source === 'indexedDB') setAuditLog(resolvedLog);
        if (hydRejected.source === 'indexedDB') setRejectedSuggestionsArchive(resolvedRejected);
      } finally {
        if (!cancelled) {
          setIsStorageHydrated(true);
        }
      }
    }
    hydrateAllFromIdb();
    return () => {
      cancelled = true;
    };
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
        id: generateUniqueLogId(prev),
        timestamp: nowFa,
        actorName: getRoleDisplayName(activeUserRole),
        actorRole: activeUserRole,
        actionType,
        targetId,
        summary
      },
      ...prev.slice(0, 299)
    ]);
  };

  const hydratedBaselineRefs = React.useRef<Record<string, unknown>>({});

  const persistWithStatus = async <T,>(key: string, value: T) => {
    if (!isStorageHydrated) return;
    if (!(key in hydratedBaselineRefs.current)) {
      hydratedBaselineRefs.current[key] = value;
      try {
        if (localStorage.getItem(key) !== null) {
          return;
        }
      } catch {
        return;
      }
    } else if (hydratedBaselineRefs.current[key] === value) {
      return;
    }
    hydratedBaselineRefs.current[key] = value;
    setStorageStatus('saving');
    const res = await saveOperationalData(key, value);
    if (!res.ok) {
      setStorageStatus('error');
      setStorageErrorMsg(res.error || 'خطا در ذخیره‌سازی محلی');
      showNotify(
        res.error || 'ذخیره در حافظه مرورگر با خطا مواجه شد؛ فوراً پشتیبان کامل JSON بگیرید.',
        'warning'
      );
    } else {
      setStorageStatus('saved');
      setStorageErrorMsg('');
    }
  };

  // Sync to localStorage & IndexedDB (فقط پس از تکمیل Hydration اولیه)
  useEffect(() => {
    void persistWithStatus(AUDIT_STORAGE_KEY, auditRecords);
  }, [auditRecords, isStorageHydrated]);

  useEffect(() => {
    void persistWithStatus(COPIES_STORAGE_KEY, bookCopies);
  }, [bookCopies, isStorageHydrated]);

  useEffect(() => {
    void persistWithStatus(CUSTOM_MARTYRS_STORAGE_KEY, customMartyrs);
  }, [customMartyrs, isStorageHydrated]);

  useEffect(() => {
    void persistWithStatus(SMART_SUGGESTIONS_STORAGE_KEY, smartSuggestions);
  }, [smartSuggestions, isStorageHydrated]);

  useEffect(() => {
    void persistWithStatus(GROUPS_STORAGE_KEY, multiMartyrGroups);
  }, [multiMartyrGroups, isStorageHydrated]);

  useEffect(() => {
    void persistWithStatus(EXTRACTED_STORAGE_KEY, extractedItems);
  }, [extractedItems, isStorageHydrated]);

  useEffect(() => {
    void persistWithStatus(LINKS_STORAGE_KEY, links);
  }, [links, isStorageHydrated]);

  useEffect(() => {
    void persistWithStatus(PENDING_REVIEWS_STORAGE_KEY, pendingReviews);
  }, [pendingReviews, isStorageHydrated]);

  useEffect(() => {
    void persistWithStatus(AUDIT_LOG_STORAGE_KEY, auditLog);
  }, [auditLog, isStorageHydrated]);

  useEffect(() => {
    void persistWithStatus(OPERATIONAL_STORAGE_KEYS.rejectedSuggestions, rejectedSuggestionsArchive);
  }, [rejectedSuggestionsArchive, isStorageHydrated]);

  useEffect(() => {
    try {
      localStorage.setItem(USER_ROLE_STORAGE_KEY, activeUserRole);
    } catch {
      // ignore
    }
  }, [activeUserRole]);

  const handleApplyP2PSyncedDataset = async (
    nextDataset: OperationalSyncDataset,
    summaryMessage: string,
    syncMetadata?: SyncMetadataSnapshot
  ): Promise<{
    ok: boolean;
    idbSaved?: boolean;
    localSaved?: boolean;
    metadataSavedInBatch?: boolean;
    error?: string;
  }> => {
    const enrichedNextLinks = enrichLinksWithSorehMehrResearch(nextDataset.links);
    const nextExtracted = buildSorehMehrExtractedItems(enrichedNextLinks, extractedItems);

    const batchEntries: Array<{ key: string; value: unknown }> = [
      { key: AUDIT_STORAGE_KEY, value: nextDataset.auditRecords },
      { key: COPIES_STORAGE_KEY, value: nextDataset.bookCopies },
      { key: CUSTOM_MARTYRS_STORAGE_KEY, value: nextDataset.customMartyrs },
      { key: LINKS_STORAGE_KEY, value: enrichedNextLinks },
      { key: PENDING_REVIEWS_STORAGE_KEY, value: nextDataset.pendingReviews },
      { key: EXTRACTED_STORAGE_KEY, value: nextExtracted }
    ];

    if (syncMetadata) {
      batchEntries.push(
        { key: RECORD_META_MAP_KEY, value: syncMetadata.recordMetaMap },
        { key: BASELINE_CHANGE_MAP_KEY, value: syncMetadata.baselineChangeMap },
        { key: APPLIED_PACKAGES_KEY, value: syncMetadata.appliedPackageIds }
      );
    }

    setStorageStatus('saving');
    const batchRes = await saveOperationalDataBatchAtomic(batchEntries);

    if (!batchRes.ok || !batchRes.idbSaved) {
      const errText =
        batchRes.error ||
        'خطا در ذخیره‌سازی پایدار و هماهنگ اطلاعات و متادیتای همگام‌سازی در حافظه IndexedDB دستگاه مقصد.';
      setStorageStatus('error');
      setStorageErrorMsg(errText);
      showNotify(errText, 'warning');
      return {
        ok: false,
        idbSaved: batchRes.idbSaved,
        localSaved: batchRes.localSaved,
        metadataSavedInBatch: false,
        error: errText
      };
    }

    if (syncMetadata) {
      applyCommittedSyncMetadataToCache(syncMetadata, batchRes.updatedAt);
    }

    setStorageStatus('saved');
    setStorageErrorMsg('');
    setAuditRecords(nextDataset.auditRecords);
    setBookCopies(nextDataset.bookCopies);
    setCustomMartyrs(nextDataset.customMartyrs);
    setLinks(enrichedNextLinks);
    setExtractedItems(nextExtracted);
    setPendingReviews(nextDataset.pendingReviews);
    markSessionModification();
    appendAuditLog('تغییر وضعیت پیگیری', 'WEBRTC-P2P-SYNC', summaryMessage);
    showNotify(summaryMessage);
    return {
      ok: true,
      idbSaved: batchRes.idbSaved,
      localSaved: batchRes.localSaved,
      metadataSavedInBatch: Boolean(syncMetadata)
    };
  };

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

  // نمایه یکپارچه ارتباط کتاب و شهید شامل ۸۳۶ پیوند پایه + نمایه‌سازی خودکار ۹۸۰ کتاب کاتالوگ و ثبت‌های جدید در برابر ۲۸٬۳۶۸ شهید گلزار تهران
  const indexedLinks = React.useMemo(
    () =>
      enrichLinksAndCatalogBooksWith28kTehranIndex({
        catalogRows,
        auditRecords,
        links
      }),
    [catalogRows, auditRecords, links, golzarIndexVersion]
  );

  // ورودی زنده داشبورد مدیریتی از State عملیاتی اصلی (بدون مصرف پیوندهای خودکار RL-28K)
  const executiveDashboardInputs = React.useMemo(
    () =>
      activeTab === 'executive_dashboard' || activeTab === 'executive_statistics'
        ? buildExecutiveDashboardInputs({
            catalogRows,
            auditRecords,
            bookCopies,
            links,
            pendingReviews,
            extractedItems,
            smartSuggestions,
            rejectedSuggestionsArchive,
            customMartyrs,
            golzarList: getCachedGolzarMartyrsSync(),
            golzarIndexVersion,
            auditLogs: auditLog
          })
        : null,
    [
      activeTab,
      catalogRows,
      auditRecords,
      bookCopies,
      links,
      pendingReviews,
      extractedItems,
      smartSuggestions,
      rejectedSuggestionsArchive,
      customMartyrs,
      golzarIndexVersion,
      auditLog
    ]
  );

  const executiveReadiness: ExecutiveDashboardReadiness = {
    isStorageHydrated,
    workbookLoadState,
    workbookLoadError,
    golzarLoadState,
    hasCachedOperationalData:
      Object.keys(auditRecords).length > 0 ||
      pendingReviews.length > 0 ||
      links.length > INITIAL_BOOK_MARTYR_LINKS.length ||
      customMartyrs.length > 0,
    onRetryLoadWorkbook: () => {
      void loadFullWorkbookJson();
    },
    onRetryLoadGolzar: () => {
      void requestLoadGolzarBank();
    }
  };

  const handleQuickExcelExport = () => {
    openStandardExcelExportModal({
      mode: 'books_list',
      reportTitle: 'بانک تجمیعی و یکپارچه کتاب‌ها و شهدای مرتبط (مرکز اسناد گلزار شهدای تهران)',
      fileNamePrefix: 'بانک_تجمیعی_کتابها_و_شهدای_مرتبط',
      catalogRows,
      auditRecords,
      bookCopies,
      links: indexedLinks,
      extractedItems,
      customMartyrs,
      workbookMartyrs,
      presetId: 'complete_report'
    });
    return true;
  };

  const fullOperationalState = React.useMemo<FullOperationalState>(
    () => ({
      auditRecords,
      bookCopies,
      customMartyrs,
      smartSuggestions,
      links,
      pendingReviews,
      multiMartyrGroups,
      extractedItems,
      auditLog,
      userSettings: {
        activeRole: activeUserRole
      },
      rejectedSuggestionsArchive
    }),
    [
      auditRecords,
      bookCopies,
      customMartyrs,
      smartSuggestions,
      links,
      pendingReviews,
      multiMartyrGroups,
      extractedItems,
      auditLog,
      activeUserRole,
      rejectedSuggestionsArchive
    ]
  );

  const deviceSyncDataset = React.useMemo<OperationalSyncDataset>(
    () => ({
      auditRecords,
      bookCopies,
      customMartyrs,
      links,
      pendingReviews
    }),
    [auditRecords, bookCopies, customMartyrs, links, pendingReviews]
  );

  const [hasOpenedDeviceSync, setHasOpenedDeviceSync] = useState(false);
  useEffect(() => {
    if (showDeviceSyncDrawer) {
      setHasOpenedDeviceSync(true);
    }
  }, [showDeviceSyncDrawer]);

  const getFullOperationalState = (): FullOperationalState => fullOperationalState;

  const handleFullJsonBackupDownload = () => {
    try {
      const envelope = createFullSystemBackupEnvelope(getFullOperationalState(), '3.5.0');
      const zeroToHundred = buildEmergencyZeroToHundredTables({
        catalogRows,
        auditRecords,
        bookCopies,
        links: indexedLinks,
        extractedItems,
        customMartyrs,
        workbookMartyrs
      });
      const fullPayload = {
        ...envelope,
        fullZeroToHundredSnapshot: {
          description:
            'خروجی کامل ۰ تا ۱۰۰ کل بانک اطلاعات نرم‌افزار (شامل تمام کتاب‌های کارشده و کارنشده، اسامی تمام شهدا، و جدول ارتباط متقابل شهدا و کتاب‌ها با تمام فیلدهای متصل)',
          counts: zeroToHundred.counts,
          sheet1_allBooks: zeroToHundred.booksRows,
          sheet2_allMartyrs: zeroToHundred.martyrsRows,
          sheet3_martyrBookRelations: zeroToHundred.relationsRows
        }
      };
      const blob = new Blob([JSON.stringify(fullPayload, null, 2)], {
        type: 'application/json;charset=utf-8'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      let dateStamp = new Date().toISOString().slice(0, 10);
      try {
        dateStamp = new Date().toLocaleDateString('fa-IR').replace(/\//g, '-');
      } catch {
        // fallback to ISO date
      }
      a.download = `خروجی_اضطراری_۰_تا_۱۰۰_کل_اطلاعات_مرکز_اسناد_${dateStamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showNotify(
        `خروجی کامل جیسون (JSON ۰ تا ۱۰۰ شامل ${toPersianDigits(
          zeroToHundred.counts.totalBooks
        )} کتاب، ${toPersianDigits(zeroToHundred.counts.totalMartyrs)} شهید و ${toPersianDigits(
          zeroToHundred.counts.totalBookMartyrRelations
        )} ارتباط + ۱۱ مجموعه عملیاتی قابل بازیابی) با موفقیت دانلود شد.`
      );
      return true;
    } catch {
      showNotify('خطا در تولید فایل پشتیبان کامل JSON.', 'warning');
      return false;
    }
  };

  const handleEmergencyZeroToHundredExcelDownload = () => {
    try {
      const res = generateEmergencyZeroToHundredExcel({
        catalogRows,
        auditRecords,
        bookCopies,
        links: indexedLinks,
        extractedItems,
        customMartyrs,
        workbookMartyrs
      });
      showNotify(
        `خروجی اکسل کامل ۰ تا ۱۰۰ در ۳ شیت مجزا (شیت ۱: ${toPersianDigits(
          res.counts.totalBooks
        )} کتاب کارشده و کارنشده | شیت ۲: ${toPersianDigits(
          res.counts.totalMartyrs
        )} شهید | شیت ۳: ${toPersianDigits(
          res.counts.totalBookMartyrRelations
        )} ارتباط کتاب و شهید) دانلود شد.`
      );
      return true;
    } catch {
      showNotify('خطا در تولید فایل اکسل کامل ۰ تا ۱۰۰.', 'warning');
      return false;
    }
  };

  const handleEmergencyZeroToHundredBothDownload = () => {
    const excelOk = handleEmergencyZeroToHundredExcelDownload();
    window.setTimeout(() => {
      handleFullJsonBackupDownload();
    }, 250);
    return excelOk;
  };

  const handleApplyRestoredState = (restored: FullOperationalState, summaryMessage: string) => {
    setAuditRecords(restored.auditRecords || {});
    setBookCopies(restored.bookCopies || []);
    setCustomMartyrs(restored.customMartyrs || []);
    setSmartSuggestions(restored.smartSuggestions || []);
    const enrichedRestoredLinks = enrichLinksWithSorehMehrResearch(restored.links || []);
    setLinks(enrichedRestoredLinks);
    setPendingReviews(restored.pendingReviews || []);
    setMultiMartyrGroups(restored.multiMartyrGroups || []);
    setExtractedItems(
      buildSorehMehrExtractedItems(enrichedRestoredLinks, restored.extractedItems || [])
    );
    setAuditLog(restored.auditLog || []);
    setRejectedSuggestionsArchive(restored.rejectedSuggestionsArchive || []);
    if (restored.userSettings?.activeRole) {
      setActiveUserRole(restored.userSettings.activeRole);
    }
    markSessionModification();
    appendAuditLog('تغییر وضعیت پیگیری', 'FULL-BACKUP-V3', `بازیابی پشتیبان: ${summaryMessage}`);
    showNotify(summaryMessage);
  };

  const handleSaveAuditRecord = (record: FieldAuditRecord) => {
    const prevAudit = auditRecords[record.key];
    const catRow = catalogRows.find(
      (r) => r.rowKey === record.key || (record.tempBookId && r.tempBookId === record.tempBookId)
    );
    const effectiveBookId = record.tempBookId || prevAudit?.tempBookId || catRow?.tempBookId || record.key;
    const effectiveTitle = (record.title || prevAudit?.title || catRow?.titleRaw || '').trim();

    let cleanedRecordNotes = (record.notes || '')
      .replace(/\s*\|\s*⚠️\s*نیازمند بررسی:?\s*تشابه نام با[^|]*/g, '')
      .replace(/⚠️\s*نیازمند بررسی:?\s*تشابه نام با[^|]*/g, '')
      .trim();

    const isExpertApprovedSave =
      Boolean(record.expertApproved) ||
      (record.physical === 'verified' && !record.needsReview && record.copyStatus !== 'pending_review');

    // محاسبه شهدای حذف‌شده یا جایگزین‌شده در صورتی که کاربر لیست relatedMartyrs را از فرم کتابخانه ارسال کرده باشد
    const explicitMartyrsPassed = Array.isArray(record.relatedMartyrs);
    const currentExplicitCompacts = new Set(
      (record.relatedMartyrs || [])
        .map((m) => normalizePersianText(m.replace(/^(شهیدان|شهید)\s+/g, '')).replace(/\s+/g, ''))
        .filter(Boolean)
    );

    const prevMartyrNamesOnBook = new Set<string>([
      ...(prevAudit?.relatedMartyrs || []),
      ...indexedLinks
        .filter((l) => l.tempBookId === effectiveBookId)
        .map((l) => l.martyrNameRaw)
        .filter(Boolean)
    ]);

    const nextExcludedSet = new Set<string>(
      (record.excludedMartyrs || prevAudit?.excludedMartyrs || []).filter((ex) => {
        const c = normalizePersianText(ex.replace(/^(شهیدان|شهید)\s+/g, '')).replace(/\s+/g, '');
        return c && !currentExplicitCompacts.has(c);
      })
    );

    if (explicitMartyrsPassed) {
      for (const prevM of prevMartyrNamesOnBook) {
        const cleanPrev = prevM.replace(/^(شهیدان|شهید)\s+/g, '').trim();
        const compPrev = normalizePersianText(cleanPrev).replace(/\s+/g, '');
        if (compPrev && !currentExplicitCompacts.has(compPrev)) {
          nextExcludedSet.add(cleanPrev);
          // اگر نام شهید حذف‌شده یا قدیمی در متن یادداشت هم بود، از یادداشت پاک یا اصلاح شود تا دوباره استخراج نشود
          if (cleanedRecordNotes && cleanPrev.length >= 3) {
            const escaped = cleanPrev.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            cleanedRecordNotes = cleanedRecordNotes
              .replace(new RegExp(`شهید\\s+مرتبط:\\s*${escaped}\\s*(?:[،,|]\\s*)?`, 'g'), '')
              .replace(new RegExp(`شهید\\s+${escaped}\\b`, 'g'), '')
              .replace(/\s*\|\s*\|\s*/g, ' | ')
              .replace(/^\s*\|\s*|\s*\|\s*$/g, '')
              .trim();
          }
        }
      }
    }

    const nextExcludedMartyrs = Array.from(nextExcludedSet);
    const effectiveRelatedInput = explicitMartyrsPassed
      ? record.relatedMartyrs
      : prevAudit?.relatedMartyrs;

    const extractedMartyrsFromRecord = extractExplicitMartyrsFromBookNotesAndList(
      cleanedRecordNotes,
      effectiveRelatedInput,
      record.publisher,
      nextExcludedMartyrs
    );

    // مقابله خودکار فقط برای کتاب‌های جدیدی که هنوز توسط کارشناس تأیید نشده‌اند (physical === 'review')
    // و فقط بر اساس عنوان کتاب و توضیحات کتاب (بدون نام ناشر و بدون یادداشت‌های سیستمی)
    const golzarList = getCachedGolzarMartyrsSync();
    const autoMatches = isExpertApprovedSave
      ? []
      : matchSingleBookAgainstMartyrs(
          {
            tempBookId: effectiveBookId,
            title: effectiveTitle,
            description: [record.descriptionRaw, cleanedRecordNotes].filter(Boolean).join(' | '),
            publisher: record.publisher,
            category: record.category,
            location: record.location
          },
          golzarList,
          customMartyrs,
          workbookMartyrs
        );

    const unverifiedMatches = autoMatches.filter((m) => {
      const normM = normalizePersianText(m.martyrName.replace(/^شهید\s+/, ''));
      const normB = normalizePersianText(effectiveTitle);
      const alreadyLinked = links.some(
        (l) =>
          normalizePersianText(l.martyrNameRaw.replace(/^شهید\s+/, '')).includes(normM) &&
          (l.tempBookId === effectiveBookId || normalizePersianText(l.bookTitleRaw).includes(normB))
      );
      if (alreadyLinked) return false;
      const alreadyInSuggestions = smartSuggestions.some(
        (s) =>
          normalizePersianText(s.martyrName.replace(/^شهید\s+/, '')).includes(normM) &&
          (s.matchedCatalogBookId === effectiveBookId || normalizePersianText(s.bookTitle).includes(normB))
      );
      if (alreadyInSuggestions) return false;
      const alreadyRejected = rejectedSuggestionsArchive.some(
        (r) =>
          normalizePersianText(r.martyrName.replace(/^شهید\s+/, '')).includes(normM) &&
          (r.bookId === effectiveBookId || normalizePersianText(r.bookTitle).includes(normB))
      );
      return !alreadyRejected;
    });

    const hasNewSimilarity = !isExpertApprovedSave && record.physical === 'review' && unverifiedMatches.length > 0;

    const withActor: FieldAuditRecord & { _updatedAt?: number } = {
      ...record,
      tempBookId: effectiveBookId,
      title: effectiveTitle,
      expertApproved: record.expertApproved ?? prevAudit?.expertApproved,
      relatedMartyrs: extractedMartyrsFromRecord,
      excludedMartyrs: nextExcludedMartyrs.length > 0 ? nextExcludedMartyrs : undefined,
      needsReview: isExpertApprovedSave ? false : Boolean(record.needsReview || hasNewSimilarity),
      notes: cleanedRecordNotes,
      checkedBy: getRoleDisplayName(activeUserRole),
      _updatedAt: Date.now()
    };
    setAuditRecords((prev) => ({
      ...prev,
      [record.key]: withActor
    }));

    // همگام‌سازی فوری عنوان کتاب در نسخه‌های فیزیکی (bookCopies)
    if (effectiveBookId && effectiveTitle) {
      setBookCopies((prev) =>
        prev.map((cp) =>
          cp.bookId === effectiveBookId && cp.bookTitle !== effectiveTitle
            ? { ...cp, bookTitle: effectiveTitle }
            : cp
        )
      );
    }

    // همگام‌سازی فوری پیوندهای کتاب و شهید (links): به‌روزرسانی عنوان کتاب و حذف/اصلاح شهدای تغییریافته در کتابخانه
    const excludedCompactsSet = new Set(
      nextExcludedMartyrs
        .map((m) => normalizePersianText(m.replace(/^(شهیدان|شهید)\s+/g, '')).replace(/\s+/g, ''))
        .filter(Boolean)
    );
    const activeCompactsMap = new Map<string, string>();
    for (const m of extractedMartyrsFromRecord) {
      const c = normalizePersianText(m.replace(/^(شهیدان|شهید)\s+/g, '')).replace(/\s+/g, '');
      if (c) activeCompactsMap.set(c, m);
    }

    setLinks((prev) => {
      const oldRawTitleNorm = normalizePersianText(catRow?.titleRaw || prevAudit?.title || '');
      const newTitleNorm = normalizePersianText(effectiveTitle);
      const isSameBookLink = (l: BookMartyrLinkRecord) =>
        (effectiveBookId && l.tempBookId === effectiveBookId) ||
        (oldRawTitleNorm && normalizePersianText(l.bookTitleRaw) === oldRawTitleNorm) ||
        (newTitleNorm && normalizePersianText(l.bookTitleRaw) === newTitleNorm);

      // بررسی آیا شهیدی در این کتاب تغییر نام داده است (مثلاً «سید علیرضا» به «سید علیرضا جزئی») تا اطلاعات مزار آن حفظ شود
      const existingBookLinks = prev.filter(isSameBookLink);
      const existingBookCompacts = new Set(
        existingBookLinks.map((l) =>
          normalizePersianText(l.martyrNameRaw.replace(/^(شهیدان|شهید)\s+/g, '')).replace(/\s+/g, '')
        )
      );
      const newlyAddedMartyrNames = extractedMartyrsFromRecord.filter((m) => {
        const c = normalizePersianText(m.replace(/^(شهیدان|شهید)\s+/g, '')).replace(/\s+/g, '');
        return c && !existingBookCompacts.has(c);
      });
      let renameReplacementIdx = 0;

      const nextLinks: BookMartyrLinkRecord[] = [];
      const seenMartyrOnThisBook = new Set<string>();

      for (const l of prev) {
        if (!isSameBookLink(l)) {
          nextLinks.push(l);
          continue;
        }
        const lComp = normalizePersianText(
          l.martyrNameRaw.replace(/^(شهیدان|شهید)\s+/g, '')
        ).replace(/\s+/g, '');

        // اگر این شهید در لیست حذف‌شده‌هاست یا در لیست صریح جدید نیست
        if (
          excludedCompactsSet.has(lComp) ||
          (explicitMartyrsPassed && !activeCompactsMap.has(lComp))
        ) {
          // اگر کاربر نام این شهید را در کتابخانه اصلاح کرده است (مثلاً سید علیرضا -> سید علیرضا جزئی)، همان لینک قبلی با حفظ اطلاعات مزار به نام جدید ارتقا یابد
          if (renameReplacementIdx < newlyAddedMartyrNames.length) {
            const replacementName = newlyAddedMartyrNames[renameReplacementIdx++];
            const repComp = normalizePersianText(
              replacementName.replace(/^(شهیدان|شهید)\s+/g, '')
            ).replace(/\s+/g, '');
            if (repComp && !seenMartyrOnThisBook.has(repComp)) {
              seenMartyrOnThisBook.add(repComp);
              nextLinks.push({
                ...l,
                tempBookId: effectiveBookId || l.tempBookId,
                bookTitleRaw: effectiveTitle || l.bookTitleRaw,
                martyrNameRaw: replacementName,
                rawNameInSource: `شهید ${replacementName}`
              });
            }
          }
          continue;
        }

        if (lComp && seenMartyrOnThisBook.has(lComp)) {
          continue;
        }
        if (lComp) seenMartyrOnThisBook.add(lComp);

        nextLinks.push({
          ...l,
          tempBookId: effectiveBookId || l.tempBookId,
          bookTitleRaw: effectiveTitle || l.bookTitleRaw
        });
      }

      return nextLinks;
    });

    // اگر کارشناس کتاب را تأیید نهایی کرده است، تمام موارد نیازمند بررسی مرتبط با این کتاب در صف جست‌وجو و پیوندها نیز تعیین‌تکلیف شوند
    if (isExpertApprovedSave) {
      const nowFa = new Intl.DateTimeFormat('fa-IR').format(new Date());
      const normBookTitle = normalizePersianText(record.title);

      setSmartSuggestions((prev) =>
        prev.map((s) => {
          if (
            s.reviewStatus === 'در صف بررسی کارشناس' &&
            (s.matchedCatalogBookId === record.tempBookId ||
              (normBookTitle && normalizePersianText(s.bookTitle) === normBookTitle))
          ) {
            return {
              ...s,
              reviewStatus: 'تأییدشده و افزوده‌شده به پرونده',
              reviewedBy: getRoleDisplayName(activeUserRole),
              reviewedAt: nowFa,
              reviewerNote: s.reviewerNote || 'تأیید نهایی کارشناس هنگام بازبینی کتاب'
            };
          }
          return s;
        })
      );

      setLinks((prev) =>
        prev.map((l) => {
          if (
            (l.tempBookId === record.tempBookId ||
              (normBookTitle && normalizePersianText(l.bookTitleRaw) === normBookTitle)) &&
            (l.reviewStatus.includes('نیازمند') || l.reviewStatus === 'بررسی‌نشده')
          ) {
            return {
              ...l,
              reviewStatus: 'تأییدشده کارشناسی',
              reviewerNote: l.reviewerNote
                ? `${l.reviewerNote} | تأیید کارشناس (${nowFa})`
                : `تأیید کارشناس (${nowFa})`
            };
          }
          return l;
        })
      );

      setPendingReviews((prev) =>
        prev.map((pv) => {
          if (
            classifyPendingReviewStatus(pv.trackingStatus) !== 'resolved' &&
            (pv.mainRecordId === record.tempBookId ||
              (normBookTitle && normalizePersianText(pv.bookTitle) === normBookTitle))
          ) {
            return {
              ...pv,
              trackingStatus: 'بررسی‌شده'
            };
          }
          return pv;
        })
      );
    } else if (hasNewSimilarity) {
      const nowFa = new Intl.DateTimeFormat('fa-IR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date());

      setSmartSuggestions((prev) => {
        const next = [...prev];
        const localTracker: { id: string }[] = [...next];
        const localMartyrTracker: { id: string }[] = [
          ...customMartyrs.map((cm) => ({ id: cm.martyrId })),
          ...next.map((s) => ({ id: s.martyrId }))
        ];

        for (const m of unverifiedMatches) {
          const normM = normalizePersianText(m.martyrName.replace(/^شهید\s+/, ''));
          const normB = normalizePersianText(record.title);
          const existsInSug = next.some(
            (s) =>
              normalizePersianText(s.martyrName.replace(/^شهید\s+/, '')).includes(normM) &&
              (s.matchedCatalogBookId === record.tempBookId ||
                normalizePersianText(s.bookTitle).includes(normB))
          );
          if (existsInSug) continue;

          const newId = generateUniqueSuggestionId(localTracker);
          localTracker.push({ id: newId });
          const mId = m.martyrId || generateUniqueMartyrId(localMartyrTracker);
          localMartyrTracker.push({ id: mId });

          next.unshift({
            id: newId,
            martyrId: mId,
            martyrName: m.martyrName,
            martyrAlternativeNames: [m.martyrName.replace(/^شهید\s+/, '')],
            bookTitle: record.title,
            authors: record.author || '—',
            publisher: record.publisher || '—',
            publishYear: record.year || '',
            editionInfo: `قفسه ${record.location || 'کتابخانه'}`,
            isbn: '—',
            fipa: '—',
            subjectCategory: record.category || SUBJECT_CATEGORIES[0].label,
            publisherDescription:
              record.descriptionRaw ||
              `کتاب ثبت‌شده در کتابخانه دارای تشابه با نام «${m.martyrName}»`,
            sourcePriority: 1,
            sourceName: 'مقابله خودکار دوطرفه کتابخانه و بانک ۲۸٬۳۶۸ شهید',
            sourceUrl: '',
            retrievedAt: nowFa,
            matchEvidence: m.evidenceText,
            catalogComparisonStatus:
              record.source === 'outside-list'
                ? 'کتاب جدید (خارج از فهرست فعلی کتابخانه)'
                : 'موجود در فهرست مرجع ۹۸۰ کتاب',
            matchedCatalogBookId: record.tempBookId,
            reviewStatus: 'در صف بررسی کارشناس',
            reviewerNote: 'تشخیص خودکار هنگام ثبت کتاب جدید — نیازمند بررسی کارشناس',
            reviewedBy: '',
            reviewedAt: ''
          });
        }
        return next;
      });
    }

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
    markSessionModification();
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
    if (migratedCount > 0) {
      markSessionModification();
    }
    return migratedCount;
  };

  const handleDeleteSingleRecord = (key: string) => {
    const targetRec = auditRecords[key];
    requestActionConfirmation({
      variant: 'danger',
      title: 'تأیید نهایی حذف رکورد کتاب از سامانه',
      message: targetRec
        ? `آیا از حذف کامل رکورد کتاب «${targetRec.title}» از فهرست و حافظه سامانه اطمینان دارید؟`
        : 'آیا از حذف کامل این رکورد ثبت‌شده از فهرست و حافظه سامانه اطمینان دارید؟',
      details: targetRec
        ? [
            `عنوان کتاب: ${targetRec.title}`,
            `شناسه کتاب: ${targetRec.tempBookId || key}`,
            `محل نگهداری: ${targetRec.location || 'ثبت‌نشده'} · دسته: ${targetRec.category || '—'}`
          ]
        : [`کلید رکورد: ${key}`],
      confirmLabel: 'بله، از لیست حذف شود',
      onConfirm: () => {
        if (targetRec) {
          markRecordSoftDeleted({
            meta: {
              recordId: key,
              collection: 'auditRecords',
              createdAtMs: Date.now(),
              updatedAtMs: Date.now(),
              revision: 1,
              changeId: `DEL_${key}_${Date.now()}`,
              lastModifiedByDevice: 'local',
              lastModifiedRole: 'phone-primary',
              softDeleted: true,
              deletedAtMs: Date.now()
            },
            titleSummary: `${targetRec.title} (${targetRec.location || '—'})`,
            data: targetRec
          });
        }
        setAuditRecords((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        markSessionModification();
        showNotify(
          targetRec
            ? `رکورد کتاب «${targetRec.title}» (${targetRec.tempBookId}) از حافظه سامانه حذف شد.`
            : 'رکورد انتخابی از حافظه مرورگر حذف شد.'
        );
      }
    });
  };

  const handleLoadSample20PilotRecords = () => {
    requestActionConfirmation({
      variant: 'confirm',
      title: 'تأیید ثبت آزمایشی ۲۰ رکورد پایلوت قفسه‌ها',
      message:
        'آیا مایلید ۲۰ رکورد نمونه پایلوت کتابخانه (منطبق با نقشه قفسه‌های SH-01 تا SH-04) بدون بازنویسی ثبت‌های قبلی در حافظه سامانه ثبت شود؟',
      details: ['تعداد رکورد: ۲۰ کتاب اول فهرست مرجع', 'نحوه اعمال: ادغام امن بدون حذف یا تغییر ثبت‌های قبلی'],
      confirmLabel: 'بله، ثبت نهایی ۲۰ رکورد پایلوت',
      onConfirm: () => {
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
      }
    });
  };

  const totalSavedCount = Object.keys(auditRecords).length;

  const TAB_HEADER_INFO: Record<
    Exclude<MainMenuTab, 'home'>,
    { title: string; description: string }
  > = {
    library: {
      title: 'کتابخانه و مدیریت نسخه‌های قفسه',
      description: ''
    },
    martyrs: {
      title: 'پرونده شهدا و بانک جامع مزارات گلزار شهدای تهران',
      description: ''
    },
    smart_search: {
      title: 'جست‌وجوی هوشمند کتاب‌ها و منابع مرتبط با شهدا',
      description: ''
    },
    research: {
      title: 'میز پژوهش، بررسی ارتباط کتاب و شهید و استخراج مطالب',
      description: ''
    },
    management: {
      title: 'پشتیبانی و گزارش‌ها',
      description: ''
    },
    executive_dashboard: {
      title: 'داشبورد مدیریتی مرکز اسناد',
      description: ''
    },
    executive_statistics: {
      title: 'آمار و گزارش‌های تفصیلی',
      description: ''
    }
  };

  // تابع بازگشت به مرحله قبل (هم برای دکمه Back گوشی و هم دکمه بازگشت روی صفحه)
  const handleStepBack = React.useCallback((): 'closed_modal' | 'stepped_back' | 'at_root' => {
    // ۱. اگر پنجره/مودالی باز است، ابتدا همان پنجره بسته شود
    if (closeTopModalIfAny()) {
      doubleBackExitArmedRef.current = false;
      return 'closed_modal';
    }

    // ۱.۵. اگر کشو یا مرحله داخلی در تب فعلی باز است، ابتدا به مرحله قبلی داخل همان تب برگردد
    if (popInnerBackStepIfAny()) {
      doubleBackExitArmedRef.current = false;
      return 'stepped_back';
    }

    // ۱.۸. اگر بخش اختصاصی ارتباط گوشی باز است، ابتدا بسته شود و به صفحه قبل برگردد
    if (showDeviceSyncDrawer) {
      setShowDeviceSyncDrawer(false);
      doubleBackExitArmedRef.current = false;
      return 'stepped_back';
    }

    // ۲. اگر در صفحه خانه عبارتی جست‌وجو شده است، ابتدا جست‌وجو پاک شود و به نمای اولیه خانه برگردد
    if (activeTab === 'home' && homeGlobalQuery.trim() !== '') {
      setHomeGlobalQuery('');
      doubleBackExitArmedRef.current = false;
      return 'stepped_back';
    }

    // ۳. اگر در پشته تاریخچه مرحله قبلی وجود دارد، یک مرحله به عقب برگردد
    if (navHistoryRef.current.length > 0) {
      const prevStep = navHistoryRef.current.pop()!;
      isPoppingHistoryRef.current = true;
      setActiveTab(prevStep.tab);
      setLibrarySubView(prevStep.librarySubView);
      setShowPilotSubView(prevStep.showPilotSubView);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      doubleBackExitArmedRef.current = false;
      return 'stepped_back';
    }

    // ۴. اگر در تب غیر از خانه هستیم ولی پشته خالی است، به تب خانه برگردد
    if (activeTab !== 'home') {
      isPoppingHistoryRef.current = true;
      setActiveTab('home');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      doubleBackExitArmedRef.current = false;
      return 'stepped_back';
    }

    return 'at_root';
  }, [activeTab, homeGlobalQuery, showDeviceSyncDrawer]);

  // مدیریت دکمه بازگشت (Back) گوشی و مرورگر به صورت دو مرحله‌ای:
  // مرحله ۱: برگشت به مرحله قبل (بستن پنجره باز یا بازگشت به صفحه/تب قبلی)
  // مرحله ۲: در صفحه اول، با بار اول هشدار می‌دهد و با بار دوم (دو بار کلیک) از برنامه خارج می‌شود
  useEffect(() => {
    try {
      window.history.pushState({ markazGuard: true }, '', window.location.href);
    } catch {
      // ignore
    }

    const onPopState = () => {
      if (isAllowingExitRef.current) {
        return;
      }

      const result = handleStepBack();

      if (result === 'closed_modal' || result === 'stepped_back') {
        try {
          window.history.pushState({ markazGuard: true }, '', window.location.href);
        } catch {
          // ignore
        }
        return;
      }

      // در صفحه اصلی (Root) هستیم: بررسی دو بار کلیک برای خروج
      if (doubleBackExitArmedRef.current) {
        // بار دوم کلیک دکمه بازگشت -> خروج از کل برنامه
        isAllowingExitRef.current = true;
        if (doubleBackTimerRef.current) {
          window.clearTimeout(doubleBackTimerRef.current);
          doubleBackTimerRef.current = null;
        }
        window.history.back();
        return;
      }

      // بار اول کلیک در صفحه اصلی -> عدم خروج و نمایش پیام راهنما برای کلیک دوم
      doubleBackExitArmedRef.current = true;
      setToast({
        message: 'برای خروج کامل از برنامه، یک بار دیگر دکمه بازگشت (Back) را بزنید.',
        type: 'warning'
      });

      if (doubleBackTimerRef.current) {
        window.clearTimeout(doubleBackTimerRef.current);
      }
      doubleBackTimerRef.current = window.setTimeout(() => {
        doubleBackExitArmedRef.current = false;
      }, 3200);

      try {
        window.history.pushState({ markazGuard: true }, '', window.location.href);
      } catch {
        // ignore
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [handleStepBack]);

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden flex flex-col bg-[#FDF8F2] text-[#332218] pb-24">
      {activeTab === 'home' ? (
        <>
          {/* هدر پهن صفحه خانه: آرم گلزار شهدای تهران در سمت راست + عنوان کامل سامانه با پهنای حداکثری */}
          <header className="sticky top-0 z-30 w-full max-w-full bg-[#8C3B2B] text-white px-2.5 sm:px-8 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-3 sm:py-4 shadow-xs border-b border-[#702D20]">
            <div className="max-w-6xl w-full mx-auto flex items-center gap-2.5 sm:gap-4">
              {/* آرم گلزار شهدای تهران در سمت راست هدر */}
              <div className="w-12 h-14 sm:w-16 sm:h-20 rounded-xl bg-[#FDF8F2] border-2 border-[#E6D5C1] shadow-xs flex items-center justify-center shrink-0 overflow-hidden p-1">
                <img
                  src="./golzar-logo.png"
                  alt="آرم گلزار شهدای تهران"
                  className="w-full h-full object-contain"
                />
              </div>

              {/* عنوان اصلی صفحه: کتابخانه */}
              <div className="w-full flex-1 min-w-0">
                <h1 className="w-full font-titr text-lg sm:text-2xl font-bold tracking-normal text-[#FDF8F2] leading-relaxed break-words">
                  کتابخانه
                </h1>
              </div>
            </div>
          </header>

          {/* نوار ابزار فشرده زیر هدر صفحه اصلی: فقط دو کلید («کلید کنترل» در سمت راست و «خروج» در سمت چپ) + تاریخ و ساعت دقیق آخرین به‌روزرسانی از گیت‌هاب */}
          <div className="w-full max-w-full bg-white border-b border-[#E6D5C1] px-2.5 sm:px-6 py-2">
            <div className="max-w-6xl w-full mx-auto space-y-1.5">
              {/* ردیف دو کلیدی: کلید کنترل (سمت راست) و کلید خروج (سمت چپ) */}
              <div className="flex items-center justify-between gap-2">
                {/* ۱. سمت راست: کلید کنترل (کشویی) */}
                <button
                  type="button"
                  data-testid="home-control-menu-btn"
                  onClick={() => setShowControlMenu((prev) => !prev)}
                  className={`flex-1 sm:flex-initial sm:min-w-[220px] min-h-[38px] px-3.5 py-1.5 text-xs font-bold rounded-xl border transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                    showControlMenu
                      ? 'bg-[#8C3B2B] text-white border-[#702D20] shadow-xs'
                      : 'bg-[#FDF8F2] text-[#8C3B2B] hover:bg-amber-100/70 border-[#E6D5C1]'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <SlidersHorizontal className="w-4 h-4 shrink-0" />
                    <span>کلید کنترل</span>
                  </span>
                  {showControlMenu ? (
                    <ChevronUp className="w-4 h-4 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 shrink-0" />
                  )}
                </button>

                {/* ۲. سمت چپ: کلید خروج */}
                <button
                  type="button"
                  data-testid="home-exit-btn"
                  onClick={() => setShowExitConfirmModal(true)}
                  title="خروج کامل از نرم‌افزار"
                  className="min-w-[110px] sm:min-w-[140px] min-h-[38px] px-3.5 py-1.5 text-xs font-bold bg-[#8C3B2B] text-white hover:bg-[#702D20] rounded-xl transition-colors flex items-center justify-center gap-1.5 text-center cursor-pointer shadow-xs"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  <span>خروج</span>
                </button>
              </div>

              {/* پنل کشویی «کلید کنترل» (شامل پشتیبان و گزارش‌ها، نقش کاربر، ارتباط گوشی، بروزرسانی از گیت‌هاب و نشان ذخیره‌سازی محلی) */}
              {showControlMenu && (
                <div
                  data-testid="home-control-menu-panel"
                  className="bg-[#FAF5EE] border border-[#D8C7B2] rounded-2xl p-3 space-y-2.5 shadow-sm animate-in fade-in duration-150"
                >
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#E6D5C1] text-[11px]">
                    <div className="flex items-center gap-1.5 text-[#1E4D2B] font-bold">
                      <ShieldCheck className="w-4 h-4 text-[#2E7D5B] shrink-0" />
                      <span>ذخیره‌سازی محلی فعال است</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowControlMenu(false)}
                      className="text-[#6E5846] hover:text-[#332218] font-bold cursor-pointer"
                    >
                      بستن ✕
                    </button>
                  </div>

                  {/* بخش ویژه قرمزرنگ: خروجی اضطراری ۰ تا ۱۰۰ کل اطلاعات نرم‌افزار (اکسل ۳ شیته + جیسون کامل) */}
                  <div
                    data-testid="emergency-full-export-box"
                    className="bg-[#FEF2F2] border-2 border-[#DC2626] rounded-xl p-3 space-y-2.5 shadow-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[#991B1B] font-extrabold text-xs sm:text-sm">
                        <Download className="w-4 h-4 text-[#DC2626] shrink-0" />
                        <span>
                          خروجی از کل اطلاعات نرم‌افزار در مورد تمام شهدا، اسامی شهدایی که هست و کتاب‌هایی که تا حالا کار شده (بانک کامل ۰ تا ۱۰۰ — کارشده و کارنشده)
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded-md bg-[#DC2626] text-white text-[10px] font-bold shrink-0">
                        خروجی اضطراری ۰ تا ۱۰۰
                      </span>
                    </div>
                    <p className="text-[11px] text-[#7F1D1D] leading-5">
                      شامل تمام اطلاعات بارگذاری‌شده در نرم‌افزار طبق فیلدهای جستجو و جدول‌بندی‌شده در <strong>۳ شیت مجزا</strong>: ۱) شیت کل کتاب‌ها (کارشده و کارنشده)، ۲) شیت اسامی شهدا، ۳) شیت اسامی شهدا و کتاب‌های مرتبط با تمام فیلدهای متصل — به‌همراه فایل پشتیبان کامل جیسون (JSON).
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-0.5">
                      <button
                        type="button"
                        data-testid="emergency-export-both-btn"
                        onClick={handleEmergencyZeroToHundredBothDownload}
                        className="min-h-[42px] px-3 py-2 text-xs font-extrabold rounded-xl bg-[#DC2626] hover:bg-[#B91C1B] text-white shadow-sm transition-colors flex items-center justify-center gap-1.5 text-center cursor-pointer"
                      >
                        <Download className="w-4 h-4 shrink-0" />
                        <span>خروجی اضطراری کامل (دانلود هم‌زمان اکسل + جیسون ۰ تا ۱۰۰)</span>
                      </button>

                      <button
                        type="button"
                        data-testid="emergency-export-excel-btn"
                        onClick={handleEmergencyZeroToHundredExcelDownload}
                        className="min-h-[42px] px-3 py-2 text-xs font-bold rounded-xl bg-white hover:bg-red-50 text-[#991B1B] border border-[#FCA5A5] transition-colors flex items-center justify-center gap-1.5 text-center cursor-pointer"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-[#1E4D2B] shrink-0" />
                        <span>فقط خروجی اکسل ۳ شیته (کتاب‌ها | شهدا | ارتباط‌ها)</span>
                      </button>

                      <button
                        type="button"
                        data-testid="emergency-export-json-btn"
                        onClick={handleFullJsonBackupDownload}
                        className="min-h-[42px] px-3 py-2 text-xs font-bold rounded-xl bg-white hover:bg-red-50 text-[#991B1B] border border-[#FCA5A5] transition-colors flex items-center justify-center gap-1.5 text-center cursor-pointer"
                      >
                        <DatabaseBackup className="w-4 h-4 text-[#991B1B] shrink-0" />
                        <span>فقط خروجی جیسون کامل (JSON ۰ تا ۱۰۰ کل اطلاعات)</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                    {/* ۱. پشتیبان و گزارش‌ها */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowControlMenu(false);
                        setShowDeviceSyncDrawer(false);
                        setActiveTab('management');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="min-h-[40px] px-3 py-1.5 text-xs font-bold rounded-xl bg-white text-[#8C3B2B] hover:bg-amber-50 border border-[#E6D5C1] transition-colors flex items-center justify-center gap-1.5 text-center cursor-pointer"
                    >
                      <DatabaseBackup className="w-4 h-4 shrink-0" />
                      <span>پشتیبان و گزارش‌ها ({toPersianDigits(totalSavedCount)})</span>
                    </button>

                    {/* ۲. نقش کاربر */}
                    <div className="min-h-[40px] px-3 py-1.5 bg-[#EAF1F7] border border-slate-200 rounded-xl flex items-center justify-center gap-1.5 text-center">
                      <UserCog className="w-4 h-4 text-[#1F4E79] shrink-0" />
                      <span className="text-xs text-[#475467] font-semibold shrink-0">نقش کاربر:</span>
                      <select
                        value={activeUserRole}
                        onChange={(e) => setActiveUserRole(e.target.value as UserRoleCode)}
                        aria-label="نقش کاربر"
                        className="bg-transparent font-bold text-[#253247] text-xs focus:outline-none cursor-pointer"
                      >
                        {USER_ROLES.map((r) => (
                          <option key={r.code} value={r.code}>
                            {r.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* ۳. ارتباط گوشی */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowControlMenu(false);
                        setShowDeviceSyncDrawer((prev) => !prev);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className={`min-h-[40px] px-3 py-1.5 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 text-center cursor-pointer border ${
                        showDeviceSyncDrawer
                          ? 'bg-[#8C3B2B] text-white border-[#702D20]'
                          : 'bg-white text-[#8C3B2B] hover:bg-amber-50 border-[#E6D5C1]'
                      }`}
                    >
                      <Smartphone className="w-4 h-4 shrink-0" />
                      <span>ارتباط گوشی</span>
                    </button>

                    {/* ۴. بروزرسانی از گیت‌هاب */}
                    <button
                      type="button"
                      disabled={isSyncingGitHub}
                      onClick={async () => {
                        if (isSyncingGitHub) return;
                        setIsSyncingGitHub(true);
                        const res = await performManualGitHubSync((msg) => {
                          showNotify(msg, 'warning');
                        });
                        setIsSyncingGitHub(false);
                        if (res.syncedAtFa) {
                          setLastGitHubSyncFa(res.syncedAtFa);
                        } else {
                          setLastGitHubSyncFa(getLastGitHubSyncTimeFa());
                        }
                        if (res.ok) {
                          showNotify(res.message, 'success');
                          if (res.shouldReload) {
                            window.setTimeout(() => {
                              window.location.reload();
                            }, 600);
                          }
                        } else {
                          showNotify(res.message, 'warning');
                        }
                      }}
                      className="min-h-[40px] px-3 py-1.5 text-xs font-bold rounded-xl bg-[#EDF4FB] text-[#1E3A5F] hover:bg-[#D8E8F8] border border-[#C5D9ED] transition-colors flex items-center justify-center gap-1.5 text-center cursor-pointer disabled:opacity-60"
                    >
                      <RefreshCw
                        className={`w-4 h-4 shrink-0 ${isSyncingGitHub ? 'animate-spin' : ''}`}
                      />
                      <span>
                        {isSyncingGitHub ? 'در حال بررسی و دریافت...' : 'بروزرسانی از گیت‌هاب'}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* خط وضعیت زیر کلید کنترل: تاریخ شمسی و ساعت دقیق به دقیقه و ثانیه از آخرین به‌روزرسانی نرم‌افزار */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#5C4636] pt-0.5">
                <div className="flex items-center gap-1.5 font-medium">
                  <RefreshCw className="w-3 h-3 text-[#8C3B2B] shrink-0" />
                  <span>
                    آخرین به‌روزرسانی اطلاعات نرم‌افزار از گیت‌هاب:{' '}
                    <strong className="text-[#332218] font-bold tabular-nums" dir="rtl">
                      {lastGitHubSyncFa}
                    </strong>
                  </span>
                </div>
                {!isOnline && (
                  <div className="flex items-center gap-1 text-amber-900 font-semibold">
                    <WifiOff className="w-3 h-3 text-amber-700 shrink-0" />
                    <span>آفلاین (کارکرد محلی فعال)</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        /* هدر تک‌خطی و خلوت سایر برگ‌ها: فقط عنوان صفحه در یک خط + دکمه‌های مرحله قبل و خروج زیر هم */
        <header className="sticky top-0 z-30 w-full max-w-full bg-[#8C3B2B] text-white px-2.5 sm:px-8 pt-[max(0.5rem,env(safe-area-inset-top,0px))] pb-2 sm:py-3 shadow-xs border-b border-[#702D20]">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1 overflow-hidden">
              <h1 className="font-titr text-[12px] sm:text-base md:text-xl font-bold text-[#FDF8F2] leading-snug whitespace-nowrap truncate">
                {TAB_HEADER_INFO[activeTab].title}
              </h1>
            </div>

            {/* کلید بازگشت به مرحله قبل + کلید خروج با تأیید (زیر هم برای اشغال کمترین عرض در گوشی) */}
            <div className="flex flex-col items-stretch gap-1 shrink-0">
              <button
                type="button"
                onClick={() => handleStepBack()}
                className="min-h-[26px] px-2 py-0.5 text-[10px] sm:text-xs font-bold bg-white/15 hover:bg-white/25 text-white rounded-lg border border-white/25 shadow-xs inline-flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                title="بازگشت به مرحله قبل"
              >
                <ArrowRight className="w-3 h-3 shrink-0" />
                <span>مرحله قبل</span>
              </button>

              <button
                type="button"
                onClick={() => setShowExitConfirmModal(true)}
                className="min-h-[26px] px-2 py-0.5 text-[10px] sm:text-xs font-medium bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/20 shadow-xs inline-flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                title="خروج با تأیید و ذخیره امن"
                aria-label="خروج با تأیید"
              >
                <LogOut className="w-3 h-3 shrink-0" />
                <span className="font-bold">خروج</span>
                {sessionEditsCount > 0 && (
                  <span className="w-3.5 h-3.5 rounded-full bg-white text-[#8C3B2B] text-[9px] font-bold flex items-center justify-center shrink-0">
                    {toPersianDigits(sessionEditsCount)}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Toast Notification (شناور در بالای صفحه با فاصله امن از نوار وضعیت آنتن و باتری گوشی) */}
      {toast && (
        <div
          className={`fixed top-[max(1rem,calc(env(safe-area-inset-top,0px)+0.75rem))] left-1/2 -translate-x-1/2 z-[120] w-[92%] max-w-2xl px-4 py-3 text-xs sm:text-sm font-bold rounded-2xl border-2 shadow-2xl ${
            toast.type === 'warning'
              ? 'bg-amber-100 border-amber-400 text-amber-950'
              : 'bg-[#2E7D5B] border-emerald-900 text-white'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {toast.type === 'warning' ? (
                <AlertTriangle className="w-5 h-5 shrink-0" />
              ) : (
                <CheckCircle2 className="w-5 h-5 shrink-0" />
              )}
              <span className="break-words leading-relaxed">{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="px-2.5 py-1 rounded-lg bg-black/15 hover:bg-black/25 text-[11px] shrink-0 cursor-pointer"
            >
              بستن
            </button>
          </div>
        </div>
      )}

      {/* Main Content Container (Centered & Constrained on Mobile) */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-2.5 sm:px-6 py-3 sm:py-6 overflow-x-hidden space-y-5">
        <div className={showDeviceSyncDrawer ? 'space-y-4' : 'hidden'}>
          <div className="bg-white border border-[#E6D5C1] rounded-2xl p-3 sm:p-4 flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2 text-sm sm:text-base font-bold text-[#332218]">
              <RefreshCw className="w-4 h-4 text-[#8C3B2B] shrink-0" />
              <span>صفحه اختصاصی ارتباط گوشی و انتقال اطلاعات</span>
            </div>
            <button
              type="button"
              onClick={() => setShowDeviceSyncDrawer(false)}
              className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[#8C3B2B] hover:bg-[#702D20] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>بازگشت به کتابخانه</span>
            </button>
          </div>
          {(showDeviceSyncDrawer || hasOpenedDeviceSync) && (
            <DeviceSyncPanel
              dataset={deviceSyncDataset}
              onApplySyncedDataset={handleApplyP2PSyncedDataset}
              onTriggerLocalBackup={() => {
                void handleFullJsonBackupDownload();
              }}
            />
          )}
        </div>

        <div className={showDeviceSyncDrawer ? 'hidden' : 'space-y-5'}>
          {/* MENU 1: HOME (خانه) */}
          {activeTab === 'home' && (
            <HomeDashboardTab
              catalogRows={catalogRows}
              auditRecords={auditRecords}
              bookCopies={bookCopies}
              links={indexedLinks}
              pendingReviews={pendingReviews}
              workbookMartyrs={workbookMartyrs}
              customMartyrs={customMartyrs}
              extractedItems={extractedItems}
              smartSuggestions={smartSuggestions}
              auditLog={auditLog}
              globalQuery={homeGlobalQuery}
              onChangeGlobalQuery={setHomeGlobalQuery}
              onNavigateTab={(tab) => {
                setShowDeviceSyncDrawer(false);
                setActiveTab(tab);
              }}
              onOpenBookInLibrary={(bookQuery) => {
                setShowDeviceSyncDrawer(false);
                setLibrarySubView('catalog');
                setLibraryInitialSearchQuery(bookQuery);
                setActiveTab('library');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onSaveVoiceOrQuickBook={(rec, newCopy) => {
                handleSaveAuditRecord(rec);
                if (newCopy) {
                  handleAddBookCopy(newCopy);
                }
              }}
              onAddBookCopy={handleAddBookCopy}
              onMoveBookCopy={handleMoveBookCopy}
              onAddLink={(newLnk) => {
                const cleanMartyr = newLnk.martyrNameRaw.replace(/^(شهیدان|شهید)\s+/g, '').trim();
                const mComp = normalizePersianText(cleanMartyr).replace(/\s+/g, '');
                setLinks((prev) => {
                  const filtered = prev.filter((l) => {
                    if (l.tempBookId !== newLnk.tempBookId) return true;
                    const lc = normalizePersianText(
                      l.martyrNameRaw.replace(/^(شهیدان|شهید)\s+/g, '')
                    ).replace(/\s+/g, '');
                    return lc !== mComp;
                  });
                  return [newLnk, ...filtered];
                });
                // همگام‌سازی با auditRecords همان کتاب تا در کتابخانه هم بلافاصله دیده شود
                const catRow = catalogRows.find((r) => r.tempBookId === newLnk.tempBookId);
                const recKey =
                  Object.values(auditRecords).find((r) => r.tempBookId === newLnk.tempBookId)?.key ||
                  catRow?.rowKey;
                if (recKey) {
                  setAuditRecords((prev) => {
                    const existing = prev[recKey];
                    if (!existing) return prev;
                    const nextRelated = Array.from(
                      new Set([...(existing.relatedMartyrs || []), cleanMartyr])
                    );
                    const nextExcluded = (existing.excludedMartyrs || []).filter(
                      (ex) =>
                        normalizePersianText(ex.replace(/^(شهیدان|شهید)\s+/g, '')).replace(
                          /\s+/g,
                          ''
                        ) !== mComp
                    );
                    return {
                      ...prev,
                      [recKey]: {
                        ...existing,
                        relatedMartyrs: nextRelated,
                        excludedMartyrs: nextExcluded.length > 0 ? nextExcluded : undefined,
                        updatedAt: new Date().toISOString()
                      }
                    };
                  });
                }
                markSessionModification();
                appendAuditLog(
                  'ثبت یا ویرایش ارتباط کتاب و شهید',
                  `${newLnk.id} / ${newLnk.tempBookId}`,
                  `ثبت ارتباط جدید میان کتاب «${newLnk.bookTitleRaw}» و شهید «${newLnk.martyrNameRaw}» از داخل پرونده کتاب`
                );
              }}
              onUpdateLink={(updatedLnk, oldMartyrName) => {
                const targetBookId = updatedLnk.tempBookId || '';
                const newClean = updatedLnk.martyrNameRaw.replace(/^(شهیدان|شهید)\s+/g, '').trim();
                const newComp = normalizePersianText(newClean).replace(/\s+/g, '');
                const oldClean = (oldMartyrName || '').replace(/^(شهیدان|شهید)\s+/g, '').trim();
                const oldComp = normalizePersianText(oldClean).replace(/\s+/g, '');

                setLinks((prev) => {
                  let replaced = false;
                  const next: BookMartyrLinkRecord[] = [];
                  for (const l of prev) {
                    const sameBook =
                      (targetBookId && l.tempBookId === targetBookId) ||
                      normalizePersianText(l.bookTitleRaw) ===
                        normalizePersianText(updatedLnk.bookTitleRaw);
                    const lComp = normalizePersianText(
                      l.martyrNameRaw.replace(/^(شهیدان|شهید)\s+/g, '')
                    ).replace(/\s+/g, '');
                    const isTarget =
                      l.id === updatedLnk.id ||
                      (sameBook && ((oldComp && lComp === oldComp) || (newComp && lComp === newComp)));

                    if (isTarget) {
                      if (!replaced) {
                        next.push(updatedLnk);
                        replaced = true;
                      }
                      continue;
                    }
                    next.push(l);
                  }
                  if (!replaced) {
                    return [updatedLnk, ...next];
                  }
                  return next;
                });

                // همگام‌سازی فوری نام شهید ویرایش‌شده در auditRecords کتاب (جایگزینی نام قبلی مثل «سید علیرضا» با «سید علیرضا جزئی» بدون تکرار)
                const catRow = catalogRows.find(
                  (r) =>
                    (targetBookId && r.tempBookId === targetBookId) ||
                    normalizePersianText(r.titleRaw) ===
                      normalizePersianText(updatedLnk.bookTitleRaw)
                );
                const existingAuditEntry = Object.values(auditRecords).find(
                  (r) =>
                    (targetBookId && r.tempBookId === targetBookId) ||
                    (catRow && r.key === catRow.rowKey)
                );
                const targetKey = existingAuditEntry?.key || catRow?.rowKey || targetBookId;

                if (targetKey) {
                  setAuditRecords((prev) => {
                    const existing = prev[targetKey];
                    const prevRelated = existing?.relatedMartyrs || [];
                    const filteredRelated = prevRelated.filter((m) => {
                      const mc = normalizePersianText(
                        m.replace(/^(شهیدان|شهید)\s+/g, '')
                      ).replace(/\s+/g, '');
                      if (!mc) return false;
                      if (oldComp && mc === oldComp) return false;
                      if (mc === newComp) return false;
                      // حذف پیشوند ناقص قبلی اگر نام جدید کامل‌تر است
                      if (newComp.length > mc.length && newComp.startsWith(mc)) return false;
                      return true;
                    });
                    const nextRelated = newClean ? [...filteredRelated, newClean] : filteredRelated;

                    const exclSet = new Set<string>(existing?.excludedMartyrs || []);
                    if (oldClean && oldComp && oldComp !== newComp) {
                      exclSet.add(oldClean);
                    }
                    for (const ex of Array.from(exclSet)) {
                      const exc = normalizePersianText(
                        ex.replace(/^(شهیدان|شهید)\s+/g, '')
                      ).replace(/\s+/g, '');
                      if (exc === newComp) exclSet.delete(ex);
                    }

                    let nextNotes = existing?.notes || '';
                    if (nextNotes && oldClean && oldComp !== newComp) {
                      const escapedOld = oldClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                      nextNotes = nextNotes.replace(new RegExp(escapedOld, 'g'), newClean);
                    }

                    if (existing) {
                      return {
                        ...prev,
                        [targetKey]: {
                          ...existing,
                          relatedMartyrs: nextRelated,
                          excludedMartyrs: exclSet.size > 0 ? Array.from(exclSet) : undefined,
                          notes: nextNotes,
                          updatedAt: new Date().toISOString()
                        }
                      };
                    } else if (catRow) {
                      return {
                        ...prev,
                        [targetKey]: {
                          key: catRow.rowKey,
                          source: 'catalog',
                          sheet: currentSheetName,
                          tempBookId: catRow.tempBookId,
                          title: catRow.titleRaw,
                          author: catRow.authorRaw || '',
                          publisher: catRow.publisherRaw || '',
                          year: '',
                          descriptionRaw: catRow.descriptionRaw || '',
                          category: catRow.categoryRaw || SUBJECT_CATEGORIES[0].label,
                          shelf: '',
                          level: '',
                          location: catRow.locationRaw || '',
                          physical: 'verified',
                          countedCopies: catRow.countedCopiesRaw || '1',
                          notes: catRow.noteRaw || '',
                          relatedMartyrs: nextRelated,
                          excludedMartyrs: exclSet.size > 0 ? Array.from(exclSet) : undefined,
                          updatedAt: new Date().toISOString()
                        }
                      };
                    }
                    return prev;
                  });
                }

                markSessionModification();
                appendAuditLog(
                  'ثبت یا ویرایش ارتباط کتاب و شهید',
                  `${updatedLnk.id} / ${updatedLnk.tempBookId}`,
                  `ویرایش ارتباط کتاب «${updatedLnk.bookTitleRaw}» و شهید «${updatedLnk.martyrNameRaw}» در پرونده کتاب`
                );
              }}
              onDeleteLink={(linkId, bookId, martyrName) => {
                const cleanMartyr = (martyrName || '').replace(/^(شهیدان|شهید)\s+/g, '').trim();
                const targetComp = normalizePersianText(cleanMartyr).replace(/\s+/g, '');

                setLinks((prev) =>
                  prev.filter((l) => {
                    if (linkId && l.id === linkId) return false;
                    const sameBook = bookId && l.tempBookId === bookId;
                    const lComp = normalizePersianText(
                      l.martyrNameRaw.replace(/^(شهیدان|شهید)\s+/g, '')
                    ).replace(/\s+/g, '');
                    if (sameBook && targetComp && lComp === targetComp) return false;
                    return true;
                  })
                );

                const catRow = catalogRows.find((r) => bookId && r.tempBookId === bookId);
                const existingAuditEntry = Object.values(auditRecords).find(
                  (r) => (bookId && r.tempBookId === bookId) || (catRow && r.key === catRow.rowKey)
                );
                const targetKey = existingAuditEntry?.key || catRow?.rowKey || bookId;

                if (targetKey && cleanMartyr) {
                  setAuditRecords((prev) => {
                    const existing = prev[targetKey];
                    const nextRelated = (existing?.relatedMartyrs || []).filter((m) => {
                      const mc = normalizePersianText(
                        m.replace(/^(شهیدان|شهید)\s+/g, '')
                      ).replace(/\s+/g, '');
                      return mc !== targetComp;
                    });
                    const nextExcluded = Array.from(
                      new Set([...(existing?.excludedMartyrs || []), cleanMartyr])
                    );
                    let nextNotes = existing?.notes || '';
                    if (nextNotes && cleanMartyr.length >= 3) {
                      const escaped = cleanMartyr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                      nextNotes = nextNotes
                        .replace(new RegExp(`شهید\\s+مرتبط:\\s*${escaped}\\s*(?:[،,|]\\s*)?`, 'g'), '')
                        .replace(new RegExp(`شهید\\s+${escaped}\\b`, 'g'), '')
                        .replace(/\s*\|\s*\|\s*/g, ' | ')
                        .replace(/^\s*\|\s*|\s*\|\s*$/g, '')
                        .trim();
                    }

                    if (existing) {
                      return {
                        ...prev,
                        [targetKey]: {
                          ...existing,
                          relatedMartyrs: nextRelated,
                          excludedMartyrs: nextExcluded,
                          notes: nextNotes,
                          updatedAt: new Date().toISOString()
                        }
                      };
                    } else if (catRow) {
                      return {
                        ...prev,
                        [targetKey]: {
                          key: catRow.rowKey,
                          source: 'catalog',
                          sheet: currentSheetName,
                          tempBookId: catRow.tempBookId,
                          title: catRow.titleRaw,
                          author: catRow.authorRaw || '',
                          publisher: catRow.publisherRaw || '',
                          year: '',
                          descriptionRaw: catRow.descriptionRaw || '',
                          category: catRow.categoryRaw || SUBJECT_CATEGORIES[0].label,
                          shelf: '',
                          level: '',
                          location: catRow.locationRaw || '',
                          physical: 'verified',
                          countedCopies: catRow.countedCopiesRaw || '1',
                          notes: nextNotes,
                          relatedMartyrs: nextRelated,
                          excludedMartyrs: nextExcluded,
                          updatedAt: new Date().toISOString()
                        }
                      };
                    }
                    return prev;
                  });
                }

                markSessionModification();
                appendAuditLog(
                  'ثبت یا ویرایش ارتباط کتاب و شهید',
                  `${linkId} / ${bookId}`,
                  `حذف ارتباط شهید «${cleanMartyr}» از کتاب (${bookId})`
                );
                showNotify(`🗑️ ارتباط شهید «${cleanMartyr}» از پرونده کتاب و کتابخانه حذف شد.`);
              }}
              onApproveOutsideBook={(recordKey) => {
                const existing = auditRecords[recordKey];
                const catRow = catalogRows.find(
                  (r) => r.rowKey === recordKey || r.tempBookId === recordKey
                );
                const bookTitle = existing?.title || catRow?.titleRaw || 'کتاب انتخابی';
                const bookId = existing?.tempBookId || catRow?.tempBookId || recordKey;

                const updated: FieldAuditRecord = existing
                  ? {
                      ...existing,
                      expertApproved: true,
                      physical: 'verified',
                      needsReview: false,
                      copyStatus: 'verified_present',
                      notes: existing.notes
                        ? existing.notes.replace(/در انتظار تأیید کارشناس/g, 'تأییدشده توسط کارشناس')
                        : 'تأییدشده توسط کارشناس',
                      updatedAt: new Date().toISOString()
                    }
                  : {
                      key: catRow?.rowKey || recordKey,
                      source: 'catalog',
                      sheet: currentSheetName,
                      tempBookId: bookId,
                      title: bookTitle,
                      author: catRow?.authorRaw || '',
                      publisher: catRow?.publisherRaw || '',
                      year: '',
                      descriptionRaw: catRow?.descriptionRaw || '',
                      category: catRow?.categoryRaw || SUBJECT_CATEGORIES[0].label,
                      shelf: 'SH-01',
                      level: 'T01',
                      location: catRow?.locationRaw || 'SH-01-T01',
                      physical: 'verified',
                      needsReview: false,
                      expertApproved: true,
                      copyStatus: 'verified_present',
                      physicalCondition: 'healthy',
                      countedCopies: catRow?.countedCopiesRaw || '1',
                      notes: 'تأییدشده توسط کارشناس',
                      updatedAt: new Date().toISOString()
                    };

                handleSaveAuditRecord(updated);
                showNotify(
                  `✅ کتاب «${bookTitle}» (${bookId}) توسط کارشناس تأیید نهایی شد و از فهرست بررسی/ثبت‌های جدید خارج گردید.`
                );
              }}
              onDeleteAuditRecord={handleDeleteSingleRecord}
              onDownloadUnifiedExcel={handleQuickExcelExport}
              onDownloadFullJsonBackup={handleFullJsonBackupDownload}
              fullOperationalState={getFullOperationalState()}
              onApplyMergedSystemState={handleApplyRestoredState}
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
                  className={`flex-1 sm:flex-initial px-2.5 py-1.5 rounded-lg font-bold transition-colors text-center cursor-pointer ${
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
                  className={`flex-1 sm:flex-initial px-2.5 py-1.5 rounded-lg font-bold transition-colors inline-flex items-center justify-center gap-1 cursor-pointer ${
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
                bookMartyrLinks={indexedLinks}
                bookCopies={bookCopies}
                sheetNames={sheetNames}
                currentSheetName={currentSheetName}
                headers={headers}
                columnMap={columnMap}
                auditRecords={auditRecords}
                loadedFileName={loadedFileName}
                initialSearchQuery={libraryInitialSearchQuery}
                onClearInitialSearchQuery={() => setLibraryInitialSearchQuery('')}
                initialDirectBookTarget={libraryDirectBookTarget}
                onClearInitialDirectBookTarget={() => setLibraryDirectBookTarget(null)}
                returnToDashboardLabel={
                  libraryReturnToDashboardDossier
                    ? dashboardReturnLabel || 'بازگشت به داشبورد مدیریتی'
                    : undefined
                }
                onReturnToDashboardDossier={
                  libraryReturnToDashboardDossier
                    ? () => {
                        setLibraryReturnToDashboardDossier(false);
                        setDashboardReturnLabel('');
                        if (
                          navHistoryRef.current.length > 0 &&
                          navHistoryRef.current[navHistoryRef.current.length - 1].tab ===
                            'executive_dashboard'
                        ) {
                          navHistoryRef.current.pop();
                        }
                        isPoppingHistoryRef.current = true;
                        setActiveTab('executive_dashboard');
                      }
                    : undefined
                }
                onWorkbookLoaded={handleWorkbookLoaded}
                onSwitchSheet={handleSwitchSheet}
                onUpdateColumnMap={handleUpdateColumnMap}
                onSaveAuditRecord={handleSaveAuditRecord}
                onDeleteAuditRecord={handleDeleteSingleRecord}
                onDeleteMartyrLink={(linkId, bookId, martyrName) => {
                  const cleanMartyr = (martyrName || '').replace(/^(شهیدان|شهید)\s+/g, '').trim();
                  const targetComp = normalizePersianText(cleanMartyr).replace(/\s+/g, '');
                  setLinks((prev) =>
                    prev.filter((l) => {
                      if (linkId && l.id === linkId) return false;
                      const sameBook = bookId && l.tempBookId === bookId;
                      const lComp = normalizePersianText(
                        l.martyrNameRaw.replace(/^(شهیدان|شهید)\s+/g, '')
                      ).replace(/\s+/g, '');
                      if (sameBook && targetComp && lComp === targetComp) return false;
                      return true;
                    })
                  );
                  const catRow = catalogRows.find((r) => bookId && r.tempBookId === bookId);
                  const existingAuditEntry = Object.values(auditRecords).find(
                    (r) => (bookId && r.tempBookId === bookId) || (catRow && r.key === catRow.rowKey)
                  );
                  const targetKey = existingAuditEntry?.key || catRow?.rowKey || bookId;
                  if (targetKey && cleanMartyr) {
                    setAuditRecords((prev) => {
                      const existing = prev[targetKey];
                      const nextRelated = (existing?.relatedMartyrs || []).filter((m) => {
                        const mc = normalizePersianText(
                          m.replace(/^(شهیدان|شهید)\s+/g, '')
                        ).replace(/\s+/g, '');
                        return mc !== targetComp;
                      });
                      const nextExcluded = Array.from(
                        new Set([...(existing?.excludedMartyrs || []), cleanMartyr])
                      );
                      if (existing) {
                        return {
                          ...prev,
                          [targetKey]: {
                            ...existing,
                            relatedMartyrs: nextRelated,
                            excludedMartyrs: nextExcluded,
                            updatedAt: new Date().toISOString()
                          }
                        };
                      } else if (catRow) {
                        return {
                          ...prev,
                          [targetKey]: {
                            key: catRow.rowKey,
                            source: 'catalog',
                            sheet: currentSheetName,
                            tempBookId: catRow.tempBookId,
                            title: catRow.titleRaw,
                            author: catRow.authorRaw || '',
                            publisher: catRow.publisherRaw || '',
                            year: '',
                            descriptionRaw: catRow.descriptionRaw || '',
                            category: catRow.categoryRaw || SUBJECT_CATEGORIES[0].label,
                            shelf: '',
                            level: '',
                            location: catRow.locationRaw || '',
                            physical: 'verified',
                            countedCopies: catRow.countedCopiesRaw || '1',
                            notes: catRow.noteRaw || '',
                            relatedMartyrs: nextRelated,
                            excludedMartyrs: nextExcluded,
                            updatedAt: new Date().toISOString()
                          }
                        };
                      }
                      return prev;
                    });
                  }
                  markSessionModification();
                  showNotify(`🗑️ ارتباط شهید «${cleanMartyr}» از این کتاب حذف شد.`);
                }}
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
            links={indexedLinks}
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

              // مقابله خودکار شهید جدید فقط با عنوان و توضیحات کتاب‌های موجود در کتابخانه (بدون نام ناشر مانند انتشارات ابراهیم هادی)
              const normMartyr = normalizePersianText(newMartyr.fullName.replace(/^شهید\s+/, ''));
              if (normMartyr.length >= 4) {
                const allBooks = getAllUnifiedBooks(catalogRows, auditRecords);
                const matchedBooks = allBooks.filter((b) =>
                  ` ${stripPublisherAndAutoNotesForMartyrMatch(
                    `${b.titleRaw} ${b.descriptionRaw}`,
                    b.publisherRaw
                  )} `.includes(` ${normMartyr} `)
                );
                if (matchedBooks.length > 0) {
                  const nowFa = new Intl.DateTimeFormat('fa-IR', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  }).format(new Date());

                  setSmartSuggestions((prev) => {
                    const next = [...prev];
                    const localTracker: { id: string }[] = [...next];
                    for (const mb of matchedBooks) {
                      const alreadyInQueue = next.some(
                        (s) =>
                          normalizePersianText(s.martyrName.replace(/^شهید\s+/, '')).includes(normMartyr) &&
                          (s.matchedCatalogBookId === mb.tempBookId ||
                            normalizePersianText(s.bookTitle) === normalizePersianText(mb.titleRaw))
                      );
                      if (alreadyInQueue) continue;
                      const sugId = generateUniqueSuggestionId(localTracker);
                      localTracker.push({ id: sugId });
                      const inTitle = normalizePersianText(mb.titleRaw).includes(normMartyr);
                      next.unshift({
                        id: sugId,
                        martyrId: newMartyr.martyrId,
                        martyrName: newMartyr.fullName.startsWith('شهید')
                          ? newMartyr.fullName
                          : `شهید ${newMartyr.fullName}`,
                        martyrAlternativeNames: newMartyr.alternativeNames || [newMartyr.fullName],
                        bookTitle: mb.titleRaw,
                        authors: mb.authorRaw || '—',
                        publisher: mb.publisherRaw || '—',
                        publishYear: '',
                        editionInfo: `قفسه ${mb.locationRaw || 'کتابخانه'}`,
                        isbn: mb.isbnRaw || '—',
                        fipa: mb.fipaRaw || '—',
                        subjectCategory: mb.categoryRaw || SUBJECT_CATEGORIES[0].label,
                        publisherDescription:
                          mb.descriptionRaw || `کتاب موجود در کتابخانه دارای تشابه با نام شهید «${newMartyr.fullName}»`,
                        sourcePriority: 1,
                        sourceName: 'مقابله خودکار پرونده شهید جدید با مخزن کتابخانه',
                        sourceUrl: '',
                        retrievedAt: nowFa,
                        matchEvidence: `${
                          inTitle ? '[تطبیق دقیق — نیازمند بررسی]' : '[تطبیق احتمالی — نیازمند بررسی]'
                        } شناسایی خودکار تشابه نام شهید «${newMartyr.fullName}» با کتاب «${mb.titleRaw}» (${
                          mb.tempBookId
                        }) بلافاصله پس از ثبت شهید.`,
                        catalogComparisonStatus: 'موجود در فهرست مرجع ۹۸۰ کتاب',
                        matchedCatalogBookId: mb.tempBookId,
                        reviewStatus: 'در صف بررسی کارشناس',
                        reviewerNote: 'نیازمند بررسی کارشناس (مقابله خودکار هنگام ثبت شهید)',
                        reviewedBy: '',
                        reviewedAt: ''
                      });
                    }
                    return next;
                  });

                  showNotify(
                    `⚠️ مقابله خودکار انجام شد: برای شهید «${newMartyr.fullName}» تعداد ${toPersianDigits(
                      matchedBooks.length
                    )} کتاب مرتبط در کتابخانه یافت شد و با علامت «نیازمند بررسی» به صف بررسی کارشناس اضافه گردید.`
                  );
                }
              }
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
              const targetName = target?.fullName || '';
              const normTargetName = normalizePersianText(targetName.replace(/^شهید\s+/, ''));

              setCustomMartyrs((prev) => prev.filter((cm) => cm.martyrId !== martyrId));

              // پاکسازی خودکار و رفرش صف جست‌وجوی هوشمند متصل به این شهید
              setSmartSuggestions((prev) =>
                prev.filter((s) => {
                  if (s.martyrId === martyrId) return false;
                  if (normTargetName) {
                    const normS = normalizePersianText(s.martyrName.replace(/^شهید\s+/, ''));
                    if (
                      normS &&
                      (normS === normTargetName ||
                        normS.includes(normTargetName) ||
                        normTargetName.includes(normS))
                    ) {
                      return false;
                    }
                  }
                  return true;
                })
              );

              // ریست کردن جست‌وجوی پیش‌انتخاب‌شده در صورت حذف شهید
              setPreselectedSmartMartyrName((prev) => {
                if (normTargetName && prev && normalizePersianText(prev).includes(normTargetName)) {
                  return '';
                }
                return prev;
              });

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
                `حذف پرونده شهید مستقل «${targetName || martyrId}» و پاک‌سازی خودکار سوابق جست‌وجوی هوشمند آن از پایگاه داده`
              );
              showNotify(`پرونده شهید «${targetName || martyrId}» و سوابق جست‌وجوی هوشمند مرتبط حذف شد.`);
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
              clearMartyrsCrossTabTarget();
              setPreselectedSmartMartyrName(martyrName);
              setActiveTab('smart_search');
            }}
            onReturnToMartyrDossier={() => {
              const crossTarget = getMartyrsCrossTabTarget();
              const isFromExecDashboard = crossTarget?.returnTarget === 'executive_dashboard';
              clearMartyrsCrossTabTarget();
              const targetTab = isFromExecDashboard ? 'executive_dashboard' : 'home';
              if (
                navHistoryRef.current.length > 0 &&
                navHistoryRef.current[navHistoryRef.current.length - 1].tab === targetTab
              ) {
                navHistoryRef.current.pop();
              }
              isPoppingHistoryRef.current = true;
              setActiveTab(targetTab);
            }}
            onNotify={showNotify}
          />
        )}

        {/* MENU 4: SMART SEARCH (جست‌وجوی هوشمند کتاب‌های مرتبط با شهدا و پایلوت ۲۰ شهید) */}
        {activeTab === 'smart_search' && (
          <SmartBookSearchTab
            catalogRows={catalogRows}
            auditRecords={auditRecords}
            workbookMartyrs={workbookMartyrs}
            customMartyrs={customMartyrs}
            smartSuggestions={smartSuggestions}
            rejectedSuggestionsArchive={rejectedSuggestionsArchive}
            links={indexedLinks}
            extractedItems={extractedItems}
            initialMartyrQuery={preselectedSmartMartyrName}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onAddSuggestion={(newSug: SmartSearchSuggestion) => {
              setSmartSuggestions((prev) => [newSug, ...prev]);
              markSessionModification();
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
              if (updated.reviewStatus === 'ردشده با ثبت دلیل') {
                setRejectedSuggestionsArchive((prev) => {
                  const key = `${updated.martyrName}::${updated.bookTitle}`;
                  const rec: RejectedSuggestionRecord = {
                    id: updated.id,
                    martyrId: updated.martyrId,
                    martyrName: updated.martyrName,
                    bookTitle: updated.bookTitle,
                    bookId: updated.matchedCatalogBookId || undefined,
                    rejectedBy: updated.reviewedBy || getRoleDisplayName(activeUserRole),
                    rejectedAt: updated.reviewedAt || new Date().toLocaleDateString('fa-IR'),
                    rejectionReason: updated.reviewerNote || 'رد کارشناسی',
                    updatedAt: Date.now()
                  };
                  const filtered = prev.filter(
                    (r) => `${r.martyrName}::${r.bookTitle}` !== key && r.id !== updated.id
                  );
                  return [rec, ...filtered];
                });
              } else {
                // اگر از حالت ردشده خارج شد، از بایگانی ردشده‌ها نیز برداشته شود
                setRejectedSuggestionsArchive((prev) =>
                  prev.filter(
                    (r) =>
                      r.id !== updated.id &&
                      `${r.martyrName}::${r.bookTitle}` !==
                        `${updated.martyrName}::${updated.bookTitle}`
                  )
                );
              }
              markSessionModification();
              appendAuditLog(
                'بررسی پیشنهاد جست‌وجوی هوشمند',
                updated.id,
                `تغییر وضعیت پیشنهاد هوشمند «${updated.bookTitle}» برای «${updated.martyrName}» به «${updated.reviewStatus}»`
              );
            }}
            onDeleteSuggestion={(sugId: string) => {
              setSmartSuggestions((prev) => prev.filter((s) => s.id !== sugId));
              markSessionModification();
              appendAuditLog(
                'بررسی پیشنهاد جست‌وجوی هوشمند',
                sugId,
                `حذف رکورد پیشنهاد ${sugId} از صف بررسی کارشناس (بدون حذف ارتباطات تأییدشده)`
              );
            }}
            onClearAllSuggestions={() => {
              setSmartSuggestions([]);
              markSessionModification();
              appendAuditLog(
                'بررسی پیشنهاد جست‌وجوی هوشمند',
                'ALL',
                'پاک‌سازی صف بررسی کارشناس (حفظ کامل ارتباطات تأییدشده و بایگانی موارد ردشده)'
              );
            }}
            onApproveSuggestionToLinks={(sug: SmartSearchSuggestion, newLink: BookMartyrLinkRecord) => {
              const normM = normalizePersianText(sug.martyrName.replace(/^شهید\s+/, ''));
              const normB = normalizePersianText(sug.bookTitle);
              const nowFa = new Intl.DateTimeFormat('fa-IR').format(new Date());

              // ۱. به‌روزرسانی پیشنهاد انتخابی و هر پیشنهاد هم‌نام دیگر برای همین کتاب و شهید در صف بررسی
              setSmartSuggestions((prev) =>
                prev.map((s) => {
                  if (s.id === sug.id) return sug;
                  const sNormM = normalizePersianText(s.martyrName.replace(/^شهید\s+/, ''));
                  const sNormB = normalizePersianText(s.bookTitle);
                  if (
                    s.reviewStatus === 'در صف بررسی کارشناس' &&
                    sNormM === normM &&
                    (s.matchedCatalogBookId === sug.matchedCatalogBookId || sNormB === normB)
                  ) {
                    return {
                      ...s,
                      reviewStatus: 'تأییدشده و افزوده‌شده به پرونده',
                      reviewedBy: sug.reviewedBy || getRoleDisplayName(activeUserRole),
                      reviewedAt: sug.reviewedAt || nowFa
                    };
                  }
                  return s;
                })
              );

              // ۲. اگر رکورد پیوند مشابهی از قبل در links وضعیت نیازمند بررسی داشت، همان را به تأییدشده کارشناسی ارتقا بده وگرنه پیوند جدید را اضافه کن
              setLinks((prev) => {
                let matchedExisting = false;
                const updatedPrev = prev.map((l) => {
                  const lNormM = normalizePersianText(l.martyrNameRaw.replace(/^شهید\s+/, ''));
                  const lNormB = normalizePersianText(l.bookTitleRaw);
                  if (
                    lNormM === normM &&
                    ((sug.matchedCatalogBookId && l.tempBookId === sug.matchedCatalogBookId) ||
                      lNormB === normB)
                  ) {
                    matchedExisting = true;
                    return {
                      ...l,
                      gravePieceRaw: l.gravePieceRaw || newLink.gravePieceRaw,
                      graveRowRaw: l.graveRowRaw || newLink.graveRowRaw,
                      graveNumberRaw: l.graveNumberRaw || newLink.graveNumberRaw,
                      reviewStatus: 'تأییدشده کارشناسی',
                      reviewerNote: newLink.reviewerNote || l.reviewerNote
                    };
                  }
                  return l;
                });
                return matchedExisting ? updatedPrev : [newLink, ...updatedPrev];
              });

              // ۳. بستن ردیف متناظر در شیت موارد نیازمند بررسی (pendingReviews)
              setPendingReviews((prev) =>
                prev.map((pv) => {
                  if (
                    classifyPendingReviewStatus(pv.trackingStatus) !== 'resolved' &&
                    normalizePersianText(pv.nameOrPhrase.replace(/^شهید\s+/, '')) === normM &&
                    normalizePersianText(pv.bookTitle) === normB
                  ) {
                    return { ...pv, trackingStatus: 'بررسی‌شده' };
                  }
                  return pv;
                })
              );

              // ۴. خارج کردن کتاب مرتبط در auditRecords از وضعیت نیازمند بررسی
              setAuditRecords((prev) => {
                let changed = false;
                const next = { ...prev };
                for (const [k, rec] of Object.entries(next)) {
                  if (
                    rec.needsReview &&
                    (rec.tempBookId === sug.matchedCatalogBookId ||
                      normalizePersianText(rec.title) === normB)
                  ) {
                    changed = true;
                    next[k] = {
                      ...rec,
                      needsReview: false,
                      notes: (rec.notes || '')
                        .replace(/\s*\|\s*⚠️\s*نیازمند بررسی:?\s*تشابه نام با[^|]*/g, '')
                        .replace(/⚠️\s*نیازمند بررسی:?\s*تشابه نام با[^|]*/g, '')
                        .trim()
                    };
                  }
                }
                return changed ? next : prev;
              });

              markSessionModification();
              appendAuditLog(
                'ثبت یا ویرایش ارتباط کتاب و شهید',
                newLink.id,
                `تأیید پیشنهاد هوشمند و ثبت ارتباط میان «${newLink.bookTitleRaw}» و «${newLink.martyrNameRaw}»`
              );
            }}
            onUpdateLinkStatus={(linkId, status, note) => {
              const targetLink =
                links.find((l) => l.id === linkId) || indexedLinks.find((l) => l.id === linkId);
              setLinks((prev) => {
                const exists = prev.some((l) => l.id === linkId);
                if (exists) {
                  return prev.map((l) =>
                    l.id === linkId ? { ...l, reviewStatus: status, reviewerNote: note } : l
                  );
                }
                if (targetLink) {
                  return [{ ...targetLink, reviewStatus: status, reviewerNote: note }, ...prev];
                }
                return prev;
              });
              if (targetLink && isApprovedLinkStatus(status)) {
                const normM = normalizePersianText(targetLink.martyrNameRaw.replace(/^شهید\s+/, ''));
                const normB = normalizePersianText(targetLink.bookTitleRaw);
                setPendingReviews((prev) =>
                  prev.map((pv) =>
                    classifyPendingReviewStatus(pv.trackingStatus) !== 'resolved' &&
                    (pv.mainRecordId === linkId ||
                      (normalizePersianText(pv.nameOrPhrase.replace(/^شهید\s+/, '')) === normM &&
                        normalizePersianText(pv.bookTitle) === normB))
                      ? { ...pv, trackingStatus: 'بررسی‌شده' }
                      : pv
                  )
                );
              }
              markSessionModification();
              appendAuditLog(
                'ثبت یا ویرایش ارتباط کتاب و شهید',
                linkId,
                `تغییر وضعیت بررسی ارتباط ${linkId} به «${status}»`
              );
            }}
            onNotify={showNotify}
          />
        )}

        {/* MENU 5: RESEARCH & REVIEW (پژوهش و بررسی + درگاه انتشار سایت گلزار) */}
        {activeTab === 'research' && (
          <ResearchAndLinksTab
            catalogRows={catalogRows}
            auditRecords={auditRecords}
            bookCopies={bookCopies}
            links={indexedLinks}
            pendingReviews={pendingReviews}
            workbookMartyrs={workbookMartyrs}
            multiMartyrGroups={multiMartyrGroups}
            extractedItems={extractedItems}
            onAddLink={(newLnk) => {
              setLinks((prev) => [newLnk, ...prev]);
              markSessionModification();
              appendAuditLog(
                'ثبت یا ویرایش ارتباط کتاب و شهید',
                `${newLnk.id} / ${newLnk.tempBookId}`,
                `ثبت ارتباط پژوهشی جدید میان «${newLnk.bookTitleRaw}» و «${newLnk.martyrNameRaw}»`
              );
            }}
            onUpdateLinkStatus={(linkId, status, note) => {
              const targetLink =
                links.find((l) => l.id === linkId) || indexedLinks.find((l) => l.id === linkId);
              setLinks((prev) => {
                const exists = prev.some((l) => l.id === linkId);
                if (exists) {
                  return prev.map((l) =>
                    l.id === linkId ? { ...l, reviewStatus: status, reviewerNote: note } : l
                  );
                }
                if (targetLink) {
                  return [{ ...targetLink, reviewStatus: status, reviewerNote: note }, ...prev];
                }
                return prev;
              });
              if (targetLink && isApprovedLinkStatus(status)) {
                const normM = normalizePersianText(targetLink.martyrNameRaw.replace(/^شهید\s+/, ''));
                const normB = normalizePersianText(targetLink.bookTitleRaw);
                setPendingReviews((prev) =>
                  prev.map((pv) =>
                    classifyPendingReviewStatus(pv.trackingStatus) !== 'resolved' &&
                    (pv.mainRecordId === linkId ||
                      (normalizePersianText(pv.nameOrPhrase.replace(/^شهید\s+/, '')) === normM &&
                        normalizePersianText(pv.bookTitle) === normB))
                      ? { ...pv, trackingStatus: 'بررسی‌شده' }
                      : pv
                  )
                );
              }
              markSessionModification();
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
              markSessionModification();
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
              markSessionModification();
              appendAuditLog(
                'بازبینی گروه چندشهیدی',
                updatedGroup.groupCode,
                `بازبینی گروه ${updatedGroup.groupCode} (${updatedGroup.registeredTitle}) — وضعیت: ${updatedGroup.decisionStatus}`
              );
            }}
            onAddExtractedItem={(newItem) => {
              setExtractedItems((prev) => [newItem, ...prev]);
              markSessionModification();
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
              markSessionModification();
              appendAuditLog(
                'ثبت مطلب استخراج‌شده',
                id,
                `تغییر وضعیت بازبینی مطلب استخراج‌شده ${id} به «${status}»`
              );
            }}
            onJumpToSmartSearch={(martyrName) => {
              setPreselectedSmartMartyrName(martyrName);
              setActiveTab('smart_search');
            }}
            onNotify={showNotify}
          />
        )}

        {/* MANAGEMENT, BACKUP & 16 REPORTS */}
        {activeTab === 'management' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-2xl p-3">
              <span className="text-xs font-bold text-[#253247] px-1">
                پشتیبان کامل JSON سامانه (۱۱ مجموعه داده)، خروجی‌های تخصصی Excel و گزارش‌های ۱۶گانه:
              </span>
              <div className="flex flex-wrap items-center gap-1.5 bg-[#F5F7FA] p-1 rounded-xl text-xs w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setShowPilotSubView(false)}
                  className={`flex-1 sm:flex-initial px-2.5 py-1.5 rounded-lg font-bold transition-colors text-center ${
                    !showPilotSubView ? 'bg-[#1F4E79] text-white' : 'text-[#253247]'
                  }`}
                >
                  پشتیبان کامل و خروجی‌ها
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
                fullOperationalState={getFullOperationalState()}
                onRestoreFullBackup={handleApplyRestoredState}
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
                customMartyrs={customMartyrs}
                links={links}
                extractedItems={extractedItems}
                pendingReviews={pendingReviews}
                smartSuggestions={smartSuggestions}
                multiMartyrGroups={multiMartyrGroups}
                auditLog={auditLog}
                fullOperationalState={getFullOperationalState()}
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

        {/* EXECUTIVE DASHBOARD (ورود مستقیم به نمای سه‌کادره داشبورد مدیریتی بدون صفحه واسط قدیمی) */}
        {activeTab === 'executive_dashboard' && executiveDashboardInputs && (
          <ExecutiveDashboardView
            inputs={executiveDashboardInputs}
            viewState={executiveDashboardState}
            readiness={executiveReadiness}
            onUpdateViewState={(updater) =>
              setExecutiveDashboardState((prev) =>
                typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
              )
            }
            onOpenDetailedReports={() => {
              setShowDeviceSyncDrawer(false);
              setActiveTab('executive_statistics');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onBackToStatisticsRoute={() => {
              setShowDeviceSyncDrawer(false);
              setActiveTab('executive_statistics');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenOriginalBookRecord={(book: DashboardBookListItem, sourceDrilldown: DashboardDrilldownKey) => {
              const metaTitle = DRILLDOWN_META_MAP[sourceDrilldown]?.title;
              setDashboardReturnLabel(
                metaTitle
                  ? `بازگشت به فهرست «${metaTitle}» در داشبورد`
                  : 'بازگشت به داشبورد مدیریتی'
              );
              setLibrarySubView('catalog');
              setLibraryDirectBookTarget({
                rowKey: book.bookKey,
                tempBookId: book.tempBookId,
                nonce: Date.now()
              });
              setLibraryReturnToDashboardDossier(true);
              setShowDeviceSyncDrawer(false);
              setActiveTab('library');
            }}
            onOpenOriginalMartyrRecord={(
              martyr: DashboardMartyrListItem,
              sourceDrilldown: DashboardDrilldownKey
            ) => {
              const metaTitle = DRILLDOWN_META_MAP[sourceDrilldown]?.title;
              setMartyrsCrossTabTarget({
                martyrId: martyr.customMartyrId || martyr.golzarId || undefined,
                fullName: martyr.fullName,
                normalizedName: martyr.normalizedName || martyr.fullName,
                gravePiece: martyr.gravePiece || undefined,
                graveRow: martyr.graveRow || undefined,
                graveNumber: martyr.graveNumber || undefined,
                sourceBookDossierId: martyr.linkedBooks[0]?.tempBookId || null,
                sourceBookTitle: martyr.linkedBooks[0]?.bookTitle || undefined,
                sourceMartyrDossierName: martyr.fullName,
                returnTarget: 'executive_dashboard',
                returnLabel: metaTitle
                  ? `بازگشت به فهرست «${metaTitle}» در داشبورد`
                  : 'بازگشت به داشبورد مدیریتی',
                sourceDashboardMartyrKey: martyr.martyrKey,
                timestamp: Date.now()
              });
              setShowDeviceSyncDrawer(false);
              setActiveTab('martyrs');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onNotify={showNotify}
            onRequestLoadGolzarBank={() => {
              void requestLoadGolzarBank();
            }}
          />
        )}

        {/* EXECUTIVE STATISTICS & REPORTS ROUTE (مسیر مستقل سه‌بخشی آمار و گزارش‌های تفصیلی) */}
        {activeTab === 'executive_statistics' && (
          <StatisticsAndReportsRouteView
            inputs={executiveDashboardInputs}
            readiness={executiveReadiness}
            onSelectDrilldown={(key) => {
              setExecutiveDashboardState((prev) => ({
                ...prev,
                subView: 'overview',
                activeDrilldown: key,
                drilldownReturnRoute: 'executive_statistics',
                drilldownSearch: '',
                drilldownSubFilter: 'all',
                drilldownScrollTop: 0
              }));
              setActiveTab('executive_dashboard');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onRequestLoadGolzarBank={() => {
              void requestLoadGolzarBank();
            }}
            onNotify={showNotify}
            onBackToDashboard={() => {
              if (
                navHistoryRef.current.length > 0 &&
                navHistoryRef.current[navHistoryRef.current.length - 1].tab ===
                  'executive_dashboard'
              ) {
                navHistoryRef.current.pop();
              }
              isPoppingHistoryRef.current = true;
              setActiveTab('executive_dashboard');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}
        </div>
      </main>

      {/* Quiet Footer for Desktop */}
      <footer className="hidden md:block max-w-6xl w-full mx-auto px-6 py-4 text-xs text-[#697586] border-t border-slate-200/80 text-center">
        <span>
          مرکز اسناد گلزار شهدای تهران · سامانه جامع کتابخانه، ثبت موجودی فیزیکی، جست‌وجوی هوشمند و پژوهش شهدا
        </span>
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

      {/* نوار ناوبری پایین صفحه: ۵ برگه اصلی + کلید هماهنگ و روشن داشبورد سه‌کادره */}
      <nav
        aria-label="منوی اصلی و داشبورد پایین صفحه"
        className="fixed bottom-0 inset-x-0 w-full max-w-full overflow-visible z-40 bg-[#FDF8F2]/95 backdrop-blur-md border-t border-[#E6D5C1] shadow-sm pb-[env(safe-area-inset-bottom,0px)]"
      >
        <div className="max-w-6xl mx-auto grid grid-cols-6 items-center h-16 px-1 sm:px-4 gap-0.5">
          <button
            type="button"
            onClick={() => {
              clearMartyrsCrossTabTarget();
              setLibraryReturnToDashboardDossier(false);
              setShowDeviceSyncDrawer(false);
              setActiveTab('home');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`min-w-0 min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors px-0.5 cursor-pointer ${
              activeTab === 'home' && !showDeviceSyncDrawer
                ? 'text-[#8C3B2B] font-bold bg-[#F5E6D3]'
                : 'text-[#755C48] hover:bg-[#F5E6D3]/50'
            }`}
          >
            <Home className="w-5 h-5 shrink-0" />
            <span className="text-[10px] sm:text-xs mt-1 truncate max-w-full whitespace-nowrap">
              خانه
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              clearMartyrsCrossTabTarget();
              setLibraryReturnToDashboardDossier(false);
              setShowDeviceSyncDrawer(false);
              setActiveTab('library');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`min-w-0 min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors px-0.5 cursor-pointer ${
              activeTab === 'library' && !showDeviceSyncDrawer
                ? 'text-[#8C3B2B] font-bold bg-[#F5E6D3]'
                : 'text-[#755C48] hover:bg-[#F5E6D3]/50'
            }`}
          >
            <BookOpen className="w-5 h-5 shrink-0" />
            <span className="text-[10px] sm:text-xs mt-1 truncate max-w-full whitespace-nowrap">
              کتابخانه
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              clearMartyrsCrossTabTarget();
              setLibraryReturnToDashboardDossier(false);
              setShowDeviceSyncDrawer(false);
              setActiveTab('martyrs');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`min-w-0 min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors px-0.5 cursor-pointer ${
              activeTab === 'martyrs' && !showDeviceSyncDrawer
                ? 'text-[#8C3B2B] font-bold bg-[#F5E6D3]'
                : 'text-[#755C48] hover:bg-[#F5E6D3]/50'
            }`}
          >
            <Users className="w-5 h-5 shrink-0" />
            <span className="text-[10px] sm:text-xs mt-1 truncate max-w-full whitespace-nowrap">
              شهدا
            </span>
          </button>

          {/* کلید دایره‌ای بیرون‌زده داشبورد مدیریتی با حاشیه طلایی و زمینه قهوه‌ای کمرنگ */}
          <button
            type="button"
            data-testid="bottom-nav-executive-dashboard-btn"
            aria-label="داشبورد مدیریتی مرکز اسناد"
            aria-current={
              (activeTab === 'executive_dashboard' || activeTab === 'executive_statistics') &&
              !showDeviceSyncDrawer
                ? 'page'
                : undefined
            }
            onClick={() => {
              clearMartyrsCrossTabTarget();
              setLibraryReturnToDashboardDossier(false);
              setDashboardReturnLabel('');
              setShowDeviceSyncDrawer(false);
              setExecutiveDashboardState((prev) => ({
                ...prev,
                subView: 'overview',
                activeDrilldown: null,
                drilldownReturnRoute: 'executive_dashboard',
                drilldownSearch: '',
                drilldownSubFilter: 'all',
                drilldownScrollTop: 0,
                dossierStack: [],
                scrollTop: 0
              }));
              setActiveTab('executive_dashboard');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="min-w-0 h-full flex flex-col items-center justify-end pb-1.5 px-0.5 cursor-pointer group focus:outline-none"
          >
            <span
              className={`-mt-7 sm:-mt-8 w-[58px] h-[58px] sm:w-16 sm:h-16 rounded-full p-[3px] flex items-center justify-center transition-all shrink-0 bg-gradient-to-br from-[#FDE68A] via-[#D4A63B] to-[#9E6F10] border border-[#D4A63B] shadow-[0_6px_16px_rgba(180,130,22,0.38)] ${
                (activeTab === 'executive_dashboard' || activeTab === 'executive_statistics') &&
                !showDeviceSyncDrawer
                  ? 'ring-2 ring-[#FDE68A]/90 scale-105'
                  : 'ring-2 ring-[#FDF8F2] group-hover:scale-105'
              }`}
            >
              <span
                className={`w-full h-full rounded-full overflow-hidden flex items-center justify-center border border-[#F5DF9D]/70 transition-colors ${
                  (activeTab === 'executive_dashboard' || activeTab === 'executive_statistics') &&
                  !showDeviceSyncDrawer
                    ? 'bg-[#E2C198] text-[#4A2613]'
                    : 'bg-[#EAD2B5] text-[#5C341E] group-hover:bg-[#E2C39E]'
                }`}
              >
                <ExecutiveDashboardNavIcon
                  active={
                    (activeTab === 'executive_dashboard' || activeTab === 'executive_statistics') &&
                    !showDeviceSyncDrawer
                  }
                />
              </span>
            </span>
            <span
              className={`text-[10px] sm:text-xs mt-0.5 truncate max-w-full whitespace-nowrap ${
                (activeTab === 'executive_dashboard' || activeTab === 'executive_statistics') &&
                !showDeviceSyncDrawer
                  ? 'text-[#8C3B2B] font-bold'
                  : 'text-[#6B3E26] font-semibold'
              }`}
            >
              داشبورد
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              clearMartyrsCrossTabTarget();
              setLibraryReturnToDashboardDossier(false);
              setShowDeviceSyncDrawer(false);
              setActiveTab('smart_search');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`min-w-0 min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors px-0.5 cursor-pointer ${
              activeTab === 'smart_search' && !showDeviceSyncDrawer
                ? 'text-[#8C3B2B] font-bold bg-[#F5E6D3]'
                : 'text-[#755C48] hover:bg-[#F5E6D3]/50'
            }`}
          >
            <Sparkles className="w-5 h-5 shrink-0" />
            <span className="text-[10px] sm:text-xs mt-1 truncate max-w-full whitespace-nowrap">
              جست‌وجو
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              clearMartyrsCrossTabTarget();
              setLibraryReturnToDashboardDossier(false);
              setShowDeviceSyncDrawer(false);
              setActiveTab('research');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`min-w-0 min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors px-0.5 cursor-pointer ${
              activeTab === 'research' && !showDeviceSyncDrawer
                ? 'text-[#8C3B2B] font-bold bg-[#F5E6D3]'
                : 'text-[#755C48] hover:bg-[#F5E6D3]/50'
            }`}
          >
            <FileSearch className="w-5 h-5 shrink-0" />
            <span className="text-[10px] sm:text-xs mt-1 truncate max-w-full whitespace-nowrap">
              پژوهش
            </span>
          </button>
        </div>
      </nav>

      {/* پنجره تأیید خروج کامل از نرم‌افزار (بدون توقف در صفحه میانی و بدون الزام دانلود روزانه) */}
      {showExitConfirmModal && (
        <ModalWindow
          onClose={() => setShowExitConfirmModal(false)}
          title="تأیید خروج کامل از نرم‌افزار"
          maxWidthClass="max-w-md"
        >
          <div className="bg-[#EDF6F0] border border-[#A8D5B5] rounded-xl p-3.5 text-xs text-[#1E4D2B] space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm">
              <CheckCircle2 className="w-5 h-5 text-[#2E6F40] shrink-0" />
              <span>اطلاعات شما در بانک تجمیعی نرم‌افزار ذخیره شده است</span>
            </div>
            <p className="leading-relaxed">
              تمامی ثبت‌های شما به صورت خودکار در کنار <strong>{toPersianDigits(catalogRows.length)} کتاب موجود</strong> در داخل نرم‌افزار (پایگاه دائمی <strong>book</strong>) قرار گرفته است. نیازی به دانلود فایل در هر بار خروج نیست و هر زمان بخواهید می‌توانید کل فهرست تجمیعی را یکجا از بخش «بانک تجمیعی کتاب‌ها» دانلود کنید.
            </p>
          </div>

          <p className="text-xs sm:text-sm text-slate-800 font-bold text-center pt-1">
            آیا می‌خواهید به طور کامل از نرم‌افزار خارج شوید؟
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleCompleteExitFromApp}
              className="w-full min-h-[44px] px-4 py-2.5 bg-[#B91C1C] hover:bg-[#991B1B] text-white font-bold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>بله، خروج کامل از برنامه</span>
            </button>

            <button
              type="button"
              onClick={() => setShowExitConfirmModal(false)}
              className="w-full min-h-[44px] px-4 py-2.5 bg-[#FAF3EA] hover:bg-[#F3E6D6] border border-[#D8C7B2] text-[#332218] font-bold text-xs sm:text-sm rounded-xl flex items-center justify-center transition-colors cursor-pointer"
            >
              انصراف و ادامه کار
            </button>
          </div>
        </ModalWindow>
      )}
      <GlobalExcelExportConfigModal onNotify={showNotify} />
      <GlobalConfirmModal />
    </div>
  );
}
