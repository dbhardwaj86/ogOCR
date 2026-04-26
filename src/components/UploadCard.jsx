import { useRef, useState, useEffect } from 'react';
import CornerBracket from './CornerBracket';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPE_RE = /^(image\/|application\/pdf$)/;
const LONG_PRESS_MS = 500;
const MOVE_CANCEL_PX = 12;

function UploadCard({ onUpload, onRequestPreview, onError }) {
  const inputRef = useRef(null);
  const cameraRef = useRef(null);
  const pressTimerRef = useRef(null);
  const isLongPressRef = useRef(false);
  const pickModeRef = useRef('auto'); // 'auto' | 'preview'
  const startPosRef = useRef({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const [longPressVisible, setLongPressVisible] = useState(false);

  useEffect(() => () => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
  }, []);

  const validate = (f) => {
    if (!f) return false;
    if (!ACCEPTED_TYPE_RE.test(f.type)) {
      onError?.('Only images and PDFs are supported.');
      return false;
    }
    if (f.size > MAX_BYTES) {
      onError?.('File is too large (max 10 MiB).');
      return false;
    }
    return true;
  };

  const handlePick = (e) => {
    const f = e.target.files?.[0];
    if (validate(f)) {
      if (pickModeRef.current === 'preview' && onRequestPreview) {
        onRequestPreview(f);
      } else {
        onUpload(f);
      }
    }
    pickModeRef.current = 'auto';
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setActive(false);
    const f = e.dataTransfer.files?.[0];
    if (validate(f)) onUpload(f);
  };

  const clearPressTimer = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const onPointerDown = (e) => {
    isLongPressRef.current = false;
    setLongPressVisible(false);
    startPosRef.current = { x: e.clientX, y: e.clientY };
    clearPressTimer();
    pressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      setLongPressVisible(true);
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (e) => {
    if (!pressTimerRef.current) return;
    const dx = Math.abs(e.clientX - startPosRef.current.x);
    const dy = Math.abs(e.clientY - startPosRef.current.y);
    if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) clearPressTimer();
  };

  const onPointerUp = () => {
    clearPressTimer();
    setLongPressVisible(false);
  };

  const onPointerCancel = () => {
    clearPressTimer();
    setLongPressVisible(false);
    isLongPressRef.current = false;
  };

  const onCardClick = () => {
    pickModeRef.current = isLongPressRef.current && onRequestPreview ? 'preview' : 'auto';
    isLongPressRef.current = false;
    inputRef.current?.click();
  };

  const onCameraClick = (e) => {
    e.stopPropagation();
    pickModeRef.current = 'auto';
    cameraRef.current?.click();
  };

  return (
    <>
      <button
        type="button"
        className={
          'og-upload-card' +
          (active ? ' is-active' : '') +
          (longPressVisible ? ' is-long-pressing' : '')
        }
        onClick={onCardClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
        onDragEnter={(e) => { e.preventDefault(); setActive(true); }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setActive(false)}
        onDrop={handleDrop}
      >
        <div className="og-upload-corners">
          <CornerBracket />
          <CornerBracket flip="x" />
          <CornerBracket flip="y" />
          <CornerBracket flip="xy" />
        </div>
        <div className="og-upload-glyph">＋</div>
        <div className="og-upload-title">Drop a document</div>
        <div className="og-upload-sub">image · pdf · screenshot</div>
        <div className="og-upload-ticks">
          {Array.from({ length: 14 }).map((_, i) => <span key={i} className="og-tick" />)}
        </div>
      </button>
      {/*
        File inputs MUST be siblings of the upload-card button, not children.
        Their programmatic .click() dispatches a native click event that bubbles;
        if they're nested inside the button, that bubble re-triggers onCardClick
        and (for the camera path) opens the regular picker on top of the camera
        intent — on mobile this swallows the photo result and the app appears to
        hang. Sibling placement keeps the bubble out of the button entirely.
      */}
      <input
        ref={inputRef}
        type="file"
        hidden
        accept="image/*,application/pdf"
        onChange={handlePick}
      />
      <input
        ref={cameraRef}
        type="file"
        hidden
        accept="image/*"
        capture="environment"
        onChange={handlePick}
      />
      <button
        type="button"
        className="og-upload-camera"
        onClick={onCameraClick}
        aria-label="Take photo with camera"
      >
        <span className="og-upload-camera-glyph">◉</span>
        <span>Take photo</span>
      </button>
    </>
  );
}

export default UploadCard;
