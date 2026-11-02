import type { BookRecord, LocationAddress, ReviewStatus } from './model.js';

export const APP_ID = 'markaz-asnad-library-research-pwa' as const;
export const APP_VERSION = '0.1.0';
export const SCHEMA_VERSION = 1 as const;
export const EXPECTED_REFERENCE_SHA256 = '0B34D6A013D11D2273EF306CEBAFAE92F024E52811E5BC43F6509ADE7AB19C16';
export const LOCAL_ACTOR = 'local-primary-user';

export const CATEGORIES = [
  { code: 'R', label: 'روایت و خاطرات' },
  { code: 'A', label: 'ادبیات و هنر' },
  { code: 'H', label: 'تاریخ و اسناد' },
  { code: 'P', label: 'پژوهش و تحلیل' },
  { code: 'K', label: 'کودک و نوجوان' },
  { code: 'M', label: 'متفرقه و متنوع' },
] as const;

export const SHELVES = ['SH-01', 'SH-02', 'SH-03', 'SH-04'] as const;
export const TIERS = ['T01', 'T02', 'T03', 'T04', 'T05', 'T06'] as const;

export function createId(prefix: string): string {
  const token = globalThis.crypto?.randomUUID?.();
  if (!token) throw new Error('این مرورگر تولید شناسه امن را پشتیبانی نمی‌کند.');
  return `${prefix}-${token}`;
}

/** Search-only normalization. Never write the returned value over a source field. */
export function normalizePersian(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[\u200c\u200f\u200e]/g, ' ')
    .replace(/[ـ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('fa');
}

export function makeLocation(shelf: string, tier: string): LocationAddress {
  if (!SHELVES.includes(shelf as (typeof SHELVES)[number])) {
    throw new Error('قفسه انتخاب‌شده معتبر نیست.');
  }
  if (!TIERS.includes(tier as (typeof TIERS)[number])) {
    throw new Error('طبقه انتخاب‌شده معتبر نیست.');
  }
  return { shelf: shelf as LocationAddress['shelf'], tier: tier as LocationAddress['tier'], code: `${shelf}-${tier}` };
}

export function locationFitsCategory(categoryCode: string, shelf: string, tier: string): boolean {
  if (categoryCode === 'U') return true;
  if (categoryCode === 'R') return ['SH-01', 'SH-02'].includes(shelf);
  if (categoryCode === 'H') return shelf === 'SH-03' && tier === 'T01';
  if (categoryCode === 'A') return shelf === 'SH-03' && tier === 'T02';
  if (categoryCode === 'P') return shelf === 'SH-03' && ['T03', 'T04'].includes(tier);
  if (categoryCode === 'M') return shelf === 'SH-03' && ['T05', 'T06'].includes(tier);
  if (categoryCode === 'K') return shelf === 'SH-04' && tier === 'T01';
  return false;
}

export function validateBookInput(input: { title: string; categoryCode: string }): string[] {
  const issues: string[] = [];
  if (!input.title.trim()) issues.push('عنوان کتاب الزامی است.');
  if (![...CATEGORIES.map((item) => item.code), 'U'].includes(input.categoryCode)) {
    issues.push('گروه موضوعی را انتخاب کنید؛ برای مورد نامشخص از «نامشخص» استفاده کنید.');
  }
  return issues;
}

export function buildBookSearchText(book: Pick<BookRecord, 'titleRaw' | 'titleDisplay' | 'authorsRaw' | 'publisherRaw' | 'descriptionRaw'>): string {
  return normalizePersian([book.titleRaw, book.titleDisplay, book.authorsRaw, book.publisherRaw, book.descriptionRaw].join(' '));
}

export function findExactTitleDuplicates<T extends { titleRaw: string; publisherRaw?: string }>(records: T[], title: string): T[] {
  const needle = normalizePersian(title);
  if (!needle) return [];
  return records.filter((record) => normalizePersian(record.titleRaw) === needle);
}

export function statusLabel(status: ReviewStatus | string): string {
  const labels: Record<string, string> = {
    draft: 'پیش‌نویس',
    needs_review: 'نیازمند بررسی',
    verified: 'تأییدشده',
    unverified: 'منبع تأییدنشده',
    rejected: 'ردشده با دلیل',
    conflict: 'دارای تعارض',
    proposed: 'پیشنهادی',
    in_review: 'در حال بررسی',
    confirmed: 'تأییدشده',
  };
  return labels[status] ?? 'نامشخص';
}

export function statusTone(status: string): string {
  if (status === 'verified' || status === 'confirmed') return 'success';
  if (status === 'rejected') return 'danger';
  if (status === 'conflict') return 'danger';
  if (status === 'needs_review' || status === 'proposed' || status === 'in_review') return 'warning';
  return 'neutral';
}

export function categoryLabel(code: string): string {
  if (code === 'U') return 'نامشخص';
  return CATEGORIES.find((item) => item.code === code)?.label ?? 'نامشخص';
}

export function safeNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}
