import { useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { BLOCK_KINDS, resolveSessionBlock } from '../compile';
import { sanitizeSvg } from '../svgSanitize';
import { saveOrShare } from '../saveFormats';
import { exportRaster } from '../exportRaster';
import { showError } from '../errors/showError';
import { errFromException } from '../errors/errFromResponse';

const KIND_GLYPH = {
  [BLOCK_KINDS.TEXT]: '¶',
  [BLOCK_KINDS.SVG]: '◇',
  [BLOCK_KINDS.IMAGE]: '▦',
  [BLOCK_KINDS.PAGE_BREAK]: '↵',
  [BLOCK_KINDS.SESSION]: '⟐',
};

const KIND_LABEL = {
  [BLOCK_KINDS.TEXT]: 'Text',
  [BLOCK_KINDS.SVG]: 'SVG',
  [BLOCK_KINDS.IMAGE]: 'Image',
  [BLOCK_KINDS.PAGE_BREAK]: 'Page break',
  [BLOCK_KINDS.SESSION]: 'Session',
};

function SessionPreview({ block, sessions }) {
  const s = resolveSessionBlock(block, sessions);
  if (!s) return null;
  if (s.deleted) {
    return (
      <div className="og-compile-block-empty">
        Missing session: <em>{s.name}</em>
      </div>
    );
  }
  const imgCount = Array.isArray(s.images) ? s.images.length : 0;
  return (
    <div className="og-compile-block-session">
      <div className="og-compile-block-session-meta">
        <span className="og-compile-block-session-name">{s.filename || 'Untitled session'}</span>
        <span className="og-compile-block-session-bits">
          {s.text ? 'text' : null}
          {s.text && (s.svg || imgCount) ? ' · ' : ''}
          {s.svg ? 'svg' : null}
          {s.svg && imgCount ? ' · ' : ''}
          {imgCount ? `${imgCount} image${imgCount === 1 ? '' : 's'}` : null}
          {!s.text && !s.svg && !imgCount ? 'empty' : null}
        </span>
      </div>
      {s.text ? (
        <pre className="og-compile-block-session-text">{s.text.slice(0, 320)}{s.text.length > 320 ? '…' : ''}</pre>
      ) : null}
    </div>
  );
}

function SessionPrintView({ block, sessions }) {
  const s = resolveSessionBlock(block, sessions);
  if (!s) return null;
  if (s.deleted) return <p><em>Missing session: {s.name}</em></p>;
  return (
    <>
      {s.text ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: '#cc0000' }]]}
        >{s.text}</ReactMarkdown>
      ) : null}
      {s.svg ? <div dangerouslySetInnerHTML={{ __html: sanitizeSvg(s.svg) }} /> : null}
      {Array.isArray(s.images) && s.images.length > 0 ? (
        <div className="og-compile-block-print-images">
          {s.images.map((img) => (
            <figure key={img.id}>
              {img.data ? <img src={img.data} alt={img.desc || `Image ${img.id}`} /> : null}
              {img.desc ? <figcaption>{img.desc}</figcaption> : null}
            </figure>
          ))}
        </div>
      ) : null}
    </>
  );
}

function PrintView({ block, sessions, safeSvg }) {
  switch (block.kind) {
    case BLOCK_KINDS.TEXT:
      return block.text ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: '#cc0000' }]]}
        >{block.text}</ReactMarkdown>
      ) : null;
    case BLOCK_KINDS.SVG:
      return safeSvg ? <div dangerouslySetInnerHTML={{ __html: safeSvg }} /> : null;
    case BLOCK_KINDS.IMAGE:
      return (
        <figure>
          {block.src ? <img src={block.src} alt={block.caption || ''} /> : null}
          {block.caption ? <figcaption>{block.caption}</figcaption> : null}
        </figure>
      );
    case BLOCK_KINDS.PAGE_BREAK:
      return null;
    case BLOCK_KINDS.SESSION:
      return <SessionPrintView block={block} sessions={sessions} />;
    default:
      return null;
  }
}

function CompileBlockCard({
  block,
  index,
  total,
  sessions,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging,
  isDropTarget,
  compileBaseName,
}) {
  const cardRef = useRef(null);
  const [savingFmt, setSavingFmt] = useState(null);
  const safeSvg = useMemo(
    () => (block.kind === BLOCK_KINDS.SVG ? sanitizeSvg(block.svg || '') : ''),
    [block.kind, block.svg]
  );

  const blockBaseName = `${compileBaseName || 'compile'}-block-${index + 1}`;
  const handleSaveSvgBlock = async (format) => {
    if (!block.svg || !block.svg.trim() || savingFmt) return;
    setSavingFmt(format);
    try {
      if (format === 'svg') {
        await saveOrShare(
          new Blob([block.svg], { type: 'image/svg+xml' }),
          blockBaseName + '.svg',
          'image/svg+xml',
        );
      } else {
        await exportRaster(block.svg, { format, filename: blockBaseName });
      }
    } catch (err) {
      const entry = errFromException(err);
      showError(entry.code, { message: entry.message, hint: entry.hint });
    } finally {
      setSavingFmt(null);
    }
  };

  const renderBody = () => {
    switch (block.kind) {
      case BLOCK_KINDS.TEXT:
        return (
          <textarea
            className="og-compile-block-textarea"
            value={block.text || ''}
            onChange={(e) => onUpdate(block.id, { text: e.target.value })}
            placeholder="Type or paste markdown…"
            spellCheck={false}
          />
        );
      case BLOCK_KINDS.SVG: {
        const hasSvg = !!(block.svg && block.svg.trim());
        return (
          <div className="og-compile-block-svg-wrap">
            {safeSvg ? (
              <div className="og-compile-block-svg-preview" dangerouslySetInnerHTML={{ __html: safeSvg }} />
            ) : (
              <div className="og-compile-block-empty">No SVG markup yet.</div>
            )}
            <div className="og-compile-block-svg-actions">
              <button
                type="button"
                className="og-compile-block-btn"
                onClick={() => handleSaveSvgBlock('svg')}
                disabled={!hasSvg || !!savingFmt}
                title="Save this block as an SVG file"
              >{savingFmt === 'svg' ? 'Saving…' : 'SVG'}</button>
              <button
                type="button"
                className="og-compile-block-btn"
                onClick={() => handleSaveSvgBlock('png')}
                disabled={!hasSvg || !!savingFmt}
                title="Save this block as a PNG"
              >{savingFmt === 'png' ? 'Saving…' : 'PNG'}</button>
              <button
                type="button"
                className="og-compile-block-btn"
                onClick={() => handleSaveSvgBlock('jpg')}
                disabled={!hasSvg || !!savingFmt}
                title="Save this block as a JPG"
              >{savingFmt === 'jpg' ? 'Saving…' : 'JPG'}</button>
            </div>
            <textarea
              className="og-compile-block-svg-source"
              value={block.svg || ''}
              onChange={(e) => onUpdate(block.id, { svg: e.target.value })}
              placeholder="<svg …>"
              spellCheck={false}
            />
          </div>
        );
      }
      case BLOCK_KINDS.IMAGE:
        return (
          <div className="og-compile-block-image">
            {block.src ? (
              <img className="og-compile-block-image-img" src={block.src} alt={block.caption || ''} />
            ) : (
              <div className="og-compile-block-empty">No image source.</div>
            )}
            <input
              className="og-compile-block-input"
              value={block.caption || ''}
              onChange={(e) => onUpdate(block.id, { caption: e.target.value })}
              placeholder="Caption"
            />
          </div>
        );
      case BLOCK_KINDS.PAGE_BREAK:
        return (
          <div className="og-compile-block-pagebreak" aria-hidden="true">
            <span>· · ·</span><span>page break</span><span>· · ·</span>
          </div>
        );
      case BLOCK_KINDS.SESSION:
        return <SessionPreview block={block} sessions={sessions} />;
      default:
        return null;
    }
  };

  const className = [
    'og-compile-block-card',
    `og-compile-block-card--${block.kind}`,
    isDragging ? 'is-dragging' : '',
    isDropTarget ? 'is-drop-target' : '',
  ].filter(Boolean).join(' ');

  return (
    <article
      ref={cardRef}
      className={className}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', block.id);
        onDragStart?.(block.id);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOver?.(block.id);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop?.(block.id);
      }}
      onDragEnd={() => onDragEnd?.()}
    >
      <header className="og-compile-block-head print-hide">
        <span className="og-compile-block-grip" aria-hidden="true">⋮⋮</span>
        <span className="og-compile-block-kind">
          <span className="og-compile-block-glyph" aria-hidden="true">{KIND_GLYPH[block.kind] || '·'}</span>
          {KIND_LABEL[block.kind] || block.kind}
        </span>
        <span className="og-compile-block-pos">{index + 1} / {total}</span>
        <div className="og-compile-block-controls">
          <button
            type="button"
            className="og-compile-block-btn"
            onClick={() => onMoveUp(block.id)}
            disabled={index === 0}
            aria-label="Move block up"
            title="Move up"
          >↑</button>
          <button
            type="button"
            className="og-compile-block-btn"
            onClick={() => onMoveDown(block.id)}
            disabled={index === total - 1}
            aria-label="Move block down"
            title="Move down"
          >↓</button>
          <button
            type="button"
            className="og-compile-block-btn og-compile-block-btn--danger"
            onClick={() => onRemove(block.id)}
            aria-label="Remove block"
            title="Remove"
          >×</button>
        </div>
      </header>
      <div className="og-compile-block-body print-hide">{renderBody()}</div>
      <div className="og-compile-block-printview">
        <PrintView block={block} sessions={sessions} safeSvg={safeSvg} />
      </div>
    </article>
  );
}

export default CompileBlockCard;
