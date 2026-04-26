import { useState, useEffect, useRef, useCallback } from 'react';
import TopBar from './components/TopBar';
import LibraryRail from './components/LibraryRail';
import SourceColumn from './components/SourceColumn';
import OutputColumn from './components/OutputColumn';
import MobileTabs from './components/MobileTabs';
import CommandPalette from './components/CommandPalette';
import UploadConfirmModal from './components/UploadConfirmModal';
import WelcomeModal from './components/WelcomeModal';
import Toast from './components/Toast';
import CompileBuilder from './components/CompileBuilder';
import DiagnosticsPanel from './components/DiagnosticsPanel';
import ErrorBoundary from './components/ErrorBoundary';
import { publishLanguageOverrides } from './components/LanguagePill';
import { MAGIC_ACTIONS, REFINE_ACTIONS, REFINE_KIND_BY_ID, LANGUAGE_OVERRIDE_PROMPT } from './magicActions';
import { showError, installErrorSinks, showInfo } from './errors/showError';
import { errFromResponse, errFromException } from './errors/errFromResponse';
import { formatMessage } from './errors/codes';
import { nextTheme } from './theme';
import {
  COMPILE_STORAGE_KEY,
  ACTIVE_COMPILE_KEY,
  createCompile as makeCompile,
  migrateCompile,
  migrateCompileImagesToIDB,
  compileNeedsIDBOffload,
} from './compile';
import { readSessionParam, urlWithoutSessionParam, resolveSessionId } from './deepLink';
import {
  getImage as idbGetImage,
  setImage as idbSetImage,
  deleteImage as idbDeleteImage,
  blobToDataURL,
  dataURLToBlob,
} from './storage/idb';
import { setRunner as setQueueRunner, updateProgress as updateQueueProgress } from './queue.js';

// --- Initial-state loaders run once at module load (Strict Mode safe). ---
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`Failed to parse ${key}; falling back.`, e);
    return fallback;
  }
}

// Schema version. v2 added structured `session.images`. v3 adds
// `session.refinements` — a sibling block of AI-rewritten text keyed by
// tone (`summary` / `bullets` / `formal` / `casual`). v4 moves
// `session.images[i].data` blobs out of localStorage and into IndexedDB
// (CRIT-1): localStorage was overflowing the 5 MB quota, triggering the
// circuit breaker that drops the oldest session and silently destroys data.
// The on-disk shape stores only `{id, desc}` per image; `data` is hydrated
// back into memory from IDB when a session becomes active. The migration
// from v3 → v4 happens asynchronously after mount (see migrateLegacySessions
// effect below) — synchronous migration would require blocking the initial
// render on IDB writes.
const SESSION_SCHEMA_VERSION = 4;

function migrateSession(s) {
  if (!s || typeof s !== 'object') return s;
  if (s.version === SESSION_SCHEMA_VERSION) return s;
  // v1 → v2 → v3 → v4: leave existing text/svg/images in place synchronously.
  // `refinements` defaults to undefined and is populated lazily on the first
  // refine action. v3 → v4 image data migration is handled by the async
  // migrateLegacySessions effect after first mount; we still stamp the
  // version here so a session loaded from localStorage with no images
  // (i.e. nothing to migrate) doesn't get re-touched.
  return { ...s, version: SESSION_SCHEMA_VERSION };
}

// Strip the `data` field from each image entry so blobs never round-trip
// through localStorage. Read paths re-hydrate from IDB on session activate.
function stripImageData(sessions) {
  if (!Array.isArray(sessions)) return sessions;
  return sessions.map(s => {
    if (!s || !Array.isArray(s.images)) return s;
    return {
      ...s,
      images: s.images.map(img => {
        if (!img || typeof img !== 'object') return img;
        // Drop `data` entirely — IDB is the source of truth for blobs.
        // eslint-disable-next-line no-unused-vars
        const { data, ...rest } = img;
        return rest;
      }),
    };
  });
}

const initialSessions = (() => {
  const raw = readJSON('ogOCR_sessions', []);
  if (!Array.isArray(raw)) return [];
  return raw.map(migrateSession);
})();
const initialActiveId = (() => {
  try { return localStorage.getItem('ogOCR_active_session') || null; } catch { return null; }
})();
// Deep-link override: a `?session=<id>` query param trumps the persisted
// active id when it resolves against an existing session. Resolved at module
// load so the initial render already shows the right session — no flash, no
// in-effect setState. See docs in `src/deepLink.js`.
const deepLinkSessionId = (() => {
  if (typeof window === 'undefined') return null;
  try {
    const id = readSessionParam(window.location.search);
    return resolveSessionId(initialSessions, id);
  } catch {
    return null;
  }
})();
const bootActiveId = deepLinkSessionId || initialActiveId;
const initialPrompt = (() => {
  try { return localStorage.getItem('ogOCR_prompt') || ''; } catch { return ''; }
})();
const initialTheme = (() => {
  try {
    const t = localStorage.getItem('ogOCR_theme');
    return (t === 'paper' || t === 'sepia' || t === 'ink') ? t : 'paper';
  } catch { return 'paper'; }
})();
const initialCompiles = (() => {
  const raw = readJSON(COMPILE_STORAGE_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.map(migrateCompile).filter(Boolean);
})();
const initialActiveCompileId = (() => {
  try { return localStorage.getItem(ACTIVE_COMPILE_KEY) || null; } catch { return null; }
})();
// First-run gate for the welcome modal. Once dismissed (or sample-loaded) we
// stamp localStorage so it never re-opens on this browser.
const initialFirstRun = (() => {
  try { return localStorage.getItem('ogOCR_first_run') !== '1'; } catch { return false; }
})();

function pickInitialMobilePane(sessions, activeId) {
  const active = sessions.find(s => s.id === activeId);
  if (active && (active.text || active.svg)) return 'output';
  if (sessions.length > 0) return 'source';
  return 'library';
}

function App() {
  const [sessions, setSessions] = useState(initialSessions);
  const [activeSessionId, setActiveSessionId] = useState(bootActiveId);
  const [file, setFile] = useState(null);
  const [customPrompt, setCustomPrompt] = useState(initialPrompt);
  const [theme, setTheme] = useState(initialTheme);
  const [processing, setProcessing] = useState(null);
  const [toast, setToast] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [compileOpen, setCompileOpen] = useState(false);
  const [pendingPreviewFile, setPendingPreviewFile] = useState(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  // Deep-link → output: if the URL targeted a real session, jump straight to
  // the Output pane on mobile so the user sees their work, not the upload card.
  const [mobilePane, setMobilePane] = useState(() => (
    deepLinkSessionId ? 'output' : pickInitialMobilePane(initialSessions, initialActiveId)
  ));
  const [compiles, setCompiles] = useState(initialCompiles);
  const [activeCompileId, setActiveCompileId] = useState(() => {
    if (!initialActiveCompileId) return null;
    return initialCompiles.some(c => c.id === initialActiveCompileId) ? initialActiveCompileId : null;
  });
  const [firstRun, setFirstRun] = useState(initialFirstRun);

  const dismissWelcome = useCallback(() => {
    setFirstRun(false);
    try { localStorage.setItem('ogOCR_first_run', '1'); } catch { /* ignore */ }
  }, []);

  const abortRef = useRef(null);
  const progressRef = useRef(null);
  const toastTimerRef = useRef(null);

  const activeSession = sessions.find(s => s.id === activeSessionId) || null;

  // Persist sessions + active id (debounced to avoid per-keystroke writes).
  // v4: image blobs are stored in IndexedDB, not localStorage — strip
  // `images[i].data` before serializing so a single Base64 PNG can no longer
  // single-handedly blow past the 5 MB quota and trip the circuit breaker.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const safeSessions = stripImageData(sessions);
        localStorage.setItem('ogOCR_sessions', JSON.stringify(safeSessions));
        if (activeSessionId) {
          localStorage.setItem('ogOCR_active_session', activeSessionId);
        } else {
          localStorage.removeItem('ogOCR_active_session');
        }
      } catch (e) {
        if ((e.name === 'QuotaExceededError' || e.code === 22) && sessions.length > 1) {
          // Drop oldest session and let the next render retry.
          setSessions(prev => prev.slice(0, prev.length - 1));
          showInfo('Storage full — dropped oldest session.', 'Older sessions are removed first to keep newer work safe.');
        } else {
          console.warn('localStorage write failed:', e);
        }
      }
    }, 400);
    return () => clearTimeout(t);
  }, [sessions, activeSessionId]);

  // Persist prompt (debounced).
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem('ogOCR_prompt', customPrompt); } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(t);
  }, [customPrompt]);

  // Persist compiles + active compile id (debounced; same circuit-breaker pattern as sessions).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(COMPILE_STORAGE_KEY, JSON.stringify(compiles));
        if (activeCompileId) {
          localStorage.setItem(ACTIVE_COMPILE_KEY, activeCompileId);
        } else {
          localStorage.removeItem(ACTIVE_COMPILE_KEY);
        }
      } catch (e) {
        if ((e.name === 'QuotaExceededError' || e.code === 22) && compiles.length > 1) {
          setCompiles(prev => prev.slice(0, prev.length - 1));
          showInfo('Storage full — dropped oldest compile.', 'Older compiles are removed first to keep newer work safe.');
        } else {
          console.warn('localStorage compile write failed:', e);
        }
      }
    }, 400);
    return () => clearTimeout(t);
  }, [compiles, activeCompileId]);

  // Theme: write data-theme attr + persist.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('ogOCR_theme', theme); } catch { /* ignore */ }
  }, [theme]);

  // Track K — broadcast the per-session language overrides so LanguagePill
  // (mounted by SourceColumn, which doesn't forward arbitrary props) can
  // render the `(override)` suffix accurately. The publication is just a
  // module-level signal store inside LanguagePill.jsx, not a global event.
  useEffect(() => {
    const map = {};
    for (const s of sessions) {
      if (s?.id && s?.languageOverride) map[s.id] = s.languageOverride;
    }
    publishLanguageOverrides({ activeSessionId, map });
  }, [sessions, activeSessionId]);

  // One-shot migration of legacy v3 sessions: any image entry whose `data`
  // is still a `data:` URL (left over from before v4) gets lifted into IDB
  // under its existing `id`, and the in-memory `data` field is cleared so
  // the next persistence write strips it from localStorage. The async work
  // runs after first mount so the initial render isn't blocked.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let pendingPatches = null;
      for (const s of sessions) {
        if (!s || !Array.isArray(s.images)) continue;
        for (const img of s.images) {
          const data = img?.data;
          if (typeof data !== 'string' || !data.startsWith('data:')) continue;
          try {
            const blob = await dataURLToBlob(data);
            if (blob) await idbSetImage(img.id, blob);
            pendingPatches = pendingPatches || new Map();
            const patch = pendingPatches.get(s.id) || new Set();
            patch.add(img.id);
            pendingPatches.set(s.id, patch);
          } catch (e) {
            // Don't tear the whole batch on a single bad entry — log and move on.
            console.warn('IDB migration failed for image', img?.id, e);
          }
        }
      }
      if (cancelled || !pendingPatches) return;
      // Clear `data` from migrated entries so the next persistence pass writes
      // metadata-only sessions to localStorage.
      setSessions(prev => prev.map(s => {
        const ids = pendingPatches.get(s.id);
        if (!ids || !Array.isArray(s.images)) return s;
        return {
          ...s,
          images: s.images.map(img => (ids.has(img.id) ? { ...img, data: null } : img)),
        };
      }));
    })();
    return () => { cancelled = true; };
    // We deliberately run this only on first mount (using initialSessions).
    // Re-running on every `sessions` change would loop forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track K — one-shot migration of legacy v1 compiles. Any block of kind
  // `image` whose `src` is still a `data:` URL gets lifted into IDB under
  // a fresh `cimg_<id>` key; `block.src` is rewritten to `idb:cimg_<id>`.
  // Mirror of the v3 → v4 session image migration above. Runs once after
  // first mount so the initial render isn't blocked. Idempotent — a
  // compile that's already on v2 with no `data:` blocks is left alone.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const targets = compiles.filter(compileNeedsIDBOffload);
      if (targets.length === 0) return;
      const updated = new Map();
      for (const c of targets) {
        try {
          const next = await migrateCompileImagesToIDB(c);
          if (next !== c) updated.set(c.id, next);
        } catch (e) {
          if (e?.code === 'IDB_QUOTA') {
            showError('IDB_QUOTA');
            break;
          }
          console.warn('compile IDB migration failed for', c.id, e);
        }
      }
      if (cancelled || updated.size === 0) return;
      setCompiles(prev => prev.map(c => updated.get(c.id) || c));
    })();
    return () => { cancelled = true; };
    // First-mount only — re-running on every `compiles` change would loop
    // because the effect itself updates state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When a session becomes active, hydrate its image blobs back into the
  // in-memory state so RenderedDoc / CompileBuilder can keep using
  // `images[i].data` as a usable image source. The hydration is targeted —
  // we only fetch images for the active session, not the entire history.
  useEffect(() => {
    if (!activeSessionId) return;
    const target = sessions.find(s => s.id === activeSessionId);
    if (!target || !Array.isArray(target.images) || target.images.length === 0) return;

    // Skip if every image already has a usable `data` value — avoids re-running
    // hydration after the user edits text on an already-hydrated session.
    const needsHydration = target.images.some(img => !img?.data);
    if (!needsHydration) return;

    let cancelled = false;
    (async () => {
      const next = await Promise.all(target.images.map(async (img) => {
        if (img?.data) return img;
        if (!img?.id) return img;
        try {
          const blob = await idbGetImage(img.id);
          if (!blob) return img;
          const dataURL = await blobToDataURL(blob);
          return { ...img, data: dataURL };
        } catch (e) {
          console.warn('IDB hydrate failed for image', img.id, e);
          return img;
        }
      }));
      if (cancelled) return;
      // Bail out if nothing actually changed — prevents a setState loop with
      // the persistence effect.
      const changed = next.some((img, i) => img !== target.images[i]);
      if (!changed) return;
      setSessions(prev => prev.map(s => (s.id === activeSessionId ? { ...s, images: next } : s)));
    })();
    return () => { cancelled = true; };
  }, [activeSessionId, sessions]);

  // Deep-link boot: the `?session=<id>` param has already been consumed at
  // module load — it resolved into `bootActiveId` / `deepLinkSessionId` above
  // and is reflected in the initial state. This effect just strips the param
  // from the address bar so a refresh doesn't re-activate. Always strips,
  // even on a miss, so a stale id can't get stuck on the URL.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.location.search.includes('session=')) return;
    try {
      const next = urlWithoutSessionParam(window.location.pathname, window.location.search);
      window.history.replaceState(null, '', next);
    } catch { /* ignore — non-browser or sandboxed context */ }
  }, []);

  const cycleTheme = useCallback(() => {
    setTheme(t => nextTheme(t));
  }, []);

  // Track toast timer in a ref so a new toast within 2.4s doesn't get nulled
  // by a previous timer that's still pending.
  const showToastEntry = useCallback((entry) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(entry);
    const dwell = (entry?.severity === 'error' || entry?.severity === 'fatal') ? 5000 : 2800;
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, dwell);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(null);
  }, []);

  // Backwards-compat helper for callers that still pass a plain string.
  const showToast = useCallback((message) => {
    if (!message) return;
    showToastEntry({ code: 'OK', severity: 'info', message, hint: null });
  }, [showToastEntry]);

  // Wire the registry sinks once. The registry's `surface` field decides which
  // sink fires; until inline/modal sinks are wired everywhere, fall back to
  // toast so nothing is silently dropped.
  useEffect(() => {
    installErrorSinks({
      toast: showToastEntry,
      inline: showToastEntry,
      modal: showToastEntry,
      overlay: showToastEntry,
    });
  }, [showToastEntry]);

  // Surface unhandled promise rejections as toasts so async failures off the
  // runAction path don't vanish into the console.
  useEffect(() => {
    const onRejection = (e) => {
      // Don't double-toast aborts and errors we already routed.
      if (e?.reason?.name === 'AbortError') return;
      const entry = errFromException(e?.reason || new Error(String(e?.reason || 'unknown')));
      showError(entry.code, { message: entry.message, hint: entry.hint });
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, []);

  const createNewSession = useCallback((filename, kind = 'text') => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const fresh = {
      id,
      filename,
      date: Date.now(),
      text: '',
      svg: '',
      kind,
      version: SESSION_SCHEMA_VERSION,
    };
    setSessions(prev => [fresh, ...prev]);
    setActiveSessionId(id);
    return id;
  }, []);

  const updateSession = useCallback((id, updates) => {
    setSessions(prev => prev.map(s =>
      s.id === id ? { ...s, ...updates, date: updates.date ?? Date.now() } : s
    ));
  }, []);

  const updateActiveSession = useCallback((updates) => {
    if (!activeSessionId) return;
    setSessions(prev => prev.map(s =>
      s.id === activeSessionId ? { ...s, ...updates } : s
    ));
  }, [activeSessionId]);

  const deleteSession = useCallback((id) => {
    setSessions(prev => {
      // Cascade-delete any image blobs owned by the dropped session so IDB
      // doesn't accumulate orphans. Best-effort — failures here just leave
      // a few extra blobs behind; they won't block the UI.
      const dropped = prev.find(s => s.id === id);
      if (dropped && Array.isArray(dropped.images)) {
        for (const img of dropped.images) {
          if (img?.id) idbDeleteImage(img.id).catch(() => {});
        }
      }
      return prev.filter(s => s.id !== id);
    });
    setActiveSessionId(curr => curr === id ? null : curr);
  }, []);

  const handleUpload = useCallback((newFile) => {
    setFile(newFile);
    createNewSession(newFile.name);
    setMobilePane('source');
    showToast(`Loaded ${newFile.name}`);
  }, [createNewSession, showToast]);

  // Progress lifecycle is owned per-request via a token. Two concurrent runs
  // (e.g. action A in flight when action B starts) must not share `progressRef`
  // — older runs clearing the ref would tear down the newer run's timer + state.
  const stopProgress = useCallback((token) => {
    if (progressRef.current && (!token || progressRef.current.token === token)) {
      clearTimeout(progressRef.current.id);
      progressRef.current = null;
    }
  }, []);

  const startProgress = useCallback((actionId) => {
    const token = {};
    setProcessing({ actionId, progress: 0, stage: 'preparing', token });
    let pct = 0;
    const stages = [
      { at: 12, name: 'preparing' },
      { at: 28, name: 'scanning' },
      { at: 52, name: 'recognizing' },
      { at: 78, name: 'structuring' },
      { at: 96, name: 'finalizing' },
    ];
    const tick = () => {
      if (progressRef.current?.token !== token) return;
      pct = Math.min(95, pct + Math.random() * 6 + 3);
      const stage = stages.find(s => pct < s.at)?.name ?? 'finalizing';
      setProcessing(p => (p?.token === token ? { ...p, progress: pct, stage } : p));
      if (pct < 95) {
        const id = setTimeout(tick, 220 + Math.random() * 180);
        progressRef.current = { token, id };
      }
    };
    const id = setTimeout(tick, 200);
    progressRef.current = { token, id };
    return token;
  }, []);

  const finishProgress = useCallback((token) => {
    if (progressRef.current && progressRef.current.token !== token) return;
    stopProgress(token);
    setProcessing(p => (p?.token === token ? { ...p, progress: 100, stage: 'finalizing' } : p));
    setTimeout(() => {
      setProcessing(p => (p?.token === token ? null : p));
    }, 220);
  }, [stopProgress]);

  // Track K — runAction accepts a `languageOverride` (ISO code or 'auto')
  // as a third argument or via an options object. When set, the action's
  // base prompt is wrapped by LANGUAGE_OVERRIDE_PROMPT so Gemini treats
  // the document as written in the chosen language and keeps emitting the
  // trailing __detected_lang line. Passing 'auto' (or omitting) falls
  // through to the base prompt.
  const runAction = useCallback(async (actionId, customPromptOverride, opts = {}) => {
    const refineAction = REFINE_ACTIONS.find(a => a.id === actionId);
    const isRefine = !!refineAction;
    const languageOverride = (opts && typeof opts === 'object') ? opts.languageOverride : null;

    // Refine actions skip the file-required early bail — they refine
    // `session.text` rather than the uploaded file. They still need an
    // active session with non-empty text to operate on.
    if (isRefine) {
      const sourceText = (activeSession?.text || '').trim();
      if (!sourceText) {
        showError('OCR_EMPTY', {
          message: 'Run an action first to get text to refine.',
          hint: 'Pick one of the 8 magic actions above before refining.',
        });
        return;
      }
    } else if (!file) {
      showError('OCR_BAD_FILE');
      return;
    }
    if (processing) {
      showError('OCR_BUSY');
      return;
    }

    const action = isRefine ? null : MAGIC_ACTIONS.find(a => a.id === actionId);
    const endpoint = action?.endpoint || '/api/extract';
    const basePrompt = customPromptOverride
      ?? (isRefine
        ? `${refineAction.prompt}\n\nINPUT:\n${activeSession.text}`
        : action?.prompt ?? '');
    // Track K — language override only wraps text-bearing magic-action prompts.
    // SVG / image-extract endpoints have null prompts and an override would be
    // a no-op anyway. Refine actions are language-agnostic so we skip them too.
    const prompt = (!isRefine && languageOverride && languageOverride !== 'auto' && basePrompt)
      ? LANGUAGE_OVERRIDE_PROMPT(basePrompt, languageOverride)
      : basePrompt;

    let sessionId = activeSessionId;
    if (!sessionId && !isRefine) sessionId = createNewSession(file.name);

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    const myToken = startProgress(actionId);
    // Flip to Output immediately so the user can see the processing strip + percentage,
    // not stare at the Source pane wondering if anything's happening.
    setMobilePane('output');

    try {
      const formData = new FormData();
      if (isRefine) {
        // Server requires multipart with a `file` field (multer.single('file')).
        // We're refining text, not a file — wrap the source text in a synthetic
        // text/plain blob so the existing endpoint accepts it without server
        // changes. Gemini accepts text/plain in inlineData for text inputs.
        const synthetic = new File(
          [activeSession.text],
          'refine-input.txt',
          { type: 'text/plain' }
        );
        formData.append('file', synthetic);
      } else {
        formData.append('file', file);
      }
      if (prompt) formData.append('prompt', prompt);

      const r = await fetch(endpoint, { method: 'POST', body: formData, signal });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const entry = await errFromResponse(r);
        const e = new Error(entry.message);
        e.__registryEntry = entry;
        throw e;
      }

      let hadResponse = false;
      let updates = {};

      if (isRefine) {
        // Refinements land on `session.refinements[kind]` — they don't
        // overwrite `session.text` or `session.kind`, so the underlying
        // extraction stays the source of truth.
        if (typeof data.text === 'string' && data.text.trim()) {
          const refineKind = REFINE_KIND_BY_ID[actionId];
          const prevRefinements = activeSession?.refinements || {};
          updates = {
            refinements: { ...prevRefinements, [refineKind]: data.text },
          };
          hadResponse = true;
        }
      } else {
        updates = { kind: actionId };
        // Track K — record the active language override on the session so a
        // reload picks the same chip state. `auto` clears the override.
        if (languageOverride === 'auto') {
          updates.languageOverride = null;
        } else if (languageOverride) {
          updates.languageOverride = languageOverride;
        }
        if (data.svg) {
          updates.svg = data.svg;
          updates.text = '';
          hadResponse = true;
        } else if (Array.isArray(data.images)) {
          // Native image rendering path (schema v2): keep the structured array
          // on `session.images`. RenderedDoc renders the grid natively; the
          // text field stores only the summary line so the markdown path still
          // works as a fallback for older renderers.
          // v4: also persist each blob to IDB. The in-memory copy keeps the
          // `data:` URL so the active render is instant; the persistence
          // effect strips it before localStorage so the quota-overflow path
          // is unreachable. If IDB write fails (quota), we surface IDB_QUOTA
          // but keep the in-memory state intact so the user still sees the
          // result for this session.
          updates.images = data.images;
          updates.svg = '';
          // Fire-and-forget: the user shouldn't wait for IDB to acknowledge
          // before seeing the extracted images. Errors are routed through
          // showError so a quota miss is visible.
          (async () => {
            for (const img of data.images) {
              if (!img?.id || typeof img?.data !== 'string') continue;
              try {
                const blob = await dataURLToBlob(img.data);
                if (blob) await idbSetImage(img.id, blob);
              } catch (e) {
                if (e?.code === 'IDB_QUOTA') {
                  showError('IDB_QUOTA');
                  break;
                }
                console.warn('IDB store failed for image', img.id, e);
              }
            }
          })();
          if (data.images.length === 0) {
            updates.text = '_No visual components found in this document._';
          } else {
            updates.text = data.message || `Found ${data.images.length} visual components.`;
          }
          hadResponse = true;
        } else if (typeof data.text === 'string') {
          updates.text = data.text;
          updates.svg = '';
          hadResponse = true;
        }
      }

      if (!hadResponse) {
        // Empty/malformed response — never claim success.
        const entry = formatMessage('OCR_EMPTY');
        const e = new Error(entry.message);
        e.__registryEntry = entry;
        throw e;
      }
      updates.lastError = null;
      updateSession(sessionId, updates);
      const label = isRefine ? refineAction.label : (action?.label || 'Run');
      showInfo(`${label} complete`);
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error(err);
      const entry = err.__registryEntry || errFromException(err);
      // Preserve prior session payload — surface the error inline instead of
      // overwriting text/svg with the error string.
      updateSession(sessionId, {
        lastError: { code: entry.code, message: entry.message, hint: entry.hint, at: Date.now(), actionId },
      });
      showError(entry.code, { message: entry.message, hint: entry.hint });
    } finally {
      // Only the token-owning run may tear down progress. If a newer run took
      // over (signal aborted), leave its progress alone.
      if (!signal.aborted) finishProgress(myToken);
      if (abortRef.current?.signal === signal) abortRef.current = null;
    }
  }, [file, processing, activeSessionId, activeSession, createNewSession, updateSession, startProgress, finishProgress]);

  // Queue runner: a multi-file drop enqueues into `src/queue.js`; the queue
  // calls back into here to run each file through the action endpoint. We
  // intentionally don't reuse `runAction` directly because the queue runner
  // operates on its own file (not the App-level `file` state) and creates a
  // fresh session for every item — `runAction` is wired to the active
  // session and would clobber state across queue runs.
  useEffect(() => {
    setQueueRunner(async (item, signal) => {
      const queuedFile = item.file;
      const actionId = item.actionId || 'text';
      const action = MAGIC_ACTIONS.find(a => a.id === actionId);
      const endpoint = action?.endpoint || '/api/extract';
      const prompt = action?.prompt || '';

      // Each queued file gets its own session — that's the whole point of
      // batching. We don't touch `file` / `activeSessionId` here so a
      // user-initiated single-file run can keep going in parallel with the
      // queue (the per-session progress strip in OutputColumn is owned by
      // runAction; the QueueRail owns its own progress display).
      const sessionId = createNewSession(queuedFile.name);

      // Lightweight client-side progress tween: the queue UI shows per-row
      // progress, and we don't have backend-streamed progress. Tween from
      // 0 → 0.95 over the request and snap to 1 on response.
      let pct = 0;
      const tickHandle = { id: null };
      const tick = () => {
        if (signal.aborted) return;
        pct = Math.min(0.95, pct + Math.random() * 0.06 + 0.03);
        updateQueueProgress(item.id, pct);
        if (pct < 0.95) {
          tickHandle.id = setTimeout(tick, 220 + Math.random() * 180);
        }
      };
      tickHandle.id = setTimeout(tick, 200);
      const stopTick = () => {
        if (tickHandle.id != null) clearTimeout(tickHandle.id);
        tickHandle.id = null;
      };

      try {
        const formData = new FormData();
        // Use the new `files` field name; server still accepts `file` for
        // backward-compat but the multi-route is `files[]`.
        formData.append('files', queuedFile);
        if (prompt) formData.append('prompt', prompt);

        const r = await fetch(endpoint, { method: 'POST', body: formData, signal });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          const entry = await errFromResponse(r);
          const e = new Error(entry.message);
          e.__registryEntry = entry;
          throw e;
        }

        const updates = { kind: actionId };
        let hadResponse = false;
        if (data.svg) {
          updates.svg = data.svg;
          updates.text = '';
          hadResponse = true;
        } else if (Array.isArray(data.images)) {
          updates.images = data.images;
          updates.svg = '';
          // Mirror runAction's IDB persistence — fire-and-forget.
          (async () => {
            for (const img of data.images) {
              if (!img?.id || typeof img?.data !== 'string') continue;
              try {
                const blob = await dataURLToBlob(img.data);
                if (blob) await idbSetImage(img.id, blob);
              } catch (e) {
                if (e?.code === 'IDB_QUOTA') {
                  showError('IDB_QUOTA');
                  break;
                }
                console.warn('IDB store failed for image', img.id, e);
              }
            }
          })();
          updates.text = data.images.length === 0
            ? '_No visual components found in this document._'
            : (data.message || `Found ${data.images.length} visual components.`);
          hadResponse = true;
        } else if (typeof data.text === 'string') {
          updates.text = data.text;
          updates.svg = '';
          hadResponse = true;
        }

        if (!hadResponse) {
          const entry = formatMessage('OCR_EMPTY');
          const e = new Error(entry.message);
          e.__registryEntry = entry;
          throw e;
        }

        updates.lastError = null;
        updateSession(sessionId, updates);
        updateQueueProgress(item.id, 1);
        return sessionId;
      } catch (err) {
        if (err?.name !== 'AbortError') {
          const entry = err.__registryEntry || errFromException(err);
          updateSession(sessionId, {
            lastError: { code: entry.code, message: entry.message, hint: entry.hint, at: Date.now(), actionId },
          });
          // Surface in toast — user otherwise has no signal a queue item failed.
          showError(entry.code, { message: entry.message, hint: entry.hint });
        }
        throw err;
      } finally {
        stopTick();
      }
    });
    // The runner closes over `createNewSession` / `updateSession`; both are
    // stable callbacks (useCallback) so this effect runs at mount only.
  }, [createNewSession, updateSession]);

  // Cmd/Ctrl + K → palette toggle. Shift+? → diagnostics. Esc closes overlays.
  // ⌥ + letter → run a magic action. We re-bind when `runAction` changes so we
  // don't need a ref forwarder (lint forbids both ref-during-render and
  // ref-modification-after-effect).
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(p => !p);
      } else if (e.shiftKey && (e.key === '?' || e.key === '/')) {
        e.preventDefault();
        setDiagnosticsOpen(p => !p);
      } else if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const k = (e.key || '').toUpperCase();
        const action = MAGIC_ACTIONS.find(a => a.key === k);
        if (action) {
          e.preventDefault();
          runAction(action.id);
        }
      } else if (e.key === 'Escape') {
        setPaletteOpen(false);
        setCompileOpen(false);
        setPendingPreviewFile(null);
        setDiagnosticsOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runAction]);

  // Track K — language override re-run hook. LanguagePill (mounted by
  // SourceColumn — Track I's owned file, not editable here) dispatches a
  // window-level `og:language-override` CustomEvent when the user picks a
  // language. We re-run the active session's last action with the override
  // wrapped around the prompt. The pill records the override on the
  // session via `runAction`'s `languageOverride` option so a reload keeps
  // the chip in `(override)` mode.
  //
  // Why a custom event instead of a prop chain: SourceColumn's render of
  // `<LanguagePill lang={detectedLang} />` doesn't forward arbitrary
  // props, and Track K's owned-file list explicitly excludes editing
  // SourceColumn (Track I owns it). The event hop is a one-line workaround
  // that keeps the contract honest: when SourceColumn does forward props
  // in a future track, LanguagePill already accepts an `onOverride` prop
  // that takes precedence over the event.
  useEffect(() => {
    const onOverride = (ev) => {
      const lang = ev?.detail?.lang;
      if (!lang) return;
      // Use the requested sessionId when present so a click on a pill bound
      // to a stale session can't misroute the re-run; fall back to the
      // currently active session.
      const requestedId = ev?.detail?.sessionId || activeSessionId;
      const target = sessions.find(s => s.id === requestedId);
      if (!target) return;
      // Determine the action to re-run: prefer the session's recorded
      // `kind` (set after the last successful magic-action run); fall back
      // to `text` so a fresh session with no kind still works.
      const actionId = target.kind && MAGIC_ACTIONS.some(a => a.id === target.kind)
        ? target.kind
        : 'text';
      // Move focus to the target session if needed so `runAction` operates
      // on the right state. `runAction` reads `activeSession` for the refine
      // path; the magic-action path reads `file`, which the user uploaded
      // for this session.
      if (requestedId !== activeSessionId) {
        setActiveSessionId(requestedId);
      }
      // Persist the override immediately (so the chip flips to `(override)`
      // even before the re-run lands) and fire the action with the wrap.
      updateSession(requestedId, { languageOverride: lang === 'auto' ? null : lang });
      runAction(actionId, undefined, { languageOverride: lang });
    };
    window.addEventListener('og:language-override', onOverride);
    return () => window.removeEventListener('og:language-override', onOverride);
  }, [activeSessionId, sessions, runAction, updateSession]);

  const cancelRunning = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      showError('CAP_ABORTED', { message: 'Cancelled.', hint: null });
    }
  }, []);

  const retryLastAction = useCallback(() => {
    if (!activeSession?.lastError?.actionId) return;
    runAction(activeSession.lastError.actionId);
  }, [activeSession, runAction]);

  const clearLastError = useCallback(() => {
    if (!activeSessionId) return;
    updateSession(activeSessionId, { lastError: null });
  }, [activeSessionId, updateSession]);

  const handleRunPrompt = useCallback(() => {
    if (!customPrompt.trim()) return;
    runAction('text', customPrompt);
  }, [customPrompt, runAction]);

  const createCompile = useCallback(() => {
    const fresh = makeCompile({ name: 'Untitled compile', theme });
    setCompiles(prev => [fresh, ...prev]);
    setActiveCompileId(fresh.id);
    return fresh.id;
  }, [theme]);

  const deleteCompile = useCallback((id) => {
    setCompiles(prev => prev.filter(c => c.id !== id));
    setActiveCompileId(curr => (curr === id ? null : curr));
  }, []);

  const openCompiler = useCallback(() => {
    setCompileOpen(true);
    if (compiles.length === 0) {
      createCompile();
    } else if (!activeCompileId || !compiles.some(c => c.id === activeCompileId)) {
      setActiveCompileId(compiles[0].id);
    }
  }, [compiles, activeCompileId, createCompile]);

  // Build palette action list (magic actions + system commands).
  const paletteActions = [
    ...MAGIC_ACTIONS,
    { id: '__theme_cycle__', label: 'Cycle theme', hint: 'Paper → Sepia → Ink', group: 'System', glyph: '◐' },
    { id: '__compile__',     label: 'Open Compile Builder', hint: 'Compose blocks across sessions', group: 'System', glyph: '▤' },
    { id: '__new__',         label: 'New session', hint: 'Start a blank document', group: 'System', glyph: '+' },
    ...(activeSessionId ? [{
      id: '__delete_active__',
      label: 'Delete current session',
      hint: activeSession?.filename || '',
      group: 'System',
      glyph: '×',
    }] : []),
  ];

  const handlePalettePick = (id) => {
    setPaletteOpen(false);
    if (id === '__theme_cycle__') return cycleTheme();
    if (id === '__compile__')     return openCompiler();
    if (id === '__new__')         return createNewSession('Untitled');
    if (id === '__delete_active__') {
      if (activeSessionId) deleteSession(activeSessionId);
      return;
    }
    runAction(id);
  };

  return (
    <div className="og-app">
      <a className="og-skip-link" href="#og-main-canvas">Skip to content</a>
      <TopBar
        activeSession={activeSession}
        theme={theme}
        onThemeCycle={cycleTheme}
        onPaletteOpen={() => setPaletteOpen(true)}
        onDiagnosticsOpen={() => setDiagnosticsOpen(true)}
      />
      <MobileTabs pane={mobilePane} onChange={setMobilePane} />
      <main id="og-main-canvas" className="og-main" data-mobile-pane={mobilePane}>
        <LibraryRail
          sessions={sessions}
          activeSessionId={activeSessionId}
          setActiveSessionId={setActiveSessionId}
          deleteSession={deleteSession}
          onUpload={handleUpload}
          onRequestPreview={setPendingPreviewFile}
        />
        <SourceColumn
          session={activeSession}
          file={file}
          processing={processing}
          onRun={runAction}
        />
        <ErrorBoundary>
          <OutputColumn
            session={activeSession}
            file={file}
            processing={processing}
            prompt={customPrompt}
            setPrompt={setCustomPrompt}
            onRunPrompt={handleRunPrompt}
            onShowToast={showToast}
            onCompile={openCompiler}
            onUpdateSession={updateActiveSession}
            onCancel={cancelRunning}
            onRetry={retryLastAction}
            onDismissError={clearLastError}
            hasFile={!!file}
          />
        </ErrorBoundary>
      </main>

      {paletteOpen && (
        <CommandPalette
          actions={paletteActions}
          onPick={handlePalettePick}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      {pendingPreviewFile && (
        <UploadConfirmModal
          file={pendingPreviewFile}
          onConfirm={(f) => { setPendingPreviewFile(null); handleUpload(f); }}
          onCancel={() => setPendingPreviewFile(null)}
        />
      )}

      {compileOpen && (
        <div className="og-modal-shroud og-modal-shroud--compile" role="dialog" aria-label="Compile Builder">
          <div className="og-modal-head">
            <span className="og-modal-title">Compile Builder — {compiles.length} compile{compiles.length === 1 ? '' : 's'}</span>
            <div className="og-modal-actions">
              <button className="og-export-btn" onClick={() => setCompileOpen(false)}>
                <span>Close</span>
              </button>
            </div>
          </div>
          <div className="og-modal-body og-modal-body--compile">
            <ErrorBoundary>
              <CompileBuilder
                compiles={compiles}
                setCompiles={setCompiles}
                activeCompileId={activeCompileId}
                setActiveCompileId={setActiveCompileId}
                sessions={sessions}
                onCreateCompile={createCompile}
                onDeleteCompile={deleteCompile}
              />
            </ErrorBoundary>
          </div>
        </div>
      )}

      {firstRun && (
        <WelcomeModal
          onClose={dismissWelcome}
          onTrySample={(sampleFile) => setPendingPreviewFile(sampleFile)}
        />
      )}

      <Toast entry={toast} onDismiss={dismissToast} />
      <DiagnosticsPanel open={diagnosticsOpen} onClose={() => setDiagnosticsOpen(false)} />
    </div>
  );
}

export default App;
