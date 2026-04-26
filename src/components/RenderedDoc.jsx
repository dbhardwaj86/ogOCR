import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { sanitizeSvg } from '../svgSanitize';

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

function RenderedDoc({ text, svg, images }) {
  const hasText = !!(text && text.trim());
  const hasSvg = !!(svg && svg.trim());
  const hasImages = Array.isArray(images) && images.length > 0;

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
