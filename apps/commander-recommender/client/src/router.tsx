import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  stripSearchParams,
} from '@tanstack/react-router';
import App from './App';
import { DEFAULT_RECOMMENDER_SEARCH, validateRecommenderSearch } from './lib/searchSchema';

const rootRoute = createRootRoute({
  component: Outlet,
});

/**
 * One route: this app is a single screen (paste a list, see results), not
 * a set of pages. Router earns its place anyway for `validateSearch` — it's
 * what makes the results grid's filters/sort/page URL-addressable (shareable,
 * survives a refresh) instead of component state that vanishes on reload.
 *
 * `stripSearchParams` keeps a bare, unfiltered visit at a bare `/` — without
 * it, `validateSearch` always returning a fully-populated object means every
 * default gets written to the URL too, even before anyone's touched anything.
 */
export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: App,
  validateSearch: validateRecommenderSearch,
  search: {
    middlewares: [stripSearchParams(DEFAULT_RECOMMENDER_SEARCH)],
  },
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
