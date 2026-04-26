// @vitest-environment node
//
// IDB tests run under the `node` environment (not jsdom) because
// fake-indexeddb's structured-clone path doesn't round-trip jsdom's Blob
// implementation — the result comes back as a plain `{}`. Node 18+ ships a
// real Blob global that survives the trip.
//
// `setup.js` already wires `fake-indexeddb/auto`, so the global
// `indexedDB` is patched in both environments.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// A 1×1 transparent PNG, encoded as a data URL. Small enough that fake-indexeddb
// stores it instantly; just enough bytes that we can compare blob sizes.
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

// Each test starts with a clean store so ordering can't matter and the
// list-ids assertions are deterministic.
beforeEach(async () => {
  const { clearAllImages } = await import('../storage/idb');
  await clearAllImages();
});

describe('idb storage', () => {
  it('roundtrips a blob: setImage stored bytes are returned by getImage', async () => {
    const { getImage, setImage, dataURLToBlob } = await import('../storage/idb');
    const original = await dataURLToBlob(PNG_DATA_URL);
    expect(original).toBeInstanceOf(Blob);
    expect(original.size).toBeGreaterThan(0);
    expect(original.type).toBe('image/png');

    await setImage('img_a', original);
    const fetched = await getImage('img_a');
    expect(fetched).toBeInstanceOf(Blob);
    expect(fetched.size).toBe(original.size);
    expect(fetched.type).toBe(original.type);

    // Compare the actual bytes — equality on size+type isn't enough.
    const a = new Uint8Array(await original.arrayBuffer());
    const b = new Uint8Array(await fetched.arrayBuffer());
    expect(b.length).toBe(a.length);
    for (let i = 0; i < a.length; i++) expect(b[i]).toBe(a[i]);
  });

  it('deleteImage removes the entry; subsequent get returns null', async () => {
    const { getImage, setImage, deleteImage, dataURLToBlob } = await import('../storage/idb');
    const blob = await dataURLToBlob(PNG_DATA_URL);
    await setImage('img_b', blob);
    expect(await getImage('img_b')).toBeInstanceOf(Blob);

    await deleteImage('img_b');
    expect(await getImage('img_b')).toBeNull();

    // Deleting a missing entry is a no-op (does not throw).
    await expect(deleteImage('img_nonexistent')).resolves.toBeUndefined();
  });

  it('listImageIds reflects what has been written and shrinks after delete', async () => {
    const { setImage, deleteImage, listImageIds, dataURLToBlob } = await import('../storage/idb');
    const blob = await dataURLToBlob(PNG_DATA_URL);
    await setImage('img_x', blob);
    await setImage('img_y', blob);
    await setImage('img_z', blob);

    const ids = await listImageIds();
    expect(new Set(ids)).toEqual(new Set(['img_x', 'img_y', 'img_z']));

    await deleteImage('img_y');
    const after = await listImageIds();
    expect(new Set(after)).toEqual(new Set(['img_x', 'img_z']));
  });

  it('migration shape: a legacy data URL → IDB blob, and metadata persisted to localStorage drops the data field', async () => {
    const { getImage, setImage, blobToDataURL, dataURLToBlob } = await import('../storage/idb');
    // Simulate the v3 → v4 migration the App effect runs:
    // (1) parse the legacy `data:` field into a Blob, (2) store it under the
    // image's `id`, (3) the localStorage payload now omits `data` entirely.
    const legacyEntry = { id: 'img_legacy_1', desc: 'a tiny pixel', data: PNG_DATA_URL };

    const blob = await dataURLToBlob(legacyEntry.data);
    expect(blob).toBeInstanceOf(Blob);
    await setImage(legacyEntry.id, blob);

    // Stripped metadata we'd write to localStorage now: no `data:` substring.
    // eslint-disable-next-line no-unused-vars
    const { data: _drop, ...stripped } = legacyEntry;
    const serialized = JSON.stringify(stripped);
    expect(serialized.includes('data:')).toBe(false);
    expect(serialized.includes('base64')).toBe(false);
    expect(stripped.id).toBe('img_legacy_1');
    expect(stripped.desc).toBe('a tiny pixel');

    // Hydration: pull blob back out of IDB, materialize a data URL, and
    // verify it's the shape RenderedDoc expects.
    const stored = await getImage(legacyEntry.id);
    expect(stored).toBeInstanceOf(Blob);
    const hydrated = await blobToDataURL(stored);
    expect(typeof hydrated).toBe('string');
    expect(hydrated.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('getImage returns null for an unknown id (no throw)', async () => {
    const { getImage } = await import('../storage/idb');
    expect(await getImage('never-stored')).toBeNull();
  });
});

// Quota errors are tested in isolation: we mock `idb-keyval` so its `set`
// rejects with a synthetic QuotaExceededError, then verify the wrapper
// re-throws a tagged `IDB_QUOTA` error the caller can route to the
// registry. Done in a separate `describe` so the mock is scoped.
describe('idb storage quota handling', () => {
  it('surfaces a tagged IDB_QUOTA error when the store rejects with QuotaExceededError', async () => {
    vi.resetModules();
    vi.doMock('idb-keyval', () => ({
      get: vi.fn(),
      set: vi.fn().mockRejectedValue(
        Object.assign(new Error('storage full'), { name: 'QuotaExceededError' })
      ),
      del: vi.fn(),
      keys: vi.fn(),
      clear: vi.fn(),
      createStore: vi.fn(() => 'mockStore'),
    }));
    const { setImage } = await import('../storage/idb');
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });

    let caught;
    try {
      await setImage('img_quota', blob);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(caught.code).toBe('IDB_QUOTA');
    vi.doUnmock('idb-keyval');
    vi.resetModules();
  });
});
