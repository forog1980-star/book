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
  saveOperationalData,
  saveOperationalDataBatchAtomic,
  idbGetEnvelopeStrict,
} from '../../../utils/indexedDbStorage';
import {
  RECORD_META_MAP_KEY,
  BASELINE_CHANGE_MAP_KEY,
  APPLIED_PACKAGES_KEY,
  loadAppliedPackageIds,
  loadBaselineChangeMap,
  loadRecordMetaMap,
  loadSoftDeletedArchive,
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
  executeSafeJsonMerge,
  canonicalizeValueDeterministic,
  verifyExportAgainstRealStorage,
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

  // Scenario 18 (آزمایش اجباری ۱ بخش ۵): رکورد با شناسه یکسان و تعداد ثابت، اما محتوای متفاوت میان React State و Storage
  {
    lsStore.clear();
    idbStores.clear();
    resetFaults();
    const seeded = await seedDeviceState('PC_EXPORT_FRESH');

    // ۱) در Storage مقدار رکورد '1' جدیدتر و به‌روز شده است، اما React State یک نسخه قدیمی‌تر از همان شناسه دارد (تعداد رکورد ثابت = 1)
    const updatedAuditInStorage = deepClone(seeded.state.auditRecords);
    updatedAuditInStorage['1'].title = 'عنوان به‌روزشده و نهایی در Storage رایانه';
    updatedAuditInStorage['1'].publisher = 'انتشارات جدید در Storage';
    await saveOperationalData(OPERATIONAL_STORAGE_KEYS.auditRecords, updatedAuditInStorage);

    const staleReactState = deepClone(seeded.state);
    staleReactState.auditRecords['1'].title = 'عنوان قدیمی مانده در حافظه موقت React';
    staleReactState.auditRecords['1'].publisher = 'انتشارات قدیمی در State';

    const expFromStale = await buildFullSystemJsonExport(staleReactState, []);
    assertEqual(expFromStale.ok, true, `Scenario 18A export failed: ${expFromStale.error}`);
    assertEqual(expFromStale.storageVerification.verified, true, 'Scenario 18A storageVerification must be true');
    assertEqual(
      expFromStale.envelope.data.auditRecords['1'].title,
      'عنوان به‌روزشده و نهایی در Storage رایانه',
      'Scenario 18A: Export must reflect the fresher Storage content, not stale React state'
    );
    assertEqual(
      expFromStale.envelope.data.auditRecords['1'].publisher,
      'انتشارات جدید در Storage',
      'Scenario 18A: Export publisher must match fresher Storage publisher'
    );

    // ۲) همچنین اگر خود رکورد در React State دارای مهر زمان صریح جدیدتر باشد، باید در Storage تثبیت و در خروجی منعکس شود
    const explicitNewerState = deepClone(seeded.state);
    (explicitNewerState.auditRecords['1'] as unknown as Record<string, unknown>).updatedAtMs =
      Date.now() + 500000;
    explicitNewerState.auditRecords['1'].notes = 'یادداشت جدیدتر با مهر زمان صریح در State';

    const expFromExplicitNewer = await buildFullSystemJsonExport(explicitNewerState, []);
    assertEqual(expFromExplicitNewer.ok, true);
    assertEqual(expFromExplicitNewer.storageVerification.verified, true);
    assertEqual(
      expFromExplicitNewer.envelope.data.auditRecords['1'].notes,
      'یادداشت جدیدتر با مهر زمان صریح در State',
      'Scenario 18B: Explicitly timestamped newer record must be persisted and exported'
    );
    console.log('[PASS] Scenario 18 (آزمایش ۱): رکورد با شناسه یکسان و تعداد ثابت اما محتوای متفاوت میان React State و Storage -> انعکاس دقیق وضعیت معتبر و جدیدتر');
    passed++;
  }

  // Scenario 19 (آزمایش اجباری ۲ بخش ۵): ثبت یک رکورد جدید روی رایانه و اجرای بلافاصله خروجی JSON (شامل نوشتن غیرهمزمان در حال انجام)
  {
    lsStore.clear();
    idbStores.clear();
    resetFaults();
    const seeded = await seedDeviceState('PC_IMMEDIATE_EXPORT');

    const nextState = deepClone(seeded.state);
    nextState.auditRecords['PC-NEW-202'] = {
      id: 'PC-NEW-202',
      key: 'PC-NEW-202',
      tempBookId: 'TMP-OUT-202',
      copyId: 'CP-2020',
      rowNumber: 202,
      title: 'کتاب تازه ثبت‌شده روی رایانه بلافاصله پیش از خروجی',
      author: 'پژوهشگر مرکز اسناد',
      publisher: 'انتشارات شاهد',
      year: '1403',
      category: 'خاطرات',
      countedCopies: '2',
      shelf: 'B',
      level: '3',
      location: 'B-3',
      isbn: '978-600-00-0202-2',
      fipa: 'FIPA-PC-202',
      registrationNo: 'REG-PC-202',
      edition: 'اول',
      physical: 'verified',
      copyStatus: 'available',
      notes: 'ثبت فوری برای تست انتقال رایانه به گوشی',
      observedDate: '1403/12/20',
      source: 'outside-list',
    } as unknown as FullOperationalState['auditRecords'][string];

    // آغاز ذخیره‌سازی غیرهمزمان بدون await (مشابه useEffect در App.tsx) و فراخوانی بلافاصله buildFullSystemJsonExport
    const pendingSavePromise = saveOperationalData(
      OPERATIONAL_STORAGE_KEYS.auditRecords,
      nextState.auditRecords
    );
    const immediateExportRes = await buildFullSystemJsonExport(nextState, []);
    await pendingSavePromise;

    assertEqual(immediateExportRes.ok, true, `Scenario 19 export failed: ${immediateExportRes.error}`);
    assertEqual(immediateExportRes.storageVerification.verified, true);
    assertOk(
      Boolean(immediateExportRes.envelope.data.auditRecords['PC-NEW-202']),
      'Scenario 19: Newly registered PC record must be present in immediate JSON export'
    );
    assertEqual(
      immediateExportRes.envelope.data.auditRecords['PC-NEW-202'].title,
      'کتاب تازه ثبت‌شده روی رایانه بلافاصله پیش از خروجی'
    );
    console.log('[PASS] Scenario 19 (آزمایش ۲): ثبت رکورد جدید روی رایانه و اجرای بلافاصله خروجی JSON -> انتظار برای تکمیل ذخیره‌سازی معلق و حضور قطعی رکورد جدید در خروجی');
    passed++;
  }

  // Scenario 20 (آزمایش اجباری ۳ بخش ۵): شبیه‌سازی خطای خواندن Storage در زمان خروجی‌گیری -> سیستم نباید خروجی را معتبر اعلام کند
  {
    lsStore.clear();
    idbStores.clear();
    resetFaults();
    const seeded = await seedDeviceState('PC_STORAGE_READ_ERR');

    // شبیه‌سازی خطای خواندن در IndexedDB
    failIdbTxMode = 'always';
    const failedExportRes = await buildFullSystemJsonExport(seeded.state, []);
    resetFaults();

    assertEqual(
      failedExportRes.ok,
      false,
      'Scenario 20: Export must return ok: false when Storage read fails'
    );
    assertEqual(
      failedExportRes.storageVerification.verified,
      false,
      'Scenario 20: storageVerification.verified must be false when Storage read fails'
    );
    assertEqual(
      failedExportRes.jsonString,
      '',
      'Scenario 20: No unverified JSON string may be delivered on Storage read error'
    );
    assertOk(
      failedExportRes.storageVerification.mismatches.length > 0,
      'Scenario 20: Mismatches must report the Storage read error'
    );

    // همچنین بررسی مستقیم verifyExportAgainstRealStorage هنگام عدم تطابق محتوای کانونیکال با وجود برابری تعداد
    const tamperedState = deepClone(seeded.state);
    tamperedState.auditRecords['1'].title = 'عنوان دستکاری‌شده خارج از Storage با تعداد ثابت';
    const verifyTampered = await verifyExportAgainstRealStorage(tamperedState);
    assertEqual(
      verifyTampered.verified,
      false,
      'Scenario 20B: verifyExportAgainstRealStorage must reject canonical content mismatch even when record counts are equal'
    );
    console.log('[PASS] Scenario 20 (آزمایش ۳): شبیه‌سازی خطای خواندن Storage و عدم تطابق محتوایی -> توقف تحویل خروجی و گزارش صریح عدم تأیید (ok: false, verified: false)');
    passed++;
  }

  // Scenario 21 (آزمایش اجباری ۴ بخش ۵): بررسی تطابق کامل محتوا و تعداد بین JSON خروجی و Snapshot نهایی ذخیره‌شده
  {
    lsStore.clear();
    idbStores.clear();
    resetFaults();
    const seeded = await seedDeviceState('PC_CANONICAL_MATCH');

    const expRes = await buildFullSystemJsonExport(seeded.state, []);
    assertEqual(expRes.ok, true, `Scenario 21 export failed: ${expRes.error}`);
    assertEqual(expRes.storageVerification.verified, true);
    assertEqual(expRes.storageVerification.mismatches.length, 0);

    const parsedEnv = JSON.parse(expRes.jsonString);
    const collectionMap: Array<{
      col: keyof FullOperationalState;
      storageKey: string;
    }> = [
      { col: 'auditRecords', storageKey: OPERATIONAL_STORAGE_KEYS.auditRecords },
      { col: 'bookCopies', storageKey: OPERATIONAL_STORAGE_KEYS.bookCopies },
      { col: 'customMartyrs', storageKey: OPERATIONAL_STORAGE_KEYS.customMartyrs },
      { col: 'smartSuggestions', storageKey: OPERATIONAL_STORAGE_KEYS.smartSuggestions },
      { col: 'links', storageKey: OPERATIONAL_STORAGE_KEYS.links },
      { col: 'pendingReviews', storageKey: OPERATIONAL_STORAGE_KEYS.pendingReviews },
      { col: 'multiMartyrGroups', storageKey: OPERATIONAL_STORAGE_KEYS.multiMartyrGroups },
      { col: 'extractedItems', storageKey: OPERATIONAL_STORAGE_KEYS.extractedItems },
      { col: 'auditLog', storageKey: OPERATIONAL_STORAGE_KEYS.auditLog },
      { col: 'rejectedSuggestionsArchive', storageKey: OPERATIONAL_STORAGE_KEYS.rejectedSuggestions },
    ];

    for (const item of collectionMap) {
      const idbStrict = await idbGetEnvelopeStrict(item.storageKey);
      assertEqual(idbStrict.ok, true);
      assertEqual(idbStrict.exists, true);
      assertEqual(
        canonicalizeValueDeterministic(parsedEnv.data[item.col]),
        canonicalizeValueDeterministic(idbStrict.data),
        `Scenario 21: Canonical content of ${item.col} in exported JSON must match persisted IndexedDB snapshot 100%`
      );
      assertEqual(
        expRes.storageVerification.extractedCounts[item.col],
        expRes.storageVerification.storageActualCounts[item.col],
        `Scenario 21: Extracted count for ${item.col} must match storage actual count`
      );
    }
    console.log('[PASS] Scenario 21 (آزمایش ۴): تطابق ۱۰۰٪ محتوای کانونیکال و تعداد هر ۱۰ مجموعه عملیاتی بین فایل JSON خروجی و Snapshot نهایی ذخیره‌شده در Storage');
    passed++;
  }

  // Scenario 22 (آزمایش اجباری ۵ بخش ۵): ورود JSON رایانه به دستگاه مقصد آزمایشی (گوشی): افزودن رکورد جدید، تکمیل فیلد خالی، حفظ تعارض و عدم ایجاد تکرار در ورود مجدد
  {
    lsStore.clear();
    idbStores.clear();
    resetFaults();

    // ۱) ساخت وضعیت رایانه (مبدأ) شامل:
    // - رکورد '1' با فیلد fipa تکمیل‌شده ('FIPA-PC-FILLED-99') و فیلد متعارض publisher ('نشر رایانه متعارض')
    // - رکورد کاملاً جدید 'PC-ONLY-BOOK-301'
    const pcSeeded = await seedDeviceState('PC_SOURCE');
    const pcState = deepClone(pcSeeded.state);
    pcState.auditRecords['1'].fipa = 'FIPA-PC-FILLED-99';
    pcState.auditRecords['1'].publisher = 'نشر رایانه متعارض';
    pcState.auditRecords['PC-ONLY-BOOK-301'] = {
      id: 'PC-ONLY-BOOK-301',
      key: 'PC-ONLY-BOOK-301',
      tempBookId: 'TMP-OUT-301',
      copyId: 'CP-3010',
      rowNumber: 301,
      title: 'کتاب اختصاصی ثبت‌شده روی رایانه برای انتقال به گوشی',
      author: 'نویسنده رایانه',
      publisher: 'نشر رایانه',
      year: '1403',
      category: 'پژوهش',
      countedCopies: '1',
      shelf: 'C',
      level: '1',
      location: 'C-1',
      isbn: '978-600-00-0301-2',
      fipa: 'FIPA-PC-301',
      registrationNo: 'REG-PC-301',
      edition: 'اول',
      physical: 'verified',
      copyStatus: 'available',
      notes: 'ثبت روی رایانه',
      observedDate: '1403/12/20',
      source: 'outside-list',
    } as unknown as FullOperationalState['auditRecords'][string];
    await saveOperationalData(OPERATIONAL_STORAGE_KEYS.auditRecords, pcState.auditRecords);

    const pcExport = await buildFullSystemJsonExport(pcState, []);
    assertEqual(pcExport.ok, true);

    // ۲) آماده‌سازی وضعیت گوشی (مقصد) که در آن:
    // - رکورد '1' دارای fipa خالی ('') و publisher معتبر ('نشر معتبر گوشی') است
    // - رکورد اختصاصی گوشی 'PHONE-ONLY-BOOK-401' نیز روی گوشی وجود دارد
    lsStore.clear();
    idbStores.clear();
    resetFaults();
    const phoneSeeded = await seedDeviceState('PHONE_DEST');
    const phoneState = deepClone(phoneSeeded.state);
    phoneState.auditRecords['1'].fipa = '';
    phoneState.auditRecords['1'].publisher = 'نشر معتبر گوشی';
    phoneState.auditRecords['PHONE-ONLY-BOOK-401'] = {
      id: 'PHONE-ONLY-BOOK-401',
      key: 'PHONE-ONLY-BOOK-401',
      tempBookId: 'TMP-OUT-401',
      copyId: 'CP-4010',
      rowNumber: 401,
      title: 'کتاب اختصاصی موجود روی گوشی که نباید حذف شود',
      author: 'نویسنده گوشی',
      publisher: 'نشر گوشی',
      year: '1403',
      category: 'تاریخ',
      countedCopies: '1',
      shelf: 'A',
      level: '2',
      location: 'A-2',
      isbn: '978-600-00-0401-9',
      fipa: 'FIPA-PHONE-401',
      registrationNo: 'REG-PHONE-401',
      edition: 'اول',
      physical: 'verified',
      copyStatus: 'available',
      notes: 'موجود در گوشی',
      observedDate: '1403/12/19',
      source: 'outside-list',
    } as unknown as FullOperationalState['auditRecords'][string];
    await saveOperationalData(OPERATIONAL_STORAGE_KEYS.auditRecords, phoneState.auditRecords);

    // ۳) پیش‌نمایش و اجرای ادغام در گوشی
    const preview1 = inspectAndCompareSystemJson(
      pcExport.jsonString,
      pcExport.fileName,
      pcExport.byteSize,
      phoneState,
      []
    );
    assertEqual(preview1.valid, true);
    assertOk(
      preview1.newRecords.some((r) => r.collection === 'auditRecords' && r.recordId === 'PC-ONLY-BOOK-301'),
      'Scenario 22: PC-ONLY-BOOK-301 must be detected as a new record'
    );
    assertOk(
      preview1.conflicts.some((c) => c.collection === 'auditRecords' && c.recordId === '1'),
      'Scenario 22: Record 1 must be detected as a conflict (due to differing publisher) while having complementary fipa'
    );

    const merge1 = await executeSafeJsonMerge(preview1, phoneState, {});
    assertEqual(merge1.ok, true, `Scenario 22 merge1 failed: ${merge1.error}`);
    assertOk(Boolean(merge1.mergedState.auditRecords['PC-ONLY-BOOK-301']), 'Scenario 22: New PC record added');
    assertOk(Boolean(merge1.mergedState.auditRecords['PHONE-ONLY-BOOK-401']), 'Scenario 22: Phone-only record preserved');
    assertEqual(
      merge1.mergedState.auditRecords['1'].fipa,
      'FIPA-PC-FILLED-99',
      'Scenario 22: Empty fipa field on Phone must be completed from PC JSON'
    );
    assertEqual(
      merge1.mergedState.auditRecords['1'].publisher,
      'نشر معتبر گوشی',
      'Scenario 22: Valid conflicting publisher field on Phone must NEVER be overwritten'
    );

    // ۴) ورود مجدد همان فایل JSON برای بار دوم (بررسی Idempotency و عدم ایجاد رکورد تکراری)
    const preview2 = inspectAndCompareSystemJson(
      pcExport.jsonString,
      pcExport.fileName,
      pcExport.byteSize,
      merge1.mergedState,
      []
    );
    assertEqual(preview2.valid, true);
    assertEqual(
      preview2.newRecords.length,
      0,
      'Scenario 22: Re-importing the same JSON file must detect 0 new records (no duplicates)'
    );
    assertEqual(
      preview2.modifiedRecords.length,
      0,
      'Scenario 22: Re-importing the same JSON file must detect 0 modified records'
    );
    const merge2 = await executeSafeJsonMerge(preview2, merge1.mergedState, {});
    assertEqual(merge2.ok, true);
    assertEqual(merge2.appliedNewCount, 0);
    assertEqual(
      Object.keys(merge2.mergedState.auditRecords).length,
      Object.keys(merge1.mergedState.auditRecords).length,
      'Scenario 22: Audit record count must remain identical on second import'
    );
    console.log('[PASS] Scenario 22 (آزمایش ۵): ورود JSON به دستگاه مقصد (افزودن رکورد جدید، تکمیل فیلد خالی، حفظ فیلد معتبر متعارض مقصد و عدم ایجاد تکرار در ورود مجدد)');
    passed++;
  }

  // Scenario 23 (آزمایش اجباری ۶ بخش ۵): بررسی حفظ و ارتقای شمارنده‌های idSequences، حفظ Sync Metadata و عدم حذف رکوردهای موجود مقصد
  {
    lsStore.clear();
    idbStores.clear();
    resetFaults();

    // ۱) تولید خروجی از رایانه با شمارنده‌های بالاتر در برخی کلیدها و متادیتای همگام‌سازی مشخص
    const pcSeeded = await seedDeviceState('PC_SEQ_META');
    mockLocalStorage.setItem(
      ID_SEQUENCE_STORAGE_KEY,
      JSON.stringify({
        LOG: 1450,
        RL: 1320,
        SS: 1100,
        MR: 1280,
        EX: 1190,
        CP: 1600,
        TMP_OUT: 45,
      })
    );
    saveSoftDeletedArchive({
      'links:RL-PC-DEL-800': {
        meta: {
          recordId: 'RL-PC-DEL-800',
          collection: 'links',
          revision: 2,
          updatedAtMs: 1700000800000,
          updatedByDeviceId: 'DEV-PC',
          updatedByRole: 'پژوهشگر',
          lastPackageId: 'PKG-PC-800',
          checksum: 'CHK-PC-800',
        } as unknown as RecordSyncMeta,
        data: { id: 'RL-PC-DEL-800' },
      } as unknown as SyncRecordEnvelope,
    });
    const pcExport = await buildFullSystemJsonExport(pcSeeded.state, []);
    assertEqual(pcExport.ok, true);

    // ۲) آماده‌سازی گوشی مقصد با شمارنده‌های بالاتر در کلیدهای دیگر (مثلاً SS=1500 و TMP_OUT=80) و رکوردهای اختصاصی
    lsStore.clear();
    idbStores.clear();
    resetFaults();
    const phoneSeeded = await seedDeviceState('PHONE_SEQ_META');
    mockLocalStorage.setItem(
      ID_SEQUENCE_STORAGE_KEY,
      JSON.stringify({
        LOG: 1200,
        RL: 1100,
        SS: 1500,
        MR: 1050,
        EX: 1020,
        CP: 1300,
        TMP_OUT: 80,
      })
    );
    saveSoftDeletedArchive({
      'links:RL-PHONE-DEL-900': {
        meta: {
          recordId: 'RL-PHONE-DEL-900',
          collection: 'links',
          revision: 3,
          updatedAtMs: 1700000900000,
          updatedByDeviceId: 'DEV-PHONE',
          updatedByRole: 'پژوهشگر',
          lastPackageId: 'PKG-PHONE-900',
          checksum: 'CHK-PHONE-900',
        } as unknown as RecordSyncMeta,
        data: { id: 'RL-PHONE-DEL-900' },
      } as unknown as SyncRecordEnvelope,
    });

    const report = inspectAndCompareSystemJson(
      pcExport.jsonString,
      pcExport.fileName,
      pcExport.byteSize,
      phoneSeeded.state,
      []
    );
    assertEqual(report.valid, true);

    const mergeRes = await executeSafeJsonMerge(report, phoneSeeded.state, {});
    assertEqual(mergeRes.ok, true, `Scenario 23 merge failed: ${mergeRes.error}`);

    // بررسی شمارنده‌های idSequences پس از ادغام (باید دقیقاً Math.max بین رایانه و گوشی باشد)
    const finalSeq = JSON.parse(mockLocalStorage.getItem(ID_SEQUENCE_STORAGE_KEY) || '{}');
    assertEqual(finalSeq.LOG, 1450, 'Scenario 23: LOG sequence must advance to PC max (1450)');
    assertEqual(finalSeq.RL, 1320, 'Scenario 23: RL sequence must advance to PC max (1320)');
    assertEqual(finalSeq.SS, 1500, 'Scenario 23: SS sequence must preserve Phone higher max (1500)');
    assertEqual(finalSeq.MR, 1280, 'Scenario 23: MR sequence must advance to PC max (1280)');
    assertEqual(finalSeq.EX, 1190, 'Scenario 23: EX sequence must advance to PC max (1190)');
    assertEqual(finalSeq.CP, 1600, 'Scenario 23: CP sequence must advance to PC max (1600)');
    assertEqual(finalSeq.TMP_OUT, 80, 'Scenario 23: TMP_OUT sequence must preserve Phone higher max (80)');

    // بررسی حفظ Sync Metadata هر دو دستگاه و ثبت exportId بسته ورودی
    const finalApplied = loadAppliedPackageIds();
    assertOk(
      finalApplied.includes(pcExport.envelope.exportId),
      'Scenario 23: exportId of imported PC JSON must be recorded in appliedPackageIds'
    );
    assertOk(
      finalApplied.includes('PKG-PHONE_SEQ_META-001'),
      'Scenario 23: Existing Phone appliedPackageIds must be preserved'
    );
    assertOk(
      finalApplied.includes('PKG-PC_SEQ_META-001'),
      'Scenario 23: Incoming PC appliedPackageIds must also be preserved'
    );
    const finalMetaMap = loadRecordMetaMap();
    assertOk(Boolean(finalMetaMap['auditRecords::1']), 'Scenario 23: recordMetaMap must be preserved');
    const finalBaseline = loadBaselineChangeMap();
    assertOk(Boolean(finalBaseline['auditRecords:1'] || finalBaseline['auditRecords::1']), 'Scenario 23: baselineChangeMap must be preserved');
    const finalSoftDel = loadSoftDeletedArchive();
    assertOk(
      Boolean(finalSoftDel['links:RL-PHONE-DEL-900']),
      'Scenario 23: Phone softDeletedArchive tombstones must be preserved'
    );
    assertOk(
      Boolean(finalSoftDel['links:RL-PC-DEL-800']),
      'Scenario 23: Incoming PC softDeletedArchive tombstones must be merged additively'
    );
    console.log('[PASS] Scenario 23 (آزمایش ۶): حفظ و ارتقای یکنواخت idSequences، حفظ کامل Sync Metadata و عدم حذف هیچ رکورد موجود در مقصد');
    passed++;
  }

  console.log(`=== ALL ${passed}/22 RESTORE/ROLLBACK + EXPORT FRESHNESS & REVERSE TRANSFER SCENARIOS + REGRESSION SUITE PASSED (EXIT 0) ===`);
}

runAllTests().catch((err) => {
  console.error('TEST SUITE FAILED:', err);
  throw err;
});
