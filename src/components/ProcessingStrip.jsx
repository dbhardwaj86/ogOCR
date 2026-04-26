import { MAGIC_ACTIONS } from '../magicActions';

function ProcessingStrip({ processing }) {
  if (!processing) return null;
  const { progress, stage, actionId } = processing;
  const action = MAGIC_ACTIONS.find(a => a.id === actionId) || { label: 'Working' };
  return (
    <div className="og-proc">
      <div className="og-proc-glyph"><span className="og-proc-spin">◐</span></div>
      <div className="og-proc-mid">
        <div className="og-proc-line">
          <span className="og-proc-action">{action.label}</span>
          <span className="og-proc-stage">· {stage}</span>
        </div>
        <div className="og-proc-bar">
          <div className="og-proc-bar-fill" style={{ width: progress + '%' }} />
        </div>
      </div>
      <div className="og-proc-pct">{Math.round(progress)}%</div>
    </div>
  );
}

export default ProcessingStrip;
