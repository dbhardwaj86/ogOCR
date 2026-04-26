function PromptDock({ value, onChange, onRun, processing, disabled }) {
  const isDisabled = !!processing || disabled;
  return (
    <div className="og-prompt">
      <div className="og-prompt-rail">
        <span className="og-prompt-glyph">⌁</span>
        <span className="og-prompt-label">Ask</span>
      </div>
      <textarea
        className="og-prompt-input"
        rows={1}
        placeholder={disabled ? 'Upload a document to ask Gemini.' : 'Ask Gemini anything about this document — translate, summarize, restructure…'}
        value={value}
        disabled={isDisabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isDisabled && value.trim()) onRun();
          }
        }}
      />
      <button
        className="og-prompt-run"
        disabled={isDisabled || !value.trim()}
        onClick={onRun}
      >
        <span>Run</span>
        <kbd className="og-kbd og-kbd-sm">↵</kbd>
      </button>
    </div>
  );
}

export default PromptDock;
