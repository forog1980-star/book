import React, { useRef, useState, useEffect } from 'react';
import {
  FileUp,
  FileDown,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Share2,
  Download,
  RotateCcw,
  FileCheck2,
  GitMerge,
  XCircle,
  Eye,
  Layers,
} from 'lucide-react';
import { ModalWindow } from '../../components/ModalWindow';
import { ReferenceCatalogRow, toPersianDigits } from '../../data/markazAsnadData';
import { FullOperationalState } from '../../utils/backupService';
import {
  buildFullSystemJsonExport,
  executeSafeJsonMerge,
  getLatestPreMergeRecoveryPoint,
  inspectAndCompareSystemJson,
  restoreFromPreMergeRecoveryPoint,
  shareJsonFileIfSupported,
  triggerJsonFileDownload,
} from './jsonTransferEngine';
import {
  ConflictDecisionOption,
  ExportExecutionResult,
  PreMergeRecoveryPoint,
  SystemJsonInspectionReport,
} from './types';

export interface JsonSystemTransferSectionProps {
  fullOperationalState: FullOperationalState;
  catalogRows: ReferenceCatalogRow[];
  onApplyMergedState: (mergedState: FullOperationalState, summaryMessage: string) => void;
  onNotify: (message: string, type?: 'success' | 'warning') => void;
}

export const JsonSystemTransferSection: React.FC<JsonSystemTransferSectionProps> = ({
  fullOperationalState,
  catalogRows,
  onApplyMergedState,
  onNotify,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [lastExportResult, setLastExportResult] = useState<ExportExecutionResult | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  const [showImportModal, setShowImportModal] = useState(false);
  const [inspectionReport, setInspectionReport] = useState<SystemJsonInspectionReport | null>(null);
  const [conflictDecisions, setConflictDecisions] = useState<Record<string, ConflictDecisionOption>>({});
  const [activeDetailTab, setActiveDetailTab] = useState<
    'overview' | 'new' | 'modified' | 'conflicts' | 'invalid'
  >('overview');
  const [isMerging, setIsMerging] = useState(false);
  const [mergeCompletedMessage, setMergeCompletedMessage] = useState<string | null>(null);
  const [latestRecoveryPoint, setLatestRecoveryPoint] = useState<PreMergeRecoveryPoint | null>(null);

  useEffect(() => {
    void getLatestPreMergeRecoveryPoint().then((rp) => {
      if (rp) setLatestRecoveryPoint(rp);
    });
  }, [showImportModal, mergeCompletedMessage]);

  // عملیات ۱: دریافت خروجی کامل JSON از کل اطلاعات سیستم
  const handleExportFullJson = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const res = await buildFullSystemJsonExport(fullOperationalState, catalogRows);
      if (!res.ok) {
        onNotify(res.error || 'خطا در تهیه خروجی کامل JSON از اطلاعات سیستم.', 'warning');
        return;
      }

      setLastExportResult(res);
      const downloaded = triggerJsonFileDownload(res.jsonString, res.fileName);
      setShowExportModal(true);

      if (downloaded) {
        onNotify(
          `فایل خروجی کامل JSON («${res.fileName}») با موفقیت تولید، اعتبارسنجی و دانلود شد.`
        );
      } else {
        onNotify(
          'فایل خروجی کامل JSON آماده شد؛ از پنجره بازشده می‌توانید آن را دانلود یا همرسانی کنید.'
        );
      }
    } finally {
      setIsExporting(false);
    }
  };

  // عملیات ۲: انتخاب و بررسی اولیه فایل JSON بدون تغییر در اطلاعات مقصد
  const handleTriggerImportFilePicker = () => {
    setMergeCompletedMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    } else {
      setShowImportModal(true);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const rawText = await file.text();
      const report = inspectAndCompareSystemJson(
        rawText,
        file.name,
        file.size,
        fullOperationalState,
        catalogRows
      );

      const initialDecisions: Record<string, ConflictDecisionOption> = {};
      for (const c of report.conflicts) {
        initialDecisions[c.conflictId] = c.selectedDecision || 'merge-complementary';
      }

      setConflictDecisions(initialDecisions);
      setInspectionReport(report);
      setMergeCompletedMessage(null);
      setActiveDetailTab(report.conflicts.length > 0 ? 'conflicts' : 'overview');
      setShowImportModal(true);

      if (!report.valid) {
        onNotify(report.errorReason || 'فایل انتخاب‌شده معتبر نیست.', 'warning');
      }
    } catch {
      onNotify('خطا در خواندن فایل انتخاب‌شده از حافظه دستگاه.', 'warning');
    }
  };

  // اجرای نهایی ادغام امن پس از تأیید صریح کاربر
  const handleConfirmAndExecuteSafeMerge = async () => {
    if (!inspectionReport || !inspectionReport.valid || isMerging) return;
    setIsMerging(true);
    try {
      const result = await executeSafeJsonMerge(
        inspectionReport,
        fullOperationalState,
        conflictDecisions
      );

      if (!result.ok) {
        onNotify(result.error || result.summaryMessage, 'warning');
        return;
      }

      const rp = await getLatestPreMergeRecoveryPoint();
      if (rp) setLatestRecoveryPoint(rp);

      onApplyMergedState(result.mergedState, result.summaryMessage);
      setMergeCompletedMessage(result.summaryMessage);
    } finally {
      setIsMerging(false);
    }
  };

  const handleCancelImportWithoutChanges = () => {
    setShowImportModal(false);
    setInspectionReport(null);
    setMergeCompletedMessage(null);
    onNotify('عملیات ورود فایل لغو شد؛ هیچ تغییری در اطلاعات دستگاه انجام نشد.');
  };

  const handleRestorePreMergeSnapshot = async () => {
    if (!latestRecoveryPoint) return;
    const res = await restoreFromPreMergeRecoveryPoint(latestRecoveryPoint);
    if (res.ok) {
      onApplyMergedState(
        res.restoredState,
        `اطلاعات دستگاه با موفقیت به نقطه بازیابی پیش از ادغام (${latestRecoveryPoint.recoveryId}) بازگردانده شد.`
      );
      setShowImportModal(false);
      setInspectionReport(null);
    } else {
      onNotify(res.error || 'خطا در بازگردانی نقطه بازیابی.', 'warning');
    }
  };

  const setAllConflictsDecision = (decision: ConflictDecisionOption) => {
    if (!inspectionReport) return;
    const next: Record<string, ConflictDecisionOption> = {};
    for (const c of inspectionReport.conflicts) {
      next[c.conflictId] = decision;
    }
    setConflictDecisions(next);
  };

  return (
    <section
      aria-label="انتقال و نگهداری اطلاعات کتابخانه"
      data-testid="json-system-transfer-bottom-section"
      dir="rtl"
      className="mt-6 mb-4 rounded-3xl bg-gradient-to-b from-[#FFFEFA] via-[#FAF6EE] to-[#F2EBDC] border-2 border-[#C8B69B] p-5 sm:p-7 shadow-sm relative overflow-hidden"
    >
      {/* نوار ظریف تزئینی بالای قاب اختصاصی برای تمایز بصری از کارت‌های معمول */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l from-[#1E5B45] via-[#2C5E8A] to-[#7A5C3E]"
      />

      {/* ورودی مخفی انتخاب فایل JSON */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleFileSelected}
        className="hidden"
        data-testid="json-system-import-file-input"
      />

      {/* سرصفحه و توضیح بخش ششم */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-[#DFD2BE]">
        <div className="space-y-1.5 text-right">
          <div className="inline-flex items-center gap-2 text-[#1E4D3B] text-xs font-bold">
            <ShieldCheck className="w-4 h-4 shrink-0 text-[#1E5B45]" />
            <span>مستقل از اینترنت و فضای ابری · انتقال امن دستی بین گوشی و رایانه</span>
          </div>
          <h2 className="font-titr text-lg sm:text-xl font-bold text-[#24303F] tracking-normal">
            انتقال و نگهداری اطلاعات کتابخانه
          </h2>
          <p className="text-xs sm:text-sm text-[#4A5568] leading-relaxed">
            «تهیه نسخه کامل پشتیبان و انتقال اطلاعات بین گوشی و رایانه»
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-center text-[11px] text-[#4A5568]">
          <span>حافظه فعال: IndexedDB + LocalStorage</span>
          <span aria-hidden="true">·</span>
          <span>فرمت استاندارد: UTF-8 JSON v4</span>
        </div>
      </div>

      {/* دو دکمه بزرگ، متمایز و لمسی (منطبق با بخش پنجم و ششم) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 pt-5">
        {/* دکمه اول: دریافت خروجی کامل JSON */}
        <button
          type="button"
          onClick={handleExportFullJson}
          disabled={isExporting}
          data-testid="btn-export-full-system-json"
          className="w-full min-h-[108px] p-4 sm:p-5 rounded-2xl bg-[#F2F9F5] hover:bg-[#E4F3EA] active:scale-[0.99] border-2 border-[#7AB899] text-right transition-all flex items-start gap-4 cursor-pointer shadow-2xs group focus-visible:outline-2 focus-visible:outline-[#1E5B45]"
        >
          <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-[#1E5B45] text-white flex items-center justify-center shrink-0 shadow-xs group-hover:bg-[#164635] transition-colors">
            <FileUp className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>

          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="text-[11px] font-bold text-[#1E5B45]">
              ۱. دریافت خروجی کامل JSON از کل اطلاعات سیستم
            </div>
            <div className="text-sm sm:text-base font-bold text-[#133829] leading-snug">
              دریافت خروجی کامل JSON
            </div>
            <p className="text-xs text-[#2C5443] leading-relaxed">
              «تهیه یک فایل کامل از تمام اطلاعات ذخیره‌شده کتابخانه»
            </p>
          </div>
        </button>

        {/* دکمه دوم: ورود فایل JSON به سیستم */}
        <button
          type="button"
          onClick={handleTriggerImportFilePicker}
          disabled={isMerging}
          data-testid="btn-import-full-system-json"
          className="w-full min-h-[108px] p-4 sm:p-5 rounded-2xl bg-[#F0F6FB] hover:bg-[#E2EEF8] active:scale-[0.99] border-2 border-[#7FA8CF] text-right transition-all flex items-start gap-4 cursor-pointer shadow-2xs group focus-visible:outline-2 focus-visible:outline-[#1E4B75]"
        >
          <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-[#1E4B75] text-white flex items-center justify-center shrink-0 shadow-xs group-hover:bg-[#163859] transition-colors">
            <FileDown className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>

          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="text-[11px] font-bold text-[#1E4B75]">
              ۲. ورود فایل JSON به کل اطلاعات سیستم
            </div>
            <div className="text-sm sm:text-base font-bold text-[#132F4C] leading-snug">
              ورود فایل JSON به سیستم
            </div>
            <p className="text-xs text-[#2B4C6F] leading-relaxed">
              «بررسی و ادغام اطلاعات فایل پشتیبان با اطلاعات موجود»
            </p>
          </div>
        </button>
      </div>

      {/* نوار راهنمای کوتاه گردش کار بین گوشی و رایانه و دسترسی به نقطه بازیابی */}
      <div className="mt-4 pt-3.5 border-t border-[#E5DAC8] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#52606D]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold text-[#24303F]">گردش کار امن:</span>
          <span>ثبت در گوشی</span>
          <span aria-hidden="true">←</span>
          <span>دریافت خروجی JSON</span>
          <span aria-hidden="true">←</span>
          <span>انتقال فایل به رایانه و ادغام امن</span>
          <span aria-hidden="true">←</span>
          <span>تکمیل و بازگردانی به گوشی</span>
        </div>

        {latestRecoveryPoint && (
          <button
            type="button"
            onClick={() => {
              setInspectionReport(null);
              setShowImportModal(true);
            }}
            className="text-xs font-bold text-[#1E4B75] hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>نقطه بازیابی پیش از ادغام موجود است ({latestRecoveryPoint.createdAtJalali})</span>
          </button>
        )}
      </div>

      {/* مودال ۱: گزارش اعتبارسنجی و تحویل فایل خروجی کامل JSON */}
      {showExportModal && lastExportResult && (
        <ModalWindow
          onClose={() => setShowExportModal(false)}
          title="گزارش تولید و اعتبارسنجی خروجی کامل JSON سیستم"
          maxWidthClass="max-w-2xl"
        >
          <div className="space-y-4 text-xs text-[#24303F]" dir="rtl">
            <div className="bg-[#EEF8F3] border border-[#94C9AE] rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-[#154932]">
                <CheckCircle2 className="w-5 h-5 text-[#1E5B45] shrink-0" />
                <span>فایل کامل JSON با موفقیت ساخته، اعتبارسنجی و آماده انتقال شد</span>
              </div>
              <p className="text-[#26533E] leading-relaxed">
                تمامی منابع اطلاعاتی واقعی نرم‌افزار (شامل کتاب‌ها، ارتباط‌های تک‌شهیدی و چندشهیدی، ثبت‌های سریع قفسه، نسخه‌های فیزیکی، تاریخچه جابه‌جایی و تنظیمات) بدون هیچ تغییری در داده اصلی استخراج و با حافظه دستگاه تطبیق داده شد.
              </p>
            </div>

            {/* مشخصات فنی و کنترلی فایل */}
            <div className="bg-[#FAF7F2] border border-[#DFD2BE] rounded-2xl p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <span className="text-[#627080]">نام فایل: </span>
                <strong className="font-mono text-[#1E4B75] break-all" dir="ltr">
                  {lastExportResult.fileName}
                </strong>
              </div>
              <div>
                <span className="text-[#627080]">زمان تهیه خروجی: </span>
                <strong>{lastExportResult.envelope.exportedAtJalali}</strong>
              </div>
              <div>
                <span className="text-[#627080]">شناسه خروجی (exportId): </span>
                <strong className="font-mono">{lastExportResult.envelope.exportId}</strong>
              </div>
              <div>
                <span className="text-[#627080]">حجم فایل: </span>
                <strong className="font-mono tabular-nums">
                  {toPersianDigits(Math.max(1, Math.round(lastExportResult.byteSize / 1024)))} کیلوبایت
                </strong>
              </div>
              <div className="sm:col-span-2">
                <span className="text-[#627080]">کد یکتای صحت داده (Integrity Hash): </span>
                <strong className="font-mono text-[#1E5B45]">
                  {lastExportResult.envelope.integrity.payloadHash} /{' '}
                  {lastExportResult.envelope.integrity.fnv1aChecksum}
                </strong>
              </div>
              <div className="sm:col-span-2 flex items-center gap-1.5 text-[#154932] font-bold">
                <FileCheck2 className="w-4 h-4 shrink-0" />
                <span>
                  نتیجه تطبیق با Storage واقعی:{' '}
                  {lastExportResult.storageVerification.verified
                    ? 'تأیید کامل (۱۰۰٪ منطبق با IndexedDB و LocalStorage)'
                    : 'بررسی شد'}
                </span>
              </div>
            </div>

            {/* خلاصه آمار استخراج‌شده */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-white border border-[#E2D6C5] rounded-xl p-2.5">
                <div className="text-[11px] text-[#627080]">پرونده یکتای کتاب‌ها</div>
                <div className="text-base font-bold font-mono tabular-nums text-[#24303F] mt-0.5">
                  {toPersianDigits(
                    lastExportResult.envelope.data.derivedSnapshots.booksDossiersCount
                  )}
                </div>
              </div>
              <div className="bg-white border border-[#E2D6C5] rounded-xl p-2.5">
                <div className="text-[11px] text-[#627080]">ثبت‌های قفسه و کتاب</div>
                <div className="text-base font-bold font-mono tabular-nums text-[#1E5B45] mt-0.5">
                  {toPersianDigits(lastExportResult.envelope.integrity.collectionCounts.auditRecords)}
                </div>
              </div>
              <div className="bg-white border border-[#E2D6C5] rounded-xl p-2.5">
                <div className="text-[11px] text-[#627080]">ارتباط کتاب و شهید</div>
                <div className="text-base font-bold font-mono tabular-nums text-[#1E4B75] mt-0.5">
                  {toPersianDigits(lastExportResult.envelope.integrity.collectionCounts.links)}
                </div>
              </div>
              <div className="bg-white border border-[#E2D6C5] rounded-xl p-2.5">
                <div className="text-[11px] text-[#627080]">ارتباطات و مطالب چندشهیدی</div>
                <div className="text-base font-bold font-mono tabular-nums text-[#7A5C3E] mt-0.5">
                  {toPersianDigits(
                    lastExportResult.envelope.integrity.collectionCounts.multiMartyrLinks
                  )}
                </div>
              </div>
              <div className="bg-white border border-[#E2D6C5] rounded-xl p-2.5">
                <div className="text-[11px] text-[#627080]">ثبت‌های جدید خارج از لیست</div>
                <div className="text-base font-bold font-mono tabular-nums text-[#24303F] mt-0.5">
                  {toPersianDigits(
                    lastExportResult.envelope.integrity.collectionCounts.newRegistrations
                  )}
                </div>
              </div>
              <div className="bg-white border border-[#E2D6C5] rounded-xl p-2.5">
                <div className="text-[11px] text-[#627080]">نسخه‌های فیزیکی (CP)</div>
                <div className="text-base font-bold font-mono tabular-nums text-[#24303F] mt-0.5">
                  {toPersianDigits(lastExportResult.envelope.integrity.collectionCounts.bookCopies)}
                </div>
              </div>
              <div className="bg-white border border-[#E2D6C5] rounded-xl p-2.5">
                <div className="text-[11px] text-[#627080]">صف بررسی کارشناسی</div>
                <div className="text-base font-bold font-mono tabular-nums text-[#24303F] mt-0.5">
                  {toPersianDigits(
                    lastExportResult.envelope.integrity.collectionCounts.pendingReviews
                  )}
                </div>
              </div>
              <div className="bg-white border border-[#E2D6C5] rounded-xl p-2.5">
                <div className="text-[11px] text-[#627080]">کل رکوردهای عملیاتی</div>
                <div className="text-base font-bold font-mono tabular-nums text-[#1E5B45] mt-0.5">
                  {toPersianDigits(
                    lastExportResult.envelope.integrity.collectionCounts.totalOperationalItems
                  )}
                </div>
              </div>
            </div>

            {/* دکمه‌های دانلود مجدد و اشتراک‌گذاری */}
            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-[#E2D6C5]">
              <button
                type="button"
                onClick={async () => {
                  const res = await shareJsonFileIfSupported(
                    lastExportResult.jsonString,
                    lastExportResult.fileName
                  );
                  if (!res.shared && res.reason) {
                    onNotify(res.reason, 'warning');
                  }
                }}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#F0F6FB] hover:bg-[#E2EEF8] border border-[#7FA8CF] text-[#1E4B75] font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>اشتراک‌گذاری فایل در گوشی / پیام‌رسان</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerJsonFileDownload(lastExportResult.jsonString, lastExportResult.fileName);
                  onNotify(`فایل «${lastExportResult.fileName}» مجدداً دانلود شد.`);
                }}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#1E5B45] hover:bg-[#164635] text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>دانلود مستقیم فایل JSON</span>
              </button>

              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-white border border-[#C8B69B] text-[#24303F] font-bold cursor-pointer"
              >
                بستن
              </button>
            </div>
          </div>
        </ModalWindow>
      )}

      {/* مودال ۲: بررسی، مقایسه و ادغام امن فایل JSON ورودی */}
      {showImportModal && (
        <ModalWindow
          onClose={() => {
            if (!isMerging) {
              setShowImportModal(false);
            }
          }}
          title="ورود فایل JSON به کل اطلاعات سیستم و ادغام امن"
          maxWidthClass="max-w-4xl"
        >
          <div className="space-y-4 text-xs text-[#24303F]" dir="rtl">
            {/* نوار انتخاب فایل جدید یا بازگردانی از Recovery Point */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#FAF7F2] border border-[#DFD2BE] rounded-2xl p-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#1E4B75] shrink-0" />
                <span>
                  {inspectionReport
                    ? `فایل انتخاب‌شده: ${inspectionReport.fileName}`
                    : 'یک فایل پشتیبان JSON را برای بررسی و مقایسه انتخاب نمایید'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[#1E4B75] hover:bg-[#163859] text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>انتخاب فایل JSON دیگر</span>
                </button>
              </div>
            </div>

            {/* اگر ادغام با موفقیت انجام شده باشد */}
            {mergeCompletedMessage && (
              <div
                data-testid="json-merge-success-banner"
                className="bg-[#EEF8F3] border-2 border-[#7AB899] rounded-2xl p-4 space-y-2.5"
              >
                <div className="flex items-center gap-2 text-sm font-bold text-[#154932]">
                  <CheckCircle2 className="w-5 h-5 text-[#1E5B45] shrink-0" />
                  <span>ادغام امن با موفقیت کامل اجرا شد</span>
                </div>
                <p className="text-[#26533E] leading-relaxed">{mergeCompletedMessage}</p>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowImportModal(false);
                      setInspectionReport(null);
                      setMergeCompletedMessage(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-[#1E5B45] text-white font-bold cursor-pointer"
                  >
                    بستن و مشاهده اطلاعات
                  </button>
                </div>
              </div>
            )}

            {/* اگر فایل نامعتبر، خراب یا ناسازگار باشد */}
            {inspectionReport && !inspectionReport.valid && (
              <div
                data-testid="json-import-invalid-banner"
                className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 space-y-2.5 text-red-950"
              >
                <div className="flex items-center gap-2 text-sm font-bold text-red-900">
                  <XCircle className="w-5 h-5 text-red-700 shrink-0" />
                  <span>خطا در اعتبارسنجی فایل؛ از ورود فایل جلوگیری شد</span>
                </div>
                <p className="leading-relaxed font-medium">{inspectionReport.errorReason}</p>
                <div className="text-[11px] text-red-800">
                  اطلاعات فعلی دستگاه شما کاملاً دست‌نخورده و محفوظ است.
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleCancelImportWithoutChanges}
                    className="px-4 py-2 rounded-xl bg-white border border-red-300 text-red-900 font-bold cursor-pointer"
                  >
                    بستن
                  </button>
                </div>
              </div>
            )}

            {/* مرحله ۱ و ۲: نمایش گزارش کامل اعتبارسنجی و مقایسه پیش از تأیید کاربر */}
            {inspectionReport && inspectionReport.valid && !mergeCompletedMessage && (
              <div className="space-y-4" data-testid="json-import-inspection-report">
                {/* کادر وضعیت اعتبارسنجی مرحله اول */}
                <div className="bg-[#F0F6FB] border border-[#9BBCE0] rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-bold text-sm text-[#132F4C]">
                      <CheckCircle2 className="w-4 h-4 text-[#1E5B45] shrink-0" />
                      <span>
                        مرحله اول: فایل معتبر است (نسخه ساختار v
                        {toPersianDigits(inspectionReport.detectedSchemaVersion)} · صحت Integrity
                        تأیید شد)
                      </span>
                    </div>
                    <div className="text-[11px] text-[#3B5978]">
                      دستگاه مبدأ: <strong>{inspectionReport.sourceDeviceRole}</strong> · تاریخ
                      خروجی: <strong>{inspectionReport.exportedAtJalali}</strong> · شناسه:{' '}
                      <span className="font-mono">{inspectionReport.exportId}</span>
                    </div>
                  </div>
                  <div className="text-[11px] font-bold text-[#1E5B45] bg-white px-3 py-1.5 rounded-xl border border-[#94C9AE] shrink-0">
                    هیچ تغییری تا پیش از تأیید شما اعمال نمی‌شود
                  </div>
                </div>

                {/* شاخص‌های ۸گانه مرحله اول و دوم (الزامات بخش چهارم) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="bg-white border border-[#DFD2BE] rounded-xl p-2.5">
                    <div className="text-[11px] text-[#627080]">تعداد کتاب‌ها در فایل</div>
                    <div
                      className="text-base font-bold font-mono tabular-nums text-[#24303F] mt-0.5"
                      data-testid="metric-books-count"
                    >
                      {toPersianDigits(inspectionReport.summaryMetrics.booksCount)}
                    </div>
                  </div>
                  <div className="bg-white border border-[#DFD2BE] rounded-xl p-2.5">
                    <div className="text-[11px] text-[#627080]">ارتباط‌های کتاب و شهید</div>
                    <div
                      className="text-base font-bold font-mono tabular-nums text-[#1E4B75] mt-0.5"
                      data-testid="metric-links-count"
                    >
                      {toPersianDigits(inspectionReport.summaryMetrics.bookMartyrLinksCount)}
                    </div>
                  </div>
                  <div className="bg-white border border-[#DFD2BE] rounded-xl p-2.5">
                    <div className="text-[11px] text-[#627080]">ارتباط‌های چندشهیدی</div>
                    <div
                      className="text-base font-bold font-mono tabular-nums text-[#7A5C3E] mt-0.5"
                      data-testid="metric-multi-martyr-count"
                    >
                      {toPersianDigits(inspectionReport.summaryMetrics.multiMartyrRelationsCount)}
                    </div>
                  </div>
                  <div className="bg-white border border-[#DFD2BE] rounded-xl p-2.5">
                    <div className="text-[11px] text-[#627080]">ثبت‌های جدید در فایل</div>
                    <div
                      className="text-base font-bold font-mono tabular-nums text-[#24303F] mt-0.5"
                      data-testid="metric-new-regs-count"
                    >
                      {toPersianDigits(inspectionReport.summaryMetrics.newRegistrationsCount)}
                    </div>
                  </div>
                  <div className="bg-[#EEF8F3] border border-[#94C9AE] rounded-xl p-2.5">
                    <div className="text-[11px] text-[#154932] font-bold">
                      رکوردهای جدید برای افزودن
                    </div>
                    <div
                      className="text-base font-bold font-mono tabular-nums text-[#1E5B45] mt-0.5"
                      data-testid="metric-new-records-to-add"
                    >
                      +{toPersianDigits(inspectionReport.newRecords.length)}
                    </div>
                  </div>
                  <div className="bg-[#F0F6FB] border border-[#9BBCE0] rounded-xl p-2.5">
                    <div className="text-[11px] text-[#132F4C] font-bold">
                      تغییرات تکمیلی شناسایی‌شده
                    </div>
                    <div
                      className="text-base font-bold font-mono tabular-nums text-[#1E4B75] mt-0.5"
                      data-testid="metric-modified-records"
                    >
                      {toPersianDigits(inspectionReport.modifiedRecords.length)}
                    </div>
                  </div>
                  <div className="bg-white border border-[#DFD2BE] rounded-xl p-2.5">
                    <div className="text-[11px] text-[#627080]">از قبل موجود / تکراری بدون تغییر</div>
                    <div
                      className="text-base font-bold font-mono tabular-nums text-[#4A5568] mt-0.5"
                      data-testid="metric-duplicates-count"
                    >
                      {toPersianDigits(
                        inspectionReport.summaryMetrics.existingUnchangedOrDuplicateCount
                      )}
                    </div>
                  </div>
                  <div
                    className={`rounded-xl p-2.5 border ${
                      inspectionReport.conflicts.length > 0
                        ? 'bg-amber-50 border-amber-300 text-amber-950'
                        : 'bg-white border-[#DFD2BE]'
                    }`}
                  >
                    <div className="text-[11px] font-bold">تعارض‌های نیازمند تصمیم</div>
                    <div
                      className="text-base font-bold font-mono tabular-nums mt-0.5"
                      data-testid="metric-conflicts-count"
                    >
                      {toPersianDigits(inspectionReport.conflicts.length)}
                    </div>
                  </div>
                </div>

                {/* نوار تب‌های مشاهده جزئیات مقایسه */}
                <div className="flex flex-wrap items-center gap-1.5 bg-[#FAF7F2] p-1.5 rounded-2xl border border-[#DFD2BE]">
                  <button
                    type="button"
                    onClick={() => setActiveDetailTab('overview')}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-colors cursor-pointer ${
                      activeDetailTab === 'overview'
                        ? 'bg-[#24303F] text-white'
                        : 'text-[#4A5568] hover:bg-[#EFE7DA]'
                    }`}
                  >
                    جدول مقایسه مجموعه‌ها
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDetailTab('new')}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-colors cursor-pointer ${
                      activeDetailTab === 'new'
                        ? 'bg-[#1E5B45] text-white'
                        : 'text-[#4A5568] hover:bg-[#EFE7DA]'
                    }`}
                  >
                    رکوردهای جدید ({toPersianDigits(inspectionReport.newRecords.length)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDetailTab('modified')}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-colors cursor-pointer ${
                      activeDetailTab === 'modified'
                        ? 'bg-[#1E4B75] text-white'
                        : 'text-[#4A5568] hover:bg-[#EFE7DA]'
                    }`}
                  >
                    تغییرات تکمیلی ({toPersianDigits(inspectionReport.modifiedRecords.length)})
                  </button>
                  <button
                    type="button"
                    data-testid="tab-btn-conflicts"
                    onClick={() => setActiveDetailTab('conflicts')}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-colors cursor-pointer ${
                      activeDetailTab === 'conflicts'
                        ? 'bg-amber-700 text-white'
                        : inspectionReport.conflicts.length > 0
                        ? 'bg-amber-100 text-amber-950 font-bold'
                        : 'text-[#4A5568] hover:bg-[#EFE7DA]'
                    }`}
                  >
                    تعارض‌های دو دستگاه ({toPersianDigits(inspectionReport.conflicts.length)})
                  </button>
                  {inspectionReport.invalidRecords.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveDetailTab('invalid')}
                      className={`px-3 py-1.5 rounded-xl font-bold transition-colors cursor-pointer ${
                        activeDetailTab === 'invalid'
                          ? 'bg-red-700 text-white'
                          : 'bg-red-50 text-red-900'
                      }`}
                    >
                      غیرقابل انتقال ({toPersianDigits(inspectionReport.invalidRecords.length)})
                    </button>
                  )}
                </div>

                {/* تب ۱: جدول مقایسه به تفکیک هر مجموعه */}
                {activeDetailTab === 'overview' && (
                  <div className="border border-[#DFD2BE] rounded-2xl overflow-hidden bg-white">
                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-xs border-collapse">
                        <thead>
                          <tr className="bg-[#FAF7F2] border-b border-[#DFD2BE] text-[#4A5568]">
                            <th className="p-2.5">مجموعه اطلاعاتی</th>
                            <th className="p-2.5 text-center">موجود در دستگاه</th>
                            <th className="p-2.5 text-center">در فایل ورودی</th>
                            <th className="p-2.5 text-center text-[#1E5B45]">رکورد جدید</th>
                            <th className="p-2.5 text-center text-[#1E4B75]">تکمیل‌شده</th>
                            <th className="p-2.5 text-center text-amber-800">تعارض</th>
                            <th className="p-2.5 text-center">تکراری / یکسان</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#EFE7DA]">
                          {inspectionReport.collectionComparisons.map((row) => (
                            <tr key={row.key} className="hover:bg-[#FAF7F2]/60">
                              <td className="p-2.5 font-bold text-[#24303F]">{row.label}</td>
                              <td className="p-2.5 text-center font-mono tabular-nums">
                                {toPersianDigits(row.destinationCount)}
                              </td>
                              <td className="p-2.5 text-center font-mono tabular-nums">
                                {toPersianDigits(row.incomingCount)}
                              </td>
                              <td className="p-2.5 text-center font-mono tabular-nums font-bold text-[#1E5B45]">
                                {row.newCount > 0 ? `+${toPersianDigits(row.newCount)}` : '۰'}
                              </td>
                              <td className="p-2.5 text-center font-mono tabular-nums font-bold text-[#1E4B75]">
                                {toPersianDigits(row.modifiedComplementaryCount)}
                              </td>
                              <td className="p-2.5 text-center font-mono tabular-nums font-bold text-amber-800">
                                {toPersianDigits(row.conflictCount)}
                              </td>
                              <td className="p-2.5 text-center font-mono tabular-nums text-[#627080]">
                                {toPersianDigits(row.existingUnchangedCount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* تب ۲: فهرست رکوردهای جدید */}
                {activeDetailTab === 'new' && (
                  <div className="max-h-72 overflow-y-auto border border-[#DFD2BE] rounded-2xl divide-y divide-[#EFE7DA] bg-white p-2">
                    {inspectionReport.newRecords.length === 0 ? (
                      <div className="p-6 text-center text-[#627080]">
                        رکورد جدیدی که در این دستگاه موجود نباشد یافت نشد.
                      </div>
                    ) : (
                      inspectionReport.newRecords.slice(0, 120).map((item, idx) => (
                        <div
                          key={`${item.collection}-${item.recordId}-${idx}`}
                          className="p-2.5 flex items-center justify-between gap-2"
                        >
                          <div>
                            <div className="font-bold text-[#24303F]">{item.titleSummary}</div>
                            <div className="text-[11px] text-[#627080]">
                              مجموعه: {item.collectionLabel} · شناسه اصلی محفوظ: {item.recordId}
                            </div>
                          </div>
                          <span className="text-[11px] font-bold text-[#1E5B45] shrink-0">
                            افزودن با حفظ شناسه
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* تب ۳: فهرست رکوردهای تغییریافته / تکمیلی */}
                {activeDetailTab === 'modified' && (
                  <div className="max-h-72 overflow-y-auto border border-[#DFD2BE] rounded-2xl divide-y divide-[#EFE7DA] bg-white p-2">
                    {inspectionReport.modifiedRecords.length === 0 ? (
                      <div className="p-6 text-center text-[#627080]">
                        تغییر تکمیلی بدون تعارضی یافت نشد.
                      </div>
                    ) : (
                      inspectionReport.modifiedRecords.slice(0, 120).map((item, idx) => (
                        <div
                          key={`${item.collection}-${item.recordId}-${idx}`}
                          className="p-2.5 flex items-center justify-between gap-2"
                        >
                          <div>
                            <div className="font-bold text-[#24303F]">{item.titleSummary}</div>
                            <div className="text-[11px] text-[#627080]">
                              مجموعه: {item.collectionLabel} · تکمیل فیلدهای خالی بدون حذف اطلاعات
                              موجود
                            </div>
                          </div>
                          <span className="text-[11px] font-bold text-[#1E4B75] shrink-0">
                            ادغام تکمیلی امن
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* تب ۴: مدیریت تعارض‌های دو دستگاه */}
                {activeDetailTab === 'conflicts' && (
                  <div className="space-y-3" data-testid="conflicts-resolution-panel">
                    {inspectionReport.conflicts.length === 0 ? (
                      <div className="p-6 text-center bg-white border border-[#DFD2BE] rounded-2xl text-[#1E5B45] font-bold">
                        هیچ تعارضی بین اطلاعات فایل ورودی و اطلاعات فعلی این دستگاه وجود ندارد.
                      </div>
                    ) : (
                      <>
                        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-amber-950 font-bold">
                            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                            <span>
                              {toPersianDigits(inspectionReport.conflicts.length)} رکورد در هر دو
                              دستگاه به شکل متفاوت ویرایش شده‌اند؛ تصمیم خود را انتخاب کنید:
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setAllConflictsDecision('merge-complementary')}
                              className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-amber-950 text-[11px] font-bold cursor-pointer"
                            >
                              همه: حفظ مقصد + تکمیل خالی‌ها
                            </button>
                            <button
                              type="button"
                              onClick={() => setAllConflictsDecision('keep-destination')}
                              className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-amber-950 text-[11px] font-bold cursor-pointer"
                            >
                              همه: فقط نسخه فعلی دستگاه
                            </button>
                          </div>
                        </div>

                        <div className="max-h-80 overflow-y-auto space-y-2.5 pr-0.5">
                          {inspectionReport.conflicts.map((conf) => {
                            const selected =
                              conflictDecisions[conf.conflictId] || 'merge-complementary';
                            return (
                              <div
                                key={conf.conflictId}
                                data-testid={`conflict-item-${conf.recordId}`}
                                className="bg-white border border-[#DFD2BE] rounded-2xl p-3.5 space-y-2.5"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <div className="font-bold text-[#24303F]">
                                      {conf.titleSummary}
                                    </div>
                                    <div className="text-[11px] text-[#627080]">
                                      مجموعه: {conf.collectionLabel} · شناسه: {conf.recordId}
                                    </div>
                                  </div>

                                  <select
                                    value={selected}
                                    aria-label={`تصمیم برای تعارض ${conf.recordId}`}
                                    data-testid={`conflict-select-${conf.recordId}`}
                                    onChange={(e) =>
                                      setConflictDecisions((prev) => ({
                                        ...prev,
                                        [conf.conflictId]: e.target.value as ConflictDecisionOption,
                                      }))
                                    }
                                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#FAF7F2] border border-[#C8B69B] font-bold text-xs text-[#24303F] cursor-pointer"
                                  >
                                    <option value="merge-complementary">
                                      حفظ نسخه فعلی این دستگاه + تکمیل فیلدهای خالی از فایل
                                    </option>
                                    <option value="keep-destination">
                                      حفظ کامل نسخه فعلی این دستگاه (نادیده گرفتن تغییر فایل)
                                    </option>
                                  </select>
                                </div>

                                {/* جدول فیلدهای متفاوت در دو دستگاه */}
                                <div className="bg-[#FAF7F2] border border-[#E5DAC8] rounded-xl overflow-hidden">
                                  <table className="w-full text-right text-[11px] border-collapse">
                                    <thead>
                                      <tr className="border-b border-[#E5DAC8] text-[#627080]">
                                        <th className="p-2">فیلد دارای تفاوت</th>
                                        <th className="p-2">مقدار فعلی در این دستگاه</th>
                                        <th className="p-2">مقدار در فایل ورودی</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#EFE7DA]">
                                      {conf.differingFields.map((df) => (
                                        <tr key={df.fieldKey}>
                                          <td className="p-2 font-bold text-[#24303F]">
                                            {df.fieldLabel}
                                          </td>
                                          <td className="p-2 text-[#1E5B45] font-medium break-words">
                                            {df.destinationValue}
                                          </td>
                                          <td className="p-2 text-[#1E4B75] font-medium break-words">
                                            {df.incomingValue}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* تب ۵: رکوردهای نامعتبر یا غیرقابل انتقال */}
                {activeDetailTab === 'invalid' && (
                  <div className="max-h-64 overflow-y-auto border border-red-200 rounded-2xl divide-y divide-red-100 bg-white p-2">
                    {inspectionReport.invalidRecords.map((inv, idx) => (
                      <div key={idx} className="p-2.5 text-red-900">
                        <div className="font-bold">
                          مجموعه {inv.collection} — کلید/ردیف: {inv.indexOrKey}
                        </div>
                        <div className="text-[11px] text-red-700">{inv.reason}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* نوار نهایی تأیید یا لغو ادغام امن */}
                <div className="bg-[#FAF7F2] border-2 border-[#C8B69B] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-bold text-[#24303F] flex items-center gap-1.5">
                      <Eye className="w-4 h-4 text-[#1E5B45]" />
                      <span>تضمین حفاظت از اطلاعات دستگاه مقصد:</span>
                    </div>
                    <p className="text-[11px] text-[#4A5568]">
                      پیش از اجرای ادغام، یک نسخه پشتیبان خودکار (Recovery Point) از وضعیت فعلی
                      دستگاه تهیه می‌شود و هیچ اطلاعاتی از دستگاه مقصد حذف یا پاکسازی نخواهد شد.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      data-testid="btn-cancel-json-merge"
                      onClick={handleCancelImportWithoutChanges}
                      disabled={isMerging}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-[#C8B69B] text-[#24303F] font-bold cursor-pointer"
                    >
                      لغو و انصراف
                    </button>

                    <button
                      type="button"
                      data-testid="btn-confirm-safe-json-merge"
                      onClick={handleConfirmAndExecuteSafeMerge}
                      disabled={isMerging}
                      className="min-h-[42px] px-5 py-2 rounded-xl bg-[#1E5B45] hover:bg-[#164635] text-white font-bold inline-flex items-center gap-2 cursor-pointer shadow-xs"
                    >
                      <GitMerge className="w-4 h-4" />
                      <span>
                        {isMerging
                          ? 'در حال تهیه پشتیبان و ادغام امن...'
                          : 'تأیید و اجرای ادغام امن'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* بخش بازگردانی از آخرین Recovery Point در صورت نیاز کاربر */}
            {latestRecoveryPoint && !inspectionReport && (
              <div className="bg-[#FAF7F2] border border-[#DFD2BE] rounded-2xl p-4 space-y-3">
                <div className="font-bold text-sm text-[#24303F] flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-[#1E4B75]" />
                  <span>نقطه بازیابی پیش از آخرین ادغام (Recovery Point)</span>
                </div>
                <p className="text-[#4A5568] leading-relaxed">
                  شناسه پشتیبان: <strong className="font-mono">{latestRecoveryPoint.recoveryId}</strong>{' '}
                  · تاریخ ثبت: <strong>{latestRecoveryPoint.createdAtJalali}</strong> · تعداد کل
                  رکوردهای عملیاتی:{' '}
                  <strong>
                    {toPersianDigits(latestRecoveryPoint.recordCounts.totalOperationalItems)}
                  </strong>
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowImportModal(false)}
                    className="px-4 py-2 rounded-xl bg-white border border-[#C8B69B] font-bold cursor-pointer"
                  >
                    بستن
                  </button>
                  <button
                    type="button"
                    onClick={handleRestorePreMergeSnapshot}
                    className="px-4 py-2 rounded-xl bg-[#1E4B75] hover:bg-[#163859] text-white font-bold cursor-pointer"
                  >
                    بازگردانی به وضعیت پیش از ادغام
                  </button>
                </div>
              </div>
            )}
          </div>
        </ModalWindow>
      )}
    </section>
  );
};
