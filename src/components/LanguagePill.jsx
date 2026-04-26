// Sprint 2.8b — small chip surfaced in the SourceColumn head when an
// extract response carries a `__detected_lang: <code>` trailing line.
// Track K extends the MVP with an override dropdown: clicking the pill
// opens a list of common languages; selecting one re-runs the active
// action with a language-locked prompt (see LANGUAGE_OVERRIDE_PROMPT in
// magicActions.js). The override re-run wires through a window-level
// custom event (`og:language-override`) because SourceColumn (Track I's
// owned file) renders this pill without forwarding arbitrary props, and
// Track K is not allowed to edit SourceColumn. App.jsx listens for the
// event and calls `runAction` with `languageOverride: lang`.
//
// If `lang` is null/empty the pill renders nothing; passing `und` renders
// "Unknown" so the user can tell detection ran and came back empty rather
// than silently hiding. When `overrideLang` is set, the pill shows the
// override name plus an `(override)` suffix, regardless of what was
// detected.
//
// Session-scoped override state (Track K workaround): SourceColumn doesn't
// forward arbitrary props down to us, so App.jsx cannot pass overrideLang
// per-session through the prop chain. Instead App.jsx publishes the active
// override map via `publishLanguageOverrides`; the pill subscribes via the
// same module-level signal and reads its session's entry. This keeps the
// "(override)" suffix accurate on reload without needing to edit
// SourceColumn.jsx.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

// Module-level overrides registry. App.jsx calls `publishLanguageOverrides`
// whenever the sessions array or active session changes; pills re-render
// through `useSyncExternalStore`. State shape:
//   { activeSessionId: string | null, map: { [sessionId]: 'es' | 'auto' | … } }
// SourceColumn (Track I) renders only one LanguagePill at a time bound to
// the active session — the pill resolves its own override by reading
// `map[activeSessionId]` when no explicit `sessionId` prop is passed.
let _overrideState = Object.freeze({ activeSessionId: null, map: Object.freeze({}) });
const _overrideListeners = new Set();

function _emit() {
  for (const fn of _overrideListeners) fn();
}

// Module-level signal hooks live alongside the component on purpose: Track K
// is restricted to LanguagePill.jsx for the override wiring and adding a new
// shared utility file would require editing the eslint includes / build map.
// The fast-refresh warning is benign here — the component re-mounts cleanly
// because the signal state is plain values, not React state.
// eslint-disable-next-line react-refresh/only-export-components
export function publishLanguageOverrides({ activeSessionId = null, map = {} } = {}) {
  _overrideState = Object.freeze({
    activeSessionId,
    map: Object.freeze({ ...(map || {}) }),
  });
  _emit();
}

function _subscribe(fn) {
  _overrideListeners.add(fn);
  return () => _overrideListeners.delete(fn);
}

function _getSnapshot() {
  return _overrideState;
}

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

  // Subscribe to the module-level override registry so the pill picks up
  // the post-re-run state even though SourceColumn doesn't forward an
  // overrideLang prop. The explicit `overrideLang` prop wins when given —
  // useful for tests and any future track that does forward props.
  const overrideState = useSyncExternalStore(_subscribe, _getSnapshot, _getSnapshot);
  const lookupId = sessionId ?? overrideState.activeSessionId;
  const subscribedOverride = lookupId ? overrideState.map[lookupId] : null;
  const effectiveOverride = overrideLang ?? subscribedOverride ?? null;

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
      onOverride(code);
      return;
    }
    // Fallback: SourceColumn (Track I) doesn't thread `onOverride` through to
    // us, so dispatch a window-level event for App.jsx to wire up. The
    // sessionId rides along so a stale render against an old session can't
    // misroute the re-run. Use a CustomEvent so it survives the typical
    // capturing/bubbling phases without React's synthetic plumbing.
    if (typeof window !== 'undefined' && typeof window.CustomEvent === 'function') {
      window.dispatchEvent(new window.CustomEvent('og:language-override', {
        detail: { lang: code, sessionId: sessionId ?? null },
      }));
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
