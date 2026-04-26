import { useState } from 'react';

function exportPNG(svgString, filename = 'ogOCR_Export.png') {
  const div = document.createElement('div');
  div.innerHTML = svgString;
  const svgEl = div.querySelector('svg');
  if (!svgEl) return false;

  const vb = svgEl.viewBox?.baseVal;
  let w = parseFloat(svgEl.getAttribute('width')) || (vb?.width) || 800;
  let h = parseFloat(svgEl.getAttribute('height')) || (vb?.height) || 600;
  if (!svgEl.getAttribute('width')) svgEl.setAttribute('width', w);
  if (!svgEl.getAttribute('height')) svgEl.setAttribute('height', h);

  const svgData = new XMLSerializer().serializeToString(svgEl);
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.onload = () => {
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
    URL.revokeObjectURL(url);
  };
  img.onerror = () => URL.revokeObjectURL(url);
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
          <button className="og-prompt-run" onClick={() => onSubmit(email)} disabled={busy || !email}>Send</button>
        </div>
      </div>
    </div>
  );
}

function ExportBar({ session, onShowToast, processing }) {
  const [copied, setCopied] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);

  const noContent = !session || (!session.text && !session.svg);
  const noSvg = !session?.svg;
  const content = session?.svg || session?.text || '';
  const baseName = (session?.filename || 'ogOCR_Document').replace(/\.[^.]+$/, '');

  const handleCopy = async () => {
    if (noContent) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      onShowToast('Copy failed');
    }
  };

  const handleDrive = async () => {
    if (noContent) return;
    try {
      const ext = session.svg ? '.svg' : '.txt';
      const r = await fetch('/api/save-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content, filename: baseName + ext }),
      });
      const data = await r.json();
      onShowToast(data.message || data.error || 'Saved');
    } catch {
      onShowToast('Save failed');
    }
  };

  const handleClassroom = async () => {
    if (noContent) return;
    try {
      const r = await fetch('/api/classroom/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content, filename: baseName }),
      });
      const data = await r.json();
      onShowToast(data.message || data.error || 'Drafted');
    } catch {
      onShowToast('Classroom draft failed');
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
      const data = await r.json();
      onShowToast(data.message || data.error || 'Sent');
      setEmailOpen(false);
    } catch {
      onShowToast('Email failed');
    } finally {
      setEmailBusy(false);
    }
  };

  const handleLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      onShowToast('Link copied');
    } catch {
      onShowToast('Copy failed');
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
    exportPNG(session.svg, baseName + '.png');
  };

  const handleJSON = () => {
    if (!session) return;
    downloadBlob(JSON.stringify(session, null, 2), baseName + '.json', 'application/json');
  };

  const groups = [
    {
      label: 'Save',
      items: [
        { id: 'drive', glyph: '△', label: 'Drive', onClick: handleDrive, disabled: noContent || processing },
        { id: 'md',    glyph: '▤', label: session?.svg ? 'SVG' : 'MD', onClick: handleMD, disabled: noContent },
        { id: 'pdf',   glyph: '▢', label: 'PDF',   onClick: handlePDF,  disabled: noContent },
      ],
    },
    {
      label: 'Share',
      items: [
        { id: 'email',     glyph: '✉', label: 'Email',     onClick: () => setEmailOpen(true), disabled: noContent || processing },
        { id: 'classroom', glyph: '◯', label: 'Classroom', onClick: handleClassroom,          disabled: noContent || processing },
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
