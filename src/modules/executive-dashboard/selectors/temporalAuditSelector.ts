import { parseStrictTimestamp } from '../normalization';
import type {
  ExecutiveDashboardInputs,
  TemporalAuditResult,
  TemporalMonthlyBucket,
  TemporalSourceAudit,
} from '../types';

function auditDateValues<T>(
  sourceKey: TemporalSourceAudit['sourceKey'],
  label: string,
  items: T[],
  getDateValue: (item: T) => unknown,
  monthlyMap: Map<string, TemporalMonthlyBucket>
): TemporalSourceAudit {
  let validTimestampCount = 0;
  let missingTimestampCount = 0;
  let invalidTimestampCount = 0;

  for (const item of items) {
    const raw = getDateValue(item);
    const parsed = parseStrictTimestamp(raw);
    if (parsed.valid && parsed.calendarType && parsed.periodKey) {
      validTimestampCount += 1;
      const bucket = monthlyMap.get(parsed.periodKey) || {
        periodKey: parsed.periodKey,
        calendarType: parsed.calendarType,
        totalValidEvents: 0,
        bySource: {},
      };
      bucket.totalValidEvents += 1;
      bucket.bySource[sourceKey] = (bucket.bySource[sourceKey] || 0) + 1;
      monthlyMap.set(parsed.periodKey, bucket);
    } else if (parsed.reason === 'empty') {
      missingTimestampCount += 1;
    } else {
      invalidTimestampCount += 1;
    }
  }

  return {
    sourceKey,
    label,
    totalRecordsCount: items.length,
    validTimestampCount,
    missingTimestampCount,
    invalidTimestampCount,
  };
}

/**
 * ممیزی مستقل مهر زمان (Temporal Audit):
 * - تفکیک کامل رکوردهای تاریخی ذاتاً بدون تاریخ (اکسل کاتالوگ، شیت ارتباط، پیگیری‌ها، بانک گلزار)
 *   از رکوردهای دارای مهر زمان واقعی بدون افزودن event log یا تغییر در پایگاه داده.
 * - محاسبه توزیع عملکرد دوره‌ای منحصراً بر روی رکوردهای دارای مهر زمان معتبر.
 */
export function selectTemporalAudit(
  inputs: ExecutiveDashboardInputs
): TemporalAuditResult {
  const catalogRows = inputs.catalogRows || [];
  const links = inputs.links || [];
  const pendingReviews = inputs.pendingReviews || [];
  const golzarRecords = inputs.golzarRecords || [];

  const auditList = Object.values(inputs.auditRecords || {});
  const bookCopies = inputs.bookCopies || [];
  const locationHistoryEvents = bookCopies.flatMap((cp) => cp.locationHistory || []);
  const customMartyrs = inputs.customMartyrs || [];
  const extractedItems = inputs.extractedItems || [];
  const smartSuggestions = inputs.smartSuggestions || [];
  const rejectedSuggestions = inputs.rejectedSuggestionsArchive || [];
  const auditLogs = inputs.auditLogs || [];

  const monthlyMap = new Map<string, TemporalMonthlyBucket>();

  const timestampedSources: TemporalSourceAudit[] = [
    auditDateValues(
      'auditRecords',
      'رکوردهای ثبت و ویرایش میدانی کتاب‌ها (updatedAt)',
      auditList,
      (r) => r.updatedAt,
      monthlyMap
    ),
    auditDateValues(
      'bookCopies_observedDate',
      'تاریخ مشاهده نسخه‌های فیزیکی CP (observedDate)',
      bookCopies,
      (c) => c.observedDate,
      monthlyMap
    ),
    auditDateValues(
      'bookCopies_lastReviewedAt',
      'تاریخ آخرین بررسی نسخه‌های فیزیکی CP (lastReviewedAt)',
      bookCopies,
      (c) => c.lastReviewedAt,
      monthlyMap
    ),
    auditDateValues(
      'bookCopyLocationHistory',
      'تاریخچه جابه‌جایی قفسه نسخه‌های فیزیکی (movedAt)',
      locationHistoryEvents,
      (h) => h.movedAt,
      monthlyMap
    ),
    auditDateValues(
      'customMartyrs',
      'تاریخ ثبت پرونده‌های مستقل شهید (createdAt)',
      customMartyrs,
      (m) => m.createdAt,
      monthlyMap
    ),
    auditDateValues(
      'extractedItems',
      'تاریخ ثبت و بازبینی مطالب استخراج‌شده (updatedAt)',
      extractedItems,
      (e) => e.updatedAt,
      monthlyMap
    ),
    auditDateValues(
      'smartSuggestions_retrievedAt',
      'تاریخ دریافت پیشنهاد جست‌وجوی هوشمند (retrievedAt)',
      smartSuggestions,
      (s) => s.retrievedAt,
      monthlyMap
    ),
    auditDateValues(
      'smartSuggestions_reviewedAt',
      'تاریخ بررسی پیشنهاد جست‌وجوی هوشمند (reviewedAt)',
      smartSuggestions,
      (s) => s.reviewedAt,
      monthlyMap
    ),
    auditDateValues(
      'rejectedSuggestions',
      'تاریخ بایگانی پیشنهادهای ردشده (rejectedAt)',
      rejectedSuggestions,
      (r) => r.rejectedAt,
      monthlyMap
    ),
    auditDateValues(
      'auditLogs',
      'سابقه وقایع ثبت‌شده سامانه (timestamp)',
      auditLogs,
      (l) => l.timestamp,
      monthlyMap
    ),
  ];

  let totalTimestampEvaluatedRecords = 0;
  let totalValidTimestampRecords = 0;
  let totalMissingTimestampRecords = 0;
  let totalInvalidTimestampRecords = 0;

  for (const src of timestampedSources) {
    totalTimestampEvaluatedRecords += src.totalRecordsCount;
    totalValidTimestampRecords += src.validTimestampCount;
    totalMissingTimestampRecords += src.missingTimestampCount;
    totalInvalidTimestampRecords += src.invalidTimestampCount;
  }

  const monthlyActivity = Array.from(monthlyMap.values()).sort((a, b) =>
    a.periodKey.localeCompare(b.periodKey)
  );

  return {
    structurallyDatelessSources: {
      catalogRowsCount: catalogRows.length,
      linksCount: links.length,
      pendingReviewsCount: pendingReviews.length,
      golzarRecordsCount: golzarRecords.length,
      totalDatelessRecordsCount:
        catalogRows.length + links.length + pendingReviews.length + golzarRecords.length,
    },
    timestampedSources,
    totalTimestampEvaluatedRecords,
    totalValidTimestampRecords,
    totalMissingTimestampRecords,
    totalInvalidTimestampRecords,
    monthlyActivity,
    datelessLegacyExcludedFromPeriodicMetrics: true,
  };
}
