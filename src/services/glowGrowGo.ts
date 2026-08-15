import { TeacherAppraisalRecord, GlowGrowGo, AppraisalItem } from '../types';
import { getItemsForLevel } from '../data/frameworkRubrics';

/**
 * The debrief is meant to be discussed in a post-observation conference, so it
 * has to stay short enough to hold in the room. Five entries per column is the
 * ceiling; beyond that a teacher is handed a list, not a conversation.
 */
export const MAX_FEEDBACK_ITEMS = 5;

/**
 * How many entries generation produces. Three key notes per column is enough
 * to carry a debrief; the appraiser can add up to MAX_FEEDBACK_ITEMS by hand
 * where a lesson genuinely warrants more.
 */
export const DEFAULT_FEEDBACK_ITEMS = 3;

const SCORE_LABEL: Record<number, string> = {
  4: 'Distinguished',
  3: 'Proficient',
  2: 'Basic',
  1: 'Unsatisfactory',
};

interface RatedItem {
  item: AppraisalItem;
  score: number;
  notes: string;
}

const MAX_SENTENCE = 210;

function trim(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= MAX_SENTENCE) return clean;
  const cut = clean.slice(0, MAX_SENTENCE);
  return `${cut.slice(0, cut.lastIndexOf(' ') || MAX_SENTENCE)}…`;
}

/**
 * Describes what the teacher actually did for this indicator.
 *
 * The appraiser's own note is the best evidence there is, so it wins. Failing
 * that, the rubric descriptor for the level awarded says what that standard
 * looks like in practice - which is still a description of the teaching, not
 * just the name of the component being judged.
 */
function describePractice(rated: RatedItem): string {
  const note = rated.notes
    .replace(/^\[Auto-Graded\]\s*/i, '')
    .replace(/\s*Evidence\s*-\s*[\s\S]*$/i, '')
    .trim();

  if (note.length > 25) return trim(`${rated.item.title}: ${note}`);

  const descriptor = rated.item.descriptors?.[rated.score as 1 | 2 | 3 | 4];
  if (descriptor) {
    return trim(`${rated.item.title}: ${descriptor.charAt(0).toLowerCase()}${descriptor.slice(1)}`);
  }
  return trim(`${rated.item.title}: ${SCORE_LABEL[rated.score]} — ${rated.item.coachingFocus}.`);
}

function ratedItems(record: TeacherAppraisalRecord): RatedItem[] {
  return getItemsForLevel(record.careerLevel)
    .map((item) => ({
      item,
      score: record.scores?.[item.id]?.score as number,
      notes: record.scores?.[item.id]?.notes || '',
    }))
    .filter((r) => typeof r.score === 'number');
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

/**
 * Builds Glow / Grow / Go from the ratings actually given.
 *
 * Glow names the strongest indicators, Grow asks the rubric's own reflective
 * question for the weakest, and Go carries that rubric's committed next step -
 * so the debrief traces back to the evidence rather than to generic advice.
 */
export function generateGlowGrowGo(
  record: TeacherAppraisalRecord,
  count: number = DEFAULT_FEEDBACK_ITEMS
): GlowGrowGo {
  const rated = ratedItems(record);

  if (rated.length === 0) {
    return {
      glow: [],
      grow: [
        'No indicators have been rated yet, so there is nothing to reflect on. Which parts of the lesson did you most want feedback on?',
      ],
      go: ['Rate the observed indicators, then generate the debrief again.'],
    };
  }

  // Strongest first for Glow, weakest first for Grow and Go.
  const strengths = rated
    .filter((r) => r.score >= 3)
    .sort((a, b) => b.score - a.score);

  const priorities = rated
    .filter((r) => r.score <= 2)
    .sort((a, b) => a.score - b.score);

  // Every teacher leaves a debrief with something to work on. Where nothing sits
  // below Proficient, stretch the proficient work; where everything is already
  // Distinguished, use the same rubric prompts as stretch targets rather than
  // handing a strong teacher an empty Grow and Go.
  const proficient = rated.filter((r) => r.score === 3);
  const growthPool = (
    priorities.length ? priorities : proficient.length ? proficient : rated
  )
    .slice()
    .sort((a, b) => a.score - b.score || a.item.id.localeCompare(b.item.id));

  const limit = Math.min(count, MAX_FEEDBACK_ITEMS);

  const glow = unique(strengths.slice(0, limit).map(describePractice)).slice(0, limit);

  const grow = unique(
    growthPool
      .slice(0, limit)
      .map(
        (r) =>
          r.item.growPrompt ||
          `What would move ${r.item.title.toLowerCase()} to the next level?`
      )
  ).slice(0, limit);

  const go = unique(
    growthPool
      .slice(0, limit)
      .map(
        (r) =>
          r.item.goPrompt ||
          `Plan one concrete change to ${r.item.title.toLowerCase()} for the next lesson.`
      )
  ).slice(0, limit);

  return { glow, grow, go };
}

/** Trims an existing protocol down to the cap, keeping the earliest entries. */
export function capFeedback(feedback: GlowGrowGo): GlowGrowGo {
  return {
    glow: feedback.glow.slice(0, MAX_FEEDBACK_ITEMS),
    grow: feedback.grow.slice(0, MAX_FEEDBACK_ITEMS),
    go: feedback.go.slice(0, MAX_FEEDBACK_ITEMS),
  };
}
