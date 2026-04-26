// Single SVG sanitizer used by every place that renders model-emitted SVG.
// `FORBID_TAGS` and `FORBID_ATTR` defend against the small set of XSS vectors
// that an SVG profile permits by default.
import DOMPurify from 'dompurify';

export function sanitizeSvg(svg) {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['foreignObject', 'script', 'iframe'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick'],
  });
}
