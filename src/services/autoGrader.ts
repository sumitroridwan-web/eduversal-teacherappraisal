import { TeacherAppraisalRecord, AutoGradeResult, CareerLevel, LessonActivity } from '../types';
import { getItemsForLevel } from '../data/frameworkRubrics';
import { MAX_FEEDBACK_ITEMS } from './glowGrowGo';

/**
 * Auto-grades a lesson observation using either Gemini AI backend or
 * a deterministic pedagogical evaluation rule engine based on Eduversal rubrics.
 */
export async function executeAutoGrade(
  record: TeacherAppraisalRecord
): Promise<AutoGradeResult> {
  const visibleItems = getItemsForLevel(record.careerLevel);
  const activities = record.activities || [];

  // Try Server-Side Gemini AI Auto-Grading First
  try {
    const payload = {
      teacherName: record.teacherName || 'Observed Teacher',
      subject: record.subject || record.subjectCategory,
      careerLevel: record.careerLevel,
      schoolLevel: record.schoolLevel,
      gradeClass: record.gradeClass,
      lessonTopic: record.lessonTopic,
      learningObjectives: record.learningObjectives,
      observerNotes: record.generalObserverNotes,
      transcript: record.audioTranscription,
      photos: (record.photos || [])
        .filter((p) => p.caption.trim())
        .map((p) => ({
          caption: p.caption.trim(),
          isBestPractice: p.isBestPractice,
          source: p.source,
        })),
      classroomConditions: record.aiAnalysis?.classroomConditions || [],
      activities: activities.map((act, idx) => ({
        index: idx + 1,
        name: act.name,
        timeRange: act.timeRange || `${act.durationMinutes || 10} mins`,
        modality: act.modality,
        teacherActions: act.teacherNotes,
        studentEvidence: act.studentEvidenceNotes,
      })),
      indicators: visibleItems.map((item) => ({
        id: item.id,
        domainId: item.domainId,
        title: item.title,
        coachingFocus: item.coachingFocus,
        descriptors: item.descriptors,
      })),
    };

    const res = await fetch('/api/auto-grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        return calculateAutoGradeSummary(record.careerLevel, json.data.scores, json.data, activities.length);
      }
    }
  } catch (err) {
    console.warn('Backend auto-grade endpoint unavailable, switching to internal pedagogical rule engine:', err);
  }

  // Fallback: Comprehensive In-Browser Pedagogical Rule Engine
  return executeRuleBasedAutoGrade(record, visibleItems, activities);
}

/**
 * Offline pedagogical rule engine, used when the AI endpoint is unavailable.
 *
 * It only rates an indicator where the captured evidence actually speaks to
 * it. Anything else comes back as "not observable" with the gap named, rather
 * than a default rating, so an appraiser is never handed an invented score.
 */

interface EvidenceItem {
  /** How an appraiser would locate this again, e.g. "Transcript [04:12]". */
  ref: string;
  text: string;
}

function buildEvidenceIndex(record: TeacherAppraisalRecord, activities: LessonActivity[]): EvidenceItem[] {
  const index: EvidenceItem[] = [];

  activities.forEach((act, i) => {
    const where = `Activity ${i + 1}: ${act.name}${act.timeRange ? ` (${act.timeRange})` : ''}`;
    const body = [act.name, act.modality, act.teacherNotes, act.studentEvidenceNotes]
      .filter(Boolean)
      .join('. ');
    if (body.trim()) index.push({ ref: where, text: body });
  });

  if (record.generalObserverNotes?.trim()) {
    index.push({ ref: 'Observer notes', text: record.generalObserverNotes });
  }
  if (record.learningObjectives?.trim()) {
    index.push({ ref: 'Stated learning objectives', text: record.learningObjectives });
  }

  const segments = record.transcriptSegments || [];
  if (segments.length) {
    segments.forEach((seg) => {
      if (seg.text.trim()) index.push({ ref: `Transcript [${seg.timeLabel}]`, text: seg.text });
    });
  } else if (record.audioTranscription?.trim()) {
    index.push({ ref: 'Lesson transcript', text: record.audioTranscription });
  }

  (record.photos || []).forEach((photo) => {
    if (photo.caption.trim()) {
      index.push({ ref: `Photo: "${photo.caption.trim()}"`, text: photo.caption });
    }
  });

  (record.aiAnalysis?.classroomConditions || []).forEach((c) => {
    index.push({
      ref: `Classroom conditions [${c.timeLabel}] - ${c.theory}`,
      text: `${c.condition} ${c.interpretation}`,
    });
  });

  return index;
}

/** Evidence items matching a pattern, most useful first. */
function matchEvidence(index: EvidenceItem[], pattern: RegExp, limit = 2): EvidenceItem[] {
  return index.filter((item) => pattern.test(item.text)).slice(0, limit);
}

function citation(hits: EvidenceItem[]): string {
  return hits
    .map((h) => {
      const snippet = h.text.trim().replace(/\s+/g, ' ').slice(0, 90);
      return `${h.ref}: "${snippet}${h.text.trim().length > 90 ? '…' : ''}"`;
    })
    .join('; ');
}

interface IndicatorRule {
  /** Evidence that must exist for the indicator to be rateable at all. */
  probe: RegExp;
  /** Stronger evidence that lifts the rating. */
  strong?: RegExp;
  /** What was missing, used in the not-observable rationale. */
  missing: string;
  strongNote: string;
  presentNote: string;
}

const GENERIC_RULE: IndicatorRule = {
  probe: /(student|teacher|lesson|task|activity|question|group|explain)/i,
  strong: /(all students|every student|consistently|throughout|independent)/i,
  missing: 'no activity, transcript, note or photo addressed this indicator',
  strongNote: 'sustained practice evidenced across the captured lesson record',
  presentNote: 'practice evidenced in the captured lesson record',
};

const INDICATOR_RULES: Record<string, IndicatorRule> = {
  D1_1: {
    probe: /(hook|warm-up|introduction|modeling|guided|independent|plenary|exit ticket|closure|phase|sequence|transition)/i,
    strong: /(timing|time range|pacing|sequence|transition)/i,
    missing: 'no lesson phases or timings were recorded',
    strongNote: 'lesson phases and their timings are explicit and sequenced',
    presentNote: 'a workable lesson sequence is evidenced',
  },
  D1_2: {
    probe: /(objective|learning intention|swbat|goal|success criteria)/i,
    strong: /(swbat|analyze|evaluate|create|calculate|explain|demonstrate|justify|success criteria|measurable)/i,
    missing: 'no learning objectives were captured',
    strongNote: 'objectives are measurable and framed around student mastery',
    presentNote: 'objectives are stated but broadly framed',
  },
  D1_3: {
    probe: /(objective|topic|curriculum|align|content|task)/i,
    strong: /(align|directly support|builds on|prerequisite)/i,
    missing: 'neither objectives nor lesson content were captured in enough detail to judge alignment',
    strongNote: 'tasks map directly onto the stated objectives',
    presentNote: 'lesson content is broadly consistent with the topic',
  },
  D1_4: {
    probe: /(differentiat|scaffold|tier|extension|support|modified|remediation|advanced|SEN|ability)/i,
    strong: /(differentiat|tier|extension|remediation)/i,
    missing: 'no differentiation, scaffolding or learner-support evidence was captured',
    strongNote: 'differentiated tiers and targeted scaffolding are evidenced',
    presentNote: 'some learner support is evidenced',
  },
  D1_5: {
    probe: /(group|pair|individual|independent|collaborat|whole class|discussion)/i,
    strong: /(group|pair|collaborat)/i,
    missing: 'no grouping or task-modality information was captured',
    strongNote: 'a deliberate balance of individual and collaborative work is evidenced',
    presentNote: 'a working mix of task modalities is evidenced',
  },
  D3_5: {
    probe: /(why|how|question|ask|analy|compar|justify|evaluat|explain|what if|predict)/i,
    strong: /(why|justify|analy|evaluat|what if|hypothes|critique|compare)/i,
    missing: 'no questioning was captured in the transcript or notes',
    strongNote: 'questioning repeatedly pushes into analysis and justification',
    presentNote: 'questioning is present but largely recall-level',
  },
  D3_10: {
    probe: /(participat|all students|volunteer|cold call|hands up|pair share|whiteboard|group|responded)/i,
    strong: /(all students|every student|cold call|pair share|mini-whiteboard|100%)/i,
    missing: 'no evidence of how widely students participated was captured',
    strongNote: 'participation routines reach the whole class, not only volunteers',
    presentNote: 'student participation is evidenced',
  },
  D3_11: {
    probe: /(wait|pause|probe|follow-up|elaborate|clarif|rephrase|prompt)/i,
    strong: /(wait time|probing|follow-up|elaborate|unpack)/i,
    missing: 'no evidence of wait time or follow-up questioning was captured',
    strongNote: 'wait time and probing extend student answers',
    presentNote: 'some follow-up questioning is evidenced',
  },
  D3_18: {
    probe: /(vocabulary|terminology|academic language|calp|keyword|glossary|define|term)/i,
    strong: /(academic language|calp|terminology|glossary|precise)/i,
    missing: 'no academic-language or vocabulary work was captured',
    strongNote: 'subject-specific academic register is taught and required of students',
    presentNote: 'subject vocabulary is introduced in context',
  },
  D3_19: {
    probe: /(closure|plenary|summary|recap|reflect|exit ticket|conclude|wrap)/i,
    strong: /(plenary|exit ticket|self-assessment|consolidat)/i,
    missing: 'the end of the lesson was not captured',
    strongNote: 'a purposeful plenary consolidates the learning with student voice',
    presentNote: 'the lesson is drawn to a close with a summary',
  },
  D2_1: {
    probe: /(routine|transition|pacing|on task|expectation|procedure|settle|line up|momentum)/i,
    strong: /(smooth|established routine|momentum|clear expectation)/i,
    missing: 'no evidence about routines, transitions or pacing was captured',
    strongNote: 'established routines keep transitions tight and momentum intact',
    presentNote: 'classroom routines are functioning',
  },
  D2_2: {
    probe: /(respect|praise|encourag|rapport|tone|relationship|safe|welcom|celebrat)/i,
    strong: /(praise|celebrat|growth mindset|high trust|warm)/i,
    missing: 'no evidence about classroom climate or rapport was captured',
    strongNote: 'a warm, high-trust climate encourages intellectual risk-taking',
    presentNote: 'a supportive classroom climate is evidenced',
  },
  D2_3: {
    probe: /(engag|on task|attentive|focus|hands-on|participat|interest|distract|off task)/i,
    strong: /(highly engaged|on task throughout|all students|sustained)/i,
    missing: 'no evidence about student engagement was captured',
    strongNote: 'engagement is sustained across learner groups',
    presentNote: 'students are engaged with the set tasks',
  },
  D4_2: {
    probe: /(check for understanding|formative|quiz|exit ticket|whiteboard|thumbs|monitor|circulat|assess)/i,
    strong: /(formative|exit ticket|check for understanding|circulat|monitor)/i,
    missing: 'no assessment or checking-for-understanding activity was captured',
    strongNote: 'checks for understanding run through the lesson and inform pacing',
    presentNote: 'some checking of student understanding is evidenced',
  },
  D4_3: {
    probe: /(misconception|error|mistake|correct|feedback|clarif|redirect|confus)/i,
    strong: /(misconception|corrected|remediat|targeted feedback)/i,
    missing: 'no evidence of feedback or misconception handling was captured',
    strongNote: 'misconceptions are surfaced and addressed with actionable feedback',
    presentNote: 'feedback is given during tasks',
  },
};

function ruleFor(id: string): IndicatorRule {
  // Early Years items mirror their mainstream equivalents (EYD1.1 -> D1.1).
  const normalised = id.replace(/^EYD/, 'D').replace('.', '_');
  return INDICATOR_RULES[normalised] || GENERIC_RULE;
}

function executeRuleBasedAutoGrade(
  record: TeacherAppraisalRecord,
  items: ReturnType<typeof getItemsForLevel>,
  activities: LessonActivity[]
): AutoGradeResult {
  const index = buildEvidenceIndex(record, activities);

  const scoredList: AutoGradeResult['scores'] = [];

  items.forEach((item) => {
    const rule = ruleFor(item.id);
    const hits = matchEvidence(index, rule.probe);

    if (!index.length || !hits.length) {
      scoredList.push({
        indicatorCode: item.id,
        score: null,
        notObservable: true,
        rationale: `Not observable - ${
          index.length
            ? rule.missing
            : 'no lesson activities, observer notes, transcript or photos have been captured yet'
        }.`,
        evidenceRefs: [],
        domainId: item.domainId,
        title: item.title,
      });
      return;
    }

    const strongHits = rule.strong ? matchEvidence(index, rule.strong) : [];
    const score: 1 | 2 | 3 | 4 = strongHits.length >= 2 ? 4 : strongHits.length === 1 ? 3 : 2;
    const cited = strongHits.length ? strongHits : hits;

    scoredList.push({
      indicatorCode: item.id,
      score,
      notObservable: false,
      rationale: `${score >= 3 ? rule.strongNote : rule.presentNote}. Evidence - ${citation(cited)}`,
      evidenceRefs: cited.map((h) => `${h.ref}: "${h.text.trim().replace(/\s+/g, ' ').slice(0, 90)}"`),
      domainId: item.domainId,
      title: item.title,
    });
  });

  const observed = scoredList.filter((s) => typeof s.score === 'number');
  const notObservable = scoredList.length - observed.length;

  // Keep the debrief lines short. The full evidence citation stays attached to
  // the indicator itself; repeating it here made entries unreadable.
  const glow = observed
    .filter((s) => (s.score || 0) >= 3)
    .slice(0, MAX_FEEDBACK_ITEMS)
    .map((s) => `${s.title}: ${s.score === 4 ? 'Distinguished' : 'Proficient'} practice evidenced.`);

  const grow = notObservable
    ? [
        `${notObservable} of ${scoredList.length} indicators could not be rated from the evidence captured - which of these would you want an observer to look for next time?`,
        'How might the lesson record capture student work directly, so assessment indicators can be evidenced rather than inferred?',
      ]
    : [
        'How might you increase student-to-student talk during guided practice?',
        'What extension tasks could stretch early finishers into higher-order synthesis?',
      ];

  const go = [
    notObservable
      ? 'Capture photo evidence of student work and the board during the next observation so assessment and planning indicators can be evidenced.'
      : 'Embed observable success criteria on student task sheets for self-assessment.',
    'Record the lesson phases with time ranges so pacing can be evidenced rather than recalled.',
  ];

  const summaryEvaluation = observed.length
    ? `Rated ${observed.length} of ${scoredList.length} Framework 2 indicators from the evidence captured (${index.length} evidence items across activities, notes, transcript and photos). ${
        notObservable
          ? `${notObservable} indicators are marked not observable - they were not evidenced by the recording, notes or photos and have been left unscored rather than assumed.`
          : 'All indicators were evidenced.'
      }`
    : 'No indicator could be rated. Capture lesson activities, observer notes, an audio recording or photo evidence, then run auto-grading again.';

  return calculateAutoGradeSummary(
    record.careerLevel,
    scoredList,
    {
      glow,
      grow: grow.slice(0, MAX_FEEDBACK_ITEMS),
      go: go.slice(0, MAX_FEEDBACK_ITEMS),
      summaryEvaluation,
    },
    activities.length
  );
}

/**
 * Totals only the indicators that could actually be rated.
 *
 * The percentage is attainment across observed indicators, not across the full
 * rubric - otherwise every unobserved indicator would silently read as a zero
 * and drag a fair lesson into a failing grade.
 */
function calculateAutoGradeSummary(
  careerLevel: CareerLevel,
  scores: AutoGradeResult['scores'],
  extraData: any,
  activitiesCount: number
): AutoGradeResult {
  const items = getItemsForLevel(careerLevel);

  let totalRaw = 0;
  let observedCount = 0;

  const enrichedScores = scores.map((s) => {
    const item = items.find((it) => it.id === s.indicatorCode);
    if (typeof s.score === 'number') {
      totalRaw += s.score;
      observedCount++;
    }
    return {
      indicatorCode: s.indicatorCode,
      score: s.score,
      rationale: s.rationale,
      evidenceRefs: s.evidenceRefs || [],
      notObservable: s.notObservable ?? s.score === null,
      domainId: item?.domainId || s.domainId || 'Framework Indicator',
      title: item?.title || s.title || `Indicator ${s.indicatorCode}`,
    };
  });

  const maxScore = observedCount * 4;
  const percentage = maxScore > 0 ? Math.round((totalRaw / maxScore) * 100) : 0;

  let grade: 'A' | 'B' | 'C' | 'D' | 'F' = 'F';
  if (observedCount === 0) grade = 'F';
  else if (percentage >= 86) grade = 'A';
  else if (percentage >= 66) grade = 'B';
  else if (percentage >= 51) grade = 'C';
  else if (percentage >= 36) grade = 'D';

  return {
    scores: enrichedScores,
    overallScore: totalRaw,
    maxScore,
    percentage,
    grade,
    observedCount,
    notObservableCount: enrichedScores.length - observedCount,
    totalIndicatorCount: enrichedScores.length,
    // Capped regardless of source: the model can return a long list, and the
    // debrief has to stay discussable.
    glow: (extraData.glow || []).slice(0, MAX_FEEDBACK_ITEMS),
    grow: (extraData.grow || []).slice(0, MAX_FEEDBACK_ITEMS),
    go: (extraData.go || []).slice(0, MAX_FEEDBACK_ITEMS),
    summaryEvaluation:
      extraData.summaryEvaluation || extraData.summary || 'Appraisal evaluation generated.',
    activitiesEvaluatedCount: activitiesCount,
  };
}
