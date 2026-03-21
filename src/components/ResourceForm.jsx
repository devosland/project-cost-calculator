import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Check, X } from 'lucide-react';
import { useLocale, LEVEL_KEYS, getLevelLabel } from '../lib/i18n';

const ResourceForm = ({ resource, rates, onSave, onCancel }) => {
  const { t } = useLocale();
  const roles = Object.keys(rates.CONSULTANT_RATES);

  const [name, setName] = useState(resource?.name || '');
  const [role, setRole] = useState(resource?.role || roles[0] || '');
  const [level, setLevel] = useState(resource?.level || LEVEL_KEYS[0]);
  const [maxCapacity, setMaxCapacity] = useState(resource?.max_capacity ?? 100);

  useEffect(() => {
    if (resource) {
      setName(resource.name || '');
      setRole(resource.role || roles[0] || '');
      setLevel(resource.level || LEVEL_KEYS[0]);
      setMaxCapacity(resource.max_capacity ?? 100);
    }
  }, [resource]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      role,
      level,
      max_capacity: Number(maxCapacity),
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onCancel();
  };

  return (
    <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-900 mb-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">{t('resources.name')}</label>
          <input
            type="text"
            className="input-field w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('resources.name')}
            autoFocus
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('resources.role')}</label>
          <select
            className="select-field w-full"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {roles.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('resources.level')}</label>
          <select
            className="select-field w-full"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            {LEVEL_KEYS.map((lk) => (
              <option key={lk} value={lk}>{getLevelLabel(t, lk)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('resources.maxCapacity')}</label>
          <input
            type="number"
            className="input-field w-full"
            value={maxCapacity}
            onChange={(e) => setMaxCapacity(e.target.value)}
            min="0"
            max="100"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" variant="default" size="sm" className="flex items-center gap-1">
          <Check className="w-4 h-4" />
          {t('resources.save')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="flex items-center gap-1">
          <X className="w-4 h-4" />
          {t('resources.cancel')}
        </Button>
      </div>
    </form>
  );
};

export default ResourceForm;
