import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Filter,
  Grid,
  RotateCcw,
  SlidersHorizontal
} from 'lucide-react';
import {
  BookCopyRecord,
  FieldAuditRecord,
  LEVELS,
  ReferenceCatalogRow,
  ShelfCode,
  toEnglishDigits,
  toPersianDigits
} from '../data/markazAsnadData';
import {
  DEFAULT_SHELF_CAPACITIES,
  ShelfCapacityMap,
  analyzeShelfCapacities
} from '../utils/shelfCapacityAnalyzer';

interface ShelfCapacityAlertWidgetProps {
  catalogRows: ReferenceCatalogRow[];
  auditRecords: Record<string, FieldAuditRecord>;
  bookCopies: BookCopyRecord[];
  capacities: ShelfCapacityMap;
  onUpdateCapacities: (next: ShelfCapacityMap) => void;
  activeSubView: 'catalog' | 'shelves';
  onFilterShelfInCatalog?: (shelf: ShelfCode) => void;
  onInspectShelfOnMap?: (shelf: ShelfCode, locationCode?: string) => void;
}

export const ShelfCapacityAlertWidget: React.FC<ShelfCapacityAlertWidgetProps> = ({
  catalogRows,
  auditRecords,
  bookCopies,
  capacities,
  onUpdateCapacities,
  activeSubView,
  onFilterShelfInCatalog,
  onInspectShelfOnMap
}) => {
  const [showAllShelvesPanel, setShowAllShelvesPanel] = useState(false);
  const [showCapacityEditor, setShowCapacityEditor] = useState(false);
  const [draftCapacities, setDraftCapacities] = useState<Record<ShelfCode, string>>({
    'SH-01': String(capacities['SH-01']),
    'SH-02': String(capacities['SH-02']),
    'SH-03': String(capacities['SH-03']),
    'SH-04': String(capacities['SH-04'])
  });

  const analysis = useMemo(
    () =>
      analyzeShelfCapacities({
        catalogRows,
        auditRecords,
        bookCopies,
        capacities
      }),
    [catalogRows, auditRecords, bookCopies, capacities]
  );

  const hasAlerts = analysis.alertedShelves.length > 0 || analysis.alertedLevels.length > 0;
  const hasCriticalAlert =
    analysis.alertedShelves.some((s) => s.severity === 'critical') ||
    analysis.alertedLevels.some((lv) => lv.severity === 'critical');

  const handleOpenEditor = () => {
    setDraftCapacities({
      'SH-01': String(capacities['SH-01']),
      'SH-02': String(capacities['SH-02']),
      'SH-03': String(capacities['SH-03']),
      'SH-04': String(capacities['SH-04'])
    });
    setShowCapacityEditor((prev) => !prev);
  };

  const handleApplyCapacities = (e: React.FormEvent) => {
    e.preventDefault();
    const next: ShelfCapacityMap = { ...capacities };
    (Object.keys(DEFAULT_SHELF_CAPACITIES) as ShelfCode[]).forEach((code) => {
      const parsed = Number(toEnglishDigits(draftCapacities[code] || '').trim());
      if (Number.isFinite(parsed) && parsed >= 6 && parsed <= 10000) {
        next[code] = Math.round(parsed);
      }
    });
    onUpdateCapacities(next);
    setShowCapacityEditor(false);
  };

  const handleResetDefaultCapacities = () => {
    const defaults = { ...DEFAULT_SHELF_CAPACITIES };
    setDraftCapacities({
      'SH-01': String(defaults['SH-01']),
      'SH-02': String(defaults['SH-02']),
      'SH-03': String(defaults['SH-03']),
      'SH-04': String(defaults['SH-04'])
    });
    onUpdateCapacities(defaults);
  };

  const formatPercentFa = (pct: number) =>
    toPersianDigits(Number.isInteger(pct) ? String(pct) : pct.toFixed(1));

  return (
    <section
      data-testid="shelf-capacity-alert-widget"
      aria-live="polite"
      className={`rounded-2xl border p-3.5 sm:p-4 transition-colors ${
        hasCriticalAlert
          ? 'bg-rose-50/75 border-rose-300 text-slate-900'
          : hasAlerts
          ? 'bg-amber-50/80 border-amber-300 text-slate-900'
          : 'bg-white border-[#E2D2BE] text-[#332218]'
      }`}
    >
      {/* Top Status & Controls Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
              hasCriticalAlert
                ? 'bg-rose-100 text-rose-700 border border-rose-200'
                : hasAlerts
                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}
          >
            {hasAlerts ? (
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
            )}
          </div>

          <div className="min-w-0 space-y-1">
            <h2 className="text-xs sm:text-sm font-bold leading-snug">
              {hasAlerts
                ? `هشدار تکمیل ظرفیت قفسه‌ها (بیش از ${toPersianDigits(analysis.thresholdPercent)}٪ ظرفیت پر شده)`
                : 'پایش خودکار ظرفیت قفسه‌ها: همه قفسه‌ها در محدوده ایمن هستند'}
            </h2>

            <div className="text-[11px] sm:text-xs text-slate-700 flex flex-wrap items-center gap-x-2 gap-y-1 leading-relaxed">
              {hasAlerts ? (
                <>
                  {analysis.alertedShelves.length > 0 && (
                    <span className="font-semibold text-rose-900">
                      {toPersianDigits(analysis.alertedShelves.length)} قفسه بالای{' '}
                      {toPersianDigits(analysis.thresholdPercent)}٪:{' '}
                      <span className="font-mono" dir="ltr">
                        {analysis.alertedShelves.map((s) => s.shelf).join('، ')}
                      </span>
                    </span>
                  )}
                  {analysis.alertedShelves.length > 0 && analysis.alertedLevels.length > 0 && (
                    <span aria-hidden="true">·</span>
                  )}
                  {analysis.alertedLevels.length > 0 && (
                    <span>
                      {toPersianDigits(analysis.alertedLevels.length)} طبقه پرتراکم بالای{' '}
                      {toPersianDigits(analysis.thresholdPercent)}٪
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span>
                    آستانه هشدار خودکار: بیش از{' '}
                    <strong className="tabular-nums">
                      {toPersianDigits(analysis.thresholdPercent)}٪
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    مجموع فعلی در قفسه‌ها: {toPersianDigits(analysis.totalOccupiedVolumes)} از{' '}
                    {toPersianDigits(analysis.totalLibraryCapacity)} جلد (
                    {formatPercentFa(analysis.overallFillPercent)}٪)
                  </span>
                  {analysis.highestFillShelf && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        بیشترین تراکم: {analysis.highestFillShelf.title} (
                        {formatPercentFa(analysis.highestFillShelf.fillPercent)}٪)
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowAllShelvesPanel((prev) => !prev)}
            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <span>{showAllShelvesPanel ? 'بستن نمای ۴ قفسه' : 'وضعیت همه قفسه‌ها'}</span>
            {showAllShelvesPanel ? (
              <ChevronUp className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 shrink-0" />
            )}
          </button>

          <button
            type="button"
            onClick={handleOpenEditor}
            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
            <span>تنظیم ظرفیت</span>
          </button>
        </div>
      </div>

      {/* Alerted Shelves Cards (>80% Overall Shelf Capacity) */}
      {analysis.alertedShelves.length > 0 && (
        <div className="mt-3 pt-3 border-t border-amber-200/80 grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {analysis.alertedShelves.map((shelfStat) => {
            const isCritical = shelfStat.severity === 'critical';
            const overflowCount = Math.max(0, shelfStat.occupiedVolumesCount - shelfStat.capacity);
            return (
              <div
                key={shelfStat.shelf}
                data-testid={`shelf-alert-card-${shelfStat.shelf}`}
                className={`rounded-xl border bg-white p-3 space-y-2.5 ${
                  isCritical ? 'border-rose-300' : 'border-amber-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-xs sm:text-sm text-slate-900" dir="ltr">
                        {shelfStat.shelf}
                      </span>
                      <span className="text-xs font-bold text-slate-800">
                        {isCritical ? 'بحرانی / در آستانه تکمیل کامل' : 'هشدار تراکم بالای ۸۰٪'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                      {shelfStat.summary}
                    </p>
                  </div>
                  <span
                    className={`text-sm sm:text-base font-bold tabular-nums shrink-0 ${
                      isCritical ? 'text-rose-700' : 'text-amber-700'
                    }`}
                  >
                    {formatPercentFa(shelfStat.fillPercent)}٪
                  </span>
                </div>

                {/* Progress Bar */}
                <div
                  className="w-full h-2 rounded-full bg-slate-100 overflow-hidden"
                  role="progressbar"
                  aria-valuenow={Math.min(100, Math.round(shelfStat.fillPercent))}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`درصد پرشدن ${shelfStat.title}`}
                >
                  <div
                    className={`h-full rounded-full transition-all duration-200 ${
                      isCritical ? 'bg-rose-600' : 'bg-amber-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, shelfStat.fillPercent))}%` }}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-700">
                  <div className="tabular-nums flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span>
                      موجودی فعلی: <strong>{toPersianDigits(shelfStat.occupiedVolumesCount)}</strong> از{' '}
                      <strong>{toPersianDigits(shelfStat.capacity)}</strong> جلد
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {overflowCount > 0 ? (
                        <strong className="text-rose-700">
                          سرریز {toPersianDigits(overflowCount)} جلد
                        </strong>
                      ) : (
                        <>ظرفیت باقیمانده: {toPersianDigits(shelfStat.remainingCapacity)} جلد</>
                      )}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{toPersianDigits(shelfStat.occupiedBooksCount)} عنوان</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {onFilterShelfInCatalog && (
                      <button
                        type="button"
                        onClick={() => onFilterShelfInCatalog(shelfStat.shelf)}
                        className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#6B3E26] hover:bg-[#56311E] text-white font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Filter className="w-3 h-3 shrink-0" />
                        <span>کتاب‌های {shelfStat.shelf}</span>
                      </button>
                    )}
                    {onInspectShelfOnMap && activeSubView !== 'shelves' && (
                      <button
                        type="button"
                        onClick={() => onInspectShelfOnMap(shelfStat.shelf)}
                        className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#1F4E79] hover:bg-[#173B5C] text-white font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Grid className="w-3 h-3 shrink-0" />
                        <span>نقشه قفسه</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Overloaded Individual Shelf Levels (>80% Tier Capacity) */}
      {analysis.alertedLevels.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-amber-200/80 space-y-2">
          <div className="text-[11px] font-bold text-slate-800">
            طبقات دارای تراکم بیش از {toPersianDigits(analysis.thresholdPercent)}٪ (نیازمند جابه‌جایی به طبقات آزاد):
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {analysis.alertedLevels.map((lv) => {
              const isCritical = lv.severity === 'critical';
              return (
                <button
                  key={lv.locationCode}
                  type="button"
                  onClick={() =>
                    onInspectShelfOnMap
                      ? onInspectShelfOnMap(lv.shelf, lv.locationCode)
                      : onFilterShelfInCatalog?.(lv.shelf)
                  }
                  className={`text-right rounded-xl border bg-white px-3 py-2 flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                    isCritical
                      ? 'border-rose-300 hover:bg-rose-50'
                      : 'border-amber-300 hover:bg-amber-50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-xs text-slate-900" dir="ltr">
                        {lv.locationCode}
                      </span>
                      <span className="text-[11px] text-slate-600 truncate">{lv.title}</span>
                    </div>
                    <div className="text-[11px] text-slate-600 tabular-nums mt-0.5">
                      {toPersianDigits(lv.occupiedVolumesCount)} از {toPersianDigits(lv.capacity)} جلد
                    </div>
                  </div>
                  <span
                    className={`text-xs font-bold tabular-nums shrink-0 ${
                      isCritical ? 'text-rose-700' : 'text-amber-700'
                    }`}
                  >
                    {formatPercentFa(lv.fillPercent)}٪
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Expandable 4-Shelf Overview Matrix */}
      {showAllShelvesPanel && (
        <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {analysis.shelves.map((shelfStat) => {
            const isCritical = shelfStat.severity === 'critical';
            const isWarn = shelfStat.severity === 'warning';
            return (
              <div
                key={shelfStat.shelf}
                className={`rounded-xl border p-3 bg-white space-y-2 ${
                  isCritical
                    ? 'border-rose-300'
                    : isWarn
                    ? 'border-amber-300'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-xs text-[#1F4E79]" dir="ltr">
                    {shelfStat.shelf}
                  </span>
                  <span
                    className={`text-xs font-bold tabular-nums ${
                      isCritical
                        ? 'text-rose-700'
                        : isWarn
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    {formatPercentFa(shelfStat.fillPercent)}٪
                  </span>
                </div>

                <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      isCritical
                        ? 'bg-rose-600'
                        : isWarn
                        ? 'bg-amber-500'
                        : 'bg-emerald-600'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, shelfStat.fillPercent))}%` }}
                  />
                </div>

                <div className="text-[11px] text-slate-600 tabular-nums flex items-center justify-between gap-2">
                  <span>
                    {toPersianDigits(shelfStat.occupiedVolumesCount)} /{' '}
                    {toPersianDigits(shelfStat.capacity)} جلد
                  </span>
                  <span>
                    {shelfStat.isOverWarningThreshold
                      ? 'بالای ۸۰٪'
                      : `${toPersianDigits(shelfStat.remainingCapacity)} جلد آزاد`}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 pt-1">
                  {onFilterShelfInCatalog && (
                    <button
                      type="button"
                      onClick={() => onFilterShelfInCatalog(shelfStat.shelf)}
                      className="flex-1 min-h-[32px] px-2 py-1 rounded-lg bg-[#FAF5EE] hover:bg-[#F3E9DC] border border-[#E2D2BE] text-[#6B3E26] text-[11px] font-bold cursor-pointer"
                    >
                      فیلتر کتاب‌ها
                    </button>
                  )}
                  {onInspectShelfOnMap && (
                    <button
                      type="button"
                      onClick={() => onInspectShelfOnMap(shelfStat.shelf)}
                      className="flex-1 min-h-[32px] px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold cursor-pointer"
                    >
                      نقشه قفسه
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inline Capacity Configuration Editor */}
      {showCapacityEditor && (
        <form
          onSubmit={handleApplyCapacities}
          className="mt-3 pt-3 border-t border-slate-200 bg-white rounded-xl p-3 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-slate-900">
                تنظیم ظرفیت استاندارد هر قفسه (تعداد جلد در ۶ طبقه)
              </h3>
              <p className="text-[11px] text-slate-600 mt-0.5">
                با عبور موجودی هر قفسه یا طبقه از ۸۰٪ ظرفیت تعیین‌شده، هشدار به‌صورت خودکار فعال می‌شود.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetDefaultCapacities}
              className="min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>بازگردانی پیش‌فرض (۳۰۰ جلد)</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {(['SH-01', 'SH-02', 'SH-03', 'SH-04'] as ShelfCode[]).map((code) => {
              const numericVal = Number(toEnglishDigits(draftCapacities[code] || '')) || 0;
              const perLevelPreview = Math.max(1, Math.round(numericVal / LEVELS.length));
              return (
                <label key={code} className="block space-y-1 text-xs">
                  <span className="font-mono font-bold text-slate-800 block" dir="ltr">
                    {code}
                  </span>
                  <input
                    type="number"
                    min={6}
                    max={10000}
                    value={draftCapacities[code]}
                    onChange={(e) =>
                      setDraftCapacities((prev) => ({
                        ...prev,
                        [code]: e.target.value
                      }))
                    }
                    className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl border border-slate-300 bg-[#F8FAFC] text-slate-900 font-bold tabular-nums focus:bg-white focus:outline-none focus:border-[#1F4E79]"
                  />
                  <span className="text-[10.5px] text-slate-500 tabular-nums block">
                    حدود {toPersianDigits(perLevelPreview)} جلد در هر طبقه
                  </span>
                </label>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCapacityEditor(false)}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="min-h-[38px] px-4 py-1.5 rounded-xl bg-[#1F4E79] hover:bg-[#173B5C] text-white text-xs font-bold cursor-pointer"
            >
              ذخیره ظرفیت‌ها
            </button>
          </div>
        </form>
      )}
    </section>
  );
};
