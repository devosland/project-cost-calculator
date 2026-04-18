import React, { useState } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Play, Copy, Check, Plus, Trash2, Code, FileText } from 'lucide-react';
import { useLocale } from '../lib/i18n';

// ── Internal field helpers ─────────────────────────────────────────────────
function newRowKey() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now() + '-' + Math.random();
}

function stripInternalFields(payload) {
  return {
    ...payload,
    phases: (payload.phases || []).map(({ _rowKey, ...rest }) => rest),
  };
}

// ── Default template payload ───────────────────────────────────────────────
function makeDefaultPayload() {
  return {
    project: {
      name: 'Projet de test',
      externalId: 'RM-TEST-' + Date.now(),
      startDate: new Date().toISOString().slice(0, 10),
      description: '',
    },
    phases: [
      { _rowKey: newRowKey(), id: 'decouverte', name: 'Découverte', order: 1, durationMonths: 2, startDate: '', endDate: '', dependsOn: [], description: '' },
      { _rowKey: newRowKey(), id: 'conception', name: 'Conception', order: 2, durationMonths: 3, startDate: '', endDate: '', dependsOn: ['decouverte'], description: '' },
      { _rowKey: newRowKey(), id: 'realisation', name: 'Réalisation', order: 3, durationMonths: 6, startDate: '', endDate: '', dependsOn: ['conception'], description: '' },
    ],
  };
}

// ── Curl generator ─────────────────────────────────────────────────────────
function shellEscapeSingleQuotes(str) {
  return str.replace(/'/g, "'\\''");
}

function curlFromRequest(method, url, apiKey, body) {
  const lines = [
    `curl -X ${method} "${window.location.origin}${url}"`,
    `  -H "X-API-Key: ${apiKey}"`,
  ];
  if (body) {
    const json = JSON.stringify(body);
    lines.push(`  -H "Content-Type: application/json"`);
    lines.push(`  -d '${shellEscapeSingleQuotes(json)}'`);
  }
  return lines.join(' \\\n');
}

// ── Status badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  let cls = 'inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ';
  if (status >= 200 && status < 300) cls += 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
  else if (status >= 400 && status < 500) cls += 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300';
  else cls += 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
  return <span className={cls}>HTTP {status}</span>;
}

// ── Response panel ─────────────────────────────────────────────────────────
function ResponsePanel({ result, curlCmd, t }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  async function copyCmd() {
    try {
      await navigator.clipboard.writeText(curlCmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setCopyError(true);
      setTimeout(() => setCopyError(false), 3000);
    }
  }

  if (!result) {
    return (
      <p className="text-sm text-muted-foreground mt-4">{t('apiTester.noResponse')}</p>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium">{t('apiTester.response')}</span>
        <StatusBadge status={result.status} />
        <span className="text-xs text-muted-foreground">{result.elapsed} {t('apiTester.ms')}</span>
        {curlCmd && (
          <Button size="sm" variant="outline" onClick={copyCmd} className="ml-auto">
            {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
            {copied ? t('apiTester.copied') : t('apiTester.copyCurl')}
          </Button>
        )}
        {copyError && (
          <span className="text-xs text-red-600 dark:text-red-400">{t('apiTester.copyFailed')}</span>
        )}
      </div>
      <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900 border border-border rounded p-3 overflow-x-auto whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
        {JSON.stringify(result.body, null, 2)}
      </pre>
    </div>
  );
}

// ── Phase row in the form table ────────────────────────────────────────────
function PhaseRow({ phase, phases, onChange, onDelete, t }) {
  const otherPhaseIds = phases.filter(p => p._rowKey !== phase._rowKey).map(p => p.id);

  function update(field, value) {
    onChange(phase._rowKey, field, value);
  }

  function toggleDep(id) {
    const deps = phase.dependsOn || [];
    update('dependsOn', deps.includes(id) ? deps.filter(d => d !== id) : [...deps, id]);
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="p-1.5">
        <input
          className="input-field w-full text-xs"
          value={phase.id}
          onChange={e => update('id', e.target.value)}
          placeholder="slug-id"
        />
      </td>
      <td className="p-1.5">
        <input
          className="input-field w-full text-xs"
          value={phase.name}
          onChange={e => update('name', e.target.value)}
          placeholder={t('apiTester.colName')}
        />
      </td>
      <td className="p-1.5 w-16">
        <input
          type="number"
          className="input-field w-full text-xs"
          value={phase.order}
          min={1}
          onChange={e => update('order', parseInt(e.target.value, 10) || 1)}
        />
      </td>
      <td className="p-1.5 w-20">
        <input
          type="number"
          className="input-field w-full text-xs"
          value={phase.durationMonths}
          min={0.5}
          step={0.5}
          onChange={e => update('durationMonths', parseFloat(e.target.value) || 1)}
        />
      </td>
      <td className="p-1.5 w-28">
        <input
          type="date"
          className="input-field w-full text-xs"
          value={phase.startDate || ''}
          onChange={e => update('startDate', e.target.value)}
        />
      </td>
      <td className="p-1.5 w-28">
        <input
          type="date"
          className="input-field w-full text-xs"
          value={phase.endDate || ''}
          onChange={e => update('endDate', e.target.value)}
        />
      </td>
      <td className="p-1.5 min-w-32">
        <div className="flex flex-wrap gap-1">
          {otherPhaseIds.length === 0 && (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          {otherPhaseIds.map(id => (
            <label key={id} className="flex items-center gap-1 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={(phase.dependsOn || []).includes(id)}
                onChange={() => toggleDep(id)}
              />
              <span className="font-mono">{id}</span>
            </label>
          ))}
        </div>
      </td>
      <td className="p-1.5 text-center">
        <button
          onClick={() => onDelete(phase._rowKey)}
          className="text-muted-foreground hover:text-red-500 transition-colors"
          title={t('apiTester.actions')}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

// ── Tab 1 : POST /api/v1/roadmap/import ───────────────────────────────────
function TabImport({ apiKey, t }) {
  const [mode, setMode] = useState('form'); // 'form' | 'json'
  const [payload, setPayload] = useState(makeDefaultPayload());
  const [rawJson, setRawJson] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [upsert, setUpsert] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [curlCmd, setCurlCmd] = useState('');

  // Sync form → json when switching to raw mode
  function switchToJson() {
    setRawJson(JSON.stringify(cleanPayload(stripInternalFields(payload)), null, 2));
    setJsonError('');
    setMode('json');
  }

  // Sync json → form when switching to form mode
  function switchToForm() {
    try {
      const parsed = JSON.parse(rawJson);
      const normalizedPayload = {
        ...parsed,
        project: {
          ...((parsed && parsed.project && typeof parsed.project === 'object') ? parsed.project : {}),
        },
        phases: Array.isArray(parsed?.phases)
          ? parsed.phases.map(p => ({
              startDate: '',
              endDate: '',
              dependsOn: [],
              description: '',
              ...p,
              _rowKey: newRowKey(),
            }))
          : [],
      };
      if (normalizedPayload.project.description === undefined) normalizedPayload.project.description = '';
      setPayload(normalizedPayload);
      setJsonError('');
      setMode('form');
    } catch {
      setJsonError(t('apiTester.invalidJson'));
    }
  }

  // Strip empty optional fields before sending
  function cleanPayload(p) {
    const project = { ...p.project };
    if (!project.description) delete project.description;

    const phases = (p.phases || []).map(ph => {
      const out = {
        id: ph.id,
        name: ph.name,
        order: ph.order,
        durationMonths: ph.durationMonths,
      };
      if (ph.startDate) out.startDate = ph.startDate;
      if (ph.endDate) out.endDate = ph.endDate;
      if (ph.dependsOn && ph.dependsOn.length > 0) out.dependsOn = ph.dependsOn;
      if (ph.description) out.description = ph.description;
      return out;
    });

    return { project, phases };
  }

  async function handleSend() {
    setSending(true);
    setResult(null);
    try {
      let body;
      if (mode === 'json') {
        body = JSON.parse(rawJson);
      } else {
        body = cleanPayload(stripInternalFields(payload));
      }
      const url = '/api/v1/roadmap/import' + (upsert ? '?upsert=true' : '');
      const t0 = performance.now();
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify(body),
      });
      const elapsed = Math.round(performance.now() - t0);
      const respBody = await response.json().catch(() => ({ error: 'invalid_json_response' }));
      setResult({ status: response.status, body: respBody, elapsed });
      setCurlCmd(curlFromRequest('POST', url, apiKey, body));
    } catch (err) {
      setResult({ status: 0, body: { error: err.message }, elapsed: 0 });
      setCurlCmd('');
    }
    setSending(false);
  }

  function updatePhase(rowKey, field, newValue) {
    setPayload(prev => {
      const phases = [...prev.phases];
      const idx = phases.findIndex(p => p._rowKey === rowKey);
      if (idx < 0) return prev;
      const oldValue = phases[idx][field];
      phases[idx] = { ...phases[idx], [field]: newValue };

      if (field === 'id' && oldValue && oldValue !== newValue) {
        for (let i = 0; i < phases.length; i++) {
          if (i !== idx && Array.isArray(phases[i].dependsOn) && phases[i].dependsOn.includes(oldValue)) {
            phases[i] = {
              ...phases[i],
              dependsOn: phases[i].dependsOn.map(d => d === oldValue ? newValue : d),
            };
          }
        }
      }
      return { ...prev, phases };
    });
  }

  function deletePhase(rowKey) {
    setPayload(prev => {
      const removed = prev.phases.find(p => p._rowKey === rowKey);
      const removedId = removed?.id;
      const phases = prev.phases
        .filter(p => p._rowKey !== rowKey)
        .map(p => removedId && Array.isArray(p.dependsOn)
          ? { ...p, dependsOn: p.dependsOn.filter(d => d !== removedId) }
          : p
        );
      return { ...prev, phases };
    });
  }

  function addPhase() {
    setPayload(prev => ({
      ...prev,
      phases: [
        ...prev.phases,
        {
          _rowKey: newRowKey(),
          id: 'phase-' + (prev.phases.length + 1),
          name: '',
          order: prev.phases.length + 1,
          durationMonths: 1,
          startDate: '',
          endDate: '',
          dependsOn: [],
          description: '',
        },
      ],
    }));
  }

  const canSend = !!apiKey && (mode === 'json' ? rawJson.trim().length > 0 : payload.phases.length > 0);

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => mode === 'json' ? switchToForm() : undefined}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${mode === 'form' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <FileText className="w-3.5 h-3.5" />
          {t('apiTester.modeForm')}
        </button>
        <button
          onClick={() => mode === 'form' ? switchToJson() : undefined}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${mode === 'json' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Code className="w-3.5 h-3.5" />
          {t('apiTester.modeJson')}
        </button>
      </div>

      {mode === 'form' && (
        <>
          {/* Project section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">{t('apiTester.project')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium block mb-1">name *</label>
                <input
                  className="input-field w-full"
                  value={payload.project.name}
                  onChange={e => setPayload(p => ({ ...p, project: { ...p.project, name: e.target.value } }))}
                  placeholder="Nom du projet"
                  maxLength={200}
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">externalId *</label>
                <input
                  className="input-field w-full font-mono text-sm"
                  value={payload.project.externalId}
                  onChange={e => setPayload(p => ({ ...p, project: { ...p.project, externalId: e.target.value } }))}
                  placeholder="RM-2026-001"
                  maxLength={100}
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">startDate *</label>
                <input
                  type="date"
                  className="input-field w-full"
                  value={payload.project.startDate}
                  onChange={e => setPayload(p => ({ ...p, project: { ...p.project, startDate: e.target.value } }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">description</label>
                <textarea
                  className="input-field w-full resize-none"
                  rows={2}
                  value={payload.project.description}
                  onChange={e => setPayload(p => ({ ...p, project: { ...p.project, description: e.target.value } }))}
                  placeholder="Optionnel"
                  maxLength={2000}
                />
              </div>
            </div>
          </div>

          {/* Phases section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t('apiTester.phases')}</h3>
              <Button size="sm" variant="outline" onClick={addPhase}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                {t('apiTester.addPhase')}
              </Button>
            </div>

            {payload.phases.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded">
                {t('apiTester.noPhases', { addPhase: t('apiTester.addPhase') })}
              </p>
            ) : (
              <div className="overflow-x-auto rounded border border-border">
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="bg-muted/40 text-xs text-muted-foreground">
                      <th className="p-1.5 text-left font-medium">{t('apiTester.colId')} *</th>
                      <th className="p-1.5 text-left font-medium">{t('apiTester.colName')} *</th>
                      <th className="p-1.5 text-left font-medium w-16">{t('apiTester.colOrder')}</th>
                      <th className="p-1.5 text-left font-medium w-20">{t('apiTester.colDuration')} *</th>
                      <th className="p-1.5 text-left font-medium w-28">{t('apiTester.colStart')}</th>
                      <th className="p-1.5 text-left font-medium w-28">{t('apiTester.colEnd')}</th>
                      <th className="p-1.5 text-left font-medium">{t('apiTester.colDeps')}</th>
                      <th className="p-1.5 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {payload.phases.map((phase) => (
                      <PhaseRow
                        key={phase._rowKey}
                        phase={phase}
                        phases={payload.phases}
                        onChange={updatePhase}
                        onDelete={deletePhase}
                        t={t}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {mode === 'json' && (
        <div className="space-y-1">
          {jsonError && (
            <p className="text-xs text-red-600 dark:text-red-400">{jsonError}</p>
          )}
          <textarea
            className="input-field w-full font-mono text-xs resize-y"
            rows={16}
            value={rawJson}
            onChange={e => { setRawJson(e.target.value); setJsonError(''); }}
            spellCheck={false}
          />
        </div>
      )}

      {/* Options + Send */}
      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={upsert}
            onChange={e => setUpsert(e.target.checked)}
          />
          {t('apiTester.upsertMode')}
        </label>
        <Button
          onClick={handleSend}
          disabled={!canSend || sending}
          className="ml-auto"
        >
          <Play className="w-4 h-4 mr-1.5" />
          {sending ? '…' : t('apiTester.send')}
        </Button>
      </div>

      <ResponsePanel result={result} curlCmd={curlCmd} t={t} />
    </div>
  );
}

// ── Tab 2 : GET /api/v1/roadmap/import/:externalId/status ─────────────────
function TabStatus({ apiKey, t }) {
  const [externalId, setExternalId] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const [curlCmd, setCurlCmd] = useState('');

  async function handleCheck() {
    setChecking(true);
    setResult(null);
    try {
      const url = `/api/v1/roadmap/import/${encodeURIComponent(externalId)}/status`;
      const t0 = performance.now();
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'X-API-Key': apiKey },
      });
      const elapsed = Math.round(performance.now() - t0);
      const body = await response.json().catch(() => ({ error: 'invalid_json_response' }));
      setResult({ status: response.status, body, elapsed });
      setCurlCmd(curlFromRequest('GET', url, apiKey, null));
    } catch (err) {
      setResult({ status: 0, body: { error: err.message }, elapsed: 0 });
      setCurlCmd('');
    }
    setChecking(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="text-xs font-medium block mb-1">{t('apiTester.externalId')}</label>
          <input
            className="input-field w-full font-mono"
            value={externalId}
            onChange={e => setExternalId(e.target.value)}
            placeholder="RM-2026-042"
            onKeyDown={e => e.key === 'Enter' && externalId && apiKey && handleCheck()}
          />
        </div>
        <Button
          onClick={handleCheck}
          disabled={!apiKey || !externalId.trim() || checking}
        >
          <Play className="w-4 h-4 mr-1.5" />
          {checking ? '…' : t('apiTester.checking')}
        </Button>
      </div>

      <ResponsePanel result={result} curlCmd={curlCmd} t={t} />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function ApiTester() {
  const { t } = useLocale();
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [activeTab, setActiveTab] = useState('import');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold">{t('apiTester.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('apiTester.subtitle')}</p>
      </div>

      {/* API Key input */}
      <Card>
        <CardContent className="py-4">
          <label className="text-sm font-medium block mb-1.5">{t('apiTester.apiKey')}</label>
          <div className="flex items-center gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              className="input-field flex-1 font-mono text-sm"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={t('apiTester.apiKeyPlaceholder')}
              autoComplete="off"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowKey(s => !s)}
              className="shrink-0"
            >
              {showKey ? t('apiTester.hideApiKey') : t('apiTester.showApiKey')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            {t('apiTester.apiKeyHelper')}
          </p>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Card>
        <CardContent className="py-4">
          {/* Tab bar */}
          <div className="flex gap-1 border-b border-border mb-4">
            <button
              onClick={() => setActiveTab('import')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'import'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('apiTester.tabImport')}
            </button>
            <button
              onClick={() => setActiveTab('status')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'status'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('apiTester.tabStatus')}
            </button>
          </div>

          {/* Tab content */}
          {activeTab === 'import' && <TabImport apiKey={apiKey} t={t} />}
          {activeTab === 'status' && <TabStatus apiKey={apiKey} t={t} />}
        </CardContent>
      </Card>
    </div>
  );
}
