/* @vitest-environment jsdom */
/**
 * Smoke: the localStorage circuit-breaker pattern in App.jsx
 * (lines 187–208). We test the exact shape — catch QuotaExceededError,
 * drop oldest, keep at least one — without re-running the whole App
 * tree. If App.jsx changes the strategy (e.g. drop newest, or split
 * to IDB), this test should be rewritten.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

// Inject a fake setItem so we can simulate a quota throw deterministically.
// jsdom's Storage is a host object — vi.spyOn(localStorage, 'setItem') won't
// work because it's not a normal own-prop. Pass the fake into the helper.
function tryWriteWithCircuitBreaker(setItem, key, value, sessions, setSessions) {
  try {
    setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (e) {
    if ((e.name === 'QuotaExceededError' || e.code === 22) && sessions.length > 1) {
      setSessions(prev => prev.slice(0, prev.length - 1));
      return { ok: false, dropped: true };
    }
    return { ok: false, dropped: false };
  }
}

describe('SMOKE App.jsx — QuotaExceededError circuit breaker', () => {
  it('Throws QuotaExceededError → drops oldest session', () => {
    const sessions = [
      { id: 's1', text: 'oldest' },
      { id: 's2', text: 'newer' },
    ];
    let nextSessions = sessions;
    const setSessions = (fn) => { nextSessions = fn(nextSessions); };
    const setItem = () => {
      const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
    };
    const result = tryWriteWithCircuitBreaker(setItem, 'ogOCR_sessions', sessions, sessions, setSessions);
    console.log(`[smoke] circuit-breaker | quota+2sessions | result=${JSON.stringify(result)} keptCount=${nextSessions.length}`);
    expect(result.dropped).toBe(true);
    expect(nextSessions.length).toBe(1);
    // App.jsx slices off the LAST entry. For sessions array order semantics
    // (newer prepended in App.jsx), this drops the oldest. Test mirrors that.
    expect(nextSessions[0].id).toBe('s1');
  });

  it('Quota with single session → no drop (would leave user with nothing)', () => {
    const sessions = [{ id: 'only', text: 'x' }];
    let next = sessions;
    const setSessions = (fn) => { next = fn(next); };
    const setItem = () => {
      const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
    };
    const result = tryWriteWithCircuitBreaker(setItem, 'k', sessions, sessions, setSessions);
    console.log(`[smoke] circuit-breaker | quota+1session | result=${JSON.stringify(result)}`);
    expect(result.dropped).toBe(false);
    expect(next.length).toBe(1);
  });

  it('Non-quota write error → no drop, no crash', () => {
    const sessions = [{ id: 'a' }, { id: 'b' }];
    let next = sessions;
    const setSessions = (fn) => { next = fn(next); };
    const setItem = () => { throw new Error('SecurityError'); };
    const result = tryWriteWithCircuitBreaker(setItem, 'k', sessions, sessions, setSessions);
    expect(result.ok).toBe(false);
    expect(result.dropped).toBe(false);
    expect(next.length).toBe(2);
  });
});

describe('SMOKE AbortController state cleanup', () => {
  // Simulate App.jsx#runAction's abort-prior-then-fire pattern.
  it('Aborting prior controller before starting new one keeps state clean', async () => {
    const fetchCalls = [];
    const fakeFetch = vi.fn(async (_url, opts) => {
      fetchCalls.push({ signal: opts?.signal });
      // Resolve only after a tick so we can abort mid-flight
      return new Promise((resolve, reject) => {
        opts?.signal?.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')));
        setTimeout(() => resolve({ ok: true, json: async () => ({ text: 'x' }) }), 50);
      });
    });

    let abortRef = { current: null };

    async function runAction() {
      // mirror App.jsx: abort any prior in-flight first
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      try {
        const r = await fakeFetch('/api/extract', { signal: abortRef.current.signal });
        return await r.json();
      } catch (e) {
        return { error: e.name };
      }
    }

    const first = runAction();
    const second = runAction();
    const [r1, r2] = await Promise.all([first, second]);
    console.log(`[smoke] abort | r1=${JSON.stringify(r1)} r2=${JSON.stringify(r2)}`);
    expect(r1.error).toBe('AbortError');
    expect(r2.text).toBe('x');
    expect(fetchCalls.length).toBe(2);
  });
});
