import {
  EXCEL_FIELDS_CATALOG,
  EXCEL_SHEETS_CATALOG,
  generateStandardizedMartyrCentricExcel,
  resolveDossiersAndMartyrIndex,
  type ExcelExportDatasetContext,
  type ExcelExportUserSelection,
  type ExcelSheetKey,
} from '../../excel-export';
import type { ExecutiveDashboardInputs } from '../types';

export interface ManagementExcelAdapterOptions {
  reportTitle?: string;
  fileNamePrefix?: string;
  selectedSheets?: ExcelSheetKey[];
  onlyTehranMartyrs?: boolean;
  /** برچسب فیلتر جاری برای ثبت در سابقه خروجی */
  appliedFilterLabel?: string;
}

const DEFAULT_MANAGEMENT_SHEETS: ExcelSheetKey[] = EXCEL_SHEETS_CATALOG.map((s) => s.key);

/**
 * ساخت انتخاب استاندارد و کامل مدیریتی روی موتور مشترک excelBuilderEngine
 * (تمام ۵ شیت، RTL، Vazirmatn، AutoFilter، Freeze Header، A4 و حفظ BK/RL/MR و شابک/فیپا/صفحات).
 */
export function buildManagementExcelPayload(
  inputs: ExecutiveDashboardInputs,
  options: ManagementExcelAdapterOptions = {}
): {
  context: ExcelExportDatasetContext;
  selection: ExcelExportUserSelection;
  resolvedStats: {
    dossiersCount: number;
    martyrsCount: number;
    linksCount: number;
  };
} {
  const reportTitle =
    options.reportTitle ||
    'گزارش جامع مدیریتی داشبورد مرکز اسناد (کتاب‌ها، شهدا، مزار، صفحات و متون استخراج‌شده)';
  const fileNamePrefix = options.fileNamePrefix || 'گزارش_مدیریتی_داشبورد_مرکز_اسناد';

  const context: ExcelExportDatasetContext = {
    reportTitle,
    fileNamePrefix,
    direction: 'book_to_martyr',
    mode: 'depository_comprehensive',
    presetId: 'full_comprehensive',
    catalogRows: inputs.catalogRows || [],
    auditRecords: inputs.auditRecords || {},
    bookCopies: inputs.bookCopies || [],
    links: inputs.links || [],
    extractedItems: inputs.extractedItems || [],
    customMartyrs: inputs.customMartyrs || [],
    pendingReviews: inputs.pendingReviews || [],
  };

  const selectedFields = new Set<string>(EXCEL_FIELDS_CATALOG.map((f) => f.id));
  const selectedSheets = new Set<ExcelSheetKey>(
    options.selectedSheets && options.selectedSheets.length > 0
      ? options.selectedSheets
      : DEFAULT_MANAGEMENT_SHEETS
  );

  const selection: ExcelExportUserSelection = {
    reportTitle,
    fileNamePrefix,
    direction: 'book_to_martyr',
    selectedFields,
    selectedSheets,
    onlyTehranMartyrs: Boolean(options.onlyTehranMartyrs),
  };

  const resolved = resolveDossiersAndMartyrIndex(context);
  return {
    context,
    selection,
    resolvedStats: {
      dossiersCount: resolved.dossiers.length,
      martyrsCount: resolved.martyrMap.size,
      linksCount: resolved.links.length,
    },
  };
}

/**
 * تولید خروجی اکسل مدیریتی با فراخوانی مستقیم موتور استاندارد پروژه (بدون دستکاری excelBuilderEngine.ts).
 */
export function exportExecutiveManagementExcel(
  inputs: ExecutiveDashboardInputs,
  options: ManagementExcelAdapterOptions = {}
): {
  ok: boolean;
  fileName: string;
  sheetsCount: number;
  totalRowsExported: number;
  error?: string;
} {
  try {
    const { context, selection } = buildManagementExcelPayload(inputs, options);
    const res = generateStandardizedMartyrCentricExcel(context, selection);
    return {
      ok: Boolean(res.ok),
      fileName: res.fileName,
      sheetsCount: res.sheetsCount,
      totalRowsExported: res.totalRowsExported,
    };
  } catch (err) {
    return {
      ok: false,
      fileName: '',
      sheetsCount: 0,
      totalRowsExported: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
