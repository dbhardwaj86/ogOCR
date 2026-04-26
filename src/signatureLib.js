// Signature capture helpers (Track N — S3.5).
//
// Pure-JS helpers split out of SignatureModal.jsx so the component file
// only exports React components (the lint rule react-refresh/only-export-
// components forbids mixing). Tests import from this module too.

export const SIGNATURES_KEY = 'ogOCR_signatures';
export const SIGNATURES_MAX = 5;

export const CANVAS_W = 800;
export const CANVAS_H = 240;
export const STROKE_WIDTH = 2.5;
export const STROKE_COLOR = '#1a1a2e';

// Read the persisted signature library. Tolerant of legacy/corrupt entries —
// anything that doesn't look like our shape is filtered out so the library
// row never crashes on bad localStorage data.
export function readSignatures() {
  try {
    const raw = localStorage.getItem(SIGNATURES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(s => s && typeof s === 'object'
        && typeof s.id === 'string'
        && typeof s.svg === 'string'
        && typeof s.createdAt === 'number')
      .slice(0, SIGNATURES_MAX);
  } catch {
    return [];
  }
}

// Build an SVG string from an array of strokes. Each stroke is an array of
// {x, y} points. We wrap as a self-contained <svg> with the canvas-coordinate
// viewBox so the inserted markup renders at the correct aspect ratio anywhere
// (markdown preview, print, the source pane).
export function strokesToSvg(strokes, width = CANVAS_W, height = CANVAS_H) {
  const paths = (strokes || [])
    .filter(s => Array.isArray(s) && s.length > 0)
    .map(stroke => {
      if (stroke.length === 1) {
        const p = stroke[0];
        // Single tap → render as a small dot (filled circle path).
        return `<circle cx="${(p.x ?? 0).toFixed(2)}" cy="${(p.y ?? 0).toFixed(2)}" r="${(STROKE_WIDTH / 2).toFixed(2)}" fill="${STROKE_COLOR}" />`;
      }
      const d = stroke
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${(p.x ?? 0).toFixed(2)},${(p.y ?? 0).toFixed(2)}`)
        .join(' ');
      return `<path d="${d}" fill="none" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" />`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Signature">${paths}</svg>`;
}

// Render an SVG string back onto a 2D canvas context. Used by the library
// thumbnails (small canvases) and by the load-into-editor flow. Tolerant of
// both stroke-path and circle-dot encodings produced by `strokesToSvg`.
export function paintSvgOnCanvas(svg, ctx, w, h) {
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  // Pull viewBox so we can scale arbitrary-sized SVGs to the target canvas.
  const vbMatch = svg.match(/viewBox="([\d.\s-]+)"/);
  let vbW = w; let vbH = h;
  if (vbMatch) {
    const parts = vbMatch[1].trim().split(/\s+/).map(Number);
    if (parts.length === 4) { vbW = parts[2] || w; vbH = parts[3] || h; }
  }
  const sx = w / vbW;
  const sy = h / vbH;

  ctx.save();
  ctx.scale(sx, sy);
  ctx.strokeStyle = STROKE_COLOR;
  ctx.fillStyle = STROKE_COLOR;
  ctx.lineWidth = STROKE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Replay each <path d="…"/> as a single Path2D stroke. Replay each <circle/>
  // as a filled arc. Path2D may not exist in jsdom — fall back to skipping the
  // path replay there (thumbnails just won't render in tests).
  const pathRe = /<path\s+d="([^"]+)"/g;
  let m;
  while ((m = pathRe.exec(svg)) !== null) {
    if (typeof Path2D === 'undefined') break;
    try {
      const p = new Path2D(m[1]);
      ctx.stroke(p);
    } catch {
      /* malformed path — ignore */
    }
  }
  const circleRe = /<circle[^/]*cx="([\d.-]+)"[^/]*cy="([\d.-]+)"[^/]*r="([\d.-]+)"/g;
  while ((m = circleRe.exec(svg)) !== null) {
    const cx = parseFloat(m[1]);
    const cy = parseFloat(m[2]);
    const r = parseFloat(m[3]);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
