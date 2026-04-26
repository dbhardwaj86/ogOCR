import { useCallback, useEffect, useRef, useState } from 'react';
import { showError, showInfo } from '../errors/showError';
import {
  SIGNATURES_KEY,
  SIGNATURES_MAX,
  CANVAS_W,
  CANVAS_H,
  STROKE_WIDTH,
  STROKE_COLOR,
  readSignatures,
  strokesToSvg,
  paintSvgOnCanvas,
} from '../signatureLib';

// Track N — Signature capture (S3.5).
//
// Full-screen modal with an HTML5 canvas draw surface using Pointer Events
// (works for mouse, finger, and Apple Pencil — `pointerType === 'pen'` is
// detected so future stylus-only flourishes can hook in).
//
// Three actions:
//   - Clear              — wipes the canvas (ctx.clearRect)
//   - Save signature     — snapshots the current strokes as inline SVG and
//                          persists to localStorage.ogOCR_signatures (cap 5)
//   - Insert into doc    — calls onInsert(svgString) and closes
//
// A library row shows up to 5 stored signatures as small thumbnails.
// Clicking a thumbnail loads it back into the canvas (so the user can re-use
// or tweak it before inserting). This keeps the destructive insert action
// behind one explicit click rather than firing on every thumbnail tap.

// Small thumbnail rendered as its own canvas. Memoization is implicit — React
// re-runs the effect when the svg prop changes.
function SignatureThumb({ entry, onSelect, onDelete }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    paintSvgOnCanvas(entry.svg, ctx, canvas.width, canvas.height);
  }, [entry.svg]);

  return (
    <div className="og-signature-thumb-wrap">
      <button
        type="button"
        className="og-signature-thumb"
        title="Load this signature into the canvas"
        onClick={() => onSelect(entry)}
      >
        <canvas
          ref={ref}
          width={160}
          height={48}
          aria-label="Stored signature"
        />
      </button>
      <button
        type="button"
        className="og-signature-thumb-del"
        aria-label="Delete signature"
        title="Delete signature"
        onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
      >×</button>
    </div>
  );
}

function SignatureModal({ open, onClose, onInsert }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  // Strokes: array of arrays of {x,y}. The current stroke (in-progress) lives
  // at the end of the array while drawing.
  const [strokes, setStrokes] = useState([]);
  const isDrawingRef = useRef(false);
  const [library, setLibrary] = useState(() => (typeof window !== 'undefined' ? readSignatures() : []));
  // pointerType is exposed read-only so a future build can vary stroke style
  // per pen/finger/mouse. Kept in state so the test harness can assert it.
  const [pointerType, setPointerType] = useState(null);

  // Cache the 2D context once the canvas mounts. Fall back gracefully if the
  // browser reports no context (jsdom in tests sometimes does — guarded).
  // The library state is hydrated lazily by the useState initializer above
  // so we don't need a setState-in-effect here. Cross-tab sync (a save in a
  // sibling tab landing in this tab's library) is out of scope for the MVP.
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctxRef.current = ctx;
    // Paint the white background.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = STROKE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [open]);

  // Escape closes. Mirrors the WelcomeModal pattern so keyboard discoverability
  // is consistent across modals.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Translate a pointer event to canvas-local coordinates. The bounding rect
  // includes any CSS scaling so the math here works whether the canvas is
  // rendered 1:1 or letterboxed by a smaller container.
  const eventToPoint = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / (rect.width || 1);
    const sy = canvas.height / (rect.height || 1);
    return {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top) * sy,
    };
  }, []);

  const handlePointerDown = (e) => {
    if (!ctxRef.current) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setPointerType(e.pointerType || null);
    const p = eventToPoint(e);
    isDrawingRef.current = true;
    setStrokes(prev => [...prev, [p]]);
    const ctx = ctxRef.current;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const handlePointerMove = (e) => {
    if (!isDrawingRef.current || !ctxRef.current) return;
    const p = eventToPoint(e);
    const ctx = ctxRef.current;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    // Append to the current (last) stroke.
    setStrokes(prev => {
      if (prev.length === 0) return [[p]];
      const next = prev.slice(0, -1);
      next.push([...prev[prev.length - 1], p]);
      return next;
    });
  };

  const handlePointerUp = (e) => {
    if (!isDrawingRef.current) return;
    e.currentTarget?.releasePointerCapture?.(e.pointerId);
    isDrawingRef.current = false;
    if (ctxRef.current) ctxRef.current.beginPath();
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setStrokes([]);
  };

  // If a "loaded" signature is the only thing on the canvas, prefer its
  // original SVG over re-serializing the loaded points (which we don't have).
  const effectiveSvg = () => {
    if (strokes.length === 1
      && strokes[0].length === 1
      && strokes[0][0]?.__svg) {
      return strokes[0][0].__svg;
    }
    return strokesToSvg(strokes, CANVAS_W, CANVAS_H);
  };

  const isEmpty = strokes.length === 0;

  const handleSave = () => {
    if (isEmpty) return;
    const existing = readSignatures();
    if (existing.length >= SIGNATURES_MAX) {
      // Cap reached — surface the dedicated registry code, abort the save.
      showError('SIG_LIBRARY_FULL');
      return;
    }
    const entry = {
      id: 'sig_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
      svg: effectiveSvg(),
      createdAt: Date.now(),
    };
    const next = [entry, ...existing].slice(0, SIGNATURES_MAX);
    try {
      localStorage.setItem(SIGNATURES_KEY, JSON.stringify(next));
      setLibrary(next);
      showInfo('Signature saved.');
    } catch (e) {
      // QuotaExceededError or any other write failure → surface the storage
      // code. We keep the catch broad because Safari's quota error has a
      // different name in some versions.
      if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
        showError('SIG_QUOTA');
      } else {
        showError('SIG_QUOTA');
      }
    }
  };

  const handleInsert = () => {
    if (isEmpty) return;
    const svg = effectiveSvg();
    onInsert(svg);
    onClose();
  };

  // Library thumbnail click → load that signature back onto the canvas. We
  // synthesize a single "stroke" that is actually the cached SVG (carried
  // via a __svg sentinel point) so a subsequent Save / Insert round-trips
  // the original markup losslessly.
  const handleSelectFromLibrary = (entry) => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    paintSvgOnCanvas(entry.svg, ctx, canvas.width, canvas.height);
    setStrokes([[{ __svg: entry.svg }]]);
  };

  const handleDeleteFromLibrary = (id) => {
    const next = readSignatures().filter(s => s.id !== id);
    try {
      localStorage.setItem(SIGNATURES_KEY, JSON.stringify(next));
    } catch {
      /* ignore — best-effort delete */
    }
    setLibrary(next);
  };

  if (!open) return null;

  return (
    <div
      className="og-signature-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Signature capture"
      onClick={onClose}
    >
      <div className="og-signature-card" onClick={(e) => e.stopPropagation()}>
        <div className="og-signature-head">
          <div className="og-signature-title">Sign and save</div>
          <button
            type="button"
            className="og-signature-close"
            aria-label="Close signature modal"
            onClick={onClose}
          >×</button>
        </div>

        <div className="og-signature-body">
          <div className="og-signature-canvas-wrap">
            <canvas
              ref={canvasRef}
              className="og-signature-canvas"
              width={CANVAS_W}
              height={CANVAS_H}
              data-pointer-type={pointerType || ''}
              data-testid="og-signature-canvas"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onPointerLeave={handlePointerUp}
            />
            <div className="og-signature-hint">
              Sign with your mouse, finger, or Apple Pencil. Strokes are saved as inline SVG.
            </div>
          </div>

          <div className="og-signature-actions">
            <button
              type="button"
              className="og-signature-btn og-signature-btn-ghost"
              onClick={handleClear}
              data-testid="og-signature-clear"
            >Clear</button>
            <button
              type="button"
              className="og-signature-btn og-signature-btn-ghost"
              onClick={handleSave}
              disabled={isEmpty}
              data-testid="og-signature-save"
            >Save signature</button>
            <button
              type="button"
              className="og-signature-btn og-signature-btn-primary"
              onClick={handleInsert}
              disabled={isEmpty}
              data-testid="og-signature-insert"
            >Insert into document</button>
          </div>

          <div className="og-signature-library" data-testid="og-signature-library">
            <div className="og-signature-library-label">
              {library.length === 0
                ? 'No saved signatures yet.'
                : `Saved (${library.length}/${SIGNATURES_MAX})`}
            </div>
            <div className="og-signature-library-row">
              {library.map(entry => (
                <SignatureThumb
                  key={entry.id}
                  entry={entry}
                  onSelect={handleSelectFromLibrary}
                  onDelete={handleDeleteFromLibrary}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SignatureModal;
