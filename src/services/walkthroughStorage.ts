import { pushRecord, deleteRemote } from './sync';
import {
  WalkthroughRecord,
  WALKTHROUGH_INDICATORS,
  currentAcademicYear,
} from '../types';

// Separate key: walkthroughs are formative and must never be mistaken for,
// or merged into, Framework 2 appraisal records.
const WALKTHROUGH_KEY = 'eduversal_walkthroughs_v1';

export function loadWalkthroughs(): WalkthroughRecord[] {
  try {
    const raw = localStorage.getItem(WALKTHROUGH_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Failed to load walkthroughs from localStorage', e);
  }
  return [];
}

export function saveWalkthroughs(records: WalkthroughRecord[]): void {
  try {
    localStorage.setItem(WALKTHROUGH_KEY, JSON.stringify(records));
  } catch (e: any) {
    console.error('Failed to save walkthroughs', e);

    const isQuota =
      e?.name === 'QuotaExceededError' ||
      e?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      e?.code === 22;

    throw new Error(
      isQuota
        ? 'This browser is out of local storage, so the walkthrough was NOT saved. Export and clear older records, then save again.'
        : 'The walkthrough could not be saved to this browser.'
    );
  }
}

export function createBlankWalkthrough(): WalkthroughRecord {
  const now = new Date();
  const responses: Record<string, { response: null; notes: string }> = {};
  WALKTHROUGH_INDICATORS.forEach((ind) => {
    responses[ind.id] = { response: null, notes: '' };
  });

  return {
    id: `wt-${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
    teacherName: '',
    subject: '',
    subjectCategory: 'Mathematics',
    classObserved: '',
    dateOfVisit: now.toISOString().substring(0, 10),
    timeOfVisit: now.toTimeString().substring(0, 5),
    durationMinutes: 15,
    observerName: '',
    observerRole: 'Subject Specialist',
    lessonPhase: 'Main Activity',
    schoolName: '',
    academicYear: currentAcademicYear(now),
    responses,
    keyObservation: '',
    suggestedFocus: '',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function saveOrUpdateWalkthrough(record: WalkthroughRecord): WalkthroughRecord {
  const updated = { ...record, updatedAt: new Date().toISOString() };
  const all = loadWalkthroughs();
  const index = all.findIndex((w) => w.id === updated.id);

  if (index >= 0) all[index] = updated;
  else all.unshift(updated);

  saveWalkthroughs(all);
  void pushRecord('walkthroughs', updated);
  return updated;
}

export function deleteWalkthrough(id: string): void {
  saveWalkthroughs(loadWalkthroughs().filter((w) => w.id !== id));
  void deleteRemote('walkthroughs', id);
}
