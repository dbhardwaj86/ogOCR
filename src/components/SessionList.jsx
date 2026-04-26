import { KIND_GLYPH, relTime } from '../magicActions';

function KindGlyph({ kind }) {
  const ch = KIND_GLYPH[kind] || '·';
  return <span className="og-kind-glyph">{ch}</span>;
}

function SessionRow({ session, active, onClick, onDelete }) {
  return (
    <div
      className={'og-session' + (active ? ' is-active' : '')}
      onClick={onClick}
      role="button"
      tabIndex={0}
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
        aria-label="Delete session"
        title="Delete"
      >
        ×
      </button>
    </div>
  );
}

function SessionList({ sessions, activeSessionId, setActiveSessionId, deleteSession }) {
  if (!sessions || sessions.length === 0) {
    return (
      <div style={{ fontFamily: 'var(--serif)', fontSize: 13, fontStyle: 'italic', color: 'var(--ink-faint)', padding: '12px 0' }}>
        No extractions yet.
      </div>
    );
  }
  const ordered = [...sessions].sort((a, b) => b.date - a.date);
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
