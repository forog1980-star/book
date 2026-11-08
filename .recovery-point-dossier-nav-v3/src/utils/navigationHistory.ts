// مدیریت متمرکز پشته پنجره‌های باز (Modals) و مراحل داخلی برای دکمه بازگشت (Back) گوشی و مرورگر

type CloseCallback = () => void;

interface StackItem {
  id: string;
  onBack: CloseCallback;
}

const openModalStack: StackItem[] = [];
const innerStepStack: StackItem[] = [];

export function registerModalInBackStack(id: string, onClose: CloseCallback): () => void {
  const existingIdx = openModalStack.findIndex((item) => item.id === id);
  if (existingIdx !== -1) {
    openModalStack.splice(existingIdx, 1);
  }
  openModalStack.push({ id, onBack: onClose });

  return () => {
    const idx = openModalStack.findIndex((item) => item.id === id);
    if (idx !== -1) {
      openModalStack.splice(idx, 1);
    }
  };
}

export function closeTopModalIfAny(): boolean {
  if (openModalStack.length === 0) return false;
  const topModal = openModalStack[openModalStack.length - 1];
  if (topModal) {
    topModal.onBack();
    return true;
  }
  return false;
}

export function hasAnyOpenModal(): boolean {
  return openModalStack.length > 0;
}

export function registerInnerBackStep(id: string, onBack: CloseCallback): () => void {
  const existingIdx = innerStepStack.findIndex((item) => item.id === id);
  if (existingIdx !== -1) {
    innerStepStack.splice(existingIdx, 1);
  }
  innerStepStack.push({ id, onBack });

  return () => {
    const idx = innerStepStack.findIndex((item) => item.id === id);
    if (idx !== -1) {
      innerStepStack.splice(idx, 1);
    }
  };
}

export function popInnerBackStepIfAny(): boolean {
  if (innerStepStack.length === 0) return false;
  const topStep = innerStepStack[innerStepStack.length - 1];
  if (topStep) {
    topStep.onBack();
    return true;
  }
  return false;
}
