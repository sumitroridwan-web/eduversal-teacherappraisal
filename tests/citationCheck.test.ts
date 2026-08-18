/**
 * Citation verification is the last thing standing between a model's confident
 * sentence and a number on somebody's appraisal, so both directions matter: a
 * fabricated citation must not survive, and a genuine one must not be thrown
 * away over a curly quote.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { verifyCitations, isCitationVerifiable, normalise, extractQuotes } from '../citationCheck';
import type { CitationEvidence, GradedIndicator } from '../citationCheck';

const EVIDENCE: CitationEvidence = {
  activities: [
    {
      index: 1,
      name: 'Guided Group Problem-Solving',
      timeRange: '08:20 - 08:35',
      modality: 'Collaborative Group Work',
      teacherActions: 'Teacher circulated between tables prompting each group.',
      studentEvidence: 'Groups recorded their reasoning on mini-whiteboards.',
    },
  ],
  observerNotes: 'Students re-grouped after the demo and settled quickly.',
  transcript: 'so why did the volume change when we heated it',
  photos: [{ caption: 'Success criteria displayed on the board' }],
};

function rated(overrides: Partial<GradedIndicator> = {}): GradedIndicator {
  return {
    indicatorCode: 'D3.5',
    score: 3,
    notObservable: false,
    rationale: 'Questioning pushed into analysis.',
    evidenceRefs: ['Transcript [12:40]: "so why did the volume change"'],
    ...overrides,
  };
}

describe('normalise', () => {
  test('flattens case, punctuation and whitespace', () => {
    assert.equal(normalise('So — why DID the volume  change?'), 'so why did the volume change');
  });

  test('folds curly quotes onto straight ones', () => {
    assert.equal(normalise('‘quoted’'), normalise("'quoted'"));
  });
});

describe('extractQuotes', () => {
  test('finds straight, curly and single-quoted spans', () => {
    assert.deepEqual(extractQuotes('Transcript: "the volume changed"'), ['the volume changed']);
    assert.deepEqual(extractQuotes('Photo: “board shot”'), ['board shot']);
    assert.deepEqual(extractQuotes("Note: 'settled quickly'"), ['settled quickly']);
  });

  test('returns nothing for a citation with no quotation', () => {
    assert.deepEqual(extractQuotes('Activity 1: Guided Group Problem-Solving'), []);
  });
});

describe('verifyCitations', () => {
  test('keeps a rating whose quotation is in the evidence', () => {
    const result = verifyCitations([rated()], EVIDENCE);

    assert.equal(result.checked, 1);
    assert.equal(result.withdrawn, 0);
    assert.equal(result.scores[0].score, 3);
  });

  test('withdraws a rating whose quotation was never said', () => {
    const result = verifyCitations(
      [rated({ evidenceRefs: ['Transcript [09:12]: "name three properties of a catalyst"'] })],
      EVIDENCE
    );

    assert.equal(result.withdrawn, 1);
    assert.equal(result.scores[0].score, null);
    assert.equal(result.scores[0].notObservable, true);
    assert.match(result.scores[0].rationale as string, /^Not observable - /);
    assert.match(result.scores[0].rationale as string, /could not be found/);
  });

  test('withdraws a rating that cites nothing at all', () => {
    const result = verifyCitations([rated({ evidenceRefs: [] })], EVIDENCE);

    assert.equal(result.withdrawn, 1);
    assert.match(result.scores[0].rationale as string, /no evidence was cited/);
  });

  test('withdraws a rating citing a source that was never captured', () => {
    // The hallucination this is really for: a transcript quotation from a
    // lesson where nobody recorded any audio.
    const withoutAudio: CitationEvidence = { ...EVIDENCE, transcript: undefined };
    const result = verifyCitations(
      [rated({ evidenceRefs: ['Transcript [03:20]: student explanation of the method'] })],
      withoutAudio
    );

    assert.equal(result.withdrawn, 1);
  });

  test('keeps a rating cited to an activity by name, with no quotation', () => {
    const result = verifyCitations(
      [rated({ evidenceRefs: ['Activity 1: Guided Group Problem-Solving (08:20-08:35)'] })],
      EVIDENCE
    );

    assert.equal(result.withdrawn, 0);
    assert.equal(result.scores[0].score, 3);
  });

  test('rejects a real activity name carrying an invented quotation', () => {
    // The subtle case: the locator checks out, the words do not. A citation
    // that offers a quotation is judged on the quotation.
    const result = verifyCitations(
      [
        rated({
          evidenceRefs: [
            'Activity 1: Guided Group Problem-Solving: "each group elected a spokesperson"',
          ],
        }),
      ],
      EVIDENCE
    );

    assert.equal(result.withdrawn, 1);
  });

  test('survives a rewrapped quotation - different case, punctuation and spacing', () => {
    const result = verifyCitations(
      [rated({ evidenceRefs: ['Transcript: "So why did the volume change,"'] })],
      EVIDENCE
    );

    assert.equal(result.withdrawn, 0, 'punctuation is not evidence of fabrication');
  });

  test('survives one bad citation where another checks out', () => {
    const result = verifyCitations(
      [
        rated({
          evidenceRefs: [
            'Transcript [00:01]: "an exchange that never happened in this lesson"',
            'Photo: "Success criteria displayed on the board"',
          ],
        }),
      ],
      EVIDENCE
    );

    assert.equal(result.withdrawn, 0);
  });

  test('leaves entries the model already declined to rate untouched', () => {
    const notObservable = rated({ score: null, notObservable: true, evidenceRefs: [] });
    const result = verifyCitations([notObservable], EVIDENCE);

    assert.equal(result.checked, 0);
    assert.equal(result.withdrawn, 0);
    assert.deepEqual(result.scores[0], notObservable);
  });

  test('withdraws every rating when no evidence was submitted', () => {
    const result = verifyCitations([rated(), rated({ indicatorCode: 'D1.1' })], {});

    assert.equal(result.checked, 2);
    assert.equal(result.withdrawn, 2);
  });

  test('handles a malformed response without throwing', () => {
    assert.deepEqual(verifyCitations(undefined, EVIDENCE), {
      scores: [],
      checked: 0,
      withdrawn: 0,
    });
    assert.deepEqual(verifyCitations('not an array', EVIDENCE).scores, []);
  });
});

describe('isCitationVerifiable', () => {
  test('ignores a quotation too short to be distinctive', () => {
    // "why?" is a real thing to cite and matches almost anything, so a citation
    // resting on it falls back to its locator rather than passing on the quote.
    assert.equal(isCitationVerifiable('Transcript: "why?"', 'so why did the volume change', ['transcript']), true);
    assert.equal(isCitationVerifiable('Transcript: "why?"', 'so why did the volume change', []), false);
  });

  test('rejects an empty citation', () => {
    assert.equal(isCitationVerifiable('   ', 'anything at all', ['transcript']), false);
  });
});
