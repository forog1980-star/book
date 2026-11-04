import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Sparkles,
  Search,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Edit3,
  ShieldAlert,
  BookOpen,
  Layers,
  Globe,
  Building2,
  Newspaper,
  ArrowDown,
  Info,
  Trash2,
  Plus,
  AlertCircle,
  Upload,
  FileSpreadsheet
} from 'lucide-react';
import {
  BookMartyrLinkRecord,
  CustomMartyrRecord,
  ExtractedContentItem,
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
    searchUrlPattern: (name) => `https://www.google.com/search?q=${encodeURIComponent('site:sooremehr.ir "شهید ' + name + '"')}`
  },
  {
    id: 'shahed',
    name: 'نشر شاهد',
    affiliation: 'بنیاد شهید و امور ایثارگران',
    domainUrl: 'https://shahed.isaar.ir',
    searchUrlPattern: (name) => `https://www.google.com/search?q=${encodeURIComponent('site:shahed.isaar.ir OR site:isaar.ir "شهید ' + name + '"')}`
  },
  {
    id: 'revayatfath',
    name: 'انتشارات روایت فتح',
    affiliation: 'مؤسسه فرهنگی هنری روایت فتح',
    domainUrl: 'https://revayatfath.com',
    searchUrlPattern: (name) => `https://www.google.com/search?q=${encodeURIComponent('site:revayatfath.com "شهید ' + name + '"')}`
  },
  {
    id: 'fatehan',
    name: 'انتشارات فاتحان',
    affiliation: 'سازمان حفظ آثار و نشر ارزش‌های دفاع مقدس بسیج',
    domainUrl: 'https://fatehan.ir',
    searchUrlPattern: (name) => `https://www.google.com/search?q=${encodeURIComponent('site:fatehan.ir OR "انتشارات فاتحان" "شهید ' + name + '"')}`
  },
  {
    id: 'yazahra',
    name: 'انتشارات یا زهرا (س)',
    affiliation: 'ناشر تخصصی زندگی‌نامه و وصایای شهدا',
    domainUrl: 'https://yazahra.ir',
    searchUrlPattern: (name) => `https://www.google.com/search?q=${encodeURIComponent('site:yazahra.ir "شهید ' + name + '"')}`
  },
  {
    id: '27besat',
    name: 'نشر ۲۷ بعثت',
    affiliation: 'سپاه حضرت محمد رسول‌الله (ص)',
    domainUrl: 'https://27besat.com',
    searchUrlPattern: (name) => `https://www.google.com/search?q=${encodeURIComponent('site:27besat.com "شهید ' + name + '"')}`
  },
  {
    id: 'ebrahimhadi',
    name: 'انتشارات شهید ابراهیم هادی',
    affiliation: 'گروه فرهنگی شهید ابراهیم هادی',
    domainUrl: 'https://onlinehadi.com',
    searchUrlPattern: (name) => `https://www.google.com/search?q=${encodeURIComponent('site:onlinehadi.com "شهید ' + name + '"')}`
  },
  {
    id: 'khattemoghadam',
    name: 'انتشارات خط مقدم',
    affiliation: 'ادبیات پایداری و مدافعان حرم',
    domainUrl: 'https://khattemoghadam.com',
    searchUrlPattern: (name) => `https://www.google.com/search?q=${encodeURIComponent('site:khattemoghadam.com "شهید ' + name + '"')}`
  },
  {
    id: 'sahba',
    name: 'انتشارات صهبا',
    affiliation: 'مؤسسه ایمان جهادی',
    domainUrl: 'https://sahba.ir',
    searchUrlPattern: (name) => `https://www.google.com/search?q=${encodeURIComponent('site:sahba.ir OR site:jahadi.ir "شهید ' + name + '"')}`
  },
  {
    id: 'sarv',
    name: 'نشر سرو',
    affiliation: 'موزه ملی انقلاب اسلامی و دفاع مقدس',
    domainUrl: 'https://iranhm.ir',
    searchUrlPattern: (name) => `https://www.google.com/search?q=${encodeURIComponent('site:iranhm.ir OR "نشر سرو" "شهید ' + name + '"')}`
  },
  {
    id: 'defamoghaddas',
    name: 'مرکز اسناد و تحقیقات دفاع مقدس',
    affiliation: 'سپاه پاسداران انقلاب اسلامی',
    domainUrl: 'https://defamoghaddas.ir',
    searchUrlPattern: (name) => `https://www.google.com/search?q=${encodeURIComponent('site:defamoghaddas.ir "شهید ' + name + '"')}`
  },
  {
    id: 'amirkabir',
    name: 'مؤسسه انتشارات امیرکبیر',
    affiliation: 'سازمان تبلیغات اسلامی',
    domainUrl: 'https://amirkabir.net',
    searchUrlPattern: (name) => `https://www.google.com/search?q=${encodeURIComponent('site:amirkabir.net "شهید ' + name + '"')}`
  },
  {
    id: 'ettelaat',
    name: 'انتشارات اطلاعات',
    affiliation: 'مؤسسه اطلاعات',
    domainUrl: 'https://ettelaat.com',
    searchUrlPattern: (name) => `https://www.google.com/search?q=${encodeURIComponent('site:ettelaat.com "شهید ' + name + '"')}`
  },
  {
    id: 'irdc',
    name: 'مرکز اسناد انقلاب اسلامی',
    affiliation: 'مؤسسه فرهنگی هنری مرکز اسناد انقلاب اسلامی',
    domainUrl: 'https://irdc.ir',
    searchUrlPattern: (name) => `https://www.google.com/search?q=${encodeURIComponent('site:irdc.ir "شهید ' + name + '"')}`
  },
  {
    id: 'orouj',
    name: 'مؤسسه چاپ و نشر عروج',
    affiliation: 'مؤسسه تنظیم و نشر آثار امام خمینی (ره)',
    domainUrl: 'https://oroujpub.ir',
    searchUrlPattern: (name) => `https://www.google.com/search?q=${encodeURIComponent('site:oroujpub.ir "شهید ' + name + '"')}`
  },
  {
    id: 'darkhoveyn',
    name: 'انتشارات دارخوین',
    affiliation: 'ناشر تخصصی ایثار و شهادت',
    domainUrl: 'https://darkhoveyn.ir',
    searchUrlPattern: (name) => `https://www.google.com/search?q=${encodeURIComponent('site:darkhoveyn.ir "شهید ' + name + '"')}`
  },
  {
    id: 'meraj',
    name: 'انتشارات معراج اندیشه',
    affiliation: 'فرهنگ ایثار و شهادت',
    domainUrl: 'https://ketab.ir',
    searchUrlPattern: (name) => `https://www.google.com/search?q=${encodeURIComponent('"انتشارات معراج اندیشه" "شهید ' + name + '"')}`
  },
  {
    id: 'niloofaraneh',
    name: 'انتشارات نیلوفرانه',
    affiliation: 'ادبیات دفاع مقدس و شهدای مدافع حرم',
    domainUrl: 'https://ketab.ir',
    searchUrlPattern: (name) => `https://www.google.com/search?q=${encodeURIComponent('"انتشارات نیلوفرانه" "شهید ' + name + '"')}`
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

interface SmartBookSearchTabProps {
  catalogRows: ReferenceCatalogRow[];
  workbookMartyrs: WorkbookGolzarMartyr[];
  customMartyrs?: CustomMartyrRecord[];
  smartSuggestions: SmartSearchSuggestion[];
  links?: BookMartyrLinkRecord[];
  extractedItems?: ExtractedContentItem[];
  initialMartyrQuery?: string;
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
  workbookMartyrs,
  customMartyrs = [],
  smartSuggestions,
  links = [],
  extractedItems = [],
  initialMartyrQuery = '',
  onAddSuggestion,
  onUpdateSuggestion,
  onDeleteSuggestion,
  onClearAllSuggestions,
  onApproveSuggestionToLinks,
  onNotify
}) => {
  const [twoWayQuery, setTwoWayQuery] = useState(initialMartyrQuery || '');
  const [twoWaySourceFilter, setTwoWaySourceFilter] = useState<'all' | 'sooreh' | 'golzar'>('all');
  const [selectedMartyrName, setSelectedMartyrName] = useState(initialMartyrQuery || '');
  const [customAltNames, setCustomAltNames] = useState('');
  const [rejectedHistory, setRejectedHistory] = useState<RejectedSuggestionHistory[]>(loadRejectedHistory);
  const [selectedCatalogDetail, setSelectedCatalogDetail] = useState<ReferenceCatalogRow | null>(null);
  const [selectedSourceCode, setSelectedSourceCode] = useState<string>('ALL');
  const [queueFilter, setQueueFilter] = useState<'ALL' | SmartSuggestionReviewStatus>('ALL');

  // Search Feedback & Review Queue Navigation State
  const [lastSearchFeedback, setLastSearchFeedback] = useState<SearchFeedbackState | null>(null);
  const [highlightedSuggestionId, setHighlightedSuggestionId] = useState<string | null>(null);
  const [showPublishersModal, setShowPublishersModal] = useState<boolean>(false);
  const [showManualAddModal, setShowManualAddModal] = useState<boolean>(false);

  // Manual Add Real Book Form State
  const [manualTitle, setManualTitle] = useState('');
  const [manualPublisher, setManualPublisher] = useState('');
  const [manualAuthor, setManualAuthor] = useState('');
  const [manualYear, setManualYear] = useState('');
  const [manualSource, setManualSource] = useState('سازمان اسناد و کتابخانه ملی ایران (NLAI)');
  const [manualNote, setManualNote] = useState('');

  // Bulk Martyr Search & Batch Match State (Section 2)
  const [bulkInputMode, setBulkInputMode] = useState<'excel' | 'text' | 'system'>('excel');
  const [bulkTextNames, setBulkTextNames] = useState('');
  const [bulkLoadedNames, setBulkLoadedNames] = useState<string[]>([]);
  const [bulkLoadedFileName, setBulkLoadedFileName] = useState('');
  const [pilotStatus, setPilotStatus] = useState<'idle' | 'running' | 'paused' | 'completed'>('idle');
  const [pilotProcessedCount, setPilotProcessedCount] = useState<number>(0);
  const [pilotFoundCount, setPilotFoundCount] = useState<number>(0);
  const [pilotDuplicatePrevented, setPilotDuplicatePrevented] = useState<number>(0);
  const [pilotErrorCount] = useState<number>(0);

  // Editing / Rejecting state in Review Queue
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<SmartSearchSuggestion | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const computedVariants = useMemo(
    () => generateMartyrNameVariants(selectedMartyrName, customAltNames),
    [selectedMartyrName, customAltNames]
  );

  // موتور جست‌وجوی دوطرفه کتاب و شهید (مقابله ۵۹۹ رکورد پژوهش سوره مهر، ۲۳۷ رکورد قطعات شهدا و ۹۸۰ کتاب کاتالوگ)
  const validResearchLinks = useMemo(() => {
    return links.filter((l) => Boolean(l.martyrNameRaw) && l.martyrNameRaw !== '*');
  }, [links]);

  const twoWayMatchedBookGroups = useMemo(() => {
    const q = normalizePersianText(twoWayQuery.replace(/^شهید\s+/, ''));
    const words = q ? q.split(/\s+/).filter(Boolean) : [];

    // گردآوری همه پیوندهای کتاب و شهید به تفکیک کلید کتاب
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
        catalogRow?: ReferenceCatalogRow;
        allBookLinks: BookMartyrLinkRecord[];
        matchedMartyrLinkIds: Set<string>;
      }
    >();

    for (const lnk of validResearchLinks) {
      if (twoWaySourceFilter === 'sooreh' && !lnk.sourceFile?.includes('لیست کتابهای')) continue;
      if (twoWaySourceFilter === 'golzar' && !lnk.sourceFile?.includes('قطعات شهدا')) continue;

      const key = lnk.tempBookId || `${normalizePersianText(lnk.bookTitleRaw)}::${normalizePersianText(lnk.publisherRaw)}`;
      let grp = groupsMap.get(key);
      if (!grp) {
        const catRow = catalogRows.find(
          (c) =>
            (lnk.tempBookId && c.tempBookId === lnk.tempBookId) ||
            normalizePersianText(c.titleRaw) === normalizePersianText(lnk.bookTitleRaw)
        );
        grp = {
          bookKey: key,
          tempBookId: lnk.tempBookId || catRow?.tempBookId || '',
          bookTitle: catRow?.titleRaw || lnk.bookTitleRaw,
          alternativeTitle: lnk.alternativeTitle || (catRow && catRow.titleRaw !== lnk.bookTitleRaw ? lnk.bookTitleRaw : ''),
          publisher: lnk.publisherRaw || catRow?.publisherRaw || 'سوره مهر',
          description: lnk.sourceDescriptionRaw || catRow?.descriptionRaw || '',
          sourceFile: lnk.sourceFile || 'لیست کتابهای و شهدای مرتبط.xlsx',
          catalogRow: catRow,
          allBookLinks: [],
          matchedMartyrLinkIds: new Set<string>()
        };
        groupsMap.set(key, grp);
      }
      if (!grp.description && lnk.sourceDescriptionRaw) {
        grp.description = lnk.sourceDescriptionRaw;
      }
      grp.allBookLinks.push(lnk);
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
  }, [validResearchLinks, catalogRows, twoWayQuery, twoWaySourceFilter]);

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

    return true;
  };

  const handleSyncAndPurgeOrphans = () => {
    if (!onDeleteSuggestion) return;
    let purgedCount = 0;
    smartSuggestions.forEach((s) => {
      if (isMartyrOrphanOrTest(s.martyrName, s.martyrId)) {
        onDeleteSuggestion(s.id);
        purgedCount++;
      }
    });

    if (lastSearchFeedback && isMartyrOrphanOrTest(lastSearchFeedback.targetName)) {
      setLastSearchFeedback(null);
      setHighlightedSuggestionId(null);
    }

    if (purgedCount > 0) {
      onNotify(
        `همگام‌سازی انجام شد: تعداد ${toPersianDigits(purgedCount)} سابقه تستی یا مربوط به پرونده‌های حذف‌شده از صف پاک گردید.`,
        'success'
      );
    } else {
      onNotify('همه سوابق صف بررسی با پرونده‌های موجود در سیستم همگام هستند.');
    }
  };

  // Check if a book and martyr combination was previously approved in links or rejected
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

    // 1. Check if already approved in links
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
        reason: matchedLink.reviewerNote || 'تأیید توسط کارشناس انجام شده و به پرونده شهید منتقل گردیده است.',
        reviewedBy: 'کارشناس بازبین مرکز اسناد',
        reviewedAt: 'تأییدشده در کارپوشه',
        linkRecord: matchedLink
      };
    }

    // 2. Check if in smartSuggestions as approved
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

    // 3. Check if in smartSuggestions as rejected
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

    // 4. Check rejectedHistory (saved across sessions in localStorage)
    const matchInHistory = rejectedHistory.find((rh) => {
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

    // 5. Check if currently pending in queue
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

  useEffect(() => {
    if (initialMartyrQuery && initialMartyrQuery.trim()) {
      const clean = initialMartyrQuery.trim();
      setSelectedMartyrName(clean);
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

      const matchedInCatalog = catalogRows.find((r) =>
        normalizePersianText(`${r.titleRaw} ${r.descriptionRaw} ${r.authorRaw}`).includes(normTarget)
      );

      if (matchedInCatalog) {
        const prior = checkBookMartyrPriorStatus(clean, matchedInCatalog.titleRaw, matchedInCatalog.tempBookId);

        if (prior.status === 'approved') {
          const sugId = prior.existingSuggestion?.id || `SS-${String(smartSuggestions.length + 1).padStart(4, '0')}`;
          if (!prior.existingSuggestion) {
            const approvedSug: SmartSearchSuggestion = {
              id: sugId,
              martyrId: `MR-${String(smartSuggestions.length + 1).padStart(6, '0')}`,
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
              publisherDescription: matchedInCatalog.descriptionRaw || `کتاب موجود در قفسه کتابخانه منطبق با نام شهید «${clean}»`,
              sourcePriority: 1,
              sourceName: 'فهرست کتابخانه مرکز اسناد (۹۸۰ عنوان کتاب مرجع)',
              sourceUrl: '',
              retrievedAt: nowFa,
              matchEvidence: `تطبیق واقعی نام شهید با رکورد ${matchedInCatalog.tempBookId} در فهرست ۹۸۰ کتاب مرجع کتابخانه.`,
              catalogComparisonStatus: 'موجود در فهرست مرجع ۹۸۰ کتاب',
              matchedCatalogBookId: matchedInCatalog.tempBookId,
              reviewStatus: 'تأییدشده و افزوده‌شده به پرونده',
              reviewerNote: prior.reason || 'تأیید توسط کارشناس انجام شده است (موجود در پرونده شهید)',
              reviewedBy: prior.reviewedBy || 'کارشناس بازبین مرکز اسناد',
              reviewedAt: prior.reviewedAt || nowFa
            };
            onAddSuggestion(approvedSug);
          }
          setLastSearchFeedback({
            targetName: clean,
            matchedInCatalog,
            suggestionId: sugId,
            status: 'matched_catalog',
            message: `کتاب «${matchedInCatalog.titleRaw}» قبلاً توسط کارشناس تأیید شده و با وضعیت «تأییدشده» در پرونده شهید «${clean}» ثبت است.`,
            timestamp: nowFa
          });
          setHighlightedSuggestionId(sugId);
          return;
        }

        if (prior.status === 'rejected') {
          const sugId = prior.existingSuggestion?.id || `SS-${String(smartSuggestions.length + 1).padStart(4, '0')}`;
          if (!prior.existingSuggestion) {
            const rejectedSug: SmartSearchSuggestion = {
              id: sugId,
              martyrId: `MR-${String(smartSuggestions.length + 1).padStart(6, '0')}`,
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
              publisherDescription: matchedInCatalog.descriptionRaw || `کتاب موجود در قفسه کتابخانه منطبق با نام شهید «${clean}»`,
              sourcePriority: 1,
              sourceName: 'فهرست کتابخانه مرکز اسناد (۹۸۰ عنوان کتاب مرجع)',
              sourceUrl: '',
              retrievedAt: nowFa,
              matchEvidence: `تطبیق واقعی نام شهید با رکورد ${matchedInCatalog.tempBookId} در فهرست ۹۸۰ کتاب مرجع کتابخانه.`,
              catalogComparisonStatus: 'موجود در فهرست مرجع ۹۸۰ کتاب',
              matchedCatalogBookId: matchedInCatalog.tempBookId,
              reviewStatus: 'ردشده با ثبت دلیل',
              reviewerNote: prior.reason || 'رد پیشنهاد توسط کارشناس با ثبت دلیل',
              reviewedBy: prior.reviewedBy || 'کارشناس بازبین مرکز اسناد',
              reviewedAt: prior.reviewedAt || nowFa
            };
            onAddSuggestion(rejectedSug);
          }
          setLastSearchFeedback({
            targetName: clean,
            matchedInCatalog,
            suggestionId: sugId,
            status: 'already_in_queue',
            message: `توجه کارشناس: این کتاب قبلاً توسط کارشناس رد شده است. دلیل رد: «${prior.reason}» (${prior.reviewedAt || nowFa})`,
            timestamp: nowFa
          });
          setHighlightedSuggestionId(sugId);
          return;
        }

        if (prior.status === 'in_queue') {
          const existingSug = prior.existingSuggestion!;
          setLastSearchFeedback({
            targetName: clean,
            matchedInCatalog,
            suggestionId: existingSug.id,
            status: 'already_in_queue',
            message: `پیشنهاد بررسی برای شهید «${clean}» قبلاً با شناسه ${existingSug.id} در صف بررسی ثبت شده است.`,
            timestamp: existingSug.retrievedAt
          });
          setHighlightedSuggestionId(existingSug.id);
          return;
        }

        // New match
        const newId = `SS-${String(smartSuggestions.length + 1).padStart(4, '0')}`;
        const newSuggestion: SmartSearchSuggestion = {
          id: newId,
          martyrId: `MR-${String(smartSuggestions.length + 1).padStart(6, '0')}`,
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
          matchEvidence: `تطبیق واقعی نام شهید با رکورد ${matchedInCatalog.tempBookId} در فهرست ۹۸۰ کتاب مرجع کتابخانه.`,
          catalogComparisonStatus: 'موجود در فهرست مرجع ۹۸۰ کتاب',
          matchedCatalogBookId: matchedInCatalog.tempBookId,
          reviewStatus: 'در صف بررسی کارشناس',
          reviewerNote: '',
          reviewedBy: '',
          reviewedAt: ''
        };

        onAddSuggestion(newSuggestion);
        setLastSearchFeedback({
          targetName: clean,
          matchedInCatalog,
          suggestionId: newId,
          status: 'matched_catalog',
          message: `تطبیق واقعی در فهرست کتابخانه: عنوان «${matchedInCatalog.titleRaw}» (${matchedInCatalog.tempBookId}) در قفسه کتابخانه شناسایی و به صف بررسی منتقل گردید.`,
          timestamp: nowFa
        });
        setHighlightedSuggestionId(newId);
        onNotify(`کتاب واقعی «${matchedInCatalog.titleRaw}» در فهرست کتابخانه یافت شد و در صف بررسی قرار گرفت.`, 'success');
      } else {
        setLastSearchFeedback({
          targetName: clean,
          matchedInCatalog: null,
          suggestionId: '',
          status: 'not_found',
          message: `هیچ کتابی برای شهید «${clean}» در فهرست ۹۸۰ کتابخانه یافت نشد (۰ رکورد). هیچ رکورد یا ناشر فرضی ساخته نشد.`,
          timestamp: nowFa
        });
        setHighlightedSuggestionId(null);
      }
    }
  }, [initialMartyrQuery]);

  // Run Single Martyr Smart Search across Reference Catalog ONLY (Zero Fake Data)
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

    // همچنین عبارت جست‌وجوی دوطرفه را همگام کن تا کاربر بلافاصله جدول کتاب‌ها و شهدای مرتبط را ببیند
    setTwoWayQuery(targetName);

    // ۱. جست‌وجو در کاتالوگ ۹۸۰ کتاب (عنوان، توضیحات، نویسنده)
    const directCatalogMatches = catalogRows.filter((r) =>
      normalizePersianText(`${r.titleRaw} ${r.descriptionRaw} ${r.authorRaw}`).includes(normTarget)
    );

    // ۲. جست‌وجو در ۵۹۹ ردیف پژوهش سوره مهر و ۲۳۷ ردیف قطعات شهدا (ارتباط کتاب و شهید)
    const linkMatches = validResearchLinks.filter((lnk) =>
      normalizePersianText(`${lnk.martyrNameRaw} ${lnk.sourceDescriptionRaw || ''} ${lnk.bookTitleRaw}`).includes(
        normTarget
      )
    );

    // ترکیب یکتای کتاب‌های منطبق از هر دو منبع
    const matchedBooksMap = new Map<string, { book: ReferenceCatalogRow; linkEvidence?: BookMartyrLinkRecord }>();
    for (const b of directCatalogMatches) {
      matchedBooksMap.set(b.tempBookId || b.titleRaw, { book: b });
    }
    for (const lnk of linkMatches) {
      const catBook =
        catalogRows.find(
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
      }
    }

    const matchedEntries = Array.from(matchedBooksMap.values());

    if (matchedEntries.length > 0) {
      const firstEntry = matchedEntries[0];
      const matched = firstEntry.book;
      const prior = checkBookMartyrPriorStatus(targetName, matched.titleRaw, matched.tempBookId);

      // حالت ۱: اگر کتاب قبلاً توسط کارشناس تأیید شده است
      if (prior.status === 'approved') {
        const sugId = prior.existingSuggestion?.id || `SS-${String(smartSuggestions.length + 1).padStart(4, '0')}`;
        if (!prior.existingSuggestion) {
          const approvedSug: SmartSearchSuggestion = {
            id: sugId,
            martyrId: `MR-${String(smartSuggestions.length + 1).padStart(6, '0')}`,
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
            publisherDescription: matched.descriptionRaw || `کتاب موجود در کتابخانه منطبق با شهید «${targetName}»`,
            sourcePriority: 1,
            sourceName: 'فهرست کتابخانه مرکز اسناد (۹۸۰ عنوان کتاب مرجع)',
            sourceUrl: '',
            retrievedAt: nowFa,
            matchEvidence: `تطابق نام شهید با عنوان/توضیحات رکورد ${matched.tempBookId} در قفسه ${matched.locationRaw || 'کتابخانه'}.`,
            catalogComparisonStatus: 'موجود در فهرست مرجع ۹۸۰ کتاب',
            matchedCatalogBookId: matched.tempBookId,
            reviewStatus: 'تأییدشده و افزوده‌شده به پرونده',
            reviewerNote: prior.reason || 'تأیید توسط کارشناس انجام شده است (موجود در پرونده شهید)',
            reviewedBy: prior.reviewedBy || 'کارشناس بازبین مرکز اسناد',
            reviewedAt: prior.reviewedAt || nowFa
          };
          onAddSuggestion(approvedSug);
        }

        setLastSearchFeedback({
          targetName,
          matchedInCatalog: matched,
          suggestionId: sugId,
          status: 'matched_catalog',
          message: `کتاب «${matched.titleRaw}» قبلاً توسط کارشناس تأیید شده و با وضعیت «تأییدشده» در پرونده شهید «${targetName}» ثبت است.`,
          timestamp: nowFa
        });
        setHighlightedSuggestionId(sugId);
        onNotify(`کتاب «${matched.titleRaw}» قبلاً توسط کارشناس تأیید شده و در پرونده شهید موجود است.`, 'success');
        return;
      }

      // حالت ۲: اگر کتاب قبلاً توسط کارشناس رد شده است
      if (prior.status === 'rejected') {
        const sugId = prior.existingSuggestion?.id || `SS-${String(smartSuggestions.length + 1).padStart(4, '0')}`;
        if (!prior.existingSuggestion) {
          const rejectedSug: SmartSearchSuggestion = {
            id: sugId,
            martyrId: `MR-${String(smartSuggestions.length + 1).padStart(6, '0')}`,
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
            publisherDescription: matched.descriptionRaw || `کتاب موجود در کتابخانه منطبق با شهید «${targetName}»`,
            sourcePriority: 1,
            sourceName: 'فهرست کتابخانه مرکز اسناد (۹۸۰ عنوان کتاب مرجع)',
            sourceUrl: '',
            retrievedAt: nowFa,
            matchEvidence: `تطابق نام شهید با عنوان/توضیحات رکورد ${matched.tempBookId} در قفسه ${matched.locationRaw || 'کتابخانه'}.`,
            catalogComparisonStatus: 'موجود در فهرست مرجع ۹۸۰ کتاب',
            matchedCatalogBookId: matched.tempBookId,
            reviewStatus: 'ردشده با ثبت دلیل',
            reviewerNote: prior.reason || 'رد پیشنهاد توسط کارشناس با ثبت دلیل',
            reviewedBy: prior.reviewedBy || 'کارشناس بازبین مرکز اسناد',
            reviewedAt: prior.reviewedAt || nowFa
          };
          onAddSuggestion(rejectedSug);
        }

        setLastSearchFeedback({
          targetName,
          matchedInCatalog: matched,
          suggestionId: sugId,
          status: 'already_in_queue',
          message: `توجه کارشناس: این کتاب قبلاً یک‌بار توسط کارشناس رد شده است. دلیل رد قبلی: «${prior.reason}» (${prior.reviewedAt || nowFa})`,
          timestamp: nowFa
        });
        setHighlightedSuggestionId(sugId);
        onNotify(`توجه: این کتاب قبلاً توسط کارشناس رد شده است (دلیل: ${prior.reason}).`, 'warning');
        return;
      }

      // حالت ۳: اگر کتاب در حال حاضر در صف بررسی کارشناس است
      if (prior.status === 'in_queue') {
        const existingSug = prior.existingSuggestion!;
        setLastSearchFeedback({
          targetName,
          matchedInCatalog: matched,
          suggestionId: existingSug.id,
          status: 'already_in_queue',
          message: `برای «${targetName}» پیشنهاد کتاب «${matched.titleRaw}» هم‌اکنون با شناسه ${existingSug.id} در صف بررسی کارشناس قرار دارد.`,
          timestamp: existingSug.retrievedAt
        });
        setHighlightedSuggestionId(existingSug.id);
        onNotify(`پیشنهاد ${existingSug.id} هم‌اکنون در صف بررسی کارشناس موجود است.`, 'warning');
        return;
      }

      // حالت ۴: کتاب جدید برای نخستین بار کشف شده
      const newId = `SS-${String(smartSuggestions.length + 1).padStart(4, '0')}`;
      const newSuggestion: SmartSearchSuggestion = {
        id: newId,
        martyrId: `MR-${String(smartSuggestions.length + 1).padStart(6, '0')}`,
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
          matched.descriptionRaw ||
          `کتاب موجود در کتابخانه منطبق با شهید «${targetName}»`,
        sourcePriority: 1,
        sourceName: 'فهرست کتابخانه مرکز اسناد (۹۸۰ عنوان کتاب مرجع)',
        sourceUrl: '',
        retrievedAt: nowFa,
        matchEvidence: `تطابق نام شهید با عنوان/توضیحات رکورد ${matched.tempBookId} در قفسه ${matched.locationRaw || 'کتابخانه'}.`,
        catalogComparisonStatus: 'موجود در فهرست مرجع ۹۸۰ کتاب',
        matchedCatalogBookId: matched.tempBookId,
        reviewStatus: 'در صف بررسی کارشناس',
        reviewerNote: '',
        reviewedBy: '',
        reviewedAt: ''
      };

      onAddSuggestion(newSuggestion);
      setLastSearchFeedback({
        targetName,
        matchedInCatalog: matched,
        suggestionId: newId,
        status: 'matched_catalog',
        message: `تطبیق موفق در فهرست داخلی کتابخانه: عنوان «${matched.titleRaw}» (${matched.tempBookId}) در قفسه شناسایی و به صف بررسی منتقل گردید.`,
        timestamp: nowFa
      });
      setHighlightedSuggestionId(newId);
      onNotify(
        `کتاب واقعی «${matched.titleRaw}» در فهرست کتابخانه یافت شد و پیشنهاد ${newId} در صف بررسی قرار گرفت.`,
        'success'
      );
    } else {
      // هیچ کتابی در کتابخانه نیست - از تولید هرگونه اطلاعات ساختگی و جعلی کاملاً جلوگیری می‌شود!
      setLastSearchFeedback({
        targetName,
        matchedInCatalog: null,
        suggestionId: '',
        status: 'not_found',
        message: `هیچ کتاب یا سابقه‌ای برای «${targetName}» در فهرست ۹۸۰ کتاب مرجع کتابخانه یافت نشد (نتیجه: ۰ مورد). هیچ رکورد یا ناشر ساختگی در صف بررسی ایجاد نگردید.`,
        timestamp: nowFa
      });
      setHighlightedSuggestionId(null);
      onNotify(
        `هیچ کتابی برای «${targetName}» در فهرست ۹۸۰ کتاب کتابخانه یافت نشد (۰ مورد). رکوردی اضافه نشد.`,
        'warning'
      );
    }
  };

  // Handle Bulk Excel Upload for Martyr Names
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

      // Detect martyr name column
      const headers = (rawMatrix[0] || []).map((h) => String(h || '').trim());
      let nameColIdx = headers.findIndex((h) =>
        /نام.*شهید|شهید|نام.*خانوادگی|نام/i.test(h)
      );
      if (nameColIdx < 0) nameColIdx = 0; // fallback to column 0

      const extractedNames: string[] = [];
      for (let i = 1; i < rawMatrix.length; i++) {
        const row = rawMatrix[i];
        if (!row) continue;
        const rawVal = String(row[nameColIdx] || '').trim();
        if (rawVal && rawVal !== 'نام شهید' && !rawVal.startsWith('---')) {
          extractedNames.push(rawVal);
        }
      }

      const uniqueNames = Array.from(new Set(extractedNames)).slice(0, 100);
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

  // Run Bulk Martyr Search across 980 Books (Zero Fake Data)
  const handleRunBulkMartyrSearch = () => {
    let namesToSearch: string[] = [];

    if (bulkInputMode === 'excel') {
      namesToSearch = bulkLoadedNames;
    } else if (bulkInputMode === 'text') {
      namesToSearch = bulkTextNames
        .split(/[\n،,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      // ONLY search martyrs explicitly created in Tab 3 (zero hidden or phantom martyrs)
      namesToSearch = customMartyrs.map((m) => m.fullName);
    }

    if (namesToSearch.length === 0) {
      if (bulkInputMode === 'system') {
        onNotify(
          'هیچ پرونده‌ای در برگه ۳ (پرونده شهدا) ثبت نشده است (۰ پرونده). لطفاً ابتدا در برگه ۳ پرونده شهدا را ثبت نمایید یا از گزینه‌های ورود متنی یا بارگذاری اکسل استفاده فرمایید.',
          'warning'
        );
      } else {
        onNotify(
          'هیچ نام شهیدی مشخص نشده است. لطفاً فایل اکسل را بارگذاری کرده یا اسامی را در کادر وارد نمایید.',
          'warning'
        );
      }
      return;
    }

    setPilotStatus('running');
    let processed = 0;
    let found = 0;
    let duplicates = 0;
    const nowFa = new Intl.DateTimeFormat('fa-IR').format(new Date());

    namesToSearch.forEach((rawName) => {
      const cleanName = rawName.replace(/^شهید\s+/, '').trim();
      const normName = normalizePersianText(cleanName);
      if (!normName) return;

      processed++;

      // Check if already in suggestions queue
      const alreadyInQueue = smartSuggestions.some((s) =>
        normalizePersianText(s.martyrName).includes(normName)
      );

      if (alreadyInQueue) {
        duplicates++;
        return;
      }

      // Search Reference Catalog (980 books) AND Soreh Mehr / Golzar Research Links (836 rows)
      const matchedLink = validResearchLinks.find((lnk) =>
        normalizePersianText(lnk.martyrNameRaw).includes(normName)
      );
      const matched =
        catalogRows.find((r) =>
          normalizePersianText(`${r.titleRaw} ${r.descriptionRaw} ${r.authorRaw}`).includes(normName)
        ) ||
        (matchedLink
          ? catalogRows.find(
              (c) =>
                (matchedLink.tempBookId && c.tempBookId === matchedLink.tempBookId) ||
                normalizePersianText(c.titleRaw) === normalizePersianText(matchedLink.bookTitleRaw)
            )
          : undefined);

      if (matched) {
        found++;
        const newId = `SS-${String(smartSuggestions.length + found).padStart(4, '0')}`;
        const variants = generateMartyrNameVariants(rawName, '');
        const prior = checkBookMartyrPriorStatus(rawName, matched.titleRaw, matched.tempBookId);

        let initialStatus: SmartSuggestionReviewStatus = 'در صف بررسی کارشناس';
        let initialNote = '';
        let initialReviewedBy = '';
        let initialReviewedAt = '';

        if (prior.status === 'approved') {
          initialStatus = 'تأییدشده و افزوده‌شده به پرونده';
          initialNote = prior.reason || 'تأیید توسط کارشناس انجام شده است (موجود در پرونده شهید)';
          initialReviewedBy = prior.reviewedBy || 'کارشناس بازبین مرکز اسناد';
          initialReviewedAt = prior.reviewedAt || nowFa;
        } else if (prior.status === 'rejected') {
          initialStatus = 'ردشده با ثبت دلیل';
          initialNote = prior.reason || 'رد پیشنهاد توسط کارشناس با ثبت دلیل';
          initialReviewedBy = prior.reviewedBy || 'کارشناس بازبین مرکز اسناد';
          initialReviewedAt = prior.reviewedAt || nowFa;
        }

        const newSug: SmartSearchSuggestion = {
          id: newId,
          martyrId: `MR-${String(smartSuggestions.length + found).padStart(6, '0')}`,
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
          matchEvidence: `تطبیق موفق در جست‌وجوی انبوه با رکورد ${matched.tempBookId} در فهرست ۹۸۰ کتاب مرجع کتابخانه.`,
          catalogComparisonStatus: 'موجود در فهرست مرجع ۹۸۰ کتاب',
          matchedCatalogBookId: matched.tempBookId,
          reviewStatus: initialStatus,
          reviewerNote: initialNote,
          reviewedBy: initialReviewedBy,
          reviewedAt: initialReviewedAt
        };
        onAddSuggestion(newSug);
      }
    });

    setPilotProcessedCount(processed);
    setPilotFoundCount(found);
    setPilotDuplicatePrevented(duplicates);
    setPilotStatus('completed');

    onNotify(
      `جست‌وجوی انبوه انجام شد: ${toPersianDigits(processed)} شهید بررسی شد، ${toPersianDigits(found)} کتاب واقعی تطبیق یافت و ${toPersianDigits(duplicates)} مورد تکراری مهار گردید.`,
      found > 0 ? 'success' : undefined
    );
  };

  const handleManualAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim() || !manualPublisher.trim()) {
      onNotify('عنوان کتاب و نام ناشر الزامی است.', 'warning');
      return;
    }

    const nowFa = new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date());

    const newId = `SS-${String(smartSuggestions.length + 1).padStart(4, '0')}`;
    const newSug: SmartSearchSuggestion = {
      id: newId,
      martyrId: `MR-${String(smartSuggestions.length + 1).padStart(6, '0')}`,
      martyrName: selectedMartyrName.trim() || 'شهید',
      martyrAlternativeNames: computedVariants,
      bookTitle: manualTitle.trim(),
      authors: manualAuthor.trim() || '—',
      publisher: manualPublisher.trim(),
      publishYear: manualYear.trim() || '',
      editionInfo: 'ثبت دستی مستقیم کارشناس',
      isbn: 'استعلام کارشناس',
      fipa: '—',
      subjectCategory: SUBJECT_CATEGORIES[0].label,
      publisherDescription: manualNote.trim() || `کتاب واقعی شناسایی‌شده توسط پژوهشگر از ${manualSource}`,
      sourcePriority: 1,
      sourceName: manualSource,
      sourceUrl: '',
      retrievedAt: nowFa,
      matchEvidence: `ثبت دستی مشخصات واقعی توسط پژوهشگر با استناد به پایگاه ${manualSource}.`,
      catalogComparisonStatus: 'کتاب جدید (ثبت دستی کارشناس از منابع بیرونی)',
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
    setManualNote('');
    setHighlightedSuggestionId(newId);
    onNotify(`کتاب واقعی «${newSug.bookTitle}» با شناسه ${newId} در صف بررسی ثبت شد.`, 'success');
  };

  const filteredSuggestions = useMemo(() => {
    return smartSuggestions.filter((s) => {
      if (queueFilter !== 'ALL' && s.reviewStatus !== queueFilter) return false;
      if (selectedSourceCode !== 'ALL') {
        const srcMeta = OFFICIAL_SEARCH_SOURCES.find((src) => src.code === selectedSourceCode);
        if (srcMeta && s.sourcePriority !== srcMeta.priority) return false;
      }
      return true;
    });
  }, [smartSuggestions, queueFilter, selectedSourceCode]);

  const handleApproveItem = (sug: SmartSearchSuggestion) => {
    const nowFa = new Intl.DateTimeFormat('fa-IR').format(new Date());
    const updated: SmartSearchSuggestion = {
      ...sug,
      reviewStatus: 'تأییدشده و افزوده‌شده به پرونده',
      reviewedBy: 'کارشناس بازبین مرکز اسناد',
      reviewedAt: nowFa,
      reviewerNote: sug.reviewerNote || 'تأیید کارشناس مشخصات کتاب‌شناختی و ارتباط با شهید'
    };

    const newLink: BookMartyrLinkRecord = {
      id: `RL-SS-${sug.id}`,
      martyrNameRaw: sug.martyrName,
      bookTitleRaw: sug.bookTitle,
      alternativeTitle: '',
      publisherRaw: sug.publisher,
      sourceDescriptionRaw: `${sug.authors} | شابک: ${sug.isbn} | منبع: ${sug.sourceName}`,
      pageReferenceRaw: '',
      gravePieceRaw: '',
      graveRowRaw: '',
      graveNumberRaw: '',
      reviewStatus: 'تأییدشده',
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

    // If this martyr and book had a prior rejection record, remove from rejectedHistory since now approved
    const filteredHist = rejectedHistory.filter(
      (h) => !(h.martyrName === sug.martyrName && h.bookTitle === sug.bookTitle)
    );
    setRejectedHistory(filteredHist);
    saveRejectedHistory(filteredHist);
    onNotify(`پیشنهاد «${sug.bookTitle}» برای «${sug.martyrName}» تأیید و به پرونده شهید منتقل گردید.`, 'success');
  };

  const handleConfirmReject = (sug: SmartSearchSuggestion) => {
    if (!rejectReason.trim()) {
      onNotify('ثبت دلیل رد پیشنهاد برای مستندسازی الزامی است.', 'warning');
      return;
    }
    const nowFa = new Intl.DateTimeFormat('fa-IR').format(new Date());
    const reason = rejectReason.trim();
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
  };

  const handleSaveEditDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDraft) return;
    onUpdateSuggestion(editDraft);
    setEditingId(null);
    setEditDraft(null);
    onNotify(`مشخصات پیشنهاد ${editDraft.id} در صف بررسی اصلاح شد.`);
  };

  return (
    <div className="space-y-6">
      {/* Header & Quality Control Rule Banner */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="text-base sm:text-lg font-bold text-[#253247] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#C58A2B]" />
            <span>مقابله و جست‌وجوی دوطرفه کتاب‌ها و شهدا (پژوهش سوره مهر، کارپوشه و ۹۸۰ کتاب)</span>
          </h1>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2 text-xs text-[#253247] flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-[#C58A2B] shrink-0" />
            <span>
              <strong>قاعده کنترل کیفیت:</strong> وضعیت «بررسی‌شده در پژوهش اصلی» از «تأییدشده کارشناسی» تفکیک شده و ارجاعات صفحه خام عیناً حفظ شده است.
            </span>
          </div>
        </div>
      </section>

      {/* بخش اصلی مقابله و جست‌وجوی دوطرفه عنوان کتاب و نام شهید (فایل لیست کتابهای و شهدای مرتبط.xlsx) */}
      <section className="bg-white border-2 border-[#8C3B2B]/30 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="space-y-1">
            <h2 className="text-sm sm:text-base font-bold text-[#8C3B2B] flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[#8C3B2B]" />
              <span>
                جست‌وجوی دوطرفه عنوان کتاب و نام شهید (پژوهش «{SOOREH_MEHR_RESEARCH_STATS.sourceFileName}» و «قطعات شهدا»)
              </span>
            </h2>
            <p className="text-xs text-slate-600">
              اگر <strong>عنوان کتاب</strong> (مانند «یک محسن عزیز» یا «یادداشت های ناتمام») را جست‌وجو کنید، تمامی شهدای مرتبط با توضیحات، قطعه/ردیف/شماره مزار و شماره صفحه نمایش داده می‌شوند؛ و اگر <strong>نام شهید</strong> (مانند «جعفر جنگروی»، «محسن وزوایی»، «علی سمندریان»، «سید محمد شکری») را جست‌وجو کنید، کتاب(های) مرتبط و صفحات مربوطه نمایش داده می‌شود.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
            <span className="px-2.5 py-1 rounded-lg bg-[#FAF2E8] text-[#8C3B2B] border border-[#E6D5C1]">
              ردیف‌های پژوهش سوره مهر: {toPersianDigits(SOOREH_MEHR_RESEARCH_STATS.totalResearchRows)} ردیف
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-[#1F4E79] border border-blue-200">
              ارتباط‌های فعال کتاب و شهید: {toPersianDigits(validResearchLinks.length)} ارتباط ({toPersianDigits(SOOREH_MEHR_RESEARCH_STATS.totalBookMartyrRelations)} سوره مهر + {toPersianDigits(validResearchLinks.length - SOOREH_MEHR_RESEARCH_STATS.totalBookMartyrRelations)} قطعات شهدا)
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-[#2E7D5B] border border-emerald-200">
              مطالب استخراج‌شده: {toPersianDigits(extractedItems.length)} مورد
            </span>
          </div>
        </div>

        {/* کادر جست‌وجوی دوطرفه + فیلتر منبع */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
          <div className="md:col-span-8 relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={twoWayQuery}
              onChange={(e) => setTwoWayQuery(e.target.value)}
              placeholder="عنوان کتاب (مثلاً: یک محسن عزیز، یادداشت های ناتمام) یا نام شهید (مثلاً: جعفر جنگروی، علی سمندریان، وزوایی)..."
              className="w-full min-h-[46px] pr-10 pl-3 py-2 text-xs sm:text-sm bg-[#FDF8F2] border border-[#E6D5C1] rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-[#8C3B2B]"
            />
          </div>

          <div className="md:col-span-3">
            <select
              value={twoWaySourceFilter}
              onChange={(e) => setTwoWaySourceFilter(e.target.value as 'all' | 'sooreh' | 'golzar')}
              className="w-full min-h-[46px] px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl font-bold text-slate-800"
            >
              <option value="all">همه منابع پژوهشی ({toPersianDigits(validResearchLinks.length)} ارتباط)</option>
              <option value="sooreh">فقط منبع سوره مهر ({toPersianDigits(SOOREH_MEHR_RESEARCH_STATS.totalBookMartyrRelations)} ارتباط)</option>
              <option value="golzar">فقط منبع قطعات شهدا (۲۳۷ ارتباط)</option>
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
              className="w-full min-h-[46px] px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center justify-center cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* دکمه‌های نمونه سریع برای آزمایش فوری مثال‌های کاربر */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="font-bold text-slate-600 ml-1">آزمون سریع نمونه‌های پژوهشی سوره مهر:</span>
          {[
            { label: 'کتاب: یک محسن عزیز', q: 'یک محسن عزیز' },
            { label: 'کتاب: یادداشت های ناتمام', q: 'یادداشت های ناتمام' },
            { label: 'شهید: جعفر جنگروی', q: 'جعفر جنگروی' },
            { label: 'شهید: محسن وزوایی', q: 'محسن وزوایی' },
            { label: 'شهید: ابراهیم هادی', q: 'ابراهیم هادی' },
            { label: 'شهید: علیرضا موحد دانش', q: 'علیرضا موحد دانش' },
            { label: 'شهید: علی سمندریان', q: 'علی سمندریان' },
            { label: 'شهید: سید محمد شکری', q: 'سید محمد شکری' },
            { label: 'کتاب: سیزده در هفت', q: 'سیزده در هفت' },
            { label: 'کتاب: فرکانس 1160', q: 'فرکانس 1160' }
          ].map((chip) => (
            <button
              key={chip.q}
              type="button"
              onClick={() => setTwoWayQuery(chip.q)}
              className={`px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                twoWayQuery === chip.q
                  ? 'bg-[#8C3B2B] text-white border-[#8C3B2B] font-bold'
                  : 'bg-slate-50 hover:bg-[#FAF2E8] text-slate-700 border-slate-200'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* نتایج گروه‌بندی‌شده بر اساس کتاب به همراه فهرست کامل شهدای هر کتاب */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-600 px-1">
            <span>
              نتیجه مقابله:{' '}
              <strong className="text-[#8C3B2B]">{toPersianDigits(twoWayMatchedBookGroups.length)}</strong>{' '}
              عنوان کتاب دارای ارتباط با شهید یافت شد
              {twoWayMatchedBookGroups.length > 30 ? ' (نمایش ۳۰ کتاب نخست؛ برای محدودسازی عبارت دقیق‌تر بنویسید)' : ''}
            </span>
          </div>

          {twoWayMatchedBookGroups.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900">
              هیچ ارتباط ثبت‌شده‌ای در شیت پژوهش سوره مهر یا کارپوشه شهدا با عبارت «{twoWayQuery}» یافت نشد.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 max-h-[540px] overflow-y-auto pr-0.5">
              {twoWayMatchedBookGroups.slice(0, 30).map((grp) => (
                <div
                  key={grp.bookKey}
                  className="bg-[#FDF8F2]/60 border border-[#E6D5C1] rounded-2xl p-3.5 sm:p-4 space-y-2.5"
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
                        {grp.alternativeTitle && (
                          <span className="text-xs text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md border border-amber-200">
                            عنوان در شیت منبع: {grp.alternativeTitle}
                          </span>
                        )}
                        <span className="text-xs font-semibold text-[#8C3B2B] bg-white px-2 py-0.5 rounded-md border border-[#E6D5C1]">
                          ناشر: {grp.publisher}
                        </span>
                      </div>
                      {grp.description && (
                        <div className="text-xs text-slate-700 font-medium">
                          توضیحات کتاب در پژوهش: <strong className="text-slate-900">{grp.description}</strong>
                        </div>
                      )}
                    </div>

                    <span className="text-[11px] font-bold text-[#1F4E79] bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                      {toPersianDigits(grp.allBookLinks.length)} ردیف شهید / عبارت مرتبط
                    </span>
                  </div>

                  {/* جدول شهدای مرتبط با این کتاب */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs border-collapse">
                      <thead>
                        <tr className="bg-white/90 text-slate-600 border-b border-[#E6D5C1]">
                          <th className="py-1.5 px-2 font-bold">نام و نام خانوادگی شهید / عبارت ثبت‌شده</th>
                          <th className="py-1.5 px-2 font-bold">قطعه</th>
                          <th className="py-1.5 px-2 font-bold">ردیف</th>
                          <th className="py-1.5 px-2 font-bold">شماره</th>
                          <th className="py-1.5 px-2 font-bold">شماره صفحه / ارجاع در کتاب</th>
                          <th className="py-1.5 px-2 font-bold">منبع و ردیف اکسل</th>
                          <th className="py-1.5 px-2 font-bold">وضعیت بررسی</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E6D5C1]/50">
                        {grp.allBookLinks.map((lnk) => {
                          const isHighlighted = grp.matchedMartyrLinkIds.has(lnk.id);
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
                              <td className="py-2 px-2 tabular-nums">
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
                              <td className="py-2 px-2 text-[11px] text-slate-500">
                                {lnk.sourceFile?.includes('لیست کتابهای') ? 'سوره مهر' : 'قطعات شهدا'} · ردیف{' '}
                                {toPersianDigits(lnk.sourceExcelRow)}
                              </td>
                              <td className="py-2 px-2">
                                <span
                                  className={`inline-block text-[10.5px] px-2 py-0.5 rounded-md border ${
                                    lnk.reviewStatus.includes('تأیید')
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 font-bold'
                                      : lnk.reviewStatus.includes('پژوهش اصلی')
                                      ? 'bg-blue-50 text-[#1F4E79] border-blue-200 font-bold'
                                      : 'bg-amber-50 text-amber-800 border-amber-200'
                                  }`}
                                >
                                  {lnk.reviewStatus}
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
      </section>

      {/* Two-Column Engine: Single Martyr Search + Batch 20-Martyr Pilot */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Column 1: Single Martyr Search with Name Variant Generator */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
          <h2 className="text-sm font-bold text-[#253247] flex items-center gap-2">
            <Search className="w-4 h-4 text-[#1F4E79]" />
            <span>۱. جست‌وجوی هوشمند تکی بر اساس نام شهید و اشکال نوشتاری</span>
          </h2>

          <form onSubmit={handleRunSingleMartyrSearch} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

            {/* Generated Spelling Variants Preview */}
            <div className="bg-[#EAF1F7]/70 rounded-xl p-2.5 text-xs space-y-1">
              <div className="font-bold text-[#1F4E79]">
                اشکال مختلف نوشتاری و سرشناسه‌های تولیدشده برای موتور جست‌وجو:
              </div>
              <div className="text-[#253247]">
                {computedVariants.length > 0 ? computedVariants.join(' · ') : '—'}
              </div>
            </div>

            {/* راهنمای مرجع پایگاه‌های کتاب و مقالات مطابق درخواست مستقیم کاربر */}
            <div className="bg-[#F0F5FA] border border-[#1F4E79]/20 rounded-xl p-3 space-y-1.5 text-xs text-[#1F4E79]">
              <div className="flex items-center gap-1.5 font-bold text-xs text-[#1F4E79]">
                <Info className="w-4 h-4 text-[#1F4E79] shrink-0" />
                <span>راهنمای استعلام و منابع معتبر کتاب و مقالات:</span>
              </div>
              <p className="text-[#334155] leading-relaxed text-[11px]">
                «برای جستجوی کتاب‌های چاپ شده در مورد یک فرد، می‌توانید از پایگاه اطلاعاتی سازمان اسناد و کتابخانه ملی یا سایت خانه کتاب و ادبیات ایران استفاده کنید. برای مقاله‌ها، سامانه‌های معتبری مثل مگیران، نورمگز و سیویلیکا منابع خوبی هستند.»
              </p>
            </div>

            {/* ابزار کاوش مستقیم در منابع اینترنتی، کتابشناسی، مقالات و ناشران تخصصی دفاع مقدس */}
            <div className="bg-[#FAF3EA] border border-[#E6D5C1] rounded-xl p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-[#8C3B2B] flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-[#8C3B2B]" />
                  <span>کاوش مستقیم اینترنتی برای «{selectedMartyrName || 'شهید'}»:</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPublishersModal(true)}
                  className="px-2.5 py-1 bg-[#8C3B2B] hover:bg-[#702D20] text-white text-[11px] font-bold rounded-lg inline-flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>۱۸ انتشارات تخصصی دفاع مقدس</span>
                </button>
              </div>

              {/* بخش ۱: کتاب‌ها و اسناد کتابشناسی */}
              <div className="space-y-1">
                <div className="text-[10px] font-bold text-slate-600 flex items-center gap-1">
                  <BookOpen className="w-3 h-3 text-[#1F4E79]" />
                  <span>پایگاه‌های کتابشناسی و اسناد:</span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent('کتاب "شهید ' + selectedMartyrName + '"')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg inline-flex items-center gap-1 font-semibold"
                  >
                    <ExternalLink className="w-3 h-3 text-blue-600" />
                    <span>گوگل</span>
                  </a>
                  <a
                    href={`https://ketab.ir/search?query=${encodeURIComponent(selectedMartyrName)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg inline-flex items-center gap-1 font-semibold"
                  >
                    <ExternalLink className="w-3 h-3 text-emerald-600" />
                    <span>خانه کتاب (Ketab.ir)</span>
                  </a>
                  <a
                    href={`http://opac.nlai.ir/opac-prod/bibliographic/searchCalc.do?action=search&bibData.title=&bibData.author=${encodeURIComponent(selectedMartyrName)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg inline-flex items-center gap-1 font-semibold"
                  >
                    <ExternalLink className="w-3 h-3 text-amber-700" />
                    <span>کتابخانه ملی (NLAI)</span>
                  </a>
                  <a
                    href={`https://www.noorlib.ir/fa/search?q=${encodeURIComponent(selectedMartyrName)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg inline-flex items-center gap-1 font-semibold"
                  >
                    <ExternalLink className="w-3 h-3 text-indigo-600" />
                    <span>پایگاه نور (NoorLib)</span>
                  </a>
                </div>
              </div>

              {/* بخش ۲: مقاله‌ها و نشریات پژوهشی (مگیران، نورمگز، سیویلیکا) */}
              <div className="space-y-1 pt-1 border-t border-[#E6D5C1]/60">
                <div className="text-[10px] font-bold text-slate-600 flex items-center gap-1">
                  <Newspaper className="w-3 h-3 text-[#2E7D5B]" />
                  <span>پایگاه‌های معتبر مقالات و نشریات:</span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <a
                    href={`https://www.magiran.com/search?q=${encodeURIComponent('شهید ' + selectedMartyrName)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="پایگاه اطلاعات نشریات کشور (مگیران)"
                    className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg inline-flex items-center gap-1 font-semibold"
                  >
                    <ExternalLink className="w-3 h-3 text-teal-600" />
                    <span>مگیران (Magiran)</span>
                  </a>
                  <a
                    href={`https://www.noormags.ir/view/fa/search?q=${encodeURIComponent('شهید ' + selectedMartyrName)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="پایگاه مجلات تخصصی نور (نورمگز)"
                    className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg inline-flex items-center gap-1 font-semibold"
                  >
                    <ExternalLink className="w-3 h-3 text-cyan-600" />
                    <span>نورمگز (NoorMags)</span>
                  </a>
                  <a
                    href={`https://civilica.com/search/paper/k-${encodeURIComponent('شهید ' + selectedMartyrName)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="مرجع مقالات و همایش‌های علمی (سیویلیکا)"
                    className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg inline-flex items-center gap-1 font-semibold"
                  >
                    <ExternalLink className="w-3 h-3 text-orange-600" />
                    <span>سیویلیکا (Civilica)</span>
                  </a>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <button
                type="submit"
                className="w-full sm:w-auto min-h-[42px] px-5 py-2 rounded-xl bg-[#1F4E79] hover:bg-[#163a5b] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                <span>اجرای تطبیق هوشمند و افزودن به صف بررسی کارشناس</span>
              </button>
            </div>
          </form>
        </div>

        {/* Column 2: User-Driven Bulk Martyr Search Engine (Excel / Text List) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3.5 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#253247] flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-[#2E7D5B]" />
                <span>۲. جست‌وجوی انبوه و تطبیق دسته‌ای نام شهدا</span>
              </h2>
              <span className="text-xs font-bold text-[#1F4E79] tabular-nums">
                {pilotProcessedCount > 0
                  ? `${toPersianDigits(pilotProcessedCount)} شهید بررسی‌شده`
                  : 'آماده دریافت اسامی'}
              </span>
            </div>

            {/* Input Mode Selector */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setBulkInputMode('excel')}
                className={`py-1.5 px-2 rounded-lg transition-colors ${
                  bulkInputMode === 'excel'
                    ? 'bg-white text-[#1F4E79] shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                بارگذاری اکسل
              </button>
              <button
                type="button"
                onClick={() => setBulkInputMode('text')}
                className={`py-1.5 px-2 rounded-lg transition-colors ${
                  bulkInputMode === 'text'
                    ? 'bg-white text-[#1F4E79] shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ورود متنی اسامی
              </button>
              <button
                type="button"
                onClick={() => setBulkInputMode('system')}
                className={`py-1.5 px-2 rounded-lg transition-colors ${
                  bulkInputMode === 'system'
                    ? 'bg-white text-[#1F4E79] shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                پرونده‌های برگه شهدا ({toPersianDigits(customMartyrs.length)})
              </button>
            </div>

            {/* Mode 1: Excel File Upload */}
            {bulkInputMode === 'excel' && (
              <div className="space-y-2">
                <label className="flex flex-col items-center justify-center p-3.5 border-2 border-dashed border-slate-300 hover:border-[#1F4E79] rounded-xl cursor-pointer bg-slate-50/70 hover:bg-blue-50/40 transition-colors">
                  <Upload className="w-5 h-5 text-[#1F4E79] mb-1" />
                  <span className="text-xs font-bold text-slate-800">
                    انتخاب فایل اکسل حاوی نام شهدا (.xlsx, .xls, .csv)
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5">
                    ستون نام شهید به طور خودکار استخراج می‌شود (تا ۱۰۰ شهید)
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
                    <span className="font-semibold truncate">
                      ✓ فایل: {bulkLoadedFileName}
                    </span>
                    <span className="font-bold font-mono">
                      {toPersianDigits(bulkLoadedNames.length)} شهید آماده
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Mode 2: Textarea for custom martyr names */}
            {bulkInputMode === 'text' && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  نام شهدا را وارد یا چسبانده (هر نام در یک خط یا با ویرگول):
                </label>
                <textarea
                  rows={3}
                  value={bulkTextNames}
                  onChange={(e) => setBulkTextNames(e.target.value)}
                  placeholder="مثال:&#10;محمد ابراهیم همت&#10;احمد بیابانی&#10;ابراهیم هادی&#10;حسن باقری"
                  className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-xl focus:ring-1 focus:ring-[#1F4E79] focus:outline-none"
                />
              </div>
            )}

            {/* Mode 3: Custom Martyrs from Tab 3 (Zero Hidden Martyrs) */}
            {bulkInputMode === 'system' && (
              <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl text-xs text-blue-950 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold">پرونده‌های ثبت‌شده در برگه ۳ (پرونده شهدا):</span>
                  <span className="font-mono px-2 py-0.5 bg-blue-100 text-blue-800 rounded-md font-bold text-[11px]">
                    {toPersianDigits(customMartyrs.length)} پرونده
                  </span>
                </div>
                {customMartyrs.length === 0 ? (
                  <div className="text-[11px] text-amber-800 bg-amber-50/90 p-2.5 rounded-lg border border-amber-200 leading-relaxed">
                    در حال حاضر هیچ پرونده‌ای در برگه ۳ (پرونده شهدا) ثبت نشده است (۰ پرونده). شما می‌توانید به برگه ۳ رفته و پرونده شهدا را ثبت نمایید، یا در همین‌جا از برگه‌های «ورود متنی اسامی» یا «انتخاب فایل اکسل» استفاده کنید.
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-700 bg-white/80 p-2.5 rounded-lg border border-blue-100 max-h-24 overflow-y-auto leading-relaxed">
                    <span className="font-semibold text-slate-900">فهرست اسامی آماده تطبیق: </span>
                    {customMartyrs.map((m) => m.fullName).join(' · ')}
                  </div>
                )}
              </div>
            )}

            {/* Live Metrics (Zero-based by default) */}
            <div className="grid grid-cols-3 gap-2 text-center bg-[#F5F7FA] p-2.5 rounded-xl text-xs border border-slate-200">
              <div>
                <div className="text-[#697586] text-[11px]">بررسی‌شده</div>
                <div className="font-bold text-[#253247] tabular-nums">
                  {toPersianDigits(pilotProcessedCount)} شهید
                </div>
              </div>
              <div>
                <div className="text-[#697586] text-[11px]">کتاب منطبق</div>
                <div className="font-bold text-[#2E7D5B] tabular-nums">
                  {toPersianDigits(pilotFoundCount)} کتاب
                </div>
              </div>
              <div>
                <div className="text-[#697586] text-[11px]">تکرار مهارشده</div>
                <div className="font-bold text-[#C58A2B] tabular-nums">
                  {toPersianDigits(pilotDuplicatePrevented)} مورد
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handleRunBulkMartyrSearch}
              disabled={pilotStatus === 'running'}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#2E7D5B] hover:bg-[#246348] disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Play className="w-4 h-4" />
              <span>
                {pilotStatus === 'running'
                  ? 'در حال تطبیق با ۹۸۰ کتاب...'
                  : 'اجرای تطبیق انبوه با ۹۸۰ کتاب مرجع'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPilotStatus('idle');
                setPilotProcessedCount(0);
                setPilotFoundCount(0);
                setPilotDuplicatePrevented(0);
                setBulkLoadedNames([]);
                setBulkLoadedFileName('');
                setBulkTextNames('');
                onNotify('شمارنده‌ها و لیست جست‌وجوی انبوه پاک شدند.');
              }}
              className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#253247] text-xs font-medium flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>بازنشانی</span>
            </button>
          </div>
        </div>
      </section>

      {/* نتیجه تعاملی و بازخورد شفاف کاوش هوشمند برای کاربر */}
      {lastSearchFeedback && (
        <div
          className={`rounded-2xl p-4 sm:p-5 border transition-all shadow-xs ${
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
                <h3 className="font-bold text-sm sm:text-base">
                  {lastSearchFeedback.status === 'matched_catalog'
                    ? `تطبیق در فهرست ۹۸۰ کتاب داخلی کتابخانه: کتاب منطبق شناسایی شد`
                    : lastSearchFeedback.status === 'already_in_queue'
                    ? `پرونده در صف بررسی کارشناس از قبل موجود است`
                    : lastSearchFeedback.status === 'not_found'
                    ? `نتیجه تطبیق: کتابی در فهرست ۹۸۰ عنوان کتابخانه یافت نشد (۰ رکورد)`
                    : `کاوش بیرونی: رکورد به صف بررسی اضافه گردید`}
                </h3>
              </div>
              <p className="text-xs sm:text-sm leading-relaxed pr-7">
                {lastSearchFeedback.message}
              </p>
              {lastSearchFeedback.suggestionId && (
                <div className="text-[11px] text-slate-500 pr-7 pt-0.5">
                  شناسه در صف بررسی: <strong className="font-mono text-slate-700" dir="ltr">{lastSearchFeedback.suggestionId}</strong> · زمان بررسی: {lastSearchFeedback.timestamp}
                </div>
              )}
            </div>

            <div className="shrink-0 flex items-center gap-2">
              {lastSearchFeedback.status === 'not_found' ? (
                <button
                  type="button"
                  onClick={() => {
                    setManualTitle('');
                    setManualPublisher('');
                    setManualAuthor('');
                    setManualYear('');
                    setManualNote(`کشف‌شده در بررسی بیرونی برای شهید ${lastSearchFeedback.targetName}`);
                    setShowManualAddModal(true);
                  }}
                  className="px-4 py-2 bg-[#1F4E79] hover:bg-[#163a5b] text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>ثبت دستی کتاب جدید (در صورت کشف)</span>
                </button>
              ) : lastSearchFeedback.suggestionId ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const targetEl = document.getElementById(`suggestion-${lastSearchFeedback.suggestionId}`);
                      if (targetEl) {
                        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        setHighlightedSuggestionId(lastSearchFeedback.suggestionId);
                      }
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors ${
                      lastSearchFeedback.status === 'matched_catalog'
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : lastSearchFeedback.status === 'already_in_queue'
                        ? 'bg-amber-600 hover:bg-amber-700 text-white'
                        : 'bg-[#1F4E79] hover:bg-[#163a5b] text-white'
                    }`}
                  >
                    <ArrowDown className="w-4 h-4" />
                    <span>مشاهده در صف بررسی کارشناس ⬇️</span>
                  </button>

                  {lastSearchFeedback.status === 'already_in_queue' && onDeleteSuggestion && (
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteSuggestion(lastSearchFeedback.suggestionId);
                        setLastSearchFeedback(null);
                        setHighlightedSuggestionId(null);
                        onNotify(`پیشنهاد ${lastSearchFeedback.suggestionId} از صف بررسی حذف شد.`);
                      }}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white inline-flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                      title="حذف فوری این پیشنهاد از صف بررسی و پاک‌سازی سابقه"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>حذف از صف 🗑️</span>
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Human Specialist Review Queue (صف بررسی کارشناس) */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-[#253247]">
              صف بررسی کارشناس ({toPersianDigits(filteredSuggestions.length)} پیشنهاد)
            </h2>
            <p className="text-xs text-[#697586] mt-0.5">
              مقایسه پیشنهادهای بیرونی با فهرست ۹۸۰ کتاب مرجع، مشاهده شواهد تشخیص ارتباط، ویرایش مشخصات، حذف یا تأیید مستند
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={handleSyncAndPurgeOrphans}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-[#253247] border border-slate-300 rounded-xl font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
              title="همگام‌سازی صف و حذف خودکار سوابق تستی یا شهیدان حذف‌شده"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#8C3B2B]" />
              <span>همگام‌سازی و پاک‌سازی سوابق باطل</span>
            </button>

            {smartSuggestions.length > 0 && onClearAllSuggestions && (
              <button
                type="button"
                onClick={() => {
                  onClearAllSuggestions();
                  setLastSearchFeedback(null);
                  setHighlightedSuggestionId(null);
                  onNotify('صف بررسی کارشناس کاملاً پاک‌سازی و صفر گردید.');
                }}
                className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                title="پاک‌سازی کامل صف بررسی و صفر کردن همه رکوردهای جستجو"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>پاک‌سازی کامل صف ({toPersianDigits(smartSuggestions.length)})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setManualTitle('');
                setManualPublisher('');
                setManualAuthor('');
                setManualYear('');
                setManualNote('');
                setShowManualAddModal(true);
              }}
              className="px-3 py-2 bg-[#1F4E79] hover:bg-[#163a5b] text-white rounded-xl font-bold inline-flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
            >
              <Plus className="w-4 h-4" />
              <span>ثبت دستی کتاب جدید</span>
            </button>

            <select
              value={queueFilter}
              onChange={(e) =>
                setQueueFilter(e.target.value as 'ALL' | SmartSuggestionReviewStatus)
              }
              className="px-3 py-2 rounded-xl border border-slate-300 bg-[#F5F7FA] text-[#253247] font-medium"
            >
              <option value="ALL">همه وضعیت‌های صف ({toPersianDigits(smartSuggestions.length)})</option>
              <option value="در صف بررسی کارشناس">در صف بررسی کارشناس</option>
              <option value="تأییدشده و افزوده‌شده به پرونده">تأییدشده و افزوده‌شده به پرونده</option>
              <option value="ردشده با ثبت دلیل">ردشده با ثبت دلیل</option>
            </select>

            <select
              value={selectedSourceCode}
              onChange={(e) => setSelectedSourceCode(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 bg-[#F5F7FA] text-[#253247] font-medium"
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

        {filteredSuggestions.length === 0 ? (
          <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-8 sm:p-12 text-center text-slate-500 space-y-2.5">
            <CheckCircle2 className="w-9 h-9 text-slate-400 mx-auto" />
            <div className="font-bold text-sm sm:text-base text-slate-800">
              صف بررسی کارشناس در حال حاضر خالی است (۰ پیشنهاد)
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              با جست‌وجوی تکی نام شهید، بارگذاری فایل اکسل در بخش ۲، یا فشردن دکمه «ثبت دستی کتاب جدید»، عناوین جهت بازبینی و تأیید کارشناس در این جدول فهرست می‌شوند.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredSuggestions.map((sug) => {
            const isHighlighted = highlightedSuggestionId === sug.id;
            return (
              <div
                id={`suggestion-${sug.id}`}
                key={sug.id}
                className={`border rounded-2xl p-4 space-y-3 transition-all duration-300 ${
                  isHighlighted
                    ? 'border-[#1F4E79] ring-4 ring-[#1F4E79]/20 bg-amber-50/50 shadow-md'
                    : 'border-slate-200 bg-[#F5F7FA]/60'
                }`}
              >
              {/* Top Metadata Line (Unboxed clean metadata per Zero-Pill rule) */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2 text-[#697586]">
                  <span className="font-mono font-bold text-[#1F4E79]">{sug.id}</span>
                  <span>·</span>
                  <span className="font-bold text-[#253247]">شهید مرتبط: {sug.martyrName}</span>
                  <span>·</span>
                  <span>منبع: {sug.sourceName}</span>
                  <span>·</span>
                  <span className="tabular-nums">بازیابی: {sug.retrievedAt}</span>
                </div>

                <div className="text-xs font-bold">
                  {sug.reviewStatus === 'تأییدشده و افزوده‌شده به پرونده' ? (
                    <span className="text-[#2E7D5B] bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>وضعیت: تأیید توسط کارشناس انجام شده است (موجود در پرونده شهید)</span>
                    </span>
                  ) : sug.reviewStatus === 'ردشده با ثبت دلیل' ? (
                    <span className="text-[#B94A48] bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 inline-flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5 text-rose-600" />
                      <span>وضعیت: قبلاً توسط کارشناس رد شده است (علت رد: {sug.reviewerNote || 'ثبت در سوابق'})</span>
                    </span>
                  ) : (
                    <span className="text-[#C58A2B] bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 inline-flex items-center gap-1">
                      <Info className="w-3.5 h-3.5 text-amber-600" />
                      <span>وضعیت: در صف بررسی کارشناس</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Book Title & Bibliographic Details */}
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-[#253247] flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-[#1F4E79] shrink-0" />
                    <span>{sug.bookTitle}</span>
                  </h3>
                  <span className="text-xs font-bold text-[#1F4E79]">
                    مقایسه با فهرست ۹۸۰ کتاب: {sug.catalogComparisonStatus}
                    {sug.matchedCatalogBookId ? ` (${sug.matchedCatalogBookId})` : ''}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-[#697586] pt-1">
                  <div>
                    <strong className="text-[#253247]">نویسنده/پدیدآور:</strong> {sug.authors}
                  </div>
                  <div>
                    <strong className="text-[#253247]">ناشر و سال چاپ:</strong> {sug.publisher} ·{' '}
                    {sug.publishYear} ({sug.editionInfo})
                  </div>
                  <div>
                    <strong className="text-[#253247]">شابک / فیپا:</strong> {sug.isbn} · فیپا:{' '}
                    {sug.fipa}
                  </div>
                </div>

                <p className="text-xs text-[#253247] leading-relaxed pt-1">
                  <strong>معرفی ناشر / موضوع ({sug.subjectCategory}):</strong>{' '}
                  {sug.publisherDescription}
                </p>

                {/* Explicit Reasoning & Evidence (Section 10 rule: دلیل پیشنهاد فراتر از درصد اطمینان) */}
                <div className="bg-[#EAF1F7]/80 rounded-xl p-2.5 text-xs text-[#253247]">
                  <strong className="text-[#1F4E79]">شواهد و دلیل تشخیص ارتباط با شهید: </strong>
                  {sug.matchEvidence}
                  {sug.martyrAlternativeNames.length > 0 && (
                    <div className="text-[11px] text-[#697586] mt-1">
                      نام‌های جایگزین بررسی‌شده: {sug.martyrAlternativeNames.join(' ، ')}
                    </div>
                  )}
                </div>
              </div>

              {/* Inline Edit Form if active */}
              {editingId === sug.id && editDraft && (
                <form
                  onSubmit={handleSaveEditDraft}
                  className="bg-white border border-[#1F4E79] rounded-xl p-3.5 space-y-3"
                >
                  <div className="text-xs font-bold text-[#1F4E79]">
                    اصلاح مشخصات کتاب پیشنهادی پیش از تأیید نهایی:
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                    <div>
                      <label className="block font-bold mb-1">عنوان کتاب</label>
                      <input
                        type="text"
                        value={editDraft.bookTitle}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, bookTitle: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
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
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
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
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
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
                      className="px-3 py-1.5 rounded-lg bg-slate-100 text-xs"
                    >
                      انصراف
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-[#1F4E79] text-white text-xs font-bold"
                    >
                      ذخیره اصلاحات
                    </button>
                  </div>
                </form>
              )}

                {/* Reject Reason Input if active */}
              {rejectingId === sug.id && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
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
                    className="flex-1 px-3 py-2 text-xs bg-white border border-red-300 rounded-lg"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleConfirmReject(sug)}
                      className="px-3.5 py-2 rounded-lg bg-[#B94A48] text-white text-xs font-bold whitespace-nowrap"
                    >
                      ثبت رد با دلیل ↵
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejectingId(null);
                        setRejectReason('');
                      }}
                      className="px-3 py-2 rounded-lg bg-white text-xs"
                    >
                      لغو
                    </button>
                  </div>
                </div>
              )}

              {/* Action Buttons Bar for Human Specialist */}
              {/* Action Buttons Bar for Human Specialist */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                {sug.sourceUrl && sug.sourceUrl.trim().startsWith('http') ? (
                  <a
                    href={sug.sourceUrl.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-[#1F4E79] hover:underline flex items-center gap-1.5 bg-blue-50/70 hover:bg-blue-100/70 px-2.5 py-1.5 rounded-lg border border-blue-200 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-[#1F4E79]" />
                    <span>بازکردن لینک مستقیم منبع ({sug.sourceName})</span>
                  </a>
                ) : sug.matchedCatalogBookId ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const row = catalogRows.find((r) => r.tempBookId === sug.matchedCatalogBookId);
                        if (row) {
                          setSelectedCatalogDetail(row);
                        } else {
                          onNotify(`کتاب با شناسه ${sug.matchedCatalogBookId} در فهرست ۹۸۰ کتاب موجود است.`);
                        }
                      }}
                      className="text-xs font-bold text-[#1F4E79] hover:bg-blue-100/80 bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-200 flex items-center gap-1.5 cursor-pointer transition-colors"
                      title="مشاهده اطلاعات کامل این کتاب در مخزن کتابخانه مرکز اسناد"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-[#1F4E79]" />
                      <span>مشاهده شناسنامه در مخزن کتابخانه ({sug.matchedCatalogBookId})</span>
                    </button>
                    <a
                      href={`https://ketab.ir/search?query=${encodeURIComponent(sug.bookTitle)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-emerald-800 hover:bg-emerald-100/80 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200 flex items-center gap-1 transition-colors"
                      title="استعلام مشخصات این اثر در خانه کتاب و ادبیات ایران"
                    >
                      <ExternalLink className="w-3 h-3 text-emerald-700" />
                      <span>استعلام در خانه کتاب (Ketab.ir)</span>
                    </a>
                  </div>
                ) : (
                  <a
                    href={`https://ketab.ir/search?query=${encodeURIComponent(sug.bookTitle)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-[#1F4E79] hover:bg-slate-100 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 flex items-center gap-1.5 transition-colors"
                    title="استعلام در خانه کتاب و ادبیات ایران"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-[#1F4E79]" />
                    <span>استعلام عنوان در خانه کتاب (Ketab.ir)</span>
                  </a>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {onDeleteSuggestion && (
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteSuggestion(sug.id);
                        onNotify(`پیشنهاد ${sug.id} از صف بررسی حذف شد.`);
                      }}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                      title="حذف دائمی این پیشنهاد از صف بررسی (مثلاً رکوردهای تست یا نامعتبر)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف از صف</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(sug.id);
                      setEditDraft(sug);
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-[#253247] text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>اصلاح مشخصات</span>
                  </button>

                  {sug.reviewStatus === 'تأییدشده و افزوده‌شده به پرونده' ? (
                    <div className="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center gap-1.5 border border-emerald-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>تأیید توسط کارشناس انجام شده و در پرونده شهید موجود است</span>
                    </div>
                  ) : sug.reviewStatus === 'ردشده با ثبت دلیل' ? (
                    <div className="flex items-center gap-1.5">
                      <div className="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-50 text-rose-800 text-xs font-bold flex items-center gap-1 border border-rose-300">
                        <XCircle className="w-3.5 h-3.5 text-rose-700 shrink-0" />
                        <span>رد شده: {sug.reviewerNote || 'ثبت در سوابق'}</span>
                      </div>
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
                        className="min-h-[36px] px-2.5 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                        title="انتقال مجدد به صف جهت بررسی دوباره کارشناس"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-[#1F4E79]" />
                        <span>بررسی مجدد</span>
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleApproveItem(sug)}
                        className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[#2E7D5B] hover:bg-[#246348] text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>تأیید کارشناس و انتقال به پرونده شهید</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setRejectingId(sug.id)}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#B94A48] hover:bg-[#993b39] text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>رد پیشنهاد با دلیل</span>
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

      {/* مودال ۱۸ انتشارات تخصصی دفاع مقدس */}
      {showPublishersModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-4 sm:p-6 space-y-4 shadow-2xl border border-slate-200 my-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#8C3B2B]/10 flex items-center justify-center text-[#8C3B2B]">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-[#253247]">
                    ۱۸ انتشارات تخصصی دفاع مقدس و ادبیات پایداری
                  </h3>
                  <p className="text-xs text-[#697586]">
                    کاوش مستقیم نام «{selectedMartyrName || 'شهید'}» در کاتالوگ و پایگاه‌های رسمی ناشران برگزیده
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPublishersModal(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
              >
                بستن
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[65vh] overflow-y-auto p-1 text-xs">
              {SACRED_DEFENSE_PUBLISHERS.map((pub, idx) => {
                const searchLink = pub.searchUrlPattern(selectedMartyrName || 'شهید');
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
                          تخصصی ایثار
                        </span>
                      </div>
                      <h4 className="font-bold text-xs text-[#253247]">{pub.name}</h4>
                      <p className="text-[11px] text-[#697586] mt-0.5 leading-snug">
                        {pub.affiliation}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
                      <a
                        href={pub.domainUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-slate-500 hover:text-[#1F4E79] truncate"
                      >
                        {pub.domainUrl.replace(/^https?:\/\//, '')}
                      </a>
                      <a
                        href={searchLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 bg-[#1F4E79] hover:bg-[#163a5b] text-white rounded-lg font-bold text-[11px] inline-flex items-center gap-1 shrink-0 shadow-2xs transition-colors"
                      >
                        <span>کاوش نام شهید</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
              <span className="text-[#697586] text-[11px]">
                نکته: با کلیک روی هر ناشر، صفحه جست‌وجوی هدفمند در یک تب جدید باز می‌شود.
              </span>
              <button
                type="button"
                onClick={() => setShowPublishersModal(false)}
                className="px-4 py-2 bg-[#8C3B2B] text-white hover:bg-[#702D20] font-bold rounded-xl cursor-pointer"
              >
                تأیید و بازگشت به سامانه
              </button>
            </div>
          </div>
        </div>
      )}

      {/* مودال ثبت دستی کتاب جدید واقعی برای شهید */}
      {showManualAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-4 sm:p-6 space-y-4 shadow-2xl border border-slate-200 my-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#2E7D5B]/10 flex items-center justify-center text-[#2E7D5B]">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-[#253247]">
                    ثبت دستی کتاب جدید کشف‌شده برای شهید
                  </h3>
                  <p className="text-xs text-[#697586]">
                    شهید مرتبط: <strong className="text-[#1F4E79]">{selectedMartyrName || 'شهید'}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowManualAddModal(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
              >
                بستن
              </button>
            </div>

            <form onSubmit={handleManualAddSubmit} className="space-y-3.5 text-xs">
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
                    <option value="سازمان اسناد و کتابخانه ملی ایران (NLAI)">سازمان اسناد و کتابخانه ملی ایران (NLAI)</option>
                    <option value="خانه کتاب و ادبیات ایران (Ketab.ir)">خانه کتاب و ادبیات ایران (Ketab.ir)</option>
                    <option value="پایگاه مرکز اسناد ایثارگران">پایگاه مرکز اسناد ایثارگران</option>
                    <option value="پایگاه جامع شهدای دفاع مقدس">پایگاه جامع شهدای دفاع مقدس</option>
                    <option value="ناشران تخصصی دفاع مقدس">ناشران تخصصی دفاع مقدس</option>
                    <option value="مشاهده عینی و بررسی میدانی">مشاهده عینی و بررسی میدانی</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#253247] mb-1">یادداشت کارشناس و شماره صفحه/سند</label>
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
                  className="px-5 py-2 bg-[#2E7D5B] hover:bg-[#246348] text-white font-bold rounded-xl cursor-pointer shadow-md flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>ثبت در صف بررسی کارشناس</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* مودال شناسنامه ثبتی کتاب در مخزن کتابخانه */}
      {selectedCatalogDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#1F4E79]" />
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  شناسنامه ثبتی در مخزن ۹۸۰ کتاب ({selectedCatalogDetail.tempBookId})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCatalogDetail(null)}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-800 leading-relaxed max-h-[70vh] overflow-y-auto pr-1">
              <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 border border-slate-200">
                <div className="font-bold text-sm text-[#1F4E79]">{selectedCatalogDetail.titleRaw}</div>
                <div className="text-slate-600">نویسنده / پدیدآور: {selectedCatalogDetail.authorRaw || 'نامشخص'}</div>
                <div className="text-slate-600">ناشر: {selectedCatalogDetail.publisherRaw || 'نامشخص'}</div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="font-bold text-slate-600">شناسه موقت: </span>
                  <span className="font-mono text-slate-900 font-bold">{selectedCatalogDetail.tempBookId}</span>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="font-bold text-slate-600">محل در قفسه: </span>
                  <span className="text-slate-900 font-bold">{selectedCatalogDetail.locationRaw || 'نامشخص'}</span>
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
                  <span className="font-bold text-slate-700 block mb-1">توضیحات ثبت اولیه در فایل اکسل:</span>
                  <p className="text-slate-600 leading-relaxed">{selectedCatalogDetail.descriptionRaw}</p>
                </div>
              )}

              <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
                <a
                  href={`https://ketab.ir/search?query=${encodeURIComponent(selectedCatalogDetail.titleRaw)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg font-semibold inline-flex items-center gap-1 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-emerald-700" />
                  <span>استعلام برخط در خانه کتاب</span>
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
          </div>
        </div>
      )}
    </div>
  );
};
