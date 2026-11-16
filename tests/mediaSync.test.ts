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
});
