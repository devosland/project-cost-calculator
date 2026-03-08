import { useState, useEffect, useCallback, useRef } from 'react'
import AuthPage from './components/AuthPage'
import Dashboard from './components/Dashboard'
import ProjectView from './components/ProjectView'
import ScenarioComparison from './components/ScenarioComparison'
import { getRatesConfig } from './config/rates'
import { api } from './lib/api'
import { LogOut, User } from 'lucide-react'
import { Button } from './components/ui/button'
import './App.css'

function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [rates, setRates] = useState(null);
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [compareIds, setCompareIds] = useState(null);
  const saveTimer = useRef(null);

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
          const config = await getRatesConfig();
          setRates({
            INTERNAL_RATE: config.INTERNAL_RATE,
            CONSULTANT_RATES: config.CONSULTANT_RATES,
          });
        }
      })
      .catch(async () => {
        const config = await getRatesConfig();
        setRates({
          INTERNAL_RATE: config.INTERNAL_RATE,
          CONSULTANT_RATES: config.CONSULTANT_RATES,
        });
      });
  }, [user]);

  // Debounced save to API
  const saveToApi = useCallback((newProjects, newRates) => {
    if (!user) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.saveData(newProjects, newRates).catch((err) => {
        console.error('Failed to save data:', err);
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
            <span className="font-semibold text-lg tracking-tight">Planificateur</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="w-4 h-4" />
              <span>{user.name}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-muted-foreground hover:text-foreground"
              title={"D\u00e9connexion"}
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {compareIds ? (
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
          />
        ) : (
          <Dashboard
            projects={projects}
            rates={rates}
            onProjectsChange={handleProjectsChange}
            onOpenProject={setActiveProjectId}
            onCompare={setCompareIds}
          />
        )}
      </main>
    </div>
  );
}

export default App
