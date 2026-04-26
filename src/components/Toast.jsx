// Toast — small, transient surface for the registry's `surface: 'toast'` codes.
// `entry` is the registry entry (preferred). For free-form messages, callers
// can still pass a string `message` and it'll render as severity 'info'.

function Toast({ entry, message, onAction, onDismiss }) {
  if (!entry && !message) return null;
  const e = entry || { code: 'INFO', severity: 'info', message, hint: null };
  const severity = e.severity || 'info';

  return (
    <div
      className={`og-toast og-toast-${severity}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-code={e.code}
    >
      <div className="og-toast-body">
        <div className="og-toast-msg">{e.message}</div>
        {e.hint && <div className="og-toast-hint">{e.hint}</div>}
      </div>
      {(e.action || onAction) && (
        <button
          type="button"
          className="og-toast-action"
          onClick={() => onAction && onAction(e)}
        >
          {e.action?.label || 'Retry'}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          className="og-toast-dismiss"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          ×
        </button>
      )}
    </div>
  );
}

export default Toast;
