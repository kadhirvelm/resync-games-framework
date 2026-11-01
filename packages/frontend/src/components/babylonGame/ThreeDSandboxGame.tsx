"use client";

import { BabylonGameCanvas } from "./BabylonGameCanvas";
import styles from "./babylonGame.module.scss";

/**
 * First isolated 3D experience: an orbitable Babylon scene and runtime notes.
 * @returns The 3D sandbox shell and its lazily loaded Babylon canvas
 */
export const ThreeDSandboxGame = () => (
  <main className={styles.sandbox}>
    <div aria-hidden="true" className={styles.ambientGlow} />
    <header className={styles.header}>
      <div>
        <p className={styles.eyebrow}>Prototype · Babylon.js</p>
        <h1>Aether Vault</h1>
      </div>
      <p>
        A separate 3D runtime for future GLB environments, characters, and
        props. Drag to orbit the shrine and scroll to change distance.
      </p>
    </header>

    <section aria-label="3D scene" className={styles.viewport}>
      <BabylonGameCanvas />
      <div className={styles.sceneLabel}>
        <span>Scene 001</span>
        <strong>Low-poly shrine study</strong>
      </div>
    </section>

    <dl className={styles.runtimeDetails}>
      <div>
        <dt>Renderer</dt>
        <dd>Babylon.js</dd>
      </div>
      <div>
        <dt>Interchange</dt>
        <dd>GLB ready</dd>
      </div>
      <div>
        <dt>Input</dt>
        <dd>Orbit + zoom</dd>
      </div>
      <div>
        <dt>Asset</dt>
        <dd>Bundled primitive</dd>
      </div>
    </dl>
  </main>
);
