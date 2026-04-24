/**
 * Cross-project "My Work" landing page for team members. Shows every task
 * assigned to the logged-in user grouped by project, with a direct-open
 * TaskPanel for quick editing and time logging.
 *
 * Why a dedicated view: without it, a team member on N projects has to
 * click through N projects to find their assigned work. Here they see the
 * whole picture in one place — Jira's "Your work" page, simplified.
 *
 * Status grouping reuses the existing 3 default statuses. When/if the
 * workflow customisation UI lands (V2), each project's columns can be
 * rendered faithfully; for MVP we group by category (todo / inprogress /
 * done) which is stable across projects.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import { useLocale } from '../../lib/i18n';
import { executionApi } from '../../lib/executionApi';
import { capacityApi } from '../../lib/capacityApi';
import TaskPanel from './TaskPanel';

const STATUS_ORDER = ['To Do', 'In Progress', 'Done'];

export default function MyWork({ onBack }) {
  const { t } = useLocale();
  const [tasks, setTasks] = useState([]);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openTaskId, setOpenTaskId] = useState(null);
  const [collapsedProject, setCollapsedProject] = useState({});

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [my, res] = await Promise.all([
        executionApi.getMyTasks(),
        capacityApi.getResources().catch(() => []),
      ]);
      setTasks(my);
      setResources(res);
    } catch (err) {
      console.error('MyWork load failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Group by project, then by status. Stable sort: project name alphabetical,
  // then status by canonical order, finally the raw task order from the server.
  const byProject = new Map();
  for (const tk of tasks) {
    if (!byProject.has(tk.project_id)) {
      byProject.set(tk.project_id, { name: tk.project_name, tasks: [] });
    }
    byProject.get(tk.project_id).tasks.push(tk);
  }

  const statuses = [
    { name: 'To Do', category: 'todo' },
    { name: 'In Progress', category: 'inprogress' },
    { name: 'Done', category: 'done' },
  ];

  function toggle(projectId) {
    setCollapsedProject((c) => ({ ...c, [projectId]: !c[projectId] }));
  }

  const projectEntries = [...byProject.entries()].sort((a, b) =>
    (a[1].name || '').localeCompare(b[1].name || '')
  );

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <header className="flex items-center gap-3">
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack} title={t('myWork.back')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
        )}
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t('myWork.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('myWork.subtitle')}</p>
        </div>
      </header>

      {loading && <p className="text-sm text-muted-foreground">{t('work.loading')}</p>}

      {!loading && projectEntries.length === 0 && (
        <div className="border border-border rounded-lg p-8 text-center text-sm text-muted-foreground bg-card">
          {t('myWork.empty')}
        </div>
      )}

      {projectEntries.map(([projectId, { name, tasks: projectTasks }]) => {
        const collapsed = collapsedProject[projectId];
        const todo = projectTasks.filter((t) => STATUS_ORDER.indexOf(t.status) < 2).length;
        return (
          <section key={projectId} className="border border-border rounded-lg bg-card">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 text-left border-b border-border"
              onClick={() => toggle(projectId)}
            >
              <div className="flex items-center gap-3">
                {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                <span className="font-semibold">{name}</span>
                <span className="text-xs text-muted-foreground font-mono tabular-nums">
                  {todo} {t('myWork.openCount')}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {projectTasks.length} {t('myWork.totalCount')}
              </span>
            </button>

            {!collapsed && (
              <div className="divide-y divide-border">
                {STATUS_ORDER.map((status) => {
                  const group = projectTasks.filter((t) => t.status === status);
                  if (group.length === 0) return null;
                  return (
                    <div key={status} className="p-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-2 py-1">
                        {status}
                      </h3>
                      <ul>
                        {group.map((tk) => (
                          <li
                            key={tk.id}
                            className="flex items-center gap-3 px-2 py-1.5 hover:bg-muted/30 rounded cursor-pointer text-sm"
                            onClick={() => setOpenTaskId(tk.id)}
                          >
                            <span className="font-mono text-[10px] text-muted-foreground w-14">{tk.key}</span>
                            <span className="flex-1 truncate">{tk.title}</span>
                            {tk.estimate_hours != null && (
                              <span className="text-xs font-mono tabular-nums text-muted-foreground">{tk.estimate_hours}h</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {openTaskId && (
        <TaskPanel
          taskId={openTaskId}
          statuses={statuses}
          resources={resources}
          canEdit
          canLog
          onClose={() => setOpenTaskId(null)}
          onSaved={fetchAll}
        />
      )}
    </div>
  );
}
