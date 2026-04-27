import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import helmet from 'helmet';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import sharp from 'sharp';
import os from 'os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { sendError, codeFromException } from './sendError.js';
import { buildGeminiUploadParts, cleanupGeminiUpload } from './geminiUpload.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, '..', 'dist');
const DIST_INDEX = path.join(DIST_DIR, 'index.html');

dotenv.config({ path: new URL('../.env', import.meta.url) });

if (!process.env.GEMINI_API_KEY) {
  console.error('FATAL: GEMINI_API_KEY is not set. Copy .env.example to .env and fill in your key.');
  process.exit(1);
}

const app = express();
// API_PORT lets the dev server hop ports if 3001 is held by an orphan node
// process from a previous run (the Windows-restart gotcha documented in
// CLAUDE.md). Vite's proxy reads the same env so they always agree.
const port = Number(process.env.API_PORT) || 3003;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_PROMPT_CHARS = 2000;
const GEMINI_TIMEOUT_MS = 600_000;
const TIMEOUT_MARKER = 'Gemini request timed out';
// Mirror UploadCard.jsx's `^(image\/|application\/pdf$)/` regex — the
// server should reject obvious garbage (text/plain, application/zip,
// application/x-msdownload renamed to .png) without rejecting valid image
// types the client happily accepts (image/jpg from older browsers,
// image/heic from iPhones, image/gif, image/bmp).
const ALLOWED_INPUT_RE = /^(image\/|application\/pdf$)/;
function isAllowedInputMime(mime) { return typeof mime === 'string' && ALLOWED_INPUT_RE.test(mime); }
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// CORS: allow loopback + RFC 1918 LAN ranges + .local mDNS hostnames by default.
// User reviews the app from their phone over Wi-Fi; binding to 0.0.0.0 means the
// browser sends Origin: http://192.168.x.x:3000, which has to be allowed here.
// Override the whole policy by setting CORS_ORIGIN — '*' allows all, anything
// else is treated as a literal origin to match exactly.
const LAN_ORIGIN_RE = /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\[::1\]|[\w-]+\.local)(:\d+)?$/;
const corsOriginOverride = process.env.CORS_ORIGIN;

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (corsOriginOverride === '*') return callback(null, true);
    if (corsOriginOverride && origin === corsOriginOverride) return callback(null, true);
    if (LAN_ORIGIN_RE.test(origin)) return callback(null, true);
    console.warn(`[CORS] rejected origin: ${origin}`);
    return callback(null, false);
  },
}));

// Diagnostic: log every request's method/path/origin/UA. Useful when debugging
// why a particular device (e.g. an Android phone) sees "failed to fetch".
// Strip CR/LF/ANSI escapes from any user-influenced string before logging — an
// attacker who controls UA or Origin headers must not be able to inject fake
// log lines that mislead an ops engineer during incident response. The ESC
// (0x1b) byte is built via fromCharCode so the source file stays plain ASCII
// and lint's no-control-regex doesn't trip.
const LOG_STRIP_RE = new RegExp('[\\r\\n' + String.fromCharCode(0x1b) + ']', 'g');
function safeLog(s) {
  return String(s ?? '').replace(LOG_STRIP_RE, ' ').slice(0, 200);
}

app.use((req, _res, next) => {
  const ua = safeLog(req.headers['user-agent']).slice(0, 80);
  const origin = safeLog(req.headers.origin) || '-';
  console.log(`[req] ${req.method} ${req.path} ← origin=${origin} ua="${ua}"`);
  next();
});

// 12 MiB body cap — extracted markdown for a 50-page PDF easily exceeds the
// 100 KiB default. Hits both /api/save-drive and /api/email which round-trip
// the whole document.
app.use(express.json({ limit: '12mb' }));

// Security headers (CSP off — the app is API-only, doesn't serve HTML).
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
// HTTP parameter pollution guard. Multipart form-data isn't parsed by hpp
// (multer handles those), so this only affects JSON/urlencoded bodies.
app.use(hpp());

// Rate limiting: 60 req/min/IP globally; 15 req/min/IP on the OCR routes since
// each kicks off a Gemini call. We don't trust X-Forwarded-For (no proxy in
// front in dev) — set `trust proxy` to false so the limiter uses socket IP.
app.set('trust proxy', false);
const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => sendError(res, 'RATE_LIMITED'),
  // Skip the status endpoint — frontend pings it on mount.
  skip: (req) => req.path === '/api/_status',
});
const ocrLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => sendError(res, 'OCR_QUOTA', { message: 'Too many OCR requests in a short window.' }),
});
app.use(globalLimiter);

// Optional shared-secret gate. When OG_API_TOKEN is set, every /api/* request
// (except /api/_status) must send X-OG-Token. Local dev keeps OG_API_TOKEN
// unset, so this is a no-op. Useful for the LAN-binding scenario where any
// device on the network can otherwise reach Gemini through this server.
app.use('/api', (req, res, next) => {
  if (req.path === '/_status') return next();
  const expected = process.env.OG_API_TOKEN;
  if (!expected) return next();
  const got = req.header('x-og-token');
  if (!got) return sendError(res, 'AUTH_REQUIRED');
  // Constant-time compare. Bail on length mismatch first because
  // timingSafeEqual throws if buffer lengths differ.
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return sendError(res, 'AUTH_INVALID');
  }
  return next();
});

// Per-IP semaphore over uploads. Cap concurrent in-flight uploads so a single
// LAN client can't OOM the server with 50 parallel multer requests sitting in
// memoryStorage. Holds up to 5 concurrent per IP; 6th onward queues briefly,
// then 503s.
const UPLOAD_CONCURRENCY = 5;
const inflightByIp = new Map();
function uploadSemaphore(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const n = inflightByIp.get(ip) || 0;
  if (n >= UPLOAD_CONCURRENCY) {
    return sendError(res, 'RATE_LIMITED', { message: 'Too many uploads in flight from this device.' });
  }
  inflightByIp.set(ip, n + 1);
  res.on('close', () => {
    const m = (inflightByIp.get(ip) || 1) - 1;
    if (m <= 0) inflightByIp.delete(ip); else inflightByIp.set(ip, m);
  });
  next();
}

// Sprint 2.4: clients may POST up to 20 files in a single request as a queue
// batch. The queue runs serially client-side (one in flight at a time) — the
// server still handles only the first file in the batch per response, so the
// per-request memory footprint matches the single-file path. Aggregate cap is
// 20 * MAX_UPLOAD_BYTES = 200 MiB.
//
// Routes use `.any()` so both wire shapes — `file` (singular, from
// runAction) and `files` (plural, from the queue runner) — go through the
// same handler without multer rejecting the unrecognized field with
// LIMIT_UNEXPECTED_FILE. `pickUploadedFile` reads from `req.files[0]`
// regardless.
const MAX_BATCH_FILES = 20;
const uploadArray = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_BATCH_FILES },
});

// Helper: pull the canonical upload from a request that accepts either
// `files[]` (new multi route) or `file` (legacy single field, in case a
// client still sends that shape).
function pickUploadedFile(req) {
  if (Array.isArray(req.files) && req.files.length > 0) return req.files[0];
  if (req.file) return req.file;
  return null;
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Files API client for PDFs — large multi-page docs upload once, get a fileUri,
// then generateContent references it. Images stay inline base64 (cheaper hop).
const fileManager = process.env.GEMINI_API_KEY
  ? new GoogleAIFileManager(process.env.GEMINI_API_KEY)
  : null;

// Wraps Gemini generateContent with the upload-strategy split: PDFs go via the
// Files API (uploaded once, referenced by URI, deleted after), images stay
// inline base64. Cleanup runs in a finally so a model error doesn't strand
// uploaded files on Gemini's side.
async function generateContentFromUpload(model, prompt, file) {
  const { parts, uploadedFileName } = await buildGeminiUploadParts(file, { fileManager });
  try {
    return await withTimeout(model.generateContent([prompt, ...parts]));
  } finally {
    await cleanupGeminiUpload(fileManager, uploadedFileName);
  }
}

// Drive integration: optional. All three vars must be set; populate
// GOOGLE_REFRESH_TOKEN by running `npm run bootstrap-drive` once.
const DRIVE_ENV_KEYS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'];
const DRIVE_FOLDER_NAME = 'ogOCR';
const DRIVE_TIMEOUT_MS = 30_000;
let driveClient = null;
let folderIdPromise = null;

{
  const missing = DRIVE_ENV_KEYS.filter(k => !process.env[k]);
  if (missing.length === 0) {
    const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    driveClient = google.drive({ version: 'v3', auth: oauth2Client });
    console.log('Drive integration enabled.');
  } else {
    console.log(`Drive integration not configured — /api/save-drive will mock. Missing: ${missing.join(', ')}`);
  }
}

// Pandoc detect-and-mock. Probe `pandoc --version` once at boot; cache the
// boolean so /api/_status and /api/export-docx don't re-spawn the binary on
// every request. Mirrors the Drive/Email/Classroom mock disclosure pattern.
const DOCX_TIMEOUT_MS = 30_000;
const DOCX_MAX_MARKDOWN_BYTES = 12 * 1024 * 1024; // matches express.json cap
let PANDOC_AVAILABLE = false;
{
  try {
    const probe = spawnSync('pandoc', ['--version'], { shell: false, timeout: 5000 });
    if (probe.status === 0 && probe.stdout) {
      PANDOC_AVAILABLE = true;
      const firstLine = probe.stdout.toString().split('\n')[0].trim();
      console.log(`[pandoc] available ${firstLine}`);
    } else {
      console.log('[pandoc] not installed — DOCX export will mock');
    }
  } catch {
    console.log('[pandoc] not installed — DOCX export will mock');
  }
}

function withTimeout(promise, ms = GEMINI_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(TIMEOUT_MARKER)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function sendModelError(res, error, fallback) {
  // Legacy helper preserved for in-flight call sites that haven't migrated to
  // sendError yet. New code should call sendError(res, code, { cause }).
  const code = codeFromException(error);
  return sendError(res, code, {
    cause: error?.stack || error?.message || error,
    message: code === 'OCR_INTERNAL' ? fallback : undefined,
  });
}

// Strip Unicode bidi/format chars — Drive accepts them but downstream tooling
// can render them deceptively. Constructed via RegExp(string) so the source
// file contains only ASCII-safe \uXXXX escapes, satisfying no-irregular-
// whitespace and avoiding accidental copy-paste of zero-width chars.
const BIDI_RE = new RegExp(
  '[\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]',
  'g'
);

function sanitizeDriveFilename(name) {
  const cleaned = (typeof name === 'string' ? name : '')
    .replace(/[/\\]/g, '')
    .split('\x00').join('')
    .replace(BIDI_RE, '')
    // Strip " and ; — both can break out of Content-Disposition: attachment;
    // filename="…" if echoed via the export-docx route.
    .replace(/["';]/g, '')
    .trim()
    .slice(0, 255);
  return cleaned || 'ogOCR_Document.txt';
}

// Path-segment sanitizer for Drive subfolder names. Slashes are the path
// separator so they're stripped at the segment level instead of joined
// (sanitizeDriveFilename strips them too — done explicitly here to keep the
// folder/file split obvious to a reader).
function sanitizeFolderSegment(segment) {
  return (typeof segment === 'string' ? segment : '')
    .replace(/[/\\]/g, '')
    .split('\x00').join('')
    .replace(BIDI_RE, '')
    .trim()
    .slice(0, 255);
}

// Split user-supplied `folderPath` (e.g. "work/2026" or "work\\2026") into
// validated, sanitized segments. Returns [] for falsy/empty input or if every
// segment is invalid — the caller treats that as "no subpath, use root folder".
function parseFolderPath(folderPath) {
  if (typeof folderPath !== 'string' || !folderPath.trim()) return [];
  return folderPath
    .split(/[/\\]+/)
    .map(sanitizeFolderSegment)
    .filter(Boolean)
    .slice(0, 8); // hard cap to avoid runaway directory creation
}

// Escape single quotes in a Drive query value. Today DRIVE_FOLDER_NAME is a
// constant, but if it ever becomes user-supplied we already handle it.
function escapeDriveQ(value) {
  return String(value).replace(/'/g, "\\'");
}

function mimeForFilename(name) {
  if (/\.svg$/i.test(name)) return 'image/svg+xml';
  if (/\.md$/i.test(name)) return 'text/markdown';
  return 'text/plain';
}

// Memoized lookup-or-create for the "ogOCR" Drive folder. The promise is
// shared across concurrent first-saves so they don't race into creating
// duplicate folders. trashed=false means a manually-trashed folder leads
// to creating a fresh one rather than writing into the trash.
function getOrCreateOgFolder() {
  if (folderIdPromise) return folderIdPromise;
  folderIdPromise = (async () => {
    const list = await driveClient.files.list({
      q: `name='${escapeDriveQ(DRIVE_FOLDER_NAME)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      spaces: 'drive',
      fields: 'files(id)',
      pageSize: 1,
    });
    if (list.data.files?.length) return list.data.files[0].id;
    const created = await driveClient.files.create({
      requestBody: { name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
      fields: 'id',
    });
    return created.data.id;
  })().catch((err) => {
    folderIdPromise = null; // allow retry on next call
    throw err;
  });
  return folderIdPromise;
}

// Walk a sequence of folder segments below `parentId`, looking up each
// segment by name (escaped) and creating it if missing. Returns the leaf
// folder id. Each segment is sanitized by the caller (parseFolderPath).
// Not memoized — folders are user-supplied and the savings would be small
// versus the risk of stale cache after a manual Drive delete.
async function getOrCreateChildFolder(parentId, name) {
  const list = await driveClient.files.list({
    q: `'${escapeDriveQ(parentId)}' in parents and name='${escapeDriveQ(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    spaces: 'drive',
    fields: 'files(id)',
    pageSize: 1,
  });
  if (list.data.files?.length) return list.data.files[0].id;
  const created = await driveClient.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  });
  return created.data.id;
}

// Resolve the leaf folder id for `segments`, creating any missing folders
// inside the ogOCR root. Empty `segments` returns the ogOCR root id (preserves
// the existing single-folder behavior).
async function resolveDriveFolder(segments) {
  let parentId = await getOrCreateOgFolder();
  for (const seg of segments) {
    parentId = await getOrCreateChildFolder(parentId, seg);
  }
  return parentId;
}

app.post('/api/extract', ocrLimiter, uploadSemaphore, uploadArray.any(), async (req, res) => {
  try {
    const file = pickUploadedFile(req);
    const { prompt } = req.body;

    if (!file) return sendError(res, 'CAP_NO_FILE');
    if (file.size === 0) return sendError(res, 'CAP_NO_FILE', { message: 'File is empty.' });
    if (!isAllowedInputMime(file.mimetype)) {
      return sendError(res, 'CAP_BAD_MIME', { message: 'Unsupported file type — upload an image or PDF.' });
    }
    if (prompt !== undefined && typeof prompt !== 'string') {
      return sendError(res, 'OCR_BAD_PROMPT', { message: 'Prompt must be a string.' });
    }
    if (typeof prompt === 'string' && prompt.length > MAX_PROMPT_CHARS) {
      return sendError(res, 'OCR_BAD_PROMPT', { message: `Prompt too long (max ${MAX_PROMPT_CHARS} chars).` });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const userPrompt = prompt || "Extract the text from this image perfectly, maintaining formatting.";

    const result = await generateContentFromUpload(model, userPrompt, file);
    const text = (await result.response).text();

    res.json({ text });
  } catch (error) {
    console.error("Gemini API Error:", error);
    sendModelError(res, error, 'Failed to process file');
  }
});

const EMAIL_TIMEOUT_MS = 30_000;

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

    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await withTimeout(transporter.sendMail({
        from: process.env.SMTP_USER,
        to: email,
        subject: safeSubject,
        text,
      }), EMAIL_TIMEOUT_MS);
      res.json({ success: true, message: 'Email sent successfully!', mock: false });
    } else {
      console.log(`[MOCK EMAIL] To: ${email}\nSubject: ${safeSubject}\nBody: ${text.substring(0, 100)}...`);
      res.json({
        success: true,
        mock: true,
        message: '(Mock) Email recorded — set SMTP_USER and SMTP_PASS in .env to send real emails.',
      });
    }
  } catch (error) {
    console.error('Email Error:', error?.message || error);
    sendModelError(res, error, 'Failed to send email');
  }
});

app.post('/api/save-drive', async (req, res) => {
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const text = typeof body.text === 'string' ? body.text : '';
  const safeName = sanitizeDriveFilename(body.filename);
  // Optional folder path — empty array preserves the existing single-folder
  // behavior. Sanitized + capped here so the route handler stays the
  // canonical place to reason about Drive layout.
  const folderSegments = parseFolderPath(body.folderPath);
  const folderDisplay = folderSegments.length
    ? `${DRIVE_FOLDER_NAME}/${folderSegments.join('/')}`
    : DRIVE_FOLDER_NAME;

  if (!driveClient) {
    console.log(`[MOCK DRIVE] Saving ${safeName} to ${folderDisplay}...`);
    const timer = setTimeout(() => {
      res.json({
        success: true,
        mock: true,
        message: `(Mock) Saved ${safeName} to ${folderDisplay}. Run \`npm run bootstrap-drive\` to enable real Drive saves.`,
      });
    }, 1500);
    res.on('close', () => clearTimeout(timer));
    return;
  }

  try {
    const save = (async () => {
      const folderId = await resolveDriveFolder(folderSegments);
      const mimeType = mimeForFilename(safeName);
      const created = await driveClient.files.create({
        requestBody: { name: safeName, parents: [folderId] },
        // Wrap as a UTF-8 Buffer so multi-byte chars (CJK/emoji) get the
        // correct byte length if any middleware pre-computes Content-Length.
        media: { mimeType, body: Readable.from(Buffer.from(text, 'utf8')) },
        fields: 'id, webViewLink',
      });
      return created.data;
    })();

    const data = await withTimeout(save, DRIVE_TIMEOUT_MS);
    res.json({
      success: true,
      mock: false,
      message: `Saved ${safeName} to Drive (${folderDisplay})`,
      fileId: data.id,
      webViewLink: data.webViewLink,
      folderPath: folderSegments.join('/'),
    });
  } catch (error) {
    const status = error?.code || error?.response?.status;
    console.error('Drive save error:', error?.errors || error?.message || error);
    if (status === 401) return sendError(res, 'EXP_DRIVE_AUTH_EXPIRED');
    if (status === 403) return sendError(res, 'EXP_DRIVE_SCOPE_MISSING');
    if (error?.message === TIMEOUT_MARKER) return sendError(res, 'EXP_DRIVE_TIMEOUT');
    return sendError(res, 'EXP_DRIVE_GENERIC', { cause: error?.message || error });
  }
});

app.post('/api/classroom/draft', (req, res) => {
  const { filename = 'ogOCR_Classroom_Draft' } = (req.body && typeof req.body === 'object') ? req.body : {};
  console.log(`[MOCK CLASSROOM] Drafting assignment: ${filename}...`);
  const timer = setTimeout(() => {
    // Mock disclosure: emit a parallel `info` envelope keyed by registry code.
    // Client logic still reads `success: true` and proceeds, but it picks the
    // info envelope up first and routes it through showError so the toast
    // gets the registry's info-severity styling.
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
  }, 1500);
  // Use res.on('close', ...) — req.on('close') fires when express.json() finishes
  // parsing the body, which would clear the timer before the response sends.
  res.on('close', () => clearTimeout(timer));
});

// Multi-sketch helpers (Phase 15 — Multi-Sketch Detection).
// /api/sketch-to-svg is now polymorphic on `req.body.bbox`:
//   - no bbox → discovery mode: ask Gemini for every sketch in the doc.
//                Auto-vectorize if exactly 1 found (back-compat: returns {svg}).
//                Return {sketches:[...]} if 2+ found.
//   - bbox present → vectorize mode: crop (image) or prompt-hint (PDF) and
//                vectorize that one region. Returns {svg}.

const SKETCH_VECTORIZE_PROMPT = `You are an expert graphic designer and educator. Convert the sketched teaching diagram into a clean, professional, black-and-white textbook-style vector graphic.
Return ONLY valid raw SVG code.
Do NOT wrap it in markdown code blocks like \`\`\`svg.
Do NOT include any explanations or HTML outside the <svg> tag.`;

const SKETCH_DISCOVERY_PROMPT = `Identify every hand-drawn sketch, teaching diagram, free-body diagram, circuit, ray diagram, geometric figure, or graph in this document. Ignore photographs, printed figures, and pure text blocks.
Return a JSON array of objects. Each object MUST have:
- "description": short label (e.g., "free-body diagram of block on incline").
- "boundingBox": array of 4 numbers [ymin, xmin, ymax, xmax], normalized 0-1000.
- "page": 1-based page number (use 1 for single images).
If no sketches are present, return an empty array: [].`;

// Parse + validate a bbox string|array from req.body. Returns the array or null.
function parseSketchBbox(raw) {
  if (raw == null || raw === '') return null;
  let arr = raw;
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw); } catch { return null; }
  }
  if (!Array.isArray(arr) || arr.length !== 4) return null;
  if (!arr.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1000)) return null;
  if (arr[2] <= arr[0] || arr[3] <= arr[1]) return null;
  return arr;
}

function parseSketchPage(raw) {
  if (raw == null || raw === '') return 1;
  const n = typeof raw === 'string' ? Number(raw) : raw;
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

// Crop an image buffer to a bbox (normalized 0-1000). Returns a new file-like
// object suitable for generateContentFromUpload, or the original file if
// cropping isn't applicable / fails.
async function cropImageFileToBbox(file, bbox) {
  if (!file?.mimetype?.startsWith('image/')) return file;
  try {
    const meta = await sharp(file.buffer).metadata();
    const { width, height } = meta;
    if (!width || !height) return file;
    const ymin = bbox[0] / 1000, xmin = bbox[1] / 1000, ymax = bbox[2] / 1000, xmax = bbox[3] / 1000;
    const left = Math.max(0, Math.floor(xmin * width));
    const top = Math.max(0, Math.floor(ymin * height));
    const extractWidth = Math.min(width - left, Math.floor((xmax - xmin) * width));
    const extractHeight = Math.min(height - top, Math.floor((ymax - ymin) * height));
    if (extractWidth <= 0 || extractHeight <= 0) return file;
    const cropped = await sharp(file.buffer)
      .extract({ left, top, width: extractWidth, height: extractHeight })
      .png()
      .toBuffer();
    return {
      ...file,
      buffer: cropped,
      mimetype: 'image/png',
      size: cropped.length,
      originalname: (file.originalname || 'sketch') + '.crop.png',
    };
  } catch (err) {
    console.error('[sketch] crop failed, falling back to full image:', err.message);
    return file;
  }
}

// Vectorize a single sketch (the existing single-sketch path, generalized to
// accept an optional bbox). Returns the cleaned SVG string.
async function vectorizeSingleSketch(file, bbox, page) {
  const proModel = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
  let workingFile = file;
  let prompt = SKETCH_VECTORIZE_PROMPT;
  if (bbox) {
    if (file.mimetype.startsWith('image/')) {
      workingFile = await cropImageFileToBbox(file, bbox);
    } else {
      prompt = `${SKETCH_VECTORIZE_PROMPT}\n\nFocus on the sketch on page ${page} within the bounding box [${bbox.join(', ')}] (normalized 0-1000, [ymin, xmin, ymax, xmax]). Vectorize ONLY that sketch — ignore everything else.`;
    }
  }
  const result = await generateContentFromUpload(proModel, prompt, workingFile);
  const raw = (await result.response).text();
  return raw.replace(/^```svg\n?/, '').replace(/\n?```$/, '').trim();
}

app.post('/api/sketch-to-svg', ocrLimiter, uploadSemaphore, uploadArray.any(), async (req, res) => {
  try {
    const file = pickUploadedFile(req);
    if (!file) return sendError(res, 'CAP_NO_FILE');
    if (file.size === 0) return sendError(res, 'CAP_NO_FILE', { message: 'File is empty.' });
    if (!isAllowedInputMime(file.mimetype)) {
      return sendError(res, 'CAP_BAD_MIME', { message: 'Unsupported file type — upload an image or PDF.' });
    }

    // Vectorize mode: caller passed bbox (and optionally page). Crop & vectorize.
    if (req.body && (req.body.bbox != null && req.body.bbox !== '')) {
      const bbox = parseSketchBbox(req.body.bbox);
      if (!bbox) return sendError(res, 'OCR_SKETCH_BBOX_INVALID');
      const page = parseSketchPage(req.body.page);
      const svg = await vectorizeSingleSketch(file, bbox, page);
      return res.json({ svg });
    }

    // Discovery mode: ask Gemini for every sketch in the doc.
    const detectModel = genAI.getGenerativeModel({
      model: 'gemini-2.5-pro',
      generationConfig: { responseMimeType: 'application/json' },
    });
    const detectResult = await generateContentFromUpload(detectModel, SKETCH_DISCOVERY_PROMPT, file);
    let detectJson = (await detectResult.response).text();
    detectJson = detectJson.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();

    let rawList;
    try { rawList = JSON.parse(detectJson); }
    catch {
      console.error('[sketch] discovery JSON parse failed. First 200 chars:', detectJson.substring(0, 200));
      return sendError(res, 'OCR_MALFORMED_JSON');
    }
    if (!Array.isArray(rawList)) {
      console.error('[sketch] discovery did not return an array, got:', typeof rawList);
      return sendError(res, 'OCR_MALFORMED_JSON', { message: 'Model did not return an array.' });
    }

    const candidates = rawList.filter(b =>
      b && typeof b.description === 'string' &&
      Array.isArray(b.boundingBox) && b.boundingBox.length === 4 &&
      b.boundingBox.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1000) &&
      b.boundingBox[2] > b.boundingBox[0] &&
      b.boundingBox[3] > b.boundingBox[1]
    );

    if (candidates.length === 0) return sendError(res, 'OCR_NO_SKETCH_FOUND');

    // Back-compat: exactly one sketch → auto-vectorize, return {svg} just like
    // the legacy single-sketch flow. UX unchanged for single-sketch documents.
    if (candidates.length === 1) {
      const c = candidates[0];
      const page = Number.isFinite(c.page) && c.page >= 1 ? Math.floor(c.page) : 1;
      const svg = await vectorizeSingleSketch(file, c.boundingBox, page);
      return res.json({ svg });
    }

    // Multi-sketch path: build the picker payload. For images, attach a
    // server-side cropped PNG thumbnail; for PDFs, no thumbnail (per-page
    // rasterization is Phase 2 — see CLAUDE.md outstanding issues).
    const sketches = [];
    if (file.mimetype.startsWith('image/')) {
      const meta = await sharp(file.buffer).metadata();
      const { width, height } = meta;
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const bbox = c.boundingBox;
        const page = Number.isFinite(c.page) && c.page >= 1 ? Math.floor(c.page) : 1;
        let thumbnail = null;
        try {
          if (width && height) {
            const ymin = bbox[0] / 1000, xmin = bbox[1] / 1000, ymax = bbox[2] / 1000, xmax = bbox[3] / 1000;
            const left = Math.max(0, Math.floor(xmin * width));
            const top = Math.max(0, Math.floor(ymin * height));
            const extractWidth = Math.min(width - left, Math.floor((xmax - xmin) * width));
            const extractHeight = Math.min(height - top, Math.floor((ymax - ymin) * height));
            if (extractWidth > 0 && extractHeight > 0) {
              const cropped = await sharp(file.buffer)
                .extract({ left, top, width: extractWidth, height: extractHeight })
                .resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true })
                .png()
                .toBuffer();
              thumbnail = `data:image/png;base64,${cropped.toString('base64')}`;
            }
          }
        } catch (cropErr) {
          console.warn(`[sketch] thumbnail ${i + 1} failed:`, cropErr.message);
        }
        sketches.push({
          id: i + 1,
          description: c.description,
          bbox,
          page,
          thumbnail,
        });
      }
    } else {
      // PDF: no per-page rasterization yet. Picker shows description + bbox
      // tag + page number; user clicks Vectorize and the bbox-aware vectorize
      // call returns an SVG.
      candidates.forEach((c, i) => {
        const page = Number.isFinite(c.page) && c.page >= 1 ? Math.floor(c.page) : 1;
        sketches.push({
          id: i + 1,
          description: c.description,
          bbox: c.boundingBox,
          page,
          thumbnail: null,
        });
      });
    }

    res.json({ sketches, message: `Found ${sketches.length} sketches.` });
  } catch (error) {
    console.error('Sketch to SVG Error:', error);
    sendModelError(res, error, 'Failed to convert sketch to SVG');
  }
});

// Word export via Pandoc. Detect-and-mock: if `pandoc` was missing at boot
// the route returns an EXP_DOCX_NO_BINARY envelope; otherwise it spawns
// pandoc with no shell interpolation, writes input to a randomly-named
// temp file, and streams the resulting .docx back. Cleanup happens in a
// try/finally regardless of outcome.
app.post('/api/export-docx', async (req, res) => {
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const markdown = typeof body.markdown === 'string' ? body.markdown : '';
  const safeName = sanitizeDriveFilename(body.filename || 'compile.docx');

  if (!markdown.trim()) {
    return sendError(res, 'OCR_BAD_PROMPT', { message: 'Markdown body is required.' });
  }
  if (Buffer.byteLength(markdown, 'utf8') > DOCX_MAX_MARKDOWN_BYTES) {
    return sendError(res, 'EXP_DOCX_TOO_LARGE');
  }

  if (!PANDOC_AVAILABLE) {
    return sendError(res, 'EXP_DOCX_NO_BINARY');
  }

  const suffix = crypto.randomBytes(8).toString('hex');
  const tempIn = path.join(os.tmpdir(), `ogocr-docx-${suffix}.md`);
  const tempOut = path.join(os.tmpdir(), `ogocr-docx-${suffix}.docx`);

  try {
    await fsp.writeFile(tempIn, markdown, 'utf8');

    const run = new Promise((resolve, reject) => {
      const child = spawn(
        'pandoc',
        [tempIn, '-f', 'markdown+tex_math_dollars+raw_html', '-t', 'docx', '-o', tempOut],
        { shell: false }
      );
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      child.on('error', (err) => reject(err));
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`pandoc exit ${code}: ${stderr.trim() || 'no stderr'}`));
      });
    });

    await withTimeout(run, DOCX_TIMEOUT_MS);

    const buffer = await fsp.readFile(tempOut);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Content-Length', String(buffer.length));
    return res.end(buffer);
  } catch (err) {
    if (err?.message === TIMEOUT_MARKER) {
      return sendError(res, 'EXP_DOCX_TIMEOUT');
    }
    console.error('[pandoc] export failed:', err?.message || err);
    return sendError(res, 'EXP_DOCX_PANDOC_FAIL', { cause: err?.message || err });
  } finally {
    // Best-effort cleanup. Errors (file not yet created) are silent.
    fsp.unlink(tempIn).catch(() => {});
    fsp.unlink(tempOut).catch(() => {});
  }
});

// Status: lets the client paint a "MOCK · email,classroom" pill in the top
// bar so the user knows which I/O paths are real vs. mocked. Cheap and safe
// to call repeatedly — read-only, derived from process.env.
app.get('/api/_status', (_req, res) => {
  const driveReal = DRIVE_ENV_KEYS.every(k => !!process.env[k]);
  const emailReal = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
  res.json({
    gemini: process.env.GEMINI_API_KEY ? 'real' : 'missing',
    email: emailReal ? 'real' : 'mock',
    drive: driveReal ? 'real' : 'mock',
    classroom: 'mock',
    docx: PANDOC_AVAILABLE ? 'real' : 'mock',
    auth: process.env.OG_API_TOKEN ? 'token' : 'open',
    serverTime: Date.now(),
  });
});

// Production hosting: serve the Vite-built bundle so `npm start` runs the
// full app on a single port. In dev (`npm run dev`) Vite owns the frontend,
// so the dist/ folder may be stale or absent — that's fine, this branch
// only kicks in for paths express didn't already match.
app.use(express.static(DIST_DIR));
app.get(/^(?!\/api(?:\/|$)).*/, (_req, res, next) => {
  res.sendFile(DIST_INDEX, (error) => {
    if (error) next(error);
  });
});

// Multer / unhandled error middleware (must be last)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return sendError(res, 'CAP_FILE_TOO_LARGE', { message: `File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MiB).` });
    }
    return sendError(res, 'CAP_NO_FILE', { message: `Upload error: ${err.code}.` });
  }
  console.error('Unhandled error:', err);
  return sendError(res, 'OCR_INTERNAL', { cause: err?.stack || err?.message || err });
});

function getLanUrls(p) {
  const urls = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] || []) {
      if (info.family === 'IPv4' && !info.internal) {
        urls.push(`http://${info.address}:${p}`);
      }
    }
  }
  return urls;
}

// Bind 0.0.0.0 so the API is reachable from other devices on the LAN
// (the user reviews from a phone). CORS above gates non-LAN origins.
const server = app.listen(port, '0.0.0.0', () => {
  console.log('ogOCR API listening:');
  console.log(`  Local:    http://localhost:${port}`);
  for (const url of getLanUrls(port)) {
    console.log(`  Network:  ${url}`);
  }
});

// Surface EADDRINUSE loudly. On Windows, leftover node.exe children from a
// previous `npm run dev` hold the port and the next boot would otherwise
// silently exit code 0 while concurrently kept Vite alive — every /api/*
// fetch then hangs forever. Exit non-zero so the user sees the failure.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Stop the other process (Windows: \`taskkill //F //IM node.exe\`) and try again.`);
  } else {
    console.error('Failed to start ogOCR API:', err.message);
  }
  process.exit(1);
});
