import { jsPDF } from 'jspdf';
import {
  WalkthroughRecord,
  WALKTHROUGH_INDICATORS,
  WalkthroughResponse,
} from '../types';
import { loadLogoDataUrl } from './schoolReport';

export const ALL = 'All';

export interface WalkthroughFilters {
  academicYear: string;
  school: string;
  subject: string;
  observerRole: string;
  lessonPhase: string;
}

export interface IndicatorBreakdown {
  id: string;
  title: string;
  question: string;
  evident: number;
  developing: number;
  notObserved: number;
  rated: number;
  evidentPct: number;
}

export interface WalkthroughReportData {
  generatedAt: string;
  filters: WalkthroughFilters;
  scopeLine: string;
  totalVisits: number;
  teachersVisited: number;
  averageDuration: number;
  indicatorBreakdown: IndicatorBreakdown[];
  keyObservations: Array<{ teacherName: string; subject: string; date: string; text: string }>;
  improvementFocuses: Array<{ teacherName: string; subject: string; text: string }>;
  developmentPriorities: string[];
}

export { loadLogoDataUrl };

export function filterWalkthroughs(
  records: WalkthroughRecord[],
  filters: WalkthroughFilters
): WalkthroughRecord[] {
  return records.filter(
    (w) =>
      (filters.academicYear === ALL || w.academicYear === filters.academicYear) &&
      (filters.school === ALL || w.schoolName === filters.school) &&
      (filters.subject === ALL || w.subjectCategory === filters.subject) &&
      (filters.observerRole === ALL || w.observerRole === filters.observerRole) &&
      (filters.lessonPhase === ALL || w.lessonPhase === filters.lessonPhase)
  );
}

function describeScope(filters: WalkthroughFilters): string {
  const parts: string[] = [];
  if (filters.academicYear !== ALL) parts.push(`Academic Year ${filters.academicYear}`);
  if (filters.school !== ALL) parts.push(filters.school);
  if (filters.subject !== ALL) parts.push(filters.subject);
  if (filters.observerRole !== ALL) parts.push(`Observed by ${filters.observerRole}`);
  if (filters.lessonPhase !== ALL) parts.push(`${filters.lessonPhase} phase`);
  return parts.length ? parts.join(' • ') : 'All walkthrough visits';
}

export function buildWalkthroughReport(
  records: WalkthroughRecord[],
  filters: WalkthroughFilters
): WalkthroughReportData {
  const scoped = filterWalkthroughs(records, filters);

  const counts: Record<string, Record<WalkthroughResponse, number>> = {};
  WALKTHROUGH_INDICATORS.forEach((ind) => {
    counts[ind.id] = { E: 0, D: 0, N: 0 };
  });

  const keyObservations: WalkthroughReportData['keyObservations'] = [];
  const improvementFocuses: WalkthroughReportData['improvementFocuses'] = [];
  const teachers = new Set<string>();
  let durationSum = 0;
  let durationCount = 0;

  scoped.forEach((w) => {
    if (w.teacherName.trim()) teachers.add(w.teacherName.trim().toLowerCase());
    if (typeof w.durationMinutes === 'number' && w.durationMinutes > 0) {
      durationSum += w.durationMinutes;
      durationCount++;
    }

    WALKTHROUGH_INDICATORS.forEach((ind) => {
      const entry = w.responses?.[ind.id];
      if (entry?.response) counts[ind.id][entry.response] += 1;
    });

    if (w.keyObservation.trim()) {
      keyObservations.push({
        teacherName: w.teacherName || 'Unnamed teacher',
        subject: w.subject || '—',
        date: w.dateOfVisit,
        text: w.keyObservation.trim(),
      });
    }
    if (w.suggestedFocus.trim()) {
      improvementFocuses.push({
        teacherName: w.teacherName || 'Unnamed teacher',
        subject: w.subject || '—',
        text: w.suggestedFocus.trim(),
      });
    }
  });

  const indicatorBreakdown: IndicatorBreakdown[] = WALKTHROUGH_INDICATORS.map((ind) => {
    const c = counts[ind.id];
    const rated = c.E + c.D + c.N;
    return {
      id: ind.id,
      title: ind.title,
      question: ind.question,
      evident: c.E,
      developing: c.D,
      notObserved: c.N,
      rated,
      // Share of Evident among visits where the practice could be seen at all.
      // "Not Observed" may simply reflect the lesson phase, so counting it as a
      // failure would misrepresent the teaching.
      evidentPct: c.E + c.D > 0 ? Math.round((c.E / (c.E + c.D)) * 100) : 0,
    };
  });

  const developmentPriorities = indicatorBreakdown
    .filter((i) => i.developing > 0)
    .sort((a, b) => b.developing - a.developing || a.evidentPct - b.evidentPct)
    .slice(0, 5)
    .map(
      (i) =>
        `${i.id} ${i.title} - recorded as Developing in ${i.developing} of ${
          i.evident + i.developing
        } visit${i.evident + i.developing === 1 ? '' : 's'} where it was observable`
    );

  return {
    generatedAt: new Date().toISOString(),
    filters,
    scopeLine: describeScope(filters),
    totalVisits: scoped.length,
    teachersVisited: teachers.size,
    averageDuration: durationCount ? Math.round(durationSum / durationCount) : 0,
    indicatorBreakdown,
    keyObservations,
    improvementFocuses,
    developmentPriorities,
  };
}

/* ------------------------------------------------------------------ *
 * Documents
 * ------------------------------------------------------------------ */

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;
const TEAL = [22, 89, 99] as const;
const SLATE = [71, 85, 105] as const;

const FORMATIVE_NOTE =
  'Formative only - walkthroughs carry no score and are not used in annual appraisal calculations. Findings are shared directly with the teacher as developmental feedback.';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function generateWalkthroughPdf(
  data: WalkthroughReportData,
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
  };

  const body = (text: string, indent = 0, size = 9.5) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
    doc.splitTextToSize(text, CONTENT_W - indent).forEach((line: string) => {
      ensureSpace(5);
      doc.text(line, MARGIN + indent, y);
      y += 4.4;
    });
  };

  // Header
  const logoSize = 20;
  let textLeft = MARGIN;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', MARGIN, 10, logoSize, logoSize, undefined, 'FAST');
      textLeft = MARGIN + logoSize + 6;
    } catch {
      textLeft = MARGIN;
    }
  }
  doc.setTextColor(TEAL[0], TEAL[1], TEAL[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('WALKTHROUGH REPORT', textLeft, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
  doc.text('Educamp - Development of Teaching Proficiency, Eduversal', textLeft, 24);
  doc.setDrawColor(TEAL[0], TEAL[1], TEAL[2]);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, 34, PAGE_W - MARGIN, 34);
  y = 41;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
  doc.splitTextToSize(FORMATIVE_NOTE, CONTENT_W).forEach((line: string) => {
    doc.text(line, MARGIN, y);
    y += 3.8;
  });
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(data.scopeLine, MARGIN, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
  doc.text(
    `Generated ${formatDate(data.generatedAt)} • ${data.totalVisits} visit${
      data.totalVisits === 1 ? '' : 's'
    } • ${data.teachersVisited} teacher${data.teachersVisited === 1 ? '' : 's'} • avg ${
      data.averageDuration
    } min`,
    MARGIN,
    y
  );
  y += 9;

  if (!data.totalVisits) {
    heading('Summary');
    body('No walkthrough visits match the selected scope, so no findings can be reported.');
  } else {
    // Indicator profile with an E/D/N stacked bar
    heading('Walkthrough Indicator Profile');
    body('E = Evident • D = Developing • N = Not Observed (may reflect the lesson phase).');
    y += 2;

    data.indicatorBreakdown.forEach((ind) => {
      ensureSpace(14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`${ind.id} — ${ind.title}`, MARGIN, y);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `E ${ind.evident}  D ${ind.developing}  N ${ind.notObserved}`,
        PAGE_W - MARGIN,
        y,
        { align: 'right' }
      );
      y += 2.4;

      const total = ind.rated || 1;
      const barY = y;
      let x = MARGIN;
      const segs: Array<[number, readonly [number, number, number]]> = [
        [ind.evident, [16, 133, 96]],
        [ind.developing, [217, 119, 6]],
        [ind.notObserved, [148, 163, 184]],
      ];
      doc.setFillColor(226, 232, 240);
      doc.rect(MARGIN, barY, CONTENT_W, 2.2, 'F');
      segs.forEach(([value, colour]) => {
        if (!value) return;
        const w = (CONTENT_W * value) / total;
        doc.setFillColor(colour[0], colour[1], colour[2]);
        doc.rect(x, barY, w, 2.2, 'F');
        x += w;
      });
      y += 6;

      doc.setFontSize(8);
      doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
      doc.text(
        `${ind.evidentPct}% Evident where observable`,
        MARGIN,
        y
      );
      y += 6;
    });
    y += 2;

    if (data.keyObservations.length) {
      heading('Key Observations');
      data.keyObservations.forEach((o) => {
        ensureSpace(12);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text(`${o.teacherName} — ${o.subject} (${formatDate(o.date)})`, MARGIN, y);
        y += 4.2;
        body(o.text, 3, 9);
        y += 2;
      });
    }

    if (data.improvementFocuses.length) {
      heading('Notes for Improvement - Suggested Focus');
      body(
        'Each focus is framed as an invitation to reflect before the next visit, not a directive.'
      );
      y += 1;
      data.improvementFocuses.forEach((f) => {
        ensureSpace(10);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text(`${f.teacherName} — ${f.subject}`, MARGIN, y);
        y += 4.2;
        body(f.text, 3, 9);
        y += 2;
      });
    }

    if (data.developmentPriorities.length) {
      heading('Department Development Priorities');
      data.developmentPriorities.forEach((p, i) => body(`${i + 1}. ${p}`, 2));
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text('Educamp • Development of Teaching Proficiency, Eduversal', MARGIN, PAGE_H - 10);
    doc.text(`Page ${p} of ${pageCount}`, PAGE_W - MARGIN, PAGE_H - 10, { align: 'right' });
  }

  return doc;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generateWalkthroughDoc(
  data: WalkthroughReportData,
  logoDataUrl?: string | null
): Blob {
  const rows = data.indicatorBreakdown
    .map(
      (i) =>
        `<tr><td>${i.id} &ndash; ${escapeHtml(i.title)}</td><td>${i.evident}</td><td>${
          i.developing
        }</td><td>${i.notObserved}</td><td>${i.evidentPct}%</td></tr>`
    )
    .join('');

  const observations = data.keyObservations
    .map(
      (o) =>
        `<div class="entry"><p class="who">${escapeHtml(o.teacherName)} &ndash; ${escapeHtml(
          o.subject
        )} (${formatDate(o.date)})</p><p>${escapeHtml(o.text)}</p></div>`
    )
    .join('');

  const focuses = data.improvementFocuses
    .map(
      (f) =>
        `<div class="entry"><p class="who">${escapeHtml(f.teacherName)} &ndash; ${escapeHtml(
          f.subject
        )}</p><p>${escapeHtml(f.text)}</p></div>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="utf-8" />
<title>Educamp Walkthrough Report</title>
<style>
  @page { size: A4; margin: 2cm; }
  body { font-family: Calibri, Arial, sans-serif; color: #0f172a; font-size: 11pt; line-height: 1.45; }
  h1 { font-size: 18pt; color: #165963; margin: 0 0 4pt; }
  h2 { font-size: 12pt; color: #165963; border-bottom: 1px solid #cbd5e1; padding-bottom: 3pt; margin-top: 18pt; text-transform: uppercase; }
  p.sub { color: #475569; margin: 0 0 10pt; }
  p.note { font-style: italic; color: #475569; font-size: 9.5pt; }
  p.who { font-weight: bold; margin: 0 0 2pt; }
  .entry { margin-bottom: 9pt; }
  table { border-collapse: collapse; width: 100%; margin-top: 6pt; }
  th, td { border: 1px solid #cbd5e1; padding: 5pt 7pt; text-align: left; font-size: 10pt; }
  th { background: #f1f5f9; }
  ul { margin: 2pt 0 6pt 16pt; }
</style>
</head>
<body>
  ${
    logoDataUrl
      ? `<p style="margin:0 0 6pt"><img src="${logoDataUrl}" width="90" height="90" alt="Eduversal" /></p>`
      : ''
  }
  <h1>Walkthrough Report</h1>
  <p class="sub">Educamp &ndash; Development of Teaching Proficiency, Eduversal<br />
  <strong>${escapeHtml(data.scopeLine)}</strong><br />
  Generated ${formatDate(data.generatedAt)} &bull; ${data.totalVisits} visit${
    data.totalVisits === 1 ? '' : 's'
  } &bull; ${data.teachersVisited} teacher${
    data.teachersVisited === 1 ? '' : 's'
  } &bull; average ${data.averageDuration} min</p>
  <p class="note">${FORMATIVE_NOTE}</p>

  ${
    data.totalVisits
      ? `<h2>Walkthrough Indicator Profile</h2>
         <p>E = Evident &bull; D = Developing &bull; N = Not Observed (may reflect the lesson phase).</p>
         <table>
           <tr><th>Indicator</th><th>E</th><th>D</th><th>N</th><th>Evident where observable</th></tr>
           ${rows}
         </table>
         ${observations ? `<h2>Key Observations</h2>${observations}` : ''}
         ${
           focuses
             ? `<h2>Notes for Improvement &ndash; Suggested Focus</h2>
                <p>Each focus is framed as an invitation to reflect before the next visit, not a directive.</p>
                ${focuses}`
             : ''
         }
         ${
           data.developmentPriorities.length
             ? `<h2>Department Development Priorities</h2><ul>${data.developmentPriorities
                 .map((p) => `<li>${escapeHtml(p)}</li>`)
                 .join('')}</ul>`
             : ''
         }`
      : '<p>No walkthrough visits match the selected scope, so no findings can be reported.</p>'
  }

  <p class="sub" style="margin-top:18pt">Educamp &bull; Development of Teaching Proficiency, Eduversal</p>
</body>
</html>`;

  return new Blob([html], { type: 'application/msword' });
}

export function buildWalkthroughFilename(
  data: WalkthroughReportData,
  extension: string
): string {
  const parts = ['Educamp_Walkthrough_Report'];
  if (data.filters.academicYear !== ALL) parts.push(data.filters.academicYear.replace('/', '-'));
  if (data.filters.school !== ALL) parts.push(data.filters.school.replace(/\s+/g, '_'));
  if (data.filters.subject !== ALL) parts.push(data.filters.subject.replace(/\s+/g, '_'));
  return `${parts.join('_')}.${extension}`;
}
