import type {
  BookMartyrLinkRecord,
  CustomMartyrRecord,
  ExtractedContentItem,
  FieldAuditRecord,
  PendingReviewItem,
  ReferenceCatalogRow,
} from '../../../data/markazAsnadData';
import {
  cleanOptionalField,
  compactPersian,
  isPlaceholderOrGroupMartyrPhrase,
  normalizePersian,
  resolveCatalogRowKey,
  stripMartyrHonorifics,
} from '../normalization';
import {
  RELATION_CERTAINTY_DISPLAY_LABELS,
  type CustomMartyrBankMatch,
  type DashboardBookLinkedRelationRef,
  type DashboardBookListItem,
  type DashboardMartyrLinkedBookRef,
  type DashboardMartyrListItem,
  type DashboardRelationListItem,
  type DashboardSummaryResult,
  type ExecutiveDashboardInputs,
  type GolzarRawMartyrInput,
  type ManagerialBookStatusCode,
  type MartyrDiscrepancyWarning,
  type TehranValidityStatus,
} from '../types';
import { selectExecutiveDashboardSummary } from './dashboardSummarySelector';
import { classifySingleLinkCertainty } from './relationAnalyticsSelector';

const MANAGERIAL_STATUS_LABELS: Record<ManagerialBookStatusCode, string> = {
  completed_without_ticket: 'تکمیل‌شده بدون تیکت باز',
  open_duplicate_ticket: 'دارای تیکت باز تکرار عنوان',
  unreviewed: 'بررسی‌نشده',
};

function isRejectedLinkStatus(status: unknown): boolean {
  return normalizePersian(status).includes('رد');
}

function formatGraveAddress(piece?: unknown, row?: unknown, num?: unknown): string {
  const p = cleanOptionalField(piece);
  const r = cleanOptionalField(row);
  const n = cleanOptionalField(num);
  if (!p && !r && !n) return '';
  const parts: string[] = [];
  if (p) parts.push(`قطعه ${p}`);
  if (r) parts.push(`ردیف ${r}`);
  if (n) parts.push(`شماره ${n}`);
  return parts.join('، ');
}

function buildGraveSig(piece?: unknown, row?: unknown, num?: unknown): string {
  const p = cleanOptionalField(piece);
  const r = cleanOptionalField(row);
  const n = cleanOptionalField(num);
  if (!p && !r && !n) return '';
  return `${normalizePersian(p)}|${normalizePersian(r)}|${normalizePersian(n)}`;
}

function hasCompleteNumericGrave(piece?: unknown, row?: unknown, num?: unknown): boolean {
  const p = cleanOptionalField(piece);
  const r = cleanOptionalField(row);
  const n = cleanOptionalField(num);
  return Boolean(p && r && n && /\d/.test(p));
}

function evaluateStrictTehranStatus(params: {
  gravePiece?: string;
  graveRow?: string;
  graveNumber?: string;
  noteText?: string;
  golzarMatchCount: number;
  golzarHasExactGrave: boolean;
  customMartyr?: CustomMartyrRecord;
}): { status: TehranValidityStatus; note: string } {
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

export interface ExecutiveEntityProjection {
  summary: DashboardSummaryResult;
  books: DashboardBookListItem[];
  martyrs: DashboardMartyrListItem[];
  relations: DashboardRelationListItem[];
}

/**
 * پروجکشن کامل و زنده موجودیت‌های داشبورد (کتاب‌ها، شهدا، ارتباط‌ها و هشدارهای کارشناسی)
 * با ارجاع‌پذیری دوطرفه و حفظ شناسه‌های پایدار (BK / RL / MR / Golzar ID).
 */
export function buildExecutiveEntityProjection(
  inputs: ExecutiveDashboardInputs
): ExecutiveEntityProjection {
  const summary = selectExecutiveDashboardSummary(inputs);
  const catalogRows = inputs.catalogRows || [];
  const auditRecords = inputs.auditRecords || {};
  const bookCopies = inputs.bookCopies || [];
  const links = inputs.links || [];
  const pendingReviews = inputs.pendingReviews || [];
  const extractedItems = inputs.extractedItems || [];
  const customMartyrs = inputs.customMartyrs || [];
  const golzarRecords = inputs.golzarRecords || [];

  // ۱. نمایه‌سازی بانک رسمی گلزار و تطبیق‌های customMartyrs
  const golzarById = new Map<string, GolzarRawMartyrInput>();
  const golzarByNormName = new Map<string, GolzarRawMartyrInput[]>();
  for (const g of golzarRecords) {
    if (g.id) golzarById.set(g.id, g);
    const nn = stripMartyrHonorifics(`${g.firstName || ''} ${g.lastName || ''}`);
    if (nn) {
      const arr = golzarByNormName.get(nn) || [];
      arr.push(g);
      golzarByNormName.set(nn, arr);
    }
  }

  const customByNormName = new Map<string, CustomMartyrRecord[]>();
  for (const cm of customMartyrs) {
    const names = [cm.fullName, `${cm.firstName} ${cm.lastName}`, ...(cm.alternativeNames || [])];
    for (const n of names) {
      const clean = stripMartyrHonorifics(n);
      if (!clean) continue;
      const arr = customByNormName.get(clean) || [];
      if (!arr.some((x) => x.martyrId === cm.martyrId)) {
        arr.push(cm);
      }
      customByNormName.set(clean, arr);
    }
  }

  const customMatchById = new Map<string, CustomMartyrBankMatch>(
    summary.martyrs.customMartyrs.matches.map((m) => [m.customMartyrId, m])
  );

  const warningByNormName = new Map<string, MartyrDiscrepancyWarning[]>();
  for (const w of summary.martyrs.linkedMartyrsSummary.discrepancyWarnings) {
    const arr = warningByNormName.get(w.normalizedName) || [];
    arr.push(w);
    warningByNormName.set(w.normalizedName, arr);
  }

  // ۲. نمایه‌سازی نسخه فیزیکی (CP) و تیکت‌های باز کتاب (PV)
  const copyCountByBookId = new Map<string, number>();
  for (const cp of bookCopies) {
    if (!cp.bookId) continue;
    copyCountByBookId.set(cp.bookId, (copyCountByBookId.get(cp.bookId) || 0) + 1);
  }

  const openBookTicketsByBookId = new Map<string, PendingReviewItem[]>();
  for (const pv of pendingReviews) {
    if (pv.trackingStatus === 'باز' && pv.mainSheet === 'فهرست کتاب‌ها' && pv.mainRecordId) {
      const id = pv.mainRecordId.trim();
      const arr = openBookTicketsByBookId.get(id) || [];
      arr.push(pv);
      openBookTicketsByBookId.set(id, arr);
    }
  }

  // ۳. ساخت فهرست کامل کتاب‌ها (۹۸۰ کاتالوگ + خارج از فهرست)
  const bookByKey = new Map<string, DashboardBookListItem>();
  const bookByTempId = new Map<string, DashboardBookListItem>();
  const bookByCompactTitle = new Map<string, DashboardBookListItem>();

  const catalogRowKeySet = new Set<string>();
  const catalogTempIdSet = new Set<string>();

  for (const row of catalogRows) {
    const rKey = resolveCatalogRowKey(row);
    catalogRowKeySet.add(rKey);
    const tid = (row.tempBookId || '').trim();
    if (tid) catalogTempIdSet.add(tid);

    const aud: FieldAuditRecord | undefined = auditRecords[rKey];
    const openTickets = tid ? openBookTicketsByBookId.get(tid) || [] : [];
    const rawRev = normalizePersian(row.reviewStatusRaw);
    const isFieldReview = Boolean(aud && (aud.physical === 'review' || aud.needsReview));
    const isReviewedBaseline =
      rawRev === 'بررسی شد' ||
      Boolean(
        aud &&
          !aud.needsReview &&
          (aud.expertApproved || aud.physical === 'verified' || aud.physical === 'not_found')
      );

    let managerialStatus: ManagerialBookStatusCode = 'unreviewed';
    if (openTickets.length > 0 || isFieldReview) {
      managerialStatus = 'open_duplicate_ticket';
    } else if (isReviewedBaseline) {
      managerialStatus = 'completed_without_ticket';
    }

    const title = (aud?.title || row.titleRaw || '').trim() || 'بدون عنوان';
    const publisher = (aud?.publisher || row.publisherRaw || '').trim();
    const author = (aud?.author || row.authorRaw || '').trim();
    const shelf = (aud?.shelf || '').trim();
    const level = (aud?.level || '').trim();
    const locationDisplay = (aud?.location || row.locationRaw || '').trim();

    const item: DashboardBookListItem = {
      bookKey: rKey,
      tempBookId: tid || rKey,
      source: 'catalog',
      title,
      publisher,
      author,
      locationDisplay,
      shelf,
      level,
      subjectCategory: (aud?.category || row.categoryRaw || '').trim(),
      description: (aud?.descriptionRaw || row.descriptionRaw || '').trim(),
      notes: (aud?.notes || row.noteRaw || '').trim(),
      isbn: (aud?.isbn || row.isbnRaw || '').trim(),
      fipa: (aud?.fipa || row.fipaRaw || '').trim(),
      registrationNo: (aud?.registrationNo || row.registrationNoRaw || '').trim(),
      countedCopiesRaw: (aud?.countedCopies || row.countedCopiesRaw || '').trim(),
      physicalCopiesCount: tid ? copyCountByBookId.get(tid) || 0 : 0,
      physicalStatusRaw: aud?.physical || 'unchecked',
      managerialStatus,
      managerialStatusLabel: MANAGERIAL_STATUS_LABELS[managerialStatus],
      openTicketIds: openTickets.map((t) => t.trackingId),
      openTicketSubjects: openTickets.map((t) => t.issueSubject).filter(Boolean),
      hasNamedMartyrLink: false,
      hasGroupOrPlaceholderOnly: false,
      hasActiveLink: false,
      hasExpertConfirmedLink: false,
      relations: [],
      extractedPassages: [],
    };

    bookByKey.set(rKey, item);
    if (tid) bookByTempId.set(tid, item);
    const ct = compactPersian(title);
    if (ct && !bookByCompactTitle.has(ct)) bookByCompactTitle.set(ct, item);
  }

  for (const [k, aud] of Object.entries(auditRecords)) {
    const tid = (aud.tempBookId || '').trim();
    const isCatalog =
      aud.source === 'catalog' ||
      catalogRowKeySet.has(k) ||
      (tid !== '' && catalogTempIdSet.has(tid));
    if (isCatalog) continue;

    const openTickets = tid ? openBookTicketsByBookId.get(tid) || [] : [];
    const isFieldReview = Boolean(aud.physical === 'review' || aud.needsReview);
    const managerialStatus: ManagerialBookStatusCode =
      openTickets.length > 0 || isFieldReview
        ? 'open_duplicate_ticket'
        : aud.expertApproved || aud.physical === 'verified' || aud.physical === 'not_found'
        ? 'completed_without_ticket'
        : 'unreviewed';

    const item: DashboardBookListItem = {
      bookKey: k,
      tempBookId: tid || k,
      source: 'outside-list',
      title: (aud.title || '').trim() || 'کتاب ثبت‌شده خارج از فهرست',
      publisher: (aud.publisher || '').trim(),
      author: (aud.author || '').trim(),
      locationDisplay: (aud.location || '').trim(),
      shelf: (aud.shelf || '').trim(),
      level: (aud.level || '').trim(),
      subjectCategory: (aud.category || '').trim(),
      description: (aud.descriptionRaw || '').trim(),
      notes: (aud.notes || '').trim(),
      isbn: (aud.isbn || '').trim(),
      fipa: (aud.fipa || '').trim(),
      registrationNo: (aud.registrationNo || '').trim(),
      countedCopiesRaw: (aud.countedCopies || '').trim(),
      physicalCopiesCount: tid ? copyCountByBookId.get(tid) || 0 : 0,
      physicalStatusRaw: aud.physical,
      managerialStatus,
      managerialStatusLabel: MANAGERIAL_STATUS_LABELS[managerialStatus],
      openTicketIds: openTickets.map((t) => t.trackingId),
      openTicketSubjects: openTickets.map((t) => t.issueSubject).filter(Boolean),
      hasNamedMartyrLink: false,
      hasGroupOrPlaceholderOnly: false,
      hasActiveLink: false,
      hasExpertConfirmedLink: false,
      relations: [],
      extractedPassages: [],
    };
    bookByKey.set(k, item);
    if (tid) bookByTempId.set(tid, item);
  }

  // ۴. اتصال متون استخراج‌شده به کتاب‌ها و نمایه‌سازی بر اساس کتاب/شهید
  const extractsByBookKeyAndMartyr = new Map<string, string[]>();
  for (const ex of extractedItems) {
    const matchedBook =
      (ex.tempBookId ? bookByTempId.get(ex.tempBookId.trim()) : undefined) ||
      bookByCompactTitle.get(compactPersian(ex.bookTitleRaw));
    if (matchedBook) {
      matchedBook.extractedPassages.push(ex);
      const mNorm = stripMartyrHonorifics(ex.martyrNameRaw);
      if (mNorm) {
        const pairKey = `${matchedBook.bookKey}::${mNorm}`;
        const arr = extractsByBookKeyAndMartyr.get(pairKey) || [];
        if (ex.extractedText) arr.push(ex.extractedText);
        extractsByBookKeyAndMartyr.set(pairKey, arr);
      }
    }
  }

  // ۵. ساخت موجودیت‌های شهید مرتبط + جدول کامل ارتباط‌ها با ارجاع دوطرفه
  const auditByBookId = new Map<string, FieldAuditRecord>();
  const auditByCompactTitle = new Map<string, FieldAuditRecord>();
  const excludedByBookId = new Map<string, Set<string>>();
  for (const aud of Object.values(auditRecords)) {
    if (aud.tempBookId) auditByBookId.set(aud.tempBookId.trim(), aud);
    const ct = compactPersian(aud.title);
    if (ct) auditByCompactTitle.set(ct, aud);
    if (aud.excludedMartyrs?.length) {
      const set = excludedByBookId.get(aud.tempBookId) || new Set<string>();
      for (const ex of aud.excludedMartyrs) {
        const norm = stripMartyrHonorifics(ex);
        if (norm) set.add(norm);
      }
      excludedByBookId.set(aud.tempBookId, set);
    }
  }

  interface MartyrMutableAcc {
    martyrKey: string;
    displayCode: string;
    customMartyrId?: string;
    golzarId?: string;
    fullName: string;
    normalizedName: string;
    fatherName: string;
    gravePiece: string;
    graveRow: string;
    graveNumber: string;
    graveAddress: string;
    tehranStatus: TehranValidityStatus;
    tehranEvidenceNote: string;
    hasConfirmedOccurrence: boolean;
    hasAmbiguousOccurrence: boolean;
    homonymCountInBank: number;
    hasExpertConfirmedRelation: boolean;
    linkedBooks: DashboardMartyrLinkedBookRef[];
    discrepancyWarnings: MartyrDiscrepancyWarning[];
    customMatchCandidates: CustomMartyrBankMatch['candidateGolzarMatches'];
    seenBookLinkKeys: Set<string>;
  }

  const martyrAccMap = new Map<string, MartyrMutableAcc>();
  const relations: DashboardRelationListItem[] = [];

  const getOrCreateMartyrAcc = (params: {
    normName: string;
    displayName: string;
    gravePiece?: string;
    graveRow?: string;
    graveNumber?: string;
    reviewerNote?: string;
    reviewStatus?: string;
  }): MartyrMutableAcc => {
    const { normName, displayName } = params;
    const bankRows = golzarByNormName.get(normName) || [];
    const distinctFathers = new Set(
      bankRows.map((r) => normalizePersian(r.fatherName)).filter(Boolean)
    );
    const graveSig = buildGraveSig(params.gravePiece, params.graveRow, params.graveNumber);
    const hasGrave = hasCompleteNumericGrave(
      params.gravePiece,
      params.graveRow,
      params.graveNumber
    );

    const matchingCustom = customByNormName.get(normName) || [];
    const singleCustom = matchingCustom.length === 1 ? matchingCustom[0] : undefined;
    const customMatch = singleCustom ? customMatchById.get(singleCustom.martyrId) : undefined;

    // پیدا کردن رکورد بانک گلزار فقط در صورت تطابق دقیق یا یکتایی بدون تعارض
    let matchedGolzar: GolzarRawMartyrInput | undefined;
    if (customMatch?.matchCertainty === 'definite' && customMatch.matchedGolzarId) {
      matchedGolzar = golzarById.get(customMatch.matchedGolzarId);
    } else if (hasGrave && graveSig && bankRows.length > 0) {
      const exactGraves = bankRows.filter(
        (r) => buildGraveSig(r.gravePiece, r.graveRow, r.graveNumber) === graveSig
      );
      if (exactGraves.length === 1) matchedGolzar = exactGraves[0];
    } else if (bankRows.length === 1) {
      matchedGolzar = bankRows[0];
    }

    // کلید یکتا مطابق قاعده عدم ادغام هم‌نام‌ها با پدر متفاوت
    let martyrKey = `MARTYR::${normName}`;
    if (distinctFathers.size > 1 && hasGrave && graveSig) {
      const matchedFather = normalizePersian(matchedGolzar?.fatherName);
      martyrKey = matchedFather
        ? `MARTYR::${normName}::F_${matchedFather}`
        : `MARTYR::${normName}::G_${graveSig}`;
    } else if (singleCustom && bankRows.length > 1 && !matchedGolzar) {
      martyrKey = `MARTYR::CUSTOM::${singleCustom.martyrId}`;
    }

    const existing = martyrAccMap.get(martyrKey);
    if (existing) {
      if (!existing.graveAddress && hasGrave) {
        existing.gravePiece = cleanOptionalField(params.gravePiece);
        existing.graveRow = cleanOptionalField(params.graveRow);
        existing.graveNumber = cleanOptionalField(params.graveNumber);
        existing.graveAddress = formatGraveAddress(
          params.gravePiece,
          params.graveRow,
          params.graveNumber
        );
      }
      if (!existing.golzarId && matchedGolzar?.id) {
        existing.golzarId = matchedGolzar.id;
      }
      return existing;
    }

    const effPiece =
      cleanOptionalField(params.gravePiece) ||
      cleanOptionalField(matchedGolzar?.gravePiece) ||
      cleanOptionalField(singleCustom?.gravePiece);
    const effRow =
      cleanOptionalField(params.graveRow) ||
      cleanOptionalField(matchedGolzar?.graveRow) ||
      cleanOptionalField(singleCustom?.graveRow);
    const effNumber =
      cleanOptionalField(params.graveNumber) ||
      cleanOptionalField(matchedGolzar?.graveNumber) ||
      cleanOptionalField(singleCustom?.graveNumber);

    const tehranEval = evaluateStrictTehranStatus({
      gravePiece: effPiece,
      graveRow: effRow,
      graveNumber: effNumber,
      noteText: `${params.reviewerNote || ''} ${params.reviewStatus || ''}`,
      golzarMatchCount: bankRows.length,
      golzarHasExactGrave: Boolean(matchedGolzar && matchedGolzar.source !== 'outside_golzar_martyrs'),
      customMartyr: singleCustom,
    });

    const displayCode =
      singleCustom?.martyrId || matchedGolzar?.id || `MR-REF-${martyrAccMap.size + 1}`;

    const acc: MartyrMutableAcc = {
      martyrKey,
      displayCode,
      customMartyrId: singleCustom?.martyrId,
      golzarId: matchedGolzar?.id,
      fullName: (matchedGolzar
        ? `${matchedGolzar.firstName || ''} ${matchedGolzar.lastName || ''}`.trim()
        : displayName
      ).trim(),
      normalizedName: normName,
      fatherName: cleanOptionalField(matchedGolzar?.fatherName),
      gravePiece: effPiece,
      graveRow: effRow,
      graveNumber: effNumber,
      graveAddress: formatGraveAddress(effPiece, effRow, effNumber),
      tehranStatus: tehranEval.status,
      tehranEvidenceNote: tehranEval.note,
      hasConfirmedOccurrence: false,
      hasAmbiguousOccurrence: false,
      homonymCountInBank: bankRows.length,
      hasExpertConfirmedRelation: false,
      linkedBooks: [],
      discrepancyWarnings: warningByNormName.get(normName) || [],
      customMatchCandidates: customMatch?.candidateGolzarMatches || [],
      seenBookLinkKeys: new Set<string>(),
    };
    martyrAccMap.set(martyrKey, acc);
    return acc;
  };

  for (let idx = 0; idx < links.length; idx += 1) {
    const lnk: BookMartyrLinkRecord = links[idx];
    const tid = (lnk.tempBookId || '').trim();
    const matchedBook =
      (tid ? bookByTempId.get(tid) : undefined) ||
      bookByCompactTitle.get(compactPersian(lnk.bookTitleRaw));
    const matchedAudit =
      (tid ? auditByBookId.get(tid) : undefined) ||
      auditByCompactTitle.get(compactPersian(lnk.bookTitleRaw));

    const bucket = classifySingleLinkCertainty(lnk, matchedAudit);
    const certaintyLabel = RELATION_CERTAINTY_DISPLAY_LABELS[bucket];
    const isPlaceholder = isPlaceholderOrGroupMartyrPhrase(lnk.martyrNameRaw, lnk.isGroupPhrase);
    const normName = isPlaceholder ? '' : stripMartyrHonorifics(lnk.martyrNameRaw);

    if (tid && normName && excludedByBookId.get(tid)?.has(normName)) {
      continue;
    }

    let martyrKey = `GROUP::${lnk.id || idx}`;
    let martyrDisplayCode = lnk.id || `GRP-${idx + 1}`;
    let martyrDisplayName = lnk.martyrNameRaw?.trim() || '* (گروهی / بدون نام)';
    let graveAddress = formatGraveAddress(
      lnk.gravePieceRaw,
      lnk.graveRowRaw,
      lnk.graveNumberRaw
    );
    let tehranStatus: TehranValidityStatus = 'unknown';

    if (!isPlaceholder && normName && !isRejectedLinkStatus(lnk.reviewStatus)) {
      const mAcc = getOrCreateMartyrAcc({
        normName,
        displayName: martyrDisplayName,
        gravePiece: lnk.gravePieceRaw,
        graveRow: lnk.graveRowRaw,
        graveNumber: lnk.graveNumberRaw,
        reviewerNote: lnk.reviewerNote,
        reviewStatus: lnk.reviewStatus,
      });

      const hasCompleteGrave = hasCompleteNumericGrave(
        lnk.gravePieceRaw,
        lnk.graveRowRaw,
        lnk.graveNumberRaw
      );
      const stNorm = normalizePersian(lnk.reviewStatus);
      const isExplicitExpert =
        stNorm === 'تاییدشده کارشناسی' ||
        stNorm === 'تایید کارشناس' ||
        stNorm === 'تاییدشده و افزودهشده به پرونده' ||
        stNorm === 'تاییدشده و افزوده شده به پرونده' ||
        bucket === 'confirmedByExpert';

      if (
        hasCompleteGrave ||
        Boolean(mAcc.customMartyrId) ||
        (mAcc.homonymCountInBank === 1 && !lnk.reviewStatus.includes('مزار')) ||
        isExplicitExpert
      ) {
        mAcc.hasConfirmedOccurrence = true;
      } else {
        mAcc.hasAmbiguousOccurrence = true;
      }
      if (bucket === 'confirmedByExpert') {
        mAcc.hasExpertConfirmedRelation = true;
      }

      martyrKey = mAcc.martyrKey;
      martyrDisplayCode = mAcc.displayCode;
      martyrDisplayName = mAcc.fullName;
      if (!graveAddress) graveAddress = mAcc.graveAddress;
      tehranStatus = mAcc.tehranStatus;

      if (matchedBook) {
        const dedupKey = `${lnk.id}::${matchedBook.bookKey}`;
        if (!mAcc.seenBookLinkKeys.has(dedupKey)) {
          mAcc.seenBookLinkKeys.add(dedupKey);
          mAcc.linkedBooks.push({
            linkId: lnk.id,
            bookKey: matchedBook.bookKey,
            tempBookId: matchedBook.tempBookId,
            bookTitle: matchedBook.title,
            publisher: matchedBook.publisher,
            pageReferenceRaw: (lnk.pageReferenceRaw || '').trim(),
            sourceDescriptionRaw: (lnk.sourceDescriptionRaw || '').trim(),
            certaintyBucket: bucket,
            certaintyLabel,
            reviewStatus: lnk.reviewStatus,
            reviewerNote: lnk.reviewerNote || '',
          });
        }
      }
    } else if (!isPlaceholder && normName) {
      const evalTeh = evaluateStrictTehranStatus({
        gravePiece: lnk.gravePieceRaw,
        graveRow: lnk.graveRowRaw,
        graveNumber: lnk.graveNumberRaw,
        noteText: lnk.reviewerNote,
        golzarMatchCount: (golzarByNormName.get(normName) || []).length,
        golzarHasExactGrave: false,
      });
      tehranStatus = evalTeh.status;
    }

    const bookKey = matchedBook?.bookKey || `UNMAPPED::${tid || compactPersian(lnk.bookTitleRaw)}`;
    const tempBookId = matchedBook?.tempBookId || tid || '—';
    const bookTitle = matchedBook?.title || lnk.bookTitleRaw || 'بدون عنوان';
    const publisher = matchedBook?.publisher || lnk.publisherRaw || '';

    if (matchedBook && bucket !== 'rejected') {
      matchedBook.hasActiveLink = true;
      if (isPlaceholder) {
        if (!matchedBook.hasNamedMartyrLink) {
          matchedBook.hasGroupOrPlaceholderOnly = true;
        }
      } else {
        matchedBook.hasNamedMartyrLink = true;
        matchedBook.hasGroupOrPlaceholderOnly = false;
      }
      if (bucket === 'confirmedByExpert') {
        matchedBook.hasExpertConfirmedLink = true;
      }

      const relRef: DashboardBookLinkedRelationRef = {
        linkId: lnk.id,
        martyrKey,
        martyrDisplayCode,
        martyrName: martyrDisplayName,
        isPlaceholderOrGroup: isPlaceholder,
        graveAddress,
        tehranStatus,
        pageReferenceRaw: (lnk.pageReferenceRaw || '').trim(),
        sourceDescriptionRaw: (lnk.sourceDescriptionRaw || '').trim(),
        certaintyBucket: bucket,
        certaintyLabel,
        reviewStatus: lnk.reviewStatus,
        reviewerNote: lnk.reviewerNote || '',
        sourceFile: lnk.sourceFile || '',
        sourceSheet: lnk.sourceSheet || '',
        sourceExcelRow: lnk.sourceExcelRow || '',
      };
      matchedBook.relations.push(relRef);
    }

    const extractedTexts =
      matchedBook && normName
        ? extractsByBookKeyAndMartyr.get(`${matchedBook.bookKey}::${normName}`) || []
        : [];

    relations.push({
      linkId: lnk.id,
      bookKey,
      tempBookId,
      bookTitle,
      publisher,
      martyrKey,
      martyrDisplayCode,
      martyrName: martyrDisplayName,
      graveAddress,
      tehranStatus,
      pageReferenceRaw: (lnk.pageReferenceRaw || '').trim(),
      sourceDescriptionRaw: (lnk.sourceDescriptionRaw || '').trim(),
      reviewerNote: lnk.reviewerNote || '',
      certaintyBucket: bucket,
      certaintyLabel,
      reviewStatus: lnk.reviewStatus,
      isPlaceholderOrGroup: isPlaceholder,
      sourceFile: lnk.sourceFile || '',
      sourceSheet: lnk.sourceSheet || '',
      sourceExcelRow: lnk.sourceExcelRow || '',
      extractedTexts,
    });
  }

  // افزودن شهدای ثبت‌شده فقط در auditRecords.relatedMartyrs بدون رکورد link
  for (const aud of Object.values(auditRecords)) {
    const matchedBook =
      bookByKey.get(aud.key) || (aud.tempBookId ? bookByTempId.get(aud.tempBookId.trim()) : undefined);
    const excluded = new Set(
      (aud.excludedMartyrs || []).map((x) => stripMartyrHonorifics(x)).filter(Boolean)
    );
    for (const rm of aud.relatedMartyrs || []) {
      if (isPlaceholderOrGroupMartyrPhrase(rm, false)) continue;
      const normName = stripMartyrHonorifics(rm);
      if (!normName || excluded.has(normName)) continue;
      if (martyrAccMap.has(`MARTYR::${normName}`)) continue;

      const mAcc = getOrCreateMartyrAcc({
        normName,
        displayName: rm.trim(),
      });
      if (aud.expertApproved) {
        mAcc.hasConfirmedOccurrence = true;
        mAcc.hasExpertConfirmedRelation = true;
      } else {
        mAcc.hasAmbiguousOccurrence = true;
      }
      if (matchedBook) {
        const syntheticLinkId = `AUD-${matchedBook.tempBookId}-${normName}`;
        if (!mAcc.seenBookLinkKeys.has(syntheticLinkId)) {
          mAcc.seenBookLinkKeys.add(syntheticLinkId);
          mAcc.linkedBooks.push({
            linkId: syntheticLinkId,
            bookKey: matchedBook.bookKey,
            tempBookId: matchedBook.tempBookId,
            bookTitle: matchedBook.title,
            publisher: matchedBook.publisher,
            pageReferenceRaw: '',
            sourceDescriptionRaw: 'ثبت‌شده در بخش ممیزی کتابخانه',
            certaintyBucket: aud.expertApproved ? 'confirmedByExpert' : 'needsReview',
            certaintyLabel:
              RELATION_CERTAINTY_DISPLAY_LABELS[
                aud.expertApproved ? 'confirmedByExpert' : 'needsReview'
              ],
            reviewStatus: aud.expertApproved ? 'تأییدشده کارشناسی' : 'ثبت میدانی بدون پیوند RL',
            reviewerNote: aud.notes || '',
          });
        }
        matchedBook.hasNamedMartyrLink = true;
        matchedBook.hasActiveLink = true;
        matchedBook.hasGroupOrPlaceholderOnly = false;
        matchedBook.relations.push({
          linkId: syntheticLinkId,
          martyrKey: mAcc.martyrKey,
          martyrDisplayCode: mAcc.displayCode,
          martyrName: mAcc.fullName,
          isPlaceholderOrGroup: false,
          graveAddress: mAcc.graveAddress,
          tehranStatus: mAcc.tehranStatus,
          pageReferenceRaw: '',
          sourceDescriptionRaw: 'ثبت‌شده در بخش ممیزی کتابخانه',
          certaintyBucket: aud.expertApproved ? 'confirmedByExpert' : 'needsReview',
          certaintyLabel:
            RELATION_CERTAINTY_DISPLAY_LABELS[
              aud.expertApproved ? 'confirmedByExpert' : 'needsReview'
            ],
          reviewStatus: aud.expertApproved ? 'تأییدشده کارشناسی' : 'نیازمند بررسی',
          reviewerNote: aud.notes || '',
          sourceFile: 'ثبت میدانی کتابخانه',
          sourceSheet: aud.sheet || '',
          sourceExcelRow: '',
        });
      }
    }
  }

  // همچنین شهدای دستی (MR-xxxxxx) که هنوز کتابی ندارند ولی در بانک یا صف هستند نیز قابل مشاهده و پیگیری باشند:
  for (const cm of customMartyrs) {
    const normName = stripMartyrHonorifics(cm.fullName);
    if (!normName) continue;
    const alreadyExists = Array.from(martyrAccMap.values()).some(
      (m) => m.customMartyrId === cm.martyrId || m.normalizedName === normName
    );
    if (!alreadyExists) {
      const acc = getOrCreateMartyrAcc({
        normName,
        displayName: cm.fullName,
        gravePiece: cm.gravePiece,
        graveRow: cm.graveRow,
        graveNumber: cm.graveNumber,
        reviewStatus: cm.identityVerificationStatus,
      });
      acc.hasConfirmedOccurrence = cm.identityVerificationStatus === 'تأییدشده';
      acc.hasAmbiguousOccurrence = cm.identityVerificationStatus !== 'تأییدشده';
    }
  }

  const martyrs: DashboardMartyrListItem[] = Array.from(martyrAccMap.values()).map((acc) => {
    const isConfirmed = acc.hasConfirmedOccurrence && !acc.hasAmbiguousOccurrence;
    return {
      martyrKey: acc.martyrKey,
      displayCode: acc.displayCode,
      customMartyrId: acc.customMartyrId,
      golzarId: acc.golzarId,
      fullName: acc.fullName,
      normalizedName: acc.normalizedName,
      fatherName: acc.fatherName,
      gravePiece: acc.gravePiece,
      graveRow: acc.graveRow,
      graveNumber: acc.graveNumber,
      graveAddress: acc.graveAddress,
      tehranStatus: acc.tehranStatus,
      tehranEvidenceNote: acc.tehranEvidenceNote,
      identityStatus: isConfirmed ? 'confirmed' : 'needs_verification',
      identityStatusLabel: isConfirmed
        ? 'هویت احرازشده'
        : 'نیازمند احراز هویت / رفع ابهام مزار',
      homonymCountInBank: acc.homonymCountInBank,
      hasExpertConfirmedRelation: acc.hasExpertConfirmedRelation,
      linkedBooksCount: acc.linkedBooks.length,
      linkedBooks: acc.linkedBooks,
      discrepancyWarnings: acc.discrepancyWarnings,
      customMatchCandidates: acc.customMatchCandidates,
    };
  });

  const books = Array.from(bookByKey.values());
  return { summary, books, martyrs, relations };
}

export function selectDashboardBooksList(
  inputs: ExecutiveDashboardInputs
): DashboardBookListItem[] {
  return buildExecutiveEntityProjection(inputs).books;
}

export function selectDashboardMartyrsList(
  inputs: ExecutiveDashboardInputs
): DashboardMartyrListItem[] {
  return buildExecutiveEntityProjection(inputs).martyrs;
}

export function selectDashboardRelationsList(
  inputs: ExecutiveDashboardInputs
): DashboardRelationListItem[] {
  return buildExecutiveEntityProjection(inputs).relations;
}
