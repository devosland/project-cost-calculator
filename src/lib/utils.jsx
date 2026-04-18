/**
 * Shared UI utility helpers.
 * Currently exports a single `cn()` function for merging Tailwind class names.
 */
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Merge Tailwind CSS class names, resolving conflicts intelligently.
 *
 * Combines two libraries:
 * - `clsx` — conditionally joins class strings and arrays
 *   (e.g. cn('px-2', isActive && 'bg-blue-500') → 'px-2 bg-blue-500')
 * - `tailwind-merge` — deduplicates conflicting Tailwind utilities so the
 *   last value wins (e.g. cn('px-2', 'px-4') → 'px-4', not 'px-2 px-4').
 *
 * Without tailwind-merge, passing both 'px-2' and 'px-4' to className would
 * apply both rules and the winner would depend on stylesheet order — which is
 * non-deterministic in production builds. This wrapper makes override
 * semantics explicit and predictable.
 *
 * @param {...(string|string[]|Record<string,boolean>|null|undefined|false)} inputs
 *   Any value accepted by clsx: strings, arrays, objects, or falsy values.
 * @returns {string} Merged and deduplicated class name string.
 *
 * @example
 * cn('px-2 py-1', isActive && 'bg-blue-500')
 * cn('text-sm', props.className)          // safely merge parent overrides
 * cn('text-red-500', 'text-blue-500')     // → 'text-blue-500' (last wins)
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
