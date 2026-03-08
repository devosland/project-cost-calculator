import React, { useState } from 'react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Dropdown } from './ui/dropdown';
import {
  ArrowLeft, PlusCircle, Trash2, ChevronUp, ChevronDown,
  LayoutDashboard, Calendar, Settings, DollarSign, BarChart3, FileText,
  Share2, History, AlertTriangle, Bell,
} from 'lucide-react';
import PhaseEditor from './PhaseEditor';
import TimelineView from './TimelineView';
import RolesRatesManager from './RolesRatesManager';
import BudgetTracker from './BudgetTracker';
import NonLabourCosts from './NonLabourCosts';
import CostCharts from './CostCharts';
import ProjectSummary from './ProjectSummary';
import ResourceConflicts from './ResourceConflicts';
import RiskRegister from './RiskRegister';
import { createPhase } from '../lib/projectStore';
import {
  calculateProjectCost, calculateProjectDurationWeeks, formatCurrency, CURRENCIES,
} from '../lib/costCalculations';
import { useLocale } from '../lib/i18n';

const useQuery = () => new URLSearchParams(window.location.search);

const WebhookSettings = ({ project, updateSettings }) => {
  const { t } = useLocale();
  const [testStatus, setTestStatus] = useState(null);
  const webhookUrl = project.settings?.webhookUrl || '';
  const threshold = project.settings?.budgetAlertThreshold ?? 80;

  const testWebhook = async () => {
    if (!webhookUrl) return;
    setTestStatus('loading');
    try {
      const res = await fetch(`/api/projects/${project.id}/test-webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (res.ok) {
        setTestStatus('success');
      } else {
        const data = await res.json().catch(() => ({}));
        setTestStatus(data.error || 'error');
      }
    } catch {
      setTestStatus('error');
    }
    setTimeout(() => setTestStatus(null), 4000);
  };

  return (
    <div className="p-5 bg-white border rounded-xl shadow-sm space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Bell className="w-4 h-4" />
        {t('webhook.title')}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <Label className="text-sm text-muted-foreground w-32">{t('webhook.url')}</Label>
        <input
          type="url"
          className="input-field flex-1 min-w-[200px]"
          value={webhookUrl}
          placeholder="https://example.com/webhook"
          onChange={(e) => updateSettings({ webhookUrl: e.target.value })}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={!webhookUrl || testStatus === 'loading'}
          onClick={testWebhook}
        >
          {testStatus === 'loading' ? t('webhook.sending') : t('webhook.test')}
        </Button>
        {testStatus === 'success' && (
          <span className="text-xs text-emerald-600 font-medium">{t('webhook.success')}</span>
        )}
        {testStatus && testStatus !== 'success' && testStatus !== 'loading' && (
          <span className="text-xs text-red-600 font-medium">
            {t(`webhook.${testStatus}`) || t('webhook.error')}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Label className="text-sm text-muted-foreground w-32">{t('webhook.threshold')}</Label>
        <input
          type="number"
          className="input-field w-20 text-center"
          value={threshold}
          min="1"
          max="100"
          onChange={(e) => {
            const v = parseInt(e.target.value);
            updateSettings({ budgetAlertThreshold: isNaN(v) ? 80 : Math.max(1, Math.min(100, v)) });
          }}
        />
        <span className="text-sm text-muted-foreground">{t('webhook.thresholdUnit')}</span>
      </div>
    </div>
  );
};

const ProjectView = ({ project, rates, onProjectChange, onRatesChange, onBack, onOpenShare, onOpenHistory }) => {
  const { t } = useLocale();
  const query = useQuery();
  const isAuthorized = query.get('r') === 'true';
  const [activeTab, setActiveTab] = useState('phases');

  const currency = project.settings?.currency || 'CAD';
  const fmt = (v) => formatCurrency(v, currency);

  const TABS = [
    { id: 'phases', label: t('tab.phases'), icon: LayoutDashboard },
    { id: 'timeline', label: t('tab.timeline'), icon: Calendar },
    { id: 'budget', label: t('tab.budget'), icon: DollarSign },
    { id: 'charts', label: t('tab.charts'), icon: BarChart3 },
    { id: 'summary', label: t('tab.summary'), icon: FileText },
    { id: 'risks', label: t('tab.risks'), icon: AlertTriangle },
    { id: 'rates', label: t('tab.rates'), icon: Settings },
  ];

  const updateProject = (changes) => onProjectChange({ ...project, ...changes });
  const updateSettings = (s) => updateProject({ settings: { ...project.settings, ...s } });

  const addPhase = () => {
    const phase = createPhase(`Phase ${project.phases.length + 1}`, project.phases.length);
    updateProject({ phases: [...project.phases, phase] });
  };
  const updatePhase = (phaseId, updated) => {
    updateProject({ phases: project.phases.map((p) => (p.id === phaseId ? updated : p)) });
  };
  const removePhase = (phaseId) => {
    if (project.phases.length <= 1) return;
    updateProject({
      phases: project.phases
        .filter((p) => p.id !== phaseId)
        .map((p) => ({
          ...p,
          dependencies: (p.dependencies || []).filter((d) => d !== phaseId),
        })),
    });
  };
  const movePhase = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= project.phases.length) return;
    const newPhases = [...project.phases];
    [newPhases[index], newPhases[newIndex]] = [newPhases[newIndex], newPhases[index]];
    updateProject({ phases: newPhases });
  };

  const totalCost = calculateProjectCost(project, rates);
  const totalWeeks = calculateProjectDurationWeeks(project);

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 print:hidden">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" />
            {t('project.back')}
          </Button>
          <h1 className="text-2xl font-bold">{project.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onOpenHistory} className="text-muted-foreground hover:text-foreground" title={t('project.history')}>
            <History className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenShare} className="text-muted-foreground hover:text-foreground" title={t('project.share')}>
            <Share2 className="w-4 h-4" />
          </Button>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">{totalWeeks} {t('project.weeks')}</div>
            <div className="text-2xl font-bold">{fmt(totalCost)}</div>
          </div>
        </div>
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

      {/* Phases Tab */}
      {activeTab === 'phases' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 p-5 bg-white border rounded-xl shadow-sm">
            <div className="flex items-center gap-3">
              <Label className="text-sm font-medium">{t('project.contingency')}</Label>
              <Switch
                checked={project.settings.includeContingency}
                onCheckedChange={(val) => updateSettings({ includeContingency: val })}
              />
              {project.settings.includeContingency && (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    className="input-field w-16 text-center"
                    value={project.settings.contingencyPercentage}
                    min="0" max="100"
                    onChange={(e) => updateSettings({ contingencyPercentage: parseInt(e.target.value) || 0 })}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Label className="text-sm font-medium">{t('project.taxes')}</Label>
              <Switch
                checked={project.settings.includeTaxes}
                onCheckedChange={(val) => updateSettings({ includeTaxes: val })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">{t('project.currency')}</Label>
              <Dropdown
                value={currency}
                options={CURRENCIES.map((c) => ({ value: c.code, label: c.label }))}
                onChange={(val) => updateSettings({ currency: val })}
              />
            </div>
          </div>

          {project.phases.map((phase, index) => (
            <div key={phase.id} className="relative">
              <div className="absolute -left-10 top-4 hidden sm:flex flex-col gap-1">
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => movePhase(index, -1)} disabled={index === 0}>
                  <ChevronUp className="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => movePhase(index, 1)} disabled={index === project.phases.length - 1}>
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </div>
              <PhaseEditor
                phase={phase}
                rates={rates}
                isAuthorized={isAuthorized}
                currency={currency}
                onChange={(updated) => updatePhase(phase.id, updated)}
                allPhases={project.phases}
              />
              {project.phases.length > 1 && (
                <div className="absolute -right-10 top-4 hidden sm:block">
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500"
                    onClick={() => removePhase(phase.id)} title={t('project.deletePhase')}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>
          ))}

          <Button variant="outline" onClick={addPhase} className="w-full flex items-center justify-center gap-2 border-dashed h-12">
            <PlusCircle className="w-4 h-4" />
            {t('project.addPhase')}
          </Button>

          <div className="p-6 rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
              <div>
                <div className="text-sm text-muted-foreground">{t('project.totalDuration')}</div>
                <div className="text-2xl font-bold">{totalWeeks} {t('project.weeks')}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">{t('project.totalCost')}</div>
                <div className="text-3xl font-bold text-primary">{fmt(totalCost)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">{t('tab.phases')}</div>
                <div className="text-2xl font-bold">{project.phases.length}</div>
              </div>
            </div>
          </div>

          <ResourceConflicts project={project} rates={rates} />
        </div>
      )}

      {activeTab === 'timeline' && <TimelineView project={project} rates={rates} currency={currency} />}

      {activeTab === 'budget' && (
        <div className="space-y-6">
          <div className="flex items-center gap-4 p-5 bg-white border rounded-xl shadow-sm">
            <Label className="text-sm font-medium">{t('project.budget')}</Label>
            <input
              type="number"
              className="input-field w-40"
              value={project.budget || ''}
              min="0" step="100"
              placeholder={t('project.noBudget')}
              onChange={(e) => updateProject({ budget: e.target.value === '' ? null : parseFloat(e.target.value) })}
            />
            <span className="text-sm text-muted-foreground">{currency}</span>
          </div>
          <WebhookSettings project={project} updateSettings={updateSettings} />
          <BudgetTracker project={project} rates={rates} />
          <NonLabourCosts
            costs={project.nonLabourCosts || []}
            currency={currency}
            onChange={(costs) => updateProject({ nonLabourCosts: costs })}
          />
        </div>
      )}

      {activeTab === 'risks' && (
        <RiskRegister
          risks={project.risks || []}
          onChange={(newRisks) => updateProject({ risks: newRisks })}
        />
      )}

      {activeTab === 'charts' && <CostCharts project={project} rates={rates} />}
      {activeTab === 'summary' && <ProjectSummary project={project} rates={rates} />}
      {activeTab === 'rates' && <RolesRatesManager rates={rates} onRatesChange={onRatesChange} />}
    </div>
  );
};

export default ProjectView;
