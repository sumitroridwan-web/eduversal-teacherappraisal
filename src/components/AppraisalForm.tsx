import React, { useState, useEffect, useRef } from 'react';
import {
  Save,
  CheckCircle2,
  FileText,
  Sparkles,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Clock,
  User,
  Calendar,
  Layers,
  GraduationCap,
  Award,
  AlertCircle,
  HelpCircle,
  Plus,
  Trash2,
  Copy,
  Check,
  Zap,
  School,
  NotebookPen,
  Loader2,
  Filter,
  ArrowDownToLine,
  Keyboard,
  Timer,
  PenSquare,
  ListChecks,
} from 'lucide-react';
import {
  TeacherAppraisalRecord,
  CareerLevel,
  SchoolLevel,
  SubjectCategory,
  ObservationSection,
  AppraisalItem,
  AutoGradeResult,
  LessonActivity,
  EDUVERSAL_SCHOOLS,
  APPRAISERS,
  ACADEMIC_YEARS,
  EVIDENCE_SOURCES,
  EvidenceSource,
  ItemScoreRecord,
  currentAcademicYear,
} from '../types';
import {
  getItemsForLevel,
  calculateF2Scores,
  COVERAGE_FLOOR,
  LEVEL_SCORING_CONFIGS,
  PRIMARY_SECONDARY_F2_ITEMS,
  EARLY_YEARS_F2_ITEMS,
} from '../data/frameworkRubrics';
import { AudioLessonRecorder } from './AudioLessonRecorder';
import { AiAnalysisModal } from './AiAnalysisModal';
import { LessonActivitiesManager } from './LessonActivitiesManager';
import { ClassroomPhotoEvidence } from './ClassroomPhotoEvidence';
import { AutoGradeModal } from './AutoGradeModal';
import { executeAutoGrade } from '../services/autoGrader';
import { saveOrUpdateAppraisal } from '../services/storage';
import { useLanguage } from '../i18n/LanguageContext';
import {
  isRated,
  visibleItems,
  findNextUnrated,
  stampTime,
  clockTime,
  appendEvidenceStem,
  coverageProgress,
} from '../services/observationSheet';
import {
  generateGlowGrowGo,
  capFeedback,
  MAX_FEEDBACK_ITEMS,
  DEFAULT_FEEDBACK_ITEMS,
} from '../services/glowGrowGo';

/**
 * Openings for an evidence note, chosen because each one demands a specific
 * observation to finish it.
 */
const EVIDENCE_PROMPTS = ['Engagement', 'Misconception', 'Academic language'] as const;

interface AppraisalFormProps {
  initialRecord: TeacherAppraisalRecord;
  onSave: (record: TeacherAppraisalRecord) => void;
  onViewReport: (record: TeacherAppraisalRecord) => void;
  onOpenRubrics: (level: CareerLevel) => void;
}

export const AppraisalForm: React.FC<AppraisalFormProps> = ({
  initialRecord,
  onSave,
  onViewReport,
  onOpenRubrics,
}) => {
  const { t, language } = useLanguage();
  const [record, setRecord] = useState<TeacherAppraisalRecord>(initialRecord);
  const [activeSection, setActiveSection] = useState<'ALL' | 'A' | 'B' | 'C' | 'FEEDBACK'>('ALL');

  /**
   * Capture during the lesson, rate afterwards.
   *
   * Forty-four indicators across a forty-minute lesson is under a minute each,
   * to read the descriptors, decide, rate and write the evidence, while also
   * watching the room. Nobody does that, so the sheet stops pretending: during
   * the lesson it shows the things you can actually use at the back of a
   * classroom, and the rubric comes out afterwards with the notes alongside it.
   *
   * A part-rated record opens straight into rating, because that is somebody
   * coming back to finish.
   */
  const [mode, setMode] = useState<'CAPTURE' | 'RATE'>(() =>
    Object.values(initialRecord.scores || {}).some((entry: any) => typeof entry?.score === 'number')
      ? 'RATE'
      : 'CAPTURE'
  );
  const [unratedOnly, setUnratedOnly] = useState<boolean>(false);
  const [showNotesPanel, setShowNotesPanel] = useState<boolean>(true);
  /** Descriptor shown while a rating button is hovered, before it is clicked. */
  const [previewDescriptor, setPreviewDescriptor] = useState<{ itemId: string; score: 1 | 2 | 3 | 4 } | null>(null);
  const [expandedRubricId, setExpandedRubricId] = useState<string | null>(null);
  const [showAiModal, setShowAiModal] = useState<boolean>(false);
  const [savedSuccessAlert, setSavedSuccessAlert] = useState<boolean>(false);

  // Auto-grading states
  const [isAutoGrading, setIsAutoGrading] = useState<boolean>(false);
  const [autoGradeResult, setAutoGradeResult] = useState<AutoGradeResult | null>(null);
  const [showAutoGradeModal, setShowAutoGradeModal] = useState<boolean>(false);

  // New Glow, Grow, Go input state
  const [newGlow, setNewGlow] = useState('');
  const [newGrow, setNewGrow] = useState('');
  const [newGo, setNewGo] = useState('');

  // Synchronize initial record when selected appraisal changes
  useEffect(() => {
    setRecord({ ...initialRecord, feedback: capFeedback(initialRecord.feedback) });
  }, [initialRecord]);

  // Autosave. Writes directly to storage rather than through onSave: routing
  // it through the parent would replace initialRecord and reset this form
  // mid-edit. An observation can run 40 minutes, so losing it to a closed tab
  // is not acceptable.
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const skipFirstAutoSave = useRef(true);

  useEffect(() => {
    if (skipFirstAutoSave.current) {
      skipFirstAutoSave.current = false;
      return;
    }
    setAutoSaveState('saving');
    const timer = setTimeout(() => {
      try {
        saveOrUpdateAppraisal(record);
        setAutoSaveState('saved');
      } catch {
        setAutoSaveState('error');
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [record]);

  // Recalculate stats whenever careerLevel or scores change
  const currentItems = getItemsForLevel(record.careerLevel);
  const config = LEVEL_SCORING_CONFIGS[record.careerLevel];
  const stats = calculateF2Scores(record.careerLevel, record.scores);

  // Drives the notes card header and gates the score-from-notes button.
  const hasObserverNotes = Boolean(record.generalObserverNotes?.trim());
  const observerNoteWordCount = hasObserverNotes
    ? record.generalObserverNotes.trim().split(/\s+/).length
    : 0;

  // Trigger Auto-Grading Engine
  const handleTriggerAutoGrade = async () => {
    setIsAutoGrading(true);
    setShowAutoGradeModal(true);
    try {
      const result = await executeAutoGrade(record, language);
      setAutoGradeResult(result);
    } catch (err) {
      console.error('Auto-grading evaluation error:', err);
    } finally {
      setIsAutoGrading(false);
    }
  };

  // Apply Auto-Graded Scores and Feedback to the form
  const handleApplyAllAutoGrade = (
    scores: Record<string, { score: 1 | 2 | 3 | 4 | null; notes: string }>,
    feedback?: { glow: string[]; grow: string[]; go: string[] }
  ) => {
    // Never replace an appraiser's own rating without asking. Overwriting
    // professional judgement silently is the one thing this must not do.
    const clashes = Object.entries(scores).filter(([code, incoming]) => {
      const existing = record.scores[code];
      return (
        existing &&
        typeof existing.score === 'number' &&
        existing.origin !== 'ai-suggested' &&
        existing.score !== incoming.score
      );
    });

    if (clashes.length > 0) {
      const proceed = window.confirm(
        `${clashes.length} indicator${clashes.length === 1 ? '' : 's'} you rated yourself ` +
          `would be changed by the AI suggestions ` +
          `(${clashes.slice(0, 5).map(([c]) => c).join(', ')}${clashes.length > 5 ? '…' : ''}).\n\n` +
          'Replace your ratings with the AI suggestions?'
      );
      if (!proceed) return;
    }

    setRecord((prev) => {
      const updatedScores = { ...prev.scores };
      Object.entries(scores).forEach(([code, incoming]) => {
        updatedScores[code] = {
          ...prev.scores[code],
          score: incoming.score,
          notes: incoming.notes,
          // Applied, but not yet anyone's professional judgement.
          origin: 'ai-suggested',
          confirmedAt: undefined,
        };
      });

      return {
        ...prev,
        scores: updatedScores,
        // Capped after merging: unioning existing entries with generated ones
        // pushed columns past the limit (8 of 5 was reachable).
        feedback: feedback
          ? capFeedback({
              glow: Array.from(new Set([...prev.feedback.glow, ...feedback.glow])),
              grow: Array.from(new Set([...prev.feedback.grow, ...feedback.grow])),
              go: Array.from(new Set([...prev.feedback.go, ...feedback.go])),
            })
          : prev.feedback,
      };
    });
    // Suggestions have just landed on indicators the appraiser cannot see from
    // the capture surface, and every one of them needs confirming.
    setMode('RATE');
    setSavedSuccessAlert(true);
    setTimeout(() => setSavedSuccessAlert(false), 4000);
  };

  // Change Career Level handler
  const handleLevelChange = (newLevel: CareerLevel) => {
    const newItems = getItemsForLevel(newLevel);
    const updatedScores = { ...record.scores };

    // Initialize any missing item scores
    newItems.forEach((item) => {
      if (!updatedScores[item.id]) {
        updatedScores[item.id] = {
          score: null,
          notes: '',
          evidenceSource:
            item.section === 'A'
              ? 'Lesson Plan Review'
              : item.section === 'C'
              ? 'Post-Lesson Discussion'
              : 'Live Classroom Observation',
        };
      }
    });

    setRecord((prev) => ({
      ...prev,
      careerLevel: newLevel,
      scores: updatedScores,
    }));
  };

  // Score an item
  const handleSetScore = (itemId: string, score: 1 | 2 | 3 | 4) => {
    setRecord((prev) => {
      const existing = prev.scores[itemId] || { score: null, notes: '' };
      return {
        ...prev,
        scores: {
          ...prev.scores,
          [itemId]: {
            ...existing,
            score: existing.score === score ? null : score, // toggle if clicked again
            // Rating it by hand makes it the appraiser's own judgement.
            origin: 'observer',
            confirmedAt: new Date().toISOString(),
          },
        },
      };
    });
  };

  /** Grows an evidence box to fit what was written, so nothing scrolls out of sight. */
  const autoGrow = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  };

  /** Puts the cursor at the end of an evidence note just extended by a button. */
  const focusNotes = (itemId: string) => {
    requestAnimationFrame(() => {
      const field = document.getElementById(`notes-input-${itemId}`) as HTMLTextAreaElement | null;
      if (!field) return;
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
      autoGrow(field);
    });
  };

  /** Sets a rating outright, for the keyboard path where a toggle would surprise. */
  const setScoreExplicitly = (itemId: string, score: 1 | 2 | 3 | 4) => {
    setRecord((prev) => ({
      ...prev,
      scores: {
        ...prev.scores,
        [itemId]: {
          ...(prev.scores[itemId] || { score: null, notes: '' }),
          score,
          origin: 'observer',
          confirmedAt: new Date().toISOString(),
        },
      },
    }));
  };

  const handleUpdateEvidenceSource = (itemId: string, evidenceSource: EvidenceSource) => {
    setRecord((prev) => ({
      ...prev,
      scores: {
        ...prev.scores,
        [itemId]: { ...(prev.scores[itemId] || { score: null, notes: '' }), evidenceSource },
      },
    }));
  };

  // Accept an AI suggestion as the appraiser's own judgement
  const handleConfirmSuggestion = (itemId: string) => {
    setRecord((prev) => ({
      ...prev,
      scores: {
        ...prev.scores,
        [itemId]: {
          ...prev.scores[itemId],
          origin: 'ai-confirmed',
          confirmedAt: new Date().toISOString(),
        },
      },
    }));
  };

  const handleConfirmAllSuggestions = () => {
    setRecord((prev) => {
      const updated = { ...prev.scores };
      Object.entries(updated).forEach(([code, entry]: [string, ItemScoreRecord]) => {
        if (entry?.origin === 'ai-suggested') {
          updated[code] = {
            ...entry,
            origin: 'ai-confirmed',
            confirmedAt: new Date().toISOString(),
          };
        }
      });
      return { ...prev, scores: updated };
    });
  };

  const pendingSuggestions = (Object.values(record.scores) as ItemScoreRecord[]).filter(
    (e) => e?.origin === 'ai-suggested' && typeof e.score === 'number'
  ).length;

  // Update note for an item
  const handleUpdateNotes = (itemId: string, notes: string) => {
    setRecord((prev) => {
      const existing = prev.scores[itemId] || { score: null, notes: '' };
      return {
        ...prev,
        scores: {
          ...prev.scores,
          [itemId]: {
            ...existing,
            notes,
          },
        },
      };
    });
  };

  // There is deliberately no bulk-fill action here. Writing a rating into every
  // unrated indicator - with a note reading "Meets standard descriptor" - put
  // judgements on the sheet that nobody made and no evidence supports, and
  // nothing downstream could tell them from the appraiser's own. An indicator
  // that was not observed stays unrated; the coverage floor reports the gap.

  // Clear all scores
  const handleClearScores = () => {
    if (window.confirm('Are you sure you want to clear all scored ratings for this observation?')) {
      const updated = { ...record.scores };
      currentItems.forEach((item) => {
        if (updated[item.id]) {
          updated[item.id].score = null;
        }
      });
      setRecord((prev) => ({ ...prev, scores: updated }));
    }
  };

  // Apply AI Analysis suggested scores
  const handleApplyAiScores = (
    suggestedScores: Array<{ indicatorCode: string; score: 1 | 2 | 3 | 4; evidence: string }>
  ) => {
    setRecord((prev) => {
      const updated = { ...prev.scores };
      suggestedScores.forEach((s) => {
        if (currentItems.some((it) => it.id === s.indicatorCode)) {
          updated[s.indicatorCode] = {
            score: s.score,
            notes: (updated[s.indicatorCode]?.notes ? updated[s.indicatorCode].notes + ' ' : '') + `[AI Observation]: ${s.evidence}`,
            evidenceSource: 'Live Classroom Observation',
          };
        }
      });
      return { ...prev, scores: updated };
    });
  };

  // Apply AI Feedback (Glow, Grow, Go)
  const handleApplyAiFeedback = (glow: string[], grow: string[], go: string[]) => {
    setRecord((prev) => ({
      ...prev,
      feedback: {
        ...capFeedback({
          glow: Array.from(
            new Set([...prev.feedback.glow, ...glow.slice(0, DEFAULT_FEEDBACK_ITEMS)])
          ),
          grow: Array.from(
            new Set([...prev.feedback.grow, ...grow.slice(0, DEFAULT_FEEDBACK_ITEMS)])
          ),
          go: Array.from(
            new Set([...prev.feedback.go, ...go.slice(0, DEFAULT_FEEDBACK_ITEMS)])
          ),
        }),
      },
    }));
  };

  // Save Handler
  const handleSaveClick = (status: 'Draft' | 'Observation Saved' | 'Finalized (Conference Complete)') => {
    if (status === 'Finalized (Conference Complete)') {
      // A finalised appraisal carries weight, so it should not close with the
      // AI's opinion standing in for the appraiser's.
      if (pendingSuggestions > 0) {
        window.alert(
          `${pendingSuggestions} AI-suggested rating${pendingSuggestions === 1 ? '' : 's'} ` +
            'have not been confirmed.\n\nConfirm or change them before finalising, so the ' +
            'record shows your professional judgement rather than an unreviewed suggestion.'
        );
        return;
      }
      if (!stats.isComplete) {
        const proceed = window.confirm(
          `Only ${stats.itemsScored} of ${stats.totalItems} indicators have been rated.\n\n` +
            'Unrated indicators are reported as not evidenced and are excluded from the ' +
            'score, not counted against the teacher.\n\nFinalise anyway?'
        );
        if (!proceed) return;
      }
    }

    const updatedRecord: TeacherAppraisalRecord = {
      ...record,
      status,
      updatedAt: new Date().toISOString(),
    };
    onSave(updatedRecord);
    setSavedSuccessAlert(true);
    setTimeout(() => setSavedSuccessAlert(false), 3500);
  };

  // Build the debrief from the ratings actually given
  const handleGenerateFeedback = () => {
    const generated = generateGlowGrowGo(record);
    const existing =
      record.feedback.glow.length + record.feedback.grow.length + record.feedback.go.length;

    if (existing > 0) {
      const proceed = window.confirm(
        'Replace the current Glow / Grow / Go entries with ones generated from the ratings?\n\n' +
          'Anything you have written here will be lost.'
      );
      if (!proceed) return;
    }

    setRecord((prev) => ({ ...prev, feedback: generated }));
  };

  const feedbackFull = (type: 'glow' | 'grow' | 'go') =>
    record.feedback[type].length >= MAX_FEEDBACK_ITEMS;

  // Add Glow / Grow / Go items
  const addGlow = () => {
    if (!newGlow.trim()) return;
    if (feedbackFull('glow')) return;
    setRecord((prev) => ({
      ...prev,
      feedback: { ...prev.feedback, glow: [...prev.feedback.glow, newGlow.trim()] },
    }));
    setNewGlow('');
  };

  const addGrow = () => {
    if (!newGrow.trim()) return;
    if (feedbackFull('grow')) return;
    setRecord((prev) => ({
      ...prev,
      feedback: { ...prev.feedback, grow: [...prev.feedback.grow, newGrow.trim()] },
    }));
    setNewGrow('');
  };

  const addGo = () => {
    if (!newGo.trim()) return;
    if (feedbackFull('go')) return;
    setRecord((prev) => ({
      ...prev,
      feedback: { ...prev.feedback, go: [...prev.feedback.go, newGo.trim()] },
    }));
    setNewGo('');
  };

  const removeFeedbackItem = (type: 'glow' | 'grow' | 'go', index: number) => {
    setRecord((prev) => ({
      ...prev,
      feedback: {
        ...prev.feedback,
        [type]: prev.feedback[type].filter((_, i) => i !== index),
      },
    }));
  };

  // Filter items by section and by whether they still need a rating
  const displayedItems = visibleItems(currentItems, record.scores, activeSection, unratedOnly);

  const progress = coverageProgress(stats.itemsScored, stats.totalItems, COVERAGE_FLOOR);
  const unratedCount = currentItems.filter((item) => !isRated(record.scores, item.id)).length;

  /**
   * Moves to the next indicator still needing a rating and puts the keyboard on
   * it, so 1-4 rates it without reaching for the mouse.
   */
  const goToNextUnrated = (afterId?: string) => {
    const next = findNextUnrated(currentItems, record.scores, afterId);
    if (!next) return;

    // The card may be filtered out of view - a section tab, or unrated-only
    // hiding the one just rated. Land on the tab that contains it.
    if (activeSection !== 'ALL' && activeSection !== next.section) setActiveSection('ALL');

    requestAnimationFrame(() => {
      const card = document.getElementById(`item-card-${next.id}`);
      if (!card) return;
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.focus({ preventScroll: true });
    });
  };

  /**
   * Rating from the keyboard: 1-4 rates the focused indicator and moves on,
   * Enter skips to the next one still needing a rating.
   */
  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, itemId: string) => {
    // Typing evidence must never rate anything.
    const target = event.target as HTMLElement;
    if (target !== event.currentTarget) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key >= '1' && event.key <= '4') {
      event.preventDefault();
      const score = Number(event.key) as 1 | 2 | 3 | 4;
      // Deliberately not the toggle handleSetScore does: pressing 3 twice while
      // working down the sheet should leave a 3, not silently clear it.
      setScoreExplicitly(itemId, score);
      goToNextUnrated(itemId);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      goToNextUnrated(itemId);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {savedSuccessAlert && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-xl shadow-xl border border-emerald-500 animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-sm font-semibold">Appraisal record successfully saved!</span>
        </div>
      )}

      {/* Top Metadata & Career Level Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-sm text-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 sm:pb-5 mb-4 sm:mb-5 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 text-[11px] sm:text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">
              <span>Framework 2 • Observation Sheet</span>
              <span className="text-slate-300">•</span>
              <span>Eduversal 2026</span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2 sm:gap-3 flex-wrap">
              <span>{record.teacherName || 'New Teacher Appraisal'}</span>
              <span
                className={`text-[11px] sm:text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                  record.status === 'Finalized (Conference Complete)'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : record.status === 'Observation Saved'
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
              >
                {record.status}
              </span>
            </h1>
          </div>

          {/* Quick Action Buttons */}
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
            <button
              id="btn-auto-grade-top"
              type="button"
              onClick={handleTriggerAutoGrade}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-indigo-600 to-teal-600 hover:from-indigo-700 hover:to-teal-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-sm min-h-[40px]"
              title="Auto-grade the teacher on all indicators based on recorded activities and evidence"
            >
              <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
              <span>Auto Grade</span>
            </button>

            <button
              id="btn-open-rubrics"
              type="button"
              onClick={() => onOpenRubrics(record.careerLevel)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-xl border border-slate-200 transition cursor-pointer shadow-2xs min-h-[40px]"
            >
              <BookOpen className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Handbook</span>
            </button>

            <button
              id="btn-view-report-pdf"
              type="button"
              onClick={() => onViewReport(record)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold rounded-xl transition cursor-pointer min-h-[40px]"
            >
              <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Report</span>
            </button>

            <button
              id="btn-save-draft"
              type="button"
              onClick={() => handleSaveClick('Observation Saved')}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm transition cursor-pointer min-h-[40px]"
            >
              <Save className="w-4 h-4 shrink-0" />
              <span>Save</span>
            </button>
          </div>
        </div>

        {/* Metadata Inputs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* School Name */}
          <div>
            <label className="block text-slate-600 font-medium mb-1">School / Campus Name</label>
            <div className="relative">
              <School className="w-4 h-4 text-teal-600 absolute left-3 top-2.5 pointer-events-none" />
              <select
                id="select-school-name"
                value={record.schoolName || ''}
                onChange={(e) => setRecord({ ...record, schoolName: e.target.value })}
                className="w-full bg-white text-slate-900 pl-9 pr-8 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 shadow-2xs font-medium appearance-none cursor-pointer"
              >
                <option value="" disabled>
                  Select Eduversal School...
                </option>
                {EDUVERSAL_SCHOOLS.map((school) => (
                  <option key={school} value={school}>
                    {school}
                  </option>
                ))}
                {record.schoolName && !EDUVERSAL_SCHOOLS.includes(record.schoolName as any) && (
                  <option value={record.schoolName}>{record.schoolName}</option>
                )}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Teacher Name */}
          <div>
            <label className="block text-slate-600 font-medium mb-1">Teacher Full Name &amp; Degree</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                id="input-teacher-name"
                type="text"
                value={record.teacherName}
                onChange={(e) => setRecord({ ...record, teacherName: e.target.value })}
                placeholder="e.g. Dr. Sarah Al-Mansoor, M.Ed"
                className="w-full bg-white text-slate-900 pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-2xs"
              />
            </div>
          </div>

          {/* Career Level Selector */}
          <div>
            <label className="block text-slate-600 font-medium mb-1">Career Level (Rubric Visibility)</label>
            <div className="relative">
              <Award className="w-4 h-4 text-amber-500 absolute left-3 top-2.5" />
              <select
                id="select-career-level"
                value={record.careerLevel}
                onChange={(e) => handleLevelChange(e.target.value as CareerLevel)}
                className="w-full bg-white text-slate-900 font-medium pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-2xs"
              >
                <option value="Lead">Lead Level (180 max pts - A/B/C/D/F)</option>
                <option value="Proficient">Proficient Level (176 max pts)</option>
                <option value="Developing">Developing Level (148 max pts)</option>
                <option value="Induction">Induction Level (120 max pts)</option>
                <option value="EarlyYears">Early Years Level (68 max pts - EY1-3)</option>
              </select>
            </div>
          </div>

          {/* School Level */}
          <div>
            <label className="block text-slate-600 font-medium mb-1">School Level / Department</label>
            <div className="relative">
              <GraduationCap className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <select
                id="select-school-level"
                value={record.schoolLevel}
                onChange={(e) => setRecord({ ...record, schoolLevel: e.target.value as SchoolLevel })}
                className="w-full bg-white text-slate-900 pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-2xs font-medium"
              >
                <option value="Early Years (PG-KG)">Early Years (PG-KG)</option>
                <option value="Primary (Grades 1-6)">Primary (Grades 1-6)</option>
                <option value="Middle School (Grades 7-9)">Middle School (Grades 7-9)</option>
                <option value="High School (Grades 10-12)">High School (Grades 10-12)</option>
              </select>
            </div>
          </div>

          {/* Subject Category */}
          <div>
            <label className="block text-slate-600 font-medium mb-1">Subject Category</label>
            <div className="relative">
              <Layers className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <select
                id="select-subject-category"
                value={record.subjectCategory}
                onChange={(e) => setRecord({ ...record, subjectCategory: e.target.value as SubjectCategory })}
                className="w-full bg-white text-slate-900 pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-2xs"
              >
                <option value="Mathematics">Mathematics</option>
                <option value="Science (Physics, Chem, Bio)">Science (Physics, Chem, Bio)</option>
                <option value="English Language & Lit">English Language &amp; Lit</option>
                <option value="Bahasa Indonesia">Bahasa Indonesia</option>
                <option value="Social Studies & Humanities">Social Studies &amp; Humanities</option>
                <option value="Information & Digital Tech">Information &amp; Digital Tech</option>
                <option value="Arts & Music">Arts &amp; Music</option>
                <option value="Physical & Health Education">Physical &amp; Health Education</option>
                <option value="Early Childhood Education">Early Childhood Education</option>
              </select>
            </div>
          </div>

          {/* Subject Specific & Grade */}
          <div>
            <label className="block text-slate-600 font-medium mb-1">Subject Specific Name</label>
            <input
              id="input-subject-name"
              type="text"
              value={record.subject}
              onChange={(e) => setRecord({ ...record, subject: e.target.value })}
              placeholder="e.g. Physics (Cambridge A-Level)"
              className="w-full bg-white text-slate-900 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-2xs"
            />
          </div>

          <div>
            <label className="block text-slate-600 font-medium mb-1">Grade / Class / Room</label>
            <input
              id="input-grade-class"
              type="text"
              value={record.gradeClass}
              onChange={(e) => setRecord({ ...record, gradeClass: e.target.value })}
              placeholder="e.g. Grade 11-A, Science Lab 2"
              className="w-full bg-white text-slate-900 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-2xs"
            />
          </div>

          {/* Appraiser Name & Role */}
          <div>
            <label htmlFor="input-appraiser-name" className="block text-slate-600 font-medium mb-1">
              Appraiser Name
            </label>
            <select
              id="input-appraiser-name"
              value={record.appraiserName}
              onChange={(e) => setRecord({ ...record, appraiserName: e.target.value })}
              className="w-full bg-white text-slate-900 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-2xs cursor-pointer"
            >
              <option value="">Select appraiser…</option>
              {APPRAISERS.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
              {/* Keeps a legacy or externally-entered name visible rather than
                  silently blanking it when the record is reopened. */}
              {record.appraiserName && !APPRAISERS.includes(record.appraiserName as any) && (
                <option value={record.appraiserName}>{record.appraiserName}</option>
              )}
            </select>
          </div>

          {/* Academic Year */}
          <div>
            <label htmlFor="input-academic-year" className="block text-slate-600 font-medium mb-1">
              Academic Year
            </label>
            <select
              id="input-academic-year"
              value={record.academicYear || currentAcademicYear()}
              onChange={(e) => setRecord({ ...record, academicYear: e.target.value })}
              className="w-full p-2 bg-white border border-slate-200 rounded-lg text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 cursor-pointer"
            >
              {ACADEMIC_YEARS.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          {/* Observation Date & Times */}
          <div>
            <label className="block text-slate-600 font-medium mb-1">Observation Date &amp; Timing</label>
            <div className="grid grid-cols-3 gap-1.5">
              <input
                id="input-obs-date"
                type="date"
                value={record.observationDate}
                onChange={(e) => setRecord({ ...record, observationDate: e.target.value })}
                className="bg-white text-slate-900 px-2 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
              />
              <input
                id="input-time-in"
                type="time"
                value={record.timeIn}
                onChange={(e) => setRecord({ ...record, timeIn: e.target.value })}
                className="bg-white text-slate-900 px-2 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                title="Time In"
              />
              <input
                id="input-time-out"
                type="time"
                value={record.timeOut}
                onChange={(e) => setRecord({ ...record, timeOut: e.target.value })}
                className="bg-white text-slate-900 px-2 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                title="Time Out"
              />
            </div>
          </div>
        </div>

        {/* Lesson Topic & Learning Objectives */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100 text-xs">
          <div>
            <label className="block text-slate-600 font-medium mb-1">Observed Lesson Topic / Unit</label>
            <input
              id="input-lesson-topic"
              type="text"
              value={record.lessonTopic}
              onChange={(e) => setRecord({ ...record, lessonTopic: e.target.value })}
              placeholder="e.g. Electromagnetic Induction: Lenz's Law and Induced Currents"
              className="w-full bg-white text-slate-900 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-2xs"
            />
          </div>
          <div>
            <label className="block text-slate-600 font-medium mb-1">Stated Learning Objectives &amp; Success Criteria</label>
            <input
              id="input-learning-objectives"
              type="text"
              value={record.learningObjectives || ''}
              onChange={(e) => setRecord({ ...record, learningObjectives: e.target.value })}
              placeholder="e.g. SWBAT experimentally verify magnetic flux linkage and calculate induced EMF..."
              className="w-full bg-white text-slate-900 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* Capture / Rate switch. The two halves of an observation are different
          jobs done at different moments, and showing both at once is what made
          the sheet feel like forty-four things to do during the lesson. */}
      <div className="bg-white border border-slate-200 rounded-2xl p-2 shadow-sm flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 flex-1">
          <button
            type="button"
            onClick={() => setMode('CAPTURE')}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer min-h-[42px] ${
              mode === 'CAPTURE'
                ? 'bg-white text-indigo-700 shadow-sm border border-indigo-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <PenSquare className="w-4 h-4 shrink-0" />
            <span>1 · Capture the lesson</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('RATE')}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer min-h-[42px] ${
              mode === 'RATE'
                ? 'bg-white text-indigo-700 shadow-sm border border-indigo-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ListChecks className="w-4 h-4 shrink-0" />
            <span>
              2 · Rate the indicators
              <span className="ml-1.5 font-mono font-normal text-[11px] text-slate-500">
                {stats.itemsScored}/{stats.totalItems}
              </span>
            </span>
          </button>
        </div>

        <p className="text-[11px] text-slate-500 px-2 sm:px-3 sm:max-w-[19rem] leading-snug">
          {mode === 'CAPTURE'
            ? 'Write what you see. The rubric comes out afterwards, with these notes beside it.'
            : progress.meetsFloor
            ? 'Enough of the framework is rated for a grade to publish.'
            : `${progress.remaining} more ${
                progress.remaining === 1 ? 'rating' : 'ratings'
              } before a grade can publish.`}
        </p>
      </div>

      {mode === 'CAPTURE' && (
      <>
      {/* Appraiser's Own Lesson Notes & Score-From-Notes Action */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-sm text-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 mt-0.5">
              <NotebookPen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                <span>Appraiser&apos;s Lesson Notes</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {observerNoteWordCount} {observerNoteWordCount === 1 ? 'word' : 'words'}
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Write or paste your own account of the lesson. The auto-grader reads it as evidence
                and cites it back to you paragraph by paragraph.
              </p>
            </div>
          </div>

          <button
            id="btn-score-from-notes"
            type="button"
            onClick={handleTriggerAutoGrade}
            disabled={!hasObserverNotes || isAutoGrading}
            title={
              hasObserverNotes
                ? 'Score the indicators from these notes, together with any activities, transcript and photos captured'
                : 'Write or paste your lesson notes first'
            }
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-teal-600 hover:from-indigo-700 hover:to-teal-700 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-sm min-h-[40px] w-full sm:w-auto shrink-0"
          >
            {isAutoGrading ? (
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            ) : (
              <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
            )}
            <span>{isAutoGrading ? 'Scoring…' : 'Score From Notes'}</span>
          </button>
        </div>

        <textarea
          id="textarea-observer-notes"
          value={record.generalObserverNotes}
          onChange={(e) => setRecord({ ...record, generalObserverNotes: e.target.value })}
          placeholder={
            'Type or paste your notes here, one observation per paragraph, e.g.\n\n' +
            '09:05 Starter on the board, all 28 students on task within two minutes.\n' +
            'Teacher modelled the worked example, then asked "why does the volume change?" and waited before taking answers.\n' +
            'Group task: mixed pairs, two tables needed a second explanation of the success criteria.\n' +
            'Exit ticket collected at the door; three students left without completing it.'
          }
          rows={10}
          className="w-full bg-white text-slate-900 text-xs sm:text-sm p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y shadow-2xs leading-relaxed"
        />

        {/* One tap to open a new stamped line. A moment with a time on it can be
            found again by the teacher, by the report and by the auto-grader;
            the same moment without one is a claim about the lesson in general. */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setRecord((prev) => ({
                ...prev,
                generalObserverNotes: stampTime(prev.generalObserverNotes || ''),
              }));
              requestAnimationFrame(() => {
                const field = document.getElementById(
                  'textarea-observer-notes'
                ) as HTMLTextAreaElement | null;
                if (!field) return;
                field.focus();
                field.setSelectionRange(field.value.length, field.value.length);
                field.scrollTop = field.scrollHeight;
              });
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition cursor-pointer"
          >
            <Timer className="w-3.5 h-3.5 shrink-0" />
            <span>Stamp {clockTime()}</span>
          </button>
          <span className="text-[11px] text-slate-400">
            Starts a new line at the current time.
          </span>
        </div>

        {/* Stated plainly: the button grades from whatever was captured, and
            what it produces is a suggestion until the appraiser confirms it. */}
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Scoring reads these notes alongside any lesson activities, audio transcript and captioned
          photos you have captured. Anything the notes do not speak to is returned as
          <strong className="text-slate-600"> not observable</strong> rather than guessed, and every
          suggested rating stays marked as AI-suggested until you confirm it as your own judgement.
        </p>
      </div>

      {/* Structured Lesson Activities & Observation Timeline */}
      <LessonActivitiesManager
        activities={record.activities || []}
        onChange={(activities) => setRecord((prev) => ({ ...prev, activities }))}
        onTriggerAutoGrade={handleTriggerAutoGrade}
      />

      {/* Live Audio Recorder & AI Analyzer Widget */}
      <AudioLessonRecorder
        // Keyed by record so opening another teacher's observation reseeds the
        // recorder with that teacher's transcript instead of carrying one over.
        key={record.id}
        appraisalId={record.id}
        teacherName={record.teacherName}
        subject={record.subject}
        careerLevel={record.careerLevel}
        gradeClass={record.gradeClass}
        lessonTopic={record.lessonTopic}
        learningObjectives={record.learningObjectives}
        observerNotes={record.generalObserverNotes}
        existingAnalysis={record.aiAnalysis}
        initialTranscript={record.audioTranscription}
        initialSegments={record.transcriptSegments}
        initialAudioClipId={record.audioClipId}
        onAudioCaptured={({ clipId, mimeType, durationSeconds }) => {
          // The clip stays on the device; the observation only learns where
          // to find it, so the record stays small enough to store and sync.
          setRecord((prev) => ({
            ...prev,
            hasAudioRecording: true,
            audioClipId: clipId,
            audioMimeType: mimeType,
            audioDurationSeconds: durationSeconds || prev.audioDurationSeconds,
          }));
        }}
        onTranscriptChange={(transcriptText, segments) => {
          // Held on the record as it is spoken: autosave then writes it to
          // this teacher's observation, so the transcript survives a closed
          // tab or an analysis that is never run.
          setRecord((prev) => ({
            ...prev,
            audioTranscription: transcriptText,
            transcriptSegments: segments,
            hasAudioRecording: prev.hasAudioRecording || segments.length > 0,
          }));
        }}
        onAnalysisComplete={(analysis, transcriptText, segments) => {
          setRecord((prev) => ({
            ...prev,
            hasAudioRecording: true,
            audioTranscription: transcriptText || prev.audioTranscription,
            transcriptSegments: segments?.length ? segments : prev.transcriptSegments,
            aiAnalysis: analysis,
          }));
          setShowAiModal(true);
        }}
      />

      {/* Classroom Photo Evidence & Best Practices */}
      <ClassroomPhotoEvidence
        appraisalId={record.id}
        photos={record.photos || []}
        onChange={(photos) => setRecord((prev) => ({ ...prev, photos }))}
      />

      </>
      )}

      {mode === 'RATE' && (
      <>
      {/* Live F2 Score Summary Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-sm text-slate-800">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Subtotals breakdown grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 flex-1">
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <div className="text-[10px] sm:text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
                A) Pre-Visit
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono text-slate-900 mt-0.5">
                {stats.rawA} <span className="text-xs text-slate-400 font-normal">/ {stats.maxA}</span>
              </div>
            </div>

            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <div className="text-[10px] sm:text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
                B) Live Obs
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono text-slate-900 mt-0.5">
                {stats.rawB} <span className="text-xs text-slate-400 font-normal">/ {stats.maxB}</span>
              </div>
            </div>

            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <div className="text-[10px] sm:text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
                C) Post-Lesson
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono text-slate-900 mt-0.5">
                {stats.rawC} <span className="text-xs text-slate-400 font-normal">/ {stats.maxC}</span>
              </div>
            </div>

            <div className="bg-indigo-50/70 p-2.5 rounded-xl border border-indigo-100">
              <div className="text-[10px] sm:text-[11px] text-indigo-700 uppercase tracking-wider font-bold">
                Total F2 Raw
              </div>
              <div className="text-lg sm:text-xl font-black font-mono text-indigo-700 mt-0.5">
                {stats.totalRaw} <span className="text-xs text-indigo-400 font-normal">/ {stats.maxTotal}</span>
              </div>
            </div>
          </div>

          {/* Indicative Grade Badge. Below the coverage floor the letter is
              withheld and the scope is shown in its place - the sheet should
              never hand back a grade the observation cannot carry. */}
          <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 pt-3 md:pt-0 border-t md:border-t-0 md:border-l md:pl-4 border-slate-100">
            <div className="text-left sm:text-right">
              <div className="text-xs text-slate-700 font-bold">
                {stats.provisional ? 'Provisional Result' : 'Indicative Grade'}
              </div>
              <div className="text-[11px] text-slate-400">
                {stats.provisional
                  ? `${stats.itemsScored} of ${stats.totalItems} rated — ${Math.round(
                      COVERAGE_FLOOR * 100
                    )}% needed for a grade`
                  : `Grade ${stats.grade} (${stats.percentage}% across ${stats.itemsScored} rated)`}
              </div>
            </div>
            <div
              className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center font-black border shadow-sm shrink-0 ${
                stats.provisional
                  ? 'bg-slate-50 text-slate-400 border-slate-200 text-[10px] uppercase tracking-wider font-bold leading-tight text-center'
                  : stats.grade === 'A'
                  ? 'bg-emerald-50 text-emerald-600 border-emerald-200 text-xl sm:text-2xl'
                  : stats.grade === 'B'
                  ? 'bg-indigo-50 text-indigo-600 border-indigo-200 text-xl sm:text-2xl'
                  : stats.grade === 'C'
                  ? 'bg-amber-50 text-amber-600 border-amber-200 text-xl sm:text-2xl'
                  : stats.grade === 'D'
                  ? 'bg-orange-50 text-orange-600 border-orange-200 text-xl sm:text-2xl'
                  : 'bg-rose-50 text-rose-600 border-rose-200 text-xl sm:text-2xl'
              }`}
              title={
                stats.provisional
                  ? 'Too few indicators are rated for a grade to be published'
                  : undefined
              }
            >
              {stats.provisional ? 'N/A' : stats.grade}
            </div>
          </div>
        </div>

        {/* Completion Progress Bar & Score Tools */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs text-slate-500">
          {/* Progress against the coverage floor, not against the whole rubric.
              The number that matters to an appraiser mid-sheet is how many more
              ratings a grade needs, and meeting the floor at the report stage is
              far too late to learn it. */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="shrink-0 font-medium">Progress:</span>
            <div className="flex-1 h-2.5 bg-slate-100 rounded-full relative min-w-[80px]">
              <div
                style={{ width: `${progress.ratedPercent}%` }}
                className={`h-full rounded-full transition-all duration-300 ${
                  progress.meetsFloor ? 'bg-emerald-600' : 'bg-indigo-600'
                }`}
              />
              <div
                style={{ left: `${progress.floorPercent}%` }}
                title={`${progress.needed} of ${progress.total} indicators needed before a grade is published`}
                className="absolute -top-1 bottom-[-4px] w-0.5 bg-slate-500/70 rounded-full"
              />
            </div>
            <span className="font-mono text-slate-800 font-semibold text-[11px] shrink-0 tabular-nums">
              {stats.itemsScored}/{stats.totalItems}
            </span>
            <span
              className={`text-[11px] shrink-0 font-medium hidden sm:inline ${
                progress.meetsFloor ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {progress.meetsFloor
                ? 'grade will publish'
                : `${progress.needed} needed for a grade`}
            </span>
          </div>

          {/* Quick Score Helper Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={handleTriggerAutoGrade}
              className="text-[11px] text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg border border-indigo-200 transition cursor-pointer font-semibold flex items-center gap-1 shrink-0 whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Auto Grade</span>
            </button>
            <button
              type="button"
              onClick={handleClearScores}
              className="text-[11px] text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 rounded-lg border border-rose-200 transition cursor-pointer shrink-0 whitespace-nowrap"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Section Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs overflow-x-auto no-scrollbar scroll-smooth whitespace-nowrap">
          <button
            type="button"
            onClick={() => setActiveSection('ALL')}
            className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg font-medium transition cursor-pointer shrink-0 ${
              activeSection === 'ALL' ? 'bg-indigo-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Items ({currentItems.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('A')}
            className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg font-medium transition cursor-pointer shrink-0 ${
              activeSection === 'A' ? 'bg-indigo-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            A) Pre-Plan ({currentItems.filter((i) => i.section === 'A').length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('B')}
            className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg font-medium transition cursor-pointer shrink-0 ${
              activeSection === 'B' ? 'bg-indigo-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            B) Live Observation ({currentItems.filter((i) => i.section === 'B').length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('C')}
            className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg font-medium transition cursor-pointer shrink-0 ${
              activeSection === 'C' ? 'bg-indigo-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            C) Post-Lesson ({currentItems.filter((i) => i.section === 'C').length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('FEEDBACK')}
            className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg font-bold transition cursor-pointer shrink-0 ${
              activeSection === 'FEEDBACK' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Glow / Grow / Go
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0 overflow-x-auto no-scrollbar">
          {/* "Which ones do I still need?" is the question an appraiser asks
              most often on this screen, and the sheet could not answer it. */}
          {activeSection !== 'FEEDBACK' && (
            <>
              <button
                type="button"
                onClick={() => setUnratedOnly((prev) => !prev)}
                title="Show only the indicators that still need a rating"
                className={`flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border transition cursor-pointer font-semibold shrink-0 ${
                  unratedOnly
                    ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                    : 'text-slate-700 bg-white hover:bg-slate-50 border-slate-200'
                }`}
              >
                <Filter className="w-3.5 h-3.5 shrink-0" />
                <span>Unrated ({unratedCount})</span>
              </button>

              <button
                type="button"
                onClick={() => goToNextUnrated()}
                disabled={unratedCount === 0}
                title="Jump to the next indicator needing a rating"
                className="flex items-center justify-center gap-1.5 text-xs text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-200 px-3 py-1.5 rounded-xl transition cursor-pointer font-semibold shrink-0"
              >
                <ArrowDownToLine className="w-3.5 h-3.5 shrink-0" />
                <span>Next unrated</span>
              </button>
            </>
          )}

          {record.aiAnalysis && (
            <button
              type="button"
              onClick={() => setShowAiModal(true)}
              className="flex items-center justify-center gap-1.5 text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-xl transition cursor-pointer font-semibold shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>View AI Insights</span>
            </button>
          )}
        </div>
      </div>

      {/* The notes taken during the lesson, kept beside the rubric rather than
          a screen away. Rating happens after the lesson, from these. */}
      {activeSection !== 'FEEDBACK' && record.generalObserverNotes?.trim() && (
        <div className="sticky top-2 z-30 bg-white/95 backdrop-blur-md border border-indigo-200 rounded-2xl shadow-sm">
          <button
            type="button"
            onClick={() => setShowNotesPanel((prev) => !prev)}
            className="w-full flex items-center justify-between gap-3 px-4 py-2.5 cursor-pointer"
          >
            <span className="flex items-center gap-2 text-xs font-bold text-indigo-800">
              <NotebookPen className="w-4 h-4 shrink-0" />
              Your lesson notes
            </span>
            {showNotesPanel ? (
              <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            )}
          </button>
          {showNotesPanel && (
            <div className="px-4 pb-3 max-h-44 overflow-y-auto">
              <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                {record.generalObserverNotes}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Observation Items Sheet */}
      {activeSection !== 'FEEDBACK' ? (
        <div className="space-y-4">
          {/* Keyboard rating. Twenty-seven ratings by trackpad is the bulk of
              the work, and the keys let an appraiser keep their eyes up. */}
          <div className="flex items-center gap-2 text-[11px] text-slate-500 px-1">
            <Keyboard className="w-3.5 h-3.5 shrink-0 text-slate-400" />
            <span>
              Click an indicator card, then press{' '}
              <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-[10px]">
                1
              </kbd>
              –
              <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-[10px]">
                4
              </kbd>{' '}
              to rate it and move to the next unrated, or{' '}
              <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-[10px]">
                Enter
              </kbd>{' '}
              to skip.
            </span>
          </div>

          {displayedItems.map((item) => {
            const currentScoreRecord = record.scores[item.id] || { score: null, notes: '' };
            const isRubricExpanded = expandedRubricId === item.id;
            const activeScore = currentScoreRecord.score;

            return (
              <div
                key={item.id}
                id={`item-card-${item.id}`}
                tabIndex={0}
                role="group"
                aria-label={`${item.id} ${item.title}`}
                onKeyDown={(e) => handleCardKeyDown(e, item.id)}
                className={`bg-white border rounded-2xl p-5 shadow-sm transition text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400 ${
                  activeScore === null
                    ? 'border-slate-200 hover:border-slate-300'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  {/* Left: Item Details */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {item.id}
                      </span>
                      <span className="text-xs text-slate-500 font-medium">
                        {item.domainId} • Section {item.section}
                      </span>
                      {item.theoryBasis && (
                        <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-medium">
                          {item.theoryBasis}
                        </span>
                      )}

                      {currentScoreRecord.origin === 'ai-suggested' &&
                        typeof currentScoreRecord.score === 'number' && (
                          <button
                            type="button"
                            onClick={() => handleConfirmSuggestion(item.id)}
                            title="This rating came from the AI. Confirm it as your professional judgement."
                            className="text-[10px] font-bold px-2 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 transition cursor-pointer"
                          >
                            AI SUGGESTED — CONFIRM
                          </button>
                        )}
                      {currentScoreRecord.origin === 'ai-confirmed' && (
                        <span
                          title="AI suggestion, confirmed by the appraiser"
                          className="text-[10px] font-bold px-2 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200"
                        >
                          AI · CONFIRMED
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>

                    <div className="text-xs text-indigo-600 font-medium mt-1">
                      Coaching Focus: {item.coachingFocus}
                    </div>

                    {/* Descriptor Preview.
                        Previously this appeared only once a rating had been
                        chosen, so an appraiser committed first and read the
                        descriptor afterwards. Now it is always showing: the
                        one under the pointer while choosing, the chosen one
                        after, and Proficient as the anchor before either -
                        3 being the standard the rubric is written around. */}
                    {(() => {
                      const previewing =
                        previewDescriptor?.itemId === item.id ? previewDescriptor.score : null;
                      const shown = previewing || activeScore || 3;
                      const isAnchor = !previewing && !activeScore;

                      return (
                        <div
                          className={`mt-2 p-2.5 rounded-xl border text-xs transition ${
                            isAnchor
                              ? 'bg-slate-50/60 border-slate-200 text-slate-500'
                              : 'bg-slate-50 border-slate-200 text-slate-700'
                          }`}
                        >
                          <span
                            className={`font-semibold ${
                              isAnchor ? 'text-slate-600' : 'text-slate-900'
                            }`}
                          >
                            {isAnchor
                              ? 'Standard (3) reads: '
                              : `Rating ${shown} Descriptor: `}
                          </span>
                          {item.descriptors[shown]}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Right: 4-Point Rating Buttons & Rubric Toggle */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0 w-full sm:w-auto">
                    <div className="grid grid-cols-4 gap-1 sm:gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 w-full sm:w-auto">
                      {([1, 2, 3, 4] as const).map((sc) => {
                        const isSelected = activeScore === sc;
                        let btnStyle = 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 bg-white/50';
                        if (isSelected) {
                          if (sc === 4) btnStyle = 'bg-emerald-600 text-white font-bold shadow-sm';
                          else if (sc === 3) btnStyle = 'bg-indigo-600 text-white font-bold shadow-sm';
                          else if (sc === 2) btnStyle = 'bg-amber-500 text-white font-bold shadow-sm';
                          else btnStyle = 'bg-rose-600 text-white font-bold shadow-sm';
                        }
                        return (
                          <button
                            key={sc}
                            id={`btn-score-${item.id}-${sc}`}
                            type="button"
                            onClick={() => handleSetScore(item.id, sc)}
                            onMouseEnter={() => setPreviewDescriptor({ itemId: item.id, score: sc })}
                            onMouseLeave={() => setPreviewDescriptor(null)}
                            onFocus={() => setPreviewDescriptor({ itemId: item.id, score: sc })}
                            onBlur={() => setPreviewDescriptor(null)}
                            className={`h-11 sm:h-10 sm:w-11 rounded-lg text-xs font-semibold transition flex flex-col items-center justify-center cursor-pointer min-w-[44px] ${btnStyle}`}
                            title={`Rate ${sc} - ${
                              sc === 4
                                ? 'Distinguished'
                                : sc === 3
                                ? 'Proficient'
                                : sc === 2
                                ? 'Basic'
                                : 'Unsatisfactory'
                            }`}
                          >
                            <span className="text-sm sm:text-xs font-bold leading-none">{sc}</span>
                            <span className="text-[9px] opacity-85 leading-none mt-0.5">
                              {sc === 4 ? 'Dist' : sc === 3 ? 'Prof' : sc === 2 ? 'Basic' : 'Unsat'}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandedRubricId(isRubricExpanded ? null : item.id)}
                      className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium border border-slate-200 transition flex items-center justify-center gap-1 cursor-pointer min-h-[44px] sm:min-h-[40px]"
                    >
                      <span>Rubric</span>
                      {isRubricExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Rubric Expansion Drawer */}
                {isRubricExpanded && (
                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                      {([4, 3, 2, 1] as const).map((sc) => {
                        const isSelected = activeScore === sc;
                        return (
                          <div
                            key={sc}
                            onClick={() => handleSetScore(item.id, sc)}
                            className={`p-3.5 rounded-xl border transition cursor-pointer ${
                              isSelected
                                ? sc === 4
                                  ? 'bg-emerald-600 border-emerald-700 text-white shadow-sm'
                                  : sc === 3
                                  ? 'bg-indigo-600 border-indigo-700 text-white shadow-sm'
                                  : sc === 2
                                  ? 'bg-amber-50 border-amber-300 text-slate-900 ring-1 ring-amber-400'
                                  : 'bg-rose-50 border-rose-300 text-slate-900 ring-1 ring-rose-400'
                                : 'bg-slate-50/70 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                            }`}
                          >
                            <div className="font-bold mb-1 flex items-center justify-between">
                              <span
                                className={
                                  isSelected
                                    ? sc === 4 || sc === 3
                                      ? 'text-white'
                                      : sc === 2
                                      ? 'text-amber-800'
                                      : 'text-rose-800'
                                    : sc === 4
                                    ? 'text-emerald-700'
                                    : sc === 3
                                    ? 'text-indigo-700'
                                    : sc === 2
                                    ? 'text-amber-700'
                                    : 'text-rose-700'
                                }
                              >
                                {sc} — {sc === 4 ? 'Distinguished' : sc === 3 ? 'Proficient' : sc === 2 ? 'Basic' : 'Unsatisfactory'}
                              </span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-current" />}
                            </div>
                            <p className={`leading-snug text-[11px] ${isSelected && (sc === 4 || sc === 3) ? 'text-indigo-100' : 'text-slate-600'}`}>
                              {item.descriptors[sc]}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Guided Grow / Go prompts */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs flex flex-col sm:flex-row gap-3">
                      <div className="flex-1">
                        <span className="text-amber-700 font-bold block mb-0.5">Grow Reflective Question:</span>
                        <p className="text-slate-700 italic">&ldquo;{item.growPrompt}&rdquo;</p>
                      </div>
                      <div className="flex-1">
                        <span className="text-indigo-700 font-bold block mb-0.5">Go Action Commitment:</span>
                        <p className="text-slate-700">{item.goPrompt}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Evidence & Appraiser Notes Field */}
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    {/* Evidence is a sentence, not a phrase. This was a
                        single-line input that scrolled sideways, which quietly
                        taught appraisers to write three words or nothing - and
                        three words is what leaves an indicator uncitable. */}
                    <textarea
                      id={`notes-input-${item.id}`}
                      value={currentScoreRecord.notes}
                      onChange={(e) => {
                        handleUpdateNotes(item.id, e.target.value);
                        autoGrow(e.target);
                      }}
                      ref={(el) => el && autoGrow(el)}
                      rows={2}
                      placeholder={`What you saw that evidences ${item.id} — quote it if you can.`}
                      className="w-full bg-white text-slate-900 text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs resize-y leading-relaxed min-h-[3.25rem]"
                    />

                    <div className="flex items-center gap-2 mt-1.5">
                      <label
                        htmlFor={`evidence-src-${item.id}`}
                        className="text-[10px] text-slate-500 font-medium shrink-0"
                      >
                        Evidence source
                      </label>
                      <select
                        id={`evidence-src-${item.id}`}
                        value={currentScoreRecord.evidenceSource || 'Live Classroom Observation'}
                        onChange={(e) => handleUpdateEvidenceSource(item.id, e.target.value as EvidenceSource)}
                        className="text-[10px] px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 outline-none cursor-pointer focus:border-indigo-400"
                      >
                        {EVIDENCE_SOURCES.map((src) => (
                          <option key={src} value={src}>{src}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Evidence prompts and a time stamp.
                      These buttons used to append finished tokens - "[High
                      Engagement]" - which read as evidence while stating
                      nothing, and nothing downstream could tell that from an
                      observation. They now open a phrase the appraiser
                      finishes in their own words. */}
                  <div className="flex sm:flex-col items-stretch gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        handleUpdateNotes(item.id, stampTime(currentScoreRecord.notes));
                        focusNotes(item.id);
                      }}
                      title="Stamp the current time on a new line"
                      className="flex items-center justify-center gap-1 text-[10px] text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-1.5 rounded-lg border border-slate-200 transition cursor-pointer whitespace-nowrap"
                    >
                      <Timer className="w-3 h-3 shrink-0" />
                      {clockTime()}
                    </button>

                    {EVIDENCE_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => {
                          handleUpdateNotes(
                            item.id,
                            appendEvidenceStem(currentScoreRecord.notes, prompt)
                          );
                          focusNotes(item.id);
                        }}
                        title={`Start an evidence note about ${prompt.toLowerCase()}`}
                        className="text-[10px] text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-1.5 rounded-lg border border-slate-200 transition cursor-pointer whitespace-nowrap"
                      >
                        {prompt}…
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Glow / Grow / Go Protocol Tab */
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6 text-slate-800">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              {t('ggg.title')}
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                {t('ggg.badge')}
              </span>
            </h2>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                Structured feedback grounded in observed rubric evidence, reflective developmental
                questions, and agreed time-bound next steps. Up to {MAX_FEEDBACK_ITEMS} entries per
                column, so the debrief stays short enough to discuss.
              </p>
              <button
                type="button"
                onClick={handleGenerateFeedback}
                className="flex items-center gap-2 px-4 py-2 bg-[#165963] hover:bg-[#11474f] text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-sm whitespace-nowrap"
                title="Build Glow / Grow / Go from the indicator ratings you have given"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {t('action.generate')}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Glow */}
            <div className="bg-emerald-50/40 p-4 rounded-xl border border-emerald-200 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    Glow (Observed Strengths)
                  </span>
                  <span className="text-xs text-emerald-600 font-medium">{record.feedback.glow.length} / {MAX_FEEDBACK_ITEMS}</span>
                </div>

                <div className="space-y-2 mb-4">
                  {record.feedback.glow.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-white border border-emerald-200 rounded-lg text-xs text-emerald-950 flex items-start justify-between gap-2 shadow-2xs"
                    >
                      <span>{item}</span>
                      <button
                        type="button"
                        onClick={() => removeFeedbackItem('glow', idx)}
                        className="text-slate-400 hover:text-rose-600 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add Glow */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newGlow}
                  onChange={(e) => setNewGlow(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addGlow()}
                  placeholder={feedbackFull('glow') ? `Maximum ${MAX_FEEDBACK_ITEMS} entries reached` : 'Add specific strength with descriptor evidence...'}
                  disabled={feedbackFull('glow')}
                  className="flex-1 bg-white text-xs text-slate-900 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                />
                <button
                  type="button"
                  onClick={addGlow}
                  disabled={feedbackFull('glow')}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Grow */}
            <div className="bg-amber-50/40 p-4 rounded-xl border border-amber-200 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    Grow (Reflective Questions)
                  </span>
                  <span className="text-xs text-amber-600 font-medium">{record.feedback.grow.length} / {MAX_FEEDBACK_ITEMS}</span>
                </div>

                <div className="space-y-2 mb-4">
                  {record.feedback.grow.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-white border border-amber-200 rounded-lg text-xs text-amber-950 flex items-start justify-between gap-2 shadow-2xs"
                    >
                      <span>{item}</span>
                      <button
                        type="button"
                        onClick={() => removeFeedbackItem('grow', idx)}
                        className="text-slate-400 hover:text-rose-600 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add Grow */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newGrow}
                  onChange={(e) => setNewGrow(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addGrow()}
                  placeholder={feedbackFull('grow') ? `Maximum ${MAX_FEEDBACK_ITEMS} entries reached` : 'Add developmental reflective question...'}
                  disabled={feedbackFull('grow')}
                  className="flex-1 bg-white text-xs text-slate-900 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                />
                <button
                  type="button"
                  onClick={addGrow}
                  disabled={feedbackFull('grow')}
                  className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Go */}
            <div className="bg-indigo-50/40 p-4 rounded-xl border border-indigo-200 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-indigo-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                    Go (Agreed Next Steps)
                  </span>
                  <span className="text-xs text-indigo-600 font-medium">{record.feedback.go.length} / {MAX_FEEDBACK_ITEMS}</span>
                </div>

                <div className="space-y-2 mb-4">
                  {record.feedback.go.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-white border border-indigo-200 rounded-lg text-xs text-indigo-950 flex items-start justify-between gap-2 shadow-2xs"
                    >
                      <span>{item}</span>
                      <button
                        type="button"
                        onClick={() => removeFeedbackItem('go', idx)}
                        className="text-slate-400 hover:text-rose-600 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add Go */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newGo}
                  onChange={(e) => setNewGo(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addGo()}
                  placeholder={feedbackFull('go') ? `Maximum ${MAX_FEEDBACK_ITEMS} entries reached` : 'Add concrete time-bound next step...'}
                  disabled={feedbackFull('go')}
                  className="flex-1 bg-white text-xs text-slate-900 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                />
                <button
                  type="button"
                  onClick={addGo}
                  disabled={feedbackFull('go')}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Post-Conference Notes. The observation narrative itself is written
              in the Appraiser's Lesson Notes card at the top of the sheet, which
              stays on screen in every tab - it is the same field, kept in one
              place so notes and the report narrative can never diverge. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Post-Conference Discussion &amp; Professional Growth Agreement
              </label>
              <textarea
                id="textarea-post-conference"
                value={record.postConferenceDiscussionSummary || ''}
                onChange={(e) => setRecord({ ...record, postConferenceDiscussionSummary: e.target.value })}
                placeholder="Key dialogue points from post-observation debriefing, teacher reflections, and leadership commitments..."
                rows={4}
                className="w-full bg-white text-slate-900 text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y shadow-2xs"
              />
            </div>

            {/* Teacher acknowledgement and right of reply. An appraisal that
                feeds progression decisions should record that the teacher saw
                it and had the chance to respond. */}
            <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Teacher Acknowledgement &amp; Right of Reply
              </label>
              <p className="text-[11px] text-slate-500 mb-2.5">
                Records that the teacher has seen this appraisal and may respond. A disagreement
                is recorded, not overwritten.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="ack-status"
                    className="block text-[11px] font-medium text-slate-600 mb-1"
                  >
                    Status
                  </label>
                  <select
                    id="ack-status"
                    value={record.teacherAcknowledgement?.status || 'Pending'}
                    onChange={(e) =>
                      setRecord({
                        ...record,
                        teacherAcknowledgement: {
                          ...(record.teacherAcknowledgement || {}),
                          status: e.target.value as NonNullable<
                            TeacherAppraisalRecord['teacherAcknowledgement']
                          >['status'],
                          date:
                            e.target.value === 'Pending'
                              ? undefined
                              : record.teacherAcknowledgement?.date ||
                                new Date().toISOString().substring(0, 10),
                        },
                      })
                    }
                    className="w-full bg-white text-slate-900 text-xs p-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="Pending">Pending — not yet shared with the teacher</option>
                    <option value="Acknowledged">Acknowledged</option>
                    <option value="Acknowledged with comment">Acknowledged with comment</option>
                    <option value="Disagrees">Disagrees</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="ack-date"
                    className="block text-[11px] font-medium text-slate-600 mb-1"
                  >
                    Date acknowledged
                  </label>
                  <input
                    id="ack-date"
                    type="date"
                    value={record.teacherAcknowledgement?.date || ''}
                    onChange={(e) =>
                      setRecord({
                        ...record,
                        teacherAcknowledgement: {
                          status: record.teacherAcknowledgement?.status || 'Acknowledged',
                          ...record.teacherAcknowledgement,
                          date: e.target.value,
                        },
                      })
                    }
                    className="w-full bg-white text-slate-900 text-xs p-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <label
                htmlFor="ack-comment"
                className="block text-[11px] font-medium text-slate-600 mt-3 mb-1"
              >
                Teacher&apos;s comment (optional)
              </label>
              <textarea
                id="ack-comment"
                value={record.teacherAcknowledgement?.comment || ''}
                onChange={(e) =>
                  setRecord({
                    ...record,
                    teacherAcknowledgement: {
                      status: record.teacherAcknowledgement?.status || 'Acknowledged with comment',
                      ...record.teacherAcknowledgement,
                      comment: e.target.value,
                    },
                  })
                }
                placeholder="The teacher's own words — agreement, clarification, or a point of disagreement."
                rows={3}
                className="w-full bg-white text-slate-900 text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y shadow-2xs"
              />
            </div>
          </div>
        </div>
      )}
      </>
      )}

      {/* Floating Bottom Action Bar */}
      <div className="sticky bottom-4 z-40 bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-4 text-slate-800">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="text-xs">
            <span className="text-slate-500">{t('sheet.attainment')}: </span>
            <strong className="text-indigo-600 font-mono text-sm">
              {stats.totalRaw}/{stats.maxRated} ({stats.percentage}%)
            </strong>
          </div>
          <span className="text-slate-300">|</span>
          <div className="text-xs">
            <span className="text-slate-500">{t('sheet.indicativeReading')}: </span>
            {stats.provisional ? (
              <strong className="text-slate-500 font-bold">Provisional</strong>
            ) : (
              <strong className="text-emerald-600 font-bold">
                {t('sheet.grade')} {stats.grade}
              </strong>
            )}
          </div>
          <span className="text-slate-300">|</span>

          {/* Completeness is stated, never hidden: attainment is measured only
              across rated indicators, so the reader must see how many that is. */}
          <div className="text-xs">
            <span className="text-slate-500">{t('sheet.rated')}: </span>
            <strong
              className={`font-mono ${
                stats.isComplete ? 'text-emerald-600' : 'text-amber-600'
              }`}
            >
              {stats.itemsScored}/{stats.totalItems}
            </strong>
            {!stats.isComplete && (
              <span className="text-[10px] text-slate-400 ml-1">
                ({stats.totalItems - stats.itemsScored} {t('sheet.notEvidenced')})
              </span>
            )}
          </div>

          {pendingSuggestions > 0 && (
            <>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={handleConfirmAllSuggestions}
                className="text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 transition cursor-pointer"
                title="Accept every AI suggestion as your professional judgement"
              >
                {pendingSuggestions} {t('sheet.aiToConfirm')}
              </button>
            </>
          )}

          <span className="text-slate-300">|</span>
          <span className="text-[10px] text-slate-400">
            {autoSaveState === 'saving'
              ? t('sheet.saving')
              : autoSaveState === 'saved'
              ? t('sheet.autosaved')
              : autoSaveState === 'error'
              ? t('sheet.autosaveFailed')
              : ''}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleSaveClick('Draft')}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium transition cursor-pointer"
          >
            {t('action.saveDraft')}
          </button>
          <button
            type="button"
            onClick={() => handleSaveClick('Observation Saved')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition shadow-sm cursor-pointer"
          >
            {t('sheet.saveSession')}
          </button>
          <button
            type="button"
            onClick={() => handleSaveClick('Finalized (Conference Complete)')}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition shadow-sm cursor-pointer"
          >
            {t('sheet.finalize')}
          </button>
        </div>
      </div>

      {/* AI Analysis Modal */}
      <AiAnalysisModal
        analysis={record.aiAnalysis || null}
        isOpen={showAiModal}
        onClose={() => setShowAiModal(false)}
        careerLevel={record.careerLevel}
        onApplyScores={handleApplyAiScores}
        onApplyFeedback={handleApplyAiFeedback}
      />

      {/* Auto-Grade Modal */}
      <AutoGradeModal
        isOpen={showAutoGradeModal}
        onClose={() => setShowAutoGradeModal(false)}
        isLoading={isAutoGrading}
        result={autoGradeResult}
        careerLevel={record.careerLevel}
        onApplyAll={handleApplyAllAutoGrade}
      />
    </div>
  );
};
