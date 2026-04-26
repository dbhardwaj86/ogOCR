/* global React */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

// =====================================================================
// VARIANT B — "Refined"
// Same functional flow as the original 3-pane "Optical Instrument":
//   - Library Rail (sessions + upload)
//   - Source Column (preview + magic action surface)
//   - Output Column (rendered/source/diff + exports + prompt dock)
//   - Cmd+K command palette
// Only the visual look-and-feel is reimagined: cooler chromatic temp,
// architectural type pairing (Fraunces + Inter Tight + IBM Plex Mono),
// elevated cards with subtle gradients, refined hover states, lighter chrome.
// =====================================================================

const DEMO = [
  { id:"s-001", filename:"biology_notes_p14.jpg", kind:"handwriting", confidence:0.94, chars:1842, pages:1, date: Date.now()-1000*60*4,
    text:`# Cellular Respiration\n\nThe **mitochondrion** is often called the *powerhouse* of the cell. Through a process called **cellular respiration**, it converts glucose into ATP — the cell's energy currency.\n\n## The three stages\n\n1. **Glycolysis** — happens in the cytoplasm, splits glucose (6C) into 2 pyruvate (3C). Net: 2 ATP, 2 NADH.\n2. **Krebs cycle** — inside the matrix. Pyruvate is oxidized; CO₂ released.\n3. **Electron transport chain** — across the inner membrane. Yields ~28 ATP.\n\n> Total yield: roughly 30–32 ATP per glucose molecule.\n\n## Quick equation\n\nC₆H₁₂O₆ + 6 O₂ → 6 CO₂ + 6 H₂O + ATP\n\n*Remember:* without oxygen, the cell falls back on fermentation — only 2 ATP per glucose.` },
  { id:"s-002", filename:"lunch_receipt.heic", kind:"table", confidence:0.99, chars:412, pages:1, date: Date.now()-1000*60*38,
    text:`# Receipt — Maison Verre\n\n*March 14, 2026 · 12:47 PM · Server: Aida*\n\n| Item | Qty | Price |\n| --- | --- | --- |\n| Croque-madame | 1 | 16.00 |\n| Salade niçoise | 1 | 18.50 |\n| Espresso | 2 | 7.00 |\n| Tarte au citron | 1 | 9.00 |\n\n**Subtotal:** 50.50  \n**Tax:** 4.48  \n**Tip:** 10.10  \n**Total:** 65.08` },
  { id:"s-003", filename:"whiteboard_arch.jpg", kind:"diagram", confidence:0.88, chars:980, pages:1, date: Date.now()-1000*60*60*3,
    text:`# Service Architecture\n\nA rough sketch of the ingestion pipeline.\n\n- **Edge** receives uploads, hands off to *ingest queue*\n- **Worker A** parses + extracts, writes to **Postgres**\n- **Worker B** consumes a *thumbnail queue*, drops PNGs into object storage\n- A periodic **reconciler** sweeps for orphans every 15 min` },
];

const ACTIONS = [
  { id:"text",        group:"Text",      label:"Extract Text",      hint:"Plain prose, paragraphs preserved", glyph:"Aa", key:"T" },
  { id:"handwriting", group:"Text",      label:"Clean Handwriting", hint:"Transcribe + fix obvious errors",   glyph:"H",  key:"H" },
  { id:"table",       group:"Structure", label:"Format as Table",   hint:"Tabular data → markdown table",     glyph:"⊞",  key:"B" },
  { id:"actions",     group:"Structure", label:"Extract Actions",   hint:"Pull tasks into a checklist",       glyph:"✓",  key:"A" },
  { id:"math",        group:"Symbol",    label:"Math to LaTeX",     hint:"Equations → compile-ready LaTeX",   glyph:"∑",  key:"M" },
  { id:"mermaid",     group:"Symbol",    label:"Diagram → Mermaid", hint:"Flowchart → Mermaid.js code",       glyph:"◇",  key:"D" },
  { id:"sketch",      group:"Visual",    label:"Sketch → SVG",      hint:"Hand drawing → editable SVG",       glyph:"✎",  key:"S" },
  { id:"images",      group:"Visual",    label:"Extract Images",    hint:"Pull all figures with descriptions",glyph:"▣",  key:"I" },
];

const GROUPS = ["Text", "Structure", "Symbol", "Visual"];

const EXPORTS = [
  { id:"save",  label:"Save",  items:[
    {id:"drive",label:"Drive",glyph:"△"},{id:"md",label:"Markdown",glyph:"▤"},{id:"pdf",label:"PDF",glyph:"▢"}
  ]},
  { id:"share", label:"Share", items:[
    {id:"email",label:"Email",glyph:"✉"},{id:"classroom",label:"Classroom",glyph:"◯"},{id:"link",label:"Link",glyph:"∞"}
  ]},
  { id:"export",label:"Export",items:[
    {id:"copy",label:"Copy",glyph:"❐"},{id:"png",label:"PNG",glyph:"▦"},{id:"json",label:"JSON",glyph:"{}"}
  ]},
];

function relTime(d) {
  const sec = Math.round((Date.now() - d) / 1000);
  if (sec < 60) return sec + "s ago";
  if (sec < 3600) return Math.round(sec/60) + "m ago";
  if (sec < 86400) return Math.round(sec/3600) + "h ago";
  return Math.round(sec/86400) + "d ago";
}

function parseMD(text) {
  const lines = (text||"").replace(/\r/g,"").split("\n");
  const blocks = []; let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = line.match(/^#\s+(.+)/)))   { blocks.push({type:"h1",text:m[1]}); i++; continue; }
    if ((m = line.match(/^##\s+(.+)/)))  { blocks.push({type:"h2",text:m[1]}); i++; continue; }
    if ((m = line.match(/^###\s+(.+)/))) { blocks.push({type:"h3",text:m[1]}); i++; continue; }
    if ((m = line.match(/^>\s+(.+)/)))   { blocks.push({type:"bq",text:m[1]}); i++; continue; }
    if (line.match(/^[-*]\s+/)) { const items=[]; while(i<lines.length&&lines[i].match(/^[-*]\s+/)){items.push(lines[i].replace(/^[-*]\s+/,""));i++;} blocks.push({type:"ul",items}); continue; }
    if (line.match(/^\d+\.\s+/)) { const items=[]; while(i<lines.length&&lines[i].match(/^\d+\.\s+/)){items.push(lines[i].replace(/^\d+\.\s+/,""));i++;} blocks.push({type:"ol",items}); continue; }
    if (line.includes("|") && lines[i+1] && lines[i+1].match(/^\s*\|?[\s:|-]+\|?\s*$/)) {
      const head = line.split("|").map(s=>s.trim()).filter(Boolean);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|")) {
        rows.push(lines[i].split("|").map(s=>s.trim()).filter((c,idx,arr)=>!(idx===0&&c==="")&&!(idx===arr.length-1&&c==="")));
        i++;
      }
      blocks.push({type:"table",head,rows}); continue;
    }
    const buf=[];
    while(i<lines.length && lines[i].trim() && !lines[i].match(/^(#{1,3}\s|>|[-*]\s|\d+\.\s)/)) { buf.push(lines[i]); i++; }
    blocks.push({type:"p",text:buf.join(" ")});
  }
  return blocks;
}

function inline(s) {
  if (!s) return null;
  const parts = []; let rest = s; let key = 0;
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/;
  while (true) {
    const m = rest.match(re);
    if (!m) { parts.push(<React.Fragment key={key++}>{rest}</React.Fragment>); break; }
    if (m.index>0) parts.push(<React.Fragment key={key++}>{rest.slice(0,m.index)}</React.Fragment>);
    if (m[2]) parts.push(<strong key={key++}>{m[2]}</strong>);
    else if (m[3]) parts.push(<em key={key++}>{m[3]}</em>);
    else if (m[4]) parts.push(<code key={key++}>{m[4]}</code>);
    rest = rest.slice(m.index + m[0].length);
  }
  return parts;
}

function kindLabel(k) {
  return ({text:"Plain text",handwriting:"Handwriting",table:"Tabular",actions:"Action items",math:"LaTeX",mermaid:"Mermaid",sketch:"SVG",images:"Image set",diagram:"Diagram"}[k]) || "Document";
}

function kindGlyph(k) {
  return ({text:"Aa",handwriting:"H",table:"⊞",actions:"✓",math:"∑",mermaid:"◇",sketch:"✎",images:"▣",diagram:"◇"}[k]) || "·";
}

// =====================================================================
function RefinedApp() {
  const [sessions, setSessions] = useState(DEMO);
  const [activeId, setActiveId] = useState(DEMO[0].id);
  const [processing, setProcessing] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("rendered");
  const [toast, setToast] = useState(null);
  const active = sessions.find(s => s.id === activeId) || sessions[0];

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(p => !p); }
      else if (e.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(()=>setToast(null), 2200); };

  const runAction = useCallback((id) => {
    if (processing) return;
    const a = ACTIONS.find(x => x.id === id);
    if (!a) return;
    setProcessing({ actionId: id, progress: 0, stage: "preparing" });
    const stages = [{at:25,name:"reading"},{at:55,name:"recognizing"},{at:85,name:"structuring"},{at:100,name:"finalizing"}];
    let pct = 0;
    const tick = () => {
      pct += 6 + Math.random()*8;
      if (pct >= 100) {
        pct = 100;
        setProcessing({ actionId: id, progress: 100, stage: "finalizing" });
        setTimeout(() => {
          setProcessing(null);
          showToast(`${a.label} complete · ${active.filename}`);
          setSessions(prev => prev.map(s => s.id === activeId ? { ...s, date: Date.now(), kind: a.id } : s));
        }, 350);
        return;
      }
      const stage = stages.find(s => pct < s.at)?.name ?? "finalizing";
      setProcessing({ actionId: id, progress: pct, stage });
      setTimeout(tick, 110 + Math.random()*80);
    };
    setTimeout(tick, 200);
  }, [processing, active, activeId]);

  const onUpload = (filename) => {
    const id = "s-" + Math.random().toString(36).slice(2,7);
    const fresh = { id, filename, kind:"text", confidence:0, chars:0, pages:1, date: Date.now(),
      text: "# " + filename.replace(/\.[^.]+$/, "") + "\n\nExtracted content will appear once you run an action." };
    setSessions(p => [fresh, ...p]);
    setActiveId(id);
    showToast("Loaded " + filename);
  };

  return (
    <div className="rb-app">
      {/* TOP */}
      <header className="rb-top">
        <div className="rb-brand">
          <div className="rb-brand-glyph">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="11" cy="11" r="2" fill="currentColor" />
              <path d="M11 1 V4 M11 18 V21 M1 11 H4 M18 11 H21" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
          <div className="rb-wordmark">
            <span className="rb-wm-1">og</span><span className="rb-wm-2">OCR</span>
            <span className="rb-wm-tag">studio</span>
          </div>
        </div>
        <div className="rb-top-meta">
          <span className="rb-tm-k">Model</span>
          <span className="rb-tm-v">Gemini 1.5 Pro</span>
          <span className="rb-tm-sep" />
          <span className="rb-tm-k">Region</span>
          <span className="rb-tm-v">us-east-1</span>
          <span className="rb-tm-sep" />
          <span className="rb-tm-status"><span className="rb-pulse" /> ready</span>
        </div>
        <div className="rb-top-right">
          <button className="rb-cmdk" onClick={() => setPaletteOpen(true)}>
            <span>Search & commands</span>
            <kbd>⌘K</kbd>
          </button>
        </div>
      </header>

      <main className="rb-main">
        {/* RAIL */}
        <RBRail sessions={sessions} activeId={activeId} setActiveId={setActiveId} onUpload={onUpload} />
        {/* SOURCE */}
        <RBSource session={active} processing={processing} onRun={runAction} />
        {/* OUTPUT */}
        <RBOutput session={active} processing={processing} mode={mode} setMode={setMode}
          prompt={prompt} setPrompt={setPrompt}
          onAsk={() => { if (prompt.trim()) { showToast("Asked: " + prompt.slice(0,30) + "…"); setPrompt(""); } }}
          onExport={(id) => showToast("Exported · " + id)} />
      </main>

      {paletteOpen && <RBPalette onPick={(id)=>{setPaletteOpen(false); runAction(id);}} onClose={()=>setPaletteOpen(false)} />}
      {toast && <div className="rb-toast">{toast}</div>}
    </div>
  );
}

// ---------- Rail ----------
function RBRail({ sessions, activeId, setActiveId, onUpload }) {
  const inputRef = useRef(null);
  const ordered = [...sessions].sort((a,b) => b.date - a.date);
  const pick = (e) => { const f = e.target.files?.[0]; if (f) onUpload(f.name); e.target.value = ""; };

  return (
    <aside className="rb-rail">
      <button className="rb-upload" onClick={() => inputRef.current?.click()}>
        <div className="rb-upload-icon">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M11 4 V15 M6 9 L11 4 L16 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 18 H19" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="rb-upload-body">
          <div className="rb-upload-title">New document</div>
          <div className="rb-upload-sub">image · pdf · screenshot</div>
        </div>
      </button>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" hidden onChange={pick} />

      <div className="rb-rail-section">
        <div className="rb-rail-head">
          <span>Library</span>
          <span className="rb-rail-count">{ordered.length}</span>
        </div>
        <div className="rb-rail-list">
          {ordered.map(s => (
            <button key={s.id}
              className={"rb-row" + (s.id === activeId ? " is-active" : "")}
              onClick={() => setActiveId(s.id)}>
              <span className="rb-row-thumb">{kindGlyph(s.kind)}</span>
              <span className="rb-row-body">
                <span className="rb-row-name">{s.filename}</span>
                <span className="rb-row-meta">
                  <span>{relTime(s.date)}</span>
                  <span className="rb-row-mid">·</span>
                  <span>{s.chars.toLocaleString()} ch</span>
                  {s.confidence > 0 && <><span className="rb-row-mid">·</span><span>{Math.round(s.confidence*100)}%</span></>}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

// ---------- Source ----------
function RBSource({ session, processing, onRun }) {
  const lines = useMemo(() => {
    const seed = (session.id.charCodeAt(session.id.length-1) || 1);
    return Array.from({length: 18}, (_, i) => ({
      w: 30 + ((seed * (i+3)) % 60),
      indent: (i % 5 === 0) ? 0 : ((seed + i) % 4) * 6,
    }));
  }, [session.id]);

  return (
    <section className="rb-source">
      <div className="rb-source-head">
        <div className="rb-source-meta">
          <span className="rb-source-name">{session.filename}</span>
          <span className="rb-source-tag">{kindLabel(session.kind)}</span>
        </div>
        <div className="rb-source-stats">
          <Stat k="DPI" v="300" />
          <Stat k="Size" v="1240×1754" />
          <Stat k="Conf" v={(session.confidence*100).toFixed(0)+"%"} />
        </div>
      </div>

      <div className="rb-source-stage">
        <div className="rb-paper">
          <div className="rb-paper-corner rb-pc-tl" />
          <div className="rb-paper-corner rb-pc-tr" />
          <div className="rb-paper-corner rb-pc-bl" />
          <div className="rb-paper-corner rb-pc-br" />
          <div className="rb-paper-inner">
            <div className="rb-paper-h">
              <span className="rb-paper-stamp">SCAN · {new Date(session.date).toISOString().slice(0,10)}</span>
              <span className="rb-paper-name">{session.filename}</span>
            </div>
            <div className="rb-paper-lines">
              {lines.map((l, i) => (
                <div key={i} className="rb-paper-line" style={{width: l.w + "%", marginLeft: l.indent + "%"}} />
              ))}
            </div>
            {processing && (
              <div className="rb-scan" style={{top: processing.progress + "%"}}>
                <div className="rb-scan-bar" />
                <div className="rb-scan-meta">
                  {Math.round(processing.progress)}% · {processing.stage}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rb-actions">
        {GROUPS.map(g => (
          <div key={g} className="rb-action-group">
            <div className="rb-action-glabel">{g}</div>
            <div className="rb-action-tiles">
              {ACTIONS.filter(a => a.group === g).map(a => {
                const me = processing?.actionId === a.id;
                return (
                  <button key={a.id} className={"rb-tile" + (me ? " is-running" : "")}
                    disabled={!!processing} onClick={() => onRun(a.id)}>
                    <span className="rb-tile-glyph">{a.glyph}</span>
                    <span className="rb-tile-label">{a.label}</span>
                    <span className="rb-tile-hint">{a.hint}</span>
                    <span className="rb-tile-key">⌥{a.key}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Stat({k, v}) {
  return (
    <div className="rb-stat">
      <span className="rb-stat-k">{k}</span>
      <span className="rb-stat-v">{v}</span>
    </div>
  );
}

// ---------- Output ----------
function RBOutput({ session, processing, mode, setMode, prompt, setPrompt, onAsk, onExport }) {
  const blocks = useMemo(() => parseMD(session.text || ""), [session.text]);
  return (
    <section className="rb-output">
      <div className="rb-out-head">
        <div className="rb-out-title">
          <h2 className="rb-out-h">Extracted</h2>
          <span className="rb-out-sub">{kindLabel(session.kind)} · {(session.text||"").length.toLocaleString()} chars</span>
        </div>
        <div className="rb-modes">
          {["rendered","source","diff"].map(m => (
            <button key={m} className={"rb-mode" + (mode === m ? " is-active" : "")} onClick={() => setMode(m)}>
              {m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {processing && (
        <div className="rb-proc">
          <div className="rb-proc-spin"><svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeDasharray="20 8" /></svg></div>
          <div className="rb-proc-mid">
            <div className="rb-proc-line">
              <span>{ACTIONS.find(a=>a.id===processing.actionId)?.label || "Working"}</span>
              <span className="rb-proc-stage">— {processing.stage}</span>
            </div>
            <div className="rb-proc-bar"><div className="rb-proc-fill" style={{width: processing.progress + "%"}} /></div>
          </div>
          <div className="rb-proc-pct">{Math.round(processing.progress)}%</div>
        </div>
      )}

      <div className="rb-out-canvas">
        {mode === "rendered" && (
          <article className="rb-doc">
            {blocks.map((b, i) => {
              if (b.type === "h1") return <h1 key={i}>{inline(b.text)}</h1>;
              if (b.type === "h2") return <h2 key={i}>{inline(b.text)}</h2>;
              if (b.type === "h3") return <h3 key={i}>{inline(b.text)}</h3>;
              if (b.type === "p")  return <p key={i}>{inline(b.text)}</p>;
              if (b.type === "ul") return <ul key={i}>{b.items.map((it,j)=><li key={j}>{inline(it)}</li>)}</ul>;
              if (b.type === "ol") return <ol key={i}>{b.items.map((it,j)=><li key={j}>{inline(it)}</li>)}</ol>;
              if (b.type === "bq") return <blockquote key={i}>{inline(b.text)}</blockquote>;
              if (b.type === "table") return (
                <table key={i}>
                  <thead><tr>{b.head.map((h,j)=><th key={j}>{inline(h)}</th>)}</tr></thead>
                  <tbody>{b.rows.map((r,j)=><tr key={j}>{r.map((c,k)=><td key={k}>{inline(c)}</td>)}</tr>)}</tbody>
                </table>
              );
              return null;
            })}
          </article>
        )}
        {mode === "source" && (
          <pre className="rb-source-doc">
            {(session.text||"").split("\n").map((l, i) => (
              <div key={i} className="rb-src-line">
                <span className="rb-src-ln">{String(i+1).padStart(3,"0")}</span>
                <span className="rb-src-lc">{l || " "}</span>
              </div>
            ))}
          </pre>
        )}
        {mode === "diff" && (
          <pre className="rb-source-doc">
            {(session.text||"").split("\n").map((l, i) => {
              const low = i % 7 === 3 || i % 11 === 5;
              return (
                <div key={i} className={"rb-src-line" + (low ? " is-low" : "")}>
                  <span className="rb-src-ln">{low ? "?" : String(i+1).padStart(3,"0")}</span>
                  <span className="rb-src-lc">{l || " "}</span>
                  {low && <span className="rb-src-conf">0.71</span>}
                </div>
              );
            })}
          </pre>
        )}
      </div>

      <div className="rb-foot">
        <div className="rb-exports">
          {EXPORTS.map(g => (
            <div key={g.id} className="rb-exp-group">
              <span className="rb-exp-label">{g.label}</span>
              <div className="rb-exp-items">
                {g.items.map(it => (
                  <button key={it.id} className="rb-exp-btn" onClick={() => onExport(it.id)}>
                    <span className="rb-exp-glyph">{it.glyph}</span>
                    <span>{it.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="rb-prompt">
          <div className="rb-prompt-rail">
            <div className="rb-prompt-glyph">⌁</div>
            <div className="rb-prompt-tag">Ask</div>
          </div>
          <textarea className="rb-prompt-input" rows={1}
            placeholder="Ask a follow-up — translate, summarize, restructure…"
            value={prompt} onChange={e=>setPrompt(e.target.value)}
            disabled={!!processing}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onAsk(); } }} />
          <button className="rb-prompt-run" disabled={!prompt.trim() || !!processing} onClick={onAsk}>
            <span>Run</span><kbd>↵</kbd>
          </button>
          <div className="rb-presets">
            {["Translate to French","Summarize in 3 bullets","Convert to flashcards","Reformat as outline"].map(p =>
              <button key={p} className="rb-preset" onClick={() => setPrompt(p)} disabled={!!processing}>{p}</button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- Palette ----------
function RBPalette({ onPick, onClose }) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const filtered = ACTIONS.filter(a => !q || a.label.toLowerCase().includes(q.toLowerCase()) || a.hint.toLowerCase().includes(q.toLowerCase()));
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(filtered.length-1, i+1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(0, i-1)); }
    if (e.key === "Enter") { e.preventDefault(); filtered[idx] && onPick(filtered[idx].id); }
  };
  return (
    <div className="rb-pal-shroud" onClick={onClose}>
      <div className="rb-pal" onClick={e=>e.stopPropagation()}>
        <div className="rb-pal-input">
          <span className="rb-pal-icon">⌘</span>
          <input ref={ref} placeholder="Run a command…" value={q}
            onChange={e=>{setQ(e.target.value);setIdx(0);}} onKeyDown={onKey} />
          <kbd>esc</kbd>
        </div>
        <div className="rb-pal-list">
          {filtered.map((a, i) => (
            <button key={a.id} className={"rb-pal-item" + (i === idx ? " is-cur" : "")}
              onMouseEnter={() => setIdx(i)} onClick={() => onPick(a.id)}>
              <span className="rb-pal-glyph">{a.glyph}</span>
              <span className="rb-pal-label">{a.label}</span>
              <span className="rb-pal-group">{a.group}</span>
              <span className="rb-pal-hint">{a.hint}</span>
              <kbd>⌥{a.key}</kbd>
            </button>
          ))}
          {filtered.length === 0 && <div className="rb-pal-empty">No matches for "{q}"</div>}
        </div>
        <div className="rb-pal-foot">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> run</span>
          <span><kbd>esc</kbd> dismiss</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { RefinedApp });
