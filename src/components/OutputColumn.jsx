import { useEffect, useMemo, useState } from 'react';
import RenderedDoc, { detectMermaidBlock } from './RenderedDoc';
import SourceDoc from './SourceDoc';
import ProcessingStrip from './ProcessingStrip';
import ExportBar from './ExportBar';
import PromptDock from './PromptDock';
import InlineError from './InlineError';
import RefinementTabs from './RefinementTabs';
import { KIND_LABEL, REFINE_ACTIONS } from '../magicActions';

// Inline rename input — extracted so a `key` on this component (the session
// id + persisted exportName) cleanly resets local draft state when the active
// session or its persisted name changes externally. Avoids syncing-effect
// anti-pattern (forbidden by react-hooks/set-state-in-effect).
function RenameInput({ initialValue, fallback, ariaLabel, onCommit }) {
  const [draft, setDraft] = useState(initialValue);
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === initialValue) return;
    onCommit(trimmed);
  };
  return (
    <input
      type="text"
      className="og-output-rename"
      placeholder={fallback || 'Rename for export'}
      aria-label={ariaLabel}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          setDraft(initialValue);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function OutputColumn({
  session,
  file,
  processing,
  prompt,
  setPrompt,
  onRunPrompt,
  onShowToast,
  onCompile,
  onUpdateSession,
  hasFile,
  onCancel,
  onRetry,
  onDismissError,
  sessionCount = 0,
}) {
  const [mode, setMode] = useState('rendered'); // 'rendered' | 'source' | 'refine' | 'diagram' | 'equation'
  // Tablet-portrait (641-880 px) collapsible source thumbnail. Default
  // collapsed so the canvas stays the focus; tapping the strip expands it.
  const [thumbExpanded, setThumbExpanded] = useState(false);

  const numLabel = session ? 'OUT.' + session.id.slice(-3).toUpperCase() : 'OUT.NEW';
  const kindLabel = session?.kind ? (KIND_LABEL[session.kind] || 'Document') : 'Document';

  const value = session?.svg || session?.text || '';

  // Reuse the SourcePreview blob-URL pattern — allocate once per file, revoke
  // on unmount/file-change. We only build a URL for image files; PDFs render
  // a glyph card.
  const thumbUrl = useMemo(() => {
    if (!file?.type?.startsWith('image/')) return null;
    return URL.createObjectURL(file);
  }, [file]);
  useEffect(() => {
    if (!thumbUrl) return undefined;
    return () => URL.revokeObjectURL(thumbUrl);
  }, [thumbUrl]);

  const isPdf = file?.type === 'application/pdf';
  const thumbName = file?.name || session?.filename || '';

  const handleSourceChange = (next) => {
    if (!session) return;
    if (session.svg) {
      onUpdateSession({ svg: next });
    } else {
      onUpdateSession({ text: next });
    }
  };

  const lastError = session?.lastError && !processing ? session.lastError : null;

  // Refine pill is hidden until at least one refinement key is populated.
  const refinements = session?.refinements || null;
  const populatedRefineKinds = refinements
    ? REFINE_ACTIONS.map(a => a.kind).filter(k => typeof refinements[k] === 'string' && refinements[k].trim())
    : [];
  const hasRefinements = populatedRefineKinds.length > 0;

  // Sprint 2.8a — Diagram pill is conditional: shown when the session is
  // explicitly mermaid-kind, or when the extracted text contains a fenced
  // ```mermaid block. Both conditions are checked because (a) free-form
  // prompts can return mermaid without setting kind, and (b) the mermaid
  // action sets kind but the text still wraps the code in a fence.
  const hasMermaid =
    session?.kind === 'mermaid' || !!detectMermaidBlock(session?.text);

  // Sprint 3.1 — Equation pill is conditional: visible only when the
  // session was produced by the `Math to LaTeX` action. We do not sniff the
  // text for `$$` fences because the Math action returns raw LaTeX (no
  // markdown wrapping), so `kind === 'math'` is the canonical signal.
  const hasEquation = session?.kind === 'math';

  // If the user picked the Refine pill but the session no longer has any
  // populated refinements (e.g. switched sessions), fall back to Preview.
  // Same idea for Diagram / Equation: if the active session no longer
  // qualifies, drop back to Preview rather than rendering an empty editor.
  let effectiveMode = mode;
  if (effectiveMode === 'refine' && !hasRefinements) effectiveMode = 'rendered';
  if (effectiveMode === 'diagram' && !hasMermaid) effectiveMode = 'rendered';
  if (effectiveMode === 'equation' && !hasEquation) effectiveMode = 'rendered';

  return (
    <section className="og-output">
      <div className="og-output-head">
        <div className="og-output-title">
          <span className="og-output-num">{numLabel}</span>
          <span className="og-output-h">Extracted Document</span>
          <span className="og-output-sep">/</span>
          <span className="og-output-kind">{kindLabel}</span>
          {session && (
            <RenameInput
              key={`${session.id}:${session.exportName || ''}`}
              initialValue={session.exportName || ''}
              fallback={session.filename}
              ariaLabel="Filename for exports (leave blank to use original)"
              onCommit={(next) => onUpdateSession && onUpdateSession({ exportName: next })}
            />
          )}
        </div>
        <div className="og-output-modes">
          <button
            className={'og-pill' + (effectiveMode === 'rendered' ? ' is-active' : '')}
            onClick={() => setMode('rendered')}
          >Preview</button>
          <button
            className={'og-pill' + (effectiveMode === 'source' ? ' is-active' : '')}
            onClick={() => setMode('source')}
          >Markdown</button>
          {hasRefinements && (
            <button
              className={'og-pill' + (effectiveMode === 'refine' ? ' is-active' : '')}
              onClick={() => setMode('refine')}
              title="View AI-refined versions of this document"
            >Refine</button>
          )}
          {hasMermaid && (
            <button
              className={'og-pill og-pill-diagram' + (effectiveMode === 'diagram' ? ' is-active' : '')}
              onClick={() => setMode('diagram')}
              title="Open the Mermaid live editor for this diagram"
            >Diagram</button>
          )}
          {hasEquation && (
            <button
              className={'og-pill og-pill-equation' + (effectiveMode === 'equation' ? ' is-active' : '')}
              onClick={() => setMode('equation')}
              title="Open the live LaTeX editor for this equation"
            >Equation</button>
          )}
          <button
            className={'og-pill og-pill-secondary' + (sessionCount < 2 ? ' is-dim' : '')}
            onClick={onCompile}
            // Worksheet stacks 2+ sessions into a printable artifact. Keep it
            // visible on session #1 (so users discover it exists) but dim it
            // via .is-dim until there's actually something to stack — pure
            // visual cue, click handler stays live for power users.
            title={sessionCount < 2
              ? 'Compile is most useful with 2+ sessions — keep extracting to stack them.'
              : 'Compile all sessions into a printable worksheet'}
            style={sessionCount < 2 ? { opacity: 0.5 } : undefined}
          >Worksheet</button>
        </div>
      </div>

      {/* Tablet-portrait only: collapsible source thumbnail strip. CSS hides
         this everywhere except the (min-width: 641px) and (max-width: 880px)
         band where the source pane is hidden by data-mobile-pane="output". */}
      {(thumbUrl || isPdf) && (
        <div
          className={'og-source-thumb' + (thumbExpanded ? ' is-expanded' : '')}
        >
          <button
            type="button"
            className="og-source-thumb-toggle"
            onClick={() => setThumbExpanded(v => !v)}
            aria-expanded={thumbExpanded}
            aria-controls="og-source-thumb-body"
          >
            <span className="og-source-thumb-glyph">{isPdf ? '▤' : '◌'}</span>
            <span className="og-source-thumb-label">Source</span>
            <span className="og-source-thumb-name">{thumbName}</span>
            <span className="og-source-thumb-caret" aria-hidden="true">
              {thumbExpanded ? '▾' : '▸'}
            </span>
          </button>
          {thumbExpanded && (
            <div id="og-source-thumb-body" className="og-source-thumb-body">
              {thumbUrl && (
                <img src={thumbUrl} alt={thumbName} className="og-source-thumb-img" />
              )}
              {isPdf && (
                <div className="og-source-thumb-pdf">
                  <span className="og-source-thumb-pdf-glyph">▤</span>
                  <span className="og-source-thumb-pdf-note">
                    PDF — preview unavailable
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Hero PromptDock — sits above the canvas so the free-form Gemini ask is
         always one click away, per §1.3 #7. Keeps the same keyboard/disabled
         semantics; just relocated from the bottom of the column. */}
      <div className="og-output-hero">
        <PromptDock
          value={prompt}
          onChange={setPrompt}
          onRun={onRunPrompt}
          processing={processing}
          disabled={!hasFile}
        />
      </div>

      <ProcessingStrip processing={processing} onCancel={processing ? onCancel : null} />

      {lastError && (
        <InlineError
          entry={lastError}
          onRetry={onRetry}
          onDismiss={onDismissError}
        />
      )}

      <div className="og-output-canvas">
        {effectiveMode === 'rendered' && (
          <RenderedDoc text={session?.text} svg={session?.svg} images={session?.images} />
        )}
        {effectiveMode === 'source' && (
          <SourceDoc
            value={value}
            onChange={handleSourceChange}
            disabled={!!processing || !session}
          />
        )}
        {effectiveMode === 'refine' && (
          <RefinementTabs refinements={refinements} populatedKinds={populatedRefineKinds} />
        )}
        {effectiveMode === 'diagram' && (
          <RenderedDoc text={session?.text} svg={session?.svg} images={session?.images} mode="diagram" />
        )}
        {effectiveMode === 'equation' && (
          <RenderedDoc
            text={session?.text}
            svg={session?.svg}
            images={session?.images}
            mode="equation"
            onChangeText={(next) => onUpdateSession && onUpdateSession({ text: next })}
          />
        )}
      </div>

      <div className="og-output-foot">
        <ExportBar session={session} onShowToast={onShowToast} processing={!!processing} />
      </div>
    </section>
  );
}

export default OutputColumn;
