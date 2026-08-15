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
  ACADEMIC_YEARS,
  EVIDENCE_SOURCES,
  EvidenceSource,
  ItemScoreRecord,
  currentAcademicYear,
} from '../types';
import {
  getItemsForLevel,
  calculateF2Scores,
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
  const [record, setRecord] = useState<TeacherAppraisalRecord>(initialRecord);
  const [activeSection, setActiveSection] = useState<'ALL' | 'A' | 'B' | 'C' | 'FEEDBACK'>('ALL');
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
    setRecord(initialRecord);
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

  // Trigger Auto-Grading Engine
  const handleTriggerAutoGrade = async () => {
    setIsAutoGrading(true);
    setShowAutoGradeModal(true);
    try {
      const result = await executeAutoGrade(record);
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
        feedback: feedback
          ? {
              glow: Array.from(new Set([...prev.feedback.glow, ...feedback.glow])),
              grow: Array.from(new Set([...prev.feedback.grow, ...feedback.grow])),
              go: Array.from(new Set([...prev.feedback.go, ...feedback.go])),
            }
          : prev.feedback,
      };
    });
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

  // Quick fill all visible items with score (e.g. 3)
  const handleQuickFill = (score: 1 | 2 | 3 | 4) => {
    const updated = { ...record.scores };
    currentItems.forEach((item) => {
      if (!updated[item.id] || updated[item.id].score === null) {
        updated[item.id] = {
          ...(updated[item.id] || {}),
          score,
          notes: updated[item.id]?.notes || `Meets standard descriptor for level ${score}.`,
        };
      }
    });
    setRecord((prev) => ({ ...prev, scores: updated }));
  };

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
        glow: Array.from(new Set([...prev.feedback.glow, ...glow])),
        grow: Array.from(new Set([...prev.feedback.grow, ...grow])),
        go: Array.from(new Set([...prev.feedback.go, ...go])),
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

  // Add Glow / Grow / Go items
  const addGlow = () => {
    if (!newGlow.trim()) return;
    setRecord((prev) => ({
      ...prev,
      feedback: { ...prev.feedback, glow: [...prev.feedback.glow, newGlow.trim()] },
    }));
    setNewGlow('');
  };

  const addGrow = () => {
    if (!newGrow.trim()) return;
    setRecord((prev) => ({
      ...prev,
      feedback: { ...prev.feedback, grow: [...prev.feedback.grow, newGrow.trim()] },
    }));
    setNewGrow('');
  };

  const addGo = () => {
    if (!newGo.trim()) return;
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

  // Filter items by section
  const displayedItems = currentItems.filter((item) => {
    if (activeSection === 'ALL') return true;
    return item.section === activeSection;
  });

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
            <label className="block text-slate-600 font-medium mb-1">Appraiser Name &amp; Title</label>
            <input
              id="input-appraiser-name"
              type="text"
              value={record.appraiserName}
              onChange={(e) => setRecord({ ...record, appraiserName: e.target.value })}
              placeholder="e.g. Dr. Arthur Pendelton"
              className="w-full bg-white text-slate-900 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-2xs"
            />
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

      {/* Structured Lesson Activities & Observation Timeline */}
      <LessonActivitiesManager
        activities={record.activities || []}
        onChange={(activities) => setRecord((prev) => ({ ...prev, activities }))}
        onTriggerAutoGrade={handleTriggerAutoGrade}
      />

      {/* Live Audio Recorder & AI Analyzer Widget */}
      <AudioLessonRecorder
        teacherName={record.teacherName}
        subject={record.subject}
        careerLevel={record.careerLevel}
        gradeClass={record.gradeClass}
        lessonTopic={record.lessonTopic}
        learningObjectives={record.learningObjectives}
        observerNotes={record.generalObserverNotes}
        existingAnalysis={record.aiAnalysis}
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
        photos={record.photos || []}
        onChange={(photos) => setRecord((prev) => ({ ...prev, photos }))}
      />

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

          {/* Indicative Grade Badge */}
          <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 pt-3 md:pt-0 border-t md:border-t-0 md:border-l md:pl-4 border-slate-100">
            <div className="text-left sm:text-right">
              <div className="text-xs text-slate-700 font-bold">Indicative Grade</div>
              <div className="text-[11px] text-slate-400">
                Grade {stats.grade} ({Math.round((stats.totalRaw / (stats.maxTotal || 1)) * 100)}%)
              </div>
            </div>
            <div
              className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center font-black text-xl sm:text-2xl border shadow-sm shrink-0 ${
                stats.grade === 'A'
                  ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                  : stats.grade === 'B'
                  ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                  : stats.grade === 'C'
                  ? 'bg-amber-50 text-amber-600 border-amber-200'
                  : stats.grade === 'D'
                  ? 'bg-orange-50 text-orange-600 border-orange-200'
                  : 'bg-rose-50 text-rose-600 border-rose-200'
              }`}
            >
              {stats.grade}
            </div>
          </div>
        </div>

        {/* Completion Progress Bar & Score Tools */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2 flex-1">
            <span className="shrink-0 font-medium">Progress:</span>
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                style={{ width: `${(stats.itemsScored / (stats.totalItems || 1)) * 100}%` }}
                className="h-full bg-indigo-600 transition-all duration-300"
              />
            </div>
            <span className="font-mono text-slate-800 font-semibold text-[11px] shrink-0">
              {stats.itemsScored}/{stats.totalItems}
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
              onClick={() => handleQuickFill(3)}
              className="text-[11px] text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-200 transition cursor-pointer shrink-0 whitespace-nowrap"
            >
              Fill Proficient (3)
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

      {/* Observation Items Sheet */}
      {activeSection !== 'FEEDBACK' ? (
        <div className="space-y-4">
          {displayedItems.map((item) => {
            const currentScoreRecord = record.scores[item.id] || { score: null, notes: '' };
            const isRubricExpanded = expandedRubricId === item.id;
            const activeScore = currentScoreRecord.score;

            return (
              <div
                key={item.id}
                id={`item-card-${item.id}`}
                className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm transition hover:border-slate-300 text-slate-800"
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

                    {/* Active Descriptor Preview */}
                    {activeScore && (
                      <div className="mt-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700">
                        <span className="font-semibold text-slate-900">
                          Rating {activeScore} Descriptor:{' '}
                        </span>
                        {item.descriptors[activeScore]}
                      </div>
                    )}
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
                    <input
                      id={`notes-input-${item.id}`}
                      type="text"
                      value={currentScoreRecord.notes}
                      onChange={(e) => handleUpdateNotes(item.id, e.target.value)}
                      placeholder={`Observable evidence and appraiser notes for ${item.id}...`}
                      className="w-full bg-white text-slate-900 text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
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

                  {/* Quick Evidence Tags */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateNotes(
                          item.id,
                          (currentScoreRecord.notes ? currentScoreRecord.notes + ' ' : '') + '[High Engagement]'
                        )
                      }
                      className="text-[10px] text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-1.5 rounded-lg border border-slate-200 transition cursor-pointer"
                    >
                      + Engagement
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateNotes(
                          item.id,
                          (currentScoreRecord.notes ? currentScoreRecord.notes + ' ' : '') + '[Misconception Addressed]'
                        )
                      }
                      className="text-[10px] text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-1.5 rounded-lg border border-slate-200 transition cursor-pointer"
                    >
                      + Misconception
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateNotes(
                          item.id,
                          (currentScoreRecord.notes ? currentScoreRecord.notes + ' ' : '') + '[CALP Precision]'
                        )
                      }
                      className="text-[10px] text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-1.5 rounded-lg border border-slate-200 transition cursor-pointer"
                    >
                      + CALP
                    </button>
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
              The Glow / Grow / Go Post-Observation Protocol
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                Official Eduversal Debriefing
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Structured feedback grounded in observed rubric evidence, reflective developmental questions, and agreed time-bound next steps.
            </p>
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
                  <span className="text-xs text-emerald-600 font-medium">{record.feedback.glow.length} entries</span>
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
                  placeholder="Add specific strength with descriptor evidence..."
                  className="flex-1 bg-white text-xs text-slate-900 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                />
                <button
                  type="button"
                  onClick={addGlow}
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
                  <span className="text-xs text-amber-600 font-medium">{record.feedback.grow.length} entries</span>
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
                  placeholder="Add developmental reflective question..."
                  className="flex-1 bg-white text-xs text-slate-900 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                />
                <button
                  type="button"
                  onClick={addGrow}
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
                  <span className="text-xs text-indigo-600 font-medium">{record.feedback.go.length} entries</span>
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
                  placeholder="Add concrete time-bound next step..."
                  className="flex-1 bg-white text-xs text-slate-900 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                />
                <button
                  type="button"
                  onClick={addGo}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* General Observer Summary & Post-Conference Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                General Classroom Observation Summary
              </label>
              <textarea
                id="textarea-observer-notes"
                value={record.generalObserverNotes}
                onChange={(e) => setRecord({ ...record, generalObserverNotes: e.target.value })}
                placeholder="Comprehensive pedagogical narrative of lesson flow, student engagement, and instructional highlights..."
                rows={4}
                className="w-full bg-white text-slate-900 text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y shadow-2xs"
              />
            </div>

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

      {/* Floating Bottom Action Bar */}
      <div className="sticky bottom-4 z-40 bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-4 text-slate-800">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="text-xs">
            <span className="text-slate-500">F2 Attainment: </span>
            <strong className="text-indigo-600 font-mono text-sm">
              {stats.totalRaw}/{stats.maxRated} ({stats.percentage}%)
            </strong>
          </div>
          <span className="text-slate-300">|</span>
          <div className="text-xs">
            <span className="text-slate-500">Indicative Reading: </span>
            <strong className="text-emerald-600 font-bold">Grade {stats.grade}</strong>
          </div>
          <span className="text-slate-300">|</span>

          {/* Completeness is stated, never hidden: attainment is measured only
              across rated indicators, so the reader must see how many that is. */}
          <div className="text-xs">
            <span className="text-slate-500">Rated: </span>
            <strong
              className={`font-mono ${
                stats.isComplete ? 'text-emerald-600' : 'text-amber-600'
              }`}
            >
              {stats.itemsScored}/{stats.totalItems}
            </strong>
            {!stats.isComplete && (
              <span className="text-[10px] text-slate-400 ml-1">
                ({stats.totalItems - stats.itemsScored} not evidenced)
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
                {pendingSuggestions} AI rating{pendingSuggestions === 1 ? '' : 's'} to confirm
              </button>
            </>
          )}

          <span className="text-slate-300">|</span>
          <span className="text-[10px] text-slate-400">
            {autoSaveState === 'saving'
              ? 'Saving…'
              : autoSaveState === 'saved'
              ? 'Draft autosaved'
              : autoSaveState === 'error'
              ? 'Autosave failed — use Save'
              : ''}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleSaveClick('Draft')}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium transition cursor-pointer"
          >
            Save as Draft
          </button>
          <button
            type="button"
            onClick={() => handleSaveClick('Observation Saved')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition shadow-sm cursor-pointer"
          >
            Save Observation Session
          </button>
          <button
            type="button"
            onClick={() => handleSaveClick('Finalized (Conference Complete)')}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition shadow-sm cursor-pointer"
          >
            Finalize &amp; Close Session
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
