/**
 * A wrong agreement figure is worse than none: it would give a calibration
 * decision the appearance of evidence. The expected kappas below were computed
 * independently from the definition, not read back out of this implementation.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeAgreement,
  quadraticWeightedKappa,
  describeKappa,
  GoldSet,
} from '../tools/agreementStats';

function pairs(...values: Array<[number, number]>): Array<[number, number]> {
  return values;
}

describe('quadraticWeightedKappa', () => {
  test('is 1 when two raters agree on everything', () => {
    const { kappa } = quadraticWeightedKappa(pairs([1, 1], [2, 2], [3, 3], [4, 4], [2, 2], [3, 3]));
    assert.equal(kappa, 1);
  });

  test('is -1 when they systematically invert each other', () => {
    const { kappa } = quadraticWeightedKappa(pairs([1, 4], [4, 1], [1, 4], [4, 1]));
    assert.equal(kappa, -1);
  });

  test('penalises a consistent one-band offset without collapsing to zero', () => {
    const { kappa } = quadraticWeightedKappa(
      pairs([1, 2], [2, 3], [3, 4], [2, 3], [3, 4], [4, 4])
    );
    assert.ok(kappa !== null);
    assert.equal(Number((kappa as number).toFixed(3)), 0.615);
  });

  test('matches an independently computed mixed case', () => {
    const { kappa } = quadraticWeightedKappa(
      pairs([3, 3], [3, 4], [2, 2], [4, 3], [1, 2], [2, 2], [3, 3], [4, 4])
    );
    assert.equal(Number((kappa as number).toFixed(3)), 0.76);
  });

  test('weights a four-band gap far above a one-band gap', () => {
    const nearMiss = quadraticWeightedKappa(pairs([3, 3], [3, 3], [3, 3], [2, 3])).kappa;
    const wildMiss = quadraticWeightedKappa(pairs([3, 3], [3, 3], [3, 3], [1, 4])).kappa;

    assert.ok(nearMiss !== null && wildMiss !== null);
    assert.ok(
      (nearMiss as number) > (wildMiss as number),
      'being one band out must cost less than being three bands out'
    );
  });

  test('reports kappa as undefined rather than perfect when nobody varied', () => {
    // Every rating a 3 from both raters looks like flawless agreement, but
    // there is no chance agreement to correct for and kappa has no denominator.
    // Returning 1 here would advertise a calibration that was never tested.
    const { kappa, note } = quadraticWeightedKappa(pairs([3, 3], [3, 3], [3, 3]));

    assert.equal(kappa, null);
    assert.match(note as string, /single category/);
  });

  test('returns nothing for an empty comparison', () => {
    const { kappa, note } = quadraticWeightedKappa([]);
    assert.equal(kappa, null);
    assert.match(note as string, /no comparable ratings/);
  });
});

describe('describeKappa', () => {
  test('puts each band into words', () => {
    assert.equal(describeKappa(null), 'not computable');
    assert.equal(describeKappa(-0.2), 'worse than chance');
    assert.equal(describeKappa(0.1), 'slight');
    assert.equal(describeKappa(0.3), 'fair');
    assert.equal(describeKappa(0.5), 'moderate');
    assert.equal(describeKappa(0.7), 'substantial');
    assert.equal(describeKappa(0.9), 'near-complete');
  });
});

describe('computeAgreement', () => {
  const goldSet: GoldSet = {
    label: 'Test set',
    observations: [
      {
        id: 'obs-1',
        ratings: {
          'Rater A': { 'D1.1': 3, 'D1.2': 4, 'D2.1': 2, 'D3.5': null },
          'Rater B': { 'D1.1': 3, 'D1.2': 3, 'D2.1': 2, 'D3.5': null },
          AI: { 'D1.1': 4, 'D1.2': 4, 'D2.1': 3, 'D3.5': 3 },
        },
      },
      {
        id: 'obs-2',
        ratings: {
          'Rater A': { 'D1.1': 2, 'D1.2': 2, 'D2.1': 3 },
          'Rater B': { 'D1.1': 2, 'D1.2': 3, 'D2.1': 3 },
          AI: { 'D1.1': 3, 'D1.2': 3, 'D2.1': 3 },
        },
      },
    ],
  };

  test('compares every pair of raters, the AI included', () => {
    const report = computeAgreement(goldSet);

    assert.deepEqual(report.raters, ['AI', 'Rater A', 'Rater B']);
    assert.equal(report.pairs.length, 3);
  });

  test('counts only cells both raters actually rated', () => {
    const report = computeAgreement(goldSet);
    const humans = report.pairs.find((p) => p.raterA === 'Rater A' && p.raterB === 'Rater B');

    // Seven shared indicators, one of which both marked not observable.
    assert.equal(humans?.comparableCells, 6);
    assert.equal(humans?.coverageDisagreements, 0);
  });

  test('counts a rated-versus-not-observable clash separately from a disagreement', () => {
    const report = computeAgreement(goldSet);
    const pair = report.pairs.find((p) => p.raterA === 'AI' && p.raterB === 'Rater A');

    // D3.5 in obs-1: the AI rated it, the human said it could not be seen.
    assert.equal(pair?.coverageDisagreements, 1);
  });

  test('reports severity as a signed gap in bands', () => {
    const report = computeAgreement(goldSet);
    const pair = report.pairs.find((p) => p.raterA === 'AI' && p.raterB === 'Rater A');

    assert.ok(
      (pair?.meanSignedDifference as number) > 0,
      'this AI rates above the human, so the gap should be positive'
    );
  });

  test('profiles each rater by mean rating and not-observable calls', () => {
    const report = computeAgreement(goldSet);
    const raterA = report.raterProfiles.find((p) => p.rater === 'Rater A');

    assert.equal(raterA?.ratingsGiven, 6);
    assert.equal(raterA?.notObservableCalls, 1);
    assert.equal(raterA?.meanRating, 2.67);
  });

  test('warns that a set this small cannot carry a quotable kappa', () => {
    const report = computeAgreement(goldSet);
    assert.ok(report.warnings.some((w) => /25 to 30/.test(w)));
  });

  test('warns when there is nobody to compare against', () => {
    const solo: GoldSet = {
      observations: [{ id: 'obs-1', ratings: { 'Rater A': { 'D1.1': 3 } } }],
    };
    const report = computeAgreement(solo);

    assert.equal(report.pairs.length, 0);
    assert.ok(report.warnings.some((w) => /two raters/.test(w)));
  });

  test('handles an empty set without throwing', () => {
    const report = computeAgreement({ observations: [] });
    assert.equal(report.observationCount, 0);
    assert.deepEqual(report.raters, []);
  });
});
