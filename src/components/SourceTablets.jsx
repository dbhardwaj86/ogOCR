function SourceTablets({ session, imageDims }) {
  const tablets = [];
  if (imageDims) {
    tablets.push({ k: 'W×H', v: `${imageDims.w}×${imageDims.h}` });
  }
  const charCount = (session?.text || session?.svg || '').length;
  if (charCount > 0) {
    tablets.push({ k: 'CHARS', v: charCount.toLocaleString() });
  }
  if (tablets.length === 0) return null;
  return (
    <div className="og-tablets">
      {tablets.map(t => (
        <div className="og-tablet" key={t.k}>
          <div className="og-tablet-k">{t.k}</div>
          <div className="og-tablet-v">{t.v}</div>
        </div>
      ))}
    </div>
  );
}

export default SourceTablets;
