/**
 * CapacityLoadGrid — heatmap capacité vs demande (chantier B).
 *
 * Grille ressources (lignes) × 12 mois (colonnes). Chaque cellule montre la
 * capacité RESTANTE du mois (capacité − demande), codée couleur via
 * capacityStatus (vert = marge, ambre = proche, rouge = surcharge). Une ligne
 * « Pool » agrège le restant de tout le pool. Lecture seule.
 *
 * Front-only : la demande vient des assignations cross-projets (/capacity/gantt),
 * la capacité de resources.max_capacity + overrides (/capacity/availability).
 */
import { useEffect, useState, useMemo } from 'react';
import { capacityApi } from '../lib/capacityApi';
import {
  getMonthRange,
  addMonths,
  calculateUtilization,
  getMonthlyCapacity,
  capacityStatus,
} from '../lib/capacityCalculations';
import { useLocale } from '../lib/i18n';

/** Mois courant au format YYYY-MM (fenêtre glissante de 12 mois, comme le Gantt). */
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const CapacityLoadGrid = () => {
  const { t } = useLocale();
  const [resources, setResources] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [overrides, setOverrides] = useState([]);

  const startMonth = useMemo(() => currentMonth(), []);
  const endMonth = useMemo(() => addMonths(startMonth, 11), [startMonth]);
  const months = useMemo(() => getMonthRange(startMonth, endMonth), [startMonth, endMonth]);

  useEffect(() => {
    capacityApi
      .getGanttData(startMonth, endMonth)
      .then((d) => {
        setResources(Array.isArray(d?.resources) ? d.resources : []);
        setAssignments(Array.isArray(d?.assignments) ? d.assignments : []);
      })
      .catch(() => {});
    capacityApi
      .getAvailability()
      .then((d) => setOverrides(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [startMonth, endMonth]);

  /** Rend une cellule colorée à partir de la capacité et de la demande du mois. */
  const renderCell = (capacity, demand, ariaBase) => {
    const remaining = capacity - demand;
    const token = `--prism-${capacityStatus(demand, capacity)}`;
    const title = `${t('capacity.title')} ${capacity}% · ${t('capacity.demand')} ${demand}% · ${t('capacity.remaining')} ${remaining}%`;
    return (
      <div
        title={title}
        aria-label={`${ariaBase} — ${title}`}
        className="rounded-md text-xs font-semibold flex items-center justify-center min-h-[28px] font-mono tabular-nums"
        style={{
          backgroundColor: `color-mix(in srgb, var(${token}) 15%, transparent)`,
          color: `var(${token})`,
        }}
      >
        {remaining > 0 ? `+${remaining}` : remaining}
      </div>
    );
  };

  if (resources.length === 0) {
    return (
      <div className="text-sm text-muted-foreground border border-border rounded-lg p-6 bg-card">
        {t('capacity.loadHint')}
      </div>
    );
  }

  const gridCols = `minmax(140px, 1.4fr) repeat(${months.length}, minmax(56px, 1fr))`;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-display text-xl font-semibold tracking-tight">{t('capacity.loadTitle')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('capacity.loadHint')}</p>
      </div>

      <div className="overflow-x-auto border border-border rounded-lg bg-card">
        <div style={{ display: 'grid', gridTemplateColumns: gridCols }} className="min-w-max">
          {/* En-tête */}
          <div className="sticky left-0 bg-card z-10 border-b border-r border-border px-3 py-2 text-xs font-medium text-muted-foreground">
            {t('capacity.remaining')}
          </div>
          {months.map((m) => (
            <div
              key={m}
              className="border-b border-border px-1 py-2 text-center text-xs font-medium text-muted-foreground font-mono tabular-nums"
            >
              {m.slice(2)}
            </div>
          ))}

          {/* Lignes ressources */}
          {resources.map((r) => {
            const base = r.max_capacity ?? 100;
            return (
              <div key={r.id} className="contents">
                <div className="sticky left-0 bg-card z-10 border-b border-r border-border px-3 py-2 text-sm truncate">
                  {r.name}
                </div>
                {months.map((m) => {
                  const capacity = getMonthlyCapacity(r.id, m, overrides, base);
                  const demand = calculateUtilization(assignments, r.id, m);
                  return (
                    <div key={m} className="border-b border-border p-0.5">
                      {renderCell(capacity, demand, `${r.name} ${m}`)}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Ligne Pool (total) */}
          <div className="contents">
            <div className="sticky left-0 bg-card z-10 border-r border-border px-3 py-2 text-sm font-semibold">
              {t('capacity.poolTotal')}
            </div>
            {months.map((m) => {
              const totalCap = resources.reduce(
                (s, r) => s + getMonthlyCapacity(r.id, m, overrides, r.max_capacity ?? 100),
                0
              );
              const totalDem = resources.reduce((s, r) => s + calculateUtilization(assignments, r.id, m), 0);
              return (
                <div key={m} className="p-0.5">
                  {renderCell(totalCap, totalDem, `${t('capacity.poolTotal')} ${m}`)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CapacityLoadGrid;
