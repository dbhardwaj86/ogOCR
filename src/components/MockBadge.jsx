import { useEffect, useState } from 'react';

// Surfaces which I/O subsystems are in mock mode so users don't mistake
// a successful "(Mock)" toast for a real send/save.
function MockBadge() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/_status')
      .then(r => r.ok ? r.json() : null)
      .then(s => { if (!cancelled) setStatus(s); })
      .catch(() => { /* status is best-effort */ });
    return () => { cancelled = true; };
  }, []);

  if (!status) return null;
  const mocks = ['email', 'drive', 'classroom', 'docx'].filter(k => status[k] === 'mock');
  if (mocks.length === 0) return null;

  return (
    <span
      className="og-mock-badge"
      title={`These integrations are in mock mode: ${mocks.join(', ')}. Toasts marked (Mock) do not perform a real action.`}
      aria-label={`Mock mode active for ${mocks.join(', ')}`}
    >
      MOCK · {mocks.join(',')}
    </span>
  );
}

export default MockBadge;
