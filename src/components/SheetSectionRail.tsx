import React from 'react';
import { Check, ArrowDownToLine } from 'lucide-react';
import type { SheetStep, SheetStepKey, SheetStepState } from '../services/observationSheet';

interface SheetSectionRailProps {
  steps: SheetStep[];
  /** The section on screen now, highlighted in the list. */
  activeKey: SheetStepKey | null;
  onNavigate: (key: SheetStepKey) => void;
  /** Live result, so the score never needs a scroll to find. */
  score: {
    provisional: boolean;
    grade: string;
    percentage: number;
    rated: number;
    total: number;
    needed: number;
    meetsFloor: boolean;
  };
  unratedCount: number;
  onNextUnrated: () => void;
}

const GRADE_TONE: Record<string, string> = {
  A: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  B: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  C: 'bg-amber-50 text-amber-700 border-amber-200',
  D: 'bg-orange-50 text-orange-700 border-orange-200',
  F: 'bg-rose-50 text-rose-700 border-rose-200',
};

function StateDot({ state, index }: { state: SheetStepState; index?: number }) {
  if (state === 'done') {
    return (
      <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0" aria-label="Complete">
        <Check className="w-3.5 h-3.5" strokeWidth={3} />
      </span>
    );
  }
  return (
    <span
      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[11px] font-bold shrink-0 ${
        state === 'partial' ? 'border-amber-500 text-amber-700 bg-amber-50' : 'border-slate-300 text-slate-500 bg-white'
      }`}
      aria-label={state === 'partial' ? 'In progress' : 'Not started'}
    >
      {index ?? ''}
    </span>
  );
}

function SubDot({ state }: { state: SheetStepState }) {
  return (
    <span
      className={`w-2 h-2 rounded-full shrink-0 ${
        state === 'done' ? 'bg-emerald-500' : state === 'partial' ? 'bg-amber-500' : 'bg-slate-300'
      }`}
    />
  );
}

/**
 * The list of the sheet's parts, each with how far it has got. Clicking one
 * takes the appraiser there, switching between capture and rating if needed.
 */
export const SheetSectionRail: React.FC<SheetSectionRailProps> = ({
  steps,
  activeKey,
  onNavigate,
  score,
  unratedCount,
  onNextUnrated,
}) => {
  const isActive = (key: SheetStepKey) => activeKey === key;
  const parentActive = (step: SheetStep) =>
    isActive(step.key) || Boolean(step.children?.some((c) => isActive(c.key)));

  return (
    <div className="space-y-3">
      {/* Live result */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              {score.provisional ? 'Provisional' : 'Indicative grade'}
            </div>
            <div className="text-2xl font-extrabold font-mono text-slate-900 leading-tight">
              {score.rated ? `${score.percentage}%` : '—'}
            </div>
          </div>
          <div
            className={`w-12 h-12 rounded-xl border flex items-center justify-center font-black shrink-0 ${
              score.provisional
                ? 'bg-slate-50 text-slate-400 border-slate-200 text-[10px] uppercase'
                : `${GRADE_TONE[score.grade] || GRADE_TONE.F} text-2xl`
            }`}
          >
            {score.provisional ? 'N/A' : score.grade}
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
            <span className="font-semibold tabular-nums">
              {score.rated}/{score.total} rated
            </span>
            <span className={score.meetsFloor ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
              {score.meetsFloor ? 'Grade publishes' : `${score.needed} needed`}
            </span>
          </div>
          <div className="relative h-2 bg-slate-100 rounded-full">
            <div
              className={`h-full rounded-full transition-all ${score.meetsFloor ? 'bg-emerald-600' : 'bg-indigo-600'}`}
              style={{ width: `${score.total ? (score.rated / score.total) * 100 : 0}%` }}
            />
            <div
              className="absolute -top-1 -bottom-1 w-0.5 bg-slate-500/70 rounded-full"
              style={{ left: `${score.total ? (score.needed / score.total) * 100 : 0}%` }}
              title={`${score.needed} ratings needed for a grade`}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={onNextUnrated}
          disabled={unratedCount === 0}
          className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed transition cursor-pointer"
        >
          <ArrowDownToLine className="w-4 h-4" />
          {unratedCount ? `Next unrated (${unratedCount} left)` : 'Every indicator rated'}
        </button>
      </div>

      {/* Sections */}
      <nav aria-label="Observation sheet sections" className="bg-white border border-slate-200 rounded-2xl p-2 shadow-sm">
        <ol className="space-y-0.5">
          {steps.map((step, i) => (
            <li key={step.key}>
              <button
                type="button"
                onClick={() => onNavigate(step.key)}
                aria-current={parentActive(step) ? 'step' : undefined}
                className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-xl text-left transition cursor-pointer ${
                  parentActive(step) ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-slate-50'
                }`}
              >
                <StateDot state={step.state} index={i + 1} />
                <span className="min-w-0">
                  <span className={`block text-sm font-bold ${parentActive(step) ? 'text-indigo-800' : 'text-slate-900'}`}>
                    {step.label}
                  </span>
                  <span className="block text-xs text-slate-500 leading-snug">{step.summary}</span>
                </span>
              </button>

              {step.children && (
                <ul className="ml-[1.4rem] pl-3 border-l border-slate-200 my-0.5 space-y-0.5">
                  {step.children.map((child) => (
                    <li key={child.key}>
                      <button
                        type="button"
                        onClick={() => onNavigate(child.key)}
                        aria-current={isActive(child.key) ? 'location' : undefined}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition cursor-pointer ${
                          isActive(child.key) ? 'bg-indigo-50 text-indigo-800' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <SubDot state={child.state} />
                        <span className="text-xs font-semibold flex-1 min-w-0 truncate">{child.label}</span>
                        <span className="text-[11px] text-slate-500 tabular-nums shrink-0">{child.summary}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
};
