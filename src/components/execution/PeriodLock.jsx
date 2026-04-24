/**
 * Accounting-period lock panel (Decision 8 of the execution module spec).
 *
 * Shows the past 12 months for a project, each row with its open/closed
 * status plus a toggle button. Closing a month freezes every
 * `time_entries` row dated in that month — POST / PUT / DELETE on any
 * entry with a matching date returns 423 Locked. Reopening lifts the lock.
 *
 * Permissions are enforced on the server (editor or owner only). On the
 * client we pass `canEdit` down from the caller, who has the project role
 * context; when false, the button is replaced by plain text.
 *
 * The rendered list is **authoritative** — it comes from
 * `GET /projects/:id/periods` which always returns exactly 12 rows
 * (current month + 11 prior), so the component never needs its own
 * date math.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Lock, Unlock, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { useLocale } from '../../lib/i18n';
import { executionApi } from '../../lib/executionApi';

/**
 * @param {object} props
 * @param {string} props.projectId
 * @param {boolean} props.canEdit  — caller's role is owner or editor.
 */
export default function PeriodLock({ projectId, canEdit }) {
  const { t, locale } = useLocale();
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // yyyyMM currently being toggled
  const [error, setError] = useState(null);

  const fetchPeriods = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await executionApi.listPeriods(projectId);
      setPeriods(data);
    } catch (err) {
      console.error('Failed to load periods:', err);
      setError(t('close.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [projectId, t]);

  useEffect(() => { fetchPeriods(); }, [fetchPeriods]);

  async function toggle(yyyyMM, isClosed) {
    if (busy) return;
    setBusy(yyyyMM);
    setError(null);
    try {
      if (isClosed) await executionApi.reopenPeriod(projectId, yyyyMM);
      else await executionApi.closePeriod(projectId, yyyyMM);
      await fetchPeriods();
    } catch (err) {
      console.error('Toggle period failed:', err);
      setError(t('close.toggleFailed'));
    } finally {
      setBusy(null);
    }
  }

  function formatMonth(yyyyMM) {
    const [y, m] = yyyyMM.split('-').map(Number);
    const loc = locale === 'fr' ? 'fr-CA' : 'en-CA';
    return new Date(y, m - 1, 1).toLocaleDateString(loc, { month: 'long', year: 'numeric' });
  }

  function formatClosedAt(iso) {
    if (!iso) return null;
    const loc = locale === 'fr' ? 'fr-CA' : 'en-CA';
    return new Date(iso).toLocaleDateString(loc, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  return (
    <section className="border border-border rounded-lg p-4 bg-card">
      <header className="mb-3">
        <h3 className="font-display font-semibold text-base tracking-tight">{t('close.title')}</h3>
        <p className="text-xs text-muted-foreground mt-1">{t('close.subtitle')}</p>
      </header>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive mb-3" role="alert">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">{t('close.loading')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {periods.map((p) => {
            const isClosed = !!p.closed_at;
            return (
              <li key={p.period} className="flex items-center justify-between py-2 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0"
                    style={{
                      backgroundColor: `color-mix(in srgb, var(--prism-${isClosed ? 'warning' : 'success'}) 18%, transparent)`,
                      color: `var(--prism-${isClosed ? 'warning' : 'success'})`,
                    }}
                  >
                    {isClosed ? t('close.closed') : t('close.open')}
                  </span>
                  <span className="font-medium text-sm capitalize">{formatMonth(p.period)}</span>
                  {isClosed && (
                    <span className="text-xs text-muted-foreground truncate">
                      {t('close.closedBy', { email: p.closed_by_email ?? '—', date: formatClosedAt(p.closed_at) ?? '' })}
                    </span>
                  )}
                </div>
                {canEdit ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy === p.period}
                    onClick={() => toggle(p.period, isClosed)}
                    className="shrink-0 flex items-center gap-1.5"
                  >
                    {isClosed ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                    {isClosed ? t('close.reopen') : t('close.close')}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
