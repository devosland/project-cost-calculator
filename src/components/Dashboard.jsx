import React, { useState } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import {
  PlusCircle, Trash2, Copy, Download, Upload,
  FolderOpen, Pencil, Check, X, GitCompare,
} from 'lucide-react';
import {
  createProject, duplicateProject, deleteProject,
  exportProject, exportProjectCSV, importProjectFromFile,
} from '../lib/projectStore';
import {
  calculateProjectCost, calculateProjectDurationWeeks, formatCurrency,
} from '../lib/costCalculations';

const Dashboard = ({ projects, rates, onProjectsChange, onOpenProject, onCompare }) => {
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState([]);

  const handleCreate = () => {
    const project = createProject();
    onProjectsChange([...projects, project]);
    onOpenProject(project.id);
  };

  const handleDuplicate = (id) => onProjectsChange(duplicateProject(projects, id));
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
          <h1 className="text-3xl font-bold">Projets</h1>
          <p className="text-muted-foreground mt-1">
            {projects.length > 0
              ? `${projects.length} projet${projects.length > 1 ? 's' : ''}`
              : "Commencez par cr\u00e9er un projet"}
          </p>
        </div>
        <div className="flex gap-2">
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
                  ? `Comparer (${selectedForCompare.length})`
                  : "S\u00e9lectionnez 2+"
                : 'Comparer'}
            </Button>
          )}
          {compareMode && (
            <Button variant="ghost" onClick={() => { setCompareMode(false); setSelectedForCompare([]); }}>
              Annuler
            </Button>
          )}
          <Button variant="outline" onClick={handleImport} className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Importer
          </Button>
          <Button onClick={handleCreate} className="flex items-center gap-2">
            <PlusCircle className="w-4 h-4" />
            Nouveau projet
          </Button>
        </div>
      </div>

      {sortedProjects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <FolderOpen className="w-8 h-8 text-primary" />
              </div>
              <p className="text-lg font-semibold mb-1">Aucun projet</p>
              <p className="text-sm text-muted-foreground mb-6">
                {"Cr\u00e9ez un nouveau projet ou importez-en un pour commencer."}
              </p>
              <Button onClick={handleCreate} className="flex items-center gap-2 mx-auto">
                <PlusCircle className="w-4 h-4" />
                Nouveau projet
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
                          <h3 className="text-lg font-semibold truncate">{project.name}</h3>
                        )}
                        <div className="flex gap-3 mt-1 text-sm text-muted-foreground">
                          <span>{phaseCount} phase{phaseCount > 1 ? 's' : ''}</span>
                          <span className="text-border">|</span>
                          <span>{memberCount} membre{memberCount > 1 ? 's' : ''}</span>
                          <span className="text-border">|</span>
                          <span>{totalWeeks} semaines</span>
                          <span className="text-border">|</span>
                          <span>{"Modifi\u00e9 "}{new Date(project.updatedAt).toLocaleDateString('fr-CA')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">{"Co\u00fbt total"}</div>
                        <div className="text-xl font-bold">{formatCurrency(totalCost, currency)}</div>
                      </div>

                      {!compareMode && (
                        <div
                          className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button variant="ghost" size="sm" onClick={() => startRename(project)} title="Renommer">
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDuplicate(project.id)} title="Dupliquer">
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => exportProject(project)} title="Exporter JSON">
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => exportProjectCSV(project, rates)} title="Exporter CSV">
                            CSV
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(project.id)} title="Supprimer">
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
