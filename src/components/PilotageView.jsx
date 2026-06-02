/**
 * PilotageView — tableau de bord de valeur acquise (EVM) d'un projet (chantier D).
 *
 * Cartes EV/PV/AC, SPI/CPI, EAC/VAC/ETC + tableau par phase. Lecture seule.
 * Calcul côté client (evmCalculations) : coût/PV depuis le plan + costCalculations,
 * avancement (getProgress) et réels (getActuals) depuis le serveur. PV/SPI sont
 * « N/A » si le projet n'a pas de date de début.
 */
import { useEffect, useState, useMemo } from 'react';
import { executionApi } from '../lib/executionApi';
import { computeEvm, indexStatus } from '../lib/evmCalculations';
import { formatCurrency } from '../lib/costCalculations';
import { useLocale } from '../lib/i18n';

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** Semaines écoulées depuis startDate jusqu'à aujourd'hui (null si pas de date). */
function asOfWeekFrom(startDate) {
  if (!startDate) return null;
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return null;
  // Floor à 0 : une startDate dans le futur donne 0 semaine écoulée (PV=0, SPI N/A).
  return Math.max(0, (Date.now() - start.getTime()) / MS_PER_WEEK);
}

const PilotageView = ({ project, rates }) => {
  const { t } = useLocale();
  const currency = project.settings?.currency || 'CAD';
  const fmt = (v) => (v == null ? '—' : formatCurrency(v, currency));
  const fmtIdx = (v) => (v == null ? '—' : v.toFixed(2));

  const [progress, setProgress] = useState(null);
  const [actuals, setActuals] = useState(null);

  useEffect(() => {
    let cancelled = false;
    executionApi.getProgress(project.id).then((d) => { if (!cancelled) setProgress(d?.by_phase || {}); }).catch(() => { if (!cancelled) setProgress({}); });
    executionApi.getActuals(project.id).then((d) => { if (!cancelled) setActuals(d?.by_phase || {}); }).catch(() => { if (!cancelled) setActuals({}); });
    return () => { cancelled = true; };
  }, [project.id]);

  const asOfWeek = useMemo(() => asOfWeekFrom(project.settings?.startDate), [project.settings?.startDate]);

  const evm = useMemo(() => {
    if (progress == null || actuals == null) return null;
    return computeEvm({ project, rates, progress, actuals, asOfWeek });
  }, [project, rates, progress, actuals, asOfWeek]);

  if (evm == null) {
    return <div className="text-sm text-muted-foreground p-6">…</div>;
  }

  const hasProgress = Object.keys(progress).length > 0;
  if (!hasProgress) {
    return (
      <div className="text-sm text-muted-foreground border border-border rounded-lg p-6 bg-card">
        {t('evm.empty')}
      </div>
    );
  }

  const idxStyle = (v) => {
    const status = indexStatus(v);
    if (status === 'neutral') return {};
    return { color: `var(--prism-${status})` };
  };

  const Card = ({ label, value, style }) => (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold font-mono tabular-nums mt-1" style={style}>{value}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-semibold tracking-tight">{t('evm.title')}</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label={t('evm.ev')} value={fmt(evm.ev)} />
        <Card label={t('evm.pv')} value={fmt(evm.pv)} />
        <Card label={t('evm.ac')} value={fmt(evm.ac)} />
        <Card label={t('evm.bac')} value={fmt(evm.bac)} />
        <Card label={t('evm.spi')} value={fmtIdx(evm.spi)} style={idxStyle(evm.spi)} />
        <Card label={t('evm.cpi')} value={fmtIdx(evm.cpi)} style={idxStyle(evm.cpi)} />
        <Card label={t('evm.eac')} value={fmt(evm.eac)} />
        <Card label={t('evm.etc')} value={fmt(evm.etc)} />
        <Card label={t('evm.vac')} value={fmt(evm.vac)} />
      </div>

      <div className="overflow-x-auto border border-border rounded-lg bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th scope="col" className="px-3 py-2 font-medium">{t('evm.phase')}</th>
              <th scope="col" className="px-3 py-2 font-medium text-right">{t('evm.planned')}</th>
              <th scope="col" className="px-3 py-2 font-medium text-right">{t('evm.pv')}</th>
              <th scope="col" className="px-3 py-2 font-medium text-right">{t('evm.ev')}</th>
              <th scope="col" className="px-3 py-2 font-medium text-right">{t('evm.ac')}</th>
              <th scope="col" className="px-3 py-2 font-medium text-right">{t('evm.cpi')}</th>
              <th scope="col" className="px-3 py-2 font-medium text-right">{t('evm.spi')}</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {evm.byPhase.map((p) => (
              <tr key={p.phaseId} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-sans">{p.name}</td>
                <td className="px-3 py-2 text-right">{fmt(p.bac)}</td>
                <td className="px-3 py-2 text-right">{fmt(p.pv)}</td>
                <td className="px-3 py-2 text-right">{fmt(p.ev)}</td>
                <td className="px-3 py-2 text-right">{fmt(p.ac)}</td>
                <td className="px-3 py-2 text-right" style={idxStyle(p.cpi)}>{fmtIdx(p.cpi)}</td>
                <td className="px-3 py-2 text-right" style={idxStyle(p.spi)}>{fmtIdx(p.spi)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="font-mono tabular-nums">
            <tr className="font-semibold">
              <td className="px-3 py-2 font-sans">Total</td>
              <td className="px-3 py-2 text-right">{fmt(evm.bac)}</td>
              <td className="px-3 py-2 text-right">{fmt(evm.pv)}</td>
              <td className="px-3 py-2 text-right">{fmt(evm.ev)}</td>
              <td className="px-3 py-2 text-right">{fmt(evm.ac)}</td>
              <td className="px-3 py-2 text-right" style={idxStyle(evm.cpi)}>{fmtIdx(evm.cpi)}</td>
              <td className="px-3 py-2 text-right" style={idxStyle(evm.spi)}>{fmtIdx(evm.spi)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default PilotageView;
