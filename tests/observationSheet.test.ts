import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  isRated,
  visibleItems,
  findNextUnrated,
  stampTime,
  appendEvidenceStem,
  coverageProgress,
  carryContext,
} from '../src/services/observationSheet';
import { getItemsForLevel, COVERAGE_FLOOR } from '../src/data/frameworkRubrics';
import type { AppraisalItem, ItemScoreRecord } from '../src/types';

const ITEMS = getItemsForLevel('Proficient');

function scoresFor(ids: string[]): Record<string, ItemScoreRecord> {
  const scores: Record<string, ItemScoreRecord> = {};
  ids.forEach((id) => (scores[id] = { score: 3, notes: '' }));
  return scores;
}

describe('isRated', () => {
  test('counts a number as rated and null, missing or absent as not', () => {
    const scores: Record<string, ItemScoreRecord> = {
      rated: { score: 2, notes: '' },
      cleared: { score: null, notes: '' },
    };

    assert.equal(isRated(scores, 'rated'), true);
    assert.equal(isRated(scores, 'cleared'), false);
    assert.equal(isRated(scores, 'never-seen'), false);
    assert.equal(isRated({} as Record<string, ItemScoreRecord>, 'anything'), false);
  });
});

describe('visibleItems', () => {
  test('shows everything on the ALL tab', () => {
    assert.equal(visibleItems(ITEMS, {}, 'ALL', false).length, ITEMS.length);
  });

  test('narrows to one section', () => {
    const sectionB = visibleItems(ITEMS, {}, 'B', false);

    assert.ok(sectionB.length > 0);
    sectionB.forEach((item) => assert.equal(item.section, 'B'));
  });

  test('hides rated indicators when unrated-only is on', () => {
    const firstThree = ITEMS.slice(0, 3).map((i) => i.id);
    const shown = visibleItems(ITEMS, scoresFor(firstThree), 'ALL', true);

    assert.equal(shown.length, ITEMS.length - 3);
    firstThree.forEach((id) => assert.ok(!shown.some((item) => item.id === id)));
  });

  test('combines the section tab with the unrated filter', () => {
    const sectionB = ITEMS.filter((i) => i.section === 'B');
    const scores = scoresFor([sectionB[0].id]);
    const shown = visibleItems(ITEMS, scores, 'B', true);

    assert.equal(shown.length, sectionB.length - 1);
    shown.forEach((item) => assert.equal(item.section, 'B'));
  });
});

describe('findNextUnrated', () => {
  test('finds the first unrated indicator from the top', () => {
    const scores = scoresFor([ITEMS[0].id, ITEMS[1].id]);
    assert.equal(findNextUnrated(ITEMS, scores)?.id, ITEMS[2].id);
  });

  test('continues after the indicator just rated', () => {
    assert.equal(findNextUnrated(ITEMS, {}, ITEMS[4].id)?.id, ITEMS[5].id);
  });

  test('wraps back to a gap left earlier in the sheet', () => {
    // An appraiser who skipped item 2 and worked to the end must not be told
    // the sheet is finished.
    const rated = ITEMS.filter((item) => item.id !== ITEMS[1].id).map((item) => item.id);
    const next = findNextUnrated(ITEMS, scoresFor(rated), ITEMS[ITEMS.length - 1].id);

    assert.equal(next?.id, ITEMS[1].id);
  });

  test('returns nothing once every indicator is rated', () => {
    const all = scoresFor(ITEMS.map((item) => item.id));
    assert.equal(findNextUnrated(ITEMS, all), undefined);
  });

  test('returns nothing for an empty sheet', () => {
    assert.equal(findNextUnrated([] as AppraisalItem[], {}), undefined);
  });
});

describe('stampTime', () => {
  test('starts an empty note with the stamp', () => {
    assert.equal(stampTime('', '08:23'), '[08:23] ');
  });

  test('opens a new line so each stamped moment stays its own', () => {
    // The rule engine and the report both read notes line by line, so a stamp
    // trailing the previous sentence would bury two moments in one citation.
    assert.equal(
      stampTime('Starter on the board, all on task.', '08:23'),
      'Starter on the board, all on task.\n[08:23] '
    );
  });

  test('does not pile blank lines onto a note left mid-edit', () => {
    assert.equal(stampTime('First moment.   \n\n', '09:01'), 'First moment.\n[09:01] ');
  });
});

describe('appendEvidenceStem', () => {
  test('writes a stem for the appraiser to finish, not a finished phrase', () => {
    assert.equal(appendEvidenceStem('', 'Engagement'), 'Engagement: ');
  });

  test('appends to an existing note', () => {
    assert.equal(
      appendEvidenceStem('Pairs worked well.', 'Misconception'),
      'Pairs worked well. Misconception: '
    );
  });

  test('does not stack a second stem on an unfinished one', () => {
    assert.equal(appendEvidenceStem('Engagement: ', 'Misconception'), 'Engagement: ');
  });
});

describe('coverageProgress', () => {
  test('reports how many more ratings a grade needs', () => {
    const progress = coverageProgress(12, 44, COVERAGE_FLOOR);

    assert.equal(progress.needed, 27);
    assert.equal(progress.remaining, 15);
    assert.equal(progress.meetsFloor, false);
  });

  test('stops asking for more once the floor is met', () => {
    const progress = coverageProgress(27, 44, COVERAGE_FLOOR);

    assert.equal(progress.remaining, 0);
    assert.equal(progress.meetsFloor, true);
  });

  test('places the floor marker where the grade starts', () => {
    const progress = coverageProgress(0, 44, COVERAGE_FLOOR);
    assert.equal(Math.round(progress.floorPercent), 61);
  });

  test('handles a level with no indicators without dividing by zero', () => {
    const progress = coverageProgress(0, 0, COVERAGE_FLOOR);

    assert.equal(progress.meetsFloor, false);
    assert.equal(progress.floorPercent, 0);
    assert.equal(progress.ratedPercent, 0);
  });
});

describe('carryContext', () => {
  test('carries the posting and never the lesson or its ratings', () => {
    const previous = {
      schoolName: 'Kharisma Bangsa School',
      teacherName: 'Teacher 1',
      careerLevel: 'Proficient',
      schoolLevel: 'Secondary',
      subject: 'Physics',
      subjectCategory: 'Science',
      gradeClass: '11-A',
      appraiserName: 'Appraiser 1',
      appraiserRole: 'Head of Department',
      academicYear: '2026/2027',
      lessonTopic: 'Electromagnetic induction',
      generalObserverNotes: 'Notes from the previous lesson.',
      scores: { 'D1.1': { score: 4, notes: 'Previous rating' } },
      photos: [{ id: 'p1' }],
    };

    const carried = carryContext(previous) as unknown as Record<string, unknown>;

    assert.equal(carried.teacherName, 'Teacher 1');
    assert.equal(carried.gradeClass, '11-A');
    assert.equal(carried.appraiserName, 'Appraiser 1');

    ['lessonTopic', 'generalObserverNotes', 'scores', 'photos'].forEach((field) => {
      assert.equal(carried[field], undefined, `${field} must not be carried into a new observation`);
    });
  });
});
