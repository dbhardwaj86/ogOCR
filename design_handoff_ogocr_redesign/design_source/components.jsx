/* global React */
const { useState, useEffect, useRef, useMemo } = React;

// -------------------------------------------------------------
// TopBar — wordmark + global meta + cmd-k hint
// -------------------------------------------------------------
function TopBar({ tweaks }) {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  return (
    <header className="og-topbar">
      <div className="og-brand">
        <CornerBracket />
        <div className="og-wordmark">
          <span className="og-word-og">og</span>
          <span className="og-word-ocr">OCR</span>
          <span className="og-word-sub">No.<em>03</em></span>
        </div>
      </div>
      <div className="og-topbar-mid">
        <span className="og-meta-key">SESSION</span>
        <span className="og-meta-val">{time.toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
        <span className="og-meta-dot" />
        <span className="og-meta-key">MODEL</span>
        <span className="og-meta-val">gemini · 1.5 pro</span>
        <span className="og-meta-dot" />
        <span className="og-meta-key">REGION</span>
        <span className="og-meta-val">us-east-1</span>
      </div>
      <div className="og-topbar-right">
        <kbd className="og-kbd">⌘ K</kbd>
        <span className="og-kbd-label">command</span>
      </div>
    </header>
  );
}

// -------------------------------------------------------------
// LibraryRail — thin left rail with sessions + upload trigger
// -------------------------------------------------------------
function LibraryRail({ sessions, activeId, setActiveId, onUpload, collapsed }) {
  const inputRef = useRef(null);
  const ordered = [...sessions].sort((a, b) => b.date - a.date);

  const handlePick = (e) => {
    const f = e.target.files?.[0];
    if (f) onUpload(f.name);
    e.target.value = "";
  };

  if (collapsed) {
    return (
      <aside className="og-rail og-rail-collapsed">
        <button className="og-rail-upload" onClick={() => inputRef.current?.click()} title="Upload">
          <span className="og-glyph">+</span>
        </button>
        <input ref={inputRef} type="file" accept="image/*,application/pdf" hidden onChange={handlePick} />
        <div className="og-rail-stack">
          {ordered.slice(0, 8).map(s => (
            <button key={s.id} className={"og-rail-thumb" + (s.id === activeId ? " is-active" : "")}
              onClick={() => setActiveId(s.id)}
              style={{ "--hue": s.thumbHue }}
              title={s.filename}>
              <span className="og-rail-thumb-letter">{s.filename[0].toUpperCase()}</span>
            </button>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside className="og-rail">
      <div className="og-rail-section">
        <div className="og-section-title">
          <span className="og-section-num">01</span>
          <span>Source</span>
        </div>
        <button className="og-upload-card" onClick={() => inputRef.current?.click()}>
          <div className="og-upload-corners">
            <CornerBracket />
            <CornerBracket flip="x" />
            <CornerBracket flip="y" />
            <CornerBracket flip="xy" />
          </div>
          <div className="og-upload-glyph">＋</div>
          <div className="og-upload-title">Drop a document</div>
          <div className="og-upload-sub">image · pdf · heic · screenshot</div>
          <div className="og-upload-ticks">
            {Array.from({ length: 14 }).map((_, i) => <span key={i} className="og-tick" />)}
          </div>
        </button>
        <input ref={inputRef} type="file" accept="image/*,application/pdf" hidden onChange={handlePick} />
      </div>

      <div className="og-rail-section og-rail-grow">
        <div className="og-section-title">
          <span className="og-section-num">02</span>
          <span>Library</span>
          <span className="og-section-count">{ordered.length}</span>
        </div>
        <div className="og-session-list">
          {ordered.map(s => (
            <SessionRow key={s.id} session={s} active={s.id === activeId} onClick={() => setActiveId(s.id)} />
          ))}
        </div>
      </div>
    </aside>
  );
}

function SessionRow({ session, active, onClick }) {
  return (
    <button className={"og-session" + (active ? " is-active" : "")} onClick={onClick}>
      <div className="og-session-thumb" style={{ "--hue": session.thumbHue }}>
        <KindGlyph kind={session.kind} />
      </div>
      <div className="og-session-body">
        <div className="og-session-name">{session.filename}</div>
        <div className="og-session-meta">
          <span>{relTime(session.date)}</span>
          <span className="og-session-dot" />
          <span>{session.chars.toLocaleString()} chars</span>
          <span className="og-session-dot" />
          <span>{Math.round(session.confidence * 100)}%</span>
        </div>
      </div>
      {active && <span className="og-session-marker">●</span>}
    </button>
  );
}

function KindGlyph({ kind }) {
  const map = {
    text: "T", handwriting: "H", table: "▦", actions: "✓",
    math: "∑", mermaid: "◇", sketch: "✎", images: "▣", diagram: "◇"
  };
  return <span className="og-kind-glyph">{map[kind] || "·"}</span>;
}

// -------------------------------------------------------------
// SourceColumn — preview + magic action surface
// -------------------------------------------------------------
function SourceColumn({ session, processing, onRun, actionStyle, showTablets }) {
  return (
    <section className="og-source">
      <div className="og-source-head">
        <div className="og-source-filemeta">
          <span className="og-source-num">SRC.{session.id.slice(-3).toUpperCase()}</span>
          <span className="og-source-name">{session.filename}</span>
        </div>
        {showTablets && <SourceTablets session={session} />}
      </div>

      <div className="og-source-stage">
        <DocumentPreview session={session} processing={processing} />
      </div>

      <div className="og-action-surface" data-style={actionStyle}>
        <ActionSurface processing={processing} onRun={onRun} style={actionStyle} />
      </div>
    </section>
  );
}

function SourceTablets({ session }) {
  return (
    <div className="og-tablets">
      <Tablet k="DPI"  v="300" />
      <Tablet k="W×H"  v="1240×1754" />
      <Tablet k="CONF" v={(session.confidence * 100).toFixed(1) + "%"} />
      <Tablet k="LANG" v="en · auto" />
    </div>
  );
}

function Tablet({ k, v }) {
  return (
    <div className="og-tablet">
      <div className="og-tablet-k">{k}</div>
      <div className="og-tablet-v">{v}</div>
    </div>
  );
}

// Faux document preview — placeholder striped paper with a faint version of the extracted text
function DocumentPreview({ session, processing }) {
  const isProcessing = !!processing;
  const stage = processing?.stage;
  const pct = processing?.progress ?? 0;

  // Generate placeholder "scribbled" lines per session kind
  const lines = useMemo(() => {
    const seed = session.id.charCodeAt(session.id.length - 1) || 1;
    const arr = [];
    const count = 18;
    for (let i = 0; i < count; i++) {
      const w = 30 + ((seed * (i + 3)) % 60);
      const indent = (i % 5 === 0) ? 0 : ((seed + i) % 4) * 6;
      arr.push({ w, indent });
    }
    return arr;
  }, [session.id]);

  return (
    <div className="og-doc-preview">
      <div className="og-doc-corners">
        <CornerBracket />
        <CornerBracket flip="x" />
        <CornerBracket flip="y" />
        <CornerBracket flip="xy" />
      </div>

      <div className="og-doc-paper" style={{ "--hue": session.thumbHue }}>
        <div className="og-doc-header">
          <div className="og-doc-stamp">
            <span>SCAN</span>
            <span>·</span>
            <span>{new Date(session.date).toISOString().slice(0, 10)}</span>
          </div>
          <div className="og-doc-filename">{session.filename}</div>
        </div>
        <div className="og-doc-lines">
          {lines.map((l, i) => (
            <div key={i} className="og-doc-line"
              style={{ width: l.w + "%", marginLeft: l.indent + "%" }} />
          ))}
        </div>
        {isProcessing && (
          <div className="og-scanline" style={{ top: pct + "%" }}>
            <div className="og-scanline-bar" />
            <div className="og-scanline-meta">
              <span>{Math.round(pct)}%</span>
              <span>{stage}</span>
            </div>
          </div>
        )}
      </div>

      <div className="og-doc-coords">
        <span>x: 0</span>
        <span>y: 0</span>
        <span>x: 1240</span>
        <span>y: 1754</span>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Magic actions — three styles
// -------------------------------------------------------------
function ActionSurface({ processing, onRun, style }) {
  if (style === "list") return <ActionList processing={processing} onRun={onRun} />;
  if (style === "palette") return <ActionPaletteHint processing={processing} onRun={onRun} />;
  return <ActionTiles processing={processing} onRun={onRun} />;
}

function ActionTiles({ processing, onRun }) {
  return (
    <div className="og-action-tiles">
      {window.ACTION_GROUPS.map(group => (
        <div className="og-action-group" key={group}>
          <div className="og-action-group-label">{group}</div>
          <div className="og-action-group-tiles">
            {window.MAGIC_ACTIONS.filter(a => a.group === group).map(a => {
              const isMe = processing?.actionId === a.id;
              return (
                <button key={a.id}
                  className={"og-tile" + (isMe ? " is-running" : "")}
                  disabled={!!processing}
                  onClick={() => onRun(a.id)}>
                  <span className="og-tile-glyph">{a.glyph}</span>
                  <span className="og-tile-label">{a.label}</span>
                  <span className="og-tile-hint">{a.hint}</span>
                  <span className="og-tile-key">⌥{a.key}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionList({ processing, onRun }) {
  return (
    <div className="og-action-list">
      {window.MAGIC_ACTIONS.map(a => {
        const isMe = processing?.actionId === a.id;
        return (
          <button key={a.id}
            className={"og-list-row" + (isMe ? " is-running" : "")}
            disabled={!!processing}
            onClick={() => onRun(a.id)}>
            <span className="og-list-glyph">{a.glyph}</span>
            <span className="og-list-label">{a.label}</span>
            <span className="og-list-group">{a.group}</span>
            <span className="og-list-hint">{a.hint}</span>
            <span className="og-list-key">⌥{a.key}</span>
          </button>
        );
      })}
    </div>
  );
}

function ActionPaletteHint({ processing, onRun }) {
  return (
    <div className="og-palette-hint">
      <div className="og-palette-row">
        <span className="og-palette-glyph">⌘</span>
        <span className="og-palette-msg">Press <kbd>⌘ K</kbd> to summon the command palette</span>
      </div>
      <div className="og-palette-quick">
        {window.MAGIC_ACTIONS.slice(0, 4).map(a => (
          <button key={a.id} className="og-palette-quick-btn" disabled={!!processing} onClick={() => onRun(a.id)}>
            <span>{a.glyph}</span>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Command Palette
// -------------------------------------------------------------
function CommandPalette({ actions, onPick, onClose }) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = actions.filter(a =>
    !q || a.label.toLowerCase().includes(q.toLowerCase()) || a.hint.toLowerCase().includes(q.toLowerCase())
  );

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(filtered.length - 1, i + 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
    if (e.key === "Enter")     { e.preventDefault(); filtered[idx] && onPick(filtered[idx].id); }
  };

  return (
    <div className="og-palette-shroud" onClick={onClose}>
      <div className="og-palette" onClick={e => e.stopPropagation()}>
        <div className="og-palette-input-wrap">
          <span className="og-palette-prefix">⌘</span>
          <input ref={inputRef} className="og-palette-input"
            placeholder="Run an action — extract text, format table, math to LaTeX…"
            value={q} onChange={e => { setQ(e.target.value); setIdx(0); }} onKeyDown={onKey} />
          <kbd className="og-kbd og-kbd-sm">esc</kbd>
        </div>
        <div className="og-palette-results">
          {filtered.length === 0 && <div className="og-palette-empty">Nothing matches "{q}"</div>}
          {filtered.map((a, i) => (
            <button key={a.id}
              className={"og-palette-result" + (i === idx ? " is-cursor" : "")}
              onMouseEnter={() => setIdx(i)}
              onClick={() => onPick(a.id)}>
              <span className="og-palette-result-glyph">{a.glyph}</span>
              <span className="og-palette-result-label">{a.label}</span>
              <span className="og-palette-result-group">{a.group}</span>
              <span className="og-palette-result-hint">{a.hint}</span>
              <kbd className="og-kbd og-kbd-sm">⌥{a.key}</kbd>
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

function CornerBracket({ flip }) {
  const t = { x: "scaleX(-1)", y: "scaleY(-1)", xy: "scale(-1,-1)" }[flip] || "";
  return (
    <svg className={"og-corner og-corner-" + (flip || "tl")} viewBox="0 0 18 18" style={{ transform: t }}>
      <path d="M1 6 V1 H6" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

function relTime(d) {
  const sec = Math.round((Date.now() - d) / 1000);
  if (sec < 60)    return sec + "s ago";
  if (sec < 3600)  return Math.round(sec / 60) + "m ago";
  if (sec < 86400) return Math.round(sec / 3600) + "h ago";
  return Math.round(sec / 86400) + "d ago";
}

Object.assign(window, {
  TopBar, LibraryRail, SourceColumn, CommandPalette, CornerBracket,
  MAGIC_ACTIONS_REF: null, // placeholder
  ACTION_GROUPS: ["Text", "Structure", "Symbol", "Visual"],
});
