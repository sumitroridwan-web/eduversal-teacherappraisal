import React from 'react';
import type { LucideIcon } from 'lucide-react';

export type StatTone = 'indigo' | 'emerald' | 'teal' | 'amber' | 'rose' | 'slate';

const TONES: Record<StatTone, { box: string; icon: string; value: string }> = {
  indigo: { box: 'bg-indigo-50/60 border-indigo-200', icon: 'bg-indigo-100 text-indigo-700', value: 'text-indigo-700' },
  emerald: { box: 'bg-emerald-50/60 border-emerald-200', icon: 'bg-emerald-100 text-emerald-700', value: 'text-emerald-700' },
  teal: { box: 'bg-teal-50/60 border-teal-200', icon: 'bg-teal-100 text-teal-800', value: 'text-[#165963]' },
  amber: { box: 'bg-amber-50/60 border-amber-200', icon: 'bg-amber-100 text-amber-700', value: 'text-amber-700' },
  rose: { box: 'bg-rose-50/60 border-rose-200', icon: 'bg-rose-100 text-rose-700', value: 'text-rose-700' },
  slate: { box: 'bg-white border-slate-200', icon: 'bg-slate-100 text-slate-600', value: 'text-slate-900' },
};

interface StatBoxProps {
  tone: StatTone;
  label: string;
  value: React.ReactNode;
  detail?: string;
  icon?: LucideIcon;
  /** 'lg' for a page's headline figures, 'md' inside a document or a dense strip. */
  size?: 'lg' | 'md';
  title?: string;
}

/**
 * The one box used for a headline figure anywhere in the platform: a label,
 * a large value and a line saying what it means. The same tone means the same
 * thing on every screen.
 */
export const StatBox: React.FC<StatBoxProps> = ({ tone, label, value, detail, icon: Icon, size = 'lg', title }) => {
  const t = TONES[tone];
  return (
    <div
      className={`rounded-2xl border shadow-sm flex flex-col min-w-0 ${t.box} ${size === 'lg' ? 'p-5 gap-2' : 'p-4 gap-1'}`}
      title={title}
    >
      <div className="flex items-center gap-2.5">
        {Icon && (
          <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${t.icon}`}>
            <Icon className="w-5 h-5" />
          </span>
        )}
        <span className="text-sm font-bold text-slate-700 uppercase tracking-wide">{label}</span>
      </div>
      <div
        className={`font-extrabold font-mono leading-none tracking-tight ${t.value} ${
          size === 'lg' ? 'text-5xl' : 'text-3xl sm:text-4xl mt-1'
        }`}
      >
        {value}
      </div>
      {detail && <p className="text-sm text-slate-600 leading-snug">{detail}</p>}
    </div>
  );
};
