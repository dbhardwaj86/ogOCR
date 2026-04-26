import { useState, useEffect, useRef, useMemo } from 'react';

function CommandPalette({ actions, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const lower = q.toLowerCase();
    if (!lower) return actions;
    return actions.filter(a =>
      a.label.toLowerCase().includes(lower) ||
      (a.hint || '').toLowerCase().includes(lower) ||
      (a.group || '').toLowerCase().includes(lower)
    );
  }, [actions, q]);

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(filtered.length - 1, i + 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
    if (e.key === 'Enter')     {
      e.preventDefault();
      if (filtered[idx]) onPick(filtered[idx].id);
    }
    if (e.key === 'Escape')    { e.preventDefault(); onClose(); }
  };

  return (
    <div className="og-palette-shroud" onClick={onClose}>
      <div className="og-palette" onClick={(e) => e.stopPropagation()}>
        <div className="og-palette-input-wrap">
          <span className="og-palette-prefix">⌘</span>
          <input
            ref={inputRef}
            className="og-palette-input"
            placeholder="Run an action — extract text, format table, switch theme…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={onKey}
          />
          <kbd className="og-kbd og-kbd-sm">esc</kbd>
        </div>
        <div className="og-palette-results">
          {filtered.length === 0 && (
            <div className="og-palette-empty">Nothing matches &ldquo;{q}&rdquo;</div>
          )}
          {filtered.map((a, i) => (
            <button
              key={a.id}
              className={'og-palette-result' + (i === idx ? ' is-cursor' : '')}
              onMouseEnter={() => setIdx(i)}
              onClick={() => onPick(a.id)}
            >
              <span className="og-palette-result-glyph">{a.glyph || '·'}</span>
              <span className="og-palette-result-label">{a.label}</span>
              <span className="og-palette-result-group">{a.group || ''}</span>
              <span className="og-palette-result-hint">{a.hint || ''}</span>
              {a.key && <kbd className="og-kbd og-kbd-sm">⌥{a.key}</kbd>}
            </button>
          ))}
        </div>
        <div className="og-palette-foot">
          <span><kbd className="og-kbd og-kbd-sm">↑↓</kbd> navigate</span>
          <span><kbd className="og-kbd og-kbd-sm">↵</kbd> run</span>
          <span><kbd className="og-kbd og-kbd-sm">esc</kbd> dismiss</span>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
