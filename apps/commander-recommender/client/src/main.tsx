import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
