/**
 * Smoke: Gemini Files API upload helper.
 * - PDFs route through fileManager.uploadFile + ACTIVE-state polling
 * - Images stay inline base64
 * - waitForGeminiFileActive polls until ACTIVE or times out
 * - cleanupGeminiUpload swallows delete errors so route success isn't masked
 */
import { describe, it, expect } from 'vitest';
import {
  buildGeminiUploadParts,
  buildInlineUploadPart,
  cleanupGeminiUpload,
  shouldUseGeminiFileApi,
  waitForGeminiFileActive,
} from '../../../server/geminiUpload.js';

function upload(name, mimetype, buffer = Buffer.from('file-body')) {
  return {
    originalname: name,
    mimetype,
    buffer,
    size: buffer.length,
  };
}

describe('SMOKE geminiUpload — buildGeminiUploadParts', () => {
  it('PDFs route through Gemini Files API instead of inline base64', async () => {
    const pdf = upload('Derivatives Chapter.pdf', 'application/pdf');
    const calls = [];
    const fileManager = {
      async uploadFile(buffer, metadata) {
        calls.push({ type: 'upload', buffer, metadata });
        return {
          file: {
            name: 'files/pdf-123',
            uri: 'gemini://files/pdf-123',
            mimeType: 'application/pdf',
            state: 'ACTIVE',
          },
        };
      },
    };

    const result = await buildGeminiUploadParts(pdf, { fileManager });

    expect(shouldUseGeminiFileApi(pdf)).toBe(true);
    expect(result).toEqual({
      parts: [{
        fileData: {
          fileUri: 'gemini://files/pdf-123',
          mimeType: 'application/pdf',
        },
      }],
      uploadedFileName: 'files/pdf-123',
    });
    expect(calls.length).toBe(1);
    expect(calls[0].buffer).toBe(pdf.buffer);
    expect(calls[0].metadata).toEqual({
      displayName: 'Derivatives Chapter.pdf',
      mimeType: 'application/pdf',
    });
  });

  it('image uploads stay inline so existing OCR behavior is preserved', async () => {
    const image = upload('scan.png', 'image/png', Buffer.from('png-bytes'));

    expect(shouldUseGeminiFileApi(image)).toBe(false);
    expect(buildInlineUploadPart(image)).toEqual({
      inlineData: {
        data: Buffer.from('png-bytes').toString('base64'),
        mimeType: 'image/png',
      },
    });

    const result = await buildGeminiUploadParts(image, {
      fileManager: {
        async uploadFile() {
          throw new Error('image uploads should not call file manager');
        },
      },
    });

    expect(result).toEqual({
      parts: [buildInlineUploadPart(image)],
      uploadedFileName: null,
    });
  });

  it('PDF with no fileManager throws clear error', async () => {
    const pdf = upload('orphan.pdf', 'application/pdf');
    await expect(buildGeminiUploadParts(pdf, {})).rejects.toThrow(/file manager is required/);
  });
});

describe('SMOKE geminiUpload — waitForGeminiFileActive', () => {
  it('polls processing uploads until they are active', async () => {
    const states = ['PROCESSING', 'ACTIVE'];
    const seen = [];
    const fileManager = {
      async getFile(name) {
        seen.push(name);
        const state = states.shift();
        return {
          name,
          uri: 'gemini://files/pdf-123',
          mimeType: 'application/pdf',
          state,
        };
      },
    };

    const active = await waitForGeminiFileActive(fileManager, {
      name: 'files/pdf-123',
      uri: 'gemini://files/pdf-123',
      mimeType: 'application/pdf',
      state: 'PROCESSING',
    }, {
      now: (() => {
        let t = 0;
        return () => t += 10;
      })(),
      sleep: async () => {},
      pollIntervalMs: 1,
      timeoutMs: 100,
    });

    expect(active.state).toBe('ACTIVE');
    expect(seen).toEqual(['files/pdf-123', 'files/pdf-123']);
  });

  it('times out when file never reaches ACTIVE', async () => {
    const fileManager = {
      async getFile(name) {
        return { name, state: 'PROCESSING' };
      },
    };

    let t = 0;
    await expect(
      waitForGeminiFileActive(fileManager, {
        name: 'files/stuck',
        state: 'PROCESSING',
      }, {
        now: () => (t += 100),
        sleep: async () => {},
        pollIntervalMs: 1,
        timeoutMs: 50,
      })
    ).rejects.toThrow(/timed out/);
  });
});

describe('SMOKE geminiUpload — cleanupGeminiUpload', () => {
  it('deletes temporary Gemini files without masking route success', async () => {
    const deleted = [];
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      await cleanupGeminiUpload({
        async deleteFile(name) {
          deleted.push(name);
        },
      }, 'files/pdf-123');

      await cleanupGeminiUpload({
        async deleteFile() {
          throw new Error('network cleanup failed');
        },
      }, 'files/pdf-456');
    } finally {
      console.warn = originalWarn;
    }

    expect(deleted).toEqual(['files/pdf-123']);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/files\/pdf-456/);
  });

  it('is a no-op when no file was uploaded', async () => {
    let called = false;
    await cleanupGeminiUpload({ async deleteFile() { called = true; } }, null);
    expect(called).toBe(false);
  });
});
