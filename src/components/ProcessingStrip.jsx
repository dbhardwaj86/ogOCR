import { useEffect, useState } from 'react';
import { MAGIC_ACTIONS } from '../magicActions';

// Honest progress strip. Two modes:
//   1) Below 95% — show the synthesized percentage + stage label.
//   2) At/over 95% (cap) — drop the lying bar, show elapsed time and the
//      "expected up to 3 min for large PDFs" hint so the user knows the
//      app isn't frozen during the silent stretch where Gemini is still
//      thinking.
function formatElapsed(ms) {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const ACTION_LABEL_FALLBACKS = {
  'sketch-batch': 'Vectorize batch',
  'sketch': 'Vectorize',
};

function ProcessingStrip({ processing, onCancel }) {
  // Tick a "now" timestamp every second once the cap is hit so the elapsed
  // counter updates visibly without calling Date.now() during render.
  const startedAt = processing?.startedAt;
  const indeterminate = (processing?.progress ?? 0) >= 95;
  // `now` is populated by setInterval only — never synchronously inside the
  // effect body — so the lint rule against sync-setState-in-effect stays
  // happy. Until the first tick, `elapsedText` shows blank, which is fine
  // for the sub-1s case before the cap is hit.
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!processing) return undefined;
    if (!indeterminate || !startedAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [processing, indeterminate, startedAt]);

  if (!processing) return null;
  const { progress, stage, actionId } = processing;
  const action =
    MAGIC_ACTIONS.find(a => a.id === actionId)
    || { label: ACTION_LABEL_FALLBACKS[actionId] || 'Working' };
  const elapsedText = startedAt && now > startedAt ? formatElapsed(now - startedAt) : '';
  return (
    <div className="og-proc" role="status" aria-live="polite">
      <div className="og-proc-glyph"><span className="og-proc-spin">◐</span></div>
      <div className="og-proc-mid">
        <div className="og-proc-line">
          <span className="og-proc-action">{action.label}</span>
          <span className="og-proc-stage">
            · {indeterminate
              ? `still working · ${elapsedText} elapsed · large PDFs may take 1–3 min`
              : stage}
          </span>
        </div>
        <div className={'og-proc-bar' + (indeterminate ? ' is-indeterminate' : '')}>
          <div className="og-proc-bar-fill" style={{ width: progress + '%' }} />
        </div>
      </div>
      <div className="og-proc-pct">
        {indeterminate ? elapsedText : `${Math.round(progress)}%`}
      </div>
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
