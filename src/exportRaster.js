// SVG → PNG/JPG raster export pipeline. Extracted from ExportBar.jsx so it
// can be reused by the per-session save picker, the compile builder, and
// any future surface that needs to rasterize an SVG.
//
// Each call rasterizes a SINGLE SVG to one downloaded file. Multi-SVG
// callers loop and add a small breather between calls (Chromium dedups
// rapid-fire same-name downloads).
//
// White-fill before draw is correct for both formats: PNG ignores the
// fill under transparent pixels, JPG (no alpha) needs it to avoid a
// black background on transparent regions.

export function exportRaster(svgString, { format = 'png', filename, quality = 0.92, onError } = {}) {
  return new Promise((resolve) => {
    const div = document.createElement('div');
    div.innerHTML = svgString;
    const svgEl = div.querySelector('svg');
    if (!svgEl) {
      onError && onError('EXP_SVG_BROWSER_LIMIT', 'No <svg> root found in this content.');
      resolve(false);
      return;
    }

    const vb = svgEl.viewBox?.baseVal;
    const w = parseFloat(svgEl.getAttribute('width')) || (vb?.width) || 800;
    const h = parseFloat(svgEl.getAttribute('height')) || (vb?.height) || 600;
    if (!svgEl.getAttribute('width')) svgEl.setAttribute('width', w);
    if (!svgEl.getAttribute('height')) svgEl.setAttribute('height', h);

    const svgData = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const mime = format === 'jpg' || format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const ext = mime === 'image/jpeg' ? '.jpg' : '.png';
    const finalName = filename
      ? (/\.(png|jpe?g)$/i.test(filename) ? filename : filename + ext)
      : 'ogOCR_Export' + ext;

    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width || w;
        canvas.height = img.height || h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const a = document.createElement('a');
        a.href = mime === 'image/jpeg'
          ? canvas.toDataURL(mime, quality)
          : canvas.toDataURL(mime);
        a.download = finalName;
        a.click();
        resolve(true);
      } catch (err) {
        onError && onError('EXP_SVG_BROWSER_LIMIT', err?.message);
        resolve(false);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      onError && onError('EXP_SVG_BROWSER_LIMIT', 'Image failed to load before rasterization.');
      resolve(false);
    };
    img.src = url;
  });
}

// Sequentially rasterize a list of `{svg, filename}` entries (typically
// from `buildSvgExports`). The 60ms breather between calls dodges
// Chromium's same-origin download dedup that would otherwise fold N
// rapid-fire clicks into one.
export async function exportRasterAll(svgExports, format, onError) {
  if (!Array.isArray(svgExports) || svgExports.length === 0) return;
  for (let i = 0; i < svgExports.length; i++) {
    const item = svgExports[i];
    await exportRaster(item.svg, { format, filename: item.filename, onError });
    if (i < svgExports.length - 1) {
      await new Promise(r => setTimeout(r, 60));
    }
  }
}

// Trigger a download for a Blob (canvas → blob path) so the raw image
// file lands in the user's Downloads folder. Mirrors `downloadBlob` in
// `saveFormats.js` but kept local here so this module can be used
// standalone (compile builder, future surfaces).
function downloadBlobLocal(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Convert an uploaded image File to PNG/JPG and trigger a download. Used
// by the Save picker as "Original as PNG / JPG". Re-encoding through a
// canvas keeps a consistent code path for both formats and lets the user
// freely pick either; the resulting file is byte-for-byte different from
// the original (re-compressed) but visually identical.
//
// `format` — 'png' | 'jpg' (alias 'jpeg' accepted)
// `quality` — JPG only (0..1)
// `filename` — the on-disk name; `.png` or `.jpg` extension is appended
//              if missing.
export function rasterFromImage(file, { format = 'png', filename, quality = 0.92, onError } = {}) {
  return new Promise((resolve) => {
    if (!file || !file.type?.startsWith('image/')) {
      onError && onError('EXP_GENERIC', 'Not an image file.');
      resolve(false);
      return;
    }
    const url = URL.createObjectURL(file);
    const mime = format === 'jpg' || format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const ext = mime === 'image/jpeg' ? '.jpg' : '.png';
    const baseName = (filename || file.name || 'ogOCR_Image').replace(/\.[^.]+$/, '');
    const finalName = /\.(png|jpe?g)$/i.test(filename || '')
      ? filename
      : baseName + ext;
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (mime === 'image/jpeg') {
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (!blob) {
            onError && onError('EXP_GENERIC', 'Browser refused to encode the image.');
            resolve(false);
            return;
          }
          downloadBlobLocal(blob, finalName);
          resolve(true);
        }, mime, mime === 'image/jpeg' ? quality : undefined);
      } catch (err) {
        onError && onError('EXP_GENERIC', err?.message);
        resolve(false);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      onError && onError('EXP_GENERIC', 'Image failed to decode.');
      resolve(false);
    };
    img.src = url;
  });
}

// Rasterize every page of a PDF File to PNG/JPG and trigger one download
// per page (sequential, with a 60ms breather to dodge Chromium's
// rapid-fire dedup). Reuses the same `pdfjs-dist` lazy-import pattern as
// `UploadConfirmModal.jsx` so the worker is already cached if the user
// has interacted with that modal.
//
// `pageScale` — render multiplier (default 2 → ~150–200 KB / page PNG;
//               crisp text without ballooning file size).
// `onProgress({ done, total })` — fired before each page download so the
//                                 caller can update a progress strip.
export async function rasterPdfPages(file, {
  format = 'png',
  pageScale = 2,
  baseFilename,
  quality = 0.92,
  onProgress,
  onError,
} = {}) {
  if (!file || file.type !== 'application/pdf') {
    onError && onError('EXP_GENERIC', 'Not a PDF file.');
    return false;
  }
  const mime = format === 'jpg' || format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const ext = mime === 'image/jpeg' ? '.jpg' : '.png';
  const baseName = (baseFilename || file.name || 'ogOCR_PDF').replace(/\.[^.]+$/, '');

  let pdfjs;
  let workerUrl;
  try {
    pdfjs = await import('pdfjs-dist');
    workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  } catch (err) {
    onError && onError('EXP_GENERIC', `pdfjs failed to load: ${err?.message || err}`);
    return false;
  }

  let doc;
  try {
    const buf = await file.arrayBuffer();
    doc = await pdfjs.getDocument({ data: buf }).promise;
  } catch (err) {
    onError && onError('EXP_GENERIC', `Failed to open PDF: ${err?.message || err}`);
    return false;
  }

  const total = doc.numPages;
  for (let i = 1; i <= total; i++) {
    if (typeof onProgress === 'function') onProgress({ done: i - 1, total });
    try {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: pageScale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (mime === 'image/jpeg') {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      await page.render({ canvasContext: ctx, viewport }).promise;
      const pageName = total === 1
        ? `${baseName}${ext}`
        : `${baseName}-page${String(i).padStart(2, '0')}${ext}`;
      const blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), mime, mime === 'image/jpeg' ? quality : undefined);
      });
      if (!blob) {
        onError && onError('EXP_GENERIC', `Failed to encode page ${i}.`);
        continue;
      }
      downloadBlobLocal(blob, pageName);
      // Breather to dodge Chromium's same-origin rapid-fire dedup.
      if (i < total) await new Promise(r => setTimeout(r, 60));
    } catch (err) {
      onError && onError('EXP_GENERIC', `Page ${i} failed: ${err?.message || err}`);
    }
  }
  if (typeof onProgress === 'function') onProgress({ done: total, total });
  return true;
}
