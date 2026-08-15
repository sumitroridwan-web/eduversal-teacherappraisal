import { jsPDF } from 'jspdf';
import { TeacherAppraisalRecord } from '../types';
import { calculateF2Scores, calculateF2Predicate, getItemsForLevel } from '../data/frameworkRubrics';

export interface SchoolReportFilters {
  academicYear: string;
  school: string;
  schoolLevel: string;
  subjectCategory: string;
  careerLevel: string;
}

export const ALL = 'All';

export interface ObservationSummary {
  teacherName: string;
  subject: string;
  schoolName: string;
  schoolLevel: string;
  careerLevel: string;
  observationDate: string;
  academicYear: string;
  rawScore: number;
  maxScore: number;
  percentage: number;
  grade: string;
  predicate: string;
  ratedCount: number;
  notObservableCount: number;
  strengths: string[];
  improvementAreas: string[];
  growthActions: string[];
}

export interface SchoolReportData {
  generatedAt: string;
  filters: SchoolReportFilters;
  scopeLine: string;
  totalObservations: number;
  averagePercentage: number;
  gradeDistribution: Record<string, number>;
  domainAverages: Array<{ domain: string; score: number; rated: number }>;
  observations: ObservationSummary[];
  priorityImprovements: string[];
  bestPractices: Array<{ caption: string; teacherName: string }>;
  totalNotObservable: number;
}

const DOMAIN_BUCKETS: Array<{ key: string; label: string; prefixes: string[] }> = [
  { key: 'd1', label: 'Domain 1: Lesson Planning', prefixes: ['D1.', 'EYD1.'] },
  { key: 'd2', label: 'Domain 2: Classroom Environment', prefixes: ['D2.', 'EYD2.'] },
  { key: 'd3', label: 'Domain 3: Instructional Process', prefixes: ['D3.', 'EYD3.'] },
  { key: 'd4', label: 'Domain 4: Assessment & Reflection', prefixes: ['D4.', 'EYD4.'] },
];

export function filterAppraisals(
  appraisals: TeacherAppraisalRecord[],
  filters: SchoolReportFilters
): TeacherAppraisalRecord[] {
  return appraisals.filter(
    (a) =>
      (filters.academicYear === ALL || a.academicYear === filters.academicYear) &&
      (filters.school === ALL || a.schoolName === filters.school) &&
      (filters.schoolLevel === ALL || a.schoolLevel === filters.schoolLevel) &&
      (filters.subjectCategory === ALL || a.subjectCategory === filters.subjectCategory) &&
      (filters.careerLevel === ALL || a.careerLevel === filters.careerLevel)
  );
}

function describeScope(filters: SchoolReportFilters): string {
  const parts: string[] = [];
  if (filters.academicYear !== ALL) parts.push(`Academic Year ${filters.academicYear}`);
  if (filters.school !== ALL) parts.push(filters.school);
  if (filters.schoolLevel !== ALL) parts.push(filters.schoolLevel);
  if (filters.subjectCategory !== ALL) parts.push(filters.subjectCategory);
  if (filters.careerLevel !== ALL) parts.push(`${filters.careerLevel} Level`);
  return parts.length ? parts.join(' • ') : 'All observations across the Eduversal network';
}

export function buildSchoolReport(
  appraisals: TeacherAppraisalRecord[],
  filters: SchoolReportFilters
): SchoolReportData {
  const scoped = filterAppraisals(appraisals, filters);

  const gradeDistribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  const domainTotals: Record<string, { sum: number; count: number }> = {};
  DOMAIN_BUCKETS.forEach((b) => (domainTotals[b.key] = { sum: 0, count: 0 }));

  const improvementTally = new Map<string, number>();
  const bestPractices: Array<{ caption: string; teacherName: string }> = [];

  let percentageSum = 0;
  let totalNotObservable = 0;

  const observations: ObservationSummary[] = scoped.map((record) => {
    const stats = calculateF2Scores(record.careerLevel, record.scores);
    const band = calculateF2Predicate(stats.percentage);
    const items = getItemsForLevel(record.careerLevel);

    gradeDistribution[stats.grade] = (gradeDistribution[stats.grade] || 0) + 1;
    percentageSum += stats.percentage;

    let ratedCount = 0;
    let notObservable = 0;

    const strong: Array<{ title: string; score: number }> = [];
    const weak: Array<{ title: string; score: number; note: string }> = [];

    items.forEach((item) => {
      const entry = record.scores?.[item.id];
      const score = entry?.score;

      if (typeof score !== 'number') {
        notObservable++;
        return;
      }
      ratedCount++;

      DOMAIN_BUCKETS.forEach((bucket) => {
        if (bucket.prefixes.some((p) => item.id.startsWith(p))) {
          domainTotals[bucket.key].sum += (score / 4) * 100;
          domainTotals[bucket.key].count += 1;
        }
      });

      if (score >= 3) strong.push({ title: item.title, score });
      if (score <= 2) {
        weak.push({ title: item.title, score, note: entry?.notes || '' });
        improvementTally.set(item.title, (improvementTally.get(item.title) || 0) + 1);
      }
    });

    totalNotObservable += notObservable;

    (record.photos || [])
      .filter((p) => p.isBestPractice && p.caption.trim())
      .forEach((p) =>
        bestPractices.push({ caption: p.caption.trim(), teacherName: record.teacherName })
      );

    return {
      teacherName: record.teacherName || 'Unnamed teacher',
      subject: record.subject || record.subjectCategory,
      schoolName: record.schoolName || 'Eduversal Partner School',
      schoolLevel: record.schoolLevel,
      careerLevel: record.careerLevel,
      observationDate: record.observationDate,
      academicYear: record.academicYear,
      rawScore: stats.totalRaw,
      maxScore: stats.maxTotal,
      percentage: stats.percentage,
      grade: stats.grade,
      predicate: band.predicate,
      ratedCount,
      notObservableCount: notObservable,
      strengths: strong
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((s) => s.title),
      improvementAreas: weak
        .sort((a, b) => a.score - b.score)
        .slice(0, 3)
        .map((w) => `${w.title} (rated ${w.score})`),
      growthActions: [...(record.feedback?.grow || []), ...(record.feedback?.go || [])].slice(0, 3),
    };
  });

  const domainAverages = DOMAIN_BUCKETS.map((bucket) => {
    const t = domainTotals[bucket.key];
    return {
      domain: bucket.label,
      score: t.count ? Math.round(t.sum / t.count) : 0,
      rated: t.count,
    };
  });

  const priorityImprovements = [...improvementTally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([title, count]) =>
      `${title} - rated Basic or below in ${count} of ${observations.length} observation${
        observations.length === 1 ? '' : 's'
      }`
    );

  return {
    generatedAt: new Date().toISOString(),
    filters,
    scopeLine: describeScope(filters),
    totalObservations: observations.length,
    averagePercentage: observations.length
      ? Math.round((percentageSum / observations.length) * 10) / 10
      : 0,
    gradeDistribution,
    domainAverages,
    observations,
    priorityImprovements,
    bestPractices,
    totalNotObservable,
  };
}

/* ------------------------------------------------------------------ *
 * PDF
 * Drawn with the jsPDF text API rather than a canvas snapshot, so the
 * document has selectable, searchable text and real pagination.
 * ------------------------------------------------------------------ */

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;
const TEAL = [22, 89, 99] as const;
const SLATE = [71, 85, 105] as const;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function generateSchoolReportPdf(data: SchoolReportData): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4');
  let y = MARGIN;

  const ensureSpace = (needed: number) => {
    if (y + needed <= PAGE_H - MARGIN - 8) return;
    doc.addPage();
    y = MARGIN;
  };

  const heading = (text: string) => {
    ensureSpace(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(TEAL[0], TEAL[1], TEAL[2]);
    doc.text(text.toUpperCase(), MARGIN, y);
    y += 2;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 5;
    doc.setTextColor(15, 23, 42);
  };

  const body = (text: string, indent = 0, size = 9.5) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
    const lines = doc.splitTextToSize(text, CONTENT_W - indent);
    lines.forEach((line: string) => {
      ensureSpace(5);
      doc.text(line, MARGIN + indent, y);
      y += 4.4;
    });
  };

  // --- Title block ---
  doc.setFillColor(TEAL[0], TEAL[1], TEAL[2]);
  doc.rect(0, 0, PAGE_W, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('EDUVERSAL SCHOOL OBSERVATION REPORT', MARGIN, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Framework 2 - Classroom Observation & Quality Assurance', MARGIN, 19.5);
  y = 34;

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(data.scopeLine, MARGIN, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
  doc.text(
    `Generated ${formatDate(data.generatedAt)} • ${data.totalObservations} observation${
      data.totalObservations === 1 ? '' : 's'
    } in scope`,
    MARGIN,
    y
  );
  y += 9;

  // --- Executive summary ---
  heading('Executive Summary');
  if (!data.totalObservations) {
    body('No observations match the selected filters, so no findings can be reported.');
  } else {
    body(
      `Average Framework 2 attainment across the ${data.totalObservations} observation${
        data.totalObservations === 1 ? '' : 's'
      } in scope is ${data.averagePercentage}%. Grades awarded: ` +
        Object.entries(data.gradeDistribution)
          .filter(([, n]) => n > 0)
          .map(([g, n]) => `${n} x Grade ${g}`)
          .join(', ') +
        '.'
    );
    if (data.totalNotObservable > 0) {
      body(
        `${data.totalNotObservable} indicator ratings across the cohort were recorded as not observable - the captured evidence did not speak to them. These are excluded from attainment rather than counted as failures.`
      );
    }
    y += 2;

    heading('Domain Attainment');
    data.domainAverages.forEach((d) => {
      ensureSpace(7);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(d.domain, MARGIN, y);

      const label = d.rated ? `${d.score}%` : 'Not observed';
      doc.setFont('helvetica', 'bold');
      doc.text(label, PAGE_W - MARGIN, y, { align: 'right' });

      // Attainment bar
      const barY = y + 1.6;
      doc.setFillColor(226, 232, 240);
      doc.rect(MARGIN, barY, CONTENT_W, 1.8, 'F');
      if (d.rated) {
        doc.setFillColor(TEAL[0], TEAL[1], TEAL[2]);
        doc.rect(MARGIN, barY, (CONTENT_W * Math.min(100, d.score)) / 100, 1.8, 'F');
      }
      y += 8;
    });
    y += 2;
  }

  // --- Key observations ---
  if (data.observations.length) {
    heading('Key Observations');
    data.observations.forEach((o, i) => {
      ensureSpace(30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(`${i + 1}. ${o.teacherName} - ${o.subject}`, MARGIN, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(TEAL[0], TEAL[1], TEAL[2]);
      doc.text(`${o.percentage}% • Grade ${o.grade}`, PAGE_W - MARGIN, y, { align: 'right' });
      y += 4.6;

      body(
        `${o.schoolName} • ${o.schoolLevel} • ${o.careerLevel} Level • Observed ${formatDate(
          o.observationDate
        )} • AY ${o.academicYear}`,
        0,
        8.5
      );
      body(
        `Result: ${o.rawScore}/${o.maxScore} (${o.predicate}). ${o.ratedCount} indicators rated${
          o.notObservableCount ? `, ${o.notObservableCount} not observable` : ''
        }.`,
        0,
        8.5
      );

      if (o.strengths.length) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        ensureSpace(5);
        doc.text('Strengths:', MARGIN, y);
        y += 4;
        o.strengths.forEach((s) => body(`• ${s}`, 4, 8.5));
      }

      if (o.improvementAreas.length) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        ensureSpace(5);
        doc.text('Areas for improvement:', MARGIN, y);
        y += 4;
        o.improvementAreas.forEach((s) => body(`• ${s}`, 4, 8.5));
      }

      if (o.growthActions.length) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        ensureSpace(5);
        doc.text('Agreed next steps:', MARGIN, y);
        y += 4;
        o.growthActions.forEach((s) => body(`• ${s}`, 4, 8.5));
      }

      y += 4;
    });
  }

  // --- Priority improvements ---
  if (data.priorityImprovements.length) {
    heading('Notes for Improvement - Cohort Priorities');
    body(
      'Indicators most frequently rated Basic or below across the observations in scope. These are the highest-leverage focus areas for departmental coaching and INSET planning.'
    );
    y += 1;
    data.priorityImprovements.forEach((p, i) => body(`${i + 1}. ${p}`, 2));
    y += 3;
  }

  // --- Best practices ---
  if (data.bestPractices.length) {
    heading('Best Practices to Share');
    data.bestPractices.forEach((b) => body(`• ${b.caption} (${b.teacherName})`, 2));
  }

  // --- Page furniture ---
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      'Eduversal Academic Quality Assurance Directorate • Framework 2',
      MARGIN,
      PAGE_H - 10
    );
    doc.text(`Page ${p} of ${pageCount}`, PAGE_W - MARGIN, PAGE_H - 10, { align: 'right' });
  }

  return doc;
}

/* ------------------------------------------------------------------ *
 * Word document
 *
 * Emitted as Word-compatible HTML rather than true OOXML: it opens with
 * full formatting in Word, Pages and Google Docs, and needs no additional
 * dependency to produce.
 * ------------------------------------------------------------------ */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generateSchoolReportDoc(data: SchoolReportData): Blob {
  const list = (items: string[]) =>
    items.length ? `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '';

  const observations = data.observations
    .map(
      (o, i) => `
      <div class="obs">
        <h3>${i + 1}. ${escapeHtml(o.teacherName)} &ndash; ${escapeHtml(o.subject)}</h3>
        <p class="meta">${escapeHtml(o.schoolName)} &bull; ${escapeHtml(o.schoolLevel)} &bull;
        ${escapeHtml(o.careerLevel)} Level &bull; Observed ${formatDate(o.observationDate)}
        &bull; AY ${escapeHtml(o.academicYear)}</p>
        <p><strong>Result:</strong> ${o.rawScore}/${o.maxScore} (${o.percentage}%) &ndash;
        Grade ${escapeHtml(o.grade)}, ${escapeHtml(o.predicate)}.
        ${o.ratedCount} indicators rated${
          o.notObservableCount ? `, ${o.notObservableCount} not observable` : ''
        }.</p>
        ${o.strengths.length ? `<p><strong>Strengths</strong></p>${list(o.strengths)}` : ''}
        ${
          o.improvementAreas.length
            ? `<p><strong>Areas for improvement</strong></p>${list(o.improvementAreas)}`
            : ''
        }
        ${
          o.growthActions.length
            ? `<p><strong>Agreed next steps</strong></p>${list(o.growthActions)}`
            : ''
        }
      </div>`
    )
    .join('');

  const gradeSummary = Object.entries(data.gradeDistribution)
    .filter(([, n]) => n > 0)
    .map(([g, n]) => `${n} &times; Grade ${g}`)
    .join(', ');

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="utf-8" />
<title>Eduversal School Observation Report</title>
<style>
  @page { size: A4; margin: 2cm; }
  body { font-family: Calibri, Arial, sans-serif; color: #0f172a; font-size: 11pt; line-height: 1.45; }
  h1 { font-size: 18pt; color: #165963; margin: 0 0 4pt; }
  h2 { font-size: 12pt; color: #165963; border-bottom: 1px solid #cbd5e1; padding-bottom: 3pt; margin-top: 18pt; text-transform: uppercase; }
  h3 { font-size: 11pt; margin: 12pt 0 2pt; }
  p.sub { color: #475569; margin: 0 0 12pt; }
  p.meta { color: #475569; font-size: 9.5pt; margin: 0 0 4pt; }
  table { border-collapse: collapse; width: 100%; margin-top: 6pt; }
  th, td { border: 1px solid #cbd5e1; padding: 5pt 7pt; text-align: left; font-size: 10pt; }
  th { background: #f1f5f9; }
  ul { margin: 2pt 0 6pt 16pt; }
  .obs { margin-bottom: 10pt; }
</style>
</head>
<body>
  <h1>Eduversal School Observation Report</h1>
  <p class="sub">Framework 2 &ndash; Classroom Observation &amp; Quality Assurance<br />
  <strong>${escapeHtml(data.scopeLine)}</strong><br />
  Generated ${formatDate(data.generatedAt)} &bull; ${data.totalObservations} observation${
    data.totalObservations === 1 ? '' : 's'
  } in scope</p>

  <h2>Executive Summary</h2>
  ${
    data.totalObservations
      ? `<p>Average Framework 2 attainment across the observations in scope is
         <strong>${data.averagePercentage}%</strong>. Grades awarded: ${gradeSummary}.</p>
         ${
           data.totalNotObservable
             ? `<p>${data.totalNotObservable} indicator ratings were recorded as
                <em>not observable</em> &ndash; the captured evidence did not speak to them.
                These are excluded from attainment rather than counted as failures.</p>`
             : ''
         }`
      : '<p>No observations match the selected filters, so no findings can be reported.</p>'
  }

  <h2>Domain Attainment</h2>
  <table>
    <tr><th>Framework 2 Domain</th><th>Attainment</th><th>Indicators Rated</th></tr>
    ${data.domainAverages
      .map(
        (d) =>
          `<tr><td>${escapeHtml(d.domain)}</td><td>${
            d.rated ? `${d.score}%` : 'Not observed'
          }</td><td>${d.rated}</td></tr>`
      )
      .join('')}
  </table>

  ${observations ? `<h2>Key Observations</h2>${observations}` : ''}

  ${
    data.priorityImprovements.length
      ? `<h2>Notes for Improvement &ndash; Cohort Priorities</h2>
         <p>Indicators most frequently rated Basic or below across the observations in scope.
         These are the highest-leverage focus areas for departmental coaching and INSET planning.</p>
         ${list(data.priorityImprovements)}`
      : ''
  }

  ${
    data.bestPractices.length
      ? `<h2>Best Practices to Share</h2>${list(
          data.bestPractices.map((b) => `${b.caption} (${b.teacherName})`)
        )}`
      : ''
  }

  <p class="meta" style="margin-top:18pt">Eduversal Academic Quality Assurance Directorate &bull; Framework 2</p>
</body>
</html>`;

  return new Blob([html], { type: 'application/msword' });
}

export function buildReportFilename(data: SchoolReportData, extension: string): string {
  const parts = ['Eduversal_School_Report'];
  if (data.filters.academicYear !== ALL) parts.push(data.filters.academicYear.replace('/', '-'));
  if (data.filters.school !== ALL) parts.push(data.filters.school.replace(/\s+/g, '_'));
  if (data.filters.careerLevel !== ALL) parts.push(data.filters.careerLevel);
  return `${parts.join('_')}.${extension}`;
}
