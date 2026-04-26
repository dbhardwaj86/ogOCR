// Sequential client-side queue for multi-file uploads (S2.4).
//
// Design notes:
// - Pure JS: no React imports, no hooks. The component layer subscribes via
//   `subscribe(fn)` and re-renders when it fires.
// - Sequential: only one item runs at a time. After `done`/`error`/`cancelled`,
//   `pump()` immediately picks up the next pending item.
// - Cancellation: pending items just flip status. A running item is cancelled
//   by aborting the AbortController threaded into the runner; the runner is
//   expected to surface that as a rejection (AbortError) which we map to the
//   `cancelled` status here, not `error`.
// - Pubsub fires on every observable state change (enqueue, status flips,
//   progress updates) so React can reconcile.

let nextId = 0;
const items = [];
const subscribers = new Set();
let running = null; // { id, controller }
let runner = null;  // (item, signal) => Promise<sessionId|undefined>

const STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  DONE: 'done',
  CANCELLED: 'cancelled',
  ERROR: 'error',
});

function notify() {
  for (const fn of subscribers) {
    try { fn(); } catch (e) { console.warn('queue subscriber threw:', e); }
  }
}

function findIndex(id) {
  return items.findIndex(it => it.id === id);
}

function patch(id, updates) {
  const idx = findIndex(id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...updates };
  return items[idx];
}

export function setRunner(fn) {
  runner = fn;
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function getItems() {
  return items.slice();
}

export function enqueue(file, actionId) {
  const id = `q_${++nextId}`;
  items.push({
    id,
    file,
    actionId,
    status: STATUS.PENDING,
    progress: 0,
    error: null,
    sessionId: null,
  });
  notify();
  // Microtask gap so a caller enqueueing a batch can synchronously add all
  // items before pump kicks off the first run — keeps the visible order
  // deterministic when the runner resolves quickly.
  Promise.resolve().then(pump);
  return id;
}

export function cancel(id) {
  const item = items[findIndex(id)];
  if (!item) return;
  if (item.status === STATUS.PENDING) {
    patch(id, { status: STATUS.CANCELLED });
    notify();
    return;
  }
  if (item.status === STATUS.RUNNING && running?.id === id) {
    // Flag the cancellation intent before aborting so the running-promise
    // settle handler can tell "user cancelled" from "runner threw an
    // AbortError on its own."
    patch(id, { _cancelRequested: true });
    try { running.controller.abort(); } catch { /* already aborted */ }
    notify();
  }
}

export function cancelAll() {
  // Cancel pending items synchronously; defer to `cancel(id)` for the running
  // one so the abort path stays single-sourced.
  for (const it of items) {
    if (it.status === STATUS.PENDING) {
      patch(it.id, { status: STATUS.CANCELLED });
    }
  }
  if (running) cancel(running.id);
  notify();
}

export function updateProgress(id, progress) {
  const item = items[findIndex(id)];
  if (!item) return;
  // Clamp to [0,1] and ignore no-op writes so we don't fire pubsub spam.
  const next = Math.max(0, Math.min(1, progress));
  if (Math.abs((item.progress || 0) - next) < 0.001) return;
  patch(id, { progress: next });
  notify();
}

// For tests: drain the queue and reset module state. Safe to call from
// production code too if a hard reset is ever needed.
export function _reset() {
  items.length = 0;
  subscribers.clear();
  running = null;
  nextId = 0;
}

async function pump() {
  if (running) return;
  if (!runner) return;
  const next = items.find(it => it.status === STATUS.PENDING);
  if (!next) return;

  const controller = new AbortController();
  running = { id: next.id, controller };
  patch(next.id, { status: STATUS.RUNNING, progress: 0 });
  notify();

  try {
    const sessionId = await runner(items[findIndex(next.id)], controller.signal);
    // The current item may have been cancelled mid-flight — preserve that
    // status instead of overwriting it with `done`.
    const after = items[findIndex(next.id)];
    if (after?._cancelRequested || controller.signal.aborted) {
      patch(next.id, { status: STATUS.CANCELLED, _cancelRequested: false });
    } else {
      patch(next.id, { status: STATUS.DONE, progress: 1, sessionId: sessionId || null });
    }
  } catch (err) {
    const after = items[findIndex(next.id)];
    if (after?._cancelRequested || err?.name === 'AbortError' || controller.signal.aborted) {
      patch(next.id, { status: STATUS.CANCELLED, _cancelRequested: false });
    } else {
      patch(next.id, {
        status: STATUS.ERROR,
        error: err?.code || err?.message || 'unknown',
      });
    }
  } finally {
    running = null;
    notify();
    // Tail-call the next pending item.
    Promise.resolve().then(pump);
  }
}

export { STATUS };
