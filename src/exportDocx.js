// Client helper for the Word export flow. POSTs the markdown to
// /api/export-docx, reads the response as a blob, and triggers a download
// via a temporary <a download>. On non-2xx responses, parses the standard
// `{ error: { code, message, hint } }` envelope and routes through the
// registry's showError so the toast lands with the right severity.

import { showError } from './errors/showError';
import { errFromResponse, errFromException } from './errors/errFromResponse';

export async function exportDocx({ markdown, filename }) {
  if (typeof markdown !== 'string' || !markdown.trim()) {
    showError('EXP_GENERIC', { message: 'Nothing to export yet.' });
    return false;
  }
  const safeName = (typeof filename === 'string' && filename.trim())
    ? filename
    : 'compile.docx';

  let response;
  try {
    response = await fetch('/api/export-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown, filename: safeName }),
    });
  } catch (err) {
    const entry = errFromException(err, 'EXP_DOCX_PANDOC_FAIL');
    showError(entry.code, { message: entry.message, hint: entry.hint });
    return false;
  }

  if (!response.ok) {
    const entry = await errFromResponse(response, 'EXP_DOCX_PANDOC_FAIL');
    showError(entry.code, { message: entry.message, hint: entry.hint });
    return false;
  }

  let blob;
  try {
    blob = await response.blob();
  } catch (err) {
    const entry = errFromException(err, 'EXP_DOCX_PANDOC_FAIL');
    showError(entry.code, { message: entry.message, hint: entry.hint });
    return false;
  }

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return true;
}
