/**
 * The scoring functions decide what grade a teacher is recorded as having
 * earned, so they are the part of this platform that most needs to be pinned
 * down. Two of these cases are regressions: an unknown career level and a
 * missing scores map both used to throw, and with no error boundary above them
 * a single malformed record blanked the whole platform.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateF2Scores,
  calculateF2Predicate,
  getItemsForLevel,
  COVERAGE_FLOOR,
} from '../src/data/frameworkRubrics';
import type { CareerLevel } from '../src/types';

type ScoreMap = Record<string, { score: 1 | 2 | 3 | 4 | null }>;

/** Rates the first `count` indicators of a level at `score`, nothing else. */
function rate(level: CareerLevel, count: number, score: 1 | 2 | 3 | 4): ScoreMap {
  const map: ScoreMap = {};
  getItemsForLevel(level)
    .slice(0, count)
    .forEach((item) => {
      map[item.id] = { score };
    });
  return map;
}

describe('calculateF2Scores', () => {
  test('measures attainment across rated indicators, not the whole rubric', () => {
    // Four indicators at Proficient is 75%, whatever the rest of the sheet
    // does. Unrated means "not evidenced", never "scored zero".
    const stats = calculateF2Scores('Proficient', rate('Proficient', 4, 3));

    assert.equal(stats.itemsScored, 4);
    assert.equal(stats.totalRaw, 12);
    assert.equal(stats.maxRated, 16);
    assert.equal(stats.percentage, 75);
  });

  test('reports no attainment when nothing has been rated', () => {
    const stats = calculateF2Scores('Proficient', {});

    assert.equal(stats.itemsScored, 0);
    assert.equal(stats.percentage, 0);
    assert.equal(stats.grade, 'F');
    assert.equal(stats.provisional, true);
  });

  test('grades the bands from the rated percentage', () => {
    const level: CareerLevel = 'Proficient';
    const total = getItemsForLevel(level).length;

    // A flat rating maps onto a fixed percentage: 4 -> 100, 3 -> 75, 2 -> 50,
    // 1 -> 25. A flat Basic lands at 50%, which is band D - the C band opens at
    // 51 - so a wholly Basic lesson is Needs Improvement, not Satisfactory.
    assert.equal(calculateF2Scores(level, rate(level, total, 4)).percentage, 100);
    assert.equal(calculateF2Scores(level, rate(level, total, 4)).grade, 'A');
    assert.equal(calculateF2Scores(level, rate(level, total, 3)).percentage, 75);
    assert.equal(calculateF2Scores(level, rate(level, total, 3)).grade, 'B');
    assert.equal(calculateF2Scores(level, rate(level, total, 2)).percentage, 50);
    assert.equal(calculateF2Scores(level, rate(level, total, 2)).grade, 'D');
    assert.equal(calculateF2Scores(level, rate(level, total, 1)).percentage, 25);
    assert.equal(calculateF2Scores(level, rate(level, total, 1)).grade, 'F');
  });

  describe('coverage floor', () => {
    test('marks a thin observation provisional however high it scores', () => {
      // The case the floor exists for: three indicators at Distinguished is
      // 100%, and without the floor that reads as a Grade A for the lesson.
      const stats = calculateF2Scores('Proficient', rate('Proficient', 3, 4));

      assert.equal(stats.percentage, 100);
      assert.equal(stats.grade, 'A');
      assert.equal(stats.provisional, true, 'three of 44 indicators cannot carry a grade');
    });

    test('publishes a grade once the floor is met', () => {
      const level: CareerLevel = 'Proficient';
      const total = getItemsForLevel(level).length;
      const atFloor = Math.ceil(total * COVERAGE_FLOOR);

      const stats = calculateF2Scores(level, rate(level, atFloor, 3));

      assert.ok(stats.coverage >= COVERAGE_FLOOR);
      assert.equal(stats.provisional, false);
      assert.equal(stats.grade, 'B');
    });

    test('holds the grade back one indicator below the floor', () => {
      const level: CareerLevel = 'Proficient';
      const total = getItemsForLevel(level).length;
      const belowFloor = Math.ceil(total * COVERAGE_FLOOR) - 1;

      const stats = calculateF2Scores(level, rate(level, belowFloor, 3));

      assert.ok(stats.coverage < COVERAGE_FLOOR);
      assert.equal(stats.provisional, true);
    });

    test('reports coverage as the share of the level\'s own indicators', () => {
      const level: CareerLevel = 'Proficient';
      const total = getItemsForLevel(level).length;
      const stats = calculateF2Scores(level, rate(level, 10, 3));

      assert.equal(stats.totalItems, total);
      assert.equal(stats.coverage, 10 / total);
    });
  });

  describe('malformed records', () => {
    test('survives a career level this build does not know', () => {
      // Regression: LEVEL_SCORING_CONFIGS[level] came back undefined and
      // reading config.maxSectionA threw, taking the portfolio down with it.
      const stats = calculateF2Scores('Teacher' as CareerLevel, {});

      assert.equal(stats.itemsScored, 0);
      assert.equal(stats.totalItems, 0);
      assert.equal(stats.provisional, true);
      assert.ok(Number.isFinite(stats.maxTotal));
    });

    test('survives a record with no scores map at all', () => {
      const stats = calculateF2Scores('Proficient', undefined as unknown as ScoreMap);

      assert.equal(stats.itemsScored, 0);
      assert.equal(stats.percentage, 0);
    });

    test('ignores unrated and null entries rather than counting them as zero', () => {
      const items = getItemsForLevel('Proficient');
      const scores: ScoreMap = {
        [items[0].id]: { score: 4 },
        [items[1].id]: { score: null },
        [items[2].id]: { score: null },
      };

      const stats = calculateF2Scores('Proficient', scores);

      assert.equal(stats.itemsScored, 1);
      assert.equal(stats.percentage, 100);
    });
  });

  describe('early years', () => {
    test('scores against the Early Years rubric, not the mainstream one', () => {
      const eyItems = getItemsForLevel('EarlyYears');
      const mainstream = getItemsForLevel('Proficient');

      assert.ok(eyItems.length > 0);
      assert.notDeepEqual(
        eyItems.map((i) => i.id),
        mainstream.map((i) => i.id)
      );

      const stats = calculateF2Scores('EarlyYears', rate('EarlyYears', eyItems.length, 3));
      assert.equal(stats.totalItems, eyItems.length);
      assert.equal(stats.provisional, false);
    });
  });
});

describe('calculateF2Predicate', () => {
  test('bands on the published boundaries', () => {
    assert.equal(calculateF2Predicate(86).predicate, 'Excellent');
    assert.equal(calculateF2Predicate(66).predicate, 'Good');
    assert.equal(calculateF2Predicate(51).predicate, 'Satisfactory');
    assert.equal(calculateF2Predicate(36).predicate, 'Needs Improvement');
    assert.equal(calculateF2Predicate(35.9).predicate, 'Unsatisfactory');
  });

  test('is just below a boundary, not on it', () => {
    assert.equal(calculateF2Predicate(85.9).predicate, 'Good');
    assert.equal(calculateF2Predicate(65.9).predicate, 'Satisfactory');
    assert.equal(calculateF2Predicate(50.9).predicate, 'Needs Improvement');
  });

  test('agrees with the letter grade calculateF2Scores hands out', () => {
    const level: CareerLevel = 'Proficient';
    const total = getItemsForLevel(level).length;

    ([4, 3, 2, 1] as const).forEach((score) => {
      const stats = calculateF2Scores(level, rate(level, total, score));
      assert.equal(
        calculateF2Predicate(stats.percentage).gradeLetter,
        stats.grade,
        `predicate and grade disagree at a flat ${score}`
      );
    });
  });

  test('handles the empty sheet without inventing a pass', () => {
    assert.equal(calculateF2Predicate(0).predicate, 'Unsatisfactory');
  });
});
