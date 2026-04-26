/* @vitest-environment jsdom */
/**
 * Smoke: verify the viewBox-vs-width fallback that lives inside
 * ExportBar.exportPNG (lines 52–56 of src/components/ExportBar.jsx).
 * We can't import the helper directly (it's not exported), so we
 * mirror its logic here and assert the same arithmetic chain. If the
 * production code drifts away from this pattern, this test should
 * be updated to walk through the rendered ExportBar instead.
 */
import { describe, it, expect } from 'vitest';

function viewBoxFallback(svgString) {
  const div = document.createElement('div');
  div.innerHTML = svgString;
  const svgEl = div.querySelector('svg');
  if (!svgEl) return null;
  const vb = svgEl.viewBox?.baseVal;
  const w = parseFloat(svgEl.getAttribute('width')) || (vb?.width) || 800;
  const h = parseFloat(svgEl.getAttribute('height')) || (vb?.height) || 600;
  return { w, h };
}

describe('SMOKE ExportBar.exportPNG viewBox fallback', () => {
  it('SVG with width+height attributes → uses those', () => {
    const got = viewBoxFallback('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"/>');
    console.log(`[smoke] PNG-fallback | width+height | got=${JSON.stringify(got)}`);
    expect(got).toEqual({ w: 200, h: 150 });
  });

  it('SVG with viewBox only (no width/height) → falls back to viewBox', () => {
    const got = viewBoxFallback('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"/>');
    console.log(`[smoke] PNG-fallback | viewBox-only | got=${JSON.stringify(got)}`);
    expect(got).toEqual({ w: 320, h: 240 });
  });

  it('SVG with neither width nor viewBox → 800×600 hard fallback', () => {
    const got = viewBoxFallback('<svg xmlns="http://www.w3.org/2000/svg"/>');
    console.log(`[smoke] PNG-fallback | none | got=${JSON.stringify(got)}`);
    expect(got).toEqual({ w: 800, h: 600 });
  });

  it('No <svg> in input → returns null (caller should surface error)', () => {
    const got = viewBoxFallback('<div>no svg</div>');
    expect(got).toBeNull();
  });
});
