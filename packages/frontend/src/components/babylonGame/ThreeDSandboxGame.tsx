"use client";
import type {
  ThreeDAsset,
  ThreeDAssetKind,
  ThreeDPrototype,
  ThreeDSceneInput,
} from "@towers-of-coreborn/api";
import { isServiceError } from "@towers-of-coreborn/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useClientServiceCallers } from "@/services/clientServiceCallers";
import { threeDAssetCaller } from "@/services/threeDService";
import styles from "./babylonGame.module.scss";
import {
  interactWithPrototype,
  movePrototypePlayer,
  nearbyPrototypeInteraction,
  type PrototypeRun,
  parsePrototypeRun,
  startPrototypeRun,
  THREE_D_LAST_WORLD_KEY,
  THREE_D_SAVE_KEY,
} from "./logic/prototypeRun";
import { ModelViewport } from "./ModelViewport";
import { readReducedMotionPreference } from "./reducedMotionPreference";

/** Immediately playable fallback when the workshop has no authored packages. */
export const CURATED_PROTOTYPE: ThreeDPrototype = {
  createdAt: "2026-11-01T00:00:00Z",
  id: "curated-aether-garden",
  name: "Aether Garden",
  objective:
    "Activate the three aether beacons, then return to the origin portal.",
  prompt: "Curated starter",
  slots: [
    {
      id: "arena",
      kind: "environment",
      name: "Garden",
      position: [0, 0, 0],
      prompt: "",
    },
    {
      id: "player",
      kind: "character",
      name: "Wanderer",
      position: [0, 0, 0],
      prompt: "",
    },
    ...[
      ["west", -5, 3],
      ["east", 5, 3],
      ["moon", 0, -5],
    ].map(([id, x, z]) => ({
      id: String(id),
      kind: "prop" as const,
      name: `${id} beacon`,
      ownerSlotId: "player",
      position: [Number(x), 0, Number(z)] as [number, number, number],
      prompt: "",
    })),
  ],
};

/** Loads the current prototype's versioned save without blocking play on storage failure. */
function readRun(prototype: ThreeDPrototype): PrototypeRun {
  try {
    return parsePrototypeRun(
      JSON.parse(
        localStorage.getItem(`${THREE_D_SAVE_KEY}.${prototype.id}`) ?? "null",
      ),
      prototype,
    );
  } catch {
    return startPrototypeRun(prototype.id);
  }
}

/** Turnkey playable prototype launcher and standalone model playground. */
export function ThreeDSandboxGame() {
  const { clientServiceCallers: callers } = useClientServiceCallers();
  const [prototypes, setPrototypes] = useState<ThreeDPrototype[]>([
    CURATED_PROTOTYPE,
  ]);
  const [prototype, setPrototype] =
    useState<ThreeDPrototype>(CURATED_PROTOTYPE);
  const [run, setRun] = useState(() => readRun(CURATED_PROTOTYPE));
  const [model, setModel] = useState<ThreeDAsset>();
  const resumeId = useRef<string | null>(null);
  const [savedResumeId] = useState(() => {
    try {
      return localStorage.getItem(THREE_D_LAST_WORLD_KEY);
    } catch {
      return null;
    }
  });
  resumeId.current = savedResumeId;
  const [notice, setNotice] = useState("");
  const [reducedMotion, setReducedMotion] = useState(
    readReducedMotionPreference,
  );
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    void (async () => {
      const result = await callers.threeDWorkshop.list();
      if (cancelled) return;
      if (isServiceError(result)) {
        setNotice(
          "Workshop unavailable. You can still play the starter garden.",
        );
        return;
      }
      setPrototypes([CURATED_PROTOTYPE, ...result.prototypes]);
      const requested = result.prototypes.find(
        (value) => value.id === (params.get("prototype") ?? resumeId.current),
      );
      if (requested) {
        setPrototype(requested);
        setRun(readRun(requested));
      }
      const assetId = params.get("asset");
      const category = params.get("kind");
      if (
        !assetId ||
        !["prop", "environment", "character"].includes(category ?? "")
      )
        return;
      const list = await threeDAssetCaller(
        callers,
        category as ThreeDAssetKind,
      ).list();
      if (!cancelled && !isServiceError(list))
        setModel(list.assets.find((asset) => asset.id === assetId));
    })().catch(() => {
      if (!cancelled)
        setNotice("Workshop unavailable. The starter garden is ready.");
    });
    return () => {
      cancelled = true;
    };
  }, [callers]);
  useEffect(() => {
    try {
      localStorage.setItem(THREE_D_LAST_WORLD_KEY, prototype.id);
      localStorage.setItem(
        `${THREE_D_SAVE_KEY}.${prototype.id}`,
        JSON.stringify(run),
      );
    } catch {
      /* Play remains available with blocked storage. */
    }
  }, [prototype.id, run]);
  const input = useMemo<ThreeDSceneInput>(
    () => ({
      entities: prototype.slots.map((slot) => ({
        id: slot.id,
        kind: slot.kind,
        model: slot.asset,
        position: slot.position,
      })),
      environmentId: prototype.id,
      player: { cameraMode: "follow", position: [0, 0, 0] },
      reducedMotion,
    }),
    [prototype, reducedMotion],
  );
  const modelInput = useMemo<ThreeDSceneInput | undefined>(
    () =>
      model
        ? {
            entities: [
              { id: model.id, kind: model.kind, model, position: [0, 0, 0] },
            ],
            environmentId: "model-study",
            player: { cameraMode: "orbit", position: [0, 0, 0] },
            reducedMotion,
          }
        : undefined,
    [model, reducedMotion],
  );
  const interact = useCallback(
    () => setRun((current) => interactWithPrototype(current, prototype)),
    [prototype],
  );
  const nearby = nearbyPrototypeInteraction(run, prototype);
  const propCount = prototype.slots.filter(
    (slot) => slot.kind === "prop",
  ).length;
  /** Moves using the same pure rule as keyboard controls. */
  const step = (x: number, z: number) =>
    setRun((current) => movePrototypePlayer(current, x, z, 0.1));
  return (
    <main className={styles.sandbox}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>3D playground</p>
          <h1>{model?.name ?? prototype.name}</h1>
        </div>
        <a className={styles.workshopLink} href="/assets">
          Build in Blueprint Workshop ↗
        </a>
      </header>
      <div className={styles.gameToolbar}>
        <label>
          World{" "}
          <select
            onChange={(event) => {
              const selected = prototypes.find(
                (value) => value.id === event.target.value,
              );
              if (!selected) return;
              setModel(undefined);
              setPrototype(selected);
              setRun(readRun(selected));
            }}
            value={prototype.id}
          >
            {prototypes.map((value) => (
              <option key={value.id} value={value.id}>
                {value.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            checked={reducedMotion}
            onChange={(event) => setReducedMotion(event.target.checked)}
            type="checkbox"
          />{" "}
          Reduced motion
        </label>
        <button
          onClick={() => {
            setRun(startPrototypeRun(prototype.id));
            setPrototype({ ...prototype });
          }}
          type="button"
        >
          Restart world
        </button>
        {model ? (
          <button onClick={() => setModel(undefined)} type="button">
            Back to world
          </button>
        ) : null}
      </div>
      {notice ? <p role="status">{notice}</p> : null}
      <section className={styles.playViewport}>
        {modelInput ? (
          <ModelViewport input={modelInput} />
        ) : (
          <ModelViewport
            input={input}
            onEvent={(event) => {
              if (event.type === "input")
                setRun((current) =>
                  movePrototypePlayer(current, event.x, event.z, 0.05),
                );
              if (event.type === "interaction") interact();
            }}
            state={run}
          />
        )}
      </section>
      {!model ? (
        <section className={styles.gameHud}>
          <div>
            <p className={styles.eyebrow}>
              {run.finished
                ? "World complete"
                : `${run.activated.length} / ${propCount} beacons awakened`}
            </p>
            <h2>
              {run.finished
                ? "The garden is alive again."
                : prototype.objective}
            </h2>
            <p>
              Click the scene, then WASD / arrows to move · E to interact. Your
              position and progress save automatically.
            </p>
            <p aria-live="polite">
              Position: {run.x.toFixed(1)}, {run.z.toFixed(1)} ·{" "}
              {nearby
                ? "Something nearby can be activated."
                : "Find a beacon, then return to 0, 0."}
            </p>
          </div>
          <fieldset
            aria-label="Movement controls"
            className={styles.movementControls}
          >
            <button
              aria-label="Move north"
              onClick={() => step(0, -1)}
              type="button"
            >
              ↑ North
            </button>
            <button
              aria-label="Move west"
              onClick={() => step(-1, 0)}
              type="button"
            >
              ← West
            </button>
            <button
              aria-label="Move east"
              onClick={() => step(1, 0)}
              type="button"
            >
              East →
            </button>
            <button
              aria-label="Move south"
              onClick={() => step(0, 1)}
              type="button"
            >
              ↓ South
            </button>
            <button
              disabled={!nearby || run.finished}
              onClick={interact}
              type="button"
            >
              {nearby === "portal" ? "Complete world" : "Activate nearby"}
            </button>
          </fieldset>
        </section>
      ) : null}
    </main>
  );
}
