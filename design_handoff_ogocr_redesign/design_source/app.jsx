/* global React, ReactDOM, useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakSelect, TweakSlider, TweakToggle */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

// -------------------------------------------------------------
// Tweak defaults (host writes these to disk on change)
// -------------------------------------------------------------
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "paper",
  "density": "comfortable",
  "fontPair": "instrument-inter",
  "layout": "three-pane",
  "actionStyle": "tiles",
  "fontSize": 15,
  "showTablets": true,
  "accentColor": "",
  "inkColor": "",
  "headingColor": ""
}/*EDITMODE-END*/;

// -------------------------------------------------------------
// Demo content (acts as if these were already extracted)
// -------------------------------------------------------------
const DEMO_SESSIONS = [
  {
    id: "s-001",
    filename: "biology_notes_p14.jpg",
    kind: "handwriting",
    confidence: 0.94,
    chars: 1842,
    pages: 1,
    date: Date.now() - 1000 * 60 * 4,
    thumbHue: 30,
    text: `# Cellular Respiration — Notes\n\nThe **mitochondrion** is often called the *powerhouse* of the cell. Through a process called **cellular respiration**, it converts glucose into ATP — the energy currency the cell actually uses.\n\n## The three stages\n\n1. **Glycolysis** — happens in the cytoplasm, splits glucose (6C) into 2 pyruvate (3C). Net: 2 ATP, 2 NADH.\n2. **Krebs cycle** — inside the matrix. Each pyruvate is oxidized; CO₂ released. Net per glucose: 2 ATP, 6 NADH, 2 FADH₂.\n3. **Electron transport chain** — across the inner membrane. Yields ~28 ATP via oxidative phosphorylation.\n\n> Total yield: roughly **30–32 ATP** per glucose molecule.\n\n## Quick equation\n\nC₆H₁₂O₆ + 6 O₂ → 6 CO₂ + 6 H₂O + ATP\n\n*Remember:* without oxygen, the cell falls back on fermentation — only 2 ATP per glucose. Much less efficient, but it keeps things moving.`,
  },
  {
    id: "s-002",
    filename: "lunch_receipt.heic",
    kind: "table",
    confidence: 0.99,
    chars: 412,
    pages: 1,
    date: Date.now() - 1000 * 60 * 38,
    thumbHue: 80,
    text: `# Receipt — Maison Verre\n\n*March 14, 2026 · 12:47 PM · Server: Aida*\n\n| Item | Qty | Price |\n| --- | --- | --- |\n| Croque-madame | 1 | 16.00 |\n| Salade niçoise | 1 | 18.50 |\n| Espresso | 2 | 7.00 |\n| Tarte au citron | 1 | 9.00 |\n\n**Subtotal:** 50.50  \n**Tax (8.875%):** 4.48  \n**Tip (20%):** 10.10  \n**Total:** 65.08\n\nThank you — see you soon.`,
  },
  {
    id: "s-003",
    filename: "whiteboard_arch.jpg",
    kind: "diagram",
    confidence: 0.88,
    chars: 980,
    pages: 1,
    date: Date.now() - 1000 * 60 * 60 * 3,
    thumbHue: 200,
    text: `# Service Architecture (whiteboard)\n\nA rough sketch of how the ingestion pipeline fits together. Three queues, two workers, one source of truth.\n\n- **Edge** receives uploads, hands off to *ingest queue*\n- **Worker A** pulls jobs, does parse + extract, writes to **Postgres**\n- **Worker B** consumes a *thumbnail queue*, drops PNGs into object storage\n- A periodic **reconciler** sweeps for orphans every 15 min\n\nOpen question (margin note): *Do we need a dead-letter queue for parse failures, or is retry-with-backoff enough?*`,
  },
];

const MAGIC_ACTIONS = [
  { id: "text",        group: "Text",      label: "Extract Text",      hint: "Plain prose, paragraphs preserved",     glyph: "T",   key: "T" },
  { id: "handwriting", group: "Text",      label: "Clean Handwriting", hint: "Transcribe + fix obvious errors",       glyph: "H",   key: "H" },
  { id: "table",       group: "Structure", label: "Format as Table",   hint: "Tabular data → markdown table",         glyph: "▦",   key: "B" },
  { id: "actions",     group: "Structure", label: "Extract Actions",   hint: "Pull tasks into a checklist",           glyph: "✓",   key: "A" },
  { id: "math",        group: "Symbol",    label: "Math to LaTeX",     hint: "Equations → compile-ready LaTeX",       glyph: "∑",   key: "M" },
  { id: "mermaid",     group: "Symbol",    label: "Diagram → Mermaid", hint: "Flowchart → Mermaid.js code",           glyph: "◇",   key: "D" },
  { id: "sketch",      group: "Visual",    label: "Sketch → SVG",      hint: "Hand drawing → editable SVG",           glyph: "✎",   key: "S" },
  { id: "images",      group: "Visual",    label: "Extract Images",    hint: "Pull all figures with descriptions",    glyph: "▣",   key: "I" },
];

const ACTION_GROUPS = ["Text", "Structure", "Symbol", "Visual"];

const EXPORT_GROUPS = [
  { id: "save",   label: "Save",   items: [
    { id: "drive",   label: "Drive",     glyph: "△", hint: "Save to Google Drive" },
    { id: "md",      label: "Markdown",  glyph: "▤", hint: "Download .md file" },
    { id: "pdf",     label: "PDF",       glyph: "▢", hint: "Print / save as PDF" },
  ]},
  { id: "share",  label: "Share",  items: [
    { id: "email",     label: "Email",     glyph: "✉", hint: "Send via email" },
    { id: "classroom", label: "Classroom", glyph: "◯", hint: "Draft to Google Classroom" },
    { id: "link",      label: "Link",      glyph: "∞", hint: "Copy a share link" },
  ]},
  { id: "export", label: "Export", items: [
    { id: "copy",   label: "Copy",   glyph: "❐", hint: "Copy to clipboard" },
    { id: "png",    label: "PNG",    glyph: "▦", hint: "Rasterize to PNG" },
    { id: "json",   label: "JSON",   glyph: "{}", hint: "Structured payload" },
  ]},
];

// -------------------------------------------------------------
// Top-level App
// -------------------------------------------------------------
function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [sessions, setSessions] = useState(DEMO_SESSIONS);
  const [activeId, setActiveId] = useState(DEMO_SESSIONS[0].id);
  const [processing, setProcessing] = useState(null); // { actionId, progress, stage }
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [toast, setToast] = useState(null);

  const active = sessions.find(s => s.id === activeId) || sessions[0];

  // Apply theme attributes to documentElement so CSS variables flip cleanly
  useEffect(() => {
    document.documentElement.dataset.theme = tweaks.theme;
    document.documentElement.dataset.density = tweaks.density;
    document.documentElement.dataset.fontpair = tweaks.fontPair;
    document.documentElement.dataset.layout = tweaks.layout;
    document.documentElement.dataset.actionstyle = tweaks.actionStyle;
    document.documentElement.style.setProperty("--user-font-size", tweaks.fontSize + "px");
    // Custom color overrides — empty string = unset, fall back to theme default
    const root = document.documentElement.style;
    if (tweaks.accentColor)  { root.setProperty("--accent",     tweaks.accentColor);
                                root.setProperty("--accent-ink", tweaks.accentColor);
                                root.setProperty("--accent-soft", tweaks.accentColor + "22"); }
    else { root.removeProperty("--accent"); root.removeProperty("--accent-ink"); root.removeProperty("--accent-soft"); }
    if (tweaks.inkColor)     { root.setProperty("--ink", tweaks.inkColor); }
    else { root.removeProperty("--ink"); }
    if (tweaks.headingColor) { root.setProperty("--heading-color", tweaks.headingColor); }
    else { root.removeProperty("--heading-color"); }
  }, [tweaks]);

  // Cmd+K → palette
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(p => !p);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const runAction = useCallback((actionId, opts = {}) => {
    if (processing) return;
    const action = MAGIC_ACTIONS.find(a => a.id === actionId);
    if (!action) return;
    setProcessing({ actionId, progress: 0, stage: "preparing" });

    const stages = [
      { at: 12, name: "preparing"   },
      { at: 28, name: "scanning"    },
      { at: 52, name: "recognizing" },
      { at: 78, name: "structuring" },
      { at: 96, name: "finalizing"  },
    ];
    let pct = 0;
    const tick = () => {
      pct += Math.random() * 8 + 4;
      if (pct >= 100) {
        pct = 100;
        const stage = "finalizing";
        setProcessing({ actionId, progress: pct, stage });
        setTimeout(() => {
          setProcessing(null);
          showToast(`${action.label} complete · ${active.filename}`);
          // Bump the active session's date so it floats to the top
          setSessions(prev => prev.map(s => s.id === activeId ? { ...s, date: Date.now(), kind: action.id } : s));
        }, 350);
        return;
      }
      const stage = stages.find(s => pct < s.at)?.name ?? "finalizing";
      setProcessing({ actionId, progress: pct, stage });
      setTimeout(tick, 110 + Math.random() * 90);
    };
    setTimeout(tick, 200);
  }, [processing, active, activeId, showToast]);

  const onUpload = useCallback((filename) => {
    const id = "s-" + Math.random().toString(36).slice(2, 7);
    const fresh = {
      id,
      filename,
      kind: "text",
      confidence: 0,
      chars: 0,
      pages: 1,
      date: Date.now(),
      thumbHue: Math.floor(Math.random() * 360),
      text: "",
    };
    setSessions(prev => [fresh, ...prev]);
    setActiveId(id);
    showToast("Loaded " + filename);
  }, [showToast]);

  return (
    <div className="og-app" data-layout={tweaks.layout}>
      <TopBar tweaks={tweaks} />
      <main className="og-main">
        <LibraryRail
          sessions={sessions}
          activeId={activeId}
          setActiveId={setActiveId}
          onUpload={onUpload}
          collapsed={tweaks.layout === "two-pane"}
        />
        <SourceColumn
          session={active}
          processing={processing}
          onRun={runAction}
          actionStyle={tweaks.actionStyle}
          showTablets={tweaks.showTablets}
        />
        <OutputColumn
          session={active}
          processing={processing}
          prompt={prompt}
          setPrompt={setPrompt}
          onRunPrompt={() => { if (prompt.trim()) { runAction("text"); } }}
          onExport={(id) => showToast("Exported · " + id)}
        />
      </main>

      {paletteOpen && (
        <CommandPalette
          actions={MAGIC_ACTIONS}
          onPick={(id) => { setPaletteOpen(false); runAction(id); }}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      {toast && <div className="og-toast">{toast}</div>}

      <TweaksPanel title="Tweaks">
        <TweakSection title="Surface">
          <TweakRadio label="Theme" value={tweaks.theme}
            onChange={v => setTweak("theme", v)}
            options={[
              { value: "paper",  label: "Paper" },
              { value: "sepia",  label: "Sepia" },
              { value: "ink",    label: "Ink" },
            ]}
          />
          <TweakRadio label="Density" value={tweaks.density}
            onChange={v => setTweak("density", v)}
            options={[
              { value: "compact",     label: "Compact" },
              { value: "comfortable", label: "Comfortable" },
            ]}
          />
          <TweakSlider label="Body size" value={tweaks.fontSize} min={13} max={20} step={1}
            onChange={v => setTweak("fontSize", v)}
          />
        </TweakSection>

        <TweakSection title="Layout">
          <TweakRadio label="Panes" value={tweaks.layout}
            onChange={v => setTweak("layout", v)}
            options={[
              { value: "two-pane",   label: "Two" },
              { value: "three-pane", label: "Three" },
            ]}
          />
          <TweakRadio label="Magic actions" value={tweaks.actionStyle}
            onChange={v => setTweak("actionStyle", v)}
            options={[
              { value: "tiles",   label: "Tiles" },
              { value: "list",    label: "List" },
              { value: "palette", label: "Palette" },
            ]}
          />
        </TweakSection>

        <TweakSection title="Type">
          <TweakSelect label="Pairing" value={tweaks.fontPair}
            onChange={v => setTweak("fontPair", v)}
            options={[
              { value: "instrument-inter",   label: "Instrument Serif + Inter" },
              { value: "fraunces-jetbrains", label: "Fraunces + JetBrains Mono" },
              { value: "ibm-ibm",            label: "IBM Plex Serif + Sans" },
              { value: "geist-mono",         label: "Geist + Geist Mono" },
            ]}
          />
          <TweakToggle label="Show metadata tablets" value={tweaks.showTablets}
            onChange={v => setTweak("showTablets", v)}
          />
        </TweakSection>

        <TweakSection title="Colors">
          <TweakColor label="Accent" value={tweaks.accentColor || "#c2702e"}
            onChange={v => setTweak("accentColor", v)}
          />
          <TweakColor label="Body text" value={tweaks.inkColor || "#2b2620"}
            onChange={v => setTweak("inkColor", v)}
          />
          <TweakColor label="Headings" value={tweaks.headingColor || "#2b2620"}
            onChange={v => setTweak("headingColor", v)}
          />
          <TweakButton onClick={() => { setTweak({ accentColor: "", inkColor: "", headingColor: "" }); }}>
            Reset to theme
          </TweakButton>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

Object.assign(window, { App, MAGIC_ACTIONS, ACTION_GROUPS, EXPORT_GROUPS });
