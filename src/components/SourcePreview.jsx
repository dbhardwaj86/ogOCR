import { useEffect, useMemo } from 'react';
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
        ) : isPdf ? (
          <div className="og-doc-pdf">PDF document — preview unavailable</div>
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
