import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Database,
  CheckCircle2,
  AlertTriangle,
  HardDrive,
  RefreshCw,
  Trash2,
  Upload,
  Layers,
  X,
  Play,
  Pause,
  Info,
  ShieldCheck
} from 'lucide-react';
import { toPersianDigits } from '../../data/markazAsnadData';
import { ModalWindow } from '../../components/ModalWindow';
import {
  AddonDownloadProgress,
  AddonDownloadScope,
  AddonStorageStatusSummary,
  clearOfflineAddonPackData,
  collectAddonPhotoUrls,
  downloadGolzartehAddonImagesToDevice,
  exportInstalledAddonPackJson,
  getOfflineAddonStatusSummary,
  installAddonPackFromUrl,
  installAddonPackJsonObject,
  loadDownloadStateFromIdb,
  downloadTextFile
} from './offlineAddonPack';
import { GolzartehIndexRecord } from './types';

interface GolzartehAddonPackWidgetProps {
  allRecords: GolzartehIndexRecord[];
  linkedMartyrNames?: string[];
  onNotify?: (msg: string, type?: 'success' | 'warning') => void;
  onRefreshDataset?: () => void;
}

export const GolzartehAddonPackWidget: React.FC<GolzartehAddonPackWidgetProps> = ({
  allRecords,
  linkedMartyrNames = [],
  onNotify,
  onRefreshDataset
}) => {
  const [summary, setSummary] = useState<AddonStorageStatusSummary | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [downloadScope, setDownloadScope] = useState<AddonDownloadScope>('linked_only');
  const [includeTomb, setIncludeTomb] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<AddonDownloadProgress | null>(null);
  const [hasPausedState, setHasPausedState] = useState(false);
  const [pausedResumeIndex, setPausedResumeIndex] = useState(0);
  const [urlInput, setUrlInput] = useState('');
  const [isImportingUrl, setIsImportingUrl] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadSummary = async () => {
    const s = await getOfflineAddonStatusSummary();
    setSummary(s);
    const savedState = await loadDownloadStateFromIdb();
    if (savedState && savedState.currentIndex > 0) {
      setHasPausedState(true);
      setPausedResumeIndex(savedState.currentIndex);
      setDownloadScope(savedState.scope);
    } else {
      setHasPausedState(false);
    }
  };

  useEffect(() => {
    void loadSummary();
  }, []);

  const handleStartDownload = async (resumeIndex = 0) => {
    const urls = collectAddonPhotoUrls({
      allRecords,
      scope: downloadScope,
      includeTombPhotos: includeTomb,
      linkedMartyrNames
    });

    if (urls.length === 0) {
      onNotify?.('هیچ تصویری برای دانلود در محدوده انتخاب‌شده یافت نشد.', 'warning');
      return;
    }

    setIsDownloading(true);
    abortControllerRef.current = new AbortController();

    try {
      const finalProg = await downloadGolzartehAddonImagesToDevice({
        urls,
        scope: downloadScope,
        concurrency: 4,
        signal: abortControllerRef.current.signal,
        resumeFromIndex: resumeIndex,
        onProgress: (p) => setProgress({ ...p })
      });
      await loadSummary();
      onRefreshDataset?.();
      if (finalProg.phase === 'done') {
        onNotify?.(
          `✅ بسته الحاقی تصاویر شهدا با موفقیت نصب و سلامت Checksum (SHA-256) تأیید شد (${toPersianDigits(finalProg.completed)} تصویر).`,
          'success'
        );
      }
    } catch (err) {
      onNotify?.(
        err instanceof Error ? err.message : 'خطا در فرآیند دریافت تصاویر بسته الحاقی.',
        'warning'
      );
    } finally {
      setIsDownloading(false);
      abortControllerRef.current = null;
      await loadSummary();
    }
  };

  const handleStopDownload = () => {
    abortControllerRef.current?.abort();
    setIsDownloading(false);
    onNotify?.('دانلود متوقف شد؛ وضعیت و پیشرفت شما در پایگاه دستگاه ذخیره شد و هر زمان قابل ادامه است.', 'warning');
    void loadSummary();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await installAddonPackJsonObject(json, (msg) => {
        onNotify?.(msg);
      });
      await loadSummary();
      onRefreshDataset?.();
      onNotify?.(
        `✅ بسته الحاقی با موفقیت بارگذاری شد و Checksum بررسی گردید (${toPersianDigits(res.installedProfiles)} پروفایل و ${toPersianDigits(res.installedPhotos)} تصویر).`,
        'success'
      );
      setShowModal(false);
    } catch (err) {
      onNotify?.(
        err instanceof Error ? `خطا در پردازش فایل JSON: ${err.message}` : 'فایل بسته الحاقی معتبر نیست.',
        'warning'
      );
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUrlInstall = async () => {
    if (!urlInput.trim()) {
      onNotify?.('لطفاً نشانی اینترنتی معتبر فایل بسته الحاقی را وارد کنید.', 'warning');
      return;
    }
    setIsImportingUrl(true);
    try {
      const res = await installAddonPackFromUrl(urlInput, (msg) => {
        onNotify?.(msg);
      });
      await loadSummary();
      onRefreshDataset?.();
      onNotify?.(
        `✅ بسته الحاقی از لینک دریافت شد (${toPersianDigits(res.installedProfiles)} پروفایل).`,
        'success'
      );
      setUrlInput('');
      setShowModal(false);
    } catch (err) {
      onNotify?.(
        err instanceof Error ? err.message : 'خطا در بارگذاری بسته الحاقی از لینک.',
        'warning'
      );
    } finally {
      setIsImportingUrl(false);
    }
  };

  const handleClearCache = async () => {
    if (!window.confirm('آیا از پاک‌سازی تصاویر و پروفایل‌های بسته الحاقی آفلاین مطمئن هستید؟')) return;
    await clearOfflineAddonPackData();
    await loadSummary();
    onRefreshDataset?.();
    onNotify?.('کش بسته الحاقی آفلاین با موفقیت پاک‌سازی شد.', 'success');
  };

  const handleExportJson = async () => {
    const pkg = await exportInstalledAddonPackJson();
    downloadTextFile('golzarteh_installed_addon_backup.json', JSON.stringify(pkg, null, 2));
    onNotify?.('فایل پشتیبان بسته الحاقی صادر و دانلود شد.', 'success');
  };

  const profilesCount = summary?.addonProfilesCount || 0;
  const photosCount = summary?.cachedPhotosCount || 0;
  const statusLabel =
    isDownloading
      ? 'در حال دانلود و راستی‌آزمایی Checksum...'
      : profilesCount > 0 || photosCount > 0
      ? 'تکمیل‌شده (فعال آفلاین)'
      : 'فعال‌نشده (پیش‌فرض سبک‌وزن)';

  return (
    <>
      <div className="bg-[#FAF5EE] border border-[#D8C7B2] rounded-2xl p-4 space-y-3 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#6B3E26]/10 text-[#6B3E26] flex items-center justify-center shrink-0">
              <HardDrive className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-sm text-[#332218] flex items-center gap-2 flex-wrap">
                <span>مدیریت بسته الحاقی آفلاین شهدا (تصاویر باکیفیت و رزولوشن اصلی)</span>
                <span
                  className={`text-[10.5px] font-bold px-2 py-0.5 rounded-md border ${
                    isDownloading
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : profilesCount > 0 || photosCount > 0
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-slate-100 text-slate-700 border-slate-300'
                  }`}
                >
                  {statusLabel}
                </span>
              </div>
              <div className="text-[11px] text-[#6E5846] mt-0.5">
                حجم نرم‌افزار اصلی سبک است. برای دسترسی کامل به عکس‌های پرسنلی و مزار شهدا بدون اینترنت همراه با بررسی سلامت فایل (Checksum)، از این بخش استفاده کنید.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="min-h-[38px] px-4 py-2 rounded-xl bg-[#6B3E26] hover:bg-[#56311E] text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>مدیریت بسته الحاقی</span>
          </button>
        </div>

        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#E2D2BE]/60 text-xs">
            <div className="bg-white p-2 rounded-xl border border-[#E2D2BE] text-center">
              <div className="text-[10px] text-[#6E5846]">پروفایل‌های ذخیره‌شده</div>
              <div className="font-bold font-mono text-[#332218] text-sm">
                {toPersianDigits(profilesCount)}
              </div>
            </div>
            <div className="bg-white p-2 rounded-xl border border-[#E2D2BE] text-center">
              <div className="text-[10px] text-[#6E5846]">تصاویر کش‌شده در گوشی</div>
              <div className="font-bold font-mono text-[#332218] text-sm">
                {toPersianDigits(photosCount)}
              </div>
            </div>
            <div className="bg-white p-2 rounded-xl border border-[#E2D2BE] text-center">
              <div className="text-[10px] text-[#6E5846]">حجم تخمینی بسته</div>
              <div className="font-bold font-mono text-[#6B3E26] text-sm">
                {toPersianDigits(summary.estimatedPackMb)} مگابایت
              </div>
            </div>
            <div className="bg-white p-2 rounded-xl border border-[#E2D2BE] text-center">
              <div className="text-[10px] text-[#6E5846]">فضای اشغال‌شده دستگاه</div>
              <div className="font-bold font-mono text-[#1F4E79] text-sm">
                {summary.deviceUsedMb !== null ? `${toPersianDigits(summary.deviceUsedMb)} MB` : 'نامشخص'}
              </div>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <ModalWindow
          onClose={() => {
            if (!isDownloading) setShowModal(false);
          }}
          title="مدیریت و دانلود بسته الحاقی آفلاین شهدا"
          maxWidthClass="max-w-2xl"
        >
          <div className="space-y-4 text-xs text-[#332218]">
            {/* بخش ۱: دانلود مستقیم تصاویر با پشتیبانی از Pause/Resume و Checksum */}
            <div className="bg-white border border-[#D8C7B2] rounded-xl p-4 space-y-3">
              <div className="font-bold text-sm text-[#6B3E26] flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5">
                  <Download className="w-4 h-4 text-[#6B3E26]" />
                  <span>دانلود مستقیم با مدیریت پیشرفت و Checksum (SHA-256)</span>
                </span>
                {hasPausedState && !isDownloading && (
                  <span className="text-[11px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md border border-amber-300 font-bold">
                    دارای دانلود متوقف‌شده (آماده ادامه)
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <label className="block font-bold text-[#332218]">محدوده دانلود:</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={isDownloading}
                    onClick={() => setDownloadScope('linked_only')}
                    className={`p-2.5 rounded-xl border text-right font-bold transition-all cursor-pointer disabled:opacity-50 ${
                      downloadScope === 'linked_only'
                        ? 'bg-[#6B3E26] text-white border-[#6B3E26]'
                        : 'bg-[#FAF5EE] text-[#332218] border-[#D8C7B2]'
                    }`}
                  >
                    <div>کتب مرتبط با شهدا</div>
                    <div className="text-[10.5px] opacity-80 mt-0.5">فقط تصاویر شهدای ثبت‌شده در کتابخانه</div>
                  </button>
                  <button
                    type="button"
                    disabled={isDownloading}
                    onClick={() => setDownloadScope('sample_2000')}
                    className={`p-2.5 rounded-xl border text-right font-bold transition-all cursor-pointer disabled:opacity-50 ${
                      downloadScope === 'sample_2000'
                        ? 'bg-[#6B3E26] text-white border-[#6B3E26]'
                        : 'bg-[#FAF5EE] text-[#332218] border-[#D8C7B2]'
                    }`}
                  >
                    <div>۲۰۰۰ شهید اول</div>
                    <div className="text-[10.5px] opacity-80 mt-0.5">حجم متوسط (~۲۵۰ مگابایت)</div>
                  </button>
                  <button
                    type="button"
                    disabled={isDownloading}
                    onClick={() => setDownloadScope('all_matched')}
                    className={`p-2.5 rounded-xl border text-right font-bold transition-all cursor-pointer disabled:opacity-50 ${
                      downloadScope === 'all_matched'
                        ? 'bg-[#6B3E26] text-white border-[#6B3E26]'
                        : 'bg-[#FAF5EE] text-[#332218] border-[#D8C7B2]'
                    }`}
                  >
                    <div>کل شهدا (بسته کامل)</div>
                    <div className="text-[10.5px] opacity-80 mt-0.5">همه تصاویر پرسنلی و مزار (~۱ الی ۲ گیگابایت)</div>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="includeTombCheckAddon"
                  disabled={isDownloading}
                  checked={includeTomb}
                  onChange={(e) => setIncludeTomb(e.target.checked)}
                  className="w-4 h-4 text-[#6B3E26] rounded border-[#D8C7B2]"
                />
                <label htmlFor="includeTombCheckAddon" className="font-bold cursor-pointer">
                  شامل تصاویر سنگ مزار شهدا علاوه بر عکس پرسنلی
                </label>
              </div>

              {(isDownloading || progress) && (
                <div className="space-y-2 bg-[#FAF5EE] p-3 rounded-xl border border-[#D8C7B2]">
                  <div className="flex justify-between font-bold text-xs">
                    <span>{progress?.message || 'در حال آماده‌سازی دانلود...'}</span>
                    <span className="font-mono">
                      {toPersianDigits(progress?.completed || 0)} از {toPersianDigits(progress?.total || 0)}
                    </span>
                  </div>
                  <div className="w-full bg-[#E2D2BE] h-3 rounded-full overflow-hidden shadow-inset">
                    <div
                      className="bg-[#2E6F40] h-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, Math.round(((progress?.completed || 0) / Math.max(1, progress?.total || 1)) * 100))}%`
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#6E5846] pt-1">
                    <span className="inline-flex items-center gap-1 font-bold">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span>
                        وضعیت Checksum (SHA-256):{' '}
                        {progress?.checksumStatus === 'valid'
                          ? 'تأییدشده و سالم'
                          : progress?.checksumStatus === 'verifying'
                          ? 'در حال راستی‌آزمایی...'
                          : 'در انتظار'}
                      </span>
                    </span>
                    <span className="font-mono">
                      {Math.round(((progress?.completed || 0) / Math.max(1, progress?.total || 1)) * 100)}٪
                    </span>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {!isDownloading ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleStartDownload(0)}
                      className="min-h-[38px] px-4 py-2 rounded-xl bg-[#2E6F40] hover:bg-[#235732] text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Play className="w-4 h-4" />
                      <span>شروع دانلود جدید</span>
                    </button>
                    {hasPausedState && (
                      <button
                        type="button"
                        onClick={() => void handleStartDownload(pausedResumeIndex)}
                        className="min-h-[38px] px-4 py-2 rounded-xl bg-[#1F4E79] hover:bg-[#163a5b] text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>ادامه دانلود قبلی (از تصویر {toPersianDigits(pausedResumeIndex)})</span>
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleStopDownload}
                    className="min-h-[38px] px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Pause className="w-4 h-4" />
                    <span>متوقف کردن موقت دانلود (ذخیره در IndexedDB)</span>
                  </button>
                )}
              </div>
            </div>

            {/* بخش ۲: بارگذاری محلی فایل JSON یا لینک مستقیم */}
            <div className="bg-white border border-[#D8C7B2] rounded-xl p-4 space-y-3">
              <div className="font-bold text-sm text-[#6B3E26] flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-[#6B3E26]" />
                <span>بارگذاری محلی یا اتصال با لینک مستقیم (مناسب سیستم‌های بدون اینترنت)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block font-bold">بارگذاری فایل JSON بسته الحاقی:</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => void handleFileUpload(e)}
                    className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#FAF5EE] file:text-[#6B3E26] hover:file:bg-[#F3E9DC] cursor-pointer"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block font-bold">یا ورود لینک مستقیم فایل بسته الحاقی:</label>
                  <div className="flex gap-1.5">
                    <input
                      type="url"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://..."
                      className="flex-1 min-h-[36px] px-3 py-1.5 rounded-xl border border-[#D8C7B2] text-xs"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      disabled={isImportingUrl}
                      onClick={() => void handleUrlInstall()}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#1F4E79] hover:bg-[#163a5b] text-white font-bold text-xs cursor-pointer disabled:opacity-50"
                    >
                      {isImportingUrl ? 'در حال بارگذاری...' : 'نصب از لینک'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* بخش ۳: ابزارهای پاک‌سازی و پشتیبان‌گیری */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E2D2BE]">
              <button
                type="button"
                onClick={() => void handleExportJson()}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white border border-[#D8C7B2] hover:bg-[#FAF5EE] text-[#6B3E26] font-bold text-xs inline-flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>خروجی گرفتن از پروفایل‌های بسته الحاقی</span>
              </button>

              <button
                type="button"
                onClick={() => void handleClearCache()}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 font-bold text-xs inline-flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>پاک‌سازی کامل کش تصاویر آفلاین</span>
              </button>
            </div>

            {/* راهنمای جامع بسته الحاقی (منتقل شده به پایین پنجره) */}
            <div className="bg-[#FAF5EE] border border-[#D8C7B2] rounded-xl p-3.5 space-y-2 text-[#332218]">
              <div className="font-bold text-xs text-[#6B3E26] flex items-center gap-1.5">
                <Info className="w-4 h-4 text-[#6B3E26] shrink-0" />
                <span>راهنمای جامع بخش مدیریت بسته الحاقی آفلاین شهدا</span>
              </div>
              <div className="text-[11px] text-[#5C4636] space-y-1.5 leading-relaxed">
                <p>
                  <strong>هدف از این بخش:</strong> نرم‌افزار اصلی برای سبکی و نصب سریع فشرده‌سازی شده است. این بخش امکان مدیریت بسته الحاقی تصاویر و اسناد حجیم شهدا (تا ۱ الی ۲ گیگابایت) را به‌صورت کاملاً آفلاین فراهم می‌کند.
                </p>
                <ul className="list-disc list-inside space-y-1 pr-1">
                  <li>
                    <strong>دانلود مستقیم و قابلیت Resume:</strong> با انتخاب محدوده مورد نظر (کتب مرتبط، ۲۰۰۰ شهید اول یا کل شهدا)، تصاویر در حافظه CacheStorage دستگاه ذخیره می‌شوند. اگر اتصال اینترنت قطع شود یا دکمه متوقف کردن را بزنید، پیشرفت کار در IndexedDB ذخیره شده و با کلیک روی «ادامه دانلود» از همان نقطه از سر گرفته می‌شود.
                  </li>
                  <li>
                    <strong>بررسی سلامت فایل (Checksum - SHA-256):</strong> پس از دریافت هر تصویر، کلید رمزنگاری SHA-256 آن محاسبه و راستی‌آزمایی می‌شود تا از عدم خرابی یا نقص داده‌ها اطمینان حاصل گردد.
                  </li>
                  <li>
                    <strong>بارگذاری محلی یا لینک مستقیم:</strong> در صورتی که روی سیستم دیگری بدون اینترنت هستید، می‌توانید فایل JSON بسته الحاقی را از طریق فایل یا لینک اینترنتی وارد کنید.
                  </li>
                  <li>
                    <strong>خروجی پشتیبان و پاک‌سازی:</strong> می‌توانید از پروفایل‌های الحاقی خروجی JSON بگیرید یا در صورت نیاز به آزاد کردن فضای گوشی، کش تصاویر را به‌طور کامل پاک‌سازی کنید.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </ModalWindow>
      )}
    </>
  );
};
