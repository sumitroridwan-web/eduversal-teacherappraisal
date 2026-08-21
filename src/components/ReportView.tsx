import React, { useRef, useState } from 'react';
import {
  Download,
  Printer,
  ArrowLeft,
  Award,
  CheckCircle2,
  Calendar,
  Clock,
  User,
  GraduationCap,
  Building,
  ShieldCheck,
  Sparkles,
  FileCheck,
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { TeacherAppraisalRecord } from '../types';
import { EduversalLogo } from './EduversalLogo';
import {
  getItemsForLevel,
  calculateF2Scores,
  calculateF2Predicate,
  COVERAGE_FLOOR,
  LEVEL_SCORING_CONFIGS,
} from '../data/frameworkRubrics';

interface ReportViewProps {
  record: TeacherAppraisalRecord;
  onBack: () => void;
}

export const ReportView: React.FC<ReportViewProps> = ({ record, onBack }) => {
  const [isExporting, setIsExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const items = getItemsForLevel(record.careerLevel);
  const config = LEVEL_SCORING_CONFIGS[record.careerLevel];
  const stats = calculateF2Scores(record.careerLevel, record.scores);
  const comp = calculateF2Predicate(stats.percentage);

  // Only captioned photos carry meaning in a report, so uncaptioned ones are
  // left out rather than printed as unexplained images.
  // How much of this appraisal is the appraiser's own judgement?
  const aiRatingCounts = (Object.values(record.scores) as Array<{ score: any; origin?: string }>)
    .filter((e) => typeof e?.score === 'number')
    .reduce(
      (acc, e) => {
        acc.total++;
        if (e.origin === 'ai-suggested') acc.unconfirmed++;
        else if (e.origin === 'ai-confirmed') acc.confirmed++;
        else acc.observer++;
        return acc;
      },
      { total: 0, observer: 0, confirmed: 0, unconfirmed: 0 }
    );

  const captionedPhotos = (record.photos || []).filter((p) => p.caption.trim());
  const bestPractices = captionedPhotos.filter((p) => p.isBestPractice);

  // Group items by Domain
  const domainGroups: Record<string, typeof items> = {};
  items.forEach((item) => {
    if (!domainGroups[item.domainId]) {
      domainGroups[item.domainId] = [];
    }
    domainGroups[item.domainId].push(item);
  });

  // Export to PDF using html2canvas + jsPDF
  const handleExportPdf = async () => {
    if (!reportRef.current) return;
    setIsExporting(true);

    try {
      const element = reportRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      const fileName = `Eduversal_Appraisal_${record.teacherName.replace(/\s+/g, '_')}_${record.observationDate}.pdf`;
      pdf.save(fileName);
    } catch (err) {
      console.error('PDF export failed:', err);
      window.print();
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Header Actions (Non-printable) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden text-slate-800">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center justify-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer min-h-[40px]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Observation Sheet</span>
        </button>

        <div className="grid grid-cols-1 sm:flex sm:items-center gap-2">
          <button
            id="btn-print-report"
            type="button"
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 transition cursor-pointer shadow-2xs min-h-[40px]"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            <span>Browser Print</span>
          </button>

          <button
            id="btn-download-pdf"
            type="button"
            onClick={handleExportPdf}
            disabled={isExporting}
            className="flex items-center justify-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer min-h-[40px]"
          >
            <Download className="w-4 h-4" />
            <span>{isExporting ? 'Generating PDF...' : 'Download Official PDF Report'}</span>
          </button>
        </div>
      </div>

      {/* Printable Report Canvas */}
      <div
        ref={reportRef}
        id="appraisal-printable-report"
        className="bg-white text-slate-900 p-4 sm:p-8 lg:p-12 rounded-2xl shadow-2xl border border-slate-200 max-w-5xl mx-auto font-sans print:shadow-none print:border-none print:p-0 overflow-x-hidden"
      >
        {/* Official Header with Eduversal Logo */}
        <div className="border-b-2 border-slate-900 pb-6 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-1.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
                <EduversalLogo variant="full" size={72} />
              </div>
              <div>
                <div className="text-[11px] font-bold text-teal-800 uppercase tracking-widest mb-0.5">
                  Eduversal Partner Schools • Academic Quality Assurance Directorate
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  TEACHER CLASSROOM OBSERVATION REPORT
                </h1>
                <p className="text-xs text-slate-600 mt-0.5">
                  Framework 2 (Classroom Observation) &amp; Pedagogical Growth Debrief • v2.1 (2026-2027)
                </p>
              </div>
            </div>

            <div className="text-right sm:self-start">
              <div className="inline-block px-3 py-1 bg-slate-100 border border-slate-300 rounded text-[11px] font-mono font-bold text-slate-700 mb-1">
                DOC ID: EDU-QA-HG-002
              </div>
              <div className="text-xs text-slate-500">
                Evaluation Level:{' '}
                <strong className="text-slate-900 font-semibold">{record.careerLevel} Level</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Teacher & Observation Metadata Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs mb-6">
          <div>
            <span className="text-slate-500 block">School / Campus:</span>
            <strong className="text-teal-900 text-sm font-bold block">{record.schoolName || 'Eduversal Partner School'}</strong>
            <span className="text-slate-500 text-[11px]">{record.schoolLevel}</span>
          </div>

          <div>
            <span className="text-slate-500 block">Teacher Name:</span>
            <strong className="text-slate-900 text-sm font-bold block">{record.teacherName || '—'}</strong>
            <span className="text-slate-500 text-[11px]">{record.teacherEmail || `${record.careerLevel} Level Teacher`}</span>
          </div>

          <div>
            <span className="text-slate-500 block">Subject / Grade:</span>
            <strong className="text-slate-900 font-bold block">{record.subject || record.subjectCategory}</strong>
            <span className="text-slate-500 text-[11px]">{record.gradeClass || record.subjectCategory}</span>
          </div>

          <div>
            <span className="text-slate-500 block">Observation Date &amp; Timing:</span>
            <strong className="text-slate-900 font-bold block">{record.observationDate}</strong>
            <span className="text-slate-500 text-[11px]">
              {record.timeIn || '--:--'} – {record.timeOut || '--:--'} ({record.durationMinutes || 45} mins)
            </span>
          </div>

          <div className="col-span-2">
            <span className="text-slate-500 block">Observed Lesson Topic:</span>
            <strong className="text-slate-900 font-semibold">{record.lessonTopic || 'Standard Curricular Unit'}</strong>
          </div>

          <div className="col-span-2">
            <span className="text-slate-500 block">Appraiser (Lead Evaluator):</span>
            <strong className="text-slate-900 font-semibold">
              {record.appraiserName} ({record.appraiserRole})
            </strong>
          </div>
        </div>

        {/* Executive Score Summary Banner */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 p-5 bg-gradient-to-r from-slate-900 to-sky-950 text-white rounded-xl mb-6 shadow-md">
          {/* Section Raw Scores */}
          <div className="md:col-span-8 grid grid-cols-3 gap-3 self-center">
            <div className="p-3 bg-white/10 rounded-lg border border-white/10">
              <span className="text-[10px] text-slate-300 uppercase tracking-wider block font-semibold">
                A) Pre-Visit / Plan
              </span>
              <div className="text-xl font-bold font-mono mt-0.5">
                {stats.rawA} <span className="text-xs text-slate-400 font-normal">/ {stats.maxA}</span>
              </div>
            </div>

            <div className="p-3 bg-white/10 rounded-lg border border-white/10">
              <span className="text-[10px] text-slate-300 uppercase tracking-wider block font-semibold">
                B) Live Observation
              </span>
              <div className="text-xl font-bold font-mono mt-0.5">
                {stats.rawB} <span className="text-xs text-slate-400 font-normal">/ {stats.maxB}</span>
              </div>
            </div>

            <div className="p-3 bg-white/10 rounded-lg border border-white/10">
              <span className="text-[10px] text-slate-300 uppercase tracking-wider block font-semibold">
                C) Post-Lesson Sheet
              </span>
              <div className="text-xl font-bold font-mono mt-0.5">
                {stats.rawC} <span className="text-xs text-slate-400 font-normal">/ {stats.maxC}</span>
              </div>
            </div>

            {/* Total F2 */}
            <div className="col-span-3 pt-2 flex items-center justify-between border-t border-white/10 text-xs">
              <span className="text-slate-300">
                Total Framework 2 Observation Score:{' '}
                <strong className="text-sky-300 font-mono text-sm">
                  {stats.totalRaw} / {stats.maxTotal} ({stats.percentage}%)
                </strong>
              </span>
              <span className="text-emerald-300 font-semibold">
                {stats.itemsScored} of {stats.totalItems} indicators assessed
              </span>
            </div>
          </div>

          {/* Indicative Reading Badge */}
          <div className="md:col-span-4 flex flex-col items-center justify-center p-3 bg-white/10 rounded-lg border border-white/15 text-center">
            <span className="text-[10px] text-slate-300 uppercase tracking-wider font-semibold">
              F2 Indicative Reading
            </span>
            {stats.provisional ? (
              <>
                <div className="text-xl font-black font-mono text-slate-200 my-1">Provisional</div>
                <span className="text-[11px] text-slate-200">
                  {stats.itemsScored} of {stats.totalItems} rated — below the{' '}
                  {Math.round(COVERAGE_FLOOR * 100)}% needed to publish a grade
                </span>
              </>
            ) : (
              <>
                <div className="text-3xl font-black font-mono text-emerald-400 my-1">
                  Grade {stats.grade}
                </div>
                <span className="text-[11px] text-slate-200">
                  {stats.grade === 'A'
                    ? 'Excellent (152–180)'
                    : stats.grade === 'B'
                    ? 'Good (117–151)'
                    : stats.grade === 'C'
                    ? 'Satisfactory (90–116)'
                    : stats.grade === 'D'
                    ? 'Needs Improvement (64–89)'
                    : 'Unsatisfactory (0–63)'}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Framework 2 Observation Result */}
        <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h3 className="font-bold text-slate-900 uppercase tracking-wider text-xs flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-sky-700" />
              Framework 2 Classroom Observation Result
            </h3>
            <span className="text-slate-500 text-[11px]">
              Performance Band: <strong className="text-sky-800">{comp.predicate} ({comp.f2Percent}%)</strong>
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-2 bg-sky-50 rounded-lg border border-sky-200">
              <div className="text-[10px] text-sky-800 font-semibold">F2 Observed Score</div>
              <div className="font-bold font-mono text-sky-900 text-sm mt-0.5">{comp.f2Percent}%</div>
            </div>
            <div className="p-2 bg-white rounded-lg border border-slate-200">
              <div className="text-[10px] text-slate-500">Raw Points</div>
              <div className="font-bold font-mono text-slate-800 text-sm mt-0.5">
                {stats.totalRaw} / {stats.maxTotal}
              </div>
            </div>
            <div className="p-2 bg-white rounded-lg border border-slate-200">
              <div className="text-[10px] text-slate-500">Indicative Grade</div>
              <div
                className={`font-bold font-mono text-sm mt-0.5 ${
                  stats.provisional ? 'text-slate-400' : 'text-slate-800'
                }`}
              >
                {stats.provisional ? 'Withheld' : stats.grade}
              </div>
            </div>
            <div className="p-2 bg-white rounded-lg border border-slate-200">
              <div className="text-[10px] text-slate-500">Indicators Rated</div>
              <div
                className={`font-bold font-mono text-sm mt-0.5 ${
                  stats.isComplete ? 'text-slate-800' : 'text-amber-700'
                }`}
              >
                {stats.itemsScored} / {stats.totalItems}
              </div>
            </div>
          </div>
        </div>

        {/* Scope of judgement: what this result does and does not cover */}
        <div className="mb-6 text-[11px] text-slate-600 leading-relaxed">
          {stats.provisional && (
            <p className="mb-1 p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
              <strong>No grade is published for this observation.</strong> {stats.itemsScored} of{' '}
              {stats.totalItems} indicators were rated, below the{' '}
              {Math.round(COVERAGE_FLOOR * 100)}% of the framework this school requires before a
              letter grade can stand. The ratings below are reported as they were made; the result
              is a partial reading of the lesson, not a grade for it.
            </p>
          )}
          {!stats.isComplete && (
            <p className="mb-1">
              <strong>Scope:</strong> {stats.itemsScored} of {stats.totalItems} indicators were
              evidenced during this observation. Attainment is calculated across those rated
              indicators only; the remaining {stats.totalItems - stats.itemsScored} are reported
              as not evidenced and are not counted against the teacher.
            </p>
          )}
          {aiRatingCounts.total > 0 && (
            <p>
              <strong>Rating provenance:</strong> {aiRatingCounts.observer} rated directly by the
              appraiser, {aiRatingCounts.confirmed} AI-suggested and confirmed by the appraiser
              {aiRatingCounts.unconfirmed > 0 && (
                <span className="text-amber-700 font-semibold">
                  , {aiRatingCounts.unconfirmed} AI-suggested and not yet confirmed
                </span>
              )}
              .
            </p>
          )}
        </div>

        {/* Classroom Conditions Read Against Management Theory */}
        {record.aiAnalysis?.classroomConditions && record.aiAnalysis.classroomConditions.length > 0 && (
          <div className="mb-8">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 pb-1 border-b border-slate-200 flex items-center justify-between">
              <span>Classroom Conditions &amp; Management Analysis</span>
              <span className="text-[10px] text-slate-500 font-normal">Evidenced from lesson audio</span>
            </h3>

            <div className="space-y-2.5 text-xs">
              {record.aiAnalysis.classroomConditions.map((c, i) => (
                <div key={i} className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                      {c.timeLabel}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                      {c.theory}
                    </span>
                    {c.impact && (
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                          c.impact === 'Supports Learning'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : c.impact === 'Disrupts Learning'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {c.impact}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-800 font-medium">{c.condition}</p>
                  <p className="text-slate-600 mt-0.5">{c.interpretation}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Captioned Photo Evidence */}
        {captionedPhotos.length > 0 && (
          <div className="mb-8">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 pb-1 border-b border-slate-200 flex items-center justify-between">
              <span>Classroom Photo Evidence ({captionedPhotos.length})</span>
              <span className="text-[10px] text-slate-500 font-normal">Captured during observation</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {captionedPhotos.map((photo) => (
                <figure key={photo.id} className="border border-slate-200 rounded-xl overflow-hidden bg-white break-inside-avoid">
                  {photo.dataUrl ? (
                    <img
                      src={photo.dataUrl}
                      alt={photo.caption}
                      className="w-full h-32 object-cover"
                    />
                  ) : (
                    <div className="w-full h-32 bg-slate-50 border-b border-slate-200 flex items-center justify-center text-center px-2 text-[10px] text-slate-400 leading-snug">
                      Photo is stored on the device that captured it
                    </div>
                  )}
                  <figcaption className="p-2 text-[11px] text-slate-700 leading-snug">
                    {photo.caption}
                    {photo.isBestPractice && (
                      <span className="block mt-1 text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                        Best Practice
                      </span>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        )}

        {/* Shareable Best Practices */}
        {bestPractices.length > 0 && (
          <div className="mb-8">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 pb-1 border-b border-slate-200 flex items-center justify-between">
              <span>Lesson Best Practices to Share ({bestPractices.length})</span>
              <span className="text-[10px] text-slate-500 font-normal">For departmental dissemination</span>
            </h3>

            <div className="space-y-2 text-xs">
              {bestPractices.map((photo, i) => (
                <div key={photo.id} className="flex gap-3 p-2.5 rounded-xl border border-amber-200 bg-amber-50/60">
                  {photo.dataUrl ? (
                    <img
                      src={photo.dataUrl}
                      alt={photo.caption}
                      className="w-16 h-16 object-cover rounded-lg border border-amber-200 shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg border border-amber-200 bg-amber-100/60 shrink-0 flex items-center justify-center text-[9px] text-amber-700 text-center leading-tight px-1">
                      On capturing device
                    </div>
                  )}
                  <div>
                    <div className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                      Practice {i + 1}
                    </div>
                    <p className="text-slate-800 mt-0.5">{photo.caption}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Teacher Acknowledgement */}
        {record.teacherAcknowledgement && record.teacherAcknowledgement.status !== 'Pending' && (
          <div className="mb-8">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 pb-1 border-b border-slate-200">
              Teacher Acknowledgement &amp; Response
            </h3>
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`font-bold px-2 py-0.5 rounded border text-[11px] ${
                    record.teacherAcknowledgement.status === 'Disagrees'
                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}
                >
                  {record.teacherAcknowledgement.status}
                </span>
                {record.teacherAcknowledgement.date && (
                  <span className="text-slate-500">on {record.teacherAcknowledgement.date}</span>
                )}
              </div>
              {record.teacherAcknowledgement.comment && (
                <p className="text-slate-700 mt-2 italic">
                  &ldquo;{record.teacherAcknowledgement.comment}&rdquo;
                </p>
              )}
            </div>
          </div>
        )}

        {/* Structured Lesson Activities & Observation Timeline */}
        {record.activities && record.activities.length > 0 && (
          <div className="mb-8">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 pb-1 border-b border-slate-200 flex items-center justify-between">
              <span>Observed Lesson Activities Timeline ({record.activities.length} Phases Recorded)</span>
              <span className="text-[10px] text-slate-500 font-normal">Framework 2 Evidence Verification</span>
            </h3>

            <div className="space-y-2.5 text-xs">
              {record.activities.map((act, index) => (
                <div key={act.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-teal-100 text-teal-800 font-mono font-bold text-[10px] flex items-center justify-center">
                        {index + 1}
                      </span>
                      <strong className="text-slate-900 text-xs">{act.name}</strong>
                      {act.modality && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white text-slate-600 border border-slate-200">
                          {act.modality}
                        </span>
                      )}
                    </div>
                    {(act.timeRange || act.durationMinutes) && (
                      <span className="text-[10px] text-slate-500 font-mono">
                        {act.timeRange || `${act.durationMinutes} mins`}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] mt-1 pt-1.5 border-t border-slate-100">
                    {act.teacherNotes && (
                      <div>
                        <span className="font-semibold text-slate-700 block mb-0.5">Teacher Actions:</span>
                        <p className="text-slate-600 leading-snug">{act.teacherNotes}</p>
                      </div>
                    )}
                    {act.studentEvidenceNotes && (
                      <div>
                        <span className="font-semibold text-teal-800 block mb-0.5">Student Observable Evidence:</span>
                        <p className="text-teal-950 leading-snug">{act.studentEvidenceNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Glow / Grow / Go Protocol Action Plan */}
        <div className="mb-8">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 pb-1 border-b border-slate-200">
            Post-Observation Debriefing &amp; Glow / Grow / Go Protocol
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* Glow */}
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl">
              <h4 className="font-bold text-emerald-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                Glow (Strengths &amp; Commendations)
              </h4>
              <ul className="space-y-1.5 text-emerald-950">
                {record.feedback.glow && record.feedback.glow.length > 0 ? (
                  record.feedback.glow.map((g, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-emerald-700 font-bold">•</span>
                      <span>{g}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-slate-400 italic">No specific glow points entered.</li>
                )}
              </ul>
            </div>

            {/* Grow */}
            <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl">
              <h4 className="font-bold text-amber-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-600" />
                Grow (Reflective Coaching Questions)
              </h4>
              <ul className="space-y-1.5 text-amber-950">
                {record.feedback.grow && record.feedback.grow.length > 0 ? (
                  record.feedback.grow.map((g, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-amber-700 font-bold">•</span>
                      <span>{g}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-slate-400 italic">No specific grow questions recorded.</li>
                )}
              </ul>
            </div>

            {/* Go */}
            <div className="p-4 bg-sky-50/70 border border-sky-200 rounded-xl">
              <h4 className="font-bold text-sky-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-600" />
                Go (Agreed Next Steps &amp; Commitments)
              </h4>
              <ul className="space-y-1.5 text-sky-950">
                {record.feedback.go && record.feedback.go.length > 0 ? (
                  record.feedback.go.map((g, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-sky-700 font-bold">•</span>
                      <span>{g}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-slate-400 italic">No specific action steps agreed.</li>
                )}
              </ul>
            </div>
          </div>

          {/* Observer Narrative */}
          {record.generalObserverNotes && (
            <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <strong className="text-slate-900 block mb-1">Appraiser General Observation Narrative:</strong>
              <p className="text-slate-700 leading-relaxed">{record.generalObserverNotes}</p>
            </div>
          )}
        </div>

        {/* Itemized Indicator Score Matrix */}
        <div className="mb-8">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 pb-1 border-b border-slate-200">
            Itemized Framework 2 Observation Indicators
          </h3>

          <div className="space-y-4">
            {Object.entries(domainGroups).map(([domainName, domainItems]) => (
              <div key={domainName} className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <div className="bg-slate-100 px-4 py-2 font-bold text-slate-800 flex items-center justify-between">
                  <span>{domainName}</span>
                  <span className="text-[11px] text-slate-500">{domainItems.length} Indicators</span>
                </div>

                <div className="divide-y divide-slate-200">
                  {domainItems.map((item) => {
                    const scoreRec = record.scores[item.id] || { score: null, notes: '' };
                    const sc = scoreRec.score;
                    return (
                      <div key={item.id} className="p-3 flex items-start justify-between gap-4 hover:bg-slate-50">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-mono font-bold text-slate-900 px-1.5 py-0.5 bg-slate-200 rounded text-[11px]">
                              {item.id}
                            </span>
                            <span className="font-semibold text-slate-900">{item.title}</span>
                          </div>
                          <p className="text-[11px] text-slate-600">
                            {sc ? item.descriptors[sc] : 'Not yet scored.'}
                          </p>
                        </div>

                        {/* Score Tag */}
                        <div className="shrink-0 text-right">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm mx-auto ${
                              sc === 4
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : sc === 3
                                ? 'bg-sky-100 text-sky-800 border border-sky-300'
                                : sc === 2
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : sc === 1
                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                : 'bg-slate-100 text-slate-400 border border-slate-200'
                            }`}
                          >
                            {sc || '—'}
                          </div>
                          <span className="text-[9px] text-slate-500 block mt-0.5">
                            {sc === 4 ? 'Distinguished' : sc === 3 ? 'Proficient' : sc === 2 ? 'Basic' : sc === 1 ? 'Unsat' : 'Unrated'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Level Progression Evaluation */}
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs mb-8">
          <h4 className="font-bold text-slate-900 uppercase tracking-wider mb-1.5 flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-600" />
            Career Level Progression Readiness &amp; Status
          </h4>
          <p className="text-slate-700 leading-relaxed">{config.progressionRequirements}</p>
        </div>

        {/* Formal Signature Blocks */}
        <div className="pt-8 border-t-2 border-slate-900 grid grid-cols-3 gap-6 text-xs text-center">
          <div>
            <div className="h-16 border-b border-slate-400 mb-2 flex items-end justify-center pb-1 font-signature text-slate-600 italic">
              {record.teacherName}
            </div>
            <strong className="text-slate-900 block">{record.teacherName || 'Teacher'}</strong>
            <span className="text-slate-500 text-[11px]">Appraisee (Teacher Signature)</span>
          </div>

          <div>
            <div className="h-16 border-b border-slate-400 mb-2 flex items-end justify-center pb-1 font-signature text-slate-600 italic">
              {record.appraiserName}
            </div>
            <strong className="text-slate-900 block">{record.appraiserName}</strong>
            <span className="text-slate-500 text-[11px]">Visiting Appraiser Signature</span>
          </div>

          <div>
            <div className="h-16 border-b border-slate-400 mb-2 flex items-end justify-center pb-1 font-signature text-slate-600 italic">
              Academic Quality Board
            </div>
            <strong className="text-slate-900 block">Eduversal Academic Coordinator</strong>
            <span className="text-slate-500 text-[11px]">School Principal / Academic Hub</span>
          </div>
        </div>

        {/* Report Footer */}
        <div className="mt-8 pt-4 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-500">
          <span>Eduversal © 2026 • Confidential – For Official School &amp; Academic Hub Use Only</span>
          <span>Generated via Eduversal Teacher Appraisal Platform • Permendikbud &amp; Cambridge Aligned</span>
        </div>
      </div>
    </div>
  );
};
