import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  REFINE_ACTIONS,
  REFINE_KIND_BY_ID,
  REFINE_LABEL_BY_KIND,
  MAGIC_ACTIONS,
} from '../magicActions';

describe('refine actions metadata', () => {
  it('exposes the four canned tones with stable ids and prompts', () => {
    const ids = REFINE_ACTIONS.map(a => a.id);
    expect(ids).toEqual([
      'refine-summary',
      'refine-bullets',
      'refine-formal',
      'refine-casual',
    ]);
    for (const action of REFINE_ACTIONS) {
      expect(typeof action.prompt).toBe('string');
      expect(action.prompt.trim().length).toBeGreaterThan(20);
      // Each prompt ends with the strict-markdown directive so the response
      // slots cleanly into the existing render path.
      expect(action.prompt).toMatch(/Output markdown only/i);
      expect(typeof action.label).toBe('string');
      expect(action.label.length).toBeGreaterThan(0);
      expect(typeof action.kind).toBe('string');
    }
  });

  it('does not collide with the eight magic-action ids', () => {
    const magicIds = new Set(MAGIC_ACTIONS.map(a => a.id));
    for (const refineId of REFINE_ACTIONS.map(a => a.id)) {
      expect(magicIds.has(refineId)).toBe(false);
    }
  });

  it('maps id → kind and kind → label cleanly', () => {
    expect(REFINE_KIND_BY_ID['refine-summary']).toBe('summary');
    expect(REFINE_KIND_BY_ID['refine-bullets']).toBe('bullets');
    expect(REFINE_KIND_BY_ID['refine-formal']).toBe('formal');
    expect(REFINE_KIND_BY_ID['refine-casual']).toBe('casual');
    expect(REFINE_LABEL_BY_KIND.summary).toBe('Summary');
    expect(REFINE_LABEL_BY_KIND.bullets).toBe('Bullets');
    expect(REFINE_LABEL_BY_KIND.formal).toBe('Formal');
    expect(REFINE_LABEL_BY_KIND.casual).toBe('Casual');
  });
});

// Minimal copy of App.jsx#migrateSession for unit testing without spinning up
// the React app. Keep in sync with App.jsx if SESSION_SCHEMA_VERSION moves.
const SESSION_SCHEMA_VERSION = 3;
function migrateSession(s) {
  if (!s || typeof s !== 'object') return s;
  if (s.version === SESSION_SCHEMA_VERSION) return s;
  return { ...s, version: SESSION_SCHEMA_VERSION };
}

describe('schema v3 migration', () => {
  it('stamps a v2 session to v3 without losing text/svg/images', () => {
    const v2 = {
      id: 'abc',
      filename: 'test.png',
      date: 1700000000000,
      text: 'Hello world',
      svg: '<svg></svg>',
      images: [{ id: 1, desc: 'fig 1', data: 'data:image/png;base64,xx' }],
      kind: 'text',
      version: 2,
    };
    const v3 = migrateSession(v2);
    expect(v3.version).toBe(3);
    expect(v3.text).toBe('Hello world');
    expect(v3.svg).toBe('<svg></svg>');
    expect(v3.images).toEqual(v2.images);
    expect(v3.kind).toBe('text');
    expect(v3.id).toBe('abc');
    expect(v3.filename).toBe('test.png');
  });

  it('is a no-op when already at v3 (no double-migration)', () => {
    const v3 = { id: 'x', text: 't', version: 3 };
    const out = migrateSession(v3);
    expect(out).toBe(v3); // same reference
  });

  it('migrates legacy sessions with no version field', () => {
    const legacy = { id: 'old', text: 'legacy text', svg: '', kind: 'text' };
    const out = migrateSession(legacy);
    expect(out.version).toBe(3);
    expect(out.text).toBe('legacy text');
  });

  it('refinements field is not required by the migration (defaults to undefined)', () => {
    const v2 = { id: 'r', text: 'hi', version: 2 };
    const v3 = migrateSession(v2);
    expect(v3.refinements).toBeUndefined();
  });
});

// Happy-path runAction smoke test: simulate the refine path's effect on the
// session by reproducing the relevant slice of runAction logic. The full App
// component renders a vast tree (compile builder, drag-drop, KaTeX) — testing
// the data flow at this level keeps the test focused and fast.
describe('runAction refine path (data flow)', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('writes to session.refinements.summary on a successful refine-summary call', async () => {
    const mockText = 'A three-sentence summary. Of the source. Concise.';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: mockText }),
    });
    globalThis.fetch = fetchMock;

    // Reproduce the refine slice of runAction — same FormData shape, same
    // synthetic File workaround for the server's multer.single('file').
    const session = { id: 'sess', text: 'Original extracted text.', version: 3 };
    const refineAction = REFINE_ACTIONS.find(a => a.id === 'refine-summary');
    expect(refineAction).toBeTruthy();

    const formData = new FormData();
    const synthetic = new File(
      [session.text],
      'refine-input.txt',
      { type: 'text/plain' }
    );
    formData.append('file', synthetic);
    formData.append('prompt', `${refineAction.prompt}\n\nINPUT:\n${session.text}`);

    const r = await fetch('/api/extract', { method: 'POST', body: formData });
    const data = await r.json();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/extract');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.get('file')).toBeInstanceOf(File);
    expect(init.body.get('file').name).toBe('refine-input.txt');
    expect(init.body.get('file').type).toBe('text/plain');
    expect(init.body.get('prompt')).toContain('INPUT:\nOriginal extracted text.');

    // Apply the same merge runAction would.
    const refineKind = REFINE_KIND_BY_ID[refineAction.id];
    const updated = {
      ...session,
      refinements: { ...(session.refinements || {}), [refineKind]: data.text },
    };

    expect(updated.refinements).toBeDefined();
    expect(updated.refinements.summary).toBe(mockText);
    // Crucially, neither `text` nor `kind` is overwritten by a refine.
    expect(updated.text).toBe('Original extracted text.');
    expect(updated.kind).toBeUndefined();
  });

  it('preserves prior refinements when a second tone lands', async () => {
    const session = {
      id: 's',
      text: 'src',
      version: 3,
      refinements: { summary: 'old summary' },
    };
    const refineAction = REFINE_ACTIONS.find(a => a.id === 'refine-bullets');
    const refineKind = REFINE_KIND_BY_ID[refineAction.id];
    const newBody = '- one\n- two';

    const updated = {
      ...session,
      refinements: { ...(session.refinements || {}), [refineKind]: newBody },
    };

    expect(updated.refinements.summary).toBe('old summary');
    expect(updated.refinements.bullets).toBe('- one\n- two');
  });
});
