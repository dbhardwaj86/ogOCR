/* global React */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

// =====================================================================
// MOBILE — A "Calm" + B "Refined" · Portrait + Landscape
// Self-contained: includes minimal markdown parser, demo content,
// and four exported components: CalmMobilePortrait, CalmMobileLandscape,
// RefinedMobilePortrait, RefinedMobileLandscape.
// =====================================================================

const M_DEMO = [
  { id:"s1", filename:"biology_notes_p14.jpg", kind:"handwriting", chars:1842, conf:0.94, date: Date.now()-1000*60*4,
    text:`# Cellular Respiration\n\nThe **mitochondrion** is the powerhouse of the cell. It converts glucose into ATP — the cell's energy currency.\n\n## Three stages\n\n1. **Glycolysis** — splits glucose into 2 pyruvate. Net 2 ATP.\n2. **Krebs cycle** — pyruvate oxidized; CO₂ released.\n3. **Electron transport** — yields ~28 ATP.\n\n> Total: 30–32 ATP per glucose.` },
  { id:"s2", filename:"lunch_receipt.heic", kind:"table", chars:412, conf:0.99, date: Date.now()-1000*60*38,
    text:`# Receipt — Maison Verre\n\n*Mar 14 · 12:47 PM*\n\n| Item | Qty | Price |\n| --- | --- | --- |\n| Croque-madame | 1 | 16.00 |\n| Salade niçoise | 1 | 18.50 |\n| Espresso | 2 | 7.00 |\n\n**Total:** 65.08` },
  { id:"s3", filename:"whiteboard_arch.jpg", kind:"diagram", chars:980, conf:0.88, date: Date.now()-1000*60*60*3,
    text:`# Service Architecture\n\nA rough sketch.\n\n- **Edge** receives uploads\n- **Worker A** parses + extracts\n- **Worker B** consumes thumbnail queue` },
];

const M_INTENTS = [
  { id:"text",  label:"Just the text",     hint:"Plain prose"          },
  { id:"table", label:"As a clean table",  hint:"Rows & columns"       },
  { id:"tasks", label:"Action items",      hint:"To-dos as checklist"  },
  { id:"math",  label:"Math equations",    hint:"Render or copy LaTeX" },
  { id:"diag",  label:"Diagram or sketch", hint:"Editable flowchart"   },
];

const M_ACTIONS = [
  { id:"text", group:"Text", label:"Extract Text", glyph:"Aa" },
  { id:"handwriting", group:"Text", label:"Clean Handwriting", glyph:"H" },
  { id:"table", group:"Structure", label:"Format as Table", glyph:"⊞" },
  { id:"actions", group:"Structure", label:"Extract Actions", glyph:"✓" },
  { id:"math", group:"Symbol", label:"Math → LaTeX", glyph:"∑" },
  { id:"mermaid", group:"Symbol", label:"Diagram → Mermaid", glyph:"◇" },
  { id:"sketch", group:"Visual", label:"Sketch → SVG", glyph:"✎" },
  { id:"images", group:"Visual", label:"Extract Images", glyph:"▣" },
];

function mRel(d) {
  const sec = Math.round((Date.now() - d) / 1000);
  if (sec < 60) return sec + "s";
  if (sec < 3600) return Math.round(sec/60) + "m";
  if (sec < 86400) return Math.round(sec/3600) + "h";
  return Math.round(sec/86400) + "d";
}

function mParseMD(text) {
  const lines = (text||"").replace(/\r/g,"").split("\n");
  const blocks = []; let i = 0;
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
      i += 2; const rows = [];
      while (i < lines.length && lines[i].includes("|")) {
        rows.push(lines[i].split("|").map(s=>s.trim()).filter((c,idx,arr)=>!(idx===0&&c==="")&&!(idx===arr.length-1&&c==="")));
        i++;
      }
      blocks.push({type:"table",head,rows}); continue;
    }
    const buf=[]; while(i<lines.length && lines[i].trim() && !lines[i].match(/^(#{1,2}\s|>|[-*]\s|\d+\.\s)/)) { buf.push(lines[i]); i++; }
    blocks.push({type:"p",text:buf.join(" ")});
  }
  return blocks;
}

function mInline(s) {
  if (!s) return null;
  const parts = []; let rest = s; let key = 0;
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/;
  while (true) {
    const m = rest.match(re);
    if (!m) { parts.push(<React.Fragment key={key++}>{rest}</React.Fragment>); break; }
    if (m.index>0) parts.push(<React.Fragment key={key++}>{rest.slice(0,m.index)}</React.Fragment>);
    if (m[2]) parts.push(<strong key={key++}>{m[2]}</strong>);
    else if (m[3]) parts.push(<em key={key++}>{m[3]}</em>);
    rest = rest.slice(m.index + m[0].length);
  }
  return parts;
}

function MDoc({ text, cls="" }) {
  const blocks = useMemo(() => mParseMD(text || ""), [text]);
  return <article className={cls}>
    {blocks.map((b, i) => {
      if (b.type === "h1") return <h1 key={i}>{mInline(b.text)}</h1>;
      if (b.type === "h2") return <h2 key={i}>{mInline(b.text)}</h2>;
      if (b.type === "p")  return <p key={i}>{mInline(b.text)}</p>;
      if (b.type === "ul") return <ul key={i}>{b.items.map((it,j)=><li key={j}>{mInline(it)}</li>)}</ul>;
      if (b.type === "ol") return <ol key={i}>{b.items.map((it,j)=><li key={j}>{mInline(it)}</li>)}</ol>;
      if (b.type === "bq") return <blockquote key={i}>{mInline(b.text)}</blockquote>;
      if (b.type === "table") return (
        <table key={i}><thead><tr>{b.head.map((h,j)=><th key={j}>{mInline(h)}</th>)}</tr></thead>
          <tbody>{b.rows.map((r,j)=><tr key={j}>{r.map((c,k)=><td key={k}>{mInline(c)}</td>)}</tr>)}</tbody></table>
      );
      return null;
    })}
  </article>;
}

// =====================================================================
// CALM MOBILE — PORTRAIT
// One screen at a time. Bottom sheet for library. Stepped flow.
// =====================================================================
function CalmMobilePortrait() {
  const [view, setView] = useState("empty"); // empty | ready | proc | result
  const [active, setActive] = useState(null);
  const [intent, setIntent] = useState(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("preparing");
  const [libOpen, setLibOpen] = useState(false);
  const [prompt, setPrompt] = useState("");

  const upload = (s = M_DEMO[0]) => { setActive(s); setIntent(null); setView("ready"); };
  const run = () => {
    if (!intent) return;
    setView("proc"); setProgress(0); setStage("reading");
    const stages = [{at:30,n:"reading"},{at:60,n:"recognizing"},{at:90,n:"structuring"},{at:100,n:"finishing"}];
    let p = 0;
    const tick = () => {
      p += 6 + Math.random()*8;
      if (p >= 100) { setProgress(100); setTimeout(()=>setView("result"), 400); return; }
      setProgress(p); setStage(stages.find(s => p < s.at)?.n || "finishing");
      setTimeout(tick, 130 + Math.random()*80);
    };
    setTimeout(tick, 250);
  };

  return (
    <div className="cmp">
      {/* Top bar */}
      <header className="cmp-top">
        <div className="cmp-brand">
          <span className="cmp-brand-i">og</span><span className="cmp-brand-r">OCR</span>
        </div>
        <button className="cmp-top-btn" onClick={() => setLibOpen(true)}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M3 4 H15 M3 9 H15 M3 14 H15" stroke="currentColor" strokeWidth="1.4"/>
          </svg>
        </button>
      </header>

      <main className="cmp-main">
        {view === "empty" && (
          <div className="cmp-empty">
            <div className="cmp-eyebrow">Step 1 of 2</div>
            <h1>Drop in a document.</h1>
            <p>A photo, screenshot, or PDF — anything with text.</p>
            <button className="cmp-drop" onClick={() => upload()}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M16 5 V22 M9 15 L16 22 L23 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M5 27 H27" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
              <div className="cmp-drop-l">Tap to choose a file</div>
              <div className="cmp-drop-s">JPG · PNG · HEIC · PDF</div>
            </button>
            <div className="cmp-empty-row">
              <button className="cmp-quick"><span>📷</span>Take a photo</button>
              <button className="cmp-quick"><span>📋</span>Paste</button>
            </div>
          </div>
        )}

        {view === "ready" && (
          <div className="cmp-ready">
            <div className="cmp-file-pill">
              <div className="cmp-file-thumb">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                  <path d="M5 3 H13 L17 7 V17 H5 Z" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M13 3 V7 H17" stroke="currentColor" strokeWidth="1.2"/>
                </svg>
              </div>
              <div className="cmp-file-meta">
                <div className="cmp-file-name">{active.filename}</div>
                <div className="cmp-file-sub">Loaded · ready</div>
              </div>
              <button className="cmp-file-x" onClick={() => setView("empty")}>×</button>
            </div>

            <div className="cmp-eyebrow" style={{marginTop: 24}}>Step 2 of 2</div>
            <h2 className="cmp-h2">What do you need from it?</h2>
            <div className="cmp-intents">
              {M_INTENTS.map(i => (
                <button key={i.id}
                  className={"cmp-intent" + (intent === i.id ? " is-on" : "")}
                  onClick={() => setIntent(i.id)}>
                  <div className="cmp-intent-l">{i.label}</div>
                  <div className="cmp-intent-h">{i.hint}</div>
                  <div className="cmp-intent-c">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M3 7 L6 10 L11 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {view === "proc" && (
          <div className="cmp-proc">
            <div className="cmp-proc-name">{active.filename}</div>
            <div className="cmp-proc-stage">{stage}…</div>
            <div className="cmp-proc-bar"><div style={{width: progress+"%"}}/></div>
            <div className="cmp-proc-pct">{Math.round(progress)}%</div>
          </div>
        )}

        {view === "result" && (
          <div className="cmp-result">
            <div className="cmp-result-bar">
              <span className="cmp-result-name">{active.filename}</span>
              <div className="cmp-result-actions">
                <button>Copy</button><button>Share</button>
              </div>
            </div>
            <MDoc text={active.text} cls="cmp-doc" />
          </div>
        )}
      </main>

      {/* Sticky bottom CTA */}
      {view === "ready" && (
        <div className="cmp-cta-dock">
          <button className="cmp-cta" disabled={!intent} onClick={run}>
            Extract
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8 H13 M9 4 L13 8 L9 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      )}

      {view === "result" && (
        <div className="cmp-ask-dock">
          <div className="cmp-ask">
            <input placeholder="Ask a follow-up…" value={prompt} onChange={e=>setPrompt(e.target.value)} />
            <button disabled={!prompt.trim()} onClick={() => setPrompt("")}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7 H12 M8 3 L12 7 L8 11" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* Library bottom sheet */}
      {libOpen && (
        <div className="cmp-sheet-shroud" onClick={() => setLibOpen(false)}>
          <div className="cmp-sheet" onClick={e=>e.stopPropagation()}>
            <div className="cmp-sheet-handle"/>
            <div className="cmp-sheet-h">Library</div>
            {M_DEMO.map(s => (
              <button key={s.id} className="cmp-sheet-row" onClick={() => { upload(s); setLibOpen(false); }}>
                <div className="cmp-sheet-thumb">{s.kind === "handwriting" ? "H" : s.kind === "table" ? "⊞" : "◇"}</div>
                <div className="cmp-sheet-body">
                  <div>{s.filename}</div>
                  <div className="cmp-sheet-meta">{mRel(s.date)} ago · {s.chars.toLocaleString()} chars</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// CALM MOBILE — LANDSCAPE
// Two columns: file/intent on left, drop area or doc on right.
// Library accessible from edge. Optimized for tablet-style holding.
// =====================================================================
function CalmMobileLandscape() {
  const [view, setView] = useState("empty");
  const [active, setActive] = useState(null);
  const [intent, setIntent] = useState(null);

  const upload = (s = M_DEMO[0]) => { setActive(s); setIntent(null); setView("ready"); };
  const run = () => { if (intent) setView("result"); };

  return (
    <div className="cml">
      <aside className="cml-side">
        <div className="cml-brand">
          <span className="cml-brand-i">og</span><span className="cml-brand-r">OCR</span>
        </div>
        <div className="cml-side-h">Library</div>
        {M_DEMO.map(s => (
          <button key={s.id} className={"cml-side-row" + (active?.id === s.id ? " is-on" : "")} onClick={() => upload(s)}>
            <span className="cml-side-name">{s.filename}</span>
            <span className="cml-side-meta">{mRel(s.date)}</span>
          </button>
        ))}
      </aside>

      <main className="cml-main">
        {view === "empty" && (
          <div className="cml-empty">
            <div className="cml-eyebrow">Step 1 of 2</div>
            <h1>Drop in a document.</h1>
            <p>Anything with text — photo, screenshot, PDF.</p>
            <button className="cml-drop" onClick={() => upload()}>
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                <path d="M16 5 V22 M9 15 L16 22 L23 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M5 27 H27" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
              <div>Tap to choose a file</div>
              <div className="cml-drop-s">JPG · PNG · HEIC · PDF</div>
            </button>
          </div>
        )}

        {view === "ready" && (
          <div className="cml-ready">
            <div className="cml-eyebrow">Step 2 of 2 · {active.filename}</div>
            <h2>What do you need from it?</h2>
            <div className="cml-intents">
              {M_INTENTS.map(i => (
                <button key={i.id} className={"cml-intent" + (intent === i.id ? " is-on" : "")} onClick={() => setIntent(i.id)}>
                  <div className="cml-intent-l">{i.label}</div>
                  <div className="cml-intent-h">{i.hint}</div>
                </button>
              ))}
            </div>
            <button className="cml-cta" disabled={!intent} onClick={run}>Extract →</button>
          </div>
        )}

        {view === "result" && (
          <div className="cml-result">
            <div className="cml-result-bar">
              <span>{active.filename}</span>
              <div><button>Copy</button><button>PDF</button><button>Share</button></div>
            </div>
            <MDoc text={active.text} cls="cml-doc" />
          </div>
        )}
      </main>
    </div>
  );
}

// =====================================================================
// REFINED MOBILE — PORTRAIT
// Bottom-tab navigation through the same regions: Source · Output · Ask.
// Keeps action grid, view-mode pills, exports — but stacked & swipeable.
// =====================================================================
function RefinedMobilePortrait() {
  const [tab, setTab] = useState("source"); // source | output | ask
  const [active, setActive] = useState(M_DEMO[0]);
  const [processing, setProcessing] = useState(null);
  const [mode, setMode] = useState("rendered");
  const [libOpen, setLibOpen] = useState(false);
  const [prompt, setPrompt] = useState("");

  const run = (id) => {
    if (processing) return;
    setProcessing({ id, p: 0, stage: "reading" });
    let p = 0;
    const tick = () => {
      p += 8 + Math.random()*8;
      if (p >= 100) { setProcessing({ id, p: 100, stage: "finalizing" }); setTimeout(()=>{ setProcessing(null); setTab("output"); }, 300); return; }
      const stage = p < 30 ? "reading" : p < 65 ? "recognizing" : "structuring";
      setProcessing({ id, p, stage });
      setTimeout(tick, 120);
    };
    setTimeout(tick, 200);
  };

  return (
    <div className="rmp">
      <header className="rmp-top">
        <button className="rmp-top-btn" onClick={() => setLibOpen(true)}>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
            <path d="M3 4 H15 M3 9 H15 M3 14 H15" stroke="currentColor" strokeWidth="1.4"/>
          </svg>
        </button>
        <div className="rmp-brand">
          <span className="rmp-brand-i">og</span><span className="rmp-brand-r">OCR</span>
        </div>
        <button className="rmp-top-btn">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4"/><path d="M11 11 L13 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
        </button>
      </header>

      {processing && (
        <div className="rmp-proc">
          <div className="rmp-proc-line">{M_ACTIONS.find(a=>a.id===processing.id)?.label} — {processing.stage}</div>
          <div className="rmp-proc-bar"><div style={{width: processing.p+"%"}}/></div>
        </div>
      )}

      <main className="rmp-main">
        {tab === "source" && (
          <div className="rmp-pane rmp-source">
            <div className="rmp-source-head">
              <div className="rmp-source-name">{active.filename}</div>
              <div className="rmp-source-stats">
                <span>1240×1754</span><span>·</span><span>{Math.round(active.conf*100)}%</span>
              </div>
            </div>
            <div className="rmp-paper">
              <div className="rmp-paper-h">
                <span>SCAN · {new Date(active.date).toISOString().slice(0,10)}</span>
                <span>{active.filename}</span>
              </div>
              <div className="rmp-paper-lines">
                {Array.from({length: 14}, (_, i) => (
                  <div key={i} className="rmp-pl" style={{width: (35 + (i*7)%55) + "%"}}/>
                ))}
              </div>
              {processing && <div className="rmp-scan" style={{top: processing.p+"%"}}/>}
            </div>

            <div className="rmp-actions-h">Actions</div>
            <div className="rmp-actions">
              {M_ACTIONS.map(a => (
                <button key={a.id} className={"rmp-tile" + (processing?.id===a.id?" is-on":"")} disabled={!!processing} onClick={() => run(a.id)}>
                  <span className="rmp-tile-g">{a.glyph}</span>
                  <span className="rmp-tile-l">{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === "output" && (
          <div className="rmp-pane rmp-output">
            <div className="rmp-out-head">
              <h2>Extracted</h2>
              <div className="rmp-modes">
                {["rendered","source","diff"].map(m => (
                  <button key={m} className={mode===m?"is-on":""} onClick={()=>setMode(m)}>{m}</button>
                ))}
              </div>
            </div>
            <MDoc text={active.text} cls="rmp-doc" />
            <div className="rmp-exports">
              <button>Copy</button><button>Markdown</button><button>PDF</button>
              <button>Drive</button><button>Email</button><button>Link</button>
            </div>
          </div>
        )}

        {tab === "ask" && (
          <div className="rmp-pane rmp-ask">
            <h2 className="rmp-ask-h">Ask anything</h2>
            <p className="rmp-ask-sub">Translate, summarize, restructure — Gemini will work on the extracted document.</p>
            <textarea
              className="rmp-ask-input"
              rows={4}
              placeholder="Ask Gemini anything about this document…"
              value={prompt}
              onChange={e=>setPrompt(e.target.value)}
            />
            <div className="rmp-presets">
              {["Translate to French","Summarize in 3 bullets","Convert to flashcards","Reformat as outline"].map(p => (
                <button key={p} onClick={() => setPrompt(p)}>{p}</button>
              ))}
            </div>
            <button className="rmp-ask-run" disabled={!prompt.trim()}>
              Run <span>↵</span>
            </button>
          </div>
        )}
      </main>

      <nav className="rmp-tabs">
        <button className={tab==="source"?"is-on":""} onClick={()=>setTab("source")}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="3" y="2" width="12" height="14" stroke="currentColor" strokeWidth="1.3"/><path d="M5 6 H13 M5 9 H13 M5 12 H10" stroke="currentColor" strokeWidth="1.3"/></svg>
          <span>Source</span>
        </button>
        <button className={tab==="output"?"is-on":""} onClick={()=>setTab("output")}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 4 H15 M3 9 H13 M3 14 H11" stroke="currentColor" strokeWidth="1.3"/></svg>
          <span>Output</span>
        </button>
        <button className={tab==="ask"?"is-on":""} onClick={()=>setTab("ask")}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 4 H15 V12 H10 L7 15 V12 H3 Z" stroke="currentColor" strokeWidth="1.3" fill="none"/></svg>
          <span>Ask</span>
        </button>
      </nav>

      {libOpen && (
        <div className="rmp-sheet-shroud" onClick={() => setLibOpen(false)}>
          <div className="rmp-sheet" onClick={e=>e.stopPropagation()}>
            <div className="rmp-sheet-handle"/>
            <div className="rmp-sheet-h">Library</div>
            {M_DEMO.map(s => (
              <button key={s.id} className="rmp-sheet-row" onClick={() => { setActive(s); setLibOpen(false); setTab("source"); }}>
                <div className="rmp-sheet-thumb">{s.kind==="handwriting"?"H":s.kind==="table"?"⊞":"◇"}</div>
                <div>
                  <div>{s.filename}</div>
                  <div className="rmp-sheet-meta">{mRel(s.date)} · {Math.round(s.conf*100)}%</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// REFINED MOBILE — LANDSCAPE
// Two-pane: source preview + actions on left, output + exports on right.
// Library as collapsible drawer. Compromise of desktop in landscape.
// =====================================================================
function RefinedMobileLandscape() {
  const [active, setActive] = useState(M_DEMO[0]);
  const [drawer, setDrawer] = useState(false);
  const [mode, setMode] = useState("rendered");
  const [prompt, setPrompt] = useState("");

  return (
    <div className="rml">
      <header className="rml-top">
        <button className="rml-burger" onClick={()=>setDrawer(d=>!d)}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 3 H12 M2 7 H12 M2 11 H12" stroke="currentColor" strokeWidth="1.3"/></svg>
        </button>
        <div className="rml-brand"><span className="rml-brand-i">og</span><span className="rml-brand-r">OCR</span></div>
        <div className="rml-meta">{active.filename} · {Math.round(active.conf*100)}%</div>
        <button className="rml-cmd"><kbd>⌘K</kbd></button>
      </header>

      <div className="rml-body">
        {drawer && (
          <aside className="rml-drawer">
            <div className="rml-drawer-h">Library</div>
            {M_DEMO.map(s => (
              <button key={s.id} className={"rml-drawer-row" + (active.id===s.id?" is-on":"")} onClick={()=>{setActive(s); setDrawer(false);}}>
                <div className="rml-drawer-thumb">{s.kind==="handwriting"?"H":s.kind==="table"?"⊞":"◇"}</div>
                <div>
                  <div className="rml-drawer-name">{s.filename}</div>
                  <div className="rml-drawer-meta">{mRel(s.date)} · {s.chars.toLocaleString()}ch</div>
                </div>
              </button>
            ))}
          </aside>
        )}

        <section className="rml-source">
          <div className="rml-paper">
            <div className="rml-paper-h">
              <span>SCAN · {new Date(active.date).toISOString().slice(0,10)}</span>
              <span>{active.filename}</span>
            </div>
            <div className="rml-paper-lines">
              {Array.from({length: 12}, (_, i) => (
                <div key={i} className="rml-pl" style={{width: (35 + (i*7)%55) + "%"}}/>
              ))}
            </div>
          </div>
          <div className="rml-actions">
            {M_ACTIONS.slice(0, 6).map(a => (
              <button key={a.id} className="rml-tile">
                <span className="rml-tile-g">{a.glyph}</span>
                <span className="rml-tile-l">{a.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="rml-output">
          <div className="rml-out-head">
            <h2>Extracted</h2>
            <div className="rml-modes">
              {["rendered","source","diff"].map(m => (
                <button key={m} className={mode===m?"is-on":""} onClick={()=>setMode(m)}>{m}</button>
              ))}
            </div>
          </div>
          <div className="rml-canvas">
            <MDoc text={active.text} cls="rml-doc" />
          </div>
          <div className="rml-foot">
            <div className="rml-exports">
              <button>Copy</button><button>.md</button><button>PDF</button><button>Share</button>
            </div>
            <div className="rml-prompt">
              <input placeholder="Ask a follow-up…" value={prompt} onChange={e=>setPrompt(e.target.value)} />
              <button disabled={!prompt.trim()}>Run ↵</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

Object.assign(window, { CalmMobilePortrait, CalmMobileLandscape, RefinedMobilePortrait, RefinedMobileLandscape });
