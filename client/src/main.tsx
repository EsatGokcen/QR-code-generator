/**
 * client/src/main.tsx — React Application Bootstrap
 *
 * Entry point for the React application. Renders the root <App> into
 * the #root div defined in index.html.
 *
 * React 18's createRoot() API enables concurrent rendering features
 * (Suspense, automatic batching, transitions). It replaces the old
 * ReactDOM.render() which is removed in React 19.
 *
 * StrictMode intentionally renders components twice in development to
 * surface side effects caused by non-pure render functions. It has no
 * effect in production builds.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html. Check your HTML file.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
