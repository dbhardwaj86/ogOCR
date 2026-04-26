import { describe, it, expect } from 'vitest';
import { readSessionParam, urlWithoutSessionParam, resolveSessionId } from '../deepLink';

describe('readSessionParam', () => {
  it('returns null for empty/missing query strings', () => {
    expect(readSessionParam('')).toBe(null);
    expect(readSessionParam(null)).toBe(null);
    expect(readSessionParam(undefined)).toBe(null);
  });

  it('extracts the session id from a query string', () => {
    expect(readSessionParam('?session=abc123')).toBe('abc123');
    expect(readSessionParam('session=abc123')).toBe('abc123');
  });

  it('returns null when the param is present but blank', () => {
    expect(readSessionParam('?session=')).toBe(null);
    expect(readSessionParam('?session=%20')).toBe(null);
  });

  it('preserves other params and only reads `session`', () => {
    expect(readSessionParam('?theme=ink&session=xyz&pane=output')).toBe('xyz');
    expect(readSessionParam('?theme=ink')).toBe(null);
  });

  it('handles URL-encoded ids (URLSearchParams decodes)', () => {
    expect(readSessionParam('?session=ab%20c')).toBe('ab c');
  });
});

describe('urlWithoutSessionParam', () => {
  it('returns just the pathname when there is no query string', () => {
    expect(urlWithoutSessionParam('/app', '')).toBe('/app');
    expect(urlWithoutSessionParam('/', '')).toBe('/');
  });

  it('strips the session param while preserving others', () => {
    expect(urlWithoutSessionParam('/app', '?theme=ink&session=abc')).toBe('/app?theme=ink');
    expect(urlWithoutSessionParam('/app', '?session=abc&theme=ink')).toBe('/app?theme=ink');
  });

  it('removes a trailing `?` when only `session` was present', () => {
    expect(urlWithoutSessionParam('/app', '?session=abc')).toBe('/app');
  });

  it('leaves the URL untouched when session is not in it', () => {
    expect(urlWithoutSessionParam('/app', '?theme=ink')).toBe('/app?theme=ink');
  });
});

describe('resolveSessionId', () => {
  const sessions = [
    { id: 'aaa', filename: 'one.png' },
    { id: 'bbb', filename: 'two.pdf' },
  ];

  it('returns the id when a matching session exists', () => {
    expect(resolveSessionId(sessions, 'bbb')).toBe('bbb');
  });

  it('returns null when nothing matches', () => {
    expect(resolveSessionId(sessions, 'zzz')).toBe(null);
  });

  it('returns null for an empty/invalid sessions list', () => {
    expect(resolveSessionId([], 'aaa')).toBe(null);
    expect(resolveSessionId(null, 'aaa')).toBe(null);
  });

  it('returns null for a missing candidate id', () => {
    expect(resolveSessionId(sessions, '')).toBe(null);
    expect(resolveSessionId(sessions, null)).toBe(null);
  });

  it('does not fuzzy-match — exact ids only', () => {
    expect(resolveSessionId(sessions, 'aa')).toBe(null);
    expect(resolveSessionId(sessions, 'AAA')).toBe(null);
  });
});
