/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import EquationBlock from '../components/EquationBlock.jsx';
import { BLOCK_KINDS, createCompile, addBlock, compileToMarkdown } from '../compile';

afterEach(() => {
  cleanup();
});

// Sprint 3.1 — live LaTeX preview block. The render side reuses the
// already-bundled `react-markdown` + `remark-math` + `rehype-katex` stack
// (configured with throwOnError: false), so malformed LaTeX should never
// throw out of the component tree. Tests use React.createElement so the
// suite file can live as a plain .js (matching the rest of the test dir
// — only pdfPreview is .jsx).
describe('EquationBlock', () => {
  it('renders without throwing for a simple LaTeX value', () => {
    expect(() => render(React.createElement(EquationBlock, { value: '\\sqrt{2}' }))).not.toThrow();
    expect(screen.getByLabelText(/LaTeX equation source/i)).toBeDefined();
  });

  it('fires onChange with the new textarea value on edit', () => {
    const handleChange = vi.fn();
    render(React.createElement(EquationBlock, { value: 'x^2', onChange: handleChange }));
    const textarea = screen.getByLabelText(/LaTeX equation source/i);
    fireEvent.change(textarea, { target: { value: 'y^3 + 1' } });
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith('y^3 + 1');
  });

  it('renders without throwing for malformed LaTeX (KaTeX throwOnError:false)', () => {
    // \frac{ is a parse error; with throwOnError: false KaTeX renders the
    // source in red instead of throwing. The component must stay mounted.
    expect(() => render(React.createElement(EquationBlock, { value: '\\frac{' }))).not.toThrow();
  });

  it('compileToMarkdown wraps an EQUATION block body in $$ fences', () => {
    let c = createCompile({ name: 'Eq doc' });
    c = addBlock(c, { kind: BLOCK_KINDS.EQUATION, text: 'a^2 + b^2 = c^2' });
    const md = compileToMarkdown(c, []);
    expect(md).toContain('$$');
    expect(md).toContain('a^2 + b^2 = c^2');
    // The wrapper should have an opening AND closing fence.
    const matches = md.match(/\$\$/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('compileToMarkdown leaves an already-wrapped equation untouched', () => {
    let c = createCompile({ name: 'Eq doc' });
    c = addBlock(c, { kind: BLOCK_KINDS.EQUATION, text: '$$E = mc^2$$' });
    const md = compileToMarkdown(c, []);
    expect(md).toContain('$$E = mc^2$$');
  });

  it('BLOCK_KINDS.EQUATION is exported and stable', () => {
    expect(BLOCK_KINDS.EQUATION).toBe('equation');
  });
});
