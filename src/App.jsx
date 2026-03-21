import { useState, useEffect, useCallback, useRef } from 'react'
import AuthPage from './components/AuthPage'
import Dashboard from './components/Dashboard'
import ProjectView from './components/ProjectView'
import ScenarioComparison from './components/ScenarioComparison'
import CapacityView from './components/CapacityView'
import TemplateManager from './components/TemplateManager'
import ShareDialog from './components/ShareDialog'
import VersionHistory from './components/VersionHistory'
import { getRatesConfig } from './config/rates'
import { api } from './lib/api'
import { createProject } from './lib/projectStore'
import { LogOut, User, LayoutDashboard, BarChart3 } from 'lucide-react'
import { Button } from './components/ui/button'
import SaveIndicator from './components/SaveIndicator'
import ThemeToggle from './components/ThemeToggle'
import { LocaleProvider, useLocale } from './lib/i18n'
import './App.css'

function AppContent() {
  const { t, locale, setLocale } = useLocale();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [rates, setRates] = useState(null);
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [compareIds, setCompareIds] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const saveTimer = useRef(null);

  // Phase 2 state
  const [templates, setTemplates] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shares, setShares] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [view, setView] = useState('projects');

  // Apply saved theme on mount
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === 'dark' || (!saved && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  }, []);

  // Check existing token on mount
  useEffect(() => {
    const token = api.getToken();
    if (token) {
      api.getMe()
        .then((data) => {
          setUser(data.user);
          setAuthChecked(true);
        })
        .catch(() => {
          api.clearToken();
          setAuthChecked(true);
        });
    } else {
      setAuthChecked(true);
    }
  }, []);

  // Load data from API when user is authenticated
  useEffect(() => {
    if (!user) return;

    api.loadData()
      .then(async (data) => {
        if (data.projects && data.projects.length > 0) {
          setProjects(data.projects);
        }
        if (data.rates) {
          setRates(data.rates);
        } else {
          const config = await getRatesConfig(locale);
          setRates({
            INTERNAL_RATE: config.INTERNAL_RATE,
            CONSULTANT_RATES: config.CONSULTANT_RATES,
          });
        }
      })
      .catch(async () => {
        const config = await getRatesConfig(locale);
        setRates({
          INTERNAL_RATE: config.INTERNAL_RATE,
          CONSULTANT_RATES: config.CONSULTANT_RATES,
        });
      });

    // Load templates
    api.getTemplates().then(setTemplates).catch(() => {});
  }, [user]);

  // Debounced save to API
  const saveToApi = useCallback((newProjects, newRates) => {
    if (!user) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus('saving');
    saveTimer.current = setTimeout(() => {
      api.saveData(newProjects, newRates)
        .then(() => setSaveStatus('saved'))
        .catch((err) => {
          console.error('Failed to save data:', err);
          setSaveStatus('error');
        });
    }, 1000);
  }, [user]);

  const handleAuth = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    api.clearToken();
    setUser(null);
    setRates(null);
    setProjects([]);
    setActiveProjectId(null);
    setCompareIds(null);
  };

  const handleRatesChange = (newRates) => {
    setRates(newRates);
    saveToApi(projects, newRates);
  };

  const handleProjectsChange = (newProjects) => {
    setProjects(newProjects);
    saveToApi(newProjects, rates);
  };

  const handleProjectChange = (updatedProject) => {
    const newProjects = projects.map((p) =>
      p.id === updatedProject.id
        ? { ...p, ...updatedProject, updatedAt: new Date().toISOString() }
        : p
    );
    setProjects(newProjects);
    saveToApi(newProjects, rates);
  };

  // Template handlers
  const handleSaveTemplate = async (name) => {
    const activeProject = projects.find(p => p.id === activeProjectId);
    const projectData = activeProject || createProject();
    try {
      const tmpl = await api.saveTemplate(name, projectData);
      setTemplates((prev) => [tmpl, ...prev]);
      setShowTemplates(false);
    } catch (err) {
      console.error('Save template error:', err);
    }
  };

  const handleLoadTemplate = (template) => {
    const newProject = {
      ...template.data,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name: template.data.name || template.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    // Regenerate phase IDs
    if (newProject.phases) {
      newProject.phases = newProject.phases.map((phase) => ({
        ...phase,
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        milestones: (phase.milestones || []).map((m) => ({
          ...m,
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        })),
      }));
    }
    const newProjects = [...projects, newProject];
    setProjects(newProjects);
    saveToApi(newProjects, rates);
    setShowTemplates(false);
    setActiveProjectId(newProject.id);
  };

  const handleDeleteTemplate = async (templateId) => {
    try {
      await api.deleteTemplate(templateId);
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    } catch (err) {
      console.error('Delete template error:', err);
    }
  };

  // Share handlers
  const handleOpenShare = async () => {
    if (!activeProjectId) return;
    try {
      const data = await api.getShares(activeProjectId);
      setShares(data);
    } catch { setShares([]); }
    setShowShare(true);
  };

  const handleShare = async (email, role) => {
    await api.shareProject(activeProjectId, email, role);
    const data = await api.getShares(activeProjectId);
    setShares(data);
  };

  const handleUnshare = async (userId) => {
    try {
      await api.unshareProject(activeProjectId, userId);
      setShares((prev) => prev.filter((s) => s.user_id !== userId));
    } catch (err) {
      console.error('Unshare error:', err);
    }
  };

  // Version history handlers
  const handleOpenHistory = async () => {
    if (!activeProjectId) return;
    try {
      const data = await api.getSnapshots(activeProjectId);
      setSnapshots(data);
    } catch { setSnapshots([]); }
    setShowHistory(true);
  };

  const handleCreateSnapshot = async (label) => {
    if (!activeProjectId) return;
    try {
      const snapshot = await api.createSnapshot(activeProjectId, label);
      setSnapshots((prev) => [snapshot, ...prev]);
    } catch (err) {
      console.error('Create snapshot error:', err);
    }
  };

  const handleRestoreSnapshot = async (snapshotId) => {
    try {
      const result = await api.restoreSnapshot(snapshotId);
      if (result.data) {
        const restoredProject = { ...result.data, id: result.id, name: result.name };
        setProjects((prev) => prev.map((p) => p.id === restoredProject.id ? restoredProject : p));
      }
      setShowHistory(false);
    } catch (err) {
      console.error('Restore snapshot error:', err);
    }
  };

  if (!authChecked) return null;

  if (!user) {
    return <AuthPage onAuth={handleAuth} />;
  }

  if (!rates) return null;

  const activeProject = projects.find(p => p.id === activeProjectId);

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="bg-white border-b sticky top-0 z-20 print:hidden">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-white font-bold text-sm">PC</span>
            </div>
            <span className="font-semibold text-lg tracking-tight">{t('app.name')}</span>
            <div className="flex items-center gap-1 ml-4">
              <Button
                variant={view === 'projects' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => { setView('projects'); setActiveProjectId(null); }}
                className="flex items-center gap-1.5"
              >
                <LayoutDashboard className="w-4 h-4" />
                {t('dashboard.title')}
              </Button>
              <Button
                variant={view === 'capacity' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => { setView('capacity'); setActiveProjectId(null); }}
                className="flex items-center gap-1.5"
              >
                <BarChart3 className="w-4 h-4" />
                {t('capacity.title')}
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="w-4 h-4" />
              <span className="hidden sm:inline">{user.name}</span>
            </div>
            <SaveIndicator status={saveStatus} />
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')}
              className="text-muted-foreground hover:text-foreground font-medium"
            >
              {locale === 'fr' ? 'EN' : 'FR'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-muted-foreground hover:text-foreground"
              title={t('app.logout')}
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {view === 'capacity' ? (
          <CapacityView rates={rates} onBack={() => setView('projects')} onDataChanged={() => {
            api.loadData().then((data) => {
              if (data.projects) setProjects(data.projects);
            }).catch(() => {});
          }} />
        ) : compareIds ? (
          <ScenarioComparison
            projects={projects}
            rates={rates}
            selectedIds={compareIds}
            onClose={() => setCompareIds(null)}
          />
        ) : activeProject ? (
          <ProjectView
            project={activeProject}
            rates={rates}
            onProjectChange={handleProjectChange}
            onRatesChange={handleRatesChange}
            onBack={() => setActiveProjectId(null)}
            onOpenShare={handleOpenShare}
            onOpenHistory={handleOpenHistory}
          />
        ) : (
          <Dashboard
            projects={projects}
            rates={rates}
            onProjectsChange={handleProjectsChange}
            onOpenProject={setActiveProjectId}
            onCompare={setCompareIds}
            templates={templates}
            onSaveTemplate={handleSaveTemplate}
            onLoadTemplate={handleLoadTemplate}
            onDeleteTemplate={handleDeleteTemplate}
            showTemplates={showTemplates}
            onToggleTemplates={() => setShowTemplates(true)}
          />
        )}
      </main>

      {/* Modals */}
      <TemplateManager
        open={showTemplates}
        onClose={() => setShowTemplates(false)}
        templates={templates}
        onSaveTemplate={handleSaveTemplate}
        onLoadTemplate={handleLoadTemplate}
        onDeleteTemplate={handleDeleteTemplate}
        currentProject={activeProject}
      />

      <ShareDialog
        open={showShare}
        onClose={() => setShowShare(false)}
        shares={shares}
        onShare={handleShare}
        onUnshare={handleUnshare}
      />

      <VersionHistory
        open={showHistory}
        onClose={() => setShowHistory(false)}
        snapshots={snapshots}
        onCreateSnapshot={handleCreateSnapshot}
        onRestoreSnapshot={handleRestoreSnapshot}
      />
    </div>
  );
}

function App() {
  return (
    <LocaleProvider>
      <AppContent />
    </LocaleProvider>
  );
}

export default App
