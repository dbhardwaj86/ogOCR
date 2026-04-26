import UploadCard from './UploadCard';
import SessionList from './SessionList';
import QueueRail from './QueueRail';

function LibraryRail({ sessions, activeSessionId, setActiveSessionId, deleteSession, onUpload, onRequestPreview, onRequestBatchAction }) {
  return (
    <aside className="og-rail">
      <div className="og-rail-section">
        <div className="og-section-title">
          <span className="og-section-num">01</span>
          <span>Source</span>
        </div>
        <UploadCard
          onUpload={onUpload}
          onRequestPreview={onRequestPreview}
          onRequestBatchAction={onRequestBatchAction}
        />
      </div>

      <QueueRail />

      <div className="og-rail-section og-rail-grow">
        <div className="og-section-title">
          <span className="og-section-num">02</span>
          <span>Library</span>
          <span className="og-section-count">{sessions.length}</span>
        </div>
        <SessionList
          sessions={sessions}
          activeSessionId={activeSessionId}
          setActiveSessionId={setActiveSessionId}
          deleteSession={deleteSession}
        />
      </div>
    </aside>
  );
}

export default LibraryRail;
