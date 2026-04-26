import UploadCard from './UploadCard';
import SessionList from './SessionList';

function LibraryRail({ sessions, activeSessionId, setActiveSessionId, deleteSession, onUpload, onRequestPreview, onUploadError }) {
  return (
    <aside className="og-rail">
      <div className="og-rail-section">
        <div className="og-section-title">
          <span className="og-section-num">01</span>
          <span>Source</span>
        </div>
        <UploadCard onUpload={onUpload} onRequestPreview={onRequestPreview} onError={onUploadError} />
      </div>

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
