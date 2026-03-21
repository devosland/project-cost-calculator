import React from 'react';
import { calculateUtilization } from '../lib/capacityCalculations';
import { useLocale } from '../lib/i18n';

const UtilizationSummary = ({ resources, assignments, months, gridCols }) => {
  const { t } = useLocale();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: gridCols, gridColumn: '1 / -1' }} className="items-center">
      <div className="font-medium text-sm py-1 pr-2 text-right sticky left-0 bg-background z-10">
        {t('capacity.utilization')}
      </div>
      {months.map((month) => {
        const totalCapacity = resources.reduce((sum, r) => sum + (r.max_capacity || 100), 0);
        const totalAllocation = resources.reduce(
          (sum, r) => sum + calculateUtilization(assignments, r.id, month),
          0
        );
        const pct = totalCapacity > 0 ? Math.round((totalAllocation / totalCapacity) * 100) : 0;

        let bgColor = 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
        if (pct >= 100) {
          bgColor = 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
        } else if (pct >= 80) {
          bgColor = 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
        }

        return (
          <div
            key={month}
            className={`rounded text-xs font-semibold flex items-center justify-center min-h-[28px] ${bgColor}`}
          >
            {pct}%
          </div>
        );
      })}
    </div>
  );
};

export default UtilizationSummary;
