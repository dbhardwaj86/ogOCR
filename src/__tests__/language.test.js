import { describe, it, expect } from 'vitest';
import { parseDetectedLang, stripDetectedLang } from '../magicActions';

describe('parseDetectedLang', () => {
  it('extracts a valid 2-letter ISO 639-1 code from the trailing line', () => {
    const text = 'Hello world.\n\nThis is a paragraph.\n__detected_lang: en';
    expect(parseDetectedLang(text)).toBe('en');
  });

  it('returns null when no detected_lang line is present', () => {
    const text = 'Hello world.\nNothing to see here.';
    expect(parseDetectedLang(text)).toBeNull();
  });

  it('returns the LAST detected_lang code if the directive is repeated', () => {
    // Defensive case: Gemini occasionally echoes the directive once mid-doc
    // and once trailing. Only the trailing line should win — the regex is
    // anchored to end-of-string for exactly this reason.
    const text =
      'Top of doc.\n__detected_lang: fr\nMore body content here.\n__detected_lang: es';
    expect(parseDetectedLang(text)).toBe('es');
  });

  it('returns null for non-string input', () => {
    expect(parseDetectedLang(null)).toBeNull();
    expect(parseDetectedLang(undefined)).toBeNull();
    expect(parseDetectedLang(42)).toBeNull();
  });

  it('handles 3-letter codes (e.g. "und" for undetectable)', () => {
    const text = 'Body.\n__detected_lang: und';
    expect(parseDetectedLang(text)).toBe('und');
  });
});

describe('stripDetectedLang', () => {
  it('removes the trailing __detected_lang line and preserves the body', () => {
    const text = 'Para 1\n\nPara 2\n__detected_lang: en';
    expect(stripDetectedLang(text)).toBe('Para 1\n\nPara 2');
  });

  it('leaves text unchanged when there is no detected_lang line', () => {
    const text = 'Just body content.';
    expect(stripDetectedLang(text)).toBe('Just body content.');
  });

  it('passes through non-string input untouched', () => {
    expect(stripDetectedLang(null)).toBeNull();
    expect(stripDetectedLang(undefined)).toBeUndefined();
  });
});
