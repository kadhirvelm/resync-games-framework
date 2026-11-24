/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";

import { useState } from "react";
import {
  ASHEN_GATE_MAP_TYPES,
  DESCENT_DIFFICULTIES,
  DESCENT_STARTING_RESOURCES,
  type DescentGameSetup,
  getDifficultyOption,
  getMapTypeOption,
} from "../data/layers/ashen_gate/gameSetup";
import styles from "./descentSetup.module.scss";

export interface DescentSetupScreenProps {
  initialSetup: DescentGameSetup;
  onBack: () => void;
  onLaunch: (setup: DescentGameSetup) => void;
}

/**
 * Parses an optional numeric seed input; blank or non-numeric input yields
 * `null` so the caller rolls a fresh random seed.
 * @param raw - Raw text input from the seed field
 * @returns Unsigned 32-bit seed or null
 */
function parseSeedInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed) >>> 0;
}

/**
 * Age of Empires-style solo match setup screen. Lets players choose their
 * terrain map archetype, game mode, difficulty, starting resources, and map
 * seed before launching a Descent run.
 * @param props - Initial settings and navigation/launch callbacks
 * @returns The match setup screen
 */
export function DescentSetupScreen({
  initialSetup,
  onBack,
  onLaunch,
}: DescentSetupScreenProps) {
  const [setup, setSetup] = useState<DescentGameSetup>(initialSetup);
  const [seedText, setSeedText] = useState<string>(
    initialSetup.seed === null ? "" : String(initialSetup.seed),
  );

  const selectedMap = getMapTypeOption(setup.mapType);
  const selectedDifficulty = getDifficultyOption(setup.difficulty);
  const selectedResources =
    DESCENT_STARTING_RESOURCES.find(
      (entry) => entry.id === setup.startingResources,
    ) ?? DESCENT_STARTING_RESOURCES[0];

  const handleLaunch = (): void => {
    onLaunch({
      ...setup,
      seed: parseSeedInput(seedText),
    });
  };

  const handleRandomizeSeed = (): void => {
    const roll = Math.floor(Math.random() * 999_999) + 1;
    setSeedText(String(roll));
  };

  return (
    <main className={styles.screen} data-testid="descent-setup-screen">
      <div aria-hidden="true" className={styles.backdrop} />
      <section aria-label="New game setup" className={styles.panel}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Skirmish Setup</p>
            <h1>Configure Your Descent</h1>
          </div>
          <button className={styles.backButton} onClick={onBack} type="button">
            ← Back to title
          </button>
        </header>

        <div className={styles.columns}>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Map Type</h2>
              <span>{selectedMap.terrainHighlights}</span>
            </div>
            <fieldset aria-label="Map type" className={styles.mapGrid}>
              {ASHEN_GATE_MAP_TYPES.map((option) => {
                const active = setup.mapType === option.id;
                return (
                  <button
                    aria-pressed={active}
                    className={styles.mapCard}
                    data-active={active}
                    key={option.id}
                    onClick={() =>
                      setSetup((current) => ({
                        ...current,
                        mapType: option.id,
                      }))
                    }
                    type="button"
                  >
                    <div className={styles.mapCardHead}>
                      <strong>{option.name}</strong>
                      <span className={styles.badge}>{option.badge}</span>
                    </div>
                    <p>{option.summary}</p>
                    <small>{option.terrainHighlights}</small>
                  </button>
                );
              })}
            </fieldset>
          </div>

          <div className={styles.controlsColumn}>
            <div className={styles.section}>
              <h2>Game Mode</h2>
              <fieldset aria-label="Game mode" className={styles.pillRow}>
                <button
                  aria-pressed={setup.mode === "siege"}
                  className={styles.pill}
                  data-active={setup.mode === "siege"}
                  onClick={() =>
                    setSetup((current) => ({ ...current, mode: "siege" }))
                  }
                  type="button"
                >
                  Timed Siege
                </button>
                <button
                  aria-pressed={setup.mode === "exploration"}
                  className={styles.pill}
                  data-active={setup.mode === "exploration"}
                  onClick={() =>
                    setSetup((current) => ({
                      ...current,
                      mode: "exploration",
                    }))
                  }
                  type="button"
                >
                  Exploration
                </button>
              </fieldset>
              <p className={styles.hint}>
                {setup.mode === "siege"
                  ? "Defend your Hold against escalating waves culminating in Cinderjaw."
                  : "No timed waves — scout guarded camps, claim hilltops, and rescue allies at your own pace."}
              </p>
            </div>

            <div className={styles.section}>
              <h2>Difficulty</h2>
              <fieldset aria-label="Difficulty" className={styles.pillRow}>
                {DESCENT_DIFFICULTIES.map((option) => {
                  const active = setup.difficulty === option.id;
                  return (
                    <button
                      aria-pressed={active}
                      className={styles.pill}
                      data-active={active}
                      disabled={setup.mode === "exploration"}
                      key={option.id}
                      onClick={() =>
                        setSetup((current) => ({
                          ...current,
                          difficulty: option.id,
                        }))
                      }
                      type="button"
                    >
                      {option.name}
                    </button>
                  );
                })}
              </fieldset>
              <p className={styles.hint}>
                {setup.mode === "exploration"
                  ? "Exploration uses fixed camp strengths regardless of difficulty."
                  : selectedDifficulty.summary}
              </p>
            </div>

            <div className={styles.section}>
              <h2>Starting Resources</h2>
              <fieldset
                aria-label="Starting resources"
                className={styles.pillRow}
              >
                {DESCENT_STARTING_RESOURCES.map((option) => {
                  const active = setup.startingResources === option.id;
                  return (
                    <button
                      aria-pressed={active}
                      className={styles.pill}
                      data-active={active}
                      key={option.id}
                      onClick={() =>
                        setSetup((current) => ({
                          ...current,
                          startingResources: option.id,
                        }))
                      }
                      type="button"
                    >
                      {option.name}
                    </button>
                  );
                })}
              </fieldset>
              <p className={styles.hint}>{selectedResources?.summary}</p>
            </div>

            <div className={styles.section}>
              <label className={styles.seedLabel} htmlFor="descent-map-seed">
                Map Seed <span>(optional)</span>
              </label>
              <div className={styles.seedRow}>
                <input
                  className={styles.seedInput}
                  id="descent-map-seed"
                  inputMode="numeric"
                  onChange={(event) => setSeedText(event.target.value)}
                  placeholder="Random"
                  type="text"
                  value={seedText}
                />
                <button
                  className={styles.seedButton}
                  onClick={handleRandomizeSeed}
                  type="button"
                >
                  Roll seed
                </button>
                {seedText.length > 0 ? (
                  <button
                    className={styles.seedButton}
                    onClick={() => setSeedText("")}
                    type="button"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <footer className={styles.footer}>
          <div className={styles.summaryStrip}>
            <strong>{selectedMap.name}</strong>
            <span>·</span>
            <span>
              {setup.mode === "siege"
                ? `${selectedDifficulty.name} Siege`
                : "Exploration"}
            </span>
            <span>·</span>
            <span>{selectedResources?.name} Resources</span>
          </div>
          <button
            className={styles.launchButton}
            onClick={handleLaunch}
            type="button"
          >
            Start match
          </button>
        </footer>
      </section>
    </main>
  );
}
