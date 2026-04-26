function SourceDoc({ value, onChange, disabled }) {
  return (
    <textarea
      className="og-source-doc"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      spellCheck={false}
      placeholder="Source / SVG — edit freely. Saved into the active session as you type."
    />
  );
}

export default SourceDoc;
