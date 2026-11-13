import type { BookMartyrLinkRecord, FieldAuditRecord } from '../../../data/markazAsnadData';
import {
  cleanOptionalField,
  compactPersian,
  isPlaceholderOrGroupMartyrPhrase,
  normalizePersian,
  stripMartyrHonorifics,
} from '../normalization';
import type {
  ExecutiveDashboardInputs,
  RelationAnalyticsResult,
  RelationCertaintyBucket,
  RelationKindValue,
} from '../types';

function emptyCertaintyCounts(): Record<RelationCertaintyBucket, number> {
  return {
    confirmedByExpert: 0,
    probable: 0,
    needsReview: 0,
    rejected: 0,
    undetermined: 0,
  };
}

const PRIORITY_ORDER: Record<RelationCertaintyBucket, number> = {
  confirmedByExpert: 5,
  probable: 4,
  needsReview: 3,
  undetermined: 2,
  rejected: 1,
};

function hasCompleteGraveInfo(lnk: BookMartyrLinkRecord): boolean {
  const p = cleanOptionalField(lnk.gravePieceRaw);
  const r = cleanOptionalField(lnk.graveRowRaw);
  const n = cleanOptionalField(lnk.graveNumberRaw);
  return Boolean(p && r && n && /\d/.test(p));
}

export function classifySingleLinkCertainty(
  lnk: BookMartyrLinkRecord,
  matchingAudit?: FieldAuditRecord
): RelationCertaintyBucket {
  const st = normalizePersian(lnk.reviewStatus);
  const note = normalizePersian(lnk.reviewerNote);
  const martyrNorm = stripMartyrHonorifics(lnk.martyrNameRaw);

  // ۱. ردشده: یا وضعیت صراحتاً «رد» دارد یا شهید در excludedMartyrs کتاب حذف شده است
  if (st.includes('رد')) {
    return 'rejected';
  }
  if (
    martyrNorm &&
    matchingAudit?.excludedMartyrs?.some((ex) => stripMartyrHonorifics(ex) === martyrNorm)
  ) {
    return 'rejected';
  }

  // ۲. ردیف‌های مبهم / * / گروهی هرگز «تأییدشده کارشناسی» نمی‌شوند مگر اول تفکیک نام شوند
  const isPlaceholderOrGroup = isPlaceholderOrGroupMartyrPhrase(
    lnk.martyrNameRaw,
    lnk.isGroupPhrase
  );
  if (isPlaceholderOrGroup) {
    return 'needsReview';
  }

  // ۳. تأییدشده توسط کارشناس (صراحتاً نیازمند برچسب صریح تأیید کارشناس است؛ صرف مزار کامل یا «قطعی» بودن کافی نیست)
  const isExplicitlyExpertLink =
    st === 'تاییدشده کارشناسی' ||
    st === 'تایید کارشناس' ||
    st === 'تاییدشده و افزودهشده به پرونده' ||
    st === 'تاییدشده و افزوده شده به پرونده';

  const hasExplicitLinkNeedsReview =
    st.includes('نیازمند') ||
    st.includes('تکمیل') ||
    st.includes('تفکیک') ||
    st.includes('تعارض') ||
    st.includes('در صف');

  if (isExplicitlyExpertLink) {
    return 'confirmedByExpert';
  }
  if (matchingAudit?.expertApproved === true && !hasExplicitLinkNeedsReview) {
    return 'confirmedByExpert';
  }

  // ۴. نیازمند بررسی
  if (hasExplicitLinkNeedsReview) {
    return 'needsReview';
  }

  // ۵. دارای مشخصات مزار یا پژوهش اولیه، اما بررسی‌نشده کارشناسی
  // (توجه مدیریتی فاز دوم: این گروه هرگز «تأیید کارشناسی» یا «احتمالی قطعی» محسوب نمی‌شود)
  if (
    st === 'احتمالی' ||
    st === 'بررسی شده در پژوهش اصلی' ||
    st === 'بررسی‌شده در پژوهش اصلی' ||
    st.includes('تطبیق کتاب') ||
    st.includes('احتمالی') ||
    note.includes('کاندید') ||
    hasCompleteGraveInfo(lnk) ||
    cleanOptionalField(lnk.gravePieceRaw).includes('تهرانی')
  ) {
    return 'probable';
  }

  // ۶. بررسی‌نشده بدون مشخصات مزار یا مدرک پژوهشی
  return 'undetermined';
}

function resolveLinkBookKey(
  lnk: BookMartyrLinkRecord,
  catalogIdSet: Set<string>
): string {
  const bid = (lnk.tempBookId || '').trim();
  if (bid && catalogIdSet.has(bid)) return `ID::${bid}`;
  if (bid) return `ID::${bid}`;
  const compTitle = compactPersian(lnk.bookTitleRaw);
  const compPub = compactPersian(lnk.publisherRaw);
  return `TITLE::${compTitle}::${compPub}`;
}

function classifyRelationKindStrict(lnk: BookMartyrLinkRecord): RelationKindValue {
  const explicit = (lnk as unknown as { relationKind?: string }).relationKind;
  const norm = normalizePersian(explicit);
  if (norm === 'کتاب اختصاصی شهید' || norm === 'dedicated') return 'کتاب اختصاصی شهید';
  if (norm === 'دارای بخش یا اشاره به شهید' || norm === 'mention' || norm === 'partial') {
    return 'دارای بخش یا اشاره به شهید';
  }
  return 'نامشخص';
}

/**
 * تحلیل‌گر مستقل روابط کتاب و شهید:
 * - تأیید کارشناسی فقط با وضعیت یا مدرک صریح کارشناسی شمارش می‌شود (۰ در داده پایه)
 * - گروه ۲۷۹ مورد با عنوان مدیریتی «دارای مشخصات مزار، اما بررسی‌نشده کارشناسی» نمایش داده می‌شود
 */
export function selectRelationAnalytics(
  inputs: ExecutiveDashboardInputs
): RelationAnalyticsResult {
  const catalogRows = inputs.catalogRows || [];
  const auditRecords = inputs.auditRecords || {};
  const links = inputs.links || [];
  const smartSuggestions = inputs.smartSuggestions || [];
  const rejectedSuggestionsArchive = inputs.rejectedSuggestionsArchive || [];

  const catalogIdSet = new Set<string>();
  const auditByBookId = new Map<string, FieldAuditRecord>();
  const auditByCompactTitle = new Map<string, FieldAuditRecord>();
  let excludedAuditMartyrCount = 0;

  for (const row of catalogRows) {
    if (row.tempBookId) catalogIdSet.add(row.tempBookId.trim());
  }
  for (const aud of Object.values(auditRecords)) {
    if (aud.tempBookId) auditByBookId.set(aud.tempBookId.trim(), aud);
    const ct = compactPersian(aud.title);
    if (ct) auditByCompactTitle.set(ct, aud);
    if (aud.excludedMartyrs?.length) {
      excludedAuditMartyrCount += aud.excludedMartyrs.length;
    }
  }

  const certaintyByRawRows = emptyCertaintyCounts();
  const distinctPairs = new Map<
    string,
    {
      bucket: RelationCertaintyBucket;
      bookKey: string;
      isPlaceholderOrGroup: boolean;
    }
  >();

  const relationKindBreakdown: Record<RelationKindValue, number> = {
    'کتاب اختصاصی شهید': 0,
    'دارای بخش یا اشاره به شهید': 0,
    نامشخص: 0,
  };

  const bookStats = new Map<
    string,
    {
      namedTargets: Set<string>;
      hasMultiMartyrSheetFlag: boolean;
      hasGroupOrPlaceholderOnly: boolean;
      hasExpertConfirmed: boolean;
    }
  >();

  for (let i = 0; i < links.length; i += 1) {
    const lnk = links[i];
    const bookKey = resolveLinkBookKey(lnk, catalogIdSet);
    const matchedAudit =
      (lnk.tempBookId ? auditByBookId.get(lnk.tempBookId.trim()) : undefined) ||
      auditByCompactTitle.get(compactPersian(lnk.bookTitleRaw));

    const bucket = classifySingleLinkCertainty(lnk, matchedAudit);
    certaintyByRawRows[bucket] += 1;

    const rKind = classifyRelationKindStrict(lnk);
    relationKindBreakdown[rKind] += 1;

    const isPlaceholderOrGroup = isPlaceholderOrGroupMartyrPhrase(
      lnk.martyrNameRaw,
      lnk.isGroupPhrase
    );
    const targetKey = isPlaceholderOrGroup
      ? `GROUP_OR_PLACEHOLDER::${lnk.id || i}`
      : `PERSON::${stripMartyrHonorifics(lnk.martyrNameRaw)}`;
    const pairKey = `${bookKey}::${targetKey}`;

    const existingPair = distinctPairs.get(pairKey);
    if (!existingPair || PRIORITY_ORDER[bucket] > PRIORITY_ORDER[existingPair.bucket]) {
      distinctPairs.set(pairKey, {
        bucket,
        bookKey,
        isPlaceholderOrGroup,
      });
    }

    if (bucket !== 'rejected') {
      const bStat = bookStats.get(bookKey) || {
        namedTargets: new Set<string>(),
        hasMultiMartyrSheetFlag: false,
        hasGroupOrPlaceholderOnly: false,
        hasExpertConfirmed: false,
      };
      if (lnk.sourceSheet === 'چند شهید' || lnk.isGroupPhrase) {
        bStat.hasMultiMartyrSheetFlag = true;
      }
      if (isPlaceholderOrGroup) {
        bStat.hasGroupOrPlaceholderOnly = true;
      } else {
        bStat.namedTargets.add(targetKey);
      }
      if (bucket === 'confirmedByExpert') {
        bStat.hasExpertConfirmed = true;
      }
      bookStats.set(bookKey, bStat);
    }
  }

  const certaintyByDistinctPairs = emptyCertaintyCounts();
  for (const pair of distinctPairs.values()) {
    certaintyByDistinctPairs[pair.bucket] += 1;
  }

  let totalBooksWithActiveLinks = 0;
  let booksWithNamedMartyrLinks = 0;
  let booksWithSingleNamedMartyr = 0;
  let booksWithMultiMartyrLinks = 0;
  let booksWithOnlyGroupOrPlaceholderLinks = 0;
  let booksWithExpertConfirmedLink = 0;

  for (const bStat of bookStats.values()) {
    totalBooksWithActiveLinks += 1;
    if (bStat.hasExpertConfirmed) {
      booksWithExpertConfirmedLink += 1;
    }
    const namedCount = bStat.namedTargets.size;
    if (namedCount > 0) {
      booksWithNamedMartyrLinks += 1;
      if (namedCount > 1 || bStat.hasMultiMartyrSheetFlag) {
        booksWithMultiMartyrLinks += 1;
      } else {
        booksWithSingleNamedMartyr += 1;
      }
    } else {
      booksWithOnlyGroupOrPlaceholderLinks += 1;
    }
  }

  const rejectedInSmartQueue = smartSuggestions.filter((s) =>
    normalizePersian(s.reviewStatus).includes('رد')
  ).length;

  return {
    totalRawLinkRows: links.length,
    distinctBookTargetPairsCount: distinctPairs.size,
    duplicatePairRowsCount: Math.max(0, links.length - distinctPairs.size),
    certaintyByRawRows,
    certaintyByDistinctPairs,
    rejectedArchiveSuggestionsCount: rejectedSuggestionsArchive.length + rejectedInSmartQueue,
    excludedAuditMartyrCount,
    relationKindBreakdown,
    booksWithLinksBreakdown: {
      totalBooksWithActiveLinks,
      booksWithNamedMartyrLinks,
      booksWithSingleNamedMartyr,
      booksWithMultiMartyrLinks,
      booksWithOnlyGroupOrPlaceholderLinks,
      booksWithExpertConfirmedLink,
    },
  };
}
