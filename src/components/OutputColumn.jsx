import { useEffect, useMemo, useRef, useState } from 'react';
import RenderedDoc, { detectMermaidBlock } from './RenderedDoc';
import SketchesPicker from './SketchesPicker';
import SourceDoc from './SourceDoc';
import ProcessingStrip from './ProcessingStrip';
import ExportBar from './ExportBar';
import PromptDock from './PromptDock';
import InlineError from './InlineError';
import RefinementTabs from './RefinementTabs';
import { KIND_LABEL, REFINE_ACTIONS } from '../magicActions';

// Inline rename input — extracted so a `key` on this component (the session
// id + persisted exportName) cleanly resets local draft state when the active
// session or its persisted name changes externally. Avoids syncing-effect
// anti-pattern (forbidden by react-hooks/set-state-in-effect).
function RenameInput({ initialValue, fallback, ariaLabel, onCommit }) {
  const [draft, setDraft] = useState(initialValue);
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === initialValue) return;
    onCommit(trimmed);
  };
  return (
    <input
      type="text"
      className="og-output-rename"
      placeholder={fallback || 'Rename for export'}
      aria-label={ariaLabel}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          setDraft(initialValue);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function OutputColumn({
  session,
  file,
  processing,
  prompt,
  setPrompt,
  onRunPrompt,
  onShowToast,
  onCompile,
  onUpdateSession,
  hasFile,
  onCancel,
  onRetry,
  onDismissError,
  onVectorizeSketch,
  onVectorizeAllSketches,
  onOpenSketch,
  onShowAllSketches,
}) {
  const [mode, setMode] = useState('rendered'); // 'rendered' | 'source' | 'refine' | 'diagram' | 'equation' | 'sketches'
  // Tablet-portrait (641-880 px) collapsible source thumbnail. Default
  // collapsed so the canvas stays the focus; tapping the strip expands it.
  const [thumbExpanded, setThumbExpanded] = useState(false);

  const numLabel = session ? 'OUT.' + session.id.slice(-3).toUpperCase() : 'OUT.NEW';
  const kindLabel = session?.kind ? (KIND_LABEL[session.kind] || 'Document') : 'Document';

  const value = session?.svg || session?.text || '';

  // Reuse the SourcePreview blob-URL pattern — allocate once per file, revoke
  // on unmount/file-change. We only build a URL for image files; PDFs render
  // a glyph card.
  const thumbUrl = useMemo(() => {
    if (!file?.type?.startsWith('image/')) return null;
    return URL.createObjectURL(file);
  }, [file]);
  useEffect(() => {
    if (!thumbUrl) return undefined;
    return () => URL.revokeObjectURL(thumbUrl);
  }, [thumbUrl]);

  const isPdf = file?.type === 'application/pdf';
  const thumbName = file?.name || session?.filename || '';

  const handleSourceChange = (next) => {
    if (!session) return;
    if (session.svg) {
      onUpdateSession({ svg: next });
    } else {
      onUpdateSession({ text: next });
    }
  };

  const lastError = session?.lastError && !processing ? session.lastError : null;

  // Refine pill is hidden until at least one refinement key is populated.
  const refinements = session?.refinements || null;
  const populatedRefineKinds = refinements
    ? REFINE_ACTIONS.map(a => a.kind).filter(k => typeof refinements[k] === 'string' && refinements[k].trim())
    : [];
  const hasRefinements = populatedRefineKinds.length > 0;

  // Sprint 2.8a — Diagram pill is conditional: shown when the session is
  // explicitly mermaid-kind, or when the extracted text contains a fenced
  // ```mermaid block. Both conditions are checked because (a) free-form
  // prompts can return mermaid without setting kind, and (b) the mermaid
  // action sets kind but the text still wraps the code in a fence.
  const hasMermaid =
    session?.kind === 'mermaid' || !!detectMermaidBlock(session?.text);

  // Sprint 3.1 — Equation pill is conditional: visible only when the
  // session was produced by the `Math to LaTeX` action. We do not sniff the
  // text for `$$` fences because the Math action returns raw LaTeX (no
  // markdown wrapping), so `kind === 'math'` is the canonical signal.
  const hasEquation = session?.kind === 'math';

  // Phase 15 — Sketches pill is conditional: visible only when the active
  // session has 2+ detected-but-not-yet-vectorized sketches (the multi-
  // sketch path on /api/sketch-to-svg). Single-sketch sessions go through
  // the back-compat `data.svg` branch and never populate this array.
  const hasSketches = Array.isArray(session?.sketches) && session.sketches.length > 0;

  // Phase 15 — auto-flip mode to 'sketches' when a session FIRST acquires
  // sketches (so the user lands on the picker immediately after detection
  // completes). Tracks the last-seen sketches length per session id; if it
  // jumps from 0 → N>0, switch mode. Also resets when the active session
  // changes so back-and-forth between sessions doesn't override the user's
  // explicit pill choice.
  const lastSeenSketchKey = useRef('');
  useEffect(() => {
    const key = `${session?.id || ''}:${session?.sketches?.length || 0}`;
    if (key === lastSeenSketchKey.current) return;
    const prevKey = lastSeenSketchKey.current;
    lastSeenSketchKey.current = key;
    const prevId = prevKey.split(':')[0];
    const prevLen = Number(prevKey.split(':')[1] || 0);
    const currLen = session?.sketches?.length || 0;
    // Same session, count went from 0 → N>0 → auto-switch to sketches mode.
    if (prevId === (session?.id || '') && prevLen === 0 && currLen > 0) {
      setMode('sketches');
    }
  }, [session?.id, session?.sketches?.length]);

  // Auto-flip mode to 'rendered' when the user clicks "Open" on a sketch
  // card (openSketch sets session.selectedSketchId AND session.svg). Without
  // this, mode stays at 'sketches' and the picker keeps rendering — the
  // Open click feels like a no-op. The mode-flip makes the focused-view
  // visible, which is also where the "Show all sketches" link lives.
  const lastOpenedSketchKey = useRef('');
  useEffect(() => {
    const sid = session?.id || '';
    const ssid = session?.selectedSketchId || '';
    const hasSvg = !!(session?.svg && session.svg.length);
    const key = `${sid}:${ssid}:${hasSvg ? '1' : '0'}`;
    if (key === lastOpenedSketchKey.current) return;
    const prev = lastOpenedSketchKey.current;
    lastOpenedSketchKey.current = key;
    if (!sid || !ssid || !hasSvg) return;
    const [prevSid, prevSsid, prevHasSvg] = prev.split(':');
    // Treat a fresh selection-with-svg on the same session as an Open click.
    if (prevSid === sid && (prevSsid !== ssid || prevHasSvg !== '1')) {
      setMode('rendered');
    }
  }, [session?.id, session?.selectedSketchId, session?.svg]);

  // If the user picked the Refine pill but the session no longer has any
  // populated refinements (e.g. switched sessions), fall back to Preview.
  // Same idea for Diagram / Equation / Sketches: if the active session no
  // longer qualifies, drop back to Preview rather than rendering empty UI.
  let effectiveMode = mode;
  if (effectiveMode === 'refine' && !hasRefinements) effectiveMode = 'rendered';
  if (effectiveMode === 'diagram' && !hasMermaid) effectiveMode = 'rendered';
  if (effectiveMode === 'equation' && !hasEquation) effectiveMode = 'rendered';
  if (effectiveMode === 'sketches' && !hasSketches) effectiveMode = 'rendered';

  return (
    <section className="og-output">
      <div className="og-output-head">
        <div className="og-output-title">
          <span className="og-output-num">{numLabel}</span>
          <span className="og-output-h">Extracted Document</span>
          <span className="og-output-sep">/</span>
          <span className="og-output-kind">{kindLabel}</span>
          {session && (
            <RenameInput
              key={`${session.id}:${session.exportName || ''}`}
              initialValue={session.exportName || ''}
              fallback={session.filename}
              ariaLabel="Filename for exports (leave blank to use original)"
              onCommit={(next) => onUpdateSession && onUpdateSession({ exportName: next })}
            />
          )}
        </div>
        <div className="og-output-modes">
          <button
            className={'og-pill' + (effectiveMode === 'rendered' ? ' is-active' : '')}
            onClick={() => setMode('rendered')}
          >Preview</button>
          <button
            className={'og-pill' + (effectiveMode === 'source' ? ' is-active' : '')}
            onClick={() => setMode('source')}
          >Markdown</button>
          {hasRefinements && (
            <button
              className={'og-pill' + (effectiveMode === 'refine' ? ' is-active' : '')}
              onClick={() => setMode('refine')}
              title="View AI-refined versions of this document"
            >Refine</button>
          )}
          {hasMermaid && (
            <button
              className={'og-pill og-pill-diagram' + (effectiveMode === 'diagram' ? ' is-active' : '')}
              onClick={() => setMode('diagram')}
              title="Open the Mermaid live editor for this diagram"
            >Diagram</button>
          )}
          {hasEquation && (
            <button
              className={'og-pill og-pill-equation' + (effectiveMode === 'equation' ? ' is-active' : '')}
              onClick={() => setMode('equation')}
              title="Open the live LaTeX editor for this equation"
            >Equation</button>
          )}
          {hasSketches && (
            <button
              className={'og-pill og-pill-sketches' + (effectiveMode === 'sketches' ? ' is-active' : '')}
              onClick={() => setMode('sketches')}
              title="Pick a detected sketch to vectorize"
            >Sketches ({session.sketches.length})</button>
          )}
          <button
            className="og-pill og-pill-secondary"
            onClick={onCompile}
            // v3 — every source has its own auto-compiled worksheet that
            // grows as the user extracts more outputs from it. The pill is
            // useful from session #1, so the old `sessionCount < 2` dim
            // treatment is gone. Cross-source manual compiles still work
            // through the same button via the palette.
            title="Open this source's auto-compiled worksheet — every extracted output appended automatically."
          >Worksheet</button>
        </div>
      </div>

      {/* Tablet-portrait only: collapsible source thumbnail strip. CSS hides
         this everywhere except the (min-width: 641px) and (max-width: 880px)
         band where the source pane is hidden by data-mobile-pane="output". */}
      {(thumbUrl || isPdf) && (
        <div
          className={'og-source-thumb' + (thumbExpanded ? ' is-expanded' : '')}
        >
          <button
            type="button"
            className="og-source-thumb-toggle"
            onClick={() => setThumbExpanded(v => !v)}
            aria-expanded={thumbExpanded}
            aria-controls="og-source-thumb-body"
          >
            <span className="og-source-thumb-glyph">{isPdf ? '▤' : '◌'}</span>
            <span className="og-source-thumb-label">Source</span>
            <span className="og-source-thumb-name">{thumbName}</span>
            <span className="og-source-thumb-caret" aria-hidden="true">
              {thumbExpanded ? '▾' : '▸'}
            </span>
          </button>
          {thumbExpanded && (
            <div id="og-source-thumb-body" className="og-source-thumb-body">
              {thumbUrl && (
                <img src={thumbUrl} alt={thumbName} className="og-source-thumb-img" />
              )}
              {isPdf && (
                <div className="og-source-thumb-pdf">
                  <span className="og-source-thumb-pdf-glyph">▤</span>
                  <span className="og-source-thumb-pdf-note">
                    PDF — preview unavailable
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Hero PromptDock — sits above the canvas so the free-form Gemini ask is
         always one click away, per §1.3 #7. Keeps the same keyboard/disabled
         semantics; just relocated from the bottom of the column. */}
      <div className="og-output-hero">
        <PromptDock
          value={prompt}
          onChange={setPrompt}
          onRun={onRunPrompt}
          processing={processing}
          disabled={!hasFile}
        />
      </div>

      <ProcessingStrip processing={processing} onCancel={processing ? onCancel : null} />

      {lastError && (
        <InlineError
          entry={lastError}
          onRetry={onRetry}
          onDismiss={onDismissError}
        />
      )}

      <div className="og-output-canvas">
        {/* "Show all sketches" chip — visible whenever a focused sketch is
           open (session.svg) and at least one sketch lives behind it. Not
           gated on mode: even from Source / Markdown views, the user
           should be one click from the picker. Pending count surfaces
           in-flight vectorizes from the focused view. */}
        {session?.svg
          && Array.isArray(session?.sketches)
          && session.sketches.length >= 1
          && onShowAllSketches && (
          <div className="og-output-back-strip print-hide">
            <button
              type="button"
              className="og-output-back-link"
              onClick={onShowAllSketches}
            >← Show all sketches ({session.sketches.length}{
              (() => {
                const pending = session.sketches.filter(s => s && (s.status === 'pending' || s.status === 'running')).length;
                return pending > 0 ? ` — ${pending} still vectorizing` : '';
              })()
            })</button>
          </div>
        )}
        {effectiveMode === 'rendered' && (
          <RenderedDoc
            text={session?.text}
            svg={session?.svg}
            images={session?.images}
            onChangeText={(next) => onUpdateSession && onUpdateSession({ text: next })}
          />
        )}
        {effectiveMode === 'source' && (
          <SourceDoc
            value={value}
            onChange={handleSourceChange}
            disabled={!!processing || !session}
          />
        )}
        {effectiveMode === 'refine' && (
          <RefinementTabs refinements={refinements} populatedKinds={populatedRefineKinds} />
        )}
        {effectiveMode === 'diagram' && (
          <RenderedDoc text={session?.text} svg={session?.svg} images={session?.images} mode="diagram" />
        )}
        {effectiveMode === 'equation' && (
          <RenderedDoc
            text={session?.text}
            svg={session?.svg}
            images={session?.images}
            mode="equation"
            onChangeText={(next) => onUpdateSession && onUpdateSession({ text: next })}
          />
        )}
        {effectiveMode === 'sketches' && (
          <SketchesPicker
            sketches={session?.sketches || []}
            selectedId={session?.selectedSketchId}
            onSelect={(id) => onUpdateSession && onUpdateSession({ selectedSketchId: id })}
            onVectorize={onVectorizeSketch}
            onVectorizeAll={onVectorizeAllSketches}
            onOpen={onOpenSketch}
            anyRunning={(session?.sketches || []).some(s => s.status === 'running')}
          />
        )}
      </div>

      <div className="og-output-foot">
        <ExportBar session={session} onShowToast={onShowToast} processing={!!processing} />
      </div>
    </section>
  );
}

export default OutputColumn;
