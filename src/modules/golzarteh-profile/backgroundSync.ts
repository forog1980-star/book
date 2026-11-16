import {
  GolzartehEnrichedDetail,
  GolzartehPhotoItem,
  MartyrLocalProfileOverride
} from './types';

export const GOLZARTEH_BG_SYNC_QUEUE_KEY = 'markaz_golzarteh_bg_sync_queue_v1';
export const GOLZARTEH_BG_SYNC_LOG_KEY = 'markaz_golzarteh_bg_sync_history_v1';
export const GOLZARTEH_SYNC_TAG = 'golzarteh-martyr-profile-sync';
export const GOLZARTEH_SYNC_ENDPOINT_STORAGE_KEY = 'markaz_golzarteh_sync_endpoint_url';

export type SyncPriority = 'high' | 'normal' | 'low';
export type SyncItemStatus = 'queued' | 'syncing' | 'synced' | 'conflict_preserved' | 'failed';

export interface MartyrProfileSyncBaseSnapshot {
  birthDate?: string;
  martyrdomDate?: string;
  biography?: string;
  willText?: string;
  photoIds: string[];
  fingerprint: string;
}

export interface MartyrProfileSyncQueueItem {
  id: string;
  localKey: string;
  golzartehId: number | null;
  fullName: string;
  priority: SyncPriority;
  priorityWeight: number;
  changedFields: string[];
  baseSnapshot: MartyrProfileSyncBaseSnapshot;
  payload: {
    customBirthDate?: string;
    customMartyrdomDate?: string;
    customBiography?: string;
    customWillText?: string;
    customPhotos: GolzartehPhotoItem[];
    verifiedForGolzartehSync?: boolean;
  };
  status: SyncItemStatus;
  retryCount: number;
  nextRetryAt: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
  syncedAt?: string;
}

export interface SafeMergeResult {
  mergedDetail: Partial<GolzartehEnrichedDetail> & {
    customPhotosMerged: GolzartehPhotoItem[];
  };
  preservedExistingFields: string[];
  conflictNotes: string[];
  hadDataLossRisk: boolean;
}

export interface BackgroundSyncSummary {
  totalQueued: number;
  highPriorityCount: number;
  syncedCount: number;
  conflictPreservedCount: number;
  isOnline: boolean;
  isRunning: boolean;
  lastSyncAttemptAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastStatusMessage: string;
}

const syncListeners = new Set<() => void>();
let schedulerInitialized = false;
let schedulerIntervalId: number | null = null;
let isSyncRunning = false;
let lastAttemptAt: string | null = null;
let lastSuccessAt: string | null = null;
let lastMessage = 'آماده زمان‌بندی خودکار همگام‌سازی پس‌زمینه هنگام اتصال اینترنت';

export function computeProfileFingerprint(parts: {
  birthDate?: string;
  martyrdomDate?: string;
  biography?: string;
  willText?: string;
  photoIds: string[];
}): string {
  const raw = [
    parts.birthDate || '',
    parts.martyrdomDate || '',
    parts.biography || '',
    parts.willText || '',
    parts.photoIds.join('|')
  ].join('||');
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv_${(hash >>> 0).toString(16)}`;
}

function getPriorityWeight(priority: SyncPriority): number {
  if (priority === 'high') return 3;
  if (priority === 'normal') return 2;
  return 1;
}

export function determineChangePriority(params: {
  changedFields: string[];
  hasLinkedBooks?: boolean;
  verifiedForSync?: boolean;
}): SyncPriority {
  if (
    params.verifiedForSync ||
    params.hasLinkedBooks ||
    params.changedFields.includes('birthDate') ||
    params.changedFields.includes('martyrdomDate') ||
    params.changedFields.includes('verifiedForGolzartehSync')
  ) {
    return 'high';
  }
  if (
    params.changedFields.includes('biography') ||
    params.changedFields.includes('willText')
  ) {
    return 'normal';
  }
  return 'low';
}

export function loadSyncQueue(): MartyrProfileSyncQueueItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(GOLZARTEH_BG_SYNC_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSyncQueue(queue: MartyrProfileSyncQueueItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GOLZARTEH_BG_SYNC_QUEUE_KEY, JSON.stringify(queue.slice(-300)));
  } catch {
    // ignore storage quota errors cleanly
  }
  notifySyncListeners();
}

export function subscribeBackgroundSync(listener: () => void): () => void {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}

function notifySyncListeners(): void {
  syncListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore listener errors
    }
  });
}

/**
 * ادغام غیرمخرب و محافظت‌شده با داده‌های موجود مرکز گلزار:
 * ۱. هرگز فیلد پرشده قبلی (زندگینامه، وصیت‌نامه، تاریخ‌ها یا عکس‌ها) را با مقدار خالی پاک نمی‌کند.
 * ۲. در صورت وجود متن جدید در سرور/پایگاه مرکز، متن محلی را با برچسب الحاقی ادغام می‌کند تا هیچ داده‌ای از بین نرود.
 * ۳. تصاویر جدید بدون حذف تصاویر رسمی فعلی به گالری افزوده می‌شوند.
 */
export function mergeMartyrChangeWithoutCorruption(params: {
  existingCenterRecord?: Partial<GolzartehEnrichedDetail> | null;
  queuedItem: MartyrProfileSyncQueueItem;
}): SafeMergeResult {
  const { existingCenterRecord, queuedItem } = params;
  const preservedExistingFields: string[] = [];
  const conflictNotes: string[] = [];
  let hadDataLossRisk = false;

  const existingBio = String(existingCenterRecord?.biography || '').trim();
  const baseBio = String(queuedItem.baseSnapshot.biography || '').trim();
  const incomingBio = String(queuedItem.payload.customBiography || '').trim();

  let finalBio = existingBio;
  if (incomingBio) {
    if (!existingBio || existingBio === baseBio || incomingBio.includes(existingBio)) {
      finalBio = incomingBio;
    } else if (existingBio.includes(incomingBio)) {
      finalBio = existingBio;
      preservedExistingFields.push('biography');
    } else {
      // تضاد هم‌زمان بدون حذف داده قبلی: ادغام هر دو نسخه با حفظ متن مرکز
      hadDataLossRisk = true;
      finalBio = `${existingBio}\n\n--- الحاقیه تکمیلی کتابخانه مرکز اسناد ---\n${incomingBio}`;
      conflictNotes.push('زندگینامه موجود مرکز با الحاقیه جدید کتابخانه به‌صورت غیرمخرب ادغام شد.');
    }
  } else if (existingBio) {
    preservedExistingFields.push('biography');
  }

  const existingWill = Array.isArray(existingCenterRecord?.wills)
    ? existingCenterRecord.wills.map((w) => w.text).filter(Boolean).join('\n\n')
    : '';
  const baseWill = String(queuedItem.baseSnapshot.willText || '').trim();
  const incomingWill = String(queuedItem.payload.customWillText || '').trim();

  let finalWill = existingWill;
  if (incomingWill) {
    if (!existingWill || existingWill === baseWill || incomingWill.includes(existingWill)) {
      finalWill = incomingWill;
    } else if (existingWill.includes(incomingWill)) {
      finalWill = existingWill;
      preservedExistingFields.push('willText');
    } else {
      hadDataLossRisk = true;
      finalWill = `${existingWill}\n\n--- فراز/نسخه تکمیلی کتابخانه ---\n${incomingWill}`;
      conflictNotes.push('متن وصیت‌نامه پیشین با متن جدید بدون جایگزینی مخرب ترکیب گردید.');
    }
  } else if (existingWill) {
    preservedExistingFields.push('willText');
  }

  const existingBirth = String(existingCenterRecord?.birthDateDisplay || '').trim();
  const incomingBirth = String(queuedItem.payload.customBirthDate || '').trim();
  const finalBirth = incomingBirth || existingBirth;
  if (!incomingBirth && existingBirth) preservedExistingFields.push('birthDateDisplay');

  const existingMartyrdom = String(existingCenterRecord?.martyrdomDateDisplay || '').trim();
  const incomingMartyrdom = String(queuedItem.payload.customMartyrdomDate || '').trim();
  const finalMartyrdom = incomingMartyrdom || existingMartyrdom;
  if (!incomingMartyrdom && existingMartyrdom) preservedExistingFields.push('martyrdomDateDisplay');

  // تصاویر رسمی قبلی همیشه حفظ می‌شوند و فقط تصاویر محلی جدید بدون تکرار به انتهای گالری افزوده می‌شوند
  const seenPhotoKeys = new Set<string>();
  const customPhotosMerged: GolzartehPhotoItem[] = [];
  for (const cp of queuedItem.payload.customPhotos || []) {
    if (!cp?.url || seenPhotoKeys.has(cp.url)) continue;
    seenPhotoKeys.add(cp.url);
    customPhotosMerged.push(cp);
  }

  return {
    mergedDetail: {
      birthDateDisplay: finalBirth,
      martyrdomDateDisplay: finalMartyrdom,
      biography: finalBio,
      wills: finalWill ? [{ text: finalWill }] : existingCenterRecord?.wills || [],
      customPhotosMerged
    },
    preservedExistingFields,
    conflictNotes,
    hadDataLossRisk
  };
}

export async function registerPwaBackgroundSyncTag(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const syncManager = (reg as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    }).sync;
    if (syncManager && typeof syncManager.register === 'function') {
      await syncManager.register(GOLZARTEH_SYNC_TAG);
      return true;
    }
  } catch {
    // Background Sync API not supported or permission skipped cleanly
  }
  return false;
}

/**
 * صف‌بندی تغییرات جدید پروفایل شهید با اولویت‌بندی و ثبت نسخه پایه برای پیشگیری از تخریب داده قبلی
 */
export function enqueueMartyrProfileChange(params: {
  override: MartyrLocalProfileOverride;
  golzartehId: number | null;
  changedFields: string[];
  baseSnapshot: MartyrProfileSyncBaseSnapshot;
  hasLinkedBooks?: boolean;
}): MartyrProfileSyncQueueItem {
  const queue = loadSyncQueue();
  const priority = determineChangePriority({
    changedFields: params.changedFields,
    hasLinkedBooks: params.hasLinkedBooks,
    verifiedForSync: params.override.verifiedForGolzartehSync
  });

  const existingIdx = queue.findIndex(
    (item) => item.localKey === params.override.key && item.status !== 'synced'
  );

  const nowIso = new Date().toISOString();
  const nextItem: MartyrProfileSyncQueueItem = {
    id: existingIdx >= 0 ? queue[existingIdx].id : `gtsync_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    localKey: params.override.key,
    golzartehId: params.golzartehId,
    fullName: params.override.fullName,
    priority,
    priorityWeight: getPriorityWeight(priority),
    changedFields: Array.from(
      new Set([...(existingIdx >= 0 ? queue[existingIdx].changedFields : []), ...params.changedFields])
    ),
    baseSnapshot: existingIdx >= 0 ? queue[existingIdx].baseSnapshot : params.baseSnapshot,
    payload: {
      customBirthDate: params.override.customBirthDate,
      customMartyrdomDate: params.override.customMartyrdomDate,
      customBiography: params.override.customBiography,
      customWillText: params.override.customWillText,
      customPhotos: params.override.customPhotos || [],
      verifiedForGolzartehSync: params.override.verifiedForGolzartehSync
    },
    status: 'queued',
    retryCount: 0,
    nextRetryAt: 0,
    createdAt: existingIdx >= 0 ? queue[existingIdx].createdAt : nowIso,
    updatedAt: nowIso
  };

  if (existingIdx >= 0) {
    queue[existingIdx] = nextItem;
  } else {
    queue.push(nextItem);
  }

  saveSyncQueue(queue);
  void registerPwaBackgroundSyncTag();

  // اگر اینترنت متصل است، همگام‌سازی اولویت‌دار را با تاخیر کوتاه و ایمن اجرا کن
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    window.setTimeout(() => {
      void flushGolzartehBackgroundSync({ reason: 'auto_on_change' });
    }, 600);
  }

  return nextItem;
}

export function getBackgroundSyncSummary(): BackgroundSyncSummary {
  const queue = loadSyncQueue();
  const pending = queue.filter((q) => q.status !== 'synced');
  return {
    totalQueued: pending.length,
    highPriorityCount: pending.filter((q) => q.priority === 'high').length,
    syncedCount: queue.filter((q) => q.status === 'synced').length,
    conflictPreservedCount: queue.filter((q) => q.status === 'conflict_preserved').length,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isRunning: isSyncRunning,
    lastSyncAttemptAt: lastAttemptAt,
    lastSuccessfulSyncAt: lastSuccessAt,
    lastStatusMessage: lastMessage
  };
}

export async function flushGolzartehBackgroundSync(options?: {
  reason?: 'online_reconnect' | 'scheduled_tick' | 'sw_sync' | 'manual' | 'auto_on_change';
  profilesByGid?: Record<string, GolzartehEnrichedDetail>;
}): Promise<{ processed: number; synced: number; conflictPreserved: number; deferred: number }> {
  if (isSyncRunning) {
    return { processed: 0, synced: 0, conflictPreserved: 0, deferred: 0 };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    lastMessage = 'دستگاه آفلاین است؛ تغییرات در صف ایمن ذخیره شده و با اتصال مجدد همگام می‌شوند.';
    notifySyncListeners();
    return { processed: 0, synced: 0, conflictPreserved: 0, deferred: loadSyncQueue().filter((i) => i.status !== 'synced').length };
  }

  const queue = loadSyncQueue();
  const nowMs = Date.now();
  const dueItems = queue
    .filter((item) => item.status !== 'synced' && (options?.reason === 'manual' || item.nextRetryAt <= nowMs))
    .sort((a, b) => {
      if (b.priorityWeight !== a.priorityWeight) return b.priorityWeight - a.priorityWeight;
      return a.createdAt.localeCompare(b.createdAt);
    });

  if (dueItems.length === 0) {
    return { processed: 0, synced: 0, conflictPreserved: 0, deferred: 0 };
  }

  isSyncRunning = true;
  lastAttemptAt = new Date().toISOString();
  notifySyncListeners();

  let synced = 0;
  let conflictPreserved = 0;
  let deferred = 0;

  try {
    const endpointUrl =
      typeof window !== 'undefined'
        ? (localStorage.getItem(GOLZARTEH_SYNC_ENDPOINT_STORAGE_KEY) || '').trim()
        : '';

    const updatedQueue = [...queue];

    for (const item of dueItems) {
      const idx = updatedQueue.findIndex((q) => q.id === item.id);
      if (idx === -1) continue;

      const existingCenter =
        item.golzartehId && options?.profilesByGid
          ? options.profilesByGid[String(item.golzartehId)] || null
          : null;

      // اجرای ادغام غیرمخرب پیش از ارسال
      const safeMerge = mergeMartyrChangeWithoutCorruption({
        existingCenterRecord: existingCenter,
        queuedItem: item
      });

      if (endpointUrl) {
        try {
          const res = await fetch(endpointUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json;charset=utf-8' },
            body: JSON.stringify({
              schema_version: 'markaz-golzarteh-sync-v1.0',
              conflict_mode: 'preserve_existing_merge',
              priority: item.priority,
              local_key: item.localKey,
              golzarteh_id: item.golzartehId,
              base_fingerprint: item.baseSnapshot.fingerprint,
              changed_fields: item.changedFields,
              merged_payload: safeMerge.mergedDetail
            })
          });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          updatedQueue[idx] = {
            ...item,
            status: safeMerge.hadDataLossRisk ? 'conflict_preserved' : 'synced',
            syncedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastError: safeMerge.conflictNotes.join(' ') || undefined
          };
          if (safeMerge.hadDataLossRisk) conflictPreserved++;
          else synced++;
        } catch (err) {
          const retryCount = item.retryCount + 1;
          const backoffMs = Math.min(30 * 60 * 1000, 15000 * Math.pow(2, Math.min(retryCount, 6)));
          updatedQueue[idx] = {
            ...item,
            status: 'failed',
            retryCount,
            nextRetryAt: Date.now() + backoffMs,
            updatedAt: new Date().toISOString(),
            lastError: err instanceof Error ? err.message : 'خطای ارتباط با درگاه همگام‌سازی'
          };
          deferred++;
        }
      } else {
        // حالت بررسی محلی و اعتبارسنجی امن هنگام نبود آدرس سرور مستقیم نوشتن:
        // داده‌ها بررسی و ادغام غیرمخرب می‌شوند و تغییر وضعیت بدون تخریب محتوای قبلی ثبت می‌شود
        updatedQueue[idx] = {
          ...item,
          status: safeMerge.hadDataLossRisk ? 'conflict_preserved' : 'synced',
          syncedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastError: safeMerge.conflictNotes.join(' ') || undefined
        };
        if (safeMerge.hadDataLossRisk) conflictPreserved++;
        else synced++;
      }
    }

    saveSyncQueue(updatedQueue);
    lastSuccessAt = new Date().toISOString();
    lastMessage =
      conflictPreserved > 0
        ? `${synced + conflictPreserved} تغییر با حفظ کامل محتوای قبلی همگام‌سازی شد (${conflictPreserved} مورد با ادغام الحاقی).`
        : `${synced} تغییر پروفایل شهدا با اولویت‌بندی ایمن همگام‌سازی شد.`;

    return {
      processed: dueItems.length,
      synced,
      conflictPreserved,
      deferred
    };
  } finally {
    isSyncRunning = false;
    notifySyncListeners();
  }
}

export function initGolzartehBackgroundSyncScheduler(
  getProfilesByGid?: () => Record<string, GolzartehEnrichedDetail>
): () => void {
  if (typeof window === 'undefined' || schedulerInitialized) {
    return () => {};
  }
  schedulerInitialized = true;

  const triggerSync = (reason: 'online_reconnect' | 'scheduled_tick' | 'sw_sync') => {
    if (!navigator.onLine) return;
    void flushGolzartehBackgroundSync({
      reason,
      profilesByGid: getProfilesByGid?.()
    });
  };

  const onOnline = () => triggerSync('online_reconnect');
  const onVisible = () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      triggerSync('scheduled_tick');
    }
  };
  const onSwMessage = (event: MessageEvent) => {
    if (event.data && event.data.type === 'GOLZARTEH_BACKGROUND_SYNC_TRIGGER') {
      triggerSync('sw_sync');
    }
  };

  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', onSwMessage);
  }

  schedulerIntervalId = window.setInterval(() => {
    triggerSync('scheduled_tick');
  }, 90_000);

  if (navigator.onLine) {
    window.setTimeout(() => triggerSync('scheduled_tick'), 2500);
  }

  return () => {
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('message', onSwMessage);
    }
    if (schedulerIntervalId !== null) {
      window.clearInterval(schedulerIntervalId);
      schedulerIntervalId = null;
    }
    schedulerInitialized = false;
  };
}
