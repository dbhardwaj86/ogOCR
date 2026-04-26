import { useCallback, useEffect, useRef, useState } from 'react';
import { showError, showInfo } from '../errors/showError';
import { errFromResponse, errFromException } from '../errors/errFromResponse';
import { exportDocx } from '../exportDocx';

const DRIVE_RECENT_KEY = 'ogOCR_drive_recent';
const DRIVE_RECENT_MAX = 5;
const DRIVE_RECENT_PERSIST = 10;

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
    const existing = (() => {
      try {
        const raw = localStorage.getItem(DRIVE_RECENT_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(p => typeof p === 'string' && p.trim()) : [];
      } catch {
        return [];
      }
    })();
    const next = [path, ...existing.filter(p => p !== path)].slice(0, DRIVE_RECENT_PERSIST);
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

// Generic dropdown menu used by the three Save/Share/Export groups.
// Renders a button + popover list. Keyboard-nav: Enter/Space opens, ↓/↑
// move between items, Enter activates, Escape closes. Outside-click closes.
// Inner list — lives only while the menu is open. Mounting fresh resets
// activeIdx to 0 implicitly, so we never call setState from an effect.
function MenuList({ items, label, idPrefix, onClose, returnFocusTo }) {
  const [activeIdx, setActiveIdx] = useState(0);

  const handleItemKey = (e, idx, item) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((idx + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((idx - 1 + items.length) % items.length);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      returnFocusTo?.current?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!item.disabled) {
        item.onClick();
        onClose();
      }
    } else if (e.key === 'Tab') {
      onClose();
    }
  };

  return (
    <ul className="og-export-menu-list" role="menu" aria-label={label + ' menu'}>
      {items.map((it, idx) => (
        <li key={it.id} role="none">
          <button
            type="button"
            role="menuitem"
            id={`${idPrefix}-${it.id}`}
            className="og-export-menu-item"
            disabled={it.disabled}
            tabIndex={idx === activeIdx ? 0 : -1}
            ref={el => { if (el && idx === activeIdx) el.focus(); }}
            onClick={() => { if (!it.disabled) { it.onClick(); onClose(); } }}
            onKeyDown={(e) => handleItemKey(e, idx, it)}
          >
            <span className="og-export-glyph">{it.glyph}</span>
            <span>{it.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function MenuDropdown({ label, items, openMenu, onOpen, onClose, idPrefix }) {
  const isOpen = openMenu === label;
  const containerRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onDoc = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [isOpen, onClose]);

  const handleButtonKey = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(label);
    }
  };

  return (
    <div className="og-export-menu" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        className="og-export-menu-btn"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? onClose() : onOpen(label))}
        onKeyDown={handleButtonKey}
      >
        <span>{label}</span>
        <span className="og-export-menu-caret" aria-hidden="true">▾</span>
      </button>
      {isOpen && (
        <MenuList
          items={items}
          label={label}
          idPrefix={idPrefix}
          onClose={onClose}
          returnFocusTo={buttonRef}
        />
      )}
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
  const [folderActiveIdx, setFolderActiveIdx] = useState(-1);
  const [recentFolders, setRecentFolders] = useState(() => readRecentFolders());
  const [openMenu, setOpenMenu] = useState(null);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const folderMenuRef = useRef(null);
  const folderInputRef = useRef(null);

  const noContent = !session || (!session.text && !session.svg);
  const noSvg = !session?.svg;
  const content = session?.svg || session?.text || '';
  const rawBase = (session?.exportName?.trim() || session?.filename || 'ogOCR_Document');
  const baseName = rawBase.replace(/\.[^.]+$/, '');

  // Close the recent-folders dropdown on outside click.
  useEffect(() => {
    if (!folderMenuOpen) return undefined;
    const onDoc = (e) => {
      if (folderMenuRef.current && !folderMenuRef.current.contains(e.target)) {
        setFolderMenuOpen(false);
        setFolderActiveIdx(-1);
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

  const handleDrive = useCallback(async () => {
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
  }, [noContent, session, folderPath, content, baseName]);

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

  const handleDocx = async () => {
    if (noContent) {
      showError('EXP_EMAIL_NO_CONTENT');
      return;
    }
    // Per-session export: the session's text field is the markdown source.
    // SVG-only sessions have nothing meaningful to convert to .docx, so fall
    // through to text and let pandoc handle whatever it gets.
    const md = session?.text || '';
    if (!md.trim()) {
      showError('EXP_EMAIL_NO_CONTENT');
      return;
    }
    await exportDocx({ markdown: md, filename: baseName + '.docx' });
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

  // navigator.share fallback. Tries native share, falls back to opening the
  // 3-menu sheet. AbortError is silent (user cancelled the share dialog).
  const handleNativeShare = async () => {
    if (!navigator.share) {
      setMobileSheetOpen(true);
      return;
    }
    try {
      await navigator.share({
        title: session?.filename || 'ogOCR document',
        text: content || '',
      });
    } catch (err) {
      if (err && err.name !== 'AbortError') {
        showError('EXP_SHARE_API_UNAVAILABLE');
        setMobileSheetOpen(true);
      }
    }
  };

  const handleFolderKey = (e) => {
    if (!folderMenuOpen || recentFolders.length === 0) {
      if (e.key === 'ArrowDown' && recentFolders.length > 0) {
        e.preventDefault();
        setFolderMenuOpen(true);
        setFolderActiveIdx(0);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        setFolderMenuOpen(false);
        handleDrive();
      } else if (e.key === 'Escape') {
        setFolderMenuOpen(false);
        setFolderActiveIdx(-1);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFolderActiveIdx(idx => (idx + 1) % recentFolders.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFolderActiveIdx(idx => (idx - 1 + recentFolders.length) % recentFolders.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (folderActiveIdx >= 0 && folderActiveIdx < recentFolders.length) {
        setFolderPath(recentFolders[folderActiveIdx]);
        setFolderMenuOpen(false);
        setFolderActiveIdx(-1);
      } else {
        setFolderMenuOpen(false);
        handleDrive();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setFolderMenuOpen(false);
      setFolderActiveIdx(-1);
    }
  };

  const driveLabel = driveBusy ? 'Working…' : 'Drive';
  const driveGlyph = driveBusy ? <span className="og-proc-spin">◐</span> : '△';
  const emailLabel = emailBusy ? 'Working…' : 'Email';
  const emailGlyph = emailBusy ? <span className="og-proc-spin">◐</span> : '✉';
  const classroomLabel = classroomBusy ? 'Working…' : 'Classroom';
  const classroomGlyph = classroomBusy ? <span className="og-proc-spin">◐</span> : '◯';

  const saveItems = [
    { id: 'drive', glyph: driveGlyph, label: driveLabel, onClick: handleDrive,
      disabled: noContent || processing || driveBusy },
    { id: 'md',    glyph: '▤', label: session?.svg ? 'SVG' : 'MD', onClick: handleMD, disabled: noContent },
    { id: 'docx',  glyph: '⌘', label: 'DOCX', onClick: handleDocx, disabled: noContent || !session?.text },
    { id: 'pdf',   glyph: '▢', label: 'Print → PDF', onClick: handlePDF, disabled: noContent },
  ];
  const shareItems = [
    { id: 'email',     glyph: emailGlyph, label: emailLabel, onClick: () => setEmailOpen(true),
      disabled: noContent || processing || emailBusy },
    { id: 'classroom', glyph: classroomGlyph, label: classroomLabel, onClick: handleClassroom,
      disabled: noContent || processing || classroomBusy },
    { id: 'link',      glyph: '∞', label: 'Link', onClick: handleLink, disabled: false },
  ];
  const exportItems = [
    { id: 'copy', glyph: copied ? '✓' : '❐', label: copied ? 'Copied' : 'Copy',
      onClick: handleCopy, disabled: noContent },
    { id: 'png',  glyph: '▦', label: 'PNG',  onClick: handlePNG, disabled: noSvg },
    { id: 'json', glyph: '{}',label: 'JSON', onClick: handleJSON, disabled: !session },
  ];

  const groups = [
    { label: 'Save',   items: saveItems },
    { label: 'Share',  items: shareItems },
    { label: 'Export', items: exportItems },
  ];

  const onMenuOpen = (label) => setOpenMenu(label);
  const onMenuClose = () => setOpenMenu(null);

  return (
    <>
      <div className="og-exports" data-testid="og-exports">
        {groups.map(g => (
          <div className="og-export-group" key={g.label}>
            <MenuDropdown
              label={g.label}
              items={g.items}
              openMenu={openMenu}
              onOpen={onMenuOpen}
              onClose={onMenuClose}
              idPrefix={'og-export-' + g.label.toLowerCase()}
            />
            {g.label === 'Save' && (
              <div className="og-drive-folder" ref={folderMenuRef}>
                <input
                  ref={folderInputRef}
                  className="og-drive-folder-input"
                  type="text"
                  placeholder="Drive folder (optional)"
                  aria-label="Drive folder path (optional)"
                  aria-autocomplete="list"
                  aria-expanded={folderMenuOpen && recentFolders.length > 0}
                  aria-controls="og-drive-folder-menu"
                  aria-activedescendant={folderActiveIdx >= 0 ? `og-drive-folder-item-${folderActiveIdx}` : undefined}
                  value={folderPath}
                  onChange={(e) => { setFolderPath(e.target.value); setFolderActiveIdx(-1); }}
                  onFocus={() => setFolderMenuOpen(recentFolders.length > 0)}
                  onKeyDown={handleFolderKey}
                  disabled={driveBusy}
                />
                {folderMenuOpen && recentFolders.length > 0 && (
                  <ul
                    id="og-drive-folder-menu"
                    className="og-drive-folder-menu"
                    role="listbox"
                    aria-label="Recent Drive folders"
                  >
                    {recentFolders.map((p, idx) => (
                      <li key={p} role="presentation">
                        <button
                          type="button"
                          id={`og-drive-folder-item-${idx}`}
                          role="option"
                          aria-selected={idx === folderActiveIdx}
                          className={'og-drive-folder-item' + (idx === folderActiveIdx ? ' is-active' : '')}
                          onMouseEnter={() => setFolderActiveIdx(idx)}
                          onClick={() => {
                            setFolderPath(p);
                            setFolderMenuOpen(false);
                            setFolderActiveIdx(-1);
                          }}
                        >{p}</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Mobile FAB — visible only at ≤880 px via CSS. Tap to native-share, falls
          back to a bottom sheet that re-uses the 3-menu groups above. */}
      <button
        type="button"
        className="og-share-fab"
        aria-label="Share document"
        data-testid="og-share-fab"
        onClick={handleNativeShare}
        disabled={noContent}
      >
        <span aria-hidden="true">↗</span>
      </button>

      {mobileSheetOpen && (
        <div
          className="og-share-sheet-shroud"
          onClick={() => setMobileSheetOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Share options"
        >
          <div className="og-share-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="og-share-sheet-grip" aria-hidden="true" />
            {groups.map(g => (
              <section className="og-share-sheet-group" key={g.label}>
                <div className="og-share-sheet-label">{g.label}</div>
                <div className="og-share-sheet-items">
                  {g.items.map(it => (
                    <button
                      key={it.id}
                      type="button"
                      className="og-export-btn"
                      disabled={it.disabled}
                      onClick={() => {
                        if (!it.disabled) {
                          it.onClick();
                          setMobileSheetOpen(false);
                        }
                      }}
                    >
                      <span className="og-export-glyph">{it.glyph}</span>
                      <span>{it.label}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
            <button
              type="button"
              className="og-share-sheet-close"
              onClick={() => setMobileSheetOpen(false)}
            >Close</button>
          </div>
        </div>
      )}

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
