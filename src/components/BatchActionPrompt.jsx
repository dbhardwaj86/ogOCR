import { useEffect } from 'react';
import { MAGIC_ACTIONS, ACTION_GROUPS } from '../magicActions';

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

const BATCH_PROMPT_CSS = `
.og-batch-prompt-files {
  max-height: 180px;
  overflow-y: auto;
  margin-bottom: 14px;
  padding: 8px 10px;
  border: 1px solid var(--rule, rgba(0,0,0,0.15));
  border-radius: var(--r-tile, 8px);
  background: var(--bg-tint, rgba(0,0,0,0.04));
  font-size: 12px;
  font-family: var(--mono, ui-monospace, monospace);
  color: var(--ink, #111);
}
.og-batch-prompt-files-row {
  display: flex; justify-content: space-between; gap: 12px;
  padding: 2px 0;
}
.og-batch-prompt-files-name {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  flex: 1;
}
.og-batch-prompt-files-size {
  color: var(--ink-muted, rgba(0,0,0,0.55));
  flex-shrink: 0;
}
.og-batch-prompt-heading {
  font-size: 13px;
  margin: 0 0 8px;
  letter-spacing: 0.02em;
}
`;

function BatchActionPrompt({ files, onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  if (!files || files.length === 0) return null;

  return (
    <div className="og-upload-confirm-shroud" onClick={onCancel}>
      <style>{BATCH_PROMPT_CSS}</style>
      <div
        className="og-upload-confirm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Pick an action for the batch"
      >
        <p className="og-batch-prompt-heading">
          Run which action on {files.length} file{files.length === 1 ? '' : 's'}?
        </p>
        <div className="og-batch-prompt-files" role="list">
          {files.map((f, i) => (
            <div className="og-batch-prompt-files-row" role="listitem" key={`${f.name}-${i}`}>
              <span className="og-batch-prompt-files-name">{f.name}</span>
              <span className="og-batch-prompt-files-size">{formatBytes(f.size)}</span>
            </div>
          ))}
        </div>
        <div className="og-action-tiles">
          {ACTION_GROUPS.map((group) => {
            const inGroup = MAGIC_ACTIONS.filter((a) => a.group === group);
            return (
              <div className="og-action-group" key={group}>
                <div className="og-action-group-label">{group}</div>
                <div className="og-action-group-tiles">
                  {inGroup.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="og-tile"
                      onClick={() => onConfirm(a.id)}
                      title={a.hint}
                      aria-label={`${a.label} — ${a.hint} — applies to all ${files.length} files`}
                    >
                      <span className="og-tile-glyph">{a.glyph}</span>
                      <span className="og-tile-label">{a.label}</span>
                      <span className="og-tile-hint">{a.hint}</span>
                      <span className="og-tile-key">⌥{a.key}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="og-upload-confirm-actions">
          <button
            type="button"
            className="og-btn-ghost"
            onClick={onCancel}
            autoFocus
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default BatchActionPrompt;
