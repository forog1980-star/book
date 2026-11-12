import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Download,
  Upload,
  ShieldAlert,
  CheckCircle2,
  FileSpreadsheet,
  FileJson,
  Trash2,
  RefreshCw,
  Smartphone,
  BookOpen,
  FileText,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import {
  FieldAuditRecord,
  ReferenceCatalogRow,
  toPersianDigits
} from '../data/markazAsnadData';
import { usePWAInstall } from '../utils/usePWAInstall';
import { ComprehensiveDocViewer } from './ComprehensiveDocViewer';
import { ModalWindow } from './ModalWindow';
import {
  BackupInspectionResult,
  calculateCollectionCounts,
  createFullSystemBackupEnvelope,
  executeBackupRestore,
  FullOperationalState,
  inspectBackupFile
} from '../utils/backupService';
import { requestActionConfirmation } from '../utils/confirmDialogService';
import { openStandardExcelExportModal } from '../modules/excel-export';
import {
  getLastGitHubSyncTimeFa,
  guardExternalInternetSearch,
  performManualGitHubSync
} from '../utils/githubSyncService';

interface BackupAndExportTabProps {
  auditRecords: Record<string, FieldAuditRecord>;
  catalogRows: ReferenceCatalogRow[];
  headers: string[];
  currentSheetName: string;
  fullOperationalState?: FullOperationalState;
  onRestoreFullBackup?: (restoredState: FullOperationalState, summaryMessage: string) => void;
  onMergeRecords: (newEntries: Record<string, FieldAuditRecord>) => void;
  onMigrateLegacyRecords: () => number;
  onDeleteSingleRecord: (key: string) => void;
  onNotify: (msg: string, type?: 'success' | 'warning') => void;
  onOpenComprehensiveDoc?: () => void;
}

export const BackupAndExportTab: React.FC<BackupAndExportTabProps> = ({
  auditRecords,
  catalogRows,
  headers,
  currentSheetName,
  fullOperationalState,
  onRestoreFullBackup,
  onMergeRecords,
  onMigrateLegacyRecords,
  onDeleteSingleRecord,
  onNotify,
  onOpenComprehensiveDoc
}) => {
  const [restoreInspection, setRestoreInspection] = useState<{
    fileName: string;
    result: BackupInspectionResult;
  } | null>(null);
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const [isRestoring, setIsRestoring] = useState(false);
  const [showInstallGuideModal, setShowInstallGuideModal] = useState(false);
  const [showComprehensiveDocModal, setShowComprehensiveDocModal] = useState(false);
  const [isSyncingGitHub, setIsSyncingGitHub] = useState(false);
  const [lastGitHubSyncFa, setLastGitHubSyncFa] = useState<string>(() => getLastGitHubSyncTimeFa());
  const { isInstallable, isInstalled, install } = usePWAInstall();

  const handleOpenDoc = () => {
    if (onOpenComprehensiveDoc) {
      onOpenComprehensiveDoc();
    } else {
      setShowComprehensiveDocModal(true);
    }
  };

  const effectiveState: FullOperationalState = fullOperationalState || {
    auditRecords,
    bookCopies: [],
    customMartyrs: [],
    smartSuggestions: [],
    links: [],
    pendingReviews: [],
    multiMartyrGroups: [],
    extractedItems: [],
    auditLog: [],
    userSettings: { activeRole: 'registrar' },
    rejectedSuggestionsArchive: []
  };

  const liveCounts = calculateCollectionCounts(effectiveState);
  const recordsList = Object.values(auditRecords);

  // Detect any legacy SHSF-01-Qxx location codes in localStorage
  const legacyRecords = recordsList.filter(
    (r) =>
      r.shelf?.toString().startsWith('SHSF-') ||
      r.location?.toString().startsWith('SHSF-')
  );

  // Helper for CSV cell escaping
  const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const downloadBlob = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob(['\uFEFF', content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  // ۱. دریافت پشتیبان کامل سامانه (JSON نسخه ۳ شامل هر ۱۱ مجموعه داده عملیاتی)
  const handleExportFullJsonBackup = () => {
    const envelope = createFullSystemBackupEnvelope(effectiveState, '3.5.0');
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadBlob(
      `پشتیبان-کامل-سامانه-مرکز-اسناد-v3-${dateStr}.json`,
      JSON.stringify(envelope, null, 2),
      'application/json;charset=utf-8'
    );
    onNotify(
      `پشتیبان کامل سامانه (JSON نسخه ۳ شامل هر ۱۱ مجموعه داده و مجموعاً ${toPersianDigits(
        envelope.counts.totalOperationalItems
      )} رکورد عملیاتی با Checksum کنترلی ${envelope.checksum}) دانلود شد.`
    );
  };

  // ۲. خروجی تخصصی CSV ثبت‌های میدانی قفسه
  const handleExportAuditCsv = () => {
    if (!recordsList.length) {
      onNotify('هنوز ثبتی در قفسه‌ها برای خروجی تخصصی CSV وجود ندارد.', 'warning');
      return;
    }
    const cols: [keyof FieldAuditRecord, string][] = [
      ['key', 'کلید ثبت'],
      ['tempBookId', 'شناسه موقت کتاب'],
      ['source', 'منبع رکورد'],
      ['sheet', 'شیت مرجع'],
      ['title', 'عنوان کتاب'],
      ['author', 'نویسنده'],
      ['publisher', 'ناشر'],
      ['year', 'سال چاپ'],
      ['category', 'موضوع'],
      ['shelf', 'قفسه'],
      ['level', 'طبقه'],
      ['location', 'کد محل'],
      ['countedCopies', 'تعداد نسخه مشاهده‌شده'],
      ['physical', 'وضعیت مشاهده'],
      ['notes', 'توضیحات'],
      ['updatedAt', 'زمان ثبت']
    ];

    const lines = [
      cols.map((c) => csvCell(c[1])).join(','),
      ...recordsList.map((r) => cols.map((c) => csvCell(r[c[0]])).join(','))
    ];
    downloadBlob('خروجی-تخصصی-ثبت-فیزیکی-کتابخانه.csv', lines.join('\r\n'), 'text/csv;charset=utf-8');
    onNotify('فایل «خروجی-تخصصی-ثبت-فیزیکی-کتابخانه.csv» با موفقیت دانلود شد.');
  };

  // ۳. خروجی تخصصی تغییرات پیشنهادی Excel (با ارتباط کتاب، شهید و محتوای مستند)
  const handleExportProposedExcel = () => {
    if (!recordsList.length) {
      onNotify('هنوز ثبتی برای تهیه خروجی تخصصی تغییرات Excel وجود ندارد.', 'warning');
      return;
    }

    openStandardExcelExportModal({
      mode: 'shelf_records',
      reportTitle: 'گزارش تخصصی ثبت‌های قفسه، تغییرات پیشنهادی و شهدای مرتبط',
      fileNamePrefix: 'خروجی_تخصصی_پیشنهاد_تغییرات_قفسه',
      shelfRecords: recordsList,
      catalogRows,
      auditRecords,
      bookCopies: effectiveState.bookCopies,
      links: effectiveState.links,
      extractedItems: effectiveState.extractedItems,
      customMartyrs: effectiveState.customMartyrs,
      presetId: 'books_with_martyrs'
    });
  };

  // ۴. خروجی تخصصی تلفیقی شیت مرجع + ثبت‌های فیزیکی قفسه + ارتباط شهدا (.xlsx)
  const handleExportCombinedWorkbook = () => {
    openStandardExcelExportModal({
      mode: 'books_list',
      reportTitle: `گزارش تلفیقی فهرست کاری کتابخانه (${currentSheetName})، ثبت‌های قفسه و شهدای مرتبط`,
      fileNamePrefix: 'خروجی_تخصصی_فهرست_کاری_و_ثبت_فیزیکی',
      catalogRows,
      auditRecords,
      bookCopies: effectiveState.bookCopies,
      links: effectiveState.links,
      extractedItems: effectiveState.extractedItems,
      customMartyrs: effectiveState.customMartyrs,
      presetId: 'complete_report'
    });
  };

  // ۵. بررسی و پیش‌نمایش فایل پشتیبان JSON (پشتیبانی از نسخه ۳ کامل و نسخه ۲ قدیمی)
  const handleSelectRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rawText = String(reader.result || '');
        const inspection = inspectBackupFile(rawText, effectiveState);
        if (!inspection.valid) {
          onNotify(`خطا در بررسی فایل پشتیبان: ${inspection.error}`, 'warning');
          return;
        }
        setRestoreMode('merge');
        setRestoreInspection({
          fileName: file.name,
          result: inspection
        });
      } catch (err) {
        onNotify(
          `خطا در بررسی فایل پشتیبان: ${err instanceof Error ? err.message : 'فایل نامعتبر است'}`,
          'warning'
        );
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleConfirmRestore = () => {
    if (!restoreInspection) return;
    const modeLabel =
      restoreMode === 'replace'
        ? 'جایگزینی کامل داده‌های فعلی با فایل پشتیبان'
        : 'ادغام ایمن رکوردهای فایل پشتیبان با داده‌های فعلی';
    requestActionConfirmation({
      title: 'تأیید نهایی بازیابی اطلاعات از فایل پشتیبان',
      message: `آیا از اجرای عملیات «${modeLabel}» از فایل «${restoreInspection.fileName}» اطمینان دارید؟`,
      details:
        restoreMode === 'replace'
          ? 'هشدار: در حالت جایگزینی کامل، داده‌های فعلی سامانه با محتویات فایل پشتیبان جایگزین می‌شوند.'
          : 'رکوردهای جدید به داده‌های فعلی اضافه و به‌روزرسانی می‌شوند.',
      confirmLabel: 'بله، بازیابی اجرا شود',
      variant: restoreMode === 'replace' ? 'delete' : 'approve',
      onConfirm: async () => {
        setIsRestoring(true);
        try {
          const res = await executeBackupRestore(
            restoreInspection.result,
            effectiveState,
            restoreMode
          );
          if (!res.ok) {
            onNotify(res.error || res.summaryMessage, 'warning');
            return;
          }
          if (onRestoreFullBackup) {
            onRestoreFullBackup(res.restoredState, res.summaryMessage);
          } else {
            onMergeRecords(res.restoredState.auditRecords);
            onNotify(res.summaryMessage);
          }
          setRestoreInspection(null);
        } finally {
          setIsRestoring(false);
        }
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Comprehensive Library Document Section & Button */}
      <div className="bg-[#FDF8F2] border-2 border-[#8C3B2B] rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-[#8C3B2B] text-[#FDF8F2] flex items-center justify-center shrink-0 shadow-xs">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm sm:text-base font-extrabold text-[#332218]">
                مشاهده سند جامع کتابخانه مرکز اسناد گلزار شهدا
              </h2>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-lg bg-[#F5E6D3] text-[#8C3B2B] border border-[#E6D5C3]">
                ۲۳ فصل کامل + نسخه چاپی PDF
              </span>
            </div>
            <p className="text-xs text-[#6E5849] leading-relaxed">
              دسترسی مستقیم به متن کامل و نمای برگه چاپی (PDF) سند جامع کتابخانه و پژوهش، طرح کدگذاری قفسه‌ها (SH-01)، گزارش‌های ۱۶گانه مدیریتی و آزمون‌های پذیرش مرکز اسناد گلزار شهدای تهران.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleOpenDoc}
            className="min-h-[46px] px-4 py-2.5 bg-[#8C3B2B] hover:bg-[#702D20] text-[#FDF8F2] text-xs sm:text-sm font-extrabold rounded-xl shadow-xs inline-flex items-center gap-2 transition-colors cursor-pointer"
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>مشاهده سند جامع کتابخانه مرکز اسناد گلزار شهدا</span>
          </button>
        </div>
      </div>

      {/* Priority 1: Legacy SHSF-01-Qxx Data Protection Banner (if any exist) */}
      {legacyRecords.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs sm:text-sm text-amber-950">
              <h3 className="font-bold">
                شناسایی کدهای قدیمی قفسه (SHSF-01-Qxx) در حافظه مرورگر ({toPersianDigits(legacyRecords.length)} مورد)
              </h3>
              <p className="leading-relaxed">
                مطابق اولویت ۱ گزارش فنی، پیش از تبدیل کدهای قدیمی `SHSF-01-Q01..Q06` به الگوی مصوب `SH-01-T01..T06`، ابتدا یک نسخه پشتیبان کامل JSON دریافت کنید و سپس تبدیل امن را اجرا نمایید.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleExportFullJsonBackup}
              className="min-h-[42px] px-4 py-2 bg-white border border-amber-500 text-amber-950 text-xs font-bold rounded-xl"
            >
              ۱. دریافت پشتیبان کامل JSON پیش از مهاجرت
            </button>
            <button
              type="button"
              onClick={() => {
                requestActionConfirmation({
                  title: 'تأیید نهایی تبدیل کدهای قدیمی قفسه',
                  message: `آیا از تبدیل خودکار ${toPersianDigits(legacyRecords.length)} رکورد دارای کد قدیمی SHSF به الگوی استاندارد SH-01-Txx اطمینان دارید؟`,
                  confirmLabel: 'بله، تبدیل کدها انجام شود',
                  variant: 'approve',
                  onConfirm: () => {
                    const count = onMigrateLegacyRecords();
                    onNotify(
                      `${toPersianDigits(count)} رکورد دارای کد قدیمی SHSF با موفقیت به قالب SH-01-Txx مهاجرت داده شد.`
                    );
                  }
                });
              }}
              className="min-h-[42px] px-4 py-2 bg-amber-700 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4" />
              <span>۲. تبدیل امن کدهای SHSF به SH-01-Txx</span>
            </button>
          </div>
        </div>
      )}

      {/* بخش ۱: پشتیبان کامل سامانه (JSON نسخه ۳ - شامل هر ۱۱ مجموعه داده عملیاتی) */}
      <div className="bg-white border-2 border-[#2E7D5B] rounded-2xl p-5 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#2E7D5B]" />
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                پشتیبان کامل سامانه (Full System JSON Backup — نسخه ۳)
              </h2>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                شامل هر ۱۱ مجموعه داده عملیاتی + Checksum
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              تنها خروجی <strong>JSON نسخه ۳</strong> به عنوان <strong>«پشتیبان کامل سامانه»</strong> محسوب می‌شود و کلیه داده‌های ثبت‌شده شما در تمام تب‌ها را پوشش می‌دهد. در زمان بازیابی نیز هر دو قالب نسخه ۳ و فایل‌های قدیمی نسخه ۲ پشتیبانی می‌شوند.
            </p>
          </div>
        </div>

        {/* خلاصه آمار ۱۱ مجموعه داده عملیاتی داخل پشتیبان کامل */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs bg-[#FAF3EA] border border-[#E6D5C1] rounded-xl p-3">
          <div className="bg-white p-2.5 rounded-lg border border-slate-200">
            <span className="text-slate-500 block text-[11px]">۱. ثبت‌های قفسه (BK):</span>
            <strong className="text-sm font-bold text-slate-900">{toPersianDigits(liveCounts.auditRecords)}</strong>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200">
            <span className="text-slate-500 block text-[11px]">۲. نسخه‌های فیزیکی (CP):</span>
            <strong className="text-sm font-bold text-slate-900">{toPersianDigits(liveCounts.bookCopies)}</strong>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200">
            <span className="text-slate-500 block text-[11px]">۳. شهدای ثبتی کاربر:</span>
            <strong className="text-sm font-bold text-slate-900">{toPersianDigits(liveCounts.customMartyrs)}</strong>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200">
            <span className="text-slate-500 block text-[11px]">۴. ارتباطات کتاب و شهید:</span>
            <strong className="text-sm font-bold text-slate-900">{toPersianDigits(liveCounts.links)}</strong>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200">
            <span className="text-slate-500 block text-[11px]">۵. صف نیازمند بررسی:</span>
            <strong className="text-sm font-bold text-slate-900">{toPersianDigits(liveCounts.pendingReviews)}</strong>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200">
            <span className="text-slate-500 block text-[11px]">۶. ۱۶ گروه چندشهیدی:</span>
            <strong className="text-sm font-bold text-slate-900">{toPersianDigits(liveCounts.multiMartyrGroups)}</strong>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200">
            <span className="text-slate-500 block text-[11px]">۷. مطالب استخراج‌شده:</span>
            <strong className="text-sm font-bold text-slate-900">{toPersianDigits(liveCounts.extractedItems)}</strong>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200">
            <span className="text-slate-500 block text-[11px]">۸. صف پیشنهاد هوشمند:</span>
            <strong className="text-sm font-bold text-slate-900">{toPersianDigits(liveCounts.smartSuggestions)}</strong>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200">
            <span className="text-slate-500 block text-[11px]">۹. بایگانی ردشده‌ها:</span>
            <strong className="text-sm font-bold text-slate-900">{toPersianDigits(liveCounts.rejectedSuggestionsArchive)}</strong>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200">
            <span className="text-slate-500 block text-[11px]">۱۰. تاریخچه عملیات:</span>
            <strong className="text-sm font-bold text-slate-900">{toPersianDigits(liveCounts.auditLog)}</strong>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200">
            <span className="text-slate-500 block text-[11px]">۱۱. تنظیمات نقش کاربر:</span>
            <strong className="text-sm font-bold text-slate-900">{toPersianDigits(liveCounts.userSettings)}</strong>
          </div>
          <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-300">
            <span className="text-emerald-800 block text-[11px] font-bold">مجموع کل رکوردها:</span>
            <strong className="text-sm font-extrabold text-emerald-900">
              {toPersianDigits(liveCounts.totalOperationalItems)}
            </strong>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handleExportFullJsonBackup}
            className="min-h-[58px] p-4 bg-[#2E7D5B] hover:bg-[#236347] text-white rounded-2xl text-right flex items-center justify-between gap-3 transition-colors cursor-pointer shadow-xs"
          >
            <div>
              <div className="font-bold text-sm">دریافت پشتیبان کامل سامانه (JSON نسخه ۳)</div>
              <div className="text-[11px] text-emerald-100 mt-0.5">
                شامل هر ۱۱ مجموعه داده عملیاتی + کد کنترلی Checksum و زمان‌بندی
              </div>
            </div>
            <FileJson className="w-6 h-6 shrink-0" />
          </button>

          <label className="min-h-[58px] p-4 bg-[#edf4fa] hover:bg-[#dfeaf5] text-[#162b3b] border-2 border-[#1f4e79] rounded-2xl text-right flex items-center justify-between gap-3 cursor-pointer transition-colors">
            <div>
              <div className="font-bold text-sm">بازیابی کامل یا ادغام امن پشتیبان JSON (با پیش‌نمایش)</div>
              <div className="text-[11px] text-slate-700 mt-0.5">
                پشتیبانی از نسخه ۳ (۱۱ مجموعه) و نسخه ۲ قدیمی؛ دارای محافظت Rollback خودکار
              </div>
            </div>
            <Upload className="w-6 h-6 shrink-0 text-[#1f4e79]" />
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleSelectRestoreFile}
              className="hidden"
            />
          </label>
        </div>

        {/* پیش‌نمایش جامع بررسی فایل پشتیبان پیش از بازیابی (بند ۲ دستور جامع) */}
        {restoreInspection && (
          <div className="mt-4 bg-[#f2f7fb] border-2 border-[#1f4e79] rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  پیش‌نمایش و گزارش تفاوت‌های فایل پشتیبان: «{restoreInspection.fileName}»
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  نسخه تشخیص‌داده‌شده:{' '}
                  <strong>
                    طرح‌واره نسخه {toPersianDigits(restoreInspection.result.detectedSchemaVersion)}
                  </strong>{' '}
                  | تاریخ صدور: <span dir="ltr">{restoreInspection.result.exportedAt}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                {restoreInspection.result.checksumValid ? (
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-bold inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>اصالت Checksum تأیید شد</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold inline-flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>هشدار تغییر دستی در فایل (Checksum متفاوت)</span>
                  </span>
                )}
              </div>
            </div>

            {restoreInspection.result.isLegacyPartialBackup && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-950">
                توجه: این فایل با قالب قدیمی <strong>نسخه ۲</strong> تهیه شده و تنها شامل مجموعه «ثبت‌های میدانی قفسه» است. در زمان بازیابی، سایر ۱۰ مجموعه داده فعلی شما بدون تغییر حفظ خواهند شد.
              </div>
            )}

            {/* خلاصه کلی تفاوت‌ها */}
            <div className="grid grid-cols-3 gap-2.5 text-xs">
              <div className="bg-white p-3 rounded-xl border border-emerald-200">
                <span className="text-emerald-700 block">رکوردهای جدید در فایل پشتیبان:</span>
                <strong className="text-base font-bold text-emerald-800 tabular-nums">
                  {toPersianDigits(restoreInspection.result.totalNewItems)}
                </strong>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200">
                <span className="text-slate-600 block">رکوردهای کاملاً یکسان (تکراری):</span>
                <strong className="text-base font-bold text-slate-800 tabular-nums">
                  {toPersianDigits(restoreInspection.result.totalDuplicates)}
                </strong>
              </div>
              <div className="bg-white p-3 rounded-xl border border-amber-200">
                <span className="text-amber-800 block">رکوردهای دارای تفاوت/تعارض:</span>
                <strong className="text-base font-bold text-amber-900 tabular-nums">
                  {toPersianDigits(restoreInspection.result.totalConflicts)}
                </strong>
              </div>
            </div>

            {/* جدول تفکیکی هر ۱۱ مجموعه داده */}
            <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                    <th className="py-2 px-3">مجموعه داده</th>
                    <th className="py-2 px-3 text-center">موجود فعلی</th>
                    <th className="py-2 px-3 text-center">در فایل پشتیبان</th>
                    <th className="py-2 px-3 text-center text-emerald-700">جدید (+)</th>
                    <th className="py-2 px-3 text-center text-slate-500">یکسان (=)</th>
                    <th className="py-2 px-3 text-center text-amber-700">تفاوت (≠)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {restoreInspection.result.collectionDiffs.map((diff) => (
                    <tr key={diff.key} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-medium text-slate-900">{diff.label}</td>
                      <td className="py-2 px-3 text-center tabular-nums">
                        {toPersianDigits(diff.currentCount)}
                      </td>
                      <td className="py-2 px-3 text-center font-bold tabular-nums">
                        {toPersianDigits(diff.backupCount)}
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-emerald-700 tabular-nums">
                        {toPersianDigits(diff.newItemsCount)}
                      </td>
                      <td className="py-2 px-3 text-center text-slate-500 tabular-nums">
                        {toPersianDigits(diff.duplicateOrSameCount)}
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-amber-700 tabular-nums">
                        {toPersianDigits(diff.conflictCount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* انتخاب حالت بازیابی: ادغام امن در برابر جایگزینی کامل */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5 text-xs">
              <div className="font-bold text-slate-900">انتخاب روش اعمال فایل پشتیبان:</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label
                  className={`p-3 rounded-xl border cursor-pointer flex items-start gap-2.5 transition-colors ${
                    restoreMode === 'merge'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-950'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="restoreMode"
                    checked={restoreMode === 'merge'}
                    onChange={() => setRestoreMode('merge')}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-bold">۱. ادغام امن (Safe Merge — توصیه‌شده)</div>
                    <div className="text-[11px] opacity-90 mt-0.5">
                      رکوردهای جدید فایل پشتیبان اضافه می‌شوند و رکوردهای جدیدتر موجود در دستگاه شما هرگز با داده قدیمی‌تر بازنویسی نمی‌شوند.
                    </div>
                  </div>
                </label>

                <label
                  className={`p-3 rounded-xl border cursor-pointer flex items-start gap-2.5 transition-colors ${
                    restoreMode === 'replace'
                      ? 'bg-amber-50 border-amber-500 text-amber-950'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="restoreMode"
                    checked={restoreMode === 'replace'}
                    onChange={() => setRestoreMode('replace')}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-bold">۲. بازیابی کامل (Full Replace)</div>
                    <div className="text-[11px] opacity-90 mt-0.5">
                      مجموعه‌های موجود در فایل پشتیبان دقیقاً جایگزین وضعیت فعلی می‌شوند (همراه با محافظت بازگشت خودکار در صورت خطا).
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => setRestoreInspection(null)}
                className="min-h-[40px] px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
              >
                لغو عملیات
              </button>
              <button
                type="button"
                disabled={isRestoring}
                onClick={handleConfirmRestore}
                className="min-h-[40px] px-5 py-2 bg-[#1f4e79] hover:bg-[#163a5b] disabled:opacity-50 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {isRestoring
                    ? 'در حال اعمال تراکنشی...'
                    : restoreMode === 'merge'
                    ? 'تأیید و اجرای ادغام امن (Safe Merge)'
                    : 'تأیید و اجرای بازیابی کامل (Replace)'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* بخش ۲: خروجی‌های تخصصی Excel و CSV (ویژه ثبت‌های قفسه و کتاب‌ها - بند ۳ دستور جامع) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            گزارش‌ها و خروجی‌های تخصصی Excel / CSV (ویژه ثبت‌های میدانی قفسه و فهرست کتاب‌ها)
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            این خروجی‌ها <strong>گزارش تخصصی جدول کتاب‌ها و قفسه‌ها</strong> برای بازبینی در نرم‌افزار Excel هستند (و جایگزین پشتیبان کامل ۱۱گانه JSON نمی‌باشند).
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={handleExportProposedExcel}
            className="min-h-[54px] p-4 bg-[#1f4e79] hover:bg-[#163a5b] text-white rounded-2xl text-right flex items-center justify-between gap-3 transition-colors cursor-pointer"
          >
            <div>
              <div className="font-bold text-sm">خروجی تخصصی تغییرات قفسه (Excel)</div>
              <div className="text-[11px] text-sky-100 mt-0.5">
                فایل .xlsx مستقل از ثبت‌های قفسه (بدون تغییر فایل مرجع اصلی)
              </div>
            </div>
            <FileSpreadsheet className="w-5 h-5 shrink-0" />
          </button>

          <button
            type="button"
            onClick={handleExportCombinedWorkbook}
            className="min-h-[54px] p-4 bg-emerald-800 hover:bg-emerald-900 text-white rounded-2xl text-right flex items-center justify-between gap-3 transition-colors cursor-pointer"
          >
            <div>
              <div className="font-bold text-sm">خروجی تلفیقی شیت مرجع + ثبت قفسه</div>
              <div className="text-[11px] text-emerald-100 mt-0.5">
                شیت کتاب‌ها به همراه ستون‌های محل و کتاب‌های خارج از فهرست
              </div>
            </div>
            <Download className="w-5 h-5 shrink-0" />
          </button>

          <button
            type="button"
            onClick={handleExportAuditCsv}
            className="min-h-[54px] p-4 bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 rounded-2xl text-right flex items-center justify-between gap-3 transition-colors cursor-pointer"
          >
            <div>
              <div className="font-bold text-sm">خروجی تخصصی CSV ثبت‌های میدانی</div>
              <div className="text-[11px] text-slate-600 mt-0.5">
                فایل متنی سازگار با Excel (UTF-8 BOM)
              </div>
            </div>
            <Download className="w-5 h-5 shrink-0 text-[#1f4e79]" />
          </button>
        </div>
      </div>

      {/* Complete Ledger of Saved Field Registrations in Browser Memory */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">
              فهرست ثبت‌های قفسه ذخیره‌شده در حافظه این دستگاه ({toPersianDigits(recordsList.length)} مورد)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              امکان بازبینی تک‌تک رکوردهای ثبت‌شده قفسه پیش از خروجی گرفتن برای Excel
            </p>
          </div>
        </div>

        {recordsList.length === 0 ? (
          <p className="text-xs text-slate-500 py-8 text-center">
            هنوز کتابی در قفسه‌های این دستگاه ثبت نشده است. از تب «کتابخانه» اولین کتاب را ثبت کنید.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                  <th className="py-2.5 px-3 whitespace-nowrap">شناسه</th>
                  <th className="py-2.5 px-3">عنوان کتاب</th>
                  <th className="py-2.5 px-3">گروه موضوعی</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">کد محل (SH-xx-Txx)</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">تعداد</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">وضعیت</th>
                  <th className="py-2.5 px-3">توضیحات</th>
                  <th className="py-2.5 px-3 text-left">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {recordsList.map((rec) => (
                  <tr key={rec.key} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-bold text-[#1f4e79] whitespace-nowrap" dir="ltr">
                      {rec.tempBookId || rec.key}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900">{rec.title}</div>
                      <div className="text-[11px] text-slate-500">
                        {[
                          rec.publisher,
                          rec.author,
                          rec.source === 'outside-list' ? 'خارج از فهرست Excel' : `شیت: ${rec.sheet}`
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-800">{rec.category}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap" dir="ltr">
                      {rec.location || '—'}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums font-bold text-center">
                      {toPersianDigits(rec.countedCopies || '1')}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {rec.physical === 'verified' ? (
                        <span className="text-emerald-700 font-bold">دیده شد و ثبت شد</span>
                      ) : rec.physical === 'review' ? (
                        <span className="text-amber-700 font-bold">نیازمند بررسی</span>
                      ) : (
                        <span className="text-red-700 font-bold">پیدا نشد</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{rec.notes || '—'}</td>
                    <td className="py-2.5 px-3 text-left">
                      <button
                        type="button"
                        onClick={() => onDeleteSingleRecord(rec.key)}
                        className="p-1.5 text-slate-400 hover:text-red-700 transition-colors"
                        title="حذف این ثبت از حافظه مرورگر"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section: Manual On-Demand GitHub Sync & Offline Isolation Control */}
      <div className="bg-[#EDF4FB] border-2 border-[#C5D9ED] rounded-2xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#2E6F40] shrink-0" />
            <h3 className="text-sm sm:text-base font-bold text-[#1E3A5F]">
              مدیریت حالت ۱۰۰٪ آفلاین و کلید همگام‌سازی دستی با گیت‌هاب
            </h3>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-[#EDF6F0] border border-[#A8D5B5] text-[#1E4D2B] text-[11px] font-bold">
            وضعیت پیش‌فرض: قطع کامل ارتباط با گیت‌هاب و اینترنت (ایزوله)
          </span>
        </div>

        <p className="text-xs text-[#253247] leading-relaxed">
          این نرم‌افزار (چه روی گوشی و چه روی سیستم) در حالت عادی <strong>هیچ درخواستی به اینترنت یا گیت‌هاب نمی‌فرستد</strong> و حتی در حالت پرواز یا بدون فیلترشکن با تمام جزئیات از حافظه داخلی دستگاه کار می‌کند. تنها زمانی که تغییراتی در کدهای گیت‌هاب ثبت شد، اینترنت را وصل کرده و دکمه زیر را بزنید تا در یک لحظه بروزرسانی انجام شده و ارتباط مجدداً قطع شود.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            type="button"
            disabled={isSyncingGitHub}
            onClick={async () => {
              if (isSyncingGitHub) return;
              setIsSyncingGitHub(true);
              const res = await performManualGitHubSync((msg) => onNotify(msg, 'warning'));
              setIsSyncingGitHub(false);
              if (res.ok) {
                if (res.syncedAtFa) setLastGitHubSyncFa(res.syncedAtFa);
                onNotify(res.message, 'success');
                window.setTimeout(() => {
                  window.location.reload();
                }, 1200);
              } else {
                onNotify(res.message, 'warning');
              }
            }}
            className="min-h-[42px] px-4 py-2 text-xs font-bold bg-[#2E6F40] text-white hover:bg-[#235632] rounded-xl transition-colors inline-flex items-center gap-2 cursor-pointer disabled:opacity-60 shadow-xs"
          >
            <RefreshCw className={`w-4 h-4 shrink-0 ${isSyncingGitHub ? 'animate-spin' : ''}`} />
            <span>
              {isSyncingGitHub
                ? 'در حال دریافت بروزرسانی از گیت‌هاب...'
                : 'همگام‌سازی و دریافت آخرین بروزرسانی از گیت‌هاب'}
            </span>
          </button>

          <div className="text-[11px] text-[#5C4033] font-semibold">
            آخرین بروزرسانی دستی از گیت‌هاب: <span className="font-bold">{lastGitHubSyncFa}</span>
          </div>
        </div>
      </div>

      {/* Section: Android PWA Installation, Offline Single-File HTML & Mobile Direct Access Links */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
        <h3 className="text-sm sm:text-base font-bold text-slate-900">
          نصب روی گوشی اندروید، نسخه تک‌فایل آفلاین و لینک مستقیم موبایل
        </h3>
        <p className="text-xs text-slate-600 leading-relaxed">
          برای نصب مستقیم برنامه روی صفحه اصلی گوشی اندروید (جهت استفاده آفلاین کنار قفسه‌ها)، دریافت فایل تک‌صفحه‌ای ویندوز/موبایل یا دسترسی به لینک مستقیم گیت‌هاب از دکمه‌های زیر استفاده کنید:
        </p>
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          {!isInstalled && (
            <button
              type="button"
              onClick={async () => {
                if (isInstallable) {
                  await install();
                } else {
                  setShowInstallGuideModal(true);
                }
              }}
              className="min-h-[42px] px-4 py-2 text-xs font-bold bg-[#2E7D5B] text-white hover:bg-[#236347] rounded-xl transition-colors inline-flex items-center gap-2 cursor-pointer"
            >
              <Smartphone className="w-4 h-4 shrink-0" />
              <span>نصب روی گوشی اندروید</span>
            </button>
          )}

          <a
            href="./library-quick-inventory.html"
            download="library-quick-inventory.html"
            className="min-h-[42px] px-4 py-2 text-xs font-bold bg-amber-100 text-amber-950 hover:bg-amber-200 border border-amber-300 rounded-xl transition-colors inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>دانلود نسخه تک‌فایل آفلاین (HTML)</span>
          </a>

          <a
            href="https://raw.githack.com/forog1980-star/book/main/%D8%AE%D8%B1%D9%88%D8%AC%DB%8C%20%D9%86%D8%B1%D9%85%E2%80%8C%D8%A7%D9%81%D8%B2%D8%A7%D8%B1/index.html"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              guardExternalInternetSearch(e, 'لینک مستقیم گیت‌هاب', onNotify);
            }}
            className="min-h-[42px] px-4 py-2 text-xs font-bold bg-[#1f4e79] text-white hover:bg-[#163a5b] rounded-xl transition-colors inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>لینک مستقیم موبایل (گیت‌هاب)</span>
          </a>
        </div>
      </div>

      {showInstallGuideModal && (
        <ModalWindow
          onClose={() => setShowInstallGuideModal(false)}
          title="راهنمای نصب برنامه روی صفحه اصلی گوشی اندروید (PWA)"
          maxWidthClass="max-w-md"
        >
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
        </ModalWindow>
      )}

      <ComprehensiveDocViewer
        isOpen={showComprehensiveDocModal}
        onClose={() => setShowComprehensiveDocModal(false)}
        onNotify={onNotify}
      />
    </div>
  );
};
