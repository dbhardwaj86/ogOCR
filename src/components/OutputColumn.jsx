import { useState } from 'react';
import RenderedDoc from './RenderedDoc';
import SourceDoc from './SourceDoc';
import ProcessingStrip from './ProcessingStrip';
import ExportBar from './ExportBar';
import PromptDock from './PromptDock';
import InlineError from './InlineError';
import RefinementTabs from './RefinementTabs';
import { KIND_LABEL, REFINE_ACTIONS } from '../magicActions';

function OutputColumn({
  session,
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
}) {
  const [mode, setMode] = useState('rendered'); // 'rendered' | 'source' | 'refine'

  const numLabel = session ? 'OUT.' + session.id.slice(-3).toUpperCase() : 'OUT.NEW';
  const kindLabel = session?.kind ? (KIND_LABEL[session.kind] || 'Document') : 'Document';

  const value = session?.svg || session?.text || '';

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

  // If the user picked the Refine pill but the session no longer has any
  // populated refinements (e.g. switched sessions), fall back to Preview.
  const effectiveMode = mode === 'refine' && !hasRefinements ? 'rendered' : mode;

  return (
    <section className="og-output">
      <div className="og-output-head">
        <div className="og-output-title">
          <span className="og-output-num">{numLabel}</span>
          <span className="og-output-h">Extracted Document</span>
          <span className="og-output-sep">/</span>
          <span className="og-output-kind">{kindLabel}</span>
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
          <button
            className="og-pill og-pill-secondary"
            onClick={onCompile}
            title="Compile all sessions into a printable worksheet"
          >Worksheet</button>
        </div>
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
      </div>

      <div className="og-output-foot">
        <ExportBar session={session} onShowToast={onShowToast} processing={!!processing} />
        <PromptDock
          value={prompt}
          onChange={setPrompt}
          onRun={onRunPrompt}
          processing={processing}
          disabled={!hasFile}
        />
      </div>
    </section>
  );
}

export default OutputColumn;
