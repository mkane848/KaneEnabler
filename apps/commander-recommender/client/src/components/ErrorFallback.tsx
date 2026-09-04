interface ErrorFallbackProps {
  error: Error;
  onRetry: () => void;
}

/**
 * Shown in place of the whole app when a render throws (see
 * docs/rules-audit.md item 17), instead of React's default: unmounting
 * everything with nothing in its place. Nothing here holds state worth
 * preserving a path back to — useAppStore isn't persisted and the submitted
 * list is just a paste away — so "try again" plus a plain reload covers it,
 * unlike time-counters' fallback, which also offers to clear a save.
 */
export default function ErrorFallback({ error, onRetry }: ErrorFallbackProps) {
  return (
    <div className="error-fallback" role="alert">
      <div className="error-fallback-box">
        <h1 className="error-fallback-title">Something went wrong</h1>
        <p className="error-fallback-body">
          The app hit an unexpected error and couldn't continue. Nothing you entered was saved
          server-side, so it's safe to try again.
        </p>
        <p className="error-fallback-detail">{error.message}</p>
        <div className="error-fallback-actions">
          <button
            type="button"
            className="mtg-btn mtg-btn-primary primary-button"
            onClick={onRetry}
          >
            Try again
          </button>
          <button type="button" className="link-button" onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </div>
      </div>
    </div>
  );
}
