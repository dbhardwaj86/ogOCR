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

import { sanitizeSvg } from './svgSanitize';
import {
  setCompileImage,
  getCompileImage,
  blobToDataURL,
} from './storage/idb';

export const COMPILE_SCHEMA_VERSION = 2;
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

const PAGE_SIZES = ['a4', 'letter'];

export function newId(prefix = 'b') {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function createCompile({ name = 'Untitled compile', theme = 'paper' } = {}) {
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
  return {
    ...createCompile({ name: c.name }),
    ...c,
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
  const withId = block.id ? block : { ...block, id: newId() };
  return touchCompile({ ...compile, blocks: [...compile.blocks, withId] });
}

export function insertBlock(compile, block, index) {
  const withId = block.id ? block : { ...block, id: newId() };
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
