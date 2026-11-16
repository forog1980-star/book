import { GolzartehIndexRecord, GolzartehMatchBasis } from './types';

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function normalizeGolzartehPersian(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/[\u200B-\u200D\uFEFF]/g, ' ')
    .replace(/[يىئ]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/[ؤ]/g, 'و')
    .replace(/[إأآ]/g, 'ا')
    .replace(/الله/g, 'اله')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[()«»"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeGolzartehPersonName(raw: unknown): string {
  return normalizeGolzartehPersian(raw)
    .replace(/^(شهید|سردار شهید|امیر شهید|سید الشهدا)\s+/g, '')
    .replace(/\bشهید گمنام\b/g, '')
    .replace(/\bمزار یادبود\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function compactNameKey(raw: unknown): string {
  return normalizeGolzartehPersonName(raw).replace(/\s+/g, '');
}

export function normalizeGraveToken(raw: unknown): string {
  const cleaned = normalizeGolzartehPersian(raw);
  if (!cleaned || cleaned === '—' || cleaned === '-' || cleaned === '?') return '';
  const digitsOnly = cleaned.replace(/^0+/, '');
  return digitsOnly || cleaned;
}

export function areTombCoordsSame(
  local: { piece?: string; row?: string; number?: string },
  official: { section?: string; row?: string; number?: string }
): boolean {
  const lp = normalizeGraveToken(local.piece);
  const lr = normalizeGraveToken(local.row);
  const ln = normalizeGraveToken(local.number);
  const op = normalizeGraveToken(official.section);
  const orw = normalizeGraveToken(official.row);
  const on = normalizeGraveToken(official.number);
  if (!lp || !op) return false;
  return lp === op && (!lr || !orw || lr === orw) && (!ln || !on || ln === on);
}

export interface LocalMartyrCandidateInput {
  localKey: string;
  firstName: string;
  lastName: string;
  fatherName: string;
  birthYear?: string;
  martyrdomYear?: string;
  piece: string;
  row: string;
  number: string;
}

export interface GolzartehCandidateInput {
  gid: number;
  firstName: string;
  lastName: string;
  fatherName: string;
  section: string;
  row: string;
  number: string;
  birthYear?: string;
  martyrdomYear?: string;
}

/**
 * چندشاخص‌سنجی دقیق هویت شهید بین بانک ۲۸٬۳۶۸ نفری کتابخانه و سامانه رسمی golzarteh.ir
 * شاخص‌های کلیدی: ۱) نام و نام خانوادگی، ۲) نام پدر (برای تفکیک هم‌نام‌ها)، ۳) سال تولد/شهادت،
 * ۴) مختصات مزار (در صورت تطابق امتیاز مثبت می‌دهد، اما در صورت اختلاف مزار و یکسان بودن نام+پدر،
 * تطبیق حفظ شده و پرچم اختلاف مزار tombMismatch ثبت می‌شود).
 */
export function scoreGolzartehCandidateMatch(
  local: LocalMartyrCandidateInput,
  official: GolzartehCandidateInput
): {
  score: number;
  basis: GolzartehMatchBasis;
  tombMismatch: boolean;
} {
  const lFirst = compactNameKey(local.firstName);
  const lLast = compactNameKey(local.lastName);
  const lFull = compactNameKey(`${local.firstName} ${local.lastName}`);
  const oFirst = compactNameKey(official.firstName);
  const oLast = compactNameKey(official.lastName);
  const oFull = compactNameKey(`${official.firstName} ${official.lastName}`);

  if (!lFull || !oFull) {
    return { score: 0, basis: 'normalized_name_father', tombMismatch: false };
  }

  let nameScore = 0;
  if (lFirst === oFirst && lLast === oLast) {
    nameScore = 45;
  } else if (lFull === oFull) {
    nameScore = 43;
  } else if (
    lLast &&
    oLast &&
    (lLast === oLast || lLast.includes(oLast) || oLast.includes(lLast)) &&
    lFirst &&
    oFirst &&
    (lFirst.includes(oFirst) || oFirst.includes(lFirst))
  ) {
    nameScore = 32;
  } else {
    return { score: 0, basis: 'normalized_name_father', tombMismatch: false };
  }

  const lFather = compactNameKey(local.fatherName);
  const oFather = compactNameKey(official.fatherName);
  let fatherExact = false;
  let fatherScore = 0;
  let fatherConflict = false;

  if (lFather && oFather) {
    if (lFather === oFather) {
      fatherScore = 30;
      fatherExact = true;
    } else if (lFather.includes(oFather) || oFather.includes(lFather)) {
      fatherScore = 20;
    } else {
      fatherConflict = true;
      fatherScore = -25;
    }
  }

  let yearScore = 0;
  const lBy = normalizeGraveToken(local.birthYear);
  const oBy = normalizeGraveToken(official.birthYear);
  const lMy = normalizeGraveToken(local.martyrdomYear);
  const oMy = normalizeGraveToken(official.martyrdomYear);
  if (lBy && oBy) {
    yearScore += lBy === oBy ? 8 : -10;
  }
  if (lMy && oMy) {
    yearScore += lMy === oMy ? 8 : -10;
  }

  const sameTomb = areTombCoordsSame(local, official);
  const hasBothTombs =
    Boolean(normalizeGraveToken(local.piece)) && Boolean(normalizeGraveToken(official.section));
  const tombMismatch = hasBothTombs && !sameTomb;
  const tombScore = sameTomb ? 25 : 0;

  // Prevent merging different people with same name when both fatherName and tomb conflict
  if (fatherConflict && !sameTomb) {
    return { score: 0, basis: 'normalized_name_father', tombMismatch: true };
  }

  const totalScore = Math.max(0, Math.min(100, nameScore + fatherScore + yearScore + tombScore));

  let basis: GolzartehMatchBasis = 'normalized_name_father';
  if (nameScore >= 43 && fatherExact && sameTomb) {
    basis = 'exact_name_father_tomb';
  } else if (nameScore >= 43 && fatherExact && tombMismatch) {
    basis = 'exact_name_father_tomb_diff';
  } else if (nameScore >= 43 && sameTomb) {
    basis = 'exact_name_tomb';
  } else if (nameScore >= 43 && fatherExact) {
    basis = 'exact_name_father_only';
  }

  return {
    score: totalScore,
    basis,
    tombMismatch
  };
}

export function matchGolzartehEntryByNameAndFather(
  entries: GolzartehIndexRecord[],
  fullName: string,
  fatherName?: string,
  grave?: { piece?: string; row?: string; number?: string }
): GolzartehIndexRecord | null {
  const targetFull = compactNameKey(fullName);
  const targetFather = compactNameKey(fatherName || '');
  if (!targetFull) return null;

  let best: GolzartehIndexRecord | null = null;
  let bestScore = -1;

  for (const entry of entries) {
    const entryFull = compactNameKey(`${entry.firstName} ${entry.lastName}`);
    if (entryFull !== targetFull) continue;

    let score = entry.matchScore;
    if (targetFather && entry.fatherName) {
      const eFather = compactNameKey(entry.fatherName);
      if (eFather === targetFather) score += 35;
      else if (eFather.includes(targetFather) || targetFather.includes(eFather)) score += 15;
      else score -= 30;
    }
    if (grave && areTombCoordsSame(grave, entry)) {
      score += 20;
    }
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  return bestScore >= 40 ? best : null;
}
