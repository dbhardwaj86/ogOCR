import { useEffect, useState } from 'react';

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function UploadConfirmModal({ file, onConfirm, onCancel }) {
  const isImage = file?.type?.startsWith('image/');
  const isPdf = file?.type === 'application/pdf';

  // Allocate inside an effect so React 19 StrictMode's dev double-invocation
  // doesn't leak the first URL. (`useMemo` factories run twice in dev; only
  // the second URL would be revoked, the first leaks. Effects double-invoke
  // too but their cleanup runs between, balancing alloc/revoke.) State is
  // updated via microtask + cleanup so we never call setState synchronously
  // within the effect body (forbidden by react-hooks/set-state-in-effect).
  const [previewUrl, setPreviewUrl] = useState(null);
  useEffect(() => {
    if (!isImage || !file) return undefined;
    const url = URL.createObjectURL(file);
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setPreviewUrl(url); });
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
      setPreviewUrl(null);
    };
  }, [file, isImage]);

  // Render page 1 of the PDF as a thumbnail. Lazy-loads pdfjs-dist so the
  // dependency stays out of the main bundle. Cached in state for the modal's
  // lifecycle. Falls back to the placeholder text on any error.
  const [pdfPage1, setPdfPage1] = useState(null);
  const [pdfError, setPdfError] = useState(null);

  useEffect(() => {
    if (!isPdf || !file) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const buf = await file.arrayBuffer();
        if (cancelled) return;
        const doc = await pdfjs.getDocument({ data: buf }).promise;
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (!cancelled) setPdfPage1(canvas.toDataURL('image/png'));
      } catch (e) {
        if (!cancelled) setPdfError(e);
      }
    })();
    return () => {
      cancelled = true;
      // Reset state on cleanup so a different file re-runs from scratch.
      setPdfPage1(null);
      setPdfError(null);
    };
  }, [file, isPdf]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm(file);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [file, onCancel, onConfirm]);

  if (!file) return null;

  return (
    <div className="og-upload-confirm-shroud" onClick={onCancel}>
      <div
        className="og-upload-confirm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Confirm upload"
      >
        <div className="og-upload-confirm-preview">
          {isImage && previewUrl && (
            <img src={previewUrl} alt={file.name} />
          )}
          {isPdf && pdfPage1 && (
            <img src={pdfPage1} alt={`${file.name} — page 1`} />
          )}
          {isPdf && !pdfPage1 && (
            <div className="og-upload-confirm-pdf">
              <span className="og-upload-confirm-pdf-glyph">▤</span>
              <span className="og-upload-confirm-pdf-name">{file.name}</span>
              <span className="og-upload-confirm-pdf-note">
                {pdfError
                  ? 'Preview not available — Gemini will read all pages.'
                  : 'Rendering page 1 preview…'}
              </span>
            </div>
          )}
          {!isImage && !isPdf && (
            <div className="og-upload-confirm-pdf">
              <span className="og-upload-confirm-pdf-glyph">?</span>
              <span className="og-upload-confirm-pdf-name">{file.name}</span>
              <span className="og-upload-confirm-pdf-note">
                Unsupported file type
              </span>
            </div>
          )}
        </div>
        <div className="og-upload-confirm-meta">
          <span>{file.name}</span>
          <span>{formatBytes(file.size)}</span>
          <span>{file.type || 'unknown'}</span>
        </div>
        <div className="og-upload-confirm-actions">
          <button
            type="button"
            className="og-btn-ghost"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="og-btn-primary"
            onClick={() => onConfirm(file)}
            disabled={!isImage && !isPdf}
            autoFocus
          >
            Use this {isPdf ? 'PDF' : isImage ? 'image' : 'file'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default UploadConfirmModal;
