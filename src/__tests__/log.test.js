import { describe, it, expect, beforeEach } from 'vitest';
import { logError, getLog, clearLog, copyLogText, subscribeLog } from '../errors/log';

describe('error log ring buffer', () => {
  beforeEach(() => clearLog());

  it('caps the buffer at 5 newest-first', () => {
    for (let i = 0; i < 8; i++) logError({ code: `T_${i}`, message: 'm', hint: null });
    const log = getLog();
    expect(log.length).toBe(5);
    expect(log[0].code).toBe('T_7');
    expect(log[4].code).toBe('T_3');
  });

  it('notifies subscribers on every push', () => {
    const seen = [];
    const off = subscribeLog((b) => seen.push(b.length));
    logError({ code: 'A', message: 'm' });
    logError({ code: 'B', message: 'm' });
    off();
    expect(seen).toEqual([0, 1, 2]);
  });

  it('formats copyable text', () => {
    logError({ code: 'CAP_OFFLINE', message: 'Offline', hint: 'Reconnect' });
    const text = copyLogText();
    expect(text).toContain('CAP_OFFLINE');
    expect(text).toContain('Reconnect');
  });
});
