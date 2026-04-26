import { useEffect, useState } from 'react';
import { subscribeLog, clearLog, copyLogText } from '../errors/log';

function DiagnosticsPanel({ open, onClose }) {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    if (!open) return;
    return subscribeLog(setEntries);
  }, [open]);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyLogText());
    } catch {
      // ignore — registry will surface clipboard failures elsewhere
    }
  };

  return (
    <div className="og-palette-shroud" role="dialog" aria-label="Diagnostics" onClick={onClose}>
      <div className="og-palette og-diagnostics" onClick={(e) => e.stopPropagation()}>
        <div className="og-diagnostics-head">
          <span className="og-diagnostics-title">Diagnostics — last 5 errors</span>
          <div className="og-diagnostics-actions">
            <button type="button" className="og-export-btn" onClick={handleCopy}>Copy details</button>
            <button type="button" className="og-export-btn" onClick={() => clearLog()}>Clear</button>
            <button type="button" className="og-export-btn" onClick={onClose}>Close</button>
          </div>
        </div>
        {entries.length === 0 ? (
          <div className="og-diagnostics-empty">Nothing logged yet.</div>
        ) : (
          <ul className="og-diagnostics-list">
            {entries.map((e, i) => (
              <li key={i} className={`og-diagnostics-item og-diagnostics-${e.severity || 'error'}`}>
                <div className="og-diagnostics-row">
                  <span className="og-diagnostics-time">{new Date(e.ts).toLocaleTimeString()}</span>
                  <span className="og-diagnostics-code">{e.code}</span>
                </div>
                <div className="og-diagnostics-msg">{e.message}</div>
                {e.hint && <div className="og-diagnostics-hint">{e.hint}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default DiagnosticsPanel;
