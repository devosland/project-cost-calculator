/**
 * Side panel that slides in from the right to show and edit a task.
 *
 * Fields are saved on blur (or Enter for text inputs, on change for selects)
 * so there is no Save button to click — matches the Prism pattern used for
 * phase / member editors. The panel fetches the latest task on open so it
 * never shows stale data even if the Board list was cached.
 *
 * Embeds the TimeLogWidget below the fields. The widget decides on its own
 * whether the caller can log (passed via canLog). The panel re-fetches the
 * parent list via `onSaved` after every mutation so totals and column
 * positions stay in sync.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/button';
import { useLocale } from '../../lib/i18n';
import { executionApi } from '../../lib/executionApi';
import TimeLogWidget from './TimeLogWidget';

export default function TaskPanel({ taskId, statuses, resources, canEdit, canLog, onClose, onSaved }) {
  const { t } = useLocale();
  const [task, setTask] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const fetchTask = useCallback(async () => {
    try {
      const data = await executionApi.getTask(taskId);
      setTask(data);
    } catch (err) {
      console.error('Load task failed:', err);
      setError(t('work.loadFailed'));
    }
  }, [taskId, t]);

  useEffect(() => { fetchTask(); }, [fetchTask]);

  async function patch(body) {
    if (!canEdit) return;
    try {
      setSaving(true);
      setError(null);
      const updated = await executionApi.updateTask(taskId, body);
      setTask(updated);
      onSaved?.();
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.includes('unknown_status')) setError(t('work.errUnknownStatus'));
      else setError(t('work.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function transition(to) {
    if (!canEdit) return;
    try {
      setSaving(true);
      setError(null);
      const updated = await executionApi.transitionTask(taskId, to);
      setTask(updated);
      onSaved?.();
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.includes('transition_not_allowed')) setError(t('work.errTransitionBlocked'));
      else setError(t('work.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" />
      <aside
        className="relative w-full sm:w-[540px] bg-card border-l border-border h-full overflow-y-auto shadow-xl"
        role="dialog"
        aria-label={t('work.taskDetails')}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between z-10">
          <span className="font-mono text-xs text-muted-foreground">{task ? task.key : '…'}</span>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-md"
            aria-label={t('work.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {!task ? (
          <div className="p-6 text-sm text-muted-foreground">{t('work.loading')}</div>
        ) : (
          <div className="p-4 space-y-5">
            {error && <div className="text-sm text-destructive">{error}</div>}

            <div>
              <label className="block text-xs text-muted-foreground mb-1">{t('work.title')}</label>
              <input
                type="text"
                className="input-field w-full font-medium"
                defaultValue={task.title}
                disabled={!canEdit || saving}
                onBlur={(e) => { if (e.target.value !== task.title) patch({ title: e.target.value }); }}
              />
            </div>

            <div>
              <label className="block text-xs text-muted-foreground mb-1">{t('work.description')}</label>
              <textarea
                className="input-field w-full text-sm"
                rows={4}
                defaultValue={task.description || ''}
                disabled={!canEdit || saving}
                onBlur={(e) => { if ((e.target.value || null) !== (task.description || null)) patch({ description: e.target.value || null }); }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">{t('work.status')}</label>
                <select
                  className="input-field w-full text-sm"
                  value={task.status}
                  disabled={!canEdit || saving}
                  onChange={(e) => transition(e.target.value)}
                >
                  {statuses.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">{t('work.priority')}</label>
                <select
                  className="input-field w-full text-sm"
                  value={task.priority}
                  disabled={!canEdit || saving}
                  onChange={(e) => patch({ priority: e.target.value })}
                >
                  {['low', 'medium', 'high', 'critical'].map((p) => (
                    <option key={p} value={p}>{t(`work.priority.${p}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">{t('work.assignee')}</label>
                <select
                  className="input-field w-full text-sm"
                  value={task.assignee_id ?? ''}
                  disabled={!canEdit || saving}
                  onChange={(e) => patch({ assignee_id: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">{t('work.unassigned')}</option>
                  {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">{t('work.estimate')}</label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  className="input-field w-full text-sm"
                  defaultValue={task.estimate_hours ?? ''}
                  disabled={!canEdit || saving}
                  onBlur={(e) => {
                    const v = e.target.value === '' ? null : parseFloat(e.target.value);
                    if (v !== task.estimate_hours) patch({ estimate_hours: v });
                  }}
                />
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <h4 className="text-sm font-semibold mb-2">{t('time.sectionTitle')}</h4>
              <TimeLogWidget taskId={task.id} canLog={canLog} onChanged={onSaved} />
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
