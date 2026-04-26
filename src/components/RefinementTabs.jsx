import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { REFINE_ACTIONS, REFINE_LABEL_BY_KIND } from '../magicActions';

/* eslint-disable no-unused-vars */
// Same markdown component map RenderedDoc uses so refined output renders
// in the same prose style as the canonical extraction. Duplicated rather
// than imported because RenderedDoc doesn't export it; a future refactor
// could lift `mdComponents` into a shared module.
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

function RefinementTabs({ refinements, populatedKinds }) {
  // Pick the first populated kind by REFINE_ACTIONS order so tabs render in
  // a stable sequence regardless of which refinement landed first.
  const orderedKinds = REFINE_ACTIONS.map(a => a.kind).filter(k => populatedKinds.includes(k));
  const firstKind = orderedKinds[0] || null;
  const [pickedKind, setPickedKind] = useState(null);

  // Derived: if the user-picked tab is missing from the populated set
  // (e.g. session switched, refinement cleared), fall back to the first
  // populated tab. Computing this each render — without an effect — keeps
  // the component free of cascading renders.
  const activeKind = pickedKind && populatedKinds.includes(pickedKind)
    ? pickedKind
    : firstKind;

  if (!refinements || orderedKinds.length === 0) {
    return (
      <article className="og-rendered">
        <div className="og-rendered-empty">
          No refinements yet — pick Summary, Bullets, Formal, or Casual from the Refine row.
        </div>
      </article>
    );
  }

  const text = activeKind ? refinements[activeKind] : '';

  return (
    <article className="og-rendered og-rendered--refine">
      <div className="og-refine-tabs" role="tablist" aria-label="Refined versions">
        {orderedKinds.map(kind => (
          <button
            key={kind}
            role="tab"
            aria-selected={kind === activeKind}
            className={'og-refine-tab' + (kind === activeKind ? ' is-active' : '')}
            onClick={() => setPickedKind(kind)}
          >
            {REFINE_LABEL_BY_KIND[kind] || kind}
          </button>
        ))}
      </div>

      <div className="og-refine-body" role="tabpanel">
        {text ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: '#cc0000' }]]}
            components={mdComponents}
          >
            {text}
          </ReactMarkdown>
        ) : (
          <div className="og-rendered-empty">This refinement is empty.</div>
        )}
      </div>
    </article>
  );
}

export default RefinementTabs;
