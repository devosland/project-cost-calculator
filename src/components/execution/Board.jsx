/**
 * Kanban board for the Work tab. Columns come from `project_statuses`;
 * tasks are drag-and-droppable between them via @dnd-kit.
 *
 * On drop, we call /tasks/:id/transition with optimistic UI: the card
 * moves immediately, and we rollback + re-fetch if the server rejects the
 * move (e.g. when a workflow restricts transitions via project_transitions).
 *
 * Filters: status is implicit (the column), so we expose assignee only.
 * Keeping filter controls minimal keeps PR 6 focused on the MVP; richer
 * filtering lands in V2.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable, closestCenter,
} from '@dnd-kit/core';
import { useLocale } from '../../lib/i18n';
import { executionApi } from '../../lib/executionApi';
import TaskCard from './TaskCard';

export default function Board({ projectId, statuses, resources, canEdit, canLog, onOpenTask }) {
  const { t } = useLocale();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [activeTask, setActiveTask] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      const filters = {};
      if (assigneeFilter === 'unassigned') filters.assignee = 'unassigned';
      else if (assigneeFilter) filters.assignee = Number(assigneeFilter);
      const data = await executionApi.listTasks(projectId, filters);
      setTasks(data);
    } catch (err) {
      console.error('Load tasks failed:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, assigneeFilter]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  function tasksByStatus(name) {
    return tasks.filter((t) => t.status === name);
  }

  async function handleDragEnd(ev) {
    setActiveTask(null);
    if (!ev.over || !canEdit) return;
    const taskId = Number(ev.active.id);
    const toStatus = String(ev.over.id);
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === toStatus) return;

    // Optimistic update.
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: toStatus } : t)));
    try {
      await executionApi.transitionTask(taskId, toStatus);
    } catch (err) {
      console.error('Transition failed:', err);
      fetchTasks(); // rollback via refetch
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-xs text-muted-foreground">{t('work.filterAssignee')}</label>
        <select
          className="input-field text-sm"
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
        >
          <option value="">{t('work.allAssignees')}</option>
          <option value="unassigned">{t('work.unassigned')}</option>
          {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(ev) => setActiveTask(tasks.find((t) => t.id === Number(ev.active.id)))}
        onDragCancel={() => setActiveTask(null)}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-2">
          {statuses.map((s) => (
            <Column key={s.name} status={s} tasks={tasksByStatus(s.name)} onOpenTask={onOpenTask} canEdit={canEdit} />
          ))}
        </div>
        <DragOverlay>
          {activeTask ? <TaskCard task={activeTask} dragging /> : null}
        </DragOverlay>
      </DndContext>

      {loading && <p className="text-xs text-muted-foreground">{t('work.loading')}</p>}
      {!loading && tasks.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('work.emptyBoard')}</p>
      )}
    </div>
  );
}

function Column({ status, tasks, onOpenTask, canEdit }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.name });
  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-72 rounded-lg border border-border bg-muted/30 p-2 transition-colors ${
        isOver ? 'bg-muted/60' : ''
      }`}
    >
      <header className="flex items-center justify-between px-1 py-1 mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{status.name}</h3>
        <span className="text-xs font-mono tabular-nums text-muted-foreground">{tasks.length}</span>
      </header>
      <div className="space-y-2">
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} onOpenTask={onOpenTask} canEdit={canEdit} />
        ))}
      </div>
    </div>
  );
}

function DraggableCard({ task, onOpenTask, canEdit }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: String(task.id), disabled: !canEdit,
  });
  const style = { opacity: isDragging ? 0.3 : 1 };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} onClick={() => onOpenTask?.(task.id)} />
    </div>
  );
}
