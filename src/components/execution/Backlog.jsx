/**
 * Backlog view: flat, grouped-by-epic list with inline quick-add for
 * epics, stories, and tasks. This is the "everything in one place" view —
 * the Board has the Kanban semantics, Backlog has the hierarchy.
 *
 * Data: fetches epics → stories → tasks in three round-trips. For an MVP
 * with at most a few hundred tasks per project this is fine; if the page
 * gets slow we can consolidate into a single /backlog endpoint later.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, Plus, Wand2 } from 'lucide-react';
import { Button } from '../ui/button';
import { useLocale } from '../../lib/i18n';
import { executionApi } from '../../lib/executionApi';

export default function Backlog({ projectId, statuses, canEdit, onOpenTask }) {
  const { t } = useLocale();
  const [tree, setTree] = useState([]); // [{ epic, stories: [{ story, tasks: [] }] }]
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState({});
  const defaultStatus = statuses[0]?.name || 'To Do';

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
        return (
          <section key={epic.id} className="border border-border rounded-lg bg-card">
            <header className="flex items-center justify-between px-3 py-2 border-b border-border">
              <button
                type="button"
                className="flex items-center gap-2 text-left flex-1 min-w-0"
                onClick={() => toggle(epicKey)}
              >
                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                <span className="font-mono text-xs text-muted-foreground">{epic.key}</span>
                <span className="font-semibold truncate">{epic.title}</span>
              </button>
              {canEdit && (
                <Button variant="ghost" size="sm" onClick={() => addStory(epic.id)} title={t('work.newStory')}>
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              )}
            </header>

            {!isCollapsed && (
              <div className="p-3 space-y-3">
                {stories.length === 0 && <p className="text-xs text-muted-foreground italic">{t('work.emptyEpic')}</p>}
                {stories.map(({ story, tasks }) => {
                  const storyKey = `s-${story.id}`;
                  const sCollapsed = collapsed[storyKey];
                  return (
                    <div key={story.id} className="border border-border rounded">
                      <header className="flex items-center justify-between px-2 py-1.5 bg-muted/30">
                        <button
                          type="button"
                          className="flex items-center gap-2 text-left flex-1 min-w-0"
                          onClick={() => toggle(storyKey)}
                        >
                          {sCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          <span className="font-mono text-[10px] text-muted-foreground">{story.key}</span>
                          <span className="text-sm truncate">{story.title}</span>
                        </button>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => addTask(story.id)}
                            className="text-muted-foreground hover:text-foreground p-1"
                            title={t('work.newTask')}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
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
