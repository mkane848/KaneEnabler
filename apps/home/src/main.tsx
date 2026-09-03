import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { ErrorBoundary } from '@mtg/ui';
import ErrorFallback from './components/ErrorFallback';
import { router } from './router';
import { AuthProvider } from '@mtg/profile';
import '@mtg/ui/NavBar.css';
import '@mtg/profile/AccountMenu.css';
import '@mtg/profile/AuthDialog.css';
import './App.css';

// Same quiet defaults as commander-recommender/client's own main.tsx — this
// app's own queries (the profile page's card/combo preferences and resolved
// card data) hit Supabase and the recommender's server, not Commander
// Spellbook, but there's no reason for this app's default request behavior
// to be any louder than the sibling app's.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

// Router.tsx's defaultErrorComponent is what actually catches a throw inside
// a routed page — Router wraps every route's own component in its own catch
// boundary, which sits *inside* this one and claims the error first. This
// outer layer only ever fires for something outside the routed tree
// (QueryClientProvider or RouterProvider itself failing to initialize).
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary
      fallback={(error, reset) => <ErrorFallback error={error} onRetry={reset} />}
      onError={(error) => console.error('Uncaught render error:', error)}
    >
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
