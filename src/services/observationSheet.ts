import {
  AppraisalItem,
  CareerLevel,
  ItemScoreRecord,
  ObservationSection,
  SchoolLevel,
  SubjectCategory,
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
