# Handoff: ogOCR — "Optical Instrument" Redesign

## Overview

A high-fidelity redesign of the **ogOCR** application — an OCR/extraction tool that processes images and PDFs through a Gemini-powered backend and renders the results as editable markdown, LaTeX, Mermaid, or SVG. The redesign reorganizes the existing two-pane layout into a more confident, editorial **three-pane workspace** with stronger hierarchy, real progress feedback, grouped exports, and a hero prompt dock.

## About the Design Files

The files in this bundle are **design references created in HTML** — a working prototype demonstrating the intended look, layout, and interactions. They are **not production code to copy directly**.

The target codebase is a React + Vite app (see `src/` in the existing project). The task is to **rebuild the existing components against this new design**, keeping the existing application architecture, API endpoints, and state management — only the UI layer changes.

## Fidelity

**High-fidelity.** Final colors, typography, spacing, and interactions are all defined. Recreate pixel-perfectly using the existing React stack. Replace the inline-JSX prototype components with normal `.jsx` files in `src/components/` and the prototype's CSS with either `index.css` or CSS modules.

---

## Application Structure

The redesign keeps every feature from the existing app — nothing is removed. The arrangement changes:

| Region | Existing | Redesign |
|---|---|---|
| **Left rail** | Drop zone, magic buttons, sessions, prompt input, worksheet builder button | Library Rail: upload card + session list only |
| **Center** | (none — two-pane) | **NEW** Source Column: source preview + magic action surface |
| **Right** | Editor + export icon row + view toggle | Output Column: rendered/source/diff modes + grouped exports + hero prompt dock |
| **Top** | (none) | **NEW** Top bar: wordmark + session meta + ⌘K hint |

### Three-pane layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Top bar: ogOCR No.03  | session·model·region | ⌘K command         │
├──────────┬─────────────────────────┬────────────────────────────────┤
│ Library  │   Source                │   Output                       │
│  Rail    │   ─ source preview      │   ─ mode pills                 │
│          │   ─ magic actions       │   ─ rendered document          │
│          │                         │   ─ grouped exports            │
│          │                         │   ─ prompt dock                │
└──────────┴─────────────────────────┴────────────────────────────────┘
```

---

## Design Tokens

### Colors (Paper theme, default)

| Token | Value (oklch) | Approx hex | Usage |
|---|---|---|---|
| `--bg` | `oklch(0.985 0.005 80)` | `#FAFAF7` | App background |
| `--bg-deep` | `oklch(0.965 0.008 80)` | `#F4F3EE` | Rail / footer |
| `--bg-card` | `oklch(1.000 0 0)` | `#FFFFFF` | Cards, paper |
| `--ink` | `oklch(0.22 0.012 80)` | `#2B2620` | Body text |
| `--ink-soft` | `oklch(0.42 0.010 80)` | `#5C574F` | Secondary text |
| `--ink-faint` | `oklch(0.62 0.008 80)` | `#928D85` | Tertiary / labels |
| `--rule` | `oklch(0.90 0.008 80)` | `#E1DFDA` | Borders |
| `--rule-soft` | `oklch(0.94 0.006 80)` | `#EDEBE7` | Hairlines |
| `--accent` | `oklch(0.65 0.18 50)` | `#C2702E` | Signal orange |
| `--accent-soft` | `oklch(0.65 0.18 50 / 0.10)` | rgba | Highlights |
| `--accent-ink` | `oklch(0.42 0.18 50)` | `#7A4012` | Accent text |

### Theme variants
- **Sepia** — warm beige/brown
- **Ink** — dark mode, deep blue-black surfaces, lifted accent

(Full values in `design_source/style.css` under `[data-theme="sepia"]` and `[data-theme="ink"]`.)

### Typography

| Pair (default) | Family | Where |
|---|---|---|
| Serif | **Instrument Serif** | Wordmark, document headings (h1, h2), source/output filenames, large glyphs, prompt input |
| Sans | **Inter** | UI body, buttons, labels |
| Mono | **JetBrains Mono** | Metadata, session info, kbd, tablets, h3 (uppercase eyebrow), coordinates |

Alternative pairings (selectable via Tweaks): Fraunces + JetBrains Mono · IBM Plex Serif + Sans · Geist + Geist Mono.

### Type scale
- h1: 38px / 500 weight / -0.015em / line-height 1.05 (serif)
- h2: 24px / 500 / italic (serif)
- h3: 11px mono uppercase, letter-spacing 0.16em, **accent color** (this is unusual — h3 acts as an eyebrow label)
- Body: 15px (configurable 13–20 via `--user-font-size`) / line-height 1.65
- UI: 12–13px sans
- Mono labels: 10–11px, letter-spacing 0.10–0.16em

### Spacing
- `--pad: 24px` (comfortable) / `16px` (compact) — section padding
- `--row: 8px` (comfortable) / `6px` (compact) — list gaps

### Border radius
**2px throughout** — intentionally crisp / instrument-like. Avoid rounding above 4px.

### Shadows
- Doc preview: `0 1px 0 var(--rule), 0 12px 30px -12px oklch(0 0 0 / 0.18)`
- Palette modal: `0 24px 48px -12px oklch(0 0 0 / 0.4)`

---

## Components

### 1. Top Bar (`og-topbar`)
- Three-column grid: brand left, meta center, kbd right
- **Wordmark**: italic serif "og" + roman serif "OCR" + mono superscript "No.03" with accent-colored "03"
- **Meta**: SESSION / MODEL / REGION key-value pairs separated by tiny dot dividers (mono, 11px)
- **Right**: `⌘ K` kbd + "command" mono label

### 2. Library Rail (`og-rail`, 300px wide; 56px collapsed)
- **Section 01 — Source**: upload card (white, dashed border, decorative camera-bracket corners, 14 registration ticks at bottom; serif "+" glyph; italic title "Drop a document"; mono uppercase subtitle)
- **Section 02 — Library**: session list with thumb (44px tall, three horizontal lines drawn via gradient, kind glyph centered), filename, mono meta row "4m ago · 1,842 chars · 94%". Active row: white background, 2px accent bar on the left, accent dot marker.

### 3. Source Column (`og-source`)
3-row grid: head (auto) / stage (1fr) / action surface (auto, max 220px).
- **Head**: SRC.### accent-colored mono number + serif italic filename. Right side: 4 metadata "tablets" (DPI / W×H / CONF / LANG) divided by vertical rules.
- **Stage**: lined-paper background (repeating linear gradient at 20px), centers a faux-document preview with **camera-bracket corners** and **coordinate labels** (`x: 0`, `y: 0`, `x: 1240`, `y: 1754`) at corners. Inside paper: scan stamp + filename header, then 18 grey rule "lines". When processing, an accent-colored 1px scan line sweeps top-to-bottom with glow + meta tooltip showing percentage and stage name.
- **Action surface**: tile/list/palette variants (see below). Tiles default — 4 groups (Text / Structure / Symbol / Visual), 2-column grid per group, each tile has serif glyph + label + hint + mono shortcut.

### 4. Output Column (`og-output`)
- **Head**: OUT.### accent number + "Extracted Document" italic serif h1 + "/" + uppercase mono kind ("HANDWRITING", "TABULAR", etc). Right: pill group [Rendered | Source | Diff].
- **Processing strip** (when active): full-width accent-soft band, spinning serif glyph, action label + stage, 2px progress bar, percentage on right.
- **Canvas**: 680px max-width column, padded 32px / 56px. Renders markdown:
  - h1 serif 38px, h2 serif italic 24px, h3 accent mono uppercase 11px
  - Bullets use accent-colored em-dash markers (`::marker { content: "— " }`)
  - Blockquote: 2px accent left border, italic serif 18px
  - Tables: mono uppercase 10px headers, hairline rules, scrollable horizontally
  - Inline code: bg-deep background, accent-ink text
  - Document opens with mono "OG·OCR · EXTRACTED · N blocks" runner; closes with "— END OF DOCUMENT —" centered
- **Source mode**: line-numbered monospace block (3-digit zero-padded line numbers in faint ink)
- **Diff mode**: same as source but with periodic accent-soft highlighted lines tagged "?" + mono "conf 0.71"

### 5. Export Bar (`og-exports`)
Three groups separated by vertical rules:
- **Save**: Drive · Markdown · PDF
- **Share**: Email · Classroom · Link
- **Export**: Copy · PNG · JSON

Each group has a mono uppercase label + buttons (white, 1px rule, serif glyph + sans label). Hover: accent border + accent-ink text + accent glyph.

### 6. Prompt Dock (`og-prompt`)
- Grid: 36px rail / 1fr input / auto run button (rows: input on top, presets below)
- Left rail: large serif `⌁` glyph + mono "ASK" label
- **Textarea**: serif italic 14px (this is intentionally distinctive — the prompt feels like writing in a margin), 1px rule, accent border on focus
- **Presets** (mono 10px chips): "Translate to French" · "Summarize in 3 bullets" · "Convert to flashcards" · "Reformat as outline" — clicking one fills the input
- **Run button**: black background (`var(--ink)`), white text, mono `↵` kbd. Disabled when empty or processing. Hover: accent-ink background.

### 7. Command Palette (⌘K)
- Modal overlay, dark blurred shroud
- 640px wide, white card, 1px rule
- Input row: large accent serif `⌘` prefix + serif italic placeholder + `esc` kbd
- Results list: glyph · label · group · hint · shortcut
- Arrow keys navigate; Enter runs; Esc closes
- Footer: ↑↓ navigate · ↵ run · esc dismiss

### 8. Tweaks Panel (existing skill — already lives in `tweaks-panel.jsx`)
**This is a design-time control, not a production feature.** When implementing in the real app, expose only what the team agreed to ship. The prototype's tweaks were exploratory.

Sections:
- Surface: Theme (paper/sepia/ink), Density (compact/comfortable), Body size slider
- Layout: Panes (two/three), Magic actions (tiles/list/palette)
- Type: Pairing select, Show metadata tablets toggle
- Colors: Accent, Body text, Heading color pickers + reset

---

## Interactions & Behavior

### File upload
- Click upload card or drag-drop → file appears at top of session list, becomes active
- File metadata populated lazily after first action

### Magic action run
1. User clicks tile → `processing = { actionId, progress: 0, stage: "preparing" }`
2. Tile gets `is-running` class (accent border, accent-soft background)
3. Processing strip mounts in output column (accent band, spinner, progress bar)
4. Scan line in source preview animates top-to-bottom with `top: ${pct}%`
5. Stage progresses: preparing → scanning → recognizing → structuring → finalizing
6. On complete (~3 s in prototype, real backend in production): toast bottom-center, session date bumped, kind updated
7. **All real network calls hit the existing endpoints** — `/api/extract`, `/api/extract-images`, `/api/sketch-to-svg`. No backend changes needed.

### Keyboard
- `⌘K` / `Ctrl+K` — toggle command palette
- `Esc` — dismiss palette
- `↑↓` in palette — navigate
- `↵` in palette — run highlighted action
- `↵` in prompt — submit (Shift+↵ for newline)

### Mode toggle
- Rendered: parsed markdown
- Source: monospace line-numbered text
- Diff: source + low-confidence highlights (in production: drive from real per-token confidence scores)

### Responsive breakpoints
- `<= 1280px`: tighter padding, smaller h1
- `<= 1080px`: rail collapses to 56px (icon-only thumbs), tablets hidden, action tiles single-column
- `<= 880px`: source column hides; output gets full width

---

## State Management

Reuse the existing `App.jsx` state shape. Add:

```js
const [processing, setProcessing] = useState(null);
// shape: { actionId: 'text', progress: 0–100, stage: 'preparing'|'scanning'|... }

const [paletteOpen, setPaletteOpen] = useState(false);
const [viewMode, setViewMode] = useState('rendered'); // 'rendered'|'source'|'diff'
const [toast, setToast] = useState(null);
```

The `processing.progress` should be driven by **real backend progress events** if available (SSE / streaming), or fall back to a smooth simulated bar that completes when the response arrives.

The `confidence`, `chars`, `pages`, `kind` per session should come from real OCR response metadata. If the backend does not return them yet, add them — the design depends on this density of metadata being visible.

---

## Assets

- **No image assets required.** All icons in the redesign are typographic (serif glyphs: T, H, ▦, ✓, ∑, ◇, ✎, ▣, ⌁, ⌘) or SVG path corners.
- Existing `src/assets/hero.png`, `react.svg`, `vite.svg` are not used by the redesign.
- Camera-bracket corners drawn as inline 18×18 SVG: `<path d="M1 6 V1 H6" stroke="currentColor" strokeWidth="1.2" fill="none" />` rotated/flipped for each corner.

---

## Files in This Handoff

- `ogOCR.html` — the working prototype. Open it in a browser to interact with the design (⌘K, theme switch, run any action).
- `design_source/app.jsx` — top-level App component (state + Tweaks panel)
- `design_source/components.jsx` — TopBar, LibraryRail, SourceColumn, action surfaces, command palette
- `design_source/output.jsx` — OutputColumn, markdown renderer, export bar, prompt dock
- `design_source/style.css` — all CSS, including theme variants and responsive breakpoints
- `design_source/tweaks-panel.jsx` — design-time tweaks helper (do not ship as-is)

## Files to Modify in `src/`

| Existing file | Action |
|---|---|
| `src/App.jsx` | Restructure into 3-pane layout; lift processing state |
| `src/index.css` | Replace with design tokens + component styles from `design_source/style.css` |
| `src/components/DropZone.jsx` | Move into LibraryRail; restyle as upload-card |
| `src/components/MagicButtons.jsx` | Restyle as grouped tile surface; add list/palette variants |
| `src/components/SessionList.jsx` | Move into LibraryRail; redesign rows with thumb + metadata |
| `src/components/EditorPanel.jsx` | Split into OutputColumn + ExportBar + PromptDock; add view-mode pills |
| `src/components/WorksheetBuilder.jsx` | Keep as-is for now; integrate into output as a "Compile" mode in a follow-up |
| **NEW** `src/components/TopBar.jsx` | Create |
| **NEW** `src/components/SourceColumn.jsx` | Create |
| **NEW** `src/components/CommandPalette.jsx` | Create |
| **NEW** `src/components/ProcessingStrip.jsx` | Create |

Use whatever the team's preferred approach is (CSS modules, Tailwind, styled-components). The prototype uses plain CSS with custom-property theming — this maps cleanly to any system.

---

## Notes for the Implementer

1. **The prototype's markdown parser is intentionally minimal.** Keep using `react-markdown + remark-gfm + remark-math + rehype-katex` as the existing app does — just style its output to match `.og-h1`, `.og-h2`, etc.
2. **The "tablets", "coordinates", "scan stamp" copy** (DPI 300, W×H 1240×1754, CONF 99.0%, scan timestamps) should reflect **real values** from the OCR response. If the backend doesn't return them, either add them or omit those tablets — never hard-code.
3. **Speech-style stage names** ("preparing", "scanning", "recognizing", "structuring", "finalizing") work even without real backend progress because they happen fast — but if real progress events are available, use those names.
4. **Cmd+K is sacred** — the command palette must work everywhere in the app, not just the home screen.
5. **Print styles already exist** for the worksheet builder; preserve them when restyling.
