import assert from 'node:assert/strict';
import {
  matchGolzartehEntryByNameAndFather,
  normalizeGolzartehPersian,
  normalizeGolzartehPersonName,
  scoreGolzartehCandidateMatch
} from './matcher';
import { buildBidirectionalGolzartehSyncPackage } from './loader';
import {
  computeProfileFingerprint,
  determineChangePriority,
  mergeMartyrChangeWithoutCorruption,
  type MartyrProfileSyncQueueItem
} from './backgroundSync';
import { GolzartehIndexRecord, ResolvedMartyrComprehensiveProfile } from './types';

// 1. نرمال‌سازی حروف عربی/فارسی، اعداد فارسی و القاب
assert.equal(normalizeGolzartehPersian('علي‌اصغر آئينه‌وند ۱۲'), 'علی اصغر ایینه وند 12');
assert.equal(normalizeGolzartehPersonName('سردار شهید حسن باقری'), 'حسن باقری');

// 2. تطبیق قطعی نام، نام پدر و نشانی مزار
const exactRes = scoreGolzartehCandidateMatch(
  {
    localKey: 'golzar:2',
    firstName: 'منوچهر',
    lastName: 'شجاعی',
    fatherName: 'محمد',
    piece: '17',
    row: '80',
    number: '48'
  },
  {
    gid: 21724,
    firstName: 'منوچهر',
    lastName: 'شجاعی',
    fatherName: 'محمد',
    section: '17',
    row: '80',
    number: '48'
  }
);
assert.equal(exactRes.score, 100);
assert.equal(exactRes.basis, 'exact_name_father_tomb');
assert.equal(exactRes.tombMismatch, false);

// 3. تطبیق هویتی بدون رد کردن پرونده در صورت اختلاف آدرس مزار (ثبت هشدار tombMismatch)
const diffTombRes = scoreGolzartehCandidateMatch(
  {
    localKey: 'golzar:55',
    firstName: 'محمد ابراهیم',
    lastName: 'همت',
    fatherName: 'اصغر',
    piece: '24',
    row: '1',
    number: '12'
  },
  {
    gid: 66,
    firstName: 'محمدابراهیم',
    lastName: 'همت',
    fatherName: 'اصغر',
    section: '24',
    row: '2',
    number: '15'
  }
);
assert.ok(diffTombRes.score >= 70, 'Identity should match strongly on full name + fatherName even when tomb differs');
assert.equal(diffTombRes.basis, 'exact_name_father_tomb_diff');
assert.equal(diffTombRes.tombMismatch, true);

// 4. جلوگیری از اشتباه هم‌نام‌ها وقتی نام پدر و مزار هر دو متفاوت است
const homonymConflict = scoreGolzartehCandidateMatch(
  {
    localKey: 'golzar:100',
    firstName: 'علی',
    lastName: 'رضایی',
    fatherName: 'حسن',
    piece: '21',
    row: '10',
    number: '4'
  },
  {
    gid: 9001,
    firstName: 'علی',
    lastName: 'رضایی',
    fatherName: 'تقی',
    section: '44',
    row: '3',
    number: '19'
  }
);
assert.equal(homonymConflict.score, 0);

// 5. تفکیک درست میان دو هم‌نام بر اساس نام پدر در تابع matchGolzartehEntryByNameAndFather
const entries: GolzartehIndexRecord[] = [
  {
    localKey: 'golzar:10',
    gid: 101,
    slug: 'علی-محمدی-101',
    firstName: 'علی',
    lastName: 'محمدی',
    fatherName: 'اکبر',
    golzarInfoCode: 1,
    uniqueCode: '2401001',
    section: '24',
    row: '1',
    number: '1',
    mainPhoto: 'uuid-1',
    thumbnailKey: 'uuid-1t',
    tombPhotos: ['uuid-1-tomb'],
    latitude: null,
    longitude: null,
    matchScore: 75,
    matchBasis: 'exact_name_father_only',
    tombMismatch: false
  },
  {
    localKey: 'golzar:11',
    gid: 202,
    slug: 'علی-محمدی-202',
    firstName: 'علی',
    lastName: 'محمدی',
    fatherName: 'حسین',
    golzarInfoCode: 2,
    uniqueCode: '2605012',
    section: '26',
    row: '5',
    number: '12',
    mainPhoto: 'uuid-2',
    thumbnailKey: 'uuid-2t',
    tombPhotos: ['uuid-2-tomb'],
    latitude: null,
    longitude: null,
    matchScore: 75,
    matchBasis: 'exact_name_father_only',
    tombMismatch: false
  }
];
const matchedSecond = matchGolzartehEntryByNameAndFather(entries, 'شهید علی محمدی', 'حسین');
assert.equal(matchedSecond?.gid, 202);

// 6. تولید بسته استاندارد تبادل دوجانبه JSON با سایت golzarteh.ir
const sampleResolved: ResolvedMartyrComprehensiveProfile = {
  localKey: 'golzar:2',
  fullName: 'سعید آئینه‌وند',
  firstName: 'سعید',
  lastName: 'آئینه‌وند',
  fatherName: 'حیدر',
  birthDateDisplay: '۱ مرداد ۱۳۴۳',
  birthPlace: 'تهران',
  martyrdomDateDisplay: '۱۸ اسفند ۱۳۶۳',
  martyrdomPlace: 'جزیره مجنون',
  ageDisplay: '۲۰',
  operation: 'عملیات بدر',
  education: 'دیپلم',
  job: 'دانشجو',
  militaryResponsibility: 'بی‌سیم‌چی',
  deploymentCategory: 'بسیج',
  localGrave: { piece: '۵۰', row: '۱۲', number: '۴', sourceLabel: 'بانک جامع کتابخانه' },
  officialGrave: { section: '۵۰', row: '۱۲', number: '۴', latitude: '35.53', longitude: '51.37' },
  golzartehMatch: {
    localKey: 'golzar:2',
    gid: 6012,
    slug: 'سعید-آئینه-وند-6012',
    firstName: 'سعید',
    lastName: 'آئینه‌وند',
    fatherName: 'حیدر',
    golzarInfoCode: 6012,
    uniqueCode: '50120004',
    section: '50',
    row: '12',
    number: '4',
    mainPhoto: 'uuid-main',
    thumbnailKey: 'uuid-thumb',
    tombPhotos: ['uuid-tomb'],
    latitude: '35.53',
    longitude: '51.37',
    matchScore: 100,
    matchBasis: 'exact_name_father_tomb',
    tombMismatch: false
  },
  golzartehUrl: 'https://golzarteh.ir/martyr/6012',
  tombMismatch: false,
  biography: 'زندگینامه آزمایشی',
  biographySource: 'golzarteh.ir',
  willText: 'متن وصیت‌نامه آزمایشی',
  willSource: 'golzarteh.ir',
  photos: [
    {
      id: 'p1',
      category: 'personnel',
      url: 'https://api.golzarteh.ir/api/v1/files/download/uuid-main',
      caption: 'عکس پرسنلی',
      source: 'golzarteh.ir'
    },
    {
      id: 'p2',
      category: 'tomb',
      url: 'https://api.golzarteh.ir/api/v1/files/download/uuid-tomb',
      caption: 'عکس سنگ مزار',
      source: 'golzarteh.ir'
    }
  ],
  override: null
};

const syncPkg = buildBidirectionalGolzartehSyncPackage({
  profiles: [sampleResolved],
  links: [],
  extractedItems: [],
  scopeLabel: 'آزمایش'
});
assert.equal(syncPkg.schema_version, 'markaz-golzarteh-sync-v1.0');
assert.equal(syncPkg.martyrs[0].golzarteh_id, 6012);
assert.equal(syncPkg.martyrs[0].gallery.length, 2);

// 7. اولویت‌بندی صف همگام‌سازی پس‌زمینه و حفظ کامل داده‌های قبلی هنگام همگام‌سازی
assert.equal(
  determineChangePriority({ changedFields: ['birthDate'], hasLinkedBooks: false }),
  'high'
);
assert.equal(
  determineChangePriority({ changedFields: ['biography'], hasLinkedBooks: true }),
  'high'
);
assert.equal(
  determineChangePriority({ changedFields: ['biography'], hasLinkedBooks: false }),
  'normal'
);
assert.equal(
  determineChangePriority({ changedFields: ['photos'], hasLinkedBooks: false }),
  'low'
);

const queueSample: MartyrProfileSyncQueueItem = {
  id: 'gtsync_test_1',
  localKey: 'golzar:2',
  golzartehId: 6012,
  fullName: 'سعید آئینه‌وند',
  priority: 'high',
  priorityWeight: 3,
  changedFields: ['biography', 'photos'],
  baseSnapshot: {
    birthDate: '۱ مرداد ۱۳۴۳',
    martyrdomDate: '۱۸ اسفند ۱۳۶۳',
    biography: 'متن پایه قبلی',
    willText: 'وصیت‌نامه قبلی مرکز',
    photoIds: [],
    fingerprint: computeProfileFingerprint({
      birthDate: '۱ مرداد ۱۳۴۳',
      martyrdomDate: '۱۸ اسفند ۱۳۶۳',
      biography: 'متن پایه قبلی',
      willText: 'وصیت‌نامه قبلی مرکز',
      photoIds: []
    })
  },
  payload: {
    customBiography: 'زندگینامه تکمیلی ثبت‌شده در کتابخانه',
    customWillText: undefined,
    customBirthDate: undefined,
    customMartyrdomDate: undefined,
    customPhotos: [
      {
        id: 'c1',
        category: 'personnel',
        url: 'data:image/jpeg;base64,AAA',
        caption: 'عکس اول',
        source: 'local_upload'
      },
      {
        id: 'c2',
        category: 'personnel',
        url: 'data:image/jpeg;base64,AAA',
        caption: 'عکس تکراری',
        source: 'local_upload'
      }
    ]
  },
  status: 'queued',
  retryCount: 0,
  nextRetryAt: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

const mergedSafe = mergeMartyrChangeWithoutCorruption({
  existingCenterRecord: {
    birthDateDisplay: '۱ مرداد ۱۳۴۳',
    martyrdomDateDisplay: '۱۸ اسفند ۱۳۶۳',
    biography: 'متن به‌روزشده مستقل در پایگاه گلزار',
    wills: [{ text: 'وصیت‌نامه قبلی مرکز' }]
  },
  queuedItem: queueSample
});

assert.equal(mergedSafe.hadDataLossRisk, true);
assert.ok(mergedSafe.mergedDetail.biography?.includes('متن به‌روزشده مستقل در پایگاه گلزار'));
assert.ok(mergedSafe.mergedDetail.biography?.includes('زندگینامه تکمیلی ثبت‌شده در کتابخانه'));
assert.equal(mergedSafe.mergedDetail.birthDateDisplay, '۱ مرداد ۱۳۴۳');
assert.equal(mergedSafe.mergedDetail.wills?.[0]?.text, 'وصیت‌نامه قبلی مرکز');
assert.equal(mergedSafe.mergedDetail.customPhotosMerged.length, 1);

console.log('golzarteh-profile tests passed (10 assertions verified).');
