import type {
  AppSnapshot, AuditEvent, BookCopy, BookMartyrLink, BookRecord, ExtractedItem,
  ImportBatch, MartyrRecord, RawSourceRow,
} from './model.js';
import { APP_ID, LOCAL_ACTOR, SCHEMA_VERSION, createId } from './domain.js';

const DB_NAME = 'markaz-asnad-library-research';
const DB_VERSION = 1;
const STORE_NAMES = ['books', 'copies', 'martyrs', 'links', 'excerpts', 'imports', 'sourceRows', 'audit', 'meta'] as const;
type StoreName = (typeof STORE_NAMES)[number];
let databasePromise: Promise<IDBDatabase> | undefined;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('خطا در خواندن پایگاه داده محلی.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('تراکنش پایگاه داده ناموفق بود.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('تراکنش پایگاه داده لغو شد.'));
  });
}

export function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('این مرورگر IndexedDB را پشتیبانی نمی‌کند.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const storeName of STORE_NAMES) {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: 'id' });
          if (storeName === 'copies') store.createIndex('bookId', 'bookId', { unique: false });
          if (storeName === 'links') {
            store.createIndex('bookId', 'bookId', { unique: false });
            store.createIndex('martyrId', 'martyrId', { unique: false });
          }
          if (storeName === 'excerpts') {
            store.createIndex('bookId', 'bookId', { unique: false });
            store.createIndex('martyrId', 'martyrId', { unique: false });
          }
          if (storeName === 'sourceRows') store.createIndex('batchId', 'batchId', { unique: false });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('بازکردن پایگاه داده محلی ناموفق بود.'));
    request.onblocked = () => reject(new Error('نسخه دیگری از برنامه باز است؛ آن را ببندید و دوباره تلاش کنید.'));
  });
  return databasePromise;
}

async function listAll<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readonly');
  const done = transactionDone(tx);
  const result = await requestResult(tx.objectStore(storeName).getAll());
  await done;
  return result as T[];
}

export async function getAllBooks(): Promise<BookRecord[]> { return listAll<BookRecord>('books'); }
export async function getAllCopies(): Promise<BookCopy[]> { return listAll<BookCopy>('copies'); }
export async function getAllMartyrs(): Promise<MartyrRecord[]> { return listAll<MartyrRecord>('martyrs'); }
export async function getAllLinks(): Promise<BookMartyrLink[]> { return listAll<BookMartyrLink>('links'); }
export async function getAllExcerpts(): Promise<ExtractedItem[]> { return listAll<ExtractedItem>('excerpts'); }
export async function getAllImports(): Promise<ImportBatch[]> { return listAll<ImportBatch>('imports'); }
export async function getAllSourceRows(): Promise<RawSourceRow[]> { return listAll<RawSourceRow>('sourceRows'); }
export async function getAllAudit(): Promise<AuditEvent[]> { return listAll<AuditEvent>('audit'); }

export async function getCopiesForBook(bookId: string): Promise<BookCopy[]> {
  const db = await openDatabase();
  const tx = db.transaction('copies', 'readonly');
  const done = transactionDone(tx);
  const result = await requestResult(tx.objectStore('copies').index('bookId').getAll(bookId));
  await done;
  return result as BookCopy[];
}

export async function getLinksForBook(bookId: string): Promise<BookMartyrLink[]> {
  const db = await openDatabase();
  const tx = db.transaction('links', 'readonly');
  const done = transactionDone(tx);
  const result = await requestResult(tx.objectStore('links').index('bookId').getAll(bookId));
  await done;
  return result as BookMartyrLink[];
}

export async function saveBookWithCopy(book: BookRecord, copy?: BookCopy): Promise<void> {
  const db = await openDatabase();
  const names = copy ? ['books', 'copies', 'audit'] : ['books', 'audit'];
  const tx = db.transaction(names, 'readwrite');
  tx.objectStore('books').put(book);
  if (copy) tx.objectStore('copies').put(copy);
  const audit: AuditEvent = {
    id: createId('AUD'), entityType: 'book', entityId: book.id,
    action: copy ? 'book_and_copy_registered' : 'book_registered', actor: LOCAL_ACTOR,
    occurredAt: new Date().toISOString(), summary: `ثبت کتاب: ${book.titleDisplay}`,
  };
  tx.objectStore('audit').put(audit);
  await transactionDone(tx);
}

export async function saveCopy(copy: BookCopy, action = 'copy_observation_registered'): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(['copies', 'audit'], 'readwrite');
  tx.objectStore('copies').put(copy);
  tx.objectStore('audit').put({
    id: createId('AUD'), entityType: 'book_copy', entityId: copy.id,
    action, actor: LOCAL_ACTOR,
    occurredAt: new Date().toISOString(), summary: `ثبت وضعیت نسخه فیزیکی ${copy.id}`,
  } satisfies AuditEvent);
  await transactionDone(tx);
}

export async function saveMartyr(martyr: MartyrRecord): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(['martyrs', 'audit'], 'readwrite');
  tx.objectStore('martyrs').put(martyr);
  tx.objectStore('audit').put({
    id: createId('AUD'), entityType: 'martyr', entityId: martyr.id,
    action: 'martyr_registered', actor: LOCAL_ACTOR,
    occurredAt: new Date().toISOString(), summary: `ثبت پرونده شهید: ${martyr.fullNameRaw}`,
  } satisfies AuditEvent);
  await transactionDone(tx);
}

export async function updateMartyrStatus(martyr: MartyrRecord, status: MartyrRecord['identityReviewStatus'], note: string): Promise<void> {
  const reviewedAt = new Date().toISOString();
  const updated: MartyrRecord = { ...martyr, identityReviewStatus: status, identityReviewNote: note, identityReviewedAt: reviewedAt, identityReviewedBy: LOCAL_ACTOR, updatedAt: reviewedAt };
  const db = await openDatabase();
  const tx = db.transaction(['martyrs', 'audit'], 'readwrite');
  tx.objectStore('martyrs').put(updated);
  tx.objectStore('audit').put({
    id: createId('AUD'), entityType: 'martyr', entityId: martyr.id,
    action: `martyr_identity_${status}`, actor: LOCAL_ACTOR,
    occurredAt: reviewedAt, summary: `تغییر وضعیت بررسی هویت پرونده ${martyr.fullNameRaw} به ${status}`,
  } satisfies AuditEvent);
  await transactionDone(tx);
}

export async function saveLink(link: BookMartyrLink): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(['links', 'audit'], 'readwrite');
  tx.objectStore('links').put(link);
  tx.objectStore('audit').put({
    id: createId('AUD'), entityType: 'book_martyr_link', entityId: link.id,
    action: 'link_proposed', actor: LOCAL_ACTOR,
    occurredAt: new Date().toISOString(), summary: 'ثبت ارتباط پیشنهادی کتاب و شهید؛ نیازمند بررسی انسانی',
  } satisfies AuditEvent);
  await transactionDone(tx);
}

export async function saveExcerpt(excerpt: ExtractedItem): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(['excerpts', 'audit'], 'readwrite');
  tx.objectStore('excerpts').put(excerpt);
  tx.objectStore('audit').put({
    id: createId('AUD'), entityType: 'extracted_item', entityId: excerpt.id,
    action: 'research_note_registered', actor: LOCAL_ACTOR,
    occurredAt: new Date().toISOString(), summary: `ثبت یادداشت پژوهشی: ${excerpt.title}`,
  } satisfies AuditEvent);
  await transactionDone(tx);
}

export async function updateLinkStatus(link: BookMartyrLink, status: BookMartyrLink['reviewStatus'], note: string): Promise<void> {
  const updated: BookMartyrLink = { ...link, reviewStatus: status, reviewNote: note, reviewedAt: new Date().toISOString(), reviewedBy: LOCAL_ACTOR, updatedAt: new Date().toISOString() };
  const db = await openDatabase();
  const tx = db.transaction(['links', 'audit'], 'readwrite');
  tx.objectStore('links').put(updated);
  tx.objectStore('audit').put({
    id: createId('AUD'), entityType: 'book_martyr_link', entityId: link.id,
    action: `link_${status}`, actor: LOCAL_ACTOR,
    occurredAt: new Date().toISOString(), summary: `تغییر وضعیت ارتباط به ${status}`,
  } satisfies AuditEvent);
  await transactionDone(tx);
}

export async function updateExcerptStatus(excerpt: ExtractedItem, status: ExtractedItem['reviewStatus'], note: string): Promise<void> {
  const reviewedAt = new Date().toISOString();
  const updated: ExtractedItem = { ...excerpt, reviewStatus: status, reviewNote: note, reviewedAt, reviewedBy: LOCAL_ACTOR, updatedAt: reviewedAt };
  const db = await openDatabase();
  const tx = db.transaction(['excerpts', 'audit'], 'readwrite');
  tx.objectStore('excerpts').put(updated);
  tx.objectStore('audit').put({
    id: createId('AUD'), entityType: 'extracted_item', entityId: excerpt.id,
    action: `excerpt_${status}`, actor: LOCAL_ACTOR,
    occurredAt: new Date().toISOString(), summary: `تغییر وضعیت یادداشت پژوهشی به ${status}`,
  } satisfies AuditEvent);
  await transactionDone(tx);
}

export async function stageImport(batch: ImportBatch, rows: RawSourceRow[]): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(['imports', 'sourceRows', 'audit'], 'readwrite');
  tx.objectStore('imports').put(batch);
  const sourceStore = tx.objectStore('sourceRows');
  for (const row of rows) sourceStore.put(row);
  tx.objectStore('audit').put({
    id: createId('AUD'), entityType: 'import_batch', entityId: batch.id,
    action: 'excel_sheet_staged', actor: LOCAL_ACTOR,
    occurredAt: new Date().toISOString(), summary: `ثبت موقت شیت «${batch.sheetName}» برای بررسی؛ ${rows.length} ردیف`,
  } satisfies AuditEvent);
  await transactionDone(tx);
}

export async function hasImportHashAndSheet(hash: string, sheetName: string): Promise<boolean> {
  const imports = await getAllImports();
  return imports.some((item) => item.sourceSha256 === hash && item.sheetName === sheetName);
}

export async function createSnapshot(): Promise<AppSnapshot> {
  const [books, copies, martyrs, links, excerpts, imports, sourceRows, audit] = await Promise.all([
    getAllBooks(), getAllCopies(), getAllMartyrs(), getAllLinks(), getAllExcerpts(), getAllImports(), getAllSourceRows(), getAllAudit(),
  ]);
  return {
    schemaVersion: SCHEMA_VERSION,
    appId: APP_ID,
    exportedAt: new Date().toISOString(),
    stores: { books, copies, martyrs, links, excerpts, imports, sourceRows, audit },
  };
}

export function validateSnapshot(value: unknown): value is AppSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<AppSnapshot>;
  if (snapshot.appId !== APP_ID || snapshot.schemaVersion !== SCHEMA_VERSION || !snapshot.stores) return false;
  const storeNames = ['books', 'copies', 'martyrs', 'links', 'excerpts', 'imports', 'sourceRows', 'audit'] as const;
  for (const name of storeNames) {
    const rows = (snapshot.stores as Record<string, unknown>)[name];
    if (!Array.isArray(rows)) return false;
    const ids = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row !== 'object') return false;
      const id = (row as { id?: unknown }).id;
      if (typeof id !== 'string' || !id.trim() || ids.has(id)) return false;
      ids.add(id);
    }
  }
  const stores = snapshot.stores;
  const bookIds = new Set(stores.books.map((item) => item.id));
  const martyrIds = new Set(stores.martyrs.map((item) => item.id));
  const batchIds = new Set(stores.imports.map((item) => item.id));
  if (stores.copies.some((item) => typeof item.bookId !== 'string' || !bookIds.has(item.bookId))) return false;
  if (stores.links.some((item) => !bookIds.has(item.bookId) || !martyrIds.has(item.martyrId))) return false;
  if (stores.excerpts.some((item) => !bookIds.has(item.bookId) || (item.martyrId && !martyrIds.has(item.martyrId)))) return false;
  if (stores.sourceRows.some((item) => !batchIds.has(item.batchId) || !Number.isInteger(item.rowNumber) || item.rowNumber < 1 || !Array.isArray(item.values) || !item.formulas || typeof item.formulas !== 'object')) return false;
  return true;
}

export async function mergeSnapshot(snapshot: AppSnapshot): Promise<{ added: number; conflicts: number }> {
  if (!validateSnapshot(snapshot)) throw new Error('ساختار یا نسخه پشتیبان معتبر نیست.');
  const existing = await Promise.all([
    getAllBooks(), getAllCopies(), getAllMartyrs(), getAllLinks(), getAllExcerpts(), getAllImports(), getAllSourceRows(), getAllAudit(),
  ]);
  const existingIds = existing.map((items) => new Set(items.map((item) => (item as { id: string }).id)));
  const sourceStores = [snapshot.stores.books, snapshot.stores.copies, snapshot.stores.martyrs, snapshot.stores.links, snapshot.stores.excerpts, snapshot.stores.imports, snapshot.stores.sourceRows, snapshot.stores.audit] as Array<Array<{ id: string }>>;
  let added = 0;
  let conflicts = 0;
  const db = await openDatabase();
  const tx = db.transaction(['books', 'copies', 'martyrs', 'links', 'excerpts', 'imports', 'sourceRows', 'audit'], 'readwrite');
  const names = ['books', 'copies', 'martyrs', 'links', 'excerpts', 'imports', 'sourceRows', 'audit'] as const;
  for (let i = 0; i < names.length; i += 1) {
    const store = tx.objectStore(names[i]);
    for (const item of sourceStores[i]) {
      if (existingIds[i].has(item.id)) { conflicts += 1; continue; }
      store.put(item);
      added += 1;
    }
  }
  await transactionDone(tx);
  return { added, conflicts };
}
