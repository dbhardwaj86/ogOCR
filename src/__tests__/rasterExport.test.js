import { describe, it, expect } from 'vitest';
import { buildSvgExports } from '../svgExports';

// Multi-SVG raster export — the spec says: each SVG in the session emits
// its own file (no compositing, no resize). We build the dedup list via
// `buildSvgExports`; the actual rasterization is DOM glue and validated
// manually since jsdom can't run canvas.toDataURL reliably.
const SVG_A = '<svg viewBox="0 0 1 1"><rect/></svg>';
const SVG_B = '<svg viewBox="0 0 2 2"><circle/></svg>';
const SVG_C = '<svg viewBox="0 0 3 3"><path/></svg>';

describe('buildSvgExports', () => {
  it('returns empty list when there are no SVGs at all', () => {
    expect(buildSvgExports({}, 'doc')).toEqual([]);
    expect(buildSvgExports({ text: 'no svg' }, 'doc')).toEqual([]);
    expect(buildSvgExports(null, 'doc')).toEqual([]);
  });

  it('returns one entry for a session with only a main SVG', () => {
    const out = buildSvgExports({ svg: SVG_A }, 'doc');
    expect(out).toEqual([{ svg: SVG_A, filename: 'doc' }]);
  });

  it('returns one entry per vectorized sketch with its sketch id in the filename', () => {
    const out = buildSvgExports({
      sketches: [
        { id: 'sk1', svg: SVG_A, status: 'done' },
        { id: 'sk2', svg: SVG_B, status: 'done' },
        { id: 'sk3', svg: '', status: 'pending' },
      ],
    }, 'doc');
    expect(out).toEqual([
      { svg: SVG_A, filename: 'doc-sketch-sk1' },
      { svg: SVG_B, filename: 'doc-sketch-sk2' },
    ]);
  });

  it('mixes main + sketches when none match (all distinct)', () => {
    const out = buildSvgExports({
      svg: SVG_A,
      sketches: [
        { id: 'sk1', svg: SVG_B, status: 'done' },
        { id: 'sk2', svg: SVG_C, status: 'done' },
      ],
    }, 'doc');
    expect(out.map(e => e.filename)).toEqual([
      'doc',
      'doc-sketch-sk1',
      'doc-sketch-sk2',
    ]);
  });

  it('dedups main SVG against an opened sketch (focused-view case)', () => {
    // openSketch promotes sketch's svg into session.svg — the main SVG
    // here is the same bytes as sk1.svg. We must not export it twice.
    const out = buildSvgExports({
      svg: SVG_B,
      sketches: [
        { id: 'sk1', svg: SVG_B, status: 'done' },
        { id: 'sk2', svg: SVG_C, status: 'done' },
      ],
    }, 'doc');
    expect(out.map(e => e.filename)).toEqual([
      'doc-sketch-sk1',
      'doc-sketch-sk2',
    ]);
  });

  it('skips sketches that are not yet vectorized', () => {
    const out = buildSvgExports({
      sketches: [
        { id: 'sk1', svg: SVG_A, status: 'done' },
        { id: 'sk2', svg: '', status: 'running' },
        { id: 'sk3', svg: '', status: 'error' },
      ],
    }, 'doc');
    expect(out).toEqual([{ svg: SVG_A, filename: 'doc-sketch-sk1' }]);
  });

  it('skips empty/whitespace SVG strings on the main slot', () => {
    expect(buildSvgExports({ svg: '   ' }, 'doc')).toEqual([]);
    expect(buildSvgExports({ svg: '' }, 'doc')).toEqual([]);
  });
});
