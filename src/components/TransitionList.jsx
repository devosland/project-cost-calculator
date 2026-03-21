import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Button } from './ui/button';
import { useLocale } from '../lib/i18n';
import { capacityApi } from '../lib/capacityApi';

const statusColors = {
  draft: 'bg-gray-100 text-gray-700',
  planned: 'bg-blue-100 text-blue-700',
  applied: 'bg-green-100 text-green-700',
};

const TransitionList = ({ onSelectPlan, onNewPlan }) => {
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
            const transitions = plan.data?.transitions || [];
            return (
              <button
                key={plan.id}
                className="w-full text-left border rounded-lg p-4 hover:border-primary/50 hover:bg-muted/30 transition-colors"
                onClick={() => onSelectPlan(plan)}
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
                    {transitions.length} {transitions.length === 1 ? 'transition' : 'transitions'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TransitionList;
