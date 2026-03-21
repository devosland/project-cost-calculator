import { useState, useEffect, useCallback } from 'react';

/**
 * Lightweight hash-based router.
 *
 * Routes:
 *   #/projects                → Dashboard
 *   #/projects/:id            → ProjectView (phases tab)
 *   #/projects/:id/:tab       → ProjectView with specific tab
 *   #/capacity                → CapacityView (gantt tab)
 *   #/capacity/:tab           → CapacityView with specific tab
 *
 * Returns { path, segments, navigate }
 */
export function useHashRouter() {
  const getSegments = () => {
    const hash = window.location.hash.replace(/^#\/?/, '');
    return hash ? hash.split('/') : ['projects'];
  };

  const [segments, setSegments] = useState(getSegments);

  useEffect(() => {
    const handler = () => setSegments(getSegments());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const navigate = useCallback((path) => {
    window.location.hash = '#/' + path;
  }, []);

  return { segments, navigate, path: segments.join('/') };
}
