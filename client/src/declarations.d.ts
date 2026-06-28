/**
 * Type declaration for CSS Modules.
 *
 * TypeScript doesn't know what `import s from './Component.module.css'` returns.
 * This declaration tells it: treat every .module.css import as an object whose
 * keys are strings (class names) and values are strings (the scoped class names
 * that Vite generates at build time, e.g. 'LandingPage_page__x4kQz').
 */
declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}
