// Dispatch a registry error to the right surface. The actual UI sinks
// (toast, inline banner, modal) are wired up by App.jsx via `installErrorSinks`.
// Keeping the registry behavior decoupled from React state lets the same
// `showError` work from anywhere — fetch helpers, async handlers, even
// window.unhandledrejection.

import { formatMessage, SURFACE } from './codes';
import { logError } from './log';

let sinks = {
  toast: null,
  inline: null,
  modal: null,
  overlay: null,
};

export function installErrorSinks(next) {
  sinks = { ...sinks, ...next };
}

export function showError(code, overrides = {}) {
  const entry = formatMessage(code, overrides);
  if (entry.log !== false) logError(entry);

  // The caller can override the surface (e.g. surface a normally-toast error
  // inline in a specific component).
  const surface = overrides.surface || entry.surface;
  const sink = sinks[surface] || sinks.toast;
  if (sink) sink(entry);
  else if (typeof console !== 'undefined') {
    console.warn(`[error ${entry.code}] ${entry.message}${entry.hint ? ' — ' + entry.hint : ''}`);
  }
  return entry;
}

export function showInfo(message, hint = null) {
  // Lightweight one-shot toast that doesn't need a registry entry.
  const sink = sinks.toast;
  if (sink) sink({ code: 'OK', severity: 'info', surface: SURFACE.TOAST, message, hint, log: false });
}
