/**
 * Smoke: /api/sketch-to-svg.
 * Covers fence stripping, MIME gate, JSON parsing, sharp crop pipeline,
 * and the PDF "descriptions only" branch.
 *
 * `/api/extract-images` and the corresponding magic action were removed in
 * the 2026-04-27 surface trim — image export now happens client-side via
 * the Save picker's PNG/JPG entries.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { buildApp, makeTinyPng, makeDefaultModel } from './server.fixture.js';

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

  // Phase 15 — Multi-Sketch Detection. Discovery returns either back-compat
  // {svg} (single sketch) or {sketches: [...]} (multi). Vectorize-mode
  // accepts a bbox in the body and crops/hints accordingly.

  it('Discovery: 0 sketches → OCR_NO_SKETCH_FOUND 404', async () => {
    const app = buildApp({
      model: { ...makeDefaultModel(), jsonResponse: '[]' },
    });
    const res = await request(app)
      .post(ENDPOINT)
      .attach('files', png, { filename: 'blank.png', contentType: 'image/png' });
    log(ENDPOINT, 'NO_SKETCH', res);
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('OCR_NO_SKETCH_FOUND');
  });

  it('Discovery: 2+ sketches → {sketches: [...]} multi payload (back-compat for 1)', async () => {
    const app = buildApp({
      model: {
        ...makeDefaultModel(),
        jsonResponse: JSON.stringify([
          { description: 'free-body', boundingBox: [50, 50, 400, 400], page: 1 },
          { description: 'circuit',    boundingBox: [500, 500, 900, 900], page: 1 },
        ]),
      },
    });
    const res = await request(app)
      .post(ENDPOINT)
      .attach('files', png, { filename: 'multi.png', contentType: 'image/png' });
    log(ENDPOINT, 'MULTI', res);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sketches)).toBe(true);
    expect(res.body.sketches.length).toBe(2);
    expect(res.body.sketches[0]).toMatchObject({ id: 1, description: 'free-body', page: 1 });
    expect(res.body.sketches[0].bbox).toEqual([50, 50, 400, 400]);
    expect(res.body.message).toMatch(/Found 2 sketches/);
    expect(res.body.svg).toBeUndefined();
  });

  it('Discovery: exactly 1 sketch → back-compat {svg} (no picker)', async () => {
    // Default model returns 1-sketch jsonResponse, so the discovery branch
    // should auto-fall-through to vectorize and emit {svg} — same as today.
    const app = buildApp();
    const res = await request(app)
      .post(ENDPOINT)
      .attach('files', png, { filename: 'single.png', contentType: 'image/png' });
    log(ENDPOINT, 'SINGLE_BACK_COMPAT', res);
    expect(res.status).toBe(200);
    expect(res.body.svg).toMatch(/^<svg/);
    expect(res.body.sketches).toBeUndefined();
  });

  it('Vectorize mode: valid bbox → {svg}', async () => {
    const app = buildApp();
    const res = await request(app)
      .post(ENDPOINT)
      .field('bbox', JSON.stringify([100, 100, 500, 500]))
      .field('page', '1')
      .attach('files', png, { filename: 'p.png', contentType: 'image/png' });
    log(ENDPOINT, 'VECTORIZE_OK', res);
    expect(res.status).toBe(200);
    expect(res.body.svg).toMatch(/^<svg/);
    expect(res.body.sketches).toBeUndefined();
  });

  it('Vectorize mode: bad bbox (reversed) → OCR_SKETCH_BBOX_INVALID 400', async () => {
    const app = buildApp();
    const res = await request(app)
      .post(ENDPOINT)
      .field('bbox', JSON.stringify([500, 500, 100, 100]))
      .attach('files', png, { filename: 'p.png', contentType: 'image/png' });
    log(ENDPOINT, 'BBOX_REVERSED', res);
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('OCR_SKETCH_BBOX_INVALID');
  });

  it('Vectorize mode: out-of-range bbox → OCR_SKETCH_BBOX_INVALID 400', async () => {
    const app = buildApp();
    const res = await request(app)
      .post(ENDPOINT)
      .field('bbox', JSON.stringify([0, 0, 1500, 1500]))
      .attach('files', png, { filename: 'p.png', contentType: 'image/png' });
    log(ENDPOINT, 'BBOX_RANGE', res);
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('OCR_SKETCH_BBOX_INVALID');
  });

  it('Vectorize mode: malformed bbox JSON → OCR_SKETCH_BBOX_INVALID 400', async () => {
    const app = buildApp();
    const res = await request(app)
      .post(ENDPOINT)
      .field('bbox', '{not-json')
      .attach('files', png, { filename: 'p.png', contentType: 'image/png' });
    log(ENDPOINT, 'BBOX_MALFORMED', res);
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('OCR_SKETCH_BBOX_INVALID');
  });
});

