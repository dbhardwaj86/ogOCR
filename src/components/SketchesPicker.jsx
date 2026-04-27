import { sanitizeSvg } from '../svgSanitize';

/**
 * Multi-sketch picker (Phase 15 — Multi-Sketch Detection).
 *
 * Shown when the active session has 2+ detected sketches from /api/sketch-to-svg
 * discovery mode. Modeled on `ImageGrid` (RenderedDoc.jsx#ImageGrid) with three
 * additions per card:
 *   1. status badge: pending → "Vectorize" button, running → spinner, done → SVG preview, error → retry
 *   2. selection highlight (matches session.selectedSketchId)
 *   3. "Open" CTA on done cards that hands the SVG back to the parent for full
 *      rendering in the Preview pill
 *
 * Props:
 *   sketches            [{id, description, bbox, page, thumbnail?, svg, status}]
 *   selectedId          currently focused card id
 *   onSelect(id)        user clicked a card (sets selectedSketchId)
 *   onVectorize(id)     user clicked the per-card "Vectorize" button
 *   onVectorizeAll()    user clicked the toolbar "Vectorize All" button (sequential)
 *   onOpen(id)          user clicked the per-card "Open" button on a done card
 *   anyRunning          true if a vectorize call is in flight (disables buttons)
 *
 * Layout: a CSS grid that wraps cards (mirrors `.og-image-grid` in index.css,
 * with picker-specific selectors `.og-sketches-picker` / `.og-sketch-card`).
 */
function SketchesPicker({
  sketches,
  selectedId,
  onSelect,
  onVectorize,
  onVectorizeAll,
  onCancelBatch,
  onOpen,
  anyRunning,
  batchActive,
}) {
  if (!Array.isArray(sketches) || sketches.length === 0) return null;

  const doneCount = sketches.filter(s => s.status === 'done').length;
  const remaining = sketches.length - doneCount;
  const allDone = doneCount === sketches.length;
  const showStop = batchActive && !allDone;

  return (
    <article className="og-rendered og-rendered--sketches">
      <div className="og-sketches-toolbar">
        <span className="og-sketches-runner">
          OG·OCR · DETECTED · {sketches.length} SKETCH{sketches.length === 1 ? '' : 'ES'}
        </span>
        {showStop ? (
          <button
            type="button"
            className="og-btn-ghost og-sketches-batch og-sketches-batch--stop"
            onClick={onCancelBatch}
            title="Stop the batch — already-finished sketches stay vectorized."
          >
            Stop ({remaining} left)
          </button>
        ) : (
          <button
            type="button"
            className="og-btn-ghost og-sketches-batch"
            onClick={onVectorizeAll}
            disabled={anyRunning || allDone}
            title={allDone
              ? 'All sketches vectorized.'
              : anyRunning
                ? 'A sketch is currently being vectorized…'
                : `Vectorize all ${sketches.length} sketches sequentially. Click Stop on the processing strip or here to interrupt.`}
          >
            {allDone ? 'All vectorized' : `Vectorize All (${remaining} left)`}
          </button>
        )}
      </div>
      <p className="og-sketches-help">
        {showStop
          ? `Vectorizing ${doneCount + 1} of ${sketches.length} — click Stop to halt the queue. Anything already vectorized stays.`
          : `Click a card to focus it, then "Vectorize" to convert it to a clean SVG. Originals come from the upload — re-upload to re-detect.`}
      </p>
      <div className="og-sketches-grid" role="list">
        {sketches.map((s) => {
          const selected = s.id === selectedId;
          const running = s.status === 'running';
          const done = s.status === 'done' && s.svg;
          const errored = s.status === 'error';
          const cardClass =
            'og-sketch-card' +
            (selected ? ' is-selected' : '') +
            (running ? ' is-running' : '') +
            (done ? ' is-done' : '') +
            (errored ? ' is-error' : '');
          return (
            <figure
              key={s.id}
              className={cardClass}
              role="listitem"
              tabIndex={0}
              onClick={() => onSelect && onSelect(s.id)}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && onSelect) {
                  e.preventDefault();
                  onSelect(s.id);
                }
              }}
              aria-pressed={selected}
              aria-label={`${s.description} (page ${s.page})${done ? ' — vectorized' : running ? ' — vectorizing' : ''}`}
            >
              <div className="og-sketch-card-thumb">
                {done ? (
                  <div
                    className="og-sketch-card-svg"
                    dangerouslySetInnerHTML={{ __html: sanitizeSvg(s.svg) }}
                  />
                ) : s.thumbnail ? (
                  <img
                    className="og-sketch-card-img"
                    src={s.thumbnail}
                    alt={s.description}
                    loading="lazy"
                  />
                ) : (
                  <div className="og-sketch-card-placeholder" aria-hidden="true">
                    <span className="og-sketch-card-placeholder-glyph">▦</span>
                    <span className="og-sketch-card-placeholder-tag">page {s.page}</span>
                  </div>
                )}
                {running && (
                  <div className="og-sketch-card-overlay" aria-live="polite">
                    <span className="og-sketch-card-spinner" aria-hidden="true">●</span>
                    <span className="og-sketch-card-overlay-text">Vectorizing…</span>
                  </div>
                )}
              </div>
              <figcaption className="og-sketch-card-caption">
                <span className="og-sketch-card-id">Sketch {s.id} · p{s.page}</span>
                <span className="og-sketch-card-desc">{s.description}</span>
                <div className="og-sketch-card-actions">
                  {done ? (
                    <button
                      type="button"
                      className="og-btn-primary og-sketch-card-cta"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen && onOpen(s.id);
                      }}
                    >Open</button>
                  ) : errored ? (
                    <button
                      type="button"
                      className="og-btn-primary og-sketch-card-cta"
                      onClick={(e) => {
                        e.stopPropagation();
                        onVectorize && onVectorize(s.id);
                      }}
                      disabled={anyRunning}
                      title="Vectorization failed last time — try again."
                    >Retry</button>
                  ) : (
                    <button
                      type="button"
                      className="og-btn-primary og-sketch-card-cta"
                      onClick={(e) => {
                        e.stopPropagation();
                        onVectorize && onVectorize(s.id);
                      }}
                      disabled={anyRunning || running}
                    >{running ? 'Working…' : 'Vectorize'}</button>
                  )}
                </div>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </article>
  );
}

export default SketchesPicker;
