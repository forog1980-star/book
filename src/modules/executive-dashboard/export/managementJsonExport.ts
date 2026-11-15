import type {
  ExecutiveDashboardExportV1,
  ExecutiveDashboardInputs,
} from '../types';
import {
  buildExecutiveEntityProjection,
  type ExecutiveEntityProjection,
} from '../selectors/entityDossiersSelector';

function formatPersianExportDateStamp(): string {
  try {
    return new Date().toLocaleDateString('fa-IR').replace(/\//g, '-');
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function formatPersianExportDateTime(): string {
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

/**
 * ساخت خروجی استاندارد JSON اختصاصی داشبورد مدیریتی با اسکیمای مستقل ExecutiveDashboardExportV1
 * (کاملاً مجزا از FullBackupEnvelopeV3 و golzarteh-publish-package-v2.0)
 * همراه با حفظ کامل isbn، fipa، BK، RL، MR، Golzar ID، صفحات، موضوعات، extractedItems و pendingReviews.
 */
export function buildExecutiveDashboardExportV1(
  inputs: ExecutiveDashboardInputs,
  options: {
    appliedFilterNote?: string;
    projection?: ExecutiveEntityProjection;
  } = {}
): ExecutiveDashboardExportV1 {
  const projection = options.projection || buildExecutiveEntityProjection(inputs);
  const { summary, books, martyrs, relations } = projection;

  return {
    schema_id: 'ExecutiveDashboardExportV1',
    schema_version: '1.0.0',
    exportedAt: new Date().toISOString(),
    exportedAtFa: formatPersianExportDateTime(),
    appliedFilterNote: options.appliedFilterNote || 'کل اطلاعات پایه و عملیاتی داشبورد مدیریتی',
    kpisSnapshot: summary,
    books: books.map((b) => ({
      bookKey: b.bookKey,
      tempBookId: b.tempBookId,
      source: b.source,
      title: b.title,
      publisher: b.publisher,
      author: b.author,
      locationDisplay: b.locationDisplay,
      subjectCategory: b.subjectCategory,
      description: b.description,
      notes: b.notes,
      isbn: b.isbn,
      fipa: b.fipa,
      registrationNo: b.registrationNo,
      managerialStatus: b.managerialStatus,
      managerialStatusLabel: b.managerialStatusLabel,
      openTicketIds: b.openTicketIds,
      linkedMartyrKeys: Array.from(new Set(b.relations.map((r) => r.martyrKey))),
      linkedLinkIds: b.relations.map((r) => r.linkId),
    })),
    martyrs: martyrs.map((m) => ({
      martyrKey: m.martyrKey,
      displayCode: m.displayCode,
      customMartyrId: m.customMartyrId,
      golzarId: m.golzarId,
      fullName: m.fullName,
      normalizedName: m.normalizedName,
      fatherName: m.fatherName,
      gravePiece: m.gravePiece,
      graveRow: m.graveRow,
      graveNumber: m.graveNumber,
      graveAddress: m.graveAddress,
      tehranStatus: m.tehranStatus,
      identityStatus: m.identityStatus,
      homonymCountInBank: m.homonymCountInBank,
      linkedBookKeys: Array.from(new Set(m.linkedBooks.map((lb) => lb.bookKey))),
      discrepancyWarnings: m.discrepancyWarnings,
    })),
    relations,
    extractedItems: inputs.extractedItems || [],
    pendingReviews: inputs.pendingReviews || [],
  };
}

/**
 * دانلود فایل JSON مدیریتی (ExecutiveDashboardExportV1) با فرمت UTF-8 در مرورگر.
 */
export function downloadExecutiveDashboardJsonV1(
  inputs: ExecutiveDashboardInputs,
  options: {
    appliedFilterNote?: string;
    projection?: ExecutiveEntityProjection;
  } = {}
): {
  ok: boolean;
  fileName: string;
  recordCount: number;
  payload: ExecutiveDashboardExportV1;
  error?: string;
} {
  const payload = buildExecutiveDashboardExportV1(inputs, options);
  const fileName = `گزارش_مدیریتی_داشبورد_مرکز_اسناد_${formatPersianExportDateStamp()}.json`;
  const recordCount = payload.books.length + payload.martyrs.length + payload.relations.length;

  try {
    if (typeof document !== 'undefined' && typeof Blob !== 'undefined') {
      const jsonText = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    }
    return { ok: true, fileName, recordCount, payload };
  } catch (err) {
    return {
      ok: false,
      fileName,
      recordCount,
      payload,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
