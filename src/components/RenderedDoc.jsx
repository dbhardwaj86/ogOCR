import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
// mhchem: enables \ce{...} for chemical equations and \pu{...} for physical
// units inside KaTeX. Side-effect import — registers macros on the global
// KaTeX instance that rehype-katex uses below. Required for OCR'd chemistry.
import 'katex/contrib/mhchem';
import { sanitizeSvg } from '../svgSanitize';
import { stripDetectedLang } from '../magicActions';
import EquationBlock from './EquationBlock';
import TableBlock, { parseGfmTable, replaceFirstGfmTable } from './TableBlock';

/* eslint-disable no-unused-vars */
// Sprint 3.2 — when the markdown contains a fenced GFM table, we render
// `<TableBlock>` (the editable spreadsheet) and consume the first <table>
// emitted by react-markdown to avoid double-rendering. The `tableData` arg
// carries the pre-parsed `{ headers, rows }` so the component can mount
// directly with content; the closure variable `consumed` makes sure only
// the first <table> in the document is replaced (any subsequent tables fall
// back to the default styled <table>). Building components per-render keeps
// the consumed flag scoped per render pass.
//
// Track Q — also accept `onTableChange`, which TableBlock fires on every
// commit (cell edit, sort, add row/col). The caller here patches the first
// GFM table region in the source text and forwards the patched text up
// through `onChangeText`, so edits persist into `session.text`.
function buildMdComponents(tableData, onTableChange) {
  let consumed = false;
  return {
    h1: ({ node, ...p }) => <h1 className="og-h1" {...p} />,
    h2: ({ node, ...p }) => <h2 className="og-h2" {...p} />,
    h3: ({ node, ...p }) => <h3 className="og-h3" {...p} />,
    p:  ({ node, ...p }) => <p className="og-p" {...p} />,
    ul: ({ node, ...p }) => <ul className="og-ul" {...p} />,
    ol: ({ node, ...p }) => <ol className="og-ol" {...p} />,
    blockquote: ({ node, ...p }) => <blockquote className="og-bq" {...p} />,
    table: ({ node, ...p }) => {
      if (tableData && !consumed) {
        consumed = true;
        return (
          <TableBlock
            headers={tableData.headers}
            rows={tableData.rows}
            onChange={onTableChange}
          />
        );
      }
      return <table className="og-table" {...p} />;
    },
    code({ node, inline, className, children, ...p }) {
      if (inline) return <code className="og-code-inline" {...p}>{children}</code>;
      return <pre><code className={className} {...p}>{children}</code></pre>;
    },
  };
}
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

function RenderedDoc({ text, svg, images, mode, onChangeText }) {
  // Sprint 2.8b — strip the trailing `__detected_lang` line so the user only
  // sees the content; the chip in SourceColumn already exposes the code.
  const cleanText = stripDetectedLang(text);
  const hasText = !!(cleanText && cleanText.trim());
  const hasSvg = !!(svg && svg.trim());
  const hasImages = Array.isArray(images) && images.length > 0;
  // Sprint 3.2 — parse the first GFM table out of the cleaned text so we
  // can swap react-markdown's default `<table>` renderer for the editable
  // TableBlock. We memo on cleanText so we don't re-parse on every render.
  const tableData = useMemo(() => parseGfmTable(cleanText), [cleanText]);
  // Track Q — when the user edits a cell / sorts / adds a row, TableBlock
  // fires onChange with the new { headers, rows }. We rebuild the GFM table
  // markdown and patch it back into the FIRST table region of the original
  // (un-stripped) `text`, then forward through onChangeText so the parent
  // persists into session.text. Running on the raw text keeps the trailing
  // `__detected_lang` metadata line intact.
  const handleTableChange = useMemo(() => {
    if (typeof onChangeText !== 'function') return undefined;
    return ({ headers, rows }) => {
      const next = replaceFirstGfmTable(text || '', { headers, rows });
      if (next !== text) onChangeText(next);
    };
  }, [text, onChangeText]);
  const mdComponents = useMemo(
    () => buildMdComponents(tableData, handleTableChange),
    [tableData, handleTableChange],
  );

  // Sprint 3.1 — equation mode: live LaTeX preview pane. Bypasses the
  // markdown render path entirely. Wires the textarea back to the session
  // text via the optional `onChangeText` callback.
  if (mode === 'equation') {
    return (
      <article className="og-rendered og-rendered--equation">
        <EquationBlock value={text || ''} onChange={onChangeText} />
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
          rehypePlugins={[[rehypeKatex, {
            throwOnError: false,
            errorColor: '#cc0000',
            strict: 'ignore',
            trust: true,
            // Common physics / textbook shortcuts so OCR output that uses
            // informal notation still renders. Add more as Gemini's output
            // patterns reveal them.
            macros: {
              '\\R': '\\mathbb{R}',
              '\\N': '\\mathbb{N}',
              '\\Z': '\\mathbb{Z}',
              '\\Q': '\\mathbb{Q}',
              '\\C': '\\mathbb{C}',
              '\\vec': '\\mathbf{#1}',
              '\\unit': '\\,\\mathrm{#1}',
              '\\degree': '^{\\circ}',
            },
          }]]}
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
