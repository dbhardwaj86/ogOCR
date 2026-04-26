// Map a fetch response (or thrown error) to a registry code, returning the
// canonical entry. Server emits `{ error: { code, message?, hint? } }`; this
// resolves the code and prefers server-supplied message overrides.

import { getError, formatMessage } from './codes';

export function codeFromHttpStatus(status) {
  // 401 used to default to EXP_DRIVE_AUTH_EXPIRED, which sent users hitting
  // the auth-token gate on /api/email or /api/extract to a "Run npm run
  // bootstrap-drive" dialog. The Drive route always supplies the code in
  // the body, so a bare-401 fallback is more honestly AUTH_REQUIRED.
  if (status === 401) return 'AUTH_REQUIRED';
  if (status === 403) return 'AUTH_INVALID';
  if (status === 413) return 'CAP_FILE_TOO_LARGE';
  if (status === 415) return 'CAP_BAD_MIME';
  if (status === 429) return 'OCR_QUOTA';
  if (status === 504) return 'OCR_TIMEOUT';
  if (status >= 500) return 'OCR_INTERNAL';
  return null;
}

export function codeFromException(err) {
  if (!err) return 'OCR_INTERNAL';
  if (err.name === 'AbortError') return 'OCR_ABORTED';
  if (err.name === 'TypeError' && /fetch/i.test(err.message)) return 'OCR_NO_NETWORK';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'CAP_OFFLINE';
  return null;
}

// Server response → registry entry (with overrides if server sent message/hint).
export async function errFromResponse(response, fallbackCode = 'OCR_INTERNAL') {
  let body = null;
  try { body = await response.clone().json(); } catch { /* non-JSON body */ }

  const serverErr = body?.error;
  const code = (serverErr && typeof serverErr === 'object' && serverErr.code)
    || codeFromHttpStatus(response.status)
    || fallbackCode;

  const overrides = {};
  if (serverErr && typeof serverErr === 'object') {
    if (serverErr.message) overrides.message = serverErr.message;
    if (serverErr.hint) overrides.hint = serverErr.hint;
  } else if (typeof serverErr === 'string') {
    overrides.message = serverErr;
  } else if (body?.message && response.status >= 400) {
    overrides.message = body.message;
  }
  return formatMessage(code, overrides);
}

// Thrown error (network / abort / offline) → registry entry.
export function errFromException(err, fallbackCode = 'OCR_INTERNAL') {
  const code = codeFromException(err) || fallbackCode;
  const e = getError(code);
  const overrides = err?.message && !e.hint ? { hint: err.message } : {};
  return formatMessage(code, overrides);
}
