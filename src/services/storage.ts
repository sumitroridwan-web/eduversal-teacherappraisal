import { TeacherAppraisalRecord, CareerLevel, SchoolLevel, SubjectCategory } from '../types';
import { SAMPLE_APPRAISALS } from '../data/sampleAppraisals';
import { calculateF2Scores, calculateF2Predicate, getItemsForLevel } from '../data/frameworkRubrics';

const STORAGE_KEY = 'eduversal_appraisals_v4_clean';

export function loadAppraisals(): TeacherAppraisalRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
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
  } catch (e) {
    console.error('Failed to save appraisals to localStorage', e);
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
  record.f2MaxScore = stats.maxTotal;
  record.f2Percentage = stats.percentage;
  record.indicativeGrade = stats.grade;

  record.finalPredicate = calculateF2Predicate(stats.percentage).predicate;
  record.updatedAt = new Date().toISOString();

  const all = loadAppraisals();
  const index = all.findIndex((a) => a.id === record.id);
  if (index >= 0) {
    all[index] = record;
  } else {
    all.unshift(record);
  }
  saveAppraisals(all);
  return record;
}

export function deleteAppraisal(id: string): void {
  const all = loadAppraisals();
  const filtered = all.filter((a) => a.id !== id);
  saveAppraisals(filtered);
}

export function resetToSamples(): TeacherAppraisalRecord[] {
  saveAppraisals(SAMPLE_APPRAISALS);
  return SAMPLE_APPRAISALS;
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
