import { useState, useEffect } from 'react'
import Dashboard from './components/Dashboard'
import ProjectView from './components/ProjectView'
import ScenarioComparison from './components/ScenarioComparison'
import { getRatesConfig } from './config/rates'
import { loadProjects, saveProjects, updateProject } from './lib/projectStore'
import './App.css'

const RATES_STORAGE_KEY = 'project-cost-calculator-rates';

function App() {
  const [rates, setRates] = useState(null);
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [compareIds, setCompareIds] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem(RATES_STORAGE_KEY);
    if (saved) {
      try {
        setRates(JSON.parse(saved));
        return;
      } catch {
        // fall through
      }
    }
    getRatesConfig().then(config => {
      setRates({
        INTERNAL_RATE: config.INTERNAL_RATE,
        CONSULTANT_RATES: config.CONSULTANT_RATES,
      });
    });
  }, []);

  useEffect(() => {
    setProjects(loadProjects());
  }, []);

  const handleRatesChange = (newRates) => {
    setRates(newRates);
    localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(newRates));
  };

  const handleProjectsChange = (newProjects) => {
    setProjects(newProjects);
    saveProjects(newProjects);
  };

  const handleProjectChange = (updatedProject) => {
    const newProjects = updateProject(projects, updatedProject.id, updatedProject);
    setProjects(newProjects);
  };

  if (!rates) return null;

  const activeProject = projects.find(p => p.id === activeProjectId);

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="bg-white border-b sticky top-0 z-20 print:hidden">
        <div className="container mx-auto px-4 h-14 flex items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-white font-bold text-sm">PC</span>
            </div>
            <span className="font-semibold text-lg tracking-tight">Planificateur</span>
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
