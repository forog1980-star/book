import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Sparkles,
  Search,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Edit3,
  BookOpen,
  Globe,
  Building2,
  Newspaper,
  ArrowDown,
  Info,
  Trash2,
  Plus,
  AlertCircle,
  Upload,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  ClipboardPaste,
  AlertTriangle,
  Users,
  Link2,
  Eye
} from 'lucide-react';
import { ModalWindow } from './ModalWindow';
import {
  BookMartyrLinkRecord,
  CustomMartyrRecord,
  ExtractedContentItem,
  FieldAuditRecord,
  OFFICIAL_SEARCH_SOURCES,
  ReferenceCatalogRow,
  SmartSearchSuggestion,
  SmartSuggestionReviewStatus,
  SUBJECT_CATEGORIES,
  WorkbookGolzarMartyr,
  normalizePersianText,
  toPersianDigits
} from '../data/markazAsnadData';
import { SOOREH_MEHR_RESEARCH_STATS } from '../data/soorehMehrResearch';
import {
  generateUniqueLinkId,
  generateUniqueMartyrId,
  generateUniqueSuggestionId
} from '../utils/idGenerator';
import { RejectedSuggestionRecord } from '../utils/backupService';
import { requestActionConfirmation } from '../utils/confirmDialogService';
import {
  BookMartyrAutoMatch,
  LightweightGolzarMartyr,
  findMartyrGraveIn28k,
  getAllUnifiedBooks,
  getGolzarTotalRecordsCount,
  loadCachedGolzarMartyrs,
  runFastCrossMatchBooksAnd28kMartyrs
} from '../utils/martyrsCrossMatchEngine';
import type { MainMenuTab } from '../App';

export interface SpecializedPublisher {
  id: string;
  name: string;
  affiliation: string;
  domainUrl: string;
  searchUrlPattern: (martyrName: string) => string;
}

export const SACRED_DEFENSE_PUBLISHERS: SpecializedPublisher[] = [
  {
    id: 'sooremehr',
    name: 'انتشارات سوره مهر',
    affiliation: 'حوزه هنری انقلاب اسلامی',
    domainUrl: 'https://sooremehr.ir',
    searchUrlPattern: (name) =>
      `https://www.google.com/search?q=${encodeURIComponent('site:sooremehr.ir "شهید ' + name + '"')}`
  },
  {
    id: 'shahed',
    name: 'نشر شاهد',
    affiliation: 'بنیاد شهید و امور ایثارگران',
    domainUrl: 'https://shahed.isaar.ir',
    searchUrlPattern: (name) =>
      `https://www.google.com/search?q=${encodeURIComponent('site:shahed.isaar.ir OR site:isaar.ir "شهید ' + name + '"')}`
  },
  {
    id: 'revayatfath',
    name: 'انتشارات روایت فتح',
    affiliation: 'مؤسسه فرهنگی هنری روایت فتح',
    domainUrl: 'https://revayatfath.com',
    searchUrlPattern: (name) =>
      `https://www.google.com/search?q=${encodeURIComponent('site:revayatfath.com "شهید ' + name + '"')}`
  },
  {
    id: 'fatehan',
    name: 'انتشارات فاتحان',
    affiliation: 'سازمان حفظ آثار و نشر ارزش‌های دفاع مقدس بسیج',
    domainUrl: 'https://fatehan.ir',
    searchUrlPattern: (name) =>
      `https://www.google.com/search?q=${encodeURIComponent('site:fatehan.ir OR "انتشارات فاتحان" "شهید ' + name + '"')}`
  },
  {
    id: 'yazahra',
    name: 'انتشارات یا زهرا (س)',
    affiliation: 'ناشر تخصصی زندگی‌نامه و وصایای شهدا',
    domainUrl: 'https://yazahra.ir',
    searchUrlPattern: (name) =>
      `https://www.google.com/search?q=${encodeURIComponent('site:yazahra.ir "شهید ' + name + '"')}`
  },
  {
    id: '27besat',
    name: 'نشر ۲۷ بعثت',
    affiliation: 'سپاه حضرت محمد رسول‌الله (ص)',
    domainUrl: 'https://27besat.com',
    searchUrlPattern: (name) =>
      `https://www.google.com/search?q=${encodeURIComponent('site:27besat.com "شهید ' + name + '"')}`
  },
  {
    id: 'ebrahimhadi',
    name: 'انتشارات شهید ابراهیم هادی',
    affiliation: 'گروه فرهنگی شهید ابراهیم هادی',
    domainUrl: 'https://onlinehadi.com',
    searchUrlPattern: (name) =>
      `https://www.google.com/search?q=${encodeURIComponent('site:onlinehadi.com "شهید ' + name + '"')}`
  },
  {
    id: 'khattemoghadam',
    name: 'انتشارات خط مقدم',
    affiliation: 'ادبیات پایداری و مدافعان حرم',
    domainUrl: 'https://khattemoghadam.com',
    searchUrlPattern: (name) =>
      `https://www.google.com/search?q=${encodeURIComponent('site:khattemoghadam.com "شهید ' + name + '"')}`
  },
  {
    id: 'sahba',
    name: 'انتشارات صهبا',
    affiliation: 'مؤسسه ایمان جهادی',
    domainUrl: 'https://sahba.ir',
    searchUrlPattern: (name) =>
      `https://www.google.com/search?q=${encodeURIComponent('site:sahba.ir OR site:jahadi.ir "شهید ' + name + '"')}`
  },
  {
    id: 'sarv',
    name: 'نشر سرو',
    affiliation: 'موزه ملی انقلاب اسلامی و دفاع مقدس',
    domainUrl: 'https://iranhm.ir',
    searchUrlPattern: (name) =>
      `https://www.google.com/search?q=${encodeURIComponent('site:iranhm.ir OR "نشر سرو" "شهید ' + name + '"')}`
  },
  {
    id: 'defamoghaddas',
    name: 'مرکز اسناد و تحقیقات دفاع مقدس',
    affiliation: 'سپاه پاسداران انقلاب اسلامی',
    domainUrl: 'https://defamoghaddas.ir',
    searchUrlPattern: (name) =>
      `https://www.google.com/search?q=${encodeURIComponent('site:defamoghaddas.ir "شهید ' + name + '"')}`
  },
  {
    id: 'amirkabir',
    name: 'مؤسسه انتشارات امیرکبیر',
    affiliation: 'سازمان تبلیغات اسلامی',
    domainUrl: 'https://amirkabir.net',
    searchUrlPattern: (name) =>
      `https://www.google.com/search?q=${encodeURIComponent('site:amirkabir.net "شهید ' + name + '"')}`
  },
  {
    id: 'ettelaat',
    name: 'انتشارات اطلاعات',
    affiliation: 'مؤسسه اطلاعات',
    domainUrl: 'https://ettelaat.com',
    searchUrlPattern: (name) =>
      `https://www.google.com/search?q=${encodeURIComponent('site:ettelaat.com "شهید ' + name + '"')}`
  },
  {
    id: 'irdc',
    name: 'مرکز اسناد انقلاب اسلامی',
    affiliation: 'مؤسسه فرهنگی هنری مرکز اسناد انقلاب اسلامی',
    domainUrl: 'https://irdc.ir',
    searchUrlPattern: (name) =>
      `https://www.google.com/search?q=${encodeURIComponent('site:irdc.ir "شهید ' + name + '"')}`
  },
  {
    id: 'orouj',
    name: 'مؤسسه چاپ و نشر عروج',
    affiliation: 'مؤسسه تنظیم و نشر آثار امام خمینی (ره)',
    domainUrl: 'https://oroujpub.ir',
    searchUrlPattern: (name) =>
      `https://www.google.com/search?q=${encodeURIComponent('site:oroujpub.ir "شهید ' + name + '"')}`
  },
  {
    id: 'darkhoveyn',
    name: 'انتشارات دارخوین',
    affiliation: 'ناشر تخصصی ایثار و شهادت',
    domainUrl: 'https://darkhoveyn.ir',
    searchUrlPattern: (name) =>
      `https://www.google.com/search?q=${encodeURIComponent('site:darkhoveyn.ir "شهید ' + name + '"')}`
  },
  {
    id: 'meraj',
    name: 'انتشارات معراج اندیشه',
    affiliation: 'فرهنگ ایثار و شهادت',
    domainUrl: 'https://ketab.ir',
    searchUrlPattern: (name) =>
      `https://www.google.com/search?q=${encodeURIComponent('"انتشارات معراج اندیشه" "شهید ' + name + '"')}`
  },
  {
    id: 'niloofaraneh',
    name: 'انتشارات نیلوفرانه',
    affiliation: 'ادبیات دفاع مقدس و شهدای مدافع حرم',
    domainUrl: 'https://ketab.ir',
    searchUrlPattern: (name) =>
      `https://www.google.com/search?q=${encodeURIComponent('"انتشارات نیلوفرانه" "شهید ' + name + '"')}`
  }
];

export interface SearchFeedbackState {
  targetName: string;
  matchedInCatalog: ReferenceCatalogRow | null;
  suggestionId: string;
  status: 'matched_catalog' | 'created_new_candidate' | 'already_in_queue' | 'not_found';
  message: string;
  timestamp: string;
}

export interface RejectedSuggestionHistory {
  martyrName: string;
  bookTitle: string;
  catalogBookId?: string;
  reason: string;
  rejectedBy: string;
  rejectedAt: string;
}

const REJECTED_HISTORY_KEY = 'book_rejected_suggestions_history';

function loadRejectedHistory(): RejectedSuggestionHistory[] {
  try {
    const raw = localStorage.getItem(REJECTED_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRejectedHistory(history: RejectedSuggestionHistory[]) {
  try {
    localStorage.setItem(REJECTED_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // ignore
  }
}

function inferSuggestionOriginLabel(sug: SmartSearchSuggestion): {
  code: 'manual' | 'single_search' | 'bulk_match';
  label: string;
  badgeClass: string;
} {
  if (
    sug.originType === 'manual' ||
    sug.editionInfo?.includes('ثبت دستی') ||
    sug.editionInfo?.includes('کشف‌شده') ||
    sug.sourceName?.includes('استعلام بیرونی') ||
    sug.matchEvidence?.includes('ثبت کارشناس') ||
    sug.matchEvidence?.includes('استعلام بیرونی')
  ) {
    return {
      code: 'manual',
      label: 'ثبت دستی و استعلام گوگل',
      badgeClass: 'bg-[#FAF5EE] text-[#5C4636] border-[#D8C7B2]'
    };
  }
  if (
    sug.originType === 'bulk_match' ||
    sug.sourceName?.includes('مقابله انبوه') ||
    sug.reviewerNote?.includes('مقابله خودکار انبوه') ||
    sug.matchEvidence?.includes('تطابق خودکار نام')
  ) {
    return {
      code: 'bulk_match',
      label: 'تطبیق انبوه خودکار',
      badgeClass: 'bg-[#FAF5EE] text-[#5C4636] border-[#D8C7B2]'
    };
  }
  return {
    code: 'single_search',
    label: 'جست‌وجوی تکی شهید',
    badgeClass: 'bg-[#FAF5EE] text-[#5C4636] border-[#D8C7B2]'
  };
}

function formatSingleShahidPrefix(rawName: string): string {
  const cleaned = (rawName || '')
    .replace(/^(?:شهید\s+)+/g, '')
    .trim();
  return cleaned ? `شهید ${cleaned}` : 'شهید';
}

interface SmartBookSearchTabProps {
  catalogRows: ReferenceCatalogRow[];
  auditRecords?: Record<string, FieldAuditRecord>;
  workbookMartyrs: WorkbookGolzarMartyr[];
  customMartyrs?: CustomMartyrRecord[];
  smartSuggestions: SmartSearchSuggestion[];
  rejectedSuggestionsArchive?: RejectedSuggestionRecord[];
  links?: BookMartyrLinkRecord[];
  extractedItems?: ExtractedContentItem[];
  initialMartyrQuery?: string;
  onNavigateTab?: (tab: MainMenuTab) => void;
  onAddSuggestion: (newSug: SmartSearchSuggestion) => void;
  onUpdateSuggestion: (updatedSug: SmartSearchSuggestion) => void;
  onDeleteSuggestion?: (sugId: string) => void;
  onClearAllSuggestions?: () => void;
  onApproveSuggestionToLinks: (sug: SmartSearchSuggestion, newLink: BookMartyrLinkRecord) => void;
  onNotify: (message: string, type?: 'success' | 'warning') => void;
}

function generateMartyrNameVariants(fullName: string, extraAlt: string): string[] {
  const clean = fullName.replace(/^شهید\s+/, '').trim();
  const variants = new Set<string>();
  if (clean) {
    variants.add(clean);
    variants.add(`شهید ${clean}`);
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      const first = parts.slice(0, parts.length - 1).join(' ');
      variants.add(`${last}، ${first}`);
    }
    if (clean.startsWith('محمد') && !clean.startsWith('محمد ')) {
      variants.add(clean.replace(/^محمد/, 'محمد '));
    }
    if (clean.includes('محمد ')) {
      variants.add(clean.replace('محمد ', 'محمد'));
    }
  }
  if (extraAlt.trim()) {
    extraAlt
      .split(/[،,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((v) => variants.add(v));
  }
  return Array.from(variants);
}

export const SmartBookSearchTab: React.FC<SmartBookSearchTabProps> = ({
  catalogRows,
  auditRecords = {},
  workbookMartyrs,
  customMartyrs = [],
  smartSuggestions,
  rejectedSuggestionsArchive = [],
  links = [],
  initialMartyrQuery = '',
  onNavigateTab,
  onAddSuggestion,
  onUpdateSuggestion,
  onDeleteSuggestion,
  onClearAllSuggestions,
  onApproveSuggestionToLinks,
  onNotify
}) => {
  const [twoWayQuery, setTwoWayQuery] = useState(initialMartyrQuery || '');
  const [twoWaySourceFilter, setTwoWaySourceFilter] = useState<
    'all' | 'sooreh' | 'golzar' | 'golzar_single' | 'golzar_multi' | 'needs_review'
  >('all');
  const [showTwoWayListDrawer, setShowTwoWayListDrawer] = useState<boolean>(false);

  // پنجره راهنمای توضیحی وسط صفحه (تازه و باز تا زمانی که خود کاربر آن را ببندد — بدون تایمر خودکار)
  const [centeredHelpPopup, setCenteredHelpPopup] = useState<{
    title: string;
    body: string;
  } | null>(null);

  // پنجره سفید راهنمای فوری وسط صفحه هنگام قرار گرفتن نشانگر ماوس روی کادرها (مانند کل کتاب‌های منطبق)
  const [hoverHintPopup, setHoverHintPopup] = useState<string | null>(null);
  const lastScrollAtRef = useRef<number>(0);
  const dismissedUntilRef = useRef<number>(0);
  const isPointerInsidePopupRef = useRef<boolean>(false);
  const leaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!hoverHintPopup) return;
    const timer = window.setTimeout(() => {
      setHoverHintPopup(null);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [hoverHintPopup]);

  // بستن فوری پنجره راهنمای شناور به‌محض اسکرول کردن صفحه یا چرخاندن ماوس یا لمس صفحه
  useEffect(() => {
    const closeOnScrollOrWheel = () => {
      lastScrollAtRef.current = Date.now();
      isPointerInsidePopupRef.current = false;
      if (leaveTimerRef.current) {
        window.clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
      setHoverHintPopup((prev) => (prev !== null ? null : prev));
    };

    window.addEventListener('scroll', closeOnScrollOrWheel, { capture: true, passive: true });
    window.addEventListener('wheel', closeOnScrollOrWheel, { capture: true, passive: true });
    window.addEventListener('touchmove', closeOnScrollOrWheel, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', closeOnScrollOrWheel, true);
      window.removeEventListener('wheel', closeOnScrollOrWheel, true);
      window.removeEventListener('touchmove', closeOnScrollOrWheel, true);
    };
  }, []);

  const dismissHoverHint = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    dismissedUntilRef.current = Date.now() + 1500;
    isPointerInsidePopupRef.current = false;
    if (leaveTimerRef.current) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    setHoverHintPopup(null);
  };

  const showHelpCentered = (title: string, body: string) => {
    setHoverHintPopup(null);
    setCenteredHelpPopup((prev) => (prev && prev.title === title ? null : { title, body }));
  };

  const showHoverHint = (text: string) => {
    const now = Date.now();
    // اگر کاربر در حال اسکرول کردن است یا به‌تازگی ضربدر پنجره را زده، پنجره مزاحم باز نشود
    if (now - lastScrollAtRef.current < 350 || now < dismissedUntilRef.current) {
      return;
    }
    if (leaveTimerRef.current) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    setHoverHintPopup(text);
  };

  const handleTargetMouseLeave = () => {
    if (leaveTimerRef.current) {
      window.clearTimeout(leaveTimerRef.current);
    }
    leaveTimerRef.current = window.setTimeout(() => {
      if (!isPointerInsidePopupRef.current) {
        setHoverHintPopup(null);
      }
    }, 100);
  };

  // پنجره مودال اختصاصی برای نمایش لیست موارد «نیازمند بررسی» (وقتی کاربر روی «X مورد نیازمند بررسی» کلیک می‌کند)
  const [showNeedsReviewModal, setShowNeedsReviewModal] = useState<boolean>(false);

  // پنجره مودال اختصاصی برای نمایش لیست کتاب‌های تطبیق‌یافته در بخش ۲ (وقتی کاربر روی «X کتاب تطبیق‌یافته» کلیک می‌کند)
  const [showBulkMatchesModal, setShowBulkMatchesModal] = useState<boolean>(false);
  const [lastBulkMatchedList, setLastBulkMatchedList] = useState<BookMartyrAutoMatch[]>([]);

  const [selectedMartyrName, setSelectedMartyrName] = useState(initialMartyrQuery || '');
  const [customAltNames, setCustomAltNames] = useState('');
  const [rejectedHistory, setRejectedHistory] = useState<RejectedSuggestionHistory[]>(loadRejectedHistory);
  const [selectedCatalogDetail, setSelectedCatalogDetail] = useState<ReferenceCatalogRow | null>(null);
  const [selectedSourceCode, setSelectedSourceCode] = useState<string>('ALL');
  const [queueFilter, setQueueFilter] = useState<'ALL' | SmartSuggestionReviewStatus>('ALL');
  const [queueOriginFilter, setQueueOriginFilter] = useState<'ALL' | 'manual' | 'single_search' | 'bulk_match'>('ALL');
  const [expandedSuggestionDetails, setExpandedSuggestionDetails] = useState<Record<string, boolean>>({});

  // بانک ۲۸٬۳۶۸ شهید گلزار
  const [golzarMartyrs28k, setGolzarMartyrs28k] = useState<LightweightGolzarMartyr[]>([]);
  const [totalGolzarRecords, setTotalGolzarRecords] = useState<number>(28368);
  const [loading28k, setLoading28k] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    setLoading28k(true);
    loadCachedGolzarMartyrs()
      .then((list) => {
        if (mounted) {
          setGolzarMartyrs28k(list);
          setTotalGolzarRecords(getGolzarTotalRecordsCount());
          setLoading28k(false);
        }
      })
      .catch(() => {
        if (mounted) setLoading28k(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // کادر هوشمند بازگشت از استعلام بیرونی (به همراه فیلد URL آدرس اینترنتی)
  const [activeExternalInquiry, setActiveExternalInquiry] = useState<{
    martyrName: string;
    portalName: string;
    openedAt: string;
  } | null>(null);
  const [quickReturnBookTitle, setQuickReturnBookTitle] = useState('');
  const [quickReturnPublisher, setQuickReturnPublisher] = useState('');
  const [quickReturnUrl, setQuickReturnUrl] = useState('');
  const [quickReturnNote, setQuickReturnNote] = useState('');

  const [lastSearchFeedback, setLastSearchFeedback] = useState<SearchFeedbackState | null>(null);
  const [highlightedSuggestionId, setHighlightedSuggestionId] = useState<string | null>(null);
  const [showPublishersModal, setShowPublishersModal] = useState<boolean>(false);
  const [showManualAddModal, setShowManualAddModal] = useState<boolean>(false);

  // فرم ثبت دستی کتاب جدید (همراه با فیلد URL)
  const [manualMartyrName, setManualMartyrName] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualPublisher, setManualPublisher] = useState('');
  const [manualAuthor, setManualAuthor] = useState('');
  const [manualYear, setManualYear] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [manualSource, setManualSource] = useState('سازمان اسناد و کتابخانه ملی ایران (NLAI)');
  const [manualNote, setManualNote] = useState('');

  // وضعیت بخش ۲ (جست‌وجوی انبوه)
  const [bulkInputMode, setBulkInputMode] = useState<'system' | 'text' | 'excel'>('system');
  const [bulkSystemScope, setBulkSystemScope] = useState<string>('all_28k');
  const [bulkTextNames, setBulkTextNames] = useState('');
  const [bulkLoadedNames, setBulkLoadedNames] = useState<string[]>([]);
  const [bulkLoadedFileName, setBulkLoadedFileName] = useState('');
  const [pilotStatus, setPilotStatus] = useState<'idle' | 'running' | 'paused' | 'completed'>('idle');
  const [pilotProcessedCount, setPilotProcessedCount] = useState<number>(0);
  const [pilotTotalMatchesInScope, setPilotTotalMatchesInScope] = useState<number>(0);
  const [pilotFoundCount, setPilotFoundCount] = useState<number>(0);
  const [pilotDuplicatePrevented, setPilotDuplicatePrevented] = useState<number>(0);

  // ویرایش / رد در صف بررسی
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<SmartSearchSuggestion | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const allUnifiedBooks = useMemo(
    () => getAllUnifiedBooks(catalogRows, auditRecords),
    [catalogRows, auditRecords]
  );

  const computedVariants = useMemo(
    () => generateMartyrNameVariants(selectedMartyrName, customAltNames),
    [selectedMartyrName, customAltNames]
  );

  // ترکیب پیوندهای رسمی پژوهش + پیشنهادهای در صف بررسی (همراه با استخراج خودکار قطعه/ردیف/شماره مزار از بانک ۲۸٬۳۶۸ شهید)
  const validResearchLinks = useMemo(() => {
    const base = links.filter((l) => Boolean(l.martyrNameRaw) && l.martyrNameRaw !== '*');
    const pendingAsLinks: BookMartyrLinkRecord[] = smartSuggestions
      .filter((s) => s.reviewStatus === 'در صف بررسی کارشناس')
      .map((s) => {
        const graveFrom28k =
          !s.gravePiece && golzarMartyrs28k.length > 0
            ? findMartyrGraveIn28k(s.martyrName, golzarMartyrs28k)
            : null;
        return {
          id: `SUG-LINK-${s.id}`,
          martyrNameRaw: s.martyrName,
          bookTitleRaw: s.bookTitle,
          alternativeTitle: '',
          publisherRaw: s.publisher || '—',
          sourceDescriptionRaw: s.publisherDescription || s.matchEvidence,
          pageReferenceRaw: '—',
          gravePieceRaw: s.gravePiece || graveFrom28k?.gravePiece || '',
          graveRowRaw: s.graveRow || graveFrom28k?.graveRow || '',
          graveNumberRaw: s.graveNumber || graveFrom28k?.graveNumber || '',
          reviewStatus: 'نیازمند بررسی',
          reviewerNote: s.matchEvidence,
          tempBookId: s.matchedCatalogBookId || s.id,
          sourceFile: s.sourceName || 'مقابله خودکار',
          sourceSheet: 'صف بررسی کارشناس',
          sourceExcelRow: s.id,
          rawNameInSource: s.martyrName,
          groupStartRow: '',
          isGroupPhrase: false
        };
      });
    return [...pendingAsLinks, ...base];
  }, [links, smartSuggestions, golzarMartyrs28k]);

  // آمار دقیق تفکیکی منابع برای نمایش شفاف در منوی کشویی و نوار نتیجه مقابله
  const sourceStats = useMemo(() => {
    const soorehLinks = validResearchLinks.filter((l) => l.sourceFile?.includes('لیست کتابهای'));
    const golzarAllLinks = validResearchLinks.filter((l) => l.sourceFile?.includes('قطعات شهدا'));
    const golzarSingleLinks = validResearchLinks.filter((l) => l.sourceSheet === 'یک شهید');
    const golzarMultiLinks = validResearchLinks.filter((l) => l.sourceSheet === 'چند شهید');
    const needsReviewLinks = validResearchLinks.filter(
      (l) => l.reviewStatus.includes('نیازمند بررسی') || l.sourceSheet === 'صف بررسی کارشناس'
    );

    const countUniqueBooks = (arr: BookMartyrLinkRecord[]) => {
      const s = new Set<string>();
      arr.forEach((l) =>
        s.add(
          l.tempBookId ||
            `${normalizePersianText(l.bookTitleRaw)}::${normalizePersianText(l.publisherRaw)}`
        )
      );
      return s.size;
    };

    return {
      allLinksCount: validResearchLinks.length,
      allBooksCount: countUniqueBooks(validResearchLinks),
      soorehLinksCount: soorehLinks.length,
      soorehBooksCount: countUniqueBooks(soorehLinks),
      golzarLinksCount: golzarAllLinks.length,
      golzarBooksCount: countUniqueBooks(golzarAllLinks),
      golzarSingleLinksCount: golzarSingleLinks.length,
      golzarSingleBooksCount: countUniqueBooks(golzarSingleLinks),
      golzarMultiLinksCount: golzarMultiLinks.length,
      golzarMultiBooksCount: countUniqueBooks(golzarMultiLinks),
      needsReviewLinksCount: needsReviewLinks.length,
      needsReviewBooksCount: countUniqueBooks(needsReviewLinks),
      needsReviewList: needsReviewLinks
    };
  }, [validResearchLinks]);

  const twoWayMatchedBookGroups = useMemo(() => {
    const q = normalizePersianText(twoWayQuery.replace(/^شهید\s+/, ''));
    const words = q ? q.split(/\s+/).filter(Boolean) : [];

    const groupsMap = new Map<
      string,
      {
        bookKey: string;
        tempBookId: string;
        bookTitle: string;
        alternativeTitle: string;
        publisher: string;
        description: string;
        sourceFile: string;
        needsReviewFlag: boolean;
        catalogRow?: ReferenceCatalogRow;
        allBookLinks: BookMartyrLinkRecord[];
        matchedMartyrLinkIds: Set<string>;
      }
    >();

    for (const lnk of validResearchLinks) {
      if (twoWaySourceFilter === 'sooreh' && !lnk.sourceFile?.includes('لیست کتابهای')) continue;
      if (twoWaySourceFilter === 'golzar' && !lnk.sourceFile?.includes('قطعات شهدا')) continue;
      if (twoWaySourceFilter === 'golzar_single' && lnk.sourceSheet !== 'یک شهید') continue;
      if (twoWaySourceFilter === 'golzar_multi' && lnk.sourceSheet !== 'چند شهید') continue;
      if (
        twoWaySourceFilter === 'needs_review' &&
        !lnk.reviewStatus.includes('نیازمند بررسی') &&
        !lnk.reviewStatus.includes('در صف')
      ) {
        continue;
      }

      const key =
        lnk.tempBookId ||
        `${normalizePersianText(lnk.bookTitleRaw)}::${normalizePersianText(lnk.publisherRaw)}`;
      let grp = groupsMap.get(key);
      if (!grp) {
        const catRow = allUnifiedBooks.find(
          (c) =>
            (lnk.tempBookId && c.tempBookId === lnk.tempBookId) ||
            normalizePersianText(c.titleRaw) === normalizePersianText(lnk.bookTitleRaw)
        );
        grp = {
          bookKey: key,
          tempBookId: lnk.tempBookId || catRow?.tempBookId || '',
          bookTitle: catRow?.titleRaw || lnk.bookTitleRaw,
          alternativeTitle:
            lnk.alternativeTitle ||
            (catRow && catRow.titleRaw !== lnk.bookTitleRaw ? lnk.bookTitleRaw : ''),
          publisher: lnk.publisherRaw || catRow?.publisherRaw || 'سوره مهر',
          description: lnk.sourceDescriptionRaw || catRow?.descriptionRaw || '',
          sourceFile: lnk.sourceFile || 'لیست کتابهای و شهدای مرتبط.xlsx',
          needsReviewFlag: false,
          catalogRow: catRow,
          allBookLinks: [],
          matchedMartyrLinkIds: new Set<string>()
        };
        groupsMap.set(key, grp);
      }
      if (!grp.description && lnk.sourceDescriptionRaw) {
        grp.description = lnk.sourceDescriptionRaw;
      }
      if (lnk.reviewStatus.includes('نیازمند بررسی') || lnk.sourceSheet === 'صف بررسی کارشناس') {
        grp.needsReviewFlag = true;
      }
      grp.allBookLinks.push(lnk);
    }

    if (words.length > 0 && (twoWaySourceFilter === 'all' || twoWaySourceFilter === 'needs_review')) {
      for (const b of allUnifiedBooks) {
        const bKey = b.tempBookId || b.rowKey;
        if (groupsMap.has(bKey)) continue;
        const bHay = normalizePersianText(`${b.titleRaw} ${b.descriptionRaw} ${b.authorRaw} ${b.noteRaw}`);
        if (words.every((w) => bHay.includes(w))) {
          const matchedMartyrIn28k =
            golzarMartyrs28k.find((gm) => words.every((w) => gm.normalizedFullName.includes(w))) ||
            null;
          const syntheticLink: BookMartyrLinkRecord = {
            id: `AUTO-${bKey}`,
            martyrNameRaw: matchedMartyrIn28k
              ? `شهید ${matchedMartyrIn28k.fullName}`
              : `تشابه با عبارت «${twoWayQuery.trim()}»`,
            bookTitleRaw: b.titleRaw,
            alternativeTitle: '',
            publisherRaw: b.publisherRaw || '—',
            sourceDescriptionRaw: b.descriptionRaw || b.noteRaw || '',
            pageReferenceRaw: '—',
            gravePieceRaw: matchedMartyrIn28k?.gravePiece || '',
            graveRowRaw: matchedMartyrIn28k?.graveRow || '',
            graveNumberRaw: matchedMartyrIn28k?.graveNumber || '',
            reviewStatus: 'نیازمند بررسی (تشابه نام شهید و کتاب)',
            reviewerNote: 'شناسایی خودکار در مقابله دوطرفه',
            tempBookId: b.tempBookId,
            sourceFile: 'مخزن کتابخانه',
            sourceSheet: 'مقابله خودکار',
            sourceExcelRow: String(b.rowIndex || '—'),
            rawNameInSource: twoWayQuery.trim(),
            groupStartRow: '',
            isGroupPhrase: false
          };
          groupsMap.set(bKey, {
            bookKey: bKey,
            tempBookId: b.tempBookId,
            bookTitle: b.titleRaw,
            alternativeTitle: '',
            publisher: b.publisherRaw || '—',
            description: b.descriptionRaw || '',
            sourceFile: 'فهرست کتابخانه',
            needsReviewFlag: true,
            catalogRow: b,
            allBookLinks: [syntheticLink],
            matchedMartyrLinkIds: new Set([syntheticLink.id])
          });
        }
      }
    }

    const allGroups = Array.from(groupsMap.values());
    if (words.length === 0) {
      return allGroups;
    }

    const matchedGroups: typeof allGroups = [];
    for (const grp of allGroups) {
      const bookHeaderHay = normalizePersianText(
        `${grp.tempBookId} ${grp.bookTitle} ${grp.alternativeTitle} ${grp.publisher} ${grp.description}`
      );
      const bookMatchesDirectly = words.every((w) => bookHeaderHay.includes(w));

      const matchedLinkIds = new Set<string>();
      for (const lnk of grp.allBookLinks) {
        const lnkHay = normalizePersianText(
          `${lnk.martyrNameRaw} ${lnk.sourceDescriptionRaw || ''} ${lnk.pageReferenceRaw || ''} ${lnk.gravePieceRaw || ''} ${lnk.bookTitleRaw} ${lnk.alternativeTitle || ''}`
        );
        if (words.every((w) => lnkHay.includes(w))) {
          matchedLinkIds.add(lnk.id);
        }
      }

      if (bookMatchesDirectly || matchedLinkIds.size > 0) {
        matchedGroups.push({
          ...grp,
          matchedMartyrLinkIds: matchedLinkIds
        });
      }
    }

    return matchedGroups;
  }, [validResearchLinks, allUnifiedBooks, golzarMartyrs28k, twoWayQuery, twoWaySourceFilter]);

  const isMartyrOrphanOrTest = (martyrName: string, martyrId?: string): boolean => {
    const cleanLower = (martyrName || '').toLowerCase().trim();
    const norm = normalizePersianText(martyrName.replace(/^شهید\s+/, ''));
    if (cleanLower.includes('test') || cleanLower.includes('تست')) return true;
    if (!norm) return true;

    const inCustom = customMartyrs.some(
      (cm) =>
        (martyrId && cm.martyrId === martyrId) ||
        normalizePersianText(cm.fullName.replace(/^شهید\s+/, '')).includes(norm) ||
        norm.includes(normalizePersianText(cm.fullName.replace(/^شهید\s+/, '')))
    );
    if (inCustom) return false;

    const inWorkbook = workbookMartyrs.some(
      (wm) =>
        (martyrId && wm.tempPersonId === martyrId) ||
        normalizePersianText(wm.fullNameSearch.replace(/^شهید\s+/, '')).includes(norm) ||
        norm.includes(normalizePersianText(wm.fullNameSearch.replace(/^شهید\s+/, '')))
    );
    if (inWorkbook) return false;

    const inGolzar28k = golzarMartyrs28k.some(
      (gm) =>
        (martyrId && gm.id === martyrId) ||
        gm.normalizedFullName === norm ||
        gm.normalizedFullName.includes(norm)
    );
    if (inGolzar28k) return false;

    return true;
  };

  const handleSyncAndPurgeOrphans = () => {
    if (!onDeleteSuggestion) return;
    const orphanItems = smartSuggestions.filter((s) =>
      isMartyrOrphanOrTest(s.martyrName, s.martyrId)
    );
    if (orphanItems.length === 0) {
      onNotify('همه سوابق صف بررسی با پرونده‌های شهدا در سامانه همگام هستند.');
      return;
    }

    requestActionConfirmation({
      title: 'تأیید نهایی پاک‌سازی سوابق تستی و باطل از صف',
      message: `آیا از حذف و پاک‌سازی ${toPersianDigits(orphanItems.length)} سابقه تستی یا فاقد پرونده شهید از صف بررسی اطمینان دارید؟`,
      details: 'این رکوردها از صف بررسی کارشناس خارج و حذف خواهند شد.',
      confirmLabel: 'بله، پاک‌سازی انجام شود',
      variant: 'delete',
      onConfirm: () => {
        orphanItems.forEach((s) => {
          onDeleteSuggestion(s.id);
        });

        if (lastSearchFeedback && isMartyrOrphanOrTest(lastSearchFeedback.targetName)) {
          setLastSearchFeedback(null);
          setHighlightedSuggestionId(null);
        }

        onNotify(
          `همگام‌سازی انجام شد: تعداد ${toPersianDigits(orphanItems.length)} سابقه تستی یا باطل از صف پاک گردید.`,
          'success'
        );
      }
    });
  };

  const checkBookMartyrPriorStatus = (
    targetName: string,
    bookTitle: string,
    catalogBookId?: string
  ): {
    status: 'approved' | 'rejected' | 'in_queue' | 'new';
    reason?: string;
    reviewedBy?: string;
    reviewedAt?: string;
    linkRecord?: BookMartyrLinkRecord;
    existingSuggestion?: SmartSearchSuggestion;
  } => {
    const normTarget = normalizePersianText(targetName.replace(/^شهید\s+/, ''));
    const normTitle = normalizePersianText(bookTitle);

    const matchedLink = links.find((lnk) => {
      const normLnkMartyr = normalizePersianText(lnk.martyrNameRaw.replace(/^شهید\s+/, ''));
      const martyrMatches = normLnkMartyr.includes(normTarget) || normTarget.includes(normLnkMartyr);
      if (!martyrMatches) return false;
      if (catalogBookId && lnk.tempBookId && lnk.tempBookId === catalogBookId) return true;
      const normLnkTitle = normalizePersianText(lnk.bookTitleRaw);
      return normLnkTitle.includes(normTitle) || normTitle.includes(normLnkTitle);
    });

    if (matchedLink) {
      return {
        status: 'approved',
        reason:
          matchedLink.reviewerNote ||
          'تأیید توسط کارشناس انجام شده و به پرونده شهید منتقل گردیده است.',
        reviewedBy: 'کارشناس بازبین مرکز اسناد',
        reviewedAt: 'تأییدشده در کارپوشه',
        linkRecord: matchedLink
      };
    }

    const approvedInSuggestions = smartSuggestions.find((s) => {
      const normSugMartyr = normalizePersianText(s.martyrName.replace(/^شهید\s+/, ''));
      const martyrMatches = normSugMartyr.includes(normTarget) || normTarget.includes(normSugMartyr);
      if (!martyrMatches) return false;
      const normSugTitle = normalizePersianText(s.bookTitle);
      const titleMatches =
        (catalogBookId && s.matchedCatalogBookId === catalogBookId) ||
        normSugTitle.includes(normTitle) ||
        normTitle.includes(normSugTitle);
      return titleMatches && s.reviewStatus === 'تأییدشده و افزوده‌شده به پرونده';
    });

    if (approvedInSuggestions) {
      return {
        status: 'approved',
        reason: approvedInSuggestions.reviewerNote || 'تأیید توسط کارشناس انجام شده است.',
        reviewedBy: approvedInSuggestions.reviewedBy || 'کارشناس بازبین مرکز اسناد',
        reviewedAt: approvedInSuggestions.reviewedAt || '',
        existingSuggestion: approvedInSuggestions
      };
    }

    const rejectedInSuggestions = smartSuggestions.find((s) => {
      const normSugMartyr = normalizePersianText(s.martyrName.replace(/^شهید\s+/, ''));
      const martyrMatches = normSugMartyr.includes(normTarget) || normTarget.includes(normSugMartyr);
      if (!martyrMatches) return false;
      const normSugTitle = normalizePersianText(s.bookTitle);
      const titleMatches =
        (catalogBookId && s.matchedCatalogBookId === catalogBookId) ||
        normSugTitle.includes(normTitle) ||
        normTitle.includes(normSugTitle);
      return titleMatches && s.reviewStatus === 'ردشده با ثبت دلیل';
    });

    if (rejectedInSuggestions) {
      return {
        status: 'rejected',
        reason: rejectedInSuggestions.reviewerNote || 'رد پیشنهاد توسط کارشناس',
        reviewedBy: rejectedInSuggestions.reviewedBy || 'کارشناس بازبین مرکز اسناد',
        reviewedAt: rejectedInSuggestions.reviewedAt || '',
        existingSuggestion: rejectedInSuggestions
      };
    }

    const combinedRejected = [
      ...rejectedSuggestionsArchive.map((ra) => ({
        martyrName: ra.martyrName,
        bookTitle: ra.bookTitle,
        catalogBookId: ra.bookId,
        reason: ra.rejectionReason,
        rejectedBy: ra.rejectedBy,
        rejectedAt: ra.rejectedAt
      })),
      ...rejectedHistory
    ];

    const matchInHistory = combinedRejected.find((rh) => {
      const normRhMartyr = normalizePersianText(rh.martyrName.replace(/^شهید\s+/, ''));
      const martyrMatches = normRhMartyr.includes(normTarget) || normTarget.includes(normRhMartyr);
      if (!martyrMatches) return false;
      if (catalogBookId && rh.catalogBookId && rh.catalogBookId === catalogBookId) return true;
      const normRhTitle = normalizePersianText(rh.bookTitle);
      return normRhTitle.includes(normTitle) || normTitle.includes(normRhTitle);
    });

    if (matchInHistory) {
      return {
        status: 'rejected',
        reason: matchInHistory.reason,
        reviewedBy: matchInHistory.rejectedBy,
        reviewedAt: matchInHistory.rejectedAt
      };
    }

    const pendingInSuggestions = smartSuggestions.find((s) => {
      const normSugMartyr = normalizePersianText(s.martyrName.replace(/^شهید\s+/, ''));
      const martyrMatches = normSugMartyr.includes(normTarget) || normTarget.includes(normSugMartyr);
      if (!martyrMatches) return false;
      const normSugTitle = normalizePersianText(s.bookTitle);
      const titleMatches =
        (catalogBookId && s.matchedCatalogBookId === catalogBookId) ||
        normSugTitle.includes(normTitle) ||
        normTitle.includes(normSugTitle);
      return titleMatches && s.reviewStatus === 'در صف بررسی کارشناس';
    });

    if (pendingInSuggestions) {
      return {
        status: 'in_queue',
        existingSuggestion: pendingInSuggestions
      };
    }

    return { status: 'new' };
  };

  const classifyMatchConfidenceAndEvidence = (
    targetName: string,
    book: ReferenceCatalogRow,
    linkEvidence?: BookMartyrLinkRecord
  ): { matchTypeLabel: 'تطبیق دقیق' | 'تطبیق احتمالی'; evidenceText: string } => {
    const normTarget = normalizePersianText(targetName.replace(/^شهید\s+/, ''));
    const normTitle = normalizePersianText(book.titleRaw);
    const normDesc = normalizePersianText(book.descriptionRaw);
    const normAuthor = normalizePersianText(book.authorRaw);

    if (linkEvidence && normalizePersianText(linkEvidence.martyrNameRaw) === normTarget) {
      return {
        matchTypeLabel: 'تطبیق دقیق',
        evidenceText: `[تطبیق دقیق — نیازمند بررسی] ثبت صریح نام کامل شهید در جدول ارتباط کتاب و شهید (${linkEvidence.sourceSheet || 'پژوهش مرجع'} — صفحه: ${linkEvidence.pageReferenceRaw || 'ثبت‌نشده'}) برای رکورد ${book.tempBookId}.`
      };
    }
    if (normTitle.includes(normTarget)) {
      return {
        matchTypeLabel: 'تطبیق دقیق',
        evidenceText: `[تطبیق دقیق — نیازمند بررسی] درج مستقیم نام کامل شهید «${targetName}» در عنوان کتاب «${book.titleRaw}» (${book.tempBookId}).`
      };
    }
    if (linkEvidence) {
      return {
        matchTypeLabel: 'تطبیق احتمالی',
        evidenceText: `[تطبیق احتمالی — نیازمند بررسی] اشتراک نام یا توضیحات در جدول ارتباط کتاب و شهید (${linkEvidence.martyrNameRaw}) برای کتاب «${book.titleRaw}» (${book.tempBookId}).`
      };
    }
    if (normDesc.includes(normTarget)) {
      return {
        matchTypeLabel: 'تطبیق احتمالی',
        evidenceText: `[تطبیق احتمالی — نیازمند بررسی] ذکر عبارت «${targetName}» در ستون توضیحات فهرست کتابخانه برای کتاب «${book.titleRaw}» (${book.tempBookId}).`
      };
    }
    if (normAuthor.includes(normTarget)) {
      return {
        matchTypeLabel: 'تطبیق احتمالی',
        evidenceText: `[تطبیق احتمالی — نیازمند بررسی] تطابق نام با ستون نویسنده/پدیدآورنده در رکورد ${book.tempBookId}.`
      };
    }
    return {
      matchTypeLabel: 'تطبیق احتمالی',
      evidenceText: `[تطبیق احتمالی — نیازمند بررسی] شباهت نوشتاری با مشخصات رکورد ${book.tempBookId} در قفسه ${book.locationRaw || 'کتابخانه'}.`
    };
  };

  useEffect(() => {
    if (initialMartyrQuery && initialMartyrQuery.trim()) {
      const clean = initialMartyrQuery.trim();
      setSelectedMartyrName(clean);
      setTwoWayQuery(clean);
      const variants = generateMartyrNameVariants(clean, '');
      setCustomAltNames(variants.slice(1).join(' ، '));

      const normTarget = normalizePersianText(clean.replace(/^شهید\s+/, ''));
      const nowFa = new Intl.DateTimeFormat('fa-IR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date());

      const matchedCatalogList = allUnifiedBooks.filter((r) =>
        normalizePersianText(`${r.titleRaw} ${r.descriptionRaw} ${r.authorRaw}`).includes(normTarget)
      );

      if (matchedCatalogList.length > 0) {
        let firstHighlightId = '';
        const localTracker: { id: string }[] = [...smartSuggestions];
        const localMartyrTracker: { id: string }[] = [
          ...customMartyrs.map((m) => ({ id: m.martyrId })),
          ...smartSuggestions.map((s) => ({ id: s.martyrId }))
        ];
        const graveInfo = findMartyrGraveIn28k(clean, golzarMartyrs28k);

        for (const matchedInCatalog of matchedCatalogList) {
          const prior = checkBookMartyrPriorStatus(clean, matchedInCatalog.titleRaw, matchedInCatalog.tempBookId);
          const { evidenceText } = classifyMatchConfidenceAndEvidence(clean, matchedInCatalog);

          if (prior.status === 'approved') {
            const sugId = prior.existingSuggestion?.id || generateUniqueSuggestionId(localTracker);
            localTracker.push({ id: sugId });
            if (!firstHighlightId) firstHighlightId = sugId;
            if (!prior.existingSuggestion) {
              const mId = generateUniqueMartyrId(localMartyrTracker);
              localMartyrTracker.push({ id: mId });
              onAddSuggestion({
                id: sugId,
                martyrId: mId,
                martyrName: clean,
                martyrAlternativeNames: variants,
                bookTitle: matchedInCatalog.titleRaw,
                authors: matchedInCatalog.authorRaw || '—',
                publisher: matchedInCatalog.publisherRaw || '—',
                publishYear: '',
                editionInfo: 'موجود در قفسه کتابخانه',
                isbn: matchedInCatalog.isbnRaw || '—',
                fipa: matchedInCatalog.fipaRaw || '—',
                subjectCategory: matchedInCatalog.categoryRaw || SUBJECT_CATEGORIES[0].label,
                publisherDescription:
                  matchedInCatalog.descriptionRaw ||
                  `کتاب موجود در قفسه کتابخانه منطبق با نام شهید «${clean}»`,
                sourcePriority: 1,
                sourceName: 'فهرست کتابخانه مرکز اسناد (۹۸۰ عنوان کتاب مرجع)',
                sourceUrl: '',
                retrievedAt: nowFa,
                matchEvidence: evidenceText,
                catalogComparisonStatus: 'موجود در فهرست مرجع ۹۸۰ کتاب',
                matchedCatalogBookId: matchedInCatalog.tempBookId,
                gravePiece: graveInfo?.gravePiece,
                graveRow: graveInfo?.graveRow,
                graveNumber: graveInfo?.graveNumber,
                originType: 'single_search',
                reviewStatus: 'تأییدشده و افزوده‌شده به پرونده',
                reviewerNote: prior.reason || 'تأیید توسط کارشناس انجام شده است (موجود در پرونده شهید)',
                reviewedBy: prior.reviewedBy || 'کارشناس بازبین مرکز اسناد',
                reviewedAt: prior.reviewedAt || nowFa
              });
            }
          } else if (prior.status === 'in_queue') {
            if (!firstHighlightId && prior.existingSuggestion) {
              firstHighlightId = prior.existingSuggestion.id;
            }
          } else if (prior.status === 'new') {
            const newId = generateUniqueSuggestionId(localTracker);
            localTracker.push({ id: newId });
            if (!firstHighlightId) firstHighlightId = newId;
            const mId = generateUniqueMartyrId(localMartyrTracker);
            localMartyrTracker.push({ id: mId });
            onAddSuggestion({
              id: newId,
              martyrId: mId,
              martyrName: clean,
              martyrAlternativeNames: variants,
              bookTitle: matchedInCatalog.titleRaw,
              authors: matchedInCatalog.authorRaw || '—',
              publisher: matchedInCatalog.publisherRaw || '—',
              publishYear: '',
              editionInfo: 'موجود در قفسه کتابخانه',
              isbn: matchedInCatalog.isbnRaw || '—',
              fipa: matchedInCatalog.fipaRaw || '—',
              subjectCategory: matchedInCatalog.categoryRaw || SUBJECT_CATEGORIES[0].label,
              publisherDescription:
                matchedInCatalog.descriptionRaw ||
                `کتاب موجود در قفسه کتابخانه منطبق با نام شهید «${clean}»`,
              sourcePriority: 1,
              sourceName: 'فهرست کتابخانه مرکز اسناد (۹۸۰ عنوان کتاب مرجع)',
              sourceUrl: '',
              retrievedAt: nowFa,
              matchEvidence: evidenceText,
              catalogComparisonStatus: 'موجود در فهرست مرجع ۹۸۰ کتاب',
              matchedCatalogBookId: matchedInCatalog.tempBookId,
              gravePiece: graveInfo?.gravePiece,
              graveRow: graveInfo?.graveRow,
              graveNumber: graveInfo?.graveNumber,
              originType: 'single_search',
              reviewStatus: 'در صف بررسی کارشناس',
              reviewerNote: '',
              reviewedBy: '',
              reviewedAt: ''
            });
          }
        }

        const primaryMatch = matchedCatalogList[0];
        setLastSearchFeedback({
          targetName: clean,
          matchedInCatalog: primaryMatch,
          suggestionId: firstHighlightId,
          status: 'matched_catalog',
          message: `برای شهید «${clean}» تعداد ${toPersianDigits(matchedCatalogList.length)} کتاب منطبق در فهرست داخلی شناسایی و در صف بررسی کارشناس ثبت شد.`,
          timestamp: nowFa
        });
        setHighlightedSuggestionId(firstHighlightId || null);
      } else {
        setLastSearchFeedback({
          targetName: clean,
          matchedInCatalog: null,
          suggestionId: '',
          status: 'not_found',
          message: `هیچ کتابی برای شهید «${clean}» در فهرست کتابخانه یافت نشد (۰ رکورد).`,
          timestamp: nowFa
        });
        setHighlightedSuggestionId(null);
      }
    }
  }, [initialMartyrQuery]);

  // ثبت باز شدن درگاه بیرونی و فعال‌سازی کادر بازگشت سریع
  const handleExternalPortalClick = (portalName: string) => {
    const targetMartyr = selectedMartyrName.trim() || twoWayQuery.trim() || 'شهید';
    const nowTime = new Intl.DateTimeFormat('fa-IR', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date());
    setActiveExternalInquiry({
      martyrName: targetMartyr,
      portalName,
      openedAt: nowTime
    });
  };

  // ثبت فوری نتیجه استعلام بیرونی (به همراه آدرس اینترنتی URL)
  const handleQuickReturnRegister = () => {
    const targetMartyr =
      activeExternalInquiry?.martyrName || selectedMartyrName.trim() || twoWayQuery.trim() || 'شهید';
    if (!quickReturnBookTitle.trim()) {
      onNotify('لطفاً عنوان کتاب کشف‌شده را وارد یا از حافظه چسبانده (Paste) کنید.', 'warning');
      return;
    }

    const nowFa = new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date());

    const newId = generateUniqueSuggestionId(smartSuggestions);
    const mId = generateUniqueMartyrId([
      ...customMartyrs.map((m) => ({ id: m.martyrId })),
      ...smartSuggestions.map((s) => ({ id: s.martyrId }))
    ]);
    const portalLabel = activeExternalInquiry?.portalName || 'درگاه استعلام بیرونی';
    const graveInfo = findMartyrGraveIn28k(targetMartyr, golzarMartyrs28k);

    const newSug: SmartSearchSuggestion = {
      id: newId,
      martyrId: mId,
      martyrName: targetMartyr.startsWith('شهید') ? targetMartyr : `شهید ${targetMartyr}`,
      martyrAlternativeNames: generateMartyrNameVariants(targetMartyr, customAltNames),
      bookTitle: quickReturnBookTitle.trim(),
      authors: '—',
      publisher: quickReturnPublisher.trim() || 'استعلام بیرونی (نیازمند بررسی)',
      publishYear: '',
      editionInfo: `کشف‌شده از ${portalLabel}`,
      isbn: '—',
      fipa: '—',
      subjectCategory: SUBJECT_CATEGORIES[0].label,
      publisherDescription:
        quickReturnNote.trim() ||
        `کتاب شناسایی‌شده در استعلام بیرونی (${portalLabel}) برای «${targetMartyr}»`,
      sourcePriority: 2,
      sourceName: `استعلام بیرونی — ${portalLabel}`,
      sourceUrl: quickReturnUrl.trim(),
      retrievedAt: nowFa,
      matchEvidence: `[نیازمند بررسی — استعلام بیرونی] ثبت سریع توسط کارشناس پس از کاوش نام «${targetMartyr}» در درگاه «${portalLabel}».${
        quickReturnUrl.trim() ? ` لینک صفحه کتاب ذخیره شد.` : ''
      }`,
      catalogComparisonStatus: 'کتاب جدید (ثبت دستی کارشناس از منابع بیرونی)',
      gravePiece: graveInfo?.gravePiece,
      graveRow: graveInfo?.graveRow,
      graveNumber: graveInfo?.graveNumber,
      originType: 'manual',
      reviewStatus: 'در صف بررسی کارشناس',
      reviewerNote: quickReturnNote.trim() || 'نیازمند بررسی کارشناس',
      reviewedBy: '',
      reviewedAt: ''
    };

    onAddSuggestion(newSug);
    setQuickReturnBookTitle('');
    setQuickReturnPublisher('');
    setQuickReturnUrl('');
    setQuickReturnNote('');
    setHighlightedSuggestionId(newId);
    setLastSearchFeedback({
      targetName: targetMartyr,
      matchedInCatalog: null,
      suggestionId: newId,
      status: 'created_new_candidate',
      message: `کتاب «${newSug.bookTitle}» برای «${newSug.martyrName}» با علامت «⚠️ نیازمند بررسی»${
        newSug.sourceUrl ? ' و لینک مستقیم اینترنتی' : ''
      } در صف بررسی کارشناس ثبت شد.`,
      timestamp: nowFa
    });
    onNotify(
      `کتاب «${newSug.bookTitle}» برای «${newSug.martyrName}» با موفقیت در صف بررسی ثبت شد.`,
      'success'
    );
  };

  // جست‌وجوی تطبیقی تکی نام شهید
  const handleRunSingleMartyrSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const targetName = selectedMartyrName.trim();
    if (!targetName) {
      onNotify('لطفاً نام شهید را برای تطبیق وارد کنید.', 'warning');
      return;
    }

    const normTarget = normalizePersianText(targetName.replace(/^شهید\s+/, ''));
    if (!normTarget) {
      onNotify('لطفاً یک نام معتبر وارد کنید.', 'warning');
      return;
    }

    const nowFa = new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date());

    setTwoWayQuery(targetName);
    const graveInfo = findMartyrGraveIn28k(targetName, golzarMartyrs28k);

    const directCatalogMatches = allUnifiedBooks.filter((r) =>
      normalizePersianText(`${r.titleRaw} ${r.descriptionRaw} ${r.authorRaw} ${r.noteRaw}`).includes(normTarget)
    );

    const linkMatches = validResearchLinks.filter((lnk) =>
      normalizePersianText(`${lnk.martyrNameRaw} ${lnk.sourceDescriptionRaw || ''} ${lnk.bookTitleRaw}`).includes(
        normTarget
      )
    );

    const matchedBooksMap = new Map<string, { book: ReferenceCatalogRow; linkEvidence?: BookMartyrLinkRecord }>();
    for (const b of directCatalogMatches) {
      matchedBooksMap.set(b.tempBookId || b.titleRaw, { book: b });
    }
    for (const lnk of linkMatches) {
      const catBook =
        allUnifiedBooks.find(
          (c) =>
            (lnk.tempBookId && c.tempBookId === lnk.tempBookId) ||
            normalizePersianText(c.titleRaw) === normalizePersianText(lnk.bookTitleRaw)
        ) || {
          rowKey: `LINK::${lnk.id}`,
          rowIndex: Number(lnk.sourceExcelRow) || 0,
          tempBookId: lnk.tempBookId || lnk.id,
          titleRaw: lnk.bookTitleRaw,
          publisherRaw: lnk.publisherRaw || 'سوره مهر',
          descriptionRaw: lnk.sourceDescriptionRaw || '',
          categoryRaw: 'R',
          authorRaw: '',
          isbnRaw: '',
          fipaRaw: '',
          registrationNoRaw: '',
          locationRaw: '',
          countedCopiesRaw: '1',
          reviewStatusRaw: lnk.reviewStatus,
          noteRaw: lnk.reviewerNote || '',
          backupSourceSheet: lnk.sourceSheet || 'Sheet2',
          backupSourceRow: lnk.sourceExcelRow || '',
          allValues: []
        };
      const mapKey = catBook.tempBookId || catBook.titleRaw;
      if (!matchedBooksMap.has(mapKey)) {
        matchedBooksMap.set(mapKey, { book: catBook, linkEvidence: lnk });
      } else if (!matchedBooksMap.get(mapKey)?.linkEvidence) {
        matchedBooksMap.set(mapKey, { book: catBook, linkEvidence: lnk });
      }
    }

    const matchedEntries = Array.from(matchedBooksMap.values());

    if (matchedEntries.length > 0) {
      const localSugTracker: { id: string }[] = [...smartSuggestions];
      const localMartyrTracker: { id: string }[] = [
        ...customMartyrs.map((m) => ({ id: m.martyrId })),
        ...smartSuggestions.map((s) => ({ id: s.martyrId }))
      ];

      let newlyAddedCount = 0;
      let exactCount = 0;
      let probableCount = 0;
      let alreadyApprovedCount = 0;
      let alreadyRejectedCount = 0;
      let alreadyInQueueCount = 0;
      let lastRejectReason = '';
      let firstSuggestionId = '';

      for (const entry of matchedEntries) {
        const matched = entry.book;
        const { matchTypeLabel, evidenceText } = classifyMatchConfidenceAndEvidence(
          targetName,
          matched,
          entry.linkEvidence
        );
        if (matchTypeLabel === 'تطبیق دقیق') exactCount++;
        else probableCount++;

        const prior = checkBookMartyrPriorStatus(targetName, matched.titleRaw, matched.tempBookId);

        if (prior.status === 'approved') {
          alreadyApprovedCount++;
          const sugId = prior.existingSuggestion?.id || generateUniqueSuggestionId(localSugTracker);
          localSugTracker.push({ id: sugId });
          if (!firstSuggestionId) firstSuggestionId = sugId;
          if (!prior.existingSuggestion) {
            const mId = generateUniqueMartyrId(localMartyrTracker);
            localMartyrTracker.push({ id: mId });
            onAddSuggestion({
              id: sugId,
              martyrId: mId,
              martyrName: targetName,
              martyrAlternativeNames: computedVariants,
              bookTitle: matched.titleRaw,
              authors: matched.authorRaw || '—',
              publisher: matched.publisherRaw || '—',
              publishYear: '',
              editionInfo: 'موجود در قفسه کتابخانه',
              isbn: matched.isbnRaw || '—',
              fipa: matched.fipaRaw || '—',
              subjectCategory: matched.categoryRaw || SUBJECT_CATEGORIES[0].label,
              publisherDescription:
                matched.descriptionRaw || `کتاب موجود در کتابخانه منطبق با شهید «${targetName}»`,
              sourcePriority: 1,
              sourceName: 'فهرست کتابخانه مرکز اسناد (۹۸۰ عنوان کتاب مرجع)',
              sourceUrl: '',
              retrievedAt: nowFa,
              matchEvidence: evidenceText,
              catalogComparisonStatus: 'موجود در فهرست مرجع ۹۸۰ کتاب',
              matchedCatalogBookId: matched.tempBookId,
              gravePiece: entry.linkEvidence?.gravePieceRaw || graveInfo?.gravePiece,
              graveRow: entry.linkEvidence?.graveRowRaw || graveInfo?.graveRow,
              graveNumber: entry.linkEvidence?.graveNumberRaw || graveInfo?.graveNumber,
              originType: 'single_search',
              reviewStatus: 'تأییدشده و افزوده‌شده به پرونده',
              reviewerNote: prior.reason || 'تأیید توسط کارشناس انجام شده است (موجود در پرونده شهید)',
              reviewedBy: prior.reviewedBy || 'کارشناس بازبین مرکز اسناد',
              reviewedAt: prior.reviewedAt || nowFa
            });
          }
          continue;
        }

        if (prior.status === 'rejected') {
          alreadyRejectedCount++;
          lastRejectReason = prior.reason || 'رد پیشنهاد توسط کارشناس';
          const sugId = prior.existingSuggestion?.id || generateUniqueSuggestionId(localSugTracker);
          localSugTracker.push({ id: sugId });
          if (!firstSuggestionId) firstSuggestionId = sugId;
          continue;
        }

        if (prior.status === 'in_queue') {
          alreadyInQueueCount++;
          if (!firstSuggestionId && prior.existingSuggestion) {
            firstSuggestionId = prior.existingSuggestion.id;
          }
          continue;
        }

        newlyAddedCount++;
        const newId = generateUniqueSuggestionId(localSugTracker);
        localSugTracker.push({ id: newId });
        if (!firstSuggestionId) firstSuggestionId = newId;
        const mId = generateUniqueMartyrId(localMartyrTracker);
        localMartyrTracker.push({ id: mId });

        onAddSuggestion({
          id: newId,
          martyrId: mId,
          martyrName: targetName,
          martyrAlternativeNames: computedVariants,
          bookTitle: matched.titleRaw,
          authors: matched.authorRaw || '—',
          publisher: matched.publisherRaw || '—',
          publishYear: '',
          editionInfo: 'موجود در قفسه کتابخانه',
          isbn: matched.isbnRaw || '—',
          fipa: matched.fipaRaw || '—',
          subjectCategory: matched.categoryRaw || SUBJECT_CATEGORIES[0].label,
          publisherDescription:
            matched.descriptionRaw || `کتاب موجود در کتابخانه منطبق با شهید «${targetName}»`,
          sourcePriority: 1,
          sourceName: 'فهرست کتابخانه مرکز اسناد (۹۸۰ عنوان کتاب مرجع)',
          sourceUrl: '',
          retrievedAt: nowFa,
          matchEvidence: evidenceText,
          catalogComparisonStatus: 'موجود در فهرست مرجع ۹۸۰ کتاب',
          matchedCatalogBookId: matched.tempBookId,
          gravePiece: entry.linkEvidence?.gravePieceRaw || graveInfo?.gravePiece,
          graveRow: entry.linkEvidence?.graveRowRaw || graveInfo?.graveRow,
          graveNumber: entry.linkEvidence?.graveNumberRaw || graveInfo?.graveNumber,
          originType: 'single_search',
          reviewStatus: 'در صف بررسی کارشناس',
          reviewerNote: '',
          reviewedBy: '',
          reviewedAt: ''
        });
      }

      const primaryMatched = matchedEntries[0].book;
      const summaryParts: string[] = [
        `برای «${targetName}» تعداد ${toPersianDigits(matchedEntries.length)} کتاب یافت شد (${toPersianDigits(exactCount)} تطبیق دقیق · ${toPersianDigits(probableCount)} تطبیق احتمالی)`
      ];
      if (newlyAddedCount > 0)
        summaryParts.push(`${toPersianDigits(newlyAddedCount)} مورد جدید با علامت «نیازمند بررسی» به صف اضافه شد`);
      if (alreadyApprovedCount > 0)
        summaryParts.push(`${toPersianDigits(alreadyApprovedCount)} مورد قبلاً تأییدشده`);
      if (alreadyRejectedCount > 0)
        summaryParts.push(`${toPersianDigits(alreadyRejectedCount)} مورد قبلاً ردشده (${lastRejectReason})`);
      if (alreadyInQueueCount > 0)
        summaryParts.push(`${toPersianDigits(alreadyInQueueCount)} مورد در صف بررسی`);

      setLastSearchFeedback({
        targetName,
        matchedInCatalog: primaryMatched,
        suggestionId: firstSuggestionId,
        status: newlyAddedCount > 0 || alreadyApprovedCount > 0 ? 'matched_catalog' : 'already_in_queue',
        message: summaryParts.join(' | '),
        timestamp: nowFa
      });
      setHighlightedSuggestionId(firstSuggestionId || null);
      onNotify(summaryParts.join(' — '), newlyAddedCount > 0 ? 'success' : 'warning');
    } else {
      setLastSearchFeedback({
        targetName,
        matchedInCatalog: null,
        suggestionId: '',
        status: 'not_found',
        message: `هیچ کتابی برای «${targetName}» در فهرست داخلی کتابخانه یافت نشد (۰ مورد). در صورت کشف کتاب در درگاه‌های بیرونی (گوگل، خانه کتاب و...) می‌توانید آن را ثبت کنید.`,
        timestamp: nowFa
      });
      setHighlightedSuggestionId(null);
      onNotify(`هیچ کتابی برای «${targetName}» در فهرست داخلی کتابخانه یافت نشد (۰ مورد).`, 'warning');
    }
  };

  // بارگذاری فایل اکسل در جست‌وجوی انبوه
  const handleBulkExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const rawMatrix: unknown[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as unknown[][];
      if (rawMatrix.length === 0) {
        onNotify('فایل اکسل انتخابی خالی است.', 'warning');
        return;
      }

      const headers = (rawMatrix[0] || []).map((h) => String(h || '').trim());
      let nameColIdx = headers.findIndex((h) => /نام.*شهید|شهید|نام.*خانوادگی|نام/i.test(h));
      if (nameColIdx < 0) nameColIdx = 0;

      const extractedNames: string[] = [];
      for (let i = 1; i < rawMatrix.length; i++) {
        const row = rawMatrix[i];
        if (!row) continue;
        const rawVal = String(row[nameColIdx] || '').trim();
        if (rawVal && rawVal !== 'نام شهید' && !rawVal.startsWith('---')) {
          extractedNames.push(rawVal);
        }
      }

      const uniqueNames = Array.from(new Set(extractedNames)).slice(0, 200);
      setBulkLoadedNames(uniqueNames);
      setBulkLoadedFileName(file.name);
      onNotify(
        `فایل «${file.name}» خوانده شد: تعداد ${toPersianDigits(uniqueNames.length)} نام شهید آماده تطبیق است.`
      );
    } catch (err) {
      onNotify(
        `خطا در خواندن فایل اکسل: ${err instanceof Error ? err.message : 'فرمت نامعتبر'}`,
        'warning'
      );
    } finally {
      e.target.value = '';
    }
  };

  // اجرای تطبیق انبوه (همراه با نگهداری فهرست کامل کتاب‌های منطبق برای نمایش در پنجره مستقل با کلیک کاربر)
  const handleRunBulkMartyrSearch = () => {
    const nowFa = new Intl.DateTimeFormat('fa-IR').format(new Date());
    const localSugTracker: { id: string }[] = [...smartSuggestions];
    const localMartyrTracker: { id: string }[] = [
      ...customMartyrs.map((m) => ({ id: m.martyrId })),
      ...smartSuggestions.map((s) => ({ id: s.martyrId }))
    ];

    if (bulkInputMode === 'system') {
      if (bulkSystemScope === 'custom_only' && customMartyrs.length === 0) {
        onNotify(
          'در بخش «پرونده‌های ثبت دستی» هنوز پرونده‌ای ثبت نشده است. گزینه «کل بانک ۲۸٬۳۶۸ شهید گلزار» را انتخاب کنید یا در صفحه شهدا پرونده جدید بسازید.',
          'warning'
        );
        return;
      }

      setPilotStatus('running');
      const pieceFilter =
        bulkSystemScope.startsWith('piece_') ? bulkSystemScope.replace('piece_', '') : '';

      const autoMatches =
        bulkSystemScope === 'custom_only'
          ? runFastCrossMatchBooksAnd28kMartyrs(allUnifiedBooks, [], customMartyrs, [])
          : runFastCrossMatchBooksAnd28kMartyrs(
              allUnifiedBooks,
              golzarMartyrs28k,
              customMartyrs,
              validResearchLinks,
              pieceFilter
            );

      setLastBulkMatchedList(autoMatches);

      const totalMartyrsChecked =
        bulkSystemScope === 'custom_only'
          ? customMartyrs.length
          : pieceFilter
          ? golzarMartyrs28k.filter((g) =>
              pieceFilter === 'outside' ? g.source === 'outside' : g.gravePiece === pieceFilter
            ).length
          : totalGolzarRecords + customMartyrs.length;

      let newlyAdded = 0;
      let alreadyPresent = 0;
      let firstNewSugId = '';

      for (const m of autoMatches) {
        const prior = checkBookMartyrPriorStatus(m.martyrName, m.book.titleRaw, m.book.tempBookId);
        if (prior.status === 'in_queue' || prior.status === 'approved' || prior.status === 'rejected') {
          alreadyPresent++;
          continue;
        }
        if (newlyAdded >= 60) {
          alreadyPresent++;
          continue;
        }

        newlyAdded++;
        const newId = generateUniqueSuggestionId(localSugTracker);
        localSugTracker.push({ id: newId });
        if (!firstNewSugId) firstNewSugId = newId;
        const mId = m.martyrId || generateUniqueMartyrId(localMartyrTracker);
        localMartyrTracker.push({ id: mId });

        onAddSuggestion({
          id: newId,
          martyrId: mId,
          martyrName: m.martyrName,
          martyrAlternativeNames: [m.martyrName.replace(/^شهید\s+/, '')],
          bookTitle: m.book.titleRaw,
          authors: m.book.authorRaw || '—',
          publisher: m.book.publisherRaw || '—',
          publishYear: '',
          editionInfo: `قفسه ${m.book.locationRaw || 'کتابخانه'}`,
          isbn: m.book.isbnRaw || '—',
          fipa: m.book.fipaRaw || '—',
          subjectCategory: m.book.categoryRaw || SUBJECT_CATEGORIES[0].label,
          publisherDescription:
            m.book.descriptionRaw ||
            `کتاب موجود در کتابخانه دارای تشابه اسمی با «${m.martyrName}»`,
          sourcePriority: 1,
          sourceName: 'مقابله انبوه بانک ۲۸٬۳۶۸ شهید گلزار و کتابخانه',
          sourceUrl: '',
          retrievedAt: nowFa,
          matchEvidence: m.evidenceText,
          catalogComparisonStatus: 'موجود در فهرست مرجع ۹۸۰ کتاب',
          matchedCatalogBookId: m.book.tempBookId,
          gravePiece: m.gravePiece,
          graveRow: m.graveRow,
          graveNumber: m.graveNumber,
          originType: 'bulk_match',
          reviewStatus: 'در صف بررسی کارشناس',
          reviewerNote: 'نیازمند بررسی کارشناس (مقابله خودکار انبوه)',
          reviewedBy: '',
          reviewedAt: ''
        });
      }

      setPilotProcessedCount(totalMartyrsChecked);
      setPilotTotalMatchesInScope(autoMatches.length);
      setPilotFoundCount(newlyAdded);
      setPilotDuplicatePrevented(alreadyPresent);
      setPilotStatus('completed');
      if (firstNewSugId) {
        setHighlightedSuggestionId(firstNewSugId);
      }

      onNotify(
        `مقابله انبوه انجام شد: در این محدوده مجموعاً ${toPersianDigits(
          autoMatches.length
        )} تطابق کتاب و شهید شناسایی شد (${toPersianDigits(newlyAdded)} مورد جدید به صف اضافه شد و ${toPersianDigits(
          alreadyPresent
        )} مورد از قبل در صف/پرونده موجود بود). برای مشاهده فهرست روی عدد کتاب‌های منطبق کلیک کنید.`,
        autoMatches.length > 0 ? 'success' : undefined
      );
      return;
    }

    // حالت‌های ورود متنی یا اکسل
    let namesToSearch: string[] = [];
    if (bulkInputMode === 'excel') {
      namesToSearch = bulkLoadedNames;
    } else if (bulkInputMode === 'text') {
      namesToSearch = bulkTextNames
        .split(/[\n،,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }

    if (namesToSearch.length === 0) {
      onNotify(
        'لطفاً ابتدا اسامی شهدا را در کادر متنی وارد کنید، فایل اکسل بارگذاری نمایید، یا تب «بانک ۲۸٬۳۶۸ شهید گلزار» را انتخاب کنید.',
        'warning'
      );
      return;
    }

    setPilotStatus('running');
    let processed = 0;
    let newlyAdded = 0;
    let alreadyPresent = 0;
    const collectedMatches: BookMartyrAutoMatch[] = [];

    namesToSearch.forEach((rawName) => {
      const cleanName = rawName.replace(/^شهید\s+/, '').trim();
      const normName = normalizePersianText(cleanName);
      if (!normName) return;

      processed++;
      const graveInfo = findMartyrGraveIn28k(cleanName, golzarMartyrs28k);

      const directMatches = allUnifiedBooks.filter((r) =>
        normalizePersianText(`${r.titleRaw} ${r.descriptionRaw} ${r.authorRaw} ${r.noteRaw}`).includes(normName)
      );
      const linkMatchesForMartyr = validResearchLinks.filter((lnk) =>
        normalizePersianText(`${lnk.martyrNameRaw} ${lnk.sourceDescriptionRaw || ''}`).includes(normName)
      );

      const martyrBooksMap = new Map<string, { book: ReferenceCatalogRow; linkEvidence?: BookMartyrLinkRecord }>();
      for (const b of directMatches) {
        martyrBooksMap.set(b.tempBookId || b.titleRaw, { book: b });
      }
      for (const lnk of linkMatchesForMartyr) {
        const catBook =
          allUnifiedBooks.find(
            (c) =>
              (lnk.tempBookId && c.tempBookId === lnk.tempBookId) ||
              normalizePersianText(c.titleRaw) === normalizePersianText(lnk.bookTitleRaw)
          ) || {
            rowKey: `LINK::${lnk.id}`,
            rowIndex: Number(lnk.sourceExcelRow) || 0,
            tempBookId: lnk.tempBookId || lnk.id,
            titleRaw: lnk.bookTitleRaw,
            publisherRaw: lnk.publisherRaw || 'سوره مهر',
            descriptionRaw: lnk.sourceDescriptionRaw || '',
            categoryRaw: 'R',
            authorRaw: '',
            isbnRaw: '',
            fipaRaw: '',
            registrationNoRaw: '',
            locationRaw: '',
            countedCopiesRaw: '1',
            reviewStatusRaw: lnk.reviewStatus,
            noteRaw: lnk.reviewerNote || '',
            backupSourceSheet: lnk.sourceSheet || 'Sheet2',
            backupSourceRow: lnk.sourceExcelRow || '',
            allValues: []
          };
        const mapKey = catBook.tempBookId || catBook.titleRaw;
        if (!martyrBooksMap.has(mapKey)) {
          martyrBooksMap.set(mapKey, { book: catBook, linkEvidence: lnk });
        }
      }

      const allMatchedForMartyr = Array.from(martyrBooksMap.values());
      const variants = generateMartyrNameVariants(rawName, '');

      for (const entry of allMatchedForMartyr) {
        const matched = entry.book;
        const { matchTypeLabel, evidenceText } = classifyMatchConfidenceAndEvidence(
          rawName,
          matched,
          entry.linkEvidence
        );
        collectedMatches.push({
          martyrName: rawName.startsWith('شهید') ? rawName : `شهید ${rawName}`,
          gravePiece: entry.linkEvidence?.gravePieceRaw || graveInfo?.gravePiece,
          graveRow: entry.linkEvidence?.graveRowRaw || graveInfo?.graveRow,
          graveNumber: entry.linkEvidence?.graveNumberRaw || graveInfo?.graveNumber,
          book: matched,
          matchType: matchTypeLabel,
          evidenceText
        });

        const prior = checkBookMartyrPriorStatus(rawName, matched.titleRaw, matched.tempBookId);

        if (prior.status === 'in_queue' || prior.status === 'approved') {
          alreadyPresent++;
          continue;
        }

        newlyAdded++;
        const newId = generateUniqueSuggestionId(localSugTracker);
        localSugTracker.push({ id: newId });
        const mId = generateUniqueMartyrId(localMartyrTracker);
        localMartyrTracker.push({ id: mId });

        onAddSuggestion({
          id: newId,
          martyrId: mId,
          martyrName: rawName.startsWith('شهید') ? rawName : `شهید ${rawName}`,
          martyrAlternativeNames: variants,
          bookTitle: matched.titleRaw,
          authors: matched.authorRaw || '—',
          publisher: matched.publisherRaw || '—',
          publishYear: '',
          editionInfo: 'موجود در قفسه کتابخانه',
          isbn: matched.isbnRaw || '—',
          fipa: matched.fipaRaw || '—',
          subjectCategory: matched.categoryRaw || SUBJECT_CATEGORIES[0].label,
          publisherDescription:
            matched.descriptionRaw ||
            `کتاب موجود در قفسه کتابخانه منطبق با نام شهید «${rawName}»`,
          sourcePriority: 1,
          sourceName: 'فهرست کتابخانه مرکز اسناد (۹۸۰ عنوان کتاب مرجع)',
          sourceUrl: '',
          retrievedAt: nowFa,
          matchEvidence: evidenceText,
          catalogComparisonStatus: 'موجود در فهرست مرجع ۹۸۰ کتاب',
          matchedCatalogBookId: matched.tempBookId,
          gravePiece: entry.linkEvidence?.gravePieceRaw || graveInfo?.gravePiece,
          graveRow: entry.linkEvidence?.graveRowRaw || graveInfo?.graveRow,
          graveNumber: entry.linkEvidence?.graveNumberRaw || graveInfo?.graveNumber,
          originType: 'bulk_match',
          reviewStatus: 'در صف بررسی کارشناس',
          reviewerNote: '',
          reviewedBy: '',
          reviewedAt: ''
        });
      }
    });

    setLastBulkMatchedList(collectedMatches);
    setPilotProcessedCount(processed);
    setPilotTotalMatchesInScope(collectedMatches.length);
    setPilotFoundCount(newlyAdded);
    setPilotDuplicatePrevented(alreadyPresent);
    setPilotStatus('completed');

    onNotify(
      `جست‌وجوی انبوه انجام شد: ${toPersianDigits(processed)} شهید بررسی شد، مجموعاً ${toPersianDigits(
        collectedMatches.length
      )} کتاب منطبق یافت شد (${toPersianDigits(newlyAdded)} مورد جدید و ${toPersianDigits(
        alreadyPresent
      )} مورد از قبل موجود).`,
      collectedMatches.length > 0 ? 'success' : undefined
    );
  };

  const handleManualAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const targetMartyr = manualMartyrName.trim() || selectedMartyrName.trim() || twoWayQuery.trim() || 'شهید';
    if (!manualTitle.trim() || !manualPublisher.trim()) {
      onNotify('عنوان کتاب و نام ناشر الزامی است.', 'warning');
      return;
    }

    requestActionConfirmation({
      title: 'تأیید نهایی ثبت دستی کتاب در صف بررسی',
      message: `آیا از ثبت کتاب «${manualTitle.trim()}» (ناشر: ${manualPublisher.trim()}) در مورد شهید «${targetMartyr}» اطمینان دارید؟`,
      details: `نویسنده: ${manualAuthor.trim() || '—'} · منبع استناد: ${manualSource}`,
      confirmLabel: 'بله، کتاب ثبت شود',
      variant: 'save',
      onConfirm: () => {
        const nowFa = new Intl.DateTimeFormat('fa-IR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }).format(new Date());

        const newId = generateUniqueSuggestionId(smartSuggestions);
        const mId = generateUniqueMartyrId([
          ...customMartyrs.map((m) => ({ id: m.martyrId })),
          ...smartSuggestions.map((s) => ({ id: s.martyrId }))
        ]);
        const graveInfo = findMartyrGraveIn28k(targetMartyr, golzarMartyrs28k);

        const newSug: SmartSearchSuggestion = {
          id: newId,
          martyrId: mId,
          martyrName: targetMartyr.startsWith('شهید') ? targetMartyr : `شهید ${targetMartyr}`,
          martyrAlternativeNames: generateMartyrNameVariants(targetMartyr, customAltNames),
          bookTitle: manualTitle.trim(),
          authors: manualAuthor.trim() || '—',
          publisher: manualPublisher.trim(),
          publishYear: manualYear.trim() || '',
          editionInfo: 'ثبت دستی مستقیم کارشناس',
          isbn: 'استعلام کارشناس',
          fipa: '—',
          subjectCategory: SUBJECT_CATEGORIES[0].label,
          publisherDescription:
            manualNote.trim() || `کتاب واقعی شناسایی‌شده توسط پژوهشگر از ${manualSource}`,
          sourcePriority: 1,
          sourceName: manualSource,
          sourceUrl: manualUrl.trim(),
          retrievedAt: nowFa,
          matchEvidence: `[تطبیق دقیق — ثبت کارشناس] ثبت دستی مشخصات واقعی توسط پژوهشگر با استناد به پایگاه ${manualSource}.`,
          catalogComparisonStatus: 'کتاب جدید (ثبت دستی کارشناس از منابع بیرونی)',
          gravePiece: graveInfo?.gravePiece,
          graveRow: graveInfo?.graveRow,
          graveNumber: graveInfo?.graveNumber,
          originType: 'manual',
          reviewStatus: 'در صف بررسی کارشناس',
          reviewerNote: manualNote.trim(),
          reviewedBy: 'پژوهشگر مرکز اسناد',
          reviewedAt: nowFa
        };

        onAddSuggestion(newSug);
        setShowManualAddModal(false);
        setManualTitle('');
        setManualPublisher('');
        setManualAuthor('');
        setManualYear('');
        setManualUrl('');
        setManualNote('');
        setHighlightedSuggestionId(newId);
        onNotify(`کتاب «${newSug.bookTitle}» برای «${newSug.martyrName}» در صف بررسی ثبت شد.`, 'success');
      }
    });
  };

  const filteredSuggestions = useMemo(() => {
    return smartSuggestions.filter((s) => {
      if (queueFilter !== 'ALL' && s.reviewStatus !== queueFilter) return false;
      if (queueOriginFilter !== 'ALL') {
        const orig = inferSuggestionOriginLabel(s).code;
        if (orig !== queueOriginFilter) return false;
      }
      if (selectedSourceCode !== 'ALL') {
        const srcMeta = OFFICIAL_SEARCH_SOURCES.find((src) => src.code === selectedSourceCode);
        if (srcMeta && s.sourcePriority !== srcMeta.priority) return false;
      }
      return true;
    });
  }, [smartSuggestions, queueFilter, queueOriginFilter, selectedSourceCode]);

  const queueOriginCounts = useMemo(() => {
    let manual = 0;
    let single = 0;
    let bulk = 0;
    smartSuggestions.forEach((s) => {
      const c = inferSuggestionOriginLabel(s).code;
      if (c === 'manual') manual++;
      else if (c === 'bulk_match') bulk++;
      else single++;
    });
    return { manual, single, bulk };
  }, [smartSuggestions]);

  const handleApproveItem = (sug: SmartSearchSuggestion) => {
    requestActionConfirmation({
      title: 'تأیید نهایی پیشنهاد کتاب و انتقال به پرونده شهید',
      message: `آیا از تأیید نهایی کتاب «${sug.bookTitle}» برای شهید «${sug.martyrName}» (${sug.id}) و افزودن آن به پیوندهای رسمی اطمینان دارید؟`,
      details: `ناشر: ${sug.publisher || '—'} · منبع: ${sug.sourceName}`,
      confirmLabel: 'بله، تأیید نهایی و ثبت در پرونده شود',
      variant: 'approve',
      onConfirm: () => {
        const nowFa = new Intl.DateTimeFormat('fa-IR').format(new Date());
        const graveInfo =
          !sug.gravePiece && golzarMartyrs28k.length > 0
            ? findMartyrGraveIn28k(sug.martyrName, golzarMartyrs28k)
            : null;

        const updated: SmartSearchSuggestion = {
          ...sug,
          reviewStatus: 'تأییدشده و افزوده‌شده به پرونده',
          reviewedBy: 'کارشناس بازبین مرکز اسناد',
          reviewedAt: nowFa,
          reviewerNote: sug.reviewerNote || 'تأیید کارشناس مشخصات کتاب‌شناختی و ارتباط با شهید'
        };

        const newLink: BookMartyrLinkRecord = {
          id: generateUniqueLinkId(links),
          martyrNameRaw: sug.martyrName,
          bookTitleRaw: sug.bookTitle,
          alternativeTitle: '',
          publisherRaw: sug.publisher,
          sourceDescriptionRaw: `${sug.authors} | شابک: ${sug.isbn} | منبع: ${sug.sourceName}${
            sug.sourceUrl ? ` | لینک: ${sug.sourceUrl}` : ''
          }`,
          pageReferenceRaw: '',
          gravePieceRaw: sug.gravePiece || graveInfo?.gravePiece || '',
          graveRowRaw: sug.graveRow || graveInfo?.graveRow || '',
          graveNumberRaw: sug.graveNumber || graveInfo?.graveNumber || '',
          reviewStatus: 'تأییدشده کارشناسی',
          reviewerNote: `تأییدشده از صف جست‌وجوی هوشمند (${sug.id}) — شواهد: ${sug.matchEvidence}`,
          tempBookId: sug.matchedCatalogBookId || `NEW-${sug.id}`,
          sourceFile: sug.sourceName,
          sourceSheet: 'صف جست‌وجوی هوشمند',
          sourceExcelRow: sug.id,
          rawNameInSource: sug.martyrName,
          groupStartRow: '',
          isGroupPhrase: false
        };

        onApproveSuggestionToLinks(updated, newLink);

        const filteredHist = rejectedHistory.filter(
          (h) => !(h.martyrName === sug.martyrName && h.bookTitle === sug.bookTitle)
        );
        setRejectedHistory(filteredHist);
        saveRejectedHistory(filteredHist);
        onNotify(`پیشنهاد «${sug.bookTitle}» برای «${sug.martyrName}» تأیید و به پرونده شهید منتقل گردید.`, 'success');
      }
    });
  };

  const handleConfirmReject = (sug: SmartSearchSuggestion) => {
    if (!rejectReason.trim()) {
      onNotify('ثبت دلیل رد پیشنهاد برای مستندسازی الزامی است.', 'warning');
      return;
    }
    const reason = rejectReason.trim();
    requestActionConfirmation({
      title: 'تأیید نهایی رد پیشنهاد کتاب',
      message: `آیا از رد کردن پیشنهاد کتاب «${sug.bookTitle}» برای «${sug.martyrName}» (${sug.id}) اطمینان دارید؟`,
      details: `دلیل ثبت‌شده: ${reason}`,
      confirmLabel: 'بله، پیشنهاد رد شود',
      variant: 'delete',
      onConfirm: () => {
        const nowFa = new Intl.DateTimeFormat('fa-IR').format(new Date());
        onUpdateSuggestion({
          ...sug,
          reviewStatus: 'ردشده با ثبت دلیل',
          reviewerNote: reason,
          reviewedBy: 'کارشناس بازبین مرکز اسناد',
          reviewedAt: nowFa
        });

        const newHist: RejectedSuggestionHistory = {
          martyrName: sug.martyrName,
          bookTitle: sug.bookTitle,
          catalogBookId: sug.matchedCatalogBookId,
          reason,
          rejectedBy: 'کارشناس بازبین مرکز اسناد',
          rejectedAt: nowFa
        };
        const updatedHistory = [
          newHist,
          ...rejectedHistory.filter(
            (h) => !(h.martyrName === sug.martyrName && h.bookTitle === sug.bookTitle)
          )
        ];
        setRejectedHistory(updatedHistory);
        saveRejectedHistory(updatedHistory);

        setRejectingId(null);
        setRejectReason('');
        onNotify(`پیشنهاد ${sug.id} با ثبت دلیل رد شد.`);
      }
    });
  };

  const handleSaveEditDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDraft) return;
    const draftToSave = { ...editDraft };
    requestActionConfirmation({
      title: 'تأیید نهایی اصلاح مشخصات پیشنهاد',
      message: `آیا از ذخیره تغییرات مشخصات کتاب «${draftToSave.bookTitle}» (${draftToSave.id}) در صف بررسی اطمینان دارید؟`,
      confirmLabel: 'بله، تغییرات ذخیره شود',
      variant: 'save',
      onConfirm: () => {
        onUpdateSuggestion(draftToSave);
        setEditingId(null);
        setEditDraft(null);
        onNotify(`مشخصات پیشنهاد ${draftToSave.id} در صف بررسی اصلاح شد.`);
      }
    });
  };

  const pendingReviewCountInTwoWay = useMemo(
    () => twoWayMatchedBookGroups.filter((g) => g.needsReviewFlag).length,
    [twoWayMatchedBookGroups]
  );

  return (
    <div className="space-y-5 relative">
      {/* کادر راهنمای توضیحی وسط صفحه (تا زمانی که کاربر خودش ببندد باز می‌ماند) */}
      {centeredHelpPopup && (
        <div
          className="fixed inset-0 z-[110] bg-black/35 flex items-center justify-center p-4"
          onClick={() => setCenteredHelpPopup(null)}
        >
          <div
            className="w-full max-w-md bg-[#253247] text-white rounded-2xl p-4 sm:p-5 shadow-2xl border border-slate-600 space-y-2.5 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-600 pb-2">
              <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-amber-300">
                <Info className="w-4 h-4 shrink-0" />
                <span>{centeredHelpPopup.title}</span>
              </div>
              <button
                type="button"
                onClick={() => setCenteredHelpPopup(null)}
                className="px-2 py-0.5 rounded-lg bg-white/15 hover:bg-white/25 text-[11px] font-bold cursor-pointer"
              >
                بستن ✕
              </button>
            </div>
            <p className="text-xs leading-relaxed text-slate-100">{centeredHelpPopup.body}</p>
          </div>
        </div>
      )}

      {/* پنجره سفید وسط صفحه برای پیام‌های فوری هنگام ایستادن روی کادرها (با بسته شدن فوری هنگام اسکرول یا زدن ضربدر) */}
      {hoverHintPopup && !centeredHelpPopup && (
        <div className="fixed inset-0 z-[105] pointer-events-none flex items-center justify-center p-4">
          <div
            onMouseEnter={() => {
              isPointerInsidePopupRef.current = true;
              if (leaveTimerRef.current) {
                window.clearTimeout(leaveTimerRef.current);
                leaveTimerRef.current = null;
              }
            }}
            onMouseLeave={() => {
              isPointerInsidePopupRef.current = false;
              setHoverHintPopup(null);
            }}
            onClick={dismissHoverHint}
            className="pointer-events-auto w-full max-w-md bg-white text-[#253247] rounded-2xl p-4 shadow-2xl border-2 border-[#1F4E79]/30 flex items-start justify-between gap-3 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-start gap-2.5">
              <Info className="w-4 h-4 text-[#1F4E79] shrink-0 mt-0.5" />
              <p className="text-xs sm:text-sm font-bold leading-relaxed text-[#253247]">
                {hoverHintPopup}
              </p>
            </div>
            <button
              type="button"
              onClick={dismissHoverHint}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-rose-100 hover:text-rose-700 text-slate-700 text-xs font-bold shrink-0 cursor-pointer transition-colors"
              aria-label="بستن پیام راهنما"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* بخش اصلی: جست‌وجوی دوطرفه عنوان کتاب و نام شهید */}
      <section className="bg-white border-2 border-[#8C3B2B]/30 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#8C3B2B] shrink-0" />
            <h2 className="text-sm sm:text-base font-bold text-[#8C3B2B]">
              جست‌وجوی دوطرفه عنوان کتاب و نام شهید
            </h2>

            {/* علامت تعجب (!) که راهنمای توضیحی را در وسط صفحه باز می‌کند و تا بستن توسط کاربر باز می‌ماند */}
            <button
              type="button"
              onClick={() =>
                showHelpCentered(
                  'راهنمای جست‌وجوی دوطرفه عنوان کتاب و نام شهید',
                  'اگر «نام شهید» (اولویت اول؛ مانند جعفر جنگروی، محسن وزوایی، ابراهیم هادی) را جست‌وجو کنید، کتاب(های) مرتبط و صفحات مربوطه نمایش داده می‌شود؛ و اگر «عنوان کتاب» (مانند یک محسن عزیز یا یادداشت‌های ناتمام) را جست‌وجو کنید، تمامی شهدای مرتبط با قطعه، ردیف، شماره مزار و شماره صفحه نمایش داده می‌شوند.'
                )
              }
              className="w-5 h-5 rounded-full bg-amber-100 hover:bg-amber-200 text-[#8C3B2B] border border-amber-300 inline-flex items-center justify-center cursor-pointer transition-colors"
              aria-label="راهنمای جست‌وجوی دوطرفه"
            >
              <AlertCircle className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* لینک کلیک‌پذیر (Hyperlink) برای باز کردن پنجره اختصاصی موارد نیازمند بررسی */}
          {sourceStats.needsReviewBooksCount > 0 && (
            <button
              type="button"
              onMouseEnter={() =>
                showHoverHint('کلیک کنید تا فهرست کامل موارد نیازمند بررسی را در یک پنجره ببینید')
              }
              onMouseLeave={handleTargetMouseLeave}
              onClick={() => {
                dismissHoverHint();
                setShowNeedsReviewModal(true);
              }}
              className="px-3 py-1 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-400 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs underline decoration-amber-700/60 underline-offset-4"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-800 shrink-0" />
              <span>
                {toPersianDigits(sourceStats.needsReviewBooksCount)} مورد نیازمند بررسی (مشاهده در پنجره)
              </span>
            </button>
          )}
        </div>

        {/* کادر جست‌وجوی دوطرفه + لیست کشویی منابع با آمار دقیق + دکمه پاک‌سازی */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
          <div className="md:col-span-7 relative">
            <Search className="w-4 h-4 text-[#6E5846] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={twoWayQuery}
              onChange={(e) => {
                setTwoWayQuery(e.target.value);
                if (e.target.value.trim()) {
                  setShowTwoWayListDrawer(true);
                }
              }}
              placeholder="نام شهید (اولویت اول؛ مثلاً: جعفر جنگروی، ابراهیم هادی) یا عنوان کتاب..."
              className="w-full min-h-[44px] pr-10 pl-3 py-2 text-xs sm:text-sm bg-[#FAF5EE] border border-[#D8C7B2] rounded-xl text-[#332218] focus:bg-white focus:outline-none focus:border-[#6B3E26]"
            />
          </div>

          <div className="md:col-span-4">
            <select
              value={twoWaySourceFilter}
              onChange={(e) => {
                const val = e.target.value as
                  | 'all'
                  | 'sooreh'
                  | 'golzar'
                  | 'golzar_single'
                  | 'golzar_multi'
                  | 'needs_review';
                setTwoWaySourceFilter(val);
                setShowTwoWayListDrawer(true);
              }}
              title="انتخاب منبع پژوهشی (تعداد ارتباط = مجموع ردیف‌های شهید؛ تعداد کتاب = عناوین یکتای کتاب)"
              className="w-full min-h-[44px] px-2.5 py-2 text-xs bg-white border border-[#D8C7B2] rounded-xl font-bold text-[#332218]"
            >
              <option value="all">
                همه منابع ({toPersianDigits(sourceStats.allLinksCount)} ارتباط در{' '}
                {toPersianDigits(sourceStats.allBooksCount)} کتاب یکتا)
              </option>
              <option value="needs_review">
                ⚠️ موارد نیازمند بررسی ({toPersianDigits(sourceStats.needsReviewLinksCount)} ارتباط در{' '}
                {toPersianDigits(sourceStats.needsReviewBooksCount)} کتاب)
              </option>
              <option value="sooreh">
                پژوهش سوره مهر ({toPersianDigits(sourceStats.soorehLinksCount)} ارتباط در{' '}
                {toPersianDigits(sourceStats.soorehBooksCount)} کتاب)
              </option>
              <option value="golzar">
                کل اکسل قطعات شهدا ({toPersianDigits(sourceStats.golzarLinksCount)} ارتباط در{' '}
                {toPersianDigits(sourceStats.golzarBooksCount)} کتاب)
              </option>
              <option value="golzar_single">
                قطعات شهدا — شیت یک شهید ({toPersianDigits(sourceStats.golzarSingleLinksCount)} ارتباط در{' '}
                {toPersianDigits(sourceStats.golzarSingleBooksCount)} کتاب)
              </option>
              <option value="golzar_multi">
                قطعات شهدا — شیت چند شهید ({toPersianDigits(sourceStats.golzarMultiLinksCount)} ارتباط در{' '}
                {toPersianDigits(sourceStats.golzarMultiBooksCount)} کتاب چندشهیدی)
              </option>
            </select>
          </div>

          <div className="md:col-span-1 flex items-center">
            <button
              type="button"
              onClick={() => {
                setTwoWayQuery('');
                setTwoWaySourceFilter('all');
              }}
              title="پاک‌سازی جست‌وجوی دوطرفه"
              className="w-full min-h-[44px] px-3 bg-[#FAF5EE] hover:bg-[#F3E9DC] text-[#5C4636] border border-[#D8C7B2] font-bold text-xs rounded-xl flex items-center justify-center cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* نوار کشویی نتیجه مقابله به همراه فرمول شفاف تبدیل تعداد ارتباط به تعداد کتاب یکتا */}
        <div className="border border-[#E6D5C1] rounded-xl overflow-hidden bg-[#FDF8F2]/50">
          <div className="w-full px-3.5 py-2.5 bg-[#FAF5EE] flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
              <button
                type="button"
                onClick={() => setShowTwoWayListDrawer((prev) => !prev)}
                className="text-right cursor-pointer hover:text-[#8C3B2B]"
              >
                نتیجه مقابله:{' '}
                <strong className="text-[#8C3B2B] text-sm">
                  {toPersianDigits(twoWayMatchedBookGroups.length)}
                </strong>{' '}
                عنوان کتاب یکتا (شامل{' '}
                <strong>
                  {toPersianDigits(
                    twoWayMatchedBookGroups.reduce((acc, g) => acc + g.allBookLinks.length, 0)
                  )}
                </strong>{' '}
                ردیف ارتباط شهید)
              </button>

              {pendingReviewCountInTwoWay > 0 && (
                <button
                  type="button"
                  onClick={() => setShowNeedsReviewModal(true)}
                  className="px-2.5 py-0.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-400 text-[11px] font-bold cursor-pointer underline decoration-amber-700/60 underline-offset-2"
                >
                  ⚠️ {toPersianDigits(pendingReviewCountInTwoWay)} مورد نیازمند بررسی (کلیک برای مشاهده)
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowTwoWayListDrawer((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1F4E79] bg-white hover:bg-blue-50 px-2.5 py-1 rounded-lg border border-[#D8C7B2] cursor-pointer"
            >
              <span>
                {showTwoWayListDrawer
                  ? 'بستن فهرست کتاب‌های مقابله‌شده'
                  : 'برای دیدن کتاب‌های مقابله‌شده و شهدای مرتبط کلیک کنید'}
              </span>
              {showTwoWayListDrawer ? (
                <ChevronUp className="w-4 h-4 shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 shrink-0" />
              )}
            </button>
          </div>

          {showTwoWayListDrawer && (
            <div className="p-3 space-y-3 border-t border-[#E6D5C1]">
              {/* توضیح شفاف چرایی تفاوت تعداد ارتباط (۶۳۴) با تعداد کتاب یکتا (۲۶۹) */}
              <div className="bg-blue-50/70 border border-blue-200 rounded-xl px-3 py-2 text-[11px] text-slate-700 flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>راهنمای آمار جدول:</strong> از آنجا که برخی کتاب‌ها «چندشهیدی» هستند (یک کتاب شامل خاطرات چندین شهید است)، مجموع{' '}
                  <strong>{toPersianDigits(sourceStats.allLinksCount)} ارتباط شهید</strong> در قالب{' '}
                  <strong>{toPersianDigits(sourceStats.allBooksCount)} عنوان کتاب یکتا</strong> دسته‌بندی شده‌اند (سوره مهر: {toPersianDigits(sourceStats.soorehBooksCount)} کتاب · قطعات شهدا: {toPersianDigits(sourceStats.golzarBooksCount)} کتاب · نیازمند بررسی در صف: {toPersianDigits(sourceStats.needsReviewBooksCount)} کتاب).
                </span>
              </div>

              {twoWayMatchedBookGroups.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900">
                  هیچ ارتباط ثبت‌شده‌ای با عبارت «{twoWayQuery}» یافت نشد.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 max-h-[540px] overflow-y-auto pr-0.5">
                  {twoWayMatchedBookGroups.slice(0, 35).map((grp) => (
                    <div
                      key={grp.bookKey}
                      className={`border rounded-2xl p-3.5 sm:p-4 space-y-2.5 ${
                        grp.needsReviewFlag
                          ? 'bg-amber-50/50 border-amber-300'
                          : 'bg-[#FDF8F2]/60 border-[#E6D5C1]'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#E6D5C1]/70 pb-2">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {grp.tempBookId && (
                              <span
                                className="font-mono font-bold text-xs bg-[#1F4E79] text-white px-2 py-0.5 rounded-md"
                                dir="ltr"
                              >
                                {grp.tempBookId}
                              </span>
                            )}
                            <h3 className="font-bold text-sm sm:text-base text-slate-900">
                              کتاب «{grp.bookTitle}»
                            </h3>
                            {grp.needsReviewFlag && (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 inline-flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-amber-700" />
                                <span>نیازمند بررسی</span>
                              </span>
                            )}
                            <span className="text-xs font-semibold text-[#8C3B2B] bg-white px-2 py-0.5 rounded-md border border-[#E6D5C1]">
                              ناشر: {grp.publisher}
                            </span>
                          </div>
                          {grp.description && (
                            <div className="text-xs text-slate-700 font-medium">
                              توضیحات کتاب در اکسل مرجع: <strong className="text-slate-900">{grp.description}</strong>
                            </div>
                          )}
                        </div>

                        <span className="text-[11px] font-bold text-[#1F4E79] bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                          {toPersianDigits(grp.allBookLinks.length)} شهید / ارتباط
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-right text-xs border-collapse">
                          <thead>
                            <tr className="bg-white/90 text-slate-600 border-b border-[#E6D5C1]">
                              <th className="py-1.5 px-2 font-bold">نام و نام خانوادگی شهید (اولویت اول)</th>
                              <th className="py-1.5 px-2 font-bold">قطعه</th>
                              <th className="py-1.5 px-2 font-bold">ردیف</th>
                              <th className="py-1.5 px-2 font-bold">شماره</th>
                              <th className="py-1.5 px-2 font-bold">صفحه در کتاب</th>
                              <th className="py-1.5 px-2 font-bold">منشأ ارتباط</th>
                              <th className="py-1.5 px-2 font-bold">وضعیت بررسی</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E6D5C1]/50">
                            {grp.allBookLinks.map((lnk) => {
                              const isHighlighted = grp.matchedMartyrLinkIds.has(lnk.id);
                              const isNeedsReview =
                                lnk.reviewStatus.includes('نیازمند بررسی') ||
                                lnk.sourceSheet === 'صف بررسی کارشناس';
                              return (
                                <tr
                                  key={lnk.id}
                                  className={
                                    isHighlighted
                                      ? 'bg-amber-100/80 font-semibold text-slate-900'
                                      : 'bg-white/70 hover:bg-white text-slate-800'
                                  }
                                >
                                  <td className="py-2 px-2 font-bold text-slate-900">
                                    {lnk.martyrNameRaw}
                                    {lnk.isGroupPhrase && (
                                      <span className="mr-1.5 text-[10px] font-normal px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                                        عبارت گروهی
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 px-2 tabular-nums font-semibold">
                                    {toPersianDigits(lnk.gravePieceRaw || '—')}
                                  </td>
                                  <td className="py-2 px-2 tabular-nums">
                                    {toPersianDigits(lnk.graveRowRaw || '—')}
                                  </td>
                                  <td className="py-2 px-2 tabular-nums">
                                    {toPersianDigits(lnk.graveNumberRaw || '—')}
                                  </td>
                                  <td className="py-2 px-2 font-bold text-[#8C3B2B] tabular-nums">
                                    {toPersianDigits(lnk.pageReferenceRaw || '—')}
                                  </td>
                                  <td className="py-2 px-2 text-[11px] text-slate-600">
                                    {lnk.sourceFile?.includes('لیست کتابهای')
                                      ? 'پژوهش سوره مهر'
                                      : lnk.sourceFile?.includes('قطعات شهدا')
                                      ? `قطعات شهدا (${lnk.sourceSheet})`
                                      : 'مقابله توضیحات اکسل ۹۸۰ کتاب با بانک شهدا'}
                                  </td>
                                  <td className="py-2 px-2">
                                    <span
                                      className={`inline-block text-[10.5px] px-2 py-0.5 rounded-md border ${
                                        isNeedsReview
                                          ? 'bg-amber-100 text-amber-950 border-amber-300 font-bold'
                                          : lnk.reviewStatus.includes('تأیید')
                                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200 font-bold'
                                          : 'bg-blue-50 text-[#1F4E79] border-blue-200 font-bold'
                                      }`}
                                    >
                                      {isNeedsReview ? '⚠️ نیازمند بررسی' : lnk.reviewStatus}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* دو ستون تطبیق هوشمند: ۱. جست‌وجوی تکی + استعلام بیرونی (با فیلد URL) | ۲. جست‌وجوی انبوه */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ستون ۱: جست‌وجوی تطبیقی تکی */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-[#253247] flex items-center gap-2">
              <Search className="w-4 h-4 text-[#1F4E79]" />
              <span>۱. جست‌وجوی تطبیقی در فهرست داخلی کتابخانه و پژوهش‌ها (تکی)</span>
            </h2>

            {/* دکمه راهنمای توضیحی وسط صفحه (تا زمانی که کاربر ببندد باز می‌ماند) */}
            <button
              type="button"
              onClick={() =>
                showHelpCentered(
                  'تفکیک جست‌وجوی خودکار داخلی از درگاه استعلام بیرونی',
                  'دکمه «اجرای تطبیق هوشمند»، نام شهید را در فهرست داخلی ۹۸۰+ کتاب و پیوندهای پژوهشی تطبیق می‌دهد. برای کاوش کتاب‌های خارج از کتابخانه، روی دکمه‌های درگاه بیرونی (گوگل، خانه کتاب، سوره مهر و...) کلیک کنید؛ به‌محض کلیک، کادر بازگشت سریع (همراه با محل درج آدرس اینترنتی URL) باز می‌شود تا کتاب یافت‌شده را ثبت نمایید.'
                )
              }
              className="px-2 py-1 rounded-lg bg-[#F0F5FA] hover:bg-blue-100 text-[#1F4E79] border border-[#1F4E79]/20 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5 shrink-0" />
              <span>راهنمای استعلام</span>
            </button>
          </div>

          <form onSubmit={handleRunSingleMartyrSearch} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-[#253247] mb-1">
                  نام و نام خانوادگی شهید:
                </label>
                <input
                  type="text"
                  value={selectedMartyrName}
                  onChange={(e) => setSelectedMartyrName(e.target.value)}
                  placeholder="مثال: عباس دوران یا محمد ابراهیم همت"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-1 focus:ring-[#1F4E79] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#253247] mb-1">
                  نام‌های جایگزین / شهرت (اختیاری):
                </label>
                <input
                  type="text"
                  value={customAltNames}
                  onChange={(e) => setCustomAltNames(e.target.value)}
                  placeholder="مثال: حاج ابراهیم همت، سردار همت"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-1 focus:ring-[#1F4E79] focus:outline-none"
                />
              </div>
            </div>

            {computedVariants.length > 0 && (
              <div className="bg-[#EAF1F7]/60 rounded-lg px-2.5 py-1.5 text-[11px] flex flex-wrap items-center gap-1.5 text-[#253247]">
                <span className="font-bold text-[#1F4E79]">اشکال نوشتاری جست‌وجو:</span>
                <span>{computedVariants.join(' · ')}</span>
              </div>
            )}

            {/* درگاه‌های استعلام بیرونی (ترازبندی متناسب در ۳ ردیف هم‌اندازه با پالت یکدست کرم/قهوه‌ای) */}
            <div className="bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl p-3 space-y-2">
              <div className="text-xs font-bold text-[#6B3E26] flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-[#6B3E26] shrink-0" />
                <span>
                  درگاه‌های استعلام بیرونی برای «{selectedMartyrName || twoWayQuery || 'شهید'}»:
                </span>
              </div>

              <div className="space-y-1.5 text-[11px]">
                {/* خط ۱: دو درگاه اصلی کتاب (خانه کتاب و سوره مهر) هم‌اندازه کنار هم */}
                <div className="grid grid-cols-2 gap-1.5">
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(
                      'site:ketab.ir "' + (selectedMartyrName || twoWayQuery) + '"'
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleExternalPortalClick('خانه کتاب (از طریق گوگل)')}
                    className="w-full min-h-[34px] px-2 py-1.5 bg-white hover:bg-[#F3E9DC] text-[#332218] border border-[#D8C7B2] rounded-lg inline-flex items-center justify-center gap-1 font-bold text-center transition-colors"
                  >
                    <ExternalLink className="w-3 h-3 text-[#6B3E26] shrink-0" />
                    <span className="truncate">خانه کتاب (بدون فیلترشکن)</span>
                  </a>

                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(
                      'site:sooremehr.ir "' + (selectedMartyrName || twoWayQuery) + '"'
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleExternalPortalClick('سوره مهر (از طریق گوگل)')}
                    className="w-full min-h-[34px] px-2 py-1.5 bg-white hover:bg-[#F3E9DC] text-[#332218] border border-[#D8C7B2] rounded-lg inline-flex items-center justify-center gap-1 font-bold text-center transition-colors"
                  >
                    <ExternalLink className="w-3 h-3 text-[#6B3E26] shrink-0" />
                    <span className="truncate">سوره مهر (بدون فیلترشکن)</span>
                  </a>
                </div>

                {/* خط ۲: گوگل، کتابخانه ملی و ۱۸ انتشارات دفاع مقدس در یک ردیف ۳ ستونه متناسب */}
                <div className="grid grid-cols-3 gap-1.5">
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(
                      'کتاب "شهید ' + (selectedMartyrName || twoWayQuery) + '"'
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleExternalPortalClick('گوگل (جست‌وجوی کتاب شهید)')}
                    className="w-full min-h-[34px] px-2 py-1.5 bg-white hover:bg-[#F3E9DC] text-[#332218] border border-[#D8C7B2] rounded-lg inline-flex items-center justify-center gap-1 font-bold text-center transition-colors"
                  >
                    <ExternalLink className="w-3 h-3 text-[#6B3E26] shrink-0" />
                    <span className="truncate">گوگل</span>
                  </a>

                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(
                      'site:nlai.ir "' + (selectedMartyrName || twoWayQuery) + '"'
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleExternalPortalClick('کتابخانه ملی (از طریق گوگل)')}
                    className="w-full min-h-[34px] px-2 py-1.5 bg-white hover:bg-[#F3E9DC] text-[#332218] border border-[#D8C7B2] rounded-lg inline-flex items-center justify-center gap-1 font-bold text-center transition-colors"
                  >
                    <ExternalLink className="w-3 h-3 text-[#6B3E26] shrink-0" />
                    <span className="truncate">کتابخانه ملی</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => setShowPublishersModal(true)}
                    className="w-full min-h-[34px] px-2 py-1.5 bg-white hover:bg-[#F3E9DC] text-[#6B3E26] border border-[#D8C7B2] rounded-lg inline-flex items-center justify-center gap-1 font-bold text-center cursor-pointer transition-colors"
                  >
                    <Building2 className="w-3.5 h-3.5 text-[#6B3E26] shrink-0" />
                    <span className="truncate">۱۸ انتشارات دفاع مقدس</span>
                  </button>
                </div>

                {/* خط ۳: چهار پایگاه مقالات و مجلات (پایگاه نور، مگیران، نورمگز، سیویلیکا) کشیده و هم‌تراز در یک خط */}
                <div className="grid grid-cols-4 gap-1.5">
                  <a
                    href={`https://www.noorlib.ir/fa/search?q=${encodeURIComponent(
                      selectedMartyrName || twoWayQuery
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleExternalPortalClick('پایگاه نور (NoorLib)')}
                    className="w-full min-h-[34px] px-1.5 py-1.5 bg-white hover:bg-[#F3E9DC] text-[#332218] border border-[#D8C7B2] rounded-lg inline-flex items-center justify-center gap-1 font-semibold text-center transition-colors"
                  >
                    <ExternalLink className="w-3 h-3 text-[#6B3E26] shrink-0" />
                    <span className="truncate">پایگاه نور</span>
                  </a>

                  <a
                    href={`https://www.magiran.com/search?q=${encodeURIComponent(
                      'شهید ' + (selectedMartyrName || twoWayQuery)
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleExternalPortalClick('مگیران (Magiran)')}
                    className="w-full min-h-[34px] px-1.5 py-1.5 bg-white hover:bg-[#F3E9DC] text-[#332218] border border-[#D8C7B2] rounded-lg inline-flex items-center justify-center gap-1 font-semibold text-center transition-colors"
                  >
                    <Newspaper className="w-3 h-3 text-[#6B3E26] shrink-0" />
                    <span className="truncate">مگیران</span>
                  </a>

                  <a
                    href={`https://www.noormags.ir/view/fa/search?q=${encodeURIComponent(
                      'شهید ' + (selectedMartyrName || twoWayQuery)
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleExternalPortalClick('نورمگز (NoorMags)')}
                    className="w-full min-h-[34px] px-1.5 py-1.5 bg-white hover:bg-[#F3E9DC] text-[#332218] border border-[#D8C7B2] rounded-lg inline-flex items-center justify-center gap-1 font-semibold text-center transition-colors"
                  >
                    <Newspaper className="w-3 h-3 text-[#6B3E26] shrink-0" />
                    <span className="truncate">نورمگز</span>
                  </a>

                  <a
                    href={`https://civilica.com/search/paper/k-${encodeURIComponent(
                      'شهید ' + (selectedMartyrName || twoWayQuery)
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleExternalPortalClick('سیویلیکا (Civilica)')}
                    className="w-full min-h-[34px] px-1.5 py-1.5 bg-white hover:bg-[#F3E9DC] text-[#332218] border border-[#D8C7B2] rounded-lg inline-flex items-center justify-center gap-1 font-semibold text-center transition-colors"
                  >
                    <Newspaper className="w-3 h-3 text-[#6B3E26] shrink-0" />
                    <span className="truncate">سیویلیکا</span>
                  </a>
                </div>
              </div>

              {/* کادر هوشمند بازگشت از استعلام بیرونی: شامل عنوان کتاب، ناشر و آدرس اینترنتی (URL) */}
              {activeExternalInquiry && (
                <div className="bg-amber-50/95 border-2 border-amber-300 rounded-xl p-3 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-amber-950">
                      ثبت سریع کتاب یافت‌شده در «{activeExternalInquiry.portalName}» برای «{activeExternalInquiry.martyrName}»:
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveExternalInquiry(null)}
                      className="text-[11px] text-slate-600 hover:text-slate-900 px-2 py-0.5 rounded bg-white border border-slate-300 cursor-pointer"
                    >
                      بستن
                    </button>
                  </div>

                  {/* ردیف ۱: عنوان کتاب و ناشر */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-7 flex gap-1">
                      <input
                        type="text"
                        value={quickReturnBookTitle}
                        onChange={(e) => setQuickReturnBookTitle(e.target.value)}
                        placeholder="عنوان کتاب یافت‌شده (مثلاً: شبیه افسانه)..."
                        className="flex-1 px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-xs"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const txt = await navigator.clipboard.readText();
                            if (txt) setQuickReturnBookTitle(txt.trim());
                          } catch {
                            onNotify('متن کپی‌شده را با نگه داشتن دست (Paste) در کادر بچسبانید.', 'warning');
                          }
                        }}
                        title="چسباندن عنوان کتاب از حافظه کپی (Paste)"
                        className="px-2.5 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg inline-flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <ClipboardPaste className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold">چسباندن</span>
                      </button>
                    </div>
                    <div className="sm:col-span-5">
                      <input
                        type="text"
                        value={quickReturnPublisher}
                        onChange={(e) => setQuickReturnPublisher(e.target.value)}
                        placeholder="ناشر (مثلاً: سوره مهر، روایت فتح، کتابراه...)"
                        className="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  {/* ردیف ۲: آدرس اینترنتی صفحه کتاب (URL) زیر ناشر + دکمه ثبت فوری */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-8 flex gap-1">
                      <div className="relative flex-1">
                        <Link2 className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="url"
                          dir="ltr"
                          value={quickReturnUrl}
                          onChange={(e) => setQuickReturnUrl(e.target.value)}
                          placeholder="https://... آدرس اینترنتی صفحه کتاب (URL)"
                          className="w-full pr-8 pl-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-mono text-left"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const txt = await navigator.clipboard.readText();
                            if (txt) setQuickReturnUrl(txt.trim());
                          } catch {
                            onNotify('آدرس اینترنتی کپی‌شده را در کادر URL بچسبانید.', 'warning');
                          }
                        }}
                        title="چسباندن آدرس اینترنتی (URL) از حافظه کپی"
                        className="px-2.5 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg inline-flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <ClipboardPaste className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold">لینک</span>
                      </button>
                    </div>

                    <div className="sm:col-span-4">
                      <button
                        type="button"
                        onClick={handleQuickReturnRegister}
                        className="w-full h-full min-h-[34px] px-3 py-1.5 bg-[#2E7D5B] hover:bg-[#236347] text-white font-bold rounded-lg inline-flex items-center justify-center gap-1 cursor-pointer shadow-2xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>ثبت فوری برای شهید</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const target = selectedMartyrName.trim() || twoWayQuery.trim();
                  setActiveExternalInquiry({
                    martyrName: target || 'شهید',
                    portalName: 'ثبت مستقیم از استعلام بیرونی',
                    openedAt: ''
                  });
                }}
                className="w-full min-h-[38px] px-3 py-2 rounded-xl bg-[#FAF5EE] hover:bg-[#F3E9DC] text-[#6B3E26] border border-[#D8C7B2] text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>کتابی در گوگل پیدا کردید؟ باز کردن کادر ثبت سریع و لینک (URL)</span>
              </button>

              <button
                type="submit"
                className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-[#6B3E26] hover:bg-[#56311E] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-colors"
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>اجرای تطبیق هوشمند و افزودن به صف بررسی کارشناس</span>
              </button>
            </div>
          </form>
        </div>

        {/* ستون ۲: جست‌وجوی انبوه و تطبیق دسته‌ای نام شهدا (شفاف‌سازی آمار ۲۸٬۳۶۸ شهید + پنجره کلیک‌پذیر کتاب‌های منطبق) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3.5 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-[#6B3E26]" />
                <h2 className="text-sm font-bold text-[#332218]">
                  ۲. جست‌وجوی انبوه و تطبیق دسته‌ای نام شهدا
                </h2>
                <button
                  type="button"
                  onClick={() =>
                    showHelpCentered(
                      'توضیح آمار بانک ۲۸٬۳۶۸ شهید و نحوه کارکرد تطبیق انبوه',
                      `بانک جامع گلزار شهدا شامل ۲۸٬۳۶۸ رکورد است که از این میان ۲۴٬۸۵۹ رکورد دارای نام و نام خانوادگی کامل و مشخص هستند (و ۳٬۵۰۹ رکورد مربوط به مزار شهدای گمنام یا یادبود بدون نام خانوادگی است). با زدن دکمه «اجرای تطبیق انبوه»، نام این شهدا با عنوان و توضیحات تمام کتاب‌های کتابخانه مقایسه می‌شود و با کلیک روی عدد «کل کتاب‌های منطبق در این محدوده» می‌توانید فهرست کامل آن‌ها را در یک پنجره مستقل ببینید.`
                    )
                  }
                  className="w-5 h-5 rounded-full bg-[#FAF5EE] hover:bg-[#F3E9DC] text-[#6B3E26] border border-[#D8C7B2] inline-flex items-center justify-center cursor-pointer"
                  aria-label="راهنمای تطبیق انبوه"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </div>
              <span className="text-[11px] font-bold text-[#6B3E26] tabular-nums">
                کل بانک: {toPersianDigits(totalGolzarRecords)} شهید
              </span>
            </div>

            {/* انتخاب‌گر حالت ورودی */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setBulkInputMode('system')}
                className={`py-1.5 px-2 rounded-lg transition-colors cursor-pointer ${
                  bulkInputMode === 'system'
                    ? 'bg-[#6B3E26] text-white shadow-xs font-bold'
                    : 'text-[#5C4636] hover:text-[#332218]'
                }`}
              >
                بانک شهدا ({toPersianDigits(totalGolzarRecords)})
              </button>
              <button
                type="button"
                onClick={() => setBulkInputMode('text')}
                className={`py-1.5 px-2 rounded-lg transition-colors cursor-pointer ${
                  bulkInputMode === 'text'
                    ? 'bg-[#6B3E26] text-white shadow-xs font-bold'
                    : 'text-[#5C4636] hover:text-[#332218]'
                }`}
              >
                ورود متنی اسامی
              </button>
              <button
                type="button"
                onClick={() => setBulkInputMode('excel')}
                className={`py-1.5 px-2 rounded-lg transition-colors cursor-pointer ${
                  bulkInputMode === 'excel'
                    ? 'bg-[#6B3E26] text-white shadow-xs font-bold'
                    : 'text-[#5C4636] hover:text-[#332218]'
                }`}
              >
                بارگذاری اکسل
              </button>
            </div>

            {bulkInputMode === 'system' && (
              <div className="p-3 bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl text-xs text-[#332218] space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="font-bold text-xs text-[#6B3E26]">
                    انتخاب محدوده شهدا برای تطبیق با کتاب‌ها:
                  </label>
                  {onNavigateTab && (
                    <button
                      type="button"
                      onClick={() => onNavigateTab('martyrs')}
                      className="px-2 py-1 rounded-lg bg-white hover:bg-[#F3E9DC] text-[#6B3E26] border border-[#D8C7B2] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>ورود به صفحه شهدا</span>
                    </button>
                  )}
                </div>

                <select
                  value={bulkSystemScope}
                  onChange={(e) => setBulkSystemScope(e.target.value)}
                  className="w-full px-2.5 py-2 bg-white border border-[#D8C7B2] rounded-xl text-xs font-bold text-[#332218]"
                >
                  <option value="all_28k">
                    کل بانک ۲۸٬۳۶۸ شهید گلزار ({toPersianDigits(golzarMartyrs28k.length || 24859)} شهید دارای نام کامل + ۳٬۵۰۹ گمنام)
                  </option>
                  <option value="piece_24">شهدای قطعه ۲۴ گلزار شهدا</option>
                  <option value="piece_26">شهدای قطعه ۲۶ گلزار شهدا</option>
                  <option value="piece_27">شهدای قطعه ۲۷ گلزار شهدا</option>
                  <option value="piece_28">شهدای قطعه ۲۸ گلزار شهدا</option>
                  <option value="piece_29">شهدای قطعه ۲۹ گلزار شهدا</option>
                  <option value="piece_40">شهدای قطعه ۴۰ گلزار شهدا</option>
                  <option value="piece_44">شهدای قطعه ۴۴ گلزار شهدا</option>
                  <option value="piece_53">شهدای قطعه ۵۳ گلزار شهدا</option>
                  <option value="custom_only">
                    فقط پرونده‌های ثبت دستی در صفحه شهدا ({toPersianDigits(customMartyrs.length)} پرونده)
                  </option>
                </select>
              </div>
            )}

            {bulkInputMode === 'text' && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  نام شهدا را وارد یا چسبانده (هر نام در یک خط یا با ویرگول):
                </label>
                <textarea
                  rows={3}
                  value={bulkTextNames}
                  onChange={(e) => setBulkTextNames(e.target.value)}
                  placeholder="مثال:&#10;محمد ابراهیم همت&#10;عباس دوران&#10;ابراهیم هادی"
                  className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-xl focus:ring-1 focus:ring-[#1F4E79] focus:outline-none"
                />
              </div>
            )}

            {bulkInputMode === 'excel' && (
              <div className="space-y-2">
                <label className="flex flex-col items-center justify-center p-3.5 border-2 border-dashed border-slate-300 hover:border-[#1F4E79] rounded-xl cursor-pointer bg-slate-50/70 hover:bg-blue-50/40 transition-colors">
                  <Upload className="w-5 h-5 text-[#1F4E79] mb-1" />
                  <span className="text-xs font-bold text-slate-800">
                    انتخاب فایل اکسل حاوی نام شهدا (.xlsx, .xls, .csv)
                  </span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleBulkExcelUpload}
                    className="hidden"
                  />
                </label>

                {bulkLoadedFileName && (
                  <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center justify-between">
                    <span className="font-semibold truncate">✓ فایل: {bulkLoadedFileName}</span>
                    <span className="font-bold font-mono">
                      {toPersianDigits(bulkLoadedNames.length)} شهید آماده
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* کادر آمار تطبیق انبوه (با قابلیت کلیک مستقیم روی تعداد کتاب‌های منطبق برای باز شدن پنجره فهرست آن‌ها) */}
            <div className="grid grid-cols-3 gap-2 text-center bg-[#F5F7FA] p-2.5 rounded-xl text-xs border border-slate-200">
              <div>
                <div className="text-[#697586] text-[10.5px]">شهید بررسی‌شده</div>
                <div className="font-bold text-[#253247] tabular-nums mt-0.5">
                  {toPersianDigits(pilotProcessedCount)} نفر
                </div>
              </div>

              <button
                type="button"
                onMouseEnter={() =>
                  showHoverHint(
                    'کلیک کنید تا فهرست کامل کتاب‌های منطبق در این محدوده را در یک پنجره ببینید'
                  )
                }
                onMouseLeave={handleTargetMouseLeave}
                onClick={() => {
                  dismissHoverHint();
                  if (lastBulkMatchedList.length === 0) {
                    const pieceFilter = bulkSystemScope.startsWith('piece_')
                      ? bulkSystemScope.replace('piece_', '')
                      : '';
                    const autoMatches =
                      bulkSystemScope === 'custom_only'
                        ? runFastCrossMatchBooksAnd28kMartyrs(allUnifiedBooks, [], customMartyrs, [])
                        : runFastCrossMatchBooksAnd28kMartyrs(
                            allUnifiedBooks,
                            golzarMartyrs28k,
                            customMartyrs,
                            validResearchLinks,
                            pieceFilter
                          );
                    setLastBulkMatchedList(autoMatches);
                    setPilotTotalMatchesInScope(autoMatches.length);
                  }
                  setShowBulkMatchesModal(true);
                }}
                className="rounded-lg p-1 transition-colors bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 cursor-pointer"
              >
                <div className="text-[#2E7D5B] text-[10.5px] font-bold">
                  کل کتاب منطبق (مشاهده 👁️)
                </div>
                <div className="font-bold text-[#2E7D5B] tabular-nums mt-0.5 underline decoration-emerald-600/60">
                  {toPersianDigits(pilotTotalMatchesInScope)} مورد ({toPersianDigits(pilotFoundCount)} جدید)
                </div>
              </button>

              <div>
                <div className="text-[#697586] text-[10.5px]">از قبل در صف/پرونده</div>
                <div className="font-bold text-[#C58A2B] tabular-nums mt-0.5">
                  {toPersianDigits(pilotDuplicatePrevented)} مورد
                </div>
              </div>
            </div>

            {lastBulkMatchedList.length > 0 && (
              <button
                type="button"
                onMouseEnter={() =>
                  showHoverHint(
                    'کلیک کنید تا فهرست کامل کتاب‌های منطبق در این محدوده را در یک پنجره ببینید'
                  )
                }
                onMouseLeave={handleTargetMouseLeave}
                onClick={() => {
                  dismissHoverHint();
                  setShowBulkMatchesModal(true);
                }}
                className="w-full py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border border-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <Eye className="w-4 h-4 text-emerald-700" />
                <span>
                  مشاهده فهرست کامل {toPersianDigits(lastBulkMatchedList.length)} کتاب تطبیق‌یافته در این محدوده ({toPersianDigits(pilotFoundCount)} افزوده‌شده جدید)
                </span>
              </button>
            )}
          </div>

          {/* دکمه اجرای تطبیق انبوه و بازنشانی در یک خط کنار هم (هم در گوشی و هم در لپ‌تاپ) */}
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handleRunBulkMartyrSearch}
              disabled={pilotStatus === 'running'}
              className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-[#2E7D5B] hover:bg-[#246348] disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <Play className="w-4 h-4 shrink-0" />
              <span className="truncate">
                {pilotStatus === 'running'
                  ? 'در حال مقابله با کتاب‌ها...'
                  : `اجرای تطبیق انبوه با ${toPersianDigits(allUnifiedBooks.length)} کتاب مرجع`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPilotStatus('idle');
                setPilotProcessedCount(0);
                setPilotTotalMatchesInScope(0);
                setPilotFoundCount(0);
                setPilotDuplicatePrevented(0);
                setLastBulkMatchedList([]);
                setBulkLoadedNames([]);
                setBulkLoadedFileName('');
                setBulkTextNames('');
                onNotify('شمارنده‌ها و لیست جست‌وجوی انبوه بازنشانی شدند.');
              }}
              className="shrink-0 min-h-[40px] px-3 py-2 rounded-xl bg-[#FAF5EE] hover:bg-[#F3E9DC] text-[#5C4636] border border-[#D8C7B2] text-xs font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>بازنشانی</span>
            </button>
          </div>
        </div>
      </section>

      {/* نتیجه تعاملی جست‌وجوی تکی (بخش ۱) */}
      {lastSearchFeedback && (
        <div
          className={`rounded-2xl p-4 border transition-all shadow-xs ${
            lastSearchFeedback.status === 'matched_catalog'
              ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
              : lastSearchFeedback.status === 'already_in_queue'
              ? 'bg-amber-50/90 border-amber-300 text-amber-950'
              : lastSearchFeedback.status === 'not_found'
              ? 'bg-rose-50/90 border-rose-200 text-rose-950'
              : 'bg-sky-50/90 border-sky-300 text-sky-950'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {lastSearchFeedback.status === 'matched_catalog' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : lastSearchFeedback.status === 'already_in_queue' ? (
                  <Info className="w-5 h-5 text-amber-600 shrink-0" />
                ) : lastSearchFeedback.status === 'not_found' ? (
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                ) : (
                  <Sparkles className="w-5 h-5 text-sky-600 shrink-0" />
                )}
                <h3 className="font-bold text-sm">
                  نتیجه جست‌وجوی تکی برای «{lastSearchFeedback.targetName}»:
                </h3>
              </div>
              <p className="text-xs leading-relaxed pr-7">{lastSearchFeedback.message}</p>
            </div>

            <div className="shrink-0 flex flex-wrap items-center gap-2">
              {lastSearchFeedback.status === 'not_found' ? (
                <button
                  type="button"
                  onClick={() => {
                    setManualMartyrName(lastSearchFeedback.targetName || selectedMartyrName || twoWayQuery);
                    setManualTitle('');
                    setManualPublisher('');
                    setManualAuthor('');
                    setManualYear('');
                    setManualUrl('');
                    setManualNote(`کشف‌شده در بررسی بیرونی برای شهید ${lastSearchFeedback.targetName}`);
                    setShowManualAddModal(true);
                  }}
                  className="px-3.5 py-2 bg-[#1F4E79] hover:bg-[#163a5b] text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>ثبت دستی کتاب جدید</span>
                </button>
              ) : lastSearchFeedback.suggestionId ? (
                <button
                  type="button"
                  onClick={() => {
                    const targetEl = document.getElementById(`suggestion-${lastSearchFeedback.suggestionId}`);
                    if (targetEl) {
                      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      setHighlightedSuggestionId(lastSearchFeedback.suggestionId);
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white inline-flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                >
                  <ArrowDown className="w-4 h-4" />
                  <span>مشاهده در صف بررسی کارشناس</span>
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => setLastSearchFeedback(null)}
                className="px-2.5 py-2 rounded-xl text-xs font-bold bg-white/80 hover:bg-white text-slate-700 border border-slate-300 cursor-pointer"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* صف بررسی کارشناس (چیدمان متراز، یکسان‌سازی پالت رنگی کرم/قهوه‌ای و کارت‌های منظم) */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3.5">
        <div className="space-y-2.5 border-b border-slate-200 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-[#332218]">
                صف بررسی کارشناس ({toPersianDigits(filteredSuggestions.length)} از {toPersianDigits(smartSuggestions.length)} پیشنهاد)
              </h2>

              <button
                type="button"
                onClick={() =>
                  showHelpCentered(
                    'منشأ پیشنهادهای موجود در صف بررسی کارشناس چیست؟',
                    `پیشنهادهای این صف از ۳ مسیر وارد می‌شوند که روی هر کارت مشخص شده است: ۱) «ثبت دستی کارشناس / استعلام گوگل» (${toPersianDigits(
                      queueOriginCounts.manual
                    )} مورد)، ۲) «جست‌وجوی تکی نام شهید» (${toPersianDigits(
                      queueOriginCounts.single
                    )} مورد)، و ۳) «تطبیق انبوه خودکار توضیحات ۹۸۰ کتاب با بانک ۲۸٬۳۶۸ شهید» (${toPersianDigits(
                      queueOriginCounts.bulk
                    )} مورد، مانند کتاب‌های ماه در محاق، آفتاب کویر یا فرمانده دل که نام شهید در ستون توضیحات اکسل کتابخانه ذکر شده است).`
                  )
                }
                className="w-5 h-5 rounded-full bg-[#FAF5EE] hover:bg-[#F3E9DC] text-[#6B3E26] border border-[#D8C7B2] inline-flex items-center justify-center cursor-pointer"
                aria-label="راهنمای صف بررسی کارشناس"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* دکمه‌های عملیاتی صف در یک ردیف متناسب و تراز */}
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 w-full sm:w-auto text-xs">
              <button
                type="button"
                onMouseEnter={() =>
                  showHoverHint(
                    'همگام‌سازی صف بررسی با پرونده‌های موجود و حذف خودکار سوابق تستی یا نامعتبر'
                  )
                }
                onMouseLeave={handleTargetMouseLeave}
                onClick={() => {
                  dismissHoverHint();
                  handleSyncAndPurgeOrphans();
                }}
                className="min-h-[36px] px-2.5 py-1.5 bg-[#FAF5EE] hover:bg-[#F3E9DC] text-[#5C4636] border border-[#D8C7B2] rounded-xl font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#8C3B2B] shrink-0" />
                <span className="truncate">همگام‌سازی سوابق</span>
              </button>

              {smartSuggestions.length > 0 && onClearAllSuggestions && (
                <button
                  type="button"
                  onMouseEnter={() =>
                    showHoverHint(
                      'پاک‌سازی کامل صف بررسی و صفر کردن همه پیشنهادهای موجود در صف'
                    )
                  }
                  onMouseLeave={handleTargetMouseLeave}
                  onClick={() => {
                    dismissHoverHint();
                    requestActionConfirmation({
                      title: 'تأیید نهایی پاک‌سازی کامل صف بررسی',
                      message: `آیا از حذف کامل تمام ${toPersianDigits(smartSuggestions.length)} پیشنهاد موجود در صف بررسی کارشناس اطمینان دارید؟`,
                      details: 'هشدار: با این کار تمامی پیشنهادهای صف بررسی از لیست خارج می‌شوند (ارتباطات قبلاً تأییدشده در پرونده شهدا حفظ می‌گردند).',
                      confirmLabel: 'بله، کل صف پاک‌سازی شود',
                      variant: 'delete',
                      onConfirm: () => {
                        onClearAllSuggestions();
                        setLastSearchFeedback(null);
                        setHighlightedSuggestionId(null);
                        onNotify('صف بررسی کارشناس کاملاً پاک‌سازی و صفر گردید.');
                      }
                    });
                  }}
                  className="min-h-[36px] px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span className="truncate">پاک‌سازی صف ({toPersianDigits(smartSuggestions.length)})</span>
                </button>
              )}

              <button
                type="button"
                onMouseEnter={() =>
                  showHoverHint(
                    'ثبت دستی کتاب جدید در مورد شهید انتخاب‌شده یا نوشته‌شده و افزودن به صف بررسی کارشناس'
                  )
                }
                onMouseLeave={handleTargetMouseLeave}
                onClick={() => {
                  dismissHoverHint();
                  setManualMartyrName(selectedMartyrName.trim() || twoWayQuery.trim() || '');
                  setManualTitle('');
                  setManualPublisher('');
                  setManualAuthor('');
                  setManualYear('');
                  setManualUrl('');
                  setManualNote('');
                  setShowManualAddModal(true);
                }}
                className="col-span-2 sm:col-span-1 min-h-[36px] px-3 py-1.5 bg-[#6B3E26] hover:bg-[#56311E] text-white rounded-xl font-bold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span className="truncate">ثبت دستی کتاب جدید</span>
              </button>
            </div>
          </div>

          {/* دو منوی کشویی فیلتر وضعیت و منبع در یک خط کنار هم (هم در موبایل و هم در سیستم) */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <select
              value={queueFilter}
              onChange={(e) =>
                setQueueFilter(e.target.value as 'ALL' | SmartSuggestionReviewStatus)
              }
              title="فیلتر پیشنهادهای صف بر اساس وضعیت بررسی"
              className="w-full min-h-[36px] px-2.5 py-1.5 rounded-xl border border-[#D8C7B2] bg-[#FAF5EE] text-[#332218] font-bold cursor-pointer truncate"
            >
              <option value="ALL">همه وضعیت‌های صف ({toPersianDigits(smartSuggestions.length)})</option>
              <option value="در صف بررسی کارشناس">در صف بررسی کارشناس (نیازمند بررسی)</option>
              <option value="تأییدشده و افزوده‌شده به پرونده">تأییدشده و افزوده‌شده به پرونده</option>
              <option value="ردشده با ثبت دلیل">ردشده با ثبت دلیل</option>
            </select>

            <select
              value={selectedSourceCode}
              onChange={(e) => setSelectedSourceCode(e.target.value)}
              title="فیلتر بر اساس منبع و اولویت اعتبار"
              className="w-full min-h-[36px] px-2.5 py-1.5 rounded-xl border border-[#D8C7B2] bg-[#FAF5EE] text-[#332218] font-bold cursor-pointer truncate"
            >
              <option value="ALL">همه منابع (اولویت ۱ تا ۵)</option>
              {OFFICIAL_SEARCH_SOURCES.map((s) => (
                <option key={s.code} value={s.code}>
                  اولویت {toPersianDigits(s.priority)}: {s.name.slice(0, 30)}...
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* نوار تفکیک منشأ پیشنهادها (تراز در ۲ ستون مساوی روی موبایل و ۴ ستون مساوی روی دسکتاپ با رنگ یکدست کرم/قهوه‌ای) */}
        {smartSuggestions.length > 0 && (
          <div className="bg-[#FAF5EE] p-2.5 rounded-xl border border-[#E2D2BE] space-y-1.5 text-xs">
            <div className="font-bold text-[#6B3E26] text-[11px]">
              فیلتر بر اساس منشأ ورود به صف:
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => setQueueOriginFilter('ALL')}
                className={`w-full min-h-[34px] px-2 py-1.5 rounded-lg font-bold cursor-pointer transition-colors text-center truncate ${
                  queueOriginFilter === 'ALL'
                    ? 'bg-[#6B3E26] text-white border border-[#6B3E26]'
                    : 'bg-white text-[#332218] border border-[#D8C7B2] hover:bg-[#F3E9DC]'
                }`}
              >
                همه ({toPersianDigits(smartSuggestions.length)})
              </button>
              <button
                type="button"
                onClick={() => setQueueOriginFilter('manual')}
                className={`w-full min-h-[34px] px-2 py-1.5 rounded-lg font-bold cursor-pointer transition-colors text-center truncate ${
                  queueOriginFilter === 'manual'
                    ? 'bg-[#6B3E26] text-white border border-[#6B3E26]'
                    : 'bg-white text-[#332218] border border-[#D8C7B2] hover:bg-[#F3E9DC]'
                }`}
              >
                ثبت دستی و گوگل ({toPersianDigits(queueOriginCounts.manual)})
              </button>
              <button
                type="button"
                onClick={() => setQueueOriginFilter('single_search')}
                className={`w-full min-h-[34px] px-2 py-1.5 rounded-lg font-bold cursor-pointer transition-colors text-center truncate ${
                  queueOriginFilter === 'single_search'
                    ? 'bg-[#6B3E26] text-white border border-[#6B3E26]'
                    : 'bg-white text-[#332218] border border-[#D8C7B2] hover:bg-[#F3E9DC]'
                }`}
              >
                جست‌وجوی تکی شهید ({toPersianDigits(queueOriginCounts.single)})
              </button>
              <button
                type="button"
                onClick={() => setQueueOriginFilter('bulk_match')}
                className={`w-full min-h-[34px] px-2 py-1.5 rounded-lg font-bold cursor-pointer transition-colors text-center truncate ${
                  queueOriginFilter === 'bulk_match'
                    ? 'bg-[#6B3E26] text-white border border-[#6B3E26]'
                    : 'bg-white text-[#332218] border border-[#D8C7B2] hover:bg-[#F3E9DC]'
                }`}
              >
                تطبیق انبوه خودکار ({toPersianDigits(queueOriginCounts.bulk)})
              </button>
            </div>
          </div>
        )}

        {filteredSuggestions.length === 0 ? (
          <div className="bg-[#FAF5EE]/60 border border-dashed border-[#D8C7B2] rounded-2xl p-6 sm:p-8 text-center text-[#5C4636] space-y-2">
            <CheckCircle2 className="w-8 h-8 text-[#8C3B2B]/60 mx-auto" />
            <div className="font-bold text-sm text-[#332218]">
              پیشنهادی در این فیلتر وجود ندارد (۰ پیشنهاد)
            </div>
            <p className="text-xs text-[#5C4636] max-w-md mx-auto leading-relaxed">
              با جست‌وجوی نام شهید، اجرای تطبیق انبوه، یا فشردن دکمه «ثبت دستی کتاب جدید»، موارد جهت بازبینی در این بخش فهرست می‌شوند.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSuggestions.map((sug) => {
              const isHighlighted = highlightedSuggestionId === sug.id;
              const isExpanded = Boolean(expandedSuggestionDetails[sug.id]);
              const originMeta = inferSuggestionOriginLabel(sug);
              const cleanMartyrTitle = formatSingleShahidPrefix(sug.martyrName);
              const graveInfo =
                sug.gravePiece
                  ? {
                      gravePiece: sug.gravePiece,
                      graveRow: sug.graveRow || '',
                      graveNumber: sug.graveNumber || ''
                    }
                  : golzarMartyrs28k.length > 0
                  ? findMartyrGraveIn28k(sug.martyrName, golzarMartyrs28k)
                  : null;

              const hasGrave = Boolean(
                graveInfo && (graveInfo.gravePiece || graveInfo.graveRow || graveInfo.graveNumber)
              );

              return (
                <div
                  id={`suggestion-${sug.id}`}
                  key={sug.id}
                  className={`border rounded-2xl p-3.5 sm:p-4 space-y-2.5 transition-all duration-200 ${
                    isHighlighted
                      ? 'border-[#8C3B2B] ring-2 ring-[#8C3B2B]/20 bg-[#FAF5EE] shadow-sm'
                      : 'border-[#E2D2BE] bg-[#FDFBF7]'
                  }`}
                >
                  {/* خط ۱ (ثابت و یکسان در همه کارت‌ها): ۱. نام شهید (بدون تکرار شهید شهید) | ۲. عنوان کتاب در روبه‌رو | ۳. وضعیت بررسی و جزئیات */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#E6D5C1]/70">
                    <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                      <span className="px-2.5 py-1 rounded-lg bg-[#6B3E26] text-white font-bold text-xs shrink-0">
                        {cleanMartyrTitle}
                      </span>
                      <span className="font-bold text-[#332218] inline-flex items-center gap-1.5">
                        <BookOpen className="w-4 h-4 text-[#8C3B2B] shrink-0" />
                        <span>کتاب «{sug.bookTitle}»</span>
                      </span>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-1.5 text-xs shrink-0">
                      {sug.reviewStatus === 'تأییدشده و افزوده‌شده به پرونده' ? (
                        <span className="text-[#2E7D5B] bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 font-bold inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>تأییدشده در پرونده</span>
                        </span>
                      ) : sug.reviewStatus === 'ردشده با ثبت دلیل' ? (
                        <span className="text-[#B94A48] bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 font-bold inline-flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          <span>ردشده ({sug.reviewerNote || 'ثبت در سوابق'})</span>
                        </span>
                      ) : (
                        <span className="text-[#6B3E26] bg-[#FAF5EE] px-2.5 py-1 rounded-lg border border-[#D8C7B2] font-bold inline-flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-[#8C3B2B] shrink-0" />
                          <span>نیازمند بررسی کارشناس</span>
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedSuggestionDetails((prev) => ({
                            ...prev,
                            [sug.id]: !prev[sug.id]
                          }))
                        }
                        className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#FAF5EE] text-[#5C4636] border border-[#D8C7B2] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <span>جزئیات</span>
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* خط ۲ (مشخصات یکدست با ترتیب ثابت در همه کارت‌ها: مزار گلزار · ناشر · منشأ · شواهد) */}
                  <div className="bg-[#FAF5EE]/90 border border-[#E6D5C1] rounded-xl px-3 py-2 text-xs text-[#332218] space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-bold text-[#6B3E26] tabular-nums">
                        {hasGrave
                          ? `مزار گلزار: قطعه ${toPersianDigits(graveInfo?.gravePiece || '—')} · ردیف ${toPersianDigits(
                              graveInfo?.graveRow || '—'
                            )} · شماره ${toPersianDigits(graveInfo?.graveNumber || '—')}`
                          : 'مزار گلزار: ثبت‌نشده'}
                      </span>
                      <span className="text-[#C5B49E]" aria-hidden="true">
                        |
                      </span>
                      <span>
                        <strong className="text-[#5C4636]">ناشر:</strong>{' '}
                        {sug.publisher && sug.publisher !== '—' ? sug.publisher : 'ثبت‌نشده'}
                      </span>
                      <span className="text-[#C5B49E]" aria-hidden="true">
                        |
                      </span>
                      <span>
                        <strong className="text-[#5C4636]">منشأ:</strong> {originMeta.label}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[#5C4636] pt-0.5">
                      <div>
                        <strong className="text-[#6B3E26]">شواهد ارتباط: </strong>
                        {sug.matchEvidence}
                      </div>
                      {sug.sourceUrl && sug.sourceUrl.trim() && (
                        <a
                          href={
                            sug.sourceUrl.startsWith('http')
                              ? sug.sourceUrl
                              : `https://${sug.sourceUrl}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-[#6B3E26] hover:bg-[#56311E] text-white font-bold text-[11px] inline-flex items-center gap-1 shrink-0"
                        >
                          <Link2 className="w-3 h-3" />
                          <span>باز کردن لینک کتاب</span>
                        </a>
                      )}
                    </div>
                  </div>

                  {/* جزئیات تکمیلی کشویی */}
                  {isExpanded && (
                    <div className="bg-white border border-[#E2D2BE] rounded-xl p-3 space-y-2 text-xs text-[#5C4636]">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <strong className="text-[#332218]">نویسنده/پدیدآور:</strong> {sug.authors}
                        </div>
                        <div>
                          <strong className="text-[#332218]">منبع پیشنهاد:</strong> {sug.sourceName}
                        </div>
                        <div>
                          <strong className="text-[#332218]">شابک / فیپا:</strong> {sug.isbn} · فیپا: {sug.fipa}
                        </div>
                      </div>
                      <p className="text-[#332218] leading-relaxed">
                        <strong>توضیحات ({sug.subjectCategory}):</strong> {sug.publisherDescription}
                      </p>
                      {sug.sourceUrl && (
                        <div className="text-[11px] text-[#6B3E26] break-all" dir="ltr">
                          URL: {sug.sourceUrl}
                        </div>
                      )}
                      <div className="text-[11px] text-slate-500">
                        شناسه پیشنهاد: <span className="font-mono">{sug.id}</span> · زمان بازیابی: {sug.retrievedAt}
                      </div>
                    </div>
                  )}

                  {/* فرم ویرایش مشخصات (شامل ویرایش لینک URL) */}
                  {editingId === sug.id && editDraft && (
                    <form
                      onSubmit={handleSaveEditDraft}
                      className="bg-white border border-[#6B3E26] rounded-xl p-3.5 space-y-3"
                    >
                      <div className="text-xs font-bold text-[#6B3E26]">
                        اصلاح مشخصات کتاب پیشنهادی پیش از تأیید نهایی:
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                        <div>
                          <label className="block font-bold mb-1">عنوان کتاب</label>
                          <input
                            type="text"
                            value={editDraft.bookTitle}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, bookTitle: e.target.value })
                            }
                            className="w-full px-2.5 py-1.5 border border-[#D8C7B2] rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block font-bold mb-1">ناشر</label>
                          <input
                            type="text"
                            value={editDraft.publisher}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, publisher: e.target.value })
                            }
                            className="w-full px-2.5 py-1.5 border border-[#D8C7B2] rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block font-bold mb-1">نویسنده</label>
                          <input
                            type="text"
                            value={editDraft.authors}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, authors: e.target.value })
                            }
                            className="w-full px-2.5 py-1.5 border border-[#D8C7B2] rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block font-bold mb-1">آدرس اینترنتی صفحه کتاب (URL)</label>
                          <input
                            type="text"
                            dir="ltr"
                            value={editDraft.sourceUrl || ''}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, sourceUrl: e.target.value })
                            }
                            placeholder="https://..."
                            className="w-full px-2.5 py-1.5 border border-[#D8C7B2] rounded-lg font-mono text-left"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setEditDraft(null);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#FAF5EE] border border-[#D8C7B2] text-xs cursor-pointer"
                        >
                          انصراف
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-1.5 rounded-lg bg-[#6B3E26] text-white text-xs font-bold cursor-pointer"
                        >
                          ذخیره اصلاحات
                        </button>
                      </div>
                    </form>
                  )}

                  {rejectingId === sug.id && (
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        type="text"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleConfirmReject(sug);
                          }
                        }}
                        placeholder="علت رد پیشنهاد را بنویسید و Enter بزنید (مثلاً: تشابه اسمی با شهید دیگر)..."
                        className="flex-1 px-3 py-2 text-xs bg-white border border-rose-300 rounded-lg"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleConfirmReject(sug)}
                          className="px-3.5 py-2 rounded-lg bg-[#B94A48] text-white text-xs font-bold whitespace-nowrap cursor-pointer"
                        >
                          ثبت رد با دلیل ↵
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRejectingId(null);
                            setRejectReason('');
                          }}
                          className="px-3 py-2 rounded-lg bg-white border border-rose-200 text-xs cursor-pointer"
                        >
                          لغو
                        </button>
                      </div>
                    </div>
                  )}

                  {/* خط ۳ (نوار دکمه‌های عملیاتی کارشناس — هم‌اندازه، متناسب و با پالت استاندارد: سبز=تأیید، قرمز=رد، قرمز ملایم=حذف، کرم/قهوه‌ای=سایر) */}
                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-between gap-1.5 pt-1">
                    <div className="col-span-2 sm:col-span-1 grid grid-cols-2 sm:flex items-center gap-1.5">
                      {sug.matchedCatalogBookId && (
                        <button
                          type="button"
                          onClick={() => {
                            const row = allUnifiedBooks.find(
                              (r) => r.tempBookId === sug.matchedCatalogBookId
                            );
                            if (row) {
                              setSelectedCatalogDetail(row);
                            } else {
                              onNotify(`کتاب با شناسه ${sug.matchedCatalogBookId} در فهرست موجود است.`);
                            }
                          }}
                          className="min-h-[34px] px-2.5 py-1 rounded-xl bg-[#FAF5EE] hover:bg-[#F3E9DC] text-[#5C4636] border border-[#D8C7B2] text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors"
                        >
                          <BookOpen className="w-3.5 h-3.5 text-[#6B3E26] shrink-0" />
                          <span className="truncate">شناسنامه ({sug.matchedCatalogBookId})</span>
                        </button>
                      )}
                      <a
                        href={`https://www.google.com/search?q=${encodeURIComponent(
                          'کتاب "' + sug.bookTitle + '" "' + cleanMartyrTitle + '"'
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`min-h-[34px] px-2.5 py-1 rounded-xl bg-[#FAF5EE] hover:bg-[#F3E9DC] text-[#5C4636] border border-[#D8C7B2] text-xs font-bold inline-flex items-center justify-center gap-1 transition-colors ${
                          !sug.matchedCatalogBookId ? 'col-span-2' : ''
                        }`}
                      >
                        <ExternalLink className="w-3 h-3 text-[#6B3E26] shrink-0" />
                        <span className="truncate">استعلام در گوگل</span>
                      </a>
                    </div>

                    <div className="col-span-2 sm:col-span-1 grid grid-cols-2 sm:flex items-center gap-1.5">
                      {onDeleteSuggestion && (
                        <button
                          type="button"
                          onClick={() => {
                            requestActionConfirmation({
                              title: 'تأیید نهایی حذف پیشنهاد از صف بررسی',
                              message: `آیا از حذف دائمی پیشنهاد کتاب «${sug.bookTitle}» مرتبط با «${cleanMartyrTitle}» (${sug.id}) از صف بررسی اطمینان دارید؟`,
                              confirmLabel: 'بله، از صف حذف شود',
                              variant: 'delete',
                              onConfirm: () => {
                                onDeleteSuggestion(sug.id);
                                onNotify(`پیشنهاد ${sug.id} از صف بررسی حذف شد.`);
                              }
                            });
                          }}
                          className="min-h-[34px] px-2.5 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5 shrink-0" />
                          <span>حذف</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(sug.id);
                          setEditDraft(sug);
                        }}
                        className="min-h-[34px] px-2.5 py-1 rounded-xl bg-white hover:bg-[#FAF5EE] text-[#332218] border border-[#D8C7B2] text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-[#6B3E26] shrink-0" />
                        <span>ویرایش / لینک</span>
                      </button>

                      {sug.reviewStatus === 'تأییدشده و افزوده‌شده به پرونده' ? (
                        <div className="col-span-2 min-h-[34px] px-3 py-1 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold inline-flex items-center justify-center gap-1 border border-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                          <span>تأییدشده در پرونده</span>
                        </div>
                      ) : sug.reviewStatus === 'ردشده با ثبت دلیل' ? (
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateSuggestion({
                              ...sug,
                              reviewStatus: 'در صف بررسی کارشناس',
                              reviewerNote: 'بازگشت به صف جهت بررسی مجدد کارشناس'
                            });
                            onNotify(`پیشنهاد ${sug.id} مجدداً جهت بررسی به صف بازگردانده شد.`);
                          }}
                          className="col-span-2 min-h-[34px] px-2.5 py-1 rounded-xl bg-[#FAF5EE] border border-[#D8C7B2] hover:bg-[#F3E9DC] text-[#332218] text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-[#6B3E26] shrink-0" />
                          <span>بررسی مجدد</span>
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleApproveItem(sug)}
                            className="min-h-[34px] px-3 py-1 rounded-xl bg-[#2E7D5B] hover:bg-[#246348] text-white text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-2xs"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">تأیید و ثبت</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setRejectingId(sug.id)}
                            className="min-h-[34px] px-2.5 py-1 rounded-xl bg-[#B94A48] hover:bg-[#993b39] text-white text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-2xs"
                          >
                            <XCircle className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">رد با دلیل</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* پنجره مودال اختصاصی برای نمایش موارد «نیازمند بررسی» (وقتی روی لینک «X مورد نیازمند بررسی» در بالا یا پایین کلیک می‌شود) */}
      {showNeedsReviewModal && (
        <ModalWindow
          onClose={() => setShowNeedsReviewModal(false)}
          title={`فهرست موارد نیازمند بررسی (${toPersianDigits(sourceStats.needsReviewList.length)} مورد)`}
          maxWidthClass="max-w-4xl"
        >
          <div className="space-y-3 text-xs">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-950 leading-relaxed">
              <strong>توضیح منشأ این موارد:</strong> این فهرست شامل ۳ ردیف دارای نقص مزار در اکسل قطعات شهدا (مانند سید اسدالله لاجوردی و عباس تیماجی) به علاوه‌ی کتاب‌هایی از فهرست ۹۸۰ کتاب کتابخانه است که در ستون توضیحات آن‌ها نام شهید ذکر شده (مانند «ماه در محاق» یا «آفتاب کویر») و در تطبیق خودکار با بانک ۲۸٬۳۶۸ شهید گلزار برای بازبینی کارشناس علامت‌گذاری شده‌اند.
            </div>

            <div className="max-h-[420px] overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-right text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 sticky top-0">
                  <tr>
                    <th className="py-2 px-2.5 font-bold">ردیف</th>
                    <th className="py-2 px-2.5 font-bold">نام شهید</th>
                    <th className="py-2 px-2.5 font-bold">عنوان کتاب و ناشر</th>
                    <th className="py-2 px-2.5 font-bold">قطعه / ردیف / شماره مزار در گلزار</th>
                    <th className="py-2 px-2.5 font-bold">منشأ و توضیحات</th>
                    <th className="py-2 px-2.5 font-bold">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {sourceStats.needsReviewList.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-amber-50/40">
                      <td className="py-2 px-2.5 font-mono">{toPersianDigits(idx + 1)}</td>
                      <td className="py-2 px-2.5 font-bold text-[#8C3B2B]">{item.martyrNameRaw}</td>
                      <td className="py-2 px-2.5">
                        <div className="font-bold text-slate-900">{item.bookTitleRaw}</div>
                        <div className="text-[11px] text-slate-500">ناشر: {item.publisherRaw || '—'}</div>
                      </td>
                      <td className="py-2 px-2.5 tabular-nums font-semibold">
                        {item.gravePieceRaw || item.graveRowRaw || item.graveNumberRaw
                          ? `قطعه ${toPersianDigits(item.gravePieceRaw || '—')} · ردیف ${toPersianDigits(
                              item.graveRowRaw || '—'
                            )} · ش ${toPersianDigits(item.graveNumberRaw || '—')}`
                          : 'در اکسل منبع درج نشده'}
                      </td>
                      <td className="py-2 px-2.5 text-[11px] text-slate-600 max-w-xs">
                        {item.sourceDescriptionRaw || item.reviewerNote || '—'}
                      </td>
                      <td className="py-2 px-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setTwoWayQuery(item.bookTitleRaw);
                            setTwoWaySourceFilter('needs_review');
                            setShowTwoWayListDrawer(true);
                            setShowNeedsReviewModal(false);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-[#1F4E79] hover:bg-[#163a5b] text-white font-bold text-[11px] cursor-pointer whitespace-nowrap"
                        >
                          مشاهده کتاب
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setTwoWaySourceFilter('needs_review');
                  setShowTwoWayListDrawer(true);
                  setShowNeedsReviewModal(false);
                }}
                className="px-3.5 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold cursor-pointer"
              >
                فیلتر کردن جدول اصلی روی همین {toPersianDigits(sourceStats.needsReviewBooksCount)} کتاب
              </button>
              <button
                type="button"
                onClick={() => setShowNeedsReviewModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold cursor-pointer"
              >
                بستن پنجره
              </button>
            </div>
          </div>
        </ModalWindow>
      )}

      {/* پنجره مودال اختصاصی برای نمایش کتاب‌های تطبیق‌یافته در بخش ۲ (وقتی روی تعداد کتاب‌های منطبق کلیک می‌شود) */}
      {showBulkMatchesModal && (
        <ModalWindow
          onClose={() => setShowBulkMatchesModal(false)}
          title={`فهرست کتاب‌های تطبیق‌یافته در جست‌وجوی انبوه (${toPersianDigits(lastBulkMatchedList.length)} مورد)`}
          maxWidthClass="max-w-4xl"
        >
          <div className="space-y-3 text-xs">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-950 leading-relaxed">
              در این جدول، تمام کتاب‌هایی که در اجرای تطبیق انبوه با نام شهدای انتخابی هم‌خوانی داشته‌اند به همراه نشانی مزار شهید در گلزار شهدای تهران فهرست شده‌اند.
            </div>

            <div className="max-h-[420px] overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-right text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 sticky top-0">
                  <tr>
                    <th className="py-2 px-2.5 font-bold">#</th>
                    <th className="py-2 px-2.5 font-bold">نام شهید</th>
                    <th className="py-2 px-2.5 font-bold">مزار در گلزار</th>
                    <th className="py-2 px-2.5 font-bold">عنوان کتاب و شناسه</th>
                    <th className="py-2 px-2.5 font-bold">نوع تطبیق و شواهد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {lastBulkMatchedList.map((m, idx) => (
                    <tr key={`${m.martyrName}-${m.book.tempBookId}-${idx}`} className="hover:bg-slate-50">
                      <td className="py-2 px-2.5 font-mono">{toPersianDigits(idx + 1)}</td>
                      <td className="py-2 px-2.5 font-bold text-[#8C3B2B]">{m.martyrName}</td>
                      <td className="py-2 px-2.5 tabular-nums font-semibold">
                        قطعه {toPersianDigits(m.gravePiece || '—')} · ردیف {toPersianDigits(m.graveRow || '—')} · ش{' '}
                        {toPersianDigits(m.graveNumber || '—')}
                      </td>
                      <td className="py-2 px-2.5">
                        <div className="font-bold text-slate-900">
                          {m.book.titleRaw}{' '}
                          <span className="font-mono text-[10.5px] text-[#1F4E79]">({m.book.tempBookId})</span>
                        </div>
                        <div className="text-[11px] text-slate-500">ناشر: {m.book.publisherRaw || '—'}</div>
                      </td>
                      <td className="py-2 px-2.5 text-[11px] text-slate-600 max-w-xs">{m.evidenceText}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowBulkMatchesModal(false)}
                className="px-4 py-2 rounded-xl bg-[#1F4E79] text-white font-bold cursor-pointer"
              >
                بستن پنجره
              </button>
            </div>
          </div>
        </ModalWindow>
      )}

      {/* مودال ۱۸ انتشارات تخصصی دفاع مقدس */}
      {showPublishersModal && (
        <ModalWindow
          onClose={() => setShowPublishersModal(false)}
          title="۱۸ انتشارات تخصصی دفاع مقدس و ادبیات پایداری"
          maxWidthClass="max-w-4xl"
        >
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#8C3B2B]/10 flex items-center justify-center text-[#8C3B2B] shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-[#253247]">
                ۱۸ انتشارات تخصصی دفاع مقدس و ادبیات پایداری
              </h3>
              <p className="text-xs text-[#697586]">
                کاوش مستقیم نام «{selectedMartyrName || twoWayQuery || 'شهید'}» از طریق گوگل (بدون مشکل فیلترشکن) در سایت ناشران
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 p-1 text-xs">
            {SACRED_DEFENSE_PUBLISHERS.map((pub, idx) => {
              const targetMartyr = selectedMartyrName || twoWayQuery || 'شهید';
              const searchLink = pub.searchUrlPattern(targetMartyr);
              return (
                <div
                  key={pub.id}
                  className="bg-[#F8FAFC] border border-slate-200 hover:border-[#8C3B2B]/40 rounded-xl p-3 flex flex-col justify-between gap-2.5 transition-all shadow-2xs"
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-mono text-[10px] text-slate-400 font-bold">
                        #{toPersianDigits(idx + 1)}
                      </span>
                      <span className="text-[10px] bg-amber-50 text-amber-800 font-semibold px-2 py-0.5 rounded">
                        کاوش از طریق گوگل
                      </span>
                    </div>
                    <h4 className="font-bold text-xs text-[#253247]">{pub.name}</h4>
                    <p className="text-[11px] text-[#697586] mt-0.5 leading-snug">
                      {pub.affiliation}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-500 truncate">
                      {pub.domainUrl.replace(/^https?:\/\//, '')}
                    </span>
                    <a
                      href={searchLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        handleExternalPortalClick(pub.name);
                        setShowPublishersModal(false);
                      }}
                      className="px-2.5 py-1 bg-[#1F4E79] hover:bg-[#163a5b] text-white rounded-lg font-bold text-[11px] inline-flex items-center gap-1 shrink-0 shadow-2xs transition-colors"
                    >
                      <span>کاوش در گوگل</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
            <span className="text-[#697586] text-[11px]">
              نکته: با کلیک روی هر ناشر، کادر ثبت سریع و آدرس اینترنتی (URL) در صفحه فعال می‌شود.
            </span>
            <button
              type="button"
              onClick={() => setShowPublishersModal(false)}
              className="px-4 py-2 bg-[#8C3B2B] text-white hover:bg-[#702D20] font-bold rounded-xl cursor-pointer"
            >
              بستن
            </button>
          </div>
        </ModalWindow>
      )}

      {/* مودال ثبت دستی کتاب جدید در مورد شهید انتخاب‌شده یا نوشته‌شده (همراه با فیلد URL) */}
      {showManualAddModal && (
        <ModalWindow
          onClose={() => setShowManualAddModal(false)}
          title="ثبت دستی کتاب جدید در مورد شهید انتخاب‌شده یا نوشته‌شده"
          maxWidthClass="max-w-xl"
        >
          <div className="bg-[#F0F5FA] border border-[#1F4E79]/20 rounded-xl p-3 mb-3 flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1F4E79]/10 flex items-center justify-center text-[#1F4E79] shrink-0">
              <Plus className="w-5 h-5" />
            </div>
            <div className="space-y-1 text-xs">
              <h3 className="font-bold text-[#253247]">
                ثبت دستی کتاب جدید در مورد شهید انتخاب‌شده یا نوشته‌شده
              </h3>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                مشخصات کتاب یافت‌شده در گوگل، خانه کتاب یا بررسی میدانی را به همراه آدرس اینترنتی (URL) آن وارد کنید تا در صف بررسی و پرونده شهید ذخیره شود.
              </p>
            </div>
          </div>

          <form onSubmit={handleManualAddSubmit} className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-[#253247] mb-1">
                نام و نام خانوادگی شهید مرتبط <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={manualMartyrName}
                onChange={(e) => setManualMartyrName(e.target.value)}
                placeholder="مثال: شهید عباس دوران"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#1F4E79] outline-hidden bg-[#FAF5EE]/60 font-bold"
              />
            </div>

            <div>
              <label className="block font-bold text-[#253247] mb-1">
                عنوان دقیق کتاب <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="مثال: پرواز تا بی‌نهایت"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#1F4E79] outline-hidden"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-[#253247] mb-1">
                  ناشر رسمی <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={manualPublisher}
                  onChange={(e) => setManualPublisher(e.target.value)}
                  placeholder="مثال: نشر شاهد یا سوره مهر"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#1F4E79] outline-hidden"
                />
              </div>
              <div>
                <label className="block font-bold text-[#253247] mb-1">نویسنده / پدیدآور</label>
                <input
                  type="text"
                  value={manualAuthor}
                  onChange={(e) => setManualAuthor(e.target.value)}
                  placeholder="مثال: علی‌اکبر مزدآبادی"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#1F4E79] outline-hidden"
                />
              </div>
            </div>

            {/* فیلد آدرس اینترنتی صفحه کتاب (URL) زیر ناشر */}
            <div>
              <label className="block font-bold text-[#253247] mb-1">
                آدرس اینترنتی صفحه کتاب در گوگل / سایت ناشر (URL — اختیاری):
              </label>
              <div className="flex gap-1.5">
                <input
                  type="url"
                  dir="ltr"
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  placeholder="https://..."
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#1F4E79] outline-hidden font-mono text-left"
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const txt = await navigator.clipboard.readText();
                      if (txt) setManualUrl(txt.trim());
                    } catch {
                      onNotify('لینک کپی‌شده را در کادر URL بچسبانید.', 'warning');
                    }
                  }}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  <span>چسباندن لینک</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-[#253247] mb-1">سال انتشار</label>
                <input
                  type="text"
                  value={manualYear}
                  onChange={(e) => setManualYear(e.target.value)}
                  placeholder="مثال: ۱۴۰۱ یا ۱۳۹۵"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#1F4E79] outline-hidden"
                />
              </div>
              <div>
                <label className="block font-bold text-[#253247] mb-1">پایگاه یا منبع استعلام</label>
                <select
                  value={manualSource}
                  onChange={(e) => setManualSource(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#1F4E79] outline-hidden bg-white"
                >
                  <option value="سازمان اسناد و کتابخانه ملی ایران (NLAI)">
                    سازمان اسناد و کتابخانه ملی ایران (NLAI)
                  </option>
                  <option value="خانه کتاب و ادبیات ایران (Ketab.ir)">
                    خانه کتاب و ادبیات ایران (Ketab.ir)
                  </option>
                  <option value="جست‌وجوی گوگل و منابع اینترنتی">
                    جست‌وجوی گوگل و منابع اینترنتی
                  </option>
                  <option value="پایگاه مرکز اسناد ایثارگران">پایگاه مرکز اسناد ایثارگران</option>
                  <option value="ناشران تخصصی دفاع مقدس">ناشران تخصصی دفاع مقدس</option>
                  <option value="مشاهده عینی و بررسی میدانی">مشاهده عینی و بررسی میدانی</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-bold text-[#253247] mb-1">
                یادداشت کارشناس و شماره صفحه/سند
              </label>
              <textarea
                rows={2}
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                placeholder="توضیحات تکمیلی یا ارجاع دقیق به سند یا فصل مربوط به شهید..."
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#1F4E79] outline-hidden resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowManualAddModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-[#2E6F40] hover:bg-[#235632] text-white font-bold rounded-xl cursor-pointer shadow-md flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>ثبت در صف بررسی کارشناس</span>
              </button>
            </div>
          </form>
        </ModalWindow>
      )}

      {/* مودال شناسنامه ثبتی کتاب در مخزن کتابخانه */}
      {selectedCatalogDetail && (
        <ModalWindow
          onClose={() => setSelectedCatalogDetail(null)}
          title={`شناسنامه ثبتی کتاب در مخزن (${selectedCatalogDetail.tempBookId})`}
          maxWidthClass="max-w-lg"
        >
          <div className="space-y-3 text-xs text-slate-800 leading-relaxed">
            <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 border border-slate-200">
              <div className="font-bold text-sm text-[#1F4E79]">{selectedCatalogDetail.titleRaw}</div>
              <div className="text-slate-600">
                نویسنده / پدیدآور: {selectedCatalogDetail.authorRaw || 'نامشخص'}
              </div>
              <div className="text-slate-600">ناشر: {selectedCatalogDetail.publisherRaw || 'نامشخص'}</div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="font-bold text-slate-600">شناسه موقت: </span>
                <span className="font-mono text-slate-900 font-bold">
                  {selectedCatalogDetail.tempBookId}
                </span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="font-bold text-slate-600">محل در قفسه: </span>
                <span className="text-slate-900 font-bold">
                  {selectedCatalogDetail.locationRaw || 'نامشخص'}
                </span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="font-bold text-slate-600">شابک: </span>
                <span className="text-slate-900 font-mono">{selectedCatalogDetail.isbnRaw || '—'}</span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="font-bold text-slate-600">فیپا: </span>
                <span className="text-slate-900 font-mono">{selectedCatalogDetail.fipaRaw || '—'}</span>
              </div>
            </div>

            {selectedCatalogDetail.categoryRaw && (
              <div className="p-2 bg-blue-50/60 rounded-lg border border-blue-100 text-[11px]">
                <span className="font-bold text-blue-950">گروه موضوعی: </span>
                <span className="text-blue-900">{selectedCatalogDetail.categoryRaw}</span>
              </div>
            )}

            {selectedCatalogDetail.descriptionRaw && (
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-[11px]">
                <span className="font-bold text-slate-700 block mb-1">توضیحات ثبت اولیه:</span>
                <p className="text-slate-600 leading-relaxed">{selectedCatalogDetail.descriptionRaw}</p>
              </div>
            )}

            <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(
                  'site:ketab.ir "' + selectedCatalogDetail.titleRaw + '"'
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg font-semibold inline-flex items-center gap-1 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-emerald-700" />
                <span>استعلام در خانه کتاب</span>
              </a>
              <button
                type="button"
                onClick={() => setSelectedCatalogDetail(null)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-bold cursor-pointer"
              >
                بستن
              </button>
            </div>
          </div>
        </ModalWindow>
      )}
    </div>
  );
};
