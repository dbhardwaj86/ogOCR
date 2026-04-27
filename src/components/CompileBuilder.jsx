import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BLOCK_KINDS,
  addBlock,
  insertBlock,
  removeBlock,
  updateBlock,
  reorderBlocks,
  setName,
  setPageSize,
  setTheme,
  touchCompile,
  compileSummary,
} from '../compile';
import CompilePalette from './CompilePalette';
import CompileBlockCard from './CompileBlockCard';
import { showError } from '../errors/showError';
import { errFromException } from '../errors/errFromResponse';
import { buildCompileFormats } from '../saveFormats';

const FILENAME_BAD_CHARS = /[\\/:*?"<>|]/g;
const FILENAME_BIDI = /[‎‏‪-‮]/g;

function safeFilename(name) {
  const cleaned = (name || 'compile')
    .replace(FILENAME_BAD_CHARS, '')
    .replace(FILENAME_BIDI, '')
    .trim()
    .slice(0, 200);
  return cleaned || 'compile';
}

// Inner picker list — mounts fresh on each open so activeIdx defaults
// to 0 implicitly. Keeps the parent free of effect-driven setState.
function CompileSavePicker({ formats, onPick, returnFocusTo, onClose }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const onItemKey = (e, idx) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((idx + 1) % formats.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((idx - 1 + formats.length) % formats.length);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPick(formats[idx]);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      onClose();
      returnFocusTo?.current?.focus();
    }
  };
  return (
    <ul
      className="og-export-menu-list"
      role="menu"
      aria-label="Save format"
      data-testid="og-compile-save-menu"
    >
      {formats.map((it, idx) => (
        <li key={it.id} role="none">
          <button
            type="button"
            role="menuitem"
            className="og-export-menu-item"
            tabIndex={idx === activeIdx ? 0 : -1}
            ref={el => { if (el && idx === activeIdx) el.focus(); }}
            onClick={() => onPick(it)}
            onKeyDown={(e) => onItemKey(e, idx)}
          >
            <span className="og-export-glyph" aria-hidden="true">{it.glyph}</span>
            <span>{it.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function CompileBuilder({
  compiles,
  setCompiles,
  activeCompileId,
  setActiveCompileId,
  sessions,
  onCreateCompile,
  onDeleteCompile,
}) {
  const [dragId, setDragId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);

  const activeCompile = useMemo(
    () => compiles.find(c => c.id === activeCompileId) || null,
    [compiles, activeCompileId]
  );

  const replaceActive = useCallback((mutator) => {
    setCompiles(prev => prev.map(c => (c.id === activeCompileId ? mutator(c) : c)));
  }, [activeCompileId, setCompiles]);

  const renameCompile = useCallback((id, name) => {
    setCompiles(prev => prev.map(c => (c.id === id ? touchCompile({ ...c, name }) : c)));
  }, [setCompiles]);

  const handleAddSessionBlock = useCallback((session) => {
    if (!activeCompile) return;
    replaceActive(c => addBlock(c, {
      kind: BLOCK_KINDS.SESSION,
      sessionId: session.id,
      fallbackName: session.filename || 'Session',
    }));
  }, [activeCompile, replaceActive]);

  const handleAddImageBlock = useCallback((img) => {
    if (!activeCompile) return;
    replaceActive(c => addBlock(c, {
      kind: BLOCK_KINDS.IMAGE,
      src: img.data || '',
      caption: img.desc || `Image ${img.id}`,
    }));
  }, [activeCompile, replaceActive]);

  const handleInsertBlock = useCallback((block) => {
    if (!activeCompile) return;
    replaceActive(c => addBlock(c, block));
  }, [activeCompile, replaceActive]);

  const handleUpdate = useCallback((blockId, patch) => {
    replaceActive(c => updateBlock(c, blockId, patch));
  }, [replaceActive]);

  const handleRemove = useCallback((blockId) => {
    replaceActive(c => removeBlock(c, blockId));
  }, [replaceActive]);

  const handleMove = useCallback((blockId, dir) => {
    replaceActive(c => {
      const idx = c.blocks.findIndex(b => b.id === blockId);
      if (idx === -1) return c;
      const target = idx + dir;
      if (target < 0 || target >= c.blocks.length) return c;
      const targetId = c.blocks[target].id;
      return reorderBlocks(c, blockId, targetId);
    });
  }, [replaceActive]);

  const handleDrop = useCallback((targetId) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDropTargetId(null);
      return;
    }
    replaceActive(c => reorderBlocks(c, dragId, targetId));
    setDragId(null);
    setDropTargetId(null);
  }, [dragId, replaceActive]);

  // Single Save button → format picker. Replaces the legacy 4-button row
  // (Save .md / Save .html / Save .docx / Print → PDF). Print stays as its
  // own button — different intent (browser dialog) from "save a file".
  const [pickerOpen, setPickerOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const pickerRef = useRef(null);
  const pickerBtnRef = useRef(null);

  const baseName = safeFilename(activeCompile?.name);
  const formats = activeCompile
    ? buildCompileFormats({ compile: activeCompile, sessions, baseName })
    : [];

  useEffect(() => {
    if (!pickerOpen) return undefined;
    const onDoc = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setPickerOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setPickerOpen(false);
        pickerBtnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  const runFormat = useCallback(async (format) => {
    if (!format || running) return;
    setRunning(true);
    setPickerOpen(false);
    try {
      await format.run();
    } catch (err) {
      const entry = errFromException(err);
      showError(entry.code, { message: entry.message, hint: entry.hint });
    } finally {
      setRunning(false);
    }
  }, [running]);

  const handlePrint = useCallback(() => {
    if (!activeCompile || activeCompile.blocks.length === 0) {
      showError('EXP_GENERIC', { message: 'Nothing to print yet.', hint: 'Add at least one block from the palette.' });
      return;
    }
    window.print();
  }, [activeCompile]);

  const blocks = activeCompile?.blocks || [];

  return (
    <div className="og-compile">
      <CompilePalette
        compiles={compiles}
        activeCompileId={activeCompileId}
        onSelectCompile={setActiveCompileId}
        onCreateCompile={onCreateCompile}
        onDeleteCompile={onDeleteCompile}
        onRenameCompile={renameCompile}
        sessions={sessions}
        onAddSessionBlock={handleAddSessionBlock}
        onAddImageBlock={handleAddImageBlock}
        onInsertBlock={handleInsertBlock}
      />

      <main className="og-compile-canvas" aria-label="Compile canvas">
        {!activeCompile ? (
          <div className="og-compile-empty">
            <p>No compile selected.</p>
            <button
              type="button"
              className="og-compile-canvas-cta"
              onClick={onCreateCompile}
            >+ New compile</button>
          </div>
        ) : (
          <>
            <header className="og-compile-canvas-head print-hide">
              <div className="og-compile-canvas-titles">
                <span className="og-compile-canvas-num">CMP.{activeCompile.id.slice(-3).toUpperCase()}</span>
                <span className="og-compile-canvas-name">{activeCompile.name || 'Untitled compile'}</span>
                <span className="og-compile-canvas-meta">{compileSummary(activeCompile)}</span>
              </div>
              <div className="og-compile-canvas-actions">
                <div className="og-export-menu" ref={pickerRef}>
                  <button
                    ref={pickerBtnRef}
                    type="button"
                    className="og-export-menu-btn og-export-save-btn"
                    aria-haspopup="menu"
                    aria-expanded={pickerOpen}
                    disabled={blocks.length === 0 || running}
                    onClick={() => setPickerOpen(o => !o)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setPickerOpen(true);
                      }
                    }}
                    data-testid="og-compile-save-btn"
                  >
                    <span className="og-export-glyph" aria-hidden="true">{running ? '◐' : '↓'}</span>
                    <span>{running ? 'Saving…' : 'Save'}</span>
                    <span className="og-export-menu-caret" aria-hidden="true">▾</span>
                  </button>
                  {pickerOpen && formats.length > 0 && (
                    <CompileSavePicker
                      formats={formats}
                      onPick={runFormat}
                      returnFocusTo={pickerBtnRef}
                      onClose={() => setPickerOpen(false)}
                    />
                  )}
                </div>
                <button type="button" className="og-export-btn" onClick={handlePrint} disabled={blocks.length === 0}>
                  <span>Print</span>
                </button>
              </div>
            </header>

            <section
              className={'og-compile-page og-compile-page--' + (activeCompile.pageSize || 'a4')}
              data-theme={activeCompile.theme || 'paper'}
            >
              {blocks.length === 0 ? (
                <div className="og-compile-blocks-empty">
                  <p>This compile is empty.</p>
                  <p>Click a session in the left rail to add it as a block, or use Insert to add raw text / SVG / a page break.</p>
                </div>
              ) : (
                <ol className="og-compile-blocks">
                  {blocks.map((b, i) => (
                    <li key={b.id} className="og-compile-blocks-item">
                      <CompileBlockCard
                        block={b}
                        index={i}
                        total={blocks.length}
                        sessions={sessions}
                        onUpdate={handleUpdate}
                        onRemove={handleRemove}
                        onMoveUp={(id) => handleMove(id, -1)}
                        onMoveDown={(id) => handleMove(id, +1)}
                        onDragStart={setDragId}
                        onDragOver={setDropTargetId}
                        onDrop={handleDrop}
                        onDragEnd={() => { setDragId(null); setDropTargetId(null); }}
                        isDragging={dragId === b.id}
                        isDropTarget={dropTargetId === b.id && dragId && dragId !== b.id}
                      />
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </main>

      <aside className="og-compile-inspector print-hide" aria-label="Compile settings">
        {activeCompile ? (
          <>
            <header className="og-compile-inspector-head">
              <span className="og-compile-palette-num">04</span>
              <span>Settings</span>
            </header>
            <label className="og-compile-inspector-row">
              <span>Name</span>
              <input
                value={activeCompile.name || ''}
                onChange={(e) => replaceActive(c => setName(c, e.target.value))}
                placeholder="Untitled compile"
              />
            </label>
            <label className="og-compile-inspector-row">
              <span>Page size</span>
              <select
                value={activeCompile.pageSize || 'a4'}
                onChange={(e) => replaceActive(c => setPageSize(c, e.target.value))}
              >
                <option value="a4">A4</option>
                <option value="letter">US Letter</option>
              </select>
            </label>
            <label className="og-compile-inspector-row">
              <span>Theme</span>
              <select
                value={activeCompile.theme || 'paper'}
                onChange={(e) => replaceActive(c => setTheme(c, e.target.value))}
              >
                <option value="paper">Paper</option>
                <option value="sepia">Sepia</option>
                <option value="ink">Ink</option>
              </select>
            </label>
            <label className="og-compile-inspector-row og-compile-inspector-row--text">
              <span>Header</span>
              <textarea
                value={activeCompile.header || ''}
                onChange={(e) => replaceActive(c => touchCompile({ ...c, header: e.target.value }))}
                placeholder="Optional header text"
                rows={2}
              />
            </label>
            <label className="og-compile-inspector-row og-compile-inspector-row--text">
              <span>Footer</span>
              <textarea
                value={activeCompile.footer || ''}
                onChange={(e) => replaceActive(c => touchCompile({ ...c, footer: e.target.value }))}
                placeholder="Optional footer text"
                rows={2}
              />
            </label>
            <div className="og-compile-inspector-row og-compile-inspector-row--insertat">
              <span>Add at top</span>
              <button
                type="button"
                className="og-compile-inspector-btn"
                onClick={() => replaceActive(c => insertBlock(c, { kind: BLOCK_KINDS.PAGE_BREAK }, 0))}
              >Page break</button>
            </div>
          </>
        ) : (
          <div className="og-compile-inspector-empty">Select or create a compile to edit its settings.</div>
        )}
      </aside>
    </div>
  );
}

export default CompileBuilder;
