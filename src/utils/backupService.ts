/**
 * سرویس جامع پشتیبان‌گیری و بازیابی کل سامانه (Directives #1, #2, #3, #20)
 * - پشتیبانی از نسخه ۳ (schemaVersion: 3) شامل هر ۱۱ مجموعه داده عملیاتی کاربر
 * - پشتیبانی کامل عقب‌رو از نسخه ۲ قدیمی (version: 2 با آرایه records)
 * - محاسبه Checksum کنترلی (FNV-1a) و شمارش رکوردها به تفکیک هر مجموعه
 * - پیش‌نمایش و گزارش تفاوت‌ها (رکوردهای جدید، تکراری، دارای تعارض) پیش از بازیابی
 * - پشتیبانی از ۲ حالت بازیابی: «بازیابی کامل (Replace)» و «ادغام امن (Safe Merge)» بدون بازنویسی رکوردهای جدیدتر
 * - بازگشت امن (Transactional Rollback) در صورت بروز خطا
 */

import {
  AuditLogEntry,
  BookCopyRecord,
  BookMartyrLinkRecord,
  CustomMartyrRecord,
  ExtractedContentItem,
  FieldAuditRecord,
  MultiMartyrGroupAudit,
  PendingReviewItem,
  SmartSearchSuggestion,
  UserRoleCode,
} from '../data/markazAsnadData';
import { OPERATIONAL_STORAGE_KEYS, saveOperationalData } from './indexedDbStorage';

export interface RejectedSuggestionRecord {
  id: string;
  martyrId: string;
  martyrName: string;
  bookTitle: string;
  bookId?: string;
  rejectedBy: string;
  rejectedAt: string;
  rejectionReason: string;
  updatedAt: number;
}

export interface UserSettingsPayload {
  activeRole: UserRoleCode;
  defaultShelfCode?: string;
  defaultLevelCode?: string;
}

export interface FullOperationalState {
  auditRecords: Record<string, FieldAuditRecord>;
  bookCopies: BookCopyRecord[];
  customMartyrs: CustomMartyrRecord[];
  smartSuggestions: SmartSearchSuggestion[];
  links: BookMartyrLinkRecord[];
  pendingReviews: PendingReviewItem[];
  multiMartyrGroups: MultiMartyrGroupAudit[];
  extractedItems: ExtractedContentItem[];
  auditLog: AuditLogEntry[];
  userSettings: UserSettingsPayload;
  rejectedSuggestionsArchive: RejectedSuggestionRecord[];
}

export interface CollectionCountSummary {
  auditRecords: number;
  bookCopies: number;
  customMartyrs: number;
  smartSuggestions: number;
  links: number;
  pendingReviews: number;
  multiMartyrGroups: number;
  extractedItems: number;
  auditLog: number;
  userSettings: number;
  rejectedSuggestionsArchive: number;
  totalOperationalItems: number;
}

export interface FullBackupEnvelopeV3 {
  schemaVersion: 3;
  version: 3;
  backupType: 'FULL_SYSTEM_BACKUP';
  appTitle: string;
  appVersion: string;
  exportedAt: string;
  exportedTimestamp: number;
  checksum: string;
  counts: CollectionCountSummary;
  datasets: FullOperationalState;
  // حفظ فیلد records در سطح ریشه برای سازگاری کامل با ابزارهای قدیمی
  records: FieldAuditRecord[];
}

export interface CollectionDiffReport {
  key: keyof FullOperationalState;
  label: string;
  currentCount: number;
  backupCount: number;
  newItemsCount: number;
  duplicateOrSameCount: number;
  conflictCount: number;
}

export interface BackupInspectionResult {
  valid: boolean;
  error?: string;
  detectedSchemaVersion: 2 | 3;
  isLegacyPartialBackup: boolean;
  exportedAt: string;
  appVersion: string;
  checksumValid: boolean;
  expectedChecksum?: string;
  computedChecksum?: string;
  collectionDiffs: CollectionDiffReport[];
  totalNewItems: number;
  totalConflicts: number;
  totalDuplicates: number;
  normalizedDatasets: Partial<FullOperationalState>;
}

/**
 * محاسبه Checksum قطعی FNV-1a 32-bit روی محتوای مجموعه‌ها
 */
export function computeDatasetsChecksum(datasets: Partial<FullOperationalState>): string {
  const orderedKeys: Array<keyof FullOperationalState> = [
    'auditRecords',
    'bookCopies',
    'customMartyrs',
    'smartSuggestions',
    'links',
    'pendingReviews',
    'multiMartyrGroups',
    'extractedItems',
    'auditLog',
    'userSettings',
    'rejectedSuggestionsArchive',
  ];
  const canonicalObj: Record<string, unknown> = {};
  for (const k of orderedKeys) {
    if (datasets[k] !== undefined) {
      canonicalObj[k] = datasets[k];
    }
  }
  const str = JSON.stringify(canonicalObj);
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `FNV1A-${(hash >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

export function calculateCollectionCounts(state: FullOperationalState): CollectionCountSummary {
  const auditRecordsCount = Object.keys(state.auditRecords || {}).length;
  const bookCopiesCount = (state.bookCopies || []).length;
  const customMartyrsCount = (state.customMartyrs || []).length;
  const smartSuggestionsCount = (state.smartSuggestions || []).length;
  const linksCount = (state.links || []).length;
  const pendingReviewsCount = (state.pendingReviews || []).length;
  const multiMartyrGroupsCount = (state.multiMartyrGroups || []).length;
  const extractedItemsCount = (state.extractedItems || []).length;
  const auditLogCount = (state.auditLog || []).length;
  const rejectedCount = (state.rejectedSuggestionsArchive || []).length;
  const userSettingsCount = state.userSettings ? 1 : 0;

  return {
    auditRecords: auditRecordsCount,
    bookCopies: bookCopiesCount,
    customMartyrs: customMartyrsCount,
    smartSuggestions: smartSuggestionsCount,
    links: linksCount,
    pendingReviews: pendingReviewsCount,
    multiMartyrGroups: multiMartyrGroupsCount,
    extractedItems: extractedItemsCount,
    auditLog: auditLogCount,
    userSettings: userSettingsCount,
    rejectedSuggestionsArchive: rejectedCount,
    totalOperationalItems:
      auditRecordsCount +
      bookCopiesCount +
      customMartyrsCount +
      smartSuggestionsCount +
      linksCount +
      pendingReviewsCount +
      multiMartyrGroupsCount +
      extractedItemsCount +
      auditLogCount +
      rejectedCount +
      userSettingsCount,
  };
}

/**
 * ساخت فایل پشتیبان کامل سامانه (نسخه ۳) شامل تمام ۱۱ مجموعه داده عملیاتی (بند ۱ دستور جامع)
 */
export function createFullSystemBackupEnvelope(
  state: FullOperationalState,
  appVersion = '3.5.0'
): FullBackupEnvelopeV3 {
  const now = new Date();
  const counts = calculateCollectionCounts(state);
  const checksum = computeDatasetsChecksum(state);

  return {
    schemaVersion: 3,
    version: 3,
    backupType: 'FULL_SYSTEM_BACKUP',
    appTitle: 'سامانه کتابخانه و پژوهش مرکز اسناد گلزار شهدا',
    appVersion,
    exportedAt: now.toISOString(),
    exportedTimestamp: now.getTime(),
    checksum,
    counts,
    datasets: state,
    records: Object.values(state.auditRecords || {}),
  };
}

function compareArrayCollection<T>(
  currentArr: T[],
  backupArr: T[],
  getId: (item: T) => string
): { newItemsCount: number; duplicateOrSameCount: number; conflictCount: number } {
  const currentMap = new Map<string, string>();
  for (const item of currentArr) {
    const id = getId(item);
    if (id) currentMap.set(id, JSON.stringify(item));
  }

  let newItemsCount = 0;
  let duplicateOrSameCount = 0;
  let conflictCount = 0;

  for (const item of backupArr) {
    const id = getId(item);
    if (!id || !currentMap.has(id)) {
      newItemsCount += 1;
    } else {
      const existingJson = currentMap.get(id);
      const backupJson = JSON.stringify(item);
      if (existingJson === backupJson) {
        duplicateOrSameCount += 1;
      } else {
        conflictCount += 1;
      }
    }
  }

  return { newItemsCount, duplicateOrSameCount, conflictCount };
}

function parseTimestamp(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string' && val.trim()) {
    const ms = Date.parse(val);
    if (!Number.isNaN(ms)) return ms;
  }
  return 0;
}

/**
 * اعتبارسنجی و پیش‌نمایش فایل پشتیبان پیش از بازیابی (بند ۲ دستور جامع)
 * پشتیبانی کامل از نسخه ۳ (۱۱ مجموعه داده) و نسخه ۲ قدیمی (فقط records)
 */
export function inspectBackupFile(
  rawJsonText: string,
  currentState: FullOperationalState
): BackupInspectionResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawJsonText);
  } catch {
    return {
      valid: false,
      error: 'ساختار فایل JSON نامعتبر است و قابل خواندن نیست.',
      detectedSchemaVersion: 3,
      isLegacyPartialBackup: false,
      exportedAt: 'نامشخص',
      appVersion: 'نامشخص',
      checksumValid: false,
      collectionDiffs: [],
      totalNewItems: 0,
      totalConflicts: 0,
      totalDuplicates: 0,
      normalizedDatasets: {},
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      valid: false,
      error: 'محتوای فایل پشتیبان یک شیء معتبر JSON نیست.',
      detectedSchemaVersion: 3,
      isLegacyPartialBackup: false,
      exportedAt: 'نامشخص',
      appVersion: 'نامشخص',
      checksumValid: false,
      collectionDiffs: [],
      totalNewItems: 0,
      totalConflicts: 0,
      totalDuplicates: 0,
      normalizedDatasets: {},
    };
  }

  // بررسی نسخه ۳ (پشتیبان کامل سامانه)
  if (parsed.schemaVersion === 3 || (parsed.datasets && typeof parsed.datasets === 'object')) {
    const ds = (parsed.datasets || {}) as Partial<FullOperationalState>;
    const expectedChecksum = typeof parsed.checksum === 'string' ? parsed.checksum : undefined;
    const computedChecksum = computeDatasetsChecksum(ds);
    const checksumValid = !expectedChecksum || expectedChecksum === computedChecksum;

    const normalized: Partial<FullOperationalState> = {
      auditRecords: ds.auditRecords && typeof ds.auditRecords === 'object' ? ds.auditRecords : {},
      bookCopies: Array.isArray(ds.bookCopies) ? ds.bookCopies : [],
      customMartyrs: Array.isArray(ds.customMartyrs) ? ds.customMartyrs : [],
      smartSuggestions: Array.isArray(ds.smartSuggestions) ? ds.smartSuggestions : [],
      links: Array.isArray(ds.links) ? ds.links : [],
      pendingReviews: Array.isArray(ds.pendingReviews) ? ds.pendingReviews : [],
      multiMartyrGroups: Array.isArray(ds.multiMartyrGroups) ? ds.multiMartyrGroups : [],
      extractedItems: Array.isArray(ds.extractedItems) ? ds.extractedItems : [],
      auditLog: Array.isArray(ds.auditLog) ? ds.auditLog : [],
      userSettings:
        ds.userSettings && typeof ds.userSettings === 'object'
          ? ds.userSettings
          : currentState.userSettings,
      rejectedSuggestionsArchive: Array.isArray(ds.rejectedSuggestionsArchive)
        ? ds.rejectedSuggestionsArchive
        : [],
    };

    const auditDiff = compareArrayCollection(
      Object.values(currentState.auditRecords || {}),
      Object.values(normalized.auditRecords || {}),
      r => r.key || r.tempBookId
    );
    const copiesDiff = compareArrayCollection(
      currentState.bookCopies || [],
      normalized.bookCopies || [],
      c => c.copyId
    );
    const martyrsDiff = compareArrayCollection(
      currentState.customMartyrs || [],
      normalized.customMartyrs || [],
      m => m.martyrId
    );
    const suggestionsDiff = compareArrayCollection(
      currentState.smartSuggestions || [],
      normalized.smartSuggestions || [],
      s => s.id
    );
    const linksDiff = compareArrayCollection(
      currentState.links || [],
      normalized.links || [],
      l => l.id
    );
    const pendingDiff = compareArrayCollection(
      currentState.pendingReviews || [],
      normalized.pendingReviews || [],
      p => p.trackingId
    );
    const groupsDiff = compareArrayCollection(
      currentState.multiMartyrGroups || [],
      normalized.multiMartyrGroups || [],
      g => g.groupCode
    );
    const extractedDiff = compareArrayCollection(
      currentState.extractedItems || [],
      normalized.extractedItems || [],
      e => e.id
    );
    const logDiff = compareArrayCollection(
      currentState.auditLog || [],
      normalized.auditLog || [],
      l => l.id
    );
    const rejectedDiff = compareArrayCollection(
      currentState.rejectedSuggestionsArchive || [],
      normalized.rejectedSuggestionsArchive || [],
      r => r.id || `${r.martyrName}::${r.bookTitle}`
    );

    const settingsSame =
      JSON.stringify(currentState.userSettings) === JSON.stringify(normalized.userSettings);

    const collectionDiffs: CollectionDiffReport[] = [
      {
        key: 'auditRecords',
        label: 'ثبت‌های میدانی قفسه و کتاب‌ها (auditRecords)',
        currentCount: Object.keys(currentState.auditRecords || {}).length,
        backupCount: Object.keys(normalized.auditRecords || {}).length,
        ...auditDiff,
      },
      {
        key: 'bookCopies',
        label: 'نسخه‌های فیزیکی مستقل (bookCopies - CP)',
        currentCount: (currentState.bookCopies || []).length,
        backupCount: (normalized.bookCopies || []).length,
        ...copiesDiff,
      },
      {
        key: 'customMartyrs',
        label: 'شهدای اضافه‌شده توسط کاربر (customMartyrs)',
        currentCount: (currentState.customMartyrs || []).length,
        backupCount: (normalized.customMartyrs || []).length,
        ...martyrsDiff,
      },
      {
        key: 'links',
        label: 'ارتباطات کتاب و شهید و مخزن نهایی (links)',
        currentCount: (currentState.links || []).length,
        backupCount: (normalized.links || []).length,
        ...linksDiff,
      },
      {
        key: 'pendingReviews',
        label: 'صف موارد نیازمند بررسی (pendingReviews)',
        currentCount: (currentState.pendingReviews || []).length,
        backupCount: (normalized.pendingReviews || []).length,
        ...pendingDiff,
      },
      {
        key: 'multiMartyrGroups',
        label: 'وضعیت ۱۶ گروه چندشهیدی (multiMartyrGroups)',
        currentCount: (currentState.multiMartyrGroups || []).length,
        backupCount: (normalized.multiMartyrGroups || []).length,
        ...groupsDiff,
      },
      {
        key: 'extractedItems',
        label: 'رکوردهای تفکیک‌شده چندشهیدی (extractedItems)',
        currentCount: (currentState.extractedItems || []).length,
        backupCount: (normalized.extractedItems || []).length,
        ...extractedDiff,
      },
      {
        key: 'smartSuggestions',
        label: 'پیشنهادهای جست‌وجوی تطبیقی (smartSuggestions)',
        currentCount: (currentState.smartSuggestions || []).length,
        backupCount: (normalized.smartSuggestions || []).length,
        ...suggestionsDiff,
      },
      {
        key: 'rejectedSuggestionsArchive',
        label: 'بایگانی موارد ردشده کارشناسی (rejectedArchive)',
        currentCount: (currentState.rejectedSuggestionsArchive || []).length,
        backupCount: (normalized.rejectedSuggestionsArchive || []).length,
        ...rejectedDiff,
      },
      {
        key: 'auditLog',
        label: 'تاریخچه عملیات سامانه (auditLog)',
        currentCount: (currentState.auditLog || []).length,
        backupCount: (normalized.auditLog || []).length,
        ...logDiff,
      },
      {
        key: 'userSettings',
        label: 'تنظیمات نقش و کاربر (userSettings)',
        currentCount: 1,
        backupCount: normalized.userSettings ? 1 : 0,
        newItemsCount: 0,
        duplicateOrSameCount: settingsSame ? 1 : 0,
        conflictCount: settingsSame ? 0 : 1,
      },
    ];

    const totalNewItems = collectionDiffs.reduce((s, c) => s + c.newItemsCount, 0);
    const totalConflicts = collectionDiffs.reduce((s, c) => s + c.conflictCount, 0);
    const totalDuplicates = collectionDiffs.reduce((s, c) => s + c.duplicateOrSameCount, 0);

    return {
      valid: true,
      detectedSchemaVersion: 3,
      isLegacyPartialBackup: false,
      exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : 'نامشخص',
      appVersion: typeof parsed.appVersion === 'string' ? parsed.appVersion : '3.x',
      checksumValid,
      expectedChecksum,
      computedChecksum,
      collectionDiffs,
      totalNewItems,
      totalConflicts,
      totalDuplicates,
      normalizedDatasets: normalized,
    };
  }

  // پشتیبانی عقب‌رو از نسخه ۲ قدیمی (که دارای فیلد records به صورت آرایه یا شیء بود)
  if (parsed.records && (Array.isArray(parsed.records) || typeof parsed.records === 'object')) {
    const legacyRecordsMap: Record<string, FieldAuditRecord> = {};
    if (Array.isArray(parsed.records)) {
      for (const item of parsed.records) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as FieldAuditRecord;
        const key = rec.key || rec.tempBookId;
        if (!key || !rec.title) {
          return {
            valid: false,
            error: 'رکورد نامعتبر یا ناقص در فایل پشتیبان نسخه ۲ قدیمی.',
            detectedSchemaVersion: 2,
            isLegacyPartialBackup: true,
            exportedAt: 'نامشخص',
            appVersion: '2.0',
            checksumValid: false,
            collectionDiffs: [],
            totalNewItems: 0,
            totalConflicts: 0,
            totalDuplicates: 0,
            normalizedDatasets: {},
          };
        }
        legacyRecordsMap[key] = rec;
      }
    } else {
      for (const [k, item] of Object.entries(parsed.records as Record<string, FieldAuditRecord>)) {
        if (!item || typeof item !== 'object' || (!item.key && !item.tempBookId)) {
          return {
            valid: false,
            error: `رکورد نامعتبر در کلید ${k} از فایل پشتیبان نسخه ۲ قدیمی.`,
            detectedSchemaVersion: 2,
            isLegacyPartialBackup: true,
            exportedAt: 'نامشخص',
            appVersion: '2.0',
            checksumValid: false,
            collectionDiffs: [],
            totalNewItems: 0,
            totalConflicts: 0,
            totalDuplicates: 0,
            normalizedDatasets: {},
          };
        }
        legacyRecordsMap[item.key || k] = item;
      }
    }

    const auditDiff = compareArrayCollection(
      Object.values(currentState.auditRecords || {}),
      Object.values(legacyRecordsMap),
      r => r.key || r.tempBookId
    );

    const collectionDiffs: CollectionDiffReport[] = [
      {
        key: 'auditRecords',
        label: 'ثبت‌های میدانی قفسه و کتاب‌ها (نسخه ۲ قدیمی)',
        currentCount: Object.keys(currentState.auditRecords || {}).length,
        backupCount: Object.keys(legacyRecordsMap).length,
        ...auditDiff,
      },
    ];

    return {
      valid: true,
      detectedSchemaVersion: 2,
      isLegacyPartialBackup: true,
      exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : 'نامشخص',
      appVersion: '2.0 (Legacy)',
      checksumValid: true,
      collectionDiffs,
      totalNewItems: auditDiff.newItemsCount,
      totalConflicts: auditDiff.conflictCount,
      totalDuplicates: auditDiff.duplicateOrSameCount,
      normalizedDatasets: {
        auditRecords: legacyRecordsMap,
      },
    };
  }

  return {
    valid: false,
    error: 'ساختار فایل پشتیبان شناخته نشد (فیلد datasets یا records یافت نشد).',
    detectedSchemaVersion: 3,
    isLegacyPartialBackup: false,
    exportedAt: 'نامشخص',
    appVersion: 'نامشخص',
    checksumValid: false,
    collectionDiffs: [],
    totalNewItems: 0,
    totalConflicts: 0,
    totalDuplicates: 0,
    normalizedDatasets: {},
  };
}

function mergeArrayByIdAndTimestamp<T>(
  currentArr: T[],
  incomingArr: T[],
  getId: (item: T) => string,
  getTimestamp?: (item: T) => number
): T[] {
  const map = new Map<string, T>();
  for (const item of currentArr) {
    const id = getId(item);
    if (id) map.set(id, item);
  }
  for (const incoming of incomingArr) {
    const id = getId(incoming);
    if (!id) continue;
    const existing = map.get(id);
    if (!existing) {
      map.set(id, incoming);
    } else if (getTimestamp) {
      const existingTs = getTimestamp(existing) || 0;
      const incomingTs = getTimestamp(incoming) || 0;
      // فقط اگر رکورد پشتیبان جدیدتر باشد، رکورد فعلی را به‌روزرسانی کن
      if (incomingTs > existingTs) {
        map.set(id, incoming);
      }
    }
  }
  return Array.from(map.values());
}

/**
 * اجرای بازیابی کامل یا ادغام امن همراه با تضمین بازگشت امن (Rollback) در صورت بروز خطا (بند ۲ دستور جامع)
 */
export async function executeBackupRestore(
  inspection: BackupInspectionResult,
  currentState: FullOperationalState,
  mode: 'merge' | 'replace'
): Promise<{
  ok: boolean;
  restoredState: FullOperationalState;
  error?: string;
  summaryMessage: string;
}> {
  if (!inspection.valid) {
    return {
      ok: false,
      restoredState: currentState,
      error: inspection.error || 'فایل پشتیبان معتبر نیست.',
      summaryMessage: 'بازیابی متوقف شد.',
    };
  }

  // تهیه Snapshot کامل از وضعیت فعلی برای Rollback در صورت خطا
  const snapshot: FullOperationalState = JSON.parse(JSON.stringify(currentState));
  const incoming = inspection.normalizedDatasets;

  try {
    let nextState: FullOperationalState;

    if (mode === 'replace' && !inspection.isLegacyPartialBackup) {
      // بازیابی کامل (Replace) برای نسخه ۳
      nextState = {
        auditRecords: incoming.auditRecords || {},
        bookCopies: incoming.bookCopies || [],
        customMartyrs: incoming.customMartyrs || [],
        smartSuggestions: incoming.smartSuggestions || [],
        links: incoming.links || [],
        pendingReviews: incoming.pendingReviews || [],
        multiMartyrGroups: incoming.multiMartyrGroups || [],
        extractedItems: incoming.extractedItems || [],
        auditLog: incoming.auditLog || [],
        userSettings: incoming.userSettings || currentState.userSettings,
        rejectedSuggestionsArchive: incoming.rejectedSuggestionsArchive || [],
      };
    } else if (mode === 'replace' && inspection.isLegacyPartialBackup) {
      // در فایل‌های نسخه ۲ قدیمی که فقط auditRecords دارند، فقط auditRecords جایگزین می‌شود و بقیه داده‌ها حفظ می‌شوند
      nextState = {
        ...currentState,
        auditRecords: incoming.auditRecords || {},
      };
    } else {
      // ادغام امن (Safe Merge): حفظ رکوردهای جدیدتر فعلی و افزودن رکوردهای جدید پشتیبان
      const mergedAuditRecords: Record<string, FieldAuditRecord> = { ...currentState.auditRecords };
      for (const [key, incRec] of Object.entries(incoming.auditRecords || {})) {
        const curRec = mergedAuditRecords[key];
        const incTs = parseTimestamp(incRec.updatedAt);
        const curTs = curRec ? parseTimestamp(curRec.updatedAt) : 0;
        if (!curRec || (incTs > 0 && incTs > curTs)) {
          mergedAuditRecords[key] = incRec;
        }
      }

      nextState = {
        auditRecords: mergedAuditRecords,
        bookCopies: mergeArrayByIdAndTimestamp(
          currentState.bookCopies || [],
          incoming.bookCopies || [],
          c => c.copyId
        ),
        customMartyrs: mergeArrayByIdAndTimestamp(
          currentState.customMartyrs || [],
          incoming.customMartyrs || [],
          m => m.martyrId,
          m => parseTimestamp(m.createdAt)
        ),
        smartSuggestions: mergeArrayByIdAndTimestamp(
          currentState.smartSuggestions || [],
          incoming.smartSuggestions || [],
          s => s.id
        ),
        links: mergeArrayByIdAndTimestamp(
          currentState.links || [],
          incoming.links || [],
          l => l.id
        ),
        pendingReviews: mergeArrayByIdAndTimestamp(
          currentState.pendingReviews || [],
          incoming.pendingReviews || [],
          p => p.trackingId
        ),
        multiMartyrGroups: mergeArrayByIdAndTimestamp(
          currentState.multiMartyrGroups || [],
          incoming.multiMartyrGroups || [],
          g => g.groupCode
        ),
        extractedItems: mergeArrayByIdAndTimestamp(
          currentState.extractedItems || [],
          incoming.extractedItems || [],
          e => e.id,
          e => parseTimestamp(e.extractedAt)
        ),
        auditLog: mergeArrayByIdAndTimestamp(
          currentState.auditLog || [],
          incoming.auditLog || [],
          l => l.id
        ),
        userSettings: incoming.userSettings || currentState.userSettings,
        rejectedSuggestionsArchive: mergeArrayByIdAndTimestamp(
          currentState.rejectedSuggestionsArchive || [],
          incoming.rejectedSuggestionsArchive || [],
          r => r.id || `${r.martyrName}::${r.bookTitle}`,
          r => r.updatedAt || 0
        ),
      };
    }

    // ذخیره تراکنشی در ذخیره‌ساز پایدار
    const now = Date.now();
    const saveResults = await Promise.all([
      saveOperationalData(OPERATIONAL_STORAGE_KEYS.auditRecords, nextState.auditRecords, now),
      saveOperationalData(OPERATIONAL_STORAGE_KEYS.bookCopies, nextState.bookCopies, now),
      saveOperationalData(OPERATIONAL_STORAGE_KEYS.customMartyrs, nextState.customMartyrs, now),
      saveOperationalData(OPERATIONAL_STORAGE_KEYS.smartSuggestions, nextState.smartSuggestions, now),
      saveOperationalData(OPERATIONAL_STORAGE_KEYS.links, nextState.links, now),
      saveOperationalData(OPERATIONAL_STORAGE_KEYS.pendingReviews, nextState.pendingReviews, now),
      saveOperationalData(OPERATIONAL_STORAGE_KEYS.multiMartyrGroups, nextState.multiMartyrGroups, now),
      saveOperationalData(OPERATIONAL_STORAGE_KEYS.extractedItems, nextState.extractedItems, now),
      saveOperationalData(OPERATIONAL_STORAGE_KEYS.auditLog, nextState.auditLog, now),
      saveOperationalData(
        OPERATIONAL_STORAGE_KEYS.rejectedSuggestions,
        nextState.rejectedSuggestionsArchive,
        now
      ),
    ]);

    const failedSave = saveResults.find(r => !r.ok);
    if (failedSave) {
      throw new Error(failedSave.error || `خطا در ذخیره مجموعه ${failedSave.key}`);
    }

    // ذخیره تنظیمات کاربر
    if (nextState.userSettings?.activeRole) {
      localStorage.setItem(OPERATIONAL_STORAGE_KEYS.userRole, nextState.userSettings.activeRole);
    }

    const modeLabel = mode === 'replace' ? 'بازیابی کامل (Replace)' : 'ادغام امن (Safe Merge)';
    return {
      ok: true,
      restoredState: nextState,
      summaryMessage: `${modeLabel} با موفقیت انجام شد (نسخه طرح‌واره: v${inspection.detectedSchemaVersion}، جدید: ${inspection.totalNewItems.toLocaleString('fa-IR')}، تعارض مدیریت‌شده: ${inspection.totalConflicts.toLocaleString('fa-IR')}).`,
    };
  } catch (err) {
    // Rollback به Snapshot قبلی
    const rollbackTs = Date.now();
    await Promise.all([
      saveOperationalData(OPERATIONAL_STORAGE_KEYS.auditRecords, snapshot.auditRecords, rollbackTs),
      saveOperationalData(OPERATIONAL_STORAGE_KEYS.bookCopies, snapshot.bookCopies, rollbackTs),
      saveOperationalData(OPERATIONAL_STORAGE_KEYS.customMartyrs, snapshot.customMartyrs, rollbackTs),
      saveOperationalData(OPERATIONAL_STORAGE_KEYS.smartSuggestions, snapshot.smartSuggestions, rollbackTs),
      saveOperationalData(OPERATIONAL_STORAGE_KEYS.links, snapshot.links, rollbackTs),
      saveOperationalData(OPERATIONAL_STORAGE_KEYS.pendingReviews, snapshot.pendingReviews, rollbackTs),
      saveOperationalData(OPERATIONAL_STORAGE_KEYS.multiMartyrGroups, snapshot.multiMartyrGroups, rollbackTs),
      saveOperationalData(OPERATIONAL_STORAGE_KEYS.extractedItems, snapshot.extractedItems, rollbackTs),
      saveOperationalData(OPERATIONAL_STORAGE_KEYS.auditLog, snapshot.auditLog, rollbackTs),
      saveOperationalData(
        OPERATIONAL_STORAGE_KEYS.rejectedSuggestions,
        snapshot.rejectedSuggestionsArchive,
        rollbackTs
      ),
    ]);

    return {
      ok: false,
      restoredState: snapshot,
      error: err instanceof Error ? err.message : String(err),
      summaryMessage: 'خطا در بازیابی؛ تمام داده‌ها به‌صورت خودکار به وضعیت پیش از بازیابی بازگردانده شدند (Rollback).',
    };
  }
}
