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

/**
 * وضعیت پایدار و قابل بازیابی «صفحه خانه / فهرست کتاب‌ها / پرونده کتاب / پرونده شهید»
 * برای حفظ دقیق زیرگروه آماری، فیلتر، متن جست‌وجو، موقعیت اسکرول، کتاب انتخاب‌شده و پرونده شهید
 * هنگام جابه‌جایی میان برگه‌ها (مانند رفتن به بانک جامع شهدا و بازگشت مرحله‌به‌مرحله)
 */
export interface HomeDossierNavSnapshot {
  activeStatGroupModal: 'all_books' | 'new_books' | 'determined_books' | 'martyr_books' | null;
  statModalSearchQuery: string;
  statModalSubFilter: 'all' | 'tehran_martyrs' | 'single_martyr' | 'multi_martyr' | 'definite' | 'probable' | 'needs_review';
  statModalScrollTop: number;
  selectedBookDossierId: string | null;
  lastInteractedDossierId: string | null;
  selectedMartyrDossierName: string | null;
  selectedMartyrDossierId?: string | null;
  homeScrollTop: number;
}

const HOME_SNAPSHOT_STORAGE_KEY = 'book_nav_home_dossier_snapshot_v1';

// پاک‌سازی وضعیت پنجره‌های باز از sessionStorage در هنگام رفرش کامل صفحه تا کاربر پس از رفرش روی پنجره قبلی قفل نشود
try {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    window.sessionStorage.removeItem(HOME_SNAPSHOT_STORAGE_KEY);
  }
} catch {
  // ignore
}

const defaultHomeSnapshot: HomeDossierNavSnapshot = {
  activeStatGroupModal: null,
  statModalSearchQuery: '',
  statModalSubFilter: 'all',
  statModalScrollTop: 0,
  selectedBookDossierId: null,
  lastInteractedDossierId: null,
  selectedMartyrDossierName: null,
  selectedMartyrDossierId: null,
  homeScrollTop: 0
};

let memoryHomeSnapshot: HomeDossierNavSnapshot | null = null;

export function getHomeDossierNavSnapshot(): HomeDossierNavSnapshot {
  if (memoryHomeSnapshot) return { ...memoryHomeSnapshot };
  memoryHomeSnapshot = { ...defaultHomeSnapshot };
  return { ...memoryHomeSnapshot };
}

export function saveHomeDossierNavSnapshot(partial: Partial<HomeDossierNavSnapshot>): HomeDossierNavSnapshot {
  const current = getHomeDossierNavSnapshot();
  memoryHomeSnapshot = { ...current, ...partial };
  return { ...memoryHomeSnapshot };
}

export function resetHomeDossierNavSnapshot(): void {
  memoryHomeSnapshot = { ...defaultHomeSnapshot };
}

/**
 * زمینه هدف برای انتقال مستقیم از «پرونده اختصاصی شهید» به «بانک جامع پرونده شهدا»
 * و بازگشت مرحله‌به‌مرحله به همان پرونده شهید ← پرونده کتاب ← فهرست کتاب‌ها
 */
export interface MartyrsCrossTabTarget {
  martyrId?: string;
  fullName: string;
  normalizedName: string;
  gravePiece?: string;
  graveRow?: string;
  graveNumber?: string;
  sourceBookDossierId: string | null;
  sourceBookTitle?: string;
  sourceMartyrDossierName: string;
  returnTarget?: 'home' | 'executive_dashboard';
  returnLabel?: string;
  sourceDashboardMartyrKey?: string;
  timestamp: number;
}

const MARTYRS_TARGET_STORAGE_KEY = 'book_nav_martyrs_cross_tab_target_v1';
let memoryMartyrsTarget: MartyrsCrossTabTarget | null = null;

export function getMartyrsCrossTabTarget(): MartyrsCrossTabTarget | null {
  if (memoryMartyrsTarget) return { ...memoryMartyrsTarget };
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const raw = window.sessionStorage.getItem(MARTYRS_TARGET_STORAGE_KEY);
      if (raw) {
        memoryMartyrsTarget = JSON.parse(raw) as MartyrsCrossTabTarget;
        return { ...memoryMartyrsTarget };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function setMartyrsCrossTabTarget(target: MartyrsCrossTabTarget | null): void {
  memoryMartyrsTarget = target ? { ...target } : null;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (target) {
        window.sessionStorage.setItem(MARTYRS_TARGET_STORAGE_KEY, JSON.stringify(target));
      } else {
        window.sessionStorage.removeItem(MARTYRS_TARGET_STORAGE_KEY);
      }
    }
  } catch {
    // ignore
  }
}

export function clearMartyrsCrossTabTarget(): void {
  setMartyrsCrossTabTarget(null);
}

/**
 * وضعیت پایدار برگه «کتابخانه (QuickInventoryTab)» برای حفظ فیلتر، جست‌وجو،
 * ردیف انتخاب‌شده و موقعیت اسکرول هنگام جابه‌جایی میان برگه‌ها
 */
export interface LibraryTabNavSnapshot {
  searchQuery: string;
  authorQuery: string;
  authorStatusFilter: 'all' | 'has_author' | 'missing_author';
  publisherQuery: string;
  publisherFilter: string;
  categoryFilter: string;
  shelfFilter: string;
  auditFilter: string;
  visibleLimit: number;
  selectedRowKey: string | null;
  lastTouchedRowKey: string;
  scrollTop: number;
}

const LIBRARY_SNAPSHOT_STORAGE_KEY = 'book_nav_library_tab_snapshot_v1';

const defaultLibrarySnapshot: LibraryTabNavSnapshot = {
  searchQuery: '',
  authorQuery: '',
  authorStatusFilter: 'all',
  publisherQuery: '',
  publisherFilter: 'همه ناشران',
  categoryFilter: 'همه دسته‌ها',
  shelfFilter: 'همه قفسه‌ها',
  auditFilter: 'همه وضعیت‌ها',
  visibleLimit: 80,
  selectedRowKey: null,
  lastTouchedRowKey: '',
  scrollTop: 0
};

let memoryLibrarySnapshot: LibraryTabNavSnapshot | null = null;

export function getLibraryTabNavSnapshot(): LibraryTabNavSnapshot {
  if (memoryLibrarySnapshot) return { ...memoryLibrarySnapshot };
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const raw = window.sessionStorage.getItem(LIBRARY_SNAPSHOT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<LibraryTabNavSnapshot>;
        memoryLibrarySnapshot = { ...defaultLibrarySnapshot, ...parsed };
        return { ...memoryLibrarySnapshot };
      }
    }
  } catch {
    // ignore
  }
  memoryLibrarySnapshot = { ...defaultLibrarySnapshot };
  return { ...memoryLibrarySnapshot };
}

export function saveLibraryTabNavSnapshot(partial: Partial<LibraryTabNavSnapshot>): LibraryTabNavSnapshot {
  const current = getLibraryTabNavSnapshot();
  memoryLibrarySnapshot = { ...current, ...partial };
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(LIBRARY_SNAPSHOT_STORAGE_KEY, JSON.stringify(memoryLibrarySnapshot));
    }
  } catch {
    // ignore
  }
  return { ...memoryLibrarySnapshot };
}

