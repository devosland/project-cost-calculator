import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { PlusCircle, Trash2, AlertTriangle } from 'lucide-react';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getScoreColor(score) {
  if (score <= 6) return 'bg-green-100 text-green-800';
  if (score <= 15) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-800';
}

function getScoreBgColor(score) {
  if (score <= 6) return 'bg-green-500';
  if (score <= 15) return 'bg-amber-500';
  return 'bg-red-500';
}

const RiskMatrix = ({ risks }) => {
  // Build a 5x5 matrix (probability on Y axis top-to-bottom 5->1, impact on X axis 1->5)
  const matrix = {};
  for (let p = 1; p <= 5; p++) {
    for (let i = 1; i <= 5; i++) {
      matrix[`${p}-${i}`] = 0;
    }
  }
  for (const risk of risks) {
    const key = `${risk.probability}-${risk.impact}`;
    matrix[key] = (matrix[key] || 0) + 1;
  }

  return (
    <div className="mb-6">
      <h4 className="text-sm font-semibold mb-2">{"Matrice de risques"}</h4>
      <div className="inline-block">
        <div className="flex items-end gap-0">
          <div className="flex flex-col items-center mr-1">
            <span className="text-xs text-muted-foreground mb-1 -rotate-90 origin-center w-4">{"Probabilité"}</span>
          </div>
          <div>
            {[5, 4, 3, 2, 1].map((prob) => (
              <div key={prob} className="flex items-center gap-0">
                <span className="text-xs text-muted-foreground w-4 text-right mr-1">{prob}</span>
                {[1, 2, 3, 4, 5].map((impact) => {
                  const count = matrix[`${prob}-${impact}`];
                  const score = prob * impact;
                  return (
                    <div
                      key={impact}
                      className={`w-10 h-10 border border-white/50 flex items-center justify-center text-xs font-bold ${
                        count > 0
                          ? `${getScoreBgColor(score)} text-white`
                          : score <= 6
                          ? 'bg-green-50'
                          : score <= 15
                          ? 'bg-amber-50'
                          : 'bg-red-50'
                      }`}
                      title={`P${prob} x I${impact} = ${score}`}
                    >
                      {count > 0 ? count : ''}
                    </div>
                  );
                })}
              </div>
            ))}
            <div className="flex items-center gap-0">
              <span className="w-4 mr-1" />
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className="w-10 text-center text-xs text-muted-foreground">{i}</span>
              ))}
            </div>
            <div className="text-xs text-muted-foreground text-center mt-0.5 ml-5">Impact</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const RiskRegister = ({ risks = [], onChange }) => {
  const addRisk = () => {
    onChange([
      ...risks,
      {
        id: generateId(),
        name: '',
        description: '',
        probability: 3,
        impact: 3,
        phase: '',
        mitigation: '',
      },
    ]);
  };

  const updateRisk = (id, field, value) => {
    onChange(risks.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const removeRisk = (id) => {
    onChange(risks.filter((r) => r.id !== id));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            {"Registre des risques"}
          </CardTitle>
          <Button size="sm" onClick={addRisk} className="flex items-center gap-2">
            <PlusCircle className="w-4 h-4" />
            {"Ajouter un risque"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {risks.length > 0 && <RiskMatrix risks={risks} />}

        {risks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {"Aucun risque enregistré. Cliquez sur \"Ajouter un risque\" pour commencer."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2 text-muted-foreground font-medium">Risque</th>
                  <th className="p-2 text-center text-muted-foreground font-medium">{"Probabilité"}</th>
                  <th className="p-2 text-center text-muted-foreground font-medium">Impact</th>
                  <th className="p-2 text-center text-muted-foreground font-medium">Score</th>
                  <th className="p-2 text-muted-foreground font-medium">Phase</th>
                  <th className="p-2 text-muted-foreground font-medium">{"Atténuation"}</th>
                  <th className="p-2 text-center text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {risks.map((risk) => {
                  const score = risk.probability * risk.impact;
                  return (
                    <tr key={risk.id} className="border-b last:border-b-0 hover:bg-secondary/30 transition-colors">
                      <td className="p-2">
                        <input
                          type="text"
                          className="input-field w-full text-sm"
                          value={risk.name}
                          onChange={(e) => updateRisk(risk.id, 'name', e.target.value)}
                          placeholder="Nom du risque"
                        />
                      </td>
                      <td className="p-2">
                        <select
                          className="select-field text-center"
                          value={risk.probability}
                          onChange={(e) => updateRisk(risk.id, 'probability', parseInt(e.target.value))}
                        >
                          {[1, 2, 3, 4, 5].map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <select
                          className="select-field text-center"
                          value={risk.impact}
                          onChange={(e) => updateRisk(risk.id, 'impact', parseInt(e.target.value))}
                        >
                          {[1, 2, 3, 4, 5].map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2 text-center">
                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${getScoreColor(score)}`}>
                          {score}
                        </span>
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          className="input-field w-full text-sm"
                          value={risk.phase}
                          onChange={(e) => updateRisk(risk.id, 'phase', e.target.value)}
                          placeholder="Phase"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          className="input-field w-full text-sm"
                          value={risk.mitigation}
                          onChange={(e) => updateRisk(risk.id, 'mitigation', e.target.value)}
                          placeholder={"Stratégie d'atténuation"}
                        />
                      </td>
                      <td className="p-2 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRisk(risk.id)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RiskRegister;
