import { useEffect, useRef, useState } from 'react';
import { showError, showInfo } from '../errors/showError';
import { errFromException } from '../errors/errFromResponse';
import { buildSessionFormats } from '../saveFormats';

// Inner picker list — lives only while the menu is open. Mounting fresh
// resets activeIdx to 0 implicitly so we never call setState from an effect
// (forbidden by react-hooks/set-state-in-effect; also unnecessary since the
// component remounts on every open).
function PickerList({ formats, onPick, returnFocusTo, onClose }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const onItemKey = (e, idx) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((idx + 1) % formats.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((idx - 1 + formats.length) % formats.length);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPick(formats[idx]);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      onClose();
      returnFocusTo?.current?.focus();
    }
  };
  return (
    <ul
      className="og-export-menu-list"
      role="menu"
      aria-label="Save format"
      data-testid="og-save-menu"
    >
      {formats.map((it, idx) => (
        <li key={it.id} role="none">
          <button
            type="button"
            role="menuitem"
            className="og-export-menu-item"
            tabIndex={idx === activeIdx ? 0 : -1}
            ref={el => { if (el && idx === activeIdx) el.focus(); }}
            onClick={() => onPick(it)}
            onKeyDown={(e) => onItemKey(e, idx)}
            data-testid={`og-save-item-${it.id}`}
          >
            <span className="og-export-glyph" aria-hidden="true">{it.glyph}</span>
            <span>{it.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// Streamlined save surface for a single session. Three affordances:
//
//   Save  — opens a format picker; format selection builds a file and
//           hands it to navigator.share() on mobile (Files / iCloud /
//           Drive native routing) or downloads it on desktop.
//   Copy  — copies the rendered text/svg to the clipboard. Different
//           intent from "save a file" so it stays its own button.
//   Print — opens the browser print dialog. Universal action; user can
//           Save-as-PDF from there if they want PDF.
//
// Drive / Email / Classroom / Share-link / Sign-and-save have been
// retired from this surface. On mobile the native share sheet routes to
// any installed app (including Drive / Mail / Classroom), and Sign moved
// to the source-column where annotation belongs.

// onShowToast is the legacy plain-string callback — kept on the prop list
// so older callers don't fail to render, but we route everything through
// the error registry now.
// eslint-disable-next-line no-unused-vars
function ExportBar({ session, file, onShowToast, processing }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pageProgress, setPageProgress] = useState(null);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);

  const text = session?.text || '';
  const svg = session?.svg || '';
  // Only "no content" if there is also no source file to derive a raster
  // export from. With a file present, the picker offers Original-as-PNG /
  // Original-as-JPG / page-export so Save is still useful pre-extraction.
  const noContent = (!session || (!text && !svg)) && !file;
  const rawBase = (session?.exportName?.trim() || session?.filename || file?.name || 'ogOCR_Document');
  const baseName = rawBase.replace(/\.[^.]+$/, '');

  // Lazily probe the PDF page count once per file so the Save picker can
  // surface "All pages as PNG (N)" instead of an ambiguous label. pdfjs is
  // already used by SourcePreview / UploadConfirmModal so the worker is
  // typically already loaded. Only async writes go through setState — the
  // "no PDF" reset uses a key (file identity) so a re-render after a swap
  // shows the new count without a sync setState in the effect body.
  useEffect(() => {
    if (!file || file.type !== 'application/pdf') return undefined;
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const buf = await file.arrayBuffer();
        if (cancelled) return;
        const doc = await pdfjs.getDocument({ data: buf }).promise;
        if (!cancelled) setPdfPageCount(doc.numPages);
      } catch {
        if (!cancelled) setPdfPageCount(0);
      }
    })();
    return () => { cancelled = true; setPdfPageCount(0); };
  }, [file]);

  const handlePageProgress = ({ done, total }) => {
    setPageProgress({ done, total });
  };

  const formats = buildSessionFormats({
    session,
    baseName,
    file,
    pdfPageCount,
    onPageProgress: handlePageProgress,
  });

  useEffect(() => {
    if (!pickerOpen) return undefined;
    const onDoc = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setPickerOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setPickerOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  const runFormat = async (format) => {
    if (!format || running) return;
    setRunning(true);
    setPageProgress(null);
    setPickerOpen(false);
    try {
      await format.run();
    } catch (err) {
      const entry = errFromException(err);
      showError(entry.code, { message: entry.message, hint: entry.hint });
    } finally {
      setRunning(false);
      setPageProgress(null);
    }
  };

  const handleCopy = async () => {
    if (noContent) {
      showError('EXP_EMAIL_NO_CONTENT');
      return;
    }
    if (!navigator.clipboard) {
      showError('EXP_CLIPBOARD_NO_API');
      return;
    }
    const content = svg || text;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
      showInfo('Copied to clipboard.');
    } catch {
      showError('EXP_CLIPBOARD_DENIED');
    }
  };

  const handlePrint = () => {
    if (noContent) {
      showError('EXP_EMAIL_NO_CONTENT');
      return;
    }
    window.print();
  };

  const onSaveKey = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setPickerOpen(true);
    } else if (e.key === 'Escape') {
      setPickerOpen(false);
    }
  };

  return (
    <div className="og-exports" data-testid="og-exports">
      <div className="og-export-menu" ref={containerRef}>
        <button
          ref={buttonRef}
          type="button"
          className="og-export-menu-btn og-export-save-btn"
          aria-haspopup="menu"
          aria-expanded={pickerOpen}
          onClick={() => (pickerOpen ? setPickerOpen(false) : setPickerOpen(true))}
          onKeyDown={onSaveKey}
          disabled={noContent || processing || running || formats.length === 0}
          data-testid="og-save-btn"
        >
          <span className="og-export-glyph" aria-hidden="true">{running ? '◐' : '↓'}</span>
          <span>
            {running
              ? (pageProgress
                  ? `Saving page ${pageProgress.done} of ${pageProgress.total}…`
                  : 'Saving…')
              : 'Save'}
          </span>
          <span className="og-export-menu-caret" aria-hidden="true">▾</span>
        </button>
        {pickerOpen && formats.length > 0 && (
          <PickerList
            formats={formats}
            onPick={runFormat}
            returnFocusTo={buttonRef}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
      <button
        type="button"
        className="og-export-btn"
        onClick={handleCopy}
        disabled={noContent}
        title="Copy the rendered text or SVG to the clipboard."
      >
        <span className="og-export-glyph" aria-hidden="true">{copied ? '✓' : '❐'}</span>
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
      <button
        type="button"
        className="og-export-btn"
        onClick={handlePrint}
        disabled={noContent}
        title="Open the browser print dialog. Save as PDF from there for a PDF."
      >
        <span className="og-export-glyph" aria-hidden="true">▢</span>
        <span>Print</span>
      </button>
    </div>
  );
}

export default ExportBar;
