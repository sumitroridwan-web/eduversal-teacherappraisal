/**
 * The offline rule engine runs whenever the Gemini endpoint is unreachable,
 * which is exactly when nobody is watching it. What matters most here is not
 * that it rates well - it matches keywords, and it cannot rate well - but that
 * it never invents a rating, and that everything it does rate points back at
 * text the appraiser actually wrote.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { executeRuleBasedAutoGrade, splitObserverNotes } from '../src/services/autoGrader';
import { getItemsForLevel } from '../src/data/frameworkRubrics';
import type { TeacherAppraisalRecord, CareerLevel } from '../src/types';

function recordWith(fields: Partial<TeacherAppraisalRecord>): TeacherAppraisalRecord {
  return {
    careerLevel: 'Proficient' as CareerLevel,
    generalObserverNotes: '',
    scores: {},
    activities: [],
    photos: [],
    feedback: { glow: [], grow: [], go: [] },
    ...fields,
  } as TeacherAppraisalRecord;
}

function grade(record: TeacherAppraisalRecord) {
  return executeRuleBasedAutoGrade(
    record,
    getItemsForLevel(record.careerLevel),
    record.activities || []
  );
}

describe('splitObserverNotes', () => {
  test('treats the appraiser\'s own line breaks as the segmentation', () => {
    const parts = splitObserverNotes('First moment.\nSecond moment.\n\nThird moment.');
    assert.deepEqual(parts, ['First moment.', 'Second moment.', 'Third moment.']);
  });

  test('splits an unbroken pasted block on sentence ends', () => {
    const block =
      'The starter was on the board and every student began within two minutes. ' +
      'The teacher modelled a worked example and asked why the volume changed. ' +
      'Pairs then worked through the practice questions while the teacher circulated. ' +
      'An exit ticket was collected at the door as students left the room.';

    const parts = splitObserverNotes(block);

    assert.ok(parts.length >= 4, 'a long single-line paste should yield several moments');
    parts.forEach((part) => assert.ok(part.length > 0));
  });

  test('leaves a short single line alone', () => {
    assert.deepEqual(splitObserverNotes('Quiet lesson, little to note.'), [
      'Quiet lesson, little to note.',
    ]);
  });

  test('returns nothing for empty or whitespace notes', () => {
    assert.deepEqual(splitObserverNotes(''), []);
    assert.deepEqual(splitObserverNotes('   \n  '), []);
    assert.deepEqual(splitObserverNotes(undefined), []);
  });
});

describe('executeRuleBasedAutoGrade', () => {
  test('rates nothing at all when no evidence was captured', () => {
    const result = grade(recordWith({}));

    assert.ok(result.scores.length > 0, 'every indicator should be reported on');
    assert.equal(result.observedCount, 0);
    assert.equal(result.notObservableCount, result.scores.length);
    result.scores.forEach((entry) => {
      assert.equal(entry.score, null);
      assert.equal(entry.notObservable, true);
    });
  });

  test('never returns a score without at least one evidence reference', () => {
    const result = grade(
      recordWith({
        generalObserverNotes:
          'Starter on the board, all students on task within two minutes.\n' +
          'Teacher modelled the worked example, then asked why the volume changed and used wait time.\n' +
          'Guided practice in mixed pairs with collaborative group work throughout.\n' +
          'Exit ticket collected; students articulated the success criteria in their own words.',
      })
    );

    result.scores.forEach((entry) => {
      if (typeof entry.score === 'number') {
        assert.ok(
          (entry.evidenceRefs || []).length > 0,
          `${entry.indicatorCode} was rated with nothing to cite`
        );
      }
    });
  });

  test('cites text that is actually in the notes', () => {
    const notes = 'Teacher used mini-whiteboards to check for understanding across the whole class.';
    const result = grade(recordWith({ generalObserverNotes: notes }));

    const rated = result.scores.filter((s) => typeof s.score === 'number');
    assert.ok(rated.length > 0, 'this note speaks to several indicators');

    rated.forEach((entry) => {
      (entry.evidenceRefs || []).forEach((ref) => {
        // Each reference is "<where>: <quoted snippet>"; the snippet has to be
        // a real substring of the note it claims to come from.
        const snippet = ref.slice(ref.indexOf(':') + 1).replace(/["…]/g, '').trim();
        assert.ok(
          notes.toLowerCase().includes(snippet.toLowerCase().slice(0, 40)),
          `cited text not found in the notes: ${ref}`
        );
      });
    });
  });

  test('indexes notes paragraph by paragraph so a citation locates a moment', () => {
    const result = grade(
      recordWith({
        generalObserverNotes:
          'Established routine, transition was smooth and momentum held.\n' +
          'Teacher circulated and checked for understanding with mini-whiteboards.\n' +
          'Misconception at table 4 was corrected with targeted feedback.',
      })
    );

    const refs = result.scores.flatMap((s) => s.evidenceRefs || []);
    assert.ok(
      refs.some((ref) => /Observer notes, paragraph \d+/.test(ref)),
      'a multi-paragraph note should cite the paragraph, not the whole blob'
    );
  });

  test('lets a well-evidenced notes-only observation reach the top band', () => {
    // Before notes were split per paragraph, a single blob counted as one
    // evidence hit however much it said, capping every notes-only observation
    // at Proficient no matter what the lesson did.
    const result = grade(
      recordWith({
        generalObserverNotes:
          'All students were on task and every student answered on mini-whiteboards.\n' +
          'Questioning consistently pushed students to justify and analyse their reasoning.\n' +
          'The teacher asked why the method worked and what if the variable changed.\n' +
          'Every student completed the exit ticket independently throughout the plenary.',
      })
    );

    assert.ok(
      result.scores.some((s) => s.score === 4),
      'sustained, repeatedly evidenced practice should be able to reach Distinguished'
    );
  });

  test('reports attainment across rated indicators only', () => {
    const result = grade(
      recordWith({ generalObserverNotes: 'Lesson objectives were shared as success criteria.' })
    );

    assert.equal(result.maxScore, result.observedCount * 4);
    assert.equal(
      result.observedCount + result.notObservableCount,
      result.totalIndicatorCount
    );
  });

  test('counts structured activities as evidence in their own right', () => {
    const result = grade(
      recordWith({
        activities: [
          {
            id: 'a1',
            name: 'Hook and prior knowledge activation',
            durationMinutes: 8,
            timeRange: '08:00 - 08:08',
            modality: 'Whole Class Teacher-Led',
            teacherNotes: 'Teacher opened with a demonstration and questioning.',
            studentEvidenceNotes: 'Students predicted the outcome in pairs.',
          },
        ],
      })
    );

    assert.equal(result.activitiesEvaluatedCount, 1);
    assert.ok(result.observedCount > 0, 'an activity timeline is evidence');
    const refs = result.scores.flatMap((s) => s.evidenceRefs || []);
    assert.ok(refs.some((ref) => ref.includes('Activity 1')));
  });

  test('says plainly what was missing when an indicator cannot be rated', () => {
    const result = grade(recordWith({ generalObserverNotes: 'A calm and orderly lesson.' }));

    const unrated = result.scores.filter((s) => s.notObservable);
    assert.ok(unrated.length > 0);
    unrated.forEach((entry) => {
      assert.match(entry.rationale, /^Not observable - /);
      assert.ok(entry.rationale.length > 'Not observable - '.length + 10);
    });
  });
});
