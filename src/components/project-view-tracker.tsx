'use client';
import { useEffect } from 'react';

/** A visible detail page, not a server GET or prefetched route, is a measured view. */
export function ProjectViewTracker({
  projectId,
  enabled,
}: {
  projectId: string;
  enabled: boolean;
}) {
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sent = false;
    const schedule = () => {
      clearTimeout(timer);
      if (sent || document.visibilityState !== 'visible') return;
      timer = setTimeout(() => {
        if (document.visibilityState !== 'visible') return;
        sent = true;
        void fetch('/api/platform', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'recordProjectView', projectId }),
          signal: controller.signal,
        })
          .then((response) => {
            if (!response.ok) console.warn('project_view_not_recorded', response.status);
          })
          .catch((error: unknown) => {
            if (!(error instanceof Error && error.name === 'AbortError'))
              console.warn('project_view_connection_failed');
          });
      }, 1000);
    };
    document.addEventListener('visibilitychange', schedule);
    schedule();
    return () => {
      clearTimeout(timer);
      controller.abort();
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [projectId, enabled]);
  return null;
}
