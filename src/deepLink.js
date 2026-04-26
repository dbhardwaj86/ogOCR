// Deep-link parsing helpers. Kept pure so they can be unit-tested without a
// browser: every function takes the input it needs as an argument and returns
// a value — no implicit globals.
//
// Wire shape: `?session=<id>` on app boot. App.jsx reads it once, activates
// the matching session if it exists, then strips the param so a refresh
// doesn't re-activate.

/**
 * Pull the session id from a query string (with or without leading `?`).
 * Returns the trimmed id string, or null if the param is missing/blank.
 */
export function readSessionParam(search) {
  if (typeof search !== 'string' || search.length === 0) return null;
  // URLSearchParams accepts both '?a=b' and 'a=b'.
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const raw = params.get('session');
  if (raw == null) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Build the URL string that should appear in the address bar after the
 * deep-link is consumed — the `session` param removed, everything else
 * preserved.
 *
 * Inputs are passed in (location.pathname + location.search) instead of
 * read from `window` so this is testable.
 */
export function urlWithoutSessionParam(pathname, search) {
  if (typeof search !== 'string' || search.length === 0) return pathname || '';
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (!params.has('session')) return (pathname || '') + (search.startsWith('?') ? search : '?' + search);
  params.delete('session');
  const remaining = params.toString();
  return (pathname || '') + (remaining ? '?' + remaining : '');
}

/**
 * Resolve a session id from a list of sessions. Returns the id if a session
 * with that exact id exists, otherwise null. No fuzzy matching — deep-links
 * either resolve cleanly or silently no-op.
 */
export function resolveSessionId(sessions, candidateId) {
  if (!candidateId || !Array.isArray(sessions)) return null;
  return sessions.some(s => s && s.id === candidateId) ? candidateId : null;
}
