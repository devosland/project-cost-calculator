/**
 * AvailabilityGrid — éditeur de disponibilité mensuelle (chantier A).
 *
 * Grille ressources (lignes) × 12 mois (colonnes). Chaque cellule édite la
 * disponibilité % de la ressource pour ce mois. Une cellule vide = capacité de
 * base (resources.max_capacity) : aucun override stocké. Saisir la valeur de
 * base efface l'override côté serveur.
 *
 * Source de vérité : la table resource_availability (overrides uniquement).
 * Le composant recharge la liste renvoyée par PUT après chaque sauvegarde.
 */
import { useEffect, useState, useMemo } from 'react';
import { capacityApi } from '../lib/capacityApi';
import { getMonthRange, getMonthlyCapacity, addMonths } from '../lib/capacityCalculations';
import { useLocale } from '../lib/i18n';

/** Mois courant au format YYYY-MM (fenêtre glissante de 12 mois, comme le Gantt). */
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const AvailabilityGrid = () => {
  const { t } = useLocale();
  const [resources, setResources] = useState([]);
  const [overrides, setOverrides] = useState([]);

  const startMonth = useMemo(() => currentMonth(), []);
  const months = useMemo(() => getMonthRange(startMonth, addMonths(startMonth, 11)), [startMonth]);

  useEffect(() => {
    capacityApi.getResources().then((d) => setResources(Array.isArray(d) ? d : [])).catch(() => {});
    capacityApi.getAvailability().then((d) => setOverrides(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  /** Persiste une cellule au blur si la valeur a changé. */
  async function handleCommit(resource, month, raw) {
    const base = resource.max_capacity ?? 100;
    // Vide → revenir à la base ; sinon clamp 0..100.
    let pct = raw === '' ? base : Math.max(0, Math.min(100, parseInt(raw, 10)));
    if (Number.isNaN(pct)) pct = base;
    const current = getMonthlyCapacity(resource.id, month, overrides, base);
    if (pct === current) return; // pas de changement → pas d'appel réseau
    try {
      const updated = await capacityApi.saveAvailability([
        { resource_id: resource.id, month, available_pct: pct },
      ]);
      setOverrides(Array.isArray(updated) ? updated : []);
    } catch {
      /* fix-forward : en cas d'échec on garde l'état précédent */
    }
  }

  if (resources.length === 0) {
    return (
      <div className="text-sm text-muted-foreground border border-border rounded-lg p-6 bg-card">
        {t('capacity.availabilityHint')}
      </div>
    );
  }

  const gridCols = `minmax(140px, 1.4fr) repeat(${months.length}, minmax(56px, 1fr))`;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-display text-xl font-semibold tracking-tight">{t('capacity.availabilityTitle')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('capacity.availabilityHint')}</p>
      </div>

      <div className="overflow-x-auto border border-border rounded-lg bg-card">
        <div style={{ display: 'grid', gridTemplateColumns: gridCols }} className="min-w-max">
          {/* En-tête */}
          <div className="sticky left-0 bg-card z-10 border-b border-r border-border px-3 py-2 text-xs font-medium text-muted-foreground">
            {t('capacity.baseCapacity')}
          </div>
          {months.map((m) => (
            <div key={m} className="border-b border-border px-1 py-2 text-center text-xs font-medium text-muted-foreground font-mono tabular-nums">
              {m.slice(2)}
            </div>
          ))}

          {/* Lignes ressources */}
          {resources.map((r) => {
            const base = r.max_capacity ?? 100;
            return (
              <div key={r.id} className="contents">
                <div className="sticky left-0 bg-card z-10 border-b border-r border-border px-3 py-2 text-sm flex items-center justify-between gap-2">
                  <span className="truncate">{r.name}</span>
                  <span className="text-xs text-muted-foreground font-mono tabular-nums">{base}%</span>
                </div>
                {months.map((m) => {
                  const override = overrides.find(
                    (o) => String(o.resource_id) === String(r.id) && o.month === m
                  );
                  const hasOverride = override !== undefined;
                  return (
                    <div key={m} className="border-b border-border p-0.5">
                      <input
                        key={hasOverride ? `set-${override.available_pct}` : 'base'}
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={hasOverride ? override.available_pct : ''}
                        placeholder={String(base)}
                        aria-label={`${r.name} ${m}`}
                        onBlur={(e) => handleCommit(r, m, e.target.value)}
                        className={`w-full text-center text-sm rounded-md py-1 font-mono tabular-nums bg-background border ${
                          hasOverride ? 'border-border text-foreground' : 'border-transparent text-muted-foreground'
                        } focus:border-primary focus:outline-none`}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AvailabilityGrid;
