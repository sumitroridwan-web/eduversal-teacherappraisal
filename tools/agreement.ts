/**
 * Reads a double-coded gold set and prints how far its raters sit apart.
 *
 *   npm run agreement -- tools/example-goldset.json
 *   npm run agreement -- --template Proficient > goldset.json
 *
 * The template writes an empty sheet with every indicator for a career level
 * already listed, so a rater fills in numbers rather than typing codes.
 *
 * See GOLD-SET.md in this folder for the protocol the numbers assume.
 */
import fs from 'fs';
import path from 'path';

import { computeAgreement, describeKappa, GoldSet } from './agreementStats';
import { getItemsForLevel } from '../src/data/frameworkRubrics';
import type { CareerLevel } from '../src/types';

const CAREER_LEVELS: CareerLevel[] = [
  'Induction',
  'Developing',
  'Proficient',
  'Lead',
  'EarlyYears',
];

function emitTemplate(levelArg: string): void {
  const level = CAREER_LEVELS.find((l) => l.toLowerCase() === levelArg.toLowerCase());
  if (!level) {
    console.error(`Unknown career level "${levelArg}". Expected one of: ${CAREER_LEVELS.join(', ')}`);
    process.exit(1);
  }

  const blankSheet: Record<string, null> = {};
  getItemsForLevel(level).forEach((item) => {
    blankSheet[item.id] = null;
  });

  const template: GoldSet = {
    label: `${level} gold set - replace this label`,
    observations: [
      {
        id: 'replace-with-the-observation-id',
        teacher: 'Teacher name or a pseudonym',
        careerLevel: level,
        ratings: {
          'Rater A': { ...blankSheet },
          'Rater B': { ...blankSheet },
          AI: { ...blankSheet },
        },
      },
    ],
  };

  console.log(JSON.stringify(template, null, 2));
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function report(file: string): void {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) {
    console.error(`No such file: ${resolved}`);
    process.exit(1);
  }

  let goldSet: GoldSet;
  try {
    goldSet = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error: any) {
    console.error(`${file} is not valid JSON: ${error.message}`);
    process.exit(1);
    return;
  }

  const result = computeAgreement(goldSet);

  const line = (char = '-') => console.log(char.repeat(74));

  console.log('');
  console.log(result.label);
  line('=');
  console.log(
    `${result.observationCount} observations • ${result.raters.length} raters: ${result.raters.join(', ')}`
  );
  console.log('');

  console.log('RATERS');
  line();
  console.log('  rater                      ratings   not observable   mean rating');
  result.raterProfiles.forEach((profile) => {
    console.log(
      `  ${profile.rater.padEnd(24)} ${String(profile.ratingsGiven).padStart(7)} ` +
        `${String(profile.notObservableCalls).padStart(16)} ${profile.meanRating.toFixed(2).padStart(13)}`
    );
  });
  console.log('');
  console.log('  A lower mean rating is a severer rater. That difference is worth a');
  console.log('  calibration conversation long before it is worth an adjustment.');
  console.log('');

  console.log('AGREEMENT, PAIR BY PAIR');
  line();
  result.pairs.forEach((pair) => {
    console.log(`  ${pair.raterA} vs ${pair.raterB}`);
    console.log(
      `    compared          ${pair.comparableCells} indicator ratings across ` +
        `${pair.observationsCompared} observations`
    );
    console.log(`    exact agreement   ${pct(pair.exactAgreement)}`);
    console.log(`    within one band   ${pct(pair.withinOneBand)}`);
    console.log(
      `    weighted kappa    ${
        pair.weightedKappa === null
          ? `n/a (${pair.kappaNote})`
          : `${pair.weightedKappa.toFixed(3)} (${describeKappa(pair.weightedKappa)})`
      }`
    );
    console.log(
      `    severity gap      ${pair.meanSignedDifference >= 0 ? '+' : ''}${pair.meanSignedDifference.toFixed(
        2
      )} bands (${
        pair.meanSignedDifference === 0
          ? 'no systematic difference'
          : pair.meanSignedDifference > 0
          ? `${pair.raterB} rates lower`
          : `${pair.raterA} rates lower`
      })`
    );
    console.log(
      `    coverage clashes  ${pair.coverageDisagreements} indicators one rated and the other called not observable`
    );
    console.log('');
  });

  if (result.warnings.length) {
    console.log('READ THIS BEFORE QUOTING THE NUMBERS');
    line();
    result.warnings.forEach((warning) => console.log(`  • ${warning}`));
    console.log('');
  }

  console.log('  Compare every pair against the human-human pair, not against 1.0.');
  console.log('  Two experienced appraisers rarely clear 0.7 on a 4-point rubric, and a');
  console.log('  grader that matches them is doing as well as the instrument allows.');
  console.log('');
}

const [, , ...args] = process.argv;

if (args[0] === '--template') {
  emitTemplate(args[1] || 'Proficient');
} else if (!args.length) {
  console.error('Usage: npm run agreement -- <goldset.json>');
  console.error('       npm run agreement -- --template <CareerLevel> > goldset.json');
  process.exit(1);
} else {
  report(args[0]);
}
