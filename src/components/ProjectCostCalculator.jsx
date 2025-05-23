import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import { PlusCircle, Trash2 } from 'lucide-react';
import { getRatesConfig } from '../config/rates';

const useQuery = () => {
  return new URLSearchParams(window.location.search);
}

const ProjectCostCalculator = () => {
  const query = useQuery();
  const isAuthorized = query.get('r') === 'true';

  const HOURS_PER_DAY = 7.5;
  const DAYS_PER_WEEK = 5;
  const HOURS_PER_WEEK = HOURS_PER_DAY * DAYS_PER_WEEK;
  const TAX_MULTIPLIER = 1.049875;

  const [teamMembers, setTeamMembers] = useState([]);
  const [totalCost, setTotalCost] = useState(0);
  const [includeContingency, setIncludeContingency] = useState(false);
  const [contingencyPercentage, setContingencyPercentage] = useState(10);
  const [includeTaxes, setIncludeTaxes] = useState(false);
  const [rates, setRates] = useState({ INTERNAL_RATE: 0, CONSULTANT_RATES: {} });

  useEffect(() => {
    // Load rates when component mounts
    getRatesConfig().then(config => {
      setRates({
        INTERNAL_RATE: config.INTERNAL_RATE,
        CONSULTANT_RATES: config.CONSULTANT_RATES
      });
    });
  }, []);

  const roles = Object.keys(rates.CONSULTANT_RATES);
  const levels = ['Employé interne', 'Junior', 'Intermédiaire', 'Sénior', 'Expert'];

  const addTeamMember = () => {
    setTeamMembers([
      ...teamMembers,
      {
        role: roles[0],
        level: levels[0],
        quantity: 1,
        allocation: 100,
      },
    ]);
    updateCosts();
  };

  const removeTeamMember = (index) => {
    const newTeamMembers = teamMembers.filter((_, i) => i !== index);
    setTeamMembers(newTeamMembers);
    updateCosts();
  };

  const updateTeamMember = (index, field, value) => {
    const newTeamMembers = [...teamMembers];
    newTeamMembers[index][field] = value;
    setTeamMembers(newTeamMembers);
    updateCosts();
  };

  const getHourlyRate = (role, level) => {
    if (level === 'Employé interne') {
      return rates.INTERNAL_RATE;
    }
    return rates.CONSULTANT_RATES[role]?.[level] || 0;
  };

  const calculateWeeklyCost = () => {
    let baseCost = teamMembers.reduce((total, member) => {
      const hourlyRate = getHourlyRate(member.role, member.level);
      const memberCost = 
        hourlyRate * 
        HOURS_PER_WEEK * 
        member.quantity * 
        (member.allocation / 100);
      return total + memberCost;
    }, 0);

    if (includeContingency) {
      baseCost *= (1 + contingencyPercentage / 100);
    }

    if (includeTaxes) {
      baseCost *= TAX_MULTIPLIER;
    }

    return baseCost;
  };

  const calculateMonthlyCost = (weeklyCost) => {
    return weeklyCost * 52 / 12;
  };

  const calculateYearlyCost = (weeklyCost) => {
    return weeklyCost * 52;
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('fr-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const updateCosts = () => {
    const weekly = calculateWeeklyCost();
    const monthly = calculateMonthlyCost(weekly);
    const yearly = calculateYearlyCost(weekly);
    
    setTotalCost({
      weekly: formatCurrency(weekly),
      monthly: formatCurrency(monthly),
      yearly: formatCurrency(yearly)
    });
  };

  const getMemberDetails = (member) => {
    const hourlyRate = getHourlyRate(member.role, member.level);
    const weeklyHours = HOURS_PER_WEEK * (member.allocation / 100);
    const weeklyCost = hourlyRate * weeklyHours * member.quantity;
    return {
      hourlyRate,
      weeklyHours: weeklyHours.toFixed(1),
      weeklyCost: formatCurrency(weeklyCost)
    };
  };

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle>Calculateur de coûts de projet</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">Composition de l'équipe</h3>
            <Button 
              variant="default"
              size="default"
              onClick={addTeamMember}
              className="flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              Ajouter un membre
            </Button>
          </div>

          {teamMembers.map((member, index) => {
            const details = getMemberDetails(member);
            return (
            <div key={index} className="space-y-4 p-4 border rounded-lg">
              <div className="grid grid-cols-5 gap-4 items-center">
                <select
                  className="p-2 border rounded"
                  value={member.role}
                  onChange={(e) => updateTeamMember(index, 'role', e.target.value)}
                >
                  {roles.map(role => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>

                <select
                  className="p-2 border rounded"
                  value={member.level}
                  onChange={(e) => updateTeamMember(index, 'level', e.target.value)}
                >
                  {levels.map(level => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>

                <input
                  type="number"
                  className="p-2 border rounded"
                  value={member.quantity}
                  min="1"
                  onChange={(e) => updateTeamMember(index, 'quantity', parseInt(e.target.value))}
                  placeholder="Quantité"
                />

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    className="p-2 border rounded w-full"
                    value={member.allocation}
                    min="1"
                    max="100"
                    onChange={(e) => updateTeamMember(index, 'allocation', parseInt(e.target.value))}
                    placeholder="Allocation %"
                  />
                  <span>%</span>
                </div>

                <Button
                  variant="destructive"
                  size="default"
                  onClick={() => removeTeamMember(index)}
                  className="flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Supprimer
                </Button>
              </div>
              {isAuthorized && (
                <div className="text-sm text-gray-600 grid grid-cols-3 gap-2">
                  <div>Taux horaire: {formatCurrency(details.hourlyRate)}</div>
                  <div>Heures/semaine: {details.weeklyHours}h</div>
                  <div>Coût/semaine: {details.weeklyCost}</div>
                </div>
              )}
            </div>
          )})}

          <div className="space-y-4 p-4 border rounded-lg">
            <div className="space-y-4">
              <div className="space-y-1 text-left">
                <Label>Inclure une contingence</Label>
                <div className="flex items-center gap-4">
                  <Switch
                    checked={includeContingency}
                    onCheckedChange={setIncludeContingency}
                  />
                  {includeContingency && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        className="p-2 border rounded w-24"
                        value={contingencyPercentage}
                        min="0"
                        max="100"
                        onChange={(e) => { setContingencyPercentage(parseInt(e.target.value)); }}
                      />
                      <span>%</span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="space-y-1 text-left">
                <Label>Inclure les taxes (4,9875%)</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={includeTaxes}
                    onCheckedChange={setIncludeTaxes}
                    
                  />
                </div>
              </div>
            </div>
          </div>

          <Button 
            variant="default"
            size="default"
            onClick={updateCosts}
            className="w-full mt-4"
          >
            Calculer les coûts
          </Button>

          {totalCost !== 0 && (
            <div className="mt-6 space-y-2">
              <h3 className="text-lg font-medium">Coûts estimés</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-gray-600">Coût hebdomadaire</div>
                  <div className="text-xl font-bold">{totalCost.weekly}</div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-gray-600">Coût mensuel</div>
                  <div className="text-xl font-bold">{totalCost.monthly}</div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-gray-600">Coût annuel</div>
                  <div className="text-xl font-bold">{totalCost.yearly}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ProjectCostCalculator;