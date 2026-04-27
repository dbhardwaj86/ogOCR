// Single SVG sanitizer used by every place that renders model-emitted SVG.
// `FORBID_TAGS` and `FORBID_ATTR` defend against the small set of XSS vectors
// that an SVG profile permits by default. `<style>` is forbidden to block
// `@import` exfiltration and remote font/script loading via CSS.
// `ALLOWED_URI_REGEXP` restricts `href`/`xlink:href` to data:, blob:, and
// internal anchors (`#`) — blocking `http(s):` and `javascript:` URIs.
import DOMPurify from 'dompurify';

export function sanitizeSvg(svg) {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['foreignObject', 'script', 'iframe', 'style'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick'],
    ALLOWED_URI_REGEXP: /^(?:data|blob|#):/i,
  });
}
