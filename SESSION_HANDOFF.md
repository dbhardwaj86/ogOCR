# Session Handoff — ogOCR Sprint Plan Execution

**Last updated:** 2026-04-27 (post Sketch → Image + Concurrent Vectorize + Save Picker Tightening sprint)
**Plan file (latest pass):** no dedicated plan file — incremental follow-ups on top of the Surface-Trim sprint.
**Plan file (Surface-Trim pass):** `C:\Users\abc\.claude\plans\open-a-plan-doc-radiant-raccoon.md` (Polish + Vectorize-Abort + Action Surface Trim, shipped commit `07cd434`)
**Plan file (prior pass):** `C:\Users\abc\.claude\plans\where-is-the-functionality-zesty-glacier.md` (drove v4 + unified-Save in `9c99826`; §3.1/§3.3 closed in `9b907d0`)
**Plan file (Multi-Sketch + Auto-Compile pass):** `C:\Users\abc\.claude\plans\ok-brainstorm-to-get-vast-porcupine.md`
**Plan file (3-sprint pass):** `C:\Users\abc\.claude\plans\we-will-work-on-fuzzy-teacup.md`
**Source review:** [REVIEW_REPORT.md](REVIEW_REPORT.md)
**Comparison report:** `..\_review_reports\COMPARISON.md` (4-codebase bake-off that picked ogOCR)

Read **Latest pass — Sketch → Image + Concurrent Vectorize + Save Picker Tightening** first, then the Surface-Trim section, then prior passes.

## Latest pass — Sketch → Image + Concurrent Vectorize + Save Picker Tightening (2026-04-27)

**Why:** After the Surface-Trim sprint shipped, three follow-up items emerged:
1. The dropped "Sketch → SVG" → user often just wants a raster (PNG) of the sketch, not editable vector. Re-introducing as a peer action lets PNG-first users skip the picker entirely.
2. `vectorizeAbortRef` was a single `AbortController` — clicking two cards quickly while a batch was in flight silently abandoned one of the in-flight fetches. Concurrent vectorize support needs a per-sketch controller map.
3. The Save picker's source-derived raster items (Original as PNG/JPG, All pages as PNG/JPG) overlapped conceptually with the new Sketch → Image action and the existing per-block SVG export; dropping them tightens the picker.

**What shipped (uncommitted at the time of writing — this commit):**

| Layer | Change | Files |
|---|---|---|
| Magic actions | New **`sketchImage`** action ("Sketch → Image", glyph `◭`, key `I`, group `Visual`, tier `overflow`) — uses `/api/sketch-to-svg` then auto-rasterizes the resulting SVG to PNG client-side via `exportRaster` after extraction lands. Single-sketch responses save 1 PNG; multi-sketch flows still go through the picker (per-card vectorize → Save → All as PNG via the existing pipeline). The session itself still keeps the SVG content for future re-export. | `src/magicActions.js`, `src/App.jsx` |
| Vectorize concurrency | `vectorizeAbortRef` changed from single `AbortController` ref → `Map<sketchId, AbortController>`. Per-call set/get/delete; cancel paths walk the map. Concurrent vectorize calls (e.g. user clicking two cards quickly while a batch is mid-flight) no longer abandon each other's in-flight fetches. | `src/App.jsx` |
| Save picker | `buildSessionFormats({ session, baseName })` simplified — dropped `file`, `pdfPageCount`, `onPageProgress` params and the source-derived raster items (Original as PNG/JPG, All pages as PNG/JPG). New per-compile-block SVG bulk raster surfaces in `buildCompileFormats`: when a compile has ≥1 SVG block, picker exposes **All SVGs as PNG (N) / JPG (N)**. ExportBar simplified — no more file-probe / pdf-page-count plumbing. | `src/saveFormats.js`, `src/components/ExportBar.jsx` |
| Output / preview polish | Touch-up edits to `OutputColumn.jsx`, `SourcePreview.jsx`, `UploadConfirmModal.jsx`, `CompileBlockCard.jsx`, `CompileBuilder.jsx`, `exportRaster.js`, `svgSanitize.js` — small consistency tweaks following from the Save-picker refactor and concurrent-vectorize wiring. | (above) |
| Docs | New top-level **`SECRETS_ROTATE_REMINDER.md`** — checklist for rotating `GEMINI_API_KEY`, `OPENAI_API_KEY` (orphan from a reverted experiment), `SMTP_USER`/`SMTP_PASS`, and Drive OAuth client secret + refresh token. Procedure: mint new → update `.env` → restart → revoke old. | `SECRETS_ROTATE_REMINDER.md` (NEW) |

**Verification:**
- `npm run lint` → exits 0.
- `npm test` → **219/219 passing** across 26 files (test count unchanged from Surface-Trim — the Sketch → Image action is exercised through the existing runAction → magicActions wiring; per-sketch concurrent vectorize is covered by the prior batch-abort tests).
- `npm run build` → clean.
- `/api/_status` reports `gemini=real, docx=real`.

**Manual smoke matrix (still owed by user on http://192.168.1.13:5181):**
- A. Sketch → Image on a single-sketch upload → 1 PNG downloads after extraction lands; toast "Saved 1 PNG"; session also retains SVG.
- B. Sketch → Image on a multi-sketch upload → picker opens (no auto-raster); user vectorizes some/all → Save → "All as PNG (N)" downloads everything.
- C. Concurrent vectorize regression — start "Vectorize All", quickly click an individual card's Vectorize while the batch is mid-flight → both controllers stay live, both fetches resolve independently.
- D. Save picker for a session with no SVG → picker shows only text/json/markdown options (no Original-PNG entry; user uses Sketch → Image action if they want a raster).
- E. SECRETS_ROTATE_REMINDER.md is at the repo root, gitignored properly? — committed deliberately as a README-style checklist (no actual secrets in it).

## Prior pass — Surface-Trim + Polish sprint (2026-04-27)

**Why:** Three concrete asks the user surfaced after the v4 + unified-Save sprint, plus the eight highest-leverage UX/UI holes from a 4-subagent polish audit. The audit ran read-only across upload/onboarding, action/processing, output/export, and visual/theme; full findings live in the plan file.

**Track A — three concrete asks:**

| Ask | Summary | Files |
|---|---|---|
| **A1 — Abort batch vectorize** | Sequential `vectorizeAllSketches` was uninterruptible. New `batchAbortRef = { cancelled: bool }` flag on App; the for-of loop checks between iterations. New `vectorizeAbortRef` (AbortController) so the in-flight `/api/sketch-to-svg` fetch is interrupted, not just the queue. SketchesPicker swaps "Vectorize All" → "Stop (N left)" while a batch is active. ProcessingStrip's existing Cancel slot now wired in App's `cancelRunning` for both single + batch vectorize. Aborted sketches reset `status: 'pending'` so per-card Retry resumes one-at-a-time. | `src/App.jsx`, `src/components/SketchesPicker.jsx`, `src/components/OutputColumn.jsx` |
| **A2 — Vectorize gates the UI** | Both `vectorizeSketch` and `vectorizeAllSketches` now own a `processing` slot via the new `startVectorizing(actionId, label)` helper (no random-jitter progress curve — direct stage updates via `setVectorizeStage`). Because `runAction` already early-returns with OCR_BUSY when `processing` is truthy, magic-action tiles, custom prompt, palette, and re-clicks are all blocked during vectorize. Single calls use `actionId: 'sketch'`; batch uses `'sketch-batch'`. | `src/App.jsx` |
| **A3a — Drop dead actions** | Removed Mermaid (◇ Diagram → Mermaid), Extract Images (▣), and the entire Refine row (Summary/Bullets/Formal/Casual). Deleted: `RefinementTabs.jsx`, MermaidEditor + `detectMermaidBlock` from `RenderedDoc.jsx`, `/api/extract-images` server route + smoke fixture, `mermaid` npm dep, `mermaid.test.js`, `refine.test.js`, OutputColumn's Refine and Diagram pills, App's `data.images` + refine branches. `KIND_LABEL` / `KIND_GLYPH` trimmed. Compile.js still keeps `auto:image:*` and `auto:refinement:*` role logic so legacy sessions still hydrate cleanly — the codepaths just never produce new entries. | `src/magicActions.js`, `src/components/MagicActions.jsx`, `src/components/OutputColumn.jsx`, `src/components/RenderedDoc.jsx`, `src/App.jsx`, `server/index.js`, `package.json`, `src/__tests__/smoke/*` |
| **A3b — Add raw image / PDF page export** | New helpers in `src/exportRaster.js`: `rasterFromImage(file, opts)` re-encodes an uploaded image through canvas to PNG/JPG; `rasterPdfPages(file, { format, pageScale, baseFilename, onProgress })` dynamic-imports `pdfjs-dist`, walks every page at 2× scale, downloads sequentially with a 60 ms breather. Save picker (`buildSessionFormats`) now accepts `file` + `pdfPageCount` + `onPageProgress`; surfaces **Original as PNG / JPG** for image uploads and **All pages as PNG (N) / JPG (N)** for PDFs. ExportBar lazily probes PDF page count on file change and forwards progress (`Saving page 3 of 12…` label). Save button enables when a file is present even pre-extraction (replaces the dropped Extract Images action). | `src/exportRaster.js`, `src/saveFormats.js`, `src/components/ExportBar.jsx`, `src/components/OutputColumn.jsx` |

**Track B — polish (the eight highest-leverage holes):**

| # | Item | Files |
|---|---|---|
| B1 | Honest progress UI: at the 95% cap the bar drops the lying fill and ProcessingStrip shows live elapsed time + "large PDFs may take 1–3 min" hint. `processing.startedAt` set in both `startProgress` and `startVectorizing`. | `src/components/ProcessingStrip.jsx`, `src/App.jsx` |
| B2 | Visible Cancel from action surface: ProcessingStrip's existing Cancel button is now actually wired (`onCancel={processing ? onCancel : null}` in OutputColumn) and `cancelRunning` switches between abortRef / vectorizeAbortRef / batchAbortRef based on `processing.actionId`. | `src/App.jsx`, `src/components/OutputColumn.jsx` |
| B3 | OS-aware mod key: new `src/platform.js` exports `modKeyLabel('K')` → "⌘K" on Mac, "Ctrl K" elsewhere. TopBar uses it instead of the hardcoded "⌘ K". | `src/platform.js` (NEW), `src/components/TopBar.jsx` |
| B4 | STIX Two Text → **Fraunces** (variable serif, opsz 9..144, wght 400..700). Google Fonts import line + `--serif` token updated. Matches the design handoff spec which had been referenced but never shipped. | `src/index.css` |
| B5 | Pill row rename: "Markdown" → "Source"; **Worksheet** lifted out of the pill cluster into its own `og-output-tools` group with a labeled button (it opens a modal, not a view — was confusing alongside Preview/Source/Equation/Sketches). | `src/components/OutputColumn.jsx`, `src/index.css` |
| B6 | Filename rename affordance: the bare `<input>` next to the OUT.* num is now a click-to-edit display button with a pencil glyph that shows on hover/focus. Engages an inline input on click. | `src/components/OutputColumn.jsx`, `src/index.css` |
| B7 | `:focus-visible` rings on every interactive token (`.og-pill`, `.og-tile`, `.og-session`, `.og-kbd-btn`, `.og-theme-cycle`, `.og-output-worksheet-btn`, `.og-output-rename-display`, `.og-export-menu-btn`, `.og-export-btn`, `.og-sketches-batch`, `.og-proc-cancel`, `.og-btn-primary`, `.og-btn-ghost`). 2px indigo ring, 2px offset, scoped to keyboard nav. | `src/index.css` |
| B8 | `@media (prefers-reduced-motion: reduce)` global block at the bottom of `index.css` — kills scan line, sketch pulse, spinner rotation, toast slide, tile lift. Functional transitions stay. | `src/index.css` |

**Verification:**
- `npm run lint` → clean (one round-trip after react-hooks rules flagged sync `setState` in two effect bodies; both restructured).
- `npm test` → **219/219 passing** across 26 files (was 239/239 across 28 — net –20 from the deleted mermaid + refine suites).
- `npm run build` → green; pdf.worker stays code-split.

**Manual smoke matrix (still owed by user):**

1. **Vectorize abort (A1)** — upload PDF with 5+ sketches → `Vectorize All` → click Stop after 2 finish → DevTools Network shows the in-flight 3rd fetch aborted; sketches 4–5 stay `pending`; per-card Vectorize button works to resume one at a time.
2. **Vectorize UI gate (A2)** — during single-sketch vectorize, click Extract Text → toast "Still finishing previous action…" (OCR_BUSY). After completion, all gates release.
3. **Dropped actions (A3a)** — Source column shows 6 magic-action tiles (was 8). No Refine row. No Diagram or Refine pill in OutputColumn. Existing v4 compiles still open with their auto:image / auto:refinement blocks intact.
4. **Raster export (A3b)** — image upload pre-extraction → click Save → picker shows `Original as PNG` + `Original as JPG`. 12-page PDF → picker shows `All pages as PNG (12)` + `All pages as JPG (12)`. Click triggers 12 sequential downloads with the Save label updating page-by-page.
5. **Honest progress (B1)** — force a 90s extraction (large PDF) → at 95% cap the bar stops climbing, the strip shows `still working · 0:42 elapsed · large PDFs may take 1–3 min`, the percentage display swaps to elapsed time.
6. **Cancel from anywhere (B2)** — start any action → ProcessingStrip Cancel button is visible and clickable; abort interrupts the in-flight fetch.
7. **OS mod key (B3)** — boot on Windows: TopBar shows `Ctrl K`, not `⌘ K`. macOS still shows `⌘K`.
8. **Fraunces (B4)** — inspect h1 / og-source-name / og-rendered prose: computed `font-family` resolves to Fraunces.
9. **Pill rename + Worksheet (B5)** — Output mode pills read `Preview · Source · …`. Worksheet button sits visually OUTSIDE the pill cluster.
10. **Filename rename (B6)** — hover the filename in the OUT header → pencil glyph appears → click → inline input takes focus → Enter commits, Esc reverts.
11. **Focus rings (B7)** — Tab through every interactive surface; every focused element gets a 2px indigo ring.
12. **Reduced motion (B8)** — system preference `prefers-reduced-motion: reduce` → no scan line, no sketch pulse, no toast slide.

**Pending / carried over:**
- **DOCX export bug** (user-reported) is parked. Repro: Save → DOCX with no pandoc on server → server returns `EXP_DOCX_NO_BINARY` but [exportDocx.js:32](src/exportDocx.js) routes through `EXP_DOCX_PANDOC_FAIL`, surfacing a developer-flavored toast. Picker still shows DOCX as a normal option with no `(mock)` cue. Fix surface: route the registry code correctly, add `(mock)` suffix in the picker when `/api/_status` flags it, optionally disable the row.
- **Polish audit deferred items** (kept in plan file as a punch list): empty-session-list dead state, Welcome sample-load swallows errors silently, theme-cycle button shows current not next, action-tile glyphs (▦ ◇ ✎ ▣ → now ▦ ✎ after trim) still blur at small sizes, custom prompt has no Shift+Enter hint / no history / no preset chips, LanguagePill dropdown uses hardcoded inline `#fff/#ddd` (will look wrong on Ink theme), KaTeX failures color text red but no "1 equation didn't parse" badge, multi-SVG `All as PNG (5)` triggers Chromium permission prompt with no warning, Compile modal has no entrance animation, Sepia `--ink-faint` ≈ 3.6:1 fails AA, no spacing scale, action tiles + upload card + mode pills missing border-radius vs. spec, toast/inline-error/mock-badge use raw hex.
- **Phase 13.3 top bar restyle** — next sub-phase of the design migration (brand chip + status pulse + capsule kbd). Tracked in `~/.claude/plans/go-thorugh-design-handoff-variant-b-refi-dapper-harbor.md`.
- **Server endpoint cleanup**: `/api/save-drive`, `/api/email`, `/api/classroom/draft` UI buttons are gone but the endpoints remain in `server/index.js`. Decommission as a separate small chore.



## Latest pass — Carryover sprint: equation CSS + table onChange + langpill props + plan §3 gaps (2026-04-27)

**Why:** Three carryover items from Sprint 3 (Tracks J–N) were still open after the v4 + unified-Save sprint, plus two small gaps remained between commit `9c99826` and the latest plan file (`where-is-the-functionality-zesty-glacier.md`). All five items were small, scoped, and parallel-friendly — a perfect fit for a 4-track worktree dispatch.

**What shipped (4 worktree branches merged + 1 follow-up commit):**

| Track | Commit | Merge | Closes |
|---|---|---|---|
| **P — Equation CSS + tier styling** | `637e2e4` | (merge commit) | S3 Track L carryover (og-equation-* styles) — `EquationBlock.jsx` was functional but unstyled; track ships the full split-pane CSS mirroring `og-mermaid-*`. Plus `og-tile[data-tier]` differentiation for the action-tile prioritization in `MagicActions.jsx`. CSS-only file: `src/index.css` (+86 LOC). |
| **Q — TableBlock onChange wiring** | `e80c802` | (merge commit) | S3 Track M carryover. New `replaceFirstGfmTable(text, { headers, rows })` exported from `TableBlock.jsx`; `RenderedDoc` now wires `onChange` into `<TableBlock>` and patches the FIRST GFM table region of the original text via that helper, then calls `onChangeText`. `OutputColumn` forwards `onUpdateSession` to `RenderedDoc`; `App.jsx` passes `onUpdateSession` to `OutputColumn` (mirrors the existing SourceColumn wiring). Edits to cells, sort, add row/col now persist across reload. +4 tests. |
| **R — LanguagePill prop threading** | `a67a378` | (merge commit) | S3 Track K carryover. Removed the `og:language-override` window event + module-level `publishLanguageOverrides` signal store (~80 LOC). `SourceColumn` now passes `onLanguageOverride` + `overrideLang` + `sessionId` as plain props; `App.jsx` wires `onLanguageOverride` → `runAction(actionId, undefined, { languageOverride: lang })`. `auto` clears the override. New `languagePill.test.jsx` (13 cases) including a guard that fails if anyone reintroduces `window.dispatchEvent` from the pill. |
| **T — Docs update for v4 + unified Save** | `a19b6b0` | (merge commit) | New "Latest pass" entry in `SESSION_HANDOFF.md` for commit `9c99826`; `CLAUDE.md` Latest-changes block updated for v4 + saveFormats + exportRaster + onUpdateSession; state-model and Output-rendering sections aligned to v4. `gemini.md` short timestamped append. |
| **— Plan §3 gap close** | `9b907d0` | direct | Plan `where-is-the-functionality-zesty-glacier.md` §3.1: drop the `effectiveMode === 'rendered'` gate on the OutputColumn back-link so the picker is reachable from any mode (relied on auto-flip before). Plan §3.3: add 1 SketchesPicker mixed-status regression test + 5 unit tests on the back-link conditional shape so a future refactor can't silently reintroduce the mode gate. |

**Verification (post-merge final):**
- `npm run lint` → clean.
- `npm test` → **239/239 passing** across 28 files (was 216/216 baseline — +4 Q + 13 R + 6 plan §3 = +23 net).
- `npm run build` → clean.

**Manual smoke matrix (still owed by user):**

1. **Equation block (Track P):** run `Extract math` on a math image → `Equation` pill → split textarea ↔ KaTeX preview now has visible borders, mono labels, scrolling preview pane; ≤880px stacks vertically.
2. **Action-tile tiers (Track P):** inspect `<button class="og-tile" data-tier="primary">` etc. — tertiary tiles should render visibly dimmer than primary (border weight + bg-tint).
3. **Table cell edit (Track Q):** extract a doc with a markdown table → edit a cell → blur → click Source pill → confirm the markdown reflects the edit. Reload page → edit survives. Sort A→Z, Add row/col, Export CSV all persist.
4. **LanguagePill override (Track R):** extract a non-English doc → click LanguagePill → pick French → action re-runs with override prompt; pill labels the override. Pick `Auto-detect` → override clears.
5. **Sketch back-link (plan §3.1):** vectorize a sketch + Open → switch to Source mode → confirm the **← Show all sketches (N)** chip is STILL visible (was hidden before, gated on rendered mode).
6. **Sketch in-flight survival (plan §3.3, no UI change):** trigger Vectorize All → click Open on the first done card mid-loop → other cards continue to `done`. (App-level test deferred — projection-layer regression covers the visible invariant.)

**Worktrees + branches:** the four branches `track-p-eqn-css`, `track-q-table-onchange`, `track-r-langpill-props`, `track-t-docs` (worktrees at `C:/SandBox/claude_box/claudeOCR/ogOCR-track-{p,q,r,t}-*`) stay as rollback path until browser smoke confirms parity. The earlier track-{a–n} worktrees from prior sprints are still on disk.

**Carryover for next sprint:**
- **§3.3 voice annotation, §3.6 pen/stylus markup** — large exploratory features.
- **§3.7 per-token confidence** — blocked on Gemini logprobs.
- **§3.8 Real PDF export via puppeteer** — 300 MB install gate behind `PDF_ENGINE=puppeteer`.
- **§3.4 page-to-section auto-grouping** — medium scope; still open.
- **Phase 13.3–13.9 design migration** — top bar restyle next.
- **Server endpoint cleanup** (per plan §out-of-scope): `/api/save-drive`, `/api/email`, `/api/classroom/draft` UI buttons are gone but the endpoints remain in `server/index.js`. Decommission as a separate small chore.

## Prior pass — v4 worksheet schema + unified Save picker (2026-04-27)

**Why:** Three pain points the v3 auto-compile UX surfaced:
1. Re-running a *different* magic action (e.g. Math-to-LaTeX after Text Extract) overwrote the prior action's result in the worksheet — only the most-recent action kept its block, because v3 auto blocks were keyed by kind (`auto:text`, `auto:svg:main`) not by the action that produced them.
2. The 3-dropdown ExportBar (Save / Share / Export) was visually heavy for a flow where Drive / Email / Classroom are mocks and most users either hit Save on desktop or Share on mobile.
3. Track N (signature insert) needed `onUpdateSession` from SourceColumn but was working around it with a localStorage round-trip + page reload — source pane only updated after refresh.

**What shipped (commit `9c99826`):**

| Layer | Change | Files |
|---|---|---|
| Compile schema | Bumped **v3 → v4**. Auto block roles now action-keyed: `auto:text:<actionId>` / `auto:svg:<actionId>` (replaces v3's `auto:text` and `auto:svg:main`). New `session.outputs` map populated by `runAction` and consumed by `syncAutoBlocks`. Re-running the **same** action replaces its block in place; running a **different** action accumulates a new block alongside the prior one. | `src/compile.js`, `src/App.jsx` |
| Migration | Legacy `auto:text` and `auto:svg:main` blocks demote to `role: 'manual'` so existing v3 compiles keep their content as historical snapshots; new auto blocks land alongside on the next sync. | `src/compile.js#migrateCompile` |
| Unified Save picker | New `src/saveFormats.js` builds a format menu shared by per-session ExportBar and CompileBuilder. `saveOrShare()` uses `navigator.share()` with a File payload when available; falls back to download. The 3 ExportBar dropdowns collapsed into a single Save button. Drive/Email/Classroom buttons removed (those routes are still server-mocked but no longer surface in the UI). | `src/saveFormats.js` (NEW), `src/components/ExportBar.jsx`, `src/components/CompileBuilder.jsx` |
| Raster pipeline extracted | SVG → PNG/JPG raster code lifted out of ExportBar into `src/exportRaster.js` so the picker, compile builder, and any future surface can reuse it. | `src/exportRaster.js` (NEW), `src/components/ExportBar.jsx` |
| MockBadge | Filters to `docx` only — Drive/Email/Classroom buttons no longer exist, so their mock pills aren't useful in the top bar. | `src/components/MockBadge.jsx` |
| Track N source-pane carryover | `SourceColumn` now receives `onUpdateSession` directly from App; signature insert is a single state update, no more localStorage round-trip + page reload. | `src/App.jsx`, `src/components/SourceColumn.jsx` |
| Sketch picker UX | Focused-view back chip restyled (border + accent-soft fill) and shows pending-vectorize count. `OutputColumn` auto-flips mode to `'rendered'` when `openSketch` promotes a sketch (so the Open click is no longer a no-op when the picker had been visible). | `src/components/OutputColumn.jsx`, `src/index.css` |
| Tests | New `saveFormats.test.js` (8 cases) + revamped `exportBar.test.js` + 12 new `compile.test.js` cases (v4 action-keyed sync, v3→v4 migration demote, action accumulation). 204 → **216** passing. | `src/__tests__/saveFormats.test.js` (NEW), `src/__tests__/exportBar.test.js`, `src/__tests__/compile.test.js` |

**Verification:**
- `npm run lint` → exits 0.
- `npm test` → **216/216 passing** (was 204/204; +12 net new across compile + saveFormats + exportBar suites).
- `npm run build` → clean.

**Manual smoke matrix:**
- A. **Per-action accumulation** — extract Text → open Worksheet → auto-compile shows ONE text block. Run Math-to-LaTeX on the same source → Worksheet now shows BOTH the text block AND the math block (different `actionId`s, both auto, neither overwrites). Re-run Text → just the text block updates in place; math block untouched.
- B. **Unified Save (per-session)** — desktop: ExportBar shows ONE Save button → click opens a picker listing MD / SVG / PNG / JPG / JSON / DOCX entries scoped to the session's content shape. Mobile: `navigator.share()` fires with the chosen format as a File payload (or downloads if the API is missing).
- C. **Compile Save** — open the compile builder → click Save → picker offers MD / HTML / DOCX / JSON. Same `saveOrShare()` underneath.
- D. **Mock badge** — top bar shows `MOCK · docx` only. Drive / Email / Classroom buttons no longer exist anywhere in the UI.
- E. **Signature insert** — open Sign modal from SourceColumn header → draw → Insert → source pane updates IMMEDIATELY (no reload, no flash). All ExportBar paths see the updated text on the next save.
- F. **Sketch picker** — vectorize a sketch → click Open → focused-view shows; the back chip is visibly chip-styled (border + tinted bg) and shows the pending-vectorize count when other cards are still pending.

## Prior pass — Per-source Auto-Compiles + Multi-SVG Export + Non-destructive Sketch Open (2026-04-27)

**Why:** Three pain points the Multi-Sketch sprint exposed:
1. Worksheet compilation was manual cross-source — the user had to drag every block in. With multi-sketch sessions producing N SVGs each, this got tedious fast.
2. The PNG export only covered the "main" SVG — vectorized sketches in `session.sketches[].svg` had no export path.
3. Clicking a sketch's **Open** CTA wiped `session.sketches[]`, so the user lost access to the picker (and to every other already-vectorized sketch) the moment they viewed one.

**What shipped (commit `d441f40`):**

| Layer | Change | Files |
|---|---|---|
| Compile schema | Bumped to **v3**. Every compile now has a `sourceId` (`null` = manual cross-source, session-id = auto-managed). Every block has a `role` (`'manual'` or one of the `auto:*` tags). New `syncAutoBlocks(compile, session)` reconciles auto blocks from a session snapshot — replaces text/refinements/main-svg/images in place, **preserves every distinct vectorized sketch as its own block**, never touches manual blocks, never overwrites user drag-reorders. | `src/compile.js` |
| Sync triggers | `syncAutoBlocks` runs on every extraction completion: `runAction`, `vectorizeSketch` (uses prev-from-updater so the `vectorizeAllSketches` loop always syncs against the freshest state, not a stale closure), the queue runner, `openSketch`, and the new `showAllSketches`. | `src/App.jsx` |
| Compile palette UX | Worksheet button on a source opens **that source's auto-compile** (creates one if missing). Compiles cascade-delete when the underlying session is deleted. Palette splits **By source** (with auto badge) from **Manual**. | `src/components/CompilePalette.jsx`, `src/App.jsx` |
| Multi-SVG raster export | `exportPNG` generalized to `exportRaster(svg, { format, filename, quality })` — supports both PNG and JPG. New `src/svgExports.js` module deduplicates main vs. focused-sketch SVG. UI shows **All as PNG (N)** / **All as JPG (N)** when N > 1; sequential downloads with a 60ms breather to dodge Chromium's same-name dedup. No mosaic, no resize. | `src/components/ExportBar.jsx`, `src/svgExports.js` (NEW) |
| Non-destructive sketch open | `openSketch` no longer wipes `session.sketches[]` when promoting a sketch to the main canvas. New **← Show all sketches (N)** link in the focused-view header (rendered when `session.sketches.length > 0` even if `session.svg` is set) returns the user to the picker without losing any vectorized SVGs. | `src/App.jsx`, `src/components/OutputColumn.jsx`, `src/index.css` |
| Tests | 14 new `compile.test.js` cases (v3 schema, sync semantics, multi-SVG preservation, drag-reorder survival, sequential-vectorize regression). 7 new `rasterExport.test.js` cases (dedup logic). | `src/__tests__/compile.test.js`, `src/__tests__/rasterExport.test.js`, `src/__tests__/compile-idb.test.js` (touched for v3 fixture) |

**Verification:**
- `npm run lint` → exits 0.
- `npm test` → **204/204 passing** (was 182/182; +21 new compile + raster tests, -1 net for fixture cleanup).
- `npm run build` → clean.
- `/api/_status` continues to report `gemini=real, docx=real`.

**Notable subtlety:** `vectorizeSketch` reads its session from the prev-from-updater pattern (`setSessions(prev => ...)`) instead of a closure-captured snapshot. This is what lets `vectorizeAllSketches`'s sequential loop sync the auto-compile against the FRESHEST state after every per-card vectorize. The previous closure-based read would have synced against stale sketches[] from the start of the loop.

**Manual smoke matrix (still owed by user on http://192.168.1.13:5181):**
- A. Single-session worksheet auto-create — extract text, click Worksheet on the source → auto-compile opens, contains an `auto:text` block with the extracted text. Re-run extraction → block updates in place (no duplicate).
- B. Multi-sketch auto-blocks — detect 3 sketches, vectorize all → auto-compile shows 3 distinct `auto:sketch` blocks (one per vectorized SVG). Drag-reorder them → re-vectorize one → reorder survives.
- C. Manual + auto cohabitation — open auto-compile, drag in a block from another source → marks `role: 'manual'`. Re-run extraction on the auto-source → manual block survives, auto blocks update.
- D. Cascade delete — delete the source session → its auto-compile is gone too, manual cross-source compiles untouched.
- E. Multi-SVG export — vectorize 3 sketches, click ExportBar → "All as PNG (4)" appears (3 sketches + main view if it has its own SVG, deduped). Each downloads with its own filename.
- F. Non-destructive open — vectorize sketch #2, click Open → main canvas shows sketch 2's SVG, **Show all sketches (3)** link in the header → click → back to picker with all 3 cards intact (sketch 2 still marked `done`).

## Prior pass — Multi-Sketch Detection (2026-04-27)

**Why:** Real teaching documents often contain several sketches per page. The old `/api/sketch-to-svg` returned ONE SVG, leaving the user to re-upload or manually crop for each additional diagram. This pass lets Gemini detect every sketch in the upload, surface a picker, and lazy-vectorize each on demand — preserving the back-compat single-sketch UX.

**What shipped:**

| Layer | Change | Files |
|---|---|---|
| Server | `/api/sketch-to-svg` now polymorphic on `req.body.bbox`. **Discovery mode** (no bbox): JSON-mode prompt asks Gemini for every sketch in the doc, returns `{sketches:[{id, description, bbox, page, thumbnail?}]}` for 2+, falls through to vectorize for 1, errors `OCR_NO_SKETCH_FOUND` for 0. **Vectorize mode** (bbox present): crops via sharp (images) or hints prompt with bbox+page (PDFs), returns `{svg}`. | `server/index.js` |
| Errors | New codes `OCR_NO_SKETCH_FOUND` (404, INFO) and `OCR_SKETCH_BBOX_INVALID` (400, ERROR) registered on both server and client. | `server/errors.js`, `src/errors/codes.js` |
| Schema | Bumped `SESSION_SCHEMA_VERSION` 4 → 5. New optional fields: `sketches: [{id, description, bbox, page, thumbnail?, svg, status}]` and `selectedSketchId`. Migration is a no-op stamp (fields default undefined). | `src/App.jsx` |
| State | New 4th branch in `runAction` + queue runner for `data.sketches`: stores candidates with `status: 'pending'`, seeds `selectedSketchId` to first card. New helpers `vectorizeSketch(id)`, `vectorizeAllSketches()` (sequential), `openSketch(id)` (promotes a vectorized sketch to the main canvas — note: as of the next sprint this is **non-destructive** and `session.sketches[]` survives so the picker stays accessible). | `src/App.jsx` |
| UI | New conditional **Sketches (N)** pill in the Output column (rendered only when `session.sketches.length > 0`); auto-flips mode to `sketches` when a session FIRST acquires sketches; falls back to Preview if the user switches sessions. New `SketchesPicker` component renders cards with thumbnail (or placeholder for PDFs), description, page tag, status badge ('Vectorize' button → spinner → inline SVG preview → 'Open' CTA). Toolbar hosts "Vectorize All (N left)". | `src/components/OutputColumn.jsx`, `src/components/SketchesPicker.jsx` (NEW), `src/index.css` |
| Copy | Sketch action hint changed from "Hand drawing → editable SVG" to "Detect & vectorize sketches" so users know it now handles multiple. | `src/magicActions.js` |
| Tests | 12 new tests — 7 backend (discovery 0/1/2+, vectorize-with-bbox, bad-bbox in 3 forms) + 5 frontend (picker render, Vectorize click, Open click + SVG preview, Vectorize-All disabled-state, empty list). Total 170 → 182 passing. | `src/__tests__/smoke/sketch-and-images.test.js`, `src/__tests__/smoke/server.fixture.js` (mirrored prod logic), `src/__tests__/smoke/client-output.test.jsx` |

**Verification:**
- `npm run lint` → exits 0.
- `npm test` → **182/182 passing** across 25 files (was 170/170; +12 new).
- `npm run build` → clean.
- `/api/_status` continues to report `gemini=real, docx=real`.

**Known limitations (Phase-2 follow-up):**
1. **PDF page rasterization on the server** — multi-sketch PDFs return picker cards without thumbnails (only descriptions + page tags + bbox). User must rely on the description to pick. Vectorization for PDFs uses prompt-based bbox hint rather than server-side cropping. Both items would benefit from a `pdfjs-dist` server render pass.
2. **Cold-resume** (page reload after detection): the original file is lost from memory, so per-card vectorization shows a "re-upload to vectorize" toast instead of working silently. Acceptable for v1.
3. **Sequential "Vectorize All"** — 5 sketches × ~30-60s/each = 2.5-5 min. UI shows per-card spinner; no top-of-picker progress bar yet.

**Manual smoke matrix (still owed by user on http://192.168.1.13:5181):**
- A. Single-sketch PDF — back-compat: SVG appears in Preview, no Sketches pill.
- B. Multi-sketch PDF — Sketches (N) pill appears, mode auto-flips, picker shows N cards (description + page tag, no thumbnails). Click Vectorize → SVG appears on the card.
- C. Multi-sketch image — same flow as B but cards show real cropped thumbnails.
- D. Plain text page — toast "No sketches detected…" appears, mode unchanged.
- E. Vectorize All on a 3-sketch upload — sequential progress, all 3 land as done.

## Prior pass — Ship Cleanup Sprint (2026-04-27)

**Why:** A four-codebase bake-off (ogOCR vs codex-OCR vs khanak-claude-OCR vs gemini-OCR) picked ogOCR as the codebase to invest in. This sprint closed the four gaps that stopped it from being ship-ready, then the three sibling codebases were retired. See `..\_review_reports\COMPARISON.md` for the full bake-off and `C:\Users\abc\.claude\plans\ok-brainstorm-to-get-vast-porcupine.md` for the gap-closure plan.

**What shipped (single commit, all green):**

| Group | Change | Files touched |
|---|---|---|
| 1 | Lint to green — added Node-globals block for `src/__tests__/**`; dropped unused `beforeEach` import; dropped unused `_Readable` import; `eslint-disable no-control-regex` on the legitimate `\x00` test | `eslint.config.js`, `src/__tests__/smoke/{client-output.test.jsx,server.fixture.js,mocks-and-share.test.js}` |
| 2 | Replaced `xlsx@0.18.5` (HIGH-severity vuln, write-only usage) with `exceljs@^4.4.0`; dynamic import preserved so it stays out of the main bundle | `package.json`, `src/components/TableBlock.jsx` |
| 3 | Production hosting: `npm start` script; `express.static(dist)` + SPA fallback regex (excludes `/api`); EADDRINUSE handler that exits non-zero with a clear message (kills the silent-exit bug documented in CLAUDE.md gotchas) | `server/index.js`, `package.json` |
| 4 | Gemini Files API for PDFs: new `server/geminiUpload.js` (4 exports, 107 LOC); `GoogleAIFileManager` instance; `generateContentFromUpload` helper that branches on mimetype; wired into `/api/extract`, `/api/sketch-to-svg`, `/api/extract-images`. Images stay inline base64 (cheaper); PDFs upload once, get a `fileUri`, get cleaned up in `finally` | `server/geminiUpload.js` (new), `server/index.js` |
| 5 | `.gitignore` — added `Application of Derivatives.pdf` (8.3 MB sample), `dev-server.log` | `.gitignore` |
| — | New Vitest test file ported from codex-OCR's `node:test` suite, plus two extra cases (no-fileManager error, polling timeout) | `src/__tests__/smoke/geminiUpload.test.js` (new) |

**Verification (all green):**
- `npm run lint` → exits 0 (was 8 errors)
- `npm test` → **170/170 passing** across 25 files (was 163/163; +7 new geminiUpload tests)
- `npm run build` → succeeds; entry chunk 539 KB; `exceljs` lazy-chunked at 930 KB; standard >500 KB warning
- `npm audit --audit-level=high` → no HIGH findings (was 1 HIGH `xlsx`); 6 moderate remain (uuid<14 chain via gaxios/googleapis-common/mermaid — semver-major bump deferred)
- `npm start` → boots, serves API + dist UI on a single port; `/api/_status` returns 200

**Manual smoke still owed:** upload a small image + small PDF + 9 MiB PDF through the running app and confirm extract/sketch-to-svg/extract-images all work via the new Files API path. Check the EADDRINUSE handler by trying to start a second instance on the same port.

## Resume protocol

1. Read this file (`SESSION_HANDOFF.md`) — start with the **Latest pass** section above.
2. Read [REVIEW_REPORT.md](REVIEW_REPORT.md) for the original audit context.
3. Read `C:\Users\abc\.claude\plans\we-will-work-on-fuzzy-teacup.md` for the 3-sprint scope.
4. Run `npm run lint && npm test && npm run build` to confirm baseline before changing anything.

This is the live status of the 3-sprint implementation pass landing the [REVIEW_REPORT.md](REVIEW_REPORT.md) recommendations (key rotation excluded). Then check the plan file for full sprint scope.

## Resume protocol

1. Read this file (`SESSION_HANDOFF.md`).
2. Read [REVIEW_REPORT.md](REVIEW_REPORT.md) for the original audit context.
3. Read `C:\Users\abc\.claude\plans\we-will-work-on-fuzzy-teacup.md` for full sprint scope, file lists, and verification steps.
4. Check the **Pending user review** section below first — that's the freshest unverified work.
5. Run `npm run lint && npm run test && npm run dev` to confirm baseline before changing anything.

## Pending user review (Run-2 review fixes — 2026-04-27 night)

Three commits landed on top of `f091c13` (Sprint 3 start). Pre-merge verification: `npm run lint` clean, **109/109** tests pass, `npm run build` clean (entry chunk 538 KB; pdf.worker 2.1 MB, pdf 405 KB, xlsx 425 KB all in lazy chunks).

| Commit | Title | Key changes |
|---|---|---|
| `d8f7497` | Adversarial review (run 2): TableBlock state updaters + batched-drop action | Findings A + C + D from the Run-2 review. New `BatchActionPrompt.jsx`. |
| `7a4a4be` | Server hardening + dev-port fallback + smoke tests | API_PORT (default 3003), log-injection guard, constant-time auth compare, multer `.any()`, MIME allowlist, Drive Buffer wrap, 7 supertest smoke files. |
| `fdf7e39` | UX polish: action tier metadata, Worksheet pill dim, Mermaid sanitize | `tier` field on `MAGIC_ACTIONS`, dim Worksheet pill until ≥2 sessions, route Mermaid SVG through `sanitizeSvg`. |

**Browser smoke (run after `taskkill //F //IM node.exe && npm run dev` — pick from this list):**

1. **Finding A (TableBlock):** extract a doc with a markdown table → editable grid renders → instrument the parent `onChange` (or watch React DevTools for parent re-renders) → confirm exactly **one** parent update per cell edit / header rename / sort / add row / add col. Pre-fix this fired twice in Strict Mode (which Vite enables by default in dev).
2. **Finding D (BatchActionPrompt):** drop 3 mixed-type files (image + PDF + image) on UploadCard → confirm modal opens listing the 3 filenames + sizes → click `Math to LaTeX` → all 3 enqueue with `actionId: 'math'` → DevTools Network tab shows `POST /api/extract` for each with the math prompt body. Cancel path: drop 3 files → click Cancel → no enqueue, no toast spam.
3. **Finding D regression:** drop a single file → confirm `UploadConfirmModal` (single-file path) is unchanged.
4. **Finding D > 20 files:** drop 25 files → existing `QUEUE_OVERFLOW` toast still wins (validation order preserved).
5. **Finding C (CLAUDE.md):** read the Gotchas section in `CLAUDE.md`. Confirm the carve-out wording reads cleanly: prohibition still applies to extraction path; preview-only thumbnail rendering is explicitly allowed.
6. **Server hardening:** API smoke — `curl http://localhost:3003/api/_status` (server now on 3003 by default) → 200; `curl -H "User-Agent: foo$(printf '\\r\\n')bar" http://localhost:3003/api/_status` → server logs show no injected line break. With `OG_API_TOKEN=secret` set: bad token returns AUTH_INVALID; correct token passes (constant-time compare).
7. **UX polish:** session count = 1 → Worksheet pill dimmed with hint "Compile is most useful with 2+ sessions"; session count ≥ 2 → bright. Action tiles each carry `data-tier` (inspect element to verify).
8. **Mermaid sanitize:** paste a fenced ` ```mermaid ` block whose label contains `<script>alert(1)</script>` → mermaid renders without executing the script (sanitizeSvg strips it).

**Push state:** branch `main` is now **34 commits ahead of origin/main**. The user has not yet pushed; review/push at their discretion.

---

## Sprint status

| Sprint | Status | Notes |
|---|---|---|
| **S1 — Stabilize & Observe** | ✅ **Complete** | Lint clean, tests passing 10/10, dev server boots, error envelope verified end-to-end via curl |
| **S2 — Compose** | ✅ **Complete** | All sub-phases shipped. Tracks A/C/D + E/F/G/H/I merged. 74/74 tests pass; `npm run build` clean (main bundle 494 KB, down from 728 KB pre-sprint due to lazy-loaded chunks). Browser smoke pending. |
| **S3 — Differentiate** | 🟡 **In progress** | Tracks J–N shipped 2026-04-27 (Pandoc Word export + IDB compile leak fix + LanguagePill override + LaTeX preview + Table editor + Signature capture). 109/109 tests pass; build clean (535 KB main); API smoke clean (mock path verified). Browser smoke for 6 UI scenarios pending. |

---

## Sprint 1 — what shipped

All bug fixes, error registry, server hardening, accessibility, microcopy, deps, and tooling tasks are complete.

### Headline fix

**Silent take-photo/upload bug** — root cause was the abort/finish race in `runAction`. Fixed at [src/App.jsx](src/App.jsx) with token-based progress lifecycle: `startProgress` returns a token; `stopProgress`/`finishProgress` compare-and-clear by token; `runAction.finally` gates `finishProgress` on `!signal.aborted`. Companion fixes:

- `if (processing)` early-bail now toasts `"Still finishing previous action…"` instead of silently dropping.
- Empty/malformed JSON throws (was producing false-success toast).
- Errors no longer overwrite `session.text` — they land in `session.lastError` and surface as an inline retry banner that preserves the prior payload.

### New plumbing (substrate for S2/S3)

- **Error registry** at [src/errors/](src/errors/) — codes, log ring buffer, response/exception mappers, sink dispatcher (`installErrorSinks`).
- **Server-side mirror** at [server/errors.js](server/errors.js) + [server/sendError.js](server/sendError.js). Every route now emits `{ error: { code, message, hint } }` envelopes.
- **Toast.jsx** grew `severity` (info/warn/error/fatal), `action` chips, dismiss button.
- **InlineError.jsx** for in-pane error banners with retry chip.
- **DiagnosticsPanel.jsx** — `Shift+?` overlay showing the last 5 errors. Copy-details button bundles UA + URL.
- **`GET /api/_status`** + **MockBadge** in TopBar. Top bar shows `MOCK · email,drive,classroom` pill when subsystems are mocked.
- **Cancel** button in ProcessingStrip wired through `onCancel` prop on OutputColumn → `cancelRunning` in App.jsx.
- **ErrorBoundary** around RenderedDoc and WorksheetBuilder.
- **`window.unhandledrejection`** hook surfaces async failures.

### Server hardening

- 12 MB `express.json` cap.
- `helmet` + `hpp` + `express-rate-limit` (60 req/min global, 30 req/min on `/api/extract*`).
- Per-IP semaphore (5 concurrent uploads).
- `withTimeout` wraps `nodemailer.sendMail`.
- Drive query escape (`escapeDriveQ`); BiDi/RTL strip in `sanitizeDriveFilename` via `RegExp(string)` so source stays ASCII.
- Optional `OG_API_TOKEN` env var; when set, all `/api/*` routes (except `/api/_status`) require `X-OG-Token` header.
- Classroom mock now uses `res.on('close')` (was `req.on('close')`).

### Accessibility / UX polish

- `⌥T/⌥H/⌥B/⌥A/⌥M/⌥D/⌥S/⌥I` keydown handlers wired (chips were lying — they're real now).
- SessionList rows: Enter/Space activate, Delete/Backspace deletes; `aria-pressed` on active row.
- Skip-link to main canvas, `aria-live="polite"` on Toast.
- Top bar gets `padding-top: env(safe-area-inset-top)`.
- Compile-modal buttons enforced 44 px tap targets.
- Microcopy: UploadCard ("Drop a file or click to browse" / "Snap a photo"), UploadConfirmModal ("Use this image"/"Use this PDF"), OutputColumn pills ("Preview" / "Markdown" / "Worksheet"), ExportBar ("Print → PDF"), PromptDock placeholders.

### Frontend lifecycle / consistency

- `useMemo` + `useEffect` cleanup for blob URLs in SourcePreview + UploadConfirmModal.
- Toast timer in a ref so a new toast cancels any prior pending null-timer.
- PNG export wrapped in try/finally; on failure surfaces `EXP_SVG_BROWSER_LIMIT`.
- `sanitizeSvg` extracted to `src/svgSanitize.js` (was duplicated in 2 components).
- `NEXT_THEME` / `THEME_LABELS` consolidated into `src/theme.js`.
- `dotenv.config({ path: new URL('../.env', import.meta.url) })` in `scripts/list-models.js`.
- `list-models` script entry added to `package.json`.

### Dep + tooling hygiene

- `lucide-react` (dead) removed.
- `helmet`, `hpp`, `express-rate-limit` added.
- `vitest` + `@testing-library/react` + `@testing-library/dom` + `jsdom` + `prettier` added.
- `vitest.config.js`, `src/__tests__/setup.js`, three seed test files (`codes.test.js`, `errFromResponse.test.js`, `log.test.js`) — all 10 tests pass.
- `package.json` scripts: `format`, `test`, `test:watch`, `list-models`.
- `.prettierrc.json`, `.prettierignore` added.
- `.env` scrubbed of `OPENAI_API_KEY` (rotation deferred per user direction).

### Files added in S1

```
src/errors/codes.js
src/errors/log.js
src/errors/errFromResponse.js
src/errors/showError.js
src/components/InlineError.jsx
src/components/DiagnosticsPanel.jsx
src/components/MockBadge.jsx
src/components/ErrorBoundary.jsx
src/svgSanitize.js
src/theme.js
src/copy.js
server/errors.js
server/sendError.js
vitest.config.js
src/__tests__/setup.js
src/__tests__/codes.test.js
src/__tests__/errFromResponse.test.js
src/__tests__/log.test.js
.prettierrc.json
.prettierignore
```

### Files modified in S1

```
src/App.jsx                          (race fix, registry wiring, ⌥-keys, retry/cancel handlers, Diagnostics, ErrorBoundary, schema-v2 session migration)
src/components/Toast.jsx             (severity, action chips)
src/components/ProcessingStrip.jsx   (Cancel button, indeterminate-after-95)
src/components/OutputColumn.jsx      (inline error banner, pill copy, retry/cancel/dismiss props, images prop)
src/components/ExportBar.jsx         (registry-based error surfaces, mock disclosure, webViewLink hint)
src/components/UploadCard.jsx        (registry validation, multi-file detection, copy)
src/components/UploadConfirmModal.jsx (microcopy, button label)
src/components/SourcePreview.jsx     (blob URL pattern)
src/components/RenderedDoc.jsx       (sanitizeSvg import; native ImageGrid)
src/components/WorksheetBuilder.jsx  (sanitizeSvg import)
src/components/SessionList.jsx       (keyboard activation, useMemo, aria-pressed)
src/components/LibraryRail.jsx       (drop onUploadError prop)
src/components/MagicActions.jsx      (aria-label, aria-keyshortcuts)
src/components/PromptDock.jsx        (placeholder copy)
src/components/TopBar.jsx            (MockBadge, Diagnostics button, theme.js import)
src/index.css                        (toast/inline/mock badge/diagnostics/cancel/skip-link/safe-area styles + image grid)
scripts/list-models.js               (dotenv path + script entry)
server/index.js                      (express.json limit, helmet/hpp/rate-limit, semaphore, sendError, /api/_status, error envelope migration, BiDi strip, withTimeout email)
package.json                         (deps, scripts)
.env                                 (OPENAI_API_KEY scrubbed)
```

---

## Sprint 2 — what's done

### S2.1 ✅ Structured session images

- `runAction` no longer flattens `data.images` into a markdown blob with embedded base64. Schema v2 keeps `session.images = [{id, desc, data}]` and `session.text` is just the summary line.
- `RenderedDoc.jsx` has a native `<ImageGrid>` renderer that displays each image in a card with caption.
- `OutputColumn.jsx` passes `images={session?.images}` to `RenderedDoc`.
- `migrateSession` in [src/App.jsx](src/App.jsx) stamps `version: 2` on legacy sessions; `createNewSession` writes v2 by default.
- CSS for `.og-image-grid` / `.og-image-card-*` added to `src/index.css`.

### S2.2 ✅ Compile builder rebuild — **shipped**

- ✅ **`src/compile.js`** — pure data-model helpers:
  - `BLOCK_KINDS`, `createCompile`, `migrateCompile`, `addBlock`, `insertBlock`, `removeBlock`, `updateBlock`, `reorderBlocks`, `setPageSize`, `setName`, `setTheme`, `resolveSessionBlock`, `compileToMarkdown`, `compileToHtml`, `compileSummary`.
  - localStorage keys: `COMPILE_STORAGE_KEY = 'ogOCR_compiles'`, `ACTIVE_COMPILE_KEY = 'ogOCR_active_compile'`.
- ✅ **`src/components/CompileBuilder.jsx`** — 3-region layout (palette / canvas / inspector), Save .md / Save .html / Print → PDF actions, page-size + theme + header/footer settings.
- ✅ **`src/components/CompileBlockCard.jsx`** — per-block card with HTML5 DnD reorder + ↑↓ buttons, kind-aware inline editor (text/svg/image/page-break/session), and a print-only render path so the rendered output prints natively.
- ✅ **`src/components/CompilePalette.jsx`** — left rail with Compiles list (rename/delete), Sources list (sessions + per-image thumbnails, click-to-add), Insert rail for raw text/SVG/page-break blocks.
- ✅ **App.jsx integration** — `compiles` + `activeCompileId` state, debounced 400 ms persistence with `QuotaExceededError` circuit-breaker (mirror of sessions). `openCompiler` auto-creates a compile when first opened. `WorksheetBuilder.jsx` is no longer imported (file kept in tree until browser smoke confirms parity).
- ✅ **Print CSS** — `src/index.css` print rule extended to `.compile-page`; `.og-compile-block-printview` shown only in print so the editing chrome (textarea/inputs) is suppressed and prose/SVG/images render as static content.
- ✅ **Tests** — `src/__tests__/compile.test.js` adds 11 happy-path + regression tests (data-model, migration, HTML escape). Suite is now 21/21 pass (was 10/10).
- ⚠️ **Browser smoke not yet run** — Windows orphan-node-process gate (CLAUDE.md gotcha): `taskkill //F //IM node.exe` then `npm run dev`, then exercise the builder end-to-end (create compile, add session block, save .md, print preview).

### S2.2 — files added

```
src/components/CompileBuilder.jsx
src/components/CompileBlockCard.jsx
src/components/CompilePalette.jsx
src/__tests__/compile.test.js
```

### S2.2 — files modified

```
src/App.jsx                          (CompileBuilder import, compiles state + persistence + openCompiler, palette label, modal body swap)
src/index.css                        (compile builder layout + print rule extension to .compile-page)
```

---

## Tracks A / C / D — shipped

Plan file: `C:\Users\abc\.claude\plans\status-check-did-you-sparkling-biscuit.md`. Three parallel agents in isolated git worktrees off baseline `73dbd6a`; merged in order **A → D → C**. One trivial conflict on `OutputColumn.jsx` (mode-state declaration) resolved by hand; rest auto-merged.

| Track | Commit | Merge | Closes |
|---|---|---|---|
| **A — UX cleanup** | `f1c79dc` | `01ad117` | §1.3 #5/#6 (UploadConfirmModal default + long-press removed), §1.3 #7 (PromptDock hoisted to hero band above canvas), §1.4 (881–1080 px condensed dropzone, tablet-portrait collapsible source thumbnail strip), §S2.9 (`WelcomeModal.jsx` first-run, gated by `localStorage.ogOCR_first_run`, with inline base64 sample PNG) |
| **D — Refine row** | `17e9a70` | `645de21` | §4.7 (Summary / Bullets / Formal / Casual). New `REFINE_ACTIONS` in `magicActions.js`, refine row under `MagicActions.jsx`, new `RefinementTabs.jsx` rendered behind a 4th `Refine` pill (hidden until at least one refinement is populated), `runAction` refine branch posts a synthetic `text/plain` File so `/api/extract`'s multer validator passes without server changes. Schema bumped to v3 (no-op migration). |
| **C — Wire stubs** | `b3efd8a` | `b8b7db2` | §3.3 (Share→Link now `?session=<id>` deep-link via new `src/deepLink.js`; param resolved at module load and stripped via `replaceState`), §3.3 (`SourceTablets.jsx` deleted + `showTablets` prop chain removed), §3.3 (Classroom mock now returns parallel `info: {code: EXP_CLASSROOM_MOCK,…}` envelope so registry styling renders), §S2.6 (inline `RenameInput` next to file pill bound to `session.exportName`; export targets fall back to `filename` when blank), §S2.6 (`/api/save-drive` accepts optional `folderPath: 'a/b/c'` with auto-create + recursive `getOrCreateChildFolder`, capped at 8 segments; client gets folder-path input + recent-folders dropdown via new `localStorage.ogOCR_drive_recent`), §1.5 (inline busy state on Email/Drive/Classroom buttons replacing toast-only feedback). |

**Verification (post-merge):** `npm run lint` clean · `npm test` **44/44** (was 21 baseline; +14 deep-link, +9 refine) · `npm run build` clean (728 KB main bundle, no new warnings).

**Browser smoke:** still pending — Windows orphan-node-process gate (CLAUDE.md gotcha): `taskkill //F //IM node.exe` then `npm run dev`. Manual smoke list (run all five):

1. Drop a file → confirm modal opens by default → run text extract → see hero PromptDock above canvas.
2. Click Refine → Summary → 4th `Refine` pill appears with a populated `Summary` tab.
3. Rename file in pill → Save .md uses the new name. Save .html, JSON, Email, Drive, Print all should pick it up.
4. Open compile builder → add session block → Save .md → file downloads.
5. Click Share → Link → paste in fresh tab → that session activates and the URL strips back to clean.

**Out-of-scope deferral noted by Track C agent:** Live end-to-end Gemini call for the synthetic-file workaround in Track D (`text/plain` masquerading as a multer field). Static analysis suggests it's fine; if Gemini rejects in production the fallback is a one-line MIME swap to `image/png`.

**Worktrees + branches:** the three worktrees (`ogOCR-track-a`, `ogOCR-track-c`, `ogOCR-track-d`) and their branches will be cleaned up after browser smoke confirms parity. Until then they stay as a rollback path.

---

## Tracks E / F / G / H / I — shipped (S2 finish sprint)

Plan file: `C:\Users\abc\.claude\plans\analyze-code-base-thoroughly-virtual-thunder.md`. Five parallel agents in isolated git worktrees; Wave 1 (E, G, H, I) ran off baseline `e967276`, Wave 2 (F) ran off post-Wave-1 HEAD `5b2b695`. Merged in order **E → G → H → I → F**. One trivial conflict on `package-lock.json` (regenerated via `npm install`); rest auto-merged.

| Track | Commit | Merge | Closes |
|---|---|---|---|
| **E — IndexedDB image storage** | `3639d96` | `116e848` | CRIT-1 (geminitmp review): migrates `session.images[].data` Base64 strings out of localStorage and into IndexedDB via new `src/storage/idb.js` (`idb-keyval` + `fake-indexeddb` for tests). Schema bumped v3 → v4 with lazy on-mount migration. localStorage now stores `{id, desc}` per image only (~200 bytes/image vs. several KB). Adds `IDB_QUOTA`, `IDB_INIT_FAIL`, `IDB_MIGRATION_FAIL` codes. Cascading IDB cleanup on `deleteSession`. **Residual:** compile blocks of kind `image` added via "send to compile" still embed data URLs in `block.src` — flagged as a smaller-radius leak for follow-up. |
| **G — PDF preview (S2.5)** | `979c4df` | `82d2a37` | Lazy-loaded `pdfjs-dist@5.6.205` in `SourcePreview.jsx` and `UploadConfirmModal.jsx`. Worker config via `?url` dynamic import (no `vite.config.js` changes). Page 1 renders to canvas → cached as data URL. Graceful fallback to placeholder text if import fails. Bundle: pdfjs in own 405 KB lazy chunk; main bundle delta +2.82 KB. |
| **H — Compile export + share sheet (S2.3 + S2.6 + S2.7)** | `66aed40` | `1e609a2` | `ExportBar.jsx` collapses 9 flat buttons into 3 dropdown menus (**Save**: Drive / MD-or-SVG / Print → PDF · **Share**: Email / Classroom / Link · **Export**: Copy / PNG / JSON). Mobile FAB (≤880 px) calls `navigator.share()` with bottom-sheet fallback. Recent-folders dropdown is keyboard-navigable (↓/↑/Enter/Esc). Adds `EXP_SHARE_API_UNAVAILABLE` and `EXP_GENERIC` codes. **Note:** CompileBuilder Save .md / .html / Print were already wired pre-track; print stylesheet already covers `.og-compile-page` so no `.compile-page` rule was added. `compile.js` unchanged. |
| **I — UX surface polish (S2.8)** | `346814c` | `5b2b695` | Mermaid `Diagram` 4th pill in `OutputColumn.jsx` (visible when `kind === 'mermaid'` or fenced ` ```mermaid ` block detected); split textarea/preview lazy-loads `mermaid` with 300 ms debounced render. `LanguagePill.jsx` renders in `SourceColumn` head when `__detected_lang: <iso>` line is detected and stripped from rendered output (display-only MVP — override re-run deferred since it requires App.jsx changes). `ProcessingStrip` indeterminate stripe via transform-based `og-progress-march` keyframe (1.4 s linear). Bundle: mermaid lazy-loaded into ~40 chunks; main bundle dropped to 477 KB. Adds `OCR_MERMAID_RENDER_FAIL` code. |
| **F — Multi-file queue (S2.4)** | `ac21875` | `f7d03f2` | New `src/queue.js` (pure-JS pubsub sequential queue: `enqueue` / `cancel` / `cancelAll` / `subscribe` + AbortController plumbing). `QueueRail.jsx` (inline `<style>`, no `index.css` touch) renders in `LibraryRail` when ≥1 pending. `UploadCard` multi-drop branches: 1 file → existing path, 2–20 → enqueue, >20 → reject with new `QUEUE_OVERFLOW` code. Server: `multer.array('files', 20)` on `/api/extract`, `/api/sketch-to-svg`, `/api/extract-images` with 200 MiB aggregate cap (20 × 10 MiB). Backward compat preserved via `pickUploadedFile(req)` helper. App.jsx queue runner does NOT delegate to `runAction` (state ownership conflict) — it creates a fresh session per item and writes via `updateSession`. |

**Verification (post-merge final):** `npm run lint` clean · `npm test` **74/74** (was 44 baseline; +30 across all five tracks) · `npm run build` clean — main bundle **494 KB** (was 728 KB pre-sprint; the drop is real, driven by lazy-loading mermaid/pdfjs/etc into separate chunks rather than bundling them eagerly) · `npm run dev` boots cleanly (Vite ready in 171 ms; Express on :3001; `/api/_status` returns 200).

**Browser smoke (run after `taskkill //F //IM node.exe && npm run dev`):**

1. **Multi-file (Track F):** drop 5 images + 1 PDF on UploadCard → all 6 enqueue, extract sequentially, `QueueRail` shows per-row progress + cancel; cancel-all works.
2. **PDF preview (Track G):** drop a PDF → UploadConfirmModal shows page-1 thumbnail; after import, SourcePreview shows page 1.
3. **IndexedDB (Track E):** extract images → reload page → images still render. DevTools → Application → Local Storage → `ogOCR_sessions` should NOT contain `data:image/png;base64,…` strings.
4. **Compile export (Track H):** open compile builder → add 2 session blocks + 1 text block → Save .md downloads, Save .html downloads (self-contained inlined images), Print → PDF prints with paginated blocks.
5. **Share sheet (Track H):** desktop ExportBar shows 3 dropdown menus (Save/Share/Export), keyboard-navigable. Resize ≤880 px → single FAB triggers `navigator.share()` (or bottom-sheet fallback when the API is missing).
6. **UX polish (Track I):** paste a fenced ` ```mermaid ` block in source → Diagram pill renders SVG; non-English doc shows LanguagePill with detected lang; mid-extract progress stripe goes indeterminate after 95%.

**Worktrees + branches:** the five worktrees (`ogOCR-track-e`, `-f`, `-g`, `-h`, `-i`) and their branches stay as rollback path until browser smoke confirms parity. The earlier Track A/C/D worktrees from the prior sprint are still on disk and can be cleaned up at the same time.

**Carryover for next sprint (Sprint 3):**

- Compile `block.src` data-URL leak (smaller-radius IDB residual flagged by Track E)
- LanguagePill **override re-run** (Track I deferred MVP — needs App.jsx hook)
- Live LaTeX preview, table → spreadsheet block, voice annotation, page-to-section auto-grouping, signature capture, pen/stylus markup, per-token confidence heatmap, real PDF export (puppeteer)
- Phase 13 design migration sub-phases 13.3–13.9

---

## Tracks J / K / L / M / N — shipped (S3 start sprint)

Plan file: `C:\Users\abc\.claude\plans\brainstrom-how-to-execute-tidy-tome.md`. Five parallel agents in isolated git worktrees, all branched off baseline `12edc59`. Merged in order **K → L → M → J → N**. Two trivial conflicts hand-resolved (`RenderedDoc.jsx` between L and M; `ExportBar.jsx` between J and N). One post-merge cleanup committed for Track J's stub removal + MockBadge filter update.

| Track | Commit | Merge | Closes |
|---|---|---|---|
| **K — Data-URL leak fix + LanguagePill override** | `31affdd` | `475806b` | Compile `block.src` data-URL leak (S2 carryover from Track E review): `COMPILE_SCHEMA_VERSION` bumped to **2**; `migrateCompileImagesToIDB` offloads `data:` URIs in compile image blocks to IndexedDB via `cimg_*` keys (separate keyspace from session images); `block.src` becomes `idb:cimg_<id>` ref. New exports `hydrateCompileImages` (async, JSON-serializable resolver for export paths) + `resolveCompileImageObjectUrls` (async, object-URL resolver for in-memory render). `compileToMarkdown`/`compileToHtml` log warning + emit `[Image not loaded]` fallback if any `idb:` ref slips through unhydrated. App.jsx wires async post-mount migration mirror of Track E's session-image flow. **LanguagePill override re-run** (S2 carryover from Track I MVP): pill now renders a click-to-open dropdown of 7 languages; selection dispatches a `og:language-override` window CustomEvent → App.jsx listener re-runs `runAction(actionId, undefined, { languageOverride: lang })`; the wrapped prompt is composed via new `LANGUAGE_OVERRIDE_PROMPT(basePrompt, lang)` helper in `magicActions.js` (prepends `"Treat the document as written in <name>…"`, appends `__detected_lang:` directive). Override-active state propagated via a module-level signal store (`publishLanguageOverrides`) consumed via `useSyncExternalStore` (couldn't thread props through SourceColumn — out of scope for K). +11 tests. |
| **L — Live LaTeX preview block** | `102b9d8` | `730e19c` | Sprint 3 §3.1: new `EquationBlock.jsx` split-pane (textarea ↔ KaTeX live preview, reuses already-bundled `react-markdown` + `remark-math` + `rehype-katex` stack with `throwOnError: false`). New `Equation` pill in `OutputColumn.jsx` pill bank, visible only when `session.kind === 'math'` (sibling to `Preview/Markdown/Worksheet/Refine/Diagram`). `RenderedDoc.jsx` widened with optional `onChangeText` prop and a top-level `if (mode === 'equation')` early return that bypasses the markdown render path. `compile.js` gets `BLOCK_KINDS.EQUATION = 'equation'` + `case BLOCK_KINDS.EQUATION:` in `compileToMarkdown` that wraps body in `$$ … $$` (idempotent — already-wrapped passes through). +6 tests. **Note:** no CSS shipped (`src/index.css` was K-N's territory, not L's; the new `og-equation-*` class names render functional but unstyled — the layout falls back to default block flow). Carryover: small CSS pass to mirror existing `og-mermaid-editor` rules. |
| **M — Editable table block** | `e1825e6` | `4efacc5` | Sprint 3 §3.2: new `TableBlock.jsx` with `contentEditable` cells (no extra dep), toolbar (`Sort A→Z` / `Sort Z→A` / `Add row` / `Add col` / `Export CSV` / `Export XLSX`). Inline `<style>` block (CSS sandboxed in component because `src/index.css` was out of scope, mirroring Track F's `QueueRail.jsx` precedent). `RenderedDoc.jsx` swaps the first `<table>` rendered by `react-markdown` for `<TableBlock>` via a `buildMdComponents(tableData)` factory (subsequent tables fall back to default styled `<table>`). `papaparse@^5.5.3` added to deps (~25 KB to main bundle); `xlsx@^0.18.5` added but **lazy-loaded** via dynamic `import('xlsx')` only when the user clicks `Export XLSX` — verified as a 425 KB separate chunk in build output. +8 tests. **Note:** `xlsx` package surfaces 1 high + 5 moderate npm-audit vulnerabilities (community-edition CVEs); attack surface limited to user-initiated XLSX export of their own documents. Carryover: evaluate `exceljs` or SheetJS pro CDN if the security exposure expands. **Note:** `TableBlock` accepts `onChange` but `RenderedDoc.jsx` doesn't yet pass one — edits live in component-local state until App.jsx is wired (out of scope for M). |
| **J — Word export via Pandoc** | `ed56ff5` | `8f15ce8` (+ `7eb9a7d` post-merge cleanup) | NEW-W: new `POST /api/export-docx` Express route. Boot probe `pandoc --version` runs once at startup and caches `PANDOC_AVAILABLE`; `[pandoc] not installed — DOCX export will mock` (or `[pandoc] available pandoc <version>`) is logged. `GET /api/_status` extended with `docx: 'real' \| 'mock'`. Mock path returns 503 `{ error: { code: 'EXP_DOCX_NO_BINARY', message, hint } }` envelope. Real path: `child_process.spawn(pandocPath, [tempIn, '-f', 'markdown+tex_math_dollars+raw_html', '-t', 'docx', '-o', tempOut], { shell: false })` — temp files in `os.tmpdir()` with `crypto.randomBytes(8).toString('hex')` suffix; cleanup in `try/finally`; 30s `withTimeout` (matches Drive). Filename sanitized via `sanitizeDriveFilename` and used **only** in `Content-Disposition` (never in pandoc args). Frontend: `Save .docx` button in `CompileBuilder.jsx` header next to `Save .md`/`Save .html` (calls `await hydrateCompileImages(activeCompile)` → `compileToMarkdown(...)` → `exportDocx(...)`); `DOCX` entry in per-session `ExportBar.jsx` Save menu. New `src/exportDocx.js` client helper. New `EXP_DOCX_*` codes (4) in `src/errors/codes.js` mirrored in `server/errors.js`. +6 tests. **Post-merge cleanup commit `7eb9a7d`:** removed `REMOVE_AT_MERGE` stub (`const hydrateCompileImages = (c) => c;`) from CompileBuilder.jsx and replaced with real import from `../compile`; added `await` to the call site (K's helper is async); added `'docx'` to MockBadge filter array so the top bar pill includes it. |
| **N — Signature capture** | `57e279c` | `82f78b6` | Sprint 3 §3.5: new `SignatureModal.jsx` full-screen modal with HTML5 canvas + Pointer Events draw surface (works for mouse / finger / Apple Pencil via `pointerType==='pen'`). Three actions: `Clear`, `Save signature`, `Insert into document`. Library row of stored signature thumbnails (cap 5; 6th save → `SIG_LIBRARY_FULL` toast). Persistence: `localStorage.ogOCR_signatures` stores `[{id, svg, createdAt}]`; `QuotaExceededError` surfaces `SIG_QUOTA`. New `Sign and save` entry in per-session `ExportBar.jsx` Save menu opens the modal; on insert the SVG is appended to the active session's text (via local `textOverride` state + direct localStorage write — App.jsx and OutputColumn.jsx were out of scope, so the source pane only updates after page reload; all ExportBar export paths see the change immediately). New `src/signatureLib.js` helper module (extracted to satisfy `react-refresh/only-export-components` lint rule). `src/index.css` adds `.og-signature-*` classes + `@media (max-width: 880px)` bottom-sheet variant. New `SIG_*` codes (2) in `src/errors/codes.js`. +4 tests. Carryover: 1-line `OutputColumn.jsx` change to forward `onUpdateSession` into `<ExportBar>` would let the source pane update live (currently waits for reload). |

**Verification (post-merge final):** `npm run lint` clean · `npm test` **109/109** (was 74 baseline; +35: K +11, L +6, M +8, J +6, N +4) · `npm run build` clean — main bundle **535 KB** (+41 KB / +8.3% from 494 KB baseline; well under +30% gate). Build-warning at 500 KB chunk-size limit is informational; lazy chunks (mermaid, pdfjs, xlsx, cytoscape, katex) keep things split.

**API smoke (manager-run, post-merge):**
- `GET /api/_status` returned `{"gemini":"real","email":"mock","drive":"mock","classroom":"mock","docx":"mock","auth":"open",...}` ✓
- `POST /api/export-docx` with `{markdown:"# Hello", filename:"test.docx"}` returned **HTTP 503** + `{"error":{"code":"EXP_DOCX_NO_BINARY","message":"Word export is in mock mode.","hint":"Install pandoc on the server to enable real Word export."}}` ✓
- Server boot log shows `[pandoc] not installed — DOCX export will mock` ✓ (pandoc is not installed on this host; install pandoc to flip docx to real path)

**Browser smoke pending (run after `taskkill //F //IM node.exe && npm run dev`):**

1. **Word export — real path** (requires `pandoc` install): open compile builder → add 1 session block + 1 text block with `$\sqrt{2}$` math + 1 image block → click **Save .docx** → opens in Word with native equation editor object + embedded image. Repeat from per-session ExportBar **Save → DOCX**.
2. **Word export — mock path** (already API-verified): open the app — top bar should show `MOCK · email,drive,classroom,docx` chip → click any Save .docx → toast `EXP_DOCX_NO_BINARY` (info severity) with hint about installing Pandoc.
3. **Compile data-URL leak fixed:** open a compile with image blocks → reload → DevTools → Application → Local Storage → `ogOCR_compiles` value contains **no `data:image/…;base64,…` strings** (refs like `idb:cimg_…` only). Images still render in the canvas.
4. **LanguagePill override:** extract a non-English doc → LanguagePill shows detected lang → click → dropdown opens → pick "French" → action re-runs with override prompt; new result lands; pill updates to `(override)`.
5. **Live LaTeX preview:** run `Extract math` on a math image → `Equation` pill appears next to `Preview/Markdown/Worksheet` → click → split textarea ↔ KaTeX render; edit `\sqrt{2}` → `\sqrt{3}` → render updates live. Note: layout will be unstyled (no CSS shipped per L's report).
6. **Table editor:** extract from a doc with a markdown table → editable grid renders; click `Sort A→Z` → rows sort; click `Add row` → blank row appended; click `Export CSV` → `.csv` downloads; click `Export XLSX` → lazy chunk loads, `.xlsx` downloads.
7. **Signature capture:** click ExportBar **Save → Sign and save** on any session → modal opens; draw with mouse → `Save signature` (now in library); `Insert into document` → modal closes (source pane updates after page reload — see N's carryover); `Save .md` includes the SVG. Try saving 6th signature → toast `SIG_LIBRARY_FULL`. Resize to ≤880 px → modal renders as bottom sheet.

**Worktrees + branches:** the five worktrees (`ogOCR-track-j` through `-n`) and their branches stay as rollback path until browser smoke confirms parity. The Track A/C/D and E–I worktrees from prior sprints are still on disk and can be cleaned up at the same time once everything is confirmed.

**Carryover for next sprint (Sprint 3 follow-up):**

- **Track L CSS** — ship `og-equation-*` styles in `src/index.css` mirroring `og-mermaid-editor` patterns (split-pane layout, label, textarea, preview pane). Touches `src/index.css` only.
- **Track M `onChange`** — wire `<TableBlock>` `onChange` callback through `RenderedDoc.jsx` → `OutputColumn.jsx` → App.jsx so cell edits persist back into `session.text`. ~3 file edits.
- **Track N source-pane visibility** — 1-line `OutputColumn.jsx` change to forward `onUpdateSession` into `<ExportBar>` so signature insert updates the source pane live (currently waits for reload).
- **Track K LanguagePill** — when SourceColumn is next touched, thread `onOverride` and `sessionId` props through and remove the CustomEvent + signal-store fallback in LanguagePill.jsx. Also consider lifting the module-level signal store to a new `src/components/languagePillStore.js` to remove the `eslint-disable react-refresh/only-export-components` comment.
- §3.3 Voice annotation, §3.4 Auto-grouping, §3.6 Pen/stylus markup, §3.7 Per-token confidence (blocked on Gemini logprobs), §3.8 Real PDF export via puppeteer (300 MB install gate behind `PDF_ENGINE=puppeteer`), §3.9 Final polish (CSS-only band fix, action-tile prioritization, filename auto-suggestion).
- Phase 13.3–13.9 design migration sub-phases.
- `xlsx` package CVEs — evaluate `exceljs` or SheetJS pro CDN swap.
- Real Classroom OAuth integration; browser idle-connection cap fix (job-queue pattern); API key rotation.

---

## Verification baseline (run before resuming)

```bash
npm run lint   # should pass clean
npm run test   # should pass 10/10 (codes, log, errFromResponse)
npm run dev    # vite on :3000 (or :3002 if busy), express on :3001
```

Manual smoke:

```bash
curl -s http://localhost:3001/api/_status
curl -s -X POST http://localhost:3001/api/email -H 'Content-Type: application/json' -d '{"email":"bad"}'
curl -s -X POST http://localhost:3001/api/save-drive -H 'Content-Type: application/json' -d '{"text":"hi","filename":"test.md"}'
```

Expected (post-S1):
- `/api/_status` → `{"gemini":"real","email":"mock","drive":"mock","classroom":"mock","auth":"open",...}`.
- Bad email → `{"error":{"code":"EXP_EMAIL_BAD_RECIPIENT","message":"Invalid email address.","hint":"Check the spelling."}}`.
- Mock Drive → `{"success":true,"mock":true,"message":"(Mock) Saved test.md..."}`.

Race-regression check: rapid double-click any tile after upload — second click toasts `"Still finishing previous action…"` and the in-flight progress strip stays visible (was disappearing 220 ms after click).

---

## Risks / known issues

- **`puppeteer` adds ~300 MB** if S2.3 takes the server-side PDF path. Gate behind env var — don't blanket-install.
- **`pdfjs-dist`** for S2.5 is large; CLAUDE.md warns against re-adding it. Restrict to the *preview* code path only — never use it on the upload side.
- **Schema migration on read** — when adding fields to compiles in S3 (e.g. `block.images`, voice notes), bump `COMPILE_SCHEMA_VERSION` in `src/compile.js` and update `migrateCompile`.
- **Test coverage is minimal** — only error registry has tests. Each S2/S3 feature should add at least one happy-path + one regression test.
- **CompileBuilder modal** currently still uses the legacy `WorksheetBuilder.jsx` (58 lines). Don't delete it until `CompileBuilder.jsx` is rendering at parity, otherwise the Compile pill breaks.

---

## Quick reference — useful file paths

- Plan: `C:\Users\abc\.claude\plans\we-will-work-on-fuzzy-teacup.md`
- Audit: [REVIEW_REPORT.md](REVIEW_REPORT.md)
- Compile data model (ready for use): [src/compile.js](src/compile.js)
- Error registry (ready for new codes): [src/errors/codes.js](src/errors/codes.js)
- Server error mirror: [server/errors.js](server/errors.js)
- Architecture overview: [CLAUDE.md](CLAUDE.md)
