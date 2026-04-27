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
