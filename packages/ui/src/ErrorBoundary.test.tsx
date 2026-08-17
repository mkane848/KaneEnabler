import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Boom({ shouldThrow }: { shouldThrow: boolean }): null {
  if (shouldThrow) throw new Error('boom');
  return null;
}

describe('ErrorBoundary', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // React logs a caught render error to console.error even though this
    // boundary handles it — expected noise for these tests, not a failure.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary fallback={() => <p>Fallback</p>}>
        <p>All good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
    expect(screen.queryByText('Fallback')).not.toBeInTheDocument();
  });

  it('renders the fallback instead of unmounting the whole tree when a child throws', () => {
    render(
      <ErrorBoundary fallback={(error) => <p>Caught: {error.message}</p>}>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Caught: boom')).toBeInTheDocument();
  });

  it('calls onError once per catch, with the thrown error', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary fallback={() => <p>Fallback</p>} onError={onError}>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it('reset re-attempts rendering the children', () => {
    function Toggle() {
      const [shouldThrow, setShouldThrow] = useState(true);
      return (
        <ErrorBoundary
          fallback={(_error, reset) => (
            <button
              type="button"
              onClick={() => {
                setShouldThrow(false);
                reset();
              }}
            >
              Retry
            </button>
          )}
        >
          <Boom shouldThrow={shouldThrow} />
          <p>Recovered</p>
        </ErrorBoundary>
      );
    }
    render(<Toggle />);
    fireEvent.click(screen.getByText('Retry'));
    expect(screen.getByText('Recovered')).toBeInTheDocument();
  });
});
