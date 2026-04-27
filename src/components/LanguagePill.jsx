// Sprint 2.8b — small chip surfaced in the SourceColumn head when an
// extract response carries a `__detected_lang: <code>` trailing line.
// Track K added an override dropdown; clicking the pill opens a list of
// common languages and selecting one re-runs the active action with a
// language-locked prompt (see LANGUAGE_OVERRIDE_PROMPT in magicActions.js).
//
// Track R cleanup: the original Track K wiring used a window-level
// CustomEvent + module-level signal store because SourceColumn (Track I's
// owned file at the time) couldn't forward arbitrary props. SourceColumn
// is editable now, so the pill takes plain props: `lang`, `overrideLang`,
// `onOverride`, `sessionId`. No globals, no event hop.
//
// If `lang` is null/empty and there's no override, the pill renders nothing.
// `und` renders "Unknown" so the user can tell detection ran and came back
// empty rather than silently hiding. When `overrideLang` is set, the pill
// shows the override name plus an `(override)` suffix regardless of what
// was detected.
import { useEffect, useRef, useState } from 'react';

const LANG_NAMES = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  sv: 'Swedish',
  no: 'Norwegian',
  da: 'Danish',
  fi: 'Finnish',
  pl: 'Polish',
  ru: 'Russian',
  uk: 'Ukrainian',
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
  ar: 'Arabic',
  he: 'Hebrew',
  hi: 'Hindi',
  und: 'Unknown',
};

// The 6 languages exposed in the override dropdown plus an Auto-detect
// passthrough. Kept short on purpose — a wider menu has bad ergonomics
// inside a header pill. ISO codes line up with LANGUAGE_OVERRIDE_NAMES in
// magicActions.js so the prompt wrapper resolves the readable name.
const OVERRIDE_OPTIONS = [
  { code: 'auto', label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
];

function LanguagePill({ lang, onOverride, overrideLang, sessionId }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const effectiveOverride = overrideLang ?? null;

  // Click-outside / Escape close.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!lang && !effectiveOverride) return null;

  const activeLang = effectiveOverride || lang;
  const name = LANG_NAMES[activeLang] ?? activeLang.toUpperCase();
  const showOverrideTag = !!effectiveOverride && effectiveOverride !== 'auto';
  const labelText = showOverrideTag ? `${name} (override)` : name;

  const handlePick = (code) => {
    setOpen(false);
    if (typeof onOverride === 'function') {
      onOverride(code, sessionId ?? null);
    }
  };

  return (
    <span
      ref={wrapRef}
      className="og-lang-pill og-lang-pill--interactive"
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <button
        type="button"
        className="og-lang-pill-button"
        onClick={() => setOpen(o => !o)}
        title={`Detected language: ${name}. Click to override.`}
        aria-label={`Detected language ${labelText}. Click to choose a different language.`}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          background: 'none',
          border: 'none',
          color: 'inherit',
          font: 'inherit',
          padding: 0,
          cursor: 'pointer',
        }}
      >
        {labelText}
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Override language"
          className="og-lang-pill-menu"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            zIndex: 50,
            listStyle: 'none',
            padding: '4px 0',
            background: 'var(--bg-card, #fff)',
            border: '1px solid var(--rule-soft, #ddd)',
            borderRadius: 'var(--r-card, 6px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            minWidth: 140,
          }}
        >
          {OVERRIDE_OPTIONS.map((opt) => {
            const selected = (effectiveOverride || 'auto') === opt.code;
            return (
              <li key={opt.code} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => handlePick(opt.code)}
                  className="og-lang-pill-menu-item"
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    background: selected ? 'var(--bg-tint, #f0f0f0)' : 'none',
                    border: 'none',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    font: 'inherit',
                    color: 'inherit',
                  }}
                >
                  {opt.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </span>
  );
}

export default LanguagePill;
