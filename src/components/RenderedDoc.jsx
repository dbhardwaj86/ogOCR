import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import DOMPurify from 'dompurify';
import 'katex/dist/katex.min.css';

const sanitizeSvg = (svg) => DOMPurify.sanitize(svg, {
  USE_PROFILES: { svg: true, svgFilters: true },
  FORBID_TAGS: ['foreignObject', 'script', 'iframe'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick'],
});

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

function RenderedDoc({ text, svg }) {
  const hasText = !!(text && text.trim());
  const hasSvg = !!(svg && svg.trim());

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
          {text}
        </ReactMarkdown>
      )}

      {!hasText && !hasSvg && (
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
