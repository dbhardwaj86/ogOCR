# CLAUDE.md

> **🔁 Resuming work? Read [SESSION_HANDOFF.md](SESSION_HANDOFF.md) first** — start with the **Latest pass — Surface-Trim + Polish sprint (2026-04-27)** section at the top.
>
> That file is the living index of every multi-step pass: what shipped, what's pending, what to verify next. The architecture notes below stay accurate, but anything about active or recently-shipped work belongs in the handoff.

## Latest changes (2026-04-27 — Surface-Trim + Polish, plus four prior sprints stacked: v4 Schema + Unified Save, Auto-Compile + Multi-SVG Export, Multi-Sketch Detection, Ship Cleanup)

These differ from the architecture notes below; if there's a conflict, this section wins:

- **Action surface trimmed to 6 tiles** (was 8). Diagram → Mermaid (`mermaid` action), Extract Images (`images` action), and the entire Refine row (`refine-summary` / `refine-bullets` / `refine-formal` / `refine-casual`) were removed in the 2026-04-27 surface-trim sprint. Server route `/api/extract-images` is gone. `mermaid` npm dep is gone. `MermaidEditor` + `detectMermaidBlock` are gone from `RenderedDoc.jsx`. `RefinementTabs.jsx` is deleted. The Diagram and Refine pills no longer appear in `OutputColumn`. Reasoning: the four Refine variants were trivially reproducible via the custom prompt in PromptDock; Mermaid had little real-world OCR utility; Extract Images was replaced by the new client-side raster export below. **Compile.js still keeps `auto:image:*` and `auto:refinement:*` role logic** so legacy v3/v4 sessions hydrate cleanly — those code paths just never produce new entries on fresh sessions.
- **Save picker now offers raw-image / PDF-page raster exports.** [`src/exportRaster.js`](src/exportRaster.js) gained `rasterFromImage(file, opts)` and `rasterPdfPages(file, { format, pageScale, baseFilename, onProgress })` (the latter dynamic-imports `pdfjs-dist` — already cached from the SourcePreview / UploadConfirmModal preview path — and walks every page at 2× scale, downloading sequentially with a 60ms breather to dodge Chromium dedup). [`saveFormats.js#buildSessionFormats`](src/saveFormats.js) now accepts `file` + `pdfPageCount` + `onPageProgress`; surfaces **Original as PNG / JPG** for image uploads and **All pages as PNG (N) / JPG (N)** for PDFs. ExportBar lazily probes the PDF page count on file change and displays per-page progress (`Saving page 3 of 12…`). Save button enables when a file is present even pre-extraction.
- **Vectorize batch is now abortable, and gates the rest of the UI.** `vectorizeAllSketches` runs through a new `processing` slot keyed `actionId: 'sketch-batch'` (single-sketch uses `'sketch'`); since `runAction` already early-returns with OCR_BUSY when `processing` is truthy, magic-action tiles, custom-prompt run, and palette triggers are all blocked during a vectorize. `App.jsx` adds two refs: `batchAbortRef = { cancelled: bool }` (the for-of loop checks it between iterations) and `vectorizeAbortRef` (an AbortController so the in-flight `/api/sketch-to-svg` fetch is interrupted, not just the queue). SketchesPicker swaps "Vectorize All" → "Stop (N left)" while a batch runs. ProcessingStrip's existing Cancel slot is wired in OutputColumn (`onCancel={processing ? onCancel : null}`); App's `cancelRunning` switches between abortRef / vectorizeAbortRef / batchAbortRef based on `processing.actionId`. Aborted sketches reset `status: 'pending'` so per-card Retry resumes one at a time.
- **Honest progress UI.** `processing.startedAt` is now stamped in both `startProgress` and the new `startVectorizing` helper. ProcessingStrip drops the lying bar at the 95% cap and shows `still working · 0:42 elapsed · large PDFs may take 1–3 min`, with the percentage display swapping to elapsed time. The interval lives in the strip; the value is set via `setInterval` only (never sync inside an effect body — react-hooks lint enforces this).
- **OS-aware modifier key.** New [`src/platform.js`](src/platform.js) exports `modKeyLabel(letter)` → `⌘K` on Mac, `Ctrl K` elsewhere. TopBar uses it instead of the hardcoded `⌘ K`. The keyboard handler still binds both `metaKey` and `ctrlKey` regardless of platform.
- **Serif font swap: STIX Two Text → Fraunces** (variable, opsz 9..144, wght 400..700). The design handoff had specified Fraunces all along; the CSS was loading STIX. Updated the Google Fonts import line and `--serif` token. h1 / og-source-name / brand wordmark / og-rendered prose all flip to Fraunces.
- **Output column polish.** Mode pill renamed `Markdown` → `Source` (the existing label was misleading — that pill is the editable raw view, not a format). The **Worksheet** button is no longer a pill in the same row; it lives in a new `og-output-tools` group with a labelled button so users don't mistake it for a peer view-switcher. The filename rename input is now a click-to-edit display button with a pencil glyph that fades in on hover/focus.
- **Accessibility.** New `:focus-visible` rings (2px indigo, 2px offset) on every interactive token: `.og-pill`, `.og-tile`, `.og-session`, `.og-kbd-btn`, `.og-theme-cycle`, `.og-output-worksheet-btn`, `.og-output-rename-display`, `.og-export-menu-btn`, `.og-export-btn`, `.og-sketches-batch`, `.og-proc-cancel`, `.og-btn-primary`, `.og-btn-ghost`. Global `@media (prefers-reduced-motion: reduce)` block at the bottom of `index.css` kills scan line, sketch pulse, spinner rotation, toast slide, and tile lift; functional transitions stay.
- **Test count: 219 passing across 26 files** (was 239 / 28 before the surface trim — net -20 from the deleted `mermaid.test.js` and `refine.test.js`). Lint and build green.


### Prior sprint context (still load-bearing for compile / sketch / extract paths)

- **Compile schema is v4** (was v3): auto blocks are now action-keyed — `auto:text:<actionId>` / `auto:svg:<actionId>` — so re-running a *different* magic action accumulates its output as a new worksheet block instead of overwriting the prior action's. The new `session.outputs` map (populated in `runAction`) is what `syncAutoBlocks` reconciles against. v3 legacy `auto:text` and `auto:svg:main` blocks **demote to `role: 'manual'`** on migrate so existing compiles keep their content as historical snapshots.
- **Unified Save picker** — `src/saveFormats.js` is shared by per-session `ExportBar.jsx` and `CompileBuilder.jsx`. `saveOrShare()` routes File payloads through `navigator.share()` when available, falls back to download. ExportBar lost its 3 dropdowns (Save / Share / Export → single Save button) and the Drive / Email / Classroom buttons — those routes are still server-mocked but no longer surface in the UI. **MockBadge filters `docx` only.**
- **`src/exportRaster.js`** is the SVG → PNG/JPG raster pipeline extracted from ExportBar — the picker, compile builder, and any future surface reuse it through one helper.
- **`SourceColumn`'s signature insert** now uses canonical `onUpdateSession` (threaded from App) instead of a localStorage round-trip + page reload. Source pane updates live on Insert.
- **v3 introduced per-source auto-compiles** — every compile has a `sourceId` (`null` = manual cross-source, session-id = auto-managed) and every block a `role` (`'manual'` or `auto:*`); `syncAutoBlocks(compile, session)` runs on every extraction completion (`runAction`, `vectorizeSketch`, queue runner, `openSketch`, `showAllSketches`), preserves every distinct vectorized sketch as its own block, never touches manual blocks, never reorders. **v4 (above) generalizes the per-action auto-block keying atop that.** Worksheet button opens the source's auto-compile (creates if missing); compiles cascade-delete with their session. Palette splits **By source** (auto badge) from **Manual**. `vectorizeSketch` reads via prev-from-updater so `vectorizeAllSketches`'s sequential loop syncs the freshest state.
- **Multi-SVG raster export** — `exportRaster(svg, { format, filename, quality })` supports PNG + JPG. `src/svgExports.js` deduplicates main vs. focused-sketch SVG. UI shows **All as PNG (N)** / **All as JPG (N)** when N > 1; sequential downloads with a 60ms breather to dodge Chromium dedup.
- **Non-destructive sketch open** — `openSketch` no longer wipes `session.sketches[]` when promoting a sketch to the main canvas. `OutputColumn` renders **← Show all sketches (N)** in the focused-view header when `session.sketches.length > 0`; click returns to the picker with all vectorized SVGs intact.
- **`/api/sketch-to-svg` is polymorphic on `req.body.bbox`** (Phase 15). No bbox → discovery mode: JSON-mode prompt returns every detected sketch. 0 found → `OCR_NO_SKETCH_FOUND`. 1 found → auto-vectorize, returns `{svg}` (back-compat). 2+ found → returns `{sketches:[{id, description, bbox, page, thumbnail?}]}` and the frontend renders a picker. With a bbox, server crops (image) or prompt-hints (PDF) and returns `{svg}` for that one region. Session schema v5 adds `sketches` + `selectedSketchId`. Frontend helpers in `src/App.jsx`: `vectorizeSketch(id)`, `vectorizeAllSketches()`, `openSketch(id)`, `showAllSketches()`. Picker UI in `src/components/SketchesPicker.jsx` rendered when `mode === 'sketches'`.
- **`npm start`** now serves the built `dist/` + the API on a single port — production hosting path. `npm run dev` still does the dual Vite + Express dance for local development.
- **PDFs route through Gemini Files API.** `server/geminiUpload.js` exposes `buildGeminiUploadParts(file, { fileManager })` — PDFs upload once, get a `fileUri`, are cleaned up after generateContent. Images still go inline base64. The `generateContentFromUpload(model, prompt, file)` helper in `server/index.js` is the single entry point.
- **`xlsx` was replaced by `exceljs`** in `src/components/TableBlock.jsx` (still lazy-imported on the export click).
- **EADDRINUSE now fails loud** — `server.on('error', ...)` exits code 1 with a clear message instead of the silent-exit-while-Vite-stays-up bug documented in the Gotchas section.
- **Test runner exists** — Vitest. `npm test` is the canonical command. Architecture note below saying "There is no test runner" is wrong; ignore it (the suite is at **216 passing** across 27 files).

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**ogOCR** — a Notion-inspired single-file OCR/extraction app. React + Vite frontend, small Express backend, Google Gemini for vision. Accepts one image or PDF at a time, sends it as base64 `inlineData` to Gemini, returns Markdown / LaTeX / Mermaid / SVG depending on the action chosen.

## Commands

- `npm run dev` — runs Vite and the Express API together via `concurrently`. The only command you normally need.
- `npm run build` — Vite production build into `dist/`.
- `npm run preview` — serve the built bundle.
- `npm run lint` — ESLint. The config has separate rule blocks for browser code (`src/**`) and Node code (`server/**`, `scripts/**`); if you add a new top-level directory, mirror the pattern.
- `node scripts/list-models.js` — sanity script that lists available Gemini models for the configured `GEMINI_API_KEY`. Useful when extraction starts returning 404s.

- `npm test` — Vitest. The canonical test command. Suite is at **216 passing** across 27 files as of 2026-04-27.

There is no TypeScript.

## Architecture

### Process / port topology
Two processes started by the single `npm run dev`:
- Vite dev server serving `index.html` + the React app — port set in `vite.config.js`.
- Express server `server/index.js` — port set at the top of that file.

**Both servers bind `0.0.0.0` and surface LAN URLs on startup** so the app can be reviewed from a phone or another device on the same network. Vite achieves this with `server.host: true`; Express logs `http://<lan-ip>:<port>` for every non-loopback IPv4 interface via `os.networkInterfaces()`. This is intentional, not a security oversight — see the `feedback_lan_accessible_dev_servers` memory.

Vite proxies `/api/*` to the Express loopback. **The proxy target uses `127.0.0.1` literally, not `localhost`** — IPv6 routing on Windows otherwise produces `ERR_CONNECTION_RESET`. This is already baked into `vite.config.js`; preserve it. Both ports live in those two config files; don't repeat the numbers elsewhere.

CORS on Express allows loopback, RFC 1918 LAN ranges (`10.x`, `172.16–31.x`, `192.168.x`), and `*.local` mDNS hostnames by default — set `CORS_ORIGIN` to override (`*` allows all, any other string is matched exactly).

### Layout
The frontend is a three-pane workspace inside an `og-app` shell:
- **Top bar** (`TopBar.jsx`) — wordmark, session/model meta, theme cycle (Paper / Sepia / Ink), `⌘ K` button (the kbd is now a real button so it's tappable on phones; pass `onPaletteOpen` from `App.jsx`).
- **Library Rail** (`LibraryRail.jsx`) — `UploadCard.jsx` drop target + `SessionList.jsx` history.
- **Source Column** (`SourceColumn.jsx`) — file preview (`SourcePreview.jsx`), optional metadata tablets (`SourceTablets.jsx`, hidden by default), and the 8 magic-action tiles (`MagicActions.jsx`).
- **Output Column** (`OutputColumn.jsx`) — three pills (Rendered / Source / Compile), `ProcessingStrip.jsx`, the canvas (`RenderedDoc.jsx` for markdown+SVG, `SourceDoc.jsx` for editable raw view), `ExportBar.jsx`, and `PromptDock.jsx` for free-form Gemini prompts.

Cross-cutting: `CommandPalette.jsx` (⌘K), `Toast.jsx`, `MobileTabs.jsx` (only visible ≤880px), and a `WorksheetBuilder.jsx` rendered inside an in-app modal when the Compile pill is clicked.

### Responsive layout
- **>1280 px**: full three-pane (300 px rail + source + output).
- **881–1280 px**: tighter padding; at 881–1080 the rail collapses to a 56 px icon-only strip with desktop-style three-pane still intact.
- **≤880 px** (phone portrait, phone landscape, tablet portrait): single-pane mode driven by `mobilePane` state in `App.jsx` (`'library' | 'source' | 'output'`). `MobileTabs` (`01 LIBRARY · 02 SOURCE · 03 OUTPUT`) renders below `TopBar`; CSS uses `[data-mobile-pane]` on `.og-main` to hide the two non-active panes. **Initial value** is contextual: output if active session has content, else source if a session exists, else library. **Auto-flips**: → `'source'` after upload, → `'output'` immediately on action start (so the user sees the processing strip + percentage instead of staring at the source pane). Top bar collapses (hides session/model meta + the "command" label, wordmark stays).
- The 1080-px and 880-px desktop-narrow rules are scoped `(min-width: 881px)` so they don't double-apply on phones.

### The 6 magic actions
The action table is the wire-compat contract with the backend and lives in `src/magicActions.js`. Each entry pins an `id`, `endpoint`, and `prompt` (or `null` for endpoint-driven actions). The redesign-only fields (`group`, `glyph`, `hint`, `key`) are presentation-only — never change `id`/`prompt`/`endpoint` without coordinating with `server/index.js`. Current set: `text`, `handwriting`, `table`, `actions`, `math`, `sketch`. (Mermaid `diagram`, `images`, and the four `refine-*` actions were removed in the 2026-04-27 surface-trim sprint — see Latest changes above.)

### Request lifecycle (the part that spans files)
1. `UploadCard.jsx` accepts a single `image/*` or `application/pdf` (validated client-side: type + 10 MiB cap) and lifts the `File` into `App.jsx`. A new session is created immediately on upload (filename, `kind: 'text'`, empty `text` and `svg`).
2. The user clicks a magic-action tile or types a custom prompt in `PromptDock.jsx`. `App.jsx#runAction(actionId, customPromptOverride?)` looks up the action in `MAGIC_ACTIONS`, then POSTs `FormData(file, prompt)` to the action's endpoint with an `AbortController` that cancels any prior in-flight request.
3. Around the fetch, `App.jsx` runs a faked progress simulation (`startProgress` / `finishProgress`) that drives the `ProcessingStrip` and the scan-line overlay in `SourcePreview`. Progress caps at 95 % until the response lands.
4. The backend uses `multer.memoryStorage()` with a hard upload-size cap (see `MAX_UPLOAD_BYTES` in `server/index.js`), base64-encodes the buffer into a Gemini `inlineData` part, and returns one of three response shapes: `{ text }`, `{ svg }`, or `{ images: [...], message }`. `App.jsx#runAction` branches on which key is present and writes into the active session via the setSessions callback (so deletions mid-flight are no-ops, not crashes).

### Per-endpoint Gemini model split
The code uses different models per endpoint:
- `/api/extract` → `gemini-2.5-flash` (cheap path for the common "give me text" case).
- `/api/sketch-to-svg` → **two model calls** (Phase 15): first a `gemini-2.5-pro` JSON-mode discovery pass to enumerate every sketch in the doc (`{description, boundingBox, page}`), then a `gemini-2.5-pro` SVG-mode vectorize pass per sketch the user picks. Discovery is automatic on every upload; if exactly 1 sketch is found, the vectorize call fires immediately and the route returns `{svg}` (back-compat). 2+ sketches → returns `{sketches:[...]}` and the user vectorizes them lazily via `vectorizeSketch(id)` from `App.jsx` (each one calls back into `/api/sketch-to-svg` with `bbox` + `page` form fields, with an AbortController on `vectorizeAbortRef`). The SVG-mode response is fence-stripped for stray ` ```svg ` wrappers. **`vectorizeAllSketches` is interruptible**: a `batchAbortRef = { cancelled: bool }` flag is checked between iterations of the for-of loop, so Cancel both aborts the in-flight fetch AND prevents the next sketch from dequeuing.
- ~~`/api/extract-images`~~ — **removed** in the 2026-04-27 surface-trim sprint. Image extraction is now client-side via the Save picker's `Original as PNG / JPG` (image uploads) and `All pages as PNG (N) / JPG (N)` (PDF uploads) entries. See [`src/exportRaster.js`](src/exportRaster.js#rasterFromImage) and [`src/exportRaster.js`](src/exportRaster.js#rasterPdfPages).

Do **not** use `gemini-1.5-pro` — it 404s in this workspace. The Gemini timeout is 10 minutes (`GEMINI_TIMEOUT_MS` in `server/index.js`) — large multi-page PDFs routinely take 1–3 minutes.

### Conditionally-mocked endpoints
- `/api/save-drive` is real **only if** all three of `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` are in `.env`. Populate the refresh token with `npm run bootstrap-drive` (one-time installed-app OAuth flow on `127.0.0.1:3002`; see `scripts/bootstrap-drive.js`). Real saves use scope `drive.file` only and write to a single `ogOCR` folder at My Drive root (memoized lookup-or-create per server boot, `trashed=false` filter so a manually-trashed folder is replaced rather than written into). Filename is sanitized (`/`, `\`, `\x00` stripped, 255-char cap). MIME from extension: `.svg` → `image/svg+xml`, `.md` → `text/markdown`, default `text/plain`. No collision dedupe — duplicate filenames create duplicate Drive files. Auth-expired errors return 401 with a re-bootstrap message; everything else routes through `sendModelError`. If any of the three vars are missing, the route logs which ones at boot and falls back to the same mock as before.
- `/api/classroom/draft` is a pure mock (console log + delayed success response). Wiring it up requires a separate Classroom OAuth flow.
- `/api/email` uses `nodemailer` + Gmail SMTP **only if** `SMTP_USER` and `SMTP_PASS` are in `.env`; otherwise it logs `[MOCK EMAIL]` and returns success.

### Frontend state model
All persistent client state lives in four localStorage keys, written (debounced 400ms) from `App.jsx`:
- `ogOCR_sessions` — array of `{id, filename, date, text, svg, kind, images?, refinements?, sketches?, selectedSketchId?, languageOverride?, exportName?}` (schema v5). `kind` indexes into `KIND_GLYPH` / `KIND_LABEL` in `src/magicActions.js`; legacy sessions without `kind` are treated as `'text'` on render. Image bytes (`images[i].data`) live in IndexedDB — only `{id, desc}` round-trips through localStorage; hydration runs lazily on session activate.
- `ogOCR_compiles` — array of compiles (schema **v4**). Each compile has `{id, name, createdAt, updatedAt, blocks, pageSize, theme, header, footer, sourceId, version}`. `sourceId === null` is a manual cross-source compile; a session id binds the compile to that source for auto-sync. Each block has `{id, kind, role, ...content}` where `role ∈ {'manual', 'auto:text:<actionId>', 'auto:svg:<actionId>', 'auto:svg:sketch-<id>', 'auto:image:<imgId>', 'auto:refinement:<kind>'}`. v4 made the text/main-svg roles action-keyed so re-running a different magic action accumulates a new block alongside the prior action's output; v3's `auto:text` and `auto:svg:main` demote to `'manual'` on migrate. See `src/compile.js#syncAutoBlocks` for the reconciliation rules; the per-session `session.outputs` map is what feeds it. Manual blocks and user drag-reorders are never touched.
- `ogOCR_active_compile` — id of the currently-open compile.
- `ogOCR_active_session` — id of the currently viewed session, removed (not just emptied) when no session is active.
- `ogOCR_prompt` — the custom prompt textarea content.
- `ogOCR_theme` — `'paper'` | `'sepia'` | `'ink'`. Applied synchronously in `index.html` before React mounts to avoid a first-paint flash.

A new session is auto-created on every upload (filename + `kind: 'text'`). The persistence effect catches `QuotaExceededError` and drops the oldest session as a circuit breaker. There is no server-side persistence.

### Output rendering (`OutputColumn.jsx`)
- **Rendered** mode (default): SVG (DOMPurify-sanitized with explicit SVG profile + `FORBID_TAGS`/`FORBID_ATTR` for `foreignObject`/`script`/`iframe`/`onerror`/`onload`/`onclick`) renders above markdown. Markdown goes through `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex` (configured with `throwOnError: false` so malformed LaTeX doesn't crash the preview). Block-level elements are mapped to `og-h1`/`og-h2`/`og-h3`/`og-p`/`og-ul`/`og-ol`/`og-bq`/`og-table`/`og-code-inline` via the `components` prop.
- **Source** mode: editable `<textarea>` bound to whichever of `text` / `svg` is non-empty on the active session. Edits persist via the debounced setSessions path.
- **Worksheet** button (the "Compile" pill, renamed in copy): opens a full-screen modal with `CompileBuilder.jsx` (NOT the legacy `WorksheetBuilder.jsx`, which is now unused) showing the active session's auto-compile by default — created lazily on first extraction by `App.jsx#syncAutoCompileForSession`. Manual cross-source compiles still work alongside auto ones via the palette's "+ New" affordance. The print stylesheet has separate rules for compile-modal-open vs. closed; the un-modal path prints just the canvas.
- `ExportBar.jsx` is a single **Save** picker (was three dropdowns — Save / Share / Export — collapsed in v4). Click Save → format menu populated by `src/saveFormats.js#buildSaveFormats(session)` based on what the session has (text → MD/JSON; svg → SVG/PNG/JPG/JSON; both → all of the above; DOCX always available — flips to mock toast if `/api/_status` reports `docx: 'mock'`). `saveOrShare()` routes the chosen File payload through `navigator.share()` when available (mobile share sheet) and falls back to download on desktop or when the API is missing. The raster items are still state-driven: `0` SVGs → none; `1` SVG → **PNG** + **JPG**; `2+` SVGs → **All as PNG (N)** + **All as JPG (N)** (sequential downloads, one file per SVG, no compositing). The dedup logic lives in `src/svgExports.js#buildSvgExports`; the SVG → raster pipeline lives in `src/exportRaster.js` (extracted from ExportBar in v4 so CompileBuilder can reuse it). PNG export reads `viewBox.baseVal` before falling back to declared `width`/`height` to avoid the 800×600 force-resize bug. Drive / Email / Classroom buttons no longer surface — those routes are still server-mocked but routing happens via OS share sheet on mobile or save dialog on desktop.

## Environment

`.env` at the repo root:
- `GEMINI_API_KEY` — **required**; without it `/api/extract` returns 500.
- `SMTP_USER`, `SMTP_PASS` — optional; presence of both flips `/api/email` from mock to real Gmail SMTP send.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` — optional; presence of all three flips `/api/save-drive` from mock to real Drive write. Populate the refresh token via `npm run bootstrap-drive`.

`.env` is gitignored. `.env.example` ships at the repo root as a redacted template — copy it to `.env` and fill in real values. If any committed doc embeds a literal key (it shouldn't, but historically `gemini.md` did), scrub and rotate.

## Gotchas already learned

- Vite proxy must target the loopback IP literally, not `localhost` (IPv6 → `ERR_CONNECTION_RESET`).
- Gemini handles PDFs natively via base64 `inlineData`. An earlier OpenAI experiment was reverted because `gpt-4o` rejected PDF MIME types — keep the single-file Gemini path; don't reintroduce client-side PDF→image conversion **on the extraction path**. `pdfjs-dist` is permitted **only** for preview-only thumbnail rendering via dynamic import (currently `UploadConfirmModal.jsx` and `SourcePreview.jsx` render page 1 to a canvas for the source/upload UI). Do not use it on the extraction path or import it statically.
- `gemini.md` is the session hand-off doc, kept current as a complement to this file. Read CLAUDE.md first for the architecture, then `gemini.md` for session history + why-it's-this-way decisions.
- An earlier OpenAI/multi-file experiment was reverted in full. If you spot a fresh import of `openai`, `pdf-lib`, or `canvas`, it was probably re-added accidentally — `googleapis` is the only one of those that's back deliberately (Phase 12 Drive). The extraction code path is single-file Gemini only. (`pdfjs-dist` is intentionally back for preview thumbnails — see the bullet above.)
- **Use `res.on('close', ...)` not `req.on('close', ...)`** for cleanup in delayed-response routes (the two mocks). On Express 5 / Node 20 the request stream's `'close'` event fires as soon as `express.json()` finishes parsing the body, which clears the response timer before the response is sent. The mocks use `res.on('close', () => clearTimeout(timer))` to only clean up if the connection actually drops.
- **Restart leaves orphan node processes on Windows.** If a previous `npm run dev` was killed unevenly, leftover Express children sit on port 3001 and the next boot's Express silently exits code 0 on EADDRINUSE while concurrently keeps Vite alive — every `/api/*` fetch then hangs forever. Symptom: the dev-server logs show `node server/index.js exited with code 0` right after listening. Fix: `taskkill //F //IM node.exe` then restart.
- **Vite proxy needs explicit timeouts for long Gemini calls.** `vite.config.js` sets `timeout: 600_000` and `proxyTimeout: 600_000` on the `/api` proxy; without these, browsers/proxies may drop the connection at ~5 min during a long PDF extraction. The same proxy config also wires `error`/`proxyReq`/`proxyRes` event handlers so each request shows up in the dev logs as `[vite-proxy] → / ← / error`.
- **Express logs every request** (`[req] METHOD path ← origin=... ua=...`) and every CORS rejection (`[CORS] rejected origin: ...`). When debugging device-specific fetch failures (e.g. Android Chrome), check the dev logs first: a missing `[vite-proxy] →` means the browser blocked the fetch outright; a `→` without a matching `[req]` means the proxy couldn't reach Express; both present = the request worked end-to-end and the issue is response-side.

## Design tokens & theming

`src/index.css` is the single source of truth for tokens. Three themes (`:root[data-theme="paper"|"sepia"|"ink"]`) define the palette in OKLCH; the `<html data-theme>` attribute is set both at boot (inline script in `index.html`) and on every theme-cycle (`App.jsx`).

- **Fonts:** **Fraunces** (variable serif, opsz 9–144) + **JetBrains Mono**. `--sans` falls back to `system-ui` (no third sans-serif shipped). The brief's font-pair toggles, density toggle, and Tweaks panel are intentionally not shipped — design-time exploration only.
- **Accent color (cool indigo):** `--accent` lives at hue 245 across all three themes (Variant B "Refined" retrofit, Phase 13.2). Used for borders, focus rings, the active-pill underline, glyphs, accent text via `--accent-ink`, and the h3 mono eyebrow in the rendered canvas. `--accent-soft` is the same hue at 0.10–0.14 alpha for tinted backgrounds.
- **Markdown headings:** `og-h1` and `og-h2` use `--ink` (body color); `og-h3` is the mono uppercase eyebrow in `--accent`. The legacy pink `--heading` token was removed in Phase 13.2 — single-accent type system per Variant B.
- **Geometry tokens:** `--r-chip: 4px`, `--r-tile: 8px`, `--r-card: 10px` (radius scale) and `--tx-fast: 0.14s` (the standard hover-transition duration) live on `:root`. `--stage-gradient` is the radial tint for the source preview well, theme-aware (overridden per theme).
- **`--bg-tint`** is a fourth background layer (above `--bg-card`, below `--rule-soft`) used for icon squares, hover hints, and tile glyph backgrounds.

The redesign matches the `design_handoff_ogocr_redesign/` spec with three intentional deltas: the **Diff** mode pill is hidden until per-token confidence comes from the backend, the **PromptDock** preset chips are not shipped, and the **Source** pill stays editable (the brief had it read-only) so the prior edit-extracted-text capability isn't lost.

## Outstanding issues

Phases 0–11 from the migration plan have landed (secrets, CORS, bind, DOMPurify, dead-dep removal, server hardening, full UI redesign, ⌘K palette, Compile modal, post-migration polish). `npm run lint` runs in CI via `.github/workflows/lint.yml` on every push to `main` and every PR. Phase 12 is in progress — Drive is now real (single-user OAuth via `npm run bootstrap-drive`); the rest is tracked in `~/.claude/plans/splendid-noodling-moth.md`.

**Phase 13 — Variant B "Refined" design migration (in progress).** A full hi-fi design refresh per `design_handoff_ogocr_redesign/design_handoff_variant_b_refined/` (cool indigo accent retrofit across all 3 themes, restructured action surface, 4-tab bottom nav on mobile with a new Ask tab, no font additions, no backend touches). Scope decisions, sub-phase order (13.1–13.9), critical files, and verification live in `~/.claude/plans/go-thorugh-design-handoff-variant-b-refi-dapper-harbor.md`. **To resume in any fresh session: prompt with "resume design migration"** — that triggers the resume protocol (read CLAUDE.md → gemini.md → the plan file → check `git status` to identify the next un-shipped sub-phase). Sub-phases shipped: **13.1** (doc hooks) and **13.2** (token refactor — `--heading` removed, indigo accent at hue 245 across themes, `--bg-tint`/`--r-chip`/`--r-tile`/`--r-card`/`--tx-fast`/`--stage-gradient` added, og-h1/h2 → `--ink` and og-h3 → `--accent`). **13.3** (top bar restyle) is next.

Carried-over Phase 12 backlog:

1. **Real Classroom / Email / share-link integrations** — Classroom is still a pure mock; Email is SMTP-only (no Gmail OAuth); the share-link button just copies `window.location.href`. Each needs its own OAuth or backend.
2. **PDF page rasterization** in `/api/extract-images` AND `/api/sketch-to-svg` — both handlers fall back to descriptions-only / prompt-hint (respectively) for PDF inputs because there's no server-side per-page render. `pdfjs-dist` is currently allowed only on the preview-thumbnail path (`UploadConfirmModal`, `SourcePreview`); expanding it to the server would let the multi-sketch picker show real cropped thumbnails for PDF inputs and the vectorize path crop the region precisely instead of hinting via prompt. Phase-2 follow-up.
3. **Per-token confidence** from Gemini — would unlock the Diff pill and the `CONF` source tablet.
4. **Browser idle-connection cap** — if a Gemini request actually runs the full 10-minute timeout, browsers/proxies can drop the connection at ~5 min. Untested edge case; the fix is a job-queue pattern (POST returns a job id, client polls).
