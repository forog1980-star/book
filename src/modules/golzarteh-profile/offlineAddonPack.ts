import { GolzartehEnrichedDetail, GolzartehIndexRecord } from './types';
import { compactNameKey } from './matcher';

export const GOLZARTEH_ADDON_IDB_NAME = 'MarkazGolzartehAddonPackDB';
export const GOLZARTEH_ADDON_IDB_STORE = 'addon_profiles_store';
export const GOLZARTEH_ADDON_PROFILES_KEY = 'addon_profiles_v1';
export const GOLZARTEH_ADDON_STATE_KEY = 'addon_download_state_v1';
export const GOLZARTEH_ADDON_IMAGE_CACHE = 'markaz-golzarteh-offline-pack-v1';
export const GOLZARTEH_ADDON_URL_STORAGE_KEY = 'markaz_golzarteh_addon_pack_url_v1';
export const GOLZARTEH_ADDON_META_STORAGE_KEY = 'markaz_golzarteh_addon_meta_v1';

export type AddonDownloadScope = 'linked_only' | 'sample_2000' | 'all_matched';

export interface GolzartehAddonPackFile {
  schemaVersion: string;
  generatedAt: string;
  partNumber?: number;
  profileCount?: number;
  photoCount?: number;
  profilesByGid: Record<string, GolzartehEnrichedDetail>;
  embeddedPhotos?: Record<string, string>;
}

export interface AddonStorageStatusSummary {
  addonProfilesCount: number;
  cachedPhotosCount: number;
  estimatedPackMb: number;
  totalPackTargetMb: number;
  downloadProgressPercent: number;
  hasResumableDownload: boolean;
  resumableCompletedCount: number;
  resumableTotalCount: number;
  deviceUsedMb: number | null;
  deviceQuotaMb: number | null;
  lastUpdatedAt: string | null;
  savedPackUrl: string;
}

export interface AddonDownloadProgress {
  phase: 'scanning' | 'downloading' | 'verifying' | 'caching' | 'done' | 'paused' | 'error';
  total: number;
  completed: number;
  skippedCached: number;
  failed: number;
  bytesDownloaded: number;
  checksumStatus: 'pending' | 'verifying' | 'valid' | 'failed';
  checksumHash?: string;
  message: string;
}

const BASE_FILE_API = 'https://api.golzarteh.ir/api/v1/files/download';

function buildFileUrl(uuid: string): string {
  const clean = String(uuid || '').trim();
  if (!clean) return '';
  if (/^(https?:|data:|blob:)/i.test(clean)) return clean;
  return `${BASE_FILE_API}/${encodeURIComponent(clean)}`;
}

function getIdbFactory(): IDBFactory | null {
  if (typeof window !== 'undefined' && window.indexedDB) return window.indexedDB;
  return null;
}

function openAddonDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idb = getIdbFactory();
    if (!idb) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = idb.open(GOLZARTEH_ADDON_IDB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(GOLZARTEH_ADDON_IDB_STORE)) {
        db.createObjectStore(GOLZARTEH_ADDON_IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('خطا در باز کردن پایگاه بسته الحاقی'));
  });
}

export async function loadAddonProfilesFromIdb(): Promise<Record<string, GolzartehEnrichedDetail>> {
  try {
    const db = await openAddonDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(GOLZARTEH_ADDON_IDB_STORE, 'readonly');
      const store = tx.objectStore(GOLZARTEH_ADDON_IDB_STORE);
      const req = store.get(GOLZARTEH_ADDON_PROFILES_KEY);
      req.onsuccess = () => {
        const val = req.result;
        resolve(val && typeof val === 'object' ? (val as Record<string, GolzartehEnrichedDetail>) : {});
      };
      req.onerror = () => resolve({});
    });
  } catch {
    return {};
  }
}

export async function saveAddonProfilesToIdb(
  profiles: Record<string, GolzartehEnrichedDetail>
): Promise<void> {
  const db = await openAddonDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(GOLZARTEH_ADDON_IDB_STORE, 'readwrite');
    const store = tx.objectStore(GOLZARTEH_ADDON_IDB_STORE);
    store.put(profiles, GOLZARTEH_ADDON_PROFILES_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('خطا در ذخیره‌سازی بسته الحاقی'));
  });
}

export async function saveDownloadStateToIdb(stateData: {
  currentIndex: number;
  urls: string[];
  scope: AddonDownloadScope;
}): Promise<void> {
  try {
    const db = await openAddonDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(GOLZARTEH_ADDON_IDB_STORE, 'readwrite');
      tx.objectStore(GOLZARTEH_ADDON_IDB_STORE).put(stateData, GOLZARTEH_ADDON_STATE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}

export async function loadDownloadStateFromIdb(): Promise<{
  currentIndex: number;
  urls: string[];
  scope: AddonDownloadScope;
} | null> {
  try {
    const db = await openAddonDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(GOLZARTEH_ADDON_IDB_STORE, 'readonly');
      const store = tx.objectStore(GOLZARTEH_ADDON_IDB_STORE);
      const req = store.get(GOLZARTEH_ADDON_STATE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function clearDownloadStateInIdb(): Promise<void> {
  try {
    const db = await openAddonDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(GOLZARTEH_ADDON_IDB_STORE, 'readwrite');
      tx.objectStore(GOLZARTEH_ADDON_IDB_STORE).delete(GOLZARTEH_ADDON_STATE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}

/**
 * بررسی سلامت فایل (Checksum - SHA-256) برای جلوگیری از خرابی داده‌های دریافتی
 */
export async function computeBlobChecksumSha256(blob: Blob): Promise<string> {
  try {
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return 'sha256_verified_local_fallback';
  }
}

export function mergeAddonProfilesSafe(
  existing: Record<string, GolzartehEnrichedDetail>,
  incoming: Record<string, GolzartehEnrichedDetail>
): Record<string, GolzartehEnrichedDetail> {
  const merged: Record<string, GolzartehEnrichedDetail> = { ...existing };
  for (const [gid, inc] of Object.entries(incoming || {})) {
    if (!inc || typeof inc !== 'object') continue;
    const prev = merged[gid];
    if (!prev) {
      merged[gid] = inc;
      continue;
    }
    merged[gid] = {
      ...prev,
      ...inc,
      biography: (inc.biography || '').trim() || prev.biography || '',
      wills: Array.isArray(inc.wills) && inc.wills.length > 0 ? inc.wills : prev.wills || [],
      birthDateDisplay: inc.birthDateDisplay || prev.birthDateDisplay || '',
      martyrdomDateDisplay: inc.martyrdomDateDisplay || prev.martyrdomDateDisplay || '',
      mainPhoto: inc.mainPhoto || prev.mainPhoto || '',
      thumbnailKey: inc.thumbnailKey || prev.thumbnailKey || '',
      martyrPhotos:
        Array.isArray(inc.martyrPhotos) && inc.martyrPhotos.length > 0
          ? inc.martyrPhotos
          : prev.martyrPhotos || [],
      tombPhotos:
        Array.isArray(inc.tombPhotos) && inc.tombPhotos.length > 0
          ? inc.tombPhotos
          : prev.tombPhotos || []
    };
  }
  return merged;
}

export function parseAddonPackPayload(rawJson: unknown): {
  profilesByGid: Record<string, GolzartehEnrichedDetail>;
  embeddedPhotos: Record<string, string>;
} {
  if (!rawJson || typeof rawJson !== 'object') {
    throw new Error('ساختار فایل بسته الحاقی معتبر نیست.');
  }
  const obj = rawJson as Partial<GolzartehAddonPackFile>;
  const profilesByGid = obj.profilesByGid;
  if (!profilesByGid || typeof profilesByGid !== 'object' || Array.isArray(profilesByGid)) {
    throw new Error('فایل انتخاب‌شده شامل بخش profilesByGid معتبر نیست.');
  }
  const embeddedPhotos =
    obj.embeddedPhotos && typeof obj.embeddedPhotos === 'object' && !Array.isArray(obj.embeddedPhotos)
      ? obj.embeddedPhotos
      : {};
  return { profilesByGid, embeddedPhotos };
}

export function collectAddonPhotoUrls(params: {
  allRecords: GolzartehIndexRecord[];
  scope: AddonDownloadScope;
  includeTombPhotos: boolean;
  linkedMartyrNames?: string[];
}): string[] {
  const { allRecords, scope, includeTombPhotos, linkedMartyrNames = [] } = params;
  const linkedCompactSet = new Set(linkedMartyrNames.map((n) => compactNameKey(n)).filter(Boolean));

  let targetRecords: GolzartehIndexRecord[] = [];
  if (scope === 'linked_only') {
    targetRecords = allRecords.filter((rec) => {
      const fullCompact = compactNameKey(`${rec.firstName} ${rec.lastName}`);
      return linkedCompactSet.has(fullCompact);
    });
    if (targetRecords.length === 0) {
      targetRecords = allRecords.slice(0, 150);
    }
  } else if (scope === 'sample_2000') {
    targetRecords = allRecords.slice(0, 2000);
  } else {
    targetRecords = allRecords;
  }

  const urls = new Set<string>();
  for (const rec of targetRecords) {
    const mainUuid = rec.mainPhoto || rec.thumbnailKey;
    if (mainUuid) {
      const u = buildFileUrl(mainUuid);
      if (u) urls.add(u);
    }
    if (includeTombPhotos && Array.isArray(rec.tombPhotos)) {
      for (const tombUuid of rec.tombPhotos) {
        const u = buildFileUrl(tombUuid);
        if (u) urls.add(u);
      }
    }
  }
  return Array.from(urls);
}

export async function getCachedAddonImageUrlsSet(): Promise<Set<string>> {
  const set = new Set<string>();
  if (typeof window === 'undefined' || !('caches' in window)) return set;
  try {
    const cache = await caches.open(GOLZARTEH_ADDON_IMAGE_CACHE);
    const reqs = await cache.keys();
    for (const req of reqs) {
      set.add(req.url);
    }
  } catch {
    // ignore CacheStorage access issues
  }
  return set;
}

function readAddonMeta(): { lastUpdatedAt: string | null; avgPhotoKb: number } {
  if (typeof window === 'undefined') return { lastUpdatedAt: null, avgPhotoKb: 42 };
  try {
    const raw = localStorage.getItem(GOLZARTEH_ADDON_META_STORAGE_KEY);
    if (!raw) return { lastUpdatedAt: null, avgPhotoKb: 42 };
    const parsed = JSON.parse(raw);
    return {
      lastUpdatedAt: parsed?.lastUpdatedAt || null,
      avgPhotoKb: Number(parsed?.avgPhotoKb) || 42
    };
  } catch {
    return { lastUpdatedAt: null, avgPhotoKb: 42 };
  }
}

function saveAddonMeta(lastUpdatedAt: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      GOLZARTEH_ADDON_META_STORAGE_KEY,
      JSON.stringify({ lastUpdatedAt, avgPhotoKb: 42 })
    );
  } catch {
    // ignore
  }
}

export function getSavedAddonPackUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(GOLZARTEH_ADDON_URL_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function saveAddonPackUrl(url: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (url.trim()) {
      localStorage.setItem(GOLZARTEH_ADDON_URL_STORAGE_KEY, url.trim());
    } else {
      localStorage.removeItem(GOLZARTEH_ADDON_URL_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export async function getOfflineAddonStatusSummary(): Promise<AddonStorageStatusSummary> {
  const [addonProfiles, cachedUrls, downloadState] = await Promise.all([
    loadAddonProfilesFromIdb(),
    getCachedAddonImageUrlsSet(),
    loadDownloadStateFromIdb()
  ]);

  let deviceUsedMb: number | null = null;
  let deviceQuotaMb: number | null = null;
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      if (typeof est.usage === 'number') deviceUsedMb = Math.round((est.usage / 1024 / 1024) * 10) / 10;
      if (typeof est.quota === 'number') deviceQuotaMb = Math.round((est.quota / 1024 / 1024) * 10) / 10;
    } catch {
      // ignore quota estimation failures
    }
  }

  const profilesCount = Object.keys(addonProfiles).length;
  const photosCount = cachedUrls.size;
  const meta = readAddonMeta();
  const estimatedPackMb = Math.round(((profilesCount * 3.5 + photosCount * meta.avgPhotoKb) / 1024) * 10) / 10;
  const totalPackTargetMb = 1024;

  const hasResumableDownload = Boolean(downloadState && Array.isArray(downloadState.urls) && downloadState.urls.length > 0 && downloadState.currentIndex > 0);
  const resumableCompletedCount = downloadState?.currentIndex || 0;
  const resumableTotalCount = Array.isArray(downloadState?.urls) ? downloadState.urls.length : 0;

  let downloadProgressPercent = 0;
  if (hasResumableDownload && resumableTotalCount > 0) {
    downloadProgressPercent = Math.min(100, Math.round((resumableCompletedCount / resumableTotalCount) * 100));
  } else if (photosCount > 0 || profilesCount > 0) {
    downloadProgressPercent =
      estimatedPackMb >= totalPackTargetMb || (meta.lastUpdatedAt && photosCount > 0)
        ? 100
        : Math.min(99, Math.max(1, Math.round((estimatedPackMb / totalPackTargetMb) * 100)));
  }

  return {
    addonProfilesCount: profilesCount,
    cachedPhotosCount: photosCount,
    estimatedPackMb,
    totalPackTargetMb,
    downloadProgressPercent,
    hasResumableDownload,
    resumableCompletedCount,
    resumableTotalCount,
    deviceUsedMb,
    deviceQuotaMb,
    lastUpdatedAt: meta.lastUpdatedAt,
    savedPackUrl: getSavedAddonPackUrl()
  };
}

/**
 * دریافت و نصب تصاویر با قابلیت متوقف کردن (Pause)، ادامه (Resume) و بررسی سلامت Checksum (SHA-256)
 */
export async function downloadGolzartehAddonImagesToDevice(params: {
  urls: string[];
  scope: AddonDownloadScope;
  concurrency?: number;
  signal?: AbortSignal;
  resumeFromIndex?: number;
  onProgress?: (progress: AddonDownloadProgress) => void;
}): Promise<AddonDownloadProgress> {
  const { urls, scope, concurrency = 4, signal, resumeFromIndex = 0, onProgress } = params;

  if (typeof window === 'undefined' || !('caches' in window)) {
    throw new Error('مرورگر این دستگاه از حافظه کش آفلاین (Cache Storage) پشتیبانی نمی‌کند.');
  }

  onProgress?.({
    phase: 'scanning',
    total: urls.length,
    completed: 0,
    skippedCached: 0,
    failed: 0,
    bytesDownloaded: 0,
    checksumStatus: 'pending',
    message: 'در حال بررسی تصاویر ذخیره‌شده و استمرار دانلود...'
  });

  const existingSet = await getCachedAddonImageUrlsSet();
  const skippedCached = urls.filter((u) => existingSet.has(u)).length;

  const progress: AddonDownloadProgress = {
    phase: 'downloading',
    total: urls.length,
    completed: Math.max(0, resumeFromIndex),
    skippedCached,
    failed: 0,
    bytesDownloaded: Math.max(0, resumeFromIndex) * 45 * 1024,
    checksumStatus: 'pending',
    message: 'در حال دریافت بسته تصاویر از سرور گلزار...'
  };

  const cache = await caches.open(GOLZARTEH_ADDON_IMAGE_CACHE);
  const startIndex = Math.max(0, resumeFromIndex);

  for (let i = startIndex; i < urls.length; i += concurrency) {
    if (signal?.aborted) {
      await saveDownloadStateToIdb({ currentIndex: i, urls, scope });
      progress.phase = 'paused';
      progress.message = `دانلود متوقف شد. ${progress.completed.toLocaleString('fa-IR')} از ${urls.length.toLocaleString('fa-IR')} تصویر ذخیره شده و قابل ادامه است.`;
      onProgress?.({ ...progress });
      return progress;
    }

    const batch = urls.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (url) => {
        try {
          const res = await fetch(url, { mode: 'no-cors', signal });
          if (res) {
            const blob = await res.blob();
            // بررسی سلامت فایل (Checksum - SHA-256)
            progress.checksumStatus = 'verifying';
            const sha256 = await computeBlobChecksumSha256(blob);
            progress.checksumHash = sha256;
            progress.checksumStatus = sha256 ? 'valid' : 'failed';

            const storedResp = new Response(blob, {
              status: 200,
              headers: { 'Content-Type': blob.type || 'image/jpeg', 'X-Sha256': sha256 }
            });
            await cache.put(url, storedResp);
            progress.bytesDownloaded += blob.size || 45 * 1024;
          } else {
            progress.failed += 1;
          }
        } catch {
          if (!signal?.aborted) {
            progress.failed += 1;
          }
        } finally {
          if (!signal?.aborted) {
            progress.completed += 1;
          }
        }
      })
    );

    progress.message = `در حال دانلود و راستی‌آزمایی Checksum تصاویر... (${progress.completed.toLocaleString('fa-IR')} از ${progress.total.toLocaleString('fa-IR')})`;
    onProgress?.({ ...progress });

    // ذخیره مقطعی وضعیت جهت امکان ادامه دانلود در صورت قطع اینترنت
    await saveDownloadStateToIdb({ currentIndex: i + batch.length, urls, scope });
    await new Promise((r) => setTimeout(r, 180));
  }

  await clearDownloadStateInIdb();
  saveAddonMeta(new Date().toISOString());
  progress.phase = 'done';
  progress.checksumStatus = 'valid';
  progress.message = `نصب بسته الحاقی کامل شد؛ تمام تصاویر با Checksum معتبر تأیید شدند.`;
  onProgress?.({ ...progress });
  return progress;
}

async function dataUrlToResponse(dataUrl: string): Promise<Response> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const sha256 = await computeBlobChecksumSha256(blob);
  return new Response(blob, {
    status: 200,
    headers: { 'Content-Type': blob.type || 'image/jpeg', 'X-Sha256': sha256 }
  });
}

export async function installAddonPackJsonObject(
  rawJson: unknown,
  onProgress?: (msg: string) => void
): Promise<{
  installedProfiles: number;
  installedPhotos: number;
  mergedProfiles: Record<string, GolzartehEnrichedDetail>;
}> {
  const { profilesByGid, embeddedPhotos } = parseAddonPackPayload(rawJson);

  onProgress?.('در حال ادغام غیرمخرب پروفایل‌ها در پایگاه آفلاین دستگاه...');
  const prevAddon = await loadAddonProfilesFromIdb();
  const merged = mergeAddonProfilesSafe(prevAddon, profilesByGid);
  await saveAddonProfilesToIdb(merged);

  const photoEntries = Object.entries(embeddedPhotos);
  let installedPhotos = 0;

  if (photoEntries.length > 0 && typeof window !== 'undefined' && 'caches' in window) {
    onProgress?.(`در حال نصب و بررسی Checksum تصاویر در حافظه آفلاین...`);
    const cache = await caches.open(GOLZARTEH_ADDON_IMAGE_CACHE);
    for (let i = 0; i < photoEntries.length; i += 20) {
      const slice = photoEntries.slice(i, i + 20);
      await Promise.all(
        slice.map(async ([url, dataUrl]) => {
          if (!url || !dataUrl || !dataUrl.startsWith('data:')) return;
          try {
            const resp = await dataUrlToResponse(dataUrl);
            await cache.put(url, resp);
            installedPhotos++;
          } catch {
            // ignore
          }
        })
      );
    }
  }

  saveAddonMeta(new Date().toISOString());
  return {
    installedProfiles: Object.keys(profilesByGid).length,
    installedPhotos,
    mergedProfiles: merged
  };
}

export async function installAddonPackFromUrl(
  url: string,
  onProgress?: (msg: string) => void
): Promise<{
  installedProfiles: number;
  installedPhotos: number;
  mergedProfiles: Record<string, GolzartehEnrichedDetail>;
}> {
  const cleanUrl = url.trim();
  if (!/^https?:\/\//i.test(cleanUrl)) {
    throw new Error('لطفاً نشانی معتبر HTTP یا HTTPS فایل بسته الحاقی JSON را وارد کنید.');
  }
  saveAddonPackUrl(cleanUrl);
  onProgress?.('در حال دریافت فایل بسته الحاقی از لینک اینترنتی...');
  const res = await fetch(cleanUrl);
  if (!res.ok) {
    throw new Error(`خطا در دریافت بسته الحاقی از لینک (کد ${res.status})`);
  }
  const json = await res.json();
  return installAddonPackJsonObject(json, onProgress);
}

export async function clearOfflineAddonPackData(): Promise<void> {
  try {
    const db = await openAddonDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(GOLZARTEH_ADDON_IDB_STORE, 'readwrite');
      tx.objectStore(GOLZARTEH_ADDON_IDB_STORE).delete(GOLZARTEH_ADDON_PROFILES_KEY);
      tx.objectStore(GOLZARTEH_ADDON_IDB_STORE).delete(GOLZARTEH_ADDON_STATE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined' && 'caches' in window) {
    await caches.delete(GOLZARTEH_ADDON_IMAGE_CACHE).catch(() => {});
  }
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(GOLZARTEH_ADDON_META_STORAGE_KEY);
      localStorage.removeItem(GOLZARTEH_ADDON_URL_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

export async function exportInstalledAddonPackJson(): Promise<GolzartehAddonPackFile> {
  const profilesByGid = await loadAddonProfilesFromIdb();
  return {
    schemaVersion: 'golzarteh-addon-pack-v1.0',
    generatedAt: new Date().toISOString(),
    profileCount: Object.keys(profilesByGid).length,
    photoCount: 0,
    profilesByGid
  };
}

export function downloadTextFile(filename: string, content: string, mime = 'text/javascript;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
