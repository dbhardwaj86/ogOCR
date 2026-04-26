import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import sharp from 'sharp';
import os from 'os';
import { Readable } from 'node:stream';

dotenv.config({ path: new URL('../.env', import.meta.url) });

if (!process.env.GEMINI_API_KEY) {
  console.error('FATAL: GEMINI_API_KEY is not set. Copy .env.example to .env and fill in your key.');
  process.exit(1);
}

const app = express();
const port = 3001;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_PROMPT_CHARS = 2000;
const GEMINI_TIMEOUT_MS = 600_000;
const TIMEOUT_MARKER = 'Gemini request timed out';
const ALLOWED_EXTRACT_IMAGES_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
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
app.use((req, _res, next) => {
  const ua = (req.headers['user-agent'] || '').slice(0, 80);
  console.log(`[req] ${req.method} ${req.path} ← origin=${req.headers.origin || '-'} ua="${ua}"`);
  next();
});

app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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

function withTimeout(promise, ms = GEMINI_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(TIMEOUT_MARKER)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function sendModelError(res, error, fallback) {
  if (error?.message === TIMEOUT_MARKER) {
    return res.status(504).json({
      error: `Gemini took longer than ${GEMINI_TIMEOUT_MS / 1000}s. Try a smaller file or fewer pages.`,
    });
  }
  return res.status(500).json({ error: fallback });
}

function sanitizeDriveFilename(name) {
  const cleaned = (typeof name === 'string' ? name : '')
    .replace(/[/\\]/g, '')
    .split('\x00').join('')
    .trim()
    .slice(0, 255);
  return cleaned || 'ogOCR_Document.txt';
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
      q: `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
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

app.post('/api/extract', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const { prompt } = req.body;

    if (!file) return res.status(400).json({ error: 'No file provided' });
    if (prompt !== undefined && typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt must be a string' });
    }
    if (typeof prompt === 'string' && prompt.length > MAX_PROMPT_CHARS) {
      return res.status(400).json({ error: `Prompt too long (max ${MAX_PROMPT_CHARS} chars)` });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const imageParts = [{ inlineData: { data: file.buffer.toString("base64"), mimeType: file.mimetype } }];
    const userPrompt = prompt || "Extract the text from this image perfectly, maintaining formatting.";

    const result = await withTimeout(model.generateContent([userPrompt, ...imageParts]));
    const text = (await result.response).text();

    res.json({ text });
  } catch (error) {
    console.error("Gemini API Error:", error);
    sendModelError(res, error, 'Failed to process file');
  }
});

app.post('/api/email', async (req, res) => {
  try {
    const { email, text = '', subject } = req.body;

    if (typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    const safeSubject = (typeof subject === 'string' ? subject : 'ogOCR Extracted Document')
      .replace(/[\r\n]/g, ' ')
      .slice(0, 200);

    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: email,
        subject: safeSubject,
        text
      });
      res.json({ success: true, message: "Email sent successfully!" });
    } else {
      console.log(`[MOCK EMAIL] To: ${email}\nSubject: ${safeSubject}\nBody: ${text.substring(0, 100)}...`);
      res.json({ success: true, message: "Email mock sent! Configure SMTP_USER and SMTP_PASS in .env for real emails." });
    }
  } catch (error) {
    console.error("Email Error:", error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

app.post('/api/save-drive', async (req, res) => {
  const { text = '', filename } = req.body || {};
  const safeName = sanitizeDriveFilename(filename);

  if (!driveClient) {
    console.log(`[MOCK DRIVE] Saving ${safeName} to Drive...`);
    const timer = setTimeout(() => {
      res.json({ success: true, message: `Successfully saved ${safeName} to Google Drive (Mock)!` });
    }, 1500);
    res.on('close', () => clearTimeout(timer));
    return;
  }

  try {
    const save = (async () => {
      const folderId = await getOrCreateOgFolder();
      const mimeType = mimeForFilename(safeName);
      const created = await driveClient.files.create({
        requestBody: { name: safeName, parents: [folderId] },
        media: { mimeType, body: Readable.from(typeof text === 'string' ? text : '') },
        fields: 'id, webViewLink',
      });
      return created.data;
    })();

    const data = await withTimeout(save, DRIVE_TIMEOUT_MS);
    res.json({
      success: true,
      message: `Saved ${safeName} to Drive`,
      fileId: data.id,
      webViewLink: data.webViewLink,
    });
  } catch (error) {
    const status = error?.code || error?.response?.status;
    if (status === 401) {
      console.error('Drive auth expired:', error?.errors || error?.message || error);
      return res.status(401).json({ error: 'Drive auth expired — re-run scripts/bootstrap-drive.js' });
    }
    console.error('Drive save error:', error?.errors || error?.message || error);
    sendModelError(res, error, 'Drive save failed');
  }
});

app.post('/api/classroom/draft', (req, res) => {
  const { filename = "ogOCR_Classroom_Draft" } = req.body;
  console.log(`[MOCK CLASSROOM] Drafting assignment: ${filename}...`);
  const timer = setTimeout(() => {
    res.json({ success: true, message: `Successfully drafted ${filename} to Google Classroom (Mock)!` });
  }, 1500);
  req.on('close', () => clearTimeout(timer));
});

app.post('/api/sketch-to-svg', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file provided' });

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
    const imageParts = [{ inlineData: { data: file.buffer.toString("base64"), mimeType: file.mimetype } }];

    const prompt = `You are an expert graphic designer and educator. Examine all pages of the provided document. Find the sketched teaching diagram (no matter which page it is on) and convert it into a clean, professional, black-and-white textbook-style vector graphic.
    Return ONLY valid raw SVG code.
    Do NOT wrap it in markdown code blocks like \`\`\`svg.
    Do NOT include any explanations or HTML outside the <svg> tag.`;

    const result = await withTimeout(model.generateContent([prompt, ...imageParts]));
    let svgText = (await result.response).text();
    svgText = svgText.replace(/^```svg\n?/, '').replace(/\n?```$/, '').trim();

    res.json({ svg: svgText });
  } catch (error) {
    console.error("Sketch to SVG Error:", error);
    sendModelError(res, error, 'Failed to convert sketch to SVG');
  }
});

app.post('/api/extract-images', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file provided' });
    if (!ALLOWED_EXTRACT_IMAGES_MIMES.includes(file.mimetype)) {
      return res.status(400).json({ error: 'Unsupported file type for image extraction' });
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-pro",
      generationConfig: { responseMimeType: "application/json" }
    });

    const base64Data = file.buffer.toString("base64");
    const imageParts = [{ inlineData: { data: base64Data, mimeType: file.mimetype } }];

    const prompt = `Identify all distinct diagrams, charts, pictures, or major visual components in this document.
    Return a JSON array of objects. Each object must have:
    - "description": A short description of the image.
    - "boundingBox": An array of 4 numbers [ymin, xmin, ymax, xmax] representing the normalized bounding box coordinates where values are between 0 and 1000.`;

    const result = await withTimeout(model.generateContent([prompt, ...imageParts]));
    let jsonText = (await result.response).text();
    jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();

    let raw;
    try {
      raw = JSON.parse(jsonText);
    } catch {
      console.error("Failed to parse Gemini JSON. First 200 chars:", jsonText.substring(0, 200));
      return res.status(502).json({ error: 'Model returned malformed JSON' });
    }

    if (!Array.isArray(raw)) {
      console.error("Gemini did not return an array, got:", typeof raw);
      return res.status(502).json({ error: 'Model did not return an array' });
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
      const metadata = await sharp(file.buffer).metadata();
      const { width, height } = metadata;

      for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i].boundingBox;
        const ymin = box[0] / 1000;
        const xmin = box[1] / 1000;
        const ymax = box[2] / 1000;
        const xmax = box[3] / 1000;

        const left = Math.max(0, Math.floor(xmin * width));
        const top = Math.max(0, Math.floor(ymin * height));
        const extractWidth = Math.min(width - left, Math.floor((xmax - xmin) * width));
        const extractHeight = Math.min(height - top, Math.floor((ymax - ymin) * height));

        if (extractWidth > 0 && extractHeight > 0) {
          try {
            const croppedBuffer = await sharp(file.buffer)
              .extract({ left, top, width: extractWidth, height: extractHeight })
              .png()
              .toBuffer();

            extractedImages.push({
              id: i + 1,
              desc: boxes[i].description,
              data: `data:image/png;base64,${croppedBuffer.toString('base64')}`
            });
          } catch (cropErr) {
            console.error(`Crop ${i + 1} failed:`, cropErr.message);
          }
        }
      }
    } else {
      // PDF: descriptions only — no per-page rasterization yet.
      boxes.forEach((box, i) => {
        extractedImages.push({
          id: i + 1,
          desc: box.description + ` (Bounding Box: ${box.boundingBox.join(', ')})`,
          data: null
        });
      });
    }

    res.json({ success: true, images: extractedImages, message: `Found ${boxes.length} visual components.` });
  } catch (error) {
    console.error("Extract Images Error:", error);
    sendModelError(res, error, 'Failed to extract images');
  }
});

// Multer / unhandled error middleware (must be last)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MiB)` });
    }
    return res.status(400).json({ error: `Upload error: ${err.code}` });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
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
app.listen(port, '0.0.0.0', () => {
  console.log('ogOCR API listening:');
  console.log(`  Local:    http://localhost:${port}`);
  for (const url of getLanUrls(port)) {
    console.log(`  Network:  ${url}`);
  }
});
