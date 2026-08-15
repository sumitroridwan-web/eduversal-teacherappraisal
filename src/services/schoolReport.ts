import { jsPDF } from 'jspdf';
import { TeacherAppraisalRecord } from '../types';
import { calculateF2Scores, calculateF2Predicate, getItemsForLevel } from '../data/frameworkRubrics';
import { MAX_FEEDBACK_ITEMS } from './glowGrowGo';

export interface SchoolReportFilters {
  academicYear: string;
  school: string;
  schoolLevel: string;
  subjectCategory: string;
  careerLevel: string;
  appraiser: string;
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
  appraiserName: string;
  rawScore: number;
  maxScore: number;
  percentage: number;
  grade: string;
  predicate: string;
  ratedCount: number;
  notObservableCount: number;
  /** The Glow / Grow / Go debrief actually agreed with the teacher. */
  glow: string[];
  grow: string[];
  go: string[];
  /** Indicators that fell to Basic or below, used for the cohort priorities. */
  weakIndicators: string[];
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
  bestPractices: Array<{ caption: string; teacherName: string; dataUrl: string }>;
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
      (filters.careerLevel === ALL || a.careerLevel === filters.careerLevel) &&
      (filters.appraiser === ALL || a.appraiserName === filters.appraiser)
  );
}

function describeScope(filters: SchoolReportFilters): string {
  const parts: string[] = [];
  if (filters.academicYear !== ALL) parts.push(`Academic Year ${filters.academicYear}`);
  if (filters.school !== ALL) parts.push(filters.school);
  if (filters.schoolLevel !== ALL) parts.push(filters.schoolLevel);
  if (filters.subjectCategory !== ALL) parts.push(filters.subjectCategory);
  if (filters.careerLevel !== ALL) parts.push(`${filters.careerLevel} Level`);
  if (filters.appraiser !== ALL) parts.push(`Appraised by ${filters.appraiser}`);
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

  const improvementTally = new Map<string, { item: any; count: number; scores: number[] }>();
  const bestPractices: Array<{ caption: string; teacherName: string; dataUrl: string }> = [];

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
        const tallied = improvementTally.get(item.id) || { item, count: 0, scores: [] };
        tallied.count += 1;
        tallied.scores.push(score);
        improvementTally.set(item.id, tallied);
      }
    });

    totalNotObservable += notObservable;

    (record.photos || [])
      .filter((p) => p.isBestPractice && p.caption.trim())
      .forEach((p) =>
        bestPractices.push({
          caption: p.caption.trim(),
          teacherName: record.teacherName || 'Unnamed teacher',
          dataUrl: p.dataUrl,
        })
      );

    return {
      teacherName: record.teacherName || 'Unnamed teacher',
      subject: record.subject || record.subjectCategory,
      schoolName: record.schoolName || 'Eduversal Partner School',
      schoolLevel: record.schoolLevel,
      careerLevel: record.careerLevel,
      observationDate: record.observationDate,
      academicYear: record.academicYear,
      appraiserName: record.appraiserName || 'Unassigned',
      rawScore: stats.totalRaw,
      maxScore: stats.maxTotal,
      percentage: stats.percentage,
      grade: stats.grade,
      predicate: band.predicate,
      ratedCount,
      notObservableCount: notObservable,
      // Reported as the debrief the teacher received. Where a column is empty,
      // the rubric evidence stands in so the section is not simply blank.
      glow: (record.feedback?.glow?.length
        ? record.feedback.glow
        : strong
            .sort((a, b) => b.score - a.score)
            .map((s) => `${s.title}: rated ${s.score}.`)
      ).slice(0, MAX_FEEDBACK_ITEMS),
      grow: (record.feedback?.grow || []).slice(0, MAX_FEEDBACK_ITEMS),
      go: (record.feedback?.go || []).slice(0, MAX_FEEDBACK_ITEMS),
      weakIndicators: weak
        .sort((a, b) => a.score - b.score)
        .slice(0, MAX_FEEDBACK_ITEMS)
        .map((w) => `${w.title} (rated ${w.score})`),
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

  // A priority is only useful if it says what to do about it, so each one
  // pairs the finding with the rubric's own committed next step.
  const priorityImprovements = [...improvementTally.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((entry) => {
      const finding =
        `${entry.item.title} was rated Basic or below in ${entry.count} of ` +
        `${observations.length} observation${observations.length === 1 ? '' : 's'}`;
      const suggestion =
        entry.item.goPrompt ||
        `Agree a concrete change to ${entry.item.title.toLowerCase()} with each teacher concerned.`;
      const reflection = entry.item.growPrompt ? ` Discussion prompt: ${entry.item.growPrompt}` : '';
      return `${finding}. Suggested action: ${suggestion}${reflection}`;
    });

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

/**
 * Loads the Eduversal mark as a data URL so it can be embedded directly in
 * generated documents. Cached after the first call; resolves to null if the
 * asset cannot be read, in which case documents render without it.
 */
let logoCache: string | null | undefined;

export async function loadLogoDataUrl(): Promise<string | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    const res = await fetch('/eduversal-logo.png');
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    logoCache = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    logoCache = null;
  }
  return logoCache;
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

// Photos are embedded as bitmaps, so the document is capped to keep it small
// enough to email. Anything beyond this is reported as a count, never dropped
// silently.
const MAX_REPORT_PHOTOS = 6;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function generateSchoolReportPdf(
  data: SchoolReportData,
  logoDataUrl?: string | null
): jsPDF {
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

  // --- Title block: logo left, title beside it, teal rule beneath ---
  const logoSize = 20;
  let textLeft = MARGIN;

  if (logoDataUrl) {
    try {
      // 'FAST' compresses the bitmap; without it jsPDF embeds it raw and the
      // logo alone adds ~360KB to every report.
      doc.addImage(logoDataUrl, 'PNG', MARGIN, 10, logoSize, logoSize, undefined, 'FAST');
      textLeft = MARGIN + logoSize + 6;
    } catch {
      // A malformed image must not stop the report being produced.
      textLeft = MARGIN;
    }
  }

  doc.setTextColor(TEAL[0], TEAL[1], TEAL[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('SCHOOL OBSERVATION REPORT', textLeft, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
  doc.text(
    'Eduversal Partner Schools - Framework 2 Classroom Observation & Quality Assurance',
    textLeft,
    24
  );

  doc.setDrawColor(TEAL[0], TEAL[1], TEAL[2]);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, 34, PAGE_W - MARGIN, 34);
  y = 42;

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
        )} • AY ${o.academicYear} • Appraiser: ${o.appraiserName}`,
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

      const protocol: Array<[string, string[], readonly [number, number, number]]> = [
        ['GLOW — observed strengths', o.glow, [16, 133, 96]],
        ['GROW — reflective questions', o.grow, [217, 119, 6]],
        ['GO — agreed next steps', o.go, [79, 70, 229]],
      ];

      protocol.forEach(([label, entries, colour]) => {
        if (!entries.length) return;
        ensureSpace(6);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(colour[0], colour[1], colour[2]);
        doc.text(label, MARGIN, y);
        y += 4;
        entries.forEach((entry) => body(`• ${entry}`, 4, 8.5));
      });

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
    body(
      'Practice flagged during observation as worth sharing across the department, shown with the evidence photographed at the time.'
    );
    y += 2;

    const THUMB = 26;
    data.bestPractices.slice(0, MAX_REPORT_PHOTOS).forEach((b) => {
      ensureSpace(THUMB + 4);
      const top = y;
      let textX = MARGIN;

      if (b.dataUrl) {
        try {
          doc.addImage(b.dataUrl, 'JPEG', MARGIN, top, THUMB, THUMB, undefined, 'FAST');
          textX = MARGIN + THUMB + 4;
        } catch {
          textX = MARGIN;
        }
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(b.teacherName, textX, top + 4);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
      let ty = top + 8.5;
      doc.splitTextToSize(b.caption, PAGE_W - MARGIN - textX).forEach((line: string) => {
        doc.text(line, textX, ty);
        ty += 4.2;
      });

      y = Math.max(top + THUMB, ty) + 5;
    });

    if (data.bestPractices.length > MAX_REPORT_PHOTOS) {
      body(
        `${data.bestPractices.length - MAX_REPORT_PHOTOS} further best-practice photos were captured but are not shown here, to keep the file a manageable size.`,
        2,
        8
      );
    }
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

export function generateSchoolReportDoc(
  data: SchoolReportData,
  logoDataUrl?: string | null
): Blob {
  const list = (items: string[]) =>
    items.length ? `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '';

  const observations = data.observations
    .map(
      (o, i) => `
      <div class="obs">
        <h3>${i + 1}. ${escapeHtml(o.teacherName)} &ndash; ${escapeHtml(o.subject)}</h3>
        <p class="meta">${escapeHtml(o.schoolName)} &bull; ${escapeHtml(o.schoolLevel)} &bull;
        ${escapeHtml(o.careerLevel)} Level &bull; Observed ${formatDate(o.observationDate)}
        &bull; AY ${escapeHtml(o.academicYear)} &bull; Appraiser: ${escapeHtml(
          o.appraiserName
        )}</p>
        <p><strong>Result:</strong> ${o.rawScore}/${o.maxScore} (${o.percentage}%) &ndash;
        Grade ${escapeHtml(o.grade)}, ${escapeHtml(o.predicate)}.
        ${o.ratedCount} indicators rated${
          o.notObservableCount ? `, ${o.notObservableCount} not observable` : ''
        }.</p>
        ${o.glow.length ? `<p class="glow"><strong>Glow &ndash; observed strengths</strong></p>${list(o.glow)}` : ''}
        ${o.grow.length ? `<p class="grow"><strong>Grow &ndash; reflective questions</strong></p>${list(o.grow)}` : ''}
        ${o.go.length ? `<p class="go"><strong>Go &ndash; agreed next steps</strong></p>${list(o.go)}` : ''}
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
  p.glow { color: #10855f; margin: 6pt 0 0; }
  p.grow { color: #d97706; margin: 6pt 0 0; }
  p.go   { color: #4f46e5; margin: 6pt 0 0; }
  p.who { font-weight: bold; margin: 0 0 2pt; }
  table.bp { border: none; margin-bottom: 10pt; }
  table.bp td { border: none; vertical-align: top; padding: 0 8pt 0 0; }
  table.bp td.bpimg { width: 130px; }
</style>
</head>
<body>
  ${
    logoDataUrl
      ? `<p style="margin:0 0 6pt"><img src="${logoDataUrl}" width="90" height="90" alt="Eduversal" /></p>`
      : ''
  }
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
      ? `<h2>Best Practices to Share</h2>
         <p>Practice flagged during observation as worth sharing across the department,
         shown with the evidence photographed at the time.</p>
         ${data.bestPractices
           .slice(0, MAX_REPORT_PHOTOS)
           .map(
             (b) => `<table class="bp"><tr>
               ${
                 b.dataUrl
                   ? `<td class="bpimg"><img src="${b.dataUrl}" width="120" alt="${escapeHtml(
                       b.caption
                     )}" /></td>`
                   : ''
               }
               <td><p class="who">${escapeHtml(b.teacherName)}</p><p>${escapeHtml(
               b.caption
             )}</p></td></tr></table>`
           )
           .join('')}
         ${
           data.bestPractices.length > MAX_REPORT_PHOTOS
             ? `<p><em>${
                 data.bestPractices.length - MAX_REPORT_PHOTOS
               } further best-practice photos were captured but are not shown here, to keep the file a manageable size.</em></p>`
             : ''
         }`
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
  if (data.filters.appraiser !== ALL) parts.push(data.filters.appraiser.replace(/\s+/g, '_'));
  return `${parts.join('_')}.${extension}`;
}
