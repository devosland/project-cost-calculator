import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from './ui/button';
import { useLocale } from '../lib/i18n';
import { capacityApi } from '../lib/capacityApi';
import { getMonthRange, calculateUtilization } from '../lib/capacityCalculations';
import GanttBar from './GanttBar';
import UtilizationSummary from './UtilizationSummary';
import QuickTransition from './QuickTransition';

const PROJECT_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444',
  '#06b6d4', '#f97316', '#8b5cf6', '#14b8a6',
];

function addMonths(ym, count) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + count, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const CapacityGantt = ({ rates }) => {
  const { t, locale } = useLocale();
  const [viewMode, setViewMode] = useState('project');
  const now = new Date();
  const [startMonth, setStartMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  );
  const [data, setData] = useState({ resources: [], assignments: [] });
  const [collapsed, setCollapsed] = useState({});
  const [quickTransition, setQuickTransition] = useState(null);

  const endMonth = useMemo(() => addMonths(startMonth, 11), [startMonth]);
  const months = useMemo(() => getMonthRange(startMonth, endMonth), [startMonth, endMonth]);

  useEffect(() => {
    capacityApi.getGanttData(startMonth, endMonth).then(setData).catch(() => {});
  }, [startMonth, endMonth]);

  const { resources, assignments } = data;

  const toggleCollapse = (key) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  const formatMonth = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1).toLocaleDateString(locale === 'fr' ? 'fr-CA' : 'en-CA', {
      month: 'short',
    });
  };

  const projectColorMap = useMemo(() => {
    const map = {};
    const projectIds = [...new Set(assignments.map((a) => a.project_id))];
    projectIds.forEach((id, i) => {
      map[id] = PROJECT_COLORS[i % PROJECT_COLORS.length];
    });
    return map;
  }, [assignments]);

  const projectNameMap = useMemo(() => {
    const map = {};
    assignments.forEach((a) => {
      if (a.project_name) map[a.project_id] = a.project_name;
    });
    return map;
  }, [assignments]);

  if (!resources.length && !assignments.length) {
    return (
      <div className="text-center text-muted-foreground py-12">
        {t('capacity.noData')}
      </div>
    );
  }

  const gridCols = `200px repeat(${months.length}, 1fr)`;

  const getBarProps = (assignment) => {
    const startIdx = months.indexOf(assignment.start_month < startMonth ? startMonth : assignment.start_month);
    const endIdx = months.indexOf(assignment.end_month > endMonth ? endMonth : assignment.end_month);
    if (startIdx === -1 || endIdx === -1) return null;
    return {
      colStart: startIdx + 2, // +2 because grid col 1 is the name column (CSS grid is 1-based)
      colSpan: endIdx - startIdx + 1,
    };
  };

  const renderResourceDot = (resource) => {
    const isPermanent = resource.level === 'Employé interne';
    return (
      <span
        className={`inline-block w-2 h-2 rounded-full mr-1.5 shrink-0 ${
          isPermanent ? 'bg-green-500' : 'bg-orange-500'
        }`}
      />
    );
  };

  // --- By Project view ---
  const renderByProject = () => {
    const grouped = {};
    assignments.forEach((a) => {
      if (!grouped[a.project_id]) grouped[a.project_id] = [];
      grouped[a.project_id].push(a);
    });

    return Object.entries(grouped).map(([projectId, projAssignments]) => {
      const color = projectColorMap[projectId];
      const name = projectNameMap[projectId] || `Project ${projectId}`;
      const isCollapsed = collapsed[`p-${projectId}`];
      const resourceIds = [...new Set(projAssignments.map((a) => a.resource_id))];

      return (
        <React.Fragment key={projectId}>
          {/* Project header row */}
          <div
            className="col-span-full flex items-center gap-2 py-1.5 px-2 cursor-pointer rounded font-medium text-sm text-white"
            style={{ backgroundColor: color }}
            onClick={() => toggleCollapse(`p-${projectId}`)}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {name}
          </div>

          {!isCollapsed &&
            resourceIds.map((rid) => {
              const resource = resources.find((r) => r.id === rid);
              if (!resource) return null;
              const resAssignments = projAssignments.filter((a) => a.resource_id === rid);

              return (
                <div key={`${projectId}-${rid}`} className="contents">
                  <div className="text-sm truncate py-1 pr-2 flex items-center sticky left-0 bg-background z-10">
                    {renderResourceDot(resource)}
                    {resource.name}
                  </div>
                  {months.map((month) => {
                    const bar = resAssignments.find(
                      (a) => a.start_month <= month && a.end_month >= month
                    );
                    if (!bar) return <div key={month} />;
                    // Only render bar on first month of this assignment visible in range
                    const visStart = bar.start_month < startMonth ? startMonth : bar.start_month;
                    if (month !== visStart) return <div key={month} />;
                    const props = getBarProps(bar);
                    if (!props) return <div key={month} />;
                    return (
                      <GanttBar
                        key={month}
                        color={color}
                        allocation={bar.allocation}
                        label={resource.name}
                        colStart={props.colStart}
                        colSpan={props.colSpan}
                        isConsultant={resource.level !== 'Employé interne'}
                        onClick={() => {
                          if (resource.level !== 'Employé interne') {
                            setQuickTransition({ consultant: resource, assignment: bar });
                          }
                        }}
                      />
                    );
                  })}
                </div>
              );
            })}
        </React.Fragment>
      );
    });
  };

  // --- By Type view ---
  const renderByType = () => {
    const permanents = resources.filter((r) => r.level === 'Employé interne');
    const consultants = resources.filter((r) => r.level !== 'Employé interne');

    const renderSection = (label, sectionResources, headerColor, key) => {
      const isCollapsed = collapsed[key];
      return (
        <React.Fragment key={key}>
          <div
            className="col-span-full flex items-center gap-2 py-1.5 px-2 cursor-pointer rounded font-medium text-sm text-white"
            style={{ backgroundColor: headerColor }}
            onClick={() => toggleCollapse(key)}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {label} ({sectionResources.length})
          </div>

          {!isCollapsed &&
            sectionResources.map((resource) => {
              const resAssignments = assignments.filter((a) => a.resource_id === resource.id);

              return (
                <div key={resource.id} className="contents">
                  <div className="text-sm truncate py-1 pr-2 flex items-center sticky left-0 bg-background z-10">
                    {renderResourceDot(resource)}
                    {resource.name}
                  </div>
                  {months.map((month) => {
                    const util = calculateUtilization(assignments, resource.id, month);
                    const overAllocated = util > (resource.max_capacity || 100);

                    // Find assignments for this month
                    const monthAssignments = resAssignments.filter(
                      (a) => a.start_month <= month && a.end_month >= month
                    );

                    // Render bars only on their first visible month
                    const bars = monthAssignments.filter((a) => {
                      const visStart = a.start_month < startMonth ? startMonth : a.start_month;
                      return month === visStart;
                    });

                    if (bars.length === 0) {
                      return (
                        <div
                          key={month}
                          className={overAllocated ? 'bg-red-100 rounded' : ''}
                        />
                      );
                    }

                    return bars.map((bar) => {
                      const props = getBarProps(bar);
                      if (!props) return <div key={`${month}-${bar.id}`} />;
                      const color = projectColorMap[bar.project_id] || PROJECT_COLORS[0];
                      return (
                        <GanttBar
                          key={`${month}-${bar.id}`}
                          color={color}
                          allocation={bar.allocation}
                          label={projectNameMap[bar.project_id] || `Project ${bar.project_id}`}
                          colStart={props.colStart}
                          colSpan={props.colSpan}
                          isConsultant={resource.level !== 'Employé interne'}
                          onClick={() => {
                            if (resource.level !== 'Employé interne') {
                              setQuickTransition({ consultant: resource, assignment: bar });
                            }
                          }}
                        />
                      );
                    });
                  })}
                </div>
              );
            })}
        </React.Fragment>
      );
    };

    return (
      <>
        {renderSection(t('capacity.permanent'), permanents, '#10b981', 'type-perm')}
        {renderSection(t('capacity.consultant'), consultants, '#f97316', 'type-cons')}
      </>
    );
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1">
          <Button
            variant={viewMode === 'project' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('project')}
          >
            {t('capacity.byProject')}
          </Button>
          <Button
            variant={viewMode === 'type' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('type')}
          >
            {t('capacity.byType')}
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setStartMonth(addMonths(startMonth, -1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium px-2">
            {formatMonth(startMonth)} — {formatMonth(endMonth)}
          </span>
          <Button variant="outline" size="sm" onClick={() => setStartMonth(addMonths(startMonth, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto border rounded-lg">
        <div
          className="min-w-[900px]"
          style={{
            display: 'grid',
            gridTemplateColumns: gridCols,
            gap: '2px 4px',
            padding: '8px',
          }}
        >
          {/* Month headers */}
          <div className="font-medium text-sm text-muted-foreground sticky left-0 bg-background z-10" />
          {months.map((m) => (
            <div key={m} className="text-center text-xs font-medium text-muted-foreground py-1">
              {formatMonth(m)}
            </div>
          ))}

          {/* Resource rows */}
          {viewMode === 'project' ? renderByProject() : renderByType()}

          {/* Utilization summary */}
          <UtilizationSummary resources={resources} assignments={assignments} months={months} />
        </div>
      </div>

      {quickTransition && (
        <QuickTransition
          consultant={quickTransition.consultant}
          assignment={quickTransition.assignment}
          resources={resources}
          rates={rates}
          onClose={() => setQuickTransition(null)}
          onApply={() => {
            capacityApi.getGanttData(startMonth, endMonth).then(setData).catch(() => {});
          }}
        />
      )}
    </div>
  );
};

export default CapacityGantt;
