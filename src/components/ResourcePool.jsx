import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { PlusCircle, Pencil, Trash2, Search } from 'lucide-react';
import { useLocale, getLevelLabel } from '../lib/i18n';
import { capacityApi } from '../lib/capacityApi';
import ResourceForm from './ResourceForm';

const ResourcePool = ({ rates }) => {
  const { t } = useLocale();
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingResource, setEditingResource] = useState(null);
  const [search, setSearch] = useState('');

  const fetchResources = useCallback(async () => {
    try {
      setLoading(true);
      const data = await capacityApi.getResources();
      setResources(data);
    } catch (err) {
      console.error('Failed to fetch resources:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  const handleCreate = async (data) => {
    try {
      await capacityApi.createResource(data);
      setAdding(false);
      fetchResources();
    } catch (err) {
      if (err?.status === 409 || err?.message?.includes('409')) {
        alert(t('resources.nameExists'));
      } else {
        console.error('Failed to create resource:', err);
      }
    }
  };

  const handleUpdate = async (data) => {
    try {
      await capacityApi.updateResource(editingResource.id, data);
      setEditingResource(null);
      fetchResources();
    } catch (err) {
      if (err?.status === 409 || err?.message?.includes('409')) {
        alert(t('resources.nameExists'));
      } else {
        console.error('Failed to update resource:', err);
      }
    }
  };

  const handleDelete = async (resource) => {
    if (!confirm(t('resources.confirmDelete'))) return;
    try {
      await capacityApi.deleteResource(resource.id);
      fetchResources();
    } catch (err) {
      console.error('Failed to delete resource:', err);
    }
  };

  const getTypeBadge = (level) => {
    const isPermanent = level === 'Employé interne';
    if (isPermanent) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          {t('capacity.permanent')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
        {t('capacity.consultant')}
      </span>
    );
  };

  const filtered = resources.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.name?.toLowerCase().includes(q) ||
      r.role?.toLowerCase().includes(q) ||
      r.level?.toLowerCase().includes(q)
    );
  });

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>{t('resources.title')}</CardTitle>
          {!adding && !editingResource && (
            <Button
              variant="default"
              size="default"
              onClick={() => setAdding(true)}
              className="flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              {t('resources.add')}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {adding && (
          <ResourceForm
            resource={null}
            rates={rates}
            onSave={handleCreate}
            onCancel={() => setAdding(false)}
          />
        )}

        {editingResource && (
          <ResourceForm
            resource={editingResource}
            rates={rates}
            onSave={handleUpdate}
            onCancel={() => setEditingResource(null)}
          />
        )}

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            className="p-2 pl-9 border rounded w-full"
            placeholder={t('resources.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2 font-medium">{t('resources.name')}</th>
                <th className="text-left p-2 font-medium">{t('resources.role')}</th>
                <th className="text-left p-2 font-medium">{t('resources.level')}</th>
                <th className="text-left p-2 font-medium">{t('resources.type')}</th>
                <th className="text-center p-2 font-medium">{t('resources.maxCapacity')}</th>
                <th className="text-center p-2 font-medium w-24">{/* Actions */}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((resource) => (
                <tr key={resource.id} className="border-b last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="p-2 font-medium">{resource.name}</td>
                  <td className="p-2">{resource.role}</td>
                  <td className="p-2">{getLevelLabel(t, resource.level)}</td>
                  <td className="p-2">{getTypeBadge(resource.level)}</td>
                  <td className="p-2 text-center">{resource.max_capacity}%</td>
                  <td className="p-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setEditingResource(resource); setAdding(false); }}
                        title={t('resources.edit')}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(resource)}
                        title={t('resources.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    {resources.length === 0 ? t('resources.empty') : t('resources.search')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};

export default ResourcePool;
