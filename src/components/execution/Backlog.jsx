/**
 * Backlog view: flat, grouped-by-epic list with inline quick-add for
 * epics, stories, and tasks. This is the "everything in one place" view —
 * the Board has the Kanban semantics, Backlog has the hierarchy.
 *
 * Roadmap visibility: each epic and story shows an aggregated progress pill
 * (rollupProgress, 0/50/100 by task status). Epics carry an inline editor to
 * rename them AND link them to a project phase (epic_phases) — the link that
 * drives phase-level EVM attribution. Stories/tasks inherit the phase via
 * their epic.
 *
 * Data: fetches epics → stories → tasks in three round-trips. For an MVP
 * with at most a few hundred tasks per project this is fine; if the page
 * gets slow we can consolidate into a single /backlog endpoint later.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, Plus, Wand2, Pencil, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { useLocale } from '../../lib/i18n';
import { executionApi } from '../../lib/executionApi';
import { rollupProgress } from '../../lib/backlogProgress';

export default function Backlog({ projectId, statuses, phases = [], canEdit, onOpenTask }) {
  const { t } = useLocale();
  const [tree, setTree] = useState([]); // [{ epic, stories: [{ story, tasks: [] }] }]
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState({});
  // Epic inline editor (rename + link to a phase).
  const [editingEpicId, setEditingEpicId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPhaseId, setEditPhaseId] = useState('');
  const defaultStatus = statuses[0]?.name || 'To Do';

  // Carte statut → catégorie pour l'avancement agrégé (pastilles).
  const categoryByStatus = {};
  for (const s of statuses) categoryByStatus[s.name] = s.category;
  const phaseName = (id) => phases.find((p) => p.id === id)?.name;

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const epics = await executionApi.listEpics(projectId);
      const withChildren = await Promise.all(epics.map(async (ep) => {
        const stories = await executionApi.listStories(ep.id);
        const withTasks = await Promise.all(stories.map(async (s) => {
          // No per-story task endpoint; use the project tasks + filter client-side.
          const allTasks = await executionApi.listTasks(projectId);
          return { story: s, tasks: allTasks.filter((t) => t.story_id === s.id) };
        }));
        return { epic: ep, stories: withTasks };
      }));
      setTree(withChildren);
    } catch (err) {
      console.error('Load backlog failed:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function toggle(key) { setCollapsed((c) => ({ ...c, [key]: !c[key] })); }

  async function addEpic() {
    const title = window.prompt(t('work.newEpicPrompt'));
    if (!title) return;
    await executionApi.createEpic(projectId, { title, status: defaultStatus });
    fetchAll();
  }
  async function addStory(epicId) {
    const title = window.prompt(t('work.newStoryPrompt'));
    if (!title) return;
    await executionApi.createStory(epicId, { title, status: defaultStatus });
    fetchAll();
  }
  async function addTask(storyId) {
    const title = window.prompt(t('work.newTaskPrompt'));
    if (!title) return;
    await executionApi.createTask(storyId, { title, status: defaultStatus });
    fetchAll();
  }

  function openEpicEditor(epic) {
    setEditingEpicId(epic.id);
    setEditTitle(epic.title);
    setEditPhaseId(epic.phase_ids?.[0] || '');
  }
  async function saveEpic(epic) {
    const title = editTitle.trim();
    if (!title) return;
    await executionApi.updateEpic(epic.id, {
      title,
      phase_ids: editPhaseId ? [editPhaseId] : [],
    });
    setEditingEpicId(null);
    fetchAll();
  }
  async function deleteEpic(epic) {
    if (!window.confirm(t('work.deleteEpicConfirm', { title: epic.title }))) return;
    await executionApi.removeEpic(epic.id);
    fetchAll();
  }
  async function renameStory(story) {
    const title = window.prompt(t('work.renameStoryPrompt'), story.title);
    if (title == null) return; // annulé
    const trimmed = title.trim();
    if (!trimmed || trimmed === story.title) return;
    await executionApi.updateStory(story.id, { title: trimmed });
    fetchAll();
  }
  async function deleteStory(story) {
    if (!window.confirm(t('work.deleteStoryConfirm', { title: story.title }))) return;
    await executionApi.removeStory(story.id);
    fetchAll();
  }

  async function syncFromPlan() {
    if (!window.confirm(t('work.syncConfirm'))) return;
    try {
      const r = await executionApi.syncFromPlan(projectId);
      // Quick feedback: alert with the count, then refetch. A proper toast
      // system would be nicer but keeps PR scope tight (V2 polish).
      alert(t('work.syncResult', { epics: r.epicsCreated, stories: r.storiesCreated }));
      await fetchAll();
    } catch (err) {
      console.error('Sync from plan failed:', err);
      alert(t('work.syncFailed'));
    }
  }

  /** Pastille d'avancement agrégé (null si aucune tâche). */
  function ProgressPill({ tasks }) {
    const { pct, total } = rollupProgress(tasks, categoryByStatus);
    if (total === 0) return null;
    return (
      <span
        className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground whitespace-nowrap tabular-nums shrink-0"
        title={t('work.progressTitle', { pct: Math.round(pct * 100), total })}
      >
        {Math.round(pct * 100)} %
      </span>
    );
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={addEpic} size="sm" className="flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            {t('work.newEpic')}
          </Button>
          <Button onClick={syncFromPlan} variant="outline" size="sm" className="flex items-center gap-1.5" title={t('work.syncTitle')}>
            <Wand2 className="w-3.5 h-3.5" />
            {t('work.syncFromPlan')}
          </Button>
        </div>
      )}

      {loading && <p className="text-xs text-muted-foreground">{t('work.loading')}</p>}

      {tree.map(({ epic, stories }) => {
        const epicKey = `e-${epic.id}`;
        const isCollapsed = collapsed[epicKey];
        const epicTasks = stories.flatMap((s) => s.tasks);
        const isEditing = editingEpicId === epic.id;
        return (
          <section key={epic.id} className="border border-border rounded-lg bg-card">
            <header className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <button
                type="button"
                className="flex items-center gap-2 text-left flex-1 min-w-0"
                onClick={() => toggle(epicKey)}
              >
                {isCollapsed ? <ChevronRight className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
                <span className="font-mono text-xs text-muted-foreground shrink-0">{epic.key}</span>
                <span className="font-semibold truncate">{epic.title}</span>
              </button>
              {epic.phase_ids?.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary whitespace-nowrap shrink-0">
                  {epic.phase_ids.map(phaseName).filter(Boolean).join(', ')}
                </span>
              )}
              <ProgressPill tasks={epicTasks} />
              {canEdit && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => addStory(epic.id)} title={t('work.newStory')}>
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openEpicEditor(epic)} title={t('work.editEpic')}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteEpic(epic)} title={t('work.deleteEpic')}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </header>

            {isEditing && canEdit && (
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border bg-muted/20">
                <input
                  className="flex-1 min-w-[140px] text-sm border border-border rounded px-2 py-1 bg-background"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder={t('work.epicTitle')}
                  aria-label={t('work.epicTitle')}
                />
                <label className="text-xs text-muted-foreground">{t('work.epicPhase')}</label>
                <select
                  className="text-sm border border-border rounded px-2 py-1 bg-background"
                  value={editPhaseId}
                  onChange={(e) => setEditPhaseId(e.target.value)}
                  aria-label={t('work.epicPhase')}
                >
                  <option value="">{t('work.epicPhaseNone')}</option>
                  {phases.map((ph) => (
                    <option key={ph.id} value={ph.id}>{ph.name}</option>
                  ))}
                </select>
                <Button size="sm" onClick={() => saveEpic(epic)}>{t('work.save')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingEpicId(null)}>{t('work.cancel')}</Button>
              </div>
            )}

            {!isCollapsed && (
              <div className="p-3 space-y-3">
                {stories.length === 0 && <p className="text-xs text-muted-foreground italic">{t('work.emptyEpic')}</p>}
                {stories.map(({ story, tasks }) => {
                  const storyKey = `s-${story.id}`;
                  const sCollapsed = collapsed[storyKey];
                  return (
                    <div key={story.id} className="border border-border rounded">
                      <header className="flex items-center gap-2 px-2 py-1.5 bg-muted/30">
                        <button
                          type="button"
                          className="flex items-center gap-2 text-left flex-1 min-w-0"
                          onClick={() => toggle(storyKey)}
                        >
                          {sCollapsed ? <ChevronRight className="w-3.5 h-3.5 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0" />}
                          <span className="font-mono text-[10px] text-muted-foreground shrink-0">{story.key}</span>
                          <span className="text-sm truncate">{story.title}</span>
                        </button>
                        <ProgressPill tasks={tasks} />
                        {canEdit && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => addTask(story.id)}
                              className="text-muted-foreground hover:text-foreground p-1"
                              title={t('work.newTask')}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => renameStory(story)}
                              className="text-muted-foreground hover:text-foreground p-1"
                              title={t('work.renameStory')}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteStory(story)}
                              className="text-muted-foreground hover:text-foreground p-1"
                              title={t('work.deleteStory')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </header>
                      {!sCollapsed && (
                        <ul className="divide-y divide-border">
                          {tasks.length === 0 && (
                            <li className="p-2 text-xs text-muted-foreground italic">{t('work.emptyStory')}</li>
                          )}
                          {tasks.map((tk) => (
                            <li
                              key={tk.id}
                              className="flex items-center gap-3 p-2 hover:bg-muted/30 cursor-pointer"
                              onClick={() => onOpenTask?.(tk.id)}
                            >
                              <span className="font-mono text-[10px] text-muted-foreground w-14">{tk.key}</span>
                              <span className="text-sm flex-1 truncate">{tk.title}</span>
                              <span className="text-xs text-muted-foreground">{tk.status}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {!loading && tree.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('work.emptyBacklog')}</p>
      )}
    </div>
  );
}
