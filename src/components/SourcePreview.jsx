import { useEffect, useMemo, useState } from 'react';
import CornerBracket from './CornerBracket';

function PlaceholderLines({ seed }) {
  const lines = useMemo(() => {
    const s = seed || 1;
    const arr = [];
    for (let i = 0; i < 18; i++) {
      const w = 30 + ((s * (i + 3)) % 60);
      const indent = (i % 5 === 0) ? 0 : ((s + i) % 4) * 6;
      arr.push({ w, indent });
    }
    return arr;
  }, [seed]);
  return (
    <div className="og-doc-lines">
      {lines.map((l, i) => (
        <div key={i} className="og-doc-line" style={{ width: l.w + '%', marginLeft: l.indent + '%' }} />
      ))}
    </div>
  );
}

function SourcePreview({ session, file, processing, onImageDims }) {
  // Memoize the blob URL so re-renders don't realloc, then revoke on unmount or
  // when `file` changes. StrictMode's dev double-mount still pairs alloc with
  // a clean revoke because the unmount cleanup fires before the second mount's
  // memo runs.
  const imageUrl = useMemo(() => {
    if (!file?.type?.startsWith('image/')) return null;
    return URL.createObjectURL(file);
  }, [file]);
  useEffect(() => {
    if (!imageUrl) return undefined;
    return () => URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const isPdf = file?.type === 'application/pdf';
  const filename = file?.name || session?.filename || 'no document';
  const stamp = session ? new Date(session.date).toISOString().slice(0, 10) : '—';
  const seed = (session?.id?.charCodeAt?.(session.id.length - 1)) || 7;
  const isProcessing = !!processing;
  const pct = processing?.progress ?? 0;
  const stage = processing?.stage;

  // Lazy-render page 1 of a PDF using pdfjs-dist via dynamic import. Keeps the
  // main bundle lean (Phase 12 removed pdfjs-dist; reintroduced here for the
  // preview-only path). Falls back silently to the placeholder on any error.
  const [pdfPage1, setPdfPage1] = useState(null);
  const [pdfError, setPdfError] = useState(null);

  useEffect(() => {
    if (!file || file.type !== 'application/pdf') return undefined;
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
      // Reset on cleanup so a swap from one PDF to another (or to an image)
      // re-runs the effect with a clean slate. This runs *outside* the effect
      // body so it doesn't trigger the cascading-renders lint.
      setPdfPage1(null);
      setPdfError(null);
    };
  }, [file]);

  const handleImgLoad = (e) => {
    const img = e.currentTarget;
    if (img.naturalWidth && onImageDims) {
      onImageDims({ w: img.naturalWidth, h: img.naturalHeight });
    }
  };

  return (
    <div className="og-doc-preview">
      <div className="og-doc-corners">
        <CornerBracket />
        <CornerBracket flip="x" />
        <CornerBracket flip="y" />
        <CornerBracket flip="xy" />
      </div>

      <div className="og-doc-paper">
        <div className="og-doc-header">
          <div className="og-doc-stamp">
            <span>SCAN</span>
            <span>·</span>
            <span>{stamp}</span>
          </div>
          <div className="og-doc-filename">{filename}</div>
        </div>

        {imageUrl ? (
          <img className="og-doc-image" src={imageUrl} alt={filename} onLoad={handleImgLoad} />
        ) : isPdf && pdfPage1 ? (
          <img className="og-doc-image" src={pdfPage1} alt={`${filename} — page 1`} />
        ) : isPdf ? (
          <div className="og-doc-pdf">
            {pdfError ? 'PDF document — preview unavailable' : 'Rendering PDF preview…'}
          </div>
        ) : (
          <PlaceholderLines seed={seed} />
        )}

        {isProcessing && (
          <div className="og-scanline" style={{ top: pct + '%' }}>
            <div className="og-scanline-bar" />
            <div className="og-scanline-meta">
              <span>{Math.round(pct)}%</span>
              <span>{stage}</span>
            </div>
          </div>
        )}
      </div>

      <div className="og-doc-coords">
        <span>x: 0</span>
        <span>y: 0</span>
        <span>x: 1240</span>
        <span>y: 1754</span>
      </div>
    </div>
  );
}

export default SourcePreview;
