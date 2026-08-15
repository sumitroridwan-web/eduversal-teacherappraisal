export type CareerLevel = 'Induction' | 'Developing' | 'Proficient' | 'Lead' | 'EarlyYears';

export const EDUVERSAL_SCHOOLS = [
  'Global Cahaya Bangsa',
  'Kesatuan Bangsa School',
  'Cahaya Rancamaya Islamic School',
  'Pribadi Depok School',
  'Pribadi Premiere School',
  'Mega Islamic School',
  'Emer Islamic Boarding School (EIBOS)',
  'Semesta 2',
  'Pakar Belia Islamic Boarding School',
  'Kharisma Bangsa School',
  'Pribadi Bandung School',
  'Prestige Bilingual School',
  'Fatih Bilingual School',
  'TNA Fatih Bilingual School',
  'Semesta School',
] as const;

export type EduversalSchoolName = typeof EDUVERSAL_SCHOOLS[number];

/**
 * Academic years selectable on an observation. The Eduversal year runs from
 * July, so anything observed from July onwards belongs to the year starting
 * in that calendar year.
 */
export const ACADEMIC_YEARS = [
  '2026/2027',
  '2027/2028',
  '2028/2029',
  '2029/2030',
] as const;

export type AcademicYear = typeof ACADEMIC_YEARS[number];

export function currentAcademicYear(reference: Date = new Date()): string {
  const year = reference.getFullYear();
  const startYear = reference.getMonth() >= 6 ? year : year - 1;
  return `${startYear}/${startYear + 1}`;
}

export type SchoolLevel =
  | 'Early Years (PG-KG)'
  | 'Primary (Grades 1-6)'
  | 'Middle School (Grades 7-9)'
  | 'High School (Grades 10-12)';

export type SubjectCategory =
  | 'Mathematics'
  | 'Science (Physics, Chem, Bio)'
  | 'English Language & Lit'
  | 'Bahasa Indonesia'
  | 'Social Studies & Humanities'
  | 'Information & Digital Tech'
  | 'Arts & Music'
  | 'Physical & Health Education'
  | 'Early Childhood Education';

export type FrameworkType = 'F1' | 'F2' | 'F3' | 'F4';

export type ObservationSection = 'A' | 'B' | 'C';

export interface RubricDescriptor {
  score: 1 | 2 | 3 | 4;
  label: 'Unsatisfactory' | 'Basic' | 'Proficient' | 'Distinguished';
  description: string;
}

export interface AppraisalItem {
  id: string; // e.g. "D1.1", "EYD1.1", "F1.1", "F3.1", "L1"
  domainId: string; // e.g. "Domain 1: Lesson Planning"
  framework: FrameworkType;
  section: ObservationSection; // A: Pre-visit, B: Live Observation, C: Post-lesson
  title: string;
  theoryBasis?: string; // e.g. "Danielson FfT 1c", "Marzano DQ3"
  visibleFrom: CareerLevel[]; // which levels see this item
  coachingFocus: string;
  growPrompt?: string;
  goPrompt?: string;
  followUpIndicators?: string;
  descriptors: Record<1 | 2 | 3 | 4, string>;
}

export interface LessonActivity {
  id: string;
  name: string; // e.g. "Hook & Prior Knowledge Activation", "Direct Instruction & Modeling", "Guided Group Problem-Solving", "Independent Practice", "Plenary & Exit Ticket"
  durationMinutes?: number;
  timeRange?: string; // e.g. "08:00 - 08:15"
  modality?:
    | 'Whole Class Teacher-Led'
    | 'Whole-Class Demonstration'
    | 'Whole-Class Interactive'
    | 'Whole-Class Reflection'
    | 'Collaborative Group Work'
    | 'Hands-on Small Group'
    | 'Individual Independent Task'
    | 'Individual Reflection'
    | 'Individual / Small Group'
    | 'Pair Share / Discussion'
    | 'Paired Digital Modeling'
    | 'Paired Digital Exploration'
    | 'Peer Collaborative'
    | 'Formative Assessment / Quiz'
    | 'Hands-on Lab / Experiment'
    | 'Student Presentation / Seminar'
    | string;
  teacherNotes: string; // Teacher Actions & Questions
  studentEvidenceNotes: string; // Observable Student Responses & Misconceptions
}

/** One timestamped chunk of the lesson transcript. */
export interface TranscriptSegment {
  startSeconds: number;
  timeLabel: string; // mm:ss from the start of the recording
  text: string;
}

/**
 * A classroom-condition observation drawn from the audio, tied back to an
 * established classroom-management theory rather than left as a bare comment.
 */
export interface ClassroomConditionNote {
  timeLabel: string;
  condition: string;
  theory: string; // e.g. "Kounin - Withitness & Overlapping"
  interpretation: string;
  impact?: 'Supports Learning' | 'Neutral' | 'Disrupts Learning';
}

/** A classroom photo, captured live or uploaded, with its caption. */
export interface LessonPhoto {
  id: string;
  dataUrl: string;
  caption: string;
  source: 'Camera' | 'Upload';
  capturedAt: string;
  isBestPractice: boolean;
  linkedActivityId?: string;
}

export const EVIDENCE_SOURCES = [
  'Lesson Plan Review',
  'Live Classroom Observation',
  'Post-Lesson Discussion',
  'Edunav Record Review',
] as const;

export type EvidenceSource = typeof EVIDENCE_SOURCES[number];

/**
 * Where a rating came from.
 *
 * An appraisal that affects progression has to be able to show whose judgement
 * it records, so an AI suggestion stays marked as such until an appraiser
 * confirms it.
 */
export type ScoreOrigin = 'observer' | 'ai-suggested' | 'ai-confirmed';

export interface ItemScoreRecord {
  score: 1 | 2 | 3 | 4 | null;
  notes: string;
  evidenceSource?: EvidenceSource;
  origin?: ScoreOrigin;
  /** Set when an appraiser confirms or overrides an AI suggestion. */
  confirmedAt?: string;
}

export interface GlowGrowGo {
  glow: string[];
  grow: string[];
  go: string[];
}

export interface AutoGradeResult {
  scores: Array<{
    indicatorCode: string;
    // null means the indicator could not be observed from the captured evidence
    score: 1 | 2 | 3 | 4 | null;
    rationale: string;
    domainId: string;
    title: string;
    /** Quoted or cited evidence the rating rests on. */
    evidenceRefs?: string[];
    notObservable?: boolean;
  }>;
  /** Points earned across the indicators that could be rated. */
  overallScore: number;
  /** Maximum available across rated indicators only, i.e. observedCount * 4. */
  maxScore: number;
  percentage: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  observedCount: number;
  notObservableCount: number;
  totalIndicatorCount: number;
  glow: string[];
  grow: string[];
  go: string[];
  summaryEvaluation: string;
  activitiesEvaluatedCount: number;
}

export interface AiLessonAnalysis {
  summary: string;
  teacherTalkPercentage: number;
  studentTalkPercentage: number;
  higherOrderThinkingPercentage: number;
  calpProficiencyNotes?: string;
  classroomConditions?: ClassroomConditionNote[];
  timeline: Array<{
    phase: string;
    timestamp?: string;
    description: string;
    strengths?: string;
  }>;
  suggestedScores: Array<{
    indicatorCode: string;
    score: 1 | 2 | 3 | 4;
    evidence: string;
  }>;
  glow: string[];
  grow: string[];
  go: string[];
}

export interface TeacherAppraisalRecord {
  id: string;
  schoolName: string;
  appraiserName: string;
  appraiserRole: string;
  teacherName: string;
  teacherEmail?: string;
  careerLevel: CareerLevel;
  schoolLevel: SchoolLevel;
  subject: string;
  subjectCategory: SubjectCategory;
  gradeClass: string;
  lessonTopic: string;
  learningObjectives?: string;
  academicYear: string;
  observationDate: string;
  timeIn: string;
  timeOut: string;
  durationMinutes?: number;
  contactedBeforeVisit: 'Yes' | 'Not needed';
  preVisitContactDate?: string;
  
  // Status
  status: 'Draft' | 'Observation Saved' | 'Finalized (Conference Complete)';

  // Structured Lesson Activities Timeline & Notes
  activities?: LessonActivity[];
  
  // Scores dictionary: key is item ID (e.g. "D1.1", "D2.1", "EYD1.1", "F1.1", etc.)
  scores: Record<string, ItemScoreRecord>;
  
  // Qualitative Feedback
  feedback: GlowGrowGo;
  generalObserverNotes: string;
  postConferenceDiscussionSummary?: string;

  /**
   * The teacher's response to the appraisal. Recorded because an appraisal
   * used in progression decisions should show that the teacher saw it and had
   * the opportunity to respond.
   */
  teacherAcknowledgement?: {
    status: 'Pending' | 'Acknowledged' | 'Acknowledged with comment' | 'Disagrees';
    date?: string;
    comment?: string;
  };
  
  // Audio & AI Data
  hasAudioRecording?: boolean;
  audioDurationSeconds?: number;
  audioTranscription?: string;
  transcriptSegments?: TranscriptSegment[];
  aiAnalysis?: AiLessonAnalysis;

  // Classroom photo evidence and shareable best practices
  photos?: LessonPhoto[];
  
  // Computed stats cached
  f2RawScore?: number;
  f2MaxScore?: number;
  f2Percentage?: number;
  indicativeGrade?: 'A' | 'B' | 'C' | 'D' | 'F';
  finalPredicate?: 'Excellent' | 'Good' | 'Satisfactory' | 'Needs Improvement' | 'Unsatisfactory';
  
  createdAt: string;
  updatedAt: string;
}

export interface DepartmentSummary {
  subjectCategory: SubjectCategory;
  count: number;
  averageF2Score: number;
  predicates: {
    A: number;
    B: number;
    C: number;
    D: number;
    F: number;
  };
  domainAverages: {
    lessonPlanning: number;
    classroomManagement: number;
    instructionalProcess: number;
    assessment: number;
  };
  strongestIndicators: string[];
  growthIndicators: string[];
}

/* ------------------------------------------------------------------ *
 * Walkthrough (Educamp)
 *
 * A short formative visit. Deliberately kept apart from Framework 2:
 * walkthroughs carry no score and are never folded into annual appraisal
 * calculations - findings go straight back to the teacher as developmental
 * feedback.
 * ------------------------------------------------------------------ */

export type WalkthroughResponse = 'E' | 'D' | 'N';

export const WALKTHROUGH_RESPONSE_LABELS: Record<WalkthroughResponse, string> = {
  E: 'Evident (clearly observed)',
  D: 'Developing (partially observed / inconsistent)',
  N: 'Not Observed (may be due to lesson phase, not absence of practice)',
};

export const OBSERVER_ROLES = [
  'Subject Specialist',
  'Subject Leader',
  'School Principal',
  'Academic Coordinator',
  'Cambridge Coordinator',
] as const;

export const LESSON_PHASES = [
  'Opening/Introduction',
  'Main Activity',
  'Guided Practice',
  'Independent Work',
  'Group Work',
  'Closure/Review',
  'Transition',
] as const;

export interface WalkthroughIndicator {
  id: string;
  title: string;
  question: string;
  notesPrompt: string;
}

export const WALKTHROUGH_INDICATORS: WalkthroughIndicator[] = [
  {
    id: 'W1',
    title: 'Learning Intentions',
    question: 'Are students aware of what they are learning and why?',
    notesPrompt:
      'How were learning intentions communicated? Any success criteria or purpose statements visible or spoken?',
  },
  {
    id: 'W2',
    title: 'Student Engagement',
    question: 'Are students actively engaged in the learning activity?',
    notesPrompt:
      'What were students doing? Estimate proportion on-task. Passive, active, or collaborative?',
  },
  {
    id: 'W3',
    title: 'Classroom Climate',
    question: 'Is the environment orderly, respectful, and conducive to learning?',
    notesPrompt:
      'Classroom atmosphere, teacher-student interaction quality, indicators of climate.',
  },
  {
    id: 'W4',
    title: 'Instructional Strategy',
    question: 'Is the teaching approach appropriate for the stated objective?',
    notesPrompt: 'Teaching strategy observed - aligned to objective and appropriate for learners?',
  },
  {
    id: 'W5',
    title: 'Formative Monitoring',
    question: 'Is the teacher checking understanding and adjusting accordingly?',
    notesPrompt: 'How did the teacher monitor understanding? Any visible in-lesson adjustments?',
  },
];

export interface WalkthroughEntry {
  response: WalkthroughResponse | null;
  notes: string;
}

export interface WalkthroughRecord {
  id: string;
  teacherName: string;
  subject: string;
  subjectCategory: SubjectCategory;
  classObserved: string;
  dateOfVisit: string;
  timeOfVisit: string;
  durationMinutes?: number;
  observerName: string;
  observerRole: string;
  lessonPhase: string;

  // Not on the paper form, but needed to scope reports the same way the rest
  // of the platform does.
  schoolName: string;
  academicYear: string;

  responses: Record<string, WalkthroughEntry>;
  keyObservation: string;
  suggestedFocus: string;

  createdAt: string;
  updatedAt: string;
}
