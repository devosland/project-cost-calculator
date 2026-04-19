/**
 * Inline-editable table of non-labour cost line items (infrastructure,
 * licences, SaaS, travel, training, equipment, other). Supports adding new
 * items via a transient form row, editing existing values inline, and deleting
 * rows. Shows a category subtotal breakdown when more than one category is
 * present. All changes are pushed up immediately via onChange — there is no
 * local draft state; the parent owns the source of truth.
 */
import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { PlusCircle, Trash2 } from 'lucide-react';
import { formatCurrency } from '../lib/costCalculations';
import { useLocale } from '../lib/i18n';

/**
 * @param {Object} props
 * @param {Array<{id: string, name: string, category: string, amount: number}>} props.costs
 *   Current list of non-labour cost items.
 * @param {string} props.currency - ISO currency code for formatting (e.g. 'CAD').
 * @param {function(Array): void} props.onChange - Called with the updated full
 *   array after any add, remove, or inline edit.
 */
const NonLabourCosts = ({ costs, currency, onChange }) => {
  const { t } = useLocale();

  const CATEGORIES = [
    t('nonLabour.cat.infrastructure'),
    t('nonLabour.cat.licenses'),
    t('nonLabour.cat.saas'),
    t('nonLabour.cat.travel'),
    t('nonLabour.cat.training'),
    t('nonLabour.cat.equipment'),
    t('nonLabour.cat.other'),
  ];

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
          <CardTitle className="font-display text-xl tracking-tight">{t('nonLabour.title')}</CardTitle>
          {!adding && (
            <Button
              size="sm"
              onClick={() => setAdding(true)}
              className="flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              {t('nonLabour.add')}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {adding && (
            <div className="p-4 border border-border rounded-lg bg-muted/40 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  className="input-field"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t('nonLabour.name')}
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
                  placeholder={t('nonLabour.amount')}
                  min="0"
                  step="0.01"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addCost();
                    if (e.key === 'Escape') setAdding(false);
                  }}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={addCost}>{t('nonLabour.add')}</Button>
                <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>{t('nonLabour.cancel')}</Button>
              </div>
            </div>
          )}

          {costs.length === 0 && !adding && (
            <p className="text-sm text-muted-foreground text-center py-6">
              {t('nonLabour.empty')}
            </p>
          )}

          {costs.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="p-2 font-medium text-muted-foreground">{t('nonLabour.name')}</th>
                  <th className="p-2 font-medium text-muted-foreground">{t('nonLabour.category')}</th>
                  <th className="p-2 text-right font-medium text-muted-foreground">{t('nonLabour.amount')}</th>
                  <th className="p-2 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {costs.map((cost) => (
                  <tr key={cost.id} className="border-b border-border last:border-b-0 hover:bg-muted/60 transition-colors">
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
                        className="bg-transparent border-0 p-0 w-24 text-right font-mono tabular-nums focus:outline-none"
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
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => removeCost(cost.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-semibold">
                  <td className="p-2" colSpan="2">{t('nonLabour.total')}</td>
                  <td className="p-2 text-right font-mono tabular-nums">{fmt(total)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}

          {Object.keys(byCategory).length > 1 && (
            <div className="border-t border-border pt-3">
              <h4 className="text-xs text-muted-foreground mb-2">{t('nonLabour.byCategory')}</h4>
              <div className="space-y-1">
                {Object.entries(byCategory)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, amount]) => (
                    <div key={cat} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{cat}</span>
                      <span className="font-medium font-mono tabular-nums">{fmt(amount)}</span>
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
