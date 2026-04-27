import { describe, it, expect } from 'vitest';
import {
  BLOCK_KINDS,
  BLOCK_ROLES,
  COMPILE_SCHEMA_VERSION,
  createCompile,
  addBlock,
  insertBlock,
  removeBlock,
  updateBlock,
  reorderBlocks,
  setName,
  setPageSize,
  setTheme,
  migrateCompile,
  resolveSessionBlock,
  compileToMarkdown,
  compileToHtml,
  compileSummary,
  syncAutoBlocks,
  computeDesiredAutoBlocks,
  findAutoCompileForSession,
  defaultAutoCompileName,
  autoSvgSketchRole,
  autoImageRole,
  autoRefinementRole,
  autoTextActionRole,
  autoSvgActionRole,
} from '../compile';

const sampleSessions = [
  { id: 's1', filename: 'first.png', text: 'hello world', svg: '', images: [] },
  {
    id: 's2',
    filename: 'second.pdf',
    text: '',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
    images: [],
  },
];

describe('compile helpers', () => {
  it('createCompile produces a valid empty compile', () => {
    const c = createCompile({ name: 'My compile' });
    expect(c.name).toBe('My compile');
    expect(c.version).toBe(COMPILE_SCHEMA_VERSION);
    expect(c.blocks).toEqual([]);
    expect(c.pageSize).toBe('a4');
    expect(typeof c.id).toBe('string');
    expect(c.id.length).toBeGreaterThan(0);
  });

  it('addBlock + removeBlock + updateBlock keep block ids stable', () => {
    let c = createCompile();
    c = addBlock(c, { kind: BLOCK_KINDS.TEXT, text: 'first' });
    c = addBlock(c, { kind: BLOCK_KINDS.TEXT, text: 'second' });
    expect(c.blocks).toHaveLength(2);
    const firstId = c.blocks[0].id;

    c = updateBlock(c, firstId, { text: 'first edited' });
    expect(c.blocks[0].id).toBe(firstId);
    expect(c.blocks[0].text).toBe('first edited');

    c = removeBlock(c, firstId);
    expect(c.blocks).toHaveLength(1);
    expect(c.blocks[0].text).toBe('second');
  });

  it('insertBlock honors the requested index and clamps out-of-range', () => {
    let c = createCompile();
    c = addBlock(c, { kind: BLOCK_KINDS.TEXT, text: 'a' });
    c = addBlock(c, { kind: BLOCK_KINDS.TEXT, text: 'c' });
    c = insertBlock(c, { kind: BLOCK_KINDS.TEXT, text: 'b' }, 1);
    expect(c.blocks.map(b => b.text)).toEqual(['a', 'b', 'c']);

    c = insertBlock(c, { kind: BLOCK_KINDS.TEXT, text: 'z' }, 999);
    expect(c.blocks.at(-1).text).toBe('z');

    c = insertBlock(c, { kind: BLOCK_KINDS.TEXT, text: '0' }, -5);
    expect(c.blocks[0].text).toBe('0');
  });

  it('reorderBlocks moves a block from before to after a target', () => {
    let c = createCompile();
    c = addBlock(c, { kind: BLOCK_KINDS.TEXT, text: 'a' });
    c = addBlock(c, { kind: BLOCK_KINDS.TEXT, text: 'b' });
    c = addBlock(c, { kind: BLOCK_KINDS.TEXT, text: 'c' });
    const [aId, , cId] = c.blocks.map(b => b.id);

    c = reorderBlocks(c, aId, cId);
    expect(c.blocks.map(b => b.text)).toEqual(['b', 'c', 'a']);
  });

  it('reorderBlocks is a no-op for unknown ids or self-moves', () => {
    let c = createCompile();
    c = addBlock(c, { kind: BLOCK_KINDS.TEXT, text: 'x' });
    const before = c.blocks.map(b => b.id);
    c = reorderBlocks(c, 'missing', before[0]);
    expect(c.blocks.map(b => b.id)).toEqual(before);
    c = reorderBlocks(c, before[0], before[0]);
    expect(c.blocks.map(b => b.id)).toEqual(before);
  });

  it('setName / setPageSize / setTheme bump updatedAt and validate input', () => {
    let c = createCompile({ name: 'n' });
    const t0 = c.updatedAt;
    c = setName(c, 'renamed');
    expect(c.name).toBe('renamed');
    expect(c.updatedAt).toBeGreaterThanOrEqual(t0);

    c = setPageSize(c, 'letter');
    expect(c.pageSize).toBe('letter');

    const after = setPageSize(c, 'tabloid');
    expect(after.pageSize).toBe('letter'); // invalid → no change

    c = setTheme(c, 'ink');
    expect(c.theme).toBe('ink');
  });

  it('migrateCompile stamps current version on legacy payloads', () => {
    const legacy = { id: 'old', name: 'l', blocks: [{ kind: 'text', text: 'k', id: 'k' }] };
    const m = migrateCompile(legacy);
    expect(m.version).toBe(COMPILE_SCHEMA_VERSION);
    expect(m.name).toBe('l');
    expect(m.blocks).toHaveLength(1);
  });

  it('resolveSessionBlock returns deleted placeholder when session is gone', () => {
    const block = { kind: BLOCK_KINDS.SESSION, sessionId: 'gone', fallbackName: 'Gone session' };
    const out = resolveSessionBlock(block, sampleSessions);
    expect(out.deleted).toBe(true);
    expect(out.name).toBe('Gone session');
  });

  it('compileToMarkdown renders text/svg/image/page break/session', () => {
    let c = createCompile({ name: 'Doc' });
    c = addBlock(c, { kind: BLOCK_KINDS.TEXT, text: 'Plain text' });
    c = addBlock(c, { kind: BLOCK_KINDS.IMAGE, src: 'data:image/png;base64,xx', caption: 'cap' });
    c = addBlock(c, { kind: BLOCK_KINDS.PAGE_BREAK });
    c = addBlock(c, { kind: BLOCK_KINDS.SESSION, sessionId: 's1', fallbackName: 'first.png' });
    c = addBlock(c, { kind: BLOCK_KINDS.SESSION, sessionId: 'gone', fallbackName: 'gone' });

    const md = compileToMarkdown(c, sampleSessions);
    expect(md).toContain('# Doc');
    expect(md).toContain('Plain text');
    expect(md).toContain('![cap](data:image/png;base64,xx)');
    expect(md).toContain('page-break-after');
    expect(md).toContain('hello world');
    expect(md).toContain('Missing session: gone');
    expect(md.endsWith('\n')).toBe(true);
  });

  it('compileToHtml escapes user content and inlines styles', () => {
    let c = createCompile({ name: 'Doc <evil>' });
    c = addBlock(c, { kind: BLOCK_KINDS.TEXT, text: '<script>alert(1)</script>' });

    const html = compileToHtml(c, sampleSessions);
    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toContain('Doc &lt;evil&gt;');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('compileSummary describes block counts compactly', () => {
    let c = createCompile();
    c = addBlock(c, { kind: BLOCK_KINDS.TEXT });
    c = addBlock(c, { kind: BLOCK_KINDS.TEXT });
    c = addBlock(c, { kind: BLOCK_KINDS.PAGE_BREAK });
    expect(compileSummary(c)).toBe('2 text · 1 pageBreak');
    expect(compileSummary(createCompile())).toBe('empty');
  });
});

// v4 — action-keyed auto-compile sync. Reconciliation reads from
// `session.outputs` (a map keyed by actionId), so different actions on the
// same source accumulate as separate blocks while re-running the SAME
// action replaces in place. Manual blocks and user drag-reorders are
// never touched. Image / sketch / refinement paths are unchanged.
describe('v4 auto-compile sync', () => {
  const SVG_A = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect/></svg>';
  const SVG_B = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><circle/></svg>';
  const SVG_C = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 3"><path/></svg>';

  it('createCompile accepts sourceId; defaults to null', () => {
    const manual = createCompile({ name: 'm' });
    const auto = createCompile({ name: 'a', sourceId: 's1' });
    expect(manual.sourceId).toBe(null);
    expect(auto.sourceId).toBe('s1');
  });

  it('addBlock / insertBlock tag blocks role: manual by default', () => {
    let c = createCompile();
    c = addBlock(c, { kind: BLOCK_KINDS.TEXT, text: 'hi' });
    c = insertBlock(c, { kind: BLOCK_KINDS.PAGE_BREAK }, 0);
    expect(c.blocks.every(b => b.role === BLOCK_ROLES.MANUAL)).toBe(true);
  });

  it('migrateCompile (v2 → v4) tags existing blocks manual + defaults sourceId', () => {
    const legacy = {
      id: 'old', name: 'legacy',
      version: 2,
      blocks: [
        { id: 'b1', kind: 'text', text: 'k' },
        { id: 'b2', kind: 'svg', svg: SVG_A },
      ],
    };
    const m = migrateCompile(legacy);
    expect(m.version).toBe(COMPILE_SCHEMA_VERSION);
    expect(m.sourceId).toBe(null);
    expect(m.blocks.every(b => b.role === BLOCK_ROLES.MANUAL)).toBe(true);
    expect(m.blocks).toHaveLength(2);
  });

  it('migrateCompile (v3 → v4) demotes legacy auto:text and auto:svg:main blocks to manual', () => {
    const v3 = {
      id: 'old', name: 'legacy', version: 3, sourceId: 's1',
      blocks: [
        { id: 'b1', kind: 'text', text: 'old extract', role: 'auto:text' },
        { id: 'b2', kind: 'svg', svg: SVG_A, role: 'auto:svg:main' },
        { id: 'b3', kind: 'svg', svg: SVG_B, role: autoSvgSketchRole('sk1') },
        { id: 'b4', kind: 'text', text: 'manual note', role: 'manual' },
      ],
    };
    const m = migrateCompile(v3);
    expect(m.version).toBe(COMPILE_SCHEMA_VERSION);
    // Both legacy auto-text/auto-svg-main demoted; sketch + manual unchanged.
    expect(m.blocks.find(b => b.id === 'b1').role).toBe(BLOCK_ROLES.MANUAL);
    expect(m.blocks.find(b => b.id === 'b2').role).toBe(BLOCK_ROLES.MANUAL);
    expect(m.blocks.find(b => b.id === 'b3').role).toBe(autoSvgSketchRole('sk1'));
    expect(m.blocks.find(b => b.id === 'b4').role).toBe(BLOCK_ROLES.MANUAL);
    // Content survives — the user's old extracted text is still in the worksheet.
    expect(m.blocks.find(b => b.id === 'b1').text).toBe('old extract');
  });

  it('computeDesiredAutoBlocks emits one block per session.outputs entry, plus sketches/images/refinements', () => {
    const session = {
      id: 's1',
      filename: 'doc.pdf',
      outputs: {
        text: { kind: 'text', text: 'extract text result' },
        math: { kind: 'text', text: 'LaTeX equations' },
      },
      sketches: [
        { id: 'sk1', svg: SVG_B, status: 'done', description: 'left' },
        { id: 'sk2', svg: SVG_C, status: 'done', description: 'right' },
        { id: 'sk3', svg: '', status: 'pending' },
      ],
      images: [
        { id: 'i1', desc: 'fig 1', data: 'data:image/png;base64,xx' },
      ],
      refinements: { summary: 'sum', bullets: '* a', formal: '', casual: 'hey' },
    };
    const desired = computeDesiredAutoBlocks(session);
    const roles = desired.map(d => d.role);
    expect(roles).toContain(autoTextActionRole('text'));
    expect(roles).toContain(autoTextActionRole('math'));
    expect(roles).toContain(autoSvgSketchRole('sk1'));
    expect(roles).toContain(autoSvgSketchRole('sk2'));
    expect(roles).toContain(autoImageRole('i1'));
    expect(roles).toContain(autoRefinementRole('summary'));
    expect(roles).toContain(autoRefinementRole('bullets'));
    expect(roles).toContain(autoRefinementRole('casual'));
    expect(roles).not.toContain(autoRefinementRole('formal')); // empty string skipped
  });

  it('computeDesiredAutoBlocks emits an action-keyed svg block for the single-sketch path', () => {
    const session = {
      id: 's1',
      outputs: {
        sketch: { kind: 'svg', svg: SVG_A },
      },
      sketches: [],
    };
    const roles = computeDesiredAutoBlocks(session).map(d => d.role);
    expect(roles).toEqual([autoSvgActionRole('sketch')]);
  });

  it('computeDesiredAutoBlocks dedups action-keyed svg when its content equals a vectorized sketch', () => {
    const session = {
      id: 's1',
      outputs: {
        sketch: { kind: 'svg', svg: SVG_B },
      },
      sketches: [
        { id: 'sk1', svg: SVG_B, status: 'done' },
        { id: 'sk2', svg: SVG_C, status: 'done' },
      ],
    };
    const roles = computeDesiredAutoBlocks(session).map(d => d.role);
    // The action-keyed svg matches sketch 1 → suppressed; both sketches still present.
    expect(roles).toEqual([
      autoSvgSketchRole('sk1'),
      autoSvgSketchRole('sk2'),
    ]);
  });

  it('syncAutoBlocks adds an action-keyed text block on first extraction', () => {
    const compile = createCompile({ name: 'doc — Worksheet', sourceId: 's1' });
    const session = {
      id: 's1',
      outputs: { text: { kind: 'text', text: 'hello' } },
      sketches: [], images: [],
    };
    const synced = syncAutoBlocks(compile, session);
    expect(synced).not.toBe(compile);
    expect(synced.blocks).toHaveLength(1);
    expect(synced.blocks[0].role).toBe(autoTextActionRole('text'));
    expect(synced.blocks[0].text).toBe('hello');
  });

  it('syncAutoBlocks replaces same-action block in place on re-extraction (id + position preserved)', () => {
    let c = createCompile({ sourceId: 's1' });
    c = syncAutoBlocks(c, {
      id: 's1', outputs: { text: { kind: 'text', text: 'first' } },
      sketches: [], images: [],
    });
    const firstId = c.blocks[0].id;
    c = syncAutoBlocks(c, {
      id: 's1', outputs: { text: { kind: 'text', text: 'second pass' } },
      sketches: [], images: [],
    });
    expect(c.blocks).toHaveLength(1);
    expect(c.blocks[0].id).toBe(firstId);
    expect(c.blocks[0].text).toBe('second pass');
  });

  it('syncAutoBlocks accumulates DIFFERENT actions as separate blocks', () => {
    // The headline behaviour change for v4: extracting text then running
    // Math-to-LaTeX should land BOTH outputs in the worksheet, not
    // overwrite the first.
    let c = createCompile({ sourceId: 's1' });
    c = syncAutoBlocks(c, {
      id: 's1',
      outputs: { text: { kind: 'text', text: 'plain prose' } },
      sketches: [], images: [],
    });
    expect(c.blocks).toHaveLength(1);
    c = syncAutoBlocks(c, {
      id: 's1',
      outputs: {
        text: { kind: 'text', text: 'plain prose' },
        math: { kind: 'text', text: '$\\sqrt{2}$' },
      },
      sketches: [], images: [],
    });
    expect(c.blocks).toHaveLength(2);
    expect(c.blocks.map(b => b.role).sort()).toEqual([
      autoTextActionRole('math'),
      autoTextActionRole('text'),
    ].sort());
    // Both contents survive — neither overwrote the other.
    const byRole = Object.fromEntries(c.blocks.map(b => [b.role, b]));
    expect(byRole[autoTextActionRole('text')].text).toBe('plain prose');
    expect(byRole[autoTextActionRole('math')].text).toBe('$\\sqrt{2}$');
  });

  it('syncAutoBlocks preserves every distinct sketch SVG as its own block', () => {
    let c = createCompile({ sourceId: 's1' });
    c = syncAutoBlocks(c, {
      id: 's1',
      outputs: {},
      sketches: [
        { id: 'sk1', svg: SVG_A, status: 'done' },
        { id: 'sk2', svg: SVG_B, status: 'done' },
        { id: 'sk3', svg: SVG_C, status: 'done' },
      ],
    });
    const svgBlocks = c.blocks.filter(b => b.kind === BLOCK_KINDS.SVG);
    expect(svgBlocks).toHaveLength(3);
    expect(svgBlocks.map(b => b.role)).toEqual([
      autoSvgSketchRole('sk1'),
      autoSvgSketchRole('sk2'),
      autoSvgSketchRole('sk3'),
    ]);
    expect(new Set(svgBlocks.map(b => b.svg)).size).toBe(3);
  });

  it('syncAutoBlocks preserves user drag-reorder across re-extraction', () => {
    let c = createCompile({ sourceId: 's1' });
    c = syncAutoBlocks(c, {
      id: 's1',
      outputs: { text: { kind: 'text', text: 'TXT' } },
      sketches: [{ id: 'sk1', svg: SVG_A, status: 'done' }],
    });
    expect(c.blocks.map(b => b.role)).toEqual([autoTextActionRole('text'), autoSvgSketchRole('sk1')]);
    // User drags the text block below the sketch.
    const [textId, sketchId] = c.blocks.map(b => b.id);
    c = reorderBlocks(c, textId, sketchId);
    expect(c.blocks.map(b => b.id)).toEqual([sketchId, textId]);
    // Re-extraction with new text should NOT snap back to canonical order.
    c = syncAutoBlocks(c, {
      id: 's1',
      outputs: { text: { kind: 'text', text: 'TXT v2' } },
      sketches: [{ id: 'sk1', svg: SVG_A, status: 'done' }],
    });
    expect(c.blocks.map(b => b.id)).toEqual([sketchId, textId]);
    expect(c.blocks.find(b => b.id === textId).text).toBe('TXT v2');
  });

  it('syncAutoBlocks removes auto blocks whose source disappeared (sketch removed from picker)', () => {
    let c = createCompile({ sourceId: 's1' });
    c = syncAutoBlocks(c, {
      id: 's1',
      outputs: { text: { kind: 'text', text: 'A' } },
      sketches: [
        { id: 'sk1', svg: SVG_A, status: 'done' },
        { id: 'sk2', svg: SVG_B, status: 'done' },
      ],
    });
    expect(c.blocks).toHaveLength(3);
    c = syncAutoBlocks(c, {
      id: 's1',
      outputs: { text: { kind: 'text', text: 'A' } },
      sketches: [{ id: 'sk1', svg: SVG_A, status: 'done' }],
    });
    expect(c.blocks).toHaveLength(2);
    expect(c.blocks.find(b => b.role === autoSvgSketchRole('sk2'))).toBeUndefined();
  });

  it('syncAutoBlocks never touches manual blocks', () => {
    let c = createCompile({ sourceId: 's1' });
    c = addBlock(c, { kind: BLOCK_KINDS.TEXT, text: 'user note' });
    const manualId = c.blocks[0].id;
    c = syncAutoBlocks(c, {
      id: 's1',
      outputs: { text: { kind: 'text', text: 'auto-extracted' } },
      sketches: [], images: [],
    });
    const manualBlock = c.blocks.find(b => b.id === manualId);
    expect(manualBlock).toBeDefined();
    expect(manualBlock.role).toBe(BLOCK_ROLES.MANUAL);
    expect(manualBlock.text).toBe('user note');
  });

  it('syncAutoBlocks returns the same compile reference when nothing changed', () => {
    let c = createCompile({ sourceId: 's1' });
    const session = {
      id: 's1',
      outputs: { text: { kind: 'text', text: 'X' } },
      sketches: [], images: [],
    };
    c = syncAutoBlocks(c, session);
    const again = syncAutoBlocks(c, session);
    expect(again).toBe(c);
  });

  it('syncAutoBlocks handles empty session (no auto blocks, manual blocks preserved)', () => {
    let c = createCompile({ sourceId: 's1' });
    c = addBlock(c, { kind: BLOCK_KINDS.TEXT, text: 'manual only' });
    c = syncAutoBlocks(c, { id: 's1', outputs: {}, sketches: [], images: [] });
    expect(c.blocks).toHaveLength(1);
    expect(c.blocks[0].role).toBe(BLOCK_ROLES.MANUAL);
  });

  it('sequential per-sketch sync with cumulative session updates keeps every prior sketch', () => {
    let session = {
      id: 's1', filename: 'multi.pdf', outputs: {},
      sketches: [
        { id: 1, svg: '', status: 'pending', bbox: [0,0,500,500], page: 1, description: 'a' },
        { id: 2, svg: '', status: 'pending', bbox: [0,500,500,1000], page: 1, description: 'b' },
        { id: 3, svg: '', status: 'pending', bbox: [500,0,1000,500], page: 1, description: 'c' },
      ],
    };
    let compile = createCompile({ name: 'multi.pdf — Worksheet', sourceId: 's1' });

    session = {
      ...session,
      sketches: session.sketches.map(sk => sk.id === 1 ? { ...sk, svg: SVG_A, status: 'done' } : sk),
    };
    compile = syncAutoBlocks(compile, session);
    expect(compile.blocks.map(b => b.role)).toContain(autoSvgSketchRole(1));

    session = {
      ...session,
      sketches: session.sketches.map(sk => sk.id === 2 ? { ...sk, svg: SVG_B, status: 'done' } : sk),
    };
    compile = syncAutoBlocks(compile, session);
    const rolesAfter2 = compile.blocks.map(b => b.role);
    expect(rolesAfter2).toContain(autoSvgSketchRole(1));
    expect(rolesAfter2).toContain(autoSvgSketchRole(2));

    session = {
      ...session,
      sketches: session.sketches.map(sk => sk.id === 3 ? { ...sk, svg: SVG_C, status: 'done' } : sk),
    };
    compile = syncAutoBlocks(compile, session);
    const rolesAfter3 = compile.blocks.map(b => b.role);
    expect(rolesAfter3).toEqual([
      autoSvgSketchRole(1),
      autoSvgSketchRole(2),
      autoSvgSketchRole(3),
    ]);
    const svgs = compile.blocks.filter(b => b.kind === BLOCK_KINDS.SVG).map(b => b.svg);
    expect(svgs).toEqual([SVG_A, SVG_B, SVG_C]);
  });

  it('findAutoCompileForSession + defaultAutoCompileName helpers', () => {
    const compiles = [
      createCompile({ name: 'm', sourceId: null }),
      createCompile({ name: 'doc.pdf — Worksheet', sourceId: 's1' }),
      createCompile({ name: 'other.pdf — Worksheet', sourceId: 's2' }),
    ];
    expect(findAutoCompileForSession('s1', compiles).name).toBe('doc.pdf — Worksheet');
    expect(findAutoCompileForSession('missing', compiles)).toBe(null);
    expect(defaultAutoCompileName({ filename: 'lecture.pdf' })).toBe('lecture.pdf — Worksheet');
    expect(defaultAutoCompileName({ filename: '' })).toBe('Untitled — Worksheet');
    expect(defaultAutoCompileName(null)).toBe('Untitled — Worksheet');
  });
});
