import { useState, useEffect } from 'react';
import { ArrowLeft, BarChart3, Users, ArrowLeftRight } from 'lucide-react';
import { Button } from './ui/button';
import { useLocale } from '../lib/i18n';
import ResourcePool from './ResourcePool';
import CapacityGantt from './CapacityGantt';
import TransitionList from './TransitionList';
import TransitionPlanner from './TransitionPlanner';
import { capacityApi } from '../lib/capacityApi';

const CapacityView = ({ rates, onBack, onDataChanged }) => {
  const { t } = useLocale();
  const [activeTab, setActiveTab] = useState('gantt');
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [showPlanner, setShowPlanner] = useState(false);
  const [resources, setResources] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    capacityApi.getResources().then((data) => {
      setResources(Array.isArray(data) ? data : []);
    }).catch(() => {});
  }, []);

  const TABS = [
    { id: 'gantt', icon: BarChart3, label: t('capacity.gantt') },
    { id: 'resources', icon: Users, label: t('capacity.resources') },
    { id: 'transitions', icon: ArrowLeftRight, label: t('capacity.transitions') },
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
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Tab content */}
      {activeTab === 'gantt' && (
        <CapacityGantt rates={rates} key={refreshKey} />
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
          />
        )
      )}
    </div>
  );
};

export default CapacityView;
