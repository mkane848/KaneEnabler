import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { ErrorBoundary } from '@mtg/ui';
import { AuthProvider } from '@mtg/profile';
import ErrorFallback from './components/ErrorFallback';
import { router } from './router';
// Platform theme first: its tokens feed everything below.
import '@mtg/ui/theme.css';
import '@mtg/ui/NavBar.css';
import '@mtg/profile/AccountMenu.css';
import '@mtg/profile/AuthDialog.css';
import './App.css';

// The same quiet defaults as the platform's other apps. This app's only
// queries are its own static card files, which never change mid-visit.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false },
  },
});

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
