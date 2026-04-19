/**
 * Project list with aggregate stats, inline rename, compare mode, and
 * import/export actions. Projects are sorted by most-recently-updated first.
 * Compare mode lets the user select ≥ 2 projects then hand the IDs to the
 * parent which mounts ScenarioComparison. The stats row (total cost, avg
 * duration, member count) is only shown when at least one project exists.
 */
import React, { useState } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import {
  PlusCircle, Trash2, Copy, Download, Upload,
  FolderOpen, Pencil, Check, X, GitCompare, LayoutTemplate, Users,
  BarChart3, DollarSign, Clock, UsersRound,
} from 'lucide-react';
import {
  createProject, duplicateProject, deleteProject,
  exportProject, exportProjectCSV, importProjectFromFile,
} from '../lib/projectStore';

import {
  calculateProjectCost, calculateProjectDurationWeeks, formatCurrency,
} from '../lib/costCalculations';

import { useLocale, getDateLocale } from '../lib/i18n';

/**
 * @param {Object} props
 * @param {Array<Object>} props.projects - Full list of project objects.
 * @param {Object} props.rates - Enterprise rate table for cost display.
 * @param {function(Array<Object>): void} props.onProjectsChange - Replace the
 *   full projects array (create, duplicate, delete, rename all go through here).
 * @param {function(string): void} props.onOpenProject - Open a project by ID.
 * @param {function(Array<string>): void} props.onCompare - Trigger scenario
 *   comparison with the given project IDs.
 * @param {Array<Object>} props.templates - Available saved templates.
 * @param {function(string): void} props.onSaveTemplate - Save current project as template.
 * @param {function(Object): void} props.onLoadTemplate - Create a new project from template.
 * @param {function(string): void} props.onDeleteTemplate - Delete a template by ID.
 * @param {boolean} props.showTemplates - Whether the TemplateManager modal is open.
 * @param {function(): void} props.onToggleTemplates - Open the TemplateManager modal.
 */
const Dashboard = ({ projects, rates, onProjectsChange, onOpenProject, onCompare, templates, onSaveTemplate, onLoadTemplate, onDeleteTemplate, showTemplates, onToggleTemplates }) => {
  const { t, locale } = useLocale();
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState([]);

  const handleCreate = () => {
    const project = createProject(t('dashboard.newProject'));
    onProjectsChange([...projects, project]);
    onOpenProject(project.id);
  };

  const handleDuplicate = (id) => onProjectsChange(duplicateProject(projects, id, t('dashboard.copy')));
  const handleDelete = (id) => {
    onProjectsChange(deleteProject(projects, id));
    setSelectedForCompare((prev) => prev.filter((x) => x !== id));
  };

  const handleImport = async () => {
    try {
      const project = await importProjectFromFile();
      onProjectsChange([...projects, project]);
    } catch { /* cancelled */ }
  };

  const startRename = (project) => { setRenamingId(project.id); setRenameValue(project.name); };
  const saveRename = () => {
    if (!renameValue.trim()) return;
    onProjectsChange(projects.map((p) =>
      p.id === renamingId ? { ...p, name: renameValue.trim(), updatedAt: new Date().toISOString() } : p
    ));
    setRenamingId(null);
  };
  const cancelRename = () => { setRenamingId(null); setRenameValue(''); };
  const handleKeyDown = (e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') cancelRename(); };
  const toggleCompareSelect = (id) => {
    setSelectedForCompare((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const sortedProjects = [...projects].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="flex flex-wrap justify-between items-start gap-4 mb-8">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {projects.length > 0
              ? t('dashboard.projectCount', { count: projects.length, plural: projects.length > 1 ? 's' : '' })
              : t('dashboard.startMessage')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {projects.length >= 2 && (
            <Button
              variant={compareMode ? 'default' : 'outline'}
              onClick={() => {
                if (compareMode && selectedForCompare.length >= 2) {
                  onCompare(selectedForCompare);
                } else {
                  setCompareMode(!compareMode);
                  setSelectedForCompare([]);
                }
              }}
              className="flex items-center gap-2"
            >
              <GitCompare className="w-4 h-4" />
              {compareMode
                ? selectedForCompare.length >= 2
                  ? `${t('dashboard.compare')} (${selectedForCompare.length})`
                  : t('dashboard.compareSelect')
                : t('dashboard.compare')}
            </Button>
          )}
          {compareMode && (
            <Button variant="ghost" onClick={() => { setCompareMode(false); setSelectedForCompare([]); }}>
              {t('dashboard.cancel')}
            </Button>
          )}
          <Button variant="outline" onClick={onToggleTemplates} className="flex items-center gap-2">
            <LayoutTemplate className="w-4 h-4" />
            {t('dashboard.templates')}
          </Button>
          <Button variant="outline" onClick={handleImport} className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
            {t('dashboard.import')}
          </Button>
          <Button onClick={handleCreate} className="flex items-center gap-2">
            <PlusCircle className="w-4 h-4" />
            {t('dashboard.newProject')}
          </Button>
        </div>
      </div>

      {sortedProjects.length > 0 && (() => {
        const totalCostAll = projects.reduce((sum, p) => {
          return sum + calculateProjectCost(p, rates);
        }, 0);
        const totalWeeksAll = projects.reduce((sum, p) => {
          return sum + calculateProjectDurationWeeks(p);
        }, 0);
        const avgWeeks = projects.length > 0 ? (totalWeeksAll / projects.length) : 0;
        const totalMembers = projects.reduce((sum, p) => {
          return sum + p.phases.reduce((s, ph) => s + ph.teamMembers.reduce((s2, m) => s2 + m.quantity, 0), 0);
        }, 0);
        const primaryCurrency = projects[0]?.settings?.currency || 'CAD';

        const stats = [
          { icon: BarChart3, label: t('dashboard.stats.projects'), value: `${projects.length}` },
          { icon: DollarSign, label: t('dashboard.stats.totalCost'), value: formatCurrency(totalCostAll, primaryCurrency) },
          { icon: Clock, label: t('dashboard.stats.avgDuration'), value: `${avgWeeks.toFixed(1)} ${t('dashboard.stats.weeks')}` },
          { icon: UsersRound, label: t('dashboard.stats.members'), value: `${totalMembers}` },
        ];

        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {stats.map((stat) => (
              <Card key={stat.label} className="shadow-sm">
                <CardContent className="py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <stat.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                      <p className="font-mono text-lg font-semibold tabular-nums truncate">{stat.value}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        );
      })()}

      {sortedProjects.length === 0 ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="py-16">
            <div className="text-center">
              <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <FolderOpen className="w-8 h-8 text-primary" />
              </div>
              <p className="font-display text-xl font-semibold mb-1">{t('dashboard.noProjects')}</p>
              <p className="text-sm text-muted-foreground mb-6">
                {t('dashboard.startMessage')}
              </p>
              <Button onClick={handleCreate} className="flex items-center gap-2 mx-auto">
                <PlusCircle className="w-4 h-4" />
                {t('dashboard.newProject')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {sortedProjects.map((project) => {
            const currency = project.settings?.currency || 'CAD';
            const totalCost = calculateProjectCost(project, rates);
            const totalWeeks = calculateProjectDurationWeeks(project);
            const phaseCount = project.phases.length;
            const memberCount = project.phases.reduce(
              (sum, p) => sum + p.teamMembers.reduce((s, m) => s + m.quantity, 0), 0
            );
            const isSelected = selectedForCompare.includes(project.id);

            const handleCardActivate = () => {
              if (renamingId === project.id) return;
              if (compareMode) toggleCompareSelect(project.id);
              else onOpenProject(project.id);
            };
            const handleCardKeyDown = (e) => {
              if (renamingId === project.id) return;
              // Only activate when the event fires directly on the Card itself.
              // Prevents Enter/Space on nested action buttons (rename, delete, etc.)
              // from bubbling up and triggering the card's open/select.
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleCardActivate();
              }
            };

            return (
              <Card
                key={project.id}
                role="button"
                tabIndex={0}
                onClick={handleCardActivate}
                onKeyDown={handleCardKeyDown}
                aria-pressed={compareMode ? isSelected : undefined}
                className={`shadow-sm hover:shadow-md transition-all cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  compareMode && isSelected ? 'ring-2 ring-primary shadow-md' : ''
                }`}
              >
                <CardContent className="py-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      {compareMode && (
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                          isSelected ? 'bg-primary border-primary' : 'border-border'
                        }`}>
                          {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                        </div>
                      )}
                      <div className="min-w-0">
                        {renamingId === project.id ? (
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              className="input-field text-lg font-semibold w-64"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              autoFocus
                            />
                            <Button variant="ghost" size="sm" onClick={saveRename}><Check className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="sm" onClick={cancelRename}><X className="w-4 h-4" /></Button>
                          </div>
                        ) : (
                          <h3 className="text-lg font-semibold truncate flex items-center gap-2">
                            {project.name}
                            {project.role && project.role !== 'owner' && (
                              <span
                                className="text-xs font-medium px-2 py-0.5 rounded-full border shrink-0"
                                style={{
                                  backgroundColor: 'color-mix(in srgb, var(--prism-sage) 18%, transparent)',
                                  color: 'var(--prism-sage)',
                                  borderColor: 'color-mix(in srgb, var(--prism-sage) 35%, transparent)',
                                }}
                              >
                                <Users className="w-3 h-3 inline mr-1" />
                                {project.role === 'editor' ? t('dashboard.role.editor') : t('dashboard.role.viewer')}
                              </span>
                            )}
                          </h3>
                        )}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-sm text-muted-foreground">
                          <span>{t('dashboard.phases', { count: phaseCount, plural: phaseCount > 1 ? 's' : '' })}</span>
                          <span aria-hidden="true">·</span>
                          <span>{t('dashboard.members', { count: memberCount, plural: memberCount > 1 ? 's' : '' })}</span>
                          <span aria-hidden="true">·</span>
                          <span>{totalWeeks} {t('dashboard.weeks')}</span>
                          <span aria-hidden="true">·</span>
                          <span>{t('dashboard.modified')}{new Date(project.updatedAt).toLocaleDateString(getDateLocale(locale))}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">{t('dashboard.totalCost')}</div>
                        <div className="font-mono text-xl font-semibold tabular-nums">{formatCurrency(totalCost, currency)}</div>
                      </div>

                      {!compareMode && (
                        <div
                          className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button variant="ghost" size="sm" onClick={() => startRename(project)} title={t('dashboard.rename')}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDuplicate(project.id)} title={t('dashboard.duplicate')}>
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => exportProject(project)} title={t('dashboard.exportJSON')}>
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => exportProjectCSV(project, rates)} title={t('dashboard.exportCSV')}>
                            <span className="font-mono text-xs">CSV</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(project.id)}
                            title={t('dashboard.delete')}
                            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
