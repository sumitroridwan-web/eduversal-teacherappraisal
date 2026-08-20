import { TeacherAppraisalRecord, CareerLevel, SchoolLevel, SubjectCategory, currentAcademicYear } from '../types';
import { calculateF2Scores, calculateF2Predicate, getItemsForLevel } from '../data/frameworkRubrics';
import { capFeedback } from './glowGrowGo';
import { pushRecord, deleteRemote } from './sync';
import { getMedia, blobToDataUrl, deleteMediaForAppraisal } from './mediaStore';

const STORAGE_KEY = 'eduversal_appraisals_v4_clean';

/**
 * The copy that gets written to disk and pushed to Firestore, with the image
 * bytes taken out.
 *
 * A snapshot is held twice while an observation is open: as a data URL the
 * report can embed, and as a blob in the device's media store. Only the
 * second one is persisted. Writing both would put the photos back inside
 * localStorage's quota and the 1MB Firestore document, which is what made a
 * dozen snapshots enough to stop an observation saving at all.
 *
 * A photo with no blobId has nowhere else to live - a record from before the
 * media store, or one taken while IndexedDB was refused - so its data URL is
 * kept inline rather than dropped.
 */
export function dehydrateMedia(record: TeacherAppraisalRecord): TeacherAppraisalRecord {
  if (!record.photos?.length) return record;

  return {
    ...record,
    photos: record.photos.map((photo) =>
      photo.blobId ? { ...photo, dataUrl: undefined } : photo
    ),
  };
}

/**
 * Fills the image bytes back in from the device, for a record about to be
 * shown, reported or exported. Left as it is when the media store has no
 * copy, so a missing blob shows as a photo that cannot be rendered rather
 * than silently vanishing from the evidence.
 */
export async function hydrateMedia(record: TeacherAppraisalRecord): Promise<TeacherAppraisalRecord> {
  const photos = record.photos || [];
  if (!photos.some((photo) => photo.blobId && !photo.dataUrl)) return record;

  const restored = await Promise.all(
    photos.map(async (photo) => {
      if (photo.dataUrl || !photo.blobId) return photo;
      const stored = await getMedia(photo.blobId);
      if (!stored) return photo;
      try {
        return { ...photo, dataUrl: await blobToDataUrl(stored.blob) };
      } catch {
        return photo;
      }
    })
  );

  // Identity matters as much as the content: App hydrates the open record on
  // every change, so handing back a new object when nothing was restored -
  // the blob is missing, or this device has no store - would re-render, hydrate
  // and re-render again without end.
  const changed = restored.some((photo, i) => photo !== photos[i]);
  return changed ? { ...record, photos: restored } : record;
}

/** Hydrates a whole list, for the school report and its best-practice wall. */
export async function hydrateAllMedia(
  records: TeacherAppraisalRecord[]
): Promise<TeacherAppraisalRecord[]> {
  return Promise.all(records.map(hydrateMedia));
}

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appraisals.map(dehydrateMedia)));
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
        ? 'This browser is out of local storage, so the observation was NOT saved. Export and clear older observations, then save again.'
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

  // Below the coverage floor the observation has no grade to cache. Storing one
  // anyway would put a letter on the record that the report refuses to print,
  // and anything reading the stored field would quietly disagree with the sheet.
  record.indicativeGrade = stats.provisional ? undefined : stats.grade;
  record.finalPredicate = stats.provisional
    ? undefined
    : calculateF2Predicate(stats.percentage).predicate;
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
  // this for retry if the network is down. The media is deliberately left
  // behind - it stays on the device that captured it, and sending it would
  // put the record straight back over the 1MB Firestore ceiling.
  void pushRecord('appraisals', dehydrateMedia(record));
  return record;
}

export function deleteAppraisal(id: string): void {
  const all = loadAppraisals();
  const filtered = all.filter((a) => a.id !== id);
  saveAppraisals(filtered);
  void deleteRemote('appraisals', id);
  // The recording and snapshots would otherwise sit on the device forever,
  // owned by an observation that no longer exists.
  void deleteMediaForAppraisal(id);
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
