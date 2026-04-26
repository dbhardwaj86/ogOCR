# Handoff: ogOCR — Variant B "Refined" (Desktop + Mobile)

## Overview

ogOCR is a document-OCR + LLM workspace. The user uploads images / PDFs / screenshots, runs an "action" against them (extract text, format as a table, math → LaTeX, diagram → Mermaid, etc.), reviews the result in three view modes (rendered / source / diff), exports to nine destinations, and can refine the result by chatting with Gemini in a prompt dock.

**Variant B — "Refined"** preserves the *entire* feature surface and information architecture of the original ogOCR design. **Only the visual look-and-feel changes.** It is the safe, low-risk redesign — every action, panel, mode, export, and shortcut is in the same conceptual place.

This handoff covers two surfaces:

- **Desktop** — full 3-pane workspace (Library Rail · Source · Output) + a hero prompt dock and `⌘K` command palette.
- **Mobile** — same regions reflowed for small screens. Portrait uses a 3-tab bottom nav (Source · Output · Ask). Landscape collapses to a desktop-like 2-column workspace with a collapsible library drawer.

## About the Design Files

The files in this bundle are **design references created in HTML + React + plain CSS** — interactive prototypes showing intended look and behavior. **They are not production code to copy directly.**

The task is to **recreate these designs in your target codebase**, using its established patterns and libraries (component framework, state management, styling system, design-token pipeline, icon set, etc.). If no codebase exists yet, choose the most appropriate framework for the project and implement there.

The mocks are deliberately self-contained: a tiny inline Markdown parser, demo data, no real upload / OCR backend. Replace those seams with real service calls in production.

## Fidelity

**High-fidelity (hifi).** Final colors, typography, spacing, motion, copy, hover states. Recreate pixel-perfectly using the codebase's existing libraries and patterns. Every value documented below is what the live design uses — sourced from `desktop/variant-b-refined.css` and `mobile/mobile-variants.css`.

---

## Design tokens

All values are in the source CSS as variables — copy them or map them onto your design-token system.

### Color (OKLCH — desktop)

```
--bg:          oklch(0.985 0.003 250)   /* page background — cool near-white */
--bg-deep:     oklch(0.965 0.005 250)   /* rail + stage well */
--bg-card:     #ffffff                  /* cards, paper */
--bg-tint:     oklch(0.98 0.008 250)    /* subtle hover / icon bg */
--ink:         oklch(0.20 0.015 250)    /* primary text */
--ink-soft:    oklch(0.44 0.012 250)    /* secondary text */
--ink-faint:   oklch(0.64 0.010 250)    /* tertiary text, monospace labels */
--rule:        oklch(0.92 0.006 250)    /* hairline borders */
--rule-soft:   oklch(0.95 0.005 250)    /* softer borders */
--accent:      oklch(0.55 0.16 245)     /* primary accent — cool indigo/blue */
--accent-soft: oklch(0.55 0.16 245 / 0.10)
--accent-ink:  oklch(0.40 0.18 245)     /* darker accent for hover */
--warm:        oklch(0.70 0.14 70)      /* warning / warm accent */
```

### Color (mobile, slate-leaning, sRGB equivalents)

The mobile CSS uses sRGB hex for portability. Effectively the same family:

```
Page bg:        #f4f6f9
Card bg:        #ffffff
Ink:            #0f172a
Ink soft:       #1e293b
Ink muted:      #475569
Ink faint:      #64748b
Ink tertiary:   #94a3b8
Rule:           rgba(15,23,42,0.06–0.10)
Tint:           #f1f5f9 / #e2e8f0
Accent:         #4f46e5  (used at #6366f1 for highlights)
Accent surface: #eef2ff
Scan glow:      rgba(99,102,241,0.5)
Active label:   #4f46e5
```

If you keep one source of truth, map all of these to your token system; the OKLCH values are authoritative — sRGB above is a fallback.

### Typography

```
--serif: 'Fraunces', Georgia, serif      /* display + section heads */
--sans:  'Inter Tight', system-ui, sans  /* body, buttons, UI */
--mono:  'IBM Plex Mono', ui-monospace   /* meta, labels, kbd, eyebrows */
```

Load weights: Fraunces 400 / 500 / 600 (variable-axis, opsz 9..144), Inter Tight 400 / 500 / 600, IBM Plex Mono 400 / 500.

Type scale (desktop):

| Use | Family | Size | Weight | Letter-spacing |
|---|---|---|---|---|
| Brand wordmark "og / OCR" | Fraunces | 20 / 20 | italic 400 / 500 | -0.01em on second half |
| Brand tag "studio" | IBM Plex Mono | 10 | 400 | 0.12em uppercase |
| Source filename heading | Fraunces | 18 | 400 | normal |
| Output H2 heading | Fraunces | 22 | 500 | -0.01em |
| Section eyebrow ("Library", "Actions") | IBM Plex Mono | 10 | 400 | 0.14em uppercase |
| Stat key | IBM Plex Mono | 9 | 400 | 0.10em uppercase |
| Stat value | IBM Plex Mono | 11 | 500 | normal |
| Body | Inter Tight | 14 | 400 | normal |
| Buttons | Inter Tight | 13 | 500 | normal |
| Doc H1 (rendered output) | Fraunces | 26 | 500 | -0.015em |
| Doc H2 | Fraunces | 18 | 500 | normal |
| Doc body paragraph | Inter Tight | 15 | 400 | line-height 1.6 |
| `<kbd>` chips | IBM Plex Mono | 10 | 400 | normal |

Mobile sizes scale down ~15–25% (see `mobile-variants.css` for exact values per component).

### Spacing & geometry

- Base unit: **4px**. Common rhythm: 4 / 6 / 8 / 10 / 12 / 14 / 18 / 22 / 28.
- **Border radius:** 4 (chips, kbd), 6 (small thumbs), 8 (buttons, cards, tiles), 10 (cards/inputs), 12 (intent rows), 14 (file pills, sheet rows), 16–22 (drop targets, modals, sheets).
- **Hairline borders:** 1px solid `var(--rule)`. Dashed for upload targets (1.5px).
- **Shadows** are deliberately understated:
  - Cards: `0 1px 3px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.04)`
  - Hover lift: `transform: translateY(-1px)` + `0 4px 12px -8px oklch(0 0 0 / 0.2)`
  - Toast / floating dock: `0 6px 20px rgba(26,24,21,0.06)`
- **Stage gradient** (source preview well): `radial-gradient(circle at 30% 20%, oklch(0.97 0.01 245) 0%, transparent 60%)` over `--bg-deep`.

### Motion

- All hover transitions: **140ms** linear-ish (`transition: 0.14s`).
- Action processing fake-progress: 6–14% per ~110–190ms tick, then a 350ms "finalizing" hold.
- "Pulse" status dot: 2.2s ease-in-out infinite (opacity 1 → 0.4 → 1).
- Scan line during processing: tracks `progress%` from 0 → 100 of the paper element's height. Glow `0 0 12px rgba(99,102,241,0.5)`.

---

## Desktop screens

### Layout — top level

Single fixed-height app shell. Two rows:

1. **Top bar** (52px) — `auto 1fr auto` grid: brand · meta strip · `⌘K` button.
2. **Main grid** (`1fr` row) — three columns: `280px minmax(0,1fr) minmax(0,1.1fr)` (Rail · Source · Output).

No page scroll on the shell itself; each pane scrolls independently.

### 1. Top bar

- **Brand block (left):** 32×32 white rounded-square glyph with a target-reticle SVG (concentric circle + crosshair) in `--accent`. Beside it the wordmark "**og**" in Fraunces italic + "**OCR**" in Fraunces 500 + a "studio" tag in IBM Plex Mono 10/uppercase/0.12em.
- **Meta strip (center):** monospace key/value pairs with 3px dot separators — "Model · Gemini 1.5 Pro" · "Region · us-east-1" · live "ready" status with green pulse dot.
- **`⌘K` chip (right):** white rounded-rect button, "Search & commands" placeholder text + a `<kbd>⌘K</kbd>` chip.

### 2. Library Rail (280px)

- **New-document upload card** — dashed-border 10px-radius white card with 36×36 tinted icon square + "New document" / "image · pdf · screenshot" mono caption. Hover: solid border, 1px lift, soft drop shadow. Triggers a hidden `<input type="file">`.
- **Section eyebrow** — "Library" + count chip (rounded pill, 9px mono).
- **Session rows** — 32×38 paper-thumbnail (Fraunces glyph indicating kind) · filename · "{relative time} · {N} ch · {confidence%}" mono caption. Active row: white bg, 2px accent rule on the left edge, faint card shadow.

### 3. Source pane

- **Source head** — filename (Fraunces 18) · "{kind tag}" mono uppercase · stats group (key/value mono pairs separated by 1px vertical rules: dimensions, characters, confidence).
- **Stage** — gradient-tinted well, centers a "**paper**" element (1240/1754 aspect ratio, max 540px tall). Four 14×14 accent corner brackets at the paper's corners. Inside: scanned-document placeholder (header line, then 18 horizontal "text-line" rules with varied widths and indents derived from a hash of the doc id — looks like a real but unreadable scan).
- **During processing** — a horizontal 2px accent scan-line tracks down the paper as a function of progress; subtle glow.
- **Action surface (bottom)** — **8 magic actions in a 4-column grid**, grouped visually by header: Text (Extract Text, Clean Handwriting), Structure (Format as Table, Extract Actions), Symbol (Math→LaTeX, Diagram→Mermaid), Visual (Sketch→SVG, Extract Images). Each tile = a 32×32 rounded-square with a glyph (`Aa`, `H`, `⊞`, `✓`, `∑`, `◇`, `✎`, `▣`) + label + hint sub-line. Hover: border darkens to `--ink-faint`. Disabled while processing.

### 4. Output pane (slightly wider — `1.1fr`)

- **Output head** — H2 "Extracted" (Fraunces 22) · view-mode segmented control (`rendered` / `source` / `diff`) styled as 3 mono-label chips inside a tinted track.
- **Canvas** — renders the parsed Markdown with the type scale above. `<blockquote>` uses a 3px accent left border. Tables get mono uppercase headers with 1px row dividers. `<code>` uses mono with light tint background.
- **Foot dock** — two stacked elements:
  1. **Prompt dock** — pill input "Ask Gemini anything about this document…" with a ⌘+↵ kbd hint inside, two preset chips below ("Translate to French", "Summarize in 3 bullets", "Convert to flashcards", "Reformat as outline").
  2. **Export bar** — three labeled groups (Save · Share · Export) of three icon buttons each, total 9: Drive, Markdown, PDF · Email, Classroom, Link · Copy, PNG, JSON. Each export triggers a 2200ms toast.

### 5. ⌘K Command palette

- Modal centered over the page, invoked by `⌘K` / `Ctrl+K` / the top-bar button. `Esc` closes.
- Search input at the top, ungrouped list of all 8 actions below with their glyph + label + hint + the per-action shortcut letter (T / H / B / A / M / D / S / I) on the right.
- Picking an action runs it on the active document (same as clicking the action tile).

### 6. Toast

- Bottom-center pill, 2200ms auto-dismiss. Used for upload confirmation, action complete, and export confirmations.

---

## Mobile screens

Designed at iPhone-15 dimensions: **390 × 844 portrait** and **844 × 390 landscape**.

### Portrait

Bottom-tab nav with three tabs that map 1:1 to the three desktop regions:

- **Tab 1 — Source.** Top-of-page meta (filename + dimensions + confidence). Paper preview card (white, 8px radius, slight shadow, aspect-ratio 0.92). Below it the same 8 magic actions in a 2-column grid. Action tile: 28×28 glyph square + 12px label, `border-color:#4f46e5; background:#eef2ff` when active.
- **Tab 2 — Output.** "Extracted" H2 + the same 3-mode segmented control. The rendered Markdown follows. Below: a 3×2 grid of export buttons (Copy · Markdown · PDF · Drive · Email · Link).
- **Tab 3 — Ask.** Big "Ask anything" Fraunces title + caption. 110-px-min textarea with focus ring `0 0 0 3px rgba(99,102,241,0.12)`. Four full-width preset buttons. Big "Run ↵" CTA button at the bottom.

A burger-icon button in the top bar opens a **bottom sheet** for the library (rounded 22px top corners, drag handle, list of session rows). Selecting a session sets active and switches back to the Source tab.

While processing, an indigo strip appears under the top bar showing "{Action} — {stage}" + a 2px progress bar.

### Landscape (844 × 390)

Three regions side-by-side, with the library drawer collapsible:

- **Top bar (compact)** — burger · brand · centered meta · `⌘K` chip.
- **Drawer (200px, optional)** — same library content as the desktop rail.
- **Source column (38% of body)** — paper preview + 6 of the 8 actions in a 3-column compact grid.
- **Output column (rest)** — H2 + view-mode pills · doc canvas · footer row of small export buttons + a slim prompt input.

Frame chrome (status bar, dynamic island, home indicator) is provided by the iOS frame component used to present the design — your real implementation should respect device safe-area insets, not draw the bezel.

---

## Components inventory

A flat list of every component the implementation needs:

**Shared / chrome**
- `BrandMark` (target-reticle glyph + wordmark + optional tag)
- `MetaStrip` (mono key/value pairs with dot separators)
- `StatusPulse` (live dot + label)
- `KbdChip` (`<kbd>` styled chip)
- `Toast` (auto-dismiss bottom-center)

**Library**
- `UploadCard` (dashed card, opens file picker)
- `LibraryEyebrow` (label + count pill)
- `SessionRow` (thumb + filename + meta line, active/hover states)

**Source**
- `SourceHead` (filename + tag + StatGroup)
- `Stat` (mono k/v pair, vertical-rule separator)
- `PaperPreview` (aspect-locked card, corner brackets, lined-text placeholder, scan line)
- `ActionTile` (glyph square + label + hint, group header on the row above)
- `ProcessingStrip` (mobile only — top progress strip)

**Output**
- `OutputHead` (H2 + view-mode segmented control)
- `MarkdownDoc` (renders parsed blocks: h1/h2/h3, p, ul/ol, blockquote, table, code)
- `PromptDock` (pill input + ⌘↵ chip + preset buttons)
- `ExportBar` (3 labeled groups × 3 icon buttons)

**Overlays**
- `CommandPalette` (modal, 8 actions list, keyboard-driven)
- `LibrarySheet` (mobile bottom sheet, drag handle)
- `LibraryDrawer` (landscape collapsible drawer)

---

## Interactions & behavior

### Upload

`UploadCard` triggers a hidden `<input type="file" accept="image/*,application/pdf">`. On change, prepend a new session, set it active, toast "Loaded {filename}". In the prototype the file is mocked — real implementation hits your upload endpoint.

### Run an action

Clicking an `ActionTile` (or picking it in the palette) starts a fake progress simulation. Real implementation: stream progress from your OCR/LLM backend. Stages used by the prototype, in order: `preparing → reading → recognizing → structuring → finalizing`. While `processing != null`, all action tiles are disabled and the scan line animates over the paper.

### Switch view mode

Segmented control toggles between three modes for the same document — `rendered` (parsed Markdown), `source` (raw markdown text), `diff` (placeholder side-by-side). Preserve the current scroll position when switching.

### Ask a follow-up

Prompt dock submits on `⌘↵` / `Ctrl+↵`. Presets fill the input but don't auto-submit. After submit, in production this should append a turn to a chat history and update the document; the prototype just toasts.

### Export

Each export button fires a "Exported · {id}" toast and (in prod) initiates the relevant action (download, share-sheet, copy to clipboard, etc.). Maintain the 9 destinations exactly: Drive · Markdown · PDF · Email · Classroom · Link · Copy · PNG · JSON.

### Command palette

- Open: `⌘K`, `Ctrl+K`, or click the chip.
- Close: `Esc`, click backdrop, or pick an item.
- Picking an action runs it (same as clicking its tile).
- The 8 single-letter shortcuts (T H B A M D S I) should also dispatch directly when the palette is open, without needing to hit Enter.

### Keyboard

- `⌘K` / `Ctrl+K` — open palette.
- `Esc` — close palette.
- `T H B A M D S I` (in palette) — run that action.

### Hover / focus

- All buttons: 140ms transition. Hover on cards: 1px lift + soft shadow.
- Focused inputs (textarea / prompt): accent border + `0 0 0 3px rgba(99,102,241,0.12)` ring.
- Active session row, active tab, active action tile: accent left-rule (rail) / accent border + tinted bg (tile) / accent text + glyph (tabs).

### Mobile gestures

- Tap a tab to switch panes. Long-swipe between tabs is a nice-to-have.
- Sheet drag handle indicates dismissibility — tapping the backdrop dismisses.
- Drawer toggles via burger button.

---

## State management

State the implementation must own (names and shapes match the prototype, but adapt to your system):

- `sessions: Session[]` — every uploaded doc.
- `activeId: string` — currently selected session.
- `processing: { actionId, progress: 0..100, stage } | null`
- `paletteOpen: boolean`
- `mode: "rendered" | "source" | "diff"`
- `prompt: string`
- `toast: string | null`
- (mobile portrait) `tab: "source" | "output" | "ask"`, `libOpen: boolean`
- (mobile landscape) `drawerOpen: boolean`

`Session` shape:
```
{ id, filename, kind: "text"|"handwriting"|"table"|"actions"|"math"|"mermaid"|"sketch"|"images"|"diagram",
  confidence: 0..1, chars: number, pages: number, date: epoch_ms, text: markdown_string }
```

---

## Copy reference (verbatim — match exactly)

- Brand: **og** / **OCR** / studio
- Top meta keys: "Model", "Region"
- Top meta values: "Gemini 1.5 Pro", "us-east-1", "ready"
- ⌘K chip: "Search & commands"
- Upload card: "New document" / "image · pdf · screenshot"
- Library section: "Library"
- Output H2: "Extracted"
- View modes: "rendered" / "source" / "diff"
- Action labels (× hints):
  - Extract Text — "Plain prose, paragraphs preserved"
  - Clean Handwriting — "Transcribe + fix obvious errors"
  - Format as Table — "Tabular data → markdown table"
  - Extract Actions — "Pull tasks into a checklist"
  - Math to LaTeX — "Equations → compile-ready LaTeX"
  - Diagram → Mermaid — "Flowchart → Mermaid.js code"
  - Sketch → SVG — "Hand drawing → editable SVG"
  - Extract Images — "Pull all figures with descriptions"
- Action group names: Text · Structure · Symbol · Visual
- Export groups: Save · Share · Export
- Export labels: Drive · Markdown · PDF · Email · Classroom · Link · Copy · PNG · JSON
- Mobile Ask presets: "Translate to French" · "Summarize in 3 bullets" · "Convert to flashcards" · "Reformat as outline"

---

## Assets

The design ships **with no raster assets**. Everything is type, CSS, and inline SVG. Specifically:

- **Brand glyph** — inline SVG: a circle r=6 stroked, a filled inner dot r=2, four 3px reticle ticks at N/S/E/W. 22×22 viewBox.
- **Action tile glyphs** — single text glyph each (`Aa`, `H`, `⊞`, `✓`, `∑`, `◇`, `✎`, `▣`).
- **Export glyphs** — single text glyph each (`△`, `▤`, `▢`, `✉`, `◯`, `∞`, `❐`, `▦`, `{}`).
- **Upload icon** — inline SVG, up-arrow over a horizontal rule.
- **Tab icons (mobile)** — three inline SVGs: doc with lines (Source), three lines (Output), speech-bubble (Ask).

When porting, keep these glyphs or replace them with the equivalent symbols from the codebase's icon set (Lucide, Phosphor, etc.). The point is the **glyph-as-tile** pattern, not the specific Unicode codepoint.

---

## Files in this bundle

- `desktop/variant-b-refined.jsx` — desktop React component tree (`RefinedApp`, `RBRail`, `RBSource`, `RBOutput`, `RBPalette`, `RBPaper`, parsing helpers).
- `desktop/variant-b-refined.css` — all desktop styles, scoped under `.rb-app`.
- `mobile/mobile-variants.jsx` — mobile components (`RefinedMobilePortrait`, `RefinedMobileLandscape` are the relevant ones; `CalmMobile*` are Variant A and can be ignored for this handoff).
- `mobile/mobile-variants.css` — mobile styles, scoped per variant: `.rmp` (refined portrait), `.rml` (refined landscape).
- `_preview/ogOCR Variants.html` — runnable desktop prototype (open in a browser to see Variant B in action — Variant A is also shown side-by-side on the canvas; you can ignore A).
- `_preview/ogOCR Mobile Variants.html` — runnable mobile prototype with both portrait + landscape iOS frames on the canvas.
- `_preview/{design-canvas,ios-frame,variant-a-calm}.{jsx,css}` — supporting files needed only to *run the previews*. Not part of the production UI.

To run the previews locally: serve the bundle root with any static HTTP server (`python -m http.server`, `npx serve`, etc.) and open the two HTML files. They use CDN-hosted React + Babel and Google-Fonts-hosted Fraunces / Inter Tight / IBM Plex Mono.

---

## Recommended implementation order

1. Stand up tokens (colors, type, spacing, radius, shadow) in your design-token system.
2. Build the chrome: top bar, brand mark, ⌘K chip, toast.
3. Build the rail (upload card + session row + active state).
4. Build the source pane (head + paper preview + action tiles + scan-line animation).
5. Build the output pane (head + Markdown renderer + view modes + prompt dock + export bar).
6. Wire the command palette + keyboard shortcuts.
7. Mobile portrait: tabs + reflowed regions + bottom sheet for library.
8. Mobile landscape: drawer + 2-column workspace.
9. Replace mocked `runAction` / `onUpload` with real backend calls.
