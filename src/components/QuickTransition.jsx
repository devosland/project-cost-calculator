/**
 * Modal popover for a single-consultant → single-permanent-employee transition.
 * Launched from a consultant's Gantt bar. Lets the planner pick a replacement
 * from the Internal Employee pool, set a transition date and overlap period,
 * preview the cost impact (savings / annual savings), then create and immediately
 * apply the transition plan in one action. The cost preview is computed
 * client-side via calculateTransitionCostImpact; no round-trip until Apply.
 */
import React, { useState, useMemo, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/button';
import { useLocale } from '../lib/i18n';
import { capacityApi } from '../lib/capacityApi';
import { calculateTransitionCostImpact } from '../lib/capacityCalculations';
import { formatCurrency } from '../lib/costCalculations';
import { useFocusTrap } from '../lib/useFocusTrap';

/** Generates a short collision-resistant ID for a new transition entry. */
function generateId() {
  return 'tr-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Converts a month range to weeks (4.33 weeks/month). Used to compute the
 * remaining consultant weeks between transition date and assignment end.
 *
 * @param {string} fromYM - Start month YYYY-MM.
 * @param {string} toYM   - End month YYYY-MM.
 * @returns {number} Rounded weeks, minimum 0.
 */
function monthDiffInWeeks(fromYM, toYM) {
  const [fy, fm] = fromYM.split('-').map(Number);
  const [ty, tm] = toYM.split('-').map(Number);
  const months = (ty - fy) * 12 + (tm - fm);
  return Math.max(0, Math.round(months * 4.33));
}

/**
 * @param {Object} props
 * @param {Object} props.consultant  - Resource object for the consultant being replaced.
 * @param {Object} props.assignment  - Current Gantt assignment ({ project_name,
 *   allocation, end_month, ... }).
 * @param {Array<Object>} props.resources - Full resource pool; filtered internally
 *   to Internal Employee level for the replacement picker.
 * @param {Object} props.rates       - Enterprise rate table for cost impact preview.
 * @param {function(): void} props.onClose  - Close the popover without applying.
 * @param {function(): void} props.onApply  - Called after the plan is created and
 *   applied; triggers a Gantt refresh in the parent.
 */
const QuickTransition = ({ consultant, assignment, resources, rates, onClose, onApply }) => {
  const { t } = useLocale();
  const [replacementId, setReplacementId] = useState('');
  const [transitionDate, setTransitionDate] = useState(assignment.end_month);
  const [overlapWeeks, setOverlapWeeks] = useState(2);
  const [applying, setApplying] = useState(false);

  // 'Employé interne' is the canonical level key for permanent staff; type
  // is derived at runtime from this field, not stored as a separate column.
  const permanents = useMemo(
    () => resources.filter((r) => r.level === 'Employé interne'),
    [resources]
  );

  const replacement = useMemo(
    () => permanents.find((r) => String(r.id) === String(replacementId)),
    [permanents, replacementId]
  );

  const remainingWeeks = useMemo(
    () => monthDiffInWeeks(transitionDate, assignment.end_month),
    [transitionDate, assignment.end_month]
  );

  const impact = useMemo(() => {
    if (!replacement) return null;
    return calculateTransitionCostImpact({
      consultantRole: consultant.role,
      consultantLevel: consultant.level,
      replacementRole: replacement.role,
      replacementLevel: replacement.level,
      allocation: assignment.allocation,
      remainingWeeks,
      overlapWeeks,
      rates,
    });
  }, [consultant, replacement, assignment.allocation, remainingWeeks, overlapWeeks, rates]);

  // Escape to close. Listener only lives while this component is mounted —
  // the modal is conditionally rendered by the parent so this is effectively
  // scoped to "while open".
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Focus-trap the modal while it's mounted. The parent conditionally renders
  // this component so the trap's `active` argument can be a constant true —
  // mount/unmount already scopes activation.
  const trapRef = useFocusTrap(true);

  const handleApply = async () => {
    if (!replacementId) return;
    setApplying(true);
    try {
      const plan = await capacityApi.createTransition({
        name: `Transition ${consultant.name}`,
        data: {
          transitions: [
            {
              id: generateId(),
              consultant_resource_id: consultant.id,
              replacement_resource_id: replacementId === 'new' ? null : Number(replacementId),
              transition_date: transitionDate,
              overlap_weeks: overlapWeeks,
            },
          ],
        },
      });
      await capacityApi.applyTransition(plan.id);
      onApply();
      onClose();
    } catch (err) {
      console.error('Transition failed', err);
      setApplying(false);
    }
  };

  // Token-driven savings color : positive → success, negative → error.
  // Inline style because tokens are hex vars, not HSL (can't use Tailwind class).
  const savingsColor = (n) => ({ color: `var(${n > 0 ? '--prism-success' : '--prism-error'})` });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-transition-title"
        tabIndex={-1}
        className="bg-card border border-border rounded-lg shadow-lg w-full max-w-md mx-4 p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 id="quick-transition-title" className="font-display text-xl font-semibold tracking-tight">
            {t('transitions.quick')}
          </h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            aria-label={t('common.cancel')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Consultant summary */}
        <div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
          <div className="font-medium">{consultant.name}</div>
          <div className="text-muted-foreground">
            {consultant.role} — {consultant.level}
          </div>
          <div className="text-muted-foreground">
            {assignment.project_name} · <span className="font-mono tabular-nums">{assignment.allocation}%</span>
          </div>
        </div>

        {/* Replacement picker */}
        <div className="space-y-1">
          <label className="text-sm font-medium">{t('transitions.replacement')}</label>
          <select
            className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
            value={replacementId}
            onChange={(e) => setReplacementId(e.target.value)}
          >
            <option value="">—</option>
            {permanents.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.role})
              </option>
            ))}
            <option value="new">{t('transitions.newPermanent')}</option>
          </select>
        </div>

        {/* Transition date */}
        <div className="space-y-1">
          <label className="text-sm font-medium">{t('transitions.date')}</label>
          <input
            type="month"
            className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
            value={transitionDate}
            onChange={(e) => setTransitionDate(e.target.value)}
          />
        </div>

        {/* Overlap weeks */}
        <div className="space-y-1">
          <label className="text-sm font-medium">
            {t('transitions.overlap')} ({t('transitions.weeks')})
          </label>
          <input
            type="number"
            min={0}
            max={8}
            className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
            value={overlapWeeks}
            onChange={(e) => setOverlapWeeks(Math.min(8, Math.max(0, Number(e.target.value))))}
          />
        </div>

        {/* Cost impact */}
        {impact && (
          <div className="border border-border rounded-md p-3 text-sm space-y-1">
            <div className="font-medium mb-2">{t('transitions.impact')}</div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('transitions.consultant')}</span>
              <span className="font-mono tabular-nums">{formatCurrency(impact.consultantCost)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('transitions.replacement')}</span>
              <span className="font-mono tabular-nums">{formatCurrency(impact.replacementCost)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('transitions.overlapCost')}</span>
              <span className="font-mono tabular-nums">{formatCurrency(impact.overlapCost)}</span>
            </div>
            <hr className="my-1 border-border" />
            <div className="flex justify-between font-medium">
              <span>{t('transitions.savings')}</span>
              <span className="font-mono tabular-nums" style={savingsColor(impact.savings)}>
                {formatCurrency(impact.savings)}
              </span>
            </div>
            <div className="flex justify-between font-medium">
              <span>{t('transitions.annualSavings')}</span>
              <span className="font-mono tabular-nums" style={savingsColor(impact.annualSavings)}>
                {formatCurrency(impact.annualSavings)}
              </span>
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" disabled={!replacementId || applying} onClick={handleApply}>
            {applying ? '…' : t('transitions.apply')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default QuickTransition;
