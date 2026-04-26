import { describe, it, expect } from 'vitest';
import {
  LANGUAGE_OVERRIDE_PROMPT,
  LANGUAGE_OVERRIDE_NAMES,
} from '../magicActions';

describe('LANGUAGE_OVERRIDE_PROMPT', () => {
  const basePrompt = 'extract text';

  it('wraps the prompt with the readable language name (Spanish)', () => {
    const wrapped = LANGUAGE_OVERRIDE_PROMPT(basePrompt, 'es');
    expect(wrapped).toContain('Spanish');
    // Original text is preserved inside the wrap.
    expect(wrapped).toContain(basePrompt);
    // Constraint comes before the base prompt — Gemini reads top-down.
    const idxConstraint = wrapped.indexOf('Spanish');
    const idxBase = wrapped.indexOf(basePrompt);
    expect(idxConstraint).toBeLessThan(idxBase);
    expect(wrapped).toContain('Output nothing in any other language');
  });

  it('appends the trailing __detected_lang directive so the pill keeps rendering', () => {
    const wrapped = LANGUAGE_OVERRIDE_PROMPT(basePrompt, 'fr');
    expect(wrapped).toMatch(/__detected_lang:\s*fr$/);
    // The directive must be on its own line (the parser anchors on `\n`).
    expect(wrapped.endsWith('\n\nAt the very end, on its own line, output: __detected_lang: fr')).toBe(true);
  });

  it('returns a passthrough (no language constraint) for "auto"', () => {
    const wrapped = LANGUAGE_OVERRIDE_PROMPT(basePrompt, 'auto');
    expect(wrapped).toBe(basePrompt);
    // Sanity: no readable name leaked into the prompt.
    expect(wrapped).not.toContain('English');
    expect(wrapped).not.toContain('Spanish');
    expect(wrapped).not.toContain('__detected_lang');
  });

  it('returns the base prompt unchanged for falsy / unknown lang codes', () => {
    expect(LANGUAGE_OVERRIDE_PROMPT(basePrompt, null)).toBe(basePrompt);
    expect(LANGUAGE_OVERRIDE_PROMPT(basePrompt, undefined)).toBe(basePrompt);
    expect(LANGUAGE_OVERRIDE_PROMPT(basePrompt, '')).toBe(basePrompt);
    // Unknown ISO code — not in the supported map — is also a passthrough.
    expect(LANGUAGE_OVERRIDE_PROMPT(basePrompt, 'xx')).toBe(basePrompt);
  });

  it('exposes the supported language map for UI consumers', () => {
    expect(LANGUAGE_OVERRIDE_NAMES.en).toBe('English');
    expect(LANGUAGE_OVERRIDE_NAMES.es).toBe('Spanish');
    expect(LANGUAGE_OVERRIDE_NAMES.fr).toBe('French');
    expect(LANGUAGE_OVERRIDE_NAMES.de).toBe('German');
    expect(LANGUAGE_OVERRIDE_NAMES.zh).toBe('Chinese');
    expect(LANGUAGE_OVERRIDE_NAMES.ja).toBe('Japanese');
  });
});
