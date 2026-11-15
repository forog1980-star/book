import type { CustomMartyrRecord } from '../../../data/markazAsnadData';
import {
  cleanOptionalField,
  classifyGolzarRowType,
  isPlaceholderOrGroupMartyrPhrase,
  normalizePersian,
  stripMartyrHonorifics,
} from '../normalization';
import type {
  CustomMartyrBankCandidate,
  CustomMartyrBankMatch,
  ExecutiveDashboardInputs,
  GolzarRawMartyrInput,
  MartyrAnalyticsResult,
  MartyrDiscrepancyWarning,
} from '../types';

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

function formatGraveReadable(piece: unknown, row: unknown, number: unknown): string {
  const p = cleanOptionalField(piece);
  const r = cleanOptionalField(row);
  const n = cleanOptionalField(number);
  if (!p && !r && !n) return '';
  return `${p || '—'}/${r || '—'}/${n || '—'}`;
}

function hasCompleteNumericGrave(piece: unknown, row: unknown, number: unknown): boolean {
  const p = cleanOptionalField(piece);
  const r = cleanOptionalField(row);
  const n = cleanOptionalField(number);
  return Boolean(p && r && n && /\d/.test(p));
}

export function evaluateStrictTehranStatus(params: {
  gravePiece?: string;
  graveRow?: string;
  graveNumber?: string;
  noteText?: string;
  golzarMatchCount: number;
  golzarHasExactGrave: boolean;
  customMartyr?: CustomMartyrRecord;
}): { status: 'tehran' | 'non_tehran' | 'unknown'; note: string } {
  const combined = normalizePersian(
    `${params.gravePiece || ''} ${params.noteText || ''} ${params.customMartyr?.graveVerificationStatus || ''} ${params.customMartyr?.graveSource || ''}`
  );
  if (
    combined.includes('غیرتهرانی') ||
    combined.includes('غیر تهرانی') ||
    combined.includes('خارج از تهران') ||
    combined.includes('یادبود')
  ) {
    return {
      status: 'non_tehran',
      note: 'ثبت‌شده به‌عنوان غیرتهرانی / یادبود در اطلاعات مزار یا یادداشت',
    };
  }
  if (params.golzarHasExactGrave) {
    return {
      status: 'tehran',
      note: 'احراز قطعی با مختصات مزار در بانک ۲۸٬۳۶۸ شهید گلزار تهران',
    };
  }
  if (hasCompleteNumericGrave(params.gravePiece, params.graveRow, params.graveNumber)) {
    return {
      status: 'tehran',
      note: 'دارای نشانی کامل قطعه، ردیف و شماره مزار گلزار تهران',
    };
  }
  if (params.golzarMatchCount === 1) {
    return {
      status: 'tehran',
      note: 'تطبیق یکتا با بانک ۲۸٬۳۶۸ شهید گلزار شهدای تهران',
    };
  }
  return {
    status: 'unknown',
    note: 'وضعیت تهران/غیرتهرانی بدون مختصات قطعی مزار هنوز تعیین‌تکلیف نشده است',
  };
}

function evaluateCustomMartyrsAgainstBank(
  customMartyrs: CustomMartyrRecord[],
  golzarById: Map<string, GolzarRawMartyrInput>,
  golzarRowsByNormName: Map<string, GolzarRawMartyrInput[]>
): CustomMartyrBankMatch[] {
  const results: CustomMartyrBankMatch[] = [];

  for (const cm of customMartyrs) {
    const extId = (cm.externalSystemId || '').trim();
    const normNames = Array.from(
      new Set(
        [cm.fullName, `${cm.firstName} ${cm.lastName}`, ...(cm.alternativeNames || [])]
          .map((n) => stripMartyrHonorifics(n))
          .filter(Boolean)
      )
    );
    const cmGraveSig = buildGraveSignature(cm.gravePiece, cm.graveRow, cm.graveNumber);
    const hasCompleteCmGrave = hasCompleteNumericGrave(
      cm.gravePiece,
      cm.graveRow,
      cm.graveNumber
    );

    // ۱. تطبیق قطعی با شناسه معتبر سامانه مرجع (Golzar ID)
    if (extId && golzarById.has(extId)) {
      const gm = golzarById.get(extId)!;
      results.push({
        customMartyrId: cm.martyrId,
        customFullName: cm.fullName,
        matchCertainty: 'definite',
        matchedGolzarId: gm.id,
        matchEvidence: `تطبیق قطعی با شناسه معتبر بانک گلزار (${extId})`,
        candidateGolzarMatches: [],
      });
      continue;
    }

    // جمع‌آوری کاندیداهای هم‌نام از بانک ۲۸٬۳۶۸ نفری بدون ادغام خودکار
    const candidateRows: GolzarRawMartyrInput[] = [];
    const seenIds = new Set<string>();
    for (const nn of normNames) {
      for (const row of golzarRowsByNormName.get(nn) || []) {
        const rid = row.id || `${row.source || 'golzar'}::${row.sourceRow ?? ''}`;
        if (!seenIds.has(rid)) {
          seenIds.add(rid);
          candidateRows.push(row);
        }
      }
    }

    const mappedCandidates: CustomMartyrBankCandidate[] = candidateRows.slice(0, 12).map((row) => ({
      golzarId: row.id || `golzar_${row.sourceRow ?? ''}`,
      fullName: `${row.firstName || ''} ${row.lastName || ''}`.trim() || cm.fullName,
      fatherName: row.fatherName || '—',
      graveAddress: formatGraveReadable(row.gravePiece, row.graveRow, row.graveNumber) || '—',
      source:
        row.source === 'outside' || row.source === 'outside_golzar_martyrs'
          ? 'outside'
          : 'golzar',
    }));

    // ۲. اگر مختصات کامل مزار در پرونده دستی با دقیقاً یک ردیف در بانک مطابقت کامل داشت
    if (hasCompleteCmGrave && cmGraveSig && candidateRows.length > 0) {
      const exactGraveMatches = candidateRows.filter(
        (r) => buildGraveSignature(r.gravePiece, r.graveRow, r.graveNumber) === cmGraveSig
      );
      if (exactGraveMatches.length === 1) {
        const gm = exactGraveMatches[0];
        results.push({
          customMartyrId: cm.martyrId,
          customFullName: cm.fullName,
          matchCertainty: 'definite',
          matchedGolzarId: gm.id,
          matchEvidence: `تطبیق قطعی نام و مختصات مزار (${formatGraveReadable(
            gm.gravePiece,
            gm.graveRow,
            gm.graveNumber
          )})`,
          candidateGolzarMatches: mappedCandidates,
        });
        continue;
      }
    }

    // ۳. تطبیق قطعی وقتی نام در کل بانک گلزار دقیقاً یکتا است و تعارض مزار وجود ندارد
    if (candidateRows.length === 1) {
      const gm = candidateRows[0];
      const gmGraveSig = buildGraveSignature(gm.gravePiece, gm.graveRow, gm.graveNumber);
      const conflictGrave = Boolean(cmGraveSig && gmGraveSig && cmGraveSig !== gmGraveSig);
      if (!conflictGrave) {
        results.push({
          customMartyrId: cm.martyrId,
          customFullName: cm.fullName,
          matchCertainty: 'definite',
          matchedGolzarId: gm.id,
          matchEvidence: `تطبیق یکتای غیرهم‌نام در بانک ۲۸٬۳۶۸ شهید بدون تعارض مزار`,
          candidateGolzarMatches: mappedCandidates,
        });
        continue;
      }
    }

    // ۴. تطبیق مبهم / چندهم‌نام یا تعارض مزار -> فقط پیشنهاد کارشناسی، هرگز ادغام خودکار نشود
    if (mappedCandidates.length > 0) {
      results.push({
        customMartyrId: cm.martyrId,
        customFullName: cm.fullName,
        matchCertainty: 'candidate_suggestion',
        matchEvidence: `شناسایی ${mappedCandidates.length} رکورد هم‌نام/مشابه در بانک گلزار — نیازمند بررسی کارشناسی (بدون ادغام خودکار)`,
        candidateGolzarMatches: mappedCandidates,
      });
      continue;
    }

    results.push({
      customMartyrId: cm.martyrId,
      customFullName: cm.fullName,
      matchCertainty: 'unmatched',
      matchEvidence: 'بدون تطبیق در بانک ۲۸٬۳۶۸ شهید گلزار تهران',
      candidateGolzarMatches: [],
    });
  }

  return results;
}

/**
 * تحلیل‌گر مستقل آمار شهدا (اصلاح‌شده در فاز دوم):
 * - شمارش هویت احرازشده بر پایه «شخص یکتا» و نه تعداد کلیدهای مختصات مزار (رفع دوگانه‌شماری ۳۳۴ -> ۳۳۲)
 * - ثبت هشدارهای کارشناسی برای اختلاف مختصات مزار (مانند صیاد شیرازی و علی خرم‌دل) بدون حذف خودکار مختصات
 * - جلوگیری از هم‌پوشانی آماری میان احرازشده و نیازمند احراز: confirmed + ambiguous === distinctNormalizedLinkedNamesCount (395)
 * - اتصال کنترل‌شده شهدای دستی (MR-xxxxxx) به بانک ۲۸٬۳۶۸ نفری فقط با شواهد کافی و ارائه پیشنهاد کارشناسی در موارد مبهم
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
  const golzarById = new Map<string, GolzarRawMartyrInput>();
  const golzarRowsByNormName = new Map<string, GolzarRawMartyrInput[]>();
  const bankNameOccurrences = new Map<
    string,
    {
      count: number;
      fatherNames: Set<string>;
      graveSignatures: Set<string>;
      firstRecordId?: string;
    }
  >();

  for (let idx = 0; idx < golzarRecords.length; idx += 1) {
    const rec = golzarRecords[idx];
    if (rec.id) {
      golzarById.set(rec.id, rec);
    }

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

    const profileKey = graveSig
      ? `${fullName}::${father}::${graveSig}`
      : rec.id
      ? `ID::${rec.id}`
      : `ROW::${rec.source || 'golzar'}::${rec.sourceRow ?? idx}::${fullName}::${father}`;
    disambiguatedBankProfileKeys.add(profileKey);

    if (fullName) {
      const rowsArr = golzarRowsByNormName.get(fullName) || [];
      rowsArr.push(rec);
      golzarRowsByNormName.set(fullName, rowsArr);

      const entry = bankNameOccurrences.get(fullName) || {
        count: 0,
        fatherNames: new Set<string>(),
        graveSignatures: new Set<string>(),
        firstRecordId: rec.id,
      };
      entry.count += 1;
      if (father) entry.fatherNames.add(father);
      if (graveSig) entry.graveSignatures.add(graveSig);
      if (!entry.firstRecordId && rec.id) entry.firstRecordId = rec.id;
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

  // ارزیابی پرونده‌های دستی شهید (MR-xxxxxx) و اتصال کنترل‌شده به بانک ۲۸٬۳۶۸ نفری
  let customVerified = 0;
  let customNeedsReview = 0;
  let customUnreviewed = 0;
  let customRejected = 0;
  const customByNormalizedName = new Map<string, CustomMartyrRecord[]>();

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

  const customMatches = evaluateCustomMartyrsAgainstBank(
    customMartyrs,
    golzarById,
    golzarRowsByNormName
  );
  const definiteBankMatchesCount = customMatches.filter(
    (m) => m.matchCertainty === 'definite'
  ).length;
  const candidateSuggestionsCount = customMatches.filter(
    (m) => m.matchCertainty === 'candidate_suggestion'
  ).length;
  const customMatchById = new Map<string, CustomMartyrBankMatch>(
    customMatches.map((m) => [m.customMartyrId, m])
  );

  // جمع‌آوری شهدای مستثنی‌شده در auditRecords هر کتاب
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
      displayName: string;
      graveSignatures: Set<string>;
      readableGraves: Set<string>;
      linkIds: Set<string>;
      bookIds: Set<string>;
      hasConfirmedOccurrence: boolean;
      hasAmbiguousOccurrence: boolean;
      hasExpertConfirmed: boolean;
      samplePiece: string;
      sampleRow: string;
      sampleNumber: string;
      notesCombined: string[];
      resolvedPersonKeys: Set<string>;
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
      displayName: lnk.martyrNameRaw.trim(),
      graveSignatures: new Set<string>(),
      readableGraves: new Set<string>(),
      linkIds: new Set<string>(),
      bookIds: new Set<string>(),
      hasConfirmedOccurrence: false,
      hasAmbiguousOccurrence: false,
      hasExpertConfirmed: false,
      samplePiece: '',
      sampleRow: '',
      sampleNumber: '',
      notesCombined: [],
      resolvedPersonKeys: new Set<string>(),
    };

    if (lnk.id) bucket.linkIds.add(lnk.id);
    if (lnk.tempBookId) bucket.bookIds.add(lnk.tempBookId);

    const stNorm = normalizePersian(lnk.reviewStatus);
    const isExpertLink =
      stNorm === 'تاییدشده کارشناسی' ||
      stNorm === 'تایید کارشناس' ||
      stNorm === 'تاییدشده و افزودهشده به پرونده' ||
      stNorm === 'تاییدشده و افزوده شده به پرونده';
    if (isExpertLink) {
      bucket.hasExpertConfirmed = true;
    }
    if (!bucket.samplePiece && cleanOptionalField(lnk.gravePieceRaw)) {
      bucket.samplePiece = cleanOptionalField(lnk.gravePieceRaw);
      bucket.sampleRow = cleanOptionalField(lnk.graveRowRaw);
      bucket.sampleNumber = cleanOptionalField(lnk.graveNumberRaw);
    }
    if (lnk.reviewerNote) bucket.notesCombined.push(lnk.reviewerNote);
    if (lnk.reviewStatus) bucket.notesCombined.push(lnk.reviewStatus);

    const graveSig = buildGraveSignature(lnk.gravePieceRaw, lnk.graveRowRaw, lnk.graveNumberRaw);
    const graveReadable = formatGraveReadable(
      lnk.gravePieceRaw,
      lnk.graveRowRaw,
      lnk.graveNumberRaw
    );
    const hasCompleteGrave = hasCompleteNumericGrave(
      lnk.gravePieceRaw,
      lnk.graveRowRaw,
      lnk.graveNumberRaw
    );
    const bankMatch = bankNameOccurrences.get(normName);
    const matchingCustom = customByNormalizedName.get(normName) || [];

    if (hasCompleteGrave && graveSig) {
      bucket.hasConfirmedOccurrence = true;
      bucket.graveSignatures.add(graveSig);
      if (graveReadable) bucket.readableGraves.add(graveReadable);

      // کلید شخص یکتا: اگر بانک گلزار برای این نام بیش از یک پدر مجزا دارد، با مزار تفکیک کن؛
      // ولی اگر اختلاف فقط خطای تایپی مختصات برای یک شخص واحد است (تایید تک‌پدر یا نبود تعارض هم‌نامی)، یک شخص حساب شود و هشدار ثبت گردد.
      if (bankMatch && bankMatch.fatherNames.size > 1) {
        const matchedBankRow = (golzarRowsByNormName.get(normName) || []).find(
          (r) => buildGraveSignature(r.gravePiece, r.graveRow, r.graveNumber) === graveSig
        );
        const father = normalizePersian(matchedBankRow?.fatherName);
        bucket.resolvedPersonKeys.add(
          father ? `PERSON::${normName}::${father}` : `GRAVE::${normName}::${graveSig}`
        );
      } else {
        bucket.resolvedPersonKeys.add(`PERSON::${normName}`);
      }
    } else if (matchingCustom.length === 1 && matchingCustom[0].martyrId) {
      const cMatch = customMatchById.get(matchingCustom[0].martyrId);
      bucket.hasConfirmedOccurrence = true;
      bucket.resolvedPersonKeys.add(
        cMatch?.matchCertainty === 'definite' && cMatch.matchedGolzarId
          ? `PERSON::${normName}::GLZ::${cMatch.matchedGolzarId}`
          : `PERSON::${normName}::CUSTOM::${matchingCustom[0].martyrId}`
      );
    } else if (bankMatch && bankMatch.count === 1 && !lnk.reviewStatus.includes('مزار')) {
      bucket.hasConfirmedOccurrence = true;
      bucket.resolvedPersonKeys.add(`PERSON::${normName}`);
    } else if (isExpertLink) {
      bucket.hasConfirmedOccurrence = true;
      bucket.resolvedPersonKeys.add(`PERSON::${normName}`);
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
        const isAudConfirmed = Boolean(aud.expertApproved);
        const bucket = {
          displayName: rm.trim(),
          graveSignatures: new Set<string>(),
          readableGraves: new Set<string>(),
          linkIds: new Set<string>(),
          bookIds: new Set<string>(aud.tempBookId ? [aud.tempBookId] : []),
          hasConfirmedOccurrence: isAudConfirmed,
          hasAmbiguousOccurrence: !isAudConfirmed,
          hasExpertConfirmed: isAudConfirmed,
          samplePiece: '',
          sampleRow: '',
          sampleNumber: '',
          notesCombined: aud.notes ? [aud.notes] : [],
          resolvedPersonKeys: new Set<string>(isAudConfirmed ? [`PERSON::${normName}`] : []),
        };
        linkedNameGroups.set(normName, bucket);
      }
    }
  }

  let confirmedUniqueLinkedMartyrsCount = 0;
  let ambiguousOrUnverifiedLinkedNamesCount = 0;
  const homonymAmbiguityNames: string[] = [];
  const discrepancyWarnings: MartyrDiscrepancyWarning[] = [];

  let tehranLinkedCount = 0;
  let nonTehranLinkedCount = 0;
  let unknownTehranLinkedCount = 0;
  let unreviewedLinkedCount = 0;
  let homonymSuspectsCount = 0;
  let singleBookLinkedCount = 0;
  let multiBookLinkedCount = 0;
  const linkedBankProfileKeys = new Set<string>();

  const buildRowProfileKey = (rec: GolzarRawMartyrInput): string => {
    const fullName = stripMartyrHonorifics(`${rec.firstName || ''} ${rec.lastName || ''}`);
    const father = normalizePersian(rec.fatherName);
    const graveSig = buildGraveSignature(rec.gravePiece, rec.graveRow, rec.graveNumber);
    if (graveSig) return `${fullName}::${father}::${graveSig}`;
    if (rec.id) return `ID::${rec.id}`;
    return `ROW::${rec.source || 'golzar'}::${rec.sourceRow ?? ''}::${fullName}::${father}`;
  };

  for (const [normName, bucket] of linkedNameGroups.entries()) {
    const bankMatch = bankNameOccurrences.get(normName);
    const bankRows = golzarRowsByNormName.get(normName) || [];
    const matchingCustom = customByNormalizedName.get(normName) || [];
    const singleCustom = matchingCustom.length === 1 ? matchingCustom[0] : undefined;
    const cMatch = singleCustom ? customMatchById.get(singleCustom.martyrId) : undefined;

    let matchedGolzar: GolzarRawMartyrInput | undefined;
    if (cMatch?.matchCertainty === 'definite' && cMatch.matchedGolzarId) {
      matchedGolzar = golzarById.get(cMatch.matchedGolzarId);
    } else if (bucket.graveSignatures.size > 0 && bankRows.length > 0) {
      const exactRows = bankRows.filter((r) =>
        bucket.graveSignatures.has(buildGraveSignature(r.gravePiece, r.graveRow, r.graveNumber))
      );
      if (exactRows.length === 1) matchedGolzar = exactRows[0];
    } else if (bankRows.length === 1) {
      matchedGolzar = bankRows[0];
    }

    if (matchedGolzar) {
      linkedBankProfileKeys.add(buildRowProfileKey(matchedGolzar));
    }
    for (const sig of bucket.graveSignatures) {
      for (const r of bankRows) {
        if (buildGraveSignature(r.gravePiece, r.graveRow, r.graveNumber) === sig) {
          linkedBankProfileKeys.add(buildRowProfileKey(r));
        }
      }
    }

    // ثبت هشدار کارشناسی در صورت اختلاف مختصات مزار در چند کتاب (بدون حذف خودکار مختصات)
    if (bucket.graveSignatures.size > 1) {
      const gravesList = Array.from(bucket.readableGraves);
      discrepancyWarnings.push({
        normalizedName: normName,
        displayName: bucket.displayName,
        kind: 'grave_coordinate_mismatch',
        message: `برای «${normName}» چند مختصات مزار متفاوت (${gravesList.join(
          ' در برابر '
        )}) در رکوردها ثبت شده است؛ یک شخص شمرده شد و نیازمند بررسی کارشناسی برای اصلاح خطای تایپی احتمالی است.`,
        gravesObserved: gravesList,
        affectedLinkIds: Array.from(bucket.linkIds),
        affectedBookIds: Array.from(bucket.bookIds),
      });
    }

    const isCleanConfirmed =
      bucket.hasConfirmedOccurrence &&
      bucket.resolvedPersonKeys.size > 0 &&
      !bucket.hasAmbiguousOccurrence;

    if (bucket.hasConfirmedOccurrence && bucket.hasAmbiguousOccurrence) {
      discrepancyWarnings.push({
        normalizedName: normName,
        displayName: bucket.displayName,
        kind: 'mixed_confirmed_and_ambiguous',
        message: `نام «${normName}» هم رکورد دارای مزار/شناسه و هم رکورد مبهم دارد؛ برای پیشگیری از هم‌پوشانی تا احراز نهایی در صف «نیازمند احراز» قرار گرفت.`,
        gravesObserved: Array.from(bucket.readableGraves),
        affectedLinkIds: Array.from(bucket.linkIds),
        affectedBookIds: Array.from(bucket.bookIds),
      });
    }

    if (isCleanConfirmed) {
      confirmedUniqueLinkedMartyrsCount += Math.max(1, bucket.resolvedPersonKeys.size);
    } else {
      ambiguousOrUnverifiedLinkedNamesCount += 1;
      if ((bankMatch && bankMatch.count > 1) || bucket.graveSignatures.size > 1) {
        homonymAmbiguityNames.push(normName);
      }
    }

    // آمارهای تفصیلی بخش ۲
    if (bucket.bookIds.size > 1) {
      multiBookLinkedCount += 1;
    } else {
      singleBookLinkedCount += 1;
    }

    if ((bankMatch && bankMatch.count > 1) || bucket.graveSignatures.size > 1) {
      homonymSuspectsCount += 1;
    }

    const isCustomExpertVerified = matchingCustom.some(
      (cm) => normalizePersian(cm.identityVerificationStatus) === 'تاییدشده'
    );
    if (!bucket.hasExpertConfirmed && !isCustomExpertVerified) {
      unreviewedLinkedCount += 1;
    }

    const tehEval = evaluateStrictTehranStatus({
      gravePiece: bucket.samplePiece || cleanOptionalField(matchedGolzar?.gravePiece) || cleanOptionalField(singleCustom?.gravePiece),
      graveRow: bucket.sampleRow || cleanOptionalField(matchedGolzar?.graveRow) || cleanOptionalField(singleCustom?.graveRow),
      graveNumber: bucket.sampleNumber || cleanOptionalField(matchedGolzar?.graveNumber) || cleanOptionalField(singleCustom?.graveNumber),
      noteText: bucket.notesCombined.join(' '),
      golzarMatchCount: bankRows.length,
      golzarHasExactGrave: Boolean(
        matchedGolzar && matchedGolzar.source !== 'outside_golzar_martyrs'
      ),
      customMartyr: singleCustom,
    });
    if (tehEval.status === 'tehran') tehranLinkedCount += 1;
    else if (tehEval.status === 'non_tehran') nonTehranLinkedCount += 1;
    else unknownTehranLinkedCount += 1;
  }

  for (const cmMatch of customMatches) {
    if (cmMatch.matchCertainty === 'candidate_suggestion') {
      discrepancyWarnings.push({
        normalizedName: stripMartyrHonorifics(cmMatch.customFullName),
        displayName: cmMatch.customFullName,
        kind: 'custom_martyr_ambiguous',
        message: `پرونده دستی ${cmMatch.customMartyrId} (${cmMatch.customFullName}): ${cmMatch.matchEvidence}`,
        gravesObserved: cmMatch.candidateGolzarMatches.map((c) => c.graveAddress),
        affectedLinkIds: [],
        affectedBookIds: [],
      });
    }
  }

  const officialBankLoaded = golzarRecords.length > 0;
  let unlinkedCustomOnlyCount = 0;
  let unlinkedUnmatchedCustomCount = 0;
  let unmatchedCustomCount = 0;
  for (const cm of customMartyrs) {
    const names = [cm.fullName, `${cm.firstName} ${cm.lastName}`, ...(cm.alternativeNames || [])]
      .map((n) => stripMartyrHonorifics(n))
      .filter(Boolean);
    const hasLink = names.some((n) => linkedNameGroups.has(n));
    const cMatch = customMatchById.get(cm.martyrId);
    const isDefiniteBankMatch = cMatch?.matchCertainty === 'definite';
    if (!isDefiniteBankMatch) unmatchedCustomCount += 1;
    if (!hasLink) {
      unlinkedCustomOnlyCount += 1;
      if (!isDefiniteBankMatch) unlinkedUnmatchedCustomCount += 1;
    }
  }

  const officialAndCustomUniqueIdsCount = officialBankLoaded
    ? disambiguatedBankProfileKeys.size + unmatchedCustomCount
    : null;
  const unlinkedBankAndCustomCount = officialBankLoaded
    ? Math.max(0, disambiguatedBankProfileKeys.size - linkedBankProfileKeys.size) +
      unlinkedUnmatchedCustomCount
    : null;

  return {
    officialBank: {
      hasOfficialBankLoaded: officialBankLoaded,
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
      definiteBankMatchesCount,
      candidateSuggestionsCount,
      matches: customMatches,
    },
    linkedMartyrsSummary: {
      distinctNormalizedLinkedNamesCount: linkedNameGroups.size,
      confirmedUniqueLinkedMartyrsCount,
      ambiguousOrUnverifiedLinkedNamesCount,
      placeholderOrGroupLinkRowsCount,
      homonymAmbiguityNames,
      discrepancyWarnings,
    },
    detailedMartyrMetrics: {
      officialBankLoaded,
      officialAndCustomUniqueIdsCount,
      linkedMartyrsCount: linkedNameGroups.size,
      confirmedIdentityCount: confirmedUniqueLinkedMartyrsCount,
      needsIdentityVerificationCount: ambiguousOrUnverifiedLinkedNamesCount,
      unlinkedBankAndCustomCount,
      unlinkedCustomOnlyCount,
      tehranLinkedCount,
      nonTehranLinkedCount,
      unknownTehranLinkedCount,
      unreviewedLinkedCount,
      homonymSuspectsCount,
      singleBookLinkedCount,
      multiBookLinkedCount,
    },
  };
}
