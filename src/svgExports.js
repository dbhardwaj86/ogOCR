// Build the deduplicated list of SVGs available for raster export from a
// session. The main SVG is included only when it doesn't byte-match a
// vectorized sketch's SVG — `openSketch` promotes a sketch's svg into
// `session.svg` to drive the focused view, and we don't want that one
// sketch to be double-counted in "All as PNG/JPG" output.
//
// Lives in its own module (separate from ExportBar.jsx) so the dedup logic
// can be unit-tested without DOM/canvas APIs and so the ExportBar file
// stays a clean component module for React Fast Refresh.
export function buildSvgExports(session, baseName) {
  const list = [];
  const done = (Array.isArray(session?.sketches) ? session.sketches : [])
    .filter(s => s && s.status === 'done' && typeof s.svg === 'string' && s.svg.trim());
  const main = (typeof session?.svg === 'string' && session.svg.trim()) ? session.svg : null;
  const mainIsFromSketch = main && done.some(s => s.svg === main);

  if (main && !mainIsFromSketch) {
    list.push({ svg: main, filename: baseName });
  }
  for (const sk of done) {
    list.push({ svg: sk.svg, filename: `${baseName}-sketch-${sk.id}` });
  }
  return list;
}
