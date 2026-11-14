import type { ReactNode } from 'react';

/**
 * One look for the three list states. Loading shows a spinner only if it takes longer than a
 * second, so quick loads do not flash; with reduced motion the text alone remains.
 */
export function LoadingNote({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="state-note state-loading">
      <span className="state-spinner" aria-hidden="true" />
      {children}
    </p>
  );
}

/** Nothing matched or nothing exists yet; the text should say what to do next. */
export function EmptyNote({ children, live = false }: { children: ReactNode; live?: boolean }) {
  return (
    <p role={live ? 'status' : undefined} className="state-note state-empty">
      {children}
    </p>
  );
}
