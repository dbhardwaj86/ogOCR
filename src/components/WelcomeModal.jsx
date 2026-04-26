import { useEffect, useState } from 'react';
import { COPY } from '../copy';

// First-run welcome — three editorial slides + a "Try a sample" loader on the
// final slide. Mounts only once per browser (gated by localStorage in App.jsx).
// Skippable on every slide.

// A 200×80 PNG with three text-like bars, hand-rolled so the welcome flow
// works fully offline / with no Gemini call. The "Try a sample" button decodes
// this base64 into a File and runs it through the same upload-confirm path as
// any drag-dropped image, so the user sees the real flow on their first try.
const SAMPLE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAMgAAABQCAYAAABcbTqwAAABQElEQVR4nO3ZQQrCUBAFQU8i3v+ILowXkAYlMEOsRW3nBUKv/u14PQ/gs9v0B8BmAoEgEAgCgSAQCAKBIBAIAoEgEAgCgSAQCAKBIBAIAoEgEAgCgSAQCKcFcr8/TuH+b/cRiPsCEYj7AtlEIBe5j0DcF4hA3BfIJgK5yH0E4r5ABOK+QDbxkg5BIBAEAkEgEAQCQSAQBAJBIBAEAmHdS/q3L8d2r707TSB2V+9OE4jd1bvTBGJ39e40gdhdvTtNIHZX704TiN3Vu9MEYnf17jSB2F29O81LOgSBQBAIBIFAEAgEgUAQCASBQBAIhDUv6f9wd/pn8z2BCIQgEIEQBCIQgkAEQhCIQAgCEQhBIAIhCEQgBC/pEAQCQSAQBAJBIBAEAkEgEAQCQSAQBAJBIBAEAkEgEAQCQSAQBAJBIBDeQPvmuRKupyMAAAAASUVORK5CYII=';

function base64ToFile(base64, filename, mime) {
  const bin = atob(base64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

function WelcomeModal({ onClose, onTrySample }) {
  const slides = COPY.welcome.slides;
  const [idx, setIdx] = useState(0);
  const isLast = idx === slides.length - 1;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setIdx(i => Math.min(slides.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setIdx(i => Math.max(0, i - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, slides.length]);

  const handleTrySample = () => {
    try {
      const f = base64ToFile(SAMPLE_PNG_BASE64, COPY.welcome.sampleFilename, 'image/png');
      onTrySample(f);
    } catch (err) {
      console.warn('Failed to build sample file', err);
    }
    onClose();
  };

  const slide = slides[idx];

  return (
    <div
      className="og-welcome-shroud"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="og-welcome-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="og-welcome-title"
      >
        <div className="og-welcome-head">
          <span className="og-welcome-brand">{COPY.welcome.title}</span>
          <button
            type="button"
            className="og-welcome-skip"
            onClick={onClose}
          >
            {COPY.welcome.skip}
          </button>
        </div>

        <div className="og-welcome-body">
          <div className="og-welcome-eyebrow">{slide.eyebrow}</div>
          <h2 id="og-welcome-title" className="og-welcome-title">{slide.title}</h2>
          <p className="og-welcome-text">{slide.body}</p>
        </div>

        <div className="og-welcome-dots" aria-hidden="true">
          {slides.map((_, i) => (
            <span
              key={i}
              className={'og-welcome-dot' + (i === idx ? ' is-active' : '')}
            />
          ))}
        </div>

        <div className="og-welcome-actions">
          <button
            type="button"
            className="og-welcome-btn og-welcome-btn-ghost"
            onClick={() => setIdx(i => Math.max(0, i - 1))}
            disabled={idx === 0}
          >
            {COPY.welcome.back}
          </button>
          {isLast ? (
            <>
              <button
                type="button"
                className="og-welcome-btn og-welcome-btn-ghost"
                onClick={handleTrySample}
              >
                {COPY.welcome.trySample}
              </button>
              <button
                type="button"
                className="og-welcome-btn og-welcome-btn-primary"
                onClick={onClose}
                autoFocus
              >
                {COPY.welcome.done}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="og-welcome-btn og-welcome-btn-primary"
              onClick={() => setIdx(i => Math.min(slides.length - 1, i + 1))}
              autoFocus
            >
              {COPY.welcome.next}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default WelcomeModal;
