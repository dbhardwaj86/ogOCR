// Format builders for the unified Save picker (single Save button replaces
// the legacy 3-dropdown ExportBar). Two contexts:
//
//   buildSessionFormats({ session, baseName }) — formats applicable to a
//     single extraction session (the per-session ExportBar in OutputColumn).
//   buildCompileFormats({ compile, sessions, baseName }) — formats
//     applicable to a worksheet compile (CompileBuilder header).
//
// Each returned descriptor is a plain object the picker can render directly:
//   { id, label, glyph, run: async () => void }
//
// `run` is the only side-effecting method — it builds the file payload and
// either hands it off to navigator.share (mobile) or downloads it. Two
// special kinds bypass the `run` contract because they need their own
// pipelines:
//   - raster:  delegates to exportRasterAll (one file per SVG)
//   - docx:    delegates to exportDocx (server-side pandoc)
//
// All `run` calls are fire-and-forget — errors surface via the registry.

import { buildSvgExports } from './svgExports';
import { exportRaster, exportRasterAll, rasterFromImage, rasterPdfPages } from './exportRaster';
import { exportDocx } from './exportDocx';
import { compileToMarkdown, compileToHtml, hydrateCompileImages } from './compile';

// True when the runtime can hand a File payload to the OS share sheet.
// Some mobile browsers expose `navigator.share` without `canShare`; fall
// back to share-without-files in that case (text only). The picker's
// share-or-download decision uses this helper.
function canNativeShareFile(file) {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare === 'function') {
    try {
      return navigator.canShare({ files: [file] });
    } catch {
      return false;
    }
  }
  return true; // share exists; canShare missing → assume yes, fall back on reject
}

// Save a Blob locally via <a download>. Used as the desktop path and as
// the mobile fallback when navigator.share isn't available.
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Revoke after a tick — some browsers race on revocation vs the click.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// One-stop save: tries navigator.share with a File, falls back to
// download. Errors propagate so callers can route them through the
// error registry. AbortError (user dismissed share) is treated as
// success — they explicitly cancelled, no fallback download.
export async function saveOrShare(blob, filename, mime) {
  const file = (typeof File === 'function')
    ? new File([blob], filename, { type: mime })
    : null;
  if (file && canNativeShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: filename });
      return { shared: true };
    } catch (err) {
      if (err && err.name === 'AbortError') return { shared: false, cancelled: true };
      // Share failed for another reason — fall through to download so the
      // user still gets the file.
    }
  }
  downloadBlob(blob, filename);
  return { shared: false, downloaded: true };
}

// --- Per-session formats --------------------------------------------------

export function buildSessionFormats({ session, baseName, file, pdfPageCount, onPageProgress }) {
  const items = [];
  const text = (session?.text || '').trim();
  const svg = (session?.svg || '').trim();
  const svgExports = session ? buildSvgExports(session, baseName) : [];

  // Source-derived raster formats: always offered when an upload is present
  // (independent of extraction). Replaces the dropped "Extract Images"
  // action with a deterministic, client-side "save the original / each PDF
  // page as PNG/JPG" surface.
  if (file && file.type?.startsWith('image/')) {
    items.push({
      id: 'src-png',
      label: 'Original as PNG',
      glyph: '◯',
      run: async () => rasterFromImage(file, { format: 'png', filename: baseName }),
    });
    items.push({
      id: 'src-jpg',
      label: 'Original as JPG',
      glyph: '◯',
      run: async () => rasterFromImage(file, { format: 'jpg', filename: baseName }),
    });
  } else if (file && file.type === 'application/pdf') {
    const n = pdfPageCount || 0;
    const labelSuffix = n > 1 ? ` (${n})` : '';
    const allText = n > 1 ? 'All pages as PNG' : 'Page as PNG';
    const allJpg = n > 1 ? 'All pages as JPG' : 'Page as JPG';
    items.push({
      id: 'pdf-png',
      label: `${allText}${labelSuffix}`,
      glyph: '◯',
      run: async () => rasterPdfPages(file, {
        format: 'png',
        baseFilename: baseName,
        onProgress: onPageProgress,
      }),
    });
    items.push({
      id: 'pdf-jpg',
      label: `${allJpg}${labelSuffix}`,
      glyph: '◯',
      run: async () => rasterPdfPages(file, {
        format: 'jpg',
        baseFilename: baseName,
        onProgress: onPageProgress,
      }),
    });
  }

  if (!session) return items;

  if (svg) {
    items.push({
      id: 'svg',
      label: 'SVG',
      glyph: '▤',
      run: async () => saveOrShare(
        new Blob([svg], { type: 'image/svg+xml' }),
        baseName + '.svg',
        'image/svg+xml',
      ),
    });
  } else if (text) {
    items.push({
      id: 'md',
      label: 'MD',
      glyph: '▤',
      run: async () => saveOrShare(
        new Blob([session.text], { type: 'text/markdown' }),
        baseName + '.md',
        'text/markdown',
      ),
    });
  }

  if (text) {
    items.push({
      id: 'docx',
      label: 'DOCX',
      glyph: '⌘',
      run: async () => exportDocx({ markdown: session.text, filename: baseName + '.docx' }),
    });
  }

  if (svgExports.length === 1) {
    items.push({
      id: 'png',
      label: 'PNG',
      glyph: '▦',
      run: async () => exportRaster(svgExports[0].svg, {
        format: 'png',
        filename: svgExports[0].filename,
      }),
    });
    items.push({
      id: 'jpg',
      label: 'JPG',
      glyph: '▦',
      run: async () => exportRaster(svgExports[0].svg, {
        format: 'jpg',
        filename: svgExports[0].filename,
      }),
    });
  } else if (svgExports.length >= 2) {
    items.push({
      id: 'png-all',
      label: `All as PNG (${svgExports.length})`,
      glyph: '▦',
      run: async () => exportRasterAll(svgExports, 'png'),
    });
    items.push({
      id: 'jpg-all',
      label: `All as JPG (${svgExports.length})`,
      glyph: '▦',
      run: async () => exportRasterAll(svgExports, 'jpg'),
    });
  }

  items.push({
    id: 'json',
    label: 'JSON',
    glyph: '{}',
    run: async () => saveOrShare(
      new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' }),
      baseName + '.json',
      'application/json',
    ),
  });

  return items;
}

// --- Compile formats ------------------------------------------------------

export function buildCompileFormats({ compile, sessions, baseName }) {
  if (!compile) return [];
  const items = [];

  items.push({
    id: 'md',
    label: 'MD',
    glyph: '▤',
    run: async () => {
      const hydrated = await hydrateCompileImages(compile);
      const md = compileToMarkdown(hydrated, sessions);
      return saveOrShare(
        new Blob([md], { type: 'text/markdown' }),
        baseName + '.md',
        'text/markdown',
      );
    },
  });

  items.push({
    id: 'html',
    label: 'HTML',
    glyph: '⟨/⟩',
    run: async () => {
      const hydrated = await hydrateCompileImages(compile);
      const html = compileToHtml(hydrated, sessions);
      return saveOrShare(
        new Blob([html], { type: 'text/html' }),
        baseName + '.html',
        'text/html',
      );
    },
  });

  items.push({
    id: 'docx',
    label: 'DOCX',
    glyph: '⌘',
    run: async () => {
      const hydrated = await hydrateCompileImages(compile);
      const md = compileToMarkdown(hydrated, sessions);
      return exportDocx({ markdown: md, filename: baseName + '.docx' });
    },
  });

  items.push({
    id: 'json',
    label: 'JSON',
    glyph: '{}',
    run: async () => saveOrShare(
      new Blob([JSON.stringify(compile, null, 2)], { type: 'application/json' }),
      baseName + '.json',
      'application/json',
    ),
  });

  return items;
}
