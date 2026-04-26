import { Component } from 'react';
import { showError } from '../errors/showError';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
    showError('OCR_INTERNAL', {
      message: 'A panel crashed.',
      hint: error?.message ? error.message.slice(0, 200) : 'Open diagnostics for details.',
    });
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      const { fallback } = this.props;
      if (fallback) return fallback(this.state.error, this.handleReset);
      return (
        <div className="og-error-fallback" role="alert">
          <div className="og-error-fallback-msg">Something went wrong rendering this panel.</div>
          <div className="og-error-fallback-hint">{this.state.error.message}</div>
          <button type="button" className="og-export-btn" onClick={this.handleReset}>Reset panel</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
