import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { PlusCircle, Trash2, Pencil, Check, X, Flag } from 'lucide-react';
import {
  HOURS_PER_WEEK,
  getHourlyRate,
  calculatePhaseWeeklyCost,
  calculatePhaseTotalCost,
  formatCurrency,
} from '../lib/costCalculations';

const PhaseEditor = ({ phase, rates, isAuthorized, currency = 'CAD', onChange }) => {
  const fmt = (v) => formatCurrency(v, currency);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(phase.name);
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [milestoneName, setMilestoneName] = useState('');
  const [milestoneWeek, setMilestoneWeek] = useState(1);

  const roles = Object.keys(rates.CONSULTANT_RATES);
  const levels = ['Employ\u00e9 interne', 'Junior', 'Interm\u00e9diaire', 'S\u00e9nior', 'Expert'];

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

  const weeklyCost = calculatePhaseWeeklyCost(phase, rates);
  const totalCost = calculatePhaseTotalCost(phase, rates);

  const getMemberDetails = (member) => {
    const hourlyRate = getHourlyRate(rates, member.role, member.level);
    const weeklyHours = HOURS_PER_WEEK * (member.allocation / 100);
    const weeklyCost = hourlyRate * weeklyHours * member.quantity;
    return { hourlyRate, weeklyHours: weeklyHours.toFixed(1), weeklyCost };
  };

  return (
    <Card>
      <CardHeader>
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
            <label className="text-sm text-muted-foreground">{"Dur\u00e9e :"}</label>
            <input
              type="number"
              className="input-field w-16 text-center"
              value={phase.durationWeeks}
              min="1"
              onChange={(e) => update({ durationWeeks: Math.max(1, parseInt(e.target.value) || 1) })}
            />
            <span className="text-sm text-muted-foreground">semaines</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="font-semibold">{"\u00c9quipe"}</h4>
            <Button size="sm" onClick={addTeamMember} className="flex items-center gap-2">
              <PlusCircle className="w-4 h-4" />
              Ajouter un membre
            </Button>
          </div>

          {phase.teamMembers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              {"Aucun membre. Ajoutez des membres pour calculer les co\u00fbts."}
            </p>
          )}

          {phase.teamMembers.map((member, index) => {
            const details = getMemberDetails(member);
            return (
              <div key={index} className="space-y-2 p-4 border rounded-xl bg-secondary/20 hover:bg-secondary/40 transition-colors">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-center">
                  <select
                    className="select-field"
                    value={member.role}
                    onChange={(e) => updateTeamMember(index, 'role', e.target.value)}
                  >
                    {roles.map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>

                  <select
                    className="select-field"
                    value={member.level}
                    onChange={(e) => updateTeamMember(index, 'level', e.target.value)}
                  >
                    {levels.map((level) => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>

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
                      min="1"
                      max="100"
                      onChange={(e) => updateTeamMember(index, 'allocation', parseInt(e.target.value) || 100)}
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
                    Supprimer
                  </Button>
                </div>
                {isAuthorized && (
                  <div className="text-xs text-muted-foreground grid grid-cols-3 gap-2 pt-1">
                    <div>Taux : {fmt(details.hourlyRate)}/h</div>
                    <div>Heures/sem : {details.weeklyHours}h</div>
                    <div>{"Co\u00fbt/sem : "}{fmt(details.weeklyCost)}</div>
                  </div>
                )}
              </div>
            );
          })}

          {phase.teamMembers.length > 0 && (
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="p-4 bg-secondary/50 rounded-xl">
                <div className="text-xs text-muted-foreground">{"Co\u00fbt hebdomadaire"}</div>
                <div className="text-lg font-bold">{fmt(weeklyCost)}</div>
              </div>
              <div className="p-4 bg-primary/5 rounded-xl">
                <div className="text-xs text-muted-foreground">
                  {"Co\u00fbt total ("}{phase.durationWeeks}{" sem.)"}
                </div>
                <div className="text-lg font-bold text-primary">{fmt(totalCost)}</div>
              </div>
            </div>
          )}

          <div className="border-t pt-4 mt-4">
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-semibold flex items-center gap-2">
                <Flag className="w-4 h-4 text-amber-500" />
                Jalons
              </h4>
              {!addingMilestone && (
                <Button variant="outline" size="sm" onClick={() => setAddingMilestone(true)} className="flex items-center gap-1">
                  <PlusCircle className="w-3 h-3" />
                  Ajouter
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
                  placeholder="Nom du jalon"
                  autoFocus
                />
                <span className="text-xs text-muted-foreground">Sem.</span>
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
              <p className="text-xs text-muted-foreground">{"Aucun jalon d\u00e9fini."}</p>
            )}

            {phase.milestones
              .sort((a, b) => a.weekOffset - b.weekOffset)
              .map((milestone) => (
                <div key={milestone.id} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="flex items-center gap-1.5">
                    <Flag className="w-3 h-3 text-amber-500" />
                    {milestone.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">Semaine {milestone.weekOffset}</span>
                    <Button variant="ghost" size="sm" onClick={() => removeMilestone(milestone.id)} className="h-6 w-6 p-0">
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PhaseEditor;
