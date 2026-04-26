/**
 * Smoke: /api/sketch-to-svg and /api/extract-images.
 * Covers fence stripping, MIME gate, JSON parsing, sharp crop pipeline,
 * and the PDF "descriptions only" branch.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { buildApp, makeTinyPng, TINY_PDF, makeDefaultModel } from './server.fixture.js';

let png;
beforeAll(async () => { png = await makeTinyPng(200, 200); });

function log(endpoint, label, res) {
  console.log(`[smoke] ${endpoint} | ${label} | status=${res.status} keys=${Object.keys(res.body || {}).join(',')}`);
}

describe('SMOKE /api/sketch-to-svg', () => {
  const ENDPOINT = '/api/sketch-to-svg';

  it('PNG → {svg} with raw SVG body', async () => {
    const app = buildApp();
    const res = await request(app)
      .post(ENDPOINT)
      .attach('files', png, { filename: 'sketch.png', contentType: 'image/png' });
    log(ENDPOINT, 'PNG-clean', res);
    expect(res.status).toBe(200);
    expect(res.body.svg).toMatch(/^<svg/);
  });

  it('Strips ```svg fences if model emits them', async () => {
    const app = buildApp({
      model: {
        ...makeDefaultModel(),
        svgResponse: '```svg\n<svg viewBox="0 0 1 1"/>\n```',
      },
    });
    const res = await request(app)
      .post(ENDPOINT)
      .attach('files', png, { filename: 'a.png', contentType: 'image/png' });
    log(ENDPOINT, 'FENCED', res);
    expect(res.status).toBe(200);
    expect(res.body.svg.startsWith('```')).toBe(false);
    expect(res.body.svg.endsWith('```')).toBe(false);
    expect(res.body.svg).toContain('<svg');
  });

  it('No file → CAP_NO_FILE', async () => {
    const app = buildApp();
    const res = await request(app).post(ENDPOINT);
    log(ENDPOINT, 'NO_FILE', res);
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('CAP_NO_FILE');
  });
});

describe('SMOKE /api/extract-images', () => {
  const ENDPOINT = '/api/extract-images';

  it('Image input → crops via sharp → {images: [{data: data:image/png}]}', async () => {
    const app = buildApp();
    const res = await request(app)
      .post(ENDPOINT)
      .attach('files', png, { filename: 'art.png', contentType: 'image/png' });
    log(ENDPOINT, 'PNG_CROP', res);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('images');
    expect(Array.isArray(res.body.images)).toBe(true);
    if (res.body.images.length > 0) {
      expect(res.body.images[0].data).toMatch(/^data:image\/png;base64,/);
    }
  });

  it('PDF input → descriptions only (data:null)', async () => {
    const app = buildApp();
    const res = await request(app)
      .post(ENDPOINT)
      .attach('files', TINY_PDF, { filename: 'doc.pdf', contentType: 'application/pdf' });
    log(ENDPOINT, 'PDF_DESC_ONLY', res);
    expect(res.status).toBe(200);
    expect(res.body.images).toBeDefined();
    if (res.body.images.length > 0) {
      expect(res.body.images[0].data).toBeNull();
      expect(res.body.images[0].desc).toContain('Bounding Box:');
    }
  });

  it('Wrong MIME (text/plain) → CAP_BAD_MIME 415', async () => {
    const app = buildApp();
    const res = await request(app)
      .post(ENDPOINT)
      .attach('files', Buffer.from('nope'), { filename: 'a.txt', contentType: 'text/plain' });
    log(ENDPOINT, 'BAD_MIME', res);
    expect(res.status).toBe(415);
    expect(res.body.error?.code).toBe('CAP_BAD_MIME');
  });

  it('Malformed JSON from model → OCR_MALFORMED_JSON 502', async () => {
    const app = buildApp({
      model: { ...makeDefaultModel(), jsonResponse: 'not json at all' },
    });
    const res = await request(app)
      .post(ENDPOINT)
      .attach('files', png, { filename: 'a.png', contentType: 'image/png' });
    log(ENDPOINT, 'MALFORMED', res);
    expect(res.status).toBe(502);
    expect(res.body.error?.code).toBe('OCR_MALFORMED_JSON');
  });

  it('Non-array JSON from model → OCR_MALFORMED_JSON 502', async () => {
    const app = buildApp({
      model: { ...makeDefaultModel(), jsonResponse: '{"foo":1}' },
    });
    const res = await request(app)
      .post(ENDPOINT)
      .attach('files', png, { filename: 'a.png', contentType: 'image/png' });
    log(ENDPOINT, 'NON_ARRAY', res);
    expect(res.status).toBe(502);
    expect(res.body.error?.code).toBe('OCR_MALFORMED_JSON');
  });

  it('Boxes with invalid coordinates filtered out → empty images', async () => {
    const app = buildApp({
      model: {
        ...makeDefaultModel(),
        // y/x reversed, > 1000, missing keys — every box should be filtered
        jsonResponse: JSON.stringify([
          { description: 'bad coords', boundingBox: [500, 500, 100, 100] },
          { description: 'over 1000', boundingBox: [0, 0, 1500, 1500] },
          { boundingBox: [10, 10, 100, 100] }, // missing description
        ]),
      },
    });
    const res = await request(app)
      .post(ENDPOINT)
      .attach('files', png, { filename: 'a.png', contentType: 'image/png' });
    log(ENDPOINT, 'INVALID_BOXES', res);
    expect(res.status).toBe(200);
    expect(res.body.images).toEqual([]);
    expect(res.body.message).toContain('0 visual components');
  });

  it('Fenced ```json wrapper stripped before parse', async () => {
    const app = buildApp({
      model: {
        ...makeDefaultModel(),
        jsonResponse: '```json\n[{"description":"x","boundingBox":[10,10,500,500]}]\n```',
      },
    });
    const res = await request(app)
      .post(ENDPOINT)
      .attach('files', png, { filename: 'a.png', contentType: 'image/png' });
    log(ENDPOINT, 'FENCED_JSON', res);
    expect(res.status).toBe(200);
    expect(res.body.images.length).toBe(1);
  });
});
