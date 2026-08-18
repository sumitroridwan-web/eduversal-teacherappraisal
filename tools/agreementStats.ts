/**
 * Agreement statistics for a double-coded gold set.
 *
 * The platform can say what a lesson scored. It cannot yet say how much that
 * score depends on who did the scoring - and until it can, "accurate" is a
 * claim rather than a measurement. This computes the figures that turn it into
 * one, from a set of observations rated independently by more than one rater.
 *
 * Every pair of raters is compared, and the AI is treated as just another
 * rater. That is deliberate: the interesting number is rarely how far the
 * grader sits from a human, but how far two experienced humans sit from each
 * other. Read the human-human pair first - it is the ceiling everything else
 * should be judged against, and it is usually lower than anyone expects.
 */

/** A rating is 1-4, or null where the rater judged the indicator not observable. */
export type Rating = 1 | 2 | 3 | 4 | null;

export interface GoldSetObservation {
  id: string;
  teacher?: string;
  careerLevel?: string;
  /** rater name -> indicator code -> rating */
  ratings: Record<string, Record<string, Rating>>;
}

export interface GoldSet {
  label?: string;
  observations: GoldSetObservation[];
}

export interface PairAgreement {
  raterA: string;
  raterB: string;
  /** Indicator cells where both raters gave a 1-4 rating. */
  comparableCells: number;
  /** Cells where one rated and the other marked not observable. */
  coverageDisagreements: number;
  exactAgreement: number;
  withinOneBand: number;
  /** Quadratically weighted Cohen's kappa, or null when it is undefined. */
  weightedKappa: number | null;
  kappaNote?: string;
  /** Mean of (A - B). Positive means A rates higher, i.e. B is the severer rater. */
  meanSignedDifference: number;
  /** Observations both raters covered, and how often their letter grade matched. */
  observationsCompared: number;
}

export interface RaterProfile {
  rater: string;
  ratingsGiven: number;
  notObservableCalls: number;
  meanRating: number;
}

export interface AgreementReport {
  label: string;
  observationCount: number;
  raters: string[];
  raterProfiles: RaterProfile[];
  pairs: PairAgreement[];
  warnings: string[];
}

const CATEGORIES: Array<1 | 2 | 3 | 4> = [1, 2, 3, 4];

/**
 * Quadratically weighted Cohen's kappa over a 4-point scale.
 *
 * Quadratic weighting is the right choice for an ordered rubric: two raters one
 * band apart have nearly agreed, and four bands apart have not, and unweighted
 * kappa cannot tell those apart. Returns null where kappa is undefined - if
 * both raters used exactly one category throughout, expected disagreement is
 * zero and the ratio has no denominator.
 */
export function quadraticWeightedKappa(
  pairs: Array<[number, number]>
): { kappa: number | null; note?: string } {
  if (!pairs.length) return { kappa: null, note: 'no comparable ratings' };

  const k = CATEGORIES.length;
  const observed: number[][] = CATEGORIES.map(() => CATEGORIES.map(() => 0));
  const marginalA = new Array(k).fill(0);
  const marginalB = new Array(k).fill(0);

  pairs.forEach(([a, b]) => {
    const i = a - 1;
    const j = b - 1;
    observed[i][j] += 1;
    marginalA[i] += 1;
    marginalB[j] += 1;
  });

  const n = pairs.length;
  const weight = (i: number, j: number) => ((i - j) ** 2) / ((k - 1) ** 2);

  let observedDisagreement = 0;
  let expectedDisagreement = 0;

  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const w = weight(i, j);
      observedDisagreement += w * (observed[i][j] / n);
      expectedDisagreement += w * ((marginalA[i] / n) * (marginalB[j] / n));
    }
  }

  if (expectedDisagreement === 0) {
    return {
      kappa: null,
      note: 'undefined - both raters used a single category throughout, so there is no chance agreement to correct for',
    };
  }

  return { kappa: 1 - observedDisagreement / expectedDisagreement };
}

/** How a kappa should be read, in words rather than a number. */
export function describeKappa(kappa: number | null): string {
  if (kappa === null) return 'not computable';
  if (kappa < 0) return 'worse than chance';
  if (kappa < 0.2) return 'slight';
  if (kappa < 0.4) return 'fair';
  if (kappa < 0.6) return 'moderate';
  if (kappa < 0.8) return 'substantial';
  return 'near-complete';
}

function round(value: number, places = 3): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function computeAgreement(goldSet: GoldSet): AgreementReport {
  const observations = goldSet.observations || [];
  const warnings: string[] = [];

  const raters = Array.from(
    new Set(observations.flatMap((o) => Object.keys(o.ratings || {})))
  ).sort();

  if (raters.length < 2) {
    warnings.push('Fewer than two raters are present, so no pair can be compared.');
  }
  if (observations.length < 20) {
    warnings.push(
      `Only ${observations.length} observations - a kappa on a set this small carries a wide ` +
        'confidence interval. 25 to 30 is the usual minimum for a figure worth quoting.'
    );
  }

  const raterProfiles: RaterProfile[] = raters.map((rater) => {
    let given = 0;
    let notObservable = 0;
    let sum = 0;

    observations.forEach((observation) => {
      const sheet = observation.ratings?.[rater];
      if (!sheet) return;
      Object.values(sheet).forEach((rating) => {
        if (typeof rating === 'number') {
          given++;
          sum += rating;
        } else {
          notObservable++;
        }
      });
    });

    return {
      rater,
      ratingsGiven: given,
      notObservableCalls: notObservable,
      meanRating: given ? round(sum / given, 2) : 0,
    };
  });

  const pairs: PairAgreement[] = [];

  for (let i = 0; i < raters.length; i++) {
    for (let j = i + 1; j < raters.length; j++) {
      const raterA = raters[i];
      const raterB = raters[j];

      const comparable: Array<[number, number]> = [];
      let coverageDisagreements = 0;
      let observationsCompared = 0;

      observations.forEach((observation) => {
        const sheetA = observation.ratings?.[raterA];
        const sheetB = observation.ratings?.[raterB];
        if (!sheetA || !sheetB) return;
        observationsCompared++;

        const indicators = new Set([...Object.keys(sheetA), ...Object.keys(sheetB)]);
        indicators.forEach((code) => {
          const a = sheetA[code];
          const b = sheetB[code];
          const aRated = typeof a === 'number';
          const bRated = typeof b === 'number';

          if (aRated && bRated) {
            comparable.push([a as number, b as number]);
          } else if (aRated !== bRated) {
            // One saw evidence where the other saw none. That is a real
            // disagreement about the lesson, but not one kappa can score, so it
            // is reported on its own rather than quietly dropped.
            coverageDisagreements++;
          }
        });
      });

      const exact = comparable.filter(([a, b]) => a === b).length;
      const withinOne = comparable.filter(([a, b]) => Math.abs(a - b) <= 1).length;
      const signedSum = comparable.reduce((total, [a, b]) => total + (a - b), 0);
      const { kappa, note } = quadraticWeightedKappa(comparable);

      pairs.push({
        raterA,
        raterB,
        comparableCells: comparable.length,
        coverageDisagreements,
        exactAgreement: comparable.length ? round(exact / comparable.length) : 0,
        withinOneBand: comparable.length ? round(withinOne / comparable.length) : 0,
        weightedKappa: kappa === null ? null : round(kappa),
        kappaNote: note,
        meanSignedDifference: comparable.length ? round(signedSum / comparable.length, 2) : 0,
        observationsCompared,
      });
    }
  }

  return {
    label: goldSet.label || 'Untitled gold set',
    observationCount: observations.length,
    raters,
    raterProfiles,
    pairs,
    warnings,
  };
}
