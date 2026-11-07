// سرویس متمرکز پرسش دوم (تأیید دو مرحله‌ای) برای کلیه عملیات‌های ثبت نهایی، تأیید کارشناسی و حذف در سراسر سامانه

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  details?: string | string[];
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'confirm' | 'danger' | 'approve' | 'save' | 'delete';
  onConfirm: () => void;
}

type ConfirmListener = (options: ConfirmDialogOptions | null) => void;

let activeListener: ConfirmListener | null = null;
let currentOptions: ConfirmDialogOptions | null = null;

export function subscribeConfirmDialog(listener: ConfirmListener): () => void {
  activeListener = listener;
  listener(currentOptions);
  return () => {
    if (activeListener === listener) {
      activeListener = null;
    }
  };
}

export function requestActionConfirmation(options: ConfirmDialogOptions): void {
  currentOptions = options;
  if (activeListener) {
    activeListener(currentOptions);
  } else {
    // در صورتی که به هر دلیل کامپوننت گرافیکی هنوز سوار نشده باشد، مستقیم اجرا شود
    options.onConfirm();
  }
}

export function closeConfirmDialog(): void {
  currentOptions = null;
  if (activeListener) {
    activeListener(null);
  }
}
