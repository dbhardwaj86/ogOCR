import { useEffect, useState } from 'react';
import { subscribe, getItems, cancel, cancelAll, STATUS } from '../queue.js';

// Renders pending + running queue items in the LibraryRail. Mounts nothing
// when the queue is empty so the existing single-file path is visually
// unchanged. Styles are inline (small isolated UI, avoids touching the
// shared index.css that Track H owns).

const STYLE_BLOCK = `
.og-queue {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px 12px;
  border-top: 1px solid var(--rule-soft, rgba(0,0,0,0.08));
}
.og-queue-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font: 500 11px/1.2 var(--mono, ui-monospace);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-muted, #555);
  margin-bottom: 4px;
}
.og-queue-head-actions {
  font-size: 10px;
}
.og-queue-cancel-all {
  appearance: none;
  background: transparent;
  border: 1px solid var(--rule-soft, rgba(0,0,0,0.12));
  color: var(--ink, #222);
  padding: 2px 8px;
  font: inherit;
  cursor: pointer;
  border-radius: var(--r-chip, 4px);
}
.og-queue-cancel-all:hover {
  background: var(--bg-tint, rgba(0,0,0,0.04));
}
.og-queue-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid var(--rule-soft, rgba(0,0,0,0.08));
  border-radius: var(--r-tile, 8px);
  background: var(--bg-card, #fff);
}
.og-queue-row.is-running {
  border-color: var(--accent, #4046c8);
}
.og-queue-row-name {
  font-size: 12px;
  color: var(--ink, #222);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.og-queue-row-status {
  font: 500 9px/1 var(--mono, ui-monospace);
  text-transform: uppercase;
  color: var(--ink-muted, #777);
  letter-spacing: 0.05em;
  margin-left: 4px;
}
.og-queue-progress {
  grid-column: 1 / -1;
  height: 3px;
  background: var(--bg-tint, rgba(0,0,0,0.06));
  border-radius: 2px;
  overflow: hidden;
  margin-top: 2px;
}
.og-queue-progress-bar {
  height: 100%;
  background: var(--accent, #4046c8);
  transition: width 0.18s ease-out;
}
.og-queue-row-cancel {
  appearance: none;
  background: transparent;
  border: none;
  color: var(--ink-muted, #777);
  font-size: 14px;
  line-height: 1;
  width: 18px;
  height: 18px;
  cursor: pointer;
  border-radius: 3px;
}
.og-queue-row-cancel:hover {
  color: var(--ink, #222);
  background: var(--bg-tint, rgba(0,0,0,0.06));
}
`;

function QueueRow({ item }) {
  const isRunning = item.status === STATUS.RUNNING;
  const pct = Math.round((item.progress || 0) * 100);
  const statusLabel = isRunning ? `${pct}%` : 'queued';
  return (
    <div className={'og-queue-row' + (isRunning ? ' is-running' : '')}>
      <div className="og-queue-row-name" title={item.file?.name || ''}>
        {item.file?.name || 'untitled'}
        <span className="og-queue-row-status">{statusLabel}</span>
      </div>
      <button
        className="og-queue-row-cancel"
        type="button"
        aria-label={`Cancel ${item.file?.name || 'item'}`}
        onClick={() => cancel(item.id)}
      >
        ×
      </button>
      <div className="og-queue-progress" aria-hidden="true">
        <div className="og-queue-progress-bar" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function QueueRail() {
  // `tick` is a counter; we re-render on every queue notification by bumping
  // it. We don't need to memo the items because the queue stores them as
  // mutable references and we read fresh on every render.
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsub = subscribe(() => setTick(t => t + 1));
    return unsub;
  }, []);

  const all = getItems();
  const active = all.filter(i =>
    i.status === STATUS.PENDING || i.status === STATUS.RUNNING
  );
  if (active.length === 0) return null;

  // Header counter: which item is currently running (1-based) of the visible
  // active set. Falls back to "0 of N" if everything is still pending (rare;
  // pump kicks off synchronously after enqueue).
  const runningIdx = active.findIndex(i => i.status === STATUS.RUNNING);
  const current = runningIdx === -1 ? 0 : runningIdx + 1;
  const total = active.length;

  return (
    <div className="og-rail-section og-queue-wrap">
      <style>{STYLE_BLOCK}</style>
      <div className="og-section-title">
        <span className="og-section-num">Q</span>
        <span>Queue</span>
        <span className="og-section-count">{current} of {total}</span>
      </div>
      <div className="og-queue">
        <div className="og-queue-head">
          <span>Sequential · one at a time</span>
          <div className="og-queue-head-actions">
            <button
              type="button"
              className="og-queue-cancel-all"
              onClick={() => cancelAll()}
            >
              Cancel all
            </button>
          </div>
        </div>
        {active.map(item => (
          <QueueRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

export default QueueRail;
