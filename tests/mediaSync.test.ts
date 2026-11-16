/**
 * Photos are kept on the device and on the server, so an observation opened
 * on another device still shows its images. Node has no IndexedDB, which is
 * exactly the "other device" case: nothing local, everything from the server.
 */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const PIXEL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

const calls: Array<{ method: string; url: string; body?: any }> = [];
const server = new Map<string, any>();

before(() => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    key: () => null,
    length: 0,
  };
  (globalThis as any).fetch = async (url: string, init: any = {}) => {
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    const json = (status: number, data: any) => ({ ok: status < 300, status, json: async () => data });
    if (url === '/api/sync/status') return json(200, { configured: true });
    if (url === '/api/sync/media-index') {
      return json(200, {
        entries: [...server.values()].map((r) => ({ id: r.id, updatedAt: 'then', appraisalId: r.indexed === false ? undefined : r.appraisalId })),
      });
    }
    const m = /^\/api\/sync\/media\/(.+)$/.exec(url);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (method === 'PUT') { server.set(id, body.record); return json(200, { updatedAt: 'now' }); }
      if (method === 'DELETE') { server.delete(id); return json(200, {}); }
      return server.has(id) ? json(200, { record: server.get(id) }) : json(404, {});
    }
    return json(200, { success: true });
  };
});

beforeEach(() => {
  calls.length = 0;
  server.clear();
});

describe('photo sync', () => {
  test('an observation opened on another device fetches its photos from the server', async () => {
    const { hydrateMedia, createBlankAppraisal } = await import('../src/services/storage');
    server.set('photo-1', { id: 'photo-1', dataUrl: PIXEL });
    const record: any = { ...createBlankAppraisal(), photos: [
      { id: 'p1', blobId: 'photo-1', caption: 'Pairs', source: 'Camera', capturedAt: '', isBestPractice: true },
    ] };
    const hydrated = await hydrateMedia(record);
    assert.equal(hydrated.photos![0].dataUrl, PIXEL);
  });

  test('a photo neither device nor server holds stays a reference, without looping', async () => {
    const { hydrateMedia, createBlankAppraisal } = await import('../src/services/storage');
    const record: any = { ...createBlankAppraisal(), photos: [
      { id: 'p1', blobId: 'photo-missing', caption: '', source: 'Camera', capturedAt: '', isBestPractice: false },
    ] };
    const hydrated = await hydrateMedia(record);
    assert.equal(hydrated, record, 'same object back, so the app does not re-render forever');
  });

  test('uploading stores the photo on the server under its own id', async () => {
    const { uploadPhoto, isPhotoUploaded } = await import('../src/services/mediaSync');
    assert.equal(await uploadPhoto('photo-2', 'rec-1', PIXEL), true);
    assert.equal(server.get('photo-2').dataUrl, PIXEL);
    assert.equal(server.get('photo-2').appraisalId, 'rec-1');
    assert.ok(isPhotoUploaded('photo-2'));
  });

  test('deleting an observation removes its photos from the server', async () => {
    const { deleteAppraisal, saveAppraisals, createBlankAppraisal } = await import('../src/services/storage');
    server.set('photo-3', { id: 'photo-3', dataUrl: PIXEL });
    const record: any = { ...createBlankAppraisal(), id: 'rec-del', photos: [
      { id: 'p3', blobId: 'photo-3', caption: '', source: 'Camera', capturedAt: '', isBestPractice: false },
    ] };
    saveAppraisals([record]);
    deleteAppraisal('rec-del');
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(!server.has('photo-3'));
  });

  test('says why a photo could not be loaded', async () => {
    const { fetchPhoto, describeMissingPhoto } = await import('../src/services/mediaSync');
    const missing = await fetchPhoto('photo-nowhere', 'rec-1');
    assert.equal(missing.dataUrl, null);
    assert.equal(missing.reason, 'not-on-server');
    assert.ok(/device that took this photo/.test(describeMissingPhoto(missing.reason)));

    server.set('photo-4', { id: 'photo-4', dataUrl: PIXEL });
    assert.equal((await fetchPhoto('photo-4', 'rec-1')).dataUrl, PIXEL);
  });

  test('puts back a stored photo its observation no longer lists', async () => {
    const { restoreUnlistedPhotos } = await import('../src/services/mediaSync');
    server.set('photo-kept', { id: 'photo-kept', appraisalId: 'rec-a', dataUrl: PIXEL });
    server.set('photo-dropped', { id: 'photo-dropped', appraisalId: 'rec-a', dataUrl: PIXEL });
    server.set('photo-old', { id: 'photo-old', appraisalId: 'rec-b', dataUrl: PIXEL, indexed: false });
    server.set('photo-orphan', { id: 'photo-orphan', appraisalId: 'rec-deleted', dataUrl: PIXEL });

    const records: any[] = [
      { id: 'rec-a', photos: [{ id: 'p', blobId: 'photo-kept', caption: 'Kept', source: 'Camera', capturedAt: '', isBestPractice: true }] },
      { id: 'rec-b', photos: [] },
    ];
    const changed = await restoreUnlistedPhotos(records);
    const byId = Object.fromEntries(changed.map((r) => [r.id, r]));

    assert.deepEqual(byId['rec-a'].photos.map((p: any) => p.blobId), ['photo-kept', 'photo-dropped']);
    assert.equal(byId['rec-a'].photos[0].caption, 'Kept', 'existing entries are untouched');
    assert.deepEqual(byId['rec-b'].photos.map((p: any) => p.blobId), ['photo-old'], 'learned from the photo itself');
    assert.ok(!changed.some((r) => r.id === 'rec-deleted'), "a deleted observation's photo is left alone");
  });

  test('changes nothing when every stored photo is already listed', async () => {
    const { restoreUnlistedPhotos } = await import('../src/services/mediaSync');
    server.set('photo-x', { id: 'photo-x', appraisalId: 'rec-x', dataUrl: PIXEL });
    const records: any[] = [{ id: 'rec-x', photos: [{ id: 'p', blobId: 'photo-x', caption: '', source: 'Camera', capturedAt: '', isBestPractice: false }] }];
    assert.equal((await restoreUnlistedPhotos(records)).length, 0);
  });
});
