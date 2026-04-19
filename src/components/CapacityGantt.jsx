/**
 * Gantt 12 mois pour la vue capacité : affichage des assignments par ressource,
 * groupés par projet (vue "By Project") ou par type employé/consultant (vue "By Type").
 *
 * Architecture nested grids : chaque ressource est rendue dans sa propre grille CSS
 * avec la même définition de colonnes que la grille parente — ce sont des grilles
 * indépendantes plutôt qu'une grille flat, car une grille plate nécessiterait des
 * divs vides pour remplir les colonnes sans bar, créant des lignes fantômes en trop.
 *
 * refreshKey pattern : le composant refetch les données via capacityApi à chaque
 * changement de [startMonth, endMonth]. Le parent incrémente une prop refreshKey
 * (ou change la plage) pour forcer un re-fetch après un save ou une transition.
 *
 * Preview mode : when previewPlanId is set, the Gantt fetches the draft plan,
 * runs projectAssignmentsWithPlan() client-side, and renders both current (solid)
 * and projected (hatched) bars side-by-side. A dismissable banner identifies the
 * preview state. A "Show current state" toggle hides the solid bars for a cleaner
 * projected-only view.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from './ui/button';
import { useLocale } from '../lib/i18n';
import { capacityApi } from '../lib/capacityApi';
import { getMonthRange, calculateUtilization, projectAssignmentsWithPlan } from '../lib/capacityCalculations';
import GanttBar from './GanttBar';
import UtilizationSummary from './UtilizationSummary';
import QuickTransition from './QuickTransition';

/** Palette de couleurs cyclique pour distinguer les projets dans la vue "By Project". */
const PROJECT_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444',
  '#06b6d4', '#f97316', '#8b5cf6', '#14b8a6',
];

/**
 * Ajoute `count` mois à une chaîne 'YYYY-MM' et retourne la nouvelle chaîne 'YYYY-MM'.
 * Gère correctement les débordements d'année (ex: 2024-12 + 1 = 2025-01).
 *
 * @param {string} ym - Mois source au format 'YYYY-MM'
 * @param {number} count - Nombre de mois à ajouter (négatif pour soustraire)
 * @returns {string} Nouveau mois au format 'YYYY-MM'
 */
function addMonths(ym, count) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + count, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Returns the month immediately after `ym` (YYYY-MM).
 * Used to compute the start of the "removed" red segment:
 * since end_month is inclusive in getBarProps, the removed portion starts
 * at the month AFTER newEndMonth.
 *
 * @param {string} ym - Month in YYYY-MM format.
 * @returns {string} Following month in YYYY-MM format.
 */
function nextMonth(ym) {
  return addMonths(ym, 1);
}

/**
 * Gantt de capacité sur 12 mois glissants.
 *
 * Affiche les ressources du pool et leurs assignments projet sur une fenêtre
 * de 12 mois navigable. Deux modes de grouping : par projet ou par type
 * (Employés internes / Consultants). Chaque barre consultant est cliquable
 * pour ouvrir QuickTransition.
 *
 * @param {object}        props
 * @param {object}        props.rates          - Rates enterprise (INTERNAL_RATE, CONSULTANT_RATES).
 * @param {number}       [props.refreshKey]    - Increment to force re-fetch after external save/transition.
 * @param {number|string}[props.previewPlanId] - ID of a draft plan to visualise in preview mode.
 *   When set, the Gantt overlays projected bars (hatched) on top of current bars (solid).
 * @param {function}     [props.onExitPreview] - Callback to clear the preview selection.
 */
const CapacityGantt = ({ rates, previewPlanId, onExitPreview = () => {} }) => {
  const { t, locale } = useLocale();
  const [viewMode, setViewMode] = useState('project');
  const now = new Date();
  const [startMonth, setStartMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  );
  const [data, setData] = useState({ resources: [], assignments: [] });
  const [collapsed, setCollapsed] = useState({});
  const [quickTransition, setQuickTransition] = useState(null);

  // Preview mode state
  const [previewPlan, setPreviewPlan] = useState(null);   // full plan object once fetched
  const [previewError, setPreviewError] = useState(false);
  const [showCurrent, setShowCurrent] = useState(true);   // toggle: render solid current bars

  // endMonth = toujours 11 mois après startMonth → fenêtre fixe de 12 mois
  const endMonth = useMemo(() => addMonths(startMonth, 11), [startMonth]);
  const months = useMemo(() => getMonthRange(startMonth, endMonth), [startMonth, endMonth]);

  // Re-fetch à chaque changement de fenêtre temporelle.
  // Le parent peut aussi forcer ce fetch en changeant startMonth via refreshKey (pattern externe).
  useEffect(() => {
    capacityApi.getGanttData(startMonth, endMonth).then(setData).catch(() => {});
  }, [startMonth, endMonth]);

  // Fetch the draft plan whenever previewPlanId changes.
  useEffect(() => {
    if (!previewPlanId) {
      setPreviewPlan(null);
      setPreviewError(false);
      return;
    }
    // Clear stale data immediately so the banner never shows a wrong plan name.
    setPreviewPlan(null);
    setPreviewError(false);
    let cancelled = false;
    const requestedId = previewPlanId;
    capacityApi.getTransitionPlan(previewPlanId)
      .then((plan) => {
        // Guard against out-of-order responses: discard if the user has already
        // switched to a different plan or if the effect was cleaned up.
        if (cancelled || requestedId !== previewPlanId) return;
        setPreviewPlan(plan);
      })
      .catch(() => {
        if (cancelled) return;
        setPreviewError(true);
        setPreviewPlan(null);
      });
    return () => { cancelled = true; };
  }, [previewPlanId]);

  // Compute projected assignments + diff changes when preview plan is loaded.
  const previewResult = useMemo(() => {
    if (!previewPlan || !data.assignments.length) return null;
    return projectAssignmentsWithPlan(data.assignments, previewPlan);
  }, [previewPlan, data.assignments]);

  const { resources, assignments } = data;

  const toggleCollapse = (key) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  /**
   * Formate un mois 'YYYY-MM' en abréviation localisée (ex: "jan.", "Feb").
   * Utilise 'fr-CA' ou 'en-CA' selon la locale active.
   */
  const formatMonth = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1).toLocaleDateString(locale === 'fr' ? 'fr-CA' : 'en-CA', {
      month: 'short',
    });
  };

  /**
   * Map projet_id → couleur hex (cyclique sur PROJECT_COLORS).
   * Recalculé seulement quand la liste des assignments change.
   */
  const projectColorMap = useMemo(() => {
    const map = {};
    const projectIds = [...new Set(assignments.map((a) => a.project_id))];
    projectIds.forEach((id, i) => {
      map[id] = PROJECT_COLORS[i % PROJECT_COLORS.length];
    });
    return map;
  }, [assignments]);

  /** Map projet_id → nom du projet, extrait des assignments (dénormalisé par l'API). */
  const projectNameMap = useMemo(() => {
    const map = {};
    assignments.forEach((a) => {
      if (a.project_name) map[a.project_id] = a.project_name;
    });
    return map;
  }, [assignments]);

  if (!resources.length && !assignments.length) {
    return (
      <div className="text-center text-muted-foreground py-12">
        {t('capacity.noData')}
      </div>
    );
  }

  // Première colonne = 200px (nom ressource), puis 1 colonne par mois (12 mois = 12 fr)
  const gridCols = `200px repeat(${months.length}, 1fr)`;

  /**
   * Calcule les propriétés CSS grid d'une barre d'assignment.
   *
   * Gère le clipping : un assignment qui déborde de la fenêtre visible est
   * tronqué au premier/dernier mois affiché. Retourne null si l'assignment
   * est entièrement hors de la fenêtre.
   *
   * @param {object} assignment - Assignment avec start_month et end_month
   * @returns {{ colStart: number, colSpan: number } | null}
   */
  const getBarProps = (assignment) => {
    const startIdx = months.indexOf(assignment.start_month < startMonth ? startMonth : assignment.start_month);
    const endIdx = months.indexOf(assignment.end_month > endMonth ? endMonth : assignment.end_month);
    if (startIdx === -1 || endIdx === -1) return null;
    return {
      colStart: startIdx + 2, // +2 because grid col 1 is the name column (CSS grid is 1-based)
      colSpan: endIdx - startIdx + 1,
    };
  };

  /**
   * Inline style for hatched preview bars.
   * - red   (#ef4444) : consultant assignment that was shortened
   * - green (#10b981) : new replacement assignment
   * - yellow (#f59e0b): overlap window (consultant + replacement coexist)
   */
  const hatchStyle = (color) => ({
    background: `repeating-linear-gradient(
      45deg,
      ${color}55,
      ${color}55 4px,
      ${color}22 4px,
      ${color}22 8px
    )`,
    border: `1.5px dashed ${color}`,
    borderRadius: '4px',
  });

  /**
   * Renders hatched overlay bars for a single resource assignment in preview mode.
   * Checks the `changes` object to determine which color to apply:
   *   - shortened (red) for the removed portion of a consultant's assignment
   *   - added (green) for a new replacement bar
   *   - overlap (yellow) for the window where both coexist
   *
   * @param {object} bar      - Assignment (may be a temp/projected one from previewResult)
   * @param {object} changes  - { shortened, added } from projectAssignmentsWithPlan
   * @param {string} label    - Tooltip label text
   */
  const renderPreviewBar = (bar, changes, label) => {
    const shortenedEntry = changes.shortened.find((s) => s.id === bar.id);
    const addedEntry = changes.added.find((a) => a.id === bar.id);

    const bars = [];

    if (shortenedEntry) {
      // Render the "removed" portion in red hatching.
      // end_month is inclusive in getBarProps, so the removed segment starts at
      // the month AFTER newEndMonth. Skip entirely when newEndMonth === originalEndMonth
      // (nothing was removed — e.g. transition without overlap extending past original end).
      if (shortenedEntry.newEndMonth !== shortenedEntry.originalEndMonth) {
        const removedBar = {
          ...bar,
          start_month: nextMonth(shortenedEntry.newEndMonth),
          end_month: shortenedEntry.originalEndMonth,
        };
        const props = getBarProps(removedBar);
        if (props) {
          bars.push(
            <div
              key={`shortened-${bar.id}`}
              style={{
                gridColumnStart: props.colStart,
                gridColumnEnd: `span ${props.colSpan}`,
                ...hatchStyle('#ef4444'),
                height: '22px',
                margin: '1px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
                color: '#ef4444',
                overflow: 'hidden',
              }}
              title={`${label} — ${t('capacity.previewMode.tooltipShortened')}`}
            />
          );
        }
      }

      // Render the overlap window in yellow hatching
      if (shortenedEntry.overlapStart && shortenedEntry.overlapEnd && shortenedEntry.overlapStart < shortenedEntry.overlapEnd) {
        const overlapBar = { ...bar, start_month: shortenedEntry.overlapStart, end_month: shortenedEntry.overlapEnd };
        const op = getBarProps(overlapBar);
        if (op) {
          bars.push(
            <div
              key={`overlap-${bar.id}`}
              style={{
                gridColumnStart: op.colStart,
                gridColumnEnd: `span ${op.colSpan}`,
                ...hatchStyle('#f59e0b'),
                height: '22px',
                margin: '1px 0',
                opacity: 0.7,
              }}
              title={t('capacity.previewMode.tooltipOverlap')}
            />
          );
        }
      }
    }

    if (addedEntry) {
      // Render the new replacement bar in green hatching
      const props = getBarProps(bar);
      if (props) {
        bars.push(
          <div
            key={`added-${bar.id}`}
            style={{
              gridColumnStart: props.colStart,
              gridColumnEnd: `span ${props.colSpan}`,
              ...hatchStyle('#10b981'),
              height: '22px',
              margin: '1px 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '10px',
              color: '#10b981',
              overflow: 'hidden',
            }}
            title={`${label} — ${t('capacity.previewMode.tooltipReplacement')}`}
          />
        );
      }
    }

    return bars;
  };

  /**
   * Point coloré vert (employé interne) ou orange (consultant) affiché
   * avant le nom de chaque ressource pour identification rapide du type.
   */
  const renderResourceDot = (resource) => {
    const isPermanent = resource.level === 'Employé interne';
    return (
      <span
        className="inline-block w-2 h-2 rounded-full mr-1.5 shrink-0"
        style={{
          backgroundColor: isPermanent ? 'var(--prism-success)' : 'var(--prism-warning)',
        }}
      />
    );
  };

  // --- Vue "By Project" : grouping par projet, puis par ressource dans chaque projet ---
  const renderByProject = () => {
    const grouped = {};
    assignments.forEach((a) => {
      if (!grouped[a.project_id]) grouped[a.project_id] = [];
      grouped[a.project_id].push(a);
    });

    return Object.entries(grouped).map(([projectId, projAssignments]) => {
      const color = projectColorMap[projectId];
      const name = projectNameMap[projectId] || `Project ${projectId}`;
      const isCollapsed = collapsed[`p-${projectId}`];
      const resourceIds = [...new Set(projAssignments.map((a) => a.resource_id))];

      return (
        <React.Fragment key={projectId}>
          {/* En-tête du projet (collapsible) */}
          <div
            className="col-span-full flex items-center gap-2 py-1.5 px-2 cursor-pointer rounded-md font-medium text-sm text-white"
            style={{ backgroundColor: color }}
            onClick={() => toggleCollapse(`p-${projectId}`)}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {name}
          </div>

          {!isCollapsed &&
            resourceIds.map((rid) => {
              const resource = resources.find((r) => r.id === rid);
              if (!resource) return null;
              const resAssignments = projAssignments.filter((a) => a.resource_id === rid);

              // Déduplique les barres par id d'assignment (l'API peut retourner des doublons
              // si un assignment chevauche plusieurs phases du même projet)
              const uniqueBars = resAssignments.filter((a, i, arr) =>
                arr.findIndex((b) => b.id === a.id) === i
              );
              // In preview mode, use projected assignments for this resource instead.
              const displayBars = previewResult
                ? previewResult.assignments.filter(
                    (a) => a.resource_id === rid && a.project_id === projectId
                  ).filter((a, i, arr) => arr.findIndex((b) => b.id === a.id) === i)
                : uniqueBars;

              return (
                // Nested grid : même définition de colonnes que la grille parente.
                // Pourquoi nested et non flat : une grille plate nécessiterait des divs vides
                // pour les colonnes sans barre, créant des lignes parasites dans le layout.
                <div key={`${projectId}-${rid}`} style={{ display: 'grid', gridTemplateColumns: gridCols, gridColumn: '1 / -1' }} className="items-center">
                  <div className="text-sm truncate py-1 pr-2 pl-1 flex items-center sticky left-0 bg-card z-10 border-r border-border">
                    {renderResourceDot(resource)}
                    {resource.name}
                  </div>
                  {/* Current (solid) bars — shown when not in preview OR when showCurrent is on */}
                  {(!previewResult || showCurrent) && uniqueBars.map((bar) => {
                    const props = getBarProps(bar);
                    if (!props) return null;
                    return (
                      <GanttBar
                        key={bar.id}
                        color={color}
                        allocation={bar.allocation}
                        label={resource.name}
                        colStart={props.colStart}
                        colSpan={props.colSpan}
                        isConsultant={resource.level !== 'Employé interne'}
                        onClick={() => {
                          // Seuls les consultants ont l'action QuickTransition
                          if (resource.level !== 'Employé interne') {
                            setQuickTransition({ consultant: resource, assignment: bar });
                          }
                        }}
                      />
                    );
                  })}
                  {/* Projected (hatched) overlay bars — only in preview mode */}
                  {previewResult && displayBars.map((bar) =>
                    renderPreviewBar(bar, previewResult.changes, resource.name)
                  )}
                </div>
              );
            })}
        </React.Fragment>
      );
    });
  };

  // --- Vue "By Type" : grouping Employés internes / Consultants ---
  const renderByType = () => {
    const permanents = resources.filter((r) => r.level === 'Employé interne');
    const consultants = resources.filter((r) => r.level !== 'Employé interne');

    /**
     * Rend une section collapsible (Permanents ou Consultants) avec toutes
     * les ressources du groupe et leurs barres d'assignments multi-projets.
     */
    const renderSection = (label, sectionResources, headerColor, key) => {
      const isCollapsed = collapsed[key];
      return (
        <React.Fragment key={key}>
          <div
            className="col-span-full flex items-center gap-2 py-1.5 px-2 cursor-pointer rounded-md font-medium text-sm text-white"
            style={{ backgroundColor: headerColor }}
            onClick={() => toggleCollapse(key)}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {label} ({sectionResources.length})
          </div>

          {!isCollapsed &&
            sectionResources.map((resource) => {
              const resAssignments = assignments.filter((a) => a.resource_id === resource.id);

              const uniqueBars = resAssignments.filter((a, i, arr) =>
                arr.findIndex((b) => b.id === a.id) === i
              );
              const displayBarsType = previewResult
                ? previewResult.assignments.filter(
                    (a) => a.resource_id === resource.id
                  ).filter((a, i, arr) => arr.findIndex((b) => b.id === a.id) === i)
                : uniqueBars;

              return (
                // Nested grid (voir explication renderByProject ci-dessus)
                <div key={resource.id} style={{ display: 'grid', gridTemplateColumns: gridCols, gridColumn: '1 / -1' }} className="items-center">
                  <div className="text-sm truncate py-1 pr-2 pl-1 flex items-center sticky left-0 bg-card z-10 border-r border-border">
                    {renderResourceDot(resource)}
                    {resource.name}
                  </div>
                  {/* Current (solid) bars */}
                  {(!previewResult || showCurrent) && uniqueBars.map((bar) => {
                    const props = getBarProps(bar);
                    if (!props) return null;
                    // En vue "By Type", la couleur de la barre = couleur du projet (pas du type)
                    const color = projectColorMap[bar.project_id] || PROJECT_COLORS[0];
                    return (
                      <GanttBar
                        key={bar.id}
                        color={color}
                        allocation={bar.allocation}
                        label={projectNameMap[bar.project_id] || `Project ${bar.project_id}`}
                        colStart={props.colStart}
                        colSpan={props.colSpan}
                        isConsultant={resource.level !== 'Employé interne'}
                        onClick={() => {
                          if (resource.level !== 'Employé interne') {
                            setQuickTransition({ consultant: resource, assignment: bar });
                          }
                        }}
                      />
                    );
                  })}
                  {/* Projected (hatched) overlay bars */}
                  {previewResult && displayBarsType.map((bar) =>
                    renderPreviewBar(bar, previewResult.changes, resource.name)
                  )}
                </div>
              );
            })}
        </React.Fragment>
      );
    };

    return (
      <>
        {renderSection(t('capacity.permanent'), permanents, 'var(--prism-success)', 'type-perm')}
        {renderSection(t('capacity.consultant'), consultants, 'var(--prism-warning)', 'type-cons')}
      </>
    );
  };

  return (
    <div className="space-y-4">

      {/* --- Preview mode banner --- */}
      {previewPlanId && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-medium text-foreground">
              {previewError
                ? t('capacity.previewMode.planNotFound')
                : previewPlan
                  ? t('capacity.previewMode.banner', { name: previewPlan.name })
                  : t('capacity.previewMode.loading')}
            </span>
            {previewResult && (
              <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showCurrent}
                  onChange={(e) => setShowCurrent(e.target.checked)}
                  className="rounded border-border"
                />
                {t('capacity.previewMode.showCurrent')}
              </label>
            )}
            {previewResult && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {t('capacity.previewMode.legend')}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={onExitPreview}
          >
            {t('capacity.previewMode.exit')}
          </Button>
        </div>
      )}

      {/* --- Contrôles : toggle vue + navigation mois --- */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1">
          <Button
            variant={viewMode === 'project' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('project')}
          >
            {t('capacity.byProject')}
          </Button>
          <Button
            variant={viewMode === 'type' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('type')}
          >
            {t('capacity.byType')}
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setStartMonth(addMonths(startMonth, -1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium px-2">
            {formatMonth(startMonth)} — {formatMonth(endMonth)}
          </span>
          <Button variant="outline" size="sm" onClick={() => setStartMonth(addMonths(startMonth, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* --- Grille principale Gantt --- */}
      <div className="overflow-x-auto border border-border rounded-lg bg-card">
        <div
          className="min-w-[900px]"
          style={{
            display: 'grid',
            gridTemplateColumns: gridCols,
            gap: '2px 4px',
            padding: '8px',
          }}
        >
          {/* En-têtes des colonnes mois */}
          <div className="font-medium text-sm text-muted-foreground sticky left-0 bg-card z-10 border-r border-border" />
          {months.map((m) => (
            <div key={m} className="text-center text-xs font-medium text-muted-foreground py-1">
              {formatMonth(m)}
            </div>
          ))}

          {/* Lignes ressources (rendu conditionnel selon viewMode) */}
          {viewMode === 'project' ? renderByProject() : renderByType()}

          {/* Résumé d'utilisation agrégé en bas du Gantt */}
          <UtilizationSummary resources={resources} assignments={assignments} months={months} gridCols={gridCols} />
        </div>
      </div>

      {/* --- Panneau QuickTransition (affiché au click sur une barre consultant) --- */}
      {quickTransition && (
        <QuickTransition
          consultant={quickTransition.consultant}
          assignment={quickTransition.assignment}
          resources={resources}
          rates={rates}
          onClose={() => setQuickTransition(null)}
          onApply={() => {
            // Re-fetch du Gantt après application d'une transition rapide
            capacityApi.getGanttData(startMonth, endMonth).then(setData).catch(() => {});
          }}
        />
      )}
    </div>
  );
};

export default CapacityGantt;
