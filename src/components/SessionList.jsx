import { useMemo } from 'react';
import { KIND_GLYPH, relTime } from '../magicActions';

function KindGlyph({ kind }) {
  const ch = KIND_GLYPH[kind] || '·';
  return <span className="og-kind-glyph">{ch}</span>;
}

function SessionRow({ session, active, onClick, onDelete }) {
  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onDelete(session.id);
    }
  };
  return (
    <div
      className={'og-session' + (active ? ' is-active' : '')}
      onClick={onClick}
      onKeyDown={handleKey}
      role="button"
      tabIndex={0}
      aria-pressed={active}
      aria-label={`Open ${session.filename}`}
    >
      <div className="og-session-thumb">
        <KindGlyph kind={session.kind || 'text'} />
      </div>
      <div className="og-session-body">
        <div className="og-session-name">{session.filename}</div>
        <div className="og-session-meta">
          <span>{relTime(session.date)}</span>
          <span className="og-session-dot" />
          <span>{(session.text || session.svg || '').length.toLocaleString()} chars</span>
        </div>
      </div>
      {active && <span className="og-session-marker">●</span>}
      <button
        className="og-session-delete"
        onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
        aria-label={`Delete session ${session.filename}`}
        title="Delete"
      >
        ×
      </button>
    </div>
  );
}

function SessionList({ sessions, activeSessionId, setActiveSessionId, deleteSession }) {
  const ordered = useMemo(
    () => (sessions ? [...sessions].sort((a, b) => b.date - a.date) : []),
    [sessions]
  );
  if (ordered.length === 0) {
    return (
      <div className="og-session-empty">
        No extractions yet.
      </div>
    );
  }
  return (
    <div className="og-session-list">
      {ordered.map(s => (
        <SessionRow
          key={s.id}
          session={s}
          active={s.id === activeSessionId}
          onClick={() => setActiveSessionId(s.id)}
          onDelete={deleteSession}
        />
      ))}
    </div>
  );
}

export default SessionList;
