import { useState, useEffect } from 'react'
import ProjectCostCalculator from './components/ProjectCostCalculator'
import RolesRatesManager from './components/RolesRatesManager'
import { getRatesConfig } from './config/rates'
import './App.css'

const STORAGE_KEY = 'project-cost-calculator-rates';

function App() {
  const [activeTab, setActiveTab] = useState('calculator');
  const [rates, setRates] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setRates(JSON.parse(saved));
        return;
      } catch {
        // ignore invalid JSON, fall through to load defaults
      }
    }
    getRatesConfig().then(config => {
      setRates({
        INTERNAL_RATE: config.INTERNAL_RATE,
        CONSULTANT_RATES: config.CONSULTANT_RATES,
      });
    });
  }, []);

  const handleRatesChange = (newRates) => {
    setRates(newRates);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newRates));
  };

  if (!rates) return null;

  return (
    <div className="container mx-auto p-4">
      <div className="w-full max-w-4xl mx-auto mb-4">
        <nav className="flex gap-1 border-b">
          <button
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'calculator'
                ? 'border-b-2 border-primary text-primary'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('calculator')}
          >
            Calculateur
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'roles'
                ? 'border-b-2 border-primary text-primary'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('roles')}
          >
            Rôles et taux
          </button>
        </nav>
      </div>

      {activeTab === 'calculator' && (
        <ProjectCostCalculator rates={rates} />
      )}
      {activeTab === 'roles' && (
        <RolesRatesManager rates={rates} onRatesChange={handleRatesChange} />
      )}
    </div>
  )
}

export default App
