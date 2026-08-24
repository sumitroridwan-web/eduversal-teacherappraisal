/**
 * The places an appraiser can go are links, not click handlers.
 *
 * This is the difference between being able to open a teacher's report beside
 * the sheet being filled in and having to choose between them. A handler
 * looks identical on screen and to a typechecker, and this project has no
 * React types installed to catch a prop that stopped being passed, so what is
 * checked here is the rendered markup: that the destination is really in an
 * href the browser can open in a tab of its own.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Navbar } from '../src/components/Navbar';
import { AppraisalList } from '../src/components/AppraisalList';
import { AppraisalForm } from '../src/components/AppraisalForm';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { createBlankAppraisal } from '../src/services/storage';

before(() => {
  (globalThis as any).localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    key: () => null,
    length: 0,
  };
});

const render = (element: React.ReactElement): string =>
  renderToStaticMarkup(React.createElement(LanguageProvider, null, element));

describe('the navigation bar', () => {
  const markup = () =>
    render(
      React.createElement(Navbar, {
        currentView: 'LIST',
        activeAppraisalId: 'abc123',
        onOpenRubrics: () => {},
        hasActiveRecord: true,
      } as any)
    );

  test('offers every screen as an address', () => {
    const html = markup();
    for (const href of ['#/portfolio', '#/analytics', '#/school-report', '#/walkthrough']) {
      assert.ok(html.includes(`href="${href}"`), `the bar has no link to ${href}`);
    }
  });

  test('points the active sheet at the observation that is open', () => {
    assert.ok(markup().includes('href="#/observation/abc123"'));
  });

  test('starts a new observation at its own address', () => {
    assert.ok(markup().includes('href="#/observation/new"'));
  });

  test('leaves nothing navigating on a click alone', () => {
    // A <button> here is a dead end for anyone trying to open a second tab.
    const html = markup();
    assert.ok(!/<button[^>]*id="nav-btn-(list|form|analytics|school-report|walkthrough|new)"/.test(html));
  });
});

describe('the portfolio', () => {
  const records = [
    { ...createBlankAppraisal('Proficient'), id: 'rec-1', teacherName: 'Ade Setyawati' },
    { ...createBlankAppraisal('Lead'), id: 'rec-2', teacherName: 'Eki Maulana' },
  ];

  const markup = () =>
    render(
      React.createElement(AppraisalList, {
        appraisals: records,
        onDeleteAppraisal: () => {},
        onNewFollowUp: () => {},
        onOpenRubrics: () => {},
      } as any)
    );

  test('links every observation to its sheet and its report', () => {
    const html = markup();
    for (const record of records) {
      assert.ok(
        html.includes(`href="#/observation/${record.id}"`),
        `no sheet link for ${record.teacherName}`
      );
      assert.ok(
        html.includes(`href="#/observation/${record.id}/report"`),
        `no report link for ${record.teacherName}`
      );
    }
  });

  test('starts a new observation at its own address', () => {
    assert.ok(markup().includes('href="#/observation/new"'));
  });
});

describe('an observation that has never been saved', () => {
  const render1 = (isUnsaved: boolean) =>
    render(
      React.createElement(AppraisalForm, {
        initialRecord: createBlankAppraisal('Proficient'),
        onSave: () => {},
        onViewReport: () => {},
        onOpenRubrics: () => {},
        isUnsaved,
        onDraftChange: () => {},
      } as any)
    );

  test('says so, because this is the one state a closed tab loses', () => {
    assert.ok(render1(true).includes('Not saved yet'));
  });

  test('says nothing of the sort once the observation is on the device', () => {
    assert.ok(!render1(false).includes('Not saved yet'));
  });
});
