import { describe, it, expect } from 'vitest';
import { ERRORS, formatMessage, getError } from '../errors/codes';

describe('error registry', () => {
  it('exposes the canonical capture/upload codes', () => {
    expect(ERRORS.CAP_FILE_TOO_LARGE.code).toBe('CAP_FILE_TOO_LARGE');
    expect(ERRORS.CAP_BAD_MIME.surface).toBe('toast');
    expect(ERRORS.CAP_PERM_DENIED.severity).toBe('error');
  });

  it('falls back to OCR_INTERNAL for unknown codes', () => {
    expect(getError('NOT_A_CODE').code).toBe('OCR_INTERNAL');
  });

  it('templates messages with $name overrides', () => {
    const out = formatMessage('CAP_FILE_TOO_LARGE', { hint: 'Max size is $limit MB.', limit: 5 });
    expect(out.hint).toBe('Max size is 5 MB.');
    expect(out.code).toBe('CAP_FILE_TOO_LARGE');
  });
});
