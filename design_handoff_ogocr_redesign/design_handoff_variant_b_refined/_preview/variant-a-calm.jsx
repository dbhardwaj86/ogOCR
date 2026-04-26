/* global React, ReactDOM */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

// =====================================================================
// VARIANT A — "Calm"
// Reimagined for minimum cognitive overload:
//  - one focal task at a time (Source → Intent → Output)
//  - progressive disclosure (actions only after upload, exports only after extract)
//  - sessions live in a slim popover (not a permanent rail)
//  - intent picker replaces 8-tile grid (auto-pick the right action by goal)
//  - decoration removed: no tablets, no coords, no runner/end, no mode pills
// =====================================================================

const DEMO_SESSIONS = [
  { id:"s1", filename:"biology_notes_p14.jpg", kind:"handwriting", chars:1842, date: Date.now()-1000*60*4,
    text:`# Cellular Respiration\n\nThe **mitochondrion** is the powerhouse of the cell. Through cellular respiration, it converts glucose into ATP — the cell's energy currency.\n\n## Three stages\n\n1. **Glycolysis** — splits glucose (6C) into 2 pyruvate (3C). Net 2 ATP.\n2. **Krebs cycle** — pyruvate oxidized; CO₂ released.\n3. **Electron transport chain** — yields ~28 ATP.\n\n> Total: roughly 30–32 ATP per glucose molecule.` },
  { id:"s2", filename:"lunch_receipt.heic", kind:"table", chars:412, date: Date.now()-1000*60*38,
    text:`# Receipt — Maison Verre\n\n*Mar 14 · 12:47 PM*\n\n| Item | Qty | Price |\n| --- | --- | --- |\n| Croque-madame | 1 | 16.00 |\n| Salade niçoise | 1 | 18.50 |\n| Espresso | 2 | 7.00 |\n\n**Total:** 65.08` },
  { id:"s3", filename:"whiteboard_arch.jpg", kind:"diagram", chars:980, date: Date.now()-1000*60*60*3,
    text:`# Service Architecture\n\nA rough sketch of the ingestion pipeline.\n\n- **Edge** receives uploads\n- **Worker A** parses + extracts\n- **Worker B** consumes thumbnail queue` },
];

// Intents — natural-language goals that map to underlying actions.
// User picks "what they want", not "which algorithm".
const INTENTS = [
  { id:"text",  label:"Just the text",       hint:"Plain prose, paragraphs preserved",  action:"text"        },
  { id:"table", label:"As a clean table",    hint:"Rows and columns, ready to sort",    action:"table"       },
  { id:"tasks", label:"Action items",        hint:"Pull the to-dos into a checklist",   action:"actions"     },
  { id:"math",  label:"Math equations",      hint:"Render or copy as LaTeX",            action:"math"        },
  { id:"diag",  label:"Diagram or sketch",   hint:"Editable flowchart or SVG",          action:"mermaid"     },
];

function relTime(d) {
  const sec = Math.round((Date.now() - d) / 1000);
  if (sec < 60) return sec + "s";
  if (sec < 3600) return Math.round(sec/60) + "m";
  if (sec < 86400) return Math.round(sec/3600) + "h";
  return Math.round(sec/86400) + "d";
}

// ---------- Markdown (minimal) ----------
function parseMD(text) {
  const lines = (text||"").replace(/\r/g,"").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = line.match(/^#\s+(.+)/)))   { blocks.push({type:"h1",text:m[1]}); i++; continue; }
    if ((m = line.match(/^##\s+(.+)/)))  { blocks.push({type:"h2",text:m[1]}); i++; continue; }
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
    while(i<lines.length && lines[i].trim() && !lines[i].match(/^(#{1,2}\s|>|[-*]\s|\d+\.\s)/)) { buf.push(lines[i]); i++; }
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

// =====================================================================
// App
// =====================================================================
function CalmApp() {
  const [sessions, setSessions] = useState(DEMO_SESSIONS);
  const [activeId, setActiveId] = useState(null); // null = empty state
  const [processing, setProcessing] = useState(null); // {progress, stage, intent}
  const [extracted, setExtracted] = useState({}); // id -> text
  const [chosenIntent, setChosenIntent] = useState(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [toast, setToast] = useState(null);

  const active = sessions.find(s => s.id === activeId);
  const hasOutput = active && !!extracted[active.id];

  const showToast = (msg) => { setToast(msg); setTimeout(()=>setToast(null), 2200); };

  const onUpload = (filename) => {
    const id = "s-" + Math.random().toString(36).slice(2,7);
    const fresh = { id, filename, kind:"text", chars:0, date: Date.now() };
    setSessions(p => [fresh, ...p]);
    setActiveId(id);
    setChosenIntent(null);
    setLibraryOpen(false);
  };

  const runIntent = (intentId) => {
    if (processing || !active) return;
    const intent = INTENTS.find(i => i.id === intentId);
    setChosenIntent(intentId);
    setProcessing({ progress: 0, stage: "preparing", intent: intentId });
    let pct = 0;
    const stages = [{at:25,name:"reading"},{at:55,name:"recognizing"},{at:85,name:"structuring"},{at:100,name:"finishing"}];
    const tick = () => {
      pct += 6 + Math.random()*8;
      if (pct >= 100) {
        pct = 100;
        setProcessing({ progress: 100, stage: "finishing", intent: intentId });
        setTimeout(() => {
          // Use the demo text already attached to session (or default)
          const text = active.text || "# Document\n\nExtracted text would appear here.";
          setExtracted(e => ({ ...e, [active.id]: text }));
          setSessions(prev => prev.map(s => s.id === active.id ? { ...s, kind: intent.action, chars: text.length, date: Date.now() } : s));
          setProcessing(null);
        }, 380);
        return;
      }
      const stage = stages.find(s => pct < s.at)?.name ?? "finishing";
      setProcessing({ progress: pct, stage, intent: intentId });
      setTimeout(tick, 110 + Math.random()*80);
    };
    setTimeout(tick, 200);
  };

  const onAsk = () => {
    if (!prompt.trim() || processing || !hasOutput) return;
    showToast("Asked: " + prompt.slice(0,40) + "…");
    setPrompt("");
  };

  // Library popover close on outside click
  const popRef = useRef(null);
  useEffect(() => {
    if (!libraryOpen) return;
    const onClick = (e) => { if (popRef.current && !popRef.current.contains(e.target)) setLibraryOpen(false); };
    setTimeout(() => document.addEventListener("mousedown", onClick), 0);
    return () => document.removeEventListener("mousedown", onClick);
  }, [libraryOpen]);

  return (
    <div className="ca-app">
      {/* Slim top bar: brand + library + new */}
      <header className="ca-top">
        <div className="ca-brand">
          <span className="ca-brand-mark">og</span>
          <span className="ca-brand-name">OCR</span>
        </div>
        <div className="ca-top-spacer" />
        <div className="ca-top-actions">
          <div className="ca-lib-wrap" ref={popRef}>
            <button className="ca-top-btn" onClick={() => setLibraryOpen(o=>!o)}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 3 H12 M2 7 H12 M2 11 H12" stroke="currentColor" strokeWidth="1.2"/></svg>
              <span>Library</span>
              <span className="ca-lib-count">{sessions.length}</span>
            </button>
            {libraryOpen && (
              <div className="ca-lib-pop">
                <div className="ca-lib-head">Recent</div>
                {sessions.length === 0 && <div className="ca-lib-empty">No documents yet</div>}
                {sessions.map(s => (
                  <button key={s.id}
                    className={"ca-lib-row" + (s.id === activeId ? " is-active" : "")}
                    onClick={() => { setActiveId(s.id); setLibraryOpen(false); setChosenIntent(null); }}>
                    <span className="ca-lib-name">{s.filename}</span>
                    <span className="ca-lib-meta">{relTime(s.date)} ago</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="ca-top-btn ca-top-btn-primary" onClick={() => { setActiveId(null); setChosenIntent(null); }}>
            <span>New</span>
          </button>
        </div>
      </header>

      {/* MAIN: one focal context based on state */}
      <main className="ca-main">
        {!active && <EmptyState onUpload={onUpload} />}

        {active && !hasOutput && !processing && (
          <ReadyState session={active} chosenIntent={chosenIntent} setChosenIntent={setChosenIntent} onRun={runIntent} />
        )}

        {active && processing && (
          <ProcessingState session={active} processing={processing} />
        )}

        {active && hasOutput && (
          <ResultState session={active} text={extracted[active.id]} prompt={prompt} setPrompt={setPrompt} onAsk={onAsk}
            onCopy={() => { navigator.clipboard?.writeText(extracted[active.id]||"").catch(()=>{}); showToast("Copied"); }}
            onSave={(kind) => showToast("Saved · " + kind)}
            onReplace={() => { setExtracted(e => { const n={...e}; delete n[active.id]; return n; }); setChosenIntent(null); }}
          />
        )}
      </main>

      {toast && <div className="ca-toast">{toast}</div>}
    </div>
  );
}

// ---------- Empty state ----------
function EmptyState({ onUpload }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);

  const pick = (e) => { const f = e.target.files?.[0]; if (f) onUpload(f.name); e.target.value = ""; };

  const onDrop = (e) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onUpload(f.name);
  };

  return (
    <div className="ca-empty">
      <div className="ca-empty-eyebrow">Step 1 of 2</div>
      <h1 className="ca-empty-h">Drop in a document.</h1>
      <p className="ca-empty-sub">A photo, a screenshot, a PDF — anything with text.</p>

      <button className={"ca-drop" + (drag ? " is-drag" : "")}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}>
        <div className="ca-drop-icon">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M14 4 V20 M8 14 L14 20 L20 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M4 24 H24" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="ca-drop-label">Drop a file or click to choose</div>
        <div className="ca-drop-sub">JPG, PNG, HEIC, PDF</div>
      </button>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" hidden onChange={pick} />

      <div className="ca-empty-or">or paste from clipboard ⌘V</div>
    </div>
  );
}

// ---------- Ready (file uploaded, choose intent) ----------
function ReadyState({ session, chosenIntent, setChosenIntent, onRun }) {
  return (
    <div className="ca-ready">
      <div className="ca-ready-stage">
        <div className="ca-stage-eyebrow">Ready</div>
        <div className="ca-stage-file">
          <div className="ca-stage-thumb">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 3 H13 L17 7 V17 H5 Z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
              <path d="M13 3 V7 H17" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            </svg>
          </div>
          <div className="ca-stage-meta">
            <div className="ca-stage-name">{session.filename}</div>
            <div className="ca-stage-sub">Loaded · ready to extract</div>
          </div>
          <button className="ca-stage-replace" title="Replace">×</button>
        </div>
      </div>

      <div className="ca-intent-block">
        <div className="ca-eyebrow">Step 2 of 2</div>
        <h2 className="ca-intent-h">What do you need from it?</h2>
        <div className="ca-intent-list">
          {INTENTS.map(i => (
            <button key={i.id}
              className={"ca-intent" + (chosenIntent === i.id ? " is-chosen" : "")}
              onClick={() => setChosenIntent(i.id)}>
              <div className="ca-intent-label">{i.label}</div>
              <div className="ca-intent-hint">{i.hint}</div>
              <div className="ca-intent-check">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 7 L6 10 L11 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </button>
          ))}
        </div>
        <div className="ca-intent-foot">
          <button className="ca-cta" disabled={!chosenIntent} onClick={() => onRun(chosenIntent)}>
            Extract
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7 H11 M7 3 L11 7 L7 11" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button className="ca-link">Not sure? Auto-detect →</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Processing ----------
function ProcessingState({ session, processing }) {
  return (
    <div className="ca-proc">
      <div className="ca-proc-card">
        <div className="ca-proc-name">{session.filename}</div>
        <div className="ca-proc-stage">{processing.stage}…</div>
        <div className="ca-proc-bar"><div className="ca-proc-fill" style={{width: processing.progress + "%"}} /></div>
        <div className="ca-proc-pct">{Math.round(processing.progress)}%</div>
      </div>
    </div>
  );
}

// ---------- Result (output + ask + simple actions) ----------
function ResultState({ session, text, prompt, setPrompt, onAsk, onCopy, onSave, onReplace }) {
  const blocks = useMemo(() => parseMD(text), [text]);
  return (
    <div className="ca-result">
      <div className="ca-result-bar">
        <div className="ca-result-file">
          <span className="ca-result-name">{session.filename}</span>
          <span className="ca-result-dot">·</span>
          <button className="ca-result-replace" onClick={onReplace}>Use a different file</button>
        </div>
        <div className="ca-result-actions">
          <button className="ca-icon-btn" onClick={onCopy} title="Copy">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="3" y="3" width="8" height="8" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M5 5 V1 H13 V9 H11" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>
            <span>Copy</span>
          </button>
          <button className="ca-icon-btn" onClick={() => onSave("PDF")}>Save as PDF</button>
          <button className="ca-icon-btn" onClick={() => onSave("Markdown")}>.md</button>
        </div>
      </div>

      <article className="ca-doc">
        {blocks.map((b, i) => {
          if (b.type === "h1") return <h1 key={i}>{inline(b.text)}</h1>;
          if (b.type === "h2") return <h2 key={i}>{inline(b.text)}</h2>;
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

      <div className="ca-ask-dock">
        <div className="ca-ask-wrap">
          <input
            className="ca-ask-input"
            placeholder="Ask a follow-up — translate, summarize, restructure…"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") onAsk(); }}
          />
          <button className="ca-ask-send" disabled={!prompt.trim()} onClick={onAsk}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7 H12 M8 3 L12 7 L8 11" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CalmApp });
