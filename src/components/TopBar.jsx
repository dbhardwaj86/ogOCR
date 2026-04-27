import { useState, useEffect } from 'react';
import CornerBracket from './CornerBracket';
import MockBadge from './MockBadge';
import { NEXT_THEME, THEME_LABELS } from '../theme';
import { modKeyLabel } from '../platform';

function TopBar({ activeSession, theme, onThemeCycle, onPaletteOpen, onDiagnosticsOpen }) {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="og-topbar">
      <div className="og-brand">
        <CornerBracket />
        <div className="og-wordmark">
          <span className="og-word-og">og</span>
          <span className="og-word-ocr">OCR</span>
          <span className="og-word-sub">No.<em>03</em></span>
        </div>
      </div>
      <div className="og-topbar-mid">
        <span className="og-meta-key">SESSION</span>
        <span className="og-meta-val">
          {time.toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>
        <span className="og-meta-dot" />
        <span className="og-meta-key">MODEL</span>
        <span className="og-meta-val">gemini · 2.5</span>
        {activeSession && (
          <>
            <span className="og-meta-dot" />
            <span className="og-meta-key">FILE</span>
            <span className="og-meta-val">{activeSession.filename}</span>
          </>
        )}
        <MockBadge />
      </div>
      <div className="og-topbar-right">
        <button
          className="og-theme-cycle"
          onClick={onThemeCycle}
          title={`Switch to ${THEME_LABELS[NEXT_THEME[theme]]}`}
        >
          {THEME_LABELS[theme] || 'Paper'}
        </button>
        {onDiagnosticsOpen && (
          <button
            type="button"
            className="og-kbd og-kbd-btn"
            onClick={onDiagnosticsOpen}
            title="Open diagnostics (Shift+?)"
            aria-label="Open diagnostics"
          >
            ?
          </button>
        )}
        <button
          type="button"
          className="og-kbd og-kbd-btn"
          onClick={onPaletteOpen}
          title="Open command palette"
        >
          {modKeyLabel('K')}
        </button>
        <span className="og-kbd-label">command</span>
      </div>
    </header>
  );
}

export default TopBar;
