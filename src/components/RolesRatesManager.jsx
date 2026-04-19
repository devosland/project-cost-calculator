/**
 * Enterprise-level rate editor for INTERNAL_RATE and CONSULTANT_RATES.
 * Rates are stored at the enterprise level (not per-project) — they were
 * migrated from per-project storage in an earlier PR to enforce a single
 * source of truth. Editing a cell updates the rate table globally and
 * immediately persists via the onRatesChange callback (which triggers the
 * debounced auto-save in App). Roles can be added or removed; each new role
 * is initialised with zero rates for all consultant levels.
 */
import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { PlusCircle, Trash2, Pencil, Check, X } from 'lucide-react';
import { useLocale, CONSULTANT_LEVEL_KEYS, getConsultantLevelLabel } from '../lib/i18n';

/**
 * @param {Object} props
 * @param {{INTERNAL_RATE: number, CONSULTANT_RATES: Record<string, Record<string, number>>}} props.rates
 *   Current enterprise rate table.
 * @param {function(Object): void} props.onRatesChange - Called with the full
 *   updated rates object after any edit; triggers global persistence via App.
 */
const RolesRatesManager = ({ rates, onRatesChange }) => {
  const { t, locale } = useLocale();
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [isAddingRole, setIsAddingRole] = useState(false);
  const [editingInternalRate, setEditingInternalRate] = useState(false);
  const [internalRateValue, setInternalRateValue] = useState('');

  const roles = Object.keys(rates.CONSULTANT_RATES);

  const startEdit = (role, level) => {
    setEditingCell({ role, level });
    setEditValue(String(rates.CONSULTANT_RATES[role][level]));
  };

  const saveEdit = () => {
    if (editingCell === null) return;
    const value = parseFloat(editValue);
    if (isNaN(value) || value < 0) return;

    const newRates = {
      ...rates,
      CONSULTANT_RATES: {
        ...rates.CONSULTANT_RATES,
        [editingCell.role]: {
          ...rates.CONSULTANT_RATES[editingCell.role],
          [editingCell.level]: value,
        },
      },
    };
    onRatesChange(newRates);
    setEditingCell(null);
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const addRole = () => {
    const name = newRoleName.trim();
    if (!name || rates.CONSULTANT_RATES[name]) return;

    const defaultRates = {};
    CONSULTANT_LEVEL_KEYS.forEach((level) => {
      defaultRates[level] = 0;
    });

    const newRates = {
      ...rates,
      CONSULTANT_RATES: {
        ...rates.CONSULTANT_RATES,
        [name]: defaultRates,
      },
    };
    onRatesChange(newRates);
    setNewRoleName('');
    setIsAddingRole(false);
  };

  const removeRole = (role) => {
    const newConsultantRates = { ...rates.CONSULTANT_RATES };
    delete newConsultantRates[role];
    onRatesChange({
      ...rates,
      CONSULTANT_RATES: newConsultantRates,
    });
  };

  const startEditInternalRate = () => {
    setEditingInternalRate(true);
    setInternalRateValue(String(rates.INTERNAL_RATE));
  };

  const saveInternalRate = () => {
    const value = parseFloat(internalRateValue);
    if (isNaN(value) || value < 0) return;
    onRatesChange({ ...rates, INTERNAL_RATE: value });
    setEditingInternalRate(false);
  };

  const cancelEditInternalRate = () => {
    setEditingInternalRate(false);
    setInternalRateValue('');
  };

  const formatRate = (value) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const handleKeyDown = (e, saveFn, cancelFn) => {
    if (e.key === 'Enter') saveFn();
    if (e.key === 'Escape') cancelFn();
  };

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle className="font-display text-xl tracking-tight">{t('rates.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Internal Rate */}
          <div className="p-4 border border-border rounded-lg">
            <div className="flex justify-between items-center">
              <h3 className="font-display text-lg font-semibold tracking-tight">{t('rates.internalRate')}</h3>
              {editingInternalRate ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    className="p-2 border border-border rounded-md w-32 font-mono tabular-nums"
                    value={internalRateValue}
                    min="0"
                    step="0.01"
                    onChange={(e) => setInternalRateValue(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, saveInternalRate, cancelEditInternalRate)}
                    autoFocus
                  />
                  <span className="text-sm text-muted-foreground">$/h</span>
                  <Button variant="ghost" size="sm" onClick={saveInternalRate}>
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={cancelEditInternalRate}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xl font-semibold tabular-nums">{formatRate(rates.INTERNAL_RATE)}/h</span>
                  <Button variant="ghost" size="sm" onClick={startEditInternalRate}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Consultant Rates Table */}
          <div className="p-4 border border-border rounded-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-display text-lg font-semibold tracking-tight">{t('rates.consultantRates')}</h3>
              {!isAddingRole && (
                <Button
                  variant="default"
                  size="default"
                  onClick={() => setIsAddingRole(true)}
                  className="flex items-center gap-2"
                >
                  <PlusCircle className="w-4 h-4" />
                  {t('rates.addRole')}
                </Button>
              )}
            </div>

            {isAddingRole && (
              <div className="flex items-center gap-2 mb-4 p-3 border border-border rounded-lg bg-muted/40">
                <input
                  type="text"
                  className="p-2 border border-border rounded-md flex-1 bg-background"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, addRole, () => { setIsAddingRole(false); setNewRoleName(''); })}
                  placeholder={t('rates.roleName')}
                  autoFocus
                />
                <Button variant="default" size="sm" onClick={addRole}>
                  <Check className="w-4 h-4 mr-1" />
                  {t('phase.add')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setIsAddingRole(false); setNewRoleName(''); }}>
                  <X className="w-4 h-4 mr-1" />
                  {t('nonLabour.cancel')}
                </Button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-2 font-medium">{t('rates.role')}</th>
                    {CONSULTANT_LEVEL_KEYS.map((level) => (
                      <th key={level} className="text-center p-2 font-medium">
                        {getConsultantLevelLabel(t, level)}
                      </th>
                    ))}
                    <th className="text-center p-2 font-medium w-20">{t('rates.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <tr key={role} className="border-b border-border last:border-b-0 hover:bg-muted/60">
                      <td className="p-2 font-medium">{role}</td>
                      {CONSULTANT_LEVEL_KEYS.map((level) => {
                        const isEditing =
                          editingCell?.role === role && editingCell?.level === level;
                        return (
                          <td key={level} className="p-2 text-center">
                            {isEditing ? (
                              <div className="flex items-center gap-1 justify-center">
                                <input
                                  type="number"
                                  className="p-1 border border-border rounded-md w-20 text-center font-mono tabular-nums bg-background"
                                  value={editValue}
                                  min="0"
                                  step="0.01"
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => handleKeyDown(e, saveEdit, cancelEdit)}
                                  autoFocus
                                />
                                <Button variant="ghost" size="sm" onClick={saveEdit} className="h-8 w-8 p-0">
                                  <Check className="w-3 h-3" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={cancelEdit} className="h-8 w-8 p-0">
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            ) : (
                              <span
                                className="cursor-pointer hover:text-primary hover:underline font-mono tabular-nums"
                                onClick={() => startEdit(role, level)}
                                title={t('rates.clickToEdit')}
                              >
                                {formatRate(rates.CONSULTANT_RATES[role][level])}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="p-2 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRole(role)}
                          title={t('rates.deleteRole')}
                          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {roles.length === 0 && (
                    <tr>
                      <td colSpan={CONSULTANT_LEVEL_KEYS.length + 2} className="p-8 text-center text-muted-foreground">
                        {t('rates.noRoles')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default RolesRatesManager;
