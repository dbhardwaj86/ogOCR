# ogOCR — Session Hand-off

A "where we left off" doc for the next person (or AI) picking up the project. CLAUDE.md is the day-to-day reference for working with the codebase; this file captures session history, decisions, and the tribal context that doesn't live in code.

## Status check (2026-04-27 — post auto-compile sprint, commit `d441f40`)

Three connected sprints landed today on top of the Multi-Sketch Detection work:

1. **Per-source auto-compiled worksheets.** Compile schema bumped to v3. Every compile now has a `sourceId` and every block has a `role` (`manual` or `auto:*`). `src/compile.js#syncAutoBlocks` reconciles auto blocks from a session snapshot on every extraction completion — the Worksheet button on a source opens *that source's* auto-compile (created lazily) with text + every vectorized sketch + images + each refinement appended automatically. Manual cross-source compiles still work; the palette splits them into "By source" (auto badge) and "Manual." Cascade-delete keeps the auto-compile in lockstep with its session.
2. **Multi-SVG raster export — PNG + JPG, one file per SVG.** `exportPNG` is now `exportRaster(svg, { format, filename, quality })` in `src/components/ExportBar.jsx`. New `src/svgExports.js` deduplicates the main SVG against any focused-sketch SVG. Multi-SVG state shows **All as PNG (N)** / **All as JPG (N)** — sequential downloads with a 60ms breather to dodge Chromium dedup. No mosaic, each SVG at its own viewBox dimensions.
3. **Non-destructive sketch open.** `openSketch` no longer wipes `session.sketches[]`; the multi-sketch picker survives. New "← Show all sketches (N)" link in the focused-view header returns the user to the picker with every vectorized SVG intact. `vectorizeSketch` now reads its post-update session via the `setSessions(prev => …)` updater so `vectorizeAllSketches`'s sequential loop syncs the auto-compile against the freshest cumulative state — the bug where only the latest sketch survived is fixed and regression-tested.

`npm run lint` clean. `npm test` → **204/204 passing** across 26 files (was 182/170; +21 net new tests covering v3 sync, multi-SVG preservation, drag-reorder survival, sequential-vectorize regression, raster dedup). Pushed to `origin/main` and fast-forwarded `origin/ship-cleanup-sprint` to the same SHA so any clone gets the latest code regardless of which branch is the GitHub default.

Detailed sprint breakdown lives in [SESSION_HANDOFF.md](SESSION_HANDOFF.md) under "Latest pass — Per-source Auto-Compiles + Multi-SVG Export + Non-destructive Sketch Open." Plan file: `~/.claude/plans/user-should-be-able-swift-falcon.md`.

## Status check (2026-04-26)

**Working end-to-end on:** laptop (localhost), iPad (LAN URL via Safari), Android phone (LAN URL via Chrome). All three confirmed by hitting `/api/extract` and seeing 200 responses in the live dev logs.

`npm run lint` clean. `npm run dev` boots both processes; the dev logs now print `[vite-proxy] →` / `[req]` / `[vite-proxy] ←` for every API call so device-specific failures can be diagnosed from the log alone.

### Phase 13 — Variant B "Refined" design migration (planned, in progress)

A full design refresh on top of the just-stabilized three-pane layout. Spec lives at [design_handoff_ogocr_redesign/design_handoff_variant_b_refined/](design_handoff_ogocr_redesign/design_handoff_variant_b_refined/) (README is the entry point; `desktop/` and `mobile/` hold runnable JSX/CSS prototypes). Plan with full scope decisions and sub-phase breakdown: `~/.claude/plans/go-thorugh-design-handoff-variant-b-refi-dapper-harbor.md`.

**Resume any time, in any fresh session, with the prompt: "resume design migration".**

Three scope decisions pinned by the user during planning (deltas from the literal spec):

1. **All three themes (paper / sepia / ink) survive.** Variant B's cool indigo accent + ink scale is retrofitted into each — pink `--heading` token is removed, accent hue lands at 245 across all themes, each theme keeps its character.
2. **Mobile uses a 4-tab BOTTOM nav (`LIBRARY · SOURCE · OUTPUT · ASK`)** — hybrid between Variant B's bottom-tabs spec and the just-shipped top-tab Library-as-peer model. PromptDock moves out of Output into its own Ask tab on mobile only.
3. **No new font families.** Variant B's Inter Tight body slots map to existing system-ui; IBM Plex Mono mono slots stay on JetBrains Mono. Fraunces unchanged. Avoids adding to the perf backlog item already noted at #7 below.

Sub-phases (each PR-sized, lints clean independently):

- **13.1 — Doc hooks** (this entry + the CLAUDE.md "Outstanding issues" paragraph). Shipped.
- **13.2 — Token refactor** (`src/index.css` `:root` and `:root[data-theme="..."]` blocks). Shipped — `--heading` removed (was hue 5–12 pink), `--accent` realigned to hue 245 cool indigo across all three themes, `--bg-tint` added as a new background layer, geometry vars (`--r-chip` 4px / `--r-tile` 8px / `--r-card` 10px / `--tx-fast` 0.14s) and theme-aware `--stage-gradient` added to `:root` and per-theme. The three `og-rendered .og-h{1,2,3}` rules in `src/index.css` were updated alongside (h1/h2 → `--ink`, h3 → `--accent`) — those were the only consumers of the removed token.
- **13.3 — Top bar restyle** (brand reticle SVG, meta strip with StatusPulse, restyled ⌘K chip).
- **13.4 — Library Rail restyle** (section eyebrow + count chip, UploadCard dashed-border + icon-square restyle, SessionList row layout with kind-glyph thumb).
- **13.5 — Source pane restyle** (head with stat strip, CornerBracket stroke retune, scan-line glow, MagicActions regrouped into 4 named groups with shortcut keys).
- **13.6 — Output pane restyle** (segmented control with Compile pill as 4th option, ProcessingStrip layout, RenderedDoc markdown component map retypography, SourceDoc textarea restyle, PromptDock grid restructure, ExportBar 3-group layout).
- **13.7 — Command palette restyle** (blur shroud, list-row grid, mono footer hints).
- **13.8 — Mobile bottom 4-tab nav + Ask tab** (re-author MobileTabs, extend `mobilePane` union with `'ask'`, render PromptDock in two slots based on viewport).
- **13.9 — Polish + verification** (Toast restyle accounting for bottom-tab bar, full cross-theme + cross-device pass).

What stays frozen (preserves existing functionality, per the user's "keep backend and functionality same" constraint):

- All `magicActions.js` `id` / `prompt` / `endpoint` triples and the 8-action wire-compat with `server/index.js`.
- All `/api/*` endpoints, response shapes, timeouts. No `server/index.js` edits.
- Editable Source mode (decision #3 below).
- Diff pill stays hidden (decision #1 below).
- `SourceTablets` defaults `false` (decision #4 below).
- Compile pill + WorksheetBuilder modal as 4th view-mode pill (decision #5 below).
- Three-theme cycle button + OKLCH theme system.
- Vite proxy `127.0.0.1` literal, LAN-accessible bind, mobile breakpoint 880 px, `res.on('close')` cleanup pattern.

### Just shipped this session

- **Mobile layout (≤880 px)** — single-pane stack with a 3-segment tab bar (`01 LIBRARY · 02 SOURCE · 03 OUTPUT`) under the top bar. New `mobilePane` state in `App.jsx` (`'library' | 'source' | 'output'`); CSS uses `[data-mobile-pane]` on `.og-main` to hide non-active panes. Auto-flips: `'source'` after upload, `'output'` immediately on action start (so the user sees the processing strip, not the source pane). Top-bar collapses on mobile (hides session/model meta + "command" label). New `MobileTabs.jsx` component. Existing 1080-px / 880-px desktop-narrow rules scoped `(min-width: 881px)` so they don't double-fire on phones. The `⌘ K` kbd in `TopBar.jsx` is now a real `<button>` (was a static element) so phones-without-keyboard can open the palette by tapping it.
- **Mobile UX bug fixes**:
  - **`req.on('close')` → `res.on('close')`** in the mock Drive + Classroom routes (`server/index.js`). On Express 5 / Node 20 the request stream's `'close'` fires when `express.json()` finishes parsing, which was clearing the 1.5 s mock-response timer before it fired — every Drive/Classroom mock POST hung forever.
  - **Auto-flip to Output on action start, not after success** — previously the user would tap an action and stare at the source pane for 1–3 minutes wondering if anything was happening. Now the processing strip is immediately visible.
- **Diagnostic logging** for device-specific debugging:
  - `vite.config.js` — `timeout: 600_000` and `proxyTimeout: 600_000` on the `/api` proxy (long Gemini calls), plus `error`/`proxyReq`/`proxyRes` event handlers logging `[vite-proxy] →`/`←`/`error` lines per request.
  - `server/index.js` — `app.use((req, _res, next) => console.log('[req] ...'))` middleware logging every method/path/origin/UA, plus `console.warn('[CORS] rejected origin: ...')` when the LAN-allowlist regex rejects an origin. Together these let you see exactly where a fetch dies on any client.
- **Drive integration (Phase 12)** — real `/api/save-drive` when `GOOGLE_CLIENT_ID`/`SECRET`/`REFRESH_TOKEN` are in `.env`. Bootstrap is a one-time CLI: `npm run bootstrap-drive`. Falls back to the same mock as before if any of the three env vars is missing. Single-user only (the developer's Drive); `drive.file` scope; writes to a single `ogOCR` folder at My Drive root with memoized lookup-or-create. `googleapis` is back as a deliberate dep.

### Pre-existing (from prior sessions, still current)

- **Security hygiene** — `.env` gitignored, literal API key scrubbed, CORS narrowed to loopback + RFC 1918 LAN ranges, Express bound to `0.0.0.0` for LAN review, error-message leak closed (endpoints return generic strings; details log server-side only), DOMPurify locked to an explicit SVG profile + `FORBID_TAGS`/`FORBID_ATTR`.
- **Foundation cleanup** — five unused deps removed (`openai`, `pdf-lib`, `pdfjs-dist`, `canvas`; `googleapis` re-added Phase 12), invalid `models.json` deleted, Vite-template boilerplate deleted, `test.js` moved to `scripts/list-models.js`, ESLint config split into browser/Node blocks, `dotenv.config()` resolved relative to `import.meta.url`, `concurrently` runs with `--kill-others-on-fail`. Lint runs in CI via `.github/workflows/lint.yml`.
- **Server hardening** — boot-time fail on missing `GEMINI_API_KEY`, 10-minute Gemini timeout with 504 + actionable message, prompt length cap (2000 chars), mimetype whitelist on `/api/extract-images`, JSON parse safety net + bounding-box validation, multer 413 error middleware, nodemailer using explicit `host: 'smtp.gmail.com'` + port 465.
- **Three-pane "Optical Instrument" UI** per `design_handoff_ogocr_redesign/`. Fraunces + JetBrains Mono. `--accent` cool indigo at hue 245 across all three themes (Phase 13.2 retrofit; the legacy pink `--heading` token was removed). Three themes via `:root[data-theme="paper"|"sepia"|"ink"]` in OKLCH. New geometry tokens (`--r-chip`/`--r-tile`/`--r-card`, `--tx-fast`, `--stage-gradient`) live alongside.

### Architecture in one paragraph

Frontend is React 19 + Vite at the port set in `vite.config.js`. State machine lives in `src/App.jsx` with four localStorage keys (`ogOCR_sessions`, `ogOCR_active_session`, `ogOCR_prompt`, `ogOCR_theme`). Uploads create a new session immediately; magic-action tiles or the prompt dock POST FormData to `/api/extract` (`gemini-2.5-flash`), `/api/sketch-to-svg` (`gemini-2.5-pro`), or `/api/extract-images` (`gemini-2.5-pro` with JSON response mode + `sharp` crops). All requests route through Vite's `/api` proxy to Express on the loopback IPv4 literal (port set in `server/index.js`). Three other endpoints (`/api/save-drive`, `/api/classroom/draft`, `/api/email`) are mocks unless SMTP env vars are set.

## Decisions worth knowing

These aren't visible from the code alone:

1. **Diff mode is hidden, not implemented** — the redesign brief had Rendered / Source / Diff pills. Backend has no per-token confidence so Diff was dropped. Reinstate the pill in `OutputColumn.jsx` if/when Gemini exposes logprobs.
2. **PromptDock preset chips are not shipped** — the brief had four preset prompts ("Translate to French", etc.). Per product direction the textarea + Run button is enough.
3. **Source mode is editable, not read-only** — the brief had Source as a read-only line-numbered view; the existing app let users edit extracted text. The editable behavior was preserved as a `<textarea>` inside the Source pill so the prior capability isn't lost.
4. **`showTablets` defaults to `false`** — backend doesn't supply DPI / language / per-token confidence, only image natural dimensions. `SourceTablets.jsx` only renders the tablets it has data for; the toggle is wired from `App.jsx` set to `false` until the backend grows the data.
5. **Worksheet builder is a modal**, not an inline mode swap. Clicking the "Compile" pill opens a full-screen modal that wraps the existing `WorksheetBuilder` component, leaving Rendered/Source state intact behind it.
6. **Gemini timeout is 10 minutes** — large multi-page PDFs take 1–3 minutes routinely; 60s and 180s defaults were both too short in practice. The constant is `GEMINI_TIMEOUT_MS` in `server/index.js`.
7. **`.env` previously contained `OPENAI_API_KEY`** — only `GEMINI_API_KEY` is read by the current code path. OpenAI was abandoned (see "OpenAI experiment reverted" below); the env var can be removed at the user's discretion.
8. **Mobile breakpoint is 880 px, not 640 px.** Landscape phones and portrait tablets share enough constraints (narrow source, no room for three panes side-by-side) that giving them the same single-pane tab UX is simpler than maintaining a separate intermediate breakpoint. Above 881 px the desktop three-pane is intact; below 881 px it's tab-driven single-pane.
9. **Mobile auto-flips to Output on action *start*, not on success.** The processing strip + percentage live in the Output column. If we flipped after success, the user would stare at the (hidden) source-pane scan-line for 1–3 minutes thinking nothing was happening. Auto-flip on start means they see the progress feedback immediately.

## Gotchas still live

1. **Vite proxy target must be `127.0.0.1`, not `localhost`** — IPv6 routing on Windows triggers `ERR_CONNECTION_RESET` against an Express server that only listens on IPv4. Baked into `vite.config.js`; preserve it.
2. **`gemini-1.5-pro` returns 404** in this workspace — use `gemini-2.5-flash` (cheap path) or `gemini-2.5-pro` (visual / JSON-mode path).
3. **Browsers and intermediaries sometimes drop idle connections after ~5 min** — if Gemini takes the full 10-minute timeout, the browser may abandon the request even though the server is still working. Untested edge case; the proper fix is a job-queue pattern (POST returns a job id, client polls).
4. **OpenAI experiment reverted** — `gpt-4o` rejected PDF MIME types. The old code path is gone and the deps were removed from `package.json`. If you spot a fresh import of `openai`, `pdf-lib`, `pdfjs-dist`, or `canvas`, it's most likely an accidental re-add. **`googleapis` is back deliberately** as of Phase 12 (real `/api/save-drive`); don't strip it.

## Where things live

- `src/magicActions.js` — the 8-action table (`id`, `prompt`, `endpoint` frozen as wire-compat with the backend). Don't rename ids without coordinating with `server/index.js`.
- `src/App.jsx` — orchestration, state, `runAction` flow with `AbortController`, Cmd+K handler, theme persistence, debounced localStorage with quota fallback.
- `src/components/` — 18 components, each focused. See CLAUDE.md "Layout" for the tree.
- `src/index.css` — tokens + component styles + print rules. OKLCH throughout. Three themes via `:root[data-theme="..."]`.
- `server/index.js` — six endpoints in one file. CORS LAN allowlist, multer error middleware, `withTimeout` wrapper, `sendModelError` helper.
- `~/.claude/plans/splendid-noodling-moth.md` — the full 12-phase migration plan with the 80-item adversarial backlog cross-referenced to phases. Phases 0–11 are done; Phase 12 (out-of-scope items needing backend work) is the remaining backlog.

## Next steps planned

Outstanding feature work (carried over):

1. **Real Classroom / Email-OAuth / share-link** — Drive is the only one of the four "Save / Share" integrations that's now real. Classroom is still a pure mock; Email is SMTP-only (no Gmail OAuth); the Link export just copies `window.location.href`. Each needs its own OAuth or backend.
2. **PDF page rasterization** in `/api/extract-images`. Currently returns description-only for PDFs.
3. **Per-token confidence** from Gemini → would unlock the hidden Diff pill and the `CONF` source tablet.
4. **Browser idle-connection cap** during 3+ minute Gemini runs — fix is a job-queue pattern (POST returns id, client polls) or SSE streaming.

Performance backlog (from the perf-suggestions audit, ranked high impact / low effort first):

5. **Lazy-load the markdown stack** (`react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex` + `katex` ≈ 250 KB minified) via `React.lazy` on `RenderedDoc` and `WorksheetBuilder`. Single biggest first-paint win on phone.
6. **Memoize rendered markdown** with `useMemo([session.text, session.svg])` — currently re-parses on every prompt-dock keystroke because `customPrompt` lives at App level.
7. **Self-host Fraunces + JetBrains Mono or use `font-display: swap`** — `index.css` `@import` from Google Fonts is render-blocking on phones.
8. **`vite.config.js` `manualChunks`** to split vendor / markdown / dompurify into separate chunks.
9. **`<link rel="preconnect" href="https://generativelanguage.googleapis.com">`** in `index.html` — trims 100–300 ms TLS handshake on the first Gemini request.
10. **Move localStorage writes to `requestIdleCallback` and split into per-session keys** — currently the single `ogOCR_sessions` JSON blob has to be re-serialized on every change.
11. **Stream Gemini responses** (`generateContentStream` + SSE to client) — closes the idle-connection-cap issue (#4) too. Pick this OR the job-queue pattern, not both.
12. **Pre-shrink the source-pane preview** via a hidden `<canvas>` once on file load instead of letting the browser render a 5–10 MB original at ~300 px wide.
13. **Lazy-import `sharp` and `googleapis`** in `server/index.js` — they're imported at module top and add 200+ ms cold-boot even when their endpoints are never called.

Quick-win ordering for next session: 5 → 6 → 7 → 8 → 9. Independent, ~1 PR.

## Status of the running dev environment

The dev server is currently running under the Claude Preview tool (pre-baked `.claude/launch.json`). LAN URLs:
- Frontend: `http://192.168.1.12:3000`
- API (proxied): `http://192.168.1.12:3001`

If a previous `npm run dev` was killed unevenly, leftover Express children will sit on port 3001 and the next boot's Express silently exits code 0 on EADDRINUSE — see CLAUDE.md gotchas for the cleanup recipe (`taskkill //F //IM node.exe`).

## For the resuming AI

Read **CLAUDE.md first** for the daily-driver reference (commands, architecture, gotchas, mobile breakpoints, diagnostic logging convention). Then come back here for session history and the why-it's-this-way decisions. The original migration plan at `~/.claude/plans/splendid-noodling-moth.md` has the full Phase 0–11 audit trail. `~/.claude/plans/a-refactored-wombat.md` is the mobile-layout plan (shipped).

**Phase 13 (Variant B "Refined" design migration) is the active work.** Plan: `~/.claude/plans/go-thorugh-design-handoff-variant-b-refi-dapper-harbor.md`. Resume any time with the prompt **"resume design migration"**. The resume protocol: read CLAUDE.md → this file (especially the Phase 13 section above) → the plan file → check repo state to identify which sub-phases (13.1–13.9) have already shipped → proceed with the next un-shipped sub-phase. **Shipped so far: 13.1 (doc hooks), 13.2 (token refactor — Variant B indigo at hue 245 across all 3 themes, `--heading` removed, geometry vars + `--bg-tint` + `--stage-gradient` added). 13.3 (top bar restyle: brand reticle SVG, meta strip with StatusPulse, restyled ⌘K chip) is next.**

**2026-04-27 (v4 + unified Save):** Compile schema bumped v3 → v4 — auto blocks are now action-keyed (`auto:text:<actionId>` / `auto:svg:<actionId>`) and reconciled against a new per-session `session.outputs` map, so re-running a different magic action accumulates a new worksheet block instead of overwriting the prior action's. v3 legacy `auto:text` / `auto:svg:main` blocks demote to `'manual'` on migrate so existing compiles keep their content. ExportBar collapsed from 3 dropdowns (Save/Share/Export) into a single Save picker fed by new `src/saveFormats.js` (`navigator.share()` first, download fallback); SVG raster pipeline extracted to `src/exportRaster.js`; Drive/Email/Classroom buttons removed (routes still mocked server-side, but users now go through OS share sheet on mobile or save dialog on desktop), MockBadge filters `docx` only. Track N source-pane carryover closed too — `SourceColumn` receives `onUpdateSession` directly so signature insert is a single state update, no more reload. Detail in [SESSION_HANDOFF.md](SESSION_HANDOFF.md) under "Latest pass — v4 worksheet schema + unified Save picker"; commit `9c99826`. 216/216 tests pass; lint + build clean.
