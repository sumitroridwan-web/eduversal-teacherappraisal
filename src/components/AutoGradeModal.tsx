import React, { useState } from 'react';
import {
  Sparkles,
  X,
  Check,
  CheckCircle2,
  AlertTriangle,
  Award,
  Layers,
  FileText,
  ChevronRight,
  TrendingUp,
  Sliders,
  HelpCircle,
} from 'lucide-react';
import { AutoGradeResult, CareerLevel } from '../types';
import { EduversalLogo } from './EduversalLogo';

interface AutoGradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  result: AutoGradeResult | null;
  careerLevel: CareerLevel;
  onApplyAll: (
    scores: Record<string, { score: 1 | 2 | 3 | 4 | null; notes: string }>,
    glowGrowGo?: { glow: string[]; grow: string[]; go: string[] }
  ) => void;
}

export const AutoGradeModal: React.FC<AutoGradeModalProps> = ({
  isOpen,
  onClose,
  isLoading,
  result,
  careerLevel,
  onApplyAll,
}) => {
  const [selectedTab, setSelectedTab] = useState<'scores' | 'feedback' | 'summary'>('scores');
  // Allow user to toggle / modify scores before applying
  const [customScores, setCustomScores] = useState<Record<string, { score: 1 | 2 | 3 | 4 | null; rationale: string }>>({});
  const [includeGlowGrowGo, setIncludeGlowGrowGo] = useState(true);

  // Sync result to local editable state
  React.useEffect(() => {
    if (result && result.scores) {
      const initial: Record<string, { score: 1 | 2 | 3 | 4 | null; rationale: string }> = {};
      result.scores.forEach((s) => {
        initial[s.indicatorCode] = { score: s.score, rationale: s.rationale };
      });
      setCustomScores(initial);
    }
  }, [result]);

  if (!isOpen) return null;

  const handleScoreChange = (indicatorCode: string, newScore: 1 | 2 | 3 | 4 | null) => {
    setCustomScores((prev) => ({
      ...prev,
      [indicatorCode]: {
        ...prev[indicatorCode],
        score: newScore,
      },
    }));
  };

  const handleApplyClick = () => {
    if (!result) return;
    const formattedScores: Record<string, { score: 1 | 2 | 3 | 4 | null; notes: string }> = {};

    Object.entries(customScores).forEach(
      ([code, data]: [string, { score: 1 | 2 | 3 | 4 | null; rationale: string }]) => {
        // Not-observable indicators are left unscored; the rationale is still
        // written through so the gap is recorded on the sheet.
        formattedScores[code] = {
          score: data.score,
          notes: `[Auto-Graded] ${data.rationale}`,
        };
      }
    );

    const feedback = includeGlowGrowGo
      ? {
          glow: result.glow,
          grow: result.grow,
          go: result.go,
        }
      : undefined;

    onApplyAll(formattedScores, feedback);
    onClose();
  };

  // Recalculate live total from customScores
  const currentScoresList: Array<{ score: 1 | 2 | 3 | 4 | null; rationale: string }> = Object.values(customScores);
  const currentTotal: number = currentScoresList.reduce((acc: number, curr) => acc + (curr.score || 0), 0);
  const ratedCount = currentScoresList.filter((s) => typeof s.score === 'number').length;
  const notObservableCount = currentScoresList.length - ratedCount;
  const maxPossible = ratedCount * 4;
  const currentPercentage = maxPossible > 0 ? Math.round((currentTotal / maxPossible) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white border border-slate-200 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto text-slate-800 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3 min-w-0">
            <EduversalLogo variant="icon" size={36} className="shrink-0" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="text-base font-bold text-slate-900">
                  AI Auto-Grading &amp; Performance Evaluation
                </h3>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center gap-1 shrink-0">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  Eduversal F2 Engine
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Automated rubric evaluation synthesized from recorded lesson activities, teacher actions, student evidence, and observer notes.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 shrink-0 rounded-full hover:bg-slate-200/70 flex items-center justify-center text-slate-500 hover:text-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="p-12 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mx-auto animate-pulse">
              <Sparkles className="w-7 h-7 text-amber-500 animate-spin" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900">
                Analyzing Lesson Activities &amp; Rubrics...
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Evaluating cognitive rigor, classroom management protocols, Bloom&apos;s questioning, CALP vocabulary, and student evidence against {careerLevel} benchmark rubrics.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <span className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce" />
              <span className="w-2 h-2 rounded-full bg-teal-600 animate-bounce [animation-delay:0.2s]" />
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-bounce [animation-delay:0.4s]" />
            </div>
          </div>
        ) : !result ? (
          <div className="p-8 text-center text-slate-500">
            <p>No auto-grading evaluation available yet.</p>
          </div>
        ) : (
          <>
            {/* KPI Banner */}
            <div className="bg-gradient-to-r from-indigo-50/80 via-teal-50/40 to-slate-50 border-b border-slate-200 p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white/90 p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[11px] text-slate-500 font-medium block">Indicative Grade</span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-2xl font-black text-indigo-700">Grade {result.grade}</span>
                    <span className="text-xs text-emerald-600 font-bold">({currentPercentage}%)</span>
                  </div>
                </div>

                <div className="bg-white/90 p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[11px] text-slate-500 font-medium block">Auto-Score Total</span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-xl font-bold font-mono text-slate-900">
                      {currentTotal} / {maxPossible}
                    </span>
                    <span className="text-[10px] text-slate-400">pts</span>
                  </div>
                </div>

                <div className="bg-white/90 p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[11px] text-slate-500 font-medium block">Indicators Rated</span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-xl font-bold text-teal-700">{ratedCount}</span>
                    <span className="text-[10px] text-slate-400">of {result.scores.length}</span>
                  </div>
                  {notObservableCount > 0 && (
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      {notObservableCount} not observable
                    </span>
                  )}
                </div>

                <div className="bg-white/90 p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[11px] text-slate-500 font-medium block">Activities Factored</span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-xl font-bold text-amber-600">{result.activitiesEvaluatedCount}</span>
                    <span className="text-[10px] text-slate-400">phases</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-2 px-5 pt-3 border-b border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setSelectedTab('scores')}
                className={`pb-2.5 font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                  selectedTab === 'scores'
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Rubric Scores ({result.scores.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedTab('feedback')}
                className={`pb-2.5 font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                  selectedTab === 'feedback'
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Glow / Grow / Go Protocol</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedTab('summary')}
                className={`pb-2.5 font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                  selectedTab === 'summary'
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Executive Summary</span>
              </button>
            </div>

            {/* Content Area */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
              {selectedTab === 'scores' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-slate-600">
                    <span>
                      Review and fine-tune suggested scores before applying them to the live observation form.
                    </span>
                    <span className="font-semibold text-slate-800">
                      {currentScoresList.filter((s) => s.score === 4).length} Distinguished •{' '}
                      {currentScoresList.filter((s) => s.score === 3).length} Proficient •{' '}
                      {currentScoresList.filter((s) => s.score === 2).length} Basic
                      {notObservableCount > 0 && (
                        <> • <span className="text-slate-500 font-semibold">{notObservableCount} Not Observable</span></>
                      )}
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                    {result.scores.map((scItem) => {
                      const current = customScores[scItem.indicatorCode] || {
                        score: scItem.score,
                        rationale: scItem.rationale,
                      };

                      return (
                        <div
                          key={scItem.indicatorCode}
                          className="p-3.5 hover:bg-slate-50/80 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono font-bold text-[11px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                                {scItem.indicatorCode}
                              </span>
                              <span className="font-bold text-slate-900">{scItem.title}</span>
                              <span className="text-[10px] text-slate-400">{scItem.domainId}</span>
                              {current.score === null && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                  NOT OBSERVABLE
                                </span>
                              )}
                            </div>
                            <p
                              className={`text-[11px] leading-relaxed ${
                                current.score === null ? 'text-slate-500 italic' : 'text-slate-600'
                              }`}
                            >
                              {scItem.rationale}
                            </p>

                            {scItem.evidenceRefs && scItem.evidenceRefs.length > 0 && (
                              <ul className="mt-1.5 space-y-0.5">
                                {scItem.evidenceRefs.map((ref, i) => (
                                  <li
                                    key={i}
                                    className="text-[10px] text-slate-500 pl-2 border-l-2 border-slate-200 break-words"
                                  >
                                    {ref}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>

                          {/* Score Selector */}
                          <div className="flex items-center gap-1 shrink-0 bg-slate-100 p-1 rounded-xl border border-slate-200">
                            <button
                              type="button"
                              onClick={() => handleScoreChange(scItem.indicatorCode, null)}
                              className={`px-2 h-8 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                                current.score === null
                                  ? 'bg-slate-600 text-white shadow-xs'
                                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
                              }`}
                              title="Not observable from the captured evidence"
                            >
                              N/O
                            </button>
                            {([1, 2, 3, 4] as const).map((rating) => {
                              const isSelected = current.score === rating;
                              let colorClass = 'text-slate-600 hover:text-slate-900 hover:bg-slate-200';
                              if (isSelected) {
                                if (rating === 4) colorClass = 'bg-emerald-600 text-white font-bold shadow-xs';
                                else if (rating === 3) colorClass = 'bg-indigo-600 text-white font-bold shadow-xs';
                                else if (rating === 2) colorClass = 'bg-amber-500 text-white font-bold shadow-xs';
                                else colorClass = 'bg-rose-600 text-white font-bold shadow-xs';
                              }

                              return (
                                <button
                                  key={rating}
                                  type="button"
                                  onClick={() => handleScoreChange(scItem.indicatorCode, rating)}
                                  className={`w-8 h-8 rounded-lg text-xs font-semibold transition flex flex-col items-center justify-center cursor-pointer ${colorClass}`}
                                  title={`Rating ${rating}`}
                                >
                                  <span>{rating}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedTab === 'feedback' && (
                <div className="space-y-4">
                  {/* Glow */}
                  <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4">
                    <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      Glow (Observed Strengths)
                    </h4>
                    <ul className="space-y-2">
                      {result.glow.map((g, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-emerald-950">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span>{g}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Grow */}
                  <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-4">
                    <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      Grow (Reflective Coaching Inquiries)
                    </h4>
                    <ul className="space-y-2">
                      {result.grow.map((g, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-amber-950">
                          <HelpCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <span className="italic">&ldquo;{g}&rdquo;</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Go */}
                  <div className="bg-indigo-50/50 border border-indigo-200 rounded-xl p-4">
                    <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                      Go (Agreed Pedagogical Next Steps)
                    </h4>
                    <ul className="space-y-2">
                      {result.go.map((g, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-indigo-950">
                          <ChevronRight className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                          <span>{g}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {selectedTab === 'summary' && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Comprehensive Pedagogical Narrative
                  </h4>
                  <p className="text-slate-700 leading-relaxed whitespace-pre-line">
                    {result.summaryEvaluation}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeGlowGrowGo}
                  onChange={(e) => setIncludeGlowGrowGo(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>Also apply Glow / Grow / Go Action Protocol</span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-medium border border-slate-200 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyClick}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Apply All {result.scores.length} Auto-Graded Scores</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
