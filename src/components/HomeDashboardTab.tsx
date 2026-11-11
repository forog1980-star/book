import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  Mic,
  PlusCircle,
  BookOpen,
  Users,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Layers,
  FileSpreadsheet,
  Trash2,
  ShieldCheck,
  MapPin,
  FileText,
  History,
  Edit3,
  Plus,
  Check,
  X,
  ChevronDown,
  ChevronUp
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
  BookDossierMartyrRelation,
  buildUnifiedBookDossiers,
  compactPersianForMatch,
  MartyrRelationCertainty,
  UnifiedBookDossier
} from '../data/soorehMehrResearch';
import { parsePersianVoiceBookCommand } from '../utils/voiceCommandParser';
import { generateUniqueCopyId, generateUniqueOutsideBookId } from '../utils/idGenerator';
import { requestActionConfirmation } from '../utils/confirmDialogService';
import {
  registerInnerBackStep,
  getHomeDossierNavSnapshot,
  saveHomeDossierNavSnapshot,
  setMartyrsCrossTabTarget
} from '../utils/navigationHistory';
import {
  exportBookDossiersToExcel,
  exportShelfAuditRecordsToExcel
} from '../utils/excelExportService';
import { FullOperationalState } from '../utils/backupService';
import { JsonSystemTransferSection } from '../modules/json-system-transfer';
import { TehranMartyrBadge } from './TehranMartyrBadge';
import { evaluateMartyrTehranStatus } from '../utils/martyrsCrossMatchEngine';

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
  onAddBookCopy?: (newCopy: BookCopyRecord) => void;
  onMoveBookCopy?: (copyId: string, toShelf: ShelfCode, toLevel: LevelCode, reason: string) => void;
  onAddLink?: (newLink: BookMartyrLinkRecord) => void;
  onUpdateLink?: (updatedLink: BookMartyrLinkRecord) => void;
  onApproveOutsideBook?: (recordKey: string) => void;
  onDeleteAuditRecord?: (recordKey: string) => void;
  onDownloadUnifiedExcel?: () => void;
  onDownloadFullJsonBackup?: () => void;
  fullOperationalState?: FullOperationalState;
  onApplyMergedSystemState?: (merged: FullOperationalState, summaryMessage: string) => void;
  onNotify: (message: string, type?: 'success' | 'warning') => void;
}

type StatGroupModalType = 'all_books' | 'new_books' | 'determined_books' | 'martyr_books' | null;

type GroupSubFilter =
  | 'all'
  | 'tehran_martyrs'
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
  onAddBookCopy,
  onMoveBookCopy,
  onAddLink,
  onUpdateLink,
  onApproveOutsideBook,
  onDeleteAuditRecord,
  fullOperationalState,
  onApplyMergedSystemState,
  onNotify
}) => {
  const initialNavSnapshot = useMemo(() => getHomeDossierNavSnapshot(), []);

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

  // وضعیت پنجره فهرست کارت‌های آماری و پرونده اختصاصی هر کتاب (با بازیابی پایدار از حافظه ناوبری)
  const [activeStatGroupModal, setActiveStatGroupModal] = useState<StatGroupModalType>(
    initialNavSnapshot.activeStatGroupModal
  );
  const [statModalSearchQuery, setStatModalSearchQuery] = useState(
    initialNavSnapshot.statModalSearchQuery
  );
  const [statModalSubFilter, setStatModalSubFilter] = useState<GroupSubFilter>(
    initialNavSnapshot.statModalSubFilter
  );
  const [selectedBookDossierId, setSelectedBookDossierId] = useState<string | null>(
    initialNavSnapshot.selectedBookDossierId
  );
  const [lastInteractedDossierId, setLastInteractedDossierId] = useState<string | null>(
    initialNavSnapshot.lastInteractedDossierId
  );
  const [showOriginalExcelModal, setShowOriginalExcelModal] = useState(false);

  // پرونده اختصاصی شهید با کلیک روی نام شهید در پرونده کتاب
  const [selectedMartyrDossierName, setSelectedMartyrDossierName] = useState<string | null>(
    initialNavSnapshot.selectedMartyrDossierName
  );

  // مرجع اسکرول فهرست کتاب‌ها در پنجره آماری برای حفظ دقیق موقعیت اسکرول در تمام مسیرهای بازگشت
  const statListScrollRef = useRef<HTMLDivElement | null>(null);

  // وضعیت جابه‌جایی قفسه نسخه فیزیکی (با ثبت در تاریخچه جابه‌جایی) در پرونده کتاب
  const [isMovingDossierShelf, setIsMovingDossierShelf] = useState(false);
  const [moveTargetShelf, setMoveTargetShelf] = useState<ShelfCode>('SH-01');
  const [moveTargetLevel, setMoveTargetLevel] = useState<LevelCode>('T01');
  const [moveReason, setMoveReason] = useState('جابه‌جایی قفسه در بازبینی میدانی');

  // وضعیت باز و بسته شدن گزیده‌های متنی طولانی در پرونده کتاب
  const [expandedDossierPassageIds, setExpandedDossierPassageIds] = useState<Record<string, boolean>>({});

  // وضعیت ویرایش درون‌جای پرونده کتاب
  const [isEditingDossierBook, setIsEditingDossierBook] = useState(false);
  const [editBookTitle, setEditBookTitle] = useState('');
  const [editBookAuthor, setEditBookAuthor] = useState('');
  const [editBookPublisher, setEditBookPublisher] = useState('');
  const [editBookYear, setEditBookYear] = useState('');
  const [editBookEdition, setEditBookEdition] = useState('');
  const [editBookIsbn, setEditBookIsbn] = useState('');
  const [editBookFipa, setEditBookFipa] = useState('');
  const [editBookRegNo, setEditBookRegNo] = useState('');
  const [editBookCategory, setEditBookCategory] = useState(SUBJECT_CATEGORIES[0].label);
  const [editBookDescription, setEditBookDescription] = useState('');
  const [editBookPhysical, setEditBookPhysical] = useState<'verified' | 'review' | 'not_found'>('verified');
  const [editBookShelf, setEditBookShelf] = useState<ShelfCode | ''>('SH-01');
  const [editBookLevel, setEditBookLevel] = useState<LevelCode | ''>('T01');
  const [editBookCopies, setEditBookCopies] = useState('1');
  const [editBookNotes, setEditBookNotes] = useState('');

  // وضعیت ویرایش یا افزودن ارتباط شهید در داخل پرونده کتاب
  const [editingRelationLinkId, setEditingRelationLinkId] = useState<string | 'NEW' | null>(null);
  const [relMartyrName, setRelMartyrName] = useState('');
  const [relGravePiece, setRelGravePiece] = useState('');
  const [relGraveRow, setRelGraveRow] = useState('');
  const [relGraveNumber, setRelGraveNumber] = useState('');
  const [relPageRef, setRelPageRef] = useState('');
  const [relCertainty, setRelCertainty] = useState<MartyrRelationCertainty>('نیازمند بررسی');
  const [relSourceDesc, setRelSourceDesc] = useState('');
  const [relReviewerNote, setRelReviewerNote] = useState('');

  // جست‌وجو در فهرست ثبت‌های قفسه ذخیره‌شده در پایین صفحه اصلی + وضعیت باز و بسته شدن بخش‌های جمع‌شونده پایین صفحه خانه (به‌صورت پیش‌فرض بسته)
  const [savedShelfSearchQuery, setSavedShelfSearchQuery] = useState('');
  const [isSavedShelfSectionOpen, setIsSavedShelfSectionOpen] = useState(false);
  const [isJsonTransferSectionOpen, setIsJsonTransferSectionOpen] = useState(false);

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

  // پیش‌محاسبه متن نرمال‌شده جست‌وجو برای هر پرونده کتاب (جلوگیری از اجرای مجدد Regex در هر کلید تایپ‌شده)
  const dossierSearchHaystackMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of allDossiers) {
      const martyrNames = d.martyrRelations.map((m) => m.martyrName).join(' ');
      map.set(
        d.dossierId,
        normalizePersianText(
          `${d.bookId} ${d.title} ${d.alternativeTitle} ${d.description || ''} ${d.locationCode} ${d.sheetCategory} ${martyrNames}`
        )
      );
    }
    return map;
  }, [allDossiers]);

  const [statModalVisibleLimit, setStatModalVisibleLimit] = useState<number>(65);

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

  // تفکیک دقیق ۴بخشی منشأ آمار مجموعه کتاب‌ها بر اساس منشأ تغییرناپذیر هر کتاب (originCategory)
  const statsComposition = useMemo(() => {
    const baseResearchCount = allDossiers.filter(
      (d) => d.originCategory === 'base-research'
    ).length;
    const determinedCatalogWithoutMartyrCount = allDossiers.filter(
      (d) => d.originCategory === 'catalog-determined'
    ).length;
    const determinedInResearchCount = allDossiers.filter(
      (d) => d.originCategory === 'base-research' && d.isDetermined
    ).length;
    const newCount = allDossiers.filter(
      (d) => d.originCategory === 'new-registration'
    ).length;
    return {
      baseResearchCount,
      determinedCatalogWithoutMartyrCount,
      determinedInResearchCount,
      newCount,
      totalUniqueCount: allDossiers.length
    };
  }, [allDossiers]);

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

  // نسخه‌های فیزیکی ثبت‌شده برای کتاب انتخاب‌شده (شامل تاریخچه جابه‌جایی قفسه)
  const selectedBookCopies = useMemo(() => {
    if (!selectedBookDossier) return [];
    return bookCopies.filter((cp) => cp.bookId === selectedBookDossier.bookId);
  }, [bookCopies, selectedBookDossier]);

  // همگام‌سازی خودکار وضعیت فهرست، فیلتر، متن جست‌وجو، پرونده کتاب و پرونده شهید در مخزن ناوبری
  useEffect(() => {
    saveHomeDossierNavSnapshot({
      activeStatGroupModal,
      statModalSearchQuery,
      statModalSubFilter,
      selectedBookDossierId,
      lastInteractedDossierId,
      selectedMartyrDossierName
    });
  }, [
    activeStatGroupModal,
    statModalSearchQuery,
    statModalSubFilter,
    selectedBookDossierId,
    lastInteractedDossierId,
    selectedMartyrDossierName
  ]);

  // بازیابی موقعیت اسکرول فهرست کتاب‌ها هنگام بازگشت از پرونده کتاب یا بازگشت از بانک جامع شهدا
  useEffect(() => {
    if (!activeStatGroupModal) return;
    const timer = setTimeout(() => {
      const container = statListScrollRef.current;
      const savedScrollTop = getHomeDossierNavSnapshot().statModalScrollTop;
      if (container && savedScrollTop > 0) {
        container.scrollTop = savedScrollTop;
      } else if (lastInteractedDossierId) {
        const el = document.getElementById(`stat-dossier-row-${lastInteractedDossierId}`);
        el?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
      }
    }, 35);
    return () => clearTimeout(timer);
  }, [activeStatGroupModal, selectedBookDossierId, lastInteractedDossierId]);

  // ثبت لایه‌ای دکمه بازگشت (Back) تا کاربر با زدن بازگشت به محل قبلی در فهرست برگردد و جست‌وجو/فیلتر/اسکرول حفظ شود
  useEffect(() => {
    if (
      !selectedMartyrDossierName &&
      !showOriginalExcelModal &&
      !selectedBookDossierId &&
      !activeStatGroupModal
    ) {
      return;
    }
    return registerInnerBackStep('home-dossier-modals', () => {
      if (selectedMartyrDossierName) {
        setSelectedMartyrDossierName(null);
      } else if (showOriginalExcelModal) {
        setShowOriginalExcelModal(false);
      } else if (selectedBookDossierId) {
        const keepId = selectedBookDossierId;
        setLastInteractedDossierId(keepId);
        setIsEditingDossierBook(false);
        setIsMovingDossierShelf(false);
        setEditingRelationLinkId(null);
        setSelectedBookDossierId(null);
      } else if (activeStatGroupModal) {
        setActiveStatGroupModal(null);
      }
    });
  }, [
    selectedMartyrDossierName,
    showOriginalExcelModal,
    selectedBookDossierId,
    activeStatGroupModal
  ]);

  // پر کردن فرم ویرایش پرونده کتاب هنگام باز شدن حالت ویرایش
  const startEditingBookDossier = (dossier: UnifiedBookDossier) => {
    setEditBookTitle(dossier.title || '');
    setEditBookAuthor(dossier.author === 'ثبت‌نشده' ? '' : dossier.author);
    setEditBookPublisher(dossier.publisher === 'ثبت‌نشده' ? '' : dossier.publisher);
    setEditBookYear(dossier.year === '—' ? '' : dossier.year);
    setEditBookEdition(dossier.edition === '—' ? '' : dossier.edition);
    setEditBookIsbn(dossier.isbn === '—' ? '' : dossier.isbn);
    setEditBookFipa(dossier.fipa === '—' ? '' : dossier.fipa);
    setEditBookRegNo(dossier.registrationNo === '—' ? '' : dossier.registrationNo);
    setEditBookCategory(
      dossier.category && dossier.category !== '—'
        ? dossier.category
        : SUBJECT_CATEGORIES[0].label
    );
    setEditBookDescription(dossier.description === '—' ? '' : dossier.description);
    setEditBookPhysical(
      dossier.physicalStatus === 'unchecked' ? 'verified' : dossier.physicalStatus
    );
    setEditBookShelf((dossier.shelf as ShelfCode) || 'SH-01');
    setEditBookLevel((dossier.level as LevelCode) || 'T01');
    setEditBookCopies(dossier.countedCopies || '1');
    setEditBookNotes(dossier.notes || '');
    setIsEditingDossierBook(true);
  };

  // ذخیره ویرایش پرونده کتاب روی همان رکورد بدون ساخت رکورد تکراری (با تأیید دومرحله‌ای)
  const handleSaveDossierBookEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBookDossier) return;
    if (!editBookTitle.trim()) {
      onNotify('عنوان کتاب نمی‌تواند خالی باشد.', 'warning');
      return;
    }

    const catRow =
      catalogRows.find((r) => r.tempBookId === selectedBookDossier.bookId) ||
      catalogRows.find((r) => r.rowKey === selectedBookDossier.rowKey) ||
      catalogRows.find(
        (r) => compactPersianForMatch(r.titleRaw) === compactPersianForMatch(selectedBookDossier.title)
      );

    const resolvedKey =
      auditRecords[selectedBookDossier.rowKey]
        ? selectedBookDossier.rowKey
        : catRow?.rowKey || selectedBookDossier.rowKey;

    const existingAudit = auditRecords[resolvedKey];
    const isOutside =
      selectedBookDossier.isNewRegistration || existingAudit?.source === 'outside-list';
    const loc =
      editBookShelf && editBookLevel ? `${editBookShelf}-${editBookLevel}` : '';
    const statusLabel =
      editBookPhysical === 'verified'
        ? 'موجود و تأییدشده در کتابخانه'
        : editBookPhysical === 'review'
        ? 'نیازمند بررسی'
        : 'مشاهده‌نشده در قفسه';

    requestActionConfirmation({
      variant: 'confirm',
      title: 'تأیید نهایی ویرایش پرونده اختصاصی کتاب',
      message: `آیا از ذخیره تغییرات روی پرونده کتاب «${editBookTitle.trim()}» (${selectedBookDossier.bookId}) اطمینان دارید؟`,
      details: [
        `عنوان کتاب: ${editBookTitle.trim()}`,
        `نویسنده: ${editBookAuthor.trim() || 'ثبت‌نشده'} · ناشر: ${editBookPublisher.trim() || 'ثبت‌نشده'}`,
        `وضعیت تعیین‌تکلیف: ${statusLabel}`,
        `محل نگهداری: ${loc || 'بدون کد محل'} · دسته: ${editBookCategory}`
      ],
      confirmLabel: 'بله، تغییرات در پرونده ذخیره شود',
      onConfirm: () => {
        const updatedRecord: FieldAuditRecord = {
          key: resolvedKey,
          source: isOutside ? 'outside-list' : 'catalog',
          sheet: existingAudit?.sheet || catRow?.backupSourceSheet || 'فهرست کتاب‌ها',
          tempBookId: selectedBookDossier.bookId,
          copyId:
            existingAudit?.copyId ||
            `CP-${String(Math.max(1, (catRow?.rowIndex || 2) - 1)).padStart(6, '0')}`,
          title: editBookTitle.trim(),
          author: editBookAuthor.trim(),
          publisher: editBookPublisher.trim(),
          year: editBookYear.trim(),
          edition: editBookEdition.trim(),
          isbn: editBookIsbn.trim(),
          fipa: editBookFipa.trim(),
          registrationNo: editBookRegNo.trim(),
          descriptionRaw: editBookDescription.trim(),
          category: editBookCategory,
          shelf: editBookShelf,
          level: editBookLevel,
          location: loc,
          physical: editBookPhysical,
          copyStatus:
            editBookPhysical === 'verified'
              ? 'verified_present'
              : editBookPhysical === 'review'
              ? 'pending_review'
              : 'missing',
          physicalCondition: existingAudit?.physicalCondition || 'healthy',
          countedCopies: editBookCopies.trim() || '1',
          notes: editBookNotes.trim(),
          backupSourceSheet: existingAudit?.backupSourceSheet || catRow?.backupSourceSheet,
          backupSourceRow: existingAudit?.backupSourceRow || catRow?.backupSourceRow,
          updatedAt: new Date().toISOString()
        };

        onSaveVoiceOrQuickBook(updatedRecord);
        setLastInteractedDossierId(selectedBookDossier.dossierId);
        setIsEditingDossierBook(false);
        onNotify(
          `✅ تغییرات پرونده کتاب «${updatedRecord.title}» (${updatedRecord.tempBookId}) بدون ایجاد تکرار ذخیره شد.`
        );
      }
    });
  };

  // شروع ویرایش یک ارتباط شهید یا افزودن ارتباط شهید جدید در داخل پرونده کتاب
  const startEditMartyrRelation = (rel?: BookDossierMartyrRelation) => {
    if (!rel) {
      setEditingRelationLinkId('NEW');
      setRelMartyrName('');
      setRelGravePiece('');
      setRelGraveRow('');
      setRelGraveNumber('');
      setRelPageRef('');
      setRelCertainty('نیازمند بررسی');
      setRelSourceDesc('');
      setRelReviewerNote('');
      return;
    }
    setEditingRelationLinkId(rel.linkId);
    setRelMartyrName(rel.martyrName || '');
    setRelGravePiece(rel.gravePiece === '—' ? '' : rel.gravePiece);
    setRelGraveRow(rel.graveRow === '—' ? '' : rel.graveRow);
    setRelGraveNumber(rel.graveNumber === '—' ? '' : rel.graveNumber);
    setRelPageRef(rel.pageReference === 'کل کتاب / ثبت‌نشده' ? '' : rel.pageReference);
    // حفظ دقیق وضعیت فعلی ارتباط (قطعی / احتمالی / نیازمند بررسی) بدون تغییر خودکار به قطعی
    setRelCertainty(rel.certainty);
    setRelSourceDesc(rel.sourceDescriptionRaw || '');
    setRelReviewerNote(rel.reviewerNote || '');
  };

  // ذخیره ارتباط شهید (ویرایش یا جدید) در داخل پرونده کتاب با تأیید دومرحله‌ای
  const handleSaveMartyrRelationInDossier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBookDossier || !editingRelationLinkId) return;
    const cleanMartyr = relMartyrName.trim();
    if (!cleanMartyr) {
      onNotify('لطفاً نام شهید مرتبط را وارد نمایید.', 'warning');
      return;
    }

    const isNewRel = editingRelationLinkId === 'NEW';

    requestActionConfirmation({
      variant: 'confirm',
      title: isNewRel
        ? 'تأیید نهایی افزودن ارتباط شهید به پرونده کتاب'
        : 'تأیید نهایی ویرایش ارتباط کتاب و شهید',
      message: isNewRel
        ? `آیا از ثبت ارتباط شهید «${cleanMartyr}» برای کتاب «${selectedBookDossier.title}» با وضعیت «${relCertainty}» اطمینان دارید؟`
        : `آیا از ذخیره تغییرات ارتباط شهید «${cleanMartyr}» در پرونده کتاب «${selectedBookDossier.title}» با وضعیت «${relCertainty}» اطمینان دارید؟`,
      details: [
        `عنوان کتاب: ${selectedBookDossier.title} (${selectedBookDossier.bookId})`,
        `نام شهید: ${cleanMartyr}`,
        `نشانی مزار: قطعه ${relGravePiece.trim() || '—'} · ردیف ${relGraveRow.trim() || '—'} · شماره ${relGraveNumber.trim() || '—'}`,
        `صفحه ارجاع: ${relPageRef.trim() || 'ثبت‌نشده'} · وضعیت ارتباط: ${relCertainty}`
      ],
      confirmLabel: 'بله، در پرونده کتاب ذخیره شود',
      onConfirm: () => {
        if (isNewRel) {
          const newLink: BookMartyrLinkRecord = {
            id: `RL-USR-${Date.now()}`,
            tempBookId: selectedBookDossier.bookId,
            bookTitleRaw: selectedBookDossier.title,
            alternativeTitle: selectedBookDossier.alternativeTitle || undefined,
            publisherRaw: selectedBookDossier.publisher === 'ثبت‌نشده' ? '' : selectedBookDossier.publisher,
            martyrNameRaw: cleanMartyr,
            rawNameInSource: cleanMartyr,
            isGroupPhrase: false,
            gravePieceRaw: relGravePiece.trim(),
            graveRowRaw: relGraveRow.trim(),
            graveNumberRaw: relGraveNumber.trim(),
            pageReferenceRaw: relPageRef.trim(),
            sourceDescriptionRaw: relSourceDesc.trim(),
            sourceFile: 'ثبت کارشناس در پرونده کتاب',
            sourceSheet:
              selectedBookDossier.martyrRelations.length >= 1 ? 'چند شهید' : 'یک شهید',
            sourceExcelRow: '—',
            reviewStatus: relCertainty,
            reviewerNote: relReviewerNote.trim()
          };
          onAddLink?.(newLink);
          onNotify(`✅ ارتباط شهید «${cleanMartyr}» به پرونده کتاب «${selectedBookDossier.title}» اضافه شد.`);
        } else {
          const existingLink = links.find((l) => l.id === editingRelationLinkId);
          if (existingLink && onUpdateLink) {
            const updatedLink: BookMartyrLinkRecord = {
              ...existingLink,
              martyrNameRaw: cleanMartyr,
              gravePieceRaw: relGravePiece.trim(),
              graveRowRaw: relGraveRow.trim(),
              graveNumberRaw: relGraveNumber.trim(),
              pageReferenceRaw: relPageRef.trim(),
              sourceDescriptionRaw: relSourceDesc.trim(),
              reviewStatus: relCertainty,
              reviewerNote: relReviewerNote.trim()
            };
            onUpdateLink(updatedLink);
            onNotify(`✅ اطلاعات ارتباط شهید «${cleanMartyr}» در پرونده کتاب به‌روزرسانی شد.`);
          }
        }
        setLastInteractedDossierId(selectedBookDossier.dossierId);
        setEditingRelationLinkId(null);
      }
    });
  };

  // ساخت اطلاعات کامل پرونده اختصاصی شهید برای پنجره مودال شهید (`selectedMartyrDossierName`)
  const selectedMartyrDossierData = useMemo(() => {
    if (!selectedMartyrDossierName) return null;
    const targetCompact = compactPersianForMatch(selectedMartyrDossierName);

    const customMatch = customMartyrs.find(
      (cm) => compactPersianForMatch(cm.fullName) === targetCompact
    );
    const wbMatch = workbookMartyrs.find(
      (wm) => compactPersianForMatch(wm.fullNameSearch) === targetCompact
    );

    const relatedBooks = allDossiers.filter((d) =>
      d.martyrRelations.some(
        (m) => compactPersianForMatch(m.martyrName) === targetCompact
      )
    );

    const relatedRelations = relatedBooks.flatMap((b) =>
      b.martyrRelations
        .filter((m) => compactPersianForMatch(m.martyrName) === targetCompact)
        .map((m) => ({ book: b, rel: m }))
    );

    const firstRel = relatedRelations[0]?.rel;

    const relatedPassages = extractedItems.filter(
      (ex) => compactPersianForMatch(ex.martyrNameRaw) === targetCompact
    );

    const pieceVal = customMatch?.gravePiece || wbMatch?.piece || firstRel?.gravePiece || '—';
    const rowVal = customMatch?.graveRow || wbMatch?.graveRow || firstRel?.graveRow || '—';
    const numVal = customMatch?.graveNumber || wbMatch?.graveNumber || firstRel?.graveNumber || '—';
    const fullNameVal =
      customMatch?.fullName || wbMatch?.fullNameSearch || selectedMartyrDossierName;

    const tehranEval = evaluateMartyrTehranStatus({
      martyrName: fullNameVal,
      gravePiece: pieceVal === '—' ? '' : pieceVal,
      graveRow: rowVal === '—' ? '' : rowVal,
      graveNumber: numVal === '—' ? '' : numVal,
      sourceDesc: firstRel?.sourceDescriptionRaw,
      reviewerNote: firstRel?.reviewerNote
    });

    return {
      fullName: fullNameVal,
      personId: customMatch?.martyrId || wbMatch?.tempPersonId || 'پرونده پژوهشی شهید',
      piece: pieceVal,
      row: rowVal,
      number: numVal,
      isTehranMartyr:
        !tehranEval.isNonTehran &&
        (tehranEval.isTehran || relatedRelations.some((r) => r.rel.isTehranMartyr)),
      graveStatus:
        customMatch?.graveVerificationStatus ||
        wbMatch?.graveStatus ||
        (firstRel?.certainty === 'قطعی' ? 'تأییدشده در پژوهش' : 'نیازمند بررسی تکمیلی'),
      relatedRelations,
      relatedPassages
    };
  }, [selectedMartyrDossierName, customMartyrs, workbookMartyrs, allDossiers, extractedItems]);

  // فهرست ثبت‌های قفسه ذخیره‌شده در حافظه این دستگاه (برای بخش پایین صفحه اصلی)
  const savedDeviceAuditRecords = useMemo(() => {
    const list = Object.values(auditRecords).sort((a, b) =>
      (b.updatedAt || '').localeCompare(a.updatedAt || '')
    );
    const q = normalizePersianText(savedShelfSearchQuery);
    if (!q) return list;
    return list.filter((rec) =>
      normalizePersianText(
        `${rec.tempBookId} ${rec.title} ${rec.author} ${rec.publisher} ${rec.location} ${rec.category}`
      ).includes(q)
    );
  }, [auditRecords, savedShelfSearchQuery]);

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
      setLastInteractedDossierId(found.dossierId);
      setIsEditingDossierBook(false);
      setEditingRelationLinkId(null);
      setSelectedBookDossierId(found.dossierId);
      setShowOriginalExcelModal(false);
      return;
    }

    if (onOpenBookInLibrary) {
      onOpenBookInLibrary(bookIdOrTitle);
    } else {
      onNavigateTab('library');
    }
  };

  const openStatCardModal = (groupType: Exclude<StatGroupModalType, null>) => {
    if (activeStatGroupModal !== groupType) {
      setStatModalSearchQuery('');
      setStatModalSubFilter('all');
      saveHomeDossierNavSnapshot({ statModalScrollTop: 0 });
    }
    setActiveStatGroupModal(groupType);
  };

  // ثبت جابه‌جایی قفسه نسخه فیزیکی کتاب (همراه با درج در تاریخچه جابه‌جایی نسخه CP-xxxxxx)
  const handleConfirmMoveDossierShelf = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBookDossier) return;
    const newLocation = `${moveTargetShelf}-${moveTargetLevel}`;
    const prevLocation = selectedBookDossier.locationCode || 'ثبت‌نشده';
    if (newLocation === prevLocation) {
      onNotify('قفسه و طبقه مقصد با موقعیت فعلی کتاب یکسان است.', 'warning');
      return;
    }

    requestActionConfirmation({
      variant: 'confirm',
      title: 'تأیید جابه‌جایی قفسه نسخه کتاب (با ثبت در تاریخچه)',
      message: `آیا از انتقال کتاب «${selectedBookDossier.title}» از محل «${prevLocation}» به قفسه جدید «${newLocation}» اطمینان دارید؟`,
      details: [
        `عنوان کتاب: ${selectedBookDossier.title} (${selectedBookDossier.bookId})`,
        `محل قبلی: ${prevLocation} ← محل جدید: ${newLocation}`,
        `علت جابه‌جایی: ${moveReason.trim() || 'جابه‌جایی قفسه در بازبینی میدانی'}`
      ],
      confirmLabel: 'بله، جابه‌جایی ثبت شود',
      onConfirm: () => {
        const existingCopy = selectedBookCopies[0];
        const generatedCopyInfo = generateUniqueCopyId(bookCopies);
        if (existingCopy && onMoveBookCopy) {
          onMoveBookCopy(
            existingCopy.copyId,
            moveTargetShelf,
            moveTargetLevel,
            moveReason.trim() || 'جابه‌جایی قفسه در بازبینی میدانی'
          );
        } else if (onAddBookCopy) {
          const newCopyId = generatedCopyInfo.copyId;
          const nowFa = new Date().toLocaleDateString('fa-IR');
          const createdCopy: BookCopyRecord = {
            copyId: newCopyId,
            bookId: selectedBookDossier.bookId,
            bookTitle: selectedBookDossier.title,
            copyStatus: 'verified_present',
            shelf: moveTargetShelf,
            level: moveTargetLevel,
            location: newLocation,
            observedDate: nowFa,
            physicalCondition: 'healthy',
            loanOrMoveStatus: 'در قفسه مرکز اسناد',
            expertNote: selectedBookDossier.notes || '',
            lastReviewedAt: nowFa,
            locationHistory: [
              {
                fromLocation: prevLocation,
                toLocation: newLocation,
                movedAt: nowFa,
                movedBy: 'کارشناس کتابخانه',
                reason: moveReason.trim() || 'جابه‌جایی قفسه در بازبینی میدانی'
              }
            ]
          };
          onAddBookCopy(createdCopy);
        }

        // به‌روزرسانی محل نگهداری در رکورد ممیزی کتاب برای هماهنگی کامل با تاریخچه نسخه
        const existingAudit = auditRecords[selectedBookDossier.rowKey];
        const catRow = catalogRows.find((r) => r.tempBookId === selectedBookDossier.bookId);
        const updatedAudit: FieldAuditRecord = {
          key: selectedBookDossier.rowKey,
          sheet: existingAudit?.sheet || 'فهرست کتاب‌ها',
          tempBookId: selectedBookDossier.bookId,
          copyId:
            existingCopy?.copyId ||
            existingAudit?.copyId ||
            generatedCopyInfo.copyId,
          title: selectedBookDossier.title,
          author: selectedBookDossier.author === 'ثبت‌نشده' ? '' : selectedBookDossier.author,
          publisher:
            selectedBookDossier.publisher === 'ثبت‌نشده' ? '' : selectedBookDossier.publisher,
          year: selectedBookDossier.year === '—' ? '' : selectedBookDossier.year,
          edition: selectedBookDossier.edition === '—' ? '' : selectedBookDossier.edition,
          isbn: selectedBookDossier.isbn === '—' ? '' : selectedBookDossier.isbn,
          fipa: selectedBookDossier.fipa === '—' ? '' : selectedBookDossier.fipa,
          registrationNo:
            selectedBookDossier.registrationNo === '—' ? '' : selectedBookDossier.registrationNo,
          descriptionRaw:
            selectedBookDossier.description === '—' ? '' : selectedBookDossier.description,
          category:
            selectedBookDossier.category === '—'
              ? SUBJECT_CATEGORIES[0].label
              : selectedBookDossier.category,
          source: selectedBookDossier.isNewRegistration ? 'outside-list' : 'catalog',
          physical:
            selectedBookDossier.physicalStatus === 'unchecked'
              ? 'verified'
              : selectedBookDossier.physicalStatus,
          copyStatus: 'verified_present',
          shelf: moveTargetShelf,
          level: moveTargetLevel,
          location: newLocation,
          countedCopies: selectedBookDossier.countedCopies || '1',
          checkedBy: existingAudit?.checkedBy || 'کارشناس کتابخانه',
          notes: selectedBookDossier.notes || '',
          backupSourceSheet: existingAudit?.backupSourceSheet || catRow?.backupSourceSheet,
          backupSourceRow: existingAudit?.backupSourceRow || catRow?.backupSourceRow,
          updatedAt: new Date().toISOString()
        };
        onSaveVoiceOrQuickBook(updatedAudit);
        setLastInteractedDossierId(selectedBookDossier.dossierId);
        setIsMovingDossierShelf(false);
        onNotify(`✅ قفسه کتاب «${selectedBookDossier.title}» به «${newLocation}» منتقل شد و در تاریخچه نسخه ثبت گردید.`);
      }
    });
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

    if (statModalSubFilter === 'tehran_martyrs') {
      baseList = baseList.filter((d) => d.hasTehranMartyr);
    } else if (statModalSubFilter === 'single_martyr') {
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

    const words = q.split(' ').filter(Boolean);
    return baseList.filter((d) => {
      const hay = dossierSearchHaystackMap.get(d.dossierId) || '';
      return words.every((w) => hay.includes(w));
    });
  }, [
    activeStatGroupModal,
    allDossiers,
    newRegisteredDossiers,
    determinedDossiers,
    martyrLinkedDossiers,
    statModalSubFilter,
    statModalSearchQuery,
    dossierSearchHaystackMap
  ]);

  const displayedStatModalDossiers = useMemo(() => {
    if (filteredStatModalDossiers.length <= statModalVisibleLimit) {
      return filteredStatModalDossiers;
    }
    if (lastInteractedDossierId) {
      const targetIdx = filteredStatModalDossiers.findIndex(
        (d) => d.dossierId === lastInteractedDossierId
      );
      if (targetIdx >= statModalVisibleLimit) {
        return filteredStatModalDossiers.slice(0, targetIdx + 25);
      }
    }
    return filteredStatModalDossiers.slice(0, statModalVisibleLimit);
  }, [filteredStatModalDossiers, statModalVisibleLimit, lastInteractedDossierId]);

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
      title: 'پرسش دوم: تأیید نهایی ثبت کتاب جدید',
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
          notes: 'ثبت جدید از صفحه اصلی (در انتظار تأیید کارشناس)',
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

    const words = q.split(' ').filter(Boolean);
    const matchedDossiers: UnifiedBookDossier[] = [];
    for (const d of allDossiers) {
      const hay = dossierSearchHaystackMap.get(d.dossierId) || '';
      if (words.every((w) => hay.includes(w))) {
        matchedDossiers.push(d);
        if (matchedDossiers.length >= 12) break;
      }
    }

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
  }, [globalQuery, allDossiers, dossierSearchHaystackMap, customMartyrs, workbookMartyrs, links]);

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
              <span>+ ثبت کتاب جدید</span>
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

        {/* نتایج جست‌وجوی فوری با دسترسی مستقیم به پرونده کامل کتاب و شهید */}
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
                          <div className="font-bold text-[#332218] flex items-center gap-1.5 flex-wrap">
                            <span className="truncate">{d.title}</span>
                            {d.hasTehranMartyr && <TehranMartyrBadge size="xs" />}
                          </div>
                          <div className="text-[11px] text-[#6E5846] truncate">
                            {d.publisher} · {toPersianDigits(d.martyrRelations.length)} شهید مرتبط
                            {d.locationCode ? ` · ${d.locationCode}` : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setLastInteractedDossierId(d.dossierId);
                            setIsEditingDossierBook(false);
                            setEditingRelationLinkId(null);
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
                    {searchResults.matchedLinks.map((l) => {
                      const isTehranLink = evaluateMartyrTehranStatus({
                        martyrName: l.martyrNameRaw,
                        gravePiece: l.gravePieceRaw,
                        graveRow: l.graveRowRaw,
                        graveNumber: l.graveNumberRaw,
                        sourceDesc: l.sourceDescriptionRaw,
                        reviewerNote: l.reviewerNote,
                        reviewStatus: l.reviewStatus,
                        isGroupPhrase: l.isGroupPhrase
                      }).isTehran;
                      return (
                        <div
                          key={l.id}
                          className="py-2 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <button
                                type="button"
                                onClick={() => setSelectedMartyrDossierName(l.martyrNameRaw)}
                                className="font-bold text-[#6B3E26] hover:underline truncate text-right cursor-pointer"
                              >
                                {l.martyrNameRaw}
                              </button>
                              {isTehranLink && <TehranMartyrBadge size="xs" />}
                            </div>
                            <div className="text-[11px] text-[#6E5846] flex items-center gap-1 flex-wrap">
                              <span className="truncate">
                                کتاب «{l.bookTitleRaw}»{' '}
                                {l.pageReferenceRaw ? `(ص ${l.pageReferenceRaw})` : ''}
                              </span>
                              {isTehranLink && <TehranMartyrBadge size="xs" />}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => setSelectedMartyrDossierName(l.martyrNameRaw)}
                              className="px-2 py-1 text-[11px] bg-white hover:bg-[#FAF5EE] text-[#332218] border border-[#D8C7B2] font-bold rounded-lg cursor-pointer"
                            >
                              پرونده شهید
                            </button>
                            <button
                              type="button"
                              onClick={() => openBookDossierByTitleOrId(l.tempBookId || l.bookTitleRaw)}
                              className="px-2.5 py-1 text-[11px] bg-[#FAF5EE] hover:bg-[#F3E9DC] text-[#6B3E26] border border-[#D8C7B2] font-bold rounded-lg cursor-pointer"
                            >
                              پرونده کتاب
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {searchResults.matchedMartyrs.slice(0, 3).map((m) => {
                      const isTehranM = evaluateMartyrTehranStatus({
                        martyrName: m.fullNameSearch,
                        gravePiece: m.piece,
                        graveRow: m.graveRow,
                        graveNumber: m.graveNumber
                      }).isTehran;
                      return (
                        <div
                          key={m.tempPersonId}
                          className="py-2 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setSelectedMartyrDossierName(m.fullNameSearch)}
                              className="font-bold text-[#332218] hover:underline cursor-pointer"
                            >
                              {m.fullNameSearch}
                            </button>
                            {isTehranM && <TehranMartyrBadge size="xs" />}
                            <span className="text-[#6E5846] text-[11px]">
                              (قطعه {m.piece || '—'})
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedMartyrDossierName(m.fullNameSearch)}
                            className="px-2 py-1 text-[11px] bg-[#FAF5EE] text-[#6B3E26] border border-[#D8C7B2] font-bold rounded-lg shrink-0 cursor-pointer"
                          >
                            پرونده شهید
                          </button>
                        </div>
                      );
                    })}
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
          data-testid="stat-card-all-books"
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
          <div className="text-[11px] text-[#6E5846] border-t border-[#EFE5D8] pt-2 leading-relaxed">
            پایه پژوهشی: {toPersianDigits(statsComposition.baseResearchCount)} · کاتالوگ تعیین‌تکلیف‌شده:{' '}
            {toPersianDigits(statsComposition.determinedCatalogWithoutMartyrCount)} · ثبت جدید:{' '}
            {toPersianDigits(statsComposition.newCount)}
          </div>
        </button>

        {/* کارت ۲: ثبت‌های جدید */}
        <button
          type="button"
          data-testid="stat-card-new-books"
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
          data-testid="stat-card-determined-books"
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
            پژوهشی: {toPersianDigits(statsComposition.determinedInResearchCount)} · کاتالوگ:{' '}
            {toPersianDigits(statsComposition.determinedCatalogWithoutMartyrCount)} · ثبت جدید:{' '}
            {toPersianDigits(statsComposition.newCount)}
          </div>
        </button>
      </section>

      {/* ۳. بخش خلوت‌شده پایین صفحه اصلی: فقط «پشتیبانی و گزارش‌ها» + «فهرست ثبت‌های قفسه ذخیره‌شده در حافظه دستگاه» */}
      <section aria-label="پشتیبانی و ثبت‌های قفسه دستگاه" className="space-y-4">
        <div className="bg-white border border-[#D8C7B2] rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-[#FAF5EE] border border-[#E2D2BE] flex items-center justify-center text-[#6B3E26] shrink-0">
              <Layers className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-[#332218]">پشتیبانی و گزارش‌ها</div>
              <div className="text-[11px] text-[#6E5846]">
                پشتیبان کامل JSON، خروجی‌های اکسل و گزارش‌های ۱۶گانه
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('management')}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#6B3E26] hover:bg-[#56311E] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <span>ورود به پشتیبانی و گزارش‌ها</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* فهرست ثبت‌های قفسه ذخیره‌شده در حافظه دستگاه (به‌صورت جمع‌شونده / Accordion و در حالت پیش‌فرض بسته) */}
        <div
          data-testid="saved-shelf-records-section"
          className="bg-white border border-[#D8C7B2] rounded-2xl p-4 space-y-3 shadow-2xs"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <button
              type="button"
              data-testid="saved-shelf-accordion-toggle"
              aria-expanded={isSavedShelfSectionOpen}
              onClick={() => setIsSavedShelfSectionOpen((prev) => !prev)}
              className="flex-1 flex items-center justify-between gap-3 text-right cursor-pointer group"
            >
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-[#332218] group-hover:text-[#6B3E26] transition-colors flex items-center gap-2">
                  <span>
                    فهرست ثبت‌های قفسه ذخیره‌شده در حافظه دستگاه ({toPersianDigits(Object.keys(auditRecords).length)} مورد)
                  </span>
                </h3>
                <p className="text-[11px] text-[#6E5846] mt-0.5">
                  شامل تمام کتاب‌های تعیین‌تکلیف‌شده در قفسه‌ها و ثبت‌های جدید ذخیره‌شده روی این دستگاه (برای مشاهده یا بستن کلیک کنید)
                </p>
              </div>
              <span className="px-2.5 py-1.5 rounded-xl bg-[#FAF5EE] border border-[#D8C7B2] text-[#6B3E26] text-[11px] font-bold inline-flex items-center gap-1 shrink-0">
                <span>{isSavedShelfSectionOpen ? 'بستن فهرست' : 'مشاهده فهرست'}</span>
                {isSavedShelfSectionOpen ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </span>
            </button>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                data-testid="saved-shelf-excel-export-btn"
                onClick={() => {
                  exportShelfAuditRecordsToExcel(
                    savedDeviceAuditRecords,
                    'فهرست_ثبت_های_قفسه_ذخیره_شده',
                    {
                      catalogRows,
                      auditRecords,
                      bookCopies,
                      links,
                      extractedItems,
                      customMartyrs,
                      workbookMartyrs
                    }
                  );
                }}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#2E6F40] hover:bg-[#235732] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
                <span>خروجی Excel ({toPersianDigits(savedDeviceAuditRecords.length)})</span>
              </button>
            </div>
          </div>

          {isSavedShelfSectionOpen && (
            <div className="space-y-3 border-t border-[#EFE5D8] pt-3">
              {Object.keys(auditRecords).length > 0 && (
                <div className="relative">
                  <Search className="w-4 h-4 text-[#6E5846] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={savedShelfSearchQuery}
                    onChange={(e) => setSavedShelfSearchQuery(e.target.value)}
                    placeholder="جست‌وجو در ثبت‌های قفسه ذخیره‌شده (عنوان کتاب، کد قفسه، نویسنده، ناشر)..."
                    className="w-full min-h-[38px] pr-9 pl-3 py-1.5 text-xs bg-[#FAF5EE] border border-[#D8C7B2] rounded-xl focus:outline-none focus:border-[#6B3E26] focus:bg-white text-[#332218]"
                  />
                </div>
              )}

              {savedDeviceAuditRecords.length === 0 ? (
                <div className="p-4 text-center bg-[#FAF5EE] rounded-xl text-xs text-[#6E5846]">
                  {Object.keys(auditRecords).length === 0
                    ? 'هنوز هیچ ثبت قفسه‌ای در حافظه این دستگاه ذخیره نشده است.'
                    : 'موردی منطبق با عبارت جست‌وجو در ثبت‌های قفسه یافت نشد.'}
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto divide-y divide-[#EFE5D8] border border-[#E2D2BE] rounded-xl bg-white">
                  {savedDeviceAuditRecords.slice(0, 60).map((rec, idx) => (
                    <div
                      key={rec.key}
                      className="p-2.5 sm:p-3 hover:bg-[#FAF5EE] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#FAF5EE] border border-[#D8C7B2] text-[#6B3E26]">
                            {toPersianDigits(idx + 1)}
                          </span>
                          <span className="font-bold text-[#332218] break-words">{rec.title}</span>
                          <span className="font-mono text-[11px] text-[#6E5846]" dir="ltr">
                            ({rec.tempBookId})
                          </span>
                          {rec.source === 'outside-list' && (
                            <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-900 font-bold text-[10.5px]">
                              ثبت جدید
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#5C4636]">
                          {rec.location && (
                            <span className="font-mono font-bold px-2 py-0.5 rounded bg-[#EDF6F0] text-[#1E4D2B] border border-[#A8D5B5]">
                              محل: {rec.location}
                            </span>
                          )}
                          {rec.category && <span>دسته: {rec.category}</span>}
                          {rec.publisher && <span>· ناشر: {rec.publisher}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => openBookDossierByTitleOrId(rec.tempBookId || rec.title)}
                          className="px-2.5 py-1 rounded-lg bg-[#6B3E26] hover:bg-[#56311E] text-white font-bold text-[11px] cursor-pointer"
                        >
                          پرونده کتاب
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* بخش مستقل انتقال و نگهداری اطلاعات کتابخانه با JSON (به‌صورت جمع‌شونده / Accordion و در حالت پیش‌فرض بسته) */}
      {fullOperationalState && onApplyMergedSystemState && (
        <section
          data-testid="json-transfer-accordion-wrapper"
          className="bg-white border border-[#D8C7B2] rounded-2xl p-4 space-y-3 shadow-2xs"
        >
          <button
            type="button"
            data-testid="json-transfer-accordion-toggle"
            aria-expanded={isJsonTransferSectionOpen}
            onClick={() => setIsJsonTransferSectionOpen((prev) => !prev)}
            className="w-full flex items-center justify-between gap-3 text-right cursor-pointer group"
          >
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[#332218] group-hover:text-[#6B3E26] transition-colors">
                انتقال و نگهداری اطلاعات کتابخانه
              </h3>
              <p className="text-[11px] text-[#6E5846] mt-0.5">
                خروجی کامل JSON، ورود و ادغام امن فایل بین رایانه و گوشی و نقاط بازیابی خودکار (برای باز و بسته کردن کلیک کنید)
              </p>
            </div>
            <span className="px-2.5 py-1.5 rounded-xl bg-[#FAF5EE] border border-[#D8C7B2] text-[#6B3E26] text-[11px] font-bold inline-flex items-center gap-1 shrink-0">
              <span>{isJsonTransferSectionOpen ? 'بستن بخش انتقال' : 'باز کردن بخش انتقال'}</span>
              {isJsonTransferSectionOpen ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </span>
          </button>

          {isJsonTransferSectionOpen && (
            <div className="border-t border-[#EFE5D8] pt-3">
              <JsonSystemTransferSection
                fullOperationalState={fullOperationalState}
                catalogRows={catalogRows}
                onApplyMergedState={onApplyMergedSystemState}
                onNotify={onNotify}
              />
            </div>
          )}
        </section>
      )}

      {/* پنجره ۱: فهرست کتاب‌های هر گروه آماری پس از کلیک روی کارت آماری (حفظ فیلتر و اسکرول هنگام باز و بسته شدن پرونده کتاب) */}
      {activeStatGroupModal && (
        <ModalWindow
          onClose={() => setActiveStatGroupModal(null)}
          title={getStatModalTitle(activeStatGroupModal)}
          maxWidthClass="max-w-4xl"
        >
          <div className="space-y-3">
            {/* کادر خلاصه ۴بخشی ترکیب مجموعه کتاب‌ها (محاسبه‌شده مستقیم از همان دیتاست فهرست، بدون متن طولانی) */}
            <div className="bg-[#FAF5EE] border border-[#D8C7B2] rounded-xl p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 text-xs text-[#332218]">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1">
                <div className="bg-white border border-[#E2D2BE] rounded-lg px-2.5 py-1.5">
                  <div className="text-[10.5px] text-[#5C4636]">۱. پایه پژوهشی دارای ارتباط با شهدا</div>
                  <div className="font-mono font-bold text-sm text-[#6B3E26]" data-testid="stat-breakdown-base">
                    {toPersianDigits(statsComposition.baseResearchCount)} عنوان
                  </div>
                </div>
                <div className="bg-white border border-[#E2D2BE] rounded-lg px-2.5 py-1.5">
                  <div className="text-[10.5px] text-[#5C4636]">۲. کاتالوگ تعیین‌تکلیف‌شده در قفسه</div>
                  <div className="font-mono font-bold text-sm text-[#332218]" data-testid="stat-breakdown-catalog">
                    {toPersianDigits(statsComposition.determinedCatalogWithoutMartyrCount)} عنوان
                  </div>
                </div>
                <div className="bg-white border border-[#E2D2BE] rounded-lg px-2.5 py-1.5">
                  <div className="text-[10.5px] text-[#5C4636]">۳. کتاب‌های جدید خارج از فهرست اولیه</div>
                  <div className="font-mono font-bold text-sm text-amber-800" data-testid="stat-breakdown-new">
                    {toPersianDigits(statsComposition.newCount)} عنوان
                  </div>
                </div>
                <div className="bg-[#EDF6F0] border border-[#A8D5B5] rounded-lg px-2.5 py-1.5">
                  <div className="text-[10.5px] text-[#1E4D2B] font-bold">۴. مجموع پرونده‌های یکتای کتاب</div>
                  <div className="font-mono font-bold text-sm text-[#2E6F40]" data-testid="stat-breakdown-total">
                    {toPersianDigits(statsComposition.totalUniqueCount)} عنوان یکتا
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  data-testid="stat-modal-new-book-btn"
                  onClick={() => setShowQuickBookModal(true)}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#6B3E26] hover:bg-[#56311E] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <PlusCircle className="w-4 h-4 shrink-0" />
                  <span>+ ثبت کتاب جدید</span>
                </button>

                <button
                  type="button"
                  data-testid="stat-modal-excel-export-btn"
                  onClick={() => {
                    const listTitle = `${getStatModalTitle(activeStatGroupModal)} (${statModalSubFilter})`;
                    exportBookDossiersToExcel(
                      filteredStatModalDossiers,
                      listTitle,
                      `فهرست_کتاب_ها_${activeStatGroupModal}_${statModalSubFilter}`,
                      {
                        catalogRows,
                        auditRecords,
                        bookCopies,
                        links,
                        extractedItems,
                        customMartyrs,
                        workbookMartyrs
                      }
                    );
                  }}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#2E6F40] hover:bg-[#235732] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <FileSpreadsheet className="w-4 h-4 shrink-0" />
                  <span>خروجی Excel ({toPersianDigits(filteredStatModalDossiers.length)})</span>
                </button>
              </div>
            </div>

            {/* نوار جست‌وجو درون فهرست */}
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

            {/* فیلتر شیت پژوهشی و وضعیت ارتباط (شامل فیلتر اختصاصی شهدای تهرانی گلزار تهران) */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {(
                [
                  { id: 'all', label: 'همه موارد' },
                  { id: 'tehran_martyrs', label: 'شهدای تهرانی (گلزار تهران)' },
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
              <span>برای مشاهده و ویرایش پرونده کامل، روی هر کتاب کلیک کنید</span>
            </div>

            {/* فهرست کتاب‌ها */}
            {filteredStatModalDossiers.length === 0 ? (
              <div className="p-8 text-center bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl text-xs text-[#5C4636] space-y-2">
                <div>کتابی در این بخش یافت نشد.</div>
                <button
                  type="button"
                  onClick={() => setShowQuickBookModal(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-[#6B3E26] text-white font-bold text-xs cursor-pointer"
                >
                  + ثبت کتاب جدید
                </button>
              </div>
            ) : (
              <div
                ref={statListScrollRef}
                onScroll={(e) => {
                  const target = e.currentTarget;
                  saveHomeDossierNavSnapshot({ statModalScrollTop: target.scrollTop });
                  if (
                    displayedStatModalDossiers.length < filteredStatModalDossiers.length &&
                    target.scrollTop + target.clientHeight >= target.scrollHeight - 240
                  ) {
                    setStatModalVisibleLimit((prev) =>
                      Math.min(filteredStatModalDossiers.length, prev + 80)
                    );
                  }
                }}
                className="max-h-[58vh] overflow-y-auto border border-[#E2D2BE] rounded-xl divide-y divide-[#EFE5D8] bg-white"
              >
                {displayedStatModalDossiers.map((dossier, idx) => {
                  const isHighlighted =
                    lastInteractedDossierId === dossier.dossierId ||
                    selectedBookDossierId === dossier.dossierId;
                  return (
                    <div
                      id={`stat-dossier-row-${dossier.dossierId}`}
                      key={dossier.dossierId}
                      onClick={() => {
                        if (statListScrollRef.current) {
                          saveHomeDossierNavSnapshot({
                            statModalScrollTop: statListScrollRef.current.scrollTop
                          });
                        }
                        setLastInteractedDossierId(dossier.dossierId);
                        setIsEditingDossierBook(false);
                        setIsMovingDossierShelf(false);
                        setEditingRelationLinkId(null);
                        setSelectedBookDossierId(dossier.dossierId);
                        setShowOriginalExcelModal(false);
                      }}
                      className={`p-3 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer ${
                        isHighlighted
                          ? 'bg-emerald-50/70 ring-2 ring-inset ring-[#2E6F40]'
                          : 'hover:bg-[#FAF5EE]'
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-[#FAF5EE] border border-[#D8C7B2] font-mono text-[11px] text-[#6B3E26]">
                            {toPersianDigits(idx + 1)}
                          </span>
                          <span className="font-bold text-sm text-[#332218] break-words">
                            {dossier.title}
                          </span>
                          {dossier.hasTehranMartyr && <TehranMartyrBadge size="sm" />}
                          {dossier.alternativeTitle && (
                            <span className="text-[11px] text-[#6E5846]">
                              ({dossier.alternativeTitle})
                            </span>
                          )}
                          <span className="font-mono text-[11px] text-[#6E5846]">
                            {dossier.bookId}
                          </span>
                          {isHighlighted && (
                            <span className="px-2 py-0.5 rounded bg-[#2E6F40] text-white text-[10px] font-bold">
                              آخرین کتاب مشاهده/ویرایش‌شده
                            </span>
                          )}
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
                            if (statListScrollRef.current) {
                              saveHomeDossierNavSnapshot({
                                statModalScrollTop: statListScrollRef.current.scrollTop
                              });
                            }
                            setLastInteractedDossierId(dossier.dossierId);
                            setIsEditingDossierBook(false);
                            setIsMovingDossierShelf(false);
                            setEditingRelationLinkId(null);
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
                  );
                })}
                {displayedStatModalDossiers.length < filteredStatModalDossiers.length && (
                  <div className="p-3 bg-[#FAF5EE] text-center">
                    <button
                      type="button"
                      onClick={() =>
                        setStatModalVisibleLimit(filteredStatModalDossiers.length)
                      }
                      className="px-4 py-2 rounded-xl bg-white border border-[#D8C7B2] hover:bg-[#F3E9DC] text-xs font-bold text-[#6B3E26] cursor-pointer shadow-2xs"
                    >
                      نمایش ادامه فهرست ({toPersianDigits(
                        filteredStatModalDossiers.length - displayedStatModalDossiers.length
                      )}{' '}
                      عنوان باقی‌مانده)
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </ModalWindow>
      )}

      {/* پنجره ۲: پرونده اختصاصی هر کتاب (با مدیریت و ویرایش کامل مشخصات، وضعیت قفسه، شهدای مرتبط و مستندات در همان پرونده) */}
      {selectedBookDossier && (
        <ModalWindow
          onClose={() => {
            const keepId = selectedBookDossier.dossierId;
            setLastInteractedDossierId(keepId);
            setIsEditingDossierBook(false);
            setIsMovingDossierShelf(false);
            setEditingRelationLinkId(null);
            setSelectedBookDossierId(null);
            setShowOriginalExcelModal(false);
          }}
          title={`پرونده اختصاصی کتاب: ${selectedBookDossier.title}`}
          maxWidthClass="max-w-3xl"
        >
          <div className="space-y-4 text-xs text-[#332218]">
            {/* نوار ابزار بالای پرونده کتاب: دکمه ویرایش کامل در همان پرونده + خروجی اکسل */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#EDF6F0] border border-[#A8D5B5] rounded-xl p-2.5">
              <div className="flex items-center gap-2 text-[#1E4D2B] font-bold">
                <BookOpen className="w-4 h-4 shrink-0" />
                <span>مدیریت یکپارچه پرونده کتاب (بدون خروج از فهرست قبلی)</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!isEditingDossierBook ? (
                  <button
                    type="button"
                    data-testid="dossier-edit-book-btn"
                    onClick={() => startEditingBookDossier(selectedBookDossier)}
                    className="px-3 py-1.5 rounded-xl bg-[#6B3E26] hover:bg-[#56311E] text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>ویرایش مشخصات، وضعیت و قفسه کتاب</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditingDossierBook(false)}
                    className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-700 font-bold text-xs inline-flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>انصراف از ویرایش</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    exportBookDossiersToExcel(
                      [selectedBookDossier],
                      `پرونده کتاب ${selectedBookDossier.title}`,
                      `پرونده_کتاب_${selectedBookDossier.bookId}`,
                      {
                        catalogRows,
                        auditRecords,
                        bookCopies,
                        links,
                        extractedItems,
                        customMartyrs,
                        workbookMartyrs
                      }
                    );
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#2E6F40] hover:bg-[#235732] text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>خروجی Excel این کتاب</span>
                </button>
              </div>
            </div>

            {/* فرم ویرایش درون‌جای مشخصات کتاب، وضعیت ثبت و محل نگهداری */}
            {isEditingDossierBook ? (
              <form
                onSubmit={handleSaveDossierBookEdit}
                className="bg-[#FAF5EE] border-2 border-[#6B3E26] rounded-2xl p-4 space-y-3.5"
              >
                <div className="font-bold text-sm text-[#332218] border-b border-[#E2D2BE] pb-2 flex items-center justify-between">
                  <span>ویرایش مشخصات، وضعیت تعیین‌تکلیف و قفسه ({selectedBookDossier.bookId})</span>
                  <span className="text-[11px] text-[#6B3E26] font-normal">
                    ذخیره روی همین رکورد بدون ساخت رکورد تکراری
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-[#332218] mb-1">عنوان کتاب *</label>
                    <input
                      type="text"
                      required
                      value={editBookTitle}
                      onChange={(e) => setEditBookTitle(e.target.value)}
                      className="w-full min-h-[38px] px-3 py-1.5 bg-white border border-[#D8C7B2] rounded-xl font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-[#332218] mb-1">نویسنده / گردآورنده</label>
                    <input
                      type="text"
                      value={editBookAuthor}
                      onChange={(e) => setEditBookAuthor(e.target.value)}
                      className="w-full min-h-[38px] px-3 py-1.5 bg-white border border-[#D8C7B2] rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-[#332218] mb-1">ناشر</label>
                    <input
                      type="text"
                      value={editBookPublisher}
                      onChange={(e) => setEditBookPublisher(e.target.value)}
                      className="w-full min-h-[38px] px-3 py-1.5 bg-white border border-[#D8C7B2] rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-[#332218] mb-1">دسته موضوعی</label>
                    <select
                      value={editBookCategory}
                      onChange={(e) => setEditBookCategory(e.target.value)}
                      className="w-full min-h-[38px] px-2.5 py-1.5 bg-white border border-[#D8C7B2] rounded-xl"
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
                      <label className="block font-bold text-[#332218] mb-1">سال چاپ</label>
                      <input
                        type="text"
                        value={editBookYear}
                        onChange={(e) => setEditBookYear(e.target.value)}
                        className="w-full min-h-[38px] px-2.5 py-1.5 bg-white border border-[#D8C7B2] rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-[#332218] mb-1">نوبت چاپ</label>
                      <input
                        type="text"
                        value={editBookEdition}
                        onChange={(e) => setEditBookEdition(e.target.value)}
                        className="w-full min-h-[38px] px-2.5 py-1.5 bg-white border border-[#D8C7B2] rounded-xl"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-bold text-[#332218] mb-1">شابک (ISBN)</label>
                    <input
                      type="text"
                      value={editBookIsbn}
                      onChange={(e) => setEditBookIsbn(e.target.value)}
                      className="w-full min-h-[38px] px-2.5 py-1.5 bg-white border border-[#D8C7B2] rounded-xl font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-[#332218] mb-1">شماره فیپا</label>
                    <input
                      type="text"
                      value={editBookFipa}
                      onChange={(e) => setEditBookFipa(e.target.value)}
                      className="w-full min-h-[38px] px-2.5 py-1.5 bg-white border border-[#D8C7B2] rounded-xl font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-[#332218] mb-1">شماره ثبت</label>
                      <input
                        type="text"
                        value={editBookRegNo}
                        onChange={(e) => setEditBookRegNo(e.target.value)}
                        className="w-full min-h-[38px] px-2.5 py-1.5 bg-white border border-[#D8C7B2] rounded-xl font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-[#332218] mb-1">تعداد نسخه</label>
                      <input
                        type="text"
                        value={editBookCopies}
                        onChange={(e) => setEditBookCopies(e.target.value)}
                        className="w-full min-h-[38px] px-2.5 py-1.5 bg-white border border-[#D8C7B2] rounded-xl font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* وضعیت ثبت و تعیین‌تکلیف + قفسه و طبقه */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white border border-[#E2D2BE] rounded-xl p-3">
                  <div>
                    <label className="block font-bold text-[#6B3E26] mb-1">
                      وضعیت ثبت و تعیین‌تکلیف
                    </label>
                    <select
                      value={editBookPhysical}
                      onChange={(e) =>
                        setEditBookPhysical(e.target.value as 'verified' | 'review' | 'not_found')
                      }
                      className="w-full min-h-[38px] px-2.5 py-1.5 bg-[#FAF5EE] border border-[#D8C7B2] rounded-xl font-bold"
                    >
                      <option value="verified">موجود در قفسه (تأییدشده)</option>
                      <option value="review">نیازمند بررسی</option>
                      <option value="not_found">مشاهده‌نشده در قفسه</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-[#6B3E26] mb-1">قفسه نگهداری</label>
                    <select
                      value={editBookShelf}
                      onChange={(e) => setEditBookShelf(e.target.value as ShelfCode | '')}
                      className="w-full min-h-[38px] px-2.5 py-1.5 bg-[#FAF5EE] border border-[#D8C7B2] rounded-xl font-mono font-bold"
                    >
                      <option value="">بدون قفسه</option>
                      {SHELVES.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.code} ({s.title})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-[#6B3E26] mb-1">طبقه / ردیف قفسه</label>
                    <select
                      value={editBookLevel}
                      onChange={(e) => setEditBookLevel(e.target.value as LevelCode | '')}
                      className="w-full min-h-[38px] px-2.5 py-1.5 bg-[#FAF5EE] border border-[#D8C7B2] rounded-xl font-mono font-bold"
                    >
                      <option value="">بدون طبقه</option>
                      {LEVELS.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.code} ({l.title})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-[#332218] mb-1">
                      توضیحات و اطلاعات شناسنامه‌ای کتاب
                    </label>
                    <textarea
                      rows={2}
                      value={editBookDescription}
                      onChange={(e) => setEditBookDescription(e.target.value)}
                      placeholder="توضیحات کتاب، موضوع یا خلاصه شناسنامه‌ای..."
                      className="w-full p-2.5 bg-white border border-[#D8C7B2] rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-[#332218] mb-1">یادداشت کارشناس</label>
                    <textarea
                      rows={2}
                      value={editBookNotes}
                      onChange={(e) => setEditBookNotes(e.target.value)}
                      placeholder="یادداشت بررسی یا وضعیت فیزیکی نسخه..."
                      className="w-full p-2.5 bg-white border border-[#D8C7B2] rounded-xl"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2D2BE]">
                  <button
                    type="button"
                    onClick={() => setIsEditingDossierBook(false)}
                    className="min-h-[38px] px-4 py-1.5 rounded-xl bg-white border border-[#D8C7B2] text-[#332218] font-bold cursor-pointer"
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    data-testid="dossier-save-book-btn"
                    className="min-h-[38px] px-5 py-1.5 rounded-xl bg-[#2E6F40] hover:bg-[#235732] text-white font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Check className="w-4 h-4" />
                    <span>ذخیره تغییرات پرونده کتاب</span>
                  </button>
                </div>
              </form>
            ) : (
              <>
                {/* بخش ۱ و ۲: عنوان، مشخصات شناسنامه‌ای، نویسنده و ناشر */}
                <div className="bg-[#FAF5EE] border border-[#D8C7B2] rounded-xl p-3.5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#E2D2BE] pb-2.5">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base sm:text-lg font-bold text-[#332218] break-words">
                          {selectedBookDossier.title}
                        </h3>
                        {selectedBookDossier.hasTehranMartyr && <TehranMartyrBadge size="md" />}
                      </div>
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
                      <div className="font-bold mt-0.5 break-words">{selectedBookDossier.author}</div>
                    </div>
                    <div className="bg-white border border-[#E2D2BE] rounded-lg p-2.5">
                      <div className="text-[11px] text-[#6E5846]">ناشر</div>
                      <div className="font-bold mt-0.5 break-words">{selectedBookDossier.publisher}</div>
                    </div>
                    <div className="bg-white border border-[#E2D2BE] rounded-lg p-2.5">
                      <div className="text-[11px] text-[#6E5846]">دسته موضوعی</div>
                      <div className="font-bold mt-0.5 break-words">{selectedBookDossier.category}</div>
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
                      <div className="font-mono font-bold mt-0.5 break-words">
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
                    <div className="bg-white border border-[#E2D2BE] rounded-lg p-2.5 break-words [overflow-wrap:anywhere]">
                      <span className="text-[#6E5846] font-bold ml-1">توضیحات ثبت‌شده کتاب:</span>
                      <span>{selectedBookDossier.description}</span>
                    </div>
                  )}
                </div>

                {/* بخش ۳ و ۴: وضعیت ثبت و تعیین‌تکلیف + محل نگهداری و قفسه */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-white border border-[#D8C7B2] rounded-xl p-3.5 space-y-2">
                    <div className="font-bold text-[#6B3E26] flex items-center justify-between gap-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4" />
                        <span>وضعیت ثبت و تعیین‌تکلیف</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => startEditingBookDossier(selectedBookDossier)}
                        className="text-[11px] text-[#6B3E26] hover:underline font-bold cursor-pointer"
                      >
                        ویرایش وضعیت ✎
                      </button>
                    </div>
                    <div className="text-xs font-bold text-[#332218]">
                      {selectedBookDossier.determinationStatusLabel}
                    </div>
                    {selectedBookDossier.notes && (
                      <div className="text-[11px] text-[#5C4636] break-words">
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
                          <span>حذف ثبت قفسه</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="bg-white border border-[#D8C7B2] rounded-xl p-3.5 space-y-2.5">
                    <div className="font-bold text-[#6B3E26] flex items-center justify-between gap-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="w-4 h-4" />
                        <span>محل نگهداری و قفسه</span>
                      </span>
                      {selectedBookCopies.length > 0 && (
                        <span className="text-[10.5px] font-mono bg-[#FAF5EE] border border-[#E2D2BE] px-2 py-0.5 rounded text-[#6B3E26]">
                          نسخه: {selectedBookCopies.map((c) => c.copyId).join('، ')}
                        </span>
                      )}
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

                    {/* دو دکمه متمایز و شفاف: ۱. اصلاح مشخصات/قفسه کتاب ۲. جابه‌جایی قفسه با ثبت در تاریخچه نسخه */}
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <button
                        type="button"
                        data-testid="dossier-edit-shelf-btn"
                        onClick={() => startEditingBookDossier(selectedBookDossier)}
                        className="px-2.5 py-1 rounded-lg bg-[#6B3E26] hover:bg-[#56311E] text-white font-bold text-[11px] cursor-pointer"
                      >
                        ثبت / اصلاح محل قفسه کتاب
                      </button>

                      <button
                        type="button"
                        data-testid="dossier-move-shelf-btn"
                        onClick={() => {
                          setMoveTargetShelf(
                            (selectedBookDossier.shelf as ShelfCode) || 'SH-01'
                          );
                          setMoveTargetLevel(
                            (selectedBookDossier.level as LevelCode) || 'T01'
                          );
                          setIsMovingDossierShelf((prev) => !prev);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#FAF5EE] hover:bg-[#F3E9DC] border border-[#D8C7B2] text-[#6B3E26] font-bold text-[11px] cursor-pointer"
                      >
                        جابه‌جایی قفسه (با ثبت در تاریخچه نسخه)
                      </button>
                    </div>

                    {/* فرم درون‌جای جابه‌جایی قفسه نسخه فیزیکی */}
                    {isMovingDossierShelf && (
                      <form
                        onSubmit={handleConfirmMoveDossierShelf}
                        className="bg-[#FAF5EE] border border-[#D8C7B2] rounded-xl p-2.5 space-y-2 text-[11px]"
                      >
                        <div className="font-bold text-[#332218]">
                          انتقال نسخه به قفسه یا طبقه جدید (ثبت در تاریخچه نسخه)
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[#5C4636] mb-0.5">قفسه مقصد</label>
                            <select
                              value={moveTargetShelf}
                              onChange={(e) => setMoveTargetShelf(e.target.value as ShelfCode)}
                              className="w-full min-h-[34px] px-2 py-1 bg-white border border-[#D8C7B2] rounded-lg font-mono font-bold"
                            >
                              {SHELVES.map((s) => (
                                <option key={s.code} value={s.code}>
                                  {s.code} ({s.title})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[#5C4636] mb-0.5">طبقه مقصد</label>
                            <select
                              value={moveTargetLevel}
                              onChange={(e) => setMoveTargetLevel(e.target.value as LevelCode)}
                              className="w-full min-h-[34px] px-2 py-1 bg-white border border-[#D8C7B2] rounded-lg font-mono font-bold"
                            >
                              {LEVELS.map((l) => (
                                <option key={l.code} value={l.code}>
                                  {l.code} ({l.title})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-[#5C4636] mb-0.5">علت جابه‌جایی</label>
                          <input
                            type="text"
                            value={moveReason}
                            onChange={(e) => setMoveReason(e.target.value)}
                            placeholder="مثلاً: بازچینی قفسه یا انتقال به طبقه جدید..."
                            className="w-full min-h-[34px] px-2 py-1 bg-white border border-[#D8C7B2] rounded-lg"
                          />
                        </div>
                        <div className="flex justify-end gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => setIsMovingDossierShelf(false)}
                            className="px-2.5 py-1 rounded-lg bg-white border border-[#D8C7B2] font-bold cursor-pointer"
                          >
                            انصراف
                          </button>
                          <button
                            type="submit"
                            className="px-3 py-1 rounded-lg bg-[#2E6F40] text-white font-bold cursor-pointer"
                          >
                            ثبت جابه‌جایی قفسه
                          </button>
                        </div>
                      </form>
                    )}

                    {/* نمایش تاریخچه جابه‌جایی‌های ثبت‌شده برای نسخه فیزیکی این کتاب */}
                    {selectedBookCopies.some((cp) => (cp.locationHistory || []).length > 0) && (
                      <div className="border-t border-[#EFE5D8] pt-2 space-y-1 text-[10.5px]">
                        <div className="font-bold text-[#6B3E26] flex items-center gap-1">
                          <History className="w-3 h-3" />
                          <span>تاریخچه جابه‌جایی قفسه این کتاب:</span>
                        </div>
                        {selectedBookCopies.flatMap((cp) =>
                          (cp.locationHistory || []).map((h, hIdx) => (
                            <div
                              key={`${cp.copyId}-hist-${hIdx}`}
                              className="bg-[#FAF5EE] border border-[#E2D2BE] rounded-lg px-2 py-1 text-[#5C4636]"
                            >
                              <span className="font-mono font-bold text-[#332218]">
                                {h.fromLocation} ← {h.toLocation}
                              </span>{' '}
                              · <span>{h.movedAt}</span>
                              {h.reason ? ` (${h.reason})` : ''}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* بخش ۵ و ۶: شهید یا شهدای مرتبط با کتاب (نام شهید قابل کلیک برای باز شدن پرونده اختصاصی همان شهید + امکان افزودن و ویرایش ارتباط) */}
            <div className="bg-white border border-[#D8C7B2] rounded-xl p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EFE5D8] pb-2">
                <div className="font-bold text-sm text-[#332218] flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-[#6B3E26]" />
                  <span>
                    شهید یا شهدای مرتبط با این کتاب (
                    {toPersianDigits(selectedBookDossier.martyrRelations.length)} مورد)
                  </span>
                </div>
                <button
                  type="button"
                  data-testid="dossier-add-martyr-rel-btn"
                  onClick={() => startEditMartyrRelation()}
                  className="px-2.5 py-1 rounded-lg bg-[#6B3E26] hover:bg-[#56311E] text-white font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>افزودن شهید مرتبط به این کتاب</span>
                </button>
              </div>

              {/* فرم افزودن یا ویرایش ارتباط کتاب و شهید در داخل پرونده کتاب */}
              {editingRelationLinkId && (
                <form
                  onSubmit={handleSaveMartyrRelationInDossier}
                  className="bg-[#FAF5EE] border-2 border-[#6B3E26] rounded-xl p-3.5 space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-[#E2D2BE] pb-2 font-bold text-xs text-[#332218]">
                    <span>
                      {editingRelationLinkId === 'NEW'
                        ? 'افزودن ارتباط شهید جدید به این کتاب'
                        : 'ویرایش مشخصات و مستندات ارتباط شهید با کتاب'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingRelationLinkId(null)}
                      className="text-[#6E5846] hover:text-[#332218] cursor-pointer"
                    >
                      بستن ✕
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block font-bold text-[#332218] mb-1">نام شهید *</label>
                      <input
                        type="text"
                        required
                        value={relMartyrName}
                        onChange={(e) => setRelMartyrName(e.target.value)}
                        placeholder="نام و نام خانوادگی شهید..."
                        className="w-full min-h-[36px] px-2.5 py-1 bg-white border border-[#D8C7B2] rounded-lg font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-[#332218] mb-1">
                        وضعیت ارتباط (بدون تغییر خودکار)
                      </label>
                      <select
                        value={relCertainty}
                        onChange={(e) =>
                          setRelCertainty(e.target.value as MartyrRelationCertainty)
                        }
                        className="w-full min-h-[36px] px-2.5 py-1 bg-white border border-[#D8C7B2] rounded-lg font-bold"
                      >
                        <option value="قطعی">ارتباط قطعی</option>
                        <option value="احتمالی">ارتباط احتمالی</option>
                        <option value="نیازمند بررسی">نیازمند بررسی</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-[#332218] mb-1">
                        شماره صفحه / ارجاع در کتاب
                      </label>
                      <input
                        type="text"
                        value={relPageRef}
                        onChange={(e) => setRelPageRef(e.target.value)}
                        placeholder="مثلاً: ص ۴۵ تا ۵۲"
                        className="w-full min-h-[36px] px-2.5 py-1 bg-white border border-[#D8C7B2] rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <label className="block font-medium text-[#5C4636] mb-1">قطعه مزار</label>
                      <input
                        type="text"
                        value={relGravePiece}
                        onChange={(e) => setRelGravePiece(e.target.value)}
                        className="w-full min-h-[36px] px-2.5 py-1 bg-white border border-[#D8C7B2] rounded-lg tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-[#5C4636] mb-1">ردیف مزار</label>
                      <input
                        type="text"
                        value={relGraveRow}
                        onChange={(e) => setRelGraveRow(e.target.value)}
                        className="w-full min-h-[36px] px-2.5 py-1 bg-white border border-[#D8C7B2] rounded-lg tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-[#5C4636] mb-1">شماره مزار</label>
                      <input
                        type="text"
                        value={relGraveNumber}
                        onChange={(e) => setRelGraveNumber(e.target.value)}
                        className="w-full min-h-[36px] px-2.5 py-1 bg-white border border-[#D8C7B2] rounded-lg tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-medium text-[#5C4636] mb-1">
                        مستندات و توضیحات ارتباط
                      </label>
                      <input
                        type="text"
                        value={relSourceDesc}
                        onChange={(e) => setRelSourceDesc(e.target.value)}
                        placeholder="توضیح ارتباط شهید با کتاب..."
                        className="w-full min-h-[36px] px-2.5 py-1 bg-white border border-[#D8C7B2] rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-[#5C4636] mb-1">
                        یادداشت بررسی کارشناس
                      </label>
                      <input
                        type="text"
                        value={relReviewerNote}
                        onChange={(e) => setRelReviewerNote(e.target.value)}
                        placeholder="یادداشت تکمیلی..."
                        className="w-full min-h-[36px] px-2.5 py-1 bg-white border border-[#D8C7B2] rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditingRelationLinkId(null)}
                      className="px-3 py-1.5 rounded-lg bg-white border border-[#D8C7B2] text-xs font-bold cursor-pointer"
                    >
                      انصراف
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-[#2E6F40] hover:bg-[#235732] text-white text-xs font-bold cursor-pointer"
                    >
                      ذخیره ارتباط شهید
                    </button>
                  </div>
                </form>
              )}

              {selectedBookDossier.martyrRelations.length === 0 ? (
                <div className="p-4 text-center bg-[#FAF5EE] rounded-xl text-xs text-[#6E5846]">
                  برای این کتاب هنوز ارتباط شهیدی ثبت نشده است. با دکمه «افزودن شهید مرتبط به این کتاب» می‌توانید ارتباط را ثبت کنید.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-0.5">
                  {selectedBookDossier.martyrRelations.map((rel, idx) => (
                    <div
                      key={`${rel.linkId}-${idx}`}
                      className="bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl p-3 space-y-2 min-w-0 max-w-full overflow-hidden"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <span className="w-6 h-6 rounded-lg bg-white border border-[#D8C7B2] font-mono text-[11px] font-bold text-[#6B3E26] flex items-center justify-center shrink-0">
                            {toPersianDigits(idx + 1)}
                          </span>
                          {/* نام شهید قابل کلیک برای باز شدن پرونده اختصاصی همان شهید */}
                          <button
                            type="button"
                            data-testid={`dossier-martyr-link-${idx}`}
                            onClick={() => setSelectedMartyrDossierName(rel.martyrName)}
                            className="font-bold text-sm text-[#6B3E26] hover:text-[#332218] underline decoration-[#6B3E26]/50 underline-offset-4 text-right break-words cursor-pointer"
                            title="کلیک برای مشاهده پرونده اختصاصی این شهید"
                          >
                            {rel.martyrName}
                          </button>
                          {rel.isTehranMartyr && <TehranMartyrBadge size="sm" />}
                          <button
                            type="button"
                            onClick={() => setSelectedMartyrDossierName(rel.martyrName)}
                            className="px-2 py-0.5 rounded-md bg-white hover:bg-[#F3E9DC] border border-[#D8C7B2] text-[#6B3E26] text-[10.5px] font-bold cursor-pointer shrink-0"
                          >
                            پرونده شهید ↗
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {renderCertaintyBadge(rel.certainty)}
                          <span className="px-2 py-0.5 rounded bg-white border border-[#D8C7B2] text-[10.5px] text-[#5C4636]">
                            {rel.sourceSheetCategory}
                          </span>
                          <button
                            type="button"
                            onClick={() => startEditMartyrRelation(rel)}
                            className="px-2 py-0.5 rounded bg-white hover:bg-amber-50 border border-[#D8C7B2] text-[#332218] font-bold text-[10.5px] inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3 text-[#6B3E26]" />
                            <span>ویرایش ارتباط</span>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-white border border-[#EFE5D8] rounded-lg p-2 text-[11px] min-w-0 max-w-full">
                        <div className="min-w-0 break-words">
                          <span className="text-[#6E5846]">نشانی مزار: </span>
                          <strong className="text-[#332218]">
                            قطعه {toPersianDigits(rel.gravePiece)} · ردیف{' '}
                            {toPersianDigits(rel.graveRow)} · شماره{' '}
                            {toPersianDigits(rel.graveNumber)}
                          </strong>
                        </div>
                        <div className="min-w-0 break-words [overflow-wrap:anywhere]">
                          <span className="text-[#6E5846]">صفحه / ارجاع در کتاب: </span>
                          <strong className="text-[#6B3E26] break-words [overflow-wrap:anywhere]">
                            {toPersianDigits(rel.pageReference)}
                          </strong>
                        </div>
                        <div className="min-w-0 break-words">
                          <span className="text-[#6E5846]">منبع ثبت: </span>
                          <strong className="text-[#332218]">
                            {rel.sourceFile} (شیت {rel.sourceSheet}، ردیف{' '}
                            {toPersianDigits(rel.sourceExcelRow)})
                          </strong>
                        </div>
                      </div>

                      <div className="text-[11px] text-[#5C4636] leading-relaxed break-words [overflow-wrap:anywhere]">
                        <strong className="text-[#332218]">مستندات و دلیل ارتباط: </strong>
                        {rel.evidenceText}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* مطالب استخراج‌شده مرتبط با کتاب با چیدمان واکنش‌گرا و دکمه باز و بسته شدن متن‌های طولانی */}
              {selectedBookDossier.extractedPassages.length > 0 && (
                <div className="border-t border-[#EFE5D8] pt-2.5 space-y-2 min-w-0 max-w-full overflow-hidden">
                  <div className="font-bold text-xs text-[#6B3E26] flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      گزیده‌ها و مطالب استخراج‌شده از کتاب (
                      {toPersianDigits(selectedBookDossier.extractedPassages.length)} مطلب)
                    </span>
                  </div>
                  <div className="space-y-2 min-w-0 max-w-full">
                    {selectedBookDossier.extractedPassages.map((ex) => {
                      const isExpanded = Boolean(expandedDossierPassageIds[ex.id]);
                      const isLong = (ex.extractedText || '').length > 200;
                      return (
                        <div
                          key={ex.id}
                          className="bg-white border border-[#E2D2BE] rounded-lg p-3 text-[11px] space-y-1.5 min-w-0 max-w-full overflow-hidden"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1.5 font-bold text-[#332218] min-w-0 max-w-full">
                            <span className="break-words [overflow-wrap:anywhere] min-w-0">
                              {ex.passageTitle} ({ex.contentType})
                              {ex.martyrNameRaw ? ` — شهید ${ex.martyrNameRaw}` : ''}
                            </span>
                            <span className="font-mono text-[#6B3E26] bg-[#FAF5EE] border border-[#E2D2BE] px-2 py-0.5 rounded-md break-words [overflow-wrap:anywhere] max-w-full sm:max-w-[45%]">
                              ص {toPersianDigits(ex.pageReferenceRaw)}
                            </span>
                          </div>
                          <div className="text-[#5C4636] leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] min-w-0 max-w-full">
                            {isLong && !isExpanded
                              ? `${ex.extractedText.slice(0, 200)}...`
                              : ex.extractedText}
                          </div>
                          {isLong && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedDossierPassageIds((prev) => ({
                                  ...prev,
                                  [ex.id]: !prev[ex.id]
                                }))
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6B3E26] hover:text-[#332218] bg-[#FAF5EE] px-2.5 py-1 rounded-md border border-[#D8C7B2] cursor-pointer"
                            >
                              {isExpanded ? 'بستن متن کامل ▲' : 'مشاهده ادامه مطلب ▼'}
                            </button>
                          )}
                        </div>
                      );
                    })}
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

      {/* پنجره ۲.۵: پرونده اختصاصی شهید (با کلیک روی نام هر شهید از داخل پرونده کتاب یا جست‌وجو) */}
      {selectedMartyrDossierData && (
        <ModalWindow
          onClose={() => setSelectedMartyrDossierName(null)}
          title={`پرونده اختصاصی شهید: ${selectedMartyrDossierData.fullName}`}
          maxWidthClass="max-w-2xl"
        >
          <div className="space-y-4 text-xs text-[#332218]">
            {/* مشخصات هویتی و مزار شهید */}
            <div className="bg-[#FAF5EE] border border-[#D8C7B2] rounded-xl p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2D2BE] pb-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-[#332218]">
                      {selectedMartyrDossierData.fullName}
                    </h3>
                    {selectedMartyrDossierData.isTehranMartyr && <TehranMartyrBadge size="md" />}
                  </div>
                  <div className="text-[11px] text-[#6E5846] mt-0.5">
                    شناسه پرونده: {selectedMartyrDossierData.personId}
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-white border border-[#D8C7B2] font-bold text-[#6B3E26]">
                  {selectedMartyrDossierData.graveStatus}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 bg-white border border-[#E2D2BE] rounded-lg p-2.5 text-center">
                <div>
                  <span className="text-[11px] text-[#6E5846] block">قطعه مزار</span>
                  <strong className="text-sm font-bold text-[#332218]">
                    {toPersianDigits(selectedMartyrDossierData.piece)}
                  </strong>
                </div>
                <div>
                  <span className="text-[11px] text-[#6E5846] block">ردیف مزار</span>
                  <strong className="text-sm font-bold text-[#332218]">
                    {toPersianDigits(selectedMartyrDossierData.row)}
                  </strong>
                </div>
                <div>
                  <span className="text-[11px] text-[#6E5846] block">شماره مزار</span>
                  <strong className="text-sm font-bold text-[#332218]">
                    {toPersianDigits(selectedMartyrDossierData.number)}
                  </strong>
                </div>
              </div>
            </div>

            {/* فهرست کتاب‌های مرتبط با این شهید */}
            <div className="bg-white border border-[#D8C7B2] rounded-xl p-3.5 space-y-2.5">
              <div className="font-bold text-sm text-[#332218] flex items-center justify-between border-b border-[#EFE5D8] pb-2">
                <span>
                  کتاب‌های مرتبط با این شهید (
                  {toPersianDigits(selectedMartyrDossierData.relatedRelations.length)} کتاب)
                </span>
              </div>

              {selectedMartyrDossierData.relatedRelations.length === 0 ? (
                <div className="p-3 bg-[#FAF5EE] rounded-lg text-[#6E5846] text-center">
                  کتابی برای این شهید در فهرست فعلی ثبت نشده است.
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {selectedMartyrDossierData.relatedRelations.map(({ book, rel }, i) => (
                    <div
                      key={`${book.dossierId}-${i}`}
                      className="p-2.5 rounded-xl bg-[#FAF5EE] border border-[#E2D2BE] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-[#332218]">{book.title}</span>
                          {book.hasTehranMartyr && <TehranMartyrBadge size="xs" />}
                          {renderCertaintyBadge(rel.certainty)}
                        </div>
                        <div className="text-[11px] text-[#5C4636] break-words [overflow-wrap:anywhere]">
                          ناشر: {book.publisher} · صفحه ارجاع: {toPersianDigits(rel.pageReference)}
                          {book.locationCode ? ` · قفسه: ${book.locationCode}` : ''}
                        </div>
                        {rel.evidenceText && (
                          <div className="text-[11px] text-[#6E5846] break-words [overflow-wrap:anywhere]">
                            {rel.evidenceText}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMartyrDossierName(null);
                          setLastInteractedDossierId(book.dossierId);
                          setIsEditingDossierBook(false);
                          setEditingRelationLinkId(null);
                          setSelectedBookDossierId(book.dossierId);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-[#6B3E26] hover:bg-[#56311E] text-white font-bold text-[11px] shrink-0 cursor-pointer"
                      >
                        مشاهده پرونده کتاب
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                data-testid="open-in-all-martyrs-db-btn"
                onClick={() => {
                  // حفظ دقیق وضعیت پرونده شهید، پرونده کتاب و فهرست کتاب‌ها در مخزن ناوبری برای بازگشت مرحله‌به‌مرحله
                  saveHomeDossierNavSnapshot({
                    activeStatGroupModal,
                    statModalSearchQuery,
                    statModalSubFilter,
                    selectedBookDossierId,
                    lastInteractedDossierId,
                    selectedMartyrDossierName: selectedMartyrDossierData.fullName,
                    selectedMartyrDossierId:
                      selectedMartyrDossierData.personId !== 'پرونده پژوهشی شهید'
                        ? selectedMartyrDossierData.personId
                        : null
                  });
                  setMartyrsCrossTabTarget({
                    martyrId:
                      selectedMartyrDossierData.personId !== 'پرونده پژوهشی شهید'
                        ? selectedMartyrDossierData.personId
                        : undefined,
                    fullName: selectedMartyrDossierData.fullName,
                    normalizedName: normalizePersianText(
                      selectedMartyrDossierData.fullName.replace(/^شهید\s+/, '')
                    ),
                    gravePiece:
                      selectedMartyrDossierData.piece !== '—'
                        ? selectedMartyrDossierData.piece
                        : undefined,
                    graveRow:
                      selectedMartyrDossierData.row !== '—'
                        ? selectedMartyrDossierData.row
                        : undefined,
                    graveNumber:
                      selectedMartyrDossierData.number !== '—'
                        ? selectedMartyrDossierData.number
                        : undefined,
                    sourceBookDossierId: selectedBookDossierId,
                    sourceBookTitle: selectedBookDossier?.title,
                    sourceMartyrDossierName: selectedMartyrDossierData.fullName,
                    timestamp: Date.now()
                  });
                  onNavigateTab('martyrs');
                }}
                className="px-3 py-1.5 rounded-xl bg-[#FAF5EE] hover:bg-[#F3E9DC] border border-[#D8C7B2] text-[#6B3E26] font-bold text-xs cursor-pointer"
              >
                باز کردن در بانک جامع پرونده شهدا ↗
              </button>
              <button
                type="button"
                data-testid="back-to-book-dossier-btn"
                onClick={() => setSelectedMartyrDossierName(null)}
                className="px-4 py-1.5 rounded-xl bg-[#6B3E26] text-white font-bold text-xs cursor-pointer"
              >
                بازگشت به پرونده کتاب
              </button>
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
                      <span className="font-bold text-[#332218] text-left break-words">
                        {cell.value}
                      </span>
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
                          <td className="p-2 break-words [overflow-wrap:anywhere]">
                            {toPersianDigits(r.page)}
                          </td>
                          <td className="p-2 break-words [overflow-wrap:anywhere]">{r.desc}</td>
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

      {/* پنجره ۵: ثبت کتاب جدید (قابل دسترس از صفحه اصلی و از داخل تمام فهرست‌ها) */}
      {showQuickBookModal && (
        <ModalWindow
          onClose={() => setShowQuickBookModal(false)}
          title="ثبت کتاب جدید"
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
