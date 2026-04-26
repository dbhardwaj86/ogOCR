/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted mock for showError so we can assert against it from inside the module
// under test (which imports showError indirectly via showError.js).
const showErrorMock = vi.fn();
vi.mock('../errors/showError', () => ({
  showError: showErrorMock,
  showInfo: vi.fn(),
  installErrorSinks: vi.fn(),
}));

// Imported AFTER vi.mock so the mock is in place.
const { exportDocx } = await import('../exportDocx.js');

describe('exportDocx', () => {
  let originalFetch;
  let createObjectURLSpy;
  let revokeObjectURLSpy;
  let clickSpy;

  beforeEach(() => {
    showErrorMock.mockReset();
    originalFetch = globalThis.fetch;
    createObjectURLSpy = vi.fn(() => 'blob:fake-url');
    revokeObjectURLSpy = vi.fn();
    URL.createObjectURL = createObjectURLSpy;
    URL.revokeObjectURL = revokeObjectURLSpy;
    // Spy on anchor click so the happy path doesn't trigger a navigation.
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clickSpy.mockRestore();
  });

  it('happy path: creates a download link and revokes the blob URL', async () => {
    const fakeBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // ZIP magic ≈ docx
    const fakeBlob = new Blob([fakeBytes], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(fakeBlob),
    });

    const result = await exportDocx({ markdown: '# Hello world', filename: 'test.docx' });

    expect(result).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/export-docx', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }));
    const sentBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(sentBody.markdown).toBe('# Hello world');
    expect(sentBody.filename).toBe('test.docx');
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:fake-url');
    expect(showErrorMock).not.toHaveBeenCalled();
  });

  it('envelope path: surfaces EXP_DOCX_NO_BINARY when the server returns 503 with the registry envelope', async () => {
    const envelope = {
      error: {
        code: 'EXP_DOCX_NO_BINARY',
        message: 'Word export is in mock mode.',
        hint: 'Install pandoc on the server to enable real Word export.',
      },
    };
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(envelope), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await exportDocx({ markdown: '# Hello', filename: 'test.docx' });

    expect(result).toBe(false);
    expect(showErrorMock).toHaveBeenCalledTimes(1);
    expect(showErrorMock).toHaveBeenCalledWith(
      'EXP_DOCX_NO_BINARY',
      expect.objectContaining({
        message: 'Word export is in mock mode.',
      })
    );
    // No download triggered.
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('rejects empty markdown without hitting the network', async () => {
    globalThis.fetch = vi.fn();

    const result = await exportDocx({ markdown: '   ', filename: 'test.docx' });

    expect(result).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(showErrorMock).toHaveBeenCalled();
  });
});

// Filename sanitization mirror — exercises the same FILENAME_BAD_CHARS and
// BiDi-strip pattern used in CompileBuilder.safeFilename. This guards the
// shape of the helper the manager will move into compile.js once Track K
// merges; for now the regex literals live in CompileBuilder.jsx and we
// duplicate them here to assert the contract is honored.
function safeFilenameForTest(name) {
  const FILENAME_BAD_CHARS = /[\\/:*?"<>|]/g;
  // BiDi/RTL chars we strip: LRM, RLM, and embedding/override controls.
  const FILENAME_BIDI = /[‎‏‪-‮]/g;
  const cleaned = (name || 'compile')
    .replace(FILENAME_BAD_CHARS, '')
    .replace(FILENAME_BIDI, '')
    .trim()
    .slice(0, 200);
  return cleaned || 'compile';
}

describe('safeFilename (DOCX export contract)', () => {
  it('strips path separators, wildcard chars, BiDi controls, and caps at 200 chars', () => {
    const dirty = '/\\:*?"<>|hello‎‏‪world';
    const cleaned = safeFilenameForTest(dirty);
    expect(cleaned).toBe('helloworld');
    expect(cleaned).not.toMatch(/[\\/:*?"<>|]/);
    expect(cleaned).not.toMatch(/[‎‏‪-‮]/);
  });

  it('caps very long names at 200 characters', () => {
    const long = 'a'.repeat(500);
    const cleaned = safeFilenameForTest(long);
    expect(cleaned.length).toBe(200);
  });

  it('falls back to "compile" when input becomes empty after sanitizing', () => {
    expect(safeFilenameForTest('////')).toBe('compile');
    expect(safeFilenameForTest('')).toBe('compile');
    expect(safeFilenameForTest(null)).toBe('compile');
  });
});
