import React, { useState } from 'react';
import { Printer, Grid, Layers, Info } from 'lucide-react';
import {
  FieldAuditRecord,
  LEVELS,
  SHELVES,
  SUBJECT_CATEGORIES,
  getAllocatedCategoryForSlot,
  toPersianDigits
} from '../data/markazAsnadData';

interface ShelfMapAndLabelsTabProps {
  auditRecords: Record<string, FieldAuditRecord>;
}

export const ShelfMapAndLabelsTab: React.FC<ShelfMapAndLabelsTabProps> = ({ auditRecords }) => {
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [showPrintableLabels, setShowPrintableLabels] = useState(false);

  const recordsList = Object.values(auditRecords);

  // Count registered books per SH-xx-Txx slot
  const slotCounts: Record<string, FieldAuditRecord[]> = {};
  for (const rec of recordsList) {
    if (rec.location) {
      if (!slotCounts[rec.location]) slotCounts[rec.location] = [];
      slotCounts[rec.location].push(rec);
    }
  }

  const slotBooks = selectedSlot ? slotCounts[selectedSlot] || [] : [];

  return (
    <div className="space-y-6">
      {/* Header & Discrepancy Tracker (980 Catalog vs 942 Physical Count = 38 Open Discrepancy) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              نقشه عملیاتی قفسه‌ها (SH-01 تا SH-04) و جانمایی گروه‌های شش‌گانه
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              طبقات هر قفسه از بالا به پایین با T01 تا T06 شماره‌گذاری شده‌اند. شناسه کتاب و کد محل (SH-xx-Txx) دو مفهوم مستقل‌اند.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPrintableLabels((prev) => !prev)}
            className="min-h-[42px] px-4 py-2 bg-[#1f4e79] hover:bg-[#163a5b] text-white text-xs font-bold rounded-xl inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
          >
            <Printer className="w-4 h-4" />
            <span>{showPrintableLabels ? 'مشاهده نقشه قفسه‌ها' : 'پیش‌نمایش ۳۹ برچسب استاندارد قفسه و کتاب'}</span>
          </button>
        </div>

        {/* Summary of Physical Count vs Excel Reference */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <span className="text-slate-500 block">رکوردهای شیت «فهرست کتاب‌ها» در فایل تلفیقی:</span>
            <strong className="text-lg font-bold text-slate-900 tabular-nums mt-0.5 block">
              ۹۸۰ رکورد
            </strong>
            <span className="text-[11px] text-slate-500">شناسه موقت BK-0001 تا BK-0980</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <span className="text-slate-500 block">جمع شمارش فیزیکی اولیه در ۶ گروه موضوعی:</span>
            <strong className="text-lg font-bold text-[#1f4e79] tabular-nums mt-0.5 block">
              ۹۴۲ جلد (R: ۵۸۰ + سایر: ۳۶۲)
            </strong>
            <span className="text-[11px] text-slate-500">چیدمان اولیه در قفسه‌های SH-01 تا SH-04</span>
          </div>
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5">
            <span className="text-amber-900 font-semibold block">اختلاف محاسباتی در دست بررسی:</span>
            <strong className="text-lg font-bold text-amber-800 tabular-nums mt-0.5 block">
              ۳۸ مورد اختلاف باز
            </strong>
            <span className="text-[11px] text-amber-800">
              تطبیق رکوردبه‌رکورد با همین ابزار موبایل برای تعیین وضعیت دقیق
            </span>
          </div>
        </div>

        {/* 6 Thematic Categories Breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1">
          {SUBJECT_CATEGORIES.filter((c) => c.code !== 'UNSET').map((cat) => {
            const auditedInCat = recordsList.filter((r) => r.category.startsWith(cat.code)).length;
            return (
              <div
                key={cat.code}
                className="border border-slate-200 rounded-xl p-3 bg-white flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-[#1f4e79]">
                    <span className="font-mono">{cat.code}</span>
                    <span className="tabular-nums text-slate-700">
                      شمارش اولیه: {toPersianDigits(cat.physicalCountReported)}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-slate-900 mt-1">{cat.fullTitle}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{cat.allocatedLocationText}</div>
                </div>
                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">ثبت در اپ:</span>
                  <strong className="text-emerald-700 tabular-nums">
                    {toPersianDigits(auditedInCat)} مورد
                  </strong>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {!showPrintableLabels ? (
        <>
          {/* Interactive 4 Shelves × 6 Levels (24 Slots) Visual Matrix */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {SHELVES.map((shelf) => (
              <div
                key={shelf.code}
                className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col"
              >
                <div className="bg-[#1f4e79] text-white px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-base" dir="ltr">
                      {shelf.code}
                    </span>
                    <span className="text-xs bg-white/15 px-2 py-0.5 rounded-md">۶ طبقه</span>
                  </div>
                  <p className="text-[11px] text-sky-100 mt-1">{shelf.summary}</p>
                </div>

                <div className="p-3 space-y-2 flex-1">
                  {LEVELS.map((level) => {
                    const locCode = `${shelf.code}-${level.code}`;
                    const alloc = getAllocatedCategoryForSlot(shelf.code, level.code);
                    const count = (slotCounts[locCode] || []).length;
                    const isSelected = selectedSlot === locCode;

                    return (
                      <button
                        key={locCode}
                        type="button"
                        onClick={() => setSelectedSlot(isSelected ? null : locCode)}
                        className={`w-full text-right p-3 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                          isSelected
                            ? 'border-2 border-[#1f4e79] bg-[#f2f7fb]'
                            : alloc.categoryCode === 'FREE'
                            ? 'border-dashed border-slate-300 bg-slate-50/60 hover:bg-slate-100'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-[#1f4e79]" dir="ltr">
                              {locCode}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              (طبقه {toPersianDigits(level.number)} از بالا)
                            </span>
                          </div>
                          <div className="text-xs font-semibold text-slate-800 mt-0.5">
                            {alloc.title}
                          </div>
                        </div>

                        <div className="text-left shrink-0">
                          <span
                            className={`inline-block px-2 py-1 rounded-lg text-xs font-bold tabular-nums ${
                              count > 0
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {toPersianDigits(count)} کتاب
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Drill-down for Selected Slot */}
          {selectedSlot && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="text-sm font-bold text-slate-900">
                  کتاب‌های ثبت‌شده در طبقه{' '}
                  <span className="font-mono text-[#1f4e79]" dir="ltr">
                    {selectedSlot}
                  </span>{' '}
                  ({toPersianDigits(slotBooks.length)} مورد)
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedSlot(null)}
                  className="text-xs text-slate-500 hover:text-slate-900"
                >
                  بستن
                </button>
              </div>

              {slotBooks.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  هنوز کتابی در این طبقه ثبت میدانی نشده است.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {slotBooks.map((b) => (
                    <div key={b.key} className="border border-slate-200 rounded-xl p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between text-slate-500">
                        <span className="font-mono font-bold text-slate-700" dir="ltr">
                          {b.tempBookId}
                        </span>
                        <span>{b.category}</span>
                      </div>
                      <div className="font-bold text-slate-900 text-sm">{b.title}</div>
                      <div className="text-slate-600">
                        {[b.author, b.publisher, `تعداد: ${toPersianDigits(b.countedCopies || '1')}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        /* Printable 39 Labels Preview (24 Location + 9 Subject + 6 Sample Book Labels, using '-' instead of ':') */
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div className="space-y-1">
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                پیش‌نمایش برچسب‌های استاندارد کتابخانه مرکز اسناد (۳۹ کادر برچسب)
              </h3>
              <p className="text-xs text-slate-600">
                مطابق اصلاحیه گزارش روزانه ۱۴۰۵/۰۸/۰۳، برای جلوگیری از جابه‌جایی علامت دونقطه در فارسی، از خط تیره (ـ / -) استفاده شده است.
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[40px] px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              <span>چاپ صفحه برچسب‌ها</span>
            </button>
          </div>

          {/* Part 1: 9 Subject Group Labels */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-700">
              بخش اول — برچسب‌های موضوعی قفسه‌ها (۹ عدد: ۲ عدد R، ۲ عدد P، ۲ عدد M، ۱ عدد H، ۱ عدد A، ۱ عدد K)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { code: 'R', title: 'روایت و خاطرات', target: 'قفسه SH-01 (همه طبقات)' },
                { code: 'R', title: 'روایت و خاطرات', target: 'قفسه SH-02 (همه طبقات)' },
                { code: 'H', title: 'تاریخ و اسناد', target: 'قفسه SH-03 - طبقه T01' },
                { code: 'A', title: 'ادبیات و هنر', target: 'قفسه SH-03 - طبقه T02' },
                { code: 'P', title: 'پژوهش و تحلیل', target: 'قفسه SH-03 - طبقه T03' },
                { code: 'P', title: 'پژوهش و تحلیل', target: 'قفسه SH-03 - طبقه T04' },
                { code: 'M', title: 'متفرقه', target: 'قفسه SH-03 - طبقه T05' },
                { code: 'M', title: 'متفرقه', target: 'قفسه SH-03 - طبقه T06' },
                { code: 'K', title: 'کودک و نوجوان', target: 'قفسه SH-04 - طبقه T01' }
              ].map((lbl, idx) => (
                <div
                  key={idx}
                  className="border-2 border-slate-800 rounded-lg p-3 text-center space-y-1 bg-white"
                >
                  <div className="text-[11px] font-semibold text-slate-600 border-b border-slate-300 pb-1">
                    کتابخانه مرکز اسناد گلزار شهدای تهران
                  </div>
                  <div className="text-base font-bold text-slate-900 py-1">
                    گروه {lbl.code} — {lbl.title}
                  </div>
                  <div className="text-xs font-medium text-slate-700 border-t border-slate-300 pt-1">
                    محل استقرار - {lbl.target}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Part 2: 24 Shelf-Level Location Labels */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-700">
              بخش دوم — برچسب‌های محل فیزیکی چهار قفسه × شش طبقه (۲۴ عدد)
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
              {SHELVES.flatMap((sh) =>
                LEVELS.map((lv) => {
                  const code = `${sh.code}-${lv.code}`;
                  const alloc = getAllocatedCategoryForSlot(sh.code, lv.code);
                  return (
                    <div
                      key={code}
                      className="border-2 border-slate-800 rounded-lg p-2.5 text-center bg-white space-y-1"
                    >
                      <div className="text-[10px] text-slate-500">مرکز اسناد گلزار شهدا</div>
                      <div className="font-mono font-bold text-base text-slate-900" dir="ltr">
                        {code}
                      </div>
                      <div className="text-[11px] font-medium text-slate-700">
                        قفسه {toPersianDigits(sh.code.slice(-2))} - طبقه {toPersianDigits(lv.number)}
                      </div>
                      <div className="text-[10px] text-slate-500 border-t border-slate-200 pt-1">
                        {alloc.title}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Part 3: 6 Sample 3-Row Book Labels */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-700">
              بخش سوم — نمونه برچسب کتاب با ساختار کادربندی‌شده سه‌ردیفه (۶ نمونه استاندارد)
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { id: 'GS-R-01', cat: 'R - روایت و خاطرات', loc: 'SH-01-T01' },
                { id: 'GS-A-01', cat: 'A - ادبیات و هنر', loc: 'SH-03-T02' },
                { id: 'GS-H-01', cat: 'H - تاریخ و اسناد', loc: 'SH-03-T01' },
                { id: 'GS-P-01', cat: 'P - پژوهش و تحلیل', loc: 'SH-03-T03' },
                { id: 'GS-K-01', cat: 'K - کودک و نوجوان', loc: 'SH-04-T01' },
                { id: 'GS-M-01', cat: 'M - متفرقه', loc: 'SH-03-T05' }
              ].map((bk) => (
                <div
                  key={bk.id}
                  className="border-2 border-slate-900 rounded-md overflow-hidden text-center text-xs bg-white"
                >
                  <div className="border-b border-slate-800 py-1.5 px-2 font-mono font-bold text-slate-900" dir="ltr">
                    {bk.id}
                  </div>
                  <div className="border-b border-slate-800 py-1.5 px-2 font-medium text-slate-800 text-[11px]">
                    {bk.cat}
                  </div>
                  <div className="py-1.5 px-2 font-mono font-semibold text-slate-700" dir="ltr">
                    {bk.loc}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Part 4: Dynamic Printable Labels for Actually Audited Books */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-[#1f4e79]">
                بخش چهارم — برچسب‌های آماده چاپ برای کتاب‌های ثبت‌شده میدانی شما ({toPersianDigits(recordsList.length)} کتاب)
              </h4>
              <span className="text-[11px] text-slate-500">
                تولید خودکار بر اساس ثبت‌های تب «ثبت سریع موجودی» با خط تیره (-) و بدون عبارت کد موقت
              </span>
            </div>

            {recordsList.length === 0 ? (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600">
                هنوز کتابی در تب «ثبت سریع موجودی» ثبت نکرده‌اید. به محض ثبت هر کتاب، برچسب ۳ ردیفه استاندارد آن در این قسمت برای چاپ آماده می‌شود.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {recordsList.map((rec) => {
                  const normalizedCategoryLabel = (rec.category || 'UNSET').replace(/—|ـ/g, '-');
                  return (
                    <div
                      key={rec.key}
                      className="border-2 border-slate-900 rounded-md overflow-hidden text-center text-xs bg-white"
                    >
                      <div
                        className="border-b border-slate-800 py-1.5 px-2 font-mono font-bold text-slate-900"
                        dir="ltr"
                      >
                        {rec.tempBookId}
                      </div>
                      <div className="border-b border-slate-800 py-1.5 px-2 font-medium text-slate-800 text-[11px] truncate">
                        {normalizedCategoryLabel}
                      </div>
                      <div
                        className="py-1.5 px-2 font-mono font-semibold text-slate-700"
                        dir="ltr"
                      >
                        {rec.location || 'بدون کد محل'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

