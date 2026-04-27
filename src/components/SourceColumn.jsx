import { useState } from 'react';
import SourcePreview from './SourcePreview';
import MagicActions from './MagicActions';
import LanguagePill from './LanguagePill';
import SignatureModal from './SignatureModal';
import { showInfo } from '../errors/showError';
import { parseDetectedLang } from '../magicActions';

function SourceColumn({ session, file, processing, onRun, onUpdateSession, onLanguageOverride }) {
  const [signOpen, setSignOpen] = useState(false);

  if (!session && !file) {
    return (
      <section className="og-source">
        <div className="og-source-empty">Upload a document to begin.</div>
      </section>
    );
  }

  const numLabel = session ? 'SRC.' + session.id.slice(-3).toUpperCase() : 'SRC.NEW';
  const nameLabel = file?.name || session?.filename || '—';
  // Sprint 2.8b — extract path appends `__detected_lang: <code>` as the last
  // line. We surface the code here as a small chip; null hides the chip.
  const detectedLang = session?.text ? parseDetectedLang(session.text) : null;

  // Append the signature SVG to the active session's text. Now that
  // SourceColumn has the canonical onUpdateSession callback (Track N's
  // workaround in ExportBar is no longer needed), the insert path is a
  // single state update — no localStorage round-trip and no override map.
  const handleSignatureInsert = (svgString) => {
    if (!session || !onUpdateSession) return;
    const trimmed = (svgString || '').trim();
    if (!trimmed) return;
    const baseText = session.text || '';
    const sep = baseText.length > 0 ? '\n\n' : '';
    const appended = baseText + sep + trimmed + '\n';
    onUpdateSession({ text: appended });
    showInfo('Signature inserted.');
  };

  return (
    <section className="og-source">
      <div className="og-source-head">
        <div className="og-source-filemeta">
          <span className="og-source-num">{numLabel}</span>
          <span className="og-source-name">{nameLabel}</span>
        </div>
        <div className="og-source-head-actions">
          <LanguagePill
            lang={detectedLang}
            overrideLang={session?.languageOverride}
            sessionId={session?.id}
            onOverride={onLanguageOverride}
          />
          <button
            type="button"
            className="og-pill og-pill-secondary og-source-sign-btn"
            onClick={() => setSignOpen(true)}
            disabled={!session}
            title="Add a signature to this document"
          >
            <span aria-hidden="true">✎</span>
            <span>Sign</span>
          </button>
        </div>
      </div>

      <div className="og-source-stage">
        <SourcePreview
          session={session}
          file={file}
          processing={processing}
        />
      </div>

      <div className="og-action-surface">
        <MagicActions file={file} processing={processing} onRun={onRun} />
      </div>

      <SignatureModal
        open={signOpen}
        onClose={() => setSignOpen(false)}
        onInsert={handleSignatureInsert}
      />
    </section>
  );
}

export default SourceColumn;
