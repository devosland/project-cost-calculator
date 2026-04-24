/**
 * Weekly timesheet — Monday-to-Sunday grid with one row per task the caller
 * has logged against in the selected week. Cells show the summed hours,
 * click opens the TaskPanel so the user can add / edit time.
 *
 * Strategy: we fetch /actuals with the whole project scope is overkill here;
 * instead we re-use /tasks + listTime per task. To keep the query count
 * reasonable, we only list tasks currently assigned to the caller and fetch
 * their time entries. Owners see all tasks.
 *
 * The week selector defaults to the current week and has previous/next
 * controls. All hours are decimal (Decision 11).
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import { useLocale } from '../../lib/i18n';
import { executionApi } from '../../lib/executionApi';

/** Monday of the week containing `date`. */
function mondayOf(date) {
  const d = new Date(date);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toIso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function Timesheet({ projectId, resources, userLinkedResourceId, canEdit, onOpenTask }) {
  const { t, locale } = useLocale();
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [rows, setRows] = useState([]); // [{ task, byDay: { 'YYYY-MM-DD': totalHours } }]
  const [loading, setLoading] = useState(true);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEndIso = toIso(days[6]);
  const weekStartIso = toIso(days[0]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const filters = userLinkedResourceId ? { assignee: userLinkedResourceId } : {};
      const tasks = await executionApi.listTasks(projectId, filters);
      const enriched = await Promise.all(tasks.map(async (tk) => {
        const entries = await executionApi.listTime(tk.id);
        const byDay = {};
        for (const e of entries) {
          if (e.date < weekStartIso || e.date > weekEndIso) continue;
          byDay[e.date] = (byDay[e.date] || 0) + e.hours;
        }
        return { task: tk, byDay };
      }));
      // Only rows with at least one hour in the window, unless nothing logged.
      setRows(enriched.filter((r) => Object.keys(r.byDay).length > 0));
    } catch (err) {
      console.error('Timesheet load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, userLinkedResourceId, weekStartIso, weekEndIso]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function fmtDay(date) {
    const loc = locale === 'fr' ? 'fr-CA' : 'en-CA';
    return date.toLocaleDateString(loc, { weekday: 'short', day: 'numeric' });
  }
  function fmtLabel(date) {
    const loc = locale === 'fr' ? 'fr-CA' : 'en-CA';
    return date.toLocaleDateString(loc, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const rowTotals = rows.map((r) => Object.values(r.byDay).reduce((a, b) => a + b, 0));
  const dayTotals = days.map((d) => {
    const iso = toIso(d);
    return rows.reduce((acc, r) => acc + (r.byDay[iso] || 0), 0);
  });
  const grandTotal = rowTotals.reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-medium px-2">
          {fmtLabel(days[0])} — {fmtLabel(days[6])}
        </span>
        <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setWeekStart(mondayOf(new Date()))}>
          {t('work.today')}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left p-2 font-medium min-w-[200px]">{t('work.task')}</th>
              {days.map((d) => (
                <th key={toIso(d)} className="text-center p-2 font-medium w-20 capitalize">{fmtDay(d)}</th>
              ))}
              <th className="text-right p-2 font-medium w-20">{t('work.total')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.task.id}
                className="border-b border-border hover:bg-muted/30 cursor-pointer"
                onClick={() => onOpenTask?.(r.task.id)}
              >
                <td className="p-2">
                  <div className="font-mono text-[10px] text-muted-foreground">{r.task.key}</div>
                  <div className="truncate">{r.task.title}</div>
                </td>
                {days.map((d) => {
                  const v = r.byDay[toIso(d)];
                  return (
                    <td key={toIso(d)} className="text-center p-2 font-mono tabular-nums">
                      {v ? v.toFixed(2) : <span className="text-muted-foreground/40">—</span>}
                    </td>
                  );
                })}
                <td className="text-right p-2 font-mono tabular-nums font-semibold">{rowTotals[i].toFixed(2)}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-sm text-muted-foreground">
                  {t('work.emptyTimesheet')}
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border">
                <td className="p-2 text-right font-medium">{t('work.total')}</td>
                {dayTotals.map((v, idx) => (
                  <td key={idx} className="text-center p-2 font-mono tabular-nums font-semibold">
                    {v > 0 ? v.toFixed(2) : '—'}
                  </td>
                ))}
                <td className="text-right p-2 font-mono tabular-nums font-bold">{grandTotal.toFixed(2)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {loading && <p className="text-xs text-muted-foreground">{t('work.loading')}</p>}
    </div>
  );
}
