import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { ErrorBoundary } from '@mtg/ui';
import ErrorFallback from './components/ErrorFallback';
import { router } from './router';
import '@mtg/ui/NavBar.css';
import '@mtg/profile/AccountMenu.css';
import '@mtg/profile/AuthDialog.css';
import './index.css';

// These defaults are deliberately quieter than TanStack's out-of-the-box
// ones. Left alone it retries a failed query three times and refetches
// whenever the tab regains focus — reasonable for your own API, not for
// Commander Spellbook's, which we only ever want to call when someone
// actually asks. Adopting Query without this block would send them more
// traffic than the hand-rolled version did, not less.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      // Mirrors the server-side combo cache, and keeps a collapsed panel's
      // results around rather than binning them after the default 5 minutes.
      staleTime: 60 * 60 * 1000,
      gcTime: 60 * 60 * 1000,
    },
  },
});

// Router.tsx's defaultErrorComponent is what actually catches a throw inside
// App — Router wraps every route's own component in its own catch boundary,
// which sits *inside* this one and claims the error first. This outer layer
// only ever fires for something outside the routed tree (QueryClientProvider
// or RouterProvider itself failing to initialize).
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary
      fallback={(error, reset) => <ErrorFallback error={error} onRetry={reset} />}
      onError={(error) => console.error('Uncaught render error:', error)}
    >
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
