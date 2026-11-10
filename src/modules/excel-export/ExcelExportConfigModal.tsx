import React, { useEffect, useMemo, useState } from 'react';
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
  EXCEL_MAIN_SUBJECT_CATEGORIES,
  EXCEL_PRESETS,
  EXCEL_SHEETS_CATALOG,
} from './fieldCatalog';
import {
  generateStandardizedMartyrCentricExcel,
  resolveBookMainSubjectCode,
  resolveDossiersAndMartyrIndex,
} from './excelBuilderEngine';
import {
  BookMainSubjectCode,
  ExcelExportDatasetContext,
  ExcelFieldCategoryKey,
  ExcelPresetId,
  ExcelReportDirection,
  ExcelSheetKey,
} from './types';

type ConfigRequestListener = (ctx: ExcelExportDatasetContext | null) => void;
let activeListener: ConfigRequestListener | null = null;

function resolveInitialDirection(ctx: ExcelExportDatasetContext): ExcelReportDirection | null {
  if (ctx.direction) return ctx.direction;
  if (ctx.mode === 'martyr_search' || ctx.presetId === 'martyr_dossier') {
    return 'martyr_to_book';
  }
  return null;
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
  if (activeListener) {
    activeListener(ctx);
  } else {
    generateStandardizedMartyrCentricExcel(ctx, {
      reportTitle: ctx.reportTitle,
      fileNamePrefix: ctx.fileNamePrefix,
      direction: resolveInitialDirection(ctx),
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
  const [direction, setDirection] = useState<ExcelReportDirection | null>(null);
  const [activePreset, setActivePreset] = useState<ExcelPresetId | null>('full_comprehensive');
  const [selectedSubjectCategories, setSelectedSubjectCategories] = useState<
    Set<BookMainSubjectCode>
  >(() => new Set());
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
      const initialDir = resolveInitialDirection(incomingCtx);
      const initialPresetId = resolveInitialPresetId(incomingCtx);
      const presetObj =
        EXCEL_PRESETS.find((pr) => pr.id === initialPresetId) ||
        EXCEL_PRESETS[EXCEL_PRESETS.length - 1];

      setContext(incomingCtx);
      setDirection(initialDir);
      setActivePreset(presetObj.id);
      setSelectedSubjectCategories(
        presetObj.id === 'books_by_subject_category'
          ? new Set(EXCEL_MAIN_SUBJECT_CATEGORIES.map((c) => c.code))
          : new Set()
      );
      setSelectedFields(new Set(presetObj.selectedFields));
      if (initialDir === 'martyr_to_book') {
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

  // محاسبه تعداد کتاب‌های هر یک از ۶ موضوع اصلی (R, P, H, A, K, M) در مجموعه داده فعلی
  const subjectStats = useMemo(() => {
    const counts: Record<BookMainSubjectCode, number> = {
      R: 0,
      P: 0,
      H: 0,
      A: 0,
      K: 0,
      M: 0,
    };
    if (!context) return { counts, totalDossiers: 0 };
    const { dossiers } = resolveDossiersAndMartyrIndex(context);
    for (const d of dossiers) {
      const code = resolveBookMainSubjectCode(d);
      if (code !== 'UNSET') {
        counts[code] = (counts[code] || 0) + 1;
      }
    }
    return { counts, totalDossiers: dossiers.length };
  }, [context]);

  if (!context) return null;

  const subjectPresetDef = EXCEL_PRESETS.find((p) => p.id === 'books_by_subject_category')!;
  const otherPresets = EXCEL_PRESETS.filter((p) => p.id !== 'books_by_subject_category');
  const allSubjectsSelected =
    selectedSubjectCategories.size === EXCEL_MAIN_SUBJECT_CATEGORIES.length;

  const ensureSubjectPresetFieldsAndSheets = () => {
    setSelectedFields((prev) => {
      if (prev.size === 0) {
        return new Set(subjectPresetDef.selectedFields);
      }
      const next = new Set(prev);
      next.add('book_subject_category');
      return next;
    });
    setSelectedSheets((prev) => {
      if (prev.size === 0) {
        return new Set(subjectPresetDef.selectedSheets);
      }
      return prev;
    });
  };

  const toggleSubjectCategory = (code: BookMainSubjectCode) => {
    setSelectedSubjectCategories((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      if (next.size > 0) {
        setActivePreset('books_by_subject_category');
      } else if (activePreset === 'books_by_subject_category') {
        setActivePreset(null);
      }
      return next;
    });
    ensureSubjectPresetFieldsAndSheets();
  };

  const handleSelectAllSubjectCategories = () => {
    setActivePreset('books_by_subject_category');
    setSelectedSubjectCategories(new Set(EXCEL_MAIN_SUBJECT_CATEGORIES.map((c) => c.code)));
    setSelectedFields(new Set(subjectPresetDef.selectedFields));
    setSelectedSheets(new Set(subjectPresetDef.selectedSheets));
  };

  const handleClearSubjectCategories = () => {
    setSelectedSubjectCategories(new Set());
    if (activePreset === 'books_by_subject_category') {
      setActivePreset(null);
    }
  };

  const applyPreset = (presetId: ExcelPresetId) => {
    const preset = EXCEL_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setActivePreset(presetId);
    setSelectedFields(new Set(preset.selectedFields));
    setSelectedSheets(new Set(preset.selectedSheets));
    if (presetId === 'books_by_subject_category') {
      if (selectedSubjectCategories.size === 0) {
        setSelectedSubjectCategories(new Set(EXCEL_MAIN_SUBJECT_CATEGORIES.map((c) => c.code)));
      }
    }
  };

  const handleDirectionToggle = (targetDir: ExcelReportDirection) => {
    if (direction === targetDir) {
      setDirection(null);
      return;
    }
    setDirection(targetDir);
    if (targetDir === 'martyr_to_book') {
      setSelectedSheets((prev) => {
        if (prev.size === 0) {
          return new Set<ExcelSheetKey>(['related_martyrs', 'book_martyr_relations']);
        }
        const next = new Set(prev);
        next.add('related_martyrs');
        return next;
      });
      setSelectedFields((prev) => {
        if (prev.size === 0) {
          return new Set([
            'martyr_id',
            'martyr_name',
            'grave_full_address',
            'book_id',
            'book_title',
            'book_author',
            'book_publisher',
            'page_reference_raw',
          ]);
        }
        return prev;
      });
    } else {
      setSelectedSheets((prev) => {
        if (prev.size === 0) {
          return new Set<ExcelSheetKey>(['main_books', 'book_martyr_relations']);
        }
        const next = new Set(prev);
        next.add('main_books');
        return next;
      });
      setSelectedFields((prev) => {
        if (prev.size === 0) {
          return new Set([
            'book_id',
            'book_title',
            'book_author',
            'book_publisher',
            'martyr_name',
            'grave_full_address',
          ]);
        }
        return prev;
      });
    }
  };

  const handleSelectAllFields = () => {
    setActivePreset('full_comprehensive');
    setSelectedFields(new Set(EXCEL_FIELDS_CATALOG.map((f) => f.id)));
    setSelectedSheets(new Set(EXCEL_SHEETS_CATALOG.map((s) => s.key)));
  };

  // پاک کردن کامل تمام انتخاب‌ها (الگوها، موضوعات، جهت، برگه‌ها و ستون‌ها)
  const handleClearAllFields = () => {
    setActivePreset(null);
    setSelectedSubjectCategories(new Set());
    setDirection(null);
    setSelectedSheets(new Set());
    setSelectedFields(new Set());
  };

  const toggleField = (fieldId: string) => {
    setActivePreset(null);
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(fieldId)) {
        next.delete(fieldId);
      } else {
        next.add(fieldId);
      }
      return next;
    });
    setSelectedSheets((prev) => (prev.size === 0 ? new Set<ExcelSheetKey>(['main_books']) : prev));
  };

  const toggleCategoryGroup = (catKey: ExcelFieldCategoryKey) => {
    setActivePreset(null);
    const catFields = EXCEL_FIELDS_CATALOG.filter((f) => f.category === catKey).map((f) => f.id);
    const allSelected = catFields.every((id) => selectedFields.has(id));
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of catFields) {
          next.delete(id);
        }
      } else {
        for (const id of catFields) {
          next.add(id);
        }
      }
      return next;
    });
    if (!allSelected) {
      setSelectedSheets((prev) =>
        prev.size === 0 ? new Set<ExcelSheetKey>(['main_books']) : prev
      );
    }
  };

  const toggleSheet = (sheetKey: ExcelSheetKey) => {
    setActivePreset(null);
    setSelectedSheets((prev) => {
      const next = new Set(prev);
      if (next.has(sheetKey)) {
        next.delete(sheetKey);
      } else {
        next.add(sheetKey);
      }
      return next;
    });
    setSelectedFields((prev) =>
      prev.size === 0
        ? new Set([
            'book_id',
            'book_title',
            'book_author',
            'book_publisher',
            'book_subject_category',
            'martyr_name',
            'grave_full_address',
          ])
        : prev
    );
  };

  const canGenerate =
    selectedSheets.size > 0 || selectedFields.size > 0 || selectedSubjectCategories.size > 0;

  const handleConfirmGenerate = () => {
    if (!canGenerate) {
      if (onNotify) {
        onNotify(
          'لطفاً حداقل یک الگو، موضوع، برگه یا ستون را برای تولید خروجی Excel انتخاب کنید.',
          'warning'
        );
      }
      return;
    }

    const effectiveFields =
      selectedFields.size > 0
        ? selectedFields
        : new Set(subjectPresetDef.selectedFields);
    const effectiveSheets =
      selectedSheets.size > 0
        ? selectedSheets
        : new Set<ExcelSheetKey>(['main_books', 'book_martyr_relations']);

    const res = generateStandardizedMartyrCentricExcel(context, {
      reportTitle: context.reportTitle,
      fileNamePrefix: context.fileNamePrefix,
      direction,
      selectedFields: effectiveFields,
      selectedSheets: effectiveSheets,
      selectedSubjectCategories,
    });
    setContext(null);
    if (res.ok && onNotify) {
      onNotify(
        `✅ فایل اکسل «${res.fileName}» در ${toPersianDigits(
          res.sheetsCount
        )} برگه با موفقیت دانلود شد.`
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
        {/* کادر اصل بنیادین سامانه (بدون توضیحات اضافی فونت و راست‌به‌چپ) */}
        <div className="bg-[#FAF5EE] border-2 border-[#D8C7B2] rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="font-bold text-sm text-[#6B3E26] flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>اصل بنیادین خروجی مرکز اسناد: ارتباط دوطرفه کتاب، شهید، مزار و محتوای مستند</span>
          </div>

          {/* تغییر جهت محور گزارش (اختیاری — با کلیک انتخاب یا لغو می‌شود) */}
          <div className="flex items-center gap-1.5 bg-white border border-[#D8C7B2] p-1 rounded-xl shrink-0">
            <button
              type="button"
              data-testid="excel-direction-book-to-martyr"
              onClick={() => handleDirectionToggle('book_to_martyr')}
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
              data-testid="excel-direction-martyr-to-book"
              onClick={() => handleDirectionToggle('martyr_to_book')}
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

        {/* بخش ۱: الگوهای آماده گزارش‌گیری سریع (الگوی شماره ۱: ۶ عنوان موضوعی کتاب‌ها R, P, H, A, K, M) */}
        <div className="bg-white border border-[#E2D2BE] rounded-2xl p-3.5 space-y-3">
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
                className="px-2.5 py-1 rounded-lg bg-[#FFF3F0] hover:bg-[#FFE4DE] border border-[#E8B4A6] text-[#8B261D] font-bold text-[11px] cursor-pointer"
              >
                ✕ حذف انتخاب‌ها
              </button>
            </div>
          </div>

          {/* الگوی شماره ۱: ۶ عنوان موضوعی اصلی کتاب‌ها (R، P، H، A، K، M) با قابلیت تیک زدن تکی یا همه */}
          <div
            data-testid="excel-preset-books_by_subject_category"
            className={`p-3 rounded-xl border transition-all space-y-2.5 ${
              activePreset === 'books_by_subject_category' || selectedSubjectCategories.size > 0
                ? 'bg-[#EDF6F0] border-2 border-[#2E6F40] text-[#1E4D2B]'
                : 'bg-[#FAF5EE]/80 border-[#D8C7B2] text-[#332218]'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  if (allSubjectsSelected && activePreset === 'books_by_subject_category') {
                    handleClearSubjectCategories();
                  } else {
                    handleSelectAllSubjectCategories();
                  }
                }}
                className="text-right cursor-pointer flex items-center gap-2 font-bold text-xs text-[#1E4D2B]"
              >
                {selectedSubjectCategories.size > 0 ? (
                  <CheckSquare className="w-4 h-4 text-[#2E6F40] shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-[#6B3E26] shrink-0" />
                )}
                <span>{subjectPresetDef.label}</span>
                {selectedSubjectCategories.size > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-[#2E6F40] text-white text-[10.5px]">
                    {toPersianDigits(selectedSubjectCategories.size)} موضوع انتخاب‌شده
                  </span>
                )}
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-testid="excel-subject-select-all-btn"
                  onClick={handleSelectAllSubjectCategories}
                  className="px-2 py-1 rounded-lg bg-white hover:bg-[#EDF6F0] border border-[#A8D5B5] text-[#1E4D2B] font-bold text-[10.5px] cursor-pointer"
                >
                  ✓ انتخاب همه ۶ موضوع
                </button>
                {selectedSubjectCategories.size > 0 && (
                  <button
                    type="button"
                    data-testid="excel-subject-clear-btn"
                    onClick={handleClearSubjectCategories}
                    className="px-2 py-1 rounded-lg bg-white hover:bg-[#FAF5EE] border border-[#D8C7B2] text-[#6B3E26] font-bold text-[10.5px] cursor-pointer"
                  >
                    حذف تیک موضوعات
                  </button>
                )}
              </div>
            </div>

            <div className="text-[11px] text-[#5C4636]">
              تیک هر موضوع را که می‌خواهید بزنید (یا همه ۶ موضوع را انتخاب کنید) تا خروجی کتاب‌های همان موضوع یا موضوعات ساخته شود:
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {EXCEL_MAIN_SUBJECT_CATEGORIES.map((subj) => {
                const isChecked = selectedSubjectCategories.has(subj.code);
                const count = subjectStats.counts[subj.code] || 0;
                return (
                  <button
                    key={subj.code}
                    type="button"
                    data-testid={`excel-subject-checkbox-${subj.code}`}
                    onClick={() => toggleSubjectCategory(subj.code)}
                    className={`p-2 rounded-xl border text-right flex items-center justify-between gap-1.5 cursor-pointer transition-all ${
                      isChecked
                        ? 'bg-white border-2 border-[#2E6F40] text-[#1E4D2B] font-bold shadow-2xs'
                        : 'bg-white/80 hover:bg-white border-[#D8C7B2] text-[#332218]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-[#2E6F40] shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <span className="truncate text-[11px]">{subj.label}</span>
                    </div>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 ${
                        isChecked
                          ? 'bg-[#EDF6F0] text-[#1E4D2B] font-bold'
                          : 'bg-[#FAF5EE] text-[#6E5846]'
                      }`}
                    >
                      {toPersianDigits(count)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* سایر الگوهای آماده گزارش‌گیری سریع (شماره ۲ تا ۸) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {otherPresets.map((preset) => {
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
            {selectedSubjectCategories.size > 0 ? (
              <span>
                <strong>فیلتر موضوعی فعال:</strong> خروجی شامل کتاب‌های موضوع{' '}
                <strong>{Array.from(selectedSubjectCategories).join('، ')}</strong> خواهد بود.
              </span>
            ) : (
              <span>
                <strong>تضمین سلامت داده:</strong> تولید خروجی Excel صرفاً خواندنی است و هیچ تغییری در پایگاه داده ایجاد نمی‌کند.
              </span>
            )}
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
              disabled={!canGenerate}
              onClick={handleConfirmGenerate}
              className={`min-h-[40px] px-5 py-1.5 rounded-xl font-bold inline-flex items-center gap-1.5 shadow-xs ${
                canGenerate
                  ? 'bg-[#2E6F40] hover:bg-[#235732] text-white cursor-pointer'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <Download className="w-4 h-4" />
              <span>
                {canGenerate
                  ? `تولید و دانلود فایل Excel (${toPersianDigits(
                      selectedSheets.size > 0 ? selectedSheets.size : 2
                    )} برگه)`
                  : 'ابتدا یک الگو یا ستون را انتخاب کنید'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </ModalWindow>
  );
};

