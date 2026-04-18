/**
 * Atomic Gantt bar rendered inside a CSS grid row. Position and width are
 * expressed as grid column spans rather than pixel offsets so the chart
 * scales responsively with the container width. Consultant bars render with a
 * subtle ring and pointer cursor to indicate they are clickable (QuickTransition).
 */
import React from 'react';

/**
 * @param {Object} props
 * @param {string} props.color - CSS colour string for the bar background.
 * @param {number} props.allocation - Allocation percentage shown as a label (0-100).
 * @param {string} props.label - Resource or phase name displayed inside the bar.
 * @param {number} props.colSpan - Number of grid columns the bar occupies (= months).
 * @param {number} props.colStart - 1-based grid column where the bar starts.
 * @param {boolean} props.isConsultant - If true, bar is clickable and shows the
 *   QuickTransition ring style.
 * @param {function(): void} [props.onClick] - Handler for QuickTransition popover;
 *   only wired when isConsultant is true.
 */
const GanttBar = ({ color, allocation, label, colSpan, colStart, isConsultant, onClick }) => {
  return (
    <div
      className={`rounded px-2 py-1 text-white text-xs font-medium truncate flex items-center gap-1 min-h-[28px] ${
        isConsultant ? 'cursor-pointer ring-1 ring-white/40' : ''
      }`}
      style={{
        gridColumn: `${colStart} / span ${colSpan}`,
        backgroundColor: color,
      }}
      onClick={isConsultant ? onClick : undefined}
      title={`${label} — ${allocation}%`}
    >
      <span className="truncate">{label}</span>
      <span className="ml-auto shrink-0">{allocation}%</span>
    </div>
  );
};

export default GanttBar;
