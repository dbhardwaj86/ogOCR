// Compile data model. A "compile" is an ordered list of blocks the user
// composes from extraction sessions. Persists to localStorage under
// `ogOCR_compiles`. Block kinds:
//   - text       : raw markdown
//   - svg        : SVG markup
//   - image      : data URL or remote URL with optional caption
//   - pageBreak  : page-separator marker (no content)
//   - session    : live pointer to a session — re-renders on session update
//
// `compile.blocks` is the source of truth for ordering. Each block has its
// own id (generated locally) so reordering is a simple list mutation.
//
// Schema:
//   v1 — initial layout (Sprint 2.2).
//   v2 — image blocks no longer carry a `data:` URL in `block.src`. Bytes
//        live in IndexedDB (see `src/storage/idb.js#setCompileImage`); the
//        block stores a short reference like `idb:cimg_<id>`. Mirrors the
//        v3 → v4 session-image migration. Run `hydrateCompileImages` (data
//        URI form) or `resolveCompileImageObjectUrls` (object URL form)
//        before exporting / rendering. The migration is idempotent —
//        running it twice on a v2 compile is a no-op.
//   v3 — per-source auto-compiled worksheets. Adds `compile.sourceId`
//        (string | null; null = manual cross-source compile, a session id =
//        system-managed auto-compile bound to that session) and
//        `block.role` (`'manual'` | `'auto:text'` | `'auto:svg:main'` |
//        `'auto:svg:sketch-<id>'` | `'auto:image:<imgId>'` |
//        `'auto:refinement:<kind>'`). `syncAutoBlocks(compile, session)`
//        reconciles all auto-tagged blocks from a session snapshot;
//        manual blocks and user drag-reorders are never touched.
//   v4 — action-keyed auto blocks. The single `'auto:text'` and
//        `'auto:svg:main'` slots are gone — each magic action's output
//        gets its own block keyed by `auto:text:<actionId>` or
//        `auto:svg:<actionId>` (e.g. `auto:text:text`, `auto:text:math`,
//        `auto:svg:sketch`). This means running Extract-text after Math-
//        to-LaTeX no longer wipes the Math output from the worksheet —
//        every distinct action accumulates its own block, while re-running
//        the SAME action replaces in place. Reconciliation reads from a
//        new `session.outputs` map (`{ [actionId]: { kind, text|svg } }`)
//        populated by `runAction`. Migration: legacy `auto:text` and
//        `auto:svg:main` blocks are demoted to `manual` so existing
//        compiles keep their content as historical snapshots and the new
//        action-keyed blocks accumulate alongside.

import { sanitizeSvg } from './svgSanitize';
import {
  setCompileImage,
  getCompileImage,
  blobToDataURL,
} from './storage/idb';

export const COMPILE_SCHEMA_VERSION = 4;
export const COMPILE_STORAGE_KEY = 'ogOCR_compiles';
export const ACTIVE_COMPILE_KEY = 'ogOCR_active_compile';

export const BLOCK_KINDS = Object.freeze({
  TEXT: 'text',
  SVG: 'svg',
  IMAGE: 'image',
  PAGE_BREAK: 'pageBreak',
  SESSION: 'session',
  EQUATION: 'equation',
});

// Block-role tags. Manual blocks (added through the palette / insert rail)
// wear `'manual'`; auto-managed blocks wear an `auto:*` tag below.
// AUTO_TEXT and AUTO_SVG_MAIN are v3 legacy roles — never produced from v4
// onwards, but kept for migration logic + tests that reference them.
export const BLOCK_ROLES = Object.freeze({
  MANUAL: 'manual',
  AUTO_TEXT: 'auto:text',
  AUTO_SVG_MAIN: 'auto:svg:main',
});

// v4 — action-keyed role helpers. Each magic-action's output gets its own
// block keyed by actionId so different actions accumulate in the worksheet
// instead of overwriting one shared slot.
export function autoTextActionRole(actionId) {
  return `auto:text:${actionId}`;
}
export function autoSvgActionRole(actionId) {
  return `auto:svg:${actionId}`;
}

export function autoSvgSketchRole(sketchId) {
  return `auto:svg:sketch-${sketchId}`;
}
export function autoImageRole(imgId) {
  return `auto:image:${imgId}`;
}
export function autoRefinementRole(kind) {
  return `auto:refinement:${kind}`;
}

export function isAutoRole(role) {
  return typeof role === 'string' && role.startsWith('auto:');
}

// Canonical-order rank for auto-tagged blocks. Manual blocks return Infinity
// so they don't participate in canonical ordering — their position is
// preserved as-is when sync runs. Within the same rank, blocks accumulate
// in insertion order (since `insertAtCanonicalPosition` inserts before the
// first higher-rank block).
export function autoRoleRank(role) {
  if (typeof role !== 'string') return Infinity;
  // v3 legacy roles still map to their old positions in case they slip
  // through the migration.
  if (role === BLOCK_ROLES.AUTO_TEXT) return 0;
  if (role === BLOCK_ROLES.AUTO_SVG_MAIN) return 1;
  // v4: action-keyed sketch slots come BEFORE generic action-keyed svg
  // (auto:svg:sketch-…) so the picker stays grouped together. Order:
  //   auto:text:*       → 0
  //   auto:svg:<action> → 1   (e.g. auto:svg:sketch — single-sketch path)
  //   auto:svg:sketch-* → 2   (per-sketch picker outputs)
  //   auto:image:*      → 3
  //   auto:refinement:* → 4–7
  if (role.startsWith('auto:text:')) return 0;
  if (role.startsWith('auto:svg:sketch-')) return 2;
  if (role.startsWith('auto:svg:')) return 1;
  if (role.startsWith('auto:image:')) return 3;
  if (role === 'auto:refinement:summary') return 4;
  if (role === 'auto:refinement:bullets') return 5;
  if (role === 'auto:refinement:formal') return 6;
  if (role === 'auto:refinement:casual') return 7;
  return Infinity;
}

const PAGE_SIZES = ['a4', 'letter'];

export function newId(prefix = 'b') {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function createCompile({
  name = 'Untitled compile',
  theme = 'paper',
  sourceId = null,
} = {}) {
  const ts = Date.now();
  return {
    id: newId('c'),
    name,
    createdAt: ts,
    updatedAt: ts,
    blocks: [],
    pageSize: 'a4',
    theme,
    header: '',
    footer: '',
    sourceId,
    version: COMPILE_SCHEMA_VERSION,
  };
}

export function migrateCompile(c) {
  if (!c || typeof c !== 'object') return null;
  if (c.version === COMPILE_SCHEMA_VERSION) return c;
  // v1 → v2: stamp the version. The actual offload of `data:` image bytes
  // out of `block.src` and into IDB is performed by `migrateCompileImagesToIDB`
  // (async) which the App calls once after mount. Keeping the sync migration
  // free of IO mirrors the v3 → v4 session-image pattern in App.jsx — a
  // synchronous IDB write would block the initial render.
  // v2 → v3: default `sourceId` to null (manual cross-source compile) and
  // tag every existing block with `role: 'manual'` so auto-sync never
  // touches user-built compiles retroactively.
  // v3 → v4: legacy `auto:text` and `auto:svg:main` slots no longer exist
  // — demote them to `manual` so the user keeps their content as a
  // historical snapshot, and future extractions accumulate as new
  // action-keyed blocks alongside.
  const blocks = Array.isArray(c.blocks)
    ? c.blocks.map(b => {
      if (!b) return b;
      const next = b.role ? b : { ...b, role: BLOCK_ROLES.MANUAL };
      if (next.role === BLOCK_ROLES.AUTO_TEXT || next.role === BLOCK_ROLES.AUTO_SVG_MAIN) {
        return { ...next, role: BLOCK_ROLES.MANUAL };
      }
      return next;
    })
    : [];
  return {
    ...createCompile({ name: c.name }),
    ...c,
    blocks,
    sourceId: typeof c.sourceId === 'string' ? c.sourceId : null,
    version: COMPILE_SCHEMA_VERSION,
  };
}

// True if the compile holds at least one image block whose `src` is still
// an inline `data:` URL — i.e. needs to be lifted into IDB. Used by App.jsx
// to decide whether the async migration step is worth running.
export function compileNeedsIDBOffload(compile) {
  if (!compile || !Array.isArray(compile.blocks)) return false;
  return compile.blocks.some(b =>
    b && b.kind === BLOCK_KINDS.IMAGE
      && typeof b.src === 'string'
      && b.src.startsWith('data:')
  );
}

// Async migration: walk image blocks, push each `data:` URI into IDB under a
// fresh `cimg_<id>` key, and rewrite `block.src` to `idb:cimg_<id>` so the
// localStorage payload no longer carries the bytes. Idempotent: blocks
// already wearing an `idb:` ref are skipped, and re-running on a fully
// migrated compile is a no-op (returns the same compile reference).
//
// On per-block IDB failure the offending block keeps its data URL so the
// compile keeps rendering; the failure is logged but does not abort the
// whole batch. Quota errors bubble up so the App can surface IDB_QUOTA.
export async function migrateCompileImagesToIDB(compile) {
  if (!compile || !Array.isArray(compile.blocks)) return compile;
  if (!compileNeedsIDBOffload(compile)) return compile;

  let changed = false;
  const nextBlocks = [];
  for (const b of compile.blocks) {
    if (
      !b
      || b.kind !== BLOCK_KINDS.IMAGE
      || typeof b.src !== 'string'
      || !b.src.startsWith('data:')
    ) {
      nextBlocks.push(b);
      continue;
    }
    const cimgId = newId('cimg');
    try {
      await setCompileImage(cimgId, b.src);
      nextBlocks.push({ ...b, src: 'idb:' + cimgId });
      changed = true;
    } catch (e) {
      // Re-throw quota so the App can route IDB_QUOTA to the user; otherwise
      // log and keep the inline data URL so the block still renders.
      if (e?.code === 'IDB_QUOTA') throw e;
      console.warn('compile image IDB offload failed for block', b.id, e);
      nextBlocks.push(b);
    }
  }
  if (!changed) return compile;
  return { ...compile, blocks: nextBlocks };
}

// Helper: pull a `cimg_<id>` out of an `idb:cimg_<id>` reference. Returns
// null when the input isn't an IDB reference.
function parseIdbRef(src) {
  if (typeof src !== 'string' || !src.startsWith('idb:')) return null;
  return src.slice(4);
}

// Rebuild a compile with all `idb:` image refs resolved back into inline
// `data:` URLs. Used by export paths (Save .md / Save .html / Save .docx)
// so the output is self-contained and JSON-serializable. Returns a deep
// copy — the input is never mutated. Missing IDB entries become null
// `block.src` entries; the export-time helpers `compileToMarkdown` /
// `compileToHtml` already render those as "[Image not loaded]".
export async function hydrateCompileImages(compile) {
  if (!compile || !Array.isArray(compile.blocks)) return compile;
  const blocks = await Promise.all(compile.blocks.map(async (b) => {
    if (!b || b.kind !== BLOCK_KINDS.IMAGE) return { ...b };
    const ref = parseIdbRef(b.src);
    if (!ref) return { ...b };
    try {
      const blob = await getCompileImage(ref);
      if (!blob) return { ...b, src: null };
      const dataURL = await blobToDataURL(blob);
      return { ...b, src: dataURL };
    } catch (e) {
      console.warn('hydrateCompileImages failed for block', b.id, e);
      return { ...b, src: null };
    }
  }));
  return { ...compile, blocks };
}

// Rebuild a compile with all `idb:` image refs replaced by **object URLs**
// (via `URL.createObjectURL`). Cheaper than data URLs for in-memory render
// because the bytes never get re-serialized. **Caller is responsible for
// revoking** each returned object URL when the render is unmounted —
// otherwise the blob is pinned in memory for the page's lifetime.
export async function resolveCompileImageObjectUrls(compile) {
  if (!compile || !Array.isArray(compile.blocks)) return compile;
  const blocks = await Promise.all(compile.blocks.map(async (b) => {
    if (!b || b.kind !== BLOCK_KINDS.IMAGE) return { ...b };
    const ref = parseIdbRef(b.src);
    if (!ref) return { ...b };
    try {
      const blob = await getCompileImage(ref);
      if (!blob) return { ...b, src: null };
      // Guard for SSR / test environments where URL.createObjectURL is
      // missing — fall back to the data URL form so callers still get a
      // usable src instead of a broken one.
      if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
        const dataURL = await blobToDataURL(blob);
        return { ...b, src: dataURL };
      }
      return { ...b, src: URL.createObjectURL(blob) };
    } catch (e) {
      console.warn('resolveCompileImageObjectUrls failed for block', b.id, e);
      return { ...b, src: null };
    }
  }));
  return { ...compile, blocks };
}

export function touchCompile(compile) {
  return { ...compile, updatedAt: Date.now() };
}

export function addBlock(compile, block) {
  // Default to `'manual'` for any block added through the palette / insert
  // rail — auto-sync writes its own role tag explicitly via `syncAutoBlocks`.
  const withDefaults = { role: BLOCK_ROLES.MANUAL, ...block };
  const withId = withDefaults.id ? withDefaults : { ...withDefaults, id: newId() };
  return touchCompile({ ...compile, blocks: [...compile.blocks, withId] });
}

export function insertBlock(compile, block, index) {
  const withDefaults = { role: BLOCK_ROLES.MANUAL, ...block };
  const withId = withDefaults.id ? withDefaults : { ...withDefaults, id: newId() };
  const next = compile.blocks.slice();
  const i = Math.max(0, Math.min(index, next.length));
  next.splice(i, 0, withId);
  return touchCompile({ ...compile, blocks: next });
}

export function removeBlock(compile, blockId) {
  return touchCompile({ ...compile, blocks: compile.blocks.filter(b => b.id !== blockId) });
}

export function updateBlock(compile, blockId, patch) {
  return touchCompile({
    ...compile,
    blocks: compile.blocks.map(b => (b.id === blockId ? { ...b, ...patch, id: b.id } : b)),
  });
}

export function reorderBlocks(compile, fromId, toId) {
  if (fromId === toId) return compile;
  const blocks = compile.blocks.slice();
  const fromIdx = blocks.findIndex(b => b.id === fromId);
  const toIdx = blocks.findIndex(b => b.id === toId);
  if (fromIdx === -1 || toIdx === -1) return compile;
  const [moved] = blocks.splice(fromIdx, 1);
  blocks.splice(toIdx, 0, moved);
  return touchCompile({ ...compile, blocks });
}

export function setPageSize(compile, pageSize) {
  if (!PAGE_SIZES.includes(pageSize)) return compile;
  return touchCompile({ ...compile, pageSize });
}

export function setName(compile, name) {
  return touchCompile({ ...compile, name });
}

export function setTheme(compile, theme) {
  return touchCompile({ ...compile, theme });
}

// Resolve a `session` block to the snapshot we want to render. If the pointed
// session is gone, return a deleted placeholder so the compile still prints
// instead of silently swallowing the block.
export function resolveSessionBlock(block, sessions) {
  if (block.kind !== BLOCK_KINDS.SESSION) return null;
  const s = sessions.find(x => x.id === block.sessionId);
  if (!s) return { deleted: true, name: block.fallbackName || 'Deleted session' };
  return s;
}

// Convert a single block to standalone markdown. Used by compileToMarkdown.
function blockToMarkdown(block, sessions) {
  switch (block.kind) {
    case BLOCK_KINDS.TEXT:
      return (block.text || '').trim();
    case BLOCK_KINDS.SVG: {
      const safe = sanitizeSvg(block.svg || '');
      // Emit as a data URL so the markdown bundle is self-contained.
      const url = 'data:image/svg+xml;utf8,' + encodeURIComponent(safe);
      return `![${block.caption || 'Diagram'}](${url})`;
    }
    case BLOCK_KINDS.IMAGE: {
      const cap = block.caption || 'Image';
      // Defensive: if the block still wears an `idb:` ref we lost the race
      // with hydration. Render the placeholder so the export still goes
      // through, and warn so the bug is visible during development.
      if (typeof block.src === 'string' && block.src.startsWith('idb:')) {
        console.warn(
          'compileToMarkdown: image block ' + (block.id || '?')
            + ' still references IDB (' + block.src
            + '). Call hydrateCompileImages() before exporting.'
        );
        return `![${cap}](#)\n\n_[Image not loaded]_`;
      }
      if (!block.src) return `_[Image not loaded]_`;
      return `![${cap}](${block.src})`;
    }
    case BLOCK_KINDS.PAGE_BREAK:
      return '\n\n<div style="page-break-after: always"></div>\n\n';
    case BLOCK_KINDS.EQUATION: {
      const body = (block.text || '').trim();
      if (!body) return '';
      if (body.startsWith('$$') && body.endsWith('$$')) return body;
      return `$$\n${body}\n$$`;
    }
    case BLOCK_KINDS.SESSION: {
      const s = resolveSessionBlock(block, sessions);
      if (!s) return '';
      if (s.deleted) return `> _Missing session: ${s.name}_`;
      const parts = [];
      if (s.text && s.text.trim()) parts.push(s.text.trim());
      if (s.svg && s.svg.trim()) {
        const url = 'data:image/svg+xml;utf8,' + encodeURIComponent(sanitizeSvg(s.svg));
        parts.push(`![${s.filename || 'diagram'}](${url})`);
      }
      if (Array.isArray(s.images)) {
        s.images.forEach((img) => {
          parts.push(`### Image ${img.id}\n\n${img.desc}`);
          if (img.data) parts.push(`![Image ${img.id}](${img.data})`);
        });
      }
      return parts.join('\n\n');
    }
    default:
      return '';
  }
}

export function compileToMarkdown(compile, sessions) {
  const lines = [];
  if (compile.header) lines.push(compile.header.trim());
  if (compile.name) lines.push(`# ${compile.name}\n`);
  compile.blocks.forEach((b, i) => {
    const md = blockToMarkdown(b, sessions);
    if (md) lines.push(md);
    if (i < compile.blocks.length - 1) lines.push('---');
  });
  if (compile.footer) lines.push(compile.footer.trim());
  return lines.filter(Boolean).join('\n\n').trim() + '\n';
}

// HTML bundle: minimal, self-contained. No external CSS — inline a small
// stylesheet so the export opens cleanly anywhere.
const HTML_STYLES = `
  body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.55; color: #1d1d1d; }
  h1, h2, h3 { font-family: Georgia, serif; }
  pre, code { font-family: Menlo, Consolas, monospace; }
  hr { border: 0; border-top: 1px solid #ccc; margin: 28px 0; }
  .compile-page { padding: 32px 0; }
  .compile-pagebreak { border-top: 1px dashed #aaa; margin: 32px 0; }
  figure { margin: 16px 0; }
  figure img, figure svg { max-width: 100%; height: auto; }
  figcaption { color: #555; font-size: 13px; margin-top: 6px; }
  blockquote { border-left: 3px solid #aaa; padding-left: 12px; color: #555; }
  table { border-collapse: collapse; margin: 12px 0; }
  th, td { border: 1px solid #ccc; padding: 4px 8px; }
`;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function blockToHtml(block, sessions) {
  switch (block.kind) {
    case BLOCK_KINDS.TEXT:
      return `<div class="compile-text">${escapeHtml(block.text || '')
        .split(/\n{2,}/)
        .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
        .join('')}</div>`;
    case BLOCK_KINDS.SVG:
      return `<figure>${sanitizeSvg(block.svg || '')}</figure>`;
    case BLOCK_KINDS.IMAGE: {
      // Defensive: same fallback as compileToMarkdown — if an `idb:` ref
      // slipped through, render a placeholder rather than emitting a broken
      // `<img src="idb:cimg_…">`. Hydration should have happened upstream.
      if (typeof block.src === 'string' && block.src.startsWith('idb:')) {
        console.warn(
          'compileToHtml: image block ' + (block.id || '?')
            + ' still references IDB (' + block.src
            + '). Call hydrateCompileImages() before exporting.'
        );
        return `<figure><em>[Image not loaded]</em>${
          block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ''
        }</figure>`;
      }
      if (!block.src) {
        return `<figure><em>[Image not loaded]</em>${
          block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ''
        }</figure>`;
      }
      return `<figure><img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.caption || '')}">${
        block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ''
      }</figure>`;
    }
    case BLOCK_KINDS.PAGE_BREAK:
      return '<div class="compile-pagebreak"></div>';
    case BLOCK_KINDS.SESSION: {
      const s = resolveSessionBlock(block, sessions);
      if (!s) return '';
      if (s.deleted) return `<blockquote><em>Missing session: ${escapeHtml(s.name)}</em></blockquote>`;
      const out = [];
      if (s.text) out.push(`<div>${escapeHtml(s.text).split(/\n{2,}/).map(p => `<p>${p}</p>`).join('')}</div>`);
      if (s.svg) out.push(`<figure>${sanitizeSvg(s.svg)}</figure>`);
      if (Array.isArray(s.images)) {
        s.images.forEach((img) => {
          out.push(`<figure><img src="${escapeHtml(img.data || '')}" alt="${escapeHtml(img.desc || '')}"><figcaption>${escapeHtml(img.desc || '')}</figcaption></figure>`);
        });
      }
      return out.join('\n');
    }
    default:
      return '';
  }
}

export function compileToHtml(compile, sessions) {
  const title = escapeHtml(compile.name || 'Compile');
  const body = compile.blocks
    .map(b => `<section class="compile-page">${blockToHtml(b, sessions)}</section>`)
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>${HTML_STYLES}</style>
</head>
<body>
${compile.header ? `<header>${escapeHtml(compile.header)}</header>` : ''}
<h1>${title}</h1>
${body}
${compile.footer ? `<footer>${escapeHtml(compile.footer)}</footer>` : ''}
</body>
</html>`;
}

export function compileSummary(compile) {
  const counts = compile.blocks.reduce((acc, b) => {
    acc[b.kind] = (acc[b.kind] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(' · ') || 'empty';
}

// --- v3 per-source auto-compile sync ---------------------------------------

const REFINE_KIND_ORDER = ['summary', 'bullets', 'formal', 'casual'];

// Build the desired ordered list of `{role, blockSpec}` from a session
// snapshot. Each entry describes one auto block the worksheet should hold.
// Used by `syncAutoBlocks` to diff against the existing compile.
//
// v4 — action-keyed: walks `session.outputs` (a map keyed by actionId) and
// emits one block per entry. Re-running the same actionId replaces that
// one block in place; running a DIFFERENT action adds a new block alongside
// (so prior outputs accumulate in the worksheet instead of getting wiped).
//
// Dedup rule still applies: when an action's SVG output byte-matches a
// vectorized sketch's svg, we skip the action-keyed block — the sketch
// already has its own `auto:svg:sketch-<id>` block and rendering both
// would double the picker's output.
export function computeDesiredAutoBlocks(session) {
  const out = [];
  if (!session || typeof session !== 'object') return out;

  const sketches = Array.isArray(session.sketches) ? session.sketches : [];
  const sketchSvgs = sketches
    .map(sk => (sk && typeof sk.svg === 'string' && sk.svg) ? sk.svg : null)
    .filter(Boolean);

  const outputs = (session.outputs && typeof session.outputs === 'object')
    ? session.outputs
    : null;
  if (outputs) {
    for (const [actionId, entry] of Object.entries(outputs)) {
      if (!entry || typeof entry !== 'object') continue;
      if (entry.kind === 'text') {
        const text = typeof entry.text === 'string' ? entry.text : '';
        if (!text.trim()) continue;
        out.push({
          role: autoTextActionRole(actionId),
          blockSpec: { kind: BLOCK_KINDS.TEXT, text },
        });
      } else if (entry.kind === 'svg') {
        const svg = typeof entry.svg === 'string' ? entry.svg : '';
        if (!svg.trim()) continue;
        if (sketchSvgs.includes(svg)) continue; // dedup vs picker sketches
        out.push({
          role: autoSvgActionRole(actionId),
          blockSpec: { kind: BLOCK_KINDS.SVG, svg },
        });
      }
    }
  }

  for (const sk of sketches) {
    if (!sk || sk.status !== 'done') continue;
    if (typeof sk.svg !== 'string' || !sk.svg.trim()) continue;
    out.push({
      role: autoSvgSketchRole(sk.id),
      blockSpec: {
        kind: BLOCK_KINDS.SVG,
        svg: sk.svg,
        caption: sk.description || `Sketch ${sk.id}`,
      },
    });
  }

  const images = Array.isArray(session.images) ? session.images : [];
  for (const img of images) {
    if (!img || !img.id) continue;
    out.push({
      role: autoImageRole(img.id),
      blockSpec: {
        kind: BLOCK_KINDS.IMAGE,
        // `data` may be null when the session hasn't hydrated from IDB yet.
        // We still emit the block so its slot is held; renderers fall back
        // to `[Image not loaded]`. Subsequent syncs replace `src` once
        // hydration runs.
        src: typeof img.data === 'string' && img.data ? img.data : null,
        caption: img.desc || `Image ${img.id}`,
      },
    });
  }

  const refinements = (session.refinements && typeof session.refinements === 'object')
    ? session.refinements
    : null;
  if (refinements) {
    for (const kind of REFINE_KIND_ORDER) {
      const txt = refinements[kind];
      if (typeof txt === 'string' && txt.trim()) {
        out.push({
          role: autoRefinementRole(kind),
          blockSpec: { kind: BLOCK_KINDS.TEXT, text: txt },
        });
      }
    }
  }

  return out;
}

// Insert `newBlock` into `blocks` at its canonical position relative to
// existing auto-tagged blocks. Manual blocks are skipped — their positions
// are preserved as the user left them. If no auto block of higher rank
// exists, the new block is appended at the end of the list. Pure: returns
// a new array.
function insertAtCanonicalPosition(blocks, newBlock) {
  const newRank = autoRoleRank(newBlock.role);
  const idx = blocks.findIndex(b => isAutoRole(b?.role) && autoRoleRank(b.role) > newRank);
  if (idx === -1) return [...blocks, newBlock];
  return [...blocks.slice(0, idx), newBlock, ...blocks.slice(idx)];
}

// Reconcile the auto-tagged blocks in `compile` against a fresh session
// snapshot. Three rules:
//   1. Every existing auto block whose role is still desired is updated
//      in place (its `id` and array position are preserved — so user drag-
//      reorders survive).
//   2. Auto blocks whose role is no longer desired are removed.
//   3. Newly-desired roles are inserted at their canonical position (see
//      `autoRoleRank`).
// Manual blocks are never touched. Returns the same compile reference if
// nothing changed (lets callers skip the state write).
export function syncAutoBlocks(compile, session) {
  if (!compile || !Array.isArray(compile.blocks)) return compile;

  const desired = computeDesiredAutoBlocks(session);
  const desiredByRole = new Map(desired.map(d => [d.role, d.blockSpec]));

  let changed = false;
  const filtered = [];
  for (const b of compile.blocks) {
    if (!isAutoRole(b?.role)) {
      filtered.push(b);
      continue;
    }
    const want = desiredByRole.get(b.role);
    if (!want) {
      changed = true;
      continue;
    }
    // Update in place: preserve id + role + position; replace content.
    const next = { ...b, ...want, id: b.id, role: b.role };
    if (!shallowEqualBlock(next, b)) changed = true;
    filtered.push(next);
  }

  let blocks = filtered;
  const presentRoles = new Set(filtered.filter(b => isAutoRole(b?.role)).map(b => b.role));
  for (const d of desired) {
    if (presentRoles.has(d.role)) continue;
    blocks = insertAtCanonicalPosition(blocks, {
      ...d.blockSpec,
      role: d.role,
      id: newId(),
    });
    changed = true;
  }

  if (!changed) return compile;
  return { ...compile, blocks, updatedAt: Date.now() };
}

// Block-shape equality at the level of fields that matter for the in-place
// update (kind, role, text/svg/src/caption). Used to avoid spurious
// `updatedAt` bumps when the sync would have produced an identical block.
function shallowEqualBlock(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.kind === b.kind
    && a.role === b.role
    && a.text === b.text
    && a.svg === b.svg
    && a.src === b.src
    && a.caption === b.caption;
}

// Find the auto-compile bound to `sessionId`, or null. Used by App.jsx to
// route the Worksheet button to the active session's auto-compile.
export function findAutoCompileForSession(sessionId, compiles) {
  if (!sessionId || !Array.isArray(compiles)) return null;
  return compiles.find(c => c && c.sourceId === sessionId) || null;
}

// Build the default name for a session's auto-compile. Centralised so the
// label stays consistent across the create-on-first-extract path and the
// palette grouping/badging.
export function defaultAutoCompileName(session) {
  const fname = (session && typeof session.filename === 'string' && session.filename.trim())
    ? session.filename
    : 'Untitled';
  return `${fname} — Worksheet`;
}
