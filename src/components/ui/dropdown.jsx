import React, { useState, useRef, useEffect } from 'react';
import { cn } from '../../lib/utils';
import { ChevronDown } from 'lucide-react';

const Dropdown = ({ value, options, onChange, className }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={cn('relative inline-block', className)}>
      <button
        type="button"
        className="input-field flex items-center gap-2 pr-8 cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        {selected?.label || value}
        <ChevronDown className={`w-3.5 h-3.5 absolute right-2.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-50 min-w-full py-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={cn(
                'w-full text-left px-3 py-1.5 text-sm transition-colors hover:bg-secondary',
                opt.value === value && 'bg-primary text-primary-foreground hover:bg-primary/90'
              )}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export { Dropdown };
