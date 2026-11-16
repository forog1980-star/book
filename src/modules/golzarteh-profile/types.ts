export type GolzartehMatchBasis =
  | 'exact_name_father_tomb'
  | 'exact_name_father_tomb_diff'
  | 'exact_name_tomb'
  | 'exact_name_father_only'
  | 'normalized_name_father'
  | 'manual_pin';

export type GolzartehPhotoCategory = 'personnel' | 'sacred_defense' | 'tomb';

export interface GolzartehPhotoItem {
  id: string;
  category: GolzartehPhotoCategory;
  url: string;
  caption: string;
  source: 'golzarteh.ir' | 'local_upload' | 'library';
  addedAt?: string;
}

export interface GolzartehIndexRecord {
  /** Local key in golzar_martyrs.xlsx ("golzar:row" or "outside:row") */
  localKey: string;
  /** Official golzarteh.ir ID */
  gid: number;
  /** URL slug on golzarteh.ir (e.g., "سعید-آئینه-وند-6012") */
  slug: string;
  /** Official names & fatherName on golzarteh.ir */
  firstName: string;
  lastName: string;
  fatherName: string;
  /** Official golzarInfoCode & uniqueCode */
  golzarInfoCode: number | null;
  uniqueCode: string;
  /** Grave location stored on golzarteh.ir */
  section: string;
  row: string;
  number: string;
  latitude: string | null;
  longitude: string | null;
  /** Official photo UUIDs on api.golzarteh.ir */
  mainPhoto: string;
  thumbnailKey: string;
  tombPhotos: string[];
  /** Match metrics */
  matchScore: number;
  matchBasis: GolzartehMatchBasis;
  tombMismatch: boolean;
}

export interface GolzartehEnrichedDetail {
  gid: number;
  slug: string;
  officialUrl: string;
  firstName: string;
  lastName: string;
  fatherName: string;
  birthDateDisplay: string;
  birthYear: string;
  birthPlace: string;
  martyrdomDateDisplay: string;
  martyrdomYear: string;
  martyrdomPlace: string;
  age: number | null;
  operation: string;
  education: string;
  job: string;
  militaryResponsibility: string;
  deploymentCategory: string;
  section: string;
  row: string;
  number: string;
  latitude: string | null;
  longitude: string | null;
  biography: string;
  wills: Array<{ id?: number; title?: string; text: string }>;
  mainPhoto: string;
  thumbnailKey: string;
  martyrPhotos: string[];
  tombPhotos: string[];
  syncedAt: string;
}

export interface MartyrLocalProfileOverride {
  key: string;
  fullName: string;
  fatherName?: string;
  customBirthDate?: string;
  customMartyrdomDate?: string;
  customBiography?: string;
  customWillText?: string;
  customPhotos: GolzartehPhotoItem[];
  pinnedGolzartehId?: number;
  verifiedForGolzartehSync?: boolean;
  expertSyncNote?: string;
  updatedAt: string;
}

export interface GolzartehCompactIndexFile {
  schemaVersion: string;
  generatedAt: string;
  sourceTotalOnGolzarteh: number;
  localTotalMartyrs: number;
  matchedCount: number;
  tombMismatchCount: number;
  /**
   * Compact tuple columns for minimal PWA footprint:
   * [0: localKey, 1: gid, 2: slug, 3: firstName, 4: lastName, 5: fatherName,
   *  6: golzarInfoCode, 7: uniqueCode, 8: section, 9: row, 10: number,
   *  11: mainPhoto, 12: thumbnailKey, 13: tombPhoto0, 14: lat, 15: lng,
   *  16: matchScore, 17: matchBasis, 18: tombMismatch (0|1)]
   */
  columns: string[];
  rows: Array<
    [
      string,
      number,
      string,
      string,
      string,
      string,
      number | null,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string | null,
      string | null,
      number,
      GolzartehMatchBasis,
      0 | 1
    ]
  >;
}

export interface GolzartehProfilesBundleFile {
  schemaVersion: string;
  generatedAt: string;
  profileCount: number;
  profilesByGid: Record<string, GolzartehEnrichedDetail>;
}

export interface ResolvedMartyrComprehensiveProfile {
  localKey: string;
  fullName: string;
  firstName: string;
  lastName: string;
  fatherName: string;
  birthDateDisplay: string;
  birthPlace: string;
  martyrdomDateDisplay: string;
  martyrdomPlace: string;
  ageDisplay: string;
  operation: string;
  education: string;
  job: string;
  militaryResponsibility: string;
  deploymentCategory: string;
  localGrave: {
    piece: string;
    row: string;
    number: string;
    sourceLabel: string;
  };
  officialGrave: {
    section: string;
    row: string;
    number: string;
    latitude: string | null;
    longitude: string | null;
  } | null;
  golzartehMatch: GolzartehIndexRecord | null;
  golzartehUrl: string | null;
  tombMismatch: boolean;
  biography: string;
  biographySource: 'golzarteh.ir' | 'library' | 'expert_edit' | 'none';
  willText: string;
  willSource: 'golzarteh.ir' | 'library' | 'expert_edit' | 'none';
  photos: GolzartehPhotoItem[];
  override: MartyrLocalProfileOverride | null;
}
