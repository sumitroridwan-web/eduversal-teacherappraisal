/**
 * Multi-device sync for a single shared account.
 *
 * localStorage stays the source of truth the appraiser writes to, because an
 * observation runs 40 minutes on school wifi and a dropped connection must not
 * cost the lesson. The server copy is what other devices read. Writes are
 * queued locally and flushed when the network allows.
 *
 * Conflicts are last-write-wins WITH A WARNING: a write carries the updatedAt
 * the device started from, and the server refuses it if the stored copy has
 * moved on. The user is then asked which version to keep.
 */

export type SyncCollection = 'appraisals' | 'walkthroughs';

export interface SyncConflict {
  collection: SyncCollection;
  localRecord: any;
  serverRecord: any;
  serverUpdatedAt: string;
}

const QUEUE_KEY = 'eduversal_sync_queue_v1';
const BASE_KEY = 'eduversal_sync_bases_v1';

type Listener = (conflict: SyncConflict) => void;
const conflictListeners = new Set<Listener>();

export function onSyncConflict(listener: Listener): () => void {
  conflictListeners.add(listener);
  return () => conflictListeners.delete(listener);
}

let configured: boolean | null = null;

/** Is sync switched on for this deployment? Cached after the first answer. */
export async function isSyncAvailable(): Promise<boolean> {
  if (configured !== null) return configured;
  try {
    const res = await fetch('/api/sync/status');
    if (!res.ok) {
      configured = false;
      return configured;
    }
    const data = await res.json();
    configured = Boolean(data.configured);
  } catch {
    configured = false;
  }
  return configured;
}

/* ---------------- local bookkeeping ---------------- */

function readMap(key: string): Record<string, any> {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(key: string, value: Record<string, any>): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full quota must not break the app; the queue simply cannot grow.
  }
}

/** The updatedAt this device last saw on the server, per record. */
function baseFor(collection: SyncCollection, id: string): string | undefined {
  return readMap(BASE_KEY)[`${collection}:${id}`];
}

function setBase(collection: SyncCollection, id: string, updatedAt: string): void {
  const bases = readMap(BASE_KEY);
  bases[`${collection}:${id}`] = updatedAt;
  writeMap(BASE_KEY, bases);
}

function queueWrite(collection: SyncCollection, record: any): void {
  const queue = readMap(QUEUE_KEY);
  queue[`${collection}:${record.id}`] = { collection, record };
  writeMap(QUEUE_KEY, queue);
}

function dequeue(collection: SyncCollection, id: string): void {
  const queue = readMap(QUEUE_KEY);
  delete queue[`${collection}:${id}`];
  writeMap(QUEUE_KEY, queue);
}

export function pendingWriteCount(): number {
  return Object.keys(readMap(QUEUE_KEY)).length;
}

/* ---------------- push ---------------- */

/**
 * Sends one record up. Queues it and returns false when offline or refused, so
 * the caller never loses the write - it is retried on the next flush.
 */
export async function pushRecord(
  collection: SyncCollection,
  record: any,
  { force = false }: { force?: boolean } = {}
): Promise<boolean> {
  if (!(await isSyncAvailable())) return false;

  try {
    const res = await fetch(`/api/sync/${collection}/${encodeURIComponent(record.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        record,
        // Forcing skips the check, which is how "keep my version" is applied.
        baseUpdatedAt: force ? undefined : baseFor(collection, record.id),
      }),
    });

    if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      queueWrite(collection, record);
      conflictListeners.forEach((listener) =>
        listener({
          collection,
          localRecord: record,
          serverRecord: data.serverRecord,
          serverUpdatedAt: data.serverUpdatedAt,
        })
      );
      return false;
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      // 413 means it will never fit; retrying forever would be pointless.
      if (res.status === 413) {
        dequeue(collection, record.id);
        window.alert(data.error || 'This record is too large to sync.');
        return false;
      }
      queueWrite(collection, record);
      return false;
    }

    const data = await res.json();
    setBase(collection, record.id, data.updatedAt || record.updatedAt);
    dequeue(collection, record.id);
    return true;
  } catch {
    queueWrite(collection, record);
    return false;
  }
}

export async function deleteRemote(collection: SyncCollection, id: string): Promise<void> {
  if (!(await isSyncAvailable())) return;
  try {
    await fetch(`/api/sync/${collection}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    dequeue(collection, id);
  } catch {
    // The record stays deleted locally; the remote copy is cleaned up on a
    // later pull if it reappears.
  }
}

/** Retries everything queued while offline. */
export async function flushQueue(): Promise<number> {
  if (!(await isSyncAvailable())) return 0;

  const queue = readMap(QUEUE_KEY);
  let sent = 0;
  for (const entry of Object.values(queue) as Array<{ collection: SyncCollection; record: any }>) {
    if (await pushRecord(entry.collection, entry.record)) sent++;
  }
  return sent;
}

/* ---------------- pull ---------------- */

/**
 * Merges the server's records into the local set.
 *
 * Whichever copy has the later updatedAt wins, which is the right answer for
 * records edited on one device at a time. Genuine simultaneous edits are caught
 * on write by the 409 path above, not here.
 */
export async function pullAndMerge<T extends { id: string; updatedAt: string }>(
  collection: SyncCollection,
  localRecords: T[]
): Promise<{ merged: T[]; changed: boolean }> {
  if (!(await isSyncAvailable())) return { merged: localRecords, changed: false };

  try {
    const res = await fetch(`/api/sync/${collection}`);
    if (!res.ok) return { merged: localRecords, changed: false };

    const data = await res.json();
    const serverRecords: T[] = Array.isArray(data.records) ? data.records : [];

    const byId = new Map<string, T>();
    localRecords.forEach((r) => byId.set(r.id, r));

    let changed = false;
    serverRecords.forEach((remote) => {
      if (!remote?.id) return;
      setBase(collection, remote.id, remote.updatedAt);

      const local = byId.get(remote.id);
      if (!local) {
        byId.set(remote.id, remote);
        changed = true;
        return;
      }
      if (new Date(remote.updatedAt).getTime() > new Date(local.updatedAt).getTime()) {
        byId.set(remote.id, remote);
        changed = true;
      }
    });

    return { merged: Array.from(byId.values()), changed };
  } catch {
    return { merged: localRecords, changed: false };
  }
}

/** Applies the user's choice after a conflict. */
export async function resolveConflict(
  conflict: SyncConflict,
  keep: 'mine' | 'theirs'
): Promise<any> {
  if (keep === 'theirs') {
    setBase(conflict.collection, conflict.serverRecord.id, conflict.serverUpdatedAt);
    dequeue(conflict.collection, conflict.serverRecord.id);
    return conflict.serverRecord;
  }

  const record = { ...conflict.localRecord, updatedAt: new Date().toISOString() };
  await pushRecord(conflict.collection, record, { force: true });
  return record;
}
