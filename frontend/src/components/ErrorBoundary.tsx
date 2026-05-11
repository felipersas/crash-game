"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class GameErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="panel-cyber rounded-lg p-6 flex flex-col items-center justify-center min-h-48 gap-3">
          <p className="text-error font-terminal text-sm uppercase tracking-wider">
            {this.props.label ?? "Component"} Error
          </p>
          <p className="text-text-muted font-terminal text-xs text-center max-w-xs">
            Something went wrong. Try refreshing the page.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="btn-cyber-primary px-4 py-1.5 rounded-lg text-xs font-terminal"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
