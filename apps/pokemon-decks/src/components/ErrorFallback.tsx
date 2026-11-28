export default function ErrorFallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="mtg-page-main" role="alert">
      <h1 className="mtg-page-title">Something went wrong</h1>
      <p>{error.message}</p>
      <button type="button" className="mtg-btn mtg-btn-primary" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
