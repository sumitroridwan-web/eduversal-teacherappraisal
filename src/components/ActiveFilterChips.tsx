import React from 'react';
import { X } from 'lucide-react';

export interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

interface ActiveFilterChipsProps {
  chips: FilterChip[];
  onClearAll: () => void;
  /** e.g. "Showing 12 of 40 observations" */
  summary?: string;
  className?: string;
}

/** The filters in force, each removable, with one control to clear them all. */
export const ActiveFilterChips: React.FC<ActiveFilterChipsProps> = ({ chips, onClearAll, summary, className = '' }) => (
  <div className={`flex flex-wrap items-center gap-2 ${className}`}>
    {summary && <span className="text-sm font-semibold text-slate-700 mr-1">{summary}</span>}
    {chips.length === 0 ? (
      <span className="text-sm text-slate-500">No filters applied</span>
    ) : (
      <>
        {chips.map((chip) => (
          <span
            key={chip.key}
            className="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-semibold"
          >
            {chip.label}
            <button
              type="button"
              onClick={chip.onRemove}
              aria-label={`Remove filter ${chip.label}`}
              className="p-0.5 rounded-full hover:bg-indigo-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline underline-offset-2 cursor-pointer"
        >
          Clear all
        </button>
      </>
    )}
  </div>
);
