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
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">{t('dashboard.title')}</h1>
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
              <Card key={stat.label}>
                <CardContent className="py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <stat.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                      <p className="text-lg font-bold truncate">{stat.value}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        );
      })()}

      {sortedProjects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <FolderOpen className="w-8 h-8 text-primary" />
              </div>
              <p className="text-lg font-semibold mb-1">{t('dashboard.noProjects')}</p>
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

            return (
              <Card
                key={project.id}
                className={`hover:shadow-md transition-all cursor-pointer group ${
                  compareMode && isSelected ? 'ring-2 ring-primary shadow-md' : ''
                }`}
                onClick={() => compareMode ? toggleCompareSelect(project.id) : onOpenProject(project.id)}
              >
                <CardContent className="py-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      {compareMode && (
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                          isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                        }`}>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
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
                              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 shrink-0">
                                <Users className="w-3 h-3 inline mr-1" />
                                {project.role === 'editor' ? t('dashboard.role.editor') : t('dashboard.role.viewer')}
                              </span>
                            )}
                          </h3>
                        )}
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-sm text-muted-foreground">
                          <span>{t('dashboard.phases', { count: phaseCount, plural: phaseCount > 1 ? 's' : '' })}</span>
                          <span className="text-border">|</span>
                          <span>{t('dashboard.members', { count: memberCount, plural: memberCount > 1 ? 's' : '' })}</span>
                          <span className="text-border">|</span>
                          <span>{totalWeeks} {t('dashboard.weeks')}</span>
                          <span className="text-border">|</span>
                          <span>{t('dashboard.modified')}{new Date(project.updatedAt).toLocaleDateString(getDateLocale(locale))}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">{t('dashboard.totalCost')}</div>
                        <div className="text-xl font-bold">{formatCurrency(totalCost, currency)}</div>
                      </div>

                      {!compareMode && (
                        <div
                          className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
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
                            CSV
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(project.id)} title={t('dashboard.delete')}>
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
