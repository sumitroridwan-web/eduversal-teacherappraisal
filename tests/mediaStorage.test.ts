/**
 * The lesson audio and the classroom snapshots are held on the appraiser's
 * device, not inside the record.
 *
 * What is checked here is the seam between the two: that the image bytes stay
 * out of the copy that goes to localStorage and Firestore, that a record with
 * nowhere else to keep its photo keeps it inline rather than losing it, and
 * that asking for media on a machine with no store is a no-op instead of a
 * crash. The IndexedDB half cannot run under node and is exercised in the
 * browser.
 */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { dehydrateMedia, hydrateMedia, saveAppraisals, loadAppraisals } from '../src/services/storage';
import { isMediaStoreAvailable, dataUrlToBlob, formatBytes } from '../src/services/mediaStore';
import { createBlankAppraisal } from '../src/services/storage';
import type { TeacherAppraisalRecord } from '../src/types';

const PIXEL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

before(() => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
});

beforeEach(() => {
  (globalThis as any).localStorage.clear?.();
});

function withPhoto(overrides: Partial<{ blobId: string }> = {}): TeacherAppraisalRecord {
  const record = createBlankAppraisal();
  record.photos = [
    {
      id: 'photo-1',
      dataUrl: PIXEL,
      blobId: overrides.blobId,
      caption: 'Group work on the carpet',
      source: 'Camera',
      capturedAt: new Date().toISOString(),
      isBestPractice: true,
    },
  ];
  return record;
}

describe('what gets persisted', () => {
  test('leaves the image bytes out of the stored record', () => {
    const dehydrated = dehydrateMedia(withPhoto({ blobId: 'photo-abc' }));

    assert.equal(dehydrated.photos?.[0].dataUrl, undefined, 'the image is not in the record');
    assert.equal(dehydrated.photos?.[0].blobId, 'photo-abc', 'only the key to it is');
    assert.equal(dehydrated.photos?.[0].caption, 'Group work on the carpet', 'the evidence is intact');
  });

  test('keeps a photo inline when the device has nowhere to put it', () => {
    // No blobId means the media store refused it, or the record predates it.
    // Stripping the data URL here would delete the only copy that exists.
    const dehydrated = dehydrateMedia(withPhoto());
    assert.equal(dehydrated.photos?.[0].dataUrl, PIXEL);
  });

  test('does not copy the image into localStorage', () => {
    saveAppraisals([withPhoto({ blobId: 'photo-abc' })]);

    const raw = (globalThis as any).localStorage.getItem('eduversal_appraisals_v4_clean') || '';
    assert.ok(!raw.includes(PIXEL.slice(30)), 'the quota is not spent on image bytes');
    assert.ok(raw.includes('photo-abc'), 'but the record still knows where the image is');
  });

  test('a stored record still reads back as an observation', () => {
    const saved = withPhoto({ blobId: 'photo-abc' });
    saveAppraisals([saved]);

    const [loaded] = loadAppraisals();
    assert.equal(loaded.id, saved.id);
    assert.equal(loaded.photos?.length, 1);
    assert.equal(loaded.photos?.[0].blobId, 'photo-abc');
  });
});

describe('a device with no media store', () => {
  test('reports itself as unavailable rather than throwing', () => {
    assert.equal(isMediaStoreAvailable(), false, 'node has no IndexedDB');
  });

  test('hands back the very same record, so hydrating cannot loop', async () => {
    // App re-renders on every change to the open observation and hydrates it
    // again; returning a new object each time would never settle.
    const record = dehydrateMedia(withPhoto({ blobId: 'photo-abc' }));
    assert.equal(await hydrateMedia(record), record);
  });

  test('leaves a record with nothing to restore untouched', async () => {
    const record = createBlankAppraisal();
    assert.equal(await hydrateMedia(record), record);
  });
});

describe('conversions', () => {
  test('turns a captured data URL into the blob that gets stored', () => {
    const blob = dataUrlToBlob(PIXEL);
    assert.ok(blob, 'a blob was produced');
    assert.equal(blob!.type, 'image/jpeg');
    // Base64 costs a third; the stored copy is the smaller one.
    assert.ok(blob!.size > 0 && blob!.size < PIXEL.length);
  });

  test('refuses anything that is not a data URL', () => {
    assert.equal(dataUrlToBlob('https://example.org/photo.jpg'), null);
    assert.equal(dataUrlToBlob(''), null);
  });

  test('describes a size the way an appraiser reads it', () => {
    assert.equal(formatBytes(0), '0 KB');
    assert.equal(formatBytes(240_000), '240 KB');
    assert.equal(formatBytes(3_400_000), '3.4 MB');
  });
});
