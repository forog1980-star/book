import React, { useEffect } from 'react';
import { ArrowRight, BookOpen, ExternalLink, FileText, MapPin, Ticket, User, X } from 'lucide-react';
import { toPersianDigits } from '../../../data/markazAsnadData';
import { registerModalInBackStack } from '../../../utils/navigationHistory';
import type { DashboardBookListItem } from '../types';

interface BookSummaryDossierModalProps {
  book: DashboardBookListItem;
  canStepBackInStack: boolean;
  onStepBackOrClose: () => void;
  onSelectMartyr: (martyrKey: string) => void;
  onOpenOriginalBookRecord: (book: DashboardBookListItem) => void;
}

export const BookSummaryDossierModal: React.FC<BookSummaryDossierModalProps> = ({
  book,
  canStepBackInStack,
  onStepBackOrClose,
  onSelectMartyr,
  onOpenOriginalBookRecord,
}) => {
  useEffect(() => {
    return registerModalInBackStack(`exec-book-dossier-${book.bookKey}`, onStepBackOrClose);
  }, [book.bookKey, onStepBackOrClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`پرونده خلاصه کتاب ${book.title}`}
      data-testid="executive-book-summary-modal"
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
                {book.tempBookId}
              </span>
              <span aria-hidden="true">·</span>
              <span>{book.source === 'catalog' ? 'کاتالوگ اصلی' : 'ثبت خارج از فهرست'}</span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-[#332218]">{book.managerialStatusLabel}</span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-[#332218] leading-snug">
              {book.title}
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

        {/* Scrollable Body (شابک و فیپا طبق مصوبه کارفرما در نمای خلاصه نمایش داده نمی‌شوند) */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-sm text-[#332218]">
          {/* Core Bibliographic & Location Summary */}
          <div className="bg-white border border-[#E2D2BE] rounded-2xl p-4 space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs sm:text-sm">
              <div>
                <span className="text-[#78604E]">ناشر: </span>
                <span className="font-semibold text-[#332218]">{book.publisher || 'ثبت‌نشده'}</span>
              </div>
              <div>
                <span className="text-[#78604E]">نویسنده / گردآورنده: </span>
                <span className="font-semibold text-[#332218]">{book.author || 'ثبت‌نشده'}</span>
              </div>
              <div>
                <span className="text-[#78604E]">محل نگهداری: </span>
                <span className="font-semibold text-[#332218] tabular-nums">
                  {book.locationDisplay || 'ثبت‌نشده'}
                </span>
              </div>
              <div>
                <span className="text-[#78604E]">دسته موضوعی / نسخه‌ها: </span>
                <span className="font-semibold text-[#332218] tabular-nums">
                  {book.subjectCategory || 'تعیین‌نشده'}
                  {book.physicalCopiesCount > 0
                    ? ` · ${toPersianDigits(book.physicalCopiesCount)} نسخه ثبت‌شده (CP)`
                    : book.countedCopiesRaw
                    ? ` · شمارش پایه: ${toPersianDigits(book.countedCopiesRaw)}`
                    : ''}
                </span>
              </div>
            </div>

            {(book.description || book.notes) && (
              <div className="pt-2.5 border-t border-[#EFE4D6] space-y-1.5 text-xs leading-relaxed text-[#5C4636]">
                {book.description && (
                  <p>
                    <strong className="text-[#332218]">موضوع / توضیحات منبع: </strong>
                    {book.description}
                  </p>
                )}
                {book.notes && (
                  <p>
                    <strong className="text-[#332218]">یادداشت کاری: </strong>
                    {book.notes}
                  </p>
                )}
              </div>
            )}

            {book.openTicketIds.length > 0 && (
              <div className="pt-2.5 border-t border-[#EFE4D6] flex items-start gap-2 text-xs text-[#8A4B16]">
                <Ticket className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">تیکت‌های باز کتاب: </span>
                  <span className="font-mono tabular-nums" dir="ltr">
                    {book.openTicketIds.join('، ')}
                  </span>
                  {book.openTicketSubjects.length > 0 && (
                    <span className="text-[#5C4636]">
                      {' '}
                      ({book.openTicketSubjects.join(' · ')})
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Linked Martyrs */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-[#332218] flex items-center gap-1.5">
                <User className="w-4 h-4 text-[#6B3E26]" />
                <span>
                  شهدا و پیوندهای مرتبط ({toPersianDigits(book.relations.length)} رکورد)
                </span>
              </h4>
            </div>

            {book.relations.length === 0 ? (
              <div className="bg-white border border-[#E2D2BE] rounded-2xl p-4 text-xs text-[#78604E]">
                تا این لحظه هیچ پیوند فعالی با شهید برای این کتاب ثبت نشده است.
              </div>
            ) : (
              <div className="bg-white border border-[#E2D2BE] rounded-2xl divide-y divide-[#EFE4D6]">
                {book.relations.map((rel) => {
                  const tehranText =
                    rel.tehranStatus === 'tehran'
                      ? 'شهید گلزار تهران'
                      : rel.tehranStatus === 'non_tehran'
                      ? 'غیرتهرانی'
                      : 'تهران/غیرتهرانی نامشخص';
                  const canOpenMartyr = !rel.isPlaceholderOrGroup;

                  return (
                    <div key={rel.linkId} className="p-3.5 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          {canOpenMartyr ? (
                            <button
                              type="button"
                              onClick={() => onSelectMartyr(rel.martyrKey)}
                              className="text-right font-bold text-[#6B3E26] hover:text-[#4E2A17] hover:underline cursor-pointer inline-flex items-center gap-1.5 min-h-[36px]"
                            >
                              <span>{rel.martyrName}</span>
                              <span className="text-xs font-normal text-[#78604E]">
                                (مشاهده پرونده خلاصه شهید)
                              </span>
                            </button>
                          ) : (
                            <span className="font-semibold text-[#5C4636]">
                              {rel.martyrName} (ردیف گروهی / نیازمند تفکیک)
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-mono tabular-nums text-[#78604E]" dir="ltr">
                          {rel.linkId}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#5C4636]">
                        <span>{rel.certaintyLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{tehranText}</span>
                        {rel.graveAddress && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <MapPin className="w-3.5 h-3.5 text-[#78604E]" />
                              {rel.graveAddress}
                            </span>
                          </>
                        )}
                        {rel.pageReferenceRaw && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">ص {toPersianDigits(rel.pageReferenceRaw)}</span>
                          </>
                        )}
                      </div>

                      {(rel.sourceDescriptionRaw || rel.reviewerNote) && (
                        <p className="text-xs text-[#78604E] leading-relaxed">
                          {rel.sourceDescriptionRaw || rel.reviewerNote}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Extracted Passages Summary */}
          {book.extractedPassages.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-bold text-[#332218] flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#6B3E26]" />
                <span>
                  مطالب استخراج‌شده ({toPersianDigits(book.extractedPassages.length)} مورد)
                </span>
              </h4>
              <div className="bg-white border border-[#E2D2BE] rounded-2xl divide-y divide-[#EFE4D6]">
                {book.extractedPassages.slice(0, 5).map((ex) => (
                  <div key={ex.id} className="p-3 text-xs space-y-1">
                    <div className="font-semibold text-[#332218]">
                      {ex.martyrNameRaw || 'بدون نام'} · {ex.contentType}
                      {ex.pageReferenceRaw ? ` · ص ${toPersianDigits(ex.pageReferenceRaw)}` : ''}
                    </div>
                    <p className="text-[#5C4636] line-clamp-2">{ex.extractedText}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Action */}
        <div className="px-4 sm:px-5 py-3 bg-white border-t border-[#E2D2BE] flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            data-testid="open-original-book-record-btn"
            onClick={() => onOpenOriginalBookRecord(book)}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#6B3E26] hover:bg-[#56311E] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 cursor-pointer transition-colors"
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <span>مشاهده پرونده اصلی کتاب</span>
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
