/**
 * Planificateur de transitions consultant → permanent : création et application
 * de plans de transition avec calcul d'impact de coûts (overlap inclus).
 *
 * Invariants critiques :
 * - totalSavings = currentCost − afterCost (reflète le coût réel d'overlap),
 *   pas annualSavings (qui est un delta fixe de taux sans overlap) — les deux
 *   valeurs sont calculées par calculateTransitionCostImpact() mais seul totalSavings
 *   est correct pour la comparaison avant/après avec chevauchement.
 * - handleApply() persiste le plan AVANT d'appeler applyTransition() pour éviter
 *   une race condition où l'état local n'est pas encore en base.
 * - Les transitions appliquées sont irréversibles par design (statut 'applied' figé),
 *   pour préserver l'intégrité historique des coûts et des assignments.
 */
import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, AlertTriangle, X } from 'lucide-react';
import { Button } from './ui/button';
import { useLocale } from '../lib/i18n';
import { capacityApi } from '../lib/capacityApi';
import { calculateTransitionCostImpact } from '../lib/capacityCalculations';
import { formatCurrency } from '../lib/costCalculations';

/** Génère un ID de plan unique basé sur timestamp + random pour éviter les collisions. */
function generateId() {
  return 'tr-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Planificateur de transitions consultant → permanent.
 *
 * Permet de créer un plan nommé avec N transitions, chacune définissant
 * un consultant à remplacer, sa ressource de remplacement, la date de transition
 * et les semaines de chevauchement. Affiche l'impact de coûts avant/après
 * et détecte les conflits d'assignments existants.
 *
 * @param {object} props
 * @param {object|null} props.plan - Plan existant à éditer (id, name, status, data.transitions), ou null pour un nouveau plan
 * @param {object[]} props.resources - Toutes les ressources du pool (consultants + permanents)
 * @param {object} props.rates - Rates enterprise (INTERNAL_RATE, CONSULTANT_RATES) pour les calculs de coût
 * @param {function} props.onClose - Callback() pour fermer le planificateur
 * @param {function} props.onSave - Callback() appelé après save ou apply réussi (force un refresh dans le parent)
 */
const TransitionPlanner = ({ plan, resources, rates, onClose, onSave }) => {
  const { t } = useLocale();
  const [planName, setPlanName] = useState(plan?.name || '');
  const [transitions, setTransitions] = useState(() => {
    const d = plan?.data;
    if (!d) return [];
    // plan.data peut être un JSON string (stocké tel quel en DB) ou un objet déjà parsé
    const parsed = typeof d === 'string' ? JSON.parse(d) : d;
    return parsed.transitions || [];
  });
  const [status, setStatus] = useState(plan?.status || 'draft');
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  const [assignments, setAssignments] = useState([]);

  // Charge les assignments existants pour la détection de conflits
  // (consultant encore assigné après la date de transition prévue)
  useEffect(() => {
    capacityApi.getAssignments().then((data) => {
      setAssignments(Array.isArray(data) ? data : []);
    }).catch(() => {});
  }, []);

  /** Sous-liste des ressources qui sont consultants (level !== 'Employé interne'). */
  const consultants = useMemo(
    () => resources.filter((r) => r.level !== 'Employ\u00e9 interne'),
    [resources]
  );

  /** Sous-liste des ressources qui sont employés permanents. */
  const permanents = useMemo(
    () => resources.filter((r) => r.level === 'Employ\u00e9 interne'),
    [resources]
  );

  const addTransition = () => {
    setTransitions((prev) => [
      ...prev,
      {
        id: generateId(),
        consultant_resource_id: '',
        replacement_resource_id: '',
        transition_date: new Date().toISOString().slice(0, 7),
        overlap_weeks: 2,
      },
    ]);
  };

  const updateTransition = (id, field, value) => {
    setTransitions((prev) =>
      prev.map((tr) => (tr.id === id ? { ...tr, [field]: value } : tr))
    );
  };

  const removeTransition = (id) => {
    setTransitions((prev) => prev.filter((tr) => tr.id !== id));
  };

  /**
   * Détecte les conflits pour une transition : assignments du consultant
   * dont end_month dépasse la date de transition prévue.
   * Un conflit n'est pas bloquant mais est signalé visuellement (icône warning).
   *
   * @param {object} tr - Transition à valider (consultant_resource_id, transition_date)
   * @returns {object[]} Liste des assignments en conflit
   */
  const getConflicts = (tr) => {
    if (!tr.consultant_resource_id || !tr.transition_date) return [];
    return assignments.filter(
      (a) =>
        String(a.resource_id) === String(tr.consultant_resource_id) &&
        a.end_month > tr.transition_date
    );
  };

  /**
   * Calcule l'impact de coût pour chaque transition.
   * remainingWeeks=52 est une hypothèse de normalisation sur 1 an
   * pour rendre les transitions comparables entre elles.
   *
   * Retourne null si consultant ou replacement n'est pas encore sélectionné.
   */
  const impacts = useMemo(() => {
    return transitions.map((tr) => {
      const consultant = resources.find((r) => String(r.id) === String(tr.consultant_resource_id));
      const replacement = resources.find((r) => String(r.id) === String(tr.replacement_resource_id));
      if (!consultant || !replacement) return null;
      return calculateTransitionCostImpact({
        consultantRole: consultant.role,
        consultantLevel: consultant.level,
        replacementRole: replacement.role,
        replacementLevel: replacement.level,
        allocation: 100,
        remainingWeeks: 52,
        overlapWeeks: tr.overlap_weeks || 0,
        rates,
      });
    });
  }, [transitions, resources, rates]);

  /**
   * Agrège les coûts de toutes les transitions pour les cartes de résumé.
   *
   * totalSavings = currentCost − afterCost : reflète l'économie réelle
   * en tenant compte du coût d'overlap (période où consultant ET permanent
   * sont payés simultanément).
   *
   * Ne pas utiliser annualSavings pour le total : annualSavings est un delta
   * de taux horaires fixes sans overlap, ce qui surestime l'économie réelle.
   */
  const totals = useMemo(() => {
    let currentCost = 0;
    let afterCost = 0;
    impacts.forEach((imp) => {
      if (!imp) return;
      currentCost += imp.consultantCost;
      // afterCost inclut le coût du permanent + le coût d'overlap consultant
      afterCost += imp.replacementCost + imp.overlapCost;
    });
    const totalSavings = currentCost - afterCost;
    return { currentCost, afterCost, totalSavings };
  }, [impacts]);

  /** Sauvegarde le plan (create ou update) sans l'appliquer. */
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: planName || 'Untitled plan',
        status,
        data: { transitions },
      };
      if (plan?.id) {
        await capacityApi.updateTransition(plan.id, payload);
      } else {
        await capacityApi.createTransition(payload);
      }
      onSave();
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Applique le plan de transition : raccourcit les assignments consultants
   * à transition_date + overlap_weeks, crée les assignments pour les permanents.
   *
   * Ordre des opérations critique :
   * 1. Persiste le plan en base AVANT d'appeler applyTransition() — évite une
   *    race condition où l'API lirait un plan non encore sauvegardé.
   * 2. L'application est irréversible par design (statut 'applied' figé) :
   *    le rollback n'est pas supporté pour préserver l'intégrité historique
   *    des coûts et des assignments capacity.
   */
  const handleApply = async () => {
    setApplying(true);
    setError(null);
    try {
      let planId = plan?.id;
      // Auto-save avant apply pour garantir que l'état est persisté
      if (!planId) {
        const payload = { name: planName || 'Untitled plan', data: { transitions } };
        const saved = await capacityApi.createTransition(payload);
        planId = saved.id;
      } else {
        await capacityApi.updateTransition(planId, { name: planName, status, data: { transitions } });
      }
      const result = await capacityApi.applyTransition(planId);
      if (result?.error === 'missing_resources') {
        setError(t('transitions.missingResources'));
        setApplying(false);
        return;
      }
      onSave();
    } catch (err) {
      setError(err.message || 'Apply failed');
      setApplying(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* --- Header : titre + bouton fermer --- */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('transitions.title')}</h2>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* --- Nom du plan --- */}
      <div className="space-y-1">
        <label className="text-sm font-medium">{t('transitions.planName')}</label>
        <input
          type="text"
          className="input-field w-full"
          value={planName}
          onChange={(e) => setPlanName(e.target.value)}
          placeholder={t('transitions.planName')}
        />
      </div>

      {/* --- Liste des transitions --- */}
      <div className="space-y-3">
        {transitions.map((tr, idx) => {
          const conflicts = getConflicts(tr);
          return (
            <div key={tr.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">#{idx + 1}</span>
                <button
                  onClick={() => removeTransition(tr.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                {/* Sélecteur consultant (filtré sur level !== 'Employé interne') */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('transitions.consultant')}
                  </label>
                  <select
                    className="select-field w-full"
                    value={tr.consultant_resource_id}
                    onChange={(e) => updateTransition(tr.id, 'consultant_resource_id', e.target.value)}
                  >
                    <option value="">---</option>
                    {consultants.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.role} - {r.level})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sélecteur remplacement (permanents existants + option "nouveau permanent") */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('transitions.replacement')}
                  </label>
                  <select
                    className="select-field w-full"
                    value={tr.replacement_resource_id}
                    onChange={(e) => updateTransition(tr.id, 'replacement_resource_id', e.target.value)}
                  >
                    <option value="">---</option>
                    {permanents.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.role})
                      </option>
                    ))}
                    <option value="new">{t('transitions.newPermanent')}</option>
                  </select>
                </div>

                {/* Date de transition (mois où le consultant s'arrête) */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('transitions.date')}
                  </label>
                  <input
                    type="month"
                    className="input-field w-full"
                    value={tr.transition_date}
                    onChange={(e) => updateTransition(tr.id, 'transition_date', e.target.value)}
                  />
                </div>

                {/*
                  Semaines d'overlap : période pendant laquelle consultant ET permanent
                  sont payés simultanément (transfert de connaissance).
                  Le consultant reste jusqu'à transition_date + overlap_weeks.
                  Impacte directement overlapCost dans calculateTransitionCostImpact().
                */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('transitions.overlap')} ({t('transitions.weeks')})
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={12}
                    className="input-field w-full"
                    value={tr.overlap_weeks}
                    onChange={(e) =>
                      updateTransition(tr.id, 'overlap_weeks', Math.min(12, Math.max(0, Number(e.target.value))))
                    }
                  />
                </div>
              </div>

              {/* Warning si le consultant a des assignments qui débordent après transition_date */}
              {conflicts.length > 0 && (
                <div className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 dark:bg-amber-900/20 rounded px-3 py-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{t('transitions.conflict')}</span>
                </div>
              )}

              {/* Impact de coût de la transition individuelle (annualSavings = delta de taux sur 52 sem) */}
              {impacts[idx] && (
                <div className="text-sm text-muted-foreground flex gap-4">
                  <span>{t('transitions.savings')}: <span className={impacts[idx].annualSavings > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>{formatCurrency(impacts[idx].annualSavings)}</span></span>
                </div>
              )}
            </div>
          );
        })}

        <Button variant="outline" size="sm" onClick={addTransition}>
          <Plus className="w-4 h-4 mr-1" />
          {t('transitions.addTransition')}
        </Button>
      </div>

      {/* --- Cartes de résumé coût global (avant / après / économie) --- */}
      {transitions.length > 0 && impacts.some(Boolean) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="border rounded-lg p-4 text-center bg-red-50 dark:bg-red-900/20">
            <div className="text-xs font-medium text-muted-foreground mb-1">
              {t('transitions.costCurrent')}
            </div>
            <div className="text-xl font-bold text-red-600">
              {formatCurrency(totals.currentCost)}
            </div>
          </div>
          <div className="border rounded-lg p-4 text-center bg-green-50 dark:bg-green-900/20">
            <div className="text-xs font-medium text-muted-foreground mb-1">
              {t('transitions.costAfter')}
            </div>
            <div className="text-xl font-bold text-green-600">
              {/* afterCost = coût permanent + coût d'overlap consultant sur la période */}
              {formatCurrency(totals.afterCost)}
            </div>
          </div>
          <div className="border rounded-lg p-4 text-center bg-primary/5">
            <div className="text-xs font-medium text-muted-foreground mb-1">
              {t('transitions.savings')}
            </div>
            <div className="text-xl font-bold text-primary">
              {/* totalSavings = currentCost − afterCost : économie réelle avec overlap inclus */}
              {formatCurrency(totals.totalSavings)}
            </div>
          </div>
        </div>
      )}

      {/* --- Erreur d'application --- */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>
      )}

      {/* --- Actions : Annuler / Sauvegarder / Appliquer --- */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t('resources.cancel')}
        </Button>
        <Button variant="outline" size="sm" disabled={saving || transitions.length === 0} onClick={handleSave}>
          {saving ? '...' : t('resources.save')}
        </Button>
        {/*
          Bouton Appliquer masqué si le plan est déjà 'applied' — les transitions appliquées
          sont irréversibles par design pour préserver l'intégrité historique des coûts.
        */}
        {status !== 'applied' && (
          <Button size="sm" disabled={applying || transitions.length === 0} onClick={handleApply}>
            {applying ? '...' : t('transitions.apply')}
          </Button>
        )}
      </div>
    </div>
  );
};

export default TransitionPlanner;
