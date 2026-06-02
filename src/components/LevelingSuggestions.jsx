/**
 * LevelingSuggestions — panneau de suggestions de nivellement (SP4).
 * Lecture du pur `suggestLeveling`; « Appliquer » pose une contrainte SNET via onApplyConstraint.
 */
import { suggestLeveling } from '../lib/leveling';
import { useLocale } from '../lib/i18n';

const LevelingSuggestions = ({ project, onApplyConstraint }) => {
  const { t } = useLocale();
  const suggestions = suggestLeveling(project);
  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-2">
      <h3 className="font-semibold">{t('leveling.title')}</h3>
      {suggestions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('leveling.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {suggestions.map((s) => (
            <li key={s.phaseId} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {t('leveling.suggestion', { phase: s.phaseName, weeks: s.delayWeeks, role: `${s.role} ${s.level}` })}
              </span>
              <button
                type="button"
                className="text-xs border border-border rounded-md px-2 py-1 hover:bg-muted whitespace-nowrap"
                onClick={() => onApplyConstraint(s.phaseId, { type: 'SNET', week: s.newStart })}
              >
                {t('leveling.apply')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default LevelingSuggestions;
