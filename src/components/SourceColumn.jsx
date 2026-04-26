import { useState } from 'react';
import SourcePreview from './SourcePreview';
import SourceTablets from './SourceTablets';
import MagicActions from './MagicActions';

function SourceColumn({ session, file, processing, onRun, showTablets }) {
  const [imageDims, setImageDims] = useState(null);

  if (!session && !file) {
    return (
      <section className="og-source">
        <div className="og-source-empty">Upload a document to begin.</div>
      </section>
    );
  }

  const numLabel = session ? 'SRC.' + session.id.slice(-3).toUpperCase() : 'SRC.NEW';
  const nameLabel = file?.name || session?.filename || '—';

  return (
    <section className="og-source">
      <div className="og-source-head">
        <div className="og-source-filemeta">
          <span className="og-source-num">{numLabel}</span>
          <span className="og-source-name">{nameLabel}</span>
        </div>
        {showTablets && <SourceTablets session={session} imageDims={imageDims} />}
      </div>

      <div className="og-source-stage">
        <SourcePreview
          session={session}
          file={file}
          processing={processing}
          onImageDims={setImageDims}
        />
      </div>

      <div className="og-action-surface">
        <MagicActions file={file} processing={processing} onRun={onRun} />
      </div>
    </section>
  );
}

export default SourceColumn;
