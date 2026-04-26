const PANES = [
  { id: 'library', num: '01', label: 'Library' },
  { id: 'source',  num: '02', label: 'Source'  },
  { id: 'output',  num: '03', label: 'Output'  },
];

function MobileTabs({ pane, onChange }) {
  return (
    <nav className="og-mobile-tabs" role="tablist" aria-label="Mobile pane">
      {PANES.map(p => (
        <button
          key={p.id}
          role="tab"
          type="button"
          aria-selected={pane === p.id}
          className={`og-mobile-tab${pane === p.id ? ' is-active' : ''}`}
          onClick={() => onChange(p.id)}
        >
          <span className="og-mobile-tab-num">{p.num}</span>
          <span className="og-mobile-tab-label">{p.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default MobileTabs;
