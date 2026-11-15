/**
 * The report screens keep a bar of section links on screen. These check the
 * links reach the page, and that folding a long section on screen never takes
 * it out of what is printed.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ReportView } from '../src/components/ReportView';
import { SchoolReportView } from '../src/components/SchoolReportView';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { createBlankAppraisal } from '../src/services/storage';
import { getItemsForLevel } from '../src/data/frameworkRubrics';
import type { TeacherAppraisalRecord } from '../src/types';

before(() => {
  (globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 };
});

function sample(): TeacherAppraisalRecord {
  const record: any = createBlankAppraisal();
  record.teacherName = 'Teacher Sample';
  record.subject = 'Physics';
  getItemsForLevel('Proficient').forEach((item) => (record.scores[item.id] = { score: 3, notes: '' }));
  record.activities = [{ id: 'a1', name: 'Starter', teacherNotes: 'Board task', studentEvidenceNotes: '' }];
  return record;
}

describe('teacher report', () => {
  const html = () => renderToStaticMarkup(React.createElement(ReportView, { record: sample(), onBack: () => {} }));

  test('links to each section it contains', () => {
    const out = html();
    for (const id of ['rep-summary', 'rep-timeline', 'rep-debrief', 'rep-indicators', 'rep-signoff']) {
      assert.ok(out.includes(`href="#${id}"`), `missing link to ${id}`);
      assert.ok(out.includes(`id="${id}"`), `missing section ${id}`);
    }
    assert.ok(!out.includes('href="#rep-photos"'), 'no photos, no photos link');
  });

  test('folds the indicator table on screen but keeps it for print', () => {
    const out = html();
    assert.ok(out.includes('show every indicator and its descriptor'));
    assert.ok(out.includes('hidden print:block'), 'folded content is still printed');
    assert.ok(out.includes('D1.1'), 'the indicators remain in the page');
  });
});

describe('school report', () => {
  test('offers section links and a way to move between teachers', () => {
    const record: any = sample();
    const out = renderToStaticMarkup(
      React.createElement(LanguageProvider, null, React.createElement(SchoolReportView, { appraisals: [record] }))
    );
    assert.ok(!out.includes('No observations match this scope'), 'the sample falls in the default year');
    assert.ok(out.includes('href="#sr-observations"'));
    assert.ok(out.includes('Go to teacher'));
    assert.ok(out.includes('id="sr-obs-0"'));
  });
});

import { buildSchoolReport, ALL } from '../src/services/schoolReport';

describe('school report boxes', () => {
  test('never names one domain as both the strength and the gap', () => {
    const record: any = createBlankAppraisal();
    getItemsForLevel('Proficient')
      .filter((i) => i.id.startsWith('D1.'))
      .forEach((i) => (record.scores[i.id] = { score: 3, notes: '' }));
    const filters = { academicYear: ALL, school: ALL, schoolLevel: ALL, subjectCategory: ALL, careerLevel: ALL, appraiser: ALL };
    const boxes = buildSchoolReport([record], filters).statBoxes;
    const develop = boxes.find((b) => b.label === 'Domain to develop')!;
    assert.equal(develop.value, '—');
    assert.equal(develop.insight, 'Only one domain rated so far');
  });
});
