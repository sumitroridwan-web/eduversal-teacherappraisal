import { TeacherAppraisalRecord, AutoGradeResult, CareerLevel, LessonActivity } from '../types';
import { getItemsForLevel, LEVEL_SCORING_CONFIGS } from '../data/frameworkRubrics';

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
 * Intelligent Rule-Based Pedagogical Auto-Grading Engine
 */
function executeRuleBasedAutoGrade(
  record: TeacherAppraisalRecord,
  items: ReturnType<typeof getItemsForLevel>,
  activities: LessonActivity[]
): AutoGradeResult {
  // Aggregate all textual signals
  const allText = [
    record.lessonTopic || '',
    record.learningObjectives || '',
    record.generalObserverNotes || '',
    record.audioTranscription || '',
    ...activities.map((a) => `${a.name} ${a.modality} ${a.teacherNotes} ${a.studentEvidenceNotes}`),
  ].join(' ').toLowerCase();

  const activityNames = activities.map((a) => a.name.toLowerCase()).join(' ');
  const teacherNotes = activities.map((a) => a.teacherNotes.toLowerCase()).join(' ') + ' ' + (record.generalObserverNotes || '').toLowerCase();
  const studentEvidence = activities.map((a) => a.studentEvidenceNotes.toLowerCase()).join(' ') + ' ' + (record.audioTranscription || '').toLowerCase();
  const objectives = (record.learningObjectives || '').toLowerCase();

  // Signal detection checks
  const hasObjectives = objectives.length > 10;
  const hasMeasurableVerbs = /(swbat|analyze|evaluate|create|calculate|explain|differentiate|demonstrate|verify|synthesize|justify|solve|construct)/i.test(objectives);
  const hasSuccessCriteria = /(success criteria|rubric|checklist|accurate|evidence|measure|level)/i.test(objectives) || objectives.includes('criteria');
  
  const hasStructuredPhases = activities.length >= 3 || /(hook|warm-up|introduction|modeling|guided|independent|plenary|exit ticket|closure)/i.test(activityNames + ' ' + allText);
  const hasGroupWork = activities.some((a) => a.modality?.includes('Group') || a.modality?.includes('Pair')) || /(group|pair|peer|collaborat|team|stations)/i.test(allText);
  const hasDifferentiation = /(differentiated|tier|scaffold|extension|modified|support|remediation|advanced)/i.test(allText);
  const hasActiveEngagement = /(hands-on|experiment|investigat|project|simulation|interactive|all students|whiteboard|digital)/i.test(allText);
  const hasHOTSQuestions = /(why|how|analyze|compare|contrast|justify|what if|hypothesize|evaluate|critique|bloom)/i.test(teacherNotes);
  const hasWaitTimeOrProbing = /(wait time|probing|follow-up|elaborate|clarify|unpack|scaffold)/i.test(teacherNotes);
  const hasFormativeAssessment = /(quiz|formative|exit ticket|check for understanding|thumbs|whiteboard|pollen|mini-whiteboard|rubric)/i.test(allText);
  const hasMisconceptionsAddressed = /(misconception|error|clarified|corrected|redirected|feedback|addressed confusion)/i.test(allText);
  const hasCALPorVocab = /(calp|vocabulary|academic language|terminology|keywords|glossary|syntax)/i.test(allText);
  const hasPositiveCulture = /(respect|praise|enthusiasm|safe|encourag|growth mindset|celebrat)/i.test(allText);
  const hasClassroomRoutines = /(routine|transition|on task|pacing|timekeeper|clear expectations|smooth)/i.test(allText);
  const hasClosureOrPlenary = /(plenary|closure|exit ticket|summary|reflection|recap|self-assessment)/i.test(activityNames + ' ' + allText);

  const scoredList: Array<{
    indicatorCode: string;
    score: 1 | 2 | 3 | 4;
    rationale: string;
    domainId: string;
    title: string;
  }> = [];

  items.forEach((item) => {
    let score: 1 | 2 | 3 | 4 = 3; // Proficient default baseline
    let rationale = '';

    const id = item.id;

    // Domain 1: Planning
    if (id === 'D1.1' || id === 'EYD1.1') {
      if (activities.length >= 4 && hasStructuredPhases) {
        score = 4;
        rationale = `Detailed lesson activities schedule with ${activities.length} explicit phases and designated time ranges demonstrates distinguished structural design.`;
      } else if (hasStructuredPhases || activities.length >= 2) {
        score = 3;
        rationale = 'Logical lesson sequence observed with clear progression from apperception to practice.';
      } else {
        score = 2;
        rationale = 'Basic lesson sequence with minor timing or phase transition ambiguities.';
      }
    } else if (id === 'D1.2' || id === 'EYD1.2') {
      if (hasObjectives && hasMeasurableVerbs && hasSuccessCriteria) {
        score = 4;
        rationale = `Observable, student-centered learning objectives stated with explicit measurable success criteria ("${record.learningObjectives?.slice(0, 50)}...").`;
      } else if (hasObjectives) {
        score = 3;
        rationale = 'Clear learning objectives articulated and shared with learners.';
      } else {
        score = 2;
        rationale = 'Learning objectives are broad or focused primarily on activity rather than verified student mastery.';
      }
    } else if (id === 'D1.3' || id === 'EYD1.3') {
      if (activities.length >= 3 && hasStructuredPhases) {
        score = 4;
        rationale = 'High alignment between lesson tasks, activities, and stated core learning objectives throughout all phases.';
      } else {
        score = 3;
        rationale = 'Planned learning activities directly support the instructional topic and standard curriculum expectations.';
      }
    } else if (id === 'D1.4') {
      if (hasDifferentiation) {
        score = 4;
        rationale = 'Explicit evidence of differentiated support, tiered task variations, and targeted scaffolding for diverse learner tiers.';
      } else if (hasGroupWork) {
        score = 3;
        rationale = 'Varied modalities utilized; student support provided during guided practice.';
      } else {
        score = 2;
        rationale = 'Standard whole-class progression observed; further differentiated extensions recommended.';
      }
    } else if (id === 'D1.5') {
      if (hasGroupWork && (hasStructuredPhases || activities.length >= 3)) {
        score = 4;
        rationale = 'Exemplary balance between whole-class direct modeling, collaborative peer tasks, and individual application.';
      } else {
        score = 3;
        rationale = 'Effective mix of teacher-led explanation and active student working intervals.';
      }
    }

    // Domain 2: Classroom Management
    else if (id.startsWith('D2') || id.startsWith('EYD2')) {
      if (id === 'D2.1' || id === 'EYD2.1') {
        score = hasClassroomRoutines || hasStructuredPhases ? 4 : 3;
        rationale = score === 4
          ? 'Smooth transitions and established classroom operating procedures maintained learning momentum seamlessly.'
          : 'Pacing and classroom flow were maintained throughout the observation.';
      } else if (id === 'D2.2' || id === 'EYD2.2') {
        score = hasPositiveCulture ? 4 : 3;
        rationale = score === 4
          ? 'High-trust, respectful rapport with active celebration of effort and intellectual risk-taking.'
          : 'Supportive and orderly classroom learning atmosphere.';
      } else if (id === 'D2.3' || id === 'EYD2.3') {
        score = hasActiveEngagement ? 4 : 3;
        rationale = score === 4
          ? 'High on-task engagement sustained across all learner groups through dynamic activities.'
          : 'Students were consistently attentive and engaged with assigned tasks.';
      } else {
        score = 3;
        rationale = 'Classroom environment effectively supports focused academic investigation and safety.';
      }
    }

    // Domain 3: Instructional Process
    else if (id.startsWith('D3') || id.startsWith('EYD3')) {
      if (id === 'D3.3' || id === 'EYD3.3') {
        // Apperception & Hook
        score = /(hook|prior knowledge|warm-up|apperception|real-world|phenomenon)/i.test(allText) ? 4 : 3;
        rationale = score === 4
          ? 'Compelling hook connecting new conceptual material to prior learner schemas and authentic real-world contexts.'
          : 'Opening effectively activated relevant prerequisite knowledge.';
      } else if (id === 'D3.5') {
        // Higher Order Thinking
        score = hasHOTSQuestions ? 4 : (hasStructuredPhases ? 3 : 2);
        rationale = score === 4
          ? 'Systematic higher-order questioning requiring students to analyze, compare, evaluate, and justify their reasoning.'
          : 'Effective questioning combining foundational checks and conceptual explanations.';
      } else if (id === 'D3.10') {
        // All student participation
        score = hasGroupWork || hasActiveEngagement ? 4 : 3;
        rationale = score === 4
          ? 'Equitable participation protocols (cold calling, peer pair-share, mini-whiteboards) engaged 100% of learners.'
          : 'Broad student participation observed during questioning and classroom discussions.';
      } else if (id === 'D3.11') {
        // Wait time & probing
        score = hasWaitTimeOrProbing ? 4 : 3;
        rationale = score === 4
          ? 'Generous wait time and targeted follow-up probing guided students to elaborate and refine their own thinking.'
          : 'Appropriate response pacing and clarification provided when student questions arose.';
      } else if (id === 'D3.18') {
        // CALP & Academic Vocabulary
        score = hasCALPorVocab ? 4 : 3;
        rationale = score === 4
          ? 'Explicit instruction and reinforcement of subject-specific academic register (CALP) with precise student usage.'
          : 'Subject-specific terminology introduced and reinforced in context.';
      } else if (id === 'D3.19') {
        // Lesson closure / Plenary
        score = hasClosureOrPlenary ? 4 : 3;
        rationale = score === 4
          ? 'Dedicated plenary summarizing key understandings and consolidating core learning objectives with student voice.'
          : 'Lesson concluded with summary of key concepts covered.';
      } else {
        score = (hasHOTSQuestions && hasActiveEngagement) ? 4 : 3;
        rationale = 'Instructional delivery meets rigorous Eduversal Framework 2 quality benchmarks.';
      }
    }

    // Domain 4: Assessment
    else if (id.startsWith('D4') || id.startsWith('EYD4')) {
      if (id === 'D4.2' || id === 'EYD4.2') {
        score = hasFormativeAssessment ? 4 : 3;
        rationale = score === 4
          ? 'Continuous formative checks for understanding deployed throughout the lesson to adjust real-time pacing.'
          : 'Formative questioning used to gauge student comprehension during practice.';
      } else if (id === 'D4.3' || id === 'EYD4.3') {
        score = hasMisconceptionsAddressed ? 4 : 3;
        rationale = score === 4
          ? 'Swift identification and pedagogical remediation of student misconceptions with actionable feedback.'
          : 'Feedback provided to students during guided and independent tasks.';
      } else {
        score = hasFormativeAssessment ? 4 : 3;
        rationale = 'Monitoring and assessment alignment adheres to Eduversal quality standards.';
      }
    }

    // Framework 1 / 3 / 4 / Leadership
    else {
      score = 3;
      rationale = 'Meets expected professional benchmark standards for the career stage.';
    }

    scoredList.push({
      indicatorCode: item.id,
      score,
      rationale,
      domainId: item.domainId,
      title: item.title,
    });
  });

  // Calculate totals and Glow / Grow / Go feedback
  const glow = [
    `Strong instructional structure with ${activities.length > 0 ? `${activities.length} distinct lesson phases` : 'coherent lesson progression'} supporting clear learning objectives.`,
    hasHOTSQuestions
      ? 'Effective cognitive activation through targeted probing questions that encouraged analytical student thinking.'
      : 'Active student engagement maintained with positive classroom rapport and supportive management.',
    hasFormativeAssessment
      ? 'Continuous formative checks and timely teacher feedback ensured high student task fidelity.'
      : 'Clear communication of expectations and smooth transitions throughout observed activities.',
  ];

  const grow = [
    'How might you increase student-to-student talk time and structured peer evaluation during guided practice phases?',
    'What additional tiered extension tasks could be pre-planned to stretch early finishers into higher-order synthesis?',
    'How can plenary exit tickets be utilized for individualized next-lesson starter grouping?',
  ];

  const go = [
    'Incorporate a 3-minute structured Think-Pair-Share routine into the core modeling segment of upcoming unit plans.',
    'Embed observable success criteria check-boxes directly onto student task sheets for self-assessment.',
    'Document differentiated scaffolding tiers (Core, Scaffolded, Extension) in the weekly lesson planning template.',
  ];

  const summaryEvaluation = `The observed lesson demonstrated ${
    scoredList.filter((s) => s.score === 4).length > 6 ? 'distinguished' : 'solid proficient'
  } pedagogical execution under Eduversal Framework 2.0 standards. Instruction was characterized by clear objectives, purposeful task sequencing across ${
    activities.length || 'structured'
  } activities, active student participation, and consistent classroom management.`;

  return calculateAutoGradeSummary(record.careerLevel, scoredList, { glow, grow, go, summaryEvaluation }, activities.length);
}

/**
 * Calculates raw scores, percentages, and indicative grades
 */
function calculateAutoGradeSummary(
  careerLevel: CareerLevel,
  scores: Array<{ indicatorCode: string; score: 1 | 2 | 3 | 4; rationale: string; domainId?: string; title?: string }>,
  extraData: any,
  activitiesCount: number
): AutoGradeResult {
  const config = LEVEL_SCORING_CONFIGS[careerLevel];
  const items = getItemsForLevel(careerLevel);
  const maxScore = items.length * 4;

  let totalRaw = 0;
  const enrichedScores = scores.map((s) => {
    const item = items.find((it) => it.id === s.indicatorCode);
    totalRaw += s.score;
    return {
      indicatorCode: s.indicatorCode,
      score: s.score,
      rationale: s.rationale,
      domainId: item?.domainId || s.domainId || 'Framework Indicator',
      title: item?.title || s.title || `Indicator ${s.indicatorCode}`,
    };
  });

  const percentage = maxScore > 0 ? Math.round((totalRaw / maxScore) * 100) : 0;

  // Grade calculation
  let grade: 'A' | 'B' | 'C' | 'D' | 'F' = 'F';
  if (totalRaw >= config.scaleA[0]) grade = 'A';
  else if (totalRaw >= config.scaleB[0]) grade = 'B';
  else if (totalRaw >= config.scaleC[0]) grade = 'C';
  else if (totalRaw >= config.scaleD[0]) grade = 'D';
  else grade = 'F';

  return {
    scores: enrichedScores,
    overallScore: totalRaw,
    maxScore,
    percentage,
    grade,
    glow: extraData.glow || [],
    grow: extraData.grow || [],
    go: extraData.go || [],
    summaryEvaluation: extraData.summaryEvaluation || extraData.summary || 'Appraisal evaluation generated successfully.',
    activitiesEvaluatedCount: activitiesCount,
  };
}
