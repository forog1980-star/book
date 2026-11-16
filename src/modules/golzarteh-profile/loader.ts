import { ExtractedContentItem, BookMartyrLinkRecord, normalizePersianText } from '../../data/markazAsnadData';
import {
  areTombCoordsSame,
  compactNameKey,
  matchGolzartehEntryByNameAndFather
} from './matcher';
import {
  GolzartehCompactIndexFile,
  GolzartehEnrichedDetail,
  GolzartehIndexRecord,
  GolzartehMatchBasis,
  GolzartehPhotoItem,
  GolzartehProfilesBundleFile,
  MartyrLocalProfileOverride,
  ResolvedMartyrComprehensiveProfile
} from './types';

export const GOLZARTEH_OVERRIDES_STORAGE_KEY = 'markaz_golzarteh_profile_overrides_v1';

export const GOLZARTEH_MODULE_CONFIG = {
  enabled: true,
  indexUrl: './data/golzarteh_index.json',
  profilesUrl: './data/golzarteh_profiles.json',
  baseWebsiteUrl: 'https://golzarteh.ir',
  baseFileApiUrl: 'https://api.golzarteh.ir/api/v1/files/download'
};

export interface GolzartehDatasetRuntimeState {
  status: 'idle' | 'loading' | 'ready' | 'unavailable';
  errorMessage: string | null;
  matchedCount: number;
  tombMismatchCount: number;
  enrichedProfilesCount: number;
  sourceTotalOnGolzarteh: number;
  recordsByLocalKey: Record<string, GolzartehIndexRecord>;
  recordsByGid: Record<number, GolzartehIndexRecord>;
  allRecords: GolzartehIndexRecord[];
  profilesByGid: Record<string, GolzartehEnrichedDetail>;
}

const runtimeState: GolzartehDatasetRuntimeState = {
  status: 'idle',
  errorMessage: null,
  matchedCount: 0,
  tombMismatchCount: 0,
  enrichedProfilesCount: 0,
  sourceTotalOnGolzarteh: 0,
  recordsByLocalKey: {},
  recordsByGid: {},
  allRecords: [],
  profilesByGid: {}
};

let inFlightPromise: Promise<GolzartehDatasetRuntimeState> | null = null;
const listeners = new Set<() => void>();

export function subscribeGolzartehDataset(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore listener errors
    }
  });
}

export function getGolzartehDatasetState(): GolzartehDatasetRuntimeState {
  return runtimeState;
}

export function buildGolzartehFileUrl(uuidOrUrl: string): string {
  const clean = String(uuidOrUrl || '').trim();
  if (!clean) return '';
  if (/^(https?:|data:|blob:|\.\/|\/)/i.test(clean)) return clean;
  return `${GOLZARTEH_MODULE_CONFIG.baseFileApiUrl}/${encodeURIComponent(clean)}`;
}

export function buildGolzartehOfficialPageUrl(slugOrEmpty: string, gid: number, fullName?: string): string {
  const cleanSlug = String(slugOrEmpty || '').trim();
  if (cleanSlug) {
    return `${GOLZARTEH_MODULE_CONFIG.baseWebsiteUrl}/martyr/${encodeURIComponent(cleanSlug)}`;
  }
  const safeName = String(fullName || 'شهید').trim().replace(/\s+/g, '-');
  return `${GOLZARTEH_MODULE_CONFIG.baseWebsiteUrl}/martyr/${encodeURIComponent(`${safeName}-${gid}`)}`;
}

function unpackCompactIndex(file: GolzartehCompactIndexFile): {
  byLocalKey: Record<string, GolzartehIndexRecord>;
  byGid: Record<number, GolzartehIndexRecord>;
  all: GolzartehIndexRecord[];
} {
  const byLocalKey: Record<string, GolzartehIndexRecord> = {};
  const byGid: Record<number, GolzartehIndexRecord> = {};
  const all: GolzartehIndexRecord[] = [];

  const rows = Array.isArray(file?.rows) ? file.rows : [];
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 18) continue;
    const rec: GolzartehIndexRecord = {
      localKey: String(r[0] || ''),
      gid: Number(r[1]),
      slug: String(r[2] || ''),
      firstName: String(r[3] || ''),
      lastName: String(r[4] || ''),
      fatherName: String(r[5] || ''),
      golzarInfoCode: r[6] === null || r[6] === undefined ? null : Number(r[6]),
      uniqueCode: String(r[7] || ''),
      section: String(r[8] || ''),
      row: String(r[9] || ''),
      number: String(r[10] || ''),
      mainPhoto: String(r[11] || ''),
      thumbnailKey: String(r[12] || ''),
      tombPhotos: r[13] ? [String(r[13])] : [],
      latitude: r[14] ? String(r[14]) : null,
      longitude: r[15] ? String(r[15]) : null,
      matchScore: Number(r[16] || 0),
      matchBasis: (r[17] || 'normalized_name_father') as GolzartehMatchBasis,
      tombMismatch: Boolean(r[18])
    };
    if (rec.localKey) {
      byLocalKey[rec.localKey] = rec;
    }
    if (rec.gid && !byGid[rec.gid]) {
      byGid[rec.gid] = rec;
    }
    all.push(rec);
  }

  return { byLocalKey, byGid, all };
}

export async function loadGolzartehDataset(forceReload = false): Promise<GolzartehDatasetRuntimeState> {
  if (!GOLZARTEH_MODULE_CONFIG.enabled) {
    runtimeState.status = 'unavailable';
    return runtimeState;
  }
  if (runtimeState.status === 'ready' && !forceReload) {
    return runtimeState;
  }
  if (inFlightPromise && !forceReload) {
    return inFlightPromise;
  }

  runtimeState.status = 'loading';
  runtimeState.errorMessage = null;
  notifyListeners();

  inFlightPromise = (async () => {
    try {
      const [indexRes, profilesRes] = await Promise.all([
        fetch(GOLZARTEH_MODULE_CONFIG.indexUrl),
        fetch(GOLZARTEH_MODULE_CONFIG.profilesUrl).catch(() => null)
      ]);

      if (!indexRes.ok) {
        throw new Error(`HTTP ${indexRes.status}`);
      }

      const indexJson = (await indexRes.json()) as GolzartehCompactIndexFile;
      const unpacked = unpackCompactIndex(indexJson);

      let profilesByGid: Record<string, GolzartehEnrichedDetail> = {};
      if (profilesRes && profilesRes.ok) {
        const profilesJson = (await profilesRes.json()) as GolzartehProfilesBundleFile;
        profilesByGid = profilesJson?.profilesByGid || {};
      }

      runtimeState.recordsByLocalKey = unpacked.byLocalKey;
      runtimeState.recordsByGid = unpacked.byGid;
      runtimeState.allRecords = unpacked.all;
      runtimeState.profilesByGid = profilesByGid;
      runtimeState.matchedCount = indexJson.matchedCount || unpacked.all.length;
      runtimeState.tombMismatchCount = indexJson.tombMismatchCount || 0;
      runtimeState.enrichedProfilesCount = Object.keys(profilesByGid).length;
      runtimeState.sourceTotalOnGolzarteh = indexJson.sourceTotalOnGolzarteh || 0;
      runtimeState.status = 'ready';
      runtimeState.errorMessage = null;
      notifyListeners();
      return runtimeState;
    } catch (err) {
      runtimeState.status = 'unavailable';
      runtimeState.errorMessage =
        err instanceof Error ? err.message : 'خطا در بارگذاری بسته نگاشت golzarteh.ir';
      notifyListeners();
      return runtimeState;
    } finally {
      inFlightPromise = null;
    }
  })();

  return inFlightPromise;
}

export function loadAllMartyrProfileOverrides(): Record<string, MartyrLocalProfileOverride> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(GOLZARTEH_OVERRIDES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveMartyrProfileOverride(
  override: MartyrLocalProfileOverride
): Record<string, MartyrLocalProfileOverride> {
  const all = loadAllMartyrProfileOverrides();
  const next = {
    ...all,
    [override.key]: {
      ...override,
      updatedAt: new Date().toISOString()
    }
  };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(GOLZARTEH_OVERRIDES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage quota errors gracefully
    }
  }
  notifyListeners();
  return next;
}

export function getMatchBasisLabelFa(basis: GolzartehMatchBasis): string {
  switch (basis) {
    case 'exact_name_father_tomb':
      return 'تطبیق قطعی (نام + نام پدر + نشانی مزار)';
    case 'exact_name_father_tomb_diff':
      return 'تطبیق هویتی بر پایه نام و نام پدر (با اختلاف نشانی مزار)';
    case 'exact_name_tomb':
      return 'تطبیق نام و نشانی دقیق مزار';
    case 'exact_name_father_only':
      return 'تطبیق نام و نام پدر (فاقد ثبت مزار هم‌شماره)';
    case 'manual_pin':
      return 'اتصال تأییدشده توسط کارشناس';
    default:
      return 'تطبیق چندشاخصی نام و مشخصات';
  }
}

export interface ResolveMartyrInput {
  localKey: string;
  firstName?: string;
  lastName?: string;
  fullName: string;
  fatherName?: string;
  birthDateDisplay?: string;
  martyrdomDateDisplay?: string;
  ageDisplay?: string;
  operation?: string;
  martyrdomLocation?: string;
  gravePiece?: string;
  graveRow?: string;
  graveNumber?: string;
  graveSourceLabel?: string;
  extractedItems?: ExtractedContentItem[];
  bookLinks?: BookMartyrLinkRecord[];
}

export function resolveComprehensiveMartyrProfile(
  input: ResolveMartyrInput
): ResolvedMartyrComprehensiveProfile {
  const overrides = loadAllMartyrProfileOverrides();
  const normKey = `name:${compactNameKey(input.fullName)}`;
  const override = overrides[input.localKey] || overrides[normKey] || null;

  // 1. Find Golzarteh match via localKey, pinned GID, or name+father+grave matcher
  let match: GolzartehIndexRecord | null = null;
  if (override?.pinnedGolzartehId && runtimeState.recordsByGid[override.pinnedGolzartehId]) {
    match = {
      ...runtimeState.recordsByGid[override.pinnedGolzartehId],
      matchBasis: 'manual_pin',
      matchScore: 100
    };
  } else if (input.localKey && runtimeState.recordsByLocalKey[input.localKey]) {
    match = runtimeState.recordsByLocalKey[input.localKey];
  } else if (runtimeState.allRecords.length > 0) {
    match = matchGolzartehEntryByNameAndFather(
      runtimeState.allRecords,
      input.fullName,
      input.fatherName,
      {
        piece: input.gravePiece,
        row: input.graveRow,
        number: input.graveNumber
      }
    );
  }

  const enrichedDetail: GolzartehEnrichedDetail | null = match
    ? runtimeState.profilesByGid[String(match.gid)] || null
    : null;

  // 2. Collect library extracted biographies & wills for this martyr
  const cleanTargetName = compactNameKey(input.fullName);
  const matchingExtracts = (input.extractedItems || []).filter((ex) => {
    const exName = compactNameKey(ex.martyrNameRaw);
    return exName && cleanTargetName && (exName === cleanTargetName || exName.includes(cleanTargetName) || cleanTargetName.includes(exName));
  });

  const libraryBiographies = matchingExtracts
    .filter((ex) => ex.contentType === 'زندگی‌نامه' || ex.contentType === 'خاطره')
    .map((ex) => `• ${ex.passageTitle} (کتاب «${ex.bookTitleRaw}»، ص ${ex.pageReferenceRaw || '—'}):\n${ex.extractedText}`);

  const libraryWills = matchingExtracts
    .filter((ex) => ex.contentType === 'وصیت‌نامه')
    .map((ex) => `• ${ex.passageTitle} (کتاب «${ex.bookTitleRaw}»، ص ${ex.pageReferenceRaw || '—'}):\n${ex.extractedText}`);

  // 3. Resolve Biography & Will with clear source attribution
  let biography = '';
  let biographySource: ResolvedMartyrComprehensiveProfile['biographySource'] = 'none';
  if (override?.customBiography?.trim()) {
    biography = override.customBiography.trim();
    biographySource = 'expert_edit';
  } else if (enrichedDetail?.biography?.trim()) {
    biography = enrichedDetail.biography.trim();
    if (libraryBiographies.length > 0) {
      biography += `\n\n--- گزیده مستخرج از کتاب‌های کتابخانه ---\n${libraryBiographies.join('\n\n')}`;
    }
    biographySource = 'golzarteh.ir';
  } else if (libraryBiographies.length > 0) {
    biography = libraryBiographies.join('\n\n');
    biographySource = 'library';
  }

  let willText = '';
  let willSource: ResolvedMartyrComprehensiveProfile['willSource'] = 'none';
  if (override?.customWillText?.trim()) {
    willText = override.customWillText.trim();
    willSource = 'expert_edit';
  } else if (enrichedDetail?.wills && enrichedDetail.wills.length > 0) {
    willText = enrichedDetail.wills
      .map((w) => (w.title ? `${w.title}\n${w.text}` : w.text))
      .join('\n\n──────────\n\n');
    if (libraryWills.length > 0) {
      willText += `\n\n--- وصیت‌نامه/فرازهای ثبت‌شده در کتابخانه ---\n${libraryWills.join('\n\n')}`;
    }
    willSource = 'golzarteh.ir';
  } else if (libraryWills.length > 0) {
    willText = libraryWills.join('\n\n');
    willSource = 'library';
  }

  // 4. Build categorized image gallery (Personnel, Sacred Defense, Grave Headstone)
  const photos: GolzartehPhotoItem[] = [];
  const seenUrls = new Set<string>();
  const pushPhoto = (item: GolzartehPhotoItem) => {
    if (!item.url || seenUrls.has(item.url)) return;
    seenUrls.add(item.url);
    photos.push(item);
  };

  const mainUuid = enrichedDetail?.mainPhoto || match?.mainPhoto || match?.thumbnailKey || '';
  if (mainUuid) {
    pushPhoto({
      id: `gt-main-${mainUuid}`,
      category: 'personnel',
      url: buildGolzartehFileUrl(mainUuid),
      caption: `عکس پرسنلی شهید ${input.fullName} (سایت رسمی golzarteh.ir)`,
      source: 'golzarteh.ir'
    });
  }

  const extraMartyrPhotos = enrichedDetail?.martyrPhotos || [];
  extraMartyrPhotos.forEach((uuid, idx) => {
    const url = buildGolzartehFileUrl(uuid);
    if (url && !seenUrls.has(url)) {
      pushPhoto({
        id: `gt-def-${uuid}`,
        category: 'sacred_defense',
        url,
        caption: `تصویر دوران دفاع مقدس / آرشیو شهید (${idx + 1})`,
        source: 'golzarteh.ir'
      });
    }
  });

  const tombUuids =
    enrichedDetail?.tombPhotos && enrichedDetail.tombPhotos.length > 0
      ? enrichedDetail.tombPhotos
      : match?.tombPhotos || [];
  tombUuids.forEach((uuid, idx) => {
    const url = buildGolzartehFileUrl(uuid);
    if (url) {
      pushPhoto({
        id: `gt-tomb-${uuid}`,
        category: 'tomb',
        url,
        caption: `تصویر سنگ مزار شهید ${input.fullName}${tombUuids.length > 1 ? ` (${idx + 1})` : ''}`,
        source: 'golzarteh.ir'
      });
    }
  });

  if (override?.customPhotos && Array.isArray(override.customPhotos)) {
    override.customPhotos.forEach((cp) => pushPhoto(cp));
  }

  // 5. Reconcile official vs local grave coordinates
  const officialGrave = match
    ? {
        section: enrichedDetail?.section || match.section || '',
        row: enrichedDetail?.row || match.row || '',
        number: enrichedDetail?.number || match.number || '',
        latitude: enrichedDetail?.latitude ?? match.latitude ?? null,
        longitude: enrichedDetail?.longitude ?? match.longitude ?? null
      }
    : null;

  const tombMismatch = officialGrave
    ? !areTombCoordsSame(
        { piece: input.gravePiece, row: input.graveRow, number: input.graveNumber },
        officialGrave
      ) &&
      Boolean(input.gravePiece && input.gravePiece !== '—') &&
      Boolean(officialGrave.section)
    : false;

  const golzartehUrl = match
    ? enrichedDetail?.officialUrl ||
      buildGolzartehOfficialPageUrl(match.slug, match.gid, input.fullName)
    : null;

  return {
    localKey: input.localKey,
    fullName: input.fullName,
    firstName: enrichedDetail?.firstName || match?.firstName || input.firstName || '',
    lastName: enrichedDetail?.lastName || match?.lastName || input.lastName || '',
    fatherName: enrichedDetail?.fatherName || match?.fatherName || input.fatherName || '',
    birthDateDisplay:
      override?.customBirthDate ||
      enrichedDetail?.birthDateDisplay ||
      input.birthDateDisplay ||
      '',
    birthPlace: enrichedDetail?.birthPlace || '',
    martyrdomDateDisplay:
      override?.customMartyrdomDate ||
      enrichedDetail?.martyrdomDateDisplay ||
      input.martyrdomDateDisplay ||
      '',
    martyrdomPlace: enrichedDetail?.martyrdomPlace || input.martyrdomLocation || '',
    ageDisplay:
      input.ageDisplay ||
      (enrichedDetail?.age !== null && enrichedDetail?.age !== undefined
        ? String(enrichedDetail.age)
        : ''),
    operation: enrichedDetail?.operation || input.operation || '',
    education: enrichedDetail?.education || '',
    job: enrichedDetail?.job || '',
    militaryResponsibility: enrichedDetail?.militaryResponsibility || '',
    deploymentCategory: enrichedDetail?.deploymentCategory || '',
    localGrave: {
      piece: input.gravePiece || '—',
      row: input.graveRow || '—',
      number: input.graveNumber || '—',
      sourceLabel: input.graveSourceLabel || 'بانک جامع کتابخانه'
    },
    officialGrave,
    golzartehMatch: match,
    golzartehUrl,
    tombMismatch,
    biography,
    biographySource,
    willText,
    willSource,
    photos,
    override
  };
}

export function buildBidirectionalGolzartehSyncPackage(params: {
  profiles: ResolvedMartyrComprehensiveProfile[];
  links: BookMartyrLinkRecord[];
  extractedItems: ExtractedContentItem[];
  scopeLabel: string;
}) {
  const { profiles, links, extractedItems, scopeLabel } = params;
  return {
    schema_version: 'markaz-golzarteh-sync-v1.0',
    source_system: 'مرکز اسناد و کتابخانه گلزار شهدای تهران',
    target_website: 'https://golzarteh.ir',
    exported_at: new Date().toISOString(),
    scope: scopeLabel,
    total_profiles: profiles.length,
    martyrs: profiles.map((p) => {
      const targetNorm = normalizePersianText(p.fullName.replace(/^شهید\s+/, ''));
      const matchedLinks = links.filter((l) => {
        const lNorm = normalizePersianText((l.martyrNameRaw || '').replace(/^شهید\s+/, ''));
        return lNorm && (lNorm === targetNorm || lNorm.includes(targetNorm) || targetNorm.includes(lNorm));
      });
      const matchedExtracts = extractedItems.filter((ex) => {
        const exNorm = normalizePersianText((ex.martyrNameRaw || '').replace(/^شهید\s+/, ''));
        return exNorm && (exNorm === targetNorm || exNorm.includes(targetNorm) || targetNorm.includes(exNorm));
      });
      return {
        local_key: p.localKey,
        golzarteh_id: p.golzartehMatch?.gid || null,
        golzar_info_code: p.golzartehMatch?.golzarInfoCode || null,
        unique_code: p.golzartehMatch?.uniqueCode || null,
        golzarteh_url: p.golzartehUrl,
        match_score: p.golzartehMatch?.matchScore || 0,
        match_basis: p.golzartehMatch?.matchBasis || null,
        tomb_mismatch_detected: p.tombMismatch,
        identity: {
          full_name: p.fullName,
          first_name: p.firstName,
          last_name: p.lastName,
          father_name: p.fatherName,
          birth_date: p.birthDateDisplay,
          birth_place: p.birthPlace,
          martyrdom_date: p.martyrdomDateDisplay,
          martyrdom_place: p.martyrdomPlace,
          age: p.ageDisplay,
          operation: p.operation
        },
        grave_comparison: {
          library_excel: p.localGrave,
          golzarteh_official: p.officialGrave
        },
        biography: {
          source: p.biographySource,
          text: p.biography
        },
        will: {
          source: p.willSource,
          text: p.willText
        },
        gallery: p.photos.map((ph) => ({
          id: ph.id,
          category: ph.category,
          url: ph.url,
          caption: ph.caption,
          source: ph.source
        })),
        library_linked_books: matchedLinks.map((lnk) => ({
          link_id: lnk.id,
          temp_book_id: lnk.tempBookId,
          book_title: lnk.bookTitleRaw,
          publisher: lnk.publisherRaw,
          page_reference: lnk.pageReferenceRaw,
          review_status: lnk.reviewStatus,
          description: lnk.sourceDescriptionRaw
        })),
        library_extracted_passages: matchedExtracts.map((ex) => ({
          id: ex.id,
          content_type: ex.contentType,
          passage_title: ex.passageTitle,
          book_title: ex.bookTitleRaw,
          page_reference: ex.pageReferenceRaw,
          text: ex.extractedText
        }))
      };
    })
  };
}
