// Server-side error registry. Subset of src/errors/codes.js — only codes the
// server actually emits. Keep code strings identical to the client registry;
// adding a new server-emitted code requires a matching client entry.

export const ERRORS = Object.freeze({
  CAP_FILE_TOO_LARGE: { http: 413, message: 'File too large.', hint: 'Use a smaller image or split the PDF.' },
  CAP_BAD_MIME: { http: 415, message: 'Unsupported file type.', hint: 'Use a JPG, PNG, WEBP, or PDF.' },
  CAP_NO_FILE: { http: 400, message: 'No file provided.', hint: 'Try the upload again.' },

  OCR_NO_KEY: { http: 500, message: 'Server not configured for OCR.', hint: 'GEMINI_API_KEY missing.' },
  OCR_BAD_KEY: { http: 500, message: 'OCR key was rejected.', hint: 'Rotate GEMINI_API_KEY in .env.' },
  OCR_QUOTA: { http: 429, message: 'OCR rate limit reached.', hint: 'Wait a minute and retry.' },
  OCR_TIMEOUT: { http: 504, message: 'OCR took too long.', hint: 'Try a smaller file or fewer pages.' },
  OCR_MALFORMED_JSON: { http: 502, message: 'Model returned malformed JSON.', hint: 'Tap Retry.' },
  OCR_INTERNAL: { http: 500, message: 'Internal server error.', hint: 'Tap Retry.' },
  OCR_BAD_PROMPT: { http: 400, message: 'Prompt is invalid.', hint: 'Try a shorter prompt.' },
  OCR_SAFETY_BLOCK: { http: 400, message: 'Content was blocked by safety filters.', hint: 'Try cropping to just the text.' },
  OCR_NO_SKETCH_FOUND: { http: 404, message: 'No sketches detected in this document.', hint: 'Try a clearer scan or upload a region that contains a hand-drawn diagram.' },
  OCR_SKETCH_BBOX_INVALID: { http: 400, message: 'Bad sketch region.', hint: 'Refresh the page and try selecting the sketch again.' },

  EXP_EMAIL_BAD_RECIPIENT: { http: 400, message: 'Invalid email address.', hint: 'Check the spelling.' },
  EXP_EMAIL_NETWORK: { http: 502, message: 'Email server unreachable.', hint: 'Try again in a moment.' },
  EXP_EMAIL_SMTP_AUTH: { http: 502, message: 'Email server rejected our credentials.', hint: 'Update SMTP_USER / SMTP_PASS in .env.' },
  EXP_EMAIL_TIMEOUT: { http: 504, message: 'Email server is slow.', hint: 'Try again or save locally.' },

  EXP_DRIVE_AUTH_EXPIRED: { http: 401, message: 'Drive auth expired.', hint: 'Run `npm run bootstrap-drive`.' },
  EXP_DRIVE_SCOPE_MISSING: { http: 403, message: 'Drive permission insufficient.', hint: 'Re-bootstrap Drive — scope changed.' },
  EXP_DRIVE_QUOTA: { http: 507, message: 'Drive storage full.', hint: 'Free up space or save locally.' },
  EXP_DRIVE_TIMEOUT: { http: 504, message: 'Drive is slow today.', hint: 'Retry, or save as MD.' },
  EXP_DRIVE_GENERIC: { http: 502, message: "Drive save didn't go through.", hint: 'Retry — Drive might be having a moment.' },

  EXP_DOCX_NO_BINARY: { http: 503, message: 'Word export is in mock mode.', hint: 'Install pandoc on the server to enable real Word export.' },
  EXP_DOCX_TIMEOUT: { http: 504, message: 'Word export is taking too long.', hint: 'Try a smaller compile or fewer pages.' },
  EXP_DOCX_PANDOC_FAIL: { http: 502, message: 'Word export failed.', hint: 'Check the server log for the pandoc error.' },
  EXP_DOCX_TOO_LARGE: { http: 413, message: 'This compile is too large for Word export.', hint: 'Split the content into smaller compiles.' },

  AUTH_REQUIRED: { http: 401, message: 'API token required.', hint: 'Send X-OG-Token header (set OG_API_TOKEN in .env).' },
  AUTH_INVALID: { http: 403, message: 'API token invalid.', hint: 'Check X-OG-Token header against .env.' },
  RATE_LIMITED: { http: 429, message: 'Too many requests.', hint: 'Slow down and try again.' },
});

export function getError(code) {
  return ERRORS[code] || ERRORS.OCR_INTERNAL;
}
