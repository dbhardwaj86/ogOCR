import { useRef, useState } from 'react';
import CornerBracket from './CornerBracket';
import { showError } from '../errors/showError';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPE_RE = /^(image\/|application\/pdf$)/;

// Every drop / pick / camera-capture is routed through `onRequestPreview` so
// the user lands in the UploadConfirmModal "Use this file" confirmation step.
// The hidden long-press shortcut from earlier sprints is gone — confirmation
// is the default path. `onUpload` remains as a fallback if a parent doesn't
// wire the preview flow.
function UploadCard({ onUpload, onRequestPreview }) {
  const inputRef = useRef(null);
  const cameraRef = useRef(null);
  const [active, setActive] = useState(false);

  const handFile = (f) => {
    if (onRequestPreview) onRequestPreview(f);
    else onUpload(f);
  };

  const validate = (f) => {
    if (!f) {
      showError('CAP_NO_FILE');
      return false;
    }
    if (!ACCEPTED_TYPE_RE.test(f.type || '')) {
      showError('CAP_BAD_MIME');
      return false;
    }
    if (f.size > MAX_BYTES) {
      showError('CAP_FILE_TOO_LARGE');
      return false;
    }
    return true;
  };

  const handlePick = (e) => {
    const f = e.target.files?.[0];
    if (validate(f)) handFile(f);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setActive(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 1) {
      showError('CAP_MULTI_FILE');
      return;
    }
    const f = files[0];
    if (validate(f)) handFile(f);
  };

  const onCardClick = () => {
    inputRef.current?.click();
  };

  const onCardKeyDown = (e) => {
    // Buttons normally fire onClick on Enter/Space; we keep this explicit so
    // assistive tech sees the activation path clearly.
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onCardClick();
    }
  };

  const onCameraClick = (e) => {
    e.stopPropagation();
    cameraRef.current?.click();
  };

  return (
    <>
      <button
        type="button"
        className={'og-upload-card' + (active ? ' is-active' : '')}
        onClick={onCardClick}
        onKeyDown={onCardKeyDown}
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
        <div className="og-upload-title">Drop a file or click to browse</div>
        <div className="og-upload-sub">JPG · PNG · PDF · up to 10 MB</div>
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
        <span>Snap a photo</span>
      </button>
    </>
  );
}

export default UploadCard;
