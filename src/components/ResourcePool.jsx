/**
 * CRUD list of enterprise-level resources (the capacity pool). Each resource
 * has a name, role, level, and max_capacity percentage. Resources are fetched
 * from the capacity API and displayed in a filterable table. Inline editing is
 * handled by toggling ResourceForm in place of the row. Duplicate name conflicts
 * (HTTP 409) are surfaced as an inline error banner above the form (replaces
 * blocking native alert()). Deletion confirmation runs through the Prism
 * ConfirmDialog (replaces native confirm()).
 *
 * The "Permanent" / "Consultant" type badge is derived at runtime from the
 * resource level field: level === 'Employé interne' → Permanent, anything else
 * → Consultant. This classification is not stored as a separate column.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { PlusCircle, Pencil, Trash2, Search, AlertCircle } from 'lucide-react';
import { useLocale, getLevelLabel } from '../lib/i18n';
import { capacityApi } from '../lib/capacityApi';
import ResourceForm from './ResourceForm';
import ConfirmDialog from './ui/confirm-dialog';
import LinkUserToResource from './capacity/LinkUserToResource';

/**
 * @param {Object} props
 * @param {Object} props.rates - Enterprise rate table; passed to ResourceForm
 *   so role options are derived from CONSULTANT_RATES keys.
 */
const ResourcePool = ({ rates }) => {
  const { t } = useLocale();
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingResource, setEditingResource] = useState(null);
  const [search, setSearch] = useState('');
  // Inline error shown above the form on 409 (duplicate name). Cleared when
  // the form is re-opened or closed.
  const [formError, setFormError] = useState(null);
  // Resource pending deletion confirmation. Presence drives the ConfirmDialog
  // open state; null closes it.
  const [pendingDelete, setPendingDelete] = useState(null);
  // Share candidates: users eligible to be linked to a resource. Fetched once
  // on mount, refetched after each link change so newly-assigned users shift
  // into the "already linked" state for other rows.
  const [shareCandidates, setShareCandidates] = useState([]);

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

  const fetchShareCandidates = useCallback(async () => {
    try {
      const data = await capacityApi.getShareCandidates();
      setShareCandidates(Array.isArray(data) ? data : []);
    } catch (err) {
      // Non-fatal: the dropdown just shows "not linked" + the current value.
      console.error('Failed to fetch share candidates:', err);
    }
  }, []);

  useEffect(() => {
    fetchResources();
    fetchShareCandidates();
  }, [fetchResources, fetchShareCandidates]);

  const handleLinkUser = useCallback(async (resourceId, userId) => {
    await capacityApi.linkResourceUser(resourceId, userId);
    // Refetch both so the dropdown's "already linked" annotations stay accurate.
    await Promise.all([fetchResources(), fetchShareCandidates()]);
  }, [fetchResources, fetchShareCandidates]);

  const handleCreate = async (data) => {
    try {
      await capacityApi.createResource(data);
      setAdding(false);
      setFormError(null);
      fetchResources();
    } catch (err) {
      if (err?.status === 409 || err?.message?.includes('409')) {
        setFormError(t('resources.nameExists'));
      } else {
        console.error('Failed to create resource:', err);
      }
    }
  };

  const handleUpdate = async (data) => {
    try {
      await capacityApi.updateResource(editingResource.id, data);
      setEditingResource(null);
      setFormError(null);
      fetchResources();
    } catch (err) {
      if (err?.status === 409 || err?.message?.includes('409')) {
        setFormError(t('resources.nameExists'));
      } else {
        console.error('Failed to update resource:', err);
      }
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await capacityApi.deleteResource(pendingDelete.id);
      fetchResources();
    } catch (err) {
      console.error('Failed to delete resource:', err);
    } finally {
      setPendingDelete(null);
    }
  };

  // 'Employé interne' is the canonical level key that marks a resource as a
  // permanent employee. The badge is purely a display-layer derivation.
  const getTypeBadge = (level) => {
    const isPermanent = level === 'Employé interne';
    const token = isPermanent ? '--prism-success' : '--prism-warning';
    const label = isPermanent ? t('capacity.permanent') : t('capacity.consultant');
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
        style={{
          backgroundColor: `color-mix(in srgb, var(${token}) 18%, transparent)`,
          color: `var(${token})`,
        }}
      >
        {label}
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
          <CardTitle className="font-display text-xl tracking-tight">{t('resources.title')}</CardTitle>
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
        {formError && (adding || editingResource) && (
          <div
            className="mb-4 flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
            style={{
              color: 'var(--prism-error)',
              backgroundColor: 'color-mix(in srgb, var(--prism-error) 10%, transparent)',
              borderColor: 'color-mix(in srgb, var(--prism-error) 30%, transparent)',
            }}
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {adding && (
          <ResourceForm
            resource={null}
            rates={rates}
            onSave={handleCreate}
            onCancel={() => { setAdding(false); setFormError(null); }}
          />
        )}

        {editingResource && (
          <ResourceForm
            resource={editingResource}
            rates={rates}
            onSave={handleUpdate}
            onCancel={() => { setEditingResource(null); setFormError(null); }}
          />
        )}

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            className="input-field pl-9 w-full"
            placeholder={t('resources.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-2 font-medium">{t('resources.name')}</th>
                <th className="text-left p-2 font-medium">{t('resources.role')}</th>
                <th className="text-left p-2 font-medium">{t('resources.level')}</th>
                <th className="text-left p-2 font-medium">{t('resources.type')}</th>
                <th className="text-left p-2 font-medium">{t('capacity.linkedUser')}</th>
                <th className="text-center p-2 font-medium">{t('resources.maxCapacity')}</th>
                <th className="text-center p-2 font-medium w-24">{/* Actions */}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((resource) => (
                <tr key={resource.id} className="border-b border-border last:border-b-0 hover:bg-muted/60">
                  <td className="p-2 font-medium">{resource.name}</td>
                  <td className="p-2">{resource.role}</td>
                  <td className="p-2">{getLevelLabel(t, resource.level)}</td>
                  <td className="p-2">{getTypeBadge(resource.level)}</td>
                  <td className="p-2 min-w-[180px]">
                    <LinkUserToResource
                      resource={resource}
                      candidates={shareCandidates}
                      onLink={(userId) => handleLinkUser(resource.id, userId)}
                    />
                  </td>
                  <td className="p-2 text-center font-mono tabular-nums">{resource.max_capacity}%</td>
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
                        variant="ghost"
                        size="sm"
                        onClick={() => setPendingDelete(resource)}
                        title={t('resources.delete')}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    {resources.length === 0 ? t('resources.empty') : t('resources.search')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        title={t('resources.delete')}
        description={t('resources.confirmDelete')}
        confirmLabel={t('resources.delete')}
        cancelLabel={t('nonLabour.cancel')}
        destructive
        onConfirm={confirmDelete}
      />
    </Card>
  );
};

export default ResourcePool;
