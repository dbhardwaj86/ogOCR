# CLAUDE.md

> **🔁 Resuming work? Read [SESSION_HANDOFF.md](SESSION_HANDOFF.md) first** — start with the **Latest pass — Per-source Auto-Compiles + Multi-SVG Export + Non-destructive Sketch Open (2026-04-27, commit `d441f40`)** section at the top.
>
> That file is the living index of every multi-step pass: what shipped, what's pending, what to verify next. The architecture notes below stay accurate, but anything about active or recently-shipped work belongs in the handoff.

## Latest changes (2026-04-27 — three sprints stacked: Auto-Compile + Multi-SVG Export, Multi-Sketch Detection, Ship Cleanup)

These differ from the architecture notes below; if there's a conflict, this section wins:

- **Compile schema is v3** with per-compile `sourceId` (`null` = manual cross-source, session-id = auto-managed) and per-block `role` (`'manual'` or `auto:*`). `syncAutoBlocks(compile, session)` in `src/compile.js` reconciles auto blocks on every extraction completion (`runAction`, `vectorizeSketch`, queue runner, `openSketch`, `showAllSketches`) — replaces text/refinements/main-svg/images in place, **preserves every distinct vectorized sketch as its own block**, never touches manual blocks, never reorders. Worksheet button on a source opens that source's auto-compile (creates if missing); compiles cascade-delete with their session. Palette splits **By source** (auto badge) from **Manual**. `vectorizeSketch` reads via prev-from-updater so `vectorizeAllSketches`'s sequential loop syncs the freshest state.
- **Multi-SVG raster export** — `exportPNG` is now `exportRaster(svg, { format, filename, quality })` supporting PNG + JPG. New `src/svgExports.js` deduplicates main vs. focused-sketch SVG. UI shows **All as PNG (N)** / **All as JPG (N)** when N > 1; sequential downloads with a 60ms breather to dodge Chromium dedup.
- **Non-destructive sketch open** — `openSketch` no longer wipes `session.sketches[]` when promoting a sketch to the main canvas. `OutputColumn` renders **← Show all sketches (N)** in the focused-view header when `session.sketches.length > 0`; click returns to the picker with all vectorized SVGs intact.
- **`/api/sketch-to-svg` is polymorphic on `req.body.bbox`** (Phase 15). No bbox → discovery mode: JSON-mode prompt returns every detected sketch. 0 found → `OCR_NO_SKETCH_FOUND`. 1 found → auto-vectorize, returns `{svg}` (back-compat). 2+ found → returns `{sketches:[{id, description, bbox, page, thumbnail?}]}` and the frontend renders a picker. With a bbox, server crops (image) or prompt-hints (PDF) and returns `{svg}` for that one region. Session schema v5 adds `sketches` + `selectedSketchId`. Frontend helpers in `src/App.jsx`: `vectorizeSketch(id)`, `vectorizeAllSketches()`, `openSketch(id)`, `showAllSketches()`. Picker UI in `src/components/SketchesPicker.jsx` rendered when `mode === 'sketches'`.
- **`npm start`** now serves the built `dist/` + the API on a single port — production hosting path. `npm run dev` still does the dual Vite + Express dance for local development.
- **PDFs route through Gemini Files API.** `server/geminiUpload.js` exposes `buildGeminiUploadParts(file, { fileManager })` — PDFs upload once, get a `fileUri`, are cleaned up after generateContent. Images still go inline base64. The `generateContentFromUpload(model, prompt, file)` helper in `server/index.js` is the single entry point.
- **`xlsx` was replaced by `exceljs`** in `src/components/TableBlock.jsx` (still lazy-imported on the export click).
- **EADDRINUSE now fails loud** — `server.on('error', ...)` exits code 1 with a clear message instead of the silent-exit-while-Vite-stays-up bug documented in the Gotchas section.
- **Test runner exists** — Vitest. `npm test` is the canonical command. Architecture note below saying "There is no test runner" is wrong; ignore it (the suite is at **204 passing** across 26 files).

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**ogOCR** — a Notion-inspired single-file OCR/extraction app. React + Vite frontend, small Express backend, Google Gemini for vision. Accepts one image or PDF at a time, sends it as base64 `inlineData` to Gemini, returns Markdown / LaTeX / Mermaid / SVG depending on the action chosen.

## Commands

- `npm run dev` — runs Vite and the Express API together via `concurrently`. The only command you normally need.
- `npm run build` — Vite production build into `dist/`.
- `npm run preview` — serve the built bundle.
- `npm run lint` — ESLint. The config has separate rule blocks for browser code (`src/**`) and Node code (`server/**`, `scripts/**`); if you add a new top-level directory, mirror the pattern.
- `node scripts/list-models.js` — sanity script that lists available Gemini models for the configured `GEMINI_API_KEY`. Useful when extraction starts returning 404s.

- `npm test` — Vitest. The canonical test command. Suite is at **204 passing** across 26 files as of 2026-04-27.

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

### The 8 magic actions
The action table is the wire-compat contract with the backend and lives in `src/magicActions.js`. Each entry pins an `id`, `endpoint`, and `prompt` (or `null` for endpoint-driven actions). The redesign-only fields (`group`, `glyph`, `hint`, `key`) are presentation-only — never change `id`/`prompt`/`endpoint` without coordinating with `server/index.js`.

### Request lifecycle (the part that spans files)
1. `UploadCard.jsx` accepts a single `image/*` or `application/pdf` (validated client-side: type + 10 MiB cap) and lifts the `File` into `App.jsx`. A new session is created immediately on upload (filename, `kind: 'text'`, empty `text` and `svg`).
2. The user clicks a magic-action tile or types a custom prompt in `PromptDock.jsx`. `App.jsx#runAction(actionId, customPromptOverride?)` looks up the action in `MAGIC_ACTIONS`, then POSTs `FormData(file, prompt)` to the action's endpoint with an `AbortController` that cancels any prior in-flight request.
3. Around the fetch, `App.jsx` runs a faked progress simulation (`startProgress` / `finishProgress`) that drives the `ProcessingStrip` and the scan-line overlay in `SourcePreview`. Progress caps at 95 % until the response lands.
4. The backend uses `multer.memoryStorage()` with a hard upload-size cap (see `MAX_UPLOAD_BYTES` in `server/index.js`), base64-encodes the buffer into a Gemini `inlineData` part, and returns one of three response shapes: `{ text }`, `{ svg }`, or `{ images: [...], message }`. `App.jsx#runAction` branches on which key is present and writes into the active session via the setSessions callback (so deletions mid-flight are no-ops, not crashes).

### Per-endpoint Gemini model split
The code uses different models per endpoint:
- `/api/extract` → `gemini-2.5-flash` (cheap path for the common "give me text" case).
- `/api/sketch-to-svg` → **two model calls** (Phase 15): first a `gemini-2.5-pro` JSON-mode discovery pass to enumerate every sketch in the doc (`{description, boundingBox, page}`), then a `gemini-2.5-pro` SVG-mode vectorize pass per sketch the user picks. Discovery is automatic on every upload; if exactly 1 sketch is found, the vectorize call fires immediately and the route returns `{svg}` (back-compat). 2+ sketches → returns `{sketches:[...]}` and the user vectorizes them lazily via `vectorizeSketch(id)` from `App.jsx` (each one calls back into `/api/sketch-to-svg` with `bbox` + `page` form fields). The SVG-mode response is fence-stripped for stray ` ```svg ` wrappers.
- `/api/extract-images` → `gemini-2.5-pro` with `responseMimeType: "application/json"`. Returns a list of `{description, boundingBox: [ymin,xmin,ymax,xmax]}` (0–1000 normalized). For images the handler crops via `sharp`; for PDFs it returns descriptions only (no PDF-page rasterization yet).

Do **not** use `gemini-1.5-pro` — it 404s in this workspace. The Gemini timeout is 10 minutes (`GEMINI_TIMEOUT_MS` in `server/index.js`) — large multi-page PDFs routinely take 1–3 minutes.

### Conditionally-mocked endpoints
- `/api/save-drive` is real **only if** all three of `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` are in `.env`. Populate the refresh token with `npm run bootstrap-drive` (one-time installed-app OAuth flow on `127.0.0.1:3002`; see `scripts/bootstrap-drive.js`). Real saves use scope `drive.file` only and write to a single `ogOCR` folder at My Drive root (memoized lookup-or-create per server boot, `trashed=false` filter so a manually-trashed folder is replaced rather than written into). Filename is sanitized (`/`, `\`, `\x00` stripped, 255-char cap). MIME from extension: `.svg` → `image/svg+xml`, `.md` → `text/markdown`, default `text/plain`. No collision dedupe — duplicate filenames create duplicate Drive files. Auth-expired errors return 401 with a re-bootstrap message; everything else routes through `sendModelError`. If any of the three vars are missing, the route logs which ones at boot and falls back to the same mock as before.
- `/api/classroom/draft` is a pure mock (console log + delayed success response). Wiring it up requires a separate Classroom OAuth flow.
- `/api/email` uses `nodemailer` + Gmail SMTP **only if** `SMTP_USER` and `SMTP_PASS` are in `.env`; otherwise it logs `[MOCK EMAIL]` and returns success.

### Frontend state model
All persistent client state lives in four localStorage keys, written (debounced 400ms) from `App.jsx`:
- `ogOCR_sessions` — array of `{id, filename, date, text, svg, kind, images?, refinements?, sketches?, selectedSketchId?, languageOverride?, exportName?}` (schema v5). `kind` indexes into `KIND_GLYPH` / `KIND_LABEL` in `src/magicActions.js`; legacy sessions without `kind` are treated as `'text'` on render. Image bytes (`images[i].data`) live in IndexedDB — only `{id, desc}` round-trips through localStorage; hydration runs lazily on session activate.
- `ogOCR_compiles` — array of compiles (schema v3). Each compile has `{id, name, createdAt, updatedAt, blocks, pageSize, theme, header, footer, sourceId, version}`. `sourceId === null` is a manual cross-source compile; a session id binds the compile to that source for auto-sync. Each block has `{id, kind, role, ...content}` where `role ∈ {'manual', 'auto:text', 'auto:svg:main', 'auto:svg:sketch-<id>', 'auto:image:<imgId>', 'auto:refinement:<kind>'}`. See `src/compile.js#syncAutoBlocks` for the reconciliation rules; manual blocks and user drag-reorders are never touched.
- `ogOCR_active_compile` — id of the currently-open compile.
- `ogOCR_active_session` — id of the currently viewed session, removed (not just emptied) when no session is active.
- `ogOCR_prompt` — the custom prompt textarea content.
- `ogOCR_theme` — `'paper'` | `'sepia'` | `'ink'`. Applied synchronously in `index.html` before React mounts to avoid a first-paint flash.

A new session is auto-created on every upload (filename + `kind: 'text'`). The persistence effect catches `QuotaExceededError` and drops the oldest session as a circuit breaker. There is no server-side persistence.

### Output rendering (`OutputColumn.jsx`)
- **Rendered** mode (default): SVG (DOMPurify-sanitized with explicit SVG profile + `FORBID_TAGS`/`FORBID_ATTR` for `foreignObject`/`script`/`iframe`/`onerror`/`onload`/`onclick`) renders above markdown. Markdown goes through `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex` (configured with `throwOnError: false` so malformed LaTeX doesn't crash the preview). Block-level elements are mapped to `og-h1`/`og-h2`/`og-h3`/`og-p`/`og-ul`/`og-ol`/`og-bq`/`og-table`/`og-code-inline` via the `components` prop.
- **Source** mode: editable `<textarea>` bound to whichever of `text` / `svg` is non-empty on the active session. Edits persist via the debounced setSessions path.
- **Worksheet** button (the "Compile" pill, renamed in copy): opens a full-screen modal with `CompileBuilder.jsx` (NOT the legacy `WorksheetBuilder.jsx`, which is now unused) showing the active session's auto-compile by default — created lazily on first extraction by `App.jsx#syncAutoCompileForSession`. Manual cross-source compiles still work alongside auto ones via the palette's "+ New" affordance. The print stylesheet has separate rules for compile-modal-open vs. closed; the un-modal path prints just the canvas.
- `ExportBar.jsx` provides three groups (Save: Drive/MD/DOCX/PDF/Sign; Share: Email/Classroom/Link; Export: Copy / raster / JSON). The raster items are state-driven: `0` SVGs → none; `1` SVG → **PNG** + **JPG** (one file each); `2+` SVGs → **All as PNG (N)** + **All as JPG (N)** (sequential downloads, one file per SVG, no compositing). The dedup logic lives in `src/svgExports.js#buildSvgExports` — main SVG and a focused-sketch SVG are deduplicated when their bytes match. PNG export reads `viewBox.baseVal` before falling back to declared `width`/`height` to avoid the 800×600 force-resize bug.

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
