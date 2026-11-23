/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  ASHEN_GATE_SLICE_MODULE_ID,
  type AshenGateSliceState,
  createAshenGateSim,
} from "../../logic/ashenGateSlice";
import { createBuildingRecord, ensureEconomyMeta } from "../../logic/economy";
import type { DescentSim } from "../../logic/sim/descentSim";
import type { SimWorldState } from "../../logic/sim/world";
import type {
  Command,
  RankTitle,
  SchoolId,
  SimSnapshot,
} from "../../logic/types";
import { DescentView } from "../DescentView";
import { readPresentation } from "../presentation";
import { schoolChoiceSummary } from "../schoolGuidance";
import { buildShellModel, type ShellUnit } from "../shellModel";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface Mounted {
  commands: Command[];
  container: HTMLDivElement;
  root: Root;
}

let mounted: Mounted | undefined;

/** Creates a live snapshot with a Captain at the requested rank and school. */
function captainSnapshot(options: {
  injurySeconds?: number;
  onVein?: boolean;
  rank: RankTitle;
  school?: SchoolId;
}): DescentSim {
  const sim = createAshenGateSim({ seed: 7, waterways: false });
  const saved = JSON.parse(sim.serialize()) as { state: SimWorldState };
  const slice = saved.state.meta[
    ASHEN_GATE_SLICE_MODULE_ID
  ] as AshenGateSliceState;
  const record = slice.cultivation.units.find(
    (unit) => unit.unitId === "ashen-captain",
  );
  if (record === undefined) throw new Error("Missing Captain cultivation");
  record.rank = options.rank;
  record.school = options.school;
  if (options.injurySeconds !== undefined) {
    slice.injuries["ashen-captain"] = options.injurySeconds;
  }
  if (options.onVein === true) {
    const vein = ensureEconomyMeta(saved.state).veins[0];
    const captain = saved.state.units.find(
      (unit) => unit.id === "ashen-captain",
    );
    if (vein === undefined || captain === undefined) {
      throw new Error("Missing Spirit Vein or Captain");
    }
    captain.x = vein.x;
    captain.y = vein.y;
  }
  sim.load(JSON.stringify(saved));
  return sim;
}

/** Mounts the real HUD for one snapshot and captures commands. */
async function mount(snapshot: SimSnapshot): Promise<Mounted> {
  const commands: Command[] = [];
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <DescentView
        onCommand={(command) => commands.push(command)}
        snapshot={snapshot}
      />,
    );
  });
  mounted = { commands, container, root };
  return mounted;
}

/** Finds a button by its visible label. */
function buttonNamed(scope: ParentNode, label: string): HTMLButtonElement {
  const button = [...scope.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Missing button: ${label}`);
  }
  return button;
}

/** Finds a unit token by its stable simulation id. */
function unitButton(scope: ParentNode, unitId: string): HTMLElement {
  const element = scope.querySelector(`[data-unit-id="${unitId}"]`);
  if (!(element instanceof HTMLElement))
    throw new Error(`Missing unit ${unitId}`);
  return element;
}

/** Clicks a button inside one React act. */
async function click(button: HTMLElement): Promise<void> {
  await act(async () => button.click());
}

afterEach(async () => {
  if (mounted === undefined) return;
  const current = mounted;
  mounted = undefined;
  await act(async () => current.root.unmount());
  current.container.remove();
});

describe("live cultivation presentation", () => {
  test("names the Captain and treats Sworn as the Ashen Gate cap", async () => {
    const sim = captainSnapshot({ rank: "Sworn", school: "ember" });
    const shell = buildShellModel(sim.snapshot());
    const captain = shell.units.find((unit) => unit.id === "ashen-captain");
    expect(captain?.captain).toBe(true);
    expect(captain?.cultivation?.rankCapReached).toBe(true);
    expect(captain?.cultivation?.nextRank).toBeUndefined();
    expect(captain?.cultivation?.meritToNext).toBe(0);

    const { container } = await mount(sim.snapshot());
    await click(unitButton(container, "ashen-captain"));
    const panel = container.querySelector('[aria-label="Unit panel"]');
    expect(panel?.textContent).toContain("Captain · Sword Cultivator");
    expect(panel?.textContent).toContain("Sworn · Ashen Gate rank cap reached");
    expect(panel?.textContent).not.toContain("Veteran");
    expect(panel?.querySelector('[title="Breakthrough chance"]')).toBeNull();
  });

  test("labels Personal Essence separately while a soldier advances", async () => {
    const sim = captainSnapshot({ rank: "Ashborn" });
    const { container } = await mount(sim.snapshot());
    await click(unitButton(container, "ashen-captain"));
    expect(container.textContent).toContain("Personal Essence");
  });

  test("keeps the school choice after the cap and shows its exact modifier and art", async () => {
    const sim = captainSnapshot({ rank: "Sworn" });
    const { commands, container } = await mount(sim.snapshot());
    await click(unitButton(container, "ashen-captain"));
    expect(container.textContent).toContain(
      "Choose a school to finish this promotion",
    );
    await click(buttonNamed(container, "Ember"));
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("+25% school effect in Ashen Gate");
    expect(dialog?.textContent).toContain("Blazing Lotus");
    expect(dialog?.textContent).toContain("permanent for this run");
    expect(dialog?.textContent).not.toContain("Chance");
    await click(buttonNamed(dialog as HTMLElement, "Lock Ember"));
    expect(commands).toEqual([
      { school: "ember", type: "choose_school", unitId: "ashen-captain" },
    ]);
  });

  test("brews and feeds only pills with implemented live effects", () => {
    const sim = captainSnapshot({ rank: "Ashborn" });
    const saved = JSON.parse(sim.serialize()) as { state: SimWorldState };
    saved.state.buildings.push(
      createBuildingRecord({
        buildingType: "alchemy_furnace",
        completed: true,
        id: "test-furnace",
        x: 10,
        y: 10,
      }),
    );
    const economy = ensureEconomyMeta(saved.state);
    economy.items = {
      battle_pill: 1,
      body_pill: 1,
      breakthrough_pill: 1,
      spirit_pill: 1,
    };
    sim.load(JSON.stringify(saved));
    const presentation = readPresentation(sim.snapshot().meta);
    const recipeIds = presentation.brewOptions.map((option) => option.pillId);
    expect(recipeIds).not.toContain("battle_pill");
    expect(recipeIds).not.toContain("breakthrough_pill");
    expect(recipeIds).not.toContain("spirit_pill");
    expect(recipeIds).toContain("body_pill");
    expect(recipeIds).toContain("wind_pill");
    expect(recipeIds).toContain("ember_dao_pill");
    expect(
      presentation.brewOptions.find((option) => option.pillId === "body_pill")
        ?.effectLabel,
    ).toBe("+10% maximum health");
    expect(
      presentation.pillFeeds.every(
        (feed) =>
          feed.preview.pillId !== "battle_pill" &&
          feed.preview.pillId !== "breakthrough_pill" &&
          feed.preview.pillId !== "spirit_pill",
      ),
    ).toBe(true);
  });

  test("publishes injury time and Spirit Vein meditation bonuses", async () => {
    const injured = captainSnapshot({
      injurySeconds: 23,
      onVein: true,
      rank: "Ashborn",
    });
    const injuredCaptain = buildShellModel(injured.snapshot()).units.find(
      (unit) => unit.id === "ashen-captain",
    );
    expect(injuredCaptain?.injurySeconds).toBe(23);
    expect(injuredCaptain?.sacredGround).toBe("vein");
    const injuredView = await mount(injured.snapshot());
    await click(unitButton(injuredView.container, "ashen-captain"));
    expect(injuredView.container.textContent).toContain(
      "Breakthrough injury · 23s recovery",
    );
    await act(async () => injuredView.root.unmount());
    injuredView.container.remove();
    mounted = undefined;

    const meditating = captainSnapshot({ onVein: true, rank: "Ashborn" });
    meditating.enqueue({ type: "toggle_meditate", unitIds: ["ashen-captain"] });
    meditating.step(1);
    const view = await mount(meditating.snapshot());
    await click(unitButton(view.container, "ashen-captain"));
    expect(view.container.textContent).toContain(
      "In Seclusion · Sacred ground 2.5×",
    );
  });

  test("school copy never gives ordinary soldiers Qi arts or mixes Qi classes", () => {
    const sim = captainSnapshot({ rank: "Sworn" });
    const units = buildShellModel(sim.snapshot()).units;
    const rider = units.find((unit) => unit.id === "ashen-rider");
    const captain = units.find((unit) => unit.id === "ashen-captain");
    if (rider === undefined || captain === undefined) {
      throw new Error("Missing starting army");
    }
    expect(schoolChoiceSummary(rider, "blood")).toContain("lifesteal");
    expect(schoolChoiceSummary(rider, "blood")).not.toContain("Crimson");
    const formation: ShellUnit = { ...captain, classId: "formation_master" };
    expect(schoolChoiceSummary(formation, "rime")).toContain("Glacial Sanctum");
    expect(schoolChoiceSummary(formation, "rime")).not.toContain("Solar Sword");
  });
});
