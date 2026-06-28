/**
 * client/src/App.tsx — Root Application Component
 *
 * Wraps the entire UI tree in an ErrorBoundary so that any uncaught
 * render error deep in the component tree is caught here rather than
 * crashing the blank white screen the browser default gives.
 *
 * WHY A CLASS COMPONENT FOR ERROR BOUNDARY?
 * As of React 18, there is no hook equivalent for componentDidCatch.
 * Error boundaries must be class components — this is a known React
 * limitation. The ErrorBoundary class is isolated; everything else in
 * the codebase uses function components and hooks.
 */

import ErrorBoundary from './components/ErrorBoundary';
import LandingPage from './components/LandingPage';

export default function App() {
  return (
    <ErrorBoundary>
      <LandingPage />
    </ErrorBoundary>
  );
}
