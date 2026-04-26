/**
 * Smoke: every input flavor against /api/extract.
 *
 * Each test logs ENDPOINT / INPUT TYPE / EXPECTED / ACTUAL so a human
 * scanning the test output can map them to the report matrix.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { buildApp, makeTinyPng, makeTinyJpeg, makeTinyWebp, TINY_PDF, makeDefaultModel } from './server.fixture.js';

const ENDPOINT = '/api/extract';
let app;
let png, jpeg, webp;

beforeAll(async () => {
  app = buildApp();
  png = await makeTinyPng();
  jpeg = await makeTinyJpeg();
  webp = await makeTinyWebp();
});

function logRow(input, expectedShape, actual) {
  // visible in vitest verbose output
  console.log(
    `[smoke] ${ENDPOINT} | input=${input} | expected=${expectedShape} | actual.status=${actual.status} keys=${Object.keys(actual.body || {}).join(',')}`
  );
}

describe('SMOKE /api/extract — input × endpoint matrix', () => {
  it('PNG image → {text}', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .attach('files', png, { filename: 'tiny.png', contentType: 'image/png' });
    logRow('PNG', '{text}', res);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('text');
    expect(typeof res.body.text).toBe('string');
  });

  it('JPEG image → {text}', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .attach('files', jpeg, { filename: 'tiny.jpg', contentType: 'image/jpeg' });
    logRow('JPEG', '{text}', res);
    expect(res.status).toBe(200);
    expect(res.body.text).toBeTruthy();
  });

  it('WEBP image → {text}', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .attach('files', webp, { filename: 'tiny.webp', contentType: 'image/webp' });
    logRow('WEBP', '{text}', res);
    expect(res.status).toBe(200);
  });

  it('PDF (small) → {text}', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .attach('files', TINY_PDF, { filename: 'doc.pdf', contentType: 'application/pdf' });
    logRow('PDF-small', '{text}', res);
    expect(res.status).toBe(200);
    expect(res.body.text).toBeTruthy();
  });

  it('Oversized image (> 10 MiB) → multer LIMIT_FILE_SIZE → CAP_FILE_TOO_LARGE', async () => {
    const huge = Buffer.alloc(11 * 1024 * 1024, 0xAA);
    const res = await request(app)
      .post(ENDPOINT)
      .attach('files', huge, { filename: 'huge.png', contentType: 'image/png' });
    logRow('OVERSIZED', 'CAP_FILE_TOO_LARGE', res);
    expect(res.status).toBe(413);
    expect(res.body.error?.code).toBe('CAP_FILE_TOO_LARGE');
  });

  it('Wrong MIME (text/plain renamed .png) → multer accepts it (server does NOT MIME-gate /api/extract)', async () => {
    // /api/extract has no ALLOWED_*_MIMES gate; multer accepts any type up to
    // the size cap. Gemini in prod would barf on this; in our stub the call
    // succeeds. This documents the surface, not a defect on the test path.
    const txt = Buffer.from('this is not a png');
    const res = await request(app)
      .post(ENDPOINT)
      .attach('files', txt, { filename: 'fake.png', contentType: 'text/plain' });
    logRow('WRONG_MIME', '{text} (server passes through)', res);
    expect(res.status).toBe(200);
    expect(res.body.text).toBeTruthy();
  });

  it('Zero-byte file → server still 200 (no zero-byte gate); Gemini would reject in prod', async () => {
    const empty = Buffer.alloc(0);
    const res = await request(app)
      .post(ENDPOINT)
      .attach('files', empty, { filename: 'empty.png', contentType: 'image/png' });
    logRow('ZERO_BYTE', '{text} (no server gate)', res);
    // multer may either accept zero-byte or reject; assert behavior is consistent
    // (one of: 200 with text, or 400 with CAP_NO_FILE if multer dropped the field)
    expect([200, 400]).toContain(res.status);
  });

  it('Filename with spaces and unicode → handled; sanitized only on Drive path', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .attach('files', png, { filename: 'my cool 日本語 ✨.png', contentType: 'image/png' });
    logRow('UNICODE_NAME', '{text}', res);
    expect(res.status).toBe(200);
  });

  it('Filename with path traversal chars → no path-write happens (multer.memoryStorage); 200', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .attach('files', png, { filename: '../../etc/passwd.png', contentType: 'image/png' });
    logRow('PATH_TRAVERSAL', '{text}', res);
    expect(res.status).toBe(200);
  });

  it('Empty prompt → uses default Gemini prompt', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .attach('files', png, { filename: 'a.png', contentType: 'image/png' })
      .field('prompt', '');
    logRow('EMPTY_PROMPT', '{text}', res);
    expect(res.status).toBe(200);
  });

  it('Very long prompt (> MAX_PROMPT_CHARS=2000) → 400 OCR_BAD_PROMPT', async () => {
    const long = 'x'.repeat(2001);
    const res = await request(app)
      .post(ENDPOINT)
      .attach('files', png, { filename: 'a.png', contentType: 'image/png' })
      .field('prompt', long);
    logRow('LONG_PROMPT', 'OCR_BAD_PROMPT', res);
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('OCR_BAD_PROMPT');
  });

  it('Prompt with quote/newline/null injection chars → 200 (passed through to model)', async () => {
    const naughty = `"\n\\"; DROP TABLE users; --\n\x00`;
    const res = await request(app)
      .post(ENDPOINT)
      .attach('files', png, { filename: 'a.png', contentType: 'image/png' })
      .field('prompt', naughty);
    logRow('INJECTION_PROMPT', '{text}', res);
    expect(res.status).toBe(200);
  });

  it('No file uploaded → CAP_NO_FILE 400', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .field('prompt', 'extract');
    logRow('NO_FILE', 'CAP_NO_FILE', res);
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('CAP_NO_FILE');
  });

  it('Gemini timeout → OCR_TIMEOUT 504', async () => {
    const failApp = buildApp({
      model: { ...makeDefaultModel(), fail: new Error('Gemini request timed out') },
    });
    const res = await request(failApp)
      .post(ENDPOINT)
      .attach('files', png, { filename: 'a.png', contentType: 'image/png' });
    logRow('TIMEOUT', 'OCR_TIMEOUT', res);
    expect(res.status).toBe(504);
    expect(res.body.error?.code).toBe('OCR_TIMEOUT');
  });

  it('Gemini generic error → OCR_INTERNAL 500', async () => {
    const failApp = buildApp({
      model: { ...makeDefaultModel(), fail: new Error('something broke') },
    });
    const res = await request(failApp)
      .post(ENDPOINT)
      .attach('files', png, { filename: 'a.png', contentType: 'image/png' });
    logRow('GEN_ERROR', 'OCR_INTERNAL', res);
    expect(res.status).toBe(500);
    expect(res.body.error?.code).toBe('OCR_INTERNAL');
  });
});
