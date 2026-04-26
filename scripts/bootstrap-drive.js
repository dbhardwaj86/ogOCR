// One-time OAuth bootstrap for Google Drive integration.
//
// Reads GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET from .env, walks the user
// through Google's installed-app consent flow on a 127.0.0.1 loopback,
// then writes GOOGLE_REFRESH_TOKEN back into .env. After this runs once,
// `npm run dev` will use the stored refresh token for /api/save-drive.

import dotenv from 'dotenv';
import express from 'express';
import { google } from 'googleapis';
import { exec } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ENV_URL = new URL('../.env', import.meta.url);
const ENV_PATH = fileURLToPath(ENV_URL);
const PORT = 3002;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`;
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TIMEOUT_MS = 5 * 60 * 1000;

dotenv.config({ path: ENV_URL });

function fail(msg) {
  console.error(`\n[bootstrap-drive] ${msg}\n`);
  process.exit(1);
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
            : process.platform === 'darwin' ? `open "${url}"`
            : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) {
      console.log(`\nCouldn't auto-open the browser. Open this URL manually:\n${url}\n`);
    }
  });
}

async function upsertEnvKey(key, value) {
  let body;
  try {
    body = await readFile(ENV_PATH, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    body = '';
  }
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  const next = re.test(body)
    ? body.replace(re, line)
    : (body.endsWith('\n') || body === '' ? body + line + '\n' : body + '\n' + line + '\n');
  await writeFile(ENV_PATH, next, 'utf8');
}

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  fail([
    'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env first.',
    '',
    'Setup steps:',
    '  1. Go to https://console.cloud.google.com/apis/credentials',
    '  2. "Create credentials" → "OAuth client ID" → application type "Desktop app".',
    '  3. Copy the client ID and client secret into .env at the repo root.',
    '  4. Re-run `npm run bootstrap-drive`.',
  ].join('\n'));
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
const state = randomBytes(16).toString('hex');
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPE,
  state,
});

const app = express();
let server;
let timer;

const shutdown = (code) => {
  if (timer) clearTimeout(timer);
  if (server) server.close(() => process.exit(code));
  else process.exit(code);
};

app.get('/oauth2callback', async (req, res) => {
  if (req.query.error) {
    res.status(400).send(`<h1>Authorization denied</h1><p>${String(req.query.error)}</p>`);
    console.error(`[bootstrap-drive] Google returned an error: ${req.query.error}`);
    return shutdown(1);
  }
  if (req.query.state !== state) {
    res.status(400).send('<h1>State mismatch</h1>');
    console.error('[bootstrap-drive] State mismatch — possible CSRF; aborting.');
    return shutdown(1);
  }
  const code = req.query.code;
  if (!code) {
    res.status(400).send('<h1>No code returned</h1>');
    return shutdown(1);
  }
  try {
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      res.status(500).send('<h1>No refresh token returned</h1><p>Revoke prior consent at https://myaccount.google.com/permissions and try again.</p>');
      console.error('[bootstrap-drive] Google did not return a refresh_token. Revoke prior consent and re-run.');
      return shutdown(1);
    }
    await upsertEnvKey('GOOGLE_REFRESH_TOKEN', tokens.refresh_token);
    res.send('<h1>Drive connected.</h1><p>You can close this tab and return to the terminal.</p>');
    console.log('\n[bootstrap-drive] Refresh token written to .env. You can now run `npm run dev`.\n');
    return shutdown(0);
  } catch (err) {
    res.status(500).send('<h1>Token exchange failed</h1>');
    console.error('[bootstrap-drive] Token exchange failed:', err.message || err);
    return shutdown(1);
  }
});

server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n[bootstrap-drive] Listening on ${REDIRECT_URI}`);
  console.log('[bootstrap-drive] Opening browser for Google consent…');
  openBrowser(authUrl);
});

timer = setTimeout(() => {
  console.error(`\n[bootstrap-drive] Timed out after ${TIMEOUT_MS / 1000}s. Re-run when ready.`);
  shutdown(1);
}, TIMEOUT_MS);
