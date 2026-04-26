import { useState } from 'react';
import RenderedDoc from './RenderedDoc';
import SourceDoc from './SourceDoc';
import ProcessingStrip from './ProcessingStrip';
import ExportBar from './ExportBar';
import PromptDock from './PromptDock';
import InlineError from './InlineError';
import { KIND_LABEL } from '../magicActions';

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
  const [mode, setMode] = useState('rendered'); // 'rendered' | 'source'

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
            className={'og-pill' + (mode === 'rendered' ? ' is-active' : '')}
            onClick={() => setMode('rendered')}
          >Preview</button>
          <button
            className={'og-pill' + (mode === 'source' ? ' is-active' : '')}
            onClick={() => setMode('source')}
          >Markdown</button>
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
        {mode === 'rendered' && (
          <RenderedDoc text={session?.text} svg={session?.svg} images={session?.images} />
        )}
        {mode === 'source' && (
          <SourceDoc
            value={value}
            onChange={handleSourceChange}
            disabled={!!processing || !session}
          />
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
