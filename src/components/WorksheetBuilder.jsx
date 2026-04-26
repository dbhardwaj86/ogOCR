import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import DOMPurify from 'dompurify';

const sanitizeSvg = (svg) => DOMPurify.sanitize(svg, {
  USE_PROFILES: { svg: true, svgFilters: true },
  FORBID_TAGS: ['foreignObject', 'script', 'iframe'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick'],
});

function WorksheetBuilder({ sessions }) {
  if (!sessions || sessions.length === 0) {
    return (
      <div style={{ padding: 24, fontStyle: 'italic', color: 'var(--ink-faint)', fontFamily: 'var(--serif)' }}>
        No extractions yet.
      </div>
    );
  }

  const ordered = [...sessions].sort((a, b) => a.date - b.date);

  return (
    <>
      {ordered.map((s, i) => (
        <div key={s.id} className="worksheet-page">
          <div
            className="print-hide"
            style={{
              position: 'absolute',
              top: 12,
              right: 24,
              color: 'var(--ink-faint)',
              fontFamily: 'var(--mono)',
              fontSize: 10,
              letterSpacing: '0.1em',
            }}
          >
            Page {i + 1}
          </div>
          {s.svg ? (
            <div dangerouslySetInnerHTML={{ __html: sanitizeSvg(s.svg) }} />
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: '#cc0000' }]]}
            >
              {s.text || '*Empty extraction*'}
            </ReactMarkdown>
          )}
        </div>
      ))}
    </>
  );
}

export default WorksheetBuilder;
