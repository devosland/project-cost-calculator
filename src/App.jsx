/**
 * Top-level application orchestrator. Mounts the hash-based router, manages
 * global auth state, performs bulk data load on login, runs a 1-second debounced
 * auto-save to the API on every data mutation, and routes between the four main
 * views: Dashboard, ProjectView, CapacityView, and ProfileView.
 *
 * Navigation is entirely URL-hash-driven (useHashRouter) so deep links and
 * browser back/forward work without a server-side router.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import AuthPage from './components/AuthPage'
import Dashboard from './components/Dashboard'
import ProjectView from './components/ProjectView'
import ScenarioComparison from './components/ScenarioComparison'
import CapacityView from './components/CapacityView'
import TemplateManager from './components/TemplateManager'
import ShareDialog from './components/ShareDialog'
import VersionHistory from './components/VersionHistory'
import ProfileView from './components/ProfileView'
import { getRatesConfig } from './config/rates'
import { api } from './lib/api'
import { createProject } from './lib/projectStore'
import { LocaleProvider, useLocale } from './lib/i18n'
import { useHashRouter } from './lib/useHashRouter'
import OnboardingGuide from './components/OnboardingGuide'
import AppShell from './components/layout/AppShell'
import './App.css'

function AppContent() {
  const { locale, setLocale } = useLocale();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [rates, setRates] = useState(null);
  const [projects, setProjects] = useState([]);
  const [compareIds, setCompareIds] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const saveTimer = useRef(null);
  const { segments, navigate } = useHashRouter();

  // Derive view state from URL hash
  const view = segments[0] === 'capacity' ? 'capacity' : segments[0] === 'profile' ? 'profile' : 'projects';
  const activeProjectId = (view === 'projects' && segments[1]) ? segments[1] : null;
  // Tab segment depends on the view:
  //   /projects/:id/:tab → segments[2]
  //   /capacity/:tab     → segments[1]
  // Without this branching, a deep link like #/capacity/gantt would fall back
  // to the default 'resources' tab on mount (state initialised from initialTab
  // prop, and for capacity the tab was being read from the wrong index).
  const hashTab = view === 'capacity' ? (segments[1] || null) : (segments[2] || null);

  const setView = useCallback((v) => {
    if (v === 'capacity') navigate('capacity');
    else if (v === 'profile') navigate('profile');
    else navigate('projects');
  }, [navigate]);
  const setActiveProjectId = useCallback((id) => {
    if (id) navigate(`projects/${id}`);
    else navigate('projects');
  }, [navigate]);

  // Phase 2 state
  const [templates, setTemplates] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shares, setShares] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [snapshots, setSnapshots] = useState([]);

  // Apply saved theme on mount — mirrors ThemeToggle's localStorage key so the
  // choice persists across sessions without a backend preference store.
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === 'dark' || (!saved && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  }, []);

  // Validate the stored JWT on mount so the session is restored without a
  // re-login. If the token is expired or invalid, it is cleared and the user
  // is sent back to AuthPage.
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

  // Bulk load on auth: projects, rates, and templates are fetched together so
  // the app is fully hydrated before the first render. Falls back to locale
  // defaults if the user has no saved rates yet (first login).
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

  // Debounced auto-save: collapses rapid successive edits into a single API
  // call fired 1 second after the last mutation. The timer is stored in a ref
  // so it survives re-renders without creating closure issues.
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
    <>
      <AppShell
        user={user}
        saveStatus={saveStatus}
        currentView={view}
        onNavigate={setView}
        activeProjectName={activeProject?.name || null}
        onNavigateRoot={() => setActiveProjectId(null)}
        locale={locale}
        onLocaleChange={setLocale}
        onLogout={handleLogout}
      >
        {view === 'profile' ? (
          <ProfileView user={user} />
        ) : view === 'capacity' ? (
          <CapacityView rates={rates} initialTab={hashTab || 'resources'} onRatesChange={handleRatesChange} onBack={() => setView('projects')} onDataChanged={() => {
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
            initialTab={hashTab || 'phases'}
            onProjectChange={handleProjectChange}
            onBack={() => setActiveProjectId(null)}
            onOpenShare={handleOpenShare}
            onOpenHistory={handleOpenHistory}
          />
        ) : (
          <>
          <OnboardingGuide
            projects={projects}
            onNavigate={(section, tab) => {
              if (section === 'capacity') {
                navigate(tab ? `capacity/${tab}` : 'capacity');
              } else {
                navigate('projects');
              }
            }}
          />
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
          </>
        )}
      </AppShell>

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
    </>
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
