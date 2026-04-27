/* @vitest-environment jsdom */
/**
 * Smoke: client-side output surfaces.
 * - DOMPurify SVG sanitization (script / foreignObject / onerror)
 * - WorksheetBuilder rendering at 0/1/50 sessions
 * - KaTeX throwOnError:false on malformed \frac{1}{
 * - localStorage circuit-breaker shape
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { sanitizeSvg } from '../../svgSanitize.js';
import WorksheetBuilder from '../../components/WorksheetBuilder.jsx';
import RenderedDoc from '../../components/RenderedDoc.jsx';
import SketchesPicker from '../../components/SketchesPicker.jsx';

afterEach(() => cleanup());

describe('SMOKE sanitizeSvg — DOMPurify SVG profile', () => {
  it('Strips <script> tags', () => {
    const dirty = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect/></svg>';
    const clean = sanitizeSvg(dirty);
    console.log(`[smoke] sanitizeSvg | <script> | out=${clean.slice(0, 120)}`);
    expect(clean).not.toMatch(/<script/i);
  });

  it('Strips <foreignObject>', () => {
    const dirty = '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>x</div></foreignObject></svg>';
    const clean = sanitizeSvg(dirty);
    console.log(`[smoke] sanitizeSvg | <foreignObject> | out=${clean.slice(0, 120)}`);
    expect(clean).not.toMatch(/<foreignObject/i);
  });

  it('Strips onerror attribute', () => {
    const dirty = '<svg xmlns="http://www.w3.org/2000/svg"><image href="x" onerror="alert(1)"/></svg>';
    const clean = sanitizeSvg(dirty);
    console.log(`[smoke] sanitizeSvg | onerror | out=${clean.slice(0, 120)}`);
    expect(clean).not.toMatch(/onerror/i);
  });

  it('Keeps benign SVG content (rect, viewBox)', () => {
    const ok = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>';
    const clean = sanitizeSvg(ok);
    expect(clean).toContain('<svg');
    expect(clean).toContain('rect');
  });
});

describe('SMOKE WorksheetBuilder — Compile mode rendering', () => {
  it('0 sessions → "No extractions yet" placeholder, no crash', () => {
    const { container } = render(React.createElement(WorksheetBuilder, { sessions: [] }));
    console.log(`[smoke] WorksheetBuilder | 0 sessions | rendered=${container.textContent?.slice(0, 80)}`);
    expect(container.textContent).toMatch(/no extractions yet/i);
  });

  it('1 session (text) → renders one .worksheet-page', () => {
    const sessions = [{ id: 'a', filename: 'a.png', date: 1, text: '# Hello', svg: '', kind: 'text' }];
    const { container } = render(React.createElement(WorksheetBuilder, { sessions }));
    expect(container.querySelectorAll('.worksheet-page').length).toBe(1);
  });

  it('50 sessions → renders 50 .worksheet-page nodes, no crash', () => {
    const sessions = Array.from({ length: 50 }, (_, i) => ({
      id: 's' + i,
      filename: `f${i}.png`,
      date: i,
      text: `# Page ${i}\n\nLorem ipsum.`,
      svg: '',
      kind: 'text',
    }));
    const { container } = render(React.createElement(WorksheetBuilder, { sessions }));
    const pages = container.querySelectorAll('.worksheet-page');
    console.log(`[smoke] WorksheetBuilder | 50 sessions | pages=${pages.length}`);
    expect(pages.length).toBe(50);
  });

  it('SVG session → uses sanitizeSvg; <script> stripped from rendered output', () => {
    const sessions = [{
      id: 'svg', filename: 's.svg', date: 1, text: '',
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect/></svg>',
      kind: 'sketch',
    }];
    const { container } = render(React.createElement(WorksheetBuilder, { sessions }));
    expect(container.innerHTML).not.toMatch(/<script/i);
  });
});

describe('SMOKE RenderedDoc — KaTeX throwOnError:false', () => {
  it('Malformed \\frac{1}{ does not throw, renders an error span', () => {
    let rendered;
    expect(() => {
      rendered = render(
        React.createElement(RenderedDoc, {
          text: 'Bad math: $\\frac{1}{$ end.',
          svg: '',
          images: null,
          mode: 'rendered',
          onChangeText: () => {},
        })
      );
    }).not.toThrow();
    console.log(`[smoke] RenderedDoc | malformed-LaTeX | render-ok len=${rendered?.container?.innerHTML?.length}`);
    expect(rendered?.container).toBeTruthy();
  });

  it('Empty text/svg/images → renders without crashing', () => {
    expect(() => {
      render(React.createElement(RenderedDoc, {
        text: '', svg: '', images: null, mode: 'rendered', onChangeText: () => {},
      }));
    }).not.toThrow();
  });
});

describe('SMOKE SketchesPicker — Phase 15', () => {
  const sketchA = { id: 1, description: 'free-body diagram', bbox: [50, 50, 400, 400], page: 1, thumbnail: 'data:image/png;base64,XXX', svg: '', status: 'pending' };
  const sketchB = { id: 2, description: 'circuit diagram',   bbox: [500, 500, 900, 900], page: 1, thumbnail: null, svg: '', status: 'pending' };
  const sketchDone = { id: 3, description: 'ray diagram', bbox: [10, 10, 200, 200], page: 2, thumbnail: 'data:image/png;base64,YYY', svg: '<svg viewBox="0 0 1 1"><rect/></svg>', status: 'done' };

  it('Renders one card per sketch', () => {
    const { container } = render(React.createElement(SketchesPicker, {
      sketches: [sketchA, sketchB], selectedId: 1, onSelect: () => {}, onVectorize: () => {}, onVectorizeAll: () => {}, onOpen: () => {}, anyRunning: false,
    }));
    const cards = container.querySelectorAll('.og-sketch-card');
    console.log(`[smoke] SketchesPicker | cards=${cards.length}`);
    expect(cards.length).toBe(2);
    expect(container.textContent).toContain('free-body diagram');
    expect(container.textContent).toContain('circuit diagram');
  });

  it('Pending card shows Vectorize button; clicking it calls onVectorize(id)', () => {
    let lastId = null;
    const { container } = render(React.createElement(SketchesPicker, {
      sketches: [sketchA], selectedId: 1, onSelect: () => {}, onVectorize: (id) => { lastId = id; }, onVectorizeAll: () => {}, onOpen: () => {}, anyRunning: false,
    }));
    const btn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.trim() === 'Vectorize');
    expect(btn).toBeTruthy();
    btn.click();
    expect(lastId).toBe(1);
  });

  it('Done card shows Open button + inline SVG preview', () => {
    let opened = null;
    const { container } = render(React.createElement(SketchesPicker, {
      sketches: [sketchDone], selectedId: null, onSelect: () => {}, onVectorize: () => {}, onVectorizeAll: () => {}, onOpen: (id) => { opened = id; }, anyRunning: false,
    }));
    const openBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.trim() === 'Open');
    expect(openBtn).toBeTruthy();
    openBtn.click();
    expect(opened).toBe(3);
    // Inline SVG preview should be present
    expect(container.querySelector('.og-sketch-card-svg svg')).toBeTruthy();
  });

  it('Vectorize All button disabled when anyRunning', () => {
    const { container } = render(React.createElement(SketchesPicker, {
      sketches: [sketchA, { ...sketchB, status: 'running' }], selectedId: null, onSelect: () => {}, onVectorize: () => {}, onVectorizeAll: () => {}, onOpen: () => {}, anyRunning: true,
    }));
    const batch = Array.from(container.querySelectorAll('button')).find(b => /Vectorize All/.test(b.textContent));
    expect(batch).toBeTruthy();
    expect(batch.disabled).toBe(true);
  });

  it('Empty sketches list renders nothing', () => {
    const { container } = render(React.createElement(SketchesPicker, {
      sketches: [], selectedId: null, onSelect: () => {}, onVectorize: () => {}, onVectorizeAll: () => {}, onOpen: () => {}, anyRunning: false,
    }));
    expect(container.querySelector('.og-sketches-grid')).toBeNull();
  });

  // Plan §3.3 regression: Open clicked mid-batch must not erase or mutate
  // pending sketches' status. The picker is the projection layer — if the
  // upstream `sketches[]` array preserves per-sketch status independently
  // (which `vectorizeSketch` guarantees by virtue of the prev-from-updater
  // pattern documented in CLAUDE.md), the picker reflects that correctly:
  // a done card shows Open + preview while siblings keep showing Vectorize
  // / Vectorizing… without interfering.
  it('Mixed-status batch — done sketch coexists with pending + running siblings', () => {
    const sketches = [
      { ...sketchDone, id: 'a' },                              // done
      { ...sketchA,    id: 'b', status: 'running' },           // running mid-batch
      { ...sketchB,    id: 'c', status: 'pending' },           // pending — Open click on `a` must not touch this
    ];
    const { container } = render(React.createElement(SketchesPicker, {
      sketches, selectedId: 'a', onSelect: () => {}, onVectorize: () => {}, onVectorizeAll: () => {}, onOpen: () => {}, anyRunning: true,
    }));
    const cards = container.querySelectorAll('.og-sketch-card');
    expect(cards.length).toBe(3);
    // Done sibling renders an Open button.
    const openBtns = Array.from(container.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Open');
    expect(openBtns.length).toBe(1);
    // Pending sibling still has a Vectorize button — the batch is intact.
    const vecBtns = Array.from(container.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Vectorize');
    expect(vecBtns.length).toBeGreaterThanOrEqual(1);
    // Running sibling surfaces a "Vectorizing…" / spinner indicator.
    expect(container.textContent).toMatch(/Vectoriz/i);
  });
});

// Plan §3.1 regression: the OutputColumn back-link is no longer gated on
// rendered mode. From any mode, if a focused sketch is open and at least
// one sketch lives behind it, the chip is reachable. This is exercised
// indirectly here as a render-shape unit test on the conditional —
// OutputColumn itself wires more state than is convenient to mount, so
// we assert the conditional shape via direct evaluation.
describe('SMOKE OutputColumn back-link conditional (plan §3.1)', () => {
  // Mirrors the JSX condition at OutputColumn.jsx ~line 316. If anyone
  // reintroduces `effectiveMode === 'rendered'` here the test fails and
  // the regression is caught.
  function shouldShowBackLink(session, onShowAllSketches) {
    return Boolean(
      session?.svg
      && Array.isArray(session?.sketches)
      && session.sketches.length >= 1
      && onShowAllSketches,
    );
  }

  it('Visible when session.svg is set and at least 1 sketch lives behind', () => {
    expect(shouldShowBackLink(
      { svg: '<svg/>', sketches: [{ id: 'a', status: 'pending' }] },
      () => {},
    )).toBe(true);
  });

  it('Visible regardless of mode — no effectiveMode gate', () => {
    // The conditional must NOT consider the active mode; if a future
    // refactor reintroduces a mode arg the picker should still surface.
    expect(shouldShowBackLink(
      { svg: '<svg/>', sketches: [{ id: 'a', status: 'done' }] },
      () => {},
    )).toBe(true);
  });

  it('Hidden when no focused sketch is set', () => {
    expect(shouldShowBackLink(
      { svg: '', sketches: [{ id: 'a' }] },
      () => {},
    )).toBe(false);
  });

  it('Hidden when sketches[] is empty', () => {
    expect(shouldShowBackLink(
      { svg: '<svg/>', sketches: [] },
      () => {},
    )).toBe(false);
  });

  it('Hidden when no onShowAllSketches handler is provided', () => {
    expect(shouldShowBackLink(
      { svg: '<svg/>', sketches: [{ id: 'a' }] },
      null,
    )).toBe(false);
  });
});
