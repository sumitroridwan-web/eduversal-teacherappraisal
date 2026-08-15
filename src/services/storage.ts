import { TeacherAppraisalRecord, CareerLevel, SchoolLevel, SubjectCategory, currentAcademicYear } from '../types';
import { calculateF2Scores, calculateF2Predicate, getItemsForLevel } from '../data/frameworkRubrics';
import { capFeedback } from './glowGrowGo';
import { pushRecord, deleteRemote } from './sync';

const STORAGE_KEY = 'eduversal_appraisals_v4_clean';

/** Records saved before academic years existed still need a value. */
function withAcademicYear(record: TeacherAppraisalRecord): TeacherAppraisalRecord {
  if (record.academicYear) return record;
  const observed = record.observationDate ? new Date(record.observationDate) : new Date();
  return { ...record, academicYear: currentAcademicYear(observed) };
}

export function loadAppraisals(): TeacherAppraisalRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(withAcademicYear);
      }
    }
  } catch (e) {
    console.error('Failed to load appraisals from localStorage', e);
  }
  // Initialize with empty array
  saveAppraisals([]);
  return [];
}

export function saveAppraisals(appraisals: TeacherAppraisalRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appraisals));
  } catch (e: any) {
    console.error('Failed to save appraisals to localStorage', e);

    // Photo evidence is stored inline, so the browser quota is a real ceiling.
    // Failing loudly matters here: swallowing this silently would let an
    // appraiser finish a lesson believing their observation had been saved.
    const isQuota =
      e?.name === 'QuotaExceededError' ||
      e?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      e?.code === 22;

    throw new Error(
      isQuota
        ? 'This browser is out of local storage, so the observation was NOT saved. Remove some photo evidence, or export and clear older observations, then save again.'
        : 'The observation could not be saved to this browser.'
    );
  }
}

export function getAppraisalById(id: string): TeacherAppraisalRecord | undefined {
  const all = loadAppraisals();
  return all.find((a) => a.id === id);
}

export function saveOrUpdateAppraisal(record: TeacherAppraisalRecord): TeacherAppraisalRecord {
  // Update stats
  const stats = calculateF2Scores(record.careerLevel, record.scores);
  record.f2RawScore = stats.totalRaw;
  // Matches f2Percentage: the maximum across rated indicators, not the whole rubric.
  record.f2MaxScore = stats.maxRated;
  record.f2Percentage = stats.percentage;
  record.indicativeGrade = stats.grade;

  record.finalPredicate = calculateF2Predicate(stats.percentage).predicate;
  // Normalise records saved before the cap existed, so a stored column of
  // eight entries cannot keep displaying as "8 / 5".
  record.feedback = capFeedback(record.feedback);
  record.updatedAt = new Date().toISOString();

  const all = loadAppraisals();
  const index = all.findIndex((a) => a.id === record.id);
  if (index >= 0) {
    all[index] = record;
  } else {
    all.unshift(record);
  }
  saveAppraisals(all);
  // Fire-and-forget: the local write already succeeded, and sync.ts queues
  // this for retry if the network is down.
  void pushRecord('appraisals', record);
  return record;
}

export function deleteAppraisal(id: string): void {
  const all = loadAppraisals();
  const filtered = all.filter((a) => a.id !== id);
  saveAppraisals(filtered);
  void deleteRemote('appraisals', id);
}

export function createBlankAppraisal(
  careerLevel: CareerLevel = 'Proficient',
  schoolLevel: SchoolLevel = 'Middle School (Grades 7-9)',
  subjectCategory: SubjectCategory = 'Mathematics',
  schoolName: string = 'Kharisma Bangsa School'
): TeacherAppraisalRecord {
  const items = getItemsForLevel(careerLevel);
  const initialScores: Record<string, { score: 1 | 2 | 3 | 4 | null; notes: string; evidenceSource: any }> = {};

  items.forEach((item) => {
    let defaultSource: any = 'Live Classroom Observation';
    if (item.section === 'A') defaultSource = 'Lesson Plan Review';
    else if (item.section === 'C') defaultSource = 'Post-Lesson Discussion';

    initialScores[item.id] = {
      score: null,
      notes: '',
      evidenceSource: defaultSource,
    };
  });

  const now = new Date();
  const timeString = now.toTimeString().substring(0, 5);

  return {
    id: 'app-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
    schoolName,
    appraiserName: 'Visiting Eduversal Appraiser',
    appraiserRole: 'Subject Specialist / Academic Coordinator',
    teacherName: '',
    teacherEmail: '',
    careerLevel,
    schoolLevel,
    subject: '',
    subjectCategory,
    gradeClass: '',
    lessonTopic: '',
    learningObjectives: '',
    academicYear: currentAcademicYear(now),
    observationDate: now.toISOString().substring(0, 10),
    timeIn: timeString,
    timeOut: '',
    durationMinutes: careerLevel === 'Lead' || subjectCategory.includes('Science') ? 90 : 45,
    contactedBeforeVisit: 'Yes',
    preVisitContactDate: now.toISOString().substring(0, 10),
    status: 'Draft',
    scores: initialScores,
    feedback: {
      glow: [],
      grow: [],
      go: [],
    },
    generalObserverNotes: '',
    postConferenceDiscussionSummary: '',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}
