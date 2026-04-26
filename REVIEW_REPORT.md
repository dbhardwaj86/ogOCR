# Adversarial Code Review — ogOCR

Date: 2026-04-26 · Working tree: `C:\SandBox\claude_box\claudeOCR\ogOCR`

This consolidates four parallel audits:

1. **UX flow vs. commercial OCR apps** (Adobe Scan / MS Lens / Google Lens / Mathpix / ABBYY).
2. **Codebase bug & inconsistency hunt** — leads with the silent take-photo/upload root cause.
3. **Wired vs. stub feature inventory** — with a Compile-builder deep-dive.
4. **Feature roadmap + complete error-code catalog** for every I/O failure mode.

Use the priority queue at the end as the working punch list.

---

## Executive summary

- **Editorial polish is unusually high** (typography, theming, scan-line, camera-bracket corners). What's missing is the *commercial OCR muscle memory*: cancel, retry, multi-page batching, PDF preview, rename-on-export, onboarding.
- **Silent take-photo/upload failure is real** and the dominant root cause is a **progress-cleanup race in [src/App.jsx](src/App.jsx) `runAction`** — see §2.1. The fetch keeps running but the progress UI vanishes ~220 ms after a second action click; the user perceives "nothing happened."
- The **Compile builder** is a 30 %-skeleton that already shares a print stylesheet with worksheet pages — a clean foundation for a real block-based composer (§3.2).
- **Three I/O surfaces silently mock**: `/api/email`, `/api/save-drive`, `/api/classroom/draft`. The user only learns from a toast string they may not read (§3.4).
- **Two real secrets sit in `.env` checked-out tree** (`OPENAI_API_KEY`, `GEMINI_API_KEY`). Rotate now.

---

## 1. UX flow audit vs. commercial OCR apps

### 1.1 Current journey

Single-route SPA, three-pane shell on desktop ([src/App.jsx:294-331](src/App.jsx)) and a `data-mobile-pane` single-pane flow ≤880 px ([src/App.jsx:62,303](src/App.jsx)).

1. **Entry** → user lands on an empty workspace. No tour, no example, three editorial empty strings (`"Upload a document to begin."` [SourceColumn.jsx:12](src/components/SourceColumn.jsx), `"Nothing extracted yet — pick an action."` [RenderedDoc.jsx:61](src/components/RenderedDoc.jsx), `"No extractions yet."` [SessionList.jsx:43-44](src/components/SessionList.jsx)).
2. **Capture/upload** → only one entry: [UploadCard.jsx](src/components/UploadCard.jsx). Long-press flips to confirm modal — gesture is undiscoverable. Mobile-only `Take photo` uses default OS `<input capture>`, no auto-capture, no edge detection. PDF preview is the literal string `"PDF document — preview unavailable"` ([SourcePreview.jsx:71](src/components/SourcePreview.jsx)).
3. **Action selection** → 8 tiles in 4 groups ([MagicActions.jsx](src/components/MagicActions.jsx)). User must pick up-front; no auto-detect. Tiles show `⌥T`/`⌥H`/etc. shortcuts that **are not wired to anything** (only `Cmd+K` is bound, [App.jsx:117-128](src/App.jsx)).
4. **Processing** → faked progress simulation ([App.jsx:171-188](src/App.jsx)) with stage names (`preparing/scanning/recognizing/structuring/finalizing`) **not tied to backend signal**. Internal `AbortController` exists but **no UI cancel button**.
5. **Review** → three pills `Rendered / Source / Compile`. Source is a single editable `<textarea>`, no syntax highlighting, no per-region edit, no original-vs-output split.
6. **Export** → 9 buttons in 3 groups ([ExportBar.jsx:180-205](src/components/ExportBar.jsx)). PDF = `window.print()`. Filename is fixed; Drive folder is hardcoded `ogOCR`.

### 1.2 Where commercial apps win

| Capability | Lens / Adobe / Mathpix | ogOCR today |
|---|---|---|
| Single-tap shutter | Persistent, with auto-capture | Tertiary button under upload card |
| Multi-page batch | Stack-of-pages flow | **`multer.single('file')` server-side** ([server/index.js:140](server/index.js)) — one file per session |
| Edge detection | Yellow polygon + auto-correct | None |
| Processing transparency | Real progress, retry, cancel | Faked timer, no cancel UI, no retry |
| Review | Crop, reorder, rotate, per-page rerun | Read-only image, raw markdown editor |
| Export | Searchable PDF, Word, named save targets | MD/SVG/PDF-via-print + 3 mock targets |
| Recovery | "Try again" inline | Toast `"Extraction failed"` + **error string overwrites session.text** ([App.jsx:254](src/App.jsx)) |
| Naming | Auto descriptive ("Receipt — Dec 12") | Original filename only, no rename |
| Onboarding | 3-step illustrated walkthrough | None |
| Format auto-detect | Auto-routes math/text/barcode | User must pick 1 of 8 tiles |

### 1.3 Top 10 friction points (ordered by severity)

1. **No cancel UI** despite `AbortController` ([App.jsx:210-212](src/App.jsx)). Wire a cancel button in [ProcessingStrip.jsx](src/components/ProcessingStrip.jsx).
2. **Errors destroy results.** [App.jsx:254](src/App.jsx) writes `Error: <msg>` into `session.text`, killing prior extraction. Keep prior payload, surface error as a banner with retry chips.
3. **Single-file architecture.** Server `upload.single('file')` + client `formData.append('file', file)`. Switch to `upload.array('files', 20)` and a client-side queue/composite.
4. **Blank PDF preview.** Render page 1 with `pdfjs-dist` for preview only.
5. **No upload undo/confirm by default.** [UploadConfirmModal.jsx](src/components/UploadConfirmModal.jsx) exists but only behind a hidden long-press.
6. **Hidden long-press** ([UploadCard.jsx:13,68-70](src/components/UploadCard.jsx)) — make confirm the default or expose a toggle.
7. **PromptDock** is locked behind a file but lives at the very bottom of the output column. Elevate it to the hero position the design spec calls for.
8. **8 tiles, no prioritization, no shortcuts wired, no auto-detect.** Either wire `⌥T/H/...` in [App.jsx](src/App.jsx) or remove the misleading `og-tile-key` chip; add a primary "Extract Text" CTA.
9. **PDF export is `window.print()`.** Re-label "Print → PDF" or add real PDF generation (`jspdf` or server `puppeteer`).
10. **Filename + Drive folder fixed.** Add inline rename in [OutputColumn.jsx:38-44](src/components/OutputColumn.jsx); let user pick a Drive subfolder.

### 1.4 Mobile/desktop layout gaps

- **881–1080 px laptop band hides the upload card entirely** ([index.css:925](src/index.css)) — no visible drop target.
- **Tablet portrait drops source preview** when on Output pane — add a collapsible thumbnail strip.
- **Action tiles collapse to single column at 881–1080 px** ([index.css:932](src/index.css)) → 8-row stack pushes source off-screen.
- **No `padding-top: env(safe-area-inset-top)` on `og-topbar`** — wordmark clips on notched iPhones in landscape.
- **Compile-modal buttons < 44 px tap targets** ([App.jsx:349-371](src/App.jsx)).
- Mobile tabs "01/02/03" — labels carry meaning, numbers are decorative noise.

### 1.5 Empty / loading / error state matrix

| Operation | Loading | Empty | Error |
|---|---|---|---|
| Upload validation | n/a | n/a | toast |
| Extract / prompt | strip + scan-line + tile state | n/a | toast + **destroys session.text**, no retry |
| Drive save | **none** | n/a | toast on catch only |
| Email send | button disabled | n/a | toast |
| Classroom draft | **none** | n/a | toast |
| PNG export | n/a | n/a | **silently fails** in `img.onerror` ([ExportBar.jsx:34](src/components/ExportBar.jsx)) |

Add inline busy on Drive/Classroom/Email; surface PNG failure; no offline state anywhere.

### 1.6 Microcopy fixes (top picks)

| Where | Current | Suggested |
|---|---|---|
| [UploadCard.jsx:131](src/components/UploadCard.jsx) | `Drop a document` | `Drop a file or click to browse` |
| [UploadCard.jsx:132](src/components/UploadCard.jsx) | `image · pdf · screenshot` | `JPG · PNG · PDF · up to 10 MB` |
| [UploadConfirmModal.jsx:55](src/components/UploadConfirmModal.jsx) | `PDF preview · rasterisation pending` | `Preview not available — Gemini will read all pages` |
| [UploadConfirmModal.jsx:90](src/components/UploadConfirmModal.jsx) | `Import` | `Use this image` |
| [OutputColumn.jsx:48-58](src/components/OutputColumn.jsx) | `Rendered / Source / Compile` | `Preview / Markdown / Worksheet` |
| [ProcessingStrip.jsx:13](src/components/ProcessingStrip.jsx) | fake stage names | `Working…` + indeterminate after 95 % |
| [ExportBar.jsx:186](src/components/ExportBar.jsx) | `PDF` | `Print → PDF` |
| [ExportBar.jsx:194](src/components/ExportBar.jsx) | `Link` (copies dev URL) | remove until real share-links exist |
| [PromptDock.jsx:12](src/components/PromptDock.jsx) | `Ask Gemini anything…` | `Ask anything — translate, summarize, restructure…` |
| [App.jsx:255](src/App.jsx) toast | `Extraction failed` | `Couldn't read this file. ‹Try again› · ‹Use a smaller file›` |

---

## 2. Codebase bug & inconsistency hunt

### 2.1 ★ Root cause: silent take-photo / upload "did nothing"

**The bug is not in the upload chain — it's a progress-cleanup race in `runAction`.**

When the user clicks action B while action A is still in flight (or just <220 ms after A settled):

- [App.jsx:210-212](src/App.jsx) — B aborts A. A's fetch rejects with `AbortError`.
- A's `catch` ([App.jsx:251-255](src/App.jsx)) returns early on `AbortError`.
- A's **`finally`** ([App.jsx:256-259](src/App.jsx)) **always runs** → `finishProgress()`.
- `finishProgress` ([App.jsx:190-194](src/App.jsx)) does `clearTimeout(progressRef.current)` — but `progressRef.current` already points at **B's** tick timer (line 187). **A's cleanup kills B's progress ticker.**
- It also schedules `setTimeout(() => setProcessing(null), 220)` — 220 ms later **B's processing state is wiped** while B's fetch is still pending.

Net effect: the progress strip + scan-line vanish a quarter-second after click. The fetch is still alive, the result still lands in the session, but there is **no UI signal anything is happening**. Users perceive "the app silently did nothing."

**One-line fix** (in [App.jsx:256-259](src/App.jsx)):

```js
} finally {
  if (!signal.aborted) finishProgress();
  if (abortRef.current?.signal === signal) abortRef.current = null;
}
```

**Proper fix** — make progress lifecycle owned by the request:

```js
const myTick = startProgress(actionId);   // return token
...
} finally {
  if (signal.aborted) {
    if (progressRef.current === myTick) clearTimeout(myTick);
  } else {
    finishProgress();
  }
  if (abortRef.current?.signal === signal) abortRef.current = null;
}
```

`startProgress` should return the timer id; `stopProgress` should compare-and-clear by token, not blind-clear by ref.

**Two adjacent silent paths to fix in the same patch:**

- **`if (processing) return;`** ([App.jsx:201](src/App.jsx)) — clicks during the 220 ms unmount tail are dropped with no toast. Surface a toast (`"Still finishing previous action…"`) or queue the click.
- **`r.json().catch(() => ({}))`** ([App.jsx:225](src/App.jsx)) — malformed JSON gives `{}`; none of the `data.svg/images/text` branches fire, but [App.jsx:250](src/App.jsx) toasts `"<action> complete."` — a **false-positive success**. Assert at least one of the three was present; otherwise throw.

### 2.2 Critical bugs

| ID | File:line | Issue |
|---|---|---|
| **B1** | [.env:1-2](.env) | Real `OPENAI_API_KEY` (unused, OpenAI experiment was reverted per CLAUDE.md) and `GEMINI_API_KEY` sit in working tree. **Rotate both.** Scrub `.env` of the OpenAI line. |
| **B2** | [server/index.js:56](server/index.js) | `express.json()` with no `limit:` — default 100 KB. `/api/save-drive` and `/api/email` accept the entire extracted document; multi-page PDFs blow this. Fix: `app.use(express.json({ limit: '12mb' }));` |
| **B3** | [App.jsx:201](src/App.jsx) | Duplicate magic-action click silently dropped 220 ms after a previous one (see §2.1). |
| **B4** | [App.jsx:190-194,256-259](src/App.jsx) | Abort/finish race tears down progress UI mid-fetch. **Lead bug — see §2.1.** |
| **B5** | [App.jsx:225-250](src/App.jsx) | `r.ok` true + malformed JSON = false-positive "complete" toast. |
| **B6** | [server/index.js:252](server/index.js) | `req.on('close', …)` instead of `res.on('close', …)` — explicitly warned against in CLAUDE.md. Other routes do this correctly (`/api/save-drive`:212). |
| **B7** | [RenderedDoc.jsx:43-48](src/components/RenderedDoc.jsx), [WorksheetBuilder.jsx:42-44](src/components/WorksheetBuilder.jsx) | `dangerouslySetInnerHTML` on raw SVG — relies entirely on DOMPurify with `USE_PROFILES: { svg, svgFilters }`. Currently safe; flagged as fragile. |
| **B8** | [package.json:22](package.json) | `lucide-react@^1.11.0` — not imported anywhere; also a 2020 fork-line version. Remove. |
| **B9** | [package.json:38,42](package.json) | `vite@^8.0.10`, `eslint@^10.2.1`, `@vitejs/plugin-react@^6`, `eslint-plugin-react-hooks@^7`, `globals@^17` — all ahead of stable as of Apr 2026. Pin to current stable lines. |
| **B10** | [server/index.js:58](server/index.js) | `multer.memoryStorage()` + LAN binding + no auth + no rate limit = trivial RAM exhaustion from 50 concurrent uploads (500 MB RSS). Add `express-rate-limit` and a per-IP semaphore. |

### 2.3 Inconsistencies

- Two `NEXT_THEME` constants ([App.jsx:49](src/App.jsx) and [TopBar.jsx:5](src/components/TopBar.jsx)) — duplicated source of truth.
- `webViewLink` returned by `/api/save-drive` is silently discarded by client ([ExportBar.jsx:107](src/components/ExportBar.jsx)).
- `KIND_LABEL` map in [magicActions.js:65-74](src/magicActions.js) tightly coupled to action ids; new id without map update silently falls back to `'Document'` ([OutputColumn.jsx:23](src/components/OutputColumn.jsx)).
- [SessionList.jsx:13](src/components/SessionList.jsx) — `<div role="button" tabIndex={0}>` with **no `onKeyDown`**. Keyboard users can focus, can't activate.
- `sanitizeSvg` defined identically in two files — extract to a util.
- `prompt` validated only on `/api/extract`; the other two routes silently ignore it.
- Default extract prompt duplicated client + server (different wording in two places).
- [scripts/list-models.js:2](scripts/list-models.js) — `dotenv.config()` with no path. Use `new URL('../.env', import.meta.url)` like the other scripts.

### 2.4 Server hardening

- **No auth.** Every `/api/*` route is open. With `0.0.0.0` binding (intentional), anyone on LAN can drive Gemini/Drive/Email. Add a long random shared-secret header check, opt-in via env.
- **No `helmet`, no `hpp`, no `express-rate-limit`** — standard hardening absent.
- `getOrCreateOgFolder` Drive query interpolates `DRIVE_FOLDER_NAME` directly ([server/index.js:122](server/index.js)). Today it's a literal; if it ever becomes user-supplied an apostrophe breaks the query — escape defensively.
- `sanitizeDriveFilename` ([server/index.js:99-106](server/index.js)) doesn't strip Unicode direction-overrides (`‎‮`).
- `Readable.from(typeof text === 'string' ? text : '')` ([server/index.js:222](server/index.js)) silently saves empty string when body type is unexpected.
- `/api/email` has no `withTimeout` wrapper — a wedged SMTP hangs forever.
- `cors` regex doesn't accept `http://[::ffff:127.0.0.1]:PORT` dual-stack origins.

### 2.5 Frontend issues

**Memory / lifecycle**
- [SourcePreview.jsx:25-32](src/components/SourcePreview.jsx) — `useMemo(() => URL.createObjectURL(file), [file])`. React 19 + StrictMode runs the factory twice in dev → leaked blob URL. Use `useEffect` for allocation. Same in [UploadConfirmModal.jsx:13-21](src/components/UploadConfirmModal.jsx).
- [ExportBar.jsx:33](src/components/ExportBar.jsx) — `img.onerror` revokes URL but if `canvas.toDataURL` throws (tainted canvas), URL is never revoked. Wrap in try/finally.
- [App.jsx:113](src/App.jsx) — toast timer not stored in a ref; new toast within 2.4 s leaves an orphan that nulls the new toast prematurely.

**Accessibility**
- `<kbd>⌥{key}</kbd>` chips in [MagicActions.jsx:17-29](src/components/MagicActions.jsx) advertise hotkeys that **aren't bound**. Either wire them or remove the chip.
- No focus trap in [CommandPalette.jsx](src/components/CommandPalette.jsx), [UploadConfirmModal.jsx](src/components/UploadConfirmModal.jsx), or the compile modal.
- [Toast.jsx:3](src/components/Toast.jsx) — add explicit `aria-live="polite"`.
- No skip link.

### 2.6 Dependency / security

- `cors@^2.8.6` — current published is 2.8.5; `^2.8.6` resolves nothing today. Pin to `^2.8.5`.
- `nodemailer@^8.0.6` — current line is 6.9.x; 8.x looks like a yanked or typo'd version. Verify install.
- Vite/ESLint/plugin majors all pre-stable (B9).
- `react@^19.2.5`, `multer@^2.1.1`, `googleapis@^144`, `dompurify@^3.4.1` — fine.
- No `.env` startup validation beyond `GEMINI_API_KEY`. Print resolved CORS policy at boot.

---

## 3. Wired vs. stub feature inventory

### 3.1 Inventory table

| Feature | UI entry | Backend | Status |
|---|---|---|---|
| Extract text (6 markdown variants) | [MagicActions.jsx:17-29](src/components/MagicActions.jsx) → `runAction` | `/api/extract` [server/index.js:140-166](server/index.js) | **Wired** |
| Sketch → SVG | same | `/api/sketch-to-svg` [server/index.js:255-277](server/index.js) | **Wired** |
| Extract images (image input) | same | `/api/extract-images` (image branch with `sharp`) | **Wired** |
| Extract images (PDF input) | same | [server/index.js:360-369](server/index.js) | **Stub** — returns descriptions + bboxes only, `data: null`. Needs PDF rasterizer. |
| Custom prompt | [PromptDock.jsx](src/components/PromptDock.jsx) | `/api/extract` (forced text) | **Wired** |
| Image preview | [SourcePreview.jsx](src/components/SourcePreview.jsx) | n/a | **Wired** |
| PDF preview | [SourcePreview.jsx:70](src/components/SourcePreview.jsx) | n/a | **Stub** — literal "preview unavailable" |
| Upload (drop / click / camera / long-press confirm) | [UploadCard.jsx:104-169](src/components/UploadCard.jsx) | n/a | **Wired** (long-press is undiscoverable) |
| Sessions persist / activate / delete | [SessionList.jsx](src/components/SessionList.jsx) | localStorage | **Wired** |
| Theme cycle | [TopBar.jsx:41-47](src/components/TopBar.jsx) | n/a | **Wired** |
| Command palette ⌘K | [CommandPalette.jsx](src/components/CommandPalette.jsx), [App.jsx:116-129](src/App.jsx) | n/a | **Wired** |
| Mobile pane tabs | [MobileTabs.jsx](src/components/MobileTabs.jsx) | n/a | **Wired** |
| Save → Drive | [ExportBar.jsx:97-111,184](src/components/ExportBar.jsx) | `/api/save-drive` | **Wired (gated) / Mock** when `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN` unset (current `.env`) |
| Save → MD / SVG | [ExportBar.jsx:156-163](src/components/ExportBar.jsx) | n/a | **Wired** |
| Save → PDF | [ExportBar.jsx:165-168](src/components/ExportBar.jsx) | n/a | **Wired (light)** — `window.print()` |
| Share → Email | [ExportBar.jsx:128-145](src/components/ExportBar.jsx) | `/api/email` | **Wired (gated) / Mock** when `SMTP_USER/PASS` unset (current `.env`). Returns `success:true` either way. |
| Share → Classroom | [ExportBar.jsx:113-126](src/components/ExportBar.jsx) | `/api/classroom/draft` | **Mock only** — no env path to make it real |
| Share → Link | [ExportBar.jsx:147-154](src/components/ExportBar.jsx) | n/a | **Stub** — copies `window.location.href` (dev URL) |
| Export → Copy / PNG / JSON | [ExportBar.jsx:170-178,200-203](src/components/ExportBar.jsx) | n/a | **Wired** |
| **Compile (Worksheet builder)** | Pill [OutputColumn.jsx:54-58](src/components/OutputColumn.jsx) → modal [App.jsx:349-371](src/App.jsx) → [WorksheetBuilder.jsx](src/components/WorksheetBuilder.jsx) | n/a | **Skeleton ~30 %** — see §3.2 |
| Diff pill / per-token confidence | absent | absent | **Missing** (intentional per CLAUDE.md) |
| Source tablets (DPI/W×H/CONF/LANG) | [SourceTablets.jsx](src/components/SourceTablets.jsx) | n/a | **Disabled** — `showTablets={false}` ([App.jsx:318](src/App.jsx)) |
| `list-models.js` debug helper | terminal-only | direct Gemini SDK | **Wired** (no script entry in package.json) |
| Drive bootstrap | `scripts/bootstrap-drive.js` | self-hosted on `127.0.0.1:3002` | **Wired** |

### 3.2 Compile builder deep-dive

**What exists**

- Trigger A: Compile pill in [OutputColumn.jsx:54-58](src/components/OutputColumn.jsx) → `setCompileOpen(true)`.
- Trigger B: Palette command `Open Worksheet Builder` ([App.jsx:271,285](src/App.jsx)).
- Modal shell [App.jsx:349-371](src/App.jsx): full-screen shroud, `Print` (= `window.print()`) and `Close` only.
- Renderer [WorksheetBuilder.jsx:13-56](src/components/WorksheetBuilder.jsx): sorts sessions ascending by date; for each session emits sanitized SVG or markdown. Wraps each in `.worksheet-page` ([index.css:886-898](src/index.css)).
- Print stylesheet [index.css:1280-1324](src/index.css) is already plumbed for `page-break-after: always`.

**Gaps**: no selection (every session in), no reorder, no grouping, can't compose text + SVG + images in one page (each session = its own page), no header/footer/cover, no rich export (only print).

**Available data sources**

| Source | Currently lives in | Field |
|---|---|---|
| Markdown / LaTeX / Mermaid (`/api/extract`) | session | `text: string` |
| SVG (`/api/sketch-to-svg`) | session | `svg: string` |
| Image set (`/api/extract-images`) | session | **flattened** into `text` as base64 `data:image/png;…` blob — original structured array is lost ([App.jsx:237-244](src/App.jsx)) |

**Proposed implementation**

*Data model* — new `localStorage` key `ogOCR_compiles`:

```js
{
  id, name, createdAt, updatedAt,
  blocks: Block[],                   // ordered
  pageSize: 'a4'|'letter',
  theme, header?, footer?
}
type Block =
  | { id, kind: 'text',     text }
  | { id, kind: 'svg',      svg }
  | { id, kind: 'image',    src, caption? }
  | { id, kind: 'pageBreak' }
  | { id, kind: 'session',  sessionId }   // live pointer
```

*UI* — replace the modal contents with a 3-region layout inside the existing shroud:

1. **Inspector rail (260 px left)** — list of compiles + "New compile". Below: a palette of available source blocks (each session, each extracted image as its own draggable thumbnail). Requires keeping `session.images` array structured instead of flattening.
2. **Canvas (center)** — vertical list of draggable cards (HTML5 DnD; no new dep). Per-block: delete handle, kind glyph, edit button (text/markdown opens an inline `<textarea>`; SVG opens code drawer; image gets crop/caption).
3. **Outline / settings (240 px right, collapsible)** — name, page size, theme, header/footer template, Print, Export…

*Export pipeline*

| Format | How |
|---|---|
| Print → PDF | Keep `window.print()` — print stylesheet already paginates `.worksheet-page` |
| Markdown bundle (`.md`) | Concat text verbatim; SVG → URL-encoded data URL; images → base64 data URL; `\n\n---\n\n` separator |
| HTML bundle | Inline tokens block + rendered output, self-contained |
| Drive upload | Extend `/api/save-drive` MIME table; for true PDF add `POST /api/compile/pdf` using `puppeteer` |
| DOCX / PPTX | Defer to v2 |

*Files to add*

```
src/compile.js                    # createCompile, addBlock, reorderBlocks, compileToMarkdown, compileToHtml
src/components/CompileBuilder.jsx # replaces WorksheetBuilder.jsx
src/components/CompileBlockCard.jsx
src/components/CompilePalette.jsx
```

Modify [App.jsx#runAction](src/App.jsx) to keep `session.images` structured (don't flatten into markdown). Persist `compiles[]` with the existing 400 ms-debounced localStorage pattern + quota circuit-breaker.

### 3.3 Disconnected wires & quick wins

- **`SourceTablets`** — wired but force-disabled. Either delete or surface a `confidence` field from backend.
- **`/api/classroom/draft`** — pure mock. Either build the Classroom OAuth (analogous to `bootstrap-drive.js`) or hide the button.
- **Share → Link** — change to `?session=<id>` + read on boot. Two-line change.
- **`scripts/list-models.js`** — add a `package.json` script entry.
- **`OPENAI_API_KEY` in `.env`** — non-functional; scrub and rotate.
- **`progressRef` 95 %-cap** ([App.jsx:182](src/App.jsx)) — show indeterminate stripe after 95 % so it doesn't look frozen.

### 3.4 Mock-mode silent paths

Mock state is currently surfaced **only** via the response `message` string in a normal-color toast — easy to miss.

| Route | Mock trigger | What user sees today |
|---|---|---|
| `/api/email` | `SMTP_USER` or `SMTP_PASS` unset | green/standard toast `"Email mock sent! Configure SMTP_USER and SMTP_PASS in .env for real emails."` — HTTP 200, dialog closes |
| `/api/save-drive` | Any of `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN` unset | toast `"Successfully saved … (Mock)!"` |
| `/api/classroom/draft` | Always mock (no real path exists) | toast `"Successfully drafted … (Mock)!"` |

**Fix**: add `GET /api/_status` returning `{ gemini, email, drive, classroom: 'real'|'mock' }`. Render a single `MOCK · email,classroom` pill in the top bar when any subsystem is mocked. Color toasts by the presence of `(Mock)` in the message.

---

## 4. Feature roadmap (12 suggestions)

Ordered by leverage, not effort. Effort: S/M/L. **Differentiator** = real wedge vs commercial apps; **Table-stakes** = expected baseline.

### 4.1 Live LaTeX preview block — **S, differentiator**
Split: textarea ↔ KaTeX render. New `Equation` pill in [OutputColumn.jsx](src/components/OutputColumn.jsx) toolbar (4th pill, enabled when `kind==='math'`). Mobile: header chip toggles edit/preview. No new deps.

### 4.2 Table → live spreadsheet block — **M, differentiator**
New `TableBlock.jsx` rendered by [RenderedDoc.jsx](src/components/RenderedDoc.jsx) when markdown contains a fenced table. Toolbar: Sort, Add row/col, Export CSV/XLSX. Reused inside `WorksheetBuilder` so compiles stack heading + real grid. Deps: `papaparse`; lazy-load `xlsx`. *MVP cut*: editable cells + CSV only.

### 4.3 Batch OCR queue — **M, table-stakes**
Multi-file drop → per-item queue with progress + cancel. New `QueueRail.jsx` above `SessionList`. Server: `multer.array('files', 20)`. *MVP cut*: sequential, single action, cancel-all only.

### 4.4 Multi-language toggle + auto-detect — **S, table-stakes**
`LanguagePill.jsx` in [SourceColumn.jsx](src/components/SourceColumn.jsx) header strip. Detection from a `__detected_lang` line in the model response; override re-runs with `forceLanguage`. *MVP*: detection display only.

### 4.5 Voice annotation per session — **M, differentiator**
Mic button in [SourcePreview.jsx](src/components/SourcePreview.jsx) top-right. Mobile: hold-to-record FAB. New `/api/transcribe` → Gemini. `session.note = { audioBlob, text }` — use blob URL for playback (don't base64 into localStorage). *MVP*: record + transcript only, no playback in compile.

### 4.6 Page-to-section auto-grouping in compile — **M, differentiator**
Heading/page-break regex → auto-outline panel in `CompileBuilder`. *MVP*: heading-based grouping only (`^#{1,3} `).

### 4.7 AI rewrite / summarize / tone block — **S, table-stakes**
New `Refine` row under [MagicActions.jsx](src/components/MagicActions.jsx) (`Summary`, `Bullets`, `Formal`, `Casual`). Sibling block under `session.refinements`. No new endpoint — reuse `/api/extract`. *MVP*: `Summary` only.

### 4.8 Signature capture — **S, differentiator**
`SignatureModal.jsx` in `Save` group of [ExportBar.jsx](src/components/ExportBar.jsx). Draw canvas + library of up to 5 stored signatures. Inserted as inline SVG. Mobile: long-press in compile pane → action sheet.

### 4.9 Pen / stylus markup layer — **M, differentiator**
`MarkupLayer.jsx` over `<img>` in [SourcePreview.jsx](src/components/SourcePreview.jsx). Pen / highlighter / arrow / text / eraser. Pointer Events native. Persistence: `session.markup = '<svg>…</svg>'`. iPad Pencil detected via `pointerType==='pen'`. *MVP*: pen + eraser, no persistence.

### 4.10 Share-to-anywhere smart sheet — **S, table-stakes**
Collapse 9 export buttons → 3 (`Save / Share / Export`) with menus. Mobile: single FAB → `navigator.share()`. Hides backend gaps.

### 4.11 Per-token confidence heatmap — **L, differentiator** *(blocked on backend)*
Re-enables the long-promised Diff pill. Color-codes spans by `tokens[i].p`. Requires `/api/extract` to return `tokens: [{text,p}]` (Gemini `responseLogprobs` if available). *MVP*: heuristic — ask the model to wrap uncertain words in `<?word?>`, parse client-side.

### 4.12 Diagrams as first-class editable Mermaid — **S, table-stakes**
4th pill `Diagram` (when `kind==='mermaid'`). Two-up: code ↔ rendered SVG. Lazy-load `mermaid` (~400 KB).

### 4.13 Compile-builder leverage map

Features that compound directly into `WorksheetBuilder`: **#1 LaTeX, #2 Spreadsheet, #5 Voice, #6 Outline grouping, #8 Signature, #9 Markup**. Build the compile data model first; add these as block kinds.

---

## 5. Error code & hint catalog

### 5.1 Architecture

**Central registry: `src/errors/codes.js`** — frozen object keyed by code:

```js
{ code, surface, message, hint, severity, log }
```

`surface ∈ { toast, inline, modal, overlay }`; `severity ∈ { info, warn, error, fatal }`; `log: bool` controls inclusion in diagnostics ring buffer.

Components import `errFromResponse(json)` and `showError(code, contextOverrides)`. Server emits a stable envelope:

```json
{ "error": { "code": "OCR_QUOTA", "message": "…", "hint": "…" } }
```

Server only sends the **code** (+ optional context); client owns the copy. Lint check in CI grepping `code:` literals across both `src/errors/codes.js` and `server/errors.js` keeps them aligned.

**Diagnostics overlay**: `DiagnosticsPanel.jsx`, `Shift+?` (Mac `Cmd+?`). Ring buffer of last 5 errors, "Copy details" → code + UA + last fetch URL.

### 5.2 Capture / upload (`CAP_*`)

| Code | Trigger | Message | Hint | Surface | Log |
|---|---|---|---|---|---|
| `CAP_PERM_DENIED` | `getUserMedia` `NotAllowedError` | "Camera access was blocked." | "Allow camera in your browser settings, then tap to retry." | inline + Retry | ✓ |
| `CAP_NO_DEVICE` | `NotFoundError` | "No camera found on this device." | "Plug in a camera, or upload a file instead." | inline | ✓ |
| `CAP_DEVICE_BUSY` | `NotReadableError`/`TrackStartError` | "Camera is in use by another app." | "Close other apps using the camera and try again." | inline | ✓ |
| `CAP_NO_API` | `mediaDevices` undefined | "Live capture isn't supported by this browser." | "Use the upload button, or open this page in Safari/Chrome." | inline | ✓ |
| `CAP_HTTPS_REQUIRED` | `getUserMedia` rejected on http non-loopback | "Camera needs a secure connection." | "Open this page over HTTPS or visit `localhost`." | inline | ✓ |
| `CAP_FILE_TOO_LARGE` | client > 10 MiB or server 413 | "That file is over the 10 MB limit." | "Compress the image or split the PDF and try again." | toast | ✓ |
| `CAP_BAD_MIME` | type not in `image/*` ∪ `application/pdf` | "We can't read that file type yet." | "Use a JPG, PNG, WEBP, or PDF." | toast | ✓ |
| `CAP_PDF_NOT_ALLOWED` | PDF on image-only action | "Image extraction works on images only right now." | "Try Extract Text on this PDF instead." | inline | — |
| `CAP_FILE_CORRUPT` | preview decode / `sharp` metadata throws | "We couldn't read that file." | "It may be corrupted — try saving a fresh copy." | modal | ✓ |
| `CAP_MULTI_FILE` | multi-file drop where unsupported | "Drop one file at a time." | "Multi-file is coming soon. Pick the most important one." | toast | — |
| `CAP_OFFLINE` | `navigator.onLine === false` or fetch network error | "You're offline." | "Reconnect and tap Retry — your file is still here." | inline + Retry | ✓ |
| `CAP_ABORTED` | user cancel | "Upload cancelled." | "Tap a file again when you're ready." | toast (info) | — |
| `CAP_NO_FILE` | server got POST with no file part | "Something went wrong sending the file." | "Try the upload again." | toast | ✓ |

### 5.3 Processing (`OCR_*`)

| Code | Trigger | Message | Hint | Surface | Log |
|---|---|---|---|---|---|
| `OCR_NO_KEY` | server missing key marker | "Server isn't configured for OCR yet." | "Add `GEMINI_API_KEY` to `.env` and restart `npm run dev`." | modal (dev) | ✓ |
| `OCR_BAD_KEY` | Gemini 401/403 `API_KEY_INVALID` | "Server's OCR key isn't accepted." | "Check the key in `.env` — it may have been rotated." | modal | ✓ |
| `OCR_QUOTA` | Gemini 429 | "OCR is busy right now." | "Wait a minute and tap Retry." | toast + Retry | ✓ |
| `OCR_DAILY_LIMIT` | 429 `quota: "daily"` | "Daily OCR limit reached." | "Resets at midnight UTC, or upgrade the API plan." | modal | ✓ |
| `OCR_TIMEOUT` | `withTimeout` fires | "OCR is taking too long on this one." | "Try a smaller file, or fewer PDF pages at a time." | toast + Retry | ✓ |
| `OCR_EMPTY` | empty `text/svg/images` | "We didn't see anything we could read." | "The image may be blank or too dark — try better lighting." | inline | ✓ |
| `OCR_LOW_RES` | natural < 200×200 | "This image is too small to read reliably." | "Re-scan at higher resolution." | inline | ✓ |
| `OCR_SAFETY_BLOCK` | `promptFeedback.blockReason` | "We can't process this content." | "If this looks wrong, try cropping to just the text area." | toast | ✓ |
| `OCR_MALFORMED_JSON` | `extract-images` parse fails | "OCR returned something we can't read." | "Tap Retry — it usually works on the second attempt." | toast + Retry | ✓ |
| `OCR_PDF_TOO_LONG` | > 50 pages in compile | "This PDF has more pages than we can compile at once." | "Split it into chunks of 50 pages or fewer." | modal | ✓ |
| `OCR_NO_NETWORK` | fetch TypeError | "Can't reach the server." | "Check your connection — your work is saved locally." | toast | ✓ |
| `OCR_INTERNAL` | unmapped 500 | "Something broke on our end." | "Tap Retry. If it keeps happening, open the diagnostics panel." | toast | ✓ |
| `OCR_ABORTED` | new run aborts old | (silent) | (silent) | log only | ✓ |

### 5.4 Export (`EXP_*`)

| Code | Trigger | Message | Hint | Surface | Log |
|---|---|---|---|---|---|
| `EXP_EMAIL_SMTP_AUTH` | nodemailer `EAUTH` | "Email server rejected our credentials." | "Update `SMTP_USER` / `SMTP_PASS` in `.env`." | modal | ✓ |
| `EXP_EMAIL_NETWORK` | nodemailer connection/timeout | "Couldn't reach the email server." | "Check the network and try again." | inline | ✓ |
| `EXP_EMAIL_BAD_RECIPIENT` | regex reject | "That email address looks off." | "Double-check the spelling — needs an `@` and a domain." | inline | — |
| `EXP_EMAIL_NO_CONTENT` | empty session | "There's nothing to send yet." | "Run an action on a file first." | toast | — |
| `EXP_DRIVE_AUTH_EXPIRED` | Drive 401 | "Drive needs to be reconnected." | "Run `npm run bootstrap-drive` and try again." | modal | ✓ |
| `EXP_DRIVE_SCOPE_MISSING` | Drive 403 insufficient scope | "Drive doesn't have permission to save here." | "Re-bootstrap Drive — the scope changed." | modal | ✓ |
| `EXP_DRIVE_QUOTA` | `storageQuotaExceeded` | "Your Drive is full." | "Free up space, or save locally instead." | toast | ✓ |
| `EXP_DRIVE_TIMEOUT` | 30 s wrapper | "Drive is slow today." | "Tap Retry, or save as MD and upload manually." | toast + Retry | ✓ |
| `EXP_DRIVE_GENERIC` | Drive 5xx | "Drive save didn't go through." | "Tap Retry — Drive might be having a moment." | toast + Retry | ✓ |
| `EXP_PDF_FONT` | `document.fonts.ready` rejects | "PDF generated without a font." | "Switch theme to Paper for cleanest output." | toast | ✓ |
| `EXP_PDF_TOO_LARGE` | > 200-page heuristic | "This PDF is too big to render in one shot." | "Compile a smaller section at a time." | modal | ✓ |
| `EXP_PDF_BLOCKED` | print pop-up blocked | "Your browser blocked the print dialog." | "Allow pop-ups for this page and try again." | inline | ✓ |
| `EXP_SVG_PATH_LIMIT` | path count > 5000 | "This SVG is too detailed for PNG export." | "Save as SVG instead — vector keeps full quality." | toast | ✓ |
| `EXP_SVG_BROWSER_LIMIT` | `Image.onerror` during raster | "Your browser couldn't rasterize this SVG." | "Save as SVG, or try a different browser." | toast | ✓ |
| `EXP_FILENAME_INVALID` | sanitization stripped to empty | "Filename had only invalid characters." | "Renamed to `ogOCR_Document.txt` — rename in Drive after." | toast (info) | ✓ |
| `EXP_FILENAME_COLLISION` | duplicate in Drive folder | "A file with that name already exists." | "Rename, or save anyway as a duplicate." | modal | ✓ |
| `EXP_DOWNLOAD_BLOCKED` | `<a download>` no-op (Safari iOS) | "Your browser didn't start the download." | "Long-press the document and use Share → Save to Files." | inline | ✓ |
| `EXP_CLIPBOARD_DENIED` | `clipboard.writeText` `NotAllowedError` | "Copy was blocked by the browser." | "Click into the page and try again, or select + Cmd/Ctrl-C manually." | toast | ✓ |
| `EXP_CLIPBOARD_NO_API` | `clipboard` undefined | "Copy isn't available in this browser." | "Switch to Source mode and select-all manually." | toast | ✓ |
| `EXP_CLASSROOM_MOCK` | only path Classroom can take today | "Classroom export is in preview." | "We logged the draft locally — real Classroom save is coming soon." | toast (info) | — |
| `EXP_LINK_SELF_ONLY` | current Link button | "Link copied — note this only works on your network." | "Multi-device share link is on the roadmap." | toast (info) | — |

### 5.5 Surfacing rules

1. **Toast** — transient, recoverable. 6 s auto-dismiss, longer for `error`. Single-toast queue.
2. **Inline** — `<InlineError code={...} onRetry={...}/>` in the originating component.
3. **Modal** — needs decision or dev-facing config. Reuse `og-palette-shroud`.
4. **Overlay** — diagnostics panel only.

### 5.6 Voice rules

- Never blame the user. "We can't read that file type" not "Your file is wrong."
- One sentence message + one sentence hint. Hint always points to a concrete next action.
- No model jargon in user copy ("Gemini" → "OCR"). Dev modals may mention env vars.
- Code is stable; copy is changeable.

### 5.7 File layout

```
src/errors/
  codes.js                # frozen registry
  log.js                  # ring buffer + pubsub
  errFromResponse.js      # parse server envelope → registry
  showError.js            # dispatch by surface
  InlineError.jsx
  DiagnosticsPanel.jsx    # Shift+?
server/
  errors.js               # mirror (subset)
  sendError.js            # writes { error: { code, message, hint } }
```

---

## 6. Priority queue (ship in this order)

1. **Fix abort/finish race in `runAction`** — the silent-fail epicenter ([App.jsx:256-259](src/App.jsx)). One-line guard, then proper token-based progress.
2. **Surface `if (processing) return` early-bail** with a toast ([App.jsx:201](src/App.jsx)).
3. **Throw on empty-result success** in runAction's response branch ([App.jsx:228-249](src/App.jsx)).
4. **Fix `req.on('close', …)` → `res.on('close', …)`** in `/api/classroom/draft` ([server/index.js:252](server/index.js)).
5. **Add `express.json({ limit: '12mb' })`** ([server/index.js:56](server/index.js)).
6. **Rotate `GEMINI_API_KEY` and `OPENAI_API_KEY`; scrub `.env`** of the OpenAI line.
7. **Add wire-cancel UI** in `ProcessingStrip`; stop overwriting `session.text` on error.
8. **Drop dead `lucide-react`; pin Vite/ESLint to current stable lines.**
9. **Add `ErrorBoundary` around `<RenderedDoc>`** + a `window.unhandledrejection` toast hook so async failures surface.
10. **Stand up the error-code registry** (`src/errors/codes.js`) and migrate the highest-value 5 paths first: capture-permission-denied, file-too-large, OCR-quota, drive-auth-expired, clipboard-denied.
11. **Add `GET /api/_status`** + a `MOCK · email,classroom` pill in the top bar.
12. **Compile-builder rebuild** — new data model + 3-region UI; flip `runAction` to keep `session.images` structured; add MD/HTML bundle export.
13. **Then the differentiator features**, anchored on compile-builder leverage: live LaTeX → editable spreadsheet block → page outline grouping → signature → markup layer.

The first 6 are bug fixes (≤ a day combined). 7–11 are scaffolding for everything that follows. 12 is the build target you named. 13 is what makes the app a competitor.
