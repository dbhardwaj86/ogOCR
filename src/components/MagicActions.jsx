import { MAGIC_ACTIONS, ACTION_GROUPS } from '../magicActions';

function MagicActions({ file, processing, onRun }) {
  const disabled = !file || !!processing;

  return (
    <div className="og-action-tiles">
      {ACTION_GROUPS.map(group => {
        const inGroup = MAGIC_ACTIONS.filter(a => a.group === group);
        if (inGroup.length === 0) return null;
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
                    data-tier={a.tier || 'primary'}
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
    </div>
  );
}

export default MagicActions;
