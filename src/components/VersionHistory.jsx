/**
 * Slide-in right-panel for project version history (snapshots). Allows the
 * user to create a labelled snapshot of the current project state and restore
 * any previous snapshot. The panel uses a CSS transform slide animation rather
 * than conditional rendering so it can animate in and out smoothly. Snapshots
 * are fetched by the parent (App) before opening and passed in via props.
 */
import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { X, History, RotateCcw, Save } from 'lucide-react';
import { useLocale, getDateLocale } from '../lib/i18n';
import { useFocusTrap } from '../lib/useFocusTrap';

/**
 * @param {Object} props
 * @param {boolean} props.open - Whether the panel is visible (drives CSS transform).
 * @param {function(): void} props.onClose - Close the panel.
 * @param {Array<{id: string, label: string, created_at: string}>} props.snapshots
 *   Existing snapshots for the active project, newest first.
 * @param {function(string|undefined): void} props.onCreateSnapshot - Create a
 *   new snapshot with an optional label.
 * @param {function(string): void} props.onRestoreSnapshot - Restore a snapshot
 *   by ID and close the panel.
 */
const VersionHistory = ({ open, onClose, snapshots, onCreateSnapshot, onRestoreSnapshot }) => {
  const { t, locale } = useLocale();
  const [label, setLabel] = useState('');
  // Focus-trap is tied to `open` : the panel is always mounted (drives CSS
  // slide animation) but the trap should only engage while visible.
  const trapRef = useFocusTrap(open);

  // Escape to close (only while open).
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleCreate = () => {
    onCreateSnapshot(label.trim() || undefined);
    setLabel('');
  };

  const formatDate = (dateStr) => {
    const dl = getDateLocale(locale);
    const d = new Date(dateStr);
    return `${d.toLocaleDateString(dl)} ${d.toLocaleTimeString(dl)}`;
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="version-history-title"
        aria-hidden={!open}
        tabIndex={-1}
        className={`fixed right-0 top-0 bottom-0 w-80 sm:w-96 bg-card border-l border-border shadow-lg z-50 transform transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5" />
              <h2 id="version-history-title" className="font-display text-lg font-semibold tracking-tight">
                {t('history.title')}
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label={t('nonLabour.cancel')}
              className="p-1 rounded-md hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Create Snapshot */}
          <div className="p-4 border-b border-border space-y-3">
            <input
              type="text"
              className="input-field w-full"
              placeholder={t('history.labelPlaceholder')}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <Button variant="default" size="sm" className="w-full" onClick={handleCreate}>
              <Save className="w-4 h-4 mr-2" />
              {t('history.createSnapshot')}
            </Button>
          </div>

          {/* Snapshots List */}
          <div className="flex-1 overflow-y-auto p-4">
            {(!snapshots || snapshots.length === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t('history.noSnapshots')}
              </p>
            ) : (
              <div className="space-y-3">
                {snapshots.map((snapshot) => (
                  <div
                    key={snapshot.id}
                    className="p-3 rounded-md border border-border bg-background"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {snapshot.label || 'Auto-save'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDate(snapshot.created_at)}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onRestoreSnapshot(snapshot.id)}
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                        {t('history.restore')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default VersionHistory;
