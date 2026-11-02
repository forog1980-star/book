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
  FileText
} from 'lucide-react';
import {
  FieldAuditRecord,
  ReferenceCatalogRow,
  toPersianDigits
} from '../data/markazAsnadData';
import { usePWAInstall } from '../utils/usePWAInstall';
import { ComprehensiveDocViewer } from './ComprehensiveDocViewer';

interface BackupAndExportTabProps {
  auditRecords: Record<string, FieldAuditRecord>;
  catalogRows: ReferenceCatalogRow[];
  headers: string[];
  currentSheetName: string;
  onMergeRecords: (newEntries: Record<string, FieldAuditRecord>) => void;
  onMigrateLegacyRecords: () => number;
  onDeleteSingleRecord: (key: string) => void;
  onNotify: (msg: string, type?: 'success' | 'warning') => void;
  onOpenComprehensiveDoc?: () => void;
}

interface PendingRestorePreview {
  fileName: string;
  totalInFile: number;
  newRecordsToAdd: Record<string, FieldAuditRecord>;
  existingConflictCount: number;
  invalidCount: number;
}

export const BackupAndExportTab: React.FC<BackupAndExportTabProps> = ({
  auditRecords,
  catalogRows,
  headers,
  currentSheetName,
  onMergeRecords,
  onMigrateLegacyRecords,
  onDeleteSingleRecord,
  onNotify,
  onOpenComprehensiveDoc
}) => {
  const [restorePreview, setRestorePreview] = useState<PendingRestorePreview | null>(null);
  const [showInstallGuideModal, setShowInstallGuideModal] = useState(false);
  const [showComprehensiveDocModal, setShowComprehensiveDocModal] = useState(false);
  const { isInstallable, isInstalled, install } = usePWAInstall();

  const handleOpenDoc = () => {
    if (onOpenComprehensiveDoc) {
      onOpenComprehensiveDoc();
    } else {
      setShowComprehensiveDocModal(true);
    }
  };

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

  // 1. Export JSON Backup
  const handleExportJsonBackup = () => {
    const payload = {
      app: 'markaz-asnad-library-audit',
      version: 2,
      exportedAt: new Date().toISOString(),
      recordCount: recordsList.length,
      records: auditRecords
    };
    downloadBlob(
      'پشتیبان-نرم‌افزار-کتابخانه.json',
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8'
    );
    onNotify(`پشتیبان JSON شامل ${toPersianDigits(recordsList.length)} ثبت دانلود شد.`);
  };

  // 2. Export Field Registrations CSV
  const handleExportAuditCsv = () => {
    if (!recordsList.length) {
      onNotify('هنوز ثبتی برای خروجی وجود ندارد.', 'warning');
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
    downloadBlob('ثبت-فیزیکی-کتابخانه.csv', lines.join('\r\n'), 'text/csv;charset=utf-8');
    onNotify('فایل «ثبت-فیزیکی-کتابخانه.csv» با موفقیت دانلود شد.');
  };

  // 3. Export Proposed Excel Changes (.xlsx & .csv) without touching original file
  const handleExportProposedExcel = () => {
    if (!recordsList.length) {
      onNotify('هنوز ثبتی برای تهیه خروجی تغییرات Excel وجود ندارد.', 'warning');
      return;
    }

    const rowsForSheet = recordsList.map((r) => ({
      'کلید تطبیق/ردیف': r.key,
      'شناسه موقت کتاب': r.tempBookId || '',
      'نوع رکورد': r.source === 'outside-list' ? 'خارج از فهرست (نیازمند تطبیق)' : 'موجود در فهرست مرجع',
      'شیت مرجع': r.sheet,
      'عنوان کتاب': r.title,
      'نویسنده/گردآورنده': r.author,
      'ناشر': r.publisher,
      'سال چاپ': r.year,
      'دسته موضوعی': r.category,
      'قفسه': r.shelf,
      'طبقه': r.level,
      'محل نگهداری/قفسه (SH-xx-Txx)': r.location,
      'تعداد نسخه‌های موجود پس از شمارش': r.countedCopies || '1',
      'وضعیت بررسی کتاب':
        r.physical === 'verified'
          ? 'دیده شد و ثبت شد'
          : r.physical === 'review'
          ? 'نیازمند بررسی مشخصات'
          : 'در این نوبت پیدا نشد',
      'یادداشت': r.notes,
      'زمان ثبت': r.updatedAt
    }));

    const ws = XLSX.utils.json_to_sheet(rowsForSheet);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'پیشنهاد تغییرات');
    XLSX.writeFile(wb, 'پیشنهاد-تغییرات-برای-بررسی-اکسل.xlsx');
    onNotify(
      'فایل «پیشنهاد-تغییرات-برای-بررسی-اکسل.xlsx» تولید شد؛ فایل مرجع اصلی بدون تغییر باقی ماند.'
    );
  };

  // 4. Export Combined Reference Sheet + Physical Registrations (.xlsx)
  const handleExportCombinedWorkbook = () => {
    const combinedHeader = [
      ...headers,
      'گروه موضوعی ثبت‌شده',
      'قفسه (SH)',
      'طبقه (T)',
      'کد محل (SH-xx-Txx)',
      'تعداد شمارش‌شده',
      'وضعیت مشاهده میدانی',
      'توضیحات میدانی',
      'زمان ثبت'
    ];

    const matrix: string[][] = [combinedHeader];

    for (const row of catalogRows) {
      const rec = auditRecords[row.rowKey];
      const baseValues = headers.map((_, idx) => row.allValues[idx] ?? '');
      matrix.push([
        ...baseValues,
        rec?.category || '',
        rec?.shelf || '',
        rec?.level || '',
        rec?.location || '',
        rec?.countedCopies || '',
        rec?.physical || '',
        rec?.notes || '',
        rec?.updatedAt || ''
      ]);
    }

    // Also include outside-list books in a separate sheet so nothing is lost
    const outsideRecords = recordsList.filter((r) => r.source === 'outside-list');

    const wb = XLSX.utils.book_new();
    const wsMain = XLSX.utils.aoa_to_sheet(matrix);
    XLSX.utils.book_append_sheet(wb, wsMain, currentSheetName.slice(0, 31) || 'فهرست همراه ثبت');

    if (outsideRecords.length > 0) {
      const wsOutside = XLSX.utils.json_to_sheet(
        outsideRecords.map((r) => ({
          'شناسه موقت': r.tempBookId,
          'کلید ثبت': r.key,
          'عنوان روی کتاب': r.title,
          'نویسنده': r.author,
          'ناشر': r.publisher,
          'سال چاپ': r.year,
          'گروه موضوعی': r.category,
          'کد محل': r.location,
          'تعداد نسخه': r.countedCopies,
          'یادداشت': r.notes,
          'زمان ثبت': r.updatedAt
        }))
      );
      XLSX.utils.book_append_sheet(wb, wsOutside, 'کتاب‌های خارج از فهرست');
    }

    XLSX.writeFile(wb, 'فهرست-کاری-همراه-با-ثبت-فیزیکی-نسخه-پشتیبان.xlsx');
    onNotify('فایل اکسل تلفیقی شیت مرجع + ثبت‌های فیزیکی و کتاب‌های خارج از فهرست دانلود شد.');
  };

  // 5. Safe JSON Restore with Pre-Flight Inspection
  const handleSelectRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ''));
        if (
          !parsed ||
          typeof parsed !== 'object' ||
          !parsed.records ||
          typeof parsed.records !== 'object' ||
          Array.isArray(parsed.records)
        ) {
          throw new Error('ساختار فایل پشتیبان JSON معتبر نیست (فیلد records یافت نشد).');
        }

        const entries = Object.entries(parsed.records) as [string, FieldAuditRecord][];
        if (!entries.length) {
          onNotify('فایل پشتیبان انتخاب‌شده هیچ رکوردی ندارد.', 'warning');
          return;
        }

        const newRecordsToAdd: Record<string, FieldAuditRecord> = {};
        let existingConflictCount = 0;
        let invalidCount = 0;

        for (const [k, rec] of entries) {
          if (!k || !rec || typeof rec !== 'object' || typeof rec.title !== 'string' || !rec.title.trim()) {
            invalidCount++;
            continue;
          }
          if (Object.prototype.hasOwnProperty.call(auditRecords, k)) {
            existingConflictCount++;
          } else {
            newRecordsToAdd[k] = {
              ...rec,
              tempBookId: rec.tempBookId || k.split('::')[1] || k,
              countedCopies: rec.countedCopies || '1'
            };
          }
        }

        setRestorePreview({
          fileName: file.name,
          totalInFile: entries.length,
          newRecordsToAdd,
          existingConflictCount,
          invalidCount
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

  const confirmSafeMerge = () => {
    if (!restorePreview) return;
    const addedCount = Object.keys(restorePreview.newRecordsToAdd).length;
    onMergeRecords(restorePreview.newRecordsToAdd);
    onNotify(
      `بازیابی امن انجام شد: ${toPersianDigits(addedCount)} ثبت جدید افزوده شد و ${toPersianDigits(
        restorePreview.existingConflictCount
      )} کلید موجود بدون بازنویسی حفظ گردید.`
    );
    setRestorePreview(null);
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
                مطابق اولویت ۱ گزارش فنی، پیش از تبدیل کدهای قدیمی `SHSF-01-Q01..Q06` به الگوی مصوب `SH-01-T01..T06`، ابتدا یک نسخه پشتیبان JSON دریافت کنید و سپس تبدیل امن را اجرا نمایید.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleExportJsonBackup}
              className="min-h-[42px] px-4 py-2 bg-white border border-amber-500 text-amber-950 text-xs font-bold rounded-xl"
            >
              ۱. دریافت پشتیبان JSON پیش از مهاجرت
            </button>
            <button
              type="button"
              onClick={() => {
                const count = onMigrateLegacyRecords();
                onNotify(
                  `${toPersianDigits(count)} رکورد دارای کد قدیمی SHSF با موفقیت به قالب SH-01-Txx مهاجرت داده شد.`
                );
              }}
              className="min-h-[42px] px-4 py-2 bg-amber-700 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4" />
              <span>۲. تبدیل امن کدهای SHSF به SH-01-Txx</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Export & Backup Grid */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            پشتیبان‌گیری، بازیابی امن JSON و خروجی‌های بررسی Excel
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            اطلاعات ثبت‌شده در حافظه مرورگر همین دستگاه نگهداری می‌شود. پایان هر نوبت کاری، حتماً «پشتیبان JSON» و «خروجی پیشنهاد تغییرات Excel» را دریافت و در محل امن ذخیره کنید.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={handleExportProposedExcel}
            className="min-h-[54px] p-4 bg-[#1f4e79] hover:bg-[#163a5b] text-white rounded-2xl text-right flex items-center justify-between gap-3 transition-colors"
          >
            <div>
              <div className="font-bold text-sm">خروجی تغییرات برای بررسی Excel</div>
              <div className="text-[11px] text-sky-100 mt-0.5">
                فایل .xlsx مستقل (بدون تغییر فایل مرجع اصلی)
              </div>
            </div>
            <FileSpreadsheet className="w-5 h-5 shrink-0" />
          </button>

          <button
            type="button"
            onClick={handleExportCombinedWorkbook}
            className="min-h-[54px] p-4 bg-emerald-800 hover:bg-emerald-900 text-white rounded-2xl text-right flex items-center justify-between gap-3 transition-colors"
          >
            <div>
              <div className="font-bold text-sm">خروجی کامل شیت + ثبت‌های فیزیکی</div>
              <div className="text-[11px] text-emerald-100 mt-0.5">
                کپی کامل شیت به همراه ستون‌های محل و کتاب‌های خارج از فهرست
              </div>
            </div>
            <Download className="w-5 h-5 shrink-0" />
          </button>

          <button
            type="button"
            onClick={handleExportAuditCsv}
            className="min-h-[54px] p-4 bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 rounded-2xl text-right flex items-center justify-between gap-3 transition-colors"
          >
            <div>
              <div className="font-bold text-sm">خروجی CSV ثبت‌های میدانی</div>
              <div className="text-[11px] text-slate-600 mt-0.5">
                فایل متنی سازگار با Excel (UTF-8 BOM)
              </div>
            </div>
            <Download className="w-5 h-5 shrink-0 text-[#1f4e79]" />
          </button>

          <button
            type="button"
            onClick={handleExportJsonBackup}
            className="min-h-[54px] p-4 bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 rounded-2xl text-right flex items-center justify-between gap-3 transition-colors"
          >
            <div>
              <div className="font-bold text-sm">دریافت پشتیبان کامل JSON</div>
              <div className="text-[11px] text-slate-600 mt-0.5">
                مناسب نگهداری روزانه و انتقال بین گوشی و رایانه
              </div>
            </div>
            <FileJson className="w-5 h-5 shrink-0 text-[#1f4e79]" />
          </button>

          <label className="sm:col-span-2 min-h-[54px] p-4 bg-[#edf4fa] hover:bg-[#dfeaf5] text-[#162b3b] border border-[#b8d0e8] rounded-2xl text-right flex items-center justify-between gap-3 cursor-pointer transition-colors">
            <div>
              <div className="font-bold text-sm">بازیابی / ادغام امن پشتیبان JSON (با پیش‌نمایش)</div>
              <div className="text-[11px] text-slate-600 mt-0.5">
                بررسی ساختار پیش از اعمال؛ کلیدهای موجود هرگز به‌طور خودکار بازنویسی نمی‌شوند
              </div>
            </div>
            <Upload className="w-5 h-5 shrink-0 text-[#1f4e79]" />
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleSelectRestoreFile}
              className="hidden"
            />
          </label>
        </div>

        {/* Pre-flight Restore Preview Modal / Box (Priority 2 of Technical Report) */}
        {restorePreview && (
          <div className="mt-4 bg-[#f2f7fb] border-2 border-[#1f4e79] rounded-2xl p-4 sm:p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">
              پیش‌نمایش بررسی امن فایل پشتیبان: «{restorePreview.fileName}»
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="bg-white p-3 rounded-xl border border-slate-200">
                <span className="text-slate-500 block">کل ثبت‌های داخل فایل:</span>
                <strong className="text-base font-bold text-slate-900 tabular-nums">
                  {toPersianDigits(restorePreview.totalInFile)}
                </strong>
              </div>
              <div className="bg-white p-3 rounded-xl border border-emerald-200">
                <span className="text-emerald-700 block">ثبت‌های جدید قابل افزودن:</span>
                <strong className="text-base font-bold text-emerald-800 tabular-nums">
                  {toPersianDigits(Object.keys(restorePreview.newRecordsToAdd).length)}
                </strong>
              </div>
              <div className="bg-white p-3 rounded-xl border border-amber-200">
                <span className="text-amber-800 block">کلیدهای تکراری (بازنویسی نمی‌شوند):</span>
                <strong className="text-base font-bold text-amber-900 tabular-nums">
                  {toPersianDigits(restorePreview.existingConflictCount)}
                </strong>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200">
                <span className="text-slate-500 block">رکوردهای ناقص ردشده:</span>
                <strong className="text-base font-bold text-slate-700 tabular-nums">
                  {toPersianDigits(restorePreview.invalidCount)}
                </strong>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRestorePreview(null)}
                className="min-h-[40px] px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl"
              >
                لغو عملیات
              </button>
              <button
                type="button"
                onClick={confirmSafeMerge}
                className="min-h-[40px] px-5 py-2 bg-[#1f4e79] text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>تأیید و ادغام ثبت‌های جدید</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Complete Ledger of Saved Field Registrations in Browser Memory */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">
              فهرست ثبت‌های ذخیره‌شده در حافظه این دستگاه ({toPersianDigits(recordsList.length)} مورد)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              امکان بازبینی تک‌تک رکوردهای ثبت‌شده پیش از خروجی گرفتن برای Excel
            </p>
          </div>
        </div>

        {recordsList.length === 0 ? (
          <p className="text-xs text-slate-500 py-8 text-center">
            هنوز کتابی در حافظه این دستگاه ثبت نشده است. از تب «ثبت سریع موجودی» اولین کتاب را ثبت کنید.
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
            className="min-h-[42px] px-4 py-2 text-xs font-bold bg-[#1f4e79] text-white hover:bg-[#163a5b] rounded-xl transition-colors inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>لینک مستقیم موبایل (گیت‌هاب)</span>
          </a>
        </div>
      </div>

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

      <ComprehensiveDocViewer
        isOpen={showComprehensiveDocModal}
        onClose={() => setShowComprehensiveDocModal(false)}
        onNotify={onNotify}
      />
    </div>
  );
};
