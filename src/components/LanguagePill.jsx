// Sprint 2.8b — small chip surfaced in the SourceColumn head when an
// extract response carries a `__detected_lang: <code>` trailing line.
// MVP: display-only. Override re-run requires touching App.jsx#runAction
// (Track E) so it's deferred to a follow-up. If `lang` is null/empty the
// component renders nothing; passing `und` renders "Unknown" so the user
// can tell detection ran and came back empty rather than silently hiding.
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

function LanguagePill({ lang }) {
  if (!lang) return null;
  const name = LANG_NAMES[lang] ?? lang.toUpperCase();
  return (
    <span
      className="og-lang-pill"
      title={`Detected language: ${name}`}
      aria-label={`Detected language ${name}`}
    >
      {name}
    </span>
  );
}

export default LanguagePill;
