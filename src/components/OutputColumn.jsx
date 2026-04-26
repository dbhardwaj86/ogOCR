import { useState } from 'react';
import RenderedDoc from './RenderedDoc';
import SourceDoc from './SourceDoc';
import ProcessingStrip from './ProcessingStrip';
import ExportBar from './ExportBar';
import PromptDock from './PromptDock';
import { KIND_LABEL } from '../magicActions';

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
          >Rendered</button>
          <button
            className={'og-pill' + (mode === 'source' ? ' is-active' : '')}
            onClick={() => setMode('source')}
          >Source</button>
          <button
            className="og-pill"
            onClick={onCompile}
            title="Compile all sessions into a printable worksheet"
          >Compile</button>
        </div>
      </div>

      <ProcessingStrip processing={processing} />

      <div className="og-output-canvas">
        {mode === 'rendered' && <RenderedDoc text={session?.text} svg={session?.svg} />}
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
