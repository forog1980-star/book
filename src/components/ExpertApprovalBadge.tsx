import React from 'react';
import { Check, CheckCircle2 } from 'lucide-react';
import { FieldAuditRecord } from '../data/markazAsnadData';

export const EXPERT_APPROVED_BADGE_CLASS =
  'bg-[#E9F5EC] hover:bg-[#D8EDE0] border border-[#96CFA8] text-[#1E5B32]';

export const EXPERT_RE_REVIEW_LIBRARY_NOTICE =
  'این کتاب، مشخصات آن و ارتباط با شهید قبلاً تأیید کارشناسی شده است و نیازی به بررسی مجدد ندارد. در صورت نیاز به کارشناسی مجدد، لطفاً به صفحه «کتابخانه» مراجعه کرده و از آنجا اقدام نمایید.';

export function isBookRecordExpertApproved(auditRec?: FieldAuditRecord | null): boolean {
  if (!auditRec) return false;
  return Boolean(
    auditRec.expertApproved && auditRec.physical === 'verified' && !auditRec.needsReview
  );
}

export function isBookMartyrLinkExpertApproved(
  reviewStatus?: string | null,
  sourceFile?: string | null
): boolean {
  const st = String(reviewStatus || '').trim();
  const sf = String(sourceFile || '').trim();
  return st === 'تأییدشده کارشناسی' || sf === 'تأیید کارشناس در پرونده کتاب';
}

interface ExpertApprovalStatusButtonProps {
  approved: boolean;
  onApprove?: () => void;
  onNotify?: (message: string, type?: 'success' | 'warning') => void;
  allowReReviewHere?: boolean;
  approveLabel?: string;
  approvedLabel?: string;
  reReviewConfirmLabel?: string;
  customApprovedNotice?: string;
  compact?: boolean;
  className?: string;
  testId?: string;
  stopPropagation?: boolean;
}

export const ExpertApprovalStatusButton: React.FC<ExpertApprovalStatusButtonProps> = ({
  approved,
  onApprove,
  onNotify,
  allowReReviewHere = false,
  approveLabel = 'تأیید نهایی کارشناس',
  approvedLabel = '✓ تأییدشده کارشناس',
  reReviewConfirmLabel = 'ثبت کارشناسی مجدد',
  customApprovedNotice = EXPERT_RE_REVIEW_LIBRARY_NOTICE,
  compact = false,
  className = '',
  testId,
  stopPropagation = false
}) => {
  if (approved) {
    if (allowReReviewHere && onApprove) {
      return (
        <div
          className={`inline-flex items-center gap-1.5 flex-wrap ${className}`}
          onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
        >
          <span
            className={`${
              compact ? 'min-h-[26px] px-2 py-0.5 text-[10.5px]' : 'min-h-[32px] px-2.5 py-1 text-[11px]'
            } rounded-lg bg-[#E9F5EC] border border-[#96CFA8] text-[#1E5B32] font-bold inline-flex items-center justify-center gap-1 whitespace-nowrap select-none`}
            title="تأییدشده توسط کارشناس"
          >
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span>{approvedLabel.replace(/^✓\s*/, '')}</span>
          </span>
          <button
            type="button"
            data-testid={testId}
            onClick={(e) => {
              if (stopPropagation) e.stopPropagation();
              onApprove();
            }}
            className={`${
              compact ? 'min-h-[26px] px-2 py-0.5 text-[10.5px]' : 'min-h-[32px] px-2.5 py-1 text-[11px]'
            } rounded-lg bg-white hover:bg-[#FAF5EE] border border-[#D8C7B2] text-[#6B3E26] font-bold inline-flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap`}
            title="کارشناسی مجدد این مورد در صفحه کتابخانه"
          >
            <span>{reReviewConfirmLabel}</span>
          </button>
        </div>
      );
    }

    return (
      <button
        type="button"
        data-testid={testId}
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation();
          onNotify?.(customApprovedNotice, 'warning');
        }}
        className={`${
          compact ? 'min-h-[26px] px-2 py-0.5 text-[10.5px]' : 'min-h-[32px] px-2.5 py-1 text-[11px]'
        } rounded-lg ${EXPERT_APPROVED_BADGE_CLASS} font-bold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${className}`}
        title="تأییدشده کارشناس — برای کارشناسی مجدد از صفحه کتابخانه اقدام کنید"
      >
        <Check className="w-3.5 h-3.5 shrink-0" />
        <span>{approvedLabel.replace(/^✓\s*/, '')}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      data-testid={testId}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        onApprove?.();
      }}
      className={`${
        compact ? 'min-h-[26px] px-2.5 py-0.5 text-[10.5px]' : 'min-h-[32px] px-3 py-1 text-[11px]'
      } rounded-lg bg-[#2E6F40] hover:bg-[#235732] text-white font-bold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors whitespace-nowrap shrink-0 shadow-2xs ${className}`}
      title="تأیید نهایی کارشناس"
    >
      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
      <span>{approveLabel}</span>
    </button>
  );
};
