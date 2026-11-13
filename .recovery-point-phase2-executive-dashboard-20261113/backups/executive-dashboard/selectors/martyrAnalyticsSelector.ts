import {
  cleanOptionalField,
  classifyGolzarRowType,
  isPlaceholderOrGroupMartyrPhrase,
  normalizePersian,
  stripMartyrHonorifics,
} from '../normalization';
import type { ExecutiveDashboardInputs, MartyrAnalyticsResult } from '../types';

function isRejectedLink(status: string | undefined): boolean {
  return normalizePersian(status).includes('رد');
}

function buildGraveSignature(piece: unknown, row: unknown, number: unknown): string {
  const p = cleanOptionalField(piece);
  const r = cleanOptionalField(row);
  const n = cleanOptionalField(number);
  if (!p && !r && !n) return '';
  return `${normalizePersian(p)}|${normalizePersian(r)}|${normalizePersian(n)}`;
}

function hasCompleteNumericGrave(piece: unknown, row: unknown, number: unknown): boolean {
  const p = cleanOptionalField(piece);
  const r = cleanOptionalField(row);
  const n = cleanOptionalField(number);
  return Boolean(p && r && n && /\d/.test(p));
}

/**
 * تحلیل‌گر مستقل آمار شهدا:
 * - محاسبه پویا از روی داده‌های ورودی بدون هیچ عدد ثابت
 * - جداسازی قطعی ردیف‌های شهید نام‌دار، شهید گمنام (unknown_martyr) و غیرشهید/اموات (non_martyr)
 * - جلوگیری از ادغام خودکار هم‌نام‌ها مگر با قطعه/ردیف/شماره مزار یا شناسه معتبر
 * - عدم استناد به شیت نمونه ۱۹۶ شهید (تصمیم قطعی D-28)
 */
export function selectMartyrAnalytics(
  inputs: ExecutiveDashboardInputs
): MartyrAnalyticsResult {
  const golzarRecords = inputs.golzarRecords || [];
  const customMartyrs = inputs.customMartyrs || [];
  const links = inputs.links || [];
  const auditRecords = inputs.auditRecords || {};

  let golzarMainSheetRows = 0;
  let outsideGolzarSheetRows = 0;
  let namedMartyrRowsCount = 0;
  let unknownMartyrRowsCount = 0;
  let nonMartyrRowsCount = 0;

  const disambiguatedBankProfileKeys = new Set<string>();
  const bankNameOccurrences = new Map<
    string,
    {
      count: number;
      fatherNames: Set<string>;
      graveSignatures: Set<string>;
    }
  >();

  for (let idx = 0; idx < golzarRecords.length; idx += 1) {
    const rec = golzarRecords[idx];
    if (rec.source === 'outside' || rec.source === 'outside_golzar_martyrs') {
      outsideGolzarSheetRows += 1;
    } else {
      golzarMainSheetRows += 1;
    }

    const rowType = classifyGolzarRowType(rec.firstName, rec.lastName);
    if (rowType === 'unknown_martyr') {
      unknownMartyrRowsCount += 1;
      continue;
    }
    if (rowType === 'non_martyr') {
      nonMartyrRowsCount += 1;
      continue;
    }

    namedMartyrRowsCount += 1;
    const fullName = stripMartyrHonorifics(`${rec.firstName || ''} ${rec.lastName || ''}`);
    const father = normalizePersian(rec.fatherName);
    const graveSig = buildGraveSignature(rec.gravePiece, rec.graveRow, rec.graveNumber);

    // کلید تفکیک‌پذیر هویت در بانک رسمی: بدون نام پدر و نشانی مزار هرگز هم‌نام‌ها را ادغام نمی‌کنیم
    const profileKey = graveSig
      ? `${fullName}::${father}::${graveSig}`
      : rec.id
      ? `ID::${rec.id}`
      : `ROW::${rec.source || 'golzar'}::${rec.sourceRow ?? idx}::${fullName}::${father}`;
    disambiguatedBankProfileKeys.add(profileKey);

    if (fullName) {
      const entry = bankNameOccurrences.get(fullName) || {
        count: 0,
        fatherNames: new Set<string>(),
        graveSignatures: new Set<string>(),
      };
      entry.count += 1;
      if (father) entry.fatherNames.add(father);
      if (graveSig) entry.graveSignatures.add(graveSig);
      bankNameOccurrences.set(fullName, entry);
    }
  }

  let homonymGroupsCount = 0;
  let homonymRowsCount = 0;
  for (const entry of bankNameOccurrences.values()) {
    if (entry.count > 1) {
      homonymGroupsCount += 1;
      homonymRowsCount += entry.count;
    }
  }

  // آمار پرونده‌های شهید ثبت‌شده در سامانه (MR-xxxxxx)
  let customVerified = 0;
  let customNeedsReview = 0;
  let customUnreviewed = 0;
  let customRejected = 0;
  const customByNormalizedName = new Map<string, typeof customMartyrs>();

  for (const cm of customMartyrs) {
    const st = normalizePersian(cm.identityVerificationStatus);
    if (st === 'تاییدشده') customVerified += 1;
    else if (st === 'نیازمند بررسی') customNeedsReview += 1;
    else if (st.includes('رد')) customRejected += 1;
    else customUnreviewed += 1;

    const names = [cm.fullName, `${cm.firstName} ${cm.lastName}`, ...(cm.alternativeNames || [])];
    for (const n of names) {
      const clean = stripMartyrHonorifics(n);
      if (!clean) continue;
      const arr = customByNormalizedName.get(clean) || [];
      arr.push(cm);
      customByNormalizedName.set(clean, arr);
    }
  }

  // جمع‌آوری شهدای مستثنی‌شده در auditRecords هر کتاب برای پیشگیری از احتساب نام حذف‌شده
  const excludedByBookId = new Map<string, Set<string>>();
  for (const aud of Object.values(auditRecords)) {
    if (!aud.excludedMartyrs?.length) continue;
    const set = excludedByBookId.get(aud.tempBookId) || new Set<string>();
    for (const ex of aud.excludedMartyrs) {
      const norm = stripMartyrHonorifics(ex);
      if (norm) set.add(norm);
    }
    excludedByBookId.set(aud.tempBookId, set);
  }

  let placeholderOrGroupLinkRowsCount = 0;
  const linkedNameGroups = new Map<
    string,
    {
      hasExplicitGraveAddress: boolean;
      graveSignatures: Set<string>;
      hasExpertApprovedLink: boolean;
      resolvedConfirmedEntityKeys: Set<string>;
      hasAmbiguousOccurrence: boolean;
    }
  >();

  for (const lnk of links) {
    if (isRejectedLink(lnk.reviewStatus)) continue;
    if (isPlaceholderOrGroupMartyrPhrase(lnk.martyrNameRaw, lnk.isGroupPhrase)) {
      placeholderOrGroupLinkRowsCount += 1;
      continue;
    }

    const normName = stripMartyrHonorifics(lnk.martyrNameRaw);
    if (!normName) {
      placeholderOrGroupLinkRowsCount += 1;
      continue;
    }

    if (lnk.tempBookId && excludedByBookId.get(lnk.tempBookId)?.has(normName)) {
      continue;
    }

    const bucket = linkedNameGroups.get(normName) || {
      hasExplicitGraveAddress: false,
      graveSignatures: new Set<string>(),
      hasExpertApprovedLink: false,
      resolvedConfirmedEntityKeys: new Set<string>(),
      hasAmbiguousOccurrence: false,
    };

    const stNorm = normalizePersian(lnk.reviewStatus);
    const isExpertLink =
      stNorm === 'تاییدشده کارشناسی' || stNorm === 'تایید کارشناس' || stNorm === 'تاییدشده';
    if (isExpertLink) {
      bucket.hasExpertApprovedLink = true;
    }

    const graveSig = buildGraveSignature(lnk.gravePieceRaw, lnk.graveRowRaw, lnk.graveNumberRaw);
    const hasCompleteGrave = hasCompleteNumericGrave(
      lnk.gravePieceRaw,
      lnk.graveRowRaw,
      lnk.graveNumberRaw
    );
    const bankMatch = bankNameOccurrences.get(normName);
    const matchingCustom = customByNormalizedName.get(normName) || [];

    if (hasCompleteGrave && graveSig) {
      bucket.hasExplicitGraveAddress = true;
      bucket.graveSignatures.add(graveSig);
      bucket.resolvedConfirmedEntityKeys.add(`GRAVE::${normName}::${graveSig}`);
    } else if (matchingCustom.length === 1 && matchingCustom[0].martyrId) {
      bucket.resolvedConfirmedEntityKeys.add(`CUSTOM::${matchingCustom[0].martyrId}`);
    } else if (bankMatch && bankMatch.count === 1 && !lnk.reviewStatus.includes('مزار')) {
      // تطابق یکتا با تنها یک ردیف بدون هم‌نام در بانک رسمی
      const onlyGrave = Array.from(bankMatch.graveSignatures)[0] || normName;
      bucket.resolvedConfirmedEntityKeys.add(`GOLZAR_UNIQUE::${normName}::${onlyGrave}`);
    } else if (isExpertLink) {
      bucket.resolvedConfirmedEntityKeys.add(`EXPERT::${normName}`);
    } else {
      bucket.hasAmbiguousOccurrence = true;
    }

    linkedNameGroups.set(normName, bucket);
  }

  // افزودن نام‌های شهید ثبت‌شده فقط در auditRecords.relatedMartyrs که در links حضور نداشته‌اند
  for (const aud of Object.values(auditRecords)) {
    const excluded = new Set(
      (aud.excludedMartyrs || []).map((x) => stripMartyrHonorifics(x)).filter(Boolean)
    );
    for (const rm of aud.relatedMartyrs || []) {
      if (isPlaceholderOrGroupMartyrPhrase(rm, false)) continue;
      const normName = stripMartyrHonorifics(rm);
      if (!normName || excluded.has(normName)) continue;
      if (!linkedNameGroups.has(normName)) {
        const bucket = {
          hasExplicitGraveAddress: false,
          graveSignatures: new Set<string>(),
          hasExpertApprovedLink: Boolean(aud.expertApproved),
          resolvedConfirmedEntityKeys: new Set<string>(),
          hasAmbiguousOccurrence: !aud.expertApproved,
        };
        if (aud.expertApproved) {
          bucket.resolvedConfirmedEntityKeys.add(`AUDIT_EXPERT::${normName}`);
        }
        linkedNameGroups.set(normName, bucket);
      }
    }
  }

  let confirmedUniqueLinkedMartyrsCount = 0;
  let ambiguousOrUnverifiedLinkedNamesCount = 0;
  const homonymAmbiguityNames: string[] = [];

  for (const [normName, bucket] of linkedNameGroups.entries()) {
    if (bucket.resolvedConfirmedEntityKeys.size > 0) {
      confirmedUniqueLinkedMartyrsCount += bucket.resolvedConfirmedEntityKeys.size;
    }
    if (bucket.hasAmbiguousOccurrence || bucket.resolvedConfirmedEntityKeys.size === 0) {
      ambiguousOrUnverifiedLinkedNamesCount += 1;
      const bankMatch = bankNameOccurrences.get(normName);
      if ((bankMatch && bankMatch.count > 1) || bucket.graveSignatures.size > 1) {
        homonymAmbiguityNames.push(normName);
      }
    }
  }

  return {
    officialBank: {
      hasOfficialBankLoaded: golzarRecords.length > 0,
      totalRows: golzarRecords.length,
      golzarMainSheetRows,
      outsideGolzarSheetRows,
      namedMartyrRowsCount,
      unknownMartyrRowsCount,
      nonMartyrRowsCount,
      disambiguatedNamedProfilesCount: disambiguatedBankProfileKeys.size,
      distinctNormalizedFullNamesCount: bankNameOccurrences.size,
      homonymGroupsCount,
      homonymRowsCount,
    },
    customMartyrs: {
      totalCount: customMartyrs.length,
      verifiedCount: customVerified,
      needsReviewCount: customNeedsReview,
      unreviewedCount: customUnreviewed,
      rejectedCount: customRejected,
    },
    linkedMartyrsSummary: {
      distinctNormalizedLinkedNamesCount: linkedNameGroups.size,
      confirmedUniqueLinkedMartyrsCount,
      ambiguousOrUnverifiedLinkedNamesCount,
      placeholderOrGroupLinkRowsCount,
      homonymAmbiguityNames,
    },
  };
}
