import React, { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Copy, Check, Trash2, KeyRound } from 'lucide-react';
import { apiKeysApi } from '../lib/apiKeysApi';
import { useLocale } from '../lib/i18n';

const SCOPES = [
  { id: 'roadmap:import', labelKey: 'apiKeys.scopeRoadmapImport' },
  { id: 'roadmap:read', labelKey: 'apiKeys.scopeRoadmapRead' },
];

export default function ApiKeysView() {
  const { t } = useLocale();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newScopes, setNewScopes] = useState(['roadmap:import']);
  const [plaintextKey, setPlaintextKey] = useState(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const data = await apiKeysApi.list();
      setKeys(Array.isArray(data) ? data : []);
    } catch {
      setKeys([]);
    }
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function handleCreate() {
    try {
      const result = await apiKeysApi.create(newName, newScopes);
      if (result?.key) {
        setPlaintextKey(result);
        setCreating(false);
        setNewName('');
        await refresh();
      }
    } catch (err) {
      console.error('Failed to create API key:', err);
    }
  }

  async function handleRevoke(id) {
    if (!window.confirm(t('apiKeys.revokeConfirm'))) return;
    try {
      await apiKeysApi.revoke(id);
      await refresh();
    } catch (err) {
      console.error('Failed to revoke API key:', err);
    }
  }

  function copyKey() {
    navigator.clipboard.writeText(plaintextKey.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return <div className="py-8 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold">{t('apiKeys.title')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('apiKeys.subtitle')}</p>
        </div>
        {!creating && !plaintextKey && (
          <Button onClick={() => setCreating(true)}>{t('apiKeys.create')}</Button>
        )}
      </div>

      {plaintextKey && (
        <Card className="border-amber-400 bg-amber-50 dark:bg-amber-900/10">
          <CardContent className="py-4 space-y-3">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{t('apiKeys.copyOnce')}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-2 bg-white dark:bg-gray-900 rounded font-mono text-xs break-all border">
                {plaintextKey.key}
              </code>
              <Button size="sm" onClick={copyKey} className="shrink-0">
                {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                {copied ? t('apiKeys.copied') : t('apiKeys.copy')}
              </Button>
            </div>
            <Button size="sm" variant="outline" onClick={() => setPlaintextKey(null)}>OK</Button>
          </CardContent>
        </Card>
      )}

      {creating && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <div>
              <label className="text-sm font-medium block mb-1">{t('apiKeys.keyName')}</label>
              <input
                className="input-field w-full"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder={t('apiKeys.keyNamePlaceholder')}
                maxLength={100}
                autoFocus
              />
            </div>
            <div>
              <div className="text-sm font-medium mb-2">{t('apiKeys.scopes')}</div>
              <div className="space-y-1">
                {SCOPES.map(s => (
                  <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newScopes.includes(s.id)}
                      onChange={e => {
                        if (e.target.checked) setNewScopes([...newScopes, s.id]);
                        else setNewScopes(newScopes.filter(x => x !== s.id));
                      }}
                    />
                    {t(s.labelKey)}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={!newName.trim() || newScopes.length === 0}>
                {t('apiKeys.create')}
              </Button>
              <Button variant="outline" onClick={() => { setCreating(false); setNewName(''); setNewScopes(['roadmap:import']); }}>
                {t('common.cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {keys.length === 0 && !creating && !plaintextKey && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t('apiKeys.noKeys')}
          </CardContent>
        </Card>
      )}

      {keys.length > 0 && (
        <div className="space-y-2">
          {keys.map(k => (
            <Card key={k.id}>
              <CardContent className="py-3 flex items-center gap-3">
                <KeyRound className="w-5 h-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{k.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{k.key_prefix}…</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {t('apiKeys.scopes')}: {(k.scopes || []).join(', ')} · {t('apiKeys.lastUsed')}: {k.last_used_at || t('apiKeys.never')}
                  </div>
                </div>
                <div className="text-xs shrink-0">
                  {k.revoked_at ? (
                    <span className="text-red-600 dark:text-red-400">{t('apiKeys.revoked')}</span>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => handleRevoke(k.id)} title={t('apiKeys.revoke')}>
                      <Trash2 className="w-4 h-4 text-muted-foreground hover:text-red-500" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
