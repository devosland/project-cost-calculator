import React, { useState } from 'react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Dropdown } from './ui/dropdown';
import {
  ArrowLeft, PlusCircle, Trash2, ChevronUp, ChevronDown,
  LayoutDashboard, Calendar, Settings, DollarSign, BarChart3, FileText,
  Share2, History,
} from 'lucide-react';
import PhaseEditor from './PhaseEditor';
import TimelineView from './TimelineView';
import RolesRatesManager from './RolesRatesManager';
import BudgetTracker from './BudgetTracker';
import NonLabourCosts from './NonLabourCosts';
import CostCharts from './CostCharts';
import ProjectSummary from './ProjectSummary';
import { createPhase } from '../lib/projectStore';
import {
  calculateProjectCost, calculateProjectDurationWeeks, formatCurrency, CURRENCIES,
} from '../lib/costCalculations';

const useQuery = () => new URLSearchParams(window.location.search);

const TABS = [
  { id: 'phases', label: 'Phases', icon: LayoutDashboard },
  { id: 'timeline', label: 'Ligne de temps', icon: Calendar },
  { id: 'budget', label: 'Budget', icon: DollarSign },
  { id: 'charts', label: 'Graphiques', icon: BarChart3 },
  { id: 'summary', label: 'Rapport', icon: FileText },
  { id: 'rates', label: 'Taux', icon: Settings },
];

const ProjectView = ({ project, rates, onProjectChange, onRatesChange, onBack, onOpenShare, onOpenHistory }) => {
  const query = useQuery();
  const isAuthorized = query.get('r') === 'true';
  const [activeTab, setActiveTab] = useState('phases');

  const currency = project.settings?.currency || 'CAD';
  const fmt = (v) => formatCurrency(v, currency);

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
    updateProject({ phases: project.phases.filter((p) => p.id !== phaseId) });
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
            Projets
          </Button>
          <h1 className="text-2xl font-bold">{project.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onOpenHistory} className="text-muted-foreground hover:text-foreground" title="Historique">
            <History className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenShare} className="text-muted-foreground hover:text-foreground" title="Partager">
            <Share2 className="w-4 h-4" />
          </Button>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">{totalWeeks} semaines</div>
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
              <Label className="text-sm font-medium">Contingence</Label>
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
              <Label className="text-sm font-medium">Taxes (4,9875%)</Label>
              <Switch
                checked={project.settings.includeTaxes}
                onCheckedChange={(val) => updateSettings({ includeTaxes: val })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Devise</Label>
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
              />
              {project.phases.length > 1 && (
                <div className="absolute -right-10 top-4 hidden sm:block">
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500"
                    onClick={() => removePhase(phase.id)} title="Supprimer la phase">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>
          ))}

          <Button variant="outline" onClick={addPhase} className="w-full flex items-center justify-center gap-2 border-dashed h-12">
            <PlusCircle className="w-4 h-4" />
            Ajouter une phase
          </Button>

          <div className="p-6 rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
              <div>
                <div className="text-sm text-muted-foreground">{"Dur\u00e9e totale"}</div>
                <div className="text-2xl font-bold">{totalWeeks} semaines</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">{"Co\u00fbt total"}</div>
                <div className="text-3xl font-bold text-primary">{fmt(totalCost)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Phases</div>
                <div className="text-2xl font-bold">{project.phases.length}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'timeline' && <TimelineView project={project} rates={rates} currency={currency} />}

      {activeTab === 'budget' && (
        <div className="space-y-6">
          <div className="flex items-center gap-4 p-5 bg-white border rounded-xl shadow-sm">
            <Label className="text-sm font-medium">Budget du projet</Label>
            <input
              type="number"
              className="input-field w-40"
              value={project.budget || ''}
              min="0" step="100"
              placeholder="Aucun budget"
              onChange={(e) => updateProject({ budget: e.target.value === '' ? null : parseFloat(e.target.value) })}
            />
            <span className="text-sm text-muted-foreground">{currency}</span>
          </div>
          <BudgetTracker project={project} rates={rates} />
          <NonLabourCosts
            costs={project.nonLabourCosts || []}
            currency={currency}
            onChange={(costs) => updateProject({ nonLabourCosts: costs })}
          />
        </div>
      )}

      {activeTab === 'charts' && <CostCharts project={project} rates={rates} />}
      {activeTab === 'summary' && <ProjectSummary project={project} rates={rates} />}
      {activeTab === 'rates' && <RolesRatesManager rates={rates} onRatesChange={onRatesChange} />}
    </div>
  );
};

export default ProjectView;
