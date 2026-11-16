/**
 * Puts classroom photos on the server as well as on the device, so an
 * observation opened on another device shows its images.
 *
 * Each photo is its own server document, apart from the observation, which
 * keeps the observation well under Firestore's 1 MB limit however many
 * photos it has. The device copy stays the first place a photo is read from;
 * the server copy is how another device gets it, and is cached on that device
 * once fetched.
 *
 * Every call is best effort. A photo that could not be uploaded now is tried
 * again the next time its observation is opened on the device that has it.
 */
import { isSyncAvailable } from './sync';
import { putMedia, getMedia, blobToDataUrl, dataUrlToBlob } from './mediaStore';

const UPLOADED_KEY = 'eduversal_media_uploaded_v1';

/** Firestore holds about 1 MB per document; leave room for the envelope. */
const MAX_UPLOAD_CHARS = 850_000;

function readUploaded(): Set<string> {
  try {
    const raw = localStorage.getItem(UPLOADED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeUploaded(ids: Set<string>) {
  try {
    localStorage.setItem(UPLOADED_KEY, JSON.stringify([...ids]));
  } catch {
    // Only costs a repeat upload later.
  }
}

export function isPhotoUploaded(blobId: string): boolean {
  return readUploaded().has(blobId);
}

function markUploaded(blobId: string, uploaded: boolean) {
  const ids = readUploaded();
  if (uploaded) ids.add(blobId);
  else ids.delete(blobId);
  writeUploaded(ids);
}

/** Re-encodes an unusually large photo smaller so it fits in one document. */
async function fitForUpload(dataUrl: string): Promise<string | null> {
  if (dataUrl.length <= MAX_UPLOAD_CHARS) return dataUrl;
  if (typeof document === 'undefined') return null;

  for (const [edge, quality] of [[1000, 0.65], [800, 0.6], [640, 0.55]] as const) {
    const smaller = await new Promise<string>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve('');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve('');
      img.src = dataUrl;
    });
    if (smaller && smaller.length <= MAX_UPLOAD_CHARS) return smaller;
  }
  return null;
}

/** Sends one photo to the server. Resolves true once it is stored there. */
export async function uploadPhoto(blobId: string, appraisalId: string, dataUrl: string): Promise<boolean> {
  if (!blobId || !dataUrl || !(await isSyncAvailable())) return false;
  try {
    const fitted = await fitForUpload(dataUrl);
    if (!fitted) return false;
    const res = await fetch(`/api/sync/media/${encodeURIComponent(blobId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        record: {
          id: blobId,
          appraisalId,
          kind: 'photo',
          dataUrl: fitted,
          updatedAt: new Date().toISOString(),
        },
      }),
    });
    if (res.ok) markUploaded(blobId, true);
    return res.ok;
  } catch {
    return false;
  }
}

export type PhotoFetchResult =
  | { dataUrl: string; reason?: undefined }
  | { dataUrl: null; reason: 'not-on-server' | 'signed-out' | 'offline' | 'sync-off' | 'error' };

/**
 * Fetches a photo this device does not hold, keeping a copy on the device so
 * it opens offline next time. When it cannot, says why, so the screen can
 * tell the appraiser what to do rather than show a photo that never loads.
 */
export async function fetchPhoto(blobId: string, appraisalId: string): Promise<PhotoFetchResult> {
  if (!blobId) return { dataUrl: null, reason: 'error' };
  if (!(await isSyncAvailable())) return { dataUrl: null, reason: 'sync-off' };
  try {
    const res = await fetch(`/api/sync/media/${encodeURIComponent(blobId)}`);
    if (res.status === 404) return { dataUrl: null, reason: 'not-on-server' };
    if (res.status === 401) return { dataUrl: null, reason: 'signed-out' };
    if (!res.ok) return { dataUrl: null, reason: 'error' };
    const data = await res.json();
    const dataUrl: unknown = data?.record?.dataUrl;
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return { dataUrl: null, reason: 'error' };
    }

    const blob = dataUrlToBlob(dataUrl);
    if (blob) {
      putMedia({ appraisalId, kind: 'photo', blob, id: blobId })
        .then(() => markUploaded(blobId, true))
        .catch(() => undefined);
    }
    return { dataUrl };
  } catch {
    return { dataUrl: null, reason: 'offline' };
  }
}

/** fetchPhoto without the reason. */
export async function downloadPhoto(blobId: string, appraisalId: string): Promise<string | null> {
  return (await fetchPhoto(blobId, appraisalId)).dataUrl;
}

/** What to tell the appraiser about a photo this device could not load. */
export function describeMissingPhoto(reason: PhotoFetchResult['reason']): string {
  switch (reason) {
    case 'not-on-server':
      return 'Not uploaded yet. Open the platform on the device that took this photo to upload it.';
    case 'signed-out':
      return 'Sign in again to load this photo.';
    case 'offline':
      return 'No connection. Try again when online.';
    case 'sync-off':
      return 'Syncing is switched off on this server, so the photo is only on the device that took it.';
    default:
      return 'This photo could not be loaded. Try again.';
  }
}

/**
 * Uploads every photo this device holds that the server may not have yet.
 * Run when the app opens, so photos reach other devices without each
 * observation having to be opened first. One at a time, to stay gentle on
 * school wifi. Resolves with how many were uploaded.
 */
export async function uploadPendingPhotos(
  records: Array<{ id: string; photos?: Array<{ blobId?: string }> }>
): Promise<number> {
  if (!(await isSyncAvailable())) return 0;
  let uploaded = 0;
  for (const record of records) {
    for (const photo of record.photos || []) {
      if (!photo.blobId || isPhotoUploaded(photo.blobId)) continue;
      const stored = await getMedia(photo.blobId);
      if (!stored) continue;
      try {
        if (await uploadPhoto(photo.blobId, record.id, await blobToDataUrl(stored.blob))) uploaded++;
      } catch {
        // Tried again next time the app opens.
      }
    }
  }
  return uploaded;
}

export async function deleteRemotePhoto(blobId: string): Promise<void> {
  if (!blobId) return;
  markUploaded(blobId, false);
  if (!(await isSyncAvailable())) return;
  try {
    await fetch(`/api/sync/media/${encodeURIComponent(blobId)}`, { method: 'DELETE' });
  } catch {
    // Left on the server; harmless, as nothing refers to it.
  }
}
