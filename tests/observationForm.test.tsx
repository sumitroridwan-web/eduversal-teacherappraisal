/**
 * Renders the observation sheet and checks that the things an appraiser fills
 * it in with are actually on screen.
 *
 * The sheet is one large component with two surfaces and several conditional
 * branches, and a typechecker is happy with a card that renders in the wrong
 * mode or a control that quietly disappears behind a filter. This is a smoke
 * test, not a UI test: it asks whether each affordance reached the page.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AppraisalForm } from '../src/components/AppraisalForm';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { createBlankAppraisal } from '../src/services/storage';
import { getItemsForLevel } from '../src/data/frameworkRubrics';
import type { TeacherAppraisalRecord } from '../src/types';

/** The form autosaves; server rendering never runs effects, but be explicit. */
before(() => {
  (globalThis as any).localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    key: () => null,
    length: 0,
  };
});

function render(record: TeacherAppraisalRecord): string {
  return renderToStaticMarkup(
    React.createElement(
      LanguageProvider,
      null,
      React.createElement(AppraisalForm, {
        initialRecord: record,
        onSave: () => {},
        onViewReport: () => {},
        onOpenRubrics: () => {},
      } as any)
    )
  );
}

function withRatings(count: number): TeacherAppraisalRecord {
  const record: any = createBlankAppraisal();
  getItemsForLevel('Proficient')
    .slice(0, count)
    .forEach((item) => {
      record.scores[item.id] = { score: 3, notes: '', origin: 'observer' };
    });
  return record as TeacherAppraisalRecord;
}

describe('capture mode', () => {
  test('a fresh observation opens on the capture surface, not the rubric', () => {
    const html = render(createBlankAppraisal());

    assert.ok(html.includes('Capture the lesson'), 'the capture tab should be present');
    assert.ok(
      html.includes('Lesson Notes') || html.includes('Lesson&nbsp;Notes'),
      'the notes card belongs to capture'
    );
    assert.ok(
      !html.includes('item-card-D1.1'),
      'forty-four rating cards must not be the first thing an appraiser meets'
    );
  });

  test('offers a time stamp for the notes taken during the lesson', () => {
    const html = render(createBlankAppraisal());
    assert.ok(/Stamp \d{2}:\d{2}/.test(html));
  });
});

describe('rate mode', () => {
  const html = () => render(withRatings(5));

  test('a part-rated record opens straight into rating', () => {
    assert.ok(html().includes('item-card-D1.1'), 'someone returning to finish wants the rubric');
  });

  test('says how many indicators still need a rating', () => {
    assert.ok(/Unrated \(39\)/.test(html()), '44 indicators less the 5 rated');
  });

  test('offers a jump to the next unrated indicator', () => {
    assert.ok(html().includes('Next unrated'));
  });

  test('explains the keyboard shortcut that does the bulk of the work', () => {
    assert.ok(html().includes('to rate it and move to the next unrated'));
  });

  test('keeps the lesson notes beside the rubric', () => {
    const record: any = withRatings(5);
    record.generalObserverNotes = 'Starter on the board, all on task.';

    const markup = render(record);
    assert.ok(markup.includes('Your lesson notes'));
    assert.ok(markup.includes('Starter on the board, all on task.'));
  });

  test('shows the coverage floor as a target rather than a surprise', () => {
    assert.ok(
      html().includes('27 needed for a grade'),
      'the appraiser should not meet the floor for the first time at the report'
    );
  });

  test('shows a descriptor before a rating is chosen, anchored on the standard', () => {
    // The whole point: read the descriptor, then decide - not decide, then read.
    assert.ok(html().includes('Standard (3) reads:'));
  });

  test('shows the chosen descriptor once an indicator is rated', () => {
    assert.ok(html().includes('Rating 3 Descriptor:'));
  });

  test('gives evidence a box that can hold a sentence', () => {
    assert.ok(html().includes('<textarea id="notes-input-D1.1"'));
  });

  test('opens an evidence phrase instead of stamping a finished token', () => {
    const markup = html();
    assert.ok(markup.includes('Engagement…'), 'the button should start a sentence');
    assert.ok(
      !markup.includes('[High Engagement]'),
      'a token that looks like evidence and states nothing must not come back'
    );
  });

  test('does not carry the capture surface along with it', () => {
    assert.ok(!/Appraiser(&#x27;|’|')s Lesson Notes/.test(html()));
  });
});

describe('every career level renders', () => {
  (['Induction', 'Developing', 'Proficient', 'Lead', 'EarlyYears'] as const).forEach((level) => {
    test(`${level} sheet renders with its own floor`, () => {
      const record: any = createBlankAppraisal(level as any);
      getItemsForLevel(level as any)
        .slice(0, 2)
        .forEach((item) => (record.scores[item.id] = { score: 3, notes: '' }));

      const markup = render(record as TeacherAppraisalRecord);
      const needed = Math.ceil(getItemsForLevel(level as any).length * 0.6);

      assert.ok(markup.includes(`${needed} needed for a grade`));
    });
  });
});
