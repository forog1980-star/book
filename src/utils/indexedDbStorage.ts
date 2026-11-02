/**
 * لایه ذخیره‌سازی آفلاین پایگاه داده book در حافظه محلی گوشی (IndexedDB)
 * نام پایگاه داده مشخص‌شده: book
 */

export const BOOK_DB_NAME = 'book';
const DB_VERSION = 1;
const STORE_NAME = 'book_store';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(BOOK_DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function idbSetItem<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback handled by localStorage
  }
}

export async function idbGetItem<T>(key: string): Promise<T | null> {
  try {
    const db = await openDatabase();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/**
 * دریافت نام و وضعیت پایگاه داده محلی برای نمایش در واسط کاربری
 */
export function getBookStorageInfo() {
  return {
    databaseName: BOOK_DB_NAME,
    title: 'پایگاه داده book در گوشی',
    storeName: STORE_NAME
  };
}
