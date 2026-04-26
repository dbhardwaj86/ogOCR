import SourcePreview from './SourcePreview';
import MagicActions from './MagicActions';
import LanguagePill from './LanguagePill';
import { parseDetectedLang } from '../magicActions';

function SourceColumn({ session, file, processing, onRun }) {
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

  return (
    <section className="og-source">
      <div className="og-source-head">
        <div className="og-source-filemeta">
          <span className="og-source-num">{numLabel}</span>
          <span className="og-source-name">{nameLabel}</span>
        </div>
        <LanguagePill lang={detectedLang} />
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
    </section>
  );
}

export default SourceColumn;
