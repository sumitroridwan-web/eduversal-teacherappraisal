import React, { useState } from 'react';
import {
  Plus,
  Search,
  Filter,
  FileText,
  Trash2,
  Edit,
  Sparkles,
  Award,
  Calendar,
  User,
  GraduationCap,
  Clock,
  RotateCcw,
  BookOpen,
  School,
} from 'lucide-react';
import { TeacherAppraisalRecord, CareerLevel, SchoolLevel, SubjectCategory, EDUVERSAL_SCHOOLS } from '../types';
import { calculateF2Scores } from '../data/frameworkRubrics';

interface AppraisalListProps {
  appraisals: TeacherAppraisalRecord[];
  onSelectAppraisal: (appraisal: TeacherAppraisalRecord) => void;
  onNewAppraisal: () => void;
  onDeleteAppraisal: (id: string) => void;
  onViewReport: (appraisal: TeacherAppraisalRecord) => void;
  onOpenRubrics: (level: CareerLevel) => void;
}

export const AppraisalList: React.FC<AppraisalListProps> = ({
  appraisals,
  onSelectAppraisal,
  onNewAppraisal,
  onDeleteAppraisal,
  onViewReport,
  onOpenRubrics,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSchool, setFilterSchool] = useState<string>('All');
  const [filterLevel, setFilterLevel] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');

  const filteredAppraisals = appraisals.filter((a) => {
    const matchesSchool = filterSchool === 'All' || a.schoolName === filterSchool;
    const matchesLevel = filterLevel === 'All' || a.careerLevel === filterLevel;
    const matchesStatus = filterStatus === 'All' || a.status === filterStatus;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !searchQuery ||
      (a.schoolName && a.schoolName.toLowerCase().includes(q)) ||
      a.teacherName.toLowerCase().includes(q) ||
      a.subject.toLowerCase().includes(q) ||
      a.subjectCategory.toLowerCase().includes(q) ||
      a.appraiserName.toLowerCase().includes(q) ||
      a.schoolLevel.toLowerCase().includes(q) ||
      a.lessonTopic.toLowerCase().includes(q);

    return matchesSchool && matchesLevel && matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6 text-slate-800">
      {/* Header & Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 mb-5 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">
              <span>Classroom Observations Portfolio</span>
              <span className="text-slate-300">•</span>
              <span>Framework 2 Directory</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-3">
              Teacher Appraisal Records
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {appraisals.length} Total
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              id="btn-new-appraisal"
              type="button"
              onClick={onNewAppraisal}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Start New Observation</span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search teacher, subject..."
              className="w-full bg-white text-slate-900 pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
            />
          </div>

          {/* School / Campus Filter */}
          <div>
            <select
              value={filterSchool}
              onChange={(e) => setFilterSchool(e.target.value)}
              className="w-full bg-white text-slate-900 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs font-medium cursor-pointer truncate"
            >
              <option value="All">All 15 Schools ({appraisals.length})</option>
              {EDUVERSAL_SCHOOLS.map((school) => (
                <option key={school} value={school}>
                  {school}
                </option>
              ))}
            </select>
          </div>

          {/* Level Filter */}
          <div>
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              className="w-full bg-white text-slate-900 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs cursor-pointer"
            >
              <option value="All">All Career Levels</option>
              <option value="Lead">Lead Level</option>
              <option value="Proficient">Proficient Level</option>
              <option value="Developing">Developing Level</option>
              <option value="Induction">Induction Level</option>
              <option value="EarlyYears">Early Years (EY)</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full bg-white text-slate-900 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs cursor-pointer"
            >
              <option value="All">All Statuses</option>
              <option value="Finalized (Conference Complete)">Finalized (Conference Complete)</option>
              <option value="Observation Saved">Observation Saved</option>
              <option value="Draft">Draft</option>
            </select>
          </div>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredAppraisals.map((appraisal) => {
          const s = calculateF2Scores(appraisal.careerLevel, appraisal.scores);

          return (
            <div
              key={appraisal.id}
              className="bg-white border border-slate-200 hover:border-indigo-300 rounded-2xl p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between group"
            >
              <div>
                {/* Header Row */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <span className="text-[10px] font-bold text-teal-700 uppercase tracking-wider bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                        {appraisal.schoolName || 'Eduversal School'}
                      </span>
                      <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                        {appraisal.schoolLevel}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition">
                      {appraisal.teacherName || 'Unnamed Teacher'}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      {appraisal.subject || appraisal.subjectCategory} •{' '}
                      <span className="text-slate-400">{appraisal.gradeClass || 'Room N/A'}</span>
                    </p>
                  </div>

                  {/* Indicative Grade Badge */}
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-lg border shrink-0 shadow-2xs ${
                      s.grade === 'A'
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                        : s.grade === 'B'
                        ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                        : s.grade === 'C'
                        ? 'bg-amber-50 text-amber-600 border-amber-200'
                        : s.grade === 'D'
                        ? 'bg-orange-50 text-orange-600 border-orange-200'
                        : 'bg-rose-50 text-rose-600 border-rose-200'
                    }`}
                  >
                    {s.grade}
                  </div>
                </div>

                {/* Lesson Topic & Objectives Preview */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs mb-4">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Lesson Unit / Topic:</span>
                  <p className="text-slate-800 line-clamp-1 font-medium">{appraisal.lessonTopic || 'General Observation'}</p>
                </div>

                {/* Score & Progress Stats */}
                <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/70">
                    <span className="text-[10px] text-slate-500 block">F2 Raw Score</span>
                    <span className="font-mono font-bold text-indigo-600 text-sm">
                      {s.totalRaw}/{s.maxTotal} ({s.percentage}%)
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/70">
                    <span className="text-[10px] text-slate-500 block">Career Level</span>
                    <span className="font-semibold text-amber-600">{appraisal.careerLevel}</span>
                  </div>
                </div>

                {/* Status Badge & Audio/AI indicator */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-4 pb-3 border-b border-slate-100">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {appraisal.observationDate}
                  </span>

                  <div className="flex items-center gap-2">
                    {appraisal.aiAnalysis && (
                      <span className="flex items-center gap-1 text-[10px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 font-medium">
                        <Sparkles className="w-3 h-3 text-amber-500" />
                        AI Analyzed
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Card Actions */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onDeleteAppraisal(appraisal.id)}
                  className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                  title="Delete Observation Record"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onViewReport(appraisal)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Report</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelectAppraisal(appraisal)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>Open Sheet</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredAppraisals.length === 0 && (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900">No appraisal records found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-5">
            No observation sheets match your search or filter parameters. Start a new observation or reset sample appraisals.
          </p>
          <button
            type="button"
            onClick={onNewAppraisal}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition cursor-pointer shadow-sm"
          >
            + Create New Classroom Observation
          </button>
        </div>
      )}
    </div>
  );
};
