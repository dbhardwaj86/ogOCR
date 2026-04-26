import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  enqueue,
  cancel,
  cancelAll,
  setRunner,
  subscribe,
  getItems,
  _reset,
  STATUS,
} from '../queue.js';

// Wait for all pending microtasks + N event-loop ticks. The queue uses
// `Promise.resolve().then(pump)` to chain runs, so a few ticks are enough to
// drain a small batch in tests.
async function flush(ticks = 8) {
  for (let i = 0; i < ticks; i++) {
    await Promise.resolve();
    await new Promise(r => setTimeout(r, 0));
  }
}

function makeFile(name = 'a.png') {
  return new File([new Uint8Array([0])], name, { type: 'image/png' });
}

describe('queue', () => {
  beforeEach(() => {
    _reset();
  });

  it('enqueues 3 items, runs them sequentially, all finish done', async () => {
    const calls = [];
    setRunner(async (item) => {
      calls.push(item.file.name);
      // Resolve on next microtask so two items don't run in parallel.
      await Promise.resolve();
      return `s_${item.file.name}`;
    });

    enqueue(makeFile('a.png'), 'text');
    enqueue(makeFile('b.png'), 'text');
    enqueue(makeFile('c.png'), 'text');

    await flush();

    const items = getItems();
    expect(items).toHaveLength(3);
    expect(items.map(i => i.status)).toEqual([STATUS.DONE, STATUS.DONE, STATUS.DONE]);
    expect(calls).toEqual(['a.png', 'b.png', 'c.png']);
    expect(items[0].sessionId).toBe('s_a.png');
  });

  it('cancel() on a pending item prevents it from running', async () => {
    const calls = [];
    setRunner(async (item) => {
      calls.push(item.file.name);
      await Promise.resolve();
      return null;
    });

    const idA = enqueue(makeFile('a.png'), 'text');
    const idB = enqueue(makeFile('b.png'), 'text');
    cancel(idB);

    await flush();

    const items = getItems();
    const a = items.find(i => i.id === idA);
    const b = items.find(i => i.id === idB);
    expect(a.status).toBe(STATUS.DONE);
    expect(b.status).toBe(STATUS.CANCELLED);
    expect(calls).toEqual(['a.png']);
  });

  it('cancel() on the running item aborts via signal and marks cancelled', async () => {
    let observedAborted = false;
    setRunner((item, signal) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => {
        observedAborted = true;
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    }));

    const idA = enqueue(makeFile('a.png'), 'text');
    // Let pump start the run.
    await flush(2);
    const before = getItems().find(i => i.id === idA);
    expect(before.status).toBe(STATUS.RUNNING);

    cancel(idA);
    await flush();

    const after = getItems().find(i => i.id === idA);
    expect(observedAborted).toBe(true);
    expect(after.status).toBe(STATUS.CANCELLED);
  });

  it('cancelAll() prevents any further runs', async () => {
    const calls = [];
    setRunner(async (item) => {
      calls.push(item.file.name);
      await Promise.resolve();
      return null;
    });

    enqueue(makeFile('a.png'), 'text');
    enqueue(makeFile('b.png'), 'text');
    enqueue(makeFile('c.png'), 'text');
    cancelAll();

    await flush();

    const items = getItems();
    // No item ran (cancelAll fired before pump took the first item) — they
    // should all be cancelled.
    expect(items.every(i => i.status === STATUS.CANCELLED)).toBe(true);
    expect(calls).toEqual([]);
  });

  it('subscribers fire on enqueue and on each status change', async () => {
    setRunner(async () => {
      await Promise.resolve();
      return 's_1';
    });
    const fn = vi.fn();
    const unsub = subscribe(fn);

    enqueue(makeFile('a.png'), 'text');
    await flush();

    // At minimum: enqueue → running → done. Likely more (notify on pump
    // start + finally). Lower bound is 3.
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(3);
    unsub();
  });
});
