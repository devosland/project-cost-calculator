/**
 * Parent container for the Capacity section. Manages four tabs — Resources,
 * Gantt, Transitions, and Rates — via local state mirrored to the URL hash
 * (#/capacity/<tab>) so deep links work. The Transitions tab toggles between
 * TransitionList and TransitionPlanner inline (no separate route). Resources
 * are pre-fetched here so QuickTransition popups inside CapacityGantt can
 * receive the pool without re-fetching.
 */
import { useState, useEffect } from 'react';
import { ArrowLeft, BarChart3, Users, ArrowLeftRight, Settings } from 'lucide-react';
import { Button } from './ui/button';
import { useLocale } from '../lib/i18n';
import { useHashRouter } from '../lib/useHashRouter';
import ResourcePool from './ResourcePool';
import CapacityGantt from './CapacityGantt';
import TransitionList from './TransitionList';
import TransitionPlanner from './TransitionPlanner';
import RolesRatesManager from './RolesRatesManager';
import { capacityApi } from '../lib/capacityApi';

/**
 * @param {Object} props
 * @param {Object} props.rates - Enterprise rate table passed down to sub-tabs.
 * @param {function(): void} props.onBack - Navigate back to the Dashboard.
 * @param {function(): void} props.onDataChanged - Called after a transition is
 *   applied so App re-fetches projects (capacity changes affect project costs).
 * @param {function(Object): void} props.onRatesChange - Propagates rate edits
 *   from the Rates tab up to App for persistence.
 * @param {string} [props.initialTab='resources'] - Tab to activate on mount;
 *   used by deep-link navigation from OnboardingGuide.
 */
const CapacityView = ({ rates, onBack, onDataChanged, onRatesChange, initialTab }) => {
  const { t } = useLocale();
  const { navigate } = useHashRouter();
  const [activeTab, setActiveTab] = useState(initialTab || 'resources');
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [showPlanner, setShowPlanner] = useState(false);
  const [resources, setResources] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [previewPlanId, setPreviewPlanId] = useState(null);
  const [draftPlans, setDraftPlans] = useState([]);

  useEffect(() => {
    capacityApi.getResources().then((data) => {
      setResources(Array.isArray(data) ? data : []);
    }).catch(() => {});
  }, []);

  // Fetch draft plans for the preview dropdown whenever the Gantt tab is active.
  useEffect(() => {
    if (activeTab !== 'gantt') return;
    capacityApi.getTransitions().then((data) => {
      const all = Array.isArray(data) ? data : [];
      setDraftPlans(all.filter((p) => p.status === 'draft'));
    }).catch(() => {});
  }, [activeTab]);

  // Read ?preview=<id> from the hash query string on mount so TransitionList
  // "Preview" button can navigate here with the plan pre-selected.
  useEffect(() => {
    const hash = window.location.hash; // e.g. #/capacity/gantt?preview=5
    const qIndex = hash.indexOf('?');
    if (qIndex === -1) return;
    const params = new URLSearchParams(hash.slice(qIndex + 1));
    const pid = params.get('preview');
    if (pid) {
      const parsed = Number(pid);
      if (Number.isFinite(parsed) && parsed > 0) {
        setActiveTab('gantt');
        setPreviewPlanId(parsed);
      }
    }
  }, []);

  const TABS = [
    { id: 'resources', icon: Users, label: t('capacity.resources') },
    { id: 'gantt', icon: BarChart3, label: t('capacity.gantt') },
    { id: 'transitions', icon: ArrowLeftRight, label: t('capacity.transitions') },
    { id: 'rates', icon: Settings, label: t('tab.rates') },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8 print:hidden">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-1" />
          {t('project.back')}
        </Button>
        <h1 className="text-2xl font-bold">{t('capacity.title')}</h1>
      </div>

      {/* Tabs */}
      <nav className="flex gap-1 border-b mb-8 print:hidden overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`px-4 py-2.5 text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap border-b-2 ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
              // Mirror tab to URL hash so the browser back button and direct links work.
              onClick={() => { setActiveTab(tab.id); navigate('capacity/' + tab.id); }}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Tab content */}
      {activeTab === 'gantt' && (
        <div className="space-y-3">
          {/* Draft plan preview selector */}
          <div className="flex items-center gap-2">
            <label htmlFor="preview-plan-select" className="text-sm font-medium text-muted-foreground whitespace-nowrap">
              {t('capacity.previewMode.selectPlan')}
            </label>
            <select
              id="preview-plan-select"
              className="text-sm border rounded px-2 py-1 bg-background"
              value={previewPlanId ?? ''}
              onChange={(e) => setPreviewPlanId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{t('capacity.previewMode.none')}</option>
              {draftPlans.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <CapacityGantt
            rates={rates}
            key={refreshKey}
            previewPlanId={previewPlanId}
            onExitPreview={() => setPreviewPlanId(null)}
          />
        </div>
      )}
      {activeTab === 'resources' && (
        <ResourcePool rates={rates} />
      )}
      {activeTab === 'transitions' && (
        showPlanner ? (
          <TransitionPlanner
            plan={selectedPlan}
            resources={resources}
            rates={rates}
            onClose={() => setShowPlanner(false)}
            onSave={() => { setShowPlanner(false); setRefreshKey(k => k + 1); if (onDataChanged) onDataChanged(); }}
          />
        ) : (
          <TransitionList
            onSelectPlan={(p) => { setSelectedPlan(p); setShowPlanner(true); }}
            onNewPlan={() => { setSelectedPlan(null); setShowPlanner(true); }}
            onPreviewPlan={(planId) => {
              setPreviewPlanId(planId);
              setActiveTab('gantt');
              navigate('capacity/gantt');
            }}
          />
        )
      )}
      {activeTab === 'rates' && (
        <RolesRatesManager rates={rates} onRatesChange={onRatesChange} />
      )}
    </div>
  );
};

export default CapacityView;
