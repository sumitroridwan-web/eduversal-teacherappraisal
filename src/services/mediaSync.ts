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
import { putMedia, dataUrlToBlob } from './mediaStore';

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

/**
 * Fetches a photo this device does not hold. Keeps a copy on the device so it
 * opens offline next time. Resolves null when the server has none.
 */
export async function downloadPhoto(blobId: string, appraisalId: string): Promise<string | null> {
  if (!blobId || !(await isSyncAvailable())) return null;
  try {
    const res = await fetch(`/api/sync/media/${encodeURIComponent(blobId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const dataUrl: unknown = data?.record?.dataUrl;
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;

    const blob = dataUrlToBlob(dataUrl);
    if (blob) {
      putMedia({ appraisalId, kind: 'photo', blob, id: blobId })
        .then(() => markUploaded(blobId, true))
        .catch(() => undefined);
    }
    return dataUrl;
  } catch {
    return null;
  }
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
