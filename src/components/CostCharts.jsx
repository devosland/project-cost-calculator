/**
 * Cost visualisation panel with three switchable breakdown views: by role,
 * by phase, and by category (labour vs non-labour). Renders a custom SVG pie
 * chart with hover highlighting alongside a sorted horizontal bar chart.
 * Both charts are purely client-side — no charting library dependency.
 */
import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import {
  getCostByRole,
  getCostByPhase,
  getCostByCategory,
  formatCurrency,
} from '../lib/costCalculations';
import { useLocale } from '../lib/i18n';

const CHART_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444',
  '#06b6d4', '#f97316', '#8b5cf6', '#14b8a6',
  '#ec4899', '#3b82f6', '#84cc16', '#a855f7',
];

/**
 * SVG pie chart rendered without an external library. Computes arc paths from
 * polar coordinates; handles the degenerate single-slice case with a full
 * circle path to avoid an invisible arc.
 *
 * @param {Object} props
 * @param {Record<string, number>} props.data - Label → value map; zero-value entries are filtered.
 * @param {string} props.currency - ISO currency code for the legend tooltip.
 * @param {number} [props.size=200] - SVG width/height in px.
 */
const PieChart = ({ data, currency, size = 200 }) => {
  const [hovered, setHovered] = useState(null);
  const total = Object.values(data).reduce((s, v) => s + v, 0);
  if (total === 0) return null;

  const entries = Object.entries(data).filter(([, v]) => v > 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 10;

  let startAngle = -Math.PI / 2;
  const slices = entries.map(([label, value], i) => {
    const angle = (value / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const largeArc = angle > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const path =
      entries.length === 1
        ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
        : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    startAngle = endAngle;
    return { label, value, path, color: CHART_COLORS[i % CHART_COLORS.length] };
  });

  return (
    <div className="flex items-center gap-8">
      <svg width={size} height={size} className="shrink-0 drop-shadow-sm">
        {slices.map((slice, i) => (
          <path
            key={i}
            d={slice.path}
            fill={slice.color}
            opacity={hovered === null || hovered === i ? 1 : 0.3}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            className="transition-opacity duration-200 cursor-pointer"
            stroke="white"
            strokeWidth="2"
          />
        ))}
      </svg>
      <div className="space-y-2 min-w-0">
        {slices.map((slice, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 text-sm transition-opacity duration-200 ${
              hovered !== null && hovered !== i ? 'opacity-30' : ''
            }`}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: slice.color }}
            />
            <span className="truncate font-medium">{slice.label}</span>
            <span className="text-muted-foreground ml-auto whitespace-nowrap font-mono tabular-nums">
              {formatCurrency(slice.value, currency)} ({((slice.value / total) * 100).toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Horizontal proportional bar chart sorted descending by value. Bar widths
 * are relative to the maximum entry so the tallest bar always fills 100%.
 *
 * @param {Object} props
 * @param {Record<string, number>} props.data - Label → value map.
 * @param {string} props.currency - ISO currency code for formatted labels.
 */
const BarChart = ({ data, currency }) => {
  const total = Object.values(data).reduce((s, v) => s + v, 0);
  if (total === 0) return null;

  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const maxValue = Math.max(...entries.map(([, v]) => v));

  return (
    <div className="space-y-3">
      {entries.map(([label, value], i) => (
        <div key={label} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="font-medium truncate">{label}</span>
            <span className="text-muted-foreground whitespace-nowrap ml-2 font-mono tabular-nums">
              {formatCurrency(value, currency)}
            </span>
          </div>
          <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(value / maxValue) * 100}%`,
                backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * @param {Object} props
 * @param {Object} props.project - Full project object used to derive cost breakdowns.
 * @param {Object} props.rates - Enterprise rate table for labour cost calculations.
 */
const CostCharts = ({ project, rates }) => {
  const { t } = useLocale();
  const [view, setView] = useState('role');
  const currency = project.settings?.currency || 'CAD';

  const VIEWS = [
    { id: 'role', label: t('charts.byRole') },
    { id: 'phase', label: t('charts.byPhase') },
    { id: 'category', label: t('charts.byCategory') },
  ];

  const dataMap = {
    role: getCostByRole(project, rates),
    phase: getCostByPhase(project, rates),
    category: getCostByCategory(project, rates, t('category.labour')),
  };

  const data = dataMap[view];
  const hasData = Object.values(data).some((v) => v > 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="font-display text-xl tracking-tight">{t('charts.title')}</CardTitle>
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  view === v.id
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setView(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            {t('charts.empty')}
          </p>
        ) : (
          <div className="space-y-8">
            <PieChart data={data} currency={currency} />
            <div className="border-t border-border pt-6">
              <BarChart data={data} currency={currency} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CostCharts;
