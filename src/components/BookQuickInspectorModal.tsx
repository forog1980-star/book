import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ExternalLink,
  MapPin,
  Pencil,
  Users
} from 'lucide-react';
import { ModalWindow } from './ModalWindow';
import {
  BookCopyRecord,
  BookMartyrLinkRecord,
  FieldAuditRecord,
  LEVELS,
  LevelCode,
  ReferenceCatalogRow,
  SHELVES,
  ShelfCode,
  normalizePersianText,
  toPersianDigits
} from '../data/markazAsnadData';
import { guardExternalInternetSearch } from '../utils/githubSyncService';

interface BookQuickInspectorModalProps {
  bookId?: string;
  fallbackTitle: string;
  fallbackPublisher?: string;
  initialRow?: ReferenceCatalogRow | null;
  catalogRows: ReferenceCatalogRow[];
  auditRecords?: Record<string, FieldAuditRecord>;
  bookCopies?: BookCopyRecord[];
  links?: BookMartyrLinkRecord[];
  onSaveAuditRecord?: (record: FieldAuditRecord) => void;
  onClose: () => void;
  onNotify: (msg: string, type?: 'success' | 'warning') => void;
}

export const BookQuickInspectorModal: React.FC<BookQuickInspectorModalProps> = ({
  bookId,
  fallbackTitle,
  fallbackPublisher,
  initialRow = null,
  catalogRows,
  auditRecords = {},
  bookCopies = [],
  links = [],
  onSaveAuditRecord,
  onClose,
  onNotify
}) => {
  const resolved = useMemo(() => {
    const cleanId = (bookId || initialRow?.tempBookId || '').trim();
    const normFallback = normalizePersianText(fallbackTitle);

    const cat =
      initialRow ||
      (cleanId ? catalogRows.find((c) => c.tempBookId === cleanId) : undefined) ||
      (normFallback
        ? catalogRows.find((c) => normalizePersianText(c.titleRaw) === normFallback)
        : undefined);

    const allAudits = Object.values(auditRecords);
    const aud =
      (cat ? auditRecords[cat.rowKey] : undefined) ||
      (cleanId ? allAudits.find((a) => a.tempBookId === cleanId) : undefined) ||
      (normFallback
        ? allAudits.find((a) => normalizePersianText(a.title) === normFallback)
        : undefined);

    const effectiveId = aud?.tempBookId || cat?.tempBookId || cleanId || '';
    const firstCopy = effectiveId
      ? bookCopies.find((cp) => cp.bookId === effectiveId)
      : undefined;

    const locParts = (cat?.locationRaw || '').split('-');
    const shelfCandidate = (aud?.shelf || firstCopy?.shelf || locParts[0] || 'SH-01') as ShelfCode;
    const levelCandidate = (aud?.level || firstCopy?.level || locParts[1] || 'T01') as LevelCode;

    const title = aud?.title?.trim() || cat?.titleRaw?.trim() || fallbackTitle || '—';
    const author = aud?.author?.trim() || cat?.authorRaw?.trim() || '';
    const publisher =
      aud?.publisher?.trim() || cat?.publisherRaw?.trim() || fallbackPublisher?.trim() || '';
    const year = aud?.year?.trim() || '';
    const category = aud?.category?.trim() || cat?.categoryRaw?.trim() || '';
    const notes = aud?.notes?.trim() || cat?.noteRaw?.trim() || '';
    const description = aud?.descriptionRaw?.trim() || cat?.descriptionRaw?.trim() || '';
    const location =
      aud?.location?.trim() ||
      (aud?.shelf ? `${aud.shelf}-${aud.level || 'T01'}` : '') ||
      cat?.locationRaw ||
      'نامشخص';

    const relatedLinks = links.filter((l) => {
      if (effectiveId && l.tempBookId === effectiveId) return true;
      return normFallback && normalizePersianText(l.bookTitleRaw) === normFallback;
    });

    return {
      cat,
      aud,
      effectiveId,
      title,
      author,
      publisher,
      year,
      category,
      notes,
      description,
      location,
      shelf: SHELVES.some((s) => s.code === shelfCandidate) ? shelfCandidate : ('SH-01' as ShelfCode),
      level: LEVELS.some((l) => l.code === levelCandidate) ? levelCandidate : ('T01' as LevelCode),
      physical: (aud?.physical || 'verified') as 'verified' | 'review' | 'not_found',
      expertApproved: Boolean(aud?.expertApproved),
      relatedLinks
    };
  }, [bookId, fallbackTitle, fallbackPublisher, initialRow, catalogRows, auditRecords, bookCopies, links]);

  const [isEditing, setIsEditing] = useState(false);
  const [formTitle, setFormTitle] = useState(resolved.title);
  const [formAuthor, setFormAuthor] = useState(resolved.author);
  const [formPublisher, setFormPublisher] = useState(resolved.publisher);
  const [formYear, setFormYear] = useState(resolved.year);
  const [formCategory, setFormCategory] = useState(resolved.category);
  const [formShelf, setFormShelf] = useState<ShelfCode>(resolved.shelf);
  const [formLevel, setFormLevel] = useState<LevelCode>(resolved.level);
  const [formStatus, setFormStatus] = useState<'verified' | 'review' | 'not_found'>(resolved.physical);
  const [formExpertApproved, setFormExpertApproved] = useState(resolved.expertApproved);
  const [formNotes, setFormNotes] = useState(resolved.notes);

  const canEditInRepository = Boolean(onSaveAuditRecord && (resolved.cat || resolved.aud || resolved.effectiveId));

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveAuditRecord) return;

    const recordKey =
      resolved.aud?.key ||
      resolved.cat?.rowKey ||
      (resolved.effectiveId ? `outside::${resolved.effectiveId}` : `outside::${Date.now()}`);

    const updatedRecord: FieldAuditRecord = {
      ...(resolved.aud || {}),
      key: recordKey,
      source: resolved.aud?.source || (resolved.cat ? 'catalog' : 'outside-list'),
      sheet: resolved.aud?.sheet || 'فهرست کتاب‌ها',
      tempBookId: resolved.effectiveId || resolved.cat?.tempBookId || '',
      title: formTitle.trim() || resolved.title,
      author: formAuthor.trim(),
      publisher: formPublisher.trim(),
      year: formYear.trim(),
      descriptionRaw: resolved.description,
      category: formCategory.trim(),
      shelf: formShelf,
      level: formLevel,
      location: `${formShelf}-${formLevel}`,
      physical: formStatus,
      countedCopies: resolved.aud?.countedCopies || resolved.cat?.countedCopiesRaw || '1',
      expertApproved: formExpertApproved,
      relatedMartyrs: resolved.aud?.relatedMartyrs,
      excludedMartyrs: resolved.aud?.excludedMartyrs,
      needsReview: formStatus === 'review',
      notes: formNotes.trim(),
      updatedAt: new Date().toISOString()
    };

    onSaveAuditRecord(updatedRecord);
    setIsEditing(false);
    onNotify(`شناسنامه کتاب «${updatedRecord.title}» به‌روزرسانی و در کل نرم‌افزار همگام‌سازی شد.`, 'success');
  };

  return (
    <ModalWindow
      onClose={onClose}
      title={`پرونده و شناسنامه کتاب${resolved.effectiveId ? ` (${resolved.effectiveId})` : ''}`}
      maxWidthClass="max-w-xl"
    >
      <div className="space-y-3 text-xs text-slate-800 leading-relaxed">
        {!isEditing ? (
          <>
            <div className="p-3 bg-[#FAF5EE] rounded-xl space-y-1.5 border border-[#E2D2BE]">
              <div className="flex items-start justify-between gap-2">
                <div className="font-bold text-sm text-[#1F4E79] flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 shrink-0 text-[#8C3B2B]" />
                  <span>{resolved.title}</span>
                </div>
                {resolved.effectiveId && (
                  <span className="font-mono text-[11px] bg-[#1F4E79] text-white px-2 py-0.5 rounded-md shrink-0" dir="ltr">
                    {resolved.effectiveId}
                  </span>
                )}
              </div>
              <div className="text-slate-700">
                <strong>نویسنده / پدیدآور:</strong> {resolved.author || 'ثبت‌نشده'}
              </div>
              <div className="text-slate-700">
                <strong>ناشر:</strong> {resolved.publisher || 'ثبت‌نشده'}
                {resolved.year ? ` · سال نشر: ${toPersianDigits(resolved.year)}` : ''}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#8C3B2B] shrink-0" />
                <div>
                  <span className="font-bold text-slate-600">محل قفسه: </span>
                  <span className="text-slate-900 font-bold" dir="ltr">
                    {resolved.location}
                  </span>
                </div>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#1F4E79] shrink-0" />
                <div>
                  <span className="font-bold text-slate-600">شهدای متصل: </span>
                  <span className="text-slate-900 font-bold">
                    {toPersianDigits(resolved.relatedLinks.length)} مورد
                  </span>
                </div>
              </div>
              {resolved.cat?.isbnRaw && (
                <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-600">شابک: </span>
                  <span className="text-slate-900 font-mono">{resolved.cat.isbnRaw}</span>
                </div>
              )}
              {resolved.cat?.fipaRaw && (
                <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-600">فیپا: </span>
                  <span className="text-slate-900 font-mono">{resolved.cat.fipaRaw}</span>
                </div>
              )}
            </div>

            {resolved.category && (
              <div className="p-2 bg-blue-50/60 rounded-lg border border-blue-100 text-[11px]">
                <span className="font-bold text-blue-950">گروه موضوعی: </span>
                <span className="text-blue-900">{resolved.category}</span>
              </div>
            )}

            {resolved.description && (
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-[11px]">
                <span className="font-bold text-slate-700 block mb-1">توضیحات مرجع کتاب:</span>
                <p className="text-slate-600 leading-relaxed">{resolved.description}</p>
              </div>
            )}

            {resolved.notes && (
              <div className="p-2.5 bg-amber-50/70 rounded-lg border border-amber-200 text-[11px]">
                <span className="font-bold text-amber-900 block mb-0.5">یادداشت کارشناسی:</span>
                <p className="text-amber-950">{resolved.notes}</p>
              </div>
            )}

            {resolved.relatedLinks.length > 0 && (
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <div className="font-bold text-[11px] text-slate-700">
                  فهرست شهدای متصل به این کتاب ({toPersianDigits(resolved.relatedLinks.length)}):
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {resolved.relatedLinks.map((lnk) => (
                    <span
                      key={lnk.id}
                      className="text-[11px] bg-white border border-slate-200 px-2 py-0.5 rounded-lg text-slate-800"
                    >
                      {lnk.martyrNameRaw}
                      {lnk.pageReferenceRaw ? ` (ص ${toPersianDigits(lnk.pageReferenceRaw)})` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200">
              <div className="flex flex-wrap items-center gap-2">
                {canEditInRepository && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="min-h-[38px] px-3 py-1.5 bg-[#1F4E79] hover:bg-[#163a5b] text-white rounded-xl font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>ویرایش درجا مشخصات کتاب</span>
                  </button>
                )}
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(
                    'site:ketab.ir "' + resolved.title + '"'
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    guardExternalInternetSearch(e, 'خانه کتاب (استعلام کتاب)', onNotify);
                  }}
                  className="min-h-[38px] px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl font-semibold inline-flex items-center gap-1 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-emerald-700" />
                  <span>استعلام در خانه کتاب</span>
                </a>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="min-h-[38px] px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold cursor-pointer"
              >
                بستن
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">عنوان کتاب *</label>
              <input
                type="text"
                required
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold text-slate-700 mb-1">نویسنده / پدیدآور</label>
                <input
                  type="text"
                  value={formAuthor}
                  onChange={(e) => setFormAuthor(e.target.value)}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">ناشر</label>
                <input
                  type="text"
                  value={formPublisher}
                  onChange={(e) => setFormPublisher(e.target.value)}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="block font-bold text-slate-700 mb-1">قفسه</label>
                <select
                  value={formShelf}
                  onChange={(e) => setFormShelf(e.target.value as ShelfCode)}
                  className="w-full min-h-[38px] px-2 py-1.5 rounded-xl border border-slate-300 bg-white font-semibold"
                >
                  {SHELVES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.title} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">طبقه</label>
                <select
                  value={formLevel}
                  onChange={(e) => setFormLevel(e.target.value as LevelCode)}
                  className="w-full min-h-[38px] px-2 py-1.5 rounded-xl border border-slate-300 bg-white font-semibold"
                >
                  {LEVELS.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.title} ({l.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">سال نشر</label>
                <input
                  type="text"
                  value={formYear}
                  onChange={(e) => setFormYear(e.target.value)}
                  placeholder="مثلاً ۱۳۹۸"
                  className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">وضعیت فیزیکی</label>
                <select
                  value={formStatus}
                  onChange={(e) =>
                    setFormStatus(e.target.value as 'verified' | 'review' | 'not_found')
                  }
                  className="w-full min-h-[38px] px-2 py-1.5 rounded-xl border border-slate-300 bg-white font-semibold"
                >
                  <option value="verified">تأییدشده در قفسه</option>
                  <option value="review">نیازمند بررسی</option>
                  <option value="not_found">ناموجود / کسری</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">گروه موضوعی</label>
              <input
                type="text"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">یادداشت کارشناس</label>
              <textarea
                rows={2}
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
              <input
                type="checkbox"
                checked={formExpertApproved}
                onChange={(e) => setFormExpertApproved(e.target.checked)}
                className="w-4 h-4 accent-[#2E6F40]"
              />
              <span className="font-bold text-emerald-900">
                تأیید نهایی کارشناس برای این کتاب و مشخصات ثبتی
              </span>
            </label>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="min-h-[40px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer"
              >
                بازگشت به مشاهده
              </button>
              <button
                type="submit"
                className="min-h-[40px] px-4 py-2 bg-[#2E7D5B] hover:bg-[#246348] text-white rounded-xl font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>ذخیره و همگام‌سازی سراسری</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </ModalWindow>
  );
};
