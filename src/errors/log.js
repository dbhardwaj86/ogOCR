// Diagnostics ring buffer + tiny pubsub. Last 5 logged errors keep enough
// breadcrumbs for support tickets without exploding into a backlog.

const MAX = 5;
const buffer = [];
const listeners = new Set();

function notify() {
  const snapshot = buffer.slice();
  for (const fn of listeners) fn(snapshot);
}

export function logError(entry) {
  const ts = Date.now();
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  const url = typeof location !== 'undefined' ? location.href : '';
  buffer.unshift({ ...entry, ts, ua, url });
  if (buffer.length > MAX) buffer.length = MAX;
  notify();
}

export function getLog() {
  return buffer.slice();
}

export function clearLog() {
  buffer.length = 0;
  notify();
}

export function subscribeLog(fn) {
  listeners.add(fn);
  fn(buffer.slice());
  return () => listeners.delete(fn);
}

export function copyLogText() {
  const lines = buffer.map((e) => {
    const dt = new Date(e.ts).toISOString();
    return `${dt} · ${e.code} · ${e.message}${e.hint ? ` — ${e.hint}` : ''}`;
  });
  lines.push('---');
  lines.push(`UA: ${buffer[0]?.ua || ''}`);
  lines.push(`URL: ${buffer[0]?.url || ''}`);
  return lines.join('\n');
}
