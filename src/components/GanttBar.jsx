import React from 'react';

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
