import { describe, it, expect } from 'vitest';
import { errFromResponse, codeFromException, codeFromHttpStatus } from '../errors/errFromResponse';

describe('errFromResponse', () => {
  it('maps 429 to OCR_QUOTA when no envelope', async () => {
    const r = new Response(JSON.stringify({}), { status: 429 });
    const entry = await errFromResponse(r);
    expect(entry.code).toBe('OCR_QUOTA');
  });

  it('respects server-supplied registry code', async () => {
    const r = new Response(JSON.stringify({ error: { code: 'EXP_DRIVE_AUTH_EXPIRED', message: 'Reauth.' } }), { status: 401 });
    const entry = await errFromResponse(r);
    expect(entry.code).toBe('EXP_DRIVE_AUTH_EXPIRED');
    expect(entry.message).toBe('Reauth.');
  });

  it('treats AbortError as OCR_ABORTED', () => {
    const err = new DOMException('aborted', 'AbortError');
    expect(codeFromException(err)).toBe('OCR_ABORTED');
  });

  it('maps 504 to OCR_TIMEOUT and 401 to AUTH_REQUIRED', () => {
    // Bare 401 (no body envelope) defaults to AUTH_REQUIRED, not the
    // Drive-specific code — the Drive route always supplies its own code in
    // the body, and a generic 401 should not steer users into Drive bootstrap.
    expect(codeFromHttpStatus(504)).toBe('OCR_TIMEOUT');
    expect(codeFromHttpStatus(401)).toBe('AUTH_REQUIRED');
    expect(codeFromHttpStatus(403)).toBe('AUTH_INVALID');
  });
});
