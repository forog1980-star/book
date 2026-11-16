import {
  BookCopyRecord,
  FieldAuditRecord,
  LEVELS,
  LevelCode,
  ReferenceCatalogRow,
  SHELVES,
  ShelfCode,
  toEnglishDigits
} from '../data/markazAsnadData';

export const SHELF_CAPACITY_STORAGE_KEY = 'book_shelf_capacities_v1';
export const SHELF_WARNING_THRESHOLD_PERCENT = 80;
export const SHELF_CRITICAL_THRESHOLD_PERCENT = 95;
export const DEFAULT_LEVEL_CAPACITY = 50;
export const DEFAULT_SHELF_CAPACITY = DEFAULT_LEVEL_CAPACITY * LEVELS.length; // 300 volumes per 6-level shelf

export type ShelfCapacityMap = Record<ShelfCode, number>;

export const DEFAULT_SHELF_CAPACITIES: ShelfCapacityMap = {
  'SH-01': DEFAULT_SHELF_CAPACITY,
  'SH-02': DEFAULT_SHELF_CAPACITY,
  'SH-03': DEFAULT_SHELF_CAPACITY,
  'SH-04': DEFAULT_SHELF_CAPACITY
};

export type CapacityAlertSeverity = 'normal' | 'warning' | 'critical';

export interface LevelOccupancyStatus {
  shelf: ShelfCode;
  level: LevelCode;
  locationCode: string;
  title: string;
  occupiedBooksCount: number;
  occupiedVolumesCount: number;
  capacity: number;
  fillPercent: number;
  remainingCapacity: number;
  isOverWarningThreshold: boolean; // > 80%
  severity: CapacityAlertSeverity;
}

export interface ShelfOccupancyStatus {
  shelf: ShelfCode;
  title: string;
  summary: string;
  occupiedBooksCount: number;
  occupiedVolumesCount: number;
  capacity: number;
  fillPercent: number;
  remainingCapacity: number;
  isOverWarningThreshold: boolean; // > 80%
  severity: CapacityAlertSeverity;
  levels: LevelOccupancyStatus[];
  overThresholdLevels: LevelOccupancyStatus[];
}

export interface ShelfCapacityAnalysisResult {
  thresholdPercent: number;
  shelves: ShelfOccupancyStatus[];
  alertedShelves: ShelfOccupancyStatus[];
  alertedLevels: LevelOccupancyStatus[];
  totalOccupiedVolumes: number;
  totalLibraryCapacity: number;
  overallFillPercent: number;
  highestFillShelf: ShelfOccupancyStatus | null;
}

const VALID_SHELVES = new Set<ShelfCode>(['SH-01', 'SH-02', 'SH-03', 'SH-04']);
const VALID_LEVELS = new Set<LevelCode>(['T01', 'T02', 'T03', 'T04', 'T05', 'T06']);

export function parseShelfAndLevelFromLocation(
  locationRaw?: string,
  shelfHint?: string,
  levelHint?: string
): { shelf: ShelfCode | null; level: LevelCode | null } {
  const sHint = String(shelfHint || '').trim().toUpperCase() as ShelfCode;
  const lHint = String(levelHint || '').trim().toUpperCase() as LevelCode;

  if (VALID_SHELVES.has(sHint)) {
    if (VALID_LEVELS.has(lHint)) {
      return { shelf: sHint, level: lHint };
    }
  }

  const normalizedLoc = toEnglishDigits(String(locationRaw || ''))
    .trim()
    .toUpperCase();

  if (normalizedLoc) {
    const codeMatch = normalizedLoc.match(/SH[-\s]?0?([1-4])(?:\s*[-_/]\s*T?0?([1-6]))?/);
    if (codeMatch) {
      const shelf = `SH-0${codeMatch[1]}` as ShelfCode;
      const level = codeMatch[2] ? (`T0${codeMatch[2]}` as LevelCode) : null;
      return {
        shelf: VALID_SHELVES.has(shelf) ? shelf : null,
        level: level && VALID_LEVELS.has(level) ? level : VALID_LEVELS.has(lHint) ? lHint : null
      };
    }

    const faMatch = normalizedLoc.match(/قفسه\s*([1-4])(?:\s*[-،,/\s]*طبقه\s*([1-6]))?/);
    if (faMatch) {
      const shelf = `SH-0${faMatch[1]}` as ShelfCode;
      const level = faMatch[2] ? (`T0${faMatch[2]}` as LevelCode) : null;
      return {
        shelf: VALID_SHELVES.has(shelf) ? shelf : null,
        level: level && VALID_LEVELS.has(level) ? level : VALID_LEVELS.has(lHint) ? lHint : null
      };
    }
  }

  if (VALID_SHELVES.has(sHint)) {
    return { shelf: sHint, level: VALID_LEVELS.has(lHint) ? lHint : null };
  }

  return { shelf: null, level: null };
}

export function parsePositiveCopiesCount(rawValue: string | number | undefined, fallback = 1): number {
  if (rawValue === undefined || rawValue === null) return fallback;
  const cleaned = toEnglishDigits(String(rawValue)).trim();
  if (!cleaned) return fallback;
  const match = cleaned.match(/\d+/);
  if (!match) return fallback;
  const parsed = Number(match[0]);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

export function loadSavedShelfCapacities(): ShelfCapacityMap {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return { ...DEFAULT_SHELF_CAPACITIES };
  }
  try {
    const raw = window.localStorage.getItem(SHELF_CAPACITY_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SHELF_CAPACITIES };
    const parsed = JSON.parse(raw) as Partial<Record<ShelfCode, unknown>>;
    const next: ShelfCapacityMap = { ...DEFAULT_SHELF_CAPACITIES };
    for (const sh of SHELVES) {
      const val = Number(parsed?.[sh.code]);
      if (Number.isFinite(val) && val >= 6 && val <= 10000) {
        next[sh.code] = Math.round(val);
      }
    }
    return next;
  } catch {
    return { ...DEFAULT_SHELF_CAPACITIES };
  }
}

export function saveShelfCapacities(capacities: ShelfCapacityMap): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  try {
    window.localStorage.setItem(SHELF_CAPACITY_STORAGE_KEY, JSON.stringify(capacities));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function analyzeShelfCapacities(params: {
  catalogRows: ReferenceCatalogRow[];
  auditRecords: Record<string, FieldAuditRecord>;
  bookCopies?: BookCopyRecord[];
  capacities?: Partial<ShelfCapacityMap>;
  thresholdPercent?: number;
}): ShelfCapacityAnalysisResult {
  const {
    catalogRows,
    auditRecords,
    bookCopies = [],
    capacities = DEFAULT_SHELF_CAPACITIES,
    thresholdPercent = SHELF_WARNING_THRESHOLD_PERCENT
  } = params;

  const resolvedCapacities: ShelfCapacityMap = {
    'SH-01': Number(capacities['SH-01']) > 0 ? Math.round(Number(capacities['SH-01'])) : DEFAULT_SHELF_CAPACITY,
    'SH-02': Number(capacities['SH-02']) > 0 ? Math.round(Number(capacities['SH-02'])) : DEFAULT_SHELF_CAPACITY,
    'SH-03': Number(capacities['SH-03']) > 0 ? Math.round(Number(capacities['SH-03'])) : DEFAULT_SHELF_CAPACITY,
    'SH-04': Number(capacities['SH-04']) > 0 ? Math.round(Number(capacities['SH-04'])) : DEFAULT_SHELF_CAPACITY
  };

  // Accumulators per shelf and per shelf-level
  const shelfVolumes = new Map<ShelfCode, number>();
  const shelfBookIds = new Map<ShelfCode, Set<string>>();
  const levelVolumes = new Map<string, number>();
  const levelBookIds = new Map<string, Set<string>>();

  for (const sh of SHELVES) {
    shelfVolumes.set(sh.code, 0);
    shelfBookIds.set(sh.code, new Set());
    for (const lv of LEVELS) {
      const loc = `${sh.code}-${lv.code}`;
      levelVolumes.set(loc, 0);
      levelBookIds.set(loc, new Set());
    }
  }

  const addVolume = (shelf: ShelfCode, level: LevelCode | null, bookKey: string, count: number) => {
    if (count <= 0) return;
    shelfVolumes.set(shelf, (shelfVolumes.get(shelf) || 0) + count);
    shelfBookIds.get(shelf)?.add(bookKey);
    if (level) {
      const loc = `${shelf}-${level}`;
      levelVolumes.set(loc, (levelVolumes.get(loc) || 0) + count);
      levelBookIds.get(loc)?.add(bookKey);
    }
  };

  // Group physical copies (CP-xxxxxx) that actually occupy a shelf slot
  const activeCopiesByBookId = new Map<string, BookCopyRecord[]>();
  const seenCopyIds = new Set<string>();
  for (const cp of bookCopies) {
    const cid = (cp.copyId || '').trim();
    if (cid) {
      if (seenCopyIds.has(cid)) continue;
      seenCopyIds.add(cid);
    }
    const isPhysicallyOnShelf =
      cp.copyStatus !== 'missing' &&
      cp.copyStatus !== 'out_of_collection' &&
      cp.copyStatus !== 'loaned' &&
      cp.loanOrMoveStatus !== 'امانت به پژوهشگر';
    if (!isPhysicallyOnShelf) continue;

    const bid = (cp.bookId || '').trim();
    if (!bid) continue;
    const list = activeCopiesByBookId.get(bid) || [];
    list.push(cp);
    activeCopiesByBookId.set(bid, list);
  }

  const handledRowKeys = new Set<string>();
  const handledBookIdsWithCopies = new Set<string>();

  const processBookEntry = (
    bookKey: string,
    bookId: string,
    audit?: FieldAuditRecord,
    fallbackLoc?: string,
    fallbackCopies?: string
  ) => {
    const cleanBookId = (bookId || '').trim();
    const explicitCopies = cleanBookId ? activeCopiesByBookId.get(cleanBookId) || [] : [];

    // If marked missing/not_found/out_of_collection in audit, ignore catalog/audit fallback
    const isAuditNotOnShelf =
      audit &&
      (audit.physical === 'not_found' ||
        audit.copyStatus === 'missing' ||
        audit.copyStatus === 'out_of_collection' ||
        audit.copyStatus === 'loaned');

    if (explicitCopies.length > 0) {
      handledBookIdsWithCopies.add(cleanBookId);
      for (const cp of explicitCopies) {
        const parsed = parseShelfAndLevelFromLocation(cp.location, cp.shelf, cp.level);
        if (parsed.shelf) {
          addVolume(parsed.shelf, parsed.level, cleanBookId || bookKey, 1);
        }
      }
      // Account for extra countedCopies in audit only if audit isn't missing and exceeds explicit CP count
      if (audit && !isAuditNotOnShelf) {
        const auditParsed = parseShelfAndLevelFromLocation(audit.location, audit.shelf, audit.level);
        const totalAuditCount = parsePositiveCopiesCount(audit.countedCopies, 1);
        if (auditParsed.shelf && totalAuditCount > explicitCopies.length) {
          addVolume(
            auditParsed.shelf,
            auditParsed.level,
            cleanBookId || bookKey,
            totalAuditCount - explicitCopies.length
          );
        }
      }
      return;
    }

    if (isAuditNotOnShelf) return;

    if (audit) {
      const parsed = parseShelfAndLevelFromLocation(audit.location, audit.shelf, audit.level);
      if (parsed.shelf) {
        const count = parsePositiveCopiesCount(audit.countedCopies, 1);
        addVolume(parsed.shelf, parsed.level, cleanBookId || bookKey, count);
      }
      return;
    }

    if (fallbackLoc) {
      const parsed = parseShelfAndLevelFromLocation(fallbackLoc);
      if (parsed.shelf) {
        const count = parsePositiveCopiesCount(fallbackCopies, 1);
        addVolume(parsed.shelf, parsed.level, cleanBookId || bookKey, count);
      }
    }
  };

  for (const row of catalogRows) {
    handledRowKeys.add(row.rowKey);
    const audit = auditRecords[row.rowKey];
    processBookEntry(
      row.rowKey,
      audit?.tempBookId || row.tempBookId,
      audit,
      row.locationRaw,
      row.countedCopiesRaw
    );
  }

  for (const [key, audit] of Object.entries(auditRecords)) {
    const resolvedKey = audit.key || key;
    if (handledRowKeys.has(resolvedKey)) continue;
    handledRowKeys.add(resolvedKey);
    processBookEntry(resolvedKey, audit.tempBookId, audit);
  }

  // Any remaining active CP copies whose bookId wasn't in catalogRows or auditRecords
  for (const [bid, copies] of activeCopiesByBookId.entries()) {
    if (handledBookIdsWithCopies.has(bid)) continue;
    for (const cp of copies) {
      const parsed = parseShelfAndLevelFromLocation(cp.location, cp.shelf, cp.level);
      if (parsed.shelf) {
        addVolume(parsed.shelf, parsed.level, bid, 1);
      }
    }
  }

  const shelves: ShelfOccupancyStatus[] = SHELVES.map((sh) => {
    const shelfCapacity = resolvedCapacities[sh.code];
    const perLevelCapacity = Math.max(1, Math.round(shelfCapacity / LEVELS.length));
    const occupiedVolumesCount = shelfVolumes.get(sh.code) || 0;
    const occupiedBooksCount = shelfBookIds.get(sh.code)?.size || 0;
    const fillPercent =
      shelfCapacity > 0 ? Math.round((occupiedVolumesCount / shelfCapacity) * 1000) / 10 : 0;
    const isOverWarningThreshold = fillPercent > thresholdPercent;
    const severity: CapacityAlertSeverity =
      fillPercent >= SHELF_CRITICAL_THRESHOLD_PERCENT
        ? 'critical'
        : isOverWarningThreshold
        ? 'warning'
        : 'normal';

    const levels: LevelOccupancyStatus[] = LEVELS.map((lv) => {
      const locCode = `${sh.code}-${lv.code}`;
      const lvVolumes = levelVolumes.get(locCode) || 0;
      const lvBooks = levelBookIds.get(locCode)?.size || 0;
      const lvPercent =
        perLevelCapacity > 0 ? Math.round((lvVolumes / perLevelCapacity) * 1000) / 10 : 0;
      const lvOver = lvPercent > thresholdPercent;
      const lvSeverity: CapacityAlertSeverity =
        lvPercent >= SHELF_CRITICAL_THRESHOLD_PERCENT
          ? 'critical'
          : lvOver
          ? 'warning'
          : 'normal';
      return {
        shelf: sh.code,
        level: lv.code,
        locationCode: locCode,
        title: lv.title,
        occupiedBooksCount: lvBooks,
        occupiedVolumesCount: lvVolumes,
        capacity: perLevelCapacity,
        fillPercent: lvPercent,
        remainingCapacity: Math.max(0, perLevelCapacity - lvVolumes),
        isOverWarningThreshold: lvOver,
        severity: lvSeverity
      };
    });

    return {
      shelf: sh.code,
      title: sh.title,
      summary: sh.summary,
      occupiedBooksCount,
      occupiedVolumesCount,
      capacity: shelfCapacity,
      fillPercent,
      remainingCapacity: Math.max(0, shelfCapacity - occupiedVolumesCount),
      isOverWarningThreshold,
      severity,
      levels,
      overThresholdLevels: levels.filter((lv) => lv.isOverWarningThreshold)
    };
  });

  const alertedShelves = shelves
    .filter((s) => s.isOverWarningThreshold)
    .sort((a, b) => b.fillPercent - a.fillPercent);

  const alertedLevels = shelves
    .flatMap((s) => s.overThresholdLevels)
    .sort((a, b) => b.fillPercent - a.fillPercent);

  const totalOccupiedVolumes = shelves.reduce((sum, s) => sum + s.occupiedVolumesCount, 0);
  const totalLibraryCapacity = shelves.reduce((sum, s) => sum + s.capacity, 0);
  const overallFillPercent =
    totalLibraryCapacity > 0
      ? Math.round((totalOccupiedVolumes / totalLibraryCapacity) * 1000) / 10
      : 0;

  const highestFillShelf =
    shelves.length > 0
      ? [...shelves].sort((a, b) => b.fillPercent - a.fillPercent)[0]
      : null;

  return {
    thresholdPercent,
    shelves,
    alertedShelves,
    alertedLevels,
    totalOccupiedVolumes,
    totalLibraryCapacity,
    overallFillPercent,
    highestFillShelf
  };
}
