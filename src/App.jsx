import { useState, useEffect, useRef, useCallback } from 'react';
import TopBar from './components/TopBar';
import LibraryRail from './components/LibraryRail';
import SourceColumn from './components/SourceColumn';
import OutputColumn from './components/OutputColumn';
import MobileTabs from './components/MobileTabs';
import CommandPalette from './components/CommandPalette';
import UploadConfirmModal from './components/UploadConfirmModal';
import BatchActionPrompt from './components/BatchActionPrompt';
import WelcomeModal from './components/WelcomeModal';
import Toast from './components/Toast';
import CompileBuilder from './components/CompileBuilder';
import DiagnosticsPanel from './components/DiagnosticsPanel';
import ErrorBoundary from './components/ErrorBoundary';
import { MAGIC_ACTIONS, LANGUAGE_OVERRIDE_PROMPT } from './magicActions';
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
  syncAutoBlocks,
  findAutoCompileForSession,
  defaultAutoCompileName,
  computeDesiredAutoBlocks,
} from './compile';
import { readSessionParam, urlWithoutSessionParam, resolveSessionId } from './deepLink';
import {
  getImage as idbGetImage,
  setImage as idbSetImage,
  deleteImage as idbDeleteImage,
  blobToDataURL,
  dataURLToBlob,
} from './storage/idb';
import { enqueue as queueEnqueue, setRunner as setQueueRunner, updateProgress as updateQueueProgress } from './queue.js';

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
const SESSION_SCHEMA_VERSION = 5;

function migrateSession(s) {
  if (!s || typeof s !== 'object') return s;
  if (s.version === SESSION_SCHEMA_VERSION) return s;
  // v1 → v2 → v3 → v4 → v5: leave existing text/svg/images in place synchronously.
  // `refinements` defaults to undefined and is populated lazily on the first
  // refine action. v3 → v4 image data migration is handled by the async
  // migrateLegacySessions effect after first mount; v4 → v5 just adds the
  // optional `sketches` and `selectedSketchId` fields (default undefined),
  // populated by the multi-sketch detect+vectorize flow. We stamp the
  // version here so a session loaded from localStorage doesn't get re-touched.
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
  const [pendingBatchFiles, setPendingBatchFiles] = useState(null);
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
  // Vectorize batch state. `vectorizeAbortRef` holds the AbortController for
  // the in-flight per-sketch fetch so Cancel can interrupt the current call.
  // `batchAbortRef` is a flag the for-of loop checks between iterations to
  // bail out of the queue without waiting for the current fetch's natural
  // completion.
  const vectorizeAbortRef = useRef(null);
  const batchAbortRef = useRef({ cancelled: false });
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
      // v5 fields (optional — only populated by multi-sketch flow).
      sketches: undefined,
      selectedSketchId: undefined,
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
    // v3 cascade: drop the auto-compile bound to this source. Manual cross-
    // source compiles (sourceId === null) are never touched.
    setCompiles(prev => {
      const auto = prev.find(c => c && c.sourceId === id);
      if (!auto) return prev;
      return prev.filter(c => c.id !== auto.id);
    });
    setActiveCompileId(curr => {
      // If the deleted session's auto-compile was active, fall back to none.
      // The next openCompiler call will pick the right one.
      return curr;
    });
  }, []);

  // v3 — keep the auto-compile bound to a session in lockstep with the
  // session's extracted outputs. Called at every extraction completion
  // point (runAction, vectorizeSketch, queue runner, openSketch). Lazy-
  // creates the auto-compile on first sync so users with empty sessions
  // don't get spurious compiles. Idempotent: `syncAutoBlocks` returns the
  // same compile reference when nothing changed, and we no-op the state
  // write in that case.
  const syncAutoCompileForSession = useCallback((sessionAfter) => {
    if (!sessionAfter || !sessionAfter.id) return;
    setCompiles(prev => {
      const existing = findAutoCompileForSession(sessionAfter.id, prev);
      if (!existing) {
        // Nothing to sync if the session has no auto-syncable content yet
        // — avoid creating an empty compile that would clutter the palette.
        const desired = computeDesiredAutoBlocks(sessionAfter);
        if (desired.length === 0) return prev;
        const fresh = makeCompile({
          name: defaultAutoCompileName(sessionAfter),
          sourceId: sessionAfter.id,
          theme,
        });
        const synced = syncAutoBlocks(fresh, sessionAfter);
        return [synced, ...prev];
      }
      const synced = syncAutoBlocks(existing, sessionAfter);
      if (synced === existing) return prev;
      return prev.map(c => (c.id === existing.id ? synced : c));
    });
  }, [theme]);

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
    const startedAt = Date.now();
    setProcessing({ actionId, progress: 0, stage: 'preparing', token, startedAt });
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

  // Vectorize-flavoured progress: no random jitter, no terminal flush. The
  // caller drives `progress` and `stage` directly via `setVectorizeStage`.
  // Used for single sketches (`actionId: 'sketch'`) and batches
  // (`actionId: 'sketch-batch'`) so the existing OCR_BUSY gate in `runAction`
  // automatically blocks magic-action tiles while a vectorize is in flight.
  const startVectorizing = useCallback((actionId, label) => {
    const token = {};
    setProcessing({ actionId, progress: 0, stage: label || 'vectorizing', token, startedAt: Date.now() });
    progressRef.current = { token, id: null };
    return token;
  }, []);

  const setVectorizeStage = useCallback((token, progress, stage) => {
    setProcessing(p => (p?.token === token ? { ...p, progress, stage } : p));
  }, []);

  // Track K — runAction accepts a `languageOverride` (ISO code or 'auto')
  // as a third argument or via an options object. When set, the action's
  // base prompt is wrapped by LANGUAGE_OVERRIDE_PROMPT so Gemini treats
  // the document as written in the chosen language and keeps emitting the
  // trailing __detected_lang line. Passing 'auto' (or omitting) falls
  // through to the base prompt.
  const runAction = useCallback(async (actionId, customPromptOverride, opts = {}) => {
    const languageOverride = (opts && typeof opts === 'object') ? opts.languageOverride : null;

    if (!file) {
      showError('OCR_BAD_FILE');
      return;
    }
    if (processing) {
      showError('OCR_BUSY');
      return;
    }

    const action = MAGIC_ACTIONS.find(a => a.id === actionId);
    const endpoint = action?.endpoint || '/api/extract';
    const basePrompt = customPromptOverride ?? (action?.prompt ?? '');
    // Track K — language override only wraps text-bearing magic-action prompts.
    // SVG endpoints have null prompts and an override would be a no-op anyway.
    const prompt = (languageOverride && languageOverride !== 'auto' && basePrompt)
      ? LANGUAGE_OVERRIDE_PROMPT(basePrompt, languageOverride)
      : basePrompt;

    let sessionId = activeSessionId;
    if (!sessionId) sessionId = createNewSession(file.name);

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    const myToken = startProgress(actionId);
    // Flip to Output immediately so the user can see the processing strip + percentage,
    // not stare at the Source pane wondering if anything's happening.
    setMobilePane('output');

    try {
      const formData = new FormData();
      formData.append('file', file);
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
      let updates = { kind: actionId };
      // Track K — record the active language override on the session so a
      // reload picks the same chip state. `auto` clears the override.
      if (languageOverride === 'auto') {
        updates.languageOverride = null;
      } else if (languageOverride) {
        updates.languageOverride = languageOverride;
      }
      // v4 — preserve prior actions' outputs by merging into a per-action
      // map. Each new extraction populates outputs[actionId] below in the
      // result-shape branches; other actions' entries survive untouched.
      const priorOutputs = (activeSession && typeof activeSession.outputs === 'object')
        ? activeSession.outputs
        : {};
      if (data.svg) {
        updates.svg = data.svg;
        updates.text = '';
        updates.outputs = { ...priorOutputs, [actionId]: { kind: 'svg', svg: data.svg } };
        hadResponse = true;
      } else if (Array.isArray(data.sketches)) {
        // Multi-sketch discovery path (Phase 15). The server detected 2+
        // sketches in the upload and returned candidates with optional
        // thumbnails (images only, PDFs omit them — Phase 2 follow-up).
        // Per-card vectorization is handled lazily by vectorizeSketch().
        // Cap thumbnail size by storing them inline; the localStorage
        // circuit breaker handles overflow if a user accumulates many
        // sketch sessions. selectedSketchId seeds the picker on first paint.
        updates.sketches = data.sketches.map(s => ({
          id: s.id,
          description: s.description,
          bbox: s.bbox,
          page: s.page || 1,
          thumbnail: s.thumbnail || null,
          svg: '',
          status: 'pending', // 'pending' | 'running' | 'done' | 'error'
        }));
        updates.selectedSketchId = data.sketches[0]?.id || null;
        updates.svg = '';
        updates.text = data.message || `Found ${data.sketches.length} sketches. Pick one to vectorize.`;
        hadResponse = true;
      } else if (typeof data.text === 'string') {
        updates.text = data.text;
        updates.svg = '';
        updates.outputs = { ...priorOutputs, [actionId]: { kind: 'text', text: data.text } };
        hadResponse = true;
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
      // v3 — auto-append every extraction result to the source's worksheet.
      // Synthesize the post-update session snapshot from the closure-captured
      // active session (or a freshly-created skeleton if this run created
      // the session via `createNewSession` above). Using a snapshot here
      // sidesteps the setSessions-then-read race that would otherwise see
      // stale state inside `setCompiles`'s updater.
      const beforeSession = (activeSession && activeSession.id === sessionId)
        ? activeSession
        : { id: sessionId, filename: file?.name || 'Untitled', date: Date.now(), text: '', svg: '', kind: 'text' };
      syncAutoCompileForSession({ ...beforeSession, ...updates });
      const label = action?.label || 'Run';
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
  }, [file, processing, activeSessionId, activeSession, createNewSession, updateSession, startProgress, finishProgress, syncAutoCompileForSession]);

  // Phase 15 — vectorize a single detected sketch by id. Posts to
  // /api/sketch-to-svg with the sketch's bbox + page; the server crops
  // (image) or prompt-hints (PDF) before calling Gemini. Updates the
  // session.sketches[i].status + svg in place. Cold-resume friendly: if
  // `file` is no longer in memory (page reload), surfaces a toast and
  // bails — the user will need to re-upload to continue vectorizing.
  //
  // Options:
  //   - opts.silent: when true, skip the per-call processing strip / busy
  //     gate. Used by `vectorizeAllSketches` so the BATCH owns one
  //     processing slot for its full duration instead of toggling for every
  //     iteration. Caller is responsible for the gate in that case.
  const vectorizeSketch = useCallback(async (sketchId, opts = {}) => {
    if (!activeSessionId) return;
    if (!file) {
      showError('CAP_NO_FILE', {
        message: 'Re-upload the original to vectorize this sketch.',
        hint: 'Sketch detection ran on the previous upload; we need the file again to vectorize.',
      });
      return;
    }
    const silent = !!opts.silent;
    const session = sessions.find(s => s.id === activeSessionId);
    const sketch = session?.sketches?.find(s => s.id === sketchId);
    if (!sketch) return;
    if (sketch.status === 'running') return;
    if (!silent && processing) {
      showError('OCR_BUSY');
      return;
    }

    // Mark running.
    setSessions(prev => prev.map(s => s.id !== activeSessionId ? s : ({
      ...s,
      sketches: s.sketches.map(sk => sk.id === sketchId ? { ...sk, status: 'running' } : sk),
    })));

    // Per-call AbortController so cancel can interrupt the in-flight fetch.
    const controller = new AbortController();
    vectorizeAbortRef.current = controller;

    let progressToken = null;
    if (!silent) {
      progressToken = startVectorizing('sketch', `Vectorizing sketch ${sketchId}`);
    }

    try {
      const formData = new FormData();
      formData.append('files', file);
      formData.append('bbox', JSON.stringify(sketch.bbox));
      formData.append('page', String(sketch.page || 1));
      const r = await fetch('/api/sketch-to-svg', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || typeof data.svg !== 'string' || !data.svg.trim()) {
        const entry = await errFromResponse(r);
        const e = new Error(entry.message);
        e.__registryEntry = entry;
        throw e;
      }
      // v3 — capture the post-update session inside the updater so we sync
      // against the freshest state, not a closure-captured snapshot. This
      // matters when `vectorizeAllSketches` runs vectorizeSketch in a loop:
      // each iteration's outer-scope `session` is stale (taken before any
      // sibling vectorize landed), so a closure-based sessionAfter would
      // show only the latest sketch as `done` and the sync would prune
      // every previously-synced sketch block.
      let sessionAfter = null;
      setSessions(prev => prev.map(s => {
        if (s.id !== activeSessionId) return s;
        const next = {
          ...s,
          sketches: s.sketches.map(sk =>
            sk.id === sketchId ? { ...sk, svg: data.svg, status: 'done' } : sk
          ),
        };
        sessionAfter = next;
        return next;
      }));
      if (sessionAfter) syncAutoCompileForSession(sessionAfter);
      if (!silent) showInfo(`Sketch ${sketchId} vectorized`);
    } catch (err) {
      if (err?.name === 'AbortError') {
        // Cancelled by user — reset status to pending so per-card Retry works.
        setSessions(prev => prev.map(s => s.id !== activeSessionId ? s : ({
          ...s,
          sketches: s.sketches.map(sk =>
            sk.id === sketchId && sk.status === 'running' ? { ...sk, status: 'pending' } : sk
          ),
        })));
        throw err;
      }
      console.error(err);
      setSessions(prev => prev.map(s => s.id !== activeSessionId ? s : ({
        ...s,
        sketches: s.sketches.map(sk => sk.id === sketchId ? { ...sk, status: 'error' } : sk),
      })));
      const entry = err.__registryEntry || errFromException(err);
      showError(entry.code, { message: entry.message, hint: entry.hint });
    } finally {
      if (vectorizeAbortRef.current === controller) vectorizeAbortRef.current = null;
      if (!silent && progressToken) finishProgress(progressToken);
    }
  }, [file, activeSessionId, sessions, processing, syncAutoCompileForSession, startVectorizing, finishProgress]);

  // Phase 15 — sequentially vectorize every pending sketch on the active
  // session. Stops on the first error so the user can decide whether to
  // retry. Sequential (per the plan default) to dodge the per-IP semaphore
  // and avoid doubling Gemini spend on a click.
  //
  // 2026-04-27: the batch now owns one `processing` slot for its full
  // duration so magic-action tiles, custom prompt, and per-card Vectorize
  // buttons all gate via the existing OCR_BUSY check. The user can interrupt
  // mid-batch via `cancelVectorizeBatch` — the for-of loop checks the
  // shared `batchAbortRef` flag between iterations so the next sketch
  // doesn't fire after Stop.
  const vectorizeAllSketches = useCallback(async () => {
    if (processing) {
      showError('OCR_BUSY');
      return;
    }
    const session = sessions.find(s => s.id === activeSessionId);
    if (!session?.sketches) return;
    const pending = session.sketches.filter(s => s.status !== 'done');
    if (pending.length === 0) return;

    batchAbortRef.current = { cancelled: false };
    const total = pending.length;
    const token = startVectorizing('sketch-batch', `Vectorizing 1 of ${total}`);

    try {
      let done = 0;
      for (const sketch of session.sketches) {
        if (batchAbortRef.current.cancelled) break;
        if (sketch.status === 'done') continue;
        done += 1;
        const pct = Math.max(2, Math.round(((done - 1) / total) * 100));
        setVectorizeStage(token, pct, `Vectorizing ${done} of ${total}`);
        const before = Date.now();
        try {
          await vectorizeSketch(sketch.id, { silent: true });
        } catch (err) {
          if (err?.name === 'AbortError') break;
          // vectorizeSketch already routed the error toast; bail to let the user decide.
          break;
        }
        if (batchAbortRef.current.cancelled) break;
        // After each await, re-read the latest session to check if the most
        // recent vectorize errored — bail to let the user decide.
        const after = sessions.find(s => s.id === activeSessionId);
        const updatedSketch = after?.sketches?.find(sk => sk.id === sketch.id);
        if (updatedSketch?.status === 'error') break;
        // Tiny breather so the per-IP semaphore can release.
        if (Date.now() - before < 200) {
          await new Promise(r => setTimeout(r, 200));
        }
      }
      setVectorizeStage(token, 100, 'finalizing');
    } finally {
      finishProgress(token);
      batchAbortRef.current = { cancelled: false };
    }
  }, [sessions, activeSessionId, vectorizeSketch, processing, startVectorizing, setVectorizeStage, finishProgress]);

  // User-initiated stop for the vectorize batch. Aborts the in-flight
  // /api/sketch-to-svg fetch (so the current sketch doesn't finish silently)
  // AND flips the loop flag so the next sketch won't dequeue.
  const cancelVectorizeBatch = useCallback(() => {
    batchAbortRef.current = { cancelled: true };
    if (vectorizeAbortRef.current) {
      try { vectorizeAbortRef.current.abort(); } catch { /* ignore */ }
    }
    showError('OCR_ABORTED', { message: 'Vectorize stopped.', hint: 'Resume any sketch via its Vectorize button.' });
  }, []);

  // Phase 15 (v3 update) — promote a vectorized sketch to the main canvas
  // without destroying the picker. `session.sketches[]` is preserved so the
  // user can return to the picker via the "Show all sketches" link in the
  // focused view; previously the array was cleared, which forced an
  // expensive re-detect to recover the multi-SVG state.
  const openSketch = useCallback((sketchId) => {
    if (!activeSessionId) return;
    const session = sessions.find(s => s.id === activeSessionId);
    const sketch = session?.sketches?.find(s => s.id === sketchId);
    if (!sketch?.svg) return;
    const updates = {
      svg: sketch.svg,
      text: '',
      kind: 'sketch',
      selectedSketchId: sketchId,
    };
    updateSession(activeSessionId, updates);
    if (session) syncAutoCompileForSession({ ...session, ...updates });
  }, [sessions, activeSessionId, updateSession, syncAutoCompileForSession]);

  // v3 — return to the multi-sketch picker after the user opened one
  // sketch in the focused view. Clears `session.svg` so the rendered
  // canvas falls back to the picker (which keys on `sketches.length >= 1`)
  // while keeping every vectorized sketch intact.
  const showAllSketches = useCallback(() => {
    if (!activeSessionId) return;
    const session = sessions.find(s => s.id === activeSessionId);
    if (!session) return;
    const updates = { svg: '', selectedSketchId: undefined };
    updateSession(activeSessionId, updates);
    syncAutoCompileForSession({ ...session, ...updates });
  }, [sessions, activeSessionId, updateSession, syncAutoCompileForSession]);

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
          updates.outputs = { [actionId]: { kind: 'svg', svg: data.svg } };
          hadResponse = true;
        } else if (Array.isArray(data.sketches)) {
          // Multi-sketch discovery in queue-batch flow. Same shape as runAction.
          updates.sketches = data.sketches.map(s => ({
            id: s.id,
            description: s.description,
            bbox: s.bbox,
            page: s.page || 1,
            thumbnail: s.thumbnail || null,
            svg: '',
            status: 'pending',
          }));
          updates.selectedSketchId = data.sketches[0]?.id || null;
          updates.svg = '';
          updates.text = data.message || `Found ${data.sketches.length} sketches. Pick one to vectorize.`;
          hadResponse = true;
        } else if (typeof data.text === 'string') {
          updates.text = data.text;
          updates.svg = '';
          updates.outputs = { [actionId]: { kind: 'text', text: data.text } };
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
        // v3 — auto-append queue extraction result to the new session's
        // worksheet. The session was just created via `createNewSession`
        // above with empty fields, so we synthesize the post-update shape
        // from those known defaults.
        const sessionAfter = {
          id: sessionId,
          filename: queuedFile.name,
          date: Date.now(),
          text: '',
          svg: '',
          kind: 'text',
          ...updates,
        };
        syncAutoCompileForSession(sessionAfter);
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
    // The runner closes over `createNewSession` / `updateSession` /
    // `syncAutoCompileForSession`; all three are stable callbacks so this
    // effect runs at mount only.
  }, [createNewSession, updateSession, syncAutoCompileForSession]);

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

  // Track R — language override re-run callback. SourceColumn forwards
  // this directly to LanguagePill via the `onOverride` prop. We resolve
  // the target session (defaulting to the currently active one), persist
  // the override on the session, and re-run the most-recent magic action
  // with the override wrapped around the base prompt.
  //
  // Track K shipped this via a window-level `og:language-override` event
  // because SourceColumn wasn't editable then. With direct props, that
  // workaround is gone — see Track R.
  const handleLanguageOverride = useCallback((lang, requestedSessionId) => {
    if (!lang) return;
    // Use the requested sessionId when present so a click on a pill bound
    // to a stale session can't misroute the re-run; fall back to the
    // currently active session.
    const requestedId = requestedSessionId || activeSessionId;
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
    // `auto` clears the override and re-runs the base prompt.
    if (lang === 'auto') {
      updateSession(requestedId, { languageOverride: null });
      runAction(actionId);
    } else {
      updateSession(requestedId, { languageOverride: lang });
      runAction(actionId, undefined, { languageOverride: lang });
    }
  }, [activeSessionId, sessions, runAction, updateSession]);

  const cancelRunning = useCallback(() => {
    // Vectorize batch and single vectorize go through their own abort
    // surface so the per-sketch status can reset cleanly.
    if (processing?.actionId === 'sketch-batch') {
      batchAbortRef.current = { cancelled: true };
      if (vectorizeAbortRef.current) {
        try { vectorizeAbortRef.current.abort(); } catch { /* ignore */ }
      }
      showError('OCR_ABORTED', { message: 'Vectorize stopped.', hint: 'Resume any sketch via its Vectorize button.' });
      return;
    }
    if (processing?.actionId === 'sketch' && vectorizeAbortRef.current) {
      try { vectorizeAbortRef.current.abort(); } catch { /* ignore */ }
      showError('OCR_ABORTED', { message: 'Vectorize stopped.', hint: null });
      return;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      showError('CAP_ABORTED', { message: 'Cancelled.', hint: null });
    }
  }, [processing]);

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
    // v3 — when the user opens the worksheet from a source, prefer that
    // source's auto-compile so they land on the consolidated output for
    // what they've been extracting. Fall back to the prior selection / the
    // first available compile so manual cross-source compiles still open
    // when no source is active.
    if (activeSessionId) {
      const auto = findAutoCompileForSession(activeSessionId, compiles);
      if (auto) {
        setActiveCompileId(auto.id);
        return;
      }
    }
    if (compiles.length === 0) {
      createCompile();
    } else if (!activeCompileId || !compiles.some(c => c.id === activeCompileId)) {
      setActiveCompileId(compiles[0].id);
    }
  }, [compiles, activeCompileId, activeSessionId, createCompile]);

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
          onRequestBatchAction={setPendingBatchFiles}
        />
        <SourceColumn
          session={activeSession}
          file={file}
          processing={processing}
          onRun={runAction}
          onUpdateSession={(updates) => activeSessionId && updateSession(activeSessionId, updates)}
          onLanguageOverride={handleLanguageOverride}
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
            onUpdateSession={(updates) => activeSessionId && updateSession(activeSessionId, updates)}
            onCancel={cancelRunning}
            onRetry={retryLastAction}
            onDismissError={clearLastError}
            hasFile={!!file}
            sessionCount={sessions.length}
            onVectorizeSketch={vectorizeSketch}
            onVectorizeAllSketches={vectorizeAllSketches}
            onCancelBatch={cancelVectorizeBatch}
            onOpenSketch={openSketch}
            onShowAllSketches={showAllSketches}
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

      {pendingBatchFiles && (
        <BatchActionPrompt
          files={pendingBatchFiles}
          onConfirm={(actionId) => {
            const batch = pendingBatchFiles;
            setPendingBatchFiles(null);
            for (const f of batch) queueEnqueue(f, actionId);
            showToast(`Queued ${batch.length} file${batch.length === 1 ? '' : 's'} — running sequentially.`);
          }}
          onCancel={() => setPendingBatchFiles(null)}
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
