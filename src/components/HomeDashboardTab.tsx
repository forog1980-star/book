import React, { useState, useMemo } from 'react';
import {
  Search,
  Mic,
  PlusCircle,
  BookOpen,
  Users,
  Sparkles,
  FileCheck2,
  AlertTriangle,
  ArrowLeft,
  Smartphone,
  CheckCircle2,
  Clock,
  Layers,
  FileSpreadsheet,
  Download,
  Trash2,
  ShieldCheck
} from 'lucide-react';
import {
  AuditLogEntry,
  BookCopyRecord,
  BookMartyrLinkRecord,
  CustomMartyrRecord,
  ExtractedContentItem,
  FieldAuditRecord,
  LEVELS,
  PendingReviewItem,
  ReferenceCatalogRow,
  SHELVES,
  ShelfCode,
  LevelCode,
  SmartSearchSuggestion,
  SUBJECT_CATEGORIES,
  WorkbookGolzarMartyr,
  normalizePersianText,
  toPersianDigits
} from '../data/markazAsnadData';
import { parsePersianVoiceBookCommand } from '../utils/voiceCommandParser';
import { usePWAInstall } from '../utils/usePWAInstall';
import { generateUniqueCopyId, generateUniqueOutsideBookId } from '../utils/idGenerator';

interface HomeDashboardTabProps {
  catalogRows: ReferenceCatalogRow[];
  auditRecords: Record<string, FieldAuditRecord>;
  bookCopies: BookCopyRecord[];
  links: BookMartyrLinkRecord[];
  pendingReviews: PendingReviewItem[];
  workbookMartyrs: WorkbookGolzarMartyr[];
  customMartyrs?: CustomMartyrRecord[];
  extractedItems: ExtractedContentItem[];
  smartSuggestions: SmartSearchSuggestion[];
  auditLog: AuditLogEntry[];
  globalQuery?: string;
  onChangeGlobalQuery?: (q: string) => void;
  onNavigateTab: (tab: 'home' | 'library' | 'martyrs' | 'smart_search' | 'research' | 'management') => void;
  onOpenBookInLibrary?: (bookQuery: string) => void;
  onSaveVoiceOrQuickBook: (record: FieldAuditRecord, newCopy?: BookCopyRecord) => void;
  onApproveOutsideBook?: (recordKey: string) => void;
  onDeleteAuditRecord?: (recordKey: string) => void;
  onNotify: (message: string, type?: 'success' | 'warning') => void;
}

const SAMPLE_VOICE_COMMAND =
  'عنوان کتاب: دلیل. نویسنده: نام نویسنده. ناشر: انتشارات بیست و هفت. سال چاپ: ۱۳۹۸. نوبت چاپ: سوم. گروه: روایت و خاطرات. محل: قفسه یک، طبقه سه.';

export const HomeDashboardTab: React.FC<HomeDashboardTabProps> = ({
  catalogRows,
  auditRecords,
  bookCopies,
  links,
  pendingReviews,
  workbookMartyrs,
  customMartyrs = [],
  extractedItems,
  smartSuggestions,
  auditLog,
  globalQuery: externalGlobalQuery,
  onChangeGlobalQuery,
  onNavigateTab,
  onOpenBookInLibrary,
  onSaveVoiceOrQuickBook,
  onApproveOutsideBook,
  onDeleteAuditRecord,
  onNotify
}) => {
  const [internalGlobalQuery, setInternalGlobalQuery] = useState('');
  const globalQuery = externalGlobalQuery !== undefined ? externalGlobalQuery : internalGlobalQuery;
  const setGlobalQuery = (val: string) => {
    if (onChangeGlobalQuery) {
      onChangeGlobalQuery(val);
    } else {
      setInternalGlobalQuery(val);
    }
  };

  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [showQuickBookModal, setShowQuickBookModal] = useState(false);
  const [showInstallGuideModal, setShowInstallGuideModal] = useState(false);
  const [lastSavedNotice, setLastSavedNotice] = useState<{
    title: string;
    tempBookId: string;
    copyId: string;
    location: string;
  } | null>(null);

  // Voice Input State (Section 11)
  const [voiceConsentChecked, setVoiceConsentChecked] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState(SAMPLE_VOICE_COMMAND);
  const parsedVoice = useMemo(
    () => parsePersianVoiceBookCommand(voiceTranscript),
    [voiceTranscript]
  );

  // Editable preview fields after voice parsing
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewAuthor, setPreviewAuthor] = useState('');
  const [previewPublisher, setPreviewPublisher] = useState('');
  const [previewYear, setPreviewYear] = useState('');
  const [previewEdition, setPreviewEdition] = useState('');
  const [previewCategory, setPreviewCategory] = useState(SUBJECT_CATEGORIES[0].label);
  const [previewShelf, setPreviewShelf] = useState<ShelfCode>('SH-01');
  const [previewLevel, setPreviewLevel] = useState<LevelCode>('T03');
  const [previewNotes, setPreviewNotes] = useState('');

  // Quick Manual Registration Modal State
  const [quickTitle, setQuickTitle] = useState('');
  const [quickAuthor, setQuickAuthor] = useState('');
  const [quickPublisher, setQuickPublisher] = useState('');
  const [quickYear, setQuickYear] = useState('');
  const [quickCategory, setQuickCategory] = useState(SUBJECT_CATEGORIES[0].label);
  const [quickShelf, setQuickShelf] = useState<ShelfCode>('SH-01');
  const [quickLevel, setQuickLevel] = useState<LevelCode>('T01');

  const { isInstallable, isInstalled, install } = usePWAInstall();

  // کتاب‌های ثبت‌شده خارج از فهرست اولیه (از طریق ثبت سریع، ثبت صوتی یا بخش ۴ کتابخانه)
  const outsideRegisteredBooks = useMemo(() => {
    return Object.values(auditRecords)
      .filter((r) => r.source === 'outside-list')
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }, [auditRecords]);

  // شمارش پویا (داینامیک) کل کتاب‌ها و شهدای سامانه تا با هر ثبت جدید یا بارگذاری اکسل خودکار افزایش یابد
  const totalBooksCount = catalogRows.length + outsideRegisteredBooks.length;
  const totalMartyrsCount = 28368 + customMartyrs.length;

  const syncVoiceToPreview = (text: string) => {
    setVoiceTranscript(text);
    const p = parsePersianVoiceBookCommand(text);
    setPreviewTitle(p.title);
    setPreviewAuthor(p.author);
    setPreviewPublisher(p.publisher);
    setPreviewYear(p.year);
    setPreviewEdition(p.edition);
    setPreviewCategory(p.categoryLabel);
    if (p.shelf) setPreviewShelf(p.shelf);
    if (p.level) setPreviewLevel(p.level);
  };

  const openVoiceRegistrationModal = () => {
    syncVoiceToPreview(voiceTranscript || SAMPLE_VOICE_COMMAND);
    setShowVoiceModal(true);
  };

  const handleStartBrowserSpeechRecognition = () => {
    if (!voiceConsentChecked) {
      onNotify('لطفاً ابتدا تیک اطلاع و رضایت از تبدیل گفتار به متن را فعال کنید.', 'warning');
      return;
    }
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;

    if (!SpeechRec) {
      onNotify(
        'مرورگر فعلی از Web Speech API مستقیم پشتیبانی نمی‌کند؛ لطفاً از دکمه میکروفون صفحه‌کلید اندروید در کادر متن استفاده کنید.',
        'warning'
      );
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const recognition = new (SpeechRec as any)();
      recognition.lang = 'fa-IR';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => {
        setIsListening(false);
        onNotify(
          'تشخیص صوتی مرورگر متوقف شد؛ می‌توانید از میکروفون کیبورد اندروید یا ویرایش دستی استفاده کنید.',
          'warning'
        );
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        const transcript = event?.results?.[0]?.[0]?.transcript || '';
        if (transcript) {
          syncVoiceToPreview(transcript);
          onNotify('گفتار به متن تبدیل و در پیش‌نمایش تفکیک شد.');
        }
      };
      recognition.start();
    } catch {
      setIsListening(false);
      onNotify('امکان شروع میکروفون مرورگر فراهم نشد؛ از میکروفون صفحه‌کلید گوشی استفاده کنید.', 'warning');
    }
  };

  const handleConfirmVoiceBookSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!previewTitle.trim()) {
      onNotify('عنوان کتاب برای ذخیره الزامی است.', 'warning');
      return;
    }
    const nowIso = new Date().toISOString();
    const nowFa = new Intl.DateTimeFormat('fa-IR').format(new Date());
    const existingIds = Object.values(auditRecords).map((r) => r.tempBookId);
    const tempBookId = generateUniqueOutsideBookId(existingIds);
    const { copyId } = generateUniqueCopyId(bookCopies, tempBookId);
    const loc = `${previewShelf}-${previewLevel}`;

    const newRec: FieldAuditRecord = {
      key: `VOICE::${Date.now()}`,
      source: 'outside-list',
      sheet: 'ثبت صوتی موبایل',
      tempBookId,
      copyId,
      title: previewTitle.trim(),
      author: previewAuthor.trim(),
      publisher: previewPublisher.trim(),
      year: previewYear.trim(),
      edition: previewEdition.trim(),
      category: previewCategory,
      shelf: previewShelf,
      level: previewLevel,
      location: loc,
      physical: 'review',
      copyStatus: 'pending_review',
      physicalCondition: 'healthy',
      countedCopies: '1',
      notes: previewNotes.trim() || `ثبت‌شده با فرمان صوتی کنار قفسه (${loc}) — در انتظار تأیید کارشناس`,
      updatedAt: nowIso
    };

    const newCopy: BookCopyRecord = {
      copyId,
      bookId: tempBookId,
      bookTitle: previewTitle.trim(),
      copyStatus: 'pending_review',
      shelf: previewShelf,
      level: previewLevel,
      location: loc,
      observedDate: nowFa,
      physicalCondition: 'healthy',
      loanOrMoveStatus: 'در قفسه مرکز اسناد',
      expertNote: `ثبت صوتی کنار قفسه (خارج از فهرست اولیه ۹۸۰ کتاب — در انتظار تأیید کارشناس) — نوبت چاپ: ${previewEdition || 'ثبت‌نشده'}`,
      lastReviewedAt: nowFa,
      locationHistory: []
    };

    onSaveVoiceOrQuickBook(newRec, newCopy);
    setShowVoiceModal(false);
    setLastSavedNotice({
      title: newRec.title,
      tempBookId,
      copyId,
      location: loc
    });
    onNotify(
      `✅ کتاب «${newRec.title}» با کد ${tempBookId} در محل ${loc} ثبت شد (خارج از فهرست اولیه — در انتظار تأیید کارشناس).`
    );
  };

  const handleConfirmQuickBookSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) {
      onNotify('لطفاً عنوان کتاب را وارد کنید.', 'warning');
      return;
    }
    const nowIso = new Date().toISOString();
    const nowFa = new Intl.DateTimeFormat('fa-IR').format(new Date());
    const existingIds = Object.values(auditRecords).map((r) => r.tempBookId);
    const tempBookId = generateUniqueOutsideBookId(existingIds);
    const { copyId } = generateUniqueCopyId(bookCopies, tempBookId);
    const loc = `${quickShelf}-${quickLevel}`;

    const newRec: FieldAuditRecord = {
      key: `QUICK::${Date.now()}`,
      source: 'outside-list',
      sheet: 'ثبت سریع خانه',
      tempBookId,
      copyId,
      title: quickTitle.trim(),
      author: quickAuthor.trim(),
      publisher: quickPublisher.trim(),
      year: quickYear.trim(),
      category: quickCategory,
      shelf: quickShelf,
      level: quickLevel,
      location: loc,
      physical: 'review',
      copyStatus: 'pending_review',
      physicalCondition: 'healthy',
      countedCopies: '1',
      notes: 'ثبت سریع از صفحه اصلی (خارج از فهرست اولیه ۹۸۰ کتاب — در انتظار تأیید کارشناس)',
      updatedAt: nowIso
    };

    const newCopy: BookCopyRecord = {
      copyId,
      bookId: tempBookId,
      bookTitle: quickTitle.trim(),
      copyStatus: 'pending_review',
      shelf: quickShelf,
      level: quickLevel,
      location: loc,
      observedDate: nowFa,
      physicalCondition: 'healthy',
      loanOrMoveStatus: 'در قفسه مرکز اسناد',
      expertNote: 'ثبت سریع از منوی خانه (در انتظار تأیید کارشناس)',
      lastReviewedAt: nowFa,
      locationHistory: []
    };

    onSaveVoiceOrQuickBook(newRec, newCopy);
    setShowQuickBookModal(false);
    setLastSavedNotice({
      title: newRec.title,
      tempBookId,
      copyId,
      location: loc
    });
    setQuickTitle('');
    setQuickAuthor('');
    setQuickPublisher('');
    setQuickYear('');
    onNotify(
      `✅ کتاب «${newRec.title}» با شناسه ${tempBookId} و نسخه ${copyId} در ${loc} ثبت شد (خارج از فهرست اولیه ۹۸۰ کتاب — در انتظار تأیید کارشناس).`
    );
  };

  // Global Search Results (Outside Registered Books + 980 Catalog Books + Custom & Workbook Martyrs + Links + Extracted)
  const searchResults = useMemo(() => {
    const q = normalizePersianText(globalQuery);
    if (!q || q.length < 2) return null;

    const outsideAsCatalogRows: (ReferenceCatalogRow & {
      isOutsideInitialList?: boolean;
      isExpertApproved?: boolean;
      auditKey?: string;
    })[] = outsideRegisteredBooks
      .filter((r) =>
        normalizePersianText(
          `${r.tempBookId} ${r.title} ${r.publisher} ${r.author} ${r.notes} ${r.location}`
        ).includes(q)
      )
      .map((r, i) => ({
        rowKey: r.key,
        rowIndex: 10000 + i,
        tempBookId: r.tempBookId,
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
            ? 'تأییدشده کارشناس (خارج از فهرست اولیه)'
            : 'ثبت‌شده — در انتظار تأیید کارشناس (خارج از فهرست اولیه ۹۸۰ کتاب)',
        noteRaw: r.notes || '',
        backupSourceSheet: r.sheet || 'خارج از فهرست اولیه',
        backupSourceRow: String(i + 1),
        allValues: [r.tempBookId, r.title, r.publisher, r.notes, r.category, r.author],
        isOutsideInitialList: true,
        isExpertApproved: r.physical === 'verified' && r.copyStatus === 'verified_present',
        auditKey: r.key
      }));

    const catalogMatches = catalogRows
      .filter((b) =>
        normalizePersianText(
          `${b.tempBookId} ${b.titleRaw} ${b.publisherRaw} ${b.authorRaw} ${b.descriptionRaw}`
        ).includes(q)
      )
      .slice(0, 8);

    const matchedBooks = [...outsideAsCatalogRows, ...catalogMatches].slice(0, 12);

    const customMartyrMatches: WorkbookGolzarMartyr[] = customMartyrs
      .filter((cm) =>
        normalizePersianText(
          `${cm.martyrId} ${cm.fullName} ${cm.gravePiece} ${cm.graveRow} ${cm.graveNumber}`
        ).includes(q)
      )
      .map((cm) => ({
        tempPersonId: cm.martyrId,
        firstNameRaw: cm.firstName,
        lastNameRaw: cm.lastName,
        fullNameSearch: cm.fullName,
        piece: cm.gravePiece,
        graveRow: cm.graveRow,
        graveNumber: cm.graveNumber,
        graveStatus: cm.graveVerificationStatus,
        sourceFile: 'ثبت کارشناس در سامانه',
        sourceSheet: 'پرونده شهدا',
        sourceRow: '—'
      }));

    const workbookMartyrMatches = workbookMartyrs
      .filter((m) =>
        normalizePersianText(
          `${m.tempPersonId} ${m.fullNameSearch} ${m.piece} ${m.graveRow} ${m.graveNumber}`
        ).includes(q)
      )
      .slice(0, 8);

    const matchedMartyrs = [...customMartyrMatches, ...workbookMartyrMatches].slice(0, 8);

    const matchedLinks = links
      .filter((l) =>
        normalizePersianText(`${l.martyrNameRaw} ${l.bookTitleRaw} ${l.pageReferenceRaw}`).includes(
          q
        )
      )
      .slice(0, 6);

    const matchedExtracted = extractedItems
      .filter((ex) =>
        normalizePersianText(
          `${ex.martyrNameRaw} ${ex.bookTitleRaw} ${ex.passageTitle} ${ex.extractedText}`
        ).includes(q)
      )
      .slice(0, 5);

    return { matchedBooks, matchedMartyrs, matchedLinks, matchedExtracted };
  }, [globalQuery, outsideRegisteredBooks, catalogRows, customMartyrs, workbookMartyrs, links, extractedItems]);

  // Accurate Separated Statistics (Section 8 Menu 1 & Section 16)
  const stats = useMemo(() => {
    const auditList = Object.values(auditRecords);
    const verifiedInShelf = auditList.filter((r) => r.physical === 'verified').length;
    const notFoundInRound = auditList.filter((r) => r.physical === 'not_found').length;
    const needsReviewBooks = auditList.filter((r) => r.physical === 'review').length;
    const outsideExcelBooks = auditList.filter((r) => r.source === 'outside-list').length;
    const uncheckedCatalogBooks = Math.max(
      0,
      catalogRows.length - auditList.filter((r) => r.source === 'catalog').length
    );

    const confirmedLinks = links.filter((l) => l.reviewStatus.includes('تأیید')).length;
    const pendingLinks = links.length - confirmedLinks;
    const openPendingIssues = pendingReviews.filter((p) => p.trackingStatus === 'باز').length;
    const pendingSmartQueue = smartSuggestions.filter(
      (s) => s.reviewStatus === 'در صف بررسی کارشناس'
    ).length;

    return {
      verifiedInShelf,
      notFoundInRound,
      needsReviewBooks,
      outsideExcelBooks,
      uncheckedCatalogBooks,
      confirmedLinks,
      pendingLinks,
      openPendingIssues,
      pendingSmartQueue
    };
  }, [auditRecords, catalogRows.length, links, pendingReviews, smartSuggestions]);

  return (
    <div className="space-y-6">
      {/* Top Hero Card: Global Search & Quick Field Actions */}
      <section className="home-hero bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-titr text-lg sm:text-2xl font-bold text-[#332218]">
              سامانه مدیریت کتابخانه و پژوهش مرکز اسناد گلزار شهدای تهران
            </h1>
            <p className="text-xs text-[#697586]">
              جست‌وجوی سراسری در کتاب‌ها ({toPersianDigits(totalBooksCount)} کتاب ثبت‌شده در سامانه)، نسخه‌های فیزیکی قفسه‌ها، پرونده شهدا و مطالب پژوهشی
            </p>
          </div>

          {/* Primary Quick Actions (Only Quick Book & Voice Registration) */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowQuickBookModal(true)}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#6B3E26] hover:bg-[#56311E] text-white text-xs font-bold flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>ثبت سریع کتاب</span>
            </button>

            <button
              type="button"
              onClick={openVoiceRegistrationModal}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#FAF5EE] hover:bg-[#F3E9DC] text-[#332218] border border-[#D8C7B2] text-xs font-bold flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Mic className="w-4 h-4 text-[#6B3E26]" />
              <span>ثبت صوتی اطلاعات کنار قفسه</span>
            </button>
          </div>
        </div>

        {/* پیام تأیید فوری پس از ثبت سریع یا صوتی کتاب */}
        {lastSavedNotice && (
          <div className="bg-[#EDF6F0] border-2 border-[#A8D5B5] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#1E4D2B]">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-[#2E6F40] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-sm text-[#1E4D2B]">
                  ✅ کتاب «{lastSavedNotice.title}» با موفقیت در حافظه دستگاه ثبت شد!
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#1E4D2B]">
                  <span className="font-mono bg-white px-2 py-0.5 rounded border border-[#A8D5B5]">
                    شناسه: {lastSavedNotice.tempBookId}
                  </span>
                  <span className="font-mono bg-white px-2 py-0.5 rounded border border-[#A8D5B5]">
                    نسخه: {lastSavedNotice.copyId}
                  </span>
                  <span className="font-mono bg-white px-2 py-0.5 rounded border border-[#A8D5B5]">
                    محل: {lastSavedNotice.location}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#FAF5EE] text-[#6B3E26] border border-[#D8C7B2] font-bold">
                    ⏳ خارج از فهرست اولیه (۹۸۰ کتاب) — در انتظار تأیید کارشناس
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (onOpenBookInLibrary) {
                    onOpenBookInLibrary(lastSavedNotice.title);
                  } else {
                    onNavigateTab('library');
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-[#6B3E26] text-white font-bold text-xs hover:bg-[#56311E] cursor-pointer"
              >
                مشاهده در کتابخانه ←
              </button>
              <button
                type="button"
                onClick={() => setLastSavedNotice(null)}
                className="px-2.5 py-1.5 rounded-lg bg-white border border-[#D8C7B2] text-[#332218] text-xs cursor-pointer"
              >
                بستن پیام
              </button>
            </div>
          </div>
        )}

        {/* Global Instant Search Input (Supports Enter Key) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!globalQuery.trim()) {
              onNotify('عبارت مورد نظر خود را تایپ کرده و کلید اینتر (Enter) را بزنید.', 'warning');
              return;
            }
            if (searchResults) {
              const totalHits =
                searchResults.matchedBooks.length +
                searchResults.matchedMartyrs.length +
                searchResults.matchedLinks.length +
                searchResults.matchedExtracted.length;
              if (totalHits > 0) {
                const el = document.getElementById('global-search-results-box');
                el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                onNotify(
                  `جست‌وجو انجام شد: ${toPersianDigits(searchResults.matchedBooks.length)} کتاب، ${toPersianDigits(
                    searchResults.matchedMartyrs.length
                  )} شهید و ${toPersianDigits(searchResults.matchedLinks.length)} ارتباط یافت شد.`
                );
              } else {
                onNotify(`موردی با عبارت «${globalQuery}» در فهرست فعلی یافت نشد.`, 'warning');
              }
            }
          }}
          className="relative"
        >
          <Search className="w-5 h-5 text-[#6E5846] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={globalQuery}
            onChange={(e) => setGlobalQuery(e.target.value)}
            placeholder={`جست‌وجوی سریع عنوان کتاب (از میان ${toPersianDigits(totalBooksCount)} کتاب سامانه)، نام شهید، ناشر یا کد...`}
            className="w-full min-h-[48px] pr-11 pl-28 py-2.5 text-sm bg-[#FAF5EE] border border-[#D8C7B2] rounded-xl focus:outline-none focus:border-[#6B3E26] focus:bg-white text-[#332218]"
          />
          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {globalQuery && (
              <button
                type="button"
                onClick={() => setGlobalQuery('')}
                className="px-2 py-1 text-xs text-[#6E5846] hover:text-[#332218] bg-[#F3E9DC] rounded-lg cursor-pointer"
              >
                پاک‌کردن
              </button>
            )}
            <button
              type="submit"
              className="px-3 py-1.5 text-xs font-bold bg-[#6B3E26] text-white rounded-lg hover:bg-[#56311E] transition-colors cursor-pointer"
            >
              جست‌وجو ↵
            </button>
          </div>
        </form>

        {/* Global Search Instant Results Drawer */}
        {searchResults && (
          <div id="global-search-results-box" className="bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#5C4636]">
              <span>
                نتایج جست‌وجوی سراسری برای «<strong className="text-[#332218]">{globalQuery}</strong>» (با رفتن به تب‌ها و بازگشت، این جست‌وجو حفظ می‌شود):
              </span>
              <span className="tabular-nums font-bold text-[#6B3E26]">
                {toPersianDigits(searchResults.matchedBooks.length)} کتاب ·{' '}
                {toPersianDigits(searchResults.matchedMartyrs.length)} شهید ·{' '}
                {toPersianDigits(searchResults.matchedLinks.length)} ارتباط پژوهشی
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Matched Books */}
              <div className="bg-white border border-[#E2D2BE] rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-[#6B3E26]">
                    کتاب‌های منطبق در فهرست ({toPersianDigits(searchResults.matchedBooks.length)})
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenBookInLibrary) {
                        onOpenBookInLibrary(globalQuery);
                      } else {
                        onNavigateTab('library');
                      }
                    }}
                    className="text-[11px] text-[#6B3E26] font-bold hover:underline cursor-pointer"
                  >
                    مشاهده این جست‌وجو در کتابخانه ←
                  </button>
                </div>
                {searchResults.matchedBooks.length === 0 ? (
                  <p className="text-xs text-[#6E5846] py-2">کتابی با این عبارت یافت نشد.</p>
                ) : (
                  <div className="divide-y divide-[#EFE5D8]">
                    {searchResults.matchedBooks.map((b) => {
                      const extBook = b as ReferenceCatalogRow & {
                        isOutsideInitialList?: boolean;
                        isExpertApproved?: boolean;
                        auditKey?: string;
                      };
                      return (
                        <div key={b.rowKey} className="py-2.5 flex flex-col gap-1.5 text-xs">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <div>
                                <span className="font-bold text-[#332218]">{b.titleRaw}</span>
                                <span className="text-[#6E5846] mr-2">
                                  · {b.publisherRaw || 'ناشر ثبت‌نشده'} · {b.tempBookId}
                                </span>
                                {b.locationRaw && (
                                  <span className="font-mono text-[11px] text-[#6B3E26] mr-1.5">
                                    ({b.locationRaw})
                                  </span>
                                )}
                              </div>
                              <div>
                                {extBook.isOutsideInitialList ? (
                                  extBook.isExpertApproved ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#EDF6F0] text-[#1E4D2B] border border-[#A8D5B5] text-[10.5px] font-bold">
                                      <ShieldCheck className="w-3 h-3" />
                                      <span>ثبت جدید (خارج از فهرست اولیه ۹۸۰ کتاب) — تأییدشده توسط کارشناس</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#FAF5EE] text-[#6B3E26] border border-[#D8C7B2] text-[10.5px] font-bold">
                                      <AlertTriangle className="w-3 h-3 text-[#6B3E26]" />
                                      <span>ثبت‌شده — هنوز توسط کارشناس تأیید نشده (خارج از فهرست اولیه ۹۸۰ کتاب)</span>
                                    </span>
                                  )
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#FAF5EE] text-[#5C4636] text-[10px]">
                                    موجود در فهرست اولیه (۹۸۰ کتاب)
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {extBook.isOutsideInitialList && !extBook.isExpertApproved && extBook.auditKey && onApproveOutsideBook && (
                                <button
                                  type="button"
                                  onClick={() => onApproveOutsideBook(extBook.auditKey!)}
                                  className="px-2 py-1 text-[11px] bg-[#2E6F40] hover:bg-[#245832] text-white font-bold rounded-lg cursor-pointer"
                                  title="تأیید کارشناسی این کتاب"
                                >
                                  ✓ تأیید کارشناس
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  if (onOpenBookInLibrary) {
                                    onOpenBookInLibrary(b.titleRaw);
                                  } else {
                                    onNavigateTab('library');
                                  }
                                }}
                                className="px-2.5 py-1 text-[11px] bg-[#FAF5EE] hover:bg-[#F3E9DC] text-[#6B3E26] border border-[#D8C7B2] font-bold rounded-lg shrink-0 cursor-pointer"
                              >
                                پرونده کتاب
                              </button>
                              {extBook.isOutsideInitialList && extBook.auditKey && onDeleteAuditRecord && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteAuditRecord(extBook.auditKey!)}
                                  className="p-1 text-[#A63A3A] hover:bg-[#FDF0F0] rounded-lg cursor-pointer"
                                  title="حذف این رکورد ثبت‌شده"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Matched Martyrs & Links */}
              <div className="bg-white border border-[#E2D2BE] rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-[#6B3E26]">پرونده شهدا و ارتباط‌های پژوهشی</h3>
                  <button
                    type="button"
                    onClick={() => onNavigateTab('martyrs')}
                    className="text-[11px] text-[#6B3E26] font-bold hover:underline cursor-pointer"
                  >
                    مشاهده در منوی شهدا ←
                  </button>
                </div>
                {searchResults.matchedMartyrs.length === 0 &&
                searchResults.matchedLinks.length === 0 ? (
                  <p className="text-xs text-[#6E5846] py-2">
                    شهید یا ارتباط پژوهشی با عبارت «{globalQuery}» ثبت نشده است.
                  </p>
                ) : (
                  <div className="divide-y divide-[#EFE5D8]">
                    {searchResults.matchedMartyrs.slice(0, 4).map((m) => (
                      <div
                        key={m.tempPersonId}
                        className="py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <span className="font-bold text-[#332218]">{m.fullNameSearch}</span>
                          <span className="text-[#6E5846] mr-2">
                            · قطعه {m.piece || '—'} ردیف {m.graveRow || '—'} شماره{' '}
                            {m.graveNumber || '—'}
                          </span>
                          <span className="text-[10px] text-[#5C4636] bg-[#FAF5EE] border border-[#E2D2BE] rounded px-1.5 py-0.5 mr-1.5">
                            {m.sourceSheet === 'پرونده شهدا' ? 'پرونده ثبت‌شده' : 'بانک شهدای گلزار'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onNavigateTab('martyrs')}
                          className="px-2 py-1 text-[11px] bg-[#FAF5EE] text-[#6B3E26] border border-[#D8C7B2] font-bold rounded-lg shrink-0 cursor-pointer"
                        >
                          پرونده شهید
                        </button>
                      </div>
                    ))}
                    {searchResults.matchedLinks.slice(0, 4).map((l) => (
                      <div key={l.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                        <div>
                          <span className="font-bold text-[#332218]">{l.martyrNameRaw}</span>
                          <span className="text-[#6E5846] mr-2">
                            ← کتاب «{l.bookTitleRaw}» {l.pageReferenceRaw ? `(${l.pageReferenceRaw})` : ''}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onNavigateTab('research')}
                          className="px-2 py-1 text-[11px] bg-[#FAF5EE] text-[#6B3E26] border border-[#D8C7B2] font-bold rounded-lg shrink-0 cursor-pointer"
                        >
                          بررسی ارتباط
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* فهرست کتاب‌های ثبت‌شده جدید در خانه (خارج از فهرست اولیه ۹۸۰ کتاب) برای رؤیت فوری و تأیید کارشناس */}
        {outsideRegisteredBooks.length > 0 && (
          <div className="bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#6B3E26]" />
                <h3 className="text-xs sm:text-sm font-bold text-[#332218]">
                  کتاب‌های ثبت‌شده جدید توسط شما (خارج از فهرست اولیه ۹۸۰ کتاب):{' '}
                  <span className="text-[#6B3E26]">{toPersianDigits(outsideRegisteredBooks.length)} مورد</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (onOpenBookInLibrary) {
                    onOpenBookInLibrary('');
                  } else {
                    onNavigateTab('library');
                  }
                }}
                className="text-xs font-bold text-[#6B3E26] hover:underline cursor-pointer"
              >
                مدیریت در بخش کتابخانه ←
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-0.5">
              {outsideRegisteredBooks.map((rec) => {
                const isApproved = rec.physical === 'verified' && rec.copyStatus === 'verified_present';
                return (
                  <div
                    key={rec.key}
                    className="bg-white border border-[#E2D2BE] rounded-xl p-3 flex flex-col justify-between gap-2 text-xs shadow-2xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-[#332218] text-sm">{rec.title}</span>
                        <span className="font-mono text-[11px] text-[#5C4636] bg-[#FAF5EE] px-2 py-0.5 rounded border border-[#E2D2BE]" dir="ltr">
                          {rec.tempBookId} · {rec.location || 'بدون محل'}
                        </span>
                      </div>
                      <div className="text-[#5C4636] text-[11px]">
                        {[
                          rec.author && `نویسنده: ${rec.author}`,
                          rec.publisher && `ناشر: ${rec.publisher}`,
                          rec.year && `سال: ${rec.year}`,
                          rec.category && `دسته: ${rec.category.split(' ')[0]}`
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'مشخصات تکمیلی ثبت‌نشده'}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-[#EFE5D8]">
                      {isApproved ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#EDF6F0] text-[#1E4D2B] border border-[#A8D5B5] text-[10.5px] font-bold">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>تأییدشده توسط کارشناس (خارج از ۹۸۰ کتاب اولیه)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FAF5EE] text-[#6B3E26] border border-[#D8C7B2] text-[10.5px] font-bold">
                          <AlertTriangle className="w-3.5 h-3.5 text-[#6B3E26]" />
                          <span>ثبت‌شده — هنوز توسط کارشناس تأیید نشده (خارج از فهرست اولیه)</span>
                        </span>
                      )}

                      <div className="flex items-center gap-1.5">
                        {!isApproved && onApproveOutsideBook && (
                          <button
                            type="button"
                            onClick={() => onApproveOutsideBook(rec.key)}
                            className="px-2.5 py-1 rounded-lg bg-[#2E6F40] hover:bg-[#245832] text-white font-bold text-[11px] cursor-pointer"
                          >
                            ✓ تأیید کارشناس
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (onOpenBookInLibrary) {
                              onOpenBookInLibrary(rec.title);
                            } else {
                              onNavigateTab('library');
                            }
                          }}
                          className="px-2 py-1 rounded-lg bg-[#FAF5EE] text-[#6B3E26] border border-[#D8C7B2] font-bold text-[11px] cursor-pointer"
                        >
                          کتابخانه
                        </button>
                        {onDeleteAuditRecord && (
                          <button
                            type="button"
                            onClick={() => onDeleteAuditRecord(rec.key)}
                            className="p-1 rounded-lg text-[#A63A3A] hover:bg-[#FDF0F0] cursor-pointer"
                            title="حذف این رکورد (مناسب حذف رکوردهای تستی)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* مرکز دپو و خروجی دوسویه اسناد در پژوهش (با رنگ آبی ملایم و روشن متمایز از بقیه صفحه) */}
      <section className="depository-soft-blue rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-white text-[#23538A] border border-[#B8D2EC] text-[11px] font-bold">
              <Sparkles className="w-3.5 h-3.5 text-[#23538A]" />
              <span>
                خروجی دوسویه اسناد در پژوهش (ارتباط {toPersianDigits(totalMartyrsCount)} شهید با {toPersianDigits(totalBooksCount)} کتاب)
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-[#1E3A5F]">
              انبار جامع پیوندهای کتاب و شهید
            </h3>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('research')}
            className="min-h-[44px] px-4 py-2 bg-[#2E6F40] hover:bg-[#245832] text-white font-bold text-xs rounded-xl inline-flex items-center justify-center gap-2 shadow-xs transition-all shrink-0 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>ورود به خروجی دوسویه اسناد و اکسل ←</span>
          </button>
        </div>
      </section>

      <details className="home-statistics">
        <summary>نمایش آمار تفصیلی و وضعیت ثبت‌ها</summary>
        <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-[#253247]">
              آمار تفکیک‌شده کتاب‌شناختی، نسخه‌های فیزیکی و ارتباط‌های پژوهشی
            </h2>
            <p className="text-xs text-[#697586] mt-0.5">
              مطابق اصول مرکز اسناد، تعداد رکوردهای فهرست Excel، تعداد جلدهای فیزیکی قفسه و تعداد ارتباط‌های پژوهشی کاملاً مستقل گزارش می‌شوند
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('management')}
            className="text-xs font-bold text-[#1F4E79] hover:underline self-start sm:self-center"
          >
            گزارش‌های مدیریتی ۱۶گانه و خروجی Excel ←
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Card 1: Bibliographic vs Physical Shelf Count */}
          <div className="bg-[#F5F7FA] border border-slate-200/80 rounded-xl p-3.5 space-y-1.5">
            <div className="text-xs font-bold text-[#1F4E79]">۱. آثار کتاب‌شناختی و شمارش قفسه</div>
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-xs text-[#697586]">رکورد فهرست مرجع Excel:</span>
              <span className="text-base font-bold text-[#253247] tabular-nums">
                {toPersianDigits(catalogRows.length)} اثر
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-[#697586]">شمارش فیزیکی ۶ دسته قفسه:</span>
              <span className="text-sm font-bold text-[#2E7D5B] tabular-nums">
                {toPersianDigits(942)} جلد
              </span>
            </div>
            <div className="text-[11px] text-[#C58A2B] pt-1 border-t border-slate-200/70">
              اختلاف حسابی ۳۸ موردی در دست بررسی میدانی است (بدون برچسب قطعی مفقودی یا تکراری).
            </div>
          </div>

          {/* Card 2: Field Verification Progress */}
          <div className="bg-[#F5F7FA] border border-slate-200/80 rounded-xl p-3.5 space-y-1.5">
            <div className="text-xs font-bold text-[#2E7D5B]">۲. وضعیت بررسی نسخه‌های فیزیکی</div>
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-xs text-[#697586]">مشاهده و تأییدشده در قفسه:</span>
              <span className="text-base font-bold text-[#2E7D5B] tabular-nums">
                {toPersianDigits(stats.verifiedInShelf)} رکورد
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-[#697586]">نسخه‌های فیزیکی مستقل (CP):</span>
              <span className="text-sm font-bold text-[#253247] tabular-nums">
                {toPersianDigits(bookCopies.length + stats.verifiedInShelf)} جلد
              </span>
            </div>
            <div className="text-[11px] text-[#697586] pt-1 border-t border-slate-200/70 tabular-nums">
              بررسی‌نشده فهرست: {toPersianDigits(stats.uncheckedCatalogBooks)} · خارج از فهرست:{' '}
              {toPersianDigits(stats.outsideExcelBooks)}
            </div>
          </div>

          {/* Card 3: Book-Martyr Links */}
          <div className="bg-[#F5F7FA] border border-slate-200/80 rounded-xl p-3.5 space-y-1.5">
            <div className="text-xs font-bold text-[#1F4E79]">۳. ارتباط کتاب و شهید</div>
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-xs text-[#697586]">کل ارتباط‌های ثبت‌شده:</span>
              <span className="text-base font-bold text-[#253247] tabular-nums">
                {toPersianDigits(links.length)} ارتباط
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-[#697586]">تأییدشده کارشناسی:</span>
              <span className="text-sm font-bold text-[#2E7D5B] tabular-nums">
                {toPersianDigits(stats.confirmedLinks)} مورد
              </span>
            </div>
            <div className="text-[11px] text-[#C58A2B] pt-1 border-t border-slate-200/70 tabular-nums">
              منتظر بررسی / تفکیک نام: {toPersianDigits(stats.pendingLinks)} مورد
            </div>
          </div>

          {/* Card 4: Research & Smart Search Queue */}
          <div className="bg-[#F5F7FA] border border-slate-200/80 rounded-xl p-3.5 space-y-1.5">
            <div className="text-xs font-bold text-[#C58A2B]">۴. مطالب پژوهشی و صف هوشمند</div>
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-xs text-[#697586]">مطالب استخراج‌شده با صفحه:</span>
              <span className="text-base font-bold text-[#253247] tabular-nums">
                {toPersianDigits(extractedItems.length)} مطلب
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-[#697586]">پیشنهادهای جست‌وجوی هوشمند:</span>
              <span className="text-sm font-bold text-[#C58A2B] tabular-nums">
                {toPersianDigits(stats.pendingSmartQueue)} در صف بررسی
              </span>
            </div>
            <div className="text-[11px] text-[#697586] pt-1 border-t border-slate-200/70 tabular-nums">
              موارد باز نیازمند پیگیری: {toPersianDigits(stats.openPendingIssues)} مورد
            </div>
          </div>
        </div>

        {/* 6 Subject Categories Reported Physical Breakdown */}
        <div className="pt-2">
          <div className="text-xs font-bold text-[#253247] mb-2 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-[#1F4E79]" />
            <span>توزیع شمارش فیزیکی گزارش‌شده در ۶ دسته موضوعی قفسه‌ها (جمع: ۹۴۲ جلد):</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {SUBJECT_CATEGORIES.filter((c) => c.code !== 'UNSET').map((cat) => (
              <div
                key={cat.code}
                className="bg-white border border-slate-200 rounded-xl p-2.5 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1F4E79]">{cat.code}</span>
                  <span className="text-xs font-bold text-[#253247] tabular-nums">
                    {toPersianDigits(cat.physicalCountReported)} جلد
                  </span>
                </div>
                <div className="text-[11px] text-[#253247] font-medium mt-1">{cat.fullTitle}</div>
                <div className="text-[10px] text-[#697586] mt-0.5">{cat.allocatedLocationText}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      

      {/* Two-Column Bottom Row: Items Needing Follow-Up & Recent Activity */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Follow-up & Discrepancies */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#253247] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#C58A2B]" />
              <span>موارد دارای نقص یا نیازمند پیگیری کارشناس</span>
            </h3>
            <button
              type="button"
              onClick={() => onNavigateTab('research')}
              className="text-xs text-[#1F4E79] font-bold hover:underline"
            >
              میز بررسی کامل ←
            </button>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            <div className="py-2.5 flex items-center justify-between gap-3">
              <div>
                <div className="font-bold text-[#253247]">
                  صف بررسی پیشنهادهای جست‌وجوی هوشمند بیرونی
                </div>
                <div className="text-[#697586] mt-0.5">
                  کتاب‌های یافت‌شده در کتابخانه ملی، فیپا و سوره مهر که منتظر تأیید کارشناس هستند
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('smart_search')}
                className="px-3 py-1.5 rounded-lg bg-amber-50 text-[#C58A2B] font-bold shrink-0 tabular-nums"
              >
                {toPersianDigits(stats.pendingSmartQueue)} مورد
              </button>
            </div>

            <div className="py-2.5 flex items-center justify-between gap-3">
              <div>
                <div className="font-bold text-[#253247]">
                  شیت «موارد نیازمند بررسی» اکسل مرجع (ابهام نام / عنوان مشابه)
                </div>
                <div className="text-[#697586] mt-0.5">
                  شامل ۲۲۷ ردیف علامت «*»، ۱۱ عنوان مشابه ناشران و عبارت‌های گروهی
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('research')}
                className="px-3 py-1.5 rounded-lg bg-[#EAF1F7] text-[#1F4E79] font-bold shrink-0 tabular-nums"
              >
                {toPersianDigits(stats.openPendingIssues)} مورد باز
              </button>
            </div>

            <div className="py-2.5 flex items-center justify-between gap-3">
              <div>
                <div className="font-bold text-[#253247]">
                  کاربرگ بازبینی کارشناس ۱۶ گروه کتاب چندشهیدی (G001 تا G016)
                </div>
                <div className="text-[#697586] mt-0.5">
                  تأیید مرز ردیف‌های شیت «چند شهید» و تکمیل ۲ نقص شماره مزار (ردیف ۱۱ و ۹۷)
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('research')}
                className="px-3 py-1.5 rounded-lg bg-[#EAF1F7] text-[#1F4E79] font-bold shrink-0"
              >
                ۱۶ گروه
              </button>
            </div>
          </div>
        </div>

        {/* Recent Work & Audit Trail */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#253247] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#1F4E79]" />
              <span>میانبر به کارهای اخیر (Audit Log)</span>
            </h3>
            <button
              type="button"
              onClick={() => onNavigateTab('management')}
              className="text-xs text-[#1F4E79] font-bold hover:underline"
            >
              مشاهده تمام سوابق ←
            </button>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {auditLog.slice(0, 4).map((entry) => (
              <div key={entry.id} className="py-2.5 space-y-1">
                <div className="flex items-center justify-between text-[11px] text-[#697586]">
                  <span className="font-bold text-[#1F4E79]">{entry.actionType}</span>
                  <span className="tabular-nums">
                    {entry.timestamp} · {entry.actorName}
                  </span>
                </div>
                <div className="text-[#253247]">{entry.summary}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      </details>

      {/* کارت پشتیبان و گزارش‌ها در زیر بخش نمایش آمار تفصیلی */}
      <section className="pt-1">
        <button
          type="button"
          onClick={() => onNavigateTab('management')}
          className="home-section-card w-full text-right group flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <span className="home-section-icon shrink-0">
              <Layers className="w-5 h-5" />
            </span>
            <div className="space-y-0.5">
              <span className="home-section-title block">پشتیبان و گزارش‌ها</span>
              <span className="home-section-note block">
                پشتیبان‌گیری JSON، خروجی Excel، نصب برنامه روی گوشی اندروید و گزارش‌های مدیریتی ۱۶گانه
              </span>
            </div>
          </div>
          <span className="home-section-open shrink-0 self-end sm:self-center">
            ورود به بخش پشتیبان و گزارش‌ها <ArrowLeft className="w-3.5 h-3.5" />
          </span>
        </button>
      </section>

      {/* MODAL 1: Persian Voice Input & Structured Command Parser (Section 11) */}
      {showVoiceModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-[#253247] flex items-center gap-2">
                  <Mic className="w-5 h-5 text-[#2E7D5B]" />
                  <span>ورود صوتی فارسی و ثبت سریع کنار قفسه (با پیش‌نمایش و تفکیک خودکار فیلدها)</span>
                </h2>
                <p className="text-xs text-[#697586] mt-0.5">
                  گفتار شما به متن تبدیل شده، فیلدها (عنوان، نویسنده، ناشر، سال، نوبت چاپ، گروه و محل) تفکیک می‌شوند و فقط پس از تأیید شما ذخیره می‌گردد
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowVoiceModal(false)}
                className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded-lg text-[#253247]"
              >
                بستن
              </button>
            </div>

            {/* User Consent Notice (Section 11 rule) */}
            <label className="flex items-start gap-2 bg-[#EAF1F7] p-3 rounded-xl text-xs text-[#253247] cursor-pointer">
              <input
                type="checkbox"
                checked={voiceConsentChecked}
                onChange={(e) => setVoiceConsentChecked(e.target.checked)}
                className="mt-0.5 rounded"
              />
              <span>
                <strong>رضایت کاربر:</strong> هیچ فایل صوتی به سرویس بیرونی ناشناس ارسال یا ضبط نمی‌شود. تبدیل گفتار به متن صرفاً با موتور محلی مرورگر (Android Chrome) یا میکروفون صفحه‌کلید گوشی انجام می‌گیرد.
              </span>
            </label>

            {/* Voice Command Input & Controls */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-bold text-[#253247]">
                  ۱. متن فرمان صوتی (می‌توانید دکمه میکروفون را بزنید یا با میکروفون کیبورد اندروید صحبت کنید):
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleStartBrowserSpeechRecognition}
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                      isListening
                        ? 'bg-[#B94A48] text-white'
                        : 'bg-[#2E7D5B] hover:bg-[#246348] text-white'
                    }`}
                  >
                    <Mic className="w-4 h-4" />
                    <span>{isListening ? 'در حال گوش دادن (فارسی)...' : 'شروع تشخیص گفتار مرورگر'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => syncVoiceToPreview(SAMPLE_VOICE_COMMAND)}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#253247] text-xs font-medium"
                  >
                    بارگذاری فرمان نمونه استاندارد
                  </button>
                </div>
              </div>

              <textarea
                rows={3}
                value={voiceTranscript}
                onChange={(e) => syncVoiceToPreview(e.target.value)}
                placeholder="نمونه: عنوان کتاب: دلیل. نویسنده: نام نویسنده. ناشر: انتشارات بیست و هفت. سال چاپ: ۱۳۹۸. نوبت چاپ: سوم. گروه: روایت و خاطرات. محل: قفسه یک، طبقه سه."
                className="w-full p-3 text-xs sm:text-sm bg-[#F5F7FA] border border-slate-300 rounded-xl focus:outline-none focus:border-[#1F4E79] focus:bg-white text-[#253247]"
              />
            </div>

            {/* Uncertainty Warnings */}
            {parsedVoice.uncertainFields.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
                <div className="text-xs font-bold text-[#C58A2B] flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  <span>موارد نامطمئن یا نیازمند بررسی در فرمان صوتی:</span>
                </div>
                <ul className="text-xs text-[#253247] pr-4 list-disc space-y-0.5">
                  {parsedVoice.uncertainFields.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Editable Preview Form Before Saving */}
            <form onSubmit={handleConfirmVoiceBookSave} className="space-y-3 pt-1">
              <div className="text-xs font-bold text-[#1F4E79]">
                ۲. پیش‌نمایش فیلدهای تفکیک‌شده برای بررسی و اصلاح کاربر پیش از ذخیره:
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#253247] mb-1">
                    عنوان کتاب *
                  </label>
                  <input
                    type="text"
                    required
                    value={previewTitle}
                    onChange={(e) => setPreviewTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#253247] mb-1">
                    نویسنده / گردآورنده
                  </label>
                  <input
                    type="text"
                    value={previewAuthor}
                    onChange={(e) => setPreviewAuthor(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#253247] mb-1">
                    ناشر
                  </label>
                  <input
                    type="text"
                    value={previewPublisher}
                    onChange={(e) => setPreviewPublisher(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-[#253247] mb-1">
                      سال چاپ
                    </label>
                    <input
                      type="text"
                      value={previewYear}
                      onChange={(e) => setPreviewYear(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[#253247] mb-1">
                      نوبت چاپ
                    </label>
                    <input
                      type="text"
                      value={previewEdition}
                      onChange={(e) => setPreviewEdition(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#253247] mb-1">
                    گروه موضوعی (۶ دسته)
                  </label>
                  <select
                    value={previewCategory}
                    onChange={(e) => setPreviewCategory(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
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
                    <label className="block text-[11px] font-bold text-[#253247] mb-1">
                      قفسه (SH-01..04)
                    </label>
                    <select
                      value={previewShelf}
                      onChange={(e) => setPreviewShelf(e.target.value as ShelfCode)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
                    >
                      {SHELVES.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.code}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[#253247] mb-1">
                      طبقه از بالا (T01..06)
                    </label>
                    <select
                      value={previewLevel}
                      onChange={(e) => setPreviewLevel(e.target.value as LevelCode)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
                    >
                      {LEVELS.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.code}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between bg-[#F5F7FA] px-3 py-2 rounded-xl text-xs">
                <span>
                  کد محل خودکار ساخته‌شده: <strong className="font-mono text-[#1F4E79]">{previewShelf}-{previewLevel}</strong>
                </span>
                <span className="text-[#2E7D5B] font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>آماده تأیید نهایی</span>
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowVoiceModal(false)}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-100 text-[#253247] text-xs font-bold"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-[#2E7D5B] hover:bg-[#246348] text-white text-xs font-bold"
                >
                  تأیید پیش‌نمایش و ذخیره نهایی کتاب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Quick Manual Book Registration */}
      {showQuickBookModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-sm font-bold text-[#253247]">ثبت سریع کتاب و نسخه فیزیکی</h2>
              <button
                type="button"
                onClick={() => setShowQuickBookModal(false)}
                className="px-2.5 py-1 text-xs bg-slate-100 rounded-lg"
              >
                بستن
              </button>
            </div>
            <form onSubmit={handleConfirmQuickBookSave} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#253247] mb-1">عنوان کتاب *</label>
                <input
                  type="text"
                  required
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  placeholder="نام دقیق کتاب روی جلد..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#253247] mb-1">نویسنده</label>
                  <input
                    type="text"
                    value={quickAuthor}
                    onChange={(e) => setQuickAuthor(e.target.value)}
                    placeholder="اختیاری..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#253247] mb-1">ناشر</label>
                  <input
                    type="text"
                    value={quickPublisher}
                    onChange={(e) => setQuickPublisher(e.target.value)}
                    placeholder="نام ناشر..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-bold text-[#253247] mb-1">دسته موضوعی</label>
                  <select
                    value={quickCategory}
                    onChange={(e) => setQuickCategory(e.target.value)}
                    className="w-full px-2 py-2 text-xs border border-slate-300 rounded-xl bg-white"
                  >
                    {SUBJECT_CATEGORIES.map((c) => (
                      <option key={c.code} value={c.label}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#253247] mb-1">قفسه</label>
                  <select
                    value={quickShelf}
                    onChange={(e) => setQuickShelf(e.target.value as ShelfCode)}
                    className="w-full px-2 py-2 text-xs border border-slate-300 rounded-xl bg-white"
                  >
                    {SHELVES.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#253247] mb-1">طبقه</label>
                  <select
                    value={quickLevel}
                    onChange={(e) => setQuickLevel(e.target.value as LevelCode)}
                    className="w-full px-2 py-2 text-xs border border-slate-300 rounded-xl bg-white"
                  >
                    {LEVELS.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowQuickBookModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-bold"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#1F4E79] text-white text-xs font-bold"
                >
                  ثبت کتاب در {quickShelf}-{quickLevel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Android & iOS PWA Installation Guide */}
      {showInstallGuideModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-[#253247]">
                راهنمای نصب برنامه روی صفحه اصلی گوشی اندروید (PWA)
              </h3>
              <button
                type="button"
                onClick={() => setShowInstallGuideModal(false)}
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
    </div>
  );
};
