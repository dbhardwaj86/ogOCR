import { MAGIC_ACTIONS } from '../magicActions';

function ProcessingStrip({ processing, onCancel }) {
  if (!processing) return null;
  const { progress, stage, actionId } = processing;
  const action = MAGIC_ACTIONS.find(a => a.id === actionId) || { label: 'Working' };
  const indeterminate = progress >= 95;
  return (
    <div className="og-proc" role="status" aria-live="polite">
      <div className="og-proc-glyph"><span className="og-proc-spin">◐</span></div>
      <div className="og-proc-mid">
        <div className="og-proc-line">
          <span className="og-proc-action">{action.label}</span>
          <span className="og-proc-stage">· {indeterminate ? 'finishing up' : stage}</span>
        </div>
        <div className={'og-proc-bar' + (indeterminate ? ' is-indeterminate' : '')}>
          <div className="og-proc-bar-fill" style={{ width: progress + '%' }} />
        </div>
      </div>
      <div className="og-proc-pct">{Math.round(progress)}%</div>
      {onCancel && (
        <button
          type="button"
          className="og-proc-cancel"
          onClick={onCancel}
          aria-label="Cancel running action"
          title="Cancel"
        >
          Cancel
        </button>
      )}
    </div>
  );
}

export default ProcessingStrip;
