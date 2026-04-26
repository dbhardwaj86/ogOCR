// Test fixture: rebuilds the Express app from server/index.js with an
// injectable Gemini stub. Mirrors the routes 1:1 so smoke tests exercise
// the same multer/sanitize/error paths the prod server does, without
// binding a port and without hitting real Gemini.
//
// Keep this in lockstep with server/index.js — if a route's middleware
// chain or validation rules change there, change them here too. Only
// the model-call surface is stubbed.

import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { Readable as _Readable } from 'node:stream';
import { sendError } from '../../../server/sendError.js';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_PROMPT_CHARS = 2000;
const MAX_BATCH_FILES = 20;
const ALLOWED_EXTRACT_IMAGES_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIMEOUT_MARKER = 'Gemini request timed out';

const BIDI_RE = new RegExp(
  '[\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]',
  'g'
);

export function sanitizeDriveFilename(name) {
  const cleaned = (typeof name === 'string' ? name : '')
    .replace(/[/\\]/g, '')
    .split('\x00').join('')
    .replace(BIDI_RE, '')
    .trim()
    .slice(0, 255);
  return cleaned || 'ogOCR_Document.txt';
}

export function parseFolderPath(folderPath) {
  if (typeof folderPath !== 'string' || !folderPath.trim()) return [];
  return folderPath
    .split(/[/\\]+/)
    .map((s) => (typeof s === 'string' ? s : '')
      .replace(/[/\\]/g, '')
      .split('\x00').join('')
      .replace(BIDI_RE, '')
      .trim()
      .slice(0, 255))
    .filter(Boolean)
    .slice(0, 8);
}

export function mimeForFilename(name) {
  if (/\.svg$/i.test(name)) return 'image/svg+xml';
  if (/\.md$/i.test(name)) return 'text/markdown';
  return 'text/plain';
}

// Default stub model: returns canned `text` and `svg` responses.
// Tests can override via buildApp({ model: customStub }).
export function makeDefaultModel() {
  return {
    response: { text: 'Hello world\n__detected_lang: en' },
    svgResponse: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect/></svg>',
    jsonResponse: JSON.stringify([
      { description: 'a square', boundingBox: [100, 100, 500, 500] },
    ]),
    fail: null, // optional Error to throw
  };
}

export function buildApp(opts = {}) {
  const model = opts.model || makeDefaultModel();
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  const uploadArray = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_BATCH_FILES },
  });

  function pickUploadedFile(req) {
    if (Array.isArray(req.files) && req.files.length > 0) return req.files[0];
    if (req.file) return req.file;
    return null;
  }

  // Stub Gemini: respect `model.fail` to simulate errors, otherwise
  // return the canned response of the matching shape per route.
  async function callModel(kind) {
    if (model.fail) throw model.fail;
    if (kind === 'svg') return model.svgResponse;
    if (kind === 'json') return model.jsonResponse;
    return model.response.text;
  }

  app.post('/api/extract', uploadArray.any(), async (req, res) => {
    try {
      const file = pickUploadedFile(req);
      const { prompt } = req.body;
      if (!file) return sendError(res, 'CAP_NO_FILE');
      if (prompt !== undefined && typeof prompt !== 'string') {
        return sendError(res, 'OCR_BAD_PROMPT', { message: 'Prompt must be a string.' });
      }
      if (typeof prompt === 'string' && prompt.length > MAX_PROMPT_CHARS) {
        return sendError(res, 'OCR_BAD_PROMPT', { message: `Prompt too long (max ${MAX_PROMPT_CHARS} chars).` });
      }
      const text = await callModel('text');
      res.json({ text });
    } catch (error) {
      if (error?.message === TIMEOUT_MARKER) return sendError(res, 'OCR_TIMEOUT');
      sendError(res, 'OCR_INTERNAL', { cause: error?.message || error });
    }
  });

  app.post('/api/sketch-to-svg', uploadArray.any(), async (req, res) => {
    try {
      const file = pickUploadedFile(req);
      if (!file) return sendError(res, 'CAP_NO_FILE');
      let svgText = await callModel('svg');
      // Mirror the prod fence-stripping
      svgText = svgText.replace(/^```svg\n?/, '').replace(/\n?```$/, '').trim();
      res.json({ svg: svgText });
    } catch (error) {
      sendError(res, 'OCR_INTERNAL', { cause: error?.message || error });
    }
  });

  app.post('/api/extract-images', uploadArray.any(), async (req, res) => {
    try {
      const file = pickUploadedFile(req);
      if (!file) return sendError(res, 'CAP_NO_FILE');
      if (!ALLOWED_EXTRACT_IMAGES_MIMES.includes(file.mimetype)) {
        return sendError(res, 'CAP_BAD_MIME', { message: 'Unsupported file type for image extraction.' });
      }
      let jsonText = await callModel('json');
      jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
      let raw;
      try {
        raw = JSON.parse(jsonText);
      } catch {
        return sendError(res, 'OCR_MALFORMED_JSON');
      }
      if (!Array.isArray(raw)) {
        return sendError(res, 'OCR_MALFORMED_JSON', { message: 'Model did not return an array.' });
      }
      const boxes = raw.filter(b =>
        b && typeof b.description === 'string' &&
        Array.isArray(b.boundingBox) && b.boundingBox.length === 4 &&
        b.boundingBox.every(n => typeof n === 'number' && n >= 0 && n <= 1000) &&
        b.boundingBox[2] > b.boundingBox[0] &&
        b.boundingBox[3] > b.boundingBox[1]
      );
      const extractedImages = [];
      if (file.mimetype.startsWith('image/')) {
        try {
          const metadata = await sharp(file.buffer).metadata();
          const { width, height } = metadata;
          for (let i = 0; i < boxes.length; i++) {
            const box = boxes[i].boundingBox;
            const ymin = box[0] / 1000, xmin = box[1] / 1000;
            const ymax = box[2] / 1000, xmax = box[3] / 1000;
            const left = Math.max(0, Math.floor(xmin * width));
            const top = Math.max(0, Math.floor(ymin * height));
            const w = Math.min(width - left, Math.floor((xmax - xmin) * width));
            const h = Math.min(height - top, Math.floor((ymax - ymin) * height));
            if (w > 0 && h > 0) {
              try {
                const cropped = await sharp(file.buffer)
                  .extract({ left, top, width: w, height: h })
                  .png()
                  .toBuffer();
                extractedImages.push({
                  id: i + 1,
                  desc: boxes[i].description,
                  data: `data:image/png;base64,${cropped.toString('base64')}`,
                });
              } catch (cropErr) {
                // Mirror prod: log and skip; don't fail the whole request
                console.error(`Crop ${i + 1} failed:`, cropErr.message);
              }
            }
          }
        } catch (e) {
          // sharp metadata failed (e.g. corrupt image)
          return sendError(res, 'OCR_INTERNAL', { cause: e?.message });
        }
      } else {
        // PDF path — descriptions only
        boxes.forEach((box, i) => {
          extractedImages.push({
            id: i + 1,
            desc: box.description + ` (Bounding Box: ${box.boundingBox.join(', ')})`,
            data: null,
          });
        });
      }
      res.json({ success: true, images: extractedImages, message: `Found ${boxes.length} visual components.` });
    } catch (error) {
      sendError(res, 'OCR_INTERNAL', { cause: error?.message || error });
    }
  });

  app.post('/api/email', async (req, res) => {
    try {
      const { email, text = '', subject } = req.body || {};
      if (typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
        return sendError(res, 'EXP_EMAIL_BAD_RECIPIENT');
      }
      if (typeof text !== 'string') {
        return sendError(res, 'OCR_BAD_PROMPT', { message: 'Email body must be a string.' });
      }
      const safeSubject = (typeof subject === 'string' ? subject : 'ogOCR Extracted Document')
        .replace(/[\r\n]/g, ' ')
        .slice(0, 200);
      // No SMTP creds in fixture: always mock path
      res.json({
        success: true,
        mock: true,
        message: '(Mock) Email recorded — set SMTP_USER and SMTP_PASS in .env to send real emails.',
        _safeSubject: safeSubject,
      });
    } catch (error) {
      sendError(res, 'OCR_INTERNAL', { cause: error?.message || error });
    }
  });

  app.post('/api/save-drive', (req, res) => {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const safeName = sanitizeDriveFilename(body.filename);
    const folderSegments = parseFolderPath(body.folderPath);
    const folderDisplay = folderSegments.length
      ? `ogOCR/${folderSegments.join('/')}`
      : 'ogOCR';
    // Mock-only in tests; mirror prod's setTimeout shape but fire immediately
    res.json({
      success: true,
      mock: true,
      message: `(Mock) Saved ${safeName} to ${folderDisplay}.`,
    });
  });

  app.post('/api/classroom/draft', (req, res) => {
    const { filename = 'ogOCR_Classroom_Draft' } = (req.body && typeof req.body === 'object') ? req.body : {};
    res.json({
      success: true,
      mock: true,
      message: `(Mock) Drafted ${filename} to Classroom.`,
      info: {
        code: 'EXP_CLASSROOM_MOCK',
        message: 'Classroom export is in preview.',
        hint: `Coming soon — we logged a draft for ${filename} locally.`,
      },
    });
  });

  app.get('/api/_status', (_req, res) => {
    res.json({
      gemini: 'real',
      email: 'mock',
      drive: 'mock',
      classroom: 'mock',
      docx: 'mock',
      auth: 'open',
      serverTime: Date.now(),
    });
  });

  // Multer error middleware (mirrors prod)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return sendError(res, 'CAP_FILE_TOO_LARGE', {
          message: `File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MiB).`,
        });
      }
      return sendError(res, 'CAP_NO_FILE', { message: `Upload error: ${err.code}.` });
    }
    return sendError(res, 'OCR_INTERNAL', { cause: err?.stack || err?.message || err });
  });

  return app;
}

// Helper for tests to build a tiny PNG buffer via sharp (no fixture file).
export async function makeTinyPng(w = 100, h = 100, color = { r: 0, g: 128, b: 255 }) {
  return sharp({
    create: { width: w, height: h, channels: 3, background: color },
  }).png().toBuffer();
}

export async function makeTinyJpeg(w = 100, h = 100) {
  return sharp({
    create: { width: w, height: h, channels: 3, background: { r: 200, g: 50, b: 50 } },
  }).jpeg().toBuffer();
}

export async function makeTinyWebp(w = 100, h = 100) {
  return sharp({
    create: { width: w, height: h, channels: 3, background: { r: 50, g: 200, b: 50 } },
  }).webp().toBuffer();
}

// A tiny valid PDF (one empty page). Valid enough that pdf-utils accept it,
// but not a real document — for size/MIME plumbing tests only.
export const TINY_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]>>endobj\n' +
  'xref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000054 00000 n \n0000000098 00000 n \n' +
  'trailer<</Size 4/Root 1 0 R>>\nstartxref\n149\n%%EOF',
  'utf8'
);
