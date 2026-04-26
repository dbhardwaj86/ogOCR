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
import { MAGIC_ACTIONS } from './magicActions';
import { showError, installErrorSinks, showInfo } from './errors/showError';
import { errFromResponse, errFromException } from './errors/errFromResponse';
import { formatMessage } from './errors/codes';
import { nextTheme } from './theme';
import {
  COMPILE_STORAGE_KEY,
  ACTIVE_COMPILE_KEY,
  createCompile as makeCompile,
  migrateCompile,
} from './compile';

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

// Schema version. v2 keeps `session.images` as the structured array from
// /api/extract-images so the compile builder can drop image blocks directly,
// instead of treating the markdown blob as the source of truth.
const SESSION_SCHEMA_VERSION = 2;

function migrateSession(s) {
  if (!s || typeof s !== 'object') return s;
  if (s.version === SESSION_SCHEMA_VERSION) return s;
  // v1 → v2: leave existing text/svg in place; just stamp the version so we
  // don't re-migrate. Legacy `images: text` markdown blobs continue to render
  // through the markdown path until the user re-runs the action.
  return { ...s, version: SESSION_SCHEMA_VERSION };
}

const initialSessions = (() => {
  const raw = readJSON('ogOCR_sessions', []);
  if (!Array.isArray(raw)) return [];
  return raw.map(migrateSession);
})();
const initialActiveId = (() => {
  try { return localStorage.getItem('ogOCR_active_session') || null; } catch { return null; }
})();
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
  const [activeSessionId, setActiveSessionId] = useState(initialActiveId);
  const [file, setFile] = useState(null);
  const [customPrompt, setCustomPrompt] = useState(initialPrompt);
  const [theme, setTheme] = useState(initialTheme);
  const [processing, setProcessing] = useState(null);
  const [toast, setToast] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [compileOpen, setCompileOpen] = useState(false);
  const [pendingPreviewFile, setPendingPreviewFile] = useState(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState(() => pickInitialMobilePane(initialSessions, initialActiveId));
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
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem('ogOCR_sessions', JSON.stringify(sessions));
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
    setSessions(prev => prev.filter(s => s.id !== id));
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

  const runAction = useCallback(async (actionId, customPromptOverride) => {
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
    const prompt = customPromptOverride ?? action?.prompt ?? '';

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

      const updates = { kind: actionId };
      let hadResponse = false;
      if (data.svg) {
        updates.svg = data.svg;
        updates.text = '';
        hadResponse = true;
      } else if (Array.isArray(data.images)) {
        // Native image rendering path (schema v2): keep the structured array
        // on `session.images`. RenderedDoc renders the grid natively; the
        // text field stores only the summary line so the markdown path still
        // works as a fallback for older renderers.
        updates.images = data.images;
        updates.svg = '';
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
      if (!hadResponse) {
        // Empty/malformed response — never claim success.
        const entry = formatMessage('OCR_EMPTY');
        const e = new Error(entry.message);
        e.__registryEntry = entry;
        throw e;
      }
      updates.lastError = null;
      updateSession(sessionId, updates);
      showInfo(`${action?.label || 'Run'} complete`);
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
  }, [file, processing, activeSessionId, createNewSession, updateSession, startProgress, finishProgress]);

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
          showTablets={false}
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
