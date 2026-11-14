import type {
  AuditLogEntry,
  ExtractedContentItem,
  PendingReviewItem,
} from '../../../data/markazAsnadData';
import {
  classifyPendingReviewStatus,
  compactPersian,
  isPlaceholderOrGroupMartyrPhrase,
  normalizePersian,
  stripMartyrHonorifics,
} from '../normalization';
import type {
  DashboardBookListItem,
  DashboardDrilldownKey,
  DashboardMartyrListItem,
  DashboardRelationListItem,
  DrilldownContextMeta,
  ExecutiveDashboardInputs,
  ExecutiveExportHistoryRecord,
  RelationCertaintyBucket,
} from '../types';
import type { ExecutiveEntityProjection } from './entityDossiersSelector';

const PRIORITY_ORDER: Record<RelationCertaintyBucket, number> = {
  confirmedByExpert: 5,
  probable: 4,
  needsReview: 3,
  undetermined: 2,
  rejected: 1,
};

export interface DrilldownRelationRow {
  relation: DashboardRelationListItem;
  bookItem?: DashboardBookListItem;
  martyrItem?: DashboardMartyrListItem;
}

export interface DrilldownWorkRow {
  item: PendingReviewItem;
  isCompleted: boolean;
  activityTypeLabel: string;
  bookItem?: DashboardBookListItem;
  martyrItem?: DashboardMartyrListItem;
  relatedAuditLog?: AuditLogEntry;
}

export interface DrilldownResearchOutputRow {
  item: ExtractedContentItem;
  bookItem?: DashboardBookListItem;
  martyrItem?: DashboardMartyrListItem;
}

export type DrilldownSelectionResult =
  | {
      kind: 'books';
      meta: DrilldownContextMeta;
      items: DashboardBookListItem[];
      emptyReason: string;
    }
  | {
      kind: 'martyrs';
      meta: DrilldownContextMeta;
      items: DashboardMartyrListItem[];
      emptyReason: string;
    }
  | {
      kind: 'relations';
      meta: DrilldownContextMeta;
      items: DrilldownRelationRow[];
      emptyReason: string;
    }
  | {
      kind: 'work';
      meta: DrilldownContextMeta;
      items: DrilldownWorkRow[];
      emptyReason: string;
    }
  | {
      kind: 'research_outputs';
      meta: DrilldownContextMeta;
      items: DrilldownResearchOutputRow[];
      emptyReason: string;
    }
  | {
      kind: 'management_reports';
      meta: DrilldownContextMeta;
      items: ExecutiveExportHistoryRecord[];
      emptyReason: string;
    };

export const DRILLDOWN_META_MAP: Record<DashboardDrilldownKey, DrilldownContextMeta> = {
  library_all: {
    key: 'library_all',
    title: 'کل کتاب‌های تحت پایش کتابخانه',
    sourceCardLabel: 'کتابخانه',
    subtitle: 'فهرست کامل کتاب‌های فهرست مرجع و کتاب‌های ثبت‌شده خارج از فهرست اولیه',
    dataSourceNote: 'منبع: catalogRows و رکوردهای خارج از فهرست در auditRecords · بازکردن پرونده با شناسه پایدار bookKey / tempBookId',
  },
  library_completed: {
    key: 'library_completed',
    title: 'کتاب‌های بررسی‌شده و تکمیل‌شده',
    sourceCardLabel: 'کتابخانه',
    subtitle: 'کتاب‌هایی که بررسی آن‌ها تکمیل شده و هیچ پرونده باز کتاب در صف پیگیری ندارند',
    dataSourceNote: 'منبع: وضعیت بررسی میدانی/تأیید کارشناس بدون تیکت باز کتاب · بازکردن پرونده با شناسه پایدار bookKey / tempBookId',
  },
  library_remaining: {
    key: 'library_remaining',
    title: 'کتاب‌های باقی‌مانده برای بررسی',
    sourceCardLabel: 'کتابخانه',
    subtitle: 'شامل کتاب‌های بررسی‌نشده و کتاب‌های دارای تیکت باز تکرار عنوان یا پرچم نیازمند بررسی',
    dataSourceNote: 'منبع: کاتالوگ، وضعیت ممیزی میدانی و تیکت‌های باز کتاب در pendingReviews · بازکردن پرونده با شناسه پایدار bookKey / tempBookId',
  },
  martyrs_confirmed: {
    key: 'martyrs_confirmed',
    title: 'شهدای دارای هویت احرازشده',
    sourceCardLabel: 'شهدا',
    subtitle: 'شهدای مرتبط با کتاب‌ها که هویت و مشخصات آن‌ها بدون تعارض هم‌نامی احراز شده است (مستقل از تأیید کارشناسی رابطه با کتاب)',
    dataSourceNote: 'منبع: پیوندهای فعال شهدا تطبیق‌داده‌شده با بانک گلزار و پرونده‌های دستی · بازکردن پرونده با شناسه شهید یا مشخصات یکتا',
  },
  martyrs_needs_verification: {
    key: 'martyrs_needs_verification',
    title: 'شهدای نیازمند احراز هویت',
    sourceCardLabel: 'شهدا',
    subtitle: 'شهدای مرتبط با کتاب‌ها که فاقد مختصات قطعی مزار یا دارای هم‌نامی و نیازمند بررسی هویت هستند',
    dataSourceNote: 'منبع: پیوندهای فعال فاقد احراز قطعی یا دارای هشدار هم‌نامی/مزار · بازکردن پرونده برای تطبیق بدون ادغام خودکار',
  },
  relations_confirmed: {
    key: 'relations_confirmed',
    title: 'ارتباط‌های تأییدشده کارشناسی کتاب و شهید',
    sourceCardLabel: 'شهدا',
    subtitle: 'روابط متمایزی که به‌طور صریح به وضعیت «تأییدشده کارشناسی» رسیده‌اند',
    dataSourceNote: 'منبع: رکوردهای جدول ارتباط کتاب و شهید (links) با وضعیت تأیید کارشناسی · ورود مستقیم به پرونده کتاب و شهید',
  },
  relations_needs_review: {
    key: 'relations_needs_review',
    title: 'ارتباط‌های نیازمند بررسی کارشناسی',
    sourceCardLabel: 'شهدا',
    subtitle: 'روابط متمایزی که دارای برچسب نیازمند بررسی، تکمیل اطلاعات، تفکیک گروهی یا تعارض هستند',
    dataSourceNote: 'منبع: رکوردهای جدول ارتباط کتاب و شهید (links) در وضعیت نیازمند بررسی · ورود به پرونده هر دو طرف',
  },
  work_completed: {
    key: 'work_completed',
    title: 'کارهای انجام‌شده در صف پیگیری',
    sourceCardLabel: 'وضعیت کار و خروجی‌ها',
    subtitle: 'موارد صف پیگیری (PV) که بررسی آن‌ها تکمیل، بسته یا با دلیل رد شده است',
    dataSourceNote: 'منبع: pendingReviews در وضعیت‌های بسته/بررسی‌شده همراه با تطبیق کتاب، شهید و رخداد مرتبط در auditLog',
  },
  work_remaining: {
    key: 'work_remaining',
    title: 'موارد باقیمانده در صف پیگیری',
    sourceCardLabel: 'وضعیت کار و خروجی‌ها',
    subtitle: 'موارد باز یا در حال پیگیری در جدول «موارد نیازمند بررسی» (PV)',
    dataSourceNote: 'منبع: pendingReviews غیربسته · اتصال خودکار رکورد به پرونده کتاب و شهید از طریق شناسه اصلی (BK / RL)',
  },
  research_outputs: {
    key: 'research_outputs',
    title: 'خروجی‌های پژوهشی ثبت‌شده',
    sourceCardLabel: 'وضعیت کار و خروجی‌ها',
    subtitle: 'مطالب، خاطرات و ارجاعات صفحه استخراج‌شده از کتاب‌ها (به تفکیک کتاب و شهید مرتبط)',
    dataSourceNote: 'منبع: extractedItems غیرردشده · ورود مستقیم به پرونده کتاب و شهید مرتبط',
  },
  management_reports: {
    key: 'management_reports',
    title: 'گزارش‌های مدیریتی صادرشده',
    sourceCardLabel: 'وضعیت کار و خروجی‌ها',
    subtitle: 'فهرست گزارش‌های اکسل و JSON مدیریتی که تاکنون در سابقه این دستگاه ثبت شده‌اند',
    dataSourceNote: 'منبع: حافظه محلی book_executive_export_history_v1 (فراداده گزارش‌های صادرشده)',
  },
};

function isClosedTicketStatus(status: unknown): boolean {
  return classifyPendingReviewStatus(status) === 'resolved';
}

/**
 * استخراج فهرست متمایز روابط مطابق دقیق شمارش کارت شهدا (certaintyByDistinctPairs)
 */
function buildDistinctRelationRows(
  projection: ExecutiveEntityProjection
): DrilldownRelationRow[] {
  const bookByKey = new Map(projection.books.map((b) => [b.bookKey, b]));
  const bookByTempId = new Map(projection.books.map((b) => [b.tempBookId, b]));
  const martyrByKey = new Map(projection.martyrs.map((m) => [m.martyrKey, m]));

  const distinctMap = new Map<string, DashboardRelationListItem>();

  for (const rel of projection.relations) {
    const cleanBookPart = rel.tempBookId && rel.tempBookId !== '—'
      ? `ID::${rel.tempBookId}`
      : `TITLE::${compactPersian(rel.bookTitle)}::${compactPersian(rel.publisher)}`;
    const normMartyr = stripMartyrHonorifics(rel.martyrName);
    const targetPart =
      rel.isPlaceholderOrGroup || !normMartyr
        ? `GROUP_OR_PLACEHOLDER::${rel.linkId}`
        : `PERSON::${normMartyr}`;
    const pairKey = `${cleanBookPart}::${targetPart}`;

    const existing = distinctMap.get(pairKey);
    if (
      !existing ||
      PRIORITY_ORDER[rel.certaintyBucket] > PRIORITY_ORDER[existing.certaintyBucket]
    ) {
      distinctMap.set(pairKey, rel);
    }
  }

  return Array.from(distinctMap.values()).map((rel) => {
    const bookItem =
      bookByKey.get(rel.bookKey) ||
      (rel.tempBookId && rel.tempBookId !== '—'
        ? bookByTempId.get(rel.tempBookId)
        : undefined);
    const martyrItem = !rel.isPlaceholderOrGroup
      ? martyrByKey.get(rel.martyrKey)
      : undefined;
    return { relation: rel, bookItem, martyrItem };
  });
}

/**
 * سلکتور یکپارچه و زنده تمام ۱۱ مسیر جزئیات سه‌کادره داشبورد
 * بدون تکثیر داده یا تغییر منطق آمار پایه
 */
export function selectDrilldownData(
  key: DashboardDrilldownKey,
  inputs: ExecutiveDashboardInputs,
  projection: ExecutiveEntityProjection,
  exportHistory: ExecutiveExportHistoryRecord[] = []
): DrilldownSelectionResult {
  const meta = DRILLDOWN_META_MAP[key];

  if (key === 'library_all') {
    return {
      kind: 'books',
      meta,
      items: projection.books,
      emptyReason: 'اطلاعات جزئیات در دسترس نیست (هیچ کتابی در مخزن بارگذاری نشده است).',
    };
  }

  if (key === 'library_completed') {
    return {
      kind: 'books',
      meta,
      items: projection.books.filter(
        (b) => b.managerialStatus === 'completed_without_ticket'
      ),
      emptyReason:
        'اطلاعات جزئیات در دسترس نیست (هنوز کتابی بدون پرونده باز در وضعیت تکمیل‌شده قرار نگرفته است).',
    };
  }

  if (key === 'library_remaining') {
    return {
      kind: 'books',
      meta,
      items: projection.books.filter(
        (b) => b.managerialStatus !== 'completed_without_ticket'
      ),
      emptyReason:
        'اطلاعات جزئیات در دسترس نیست (همه کتاب‌های پایش‌شده تعیین‌تکلیف شده‌اند).',
    };
  }

  if (key === 'martyrs_confirmed') {
    return {
      kind: 'martyrs',
      meta,
      items: projection.martyrs.filter(
        (m) => m.linkedBooksCount > 0 && m.identityStatus === 'confirmed'
      ),
      emptyReason:
        'اطلاعات جزئیات در دسترس نیست (هیچ شهید مرتبطی در وضعیت هویت احرازشده یافت نشد).',
    };
  }

  if (key === 'martyrs_needs_verification') {
    return {
      kind: 'martyrs',
      meta,
      items: projection.martyrs.filter(
        (m) => m.linkedBooksCount > 0 && m.identityStatus === 'needs_verification'
      ),
      emptyReason:
        'اطلاعات جزئیات در دسترس نیست (هیچ شهید مرتبطی در صف نیازمند احراز هویت قرار ندارد).',
    };
  }

  if (key === 'relations_confirmed' || key === 'relations_needs_review') {
    const distinctRows = buildDistinctRelationRows(projection);
    const targetBucket: RelationCertaintyBucket =
      key === 'relations_confirmed' ? 'confirmedByExpert' : 'needsReview';
    const filtered = distinctRows.filter(
      (row) => row.relation.certaintyBucket === targetBucket
    );
    return {
      kind: 'relations',
      meta,
      items: filtered,
      emptyReason:
        key === 'relations_confirmed'
          ? 'اطلاعات جزئیات در دسترس نیست (هنوز هیچ ارتباط کتاب و شهیدی به تأیید صریح کارشناسی نرسیده است).'
          : 'اطلاعات جزئیات در دسترس نیست (هیچ ارتباط نیازمند بررسی کارشناسی یافت نشد).',
    };
  }

  const bookByKey = new Map(projection.books.map((b) => [b.bookKey, b]));
  const bookByTempId = new Map(projection.books.map((b) => [b.tempBookId, b]));
  const bookByCompactTitle = new Map<string, DashboardBookListItem>();
  for (const b of projection.books) {
    const ct = compactPersian(b.title);
    if (ct && !bookByCompactTitle.has(ct)) {
      bookByCompactTitle.set(ct, b);
    }
  }
  const martyrByKey = new Map(projection.martyrs.map((m) => [m.martyrKey, m]));
  const martyrByNormName = new Map<string, DashboardMartyrListItem>();
  for (const m of projection.martyrs) {
    if (m.normalizedName && !martyrByNormName.has(m.normalizedName)) {
      martyrByNormName.set(m.normalizedName, m);
    }
  }
  const relationByLinkId = new Map(
    projection.relations.map((r) => [r.linkId, r])
  );

  if (key === 'work_completed' || key === 'work_remaining') {
    const wantCompleted = key === 'work_completed';
    const pendingReviews = inputs.pendingReviews || [];
    const auditLogs = inputs.auditLogs || [];

    const rows: DrilldownWorkRow[] = [];
    for (const pv of pendingReviews) {
      const closed = isClosedTicketStatus(pv.trackingStatus);
      if (wantCompleted !== closed) continue;

      const recId = (pv.mainRecordId || '').trim();
      const linkedRel = recId ? relationByLinkId.get(recId) : undefined;

      const bookItem =
        (recId ? bookByTempId.get(recId) : undefined) ||
        (linkedRel ? bookByKey.get(linkedRel.bookKey) || bookByTempId.get(linkedRel.tempBookId) : undefined) ||
        (pv.bookTitle ? bookByCompactTitle.get(compactPersian(pv.bookTitle)) : undefined);

      let martyrItem: DashboardMartyrListItem | undefined;
      if (linkedRel && !linkedRel.isPlaceholderOrGroup) {
        martyrItem = martyrByKey.get(linkedRel.martyrKey);
      } else if (
        pv.nameOrPhrase &&
        !isPlaceholderOrGroupMartyrPhrase(pv.nameOrPhrase, false)
      ) {
        const cleanName = stripMartyrHonorifics(pv.nameOrPhrase);
        if (cleanName) martyrItem = martyrByNormName.get(cleanName);
      }

      const relatedAuditLog = auditLogs.find((log) => {
        const tid = log.targetId || '';
        return (
          (pv.trackingId && tid.includes(pv.trackingId)) ||
          (recId && tid.includes(recId)) ||
          (bookItem?.tempBookId && tid.includes(bookItem.tempBookId))
        );
      });

      const activityTypeLabel =
        pv.mainSheet === 'فهرست کتاب‌ها'
          ? 'تعیین‌تکلیف پرونده کتاب'
          : pv.mainSheet === 'ارتباط کتاب و شهید'
          ? 'بررسی ارتباط کتاب و شهید'
          : pv.mainSheet || 'پیگیری کارشناسی';

      rows.push({
        item: pv,
        isCompleted: closed,
        activityTypeLabel,
        bookItem,
        martyrItem,
        relatedAuditLog,
      });
    }

    return {
      kind: 'work',
      meta,
      items: rows,
      emptyReason: wantCompleted
        ? 'اطلاعات جزئیات در دسترس نیست (هنوز هیچ موردی در صف پیگیری به وضعیت «بررسی‌شده/بسته» نرسیده است).'
        : 'اطلاعات جزئیات در دسترس نیست (هیچ مورد باقیمانده‌ای در صف پیگیری وجود ندارد).',
    };
  }

  if (key === 'research_outputs') {
    const activeItems = (inputs.extractedItems || []).filter(
      (ex) => !normalizePersian(ex.reviewStatus).includes('رد')
    );

    const rows: DrilldownResearchOutputRow[] = activeItems.map((ex) => {
      const tid = (ex.tempBookId || '').trim();
      const bookItem =
        (tid ? bookByTempId.get(tid) : undefined) ||
        (ex.bookTitleRaw
          ? bookByCompactTitle.get(compactPersian(ex.bookTitleRaw))
          : undefined);
      const isPlaceholder = isPlaceholderOrGroupMartyrPhrase(
        ex.martyrNameRaw,
        false
      );
      const normName = isPlaceholder
        ? ''
        : stripMartyrHonorifics(ex.martyrNameRaw);
      const martyrItem = normName ? martyrByNormName.get(normName) : undefined;
      return { item: ex, bookItem, martyrItem };
    });

    return {
      kind: 'research_outputs',
      meta,
      items: rows,
      emptyReason:
        'اطلاعات جزئیات در دسترس نیست (تاکنون خروجی پژوهشی فعالی در بخش مطالب استخراج‌شده ثبت نشده است).',
    };
  }

  return {
    kind: 'management_reports',
    meta,
    items: exportHistory,
    emptyReason:
      'اطلاعات جزئیات در دسترس نیست (تاکنون گزارش مدیریتی در سابقه این دستگاه صادر یا ثبت نشده است).',
  };
}
