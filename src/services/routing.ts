/**
 * Which view the address bar is pointing at.
 *
 * The platform used to hold the open view in React state alone, which meant
 * every screen lived at the same address. An appraiser could not open the
 * portfolio in one tab and a lesson they were observing in another, could not
 * middle-click a teacher to read their report beside the sheet, and could not
 * reload without being put back at the start. Each view now has a URL, so the
 * browser's own tab and history handling works on this app the way it works
 * on any other page.
 *
 * The hash is what carries it. It needs no rewrite rule on the host, so a
 * deep link keeps working wherever this is deployed, and changing it never
 * costs a page load.
 */

export type RouteView = 'LIST' | 'FORM' | 'REPORT' | 'ANALYTICS' | 'SCHOOL_REPORT' | 'WALKTHROUGH';

/** The id an observation carries before it has been saved and has one of its own. */
export const NEW_OBSERVATION = 'new';

export interface Route {
  view: RouteView;
  /** Which observation a FORM or REPORT route is showing. */
  appraisalId?: string;
}

/** Views that are a single screen with nothing selected. */
const STANDALONE_PATHS: Record<string, RouteView> = {
  portfolio: 'LIST',
  analytics: 'ANALYTICS',
  'school-report': 'SCHOOL_REPORT',
  walkthrough: 'WALKTHROUGH',
};

const PATH_FOR_VIEW: Partial<Record<RouteView, string>> = Object.fromEntries(
  Object.entries(STANDALONE_PATHS).map(([path, view]) => [view, path])
);

export const DEFAULT_ROUTE: Route = { view: 'LIST' };

/**
 * Read a route out of a location hash.
 *
 * Anything unrecognised lands on the portfolio rather than on a blank screen:
 * a stale bookmark or a hand-edited address should show the appraiser their
 * observations, not an error.
 */
export function parseRoute(hash: string): Route {
  const path = String(hash || '')
    .replace(/^#/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');

  if (!path) return DEFAULT_ROUTE;

  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);

  if (parts[0] === 'observation' && parts[1]) {
    return parts[2] === 'report'
      ? { view: 'REPORT', appraisalId: parts[1] }
      : { view: 'FORM', appraisalId: parts[1] };
  }

  const standalone = STANDALONE_PATHS[parts[0]];
  return standalone ? { view: standalone } : DEFAULT_ROUTE;
}

/** The href to put on a link so the browser can open it in a tab of its own. */
export function routeToHash(route: Route): string {
  if (route.view === 'FORM' || route.view === 'REPORT') {
    // A sheet with nothing open is the portfolio; there is no observation to
    // name in the address.
    if (!route.appraisalId) return '#/portfolio';
    const id = encodeURIComponent(route.appraisalId);
    return route.view === 'REPORT' ? `#/observation/${id}/report` : `#/observation/${id}`;
  }
  return `#/${PATH_FOR_VIEW[route.view] || 'portfolio'}`;
}
