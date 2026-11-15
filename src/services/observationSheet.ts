import {
  AppraisalItem,
  CareerLevel,
  ItemScoreRecord,
  ObservationSection,
  SchoolLevel,
  SubjectCategory,
  TeacherAppraisalRecord,
} from '../types';

/**
 * Small decisions the observation sheet makes while an appraiser is filling it
 * in. They live here rather than inside the form so they can be tested: "which
 * indicator do I still need" is the question the sheet exists to answer, and
 * getting it wrong sends an appraiser hunting through forty-four cards.
 */

export type SheetFilter = 'ALL' | ObservationSection | 'FEEDBACK';

/** Has this indicator been rated by anyone - appraiser or AI? */
export function isRated(scores: Record<string, ItemScoreRecord>, itemId: string): boolean {
  return typeof scores?.[itemId]?.score === 'number';
}

/**
 * The indicators on screen, given the section tab and the unrated-only toggle.
 */
export function visibleItems(
  items: AppraisalItem[],
  scores: Record<string, ItemScoreRecord>,
  section: SheetFilter,
  unratedOnly: boolean
): AppraisalItem[] {
  return items.filter((item) => {
    if (section !== 'ALL' && section !== 'FEEDBACK' && item.section !== section) return false;
    if (unratedOnly && isRated(scores, item.id)) return false;
    return true;
  });
}

/**
 * The next indicator still needing a rating, wrapping back to the start.
 *
 * Wrapping matters: an appraiser working down the sheet who skips three near
 * the top would otherwise be told there is nothing left when there is.
 */
export function findNextUnrated(
  items: AppraisalItem[],
  scores: Record<string, ItemScoreRecord>,
  afterId?: string
): AppraisalItem | undefined {
  if (!items.length) return undefined;

  const startIndex = afterId ? items.findIndex((item) => item.id === afterId) + 1 : 0;
  const ordered = [...items.slice(startIndex), ...items.slice(0, Math.max(startIndex, 0))];

  return ordered.find((item) => !isRated(scores, item.id));
}

/** Clock time as the sheet writes it, e.g. "08:23". */
export function clockTime(date: Date = new Date()): string {
  return date.toTimeString().substring(0, 5);
}

/**
 * Stamps the time into a note.
 *
 * A stamp opens a new line rather than trailing the previous sentence, because
 * the rule engine and the report both read observer notes line by line - one
 * moment per line is what makes a citation locatable afterwards.
 */
export function stampTime(existing: string, time: string = clockTime()): string {
  const marker = `[${time}] `;
  if (!existing.trim()) return marker;
  return `${existing.replace(/\s+$/, '')}\n${marker}`;
}

/**
 * Adds an evidence prompt the appraiser completes in their own words.
 *
 * Deliberately a stem and not a finished phrase: a button that writes
 * "[High Engagement]" produces text that looks like evidence and states
 * nothing, which is how an indicator ends up rated and uncitable.
 */
export function appendEvidenceStem(existing: string, stem: string): string {
  const opener = `${stem}: `;
  if (!existing.trim()) return opener;
  if (existing.trimEnd().endsWith(':')) return existing;
  return `${existing.replace(/\s+$/, '')} ${opener}`;
}

export interface CoverageProgress {
  rated: number;
  total: number;
  /** Indicators needed before a letter grade can be published. */
  needed: number;
  /** How many more ratings until the floor is met. */
  remaining: number;
  meetsFloor: boolean;
  /** Floor position along the progress bar, as a percentage. */
  floorPercent: number;
  ratedPercent: number;
}

/** What the progress bar has to say: where you are, and where the grade starts. */
export function coverageProgress(
  rated: number,
  total: number,
  floor: number
): CoverageProgress {
  const needed = Math.ceil(total * floor);
  return {
    rated,
    total,
    needed,
    remaining: Math.max(0, needed - rated),
    meetsFloor: total > 0 && rated >= needed,
    floorPercent: total > 0 ? (needed / total) * 100 : 0,
    ratedPercent: total > 0 ? (rated / total) * 100 : 0,
  };
}

/**
 * The fields worth carrying from a teacher's last observation into the next.
 *
 * Everything here describes the posting rather than the lesson - who, where,
 * which rubric. The lesson itself, and every rating and note about it, is
 * deliberately absent: this starts a blank sheet faster, it does not clone an
 * appraisal.
 */
export interface CarriedContext {
  schoolName: string;
  teacherName: string;
  teacherEmail?: string;
  careerLevel: CareerLevel;
  schoolLevel: SchoolLevel;
  subject: string;
  subjectCategory: SubjectCategory;
  gradeClass: string;
  appraiserName: string;
  appraiserRole: string;
  academicYear: string;
}

export function carryContext(record: Record<string, any>): CarriedContext {
  return {
    schoolName: record.schoolName,
    teacherName: record.teacherName,
    teacherEmail: record.teacherEmail,
    careerLevel: record.careerLevel,
    schoolLevel: record.schoolLevel,
    subject: record.subject,
    subjectCategory: record.subjectCategory,
    gradeClass: record.gradeClass,
    appraiserName: record.appraiserName,
    appraiserRole: record.appraiserRole,
    academicYear: record.academicYear,
  };
}

/* ------------------------------------------------------------------ *
 * Section rail
 *
 * The sheet is long, and an appraiser moves between its parts out of order:
 * notes during the lesson, ratings afterwards, the debrief days later. The
 * rail lists the parts with how far each has got, so "what is left to do"
 * is answered without scrolling the whole sheet to find out.
 * ------------------------------------------------------------------ */

export type SheetStepState = 'done' | 'partial' | 'todo';

export type SheetStepKey =
  | 'details'
  | 'capture'
  | 'capture-notes'
  | 'capture-timeline'
  | 'capture-audio'
  | 'capture-photos'
  | 'rate'
  | 'rate-A'
  | 'rate-B'
  | 'rate-C'
  | 'debrief'
  | 'finalise';

export interface SheetStep {
  key: SheetStepKey;
  label: string;
  summary: string;
  state: SheetStepState;
  children?: SheetStep[];
}

/** The details an observation needs before its report can say whose lesson it was. */
export const REQUIRED_DETAILS: Array<{ field: keyof TeacherAppraisalRecord; label: string }> = [
  { field: 'schoolName', label: 'School' },
  { field: 'teacherName', label: 'Teacher' },
  { field: 'subject', label: 'Subject' },
  { field: 'gradeClass', label: 'Class' },
  { field: 'appraiserName', label: 'Appraiser' },
  { field: 'observationDate', label: 'Date' },
];

export function missingDetails(record: TeacherAppraisalRecord): string[] {
  return REQUIRED_DETAILS.filter(({ field }) => !String(record[field] ?? '').trim()).map((d) => d.label);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const stateOf = (done: boolean, started: boolean): SheetStepState =>
  done ? 'done' : started ? 'partial' : 'todo';

export function buildSheetSteps(
  record: TeacherAppraisalRecord,
  items: AppraisalItem[],
  floor: number
): SheetStep[] {
  // Details
  const missing = missingDetails(record);
  const filled = REQUIRED_DETAILS.length - missing.length;
  const details: SheetStep = {
    key: 'details',
    label: 'Lesson details',
    summary: missing.length ? `Missing: ${missing.join(', ')}` : 'All filled in',
    state: stateOf(missing.length === 0, filled > 0),
  };

  // Capture
  const words = record.generalObserverNotes?.trim()
    ? record.generalObserverNotes.trim().split(/\s+/).length
    : 0;
  const activities = record.activities?.length || 0;
  const hasAudio = Boolean(
    record.hasAudioRecording || record.lessonNotes?.trim() || record.audioTranscription?.trim()
  );
  const photos = record.photos || [];
  const starred = photos.filter((p) => p.isBestPractice).length;
  const captureChildren: SheetStep[] = [
    {
      key: 'capture-notes',
      label: 'Lesson notes',
      summary: words ? plural(words, 'word') : 'Not started',
      state: stateOf(words > 0, false),
    },
    {
      key: 'capture-timeline',
      label: 'Timeline',
      summary: activities ? plural(activities, 'activity', 'activities') : 'None yet',
      state: stateOf(activities > 0, false),
    },
    {
      key: 'capture-audio',
      label: 'Recording',
      summary: hasAudio ? 'Recorded' : 'None yet',
      state: stateOf(hasAudio, false),
    },
    {
      key: 'capture-photos',
      label: 'Photos',
      summary: photos.length
        ? `${plural(photos.length, 'photo')}${starred ? `, ${starred} starred` : ''}`
        : 'None yet',
      state: stateOf(photos.length > 0, false),
    },
  ];
  const evidenceKinds = captureChildren.filter((c) => c.state === 'done').length;
  const capture: SheetStep = {
    key: 'capture',
    label: 'Capture',
    summary: evidenceKinds ? `${evidenceKinds} of 4 kinds of evidence` : 'Nothing captured yet',
    // Notes are the evidence the rest of the sheet is built on, so they are
    // what makes capture complete; the other kinds add to it.
    state: stateOf(words > 0, evidenceKinds > 0),
    children: captureChildren,
  };

  // Rate
  const sectionNames: Record<string, string> = { A: 'A · Pre-visit', B: 'B · Live lesson', C: 'C · Post-lesson' };
  const rateChildren: SheetStep[] = (['A', 'B', 'C'] as const)
    .map((section) => {
      const inSection = items.filter((i) => i.section === section);
      const rated = inSection.filter((i) => isRated(record.scores || {}, i.id)).length;
      return {
        key: `rate-${section}` as SheetStepKey,
        label: sectionNames[section],
        summary: `${rated}/${inSection.length} rated`,
        state: stateOf(inSection.length > 0 && rated === inSection.length, rated > 0),
        total: inSection.length,
      };
    })
    .filter((c) => c.total > 0)
    .map(({ total: _total, ...step }) => step);
  const ratedTotal = items.filter((i) => isRated(record.scores || {}, i.id)).length;
  const progress = coverageProgress(ratedTotal, items.length, floor);
  const rate: SheetStep = {
    key: 'rate',
    label: 'Rate indicators',
    summary: `${ratedTotal}/${items.length} rated${
      progress.meetsFloor ? '' : ` · ${progress.remaining} more for a grade`
    }`,
    state: stateOf(items.length > 0 && ratedTotal === items.length, ratedTotal > 0),
    children: rateChildren,
  };

  // Debrief
  const fb = record.feedback || { glow: [], grow: [], go: [] };
  const columns = [fb.glow?.length || 0, fb.grow?.length || 0, fb.go?.length || 0];
  const conference = Boolean(record.postConferenceDiscussionSummary?.trim());
  const debrief: SheetStep = {
    key: 'debrief',
    label: 'Debrief',
    summary: `Glow ${columns[0]} · Grow ${columns[1]} · Go ${columns[2]}${conference ? ' · conference noted' : ''}`,
    state: stateOf(columns.every((n) => n > 0) && conference, columns.some((n) => n > 0) || conference),
  };

  // Finalise
  const ack = record.teacherAcknowledgement?.status || 'Pending';
  const finalised = record.status === 'Finalized (Conference Complete)';
  const finalise: SheetStep = {
    key: 'finalise',
    label: 'Acknowledge & finalise',
    summary: `${ack === 'Pending' ? 'Acknowledgement pending' : ack} · ${
      finalised ? 'Finalised' : record.status === 'Observation Saved' ? 'Saved' : 'Draft'
    }`,
    state: stateOf(finalised, ack !== 'Pending' || record.status === 'Observation Saved'),
  };

  return [details, capture, rate, debrief, finalise];
}
