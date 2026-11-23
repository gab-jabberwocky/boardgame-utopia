import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Shown instead of the children after they throw while rendering. */
  fallback: (reset: () => void) => ReactNode;
  /** When this changes (e.g. a new game version arrives), try the children again. */
  resetKey?: unknown;
}

interface State {
  failed: boolean;
  /** The resetKey of the last render: kept while failed, to spot a change. */
  failedKey: unknown;
}

/**
 * Keeps a rendering bug in one part of the page (usually a game's Board) from
 * blanking the whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false, failedKey: undefined };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (!state.failed) return { failedKey: props.resetKey };
    if (props.resetKey !== state.failedKey) return { failed: false, failedKey: props.resetKey };
    return null;
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Render error", error, info.componentStack);
  }

  reset = () => this.setState({ failed: false });

  override render() {
    return this.state.failed ? this.props.fallback(this.reset) : this.props.children;
  }
}
