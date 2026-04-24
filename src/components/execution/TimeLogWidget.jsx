/**
 * Time-log widget embedded in the TaskPanel. Lets the caller log new hours
 * on a task and shows a short list of past entries they can edit or delete.
 *
 * Decision 11 (decimal hours): the input is a plain number field and the
 * display is decimal with 2 fraction digits. No HH:MM entry.
 *
 * When the server rejects a write with 423 (period_closed), the error is
 * surfaced inline rather than through an alert — matches the Prism pattern
 * of showing server errors next to the offending field.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { useLocale } from '../../lib/i18n';
import { executionApi } from '../../lib/executionApi';

export default function TimeLogWidget({ taskId, canLog, onChanged }) {
  const { t, locale } = useLocale();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ date: today, hours: '', note: '' });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchEntries = useCallback(async () => {
    try {
      setLoading(true);
      const data = await executionApi.listTime(taskId);
      setEntries(data);
    } catch (err) {
      console.error('Load entries failed:', err);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    const hours = parseFloat(form.hours);
    if (!Number.isFinite(hours) || hours <= 0) {
      setError(t('time.invalidHours'));
      return;
    }
    try {
      setSaving(true);
      await executionApi.logTime(taskId, {
        date: form.date,
        hours,
        note: form.note || null,
      });
      setForm({ date: today, hours: '', note: '' });
      await fetchEntries();
      onChanged?.();
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.includes('period_closed')) setError(t('time.errPeriodClosed'));
      else if (msg.includes('future_date')) setError(t('time.errFutureDate'));
      else if (msg.includes('not_your_task') || msg.includes('unassigned_task_owner_only')) setError(t('time.errNotYours'));
      else setError(t('time.errGeneric'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    try {
      await executionApi.removeTime(id);
      await fetchEntries();
      onChanged?.();
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.includes('period_closed')) setError(t('time.errPeriodClosed'));
      else setError(t('time.errGeneric'));
    }
  }

  function fmtDate(iso) {
    const loc = locale === 'fr' ? 'fr-CA' : 'en-CA';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(loc, { month: 'short', day: 'numeric' });
  }

  return (
    <div className="space-y-3">
      {canLog && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-[auto_auto_1fr_auto] gap-2 items-end">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">{t('time.date')}</label>
            <input
              type="date"
              className="input-field text-sm"
              value={form.date}
              max={today}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">{t('time.hours')}</label>
            <input
              type="number"
              step="0.25"
              min="0.01"
              max="24"
              className="input-field text-sm w-24"
              value={form.hours}
              onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
              placeholder="1.5"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">{t('time.noteOptional')}</label>
            <input
              type="text"
              className="input-field text-sm w-full"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder={t('time.notePlaceholder')}
            />
          </div>
          <Button type="submit" size="sm" disabled={saving} className="flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" />
            {t('time.log')}
          </Button>
        </form>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}

      <div>
        {loading ? (
          <p className="text-xs text-muted-foreground">{t('time.loading')}</p>
        ) : entries.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">{t('time.noEntries')}</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-1.5 gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono tabular-nums w-14 text-right">{e.hours.toFixed(2)}h</span>
                  <span className="text-muted-foreground w-20">{fmtDate(e.date)}</span>
                  <span className="truncate text-xs text-muted-foreground">{e.note}</span>
                </div>
                {canLog && (
                  <button
                    type="button"
                    onClick={() => remove(e.id)}
                    title={t('time.remove')}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
