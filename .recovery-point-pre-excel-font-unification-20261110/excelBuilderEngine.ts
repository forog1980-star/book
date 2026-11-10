import XLSXStyle from 'xlsx-js-style';
import * as XLSX from 'xlsx';
import {
  BookCopyRecord,
  BookMartyrLinkRecord,
  CustomMartyrRecord,
  ExtractedContentItem,
  FieldAuditRecord,
  ReferenceCatalogRow,
  WorkbookGolzarMartyr,
  toPersianDigits,
} from '../../data/markazAsnadData';
import {
  BookDossierMartyrRelation,
  MartyrRelationCertainty,
  UnifiedBookDossier,
  buildUnifiedBookDossiers,
  classifyMartyrLinkCertainty,
  compactPersianForMatch,
} from '../../data/soorehMehrResearch';
import { EXCEL_FIELDS_CATALOG, EXCEL_SHEETS_CATALOG } from './fieldCatalog';
import {
  ExcelExportDatasetContext,
  ExcelExportUserSelection,
  ExcelSheetKey,
  StandardizedMartyrEntry,
} from './types';

function getPersianDateStamp(): string {
  try {
    return new Date().toLocaleDateString('fa-IR').replace(/\//g, '-');
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function getPersianDateTimeDisplay(): string {
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString();
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

function formatGraveAddress(piece?: string, row?: string, num?: string): string {
  const p = (piece || '').trim();
  const r = (row || '').trim();
  const n = (num || '').trim();
  const parts: string[] = [];
  if (p && p !== '—') parts.push(`قطعه ${p}`);
  if (r && r !== '—') parts.push(`ردیف ${r}`);
  if (n && n !== '—') parts.push(`شماره ${n}`);
  return parts.length > 0 ? parts.join('، ') : 'ثبت‌نشده در منبع';
}

/**
 * تجمیع پرونده‌های یکتای کتاب و ارتباط‌های دوطرفه با شهدا، مزار، موضوعات، صفحات و متون استخراج‌شده
 * بدون حذف، ادغام اشتباه یا ساخت اطلاعات حدسی برای فیلدهای ناقص
 */
function resolveDossiersAndMartyrIndex(ctx: ExcelExportDatasetContext): {
  dossiers: UnifiedBookDossier[];
  martyrMap: Map<string, StandardizedMartyrEntry>;
  copiesByBookId: Map<string, BookCopyRecord[]>;
  extractedItems: ExtractedContentItem[];
  links: BookMartyrLinkRecord[];
} {
  const catalogRows: ReferenceCatalogRow[] = ctx.catalogRows || [];
  const auditRecords: Record<string, FieldAuditRecord> =
    ctx.auditRecords && Object.keys(ctx.auditRecords).length > 0
      ? ctx.auditRecords
      : Array.isArray(ctx.shelfRecords)
      ? Object.fromEntries(ctx.shelfRecords.map((r) => [r.key || r.tempBookId, r]))
      : {};
  const bookCopies: BookCopyRecord[] = ctx.bookCopies || [];
  const links: BookMartyrLinkRecord[] = ctx.links || [];
  const extractedItems: ExtractedContentItem[] = ctx.extractedItems || [];
  const customMartyrs: CustomMartyrRecord[] = ctx.customMartyrs || [];
  const workbookMartyrs: WorkbookGolzarMartyr[] = ctx.workbookMartyrs || [];

  const allBuiltDossiers: UnifiedBookDossier[] =
    ctx.dossiers && ctx.dossiers.length > 0
      ? ctx.dossiers
      : buildUnifiedBookDossiers({
          catalogRows,
          auditRecords,
          bookCopies,
          links,
          extractedItems,
        });

  const dossiers: UnifiedBookDossier[] =
    Array.isArray(ctx.shelfRecords) && ctx.shelfRecords.length > 0 && (!ctx.dossiers || ctx.dossiers.length === 0)
      ? (() => {
          const allowedKeys = new Set(
            ctx.shelfRecords.flatMap((r) => [r.key, r.tempBookId].filter(Boolean))
          );
          const filtered = allBuiltDossiers.filter(
            (d) => allowedKeys.has(d.rowKey) || allowedKeys.has(d.bookId)
          );
          return filtered.length > 0 ? filtered : allBuiltDossiers;
        })()
      : allBuiltDossiers;

  const copiesByBookId = new Map<string, BookCopyRecord[]>();
  for (const cp of bookCopies) {
    if (!cp.bookId) continue;
    const arr = copiesByBookId.get(cp.bookId) || [];
    arr.push(cp);
    copiesByBookId.set(cp.bookId, arr);
  }

  const martyrMap = new Map<string, StandardizedMartyrEntry>();

  // ۱. افزودن شهدای صریح ارسال‌شده (مثلاً از نتایج جست‌وجوی تب شهدا)
  if (Array.isArray(ctx.explicitMartyrsList)) {
    for (const m of ctx.explicitMartyrsList) {
      const key = compactPersianForMatch(m.fullName) || m.martyrId;
      if (key && !martyrMap.has(key)) {
        martyrMap.set(key, m);
      }
    }
  }

  if (Array.isArray(ctx.martyrRecords)) {
    for (const r of ctx.martyrRecords) {
      const fullName =
        [r.first_name, r.last_name].filter(Boolean).join(' ').trim() ||
        r.memorial_name ||
        'شهید گمنام';
      const key = compactPersianForMatch(fullName) || r.id;
      if (key && !martyrMap.has(key)) {
        martyrMap.set(key, {
          martyrId: r.id || '—',
          fullName,
          firstName: r.first_name || '—',
          lastName: r.last_name || '—',
          fatherName: r.father_name || '—',
          birthDate: r.birth_date?.display || r.birth_date?.year || '—',
          martyrdomDate: r.death_date?.display || r.death_date?.year || '—',
          operationOrLocation:
            [r.martyrdom_operation, r.martyrdom_location].filter(Boolean).join(' — ') || '—',
          gravePiece: r.grave_piece || '—',
          graveRow: r.grave_row || '—',
          graveNumber: r.grave_number || '—',
          graveAddressDisplay: formatGraveAddress(r.grave_piece, r.grave_row, r.grave_number),
          graveStatus: r.source === 'outside' ? 'قطعات عمومی بهشت زهرا' : 'گلزار شهدای تهران',
          sourceLabel: 'بانک جامع شهدای گلزار تهران',
        });
      }
    }
  }

  // ۲. افزودن پرونده‌های مستقل شهید (CustomMartyrRecord)
  for (const cm of customMartyrs) {
    const key = compactPersianForMatch(cm.fullName);
    if (!key) continue;
    if (!martyrMap.has(key)) {
      martyrMap.set(key, {
        martyrId: cm.martyrId || '—',
        fullName: cm.fullName,
        firstName: cm.firstName,
        lastName: cm.lastName,
        gravePiece: cm.gravePiece || '—',
        graveRow: cm.graveRow || '—',
        graveNumber: cm.graveNumber || '—',
        graveAddressDisplay:
          cm.graveDisplayAddress ||
          formatGraveAddress(cm.gravePiece, cm.graveRow, cm.graveNumber),
        graveStatus: cm.graveVerificationStatus || 'بررسی‌شده',
        sourceLabel: cm.informationSource || 'پرونده مستقل شهید در سامانه',
      });
    }
  }

  // ۳. افزودن شهدای گلزار شیت مرجع (WorkbookGolzarMartyr)
  for (const wm of workbookMartyrs) {
    const key = compactPersianForMatch(wm.fullNameSearch);
    if (!key) continue;
    if (!martyrMap.has(key)) {
      martyrMap.set(key, {
        martyrId: wm.tempPersonId || '—',
        fullName: wm.fullNameSearch,
        firstName: wm.firstNameRaw,
        lastName: wm.lastNameRaw,
        gravePiece: wm.piece || '—',
        graveRow: wm.graveRow || '—',
        graveNumber: wm.graveNumber || '—',
        graveAddressDisplay: formatGraveAddress(wm.piece, wm.graveRow, wm.graveNumber),
        graveStatus: wm.graveStatus || 'شیت شهدای گلزار',
        sourceLabel: `${wm.sourceFile || 'مرجع'} / ${wm.sourceSheet || 'شهدای گلزار'}`,
      });
    }
  }

  // ۴. تکمیل از روی ارتباط‌های مستند کتاب‌ها بدون حذف هیچ رکوردی
  let autoMartyrSeq = 1;
  for (const book of dossiers) {
    for (const rel of book.martyrRelations) {
      if (!rel.martyrName || rel.martyrName === '*') continue;
      const key = compactPersianForMatch(rel.martyrName);
      if (!key) continue;
      if (!martyrMap.has(key)) {
        martyrMap.set(key, {
          martyrId: `SH-REL-${String(autoMartyrSeq++).padStart(4, '0')}`,
          fullName: rel.martyrName,
          gravePiece: rel.gravePiece || '—',
          graveRow: rel.graveRow || '—',
          graveNumber: rel.graveNumber || '—',
          graveAddressDisplay: formatGraveAddress(rel.gravePiece, rel.graveRow, rel.graveNumber),
          graveStatus: formatCertaintyLabel(rel.certainty),
          sourceLabel: `${rel.sourceFile || 'پژوهش'} / ${rel.sourceSheet || 'ارتباط کتاب و شهید'}`,
        });
      } else {
        const existing = martyrMap.get(key)!;
        if ((!existing.gravePiece || existing.gravePiece === '—') && rel.gravePiece && rel.gravePiece !== '—') {
          existing.gravePiece = rel.gravePiece;
        }
        if ((!existing.graveRow || existing.graveRow === '—') && rel.graveRow && rel.graveRow !== '—') {
          existing.graveRow = rel.graveRow;
        }
        if ((!existing.graveNumber || existing.graveNumber === '—') && rel.graveNumber && rel.graveNumber !== '—') {
          existing.graveNumber = rel.graveNumber;
        }
        existing.graveAddressDisplay = formatGraveAddress(
          existing.gravePiece,
          existing.graveRow,
          existing.graveNumber
        );
      }
    }
  }

  return {
    dossiers,
    martyrMap,
    copiesByBookId,
    extractedItems,
    links,
  };
}

interface StyledColumnSpec {
  header: string;
  key: string;
  width: number;
  isLongText?: boolean;
}

/**
 * ساخت شیت اکسل استاندارد با فونت فارسی Vazirmatn، راست‌به‌چپ، سرصفحه رسمی مرکز اسناد گلزار شهدای تهران،
 * قاب‌بندی کامل سلول‌ها، سطر عنوان متمایز، فیلتر ستون‌ها، تثبیت سطر عنوان و تنظیمات چاپ
 */
function buildStyledWorksheet(
  sheetTitle: string,
  reportTitle: string,
  columns: StyledColumnSpec[],
  dataRows: Record<string, string | number>[]
): XLSX.WorkSheet {
  const colCount = Math.max(1, columns.length);
  const dateDisplay = getPersianDateTimeDisplay();

  const headerBannerRow1 = [
    `مرکز اسناد گلزار شهدای تهران — ${reportTitle}`,
    ...Array(colCount - 1).fill(''),
  ];
  const headerBannerRow2 = [
    `عنوان برگه: ${sheetTitle}   |   تاریخ تولید گزارش: ${dateDisplay}   |   تعداد رکورد: ${toPersianDigits(
      dataRows.length
    )}`,
    ...Array(colCount - 1).fill(''),
  ];
  const tableHeaderRow = columns.map((c) => c.header);

  const matrix: (string | number)[][] = [
    headerBannerRow1,
    headerBannerRow2,
    tableHeaderRow,
  ];

  if (dataRows.length === 0) {
    const emptyRow = columns.map((_, idx) =>
      idx === 0 ? 1 : idx === 1 ? 'هیچ رکوردی در این بخش یافت نشد' : '—'
    );
    matrix.push(emptyRow);
  } else {
    for (const rowObj of dataRows) {
      matrix.push(
        columns.map((c) => {
          const val = rowObj[c.key];
          return val !== undefined && val !== null && val !== '' ? val : '—';
        })
      );
    }
  }

  const ws = XLSXStyle.utils.aoa_to_sheet(matrix);

  // ۱. راست‌به‌چپ (RTL) و تثبیت ۳ سطر اول (سرصفحه + عنوان ستون‌ها)
  ws['!views'] = [
    {
      rightToLeft: true,
      state: 'frozen',
      ySplit: 3,
      topLeftCell: 'A4',
      activeCell: 'A4',
    },
  ];

  // ۲. ادغام سلول‌های سرصفحه رسمی در سطر ۱ و ۲
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
  ];

  // ۳. عرض ستون‌ها
  ws['!cols'] = columns.map((c) => ({ wch: Math.max(10, c.width || 18) }));

  // ۴. ارتفاع سطرها (سرصفحه‌ها، هدر جدول و سطرهای داده)
  const rowsMeta: Array<{ hpt: number }> = [
    { hpt: 28 }, // سطر ۱: عنوان رسمی مرکز اسناد
    { hpt: 22 }, // سطر ۲: تاریخ و مشخصات گزارش
    { hpt: 26 }, // سطر ۳: عناوین ستون‌ها
  ];
  for (let i = 0; i < Math.max(1, dataRows.length); i++) {
    const rowObj = dataRows[i];
    const hasLongContent =
      rowObj &&
      columns.some(
        (c) => c.isLongText && String(rowObj[c.key] || '').length > 90
      );
    rowsMeta.push({ hpt: hasLongContent ? 48 : 24 });
  }
  ws['!rows'] = rowsMeta;

  // ۵. فیلتر خودکار روی سطر عنوان جدول (سطر ۳، اندیس ۲)
  const lastColLetter = XLSXStyle.utils.encode_col(colCount - 1);
  const totalSheetRows = matrix.length;
  ws['!autofilter'] = {
    ref: `A3:${lastColLetter}${totalSheetRows}`,
  };

  // ۶. تنظیمات چاپ (افقی Landscape برای جداول چندستونه و حاشیه‌های استاندارد)
  ws['!pageSetup'] = {
    orientation: colCount > 6 ? 'landscape' : 'portrait',
    paperSize: 9, // A4
    fitToWidth: 1,
    fitToHeight: 0,
  };
  ws['!margins'] = {
    left: 0.4,
    right: 0.4,
    top: 0.5,
    bottom: 0.5,
    header: 0.3,
    footer: 0.3,
  };

  // ۷. استایل‌دهی تمام سلول‌ها با فونت فارسی Vazirmatn و قاب‌بندی جدول
  const thinBorder = {
    top: { style: 'thin', color: { rgb: 'C8B69B' } },
    bottom: { style: 'thin', color: { rgb: 'C8B69B' } },
    left: { style: 'thin', color: { rgb: 'C8B69B' } },
    right: { style: 'thin', color: { rgb: 'C8B69B' } },
  };

  const titleBannerStyle = {
    font: { name: 'Vazirmatn', sz: 13, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '6B3E26' } },
    alignment: { horizontal: 'center', vertical: 'center', readingOrder: 2, wrapText: true },
    border: thinBorder,
  };

  const subBannerStyle = {
    font: { name: 'Vazirmatn', sz: 10, bold: true, color: { rgb: '332218' } },
    fill: { fgColor: { rgb: 'F5E6D3' } },
    alignment: { horizontal: 'right', vertical: 'center', readingOrder: 2, wrapText: true },
    border: thinBorder,
  };

  const tableHeaderStyle = {
    font: { name: 'Vazirmatn', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1E4D2B' } },
    alignment: { horizontal: 'center', vertical: 'center', readingOrder: 2, wrapText: true },
    border: {
      top: { style: 'medium', color: { rgb: '14361E' } },
      bottom: { style: 'medium', color: { rgb: '14361E' } },
      left: { style: 'thin', color: { rgb: 'A8D5B5' } },
      right: { style: 'thin', color: { rgb: 'A8D5B5' } },
    },
  };

  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < colCount; c++) {
      const cellRef = XLSXStyle.utils.encode_cell({ r, c });
      if (!ws[cellRef]) {
        ws[cellRef] = { t: 's', v: '' };
      }
      if (r === 0) {
        ws[cellRef].s = titleBannerStyle;
      } else if (r === 1) {
        ws[cellRef].s = subBannerStyle;
      } else if (r === 2) {
        ws[cellRef].s = tableHeaderStyle;
      } else {
        const isEvenDataRow = (r - 3) % 2 === 1;
        const colSpec = columns[c];
        const isFirstRowNumCol = c === 0;
        ws[cellRef].s = {
          font: {
            name: 'Vazirmatn',
            sz: 10,
            bold: isFirstRowNumCol,
            color: { rgb: '24303F' },
          },
          fill: {
            fgColor: { rgb: isEvenDataRow ? 'FAF6EE' : 'FFFFFF' },
          },
          alignment: {
            horizontal: isFirstRowNumCol ? 'center' : 'right',
            vertical: 'center',
            readingOrder: 2,
            wrapText: Boolean(colSpec?.isLongText) || true,
          },
          border: thinBorder,
        };
      }
    }
  }

  return ws;
}

/**
 * تولید و دانلود فایل Excel استاندارد و چندبرگه‌ای بر اساس فیلدها و برگه‌های انتخاب‌شده توسط کاربر
 * بدون تغییر یا حذف هیچ داده‌ای در پایگاه داده اصلی نرم‌افزار
 */
export function generateStandardizedMartyrCentricExcel(
  ctx: ExcelExportDatasetContext,
  selection: ExcelExportUserSelection
): { ok: boolean; fileName: string; sheetsCount: number; totalRowsExported: number } {
  const { dossiers, martyrMap, copiesByBookId, extractedItems } =
    resolveDossiersAndMartyrIndex(ctx);

  const hasField = (id: string) => selection.selectedFields.has(id);
  const wb = XLSXStyle.utils.book_new();
  if (!wb.Workbook) wb.Workbook = {};
  wb.Workbook.Views = [{ RTL: true }];

  let sheetsCreated = 0;
  let totalRowsExported = 0;

  // کمکی: بازیابی شناسه و اطلاعات شهید از روی نام
  const lookupMartyrMeta = (
    martyrName: string,
    fallbackPiece?: string,
    fallbackRow?: string,
    fallbackNum?: string,
    fallbackCertainty?: MartyrRelationCertainty
  ): StandardizedMartyrEntry => {
    const key = compactPersianForMatch(martyrName);
    const found = key ? martyrMap.get(key) : undefined;
    const piece = found?.gravePiece && found.gravePiece !== '—' ? found.gravePiece : fallbackPiece || '—';
    const row = found?.graveRow && found.graveRow !== '—' ? found.graveRow : fallbackRow || '—';
    const num = found?.graveNumber && found.graveNumber !== '—' ? found.graveNumber : fallbackNum || '—';
    return {
      martyrId: found?.martyrId || '—',
      fullName: martyrName || 'بدون نام شهید مشخص',
      fatherName: found?.fatherName || '—',
      birthDate: found?.birthDate || '—',
      martyrdomDate: found?.martyrdomDate || '—',
      operationOrLocation: found?.operationOrLocation || '—',
      gravePiece: piece,
      graveRow: row,
      graveNumber: num,
      graveAddressDisplay: formatGraveAddress(piece, row, num),
      graveStatus:
        found?.graveStatus ||
        (fallbackCertainty ? formatCertaintyLabel(fallbackCertainty) : '—'),
      sourceLabel: found?.sourceLabel || 'پژوهش مرکز اسناد',
    };
  };

  // ============================================================================
  // برگه ۱: فهرست اصلی کتاب‌ها (یک ردیف به ازای هر کتاب یکتا + خلاصه شهدای مرتبط)
  // ============================================================================
  if (selection.selectedSheets.has('main_books')) {
    const cols: StyledColumnSpec[] = [{ header: 'ردیف', key: 'row_num', width: 8 }];
    const pushIf = (id: string, customHeader?: string, customWidth?: number, isLong?: boolean) => {
      if (!hasField(id)) return;
      const meta = EXCEL_FIELDS_CATALOG.find((f) => f.id === id);
      cols.push({
        header: customHeader || meta?.label || id,
        key: id,
        width: customWidth || meta?.width || 20,
        isLongText: isLong ?? meta?.isLongText,
      });
    };

    pushIf('book_id');
    pushIf('book_title');
    pushIf('book_alt_title');
    pushIf('book_author');
    pushIf('book_publisher');
    pushIf('book_year');
    pushIf('book_edition');
    pushIf('book_isbn');
    pushIf('book_fipa');
    pushIf('book_reg_no');
    pushIf('book_subject_category');
    pushIf('physical_status');
    pushIf('shelf_code');
    pushIf('level_code');
    pushIf('location_code');
    pushIf('counted_copies');
    pushIf('copy_id');
    pushIf('relation_category');
    pushIf('related_martyrs_count');
    pushIf('martyr_name', 'اسامی شهدای مرتبط با کتاب', 36, true);
    pushIf('martyr_id', 'شناسه‌های شهدای مرتبط', 22);
    pushIf('grave_full_address', 'آدرس و محل مزار شهدای مرتبط', 38, true);
    pushIf('grave_piece', 'قطعه مزار شهدا', 16);
    pushIf('grave_row', 'ردیف مزار شهدا', 16);
    pushIf('grave_number', 'شماره مزار شهدا', 16);
    pushIf('martyr_relation_subject', 'موضوعات مرتبط با شهدا در کتاب', 38, true);
    pushIf('page_reference_raw', 'شماره صفحات مرتبط در کتاب', 28, true);
    pushIf('extracted_passages_count');
    pushIf('extracted_text', 'خلاصه متن‌های استخراج‌شده درباره شهدا', 55, true);
    pushIf('link_id', 'شناسه‌های ارتباط کتاب و شهید (RL)', 24);
    pushIf('relation_certainty', 'وضعیت قطعیت ارتباط‌ها', 24);
    pushIf('review_verification_status', 'وضعیت بررسی و تأیید', 24);
    pushIf('source_file_and_sheet', 'منبع اطلاعات کتاب و ارتباط', 30);
    pushIf('book_description');
    pushIf('reviewer_expert_note');

    const rows: Record<string, string | number>[] = dossiers.map((book, idx) => {
      const copies = copiesByBookId.get(book.bookId) || [];
      const copyIdsStr = copies.map((c) => c.copyId).join('، ') || '—';

      const martyrMetaList = book.martyrRelations.map((m) =>
        lookupMartyrMeta(m.martyrName, m.gravePiece, m.graveRow, m.graveNumber, m.certainty)
      );

      const martyrNamesSummary =
        book.martyrRelations.length === 0
          ? 'بدون ارتباط ثبت‌شده با شهید'
          : book.martyrRelations.map((m, i) => `${i + 1}. ${m.martyrName}`).join(' | ');

      const martyrIdsSummary =
        martyrMetaList.length === 0
          ? '—'
          : martyrMetaList.map((m) => m.martyrId).join(' | ');

      const graveAddressesSummary =
        book.martyrRelations.length === 0
          ? '—'
          : book.martyrRelations
              .map(
                (m) =>
                  `${m.martyrName}: ${formatGraveAddress(
                    m.gravePiece,
                    m.graveRow,
                    m.graveNumber
                  )}`
              )
              .join(' | ');

      const gravePiecesSummary =
        book.martyrRelations.map((m) => m.gravePiece).filter((v) => v && v !== '—').join('، ') || '—';
      const graveRowsSummary =
        book.martyrRelations.map((m) => m.graveRow).filter((v) => v && v !== '—').join('، ') || '—';
      const graveNumbersSummary =
        book.martyrRelations.map((m) => m.graveNumber).filter((v) => v && v !== '—').join('، ') || '—';

      const subjectsSummary =
        book.martyrRelations
          .map((m) => (m.sourceDescriptionRaw ? `${m.martyrName}: ${m.sourceDescriptionRaw}` : ''))
          .filter(Boolean)
          .join(' | ') ||
        (book.description && book.description !== '—' ? book.description : '—');

      const pagesSummary =
        book.martyrRelations
          .map((m) => (m.pageReference ? `${m.martyrName}: ${m.pageReference}` : ''))
          .filter(Boolean)
          .join(' | ') || '—';

      const extractedTextsSummary =
        book.extractedPassages.length === 0
          ? '—'
          : book.extractedPassages
              .map((ex) => `[${ex.martyrNameRaw} - ص ${ex.pageReferenceRaw}]: ${ex.extractedText}`)
              .join(' || ');

      const linkIdsSummary =
        book.martyrRelations.map((m) => m.linkId).join('، ') || '—';

      const certaintiesSummary =
        book.martyrRelations.length === 0
          ? '—'
          : Array.from(
              new Set(book.martyrRelations.map((m) => formatCertaintyLabel(m.certainty)))
            ).join('، ');

      const reviewStatusesSummary =
        book.martyrRelations.length === 0
          ? book.determinationStatusLabel
          : Array.from(new Set(book.martyrRelations.map((m) => m.rawStatus))).join('، ');

      const sourceSummary = `${book.originalExcelData.sourceFile} / ${book.originalExcelData.sourceSheet} (ردیف ${book.originalExcelData.sourceRow})`;

      return {
        row_num: idx + 1,
        book_id: book.bookId,
        book_title: book.title,
        book_alt_title: book.alternativeTitle || '—',
        book_author: book.author || '—',
        book_publisher: book.publisher || '—',
        book_year: book.year || '—',
        book_edition: book.edition || '—',
        book_isbn: book.isbn || '—',
        book_fipa: book.fipa || '—',
        book_reg_no: book.registrationNo || '—',
        book_subject_category: book.category || '—',
        physical_status:
          book.determinationStatusLabel || formatPhysicalStatusLabel(book.physicalStatus),
        shelf_code: book.shelf || '—',
        level_code: book.level || '—',
        location_code: book.locationCode || '—',
        counted_copies: book.countedCopies || '0',
        copy_id: copyIdsStr,
        relation_category: book.sheetCategory,
        related_martyrs_count: book.martyrRelations.length,
        martyr_name: martyrNamesSummary,
        martyr_id: martyrIdsSummary,
        grave_full_address: graveAddressesSummary,
        grave_piece: gravePiecesSummary,
        grave_row: graveRowsSummary,
        grave_number: graveNumbersSummary,
        martyr_relation_subject: subjectsSummary,
        page_reference_raw: pagesSummary,
        extracted_passages_count: book.extractedPassages.length,
        extracted_text: extractedTextsSummary,
        link_id: linkIdsSummary,
        relation_certainty: certaintiesSummary,
        review_verification_status: reviewStatusesSummary,
        source_file_and_sheet: sourceSummary,
        book_description: book.description || '—',
        reviewer_expert_note: book.notes || '—',
      };
    });

    const sheetMeta = EXCEL_SHEETS_CATALOG.find((s) => s.key === 'main_books')!;
    const ws = buildStyledWorksheet(sheetMeta.title, selection.reportTitle, cols, rows);
    XLSXStyle.utils.book_append_sheet(wb, ws, sheetMeta.sheetTabName);
    sheetsCreated++;
    totalRowsExported += rows.length;
  }

  // ============================================================================
  // برگه ۲: ارتباط کتاب و شهید (جدول میانی چندبه‌چند — هر ارتباط در یک ردیف مستقل)
  // ============================================================================
  if (selection.selectedSheets.has('book_martyr_relations')) {
    const cols: StyledColumnSpec[] = [{ header: 'ردیف', key: 'row_num', width: 8 }];
    const pushIf = (id: string, customHeader?: string, customWidth?: number, isLong?: boolean) => {
      if (!hasField(id)) return;
      const meta = EXCEL_FIELDS_CATALOG.find((f) => f.id === id);
      cols.push({
        header: customHeader || meta?.label || id,
        key: id,
        width: customWidth || meta?.width || 20,
        isLongText: isLong ?? meta?.isLongText,
      });
    };

    pushIf('link_id');
    pushIf('book_id');
    pushIf('book_title');
    pushIf('book_alt_title');
    pushIf('book_author');
    pushIf('book_publisher');
    pushIf('martyr_id');
    pushIf('martyr_name');
    pushIf('grave_full_address');
    pushIf('grave_piece');
    pushIf('grave_row');
    pushIf('grave_number');
    pushIf('grave_status');
    pushIf('relation_category');
    pushIf('book_subject_category');
    pushIf('martyr_relation_subject');
    pushIf('page_reference_raw');
    pushIf('extracted_text', 'متن استخراج‌شده درباره این شهید در این کتاب', 55, true);
    pushIf('relation_certainty');
    pushIf('review_verification_status');
    pushIf('source_file_and_sheet');
    pushIf('reviewer_expert_note');
    pushIf('location_code');
    pushIf('physical_status');

    const rows: Record<string, string | number>[] = [];
    let relIdx = 1;

    for (const book of dossiers) {
      if (book.martyrRelations.length === 0) {
        // حفظ کتاب‌های بدون شهید در صورت گزارش کتاب‌محور تا هیچ کتابی به خاطر نقص ارتباط حذف نشود
        if (selection.direction === 'book_to_martyr') {
          rows.push({
            row_num: relIdx++,
            link_id: 'بدون پیوند ثبت‌شده',
            book_id: book.bookId,
            book_title: book.title,
            book_alt_title: book.alternativeTitle || '—',
            book_author: book.author || '—',
            book_publisher: book.publisher || '—',
            martyr_id: '—',
            martyr_name: 'بدون ارتباط ثبت‌شده با شهید',
            grave_full_address: '—',
            grave_piece: '—',
            grave_row: '—',
            grave_number: '—',
            grave_status: '—',
            relation_category: book.sheetCategory,
            book_subject_category: book.category || '—',
            martyr_relation_subject: book.description || '—',
            page_reference_raw: '—',
            extracted_text: '—',
            relation_certainty: '—',
            review_verification_status: book.determinationStatusLabel,
            source_file_and_sheet: `${book.originalExcelData.sourceFile} / ${book.originalExcelData.sourceSheet}`,
            reviewer_expert_note: book.notes || '—',
            location_code: book.locationCode || '—',
            physical_status: book.determinationStatusLabel,
          });
        }
      } else {
        for (const rel of book.martyrRelations) {
          const mMeta = lookupMartyrMeta(
            rel.martyrName,
            rel.gravePiece,
            rel.graveRow,
            rel.graveNumber,
            rel.certainty
          );
          const matchingPassages = book.extractedPassages.filter(
            (ex) =>
              compactPersianForMatch(ex.martyrNameRaw) ===
              compactPersianForMatch(rel.martyrName)
          );
          const passageText =
            matchingPassages.length > 0
              ? matchingPassages.map((p) => p.extractedText).join(' | ')
              : '—';

          rows.push({
            row_num: relIdx++,
            link_id: rel.linkId,
            book_id: book.bookId,
            book_title: book.title,
            book_alt_title: book.alternativeTitle || '—',
            book_author: book.author || '—',
            book_publisher: book.publisher || '—',
            martyr_id: mMeta.martyrId,
            martyr_name: rel.martyrName,
            grave_full_address: mMeta.graveAddressDisplay,
            grave_piece: mMeta.gravePiece,
            grave_row: mMeta.graveRow,
            grave_number: mMeta.graveNumber,
            grave_status: mMeta.graveStatus,
            relation_category: rel.sourceSheetCategory,
            book_subject_category: book.category || '—',
            martyr_relation_subject: rel.sourceDescriptionRaw || book.description || '—',
            page_reference_raw: rel.pageReference || '—',
            extracted_text: passageText,
            relation_certainty: formatCertaintyLabel(rel.certainty),
            review_verification_status: rel.rawStatus || '—',
            source_file_and_sheet: `${rel.sourceFile} / ${rel.sourceSheet} (ردیف ${rel.sourceExcelRow})`,
            reviewer_expert_note: rel.reviewerNote || '—',
            location_code: book.locationCode || '—',
            physical_status: book.determinationStatusLabel,
          });
        }
      }
    }

    const sheetMeta = EXCEL_SHEETS_CATALOG.find((s) => s.key === 'book_martyr_relations')!;
    const ws = buildStyledWorksheet(sheetMeta.title, selection.reportTitle, cols, rows);
    XLSXStyle.utils.book_append_sheet(wb, ws, sheetMeta.sheetTabName);
    sheetsCreated++;
    totalRowsExported += rows.length;
  }

  // ============================================================================
  // برگه ۳: اطلاعات موضوعی و صفحات مرتبط
  // ============================================================================
  if (selection.selectedSheets.has('subjects_and_pages')) {
    const cols: StyledColumnSpec[] = [{ header: 'ردیف', key: 'row_num', width: 8 }];
    const pushIf = (id: string, customHeader?: string, customWidth?: number, isLong?: boolean) => {
      if (!hasField(id)) return;
      const meta = EXCEL_FIELDS_CATALOG.find((f) => f.id === id);
      cols.push({
        header: customHeader || meta?.label || id,
        key: id,
        width: customWidth || meta?.width || 20,
        isLongText: isLong ?? meta?.isLongText,
      });
    };

    pushIf('book_id');
    pushIf('book_title');
    pushIf('book_author');
    pushIf('book_publisher');
    pushIf('book_subject_category');
    pushIf('martyr_id');
    pushIf('martyr_name');
    pushIf('grave_full_address');
    pushIf('martyr_relation_subject');
    pushIf('extracted_content_type');
    pushIf('passage_section_title');
    pushIf('page_reference_raw');
    pushIf('page_range_normalized');
    pushIf('extracted_keywords');
    pushIf('link_id');
    pushIf('relation_certainty');
    pushIf('source_file_and_sheet');

    const rows: Record<string, string | number>[] = [];
    let spIdx = 1;

    for (const book of dossiers) {
      for (const rel of book.martyrRelations) {
        const mMeta = lookupMartyrMeta(
          rel.martyrName,
          rel.gravePiece,
          rel.graveRow,
          rel.graveNumber,
          rel.certainty
        );
        const matchingEx = book.extractedPassages.find(
          (ex) =>
            compactPersianForMatch(ex.martyrNameRaw) === compactPersianForMatch(rel.martyrName)
        );
        const pageNorm =
          matchingEx?.pageStartNormalized || matchingEx?.pageEndNormalized
            ? `${matchingEx.pageStartNormalized || ''} تا ${matchingEx.pageEndNormalized || ''}`.trim()
            : '—';

        rows.push({
          row_num: spIdx++,
          book_id: book.bookId,
          book_title: book.title,
          book_author: book.author || '—',
          book_publisher: book.publisher || '—',
          book_subject_category: book.category || '—',
          martyr_id: mMeta.martyrId,
          martyr_name: rel.martyrName,
          grave_full_address: mMeta.graveAddressDisplay,
          martyr_relation_subject: rel.sourceDescriptionRaw || book.description || '—',
          extracted_content_type: matchingEx?.contentType || 'معرفی و ارتباط پژوهشی',
          passage_section_title: matchingEx?.passageTitle || rel.sourceDescriptionRaw || '—',
          page_reference_raw: rel.pageReference || matchingEx?.pageReferenceRaw || '—',
          page_range_normalized: pageNorm,
          extracted_keywords: (matchingEx?.keywords || []).join('، ') || '—',
          link_id: rel.linkId,
          relation_certainty: formatCertaintyLabel(rel.certainty),
          source_file_and_sheet: `${rel.sourceFile} / ${rel.sourceSheet} (ردیف ${rel.sourceExcelRow})`,
        });
      }
    }

    const sheetMeta = EXCEL_SHEETS_CATALOG.find((s) => s.key === 'subjects_and_pages')!;
    const ws = buildStyledWorksheet(sheetMeta.title, selection.reportTitle, cols, rows);
    XLSXStyle.utils.book_append_sheet(wb, ws, sheetMeta.sheetTabName);
    sheetsCreated++;
    totalRowsExported += rows.length;
  }

  // ============================================================================
  // برگه ۴: متن‌های استخراج‌شده درباره شهدا
  // ============================================================================
  if (selection.selectedSheets.has('extracted_passages')) {
    const cols: StyledColumnSpec[] = [{ header: 'ردیف', key: 'row_num', width: 8 }];
    const pushIf = (id: string, customHeader?: string, customWidth?: number, isLong?: boolean) => {
      if (!hasField(id)) return;
      const meta = EXCEL_FIELDS_CATALOG.find((f) => f.id === id);
      cols.push({
        header: customHeader || meta?.label || id,
        key: id,
        width: customWidth || meta?.width || 20,
        isLongText: isLong ?? meta?.isLongText,
      });
    };

    pushIf('extracted_id');
    pushIf('book_id');
    pushIf('book_title');
    pushIf('book_author');
    pushIf('book_publisher');
    pushIf('martyr_id');
    pushIf('martyr_name');
    pushIf('grave_full_address');
    pushIf('grave_piece');
    pushIf('grave_row');
    pushIf('grave_number');
    pushIf('extracted_content_type');
    pushIf('passage_section_title');
    pushIf('page_reference_raw');
    pushIf('page_range_normalized');
    pushIf('extracted_text');
    pushIf('short_verified_quote');
    pushIf('extracted_keywords');
    pushIf('review_verification_status');
    pushIf('source_file_and_sheet');
    pushIf('reviewer_expert_note');

    // جمع‌آوری تمام متون استخراج‌شده مرتبط با کتاب‌های مجموعه فعلی
    const bookById = new Map<string, UnifiedBookDossier>();
    const bookByCompactTitle = new Map<string, UnifiedBookDossier>();
    for (const d of dossiers) {
      bookById.set(d.bookId, d);
      const ct = compactPersianForMatch(d.title);
      if (ct) bookByCompactTitle.set(ct, d);
    }

    const activeExtracts: ExtractedContentItem[] =
      ctx.dossiers && ctx.dossiers.length > 0
        ? Array.from(
            new Map(
              ctx.dossiers.flatMap((d) => d.extractedPassages).map((e) => [e.id, e])
            ).values()
          )
        : extractedItems;

    const rows: Record<string, string | number>[] = activeExtracts.map((ex, idx) => {
      const matchedBook =
        (ex.tempBookId ? bookById.get(ex.tempBookId) : undefined) ||
        bookByCompactTitle.get(compactPersianForMatch(ex.bookTitleRaw));
      const mMeta = lookupMartyrMeta(ex.martyrNameRaw, ex.gravePieceRaw);
      const pageNorm =
        ex.pageStartNormalized || ex.pageEndNormalized
          ? `${ex.pageStartNormalized || ''} تا ${ex.pageEndNormalized || ''}`.trim()
          : '—';

      return {
        row_num: idx + 1,
        extracted_id: ex.id,
        book_id: ex.tempBookId || matchedBook?.bookId || '—',
        book_title: matchedBook?.title || ex.bookTitleRaw || '—',
        book_author: matchedBook?.author || '—',
        book_publisher: ex.publisherRaw || matchedBook?.publisher || '—',
        martyr_id: mMeta.martyrId,
        martyr_name: ex.martyrNameRaw || '—',
        grave_full_address: mMeta.graveAddressDisplay,
        grave_piece: mMeta.gravePiece,
        grave_row: mMeta.graveRow,
        grave_number: mMeta.graveNumber,
        extracted_content_type: ex.contentType,
        passage_section_title: ex.passageTitle || '—',
        page_reference_raw: ex.pageReferenceRaw || '—',
        page_range_normalized: pageNorm,
        extracted_text: ex.extractedText || '—',
        short_verified_quote: ex.shortVerifiedQuote || '—',
        extracted_keywords: (ex.keywords || []).join('، ') || '—',
        review_verification_status: ex.reviewStatus,
        source_file_and_sheet: `${ex.sourceFile} / ${ex.sourceSheet} (ردیف ${ex.sourceRow})`,
        reviewer_expert_note: ex.researcherNote || '—',
      };
    });

    const sheetMeta = EXCEL_SHEETS_CATALOG.find((s) => s.key === 'extracted_passages')!;
    const ws = buildStyledWorksheet(sheetMeta.title, selection.reportTitle, cols, rows);
    XLSXStyle.utils.book_append_sheet(wb, ws, sheetMeta.sheetTabName);
    sheetsCreated++;
    totalRowsExported += rows.length;
  }

  // ============================================================================
  // برگه ۵: اطلاعات شهدای مرتبط (از شهید به کتاب — دوطرفه)
  // ============================================================================
  if (selection.selectedSheets.has('related_martyrs')) {
    const cols: StyledColumnSpec[] = [{ header: 'ردیف', key: 'row_num', width: 8 }];
    const pushIf = (id: string, customHeader?: string, customWidth?: number, isLong?: boolean) => {
      if (!hasField(id)) return;
      const meta = EXCEL_FIELDS_CATALOG.find((f) => f.id === id);
      cols.push({
        header: customHeader || meta?.label || id,
        key: id,
        width: customWidth || meta?.width || 20,
        isLongText: isLong ?? meta?.isLongText,
      });
    };

    pushIf('martyr_id');
    pushIf('martyr_name');
    pushIf('martyr_father_name');
    pushIf('martyr_dates');
    pushIf('martyr_operation');
    pushIf('grave_full_address');
    pushIf('grave_piece');
    pushIf('grave_row');
    pushIf('grave_number');
    pushIf('grave_status');
    pushIf('related_books_count');
    pushIf('book_id', 'شناسه‌های کتاب‌های مرتبط', 22);
    pushIf('book_title', 'کتاب یا کتاب‌های مرتبط با شهید', 38, true);
    pushIf('book_author', 'نویسندگان کتاب‌های مرتبط', 26, true);
    pushIf('book_publisher', 'ناشران کتاب‌های مرتبط', 24, true);
    pushIf('book_subject_category', 'موضوعات کتاب‌های مرتبط', 24);
    pushIf('martyr_relation_subject', 'موضوعات مرتبط با شهید در کتاب‌ها', 36, true);
    pushIf('page_reference_raw', 'شماره صفحات مرتبط در کتاب‌ها', 28, true);
    pushIf('extracted_passages_count');
    pushIf('extracted_text', 'متن استخراج‌شده از کتاب‌ها درباره شهید', 60, true);
    pushIf('link_id', 'شناسه‌های ارتباط (RL)', 22);
    pushIf('relation_certainty');
    pushIf('source_file_and_sheet', 'توضیحات و منبع ارتباط', 32, true);

    // ساخت نگاشت معکوس از شهید به کتاب‌ها و متون استخراج‌شده
    const booksByMartyrKey = new Map<
      string,
      Array<{ book: UnifiedBookDossier; rel: BookDossierMartyrRelation }>
    >();
    for (const book of dossiers) {
      for (const rel of book.martyrRelations) {
        if (!rel.martyrName || rel.martyrName === '*') continue;
        const mKey = compactPersianForMatch(rel.martyrName);
        if (!mKey) continue;
        const list = booksByMartyrKey.get(mKey) || [];
        list.push({ book, rel });
        booksByMartyrKey.set(mKey, list);
      }
    }

    const extractsByMartyrKey = new Map<string, ExtractedContentItem[]>();
    for (const ex of extractedItems) {
      const mKey = compactPersianForMatch(ex.martyrNameRaw);
      if (!mKey) continue;
      const list = extractsByMartyrKey.get(mKey) || [];
      list.push(ex);
      extractsByMartyrKey.set(mKey, list);
    }

    // اگر explicitMartyrsList داده شده باشد (مثلاً در خروجی جست‌وجوی بانک شهدا)، همان لیست مبناست؛
    // در غیر این صورت شهدای مرتبط با مجموعه کتاب‌های فعلی مبنا هستند.
    const targetMartyrs: StandardizedMartyrEntry[] =
      ctx.explicitMartyrsList && ctx.explicitMartyrsList.length > 0
        ? ctx.explicitMartyrsList
        : Array.from(martyrMap.values()).filter((m) =>
            booksByMartyrKey.has(compactPersianForMatch(m.fullName))
          );

    const rows: Record<string, string | number>[] = targetMartyrs.map((m, idx) => {
      const mKey = compactPersianForMatch(m.fullName);
      const linkedPairs = (mKey ? booksByMartyrKey.get(mKey) : undefined) || [];
      const linkedExtracts = (mKey ? extractsByMartyrKey.get(mKey) : undefined) || [];

      const bookIdsStr =
        linkedPairs.map((p) => p.book.bookId).join(' | ') || '—';
      const bookTitlesStr =
        linkedPairs.length === 0
          ? 'بدون کتاب ثبت‌شده در فهرست فعلی'
          : linkedPairs
              .map(
                (p, i) =>
                  `${i + 1}. ${p.book.title}${
                    p.rel.pageReference ? ` (ص ${p.rel.pageReference})` : ''
                  }`
              )
              .join(' | ');
      const authorsStr =
        Array.from(
          new Set(linkedPairs.map((p) => p.book.author).filter((a) => a && a !== 'ثبت‌نشده'))
        ).join('، ') || '—';
      const publishersStr =
        Array.from(
          new Set(linkedPairs.map((p) => p.book.publisher).filter((pub) => pub && pub !== 'ثبت‌نشده'))
        ).join('، ') || '—';
      const categoriesStr =
        Array.from(
          new Set(linkedPairs.map((p) => p.book.category).filter((c) => c && c !== '—'))
        ).join('، ') || '—';
      const subjectsStr =
        linkedPairs
          .map((p) =>
            p.rel.sourceDescriptionRaw
              ? `${p.book.title}: ${p.rel.sourceDescriptionRaw}`
              : ''
          )
          .filter(Boolean)
          .join(' | ') || '—';
      const pagesStr =
        linkedPairs
          .map((p) => `${p.book.title}: ${p.rel.pageReference || '—'}`)
          .join(' | ') || '—';
      const extractsStr =
        linkedExtracts.length === 0
          ? '—'
          : linkedExtracts
              .map((ex) => `[${ex.bookTitleRaw} - ص ${ex.pageReferenceRaw}]: ${ex.extractedText}`)
              .join(' || ');
      const linkIdsStr = linkedPairs.map((p) => p.rel.linkId).join('، ') || '—';
      const certaintiesStr =
        Array.from(
          new Set(linkedPairs.map((p) => formatCertaintyLabel(p.rel.certainty)))
        ).join('، ') || '—';
      const sourcesStr =
        linkedPairs
          .map((p) => `${p.rel.sourceFile}/${p.rel.sourceSheet}`)
          .filter(Boolean)
          .join(' | ') || m.sourceLabel;

      const datesStr =
        [
          m.birthDate && m.birthDate !== '—' ? `تولد: ${m.birthDate}` : '',
          m.martyrdomDate && m.martyrdomDate !== '—' ? `شهادت: ${m.martyrdomDate}` : '',
        ]
          .filter(Boolean)
          .join(' | ') || '—';

      return {
        row_num: idx + 1,
        martyr_id: m.martyrId || '—',
        martyr_name: m.fullName,
        martyr_father_name: m.fatherName || '—',
        martyr_dates: datesStr,
        martyr_operation: m.operationOrLocation || '—',
        grave_full_address: m.graveAddressDisplay,
        grave_piece: m.gravePiece || '—',
        grave_row: m.graveRow || '—',
        grave_number: m.graveNumber || '—',
        grave_status: m.graveStatus || '—',
        related_books_count: linkedPairs.length,
        book_id: bookIdsStr,
        book_title: bookTitlesStr,
        book_author: authorsStr,
        book_publisher: publishersStr,
        book_subject_category: categoriesStr,
        martyr_relation_subject: subjectsStr,
        page_reference_raw: pagesStr,
        extracted_passages_count: linkedExtracts.length,
        extracted_text: extractsStr,
        link_id: linkIdsStr,
        relation_certainty: certaintiesStr,
        source_file_and_sheet: sourcesStr,
      };
    });

    const sheetMeta = EXCEL_SHEETS_CATALOG.find((s) => s.key === 'related_martyrs')!;
    const ws = buildStyledWorksheet(sheetMeta.title, selection.reportTitle, cols, rows);
    XLSXStyle.utils.book_append_sheet(wb, ws, sheetMeta.sheetTabName);
    sheetsCreated++;
    totalRowsExported += rows.length;
  }

  // اگر کاربر برگه‌ای را انتخاب نکرده بود، حداقل برگه اول ساخته شود
  if (sheetsCreated === 0) {
    const fallbackSel: ExcelExportUserSelection = {
      ...selection,
      selectedSheets: new Set<ExcelSheetKey>(['main_books']),
    };
    return generateStandardizedMartyrCentricExcel(ctx, fallbackSel);
  }

  const safePrefix = (selection.fileNamePrefix || 'گزارش_مرکز_اسناد_گلزار_شهدا').replace(
    /[\\/:*?"<>|\s]+/g,
    '_'
  );
  const fileName = `${safePrefix}_${getPersianDateStamp()}.xlsx`;
  XLSXStyle.writeFile(wb, fileName);

  return {
    ok: true,
    fileName,
    sheetsCount: sheetsCreated,
    totalRowsExported,
  };
}
