import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from '@mtg/ui';
import App from './App';
import ErrorFallback from './components/ErrorFallback';
import { AuthProvider } from '@mtg/profile';
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
