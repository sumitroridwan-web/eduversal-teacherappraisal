import { TeacherAppraisalRecord, GlowGrowGo } from '../types';
import { getItemsForLevel } from '../data/frameworkRubrics';
import { generateGlowGrowGo, DEFAULT_FEEDBACK_ITEMS } from './glowGrowGo';

export type FeedbackSection = keyof GlowGrowGo;

export interface WrittenSection {
  items: string[];
  /** 'ai' when the model wrote it, 'ratings' when it was built on the device. */
  source: 'ai' | 'ratings';
  /** Why the AI pass was not the one that wrote it, for the appraiser to see. */
  reason?: string;
}

const SCORE_LABEL: Record<number, string> = {
  4: 'Distinguished',
  3: 'Proficient',
  2: 'Basic',
  1: 'Unsatisfactory',
};

/**
 * The indicators the appraiser has actually rated, each carried with the note
 * written against it.
 *
 * The note matters as much as the number: it is the appraiser's own account of
 * what happened, and a debrief line that quotes it reads like the observation
 * rather than like the rubric.
 */
function ratedIndicators(record: TeacherAppraisalRecord) {
  return getItemsForLevel(record.careerLevel)
    .map((item) => {
      const entry = record.scores?.[item.id];
      return {
        id: item.id,
        domain: item.domainId,
        title: item.title,
        coachingFocus: item.coachingFocus,
        growPrompt: item.growPrompt,
        goPrompt: item.goPrompt,
        score: entry?.score as number,
        level: typeof entry?.score === 'number' ? SCORE_LABEL[entry.score] : undefined,
        descriptorAwarded:
          typeof entry?.score === 'number'
            ? item.descriptors?.[entry.score as 1 | 2 | 3 | 4]
            : undefined,
        appraiserNote: (entry?.notes || '').trim(),
      };
    })
    .filter((r) => typeof r.score === 'number');
}

/** Everything captured from the lesson, in the shape the endpoint reads. */
function evidencePayload(record: TeacherAppraisalRecord) {
  return {
    teacherName: record.teacherName || 'Observed Teacher',
    subject: record.subject || record.subjectCategory,
    careerLevel: record.careerLevel,
    schoolLevel: record.schoolLevel,
    gradeClass: record.gradeClass,
    lessonTopic: record.lessonTopic,
    learningObjectives: record.learningObjectives,
    observerNotes: record.generalObserverNotes,
    // Observations recorded before the audio pass moved to insights hold a
    // verbatim transcript instead; it is still what came off the recording.
    lessonNotes: record.lessonNotes || record.audioTranscription,
    lessonInsights: (record.lessonInsights || [])
      .filter((i) => i.note.trim())
      .map((i) => ({
        timeLabel: i.timeLabel,
        focus: i.focus,
        note: i.note,
        heardFrom: i.heardFrom,
        quote: i.quote,
      })),
    activities: (record.activities || []).map((act, idx) => ({
      index: idx + 1,
      name: act.name,
      timeRange: act.timeRange || `${act.durationMinutes || 10} mins`,
      modality: act.modality,
      teacherActions: act.teacherNotes,
      studentEvidence: act.studentEvidenceNotes,
    })),
    photos: (record.photos || [])
      .filter((p) => p.caption.trim())
      .map((p) => ({ caption: p.caption.trim(), isBestPractice: p.isBestPractice })),
    classroomConditions: record.aiAnalysis?.classroomConditions || [],
  };
}

/** True where anything at all was captured for the model to write from. */
function hasEvidence(record: TeacherAppraisalRecord, ratedCount: number): boolean {
  const payload = evidencePayload(record);
  return Boolean(
    ratedCount ||
      payload.observerNotes?.trim() ||
      payload.lessonNotes?.trim() ||
      payload.lessonInsights.length ||
      payload.activities.length ||
      payload.photos.length
  );
}

/**
 * Writes one Glow / Grow / Go column from the observation notes and the
 * ratings given, three entries deep.
 *
 * The model writes it where the endpoint is reachable, because only it can
 * read the appraiser's prose. Where it is not, the same deterministic builder
 * behind the Generate button fills the column instead - an appraiser who
 * pressed the button gets a column back either way, and is told which wrote it.
 */
export async function writeFeedbackSection(
  record: TeacherAppraisalRecord,
  section: FeedbackSection,
  language: string = 'en'
): Promise<WrittenSection> {
  const rated = ratedIndicators(record);
  const fromRatings = (reason: string): WrittenSection => ({
    items: generateGlowGrowGo(record, DEFAULT_FEEDBACK_ITEMS)[section],
    source: 'ratings',
    reason,
  });

  if (!hasEvidence(record, rated.length)) {
    return fromRatings(
      'Nothing has been captured for this observation yet - rate some indicators or write ' +
        'observation notes, then write this column again.'
    );
  }

  try {
    const res = await fetch('/api/ai-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...evidencePayload(record),
        section,
        count: DEFAULT_FEEDBACK_ITEMS,
        scoredItems: rated,
        language,
      }),
    });

    if (res.ok) {
      const json = await res.json();
      const items: string[] = (json?.data?.items || [])
        .map((entry: unknown) => String(entry || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, DEFAULT_FEEDBACK_ITEMS);
      if (items.length) return { items, source: 'ai' };
      return fromRatings('The AI came back with nothing to write, so this was built from the ratings.');
    }
  } catch (err) {
    console.warn('AI feedback endpoint unavailable, writing from the ratings instead:', err);
  }

  return fromRatings(
    'The AI writer could not be reached, so this column was built from the ratings you have given.'
  );
}
