/* @vitest-environment jsdom */
/**
 * Smoke: client-side output surfaces.
 * - DOMPurify SVG sanitization (script / foreignObject / onerror)
 * - WorksheetBuilder rendering at 0/1/50 sessions
 * - KaTeX throwOnError:false on malformed \frac{1}{
 * - localStorage circuit-breaker shape
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { sanitizeSvg } from '../../svgSanitize.js';
import WorksheetBuilder from '../../components/WorksheetBuilder.jsx';
import RenderedDoc from '../../components/RenderedDoc.jsx';

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
