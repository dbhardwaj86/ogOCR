import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

// Sprint 3.1 — Live LaTeX preview block. Mirrors the MermaidEditor split-pane
// pattern: textarea on the left, KaTeX-rendered math on the right. Reuses the
// already-bundled `react-markdown` + `remark-math` + `rehype-katex` stack
// (same configuration as RenderedDoc.jsx) so KaTeX remains in the main bundle
// without any new dependency. `throwOnError: false` guarantees malformed
// LaTeX never crashes the preview pane — KaTeX renders the offending source
// in red instead.
function wrapInMathBlock(src) {
  const t = (src || '').trim();
  if (!t) return '';
  // If the source already opens with `$$`, trust the author and pass through.
  // Otherwise wrap so react-markdown + remark-math sees a math block node.
  if (t.startsWith('$$') && t.endsWith('$$')) return t;
  return `$$\n${t}\n$$`;
}

function EquationBlock({ value, onChange }) {
  const wrapped = useMemo(() => wrapInMathBlock(value), [value]);

  const handleChange = (e) => {
    if (typeof onChange === 'function') onChange(e.target.value);
  };

  return (
    <div className="og-equation-editor">
      <div className="og-equation-pane og-equation-pane--code">
        <label className="og-equation-label" htmlFor="og-equation-textarea">LaTeX source</label>
        <textarea
          id="og-equation-textarea"
          className="og-equation-textarea"
          value={value || ''}
          onChange={handleChange}
          spellCheck={false}
          aria-label="LaTeX equation source"
        />
      </div>
      <div className="og-equation-pane og-equation-pane--preview">
        <label className="og-equation-label">Rendered equation</label>
        {wrapped ? (
          <div className="og-equation-preview">
            <ReactMarkdown
              remarkPlugins={[remarkMath]}
              rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: '#cc0000' }]]}
            >
              {wrapped}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="og-equation-preview og-equation-preview--empty">
            Type LaTeX on the left to render here.
          </div>
        )}
      </div>
    </div>
  );
}

export default EquationBlock;
