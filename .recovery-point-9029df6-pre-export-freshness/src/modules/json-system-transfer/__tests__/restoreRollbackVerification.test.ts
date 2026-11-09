/**
 * مجموعه تست مستقل و قابل اجرای مجدد برای بررسی کامل Restore، Rollback تراکنشی،
 * حفظ ساختار خام رکوردهای IndexedDB، عدم پنهان شدن قطع IndexedDB توسط LocalStorage
 * و تست‌های رگرسیون ماژول انتقال JSON.
 *
 * فرمان اجرا:
 * npx tsx src/modules/json-system-transfer/__tests__/restoreRollbackVerification.test.ts
 */

// راه‌اندازی محیط ایزوله LocalStorage و IndexedDB در حافظه پیش از بارگذاری ماژول‌ها
const lsStore = new Map<string, string>();
let failLocalSetOnKey: ((key: string, value: string) => boolean) | null = null;
let afterBatchSaveHook: (() => Promise<void> | void) | null = null;

const mockLocalStorage = {
  getItem(key: string): string | null {
    return lsStore.has(key) ? lsStore.get(key)! : null;
  },
  setItem(key: string, value: string): void {
    if (failLocalSetOnKey && failLocalSetOnKey(key, value)) {
      throw new Error(`Simulated QuotaExceededError on localStorage.setItem("${key}")`);
    }
    lsStore.set(key, String(value));
  },
  removeItem(key: string): void {
    lsStore.delete(key);
  },
  clear(): void {
    lsStore.clear();
  },
  key(index: number): string | null {
    return Array.from(lsStore.keys())[index] ?? null;
  },
  get length(): number {
    return lsStore.size;
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, 'window', {
  value: { localStorage: mockLocalStorage, dispatchEvent: () => true },
  configurable: true,
  writable: true,
});

const idbStores = new Map<string, Map<string, unknown>>();
let failIdbTxMode: 'none' | 'always' | 'on_restore_write' | 'on_rollback_write' = 'none';
let writeTxCount = 0;

function getObjectStoreMap(storeName: string): Map<string, unknown> {
  if (!idbStores.has(storeName)) {
    idbStores.set(storeName, new Map<string, unknown>());
  }
  return idbStores.get(storeName)!;
}

function deepClone<T>(val: T): T {
  if (val === undefined || val === null) return val;
  return JSON.parse(JSON.stringify(val));
}

const mockIndexedDB = {
  open(_dbName: string, _version?: number) {
    const req: Record<string, unknown> & {
      result: unknown;
      error: unknown;
      onsuccess: (() => void) | null;
      onerror: (() => void) | null;
      onupgradeneeded: (() => void) | null;
    } = {
      result: null,
      error: null,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
    };
    queueMicrotask(() => {
      const db = {
        close() {},
        objectStoreNames: {
          contains(name: string) {
            return idbStores.has(name);
          },
        },
        createObjectStore(name: string) {
          getObjectStoreMap(name);
          return {};
        },
        transaction(storeNames: string | string[], mode: 'readonly' | 'readwrite') {
          const names = Array.isArray(storeNames) ? storeNames : [storeNames];
          for (const n of names) getObjectStoreMap(n);

          const backup = new Map<string, Map<string, unknown>>();
          for (const n of names) {
            backup.set(n, new Map(getObjectStoreMap(n)));
          }

          if (mode === 'readwrite') {
            writeTxCount++;
          }

          const shouldFailTx =
            failIdbTxMode === 'always' ||
            (failIdbTxMode === 'on_restore_write' && mode === 'readwrite' && writeTxCount === 1) ||
            (failIdbTxMode === 'on_rollback_write' && mode === 'readwrite' && writeTxCount >= 2);

          const tx: {
            error: Error | null;
            oncomplete: (() => void) | null;
            onerror: (() => void) | null;
            onabort: (() => void) | null;
            abort: () => void;
            objectStore: (name: string) => {
              get: (key: string) => Record<string, unknown>;
              put: (value: unknown, key: string) => Record<string, unknown>;
              delete: (key: string) => Record<string, unknown>;
            };
          } = {
            error: shouldFailTx
              ? new Error(`Simulated IDB ${mode} transaction failure (${failIdbTxMode})`)
              : null,
            oncomplete: null,
            onerror: null,
            onabort: null,
            abort() {
              for (const [n, bMap] of backup.entries()) {
                idbStores.set(n, bMap);
              }
              if (tx.onabort) tx.onabort();
            },
            objectStore(name: string) {
              const map = getObjectStoreMap(name);
              return {
                get(key: string) {
                  const r: {
                    result: unknown;
                    error: unknown;
                    onsuccess: (() => void) | null;
                    onerror: (() => void) | null;
                  } = {
                    result: undefined,
                    error: null,
                    onsuccess: null,
                    onerror: null,
                  };
                  queueMicrotask(() => {
                    if (shouldFailTx) {
                      r.error = tx.error;
                      if (r.onerror) r.onerror();
                      return;
                    }
                    r.result = map.has(key) ? deepClone(map.get(key)) : undefined;
                    if (r.onsuccess) r.onsuccess();
                  });
                  return r;
                },
                put(value: unknown, key: string) {
                  const r: {
                    result: unknown;
                    error: unknown;
                    onsuccess: (() => void) | null;
                    onerror: (() => void) | null;
                  } = {
                    result: key,
                    error: null,
                    onsuccess: null,
                    onerror: null,
                  };
                  queueMicrotask(() => {
                    if (!shouldFailTx) {
                      map.set(key, deepClone(value));
                    }
                  });
                  return r;
                },
                delete(key: string) {
                  const r: {
                    result: unknown;
                    error: unknown;
                    onsuccess: (() => void) | null;
                    onerror: (() => void) | null;
                  } = {
                    result: undefined,
                    error: null,
                    onsuccess: null,
                    onerror: null,
                  };
                  queueMicrotask(() => {
                    if (!shouldFailTx) {
                      map.delete(key);
                    }
                  });
                  return r;
                },
              };
            },
          };

          queueMicrotask(() => {
            queueMicrotask(() => {
              if (shouldFailTx) {
                for (const [n, bMap] of backup.entries()) {
                  idbStores.set(n, bMap);
                }
                if (tx.onerror) tx.onerror();
                if (afterBatchSaveHook && mode === 'readwrite' && writeTxCount === 1) {
                  Promise.resolve(afterBatchSaveHook()).catch(() => {});
                }
              } else {
                if (tx.oncomplete) tx.oncomplete();
                if (afterBatchSaveHook && mode === 'readwrite' && writeTxCount === 1) {
                  Promise.resolve(afterBatchSaveHook()).catch(() => {});
                }
              }
            });
          });

          return tx;
        },
      };
      req.result = db;
      if (req.onupgradeneeded) req.onupgradeneeded();
      if (req.onsuccess) req.onsuccess();
    });
    return req;
  },
};

function enableMockIndexedDB() {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: mockIndexedDB,
    configurable: true,
    writable: true,
  });
}

function disableMockIndexedDB() {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

enableMockIndexedDB();

import {
  OPERATIONAL_STORAGE_KEYS,
  saveOperationalDataBatchAtomic,
  idbGetEnvelopeStrict,
} from '../../../utils/indexedDbStorage';
import {
  RECORD_META_MAP_KEY,
  BASELINE_CHANGE_MAP_KEY,
  APPLIED_PACKAGES_KEY,
  saveSoftDeletedArchive,
} from '../../device-sync/syncStorage';
import {
  createPreMergeRecoveryPoint,
  restoreFromPreMergeRecoveryPoint,
  getLatestPreMergeRecoveryPoint,
  isValidPreMergeRecoveryPoint,
  computePreMergeRecoveryPointChecksum,
  inspectAndCompareSystemJson,
  buildFullSystemJsonExport,
  computeSystemDataIntegrityHash,
  canonicalizeValueDeterministic,
} from '../jsonTransferEngine';
import type { FullOperationalState } from '../../../utils/backupService';
import type { IdSequenceSnapshot } from '../types';
import type { RecordSyncMeta, SyncRecordEnvelope } from '../../device-sync/types';

function assertEqual(actual: unknown, expected: unknown, message?: string): void {
  const aCanon = canonicalizeValueDeterministic(actual);
  const eCanon = canonicalizeValueDeterministic(expected);
  if (aCanon !== eCanon) {
    throw new Error(
      `${message || 'Assertion failed'}: expected ${eCanon}, got ${aCanon}`
    );
  }
}

function assertOk(condition: unknown, message?: string): void {
  if (!condition) {
    throw new Error(message || 'Expected truthy condition');
  }
}

function assertMatch(text: string, pattern: RegExp, message?: string): void {
  if (!pattern.test(text)) {
    throw new Error(
      `${message || 'Regex match failed'}: expected "${text}" to match ${String(pattern)}`
    );
  }
}

const SOFT_DELETED_ARCHIVE_STORAGE_KEY = 'book_p2p_soft_deleted_archive_v1';
const ID_SEQUENCE_STORAGE_KEY = 'book_id_sequences_v1';

const ALL_OPERATIONAL_KEYS = [
  OPERATIONAL_STORAGE_KEYS.auditRecords,
  OPERATIONAL_STORAGE_KEYS.bookCopies,
  OPERATIONAL_STORAGE_KEYS.customMartyrs,
  OPERATIONAL_STORAGE_KEYS.smartSuggestions,
  OPERATIONAL_STORAGE_KEYS.links,
  OPERATIONAL_STORAGE_KEYS.pendingReviews,
  OPERATIONAL_STORAGE_KEYS.multiMartyrGroups,
  OPERATIONAL_STORAGE_KEYS.extractedItems,
  OPERATIONAL_STORAGE_KEYS.auditLog,
  OPERATIONAL_STORAGE_KEYS.rejectedSuggestions,
];

const ALL_SYNC_META_KEYS = [
  RECORD_META_MAP_KEY,
  BASELINE_CHANGE_MAP_KEY,
  APPLIED_PACKAGES_KEY,
];

function makeSampleState(tag: string): FullOperationalState {
  return {
    auditRecords: {
      '1': {
        id: '1',
        key: '1',
        title: `کتاب ${tag} ۱`,
        author: `نویسنده ${tag}`,
        publisher: `ناشر ${tag}`,
        year: '1402',
        isbn: `978-600-${tag}`,
        shelf: 'A',
        level: '1',
        location: 'A-1',
        physical: 'verified',
        countedCopies: '2',
        notes: `یادداشت ${tag}`,
      } as unknown as FullOperationalState['auditRecords'][string],
    },
    bookCopies: [
      {
        copyId: `CP-${tag}-001`,
        bookId: '1',
        bookKey: '1',
        bookTitle: `کتاب ${tag} ۱`,
        shelf: 'A',
        level: '1',
        copyStatus: 'موجود در قفسه',
        physicalCondition: 'سالم',
        createdAt: '1403/01/01',
        updatedAt: '1403/01/02',
        locationHistory: [],
      } as unknown as FullOperationalState['bookCopies'][number],
    ],
    customMartyrs: [
      {
        martyrId: `MR-${tag}-001`,
        fullName: `شهید ${tag}`,
        fatherName: 'علی',
        birthYear: '1340',
        martyrdomYear: '1365',
        operationOrPlace: 'شلمچه',
        createdAt: '1403/01/01',
      } as unknown as FullOperationalState['customMartyrs'][number],
    ],
    smartSuggestions: [
      {
        id: `SS-${tag}-001`,
        bookTitle: `کتاب ${tag} ۱`,
        martyrName: `شهید ${tag}`,
        confidence: 95,
        status: 'approved',
      } as unknown as FullOperationalState['smartSuggestions'][number],
    ],
    links: [
      {
        id: `RL-${tag}-001`,
        bookKey: '1',
        bookTitleRaw: `کتاب ${tag} ۱`,
        martyrId: `MR-${tag}-001`,
        martyrNameRaw: `شهید ${tag}`,
        roleType: 'محور اصلی کتاب',
        confidence: 100,
        status: 'قطعی',
        reviewStatus: 'قطعی',
      } as unknown as FullOperationalState['links'][number],
    ],
    pendingReviews: [
      {
        trackingId: `TR-${tag}-001`,
        bookTitle: `کتاب ${tag} ۱`,
        reason: `بررسی ${tag}`,
        status: 'در انتظار',
      } as unknown as FullOperationalState['pendingReviews'][number],
    ],
    multiMartyrGroups: [
      {
        groupCode: `GRP-${tag}-01`,
        bookKey: '1',
        bookTitle: `کتاب ${tag} ۱`,
        martyrCount: 3,
        determinationStatus: 'نهایی و تفکیک‌شده',
      } as unknown as FullOperationalState['multiMartyrGroups'][number],
    ],
    extractedItems: [
      {
        id: `EX-${tag}-001`,
        bookKey: '1',
        bookTitle: `کتاب ${tag} ۱`,
        bookTitleRaw: `کتاب ${tag} ۱`,
        martyrName: `شهید ${tag}`,
        martyrNameRaw: `شهید ${tag}`,
        martyrsRaw: `شهید ${tag}`,
        sectionTitle: `فصل ${tag}`,
        pageRange: '10-25',
      } as unknown as FullOperationalState['extractedItems'][number],
    ],
    auditLog: [
      {
        id: `LOG-${tag}-001`,
        timestamp: '1403/01/01 10:00',
        actorRole: 'manager',
        actionType: 'UPDATE',
        targetId: '1',
        summary: `ویرایش ${tag}`,
      } as unknown as FullOperationalState['auditLog'][number],
    ],
    rejectedSuggestionsArchive: [
      {
        id: `REJ-${tag}-001`,
        bookTitle: `کتاب ردشده ${tag}`,
        martyrName: `شهید ${tag}`,
        rejectedAt: '1403/01/01',
      } as unknown as FullOperationalState['rejectedSuggestionsArchive'][number],
    ],
    userSettings: {
      activeRole: tag === 'TARGET' ? 'admin' : 'registrar',
    },
  };
}

async function seedDeviceState(tag: string) {
  enableMockIndexedDB();
  const state = makeSampleState(tag);
  const recordMetaMap: Record<string, RecordSyncMeta> = {
    'auditRecords::1': {
      recordId: '1',
      collection: 'auditRecords',
      revision: tag === 'TARGET' ? 2 : 7,
      updatedAtIso: '2026-03-01T00:00:00.000Z',
      updatedAtMs: tag === 'TARGET' ? 1700000001000 : 1700000009000,
      updatedByDeviceId: `DEV-${tag}`,
      updatedByRole: state.userSettings.activeRole,
      contentHash: `HASH-${tag}`,
    } as unknown as RecordSyncMeta,
  };
  const baselineChangeMap: Record<string, string> = {
    'auditRecords::1': `BASE-${tag}`,
  };
  const appliedPackageIds: string[] = [`PKG-${tag}-001`];
  const softDeletedArchive: Record<string, SyncRecordEnvelope> = {
    'links::RL-DEL-1': {
      meta: {
        recordId: 'RL-DEL-1',
        collection: 'links',
        revision: 1,
        updatedAtIso: '2026-02-01T00:00:00.000Z',
        updatedAtMs: 1700000000000,
        updatedByDeviceId: `DEV-${tag}`,
        updatedByRole: 'manager',
        contentHash: `DEL-HASH-${tag}`,
      } as unknown as RecordSyncMeta,
      payload: { id: 'RL-DEL-1' },
    } as unknown as SyncRecordEnvelope,
  };
  const idSequences: IdSequenceSnapshot = {
    LOG: tag === 'TARGET' ? 10 : 50,
    RL: tag === 'TARGET' ? 11 : 51,
    SS: 12,
    MR: 13,
    EX: 14,
    CP: 15,
    TMP_OUT: 16,
  };

  const batchEntries = [
    { key: OPERATIONAL_STORAGE_KEYS.auditRecords, value: state.auditRecords },
    { key: OPERATIONAL_STORAGE_KEYS.bookCopies, value: state.bookCopies },
    { key: OPERATIONAL_STORAGE_KEYS.customMartyrs, value: state.customMartyrs },
    { key: OPERATIONAL_STORAGE_KEYS.smartSuggestions, value: state.smartSuggestions },
    { key: OPERATIONAL_STORAGE_KEYS.links, value: state.links },
    { key: OPERATIONAL_STORAGE_KEYS.pendingReviews, value: state.pendingReviews },
    { key: OPERATIONAL_STORAGE_KEYS.multiMartyrGroups, value: state.multiMartyrGroups },
    { key: OPERATIONAL_STORAGE_KEYS.extractedItems, value: state.extractedItems },
    { key: OPERATIONAL_STORAGE_KEYS.auditLog, value: state.auditLog },
    { key: OPERATIONAL_STORAGE_KEYS.rejectedSuggestions, value: state.rejectedSuggestionsArchive },
    { key: RECORD_META_MAP_KEY, value: recordMetaMap },
    { key: BASELINE_CHANGE_MAP_KEY, value: baselineChangeMap },
    { key: APPLIED_PACKAGES_KEY, value: appliedPackageIds },
  ];

  const batchRes = await saveOperationalDataBatchAtomic(batchEntries);
  assertEqual(batchRes.ok, true, `Failed to seed state ${tag}: ${batchRes.error}`);
  assertEqual(saveSoftDeletedArchive(softDeletedArchive), true);
  mockLocalStorage.setItem(ID_SEQUENCE_STORAGE_KEY, JSON.stringify(idSequences));
  mockLocalStorage.setItem(OPERATIONAL_STORAGE_KEYS.userRole, state.userSettings.activeRole);

  return { state, recordMetaMap, baselineChangeMap, appliedPackageIds, softDeletedArchive, idSequences };
}

async function dumpBothStoragesSnapshot(): Promise<{
  idbData: Record<string, unknown>;
  idbRawRecords: Record<string, unknown>;
  ls: Record<string, string | null>;
}> {
  const allKeys = [...ALL_OPERATIONAL_KEYS, ...ALL_SYNC_META_KEYS];
  const idbData: Record<string, unknown> = {};
  const idbRawRecords: Record<string, unknown> = {};
  for (const k of allKeys) {
    const env = await idbGetEnvelopeStrict(k);
    assertEqual(env.ok, true);
    idbData[k] = env.exists ? env.data : '__ABSENT__';
    idbRawRecords[k] = env.exists ? env.rawRecord : '__ABSENT__';
  }
  const ls: Record<string, string | null> = {};
  for (const k of [
    ...allKeys,
    SOFT_DELETED_ARCHIVE_STORAGE_KEY,
    ID_SEQUENCE_STORAGE_KEY,
    OPERATIONAL_STORAGE_KEYS.userRole,
  ]) {
    ls[k] = mockLocalStorage.getItem(k);
  }
  return { idbData, idbRawRecords, ls };
}

function resetFaults() {
  enableMockIndexedDB();
  failLocalSetOnKey = null;
  afterBatchSaveHook = null;
  failIdbTxMode = 'none';
  writeTxCount = 0;
}

async function runAllTests() {
  console.log('=== STARTING MANDATORY RESTORE & ROLLBACK SCENARIOS + RAW ENVELOPE & IDB AVAILABILITY + REGRESSION TESTS ===');
  let passed = 0;

  lsStore.clear();
  idbStores.clear();
  resetFaults();
  const targetSeed = await seedDeviceState('TARGET');
  const rpCreateRes = await createPreMergeRecoveryPoint(targetSeed.state);
  assertEqual(rpCreateRes.ok, true, `Target RP creation failed: ${rpCreateRes.error}`);
  const targetRp = rpCreateRes.recoveryPoint!;
  assertEqual(isValidPreMergeRecoveryPoint(targetRp), true, 'Target RP must pass structural & checksum validation');
  assertEqual(targetRp.checksum.startsWith('RP_SHA256_'), true, 'Target RP must use RP_SHA256_ checksum');

  // Scenario 1: بازیابی موفق با داده کامل
  {
    lsStore.clear();
    idbStores.clear();
    resetFaults();
    await seedDeviceState('PRE_RESTORE_1');
    const res = await restoreFromPreMergeRecoveryPoint(targetRp);
    assertEqual(res.ok, true, `Scenario 1 failed: ${res.error}`);
    assertEqual(res.rollbackPerformed, false);
    const afterDump = await dumpBothStoragesSnapshot();
    assertEqual(afterDump.idbData[OPERATIONAL_STORAGE_KEYS.auditRecords], targetSeed.state.auditRecords);
    assertEqual(afterDump.idbData[OPERATIONAL_STORAGE_KEYS.bookCopies], targetSeed.state.bookCopies);
    assertEqual(afterDump.idbData[OPERATIONAL_STORAGE_KEYS.customMartyrs], targetSeed.state.customMartyrs);
    assertEqual(afterDump.idbData[OPERATIONAL_STORAGE_KEYS.smartSuggestions], targetSeed.state.smartSuggestions);
    assertEqual(afterDump.idbData[OPERATIONAL_STORAGE_KEYS.links], targetSeed.state.links);
    assertEqual(afterDump.idbData[OPERATIONAL_STORAGE_KEYS.pendingReviews], targetSeed.state.pendingReviews);
    assertEqual(afterDump.idbData[OPERATIONAL_STORAGE_KEYS.multiMartyrGroups], targetSeed.state.multiMartyrGroups);
    assertEqual(afterDump.idbData[OPERATIONAL_STORAGE_KEYS.extractedItems], targetSeed.state.extractedItems);
    assertEqual(afterDump.idbData[OPERATIONAL_STORAGE_KEYS.auditLog], targetSeed.state.auditLog);
    assertEqual(afterDump.idbData[OPERATIONAL_STORAGE_KEYS.rejectedSuggestions], targetSeed.state.rejectedSuggestionsArchive);
    assertEqual(afterDump.idbData[RECORD_META_MAP_KEY], targetSeed.recordMetaMap);
    assertEqual(afterDump.idbData[BASELINE_CHANGE_MAP_KEY], targetSeed.baselineChangeMap);
    assertEqual(afterDump.idbData[APPLIED_PACKAGES_KEY], targetSeed.appliedPackageIds);
    assertEqual(JSON.parse(afterDump.ls[SOFT_DELETED_ARCHIVE_STORAGE_KEY]!), targetSeed.softDeletedArchive);
    assertEqual(JSON.parse(afterDump.ls[ID_SEQUENCE_STORAGE_KEY]!), targetSeed.idSequences);
    assertEqual(afterDump.ls[OPERATIONAL_STORAGE_KEYS.userRole], targetSeed.state.userSettings.activeRole);
    console.log('[PASS] Scenario 1: بازیابی موفق با داده کامل (۱۰ مجموعه عملیاتی + ۳ کلید Sync Metadata + ۳ کلید کمکی در IndexedDB و LocalStorage)');
    passed++;
  }

  // Scenario 2: شکست تراکنش IndexedDB در زمان بازیابی
  {
    lsStore.clear();
    idbStores.clear();
    resetFaults();
    await seedDeviceState('PRE_RESTORE_2');
    const preDump = await dumpBothStoragesSnapshot();
    writeTxCount = 0;
    failIdbTxMode = 'on_restore_write';
    const res = await restoreFromPreMergeRecoveryPoint(targetRp);
    resetFaults();
    assertEqual(res.ok, false, 'Scenario 2 must return ok: false');
    assertEqual(res.rollbackPerformed, true, 'Scenario 2 must perform rollback');
    assertEqual(res.rollbackVerified, true, 'Scenario 2 rollback must be verified');
    const postDump = await dumpBothStoragesSnapshot();
    assertEqual(postDump.idbData, preDump.idbData, 'Scenario 2 IDB data must match pre-restore snapshot 100%');
    assertEqual(postDump.idbRawRecords, preDump.idbRawRecords, 'Scenario 2 IDB raw records must match pre-restore snapshot 100%');
    assertEqual(postDump.ls, preDump.ls, 'Scenario 2 LS state must match pre-restore snapshot 100%');
    console.log('[PASS] Scenario 2: شکست تراکنش IndexedDB در زمان بازیابی -> حفظ و تأیید ۱۰۰٪ وضعیت قبلی در IndexedDB و LocalStorage');
    passed++;
  }

  // Scenario 3: شکست ذخیره softDeletedArchive پس از ذخیره موفق دسته‌ای در IndexedDB
  {
    lsStore.clear();
    idbStores.clear();
    resetFaults();
    await seedDeviceState('PRE_RESTORE_3');
    const preDump = await dumpBothStoragesSnapshot();
    let unhooked = false;
    const origSet = mockLocalStorage.setItem;
    mockLocalStorage.setItem = function (key: string, value: string) {
      if (!unhooked && key === SOFT_DELETED_ARCHIVE_STORAGE_KEY) {
        unhooked = true;
        throw new Error('Simulated failure saving softDeletedArchive');
      }
      return origSet.call(this, key, value);
    };
    const res = await restoreFromPreMergeRecoveryPoint(targetRp);
    mockLocalStorage.setItem = origSet;
    resetFaults();
    assertEqual(res.ok, false, 'Scenario 3 must return ok: false');
    assertEqual(res.rollbackPerformed, true, 'Scenario 3 must perform full rollback');
    assertEqual(res.rollbackVerified, true, 'Scenario 3 rollback must be verified');
    const postDump = await dumpBothStoragesSnapshot();
    assertEqual(postDump.idbData, preDump.idbData, 'Scenario 3 IDB data must be rolled back to PRE_RESTORE_3');
    assertEqual(postDump.idbRawRecords, preDump.idbRawRecords, 'Scenario 3 IDB rawRecord must be rolled back to PRE_RESTORE_3');
    assertEqual(postDump.ls, preDump.ls, 'Scenario 3 LS must be rolled back to PRE_RESTORE_3');
    console.log('[PASS] Scenario 3: شکست ذخیره softDeletedArchive پس از نوشتن IndexedDB -> Rollback کامل IndexedDB و LocalStorage به وضعیت قبل');
    passed++;
  }

  // Scenario 4: شکست ذخیره idSequences پس از ذخیره موفق دسته‌ای در IndexedDB و softDeletedArchive
  {
    lsStore.clear();
    idbStores.clear();
    resetFaults();
    await seedDeviceState('PRE_RESTORE_4');
    const preDump = await dumpBothStoragesSnapshot();
    let failedOnce = false;
    const origSet = mockLocalStorage.setItem;
    mockLocalStorage.setItem = function (key: string, value: string) {
      if (!failedOnce && key === ID_SEQUENCE_STORAGE_KEY) {
        failedOnce = true;
        throw new Error('Simulated failure saving idSequences');
      }
      return origSet.call(this, key, value);
    };
    const res = await restoreFromPreMergeRecoveryPoint(targetRp);
    mockLocalStorage.setItem = origSet;
    resetFaults();
    assertEqual(res.ok, false);
    assertEqual(res.rollbackPerformed, true);
    assertEqual(res.rollbackVerified, true);
    const postDump = await dumpBothStoragesSnapshot();
    assertEqual(postDump.idbData, preDump.idbData, 'Scenario 4 IDB data must be rolled back to PRE_RESTORE_4');
    assertEqual(postDump.idbRawRecords, preDump.idbRawRecords, 'Scenario 4 IDB rawRecord must be rolled back to PRE_RESTORE_4');
    assertEqual(postDump.ls, preDump.ls, 'Scenario 4 LS must be rolled back to PRE_RESTORE_4');
    console.log('[PASS] Scenario 4: شکست ذخیره idSequences پس از نوشتن IndexedDB -> Rollback کامل IndexedDB و LocalStorage به وضعیت قبل');
    passed++;
  }

  // Scenario 5: شکست ذخیره userRole پس از ذخیره موفق دسته‌ای در IndexedDB
  {
    lsStore.clear();
    idbStores.clear();
    resetFaults();
    await seedDeviceState('PRE_RESTORE_5');
    const preDump = await dumpBothStoragesSnapshot();
    let failedOnce = false;
    const origSet = mockLocalStorage.setItem;
    mockLocalStorage.setItem = function (key: string, value: string) {
      if (!failedOnce && key === OPERATIONAL_STORAGE_KEYS.userRole) {
        failedOnce = true;
        throw new Error('Simulated failure saving userRole');
      }
      return origSet.call(this, key, value);
    };
    const res = await restoreFromPreMergeRecoveryPoint(targetRp);
    mockLocalStorage.setItem = origSet;
    resetFaults();
    assertEqual(res.ok, false);
    assertEqual(res.rollbackPerformed, true);
    assertEqual(res.rollbackVerified, true);
    const postDump = await dumpBothStoragesSnapshot();
    assertEqual(postDump.idbData, preDump.idbData, 'Scenario 5 IDB data must be rolled back to PRE_RESTORE_5');
    assertEqual(postDump.idbRawRecords, preDump.idbRawRecords, 'Scenario 5 IDB rawRecord must be rolled back to PRE_RESTORE_5');
    assertEqual(postDump.ls, preDump.ls, 'Scenario 5 LS must be rolled back to PRE_RESTORE_5');
    console.log('[PASS] Scenario 5: شکست ذخیره userRole پس از نوشتن IndexedDB -> Rollback کامل IndexedDB و LocalStorage به وضعیت قبل');
    passed++;
  }

  // Scenario 6: عدم تطابق پس از ذخیره (تغییر ناخواسته در داده ذخیره‌شده پس از نوشتن)
  {
    lsStore.clear();
    idbStores.clear();
    resetFaults();
    await seedDeviceState('PRE_RESTORE_6');
    const preDump = await dumpBothStoragesSnapshot();
    let corruptedOnce = false;
    const origSet = mockLocalStorage.setItem;
    mockLocalStorage.setItem = function (key: string, value: string) {
      if (!corruptedOnce && key === OPERATIONAL_STORAGE_KEYS.userRole) {
        corruptedOnce = true;
        return origSet.call(this, key, 'tampered_role_value');
      }
      return origSet.call(this, key, value);
    };
    const res = await restoreFromPreMergeRecoveryPoint(targetRp);
    mockLocalStorage.setItem = origSet;
    resetFaults();
    assertEqual(res.ok, false);
    assertEqual(res.rollbackPerformed, true);
    assertEqual(res.rollbackVerified, true);
    const postDump = await dumpBothStoragesSnapshot();
    assertEqual(postDump.idbData, preDump.idbData, 'Scenario 6 IDB data must be rolled back to PRE_RESTORE_6');
    assertEqual(postDump.idbRawRecords, preDump.idbRawRecords, 'Scenario 6 IDB rawRecord must be rolled back to PRE_RESTORE_6');
    assertEqual(postDump.ls, preDump.ls, 'Scenario 6 LS must be rolled back to PRE_RESTORE_6');
    console.log('[PASS] Scenario 6: عدم تطابق پس از ذخیره -> شناسایی خطا و Rollback کامل IndexedDB و LocalStorage');
    passed++;
  }

  // Scenario 7: کم شدن تعداد رکورد در Storage پس از نوشتن
  {
    lsStore.clear();
    idbStores.clear();
    resetFaults();
    await seedDeviceState('PRE_RESTORE_7');
    const preDump = await dumpBothStoragesSnapshot();
    writeTxCount = 0;
    afterBatchSaveHook = () => {
      const store = getObjectStoreMap('app_state_store');
      const env = store.get(OPERATIONAL_STORAGE_KEYS.bookCopies) as Record<string, unknown>;
      if (env && Array.isArray(env.data)) {
        env.data = [];
        store.set(OPERATIONAL_STORAGE_KEYS.bookCopies, env);
      }
    };
    const res = await restoreFromPreMergeRecoveryPoint(targetRp);
    resetFaults();
    assertEqual(res.ok, false);
    assertEqual(res.rollbackPerformed, true);
    assertEqual(res.rollbackVerified, true);
    assertMatch(res.error ?? '', /bookCopies/);
    const postDump = await dumpBothStoragesSnapshot();
    assertEqual(postDump.idbData, preDump.idbData, 'Scenario 7 IDB data must be rolled back to PRE_RESTORE_7');
    assertEqual(postDump.idbRawRecords, preDump.idbRawRecords, 'Scenario 7 IDB rawRecord must be rolled back to PRE_RESTORE_7');
    assertEqual(postDump.ls, preDump.ls, 'Scenario 7 LS must be rolled back to PRE_RESTORE_7');
    console.log('[PASS] Scenario 7: کم شدن تعداد رکورد در Storage پس از نوشتن -> تشخیص خطا و Rollback کامل');
    passed++;
  }

  // Scenario 8: تغییر محتوای یک رکورد با وجود برابر بودن تعداد رکوردها
  {
    lsStore.clear();
    idbStores.clear();
    resetFaults();
    await seedDeviceState('PRE_RESTORE_8');
    const preDump = await dumpBothStoragesSnapshot();
    writeTxCount = 0;
    afterBatchSaveHook = () => {
      const store = getObjectStoreMap('app_state_store');
      const env = store.get(OPERATIONAL_STORAGE_KEYS.auditRecords) as {
        data?: Record<string, { title?: string }>;
      };
      if (env && env.data && env.data['1']) {
        env.data['1'].title = 'SILENTLY_CORRUPTED_BOOK_TITLE';
        store.set(OPERATIONAL_STORAGE_KEYS.auditRecords, env);
      }
    };
    const res = await restoreFromPreMergeRecoveryPoint(targetRp);
    resetFaults();
    assertEqual(res.ok, false);
    assertEqual(res.rollbackPerformed, true);
    assertEqual(res.rollbackVerified, true);
    assertMatch(res.error ?? '', /auditRecords/);
    const postDump = await dumpBothStoragesSnapshot();
    assertEqual(postDump.idbData, preDump.idbData, 'Scenario 8 IDB data must be rolled back to PRE_RESTORE_8');
    assertEqual(postDump.idbRawRecords, preDump.idbRawRecords, 'Scenario 8 IDB rawRecord must be rolled back to PRE_RESTORE_8');
    assertEqual(postDump.ls, preDump.ls, 'Scenario 8 LS must be rolled back to PRE_RESTORE_8');
    console.log('[PASS] Scenario 8: تغییر محتوای یک رکورد با وجود برابر بودن تعداد رکوردها -> تشخیص با مقایسه Canonical و Rollback کامل');
    passed++;
  }

  // Scenario 9: تغییر یک رکورد در links با تعداد برابر (بدون هیچ استثنایی برای غنی‌سازی)
  {
    lsStore.clear();
    idbStores.clear();
    resetFaults();
    await seedDeviceState('PRE_RESTORE_9');
    const preDump = await dumpBothStoragesSnapshot();
    writeTxCount = 0;
    afterBatchSaveHook = () => {
      const store = getObjectStoreMap('app_state_store');
      const env = store.get(OPERATIONAL_STORAGE_KEYS.links) as {
        data?: Array<{ martyrNameRaw?: string }>;
      };
      if (env && Array.isArray(env.data) && env.data[0]) {
        env.data[0].martyrNameRaw = 'نام تغییر یافته غیرمجاز در لینک';
        store.set(OPERATIONAL_STORAGE_KEYS.links, env);
      }
    };
    const res = await restoreFromPreMergeRecoveryPoint(targetRp);
    resetFaults();
    assertEqual(res.ok, false);
    assertEqual(res.rollbackPerformed, true);
    assertEqual(res.rollbackVerified, true);
    assertMatch(res.error ?? '', /links/);
    const postDump = await dumpBothStoragesSnapshot();
    assertEqual(postDump.idbData, preDump.idbData, 'Scenario 9 IDB data must be rolled back to PRE_RESTORE_9');
    assertEqual(postDump.idbRawRecords, preDump.idbRawRecords, 'Scenario 9 IDB rawRecord must be rolled back to PRE_RESTORE_9');
    assertEqual(postDump.ls, preDump.ls, 'Scenario 9 LS must be rolled back to PRE_RESTORE_9');
    console.log('[PASS] Scenario 9: تغییر یک رکورد در links (تعداد برابر) -> تشخیص قطعی خطا بدون استثنای غنی‌سازی و Rollback کامل');
    passed++;
  }

  // Scenario 10: تغییر یک رکورد در extractedItems با تعداد برابر
  {
    lsStore.clear();
    idbStores.clear();
    resetFaults();
    await seedDeviceState('PRE_RESTORE_10');
    const preDump = await dumpBothStoragesSnapshot();
    writeTxCount = 0;
    afterBatchSaveHook = () => {
      const store = getObjectStoreMap('app_state_store');
      const env = store.get(OPERATIONAL_STORAGE_KEYS.extractedItems) as {
        data?: Array<{ sectionTitle?: string }>;
      };
      if (env && Array.isArray(env.data) && env.data[0]) {
        env.data[0].sectionTitle = 'فصل دستکاری‌شده در extractedItems';
        store.set(OPERATIONAL_STORAGE_KEYS.extractedItems, env);
      }
    };
    const res = await restoreFromPreMergeRecoveryPoint(targetRp);
    resetFaults();
    assertEqual(res.ok, false);
    assertEqual(res.rollbackPerformed, true);
    assertEqual(res.rollbackVerified, true);
    assertMatch(res.error ?? '', /extractedItems/);
    const postDump = await dumpBothStoragesSnapshot();
    assertEqual(postDump.idbData, preDump.idbData, 'Scenario 10 IDB data must be rolled back to PRE_RESTORE_10');
    assertEqual(postDump.idbRawRecords, preDump.idbRawRecords, 'Scenario 10 IDB rawRecord must be rolled back to PRE_RESTORE_10');
    assertEqual(postDump.ls, preDump.ls, 'Scenario 10 LS must be rolled back to PRE_RESTORE_10');
    console.log('[PASS] Scenario 10: تغییر یک رکورد در extractedItems (تعداد برابر) -> تشخیص قطعی خطا و Rollback کامل');
    passed++;
  }

  // Scenario 11: تغییر Sync Metadata پس از نوشتن
  {
    lsStore.clear();
    idbStores.clear();
    resetFaults();
    await seedDeviceState('PRE_RESTORE_11');
    const preDump = await dumpBothStoragesSnapshot();
    writeTxCount = 0;
    afterBatchSaveHook = () => {
      const store = getObjectStoreMap('app_state_store');
      const env = store.get(APPLIED_PACKAGES_KEY) as { data?: string[] };
      if (env) {
        env.data = ['TAMPERED-PKG-ID'];
        store.set(APPLIED_PACKAGES_KEY, env);
      }
    };
    const res = await restoreFromPreMergeRecoveryPoint(targetRp);
    resetFaults();
    assertEqual(res.ok, false);
    assertEqual(res.rollbackPerformed, true);
    assertEqual(res.rollbackVerified, true);
    assertMatch(res.error ?? '', /appliedPackageIds/);
    const postDump = await dumpBothStoragesSnapshot();
    assertEqual(postDump.idbData, preDump.idbData, 'Scenario 11 IDB data must be rolled back to PRE_RESTORE_11');
    assertEqual(postDump.idbRawRecords, preDump.idbRawRecords, 'Scenario 11 IDB rawRecord must be rolled back to PRE_RESTORE_11');
    assertEqual(postDump.ls, preDump.ls, 'Scenario 11 LS must be rolled back to PRE_RESTORE_11');
    console.log('[PASS] Scenario 11: تغییر Sync Metadata در زمان/پس از نوشتن -> تشخیص خطا و Rollback کامل');
    passed++;
  }

  // Scenario 12: شکست خود Rollback (خطای تراکنش IndexedDB در زمان Rollback)
  {
    lsStore.clear();
    idbStores.clear();
    resetFaults();
    await seedDeviceState('PRE_RESTORE_12');
    writeTxCount = 0;
    failIdbTxMode = 'on_rollback_write';
    let failedAuxOnce = false;
    const origSet = mockLocalStorage.setItem;
    mockLocalStorage.setItem = function (key: string, value: string) {
      if (!failedAuxOnce && key === ID_SEQUENCE_STORAGE_KEY) {
        failedAuxOnce = true;
        throw new Error('Simulated idSequences write failure triggering rollback');
      }
      return origSet.call(this, key, value);
    };
    const res = await restoreFromPreMergeRecoveryPoint(targetRp);
    mockLocalStorage.setItem = origSet;
    resetFaults();
    assertEqual(res.ok, false, 'Scenario 12 must return ok: false');
    assertEqual(res.rollbackPerformed, true, 'Scenario 12 must indicate rollback was attempted');
    assertEqual(res.rollbackVerified, false, 'Scenario 12 must report rollbackVerified: false when rollback fails');
    assertMatch(res.error ?? '', /خطای بحرانی در بازیابی/);
    assertMatch(res.error ?? '', new RegExp(targetRp.recoveryId));
    console.log('[PASS] Scenario 12: شکست خود Rollback -> گزارش صادقانه rollbackVerified: false، حفظ شناسه Recovery Point و عدم ادعای نادرست سلامت داده');
    passed++;
  }

  // Scenario 13: خطای سهمیه LocalStorage در نوشتن دسته‌ای عملیاتی در حضور IndexedDB سالم
  {
    lsStore.clear();
    idbStores.clear();
    resetFaults();
    await seedDeviceState('PRE_RESTORE_13');
    failLocalSetOnKey = (key) => key === OPERATIONAL_STORAGE_KEYS.auditRecords;
    const res = await restoreFromPreMergeRecoveryPoint(targetRp);
    resetFaults();
    assertEqual(res.ok, true, `Scenario 13 should succeed via healthy primary IDB: ${res.error}`);
    assertEqual(res.rollbackPerformed, false);
    assertOk(res.warning && res.warning.includes('IndexedDB'), 'Scenario 13 must return a transparent warning about LocalStorage backup');
    console.log('[PASS] Scenario 13: خطای LocalStorage پشتیبان در حضور IndexedDB سالم -> تأیید منبع اصلی (IndexedDB) و ثبت هشدار شفاف (warning)');
    passed++;
  }

  // Scenario 14: تست کامل Restore و Read-back (تطابق ۱۰۰٪ هر ۱۰ مجموعه، Sync Metadata، کلیدهای کمکی، recordCounts و Checksum)
  {
    lsStore.clear();
    idbStores.clear();
    resetFaults();
    await seedDeviceState('PRE_RESTORE_14');
    const res = await restoreFromPreMergeRecoveryPoint(targetRp);
    assertEqual(res.ok, true);
    assertEqual(res.rollbackPerformed, false);
    const recomputed = computePreMergeRecoveryPointChecksum({
      recoveryId: targetRp.recoveryId,
      timestampMs: targetRp.timestampMs,
      recordCounts: targetRp.recordCounts,
      stateSnapshot: res.restoredState,
      syncMetaSnapshot: targetRp.syncMetaSnapshot,
    });
    assertEqual(recomputed, targetRp.checksum, 'Scenario 14: recomputed RP_SHA256_ checksum must match target checksum');
    console.log('[PASS] Scenario 14: تست کامل Restore و Read-back (تطابق ۱۰۰٪ هر ۱۰ مجموعه، Sync Metadata، کلیدهای کمکی، recordCounts و Checksum)');
    passed++;
  }

  // Scenario 15 (تکمیلی بند ۱): حفظ و بازگردانی ساختار خام رکوردهای IndexedDB (شامل نسخه Envelope سفارشی، فیلدهای اضافی و داده قدیمی غیر Envelope) در Rollback
  {
    lsStore.clear();
    idbStores.clear();
    resetFaults();
    await seedDeviceState('PRE_RESTORE_15');
    const store = getObjectStoreMap('app_state_store');

    // ۱) قرار دادن یک رکورد با ساختار Envelope نسخه ۱ و فیلد سفارشی و recordCount خاص
    const customEnvelopeV1 = {
      __envelopeVersion: 1,
      updatedAt: 1700000555123,
      recordCount: 777,
      customEnvelopeField: 'CUSTOM_METADATA_PRESERVED',
      data: store.get(OPERATIONAL_STORAGE_KEYS.auditRecords)
        ? (store.get(OPERATIONAL_STORAGE_KEYS.auditRecords) as { data: unknown }).data
        : {},
    };
    store.set(OPERATIONAL_STORAGE_KEYS.auditRecords, deepClone(customEnvelopeV1));

    // ۲) قرار دادن یک رکورد قدیمی بدون Envelope (Legacy Raw Array)
    const legacyNonEnvelopeLinks = [
      {
        id: 'RL-LEGACY-RAW-001',
        bookKey: '1',
        bookTitleRaw: 'کتاب قدیمی ۱',
        martyrId: 'MR-LEGACY-001',
        martyrNameRaw: 'شهید قدیمی',
        roleType: 'محور اصلی کتاب',
        confidence: 100,
        status: 'قطعی',
        reviewStatus: 'قطعی',
      },
    ];
    store.set(OPERATIONAL_STORAGE_KEYS.links, deepClone(legacyNonEnvelopeLinks));
    mockLocalStorage.setItem(OPERATIONAL_STORAGE_KEYS.links, JSON.stringify(legacyNonEnvelopeLinks));

    // ایجاد خطا در مرحله ذخیره کلید کمکی تا Rollback پس از نوشتن در IndexedDB اجرا شود
    let failedOnce = false;
    const origSet = mockLocalStorage.setItem;
    mockLocalStorage.setItem = function (key: string, value: string) {
      if (!failedOnce && key === OPERATIONAL_STORAGE_KEYS.userRole) {
        failedOnce = true;
        throw new Error('Simulated failure on userRole to trigger rawRecord rollback');
      }
      return origSet.call(this, key, value);
    };

    const res = await restoreFromPreMergeRecoveryPoint(targetRp);
    mockLocalStorage.setItem = origSet;
    resetFaults();

    assertEqual(res.ok, false);
    assertEqual(res.rollbackPerformed, true);
    assertEqual(res.rollbackVerified, true);

    const restoredCustomEnv = store.get(OPERATIONAL_STORAGE_KEYS.auditRecords);
    const restoredLegacyRaw = store.get(OPERATIONAL_STORAGE_KEYS.links);
    assertEqual(
      restoredCustomEnv,
      customEnvelopeV1,
      'Scenario 15: Custom Envelope v1 with customEnvelopeField and recordCount=777 must be restored verbatim'
    );
    assertEqual(
      restoredLegacyRaw,
      legacyNonEnvelopeLinks,
      'Scenario 15: Legacy non-envelope raw record must be restored verbatim without wrapping into v2 envelope'
    );
    console.log('[PASS] Scenario 15 (بند ۱): حفظ و بازگردانی دقیق ساختار خام رکورد IndexedDB (نسخه Envelope، recordCount، فیلدهای اضافی و داده قدیمی غیر Envelope)');
    passed++;
  }

  // Scenario 16 (تکمیلی بند ۲): قطع دسترسی به IndexedDB در زمان Rollback در حالی که پیش از عملیات فعال بوده است -> rollbackVerified: false و عدم پنهان‌کاری توسط LocalStorage
  {
    lsStore.clear();
    idbStores.clear();
    resetFaults();
    await seedDeviceState('PRE_RESTORE_16');

    let disabledOnce = false;
    const origSet = mockLocalStorage.setItem;
    mockLocalStorage.setItem = function (key: string, value: string) {
      if (!disabledOnce && key === OPERATIONAL_STORAGE_KEYS.userRole) {
        disabledOnce = true;
        // قطع دسترسی به IndexedDB دقیقاً پیش از شروع Rollback در حالی که LocalStorage کاملاً فعال است
        disableMockIndexedDB();
        throw new Error('Simulated failure on userRole while IndexedDB becomes unavailable');
      }
      return origSet.call(this, key, value);
    };

    const res = await restoreFromPreMergeRecoveryPoint(targetRp);
    mockLocalStorage.setItem = origSet;
    resetFaults();

    assertEqual(res.ok, false, 'Scenario 16 must return ok: false');
    assertEqual(res.rollbackPerformed, true, 'Scenario 16 must report rollbackPerformed: true');
    assertEqual(
      res.rollbackVerified,
      false,
      'Scenario 16 must report rollbackVerified: false when IndexedDB was active before restore but unavailable during rollback'
    );
    assertMatch(res.error ?? '', /IndexedDB پیش از عملیات فعال بود/);
    console.log('[PASS] Scenario 16 (بند ۲): عدم دسترسی به IndexedDB در زمان Rollback (با وجود فعال بودن قبلی) -> گزارش قطعی rollbackVerified: false و عدم پنهان شدن خطا توسط LocalStorage');
    passed++;
  }

  // Regression Suite: بررسی سلامت سیاست ادغام غیرتخریبی، حفظ تعارض‌ها، تکمیل فیلد ناقص، انتخاب جدیدترین Recovery Point و هش یکپارچگی ۱۴ بخش
  {
    lsStore.clear();
    idbStores.clear();
    resetFaults();
    const seeded = await seedDeviceState('TARGET');
    const rpRes = await createPreMergeRecoveryPoint(seeded.state);
    assertEqual(rpRes.ok, true);
    const rpLatest = await getLatestPreMergeRecoveryPoint();
    assertOk(rpLatest && isValidPreMergeRecoveryPoint(rpLatest), 'Regression: Latest Recovery Point valid');

    const exportRes = await buildFullSystemJsonExport(seeded.state, []);
    assertEqual(exportRes.ok, true, `Export failed: ${exportRes.error}`);
    const incomingEnv = deepClone(exportRes.envelope!);
    incomingEnv.data.auditRecords['1'].author = 'نویسنده متفاوت ورودی';
    incomingEnv.data.auditRecords['1'].fipa = 'FIPA-NEW-1403';
    incomingEnv.data.auditRecords['99'] = {
      id: '99',
      key: '99',
      title: 'کتاب جدید ۹۹',
      author: 'نویسنده ۹۹',
    } as unknown as FullOperationalState['auditRecords'][string];
    incomingEnv.integrity.payloadHash = computeSystemDataIntegrityHash(incomingEnv.data);
    const serializedIncoming = JSON.stringify(incomingEnv);
    const report = inspectAndCompareSystemJson(
      serializedIncoming,
      'test-incoming.json',
      serializedIncoming.length,
      seeded.state,
      []
    );
    assertEqual(report.valid, true, `Inspection failed: ${report.errorReason}`);
    assertOk(report.newRecords.length >= 1, 'Regression: New record detected');
    assertOk(report.conflicts.length >= 1, 'Regression: Conflict on valid differing field preserved');
    console.log('[PASS] Scenario 17 (Regression Suite): سیاست ادغام غیرتخریبی، حفظ تعارض‌ها، تکمیل فیلد ناقص، انتخاب Recovery Point بر اساس timestampMs و یکپارچگی خروجی JSON');
  }

  console.log(`=== ALL ${passed}/16 RESTORE/ROLLBACK SCENARIOS + REGRESSION SUITE PASSED (EXIT 0) ===`);
}

runAllTests().catch((err) => {
  console.error('TEST SUITE FAILED:', err);
  throw err;
});
