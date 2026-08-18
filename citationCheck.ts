/**
 * Checks that an auto-graded rating cites evidence that actually exists.
 *
 * The grading prompt already tells the model to quote its source for every
 * rating and to mark an indicator not observable when it cannot. That is a
 * request, not a guarantee: a citation the model invented arrives looking
 * exactly like one it read, and by the time it reaches the appraiser it is a
 * number on somebody's appraisal with a plausible sentence attached.
 *
 * So every scored indicator is checked here against the evidence the browser
 * actually submitted. One verifiable citation is enough to keep a rating. None
 * withdraws it - back to "not observable", which is the honest answer and the
 * one the prompt asks for anyway. Withdrawing is deliberately the failure mode:
 * an unrated indicator costs the teacher nothing, an invented one can cost them
 * a progression decision.
 */

export interface CitationEvidence {
  activities?: Array<{
    index?: number;
    name?: string;
    timeRange?: string;
    modality?: string;
    teacherActions?: string;
    studentEvidence?: string;
  }>;
  observerNotes?: string;
  transcript?: string;
  learningObjectives?: string;
  photos?: Array<{ caption?: string }>;
  classroomConditions?: Array<{
    condition?: string;
    interpretation?: string;
    theory?: string;
    timeLabel?: string;
  }>;
}

export interface GradedIndicator {
  indicatorCode: string;
  score?: number | null;
  notObservable?: boolean;
  rationale?: string;
  evidenceRefs?: string[];
  [key: string]: unknown;
}

export interface CitationCheckResult {
  scores: GradedIndicator[];
  /** Ratings that carried a score and were therefore checked. */
  checked: number;
  /** Ratings withdrawn because no citation could be located. */
  withdrawn: number;
}

/**
 * A quotation shorter than this matches too much to mean anything - "the
 * students" appears in almost any lesson record.
 */
const MIN_QUOTE_LENGTH = 12;

/** Labels shorter than this would match by accident. */
const MIN_LABEL_LENGTH = 4;

/**
 * Flattens text for comparison: case, punctuation and whitespace all vary
 * between what the model quotes back and what was submitted, and none of those
 * differences mean the quote is invented.
 */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Every quoted span in a citation, in any of the quote marks a model reaches for. */
export function extractQuotes(ref: string): string[] {
  const quotes: string[] = [];
  const patterns = [/"([^"]+)"/g, /'([^']+)'/g, /[“]([^”]+)[”]/g, /[‘]([^’]+)[’]/g];

  patterns.forEach((pattern) => {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(ref)) !== null) {
      const inner = match[1].trim();
      if (inner) quotes.push(inner);
    }
  });

  return quotes;
}

/** Everything the model was given, flattened into one searchable string. */
function buildHaystack(evidence: CitationEvidence): string {
  const parts: string[] = [];

  (evidence.activities || []).forEach((activity) => {
    parts.push(
      [activity.name, activity.timeRange, activity.modality, activity.teacherActions, activity.studentEvidence]
        .filter(Boolean)
        .join(' ')
    );
  });

  if (evidence.observerNotes) parts.push(evidence.observerNotes);
  if (evidence.transcript) parts.push(evidence.transcript);
  if (evidence.learningObjectives) parts.push(evidence.learningObjectives);

  (evidence.photos || []).forEach((photo) => {
    if (photo.caption) parts.push(photo.caption);
  });

  (evidence.classroomConditions || []).forEach((condition) => {
    parts.push(
      [condition.condition, condition.interpretation, condition.theory, condition.timeLabel]
        .filter(Boolean)
        .join(' ')
    );
  });

  return normalise(parts.join(' • '));
}

/**
 * The locators a citation may legitimately name.
 *
 * A citation without a quotation - "Activity 3: Guided Group Problem-Solving" -
 * is still checkable: either that activity exists or it does not. Crucially, a
 * source that was never captured contributes no label at all, so a rating cited
 * to a transcript of a lesson nobody recorded fails here.
 */
function buildLabels(evidence: CitationEvidence): string[] {
  const labels: string[] = [];

  (evidence.activities || []).forEach((activity, i) => {
    labels.push(normalise(`activity ${activity.index ?? i + 1}`));
    if (activity.name) labels.push(normalise(activity.name));
  });

  if (evidence.observerNotes?.trim()) {
    labels.push('observer note', 'observer notes', 'appraiser note', 'appraiser notes', 'lesson notes');
  }
  if (evidence.transcript?.trim()) {
    labels.push('transcript', 'audio', 'dialogue');
  }
  if (evidence.learningObjectives?.trim()) {
    labels.push('learning objective', 'learning objectives', 'success criteria');
  }
  (evidence.photos || []).forEach((photo) => {
    if (photo.caption?.trim()) labels.push(normalise(photo.caption));
  });
  if ((evidence.classroomConditions || []).length) {
    labels.push('classroom condition', 'classroom conditions');
  }

  return labels.filter((label) => label.length >= MIN_LABEL_LENGTH);
}

/** Can this one citation be traced back to something that was submitted? */
export function isCitationVerifiable(
  ref: string,
  haystack: string,
  labels: string[]
): boolean {
  if (!ref?.trim()) return false;

  const quotes = extractQuotes(ref);
  const usableQuotes = quotes
    .map(normalise)
    .filter((quote) => quote.length >= MIN_QUOTE_LENGTH);

  // A quotation is the strongest claim a citation can make, so where one is
  // offered it is the thing that has to check out. Falling back to the label
  // when a quotation fails would wave through the exact case this exists to
  // catch: a real activity name with invented words put in the teacher's mouth.
  if (usableQuotes.length) {
    return usableQuotes.some((quote) => haystack.includes(quote));
  }

  // Quotes too short to be distinctive are treated as no quote at all rather
  // than as a failure - "why?" is a real thing to cite and matches everything.
  const normalisedRef = normalise(ref);
  return labels.some((label) => normalisedRef.includes(label));
}

export function verifyCitations(
  scores: unknown,
  evidence: CitationEvidence
): CitationCheckResult {
  if (!Array.isArray(scores)) {
    return { scores: [], checked: 0, withdrawn: 0 };
  }

  const haystack = buildHaystack(evidence);
  const labels = buildLabels(evidence);

  let checked = 0;
  let withdrawn = 0;

  const verified = (scores as GradedIndicator[]).map((entry) => {
    // Nothing to withdraw: the model already declined to rate this one.
    if (!entry || typeof entry.score !== 'number' || entry.notObservable) return entry;

    checked++;

    const refs = Array.isArray(entry.evidenceRefs) ? entry.evidenceRefs : [];
    const supported = refs.some((ref) => isCitationVerifiable(String(ref), haystack, labels));
    if (supported) return entry;

    withdrawn++;
    return {
      ...entry,
      score: null,
      notObservable: true,
      rationale:
        'Not observable - the evidence cited for this rating could not be found in the ' +
        'captured record, so the rating was withdrawn rather than published on a citation ' +
        `that cannot be checked${
          refs.length ? ` (cited: ${refs.slice(0, 2).join('; ')})` : ' (no evidence was cited)'
        }.`,
    };
  });

  return { scores: verified, checked, withdrawn };
}
