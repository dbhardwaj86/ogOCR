import { useEffect, useMemo, useState } from 'react';
import RenderedDoc from './RenderedDoc';
import SourceDoc from './SourceDoc';
import ProcessingStrip from './ProcessingStrip';
import ExportBar from './ExportBar';
import PromptDock from './PromptDock';
import InlineError from './InlineError';
import { KIND_LABEL } from '../magicActions';

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
}) {
  const [mode, setMode] = useState('rendered'); // 'rendered' | 'source'
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
      </div>
    </section>
  );
}

export default OutputColumn;
