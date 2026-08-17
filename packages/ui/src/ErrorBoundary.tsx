import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  /** Rendered in place of the crashed subtree. `reset` re-attempts rendering the children — cheap, but only useful if whatever threw isn't still in state. */
  fallback: (error: Error, reset: () => void) => ReactNode;
  /** Called once per catch, before `fallback` renders — for logging. */
  onError?: (error: Error, info: ErrorInfo) => void;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches a render throw in its subtree and shows `fallback` instead of
 * React's default: unmounting the whole tree with nothing in its place
 * (see docs/rules-audit.md item 17). Class-only — getDerivedStateFromError
 * and componentDidCatch have no hook equivalent as of React 19.
 *
 * `fallback` is a render prop rather than a fixed UI, matching Modal's
 * className-hook approach: each app's recovery screen needs its own theme
 * and its own escape hatch (time-counters can offer to clear a corrupted
 * save; the recommender's state is mostly ephemeral and doesn't need to).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (error) return this.props.fallback(error, this.reset);
    return this.props.children;
  }
}
