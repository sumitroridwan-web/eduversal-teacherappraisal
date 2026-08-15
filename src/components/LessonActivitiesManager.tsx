import React, { useState } from 'react';
import {
  Clock,
  Plus,
  Trash2,
  Edit3,
  Layers,
  Sparkles,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  MoveUp,
  MoveDown,
  BookOpen,
  Copy,
  Users,
  UserCheck,
  HelpCircle,
} from 'lucide-react';
import { LessonActivity } from '../types';

interface LessonActivitiesManagerProps {
  activities: LessonActivity[];
  onChange: (activities: LessonActivity[]) => void;
  onTriggerAutoGrade?: () => void;
}

const PRESET_ACTIVITY_NAMES = [
  'Hook / Apperception & Prior Knowledge Activation',
  'Learning Intentions & Success Criteria Shared',
  'Direct Instruction & Concept Modeling (I Do)',
  'Guided Practice & Collaborative Problem Solving (We Do)',
  'Independent Practice & Applied Task (You Do)',
  'Think-Pair-Share & Peer Review Discussion',
  'Differentiated Group Stations / Tiered Activities',
  'Hands-on Lab Investigation / Practical Work',
  'Formative Assessment Check / Mini-Whiteboard Quiz',
  'Plenary, Exit Ticket & Lesson Consolidation',
];

const MODALITY_OPTIONS = [
  'Whole Class Teacher-Led',
  'Collaborative Group Work',
  'Individual Independent Task',
  'Pair Share / Discussion',
  'Formative Assessment / Quiz',
  'Hands-on Lab / Experiment',
  'Student Presentation / Seminar',
] as const;

export const LessonActivitiesManager: React.FC<LessonActivitiesManagerProps> = ({
  activities = [],
  onChange,
  onTriggerAutoGrade,
}) => {
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState<boolean>(false);
  const [expandedActivityIds, setExpandedActivityIds] = useState<Record<string, boolean>>({});

  // New activity form fields
  const [name, setName] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number>(10);
  const [timeRange, setTimeRange] = useState('');
  const [modality, setModality] = useState<LessonActivity['modality']>('Whole Class Teacher-Led');
  const [teacherNotes, setTeacherNotes] = useState('');
  const [studentEvidenceNotes, setStudentEvidenceNotes] = useState('');

  const toggleExpand = (id: string) => {
    setExpandedActivityIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleOpenAddForm = () => {
    setName('');
    setDurationMinutes(10);
    setTimeRange('');
    setModality('Whole Class Teacher-Led');
    setTeacherNotes('');
    setStudentEvidenceNotes('');
    setIsAddingNew(true);
    setEditingActivityId(null);
  };

  const handleEditActivity = (act: LessonActivity) => {
    setEditingActivityId(act.id);
    setName(act.name);
    setDurationMinutes(act.durationMinutes || 10);
    setTimeRange(act.timeRange || '');
    setModality(act.modality || 'Whole Class Teacher-Led');
    setTeacherNotes(act.teacherNotes || '');
    setStudentEvidenceNotes(act.studentEvidenceNotes || '');
    setIsAddingNew(false);
  };

  const handleSaveActivity = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim()) return;

    if (editingActivityId) {
      // Update existing
      const updated = activities.map((act) =>
        act.id === editingActivityId
          ? {
              ...act,
              name: name.trim(),
              durationMinutes: Number(durationMinutes) || 10,
              timeRange: timeRange.trim(),
              modality,
              teacherNotes: teacherNotes.trim(),
              studentEvidenceNotes: studentEvidenceNotes.trim(),
            }
          : act
      );
      onChange(updated);
      setEditingActivityId(null);
    } else {
      // Add new
      const newActivity: LessonActivity = {
        id: `act-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        name: name.trim(),
        durationMinutes: Number(durationMinutes) || 10,
        timeRange: timeRange.trim(),
        modality,
        teacherNotes: teacherNotes.trim(),
        studentEvidenceNotes: studentEvidenceNotes.trim(),
      };
      onChange([...activities, newActivity]);
      setIsAddingNew(false);
    }

    // Reset fields
    setName('');
    setTeacherNotes('');
    setStudentEvidenceNotes('');
  };

  const handleDeleteActivity = (id: string) => {
    onChange(activities.filter((act) => act.id !== id));
    if (editingActivityId === id) setEditingActivityId(null);
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= activities.length) return;
    const newItems = [...activities];
    const [moved] = newItems.splice(index, 1);
    newItems.splice(targetIndex, 0, moved);
    onChange(newItems);
  };

  // Quick Template: Standard 5-Phase Lesson
  const handleLoadStandardTemplate = () => {
    if (
      activities.length > 0 &&
      !window.confirm('Replace current activity list with the Standard 5-Phase Lesson template?')
    ) {
      return;
    }

    const template: LessonActivity[] = [
      {
        id: `act-1-${Date.now()}`,
        name: 'Hook / Apperception & Prior Knowledge Activation',
        durationMinutes: 7,
        timeRange: '08:00 - 08:07',
        modality: 'Whole Class Teacher-Led',
        teacherNotes: 'Teacher presents an engaging real-world problem / demonstration to activate prior concepts and probes student readiness.',
        studentEvidenceNotes: 'Students actively respond with prior knowledge; teacher clarifies initial entry points.',
      },
      {
        id: `act-2-${Date.now()}`,
        name: 'Direct Concept Modeling & Instruction (I Do)',
        durationMinutes: 15,
        timeRange: '08:07 - 08:22',
        modality: 'Whole Class Teacher-Led',
        teacherNotes: 'Teacher explicitly models the step-by-step problem-solving strategy, introduces subject CALP terminology, and thinks aloud.',
        studentEvidenceNotes: 'Students take structured Cornell notes and answer targeted Bloom analysis questions.',
      },
      {
        id: `act-3-${Date.now()}`,
        name: 'Guided Practice & Collaborative Problem Solving (We Do)',
        durationMinutes: 20,
        timeRange: '08:22 - 08:42',
        modality: 'Collaborative Group Work',
        teacherNotes: 'Teacher circulates with tiered scaffolding, prompts peer inquiry, and conducts formative checks on intermediate solutions.',
        studentEvidenceNotes: 'Students work in triads using academic discourse, justify their reasoning, and check partner work.',
      },
      {
        id: `act-4-${Date.now()}`,
        name: 'Independent Mastery Task & Differentiated Application (You Do)',
        durationMinutes: 20,
        timeRange: '08:42 - 09:02',
        modality: 'Individual Independent Task',
        teacherNotes: 'Teacher monitors individual execution, gives immediate targeted feedback, and provides extension tasks for advanced learners.',
        studentEvidenceNotes: 'High on-task focus; students apply criteria independently to solve multi-step problems.',
      },
      {
        id: `act-5-${Date.now()}`,
        name: 'Plenary & Formative Exit Ticket (Closure)',
        durationMinutes: 8,
        timeRange: '09:02 - 09:10',
        modality: 'Formative Assessment / Quiz',
        teacherNotes: 'Teacher conducts exit ticket check and facilitates student synthesis against stated learning intentions.',
        studentEvidenceNotes: 'Students complete digital/paper exit ticket and articulate key conceptual takeaways.',
      },
    ];

    onChange(template);
  };

  const totalDuration = activities.reduce((acc, curr) => acc + (curr.durationMinutes || 0), 0);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-slate-800 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-[#165963] shrink-0 mt-0.5">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2 flex-wrap">
              <span>Lesson Activities &amp; Timeline</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                {activities.length} {activities.length === 1 ? 'Phase' : 'Phases'} ({totalDuration} mins)
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Record structured activity phases, teacher actions, and student evidence to power AI coaching.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleLoadStandardTemplate}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-xl border border-slate-200 transition cursor-pointer shadow-2xs min-h-[38px]"
            title="Load 5-Phase Lesson Plan Template (Hook, Modeling, Guided, Independent, Plenary)"
          >
            <BookOpen className="w-3.5 h-3.5 text-teal-600 shrink-0" />
            <span className="truncate">5-Phase Template</span>
          </button>

          <button
            type="button"
            onClick={handleOpenAddForm}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-xl transition cursor-pointer shadow-sm min-h-[38px]"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="truncate">Add Phase</span>
          </button>
        </div>
      </div>

      {/* Add / Edit Form Modal or Inline Drawer */}
      {(isAddingNew || editingActivityId) && (
        <div className="bg-slate-50/90 border border-teal-200 rounded-2xl p-5 shadow-inner space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h4 className="text-xs font-bold text-teal-900 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-teal-600" />
              {editingActivityId ? 'Edit Lesson Activity' : 'Add New Lesson Activity'}
            </h4>
            <button
              type="button"
              onClick={() => {
                setIsAddingNew(false);
                setEditingActivityId(null);
              }}
              className="text-xs text-slate-500 hover:text-slate-700 font-medium cursor-pointer"
            >
              Cancel
            </button>
          </div>

          {/* Quick Preset Badges */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">
              Quick Select Common Phase Name:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_ACTIVITY_NAMES.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setName(preset)}
                  className={`text-[10px] px-2.5 py-1 rounded-lg border transition cursor-pointer text-left ${
                    name === preset
                      ? 'bg-teal-600 text-white border-teal-700 font-semibold'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-teal-50 hover:border-teal-300'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {/* Activity Name */}
            <div className="md:col-span-2">
              <label className="block text-slate-700 font-medium mb-1">Activity / Phase Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Concept Modeling: Interactive Demonstration on Whiteboard"
                className="w-full bg-white text-slate-900 px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs font-medium"
                required
              />
            </div>

            {/* Modality */}
            <div>
              <label className="block text-slate-700 font-medium mb-1">Learning Modality</label>
              <select
                value={modality}
                onChange={(e) => setModality(e.target.value as any)}
                className="w-full bg-white text-slate-900 px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs"
              >
                {MODALITY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            {/* Timing / Duration */}
            <div>
              <label className="block text-slate-700 font-medium mb-1">Duration (Minutes)</label>
              <input
                type="number"
                min="1"
                max="180"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 10)}
                className="w-full bg-white text-slate-900 px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-slate-700 font-medium mb-1">Exact Time Range (Optional)</label>
              <input
                type="text"
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                placeholder="e.g. 08:15 - 08:30"
                className="w-full bg-white text-slate-900 px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs"
              />
            </div>
          </div>

          {/* Detailed Observation Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-700 font-semibold mb-1 flex items-center justify-between">
                <span>Teacher Actions &amp; Questions Asked</span>
                <span className="text-[10px] text-slate-400 font-normal">Pacing, modeling, scaffolding</span>
              </label>
              <textarea
                value={teacherNotes}
                onChange={(e) => setTeacherNotes(e.target.value)}
                placeholder="Observed teacher actions, specific questions asked (HOTS / Bloom), wait time, instructional tools used..."
                rows={3}
                className="w-full bg-white text-slate-900 p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs text-xs resize-y"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1 flex items-center justify-between">
                <span>Student Responses &amp; Observable Evidence</span>
                <span className="text-[10px] text-slate-400 font-normal">Engagement, dialogue, misconceptions</span>
              </label>
              <textarea
                value={studentEvidenceNotes}
                onChange={(e) => setStudentEvidenceNotes(e.target.value)}
                placeholder="Observable student behaviors, pair-share discussions, quotes, misconceptions identified, task completion..."
                rows={3}
                className="w-full bg-white text-slate-900 p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs text-xs resize-y"
              />
            </div>
          </div>

          {/* Form Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setIsAddingNew(false);
                setEditingActivityId(null);
              }}
              className="px-4 py-2 bg-white text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-medium border border-slate-200 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSaveActivity()}
              disabled={!name.trim()}
              className="px-5 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
            >
              {editingActivityId ? 'Update Activity' : 'Save Activity to Timeline'}
            </button>
          </div>
        </div>
      )}

      {/* Activity Timeline List */}
      {activities.length === 0 ? (
        <div className="text-center py-10 bg-slate-50/60 rounded-2xl border border-dashed border-slate-300 p-6">
          <Layers className="w-10 h-10 text-slate-400 mx-auto mb-2" />
          <h4 className="text-sm font-bold text-slate-800">No Lesson Activities Recorded Yet</h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
            Adding structured activity phases with appraiser notes helps the AI auto-grader assess each rubric indicator with maximum accuracy.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleLoadStandardTemplate}
              className="px-4 py-2 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              Load 5-Phase Lesson Template
            </button>
            <button
              type="button"
              onClick={handleOpenAddForm}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold transition shadow-sm cursor-pointer"
            >
              + Add Custom Activity
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {activities.map((act, index) => {
            const isExpanded = expandedActivityIds[act.id] !== false; // expanded by default
            return (
              <div
                key={act.id}
                className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-4 transition shadow-2xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {/* Left: Index badge & Name */}
                  <div className="flex items-start gap-3 flex-1 min-w-[240px]">
                    <span className="w-6 h-6 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 font-mono font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      {index + 1}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h4 className="text-sm font-bold text-slate-900">{act.name}</h4>
                        {act.modality && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                            {act.modality}
                          </span>
                        )}
                        {(act.timeRange || act.durationMinutes) && (
                          <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {act.timeRange || `${act.durationMinutes} mins`}
                          </span>
                        )}
                      </div>

                      {/* Snippet preview if collapsed */}
                      {!isExpanded && (act.teacherNotes || act.studentEvidenceNotes) && (
                        <p className="text-xs text-slate-500 line-clamp-1">
                          {act.teacherNotes || act.studentEvidenceNotes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Controls (Reorder, Edit, Delete, Expand) */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleMove(index, 'up')}
                      disabled={index === 0}
                      className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                      title="Move up"
                    >
                      <MoveUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(index, 'down')}
                      disabled={index === activities.length - 1}
                      className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                      title="Move down"
                    >
                      <MoveDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditActivity(act)}
                      className="p-1.5 text-slate-600 hover:text-teal-700 rounded-lg hover:bg-teal-50 transition cursor-pointer"
                      title="Edit activity"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteActivity(act.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                      title="Delete activity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleExpand(act.id)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                      title={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (act.teacherNotes || act.studentEvidenceNotes) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-100 text-xs">
                    {act.teacherNotes && (
                      <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200">
                        <span className="font-bold text-slate-700 block mb-1">
                          Teacher Actions &amp; Questions:
                        </span>
                        <p className="text-slate-600 leading-relaxed">{act.teacherNotes}</p>
                      </div>
                    )}
                    {act.studentEvidenceNotes && (
                      <div className="bg-teal-50/40 p-3 rounded-xl border border-teal-200">
                        <span className="font-bold text-teal-900 block mb-1">
                          Student Responses &amp; Observable Evidence:
                        </span>
                        <p className="text-teal-950 leading-relaxed">{act.studentEvidenceNotes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
