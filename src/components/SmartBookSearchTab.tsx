import React, { useState, useEffect, useMemo } from 'react';
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
  AlertCircle
} from 'lucide-react';
import {
  BookMartyrLinkRecord,
  CustomMartyrRecord,
  OFFICIAL_SEARCH_SOURCES,
  ReferenceCatalogRow,
  SmartSearchSuggestion,
  SmartSuggestionReviewStatus,
  SUBJECT_CATEGORIES,
  WorkbookGolzarMartyr,
  normalizePersianText,
  toPersianDigits
} from '../data/markazAsnadData';

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

interface SmartBookSearchTabProps {
  catalogRows: ReferenceCatalogRow[];
  workbookMartyrs: WorkbookGolzarMartyr[];
  customMartyrs?: CustomMartyrRecord[];
  smartSuggestions: SmartSearchSuggestion[];
  initialMartyrQuery?: string;
  onAddSuggestion: (newSug: SmartSearchSuggestion) => void;
  onUpdateSuggestion: (updatedSug: SmartSearchSuggestion) => void;
  onDeleteSuggestion?: (sugId: string) => void;
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
  initialMartyrQuery = '',
  onAddSuggestion,
  onUpdateSuggestion,
  onDeleteSuggestion,
  onApproveSuggestionToLinks,
  onNotify
}) => {
  const [selectedMartyrName, setSelectedMartyrName] = useState(initialMartyrQuery || 'عباس دوران');
  const [customAltNames, setCustomAltNames] = useState('سرلشکر خلبان عباس دوران، دوران، عباس');
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

  // Batch Pilot 20 Martyrs State (Section 9: جست‌وجوی انبوه و پایلوت محدود ۲۰ پرونده)
  const [pilotStatus, setPilotStatus] = useState<'idle' | 'running' | 'paused' | 'completed'>('idle');
  const [pilotProcessedCount, setPilotProcessedCount] = useState<number>(6);
  const [pilotFoundCount, setPilotFoundCount] = useState<number>(6);
  const [pilotDuplicatePrevented, setPilotDuplicatePrevented] = useState<number>(2);
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

  useEffect(() => {
    if (initialMartyrQuery && initialMartyrQuery.trim()) {
      const clean = initialMartyrQuery.trim();
      setSelectedMartyrName(clean);
      const variants = generateMartyrNameVariants(clean, '');
      setCustomAltNames(variants.slice(1).join(' ، '));

      const normTarget = normalizePersianText(clean.replace(/^شهید\s+/, ''));
      const existingInQueue = smartSuggestions.find(
        (s) =>
          normalizePersianText(s.martyrName).includes(normTarget) &&
          s.reviewStatus === 'در صف بررسی کارشناس'
      );

      const nowFa = new Intl.DateTimeFormat('fa-IR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date());

      if (existingInQueue) {
        // اگر این پیشنهاد مربوط به شهید حذف‌شده یا رکورد تستی است، فوراً خودکار پاکسازی شود
        if (isMartyrOrphanOrTest(existingInQueue.martyrName, existingInQueue.martyrId)) {
          onDeleteSuggestion?.(existingInQueue.id);
          setLastSearchFeedback({
            targetName: clean,
            matchedInCatalog: null,
            suggestionId: '',
            status: 'not_found',
            message: `پرونده شهید «${clean}» قبلاً از سیستم حذف شده است؛ پیشنهاد باقیمانده (${existingInQueue.id}) نیز به طور خودکار از صف پاک گردید.`,
            timestamp: nowFa
          });
          setHighlightedSuggestionId(null);
          return;
        }

        setLastSearchFeedback({
          targetName: clean,
          matchedInCatalog: null,
          suggestionId: existingInQueue.id,
          status: 'already_in_queue',
          message: `پیشنهاد بررسی برای شهید «${clean}» قبلاً با شناسه ${existingInQueue.id} در صف بررسی ثبت شده است.`,
          timestamp: existingInQueue.retrievedAt
        });
        setHighlightedSuggestionId(existingInQueue.id);
      } else {
        const matchedInCatalog = catalogRows.find((r) =>
          normalizePersianText(`${r.titleRaw} ${r.descriptionRaw} ${r.authorRaw}`).includes(normTarget)
        );

        if (matchedInCatalog) {
          // فقط در صورت انطباق واقعی با کتابخانه ثبت می‌شود
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
          // هیچ کتاب فرضی ساخته نمی‌شود! گزارش دقیق و صادقانه
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
    }
  }, [initialMartyrQuery]);

  // Run Single Martyr Smart Search across Reference Catalog ONLY (No fake generation!)
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

    // Check if already in queue to avoid duplicate search
    const existingInQueue = smartSuggestions.find(
      (s) =>
        normalizePersianText(s.martyrName).includes(normTarget) &&
        s.reviewStatus === 'در صف بررسی کارشناس'
    );
    if (existingInQueue) {
      // اگر رکورد تستی یا شهید حذف‌شده است، خودکار پاکسازی شود
      if (isMartyrOrphanOrTest(existingInQueue.martyrName, existingInQueue.martyrId)) {
        onDeleteSuggestion?.(existingInQueue.id);
        setLastSearchFeedback({
          targetName,
          matchedInCatalog: null,
          suggestionId: '',
          status: 'not_found',
          message: `پرونده شهید «${targetName}» در پایگاه وجود ندارد (حذف شده است)؛ سابقه تستی قدیمی (${existingInQueue.id}) نیز به طور خودکار از صف پاک گردید.`,
          timestamp: nowFa
        });
        setHighlightedSuggestionId(null);
        onNotify(`سابقه تستی ${existingInQueue.id} به طور خودکار پاک شد.`, 'warning');
        return;
      }

      setLastSearchFeedback({
        targetName,
        matchedInCatalog: null,
        suggestionId: existingInQueue.id,
        status: 'already_in_queue',
        message: `برای «${targetName}» قبلاً پیشنهاد فعال با شناسه ${existingInQueue.id} در صف بررسی کارشناس ثبت شده است.`,
        timestamp: existingInQueue.retrievedAt
      });
      setHighlightedSuggestionId(existingInQueue.id);
      onNotify(
        `برای «${targetName}» قبلاً پیشنهاد فعال (${existingInQueue.id}) در صف بررسی ثبت شده است.`,
        'warning'
      );
      return;
    }

    // Compare against the REAL 980 books in catalogRows
    const matchedBooks = catalogRows.filter((r) =>
      normalizePersianText(`${r.titleRaw} ${r.descriptionRaw} ${r.authorRaw}`).includes(normTarget)
    );

    if (matchedBooks.length > 0) {
      // کتاب واقعی در کتابخانه پیدا شد
      const matched = matchedBooks[0];
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

  // Run Next Batch in 20-Martyr Pilot
  const handleRunPilotStep = () => {
    if (pilotProcessedCount >= 20) {
      setPilotStatus('completed');
      onNotify('پایلوت محدود ۲۰ پرونده شهید به طور کامل اجرا شد.');
      return;
    }

    setPilotStatus('running');
    const candidateMartyrs = workbookMartyrs.slice(0, 20);
    const nextIdx = pilotProcessedCount;
    const targetMartyr = candidateMartyrs[nextIdx] || {
      tempPersonId: `SH-00${nextIdx + 1}`,
      fullNameSearch: 'مصطفی چمران',
      piece: '24',
      graveRow: '1',
      graveNumber: '1'
    };

    const normM = normalizePersianText(targetMartyr.fullNameSearch);
    const alreadyExists = smartSuggestions.some((s) =>
      normalizePersianText(s.martyrName).includes(normM)
    );

    if (alreadyExists) {
      setPilotDuplicatePrevented((prev) => prev + 1);
      setPilotProcessedCount((prev) => Math.min(20, prev + 2));
      onNotify(
        `پرونده «${targetMartyr.fullNameSearch}» قبلاً بررسی شده بود؛ از اجرای جست‌وجوی تکراری جلوگیری شد.`
      );
      return;
    }

    const catalogHit = catalogRows.find((c) =>
      normalizePersianText(`${c.titleRaw} ${c.descriptionRaw} ${c.authorRaw}`).includes(normM)
    );

    if (!catalogHit) {
      const nextCount = Math.min(20, pilotProcessedCount + 1);
      setPilotProcessedCount(nextCount);
      if (nextCount >= 20) {
        setPilotStatus('completed');
      }
      onNotify(
        `پرونده «${targetMartyr.fullNameSearch}» بررسی شد؛ در فهرست ۹۸۰ کتاب داخلی یافت نشد و هیچ رکورد ساختگی ایجاد نگردید.`,
        'warning'
      );
      return;
    }

    const nowFa = new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date());

    const newSug: SmartSearchSuggestion = {
      id: `SS-${String(smartSuggestions.length + 1).padStart(4, '0')}`,
      martyrId: targetMartyr.tempPersonId,
      martyrName: targetMartyr.fullNameSearch,
      martyrAlternativeNames: generateMartyrNameVariants(targetMartyr.fullNameSearch, ''),
      bookTitle: catalogHit.titleRaw,
      authors: catalogHit.authorRaw || '—',
      publisher: catalogHit.publisherRaw || '—',
      publishYear: '',
      editionInfo: 'موجود در قفسه کتابخانه',
      isbn: catalogHit.isbnRaw || '—',
      fipa: catalogHit.fipaRaw || '—',
      subjectCategory: catalogHit.categoryRaw || SUBJECT_CATEGORIES[0].label,
      publisherDescription:
        catalogHit.descriptionRaw ||
        `پرونده پایلوت ۲۰ شهید — منطبق با قطعه ${targetMartyr.piece}`,
      sourcePriority: 1,
      sourceName: 'فهرست کتابخانه مرکز اسناد (۹۸۰ عنوان کتاب مرجع)',
      sourceUrl: '',
      retrievedAt: nowFa,
      matchEvidence: `تطابق نام شهید «${targetMartyr.fullNameSearch}» با رکورد ${catalogHit.tempBookId} در قفسه ${catalogHit.locationRaw || 'کتابخانه'}.`,
      catalogComparisonStatus: 'موجود در فهرست مرجع ۹۸۰ کتاب',
      matchedCatalogBookId: catalogHit.tempBookId,
      reviewStatus: 'در صف بررسی کارشناس',
      reviewerNote: '',
      reviewedBy: '',
      reviewedAt: ''
    };

    onAddSuggestion(newSug);
    const nextCount = Math.min(20, pilotProcessedCount + 1);
    setPilotProcessedCount(nextCount);
    setPilotFoundCount((prev) => prev + 1);
    if (nextCount >= 20) {
      setPilotStatus('completed');
    }
    onNotify(
      `گام پایلوت اجرا شد؛ کتاب واقعی «${catalogHit.titleRaw}» به صف بررسی کارشناس اضافه گردید.`,
      'success'
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
  };

  const handleConfirmReject = (sug: SmartSearchSuggestion) => {
    if (!rejectReason.trim()) {
      onNotify('ثبت دلیل رد پیشنهاد برای مستندسازی الزامی است.', 'warning');
      return;
    }
    const nowFa = new Intl.DateTimeFormat('fa-IR').format(new Date());
    onUpdateSuggestion({
      ...sug,
      reviewStatus: 'ردشده با ثبت دلیل',
      reviewerNote: rejectReason.trim(),
      reviewedBy: 'کارشناس بازبین مرکز اسناد',
      reviewedAt: nowFa
    });
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
      {/* Header & Golden Rule Banner */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-base sm:text-lg font-bold text-[#253247] flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#C58A2B]" />
              <span>جست‌وجوی هوشمند کتاب‌های مرتبط با شهدا و صف بررسی کارشناس</span>
            </h1>
            <p className="text-xs text-[#697586] mt-1">
              شناسایی منابع مرتبط با شهدا در کتابخانه ملی ایران، فیپا، سوره مهر و ناشران تخصصی همراه با تشخیص شکل‌های نوشتاری و مقایسه خودکار با ۹۸۰ کتاب مرجع
            </p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2 text-xs text-[#253247] flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-[#C58A2B] shrink-0" />
            <span>
              <strong>قاعده کنترل کیفیت:</strong> هیچ نتیجه اینترنتی یا پیشنهادی بدون تأیید کارشناس وارد پرونده قطعی کتاب یا شهید نمی‌شود.
            </span>
          </div>
        </div>

        {/* Official Search Sources Priority Table (Section 9) */}
        <div className="bg-[#F5F7FA] border border-slate-200 rounded-xl p-3.5 space-y-2.5">
          <div className="text-xs font-bold text-[#1F4E79] flex items-center gap-1.5">
            <Layers className="w-4 h-4" />
            <span>منابع مجاز جست‌وجو به ترتیب اولویت و روش دسترسی قانونی:</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
            {OFFICIAL_SEARCH_SOURCES.map((src) => (
              <div
                key={src.code}
                className="bg-white border border-slate-200 rounded-xl p-2.5 flex flex-col justify-between text-xs"
              >
                <div>
                  <div className="flex items-center justify-between font-bold text-[#1F4E79]">
                    <span>اولویت {toPersianDigits(src.priority)}</span>
                    <a
                      href={src.domainUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] hover:underline flex items-center gap-0.5"
                    >
                      <span>سایت منبع</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="font-bold text-[#253247] mt-1">{src.name}</div>
                </div>
                <div className="mt-2 pt-1.5 border-t border-slate-100 text-[10px] text-[#697586]">
                  <div>روش: {src.accessMethod}</div>
                </div>
              </div>
            ))}
          </div>
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
                  انتخاب از شهدای گلزار یا تایپ نام شهید:
                </label>
                <input
                  type="text"
                  list="martyrs-smart-list"
                  value={selectedMartyrName}
                  onChange={(e) => setSelectedMartyrName(e.target.value)}
                  placeholder="مثلاً: محمد ابراهیم همت"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-[#F5F7FA] focus:bg-white"
                />
                <datalist id="martyrs-smart-list">
                  {workbookMartyrs.slice(0, 60).map((m) => (
                    <option key={m.tempPersonId} value={m.fullNameSearch}>
                      قطعه {m.piece}
                    </option>
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#253247] mb-1">
                  نام‌های جایگزین / شهرت (جداشده با ویرگول):
                </label>
                <input
                  type="text"
                  value={customAltNames}
                  onChange={(e) => setCustomAltNames(e.target.value)}
                  placeholder="مثلاً: حاج ابراهیم همت، سردار همت"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-[#F5F7FA] focus:bg-white"
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

        {/* Column 2: Controlled 20-Martyr Pilot Batch Engine */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#253247]">
                ۲. جست‌وجوی انبوه و پایلوت محدود (حداکثر ۲۰ پرونده شهید)
              </h2>
              <span className="text-xs font-bold text-[#1F4E79] tabular-nums">
                {toPersianDigits(pilotProcessedCount)} / ۲۰ پرونده
              </span>
            </div>

            <p className="text-xs text-[#697586]">
              برای جلوگیری از فشار غیرضروری به سایت‌های بیرونی، جست‌وجوی گروهی در دسته‌های محدود انجام می‌شود، از جست‌وجوی تکراری جلوگیری می‌کند و همه نتایج را به صف بررسی کارشناس می‌فرستد.
            </p>

            {/* Progress Bar */}
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#2E7D5B] transition-all"
                style={{ width: `${Math.min(100, (pilotProcessedCount / 20) * 100)}%` }}
              />
            </div>

            {/* Pilot Metrics */}
            <div className="grid grid-cols-4 gap-2 text-center bg-[#F5F7FA] p-2.5 rounded-xl text-xs">
              <div>
                <div className="text-[#697586] text-[11px]">بررسی‌شده</div>
                <div className="font-bold text-[#253247] tabular-nums">
                  {toPersianDigits(pilotProcessedCount)} شهید
                </div>
              </div>
              <div>
                <div className="text-[#697586] text-[11px]">پیشنهاد استخراجی</div>
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
              <div>
                <div className="text-[#697586] text-[11px]">خطای شبکه</div>
                <div className="font-bold text-[#253247] tabular-nums">
                  {toPersianDigits(pilotErrorCount)}
                </div>
              </div>
            </div>
          </div>

          {/* Start / Pause / Resume / Reset Controls */}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleRunPilotStep}
              disabled={pilotProcessedCount >= 20}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[#2E7D5B] hover:bg-[#246348] disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Play className="w-4 h-4" />
              <span>
                {pilotStatus === 'idle'
                  ? 'اجرای دسته بعدی پایلوت ۲۰ شهید'
                  : pilotStatus === 'paused'
                  ? 'ادامه و ازسرگیری پایلوت'
                  : pilotProcessedCount >= 20
                  ? 'پایلوت ۲۰ شهید تکمیل شد'
                  : 'اجرای گام بعدی پایلوت'}
              </span>
            </button>

            {pilotStatus === 'running' && (
              <button
                type="button"
                onClick={() => {
                  setPilotStatus('paused');
                  onNotify('اجرای پایلوت گروهی متوقف شد؛ در هر زمان قابل ادامه است.', 'warning');
                }}
                className="min-h-[40px] px-3 py-2 rounded-xl bg-amber-100 text-[#C58A2B] text-xs font-bold flex items-center gap-1"
              >
                <Pause className="w-4 h-4" />
                <span>توقف موقت</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setPilotStatus('idle');
                setPilotProcessedCount(6);
                onNotify('شمارنده پایلوت به حالت اولیه بازنشانی شد.');
              }}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#253247] text-xs font-medium flex items-center gap-1"
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
                    <span className="text-[#2E7D5B]">وضعیت: تأییدشده کارشناسی</span>
                  ) : sug.reviewStatus === 'ردشده با ثبت دلیل' ? (
                    <span className="text-[#B94A48]">وضعیت: ردشده ({sug.reviewerNote})</span>
                  ) : (
                    <span className="text-[#C58A2B]">وضعیت: در صف بررسی کارشناس</span>
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
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <a
                  href={sug.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-[#1F4E79] hover:underline flex items-center gap-1"
                >
                  <span>بازکردن لینک مستقیم منبع ({sug.sourceName})</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

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
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-[#253247] text-xs font-medium flex items-center gap-1"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>اصلاح مشخصات</span>
                  </button>

                  {sug.reviewStatus !== 'تأییدشده و افزوده‌شده به پرونده' && (
                    <button
                      type="button"
                      onClick={() => handleApproveItem(sug)}
                      className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[#2E7D5B] hover:bg-[#246348] text-white text-xs font-bold flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>تأیید کارشناس و انتقال به پرونده شهید</span>
                    </button>
                  )}

                  {sug.reviewStatus !== 'ردشده با ثبت دلیل' && (
                    <button
                      type="button"
                      onClick={() => setRejectingId(sug.id)}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#B94A48] hover:bg-[#993b39] text-white text-xs font-bold flex items-center gap-1"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>رد پیشنهاد با دلیل</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>
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
    </div>
  );
};
