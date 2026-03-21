import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, AlertTriangle, X } from 'lucide-react';
import { Button } from './ui/button';
import { useLocale } from '../lib/i18n';
import { capacityApi } from '../lib/capacityApi';
import { calculateTransitionCostImpact } from '../lib/capacityCalculations';
import { formatCurrency } from '../lib/costCalculations';

function generateId() {
  return 'tr-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const TransitionPlanner = ({ plan, resources, rates, onClose, onSave }) => {
  const { t } = useLocale();
  const [planName, setPlanName] = useState(plan?.name || '');
  const [transitions, setTransitions] = useState(() => {
    const d = plan?.data;
    if (!d) return [];
    const parsed = typeof d === 'string' ? JSON.parse(d) : d;
    return parsed.transitions || [];
  });
  const [status, setStatus] = useState(plan?.status || 'draft');
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  const [assignments, setAssignments] = useState([]);

  // Load assignments for conflict detection
  useEffect(() => {
    capacityApi.getAssignments().then((data) => {
      setAssignments(Array.isArray(data) ? data : []);
    }).catch(() => {});
  }, []);

  const consultants = useMemo(
    () => resources.filter((r) => r.level !== 'Employ\u00e9 interne'),
    [resources]
  );

  const permanents = useMemo(
    () => resources.filter((r) => r.level === 'Employ\u00e9 interne'),
    [resources]
  );

  const addTransition = () => {
    setTransitions((prev) => [
      ...prev,
      {
        id: generateId(),
        consultant_resource_id: '',
        replacement_resource_id: '',
        transition_date: new Date().toISOString().slice(0, 7),
        overlap_weeks: 2,
      },
    ]);
  };

  const updateTransition = (id, field, value) => {
    setTransitions((prev) =>
      prev.map((tr) => (tr.id === id ? { ...tr, [field]: value } : tr))
    );
  };

  const removeTransition = (id) => {
    setTransitions((prev) => prev.filter((tr) => tr.id !== id));
  };

  // Conflict detection: check if consultant has assignments ending after transition date
  const getConflicts = (tr) => {
    if (!tr.consultant_resource_id || !tr.transition_date) return [];
    return assignments.filter(
      (a) =>
        String(a.resource_id) === String(tr.consultant_resource_id) &&
        a.end_month > tr.transition_date
    );
  };

  // Cost impacts per transition
  const impacts = useMemo(() => {
    return transitions.map((tr) => {
      const consultant = resources.find((r) => String(r.id) === String(tr.consultant_resource_id));
      const replacement = resources.find((r) => String(r.id) === String(tr.replacement_resource_id));
      if (!consultant || !replacement) return null;
      return calculateTransitionCostImpact({
        consultantRole: consultant.role,
        consultantLevel: consultant.level,
        replacementRole: replacement.role,
        replacementLevel: replacement.level,
        allocation: 100,
        remainingWeeks: 52,
        overlapWeeks: tr.overlap_weeks || 0,
        rates,
      });
    });
  }, [transitions, resources, rates]);

  // Totals
  const totals = useMemo(() => {
    let currentCost = 0;
    let afterCost = 0;
    let totalSavings = 0;
    impacts.forEach((imp) => {
      if (!imp) return;
      currentCost += imp.consultantCost;
      afterCost += imp.replacementCost + imp.overlapCost;
      totalSavings += imp.annualSavings;
    });
    return { currentCost, afterCost, totalSavings };
  }, [impacts]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: planName || 'Untitled plan',
        status,
        data: { transitions },
      };
      if (plan?.id) {
        await capacityApi.updateTransition(plan.id, payload);
      } else {
        await capacityApi.createTransition(payload);
      }
      onSave();
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleApply = async () => {
    setApplying(true);
    setError(null);
    try {
      let planId = plan?.id;
      // Save first if new plan
      if (!planId) {
        const payload = { name: planName || 'Untitled plan', data: { transitions } };
        const saved = await capacityApi.createTransition(payload);
        planId = saved.id;
      } else {
        await capacityApi.updateTransition(planId, { name: planName, status, data: { transitions } });
      }
      const result = await capacityApi.applyTransition(planId);
      if (result?.error === 'missing_resources') {
        setError(t('transitions.missingResources'));
        setApplying(false);
        return;
      }
      onSave();
    } catch (err) {
      setError(err.message || 'Apply failed');
      setApplying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('transitions.title')}</h2>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Plan name */}
      <div className="space-y-1">
        <label className="text-sm font-medium">{t('transitions.planName')}</label>
        <input
          type="text"
          className="input-field w-full"
          value={planName}
          onChange={(e) => setPlanName(e.target.value)}
          placeholder={t('transitions.planName')}
        />
      </div>

      {/* Transition rows */}
      <div className="space-y-3">
        {transitions.map((tr, idx) => {
          const conflicts = getConflicts(tr);
          return (
            <div key={tr.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">#{idx + 1}</span>
                <button
                  onClick={() => removeTransition(tr.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Consultant selector */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('transitions.consultant')}
                  </label>
                  <select
                    className="select-field w-full"
                    value={tr.consultant_resource_id}
                    onChange={(e) => updateTransition(tr.id, 'consultant_resource_id', e.target.value)}
                  >
                    <option value="">---</option>
                    {consultants.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.role} - {r.level})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Replacement selector */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('transitions.replacement')}
                  </label>
                  <select
                    className="select-field w-full"
                    value={tr.replacement_resource_id}
                    onChange={(e) => updateTransition(tr.id, 'replacement_resource_id', e.target.value)}
                  >
                    <option value="">---</option>
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
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('transitions.date')}
                  </label>
                  <input
                    type="month"
                    className="input-field w-full"
                    value={tr.transition_date}
                    onChange={(e) => updateTransition(tr.id, 'transition_date', e.target.value)}
                  />
                </div>

                {/* Overlap weeks */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('transitions.overlap')} ({t('transitions.weeks')})
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={12}
                    className="input-field w-full"
                    value={tr.overlap_weeks}
                    onChange={(e) =>
                      updateTransition(tr.id, 'overlap_weeks', Math.min(12, Math.max(0, Number(e.target.value))))
                    }
                  />
                </div>
              </div>

              {/* Conflict warning */}
              {conflicts.length > 0 && (
                <div className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 dark:bg-amber-900/20 rounded px-3 py-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{t('transitions.conflict')}</span>
                </div>
              )}

              {/* Row impact */}
              {impacts[idx] && (
                <div className="text-sm text-muted-foreground flex gap-4">
                  <span>{t('transitions.savings')}: <span className={impacts[idx].annualSavings > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>{formatCurrency(impacts[idx].annualSavings)}</span></span>
                </div>
              )}
            </div>
          );
        })}

        <Button variant="outline" size="sm" onClick={addTransition}>
          <Plus className="w-4 h-4 mr-1" />
          {t('transitions.addTransition')}
        </Button>
      </div>

      {/* Cost comparison cards */}
      {transitions.length > 0 && impacts.some(Boolean) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="border rounded-lg p-4 text-center bg-red-50 dark:bg-red-900/20">
            <div className="text-xs font-medium text-muted-foreground mb-1">
              {t('transitions.costCurrent')}
            </div>
            <div className="text-xl font-bold text-red-600">
              {formatCurrency(totals.currentCost)}
            </div>
          </div>
          <div className="border rounded-lg p-4 text-center bg-green-50 dark:bg-green-900/20">
            <div className="text-xs font-medium text-muted-foreground mb-1">
              {t('transitions.costAfter')}
            </div>
            <div className="text-xl font-bold text-green-600">
              {formatCurrency(totals.afterCost)}
            </div>
          </div>
          <div className="border rounded-lg p-4 text-center bg-primary/5">
            <div className="text-xs font-medium text-muted-foreground mb-1">
              {t('transitions.savings')}
            </div>
            <div className="text-xl font-bold text-primary">
              {formatCurrency(totals.totalSavings)}
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t('resources.cancel')}
        </Button>
        <Button variant="outline" size="sm" disabled={saving || transitions.length === 0} onClick={handleSave}>
          {saving ? '...' : t('resources.save')}
        </Button>
        {status !== 'applied' && (
          <Button size="sm" disabled={applying || transitions.length === 0} onClick={handleApply}>
            {applying ? '...' : t('transitions.apply')}
          </Button>
        )}
      </div>
    </div>
  );
};

export default TransitionPlanner;
