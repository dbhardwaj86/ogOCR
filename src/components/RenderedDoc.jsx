import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { sanitizeSvg } from '../svgSanitize';
import { stripDetectedLang } from '../magicActions';
import { ERRORS } from '../errors/codes';

// Sprint 2.8a — detect a fenced ```mermaid block in extracted text. Exported
// for testability so the unit suite doesn't have to lazy-load mermaid itself.
// We accept any leading/trailing whitespace (Gemini occasionally indents the
// fence) and require a closing fence to avoid spurious matches inside larger
// markdown.
const MERMAID_FENCE_RE = /```\s*mermaid\s*\n([\s\S]*?)\n```/i;

// eslint-disable-next-line react-refresh/only-export-components
export function detectMermaidBlock(text) {
  if (typeof text !== 'string' || !text) return null;
  const m = text.match(MERMAID_FENCE_RE);
  return m ? m[1].trim() : null;
}

/* eslint-disable no-unused-vars */
const mdComponents = {
  h1: ({ node, ...p }) => <h1 className="og-h1" {...p} />,
  h2: ({ node, ...p }) => <h2 className="og-h2" {...p} />,
  h3: ({ node, ...p }) => <h3 className="og-h3" {...p} />,
  p:  ({ node, ...p }) => <p className="og-p" {...p} />,
  ul: ({ node, ...p }) => <ul className="og-ul" {...p} />,
  ol: ({ node, ...p }) => <ol className="og-ol" {...p} />,
  blockquote: ({ node, ...p }) => <blockquote className="og-bq" {...p} />,
  table: ({ node, ...p }) => <table className="og-table" {...p} />,
  code({ node, inline, className, children, ...p }) {
    if (inline) return <code className="og-code-inline" {...p}>{children}</code>;
    return <pre><code className={className} {...p}>{children}</code></pre>;
  },
};
/* eslint-enable no-unused-vars */

function ImageGrid({ images }) {
  if (!Array.isArray(images) || images.length === 0) return null;
  return (
    <div className="og-image-grid">
      {images.map((img) => (
        <figure key={img.id} className="og-image-card">
          {img.data ? (
            <img className="og-image-card-img" src={img.data} alt={img.desc || `Image ${img.id}`} />
          ) : (
            <div className="og-image-card-placeholder" aria-hidden="true">
              <span>▦</span>
              <span>image preview unavailable</span>
            </div>
          )}
          <figcaption className="og-image-card-caption">
            <span className="og-image-card-id">Image {img.id}</span>
            <span className="og-image-card-desc">{img.desc}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

// Sprint 2.8a — Mermaid live editor. Code on the left, rendered SVG on the
// right. Lazy-imports `mermaid` only when the diagram pane mounts (keeps it
// out of the main bundle). Render is debounced 300ms after the last keystroke
// so we don't thrash mermaid.render() during fast edits. Render failures
// surface inline using the OCR_MERMAID_RENDER_FAIL error code so the user
// sees both the registry message and the underlying parse error from
// mermaid.
function MermaidEditor({ initialCode, onChange }) {
  const [code, setCode] = useState(initialCode || '');
  const [svg, setSvg] = useState('');
  const [err, setErr] = useState(null);
  const debounceRef = useRef(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const mermaidMod = (await import('mermaid')).default;
        mermaidMod.initialize({ startOnLoad: false, theme: 'neutral' });
        const id = 'og-mermaid-' + Date.now();
        const { svg: rendered } = await mermaidMod.render(id, code);
        if (!cancelledRef.current) {
          setSvg(rendered);
          setErr(null);
        }
      } catch (e) {
        if (!cancelledRef.current) {
          setSvg('');
          setErr(e?.message || String(e));
        }
      }
    }, 300);
    return () => {
      cancelledRef.current = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [code]);

  const handleChange = (e) => {
    const next = e.target.value;
    setCode(next);
    if (typeof onChange === 'function') onChange(next);
  };

  const failEntry = ERRORS.OCR_MERMAID_RENDER_FAIL;

  return (
    <div className="og-mermaid-editor">
      <div className="og-mermaid-pane og-mermaid-pane--code">
        <label className="og-mermaid-label" htmlFor="og-mermaid-textarea">Mermaid source</label>
        <textarea
          id="og-mermaid-textarea"
          className="og-mermaid-textarea"
          value={code}
          onChange={handleChange}
          spellCheck={false}
          aria-label="Mermaid diagram source"
        />
      </div>
      <div className="og-mermaid-pane og-mermaid-pane--preview">
        <label className="og-mermaid-label">Rendered diagram</label>
        {err ? (
          <div className="og-mermaid-error" role="alert">
            <strong className="og-mermaid-error-title">{failEntry?.message || 'Diagram failed to render.'}</strong>
            {failEntry?.hint && <span className="og-mermaid-error-hint">{failEntry.hint}</span>}
            <pre className="og-mermaid-error-detail">{err}</pre>
          </div>
        ) : svg ? (
          <div
            className="og-mermaid-preview"
            // Mermaid renders trusted SVG from user-controlled text.  This is
            // the same risk envelope as the existing svgSanitize path; keep
            // it inside the diagram pane only.
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="og-mermaid-preview og-mermaid-preview--empty">Rendering…</div>
        )}
      </div>
    </div>
  );
}

function RenderedDoc({ text, svg, images, mode }) {
  // Sprint 2.8b — strip the trailing `__detected_lang` line so the user only
  // sees the content; the chip in SourceColumn already exposes the code.
  const cleanText = stripDetectedLang(text);
  const hasText = !!(cleanText && cleanText.trim());
  const hasSvg = !!(svg && svg.trim());
  const hasImages = Array.isArray(images) && images.length > 0;
  const mermaidCode = detectMermaidBlock(cleanText);

  // Sprint 2.8a — diagram mode: live editor pane. We seed the editor from any
  // detected fenced block in the cleaned text, falling back to the raw
  // (cleaned) text when the session.kind itself is mermaid but no fence
  // wraps it. Diagram mode bypasses the markdown render path entirely.
  if (mode === 'diagram') {
    const seed = mermaidCode || (cleanText || '').trim();
    return (
      <article className="og-rendered og-rendered--diagram">
        <MermaidEditor initialCode={seed} />
      </article>
    );
  }

  return (
    <article className="og-rendered">
      <div className="og-rendered-runner">
        <span>OG·OCR</span>
        <span>·</span>
        <span>EXTRACTED</span>
      </div>

      {hasSvg && (
        <div
          className="og-rendered-svg"
          dangerouslySetInnerHTML={{ __html: sanitizeSvg(svg) }}
        />
      )}

      {hasText && (
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: '#cc0000' }]]}
          components={mdComponents}
        >
          {cleanText}
        </ReactMarkdown>
      )}

      {hasImages && <ImageGrid images={images} />}

      {!hasText && !hasSvg && !hasImages && (
        <div className="og-rendered-empty">Nothing extracted yet — pick an action.</div>
      )}

      <div className="og-rendered-end">
        <span>—</span>
        <span>END OF DOCUMENT</span>
        <span>—</span>
      </div>
    </article>
  );
}

export default RenderedDoc;
