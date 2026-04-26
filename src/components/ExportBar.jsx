import { useEffect, useRef, useState } from 'react';
import { showError, showInfo } from '../errors/showError';
import { errFromResponse, errFromException } from '../errors/errFromResponse';

const DRIVE_RECENT_KEY = 'ogOCR_drive_recent';
const DRIVE_RECENT_MAX = 5;

function readRecentFolders() {
  try {
    const raw = localStorage.getItem(DRIVE_RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(p => typeof p === 'string' && p.trim()).slice(0, DRIVE_RECENT_MAX);
  } catch {
    return [];
  }
}

function rememberRecentFolder(path) {
  if (!path || !path.trim()) return;
  try {
    const next = [path, ...readRecentFolders().filter(p => p !== path)].slice(0, DRIVE_RECENT_MAX);
    localStorage.setItem(DRIVE_RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore — best-effort persistence */
  }
}

function exportPNG(svgString, filename = 'ogOCR_Export.png', onError) {
  const div = document.createElement('div');
  div.innerHTML = svgString;
  const svgEl = div.querySelector('svg');
  if (!svgEl) {
    onError && onError('EXP_SVG_BROWSER_LIMIT', 'No <svg> root found in this content.');
    return false;
  }

  const vb = svgEl.viewBox?.baseVal;
  const w = parseFloat(svgEl.getAttribute('width')) || (vb?.width) || 800;
  const h = parseFloat(svgEl.getAttribute('height')) || (vb?.height) || 600;
  if (!svgEl.getAttribute('width')) svgEl.setAttribute('width', w);
  if (!svgEl.getAttribute('height')) svgEl.setAttribute('height', h);

  const svgData = new XMLSerializer().serializeToString(svgEl);
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.width || w;
      canvas.height = img.height || h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = filename;
      a.click();
    } catch (err) {
      // Tainted canvas, OOM, or any rasterization failure surfaces here.
      onError && onError('EXP_SVG_BROWSER_LIMIT', err?.message);
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    onError && onError('EXP_SVG_BROWSER_LIMIT', 'Image failed to load before rasterization.');
  };
  img.src = url;
  return true;
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function EmailDialog({ open, onClose, onSubmit, busy }) {
  const [email, setEmail] = useState('');
  if (!open) return null;
  return (
    <div className="og-palette-shroud" onClick={onClose}>
      <div className="og-palette" onClick={(e) => e.stopPropagation()} style={{ padding: 18 }}>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 20, fontStyle: 'italic', marginBottom: 12 }}>
          Email this document
        </div>
        <input
          className="og-prompt-input"
          type="email"
          placeholder="recipient@example.com"
          value={email}
          autoFocus
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(email); if (e.key === 'Escape') onClose(); }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button className="og-export-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="og-prompt-run" onClick={() => onSubmit(email)} disabled={busy || !email}>
            {busy ? 'Working…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

// onShowToast was the legacy plain-string callback — kept on the prop list so
// older callers don't need to update, but ignored: every surface here now
// goes through the central error registry.
// eslint-disable-next-line no-unused-vars
function ExportBar({ session, onShowToast, processing }) {
  const [copied, setCopied] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [driveBusy, setDriveBusy] = useState(false);
  const [classroomBusy, setClassroomBusy] = useState(false);
  const [folderPath, setFolderPath] = useState('');
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const [recentFolders, setRecentFolders] = useState(() => readRecentFolders());
  const folderMenuRef = useRef(null);

  const noContent = !session || (!session.text && !session.svg);
  const noSvg = !session?.svg;
  const content = session?.svg || session?.text || '';
  // exportName overrides filename for outbound exports; falls back to filename.
  const rawBase = (session?.exportName?.trim() || session?.filename || 'ogOCR_Document');
  const baseName = rawBase.replace(/\.[^.]+$/, '');

  // Close the recent-folders dropdown on outside click.
  useEffect(() => {
    if (!folderMenuOpen) return undefined;
    const onDoc = (e) => {
      if (folderMenuRef.current && !folderMenuRef.current.contains(e.target)) {
        setFolderMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [folderMenuOpen]);

  const handleCopy = async () => {
    if (noContent) {
      showError('EXP_EMAIL_NO_CONTENT');
      return;
    }
    if (!navigator.clipboard) {
      showError('EXP_CLIPBOARD_NO_API');
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      showError('EXP_CLIPBOARD_DENIED');
    }
  };

  const handleDrive = async () => {
    if (noContent) {
      showError('EXP_EMAIL_NO_CONTENT');
      return;
    }
    setDriveBusy(true);
    try {
      const ext = session.svg ? '.svg' : '.txt';
      const trimmedPath = folderPath.trim();
      const body = { text: content, filename: baseName + ext };
      if (trimmedPath) body.folderPath = trimmedPath;
      const r = await fetch('/api/save-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const entry = await errFromResponse(r, 'EXP_DRIVE_GENERIC');
        showError(entry.code, { message: entry.message, hint: entry.hint });
        return;
      }
      const data = await r.json();
      if (data.mock) {
        showError('EXP_DRIVE_MOCK');
      } else {
        if (trimmedPath) {
          rememberRecentFolder(trimmedPath);
          setRecentFolders(readRecentFolders());
        }
        showInfo(data.message || `Saved ${baseName + ext} to Drive.`,
          data.webViewLink ? 'Open in Drive: ' + data.webViewLink : null);
      }
    } catch (err) {
      const entry = errFromException(err, 'EXP_DRIVE_GENERIC');
      showError(entry.code, { message: entry.message, hint: entry.hint });
    } finally {
      setDriveBusy(false);
    }
  };

  const handleClassroom = async () => {
    if (noContent) {
      showError('EXP_EMAIL_NO_CONTENT');
      return;
    }
    setClassroomBusy(true);
    try {
      const r = await fetch('/api/classroom/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content, filename: baseName }),
      });
      if (!r.ok) {
        const entry = await errFromResponse(r, 'OCR_INTERNAL');
        showError(entry.code, { message: entry.message, hint: entry.hint });
        return;
      }
      const data = await r.json();
      // Mock disclosure: server emits `info` envelope with EXP_CLASSROOM_MOCK
      // alongside `success: true` so the UI still proceeds — but routes through
      // the registry so the toast picks up the info-severity styling.
      if (data.info && typeof data.info.code === 'string') {
        showError(data.info.code, {
          message: data.info.message,
          hint: data.info.hint,
        });
      } else if (data.mock) {
        showError('EXP_CLASSROOM_MOCK');
      } else {
        showInfo(data.message || 'Drafted to Classroom.');
      }
    } catch (err) {
      const entry = errFromException(err);
      showError(entry.code, { message: entry.message, hint: entry.hint });
    } finally {
      setClassroomBusy(false);
    }
  };

  const submitEmail = async (to) => {
    if (!to) return;
    setEmailBusy(true);
    try {
      const r = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: to, text: content, subject: `ogOCR — ${session.filename}` }),
      });
      if (!r.ok) {
        const entry = await errFromResponse(r, 'EXP_EMAIL_NETWORK');
        showError(entry.code, { message: entry.message, hint: entry.hint });
        return;
      }
      const data = await r.json();
      if (data.mock) showError('EXP_EMAIL_MOCK');
      else showInfo(data.message || 'Email sent.');
      setEmailOpen(false);
    } catch (err) {
      const entry = errFromException(err, 'EXP_EMAIL_NETWORK');
      showError(entry.code, { message: entry.message, hint: entry.hint });
    } finally {
      setEmailBusy(false);
    }
  };

  const handleLink = async () => {
    if (!navigator.clipboard) {
      showError('EXP_CLIPBOARD_NO_API');
      return;
    }
    if (!session?.id) {
      // No session yet — fall back to the legacy "this URL only" path.
      try {
        await navigator.clipboard.writeText(window.location.href);
        showError('EXP_LINK_SELF_ONLY');
      } catch {
        showError('EXP_CLIPBOARD_DENIED');
      }
      return;
    }
    try {
      const url = `${window.location.origin}${window.location.pathname}?session=${session.id}`;
      await navigator.clipboard.writeText(url);
      showError('EXP_LINK_DEEP_LINK');
    } catch {
      showError('EXP_CLIPBOARD_DENIED');
    }
  };

  const handleMD = () => {
    if (noContent) return;
    if (session.svg) {
      downloadBlob(session.svg, baseName + '.svg', 'image/svg+xml');
    } else {
      downloadBlob(session.text, baseName + '.md', 'text/markdown');
    }
  };

  const handlePDF = () => {
    if (noContent) return;
    window.print();
  };

  const handlePNG = () => {
    if (!session?.svg) return;
    exportPNG(session.svg, baseName + '.png', (code, message) => {
      showError(code, message ? { hint: message } : {});
    });
  };

  const handleJSON = () => {
    if (!session) return;
    downloadBlob(JSON.stringify(session, null, 2), baseName + '.json', 'application/json');
  };

  const driveLabel = driveBusy ? 'Working…' : 'Drive';
  const driveGlyph = driveBusy ? <span className="og-proc-spin">◐</span> : '△';
  const emailLabel = emailBusy ? 'Working…' : 'Email';
  const emailGlyph = emailBusy ? <span className="og-proc-spin">◐</span> : '✉';
  const classroomLabel = classroomBusy ? 'Working…' : 'Classroom';
  const classroomGlyph = classroomBusy ? <span className="og-proc-spin">◐</span> : '◯';

  const groups = [
    {
      label: 'Save',
      items: [
        {
          id: 'drive',
          glyph: driveGlyph,
          label: driveLabel,
          onClick: handleDrive,
          disabled: noContent || processing || driveBusy,
        },
        { id: 'md',    glyph: '▤', label: session?.svg ? 'SVG' : 'MD', onClick: handleMD, disabled: noContent },
        { id: 'pdf',   glyph: '▢', label: 'Print → PDF', onClick: handlePDF, disabled: noContent },
      ],
    },
    {
      label: 'Share',
      items: [
        {
          id: 'email',
          glyph: emailGlyph,
          label: emailLabel,
          onClick: () => setEmailOpen(true),
          disabled: noContent || processing || emailBusy,
        },
        {
          id: 'classroom',
          glyph: classroomGlyph,
          label: classroomLabel,
          onClick: handleClassroom,
          disabled: noContent || processing || classroomBusy,
        },
        { id: 'link',      glyph: '∞', label: 'Link',      onClick: handleLink,               disabled: false },
      ],
    },
    {
      label: 'Export',
      items: [
        { id: 'copy', glyph: copied ? '✓' : '❐', label: copied ? 'Copied' : 'Copy', onClick: handleCopy, disabled: noContent },
        { id: 'png',  glyph: '▦', label: 'PNG',  onClick: handlePNG, disabled: noSvg },
        { id: 'json', glyph: '{}',label: 'JSON', onClick: handleJSON, disabled: !session },
      ],
    },
  ];

  return (
    <>
      <div className="og-exports">
        {groups.map(g => (
          <div className="og-export-group" key={g.label}>
            <div className="og-export-label">{g.label}</div>
            <div className="og-export-items">
              {g.items.map(it => (
                <button
                  key={it.id}
                  className="og-export-btn"
                  disabled={it.disabled}
                  onClick={it.onClick}
                  title={it.label}
                >
                  <span className="og-export-glyph">{it.glyph}</span>
                  <span>{it.label}</span>
                </button>
              ))}
              {g.label === 'Save' && (
                <div className="og-drive-folder" ref={folderMenuRef}>
                  <input
                    className="og-drive-folder-input"
                    type="text"
                    placeholder="Drive folder (optional)"
                    aria-label="Drive folder path (optional)"
                    value={folderPath}
                    onChange={(e) => setFolderPath(e.target.value)}
                    onFocus={() => setFolderMenuOpen(recentFolders.length > 0)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); setFolderMenuOpen(false); handleDrive(); }
                      if (e.key === 'Escape') setFolderMenuOpen(false);
                    }}
                    disabled={driveBusy}
                  />
                  {folderMenuOpen && recentFolders.length > 0 && (
                    <ul className="og-drive-folder-menu" role="listbox">
                      {recentFolders.map(p => (
                        <li key={p}>
                          <button
                            type="button"
                            className="og-drive-folder-item"
                            onClick={() => { setFolderPath(p); setFolderMenuOpen(false); }}
                          >{p}</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <EmailDialog
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        onSubmit={submitEmail}
        busy={emailBusy}
      />
    </>
  );
}

export default ExportBar;
