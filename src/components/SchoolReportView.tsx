import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileType2, AlertTriangle, FileText, Star } from 'lucide-react';
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
  loadLogoDataUrl,
} from '../services/schoolReport';

interface SchoolReportViewProps {
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
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const SchoolReportView: React.FC<SchoolReportViewProps> = ({ appraisals }) => {
  const [filters, setFilters] = useState<SchoolReportFilters>({
    academicYear: currentAcademicYear(),
    school: ALL,
    schoolLevel: ALL,
    subjectCategory: ALL,
    careerLevel: ALL,
  });
  const [logo, setLogo] = useState<string | null>(null);

  // Fetched once so both exports can embed it without re-reading the asset.
  useEffect(() => {
    let cancelled = false;
    loadLogoDataUrl().then((d) => {
      if (!cancelled) setLogo(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const report = useMemo(() => buildSchoolReport(appraisals, filters), [appraisals, filters]);

  const set = (patch: Partial<SchoolReportFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch }));

  const handlePdf = () => {
    generateSchoolReportPdf(report, logo).save(buildReportFilename(report, 'pdf'));
  };

  const handleDoc = () => {
    downloadBlob(generateSchoolReportDoc(report, logo), buildReportFilename(report, 'doc'));
  };

  const selectClass =
    'w-full p-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 cursor-pointer';

  const empty = report.totalObservations === 0;
  const generatedOn = new Date(report.generatedAt).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="space-y-5">
      {/* Scope controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
              Academic Quality Assurance
            </div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#165963]" />
              School Observation Report
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Key observations and notes for improvement. Set the scope below, review the
              preview, then download it as a document.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDoc}
              disabled={empty}
              className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition cursor-pointer shadow-2xs"
            >
              <FileType2 className="w-4 h-4 text-indigo-600" />
              Download Word
            </button>
            <button
              type="button"
              onClick={handlePdf}
              disabled={empty}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#165963] hover:bg-[#11474f] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-sm"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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

      {/* Document preview - mirrors the exported file */}
      <div className="bg-white text-slate-900 p-5 sm:p-8 lg:p-10 rounded-2xl shadow-xl border border-slate-200 max-w-4xl mx-auto">
        <div className="flex items-center gap-4 pb-5 border-b-2 border-[#165963]">
          <EduversalLogo variant="full" size={72} className="shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-black text-[#165963] tracking-tight">
              SCHOOL OBSERVATION REPORT
            </h1>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Eduversal Partner Schools • Framework 2 Classroom Observation &amp; Quality Assurance
            </p>
          </div>
        </div>

        <div className="mt-4 mb-6">
          <p className="text-sm font-bold text-slate-900">{report.scopeLine}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Generated {generatedOn} • {report.totalObservations} observation
            {report.totalObservations === 1 ? '' : 's'} in scope
          </p>
        </div>

        {empty ? (
          <div className="flex items-start gap-2.5 p-4 rounded-xl bg-amber-50 border border-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800">
              No observations match this scope, so the report would contain no findings.
              Widen the filters, or record an observation for this period first.
            </p>
          </div>
        ) : (
          <>
            {/* Executive summary */}
            <section className="mb-7">
              <h2 className="text-xs font-bold text-[#165963] uppercase tracking-wider pb-1 border-b border-slate-200 mb-3">
                Executive Summary
              </h2>
              <p className="text-xs text-slate-700 leading-relaxed">
                Average Framework 2 attainment across the {report.totalObservations} observation
                {report.totalObservations === 1 ? '' : 's'} in scope is{' '}
                <strong>{report.averagePercentage}%</strong>. Grades awarded:{' '}
                {Object.entries(report.gradeDistribution)
                  .filter(([, n]) => Number(n) > 0)
                  .map(([g, n]) => `${n} × Grade ${g}`)
                  .join(', ') || 'none recorded'}
                .
              </p>
              {report.totalNotObservable > 0 && (
                <p className="text-xs text-slate-600 leading-relaxed mt-2">
                  {report.totalNotObservable} indicator ratings were recorded as{' '}
                  <em>not observable</em> — the captured evidence did not speak to them. These are
                  excluded from attainment rather than counted as failures.
                </p>
              )}
            </section>

            {/* Domain attainment */}
            <section className="mb-7">
              <h2 className="text-xs font-bold text-[#165963] uppercase tracking-wider pb-1 border-b border-slate-200 mb-3">
                Domain Attainment
              </h2>
              <div className="space-y-2.5">
                {report.domainAverages.map((d) => (
                  <div key={d.domain}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-700">{d.domain}</span>
                      <span className="font-mono font-bold text-slate-900">
                        {d.rated ? `${d.score}%` : 'Not observed'}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#165963] rounded-full"
                        style={{ width: `${d.rated ? Math.min(100, d.score) : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Key observations */}
            <section className="mb-7">
              <h2 className="text-xs font-bold text-[#165963] uppercase tracking-wider pb-1 border-b border-slate-200 mb-3">
                Key Observations
              </h2>
              <div className="space-y-4">
                {report.observations.map((o, i) => (
                  <div key={i} className="pb-3 border-b border-slate-100 last:border-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-900">
                        {i + 1}. {o.teacherName} — {o.subject}
                      </h3>
                      <span className="font-mono font-bold text-[#165963] text-sm">
                        {o.percentage}% • Grade {o.grade}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {o.schoolName} • {o.schoolLevel} • {o.careerLevel} Level • Observed{' '}
                      {o.observationDate} • AY {o.academicYear}
                    </p>
                    <p className="text-xs text-slate-700 mt-1">
                      Result: {o.rawScore}/{o.maxScore} ({o.predicate}). {o.ratedCount} indicators
                      rated
                      {o.notObservableCount ? `, ${o.notObservableCount} not observable` : ''}.
                    </p>

                    {/* Reported as the Glow / Grow / Go the teacher was given */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2.5">
                      {([
                        ['Glow', 'observed strengths', o.glow, 'emerald'],
                        ['Grow', 'reflective questions', o.grow, 'amber'],
                        ['Go', 'agreed next steps', o.go, 'indigo'],
                      ] as const).map(([label, caption, entries, tone]) =>
                        entries.length ? (
                          <div
                            key={label}
                            className={`rounded-lg border p-2.5 ${
                              tone === 'emerald'
                                ? 'bg-emerald-50/50 border-emerald-200'
                                : tone === 'amber'
                                ? 'bg-amber-50/50 border-amber-200'
                                : 'bg-indigo-50/50 border-indigo-200'
                            }`}
                          >
                            <div
                              className={`text-[10px] font-bold uppercase tracking-wider ${
                                tone === 'emerald'
                                  ? 'text-emerald-800'
                                  : tone === 'amber'
                                  ? 'text-amber-800'
                                  : 'text-indigo-800'
                              }`}
                            >
                              {label}
                              <span className="font-normal normal-case text-slate-500">
                                {' '}
                                — {caption}
                              </span>
                            </div>
                            <ul className="list-disc pl-4 text-xs text-slate-600 space-y-0.5 mt-1">
                              {entries.map((s, k) => <li key={k}>{s}</li>)}
                            </ul>
                          </div>
                        ) : null
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Cohort priorities */}
            {report.priorityImprovements.length > 0 && (
              <section className="mb-7">
                <h2 className="text-xs font-bold text-[#165963] uppercase tracking-wider pb-1 border-b border-slate-200 mb-3">
                  Notes for Improvement — Cohort Priorities
                </h2>
                <p className="text-xs text-slate-600 mb-2">
                  Indicators most frequently rated Basic or below across the observations in scope.
                  These are the highest-leverage focus areas for departmental coaching and INSET
                  planning.
                </p>
                <ol className="list-decimal pl-4 text-xs text-slate-700 space-y-2">
                  {report.priorityImprovements.map((p, i) => (
                    <li key={i} className="leading-relaxed">{p}</li>
                  ))}
                </ol>
              </section>
            )}

            {/* Best practices */}
            {report.bestPractices.length > 0 && (
              <section>
                <h2 className="text-xs font-bold text-[#165963] uppercase tracking-wider pb-1 border-b border-slate-200 mb-3">
                  Best Practices to Share
                </h2>
                <p className="text-xs text-slate-500 mb-3">
                  Practice flagged during observation as worth sharing across the department,
                  shown with the evidence photographed at the time.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {report.bestPractices.map((b, i) => (
                    <figure
                      key={i}
                      className="border border-amber-200 bg-amber-50/50 rounded-xl overflow-hidden flex gap-3"
                    >
                      {b.dataUrl && (
                        <img
                          src={b.dataUrl}
                          alt={b.caption}
                          className="w-24 h-24 object-cover shrink-0"
                        />
                      )}
                      <figcaption className="py-2 pr-2 min-w-0">
                        <span className="flex items-center gap-1 text-[11px] font-bold text-amber-800">
                          <Star className="w-3 h-3 text-amber-500 shrink-0" />
                          {b.teacherName}
                        </span>
                        <p className="text-xs text-slate-700 mt-0.5">{b.caption}</p>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <p className="text-[10px] text-slate-400 mt-8 pt-3 border-t border-slate-100">
          Eduversal Academic Quality Assurance Directorate • Framework 2
        </p>
      </div>
    </div>
  );
};
