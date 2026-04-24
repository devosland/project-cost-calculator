/**
 * Visual card used in Board (as drag source) and Backlog (as row). Pure
 * render — no data fetching, no state.
 *
 * The `dragging` prop is for the DragOverlay rendering: same styling but
 * with a shadow so the floating card stands out while being moved.
 */
import React from 'react';

const PRIORITY_COLOR = {
  low: 'var(--prism-muted)',
  medium: 'var(--prism-primary)',
  high: 'var(--prism-warning)',
  critical: 'var(--prism-destructive)',
};

export default function TaskCard({ task, onClick, dragging }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left bg-card border border-border rounded-md p-2.5 text-sm transition-colors hover:bg-muted/40 ${
        dragging ? 'shadow-lg cursor-grabbing' : 'cursor-grab'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="font-mono text-[10px] text-muted-foreground">{task.key}</span>
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: PRIORITY_COLOR[task.priority] || PRIORITY_COLOR.medium }}
          aria-label={`priority ${task.priority}`}
        />
      </div>
      <div className="font-medium leading-snug">{task.title}</div>
      {task.estimate_hours != null && (
        <div className="text-[11px] text-muted-foreground mt-1 font-mono tabular-nums">
          {task.estimate_hours}h
        </div>
      )}
    </button>
  );
}
