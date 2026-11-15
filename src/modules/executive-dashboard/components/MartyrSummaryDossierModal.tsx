import React, { useEffect } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  ExternalLink,
  MapPin,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { toPersianDigits } from '../../../data/markazAsnadData';
import { registerModalInBackStack } from '../../../utils/navigationHistory';
import type { DashboardMartyrListItem } from '../types';

interface MartyrSummaryDossierModalProps {
  martyr: DashboardMartyrListItem;
  canStepBackInStack: boolean;
  onStepBackOrClose: () => void;
  onSelectBook: (bookKey: string) => void;
  onOpenOriginalMartyrRecord: (martyr: DashboardMartyrListItem) => void;
}

export const MartyrSummaryDossierModal: React.FC<MartyrSummaryDossierModalProps> = ({
  martyr,
  canStepBackInStack,
  onStepBackOrClose,
  onSelectBook,
  onOpenOriginalMartyrRecord,
}) => {
  useEffect(() => {
    return registerModalInBackStack(`exec-martyr-dossier-${martyr.martyrKey}`, onStepBackOrClose);
  }, [martyr.martyrKey, onStepBackOrClose]);

  const tehranLabel =
    martyr.tehranStatus === 'tehran'
      ? 'شهید گلزار شهدای تهران'
      : martyr.tehranStatus === 'non_tehran'
      ? 'شهید غیرتهرانی / یادبود'
      : 'وضعیت تهران/غیرتهرانی نامشخص (نیازمند تطبیق)';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`پرونده خلاصه شهید ${martyr.fullName}`}
      data-testid="executive-martyr-summary-modal"
      className="fixed inset-0 z-50 bg-[#231710]/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onStepBackOrClose}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[90dvh] bg-[#FDF8F2] border border-[#E2D2BE] rounded-t-3xl sm:rounded-2xl shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 bg-white border-b border-[#E2D2BE] flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#78604E]">
              <span className="font-mono tabular-nums font-semibold text-[#6B3E26]" dir="ltr">
                {martyr.displayCode}
              </span>
              {martyr.fatherName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>فرزند {martyr.fatherName}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span
                className={
                  martyr.identityStatus === 'confirmed'
                    ? 'font-semibold text-[#2E6F40]'
                    : 'font-semibold text-[#8A4B16]'
                }
              >
                {martyr.identityStatusLabel}
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-[#332218] leading-snug">
              {martyr.fullName}
            </h3>
          </div>

          <button
            type="button"
            onClick={onStepBackOrClose}
            aria-label={canStepBackInStack ? 'بازگشت به پرونده قبلی' : 'بستن پنجره'}
            className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-[#FAF5EE] hover:bg-[#EFE4D6] text-[#332218] text-xs font-semibold inline-flex items-center justify-center gap-1.5 border border-[#E2D2BE] shrink-0 cursor-pointer transition-colors"
          >
            {canStepBackInStack ? (
              <>
                <ArrowRight className="w-4 h-4 shrink-0" />
                <span>بازگشت</span>
              </>
            ) : (
              <X className="w-4 h-4 shrink-0" />
            )}
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-sm text-[#332218]">
          {/* Identity & Grave Summary */}
          <div className="bg-white border border-[#E2D2BE] rounded-2xl p-4 space-y-2.5 text-xs sm:text-sm">
            <div className="flex flex-wrap items-start gap-2">
              <MapPin className="w-4 h-4 text-[#6B3E26] shrink-0 mt-0.5" />
              <div>
                <span className="text-[#78604E]">نشانی مزار: </span>
                <span className="font-semibold text-[#332218] tabular-nums">
                  {martyr.graveAddress || 'ثبت‌نشده در پیوندهای فعلی'}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-[#2E6F40] shrink-0 mt-0.5" />
              <div>
                <span className="text-[#78604E]">وضعیت تطبیق گلزار تهران: </span>
                <span className="font-semibold text-[#332218]">{tehranLabel}</span>
                <p className="text-xs text-[#78604E] mt-0.5">{martyr.tehranEvidenceNote}</p>
              </div>
            </div>

            {martyr.homonymCountInBank > 1 && (
              <div className="pt-2 border-t border-[#EFE4D6] text-xs text-[#8A4B16]">
                تعداد رکوردهای هم‌نام در بانک ۲۸٬۳۶۸ شهید:{' '}
                <strong className="tabular-nums">{toPersianDigits(martyr.homonymCountInBank)}</strong>{' '}
                پروفایل مستقل (بدون ادغام خودکار؛ انتخاب پروفایل دقیق در پرونده اصلی شهید انجام می‌شود).
              </div>
            )}
          </div>

          {/* Discrepancy Warnings */}
          {martyr.discrepancyWarnings.length > 0 && (
            <div className="bg-[#FFF9F2] border border-[#E2C29B] rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#8A4B16]">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>هشدارهای کارشناسی اختلاف مختصات / ابهام (بدون حذف خودکار داده)</span>
              </div>
              <ul className="space-y-1.5 text-xs text-[#5C4636] leading-relaxed">
                {martyr.discrepancyWarnings.map((w, i) => (
                  <li key={`${w.kind}-${i}`}>{w.message}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Custom Martyr Candidate Suggestions in 28k Bank */}
          {martyr.customMatchCandidates.length > 0 && (
            <div className="bg-white border border-[#E2D2BE] rounded-2xl p-3.5 space-y-2">
              <div className="text-xs font-bold text-[#332218]">
                پیشنهادهای کاندیدای بانک ۲۸٬۳۶۸ شهید برای تطبیق دستی کارشناس:
              </div>
              <div className="divide-y divide-[#EFE4D6] text-xs">
                {martyr.customMatchCandidates.slice(0, 6).map((cand) => (
                  <div
                    key={cand.golzarId}
                    className="py-2 flex flex-wrap items-center justify-between gap-2"
                  >
                    <span className="font-semibold text-[#332218]">
                      {cand.fullName} (فرزند {cand.fatherName})
                    </span>
                    <span className="text-[#78604E] tabular-nums">
                      مزار: {cand.graveAddress} ·{' '}
                      <span className="font-mono" dir="ltr">
                        {cand.golzarId}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Linked Books */}
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-[#332218] flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-[#6B3E26]" />
              <span>کتاب‌های مرتبط ({toPersianDigits(martyr.linkedBooks.length)} عنوان)</span>
            </h4>

            {martyr.linkedBooks.length === 0 ? (
              <div className="bg-white border border-[#E2D2BE] rounded-2xl p-4 text-xs text-[#78604E]">
                هیچ کتابی به این شهید در وضعیت فعلی متصل نشده است.
              </div>
            ) : (
              <div className="bg-white border border-[#E2D2BE] rounded-2xl divide-y divide-[#EFE4D6]">
                {martyr.linkedBooks.map((lb) => (
                  <div key={`${lb.linkId}-${lb.bookKey}`} className="p-3.5 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectBook(lb.bookKey)}
                        className="text-right font-bold text-[#6B3E26] hover:text-[#4E2A17] hover:underline cursor-pointer inline-flex items-center gap-1.5 min-h-[36px]"
                      >
                        <span>{lb.bookTitle}</span>
                        <span className="text-xs font-normal text-[#78604E]">
                          (مشاهده پرونده خلاصه کتاب)
                        </span>
                      </button>
                      <span className="text-[11px] font-mono tabular-nums text-[#78604E]" dir="ltr">
                        {lb.tempBookId} · {lb.linkId}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#5C4636]">
                      <span>{lb.certaintyLabel}</span>
                      {lb.publisher && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>ناشر: {lb.publisher}</span>
                        </>
                      )}
                      {lb.pageReferenceRaw && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">ص {toPersianDigits(lb.pageReferenceRaw)}</span>
                        </>
                      )}
                    </div>

                    {(lb.sourceDescriptionRaw || lb.reviewerNote) && (
                      <p className="text-xs text-[#78604E] leading-relaxed">
                        {lb.sourceDescriptionRaw || lb.reviewerNote}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Action */}
        <div className="px-4 sm:px-5 py-3 bg-white border-t border-[#E2D2BE] flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            data-testid="open-original-martyr-record-btn"
            onClick={() => onOpenOriginalMartyrRecord(martyr)}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#6B3E26] hover:bg-[#56311E] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Users className="w-4 h-4 shrink-0" />
            <span>مشاهده پرونده اصلی شهید</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          </button>

          <button
            type="button"
            onClick={onStepBackOrClose}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#FAF5EE] hover:bg-[#EFE4D6] text-[#332218] border border-[#E2D2BE] text-xs sm:text-sm font-semibold cursor-pointer transition-colors"
          >
            {canStepBackInStack ? 'بازگشت به پرونده قبلی' : 'بستن'}
          </button>
        </div>
      </div>
    </div>
  );
};
