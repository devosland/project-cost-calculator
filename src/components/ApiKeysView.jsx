import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Copy, Check, Trash2, KeyRound, ChevronDown, ChevronUp, Activity, TrendingUp } from 'lucide-react';
import { apiKeysApi } from '../lib/apiKeysApi';
import { useLocale } from '../lib/i18n';

const SCOPES = [
  { id: 'roadmap:import', labelKey: 'apiKeys.scopeRoadmapImport' },
  { id: 'roadmap:read', labelKey: 'apiKeys.scopeRoadmapRead' },
];

/** Formats a relative time string ("il y a 2h" / "2h ago") for a created_at ISO string. */
function relativeTime(isoString) {
  if (!isoString) return '—';
  const diffMs = Date.now() - new Date(isoString + (isoString.endsWith('Z') ? '' : 'Z')).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '< 1 min';
  if (diffMin < 60) return `${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  return `${Math.floor(diffH / 24)}j`;
}

/** Returns a Tailwind text colour class based on HTTP status code. */
function statusColor(code) {
  if (code >= 200 && code < 400) return 'text-green-600 dark:text-green-400';
  if (code >= 400 && code < 500) return 'text-orange-500 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

/**
 * Inline usage panel for a single API key.
 * Fetches data lazily on first expand; subsequent toggles reuse cached data.
 */
function KeyUsagePanel({ keyId, t }) {
  const [usageData, setUsageData] = useState(null);
  const [loadingUsage, setLoadingUsage] = useState(false);

  const load = useCallback(async () => {
    if (usageData) return; // already loaded — use cache
    setLoadingUsage(true);
    try {
      const data = await apiKeysApi.usage(keyId);
      setUsageData(data);
    } catch {
      setUsageData({ stats: { total: 0, success: 0, clientError: 0, serverError: 0, lastUsedAt: null, topEndpoint: null }, recent: [], daily: [] });
    }
    setLoadingUsage(false);
  }, [keyId, usageData]);

  useEffect(() => { load(); }, [load]);

  if (loadingUsage) {
    return <div className="text-xs text-muted-foreground py-2">{t('apiKeys.usage.loading')}</div>;
  }

  if (!usageData) return null;

  const { stats, recent, daily } = usageData;
  const successRate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0;
  const maxDay = daily.length > 0 ? Math.max(...daily.map(d => d.count)) : 0;

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-4">
      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-muted/40 dark:bg-muted/20 rounded p-2 text-center">
          <div className="text-lg font-bold">{stats.total}</div>
          <div className="text-xs text-muted-foreground">{t('apiKeys.usage.calls')} (7j)</div>
        </div>
        <div className="bg-muted/40 dark:bg-muted/20 rounded p-2 text-center">
          <div className={`text-lg font-bold ${successRate >= 90 ? 'text-green-600 dark:text-green-400' : successRate >= 70 ? 'text-orange-500 dark:text-orange-400' : 'text-red-600 dark:text-red-400'}`}>
            {successRate}%
          </div>
          <div className="text-xs text-muted-foreground">{t('apiKeys.usage.successRate')}</div>
        </div>
        <div className="bg-muted/40 dark:bg-muted/20 rounded p-2 text-center overflow-hidden">
          <div className="text-xs font-mono font-bold truncate" title={stats.topEndpoint || '—'}>{stats.topEndpoint || '—'}</div>
          <div className="text-xs text-muted-foreground">{t('apiKeys.usage.topEndpoint')}</div>
        </div>
        <div className="bg-muted/40 dark:bg-muted/20 rounded p-2 text-center">
          <div className="text-xs font-bold">{stats.lastUsedAt ? relativeTime(stats.lastUsedAt) : '—'}</div>
          <div className="text-xs text-muted-foreground">{t('apiKeys.usage.lastUsed')}</div>
        </div>
      </div>

      {/* Sparkline — 30-day bar chart */}
      {daily.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground mb-1">30j</div>
          <div className="flex items-end gap-0.5 h-10">
            {daily.map(d => {
              const pct = maxDay > 0 ? Math.round((d.count / maxDay) * 100) : 0;
              return (
                <div
                  key={d.day}
                  className="w-2 bg-primary/70 dark:bg-primary/60 rounded-sm shrink-0"
                  style={{ height: `${Math.max(4, pct)}%` }}
                  title={`${d.day}: ${d.count}`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Recent calls table */}
      <div>
        <div className="text-xs font-medium text-muted-foreground mb-2">{t('apiKeys.usage.recentCalls')}</div>
        {recent.length === 0 ? (
          <div className="text-xs text-muted-foreground">{t('apiKeys.usage.noCalls')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left pb-1 pr-2 font-medium">Méthode</th>
                  <th className="text-left pb-1 pr-2 font-medium">Endpoint</th>
                  <th className="text-left pb-1 pr-2 font-medium">Status</th>
                  <th className="text-left pb-1 font-medium">Il y a</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(row => (
                  <tr key={row.id} className="border-b border-border/50 last:border-0">
                    <td className="py-1 pr-2">
                      <span className="inline-block px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono font-bold text-[10px]">
                        {row.method}
                      </span>
                    </td>
                    <td className="py-1 pr-2 font-mono truncate max-w-[200px]" title={row.endpoint}>{row.endpoint}</td>
                    <td className={`py-1 pr-2 font-bold ${statusColor(row.status_code)}`}>{row.status_code}</td>
                    <td className="py-1 text-muted-foreground">{relativeTime(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ApiKeysView() {
  const { t } = useLocale();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newScopes, setNewScopes] = useState(['roadmap:import']);
  const [plaintextKey, setPlaintextKey] = useState(null);
  const [copied, setCopied] = useState(false);
  const [expandedKeyId, setExpandedKeyId] = useState(null);

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
              <CardContent className="py-3">
                <div className="flex items-center gap-3">
                  <KeyRound className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{k.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{k.key_prefix}…</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {t('apiKeys.scopes')}: {(k.scopes || []).join(', ')} · {t('apiKeys.lastUsed')}: {k.last_used_at || t('apiKeys.never')}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {k.revoked_at ? (
                      <span className="text-xs text-red-600 dark:text-red-400">{t('apiKeys.revoked')}</span>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs gap-1 h-7 px-2"
                          onClick={() => setExpandedKeyId(expandedKeyId === k.id ? null : k.id)}
                          title={expandedKeyId === k.id ? t('apiKeys.usage.hideDetails') : t('apiKeys.usage.showDetails')}
                        >
                          <Activity className="w-3 h-3" />
                          {t('apiKeys.usage.title')}
                          {expandedKeyId === k.id
                            ? <ChevronUp className="w-3 h-3" />
                            : <ChevronDown className="w-3 h-3" />}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleRevoke(k.id)} title={t('apiKeys.revoke')}>
                          <Trash2 className="w-4 h-4 text-muted-foreground hover:text-red-500" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Lazy-loaded usage panel — only mounted when expanded */}
                {expandedKeyId === k.id && !k.revoked_at && (
                  <KeyUsagePanel keyId={k.id} t={t} />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
