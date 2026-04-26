function InlineError({ entry, onRetry, onDismiss, actions }) {
  if (!entry) return null;
  const { code, severity, message, hint } = entry;
  return (
    <div
      className={`og-inline-error og-inline-error-${severity || 'error'}`}
      role="alert"
      aria-live="polite"
      data-code={code}
    >
      <div className="og-inline-error-body">
        <div className="og-inline-error-msg">{message}</div>
        {hint && <div className="og-inline-error-hint">{hint}</div>}
      </div>
      <div className="og-inline-error-actions">
        {onRetry && (
          <button type="button" className="og-inline-error-btn og-inline-error-btn-primary" onClick={onRetry}>
            Try again
          </button>
        )}
        {Array.isArray(actions) && actions.map((a) => (
          <button key={a.label} type="button" className="og-inline-error-btn" onClick={a.onClick}>
            {a.label}
          </button>
        ))}
        {onDismiss && (
          <button type="button" className="og-inline-error-btn og-inline-error-btn-ghost" onClick={onDismiss} aria-label="Dismiss">
            ×
          </button>
        )}
      </div>
    </div>
  );
}

export default InlineError;
