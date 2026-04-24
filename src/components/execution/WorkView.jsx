/**
 * Parent component for the Work tab — owns the sub-tab state (board /
 * backlog / timesheet), fetches the shared data needed by all views
 * (statuses + resources + the caller's own linked resource), and owns the
 * TaskPanel open/close state so every view can surface a clicked task
 * through the same panel.
 *
 * URL syntax: #/projects/:id/work/:subtab — subtab defaults to 'board'.
 * Direct navigation from any other tab reloads this view, which is why
 * the sub-tab stays in the hash rather than in local state only.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { LayoutGrid, List, Calendar } from 'lucide-react';
import { useLocale } from '../../lib/i18n';
import { useHashRouter } from '../../lib/useHashRouter';
import { capacityApi } from '../../lib/capacityApi';
import { executionApi } from '../../lib/executionApi';
import Board from './Board';
import Backlog from './Backlog';
import Timesheet from './Timesheet';
import TaskPanel from './TaskPanel';

export default function WorkView({ project }) {
  const { t } = useLocale();
  const { segments, navigate } = useHashRouter();
  const subtab = segments[3] || 'board';
  const [statuses, setStatuses] = useState([]);
  const [resources, setResources] = useState([]);
  const [me, setMe] = useState(null); // { id, email, name, linked_resource_id }
  const [openTaskId, setOpenTaskId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Load pool + share candidates. The status CRUD API has not shipped yet
  // (it will in a follow-up PR); seeds defaults locally so Board is usable
  // today. Every project already has these 3 rows in project_statuses via
  // the seedDefaultStatuses boot migration from PR 1.
  useEffect(() => {
    (async () => {
      try {
        const [res, cands] = await Promise.all([
          capacityApi.getResources(),
          capacityApi.getShareCandidates(),
        ]);
        setStatuses([
          { name: 'To Do', category: 'todo' },
          { name: 'In Progress', category: 'inprogress' },
          { name: 'Done', category: 'done' },
        ]);
        setResources(res);
        // Find the caller's own linked resource (if any) via the share-candidates
        // endpoint, which returns it already tagged. Used by Timesheet to filter
        // its default row set.
        setMe(cands.find((c) => c.linked_resource_id != null) || cands[0] || null);
      } catch (err) {
        console.error('Work load shared data failed:', err);
      }
    })();
  }, [project.id]);

  const canEdit = project.role === 'owner' || project.role === 'editor';
  const canLog = canEdit; // Editors can log on their own tasks; owners on anything.

  const setSubtab = useCallback((sub) => {
    navigate(`projects/${project.id}/work/${sub}`);
  }, [navigate, project.id]);

  const TABS = [
    { id: 'board', label: t('work.tabBoard'), icon: LayoutGrid },
    { id: 'backlog', label: t('work.tabBacklog'), icon: List },
    { id: 'timesheet', label: t('work.tabTimesheet'), icon: Calendar },
  ];

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = subtab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSubtab(tab.id)}
              className={`px-3 py-2 text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap border-b-2 ${
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {subtab === 'board' && (
        <Board
          key={reloadKey}
          projectId={project.id}
          statuses={statuses}
          resources={resources}
          canEdit={canEdit}
          canLog={canLog}
          onOpenTask={setOpenTaskId}
        />
      )}
      {subtab === 'backlog' && (
        <Backlog
          key={reloadKey}
          projectId={project.id}
          statuses={statuses}
          canEdit={canEdit}
          onOpenTask={setOpenTaskId}
        />
      )}
      {subtab === 'timesheet' && (
        <Timesheet
          key={reloadKey}
          projectId={project.id}
          resources={resources}
          userLinkedResourceId={me?.linked_resource_id ?? null}
          canEdit={canEdit}
          onOpenTask={setOpenTaskId}
        />
      )}

      {openTaskId && (
        <TaskPanel
          taskId={openTaskId}
          statuses={statuses}
          resources={resources}
          canEdit={canEdit}
          canLog={canLog}
          onClose={() => setOpenTaskId(null)}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
