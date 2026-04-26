import { useState, useEffect, useRef, useCallback } from 'react';
import TopBar from './components/TopBar';
import LibraryRail from './components/LibraryRail';
import SourceColumn from './components/SourceColumn';
import OutputColumn from './components/OutputColumn';
import MobileTabs from './components/MobileTabs';
import CommandPalette from './components/CommandPalette';
import UploadConfirmModal from './components/UploadConfirmModal';
import Toast from './components/Toast';
import WorksheetBuilder from './components/WorksheetBuilder';
import { MAGIC_ACTIONS } from './magicActions';

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

const initialSessions = (() => {
  const raw = readJSON('ogOCR_sessions', []);
  return Array.isArray(raw) ? raw : [];
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

function pickInitialMobilePane(sessions, activeId) {
  const active = sessions.find(s => s.id === activeId);
  if (active && (active.text || active.svg)) return 'output';
  if (sessions.length > 0) return 'source';
  return 'library';
}

const NEXT_THEME = { paper: 'sepia', sepia: 'ink', ink: 'paper' };

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
  const [mobilePane, setMobilePane] = useState(() => pickInitialMobilePane(initialSessions, initialActiveId));

  const abortRef = useRef(null);
  const progressRef = useRef(null);

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
          setToast('Storage full — dropped oldest session.');
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

  // Theme: write data-theme attr + persist.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('ogOCR_theme', theme); } catch { /* ignore */ }
  }, [theme]);

  const cycleTheme = useCallback(() => {
    setTheme(t => NEXT_THEME[t] || 'paper');
  }, []);

  const showToast = useCallback((message) => {
    setToast(message);
    setTimeout(() => setToast(null), 2400);
  }, []);

  // Cmd/Ctrl + K → palette toggle.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(p => !p);
      } else if (e.key === 'Escape') {
        setPaletteOpen(false);
        setCompileOpen(false);
        setPendingPreviewFile(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const createNewSession = useCallback((filename, kind = 'text') => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const fresh = { id, filename, date: Date.now(), text: '', svg: '', kind };
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

  const stopProgress = useCallback(() => {
    if (progressRef.current) {
      clearTimeout(progressRef.current);
      progressRef.current = null;
    }
  }, []);

  const startProgress = useCallback((actionId) => {
    setProcessing({ actionId, progress: 0, stage: 'preparing' });
    let pct = 0;
    const stages = [
      { at: 12, name: 'preparing' },
      { at: 28, name: 'scanning' },
      { at: 52, name: 'recognizing' },
      { at: 78, name: 'structuring' },
      { at: 96, name: 'finalizing' },
    ];
    const tick = () => {
      pct = Math.min(95, pct + Math.random() * 6 + 3);
      const stage = stages.find(s => pct < s.at)?.name ?? 'finalizing';
      setProcessing(p => p ? { ...p, progress: pct, stage } : null);
      if (pct < 95) progressRef.current = setTimeout(tick, 220 + Math.random() * 180);
    };
    progressRef.current = setTimeout(tick, 200);
  }, []);

  const finishProgress = useCallback(() => {
    stopProgress();
    setProcessing(p => p ? { ...p, progress: 100, stage: 'finalizing' } : null);
    setTimeout(() => setProcessing(null), 220);
  }, [stopProgress]);

  const runAction = useCallback(async (actionId, customPromptOverride) => {
    if (!file) {
      showToast('Upload a document first.');
      return;
    }
    if (processing) return;

    const action = MAGIC_ACTIONS.find(a => a.id === actionId);
    const endpoint = action?.endpoint || '/api/extract';
    const prompt = customPromptOverride ?? action?.prompt ?? '';

    let sessionId = activeSessionId;
    if (!sessionId) sessionId = createNewSession(file.name);

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    startProgress(actionId);
    // Flip to Output immediately so the user can see the processing strip + percentage,
    // not stare at the Source pane wondering if anything's happening.
    setMobilePane('output');

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (prompt) formData.append('prompt', prompt);

      const r = await fetch(endpoint, { method: 'POST', body: formData, signal });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);

      const updates = { kind: actionId };
      if (data.svg) {
        updates.svg = data.svg;
        updates.text = '';
      } else if (Array.isArray(data.images)) {
        if (data.images.length === 0) {
          updates.text = '_No visual components found in this document._';
          updates.svg = '';
        } else {
          let body = `**${data.message || `Found ${data.images.length} visual components.`}**\n\n`;
          data.images.forEach((img) => {
            body += `### Image ${img.id}\n\n${img.desc}\n\n`;
            if (img.data) body += `![Image ${img.id}](${img.data})\n\n`;
          });
          updates.text = body;
          updates.svg = '';
        }
      } else if (typeof data.text === 'string') {
        updates.text = data.text;
        updates.svg = '';
      }
      updateSession(sessionId, updates);
      showToast(`${action?.label || 'Run'} complete`);
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error(err);
      updateSession(sessionId, { text: `Error: ${err.message}`, svg: '' });
      showToast('Extraction failed');
    } finally {
      finishProgress();
      if (abortRef.current?.signal === signal) abortRef.current = null;
    }
  }, [file, processing, activeSessionId, createNewSession, updateSession, showToast, startProgress, finishProgress]);

  const handleRunPrompt = useCallback(() => {
    if (!customPrompt.trim()) return;
    runAction('text', customPrompt);
  }, [customPrompt, runAction]);

  // Build palette action list (magic actions + system commands).
  const paletteActions = [
    ...MAGIC_ACTIONS,
    { id: '__theme_cycle__', label: 'Cycle theme', hint: 'Paper → Sepia → Ink', group: 'System', glyph: '◐' },
    { id: '__compile__',     label: 'Open Worksheet Builder', hint: 'Compile all sessions for printing', group: 'System', glyph: '▤' },
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
    if (id === '__compile__')     return setCompileOpen(true);
    if (id === '__new__')         return createNewSession('Untitled');
    if (id === '__delete_active__') {
      if (activeSessionId) deleteSession(activeSessionId);
      return;
    }
    runAction(id);
  };

  return (
    <div className="og-app">
      <TopBar
        activeSession={activeSession}
        theme={theme}
        onThemeCycle={cycleTheme}
        onPaletteOpen={() => setPaletteOpen(true)}
      />
      <MobileTabs pane={mobilePane} onChange={setMobilePane} />
      <main className="og-main" data-mobile-pane={mobilePane}>
        <LibraryRail
          sessions={sessions}
          activeSessionId={activeSessionId}
          setActiveSessionId={setActiveSessionId}
          deleteSession={deleteSession}
          onUpload={handleUpload}
          onRequestPreview={setPendingPreviewFile}
          onUploadError={showToast}
        />
        <SourceColumn
          session={activeSession}
          file={file}
          processing={processing}
          onRun={runAction}
          showTablets={false}
        />
        <OutputColumn
          session={activeSession}
          processing={processing}
          prompt={customPrompt}
          setPrompt={setCustomPrompt}
          onRunPrompt={handleRunPrompt}
          onShowToast={showToast}
          onCompile={() => setCompileOpen(true)}
          onUpdateSession={updateActiveSession}
          hasFile={!!file}
        />
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
        <div className="og-modal-shroud">
          <div className="og-modal-head">
            <span className="og-modal-title">Worksheet Compiler — {sessions.length} pages</span>
            <div className="og-modal-actions">
              <button
                className="og-export-btn"
                onClick={() => window.print()}
                disabled={sessions.length === 0}
              >
                <span className="og-export-glyph">▢</span>
                <span>Print</span>
              </button>
              <button className="og-export-btn" onClick={() => setCompileOpen(false)}>
                <span>Close</span>
              </button>
            </div>
          </div>
          <div className="og-modal-body">
            <WorksheetBuilder sessions={sessions} />
          </div>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}

export default App;
