import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import ErrorFallback from './components/ErrorFallback';
import Layout from './Layout';
import BuildPage from './routes/BuildPage';
import CollectionPage from './routes/CollectionPage';
import { validateDeckSearch } from './lib/search';

const rootRoute = createRootRoute({ component: Layout });

const collectionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: CollectionPage,
  validateSearch: validateDeckSearch,
});

const buildRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/build',
  component: BuildPage,
  validateSearch: validateDeckSearch,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([collectionRoute, buildRoute]),
  // '/' standalone, '/pokemon/' in the combined platform build.
  basepath: import.meta.env.BASE_URL,
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
