/**
 * Lightweight Suspense fallback shown while a lazily-loaded view chunk
 * downloads. Intentionally dependency-free and text-free (only an sr-only
 * label) so it can never itself fail or need a translation lookup. Uses the
 * Prism design tokens to stay visually consistent across split points.
 */
export default function FallbackSpinner() {
  return (
    <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
      <div className="w-5 h-5 rounded-full border-2 border-muted border-t-primary animate-spin" />
      <span className="sr-only">Chargement…</span>
    </div>
  );
}
