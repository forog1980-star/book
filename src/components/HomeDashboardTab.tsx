import React, { useState, useMemo } from 'react';
import {
  Search,
  Mic,
  PlusCircle,
  BookOpen,
  Users,
  Sparkles,
  FileSearch,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Layers,
  FileSpreadsheet,
  Trash2,
  ShieldCheck,
  MapPin,
  FileText,
  History
} from 'lucide-react';
import { ModalWindow } from './ModalWindow';
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
import {
  buildUnifiedBookDossiers,
  compactPersianForMatch,
  MartyrRelationCertainty,
  UnifiedBookDossier
} from '../data/soorehMehrResearch';
import { parsePersianVoiceBookCommand } from '../utils/voiceCommandParser';
import { generateUniqueCopyId, generateUniqueOutsideBookId } from '../utils/idGenerator';
import { requestActionConfirmation } from '../utils/confirmDialogService';

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
  onDownloadUnifiedExcel?: () => void;
  onDownloadFullJsonBackup?: () => void;
  onNotify: (message: string, type?: 'success' | 'warning') => void;
}

type StatGroupModalType = 'all_books' | 'new_books' | 'determined_books' | 'martyr_books' | null;

type GroupSubFilter =
  | 'all'
  | 'single_martyr'
  | 'multi_martyr'
  | 'definite'
  | 'probable'
  | 'needs_review';

const SAMPLE_VOICE_COMMAND =
  'عنوان کتاب: دلیل. نویسنده: نام نویسنده. ناشر: انتشارات بیست و هفت. سال چاپ: ۱۳۹۸. نوبت چاپ: سوم. گروه: روایت و خاطرات. محل: قفسه یک، طبقه سه.';

export const HomeDashboardTab: React.FC<HomeDashboardTabProps> = ({
  catalogRows,
  auditRecords,
  bookCopies,
  links,
  workbookMartyrs,
  customMartyrs = [],
  extractedItems,
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
  const [lastSavedNotice, setLastSavedNotice] = useState<{
    title: string;
    tempBookId: string;
    copyId: string;
    location: string;
  } | null>(null);

  // وضعیت پنجره فهرست کارت‌های آماری و پرونده اختصاصی هر کتاب
  const [activeStatGroupModal, setActiveStatGroupModal] = useState<StatGroupModalType>(null);
  const [statModalSearchQuery, setStatModalSearchQuery] = useState('');
  const [statModalSubFilter, setStatModalSubFilter] = useState<GroupSubFilter>('all');
  const [selectedBookDossierId, setSelectedBookDossierId] = useState<string | null>(null);
  const [showOriginalExcelModal, setShowOriginalExcelModal] = useState(false);

  // Voice Input State
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
  const [previewNotes] = useState('');

  // Quick Manual Registration Modal State
  const [quickTitle, setQuickTitle] = useState('');
  const [quickAuthor, setQuickAuthor] = useState('');
  const [quickPublisher, setQuickPublisher] = useState('');
  const [quickYear, setQuickYear] = useState('');
  const [quickCategory, setQuickCategory] = useState(SUBJECT_CATEGORIES[0].label);
  const [quickShelf, setQuickShelf] = useState<ShelfCode>('SH-01');
  const [quickLevel, setQuickLevel] = useState<LevelCode>('T01');

  // ساخت مجموعه یکتای پرونده کتاب‌ها (۱۹۸ عنوان پایه از شیت‌های «کتاب‌های مرتبط با یک شهید» و «کتاب‌های مرتبط با چند شهید» + به‌روزرسانی خودکار با اضافه‌شدن کتاب‌ها)
  const allDossiers = useMemo(() => {
    return buildUnifiedBookDossiers({
      catalogRows,
      auditRecords,
      bookCopies,
      links,
      extractedItems
    });
  }, [catalogRows, auditRecords, bookCopies, links, extractedItems]);

  const newRegisteredDossiers = useMemo(
    () => allDossiers.filter((d) => d.isNewRegistration),
    [allDossiers]
  );

  const determinedDossiers = useMemo(
    () => allDossiers.filter((d) => d.isDetermined),
    [allDossiers]
  );

  const martyrLinkedDossiers = useMemo(
    () => allDossiers.filter((d) => d.martyrRelations.length > 0),
    [allDossiers]
  );

  const singleMartyrDossiersCount = useMemo(
    () => allDossiers.filter((d) => d.sheetCategory === 'کتاب‌های مرتبط با یک شهید').length,
    [allDossiers]
  );

  const multiMartyrDossiersCount = useMemo(
    () => allDossiers.filter((d) => d.sheetCategory === 'کتاب‌های مرتبط با چند شهید').length,
    [allDossiers]
  );

  const selectedBookDossier = useMemo(() => {
    if (!selectedBookDossierId) return null;
    return (
      allDossiers.find(
        (d) =>
          d.dossierId === selectedBookDossierId ||
          d.bookId === selectedBookDossierId ||
          d.rowKey === selectedBookDossierId
      ) || null
    );
  }, [allDossiers, selectedBookDossierId]);

  const openBookDossierByTitleOrId = (bookIdOrTitle: string) => {
    const cleanCompact = compactPersianForMatch(bookIdOrTitle);
    const found =
      allDossiers.find(
        (d) =>
          d.dossierId === bookIdOrTitle ||
          d.bookId === bookIdOrTitle ||
          d.rowKey === bookIdOrTitle ||
          compactPersianForMatch(d.title) === cleanCompact
      ) ||
      allDossiers.find((d) => compactPersianForMatch(d.title).includes(cleanCompact));

    if (found) {
      setSelectedBookDossierId(found.dossierId);
      setShowOriginalExcelModal(false);
      return;
    }

    // اگر کتاب از کاتالوگ ۹۸۰تایی بود که هنوز در ۱۹۸ عنوان پژوهشی نبود، یک پرونده موقت از روی کاتالوگ باز شود یا به کتابخانه برود
    if (onOpenBookInLibrary) {
      onOpenBookInLibrary(bookIdOrTitle);
    } else {
      onNavigateTab('library');
    }
  };

  const openStatCardModal = (groupType: Exclude<StatGroupModalType, null>) => {
    setStatModalSearchQuery('');
    setStatModalSubFilter('all');
    setActiveStatGroupModal(groupType);
  };

  const filteredStatModalDossiers = useMemo(() => {
    let baseList: UnifiedBookDossier[] = [];
    if (activeStatGroupModal === 'all_books') {
      baseList = allDossiers;
    } else if (activeStatGroupModal === 'new_books') {
      baseList = newRegisteredDossiers;
    } else if (activeStatGroupModal === 'determined_books') {
      baseList = determinedDossiers;
    } else if (activeStatGroupModal === 'martyr_books') {
      baseList = martyrLinkedDossiers;
    }

    if (statModalSubFilter === 'single_martyr') {
      baseList = baseList.filter((d) => d.sheetCategory === 'کتاب‌های مرتبط با یک شهید');
    } else if (statModalSubFilter === 'multi_martyr') {
      baseList = baseList.filter((d) => d.sheetCategory === 'کتاب‌های مرتبط با چند شهید');
    } else if (statModalSubFilter === 'definite') {
      baseList = baseList.filter((d) => d.martyrRelations.some((m) => m.certainty === 'قطعی'));
    } else if (statModalSubFilter === 'probable') {
      baseList = baseList.filter((d) => d.martyrRelations.some((m) => m.certainty === 'احتمالی'));
    } else if (statModalSubFilter === 'needs_review') {
      baseList = baseList.filter((d) =>
        d.martyrRelations.some((m) => m.certainty === 'نیازمند بررسی')
      );
    }

    const q = normalizePersianText(statModalSearchQuery);
    if (!q) return baseList;

    return baseList.filter((d) => {
      const martyrNames = d.martyrRelations.map((m) => m.martyrName).join(' ');
      const hay = normalizePersianText(
        `${d.bookId} ${d.title} ${d.alternativeTitle} ${d.author} ${d.publisher} ${d.locationCode} ${d.sheetCategory} ${martyrNames}`
      );
      return q.split(' ').every((w) => hay.includes(w));
    });
  }, [
    activeStatGroupModal,
    allDossiers,
    newRegisteredDossiers,
    determinedDossiers,
    martyrLinkedDossiers,
    statModalSubFilter,
    statModalSearchQuery
  ]);

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
    const loc = `${previewShelf}-${previewLevel}`;

    requestActionConfirmation({
      variant: 'confirm',
      title: 'پرسش دوم: تأیید نهایی ثبت صوتی کتاب',
      message: `آیا از ثبت نهایی کتاب «${previewTitle.trim()}» در محل ${loc} اطمینان دارید؟`,
      details: [
        `عنوان کتاب: ${previewTitle.trim()}`,
        `نویسنده: ${previewAuthor.trim() || 'ثبت‌نشده'} · ناشر: ${previewPublisher.trim() || 'ثبت‌نشده'}`,
        `دسته موضوعی: ${previewCategory}`,
        `جانمایی قفسه و طبقه: ${loc}`
      ],
      confirmLabel: 'بله، ثبت نهایی شود',
      onConfirm: () => {
        const nowIso = new Date().toISOString();
        const nowFa = new Intl.DateTimeFormat('fa-IR').format(new Date());
        const existingIds = Object.values(auditRecords).map((r) => r.tempBookId);
        const tempBookId = generateUniqueOutsideBookId(existingIds);
        const { copyId } = generateUniqueCopyId(bookCopies, tempBookId);

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
          notes:
            previewNotes.trim() ||
            `ثبت‌شده با فرمان صوتی کنار قفسه (${loc}) — در انتظار تأیید کارشناس`,
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
          expertNote: `ثبت صوتی کنار قفسه — نوبت چاپ: ${previewEdition || 'ثبت‌نشده'}`,
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
        onNotify(`✅ کتاب «${newRec.title}» با کد ${tempBookId} در محل ${loc} ثبت شد.`);
      }
    });
  };

  const handleConfirmQuickBookSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) {
      onNotify('لطفاً عنوان کتاب را وارد کنید.', 'warning');
      return;
    }
    const loc = `${quickShelf}-${quickLevel}`;

    requestActionConfirmation({
      variant: 'confirm',
      title: 'پرسش دوم: تأیید نهایی ثبت سریع کتاب',
      message: `آیا از ثبت نهایی کتاب «${quickTitle.trim()}» در محل ${loc} اطمینان دارید؟`,
      details: [
        `عنوان کتاب: ${quickTitle.trim()}`,
        `نویسنده: ${quickAuthor.trim() || 'ثبت‌نشده'} · ناشر: ${quickPublisher.trim() || 'ثبت‌نشده'}`,
        `دسته موضوعی: ${quickCategory}`,
        `جانمایی قفسه و طبقه: ${loc}`
      ],
      confirmLabel: 'بله، ثبت نهایی شود',
      onConfirm: () => {
        const nowIso = new Date().toISOString();
        const nowFa = new Intl.DateTimeFormat('fa-IR').format(new Date());
        const existingIds = Object.values(auditRecords).map((r) => r.tempBookId);
        const tempBookId = generateUniqueOutsideBookId(existingIds);
        const { copyId } = generateUniqueCopyId(bookCopies, tempBookId);

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
          notes: 'ثبت سریع از صفحه اصلی (در انتظار تأیید کارشناس)',
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
          expertNote: 'ثبت سریع از صفحه اصلی',
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
        onNotify(`✅ کتاب «${newRec.title}» با شناسه ${tempBookId} در ${loc} ثبت شد.`);
      }
    });
  };

  // جست‌وجوی سریع بر اساس عنوان کتاب یا نام شهید با دسترسی مستقیم به پرونده اختصاصی کتاب
  const searchResults = useMemo(() => {
    const q = normalizePersianText(globalQuery);
    if (!q || q.length < 2) return null;

    const matchedDossiers = allDossiers
      .filter((d) => {
        const martyrNames = d.martyrRelations.map((m) => m.martyrName).join(' ');
        const hay = normalizePersianText(
          `${d.bookId} ${d.title} ${d.alternativeTitle} ${d.author} ${d.publisher} ${d.locationCode} ${martyrNames}`
        );
        return q.split(' ').every((w) => hay.includes(w));
      })
      .slice(0, 12);

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
      .filter(
        (l) =>
          l.martyrNameRaw &&
          l.martyrNameRaw !== '*' &&
          normalizePersianText(`${l.martyrNameRaw} ${l.bookTitleRaw} ${l.pageReferenceRaw}`).includes(q)
      )
      .slice(0, 8);

    return { matchedDossiers, matchedMartyrs, matchedLinks };
  }, [globalQuery, allDossiers, customMartyrs, workbookMartyrs, links]);

  const renderCertaintyBadge = (certainty: MartyrRelationCertainty) => {
    if (certainty === 'قطعی') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          <span>ارتباط قطعی</span>
        </span>
      );
    }
    if (certainty === 'احتمالی') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 text-[11px] font-bold">
          <span>ارتباط احتمالی</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold">
        <AlertTriangle className="w-3 h-3 text-amber-600" />
        <span>نیازمند بررسی</span>
      </span>
    );
  };

  const getStatModalTitle = (type: StatGroupModalType): string => {
    if (type === 'all_books') {
      return `فهرست همه کتاب‌ها (${toPersianDigits(allDossiers.length)} عنوان)`;
    }
    if (type === 'new_books') {
      return `فهرست کتاب‌های تازه ثبت‌شده (${toPersianDigits(newRegisteredDossiers.length)} عنوان)`;
    }
    if (type === 'determined_books') {
      return `فهرست کتاب‌های تعیین‌تکلیف‌شده (${toPersianDigits(determinedDossiers.length)} عنوان)`;
    }
    if (type === 'martyr_books') {
      return `فهرست کتاب‌های مرتبط با شهدا (${toPersianDigits(martyrLinkedDossiers.length)} عنوان)`;
    }
    return 'فهرست کتاب‌ها';
  };

  return (
    <div className="space-y-5">
      {/* ۱. کادر اصلی کتابخانه: جست‌وجو و ثبت سریع / صوتی */}
      <section className="bg-white border border-[#E2D2BE] rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="font-titr text-lg sm:text-xl font-bold text-[#332218]">کتابخانه</h2>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowQuickBookModal(true)}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#6B3E26] hover:bg-[#56311E] text-white text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>ثبت سریع کتاب</span>
            </button>

            <button
              type="button"
              onClick={openVoiceRegistrationModal}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#FAF5EE] hover:bg-[#F3E9DC] text-[#332218] border border-[#D8C7B2] text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Mic className="w-4 h-4 text-[#6B3E26]" />
              <span>ثبت صوتی کنار قفسه</span>
            </button>
          </div>
        </div>

        {/* پیام تأیید فوری پس از ثبت سریع یا صوتی کتاب */}
        {lastSavedNotice && (
          <div className="bg-[#EDF6F0] border border-[#A8D5B5] rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#1E4D2B]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#2E6F40] shrink-0" />
              <span className="font-bold">
                کتاب «{lastSavedNotice.title}» ({lastSavedNotice.tempBookId}) در محل{' '}
                {lastSavedNotice.location} ثبت شد.
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => openBookDossierByTitleOrId(lastSavedNotice.tempBookId)}
                className="px-2.5 py-1 rounded-lg bg-[#2E6F40] text-white font-bold text-xs cursor-pointer"
              >
                مشاهده پرونده کتاب
              </button>
              <button
                type="button"
                onClick={() => setLastSavedNotice(null)}
                className="px-2 py-1 rounded-lg bg-white border border-[#A8D5B5] text-[#1E4D2B] text-xs cursor-pointer"
              >
                بستن
              </button>
            </div>
          </div>
        )}

        {/* کادر جست‌وجوی کتاب بر اساس عنوان و جست‌وجوی شهید بر اساس نام */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!globalQuery.trim()) {
              onNotify('عنوان کتاب یا نام شهید را وارد نمایید.', 'warning');
              return;
            }
          }}
          className="relative"
        >
          <Search className="w-5 h-5 text-[#6E5846] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={globalQuery}
            onChange={(e) => setGlobalQuery(e.target.value)}
            placeholder="جست‌وجوی کتاب بر اساس عنوان یا جست‌وجوی شهید بر اساس نام..."
            className="w-full min-h-[46px] pr-11 pl-24 py-2 text-xs sm:text-sm bg-[#FAF5EE] border border-[#D8C7B2] rounded-xl focus:outline-none focus:border-[#6B3E26] focus:bg-white text-[#332218]"
          />
          <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
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
              جست‌وجو
            </button>
          </div>
        </form>

        {/* نتایج جست‌وجوی فوری با دسترسی مستقیم به پرونده کامل کتاب */}
        {searchResults && (
          <div className="bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#5C4636]">
              <span>
                نتایج برای «<strong className="text-[#332218]">{globalQuery}</strong>»:
              </span>
              <span className="font-mono font-bold text-[#6B3E26]">
                {toPersianDigits(searchResults.matchedDossiers.length)} کتاب ·{' '}
                {toPersianDigits(searchResults.matchedLinks.length)} ارتباط شهید
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* کتاب‌های منطبق */}
              <div className="bg-white border border-[#E2D2BE] rounded-xl p-3 space-y-2">
                <div className="text-xs font-bold text-[#6B3E26]">
                  کتاب‌های یافت‌شده ({toPersianDigits(searchResults.matchedDossiers.length)})
                </div>
                {searchResults.matchedDossiers.length === 0 ? (
                  <p className="text-xs text-[#6E5846] py-1">کتابی با این عنوان یافت نشد.</p>
                ) : (
                  <div className="divide-y divide-[#EFE5D8]">
                    {searchResults.matchedDossiers.map((d) => (
                      <div
                        key={d.dossierId}
                        className="py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-[#332218] truncate">{d.title}</div>
                          <div className="text-[11px] text-[#6E5846] truncate">
                            {d.publisher} · {toPersianDigits(d.martyrRelations.length)} شهید مرتبط
                            {d.locationCode ? ` · ${d.locationCode}` : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedBookDossierId(d.dossierId);
                            setShowOriginalExcelModal(false);
                          }}
                          className="px-2.5 py-1 text-[11px] bg-[#6B3E26] hover:bg-[#56311E] text-white font-bold rounded-lg shrink-0 cursor-pointer"
                        >
                          پرونده کتاب
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* شهدا و کتاب‌های مرتبط با آن‌ها */}
              <div className="bg-white border border-[#E2D2BE] rounded-xl p-3 space-y-2">
                <div className="text-xs font-bold text-[#6B3E26]">
                  شهدا و کتاب‌های مرتبط ({toPersianDigits(searchResults.matchedLinks.length)})
                </div>
                {searchResults.matchedLinks.length === 0 &&
                searchResults.matchedMartyrs.length === 0 ? (
                  <p className="text-xs text-[#6E5846] py-1">شهیدی با این نام یافت نشد.</p>
                ) : (
                  <div className="divide-y divide-[#EFE5D8]">
                    {searchResults.matchedLinks.map((l) => (
                      <div
                        key={l.id}
                        className="py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-[#332218] truncate">{l.martyrNameRaw}</div>
                          <div className="text-[11px] text-[#6E5846] truncate">
                            کتاب «{l.bookTitleRaw}»{' '}
                            {l.pageReferenceRaw ? `(ص ${l.pageReferenceRaw})` : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => openBookDossierByTitleOrId(l.tempBookId || l.bookTitleRaw)}
                          className="px-2.5 py-1 text-[11px] bg-[#FAF5EE] hover:bg-[#F3E9DC] text-[#6B3E26] border border-[#D8C7B2] font-bold rounded-lg shrink-0 cursor-pointer"
                        >
                          پرونده کتاب
                        </button>
                      </div>
                    ))}
                    {searchResults.matchedMartyrs.slice(0, 3).map((m) => (
                      <div
                        key={m.tempPersonId}
                        className="py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-[#332218]">{m.fullNameSearch}</span>
                          <span className="text-[#6E5846] mr-1.5 text-[11px]">
                            (قطعه {m.piece || '—'})
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
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ۲. کارت‌های آماری مستقل و قابل کلیک */}
      <section aria-label="آمار کتابخانه" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* کارت ۱: مجموعه کتاب‌ها */}
        <button
          type="button"
          onClick={() => openStatCardModal('all_books')}
          className="bg-white hover:bg-[#FAF5EE] border-2 border-[#D8C7B2] rounded-2xl p-4 text-right transition-all shadow-2xs flex flex-col justify-between gap-2 cursor-pointer group"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs sm:text-sm font-bold text-[#5C4636]">مجموعه کتاب‌ها</span>
            <span className="w-9 h-9 rounded-xl bg-[#FAF5EE] border border-[#E2D2BE] flex items-center justify-center text-[#6B3E26]">
              <BookOpen className="w-5 h-5" />
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2 pt-1">
            <span className="text-2xl sm:text-3xl font-bold text-[#332218] font-mono tabular-nums">
              {toPersianDigits(allDossiers.length)}
            </span>
            <span className="text-xs font-bold text-[#6B3E26] group-hover:underline inline-flex items-center gap-1">
              <span>مشاهده فهرست</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-[11px] text-[#6E5846] border-t border-[#EFE5D8] pt-2">
            یک شهید: {toPersianDigits(singleMartyrDossiersCount)} · چند شهید:{' '}
            {toPersianDigits(multiMartyrDossiersCount)} عنوان
          </div>
        </button>

        {/* کارت ۲: ثبت‌های جدید */}
        <button
          type="button"
          onClick={() => openStatCardModal('new_books')}
          className="bg-white hover:bg-[#FAF5EE] border-2 border-[#D8C7B2] rounded-2xl p-4 text-right transition-all shadow-2xs flex flex-col justify-between gap-2 cursor-pointer group"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs sm:text-sm font-bold text-[#5C4636]">ثبت‌های جدید</span>
            <span className="w-9 h-9 rounded-xl bg-[#FAF5EE] border border-[#E2D2BE] flex items-center justify-center text-[#8C3B2B]">
              <PlusCircle className="w-5 h-5" />
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2 pt-1">
            <span className="text-2xl sm:text-3xl font-bold text-[#8C3B2B] font-mono tabular-nums">
              {toPersianDigits(newRegisteredDossiers.length)}
            </span>
            <span className="text-xs font-bold text-[#8C3B2B] group-hover:underline inline-flex items-center gap-1">
              <span>مشاهده فهرست</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-[11px] text-[#6E5846] border-t border-[#EFE5D8] pt-2">
            کتاب‌های تازه ثبت‌شده در دستگاه
          </div>
        </button>

        {/* کارت ۳: تعیین‌تکلیف‌شده */}
        <button
          type="button"
          onClick={() => openStatCardModal('determined_books')}
          className="bg-white hover:bg-[#FAF5EE] border-2 border-[#D8C7B2] rounded-2xl p-4 text-right transition-all shadow-2xs flex flex-col justify-between gap-2 cursor-pointer group"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs sm:text-sm font-bold text-[#5C4636]">تعیین‌تکلیف‌شده</span>
            <span className="w-9 h-9 rounded-xl bg-[#EDF6F0] border border-[#A8D5B5] flex items-center justify-center text-[#2E6F40]">
              <CheckCircle2 className="w-5 h-5" />
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2 pt-1">
            <span className="text-2xl sm:text-3xl font-bold text-[#2E6F40] font-mono tabular-nums">
              {toPersianDigits(determinedDossiers.length)}
            </span>
            <span className="text-xs font-bold text-[#2E6F40] group-hover:underline inline-flex items-center gap-1">
              <span>مشاهده فهرست</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-[11px] text-[#6E5846] border-t border-[#EFE5D8] pt-2">
            کتاب‌های دارای وضعیت و جانمایی مشخص در قفسه
          </div>
        </button>
      </section>

      {/* ۳. پنج ورودی مستقل اصلی سامانه */}
      <section aria-label="پنج ورودی مستقل" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
        <button
          type="button"
          onClick={() => onNavigateTab('library')}
          className="bg-white hover:bg-[#FAF5EE] border border-[#D8C7B2] rounded-xl p-3.5 text-right flex items-center justify-between gap-3 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-[#FAF5EE] border border-[#E2D2BE] flex items-center justify-center text-[#6B3E26] shrink-0">
              <BookOpen className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#332218] truncate">کتابخانه و قفسه‌ها</div>
              <div className="text-[11px] text-[#6E5846] truncate">ثبت قفسه و برچسب</div>
            </div>
          </div>
          <ArrowLeft className="w-4 h-4 text-[#6B3E26] shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('martyrs')}
          className="bg-white hover:bg-[#FAF5EE] border border-[#D8C7B2] rounded-xl p-3.5 text-right flex items-center justify-between gap-3 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-[#FAF5EE] border border-[#E2D2BE] flex items-center justify-center text-[#6B3E26] shrink-0">
              <Users className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#332218] truncate">پرونده شهدا</div>
              <div className="text-[11px] text-[#6E5846] truncate">بانک جامع مزارات</div>
            </div>
          </div>
          <ArrowLeft className="w-4 h-4 text-[#6B3E26] shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('smart_search')}
          className="bg-white hover:bg-[#FAF5EE] border border-[#D8C7B2] rounded-xl p-3.5 text-right flex items-center justify-between gap-3 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-[#FAF5EE] border border-[#E2D2BE] flex items-center justify-center text-[#6B3E26] shrink-0">
              <Sparkles className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#332218] truncate">جست‌وجوی هوشمند</div>
              <div className="text-[11px] text-[#6E5846] truncate">کشف ارتباط کتاب و شهید</div>
            </div>
          </div>
          <ArrowLeft className="w-4 h-4 text-[#6B3E26] shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('research')}
          className="bg-white hover:bg-[#FAF5EE] border border-[#D8C7B2] rounded-xl p-3.5 text-right flex items-center justify-between gap-3 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-[#FAF5EE] border border-[#E2D2BE] flex items-center justify-center text-[#6B3E26] shrink-0">
              <FileSearch className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#332218] truncate">میز پژوهش و اسناد</div>
              <div className="text-[11px] text-[#6E5846] truncate">بررسی ارتباط‌ها و صفحات</div>
            </div>
          </div>
          <ArrowLeft className="w-4 h-4 text-[#6B3E26] shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('management')}
          className="bg-white hover:bg-[#FAF5EE] border border-[#D8C7B2] rounded-xl p-3.5 text-right flex items-center justify-between gap-3 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-[#FAF5EE] border border-[#E2D2BE] flex items-center justify-center text-[#6B3E26] shrink-0">
              <Layers className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#332218] truncate">پشتیبان و گزارش‌ها</div>
              <div className="text-[11px] text-[#6E5846] truncate">اکسل، JSON و گزارش‌ها</div>
            </div>
          </div>
          <ArrowLeft className="w-4 h-4 text-[#6B3E26] shrink-0" />
        </button>
      </section>

      {/* پنجره ۱: فهرست کتاب‌های هر گروه آماری پس از کلیک روی کارت آماری */}
      {activeStatGroupModal && (
        <ModalWindow
          onClose={() => setActiveStatGroupModal(null)}
          title={getStatModalTitle(activeStatGroupModal)}
          maxWidthClass="max-w-4xl"
        >
          <div className="space-y-3">
            {/* نوار جست‌وجو و فیلتر درون فهرست */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#6E5846] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={statModalSearchQuery}
                  onChange={(e) => setStatModalSearchQuery(e.target.value)}
                  placeholder="جست‌وجوی عنوان کتاب، نام شهید، نویسنده، ناشر یا کد قفسه..."
                  className="w-full min-h-[40px] pr-9 pl-3 py-1.5 text-xs bg-[#FAF5EE] border border-[#D8C7B2] rounded-xl focus:outline-none focus:border-[#6B3E26] focus:bg-white text-[#332218]"
                />
              </div>
              {statModalSearchQuery && (
                <button
                  type="button"
                  onClick={() => setStatModalSearchQuery('')}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 text-xs font-bold text-[#332218] cursor-pointer"
                >
                  پاک‌کردن جست‌وجو
                </button>
              )}
            </div>

            {/* فیلتر شیت پژوهشی و وضعیت ارتباط */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {(
                [
                  { id: 'all', label: 'همه موارد' },
                  { id: 'single_martyr', label: 'کتاب‌های مرتبط با یک شهید' },
                  { id: 'multi_martyr', label: 'کتاب‌های مرتبط با چند شهید' },
                  { id: 'definite', label: 'ارتباط قطعی' },
                  { id: 'probable', label: 'ارتباط احتمالی' },
                  { id: 'needs_review', label: 'نیازمند بررسی' }
                ] as Array<{ id: GroupSubFilter; label: string }>
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatModalSubFilter(f.id)}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                    statModalSubFilter === f.id
                      ? 'bg-[#6B3E26] text-white'
                      : 'bg-[#FAF5EE] text-[#332218] border border-[#D8C7B2] hover:bg-[#F3E9DC]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="text-xs text-[#5C4636] flex items-center justify-between px-1">
              <span>
                تعداد نمایش: <strong>{toPersianDigits(filteredStatModalDossiers.length)}</strong>{' '}
                عنوان کتاب یکتا
              </span>
              <span>برای مشاهده پرونده کامل، روی هر کتاب کلیک کنید</span>
            </div>

            {/* فهرست کتاب‌ها */}
            {filteredStatModalDossiers.length === 0 ? (
              <div className="p-8 text-center bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl text-xs text-[#5C4636] space-y-2">
                <div>کتابی در این بخش یافت نشد.</div>
                {activeStatGroupModal === 'new_books' && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveStatGroupModal(null);
                      setShowQuickBookModal(true);
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-[#6B3E26] text-white font-bold text-xs cursor-pointer"
                  >
                    + ثبت کتاب جدید
                  </button>
                )}
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto border border-[#E2D2BE] rounded-xl divide-y divide-[#EFE5D8] bg-white">
                {filteredStatModalDossiers.map((dossier, idx) => (
                  <div
                    key={dossier.dossierId}
                    onClick={() => {
                      setSelectedBookDossierId(dossier.dossierId);
                      setShowOriginalExcelModal(false);
                    }}
                    className="p-3 hover:bg-[#FAF5EE] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-[#FAF5EE] border border-[#D8C7B2] font-mono text-[11px] text-[#6B3E26]">
                          {toPersianDigits(idx + 1)}
                        </span>
                        <span className="font-bold text-sm text-[#332218]">{dossier.title}</span>
                        {dossier.alternativeTitle && (
                          <span className="text-[11px] text-[#6E5846]">
                            ({dossier.alternativeTitle})
                          </span>
                        )}
                        <span className="font-mono text-[11px] text-[#6E5846]">
                          {dossier.bookId}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#5C4636]">
                        <span>ناشر: {dossier.publisher}</span>
                        {dossier.author !== 'ثبت‌نشده' && <span>· نویسنده: {dossier.author}</span>}
                        {dossier.locationCode && (
                          <span className="font-mono px-1.5 py-0.5 rounded bg-[#EDF6F0] text-[#1E4D2B] border border-[#A8D5B5]">
                            قفسه: {dossier.locationCode}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded bg-[#FAF5EE] border border-[#E2D2BE] text-[#6B3E26] font-bold">
                          {dossier.sheetCategory}
                        </span>
                        {dossier.martyrRelations.length > 0 && (
                          <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-900 font-bold">
                            {toPersianDigits(dossier.martyrRelations.length)} شهید مرتبط
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBookDossierId(dossier.dossierId);
                          setShowOriginalExcelModal(false);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-[#6B3E26] hover:bg-[#56311E] text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>پرونده کتاب</span>
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ModalWindow>
      )}

      {/* پنجره ۲: پرونده اختصاصی هر کتاب (همه مشخصات، وضعیت قفسه، شهدای مرتبط و مستندات + دکمه مشاهده اکسل اولیه) */}
      {selectedBookDossier && (
        <ModalWindow
          onClose={() => {
            setSelectedBookDossierId(null);
            setShowOriginalExcelModal(false);
          }}
          title={`پرونده اختصاصی کتاب: ${selectedBookDossier.title}`}
          maxWidthClass="max-w-3xl"
        >
          <div className="space-y-4 text-xs text-[#332218]">
            {/* بخش ۱ و ۲: عنوان، مشخصات شناسنامه‌ای، نویسنده و ناشر */}
            <div className="bg-[#FAF5EE] border border-[#D8C7B2] rounded-xl p-3.5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#E2D2BE] pb-2.5">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-[#332218]">
                    {selectedBookDossier.title}
                  </h3>
                  {selectedBookDossier.alternativeTitle && (
                    <div className="text-xs text-[#6B3E26] mt-0.5">
                      عنوان دیگر ثبت‌شده در منبع: «{selectedBookDossier.alternativeTitle}»
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="px-2.5 py-1 rounded-lg bg-white border border-[#D8C7B2] font-mono font-bold text-[#6B3E26]">
                    {selectedBookDossier.bookId}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-[#6B3E26] text-white font-bold">
                    {selectedBookDossier.sheetCategory}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                <div className="bg-white border border-[#E2D2BE] rounded-lg p-2.5">
                  <div className="text-[11px] text-[#6E5846]">نویسنده / گردآورنده</div>
                  <div className="font-bold mt-0.5">{selectedBookDossier.author}</div>
                </div>
                <div className="bg-white border border-[#E2D2BE] rounded-lg p-2.5">
                  <div className="text-[11px] text-[#6E5846]">ناشر</div>
                  <div className="font-bold mt-0.5">{selectedBookDossier.publisher}</div>
                </div>
                <div className="bg-white border border-[#E2D2BE] rounded-lg p-2.5">
                  <div className="text-[11px] text-[#6E5846]">دسته موضوعی</div>
                  <div className="font-bold mt-0.5">{selectedBookDossier.category}</div>
                </div>
                <div className="bg-white border border-[#E2D2BE] rounded-lg p-2.5">
                  <div className="text-[11px] text-[#6E5846]">سال و نوبت چاپ</div>
                  <div className="font-bold mt-0.5">
                    {selectedBookDossier.year}
                    {selectedBookDossier.edition !== '—'
                      ? ` · چاپ ${selectedBookDossier.edition}`
                      : ''}
                  </div>
                </div>
                <div className="bg-white border border-[#E2D2BE] rounded-lg p-2.5">
                  <div className="text-[11px] text-[#6E5846]">شابک / فیپا</div>
                  <div className="font-mono font-bold mt-0.5">
                    {[selectedBookDossier.isbn, selectedBookDossier.fipa]
                      .filter((v) => v && v !== '—')
                      .join(' / ') || 'ثبت‌نشده'}
                  </div>
                </div>
                <div className="bg-white border border-[#E2D2BE] rounded-lg p-2.5">
                  <div className="text-[11px] text-[#6E5846]">تعداد نسخه</div>
                  <div className="font-mono font-bold mt-0.5">
                    {toPersianDigits(selectedBookDossier.countedCopies)} جلد
                  </div>
                </div>
              </div>

              {selectedBookDossier.description && selectedBookDossier.description !== '—' && (
                <div className="bg-white border border-[#E2D2BE] rounded-lg p-2.5">
                  <span className="text-[#6E5846] font-bold ml-1">توضیحات ثبت‌شده کتاب:</span>
                  <span>{selectedBookDossier.description}</span>
                </div>
              )}
            </div>

            {/* بخش ۳ و ۴: وضعیت ثبت و تعیین‌تکلیف + محل نگهداری و قفسه */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-white border border-[#D8C7B2] rounded-xl p-3.5 space-y-2">
                <div className="font-bold text-[#6B3E26] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>وضعیت ثبت و تعیین‌تکلیف</span>
                </div>
                <div className="text-xs font-bold text-[#332218]">
                  {selectedBookDossier.determinationStatusLabel}
                </div>
                {selectedBookDossier.notes && (
                  <div className="text-[11px] text-[#5C4636]">
                    یادداشت: {selectedBookDossier.notes}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {selectedBookDossier.isNewRegistration &&
                    selectedBookDossier.physicalStatus !== 'verified' &&
                    onApproveOutsideBook && (
                      <button
                        type="button"
                        onClick={() => onApproveOutsideBook(selectedBookDossier.rowKey)}
                        className="px-2.5 py-1 rounded-lg bg-[#2E6F40] text-white font-bold text-[11px] cursor-pointer"
                      >
                        ✓ تأیید نهایی کارشناس
                      </button>
                    )}
                  {selectedBookDossier.isDetermined && onDeleteAuditRecord && (
                    <button
                      type="button"
                      onClick={() => {
                        const targetKey = selectedBookDossier.rowKey;
                        setSelectedBookDossierId(null);
                        onDeleteAuditRecord(targetKey);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-red-50 text-[#A63A3A] border border-red-200 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف ثبت</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-white border border-[#D8C7B2] rounded-xl p-3.5 space-y-2">
                <div className="font-bold text-[#6B3E26] flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" />
                  <span>محل نگهداری و قفسه</span>
                </div>
                {selectedBookDossier.locationCode ? (
                  <div className="space-y-1">
                    <div className="font-mono text-sm font-bold text-[#1E4D2B] bg-[#EDF6F0] border border-[#A8D5B5] px-2.5 py-1 rounded-lg inline-block">
                      {selectedBookDossier.locationCode}
                    </div>
                    <div className="text-[11px] text-[#5C4636]">
                      قفسه: {selectedBookDossier.shelf || '—'} · طبقه:{' '}
                      {selectedBookDossier.level || '—'}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-[#6E5846]">
                    محل قفسه برای این کتاب هنوز ثبت نشده است.
                  </div>
                )}
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      const titleToOpen = selectedBookDossier.title;
                      setSelectedBookDossierId(null);
                      setActiveStatGroupModal(null);
                      if (onOpenBookInLibrary) {
                        onOpenBookInLibrary(titleToOpen);
                      } else {
                        onNavigateTab('library');
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#FAF5EE] hover:bg-[#F3E9DC] text-[#6B3E26] border border-[#D8C7B2] font-bold text-[11px] cursor-pointer"
                  >
                    ثبت یا ویرایش قفسه در بخش کتابخانه ←
                  </button>
                </div>
              </div>
            </div>

            {/* بخش ۵ و ۶: شهید یا شهدای مرتبط با کتاب + مستندات و دلیل ارتباط */}
            <div className="bg-white border border-[#D8C7B2] rounded-xl p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EFE5D8] pb-2">
                <div className="font-bold text-sm text-[#332218] flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-[#6B3E26]" />
                  <span>
                    شهید یا شهدای مرتبط با این کتاب (
                    {toPersianDigits(selectedBookDossier.martyrRelations.length)} مورد)
                  </span>
                </div>
                <span className="text-[11px] text-[#5C4636]">
                  همه شهدای مرتبط با این کتاب در همین پرونده واحد تجمیع شده‌اند
                </span>
              </div>

              {selectedBookDossier.martyrRelations.length === 0 ? (
                <div className="p-4 text-center bg-[#FAF5EE] rounded-xl text-xs text-[#6E5846]">
                  برای این کتاب هنوز ارتباط شهیدی ثبت نشده است.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-0.5">
                  {selectedBookDossier.martyrRelations.map((rel, idx) => (
                    <div
                      key={`${rel.linkId}-${idx}`}
                      className="bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl p-3 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-white border border-[#D8C7B2] font-mono text-[11px] font-bold text-[#6B3E26] flex items-center justify-center">
                            {toPersianDigits(idx + 1)}
                          </span>
                          <span className="font-bold text-sm text-[#332218]">
                            {rel.martyrName}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {renderCertaintyBadge(rel.certainty)}
                          <span className="px-2 py-0.5 rounded bg-white border border-[#D8C7B2] text-[10.5px] text-[#5C4636]">
                            {rel.sourceSheetCategory}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-white border border-[#EFE5D8] rounded-lg p-2 text-[11px]">
                        <div>
                          <span className="text-[#6E5846]">نشانی مزار: </span>
                          <strong className="text-[#332218]">
                            قطعه {toPersianDigits(rel.gravePiece)} · ردیف{' '}
                            {toPersianDigits(rel.graveRow)} · شماره{' '}
                            {toPersianDigits(rel.graveNumber)}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[#6E5846]">صفحه / ارجاع در کتاب: </span>
                          <strong className="text-[#6B3E26]">
                            {toPersianDigits(rel.pageReference)}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[#6E5846]">منبع ثبت: </span>
                          <strong className="text-[#332218]">
                            {rel.sourceFile} (شیت {rel.sourceSheet}، ردیف{' '}
                            {toPersianDigits(rel.sourceExcelRow)})
                          </strong>
                        </div>
                      </div>

                      <div className="text-[11px] text-[#5C4636] leading-relaxed">
                        <strong className="text-[#332218]">مستندات و دلیل ارتباط: </strong>
                        {rel.evidenceText}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* مطالب استخراج‌شده مرتبط با کتاب در صورت وجود */}
              {selectedBookDossier.extractedPassages.length > 0 && (
                <div className="border-t border-[#EFE5D8] pt-2.5 space-y-2">
                  <div className="font-bold text-xs text-[#6B3E26] flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    <span>
                      گزیده‌ها و مطالب استخراج‌شده از کتاب (
                      {toPersianDigits(selectedBookDossier.extractedPassages.length)} مطلب)
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {selectedBookDossier.extractedPassages.map((ex) => (
                      <div
                        key={ex.id}
                        className="bg-white border border-[#E2D2BE] rounded-lg p-2.5 text-[11px] space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2 font-bold text-[#332218]">
                          <span>
                            {ex.passageTitle} ({ex.contentType})
                          </span>
                          <span className="font-mono text-[#6B3E26]">
                            ص {toPersianDigits(ex.pageReferenceRaw)}
                          </span>
                        </div>
                        <div className="text-[#5C4636]">{ex.extractedText}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* بخش ۷ و ۸: سابقه و منبع ثبت اطلاعات + دکمه مشاهده اطلاعات ثبت‌شده در فایل اکسل اولیه همان کتاب */}
            <div className="bg-[#FAF5EE] border border-[#D8C7B2] rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="font-bold text-[#332218] flex items-center gap-1.5">
                  <History className="w-4 h-4 text-[#6B3E26]" />
                  <span>سابقه و منبع ثبت اطلاعات</span>
                </div>
                <div className="text-[11px] text-[#5C4636]">
                  فایل منبع: <strong>{selectedBookDossier.originalExcelData.sourceFile}</strong> ·
                  شیت: <strong>{selectedBookDossier.originalExcelData.sourceSheet}</strong> · ردیف:{' '}
                  <strong>{toPersianDigits(selectedBookDossier.originalExcelData.sourceRow)}</strong>
                  {selectedBookDossier.checkedBy
                    ? ` · ثبت/بررسی: ${selectedBookDossier.checkedBy}`
                    : ''}
                </div>
              </div>

              {selectedBookDossier.originalExcelData.hasExcelRecord && (
                <button
                  type="button"
                  onClick={() => setShowOriginalExcelModal(true)}
                  className="min-h-[38px] px-3.5 py-2 rounded-xl bg-[#2E6F40] hover:bg-[#245832] text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>مشاهده اطلاعات در اکسل اولیه</span>
                </button>
              )}
            </div>
          </div>
        </ModalWindow>
      )}

      {/* پنجره ۳: نمایش تمیز و خوانای اطلاعات ثبت‌شده در فایل اکسل اولیه فقط برای همان کتاب */}
      {selectedBookDossier && showOriginalExcelModal && (
        <ModalWindow
          onClose={() => setShowOriginalExcelModal(false)}
          title={`اطلاعات ثبت‌شده در فایل اکسل اولیه — کتاب «${selectedBookDossier.title}»`}
          maxWidthClass="max-w-2xl"
        >
          <div className="space-y-4 text-xs text-[#332218]">
            <div className="bg-[#EDF6F0] border border-[#A8D5B5] rounded-xl p-3 text-[#1E4D2B] flex items-center justify-between gap-2">
              <span>
                منبع: <strong>{selectedBookDossier.originalExcelData.sourceFile}</strong> (شیت «
                {selectedBookDossier.originalExcelData.sourceSheet}»، ردیف{' '}
                {toPersianDigits(selectedBookDossier.originalExcelData.sourceRow)})
              </span>
              <span className="font-mono font-bold">{selectedBookDossier.bookId}</span>
            </div>

            {/* جدول ستون‌های ثبت‌شده برای این کتاب در اکسل اولیه */}
            {selectedBookDossier.originalExcelData.rawCells.length > 0 && (
              <div className="border border-[#E2D2BE] rounded-xl overflow-hidden">
                <div className="bg-[#FAF5EE] px-3 py-2 font-bold text-[#6B3E26] border-b border-[#E2D2BE]">
                  مشخصات کتاب در سطر اکسل اولیه
                </div>
                <div className="divide-y divide-[#EFE5D8] bg-white">
                  {selectedBookDossier.originalExcelData.rawCells.map((cell, i) => (
                    <div
                      key={i}
                      className="px-3 py-2 flex items-center justify-between gap-4 text-xs"
                    >
                      <span className="text-[#6E5846] font-medium">{cell.label}</span>
                      <span className="font-bold text-[#332218] text-left">{cell.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* جدول سطرهای ارتباط شهید در اکسل پژوهشی برای همین کتاب */}
            {selectedBookDossier.originalExcelData.rawRelationRows.length > 0 && (
              <div className="border border-[#E2D2BE] rounded-xl overflow-hidden">
                <div className="bg-[#FAF5EE] px-3 py-2 font-bold text-[#6B3E26] border-b border-[#E2D2BE]">
                  سطرهای ثبت‌شده در اکسل پژوهشی برای این کتاب (
                  {toPersianDigits(selectedBookDossier.originalExcelData.rawRelationRows.length)}{' '}
                  سطر)
                </div>
                <div className="overflow-x-auto bg-white">
                  <table className="w-full text-right text-[11px] border-collapse">
                    <thead>
                      <tr className="bg-[#FAF5EE]/60 border-b border-[#E2D2BE] text-[#5C4636]">
                        <th className="p-2">ردیف اکسل</th>
                        <th className="p-2">شیت منبع</th>
                        <th className="p-2">نام شهید در اکسل</th>
                        <th className="p-2">قطعه / ردیف / شماره</th>
                        <th className="p-2">صفحه</th>
                        <th className="p-2">توضیحات منبع</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFE5D8]">
                      {selectedBookDossier.originalExcelData.rawRelationRows.map((r, i) => (
                        <tr key={i} className="hover:bg-[#FAF5EE]/40">
                          <td className="p-2 font-mono">{toPersianDigits(r.rowNumber)}</td>
                          <td className="p-2">{r.sheet}</td>
                          <td className="p-2 font-bold">{r.martyr}</td>
                          <td className="p-2 font-mono">
                            {toPersianDigits(r.piece)} / {toPersianDigits(r.row)} /{' '}
                            {toPersianDigits(r.number)}
                          </td>
                          <td className="p-2">{toPersianDigits(r.page)}</td>
                          <td className="p-2">{r.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowOriginalExcelModal(false)}
                className="px-4 py-2 rounded-xl bg-[#6B3E26] text-white font-bold text-xs cursor-pointer"
              >
                بازگشت به پرونده کتاب
              </button>
            </div>
          </div>
        </ModalWindow>
      )}

      {/* پنجره ۴: ثبت صوتی فارسی کنار قفسه */}
      {showVoiceModal && (
        <ModalWindow
          onClose={() => setShowVoiceModal(false)}
          title="ورود صوتی فارسی و ثبت سریع کنار قفسه"
          maxWidthClass="max-w-2xl"
        >
          <div className="space-y-3">
            <label className="flex items-start gap-2 bg-[#EAF1F7] p-3 rounded-xl text-xs text-[#253247] cursor-pointer">
              <input
                type="checkbox"
                checked={voiceConsentChecked}
                onChange={(e) => setVoiceConsentChecked(e.target.checked)}
                className="mt-0.5 rounded"
              />
              <span>
                تبدیل گفتار به متن صرفاً با موتور محلی مرورگر یا میکروفون صفحه‌کلید گوشی انجام می‌گیرد.
              </span>
            </label>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-bold text-[#253247]">متن فرمان صوتی:</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleStartBrowserSpeechRecognition}
                    className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isListening
                        ? 'bg-[#A63A3A] text-white'
                        : 'bg-[#2E6F40] hover:bg-[#235632] text-white'
                    }`}
                  >
                    <Mic className="w-4 h-4" />
                    <span>{isListening ? 'در حال گوش دادن...' : 'شروع تشخیص گفتار'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => syncVoiceToPreview(SAMPLE_VOICE_COMMAND)}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#253247] text-xs font-medium cursor-pointer"
                  >
                    فرمان نمونه
                  </button>
                </div>
              </div>

              <textarea
                rows={3}
                value={voiceTranscript}
                onChange={(e) => syncVoiceToPreview(e.target.value)}
                className="w-full p-3 text-xs sm:text-sm bg-[#F5F7FA] border border-slate-300 rounded-xl focus:outline-none focus:border-[#1F4E79] focus:bg-white text-[#253247]"
              />
            </div>

            {parsedVoice.uncertainFields.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
                <div className="text-xs font-bold text-[#C58A2B] flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  <span>موارد نیازمند بررسی در فرمان صوتی:</span>
                </div>
                <ul className="text-xs text-[#253247] pr-4 list-disc space-y-0.5">
                  {parsedVoice.uncertainFields.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}

            <form onSubmit={handleConfirmVoiceBookSave} className="space-y-3 pt-1">
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
                  <label className="block text-[11px] font-bold text-[#253247] mb-1">ناشر</label>
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
                    گروه موضوعی
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
                      قفسه
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
                      طبقه
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

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowVoiceModal(false)}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 text-[#253247] text-xs font-bold cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-[#2E6F40] hover:bg-[#235632] text-white text-xs font-bold cursor-pointer"
                >
                  تأیید و ذخیره کتاب
                </button>
              </div>
            </form>
          </div>
        </ModalWindow>
      )}

      {/* پنجره ۵: ثبت سریع دستی کتاب */}
      {showQuickBookModal && (
        <ModalWindow
          onClose={() => setShowQuickBookModal(false)}
          title="ثبت سریع کتاب"
          maxWidthClass="max-w-lg"
        >
          <form onSubmit={handleConfirmQuickBookSave} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-[#253247] mb-1">عنوان کتاب *</label>
              <input
                type="text"
                required
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                placeholder="نام دقیق کتاب..."
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
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#253247] mb-1">ناشر</label>
                <input
                  type="text"
                  value={quickPublisher}
                  onChange={(e) => setQuickPublisher(e.target.value)}
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
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowQuickBookModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-bold cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-[#2E6F40] hover:bg-[#235632] text-white text-xs font-bold cursor-pointer"
              >
                ثبت کتاب در {quickShelf}-{quickLevel}
              </button>
            </div>
          </form>
        </ModalWindow>
      )}
    </div>
  );
};
