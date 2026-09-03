import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from '@mtg/ui';
import App from './App';
import ErrorFallback from './components/ErrorFallback';
import { AuthProvider } from '@mtg/profile';
// Platform theme first: it defines the --mtg-* tokens every stylesheet
// below reads, and its reset must lose to anything an app sets itself.
import '@mtg/ui/theme.css';
import '@mtg/ui/NavBar.css';
import '@mtg/profile/AccountMenu.css';
import '@mtg/profile/AuthDialog.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary
      fallback={(error, reset) => <ErrorFallback error={error} onRetry={reset} />}
      onError={(error) => console.error('Uncaught render error:', error)}
    >
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
