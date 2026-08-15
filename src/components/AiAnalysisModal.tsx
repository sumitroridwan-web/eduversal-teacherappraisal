import React from 'react';
import { Sparkles, Check, X, ArrowRight, MessageSquare, Brain, Clock, ShieldCheck, ChevronRight, Copy, Award } from 'lucide-react';
import { AiLessonAnalysis, CareerLevel } from '../types';

interface AiAnalysisModalProps {
  analysis: AiLessonAnalysis | null;
  isOpen: boolean;
  onClose: () => void;
  onApplyScores: (suggestedScores: Array<{ indicatorCode: string; score: 1 | 2 | 3 | 4; evidence: string }>) => void;
  onApplyFeedback: (glow: string[], grow: string[], go: string[]) => void;
  careerLevel: CareerLevel;
}

export const AiAnalysisModal: React.FC<AiAnalysisModalProps> = ({
  analysis,
  isOpen,
  onClose,
  onApplyScores,
  onApplyFeedback,
  careerLevel,
}) => {
  if (!isOpen || !analysis) return null;

  const handleApplyAll = () => {
    if (analysis.suggestedScores && analysis.suggestedScores.length > 0) {
      onApplyScores(analysis.suggestedScores);
    }
    if (analysis.glow || analysis.grow || analysis.go) {
      onApplyFeedback(analysis.glow || [], analysis.grow || [], analysis.go || []);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white border border-slate-200 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col text-slate-800">
        {/* Header */}
        <div className="bg-slate-50 p-6 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                Gemini AI Lesson Pedagogical Analysis
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Framework 2 Evidence
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Automated classroom dialogue, pacing, cognitive demand, and rubric score calibration
              </p>
            </div>
          </div>
          <button
            id="btn-close-ai-modal"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-700 flex items-center justify-center border border-slate-200 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Key Metrics Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Talk Ratio Card */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
                <span className="font-semibold flex items-center gap-1.5 text-slate-700">
                  <MessageSquare className="w-4 h-4 text-indigo-600" />
                  Classroom Talk Ratio
                </span>
              </div>
              <div className="flex items-center justify-between my-1">
                <div>
                  <div className="text-xl font-bold text-indigo-600 font-mono">
                    {analysis.teacherTalkPercentage}%
                  </div>
                  <div className="text-[11px] text-slate-400">Teacher Talk</div>
                </div>
                <div className="text-slate-300 font-bold">:</div>
                <div className="text-right">
                  <div className="text-xl font-bold text-emerald-600 font-mono">
                    {analysis.studentTalkPercentage}%
                  </div>
                  <div className="text-[11px] text-slate-400">Student Talk</div>
                </div>
              </div>
              {/* Ratio Bar */}
              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden flex mt-2">
                <div style={{ width: `${analysis.teacherTalkPercentage}%` }} className="bg-indigo-600 h-full" />
                <div style={{ width: `${analysis.studentTalkPercentage}%` }} className="bg-emerald-500 h-full" />
              </div>
            </div>

            {/* Higher Order Thinking */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
                <span className="font-semibold flex items-center gap-1.5 text-slate-700">
                  <Brain className="w-4 h-4 text-purple-600" />
                  Higher-Order Thinking
                </span>
                <span className="text-[10px] text-purple-700 font-mono bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 font-medium">
                  Bloom&apos;s HOTS
                </span>
              </div>
              <div className="my-1">
                <div className="text-2xl font-bold text-purple-600 font-mono">
                  {analysis.higherOrderThinkingPercentage}%
                </div>
                <div className="text-[11px] text-slate-500">Analysis, Evaluation, &amp; Creation Tasks</div>
              </div>
              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mt-2">
                <div
                  style={{ width: `${analysis.higherOrderThinkingPercentage}%` }}
                  className="bg-purple-600 h-full"
                />
              </div>
            </div>

            {/* Target Level Alignment */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
                <span className="font-semibold flex items-center gap-1.5 text-slate-700">
                  <Award className="w-4 h-4 text-amber-600" />
                  Assessed Framework Level
                </span>
              </div>
              <div className="my-1">
                <div className="text-xl font-bold text-amber-600">{careerLevel} Level</div>
                <div className="text-[11px] text-slate-500">
                  {analysis.suggestedScores?.length || 0} indicators evaluated
                </div>
              </div>
              <div className="text-[11px] text-emerald-700 font-medium flex items-center gap-1 mt-2">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Calibrated to Eduversal v2.1</span>
              </div>
            </div>
          </div>

          {/* Lesson Overview Summary */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Pedagogical Evaluation Synthesis
            </h3>
            <p className="text-xs text-slate-700 leading-relaxed">{analysis.summary}</p>

            {analysis.calpProficiencyNotes && (
              <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-indigo-700 flex items-start gap-2">
                <span className="font-semibold text-indigo-800 shrink-0">Language of Instruction (CALP):</span>
                <span>{analysis.calpProficiencyNotes}</span>
              </div>
            )}
          </div>

          {/* Lesson Timeline */}
          {analysis.timeline && analysis.timeline.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-indigo-600" />
                Lesson Flow &amp; Timeline Phases
              </h3>
              <div className="space-y-2">
                {analysis.timeline.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 shrink-0">
                        {item.timestamp || `Phase ${idx + 1}`}
                      </span>
                      <div>
                        <div className="text-xs font-semibold text-slate-900">{item.phase}</div>
                        <div className="text-xs text-slate-500">{item.description}</div>
                      </div>
                    </div>
                    {item.strengths && (
                      <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded self-start sm:self-center shrink-0 font-medium">
                        {item.strengths}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Suggested Rubric Scores */}
          {analysis.suggestedScores && analysis.suggestedScores.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  AI Suggested Rubric Scores with Evidence
                </h3>
                <button
                  type="button"
                  onClick={() => onApplyScores(analysis.suggestedScores)}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Apply All {analysis.suggestedScores.length} Scores</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {analysis.suggestedScores.map((scoreItem, idx) => (
                  <div key={idx} className="p-3 bg-white rounded-xl border border-slate-200 flex items-start gap-3 shadow-2xs">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 ${
                        scoreItem.score === 4
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : scoreItem.score === 3
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          : scoreItem.score === 2
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {scoreItem.score}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">{scoreItem.indicatorCode}</span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {scoreItem.score === 4
                            ? 'Distinguished'
                            : scoreItem.score === 3
                            ? 'Proficient'
                            : scoreItem.score === 2
                            ? 'Basic'
                            : 'Unsatisfactory'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-snug">{scoreItem.evidence}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Glow, Grow, Go Coaching Suggestions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Glow / Grow / Go Post-Conference Coaching Plan
              </h3>
              <button
                type="button"
                onClick={() => onApplyFeedback(analysis.glow || [], analysis.grow || [], analysis.go || [])}
                className="text-xs font-semibold text-indigo-700 hover:text-indigo-800 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Apply to Feedback Sheet</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Glow */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3">
                <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  Glow (Strengths)
                </div>
                <ul className="space-y-2 text-xs text-emerald-950">
                  {analysis.glow.map((g, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-emerald-700 font-bold">•</span>
                      <span>{g}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Grow */}
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3">
                <div className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-600" />
                  Grow (Reflective Questions)
                </div>
                <ul className="space-y-2 text-xs text-amber-950">
                  {analysis.grow.map((g, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-amber-700 font-bold">•</span>
                      <span>{g}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Go */}
              <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3">
                <div className="text-xs font-bold text-indigo-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-600" />
                  Go (Action Commitments)
                </div>
                <ul className="space-y-2 text-xs text-indigo-950">
                  {analysis.go.map((g, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-indigo-700 font-bold">•</span>
                      <span>{g}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Powered by Eduversal Appraisal Engine &amp; Gemini Flash
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-medium transition cursor-pointer shadow-2xs"
            >
              Close
            </button>
            <button
              id="btn-apply-all-ai"
              type="button"
              onClick={handleApplyAll}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition shadow-sm cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Apply AI Scores &amp; Feedback to Form</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
