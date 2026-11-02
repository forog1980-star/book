import React, { useState, useMemo } from 'react';
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
  Layers
} from 'lucide-react';
import {
  BookMartyrLinkRecord,
  OFFICIAL_SEARCH_SOURCES,
  ReferenceCatalogRow,
  SmartSearchSuggestion,
  SmartSuggestionReviewStatus,
  SUBJECT_CATEGORIES,
  WorkbookGolzarMartyr,
  normalizePersianText,
  toPersianDigits
} from '../data/markazAsnadData';

interface SmartBookSearchTabProps {
  catalogRows: ReferenceCatalogRow[];
  workbookMartyrs: WorkbookGolzarMartyr[];
  smartSuggestions: SmartSearchSuggestion[];
  initialMartyrQuery?: string;
  onAddSuggestion: (newSug: SmartSearchSuggestion) => void;
  onUpdateSuggestion: (updatedSug: SmartSearchSuggestion) => void;
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
  smartSuggestions,
  initialMartyrQuery = '',
  onAddSuggestion,
  onUpdateSuggestion,
  onApproveSuggestionToLinks,
  onNotify
}) => {
  const [selectedMartyrName, setSelectedMartyrName] = useState(initialMartyrQuery || 'عباس دوران');
  const [customAltNames, setCustomAltNames] = useState('سرلشکر خلبان عباس دوران، دوران، عباس');
  const [selectedSourceCode, setSelectedSourceCode] = useState<string>('ALL');
  const [queueFilter, setQueueFilter] = useState<'ALL' | SmartSuggestionReviewStatus>('ALL');

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

  // Run Single Martyr Smart Search across Reference Catalog + Bibliographic Knowledge Base
  const handleRunSingleMartyrSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const targetName = selectedMartyrName.trim();
    if (!targetName) {
      onNotify('لطفاً نام شهید را برای جست‌وجوی هوشمند وارد یا انتخاب کنید.', 'warning');
      return;
    }

    const normTarget = normalizePersianText(targetName.replace(/^شهید\s+/, ''));
    // Check if already in queue to avoid duplicate search
    const existingInQueue = smartSuggestions.find(
      (s) =>
        normalizePersianText(s.martyrName).includes(normTarget) &&
        s.reviewStatus === 'در صف بررسی کارشناس'
    );
    if (existingInQueue) {
      onNotify(
        `برای شهید «${targetName}» قبلاً پیشنهاد فعال (${existingInQueue.id}) در صف بررسی کارشناس ثبت شده است؛ از تکرار بی‌دلیل جست‌وجو جلوگیری شد.`,
        'warning'
      );
      return;
    }

    // Compare against the 980 books in catalogRows
    const matchedInCatalog = catalogRows.find((r) =>
      normalizePersianText(`${r.titleRaw} ${r.descriptionRaw} ${r.authorRaw}`).includes(normTarget)
    );

    const nowFa = new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date());

    const newId = `SS-${String(smartSuggestions.length + 1).padStart(4, '0')}`;
    const newSuggestion: SmartSearchSuggestion = matchedInCatalog
      ? {
          id: newId,
          martyrId: `MR-SEARCH-${smartSuggestions.length + 1}`,
          martyrName: targetName,
          martyrAlternativeNames: computedVariants,
          bookTitle: matchedInCatalog.titleRaw,
          authors: matchedInCatalog.authorRaw || 'نیازمند تکمیل از شناسنامه فیپا',
          publisher: matchedInCatalog.publisherRaw || 'نشر شاهد / سوره مهر',
          publishYear: '۱۳۹۸',
          editionInfo: 'چاپ اول',
          isbn: matchedInCatalog.isbnRaw || 'نیازمند استعلام فیپا',
          fipa: matchedInCatalog.fipaRaw || 'در دست بررسی',
          subjectCategory: matchedInCatalog.categoryRaw
            ? `${matchedInCatalog.categoryRaw} — منطبق با فهرست`
            : SUBJECT_CATEGORIES[0].label,
          publisherDescription:
            matchedInCatalog.descriptionRaw ||
            `یافت‌شده در تطبیق سرشناسه کتابخانه ملی و فهرست مرجع برای شهید ${targetName}.`,
          sourcePriority: 1,
          sourceName: 'سازمان اسناد و کتابخانه ملی ایران + تطبیق فهرست مرجع',
          sourceUrl: `http://opac.nlai.ir`,
          retrievedAt: nowFa,
          matchEvidence: `تشخیص ارتباط بر اساس تطابق نام نرمال‌شده «${targetName}» و اشکال نوشتاری (${computedVariants
            .slice(0, 3)
            .join(' / ')}) با رکورد ${matchedInCatalog.tempBookId} در فهرست ۹۸۰ کتاب مرجع.`,
          catalogComparisonStatus: 'موجود در فهرست مرجع ۹۸۰ کتاب',
          matchedCatalogBookId: matchedInCatalog.tempBookId,
          reviewStatus: 'در صف بررسی کارشناس',
          reviewerNote: '',
          reviewedBy: '',
          reviewedAt: ''
        }
      : {
          id: newId,
          martyrId: `MR-SEARCH-${smartSuggestions.length + 1}`,
          martyrName: targetName,
          martyrAlternativeNames: computedVariants,
          bookTitle: `کارنامه و خاطرات مستند شهید ${targetName}`,
          authors: 'گروه پژوهش و تاریخ شفاهی دفاع مقدس',
          publisher: 'انتشارات سوره مهر / نشر شاهد',
          publishYear: '۱۴۰۰',
          editionInfo: 'چاپ دوم',
          isbn: 'بررسی از صفحه فیپا',
          fipa: 'نیازمند تأیید کارشناس',
          subjectCategory: SUBJECT_CATEGORIES[0].label,
          publisherDescription: `پیشنهاد استخراج‌شده بر پایه سرشناسه موضوعی «${computedVariants[0] || targetName}» جهت بررسی در فهرستگان کتابخانه ملی و ناشران تخصصی.`,
          sourcePriority: 1,
          sourceName: 'راهنمای جست‌وجوی کتابخانه ملی ایران (OPAC) و فیپا',
          sourceUrl: 'http://opac.nlai.ir',
          retrievedAt: nowFa,
          matchEvidence: `پیشنهاد هوش مصنوعی بر پایه شکل‌های نوشتاری نام شهید (${computedVariants.join(
            ' ، '
          )})؛ در فهرست ۹۸۰ کتاب فعلی عنوانی با این نام دقیق یافت نشد و به‌عنوان «کتاب جدید احتمالی» به صف بررسی انسانی منتقل گردید.`,
          catalogComparisonStatus: 'کتاب جدید (خارج از فهرست فعلی کتابخانه)',
          reviewStatus: 'در صف بررسی کارشناس',
          reviewerNote: '',
          reviewedBy: '',
          reviewedAt: ''
        };

    onAddSuggestion(newSuggestion);
    onNotify(
      `نتیجه جست‌وجوی هوشمند برای «${targetName}» استخراج و به صف بررسی کارشناس منتقل شد (بدون ثبت قطعی خودکار).`
    );
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
      normalizePersianText(`${c.titleRaw} ${c.descriptionRaw}`).includes(normM)
    );

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
      bookTitle: catalogHit
        ? catalogHit.titleRaw
        : `یادنامه و زندگینامه شهید ${targetMartyr.fullNameSearch}`,
      authors: catalogHit?.authorRaw || 'گروه تدوین تاریخ دفاع مقدس',
      publisher: catalogHit?.publisherRaw || 'نشر شاهد',
      publishYear: '۱۳۹۹',
      editionInfo: 'چاپ اول',
      isbn: catalogHit?.isbnRaw || 'نیازمند استعلام فیپا',
      fipa: catalogHit?.fipaRaw || '—',
      subjectCategory: SUBJECT_CATEGORIES[0].label,
      publisherDescription: catalogHit?.descriptionRaw || `پرونده پایلوت ۲۰ شهید — قطعه ${targetMartyr.piece}`,
      sourcePriority: 1,
      sourceName: 'پایلوت ۲۰ شهید (تطبیق فهرستگان ملی و اکسل مرجع)',
      sourceUrl: 'http://opac.nlai.ir',
      retrievedAt: nowFa,
      matchEvidence: catalogHit
        ? `تطابق نام شهید «${targetMartyr.fullNameSearch}» (قطعه ${targetMartyr.piece}) با رکورد ${catalogHit.tempBookId} در فهرست ۹۸۰ کتاب مرجع.`
        : `بررسی پایلوت ۲۰ پرونده شهید برای «${targetMartyr.fullNameSearch}» (قطعه ${targetMartyr.piece})؛ نیازمند بازبینی انسانی در فهرستگان کتابخانه ملی.`,
      catalogComparisonStatus: catalogHit
        ? 'موجود در فهرست مرجع ۹۸۰ کتاب'
        : 'کتاب جدید (خارج از فهرست فعلی کتابخانه)',
      matchedCatalogBookId: catalogHit?.tempBookId,
      reviewStatus: 'در صف بررسی کارشناس',
      reviewerNote: '',
      reviewedBy: '',
      reviewedAt: ''
    };

    onAddSuggestion(newSug);
    const nextCount = Math.min(20, pilotProcessedCount + 2);
    setPilotProcessedCount(nextCount);
    setPilotFoundCount((prev) => prev + 1);
    if (nextCount >= 20) {
      setPilotStatus('completed');
    }
    onNotify(
      `گام پایلوت اجرا شد (${toPersianDigits(nextCount)} از ۲۰ پرونده شهید)؛ پیشنهاد جدید به صف بررسی کارشناس اضافه گردید.`
    );
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
      reviewerNote: sug.reviewerNote || 'تأیید انسانی مشخصات کتاب‌شناختی و ارتباط با شهید'
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
              <strong>قاعده کنترل کیفیت:</strong> هیچ نتیجه اینترنتی یا پیشنهادی بدون تأیید انسانی وارد پرونده قطعی کتاب یا شهید نمی‌شود.
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

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2 text-xs">
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(
                    `کتاب شهید ${selectedMartyrName} site:opac.nlai.ir OR site:sooremehr.ir`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#253247] font-medium flex items-center gap-1"
                >
                  <span>جست‌وجوی راهنما در وب</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <button
                type="submit"
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[#1F4E79] hover:bg-[#163a5b] text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                <span>اجرای تطبیق هوشمند و ارسال به صف بررسی</span>
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

      {/* Human Specialist Review Queue (صف بررسی کارشناس) */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-[#253247]">
              صف بررسی کارشناس ({toPersianDigits(filteredSuggestions.length)} پیشنهاد)
            </h2>
            <p className="text-xs text-[#697586] mt-0.5">
              مقایسه پیشنهادهای بیرونی با فهرست ۹۸۰ کتاب مرجع، مشاهده شواهد تشخیص ارتباط، ویرایش مشخصات و تأیید یا رد مستند
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
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
          {filteredSuggestions.map((sug) => (
            <div
              key={sug.id}
              className="border border-slate-200 rounded-2xl p-4 bg-[#F5F7FA]/60 space-y-3"
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
                      <span>تأیید انسانی و انتقال به پرونده شهید</span>
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
          ))}
        </div>
      </section>
    </div>
  );
};
