import { describe, it, expect } from 'vitest';
import {
  BLOCK_KINDS,
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
