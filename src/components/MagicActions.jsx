import { MAGIC_ACTIONS, ACTION_GROUPS, REFINE_ACTIONS } from '../magicActions';

function MagicActions({ file, processing, onRun, hasRefineableText }) {
  const disabled = !file || !!processing;

  // Refine row routes through the same `onRun` callback as magic actions;
  // `App.jsx#runAction` detects the `refine-*` prefix and skips the
  // file-required early bail, building a synthetic text/plain payload out
  // of `session.text` instead.
  //
  // The disable rule needs to know whether the active session has any text
  // to refine. SourceColumn (Track C territory) renders MagicActions and
  // doesn't currently forward `session`, so this component accepts a
  // pre-computed `hasRefineableText` boolean. When the parent doesn't pass
  // it, we fall back to the file-presence rule (refine row enabled
  // alongside the 8 tiles) and rely on App.jsx to surface a clean error if
  // the user clicks before any text is available.
  const refineKnown = typeof hasRefineableText === 'boolean';
  const refineDisabled = refineKnown
    ? !hasRefineableText || !!processing
    : disabled;
  const refineHint = refineKnown && !hasRefineableText
    ? 'Run an action first'
    : null;

  return (
    <div className="og-action-tiles">
      {ACTION_GROUPS.map(group => {
        const inGroup = MAGIC_ACTIONS.filter(a => a.group === group);
        return (
          <div className="og-action-group" key={group}>
            <div className="og-action-group-label">{group}</div>
            <div className="og-action-group-tiles">
              {inGroup.map(a => {
                const running = processing?.actionId === a.id;
                return (
                  <button
                    key={a.id}
                    className={'og-tile' + (running ? ' is-running' : '')}
                    disabled={disabled}
                    onClick={() => onRun(a.id)}
                    title={a.hint}
                    aria-label={`${a.label} — ${a.hint}`}
                    aria-keyshortcuts={`Alt+${a.key}`}
                  >
                    <span className="og-tile-glyph">{a.glyph}</span>
                    <span className="og-tile-label">{a.label}</span>
                    <span className="og-tile-hint">{a.hint}</span>
                    <span className="og-tile-key">⌥{a.key}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="og-action-group og-action-group--refine" key="refine">
        <div className="og-action-group-label">
          Refine
          {refineHint && (
            <span className="og-action-group-hint"> · {refineHint}</span>
          )}
        </div>
        <div className="og-action-group-tiles og-action-row">
          {REFINE_ACTIONS.map(a => {
            const running = processing?.actionId === a.id;
            return (
              <button
                key={a.id}
                className={'og-tile og-tile--refine' + (running ? ' is-running' : '')}
                disabled={refineDisabled}
                onClick={() => onRun(a.id)}
                title={a.hint}
                aria-label={`${a.label} — ${a.hint}`}
              >
                <span className="og-tile-glyph">↻</span>
                <span className="og-tile-label">{a.label}</span>
                <span className="og-tile-hint">{a.hint}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default MagicActions;
