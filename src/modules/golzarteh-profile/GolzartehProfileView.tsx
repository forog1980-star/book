import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  MapPin,
  Plus,
  Save,
  ScrollText,
  Trash2,
  User,
  X,
  ZoomIn
} from 'lucide-react';
import { toPersianDigits } from '../../data/markazAsnadData';
import { guardExternalInternetSearch } from '../../utils/githubSyncService';
import {
  buildBidirectionalGolzartehSyncPackage,
  getGolzartehDatasetState,
  getMatchBasisLabelFa,
  loadGolzartehDataset,
  ResolveMartyrInput,
  resolveComprehensiveMartyrProfile,
  saveMartyrProfileOverride,
  subscribeGolzartehDataset
} from './loader';
import {
  GolzartehPhotoCategory,
  GolzartehPhotoItem,
  ResolvedMartyrComprehensiveProfile
} from './types';

export interface GolzartehProfileBrowseNav {
  currentIndex: number;
  totalCount: number;
  onPrev?: () => void;
  onNext?: () => void;
}

interface GolzartehComprehensiveProfilePanelProps {
  input: ResolveMartyrInput;
  browseNav?: GolzartehProfileBrowseNav;
  onNotify?: (message: string, type?: 'success' | 'warning') => void;
  /** آیا بخش مشخصات کتاب‌های مرتبط و پژوهش مستخرج خارج از این کامپوننت نمایش داده می‌شود (برای جلوگیری از تکرار فهرست کتاب‌ها) */
  renderBottomActionSlot?: React.ReactNode;
}

const PHOTO_CATEGORY_LABELS: Record<GolzartehPhotoCategory, string> = {
  personnel: 'عکس پرسنلی شهید',
  sacred_defense: 'دوران دفاع مقدس و فعالیت‌ها',
  tomb: 'تصویر سنگ مزار شهید'
};

function compressLocalImageToDataUrl(file: File, maxSide = 720): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('خطا در خواندن فایل تصویر'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('فرمت تصویر معتبر نیست'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height, 1));
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result || ''));
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export const GolzartehComprehensiveProfilePanel: React.FC<
  GolzartehComprehensiveProfilePanelProps
> = ({ input, browseNav, onNotify, renderBottomActionSlot }) => {
  const [datasetTick, setDatasetTick] = useState(0);
  const [failedPhotoIds, setFailedPhotoIds] = useState<Record<string, boolean>>({});
  const [lightboxPhoto, setLightboxPhoto] = useState<GolzartehPhotoItem | null>(null);
  const [activePhotoFilter, setActivePhotoFilter] = useState<'all' | GolzartehPhotoCategory>('all');

  // Inline Expert Editors (Biography, Will, Identity dates, Custom Photos)
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [isEditingWill, setIsEditingWill] = useState(false);
  const [willDraft, setWillDraft] = useState('');
  const [isEditingDates, setIsEditingDates] = useState(false);
  const [birthDateDraft, setBirthDateDraft] = useState('');
  const [martyrdomDateDraft, setMartyrdomDateDraft] = useState('');

  const [showAddPhotoBox, setShowAddPhotoBox] = useState(false);
  const [newPhotoCategory, setNewPhotoCategory] = useState<GolzartehPhotoCategory>('personnel');
  const [newPhotoCaption, setNewPhotoCaption] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const unsub = subscribeGolzartehDataset(() => {
      setDatasetTick((prev) => prev + 1);
    });
    const current = getGolzartehDatasetState();
    if (current.status === 'idle') {
      void loadGolzartehDataset();
    }
    return unsub;
  }, []);

  // Reset transient editing panels cleanly when user navigates Prev / Next between martyrs
  useEffect(() => {
    setIsEditingBio(false);
    setIsEditingWill(false);
    setIsEditingDates(false);
    setShowAddPhotoBox(false);
    setFailedPhotoIds({});
    setActivePhotoFilter('all');
    setLightboxPhoto(null);
  }, [input.localKey, input.fullName]);

  const datasetState = getGolzartehDatasetState();

  const profile: ResolvedMartyrComprehensiveProfile = useMemo(
    () => resolveComprehensiveMartyrProfile(input),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      input.localKey,
      input.fullName,
      input.fatherName,
      input.birthDateDisplay,
      input.martyrdomDateDisplay,
      input.ageDisplay,
      input.operation,
      input.martyrdomLocation,
      input.gravePiece,
      input.graveRow,
      input.graveNumber,
      input.extractedItems,
      input.bookLinks,
      datasetTick
    ]
  );

  const photosByCategory = useMemo(() => {
    const filtered =
      activePhotoFilter === 'all'
        ? profile.photos
        : profile.photos.filter((p) => p.category === activePhotoFilter);
    return filtered;
  }, [profile.photos, activePhotoFilter]);

  const photoCounts = useMemo(
    () => ({
      all: profile.photos.length,
      personnel: profile.photos.filter((p) => p.category === 'personnel').length,
      sacred_defense: profile.photos.filter((p) => p.category === 'sacred_defense').length,
      tomb: profile.photos.filter((p) => p.category === 'tomb').length
    }),
    [profile.photos]
  );

  const handleSaveBio = () => {
    saveMartyrProfileOverride({
      key: profile.localKey,
      fullName: profile.fullName,
      fatherName: profile.fatherName,
      customBirthDate: profile.override?.customBirthDate,
      customMartyrdomDate: profile.override?.customMartyrdomDate,
      customBiography: bioDraft.trim() || undefined,
      customWillText: profile.override?.customWillText,
      customPhotos: profile.override?.customPhotos || [],
      pinnedGolzartehId: profile.override?.pinnedGolzartehId,
      verifiedForGolzartehSync: profile.override?.verifiedForGolzartehSync,
      updatedAt: new Date().toISOString()
    });
    setIsEditingBio(false);
    onNotify?.(`زندگینامه شهید «${profile.fullName}» در حافظه سامانه ذخیره شد.`, 'success');
  };

  const handleSaveWill = () => {
    saveMartyrProfileOverride({
      key: profile.localKey,
      fullName: profile.fullName,
      fatherName: profile.fatherName,
      customBirthDate: profile.override?.customBirthDate,
      customMartyrdomDate: profile.override?.customMartyrdomDate,
      customBiography: profile.override?.customBiography,
      customWillText: willDraft.trim() || undefined,
      customPhotos: profile.override?.customPhotos || [],
      pinnedGolzartehId: profile.override?.pinnedGolzartehId,
      verifiedForGolzartehSync: profile.override?.verifiedForGolzartehSync,
      updatedAt: new Date().toISOString()
    });
    setIsEditingWill(false);
    onNotify?.(`متن وصیت‌نامه شهید «${profile.fullName}» ذخیره شد.`, 'success');
  };

  const handleSaveDates = () => {
    saveMartyrProfileOverride({
      key: profile.localKey,
      fullName: profile.fullName,
      fatherName: profile.fatherName,
      customBirthDate: birthDateDraft.trim() || undefined,
      customMartyrdomDate: martyrdomDateDraft.trim() || undefined,
      customBiography: profile.override?.customBiography,
      customWillText: profile.override?.customWillText,
      customPhotos: profile.override?.customPhotos || [],
      pinnedGolzartehId: profile.override?.pinnedGolzartehId,
      verifiedForGolzartehSync: profile.override?.verifiedForGolzartehSync,
      updatedAt: new Date().toISOString()
    });
    setIsEditingDates(false);
    onNotify?.('تاریخ‌های تولد و شهادت در پرونده شهید به‌روزرسانی شد.', 'success');
  };

  const handleUploadCustomPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressLocalImageToDataUrl(file);
      const existingCustom = profile.override?.customPhotos || [];
      const newPhoto: GolzartehPhotoItem = {
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        category: newPhotoCategory,
        url: dataUrl,
        caption:
          newPhotoCaption.trim() ||
          `${PHOTO_CATEGORY_LABELS[newPhotoCategory]} — ${profile.fullName}`,
        source: 'local_upload',
        addedAt: new Date().toISOString()
      };
      saveMartyrProfileOverride({
        key: profile.localKey,
        fullName: profile.fullName,
        fatherName: profile.fatherName,
        customBirthDate: profile.override?.customBirthDate,
        customMartyrdomDate: profile.override?.customMartyrdomDate,
        customBiography: profile.override?.customBiography,
        customWillText: profile.override?.customWillText,
        customPhotos: [...existingCustom, newPhoto],
        pinnedGolzartehId: profile.override?.pinnedGolzartehId,
        verifiedForGolzartehSync: profile.override?.verifiedForGolzartehSync,
        updatedAt: new Date().toISOString()
      });
      setNewPhotoCaption('');
      setShowAddPhotoBox(false);
      onNotify?.('تصویر با موفقیت به گالری پرونده شهید افزوده شد.', 'success');
    } catch {
      onNotify?.('خطا در پردازش یا ذخیره‌سازی تصویر انتخاب‌شده.', 'warning');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveCustomPhoto = (photoId: string) => {
    const existingCustom = profile.override?.customPhotos || [];
    saveMartyrProfileOverride({
      key: profile.localKey,
      fullName: profile.fullName,
      fatherName: profile.fatherName,
      customBirthDate: profile.override?.customBirthDate,
      customMartyrdomDate: profile.override?.customMartyrdomDate,
      customBiography: profile.override?.customBiography,
      customWillText: profile.override?.customWillText,
      customPhotos: existingCustom.filter((p) => p.id !== photoId),
      pinnedGolzartehId: profile.override?.pinnedGolzartehId,
      verifiedForGolzartehSync: profile.override?.verifiedForGolzartehSync,
      updatedAt: new Date().toISOString()
    });
    onNotify?.('تصویر از گالری محلی شهید حذف شد.', 'success');
  };

  const handleExportSingleSyncJson = () => {
    const pkg = buildBidirectionalGolzartehSyncPackage({
      profiles: [profile],
      links: input.bookLinks || [],
      extractedItems: input.extractedItems || [],
      scopeLabel: `پروفایل شهید ${profile.fullName}`
    });
    const blob = new Blob([JSON.stringify(pkg, null, 2)], {
      type: 'application/json;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeFileName = profile.fullName.replace(/\s+/g, '_') || 'martyr_profile';
    a.href = url;
    a.download = `golzarteh_sync_${safeFileName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onNotify?.(
      `فایل استاندارد JSON همگام‌سازی پروفایل شهید «${profile.fullName}» برای سامانه golzarteh.ir صادر شد.`,
      'success'
    );
  };

  return (
    <div className="space-y-4 text-xs text-[#332218]" dir="rtl">
      {/* نوار مرور سریع بین شهدای فهرست جست‌وجو (قبلی / بعدی) */}
      {browseNav && browseNav.totalCount > 1 && (
        <div className="flex items-center justify-between gap-2 bg-[#F6EFE6] border border-[#E2D2BE] rounded-xl px-3 py-2">
          <button
            type="button"
            disabled={!browseNav.onPrev}
            onClick={browseNav.onPrev}
            className="min-h-[32px] px-2.5 py-1 rounded-lg bg-white border border-[#D8C7B2] text-[#6B3E26] font-bold text-[11px] inline-flex items-center gap-1 disabled:opacity-40 cursor-pointer disabled:cursor-default hover:bg-[#FAF5EE]"
          >
            <ChevronRight className="w-3.5 h-3.5" />
            <span>شهید قبلی</span>
          </button>

          <span className="text-[11px] font-bold text-[#6E5846] tabular-nums">
            مرور پروفایل {toPersianDigits(browseNav.currentIndex + 1)} از{' '}
            {toPersianDigits(browseNav.totalCount)}
          </span>

          <button
            type="button"
            disabled={!browseNav.onNext}
            onClick={browseNav.onNext}
            className="min-h-[32px] px-2.5 py-1 rounded-lg bg-white border border-[#D8C7B2] text-[#6B3E26] font-bold text-[11px] inline-flex items-center gap-1 disabled:opacity-40 cursor-pointer disabled:cursor-default hover:bg-[#FAF5EE]"
          >
            <span>شهید بعدی</span>
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* وضعیت اتصال و تطبیق با پورتال رسمی گلزار شهدای تهران (golzarteh.ir) */}
      <div className="bg-[#FAF5EE] border border-[#E2D2BE] rounded-xl p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#6B3E26]/10 text-[#6B3E26] flex items-center justify-center shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-sm text-[#332218] truncate">
                شهید {profile.fullName}
              </div>
              <div className="text-[11px] text-[#6E5846]">
                {profile.golzartehMatch
                  ? getMatchBasisLabelFa(profile.golzartehMatch.matchBasis)
                  : datasetState.status === 'loading'
                  ? 'در حال بررسی تطبیق با سامانه رسمی golzarteh.ir...'
                  : 'تطبیق مستقیم با سامانه golzarteh.ir ثبت نشده است (قابل ویرایش محلی)'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {profile.golzartehMatch && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#EDF6F0] border border-[#B7DFC5] text-[#2E6F40] font-bold text-[10.5px] tabular-nums">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  شناسه golzarteh.ir: {toPersianDigits(profile.golzartehMatch.gid)} (تطابق{' '}
                  {toPersianDigits(profile.golzartehMatch.matchScore)}٪)
                </span>
              </span>
            )}
            {profile.golzartehUrl && (
              <a
                href={profile.golzartehUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  guardExternalInternetSearch(e, 'پورتال رسمی گلزار شهدای تهران (golzarteh.ir)', onNotify);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#1F4E79] hover:bg-[#163A5B] text-white font-bold text-[10.5px] transition-colors"
              >
                <ExternalLink className="w-3 h-3 shrink-0" />
                <span>صفحه شهید در golzarteh.ir</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ۱. مشخصات هویتی، تولد، شهادت و عملیات */}
      <section className="bg-white border border-[#E2D2BE] rounded-xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2 border-b border-[#EFE5D8] pb-2">
          <h4 className="font-bold text-[#6B3E26] text-xs flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" />
            <span>مشخصات فردی، تاریخ تولد و شهادت</span>
          </h4>
          <button
            type="button"
            onClick={() => {
              setBirthDateDraft(profile.birthDateDisplay || '');
              setMartyrdomDateDraft(profile.martyrdomDateDisplay || '');
              setIsEditingDates((prev) => !prev);
            }}
            className="text-[11px] font-bold text-[#1F4E79] hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <Edit3 className="w-3 h-3" />
            <span>{isEditingDates ? 'انصراف' : 'اصلاح تاریخ‌ها'}</span>
          </button>
        </div>

        {isEditingDates && (
          <div className="bg-[#FAF5EE] border border-[#E2D2BE] rounded-lg p-2.5 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-[#6E5846]">تاریخ تولد</span>
                <input
                  type="text"
                  value={birthDateDraft}
                  onChange={(e) => setBirthDateDraft(e.target.value)}
                  placeholder="مثلاً: ۱۶ فروردین ۱۳۴۴"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[#D8C7B2] bg-white text-xs"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-[#6E5846]">تاریخ شهادت</span>
                <input
                  type="text"
                  value={martyrdomDateDraft}
                  onChange={(e) => setMartyrdomDateDraft(e.target.value)}
                  placeholder="مثلاً: ۲۷ دی ۱۳۶۵"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[#D8C7B2] bg-white text-xs"
                />
              </label>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveDates}
                className="px-3 py-1.5 rounded-lg bg-[#2E6F40] hover:bg-[#235632] text-white font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>ذخیره تاریخ‌ها</span>
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div className="bg-[#FAF5EE] rounded-lg p-2 border border-[#EFE5D8]">
            <span className="text-[10.5px] text-[#6E5846] block">نام پدر</span>
            <strong className="text-[#332218] text-xs">{profile.fatherName || '—'}</strong>
          </div>
          <div className="bg-[#FAF5EE] rounded-lg p-2 border border-[#EFE5D8]">
            <span className="text-[10.5px] text-[#6E5846] block">تاریخ تولد</span>
            <strong className="text-[#332218] text-xs tabular-nums">
              {toPersianDigits(profile.birthDateDisplay || '—')}
            </strong>
            {profile.birthPlace && (
              <span className="block text-[10px] text-[#6E5846] mt-0.5">{profile.birthPlace}</span>
            )}
          </div>
          <div className="bg-[#FAF5EE] rounded-lg p-2 border border-[#EFE5D8]">
            <span className="text-[10.5px] text-[#6E5846] block">تاریخ شهادت</span>
            <strong className="text-[#332218] text-xs tabular-nums">
              {toPersianDigits(profile.martyrdomDateDisplay || '—')}
            </strong>
            {profile.martyrdomPlace && (
              <span className="block text-[10px] text-[#6E5846] mt-0.5">
                {profile.martyrdomPlace}
              </span>
            )}
          </div>
          <div className="bg-[#FAF5EE] rounded-lg p-2 border border-[#EFE5D8]">
            <span className="text-[10.5px] text-[#6E5846] block">سن هنگام شهادت</span>
            <strong className="text-[#332218] text-xs tabular-nums">
              {profile.ageDisplay ? `${toPersianDigits(profile.ageDisplay)} سال` : '—'}
            </strong>
          </div>
          <div className="bg-[#FAF5EE] rounded-lg p-2 border border-[#EFE5D8]">
            <span className="text-[10.5px] text-[#6E5846] block">عملیات / مسئولیت</span>
            <strong className="text-[#332218] text-xs">
              {[profile.operation, profile.militaryResponsibility].filter(Boolean).join(' · ') ||
                '—'}
            </strong>
          </div>
          <div className="bg-[#FAF5EE] rounded-lg p-2 border border-[#EFE5D8]">
            <span className="text-[10.5px] text-[#6E5846] block">تحصیلات / شغل</span>
            <strong className="text-[#332218] text-xs">
              {[profile.education, profile.job].filter(Boolean).join(' · ') ||
                profile.deploymentCategory ||
                '—'}
            </strong>
          </div>
        </div>
      </section>

      {/* ۲. اطلاعات محل مزار و مقایسه دو سامانه */}
      <section className="bg-white border border-[#E2D2BE] rounded-xl p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EFE5D8] pb-2">
          <h4 className="font-bold text-[#1F4E79] text-xs flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />
            <span>اطلاعات محل مزار در گلزار شهدای تهران</span>
          </h4>
          {profile.officialGrave?.latitude && profile.officialGrave?.longitude && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${profile.officialGrave.latitude},${profile.officialGrave.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => guardExternalInternetSearch(e, 'نقشه موقعیت مزار شهید', onNotify)}
              className="text-[11px] font-bold text-[#1F4E79] hover:underline inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              <span>مشاهده موقعیت GPS مزار روی نقشه</span>
            </a>
          )}
        </div>

        <div
          className={`grid grid-cols-1 ${
            profile.officialGrave ? 'sm:grid-cols-2' : ''
          } gap-2.5`}
        >
          <div className="bg-[#EDF4FA] border border-[#C6DAEC] rounded-lg p-2.5 space-y-1">
            <span className="text-[10.5px] font-bold text-[#1F4E79] block">
              ثبت در بانک جامع کتابخانه ({profile.localGrave.sourceLabel})
            </span>
            <div className="font-bold text-xs text-[#162B3B] tabular-nums">
              قطعه {toPersianDigits(profile.localGrave.piece)} · ردیف{' '}
              {toPersianDigits(profile.localGrave.row)} · شماره{' '}
              {toPersianDigits(profile.localGrave.number)}
            </div>
          </div>

          {profile.officialGrave && (
            <div className="bg-[#FAF5EE] border border-[#E2D2BE] rounded-lg p-2.5 space-y-1">
              <span className="text-[10.5px] font-bold text-[#6B3E26] block">
                ثبت در سایت رسمی گلزار شهدا (golzarteh.ir)
              </span>
              <div className="font-bold text-xs text-[#332218] tabular-nums">
                قطعه {toPersianDigits(profile.officialGrave.section || '—')} · ردیف{' '}
                {toPersianDigits(profile.officialGrave.row || '—')} · شماره{' '}
                {toPersianDigits(profile.officialGrave.number || '—')}
              </div>
              {profile.golzartehMatch?.uniqueCode && (
                <div className="text-[10.5px] text-[#6E5846] tabular-nums">
                  کد یکتای گلزار: {toPersianDigits(profile.golzartehMatch.uniqueCode)}
                </div>
              )}
            </div>
          )}
        </div>

        {profile.tombMismatch && (
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-2.5 text-[11px] text-amber-900 flex items-start gap-2 leading-relaxed">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span>
              <strong>هشدار مغایرت نشانی مزار:</strong> مختصات قطعه/ردیف/شماره در بانک کتابخانه
              با ثبت رسمی سایت golzarteh.ir تفاوت دارد. این دو پرونده به‌دلیل تطابق دقیق «نام،
              نام خانوادگی و نام پدر» به یکدیگر متصل شده‌اند تا در بازبینی اسناد اصلاح گردند.
            </span>
          </div>
        )}
      </section>

      {/* ۳. زندگینامه مختصر */}
      <section className="bg-white border border-[#E2D2BE] rounded-xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2 border-b border-[#EFE5D8] pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-bold text-[#6B3E26] text-xs flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              <span>زندگینامه مختصر شهید</span>
            </h4>
            {profile.biographySource !== 'none' && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-[#FAF5EE] border border-[#E2D2BE] text-[#6E5846]">
                {profile.biographySource === 'golzarteh.ir'
                  ? 'منبع: سایت رسمی golzarteh.ir'
                  : profile.biographySource === 'library'
                  ? 'منبع: کتاب‌های کتابخانه'
                  : 'ویرایش کارشناس'}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setBioDraft(profile.biography || '');
              setIsEditingBio((prev) => !prev);
            }}
            className="text-[11px] font-bold text-[#1F4E79] hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <Edit3 className="w-3 h-3" />
            <span>{isEditingBio ? 'بستن ویرایش' : profile.biography ? 'ویرایش' : 'افزودن زندگینامه'}</span>
          </button>
        </div>

        {isEditingBio ? (
          <div className="space-y-2">
            <textarea
              rows={5}
              value={bioDraft}
              onChange={(e) => setBioDraft(e.target.value)}
              placeholder="متن زندگینامه مختصر شهید را وارد یا تکمیل کنید..."
              className="w-full p-2.5 rounded-lg border border-[#D8C7B2] bg-[#FAF5EE] text-xs leading-relaxed"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditingBio(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-bold text-[11px] cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleSaveBio}
                className="px-3 py-1.5 rounded-lg bg-[#2E6F40] hover:bg-[#235632] text-white font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>ذخیره زندگینامه</span>
              </button>
            </div>
          </div>
        ) : profile.biography ? (
          <div className="text-xs text-[#332218] leading-7 whitespace-pre-line bg-[#FAF5EE]/60 border border-[#EFE5D8] rounded-lg p-3 max-h-60 overflow-y-auto">
            {profile.biography}
          </div>
        ) : (
          <div className="text-[11px] text-[#6E5846] bg-[#FAF5EE] rounded-lg p-2.5">
            زندگینامه مکتوبی در بسته فعلی برای این شهید ثبت نشده است. می‌توانید متن زندگینامه را
            از روی کتاب‌های کتابخانه یا سایت رسمی گلزار اضافه کنید.
          </div>
        )}
      </section>

      {/* ۴. متن وصیت‌نامه */}
      <section className="bg-white border border-[#E2D2BE] rounded-xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2 border-b border-[#EFE5D8] pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-bold text-[#8C3B2B] text-xs flex items-center gap-1.5">
              <ScrollText className="w-3.5 h-3.5" />
              <span>متن وصیت‌نامه</span>
            </h4>
            {profile.willSource !== 'none' && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-[#FAF5EE] border border-[#E2D2BE] text-[#6E5846]">
                {profile.willSource === 'golzarteh.ir'
                  ? 'منبع: سایت رسمی golzarteh.ir'
                  : profile.willSource === 'library'
                  ? 'منبع: کتاب‌های کتابخانه'
                  : 'ثبت کارشناس'}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setWillDraft(profile.willText || '');
              setIsEditingWill((prev) => !prev);
            }}
            className="text-[11px] font-bold text-[#1F4E79] hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <Edit3 className="w-3 h-3" />
            <span>{isEditingWill ? 'بستن ویرایش' : profile.willText ? 'ویرایش' : 'ثبت وصیت‌نامه'}</span>
          </button>
        </div>

        {isEditingWill ? (
          <div className="space-y-2">
            <textarea
              rows={5}
              value={willDraft}
              onChange={(e) => setWillDraft(e.target.value)}
              placeholder="متن کامل یا فرازهایی از وصیت‌نامه شهید را وارد کنید..."
              className="w-full p-2.5 rounded-lg border border-[#D8C7B2] bg-[#FAF5EE] text-xs leading-relaxed"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditingWill(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-bold text-[11px] cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleSaveWill}
                className="px-3 py-1.5 rounded-lg bg-[#2E6F40] hover:bg-[#235632] text-white font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>ذخیره وصیت‌نامه</span>
              </button>
            </div>
          </div>
        ) : profile.willText ? (
          <div className="text-xs text-[#332218] leading-7 whitespace-pre-line bg-[#FAF3EA] border border-[#E6D5C1] rounded-lg p-3 max-h-64 overflow-y-auto">
            {profile.willText}
          </div>
        ) : (
          <div className="text-[11px] text-[#6E5846] bg-[#FAF5EE] rounded-lg p-2.5">
            وصیت‌نامه‌ای برای این شهید در پایگاه ثبت نشده است.
          </div>
        )}
      </section>

      {/* جایگاه دلخواه والد (مثلاً فهرست کتاب‌های مرتبط) پیش از گالری تصاویر انتهای صفحه */}
      {renderBottomActionSlot}

      {/* ۵. گالری تصاویر در انتهای صفحه ویژه شهید (عکس پرسنلی، دوران دفاع مقدس، و عکس سنگ مزار) */}
      <section className="bg-[#FAF5EE] border border-[#D8C7B2] rounded-xl p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2D2BE] pb-2">
          <h4 className="font-bold text-[#6B3E26] text-xs flex items-center gap-1.5">
            <Camera className="w-4 h-4" />
            <span>
              گالری تصاویر شهید و سنگ مزار ({toPersianDigits(profile.photos.length)} تصویر)
            </span>
          </h4>
          <button
            type="button"
            onClick={() => setShowAddPhotoBox((prev) => !prev)}
            className="min-h-[30px] px-2.5 py-1 rounded-lg bg-white hover:bg-[#F3E9DC] border border-[#D8C7B2] text-[#6B3E26] font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>افزودن تصویر</span>
          </button>
        </div>

        {/* فرم افزودن تصویر محلی (شخصی / دوران دفاع مقدس / سنگ مزار) */}
        {showAddPhotoBox && (
          <div className="bg-white border border-[#D8C7B2] rounded-lg p-3 space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-[#6E5846]">دسته‌بندی تصویر</span>
                <select
                  value={newPhotoCategory}
                  onChange={(e) => setNewPhotoCategory(e.target.value as GolzartehPhotoCategory)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[#D8C7B2] bg-[#FAF5EE] text-xs"
                >
                  <option value="personnel">عکس پرسنلی شهید</option>
                  <option value="sacred_defense">دوران دفاع مقدس و فعالیت‌ها</option>
                  <option value="tomb">تصویر سنگ مزار شهید</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-[#6E5846]">شرح تصویر (اختیاری)</span>
                <input
                  type="text"
                  value={newPhotoCaption}
                  onChange={(e) => setNewPhotoCaption(e.target.value)}
                  placeholder="مثلاً: عملیات کربلای ۵"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[#D8C7B2] bg-[#FAF5EE] text-xs"
                />
              </label>
            </div>
            <div className="flex items-center justify-between gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleUploadCustomPhoto}
                className="text-[11px] text-[#332218]"
              />
              <button
                type="button"
                onClick={() => setShowAddPhotoBox(false)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold cursor-pointer"
              >
                بستن
              </button>
            </div>
          </div>
        )}

        {/* فیلتر دسته‌بندی گالری */}
        {profile.photos.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['all', `همه (${toPersianDigits(photoCounts.all)})`],
                ['personnel', `پرسنلی (${toPersianDigits(photoCounts.personnel)})`],
                ['sacred_defense', `دفاع مقدس (${toPersianDigits(photoCounts.sacred_defense)})`],
                ['tomb', `سنگ مزار (${toPersianDigits(photoCounts.tomb)})`]
              ] as const
            ).map(([cat, label]) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActivePhotoFilter(cat)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                  activePhotoFilter === cat
                    ? 'bg-[#6B3E26] text-white'
                    : 'bg-white border border-[#D8C7B2] text-[#5C4636] hover:bg-[#F3E9DC]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {photosByCategory.length === 0 ? (
          <div className="bg-white border border-dashed border-[#D8C7B2] rounded-lg p-4 text-center text-[11px] text-[#6E5846]">
            تصویری در این بخش ثبت نشده است. می‌توانید با دکمه «افزودن تصویر» عکس پرسنلی، رزمندگی یا
            سنگ مزار را اضافه کنید.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {photosByCategory.map((photo) => {
              const hasFailed = Boolean(failedPhotoIds[photo.id]);
              return (
                <div
                  key={photo.id}
                  className="bg-white border border-[#E2D2BE] rounded-xl overflow-hidden flex flex-col justify-between shadow-xs"
                >
                  <div className="relative bg-[#F6EFE6] aspect-[4/3] flex items-center justify-center overflow-hidden">
                    {!hasFailed ? (
                      <button
                        type="button"
                        onClick={() => setLightboxPhoto(photo)}
                        className="w-full h-full relative group cursor-pointer block"
                        title="بزرگ‌نمایی تصویر"
                      >
                        <img
                          src={photo.url}
                          alt={photo.caption}
                          loading="lazy"
                          onError={() =>
                            setFailedPhotoIds((prev) => ({ ...prev, [photo.id]: true }))
                          }
                          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                        />
                        <span className="absolute bottom-2 left-2 w-7 h-7 rounded-full bg-black/55 text-white flex items-center justify-center opacity-85 group-hover:opacity-100">
                          <ZoomIn className="w-3.5 h-3.5" />
                        </span>
                      </button>
                    ) : (
                      <div className="p-3 text-center space-y-1 text-[#6E5846]">
                        <ImageIcon className="w-6 h-6 mx-auto opacity-60" />
                        <p className="text-[10.5px] leading-snug">
                          تصویر در حالت برخط از سرور golzarteh.ir بارگذاری می‌شود.
                        </p>
                      </div>
                    )}
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/65 text-white text-[10px] font-bold">
                      {PHOTO_CATEGORY_LABELS[photo.category]}
                    </span>
                  </div>

                  <div className="p-2 flex items-center justify-between gap-2 text-[10.5px] border-t border-[#EFE5D8]">
                    <span className="text-[#332218] font-medium line-clamp-2">{photo.caption}</span>
                    {photo.source === 'local_upload' && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomPhoto(photo.id)}
                        className="text-rose-700 hover:bg-rose-50 p-1 rounded shrink-0 cursor-pointer"
                        title="حذف تصویر محلی"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ۶. نوار تبادل و ارسال بسته استاندارد JSON به سایت golzarteh.ir */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#EDF6F0] border border-[#B7DFC5] rounded-xl p-3">
        <div className="text-[11px] text-[#1E4D2B]">
          <strong>آماده انتقال به سایت گلزار شهدای تهران:</strong> خروجی استاندارد JSON شامل
          زندگینامه، وصیت‌نامه، گالری تصاویر و کتب مرتبط برای درج در صفحه این شهید
        </div>
        <button
          type="button"
          onClick={handleExportSingleSyncJson}
          className="min-h-[34px] px-3 py-1.5 rounded-lg bg-[#2E6F40] hover:bg-[#235632] text-white font-bold text-[11px] inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span>خروجی JSON انتقال به golzarteh.ir</span>
        </button>
      </div>

      {/* پنجره بزرگ‌نمایی تصویر (Lightbox) */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-[#D8C7B2]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#FAF5EE] border-b border-[#E2D2BE]">
              <span className="font-bold text-xs text-[#332218]">
                {PHOTO_CATEGORY_LABELS[lightboxPhoto.category]} — {lightboxPhoto.caption}
              </span>
              <button
                type="button"
                onClick={() => setLightboxPhoto(null)}
                className="p-1 rounded-lg hover:bg-[#E2D2BE]/40 text-[#332218] cursor-pointer"
                title="بستن"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-black/95 flex items-center justify-center max-h-[75vh]">
              <img
                src={lightboxPhoto.url}
                alt={lightboxPhoto.caption}
                className="max-h-[75vh] w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
