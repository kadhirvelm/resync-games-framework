"use client";

import { Sparkles } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useState } from "react";
import styles from "./Assets.module.scss";
import type { AssetClassFormCopy } from "./assetClasses/assetClassDefinition";

/** How long the "started" confirmation stays visible. */
const STARTED_NOTICE_MS = 4_000;

interface PromptComposerProps {
  /** Label, placeholder, hint, and button text for the active generator. */
  copy: AssetClassFormCopy;
  /** Field id, unique per generator so the label stays attached. */
  id: string;
  /** Starts a generation with the trimmed prompt. */
  onSubmit: (prompt: string) => void;
  /** Generations of this kind still running. */
  runningCount: number;
}

/**
 * Always-visible prompt box at the top of a generator. Typing and pressing
 * the button (or ⌘/Ctrl + Enter) starts a run; the prompt clears so the next
 * idea can follow while the first one paints.
 * @param props - Copy, field id, submit action, and running count
 * @returns The prompt form
 */
export function PromptComposer({
  copy,
  id,
  onSubmit,
  runningCount,
}: PromptComposerProps) {
  const [prompt, setPrompt] = useState("");
  const [justStarted, setJustStarted] = useState(false);
  const trimmedPrompt = prompt.trim();

  useEffect(() => {
    if (!justStarted) {
      return;
    }
    const timer = globalThis.setTimeout(
      () => setJustStarted(false),
      STARTED_NOTICE_MS,
    );
    return () => globalThis.clearTimeout(timer);
  }, [justStarted]);

  /** Starts a run when there is something to send. */
  const submit = () => {
    if (trimmedPrompt === "") {
      return;
    }
    onSubmit(trimmedPrompt);
    setPrompt("");
    setJustStarted(true);
  };

  /**
   * @param event - Form submission from the button
   */
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit();
  };

  /**
   * Sends on ⌘/Ctrl + Enter; plain Enter keeps adding lines.
   * @param event - Key press inside the prompt
   */
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) {
      return;
    }
    event.preventDefault();
    submit();
  };

  return (
    <form className={styles.composer} onSubmit={handleSubmit}>
      <label className={styles.composerLabel} htmlFor={id}>
        {copy.promptLabel}
      </label>
      <textarea
        className={styles.composerInput}
        id={id}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={copy.placeholder}
        rows={3}
        value={prompt}
      />
      <div className={styles.composerFooter}>
        <ComposerStatus
          hint={copy.hint}
          justStarted={justStarted}
          runningCount={runningCount}
        />
        <span aria-hidden="true" className={styles.composerShortcut}>
          ⌘ ↵
        </span>
        <button
          className={styles.generateButton}
          disabled={trimmedPrompt === ""}
          type="submit"
        >
          <Sparkles aria-hidden="true" size={15} />
          {copy.submitLabel}
        </button>
      </div>
    </form>
  );
}

interface ComposerStatusProps {
  hint?: string;
  justStarted: boolean;
  runningCount: number;
}

/**
 * The line beside the button: a confirmation right after starting, the
 * number of runs in progress, or the generator's hint.
 * @param props - Hint text, whether a run just started, and running count
 * @returns One status line
 */
function ComposerStatus({
  hint,
  justStarted,
  runningCount,
}: ComposerStatusProps) {
  if (justStarted) {
    return (
      <span className={styles.composerStarted} role="status">
        Started. It will appear in the library below.
      </span>
    );
  }
  if (runningCount > 0) {
    return (
      <span className={styles.composerRunning} role="status">
        <span aria-hidden="true" className={styles.composerRunningDot} />
        {runningCount} generating
      </span>
    );
  }
  return <span className={styles.composerHint}>{hint}</span>;
}
