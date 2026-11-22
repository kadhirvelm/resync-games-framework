import { describe, expect, test } from "bun:test";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { RESOURCE_IDS } from "../../logic/types";
import {
  buildCarriedLoad,
  CARRY_LOAD_HEIGHT,
  type CarriedLoadKind,
  carriedLoadSpec,
  createCarryIconLayer,
} from "../carryIcons";

describe("carried resource loads", () => {
  test("maps wood, stone, gold salvage, and food to distinct silhouettes", () => {
    expect(carriedLoadSpec("wood").kind).toBe("log");
    expect(carriedLoadSpec("stone").kind).toBe("rock");
    expect(carriedLoadSpec("coin").kind).toBe("ore-sack");
    expect(carriedLoadSpec("food").kind).toBe("basket");
  });

  test("uses sensible related loads for the remaining stockpile resources", () => {
    expect(carriedLoadSpec("iron").kind).toBe("ore-sack");
    expect(carriedLoadSpec("essence").kind).toBe("ore-sack");
    expect(carriedLoadSpec("spirit_herbs").kind).toBe("basket");
    expect(carriedLoadSpec("water").kind).toBe("basket");
  });

  test("provides a complete palette and known geometry for every resource", () => {
    const kinds = new Set<CarriedLoadKind>([
      "basket",
      "log",
      "ore-sack",
      "rock",
    ]);
    for (const resource of RESOURCE_IDS) {
      const spec = carriedLoadSpec(resource);
      expect(kinds.has(spec.kind)).toBe(true);
      expect(/^#[0-9a-f]{6}$/.test(spec.primaryColor)).toBe(true);
      expect(/^#[0-9a-f]{6}$/.test(spec.accentColor)).toBe(true);
    }
  });

  test("places loads at hand height instead of over the villager's head", () => {
    expect(CARRY_LOAD_HEIGHT).toBeGreaterThan(0.6);
    expect(CARRY_LOAD_HEIGHT).toBeLessThan(1.3);
  });
});

describe("Babylon carried load meshes", () => {
  test("builds visible resource-specific primitives at hand height", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const cases = [
      { primitive: "bark", resource: "wood" },
      { primitive: "chunk", resource: "stone" },
      { primitive: "sack", resource: "coin" },
      { primitive: "basket", resource: "food" },
    ] as const;
    try {
      for (const { primitive, resource } of cases) {
        const load = buildCarriedLoad(scene, resource, `test-${resource}`);
        const children = load.getChildMeshes();
        expect(load.position.y).toBe(CARRY_LOAD_HEIGHT);
        expect(load.isPickable).toBe(false);
        expect(
          children.some(
            (mesh) => mesh.name.includes(primitive) && !mesh.isPickable,
          ),
        ).toBe(true);
        load.dispose();
        expect(load.isDisposed()).toBe(true);
      }
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  test("syncs optional icons and disposes swapped or removed visuals", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const parent = new TransformNode("test-unit", scene);
    const layer = createCarryIconLayer(scene, { showIcons: true });
    try {
      layer.sync("unit-1", parent, "wood");
      const firstLoad = parent
        .getChildMeshes()
        .find((mesh) => mesh.name === "carry-load-unit-1");
      expect(firstLoad).toBeDefined();
      expect(
        parent
          .getChildMeshes()
          .some((mesh) => mesh.name === "carry-icon-unit-1"),
      ).toBe(true);

      layer.sync("unit-1", parent, "wood");
      expect(
        parent
          .getChildMeshes()
          .find((mesh) => mesh.name === "carry-load-unit-1"),
      ).toBe(firstLoad);
      layer.sync("unit-1", parent, "stone");
      expect(firstLoad?.isDisposed()).toBe(true);
      expect(
        parent
          .getChildMeshes()
          .some((mesh) => mesh.name === "carry-load-unit-1-chunk"),
      ).toBe(true);

      layer.sync("unit-1", parent, null);
      expect(parent.getChildMeshes()).toHaveLength(0);
      layer.sync("unit-1", parent, "food");
      layer.dispose();
      expect(parent.getChildMeshes()).toHaveLength(0);
    } finally {
      layer.dispose();
      scene.dispose();
      engine.dispose();
    }
  });

  test("keeps overhead icons off by default", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const parent = new TransformNode("test-unit", scene);
    const layer = createCarryIconLayer(scene);
    try {
      layer.sync("unit-1", parent, "wood");
      expect(
        parent
          .getChildMeshes()
          .some((mesh) => mesh.name.includes("carry-icon")),
      ).toBe(false);
      expect(
        parent
          .getChildMeshes()
          .some((mesh) => mesh.name.includes("carry-load")),
      ).toBe(true);
    } finally {
      layer.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
});
