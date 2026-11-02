import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Search,
  Plus,
  Trash2,
  Download,
  UserCheck,
  Link2,
  ArrowRight,
  Edit3,
  CheckCircle2,
  Sparkles,
  BookOpen,
  RotateCcw,
  ExternalLink,
  Globe
} from 'lucide-react';
import {
  BookMartyrLinkRecord,
  CustomMartyrRecord,
  ExtractedContentItem,
  ReferenceCatalogRow,
  normalizePersianText,
  toPersianDigits
} from '../data/markazAsnadData';

export interface NormalizedDate {
  day: string;
  month: string;
  month_name: string;
  month_valid: boolean;
  year: string;
  rawYear: string;
  validYear: boolean;
  suspiciousYear: boolean;
  display: string;
}

export interface AllMartyrRecord {
  id: string;
  source: 'golzar' | 'outside';
  source_row: number;
  record_type: 'martyr' | 'unknown_martyr' | 'non_martyr';
  record_subtype: 'memorial' | '';
  memorial_name: string;
  first_name: string;
  last_name: string;
  father_name: string;
  gender: string;
  birth_date: NormalizedDate;
  death_date: NormalizedDate;
  age_raw: string;
  age_calculated: number | null;
  age_display: string;
  martyrdom_operation: string;
  martyrdom_category: string;
  martyrdom_location: string;
  grave_piece: string;
  grave_row: string;
  grave_number: string;
  description: string;
  searchable_text: string;
  edited_at?: string;
  edited_fields?: string[];
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند'
];

function cleanText(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/\u200c/g, ' ')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/[ؤ]/g, 'و')
    .replace(/[إأآ]/g, 'ا')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanValue(raw: unknown): string {
  const t = cleanText(raw);
  return t === '?' ? '' : t;
}

function normalizeMonth(raw: unknown) {
  const text = cleanValue(raw);
  if (!text) return { raw: '', number: '', name: '', valid: false };
  const numeric = Number(text);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) {
    return { raw: text, number: String(numeric), name: MONTHS[numeric - 1], valid: true };
  }
  const idx = MONTHS.findIndex((m) => cleanText(m) === text);
  if (idx >= 0) {
    return { raw: text, number: String(idx + 1), name: MONTHS[idx], valid: true };
  }
  return { raw: text, number: text, name: text, valid: false };
}

function normalizeYear(raw: unknown) {
  const text = cleanValue(raw);
  if (!text) return { raw: '', normalized: '', valid: false, suspicious: false };
  if (/^\d{2}$/.test(text)) {
    return { raw: text, normalized: `13${text}`, valid: true, suspicious: false };
  }
  if (/^\d{4}$/.test(text)) {
    return { raw: text, normalized: text, valid: true, suspicious: false };
  }
  return { raw: text, normalized: text, valid: false, suspicious: true };
}

function normalizeDate(day: unknown, month: unknown, year: unknown): NormalizedDate {
  const d = cleanValue(day);
  const m = normalizeMonth(month);
  const y = normalizeYear(year);
  return {
    day: d,
    month: m.number,
    month_name: m.name,
    month_valid: m.valid,
    year: y.normalized,
    rawYear: y.raw,
    validYear: y.valid,
    suspiciousYear: y.suspicious,
    display: [d, m.name || m.number, y.normalized].filter(Boolean).join(' / ')
  };
}

function detectType(first: string, last: string, source: 'golzar' | 'outside'): AllMartyrRecord['record_type'] {
  const allText = `${first} ${last}`.replace(/\s+/g, ' ').trim();
  if (/شهید\s*گمنام/.test(allText)) return 'unknown_martyr';
  if (/^اموات$/.test(first) || /^اموات$/.test(allText) || (source === 'golzar' && first === 'اموات')) {
    return 'non_martyr';
  }
  return 'martyr';
}

function getMemorialName(first: string, last: string): string {
  const phrase = /شهید\s*گمنام/;
  if (!phrase.test(`${first} ${last}`)) return '';
  const firstOnly = first.replace(/\(\s*شهید\s*گمنام\s*\)/g, '').replace(/شهید\s*گمنام/g, '').trim();
  if (firstOnly) return firstOnly;
  if (phrase.test(first) && first.replace(phrase, '').trim() === '' && last) return last;
  return '';
}

function buildRecord(
  raw: Record<string, unknown>,
  source: 'golzar' | 'outside',
  sourceRow: number
): AllMartyrRecord {
  const first_name = cleanValue(raw.first_name);
  const last_name = cleanValue(raw.last_name);
  const father_name = cleanValue(raw.father_name);
  const gender = cleanValue(raw.gender);
  const birth_date = normalizeDate(raw.birth_day, raw.birth_month, raw.birth_year);
  const death_date = normalizeDate(raw.death_day, raw.death_month, raw.death_year);

  const bY = Number(birth_date.year);
  const dY = Number(death_date.year);
  const calcAge = Number.isInteger(bY) && Number.isInteger(dY) ? dY - bY : null;
  const age_calculated = calcAge !== null && calcAge >= 0 && calcAge <= 120 ? calcAge : null;
  const age_raw = cleanValue(raw.age);
  const age_display = age_calculated !== null ? String(age_calculated) : age_raw;

  const record_type = detectType(first_name, last_name, source);
  const mem = record_type === 'unknown_martyr' ? getMemorialName(first_name, last_name) : '';
  const record_subtype: 'memorial' | '' = mem ? 'memorial' : '';

  const martyrdom_operation = cleanValue(raw.martyrdom_operation);
  const martyrdom_category = cleanValue(raw.martyrdom_category);
  const martyrdom_location = cleanValue(raw.martyrdom_location);
  const grave_piece = cleanValue(raw.grave_piece);
  const grave_row = cleanValue(raw.grave_row);
  const grave_number = cleanValue(raw.grave_number);
  const description = cleanValue(raw.description);

  const searchable_text = [
    first_name,
    last_name,
    mem,
    father_name,
    gender,
    birth_date.day,
    birth_date.month,
    birth_date.month_name,
    birth_date.year,
    death_date.day,
    death_date.month,
    death_date.month_name,
    death_date.year,
    age_display,
    martyrdom_operation,
    martyrdom_category,
    martyrdom_location,
    grave_piece,
    grave_row,
    grave_number,
    record_type === 'unknown_martyr' ? 'شهید گمنام' : '',
    record_subtype === 'memorial' ? 'مزار یادبود' : '',
    record_type === 'non_martyr' ? 'اموات غیرشهید' : ''
  ]
    .filter(Boolean)
    .join(' ');

  return {
    id: `${source}:${sourceRow}`,
    source,
    source_row: sourceRow,
    record_type,
    record_subtype,
    memorial_name: mem,
    first_name,
    last_name,
    father_name,
    gender,
    birth_date,
    death_date,
    age_raw,
    age_calculated,
    age_display,
    martyrdom_operation,
    martyrdom_category,
    martyrdom_location,
    grave_piece,
    grave_row,
    grave_number,
    description,
    searchable_text
  };
}

const SEARCH_FIELDS: Record<string, string> = {
  first_name: 'نام',
  last_name: 'نام خانوادگی',
  father_name: 'نام پدر',
  gender: 'جنسیت',
  birth_day: 'روز تولد',
  birth_month: 'ماه تولد',
  birth_year: 'سال تولد',
  death_day: 'روز شهادت',
  death_month: 'ماه شهادت',
  death_year: 'سال شهادت',
  age: 'سن',
  martyrdom_operation: 'عملیات',
  martyrdom_category: 'دسته‌بندی شهادت',
  martyrdom_location: 'منطقه / محل شهادت',
  grave_piece: 'قطعه مزار',
  grave_row: 'ردیف مزار',
  grave_number: 'شماره مزار'
};

const PIECE_OPTIONS = [
  { value: '', label: 'همه قطعات' },
  { value: '17', label: 'قطعه ۱۷' },
  { value: '21', label: 'قطعه ۲۱' },
  { value: '24', label: 'قطعه ۲۴' },
  { value: '26', label: 'قطعه ۲۶' },
  { value: '27', label: 'قطعه ۲۷' },
  { value: '28', label: 'قطعه ۲۸' },
  { value: '29', label: 'قطعه ۲۹' },
  { value: '40', label: 'قطعه ۴۰' },
  { value: '44', label: 'قطعه ۴۴' },
  { value: '53', label: 'قطعه ۵۳' },
  { value: 'outside', label: 'قطعات عمومی بهشت زهرا' }
];

interface AllMartyrsDatabaseTabProps {
  catalogRows: ReferenceCatalogRow[];
  links?: BookMartyrLinkRecord[];
  extractedItems?: ExtractedContentItem[];
  customMartyrs?: CustomMartyrRecord[];
  onAddCustomMartyr?: (newMartyr: CustomMartyrRecord) => void;
  onUpdateCustomMartyr?: (updated: CustomMartyrRecord) => void;
  onDeleteCustomMartyr?: (martyrId: string) => void;
  onNavigateToSmartSearch?: (martyrName: string) => void;
  onLinkMartyrToBook: (newLink: BookMartyrLinkRecord) => void;
  onNotify: (msg: string, type?: 'success' | 'warning') => void;
}

export const AllMartyrsDatabaseTab: React.FC<AllMartyrsDatabaseTabProps> = ({
  catalogRows,
  links = [],
  extractedItems = [],
  customMartyrs = [],
  onAddCustomMartyr,
  onUpdateCustomMartyr,
  onDeleteCustomMartyr,
  onNavigateToSmartSearch,
  onLinkMartyrToBook,
  onNotify
}) => {
  const [records, setRecords] = useState<AllMartyrRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [counts, setCounts] = useState({ golzar: 0, outside: 0, total: 0, pureMartyrs: 0 });

  // Search State
  const [queryText, setQueryText] = useState('');
  const [selectedField, setSelectedField] = useState('all');
  const [extraFilters, setExtraFilters] = useState<{ id: string; key: string; val: string }[]>([]);
  const [activeResults, setActiveResults] = useState<AllMartyrRecord[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Custom Martyr Verification & Deletion State
  const [editingCustomMartyr, setEditingCustomMartyr] = useState<CustomMartyrRecord | null>(null);
  const [deletingCustomMartyr, setDeletingCustomMartyr] = useState<CustomMartyrRecord | null>(null);

  // New Custom Martyr Registration Modal (Section 7.3)
  const [showNewMartyrModal, setShowNewMartyrModal] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newAltNames, setNewAltNames] = useState('');
  const [newExtId, setNewExtId] = useState('');
  const [newIdentityStatus, setNewIdentityStatus] =
    useState<CustomMartyrRecord['identityVerificationStatus']>('تأییدشده');
  const [newInfoSource, setNewInfoSource] = useState('ثبت کارشناس مرکز اسناد');
  const [newPiece, setNewPiece] = useState('');
  const [newRow, setNewRow] = useState('');
  const [newGraveNum, setNewGraveNum] = useState('');
  const [newGraveSource, setNewGraveSource] = useState('بررسی میدانی قطعه / شیت آدرس مزار');
  const [newGraveStatus, setNewGraveStatus] =
    useState<CustomMartyrRecord['graveVerificationStatus']>('تأییدشده میدانی/سند');
  const [newDescription, setNewDescription] = useState('');

  // Detail & Link Modal State
  const [inspectedRecord, setInspectedRecord] = useState<AllMartyrRecord | null>(null);
  const [linkingRecord, setLinkingRecord] = useState<AllMartyrRecord | null>(null);
  const [selectedBookForLink, setSelectedBookForLink] = useState<string>(
    catalogRows[0]?.tempBookId || 'BK-0001'
  );
  const [linkPageRef, setLinkPageRef] = useState('');
  const [linkNote, setLinkNote] = useState('');

  // Load 28,368 records from /data/golzar_martyrs.xlsx on mount
  useEffect(() => {
    let cancelled = false;
    async function loadAllMartyrs() {
      try {
        setLoading(true);
        const res = await fetch('./data/golzar_martyrs.xlsx');
        if (!res.ok) throw new Error(`خطا در دریافت بانک شهدا (${res.status})`);
        const buf = await res.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array', cellDates: false });

        const golzarRows = wb.Sheets['golzar_martyrs']
          ? XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['golzar_martyrs'], {
              defval: ''
            })
          : [];
        const outsideRows = wb.Sheets['outside_golzar_martyrs']
          ? XLSX.utils.sheet_to_json<Record<string, unknown>>(
              wb.Sheets['outside_golzar_martyrs'],
              { defval: '' }
            )
          : [];

        const all: AllMartyrRecord[] = [];
        let pureMartyrs = 0;

        golzarRows.forEach((r, i) => {
          const rec = buildRecord(
            {
              first_name: r['نام'],
              last_name: r['نام خانوادگی'],
              father_name: r['نام پدر'],
              gender: r['جنسیت'],
              birth_day: r['روز ولادت'],
              birth_month: r['ماه ولادت'],
              birth_year: r['سال ولادت'],
              death_day: r['روز شهادت'],
              death_month: r['ماه شهادت'],
              death_year: r['سال شهادت'],
              age: r['سن'],
              martyrdom_operation: r['عملیات'],
              martyrdom_category: r['دسته بندی شهادت'],
              martyrdom_location: r['منطقه شهادت'],
              grave_piece: r['قطعه مزار'],
              grave_row: r['ردیف مزار'],
              grave_number: r['شماره مزار'],
              description: ''
            },
            'golzar',
            i + 2
          );
          if (rec.record_type !== 'non_martyr') pureMartyrs++;
          all.push(rec);
        });

        outsideRows.forEach((r, i) => {
          const rec = buildRecord(
            {
              first_name: r['نام'],
              last_name: r['نام خانوادگی'],
              father_name: r['نام پدر'],
              gender: '',
              birth_day: r['روز تولد'],
              birth_month: r['ماه تولد'],
              birth_year: r['سال تولد'],
              death_day: r['روز شهادت'],
              death_month: r['ماه شهادت'],
              death_year: r['سال شهادت'],
              age: '',
              martyrdom_operation: '',
              martyrdom_category: r['دسته بندی شهادت'],
              martyrdom_location: r['محل شهادت'],
              grave_piece: r['قطعه مزار'],
              grave_row: r['ردیف مزار'],
              grave_number: r['شماره مزار'],
              description: r['توضیحات']
            },
            'outside',
            i + 2
          );
          if (rec.record_type !== 'non_martyr') pureMartyrs++;
          all.push(rec);
        });

        if (!cancelled) {
          setRecords(all);
          setCounts({
            golzar: golzarRows.length,
            outside: outsideRows.length,
            total: all.length,
            pureMartyrs
          });
          setActiveResults([]);
          setHasSearched(false);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'خطا در بارگذاری فایل اکسل شهدا');
          setLoading(false);
        }
      }
    }
    loadAllMartyrs();
    return () => {
      cancelled = true;
    };
  }, []);

  const getFieldValue = (rec: AllMartyrRecord, field: string): string => {
    switch (field) {
      case 'birth_day':
        return rec.birth_date.day;
      case 'birth_month':
        return rec.birth_date.month;
      case 'birth_year':
        return rec.birth_date.year;
      case 'death_day':
        return rec.death_date.day;
      case 'death_month':
        return rec.death_date.month;
      case 'death_year':
        return rec.death_date.year;
      case 'age':
        return rec.age_display;
      default:
        return String((rec as unknown as Record<string, unknown>)[field] || '');
    }
  };

  const matchesField = (rec: AllMartyrRecord, field: string, qRaw: string): boolean => {
    const q = cleanText(qRaw);
    if (!q) return true;
    if (field === 'birth_month' || field === 'death_month') {
      const mObj = field === 'birth_month' ? rec.birth_date : rec.death_date;
      const mNum = Number(mObj.month);
      if (Number.isInteger(mNum) && mNum >= 1 && mNum <= 12) {
        return q === String(mNum) || q === cleanText(MONTHS[mNum - 1]);
      }
    }
    return cleanText(getFieldValue(rec, field)).includes(q);
  };

  const executeSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!records.length) return;

    const q = cleanText(queryText);
    let res = records;

    if (q) {
      if (selectedField === 'all') {
        const words = q.split(/\s+/).filter(Boolean);
        res = res.filter((r) => words.every((w) => r.searchable_text.includes(w)));
      } else {
        res = res.filter((r) => matchesField(r, selectedField, q));
      }
    }

    for (const f of extraFilters) {
      if (!f.val) continue;
      if (f.key === 'grave_piece') {
        if (f.val === 'outside') {
          res = res.filter((r) => r.source === 'outside');
        } else {
          res = res.filter((r) => cleanText(r.grave_piece) === cleanText(f.val));
        }
      } else {
        res = res.filter((r) => matchesField(r, f.key, f.val));
      }
    }

    setHasSearched(true);
    setActiveResults(res);
  };

  const handleResetSearch = () => {
    setQueryText('');
    setSelectedField('all');
    setExtraFilters([]);
    setActiveResults([]);
    setHasSearched(false);
  };

  // Export Search Results to Excel
  const handleExportResultsExcel = () => {
    if (!activeResults.length) return;
    const exportDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());

    const rows = activeResults.map((r) => ({
      نام: r.first_name,
      'نام خانوادگی': r.last_name,
      'نام پدر': r.father_name,
      جنسیت: r.gender,
      'روز تولد': r.birth_date.day,
      'ماه تولد': r.birth_date.month_name || r.birth_date.month,
      'سال تولد': r.birth_date.year,
      'روز شهادت': r.death_date.day,
      'ماه شهادت': r.death_date.month_name || r.death_date.month,
      'سال شهادت': r.death_date.year,
      سن: r.age_display,
      عملیات: r.martyrdom_operation,
      'دسته‌بندی شهادت': r.martyrdom_category,
      'منطقه / محل شهادت': r.martyrdom_location,
      'قطعه مزار': r.grave_piece,
      'ردیف مزار': r.grave_row,
      'شماره مزار': r.grave_number,
      منبع: r.source === 'outside' ? 'قطعات عمومی بهشت زهرا' : 'گلزار',
      'تاریخ خروجی': exportDate
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'نتایج جستجو');
    XLSX.writeFile(wb, `جستجوی-کل-شهدا-${exportDate.replace(/\//g, '-')}.xlsx`);
    onNotify(`خروجی اکسل شامل ${toPersianDigits(activeResults.length)} رکورد دانلود شد.`);
  };

  const handleSaveMartyrBookLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkingRecord) return;
    const bookObj = catalogRows.find((b) => b.tempBookId === selectedBookForLink);
    const fullName =
      [linkingRecord.first_name, linkingRecord.last_name].filter(Boolean).join(' ') ||
      linkingRecord.memorial_name ||
      'شهید گمنام';

    const newLink: BookMartyrLinkRecord = {
      id: `LNK-${Date.now()}`,
      tempBookId: selectedBookForLink,
      bookTitleRaw: bookObj?.titleRaw || selectedBookForLink,
      publisherRaw: bookObj?.publisherRaw || '',
      martyrNameRaw: fullName,
      isGroupPhrase: false,
      gravePieceRaw: linkingRecord.grave_piece || (linkingRecord.source === 'outside' ? 'قطعات عمومی' : ''),
      graveRowRaw: linkingRecord.grave_row,
      graveNumberRaw: linkingRecord.grave_number,
      pageReferenceRaw: linkPageRef.trim() || 'ثبت‌نشده',
      sourceDescriptionRaw: `متصل‌شده از بانک کل شهدای گلزار (ردیف منبع: ${linkingRecord.source_row} · نام پدر: ${linkingRecord.father_name || '—'})`,
      sourceFile: 'golzar_martyrs.xlsx',
      sourceSheet: linkingRecord.source === 'outside' ? 'outside_golzar_martyrs' : 'golzar_martyrs',
      sourceExcelRow: String(linkingRecord.source_row),
      reviewStatus: 'تأییدشده کارشناسی',
      reviewerNote: linkNote.trim()
    };

    onLinkMartyrToBook(newLink);
    onNotify(`شهید «${fullName}» با مختصات مزار به کتاب «${newLink.bookTitleRaw}» متصل شد.`);
    setLinkingRecord(null);
    setLinkPageRef('');
    setLinkNote('');
  };

  const shownSlice = useMemo(() => activeResults.slice(0, 120), [activeResults]);

  return (
    <div className="space-y-4">
      {/* Top Statistics Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-titr text-lg sm:text-xl font-bold text-slate-900">
              پرونده شهدا، نشانی مزار و ارتباط با کتاب‌ها
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNewMartyrModal(true)}
              className="min-h-[38px] px-3.5 py-2 rounded-xl bg-[#1F4E79] hover:bg-[#163a5b] text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>ثبت پرونده شهید جدید (MR-xxxxxx)</span>
            </button>

            {!loading && !loadError && (
              <div className="bg-amber-50 border border-amber-200 text-amber-950 px-3.5 py-2 rounded-xl text-xs font-bold">
                آماده جست‌وجو: {toPersianDigits((counts.total + customMartyrs.length).toLocaleString('en-US'))} رکورد (
                {toPersianDigits(counts.golzar.toLocaleString('en-US'))} گلزار +{' '}
                {toPersianDigits(counts.outside.toLocaleString('en-US'))} قطعات عمومی
                {customMartyrs.length > 0 ? ` + ${toPersianDigits(customMartyrs.length)} ثبت جدید` : ''})
              </div>
            )}
          </div>
        </div>

        {/* Custom Registered Martyrs List (if any) */}
        {customMartyrs.length > 0 && (
          <div className="bg-[#EAF1F7]/70 border border-[#1F4E79]/20 rounded-2xl p-3.5 sm:p-4 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-bold text-[#1F4E79] text-sm flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-[#1F4E79]" />
                <span>پرونده‌های مستقل ثبت‌شده در این دستگاه ({toPersianDigits(customMartyrs.length)} پرونده)</span>
              </div>
              <span className="text-[11px] text-[#697586]">
                این پرونده‌ها در حافظه پایگاه داده book گوشی/مرورگر شما ذخیره شده و آماده صحت‌سنجی، پیوند یا صدور هستند.
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {customMartyrs.map((cm) => {
                const isIdentVerified = cm.identityVerificationStatus === 'تأییدشده';
                const isGraveVerified = cm.graveVerificationStatus === 'تأییدشده میدانی/سند';

                return (
                  <div
                    key={cm.martyrId}
                    className="bg-white border border-slate-200 hover:border-[#1F4E79]/40 rounded-xl p-3 shadow-xs space-y-2.5 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="font-mono font-bold text-xs bg-[#1F4E79]/10 text-[#1F4E79] px-2 py-0.5 rounded-md"
                            dir="ltr"
                          >
                            {cm.martyrId}
                          </span>
                          <strong className="text-sm font-bold text-[#253247] truncate">
                            {cm.fullName}
                          </strong>
                        </div>
                        {cm.alternativeNames && cm.alternativeNames.length > 0 && (
                          <div className="text-[11px] text-slate-500 truncate">
                            اشکال دیگر: {cm.alternativeNames.join(' ، ')}
                          </div>
                        )}
                      </div>

                      {/* Status Badges */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${
                            isIdentVerified
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : cm.identityVerificationStatus === 'ردشده / غیرمعتبر'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          هویت: {cm.identityVerificationStatus}
                        </span>
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${
                            isGraveVerified
                              ? 'bg-teal-50 text-teal-700 border-teal-200'
                              : 'bg-slate-50 text-slate-600 border-slate-200'
                          }`}
                        >
                          مزار: {cm.graveVerificationStatus}
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] text-[#485367] bg-slate-50 p-2 rounded-lg space-y-1 border border-slate-100">
                      <div>
                        <strong className="text-slate-700">نشانی مزار: </strong>
                        <span>{cm.graveDisplayAddress || 'فاقد نشانی دقیق'}</span>
                      </div>
                      {cm.description && (
                        <div className="line-clamp-2 text-slate-600">
                          <strong className="text-slate-700">توضیحات: </strong>
                          <span>{cm.description}</span>
                        </div>
                      )}
                      {cm.informationSource && (
                        <div className="text-[10px] text-slate-500">
                          منبع داده: {cm.informationSource} {cm.createdAt ? `· ثبت: ${cm.createdAt}` : ''}
                        </div>
                      )}
                    </div>

                    {/* Action Buttons Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-slate-100">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Quick Approve Button */}
                        {(!isIdentVerified || !isGraveVerified) && onUpdateCustomMartyr && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated: CustomMartyrRecord = {
                                ...cm,
                                identityVerificationStatus: 'تأییدشده',
                                graveVerificationStatus: 'تأییدشده میدانی/سند'
                              };
                              onUpdateCustomMartyr(updated);
                              onNotify(`پرونده شهید «${cm.fullName}» (${cm.martyrId}) به وضعیت تأییدشده تغییر یافت.`, 'success');
                            }}
                            title="تأیید سریع هویت و مزار شهید"
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>تأیید پرونده</span>
                          </button>
                        )}

                        {/* Edit & Verification Modal Button */}
                        {onUpdateCustomMartyr && (
                          <button
                            type="button"
                            onClick={() => setEditingCustomMartyr(cm)}
                            title="ویرایش مشخصات و تعیین وضعیت صحت‌سنجی"
                            className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1F4E79] border border-blue-200 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-[#1F4E79]" />
                            <span>ویرایش و صحت‌سنجی</span>
                          </button>
                        )}

                        {/* Smart Book Search Button */}
                        {onNavigateToSmartSearch && (
                          <button
                            type="button"
                            onClick={() => onNavigateToSmartSearch(cm.fullName)}
                            title="کاوش هوشمند کتاب‌های مرتبط با این شهید"
                            className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                            <span>جست‌وجوی کتاب</span>
                          </button>
                        )}
                      </div>

                      {/* Delete Custom Martyr Button */}
                      {onDeleteCustomMartyr && (
                        <button
                          type="button"
                          onClick={() => setDeletingCustomMartyr(cm)}
                          title="حذف این پرونده مستقل از حافظه دستگاه"
                          className="px-2 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          <span>حذف</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Search Form (Supports Enter Key) */}
        <form onSubmit={executeSearch} className="space-y-3 pt-2 border-t border-slate-100">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
            <div className="md:col-span-7 relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    executeSearch();
                  }
                }}
                placeholder="نام، نام خانوادگی، نام پدر، عملیات، قطعه، ردیف یا شماره مزار (با کلید Enter)..."
                className="w-full min-h-[46px] pr-10 pl-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-[#1f4e79]"
              />
            </div>

            <div className="md:col-span-3">
              <select
                value={selectedField}
                onChange={(e) => setSelectedField(e.target.value)}
                className="w-full min-h-[46px] px-3 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-xl font-medium text-slate-800"
              >
                <option value="all">جست‌وجو در همه فیلدها</option>
                {Object.entries(SEARCH_FIELDS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2 flex items-center gap-1.5">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 min-h-[46px] bg-[#1f4e79] hover:bg-[#163a5b] text-white font-bold text-sm rounded-xl transition-colors cursor-pointer"
              >
                جست‌وجو ↵
              </button>
              {(queryText || selectedField !== 'all' || extraFilters.length > 0 || hasSearched) && (
                <button
                  type="button"
                  onClick={handleResetSearch}
                  title="پاک‌سازی فرم و نتایج جست‌وجو"
                  className="min-h-[46px] px-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer inline-flex items-center justify-center shrink-0"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Combined Exact Filters */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-xs">
                <strong className="text-slate-800">فیلترهای ترکیبی دقیق</strong>
                <span className="text-slate-500 mr-2">
                  (محدودسازی بر اساس قطعه، ماه شهادت، عملیات و غیره)
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  setExtraFilters((prev) => [
                    ...prev,
                    { id: `flt-${Date.now()}`, key: 'grave_piece', val: '' }
                  ])
                }
                className="min-h-[36px] px-3 py-1 bg-white border border-slate-300 hover:bg-slate-100 text-xs font-bold text-[#1f4e79] rounded-lg inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>افزودن شرط</span>
              </button>
            </div>

            {extraFilters.map((flt) => (
              <div key={flt.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                <select
                  value={flt.key}
                  onChange={(e) =>
                    setExtraFilters((prev) =>
                      prev.map((item) =>
                        item.id === flt.id ? { ...item, key: e.target.value, val: '' } : item
                      )
                    )
                  }
                  className="sm:col-span-4 min-h-[40px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                >
                  {Object.entries(SEARCH_FIELDS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>

                <div className="sm:col-span-6">
                  {flt.key === 'grave_piece' ? (
                    <select
                      value={flt.val}
                      onChange={(e) =>
                        setExtraFilters((prev) =>
                          prev.map((item) =>
                            item.id === flt.id ? { ...item, val: e.target.value } : item
                          )
                        )
                      }
                      className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    >
                      {PIECE_OPTIONS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  ) : flt.key === 'birth_month' || flt.key === 'death_month' ? (
                    <select
                      value={flt.val}
                      onChange={(e) =>
                        setExtraFilters((prev) =>
                          prev.map((item) =>
                            item.id === flt.id ? { ...item, val: e.target.value } : item
                          )
                        )
                      }
                      className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    >
                      <option value="">انتخاب ماه...</option>
                      {MONTHS.map((m, idx) => (
                        <option key={m} value={String(idx + 1)}>
                          {m}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={flt.val}
                      onChange={(e) =>
                        setExtraFilters((prev) =>
                          prev.map((item) =>
                            item.id === flt.id ? { ...item, val: e.target.value } : item
                          )
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          executeSearch();
                        }
                      }}
                      placeholder="مقدار شرط (Enter برای جست‌وجو)..."
                      className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  )}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setExtraFilters((prev) => prev.filter((item) => item.id !== flt.id))
                  }
                  className="sm:col-span-2 min-h-[40px] px-2.5 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg text-xs font-semibold flex items-center justify-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف</span>
                </button>
              </div>
            ))}
          </div>
        </form>
      </div>

      {/* Loading or Error State */}
      {loading && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-600">
          در حال بارگذاری ۲۸٬۳۶۸ رکورد شهدای گلزار شهدای تهران...
        </div>
      )}

      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-xs text-red-800">
          {loadError}
        </div>
      )}

      {/* Link Martyr to Library Book Modal */}
      {linkingRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-sm sm:text-base text-slate-900">
                اتصال شهید به کتاب در کتابخانه مرکز اسناد
              </h3>
              <button
                type="button"
                onClick={() => setLinkingRecord(null)}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                بستن
              </button>
            </div>

            <div className="bg-[#edf4fa] rounded-xl p-3 text-xs space-y-1">
              <div className="font-bold text-sm text-[#1f4e79]">
                {[linkingRecord.first_name, linkingRecord.last_name].filter(Boolean).join(' ') ||
                  'شهید گمنام'}
              </div>
              <div>
                نام پدر: {linkingRecord.father_name || '—'} · قطعه{' '}
                {toPersianDigits(linkingRecord.grave_piece || 'عمومی')} · ردیف{' '}
                {toPersianDigits(linkingRecord.grave_row || '—')} · شماره{' '}
                {toPersianDigits(linkingRecord.grave_number || '—')}
              </div>
            </div>

            <form onSubmit={handleSaveMartyrBookLink} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  انتخاب کتاب از فهرست کتابخانه:
                </label>
                <select
                  value={selectedBookForLink}
                  onChange={(e) => setSelectedBookForLink(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-300 rounded-xl"
                >
                  {catalogRows.map((b) => (
                    <option key={b.rowKey} value={b.tempBookId}>
                      {b.tempBookId} — {b.titleRaw} ({b.publisherRaw})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  شماره صفحه یا بازه صفحات در کتاب (عین منبع):
                </label>
                <input
                  type="text"
                  value={linkPageRef}
                  onChange={(e) => setLinkPageRef(e.target.value)}
                  placeholder="مثال: ص 114 تا 120 یا کل کتاب"
                  className="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  یادداشت کارشناس / نوع مطلب (خاطره، وصیت‌نامه، زندگی‌نامه):
                </label>
                <input
                  type="text"
                  value={linkNote}
                  onChange={(e) => setLinkNote(e.target.value)}
                  placeholder="توضیح کوتاه..."
                  className="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-300 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setLinkingRecord(null)}
                  className="min-h-[40px] px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-semibold"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] px-5 py-2 bg-[#1f4e79] text-white rounded-xl font-bold inline-flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>ثبت پیوند کتاب و شهید</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* پیام راهنما پیش از جست‌وجو (به جای نمایش پیش‌فرض ۶۰ مورد) */}
      {!loading && !loadError && !hasSearched && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 sm:p-12 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 mx-auto rounded-full bg-[#EAF1F7] text-[#1F4E79] flex items-center justify-center">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-800 text-sm sm:text-base">
            بانک جامع مزارات و پرونده شهدای تهران آماده است
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            برای مشاهده اطلاعات شهید، نام، نام خانوادگی، نام پدر یا شماره قطعه (مانند ۲۴، ۱۷، ۲۶ و...) را در کادر بالا وارد کرده و کلید جست‌وجو را بزنید.
          </p>
        </div>
      )}

      {/* حالت عدم وجود نتیجه پس از جست‌وجو */}
      {!loading && !loadError && hasSearched && activeResults.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 text-center space-y-3 shadow-xs">
          <div className="w-10 h-10 mx-auto rounded-full bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
            !
          </div>
          <p className="text-sm font-bold text-slate-800">هیچ شهیدی با مشخصات واردشده یافت نشد.</p>
          <p className="text-xs text-slate-500">لطفاً املای نام یا شروط فیلتر را بازبینی کرده یا کلید پاک‌سازی را بزنید.</p>
          <button
            type="button"
            onClick={handleResetSearch}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>پاک‌سازی و جست‌وجوی جدید</span>
          </button>
        </div>
      )}

      {/* جدول و کارت‌های نتایج پس از جست‌وجوی موفق */}
      {!loading && !loadError && hasSearched && activeResults.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-3 text-xs">
            <div className="flex items-center gap-2">
              <strong className="text-slate-900">نتایج جست‌وجو:</strong>{' '}
              <span className="text-[#1f4e79] font-bold tabular-nums">
                {toPersianDigits(activeResults.length.toLocaleString('en-US'))} مورد یافت شد
              </span>
              {activeResults.length > 120 && (
                <span className="text-slate-500 mr-2 hidden md:inline">
                  (نمایش ۱۲۰ مورد نخست در صفحه؛ فایل اکسل شامل تمامی نتایج است)
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetSearch}
                className="min-h-[36px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl inline-flex items-center gap-1 transition-colors cursor-pointer"
                title="پاک‌سازی نتایج جست‌وجو"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>پاک‌سازی</span>
              </button>

              <button
                type="button"
                onClick={handleExportResultsExcel}
                className="min-h-[36px] px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>خروجی Excel نتایج</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {shownSlice.map((rec) => {
              const fullName =
                [rec.first_name, rec.last_name].filter(Boolean).join(' ') ||
                (rec.record_type === 'unknown_martyr' ? 'شهید گمنام' : 'اموات');

              return (
                <article
                  key={rec.id}
                  className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between gap-3 hover:border-slate-300 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>
                        {rec.record_subtype === 'memorial'
                          ? 'شهید گمنام — مزار یادبود'
                          : rec.record_type === 'unknown_martyr'
                          ? 'شهید گمنام'
                          : rec.record_type === 'non_martyr'
                          ? 'غیرشهید — اموات'
                          : 'شهید والامقام'}
                      </span>
                      <span>
                        {rec.source === 'outside' ? 'قطعات عمومی' : `قطعه ${toPersianDigits(rec.grave_piece || '—')}`}
                      </span>
                    </div>

                    <h3 className="font-bold text-base text-slate-900">{fullName}</h3>

                    <div className="text-xs text-slate-600 space-y-1">
                      <div>
                        نام پدر: <strong className="text-slate-800">{rec.father_name || '—'}</strong>
                        {rec.age_display && (
                          <span className="mr-3">
                            · سن: <strong>{toPersianDigits(rec.age_display)}</strong>
                          </span>
                        )}
                      </div>
                      <div className="tabular-nums">
                        شهادت: {toPersianDigits(rec.death_date.display || '—')}{' '}
                        {rec.martyrdom_operation ? `· عملیات: ${rec.martyrdom_operation}` : ''}
                      </div>
                      <div className="bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-1.5 text-slate-800 font-medium tabular-nums">
                        مزار: {rec.source === 'outside' ? 'قطعات عمومی' : `قطعه ${toPersianDigits(rec.grave_piece || '—')}`}{' '}
                        · ردیف {toPersianDigits(rec.grave_row || '—')} · شماره{' '}
                        {toPersianDigits(rec.grave_number || '—')}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setInspectedRecord(rec)}
                      className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
                    >
                      جزئیات کامل
                    </button>
                    <button
                      type="button"
                      onClick={() => setLinkingRecord(rec)}
                      className="min-h-[38px] px-3 py-1.5 text-xs font-bold text-white bg-[#1f4e79] hover:bg-[#163a5b] rounded-xl inline-flex items-center gap-1"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      <span>اتصال به کتاب</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {/* Full Martyr Detail Modal */}
      {inspectedRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-xl text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-slate-500 block">پرونده بانک جامع شهدا</span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">
                  {[inspectedRecord.first_name, inspectedRecord.last_name]
                    .filter(Boolean)
                    .join(' ') || 'شهید گمنام'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectedRecord(null)}
                className="px-3 py-1.5 bg-slate-100 rounded-lg text-slate-700 font-semibold"
              >
                بستن
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 p-2.5 rounded-xl">
                <span className="text-slate-500 block">نام پدر</span>
                <strong className="text-slate-900">{inspectedRecord.father_name || '—'}</strong>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl">
                <span className="text-slate-500 block">تاریخ تولد</span>
                <strong className="text-slate-900 tabular-nums">
                  {toPersianDigits(inspectedRecord.birth_date.display || '—')}
                </strong>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl">
                <span className="text-slate-500 block">تاریخ شهادت</span>
                <strong className="text-slate-900 tabular-nums">
                  {toPersianDigits(inspectedRecord.death_date.display || '—')}
                </strong>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl">
                <span className="text-slate-500 block">سن در زمان شهادت</span>
                <strong className="text-slate-900 tabular-nums">
                  {toPersianDigits(inspectedRecord.age_display || '—')}
                </strong>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl">
                <span className="text-slate-500 block">عملیات / دسته‌بندی</span>
                <strong className="text-slate-900">
                  {[inspectedRecord.martyrdom_operation, inspectedRecord.martyrdom_category]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </strong>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl">
                <span className="text-slate-500 block">منطقه / محل شهادت</span>
                <strong className="text-slate-900">
                  {inspectedRecord.martyrdom_location || '—'}
                </strong>
              </div>
              <div className="col-span-2 bg-[#edf4fa] p-3 rounded-xl text-[#162b3b]">
                <span className="text-slate-500 block">مختصات مزار در بهشت زهرا (س):</span>
                <strong className="text-sm font-bold block mt-0.5 tabular-nums">
                  {inspectedRecord.source === 'outside'
                    ? 'قطعات عمومی خارج از گلزار'
                    : `قطعه ${toPersianDigits(inspectedRecord.grave_piece || '—')}`}{' '}
                  · ردیف {toPersianDigits(inspectedRecord.grave_row || '—')} · شماره{' '}
                  {toPersianDigits(inspectedRecord.grave_number || '—')}
                </strong>
              </div>
            </div>

            {/* Linked Books & Extracted Research Passages for this Martyr */}
            {(() => {
              const mName = normalizePersianText(
                [inspectedRecord.first_name, inspectedRecord.last_name].filter(Boolean).join(' ')
              );
              const martyrLinks = mName
                ? links.filter((l) => normalizePersianText(l.martyrNameRaw).includes(mName))
                : [];
              const confirmedM = martyrLinks.filter((l) => l.reviewStatus.includes('تأیید'));
              const pendingM = martyrLinks.filter((l) => !l.reviewStatus.includes('تأیید'));
              const martyrExtracts = mName
                ? extractedItems.filter((ex) =>
                    normalizePersianText(ex.martyrNameRaw).includes(mName)
                  )
                : [];

              return (
                <div className="space-y-2.5 border-t border-slate-200 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#1F4E79] flex items-center gap-1">
                      <BookOpen className="w-4 h-4" />
                      <span>
                        کتاب‌ها و مطالب پژوهشی مرتبط ({toPersianDigits(confirmedM.length)} تأییدشده ·{' '}
                        {toPersianDigits(pendingM.length)} در انتظار بررسی):
                      </span>
                    </span>
                  </div>

                  {martyrLinks.length === 0 && martyrExtracts.length === 0 ? (
                    <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl">
                      هنوز کتابی در فهرست فعلی به این شهید متصل نشده است. می‌توانید از دکمه «جست‌وجوی هوشمند کتاب‌های جدید» یا «اتصال به کتاب» استفاده کنید.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {martyrLinks.map((lnk) => (
                        <div
                          key={lnk.id}
                          className="bg-slate-50 border border-slate-200 rounded-lg p-2 flex items-center justify-between gap-2"
                        >
                          <div>
                            <strong className="text-slate-900">کتاب «{lnk.bookTitleRaw}»</strong>
                            <span className="text-slate-500 mr-1.5">
                              ({lnk.publisherRaw || 'ناشر نامشخص'} · صفحه:{' '}
                              {lnk.pageReferenceRaw || '—'})
                            </span>
                          </div>
                          <span className="text-[11px] font-bold text-[#1F4E79] shrink-0">
                            {lnk.reviewStatus}
                          </span>
                        </div>
                      ))}
                      {martyrExtracts.map((ex) => (
                        <div
                          key={ex.id}
                          className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-2 space-y-0.5"
                        >
                          <div className="font-bold text-[#2E7D5B]">
                            [{ex.contentType}] {ex.passageTitle} (صفحه {ex.pageReferenceRaw})
                          </div>
                          <div className="text-[11px] text-slate-700 line-clamp-2">
                            {ex.extractedText}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* جست‌وجوی مستقیم اینترنتی و پایگاه‌های کتابشناسی آنلاین */}
            <div className="bg-[#FAF3EA] border border-[#E6D5C1] rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#8C3B2B] flex items-center gap-1.5 text-xs">
                  <Globe className="w-3.5 h-3.5" />
                  <span>کاوش در اینترنت و پایگاه‌های آنلاین برای «{[inspectedRecord.first_name, inspectedRecord.last_name].filter(Boolean).join(' ') || 'شهید'}»</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px]">
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent('کتاب "شهید ' + ([inspectedRecord.first_name, inspectedRecord.last_name].filter(Boolean).join(' ') || '') + '"')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg inline-flex items-center gap-1 font-semibold"
                >
                  <ExternalLink className="w-3 h-3 text-blue-600" />
                  <span>گوگل (کتاب و زندگینامه)</span>
                </a>
                <a
                  href={`https://ketab.ir/search?query=${encodeURIComponent([inspectedRecord.first_name, inspectedRecord.last_name].filter(Boolean).join(' '))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg inline-flex items-center gap-1 font-semibold"
                >
                  <ExternalLink className="w-3 h-3 text-emerald-600" />
                  <span>خانه کتاب و ادبیات (Ketab.ir)</span>
                </a>
                <a
                  href={`http://opac.nlai.ir/opac-prod/bibliographic/searchCalc.do?action=search&bibData.title=&bibData.author=${encodeURIComponent([inspectedRecord.first_name, inspectedRecord.last_name].filter(Boolean).join(' '))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg inline-flex items-center gap-1 font-semibold"
                >
                  <ExternalLink className="w-3 h-3 text-amber-700" />
                  <span>کتابخانه ملی (OPAC NLAI)</span>
                </a>
                <a
                  href={`https://www.noorlib.ir/fa/search?q=${encodeURIComponent([inspectedRecord.first_name, inspectedRecord.last_name].filter(Boolean).join(' '))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg inline-flex items-center gap-1 font-semibold"
                >
                  <ExternalLink className="w-3 h-3 text-indigo-600" />
                  <span>پایگاه تخصصی نور (NoorLib)</span>
                </a>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {onNavigateToSmartSearch && (
                <button
                  type="button"
                  onClick={() => {
                    const name = [inspectedRecord.first_name, inspectedRecord.last_name]
                      .filter(Boolean)
                      .join(' ');
                    setInspectedRecord(null);
                    onNavigateToSmartSearch(name);
                  }}
                  className="min-h-[40px] px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-[#C58A2B] border border-amber-200 rounded-xl font-bold inline-flex items-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>انتقال به جست‌وجوی هوشمند کتاب‌های جدید</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  const r = inspectedRecord;
                  setInspectedRecord(null);
                  setLinkingRecord(r);
                }}
                className="min-h-[40px] px-4 py-2 bg-[#1f4e79] text-white rounded-xl font-bold inline-flex items-center gap-1.5"
              >
                <Link2 className="w-4 h-4" />
                <span>اتصال این شهید به کتاب در کتابخانه</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Custom Martyr Registration Modal (Section 7.3) */}
      {showNewMartyrModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-5 space-y-4 shadow-xl text-xs my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-[#253247]">
                  ثبت پرونده مستقل شهید (همراه با نام‌های جایگزین و نشانی دقیق مزار)
                </h3>
                <p className="text-[11px] text-[#697586] mt-0.5">
                  شناسه داخلی مستقل تولید می‌شود و مقادیر متنی یا دارای صفر ابتدایی در قطعه/ردیف/شماره مزار عیناً حفظ می‌گردند
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewMartyrModal(false)}
                className="px-3 py-1.5 bg-slate-100 rounded-lg font-semibold"
              >
                بستن
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newFirstName.trim() && !newLastName.trim()) {
                  onNotify('لطفاً نام یا نام خانوادگی شهید را وارد کنید.', 'warning');
                  return;
                }
                const full = `${newFirstName.trim()} ${newLastName.trim()}`.trim();
                const id = `MR-${String(customMartyrs.length + 1).padStart(6, '0')}`;
                const newRec: CustomMartyrRecord = {
                  martyrId: id,
                  firstName: newFirstName.trim(),
                  lastName: newLastName.trim(),
                  fullName: full,
                  alternativeNames: newAltNames
                    .split(/[،,]/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                  externalSystemId: newExtId.trim(),
                  identityVerificationStatus: newIdentityStatus,
                  informationSource: newInfoSource.trim(),
                  description: newDescription.trim(),
                  gravePiece: newPiece.trim(),
                  graveRow: newRow.trim(),
                  graveNumber: newGraveNum.trim(),
                  graveDisplayAddress: `قطعه ${newPiece.trim() || '—'} · ردیف ${
                    newRow.trim() || '—'
                  } · شماره ${newGraveNum.trim() || '—'}`,
                  graveSource: newGraveSource.trim(),
                  graveVerificationStatus: newGraveStatus,
                  createdAt: new Intl.DateTimeFormat('fa-IR').format(new Date())
                };
                if (onAddCustomMartyr) {
                  onAddCustomMartyr(newRec);
                }
                setShowNewMartyrModal(false);
                setNewFirstName('');
                setNewLastName('');
                setNewAltNames('');
                setNewPiece('');
                setNewRow('');
                setNewGraveNum('');
                onNotify(`پرونده مستقل شهید «${full}» با شناسه داخلی ${id} ثبت شد.`);
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#253247] mb-1">نام *</label>
                  <input
                    type="text"
                    required
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    placeholder="مثلاً: محمد ابراهیم"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#253247] mb-1">نام خانوادگی *</label>
                  <input
                    type="text"
                    required
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    placeholder="مثلاً: همت"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#253247] mb-1">
                  نام‌های جایگزین و اشکال مختلف نوشتاری (جداشده با ویرگول):
                </label>
                <input
                  type="text"
                  value={newAltNames}
                  onChange={(e) => setNewAltNames(e.target.value)}
                  placeholder="مثلاً: حاج ابراهیم همت، سردار همت، همت محمدابراهیم"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5 bg-[#F5F7FA] p-3 rounded-xl border border-slate-200">
                <div>
                  <label className="block font-bold text-[#253247] mb-1">
                    قطعه (متن/عدد خام)
                  </label>
                  <input
                    type="text"
                    value={newPiece}
                    onChange={(e) => setNewPiece(e.target.value)}
                    placeholder="مثلاً: 24 یا غ تهرانی"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#253247] mb-1">
                    ردیف (با حفظ صفر اول)
                  </label>
                  <input
                    type="text"
                    value={newRow}
                    onChange={(e) => setNewRow(e.target.value)}
                    placeholder="مثلاً: 04 یا 14"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#253247] mb-1">
                    شماره مزار
                  </label>
                  <input
                    type="text"
                    value={newGraveNum}
                    onChange={(e) => setNewGraveNum(e.target.value)}
                    placeholder="مثلاً: 08 یا 12الف"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#253247] mb-1">وضعیت بررسی هویت</label>
                  <select
                    value={newIdentityStatus}
                    onChange={(e) =>
                      setNewIdentityStatus(
                        e.target.value as CustomMartyrRecord['identityVerificationStatus']
                      )
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                  >
                    <option value="تأییدشده">تأییدشده</option>
                    <option value="نیازمند بررسی">نیازمند بررسی</option>
                    <option value="بررسی‌نشده">بررسی‌نشده</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-[#253247] mb-1">وضعیت تأیید مزار</label>
                  <select
                    value={newGraveStatus}
                    onChange={(e) =>
                      setNewGraveStatus(
                        e.target.value as CustomMartyrRecord['graveVerificationStatus']
                      )
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                  >
                    <option value="تأییدشده میدانی/سند">تأییدشده میدانی/سند</option>
                    <option value="نیازمند تطبیق مزار">نیازمند تطبیق مزار</option>
                    <option value="یادبود / غیرتهرانی">یادبود / غیرتهرانی</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#253247] mb-1">
                    منشأ اطلاعات هویت و مزار
                  </label>
                  <input
                    type="text"
                    value={newGraveSource}
                    onChange={(e) => setNewGraveSource(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#253247] mb-1">
                    شناسه سامانه‌های دیگر (در صورت تأیید)
                  </label>
                  <input
                    type="text"
                    value={newExtId}
                    onChange={(e) => setNewExtId(e.target.value)}
                    placeholder="جعل نشود؛ در صورت نامعلوم بودن خالی بماند"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewMartyrModal(false)}
                  className="px-4 py-2 bg-slate-100 rounded-xl font-semibold"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#1F4E79] text-white rounded-xl font-bold cursor-pointer"
                >
                  ثبت پرونده شهید
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* مودال حذف پرونده مستقل ثبت‌شده */}
      {deletingCustomMartyr && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl border border-rose-200">
            <div className="flex items-center gap-2.5 text-rose-700">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-bold text-sm sm:text-base text-rose-900">
                  تأیید حذف پرونده شهید
                </h3>
                <span className="text-xs text-rose-600 font-mono" dir="ltr">
                  {deletingCustomMartyr.martyrId}
                </span>
              </div>
            </div>

            <div className="bg-rose-50/70 border border-rose-100 rounded-xl p-3 text-xs text-rose-950 space-y-1.5 leading-relaxed">
              <p>
                آیا از حذف پرونده شهید مستقل{' '}
                <strong className="text-rose-900 font-bold">«{deletingCustomMartyr.fullName}»</strong>{' '}
                اطمینان دارید؟
              </p>
              <div className="text-[11px] text-slate-600">
                نشانی مزار: {deletingCustomMartyr.graveDisplayAddress || 'فاقد نشانی'}
              </div>
              <p className="text-[11px] text-rose-700 font-medium pt-1">
                ⚠️ این عملیات پرونده را از حافظه محلی این دستگاه (پایگاه book) پاک می‌کند.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeletingCustomMartyr(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteCustomMartyr) {
                    onDeleteCustomMartyr(deletingCustomMartyr.martyrId);
                    onNotify(
                      `پرونده شهید «${deletingCustomMartyr.fullName}» با شناسه ${deletingCustomMartyr.martyrId} با موفقیت حذف شد.`,
                      'success'
                    );
                  }
                  setDeletingCustomMartyr(null);
                }}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>بله، حذف شود</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* مودال ویرایش و صحت‌سنجی کارشناسی پرونده شهید */}
      {editingCustomMartyr && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-5 space-y-4 shadow-2xl border border-slate-200 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-[#1F4E79]" />
                <h3 className="font-bold text-base text-[#253247]">
                  ویرایش و صحت‌سنجی پرونده شهید
                </h3>
                <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-[#1F4E79]" dir="ltr">
                  {editingCustomMartyr.martyrId}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditingCustomMartyr(null)}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
              >
                بستن
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editingCustomMartyr.fullName.trim()) {
                  onNotify('نام شهید نباید خالی باشد.', 'warning');
                  return;
                }
                if (onUpdateCustomMartyr) {
                  onUpdateCustomMartyr(editingCustomMartyr);
                  onNotify(`مشخصات و وضعیت پرونده شهید «${editingCustomMartyr.fullName}» به‌روزرسانی شد.`, 'success');
                }
                setEditingCustomMartyr(null);
              }}
              className="space-y-3.5 text-xs"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#253247] mb-1">نام</label>
                  <input
                    type="text"
                    value={editingCustomMartyr.firstName}
                    onChange={(e) => {
                      const f = e.target.value;
                      setEditingCustomMartyr({
                        ...editingCustomMartyr,
                        firstName: f,
                        fullName: `${f} ${editingCustomMartyr.lastName}`.trim()
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#253247] mb-1">نام خانوادگی</label>
                  <input
                    type="text"
                    value={editingCustomMartyr.lastName}
                    onChange={(e) => {
                      const l = e.target.value;
                      setEditingCustomMartyr({
                        ...editingCustomMartyr,
                        lastName: l,
                        fullName: `${editingCustomMartyr.firstName} ${l}`.trim()
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#253247] mb-1">
                  نام‌های جایگزین و اشکال مختلف نوشتاری (جداشده با ویرگول):
                </label>
                <input
                  type="text"
                  value={editingCustomMartyr.alternativeNames.join(' ، ')}
                  onChange={(e) =>
                    setEditingCustomMartyr({
                      ...editingCustomMartyr,
                      alternativeNames: e.target.value
                        .split(/[،,]/)
                        .map((s) => s.trim())
                        .filter(Boolean)
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                />
              </div>

              {/* بخش مزار */}
              <div className="bg-[#F5F7FA] p-3 rounded-xl border border-slate-200 space-y-2">
                <div className="font-bold text-slate-700">نشانی مزار در گلزار شهدا:</div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">قطعه</label>
                    <input
                      type="text"
                      value={editingCustomMartyr.gravePiece}
                      onChange={(e) => {
                        const p = e.target.value;
                        setEditingCustomMartyr({
                          ...editingCustomMartyr,
                          gravePiece: p,
                          graveDisplayAddress: `قطعه ${p || '—'} · ردیف ${editingCustomMartyr.graveRow || '—'} · شماره ${editingCustomMartyr.graveNumber || '—'}`
                        });
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">ردیف</label>
                    <input
                      type="text"
                      value={editingCustomMartyr.graveRow}
                      onChange={(e) => {
                        const r = e.target.value;
                        setEditingCustomMartyr({
                          ...editingCustomMartyr,
                          graveRow: r,
                          graveDisplayAddress: `قطعه ${editingCustomMartyr.gravePiece || '—'} · ردیف ${r || '—'} · شماره ${editingCustomMartyr.graveNumber || '—'}`
                        });
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">شماره قبر</label>
                    <input
                      type="text"
                      value={editingCustomMartyr.graveNumber}
                      onChange={(e) => {
                        const n = e.target.value;
                        setEditingCustomMartyr({
                          ...editingCustomMartyr,
                          graveNumber: n,
                          graveDisplayAddress: `قطعه ${editingCustomMartyr.gravePiece || '—'} · ردیف ${editingCustomMartyr.graveRow || '—'} · شماره ${n || '—'}`
                        });
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* تعیین وضعیت صحت‌سنجی */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#253247] mb-1">
                    وضعیت صحت‌سنجی هویت *
                  </label>
                  <select
                    value={editingCustomMartyr.identityVerificationStatus}
                    onChange={(e) =>
                      setEditingCustomMartyr({
                        ...editingCustomMartyr,
                        identityVerificationStatus: e.target.value as CustomMartyrRecord['identityVerificationStatus']
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-semibold text-slate-800"
                  >
                    <option value="تأییدشده">تأییدشده (معتبر در اسناد گلزار)</option>
                    <option value="نیازمند بررسی">نیازمند بررسی و استعلام</option>
                    <option value="بررسی‌نشده">بررسی‌نشده (ثبت اولیه)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-[#253247] mb-1">
                    وضعیت صحت‌سنجی مزار *
                  </label>
                  <select
                    value={editingCustomMartyr.graveVerificationStatus}
                    onChange={(e) =>
                      setEditingCustomMartyr({
                        ...editingCustomMartyr,
                        graveVerificationStatus: e.target.value as CustomMartyrRecord['graveVerificationStatus']
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-semibold text-slate-800"
                  >
                    <option value="تأییدشده میدانی/سند">تأییدشده میدانی/سند</option>
                    <option value="نیازمند تطبیق مزار">نیازمند تطبیق مزار</option>
                    <option value="یادبود / غیرتهرانی">یادبود / غیرتهرانی</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#253247] mb-1">توضیحات و یادداشت کارشناس:</label>
                <textarea
                  rows={2}
                  value={editingCustomMartyr.description || ''}
                  onChange={(e) =>
                    setEditingCustomMartyr({
                      ...editingCustomMartyr,
                      description: e.target.value
                    })
                  }
                  placeholder="یادداشت‌های تکمیلی، نحوه شهادت یا نکات مرتبط با پرونده..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingCustomMartyr(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#1F4E79] hover:bg-[#163a5b] text-white rounded-xl font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>ذخیره تغییرات و وضعیت</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
