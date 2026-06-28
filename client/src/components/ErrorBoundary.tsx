/**
 * client/src/components/ErrorBoundary.tsx — React Error Boundary
 *
 * Catches JavaScript errors anywhere in its child component tree,
 * logs them, and displays a fallback UI instead of an unmounted component tree.
 *
 * WHY A CLASS COMPONENT?
 * React Error Boundaries require the lifecycle methods `componentDidCatch`
 * and `getDerivedStateFromError`. As of React 18, there is no hook-based
 * equivalent (useErrorBoundary is not part of React core). This is the
 * one place in the codebase where a class component is necessary.
 *
 * SCOPE: Error boundaries catch errors during:
 * - Rendering
 * - Lifecycle methods
 * - Constructors of child components
 *
 * They do NOT catch:
 * - Errors in event handlers (use try/catch there)
 * - Async errors (use try/catch or .catch())
 * - Errors in the error boundary itself
 */

import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Optional custom fallback — defaults to the built-in styled fallback */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  /**
   * Called during rendering when a child throws.
   * Returns the new state to render the fallback UI.
   * This is a static method because it must be a pure function of the error.
   */
  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message ?? 'An unknown error occurred.',
    };
  }

  /**
   * Called after rendering the fallback UI.
   * Use this to log the error to an error-reporting service (Sentry, Datadog).
   */
  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught render error:', error);
    console.error('[ErrorBoundary] Component stack:', info.componentStack);
    // In production: Sentry.captureException(error, { extra: info });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#060608',
          fontFamily: "'Courier New', monospace",
          padding: '2rem',
          textAlign: 'center',
        }}>
          <p style={{ color: '#ff0080', fontSize: '10px', letterSpacing: '5px', marginBottom: '16px' }}>
            SYSTEM ERROR
          </p>
          <h1 style={{ color: '#00f5ff', fontSize: '28px', marginBottom: '12px', letterSpacing: '2px' }}>
            FATAL EXCEPTION
          </h1>
          <p style={{ color: '#6b6b8a', fontSize: '13px', marginBottom: '8px', maxWidth: '480px', lineHeight: '1.7' }}>
            A render error was caught by the error boundary.
          </p>
          <p style={{
            color: '#ff6699',
            fontSize: '11px',
            background: 'rgba(255,0,128,0.05)',
            border: '1px solid rgba(255,0,128,0.2)',
            padding: '10px 16px',
            marginBottom: '28px',
            maxWidth: '480px',
            wordBreak: 'break-word',
          }}>
            {this.state.errorMessage}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, errorMessage: '' })}
            style={{
              background: 'transparent',
              border: '1px solid #00f5ff',
              color: '#00f5ff',
              padding: '10px 24px',
              fontSize: '11px',
              letterSpacing: '3px',
              cursor: 'pointer',
              textTransform: 'uppercase',
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
