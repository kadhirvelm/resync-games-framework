/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createUnitRecord } from "../../logic/economy/records";
import type { TutorialTargetHint } from "../../logic/tutorial";
import type { SimSnapshot } from "../../logic/types";
import { createAshenGatePreview } from "../preview";
import { TutorialGuide } from "../TutorialGuide";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement;

/** Mounts or updates the guide with a snapshot and records focus requests. */
async function renderGuide(
  snapshot: SimSnapshot,
  focus: TutorialTargetHint[] = [],
) {
  if (!root) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }
  await act(async () => {
    root?.render(
      <TutorialGuide
        onFocusTarget={(hint) => focus.push(hint)}
        snapshot={snapshot}
        waveHeld={true}
      />,
    );
  });
}

/** Clicks a guide button by visible label, failing if the action is missing. */
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find((entry) =>
    entry.textContent?.includes(label),
  );
  if (!button) throw new Error(`Missing guide action: ${label}`);
  await act(async () => button.click());
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
});

describe("Descent beginner guide", () => {
  test("shows numbered actions, honest wave protection, and an optional roadmap", async () => {
    const focus: TutorialTargetHint[] = [];
    await renderGuide(createAshenGatePreview(), focus);
    const objective = container.querySelector(
      '[aria-label="Current tutorial objective"]',
    );
    expect(objective?.querySelectorAll("ol li").length).toBe(3);
    expect(objective?.textContent).toContain("Right-click a nearby Tree");
    expect(container.textContent).toContain(
      "Finish the preparation objective to release it",
    );
    const roadmap = [...container.querySelectorAll("details")].find((entry) =>
      entry.textContent?.includes("All objectives"),
    );
    expect(roadmap?.open).toBe(false);
    expect(container.textContent).toContain("Left-click selects");
    await click("Select Idle Villager");
    expect(focus).toEqual(["idle_villagers"]);
  });

  test("advances to the next objective and lets players return from inspecting a later lesson", async () => {
    const snapshot = createAshenGatePreview();
    await renderGuide(snapshot);
    // Inspecting the active lesson must not pin it after completion.
    await click("Put Villagers to Work");
    const units = ["v1", "v2"].map((id) => {
      const unit = createUnitRecord({ classId: "villager", id, x: 5, y: 5 });
      unit.task = { gatherTicksLeft: 10, kind: "gather", nodeId: "tree" };
      return unit;
    });
    await renderGuide({ ...snapshot, units });
    expect(container.querySelector("h3")?.textContent).toBe("Build a Barracks");
    await click("Slay Cinderjaw");
    expect(container.querySelector("h3")?.textContent).toBe("Slay Cinderjaw");
    await click("Back to current objective");
    expect(container.querySelector("h3")?.textContent).toBe("Build a Barracks");
    await click("Hide");
    expect(container.querySelector("h3")).toBeNull();
    await click("Show");
    expect(container.querySelector("h3")?.textContent).toBe("Build a Barracks");
  });
});
