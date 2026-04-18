/**
 * Éditeur d'une phase de projet : nom, durée en semaines, équipe (avec autocomplete
 * depuis le pool de ressources), milestones avec offset hebdomadaire, dépendances
 * vers d'autres phases, et affichage du coût hebdomadaire / coût total.
 *
 * La règle fondamentale : quand un member est lié au pool (resourceId set),
 * le pool est la source of truth pour role et level — les champs sont désactivés
 * dans l'UI et resolveMember() lit toujours la valeur courante du pool.
 */
import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { PlusCircle, Trash2, Pencil, Check, X, Flag, Link2, UserPlus } from 'lucide-react';
import {
  HOURS_PER_WEEK,
  getHourlyRate,
  calculatePhaseWeeklyCost,
  calculatePhaseTotalCost,
  formatCurrency,
} from '../lib/costCalculations';
import { useLocale, LEVEL_KEYS, getLevelLabel } from '../lib/i18n';

/**
 * Éditeur de phase : nom, durée en semaines, team members (autocomplete pool),
 * milestones avec offsets hebdo, dépendances inter-phases.
 *
 * @param {object} props
 * @param {object} props.phase - Phase à éditer (id, name, durationWeeks, teamMembers, milestones, dependencies)
 * @param {object} props.rates - Rates enterprise (INTERNAL_RATE, CONSULTANT_RATES)
 * @param {boolean} [props.isAuthorized] - Si true, affiche les détails de coût par member (taux horaire, h/sem)
 * @param {string} [props.currency] - Code devise pour le formatage (défaut: 'CAD')
 * @param {function} props.onChange - Callback(updatedPhase) appelé à chaque modification
 * @param {object[]} [props.allPhases] - Toutes les phases du projet (pour le select de dépendances)
 * @param {object[]} [props.resourcePool] - Ressources disponibles dans le pool capacité (pour l'autocomplete)
 * @param {function} [props.onResourceAssign] - Callback({ name, role, level }) pour créer une ressource dans le pool
 * @param {function} [props.onResourceLink] - Callback(resourceId, phaseId, allocation) pour créer l'assignment capacité
 */
const PhaseEditor = ({ phase, rates, isAuthorized, currency = 'CAD', onChange, allPhases = [], resourcePool, onResourceAssign, onResourceLink }) => {
  const { t } = useLocale();
  const fmt = (v) => formatCurrency(v, currency);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(phase.name);
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [milestoneName, setMilestoneName] = useState('');
  const [milestoneWeek, setMilestoneWeek] = useState(1);

  const roles = Object.keys(rates.CONSULTANT_RATES);
  const levels = LEVEL_KEYS;

  /**
   * Résout le rôle et le niveau d'un member depuis le pool de ressources.
   *
   * Pourquoi : le JSON de projet stocke role/level comme cache pour la performance,
   * mais si le profil de la ressource est mis à jour dans le pool, la valeur en projet
   * peut être stale. Cette fonction garantit que l'affichage et les calculs utilisent
   * toujours la valeur courante du pool quand un resourceId est présent.
   *
   * @param {object} member - Team member (peut avoir resourceId, role, level)
   * @returns {object} Member avec role/level résolu depuis le pool si lié, sinon inchangé
   */
  const resolveMember = (member) => {
    if (member.resourceId && resourcePool) {
      const res = resourcePool.find(r => r.id === member.resourceId || String(r.id) === String(member.resourceId));
      if (res) {
        return { ...member, role: res.role, level: res.level };
      }
    }
    return member;
  };

  const update = (changes) => onChange({ ...phase, ...changes });

  const addTeamMember = () => {
    update({
      teamMembers: [
        ...phase.teamMembers,
        { role: roles[0], level: levels[0], quantity: 1, allocation: 100 },
      ],
    });
  };

  const removeTeamMember = (index) => {
    update({ teamMembers: phase.teamMembers.filter((_, i) => i !== index) });
  };

  const updateTeamMember = (index, field, value) => {
    const updated = [...phase.teamMembers];
    updated[index] = { ...updated[index], [field]: value };
    update({ teamMembers: updated });
  };

  const saveName = () => {
    if (nameValue.trim()) update({ name: nameValue.trim() });
    setEditingName(false);
  };

  const addMilestone = () => {
    if (!milestoneName.trim()) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    update({
      milestones: [
        ...phase.milestones,
        { id, name: milestoneName.trim(), weekOffset: milestoneWeek },
      ],
    });
    setMilestoneName('');
    setMilestoneWeek(1);
    setAddingMilestone(false);
  };

  const removeMilestone = (id) => {
    update({ milestones: phase.milestones.filter((m) => m.id !== id) });
  };

  // Résoudre tous les members pour les calculs de coût — utilise le pool comme source of truth
  const resolvedPhase = resourcePool
    ? { ...phase, teamMembers: phase.teamMembers.map(resolveMember) }
    : phase;

  const totalCost = calculatePhaseTotalCost(resolvedPhase, rates);

  /**
   * Calcule les détails de coût affichés par member (taux, heures/sem, coût/sem).
   * Utilise resolveMember() pour garantir que le calcul reflète le profil pool actuel.
   *
   * @param {object} member - Team member brut (avant résolution pool)
   * @returns {{ hourlyRate: number, weeklyHours: string, weeklyCost: number }}
   */
  const getMemberDetails = (member) => {
    const resolved = resolveMember(member);
    const hourlyRate = getHourlyRate(rates, resolved.role, resolved.level);
    const weeklyHours = HOURS_PER_WEEK * (member.allocation / 100);
    const weeklyCost = hourlyRate * weeklyHours * member.quantity;
    return { hourlyRate, weeklyHours: weeklyHours.toFixed(1), weeklyCost };
  };

  return (
    <Card>
      <CardHeader>

        {/* --- Header : nom de la phase (édition inline) + durée en semaines --- */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                className="input-field text-lg font-semibold"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName();
                  if (e.key === 'Escape') setEditingName(false);
                }}
                autoFocus
              />
              <Button variant="ghost" size="sm" onClick={saveName}>
                <Check className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditingName(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <CardTitle className="flex items-center gap-2">
              {phase.name}
              <Button variant="ghost" size="sm" onClick={() => { setNameValue(phase.name); setEditingName(true); }}>
                <Pencil className="w-3 h-3" />
              </Button>
            </CardTitle>
          )}
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">{t('phase.duration')}</label>
            <input
              type="number"
              className="input-field w-16 text-center"
              value={phase.durationWeeks}
              min="1"
              max="520"
              onChange={(e) => update({ durationWeeks: Math.max(1, Math.min(520, parseInt(e.target.value) || 1)) })}
            />
            <span className="text-sm text-muted-foreground">{t('phase.weeks')}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">

          {/* --- Section Team members --- */}
          <div className="flex justify-between items-center">
            <h4 className="font-semibold">{t('phase.team')}</h4>
            <Button size="sm" onClick={addTeamMember} className="flex items-center gap-2">
              <PlusCircle className="w-4 h-4" />
              {t('phase.addMember')}
            </Button>
          </div>

          {phase.teamMembers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              {t('phase.noMembers')}
            </p>
          )}

          {phase.teamMembers.map((member, index) => {
            const details = getMemberDetails(member);
            return (
              <div key={index} className="space-y-2 p-4 border rounded-xl bg-secondary/20 hover:bg-secondary/40 transition-colors">

                {/* Autocomplete pool : champ texte avec datalist ou badge "lié" si resourceId set */}
                {resourcePool && (
                  <div className="flex items-center gap-2">
                    {member.resourceId ? (
                      // Ressource liée : affichée en lecture seule, bouton X pour dissocier
                      <div className="flex items-center gap-2 flex-1">
                        <span className="input-field flex-1 text-sm bg-primary/5 font-medium">{member.resourceName}</span>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => {
                          const updated = [...phase.teamMembers];
                          updated[index] = { ...updated[index], resourceName: '', resourceId: null };
                          update({ teamMembers: updated });
                        }} title="Dissocier">
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        {/* Autocomplete via <datalist> : sélection exacte du nom crée le lien au pool */}
                        <input
                          type="text"
                          className="input-field flex-1 text-sm"
                          value={member.resourceName || ''}
                          placeholder={t('resources.search')}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateTeamMember(index, 'resourceName', val);
                            // Si le nom correspond exactement à une ressource du pool, lier automatiquement
                            const match = (resourcePool || []).find(r => r.name === val);
                            if (match) {
                              const updated = [...phase.teamMembers];
                              updated[index] = { ...updated[index], resourceName: match.name, resourceId: match.id, role: match.role, level: match.level };
                              update({ teamMembers: updated });
                              if (onResourceLink) onResourceLink(match.id, phase.id, updated[index].allocation);
                            }
                          }}
                          list={`resource-suggestions-${phase.id}-${index}`}
                        />
                        <datalist id={`resource-suggestions-${phase.id}-${index}`}>
                          {(resourcePool || [])
                            .filter(r => r.name.toLowerCase().includes((member.resourceName || '').toLowerCase()))
                            .map(r => <option key={r.id} value={r.name} />)}
                        </datalist>
                        {/* Bouton "Ajouter au pool" si le nom tapé n'existe pas encore dans le pool */}
                        {member.resourceName && !(resourcePool || []).find(r => r.name === member.resourceName) && onResourceAssign && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex items-center gap-1 text-xs whitespace-nowrap"
                            onClick={() => onResourceAssign({ name: member.resourceName, role: member.role, level: member.level })}
                          >
                            <UserPlus className="w-3 h-3" />
                            {t('resources.addToPool')}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-center">
                  {(() => {
                    const resolved = resolveMember(member);
                    return (
                      <>
                        {/*
                          Sélecteurs role/level : désactivés si member.resourceId est set.
                          Pourquoi : quand une ressource est liée au pool, c'est le pool
                          qui gouverne — éditer localement créerait une divergence de données.
                          resolveMember() garantit que la valeur affichée est toujours celle du pool.
                        */}
                        <select
                          className="select-field"
                          value={resolved.role}
                          onChange={(e) => updateTeamMember(index, 'role', e.target.value)}
                          disabled={!!member.resourceId}
                        >
                          {roles.map((role) => (
                            <option key={role} value={role}>{role}</option>
                          ))}
                          {/*
                            Fallback pour les rôles custom non présents dans les rates
                            (ex: "Chargé de livraison"). Sans cet <option>, le select
                            afficherait le premier rôle de la liste au lieu du rôle réel,
                            et les calculs de coût seraient incorrects.
                          */}
                          {resolved.role && !roles.includes(resolved.role) && (
                            <option value={resolved.role}>{resolved.role}</option>
                          )}
                        </select>

                        <select
                          className="select-field"
                          value={resolved.level}
                          onChange={(e) => updateTeamMember(index, 'level', e.target.value)}
                          disabled={!!member.resourceId}
                        >
                          {levels.map((level) => (
                            <option key={level} value={level}>{getLevelLabel(t, level)}</option>
                          ))}
                        </select>
                      </>
                    );
                  })()}

                  <input
                    type="number"
                    className="input-field"
                    value={member.quantity}
                    min="1"
                    onChange={(e) => updateTeamMember(index, 'quantity', parseInt(e.target.value) || 1)}
                    placeholder="Qty"
                  />

                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      className="input-field w-full"
                      value={member.allocation}
                      min="0"
                      max="100"
                      onChange={(e) => updateTeamMember(index, 'allocation', Math.max(0, Math.min(100, parseInt(e.target.value) || 100)))}
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>

                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => removeTeamMember(index)}
                    className="flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    {t('phase.remove')}
                  </Button>
                </div>

                {/*
                  Période capacity : affichée seulement si startMonth ou endMonth est défini.
                  UX : éviter de polluer l'interface par défaut — le lien "+" permet d'ajouter
                  la période uniquement si nécessaire (cas: même ressource sur périodes discontinues).
                */}
                {member.resourceId && (member.startMonth || member.endMonth ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                    <span>{t('phase.period')} :</span>
                    <input
                      type="month"
                      className="input-field text-xs py-0.5 w-32"
                      value={member.startMonth || ''}
                      onChange={(e) => updateTeamMember(index, 'startMonth', e.target.value || null)}
                    />
                    <span>→</span>
                    <input
                      type="month"
                      className="input-field text-xs py-0.5 w-32"
                      value={member.endMonth || ''}
                      onChange={(e) => updateTeamMember(index, 'endMonth', e.target.value || null)}
                    />
                    <button
                      className="text-muted-foreground hover:text-foreground ml-1"
                      onClick={() => {
                        const updated = [...phase.teamMembers];
                        updated[index] = { ...updated[index], startMonth: null, endMonth: null };
                        update({ teamMembers: updated });
                      }}
                      title={t('phase.remove')}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    className="text-xs text-primary/60 hover:text-primary pt-1"
                    onClick={() => {
                      const startDate = phase.teamMembers[0]?.startMonth || '';
                      updateTeamMember(index, 'startMonth', startDate);
                      updateTeamMember(index, 'endMonth', '');
                    }}
                  >
                    + {t('phase.period')}
                  </button>
                ))}

                {/* Détails de coût (taux, h/sem, coût/sem) — visibles seulement en mode authorized */}
                {isAuthorized && (
                  <div className="text-xs text-muted-foreground grid grid-cols-3 gap-2 pt-1">
                    <div>{t('phase.rate')} : {fmt(details.hourlyRate)}/h</div>
                    <div>{t('phase.hoursWeek')} : {details.weeklyHours}h</div>
                    <div>{t('phase.costWeek')} : {fmt(details.weeklyCost)}</div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Résumé coût phase : coût hebdo moyen + coût total */}
          {phase.teamMembers.length > 0 && (
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="p-4 bg-secondary/50 rounded-xl">
                <div className="text-xs text-muted-foreground">{t('phase.weeklyCost')}</div>
                {/*
                  Coût hebdo = totalCost / durationWeeks (coût moyen sur la durée de la phase).
                  Ce n'est pas un "what-if full phase à pleine allocation" — c'est la moyenne
                  réelle incluant les allocations partielles et les quantités multiples.
                */}
                <div className="text-lg font-bold">{fmt(totalCost / phase.durationWeeks)}</div>
              </div>
              <div className="p-4 bg-primary/5 rounded-xl">
                <div className="text-xs text-muted-foreground">
                  {t('phase.totalCost', { weeks: phase.durationWeeks })}
                </div>
                <div className="text-lg font-bold text-primary">{fmt(totalCost)}</div>
              </div>
            </div>
          )}

          {/* --- Section Milestones --- */}
          <div className="border-t pt-4 mt-4">
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-semibold flex items-center gap-2">
                <Flag className="w-4 h-4 text-amber-500" />
                {t('phase.milestones')}
              </h4>
              {!addingMilestone && (
                <Button variant="outline" size="sm" onClick={() => setAddingMilestone(true)} className="flex items-center gap-1">
                  <PlusCircle className="w-3 h-3" />
                  {t('phase.add')}
                </Button>
              )}
            </div>

            {addingMilestone && (
              <div className="flex items-center gap-2 mb-3 p-3 border rounded-xl bg-secondary/30">
                <input
                  type="text"
                  className="input-field flex-1"
                  value={milestoneName}
                  onChange={(e) => setMilestoneName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addMilestone();
                    if (e.key === 'Escape') setAddingMilestone(false);
                  }}
                  placeholder={t('phase.milestonePlaceholder')}
                  autoFocus
                />
                <span className="text-xs text-muted-foreground">{t('phase.weekAbbr')}</span>
                <input
                  type="number"
                  className="input-field w-14 text-center"
                  value={milestoneWeek}
                  min="1"
                  max={phase.durationWeeks}
                  onChange={(e) => setMilestoneWeek(parseInt(e.target.value) || 1)}
                />
                <Button size="sm" onClick={addMilestone}><Check className="w-3 h-3" /></Button>
                <Button variant="ghost" size="sm" onClick={() => setAddingMilestone(false)}><X className="w-3 h-3" /></Button>
              </div>
            )}

            {phase.milestones.length === 0 && !addingMilestone && (
              <p className="text-xs text-muted-foreground">{t('phase.noMilestones')}</p>
            )}

            {/* Milestones triés par weekOffset croissant */}
            {phase.milestones
              .sort((a, b) => a.weekOffset - b.weekOffset)
              .map((milestone) => (
                <div key={milestone.id} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="flex items-center gap-1.5">
                    <Flag className="w-3 h-3 text-amber-500" />
                    {milestone.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">{t('phase.week', { week: milestone.weekOffset })}</span>
                    <Button variant="ghost" size="sm" onClick={() => removeMilestone(milestone.id)} className="h-6 w-6 p-0">
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
          </div>

          {/* --- Section Dépendances inter-phases (masquée si phase unique) --- */}
          {allPhases.length > 1 && (
            <div className="border-t pt-4 mt-4">
              <h4 className="font-semibold flex items-center gap-2 mb-2">
                <Link2 className="w-4 h-4 text-blue-500" />
                {t('phase.dependencies')}
              </h4>
              <div className="space-y-1">
                {allPhases
                  .filter((p) => p.id !== phase.id)
                  .map((otherPhase) => {
                    const deps = phase.dependencies || [];
                    const isChecked = deps.includes(otherPhase.id);
                    return (
                      <label
                        key={otherPhase.id}
                        className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-secondary/30 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            const newDeps = isChecked
                              ? deps.filter((d) => d !== otherPhase.id)
                              : [...deps, otherPhase.id];
                            update({ dependencies: newDeps });
                          }}
                          className="rounded border-gray-300"
                        />
                        {otherPhase.name}
                      </label>
                    );
                  })}
              </div>
              {(!phase.dependencies || phase.dependencies.length === 0) && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t('phase.noDependencies')}
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default PhaseEditor;
