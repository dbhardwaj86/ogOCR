/* @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { buildSessionFormats, buildCompileFormats } from '../saveFormats';

const TEXT_SESSION = {
  id: 's1', filename: 'doc.png', text: 'plain prose', svg: '', kind: 'text',
};

const SVG_SESSION = {
  id: 's2', filename: 'shape.png', text: '', svg: '<svg viewBox="0 0 1 1"><rect/></svg>', kind: 'sketch',
};

const SKETCHES_SESSION = {
  id: 's3', filename: 'multi.pdf', text: 'pick a sketch', svg: '',
  sketches: [
    { id: 'sk1', svg: '<svg viewBox="0 0 1 1"><rect/></svg>', status: 'done' },
    { id: 'sk2', svg: '<svg viewBox="0 0 2 2"><circle/></svg>', status: 'done' },
  ],
};

const EMPTY_SESSION = { id: 's0', filename: 'e.png', text: '', svg: '' };

describe('buildSessionFormats', () => {
  it('returns an empty list when session is null', () => {
    expect(buildSessionFormats({ session: null, baseName: 'doc' })).toEqual([]);
  });

  it('text-only session offers MD + DOCX + JSON', () => {
    const ids = buildSessionFormats({ session: TEXT_SESSION, baseName: 'doc' }).map(f => f.id);
    expect(ids).toContain('md');
    expect(ids).toContain('docx');
    expect(ids).toContain('json');
    expect(ids).not.toContain('svg');
    expect(ids).not.toContain('png');
  });

  it('svg-only session offers SVG + PNG + JPG + JSON, no DOCX', () => {
    const ids = buildSessionFormats({ session: SVG_SESSION, baseName: 'doc' }).map(f => f.id);
    expect(ids).toContain('svg');
    expect(ids).toContain('png');
    expect(ids).toContain('jpg');
    expect(ids).toContain('json');
    expect(ids).not.toContain('md');
    expect(ids).not.toContain('docx'); // no text payload to convert
  });

  it('multi-sketch session offers "All as PNG (N)" + "All as JPG (N)" instead of single PNG/JPG', () => {
    const items = buildSessionFormats({ session: SKETCHES_SESSION, baseName: 'doc' });
    const labels = items.map(i => i.label);
    expect(labels.some(l => l.includes('All as PNG (2)'))).toBe(true);
    expect(labels.some(l => l.includes('All as JPG (2)'))).toBe(true);
    // No single-SVG fallbacks.
    expect(labels).not.toContain('PNG');
    expect(labels).not.toContain('JPG');
  });

  it('empty session still offers JSON (the snapshot is always serializable)', () => {
    const ids = buildSessionFormats({ session: EMPTY_SESSION, baseName: 'doc' }).map(f => f.id);
    expect(ids).toEqual(['json']);
  });

  it('every returned item exposes a callable run()', () => {
    const items = buildSessionFormats({ session: TEXT_SESSION, baseName: 'doc' });
    for (const it of items) {
      expect(typeof it.run).toBe('function');
    }
  });
});

describe('buildCompileFormats', () => {
  it('returns empty list when compile is null', () => {
    expect(buildCompileFormats({ compile: null, sessions: [], baseName: 'c' })).toEqual([]);
  });

  it('compile context offers MD + HTML + DOCX + JSON', () => {
    const compile = {
      id: 'c1', name: 'My compile', blocks: [
        { id: 'b1', kind: 'text', text: 'hi', role: 'manual' },
      ],
      version: 4,
    };
    const ids = buildCompileFormats({ compile, sessions: [], baseName: 'compile' }).map(f => f.id);
    expect(ids).toEqual(['md', 'html', 'docx', 'json']);
  });
});
