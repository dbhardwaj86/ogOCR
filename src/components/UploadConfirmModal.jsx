import { useEffect, useMemo } from 'react';

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function UploadConfirmModal({ file, onConfirm, onCancel }) {
  const isImage = file?.type?.startsWith('image/');
  const isPdf = file?.type === 'application/pdf';

  const previewUrl = useMemo(() => {
    if (!isImage || !file) return null;
    return URL.createObjectURL(file);
  }, [file, isImage]);

  useEffect(() => {
    if (!previewUrl) return undefined;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

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
          {isPdf && (
            <div className="og-upload-confirm-pdf">
              <span className="og-upload-confirm-pdf-glyph">▤</span>
              <span className="og-upload-confirm-pdf-name">{file.name}</span>
              <span className="og-upload-confirm-pdf-note">
                PDF preview · rasterisation pending
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
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}

export default UploadConfirmModal;
