import { useState } from 'react';
import { BLOCK_KINDS, compileSummary } from '../compile';

function shortDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function CompileList({ compiles, activeCompileId, onSelect, onCreate, onDelete, onRename }) {
  const [editingId, setEditingId] = useState(null);
  const [draftName, setDraftName] = useState('');

  const startRename = (c) => {
    setEditingId(c.id);
    setDraftName(c.name || '');
  };

  const commitRename = () => {
    if (editingId) onRename(editingId, draftName.trim() || 'Untitled compile');
    setEditingId(null);
  };

  return (
    <div className="og-compile-palette-section">
      <header className="og-compile-palette-head">
        <span className="og-compile-palette-num">01</span>
        <span>Compiles</span>
        <button
          type="button"
          className="og-compile-palette-add"
          onClick={onCreate}
          aria-label="New compile"
          title="New compile"
        >+ New</button>
      </header>
      <ul className="og-compile-palette-list">
        {compiles.length === 0 && (
          <li className="og-compile-palette-empty">No compiles yet — click + New.</li>
        )}
        {compiles.map((c) => {
          const active = c.id === activeCompileId;
          const isEditing = editingId === c.id;
          return (
            <li
              key={c.id}
              className={'og-compile-palette-row' + (active ? ' is-active' : '')}
            >
              <button
                type="button"
                className="og-compile-palette-row-btn"
                onClick={() => onSelect(c.id)}
                onDoubleClick={() => startRename(c)}
                aria-pressed={active}
              >
                {isEditing ? (
                  <input
                    autoFocus
                    className="og-compile-palette-rename"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                      if (e.key === 'Escape') { e.preventDefault(); setEditingId(null); }
                    }}
                  />
                ) : (
                  <>
                    <span className="og-compile-palette-row-name">{c.name || 'Untitled compile'}</span>
                    <span className="og-compile-palette-row-meta">
                      {compileSummary(c)} · {shortDate(c.updatedAt)}
                    </span>
                  </>
                )}
              </button>
              <button
                type="button"
                className="og-compile-palette-row-del"
                onClick={() => onDelete(c.id)}
                aria-label={`Delete ${c.name || 'compile'}`}
                title="Delete compile"
              >×</button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SourceList({ sessions, onAddSession, onAddImage, disabled }) {
  return (
    <div className="og-compile-palette-section">
      <header className="og-compile-palette-head">
        <span className="og-compile-palette-num">02</span>
        <span>Sources</span>
      </header>
      <ul className="og-compile-palette-list">
        {sessions.length === 0 && (
          <li className="og-compile-palette-empty">No sessions yet — extract something first.</li>
        )}
        {sessions.map((s) => {
          const imgs = Array.isArray(s.images) ? s.images : [];
          return (
            <li key={s.id} className="og-compile-palette-row og-compile-palette-row--source">
              <button
                type="button"
                className="og-compile-palette-row-btn"
                onClick={() => onAddSession(s)}
                disabled={disabled}
                title="Add this session as a single block"
              >
                <span className="og-compile-palette-row-name">{s.filename || 'Untitled'}</span>
                <span className="og-compile-palette-row-meta">
                  {[s.text ? 'text' : null, s.svg ? 'svg' : null, imgs.length ? `${imgs.length} img` : null]
                    .filter(Boolean).join(' · ') || 'empty'}
                </span>
              </button>
              {imgs.length > 0 && (
                <ul className="og-compile-palette-images">
                  {imgs.map((img) => (
                    <li key={img.id}>
                      <button
                        type="button"
                        className="og-compile-palette-image-btn"
                        onClick={() => onAddImage(img)}
                        disabled={disabled}
                        title={img.desc || `Image ${img.id}`}
                      >
                        {img.data ? (
                          <img src={img.data} alt={img.desc || `Image ${img.id}`} />
                        ) : (
                          <span aria-hidden="true">▦</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function InsertRail({ onInsert, disabled }) {
  return (
    <div className="og-compile-palette-section">
      <header className="og-compile-palette-head">
        <span className="og-compile-palette-num">03</span>
        <span>Insert</span>
      </header>
      <div className="og-compile-palette-insert">
        <button
          type="button"
          className="og-compile-palette-insert-btn"
          onClick={() => onInsert({ kind: BLOCK_KINDS.TEXT, text: '' })}
          disabled={disabled}
        >¶ Text block</button>
        <button
          type="button"
          className="og-compile-palette-insert-btn"
          onClick={() => onInsert({ kind: BLOCK_KINDS.SVG, svg: '' })}
          disabled={disabled}
        >◇ SVG block</button>
        <button
          type="button"
          className="og-compile-palette-insert-btn"
          onClick={() => onInsert({ kind: BLOCK_KINDS.PAGE_BREAK })}
          disabled={disabled}
        >↵ Page break</button>
      </div>
    </div>
  );
}

function CompilePalette({
  compiles,
  activeCompileId,
  onSelectCompile,
  onCreateCompile,
  onDeleteCompile,
  onRenameCompile,
  sessions,
  onAddSessionBlock,
  onAddImageBlock,
  onInsertBlock,
}) {
  const hasActive = !!activeCompileId;
  return (
    <aside className="og-compile-palette" aria-label="Compile palette">
      <CompileList
        compiles={compiles}
        activeCompileId={activeCompileId}
        onSelect={onSelectCompile}
        onCreate={onCreateCompile}
        onDelete={onDeleteCompile}
        onRename={onRenameCompile}
      />
      <SourceList
        sessions={sessions}
        onAddSession={onAddSessionBlock}
        onAddImage={onAddImageBlock}
        disabled={!hasActive}
      />
      <InsertRail onInsert={onInsertBlock} disabled={!hasActive} />
    </aside>
  );
}

export default CompilePalette;
