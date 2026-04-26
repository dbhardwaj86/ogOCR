function Toast({ message }) {
  if (!message) return null;
  return <div className="og-toast" role="status">{message}</div>;
}

export default Toast;
