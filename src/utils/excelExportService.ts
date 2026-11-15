import { UnifiedBookDossier } from '../data/soorehMehrResearch';
import { FieldAuditRecord, BookMartyrLinkRecord } from '../data/markazAsnadData';
import {
  openStandardExcelExportModal,
  ExcelExportSourcePayload
} from '../modules/excel-export';

/**
 * خروجی Excel استاندارد و فقط‌خواندنی از هر فهرست کتاب‌ها (با پنجره انتخاب فیلدها، الگوهای آماده، شیت‌های چندگانه و ارتباط دوسویه کتاب و شهید)
 */
export function exportBookDossiersToExcel(
  dossiers: UnifiedBookDossier[],
  listTitle: string,
  fileNamePrefix: string,
  extraContext?: Partial<ExcelExportSourcePayload>
): void {
  openStandardExcelExportModal({
    mode: 'books_list',
    reportTitle: listTitle || 'گزارش فهرست کتاب‌ها و شهدای مرتبط',
    fileNamePrefix: fileNamePrefix || 'گزارش_کتابخانه_مرکز_اسناد',
    dossiers,
    presetId: dossiers.length === 1 ? 'complete_report' : 'books_with_martyrs',
    ...extraContext
  });
}

/**
 * خروجی Excel از فهرست ارتباط‌های کتاب و شهید (برای فیلترهای ارتباط قطعی، احتمالی و نیازمند بررسی)
 */
export function exportMartyrLinksToExcel(
  links: BookMartyrLinkRecord[],
  listTitle: string,
  fileNamePrefix: string,
  extraContext?: Partial<ExcelExportSourcePayload>
): void {
  openStandardExcelExportModal({
    mode: 'martyr_links',
    reportTitle: listTitle || 'گزارش ارتباط‌های کتاب و شهید',
    fileNamePrefix: fileNamePrefix || 'گزارش_ارتباط_کتاب_و_شهید',
    links,
    presetId: 'books_with_martyrs',
    ...extraContext
  });
}

/**
 * خروجی Excel از فهرست ثبت‌های قفسه ذخیره‌شده در حافظه دستگاه (همراه با اطلاعات شهدای مرتبط با هر کتاب)
 */
export function exportShelfAuditRecordsToExcel(
  records: FieldAuditRecord[],
  fileNamePrefix = 'فهرست_ثبت_های_قفسه_ذخیره_شده',
  extraContext?: Partial<ExcelExportSourcePayload>
): void {
  openStandardExcelExportModal({
    mode: 'shelf_records',
    reportTitle: 'فهرست ثبت‌های قفسه ذخیره‌شده در حافظه دستگاه (به همراه شهدای مرتبط)',
    fileNamePrefix,
    shelfRecords: records,
    presetId: 'books_with_martyrs',
    ...extraContext
  });
}

