import React, { useEffect, useState } from 'react';
import {
  FileSpreadsheet,
  CheckSquare,
  Square,
  Layers,
  BookOpen,
  Users,
  Sparkles,
  Download,
  X,
} from 'lucide-react';
import { ModalWindow } from '../../components/ModalWindow';
import { toPersianDigits } from '../../data/markazAsnadData';
import {
  EXCEL_FIELD_CATEGORIES,
  EXCEL_FIELDS_CATALOG,
  EXCEL_PRESETS,
  EXCEL_SHEETS_CATALOG,
} from './fieldCatalog';
import { generateStandardizedMartyrCentricExcel } from './excelBuilderEngine';
import {
  ExcelExportDatasetContext,
  ExcelFieldCategoryKey,
  ExcelPresetId,
  ExcelReportDirection,
  ExcelSheetKey,
} from './types';

type ConfigRequestListener = (ctx: ExcelExportDatasetContext | null) => void;
let activeListener: ConfigRequestListener | null = null;

function resolveDirectionFromContext(ctx: ExcelExportDatasetContext): ExcelReportDirection {
  if (ctx.direction) return ctx.direction;
  if (ctx.mode === 'martyr_search' || ctx.presetId === 'martyr_dossier') {
    return 'martyr_to_book';
  }
  return 'book_to_martyr';
}

function resolveInitialPresetId(ctx: ExcelExportDatasetContext): ExcelPresetId {
  const p = ctx.presetId;
  if (!p || p === 'complete_report' || p === 'full_comprehensive') {
    return 'full_comprehensive';
  }
  if (p === 'books_with_martyrs') {
    return 'book_with_martyr_and_grave';
  }
  if (p === 'martyr_dossier') {
    return 'full_comprehensive';
  }
  return p;
}

/**
 * باز کردن پنجره مشترک انتخاب فیلدها و برگه‌های Excel از هر جای نرم‌افزار
 */
export function openStandardExcelExportModal(ctx: ExcelExportDatasetContext): void {
  const resolvedDirection = resolveDirectionFromContext(ctx);
  const normalizedCtx: ExcelExportDatasetContext = {
    ...ctx,
    direction: resolvedDirection,
  };
  if (activeListener) {
    activeListener(normalizedCtx);
  } else {
    // در صورتی که مودال هنوز Mount نشده باشد، با تنظیمات جامع پیش‌فرض خروجی استاندارد را تولید کن
    generateStandardizedMartyrCentricExcel(normalizedCtx, {
      reportTitle: normalizedCtx.reportTitle,
      fileNamePrefix: normalizedCtx.fileNamePrefix,
      direction: resolvedDirection,
      selectedFields: new Set(EXCEL_FIELDS_CATALOG.map((f) => f.id)),
      selectedSheets: new Set(EXCEL_SHEETS_CATALOG.map((s) => s.key)),
    });
  }
}

export interface GlobalExcelExportConfigModalProps {
  onNotify?: (msg: string, type?: 'success' | 'warning') => void;
}

export const GlobalExcelExportConfigModal: React.FC<GlobalExcelExportConfigModalProps> = ({
  onNotify,
}) => {
  const [context, setContext] = useState<ExcelExportDatasetContext | null>(null);
  const [direction, setDirection] = useState<ExcelReportDirection>('book_to_martyr');
  const [activePreset, setActivePreset] = useState<ExcelPresetId>('full_comprehensive');
  const [selectedFields, setSelectedFields] = useState<Set<string>>(
    () => new Set(EXCEL_FIELDS_CATALOG.map((f) => f.id))
  );
  const [selectedSheets, setSelectedSheets] = useState<Set<ExcelSheetKey>>(
    () => new Set(EXCEL_SHEETS_CATALOG.map((s) => s.key))
  );

  useEffect(() => {
    const handler: ConfigRequestListener = (incomingCtx) => {
      if (!incomingCtx) {
        setContext(null);
        return;
      }
      const resolvedDir = resolveDirectionFromContext(incomingCtx);
      const initialPresetId = resolveInitialPresetId(incomingCtx);
      const presetObj =
        EXCEL_PRESETS.find((pr) => pr.id === initialPresetId) ||
        EXCEL_PRESETS[EXCEL_PRESETS.length - 1];

      setContext({ ...incomingCtx, direction: resolvedDir });
      setDirection(resolvedDir);
      setActivePreset(presetObj.id);
      setSelectedFields(new Set(presetObj.selectedFields));
      if (resolvedDir === 'martyr_to_book') {
        setSelectedSheets(
          new Set<ExcelSheetKey>([
            'related_martyrs',
            'book_martyr_relations',
            'subjects_and_pages',
            'extracted_passages',
            'main_books',
          ])
        );
      } else {
        setSelectedSheets(new Set(presetObj.selectedSheets));
      }
    };
    activeListener = handler;
    return () => {
      if (activeListener === handler) {
        activeListener = null;
      }
    };
  }, []);

  if (!context) return null;

  const applyPreset = (presetId: ExcelPresetId) => {
    const preset = EXCEL_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setActivePreset(presetId);
    setSelectedFields(new Set(preset.selectedFields));
    setSelectedSheets(new Set(preset.selectedSheets));
  };

  const handleSelectAllFields = () => {
    setActivePreset('full_comprehensive');
    setSelectedFields(new Set(EXCEL_FIELDS_CATALOG.map((f) => f.id)));
    setSelectedSheets(new Set(EXCEL_SHEETS_CATALOG.map((s) => s.key)));
  };

  const handleClearAllFields = () => {
    // حفظ حداقل شناسه و عنوان اصلی برای جلوگیری از خروجی کاملاً بی‌ستون
    setSelectedFields(
      new Set(
        direction === 'martyr_to_book'
          ? ['martyr_id', 'martyr_name']
          : ['book_id', 'book_title']
      )
    );
  };

  const toggleField = (fieldId: string) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(fieldId)) {
        if (next.size > 1) next.delete(fieldId);
      } else {
        next.add(fieldId);
      }
      return next;
    });
  };

  const toggleCategoryGroup = (catKey: ExcelFieldCategoryKey) => {
    const catFields = EXCEL_FIELDS_CATALOG.filter((f) => f.category === catKey).map((f) => f.id);
    const allSelected = catFields.every((id) => selectedFields.has(id));
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of catFields) {
          if (next.size > 1) next.delete(id);
        }
      } else {
        for (const id of catFields) {
          next.add(id);
        }
      }
      return next;
    });
  };

  const toggleSheet = (sheetKey: ExcelSheetKey) => {
    setSelectedSheets((prev) => {
      const next = new Set(prev);
      if (next.has(sheetKey)) {
        if (next.size > 1) next.delete(sheetKey);
      } else {
        next.add(sheetKey);
      }
      return next;
    });
  };

  const handleConfirmGenerate = () => {
    const res = generateStandardizedMartyrCentricExcel(context, {
      reportTitle: context.reportTitle,
      fileNamePrefix: context.fileNamePrefix,
      direction,
      selectedFields,
      selectedSheets,
    });
    setContext(null);
    if (res.ok && onNotify) {
      onNotify(
        `✅ فایل اکسل استاندارد «${res.fileName}» در ${toPersianDigits(
          res.sheetsCount
        )} برگه (با فونت Vazirmatn و ارتباط دوطرفه کتاب و شهید) دانلود شد.`
      );
    }
  };

  return (
    <ModalWindow
      onClose={() => setContext(null)}
      title={`تنظیم و انتخاب فیلدهای خروجی Excel: ${context.reportTitle}`}
      maxWidthClass="max-w-4xl"
    >
      <div className="space-y-4 text-xs text-[#332218]" dir="rtl">
        {/* کادر اصل بنیادین سامانه: محوریت شهید و ارتباط دوطرفه */}
        <div className="bg-[#FAF5EE] border-2 border-[#D8C7B2] rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="font-bold text-sm text-[#6B3E26] flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>اصل بنیادین خروجی مرکز اسناد: ارتباط دوطرفه کتاب، شهید، مزار و محتوای مستند</span>
            </div>
            <p className="text-[11px] text-[#5C4636] leading-relaxed">
              فایل خروجی با فونت فارسی <strong>Vazirmatn</strong>، راست‌به‌چپ، سرصفحه رسمی مرکز اسناد گلزار شهدای تهران، قاب‌بندی جدول، فیلتر ستون‌ها و حفظ کامل روابط چندبه‌چند تولید می‌شود.
            </p>
          </div>

          {/* تغییر جهت محور گزارش (کتاب به شهید / شهید به کتاب) */}
          <div className="flex items-center gap-1.5 bg-white border border-[#D8C7B2] p-1 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => setDirection('book_to_martyr')}
              className={`px-2.5 py-1.5 rounded-lg font-bold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                direction === 'book_to_martyr'
                  ? 'bg-[#6B3E26] text-white'
                  : 'text-[#5C4636] hover:bg-[#FAF5EE]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>از کتاب به شهید</span>
            </button>
            <button
              type="button"
              onClick={() => setDirection('martyr_to_book')}
              className={`px-2.5 py-1.5 rounded-lg font-bold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                direction === 'martyr_to_book'
                  ? 'bg-[#2E6F40] text-white'
                  : 'text-[#5C4636] hover:bg-[#FAF5EE]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>از شهید به کتاب</span>
            </button>
          </div>
        </div>

        {/* بخش ۱: الگوهای آماده انتخاب سریع (۷ الگوی استاندارد بخش دوم دستور) */}
        <div className="bg-white border border-[#E2D2BE] rounded-2xl p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-[#332218]">
              ۱. الگوهای آماده گزارش‌گیری سریع (با یک کلیک):
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="excel-modal-select-all-btn"
                onClick={handleSelectAllFields}
                className="px-2.5 py-1 rounded-lg bg-[#EDF6F0] hover:bg-[#D8EDE0] border border-[#A8D5B5] text-[#1E4D2B] font-bold text-[11px] cursor-pointer"
              >
                ✓ انتخاب همه فیلدها و برگه‌ها
              </button>
              <button
                type="button"
                data-testid="excel-modal-clear-all-btn"
                onClick={handleClearAllFields}
                className="px-2.5 py-1 rounded-lg bg-[#FAF5EE] hover:bg-[#F3E9DC] border border-[#D8C7B2] text-[#6B3E26] font-bold text-[11px] cursor-pointer"
              >
                حذف انتخاب‌ها (حداقل ستون)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {EXCEL_PRESETS.map((preset) => {
              const isSelected = activePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  data-testid={`excel-preset-${preset.id}`}
                  onClick={() => applyPreset(preset.id)}
                  className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer flex flex-col justify-between gap-1 ${
                    isSelected
                      ? 'bg-[#EDF6F0] border-2 border-[#2E6F40] text-[#1E4D2B]'
                      : 'bg-[#FAF5EE]/60 hover:bg-[#FAF5EE] border-[#E2D2BE] text-[#332218]'
                  }`}
                >
                  <div className="font-bold text-xs flex items-center justify-between gap-1">
                    <span>{preset.label}</span>
                    {isSelected && <span className="text-[#2E6F40]">●</span>}
                  </div>
                  <div className="text-[10.5px] text-[#6E5846] leading-snug">
                    {preset.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* بخش ۲: انتخاب برگه‌های مرتبط در فایل Excel (حفظ روابط چندبه‌چند) */}
        <div className="bg-white border border-[#E2D2BE] rounded-2xl p-3.5 space-y-2.5">
          <div className="font-bold text-[#332218] flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-[#6B3E26]" />
            <span>
              ۲. برگه‌های فایل Excel چندبرگه‌ای ({toPersianDigits(selectedSheets.size)} برگه انتخاب‌شده):
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {EXCEL_SHEETS_CATALOG.map((sh) => {
              const checked = selectedSheets.has(sh.key);
              return (
                <button
                  key={sh.key}
                  type="button"
                  data-testid={`excel-sheet-toggle-${sh.key}`}
                  onClick={() => toggleSheet(sh.key)}
                  className={`p-2.5 rounded-xl border text-right flex items-start gap-2.5 transition-colors cursor-pointer ${
                    checked
                      ? 'bg-[#FAF5EE] border-[#6B3E26] text-[#332218]'
                      : 'bg-white border-slate-200 text-slate-500'
                  }`}
                >
                  {checked ? (
                    <CheckSquare className="w-4 h-4 text-[#2E6F40] shrink-0 mt-0.5" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <div className="font-bold text-xs">{sh.title}</div>
                    <div className="text-[10.5px] text-[#6E5846] mt-0.5 leading-snug">
                      {sh.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* بخش ۳: انتخاب مستقل فیلدها در ۹ دسته‌بندی تخصصی */}
        <div className="bg-white border border-[#E2D2BE] rounded-2xl p-3.5 space-y-3 max-h-80 overflow-y-auto">
          <div className="font-bold text-[#332218] flex items-center justify-between">
            <span>
              ۳. انتخاب گروهی یا تکی ستون‌ها در ۹ دسته ({toPersianDigits(selectedFields.size)} از{' '}
              {toPersianDigits(EXCEL_FIELDS_CATALOG.length)} فیلد انتخاب‌شده):
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {EXCEL_FIELD_CATEGORIES.map((cat) => {
              const catFields = EXCEL_FIELDS_CATALOG.filter((f) => f.category === cat.key);
              const selectedInCat = catFields.filter((f) => selectedFields.has(f.id)).length;
              const allInCatSelected = selectedInCat === catFields.length;

              return (
                <div
                  key={cat.key}
                  className="bg-[#FAF5EE]/60 border border-[#E2D2BE] rounded-xl p-2.5 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-[#E2D2BE] pb-1.5">
                    <div>
                      <div className="font-bold text-xs text-[#6B3E26]">{cat.title}</div>
                      <div className="text-[10px] text-[#6E5846]">{cat.description}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleCategoryGroup(cat.key)}
                      className="px-2 py-0.5 rounded bg-white border border-[#D8C7B2] text-[10.5px] font-bold text-[#332218] shrink-0 cursor-pointer"
                    >
                      {allInCatSelected ? 'لغو گروه' : 'انتخاب گروه'} (
                      {toPersianDigits(selectedInCat)}/{toPersianDigits(catFields.length)})
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {catFields.map((field) => {
                      const isChecked = selectedFields.has(field.id);
                      return (
                        <label
                          key={field.id}
                          onClick={() => toggleField(field.id)}
                          className={`px-2 py-1.5 rounded-lg border text-[11px] flex items-center gap-1.5 cursor-pointer select-none ${
                            isChecked
                              ? 'bg-white border-[#2E6F40] text-[#1E4D2B] font-bold'
                              : 'bg-white/50 border-slate-200 text-slate-600'
                          }`}
                        >
                          {isChecked ? (
                            <CheckSquare className="w-3.5 h-3.5 text-[#2E6F40] shrink-0" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          )}
                          <span className="truncate">{field.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* نوار پایینی تأیید و دانلود فایل Excel */}
        <div className="bg-[#EDF6F0] border-2 border-[#A8D5B5] rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-[11px] text-[#1E4D2B]">
            <strong>تضمین سلامت داده:</strong> تولید خروجی Excel صرفاً خواندنی است و هیچ تغییری در پایگاه داده یا ارتباط‌های موجود ایجاد نمی‌کند؛ برای فیلدهای ناقص نیز اطلاعات حدسی ساخته نمی‌شود.
          </div>

          <div className="flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setContext(null)}
              className="min-h-[40px] px-4 py-1.5 rounded-xl bg-white border border-[#D8C7B2] text-[#332218] font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>انصراف</span>
            </button>

            <button
              type="button"
              data-testid="excel-modal-confirm-download-btn"
              onClick={handleConfirmGenerate}
              className="min-h-[40px] px-5 py-1.5 rounded-xl bg-[#2E6F40] hover:bg-[#235732] text-white font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <Download className="w-4 h-4" />
              <span>
                تولید و دانلود فایل Excel ({toPersianDigits(selectedSheets.size)} برگه)
              </span>
            </button>
          </div>
        </div>
      </div>
    </ModalWindow>
  );
};
