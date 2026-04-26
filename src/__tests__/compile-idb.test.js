// @vitest-environment node
//
// Track K — compile data-URL leak fix tests. Run under the `node`
// environment so fake-indexeddb's structured-clone path round-trips
// Node's Blob globals cleanly (matches the existing idb.test.js setup).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BLOCK_KINDS,
  COMPILE_SCHEMA_VERSION,
  createCompile,
  addBlock,
  migrateCompile,
  migrateCompileImagesToIDB,
  hydrateCompileImages,
  compileNeedsIDBOffload,
  compileToMarkdown,
  compileToHtml,
} from '../compile';

// 1×1 transparent PNG, base64. Matches the encoding shape we'd produce
// from a real screenshot/image extract path.
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

beforeEach(async () => {
  const { clearAllImages } = await import('../storage/idb');
  await clearAllImages();
});

describe('compile schema migration (v1 → v2) — idempotent', () => {
  it('migrateCompile stamps version 2 on a v1 compile', () => {
    const legacy = {
      id: 'legacy_compile',
      name: 'Legacy',
      blocks: [{ id: 'b1', kind: 'image', src: PNG_DATA_URL, caption: 'pic' }],
      version: 1,
    };
    const m = migrateCompile(legacy);
    expect(m.version).toBe(COMPILE_SCHEMA_VERSION);
    expect(m.version).toBe(2);
    // Blocks are preserved as-is by the sync migration; the IDB lift is async.
    expect(m.blocks[0].src).toBe(PNG_DATA_URL);
  });

  it('migrateCompile + migrateCompileImagesToIDB are idempotent', async () => {
    const legacy = {
      id: 'legacy_compile_2',
      name: 'Legacy 2',
      blocks: [{ id: 'b1', kind: 'image', src: PNG_DATA_URL, caption: 'pic' }],
      version: 1,
    };
    // Pass 1: lift the data URL out into IDB.
    const stamped = migrateCompile(legacy);
    const lifted = await migrateCompileImagesToIDB(stamped);
    expect(lifted.blocks[0].src).toMatch(/^idb:cimg_/);

    // Pass 2: running both helpers again should return a structurally equal
    // compile with no fresh IDB writes (block.src already wears the ref).
    const lifted2 = await migrateCompileImagesToIDB(migrateCompile(lifted));
    expect(lifted2).toEqual(lifted);
    // Identity equality too: `migrateCompileImagesToIDB` short-circuits on
    // a fully-migrated compile and returns the same reference.
    expect(lifted2).toBe(lifted);
    // And `compileNeedsIDBOffload` agrees that there's nothing left to do.
    expect(compileNeedsIDBOffload(lifted2)).toBe(false);
  });
});

describe('compile image offload to IDB', () => {
  it('migrateCompileImagesToIDB lifts data URLs and rewrites src to idb:cimg_…', async () => {
    let c = createCompile({ name: 'has images' });
    c = addBlock(c, { kind: BLOCK_KINDS.IMAGE, src: PNG_DATA_URL, caption: 'pic A' });
    c = addBlock(c, { kind: BLOCK_KINDS.TEXT, text: 'middle' });
    c = addBlock(c, { kind: BLOCK_KINDS.IMAGE, src: PNG_DATA_URL, caption: 'pic B' });

    expect(compileNeedsIDBOffload(c)).toBe(true);
    const next = await migrateCompileImagesToIDB(c);

    // image blocks lose the data URL; text block is untouched.
    expect(next.blocks[0].kind).toBe(BLOCK_KINDS.IMAGE);
    expect(next.blocks[0].src).toMatch(/^idb:cimg_/);
    expect(next.blocks[1].kind).toBe(BLOCK_KINDS.TEXT);
    expect(next.blocks[1].text).toBe('middle');
    expect(next.blocks[2].src).toMatch(/^idb:cimg_/);
    // Different blocks get different IDB keys.
    expect(next.blocks[0].src).not.toBe(next.blocks[2].src);

    // Serializing the post-migration compile to JSON contains no `data:` substring.
    const serialized = JSON.stringify(next);
    expect(serialized.includes('data:image')).toBe(false);
    expect(serialized.includes('base64')).toBe(false);

    // Captions / kinds are preserved.
    expect(next.blocks[0].caption).toBe('pic A');
    expect(next.blocks[2].caption).toBe('pic B');
  });

  it('hydrateCompileImages resolves idb:cimg_… refs back to data URIs', async () => {
    let c = createCompile({ name: 'rehydrate me' });
    c = addBlock(c, { kind: BLOCK_KINDS.IMAGE, src: PNG_DATA_URL, caption: 'cap' });
    c = addBlock(c, { kind: BLOCK_KINDS.TEXT, text: 'untouched' });

    const lifted = await migrateCompileImagesToIDB(c);
    expect(lifted.blocks[0].src).toMatch(/^idb:cimg_/);

    const hydrated = await hydrateCompileImages(lifted);
    expect(hydrated.blocks[0].kind).toBe(BLOCK_KINDS.IMAGE);
    expect(typeof hydrated.blocks[0].src).toBe('string');
    expect(hydrated.blocks[0].src.startsWith('data:image/png;base64,')).toBe(true);
    // Caption preserved.
    expect(hydrated.blocks[0].caption).toBe('cap');
    // Text block left untouched.
    expect(hydrated.blocks[1].kind).toBe(BLOCK_KINDS.TEXT);
    expect(hydrated.blocks[1].text).toBe('untouched');

    // Hydration produces a deep copy — the input is unchanged.
    expect(lifted.blocks[0].src).toMatch(/^idb:cimg_/);

    // Result is plain JSON-serializable.
    const json = JSON.stringify(hydrated);
    expect(json).toContain('data:image/png;base64,');
  });

  it('compileToMarkdown / compileToHtml fall back to "[Image not loaded]" on bare idb refs', async () => {
    let c = createCompile({ name: 'unhydrated' });
    c = addBlock(c, { kind: BLOCK_KINDS.IMAGE, src: PNG_DATA_URL, caption: 'pic' });
    const lifted = await migrateCompileImagesToIDB(c);

    // Suppress the warning during test so output is clean.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const md = compileToMarkdown(lifted, []);
    const html = compileToHtml(lifted, []);
    warn.mockRestore();

    expect(md).toContain('[Image not loaded]');
    expect(md).not.toContain('idb:cimg_');
    expect(html).toContain('[Image not loaded]');
    expect(html).not.toContain('idb:cimg_');
  });
});

describe('compile image IDB quota error path', () => {
  it('surfaces a tagged IDB_QUOTA error when the underlying setImage rejects', async () => {
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

    const { setCompileImage } = await import('../storage/idb');
    let caught;
    try {
      await setCompileImage('cimg_quota_test', PNG_DATA_URL);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(caught.code).toBe('IDB_QUOTA');

    vi.doUnmock('idb-keyval');
    vi.resetModules();
  });
});
