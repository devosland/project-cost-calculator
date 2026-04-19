/**
 * useFocusTrap — a11y hook for custom modals that aren't backed by Radix.
 *
 * When `active` is true, the hook :
 *   1. Captures the element that had focus immediately before activation
 *      so it can be restored on deactivation.
 *   2. Moves focus to the first tabbable descendant of the ref'd element
 *      (or to the container itself if no tabbable is found).
 *   3. Intercepts Tab / Shift+Tab to wrap focus within the container —
 *      Tab at the last element loops to the first, Shift+Tab at the first
 *      loops to the last.
 *   4. On deactivation (unmount or `active` → false), restores focus to
 *      the previously-focused element if it's still in the DOM.
 *
 * Usage :
 *   const ref = useFocusTrap(isOpen);
 *   return isOpen ? <div ref={ref} role="dialog" aria-modal="true">…</div> : null;
 *
 * Why not Radix : our custom modals (QuickTransition etc.) don't sit behind
 * @radix-ui/react-dialog and pulling it in adds another ~20KB gzip. This
 * hook gives us the critical focus behaviour in ~40 lines with zero deps.
 *
 * Caveats :
 *   - Doesn't compute visibility (hidden/display:none descendants); the
 *     Tab order is limited to elements that match a static focusable selector.
 *     Good enough for the modals in this app; Radix uses `tabbable` which
 *     does full visibility computation.
 *   - Doesn't handle dynamic content mutations inside the modal — if
 *     tabbables are added/removed while the trap is active, the wrap-around
 *     logic re-queries on every Tab keypress, so it picks up changes.
 */
import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * @param {boolean} active - Whether the focus trap is currently engaged.
 * @returns {React.MutableRefObject<HTMLElement|null>} Attach to the modal root element.
 */
export function useFocusTrap(active) {
  const containerRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    // Step 1 : remember where focus was so we can restore it.
    previouslyFocusedRef.current = document.activeElement;

    // Step 2 : move focus inside the modal. Query is deferred by one frame
    // to let any conditional children mount first.
    const focusFirst = () => {
      const tabbables = container.querySelectorAll(FOCUSABLE_SELECTOR);
      if (tabbables.length > 0) {
        tabbables[0].focus();
      } else {
        // Fall back to focusing the container itself (e.g. via tabindex=-1
        // on the root) so Escape / Tab still target the modal.
        container.focus();
      }
    };
    const timer = setTimeout(focusFirst, 0);

    // Step 3 : intercept Tab / Shift+Tab to wrap within container.
    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const tabbables = container.querySelectorAll(FOCUSABLE_SELECTOR);
      if (tabbables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = tabbables[0];
      const last = tabbables[tabbables.length - 1];
      // If focus is outside the container entirely (rare but possible with
      // async content), snap it to the first tabbable.
      if (!container.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      // Step 4 : restore focus if the previously-focused element is still
      // in the DOM (user may have navigated away mid-modal).
      const previous = previouslyFocusedRef.current;
      if (previous && document.contains(previous) && typeof previous.focus === 'function') {
        previous.focus();
      }
    };
  }, [active]);

  return containerRef;
}
