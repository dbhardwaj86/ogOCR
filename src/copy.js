// Centralized user-facing strings. The intent is twofold: keep copy edits
// in one place (PRs touching wording don't churn components) and make a
// future i18n pass tractable. Component code should reference these by key
// rather than embedding literals — that's a Sprint 2 cleanup target.

export const COPY = Object.freeze({
  upload: {
    title: 'Drop a file or click to browse',
    sub: 'JPG · PNG · PDF · up to 10 MB',
    camera: 'Snap a photo',
    cameraAria: 'Take photo with camera',
  },
  uploadConfirm: {
    pdfNote: 'Preview not available — Gemini will read all pages.',
    cancel: 'Cancel',
    confirmImage: 'Use this image',
    confirmPdf: 'Use this PDF',
  },
  output: {
    placeholder: 'Run an action to extract — your file is ready.',
    sourcePlaceholder: 'Drop a doc, then ask anything…',
    pillRendered: 'Preview',
    pillSource: 'Markdown',
    pillCompile: 'Worksheet',
  },
  prompt: {
    placeholder: 'Ask anything — translate, summarize, restructure…',
    run: 'Run',
  },
  exports: {
    save: 'Save',
    share: 'Share',
    export: 'Export',
    drive: 'Drive',
    md: 'MD',
    svg: 'SVG',
    pdf: 'Print → PDF',
    email: 'Email',
    classroom: 'Classroom',
    link: 'Link',
    copy: 'Copy',
    png: 'PNG',
    json: 'JSON',
  },
  empty: {
    sessions: 'No extractions yet.',
    sourcePane: 'Upload a document to begin.',
    outputPane: 'Nothing extracted yet — pick an action.',
  },
  welcome: {
    title: 'Welcome to ogOCR',
    skip: 'Skip',
    next: 'Next',
    back: 'Back',
    done: 'Get started',
    trySample: 'Try a sample',
    sampleFilename: 'sample-welcome.png',
    slides: [
      {
        eyebrow: '01',
        title: 'Drop or snap a file',
        body: 'Drag a JPG, PNG, or PDF onto the rail — or use Snap a photo on mobile. We confirm the file before reading it.',
      },
      {
        eyebrow: '02',
        title: 'Pick an action',
        body: 'Eight magic actions cover text, math, tables, sketches, and more. Need something else? Type it into the prompt at the top of the output pane.',
      },
      {
        eyebrow: '03',
        title: 'Save, share, export',
        body: 'Send to Drive or email, copy the markdown, print to PDF, or stack pages in the Worksheet builder. Try a sample to see it end-to-end.',
      },
    ],
  },
});

export default COPY;
