// Server helper: emit a `{ error: { code, message, hint } }` envelope with the
// matching HTTP status. Always logs the code + handler context for grep-ability
// in the dev console. Optional `cause` is a stringified Error or message.

import { getError } from './errors.js';

export function sendError(res, code, overrides = {}) {
  const def = getError(code);
  const status = overrides.http || def.http || 500;
  const message = overrides.message || def.message;
  const hint = overrides.hint ?? def.hint ?? null;
  if (overrides.cause) {
    console.error(`[error ${code}] ${overrides.cause}`);
  }
  return res.status(status).json({ error: { code, message, hint } });
}

// Map a thrown exception (Gemini SDK / Drive / nodemailer / generic) to a code.
// Heuristic — keep narrow so additions are explicit.
export function codeFromException(err) {
  if (!err) return 'OCR_INTERNAL';
  const message = (err?.message || '').toLowerCase();
  const status = err?.code || err?.status || err?.response?.status;

  if (err?.message === 'Gemini request timed out') return 'OCR_TIMEOUT';
  if (status === 401) return 'EXP_DRIVE_AUTH_EXPIRED';
  if (status === 403) return 'EXP_DRIVE_SCOPE_MISSING';
  if (status === 429 || /rate|quota|too many/i.test(message)) return 'OCR_QUOTA';
  if (status === 413) return 'CAP_FILE_TOO_LARGE';
  if (/api[_ -]?key/i.test(message) && /(invalid|reject)/i.test(message)) return 'OCR_BAD_KEY';
  if (/safety|blocked/i.test(message)) return 'OCR_SAFETY_BLOCK';
  if (/eauth/i.test(err?.code || '') || /authentication failed/i.test(message)) return 'EXP_EMAIL_SMTP_AUTH';
  if (/etimedout|esockettimedout/i.test(err?.code || '')) return 'EXP_EMAIL_TIMEOUT';
  if (/econnrefused|enotfound|enetunreach/i.test(err?.code || '')) return 'EXP_EMAIL_NETWORK';
  return 'OCR_INTERNAL';
}
