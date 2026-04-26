import { describe, it, expect, vi } from 'vitest';
import { detectMermaidBlock } from '../components/RenderedDoc';

// We mock the dynamic `import('mermaid')` so the test suite never touches
// the real (large) mermaid bundle and we don't need a live DOM to run the
// renderer. The mock returns a stub `default` export with `initialize` and
// `render` methods; only `detectMermaidBlock` actually exercises business
// logic in this file, but the mock is wired so future tests that touch the
// dynamic-import path stay deterministic.
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: '<svg data-mock="true"></svg>' })),
  },
}));

describe('detectMermaidBlock', () => {
  it('returns the inner code of a fenced ```mermaid block', () => {
    const text = [
      'Some intro text.',
      '',
      '```mermaid',
      'graph TD',
      '  A --> B',
      '  B --> C',
      '```',
      '',
      'Trailing prose.',
    ].join('\n');
    const code = detectMermaidBlock(text);
    expect(code).toBe('graph TD\n  A --> B\n  B --> C');
  });

  it('returns null when no mermaid fence is present', () => {
    const text = [
      'Some intro text.',
      '',
      '```js',
      'console.log("hi")',
      '```',
    ].join('\n');
    expect(detectMermaidBlock(text)).toBeNull();
  });

  it('is case-insensitive on the language tag', () => {
    const text = '```Mermaid\nflowchart LR\n  X --> Y\n```';
    expect(detectMermaidBlock(text)).toBe('flowchart LR\n  X --> Y');
  });

  it('returns null for non-string input', () => {
    expect(detectMermaidBlock(null)).toBeNull();
    expect(detectMermaidBlock(undefined)).toBeNull();
    expect(detectMermaidBlock(42)).toBeNull();
  });
});
