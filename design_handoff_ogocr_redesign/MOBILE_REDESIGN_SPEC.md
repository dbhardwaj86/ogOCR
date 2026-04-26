# ogOCR — mobile redesign spec (handoff)

> Companion to `README.md` in this folder. The README documents the original
> three-pane redesign; this file documents the **mobile-portrait OUTPUT tab + upload
> flows** that landed on top of it.
>
> Files in the bundle that go with this spec:
> - `mobile-output-v2.html` — interactive mockup of the new mobile output tab
> - `mobile-upload-flows.html` — three-state mockup of upload + camera + preview-confirm
> - `mobile-output-tokens.css` — every layout knob as a CSS custom property
> - `mobile-output-wireframe.svg` — labelled SVG for design-tool import
> - This document

---

## 1. Intent

The phone-portrait OUTPUT tab has to dedicate the screen to the **rendered document**
(Markdown, LaTeX, SVG) and treat the controls as a secondary, scrollable strip. The
prior layout stacked nine export buttons vertically and let the prompt dock take a full
two-row block — that left only ~41–47 % of the viewport for the canvas. The new layout
pins the canvas at **~70 %** and gives the controls their own internal scroll axes.

**Why 70 %.** A reader on a phone judges the OCR output by *how much text they can see
at once*. Below 50 %, it feels like the controls are the app and the document is an
inset. Above 80 %, the prompt dock starts to feel cramped and easy to mis-tap. ~70 %
is the centre of that band — confirmed by eye against the 390×844 reference frame.

---

## 2. Region budget (390 × 844, `100dvh`)

| # | Region | Height | % |
|---|---|---|---|
| 1 | TopBar (mobile collapsed) | ~44 px | 5 % |
| 2 | MobileTabs (01 / 02 / 03) | 44 px | 5 % |
| 3 | Output head (single line) | ~36 px | 4 % |
| 4 | **Canvas** (rendered document) | **~590 px** | **~70 %** |
| 5a | ExportBar chip strip (h-scroll) | ~56 px | 7 % |
| 5b | PromptDock (single row) | ~50 px | 6 % |
| — | safe-area-inset-bottom | env() | varies |
| — | **Total** | 844 px | 100 % |

The foot region (5a + 5b) is bounded by `clamp(120px, 30dvh, 220px)` so it can never
push the canvas below ~70 % even on tiny phones (e.g. iPhone SE, 568 dvh). On
landscape and on phones taller than 844 dvh, the canvas absorbs the surplus.

---

## 3. Scroll boundaries

Three independent scroll regions, each with `overscroll-behavior: contain` so a swipe
in one region doesn't chain into the next (or trigger Safari's pull-to-refresh /
address-bar collapse).

| Element | Axis | Behaviour |
|---|---|---|
| `.og-output-canvas` | y | `overflow-y: auto` + contained overscroll |
| `.og-output-foot` | y | `overflow-y: auto` + contained overscroll · capped by `clamp()` |
| `.og-exports` | x | `overflow-x: auto` + contained overscroll · `scroll-snap-type: x proximity` |

The foot region is **not** sticky in the CSS sense — it's the last track of the
output column's grid, so it sits flush at the bottom of the pane. When the canvas
scrolls, the foot stays put because it's a peer track, not a child of the canvas.

iOS-specific: `100dvh` (already in `src/index.css`) handles address-bar collapse
correctly. `env(safe-area-inset-bottom)` is applied to the foot's `padding-bottom`
and to the modal's actions row so the home indicator on notched iPhones never
overlaps tap targets.

---

## 4. ExportBar — chip strip

The original mobile rule stacked all nine buttons vertically. The new rule lays them
out as a single horizontal row with three group dividers and `scroll-snap-type: x
proximity` so a flick stops cleanly on a chip rather than mid-button.

- Chip min-height: **36 px** (down from 44 — full row is bigger, individual chips
  smaller, total height drops).
- Group labels (`.og-export-label`) are hidden in chip mode. The dividers do the
  grouping work visually.
- A right-edge fade on the chip strip hints at horizontal overflow when the strip is
  scrolled left of its end.

Trade-off: chip min-height of 36 px is below Apple's HIG recommendation of 44 px.
The compromise is acceptable because the row is 56 px tall (chip + padding) so the
*total* tap target is still 44 px+, and the chips are wide rather than tall (so a
finger landing anywhere in the row hits the right chip).

---

## 5. PromptDock — single row

The Ask glyph rail is hidden on mobile (already true before — kept). The new mobile
rule puts the input and Run button side-by-side on one row with `grid-template-columns:
minmax(0, 1fr) auto`. Input min-height: 40 px; Run button min-height: 40 px;
combined row: ~50 px.

The `<textarea>` is still there (not a `<input>`), so when the user types a long
prompt it expands vertically. That expansion is bounded by the foot's `clamp()` cap
— if the user types enough lines to push the foot past 30 dvh, the foot scrolls
internally rather than eating canvas height.

---

## 6. Camera flow

**Problem.** `<input type="file" accept="image/*">` on many devices opens a chooser
where "Take Photo" routes through the OS Camera app, which requires the user to
*save* the photo to the gallery before the chooser can read it back. Two-step
detour, breaks the "scan and go" UX.

**Fix.** A second hidden input with `capture="environment"` opens the camera
directly and hands the captured frame back as a temporary file — no save step. A
visible "Take photo" button on the upload card (mobile only) triggers it.

The original chooser is preserved on the main upload-card click — users who want
to pick from gallery / files can still tap the card.

```html
<!-- existing: gallery/files via OS chooser -->
<input type="file" hidden accept="image/*,application/pdf" />

<!-- new: direct camera -->
<input type="file" hidden accept="image/*" capture="environment" />
```

Visual: the camera button sits below the upload card, full-width, accent-bordered,
mono uppercase label. Hidden on desktop via `@media (min-width: 881px)`.

---

## 7. Long-press → preview-confirm flow

**Goal.** Short tap = fast import (existing behaviour). Long press = "I want to
look before I import."

```
short tap (≤ 500 ms)         long press (≥ 500 ms)
├─ pointerdown               ├─ pointerdown
├─ pointerup                 ├─ timer fires at 500 ms
├─ click                     │   └─ card glows accent
│   └─ inputRef.click()      ├─ pointerup (any time after)
│       └─ OS picker         ├─ click
│           └─ pick          │   └─ pickMode = 'preview'
│               └─ onUpload  │   └─ inputRef.click()
                             │       └─ OS picker
                             │           └─ pick
                             │               └─ onRequestPreview
                             │                   └─ <UploadConfirmModal>
                             │                       ├─ Cancel → discard
                             │                       └─ Import → onUpload
```

**Detection.** A 500 ms `setTimeout` started on `pointerdown`, cancelled on
`pointerup` or on `pointermove` if the pointer travels > 12 px (so a finger that's
mid-scroll doesn't accidentally trigger). When the timer fires, an `is-long-pressing`
class is added for visual feedback (accent border + glow). The `click` event then
reads a ref flag to decide which mode to use.

**iOS gotcha.** Long-pressing a `<button>` on iOS would normally trigger the OS
callout / preview menu. We suppress this with `-webkit-touch-callout: none` and
`user-select: none` on `.og-upload-card`. `onContextMenu={e => e.preventDefault()}`
is also wired as a belt-and-braces measure.

---

## 8. UploadConfirmModal — contract

**Props.** `file`, `onConfirm(file)`, `onCancel()`.

**Layout.**

```
┌──────────────────────────────────┐
│                                  │
│         IMAGE PREVIEW            │  minmax(0, 1fr)
│         (or PDF placeholder)     │  overflow: auto
│                                  │
├──────────────────────────────────┤
│  filename · 1.42 MB · image/jpeg │  10px 14px metadata
├──────────────────────────────────┤
│            [ Cancel ] [ Import ] │  12px 14px actions
└──────────────────────────────────┘
```

**Image.** `URL.createObjectURL(file)` → `<img>`, with `URL.revokeObjectURL` in the
`useEffect` cleanup to avoid leaking the blob URL.

**PDF.** No first-page rasterisation today (tracked outstanding issue in
`CLAUDE.md`). Placeholder card shows the serif `▤` glyph + filename + a
`PDF preview · rasterisation pending` note. Import still works — the modal is just
informational for PDFs at this stage.

**Dismissal.** ESC, click on the shroud, Cancel button. All three call `onCancel`.
Enter triggers `onConfirm` for keyboard-first users.

---

## 9. Tokens — what's tunable

See `mobile-output-tokens.css` for the full list. Eight knobs that designers
typically want to iterate on:

| Token | Default | What it controls |
|---|---|---|
| `--mobile-output-foot-pref` | `30dvh` | Preferred foot height (clamped by min/max) |
| `--mobile-output-foot-min` | `120px` | Foot floor on tiny phones |
| `--mobile-output-foot-max` | `220px` | Foot ceiling on tablets-in-portrait |
| `--mobile-export-chip-h` | `36px` | Chip height in the strip |
| `--mobile-prompt-input-h` | `40px` | Prompt textarea base height |
| `--mobile-camera-btn-h` | `44px` | Camera button height |
| `--mobile-longpress-ms` | `500` | Long-press threshold (lower = snappier, higher = fewer false positives) |
| `--mobile-longpress-cancel-px` | `12` | Movement that cancels press |

The CSS file currently inlines these values rather than reading the custom
properties — the implementation can wire them up by replacing the inlined values
with `var(--mobile-*)` references when convenient.

---

## 10. Variants for designer to consider

### Variant A — chip strip (recommended, ships in v1)

The horizontal chip strip described above. Most space-efficient. Trade-off: you
have to swipe to discover buttons that are off-screen (the right-edge fade is the
only visual hint).

### Variant B — bottom sheet

Foot collapses to ~88 px (just the prompt row + a "▾ More" handle). Tapping the
handle expands to ~60 dvh, revealing the full export grid in vertical layout.
Trade-off: every export action becomes a two-tap action (handle, then button).

To preview, set in `mobile-output-tokens.css`:
```css
--mobile-output-foot-pref: 60dvh;
--mobile-output-foot-max:  60dvh;
```
…and re-screenshot `mobile-output-v2.html`.

### Variant C — collapsible toolbar with overflow menu

Three primary chips inline (Drive, Copy, PNG — most common), the rest behind a
"⋯" overflow button that opens a sheet. Trade-off: the discoverability of the
nine actions becomes uneven; users won't find Classroom / Email without exploring.

---

## 11. Cross-references

**Code**
- `src/index.css` — mobile `@media (max-width: 880px)` block at lines ≈ 962–1180
- `src/components/UploadCard.jsx` — long-press detection + camera button
- `src/components/UploadConfirmModal.jsx` — preview modal
- `src/App.jsx` — `pendingPreviewFile` state + modal wiring

**Docs in this folder**
- `README.md` — original three-pane redesign brief (font-pair, themes, full token table)
- `mobile-output-v2.html` — interactive mockup of the new layout
- `mobile-upload-flows.html` — three states of the upload flow
- `mobile-output-wireframe.svg` — SVG wireframe for Figma / Penpot import
- `mobile-output-tokens.css` — every layout knob as a CSS custom property

**Out-of-scope follow-ups** (do not address here)
- PDF first-page rasterisation in the preview modal (also unlocks better
  `/api/extract-images` previews).
- Long-press semantics on session rows in the Library Rail (scope was the upload
  card only).
- A bottom-sheet variant of the controls strip (Variant B above).
- Per-token confidence (would unlock the Diff pill).
