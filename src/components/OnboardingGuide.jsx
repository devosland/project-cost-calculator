/**
 * Four-step interactive onboarding guide displayed on the Dashboard for new
 * users: (1) Configure rates, (2) Add resources, (3) Create a project,
 * (4) Assign resources to the Gantt. Each step shows a CTA button pointing to
 * the relevant section. Once dismissed, collapses to a floating help button so
 * the user can re-open it at any time without losing progress state.
 */
import React, { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { CheckCircle2, Circle, ArrowRight, DollarSign, Users, FolderOpen, BarChart3, X, HelpCircle } from 'lucide-react';
import { useLocale } from '../lib/i18n';
import { capacityApi } from '../lib/capacityApi';

/**
 * @param {Object} props
 * @param {Array<Object>} props.projects - All projects; used to detect whether
 *   the user has created a project and assigned resources (steps 3 & 4).
 * @param {function(string, string=): void} props.onNavigate - Navigate to a
 *   section. Called as onNavigate('capacity', 'rates') or onNavigate('projects').
 */
const OnboardingGuide = ({ projects, onNavigate }) => {
  const { t } = useLocale();
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  // Persist dismissal in localStorage only — no backend record needed; this is
  // a pure client-side UX preference that resets on localStorage clear.
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('onboarding_dismissed') === 'true');
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    capacityApi.getResources()
      .then((data) => { setResources(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return null;

  const hasResources = resources.length > 0;
  const hasProjects = projects.length > 0;
  const hasAssignedResources = hasProjects && projects.some(p =>
    (p.phases || []).some(ph => (ph.teamMembers || []).some(m => m.resourceId))
  );
  const allDone = hasResources && hasProjects && hasAssignedResources;

  // Show the floating help button when guide is dismissed or all done
  if (dismissed && !showGuide) {
    return (
      <button
        onClick={() => setShowGuide(true)}
        className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-primary text-white shadow-lg hover:bg-primary/90 flex items-center justify-center z-30 print:hidden"
        title={t('onboarding.help')}
      >
        <HelpCircle className="w-6 h-6" />
      </button>
    );
  }

  const steps = [
    {
      id: 'rates',
      icon: DollarSign,
      title: t('onboarding.step1Title'),
      description: t('onboarding.step1Desc'),
      done: true, // Rates always have defaults
      action: () => onNavigate('capacity', 'rates'),
      actionLabel: t('onboarding.step1Action'),
    },
    {
      id: 'resources',
      icon: Users,
      title: t('onboarding.step2Title'),
      description: t('onboarding.step2Desc'),
      done: hasResources,
      action: () => onNavigate('capacity', 'resources'),
      actionLabel: t('onboarding.step2Action'),
    },
    {
      id: 'projects',
      icon: FolderOpen,
      title: t('onboarding.step3Title'),
      description: t('onboarding.step3Desc'),
      done: hasProjects,
      action: () => onNavigate('projects'),
      actionLabel: t('onboarding.step3Action'),
    },
    {
      id: 'assign',
      icon: BarChart3,
      title: t('onboarding.step4Title'),
      description: t('onboarding.step4Desc'),
      done: hasAssignedResources,
      action: () => onNavigate('capacity', 'gantt'),
      actionLabel: t('onboarding.step4Action'),
    },
  ];

  const completedCount = steps.filter(s => s.done).length;

  return (
    <Card className="mb-6 border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10 print:hidden">
      <CardContent className="py-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              {allDone ? t('onboarding.completeTitle') : t('onboarding.title')}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {allDone ? t('onboarding.completeDesc') : t('onboarding.subtitle')}
            </p>
          </div>
          <button
            onClick={() => {
              if (showGuide) { setShowGuide(false); }
              else { setDismissed(true); localStorage.setItem('onboarding_dismissed', 'true'); }
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-6">
          <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${(completedCount / steps.length) * 100}%` }}
            />
          </div>
          <span className="text-xs font-medium text-muted-foreground">{completedCount}/{steps.length}</span>
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isNext = !step.done && steps.slice(0, idx).every(s => s.done);
            return (
              <div
                key={step.id}
                className={`flex items-center gap-4 p-3 rounded-lg transition-colors ${
                  step.done
                    ? 'bg-green-50 dark:bg-green-900/10'
                    : isNext
                    ? 'bg-white dark:bg-gray-800 border border-primary/30 shadow-sm'
                    : 'bg-secondary/30'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  step.done ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 'bg-secondary text-muted-foreground'
                }`}>
                  {step.done ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${step.done ? 'text-green-700 dark:text-green-400' : ''}`}>
                    {step.title}
                  </div>
                  <div className="text-xs text-muted-foreground">{step.description}</div>
                </div>
                {!step.done && isNext && (
                  <Button size="sm" onClick={step.action} className="shrink-0 flex items-center gap-1">
                    {step.actionLabel}
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                )}
                {step.done && (
                  <span className="text-xs text-green-600 dark:text-green-400 font-medium shrink-0">{t('onboarding.done')}</span>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default OnboardingGuide;
