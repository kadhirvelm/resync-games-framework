"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import styles from "./gameExperiences.module.scss";

type GameExperienceErrorBoundaryProps = {
  children: ReactNode;
  experienceName: string;
  onExit: () => void;
};

type GameExperienceErrorBoundaryState = {
  error?: Error;
};

/** Prevents one experimental runtime failure from taking down the selector. */
export class GameExperienceErrorBoundary extends Component<
  GameExperienceErrorBoundaryProps,
  GameExperienceErrorBoundaryState
> {
  public state: GameExperienceErrorBoundaryState = {};

  /**
   * Converts an uncaught render error into fallback state.
   * @param error - Error raised below the boundary
   * @returns State containing a normalized Error instance
   */
  public static getDerivedStateFromError(
    error: unknown,
  ): GameExperienceErrorBoundaryState {
    if (error instanceof Error) {
      return { error };
    }
    return { error: new Error(String(error)) };
  }

  /**
   * Provides a no-op React error hook without leaking runtime details.
   * @param _error - Captured child error
   * @param _info - React component-stack metadata
   */
  public componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // The fallback below keeps experimental renderer failures recoverable.
  }

  /** Clears the captured error and remounts the experience subtree. */
  private readonly retry = () => {
    this.setState({ error: undefined });
  };

  /** @returns The experience, or a recoverable fallback after a failure. */
  public render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <main className={styles.errorFallback}>
        <p className={styles.eyebrow}>Runtime interrupted</p>
        <h1>{this.props.experienceName} could not start</h1>
        <p>{error.message}</p>
        <div>
          <button onClick={this.retry} type="button">
            Try again
          </button>
          <button onClick={this.props.onExit} type="button">
            Return to all games
          </button>
        </div>
      </main>
    );
  }
}
