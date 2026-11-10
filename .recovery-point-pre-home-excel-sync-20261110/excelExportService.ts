import * as XLSX from 'xlsx';
import {
  UnifiedBookDossier,
  MartyrRelationCertainty,
  classifyMartyrLinkCertainty
} from '../data/soorehMehrResearch';
import { FieldAuditRecord, BookMartyrLinkRecord } from '../data/markazAsnadData';

function getPersianDateStamp(): string {
  try {
    return new Date().toLocaleDateString('fa-IR').replace(/\//g, '-');
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function formatPhysicalStatusLabel(status: UnifiedBookDossier['physicalStatus']): string {
  if (status === 'verified') return 'موجود در کتابخانه (تأییدشده)';
  if (status === 'review') return 'نیازمند بررسی';
  if (status === 'not_found') return 'مشاهده‌نشده در قفسه';
  return 'تعیین‌تکلیف‌نشده';
}

function formatCertaintyLabel(certainty: MartyrRelationCertainty): string {
  if (certainty === 'قطعی') return 'ارتباط قطعی';
  if (certainty === 'احتمالی') return 'ارتباط احتمالی';
  return 'نیازمند بررسی';
}

/**
 * خروجی Excel استاندارد و فقط‌خواندنی از هر فهرست کتاب‌ها (با حفظ فیلتر فعال، مشخصات کامل کتاب، وضعیت قفسه و تمام ارتباط‌های شهدا)
 */
export function exportBookDossiersToExcel(
  dossiers: UnifiedBookDossier[],
  listTitle: string,
  fileNamePrefix: string
): void {
  const wb = XLSX.utils.book_new();

  // شیت ۱: فهرست کتاب‌های فیلترشده (یک ردیف به ازای هر کتاب + خلاصه تمام شهدای مرتبط)
  const bookRows = dossiers.map((book, idx) => {
    const martyrSummary =
      book.martyrRelations.length === 0
        ? 'بدون ارتباط ثبت‌شده با شهید'
        : book.martyrRelations
            .map(
              (m, mIdx) =>
                `${mIdx + 1}. ${m.martyrName}${
                  m.gravePiece !== '—' || m.graveRow !== '—' || m.graveNumber !== '—'
                    ? ` (قطعه ${m.gravePiece}، ردیف ${m.graveRow}، مزار ${m.graveNumber})`
                    : ''
                } [${m.certainty}]`
            )
            .join(' | ');

    const pageRefsSummary =
      book.martyrRelations
        .map((m) => (m.pageReference ? `${m.martyrName}: ${m.pageReference}` : ''))
        .filter(Boolean)
        .join(' | ') || '—';

    const evidenceSummary =
      book.martyrRelations
        .map((m) => (m.evidenceText ? `${m.martyrName}: ${m.evidenceText}` : ''))
        .filter(Boolean)
        .join(' | ') || '—';

    const certaintiesSummary =
      book.martyrRelations.length === 0
        ? '—'
        : Array.from(new Set(book.martyrRelations.map((m) => formatCertaintyLabel(m.certainty)))).join('، ');

    const sourceTypeLabel = book.isNewRegistration
      ? 'ثبت جدید (خارج از فهرست اولیه)'
      : book.martyrRelations.length > 0
      ? 'مجموعه پژوهشی پایه (۱۹۸ عنوان)'
      : 'کاتالوگ مرجع کتابخانه (تعیین‌تکلیف‌شده در قفسه)';

    return {
      'ردیف': idx + 1,
      'شناسه پرونده': book.dossierId,
      'شناسه کتاب': book.bookId,
      'عنوان کتاب': book.title,
      'عنوان دیگر / فرعی': book.alternativeTitle || '—',
      'نویسنده / پدیدآور': book.author || '—',
      'ناشر': book.publisher || '—',
      'سال چاپ': book.year || '—',
      'نوبت چاپ': book.edition || '—',
      'شابک (ISBN)': book.isbn || '—',
      'شماره فیپا': book.fipa || '—',
      'شماره ثبت کتابخانه': book.registrationNo || '—',
      'دسته موضوعی': book.category || '—',
      'وضعیت ثبت و تعیین‌تکلیف': book.determinationStatusLabel || formatPhysicalStatusLabel(book.physicalStatus),
      'قفسه': book.shelf || '—',
      'طبقه / ردیف قفسه': book.level || '—',
      'کد محل نگهداری': book.locationCode || '—',
      'تعداد نسخه شمارش‌شده': book.countedCopies || '0',
      'نوع ارتباط با شهدا': book.sheetCategory,
      'تعداد شهدای مرتبط': book.martyrRelations.length,
      'اسامی شهدای مرتبط (کامل)': martyrSummary,
      'وضعیت ارتباط شهدا': certaintiesSummary,
      'شماره صفحات مرتبط': pageRefsSummary,
      'مستندات و توضیحات ارتباط': evidenceSummary,
      'تعداد گزیده‌های متنی': book.extractedPassages.length,
      'توضیحات کتاب': book.description || '—',
      'یادداشت کارشناس': book.notes || '—',
      'منبع رکورد در مجموعه': sourceTypeLabel,
      'نوع فهرست خروجی': listTitle
    };
  });

  const wsBooks = XLSX.utils.json_to_sheet(
    bookRows.length > 0
      ? bookRows
      : [
          {
            'ردیف': 1,
            'عنوان کتاب': 'هیچ رکوردی در این فیلتر یافت نشد',
            'نوع فهرست خروجی': listTitle
          }
        ]
  );
  XLSX.utils.book_append_sheet(wb, wsBooks, 'فهرست کتاب‌ها');

  // شیت ۲: ریز ارتباط‌های کتاب و شهید (هر ارتباط کتاب-شهید در یک سطر مجزا برای کتاب‌های یک‌شهید و چندشهید)
  const relationRows: Record<string, string | number>[] = [];
  let relIndex = 1;
  for (const book of dossiers) {
    if (book.martyrRelations.length === 0) {
      relationRows.push({
        'ردیف': relIndex++,
        'شناسه کتاب': book.bookId,
        'عنوان کتاب': book.title,
        'نویسنده': book.author || '—',
        'ناشر': book.publisher || '—',
        'دسته ارتباط کتاب': book.sheetCategory,
        'نام شهید مرتبط': 'بدون ارتباط ثبت‌شده',
        'قطعه مزار': '—',
        'ردیف مزار': '—',
        'شماره مزار': '—',
        'وضعیت ارتباط': '—',
        'صفحه / ارجاع در کتاب': '—',
        'مستندات و توضیحات ارتباط': '—',
        'یادداشت بررسی': '—',
        'وضعیت کتاب در قفسه': book.determinationStatusLabel,
        'کد محل نگهداری': book.locationCode || '—'
      });
    } else {
      for (const m of book.martyrRelations) {
        relationRows.push({
          'ردیف': relIndex++,
          'شناسه کتاب': book.bookId,
          'عنوان کتاب': book.title,
          'نویسنده': book.author || '—',
          'ناشر': book.publisher || '—',
          'دسته ارتباط کتاب': book.sheetCategory,
          'نام شهید مرتبط': m.martyrName,
          'قطعه مزار': m.gravePiece || '—',
          'ردیف مزار': m.graveRow || '—',
          'شماره مزار': m.graveNumber || '—',
          'وضعیت ارتباط': formatCertaintyLabel(m.certainty),
          'صفحه / ارجاع در کتاب': m.pageReference || '—',
          'مستندات و توضیحات ارتباط': m.evidenceText || '—',
          'یادداشت بررسی': m.reviewerNote || '—',
          'وضعیت کتاب در قفسه': book.determinationStatusLabel,
          'کد محل نگهداری': book.locationCode || '—'
        });
      }
    }
  }

  const wsRelations = XLSX.utils.json_to_sheet(relationRows);
  XLSX.utils.book_append_sheet(wb, wsRelations, 'ریز ارتباط کتاب و شهید');

  const safePrefix = fileNamePrefix.replace(/[\\/:*?"<>|\s]+/g, '_');
  XLSX.writeFile(wb, `${safePrefix}_${getPersianDateStamp()}.xlsx`);
}

/**
 * خروجی Excel از فهرست ارتباط‌های کتاب و شهید (برای فیلترهای ارتباط قطعی، احتمالی و نیازمند بررسی)
 */
export function exportMartyrLinksToExcel(
  links: BookMartyrLinkRecord[],
  listTitle: string,
  fileNamePrefix: string
): void {
  const wb = XLSX.utils.book_new();
  const rows = links.map((link, idx) => {
    const cert = classifyMartyrLinkCertainty(link);
    return {
      'ردیف': idx + 1,
      'شناسه ارتباط': link.id,
      'شناسه کتاب': link.tempBookId || '—',
      'عنوان کتاب مرتبط': link.bookTitleRaw || '—',
      'عنوان دیگر': link.alternativeTitle || '—',
      'ناشر': link.publisherRaw || '—',
      'نام شهید': link.martyrNameRaw || '—',
      'قطعه مزار': link.gravePieceRaw || '—',
      'ردیف مزار': link.graveRowRaw || '—',
      'شماره مزار': link.graveNumberRaw || '—',
      'وضعیت ارتباط': formatCertaintyLabel(cert),
      'وضعیت بررسی کارشناسی': link.reviewStatus || '—',
      'صفحه / بخش ارجاع': link.pageReferenceRaw || '—',
      'توضیحات منبع': link.sourceDescriptionRaw || '—',
      'یادداشت پژوهشگر': link.reviewerNote || '—',
      'شیت منبع': link.sourceSheet || '—',
      'نوع فهرست خروجی': listTitle
    };
  });

  const ws = XLSX.utils.json_to_sheet(
    rows.length > 0
      ? rows
      : [{ 'ردیف': 1, 'عنوان کتاب مرتبط': 'هیچ رکوردی در این فهرست وجود ندارد', 'نوع فهرست خروجی': listTitle }]
  );
  XLSX.utils.book_append_sheet(wb, ws, 'فهرست ارتباط‌ها');
  const safePrefix = fileNamePrefix.replace(/[\\/:*?"<>|\s]+/g, '_');
  XLSX.writeFile(wb, `${safePrefix}_${getPersianDateStamp()}.xlsx`);
}

/**
 * خروجی Excel از فهرست ثبت‌های قفسه ذخیره‌شده در حافظه دستگاه
 */
export function exportShelfAuditRecordsToExcel(
  records: FieldAuditRecord[],
  fileNamePrefix = 'فهرست_ثبت_های_قفسه_ذخیره_شده'
): void {
  const wb = XLSX.utils.book_new();
  const rows = records.map((rec, idx) => ({
    'ردیف': idx + 1,
    'شناسه کتاب': rec.tempBookId || rec.key,
    'عنوان کتاب': rec.title || '—',
    'نویسنده': rec.author || '—',
    'ناشر': rec.publisher || '—',
    'سال چاپ': rec.year || '—',
    'نوبت چاپ': rec.edition || '—',
    'شابک': rec.isbn || '—',
    'شماره فیپا': rec.fipa || '—',
    'شماره ثبت': rec.registrationNo || '—',
    'دسته موضوعی': rec.category || '—',
    'وضعیت تعیین‌تکلیف':
      rec.physical === 'verified'
        ? 'موجود و تأییدشده'
        : rec.physical === 'review'
        ? 'نیازمند بررسی'
        : 'مشاهده‌نشده در قفسه',
    'قفسه': rec.shelf || '—',
    'طبقه': rec.level || '—',
    'کد محل نگهداری': rec.location || '—',
    'تعداد نسخه شمارش‌شده': rec.countedCopies || '1',
    'ثبت‌کننده': rec.checkedBy || '—',
    'منبع رکورد': rec.source === 'outside-list' ? 'ثبت جدید (خارج از فهرست)' : 'کاتالوگ مرجع کتابخانه',
    'توضیحات کتاب': rec.descriptionRaw || '—',
    'یادداشت': rec.notes || '—',
    'زمان آخرین ثبت / ویرایش': rec.updatedAt || '—'
  }));

  const ws = XLSX.utils.json_to_sheet(
    rows.length > 0
      ? rows
      : [{ 'ردیف': 1, 'عنوان کتاب': 'هنوز هیچ ثبت قفسه‌ای در حافظه این دستگاه ذخیره نشده است' }]
  );
  XLSX.utils.book_append_sheet(wb, ws, 'ثبت‌های قفسه دستگاه');
  XLSX.writeFile(wb, `${fileNamePrefix}_${getPersianDateStamp()}.xlsx`);
}
