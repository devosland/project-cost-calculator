/**
 * Lightweight hash-based client-side router.
 *
 * WHY HASH ROUTING instead of the History API (pushState / React Router)?
 * The application is served from a Docker container with a simple Express
 * static file server. With the History API, refreshing or sharing a deep
 * link like /projects/abc123/timeline would produce a 404 because Express
 * only knows about /index.html. Hash-based routing (#/projects/abc123/timeline)
 * keeps the navigation segment entirely in the browser — the server always
 * receives a request for / and the client resolves the route from the hash.
 * This requires zero extra server configuration and works transparently behind
 * docker-compose port mapping, Nginx reverse proxies, and direct browser use.
 *
 * Supported routes:
 *   #/projects                → Dashboard
 *   #/projects/:id            → ProjectView (default: phases tab)
 *   #/projects/:id/:tab       → ProjectView with specific tab
 *   #/capacity                → CapacityView (default: gantt tab)
 *   #/capacity/:tab           → CapacityView with specific tab
 */
import { useState, useEffect, useCallback } from 'react';

/**
 * React hook that tracks the current URL hash and exposes a navigate helper.
 *
 * The hook listens to the native `hashchange` event so all components that
 * call `useHashRouter()` re-render synchronously when the route changes —
 * no separate router context or provider is needed.
 *
 * Parsing strategy: strips the leading `#/` or `#` prefix, then splits on `/`
 * to produce a segments array. An empty hash defaults to ['projects'] so the
 * Dashboard is the initial view when no hash is present.
 *
 * @returns {{
 *   segments: string[],  Array of path segments (e.g. ['projects', 'abc', 'budget'])
 *   path: string,        Joined path string (e.g. 'projects/abc/budget')
 *   navigate: Function   Push a new route (prepends '#/')
 * }}
 */
export function useHashRouter() {
  /** Parse window.location.hash into an array of path segments. */
  const getSegments = () => {
    const hash = window.location.hash.replace(/^#\/?/, '');
    return hash ? hash.split('/') : ['projects'];
  };

  const [segments, setSegments] = useState(getSegments);

  useEffect(() => {
    // Re-parse on every hash change (back/forward navigation, navigate() calls,
    // and any direct manipulation of the address bar).
    const handler = () => setSegments(getSegments());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  /**
   * Navigate to a new route by setting window.location.hash.
   * Triggers a `hashchange` event which the listener above picks up,
   * so state updates automatically — no manual setSegments call needed.
   *
   * @param {string} path - Route path without the '#/' prefix (e.g. 'capacity/gantt').
   */
  const navigate = useCallback((path) => {
    window.location.hash = '#/' + path;
  }, []);

  return { segments, navigate, path: segments.join('/') };
}
