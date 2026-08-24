/**
 * Every screen has an address, so the browser's own tab and history handling
 * works on this app the way it works on any other page.
 *
 * What is checked here is that a link and the screen it opens agree - a route
 * written to the address bar reads back as the same route - and that an
 * address nobody recognises lands an appraiser on their portfolio rather than
 * on a blank screen.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { parseRoute, routeToHash, NEW_OBSERVATION, DEFAULT_ROUTE, Route } from '../src/services/routing';
import { EDUVERSAL_SCHOOLS, APPRAISERS } from '../src/types';

describe('parseRoute', () => {
  test('opens the portfolio when there is no address yet', () => {
    for (const hash of ['', '#', '#/', '/']) {
      assert.deepEqual(parseRoute(hash), DEFAULT_ROUTE);
    }
  });

  test('reads each standalone screen', () => {
    assert.deepEqual(parseRoute('#/portfolio'), { view: 'LIST' });
    assert.deepEqual(parseRoute('#/analytics'), { view: 'ANALYTICS' });
    assert.deepEqual(parseRoute('#/school-report'), { view: 'SCHOOL_REPORT' });
    assert.deepEqual(parseRoute('#/walkthrough'), { view: 'WALKTHROUGH' });
  });

  test('reads an observation sheet and its report', () => {
    assert.deepEqual(parseRoute('#/observation/abc123'), { view: 'FORM', appraisalId: 'abc123' });
    assert.deepEqual(parseRoute('#/observation/abc123/report'), {
      view: 'REPORT',
      appraisalId: 'abc123',
    });
  });

  test('recognises the sheet that has never been saved', () => {
    assert.deepEqual(parseRoute('#/observation/new'), {
      view: 'FORM',
      appraisalId: NEW_OBSERVATION,
    });
  });

  test('sends a stale bookmark to the portfolio, not to nothing', () => {
    for (const hash of ['#/nowhere', '#/observation', '#//', '#/portfolio/extra']) {
      assert.equal(parseRoute(hash).view, 'LIST', `${hash} did not land on the portfolio`);
    }
  });

  test('survives an id that needed escaping', () => {
    const id = 'a b/c';
    assert.deepEqual(parseRoute(routeToHash({ view: 'FORM', appraisalId: id })), {
      view: 'FORM',
      appraisalId: id,
    });
  });

  test('ignores a trailing slash', () => {
    assert.deepEqual(parseRoute('#/analytics/'), { view: 'ANALYTICS' });
  });
});

describe('routeToHash', () => {
  const ROUTES: Route[] = [
    { view: 'LIST' },
    { view: 'ANALYTICS' },
    { view: 'SCHOOL_REPORT' },
    { view: 'WALKTHROUGH' },
    { view: 'FORM', appraisalId: 'abc123' },
    { view: 'REPORT', appraisalId: 'abc123' },
    { view: 'FORM', appraisalId: NEW_OBSERVATION },
  ];

  test('writes an address that reads back as the same route', () => {
    for (const route of ROUTES) {
      assert.deepEqual(parseRoute(routeToHash(route)), route, `round trip failed for ${route.view}`);
    }
  });

  test('always writes a hash link, so no host rewrite is needed to follow it', () => {
    for (const route of ROUTES) {
      assert.ok(routeToHash(route).startsWith('#/'), `${route.view} produced a non-hash link`);
    }
  });

  test('points a sheet with nothing open at the portfolio rather than at a dead link', () => {
    assert.equal(routeToHash({ view: 'FORM' }), '#/portfolio');
    assert.equal(routeToHash({ view: 'REPORT' }), '#/portfolio');
  });
});

describe('the rosters an appraiser picks from', () => {
  // Fifteen schools and fourteen colleagues in a dropdown: out of order, it
  // has to be read end to end every time.
  test('lists the schools alphabetically', () => {
    assert.deepEqual([...EDUVERSAL_SCHOOLS], [...EDUVERSAL_SCHOOLS].sort((a, b) => a.localeCompare(b)));
  });

  test('lists the appraisers alphabetically', () => {
    assert.deepEqual([...APPRAISERS], [...APPRAISERS].sort((a, b) => a.localeCompare(b)));
  });
});
