// Sprint 2.8b — every text-bearing extract prompt asks Gemini to append a
// detected-language metadata line as the LAST line of its response. The
// frontend strips that line before render and surfaces the code via the
// LanguagePill in the source-column header. "und" means undetectable; the
// pill renders "Unknown" rather than hiding so the user knows we tried.
const DETECTED_LANG_DIRECTIVE =
  ' Always end your response with a single line: "__detected_lang: <ISO 639-1 code>"' +
  ' (e.g., "__detected_lang: en"). Use "und" if you cannot detect.';

// The 8 magic actions. Each row's `id`, `prompt`, and `endpoint` are the
// wire-compat contract with the existing server endpoints — do not rename
// or change those values without coordinating with server/index.js.
//
// `tier` segments the grid into the verbs a first-time user actually needs
// (`primary`: text, table, math) versus the niche outputs (`overflow`).
// Today the renderer surfaces the field as a `data-tier` attribute so the
// design migration can collapse overflow into a "More…" popover without
// touching this contract or the runAction wiring.
export const MAGIC_ACTIONS = [
  {
    id: 'text', group: 'Text', label: 'Extract Text',
    hint: 'Plain prose, paragraphs preserved',
    glyph: 'T', key: 'T', tier: 'primary',
    endpoint: '/api/extract',
    prompt: 'Extract all text from this image accurately. Maintain paragraphs. Return strictly markdown.' + DETECTED_LANG_DIRECTIVE,
  },
  {
    id: 'handwriting', group: 'Text', label: 'Clean Handwriting',
    hint: 'Transcribe + fix obvious errors',
    glyph: 'H', key: 'H', tier: 'overflow',
    endpoint: '/api/extract',
    prompt: 'This is a handwritten note. Transcribe it perfectly, fixing any obvious spelling errors, and format it nicely in markdown.' + DETECTED_LANG_DIRECTIVE,
  },
  {
    id: 'table', group: 'Structure', label: 'Format as Table',
    hint: 'Tabular data → markdown table',
    glyph: '▦', key: 'B', tier: 'primary',
    endpoint: '/api/extract',
    prompt: 'Extract the data from this image and format it perfectly as a markdown table.' + DETECTED_LANG_DIRECTIVE,
  },
  {
    id: 'actions', group: 'Structure', label: 'Extract Actions',
    hint: 'Pull tasks into a checklist',
    glyph: '✓', key: 'A', tier: 'overflow',
    endpoint: '/api/extract',
    prompt: 'Read this document and extract a list of actionable items or tasks. Format them as a markdown checklist.' + DETECTED_LANG_DIRECTIVE,
  },
  {
    id: 'math', group: 'Symbol', label: 'Math to LaTeX',
    hint: 'Equations → compile-ready LaTeX',
    glyph: '∑', key: 'M', tier: 'primary',
    endpoint: '/api/extract',
    prompt: 'Extract the handwritten math equations from this document and output compile-ready LaTeX code. Do not include markdown code blocks, just the raw LaTeX.',
  },
  {
    id: 'mermaid', group: 'Symbol', label: 'Diagram → Mermaid',
    hint: 'Flowchart → Mermaid.js code',
    glyph: '◇', key: 'D', tier: 'overflow',
    endpoint: '/api/extract',
    prompt: 'Convert the flowchart or diagram in this image into valid Mermaid.js markdown code. Return strictly the Mermaid code block.',
  },
  {
    id: 'sketch', group: 'Visual', label: 'Sketch → SVG',
    hint: 'Detect & vectorize sketches',
    glyph: '✎', key: 'S', tier: 'overflow',
    endpoint: '/api/sketch-to-svg',
    prompt: null,
  },
  {
    id: 'images', group: 'Visual', label: 'Extract Images',
    hint: 'Pull all figures with descriptions',
    glyph: '▣', key: 'I', tier: 'overflow',
    endpoint: '/api/extract-images',
    prompt: null,
  },
];

export const ACTION_GROUPS = ['Text', 'Structure', 'Symbol', 'Visual'];

// Refine actions reuse the /api/extract endpoint to rewrite the active
// session's extracted text into one of four canned tones. They share the
// magic-action wire shape (id/label/hint/prompt) but are a separate group
// — they don't operate on the uploaded file, they refine `session.text`.
// Each prompt ends with a strict markdown directive so the response slots
// cleanly into the existing ReactMarkdown render path.
export const REFINE_ACTIONS = [
  {
    id: 'refine-summary',
    label: 'Summary',
    hint: 'Three-sentence summary of the source',
    kind: 'summary',
    prompt: 'Summarize the following text in exactly three sentences. Capture the most important points and keep the tone neutral. Output markdown only — no preamble.',
  },
  {
    id: 'refine-bullets',
    label: 'Bullets',
    hint: 'Concise bullet list of the key points',
    kind: 'bullets',
    prompt: 'Rewrite the following text as a concise markdown bullet list. Each bullet must be a single short sentence covering one key point. Output markdown only — no preamble.',
  },
  {
    id: 'refine-formal',
    label: 'Formal',
    hint: 'Formal, professional rewrite',
    kind: 'formal',
    prompt: 'Rewrite the following text in a formal, professional tone. Keep the meaning unchanged but elevate the diction and sentence structure. Output markdown only — no preamble.',
  },
  {
    id: 'refine-casual',
    label: 'Casual',
    hint: 'Casual, friendly rewrite',
    kind: 'casual',
    prompt: 'Rewrite the following text in a casual, friendly tone — as if explaining it to a friend. Keep the meaning unchanged. Output markdown only — no preamble.',
  },
];

// Map id → refinement key on session.refinements. Stable union with the
// 8 magic-action ids; do not collide.
export const REFINE_KIND_BY_ID = REFINE_ACTIONS.reduce((acc, a) => {
  acc[a.id] = a.kind;
  return acc;
}, {});

export const REFINE_LABEL_BY_KIND = REFINE_ACTIONS.reduce((acc, a) => {
  acc[a.kind] = a.label;
  return acc;
}, {});

export const KIND_LABEL = {
  text: 'Plain text',
  handwriting: 'Handwriting',
  table: 'Tabular',
  actions: 'Action items',
  math: 'LaTeX',
  mermaid: 'Mermaid',
  sketch: 'SVG',
  images: 'Image set',
};

export const KIND_GLYPH = {
  text: 'T',
  handwriting: 'H',
  table: '▦',
  actions: '✓',
  math: '∑',
  mermaid: '◇',
  sketch: '✎',
  images: '▣',
};

export function relTime(d) {
  const sec = Math.round((Date.now() - d) / 1000);
  if (sec < 60) return sec + 's ago';
  if (sec < 3600) return Math.round(sec / 60) + 'm ago';
  if (sec < 86400) return Math.round(sec / 3600) + 'h ago';
  return Math.round(sec / 86400) + 'd ago';
}

// Sprint 2.8b — language detection helpers. The extract prompt now instructs
// Gemini to append `__detected_lang: <code>` as the final line of its
// response. `parseDetectedLang` returns the trailing code (or null);
// `stripDetectedLang` removes the metadata line so the user only sees the
// content. The regex is anchored to the end of the string so an inline
// occurrence inside the body cannot fool either helper. If the model emits
// the directive multiple times (it shouldn't, but Gemini occasionally
// duplicates instructions), only the last trailing line wins.
const DETECTED_LANG_TRAILING_RE = /\n__detected_lang:\s*([a-z]{2,3})\s*$/;

export function parseDetectedLang(text) {
  if (typeof text !== 'string') return null;
  const m = text.match(DETECTED_LANG_TRAILING_RE);
  return m ? m[1] : null;
}

export function stripDetectedLang(text) {
  if (typeof text !== 'string') return text;
  return text.replace(DETECTED_LANG_TRAILING_RE, '');
}

// Track K — language override re-run. When the user picks a language in
// LanguagePill, the next `runAction` call wraps the action's prompt with
// this helper so Gemini (a) treats the document as written in the chosen
// language and (b) keeps emitting the trailing `__detected_lang:` line so
// the pill keeps rendering after the override lands. Passing `auto` (or
// any falsy value) returns the basePrompt unchanged — LanguagePill uses
// `auto` as the "clear override" sentinel.
export const LANGUAGE_OVERRIDE_NAMES = Object.freeze({
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  zh: 'Chinese',
  ja: 'Japanese',
});

export function LANGUAGE_OVERRIDE_PROMPT(basePrompt, lang) {
  const base = typeof basePrompt === 'string' ? basePrompt : '';
  if (!lang || lang === 'auto') return base;
  const name = LANGUAGE_OVERRIDE_NAMES[lang];
  if (!name) return base;
  // Prepend the language constraint and append the detected_lang directive
  // so override responses still flow through `parseDetectedLang` and update
  // the pill (the `(override)` suffix is owned by the LanguagePill prop, not
  // the prompt — Gemini just keeps echoing the iso code we forced).
  const prefix = `Treat the document as written in ${name}. Output nothing in any other language. `;
  const suffix = `\n\nAt the very end, on its own line, output: __detected_lang: ${lang}`;
  return prefix + base + suffix;
}
