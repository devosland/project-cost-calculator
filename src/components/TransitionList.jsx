/**
 * List of consultant-to-permanent transition plans with status badges and
 * actions (open in TransitionPlanner, delete). Plan data is stored as a JSON
 * string in the SQLite DB (plan.data); parseData() handles the deserialisation
 * before passing a fully-parsed plan object to the parent's onSelectPlan
 * handler. Inline deletion calls the API directly and optimistically removes
 * the plan from local state.
 */
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Eye } from 'lucide-react';
import { Button } from './ui/button';
import { useLocale } from '../lib/i18n';
import { capacityApi } from '../lib/capacityApi';

/**
 * Safely parses plan.data from the DB. plan.data is stored as a JSON string
 * in SQLite; it must be parsed before use. Returns an empty array on any
 * parse failure so callers never receive null/undefined.
 *
 * @param {{data: string|Object|null}} plan - Plan object from the API.
 * @returns {Array<Object>} Array of transition entries (may be empty).
 */
function parseData(plan) {
  if (!plan.data) return [];
  try {
    const d = typeof plan.data === 'string' ? JSON.parse(plan.data) : plan.data;
    return d.transitions || [];
  } catch { return []; }
}

const statusColors = {
  draft: 'bg-gray-100 text-gray-700',
  planned: 'bg-blue-100 text-blue-700',
  applied: 'bg-green-100 text-green-700',
};

/**
 * @param {Object} props
 * @param {function(Object): void} props.onSelectPlan - Called with the selected
 *   plan (data already parsed to an object) to open it in TransitionPlanner.
 * @param {function(): void} props.onNewPlan - Open TransitionPlanner for a new
 *   (blank) plan.
 * @param {function(number): void} [props.onPreviewPlan] - Navigate to Gantt with
 *   the given plan ID pre-selected for what-if preview. Optional; falls back to
 *   URL hash navigation when not provided.
 */
const TransitionList = ({ onSelectPlan, onNewPlan, onPreviewPlan }) => {
  const { t } = useLocale();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    capacityApi.getTransitions().then((data) => {
      if (!cancelled) {
        setPlans(Array.isArray(data) ? data : []);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="text-center text-muted-foreground py-12">...</div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with new plan button */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('transitions.title')}</h2>
        <Button size="sm" onClick={onNewPlan}>
          <Plus className="w-4 h-4 mr-1" />
          {t('transitions.add')}
        </Button>
      </div>

      {/* Plan list or empty state */}
      {plans.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">
          {t('transitions.empty')}
        </div>
      ) : (
        <div className="grid gap-3">
          {plans.map((plan) => {
            const status = plan.status || 'draft';
            const transitions = parseData(plan);
            // When selecting, pass parsed data so TransitionPlanner gets an object
            const parsedPlan = {
              ...plan,
              data: { transitions },
            };
            return (
              <div
                key={plan.id}
                className="border rounded-lg p-4 hover:border-primary/50 hover:bg-muted/30 transition-colors flex items-center gap-3"
              >
                <button
                  className="flex-1 text-left"
                  onClick={() => onSelectPlan(parsedPlan)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{plan.name}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[status] || statusColors.draft}`}>
                      {t(`transitions.status.${status}`)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                    {plan.created_at && (
                      <span>{new Date(plan.created_at).toLocaleDateString()}</span>
                    )}
                    <span>
                      {transitions.length} transition{transitions.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </button>
                {/* Preview button — only on draft plans */}
                {status === 'draft' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-primary shrink-0"
                    title={t('transitions.preview')}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onPreviewPlan) {
                        onPreviewPlan(plan.id);
                      } else {
                        // Fallback: navigate to Gantt tab via hash + query param.
                        window.location.hash = `#/capacity/gantt?preview=${plan.id}`;
                      }
                    }}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-red-500 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(t('resources.confirmDelete'))) {
                      capacityApi.deleteTransition(plan.id).then(() => {
                        setPlans((prev) => prev.filter((p) => p.id !== plan.id));
                      }).catch(() => {});
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TransitionList;
