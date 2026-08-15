import React, { useMemo, useState } from 'react';
import { X, FileText, Download, FileType2, AlertTriangle } from 'lucide-react';
import {
  TeacherAppraisalRecord,
  ACADEMIC_YEARS,
  EDUVERSAL_SCHOOLS,
  currentAcademicYear,
} from '../types';
import { EduversalLogo } from './EduversalLogo';
import {
  ALL,
  SchoolReportFilters,
  buildSchoolReport,
  buildReportFilename,
  generateSchoolReportDoc,
  generateSchoolReportPdf,
} from '../services/schoolReport';

interface SchoolReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  appraisals: TeacherAppraisalRecord[];
}

const SCHOOL_LEVELS = [
  'Early Years (PG-KG)',
  'Primary (Grades 1-6)',
  'Middle School (Grades 7-9)',
  'High School (Grades 10-12)',
];

const SUBJECT_CATEGORIES = [
  'Mathematics',
  'Science (Physics, Chem, Bio)',
  'English Language & Lit',
  'Bahasa Indonesia',
  'Social Studies & Humanities',
  'Information & Digital Tech',
  'Arts & Music',
  'Physical & Health Education',
  'Early Childhood Education',
];

const CAREER_LEVELS = ['Induction', 'Developing', 'Proficient', 'Lead', 'EarlyYears'];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoke on the next tick so the download has begun.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const SchoolReportModal: React.FC<SchoolReportModalProps> = ({
  isOpen,
  onClose,
  appraisals,
}) => {
  const [filters, setFilters] = useState<SchoolReportFilters>({
    academicYear: currentAcademicYear(),
    school: ALL,
    schoolLevel: ALL,
    subjectCategory: ALL,
    careerLevel: ALL,
  });

  const report = useMemo(
    () => buildSchoolReport(appraisals, filters),
    [appraisals, filters]
  );

  if (!isOpen) return null;

  const set = (patch: Partial<SchoolReportFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch }));

  const handlePdf = () => {
    const doc = generateSchoolReportPdf(report);
    doc.save(buildReportFilename(report, 'pdf'));
  };

  const handleDoc = () => {
    downloadBlob(generateSchoolReportDoc(report), buildReportFilename(report, 'doc'));
  };

  const selectClass =
    'w-full p-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 cursor-pointer';

  const empty = report.totalObservations === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white border border-slate-200 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto text-slate-800">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3 min-w-0">
            <EduversalLogo variant="icon" size={36} className="shrink-0" />
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900">School Observation Report</h3>
              <p className="text-xs text-slate-500">
                Key observations and notes for improvement, exported as a document for
                leadership and departmental review.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 shrink-0 rounded-full hover:bg-slate-200/70 flex items-center justify-center text-slate-500 hover:text-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="p-5 border-b border-slate-100">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
            Report Scope
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label htmlFor="rep-year" className="block text-[11px] font-semibold text-slate-600 mb-1">
                Academic Year
              </label>
              <select
                id="rep-year"
                value={filters.academicYear}
                onChange={(e) => set({ academicYear: e.target.value })}
                className={selectClass}
              >
                <option value={ALL}>All academic years</option>
                {ACADEMIC_YEARS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="rep-school" className="block text-[11px] font-semibold text-slate-600 mb-1">
                School
              </label>
              <select
                id="rep-school"
                value={filters.school}
                onChange={(e) => set({ school: e.target.value })}
                className={selectClass}
              >
                <option value={ALL}>All schools</option>
                {EDUVERSAL_SCHOOLS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="rep-level" className="block text-[11px] font-semibold text-slate-600 mb-1">
                School Level
              </label>
              <select
                id="rep-level"
                value={filters.schoolLevel}
                onChange={(e) => set({ schoolLevel: e.target.value })}
                className={selectClass}
              >
                <option value={ALL}>All school levels</option>
                {SCHOOL_LEVELS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="rep-subject" className="block text-[11px] font-semibold text-slate-600 mb-1">
                Subject
              </label>
              <select
                id="rep-subject"
                value={filters.subjectCategory}
                onChange={(e) => set({ subjectCategory: e.target.value })}
                className={selectClass}
              >
                <option value={ALL}>All subjects</option>
                {SUBJECT_CATEGORIES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="rep-career" className="block text-[11px] font-semibold text-slate-600 mb-1">
                Career Level
              </label>
              <select
                id="rep-career"
                value={filters.careerLevel}
                onChange={(e) => set({ careerLevel: e.target.value })}
                className={selectClass}
              >
                <option value={ALL}>All career levels</option>
                {CAREER_LEVELS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="p-5 overflow-y-auto flex-1">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
            Preview
          </h4>

          {empty ? (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800">
                No observations match this scope, so the report would contain no findings.
                Widen the filters, or record an observation for this period first.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500 mb-3">{report.scopeLine}</p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                    Observations
                  </div>
                  <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                    {report.totalObservations}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                    Avg F2
                  </div>
                  <div className="text-xl font-bold font-mono text-teal-700 mt-0.5">
                    {report.averagePercentage}%
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                    Priorities
                  </div>
                  <div className="text-xl font-bold font-mono text-amber-600 mt-0.5">
                    {report.priorityImprovements.length}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                    Not Observable
                  </div>
                  <div className="text-xl font-bold font-mono text-slate-600 mt-0.5">
                    {report.totalNotObservable}
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                {report.observations.slice(0, 5).map((o, i) => (
                  <div key={i} className="p-3 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">
                        {o.teacherName} — {o.subject}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {o.schoolName} • {o.careerLevel} • {o.observationDate}
                      </div>
                    </div>
                    <span className="font-mono font-bold text-teal-700 shrink-0">
                      {o.percentage}%
                    </span>
                  </div>
                ))}
                {report.observations.length > 5 && (
                  <div className="p-2.5 text-[11px] text-slate-500 text-center bg-slate-50">
                    + {report.observations.length - 5} more included in the document
                  </div>
                )}
              </div>

              {report.priorityImprovements.length > 0 && (
                <div className="mt-4">
                  <h5 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Top Improvement Priorities
                  </h5>
                  <ul className="space-y-1">
                    {report.priorityImprovements.slice(0, 3).map((p, i) => (
                      <li key={i} className="text-xs text-slate-600 pl-2 border-l-2 border-amber-300">
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500">
            The Word file opens in Word, Pages and Google Docs.
          </p>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleDoc}
              disabled={empty}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition cursor-pointer shadow-2xs"
            >
              <FileType2 className="w-4 h-4 text-indigo-600" />
              Download Word
            </button>
            <button
              type="button"
              onClick={handlePdf}
              disabled={empty}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-[#165963] hover:bg-[#11474f] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-sm"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
