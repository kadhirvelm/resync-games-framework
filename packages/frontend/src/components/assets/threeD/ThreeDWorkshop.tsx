"use client";
import {
  isServiceError,
  type ThreeDAsset,
  type ThreeDAssetKind,
  type ThreeDJob,
  type ThreeDPrototype,
  type ThreeDProvider,
} from "@resync-game-framework/api";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useClientServiceCallers } from "@/services/clientServiceCallers";
import { readGlbUpload, threeDAssetCaller } from "@/services/threeDService";
import { readReducedMotionPreference } from "../../babylonGame/reducedMotionPreference";
import { ThreeDModal } from "./ThreeDModal";
import styles from "./threeDWorkshop.module.scss";

const ModelViewport = dynamic(
  () =>
    import("../../babylonGame/ModelViewport").then(
      (module) => module.ModelViewport,
    ),
  { ssr: false },
);
const kinds: ThreeDAssetKind[] = ["prop", "environment", "character"];
const examples = [
  "A moonlit jade garden with a wandering clockwork gardener and three glowing seed shrines",
  "A desert observatory with a brass explorer and ancient star beacons",
  "A cozy mushroom grove with a tiny forest guardian and crystal lanterns",
];

/** Complete authoring surface for 3D prototype packages and standalone assets. */
export function ThreeDWorkshop({
  initialKind,
}: {
  initialKind?: ThreeDAssetKind;
}) {
  const { clientServiceCallers: callers } = useClientServiceCallers();
  const [kind, setKind] = useState<ThreeDAssetKind>(initialKind ?? "prop");
  const [provider, setProvider] = useState<ThreeDProvider>("design");
  const [prompt, setPrompt] = useState(examples[0] ?? "");
  const [name, setName] = useState("");
  const [useLore, setUseLore] = useState(false);
  const [assets, setAssets] = useState<ThreeDAsset[]>([]);
  const [prototypes, setPrototypes] = useState<ThreeDPrototype[]>([]);
  const [jobs, setJobs] = useState<ThreeDJob[]>([]);
  const [meshyConfigured, setMeshyConfigured] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [planningId, setPlanningId] = useState<string>();
  const [selectedId, setSelectedId] = useState("");
  const [preview, setPreview] = useState<ThreeDAsset>();
  const [edit, setEdit] = useState<ThreeDAsset>();
  const [designText, setDesignText] = useState("");
  const mounted = useRef(true);
  const selected =
    prototypes.find((prototype) => prototype.id === selectedId) ??
    prototypes[0];
  const running = jobs.filter((job) => job.state === "running");

  /** Refreshes all category assets, packages and server-persisted job progress. */
  const refresh = useCallback(async () => {
    const [workshop, ...lists] = await Promise.all([
      callers.threeDWorkshop.list(),
      ...kinds.map((category) => threeDAssetCaller(callers, category).list()),
    ]);
    if (!mounted.current) return;
    if (isServiceError(workshop)) throw new Error(workshop.message);
    setPrototypes(workshop.prototypes);
    setJobs(workshop.jobs);
    const collected: ThreeDAsset[] = [];
    for (const list of lists) {
      if (isServiceError(list)) throw new Error(list.message);
      if ("assets" in list) {
        collected.push(...list.assets);
        setMeshyConfigured(list.meshyConfigured);
      }
    }
    setAssets(collected);
  }, [callers]);
  useEffect(() => {
    mounted.current = true;
    void refresh().catch((cause) => setError(String(cause)));
    const timer = setInterval(() => {
      void refresh().catch((cause) => setError(String(cause)));
    }, 3000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  /** Displays service failures beside the relevant authoring controls. */
  const perform = async (label: string, operation: () => Promise<void>) => {
    setBusy(label);
    setError("");
    try {
      await operation();
      await refresh();
    } catch (cause) {
      if (mounted.current)
        setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (mounted.current) {
        setBusy("");
        setPlanningId(undefined);
      }
    }
  };

  /** Starts one background model task and leaves progress with the backend. */
  const generate = async (
    category: ThreeDAssetKind,
    brief: string,
    prototype?: ThreeDPrototype,
    slotId?: string,
    chosenProvider = provider,
    design?: ThreeDAsset["design"],
  ) => {
    const result = await callers.threeDWorkshop.start({
      design,
      generationId: crypto.randomUUID(),
      kind: category,
      prompt: brief,
      prototypeId: prototype?.id,
      provider: chosenProvider,
      slotId,
      useLore,
    });
    if (isServiceError(result)) throw new Error(result.message);
    setJobs((current) => [result, ...current]);
    return result.generationId;
  };

  /** Builds missing slots sequentially to keep cost and resource use predictable. */
  const buildPackage = async (
    prototype: ThreeDPrototype,
    route: ThreeDProvider,
  ) => {
    for (const slot of prototype.slots) {
      if (!mounted.current) return;
      if (slot.asset) continue;
      const id = await generate(
        slot.kind,
        slot.prompt,
        prototype,
        slot.id,
        slot.kind === "character" && route === "meshy" ? "design" : route,
      );
      let complete = false;
      while (mounted.current && !complete) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const result = await callers.threeDWorkshop.list();
        if (isServiceError(result)) throw new Error(result.message);
        const job = result.jobs.find((entry) => entry.generationId === id);
        if (job?.state === "failed" || job?.state === "cancelled")
          throw new Error(job.error ?? "Build stopped.");
        complete = job?.state === "complete";
        await refresh();
      }
    }
  };

  /** Creates a package brief, optionally with all curated sample assets. */
  const createPackage = async (demo = false) => {
    const generationId = crypto.randomUUID();
    setPlanningId(generationId);
    const result = await callers.threeDWorkshop.create({
      demo,
      generationId,
      name,
      prompt,
    });
    setPlanningId(undefined);
    if (isServiceError(result)) throw new Error(result.message);
    setSelectedId(result.id);
    setPrototypes((current) => [result, ...current]);
    if (demo) await buildPackage(result, "demo");
  };
  const previewInput = useMemo(
    () =>
      preview
        ? {
            entities: [
              {
                id: preview.id,
                kind: preview.kind,
                model: preview,
                position: [0, 0, 0] as [number, number, number],
              },
            ],
            environmentId: "preview",
            player: {
              cameraMode: "orbit" as const,
              position: [0, 0, 0] as [number, number, number],
            },
            reducedMotion: readReducedMotionPreference(),
          }
        : undefined,
    [preview],
  );

  return (
    <main className={styles.studio}>
      <div className={styles.layout}>
        <section className={styles.panel}>
          <div className={styles.heading}>
            <h2>What are we building?</h2>
            <a href="/?experience=three-d-sandbox">Playground ↗</a>
          </div>
          <label>
            Project or asset name
            <input
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              placeholder="The moonlit garden"
              value={name}
            />
          </label>
          <label>
            Creative brief
            <textarea
              maxLength={4000}
              onChange={(event) => setPrompt(event.target.value)}
              rows={5}
              value={prompt}
            />
          </label>
          <div className={styles.chips}>
            {examples.map((example, index) => (
              <button
                key={example}
                onClick={() => setPrompt(example)}
                type="button"
              >
                Idea {index + 1}
              </button>
            ))}
          </div>
          <label>
            Generation route
            <select
              onChange={(event) =>
                setProvider(event.target.value as ThreeDProvider)
              }
              value={provider}
            >
              <option value="design">Low-poly AI · existing model setup</option>
              <option value="demo">Curated demo · no model calls</option>
              <option disabled={!meshyConfigured} value="meshy">
                Meshy · detailed models{" "}
                {meshyConfigured ? "" : "(needs backend key)"}
              </option>
            </select>
          </label>
          <p className={styles.hint}>
            {provider === "meshy"
              ? "Uses prepaid Meshy credits: approximately 30 per textured model. In-progress provider jobs may remain billable after Stop. Characters use Low-poly AI. Review current Meshy pricing and your account terms."
              : "Low-poly AI designs editable geometric models. Characters include a simple six-joint rig and five clips. Demo uses curated designs without model calls."}{" "}
            {!meshyConfigured
              ? "For detailed props, set MESHY_API_KEY on the backend and restart it."
              : ""}
          </p>
          <label className={styles.checkbox}>
            <input
              checked={useLore}
              onChange={(event) => setUseLore(event.target.checked)}
              type="checkbox"
            />{" "}
            Ground AI model designs in ProductNow lore
          </label>
          <div className={styles.actions}>
            <button
              className={styles.primary}
              disabled={Boolean(busy) || !prompt.trim()}
              onClick={() =>
                void perform("Planning world…", () => createPackage())
              }
              type="button"
            >
              Plan a 3D world
            </button>
            <button
              disabled={Boolean(busy)}
              onClick={() =>
                void perform("Building demo world…", () => createPackage(true))
              }
              type="button"
            >
              Try a complete demo
            </button>
          </div>
          <hr />
          <h3>Or make one asset</h3>
          <label>
            Asset type
            <select
              onChange={(event) =>
                setKind(event.target.value as ThreeDAssetKind)
              }
              value={kind}
            >
              {kinds.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <button
            className={styles.primary}
            disabled={
              Boolean(busy) ||
              !prompt.trim() ||
              running.length >= 2 ||
              (kind === "character" && provider === "meshy")
            }
            onClick={() =>
              void perform("Starting generation…", async () => {
                await generate(kind, prompt);
              })
            }
            type="button"
          >
            Generate {kind}
          </button>
          <label className={styles.upload}>
            Import a .glb
            <input
              accept=".glb"
              disabled={Boolean(busy)}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void perform("Validating GLB…", async () => {
                  const result = await threeDAssetCaller(callers, kind).ingest({
                    fileName: file.name,
                    glbBase64: await readGlbUpload(file),
                    name: name || file.name.replace(/\.glb$/i, ""),
                  });
                  if (isServiceError(result)) throw new Error(result.message);
                  setPreview(result);
                });
                event.target.value = "";
              }}
              type="file"
            />
          </label>
          <p className={styles.hint}>
            Up to 20 MiB. Embedded PNG/JPEG textures, core glTF 2.0 only.
            Characters need a skin and idle, walk, attack, hit, death clips.
          </p>
          {busy ? (
            <p aria-live="polite" role="status">
              {busy}
            </p>
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          {planningId ? (
            <button
              onClick={() =>
                void callers.threeDWorkshop.cancel({ generationId: planningId })
              }
              type="button"
            >
              Stop planning
            </button>
          ) : null}
        </section>
        <section className={styles.workspace}>
          <div className={styles.panel}>
            <div className={styles.heading}>
              <h2>Your 3D worlds</h2>
              <select
                aria-label="Select prototype"
                onChange={(event) => setSelectedId(event.target.value)}
                value={selected?.id ?? ""}
              >
                <option disabled={true} value="">
                  Choose a world
                </option>
                {prototypes.map((prototype) => (
                  <option key={prototype.id} value={prototype.id}>
                    {prototype.name}
                  </option>
                ))}
              </select>
            </div>
            {selected ? (
              <>
                <p>{selected.objective}</p>
                <div className={styles.actions}>
                  <button
                    className={styles.primary}
                    disabled={
                      Boolean(busy) ||
                      running.some((job) => job.prototypeId === selected.id)
                    }
                    onClick={() =>
                      void perform("Building missing slots…", () =>
                        buildPackage(selected, provider),
                      )
                    }
                    type="button"
                  >
                    Build missing assets
                  </button>
                  <a
                    href={`/?experience=three-d-sandbox&prototype=${selected.id}`}
                  >
                    Play this world ↗
                  </a>
                  <button
                    onClick={() => {
                      const link = document.createElement("a");
                      const url = URL.createObjectURL(
                        new Blob([JSON.stringify(selected, null, 2)], {
                          type: "application/json",
                        }),
                      );
                      link.href = url;
                      link.download = `${selected.id}.json`;
                      link.click();
                      URL.revokeObjectURL(url);
                    }}
                    type="button"
                  >
                    Export package
                  </button>
                </div>
                <div className={styles.slots}>
                  {selected.slots.map((slot) => {
                    const job = running.find(
                      (entry) =>
                        entry.prototypeId === selected.id &&
                        entry.slotId === slot.id,
                    );
                    return (
                      <article className={styles.slot} key={slot.id}>
                        <div className={styles.heading}>
                          <strong>{slot.name}</strong>
                          <span>{slot.kind}</span>
                        </div>
                        <p>{slot.prompt}</p>
                        {slot.asset ? (
                          <button
                            className={styles.thumbnailButton}
                            onClick={() => setPreview(slot.asset)}
                            type="button"
                          >
                            <Image
                              alt={slot.asset.name}
                              height={320}
                              src={slot.asset.thumbnailUrl}
                              unoptimized={true}
                              width={320}
                            />
                          </button>
                        ) : (
                          <div className={styles.emptyPreview}>
                            {job
                              ? `${job.stage} · ${Math.round(job.progress)}%`
                              : "Ready for your model"}
                          </div>
                        )}
                        <div className={styles.actions}>
                          <button
                            className={styles.primary}
                            disabled={
                              Boolean(busy) ||
                              Boolean(job) ||
                              running.length >= 2
                            }
                            onClick={() =>
                              void perform("Starting slot…", async () => {
                                await generate(
                                  slot.kind,
                                  slot.prompt,
                                  selected,
                                  slot.id,
                                  slot.kind === "character" &&
                                    provider === "meshy"
                                    ? "design"
                                    : provider,
                                );
                              })
                            }
                            type="button"
                          >
                            {slot.asset ? "Regenerate" : "Generate"}
                          </button>
                          <select
                            aria-label={`Attach existing ${slot.kind} to ${slot.name}`}
                            onChange={(event) => {
                              const assetId = event.target.value;
                              if (!assetId) return;
                              void perform("Attaching model…", async () => {
                                const result =
                                  await callers.threeDWorkshop.attach({
                                    assetId,
                                    prototypeId: selected.id,
                                    slotId: slot.id,
                                  });
                                if (isServiceError(result))
                                  throw new Error(result.message);
                              });
                            }}
                            value={slot.assetId ?? ""}
                          >
                            <option value="">Use existing…</option>
                            {assets
                              .filter((asset) => asset.kind === slot.kind)
                              .map((asset) => (
                                <option key={asset.id} value={asset.id}>
                                  {asset.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className={styles.emptyPreview}>
                Start with a creative brief or try the complete demo. Your world
                will appear here.
              </div>
            )}
          </div>
          {jobs.length ? (
            <section className={styles.panel}>
              <h2>Generation desk</h2>
              {jobs.slice(0, 8).map((job) => (
                <div className={styles.job} key={job.generationId}>
                  <div>
                    <strong>
                      {job.kind} · {job.provider}
                    </strong>
                    <p>
                      {job.stage}
                      {job.error ? ` · ${job.error}` : ""}
                    </p>
                    <progress max={100} value={job.progress} />
                  </div>
                  {job.state === "running" ? (
                    <button
                      onClick={() =>
                        void perform("Stopping…", async () => {
                          const result = await callers.threeDWorkshop.cancel({
                            generationId: job.generationId,
                          });
                          if (isServiceError(result))
                            throw new Error(result.message);
                        })
                      }
                      type="button"
                    >
                      Stop
                    </button>
                  ) : null}
                  {job.asset ? (
                    <button onClick={() => setPreview(job.asset)} type="button">
                      Inspect
                    </button>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}
          <section className={styles.panel}>
            <div className={styles.heading}>
              <h2>Model library</h2>
              <span>{assets.length} assets</span>
            </div>
            <div className={styles.library}>
              {assets
                .filter((asset) => asset.kind === kind)
                .map((asset) => (
                  <article className={styles.asset} key={asset.id}>
                    <button
                      className={styles.thumbnailButton}
                      onClick={() => setPreview(asset)}
                      type="button"
                    >
                      <Image
                        alt={`Inspect ${asset.name}`}
                        height={320}
                        loading="lazy"
                        src={asset.thumbnailUrl}
                        unoptimized={true}
                        width={320}
                      />
                    </button>
                    <h3>{asset.name}</h3>
                    <p>
                      {Math.round(asset.validation.triangles).toLocaleString()}{" "}
                      triangles · {(asset.validation.bytes / 1024).toFixed(0)}{" "}
                      KiB
                    </p>
                    <span>✓ Validated · {asset.provenance.provider}</span>
                    <div className={styles.actions}>
                      <a href={asset.url} rel="noreferrer" target="_blank">
                        GLB ↗
                      </a>
                      <a
                        href={`/?experience=three-d-sandbox&asset=${asset.id}&kind=${asset.kind}`}
                      >
                        Try in playground
                      </a>
                      {asset.design ? (
                        <button
                          onClick={() => {
                            setEdit(asset);
                            setDesignText(
                              JSON.stringify(asset.design, null, 2),
                            );
                          }}
                          type="button"
                        >
                          Edit design
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
            </div>
          </section>
        </section>
      </div>
      {preview && previewInput ? (
        <ThreeDModal onClose={() => setPreview(undefined)} title={preview.name}>
          <div className={styles.previewScene}>
            <ModelViewport input={previewInput} />
          </div>
          <p>
            {preview.validation.triangles.toLocaleString()} triangles ·{" "}
            {preview.validation.meshes} meshes · {preview.validation.materials}{" "}
            materials · {preview.validation.textures} textures ·{" "}
            {preview.validation.skins} skins
          </p>
          <p>
            Clips:{" "}
            {preview.validation.animations
              .map((clip) => `${clip.name} (${clip.duration.toFixed(1)}s)`)
              .join(", ") || "Static model"}
          </p>
          {preview.validation.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          <a href={preview.url} rel="noreferrer" target="_blank">
            Download source GLB ↗
          </a>
        </ThreeDModal>
      ) : null}
      {edit ? (
        <ThreeDModal
          onClose={() => setEdit(undefined)}
          title={`Edit ${edit.name}`}
        >
          <p>
            Change part colors, positions and dimensions. Rebuild creates a new
            validated asset.
          </p>
          <textarea
            aria-label="Structured model design"
            className={styles.designEditor}
            onChange={(event) => setDesignText(event.target.value)}
            value={designText}
          />
          <div className={styles.actions}>
            <button
              disabled={Boolean(busy)}
              onClick={() =>
                void perform("Rebuilding design…", async () => {
                  await generate(
                    edit.kind,
                    edit.prompt,
                    undefined,
                    undefined,
                    "design",
                    JSON.parse(designText),
                  );
                  setEdit(undefined);
                })
              }
              type="button"
            >
              Rebuild GLB
            </button>
            <button onClick={() => setEdit(undefined)} type="button">
              Close editor
            </button>
          </div>
          {error ? <p role="alert">{error}</p> : null}
        </ThreeDModal>
      ) : null}
    </main>
  );
}
