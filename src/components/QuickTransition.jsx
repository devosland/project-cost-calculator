/**
 * Modal popover for a single-consultant → single-permanent-employee transition.
 * Launched from a consultant's Gantt bar. Lets the planner pick a replacement
 * from the Internal Employee pool, set a transition date and overlap period,
 * preview the cost impact (savings / annual savings), then create and immediately
 * apply the transition plan in one action. The cost preview is computed
 * client-side via calculateTransitionCostImpact; no round-trip until Apply.
 */
import React, { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/button';
import { useLocale } from '../lib/i18n';
import { capacityApi } from '../lib/capacityApi';
import { calculateTransitionCostImpact } from '../lib/capacityCalculations';
import { formatCurrency } from '../lib/costCalculations';

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-background border rounded-lg shadow-lg w-full max-w-md mx-4 p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">{t('transitions.quick')}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Consultant summary */}
        <div className="bg-muted/50 rounded p-3 text-sm space-y-1">
          <div className="font-medium">{consultant.name}</div>
          <div className="text-muted-foreground">
            {consultant.role} — {consultant.level}
          </div>
          <div className="text-muted-foreground">
            {assignment.project_name} · {assignment.allocation}%
          </div>
        </div>

        {/* Replacement picker */}
        <div className="space-y-1">
          <label className="text-sm font-medium">{t('transitions.replacement')}</label>
          <select
            className="w-full border rounded px-3 py-2 text-sm bg-background"
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
            className="w-full border rounded px-3 py-2 text-sm bg-background"
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
            className="w-full border rounded px-3 py-2 text-sm bg-background"
            value={overlapWeeks}
            onChange={(e) => setOverlapWeeks(Math.min(8, Math.max(0, Number(e.target.value))))}
          />
        </div>

        {/* Cost impact */}
        {impact && (
          <div className="border rounded p-3 text-sm space-y-1">
            <div className="font-medium mb-2">{t('transitions.impact')}</div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('transitions.consultant')}</span>
              <span>{formatCurrency(impact.consultantCost)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('transitions.replacement')}</span>
              <span>{formatCurrency(impact.replacementCost)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('transitions.overlapCost')}</span>
              <span>{formatCurrency(impact.overlapCost)}</span>
            </div>
            <hr className="my-1" />
            <div className="flex justify-between font-medium">
              <span>{t('transitions.savings')}</span>
              <span className={impact.savings > 0 ? 'text-green-600' : 'text-red-600'}>
                {formatCurrency(impact.savings)}
              </span>
            </div>
            <div className="flex justify-between font-medium">
              <span>{t('transitions.annualSavings')}</span>
              <span className={impact.annualSavings > 0 ? 'text-green-600' : 'text-red-600'}>
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
