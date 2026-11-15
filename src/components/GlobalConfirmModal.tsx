import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldCheck, Trash2 } from 'lucide-react';
import {
  closeConfirmDialog,
  ConfirmDialogOptions,
  subscribeConfirmDialog
} from '../utils/confirmDialogService';
import { ModalWindow } from './ModalWindow';

export const GlobalConfirmModal: React.FC = () => {
  const [options, setOptions] = useState<ConfirmDialogOptions | null>(null);

  useEffect(() => {
    return subscribeConfirmDialog((next) => {
      setOptions(next);
    });
  }, []);

  if (!options) return null;

  const isDanger = options.variant === 'danger' || options.variant === 'delete';
  const detailsList = Array.isArray(options.details)
    ? options.details.filter(Boolean)
    : options.details
    ? [options.details]
    : [];

  const handleCancel = () => {
    closeConfirmDialog();
  };

  const handleConfirm = () => {
    const callback = options.onConfirm;
    closeConfirmDialog();
    callback();
  };

  return (
    <ModalWindow
      onClose={handleCancel}
      title={options.title || (isDanger ? 'تأیید نهایی حذف' : 'تأیید نهایی ثبت اطلاعات')}
      maxWidthClass="max-w-md"
      initialDesktopOffset={{ x: 0, y: -12 }}
    >
      <div className="space-y-4 text-xs">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              isDanger
                ? 'bg-[#A63A3A]/10 text-[#A63A3A] border-[#A63A3A]/30'
                : 'bg-[#2E6F40]/10 text-[#2E6F40] border-[#2E6F40]/30'
            }`}
          >
            {isDanger ? (
              <Trash2 className="w-5 h-5" />
            ) : (
              <ShieldCheck className="w-5 h-5" />
            )}
          </div>
          <div className="space-y-1 flex-1 min-w-0">
            <span
              className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md ${
                isDanger
                  ? 'bg-[#A63A3A]/10 text-[#A63A3A]'
                  : 'bg-[#2E6F40]/10 text-[#2E6F40]'
              }`}
            >
              {isDanger ? 'پرسش دوم: اطمینان از حذف / خارج کردن از لیست' : 'پرسش دوم: اطمینان از ثبت و تأیید نهایی'}
            </span>
            <h3 className="font-bold text-sm sm:text-base text-[#332218] leading-snug">
              {options.title}
            </h3>
          </div>
        </div>

        <div
          className={`rounded-xl p-3.5 space-y-2 border leading-relaxed ${
            isDanger
              ? 'bg-[#FAF3EA] border-[#A63A3A]/30 text-[#332218]'
              : 'bg-[#FAF3EA] border-[#E2D2BE] text-[#332218]'
          }`}
        >
          <p className="font-bold text-xs sm:text-sm text-[#332218]">{options.message}</p>

          {detailsList.length > 0 && (
            <ul className="space-y-1 pt-1.5 border-t border-[#E2D2BE] text-[11px] text-[#5C4033] list-disc pr-4">
              {detailsList.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          )}

          {isDanger && (
            <div className="pt-1.5 flex items-center gap-1.5 text-[11px] font-bold text-[#A63A3A]">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>پس از تأیید، این مورد از فهرست فعال سامانه خارج و حذف خواهد شد.</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2D2BE]">
          <button
            type="button"
            onClick={handleCancel}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-[#F6EFE6] hover:bg-[#EFE4D6] text-[#332218] border border-[#E2D2BE] font-bold text-xs cursor-pointer transition-colors"
          >
            {options.cancelLabel || 'انصراف و بازگشت'}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`min-h-[40px] px-5 py-2 rounded-xl text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors ${
              isDanger
                ? 'bg-[#A63A3A] hover:bg-[#872D2D]'
                : 'bg-[#2E6F40] hover:bg-[#235632]'
            }`}
          >
            {isDanger ? (
              <Trash2 className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>
              {options.confirmLabel || (isDanger ? 'بله، حذف و خارج شود' : 'بله، ثبت نهایی شود')}
            </span>
          </button>
        </div>
      </div>
    </ModalWindow>
  );
};
