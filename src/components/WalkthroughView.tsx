import React, { useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck,
  Plus,
  Trash2,
  Pencil,
  Save,
  Download,
  FileType2,
  BarChart3,
  Info,
  AlertTriangle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  WalkthroughRecord,
  WALKTHROUGH_INDICATORS,
  WalkthroughResponse,
  OBSERVER_ROLES,
  LESSON_PHASES,
  ACADEMIC_YEARS,
  EDUVERSAL_SCHOOLS,
  SubjectCategory,
  currentAcademicYear,
} from '../types';
import { EduversalLogo } from './EduversalLogo';
import { useLanguage } from '../i18n/LanguageContext';
import {
  loadWalkthroughs,
  saveOrUpdateWalkthrough,
  deleteWalkthrough,
  createBlankWalkthrough,
} from '../services/walkthroughStorage';
import {
  ALL,
  WalkthroughFilters,
  buildWalkthroughReport,
  buildWalkthroughFilename,
  generateWalkthroughDoc,
  generateWalkthroughPdf,
  loadLogoDataUrl,
} from '../services/walkthroughReport';

type Panel = 'form' | 'records' | 'report';

const SUBJECT_CATEGORIES: SubjectCategory[] = [
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

const RESPONSE_OPTIONS: Array<{ value: WalkthroughResponse; label: string; hint: string }> = [
  { value: 'E', label: 'E', hint: 'Evident — clearly observed' },
  { value: 'D', label: 'D', hint: 'Developing — partially observed / inconsistent' },
  { value: 'N', label: 'N', hint: 'Not Observed — may be due to lesson phase' },
];

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

export const WalkthroughView: React.FC = () => {
  const { t } = useLanguage();
  const [panel, setPanel] = useState<Panel>('form');
  const [records, setRecords] = useState<WalkthroughRecord[]>([]);
  const [draft, setDraft] = useState<WalkthroughRecord>(createBlankWalkthrough);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);

  const [filters, setFilters] = useState<WalkthroughFilters>({
    academicYear: ALL,
    school: ALL,
    subject: ALL,
    observerRole: ALL,
    lessonPhase: ALL,
  });

  useEffect(() => {
    setRecords(loadWalkthroughs());
    loadLogoDataUrl().then(setLogo);
  }, []);

  const report = useMemo(() => buildWalkthroughReport(records, filters), [records, filters]);

  // The draft is an edit rather than a new visit when its id already exists.
  const isEditing = useMemo(
    () => records.some((r) => r.id === draft.id),
    [records, draft.id]
  );

  // Filter on the controlled department list rather than free-typed subject
  // names, so "Maths" and "Mathematics" cannot split the same cohort.
  const subjects = useMemo(
    () => Array.from(new Set(records.map((r) => r.subjectCategory).filter(Boolean))).sort(),
    [records]
  );

  const chartData = useMemo(
    () =>
      report.indicatorBreakdown.map((i) => ({
        name: i.id,
        label: `${i.id} ${i.title}`,
        Evident: i.evident,
        Developing: i.developing,
        'Not Observed': i.notObserved,
      })),
    [report]
  );

  const setField = (patch: Partial<WalkthroughRecord>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const setResponse = (id: string, response: WalkthroughResponse) =>
    setDraft((prev) => ({
      ...prev,
      responses: {
        ...prev.responses,
        [id]: {
          ...prev.responses[id],
          // Tapping the selected value again clears it.
          response: prev.responses[id]?.response === response ? null : response,
        },
      },
    }));

  const setNotes = (id: string, notes: string) =>
    setDraft((prev) => ({
      ...prev,
      responses: { ...prev.responses, [id]: { ...prev.responses[id], notes } },
    }));

  const handleSave = () => {
    if (!draft.teacherName.trim()) {
      setError('A teacher name is required before the walkthrough can be saved.');
      return;
    }
    if (!draft.keyObservation.trim()) {
      setError('Key Observation is required — it is the substance of the visit.');
      return;
    }

    try {
      const wasEditing = isEditing;
      saveOrUpdateWalkthrough(draft);
      setRecords(loadWalkthroughs());
      setDraft(createBlankWalkthrough());
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 3500);
      // After updating an existing visit, return to the list so the change is visible.
      if (wasEditing) setPanel('records');
    } catch (e: any) {
      setError(e?.message || 'The walkthrough could not be saved.');
    }
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Delete this walkthrough record?')) return;
    deleteWalkthrough(id);
    setRecords(loadWalkthroughs());
  };

  const handleEdit = (record: WalkthroughRecord) => {
    setDraft(record);
    setPanel('form');
  };

  const inputClass =
    'w-full p-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';

  const panelBtn = (value: Panel, label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setPanel(value)}
      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
        panel === value
          ? 'bg-white text-indigo-700 shadow-2xs font-bold'
          : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
              {t('wt.department')}
            </div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-[#165963]" />
              {t('wt.title')}
            </h2>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            {panelBtn('form', isEditing ? t('wt.editVisit') : t('wt.newVisit'))}
            {panelBtn('records', `${t('wt.records')} (${records.length})`)}
            {panelBtn('report', t('wt.graphsReport'))}
          </div>
        </div>

        <div className="mt-3 flex items-start gap-2 p-2.5 rounded-xl bg-sky-50 border border-sky-200">
          <Info className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
          <p className="text-xs text-sky-900">
            <strong>{t('wt.formativeOnly')}</strong> {t('wt.formativeNote')}
          </p>
        </div>
      </div>

      {/* ---------------- Form ---------------- */}
      {panel === 'form' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-5">
          {isEditing && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-indigo-50 border border-indigo-200">
              <p className="text-xs text-indigo-900">
                <strong>Editing an existing walkthrough</strong> — {draft.teacherName || 'this visit'}
                , {draft.dateOfVisit}. Saving updates that record rather than creating a new one.
              </p>
              <button
                type="button"
                onClick={() => {
                  setDraft(createBlankWalkthrough());
                  setError(null);
                }}
                className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 underline cursor-pointer"
              >
                Cancel edit
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-slate-600 font-medium mb-1">{t('wt.teacherName')} *</label>
              <input
                value={draft.teacherName}
                onChange={(e) => setField({ teacherName: e.target.value })}
                className={inputClass}
                placeholder="e.g. A. Rahman"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">{t('wt.subject')}</label>
              <input
                value={draft.subject}
                onChange={(e) => setField({ subject: e.target.value })}
                className={inputClass}
                placeholder="e.g. Mathematics"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">{t('wt.subjectDept')}</label>
              <select
                value={draft.subjectCategory}
                onChange={(e) => setField({ subjectCategory: e.target.value as SubjectCategory })}
                className={`${inputClass} cursor-pointer`}
              >
                {SUBJECT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">{t('wt.classObserved')}</label>
              <input
                value={draft.classObserved}
                onChange={(e) => setField({ classObserved: e.target.value })}
                className={inputClass}
                placeholder="e.g. Grade 8A"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">{t('wt.dateOfVisit')}</label>
              <input
                type="date"
                value={draft.dateOfVisit}
                onChange={(e) => setField({ dateOfVisit: e.target.value })}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">{t('wt.timeOfVisit')}</label>
              <input
                type="time"
                value={draft.timeOfVisit}
                onChange={(e) => setField({ timeOfVisit: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">
                {t('wt.duration')}
              </label>
              <input
                type="number"
                min={1}
                value={draft.durationMinutes ?? ''}
                onChange={(e) => setField({ durationMinutes: Number(e.target.value) || undefined })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">{t('wt.observerName')}</label>
              <input
                value={draft.observerName}
                onChange={(e) => setField({ observerName: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">{t('wt.observerRole')}</label>
              <select
                value={draft.observerRole}
                onChange={(e) => setField({ observerRole: e.target.value })}
                className={`${inputClass} cursor-pointer`}
              >
                {OBSERVER_ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">
                {t('wt.lessonPhase')}
              </label>
              <select
                value={draft.lessonPhase}
                onChange={(e) => setField({ lessonPhase: e.target.value })}
                className={`${inputClass} cursor-pointer`}
              >
                {LESSON_PHASES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">{t('wt.school')}</label>
              <select
                value={draft.schoolName}
                onChange={(e) => setField({ schoolName: e.target.value })}
                className={`${inputClass} cursor-pointer`}
              >
                <option value="">Select school…</option>
                {EDUVERSAL_SCHOOLS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">{t('wt.academicYear')}</label>
              <select
                value={draft.academicYear || currentAcademicYear()}
                onChange={(e) => setField({ academicYear: e.target.value })}
                className={`${inputClass} cursor-pointer`}
              >
                {ACADEMIC_YEARS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Response key */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
            <strong className="text-slate-800">{t('wt.responseKey')}</strong>{' '}
            <strong>E</strong> = Evident (clearly observed) • <strong>D</strong> = Developing
            (partially observed / inconsistent) • <strong>N</strong> = Not Observed (may be due to
            lesson phase, not absence of practice)
          </div>

          {/* Indicators */}
          <div className="space-y-3">
            {WALKTHROUGH_INDICATORS.map((ind) => {
              const entry = draft.responses[ind.id] || { response: null, notes: '' };
              return (
                <div key={ind.id} className="border border-slate-200 rounded-xl p-3.5 bg-white">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-slate-900">
                        {ind.id} — {ind.title}
                      </h4>
                      <p className="text-xs text-slate-600 italic mt-0.5">{ind.question}</p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 bg-slate-100 p-1 rounded-xl border border-slate-200">
                      {RESPONSE_OPTIONS.map((opt) => {
                        const active = entry.response === opt.value;
                        const activeClass =
                          opt.value === 'E'
                            ? 'bg-emerald-600 text-white'
                            : opt.value === 'D'
                            ? 'bg-amber-500 text-white'
                            : 'bg-slate-500 text-white';
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            title={opt.hint}
                            onClick={() => setResponse(ind.id, opt.value)}
                            className={`w-9 h-8 rounded-lg text-xs font-bold transition cursor-pointer ${
                              active
                                ? `${activeClass} shadow-xs`
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <textarea
                    value={entry.notes}
                    onChange={(e) => setNotes(ind.id, e.target.value)}
                    rows={2}
                    placeholder={ind.notesPrompt}
                    className="mt-2.5 w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none resize-none transition focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              );
            })}
          </div>

          {/* Narrative */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
{t('wt.keyObservation')} <span className="text-rose-600">*</span>
              </label>
              <p className="text-[11px] text-slate-500 mb-1.5">
                A brief, specific observation — a strength, a pattern, or something worth discussing.
              </p>
              <textarea
                value={draft.keyObservation}
                onChange={(e) => setField({ keyObservation: e.target.value })}
                rows={4}
                className={`${inputClass} resize-none`}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
{t('wt.suggestedFocus')} <span className="text-slate-400 font-normal">{t('wt.optional')}</span>
              </label>
              <p className="text-[11px] text-slate-500 mb-1.5">
                One specific, actionable focus to consider before the next visit — framed as an
                invitation to reflect, not a directive.
              </p>
              <textarea
                value={draft.suggestedFocus}
                onChange={(e) => setField({ suggestedFocus: e.target.value })}
                rows={4}
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200">
              <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
              <p className="text-xs text-rose-800">{error}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {saved ? (
              <span className="text-xs font-semibold text-emerald-700">
                Walkthrough saved to the records list.
              </span>
            ) : (
              <span className="text-[11px] text-slate-500">
                {isEditing
                  ? 'Updating an existing record. Teacher name and Key Observation are required.'
                  : 'Teacher name and Key Observation are required.'}
              </span>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraft(createBlankWalkthrough());
                  setError(null);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {isEditing ? 'Discard Changes' : 'Clear Form'}
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex items-center gap-2 px-5 py-2 bg-[#165963] hover:bg-[#11474f] text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-sm"
              >
                <Save className="w-4 h-4" />
                {isEditing ? 'Update Walkthrough' : 'Save Walkthrough'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Records ---------------- */}
      {panel === 'records' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          {records.length === 0 ? (
            <div className="border border-dashed border-slate-300 rounded-xl py-10 text-center">
              <ClipboardCheck className="w-7 h-7 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-600">{t('wt.noRecords')}</p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
              {records.map((r) => (
                <div key={r.id} className="p-3 flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => handleEdit(r)}
                    className="text-left min-w-0 flex-1 cursor-pointer group"
                  >
                    <div className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600 transition truncate">
                      {r.teacherName} — {r.subject || 'Subject not set'}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {r.classObserved || 'Class not set'} • {r.dateOfVisit} • {r.lessonPhase} •{' '}
                      {r.observerRole}
                    </div>
                    <p className="text-xs text-slate-600 mt-1 line-clamp-2">{r.keyObservation}</p>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {WALKTHROUGH_INDICATORS.map((ind) => {
                      const v = r.responses?.[ind.id]?.response;
                      return (
                        <span
                          key={ind.id}
                          title={`${ind.id} ${ind.title}`}
                          className={`w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center border ${
                            v === 'E'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : v === 'D'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : v === 'N'
                              ? 'bg-slate-100 text-slate-600 border-slate-200'
                              : 'bg-white text-slate-300 border-slate-200'
                          }`}
                        >
                          {v || '–'}
                        </span>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => handleEdit(r)}
                      aria-label="Edit walkthrough"
                      title="Edit this walkthrough"
                      className="flex items-center gap-1 px-2 h-7 rounded-lg text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 border border-slate-200 text-[11px] font-semibold transition cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(r.id)}
                      aria-label="Delete walkthrough"
                      className="w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------- Graphs & Report ---------------- */}
      {panel === 'report' && (
        <>
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-600" />
                {t('report.scope')}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!report.totalVisits}
                  onClick={() =>
                    downloadBlob(
                      generateWalkthroughDoc(report, logo),
                      buildWalkthroughFilename(report, 'doc')
                    )
                  }
                  className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition cursor-pointer shadow-2xs"
                >
                  <FileType2 className="w-4 h-4 text-indigo-600" />
                  {t('action.downloadWord')}
                </button>
                <button
                  type="button"
                  disabled={!report.totalVisits}
                  onClick={() =>
                    generateWalkthroughPdf(report, logo).save(
                      buildWalkthroughFilename(report, 'pdf')
                    )
                  }
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#165963] hover:bg-[#11474f] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  {t('action.downloadPdf')}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Academic Year
                </label>
                <select
                  value={filters.academicYear}
                  onChange={(e) => setFilters({ ...filters, academicYear: e.target.value })}
                  className={`${inputClass} cursor-pointer`}
                >
                  <option value={ALL}>All academic years</option>
                  {ACADEMIC_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">School</label>
                <select
                  value={filters.school}
                  onChange={(e) => setFilters({ ...filters, school: e.target.value })}
                  className={`${inputClass} cursor-pointer`}
                >
                  <option value={ALL}>All schools</option>
                  {EDUVERSAL_SCHOOLS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Subject Department
                </label>
                <select
                  value={filters.subject}
                  onChange={(e) => setFilters({ ...filters, subject: e.target.value })}
                  className={`${inputClass} cursor-pointer`}
                >
                  <option value={ALL}>All subject departments</option>
                  {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Observer Role
                </label>
                <select
                  value={filters.observerRole}
                  onChange={(e) => setFilters({ ...filters, observerRole: e.target.value })}
                  className={`${inputClass} cursor-pointer`}
                >
                  <option value={ALL}>All observer roles</option>
                  {OBSERVER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Lesson Phase
                </label>
                <select
                  value={filters.lessonPhase}
                  onChange={(e) => setFilters({ ...filters, lessonPhase: e.target.value })}
                  className={`${inputClass} cursor-pointer`}
                >
                  <option value={ALL}>All lesson phases</option>
                  {LESSON_PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Document preview */}
          <div className="bg-white text-slate-900 p-5 sm:p-8 rounded-2xl shadow-xl border border-slate-200 max-w-4xl mx-auto">
            <div className="flex items-center gap-4 pb-5 border-b-2 border-[#165963]">
              <EduversalLogo variant="full" size={72} className="shrink-0" />
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-black text-[#165963] tracking-tight">
                  WALKTHROUGH REPORT
                </h1>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Educamp • Development of Teaching Proficiency, Eduversal
                </p>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 italic mt-3">
              Formative only — walkthroughs carry no score and are not used in annual appraisal
              calculations. Findings are shared directly with the teacher as developmental feedback.
            </p>

            <div className="mt-4 mb-6">
              <p className="text-sm font-bold text-slate-900">{report.scopeLine}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {report.totalVisits} visit{report.totalVisits === 1 ? '' : 's'} •{' '}
                {report.teachersVisited} teacher{report.teachersVisited === 1 ? '' : 's'} • average{' '}
                {report.averageDuration} min
              </p>
            </div>

            {report.totalVisits === 0 ? (
              <div className="flex items-start gap-2.5 p-4 rounded-xl bg-amber-50 border border-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800">
                  No walkthrough visits match this scope. Record a visit, or widen the filters.
                </p>
              </div>
            ) : (
              <>
                <section className="mb-7">
                  <h2 className="text-xs font-bold text-[#165963] uppercase tracking-wider pb-1 border-b border-slate-200 mb-3">
                    {t('wt.indicatorProfile')}
                  </h2>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#fff',
                            borderRadius: 12,
                            border: '1px solid #e2e8f0',
                            fontSize: 12,
                          }}
                          labelFormatter={(l) =>
                            chartData.find((d) => d.name === l)?.label || String(l)
                          }
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="Evident" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="Developing" stackId="a" fill="#f59e0b" />
                        <Bar dataKey="Not Observed" stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="mt-3 space-y-1.5">
                    {report.indicatorBreakdown.map((i) => (
                      <div key={i.id} className="flex items-center justify-between text-xs">
                        <span className="text-slate-700">
                          {i.id} — {i.title}
                        </span>
                        <span className="font-mono text-slate-600">
                          E {i.evident} · D {i.developing} · N {i.notObserved}
                          <span className="ml-2 font-bold text-[#165963]">
                            {i.evidentPct}% evident
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">
                    Percentages are Evident as a share of visits where the practice was observable.
                    Not Observed may reflect the lesson phase rather than absence of practice, so it
                    is excluded from that figure.
                  </p>
                </section>

                {report.keyObservations.length > 0 && (
                  <section className="mb-7">
                    <h2 className="text-xs font-bold text-[#165963] uppercase tracking-wider pb-1 border-b border-slate-200 mb-3">
                      Key Observations
                    </h2>
                    <div className="space-y-3">
                      {report.keyObservations.map((o, i) => (
                        <div key={i}>
                          <div className="text-xs font-bold text-slate-800">
                            {o.teacherName} — {o.subject}{' '}
                            <span className="font-normal text-slate-400">({o.date})</span>
                          </div>
                          <p className="text-xs text-slate-600 mt-0.5">{o.text}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {report.improvementFocuses.length > 0 && (
                  <section className="mb-7">
                    <h2 className="text-xs font-bold text-[#165963] uppercase tracking-wider pb-1 border-b border-slate-200 mb-3">
                      Notes for Improvement — Suggested Focus
                    </h2>
                    <p className="text-xs text-slate-500 mb-2">
                      Each focus is framed as an invitation to reflect before the next visit, not a
                      directive.
                    </p>
                    <div className="space-y-3">
                      {report.improvementFocuses.map((f, i) => (
                        <div key={i}>
                          <div className="text-xs font-bold text-slate-800">
                            {f.teacherName} — {f.subject}
                          </div>
                          <p className="text-xs text-slate-600 mt-0.5">{f.text}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {report.developmentPriorities.length > 0 && (
                  <section>
                    <h2 className="text-xs font-bold text-[#165963] uppercase tracking-wider pb-1 border-b border-slate-200 mb-3">
                      Department Development Priorities
                    </h2>
                    <ol className="list-decimal pl-4 text-xs text-slate-700 space-y-1">
                      {report.developmentPriorities.map((p, i) => <li key={i}>{p}</li>)}
                    </ol>
                  </section>
                )}
              </>
            )}

            <p className="text-[10px] text-slate-400 mt-8 pt-3 border-t border-slate-100">
              Educamp • Development of Teaching Proficiency, Eduversal
            </p>
          </div>
        </>
      )}
    </div>
  );
};
