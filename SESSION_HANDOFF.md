# Session Handoff — ogOCR Sprint Plan Execution

**Last updated:** 2026-04-26
**Plan file:** `C:\Users\abc\.claude\plans\we-will-work-on-fuzzy-teacup.md`
**Source review:** [REVIEW_REPORT.md](REVIEW_REPORT.md)

This is the live status of the 3-sprint implementation pass landing the [REVIEW_REPORT.md](REVIEW_REPORT.md) recommendations (key rotation excluded). Read this first when resuming. Then check the plan file for full sprint scope.

## Resume protocol

1. Read this file (`SESSION_HANDOFF.md`).
2. Read [REVIEW_REPORT.md](REVIEW_REPORT.md) for the original audit context.
3. Read `C:\Users\abc\.claude\plans\we-will-work-on-fuzzy-teacup.md` for full sprint scope, file lists, and verification steps.
4. Check the **Next steps** section below — pick up at the first ☐ task.
5. Run `npm run lint && npm run test && npm run dev` to confirm baseline before changing anything.

---

## Sprint status

| Sprint | Status | Notes |
|---|---|---|
| **S1 — Stabilize & Observe** | ✅ **Complete** | Lint clean, tests passing 10/10, dev server boots, error envelope verified end-to-end via curl |
| **S2 — Compose** | ✅ **Complete** | All sub-phases shipped. Tracks A/C/D + E/F/G/H/I merged. 74/74 tests pass; `npm run build` clean (main bundle 494 KB, down from 728 KB pre-sprint due to lazy-loaded chunks). Browser smoke pending. |
| **S3 — Differentiate** | ☐ Not started | High-leverage features compounding on the compile block model |

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
