/**
 * Device-local store for the heavy parts of an observation: the lesson audio
 * and the classroom snapshots.
 *
 * Neither was held anywhere durable. Audio lived in component state and was
 * gone the moment the tab reloaded or the appraiser opened another teacher.
 * Photos were inlined into the record as base64, which put them inside
 * localStorage's ~5MB quota and inside the ~1MB Firestore document - so a
 * handful of snapshots could stop an observation being saved at all.
 *
 * Blobs go to IndexedDB instead. It holds orders of magnitude more, stores
 * binary without base64's third of inflation, and keeps the media on the
 * appraiser's own device while the record stays small enough to sync.
 */

const DB_NAME = 'eduversal_media';
const DB_VERSION = 1;
const STORE = 'media';
const APPRAISAL_INDEX = 'appraisalId';

export type MediaKind = 'audio' | 'photo';

export interface StoredMedia {
  id: string;
  appraisalId: string;
  kind: MediaKind;
  mimeType: string;
  bytes: number;
  createdAt: string;
  blob: Blob;
}

/**
 * Whether this browser can hold media at all. IndexedDB is missing under
 * server rendering and is refused outright by some privacy modes, so every
 * caller has to be able to carry on without it rather than lose the photo.
 */
export function isMediaStoreAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (!isMediaStoreAvailable()) {
    return Promise.reject(new Error('This browser has no local media storage.'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        // Everything belonging to one observation is deleted together when
        // that observation is deleted, so it has to be findable by record.
        store.createIndex(APPRAISAL_INDEX, 'appraisalId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Local media storage could not be opened.'));
    // Another tab is holding an older version open; the caller falls back
    // rather than hanging on a database that will never arrive.
    request.onblocked = () => reject(new Error('Local media storage is busy in another tab.'));
  }).catch((error) => {
    // A failed open must not be cached, or every later call inherits it.
    dbPromise = null;
    throw error;
  });

  return dbPromise;
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = work(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Local media storage failed.'));
        tx.onabort = () => reject(tx.error || new Error('Local media storage aborted the write.'));
      })
  );
}

function newMediaId(kind: MediaKind): string {
  return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Writes a blob to the device and returns the id the record should hold.
 * Rejects when storage is unavailable or full - a caller that cannot lose the
 * media should catch and keep it inline instead.
 */
export async function putMedia(input: {
  appraisalId: string;
  kind: MediaKind;
  blob: Blob;
  id?: string;
}): Promise<string> {
  const id = input.id || newMediaId(input.kind);
  const entry: StoredMedia = {
    id,
    appraisalId: input.appraisalId,
    kind: input.kind,
    mimeType: input.blob.type || (input.kind === 'audio' ? 'audio/webm' : 'image/jpeg'),
    bytes: input.blob.size,
    createdAt: new Date().toISOString(),
    blob: input.blob,
  };

  await runTransaction('readwrite', (store) => store.put(entry) as IDBRequest<any>);
  return id;
}

export async function getMedia(id: string): Promise<StoredMedia | null> {
  if (!id || !isMediaStoreAvailable()) return null;
  try {
    const found = await runTransaction<StoredMedia | undefined>(
      'readonly',
      (store) => store.get(id) as IDBRequest<StoredMedia | undefined>
    );
    return found || null;
  } catch (error) {
    console.warn('Local media could not be read', error);
    return null;
  }
}

export async function deleteMedia(id: string): Promise<void> {
  if (!id || !isMediaStoreAvailable()) return;
  try {
    await runTransaction('readwrite', (store) => store.delete(id) as IDBRequest<any>);
  } catch (error) {
    console.warn('Local media could not be deleted', error);
  }
}

export async function listMediaForAppraisal(appraisalId: string): Promise<StoredMedia[]> {
  if (!appraisalId || !isMediaStoreAvailable()) return [];
  try {
    return await openDatabase().then(
      (db) =>
        new Promise<StoredMedia[]>((resolve, reject) => {
          const tx = db.transaction(STORE, 'readonly');
          const request = tx.objectStore(STORE).index(APPRAISAL_INDEX).getAll(appraisalId);
          request.onsuccess = () => resolve((request.result as StoredMedia[]) || []);
          request.onerror = () => reject(request.error);
        })
    );
  } catch (error) {
    console.warn('Local media could not be listed', error);
    return [];
  }
}

/** Deletes every clip and snapshot belonging to a deleted observation. */
export async function deleteMediaForAppraisal(appraisalId: string): Promise<void> {
  const owned = await listMediaForAppraisal(appraisalId);
  await Promise.all(owned.map((entry) => deleteMedia(entry.id)));
}

/* ------------------------------------------------------------------ *
 * Conversions
 *
 * The stored form is a Blob, but the report embeds images as data URLs and
 * the Gemini endpoint takes base64, so both directions are needed.
 * ------------------------------------------------------------------ */

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('That media could not be read.'));
    reader.readAsDataURL(blob);
  });
}

/** The payload half of a data URL: what the analysis endpoint expects. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await blobToDataUrl(blob);
  return dataUrl.split(',')[1] || '';
}

export function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl || '');
  if (!match) return null;

  const mimeType = match[1] || 'application/octet-stream';
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || '';

  try {
    if (!isBase64) return new Blob([decodeURIComponent(payload)], { type: mimeType });

    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType });
  } catch {
    return null;
  }
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 KB';
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
