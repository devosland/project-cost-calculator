import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { PlusCircle, Trash2 } from 'lucide-react';
import { formatCurrency } from '../lib/costCalculations';

const CATEGORIES = [
  'Infrastructure',
  'Licences',
  'SaaS / Outils',
  'Voyage',
  'Formation',
  'Mat\u00e9riel',
  'Autre',
];

const NonLabourCosts = ({ costs, currency, onChange }) => {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState(CATEGORIES[0]);
  const [newAmount, setNewAmount] = useState('');

  const fmt = (v) => formatCurrency(v, currency);

  const addCost = () => {
    const amount = parseFloat(newAmount);
    if (!newName.trim() || isNaN(amount) || amount <= 0) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    onChange([...costs, { id, name: newName.trim(), category: newCategory, amount }]);
    setNewName('');
    setNewAmount('');
    setAdding(false);
  };

  const removeCost = (id) => {
    onChange(costs.filter((c) => c.id !== id));
  };

  const updateCost = (id, field, value) => {
    onChange(costs.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const total = costs.reduce((sum, c) => sum + c.amount, 0);
  const byCategory = {};
  for (const c of costs) {
    byCategory[c.category] = (byCategory[c.category] || 0) + c.amount;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>{"Co\u00fbts non li\u00e9s \u00e0 la main-d\u2019\u0153uvre"}</CardTitle>
          {!adding && (
            <Button
              size="sm"
              onClick={() => setAdding(true)}
              className="flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              Ajouter
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {adding && (
            <div className="p-4 border rounded-xl bg-secondary/30 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <input
                  type="text"
                  className="input-field"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nom"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addCost();
                    if (e.key === 'Escape') setAdding(false);
                  }}
                />
                <select
                  className="select-field"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <input
                  type="number"
                  className="input-field"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  placeholder="Montant"
                  min="0"
                  step="0.01"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addCost();
                    if (e.key === 'Escape') setAdding(false);
                  }}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={addCost}>Ajouter</Button>
                <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Annuler</Button>
              </div>
            </div>
          )}

          {costs.length === 0 && !adding && (
            <p className="text-sm text-muted-foreground text-center py-6">
              {"Aucun co\u00fbt suppl\u00e9mentaire. Ajoutez des co\u00fbts d\u2019infrastructure, licences, etc."}
            </p>
          )}

          {costs.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2 font-medium text-muted-foreground">Nom</th>
                  <th className="p-2 font-medium text-muted-foreground">{"Cat\u00e9gorie"}</th>
                  <th className="p-2 text-right font-medium text-muted-foreground">Montant</th>
                  <th className="p-2 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {costs.map((cost) => (
                  <tr key={cost.id} className="border-b last:border-b-0 hover:bg-secondary/30 transition-colors">
                    <td className="p-2">
                      <input
                        type="text"
                        className="bg-transparent border-0 p-0 w-full focus:outline-none"
                        value={cost.name}
                        onChange={(e) => updateCost(cost.id, 'name', e.target.value)}
                      />
                    </td>
                    <td className="p-2">
                      <select
                        className="bg-transparent border-0 p-0 text-sm focus:outline-none"
                        value={cost.category}
                        onChange={(e) => updateCost(cost.id, 'category', e.target.value)}
                      >
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2 text-right">
                      <input
                        type="number"
                        className="bg-transparent border-0 p-0 w-24 text-right focus:outline-none"
                        value={cost.amount}
                        min="0"
                        step="0.01"
                        onChange={(e) => updateCost(cost.id, 'amount', parseFloat(e.target.value) || 0)}
                      />
                    </td>
                    <td className="p-2 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
                        onClick={() => removeCost(cost.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td className="p-2" colSpan="2">Total</td>
                  <td className="p-2 text-right">{fmt(total)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}

          {Object.keys(byCategory).length > 1 && (
            <div className="border-t pt-3">
              <h4 className="text-xs text-muted-foreground mb-2">{"Par cat\u00e9gorie"}</h4>
              <div className="space-y-1">
                {Object.entries(byCategory)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, amount]) => (
                    <div key={cat} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{cat}</span>
                      <span className="font-medium">{fmt(amount)}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default NonLabourCosts;
