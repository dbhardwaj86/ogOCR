// The 8 magic actions. Each row's `id`, `prompt`, and `endpoint` are the
// wire-compat contract with the existing server endpoints — do not rename
// or change those values without coordinating with server/index.js.
export const MAGIC_ACTIONS = [
  {
    id: 'text', group: 'Text', label: 'Extract Text',
    hint: 'Plain prose, paragraphs preserved',
    glyph: 'T', key: 'T',
    endpoint: '/api/extract',
    prompt: 'Extract all text from this image accurately. Maintain paragraphs. Return strictly markdown.',
  },
  {
    id: 'handwriting', group: 'Text', label: 'Clean Handwriting',
    hint: 'Transcribe + fix obvious errors',
    glyph: 'H', key: 'H',
    endpoint: '/api/extract',
    prompt: 'This is a handwritten note. Transcribe it perfectly, fixing any obvious spelling errors, and format it nicely in markdown.',
  },
  {
    id: 'table', group: 'Structure', label: 'Format as Table',
    hint: 'Tabular data → markdown table',
    glyph: '▦', key: 'B',
    endpoint: '/api/extract',
    prompt: 'Extract the data from this image and format it perfectly as a markdown table.',
  },
  {
    id: 'actions', group: 'Structure', label: 'Extract Actions',
    hint: 'Pull tasks into a checklist',
    glyph: '✓', key: 'A',
    endpoint: '/api/extract',
    prompt: 'Read this document and extract a list of actionable items or tasks. Format them as a markdown checklist.',
  },
  {
    id: 'math', group: 'Symbol', label: 'Math to LaTeX',
    hint: 'Equations → compile-ready LaTeX',
    glyph: '∑', key: 'M',
    endpoint: '/api/extract',
    prompt: 'Extract the handwritten math equations from this document and output compile-ready LaTeX code. Do not include markdown code blocks, just the raw LaTeX.',
  },
  {
    id: 'mermaid', group: 'Symbol', label: 'Diagram → Mermaid',
    hint: 'Flowchart → Mermaid.js code',
    glyph: '◇', key: 'D',
    endpoint: '/api/extract',
    prompt: 'Convert the flowchart or diagram in this image into valid Mermaid.js markdown code. Return strictly the Mermaid code block.',
  },
  {
    id: 'sketch', group: 'Visual', label: 'Sketch → SVG',
    hint: 'Hand drawing → editable SVG',
    glyph: '✎', key: 'S',
    endpoint: '/api/sketch-to-svg',
    prompt: null,
  },
  {
    id: 'images', group: 'Visual', label: 'Extract Images',
    hint: 'Pull all figures with descriptions',
    glyph: '▣', key: 'I',
    endpoint: '/api/extract-images',
    prompt: null,
  },
];

export const ACTION_GROUPS = ['Text', 'Structure', 'Symbol', 'Visual'];

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
