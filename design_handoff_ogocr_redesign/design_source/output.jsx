/* global React */
const { useState, useEffect, useRef, useMemo } = React;

// -------------------------------------------------------------
// OutputColumn — extracted document + grouped exports + prompt
// -------------------------------------------------------------
function OutputColumn({ session, processing, prompt, setPrompt, onRunPrompt, onExport }) {
  const [mode, setMode] = useState("rendered"); // rendered | source | diff
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(session.text || "").catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <section className="og-output">
      <div className="og-output-head">
        <div className="og-output-title">
          <span className="og-output-num">OUT.{session.id.slice(-3).toUpperCase()}</span>
          <span className="og-output-h">Extracted Document</span>
          <span className="og-output-sep">/</span>
          <span className="og-output-kind">{kindLabel(session.kind)}</span>
        </div>
        <div className="og-output-modes">
          <ModePill active={mode === "rendered"} onClick={() => setMode("rendered")}>Rendered</ModePill>
          <ModePill active={mode === "source"}   onClick={() => setMode("source")}>Source</ModePill>
          <ModePill active={mode === "diff"}     onClick={() => setMode("diff")}>Diff</ModePill>
        </div>
      </div>

      {processing && <ProcessingStrip processing={processing} />}

      <div className="og-output-canvas">
        {mode === "rendered" && <RenderedDoc text={session.text} />}
        {mode === "source"   && <SourceDoc text={session.text} />}
        {mode === "diff"     && <DiffDoc text={session.text} />}
      </div>

      <div className="og-output-foot">
        <ExportBar onExport={onExport} copied={copied} onCopy={handleCopy} />
        <PromptDock value={prompt} onChange={setPrompt} onRun={onRunPrompt} processing={!!processing} />
      </div>
    </section>
  );
}

function ModePill({ active, onClick, children }) {
  return (
    <button className={"og-pill" + (active ? " is-active" : "")} onClick={onClick}>
      {children}
    </button>
  );
}

function kindLabel(k) {
  const map = {
    text: "Plain text", handwriting: "Handwriting", table: "Tabular", actions: "Action items",
    math: "LaTeX", mermaid: "Mermaid", sketch: "SVG", images: "Image set", diagram: "Diagram"
  };
  return map[k] || "Document";
}

// -------------------------------------------------------------
// Processing strip — slim ticker that replaces nothing-happens void
// -------------------------------------------------------------
function ProcessingStrip({ processing }) {
  const { progress, stage, actionId } = processing;
  const action = window.MAGIC_ACTIONS?.find?.(a => a.id === actionId) ||
                  ({ label: "Working", glyph: "◐" });
  return (
    <div className="og-proc">
      <div className="og-proc-glyph"><span className="og-proc-spin">◐</span></div>
      <div className="og-proc-mid">
        <div className="og-proc-line">
          <span className="og-proc-action">{action.label || "Working"}</span>
          <span className="og-proc-stage">· {stage}</span>
        </div>
        <div className="og-proc-bar"><div className="og-proc-bar-fill" style={{ width: progress + "%" }} /></div>
      </div>
      <div className="og-proc-pct">{Math.round(progress)}%</div>
    </div>
  );
}

// -------------------------------------------------------------
// Tiny markdown renderer (handles h1/h2/h3, bullets, ordered, blockquote, table, code, inline em/strong)
// -------------------------------------------------------------
function RenderedDoc({ text }) {
  const blocks = useMemo(() => parseMarkdown(text || ""), [text]);
  return (
    <article className="og-rendered">
      <div className="og-rendered-runner">
        <span>OG·OCR</span>
        <span>·</span>
        <span>EXTRACTED · {blocks.length} blocks</span>
      </div>
      {blocks.map((b, i) => <Block key={i} b={b} />)}
      <div className="og-rendered-end">
        <span>—</span>
        <span>END OF DOCUMENT</span>
        <span>—</span>
      </div>
    </article>
  );
}

function Block({ b }) {
  if (b.type === "h1") return <h1 className="og-h1">{inlineFmt(b.text)}</h1>;
  if (b.type === "h2") return <h2 className="og-h2">{inlineFmt(b.text)}</h2>;
  if (b.type === "h3") return <h3 className="og-h3">{inlineFmt(b.text)}</h3>;
  if (b.type === "p")  return <p className="og-p">{inlineFmt(b.text)}</p>;
  if (b.type === "ul") return <ul className="og-ul">{b.items.map((it, i) => <li key={i}>{inlineFmt(it)}</li>)}</ul>;
  if (b.type === "ol") return <ol className="og-ol">{b.items.map((it, i) => <li key={i}>{inlineFmt(it)}</li>)}</ol>;
  if (b.type === "bq") return <blockquote className="og-bq">{inlineFmt(b.text)}</blockquote>;
  if (b.type === "table") {
    return (
      <table className="og-table">
        <thead><tr>{b.head.map((h, i) => <th key={i}>{inlineFmt(h)}</th>)}</tr></thead>
        <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{inlineFmt(c)}</td>)}</tr>)}</tbody>
      </table>
    );
  }
  return null;
}

function inlineFmt(s) {
  if (!s) return null;
  // Order matters: bold ** ** before em * *
  const parts = [];
  let rest = s;
  let key = 0;
  const push = (node) => parts.push(<React.Fragment key={key++}>{node}</React.Fragment>);
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/;
  while (true) {
    const m = rest.match(re);
    if (!m) { push(rest); break; }
    if (m.index > 0) push(rest.slice(0, m.index));
    if (m[2]) push(<strong>{m[2]}</strong>);
    else if (m[3]) push(<em>{m[3]}</em>);
    else if (m[4]) push(<code className="og-code-inline">{m[4]}</code>);
    rest = rest.slice(m.index + m[0].length);
  }
  return parts;
}

function parseMarkdown(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = line.match(/^#\s+(.+)/)))   { blocks.push({ type: "h1", text: m[1] }); i++; continue; }
    if ((m = line.match(/^##\s+(.+)/)))  { blocks.push({ type: "h2", text: m[1] }); i++; continue; }
    if ((m = line.match(/^###\s+(.+)/))) { blocks.push({ type: "h3", text: m[1] }); i++; continue; }
    if ((m = line.match(/^>\s+(.+)/)))   { blocks.push({ type: "bq", text: m[1] }); i++; continue; }
    if (line.match(/^[-*]\s+/)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) { items.push(lines[i].replace(/^[-*]\s+/, "")); i++; }
      blocks.push({ type: "ul", items }); continue;
    }
    if (line.match(/^\d+\.\s+/)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) { items.push(lines[i].replace(/^\d+\.\s+/, "")); i++; }
      blocks.push({ type: "ol", items }); continue;
    }
    if (line.includes("|") && lines[i + 1] && lines[i + 1].match(/^\s*\|?[\s:|-]+\|?\s*$/)) {
      const head = line.split("|").map(s => s.trim()).filter(Boolean);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|")) {
        rows.push(lines[i].split("|").map(s => s.trim()).filter((_, idx, arr) => idx > 0 || arr[0]));
        // Better: filter empty leading/trailing only
        i++;
      }
      // re-split with cleaner logic
      const cleanRows = rows.map(r => r.filter((c, idx, arr) => !(idx === 0 && c === "") && !(idx === arr.length - 1 && c === "")));
      blocks.push({ type: "table", head, rows: cleanRows });
      continue;
    }
    // paragraph: gather until blank line
    const buf = [];
    while (i < lines.length && lines[i].trim() && !lines[i].match(/^(#{1,3}\s|>|[-*]\s|\d+\.\s)/) && !(lines[i].includes("|") && lines[i+1] && lines[i+1].match(/^\s*\|?[\s:|-]+\|?\s*$/))) {
      buf.push(lines[i]); i++;
    }
    blocks.push({ type: "p", text: buf.join(" ") });
  }
  return blocks;
}

function SourceDoc({ text }) {
  const numbered = (text || "").split("\n");
  return (
    <pre className="og-source-doc">
      {numbered.map((l, i) => (
        <div key={i} className="og-source-line">
          <span className="og-source-ln">{String(i + 1).padStart(3, "0")}</span>
          <span className="og-source-lc">{l || " "}</span>
        </div>
      ))}
    </pre>
  );
}

function DiffDoc({ text }) {
  // Faux diff — just adds a few "low-confidence" highlights
  const lines = (text || "").split("\n");
  return (
    <pre className="og-diff-doc">
      {lines.map((l, i) => {
        const lowConf = i % 7 === 3 || i % 11 === 5;
        return (
          <div key={i} className={"og-diff-line" + (lowConf ? " is-low" : "")}>
            <span className="og-diff-mark">{lowConf ? "?" : " "}</span>
            <span className="og-diff-text">{l || " "}</span>
            {lowConf && <span className="og-diff-conf">conf 0.71</span>}
          </div>
        );
      })}
    </pre>
  );
}

// -------------------------------------------------------------
// ExportBar — grouped exports
// -------------------------------------------------------------
function ExportBar({ onExport, copied, onCopy }) {
  return (
    <div className="og-exports">
      {window.EXPORT_GROUPS.map(g => (
        <div className="og-export-group" key={g.id}>
          <div className="og-export-label">{g.label}</div>
          <div className="og-export-items">
            {g.items.map(it => (
              <button key={it.id} className="og-export-btn"
                onClick={() => it.id === "copy" ? onCopy() : onExport(it.id)}
                title={it.hint}>
                <span className="og-export-glyph">{it.id === "copy" && copied ? "✓" : it.glyph}</span>
                <span className="og-export-name">{it.id === "copy" && copied ? "Copied" : it.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// -------------------------------------------------------------
// PromptDock — central, hero, full-width
// -------------------------------------------------------------
function PromptDock({ value, onChange, onRun, processing }) {
  const presets = [
    "Translate to French",
    "Summarize in 3 bullets",
    "Convert to flashcards",
    "Reformat as outline",
  ];
  return (
    <div className="og-prompt">
      <div className="og-prompt-rail">
        <span className="og-prompt-glyph">⌁</span>
        <span className="og-prompt-label">Ask</span>
      </div>
      <textarea
        className="og-prompt-input"
        rows={1}
        placeholder="Ask Gemini anything about this document — translate, summarize, restructure…"
        value={value}
        disabled={processing}
        onChange={e => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onRun(); }
        }}
      />
      <div className="og-prompt-presets">
        {presets.map(p => (
          <button key={p} className="og-prompt-preset" disabled={processing} onClick={() => onChange(p)}>{p}</button>
        ))}
      </div>
      <button className="og-prompt-run" disabled={processing || !value.trim()} onClick={onRun}>
        <span>Run</span>
        <kbd className="og-kbd og-kbd-sm">↵</kbd>
      </button>
    </div>
  );
}

Object.assign(window, { OutputColumn });
