import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  stripSearchParams,
} from '@tanstack/react-router';
import App from './App';
import ErrorFallback from './components/ErrorFallback';
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

export const router = createRouter({
  routeTree,
  // Matches vite.config.ts's `base` at runtime — '/' for this app's own
  // standalone deploy, '/recommender/' when served as part of the combined
  // platform build (see scripts/build-platform.mjs at the repo root).
  basepath: import.meta.env.BASE_URL,
  // The Router wraps every route's component in its own catch boundary
  // (docs/rules-audit.md item 17) — a throw inside App is caught here, not
  // by the ErrorBoundary in main.tsx, which only sees what's outside the
  // routed tree (e.g. RouterProvider itself failing to initialize). Without
  // this, a route render error falls through to Router's bare, unstyled
  // built-in ErrorComponent instead.
  defaultErrorComponent: ({ error, reset }) => (
    <ErrorFallback
      error={error instanceof Error ? error : new Error(String(error))}
      onRetry={reset}
    />
  ),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
