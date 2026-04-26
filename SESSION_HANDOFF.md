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
| **S2 — Compose** | 🟡 **In progress (~30%)** | S2.1 ✅ · S2.2 ✅ · 3 parallel tracks A/C/D dispatching next (see below) |
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

## Next steps (resume here)

### Immediate: dispatch 3 parallel agent tracks (REVIEW_REPORT findings A, C, D)

Plan file: `C:\Users\abc\.claude\plans\status-check-did-you-sparkling-biscuit.md`. Each track lists owned/forbidden files; reconciliation order is **A → D → C** (PromptDock hoist comes first, refine pill stacks on it, deep-link/rename slot in last).

| Track | Branch | Closes | Owns |
|---|---|---|---|
| **A — UX cleanup** | `track-a-ux-cleanup` | §1.3 #5/#6/#7, §1.4 (881–1080 band, tablet portrait), §1.5 (Drive/Classroom/Email busy), §S2.9 (welcome modal) | `UploadCard.jsx`, `UploadConfirmModal.jsx`, `OutputColumn.jsx` (PromptDock hoist), `index.css` (responsive band), new `WelcomeModal.jsx` |
| **C — Wire stubs** | `track-c-wire-stubs` | §3.3 (link, SourceTablets, Classroom mock), §S2.6 (filename rename, Drive folder UX) | `ExportBar.jsx`, `OutputColumn.jsx` (rename input), `App.jsx` (deep-link boot), `server/index.js` (folderPath), `src/errors/codes.js` |
| **D — Refine row** | `track-d-refine` | §4.7 (AI Summary/Bullets/Formal/Casual via existing `/api/extract`) | `magicActions.js`, `MagicActions.jsx`, `App.jsx` (runAction extension), `OutputColumn.jsx` (4th pill), new test file |

Each agent runs in an isolated git worktree off the `ogOCR/` repo. Audit B (bugs) is **not** in scope here — Sprint 1 already covered it.

### Then S2.3: Compile export pipeline

- Print → PDF: extend [src/index.css:1280-1324](src/index.css) print rule to `.compile-page`.
- Markdown bundle (`.md`): use existing `compileToMarkdown` from `compile.js`, route through `downloadBlob` in `ExportBar.jsx`.
- HTML bundle (`.html`): use existing `compileToHtml`, route through `downloadBlob`.
- Optional `POST /api/compile/pdf` (puppeteer) — defer unless trivial; gate behind `PDF_ENGINE=puppeteer` env var; fall back to `window.print()`.

### Then S2.4: Multi-file batching & queue

- Server: change `multer.single('file')` → `multer.array('files', 20)` on extract routes. Per-request body cap 200 MiB.
- New `src/queue.js` — sequential client-side queue manager.
- New `src/components/QueueRail.jsx` — appears in `LibraryRail` when items pending.
- `UploadCard.jsx` accepts multi-file drops (currently rejects via `CAP_MULTI_FILE`).
- Mobile: sticky `Queue (3 of 12)` chip atop Library tab.

### Then S2.5: PDF preview

- Add `pdfjs-dist` (preview-only, **not** upload path).
- Render page 1 to canvas in `SourcePreview.jsx:70` and `UploadConfirmModal.jsx:52-60`.
- Note: CLAUDE.md flags this as Phase 12 backlog. Use dynamic import (`import('pdfjs-dist')`) so it doesn't bloat the main bundle.

### Then S2.6 → S2.9 → S2 verification → Sprint 3

Full list in plan file at `C:\Users\abc\.claude\plans\we-will-work-on-fuzzy-teacup.md`.

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
