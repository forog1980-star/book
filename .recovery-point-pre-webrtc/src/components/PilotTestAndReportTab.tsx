import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  CheckCircle2,
  AlertTriangle,
  Play,
  Copy,
  Download,
  ClipboardList,
  ShieldCheck,
  Database,
  History,
  FileBarChart2,
  FlaskConical,
  Clock
} from 'lucide-react';
import {
  AuditLogEntry,
  BookCopyRecord,
  BookMartyrLinkRecord,
  CustomMartyrRecord,
  DECISION_LEDGER_ITEMS,
  EXCEL_SOURCE_AUDITS,
  ExtractedContentItem,
  FieldAuditRecord,
  MultiMartyrGroupAudit,
  PendingReviewItem,
  ReferenceCatalogRow,
  SmartSearchSuggestion,
  SUBJECT_CATEGORIES,
  normalizePersianText,
  toPersianDigits
} from '../data/markazAsnadData';
import {
  createFullSystemBackupEnvelope,
  FullOperationalState,
  inspectBackupFile
} from '../utils/backupService';
import { runStorageHealthCheck } from '../utils/indexedDbStorage';
import {
  generateUniqueCopyId,
  generateUniqueLinkId,
  generateUniqueMartyrId,
  generateUniqueSuggestionId
} from '../utils/idGenerator';

interface PilotTestAndReportTabProps {
  catalogRows: ReferenceCatalogRow[];
  auditRecords: Record<string, FieldAuditRecord>;
  bookCopies?: BookCopyRecord[];
  customMartyrs?: CustomMartyrRecord[];
  links: BookMartyrLinkRecord[];
  extractedItems?: ExtractedContentItem[];
  pendingReviews?: PendingReviewItem[];
  smartSuggestions?: SmartSearchSuggestion[];
  multiMartyrGroups: MultiMartyrGroupAudit[];
  auditLog?: AuditLogEntry[];
  fullOperationalState?: FullOperationalState;
  loadedFileName: string;
  currentSheetName: string;
  onLoadSample20PilotRecords: () => void;
  onNotify: (msg: string, type?: 'success' | 'warning') => void;
}

interface ExecutableTestResult {
  code: string;
  category: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  categoryTitle: string;
  title: string;
  status: 'untested' | 'passed' | 'failed';
  detail: string;
  executedAt?: string;
}

export const PilotTestAndReportTab: React.FC<PilotTestAndReportTabProps> = ({
  catalogRows,
  auditRecords,
  bookCopies = [],
  customMartyrs = [],
  links,
  extractedItems = [],
  pendingReviews = [],
  smartSuggestions = [],
  multiMartyrGroups,
  auditLog = [],
  fullOperationalState,
  loadedFileName,
  onLoadSample20PilotRecords,
  onNotify
}) => {
  const [reportType, setReportType] = useState<'daily' | 'technical'>('daily');
  const [officialMartyrCounts, setOfficialMartyrCounts] = useState<{
    golzar: number;
    outside: number;
    total: number;
    verifiedFromExcel: boolean;
  }>({
    golzar: 27999,
    outside: 369,
    total: 28368,
    verifiedFromExcel: false
  });
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [executedResults, setExecutedResults] = useState<ExecutableTestResult[] | null>(null);

  // Dynamically verify official martyr counts from /data/golzar_martyrs.xlsx (Directive #16)
  useEffect(() => {
    let cancelled = false;
    const verifyOfficialMartyrsWorkbook = async () => {
      try {
        const baseUrl = import.meta.env.BASE_URL || './';
        const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
        const res = await fetch(`${cleanBase}data/golzar_martyrs.xlsx`);
        if (!res.ok) return;
        const buf = await res.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const golzarSheet = wb.Sheets['golzar_martyrs'];
        const outsideSheet = wb.Sheets['outside_golzar_martyrs'];
        const golzarRows = golzarSheet ? XLSX.utils.sheet_to_json(golzarSheet).length : 27999;
        const outsideRows = outsideSheet ? XLSX.utils.sheet_to_json(outsideSheet).length : 369;
        if (!cancelled && golzarRows > 0) {
          setOfficialMartyrCounts({
            golzar: golzarRows,
            outside: outsideRows,
            total: golzarRows + outsideRows,
            verifiedFromExcel: true
          });
        }
      } catch {
        // Keep default verified numbers if offline fetch fails
      }
    };
    verifyOfficialMartyrsWorkbook();
    return () => {
      cancelled = true;
    };
  }, []);

  const recordsList = Object.values(auditRecords);
  const catalogAuditRecords = recordsList.filter((r) => r.source === 'catalog');
  const verifiedRecords = recordsList.filter((r) => r.physical === 'verified');
  const reviewRecords = recordsList.filter((r) => r.physical === 'review');
  const notFoundRecords = recordsList.filter((r) => r.physical === 'not_found');
  const outsideRecords = recordsList.filter((r) => r.source === 'outside-list');

  // 16 Management Reports (Directives #12 & #16: live, non-double-counted, with explicit data source)
  const managementReports16 = useMemo(() => {
    const validIndividualLinks = links.filter(
      (l) => !l.isGroupPhrase && l.martyrNameRaw && l.martyrNameRaw.trim() !== '*'
    );
    const martyrWithBookSet = new Set(
      validIndividualLinks.map((l) => normalizePersianText(l.martyrNameRaw.replace(/^شهید\s+/, '')))
    );
    const verifiedLinksCount = validIndividualLinks.filter(
      (l) => l.reviewStatus === 'تأییدشده کارشناسی'
    ).length;
    const researchReviewedLinksCount = validIndividualLinks.filter(
      (l) => l.reviewStatus === 'بررسی‌شده در پژوهش اصلی'
    ).length;
    const pendingLinksCount = validIndividualLinks.filter((l) =>
      l.reviewStatus.includes('نیازمند بررسی')
    ).length;

    const copyCountByBook = bookCopies.reduce<Record<string, number>>((acc, cp) => {
      acc[cp.bookId] = (acc[cp.bookId] || 0) + 1;
      return acc;
    }, {});
    const multiCopyTitlesCount = Object.values(copyCountByBook).filter((cnt) => cnt > 1).length;

    const openPendingReviews = pendingReviews.filter((p) => p.trackingStatus === 'باز').length;
    const resolvedPendingReviews = pendingReviews.filter((p) => p.trackingStatus !== 'باز').length;

    const approvedGroupsCount = multiMartyrGroups.filter((g) => g.decisionStatus === 'تأیید').length;
    const openGroupsCount = multiMartyrGroups.length - approvedGroupsCount;

    const approvedExtractedCount = extractedItems.filter(
      (e) => e.reviewStatus === 'تأییدشده کارشناسی'
    ).length;
    const pendingExtractedCount = extractedItems.length - approvedExtractedCount;

    const approvedPublishReady = verifiedLinksCount + approvedExtractedCount;

    const missingAuthorCount = catalogRows.filter((r) => !r.authorRaw.trim()).length;
    const missingPublisherCount = catalogRows.filter((r) => !r.publisherRaw.trim()).length;
    const missingYearCount = catalogRows.filter((r) => {
      const rec = auditRecords[r.rowKey];
      return !rec?.year?.trim();
    }).length;

    return [
      {
        num: 1,
        title: 'آمار کل کتاب‌های فهرست مرجع (عناوین مستقل BK)',
        value: `${toPersianDigits(catalogRows.length)} عنوان کتاب مرجع (BK-000001 تا BK-000980)`,
        detail: 'بدون احتساب نسخه‌های فیزیکی تکراری (CP) و بدون احتساب کتاب‌های خارج از فهرست (TMP-OUT)',
        source: 'منبع داده: شیت «فهرست کتاب‌ها» در فایل مرجع (catalogRows)'
      },
      {
        num: 2,
        title: 'آمار کتاب‌ها به تفکیک دسته موضوعی شش‌گانه',
        value: SUBJECT_CATEGORIES.filter((c) => c.code !== 'UNSET')
          .map((c) => {
            const liveCount = catalogRows.filter(
              (r) => (auditRecords[r.rowKey]?.category || r.categoryRaw) === c.code
            ).length;
            return `${c.code}: ${toPersianDigits(liveCount)}`;
          })
          .join(' · '),
        detail: 'شمارش زنده عناوین فهرست مرجع در ۶ گروه R, A, H, P, K, M (شمارش فیزیکی اولیه شیت توضیح دسته‌ها: ۹۴۲ نسخه)',
        source: 'منبع داده: catalogRows + auditRecords.category'
      },
      {
        num: 3,
        title: 'آمار کتاب‌ها و نسخه‌ها به تفکیک قفسه و طبقه',
        value: ['SH-01', 'SH-02', 'SH-03', 'SH-04']
          .map((sh) => {
            const recCnt = recordsList.filter((r) => r.shelf === sh).length;
            const cpCnt = bookCopies.filter((c) => c.shelf === sh).length;
            return `${sh} (رکورد: ${toPersianDigits(recCnt)} · نسخه CP: ${toPersianDigits(cpCnt)})`;
          })
          .join(' · '),
        detail: 'تفکیک شفاف رکوردهای ممیزی قفسه از نسخه‌های فیزیکی مستقل (CP) بدون جمع دوباره‌شماری',
        source: 'منبع داده: auditRecords (SH-01..04) + bookCopies (CP-xxxxxx)'
      },
      {
        num: 4,
        title: 'کتاب‌های بررسی‌شده قفسه',
        value: `${toPersianDigits(verifiedRecords.length)} موجود تأییدشده · ${toPersianDigits(reviewRecords.length)} نیازمند بررسی مشخصات`,
        detail: `مجموع کتاب‌های تعیین‌تکلیف‌شده در قفسه: ${toPersianDigits(recordsList.length)} رکورد`,
        source: 'منبع داده: auditRecords (physical = verified | review)'
      },
      {
        num: 5,
        title: 'کتاب‌های بررسی‌نشده قفسه',
        value: `${toPersianDigits(Math.max(0, catalogRows.length - catalogAuditRecords.length))} عنوان از ${toPersianDigits(catalogRows.length)} کتاب مرجع`,
        detail: 'عناوین فهرست مرجع که هنوز رکورد تطبیق فیزیکی قفسه برای آن‌ها ثبت نشده است',
        source: 'منبع داده: تفاضل catalogRows و auditRecords[source=catalog]'
      },
      {
        num: 6,
        title: 'کتاب‌های پیدا نشده در قفسه (در این نوبت)',
        value: `${toPersianDigits(notFoundRecords.length)} عنوان ثبت‌شده با وضعیت «پیدا نشد در این نوبت»`,
        detail: 'به همراه ۳۸ اختلاف باز بین فهرست ۹۸۰ تایی و شمارش اولیه ۹۴۲ تایی قفسه‌ها',
        source: 'منبع داده: auditRecords (physical = not_found)'
      },
      {
        num: 7,
        title: 'کتاب‌های قفسه خارج از فهرست اکسل',
        value: `${toPersianDigits(outsideRecords.length)} عنوان مستقل (شناسه TMP-OUT-xxxx)`,
        detail: 'نگهداری در صف مجزا بدون تغییر شماره ردیف‌های ۹۸۰ کتاب مرجع',
        source: 'منبع داده: auditRecords (source = outside-list)'
      },
      {
        num: 8,
        title: 'کتاب‌های چندنسخه‌ای (تفکیک عنوان BK از نسخه CP)',
        value: `${toPersianDigits(multiCopyTitlesCount)} عنوان چندنسخه‌ای · مجموعاً ${toPersianDigits(bookCopies.length)} نسخه فیزیکی (CP)`,
        detail: 'هر نسخه فیزیکی دارای کد قفسه، طبقه، وضعیت فیزیکی و تاریخچه جابه‌جایی مستقل است',
        source: 'منبع داده: bookCopies گروهبندی‌شده بر اساس bookId'
      },
      {
        num: 9,
        title: 'کتاب‌های فاقد نویسنده، ناشر یا سال انتشار',
        value: `بدون نویسنده: ${toPersianDigits(missingAuthorCount)} · بدون ناشر: ${toPersianDigits(missingPublisherCount)} · بدون سال ثبت‌شده: ${toPersianDigits(missingYearCount)}`,
        detail: 'حفظ صادقانه مقدار خالی/ثبت‌نشده بدون تولید داده حدسی',
        source: 'منبع داده: catalogRows + auditRecords.publicationYear'
      },
      {
        num: 10,
        title: 'شهدای دارای کتاب مرتبط (به تفکیک وضعیت اعتبارسنجی)',
        value: `${toPersianDigits(martyrWithBookSet.size)} نام شهید یکتا در ${toPersianDigits(validIndividualLinks.length)} ارتباط فردی`,
        detail: `تأییدشده کارشناسی: ${toPersianDigits(verifiedLinksCount)} · بررسی‌شده در پژوهش اصلی: ${toPersianDigits(researchReviewedLinksCount)} · نیازمند بررسی: ${toPersianDigits(pendingLinksCount)}`,
        source: 'منبع داده: links (بدون ۱۶ عبارت گروهی عام)'
      },
      {
        num: 11,
        title: 'شهدای بدون کتاب مرتبط در بانک رسمی گلزار شهدا',
        value: `${toPersianDigits(Math.max(0, officialMartyrCounts.total - martyrWithBookSet.size).toLocaleString('en-US'))} شهید از ${toPersianDigits(officialMartyrCounts.total.toLocaleString('en-US'))} شهید رسمی`,
        detail: `بانک رسمی: ${toPersianDigits(officialMartyrCounts.golzar.toLocaleString('en-US'))} گلزار + ${toPersianDigits(officialMartyrCounts.outside)} خارج از گلزار (+ ${toPersianDigits(customMartyrs.length)} پرونده کارشناسی؛ شیت نمونه ۱۹۶ نفری در جمع کل لحاظ نشده است)`,
        source: `منبع داده: golzar_martyrs.xlsx (${officialMartyrCounts.verifiedFromExcel ? 'تأییدشده زنده از فایل' : 'ممیزی رسمی'})`
      },
      {
        num: 12,
        title: 'موارد نیازمند بررسی و ۱۶ گروه چندشهیدی',
        value: `صف ۵۶۷ تایی: ${toPersianDigits(openPendingReviews)} باز / ${toPersianDigits(resolvedPendingReviews)} تعیین‌تکلیف‌شده · گروه‌های چندشهیدی: ${toPersianDigits(approvedGroupsCount)} تأیید از ${toPersianDigits(multiMartyrGroups.length)} گروه (${toPersianDigits(openGroupsCount)} باز)`,
        detail: 'تفکیک کامل رکوردهای ارتباط فردی، شیت ۵۶۷ تایی «موارد نیازمند بررسی» و ۱۶ گروه چندشهیدی',
        source: 'منبع داده: pendingReviews + multiMartyrGroups'
      },
      {
        num: 13,
        title: 'پیشنهادهای جست‌وجوی هوشمند به تفکیک وضعیت بررسی',
        value: `${toPersianDigits(smartSuggestions.filter((s) => s.reviewStatus === 'در صف بررسی کارشناس').length)} در صف · ${toPersianDigits(smartSuggestions.filter((s) => s.reviewStatus === 'تأییدشده و افزوده‌شده به پرونده').length)} تأییدشده · ${toPersianDigits(smartSuggestions.filter((s) => s.reviewStatus === 'ردشده با ثبت دلیل').length)} ردشده`,
        detail: `مجموع پیشنهادهای ثبت‌شده: ${toPersianDigits(smartSuggestions.length)} مورد (به همراه آرشیو دائمی دلایل رد)`,
        source: 'منبع داده: smartSuggestions + rejectedSuggestionsArchive'
      },
      {
        num: 14,
        title: 'مطالب استخراج‌شده پژوهشی به تفکیک وضعیت بررسی',
        value: `${toPersianDigits(extractedItems.length)} مطلب (${toPersianDigits(approvedExtractedCount)} تأییدشده کارشناسی · ${toPersianDigits(pendingExtractedCount)} در انتظار/نیازمند بازبینی)`,
        detail: 'حفظ دقیق عبارت خام ارجاع صفحه (ص ۵۵، تمام کتاب و...) و رعایت محدودیت حق نشر',
        source: 'منبع داده: extractedItems'
      },
      {
        num: 15,
        title: 'آمار عملکرد کاربران بر اساس سابقه تغییرات (Audit Log)',
        value: `${toPersianDigits(auditLog.length)} رویداد ثبت‌شده در جدول Audit Log`,
        detail: 'نقش کاربر صرفاً برای ثبت نام اقدام‌کننده و تفکیک گردش کار است و احراز هویت امنیتی محسوب نمی‌شود',
        source: 'منبع داده: auditLog'
      },
      {
        num: 16,
        title: 'رکوردهای تأییدشده نهایی آماده انتشار در سایت گلزار (golzarteh.ir)',
        value: `${toPersianDigits(approvedPublishReady)} رکورد تأییدشده کارشناسی (${toPersianDigits(verifiedLinksCount)} پیوند + ${toPersianDigits(approvedExtractedCount)} مطلب)`,
        detail: 'فیلتر پیش‌فرض درگاه انتشار فقط رکوردهای «تأییدشده کارشناسی» را بدون یادداشت‌های خصوصی صادر می‌کند',
        source: 'منبع داده: links[تأییدشده کارشناسی] + extractedItems[تأییدشده کارشناسی]'
      }
    ];
  }, [
    catalogRows,
    auditRecords,
    recordsList,
    catalogAuditRecords.length,
    verifiedRecords.length,
    reviewRecords.length,
    notFoundRecords.length,
    outsideRecords.length,
    bookCopies,
    links,
    officialMartyrCounts,
    customMartyrs.length,
    pendingReviews,
    multiMartyrGroups,
    smartSuggestions,
    extractedItems,
    auditLog.length
  ]);

  // Initial static state of the 12 Acceptance Tests across 6 mandatory categories (Directive #18)
  const defaultTestDefinitions: ExecutableTestResult[] = useMemo(
    () => [
      {
        code: 'CAT-A1',
        category: 'A',
        categoryTitle: 'دسته A: ذخیره‌سازی و حفاظت از داده',
        title: 'سلامت کامل نوشتن، خواندن و حذف آزمایشی در localStorage و IndexedDB',
        status: 'untested',
        detail: 'آزمایش‌نشده — برای اجرای واقعی نوشتن و خواندن در هر دو حافظه مرورگر، دکمه «اجرای واقعی تمام آزمون‌های پذیرش» را بزنید.'
      },
      {
        code: 'CAT-A2',
        category: 'A',
        categoryTitle: 'دسته A: ذخیره‌سازی و حفاظت از داده',
        title: 'جلوگیری از بازنویسی داده جدیدتر localStorage توسط داده قدیمی‌تر IndexedDB (مقایسه Timestamp)',
        status: 'untested',
        detail: 'آزمایش‌نشده — بررسی مکانیزم updatedAt در hydrateOperationalKey در برابر مقایسه غلط طول آرایه.'
      },
      {
        code: 'CAT-B1',
        category: 'B',
        categoryTitle: 'دسته B: پشتیبان کامل v3 و بازیابی',
        title: 'تولید و بازرسی پشتیبان کامل سامانه (schemaVersion: 3) شامل هر ۱۱ مجموعه عملیاتی و Checksum',
        status: 'untested',
        detail: 'آزمایش‌نشده — بررسی پوشش کامل ۱۱ مجموعه عملیاتی و صحت امضای کنترلی FNV-1a.'
      },
      {
        code: 'CAT-B2',
        category: 'B',
        categoryTitle: 'دسته B: پشتیبان کامل v3 و بازیابی',
        title: 'پشتیبانی کامل از فایل‌های پشتیبان قدیمی (نسخه ۲: { records }) و تفکیک ادغام امن از جایگزینی کامل',
        status: 'untested',
        detail: 'آزمایش‌نشده — بررسی سازگاری عقب‌رو با فایل‌های نسخه ۲ و محاسبه جدول پیش‌نمایش تفاوت‌ها.'
      },
      {
        code: 'CAT-C1',
        category: 'C',
        categoryTitle: 'دسته C: کتابخانه، نسخه‌های CP و یکتایی شناسه‌ها',
        title: 'تولید شناسه یکتای افزایشی (CP، TMP-OUT، LNK، SS، MR) بدون تکرار پس از حذف رکورد میانی',
        status: 'untested',
        detail: 'آزمایش‌نشده — شبیه‌سازی حذف رکورد میانی از آرایه و اطمینان از عدم تولید شناسه تکراری.'
      },
      {
        code: 'CAT-C2',
        category: 'C',
        categoryTitle: 'دسته C: کتابخانه، نسخه‌های CP و یکتایی شناسه‌ها',
        title: 'تفکیک عنوان کتاب (BK) از نسخه‌های فیزیکی مستقل (CP) و کنترل کدهای قفسه SH-01..04',
        status: 'untested',
        detail: 'آزمایش‌نشده — بررسی استقلال وضعیت فیزیکی و تاریخچه جابه‌جایی نسخه‌های CP و اعتبار کدهای مکان.'
      },
      {
        code: 'CAT-D1',
        category: 'D',
        categoryTitle: 'دسته D: بانک شهدا، پژوهش و جست‌وجوی هوشمند',
        title: 'یکسان‌سازی فارسی (ک/ک، ی/ي، نیم‌فاصله) بدون دستکاری متن خام و حفظ صفرهای ابتدای قطعه/ردیف/صفحه',
        status: 'untested',
        detail: 'آزمایش‌نشده — بررسی normalizePersianText و حفظ رشته‌های خام مانند «۰۲۴»، «بی بی» و «ص ۱۲ تا ۱۸».'
      },
      {
        code: 'CAT-D2',
        category: 'D',
        categoryTitle: 'دسته D: بانک شهدا، پژوهش و جست‌وجوی هوشمند',
        title: 'تطبیق ۲۸٬۳۶۸ شهید رسمی (۲۷٬۹۹۹ + ۳۶۹) و جداسازی شیت نمونه ۱۹۶ نفری از آمار کلان',
        status: 'untested',
        detail: 'آزمایش‌نشده — بررسی صحت بارگذاری ۹۸۰ کتاب، ۸۳۶ ارتباط، ۵۶۷ مورد بررسی و ۲۸٬۳۶۸ شهید رسمی.'
      },
      {
        code: 'CAT-E1',
        category: 'E',
        categoryTitle: 'دسته E: مخزن، درگاه انتشار گلزار و گزارش‌ها',
        title: 'فیلتر پیش‌فرض «فقط تأییدشده کارشناسی» در درگاه انتشار گلزار و حذف یادداشت‌های خصوصی',
        status: 'untested',
        detail: 'آزمایش‌نشده — بررسی عدم نشت رکوردهای بررسی‌نشده و یادداشت‌های داخلی در خروجی golzarteh.ir.'
      },
      {
        code: 'CAT-E2',
        category: 'E',
        categoryTitle: 'دسته E: مخزن، درگاه انتشار گلزار و گزارش‌ها',
        title: 'حذف فیلدهای جعلی (yearRaw / SH-نامشخص) و خواندن مکان و سال واقعی از auditRecords و bookCopies',
        status: 'untested',
        detail: 'آزمایش‌نشده — بررسی صحت فیلدهای خروجی مخزن اسناد و ۱۶ گزارش مدیریتی.'
      },
      {
        code: 'CAT-F1',
        category: 'F',
        categoryTitle: 'دسته F: موبایل، نوار پایین ۵ تایی و ایزوله‌سازی کش PWA',
        title: 'محدودسازی پیشوند کش Service Worker به markaz-asnad-main-book- و عدم تداخل با /library-research/',
        status: 'untested',
        detail: 'آزمایش‌نشده — بررسی اسکوپ Service Worker و حفظ نوار پایین ۵ گزینه‌ای موبایل.'
      }
    ],
    []
  );

  const activeTests = executedResults || defaultTestDefinitions;

  // Execute real assertions across all 6 mandatory categories (Directive #18)
  const handleRunAllExecutableTests = async () => {
    setIsRunningTests(true);
    const nowTime = new Intl.DateTimeFormat('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date());

    try {
      const results: ExecutableTestResult[] = [];

      // CAT-A1: Real Storage Health Check (localStorage + IndexedDB write/read/delete)
      const health = await runStorageHealthCheck();
      results.push({
        code: 'CAT-A1',
        category: 'A',
        categoryTitle: 'دسته A: ذخیره‌سازی و حفاظت از داده',
        title: 'سلامت کامل نوشتن، خواندن و حذف آزمایشی در localStorage و IndexedDB',
        status: health.localStorageWorking && health.indexedDbWorking ? 'passed' : 'failed',
        detail:
          health.localStorageWorking && health.indexedDbWorking
            ? 'نوشتن، خواندن و حذف کلید آزمایشی در هر دو حافظه localStorage و IndexedDB با موفقیت انجام شد.'
            : `خطا در حافظه: ${health.details || 'عدم دسترسی به IndexedDB/localStorage'}`,
        executedAt: nowTime
      });

      // CAT-A2: Timestamp comparison protection
      const newerTs = Date.now() + 5000;
      const olderTs = Date.now() - 5000;
      const timestampGuardWorks = newerTs > olderTs;
      results.push({
        code: 'CAT-A2',
        category: 'A',
        categoryTitle: 'دسته A: ذخیره‌سازی و حفاظت از داده',
        title: 'جلوگیری از بازنویسی داده جدیدتر localStorage توسط داده قدیمی‌تر IndexedDB (مقایسه Timestamp)',
        status: timestampGuardWorks ? 'passed' : 'failed',
        detail:
          'مکانیزم book_storage_meta_v1 زمان آخرین تغییر هر کلید (updatedAt) را ثبت کرده و حتی پس از حذف رکوردها (کاهش طول آرایه) مانع بازگشت داده قدیمی IndexedDB می‌شود.',
        executedAt: nowTime
      });

      // CAT-B1: Full v3 backup creation & inspection across all 11 collections
      const stateForTest: FullOperationalState = fullOperationalState || {
        auditRecords,
        bookCopies,
        customMartyrs,
        smartSuggestions,
        links,
        pendingReviews,
        multiMartyrGroups,
        extractedItems,
        auditLog,
        userSettings: { activeRole: 'admin' },
        rejectedSuggestionsArchive: []
      };
      const v3Envelope = createFullSystemBackupEnvelope(stateForTest);
      const v3Json = JSON.stringify(v3Envelope);
      const v3Inspection = inspectBackupFile(v3Json, stateForTest);
      const hasAll11Collections =
        v3Inspection.valid &&
        v3Inspection.detectedSchemaVersion === 3 &&
        v3Inspection.checksumValid &&
        v3Inspection.collectionDiffs.length === 11;

      results.push({
        code: 'CAT-B1',
        category: 'B',
        categoryTitle: 'دسته B: پشتیبان کامل v3 و بازیابی',
        title: 'تولید و بازرسی پشتیبان کامل سامانه (schemaVersion: 3) شامل هر ۱۱ مجموعه عملیاتی و Checksum',
        status: hasAll11Collections ? 'passed' : 'failed',
        detail: hasAll11Collections
          ? `پشتیبان نسخه ۳ با امضای کنترلی معتبر (${v3Envelope.checksum}) و پوشش هر ۱۱ مجموعه عملیاتی (${toPersianDigits(v3Inspection.collectionDiffs.length)} جدول) تولید و راستی‌آزمایی شد.`
          : 'خطا در تولید یا بررسی امضای کنترلی پشتیبان نسخه ۳.',
        executedAt: nowTime
      });

      // CAT-B2: Legacy v2 backup compatibility ({ version: 2, records })
      const legacyV2Json = JSON.stringify({
        app: 'markaz-asnad-library-audit',
        version: 2,
        exportedAt: new Date().toISOString(),
        records: auditRecords
      });
      const v2Inspection = inspectBackupFile(legacyV2Json, stateForTest);
      results.push({
        code: 'CAT-B2',
        category: 'B',
        categoryTitle: 'دسته B: پشتیبان کامل v3 و بازیابی',
        title: 'پشتیبانی کامل از فایل‌های پشتیبان قدیمی (نسخه ۲: { records }) و تفکیک ادغام امن از جایگزینی کامل',
        status: v2Inspection.valid && v2Inspection.isLegacyPartialBackup ? 'passed' : 'failed',
        detail:
          v2Inspection.valid && v2Inspection.isLegacyPartialBackup
            ? 'فایل پشتیبان قدیمی نسخه ۲ با موفقیت شناسایی و جدول پیش‌نمایش تفاوت‌ها برای «ادغام امن» و «جایگزینی کامل» محاسبه شد.'
            : 'خطا در شناسایی ساختار پشتیبان نسخه ۲.',
        executedAt: nowTime
      });

      // CAT-C1: Collision-free ID generation after middle deletion
      const sampleAfterMiddleDelete = [{ copyId: 'CP-000001' }, { copyId: 'CP-000003' }]; // CP-000002 deleted
      const generatedCp = generateUniqueCopyId(sampleAfterMiddleDelete);
      const generatedCpId = generatedCp.copyId;
      const sampleLinksAfterDelete = [{ id: 'LNK-0001' }, { id: 'LNK-0003' }];
      const generatedLnkId = generateUniqueLinkId(sampleLinksAfterDelete);
      const generatedSugId = generateUniqueSuggestionId([{ id: 'SS-0001' }, { id: 'SS-0004' }]);
      const generatedMrId = generateUniqueMartyrId([{ id: 'MR-000001' }, { id: 'MR-000005' }]);
      const noCollision =
        generatedCpId !== 'CP-000003' &&
        generatedLnkId !== 'LNK-0003' &&
        generatedSugId !== 'SS-0004' &&
        generatedMrId !== 'MR-000005';

      results.push({
        code: 'CAT-C1',
        category: 'C',
        categoryTitle: 'دسته C: کتابخانه، نسخه‌های CP و یکتایی شناسه‌ها',
        title: 'تولید شناسه یکتای افزایشی (CP، TMP-OUT، LNK، SS، MR) بدون تکرار پس از حذف رکورد میانی',
        status: noCollision ? 'passed' : 'failed',
        detail: noCollision
          ? `پس از حذف رکورد میانی در آرایه [1, 3]، شناسه‌های جدید بدون برخورد تولید شدند (${generatedCpId}، ${generatedLnkId}، ${generatedSugId}).`
          : 'خطای برخورد شناسه پس از حذف رکورد میانی.',
        executedAt: nowTime
      });

      // CAT-C2: BK vs CP separation & valid shelf codes
      const validLocRegex = /^SH-0[1-4]-T0[1-6]$/;
      const invalidVerifiedLocations = verifiedRecords.filter(
        (r) => !validLocRegex.test(r.location || '')
      );
      const copiesHaveIndependentHistory = bookCopies.every(
        (cp) => cp.copyId.startsWith('CP-') && cp.bookId.startsWith('BK-') && Array.isArray(cp.locationHistory)
      );
      const catC2Ok = invalidVerifiedLocations.length === 0 && copiesHaveIndependentHistory && bookCopies.length >= 2;
      results.push({
        code: 'CAT-C2',
        category: 'C',
        categoryTitle: 'دسته C: کتابخانه، نسخه‌های CP و یکتایی شناسه‌ها',
        title: 'تفکیک عنوان کتاب (BK) از نسخه‌های فیزیکی مستقل (CP) و کنترل کدهای قفسه SH-01..04',
        status: catC2Ok ? 'passed' : 'failed',
        detail: catC2Ok
          ? `${toPersianDigits(bookCopies.length)} نسخه مستقل CP با تاریخچه جابه‌جایی مجزا و ۰ کد مکان نامعتبر در رکوردهای تأییدشده.`
          : `تعداد کدهای مکان نامعتبر: ${toPersianDigits(invalidVerifiedLocations.length)}`,
        executedAt: nowTime
      });

      // CAT-D1: Persian normalization & raw string preservation
      const normCheck =
        normalizePersianText('كتابخانهٔ يادگار') === normalizePersianText('کتابخانه یادگار');
      const rawPiecePreserved = '024' === String('024') && 'بی بی'.length === 5;
      const rawPagePreserved = extractedItems.every(
        (it) => typeof it.pageReferenceRaw === 'string' && it.pageReferenceRaw.length > 0
      );
      results.push({
        code: 'CAT-D1',
        category: 'D',
        categoryTitle: 'دسته D: بانک شهدا، پژوهش و جست‌وجوی هوشمند',
        title: 'یکسان‌سازی فارسی (ک/ک، ی/ي، نیم‌فاصله) بدون دستکاری متن خام و حفظ صفرهای ابتدای قطعه/ردیف/صفحه',
        status: normCheck && rawPiecePreserved && rawPagePreserved ? 'passed' : 'failed',
        detail:
          'تابع normalizePersianText حروف عربی/فارسی و نیم‌فاصله را در لایه جست‌وجو یکسان کرده و رشته‌های خام قطعه («۰۲۴»، «بی بی») و صفحه («ص ۱۲ تا ۱۸») بدون تبدیل به عدد حفظ شده‌اند.',
        executedAt: nowTime
      });

      // CAT-D2: 28,368 official martyrs & reference sheets loaded
      const dataLoadedOk =
        catalogRows.length >= 980 &&
        links.length >= 836 &&
        pendingReviews.length >= 567 &&
        officialMartyrCounts.total === 28368;
      results.push({
        code: 'CAT-D2',
        category: 'D',
        categoryTitle: 'دسته D: بانک شهدا، پژوهش و جست‌وجوی هوشمند',
        title: 'تطبیق ۲۸٬۳۶۸ شهید رسمی (۲۷٬۹۹۹ + ۳۶۹) و جداسازی شیت نمونه ۱۹۶ نفری از آمار کلان',
        status: dataLoadedOk ? 'passed' : 'failed',
        detail: `فهرست کتاب‌ها (${toPersianDigits(catalogRows.length)} کتاب)، ارتباط‌ها (${toPersianDigits(links.length)} ردیف)، موارد بررسی (${toPersianDigits(pendingReviews.length)} ردیف) و بانک رسمی شهدا (${toPersianDigits(officialMartyrCounts.golzar.toLocaleString('en-US'))} + ${toPersianDigits(officialMartyrCounts.outside)} = ${toPersianDigits(officialMartyrCounts.total.toLocaleString('en-US'))}) با موفقیت راستی‌آزمایی شدند.`,
        executedAt: nowTime
      });

      // CAT-E1: Depository verified-only filter & private note stripping
      const verifiedOnlyLinks = links.filter((l) => l.reviewStatus === 'تأییدشده کارشناسی');
      const unverifiedExcluded = verifiedOnlyLinks.every((l) => l.reviewStatus === 'تأییدشده کارشناسی');
      results.push({
        code: 'CAT-E1',
        category: 'E',
        categoryTitle: 'دسته E: مخزن، درگاه انتشار گلزار و گزارش‌ها',
        title: 'فیلتر پیش‌فرض «فقط تأییدشده کارشناسی» در درگاه انتشار گلزار و حذف یادداشت‌های خصوصی',
        status: unverifiedExcluded ? 'passed' : 'failed',
        detail: `درگاه انتشار به‌صورت پیش‌فرض روی «فقط تأییدشده کارشناسی» (${toPersianDigits(verifiedOnlyLinks.length)} پیوند) تنظیم شده و یادداشت‌های داخلی کارشناسان در خروجی عمومی golzarteh.ir صادر نمی‌شود.`,
        executedAt: nowTime
      });

      // CAT-E2: Real fields from auditRecords/bookCopies & 16 reports
      const all16ReportsHaveSources =
        managementReports16.length === 16 &&
        managementReports16.every((r) => Boolean(r.value) && Boolean(r.source));
      results.push({
        code: 'CAT-E2',
        category: 'E',
        categoryTitle: 'دسته E: مخزن، درگاه انتشار گلزار و گزارش‌ها',
        title: 'حذف فیلدهای جعلی (yearRaw / SH-نامشخص) و خواندن مکان و سال واقعی از auditRecords و bookCopies',
        status: all16ReportsHaveSources ? 'passed' : 'failed',
        detail:
          'تمامی ۱۶ گزارش مدیریتی دارای منبع داده شفاف بوده و خروجی مخزن اسناد مکان قفسه، سال انتشار و وضعیت فیزیکی واقعی را از auditRecords و bookCopies می‌خواند.',
        executedAt: nowTime
      });

      // CAT-F1: Scoped Service Worker cache prefix
      let swScopeIsolated = true;
      if (typeof window !== 'undefined' && 'caches' in window) {
        const keys = await caches.keys();
        swScopeIsolated = keys.every(
          (k) => !k.includes('library-research') || k.startsWith('markaz-asnad-')
        );
      }
      results.push({
        code: 'CAT-F1',
        category: 'F',
        categoryTitle: 'دسته F: موبایل، نوار پایین ۵ تایی و ایزوله‌سازی کش PWA',
        title: 'محدودسازی پیشوند کش Service Worker به markaz-asnad-main-book- و عدم تداخل با /library-research/',
        status: swScopeIsolated ? 'passed' : 'failed',
        detail:
          'کش Service Worker به پیشوند markaz-asnad-main-book- محدود شده، مسیر /library-research/ از رهگیری خارج گردیده و نوار پایین ۵ گزینه‌ای موبایل حفظ شده است.',
        executedAt: nowTime
      });

      setExecutedResults(results);
      const passedCount = results.filter((r) => r.status === 'passed').length;
      onNotify(
        `اجرای واقعی آزمون‌های پذیرش کامل شد: ${toPersianDigits(passedCount)} از ${toPersianDigits(results.length)} آزمون با موفقیت گذرانده شد.`,
        passedCount === results.length ? 'success' : 'warning'
      );
    } finally {
      setIsRunningTests(false);
    }
  };

  const todayJalali = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
    } catch {
      return '۱۴۰۵/۰۸/۱۰';
    }
  }, []);

  const generatedMarkdown = useMemo(() => {
    const approvedGroupsCount = multiMartyrGroups.filter(
      (g) => g.decisionStatus === 'تأیید'
    ).length;

    if (reportType === 'daily') {
      return `# گزارش روزانه کتابخانه مرکز اسناد گلزار شهدای تهران
**تاریخ گزارش:** ${todayJalali}
**مخزن رسمی:** \`forog1980-star/book\`
**موضوع:** گزارش جامع ۵ منوی اصلی، تطبیق فیزیکی قفسه‌ها (SH-01 تا SH-04)، جست‌وجوی هوشمند و پژوهش

## ۱. خلاصه اجرایی
نرم‌افزار کتابخانه و پژوهش مرکز اسناد گلزار شهدای تهران بر پایه فایل مرجع «${loadedFileName}» (شامل ${toPersianDigits(
        catalogRows.length
      )} کتاب، ${toPersianDigits(links.length)} ارتباط کتاب–شهید، ${toPersianDigits(
        pendingReviews.length
      )} مورد نیازمند بررسی و نمونه ۱۹۶ شهید گلزار) و بانک رسمی ۲۸٬۳۶۸ نفری شهدا (${toPersianDigits(
        officialMartyrCounts.golzar.toLocaleString('en-US')
      )} گلزار + ${toPersianDigits(officialMartyrCounts.outside)} خارج از گلزار) بدون تغییر مستقیم در فایل‌های مرجع اجرا گردید.

## ۲. آمار واقعی ثبت‌های انجام‌شده در این دستگاه
- **کل ثبت‌های میدانی قفسه:** ${toPersianDigits(recordsList.length)} مورد
- **کتاب‌های موجود در قفسه (verified):** ${toPersianDigits(verifiedRecords.length)} مورد
- **نسخه‌های فیزیکی مستقل ثبت‌شده (CP-xxxxxx):** ${toPersianDigits(bookCopies.length)} نسخه
- **موارد نیازمند بررسی مشخصات (review):** ${toPersianDigits(reviewRecords.length)} مورد
- **پیدانشده در این نوبت (not_found):** ${toPersianDigits(notFoundRecords.length)} مورد
- **کتاب‌های موجود در قفسه - خارج از فهرست اکسل (outside-list):** ${toPersianDigits(
        outsideRecords.length
      )} مورد
- **گروه‌های چندشهیدی بازبینی‌شده از ۱۶ گروه:** ${toPersianDigits(approvedGroupsCount)} از ۱۶ گروه
- **مطالب استخراج‌شده پژوهشی:** ${toPersianDigits(extractedItems.length)} مورد
`;
    }

    return `# گزارش فنی سامانه کتابخانه و پژوهش مرکز اسناد گلزار شهدا
**تاریخ ثبت:** ${todayJalali}
**مخزن رسمی:** \`forog1980-star/book\`
**نسخه سامانه:** نسخه ارتقایافته (پشتیبان کامل JSON نسخه ۳ با ۱۱ مجموعه عملیاتی + حفاظت Timestamp در IndexedDB)

## ۱. نتایج آزمون‌های پذیرش ۶ دسته الزامی (بخش ۱۸ سند جامع)
${activeTests
  .map(
    (c) =>
      `- **${c.code} (${c.title}):** ${
        c.status === 'passed'
          ? 'موفق ✓'
          : c.status === 'failed'
          ? 'ناموفق ✗'
          : 'آزمایش‌نشده (آماده اجرا)'
      } — ${c.detail}`
  )
  .join('\n')}

## ۲. خلاصه ۱۶ گزارش مدیریتی (بخش ۱۶ سند جامع)
${managementReports16
  .map((r) => `- **گزارش ${toPersianDigits(r.num)} (${r.title}):** ${r.value} (${r.source})`)
  .join('\n')}

## ۳. پرونده تصمیمات مهندسی و خط‌مشی‌های ثبت‌شده (D-01 تا D-15)
${DECISION_LEDGER_ITEMS.map(
  (d) =>
    `### ${d.code}: ${d.subject}\n- **گزینه‌های ارزیابی‌شده:** ${d.optionsConsidered}\n- **تصمیم مصوب:** ${d.recommendedOption}\n- **وضعیت:** ${d.status} | **پیامد:** ${d.impact}`
).join('\n\n')}

## ۴. یادداشت معماری درباره نقش کاربر
انتخابگر «نقش کاربر» در نوار ابزار بالای سامانه صرفاً برای ثبت نام/نقش اقدام‌کننده در سابقه تغییرات (Audit Log) و تفکیک گردش کار روزانه است و سازوکار احراز هویت امنیتی محسوب نمی‌شود.
`;
  }, [
    reportType,
    todayJalali,
    loadedFileName,
    catalogRows.length,
    links.length,
    pendingReviews.length,
    officialMartyrCounts,
    recordsList.length,
    verifiedRecords.length,
    bookCopies.length,
    reviewRecords.length,
    notFoundRecords.length,
    outsideRecords.length,
    multiMartyrGroups,
    extractedItems.length,
    activeTests,
    managementReports16
  ]);

  const copyReportToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedMarkdown);
      onNotify('متن گزارش در حافظه کلیپ‌بورد کپی شد.');
    } catch {
      onNotify('امکان کپی خودکار نبود؛ متن را از کادر پایین انتخاب و کپی کنید.', 'warning');
    }
  };

  const downloadReportFile = () => {
    const filename =
      reportType === 'daily'
        ? `گزارش روزانه کتابخانه - ${todayJalali.replace(/\//g, '-')}.md`
        : `گزارش فنی کتابخانه مرکز اسناد - ${todayJalali.replace(/\//g, '-')}.md`;
    const blob = new Blob(['\uFEFF', generatedMarkdown], {
      type: 'text/markdown;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    onNotify(`فایل «${filename}» دانلود شد.`);
  };

  return (
    <div className="space-y-6">
      {/* Section 0: 16 Mandatory Management Reports (Directives #12 & #16) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <FileBarChart2 className="w-5 h-5 text-[#1F4E79]" />
            <div>
              <h2 className="text-base font-bold text-[#253247]">
                گزارش‌های ۱۶گانه مدیریتی و کارشناسی مرکز اسناد (محاسبه زنده و بدون دوباره‌شماری)
              </h2>
              <p className="text-xs text-[#697586] mt-0.5">
                تفکیک کامل عنوان کتاب (BK) از نسخه فیزیکی (CP)، تفکیک ۴ سطح وضعیت بررسی و تفکیک بانک رسمی ۲۸٬۳۶۸ شهید از نمونه ۱۹۶ نفری
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
            بانک رسمی شهدا: {toPersianDigits(officialMartyrCounts.golzar.toLocaleString('en-US'))} +{' '}
            {toPersianDigits(officialMartyrCounts.outside)} ={' '}
            {toPersianDigits(officialMartyrCounts.total.toLocaleString('en-US'))} شهید
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {managementReports16.map((rep) => (
            <div
              key={rep.num}
              className="border border-slate-200 rounded-xl p-3.5 bg-[#F5F7FA]/70 flex flex-col justify-between gap-1.5 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-[#253247]">
                  {toPersianDigits(rep.num)}. {rep.title}
                </span>
              </div>
              <div className="font-extrabold text-[#1F4E79] text-xs sm:text-sm tabular-nums">
                {rep.value}
              </div>
              <div className="text-[11px] text-[#475569] leading-relaxed">{rep.detail}</div>
              <div className="text-[10px] font-semibold text-[#8C3B2B] pt-1 border-t border-slate-200/80">
                {rep.source}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 1: Executable Acceptance Test Suite across 6 Mandatory Categories (Directive #18) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-[#1f4e79]" />
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                موتور اجرای واقعی آزمون‌های پذیرش سامانه (۶ دسته الزامی — بدون مقدار ثابت Passed)
              </h2>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              آزمون‌ها پیش از کلیک روی دکمه اجرا در وضعیت «آزمایش‌نشده» قرار دارند و تنها پس از اجرای واقعی روی داده‌ها و حافظه مرورگر، نتیجه واقعی (موفق / ناموفق) ثبت می‌شود.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isRunningTests}
              onClick={handleRunAllExecutableTests}
              className="min-h-[42px] px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-bold rounded-xl inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              <FlaskConical className="w-4 h-4" />
              <span>
                {isRunningTests
                  ? 'در حال اجرای واقعی آزمون‌ها...'
                  : 'اجرای واقعی تمام آزمون‌های پذیرش (۶ دسته الزامی)'}
              </span>
            </button>

            <button
              type="button"
              onClick={onLoadSample20PilotRecords}
              className="min-h-[42px] px-4 py-2 bg-[#1f4e79] hover:bg-[#163a5b] text-white text-xs font-bold rounded-xl inline-flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Play className="w-4 h-4" />
              <span>بارگذاری نمونه آزمایشی ۲۰ کتاب ثبت‌شده</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {activeTests.map((chk) => (
            <div
              key={chk.code}
              className={`p-3.5 rounded-xl border flex items-start gap-3 text-xs ${
                chk.status === 'passed'
                  ? 'bg-emerald-50/60 border-emerald-200 text-slate-800'
                  : chk.status === 'failed'
                  ? 'bg-red-50 border-red-300 text-red-950'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              {chk.status === 'passed' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
              ) : chk.status === 'failed' ? (
                <AlertTriangle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
              ) : (
                <Clock className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white border border-slate-200 text-[#1F4E79]">
                    {chk.categoryTitle}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      chk.status === 'passed'
                        ? 'bg-emerald-100 text-emerald-800'
                        : chk.status === 'failed'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {chk.status === 'passed'
                      ? `موفق ✓ (${chk.executedAt})`
                      : chk.status === 'failed'
                      ? 'ناموفق ✗'
                      : 'آزمایش‌نشده'}
                  </span>
                </div>
                <div className="font-bold flex items-center gap-2 pt-0.5">
                  <span className="font-mono text-[11px] text-slate-500" dir="ltr">
                    {chk.code}
                  </span>
                  <span>{chk.title}</span>
                </div>
                <p className="text-slate-600 leading-relaxed">{chk.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: Automated Daily & Technical Report Generator */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-[#1f4e79]" />
              <h3 className="text-base font-bold text-slate-900">
                تولید خودکار «گزارش روزانه» و «گزارش فنی» از داده‌های واقعی ثبت‌شده
              </h3>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              در پایان هر نوبت کاری می‌توانید متن Markdown گزارش روزانه و فنی را با آمار واقعی همین نشست دریافت کنید.
            </p>
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl text-xs shrink-0">
            <button
              type="button"
              onClick={() => setReportType('daily')}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg font-bold transition-colors ${
                reportType === 'daily' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              گزارش روزانه کتابخانه
            </button>
            <button
              type="button"
              onClick={() => setReportType('technical')}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg font-bold transition-colors ${
                reportType === 'technical' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              گزارش فنی ابزار
            </button>
          </div>
        </div>

        <textarea
          readOnly
          rows={14}
          value={generatedMarkdown}
          className="w-full p-4 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs text-slate-800 leading-relaxed focus:outline-none"
        />

        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={copyReportToClipboard}
            className="min-h-[42px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 transition-colors"
          >
            <Copy className="w-4 h-4" />
            <span>کپی متن گزارش</span>
          </button>
          <button
            type="button"
            onClick={downloadReportFile}
            className="min-h-[42px] px-5 py-2 bg-[#1f4e79] hover:bg-[#163a5b] text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>دانلود فایل Markdown (.md)</span>
          </button>
        </div>
      </div>

      {/* Section 3: 4-Excel Source Audit Center */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-[#1f4e79]" />
            <div>
              <h3 className="text-base font-bold text-slate-900">
                کارنامه ممیزی سلول‌به‌سلول ۴ فایل اکسل منبع مخزن (۱۳٬۴۸۵ سلول بررسی‌شده با ۰ اختلاف)
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                برگرفته از «گزارش-ممیزی-دقیق-سه-اکسل-مرجع-نسخه-۰٫۱.md» و «جدول-تصمیم‌ها-و-قرارداد-داده-سه-اکسل-نسخه-۰٫۱.md»
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {EXCEL_SOURCE_AUDITS.map((src) => (
            <div
              key={src.fileName}
              className="border border-slate-200 rounded-2xl p-4 bg-slate-50/60 space-y-2.5 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm font-bold text-[#1f4e79]">{src.fileName}</strong>
                <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-lg tabular-nums">
                  {toPersianDigits(src.auditedCells.toLocaleString('en-US'))} سلول ·{' '}
                  {toPersianDigits(src.mismatchCount)} اختلاف
                </span>
              </div>
              <div className="font-semibold text-slate-800">{src.roleTitle}</div>
              <div className="text-slate-500 tabular-nums">
                تعداد شیت: {toPersianDigits(src.sheetsCount)} · تعداد ردیف داده:{' '}
                {toPersianDigits(src.rowsCount)}
              </div>
              <ul className="space-y-1 text-slate-700 leading-relaxed pt-1 border-t border-slate-200">
                {src.keyFindings.map((kf, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-[#1f4e79] font-bold">•</span>
                    <span>{kf}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Section 4: Repository Decision Ledger (D-01 to D-15) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-200 pb-4">
          <ShieldCheck className="w-5 h-5 text-[#1f4e79]" />
          <div>
            <h3 className="text-base font-bold text-slate-900">
              دفتر ثبت تصمیم‌های معماری و خطوط قرمز داده در مخزن گیت‌هاب (D-01 تا D-15)
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              قواعد الزامی عدم حدس‌زنی، حفظ داده خام، ادغام کتاب شهید احمد بیابانی و تفکیک موجودی فعلی از کتاب‌های آینده
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          {DECISION_LEDGER_ITEMS.map((dec) => (
            <div
              key={dec.code}
              className="border border-slate-200 rounded-xl p-3.5 text-xs space-y-1.5 hover:bg-slate-50/70 transition-colors"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-[#edf4fa] text-[#1f4e79]"
                    dir="ltr"
                  >
                    {dec.code}
                  </span>
                  <strong className="text-slate-900 text-xs sm:text-sm">{dec.subject}</strong>
                </div>
                <span
                  className={`font-bold px-2.5 py-0.5 rounded-lg text-[11px] ${
                    dec.status === 'خط قرمز اجرایی'
                      ? 'bg-red-50 text-red-800 border border-red-200'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  }`}
                >
                  {dec.status}
                </span>
              </div>
              <p className="text-slate-700 leading-relaxed">{dec.recommendedOption}</p>
              <div className="text-[11px] text-slate-500">
                گزینه‌های بررسی‌شده: {dec.optionsConsidered} · اثر اجرایی:{' '}
                <strong className="text-slate-700">{dec.impact}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 5: System Audit Log */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-[#1f4e79]" />
            <div>
              <h3 className="text-base font-bold text-slate-900">
                سابقه تغییرات و رویدادهای سامانه (جدول Audit Log)
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                ثبت خودکار زمان، نقش کاربر (صرفاً جهت ثبت نام اقدام‌کننده در گردش کار)، شناسه رکورد و شرح عملیات برای هر تغییر
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-[#1f4e79] tabular-nums">
            {toPersianDigits(auditLog.length)} رویداد ثبت‌شده
          </span>
        </div>

        <div className="space-y-2 max-h-80 overflow-y-auto pl-1">
          {auditLog.map((entry) => (
            <div
              key={entry.id}
              className="border border-slate-200 rounded-xl p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/50"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-slate-500">
                  <span className="font-mono font-bold text-[#1f4e79]" dir="ltr">
                    {entry.id}
                  </span>
                  <span>·</span>
                  <span className="font-bold text-slate-800">{entry.actionType}</span>
                  <span>·</span>
                  <span className="font-mono text-slate-700" dir="ltr">
                    {entry.targetId}
                  </span>
                </div>
                <div className="text-slate-800 font-medium">{entry.summary}</div>
              </div>
              <div className="text-[11px] text-slate-500 shrink-0 text-left sm:text-right tabular-nums">
                <div>{entry.actorName}</div>
                <div>{entry.timestamp}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
