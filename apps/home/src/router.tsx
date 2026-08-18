import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import RootLayout from './RootLayout';
import Landing from './routes/Landing';
import Profile from './routes/Profile';
import ErrorFallback from './components/ErrorFallback';

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Landing,
});

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: Profile,
});

const routeTree = rootRoute.addChildren([indexRoute, profileRoute]);

export const router = createRouter({
  routeTree,
  // Matches vite.config.ts's `base` at runtime — '/' for this app's own
  // standalone deploy, unset (root) when served as part of the combined
  // platform build, same convention as commander-recommender/client's own
  // router.tsx (see scripts/build-platform.mjs at the repo root).
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
