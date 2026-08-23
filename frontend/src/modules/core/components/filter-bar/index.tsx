import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface FilterOption {
  label: string;
  value: string;
  count?: number;
}

interface Props {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  onClear: () => void;
}

export default function FilterBar({ label, options, selected, onChange, onClear }: Props) {
  const [open, setOpen] = useState(false);

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
  };

  if (options.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            selected.length > 0
              ? 'border-tp-primary/30 bg-tp-primary/5 text-tp-primary'
              : 'border-tp-hairline-strong bg-tp-canvas text-tp-slate hover:border-tp-hairline'
          }`}
        >
          {label}
          {selected.length > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-tp-primary text-[9px] text-tp-on-primary">
              {selected.length}
            </span>
          )}
          <svg className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-tp-hairline bg-tp-canvas py-1 shadow-elevation-4"
            >
              <div className="max-h-48 overflow-y-auto">
                {options.map(option => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-tp-surface"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(option.value)}
                      onChange={() => toggle(option.value)}
                      className="h-3.5 w-3.5 rounded border-tp-hairline-strong text-tp-primary focus:ring-tp-primary"
                    />
                    <span className="flex-1 truncate text-tp-slate">{option.label}</span>
                    {option.count !== undefined && (
                      <span className="text-[10px] text-tp-muted">{option.count}</span>
                    )}
                  </label>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {selected.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-tp-muted transition-colors hover:text-red-500"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Clear
        </button>
      )}
    </div>
  );
}
